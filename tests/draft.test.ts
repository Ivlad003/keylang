// `keylang draft` (tickets m5-m7/14–16): proposals built from the snapshot,
// and with a model, through the real CLI on copies of `tests/fixtures/repo`.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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

/** A Messages API stand-in that answers each request with the next reply; `onRequest` runs before it answers. */
async function mockModel(t: TestContext, replies: string[], onRequest: (n: number) => void = () => {}): Promise<{ url: string; prompts: string[] }> {
  const prompts: string[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      prompts.push((JSON.parse(data) as { messages: { content: string }[] }).messages[0]!.content);
      onRequest(prompts.length);
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
      // A step the model missed goes under its caller in the algo projection.
      "    - step domain.order.total <!-- keylang:algo status=algo-only -->",
      "  - step infra.db.Db.query <!-- keylang:llm model=anthropic:claude-opus-5 status=llm-only -->",
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

function outsideDir(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("spec-to-code --apply: a test path out of the repository (`..`, absolute, through a link) is never read or written; the code file through a link out is refused", (t) => {
  const dir = copy(t);
  const outside = outsideDir(t);
  writeFileSync(join(outside, "probe.test.ts"), "secret\n");
  symlinkSync(outside, join(dir, "tests-link"));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  const flow = (tests: string[]): string => `# flow refund\n\n- planned fn app.refund.refund (order: Order) → Order\n- trigger app.refund.refund\n${tests.map((line) => `  - test ${line}\n`).join("")}`;
  // A name of its own beside the copy: a file some other run left there cannot pass for this one.
  const escape = `../${basename(dir)}-escape.test.ts`;
  writeFileSync(join(dir, "keylang/flows/refund.md"), flow([`${escape} "a"`, `${join(outside, "abs.test.ts")} "b"`, `tests-link/linked.test.ts "c"`, `tests-link/probe.test.ts "d"`]));
  const o = keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]);
  assert.equal(o.status, 0, o.stderr);
  assert.ok(o.stderr.includes(`test ${escape} "a": not a plain relative path; nothing proposed for it`), o.stderr);
  assert.match(o.stderr, /abs\.test\.ts "b": not a plain relative path; nothing proposed for it/);
  assert.match(o.stderr, /test tests-link\/linked\.test\.ts "c": leads out of the repository through a link/);
  // Not "exists without it": the file behind the link is not even read.
  assert.match(o.stderr, /test tests-link\/probe\.test\.ts "d": leads out of the repository through a link/);
  assert.deepEqual(readdirSync(outside), ["probe.test.ts"]);
  assert.ok(!existsSync(join(dir, escape)));
  assert.ok(existsSync(join(dir, "src/app/refund.ts")), "the code file inside the repository is written");

  // The module file itself as a link whose target does not exist yet: writing it would create a file outside.
  rmSync(join(dir, "src/app/refund.ts"));
  symlinkSync(join(outside, "refund.ts"), join(dir, "src/app/refund.ts"));
  writeFileSync(join(dir, "keylang/flows/refund.md"), flow([]));
  const linked = keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]);
  assert.equal(linked.status, 2, linked.stdout);
  assert.match(linked.stderr, /src\/app\/refund\.ts: leads out of the repository through a link/);
  assert.deepEqual(readdirSync(outside), ["probe.test.ts"]);
});

test("spec-to-code: a generated file is never the target; a second --apply does not add the stub twice", (t) => {
  const dir = copy(t);
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  const generated = "// keylang:generated — не редагувати, `keylang wire`\nexport const wired = 1;\n";
  writeFileSync(join(dir, "src/app/wired.ts"), generated);
  writeFileSync(join(dir, "keylang/flows/refund.md"), `${REFUND}- planned fn app.wired.extra () → void\n`);
  const into = keylang(dir, ["spec-to-code", "app.wired.extra", "--apply"]);
  assert.equal(into.status, 2);
  assert.match(into.stderr, /src\/app\/wired\.ts: a generated file: it is written by `keylang wire` only/);
  assert.equal(readFileSync(join(dir, "src/app/wired.ts"), "utf8"), generated);

  assert.equal(keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]).status, 0);
  const once = readFileSync(join(dir, "src/app/refund.ts"), "utf8");
  const again = keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /`app\.refund\.refund` is already implemented \(src\/app\/refund\.ts:1\)/);
  assert.equal(readFileSync(join(dir, "src/app/refund.ts"), "utf8"), once);
});

test("spec-to-code --apply: an edit made while the model answers is kept and nothing is written", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/refund.md"), REFUND.replace(/ {2}- test .*\n/, ""));
  const file = join(dir, "src/app/refund.ts");
  writeFileSync(file, "export const policy = 1;\n");
  const edited = "export const policy = 2; // changed by hand meanwhile\n";
  const model = await mockModel(t, ["```ts\nexport function refund(order: Order): Order {\n  return order;\n}\n```"], () => writeFileSync(file, edited));
  const o = await run(dir, ["spec-to-code", "app.refund.refund", "--mode", "llm", "--apply"], { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 2, o.stderr);
  assert.match(o.stderr, /src\/app\/refund\.ts: changed on disk while the change was prepared; nothing written/);
  assert.equal(readFileSync(file, "utf8"), edited);
});

