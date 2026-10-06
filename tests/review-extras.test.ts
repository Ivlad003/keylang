// Follow-ups of the 2026-10-05 review, decided on 2026-10-06: the Python trace
// wrapper without `KEYLANG_TRACE`, and PHP names that compare in ASCII case
// only. Every test runs the real CLI or adapter on a minimal repository in a
// temporary directory.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A repository of `files` in a temporary directory, removed after the test. */
function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-extras-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

interface Snapshot {
  nodes: Record<string, { kind: string; escapes?: { reason: string } }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string }[];
  coverage: { kind: string; reason: string; source: string | null }[];
}

/** `keylang map` in `dir`, and the snapshot it wrote. */
function map(dir: string): Snapshot {
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
}

/** Resolved call edges from fns whose ID starts with `prefix`, as `source → target`, sorted. */
function calls(s: Snapshot, prefix: string): string[] {
  return s.edges
    .filter((e) => e.kind === "call" && e.resolution === "resolved" && e.source.startsWith(prefix))
    .map((e) => `${e.source} → ${e.target}`)
    .sort();
}

/** The `static` lines of `keylang check` for `id`. */
function statics(dir: string, id: string): string[] {
  return keylang(dir, ["check"]).stdout.split("\n").filter((line) => line.includes(` static `) && line.includes(` ${id}: `));
}

const PHP = { languages: ["php"], layers: { app: ["src/**"] } };

const python3 = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

test("python: without KEYLANG_TRACE the trace wrapper records nothing and runs the script as python3 would, exit code included; with it, a missing plan or test is named", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  const wrapper = join(root, "adapters/python/keylang_trace.py");
  const dir = repo(t, { "run.py": 'import os\nimport sys\n\nprint(__name__, sys.argv[1:], os.environ.get("KEYLANG_TRACE_RUN"))\nsys.exit(3)\n' });
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of ["KEYLANG_TRACE", "KEYLANG_TRACE_PLAN", "KEYLANG_TRACE_TEST", "KEYLANG_TRACE_RUN", "KEYLANG_TRACE_ROOT"]) delete env[name];
  const plain = spawnSync("python3", [wrapper, "run.py", "a", "b"], { cwd: dir, encoding: "utf8", env });
  // The script's own exit code, its arguments, no run id handed to child processes, and no file written.
  assert.equal(plain.status, 3, plain.stderr);
  assert.equal(plain.stdout, "__main__ ['a', 'b'] None\n");
  assert.equal(plain.stderr, "");
  assert.deepEqual(readdirSync(dir), ["run.py"]);
  // A trace file needs the plan and the test id: the error names the missing one, and the script does not run.
  const partial = spawnSync("python3", [wrapper, "run.py"], { cwd: dir, encoding: "utf8", env: { ...env, KEYLANG_TRACE: "trace.jsonl", KEYLANG_TRACE_TEST: "t" } });
  assert.equal(partial.status, 2);
  assert.equal(partial.stdout, "");
  assert.equal(partial.stderr, "keylang trace: KEYLANG_TRACE is set, so KEYLANG_TRACE_PLAN is required too\n");
  assert.deepEqual(readdirSync(dir), ["run.py"]);
});

test("php: class, function and method names compare in ASCII case only, as PHP compares them: `ORDER::make()` runs `Order::make`, `äpfel::make()` is no call of `Äpfel::make`", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify(PHP),
    "src/Order.php": "<?php\nnamespace App;\n\nclass Order\n{\n    public static function make(): void {}\n    public function größe(): int { return 1; }\n}\n\nclass Äpfel\n{\n    public static function make(): void {}\n}\n",
    "src/Use.php": "<?php\nnamespace App;\n\nfunction useIt(Order $o, $x): void\n{\n    ORDER::make();\n    äpfel::make();\n    $o->GRÖßE();\n    $x->GRÖßE();\n}\n\nfunction keep(Order $o): array\n{\n    return [$o, 'GRÖßE'];\n}\n",
    "keylang/flows/size.md": "# flow size\n\n- trigger app.Use.useIt\n  - step app.Order.Order.größe\n",
  });
  const snapshot = map(dir);
  // PHP lowers A–Z only: `ORDER` is `Order`, while `äpfel` and `GRÖßE` keep the letters that differ from `Äpfel` and `größe`.
  assert.deepEqual(calls(snapshot, "app.Use."), ["app.Use.useIt → app.Order.Order.make"]);
  assert.ok(!snapshot.edges.some((e) => e.target === "app.Order.Äpfel.make"), JSON.stringify(snapshot.edges));
  assert.equal(snapshot.nodes["app.Order.Order.größe"]?.escapes, undefined, "`[$o, 'GRÖßE']` reads no `größe`");
  // Nor may the hole `$x->GRÖßE()` reach `größe`: the step is an absence, as a case-sensitive language's would be.
  const lines = statics(dir, "app.Order.Order.größe");
  assert.equal(lines.length, 1, lines.join("\n"));
  assert.match(lines[0]!, /keylang\/flows\/size\.md:4:3: static fail app\.Order\.Order\.größe: absence: no call path from app\.Use\.useIt/);
});
