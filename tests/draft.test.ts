// `keylang draft` (tickets m5-m7/14–16): proposals built from the snapshot,
// and with a model, through the real CLI on copies of `tests/fixtures/repo`.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const dir = mkdtempSync(join(tmpdir(), "keylang-draft-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  return dir;
}

test("draft flow --mode algo: a proposal of nested steps from resolved calls; accepted, check proves each step statically", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["draft", "flow", "app.checkout.checkout", "--mode", "algo"]);
  assert.equal(o.status, 0, o.stderr);
  const proposal = join(dir, ".keylang/proposals/keylang/flows/checkout.md");
  const text = readFileSync(proposal, "utf8");
  assert.equal(
    text,
    "# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n    - step domain.order.total <!-- keylang:algo unresolved: items.reduce (src/domain/order.ts:7) -->\n  - step infra.db.save\n",
  );
  // Nothing reaches the spec directory before a merge.
  assert.ok(!existsSync(join(dir, "keylang/flows/checkout.md")));
  // The same code gives the same proposal.
  assert.equal(keylang(dir, ["draft", "flow", "app.checkout.checkout"]).status, 0);
  assert.equal(readFileSync(proposal, "utf8"), text);

  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  copyFileSync(proposal, join(dir, "keylang/flows/checkout.md"));
  const check = keylang(dir, ["check"]);
  for (const step of ["domain.order.createOrder", "domain.order.total", "infra.db.save"]) assert.match(check.stdout, new RegExp(`static ok ${step.replace(/\./g, "\\.")}`), check.stdout);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/checkout.md"]).status, 0, "the draft is already canonical");
});

test("draft flow: an unknown trigger is exit 2 with the nearest id; --print writes nothing", (t) => {
  const dir = copy(t);
  const bad = keylang(dir, ["draft", "flow", "app.checkout.chekout"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /is not a fn of the snapshot \(did you mean `app\.checkout\.checkout`\?\)/);
  const printed = keylang(dir, ["draft", "flow", "app.checkout.checkout", "--print"]);
  assert.match(printed.stdout, /^# flow checkout\n/);
  assert.ok(!existsSync(join(dir, ".keylang/proposals")));
});

/** A Messages API stand-in that answers each request with the next reply. */
async function mockModel(t: TestContext, replies: string[]): Promise<{ url: string; prompts: string[] }> {
  const prompts: string[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      prompts.push((JSON.parse(data) as { messages: { content: string }[] }).messages[0]!.content);
      const text = replies[Math.min(prompts.length - 1, replies.length - 1)]!;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, prompts };
}

function run(cwd: string, args: string[], env: Record<string, string | undefined>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("draft flow --mode hybrid: an unknown id goes back once; steps are reconciled with algo; an accepted llm-only step is not ok", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const model = await mockModel(t, [
    "```markdown\n# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.create\n```",
    "```markdown\n# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n  - step infra.db.Db.query\n```",
  ]);
  const o = await run(dir, ["draft", "flow", "app.checkout.checkout"], { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.equal(model.prompts.length, 2, "exactly one more round for the unknown id");
  assert.match(model.prompts[1]!, /`domain\.order\.create` is not an ID of the map; did you mean `domain\.order\.createOrder`\?/);
  assert.match(model.prompts[0]!, /domain\.order\.createOrder \(id: string, items: number\[\]\) → Order/, "the compact map goes to the model");
  const proposal = readFileSync(join(dir, ".keylang/proposals/keylang/flows/checkout.md"), "utf8");
  assert.equal(
    proposal,
    [
      "# flow checkout",
      "",
      "- trigger app.checkout.checkout <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->",
      "  - step domain.order.createOrder <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->",
      "  - step infra.db.Db.query <!-- keylang:llm model=anthropic:claude-opus-5 status=llm-only -->",
      "  - step domain.order.total <!-- keylang:algo status=algo-only -->",
      "  - step infra.db.save <!-- keylang:algo status=algo-only -->",
      "",
    ].join("\n"),
  );
  const stats = JSON.parse(readFileSync(join(dir, ".keylang/stats.json"), "utf8")) as { drafts: Record<string, { proposed: number }> };
  assert.deepEqual([stats.drafts.agree?.proposed, stats.drafts["llm-only"]?.proposed, stats.drafts["algo-only"]?.proposed], [2, 1, 2]);

  // Accepting a model's line is not evidence: the llm-only step is unverified, and fmt keeps the provenance.
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/checkout.md"), proposal);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/checkout.md"]).status, 0);
  const check = keylang(dir, ["check"]);
  assert.match(check.stdout, /static ok domain\.order\.createOrder/);
  // Here the graph even refutes it: no call path reaches `Db.query`. Acceptance never makes it ok.
  assert.match(check.stdout, /static fail infra\.db\.Db\.query: absence: no call path from app\.checkout\.checkout/);
});

test("draft flow: hybrid without a model is algo with a note; --mode llm without one is exit 2", (t) => {
  const dir = copy(t);
  const env = { ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir };
  const hybrid = keylang(dir, ["draft", "flow", "app.checkout.checkout"], env);
  assert.equal(hybrid.status, 0);
  assert.match(hybrid.stderr, /no model configured.*drafting from the snapshot only/);
  const llm = keylang(dir, ["draft", "flow", "app.checkout.checkout", "--mode", "llm"], env);
  assert.equal(llm.status, 2);
  assert.match(llm.stderr, /draft --mode llm: no model configured/);
});

test("draft rules --mode algo: rules the code keeps now, as a proposal that passes check once merged", (t) => {
  const dir = copy(t);
  rmSync(join(dir, "keylang/rules.md"));
  const o = keylang(dir, ["draft", "rules", "--mode", "algo"]);
  assert.equal(o.status, 0, o.stderr);
  const proposal = readFileSync(join(dir, ".keylang/proposals/keylang/rules.md"), "utf8");
  assert.equal(proposal, "# rules\n\n- layers domain < infra < app <!-- keylang:algo status=algo-only -->\n- no-cycles <!-- keylang:algo status=algo-only -->\n");
  writeFileSync(join(dir, "keylang/rules.md"), proposal);
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout);
  assert.doesNotMatch(check.stdout, /K101|K105/);
});

