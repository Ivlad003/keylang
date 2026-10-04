// An agent CLI as the model (`cli:*`, ADR 0012), through the real keylang
// CLI with fake agent binaries on a PATH of their own and HOME in a temp
// directory: the exact argv, where the system text and the prompt go, the
// child's cwd and env, the failures, the selection order and doctor.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { alive, fakeAgents, type FakeAgents } from "./agent-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const today = new Date().toISOString().slice(0, 10);

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** keylang with only the fakes (and the system's basic tools) on PATH, HOME in the copy, no keys and no agent from the developer's env. */
function keylang(dir: string, args: string[], fake: FakeAgents | null, env: Record<string, string | undefined> = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: [...(fake ? [fake.bin] : []), "/usr/bin", "/bin"].join(":"),
        HOME: join(dir, ".home"),
        KEYLANG_AGENT: undefined,
        KEYLANG_NESTED: undefined,
        KEYLANG_LLM_TIMEOUT_MS: undefined,
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
        OPENROUTER_API_KEY: undefined,
        OPENCODE_CONFIG_CONTENT: undefined,
        ...(fake ? fake.env : {}),
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function copy(t: TestContext, fixture = "repo", config: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-agent-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures", fixture), dir, { recursive: true });
  mkdirSync(join(dir, ".home"));
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...config }));
  return dir;
}

function agentsJson(dir: string, value: unknown): void {
  mkdirSync(join(dir, ".home/.config/keylang"), { recursive: true });
  writeFileSync(join(dir, ".home/.config/keylang/agents.json"), typeof value === "string" ? value : JSON.stringify(value));
}

/** Files under `keylang/explain/`: none is written by a failed request. */
function saved(dir: string): string[] {
  const at = join(dir, "keylang/explain");
  return existsSync(at) ? readdirSync(at, { recursive: true }).map(String) : [];
}

const NODE = "app.checkout.checkout";

test("explain --llm through cli:claude: the exact argv, system text in --system-prompt, the prompt on stdin, cwd = PWD = root, KEYLANG_NESTED", async (t) => {
  const dir = copy(t);
  // The agent names its model: the answer is signed as configured, not with the model the CLI reports.
  const fake = fakeAgents(t, ["claude"], { reply: "Checks out an order.", model: "claude-opus-5-5" });
  const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:claude:opus" });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /Checks out an order\./);
  assert.ok(o.stdout.includes(`cli:claude:opus · ${today} · fresh`), o.stdout);
  const [call] = fake.calls();
  assert.ok(call);
  const system = call.args[call.args.indexOf("--system-prompt") + 1]!;
  assert.deepEqual(call.args, ["-p", "--output-format", "json", "--no-session-persistence", "--safe-mode", "--strict-mcp-config", "--permission-prompts", "none", "--disable-slash-commands", "--tools", "", "--system-prompt", system, "--model", "opus"]);
  assert.match(system, /Answer with text only\. Do not run tools/);
  assert.match(call.stdin, /export function checkout/, "the prompt goes on stdin");
  assert.ok(!call.args.some((arg) => arg.includes("export function checkout")), "and in no argument");
  assert.equal(call.cwd, dir);
  assert.equal(call.env.PWD, dir);
  assert.equal(call.env.KEYLANG_NESTED, "1");
  assert.equal(call.env.DISABLE_AUTOUPDATER, "1");
  assert.match(readFileSync(join(dir, `keylang/explain/${NODE}.md`), "utf8"), /^<!-- keylang:explain agent=cli:claude:opus date=/);
});

