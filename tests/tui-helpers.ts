// Shared by the tui-*.test.ts files: a session on a virtual terminal, waits,
// temp repositories and snapshots of their files, mock models and a fake
// terminal, and the forms, records and CLI runs of the operations that tests
// in more than one of those files drive.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { analyze, type Analysis, type AnalysisRequest } from "../src/analyze.ts";
import { runOperation, type OperationResult } from "../src/operations.ts";
import { App, type AppOptions } from "../src/tui/app.ts";
import { OperationWorker } from "../src/tui/background.ts";
import type { TerminalHost, TerminalSignal } from "../src/tui/terminal.ts";
import { checkoutRepo, CHECKOUT_FLOW, KEY, tempHome } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

/** `home`: the user's home of the session, for two sessions that share the clip's place; default: one of its own (`tempHome`). */
export function session(root: string, options: { cols?: number; rows?: number; analyzer?: (request: AnalysisRequest) => Promise<Analysis>; operations?: AppOptions["operations"]; microphone?: AppOptions["microphone"]; onQuit?: AppOptions["onQuit"]; home?: string } = {}): { app: App; vt: VirtualTerminal; send: (keys: string) => void; lines: () => string[]; text: () => string } {
  const cols = options.cols ?? 110;
  const rows = options.rows ?? 30;
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows, home: options.home ?? tempHome(), ...(options.analyzer ? { analyzer: options.analyzer } : {}), ...(options.operations ? { operations: options.operations } : {}), ...(options.microphone ? { microphone: options.microphone } : {}), ...(options.onQuit ? { onQuit: options.onQuit } : {}) });
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
  return { app, vt, send: (keys) => app.input(keys), lines: () => vt.lines(), text: () => vt.text() };
}

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export const DENY_RULES = "# rules\n\n- layers domain < infrastructure < application < presentation\n- deny application infrastructure\n";

export function propose(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, ".keylang/proposals", path)), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals", path), text);
}

export const FLOW_PATH = "keylang/flows/checkout.md";

export const PAID = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal, paid by card.");

/**
 * A Messages API stand-in in this process: the TUI runs here too. `reply`
 * is the answer, or makes it from the prompt; `delay` holds each answer
 * back; `aborted` counts the requests whose connection the client dropped
 * before the answer.
 */
export async function mockModel(t: { after: (f: () => void) => void }, reply: string | ((prompt: string) => string), delay = 0): Promise<{ prompts: string[]; aborted: number }> {
  const model = { prompts: [] as string[], aborted: 0 };
  const server = createServer((req, res) => {
    let data = "";
    let timer: NodeJS.Timeout | null = null;
    res.on("close", () => {
      if (res.writableEnded) return;
      if (timer) clearTimeout(timer);
      model.aborted++;
    });
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const prompt = (JSON.parse(data) as { messages: { content: string }[] }).messages[0]!.content;
      model.prompts.push(prompt);
      const text = typeof reply === "string" ? reply : reply(prompt);
      timer = setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }, delay);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { url: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  t.after(() => {
    server.close();
    if (saved.url === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
  });
  return model;
}

export async function waitUntil(check: () => boolean, what: string, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

export function withConfig(root: string, extra: Record<string, unknown>): void {
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), ...extra }));
}

export const REFUND = "# flow refund\n\n- trigger application.purchase.buy\n";

/** A terminal and a process for `runTerminal`: what it writes, and a way to send it keys, signals and crashes. */
export function fakeTerminal(env: NodeJS.ProcessEnv = {}): { host: TerminalHost; out: string[]; err: string[]; raw: () => boolean; suspended: () => number; type: (keys: string) => void; signal: (signal: TerminalSignal) => void; crash: (error: unknown) => void; resize: () => void } {
  let raw = false;
  let suspended = 0;
  const out: string[] = [];
  const err: string[] = [];
  const stdin = Object.assign(new EventEmitter(), { isTTY: true, setRawMode: (value: boolean) => (raw = value), setEncoding: () => {}, pause: () => {}, resume: () => {} });
  const stdout = Object.assign(new EventEmitter(), { columns: 100, rows: 30, write: (text: string) => out.push(text) });
  let handlers: { onSignal: (signal: TerminalSignal) => void; onCrash: (error: unknown) => void } | null = null;
  const host: TerminalHost = {
    stdin,
    stdout,
    stderr: (text) => void err.push(text),
    env,
    listen: (onSignal, onCrash) => {
      handlers = { onSignal, onCrash };
      return () => (handlers = null);
    },
    suspend: () => void suspended++,
  };
  return {
    host,
    out,
    err,
    raw: () => raw,
    suspended: () => suspended,
    type: (keys) => void stdin.emit("data", keys),
    signal: (signal) => handlers?.onSignal(signal),
    crash: (error) => handlers?.onCrash(error),
    resize: () => void stdout.emit("resize"),
  };
}

