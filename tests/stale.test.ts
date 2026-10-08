// `check --stale` (design §4.4, ticket design-v0.2/21): prose in specs against
// the fingerprints accepted in `keylang/baseline.json`, through the real CLI.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function repo(t: TestContext, files: Record<string, string>): { dir: string; write(file: string, text: string): void; run(...args: string[]): Run; read(file: string): string | null } {
  const dir = mkdtempSync(join(tmpdir(), "keylang-stale-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  write("keylang.json", JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }));
  for (const [file, text] of Object.entries(files)) write(file, text);
  return {
    dir,
    write,
    run(...args) {
      const r = spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: "utf8" });
      if (r.error) throw r.error;
      return { status: r.status, stdout: r.stdout, stderr: r.stderr };
    },
    read(file) {
      return existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null;
    },
  };
}

const ORDER = 'export function valid(total: number): boolean {\n  return total > 0;\n}\n\nexport function describe(): string {\n  return valid(1) ? "ok" : "empty";\n}\n\nexport function label(): string {\n  return "order";\n}\n';

const ORDER_FLOW = `# flow describe

- trigger main.order.describe
  Formats the state of an order.
  - step main.order.valid
    Checks the total.
    - invariant total is positive
- step main.order.label
  A fixed label.
`;

test("check --stale: a changed operator makes the fn's description, its invariant and its caller's description stale; layout does not", (t) => {
  const r = repo(t, { "src/order.ts": ORDER, "keylang/flows/order.md": ORDER_FLOW });

  const first = r.run("check", "--stale");
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /order\.md:3:1: new description of `main\.order\.describe`: no accepted fingerprint yet/);
  assert.match(first.stdout, /order\.md:7:5: new invariant `total is positive`/);
  assert.match(first.stderr, /0 stale, 4 new, 0 fresh, 0 incomplete/);
  assert.match(first.stderr, /run `keylang check --stale --accept`/);
  assert.equal(r.read("keylang/baseline.json"), null, "without --accept nothing is written");

  const accept = r.run("check", "--stale", "--accept");
  assert.equal(accept.status, 0, accept.stderr);
  assert.match(accept.stderr, /accepted 4 fingerprints in keylang\/baseline\.json/);
  const baseline = JSON.parse(r.read("keylang/baseline.json")!) as Record<string, Record<string, string>>;
  assert.deepEqual(Object.keys(baseline), ["keylang/flows/order.md"]);
  assert.deepEqual(Object.keys(baseline["keylang/flows/order.md"]!), ["invariant:total is positive", "main.order.describe", "main.order.label", "main.order.valid"]);

  const clean = r.run("check", "--stale");
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, "");
  assert.match(clean.stderr, /0 stale, 0 new, 4 fresh, 0 incomplete/);

  // Comments and layout only: the normalized syntax is the same.
  r.write("src/order.ts", ORDER.replace("  return total > 0;", "  // positive totals only\n  return   total >\n    0;"));
  const reformatted = r.run("check", "--stale");
  assert.equal(reformatted.stdout, "");
  assert.match(reformatted.stderr, /0 stale, 0 new, 4 fresh/);

  r.write("src/order.ts", ORDER.replace("total > 0", "total >= 0"));
  const changed = r.run("check", "--stale");
  assert.equal(changed.status, 0, "stale is a warning, not a failure");
  assert.match(changed.stdout, /order\.md:5:3: stale description of `main\.order\.valid`: the code under it changed since it was accepted \(`main\.order\.valid`\)/);
  assert.match(changed.stdout, /order\.md:7:5: stale invariant `total is positive`/);
  // `describe` calls `valid`: its closure changed although its own body did not.
  assert.match(changed.stdout, /order\.md:3:1: stale description of `main\.order\.describe`/);
  assert.doesNotMatch(changed.stdout, /main\.order\.label/);
  assert.match(changed.stderr, /3 stale, 0 new, 1 fresh/);
});

test("check --stale: map leaves the baseline alone; only --accept moves it", (t) => {
  const r = repo(t, { "src/order.ts": ORDER, "keylang/flows/order.md": ORDER_FLOW });
  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  const accepted = r.read("keylang/baseline.json");
  r.write("src/order.ts", ORDER.replace("total > 0", "total >= 0"));
  const map = r.run("map");
  assert.equal(map.status, 0, map.stderr);
  assert.equal(r.read("keylang/baseline.json"), accepted);
  assert.match(r.run("check", "--stale").stderr, /3 stale/);
  assert.doesNotMatch(r.run("check").stdout, /stale/, "a plain check ignores the baseline");
  assert.equal(r.read("keylang/baseline.json"), accepted);
  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  assert.notEqual(r.read("keylang/baseline.json"), accepted);
  assert.match(r.run("check", "--stale").stderr, /0 stale, 0 new, 4 fresh/);
});

