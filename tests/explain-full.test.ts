// A `full` explanation in sections (.scratch/c4-zoom/issues/06): the zoom of
// one node from what it is for down to what it calls, with the constructs
// keylang did not resolve named instead of guessed. Through the real CLI with
// a local stand-in for the model.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

const FULL = [
  "## What it is for",
  "Sums the prices of an order's items.",
  "",
  "## Steps",
  "It folds the items with `items.reduce`.",
  "",
  "## Branches and edge cases",
  "An empty order totals zero.",
  "",
  "## Calls",
  "The call `items.reduce` is one keylang did not resolve; see also `domain.order.nope`.",
  "",
  "## Flows and rules",
  "It takes part in the flow checkout.",
].join("\n");

interface Mock {
  url: string;
  requests: { system: string; prompt: string }[];
}

async function mockAnthropic(t: TestContext): Promise<Mock> {
  const mock: Mock = { url: "", requests: [] };
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const body = JSON.parse(data) as { system: string; messages: { content: string }[] };
      mock.requests.push({ system: body.system, prompt: body.messages[0]?.content ?? "" });
      const text = body.system.includes("five sections") ? FULL : "Sums the prices. It folds the items.";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return mock;
}

function run(cwd: string, args: string[], env: Record<string, string | undefined> = {}): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function repo(t: TestContext): Promise<{ dir: string; mock: Mock; env: Record<string, string | undefined> }> {
  const dir = mkdtempSync(join(tmpdir(), "keylang-explain-full-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/explained"), dir, { recursive: true });
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ ...config, agent: "anthropic:claude-opus-5" }));
  const mock = await mockAnthropic(t);
  return { dir, mock, env: { ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir } };
}

test("explain --llm --full asks for five sections and names the constructs keylang did not resolve; short and brief ask as before", async (t) => {
  const { dir, mock, env } = await repo(t);
  const full = await run(dir, ["explain", "domain.order.total", "--llm", "--full"], env);
  assert.equal(full.status, 0, full.stderr);
  const asked = mock.requests[0]!;
  assert.match(asked.system, /Answer in five sections, each under a `## ` heading written in that language: what it is for; its steps; its branches and edge cases; what it calls: name the IDs given; for a construct keylang did not resolve, say so and do not guess its target; the flows and rules it takes part in\./);
  assert.match(asked.prompt, /^Constructs inside it keylang did not resolve to an edge:\n- src\/domain\/order\.ts:19: `items\.reduce` — call through a local value `items\.reduce`$/m);

  const short = await run(dir, ["explain", "domain.order.total", "--llm"], env);
  assert.equal(short.status, 0, short.stderr);
  assert.match(mock.requests[1]!.system, /Write 2-3 sentences: what the node is for and why it exists\./);
  assert.doesNotMatch(mock.requests[1]!.prompt, /did not resolve to an edge/);
  const brief = await run(dir, ["explain", "domain.order.total", "--llm", "--brief"], env);
  assert.equal(brief.status, 0, brief.stderr);
  assert.match(mock.requests[2]!.system, /at most two short sentences in one paragraph/);
  assert.doesNotMatch(mock.requests[2]!.prompt, /did not resolve to an edge/);
});

test("a full answer is saved with its headings, shown as written offline, and keeps a made-up id as unknown", async (t) => {
  const { dir, env } = await repo(t);
  const asked = await run(dir, ["explain", "domain.order.total", "--llm", "--full"], env);
  assert.equal(asked.status, 0, asked.stderr);
  assert.match(asked.stdout, /^unknown ids: domain\.order\.nope$/m);
  const saved = readFileSync(join(dir, "keylang/explain/domain.order.total.md"), "utf8");
  assert.match(saved, /^<!-- keylang:explain agent=anthropic:claude-opus-5 date=\S+ closure=[0-9a-f]{64} lang=en detail=full -->\n## What it is for\n/);
  assert.ok(saved.includes("## Calls\nThe call `items.reduce` is one keylang did not resolve"), saved);
  // Offline: no model, the saved text as written, headings included.
  const offline = await run(dir, ["explain", "domain.order.total", "--full"], { ANTHROPIC_API_KEY: undefined, ANTHROPIC_BASE_URL: undefined, HOME: dir });
  assert.equal(offline.status, 0, offline.stderr);
  assert.ok(offline.stdout.includes(`${FULL}\n`), offline.stdout);
});

test("explain leaves an import of a file `assume` names out of what keylang did not resolve: the summary and the --full prompt", async (t) => {
  const { dir, mock, env } = await repo(t);
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ ...config, assume: ["src/domain/settings.ts"] }));
  const order = readFileSync(join(dir, "src/domain/order.ts"), "utf8");
  writeFileSync(join(dir, "src/domain/order.ts"), order.replace('import type { Money } from "./money.ts";', 'import type { Money } from "./money.ts";\nimport { settings } from "./settings";\nexport const rounding = settings;'));
  const index = await run(dir, ["map"], env);
  assert.equal(index.status, 0, index.stderr);
  const assumed = (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { coverage: { kind: string; source: string | null }[] }).coverage.filter((item) => item.kind === "assumed-import");
  assert.deepEqual(assumed.map((item) => item.source), ["domain.order"], "the module's import is assumed");
  // The offline summary's "not resolved" line does not count it.
  const offline = await run(dir, ["explain", "domain.order"], env);
  assert.equal(offline.status, 0, offline.stderr);
  assert.doesNotMatch(offline.stdout, /assumed-import/);
  const full = await run(dir, ["explain", "domain.order", "--llm", "--full"], env);
  assert.equal(full.status, 0, full.stderr);
  assert.doesNotMatch(mock.requests[0]!.prompt, /assumed import|assumed-import|settings`/);
});