/** Every file under `root` with its bytes: a session that must write nothing leaves this unchanged. */
export function treeBytes(root: string): Map<string, string> {
  const out = new Map<string, string>();
  // The local fact cache is left out: the check and feature operations save it for the next run (cli.md).
  const cache = join(root, ".keylang/cache");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (abs === cache) continue;
      if (entry.isDirectory()) walk(abs);
      else out.set(abs.slice(root.length + 1), readFileSync(abs, "latin1"));
    }
    if (dir !== root && readdirSync(dir).length === 0) out.set(`${dir.slice(root.length + 1)}/`, "");
  };
  walk(root);
  return out;
}

/** The tree but the clip's log of the conversation (`.keylang/chat/`): what a chat that writes no proposal leaves as it was. */
export function withoutChatLog(tree: Map<string, string>): Map<string, string> {
  return new Map([...tree].filter(([path]) => !path.startsWith(".keylang/chat/")));
}

/** Read through a function, so the assertions on a changing state do not narrow its type. */
export function configKind(app: App): string {
  return app.state.config.kind;
}

export function promptNote(app: App): string {
  return app.state.prompt?.note ?? "";
}

/** A temp repository with `files` and nothing else. */
export function repoWith(t: { after: (f: () => void) => void }, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-tui-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** The shared analyzer, counting its runs. */
export function countingAnalyzer(): { analyzer: (request: AnalysisRequest) => Promise<Analysis>; calls: () => number } {
  let calls = 0;
  return {
    analyzer: (request) => {
      calls++;
      return analyze(request);
    },
    calls: () => calls,
  };
}

export const FEATURES: Record<string, string> = {
  // Every step statically ok: done (trace stays informational).
  "keylang/features/buy.md": "# flow buy\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n  - step domain.order.create\n",
  // A planned fn not yet in the code: a planned gap and its static gap.
  "keylang/features/refund.md": "# flow refund\n\n- planned fn application.purchase.refund () → void\n- trigger presentation.terminal.checkout\n  - step application.purchase.refund\n",
  // A step its trigger never calls: a static gap.
  "keylang/features/skip.md": "# flow skip\n\n- trigger domain.order.create\n  - step infrastructure.store.save\n",
};

export const BIN = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");

/** The palette's feature action: its form opens with the slug of the current feature file, or empty. */
export function featureForm(send: (keys: string) => void): void {
  send(KEY.ctrlP);
  for (const ch of "feature readiness") send(ch);
  send(KEY.enter);
}

/** Replaces the form's text with `slug` and submits it. */
export function submitSlug(app: App, send: (keys: string) => void, slug: string): void {
  for (const _ of app.state.prompt!.text) send("\x7f");
  for (const ch of slug) send(ch);
  send(KEY.enter);
}

/** Esc alone: the decoder waits a moment for the rest of an escape sequence. */
export async function esc(send: (keys: string) => void): Promise<void> {
  send("\x1b");
  await sleep(40);
}

export const GATE_WORKER = new URL("./operation-worker-gate.ts", import.meta.url);

/** A worker entry blocked until `open()`: the real operation worker behind a shared gate. */
export function gatedWorker(): { worker: OperationWorker; open: () => void } {
  const gate = new SharedArrayBuffer(4);
  return {
    worker: new OperationWorker({ entry: GATE_WORKER, workerData: { gate } }),
    open: () => {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
    },
  };
}

export function cliMapCheck(root: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "map", "--check"], { cwd: root, encoding: "utf8" });
}

