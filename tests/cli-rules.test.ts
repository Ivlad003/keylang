// Rules against the code: deny and layer order, dynamic imports and workers,
// what leaves a deny unverified, `exports`, `no-cycles` and `entry`.

import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, mainRepo, repoCopy } from "./cli-helpers.ts";

// A forbidden import in the domain: deny, layer order and a cycle are all
// reported as divergences; `map --check` notices the stale map first.
test("check reports rule divergences after a forbidden import", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  appendFileSync(
    join(dir, "src/domain/order.ts"),
    'import { save } from "../infra/db.ts";\nimport { checkout } from "../app/checkout.ts";\n\nexport function reorder(o: Order): Order {\n  save(o);\n  return checkout(o.id, [o.total]);\n}\n',
  );
  const stale = keylang(dir, ["map", "--check"]);
  assert.equal(stale.status, 1);
  assert.equal(stale.stdout, "keylang/map/domain.md: stale, run `keylang map`\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /src\/domain\/order\.ts:\d+:\d+: K102 divergence: `domain\.order` depends on `infra\.db`/);
  assert.match(o.stdout, /src\/domain\/order\.ts:\d+:\d+: K101 divergence: `domain\.order` depends on `app\.checkout`/);
  assert.match(o.stdout, /K105 divergence: dependency cycle app\.checkout → domain\.order → app\.checkout/);
});

test("a literal import() inside a function is a denied dependency", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(
    join(dir, "src/domain/order.ts"),
    "export async function load(): Promise<void> {\n  const { save } = await import(\"../infra/db.ts\");\n  save({});\n}\n",
  );
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /src\/domain\/order\.ts:\d+:\d+: K102/);
});

test("unresolved import makes deny unverified unless --strict", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { missing } from "./missing.ts";\n');
  const loose = keylang(dir, ["check"]);
  assert.equal(loose.status, 0, loose.stdout + loose.stderr);
  assert.match(loose.stdout, /unverified/);
  assert.match(loose.stdout, /missing\.ts/);
  assert.match(loose.stderr, /unverified/);
  const strict = keylang(dir, ["check", "--strict"]);
  assert.equal(strict.status, 1, strict.stderr);
  assert.match(strict.stdout, /unverified/);
});

test("a worker loaded by URL is a module edge, and deleting the worker is reported", (t) => {
  const files = {
    "src/cli.ts": 'import { start } from "./pool.ts";\nexport function main(): void {\n  start();\n}\n',
    "src/pool.ts": [
      'import { Worker } from "node:worker_threads";',
      "export function start(): Worker {",
      '  return new Worker(new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js", import.meta.url));',
      "}",
      "",
    ].join("\n"),
    "src/worker.ts": 'import { parentPort } from "node:worker_threads";\nparentPort?.on("message", () => {});\n',
    "src/hooks.ts": "export async function load(url: string, context: unknown, next: (u: string, c: unknown) => unknown): Promise<unknown> {\n  return next(url, context);\n}\n",
    "src/trace.ts": 'import { register } from "node:module";\nconst hooks = import.meta.url.endsWith(".ts") ? "./hooks.ts" : "./hooks.js";\nregister(hooks, { parentURL: import.meta.url });\n',
  };
  // The worker runs in its own thread, so it stays an entry; the edge now backs the entry.
  const dir = mainRepo(t, files, "- layers main\n- entry\n  - main.cli\n  - main.trace\n  - main.worker\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = readFileSync(join(dir, "keylang/map/main.md"), "utf8");
  assert.match(map, /- module \[pool\][^\n]*\n(\s+- [^\n]*\n)*?\s+- worker main\.worker\n/);
  assert.match(map, /- module \[trace\][^\n]*\n(\s+- [^\n]*\n)*?\s+- hooks main\.hooks\n/);
  const ok = keylang(dir, ["check", "--strict"]);
  assert.equal(ok.status, 0, ok.stdout);
  rmSync(join(dir, "src/worker.ts"));
  const gone = keylang(dir, ["check"]);
  assert.equal(gone.status, 1, gone.stdout);
  assert.match(gone.stdout, /keylang\/rules\.md:7:5: K001 dangling reference `main\.worker`/);
  const mapped = keylang(dir, ["map"]);
  assert.match(mapped.stderr, /src\/pool\.ts:3: unresolved import `\.\/worker\.ts`/);
  // Without the entry line the gap still blocks a clean `--strict`: the missing module may be anything.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- layers main\n- deny main.pool main.cli\n");
  const strict = keylang(dir, ["check", "--strict"]);
  assert.equal(strict.status, 1, strict.stdout);
  assert.match(strict.stdout, /rules\.md:4:1: unverified unresolved import `\.\/worker\.(ts|js)` \(src\/pool\.ts:3:21\)/);
});

test("exports lists extra public names and a missing one", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  appendFileSync(
    join(dir, "src/domain/order.ts"),
    "function extra() { return 1; }\nexport { extra };\nexport const secretFlag = true;\nexport class ExtraClass {}\nexport type ExtraType = string;\n",
  );
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- layers domain < app\n  - infra\n- module domain.order\n  - exports total, notAName\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  for (const name of ["extra", "secretFlag", "ExtraClass", "ExtraType", "createOrder"]) {
    assert.match(checked.stdout, new RegExp(`exports \`${name}\``));
  }
  assert.match(checked.stdout, /does not export `notAName`/);
});

