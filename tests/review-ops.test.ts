// Findings of the operations review of 2026-10-05 («Операції та модель»),
// one section each, numbered as the review's fix list: through the real CLI
// with fake agent CLIs on a PATH of their own (`tests/agent-fixture.ts`),
// and the shared operations where the TUI is the caller.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { answerObject } from "../src/draft-llm.ts";
import { answerText, briefText } from "../src/explain-llm.ts";
import { exportTargetProblem, featureSlugOf, runOperation } from "../src/operations.ts";
import { fakeAgents, type FakeAgents } from "./agent-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** keylang with only the fakes (and the system's basic tools) on PATH, HOME in the copy, no keys and no agent from the developer's env. `node` goes before the script (`--import`). */
function keylang(dir: string, args: string[], fake: FakeAgents | null, env: Record<string, string | undefined> = {}, node: string[] = []): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...node, bin, ...args], {
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

function tempDir(t: TestContext, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A copy of `tests/fixtures/repo` with `config` merged into its keylang.json and `files` written over it. */
function copy(t: TestContext, config: Record<string, unknown> = {}, files: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-review-ops-");
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  mkdirSync(join(dir, ".home"));
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...config }));
  write(dir, files);
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/**
 * The fake `claude` of `fake`, which first appends `EDIT_TEXT` to `EDIT_FILE`
 * when its call is number `EDIT_ON_CALL` (every call without it): a person
 * saving a file while the model answers.
 */
function editBeforeAnswer(fake: FakeAgents): void {
  const wrapper = join(fake.bin, "claude");
  const edit = [
    `n=$(( $(ls "$FAKE_AGENT_LOG" | grep -c '[.]json$') + 1 ))`,
    `if [ -n "$EDIT_FILE" ] && { [ -z "$EDIT_ON_CALL" ] || [ "$n" = "$EDIT_ON_CALL" ]; }; then printf '%s' "$EDIT_TEXT" >> "$EDIT_FILE"; fi`,
  ].join("\n");
  // A function, not a string: `$'` in the shell text is no replacement pattern.
  writeFileSync(wrapper, readFileSync(wrapper, "utf8").replace("#!/bin/sh\n", () => `#!/bin/sh\n${edit}\n`));
}

const EDITED = "// edited while the model answered\n";

// ---------- 1. export c4 --out: the write policy before the target is read ----------

test("export c4 --out: a link out of the repository and an absolute path outside are refused by the write policy before the target is read; nothing is written there", async (t) => {
  const dir = copy(t);
  const outside = tempDir(t, "keylang-review-outside-");
  writeFileSync(join(outside, "plain.txt"), "outside text\n");
  writeFileSync(join(outside, "diagram.puml"), "' keylang:generated — keylang export c4\n@startuml\n@enduml\n");
  symlinkSync(join(outside, "plain.txt"), join(dir, "link-plain.puml"));
  symlinkSync(join(outside, "diagram.puml"), join(dir, "link-diagram.puml"));
  symlinkSync(join(outside, "new.puml"), join(dir, "link-new.puml"));
  for (const [out, reason] of [
    ["link-plain.puml", "leads out of the repository through a link"],
    ["link-diagram.puml", "leads out of the repository through a link"],
    ["link-new.puml", "leads out of the repository through a link"],
    [join(outside, "plain.txt"), "not a plain relative path"],
  ] as const) {
    const o = await keylang(dir, ["export", "c4", "--out", out], null);
    assert.equal(o.status, 2, `${out}: ${o.stderr}`);
    assert.equal(o.stdout, "");
    // The policy names the path; the old order read the file first and judged its first line.
    assert.equal(o.stderr, `keylang: export c4: --out ${out}: ${reason}; nothing written\n`);
  }
  assert.deepEqual(readdirSync(outside).sort(), ["diagram.puml", "plain.txt"]);
  assert.equal(readFileSync(join(outside, "plain.txt"), "utf8"), "outside text\n");
  assert.equal(readFileSync(join(outside, "diagram.puml"), "utf8"), "' keylang:generated — keylang export c4\n@startuml\n@enduml\n");
  // Inside the repository the contract stays: a new file is written, a foreign one is judged by its first line.
  writeFileSync(join(dir, "manual.puml"), "@startuml\n@enduml\n");
  const manual = await keylang(dir, ["export", "c4", "--out", "manual.puml"], null);
  assert.equal(manual.status, 2);
  assert.match(manual.stderr, /manual\.puml: not a diagram `keylang export c4` wrote/);
  const fresh = await keylang(dir, ["export", "c4", "--out", join(dir, "docs/c4.puml")], null);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(fresh.stderr, "docs/c4.puml: written\n");
});

