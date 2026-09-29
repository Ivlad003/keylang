// Rule areas, deny ties, specHash identity, and declared external packages.
// Every case drives `keylang check` on a temporary repository.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-rules-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    write(dir, path, text);
  }
  return dir;
}

const config = (layers: Record<string, string>, extra: Record<string, unknown> = {}): string => `${JSON.stringify({ languages: ["typescript"], layers, ...extra })}\n`;

interface Row {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
  specHash: string;
  file: string;
  line: number;
  code: string | null;
  reason?: string;
}

function check(dir: string, args: string[] = []): { status: number | null; stderr: string; stdout: string; results: Row[] } {
  const run = keylang(dir, ["check", "--format", "json", ...args]);
  const parsed = JSON.parse(run.stdout) as { results: Row[] };
  return { status: run.status, stderr: run.stderr, stdout: run.stdout, results: parsed.results };
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const cycleFiles = {
  "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }),
  "src/app/a.ts": 'import { b } from "../infra/b.ts";\nexport function a(): void {\n  b();\n}\n',
  "src/infra/b.ts": 'import { a } from "../app/a.ts";\nexport function b(): void {\n  a();\n}\n',
  "keylang/rules.md": "# rules\n\n- module app.a\n  - no-cycles\n",
};

test("no-cycles under a module counts a hole in a module it imports", (t) => {
  const dir = repo(t, cycleFiles);
  const found = check(dir);
  assert.equal(found.status, 1, found.stdout);
  const fail = found.results.find((row) => row.code === "K105");
  assert.ok(fail, found.stdout);
  assert.match(fail.evidence, /app\.a → infra\.b → app\.a/);
  assert.equal(fail.file, "keylang/rules.md");
  assert.equal(fail.line, 4);

  write(dir, "keylang.json", config({ app: "src/app/**", infra: "src/infra/**" }, { exclude: ["src/infra/b.ts"] }));
  const hidden = check(dir);
  assert.equal(hidden.status, 0, hidden.stdout);
  const row = hidden.results.find((item) => item.criterion === "no-cycles");
  assert.ok(row, hidden.stdout);
  assert.equal(row.verdict, "unverified");
  assert.match(row.evidence, /src\/infra\/b\.ts:1:1/);
  assert.equal(keylang(dir, ["check", "--strict"]).status, 1);

  write(dir, "keylang.json", config({ app: "src/app/**", infra: "src/infra/**" }));
  write(dir, "src/infra/b.ts", 'import { m } from "./missing.ts";\nexport function b(): void {}\n');
  write(dir, "src/app/a.ts", 'import { b } from "../infra/b.ts";\nexport function a(): void {\n  b();\n}\n');
  const unresolved = check(dir);
  assert.equal(unresolved.status, 0, unresolved.stdout);
  const hole = unresolved.results.find((item) => item.criterion === "no-cycles");
  assert.equal(hole?.verdict, "unverified");
  assert.match(hole?.evidence ?? "", /src\/infra\/b\.ts/);

  write(dir, "src/infra/c.ts", 'import { m } from "./missing.ts";\nexport function c(): void {}\n');
  const aside = check(dir);
  const still = aside.results.find((item) => item.criterion === "no-cycles");
  assert.equal(still?.verdict, "unverified", aside.stdout);

  write(dir, "src/infra/b.ts", "export function b(): void {}\n");
  write(dir, "src/app/a.ts", 'import { b } from "../infra/b.ts";\nexport function a(): void {\n  b();\n}\n');
  write(dir, "src/other/z.ts", "export function z(): void {}\n");
  write(dir, "keylang.json", config({ app: "src/app/**", infra: "src/infra/**" }));
  const outside = check(dir);
  const clean = outside.results.find((item) => item.criterion === "no-cycles");
  assert.equal(clean?.verdict, "ok", outside.stdout);
});

test("a layers hole covers the connected order and not a disconnected one", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ a: "src/a/**", b: "src/b/**", c: "src/c/**" }, { exclude: ["src/a/x.ts"] }),
    "src/a/x.ts": 'import { y } from "../c/y.ts";\nexport function x(): void {\n  y();\n}\n',
    "src/b/m.ts": "export function m(): void {}\n",
    "src/c/y.ts": "export function y(): void {}\n",
    "keylang/rules.md": "# rules\n\n- layers a < b\n- layers b < c\n",
  });
  const connected = check(dir);
  assert.equal(connected.status, 0, connected.stdout);
  const lines = connected.results.filter((row) => row.criterion.startsWith("layers"));
  assert.equal(lines.length, 2, connected.stdout);
  assert.ok(lines.every((row) => row.verdict === "unverified" && /src\/a\/x\.ts:1:1/.test(row.evidence)), connected.stdout);

  write(dir, "src/c/y.ts", 'import { n } from "../d/n.ts";\nexport function y(): void {\n  n();\n}\n');
  write(dir, "keylang/rules.md", "# rules\n\n- layers a < b\n- layers c < d\n");
  write(dir, "keylang.json", config({ a: "src/a/**", b: "src/b/**", c: "src/c/**", d: "src/d/**" }, { exclude: ["src/c/y.ts"] }));
  write(dir, "src/d/n.ts", "export function n(): void {}\n");
  const split = check(dir);
  const ab = split.results.find((row) => row.criterion === "layers a < b");
  const cd = split.results.find((row) => row.criterion === "layers c < d");
  assert.equal(ab?.verdict, "ok", split.stdout);
  assert.equal(cd?.verdict, "unverified", split.stdout);
  assert.match(cd?.evidence ?? "", /src\/c\/y\.ts:1:1/);
});