test("explain --llm through codex, opencode, cursor and a custom CLI: each gets the system text in its slot and its answer is read", async (t) => {
  await t.test("codex: developer_instructions, read-only sandbox, the -o file", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["codex"], { reply: "From codex." });
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:codex:gpt-5.5" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /From codex\./);
    const [call] = fake.calls();
    const config = call!.args.filter((_, i) => call!.args[i - 1] === "-c");
    const instructions = config.find((c) => c.startsWith("developer_instructions="))!;
    assert.match(JSON.parse(instructions.slice("developer_instructions=".length)) as string, /Answer with text only/);
    const out = call!.args[call!.args.indexOf("-o") + 1]!;
    assert.deepEqual(call!.args, [
      "exec", "--sandbox", "read-only", "--ephemeral", "--skip-git-repo-check", "--color", "never", "--cd", dir,
      ...['approval_policy="never"', instructions, "features.hooks=false", "features.multi_agent=false", "features.apps=false", "features.plugins=false", "features.shell_tool=false", "features.unified_exec=false", "project_doc_max_bytes=0", 'web_search="disabled"', "mcp_servers={}"].flatMap((c) => ["-c", c]),
      "-m", "gpt-5.5", "-o", out, "-",
    ]);
    assert.ok(!out.startsWith(dir), "the answer file is outside the repository");
    assert.match(call!.stdin, /export function checkout/);
  });
  await t.test("opencode: the keylang agent with every permission denied, the last step's text", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["opencode"], { reply: "From opencode." });
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:opencode:anthropic/claude-sonnet-5" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /From opencode\./);
    assert.doesNotMatch(o.stdout, /thinking aloud/);
    const [call] = fake.calls();
    assert.deepEqual(call!.args, ["run", "--standalone", "--format", "json", "--agent", "keylang", "--model", "anthropic/claude-sonnet-5"]);
    const config = JSON.parse(call!.env.OPENCODE_CONFIG_CONTENT!) as { agent: { keylang: { permission: string; prompt: string } } };
    assert.equal(config.agent.keylang.permission, "deny");
    assert.match(config.agent.keylang.prompt, /Answer with text only/);
    assert.equal(call!.env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
    assert.equal(call!.env.PWD, dir);
    assert.match(call!.stdin, /export function checkout/);
  });
  await t.test("cursor: cursor-agent in ask mode, the prompt as the last argument, no --trust", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["cursor-agent"], { reply: "From cursor." });
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:cursor:gpt-5" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /From cursor\./);
    const [call] = fake.calls();
    const prompt = call!.args.at(-1)!;
    assert.deepEqual(call!.args, ["-p", "--output-format", "json", "--mode", "ask", "--sandbox", "enabled", "--workspace", dir, "--model", "gpt-5", prompt]);
    assert.match(prompt, /^[\s\S]*Answer with text only[\s\S]*export function checkout/);
  });
  await t.test("custom: {prompt_file} is readable during the call, {model} is dropped without a model", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["mycli"], { reply: "From mine." });
    agentsJson(dir, { clis: { mine: { command: ["mycli", "--quiet", "--model={model}", "--file", "{prompt_file}"] } } });
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:mine" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /From mine\./);
    const [call] = fake.calls();
    assert.equal(call!.args.length, 3);
    assert.deepEqual(call!.args.slice(0, 2), ["--quiet", "--file"]);
    assert.match(call!.promptFile!, /Answer with text only[\s\S]*export function checkout/);
    assert.equal(call!.stdin, "");
    assert.ok(!existsSync(call!.args[2]!), "the prompt file is removed after the call");
  });
});

test("explain --missing --llm --limit through keylang.json cli:claude: briefs written, two requests at a time by default, signed with the model the CLI reports", async (t) => {
  const dir = copy(t, "explained", { agent: "cli:claude", explain: { map: true } });
  const fake = fakeAgents(t, ["claude"], { reply: "A brief.", modes: "slow", model: "claude-opus-5-5" });
  const o = await keylang(dir, ["explain", "--missing", "--llm", "--limit", "3"], fake);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(o.stdout, "explained 3 of 3 node(s)\n");
  const calls = fake.calls();
  assert.equal(calls.length, 3);
  // The three leaves are one wave: two run at once, the third starts after one of them answers.
  const inFlight = (at: number): number => calls.filter((call) => call.started <= at && (call.done ?? Infinity) > at).length;
  assert.equal(Math.max(...calls.map((call) => inFlight(call.started))), 2);
  const briefs = readdirSync(join(dir, "keylang/explain/brief"));
  assert.equal(briefs.length, 3);
  assert.match(readFileSync(join(dir, "keylang/explain/brief", briefs[0]!), "utf8"), /^<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=/);
  assert.equal((await keylang(dir, ["map"], fake)).status, 0);
  const map = readdirSync(join(dir, "keylang/map-explained")).map((file) => readFileSync(join(dir, "keylang/map-explained", file), "utf8")).join("");
  assert.equal(map.split(`_(llm · claude:claude-opus-5-5 · ${today})_`).length - 1, 3, map);
  const plan = await keylang(dir, ["explain", "--missing", "--dry-run"], fake);
  assert.equal(plan.status, 0, plan.stderr);
});