test("spec-to-code: the candidate shows every finding it adds, a K102 in the new file included; CRLF and the file mode are kept", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/refund.md"), "# flow refund\n\n- planned fn domain.refund.refund (order: Order) → Order\n- trigger domain.refund.refund\n");
  const model = await mockModel(t, ['```ts\nimport { save } from "../infra/db.ts";\n\nexport function refund(order: Order): Order {\n  save(order);\n  return order;\n}\n```']);
  const o = await run(dir, ["spec-to-code", "domain.refund.refund", "--mode", "llm", "--print"], { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /with the candidate in place:\n[\s\S]*src\/domain\/refund\.ts:1:\d+: K102 divergence: `domain\.refund` depends on `infra\.db`, which is denied by `deny domain infra`/);

  // An existing CRLF module file with its own mode: the stub joins it in CRLF, the mode stays.
  const file = join(dir, "src/app/refund.ts");
  writeFileSync(file, "export const policy = 1;\r\n");
  chmodSync(file, 0o640);
  writeFileSync(join(dir, "keylang/flows/refund.md"), "# flow refund\n\n- planned fn app.refund.refund (order: Order) → Order\n- trigger app.refund.refund\n");
  assert.equal(keylang(dir, ["spec-to-code", "app.refund.refund", "--apply"]).status, 0);
  const text = readFileSync(file, "utf8");
  assert.match(text, /^export const policy = 1;\r\n\r\nexport function refund\(order: Order\): Order \{\r\n/);
  assert.equal(text.split("\r\n").length, text.split("\n").length, "every line ends with CRLF");
  assert.equal(statSync(file).mode & 0o777, 0o640);
});

test("spec-to-code: a Python stub keeps the declared annotations and result, so it matches its plan (K202, not K201)", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-draft-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "app"));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["python"], layers: { app: ["app/**"] } }));
  writeFileSync(join(dir, "app/order.py"), "def total(items):\n    return sum(items)\n");
  writeFileSync(join(dir, "keylang/flows/refund.md"), "# flow refund\n\n- planned fn app.refund.refund (order: Order) → Order\n- trigger app.refund.refund\n");
  const o = keylang(dir, ["spec-to-code", "app.refund.refund", "--print"]);
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /^app\/refund\.py \(new file\)\n@@ line 1 @@\n\+from __future__ import annotations\n\+\n\+\n\+def refund\(order: Order\) -> Order:\n\+ {4}raise NotImplementedError\("not implemented: app\.refund\.refund"\)\n/);
  assert.match(o.stdout, /K202 planned fn `app\.refund\.refund` is implemented/);
  assert.doesNotMatch(o.stdout, /K201/);
});

test("draft: --print writes nothing, stats included; draft rules join the `# rules` section, never a trailing `# flow`", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const model = await mockModel(t, ["```markdown\n# flow checkout\n\n- trigger app.checkout.checkout\n```"]);
  const env = { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir };
  for (const args of [["draft", "flow", "app.checkout.checkout", "--print"], ["code-to-spec", "src/app/checkout.ts:5", "--print"]]) {
    const o = await run(dir, args, env);
    assert.equal(o.status, 0, o.stderr);
  }
  assert.ok(!existsSync(join(dir, ".keylang")), "no stats.json, no proposal");

  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n\n# flow checkout\n\n- trigger app.checkout.checkout\n");
  const rules = keylang(dir, ["draft", "rules", "--mode", "algo"]);
  assert.equal(rules.status, 0, rules.stderr);
  const proposal = readFileSync(join(dir, ".keylang/proposals/keylang/rules.md"), "utf8");
  assert.equal(
    proposal,
    "# rules\n\n- deny domain infra\n- layers domain < infra < app <!-- keylang:algo status=algo-only -->\n- no-cycles <!-- keylang:algo status=algo-only -->\n\n# flow checkout\n\n- trigger app.checkout.checkout\n",
  );
  writeFileSync(join(dir, "keylang/rules.md"), proposal);
  const check = keylang(dir, ["check"]);
  assert.doesNotMatch(check.stdout, /K00\d/, check.stdout);
  // Drafting again adds nothing the file already has.
  assert.equal(keylang(dir, ["draft", "rules", "--mode", "algo"]).status, 0);
  assert.equal(readFileSync(join(dir, ".keylang/proposals/keylang/rules.md"), "utf8"), proposal);
});