// ---------- 2. explain --missing --llm: the inputs once per wave ----------

/** A preload for `node --import`: counts the reads of files whose path ends with COUNT_READS_OF and writes the count to COUNT_READS_TO at exit. */
const COUNT_READS = `import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const suffix = process.env.COUNT_READS_OF;
const original = fs.readFileSync;
let reads = 0;
fs.readFileSync = function (path, ...rest) {
  if (String(path).endsWith(suffix)) reads++;
  return original.call(this, path, ...rest);
};
syncBuiltinESMExports();
process.on("exit", () => fs.writeFileSync(process.env.COUNT_READS_TO, String(reads)));
`;

/**
 * `count` functions without a doc comment in `src/app/many.ts` (the briefs:
 * each fn, the module, the layer), and `src/lib/util.ts`, which no brief is
 * about: its own doc comments, a README for its layer and one for the repository.
 */
function manyRepo(t: TestContext, count: number): string {
  const dir = tempDir(t, "keylang-review-batch-");
  mkdirSync(join(dir, ".home"));
  write(dir, {
    "keylang.json": JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], lib: ["src/lib/**"] }, agent: "cli:claude" }),
    "README.md": "# Many\n\nMany is a fixture with many small functions in one file.\n",
    "src/lib/README.md": "# lib\n\nHelpers the app layer uses, kept apart from it.\n",
    "src/lib/util.ts": "/** Small helpers. */\n\n/** Doubles a number. */\nexport function twice(n: number): number {\n  return n * 2;\n}\n",
    "src/app/many.ts": `import { twice } from "../lib/util.ts";\n\n${Array.from({ length: count }, (_, i) => `export function f${i}(n: number): number {\n  return twice(n) + ${i};\n}\n`).join("\n")}`,
  });
  return dir;
}

function briefFiles(dir: string): string[] {
  const at = join(dir, "keylang/explain/brief");
  return existsSync(at) ? readdirSync(at).sort() : [];
}

test("explain --missing --llm reads every source once per wave, not once per brief: 32 briefs in 3 waves read a file no brief is about at most 6 times", async (t) => {
  const dir = manyRepo(t, 30);
  const tools = tempDir(t, "keylang-review-reads-");
  writeFileSync(join(tools, "count-reads.mjs"), COUNT_READS);
  const fake = fakeAgents(t, ["claude"], { reply: "Adds a number to twice the input." });
  const counted = join(tools, "reads.txt");
  const o = await keylang(dir, ["explain", "--missing", "--llm", "--jobs", "4"], fake, { COUNT_READS_OF: "/src/lib/util.ts", COUNT_READS_TO: counted }, ["--import", pathToFileURL(join(tools, "count-reads.mjs")).href]);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(o.stdout, "explained 32 of 32 node(s)\n");
  assert.equal(briefFiles(dir).length, 32);
  // The analysis reads it once; then wave 0 checks before its first write, waves 1 and 2 before they ask and before their first write.
  // Before, each of the 32 writes read the whole tree again: 33 reads.
  const reads = Number(readFileSync(counted, "utf8"));
  assert.ok(reads >= 1 && reads <= 6, `${reads} reads of src/lib/util.ts`);
});