export function mapCheck(send: (keys: string) => void): void {
  send(KEY.ctrlP);
  for (const ch of "map check") send(ch);
  send(KEY.enter);
}

/** The repository's files with the index's `generated` time taken out: what two runs must share. */
export function artifacts(root: string): Map<string, string> {
  const tree = treeBytes(root);
  const index = tree.get(".keylang/index.json");
  if (index !== undefined) tree.set(".keylang/index.json", index.replace(/"generated": "[^"]*"/, '"generated": "…"'));
  return tree;
}

/** A runner that calls the shared operation on this thread, with `pause` run at the commit barrier before the session hears of it. */
export function pausedRunner(pause: () => void | Promise<void>, onProgress?: (text: string) => void): NonNullable<AppOptions["operations"]> {
  return (request, context) =>
    runOperation(request, {
      ...context,
      onProgress: (progress) => {
        context.onProgress?.(progress);
        onProgress?.(progress.text);
      },
      beforeCommit: async () => {
        await pause();
        await context.beforeCommit?.();
      },
    });
}

export const stdoutOf = (result: OperationResult): string => result.messages.filter((m) => m.level === "info").map((m) => `${m.text}\n`).join("");

export function isDirtyBuffer(app: App, path: string): boolean {
  const buffer = app.state.buffers.get(path)!;
  return buffer.text !== buffer.saved;
}

export function checkPayload(record: App["state"]["records"][number] | undefined): NonNullable<Extract<OperationResult, { kind: "check" }>["payload"]> {
  const result = record?.result;
  assert.ok(result?.kind === "check" && result.payload !== null, JSON.stringify(result?.messages));
  return result.payload;
}

/** What `keylang check --format json` prints, from a record's payload. */
export function checkJson(record: App["state"]["records"][number] | undefined): unknown {
  const payload = checkPayload(record);
  return { snapshotId: payload.snapshotId, results: payload.results, coverage: payload.coverage };
}

/** Git in a temp repository, as an argument array; commits need a name, never the user's config. */
export function gitRun(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

/** The working tree without `.git`: what a read-only check must leave byte for byte. */
export function workTree(root: string): Map<string, string> {
  return new Map([...treeBytes(root)].filter(([path]) => path !== ".git" && !path.startsWith(".git/")));
}

/** The checkout repository committed once: the base `HEAD` of a changed check. */
export function committedCheckout(t: { after: (f: () => void) => void }, specs: Record<string, string> = {}): string {
  const root = checkoutRepo(t, specs);
  gitRun(root, ["init", "-q"]);
  gitRun(root, ["add", "."]);
  gitRun(root, ["commit", "-q", "-m", "base"]);
  return root;
}

/** The palette's parse form; `paths` replaces the default text when given, then the view. */
export function parseForm(s: ReturnType<typeof session>, view: "tree" | "json", paths?: string): void {
  s.send(KEY.ctrlP);
  for (const ch of "keylang parse") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "parse", s.app.state.message ?? "");
  if (paths !== undefined) {
    for (const _ of s.app.state.prompt!.text) s.send("\x7f");
    for (const ch of paths) s.send(ch);
  }
  if (view === "json") s.send(KEY.down);
  s.send(KEY.enter);
}

/** Moves the draft form's selection to the row `id`. */
export function draftRow(s: ReturnType<typeof session>, id: string): void {
  const prompt = s.app.state.prompt!;
  for (let i = 0; i < 20 && prompt.ids?.[prompt.index] !== id; i++) s.send(KEY.down);
  assert.equal(prompt.ids?.[prompt.index], id, JSON.stringify(prompt.ids));
}

/** Replaces the text of a field row of the draft form. */
export function draftField(s: ReturnType<typeof session>, id: "trigger" | "name" | "into", text: string): void {
  draftRow(s, id);
  for (const _ of s.app.state.prompt!.draft![id]) s.send("\x7f");
  for (const ch of text) s.send(ch);
}

/** The palette's draft-flow form with the given fields; Enter on the run row. */
export function draftForm(s: ReturnType<typeof session>, fields: { trigger: string; name?: string; into?: string; mode?: "algo" | "hybrid" | "llm"; output?: "proposal" | "preview" }): void {
  s.send(KEY.ctrlP);
  for (const ch of "draft flow") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "draft-flow", s.app.state.message ?? "");
  draftField(s, "trigger", fields.trigger);
  if (fields.name !== undefined) draftField(s, "name", fields.name);
  if (fields.into !== undefined) draftField(s, "into", fields.into);
  if (fields.mode !== undefined && fields.mode !== s.app.state.prompt!.draft!.mode) {
    draftRow(s, "mode");
    for (let i = 0; i < 3 && s.app.state.prompt!.draft!.mode !== fields.mode; i++) s.send(KEY.right);
    assert.equal(s.app.state.prompt!.draft!.mode, fields.mode);
  }
  if ((fields.output ?? "proposal") !== s.app.state.prompt!.draft!.output) {
    draftRow(s, "output");
    s.send(KEY.right);
  }
  draftRow(s, "run");
  s.send(KEY.enter);
}