test("two denies of equal depth each fail; a deeper deny is the only K102", (t) => {
  const files = {
    "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }),
    "src/app/x.ts": 'import { save } from "../infra/db.ts";\nexport function x(): void {\n  save();\n}\n',
    "src/infra/db.ts": "export function save(): void {}\n",
  };
  const tied = repo(t, { ...files, "keylang/rules.md": "# rules\n\n- deny app.x infra\n- deny app infra.db\n" });
  const both = check(tied);
  assert.equal(both.status, 1, both.stdout);
  const fails = both.results.filter((row) => row.code === "K102");
  assert.equal(fails.length, 2, both.stdout);
  assert.ok(fails.every((row) => row.verdict === "fail" && row.file === "src/app/x.ts" && row.line === 1));
  assert.equal(new Set(fails.map((row) => row.criterion)).size, 2);

  const broad = repo(t, { ...files, "keylang/rules.md": "# rules\n\n- deny app infra\n- deny app.x infra.db\n" });
  const deeper = check(broad);
  const k102 = deeper.results.filter((row) => row.code === "K102");
  assert.equal(k102.length, 1, deeper.stdout);
  assert.equal(k102[0]?.criterion, "deny app.x infra.db");
  const kept = deeper.results.find((row) => row.criterion === "deny app infra");
  assert.equal(kept?.verdict, "ok");
  assert.match(kept?.evidence ?? "", /decided by more specific rules/);
  assert.match(kept?.evidence ?? "", /deny app\.x infra\.db/);
});

