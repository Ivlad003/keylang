// `keylang web` through the real CLI: the page and the bundled xterm.js, the
// access token and origin checks, and the same TUI over a WebSocket — resize,
// mouse, paste and Unicode, reconnecting to the same session, and the scenario
// "open a flow → hover a step → go to the code" giving the same screen as in a
// terminal.

import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import xterm from "@xterm/headless";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { App } from "../src/tui/app.ts";
import { runOperation } from "../src/operations.ts";
import type { OperationRunner } from "../src/tui/app.ts";
import { serveWeb } from "../src/tui/web.ts";
import { checkoutRepo, CHECKOUT_FILES, click, KEY, locate, mouseMove } from "./tui-fixture.ts";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";
import { CYCLE_AUTHOR_CODE, CYCLE_FILES, refundCycle, type CycleStage } from "./cycle-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

async function waitFor(check: () => boolean, what: string, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

async function startWeb(t: { after: (f: () => void | Promise<void>) => void }, cwd: string, env: Record<string, string> = {}): Promise<{ url: URL; child: ChildProcessWithoutNullStreams }> {
  const child = spawn(process.execPath, [bin, "web", "--port", "0"], { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...env } });
  t.after(async () => {
    if (child.exitCode === null) {
      // SIGTERM stops at once; SIGINT would wait for a second one over unsaved buffers.
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }
  });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  await waitFor(() => /keylang web: (\S+)/.test(out), "the URL");
  return { url: new URL(/keylang web: (\S+)/.exec(out)![1]!), child };
}

/** The token of a printed URL: it is in the fragment, which a browser never sends. */
function tokenOf(url: URL): string {
  return new URLSearchParams(url.hash.slice(1)).get("t") ?? "";
}

class Client {
  readonly vt: VirtualTerminal;
  private readonly socket: WebSocket;
  readonly opened: Promise<void>;
  closed = false;
  closeCode: number | null = null;
  /** Every frame received, as sent. */
  readonly raw: string[] = [];
  readonly controls: { type: string; on?: boolean }[] = [];
  onControl: ((message: { type: string; on?: boolean }) => void) | null = null;

  constructor(url: URL, session: string, cols: number, rows: number) {
    this.vt = new VirtualTerminal(cols, rows);
    this.socket = new WebSocket(`ws://${url.host}/ws`, ["keylang", `keylang.t.${tokenOf(url)}`]);
    this.socket.onmessage = (event) => {
      const text = String(event.data);
      // A NUL-prefixed frame is a control message for the page (the microphone), not ANSI.
      if (text.charCodeAt(0) === 0) {
        const message = JSON.parse(text.slice(1)) as { type: string; on?: boolean };
        this.controls.push(message);
        this.onControl?.(message);
        return;
      }
      this.raw.push(text);
      this.vt.feed(text);
    };
    this.socket.onclose = (event) => {
      this.closed = true;
      this.closeCode = event.code;
    };
    this.opened = new Promise((done) => {
      this.socket.onopen = () => {
        this.send({ type: "hello", session, cols, rows });
        done();
      };
    });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  input(data: string): void {
    this.send({ type: "input", data });
  }

  close(): void {
    this.socket.close();
  }
}

function status(url: URL, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; type: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, headers }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, type: String(res.headers["content-type"] ?? ""), headers: res.headers }));
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, body: "", type: "", headers: res.headers });
    });
    req.on("error", reject);
    req.end();
  });
}