test("explain --missing --llm: a source changed while a wave's first answer comes in stops the batch with nothing written; a change later in the wave stops it before the next wave asks, and the wave's briefs stay", async (t) => {
  const plan = ["app.many.f0", "app.many.f1", "app.many.f2", "app.many", "app"];
  // During the first answer: the wave's first write finds it.
  const first = manyRepo(t, 3);
  const firstFake = fakeAgents(t, ["claude"], { reply: "Adds a number." });
  editBeforeAnswer(firstFake);
  const stopped = await keylang(first, ["explain", "--missing", "--llm", "--jobs", "1"], firstFake, { EDIT_FILE: join(first, "src/lib/util.ts"), EDIT_TEXT: EDITED, EDIT_ON_CALL: "1" });
  assert.equal(stopped.status, 1, stopped.stderr);
  assert.equal(stopped.stdout, "explained 0 of 5 node(s)\n");
  assert.match(stopped.stderr, /^keylang: src\/lib\/util\.ts: changed on disk while the batch was computed$/m);
  assert.equal(firstFake.calls().length, 1, "no request after the change is found");
  assert.deepEqual(briefFiles(first), []);
  assert.ok(readFileSync(join(first, "src/lib/util.ts"), "utf8").endsWith(EDITED), "the new bytes stay");

  // During the second answer of wave 0: the wave goes on, the next wave asks nothing.
  const later = manyRepo(t, 3);
  const laterFake = fakeAgents(t, ["claude"], { reply: "Adds a number." });
  editBeforeAnswer(laterFake);
  const outdated = await keylang(later, ["explain", "--missing", "--llm", "--jobs", "1"], laterFake, { EDIT_FILE: join(later, "src/lib/util.ts"), EDIT_TEXT: EDITED, EDIT_ON_CALL: "2" });
  assert.equal(outdated.status, 1, outdated.stderr);
  assert.equal(outdated.stdout, "explained 3 of 5 node(s)\n");
  assert.match(outdated.stderr, /^keylang: src\/lib\/util\.ts: changed on disk while the batch was computed$/m);
  assert.deepEqual(laterFake.calls().length, 3, "wave 1 starts no request");
  assert.deepEqual(briefFiles(later), plan.slice(0, 3).map((id) => `${id}.md`));
  // A rerun asks only for what is left.
  const rerun = await keylang(later, ["explain", "--missing", "--llm", "--jobs", "1"], laterFake);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(rerun.stdout, "explained 2 of 2 node(s)\n");
});

// ---------- 3. draft map --mode llm: one JSON object from the answer ----------

test("draft map --mode llm: the ```json block, else the first balanced object of the answer; an answer without one is code 2 naming it", async (t) => {
  const dir = copy(t, { agent: "cli:claude" });
  const before = readFileSync(join(dir, "keylang.json"), "utf8");
  for (const [reply, layers] of [
    ['Here you go: {"domain": ["src/domain/**"]} and also {"x": 1}', { domain: ["src/domain/**"] }],
    ['A layer is {name: globs}. Mine:\n{"core": ["src/domain/**"], "edge": ["src/app/**", "src/infra/**"]}\nDone.', { core: ["src/domain/**"], edge: ["src/app/**", "src/infra/**"] }],
    ['Like {"x": 1}, but:\n```json\n{"domain": ["src/domain/**"], "app": ["src/{app,infra}/**"]}\n```', { domain: ["src/domain/**"], app: ["src/{app,infra}/**"] }],
  ] as const) {
    const fake = fakeAgents(t, ["claude"], { reply });
    const o = await keylang(dir, ["draft", "map", "--mode", "llm"], fake);
    assert.equal(o.status, 0, `${reply}: ${o.stderr}`);
    assert.deepEqual((JSON.parse(o.stdout) as { layers: unknown }).layers, layers, reply);
  }
  for (const reply of ["I cannot group these files.", "```json\n[\"src/**\"]\n```", "{\"domain\": [\"src/domain/**\"]"]) {
    const fake = fakeAgents(t, ["claude"], { reply });
    const o = await keylang(dir, ["draft", "map", "--mode", "llm"], fake);
    assert.equal(o.status, 2, reply);
    assert.equal(o.stdout, "");
    assert.equal(o.stderr, "keylang: draft map: the model did not answer with one JSON object\n", reply);
  }
  assert.equal(readFileSync(join(dir, "keylang.json"), "utf8"), before, "keylang.json is never written");
  // A brace inside a JSON string does not end the object.
  assert.deepEqual(answerObject('{"a": ["src/}{/**"], "b": "x\\"}"} {"c": 1}'), { a: ["src/}{/**"], b: 'x"}' });
});