test("an upward edge denied by deny is not also K101; an allow is named on the layers line", (t) => {
  const base = {
    "keylang.json": config({ domain: "src/domain/**", app: "src/app/**" }),
    "src/domain/x.ts": 'import { y } from "../app/y.ts";\nexport function x(): void {\n  y();\n}\n',
    "src/app/y.ts": "export function y(): void {}\n",
  };
  const denied = repo(t, { ...base, "keylang/rules.md": "# rules\n\n- layers domain < app\n- deny domain app\n" });
  const byDeny = check(denied);
  assert.equal(byDeny.results.filter((row) => row.code === "K102").length, 1, byDeny.stdout);
  assert.equal(byDeny.results.filter((row) => row.code === "K101").length, 0, byDeny.stdout);
  assert.ok(!byDeny.results.some((row) => row.criterion.startsWith("layers") && row.verdict === "ok"), byDeny.stdout);

  const allowed = repo(t, { ...base, "keylang/rules.md": "# rules\n\n- layers domain < app\n- allow domain app\n" });
  const byAllow = check(allowed);
  assert.equal(byAllow.status, 0, byAllow.stdout);
  const line = byAllow.results.find((row) => row.criterion === "layers domain < app");
  assert.equal(line?.verdict, "ok");
  assert.match(line?.evidence ?? "", /allowed by `allow domain app`/);

  const downward = repo(t, {
    "keylang.json": config({ domain: "src/domain/**", app: "src/app/**" }),
    "src/app/y.ts": 'import { x } from "../domain/x.ts";\nexport function y(): void {\n  x();\n}\n',
    "src/domain/x.ts": "export function x(): void {}\n",
    "keylang/rules.md": "# rules\n\n- layers domain < app\n- deny app domain\n",
  });
  const down = check(downward);
  const order = down.results.find((row) => row.criterion === "layers domain < app");
  assert.equal(order?.verdict, "ok", down.stdout);
  assert.match(order?.evidence ?? "", /points down, and no dependency hole/);
  assert.match(down.stdout, /K102/);
});

test("specHash is the rule line, and one hash for a connected order", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ a: "src/a/**", b: "src/b/**", c: "src/c/**" }),
    "src/a/x.ts": 'import { y } from "../c/y.ts";\nexport function x(): void {\n  y();\n}\n',
    "src/b/m.ts": "export function m(): void {}\n",
    "src/c/y.ts": "export function y(): void {}\n",
    "keylang/rules.md": "# rules\n\n- layers a < b < c\n",
  });
  const one = check(dir);
  const k101 = one.results.find((row) => row.code === "K101");
  assert.ok(k101, one.stdout);
  assert.equal(k101.criterion, "layers a c");
  assert.equal(k101.specHash, sha("layers a < b < c"));

  write(dir, "keylang/rules.md", "# rules\n\n- layers a < b\n- layers b < c\n");
  const two = check(dir);
  const joined = sha("layers a < b\nlayers b < c");
  const failures = two.results.filter((row) => row.code === "K101");
  assert.ok(failures.length > 0, two.stdout);
  assert.ok(failures.every((row) => row.specHash === joined), two.stdout);

  write(dir, "src/c/y.ts", 'import { n } from "../d/n.ts";\nexport function y(): void {\n  n();\n}\n');
  write(dir, "src/a/x.ts", "export function x(): void {}\n");
  write(dir, "keylang/rules.md", "# rules\n\n- layers a < b\n- layers c < d\n");
  write(dir, "src/d/n.ts", "export function n(): void {}\n");
  write(dir, "keylang.json", config({ a: "src/a/**", b: "src/b/**", c: "src/c/**", d: "src/d/**" }));
  const split = check(dir);
  const cd = split.results.find((row) => row.code === "K101" && row.criterion === "layers c d");
  assert.ok(cd, split.stdout);
  assert.equal(cd.specHash, sha("layers c < d"));
  assert.notEqual(cd.specHash, sha("layers a < b\nlayers c < d"));

  const linked = repo(t, {
    "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }),
    "src/app/a.ts": "export function a(): void {}\n",
    "src/infra/b.ts": "export function b(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny app.a infra\n",
  });
  const plain = check(linked).results.find((row) => row.criterion === "deny app.a infra");
  writeFileSync(join(linked, "keylang/rules.md"), "# rules\n\n- deny [app.a](x.md) infra\n");
  const asLink = check(linked).results.find((row) => row.criterion === "deny app.a infra");
  assert.equal(plain?.specHash, asLink?.specHash);
  const fmt = keylang(linked, ["fmt", "keylang"]);
  assert.notEqual(fmt.status, 2, fmt.stderr);
  const formatted = check(linked).results.find((row) => row.criterion === "deny app.a infra");
  assert.equal(formatted?.specHash, plain?.specHash);

  const bare = repo(t, { "keylang/rules.md": "# rules\n\n- no-cycles\n" });
  const missing = check(bare);
  const snap = missing.results.find((row) => row.evidence === "no snapshot");
  assert.equal(snap?.verdict, "unverified");
  assert.equal(snap?.specHash, sha("no-cycles *"));
  assert.notEqual(snap?.specHash, sha("no snapshot"));
  writeFileSync(join(bare, "keylang/rules.md"), "# rules\n\n- deny app infra\n");
  const changed = check(bare).results.find((row) => row.evidence === "no snapshot");
  assert.notEqual(changed?.specHash, snap?.specHash);
  assert.equal(changed?.specHash, sha("deny app infra"));
});