test("web: the socket needs the token, which never leaves the fragment; xterm.js from the package, never a CDN", async (t) => {
  const repo = checkoutRepo(t);
  const { url } = await startWeb(t, repo);
  assert.equal(url.hostname, "localhost");
  assert.equal(url.search, "", "no token in the query: it would reach the server log and the history");
  const token = tokenOf(url);
  assert.match(token, /^[0-9a-f]{32}$/);
  // The page is static: it carries neither the token nor a cookie.
  const page = await status(url, "/");
  assert.equal(page.status, 200);
  assert.equal(page.headers["set-cookie"], undefined);
  assert.match(page.body, /<script src="\/assets\/xterm\.js"><\/script>/);
  assert.doesNotMatch(page.body, /(src|href)="https?:/);
  assert.doesNotMatch(page.body, new RegExp(token));
  assert.match(page.body, /history\.replaceState\(null, "", "\/"\)/, "the page drops the fragment from the address bar");
  // OSC 8 links point at vscode://, which xterm.js ignores unless non-HTTP links are allowed.
  assert.match(page.body, /allowNonHttpProtocols: true/);
  for (const [asset, type] of [["xterm.js", "text/javascript"], ["xterm.css", "text/css"], ["addon-fit.js", "text/javascript"]] as const) {
    const res = await status(url, `/assets/${asset}`);
    assert.equal(res.status, 200, asset);
    assert.equal(res.type, type);
    assert.ok(res.body.length > 1000, asset);
  }
  assert.equal((await status(url, "/assets/../package.json")).status, 404);
  // A page of another origin cannot open the socket, and neither can a request without the token.
  const upgrade = { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" };
  const offer = (value: string): Record<string, string> => ({ ...upgrade, "Sec-WebSocket-Protocol": `keylang, keylang.t.${value}` });
  assert.equal((await status(url, "/ws", { ...offer(token), Origin: "http://evil.example" })).status, 403);
  assert.equal((await status(url, "/ws", upgrade)).status, 403);
  assert.equal((await status(url, "/ws", offer("wrong"))).status, 403);
  assert.equal((await status(url, `/ws?t=${token}`, upgrade)).status, 403, "a token in the query is not accepted");
  const accepted = await status(url, "/ws", { ...offer(token), Origin: `http://${url.host}` });
  assert.equal(accepted.status, 101);
  assert.equal(accepted.headers["sec-websocket-protocol"], "keylang", "the token is not echoed back");
  assert.equal((await status(url, "/", { Host: `evil.example:${url.port}` })).status, 421);
});

test("web: check.static shape is the same unverified step the terminal shows", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-web-static-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const layers = { domain: ["src/domain/**"], application: ["src/application/**"], presentation: ["src/presentation/**"] };
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers, check: { static: "shape" } }, null, 2)}\n`);
  for (const [path, text] of Object.entries({ ...HOOKS, "keylang/flows/hooks.md": HOOK_FLOW, "keylang/rules.md": "# rules\n" })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const cols = 240;
  const rows = 24;
  const terminal = new VirtualTerminal(cols, rows);
  const app = new App({ root: dir, cols, rows });
  t.after(() => app.close());
  app.attach({ kind: "terminal", write: (ansi) => terminal.feed(ansi) }, cols, rows);
  await app.idle();
  for (let i = 0; i < 8 && !terminal.text().includes("keylang.json check.static"); i++) app.input(KEY.down);
  assert.match(terminal.text(), /not followed in static mode shape, set by keylang\.json check\.static/);

  const { url } = await startWeb(t, dir);
  const client = new Client(url, "static-shape", cols, rows);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => client.vt.text().includes("domain.build.build") && !/updating|analyzing/.test(client.vt.text()), "the first analysis");
  for (let i = 0; i < 8 && !client.vt.text().includes("keylang.json check.static"); i++) {
    const before = client.raw.length;
    client.input(KEY.down);
    await waitFor(() => client.raw.length > before, "the cursor moved");
  }
  assert.match(client.vt.text(), /not followed in static mode shape, set by keylang\.json check\.static/);
});

test("web: flow → hover a step → go to the code gives the terminal's screen", async (t) => {
  const repo = checkoutRepo(t);
  const cols = 100;
  const rows = 28;
  // Terminal: the session in this process, as `keylang` runs it.
  const terminal = new VirtualTerminal(cols, rows);
  const app = new App({ root: repo, cols, rows });
  t.after(() => app.close());
  app.attach({ kind: "terminal", write: (ansi) => terminal.feed(ansi) }, cols, rows);
  await app.idle();
  const at = locate(terminal.lines(), "application.purchase.buy");
  app.input(mouseMove(at.x + 2, at.y));
  const hoverTerminal = terminal.text();
  assert.match(hoverTerminal, /fn application\.purchase\.buy/);
  for (let i = 0; i < 5; i++) app.input(KEY.down);
  app.input(KEY.enter);
  const codeTerminal = terminal.lines();
  assert.match(codeTerminal.join("\n"), /▶ +3 export function buy/);

  // Browser: the same keys and pointer over the WebSocket.
  const { url } = await startWeb(t, repo);
  const client = new Client(url, "session-equivalence", cols, rows);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? "") && !/updating|analyzing/.test(client.vt.text()), "the first analysis");
  client.input(mouseMove(at.x + 2, at.y));
  await waitFor(() => client.vt.text().includes("fn application.purchase.buy"), "the hover");
  assert.equal(client.vt.text(), hoverTerminal);
  for (let i = 0; i < 5; i++) client.input(KEY.down);
  client.input(KEY.enter);
  await waitFor(() => client.vt.text().includes("▶"), "the code viewer");
  assert.deepEqual(client.vt.lines(), codeTerminal);
  assert.ok(client.vt.links.some((link) => /^vscode:\/\/file\/.*\/src\/application\/purchase\.ts:3$/.test(link)), "OSC 8 link into VS Code");
  // The same frames in xterm.js itself: the screen matches, and the page turned on SGR mouse and bracketed paste.
  const browser = new xterm.Terminal({ cols, rows, allowProposedApi: true });
  await new Promise<void>((done) => browser.write(client.raw.join(""), done));
  const shown = Array.from({ length: rows }, (_, y) => browser.buffer.active.getLine(y)!.translateToString(false));
  assert.deepEqual(shown.map((line) => line.trimEnd()), codeTerminal.map((line) => line.trimEnd()));
  assert.equal(browser.modes.mouseTrackingMode, "any");
  assert.equal(browser.modes.bracketedPasteMode, true);
  browser.dispose();
});

test("web: another tab takes the session over without ending it, and the old tab stops driving it", async (t) => {
  const repo = checkoutRepo(t);
  // In process, with a short keep time: the close of the old tab must not start the session's end.
  const server = await serveWeb({ root: repo, port: 0, keepMs: 50 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const first = new Client(url, "session-takeover", 100, 24);
  t.after(() => first.close());
  await first.opened;
  await waitFor(() => /✗ 0 /.test(first.vt.lines().at(-1) ?? ""), "the first analysis");
  first.input("i");
  first.input(KEY.down);
  first.input(KEY.end);
  first.input(" typed in the first tab");
  await waitFor(() => first.vt.text().includes("typed in the first tab"), "the edit");
  const second = new Client(url, "session-takeover", 100, 24);
  t.after(() => second.close());
  await second.opened;
  await waitFor(() => first.closed, "the first tab to be told");
  assert.equal(first.closeCode, 4000);
  // The session, with its unsaved edit, lives on in the second tab.
  await waitFor(() => second.vt.text().includes("typed in the first tab"), "the same session in the second tab");
  // Past the keep time: the session was never detached.
  await new Promise((done) => setTimeout(done, 200));
  second.input(" and the second");
  await waitFor(() => second.vt.text().includes("and the second"), "input from the second tab");
  assert.match(second.vt.lines()[0]!, /\[\+\]/, "still unsaved, not a fresh session");
});

test("web: a reset without the token, oversized sizes and bad frames do not take the server down", async (t) => {
  const repo = checkoutRepo(t);
  const { url, child } = await startWeb(t, repo);
  // An upgrade without the token, answered 403, then a TCP reset from the client.
  await new Promise<void>((done) => {
    const socket = connect(Number(url.port), url.hostname, () => {
      socket.write("GET /ws HTTP/1.1\r\nHost: " + url.host + "\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n");
      socket.resetAndDestroy();
      done();
    });
    socket.on("error", () => done());
  });
  await new Promise((done) => setTimeout(done, 100));
  assert.equal(child.exitCode, null, "the server is still running");
  const client = new Client(url, "session-limits", 80, 24);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? ""), "the first analysis");
  const before = client.raw.length;
  client.send({ type: "resize", cols: 20000, rows: 20000 });
  await waitFor(() => client.raw.length > before, "the repaint");
  const frame = client.raw.slice(before).join("");
  const rowsDrawn = Math.max(...[...frame.matchAll(/\x1b\[(\d+);1H/g)].map((m) => Number(m[1])));
  assert.ok(rowsDrawn <= 400, `a frame of at most 400 rows, got ${rowsDrawn}`);
  // Not JSON, not an object, and a binary frame: ignored, the session keeps working.
  client.send("not json" as unknown as object);
  client.send(null);
  client.send({ type: "resize", cols: 80, rows: 24 });
  await waitFor(() => client.vt.lines().at(-1)!.includes("✗ 0"), "the session after bad frames");
  assert.equal(child.exitCode, null);
});

test("web: Ctrl+C stops the server with a socket that never upgraded", async (t) => {
  const repo = checkoutRepo(t);
  const { url, child } = await startWeb(t, repo);
  const idle = connect(Number(url.port), url.hostname);
  t.after(() => idle.destroy());
  idle.on("error", () => {});
  await new Promise<void>((done) => idle.once("connect", () => done()));
  const client = new Client(url, "session-stop", 80, 24);
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? ""), "the first analysis");
  child.kill("SIGINT");
  const code = await Promise.race([new Promise<number | null>((done) => child.once("exit", done)), new Promise<string>((done) => setTimeout(() => done("hung"), 3000))]);
  assert.equal(code, 0);
});

test("web: resize, paste and Unicode, and a reconnect to the same session", async (t) => {
  const repo = checkoutRepo(t);
  const { url } = await startWeb(t, repo);
  const client = new Client(url, "session-reconnect", 90, 24);
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? ""), "the first analysis");
  client.vt.resize(120, 30);
  client.send({ type: "resize", cols: 120, rows: 30 });
  await waitFor(() => client.vt.lines()[0]!.trimEnd().endsWith("VIEW"), "a repaint at the new size");
  assert.match(client.vt.lines()[0]!, /^ keylang · keylang\/flows\/checkout\.md {10,}VIEW $/);
  assert.equal(client.vt.lines()[0]!.length, 120);
  // Edit the prose line: pasted text and typed non-ASCII (what an IME commits).
  client.input(KEY.down);
  client.input(KEY.down);
  client.input("i");
  client.input(KEY.end);
  client.input("\x1b[200~ Оплата 支付\x1b[201~");
  client.input("ї");
  client.input(KEY.ctrlS);
  await waitFor(() => readFileSync(join(repo, "keylang/flows/checkout.md"), "utf8").includes("Checkout from the terminal. Оплата 支付ї"), "the saved file");
  await waitFor(() => client.vt.text().includes("saved"), "the saved message");
  // Leave edit mode, go to the code, then drop the connection.
  client.input("\x1b");
  await new Promise((done) => setTimeout(done, 60));
  for (let i = 0; i < 3; i++) client.input(KEY.down);
  client.input(KEY.enter);
  await waitFor(() => client.vt.text().includes("▶"), "the code viewer");
  client.close();
  await waitFor(() => client.closed, "the close");
  const again = new Client(url, "session-reconnect", 120, 30);
  t.after(() => again.close());
  await again.opened;
  await waitFor(() => again.vt.text().includes("▶"), "the same session after reconnecting");
  assert.match(again.vt.lines()[0]!, /CODE $/);
  assert.match(again.vt.text(), /src\/application\/purchase\.ts:3/);
  // `q` leaves the code viewer; `q` again ends the session.
  again.input("q");
  again.input("q");
  await waitFor(() => again.vt.text().includes("session ended"), "the end of the session");
});

test("web: --port must be a number", async () => {
  const child = spawn(process.execPath, [bin, "web", "--port", "70x"], { cwd: root });
  let err = "";
  child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
  const code = await new Promise<number | null>((done) => child.on("exit", done));
  assert.equal(code, 2);
  assert.match(err, /--port must be a number/);
});

test("web: Ctrl+R records from the browser's microphone over the same socket; the speech reaches the recognizer", async (t) => {
  const repo = checkoutRepo(t);
  const config = join(repo, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), voice: { engine: "openrouter" } }));
  const heard: { format: string; bytes: number }[] = [];
  const recognizer = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const audio = (JSON.parse(data) as { messages: { content: { input_audio?: { data: string; format: string } }[] }[] }).messages[0]!.content[1]!.input_audio!;
      heard.push({ format: audio.format, bytes: Buffer.from(audio.data, "base64").length });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "емітить order paid" } }] }));
    });
  });
  await new Promise<void>((resolve) => recognizer.listen(0, "127.0.0.1", resolve));
  t.after(() => recognizer.close());
  const { url } = await startWeb(t, repo, { OPENROUTER_BASE_URL: `http://127.0.0.1:${(recognizer.address() as AddressInfo).port}`, OPENROUTER_API_KEY: "test" });
  const client = new Client(url, "session-voice", 120, 30);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? ""), "the first analysis");
  // What a page does: on "mic on", stream PCM; on "mic off", end the recording.
  client.onControl = (message) => {
    if (message.on) {
      const pcm = Buffer.alloc(3200 * 2);
      for (let i = 0; i < 3200; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 5) * 8000), i * 2);
      client.send({ type: "audio", data: pcm.toString("base64") });
      client.send({ type: "audio", data: pcm.toString("base64") });
      client.input("\x12");
    } else client.send({ type: "audio-end" });
  };
  client.input("i");
  for (let i = 0; i < 6; i++) client.input(KEY.down);
  client.input(KEY.end);
  client.input(KEY.enter);
  client.input("\x12");
  await waitFor(() => client.vt.text().includes("- emits order.paid"), "the recognized item in the editor");
  assert.deepEqual(client.controls, [{ type: "mic", on: true }, { type: "mic", on: false }]);
  assert.equal(heard.length, 1);
  assert.equal(heard[0]!.format, "wav");
  assert.equal(heard[0]!.bytes, 44 + 3200 * 2 * 2, "a WAV header and both chunks");
});

