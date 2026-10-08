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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { App } from "../src/tui/app.ts";
import { runOperation } from "../src/operations.ts";
import type { OperationRunner } from "../src/tui/app.ts";
import { serveWeb } from "../src/tui/web.ts";
import { checkoutRepo, CHECKOUT_FILES, click, drag, KEY, locate, mouseMove, tempHome } from "./tui-fixture.ts";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";
import { CYCLE_AUTHOR_CODE, CYCLE_FILES, refundCycle, type CycleStage } from "./cycle-fixture.ts";
import { diagramsRepo } from "./diagrams-fixture.ts";
import { explorerRepo } from "./explorer-fixture.ts";
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
  app.attach({ write: (ansi) => terminal.feed(ansi) }, cols, rows);
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
  app.attach({ write: (ansi) => terminal.feed(ansi) }, cols, rows);
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

test("web: a click on the clip opens its chat and a drag by the window's top edge moves it, as in the terminal", async (t) => {
  const repo = checkoutRepo(t);
  const cols = 100;
  const rows = 28;
  // Terminal: the session in this process, as `keylang` runs it; its drag keeps the place in a home of its own, not the server's.
  const terminal = new VirtualTerminal(cols, rows);
  const app = new App({ root: repo, cols, rows, home: tempHome() });
  t.after(() => app.close());
  app.attach({ write: (ansi) => terminal.feed(ansi) }, cols, rows);
  await app.idle();
  const clip = locate(terminal.lines(), "╭─◕◕╮");
  app.input(click(clip.x + 2, clip.y + 1));
  const title = locate(terminal.lines(), "╭─ ◕◕ скрепка ");
  const to = { x: title.x - 20, y: title.y - 6 };
  app.input(drag({ x: title.x + 6, y: title.y }, { x: to.x + 6, y: to.y }));
  assert.deepEqual(locate(terminal.lines(), "╭─ ◕◕ скрепка "), to);
  const moved = terminal.lines();

  // Browser: the same pointer over the WebSocket, through xterm.js's SGR reports.
  const { url } = await startWeb(t, repo);
  const client = new Client(url, "session-clip", cols, rows);
  t.after(() => client.close());
  await client.opened;
  await waitFor(() => /✗ 0 /.test(client.vt.lines().at(-1) ?? "") && !/updating|analyzing/.test(client.vt.text()), "the first analysis");
  assert.deepEqual(locate(client.vt.lines(), "╭─◕◕╮"), clip);
  client.input(click(clip.x + 2, clip.y + 1));
  await waitFor(() => client.vt.text().includes("◕◕ скрепка"), "the chat window");
  assert.deepEqual(locate(client.vt.lines(), "╭─ ◕◕ скрепка "), title);
  client.input(drag({ x: title.x + 6, y: title.y }, { x: to.x + 6, y: to.y }));
  await waitFor(() => client.vt.lines()[to.y]!.includes("╭─ ◕◕ скрепка "), "the moved window");
  assert.deepEqual(client.vt.lines(), moved);
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
  app.attach({ write: (ansi) => terminal.feed(ansi) }, cols, rows);
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
  // The mode, not a pause: in the terminal a lone ESC is Escape after 25 ms; over the socket at once (ticket 71).
  await waitFor(() => /VIEW $/.test(screen.lines()[0]!), "the view after Esc");
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
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
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
  // Actions add no HTTP endpoint: only the page, its assets, the socket and the read-only diagram API.
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
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
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

test("web: /api/diagram and /api/views answer JSON with the socket's token as a Bearer, behind the same Host and Origin checks (business-flows/20)", async (t) => {
  const repo = checkoutRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const token = tokenOf(url);
  const bearer = { Authorization: `Bearer ${token}` };
  const views = await status(url, "/api/views", bearer);
  assert.equal(views.status, 200, views.body);
  assert.match(views.type, /^application\/json/);
  assert.equal(views.headers["cache-control"], "no-store");
  const listed = JSON.parse(views.body) as { flows: string[]; entries: unknown[]; layers: string[] };
  assert.deepEqual(listed.flows, ["checkout"]);
  assert.deepEqual(listed.layers.slice(0, 4), ["domain", "application", "infrastructure", "presentation"]);
  const flow = await status(url, "/api/diagram?view=flow&name=checkout", bearer);
  assert.equal(flow.status, 200, flow.body);
  const diagram = JSON.parse(flow.body) as { nodes: { kind: string; label: string; verdict: string | null }[]; edges: { verdict?: string }[]; groups: unknown[]; reason?: string };
  assert.deepEqual(
    diagram.nodes.map((n) => `${n.kind}:${n.label}`),
    ["start:presentation.terminal.checkout", "task:application.purchase.buy", "task:domain.order.create", "task:infrastructure.store.save"],
  );
  // The repository asks for traces and has none: every step is unverified, while the static route into it is proven.
  assert.deepEqual(
    diagram.nodes.map((n) => n.verdict),
    ["unverified", "unverified", "unverified", "unverified"],
  );
  assert.deepEqual(
    diagram.edges.map((e) => e.verdict),
    ["ok", "ok", "ok"],
  );
  const unknown = JSON.parse((await status(url, "/api/diagram?view=flow&name=nope", bearer)).body) as { nodes: unknown[]; reason: string };
  assert.deepEqual(unknown.nodes, []);
  assert.match(unknown.reason, /no flow named `nope`/);
  // Without the token, with another, or with it in the query: 403, and no data.
  for (const [path, headers] of [
    ["/api/diagram?view=layers", {}],
    ["/api/views", {}],
    ["/api/diagram?view=layers", { Authorization: "Bearer wrong" }],
    ["/api/diagram?view=layers", { Authorization: token }],
    [`/api/diagram?view=layers&t=${token}`, {}],
    ["/api/diagram?view=layers", { ...bearer, Origin: "http://evil.example" }],
  ] as const) {
    const res = await status(url, path, headers);
    assert.equal(res.status, 403, `${path} ${JSON.stringify(headers)}`);
    assert.doesNotMatch(res.body, /checkout/);
  }
  assert.equal((await status(url, "/api/diagram?view=layers", { ...bearer, Origin: `http://${url.host}` })).status, 200);
  assert.equal((await status(url, "/api/diagram?view=nope", bearer)).status, 400);
  assert.equal((await status(url, "/api/diagram?view=flow", bearer)).status, 400);
  assert.equal((await status(url, "/api/diagram?view=layers", { ...bearer, Host: `evil.example:${url.port}` })).status, 421);
  assert.equal((await status(url, "/api/nope", bearer)).status, 404);
});

test("web: /diagrams is a static page with no inline script; the bundled maxGraph client is served from /assets/, and its data still needs the token (business-flows/33)", async (t) => {
  const repo = checkoutRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const token = tokenOf(url);
  const page = await status(url, "/diagrams");
  assert.equal(page.status, 200);
  assert.match(page.type, /^text\/html/);
  assert.equal(page.headers["set-cookie"], undefined);
  const csp = String(page.headers["content-security-policy"]);
  assert.match(csp, /script-src 'self';/, "no inline script on the diagram page");
  assert.match(csp, /connect-src 'self'/);
  assert.match(page.body, /<script src="\/assets\/diagrams\.js" defer><\/script>/);
  assert.match(page.body, /<link rel="stylesheet" href="\/assets\/diagrams\.css">/);
  assert.doesNotMatch(page.body, /<script>/);
  assert.doesNotMatch(page.body, /(src|href)="https?:/);
  assert.doesNotMatch(page.body, new RegExp(token));
  // The terminal page links to it and hands the token over in the fragment, never in the query.
  const terminal = await status(url, "/");
  assert.match(terminal.body, /<a id="diagrams" href="\/diagrams"[^>]*>Діаграми<\/a>/);
  assert.match(terminal.body, /"\/diagrams#t=" \+ encodeURIComponent\(token\)/);
  // In a checkout the bundle is built on demand when missing or older than web/src.
  const script = await status(url, "/assets/diagrams.js");
  assert.equal(script.status, 200, script.body);
  assert.equal(script.type, "text/javascript");
  assert.ok(script.body.length > 10000, "the bundle carries maxGraph");
  assert.match(script.body, /keylang-token/, "the client reads the token the page stored");
  assert.match(script.body, /Bearer /);
  const style = await status(url, "/assets/diagrams.css");
  assert.equal(style.status, 200);
  assert.equal(style.type, "text/css");
  for (const path of ["/api/views", "/api/diagram?view=layers"]) assert.equal((await status(url, path)).status, 403, path);
  assert.equal((await status(url, "/api/views", { Authorization: `Bearer ${token}` })).status, 200);
  assert.equal((await status(url, "/diagrams", { Host: `evil.example:${url.port}` })).status, 421);
  assert.equal((await status(url, "/assets/diagrams.ts")).status, 404);
});

test("web: scripts/build-web.mjs bundles the client offline: one script, its CSS and the bundled packages' licenses, no CDN import (business-flows/33)", () => {
  const out = mkdtempSync(join(tmpdir(), "keylang-web-build-"));
  try {
    const run = spawnSync(process.execPath, [join(root, "scripts/build-web.mjs"), "--outdir", out], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readdirSync(out).sort(), ["diagrams.css", "diagrams.js", "maxgraph-core.LICENSE"]);
    const script = readFileSync(join(out, "diagrams.js"), "utf8");
    assert.ok(script.length > 10000);
    assert.doesNotMatch(script, /(?:\bimport\s*\(?|\bfrom|importScripts\()\s*["'`]https?:\/\//, "no import from a CDN");
    assert.doesNotMatch(script, /^\s*import\s/m, "an IIFE for a plain <script>, not a module");
    assert.doesNotMatch(readFileSync(join(out, "diagrams.css"), "utf8"), /@import|url\(["']?https?:/);
    assert.match(readFileSync(join(out, "maxgraph-core.LICENSE"), "utf8"), /Apache License/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("web: /api/tour answers the project tour as `keylang tour --json` computes it, behind the same token (business-flows/15)", async (t) => {
  const repo = diagramsRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const answer = await status(url, "/api/tour", bearer);
  assert.equal(answer.status, 200, answer.body);
  assert.match(answer.type, /^application\/json/);
  const data = JSON.parse(answer.body) as { snapshotId: string; system: unknown; layers: { name: string }[]; processes: { domains: { processes: { flows: { name: string; link: string; inView: boolean }[] }[] }[] }; startHere: unknown[]; markdown: string };
  assert.deepEqual(Object.keys(data), ["snapshotId", "system", "layers", "processes", "entries", "events", "integrations", "blindSpots", "startHere", "markdown"]);
  assert.deepEqual(data.layers.map((layer) => layer.name).slice(0, 4), ["domain", "application", "infrastructure", "presentation"]);
  const flows = data.processes.domains.flatMap((domain) => domain.processes.flatMap((p) => p.flows));
  assert.deepEqual(flows.map((flow) => [flow.name, flow.link, flow.inView]), [["listOrders", "/diagrams#view=discovered&name=listOrders", true]]);
  // The page's Markdown is the CLI's.
  const cli = spawnSync(process.execPath, [bin, "tour"], { cwd: repo, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(data.markdown, cli.stdout);
  assert.match(data.markdown, /^## 7\. Where to start reading$/m);
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { ...bearer, Origin: "http://evil.example" }]) {
    const refused = await status(url, "/api/tour", headers);
    assert.equal(refused.status, 403, JSON.stringify(headers));
    assert.doesNotMatch(refused.body, /listOrders/);
  }
});

test("web: /api/views lists the discovered flows; /api/diagram draws one; /api/usages says where an ID is used, behind the same token (business-flows/21)", async (t) => {
  const repo = diagramsRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const views = JSON.parse((await status(url, "/api/views", bearer)).body) as { flows: string[]; root: string; flowList: { name: string; file: string; layer: string; ids: string[] }[]; discovered: { name: string; file: string; trigger: string; kind: string; label: string }[] };
  assert.deepEqual(views.flows, ["checkout"]);
  assert.equal(views.root, repo);
  assert.deepEqual(views.flowList.map((f) => [f.name, f.file, f.layer, f.ids.length]), [["checkout", "keylang/flows/checkout.md", "presentation", 4]]);
  assert.deepEqual(
    views.discovered.map((f) => [f.name, f.file, f.trigger, f.kind, f.label]),
    [["listOrders", "keylang/flows-discovered/presentation.md", "presentation.orders.listOrders", "route", "GET /orders"]],
  );
  // A discovered flow is drawn from the view, without verdicts: `check` does not read it.
  const drawn = JSON.parse((await status(url, "/api/diagram?view=discovered&name=listOrders", bearer)).body) as { nodes: { kind: string; label: string; verdict: string | null; ref: { file?: string; line?: number } }[] };
  assert.deepEqual(
    drawn.nodes.map((n) => [n.kind, n.label, n.verdict, n.ref.file, n.ref.line]),
    [
      ["start", "presentation.orders.listOrders", null, "src/presentation/orders.ts", 2],
      ["task", "domain.order.create", null, "src/domain/order.ts", 1],
    ],
  );
  assert.equal((await status(url, "/api/diagram?view=discovered", bearer)).status, 400);
  // A flow's shapes carry the check results behind their verdicts.
  const flow = JSON.parse((await status(url, "/api/diagram?view=flow&name=checkout", bearer)).body) as { nodes: { label: string; results?: { verdict: string; criterion: string; message: string }[] }[] };
  const buy = flow.nodes.find((n) => n.label === "application.purchase.buy");
  assert.ok(buy?.results?.some((r) => r.criterion === "static" && r.verdict === "ok" && /called from presentation\.terminal\.checkout/.test(r.message)), JSON.stringify(buy));
  // Where an ID is used: the flow and the discovered flow that name it, and the entry points on their routes; an ID covers those under it.
  const usages = await status(url, "/api/usages?id=domain.order.create", bearer);
  assert.equal(usages.status, 200, usages.body);
  assert.deepEqual(JSON.parse(usages.body), {
    id: "domain.order.create",
    flows: [{ name: "checkout", file: "keylang/flows/checkout.md", line: 7 }],
    discovered: [{ name: "listOrders", file: "keylang/flows-discovered/presentation.md", line: 8 }],
    entries: [
      { id: "presentation.orders.listOrders", kind: "route", label: "GET /orders" },
      { id: "presentation.terminal.checkout", kind: "route", label: "POST /checkout" },
    ],
  });
  const layer = JSON.parse((await status(url, "/api/usages?id=presentation", bearer)).body) as { flows: unknown[]; discovered: unknown[]; entries: unknown[] };
  assert.deepEqual([layer.flows.length, layer.discovered.length, layer.entries.length], [1, 1, 2]);
  assert.deepEqual(JSON.parse((await status(url, "/api/usages?id=nowhere.at.all", bearer)).body), { id: "nowhere.at.all", flows: [], discovered: [], entries: [] });
  assert.equal((await status(url, "/api/usages", bearer)).status, 400);
  assert.equal((await status(url, "/api/usages?id=", bearer)).status, 400);
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { ...bearer, Origin: "http://evil.example" }]) {
    const refused = await status(url, "/api/usages?id=domain.order.create", headers);
    assert.equal(refused.status, 403, JSON.stringify(headers));
    assert.doesNotMatch(refused.body, /checkout/);
  }
});

/** A request with a method, headers and a body: what `status` sends without one. */
function send(url: URL, method: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, method, headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) } }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, type: String(res.headers["content-type"] ?? "") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

type CallsJson = {
  id: string;
  node: { kind: string } | null;
  entries: { kind: string; label: string }[];
  callees: { id: string; via?: string; site?: string; closure?: true; at: { file: string; line: number }; calls: number; holes: number; callers: number }[];
  holes: { kind: string; reason: string; text: string; at: { file: string; line: number; col: number } }[];
  callers: { id: string; via?: string; entries: { kind: string; label: string }[] }[];
  reachedFrom: { id: string; kind: string; label: string; steps: number }[];
  reason?: string;
};

test("web: /api/ids lists the snapshot's IDs under a prefix for the editor's ID field, in text order, behind the same token (business-flows/23)", async (t) => {
  const repo = diagramsRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const answer = await status(url, "/api/ids?prefix=application.purchase", bearer);
  assert.equal(answer.status, 200, answer.body);
  assert.match(answer.type, /^application\/json/);
  assert.deepEqual(JSON.parse(answer.body), {
    prefix: "application.purchase",
    ids: [
      { id: "application.purchase", kind: "module" },
      { id: "application.purchase.buy", kind: "fn" },
    ],
    more: false,
  });
  const all = JSON.parse((await status(url, "/api/ids", bearer)).body) as { prefix: string; ids: { id: string; kind: string }[] };
  assert.equal(all.prefix, "");
  assert.ok(all.ids.some((i) => i.id === "domain" && i.kind === "layer"), JSON.stringify(all.ids));
  assert.deepEqual(
    all.ids.map((i) => i.id),
    [...all.ids.map((i) => i.id)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  assert.deepEqual(JSON.parse((await status(url, "/api/ids?prefix=nowhere.", bearer)).body), { prefix: "nowhere.", ids: [], more: false });
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { ...bearer, Origin: "http://evil.example" }]) {
    const refused = await status(url, "/api/ids?prefix=application", headers);
    assert.equal(refused.status, 403, JSON.stringify(headers));
    assert.doesNotMatch(refused.body, /purchase/);
  }
  assert.equal((await status(url, `/api/ids?prefix=application&t=${tokenOf(url)}`)).status, 403, "a token in the query is not accepted");
});

test("web: /api/calls opens one level of the call tree — callees with via and site, holes with reasons, callers and the entry points above — in TypeScript and Python, behind the token (business-flows/22)", async (t) => {
  const repo = explorerRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const calls = async (id: string): Promise<CallsJson> => {
    const res = await status(url, `/api/calls?id=${encodeURIComponent(id)}`, bearer);
    assert.equal(res.status, 200, res.body);
    assert.match(res.type, /^application\/json/);
    return JSON.parse(res.body) as CallsJson;
  };
  const pay = await calls("app.handlers.pay");
  assert.deepEqual(pay.entries, [{ kind: "route", label: "POST /pay" }]);
  // In the order the code writes them; the call inside the closure passed to `withLock` says so.
  assert.deepEqual(
    pay.callees.map((c) => [c.id, c.via ?? null, c.site ?? null, c.closure ?? null, c.at.line, c.calls, c.holes, c.callers]),
    [
      ["billing.lock.withLock", null, null, null, 4, 0, 1, 1],
      ["billing.charge.charge", "closure-arg", "src/app/handlers.ts:4:12", true, 4, 1, 0, 1],
    ],
  );
  assert.deepEqual(pay.holes, [{ kind: "unresolved", reason: "call through a local value `gateway.refund`", text: "gateway.refund", at: { file: "src/app/handlers.ts", line: 6, col: 3 } }]);
  assert.deepEqual(pay.callers, []);
  assert.deepEqual(pay.reachedFrom, [{ id: "app.handlers.pay", kind: "route", label: "POST /pay", steps: 0 }]);
  // Upwards: who calls `write`, and the entry point three calls above it.
  const write = await calls("billing.audit.write");
  assert.deepEqual(write.callees, []);
  assert.deepEqual(write.callers.map((c) => c.id), ["billing.audit.audit"]);
  assert.deepEqual(write.reachedFrom, [{ id: "app.handlers.pay", kind: "route", label: "POST /pay", steps: 3 }]);
  const charge = await calls("billing.charge.charge");
  assert.deepEqual(charge.callers.map((c) => [c.id, c.via, c.entries]), [["app.handlers.pay", "closure-arg", [{ kind: "route", label: "POST /pay" }]]]);
  // Python: `main` passes `helper` to `apply` (a callable reference), and `apply` calls through its parameter.
  const main = await calls("shop.cli.main");
  assert.deepEqual(main.entries, [{ kind: "cli", label: "shop-py" }]);
  assert.deepEqual(main.callees.map((c) => [c.id, c.via ?? null]), [["shop.cli.apply", null], ["shop.cli.helper", "callable-arg"]]);
  assert.deepEqual((await calls("shop.cli.apply")).holes.map((h) => h.reason), ["call through a local value `f`"]);
  assert.deepEqual((await calls("shop.cli.store")).reachedFrom, [{ id: "shop.cli.main", kind: "cli", label: "shop-py", steps: 2 }]);
  const unknown = await calls("no.such.fn");
  assert.equal(unknown.node, null);
  assert.match(unknown.reason ?? "", /no fn `no\.such\.fn`/);
  assert.equal((await status(url, "/api/calls", bearer)).status, 400);
  // Without events in the snapshot, the views say why (business-flows/08 brings them).
  const views = JSON.parse((await status(url, "/api/views", bearer)).body) as { events: unknown[]; eventsReason?: string };
  assert.deepEqual(views.events, []);
  assert.match(views.eventsReason ?? "", /no event nodes/);
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { ...bearer, Origin: "http://evil.example" }]) {
    const refused = await status(url, "/api/calls?id=app.handlers.pay", headers);
    assert.equal(refused.status, 403, JSON.stringify(headers));
    assert.doesNotMatch(refused.body, /charge/);
  }
});

test("web: on a Magento repository /api/views lists the events and the framework's entry points; /api/diagram draws an event; /api/calls opens one (business-flows/08, 10)", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "keylang-web-magento-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/magento-shop"), repo, { recursive: true });
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const views = JSON.parse((await status(url, "/api/views", bearer)).body) as { events: { id: string; publishers: number; subscribers: number }[]; eventsReason?: string; entries: { kind: string; label: string }[]; layers: string[] };
  assert.equal(views.eventsReason, undefined);
  assert.deepEqual(views.events.map((e) => [e.id, e.publishers, e.subscribers]), [
    ["events.checkout_submit_all_after", 1, 1],
    ["events.checkout_submit_before", 1, 2],
    ["events.sales-order-place_after", 0, 0],
  ]);
  assert.deepEqual([...new Set(views.entries.map((e) => e.kind))], ["cli", "consumer", "cron", "graphql", "observer", "rest", "route"]);
  assert.ok(views.entries.some((e) => e.kind === "rest" && e.label === "POST /V1/orders/:id/place [Shop_Sales::place, self]"));
  assert.ok(views.layers.includes("events"));
  const diagram = JSON.parse((await status(url, "/api/diagram?view=event&name=checkout_submit_before", bearer)).body) as { nodes: { id: string; kind: string; group?: string }[]; edges: { from: string; to: string; kind: string; label?: string }[] };
  assert.deepEqual(diagram.edges.map((e) => [e.from, e.to, e.kind, e.label]), [
    ["fn:checkout.Model.QuoteManagement.QuoteManagement.submit", "event:events.checkout_submit_before", "emits", "dispatch"],
    ["event:events.checkout_submit_before", "fn:checkout.Observer.FrontendGuard.FrontendGuard.guard", "call", "observer frontend_guard (frontend)"],
    ["event:events.checkout_submit_before", "fn:promo.Observer.AuditSubmit.AuditSubmit.execute", "call", "observer promo_audit (adminhtml)"],
  ]);
  const event = JSON.parse((await status(url, "/api/calls?id=events.checkout_submit_before", bearer)).body) as CallsJson;
  assert.equal(event.node?.kind, "event");
  assert.deepEqual(event.callees.map((c) => [c.id, c.via]), [
    ["checkout.Observer.FrontendGuard.FrontendGuard.guard", "observer"],
    ["promo.Observer.AuditSubmit.AuditSubmit.execute", "observer"],
  ]);
  assert.deepEqual(event.callers.map((c) => [c.id, c.via]), [["checkout.Model.QuoteManagement.QuoteManagement.submit", "dispatch"]]);
  // Up from an observer: through the event to the GraphQL-less submit, no entry above it but the observer itself.
  const observer = JSON.parse((await status(url, "/api/calls?id=promo.Observer.AuditSubmit.AuditSubmit.execute", bearer)).body) as CallsJson;
  assert.deepEqual(observer.entries, [{ kind: "observer", label: "checkout_submit_before (promo_audit, adminhtml)" }]);
});

test("web: /api/coverage answers the payload of `keylang coverage --json` behind the token (business-flows/13, 22)", async (t) => {
  const repo = explorerRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const res = await status(url, "/api/coverage", bearer);
  assert.equal(res.status, 200, res.body);
  const report = JSON.parse(res.body) as { snapshotId: string; reach: { fns: number; reachable: number; entries: number }; orphans: { id: string }[]; holes: { total: number; modules: { module: string }[] }; unflowed: { id: string }[]; dataLogic: { signals: unknown[]; sites: unknown[] }; text?: string };
  assert.deepEqual(Object.keys(report), ["snapshotId", "reach", "orphans", "holes", "unflowed", "dataLogic"]);
  // The same JSON the CLI prints.
  const cli = spawnSync(process.execPath, [bin, "coverage", "--json"], { cwd: repo, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(report, JSON.parse(cli.stdout));
  assert.equal(report.reach.entries, 3);
  assert.equal(report.holes.total, 3);
  assert.deepEqual(report.unflowed.map((u) => u.id), ["shop.cli.main", "app.handlers.listOrders", "app.handlers.pay"]);
  assert.equal((await status(url, "/api/coverage")).status, 403);
  assert.equal((await status(url, "/api/coverage", { ...bearer, Origin: "http://evil.example" })).status, 403);
});

test("web: POST /api/flow-proposal writes one proposal of the ticked branches that `keylang proposals` lists; it needs the token, JSON and the same origin, and refuses a generated target like `flows adopt` (business-flows/22)", async (t) => {
  const generated = "<!-- keylang:generated — не редагувати, `keylang map` -->\n\n# flow gen\n\n- trigger app.handlers.pay\n";
  const repo = explorerRepo(t, { "keylang/flows/gen.md": generated });
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${tokenOf(url)}` };
  const json = { "Content-Type": "application/json" };
  const body = JSON.stringify({ name: "pay", trigger: "app.handlers.pay", steps: [{ id: "billing.charge.charge", steps: [{ id: "billing.audit.audit", steps: ["billing.audit.write"] }] }] });
  const post = (headers: Record<string, string>, text = body): Promise<{ status: number; body: string }> => send(url, "POST", "/api/flow-proposal", headers, text);
  const store = join(repo, ".keylang/proposals");
  // CSRF: no token, another token, another origin, another site — 403; a form's content type — 415; GET — 405. Nothing written.
  for (const headers of [json, { ...json, Authorization: "Bearer wrong" }, { ...json, ...bearer, Origin: "http://evil.example" }, { ...json, ...bearer, "Sec-Fetch-Site": "cross-site" }]) assert.equal((await post(headers)).status, 403, JSON.stringify(headers));
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) assert.equal((await post({ ...bearer, "Content-Type": type })).status, 415, type);
  assert.equal((await post(bearer)).status, 415, "no content type");
  assert.equal((await send(url, "GET", "/api/flow-proposal", bearer, "")).status, 405);
  assert.equal(existsSync(store), false);
  // A body that names no flow, a step the tree does not have: 400.
  assert.equal((await post({ ...json, ...bearer }, "{")).status, 400);
  assert.match((await post({ ...json, ...bearer }, JSON.stringify({ name: "../x", trigger: "app.handlers.pay", steps: [] }))).body, /name: a flow name/);
  const skipped = await post({ ...json, ...bearer }, JSON.stringify({ name: "pay", trigger: "app.handlers.pay", steps: ["billing.audit.audit"] }));
  assert.equal(skipped.status, 400);
  assert.match(skipped.body, /`app\.handlers\.pay` does not call it/);
  // A generated target is refused as `flows adopt` refuses it.
  const refused = await post({ ...json, ...bearer }, JSON.stringify({ name: "gen", trigger: "app.handlers.pay", steps: [] }));
  assert.equal(refused.status, 409, refused.body);
  assert.match(refused.body, /keylang\/flows\/gen\.md: a generated file/);
  assert.equal(existsSync(store), false);
  // The tree as one proposal, with its provenance; the response says how to merge it.
  const made = await post({ ...json, ...bearer, Origin: `http://${url.host}`, "Sec-Fetch-Site": "same-origin" });
  assert.equal(made.status, 200, made.body);
  const answer = JSON.parse(made.body) as { proposal: string; target: string; steps: string[]; merge: string };
  assert.equal(answer.proposal, ".keylang/proposals/keylang/flows/pay.md");
  assert.equal(answer.target, "keylang/flows/pay.md");
  assert.deepEqual(answer.steps, ["app.handlers.pay", "billing.charge.charge", "billing.audit.audit", "billing.audit.write"]);
  assert.match(answer.merge, /MERGE in the TUI/);
  assert.match(answer.merge, /keylang proposals accept keylang\/flows\/pay\.md/);
  assert.equal(
    readFileSync(join(repo, answer.proposal), "utf8"),
    [
      "# flow pay",
      "",
      "<!-- keylang:web explorer -->",
      "",
      "- trigger route app.handlers.pay <!-- keylang:algo unresolved: gateway.refund (src/app/handlers.ts:6) -->",
      "  - step billing.charge.charge <!-- keylang:algo via closure -->",
      "    - step billing.audit.audit",
      "      - step billing.audit.write",
      "",
    ].join("\n"),
  );
  assert.equal(existsSync(join(repo, "keylang/flows/pay.md")), false, "a proposal, not the spec");
  assert.deepEqual(
    readdirSync(store, { recursive: true }).filter((p) => String(p).endsWith(".md")),
    [join("keylang", "flows", "pay.md")],
  );
  const listed = spawnSync(process.execPath, [bin, "proposals"], { cwd: repo, encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, "keylang/flows/pay.md: +8 -0 (new file)\n");
  // A second save while it waits is refused, as `flows adopt` refuses it.
  const again = await post({ ...json, ...bearer });
  assert.equal(again.status, 409);
  assert.match(again.body, /a proposal for keylang\/flows\/pay\.md is waiting/);
  // Python: a callable passed as an argument keeps its `via`.
  const py = await post({ ...json, ...bearer }, JSON.stringify({ name: "shop", trigger: "shop.cli.main", steps: [{ id: "shop.cli.helper", steps: [{ id: "shop.cli.store" }] }] }));
  assert.equal(py.status, 200, py.body);
  assert.match(readFileSync(join(repo, ".keylang/proposals/keylang/flows/shop.md"), "utf8"), /^ {2}- step shop\.cli\.helper <!-- keylang:algo via callable -->\n {4}- step shop\.cli\.store\n$/m);
  // Accepted, the flow is a spec `check` reads.
  assert.equal(spawnSync(process.execPath, [bin, "proposals", "accept", "keylang/flows/pay.md"], { cwd: repo, encoding: "utf8" }).status, 0);
  const check = spawnSync(process.execPath, [bin, "check"], { cwd: repo, encoding: "utf8" });
  assert.match(check.stdout, /pay/, check.stdout + check.stderr);
  assert.doesNotMatch(check.stdout, /K0\d\d .*pay\.md/);
});