test("draft map: prints the guessed layout and leaves keylang.json as it is", (t) => {
  const dir = copy(t);
  const before = readFileSync(join(dir, "keylang.json"), "utf8");
  const o = keylang(dir, ["draft", "map"]);
  assert.equal(o.status, 0);
  assert.deepEqual(Object.keys((JSON.parse(o.stdout) as { layers: object }).layers), ["app", "domain", "infra"]);
  assert.match(o.stderr, /printed only; keylang\.json is unchanged/);
  assert.equal(readFileSync(join(dir, "keylang.json"), "utf8"), before);
  assert.ok(!existsSync(join(dir, ".keylang/proposals")));
});

test("code-to-spec: the fn at a line becomes a flow proposal; its unresolved calls are marked, not made steps", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["code-to-spec", "src/domain/order.ts:7"]);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(
    readFileSync(join(dir, ".keylang/proposals/keylang/flows/total.md"), "utf8"),
    "# flow total\n\n- trigger domain.order.total <!-- keylang:algo unresolved: items.reduce (src/domain/order.ts:7) -->\n",
  );
  const module = keylang(dir, ["code-to-spec", "src/domain/order.ts", "--print"]);
  assert.equal(module.stdout, "# flow total\n\n- trigger domain.order.total <!-- keylang:algo unresolved: items.reduce (src/domain/order.ts:7) -->\n\n# flow createOrder\n\n- trigger domain.order.createOrder\n  - step domain.order.total <!-- keylang:algo unresolved: items.reduce (src/domain/order.ts:7) -->\n");
  const nowhere = keylang(dir, ["code-to-spec", "src/domain/order.ts:3"]);
  assert.equal(nowhere.status, 2);
  assert.match(nowhere.stderr, /src\/domain\/order\.ts:3: no function holds this line/);
});