test("exports compares aliases, default, and export * names, not map ids", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "src/domain/parts.ts"), "export function fromX(): number { return 1; }\nexport const valX = 1;\nexport default 3;\n");
  writeFileSync(
    join(dir, "src/domain/order.ts"),
    'export * from "./parts.ts";\nconst a = 1;\nexport { a as b };\nfunction extra(): number { return a; }\nexport { extra };\nexport default function main(): void {}\n',
  );
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module domain.order\n  - exports fromX, valX, b, extra, default\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.doesNotMatch(checked.stdout, /K001|K104/);
  assert.match(checked.stderr, /0 fail, 0 unverified, 1 ok/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = readFileSync(join(dir, "keylang/map/domain.md"), "utf8");
  assert.match(map, /- fn \[extra\]\([^)]*\)(?! <!-- internal -->)/);
  assert.doesNotMatch(map, /extra\]\([^)]*\).*internal/);
});

test("export * from an opaque module leaves exports unverified", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'export * from "node:path";\n');
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module domain.order\n  - exports Order, total, createOrder, join\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.match(checked.stdout, /keylang\/rules\.md:4:3: unverified re-export from external `node:path`/);
  assert.doesNotMatch(checked.stdout, /K104|K001/);
});

test("one failing deny does not hide the verdicts of other denies", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nimport { gone } from "./missing.ts";\nexport function keep(o: Order): void { save(o); gone(); }\n');
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n- deny domain app\n- deny app domain\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K102 divergence: `domain\.order` depends on `infra\.db`, which is denied by `deny domain infra` \(keylang\/rules\.md:3\)/);
  assert.match(checked.stdout, /keylang\/rules\.md:4:1: unverified unresolved import `\.\/missing\.ts` \(src\/domain\/order\.ts:\d+:\d+\)/);
  assert.match(checked.stdout, /keylang\/rules\.md:5:1: K102|src\/app\/checkout\.ts:\d+:\d+: K102 divergence: `app\.checkout` depends on `domain\.order`/);
});

test("calls through local values do not make deny unverified", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), "export function each(xs: number[], f: (n: number) => void): void { xs.forEach(f); f(1); }\n");
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const checked = keylang(dir, ["check", "--strict"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.match(checked.stderr, /0 fail, 0 unverified, 1 ok/);
});