test("a layers or entry line hashes its own text; K101, K103, and a module's entry unverified hash every line", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ a: "src/a/**", b: "src/b/**", c: "src/c/**" }),
    "src/a/x.ts": "export function x(): void {}\n",
    "src/b/m.ts": "export function m(): void {}\n",
    "src/c/y.ts": 'import { x } from "../a/x.ts";\nexport function y(): void {\n  x();\n}\n',
    "keylang/rules.md": "# rules\n\n- layers a < b\n- layers b < c\n",
  });
  const down = check(dir);
  assert.equal(down.status, 0, down.stdout);
  const ab = down.results.find((row) => row.criterion === "layers a < b");
  const bc = down.results.find((row) => row.criterion === "layers b < c");
  assert.equal(ab?.verdict, "ok", down.stdout);
  assert.equal(bc?.verdict, "ok", down.stdout);
  assert.equal(ab?.specHash, sha("layers a < b"));
  assert.equal(bc?.specHash, sha("layers b < c"));
  assert.notEqual(ab?.specHash, sha("layers a < b\nlayers b < c"));

  write(dir, "keylang.json", config({ a: "src/a/**", b: "src/b/**", c: "src/c/**" }, { exclude: ["src/a/x.ts"] }));
  const holed = check(dir);
  const abHole = holed.results.find((row) => row.criterion === "layers a < b");
  const bcHole = holed.results.find((row) => row.criterion === "layers b < c");
  assert.equal(abHole?.verdict, "unverified", holed.stdout);
  assert.equal(bcHole?.verdict, "unverified", holed.stdout);
  assert.match(abHole?.evidence ?? "", /src\/a\/x\.ts:1:1/);
  assert.equal(abHole?.specHash, sha("layers a < b"));
  assert.equal(bcHole?.specHash, sha("layers b < c"));

  write(dir, "keylang.json", config({ a: "src/a/**", b: "src/b/**", c: "src/c/**" }));
  write(dir, "src/a/x.ts", 'import { y } from "../c/y.ts";\nexport function x(): void {\n  y();\n}\n');
  const up = check(dir);
  const failures = up.results.filter((row) => row.code === "K101");
  assert.ok(failures.length > 0, up.stdout);
  assert.ok(failures.every((row) => row.specHash === sha("layers a < b\nlayers b < c")), up.stdout);
  assert.ok(!up.results.some((row) => row.criterion.startsWith("layers") && row.verdict === "ok"), up.stdout);

  const entered = repo(t, {
    "keylang.json": config({ app: "src/app/**", domain: "src/domain/**" }),
    "src/app/a.ts": "export function a(): void {}\n",
    "src/domain/d.ts": "export function d(): void {}\n",
    "keylang/rules.md": "# rules\n\n- entry\n  - app.a\n- entry\n  - domain.d\n",
  });
  const reached = check(entered);
  assert.equal(reached.status, 0, reached.stdout);
  const appEntry = reached.results.find((row) => row.criterion === "entry" && row.line === 3);
  const domainEntry = reached.results.find((row) => row.criterion === "entry" && row.line === 5);
  assert.equal(appEntry?.verdict, "ok", reached.stdout);
  assert.equal(domainEntry?.verdict, "ok", reached.stdout);
  assert.equal(appEntry?.specHash, sha("entry app.a"));
  assert.equal(domainEntry?.specHash, sha("entry domain.d"));
  assert.notEqual(appEntry?.specHash, sha("entry app.a\nentry domain.d"));

  write(entered, "keylang.json", config({ app: "src/app/**", domain: "src/domain/**", other: "src/other/**" }));
  write(entered, "src/other/z.ts", "export function z(): void {}\n");
  write(entered, "keylang/rules.md", "# rules\n\n- layers app < other\n- entry\n  - app.a\n- entry\n  - domain.d\n");
  const absent = check(entered);
  const k103 = absent.results.find((row) => row.code === "K103");
  assert.ok(k103, absent.stdout);
  assert.equal(k103.file, "src/other/z.ts");
  assert.equal(k103.specHash, sha("entry app.a\nentry domain.d"));
  assert.notEqual(k103.specHash, sha("entry app.a"));

  write(entered, "src/app/a.ts", 'import { missing } from "./missing.ts";\nexport function a(): void {}\n');
  const blocked = check(entered);
  const moduleHole = blocked.results.find((row) => row.file === "src/other/z.ts" && row.criterion === "entry" && row.verdict === "unverified");
  assert.ok(moduleHole, blocked.stdout);
  assert.match(moduleHole.evidence, /not reached, but/);
  assert.equal(moduleHole.specHash, sha("entry app.a\nentry domain.d"));
  assert.equal(blocked.results.some((row) => row.code === "K103"), false, blocked.stdout);

  const sealed = repo(t, {
    "keylang.json": config({ app: "src/app/**", domain: "src/domain/**" }),
    "src/app/a.ts": "export function a(): void {}\n",
    "src/domain/d.ts": "export function d(): void {}\n",
    "keylang/rules.md": "# rules\n\n- entry\n  - app.a\n- entry\n  - domain.d\n",
  });
  const hidden = join(sealed, "src/app/sealed");
  mkdirSync(hidden);
  chmodSync(hidden, 0);
  t.after(() => {
    try {
      chmodSync(hidden, 0o755);
    } catch {
      // The repository copy is already removed.
    }
  });
  const unread = check(sealed);
  const onEntry = unread.results.filter((row) => row.criterion === "entry" && row.file === "keylang/rules.md");
  assert.equal(onEntry.length, 2, unread.stdout);
  assert.ok(onEntry.every((row) => row.verdict === "unverified" && /every known module is reachable/.test(row.evidence)), unread.stdout);
  assert.equal(onEntry.find((row) => row.line === 3)?.specHash, sha("entry app.a"));
  assert.equal(onEntry.find((row) => row.line === 5)?.specHash, sha("entry domain.d"));
  assert.notEqual(onEntry[0]?.specHash, sha("entry app.a\nentry domain.d"));
  chmodSync(hidden, 0o755);
});