test("check --stale: a cycle terminates and changes as one; an unresolved call or an unknown id marks it incomplete", (t) => {
  const r = repo(t, {
    "src/ping.ts": 'import { pong } from "./pong.ts";\n\nexport function ping(n: number): number {\n  return n > 0 ? pong(n - 1) : 0;\n}\n',
    "src/pong.ts": 'import { ping } from "./ping.ts";\n\nexport function pong(n: number): number {\n  return ping(n);\n}\n\nexport function start(worker: { run(): void }): number {\n  worker.run();\n  return pong(3);\n}\n',
    "keylang/flows/ping.md": "# flow ping\n\n- step main.pong.pong\n  Bounces back.\n- step main.pong.start\n  Starts the worker.\n- step main.pong.gone\n  Not written yet.\n- invariant ends at zero\n",
  });
  const accept = r.run("check", "--stale", "--accept");
  assert.equal(accept.status, 0, accept.stderr);
  const fresh = r.run("check", "--stale");
  assert.match(fresh.stdout, /ping\.md:5:1: incomplete description of `main\.pong\.start`: unchanged as far as keylang can see .*incomplete: `main\.pong\.start` reaches calls or values keylang does not resolve/);
  assert.match(fresh.stdout, /ping\.md:7:1: incomplete description of `main\.pong\.gone`.*`main\.pong\.gone` is not in the snapshot/);
  assert.doesNotMatch(fresh.stdout, /main\.pong\.pong`:/);
  assert.match(fresh.stderr, /0 stale, 0 new, 4 fresh, 3 incomplete/, "the top-level invariant covers the whole flow, `gone` and `start` included");

  r.write("src/ping.ts", 'import { pong } from "./pong.ts";\n\nexport function ping(n: number): number {\n  return n > 1 ? pong(n - 1) : 0;\n}\n');
  const changed = r.run("check", "--stale");
  assert.equal(changed.status, 0);
  assert.match(changed.stdout, /ping\.md:3:1: stale description of `main\.pong\.pong`/, "a change in ping reaches pong through the cycle");
  assert.match(changed.stdout, /ping\.md:9:1: stale invariant `ends at zero`/);
});

test("check --stale: an edited statement is new and its old entry obsolete; paths limit what --accept replaces", (t) => {
  const r = repo(t, { "src/order.ts": ORDER, "keylang/flows/order.md": ORDER_FLOW, "keylang/flows/label.md": "# flow label\n\n- step main.order.label\n  The label.\n" });
  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  r.write("keylang/flows/order.md", ORDER_FLOW.replace("total is positive", "total is above zero"));
  r.write("keylang/flows/label.md", "# flow label\n\n- step main.order.label\n  The label.\n- invariant never empty\n");
  const edited = r.run("check", "--stale", "keylang/flows/order.md");
  assert.match(edited.stdout, /order\.md:7:5: new invariant `total is above zero`/);
  assert.match(edited.stdout, /keylang\/baseline\.json: obsolete `invariant:total is positive` of keylang\/flows\/order\.md/);
  assert.doesNotMatch(edited.stdout, /never empty/, "only the named file is checked");
  assert.equal(r.run("check", "--stale", "--accept", "keylang/flows/order.md").status, 0);
  const baseline = JSON.parse(r.read("keylang/baseline.json")!) as Record<string, Record<string, string>>;
  assert.ok(baseline["keylang/flows/order.md"]!["invariant:total is above zero"]);
  assert.equal(baseline["keylang/flows/order.md"]!["invariant:total is positive"], undefined);
  assert.equal(baseline["keylang/flows/label.md"]!["invariant:never empty"], undefined, "the other file is left as accepted");
  assert.match(r.run("check", "--stale").stderr, /0 stale, 1 new, 5 fresh/);
  // A removed spec file: its entries are obsolete for a whole check, and a whole --accept drops them.
  rmSync(join(r.dir, "keylang/flows/label.md"));
  const gone = r.run("check", "--stale");
  assert.match(gone.stdout, /obsolete `main\.order\.label` of keylang\/flows\/label\.md/);
  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  assert.deepEqual(Object.keys(JSON.parse(r.read("keylang/baseline.json")!) as object), ["keylang/flows/order.md"]);
});

test("check --stale: a bad baseline or invocation is exit 2 and writes nothing", (t) => {
  const r = repo(t, { "src/order.ts": ORDER, "keylang/flows/order.md": ORDER_FLOW });
  r.write("keylang/baseline.json", JSON.stringify({ "keylang/flows/order.md": { "main.order.valid": "abc" } }));
  const bad = r.run("check", "--stale", "--accept");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /keylang\/baseline\.json: `keylang\/flows\/order\.md` → `main\.order\.valid`: expected a SHA-256 fingerprint/);
  assert.equal(r.read("keylang/baseline.json"), JSON.stringify({ "keylang/flows/order.md": { "main.order.valid": "abc" } }));
  r.write("keylang/baseline.json", "[");
  assert.match(r.run("check", "--stale").stderr, /keylang\/baseline\.json: not valid JSON/);
  const accept = r.run("check", "--accept");
  assert.equal(accept.status, 2);
  assert.match(accept.stderr, /--accept requires --stale/);
  const both = r.run("check", "--stale", "--accept", "--strict");
  assert.equal(both.status, 2);
  assert.match(both.stderr, /--accept writes the baseline and --strict gates on it/);
  const json = r.run("check", "--stale", "--format", "json");
  assert.equal(json.status, 2);
  assert.match(json.stderr, /--stale cannot be combined with --format/);
});

test("check --stale --strict: exit 1 while a statement or obsolete entry is to review, 0 once accepted", (t) => {
  const r = repo(t, { "src/order.ts": ORDER, "keylang/flows/order.md": ORDER_FLOW });
  const fresh = r.run("check", "--stale", "--strict");
  assert.equal(fresh.status, 1, "new statements are to review");
  assert.match(fresh.stdout, /new description of `main\.order\.describe`/);
  assert.equal(r.read("keylang/baseline.json"), null, "--strict writes nothing");

  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  const clean = r.run("check", "--stale", "--strict");
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.equal(clean.stdout, "");

  r.write("src/order.ts", ORDER.replace("total > 0", "total >= 0"));
  const stale = r.run("check", "--stale", "--strict");
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /stale description of `main\.order\.valid`/);
  assert.equal(r.run("check", "--stale").status, 0, "without --strict stale stays a warning");

  r.write("src/order.ts", ORDER);
  r.write("keylang/flows/order.md", ORDER_FLOW.replace("    - invariant total is positive\n", ""));
  const obsolete = r.run("check", "--stale", "--strict");
  assert.equal(obsolete.status, 1, "an obsolete entry is to review too");
  assert.match(obsolete.stdout, /obsolete `invariant:total is positive`/);
  assert.doesNotMatch(obsolete.stdout, /(stale|new|incomplete) /);

  // An unresolved call keeps the statement incomplete even when unchanged.
  r.write("src/order.ts", ORDER.replace('return "order";', 'return (globalThis as { pick(): string }).pick();'));
  r.write("keylang/flows/order.md", ORDER_FLOW);
  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  const incomplete = r.run("check", "--stale", "--strict");
  assert.match(incomplete.stdout, /incomplete/);
  assert.equal(incomplete.status, 1, incomplete.stdout);
});

test("check --stale --strict: a CRLF checkout of the same code leaves multi-line strings and their callers fresh", (t) => {
  // Ticket review-2026-10-06/30: a multi-line string leaf carried `\r\n` into the fingerprint.
  const py = 'def total(items):\n    """Sum the items.\n\n    Returns zero for an empty list.\n    """\n    return sum(items)\n\n\ndef plain(n):\n    return n + 1\n\n\ndef checkout(items):\n    return total(items)\n';
  const ts = "export function banner(name: string): string {\n  return `Hello\n  ${name}\n  bye`;\n}\n\nexport function plain(n: number): number {\n  return n + 1;\n}\n";
  const r = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python", "typescript"], layers: { main: ["src/**"] } }),
    "src/calc.py": py,
    "src/banner.ts": ts,
    "keylang/flows/r.md": "# flow r\n\n- step main.calc.total\n  Sums.\n- step main.calc.plain\n  Adds one.\n- step main.calc.checkout\n  Checks out.\n- step main.banner.banner\n  Greets.\n- step main.banner.plain\n  Adds one.\n",
  });
  const accept = r.run("check", "--stale", "--accept");
  assert.equal(accept.status, 0, accept.stderr);
  assert.match(r.run("check", "--stale", "--strict").stderr, /0 stale, 0 new, 5 fresh, 0 incomplete/);
  r.write("src/calc.py", py.replace(/\n/g, "\r\n"));
  r.write("src/banner.ts", ts.replace(/\n/g, "\r\n"));
  const crlf = r.run("check", "--stale", "--strict");
  assert.equal(crlf.status, 0, crlf.stdout + crlf.stderr);
  assert.match(crlf.stderr, /0 stale, 0 new, 5 fresh/);
});

test("check --stale --strict: a changed module constant, class field or object table a fn reads makes its prose stale", (t) => {
  // Ticket review-2026-10-06/31: values a fn reads by name were in no hash, so the prose stayed fresh and complete.
  const ts = "export const LIMIT = 100;\nconst rates = { eu: 0.2 };\n\nexport function cap(n: number): number {\n  return Math.min(n, LIMIT);\n}\n\nexport function tax(x: number): number {\n  return x * rates.eu;\n}\n\nexport class Box {\n  limit = 100;\n  fits(n: number): boolean {\n    return n <= this.limit;\n  }\n}\n";
  const py = "MAX = 100\n\n\ndef cap(n):\n    return min(n, MAX)\n\n\nclass Box:\n    limit = 100\n\n    def fits(self, n):\n        return n <= self.limit\n";
  const r = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python", "typescript"], layers: { main: ["src/**"] } }),
    "src/config.ts": ts,
    "src/limits.py": py,
    "keylang/flows/cfg.md": "# flow cfg\n\n- step main.config.cap\n  Caps at 100.\n- step main.config.tax\n  Applies the EU rate.\n- step main.config.Box.fits\n  At most 100.\n- step main.limits.cap\n  Caps at 100.\n- step main.limits.Box.fits\n  At most 100.\n",
  });
  const accept = r.run("check", "--stale", "--accept");
  assert.equal(accept.status, 0, accept.stderr);
  const fresh = r.run("check", "--stale", "--strict");
  assert.equal(fresh.status, 0, `values in the same file leave the closure complete: ${fresh.stdout}`);

  // Layout of a value is not a change.
  r.write("src/config.ts", ts.replace("const rates = { eu: 0.2 };", "const rates = {\n  // EU VAT\n  eu:   0.2\n};"));
  assert.doesNotMatch(r.run("check", "--stale").stdout, /stale/);

  r.write("src/config.ts", ts.replace("LIMIT = 100", "LIMIT = 5").replace("eu: 0.2", "eu: 0.5").replace("limit = 100", "limit = 3"));
  r.write("src/limits.py", py.replace("MAX = 100", "MAX = 5").replace("limit = 100", "limit = 3"));
  const changed = r.run("check", "--stale", "--strict");
  assert.equal(changed.status, 1, changed.stdout + changed.stderr);
  for (const id of ["main.config.cap", "main.config.tax", "main.config.Box.fits", "main.limits.cap", "main.limits.Box.fits"]) {
    assert.match(changed.stdout, new RegExp(`stale description of \`${id.replace(/\./g, "\\.")}\``), id);
  }
});

test("check --stale: a fn that reads a value imported from another file of the repository is incomplete", (t) => {
  const r = repo(t, {
    "src/limits.ts": "export const LIMIT = 100;\n",
    "src/cap.ts": 'import { LIMIT } from "./limits.ts";\n\nexport function cap(n: number): number {\n  return Math.min(n, LIMIT);\n}\n\nexport function twice(n: number): number {\n  return n * 2;\n}\n',
    "keylang/flows/cap.md": "# flow cap\n\n- step main.cap.cap\n  Caps at 100.\n- step main.cap.twice\n  Doubles.\n",
  });
  assert.equal(r.run("check", "--stale", "--accept").status, 0);
  const out = r.run("check", "--stale");
  assert.match(out.stdout, /cap\.md:3:1: incomplete description of `main\.cap\.cap`: .*incomplete: `main\.cap\.cap` reaches calls or values keylang does not resolve/);
  assert.doesNotMatch(out.stdout, /main\.cap\.twice/);
});
