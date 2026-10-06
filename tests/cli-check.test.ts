// `keylang check` on the current code without `map`: IDs against the code,
// any spelling of the spec path, a layer moved in keylang.json, excluded and
// opaque modules, K001 in generated files, `--explain-edge`, the output
// formats and their exit codes, and keylang.json errors.

import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, mainRepo, repoCopy, tempDir, writeTree } from "./cli-helpers.ts";

test("check sees a new denied import without writing the map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const mapBefore = readFileSync(join(dir, "keylang/map/domain.md"), "utf8");
  const indexBefore = readFileSync(join(dir, ".keylang/index.json"), "utf8");
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K102/);
  assert.match(checked.stdout, /domain\.order/);
  assert.match(checked.stdout, /infra\.db/);
  assert.equal(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), mapBefore);
  assert.equal(readFileSync(join(dir, ".keylang/index.json"), "utf8"), indexBefore);
});

test("removing the last function of a complete module is K001", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/use.md"), "# flow use\n\n- step domain.order.createOrder\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  writeFileSync(join(dir, "src/domain/order.ts"), "export const marker = 1;\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K001/);
  assert.match(checked.stdout, /domain\.order\.createOrder/);
});

test("check finds the snapshot for any spelling of the spec path", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  for (const [cwd, args] of [
    [dir, ["check", "keylang"]],
    [dir, ["check", "./keylang"]],
    [dir, ["check", join(dir, "keylang")]],
    [join(dir, "keylang"), ["check", "."]],
    [join(dir, "src"), ["check"]],
  ] as const) {
    const checked = keylang(cwd, [...args]);
    assert.equal(checked.status, 1, `${cwd} ${args.join(" ")}\n${checked.stdout}`);
    assert.match(checked.stdout, /K102/);
  }
});

test("check sees a layer moved in keylang.json without map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const before = readFileSync(join(dir, "keylang/map/app.md"), "utf8");
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  config.layers = { domain: ["src/domain/**", "src/app/**"], infra: "src/infra/**" };
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(config));
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /src\/app\/checkout\.ts:\d+:\d+: K102 divergence: `domain\.checkout` depends on `infra\.db`/);
  assert.equal(readFileSync(join(dir, "keylang/map/app.md"), "utf8"), before);
});

test("a flow id resolves against current code, not the committed map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/use.md"), "# flow use\n\n- step domain.order.createOrder\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  writeFileSync(join(dir, "src/domain/order.ts"), "export function createOrders(): void {}\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /keylang\/flows\/use\.md:3:8: K001 dangling reference `domain\.order\.createOrder` \(did you mean `domain\.order\.createOrders`\?\); declare `planned` if this is an intention/);
});

test("a member of an explicitly excluded file is unverified, not K001", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/use.md"), "# flow use\n\n- step domain.order.createOrder\n");
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  config.exclude = ["src/domain/order.ts"];
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(config));
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.doesNotMatch(checked.stdout, /K001/);
  assert.match(checked.stdout, /keylang\/flows\/use\.md:3:1: ID unverified domain\.order\.createOrder: opaque module/);
  // One ID verdict for the reference, not a second resolver line for the same position.
  assert.doesNotMatch(checked.stdout, /: unverified opaque module `domain\.order`/);
  assert.match(checked.stdout, /static unverified domain\.order\.createOrder: not in the snapshot \(opaque module\)/);
  assert.match(checked.stdout, /keylang\/rules\.md:3:1: unverified excluded by keylang\.json/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.match(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), /module \[order\]\([^)]*\) <!-- excluded -->/);
});

test("explain-edge prints the import and writes nothing", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = readdirSync(dir);
  const explained = keylang(dir, ["check", "--explain-edge", "app.checkout", "domain.order"]);
  assert.equal(explained.status, 0, explained.stderr);
  assert.match(explained.stdout, /import resolved syntactic/);
  assert.match(explained.stdout, /src\/app\/checkout\.ts:\d+:\d+/);
  assert.deepEqual(readdirSync(dir), before);
  const unknown = keylang(dir, ["check", "--explain-edge", "no.such", "domain.order"]);
  assert.equal(unknown.status, 2, unknown.stderr);
  const tail = keylang(dir, ["check", "--explain-edge", "app.checkout.nonexistent", "domain.order"]);
  assert.equal(tail.status, 2, tail.stdout);
  assert.match(tail.stderr, /unknown id `app\.checkout\.nonexistent`/);
});