// ---------- 4. export target: the spec directory as the config reads it ----------

test("export: with `dir: ./keylang` the map and the explained map under keylang/ are the generator's, as `keylang map` reads the same config; a spec directory `.` owns map/", async (t) => {
  const dir = copy(t, { dir: "./keylang" });
  for (const path of ["keylang/map/notes.md", "keylang/map-explained/notes.md", "keylang/map/app.md"]) {
    assert.equal(exportTargetProblem(dir, path), "a generated artifact: only its generator writes it", path);
    const exported = await runOperation({ kind: "export", root: dir, path, expect: null, source: { kind: "explain-edge", lines: ["a line"] } });
    assert.deepEqual([exported.status, exported.exitCode, exported.written], ["failed", 1, []], path);
    assert.deepEqual(exported.payload?.refused, [`${path}: a generated artifact: only its generator writes it`]);
    assert.ok(!existsSync(join(dir, path)), `${path} is not written`);
  }
  assert.equal(exportTargetProblem(dir, "keylang/notes.md"), null, "a spec file is the person's");
  // The caller's loaded config wins over the saved file.
  assert.equal(exportTargetProblem(dir, "specs/map/x.md", "specs"), "a generated artifact: only its generator writes it");
  const flat = copy(t, { dir: "." });
  assert.equal(exportTargetProblem(flat, "map/app.md"), "a generated artifact: only its generator writes it");
  assert.equal(exportTargetProblem(flat, "map-explained/README.md"), "a generated artifact: only its generator writes it");
});

// ---------- 5. spec-to-code --mode llm: the part of the file where the code goes ----------

/** `count` functions of four lines after an import: a module file far longer than the request shows. */
function longModule(count: number, tail = ""): string {
  return `import { createOrder, type Order } from "../domain/order.ts";\n\n${Array.from({ length: count }, (_, i) => `export function helper${i}(n: number): number {\n  return n + ${i};\n}\n`).join("\n")}${tail}`;
}