// ---------- review 2026-09-28 (full, session): web ----------

/** A raw HTTP exchange: what a client that does not speak through `URL` sends, and the status line it gets back. */
function rawRequest(url: URL, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname, () => socket.write(text));
    let answer = "";
    socket.on("data", (chunk: Buffer) => (answer += chunk.toString()));
    socket.on("end", () => resolve(answer.split("\r\n")[0] ?? ""));
    socket.on("error", reject);
  });
}

test("web: a request whose target is no URL gets 400, and the server keeps running", async (t) => {
  const repo = checkoutRepo(t);
  const { url, child } = await startWeb(t, repo);
  assert.equal(await rawRequest(url, `GET //[ HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`), "HTTP/1.1 400 Bad Request");
  const upgrade = `GET //[ HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Protocol: keylang, keylang.t.${tokenOf(url)}\r\n\r\n`;
  assert.equal(await rawRequest(url, upgrade), "HTTP/1.1 400 Bad Request");
  await new Promise((done) => setTimeout(done, 100));
  assert.equal(child.exitCode, null, "the server is still running");
  assert.equal((await status(url, "/")).status, 200);
});

test("web: a megabyte input frame in one session leaves the server answering the others", async (t) => {
  const repo = checkoutRepo(t);
  const { url } = await startWeb(t, repo);
  const flood = new Client(url, "session-flood", 100, 24);
  const other = new Client(url, "session-other", 100, 24);
  t.after(() => flood.close());
  t.after(() => other.close());
  await Promise.all([flood.opened, other.opened]);
  await waitFor(() => /✗ 0 /.test(flood.vt.lines().at(-1) ?? "") && /✗ 0 /.test(other.vt.lines().at(-1) ?? ""), "the first analysis of both");
  // Within the 1 MiB message limit: a million keys typed in the view, the frame the review sent.
  const frames = other.raw.length;
  flood.input("a".repeat(1_000_000));
  const started = Date.now();
  other.input(KEY.down);
  await waitFor(() => other.raw.length > frames, "a frame for the other session");
  await waitFor(() => flood.vt.text().includes("paste: press i to edit first"), "the flooding session's answer");
  assert.ok(Date.now() - started < 10000, `the server answered after ${Date.now() - started} ms`);
});