test("code-to-spec --since: flows for the fns changed since a git ref; fns already in flows are reported, not redrafted", (t) => {
  const dir = copy(t);
  const git = (...args: string[]): void => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/save.md"), "# flow save\n\n- trigger infra.db.save\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const order = join(dir, "src/domain/order.ts");
  writeFileSync(order, readFileSync(order, "utf8").replace("items.reduce((a, b) => a + b, 0)", "items.reduce((a, b) => a + b, 1)"));
  const db = join(dir, "src/infra/db.ts");
  writeFileSync(db, readFileSync(db, "utf8").replace('"orders.json"', '"orders-v2.json"'));
  writeFileSync(join(dir, "src/infra/cache.ts"), "export function get(key: string): string {\n  return key;\n}\n");

  const o = keylang(dir, ["code-to-spec", "--since", "HEAD", "--mode", "algo", "--print"]);
  assert.equal(o.status, 0, o.stderr);
  // `createOrder` did not change, so `total` is a flow of its own; `save` already has one.
  assert.equal(o.stdout, "# flow total\n\n- trigger domain.order.total <!-- keylang:algo unresolved: items.reduce (src/domain/order.ts:7) -->\n\n# flow get\n\n- trigger infra.cache.get\n");
  assert.match(o.stderr, /changed and already in flows \(review those\): infra\.db\.save/);

  const written = keylang(dir, ["code-to-spec", "--since", "HEAD", "--mode", "algo"]);
  assert.equal(written.status, 0, written.stderr);
  assert.ok(existsSync(join(dir, ".keylang/proposals/keylang/flows/changes.md")));

  const bad = keylang(dir, ["code-to-spec", "--since", "no-such-ref", "--mode", "algo"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /code-to-spec --since: git diff: /);
  const both = keylang(dir, ["code-to-spec", "src/domain/order.ts", "--since", "HEAD"]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /give a path or --since, not both/);
});

const REFUND = '# flow refund\n\n- planned fn app.refund.refund (order: Order) → Order\n- trigger app.refund.refund\n  - test tests/refund.test.ts "refund returns the order"\n';

test("spec-to-code: refund goes planned → stub → map → separate evidence (ID ok; tests and trace unverified until they run)", (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), check: { tests: ".keylang/reports/*.json", trace: ".keylang/trace/*.jsonl" } }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/refund.md"), REFUND);
  assert.match(keylang(dir, ["check"]).stdout, /ID unverified app\.refund\.refund: planned fn/);

  const dry = keylang(dir, ["spec-to-code", "app.refund.refund"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^src\/app\/refund\.ts \(new file\)\n@@ line 1 @@\n\+export function refund\(order: Order\): Order \{\n/);
  // The candidate is checked as code before it exists on disk.
  assert.match(dry.stdout, /with the candidate in place:\nkeylang\/flows\/refund\.md:4:1: ID ok app\.refund\.refund: exact/);
  // The flow's test file does not exist: a test that fails until someone writes it.
  assert.match(dry.stdout, /\ntests\/refund\.test\.ts \(new file\)\n@@ line 1 @@\n\+import assert from "node:assert\/strict";\n\+import \{ test \} from "node:test";\n\+import \{ refund \} from "\.\.\/src\/app\/refund\.ts";\n/);
  // Without --apply the code and the test are proposals, merged hunk by hunk in the TUI.
  assert.match(dry.stderr, /proposed \.keylang\/proposals\/src\/app\/refund\.ts, \.keylang\/proposals\/tests\/refund\.test\.ts/);
  assert.match(readFileSync(join(dir, ".keylang/proposals/src/app/refund.ts"), "utf8"), /^export function refund\(order: Order\): Order \{/);
  assert.ok(existsSync(join(dir, ".keylang/proposals/tests/refund.test.ts")));
  assert.ok(!existsSync(join(dir, "src/app/refund.ts")), "no code written without --apply");
  assert.ok(!existsSync(join(dir, "tests/refund.test.ts")));
  const printed = keylang(dir, ["spec-to-code", "app.refund.refund", "--print"]);
  assert.equal(printed.stdout, dry.stdout);
  assert.match(printed.stderr, /nothing written/);
  assert.equal(keylang(dir, ["spec-to-code", "app.refund.refund", "--print", "--apply"]).status, 2);

  assert.equal(keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]).status, 0);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const check = keylang(dir, ["check"]).stdout;
  assert.match(check, /ID ok app\.refund\.refund: exact/);
  assert.match(check, /K202 planned fn `app\.refund\.refund` is implemented \(src\/app\/refund\.ts:1\); remove the declaration/);
  assert.match(check, /tests unverified test tests\/refund\.test\.ts "refund returns the order": no report/);
  assert.match(check, /trace unverified app\.refund\.refund: no trace for flow `refund`/);
  // Run, the generated test reports the flow as not yet shown by a test.
  const ran = spawnSync(process.execPath, ["--test", `--test-reporter=${join(root, "src/adapters/node-test.ts")}`, "--test-reporter-destination=stdout", "tests/refund.test.ts"], {
    cwd: dir,
    encoding: "utf8",
    // Without it the child sees it runs inside a test and skips the files.
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.equal(ran.status, 1, ran.stderr);
  assert.match(keylang(dir, ["check"]).stdout, /tests fail test tests\/refund\.test\.ts "refund returns the order"/);
});

test("spec-to-code: a reference that is not planned gets no code; a stub its flow's deny would forbid is refused", (t) => {
  const dir = copy(t);
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/refund.md"), "# flow refund\n\n- planned fn app.refund.refund (order: Order) → Order\n- trigger domain.order.createOrder\n  - step app.refund.refund\n");
  const typo = keylang(dir, ["spec-to-code", "app.refund.refnd"]);
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /neither planned nor in the code: fix the reference.*or declare `planned fn app\.refund\.refnd <signature>` first/);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain app\n");
  const denied = keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]);
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /`deny` forbids `domain\.order\.createOrder` → `app\.refund\.refund`/);
  assert.ok(!existsSync(join(dir, "src/app/refund.ts")));
});