test("explain-edge lists import and call edges in a stable order, and holes when there is no edge", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const both = keylang(dir, ["check", "--explain-edge", "app", "domain"]);
  assert.equal(both.status, 0, both.stderr);
  const lines = both.stdout.trimEnd().split("\n");
  assert.ok(lines.some((line) => /^call resolved syntactic src\/app\/checkout\.ts:\d+:\d+-\d+:\d+ .* app\.checkout\.\w+ → domain\.order\.\w+$/.test(line)), both.stdout);
  assert.ok(lines.some((line) => /^import resolved syntactic src\/app\/checkout\.ts:1:1-/.test(line)), both.stdout);
  assert.deepEqual(lines, [...lines].sort((a, b) => (a.split(" ")[0]! < b.split(" ")[0]! ? -1 : a.split(" ")[0]! > b.split(" ")[0]! ? 1 : 0)));
  assert.equal(keylang(dir, ["check", "--explain-edge", "app", "domain"]).stdout, both.stdout);
  const small = mainRepo(t, { "src/a.ts": "export function a(): void {}\n", "src/b.ts": "export function b(): void {}\n" }, "");
  const clean = keylang(small, ["check", "--explain-edge", "main.a", "main.b"]);
  assert.equal(clean.stdout, "no edge, coverage complete\n");
  appendFileSync(join(small, "src/a.ts"), "export function later(cb: () => void): void { cb(); }\n");
  const holed = keylang(small, ["check", "--explain-edge", "main.a", "main.b"]);
  assert.equal(holed.stdout, "no confirmed edge; 1 unresolved construct(s) in `main.a` could form one\nunresolved src/a.ts:2:47 call through a local value `cb`\n");
});

test("K001 in a generated file names its generator instead of planned; a manual file keeps the planned hint", (t) => {
  const dir = tempDir(t, "keylang-k001-generated-");
  writeTree(dir, {
    "package.json": '{"name":"r","type":"module"}\n',
    "src/db/db.ts": "export function save(x: string) { return x; }\n",
    "src/users/users.ts": 'import { save } from "../db/db.ts";\nexport function createUser() { return save("u"); }\n',
    "src/main.ts": 'import { createUser } from "./users/users.ts";\ncreateUser();\n',
  });
  assert.equal(keylang(dir, ["init", "--agents=none"]).status, 0);
  // Rename layer `db` to `storage`: the baseline and the old map still name `db`.
  const config = join(dir, "keylang.json");
  writeFileSync(config, readFileSync(config, "utf8").replace('"db"', '"storage"'));
  // `check` skips maps under map/, so a map copied elsewhere shows that the command comes from the marker.
  const usersMap = readFileSync(join(dir, "keylang/map/users.md"), "utf8");
  writeFileSync(join(dir, "keylang/old-users.md"), usersMap.replace("# map", "# rules").replace(/\n- users[\s\S]*$/, "\n- deny users db.db\n"));
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny users ghost\n");
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stderr);
  const k001 = o.stdout.split("\n").filter((line) => line.includes(" K001 "));
  assert.ok(k001.includes("keylang/rules.baseline.md:5:8: K001 dangling reference `db` in a generated file; run `keylang baseline`"), o.stdout);
  assert.ok(k001.includes("keylang/rules.baseline.md:6:13: K001 dangling reference `db` in a generated file; run `keylang baseline`"), o.stdout);
  assert.ok(k001.some((line) => /^keylang\/old-users\.md:\d+:\d+: K001 dangling reference `db\.db` in a generated file; run `keylang map`$/.test(line)), o.stdout);
  assert.ok(k001.includes("keylang/rules.md:3:14: K001 dangling reference `ghost`; declare `planned` if this is an intention"), o.stdout);
  assert.equal(k001.filter((line) => /did you mean|planned/.test(line)).length, 1, o.stdout);
  const rows = (JSON.parse(keylang(dir, ["check", "--format", "json"]).stdout) as { results: { file: string; code: string | null; evidence: string }[] }).results;
  const evidence = rows.filter((row) => row.code === "K001" && row.file === "keylang/rules.baseline.md").map((row) => row.evidence);
  assert.deepEqual(evidence, Array(2).fill("dangling reference `db` in a generated file; run `keylang baseline`"));
});

test("a missing member of an opaque module is unverified", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/ext.md"), "# flow ext\n\n- step external.node.readFile\n");
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /ID unverified external\.node\.readFile: opaque module/);
  assert.doesNotMatch(checked.stdout, /K001 dangling reference `external\.node\.readFile`/);
});

test("check formats share the exit code", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\n');
  const human = keylang(dir, ["check", "--format", "human"]);
  const json = keylang(dir, ["check", "--format", "json"]);
  const sarif = keylang(dir, ["check", "--format", "sarif"]);
  const github = keylang(dir, ["check", "--format", "github"]);
  assert.equal(human.status, 1);
  assert.equal(json.status, human.status);
  assert.equal(sarif.status, human.status);
  assert.equal(github.status, human.status);
  const body = JSON.parse(json.stdout);
  assert.ok(Array.isArray(body.results));
  assert.ok(body.results.some((row: { verdict: string; code: string }) => row.verdict === "fail" && row.code === "K102"));
  assertSarif(JSON.parse(sarif.stdout));
  assert.match(github.stdout, /::error /);
  const bad = keylang(dir, ["check", "--format", "xml"]);
  assert.equal(bad.status, 2);
});