test("a broken manifest names the file and the field; a missing manifest is not that error", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: "src/app/**" }),
    "src/app/a.ts": "export function a(): void {}\n",
    "keylang/rules.md": "# rules\n\n- module app.a\n",
    "package.json": "{ not json\n",
  });
  const json = keylang(dir, ["check", "keylang"]);
  assert.equal(json.status, 2, json.stderr);
  assert.match(json.stderr, /package\.json: invalid JSON/);
  assert.doesNotMatch(json.stderr, /cannot read/);

  write(dir, "package.json", `${JSON.stringify({ dependencies: "pg" })}\n`);
  const field = keylang(dir, ["check", "keylang"]);
  assert.equal(field.status, 2, field.stderr);
  assert.match(field.stderr, /package\.json: `dependencies` must be an object, got "pg"/);

  rmSync(join(dir, "package.json"));
  const missing = keylang(dir, ["check", "keylang"]);
  assert.notEqual(missing.status, 2, missing.stderr);
  assert.doesNotMatch(missing.stderr, /package\.json/);

  write(dir, "package.json", `${JSON.stringify({ dependencies: { pg: "1.0.0" } })}\n`);
  write(dir, "Cargo.toml", '[package]\nname = "demo"\nversion = "0.0.0"\n\n[dependencies]\nserde = "1"\n');
  chmodSync(join(dir, "Cargo.toml"), 0);
  t.after(() => {
    try {
      chmodSync(join(dir, "Cargo.toml"), 0o644);
    } catch {
      // The file is already gone when the directory is removed.
    }
  });
  const unread = keylang(dir, ["check", "keylang"]);
  assert.equal(unread.status, 2, unread.stderr);
  assert.match(unread.stderr, /Cargo\.toml: cannot read/);
  assert.doesNotMatch(unread.stderr, /invalid TOML/);
  chmodSync(join(dir, "Cargo.toml"), 0o644);

  write(dir, "Cargo.toml", "[package\nname = \"demo\"\n");
  const toml = keylang(dir, ["check", "keylang"]);
  assert.equal(toml.status, 2, toml.stderr);
  assert.match(toml.stderr, /Cargo\.toml: invalid TOML/);

  write(dir, "Cargo.toml", 'dependencies = "serde"\n\n[package]\nname = "demo"\nversion = "0.0.0"\n');
  const crate = keylang(dir, ["check", "keylang"]);
  assert.equal(crate.status, 2, crate.stderr);
  assert.match(crate.stderr, /Cargo\.toml: `dependencies` must be a table, got "serde"/);
});

