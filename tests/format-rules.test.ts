// Format edition (`keylang.json` `format`) and the K106 warning around it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function repo(t: { after: (f: () => void) => void }, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-format-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const layers = { app: ["src/app/**"], domain: ["src/domain/**"] };
const source = {
  "src/app/x/y.ts": 'import { s } from "../../domain/storefront.ts";\nexport const y = s;\n',
  "src/domain/storefront.ts": "export const s = 1;\n",
};
const pair = "# rules\n\n- allow app.x.y domain\n- deny app domain.storefront\n";

function config(format?: number): string {
  const body = { languages: ["typescript"], layers, ...(format === undefined ? {} : { format }) };
  return `${JSON.stringify(body)}\n`;
}

test("format 1 keeps the depth-sum winner; format 2 denies the same edge", (t) => {
  const dir = repo(t, { "keylang.json": config(), ...source, "keylang/rules.md": pair });
  const missing = keylang(dir, ["check"]);
  assert.equal(missing.status, 0, missing.stdout);
  assert.match(missing.stdout, /allow wins on depth sum \(4 > 3\)/);
  writeFileSync(join(dir, "keylang.json"), config(1));
  const one = keylang(dir, ["check"]);
  assert.equal(one.status, 0, one.stdout);
  assert.match(one.stdout, /allow wins on depth sum/);
  writeFileSync(join(dir, "keylang.json"), config(2));
  const two = keylang(dir, ["check", "--format", "json"]);
  assert.equal(two.status, 1, two.stdout);
  const rows = (JSON.parse(two.stdout) as { results: { code: string | null; evidence: string; verdict: string }[] }).results;
  const k102 = rows.find((row) => row.code === "K102");
  assert.match(k102?.evidence ?? "", /denied by `deny app domain\.storefront`/);
  assert.match(k102?.evidence ?? "", /deny-overrides beats incomparable `allow app\.x\.y domain` \(keylang\/rules\.md:3\)/);
  const k106 = rows.find((row) => row.code === "K106");
  assert.equal(k106?.verdict, "warning");
  assert.match(k106?.evidence ?? "", /deny wins \(deny-overrides\)/);
  writeFileSync(join(dir, "keylang/rules.md"), `${pair}- allow app.x.y domain.storefront\n`);
  const intersection = keylang(dir, ["check"]);
  assert.equal(intersection.status, 0, intersection.stdout);
  assert.doesNotMatch(intersection.stdout, /K102|K106/);
});

test("a directory without keylang.json is format 2, including a spec copy with no snapshot", (t) => {
  const dir = repo(t, { "keylang.json": config(), ...source, "keylang/rules.md": pair });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const bare = mkdtempSync(join(tmpdir(), "keylang-nosnap-"));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  cpSync(join(dir, "keylang"), join(bare, "keylang"), { recursive: true });
  const checked = keylang(bare, ["check"]);
  assert.match(checked.stdout, /keylang\/rules\.md:3:1: K106/);
  assert.match(checked.stdout, /deny wins \(deny-overrides\)/);
  assert.doesNotMatch(checked.stdout, /allow wins on depth sum/);
  rmSync(join(dir, "keylang.json"));
  const guessed = keylang(dir, ["check"]);
  assert.equal(guessed.status, 1, guessed.stdout);
  assert.match(guessed.stdout, /K102/);
  assert.match(guessed.stdout, /deny-overrides/);
});

