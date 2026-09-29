// `keylang web` through the real CLI: the page and the bundled xterm.js, the
// access token and origin checks, and the same TUI over a WebSocket — resize,
// mouse, paste and Unicode, reconnecting to the same session, and the scenario
// "open a flow → hover a step → go to the code" giving the same screen as in a
// terminal.

import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import xterm from "@xterm/headless";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { App } from "../src/tui/app.ts";
import { serveWeb } from "../src/tui/web.ts";
import { checkoutRepo, KEY, locate, mouseMove } from "./tui-fixture.ts";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";
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