test("web: a session that cannot be opened says so and closes with 4001", async (t) => {
  const repo = checkoutRepo(t);
  const server = await serveWeb({
    root: repo,
    port: 0,
    analyzer: () => {
      throw new Error("no analysis here");
    },
  });
  t.after(() => server.close());
  const client = new Client(new URL(server.url), "session-broken", 80, 24);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => client.closed, "the close");
  assert.equal(client.closeCode, 4001);
  assert.match(client.vt.text(), /keylang: cannot open a session: no analysis here/);
});

test("web: a tab closed while it records ends the recording instead of leaving it waiting", async (t) => {
  const repo = checkoutRepo(t);
  const config = join(repo, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), voice: { engine: "openrouter" } }));
  const saved = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test";
  t.after(() => {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  });
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const first = new Client(url, "session-mic-close", 120, 30);
  await first.opened;
  await waitFor(() => /✗ 0 /.test(first.vt.lines().at(-1) ?? ""), "the first analysis");
  first.input("i");
  first.input("\x12");
  await waitFor(() => first.controls.some((message) => message.type === "mic" && message.on === true), "the page asked for the microphone");
  // The tab goes away without `audio-end`.
  first.close();
  await waitFor(() => first.closed, "the close");
  const again = new Client(url, "session-mic-close", 120, 30);
  t.after(() => again.close());
  await again.opened;
  await waitFor(() => again.vt.text().includes("voice: the page closed during the recording"), "the recording ended");
});