test("draft flow --mode hybrid on the parsed flow: an item that does not parse where it stands is dropped, a missing trigger is added, a backticked id is an id, nesting is judged", async (t) => {
  const dir = copy(t);
  const config = join(dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const answer = [
    "Here is the flow:",
    "```markdown",
    "# flow checkout",
    "",
    "The checkout creates the order.",
    "",
    "- step `domain.order.createOrder`",
    "  - invariant the order has a total",
    "    - step domain.order.total",
    "- step infra.db.save",
    "  - step domain.order.total",
    "```",
  ].join("\n");
  const model = await mockModel(t, [answer]);
  const o = await run(dir, ["draft", "flow", "app.checkout.checkout"], { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(o.status, 0, o.stderr);
  assert.equal(model.prompts.length, 1, "the backticked id is known: no second round");
  assert.match(o.stderr, /dropped from the model's draft: - step domain\.order\.total: unknown keyword `step` here; expected one of: test/);
  const llm = (status: string): string => `<!-- keylang:llm model=anthropic:claude-opus-5 status=${status} -->`;
  const proposal = readFileSync(join(dir, ".keylang/proposals/keylang/flows/checkout.md"), "utf8");
  assert.equal(
    proposal,
    [
      "# flow checkout",
      "",
      "The checkout creates the order.",
      "",
      "- trigger app.checkout.checkout <!-- keylang:algo status=algo-only -->",
      `- step domain.order.createOrder ${llm("agree")}`,
      "  - invariant the order has a total",
      `- step infra.db.save ${llm("agree")}`,
      // `save` does not call `total`: the snapshot does not back this nesting.
      `  - step domain.order.total ${llm("llm-only")}`,
      "",
    ].join("\n"),
  );
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/checkout.md"), proposal);
  assert.doesNotMatch(keylang(dir, ["check"]).stdout, /K00\d/);

  // Prose only: the trigger and the algo steps, each under its caller.
  const prose = await mockModel(t, ["I would rather describe it in words."]);
  const printed = await run(dir, ["draft", "flow", "app.checkout.checkout", "--print"], { ANTHROPIC_BASE_URL: prose.url, ANTHROPIC_API_KEY: "k", HOME: dir });
  assert.equal(
    printed.stdout,
    [
      "# flow checkout",
      "",
      "I would rather describe it in words.",
      "",
      "- trigger app.checkout.checkout <!-- keylang:algo status=algo-only -->",
      "  - step domain.order.createOrder <!-- keylang:algo status=algo-only -->",
      "    - step domain.order.total <!-- keylang:algo status=algo-only -->",
      "  - step infra.db.save <!-- keylang:algo status=algo-only -->",
      "",
    ].join("\n"),
  );
});

test("code-to-spec: methods of the same name in one file are two flows; a heading comment does not hide the flow it names", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "src/infra/repos.ts"), "export class A {\n  save(): void {}\n}\n\nexport class B {\n  save(): void {}\n}\n");
  const o = keylang(dir, ["code-to-spec", "src/infra/repos.ts", "--mode", "algo"]);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(readFileSync(join(dir, ".keylang/proposals/keylang/flows/repos.md"), "utf8"), "# flow A-save\n\n- trigger infra.repos.A.save\n\n# flow B-save\n\n- trigger infra.repos.B.save\n");

  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/checkout.md"), "# flow checkout <!-- kept by hand -->\n\n- trigger app.checkout.checkout\r\n".replace(/\n/g, "\r\n").replace(/\r\r/g, "\r"));
  assert.equal(keylang(dir, ["draft", "flow", "app.checkout.checkout", "--mode", "algo"]).status, 0);
  const proposal = readFileSync(join(dir, ".keylang/proposals/keylang/flows/checkout.md"), "utf8");
  assert.equal(proposal.match(/# flow checkout/g)?.length, 1, proposal);
  assert.equal(proposal.split("\r\n").length, proposal.split("\n").length, "a CRLF spec gets a CRLF proposal");
});

test("code-to-spec --since: a moved file and file names outside ASCII count as changed", (t) => {
  const dir = copy(t);
  const git = (...args: string[]): void => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  writeFileSync(join(dir, "src/domain/замовлення.ts"), "export function оплатити(total: number): number {\n  return total;\n}\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  writeFileSync(join(dir, "src/domain/замовлення.ts"), "export function оплатити(total: number): number {\n  return total + 1;\n}\n");
  git("mv", "src/infra/db.ts", "src/infra/store.ts");
  writeFileSync(join(dir, "src/infra/кеш.ts"), "export function взяти(key: string): string {\n  return key;\n}\n");
  const o = keylang(dir, ["code-to-spec", "--since", "HEAD", "--mode", "algo", "--print"]);
  assert.equal(o.status, 0, o.stderr);
  for (const id of ["domain.замовлення.оплатити", "infra.store.save", "infra.кеш.взяти"]) assert.match(o.stdout, new RegExp(`- trigger ${id.replace(/\./g, "\\.")}`), o.stdout);
});