test("agent CLI failures: a missing binary falls back offline; fail, error results, empty answers and timeouts exit 2 and save nothing", async (t) => {
  await t.test("no binary on PATH: explain is the offline summary, exit 0; draft flow --mode llm is exit 2", async (t) => {
    const dir = copy(t);
    const o = await keylang(dir, ["explain", NODE, "--llm"], null, { KEYLANG_AGENT: "cli:claude" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stderr, /`claude` is not on PATH/);
    assert.match(o.stdout, /^fn app\.checkout\.checkout /);
    const draft = await keylang(dir, ["draft", "flow", NODE, "--mode", "llm"], null, { KEYLANG_AGENT: "cli:claude" });
    assert.equal(draft.status, 2, draft.stderr);
    assert.match(draft.stderr, /`claude` is not on PATH/);
    assert.deepEqual(saved(dir), []);
  });
  for (const [mode, text] of [
    ["fail", /cli:claude: exited with code 3: boom/],
    ["error-result", /cli:claude: rate limited/],
    ["empty", /cli:claude answered without text/],
  ] as const) {
    await t.test(mode, async (t) => {
      const dir = copy(t);
      const fake = fakeAgents(t, ["claude"], { modes: mode });
      const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:claude" });
      assert.equal(o.status, 2, o.stderr);
      assert.match(o.stderr, text);
      assert.deepEqual(saved(dir), []);
    });
  }
  await t.test("hang with KEYLANG_LLM_TIMEOUT_MS: exit 2, the child and its grandchild are killed", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["claude"], { modes: "hang" });
    const started = Date.now();
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:claude", KEYLANG_LLM_TIMEOUT_MS: "1500" });
    assert.equal(o.status, 2, o.stderr);
    assert.match(o.stderr, /cli:claude: no answer within 1500 ms \(KEYLANG_LLM_TIMEOUT_MS\)/);
    assert.ok(Date.now() - started < 10_000);
    const pids = fake.pids(1);
    assert.equal(pids.length, 2, "the fake logged its pid and its grandchild's");
    await waitUntil(() => pids.every((pid) => !alive(pid)), "the agent's process group to die");
    assert.deepEqual(saved(dir), []);
  });
  await t.test("cursor that lingers after its result line: the answer is taken and the group killed", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["cursor-agent"], { modes: "linger", reply: "Lingering answer." });
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:cursor" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /Lingering answer\./);
    const pids = fake.pids(1);
    assert.equal(pids.length, 2);
    await waitUntil(() => pids.every((pid) => !alive(pid)), "the lingering group to die");
  });
  await t.test("KEYLANG_NESTED: an agent keylang started never starts another one", async (t) => {
    const dir = copy(t);
    const fake = fakeAgents(t, ["claude"]);
    const o = await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:claude", KEYLANG_NESTED: "1" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stderr, /cli agents are off inside an agent keylang started/);
    assert.equal(fake.calls().length, 0);
  });
});