test("web: t switches the map to the explained map on the same node, the screen the terminal shows", async (t) => {
  const repo = checkoutRepo(t, { "src/application/purchase.ts": 'import { create } from "../domain/order.ts";\nimport { save } from "../infrastructure/store.ts";\n/** Buys the cart: creates the order, then stores it. */\nexport function buy(): void {\n  create();\n  save();\n}\n' });
  const config = join(repo, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), explain: { map: true } }));
  const cols = 100;
  const rows = 28;
  const terminal = new VirtualTerminal(cols, rows);
  const app = new App({ root: repo, cols, rows });
  t.after(() => app.close());
  app.attach({ kind: "terminal", write: (ansi) => terminal.feed(ansi) }, cols, rows);
  await app.idle();
  for (let i = 0; i < 5; i++) app.input(KEY.down);
  app.input(KEY.altEnter);
  app.input("t");
  const explained = terminal.lines();
  assert.match(explained[0]!, /keylang\/map-explained\/application\.md/);
  assert.match(explained.join("\n"), /<br>Buys the cart/);

  const { url } = await startWeb(t, repo);
  const client = new Client(url, "session-explained", cols, rows);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? "") && !/updating|analyzing/.test(client.vt.text()), "the first analysis");
  for (let i = 0; i < 5; i++) client.input(KEY.down);
  client.input(KEY.altEnter);
  client.input("t");
  await waitFor(() => client.vt.lines()[0]!.includes("map-explained/application.md"), "the explained map");
  assert.deepEqual(client.vt.lines(), explained);
  client.input("t");
  await waitFor(() => client.vt.lines()[0]!.includes("keylang/map/application.md"), "the map again");
});

// ---------- operations across a socket's life (ticket 36) ----------

/** What a test drives: a terminal session in this process or a browser tab over the socket. */
interface Screen {
  input(keys: string): void;
  text(): string;
  lines(): string[];
}

function typeInto(screen: Screen, text: string): void {
  for (const ch of text) screen.input(ch);
}

/** The palette, an action by its words, Enter. */
function palette(screen: Screen, words: string): void {
  screen.input(KEY.ctrlP);
  typeInto(screen, words);
  screen.input(KEY.enter);
}

/** The repository's files, the index's `generated` time taken out: what two runs must share. */
function artifacts(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.set(abs.slice(root.length + 1), readFileSync(abs, "latin1"));
    }
  };
  walk(root);
  const index = out.get(".keylang/index.json");
  if (index !== undefined) out.set(".keylang/index.json", index.replace(/"generated": "[^"]*"/, '"generated": "…"'));
  return out;
}

/** The checkout code with no keylang.json and a codex harness: the start screen. */
function uninitializedRepo(t: { after: (f: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-web-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(CHECKOUT_FILES)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  mkdirSync(join(dir, ".codex"), { recursive: true });
  return dir;
}

const analysed = (screen: Screen): boolean => /✗ 0 /.test(screen.lines().at(-1) ?? "") && !/updating|analyzing/.test(screen.text());

/** The F6 list: one line per record, its label and outcome. */
function recordLines(screen: Screen): string[] {
  return screen
    .lines()
    .map((line) => line.split("│")[0]!.trimEnd())
    .filter((line) => /^ \d+ {2}\S/.test(line) && !/Current analysis/.test(line));
}

/**
 * init from the start screen → a new feature, edited, saved, read → code from the map → map write → feature;
 * the F6 list at the end.
 */
async function firstProject(screen: Screen): Promise<string[]> {
  await waitFor(() => screen.text().includes("> Init: set up keylang in this repository"), "the start screen");
  screen.input(KEY.enter);
  screen.input(KEY.enter);
  await waitFor(() => screen.text().includes("init: set up: map, baseline, agents · code 0") && analysed(screen), "init");
  // Code from the map: the built-in viewer, never a server-side `$EDITOR`.
  for (let i = 0; i < 8; i++) screen.input(KEY.down);
  screen.input(KEY.enter);
  await waitFor(() => /▶ +3 export function buy/.test(screen.text()), "the code viewer");
  palette(screen, "new specification");
  typeInto(screen, "feature");
  screen.input(KEY.enter);
  typeInto(screen, "refunds.md");
  screen.input(KEY.enter);
  await waitFor(() => screen.lines()[0]!.includes("keylang/features/refunds.md [+ new, not on disk]"), "the new feature buffer");
  typeInto(screen, "Refunds go back to the card.");
  screen.input(KEY.ctrlS);
  await waitFor(() => screen.text().includes("keylang/features/refunds.md: saved") && analysed(screen), "the save");
  screen.input("\x1b");
  await new Promise((done) => setTimeout(done, 60));
  screen.input("v");
  await waitFor(() => /READ $/.test(screen.lines()[0]!), "reading");
  palette(screen, "map write");
  await waitFor(() => screen.text().includes("[Continue]"), "the map targets");
  screen.input(KEY.enter);
  await waitFor(() => /map write: \d+ written · code 0/.test(screen.text()), "the map write");
  palette(screen, "feature readiness");
  screen.input(KEY.enter);
  // A feature of one sentence is an idea: nothing to check yet, so not done (c4-zoom/03).
  await waitFor(() => screen.text().includes("feature refunds: 1 gap(s) · code 1"), "the feature");
  screen.input(KEY.f6);
  await waitFor(() => recordLines(screen).length >= 3, "the F6 list");
  return recordLines(screen);
}

test("web: init → new feature → edit → read → map → feature over the real transport leaves the terminal's files and records; code opens in the viewer, not $EDITOR", async (t) => {
  const terminalRoot = uninitializedRepo(t);
  const webRoot = uninitializedRepo(t);
  const cols = 110;
  const rows = 30;
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root: terminalRoot, cols, rows });
  t.after(() => app.close());
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, cols, rows);
  const inTerminal = await firstProject({ input: (keys) => app.input(keys), text: () => vt.text(), lines: () => vt.lines() });

  // An editor that leaves a mark if anything ever ran it.
  const mark = join(webRoot, "..", `${webRoot.split("/").at(-1)}-editor-ran`);
  t.after(() => rmSync(mark, { force: true }));
  const editor = `${process.execPath} -e require('fs').writeFileSync(${JSON.stringify(mark)},'')`;
  const { url } = await startWeb(t, webRoot, { EDITOR: editor, VISUAL: editor });
  const client = new Client(url, "session-first-project", cols, rows);
  t.after(() => client.close());
  await client.opened;
  const inBrowser = await firstProject(clientScreen(client));

  assert.deepEqual(inBrowser, inTerminal, "the same records, labels and outcomes");
  assert.equal(inBrowser.length, 3, inBrowser.join("\n"));
  assert.match(inBrowser[0]!, /Init: set up keylang .* completed · code/);
  assert.match(inBrowser[1]!, /Map: write +completed · code 0/);
  assert.match(inBrowser[2]!, /Feature readiness · refunds +completed · code 1/);
  assert.deepEqual(artifacts(webRoot), artifacts(terminalRoot), "the same files, byte for byte");
  assert.equal(existsSync(mark), false, "no editor ran on the server");
  // Actions add no HTTP endpoint: only the page, its assets and the socket.
  for (const path of ["/run", "/operations", "/api/map", "/ws/run"]) assert.equal((await status(url, path)).status, 404, path);
});