test("no-cycles reports the component that contains d", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-cycle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`);
  writeFileSync(join(dir, "src/a.ts"), 'import "./b.ts";\nimport "./d.ts";\nexport const a = 1;\n');
  writeFileSync(join(dir, "src/b.ts"), 'import "./c.ts";\nexport const b = 1;\n');
  writeFileSync(join(dir, "src/c.ts"), 'import "./a.ts";\nexport const c = 1;\n');
  writeFileSync(join(dir, "src/d.ts"), 'import "./c.ts";\nexport const d = 1;\n');
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module main.d\n  - no-cycles\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K105/);
  assert.match(checked.stdout, /main\.d/);
});

test("entry does not treat a sibling as reachable", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-entry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src/pkg"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`);
  writeFileSync(join(dir, "src/pkg/live.ts"), "export const live = 1;\n");
  writeFileSync(join(dir, "src/pkg/dead.ts"), "export const dead = 1;\n");
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- entry\n  - main.pkg.live\n");
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /K103/);
  assert.match(checked.stdout, /main\.pkg\.dead/);
  assert.doesNotMatch(checked.stdout, /main\.pkg\.live[\s\S]*K103[\s\S]*main\.pkg\.live/);
});

test("no-cycles: a self-import is a cycle, two cycles are two findings, an acyclic graph is quiet", (t) => {
  const self = mainRepo(t, { "src/a.ts": 'import "./a.ts";\nexport const a = 1;\n' }, "- no-cycles\n");
  const selfChecked = keylang(self, ["check"]);
  assert.equal(selfChecked.status, 1, selfChecked.stdout);
  assert.match(selfChecked.stdout, /K105 divergence: dependency cycle main\.a → main\.a/);
  const two = mainRepo(
    t,
    { "src/a.ts": 'import "./b.ts";\n', "src/b.ts": 'import "./a.ts";\n', "src/c.ts": 'import "./d.ts";\n', "src/d.ts": 'import "./c.ts";\n' },
    "- no-cycles\n",
  );
  const twoChecked = keylang(two, ["check"]);
  assert.equal(twoChecked.stdout.match(/K105/g)?.length, 2, twoChecked.stdout);
  const none = mainRepo(t, { "src/a.ts": 'import "./b.ts";\n', "src/b.ts": "export const b = 1;\n" }, "- no-cycles\n");
  const quiet = keylang(none, ["check"]);
  assert.equal(quiet.status, 0, quiet.stdout);
  assert.doesNotMatch(quiet.stdout, /K105/);
});

test("no-cycles under a directory module routes through that module", (t) => {
  const dir = mainRepo(
    t,
    { "src/a.ts": 'import "./pkg/y.ts";\nimport "./b.ts";\n', "src/b.ts": 'import "./a.ts";\n', "src/pkg/y.ts": 'import "../a.ts";\n' },
    "- module main.pkg\n  - no-cycles\n",
  );
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K105 divergence: dependency cycle main\.pkg\.y → main\.a → main\.pkg\.y/);
});

test("entry follows re-exports, skips directory modules, and names the hole", (t) => {
  const dir = mainRepo(
    t,
    {
      "src/main.ts": 'import { a } from "./lib/index.ts";\nexport const run = a;\n',
      "src/lib/index.ts": 'export * from "./a.ts";\nexport { b } from "./b.ts";\n',
      "src/lib/a.ts": "export const a = 1;\n",
      "src/lib/b.ts": "export const b = 1;\n",
      "src/lib/c.ts": "export const c = 1;\n",
    },
    "- entry\n  - main.main\n",
  );
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /K103 absence: module `main\.lib\.c` is not reachable/);
  assert.doesNotMatch(checked.stdout, /`main\.lib\.(a|b|index)`|`main\.lib` is not/);
  appendFileSync(join(dir, "src/main.ts"), 'import "./missing.ts";\n');
  const holed = keylang(dir, ["check"]);
  assert.doesNotMatch(holed.stdout, /K103/);
  assert.match(holed.stdout, /unverified not reached, but unresolved import `\.\/missing\.ts` \(src\/main\.ts:3:1\) may reach it/);
});