test("spec-to-code --mode llm sends the file's imports and the part where the code goes, not the whole file: the end of a module, the lines of a class", async (t) => {
  const flow = (id: string, signature: string): string => `# flow plan\n\n- planned fn ${id} ${signature}\n- trigger ${id}\n`;
  const reply = "```ts\nexport function refund(order: Order): Order {\n  return order;\n}\n```";
  // A function: appended to a module of 600 lines.
  const dir = copy(t, { agent: "cli:claude" }, { "src/app/refund.ts": longModule(150), "keylang/flows/refund.md": flow("app.refund.refund", "(order: Order) → Order") });
  const fake = fakeAgents(t, ["claude"], { reply });
  const o = await keylang(dir, ["spec-to-code", "app.refund.refund", "--mode", "llm", "--print"], fake);
  assert.equal(o.status, 0, o.stderr);
  const prompt = fake.calls()[0]!.stdin;
  assert.match(prompt, /File src\/app\/refund\.ts \(its head and the part where the code goes\):\n```\nimport \{ createOrder, type Order \} from "\.\.\/domain\/order\.ts";\n\n… \(lines 3–\d+ not shown\)\n/);
  assert.ok(prompt.includes("export function helper149(n: number): number {\n  return n + 149;\n}\n"), "the end of the file, where the function goes");
  assert.ok(!prompt.includes("export function helper0("), "the middle of the file is not sent");
  assert.ok(prompt.split("\n").length < 260, `${prompt.split("\n").length} lines`);
  // The candidate is still the whole file with the model's function at its end.
  assert.match(o.stdout, /\+export function refund\(order: Order\): Order \{\n\+ {2}return order;\n\+\}/);

  // A method: the class it goes into, not the functions before it.
  const method = "```ts\ncount(): number {\n  return 0;\n}\n```";
  const cls = copy(t, { agent: "cli:claude" }, {
    "src/infra/db.ts": longModule(150, "\nexport class Db {\n  query(sql: string): string[] {\n    return sql.split(\";\");\n  }\n}\n").replace('import { createOrder, type Order } from "../domain/order.ts";', 'import { writeFileSync } from "node:fs";'),
    "keylang/flows/count.md": flow("infra.db.Db.count", "() → number"),
  });
  const classFake = fakeAgents(t, ["claude"], { reply: method });
  const m = await keylang(cls, ["spec-to-code", "infra.db.Db.count", "--mode", "llm", "--print"], classFake);
  assert.equal(m.status, 0, m.stderr);
  const asked = classFake.calls()[0]!.stdin;
  assert.match(asked, /```\nimport \{ writeFileSync \} from "node:fs";\n\n… \(lines 3–\d+ not shown\)\nexport class Db \{\n {2}query\(sql: string\): string\[\] \{/);
  assert.ok(!asked.includes("helper149"), "the functions before the class are not sent");
  assert.match(m.stdout, /\+ {2}count\(\): number \{/);
  // A short file is sent whole, as before.
  const short = copy(t, { agent: "cli:claude" }, { "keylang/flows/refund.md": flow("app.refund.refund", "(order: Order) → Order"), "src/app/refund.ts": "export const policy = 1;\n" });
  const shortFake = fakeAgents(t, ["claude"], { reply });
  assert.equal((await keylang(short, ["spec-to-code", "app.refund.refund", "--mode", "llm", "--print"], shortFake)).status, 0);
  assert.match(shortFake.calls()[0]!.stdin, /File src\/app\/refund\.ts:\n```\nexport const policy = 1;\n\n```/);
});

// ---------- 6. the wrappers of a saved answer ----------

test("explain --llm saves the answer without a fence around all of it, and a brief without the remark before it; the batch's briefs too", async (t) => {
  const dir = copy(t);
  const short = await keylang(dir, ["explain", "app.checkout.checkout", "--llm"], fakeAgents(t, ["claude"], { reply: "```markdown\nChecks out an order: it creates the order and saves it.\n```" }), { KEYLANG_AGENT: "cli:claude" });
  assert.equal(short.status, 0, short.stderr);
  assert.match(readFileSync(join(dir, "keylang/explain/app.checkout.checkout.md"), "utf8"), /^<!-- keylang:explain [^\n]* detail=short -->\nChecks out an order: it creates the order and saves it\.\n$/);
  assert.doesNotMatch(short.stdout, /```/);
  const brief = await keylang(dir, ["explain", "domain.order.total", "--llm", "--brief"], fakeAgents(t, ["claude"], { reply: "Sure, here is the brief:\n\nSums the prices of the items." }), { KEYLANG_AGENT: "cli:claude" });
  assert.equal(brief.status, 0, brief.stderr);
  assert.match(readFileSync(join(dir, "keylang/explain/brief/domain.order.total.md"), "utf8"), /^<!-- keylang:explain [^\n]* detail=brief -->\nSums the prices of the items\.\n$/);
  const batch = await keylang(dir, ["explain", "--missing", "--llm", "--limit", "1"], fakeAgents(t, ["claude"], { reply: "Certainly!\n\n```\nCreates an order from its items.\n```" }), { KEYLANG_AGENT: "cli:claude" });
  assert.equal(batch.status, 0, batch.stderr);
  const [file] = readdirSync(join(dir, "keylang/explain/brief")).filter((name) => name !== "domain.order.total.md");
  assert.match(readFileSync(join(dir, "keylang/explain/brief", file!), "utf8"), /-->\nCreates an order from its items\.\n$/);
});

// Only the first paragraph can be a remark: short paragraphs after it are the explanation.
test("explain --llm keeps short paragraphs after the leading remark", async (t) => {
  const dir = copy(t);
  const reply = "Sure!\n\nIt sums.\n\nIt folds.\n\nThe total is returned to the checkout flow.";
  const run = await keylang(dir, ["explain", "domain.order.total", "--llm"], fakeAgents(t, ["claude"], { reply }), { KEYLANG_AGENT: "cli:claude" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(readFileSync(join(dir, "keylang/explain/domain.order.total.md"), "utf8"), /-->\nIt sums\.\n\nIt folds\.\n\nThe total is returned to the checkout flow\.\n$/);
  assert.equal(answerText("Certainly!\n\nSums prices.\n\nIt returns zero for an empty list of items."), "Sums prices.\n\nIt returns zero for an empty list of items.");
  assert.equal(answerText("Certainly!\n\n```markdown\nSums prices.\n\nIt returns zero.\n```"), "Sums prices.\n\nIt returns zero.", "a remark, then a fence around the answer");
  assert.equal(answerText("```markdown\nSure!\n\nSums prices.\n\nIt returns zero.\n```"), "Sums prices.\n\nIt returns zero.", "a remark inside the fence");
});

test("answerText: a remark is a first paragraph ending with `:` or of fewer than four words before more; a fence goes only when it holds the whole answer; headings, lists and code stay", () => {
  assert.equal(answerText("Here is the explanation:\n\n## What it is for\nIt sums.\n"), "## What it is for\nIt sums.");
  assert.equal(answerText("## What it is for\nIt sums.\n\n## Steps\nIt folds."), "## What it is for\nIt sums.\n\n## Steps\nIt folds.", "a full answer as written");
  assert.equal(answerText("~~~text\nIt sums.\n~~~"), "It sums.");
  assert.equal(answerText("````markdown\nIt sums the prices.\n\n```ts\nitems.reduce(add);\n```\n````"), "It sums the prices.\n\n```ts\nitems.reduce(add);\n```", "a longer fence around an inner one");
  assert.equal(answerText("```markdown\nIt sums.\n```\n\nAnd folds.\n\n```ts\nx();\n```"), "```markdown\nIt sums.\n```\n\nAnd folds.\n\n```ts\nx();\n```", "two blocks are the answer's own");
  assert.equal(answerText("```ts\nexport function f() {}\n```"), "```ts\nexport function f() {}\n```", "code is not unwrapped");
  assert.equal(answerText("- sums the items\n\n- folds them"), "- sums the items\n\n- folds them");
  assert.equal(answerText("Sure!"), "Sure!", "the only paragraph stays");
  assert.equal(answerText("It sums the prices of the items.\n\nIt folds them."), "It sums the prices of the items.\n\nIt folds them.");
  assert.equal(briefText("Sure! Here you go:\n\nSums the prices. It folds them. And more."), "Sums the prices. It folds them.");
  assert.equal(briefText("```\n```"), "");
});

// ---------- 7. exit codes of a draft whose inputs changed while the model answered ----------

test("draft flow, draft rules, code-to-spec and spec-to-code (proposal and --apply): an input changed while the model answered is code 1 with nothing written; usage is 2", async (t) => {
  const FLOW = "```markdown\n# flow checkout\n\n- trigger app.checkout.checkout\n```";
  const CODE = "```ts\nexport function refund(order: Order): Order {\n  return order;\n}\n```";
  const PLAN = { "keylang/flows/refund.md": "# flow refund\n\n- planned fn app.refund.refund (order: Order) → Order\n- trigger app.refund.refund\n", "src/app/refund.ts": "export const policy = 1;\n" };
  for (const [args, reply, edited, reason] of [
    [["draft", "flow", "app.checkout.checkout", "--mode", "llm"], FLOW, "src/domain/order.ts", "src/domain/order.ts: changed on disk while the draft was computed"],
    [["draft", "rules", "--mode", "llm"], "```markdown\n# rules\n\n- no-cycles\n```", "src/domain/order.ts", "src/domain/order.ts: changed on disk while the draft was computed"],
    [["code-to-spec", "src/app/checkout.ts:5", "--mode", "llm"], FLOW, "src/domain/order.ts", "src/domain/order.ts: changed on disk while the draft was computed"],
    [["spec-to-code", "app.refund.refund", "--mode", "llm"], CODE, "src/domain/order.ts", "src/domain/order.ts: changed on disk while the candidate was computed"],
    [["spec-to-code", "app.refund.refund", "--mode", "llm", "--apply"], CODE, "src/domain/order.ts", "src/domain/order.ts: changed on disk while the candidate was computed"],
    [["spec-to-code", "app.refund.refund", "--mode", "llm", "--apply"], CODE, "src/app/refund.ts", "src/app/refund.ts: changed on disk while the change was prepared; nothing written"],
  ] as const) {
    const dir = copy(t, { agent: "cli:claude" }, PLAN);
    const fake = fakeAgents(t, ["claude"], { reply });
    editBeforeAnswer(fake);
    const o = await keylang(dir, [...args], fake, { EDIT_FILE: join(dir, edited), EDIT_TEXT: EDITED });
    const name = `${args.join(" ")} (${edited})`;
    assert.equal(o.status, 1, `${name}: ${o.stderr}`);
    assert.ok(o.stderr.includes(`keylang: ${reason}\n`), `${name}: ${o.stderr}`);
    assert.ok(!existsSync(join(dir, ".keylang/proposals")), `${name}: no proposal`);
    assert.equal(readFileSync(join(dir, "src/app/refund.ts"), "utf8"), edited === "src/app/refund.ts" ? `export const policy = 1;\n${EDITED}` : "export const policy = 1;\n", `${name}: the code file is not written`);
  }
  const dir = copy(t, {}, PLAN);
  for (const args of [["draft", "flow"], ["draft", "rules", "--mode", "nope"], ["code-to-spec", "src/app/checkout.ts", "--since", "HEAD"], ["spec-to-code", "app.refund.refund", "--print", "--apply"], ["spec-to-code"]]) {
    const o = await keylang(dir, args, null);
    assert.equal(o.status, 2, `${args.join(" ")}: ${o.stderr}`);
  }
});

// ---------- 8. `dir: "."`: the spec directory is the root, and the paths keylang builds under it are plain ----------

test("with `dir: .` feature finds features/<slug>.md, baseline writes rules.baseline.md, explain --llm saves explain/<id>.md: no `./…` path reaches the write policy", async (t) => {
  const dir = copy(t, { dir: ".", agent: "cli:claude" }, { "features/f1.md": "# flow f1\n\n- trigger app.checkout.checkout\n", "rules.md": "# rules\n\n- layers domain < app\n  - infra\n" });
  rmSync(join(dir, "keylang"), { recursive: true, force: true });
  const checked = await keylang(dir, ["check"], null);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /features\/f1\.md:3:1: ID ok app\.checkout\.checkout/);
  const feature = await keylang(dir, ["feature", "f1"], null);
  assert.equal(feature.status, 0, feature.stderr);
  assert.match(feature.stderr, /^done$/m);
  const baseline = await keylang(dir, ["baseline"], null);
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.ok(existsSync(join(dir, "rules.baseline.md")), "the baseline lands at the root");
  assert.equal((await keylang(dir, ["baseline", "--check"], null)).status, 0);
  const fake = fakeAgents(t, ["claude"], { reply: "```markdown\nChecks out an order.\n```" });
  const explained = await keylang(dir, ["explain", "app.checkout.checkout", "--llm"], fake);
  assert.equal(explained.status, 0, explained.stderr);
  assert.ok(existsSync(join(dir, "explain/app.checkout.checkout.md")), "the explanation lands in explain/ at the root");
  assert.equal(fake.calls().length, 1);
  assert.equal(featureSlugOf("features/f1.md", "."), "f1");
  assert.equal(featureSlugOf("keylang/features/f1.md", "keylang"), "f1");
  assert.equal(featureSlugOf("features/f1.md", "keylang"), null);
});
