// `keylang explain <id>`: the offline summary of a node (ticket m5-m7/12)
// and the LLM explanation with its cache (m5-m7/13), through the real CLI.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[], env: Record<string, string | undefined> = {}): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function copy(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-explain-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  return dir;
}

test("explain <id>: an offline summary of the node from the snapshot and the specs", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["explain", "app.checkout.checkout"]);
  assert.equal(o.status, 0, o.stderr);
  const lines = o.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "fn app.checkout.checkout (id: string, items: number[]) → Order");
  assert.equal(lines[1], "src/app/checkout.ts:4 · exported");
  assert.ok(lines.includes("calls: domain.order.createOrder, infra.db.save"), o.stdout);
  assert.ok(lines.some((line) => /^rule keylang\/rules\.md:\d+: app\.checkout$/.test(line)), "the `entry` rule names the module around it");
  assert.match(o.stdout, /^fingerprint [0-9a-f]{12} · closure [0-9a-f]{12}( \(incomplete\))?$/m);
});

test("explain <id>: an unknown id is exit 2 with the nearest id; a code is explained as before", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["explain", "app.checkout.chekout"]);
  assert.equal(o.status, 2);
  assert.equal(o.stdout, "");
  assert.equal(o.stderr, "keylang: unknown id `app.checkout.chekout` (did you mean `app.checkout.checkout`?)\n");
  assert.match(keylang(dir, ["explain", "K001"]).stdout, /^K001: /);
});

interface Mock {
  url: string;
  requests: { path: string; body: { model: string; system: string; messages: { content: string }[] } }[];
  reply: string;
}

/** A local stand-in for the Messages API: no network, answers with `mock.reply`. */
async function mockAnthropic(t: TestContext): Promise<Mock> {
  const mock: Mock = { url: "", requests: [], reply: "" };
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      mock.requests.push({ path: req.url ?? "", body: JSON.parse(data) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: mock.reply }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return mock;
}

/** `keylang` without blocking this process: the mock server answers while the CLI waits. */
function keylangAsync(cwd: string, args: string[], env: Record<string, string | undefined>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function withAgent(dir: string): void {
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), agent: "anthropic:claude-opus-5", explain: { lang: "uk" } }));
}

test("explain --llm: asks the model once, saves the answer with its baseline, reads it offline; a code change makes it stale", async (t) => {
  const dir = copy(t);
  withAgent(dir);
  const mock = await mockAnthropic(t);
  mock.reply = "Створює замовлення через `domain.order.createOrder` і зберігає його в `infra.db.save`; `infra.db.missing` вигадано.";
  const env = { ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir };
  const first = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], env);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(mock.requests.length, 1);
  const request = mock.requests[0]!;
  assert.equal(request.path, "/v1/messages?beta=true");
  assert.equal((request.body as { fallbacks?: unknown }).fallbacks, "default", "a declined request is re-run server-side");
  assert.equal(request.body.model, "claude-opus-5");
  assert.match(request.body.system, /language with code `uk`/);
  assert.match(request.body.messages[0]!.content, /export function checkout/, "the node's code goes to the model");
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(first.stdout.includes(`anthropic:claude-opus-5 · ${date} · fresh`), first.stdout);
  // An ID the model made up is shown as such, not trusted.
  assert.match(first.stdout, /^unknown ids: infra\.db\.missing$/m);

  const again = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], env);
  assert.equal(again.status, 0);
  assert.equal(mock.requests.length, 1, "a fresh explanation is read from keylang/explain/, not asked for again");
  assert.ok(existsSync(join(dir, "keylang/explain/app.checkout.checkout.md")));

  // A body change moves the closure fingerprint: the explanation is stale, `check` does not change.
  const before = keylang(dir, ["check"]).stdout;
  writeFileSync(join(dir, "src/infra/db.ts"), readFileSync(join(dir, "src/infra/db.ts"), "utf8").replace('"orders.json"', '"orders-v2.json"'));
  const offline = keylang(dir, ["explain", "app.checkout.checkout"], { ANTHROPIC_BASE_URL: "http://127.0.0.1:9", HOME: dir });
  assert.match(offline.stdout, new RegExp(`anthropic:claude-opus-5 · ${date} · stale`));
  assert.equal(keylang(dir, ["explain", "--stale"]).stdout, "app.checkout.checkout: stale (explained " + date + "); run `keylang explain app.checkout.checkout --llm`\n");
  assert.equal(keylang(dir, ["check"]).stdout, before, "an explanation never changes a verdict");
});