export const BUY_ANSWER = "```markdown\n# flow buy\n\n- trigger application.purchase.buy\n  - step domain.order.create\n  - step infrastructure.store.save\n```";

/**
 * A Messages API stand-in that holds every answer until `release`; the TUI's
 * operation worker reaches it through the environment set here, before the
 * session starts. `dropped` counts requests the client closed unanswered.
 */
export async function heldModel(t: { after: (f: () => void) => void }, reply: string | ((prompt: string) => string)): Promise<{ prompts: string[]; requested: (n: number) => Promise<void>; release: () => void; dropped: () => number }> {
  const prompts: string[] = [];
  const held: (() => void)[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  let dropped = 0;
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const prompt = (JSON.parse(data) as { messages: { content: string }[] }).messages[0]!.content;
      prompts.push(prompt);
      for (const waiter of waiters) if (prompts.length >= waiter.n) waiter.resolve();
      const text = typeof reply === "string" ? reply : reply(prompt);
      held.push(() => {
        if (res.destroyed) return;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      });
    });
    res.on("close", () => {
      if (!res.writableEnded) dropped++;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { url: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  t.after(() => {
    server.closeAllConnections();
    server.close();
    if (saved.url === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
  });
  return {
    prompts,
    requested: (n) => (prompts.length >= n ? Promise.resolve() : new Promise<void>((resolve) => waiters.push({ n, resolve }))),
    release: () => {
      for (const answer of held.splice(0)) answer();
    },
    dropped: () => dropped,
  };
}

/** Releases the held model's answers one request at a time until `done` settles. */
export async function answerAll<T>(model: Awaited<ReturnType<typeof heldModel>>, done: Promise<T>): Promise<T> {
  let settled = false;
  void done.then(() => (settled = true));
  while (!settled) {
    model.release();
    await sleep(20);
  }
  return done;
}

/** The node a brief request is about: the first line of its summary. */
export function askedId(prompt: string): string {
  if (prompt.startsWith("Repository: ")) return "@system";
  return /^Node:\n(?:planned )?\S+ (\S+)/.exec(prompt)?.[1] ?? "?";
}

/** The palette's batch: the inventory form on its batch row; `limit` and `jobs` typed into their rows, then back to the batch row; Enter unless `submit` is false. */
export function explainBatchForm(s: ReturnType<typeof session>, options: { limit?: string; jobs?: string; submit?: boolean } = {}): void {
  s.send(KEY.ctrlP);
  for (const ch of "explain --missing --llm") s.send(ch);
  s.send(KEY.enter);
  const prompt = (): NonNullable<typeof s.app.state.prompt> => s.app.state.prompt!;
  assert.ok(s.app.state.prompt?.kind === "explain" && s.app.state.prompt.explainPlan?.list === "missing", s.app.state.message ?? "");
  assert.equal(prompt().ids![prompt().index], "batch");
  for (const [row, value] of [["limit", options.limit], ["jobs", options.jobs]] as const) {
    if (value === undefined) continue;
    while (prompt().ids![prompt().index] !== row) s.send(KEY.up);
    for (const ch of value) s.send(ch);
  }
  while (prompt().ids![prompt().index] !== "batch") s.send(KEY.down);
  if (options.submit !== false) s.send(KEY.enter);
}

export const briefReply = (prompt: string): string => `Brief of ${askedId(prompt)}.`;