test("an opaque reference on a deny line shares that line's specHash", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }, { exclude: ["src/infra/b.ts"] }),
    "src/app/a.ts": "export function a(): void {}\n",
    "src/infra/b.ts": "export function b(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny app infra.b.save\n",
  });
  const rows = check(dir);
  const id = rows.results.find((row) => row.criterion === "ID" && row.evidence.includes("opaque module"));
  const deny = rows.results.find((row) => row.criterion === "deny app infra.b.save");
  assert.ok(id, rows.stdout);
  assert.ok(deny, rows.stdout);
  assert.equal(id.specHash, deny.specHash);
  assert.equal(deny.specHash, sha("deny app infra.b.save"));
});

test("a declared package is not K001 when its only importer is excluded, and it adds no snapshot node", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }, { exclude: ["src/infra/db.ts"] }),
    "package.json": `${JSON.stringify({ dependencies: { pg: "1.0.0" } })}\n`,
    "src/app/a.ts": "export function a(): void {}\n",
    "src/infra/db.ts": 'import pg from "pg";\nexport function db(): void {\n  pg;\n}\n',
    "keylang/rules.md": "# rules\n\n- deny infra external\n- allow infra external.pg\n",
  });
  const hidden = check(dir);
  assert.equal(hidden.status, 0, hidden.stdout);
  assert.ok(!hidden.results.some((row) => row.code === "K001" && row.evidence.includes("external.pg")), hidden.stdout);
  const deny = hidden.results.find((row) => row.criterion === "deny infra external");
  assert.equal(deny?.verdict, "unverified");
  assert.match(deny?.evidence ?? "", /src\/infra\/db\.ts:1:1/);

  write(dir, "keylang/rules.md", "# rules\n\n- allow infra external.nope\n");
  const unknown = check(dir);
  assert.equal(unknown.status, 1);
  assert.ok(unknown.results.some((row) => row.code === "K001" && row.evidence.includes("external.nope")));

  write(dir, "keylang.json", config({ app: "src/app/**", infra: "src/infra/**" }));
  write(dir, "keylang/rules.md", "# rules\n\n- deny infra external\n- allow infra external.pg\n");
  assert.equal(check(dir).status, 0);

  assert.equal(keylang(dir, ["map"]).status, 0);
  write(dir, "keylang.json", config({ app: "src/app/**", infra: "src/infra/**" }, { exclude: ["src/infra/db.ts"] }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { nodes: Record<string, unknown> };
  assert.equal(index.nodes["external.pg"], undefined);
  const mapFile = join(dir, "keylang/map/external.md");
  let mapText = "";
  try {
    mapText = readFileSync(mapFile, "utf8");
  } catch {
    mapText = "";
  }
  assert.doesNotMatch(mapText, /external\.pg/);
});

