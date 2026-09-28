// Regressions from the M0–M4 code review (2026-09-28), through the real CLI:
// false `ok` from unknown aliases and from `planned` text matching, opaque
// modules and dependency holes in rules, directory modules, config limits,
// fmt keeping heading comments, BOM, deep module chains, LSP robustness and
// output errors.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.ts";
import { RESERVED_LAYER_NAMES } from "../src/config.ts";
import { keywordsAt } from "../src/parser.ts";
import { matchTest, type TestCase } from "../src/test-report.ts";
import { totals } from "../src/tui/evidence.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function repo(t: { after: (f: () => void) => void }, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-core-"));
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

const config = (layers: Record<string, string[]>, extra: object = {}): string => `${JSON.stringify({ languages: ["typescript"], layers, ...extra })}\n`;

test("an alias keylang cannot resolve is a hole, not an external package: deny is unverified, not ok", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ domain: ["src/domain/**"], infra: ["src/infra/**"] }),
    "src/domain/order.ts": 'import { save } from "@/infra/db";\nexport function buy(): void {\n  save();\n}\n',
    "src/infra/db.ts": "export function save(): void {}\n",
    "tsconfig.json": '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }\n',
    "keylang/rules.md": "# rules\n\n- deny domain infra\n",
  });
  // The alias is in a referenced config: resolved, and the deny finds it.
  writeFileSync(join(dir, "tsconfig.app.json"), '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n');
  const found = keylang(dir, ["check"]);
  assert.equal(found.status, 1, found.stdout);
  assert.match(found.stdout, /K102/);
  // Without the alias anywhere it is unknown: not ok.
  rmSync(join(dir, "tsconfig.app.json"));
  const unknown = keylang(dir, ["check", "--strict"]);
  assert.equal(unknown.status, 1, unknown.stdout + unknown.stderr);
  assert.doesNotMatch(unknown.stdout + unknown.stderr, /\b1 ok/);
  assert.match(unknown.stdout, /unverified/);
});

test("a planned ID silences only the K001 of exactly that ID", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ domain: ["src/domain/**"], infra: ["src/infra/**"] }),
    "src/domain/order.ts": "export function buy(): void {}\n",
    "src/infra/db.ts": "export function save(): void {}\n",
    "keylang/flows/f.md": "# flow f\n\n- planned module planned\n- planned fn domain.order.pay\n",
    "keylang/rules.md": "# rules\n\n- deny domian infra\n- deny domain.order.payy infra\n",
  });
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /K001 dangling reference `domian`/);
  assert.match(r.stdout, /K001 dangling reference `domain\.order\.payy`/);
});

test("rules: exports of an opaque module and no-cycles over a hole are unverified; an entry may name a layer", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"] }),
    "src/app/util.ts": "export function one( {\n",
    "src/app/a.ts": 'import { b } from "./b.ts";\nexport function a(): void {\n  b();\n}\n',
    "src/app/b.ts": 'export async function b(): Promise<void> {\n  const n = "./a.ts";\n  await import(n);\n}\n',
    "keylang/rules.md": "# rules\n\n- module app.util\n  - exports one\n- no-cycles\n- entry\n  - app\n",
  });
  const r = keylang(dir, ["check", "--format", "json"]);
  const verdicts = JSON.parse(r.stdout) as { results?: { verdict: string; criterion: string; message: string }[] };
  const results = verdicts.results ?? (JSON.parse(r.stdout) as { verdict: string; criterion: string; message: string }[]);
  const of = (criterion: string) => results.filter((item) => item.criterion === criterion);
  assert.deepEqual(of("exports app.util").map((item) => item.verdict), ["unverified"], r.stdout);
  assert.deepEqual(of("no-cycles").map((item) => item.verdict), ["unverified"], r.stdout);
  assert.doesNotMatch(r.stdout, /K103/, "the layer named by entry is reachable");
});

test("a directory module attributes each fn and import to its own file", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ domain: ["src/domain/**"], infra: ["src/infra/**"] }, { module: "dir" }),
    "src/domain/order/a.ts": "export const x = 1;\n",
    "src/domain/order/b.ts": '// b\nimport { save } from "../../infra/db.ts";\nexport function buy(): void {\n  save();\n}\n',
    "src/infra/db.ts": "export function save(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny domain infra\n",
  });
  const r = keylang(dir, ["check"]);
  assert.match(r.stdout, /src\/domain\/order\/b\.ts:2:1: K102/);
  keylang(dir, ["map"]);
  assert.match(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), /fn \[buy\]\(\.\.\/\.\.\/src\/domain\/order\/b\.ts#L3\)/);
});