/** The repository of the ticket-38 cycle, without keylang.json. */
function cycleRepo(t: { after: (f: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-web-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(CYCLE_FILES)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** The outside author's proposal lands at the "author" stage; every other stage needs nothing from the caller. */
function author(dir: string): (stage: CycleStage) => void {
  return (stage) => {
    if (stage !== "author") return;
    mkdirSync(join(dir, ".keylang/proposals/src/app"), { recursive: true });
    writeFileSync(join(dir, ".keylang/proposals/src/app/order.ts"), CYCLE_AUTHOR_CODE);
  };
}

test("web: the whole cycle — init → config → new feature → check → spec-to-code → proposals and MERGE → an outside proposal → map → feature done — gives the terminal's records and files over the real transport", async (t) => {
  const terminalRoot = cycleRepo(t);
  const webRoot = cycleRepo(t);
  const cols = 110;
  const rows = 30;
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root: terminalRoot, cols, rows });
  t.after(() => app.close());
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, cols, rows);
  const terminal = { input: (keys: string) => app.input(keys), text: () => vt.text(), lines: () => vt.lines() };
  await refundCycle(terminal, author(terminalRoot));
  terminal.input(KEY.f6);
  await waitFor(() => recordLines(terminal).length >= 7, "the terminal's F6 list");
  const inTerminal = recordLines(terminal);

  const { url } = await startWeb(t, webRoot);
  const client = new Client(url, "session-cycle", cols, rows);
  t.after(() => client.close());
  await client.opened;
  const browser = clientScreen(client);
  await refundCycle(browser, author(webRoot));
  browser.input(KEY.f6);
  await waitFor(() => recordLines(browser).length >= 7, "the browser's F6 list");
  const inBrowser = recordLines(browser);

  assert.deepEqual(inBrowser, inTerminal, "the same records, labels and outcomes");
  assert.equal(inBrowser.length, 7, inBrowser.join("\n"));
  assert.match(inBrowser[3]!, /Spec to code: a planned fn/);
  assert.match(inBrowser[6]!, /Feature readiness · refund +completed · code 0/);
  assert.deepEqual(artifacts(webRoot), artifacts(terminalRoot), "the same files, byte for byte");
});

/** A runner on this thread that holds every operation before its commit until `release`, counting its runs. */
function heldRunner(): { runner: OperationRunner; release: () => void; runs: () => number; signals: AbortSignal[]; settled: () => number } {
  let open: () => void = () => {};
  let gate = new Promise<void>((done) => (open = done));
  let runs = 0;
  let settled = 0;
  const signals: AbortSignal[] = [];
  return {
    runner: async (request, context) => {
      runs++;
      if (context.signal) signals.push(context.signal);
      // The session's analyzer serves the screen; like the operation worker, the run analyses on its own.
      const { analyze: _screen, ...own } = context;
      try {
        return await runOperation(request, {
          ...own,
          beforeCommit: async (plan) => {
            await gate;
            return context.beforeCommit?.(plan);
          },
        });
      } finally {
        settled++;
      }
    },
    release: () => {
      open();
      gate = new Promise<void>((done) => (open = done));
    },
    runs: () => runs,
    signals,
    settled: () => settled,
  };
}

function clientScreen(client: Client): Screen {
  return { input: (keys) => client.input(keys), text: () => client.vt.text(), lines: () => client.vt.lines() };
}