test("a declared package with no import anywhere is not K001 and adds no snapshot node", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }),
    "package.json": `${JSON.stringify({ dependencies: { pg: "1.0.0" } })}\n`,
    "src/app/a.ts": "export function a(): void {}\n",
    "src/infra/db.ts": "export function db(): void {}\n",
    "keylang/rules.md": "# rules\n\n- allow infra external.pg\n",
  });
  const quiet = check(dir);
  assert.equal(quiet.status, 0, quiet.stdout);
  assert.ok(!quiet.results.some((row) => row.code === "K001"), quiet.stdout);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { nodes: Record<string, unknown> };
  assert.equal(index.nodes["external.pg"], undefined);
  const mapFile = join(dir, "keylang/map/external.md");
  const mapText = existsSync(mapFile) ? readFileSync(mapFile, "utf8") : "";
  assert.doesNotMatch(mapText, /external\.pg/);
});

test("a type or a planned event on deny is K005 scope and applies nowhere", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: "src/app/**", domain: "src/domain/**" }),
    "src/app/main.ts": "export function main(): void {}\n",
    "src/domain/order.ts": "export interface Order {\n  id: string;\n}\nexport function make(): void {}\n",
    "keylang/flows/paid.md": "# flow paid\n\n- planned event domain.order.paid\n",
    "keylang/rules.md": "# rules\n\n- deny app domain.order.Order\n- deny app domain.order.paid\n",
    "keylang/wiring.md": "# wiring\n\n- wire app.main\n  - order domain.order.make\n",
  });
  const found = check(dir);
  assert.equal(found.status, 1, found.stdout);
  const scoped = found.results.filter((row) => row.code === "K005");
  assert.equal(scoped.length, 2, found.stdout);
  assert.ok(scoped.every((row) => row.reason === "scope"), JSON.stringify(scoped));
  assert.ok(scoped.some((row) => row.evidence.includes("`domain.order.Order` is a type")), found.stdout);
  assert.ok(scoped.some((row) => row.evidence.includes("`domain.order.paid` is a planned event")), found.stdout);
  assert.ok(!found.results.some((row) => row.code === "K102"), found.stdout);
  const wire = keylang(dir, ["wire", "--check"]);
  assert.doesNotMatch(`${wire.stdout}\n${wire.stderr}`, /denied by/);
});

test("a fn deny applies nowhere: check, wire, and a deeper module deny still does", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: "src/app/**", infra: "src/infra/**" }),
    "src/app/checkout.ts": 'import { save } from "../infra/db.ts";\nexport function checkout(): void {\n  save();\n}\n',
    "src/infra/db.ts": "export function save(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny app.checkout.checkout infra\n",
    "keylang/wiring.md": "# wiring\n\n- wire app.checkout.checkout\n  - db infra.db.save\n",
  });
  const member = check(dir);
  assert.equal(member.status, 1);
  assert.ok(member.results.some((row) => row.code === "K005"));
  assert.ok(!member.results.some((row) => row.code === "K102"), member.stdout);
  const wire = keylang(dir, ["wire", "--check"]);
  assert.doesNotMatch(wire.stderr + wire.stdout, /denied by `deny app\.checkout\.checkout infra`/);

  write(dir, "keylang/rules.md", "# rules\n\n- deny app infra\n- allow app.checkout.checkout infra\n");
  const mixed = check(dir);
  assert.ok(mixed.results.some((row) => row.code === "K005"), mixed.stdout);
  assert.ok(mixed.results.some((row) => row.code === "K102" && row.file === "src/app/checkout.ts"), mixed.stdout);
  assert.match(mixed.stdout, /wiring `app\.checkout\.checkout` depends on `infra\.db\.save`/);
});

test("rust: serde declared in Cargo.toml is not K001 when its importer is excluded", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-rust-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/rust-shop"), dir, { recursive: true });
  assert.equal(keylang(dir, ["init", "--agents=none"]).status, 0, "init");
  const raw = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as { exclude?: string[] };
  raw.exclude = ["src/infra/store.rs"];
  write(dir, "keylang.json", `${JSON.stringify(raw, null, 2)}\n`);
  const run = keylang(dir, ["check"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout, /K001/);
  assert.doesNotMatch(run.stdout, /external\.serde/);
});