/** The structure SARIF 2.1.0 requires of what keylang writes (checked offline). */
function assertSarif(report: any): void {
  assert.equal(report.version, "2.1.0");
  assert.match(report.$schema, /sarif-schema-2\.1\.0\.json$/);
  assert.ok(Array.isArray(report.runs) && report.runs.length === 1);
  const run = report.runs[0];
  assert.equal(typeof run.tool.driver.name, "string");
  const ids = (run.tool.driver.rules as { id: string; shortDescription: { text: string } }[]).map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const result of run.results) {
    assert.ok(["error", "warning", "note", "none"].includes(result.level), result.level);
    assert.equal(typeof result.message.text, "string");
    assert.equal(ids[result.ruleIndex], result.ruleId);
    for (const location of result.locations) {
      const physical = location.physicalLocation;
      assert.equal(typeof physical.artifactLocation.uri, "string");
      assert.ok(Number.isInteger(physical.region.startLine) && physical.region.startLine >= 1);
      assert.ok(Number.isInteger(physical.region.startColumn) && physical.region.startColumn >= 1);
    }
  }
}

test("formats carry fail, warning, unverified, and coverage; --strict exits alike", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Not reachable from the entry, and the only unresolved import is its own.
  writeFileSync(join(dir, "src/domain/lonely.ts"), 'import { gone } from "./missing.ts";\nexport const lonely = gone;\n');
  const results = (args: string[]): { status: number | null; stdout: string } => keylang(dir, ["check", ...args]);
  const json = results(["--format", "json"]);
  assert.equal(json.status, 0, json.stdout);
  const body = JSON.parse(json.stdout) as { snapshotId: string; results: { criterion: string; area: string; verdict: string; evidence: string; snapshotId: string; code: string | null }[]; coverage: { reason: string }[] };
  const k103 = body.results.find((row) => row.code === "K103");
  assert.ok(k103, json.stdout);
  assert.equal(k103.verdict, "warning");
  assert.equal(k103.criterion, "entry");
  assert.equal(k103.area, "domain.lonely");
  const unverified = body.results.find((row) => row.verdict === "unverified" && row.criterion === "deny domain infra");
  assert.ok(unverified && unverified.snapshotId === body.snapshotId, json.stdout);
  assert.ok(body.coverage.some((item) => item.reason === "unresolved import `./missing.ts`"));
  for (const format of ["human", "json", "sarif", "github"]) {
    assert.equal(results(["--format", format]).status, 0, format);
    assert.equal(results(["--format", format, "--strict"]).status, 1, format);
  }
  const sarif = JSON.parse(results(["--format", "sarif"]).stdout);
  assertSarif(sarif);
  const levels = (sarif.runs[0].results as { level: string; ruleId: string }[]).map((result) => `${result.ruleId}:${result.level}`);
  assert.ok(levels.includes("K103:warning"), levels.join(" "));
  assert.ok(levels.includes("unverified:note"), levels.join(" "));
  const github = results(["--format", "github"]).stdout;
  assert.match(github, /^::warning file=src\/domain\/lonely\.ts,line=1,col=1,title=K103::absence: module `domain\.lonely`/m);
  assert.match(github, /^::notice file=keylang\/rules\.md,line=5,col=1,title=unverified::unresolved import `\.\/missing\.ts` \(src\/domain\/lonely\.ts:1:1\)$/m);
  const denyOk = JSON.parse(results(["--format", "json"]).stdout).results as { criterion: string; verdict: string; evidence: string; specHash?: string }[];
  const convergence = denyOk.filter((row) => row.verdict === "ok");
  assert.ok(convergence.every((row) => /^convergence: /.test(row.evidence) && /^[0-9a-f]{64}$/.test(row.specHash ?? "")), JSON.stringify(convergence));
  const bad = keylang(dir, ["check", "--format", "xml"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown --format `xml`; expected human, json, sarif, github/);
});

test("keylang.json errors name the file and the field, exit 2", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  const cases: [unknown, RegExp][] = [
    [{ ...config, check: { tests: "reports/none.json" } }, /keylang\.json: check\.tests: no such file `reports\/none\.json`/],
    [{ ...config, check: { tests: 5 } }, /keylang\.json: `check\.tests` must be a path, got 5/],
    [{ ...config, check: { junit: "x" } }, /keylang\.json: unknown field `check\.junit`/],
    [{ ...config, languages: ["cobol"] }, /keylang\.json: `languages\[0\]` must be one of "javascript", "php", "python", "rust", "typescript", got "cobol"/],
    [{ ...config, layers: { domain: 1 } }, /keylang\.json: `layers\.domain` must be a glob or an array of globs, got 1/],
  ];
  for (const [body, message] of cases) {
    writeFileSync(join(dir, "keylang.json"), JSON.stringify(body));
    const checked = keylang(dir, ["check"]);
    assert.equal(checked.status, 2, checked.stdout + checked.stderr);
    assert.match(checked.stderr, message);
  }
  writeFileSync(join(dir, "keylang.json"), "{ nope");
  const broken = keylang(dir, ["map"]);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /keylang\.json: invalid JSON/);
});