test("web: a dropped socket leaves a running map write to its session; the reconnect shows one record with its progress and result, the disk matches it, and Cancel works after a reconnect", async (t) => {
  const root = checkoutRepo(t);
  const twin = checkoutRepo(t);
  const held = heldRunner();
  const server = await serveWeb({ root, port: 0, operations: held.runner, keepMs: 60000 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const first = new Client(url, "session-drop", 110, 30);
  t.after(() => first.close());
  await first.opened;
  await waitFor(() => analysed(clientScreen(first)), "the first analysis");
  const before = artifacts(root);
  palette(clientScreen(first), "map write");
  await waitFor(() => first.vt.text().includes("[Continue]"), "the map targets");
  first.input(KEY.enter);
  await waitFor(() => first.vt.text().includes("map write: waiting to write"), "the pause before the commit");
  first.close();
  await waitFor(() => first.closed, "the drop");
  // Nobody watches: the operation goes on, once, and writes what the CLI writes.
  held.release();
  await waitFor(() => held.settled() === 1, "the write");
  assert.equal(held.runs(), 1);
  assert.equal(held.signals[0]!.aborted, false, "the drop cancelled nothing");
  assert.equal(spawnCli(twin, ["map"]), 0);
  assert.deepEqual(artifacts(root), artifacts(twin));
  assert.notDeepEqual(artifacts(root), before);

  const again = new Client(url, "session-drop", 110, 30);
  t.after(() => again.close());
  await again.opened;
  await waitFor(() => /map write: \d+ written · code 0 · F6 shows the report/.test(again.vt.text()), "the result in the same session");
  again.input(KEY.f6);
  await waitFor(() => recordLines(clientScreen(again)).length >= 1, "the F6 list");
  assert.deepEqual(recordLines(clientScreen(again)).map((line) => line.replace(/^ \d+ {2}/, "")), ["Map: write  completed · code 0"], "one record, not a second run");
  assert.match(again.vt.text(), /written {2}keylang\/map\/application\.md/);
  assert.match(again.vt.text(), /6 written · code 0/);
  assert.equal(held.runs(), 1);

  // A second write, dropped while held and cancelled from the tab that came back: nothing is written.
  again.input(KEY.f6);
  writeFileSync(join(root, "src/domain/order.ts"), "export function create(): void {}\nexport function cancel(): void {}\n");
  const written = artifacts(root);
  palette(clientScreen(again), "map write");
  await waitFor(() => again.vt.text().includes("[Continue]"), "the map targets");
  again.input(KEY.enter);
  await waitFor(() => again.vt.text().includes("map write: waiting to write"), "the second pause");
  again.close();
  await waitFor(() => again.closed, "the second drop");
  const back = new Client(url, "session-drop", 110, 30);
  t.after(() => back.close());
  await back.opened;
  await waitFor(() => back.vt.text().includes("map write: waiting to write"), "the running operation after the reconnect");
  back.input(KEY.f6);
  await waitFor(() => /Map: write +running/.test(back.vt.text()), "the running record");
  back.input("x");
  await waitFor(() => /Map: write +cancelled/.test(back.vt.text()), "cancelled");
  held.release();
  await waitFor(() => held.settled() === 2, "the held operation to end");
  assert.equal(held.runs(), 2);
  assert.deepEqual(artifacts(root), written, "the cancelled write wrote nothing");
  assert.deepEqual(recordLines(clientScreen(back)).map((line) => line.replace(/^ \d+ {2}/, "")), ["Map: write  completed · code 0", "Map: write  cancelled"]);
});

function spawnCli(cwd: string, args: string[]): number | null {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" }).status;
}

test("web: a tab that lost its session to another starts nothing; the new owner's run is the only one", async (t) => {
  const root = checkoutRepo(t);
  const held = heldRunner();
  const server = await serveWeb({ root, port: 0, operations: held.runner });
  t.after(() => server.close());
  const url = new URL(server.url);
  const first = new Client(url, "session-owner", 110, 30);
  t.after(() => first.close());
  await first.opened;
  await waitFor(() => analysed(clientScreen(first)), "the first analysis");
  const second = new Client(url, "session-owner", 110, 30);
  t.after(() => second.close());
  await second.opened;
  await waitFor(() => second.raw.length > 0, "the second tab's first frame");
  // The old tab's keys after the takeover: whether they reach the server or not, they drive nothing.
  palette(clientScreen(first), "map write");
  first.input(KEY.enter);
  await waitFor(() => first.closed, "the old tab told");
  assert.equal(first.closeCode, 4000);
  await new Promise((done) => setTimeout(done, 200));
  assert.equal(held.runs(), 0, "the old tab started no operation");
  palette(clientScreen(second), "map write");
  await waitFor(() => second.vt.text().includes("[Continue]"), "the map targets");
  second.input(KEY.enter);
  await waitFor(() => held.runs() === 1, "the owner's run");
  held.release();
  await waitFor(() => /map write: \d+ written · code 0/.test(second.vt.text()), "the write");
  assert.equal(held.runs(), 1);
});

test("web: the expiry of a detached session and server.close() cancel a held write; nothing is written after them and no job is left", async (t) => {
  const root = checkoutRepo(t);
  const held = heldRunner();
  const server = await serveWeb({ root, port: 0, operations: held.runner, keepMs: 200 });
  let closed = false;
  t.after(() => (closed ? undefined : server.close()));
  const url = new URL(server.url);
  const before = artifacts(root);
  const start = async (session: string): Promise<Client> => {
    const client = new Client(url, session, 110, 30);
    t.after(() => client.close());
    await client.opened;
    await waitFor(() => analysed(clientScreen(client)), "the first analysis");
    palette(clientScreen(client), "map write");
    await waitFor(() => client.vt.text().includes("[Continue]"), "the map targets");
    client.input(KEY.enter);
    await waitFor(() => client.vt.text().includes("map write: waiting to write"), "the pause before the commit");
    return client;
  };
  const tab = await start("session-expiry");
  tab.close();
  // The keep time passes with the write held: the session ends as `q` would, the operation is cancelled.
  await waitFor(() => held.signals[0]?.aborted === true, "the expiry to cancel the write");
  held.release();
  await waitFor(() => held.settled() === 1, "the cancelled run to end");
  assert.deepEqual(artifacts(root), before, "the cancelled write wrote nothing");
  // The same session ID now opens a new session: no record of the old one, no job running.
  const fresh = new Client(url, "session-expiry", 110, 30);
  t.after(() => fresh.close());
  await fresh.opened;
  await waitFor(() => analysed(clientScreen(fresh)), "the new session");
  fresh.input(KEY.f6);
  await waitFor(() => fresh.vt.text().includes("Current analysis"), "the F6 list");
  assert.deepEqual(recordLines(clientScreen(fresh)), []);
  fresh.input(KEY.f6);
  fresh.close();

  // server.close() with a write held in an attached session.
  const open = await start("session-server-close");
  await server.close();
  closed = true;
  assert.equal(held.signals[1]?.aborted, true, "the close cancelled the write");
  await waitFor(() => open.closed, "the tab told");
  held.release();
  await waitFor(() => held.settled() === 2, "the cancelled run to end");
  assert.equal(held.runs(), 2);
  assert.deepEqual(artifacts(root), before, "nothing written after the close");
});

test("web: the zoom screen over the real transport: z from the palette, + into a layer, - back up (c4-zoom/07)", async (t) => {
  const root = checkoutRepo(t);
  const { url } = await startWeb(t, root);
  const client = new Client(url, "session-zoom", 120, 30);
  t.after(() => client.close());
  await client.opened;
  const screen = clientScreen(client);
  await waitFor(() => analysed(screen), "the first analysis");
  palette(screen, "zoom");
  await waitFor(() => / ZOOM $/.test(screen.lines()[0] ?? "") && /▸ layer  domain/.test(screen.text()), "the zoom screen at the repository");
  screen.input("+");
  await waitFor(() => /system › domain +\[−\] \[\+\] \[depth 1 ▾▴\]/.test(screen.text()) && /module order/.test(screen.text()), "the domain's level");
  screen.input("-");
  await waitFor(() => /system +\[−\] \[\+\] \[depth 1 ▾▴\]/.test(screen.text()) && !/system › domain/.test(screen.text()), "back at the repository");
  screen.input("q");
  await waitFor(() => !/ ZOOM $/.test(screen.lines()[0] ?? ""), "the view again");
});

test("web: the edges view of the zoom screen over the real transport: c, then Enter follows an edge (c4-zoom/08)", async (t) => {
  const root = checkoutRepo(t);
  const { url } = await startWeb(t, root);
  const client = new Client(url, "session-zoom-edges", 130, 30);
  t.after(() => client.close());
  await client.opened;
  const screen = clientScreen(client);
  await waitFor(() => analysed(screen), "the first analysis");
  palette(screen, "zoom");
  await waitFor(() => / ZOOM $/.test(screen.lines()[0] ?? ""), "the zoom screen");
  screen.input("c");
  await waitFor(() => /system +\[−\].*\[c nodes\]/.test(screen.text()) && /inside +application → domain · call ×1, import ×1/.test(screen.text()), "the edges of the repository");
  screen.input(KEY.enter);
  await waitFor(() => /system › domain +\[−\].*\[c nodes\]/.test(screen.text()) && /in +application\.purchase → order/.test(screen.text()), "the edges of the domain");
});

test("web: a flow laid over the zoom levels over the real transport: f picks it, + keeps it on the next level (c4-zoom/09)", async (t) => {
  const root = checkoutRepo(t);
  const { url } = await startWeb(t, root);
  const client = new Client(url, "session-zoom-flow", 130, 30);
  t.after(() => client.close());
  await client.opened;
  const screen = clientScreen(client);
  await waitFor(() => analysed(screen), "the first analysis");
  palette(screen, "zoom");
  await waitFor(() => / ZOOM $/.test(screen.lines()[0] ?? ""), "the zoom screen");
  screen.input("f");
  typeInto(screen, "checkout");
  screen.input(KEY.enter);
  await waitFor(() => /flow checkout: presentation ① → application ② → domain ③ → infrastructure ④/.test(screen.text()), "the layers the flow walks");
  screen.input("+");
  await waitFor(() => /system › domain/.test(screen.text()) && /module +order ③/.test(screen.text()), "the step on the domain's module");
});

test("web: a click on [+] in the zoom screen's header zooms in over the real transport (c4-zoom/10)", async (t) => {
  const root = checkoutRepo(t);
  const { url } = await startWeb(t, root);
  const client = new Client(url, "session-zoom-mouse", 130, 30);
  t.after(() => client.close());
  await client.opened;
  const screen = clientScreen(client);
  await waitFor(() => analysed(screen), "the first analysis");
  palette(screen, "zoom");
  await waitFor(() => screen.text().includes("[+]"), "the zoom screen's buttons");
  const at = locate(screen.lines(), "[+]");
  screen.input(click(at.x, at.y));
  await waitFor(() => /system › domain/.test(screen.text()), "the domain's level after the click");
});

test("web: the feature readiness screen over the real transport: the ladder and the gaps by stage (c4-zoom/11)", async (t) => {
  const feature = "# flow refund\n\n- ? who starts a refund?\n- planned fn application.purchase.refund\n- trigger presentation.terminal.checkout\n  - step application.purchase.refund\n";
  const root = checkoutRepo(t, { "keylang/features/refund.md": feature });
  const { url } = await startWeb(t, root);
  const client = new Client(url, "session-readiness", 130, 32);
  t.after(() => client.close());
  await client.opened;
  const screen = clientScreen(client);
  await waitFor(() => analysed(screen), "the first analysis");
  palette(screen, "open keylang/features/refund.md");
  await waitFor(() => /feature structure · questions 1/.test(screen.lines().at(-1) ?? ""), "the feature's status line");
  palette(screen, "feature readiness");
  await waitFor(() => screen.text().includes("feature slug: refund"), "the feature form");
  screen.input(KEY.enter);
  await waitFor(() => screen.text().includes("feature refund: 3 gap(s) · code 1"), "the feature");
  screen.input(KEY.f6);
  await waitFor(() => /stage {2}idea › behavior › \[structure\] › ready › done/.test(screen.text()) && /structure · 1 gap\(s\) · 1 hint\(s\), not blocking/.test(screen.text()) && /ready · 2 gap\(s\)/.test(screen.text()), "the ladder and the stages");
  screen.input(KEY.tab);
  screen.input(KEY.enter);
  await waitFor(() => /keylang\/features\/refund\.md/.test(screen.lines()[0] ?? "") && !/RESULTS · F6/.test(screen.text()), "the question's line");
});