test("explain --llm without credentials: a clear message and the offline summary, exit 0, no request", (t) => {
  const dir = copy(t);
  withAgent(dir);
  const o = keylang(dir, ["explain", "app.checkout.checkout", "--llm"], { ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir, ANTHROPIC_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stderr, /no Anthropic credentials: set ANTHROPIC_API_KEY/);
  assert.match(o.stdout, /^fn app\.checkout\.checkout /);
});

test("explain --llm through openrouter: streamed SSE deltas are joined into one explanation", async (t) => {
  const dir = copy(t);
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), agent: "openrouter:some/model" }));
  const seen: { path: string; auth: string | undefined; body: { model: string; stream: boolean } }[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", auth: req.headers.authorization, body: JSON.parse(data) });
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const piece of ["Builds an order ", "and saves it."]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const o = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], { OPENROUTER_BASE_URL: url, OPENROUTER_API_KEY: "or-key", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.equal(seen[0]?.path, "/api/v1/chat/completions");
  assert.equal(seen[0]?.auth, "Bearer or-key");
  assert.deepEqual([seen[0]?.body.model, seen[0]?.body.stream], ["some/model", true]);
  assert.match(o.stdout, /^Builds an order and saves it\.\n\nopenrouter:some\/model · \d{4}-\d{2}-\d{2} · fresh$/m);
});

/** An OpenRouter stand-in whose handler writes the response as given. */
async function mockOpenRouter(t: TestContext, respond: (res: import("node:http").ServerResponse) => void): Promise<string> {
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => respond(res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("explain --llm: an answer without text, an OpenRouter error as plain JSON, broken SSE or a stalled stream is exit 2 with the provider named; nothing is saved", async (t) => {
  const dir = copy(t);
  withAgent(dir);
  const mock = await mockAnthropic(t);
  mock.reply = "";
  const empty = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], { ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(empty.status, 2, empty.stdout);
  assert.match(empty.stderr, /claude-opus-5 answered without text/);

  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), agent: "openrouter:some/model" }));
  const env = { OPENROUTER_API_KEY: "or-key", HOME: dir };
  // Only the stalled stream waits for the timeout; the others answer at once, so a loaded machine gets room.
  const cases: [string, (res: import("node:http").ServerResponse) => void, RegExp, string][] = [
    ["JSON error", (res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "model is overloaded" } })), /^keylang: openrouter: model is overloaded$/m, "20000"],
    ["broken SSE", (res) => res.writeHead(200, { "content-type": "text/event-stream" }).end("data: {not json\n\n"), /^keylang: openrouter: invalid JSON in the stream: \{not json$/m, "20000"],
    ["stalled stream", (res) => res.writeHead(200, { "content-type": "text/event-stream" }).write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Build" } }] })}\n\n`), /^keylang: openrouter: no answer within 300 ms \(KEYLANG_LLM_TIMEOUT_MS\)$/m, "300"],
  ];
  for (const [what, respond, message, timeout] of cases) {
    const url = await mockOpenRouter(t, respond);
    const o = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], { ...env, OPENROUTER_BASE_URL: url, KEYLANG_LLM_TIMEOUT_MS: timeout });
    assert.equal(o.status, 2, `${what}: ${o.stdout}${o.stderr}`);
    assert.match(o.stderr, message, what);
  }
  assert.ok(!existsSync(join(dir, "keylang/explain")), "no empty explanation is kept as fresh");
  const bad = keylang(dir, ["explain", "app.checkout.checkout", "--llm"], { ...env, KEYLANG_LLM_TIMEOUT_MS: "soon" });
  assert.match(bad.stderr, /KEYLANG_LLM_TIMEOUT_MS must be a positive number of milliseconds/);
});

test("explain --llm: an Anthropic request that never answers ends within KEYLANG_LLM_TIMEOUT_MS, retries included", async (t) => {
  const dir = copy(t);
  withAgent(dir);
  let requests = 0;
  // Accepts the request and never answers: every SDK attempt times out, and the SDK would retry twice.
  const server = createServer(() => void requests++);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const started = performance.now();
  const o = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], { ANTHROPIC_BASE_URL: url, ANTHROPIC_API_KEY: "k", HOME: dir, KEYLANG_LLM_TIMEOUT_MS: "400" });
  const elapsed = performance.now() - started;
  assert.equal(o.status, 2, o.stdout);
  assert.match(o.stderr, /^keylang: anthropic: no answer within 400 ms \(KEYLANG_LLM_TIMEOUT_MS\)$/m);
  // The timeout bounds the call, retries included: the SDK never gets to a second attempt.
  // Counting requests is the proof; the wall clock of a whole CLI run depends on the machine's load.
  assert.equal(requests, 1, "one request: no retry after the timeout");
  // Three attempts with back-off would add seconds; a loose bound still catches a hang.
  assert.ok(elapsed < 10_000, `took ${Math.round(elapsed)} ms`);
});