test("spec-to-code --mode llm: the model's body is analyzed as a new snapshot before anything is written; a wrong function is refused", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/refund.md"), REFUND);
  const model = await mockModel(t, [
    "```ts\nexport function refund(order: Order): Order {\n  return { ...order, total: 0 };\n}\n```",
    '```ts\nimport assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { refund } from "../src/app/refund.ts";\n\ntest("refund returns the order", () => {\n  assert.equal(refund({ id: "o", total: 5 }).total, 0);\n});\n```',
  ]);
  const env = { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir };
  const o = await run(dir, ["spec-to-code", "app.refund.refund", "--mode", "llm"], env);
  assert.equal(o.status, 0, o.stderr);
  assert.match(model.prompts[0]!, /Planned: `app\.refund\.refund` \(order: Order\) → Order/);
  assert.match(o.stdout, /\+ {2}return \{ \.\.\.order, total: 0 \};/);
  assert.match(o.stdout, /with the candidate in place:\nkeylang\/flows\/refund\.md:4:1: ID ok app\.refund\.refund: exact/);
  assert.doesNotMatch(o.stdout, /K201/);
  // The e2e test comes from the model too, told the test name the flow declares.
  assert.match(model.prompts[1]!, /- flow refund: "refund returns the order"/);
  assert.match(o.stdout, /\ntests\/refund\.test\.ts \(new file\)\n[\s\S]*\+ {2}assert\.equal\(refund\(\{ id: "o", total: 5 \}\)\.total, 0\);/);
  assert.ok(!existsSync(join(dir, "src/app/refund.ts")));
  assert.ok(!existsSync(join(dir, "tests/refund.test.ts")));

  const wrong = await mockModel(t, ["```ts\nexport function reimburse(): void {}\n```"]);
  const bad = await run(dir, ["spec-to-code", "app.refund.refund", "--mode", "llm", "--apply"], { ...env, ANTHROPIC_BASE_URL: wrong.url });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /did not return a function named `refund`; nothing written/);
  assert.ok(!existsSync(join(dir, "src/app/refund.ts")));
});

test("code-to-spec --mode hybrid: the model's flow for the fn at the line, reconciled with the snapshot", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const model = await mockModel(t, ["```markdown\n# flow createOrder\n\n- trigger domain.order.createOrder\n  - step domain.order.total\n```"]);
  const o = await run(dir, ["code-to-spec", "src/domain/order.ts:11"], { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.equal(model.prompts.length, 1);
  assert.equal(
    readFileSync(join(dir, ".keylang/proposals/keylang/flows/createOrder.md"), "utf8"),
    "# flow createOrder\n\n- trigger domain.order.createOrder <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->\n  - step domain.order.total <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->\n",
  );
});

test("draft rules --mode hybrid: each of the model's rules is checked now — agree, or conflict with the edge that breaks it; algo rules are added", async (t) => {
  const dir = copy(t);
  rmSync(join(dir, "keylang/rules.md"));
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const model = await mockModel(t, ["```markdown\n# rules\n\n- deny domain infra\n- deny app infra\n- layers app < domain\n```"]);
  const o = await run(dir, ["draft", "rules"], { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.match(model.prompts[0]!, /app → infra: \d+/, "the layer dependencies go to the model");
  assert.equal(
    readFileSync(join(dir, ".keylang/proposals/keylang/rules.md"), "utf8"),
    [
      "# rules",
      "",
      "- deny domain infra <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->",
      "- deny app infra <!-- keylang:llm model=anthropic:claude-opus-5 status=conflict -->",
      "- layers app < domain <!-- keylang:llm model=anthropic:claude-opus-5 status=conflict -->",
      "- layers domain < infra < app <!-- keylang:algo status=algo-only -->",
      "- no-cycles <!-- keylang:algo status=algo-only -->",
      "",
    ].join("\n"),
  );
  assert.match(o.stderr, /conflict: - deny app infra → src\/app\/checkout\.ts:\d+: K102 divergence: `app\.checkout` depends on `infra\.db`/);
  assert.match(o.stderr, /conflict: - layers app < domain → src\/app\/checkout\.ts:\d+: K101/);
  assert.equal(JSON.parse(readFileSync(config, "utf8")).layers !== undefined, true, "keylang.json is not touched");
});

test("draft map --mode llm: the model's layout is validated and printed; keylang.json stays", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const before = readFileSync(config, "utf8");
  const good = await mockModel(t, ['{"core": ["src/domain/**"], "edge": ["src/app/**", "src/infra/**"]}']);
  const o = await run(dir, ["draft", "map", "--mode", "llm"], { ANTHROPIC_BASE_URL: good.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.deepEqual((JSON.parse(o.stdout) as { layers: object }).layers, { core: ["src/domain/**"], edge: ["src/app/**", "src/infra/**"] });
  assert.equal(readFileSync(config, "utf8"), before);
  const bad = await mockModel(t, ['{"core.domain": ["src/domain/**"]}']);
  const invalid = await run(dir, ["draft", "map", "--mode", "llm"], { ANTHROPIC_BASE_URL: bad.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /layer name `core\.domain` must be one ID segment/);
});