test("the snapshot id changes with tsconfig paths, which decide edges", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/**"] }),
    "src/a.ts": "export function a(): void {}\n",
  });
  keylang(dir, ["map"]);
  const before = (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
  writeFileSync(join(dir, "tsconfig.json"), '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n');
  keylang(dir, ["map"]);
  const after = (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
  assert.notEqual(after, before);
});

test("config limits: dir outside the repository, a dotted layer name; brace globs; `$` names stay apart", (t) => {
  const dir = repo(t, { "src/a.ts": "export function $save(): void {}\nexport function _save(): void {}\n" });
  for (const [cfg, message] of [
    [{ dir: "../outside" }, /`dir` must be a directory inside the repository/],
    [{ layers: { "core.domain": ["src/**"] } }, /layer name `core\.domain` must be one ID segment/],
  ] as const) {
    writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/**"] }, ...cfg })}\n`);
    const r = keylang(dir, ["map"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, message);
  }
  writeFileSync(join(dir, "keylang.json"), config({ app: ["src/{a,b}.ts"] }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = readFileSync(join(dir, "keylang/map/app.md"), "utf8");
  assert.match(map, /fn \[\$save\]/);
  assert.match(map, /fn \[_save\]/);
});

test("fmt keeps a heading comment; a BOM does not turn a flow into a map", (t) => {
  const dir = repo(t, { "a.md": "# flow checkout <!-- owner: team-a -->\n\n- trigger a.b\n", "b.md": "﻿# flow x\n\n- trigger a.b\n" });
  assert.equal(keylang(dir, ["fmt", "--check", "a.md"]).status, 0);
  const parsed = JSON.parse(keylang(dir, ["parse", "--json", "b.md"]).stdout) as { sections: { kind: string }[] }[] | { sections: { kind: string }[] };
  const doc = Array.isArray(parsed) ? parsed[0]! : parsed;
  assert.equal(doc.sections[0]!.kind, "flow");
});

test("no-cycles survives a chain of 5000 modules", (t) => {
  const files: Record<string, string> = { "keylang.json": config({ app: ["src/**"] }), "keylang/rules.md": "# rules\n\n- no-cycles\n" };
  for (let i = 0; i < 5000; i++) files[`src/m${i}.ts`] = i < 4999 ? `import "./m${i + 1}.ts";\nexport const v${i} = 1;\n` : "export const last = 1;\n";
  const dir = repo(t, files);
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 0, r.stderr.slice(0, 400));
});

test("a file named twice is one document", (t) => {
  const dir = repo(t, { "d/m.md": "# map\n\n- a\n  - m\n" });
  const r = keylang(dir, ["check", "d", "./d/m.md"]);
  assert.doesNotMatch(r.stdout, /K002/);
});

test("map and init take an absolute path; init without sources is a usage error", (t) => {
  const dir = repo(t, { "src/a.ts": "export function a(): void {}\n", "empty/readme.txt": "" });
  assert.equal(keylang(tmpdir(), ["init", dir]).status, 0);
  assert.equal(keylang(tmpdir(), ["map", "--check", dir]).status, 0);
  assert.equal(keylang(dir, ["init", "empty"]).status, 2);
});

test("an output that cannot be written is exit 2, not an empty success", { skip: process.platform !== "linux" }, (t) => {
  const dir = repo(t, { "a.md": "# flow x\n\n- trigger a.b\n" });
  const r = spawnSync("sh", ["-c", `"${process.execPath}" "${bin}" parse --json a.md > /dev/full`], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot write the output/);
});

test("lsp: a malformed message is an error reply, not the end of the server", async (t) => {
  const dir = repo(t, { "keylang/a.md": "# flow x\n\n- trigger a.b\n" });
  const child = spawn(process.execPath, [bin, "lsp"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const frame = (body: string): string => `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  child.stdin.write(frame("{bad}"));
  child.stdin.write(frame("null"));
  child.stdin.write(frame(JSON.stringify({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri: "file://server/share/a.md", version: 1, text: "" } } })));
  child.stdin.write(frame(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "shutdown" })));
  child.stdin.write(frame(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "textDocument/hover", params: { textDocument: { uri: "file:///x.md" }, position: { line: 0, character: 0 } } })));
  const started = Date.now();
  while (!/"id":2/.test(out) && Date.now() - started < 5000) await new Promise((done) => setTimeout(done, 20));
  assert.match(out, /"code":-32700/);
  assert.match(out, /"code":-32600,"message":"a message must be a JSON object"/);
  assert.match(out, /"id":2,"error":\{"code":-32600/, "a request after shutdown is invalid");
  assert.equal(child.exitCode, null, "the server is still running");
  child.stdin.write(frame(JSON.stringify({ jsonrpc: "2.0", method: "exit" })));
  const code = await new Promise<number | null>((done) => child.once("exit", done));
  assert.equal(code, 0);
});

test("test reports: an exact identity wins over a suite test of the same name; old snapshots are not rivals", () => {
  const row = (suite: string, snapshotId: string | null, status: TestCase["status"] = "pass"): TestCase => ({ file: "tests/a.test.ts", suite, name: "works", status, snapshotId, runId: null, report: "r.json" });
  assert.equal(matchTest([row("", "s1"), row("S", "s1")], "tests/a.test.ts", "works", "s1").verdict, "ok");
  assert.equal(matchTest([row("S", "s1")], "tests/a.test.ts", "S > works", "s1").verdict, "ok");
  assert.equal(matchTest([row("", "old", "fail"), row("", "s1")], "tests/a.test.ts", "works", "s1").verdict, "ok");
});

test("trace: spans of two processes of one run never nest into each other; a symlinked root still instruments", (t) => {
  const dir = repo(t, {
    "keylang.json": '{ "languages": ["typescript"], "layers": { "app": "src/app/**" }, "check": { "trace": ".keylang/trace/*.jsonl" } }\n',
    "src/app/main.ts": "export function a(): number { return 1; }\nexport function c(): number { return 2; }\nexport function b(): number { return c(); }\n",
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.a\n  - step app.main.c\n",
  });
  const run = (fn: string, rootDir: string): void => {
    const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), "--input-type=module", "-e", `const m = await import(${JSON.stringify(join(rootDir, "src/app/main.ts"))}); m.${fn}();`], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, KEYLANG_TRACE: join(dir, ".keylang/trace/f.jsonl"), KEYLANG_TRACE_FLOW: "f", KEYLANG_TRACE_TEST: "t1", KEYLANG_TRACE_RUN: "run1", KEYLANG_TRACE_ROOT: rootDir },
    });
    assert.equal(r.status, 0, r.stderr);
  };
  run("a", dir);
  run("b", dir);
  const r = keylang(dir, ["check"]);
  assert.doesNotMatch(r.stdout, /trace ok app\.main\.c/, "c ran under b in another process, never under a");
  // Through a link to the repository the plan still matches the files Node loads.
  const link = join(mkdtempSync(join(tmpdir(), "keylang-link-")), "repo");
  t.after(() => rmSync(dirname(link), { recursive: true, force: true }));
  spawnSync("ln", ["-s", dir, link]);
  rmSync(join(dir, ".keylang/trace"), { recursive: true, force: true });
  run("a", link);
  const lines = readFileSync(join(dir, ".keylang/trace/f.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; instrumented?: string[]; symbolId?: string });
  assert.ok(lines.some((line) => line.event === "start" && line.symbolId === "app.main.a"), "the trigger was wrapped");
  assert.deepEqual(lines.find((line) => line.event === "run")?.instrumented, ["app.main.a", "app.main.c"]);
});

// Regressions from the M5–M7 review (2026-09-28): the language core and the
// dependency rules. Each case is the smallest repository that showed the bug.

type Result = { criterion: string; area: string; verdict: string; evidence: string; code: string | null; line: number };

function results(dir: string, args: string[] = []): { status: number | null; results: Result[]; stderr: string } {
  const r = keylang(dir, ["check", "--format", "json", ...args]);
  return { status: r.status, results: (JSON.parse(r.stdout) as { results: Result[] }).results, stderr: r.stderr };
}

test("headings: only a flow has a name; an empty heading says so; fmt writes one space before a heading comment", (t) => {
  const dir = repo(t, { "a.md": "# rules foo\n\n- no-cycles\n\n# map extra\n\n- a\n\n# wiring x\n\n#\n\n#   <!-- c -->\n\n# flow f g\n\n- trigger a.b\n" });
  const r = keylang(dir, ["check", "a.md"]);
  assert.match(r.stdout, /^a\.md:1:9: K005 unexpected words in heading; only `# flow` takes a name$/m);
  assert.match(r.stdout, /^a\.md:5:7: K005 unexpected words in heading/m);
  assert.match(r.stdout, /^a\.md:9:10: K005 unexpected words in heading/m);
  assert.match(r.stdout, /^a\.md:11:1: K006 section heading without a kind;/m);
  assert.match(r.stdout, /^a\.md:15:10: K005 unexpected words in heading$/m);
  assert.doesNotMatch(r.stdout, /unknown section `# `/);
  const sections = (JSON.parse(keylang(dir, ["parse", "--json", "a.md"]).stdout) as { sections: { kind: string; name: { value: string } | null }[] }[])[0]!.sections;
  assert.deepEqual(sections.map((s) => [s.kind, s.name?.value ?? null]), [["rules", null], ["map", null], ["wiring", null], ["map", null], ["map", null], ["flow", "f"]]);
  assert.equal(keylang(dir, ["fmt", "a.md"]).status, 0);
  assert.match(readFileSync(join(dir, "a.md"), "utf8"), /^# <!-- c -->$/m);
  assert.equal(keylang(dir, ["fmt", "--check", "a.md"]).status, 0, "fmt is idempotent");
});

test("items: tabs matter only where they decide the tree, free text is canonical, `exports ,` names nothing, a decomposed letter is a letter", (t) => {
  const decomposed = "café";
  const dir = repo(t, {
    "prose.md": "\tA paragraph indented with a tab.\n\n```\n\tcode\n```\n\n# flow f\n\n- trigger a.b\n- invariant   stock   never,negative\n",
    "tab.md": "# map\n\n- a\n\t- b\n",
    "rules.md": "# rules\n\n- module a.b\n  - exports ,\n",
    "nfd.md": `# map\n\n- ${decomposed}\n  - module order\n`,
  });
  assert.equal(keylang(dir, ["parse", "prose.md"]).status, 0, "a tab in prose or code is text");
  const text = (file: string): string | undefined => (JSON.parse(keylang(dir, ["parse", "--json", file]).stdout) as { sections: { items: { text?: { value: string } | null }[] }[] }[])[0]!.sections.at(-1)!.items.at(-1)!.text?.value;
  const before = text("prose.md");
  assert.equal(keylang(dir, ["fmt", "prose.md"]).status, 0);
  assert.match(readFileSync(join(dir, "prose.md"), "utf8"), /^\tA paragraph indented with a tab\.$/m);
  assert.equal(before, "stock never, negative", "the text fmt writes");
  assert.equal(text("prose.md"), before, "unchanged by fmt, so its hash is too");
  assert.match(keylang(dir, ["parse", "tab.md"]).stderr, /tab\.md:4:1: K003 tab in indentation/);
  assert.match(keylang(dir, ["parse", "rules.md"]).stderr, /rules\.md:4:3: K005 `exports` needs at least one name/);
  const nfd = keylang(dir, ["parse", "nfd.md"]);
  assert.equal(nfd.status, 0, nfd.stderr);
  assert.match(nfd.stdout, new RegExp(`module ${decomposed}\\.order`));
});

test("a duplicate planned ID is K002 with or without code", (t) => {
  const dir = repo(t, { "keylang/flows/f.md": "# flow f\n\n- planned fn app.x.y\n- planned fn app.x.y\n" });
  const r = keylang(dir, ["check", "keylang"]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout.match(/K002/g)?.length, 1, r.stdout);
  assert.match(r.stdout, /keylang\/flows\/f\.md:4:1: K002 duplicate planned `app\.x\.y` \(first declared at keylang\/flows\/f\.md:3:1\)/);
});

test("did you mean: close names only, not any short name or substring", (t) => {
  const dir = repo(t, { "a.md": "# map\n\n- ab\n  - m\n- domain\n  - order\n\n# rules\n\n- deny zz ab\n- deny banana.x ab\n- deny domian ab\n- deny domain.ordr ab\n" });
  const r = keylang(dir, ["check", "a.md"]);
  assert.match(r.stdout, /K001 dangling reference `zz`; declare/);
  assert.match(r.stdout, /K001 dangling reference `banana\.x`; declare/);
  assert.match(r.stdout, /K001 dangling reference `domian` \(did you mean `domain`\?\)/);
  assert.match(r.stdout, /K001 dangling reference `domain\.ordr` \(did you mean `domain\.order`\?\)/);
});

test("spec files: a linked directory is read, a file reached twice is one document named by its own path", (t) => {
  const dir = repo(t, { "keylang/rules.md": "# map\n\n- a\n  - m\n", "shared/x.md": "# map\n\n- b\n  - n\n" });
  symlinkSync(join(dir, "shared"), join(dir, "keylang/shared"));
  symlinkSync(join(dir, "keylang/rules.md"), join(dir, "keylang/again.md"));
  symlinkSync(join(dir, "keylang"), join(dir, "shared/back"));
  const r = keylang(dir, ["parse", "keylang"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^keylang\/shared\/x\.md$/m);
  assert.match(r.stdout, /^keylang\/rules\.md$/m);
  assert.doesNotMatch(r.stdout, /again\.md|back/);
  assert.doesNotMatch(keylang(dir, ["check", "keylang"]).stdout, /K002/);
});

test("config: `./keylang/` is the spec directory; reserved layer names are rejected; init renames guessed ones with a note", (t) => {
  const dir = repo(t, { "src/a.ts": "export const a = 1;\n", "keylang/tool.ts": "export const t = 1;\n" });
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], dir: "./keylang/", layers: { app: ["**"] } })}\n`);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const files = (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { manifest: { files: { path: string }[] } }).manifest.files.map((f) => f.path);
  assert.deepEqual(files, ["src/a.ts"], "the spec directory is not code");
  for (const name of ["external", "unassigned", "module", "layer", "entry", "no-cycles"]) {
    writeFileSync(join(dir, "keylang.json"), config({ [name]: ["src/**"] }));
    const r = keylang(dir, ["check"]);
    assert.equal(r.status, 2, name);
    assert.match(r.stderr, new RegExp(`keylang\\.json: \`layers\\.${name}\`: \`${name}\` is (reserved|a keyword)`), r.stderr);
  }
  const guessed = repo(t, { "src/external/a.ts": "export const a = 1;\n", "src/module/b.ts": "export const b = 1;\n", "src/2fa/c.ts": "export const c = 1;\n", "src/_2fa/d.ts": "export const d = 1;\n" });
  const init = keylang(guessed, ["init"]);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stderr, /note: `src\/external\/` is layer `external_`: `external` is reserved/);
  assert.match(init.stderr, /note: `src\/module\/` is layer `module_`: `module` is a keyword/);
  assert.match(init.stderr, /note: `src\/_2fa\/` is layer `_2fa_2`: `_2fa` is already the layer of `src\/2fa\/`/);
  const layers = (JSON.parse(readFileSync(join(guessed, "keylang.json"), "utf8")) as { layers: Record<string, string[]> }).layers;
  assert.deepEqual(layers, { _2fa: ["src/2fa/**"], _2fa_2: ["src/_2fa/**"], external_: ["src/external/**"], module_: ["src/module/**"] });
  const checked = keylang(guessed, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
});

test("every keyword at the top of a map is a reserved layer name", () => {
  // The generated map writes a layer as `- <name>`; a keyword there would be read as a rule.
  for (const keyword of keywordsAt("map", undefined)) assert.ok(RESERVED_LAYER_NAMES.has(keyword), keyword);
});

test("rules name a configured layer without modules, `external` and `unassigned` without K001", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], wiring: ["src/wiring/**"] }),
    "src/app/checkout.ts": "export function checkout(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny app wiring\n- deny app external\n- allow unassigned app\n- layers app < wiring\n",
  });
  const r = results(dir);
  assert.equal(r.status, 0, JSON.stringify(r.results));
  assert.ok(!r.results.some((row) => row.code === "K001"), JSON.stringify(r.results));
  assert.deepEqual(r.results.map((row) => `${row.criterion}:${row.verdict}`).sort(), ["deny app external:ok", "deny app wiring:ok", "layers app < wiring:ok"]);
});

test("layers: every line is part of one partial order; a layer twice, a contradiction, or ordered and nested is K005", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ a: ["src/a/**"], b: ["src/b/**"], c: ["src/c/**"], d: ["src/d/**"] }),
    "src/a/x.ts": 'import { y } from "../d/y.ts";\nexport const x = y;\n',
    "src/d/y.ts": "export const y = 1;\n",
    "src/b/z.ts": "export const z = 1;\n",
    "src/c/w.ts": "export const w = 1;\n",
    "keylang/rules.md": "# rules\n\n- layers a < b\n- layers c < d\n",
  });
  const apart = results(dir);
  assert.equal(apart.status, 0, "`a < b` and `c < d` say nothing about `a` and `d`");
  assert.deepEqual(apart.results.map((row) => `${row.criterion}:${row.verdict}`), ["layers a < b:ok", "layers c < d:ok"]);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- layers a < b\n- layers b < d\n");
  const joined = keylang(dir, ["check"]);
  assert.match(joined.stdout, /src\/a\/x\.ts:1:1: K101 divergence: `a\.x` depends on `d\.y` \(layers say `a < d`/, "b < d over a < b puts d above a");
  for (const [rules, message] of [
    ["- layers d < a < d\n", /rules\.md:3:18: K005 layer `d` appears twice in one order/],
    ["- layers a < b\n- layers b < a\n", /rules\.md:4:1: K005 `layers b < a` contradicts an earlier `layers`, which puts `b` above `a`/],
    ["- layers d < a\n  - a\n", /rules\.md:4:5: K005 layer `a` is both in a `layers` order and unordered under it/],
    ["- layers a < d.y\n", /rules\.md:3:14: K005 `layers` orders layers; `d\.y` is not a layer/],
  ] as const) {
    writeFileSync(join(dir, "keylang/rules.md"), `# rules\n\n${rules}`);
    const r = keylang(dir, ["check"]);
    assert.equal(r.status, 1, rules);
    assert.match(r.stdout, message);
    assert.doesNotMatch(r.stdout, /K101/, `${rules}: a rejected order checks nothing`);
  }
});

test("layers and entry have their own ok; a hole in the area makes layers unverified", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], domain: ["src/domain/**"] }),
    "src/app/x.ts": 'import { s } from "../domain/s.ts";\nexport const x = s;\n',
    "src/domain/s.ts": "export const s = 1;\n",
    "keylang/rules.md": "# rules\n\n- layers domain < app\n- entry\n  - app\n",
  });
  const clean = results(dir);
  assert.deepEqual(clean.results.map((row) => `${row.line}:${row.criterion}:${row.verdict}`), ["3:layers domain < app:ok", "4:entry:ok"]);
  writeFileSync(join(dir, "src/domain/s.ts"), 'import { gone } from "./gone.ts";\nexport const s = gone;\n');
  const holed = results(dir);
  const layers = holed.results.find((row) => row.criterion === "layers domain < app");
  assert.equal(layers?.verdict, "unverified");
  assert.match(layers?.evidence ?? "", /unresolved import `\.\/gone\.ts`/);
});

test("rule specificity counts ID segments, not characters; a tie goes to deny", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], domain: ["src/domain/**"] }),
    "src/app/x/y.ts": 'import { s } from "../../domain/storefront.ts";\nexport const y = s;\n',
    "src/domain/storefront.ts": "export const s = 1;\n",
    "keylang/rules.md": "# rules\n\n- deny app.x domain\n- allow app domain.storefront\n",
  });
  // 2 + 1 segments against 1 + 2: a tie, though the allow is longer in characters.
  const tie = keylang(dir, ["check"]);
  assert.equal(tie.status, 1);
  assert.match(tie.stdout, /K102 divergence: `app\.x\.y` depends on `domain\.storefront`, which is denied by `deny app\.x domain`/);
  // 3 + 1 against 1 + 2: the deeper allow wins, though the deny is longer in characters.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- allow app.x.y domain\n- deny app domain.storefront\n");
  const deeper = results(dir);
  assert.equal(deeper.status, 0, JSON.stringify(deeper.results));
  const deny = deeper.results.find((row) => row.criterion === "deny app domain.storefront");
  assert.equal(deny?.verdict, "ok");
  assert.match(deny?.evidence ?? "", /decided by more specific rules \(`allow app\.x\.y domain`\)/);
});

test("allow and deny over a function are K005, not a vacuous ok", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], infra: ["src/infra/**"] }),
    "src/app/checkout.ts": 'import { save } from "../infra/db.ts";\nexport function checkout(): void {\n  save();\n}\n',
    "src/infra/db.ts": "export function save(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny app.checkout.checkout infra.db.save\n",
  });
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /rules\.md:3:8: K005 `deny` takes layers, modules and ID prefixes; `app\.checkout\.checkout` is a fn, name its module `app\.checkout`/);
  assert.match(r.stdout, /rules\.md:3:30: K005 `deny` takes layers, modules and ID prefixes; `infra\.db\.save` is a fn/);
  assert.match(r.stderr, / 0 ok$/m, "the rejected deny has no verdict");
});

test("a class is part of its file: one dependency is one K102, and entry reaches an unused class through its file", async (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], infra: ["src/infra/**"] }),
    "src/app/main.ts": 'import { Db } from "../infra/db.ts";\nexport function run(db: Db): void {\n  db.save();\n}\n',
    "src/infra/db.ts": "export class Db {\n  save(): void {}\n}\nexport class Unused {\n  go(): void {}\n}\n",
    "src/infra/lonely.ts": "export const lonely = 1;\n",
    "keylang/rules.md": "# rules\n\n- deny app infra\n- entry\n  - app.main\n",
  });
  const r = keylang(dir, ["check"]);
  assert.equal(r.stdout.match(/K102/g)?.length, 1, r.stdout);
  assert.match(r.stdout, /src\/app\/main\.ts:1:1: K102 divergence: `app\.main` depends on `infra\.db`/);
  assert.doesNotMatch(r.stdout, /K103[^\n]*Unused/, "the class's file is reachable");
  assert.match(r.stdout, /src\/infra\/lonely\.ts:1:1: K103 absence: module `infra\.lonely`/);
  // A warning is a diagnostic, never a failing verdict: the CLI, JSON and the TUI count alike.
  assert.match(r.stderr, /^1 fail, /m);
  const json = results(dir);
  assert.deepEqual(json.results.filter((row) => row.code === "K103").map((row) => [row.verdict, row.criterion, row.area]), [["warning", "entry", "infra.lonely"]]);
  const analysis = await analyze({ root: dir });
  assert.ok(!analysis.verdicts.some((verdict) => verdict.verdict === "fail" && verdict.criterion === "entry"));
  assert.equal(totals(analysis).fail, 1, "only the K102 line fails in the TUI too");
  // A rule may still scope a class: the edge to the class is the evidence.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny app infra.db.Db\n- deny app infra.db.Unused\n");
  const scoped = results(dir);
  assert.deepEqual(scoped.results.map((row) => `${row.criterion}:${row.verdict}`).sort(), ["deny app infra.db.Db:fail", "deny app infra.db.Unused:ok"]);
});

test("a deny or exports over a module that exists only as planned is unverified, not a hidden ok", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], infra: ["src/infra/**"] }),
    "src/app/checkout.ts": "export function checkout(): void {}\n",
    "src/infra/db.ts": "export function save(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny app.refund infra\n- module app.refund\n  - exports refund\n",
    "keylang/flows/r.md": "# flow r\n\n- planned module app.refund\n",
  });
  const r = results(dir);
  assert.equal(r.status, 0, JSON.stringify(r.results));
  assert.deepEqual(r.results.map((row) => `${row.criterion}:${row.verdict}:${row.evidence}`), [
    "deny app.refund infra:unverified:`app.refund` is planned: no code in the area yet",
    "exports app.refund:unverified:`app.refund` is planned: no code yet",
  ]);
});

test("exports compares the module's own table, not the tables of its submodules", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"] }),
    "src/app/purchase.ts": "export function purchaseNow(): void {}\n",
    "src/app/purchase/buy.ts": "export function buy(): void {}\nexport default buy;\n",
    "keylang/rules.md": "# rules\n\n- module app.purchase\n  - exports purchaseNow\n",
  });
  const own = results(dir);
  assert.equal(own.status, 0, JSON.stringify(own.results));
  assert.equal(own.results.find((row) => row.criterion === "exports app.purchase")?.verdict, "ok");
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module app.purchase\n  - exports purchaseNow, buy, default\n");
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /K104 absence: `app\.purchase` does not export `buy`/);
  assert.match(r.stdout, /K104 absence: `app\.purchase` does not export `default`/);
});

test("a partly parsed module keeps an unknown member unverified, not K001, even with known members in the map", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"] }),
    "src/app/util.ts": "export function one(): void {}\nexport function two( {\n",
    "keylang/flows/f.md": "# flow f\n\n- trigger app.util.one\n  - step app.util.three\n",
  });
  const r = keylang(dir, ["check"]);
  assert.doesNotMatch(r.stdout, /K001/, r.stdout);
  assert.match(r.stdout, /f\.md:4:3: ID unverified app\.util\.three: opaque module/);
});