test("format rejects a non-integer or a newer edition and names the file and the field", (t) => {
  const dir = repo(t, { "keylang.json": config(), ...source, "keylang/rules.md": pair, "keylang/map.md": "# map\n\n- app\n" });
  const cases: [unknown, RegExp][] = [
    ["1", /`format` must be a positive integer, got "1"/],
    [0, /`format` must be a positive integer, got 0/],
    [-1, /`format` must be a positive integer, got -1/],
    [1.5, /`format` must be a positive integer, got 1\.5/],
    [null, /`format` must be a positive integer, got null/],
  ];
  for (const [format, message] of cases) {
    writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ format, languages: ["typescript"], layers })}\n`);
    const checked = keylang(dir, ["check"]);
    assert.equal(checked.status, 2, `${JSON.stringify(format)}\n${checked.stderr}`);
    assert.match(checked.stderr, /keylang\.json:/);
    assert.match(checked.stderr, message);
  }
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ format: 3, languages: ["typescript"], layers })}\n`);
  for (const args of [["check"], ["map"], ["fmt", "--check", "keylang/map.md"], ["parse", "--json", "keylang/map.md"]]) {
    const run = keylang(dir, args);
    assert.equal(run.status, 2, args.join(" "));
    assert.match(run.stderr, /keylang\.json:.*`format` 3 is newer than this keylang reads \(2\); upgrade keylang/);
    assert.equal(existsSync(join(dir, "keylang/map")), false);
  }
  writeFileSync(join(dir, "keylang.json"), "{ nope");
  const broken = keylang(dir, ["fmt", "--check", "keylang/map.md"]);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /cannot determine `format`: invalid JSON/);
  writeFileSync(join(dir, "keylang.json"), "[1]\n");
  const array = keylang(dir, ["parse", "keylang/map.md"]);
  assert.equal(array.status, 2);
  assert.match(array.stderr, /cannot determine `format`: the file is not a JSON object/);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ format: 1, layers: { app: 1 } })}\n`);
  const fmt = keylang(dir, ["fmt", "--check", "keylang/map.md"]);
  assert.equal(fmt.status, 0, fmt.stderr);
});

test("init writes format 2 first and does not rewrite an existing file; draft map prints it", (t) => {
  const dir = repo(t, { "package.json": '{"name":"fmt","private":true}\n', "src/app/main.ts": "export const n = 1;\n" });
  const drafted = keylang(dir, ["draft", "map"]);
  assert.equal(drafted.status, 0, drafted.stderr);
  const printed = JSON.parse(drafted.stdout) as { format: number };
  assert.equal(printed.format, 2);
  assert.equal(Object.keys(printed)[0], "format");
  const init = keylang(dir, ["init", "--agents=none"]);
  assert.equal(init.status, 0, init.stderr);
  const written = readFileSync(join(dir, "keylang.json"), "utf8");
  const body = JSON.parse(written) as { format: number };
  assert.equal(body.format, 2);
  assert.equal(Object.keys(body)[0], "format");
  const again = keylang(dir, ["init", "--agents=none"]);
  assert.match(again.stdout, /already exists, kept/);
  assert.equal(readFileSync(join(dir, "keylang.json"), "utf8"), written);
  const kept = repo(t, { "src/app/main.ts": "export const n = 1;\n", "keylang.json": '{"languages":["typescript"]}\n' });
  const before = readFileSync(join(kept, "keylang.json"), "utf8");
  assert.match(keylang(kept, ["init", "--agents=none"]).stdout, /already exists, kept/);
  assert.equal(readFileSync(join(kept, "keylang.json"), "utf8"), before);
});

test("wiring uses the same decision: format 2 blocks wire, format 1 only warns", (t) => {
  const files = {
    "src/app/x/y.ts": "export function make(): number { return 1; }\n",
    "src/domain/storefront.ts": "export function item(): number { return 1; }\n",
    "keylang/rules.md": pair,
    "keylang/wiring.md": "# wiring\n\n- wire app.x.y.make\n  - item domain.storefront.item\n",
  };
  const one = repo(t, { "keylang.json": config(1), ...files });
  const format1 = keylang(one, ["check"]);
  assert.match(format1.stdout, /K106/);
  assert.doesNotMatch(format1.stdout, /K102/);
  const two = repo(t, { "keylang.json": config(2), ...files });
  const format2 = keylang(two, ["check"]);
  assert.match(format2.stdout, /wiring\.md:4:3: K102 divergence: wiring `app\.x\.y\.make` depends on `domain\.storefront\.item`/);
  assert.match(format2.stdout, /deny-overrides beats incomparable `allow app\.x\.y domain`/);
  const wire = keylang(two, ["wire"]);
  assert.equal(wire.status, 1, wire.stdout + wire.stderr);
  assert.match(wire.stderr, /nothing written/);
  assert.equal(existsSync(join(two, "keylang.gen.ts")), false);
});

test("a handwritten deny of a package is not K106; each K102 names the baseline allow", (t) => {
  const dir = repo(t, {
    "package.json": `${JSON.stringify({ name: "pkgs", private: true, dependencies: { "left-pad": "1.0.0", has: "1.0.0" } })}\n`,
    "src/app/x/y.ts": 'import leftPad from "left-pad";\nimport has from "has";\nexport const n = leftPad && has ? 1 : 0;\n',
  });
  assert.equal(keylang(dir, ["init", "--agents=none"]).status, 0);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny app.x external\n");
  const checked = keylang(dir, ["check"]);
  assert.doesNotMatch(checked.stdout, /K106/, checked.stdout);
  const baseline = readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8").split("\n");
  for (const pkg of ["external.left-pad", "external.has"]) {
    const line = baseline.findIndex((text) => text === `- allow app ${pkg}`) + 1;
    assert.ok(line > 0, baseline.join("\n"));
    assert.match(checked.stdout, new RegExp(`incomparable \`allow app ${pkg.replace(".", "\\.")}\` \\(keylang/rules\\.baseline\\.md:${line}\\)`));
  }
});

test("explain K106 exits 0 and names format 2", () => {
  const explained = keylang(root, ["explain", "K106"]);
  assert.equal(explained.status, 0, explained.stderr);
  assert.match(explained.stdout, /deny-overrides/);
  assert.match(explained.stdout, /Format 2/);
});

test("format is not part of snapshotId", (t) => {
  const files = { ...source, "keylang/rules.md": pair };
  const a = repo(t, { "keylang.json": config(1), ...files });
  const b = repo(t, { "keylang.json": config(2), ...files });
  assert.equal(keylang(a, ["map"]).status, 0);
  assert.equal(keylang(b, ["map"]).status, 0);
  const id = (dir: string): string => (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
  assert.equal(id(a), id(b));
});