test("explain --llm: a module's explanation goes stale when a member changes; code in backticks is not an unknown id; an empty key is no key", async (t) => {
  const dir = copy(t);
  withAgent(dir);
  const mock = await mockAnthropic(t);
  mock.reply = "Orders: `domain.order.createOrder` totals with `domain.order.total`; it reads `process.env` nowhere.";
  const env = { ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "k", HOME: dir };
  const first = await keylangAsync(dir, ["explain", "domain.order", "--llm"], env);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, / · fresh$/m);
  assert.doesNotMatch(first.stdout, /unknown ids/);
  const order = join(dir, "src/domain/order.ts");
  writeFileSync(order, readFileSync(order, "utf8").replace("a + b, 0", "a + b, 1"));
  assert.match(keylang(dir, ["explain", "domain.order"], env).stdout, / · stale$/m);
  assert.match(keylang(dir, ["explain", "--stale"]).stdout, /^domain\.order: stale/m);

  const noKey = keylang(dir, ["explain", "app.checkout.checkout", "--llm"], { ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir, ANTHROPIC_BASE_URL: "http://127.0.0.1:9" });
  assert.equal(noKey.status, 0);
  assert.match(noKey.stderr, /no Anthropic credentials/);
});

test("doctor: reports what is set up and what is optional, exit 0, nothing written", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["doctor"], { HOME: dir, OPENROUTER_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /^languages: typescript$/m);
  assert.match(o.stdout, /^agent: not configured/m);
  // Without a model file or a key there is no engine, whether the optional modules are installed or not.
  assert.match(o.stdout, /^voice: engine auto → (install the optional @fugood\/whisper\.node and put a model|put a model) .* or set OPENROUTER_API_KEY$/m);
  // Advice names only what is missing: an installed, loading whisper needs just a model.
  if (/^@fugood\/whisper\.node: installed$/m.test(o.stdout)) assert.match(o.stdout, /^voice: engine auto → put a model/m);
  assert.match(o.stdout, /^voice model: none in .*\.cache\/keylang\/models$/m);
  assert.match(o.stdout, /^@fugood\/whisper\.node: (installed|not installed \(optional\))$/m);
  assert.match(o.stdout, /^microphone \(decibri\): (installed|not installed \(optional; keylang web uses the browser's microphone\))$/m);
  assert.ok(!existsSync(join(dir, ".keylang/stats.json")));
});

test("explain --llm: an answer the token limit cut (stop_reason max_tokens, finish_reason length in JSON and SSE) is exit 2 naming the limit; nothing is saved", async (t) => {
  const dir = copy(t);
  withAgent(dir);
  const saved = join(dir, "keylang/explain/app.checkout.checkout.md");
  const cutText = "Функція підсумовує ціни позицій замовлення і повертає загальну су";
  const anthropic = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: cutText }], stop_reason: "max_tokens", stop_details: null, usage: { input_tokens: 10, output_tokens: 4096 } }));
    });
  });
  await new Promise<void>((resolve) => anthropic.listen(0, "127.0.0.1", resolve));
  t.after(() => anthropic.close());
  const cut = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], { ANTHROPIC_BASE_URL: `http://127.0.0.1:${(anthropic.address() as AddressInfo).port}`, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(cut.status, 2, cut.stdout);
  assert.match(cut.stderr, /^keylang: claude-opus-5: the answer was cut by the token limit \(max_tokens\)$/m);
  assert.doesNotMatch(cut.stdout, /загальну су/);
  assert.equal(existsSync(saved), false, "a cut answer is not saved as fresh");

  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), agent: "openrouter:some/model" }));
  const env = { OPENROUTER_API_KEY: "or-key", HOME: dir };
  const cases: [string, (res: import("node:http").ServerResponse) => void][] = [
    ["JSON", (res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: cutText }, finish_reason: "length" }] }))],
    ["SSE", (res) => res.writeHead(200, { "content-type": "text/event-stream" }).end(`data: ${JSON.stringify({ choices: [{ delta: { content: cutText }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`)],
  ];
  for (const [name, respond] of cases) {
    const url = await mockOpenRouter(t, respond);
    const o = await keylangAsync(dir, ["explain", "app.checkout.checkout", "--llm"], { ...env, OPENROUTER_BASE_URL: url });
    assert.equal(o.status, 2, `${name}: ${o.stdout}`);
    assert.match(o.stderr, /^keylang: openrouter: some\/model: the answer was cut by the token limit \(length\)$/m, name);
    assert.equal(existsSync(saved), false, name);
  }
});