test("agent selection: KEYLANG_AGENT > agents.json use > keylang.json; Cursor is told from Grok; invalid values are exit 2 naming the field", async (t) => {
  await t.test("precedence", async (t) => {
    const dir = copy(t, "repo", { agent: "cli:codex" });
    const fake = fakeAgents(t, ["claude", "codex", "opencode"]);
    agentsJson(dir, { use: "cli:opencode" });
    assert.equal((await keylang(dir, ["explain", NODE, "--llm"], fake, { KEYLANG_AGENT: "cli:claude" })).status, 0);
    rmSync(join(dir, "keylang/explain"), { recursive: true });
    assert.equal((await keylang(dir, ["explain", NODE, "--llm"], fake)).status, 0);
    rmSync(join(dir, "keylang/explain"), { recursive: true });
    agentsJson(dir, {});
    assert.equal((await keylang(dir, ["explain", NODE, "--llm"], fake)).status, 0);
    assert.deepEqual(fake.calls().map((call) => call.as), ["claude", "opencode", "codex"]);
  });
  await t.test("a Grok `agent` is not the Cursor CLI; a Cursor `agent` is", async (t) => {
    const dir = copy(t);
    const grok = fakeAgents(t, ["agent"], { version: "grok 1.0.46 (2765805b9442) [stable]" });
    const o = await keylang(dir, ["explain", NODE, "--llm"], grok, { KEYLANG_AGENT: "cli:cursor" });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stderr, /`agent` on PATH .* is `grok 1\.0\.46 .*`, not the Cursor CLI/);
    assert.equal(grok.calls().length, 0);
    const cursor = fakeAgents(t, ["agent"], { reply: "Cursor via agent." });
    const ok = await keylang(dir, ["explain", NODE, "--llm"], cursor, { KEYLANG_AGENT: "cli:cursor" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Cursor via agent\./);
  });
  await t.test("invalid agents", async (t) => {
    for (const agent of ["cli:", "cli:claude:-x", "cli:Bad", "cli:claude:a-->b", "cli:claude:a b"]) {
      const dir = copy(t, "repo", { agent });
      const o = await keylang(dir, ["explain", NODE, "--llm"], null);
      assert.equal(o.status, 2, agent);
      assert.match(o.stderr, /keylang\.json: `agent` must be "anthropic:<model>", "openrouter:<model>" or "cli:<name>\[:<model>\]"/, agent);
    }
    const dir = copy(t);
    const env = await keylang(dir, ["explain", NODE, "--llm"], null, { KEYLANG_AGENT: "cli:claude:--x" });
    assert.equal(env.status, 2);
    assert.match(env.stderr, /KEYLANG_AGENT must be/);
  });
  await t.test("invalid agents.json", async (t) => {
    const cases: [unknown, RegExp][] = [
      ["{", /agents\.json: invalid JSON/],
      [{ use: "cli:-x" }, /agents\.json: `use` must be/],
      [{ clis: { grok: { command: 3 } } }, /agents\.json: `clis\.grok\.command` must be a non-empty array of strings, got 3/],
      [{ clis: { grok: { command: ["grok", "{prompt}"] } } }, /`clis\.grok\.command\[1\]`: unknown placeholder `\{prompt\}`/],
      [{ clis: { claude: { command: ["x"] } } }, /`clis\.claude`: a preset takes only `bin`/],
      [{ clis: { grok: { command: ["grok"], env: {} } } }, /unknown field `clis\.grok\.env`/],
      [{ other: 1 }, /unknown field `other`/],
    ];
    for (const [value, text] of cases) {
      const dir = copy(t);
      agentsJson(dir, value);
      const o = await keylang(dir, ["explain", NODE, "--llm"], null, { KEYLANG_AGENT: undefined });
      assert.equal(o.status, 2, `${JSON.stringify(value)}: ${o.stderr}`);
      assert.match(o.stderr, text);
    }
  });
});

test("doctor: the agent with its source, binary and version, and a line with all four agent CLIs", async (t) => {
  const dir = copy(t);
  const fake = fakeAgents(t, ["claude", "codex"]);
  const o = await keylang(dir, ["doctor"], fake, { KEYLANG_AGENT: "cli:claude:opus" });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, new RegExp(`^agent: cli:claude:opus \\(from KEYLANG_AGENT\\): ${fake.bin}/claude \\(2\\.1\\.289\\); login is checked on the first request$`, "m"));
  assert.match(o.stdout, /^agent CLIs: claude 2\.1\.289 · codex 0\.155\.1 · opencode — · cursor —$/m);
  const missing = await keylang(dir, ["doctor"], fake, { KEYLANG_AGENT: "cli:opencode" });
  assert.match(missing.stdout, /^agent: cli:opencode \(from KEYLANG_AGENT\): agent `cli:opencode`: `opencode` is not on PATH/m);
});

async function waitUntil(check: () => boolean, what: string, timeout = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