// Real whisper.cpp needs a model file and a recording, which a checkout does
// not carry: set KEYLANG_TEST_WHISPER_MODEL (a ggml model) and
// KEYLANG_TEST_WHISPER_WAV (16 kHz mono s16le speech) to run it.
test("voice: local whisper.cpp transcribes a recording", { skip: !process.env.KEYLANG_TEST_WHISPER_MODEL || !process.env.KEYLANG_TEST_WHISPER_WAV }, async () => {
  const { transcribeLocal } = await import("../src/voice-local.ts");
  const wav = readFileSync(process.env.KEYLANG_TEST_WHISPER_WAV!);
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length));
  const text = await transcribeLocal(process.env.KEYLANG_TEST_WHISPER_MODEL!, pcm, []);
  assert.ok(text.split(/\s+/).length >= 3, text);
});

const CASE_TWINS: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript"], layers: { domain: "src/domain/**" }, agent: "anthropic:claude-opus-5" }),
  "src/domain/order.ts": "export interface Order {\n  id: string;\n}\n\nexport function order(id: string): Order {\n  return { id };\n}\n",
};

/** A Messages API stand-in whose n-th answer is `replies[n]`. */
async function mockReplies(t: TestContext, replies: string[]): Promise<string> {
  let n = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: replies[n++] ?? "?" }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("explain --llm: IDs that differ only in letter case get files whose names differ in more than case", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-explain-case-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(CASE_TWINS)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const env = { ANTHROPIC_BASE_URL: await mockReplies(t, ["The function order builds an order.", "The interface Order is a purchase."]), ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir };
  assert.equal((await keylangAsync(dir, ["explain", "domain.order.order", "--llm"], env)).status, 0);
  assert.equal((await keylangAsync(dir, ["explain", "domain.order.Order", "--llm"], env)).status, 0);
  const files = readdirSync(join(dir, "keylang/explain")).filter((name) => name.endsWith(".md"));
  assert.equal(files.length, 2, files.join(", "));
  assert.equal(new Set(files.map((name) => name.toLowerCase())).size, 2, `one file on APFS and NTFS: ${files.join(", ")}`);
  const offline = { ANTHROPIC_BASE_URL: "http://127.0.0.1:9", HOME: dir };
  assert.match(keylang(dir, ["explain", "domain.order.order"], offline).stdout, /The function order builds an order\.\n+.* · fresh/);
  assert.match(keylang(dir, ["explain", "domain.order.Order"], offline).stdout, /The interface Order is a purchase\.\n+.* · fresh/);
  assert.equal(keylang(dir, ["explain", "--stale"]).stdout, "", "both saved answers are found under their own ID");
});

test("explain --llm on a case-insensitive file system (casefold tmpfs): a type and a fn whose IDs differ in case keep their own answers", { skip: process.platform !== "linux" }, async (t) => {
  if (spawnSync("unshare", ["-rm", "true"]).status !== 0) return t.skip("unshare -rm is not available here");
  const fixture = mkdtempSync(join(tmpdir(), "keylang-casefold-src-"));
  const mount = mkdtempSync(join(tmpdir(), "keylang-casefold-"));
  t.after(() => {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(mount, { recursive: true, force: true });
  });
  for (const [path, text] of Object.entries(CASE_TWINS)) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), text);
  }
  const url = await mockReplies(t, ["The function order builds an order.", "The interface Order is a purchase."]);
  const script = [
    'mount -t tmpfs -o casefold tmpfs "$1" 2>/dev/null || { echo SKIP:mount; exit 0; }',
    'mkdir "$1/repo" && chattr +F "$1/repo" 2>/dev/null || { echo SKIP:chattr; exit 0; }',
    'cp -r "$2/." "$1/repo/" && cd "$1/repo" || exit 1',
    'export HOME="$1/repo" ANTHROPIC_API_KEY=k ANTHROPIC_BASE_URL="$5"',
    '"$3" "$4" explain domain.order.order --llm >/dev/null && "$3" "$4" explain domain.order.Order --llm >/dev/null || exit 1',
    "export ANTHROPIC_BASE_URL=http://127.0.0.1:9",
    'echo "=== fn"; "$3" "$4" explain domain.order.order',
    'echo "=== type"; "$3" "$4" explain domain.order.Order',
  ].join("\n");
  const run = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn("unshare", ["-rm", "sh", "-c", script, "sh", mount, fixture, process.execPath, bin, url], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  if (/^SKIP:/m.test(run.stdout)) return t.skip("casefold tmpfs is not available here");
  const [fn, type] = run.stdout.split(/^=== type$/m);
  assert.match(fn!, /The function order builds an order\.\n+.* · fresh/, run.stdout);
  assert.match(type!, /The interface Order is a purchase\.\n+.* · fresh/, run.stdout);
});
