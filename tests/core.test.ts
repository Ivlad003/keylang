// Regressions from the M0–M4 code review (2026-09-28), through the real CLI:
// false `ok` from unknown aliases and from `planned` text matching, opaque
// modules and dependency holes in rules, directory modules, config limits,
// fmt keeping heading comments, BOM, deep module chains, LSP robustness and
// output errors.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.ts";
import { RESERVED_LAYER_NAMES } from "../src/config.ts";
import type { Document, Node, Ref } from "../src/ir.ts";
import { sectionNodes, walk } from "../src/ir.ts";
import type { Span } from "../src/span.ts";
import { keywordsAt, parse } from "../src/parser.ts";
import * as api from "../src/index.ts";
import { compileSpec, type FlowItem, type SpecIR } from "../src/spec-ir.ts";
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
  child.stdin.write(frame(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} })));
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
  // A decomposed letter is a letter; the ID is its NFC form (grammar.md §4).
  assert.match(nfd.stdout, new RegExp(`module ${decomposed.normalize("NFC")}\\.order`));
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

// `README.md` is the start page of the explained map: a layer of that name (in any case: one file on macOS and Windows) would lose its layer file to it.
test("config: `README` in any case is a reserved layer name; init renames a guessed one", (t) => {
  const dir = repo(t, { "src/app/a.ts": "export const a = 1;\n", "src/docs/r.ts": "export function r(): void {}\n" });
  for (const name of ["README", "readme", "ReadMe"]) {
    writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], [name]: ["src/docs/**"] }, explain: { map: true } })}\n`);
    const r = keylang(dir, ["map"]);
    assert.equal(r.status, 2, `${name}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, new RegExp(`keylang\\.json: \`layers\\.${name}\`: \`${name}\` is reserved: \`README\\.md\` is the start page of the explained map`), r.stderr);
    assert.equal(existsSync(join(dir, "keylang/map-explained")), false);
  }
  const guessed = repo(t, { "src/README/a.ts": "export const a = 1;\n", "src/app/b.ts": "export const b = 1;\n" });
  const init = keylang(guessed, ["init", "--agents=none"]);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stderr, /note: `src\/README\/` is layer `README_`: `README` is reserved/);
  const layers = (JSON.parse(readFileSync(join(guessed, "keylang.json"), "utf8")) as { layers: Record<string, string[]> }).layers;
  assert.deepEqual(Object.keys(layers).sort(), ["README_", "app"]);
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

test("rule specificity counts ID segments; an equal-sum cross pair is incomparable and deny wins", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], domain: ["src/domain/**"] }),
    "src/app/x/y.ts": 'import { s } from "../../domain/storefront.ts";\nexport const y = s;\n',
    "src/domain/storefront.ts": "export const s = 1;\n",
    "keylang/rules.md": "# rules\n\n- deny app.x domain\n- allow app domain.storefront\n",
  });
  // 2 + 1 against 1 + 2: the sums are equal, and the rules are incomparable. Deny wins, and K102 names the allow.
  const tie = keylang(dir, ["check"]);
  assert.equal(tie.status, 1);
  assert.match(tie.stdout, /K102 divergence: `app\.x\.y` depends on `domain\.storefront`, which is denied by `deny app\.x domain`/);
  assert.match(tie.stdout, /incomparable `allow app domain\.storefront` \(keylang\/rules\.md:4\) loses on a depth-sum tie/);
  assert.doesNotMatch(tie.stdout, /K106/);
  // Comparable: the allow is narrower on both areas, so it wins and there is no K106.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny app domain\n- allow app.x domain.storefront\n");
  const comparable = keylang(dir, ["check"]);
  assert.equal(comparable.status, 0, comparable.stdout);
  assert.doesNotMatch(comparable.stdout, /K102|K106/);
  // Equal areas: deny wins. Not incomparable, so no K106 and the K102 does not name an allow.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- allow app domain\n- deny app domain\n");
  const equal = keylang(dir, ["check"]);
  assert.equal(equal.status, 1);
  assert.match(equal.stdout, /denied by `deny app domain`/);
  assert.doesNotMatch(equal.stdout, /K106|incomparable/);
});

test("K106 warns when an allow beats an incomparable deny on depth sum", (t) => {
  const files = {
    "keylang.json": config({ app: ["src/app/**"], domain: ["src/domain/**"] }),
    "src/app/x/y.ts": 'import { s } from "../../domain/storefront.ts";\nexport const y = s;\n',
    "src/domain/storefront.ts": "export const s = 1;\n",
    "keylang/rules.md": "# rules\n\n- allow app.x.y domain\n- deny app domain.storefront\n",
  };
  const dir = repo(t, files);
  const human = keylang(dir, ["check"]);
  assert.equal(human.status, 0, human.stdout + human.stderr);
  assert.match(human.stderr, /0 fail/);
  assert.match(human.stdout, /keylang\/rules\.md:3:1: K106 `allow app\.x\.y domain` and `deny app domain\.storefront` \(keylang\/rules\.md:4\) are incomparable; allow wins on depth sum \(4 > 3\); add `allow app\.x\.y domain\.storefront` or `deny app\.x\.y domain\.storefront`/);
  const body = results(dir);
  const warning = body.results.find((row) => row.code === "K106");
  assert.equal(warning?.verdict, "warning");
  assert.equal(warning?.line, 3);
  const deny = body.results.find((row) => row.criterion === "deny app domain.storefront");
  assert.equal(deny?.verdict, "ok");
  assert.match(deny?.evidence ?? "", /allow app\.x\.y domain/);
  assert.doesNotMatch(deny?.evidence ?? "", /more specific/);

  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- allow app.x.y domain\n- deny app domain.storefront\n- deny app.x.y domain.storefront\n");
  const narrowed = keylang(dir, ["check"]);
  assert.equal(narrowed.status, 1, narrowed.stdout);
  assert.match(narrowed.stdout, /K102/);
  assert.doesNotMatch(narrowed.stdout, /K106/);

  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- allow app.x.y domain\n- deny app domain.storefront\n- allow app.x.y domain.storefront\n");
  const allowed = keylang(dir, ["check"]);
  assert.equal(allowed.status, 0, allowed.stdout);
  assert.doesNotMatch(allowed.stdout, /K102|K106/);

  writeFileSync(join(dir, "src/app/x/y.ts"), "export const y = 1;\n");
  writeFileSync(join(dir, "keylang/rules.md"), files["keylang/rules.md"]);
  const noEdge = keylang(dir, ["check"]);
  assert.match(noEdge.stdout, /rules\.md:3:1: K106/);
  assert.equal((noEdge.stdout.match(/K106/g) ?? []).length, 1);

  rmSync(join(dir, "src/app/x/y.ts"));
  mkdirSync(join(dir, "src/app/x/y"), { recursive: true });
  const importer = 'import { s } from "../../../domain/storefront.ts";\nexport const y = s;\n';
  writeFileSync(join(dir, "src/app/x/y/a.ts"), importer);
  writeFileSync(join(dir, "src/app/x/y/b.ts"), importer);
  const two = keylang(dir, ["check"]);
  assert.equal((two.stdout.match(/K106/g) ?? []).length, 1, two.stdout);
  assert.match(two.stdout, /rules\.md:3:1: K106/);
});

// A rule on the intersection clears K106 whether it names one target or several: `deny A B, C` covers the pair (A, B).
test("K106 is cleared by a rule on the intersection that has more than one target", (t) => {
  const dir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"], domain: ["src/domain/**"], infra: ["src/infra/**"] }),
    "src/app/x/y.ts": 'import { s } from "../../domain/storefront.ts";\nexport const y = s;\n',
    "src/domain/storefront.ts": "export const s = 1;\n",
    "src/infra/db.ts": "export const d = 1;\n",
    "keylang/rules.md": "# rules\n",
  });
  const rules = (third: string): string => `# rules\n\n- allow app.x.y domain\n- deny app domain.storefront\n- ${third}\n`;
  writeFileSync(join(dir, "keylang/rules.md"), rules("deny app.x.y domain.storefront, infra.db"));
  const denied = keylang(dir, ["check"]);
  assert.equal(denied.status, 1, denied.stdout);
  assert.match(denied.stdout, /K102/);
  assert.doesNotMatch(denied.stdout, /K106/);
  writeFileSync(join(dir, "keylang/rules.md"), rules("allow app.x.y infra.db, domain.storefront"));
  const allowed = keylang(dir, ["check"]);
  assert.equal(allowed.status, 0, allowed.stdout);
  assert.doesNotMatch(allowed.stdout, /K102|K106/);
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

test("a source directory keylang cannot read is a hole of its scope, not a crash and not an absence", { skip: process.getuid?.() === 0 ? "root reads any directory" : false }, (t) => {
  const dir = repo(t, {
    "keylang.json": config({ domain: ["src/domain/**"], infra: ["src/infra/**"] }),
    "keylang/rules.md": "# rules\n\n- layers infra < domain\n- deny domain infra\n- no-cycles\n",
    "src/domain/order.ts": "export function total(): number {\n  return 1;\n}\n",
    "src/infra/db.ts": "export function save(): void {}\n",
    "src/domain/locked/sneaky.ts": 'import { save } from "../../infra/db.ts";\nexport function sneaky(): void {\n  save();\n}\n',
  });
  const locked = join(dir, "src/domain/locked");
  chmodSync(locked, 0o000);
  try {
    const map = keylang(dir, ["map"]);
    assert.equal(map.status, 0, map.stderr);
    assert.match(map.stderr, /warning: `src\/domain\/locked`: directory is not readable \(EACCES\); its files are not indexed/);
    const check = keylang(dir, ["check", "--strict"]);
    assert.equal(check.status, 1, "unverified under --strict");
    assert.match(check.stdout, /rules\.md:4:1: unverified directory is not readable \(EACCES\) \(src\/domain\/locked:1:1\)/, "deny over the scope is not ok");
    assert.match(check.stdout, /rules\.md:5:1: unverified no cycle among the known imports, but directory is not readable/);
    assert.match(check.stderr, /0 fail, 3 unverified \(from 1 hole\), 0 ok/, "one hole leaves three rules unverified");
  } finally {
    // Before the temporary copy is removed.
    chmodSync(locked, 0o755);
  }
  assert.match(keylang(dir, ["check"]).stdout, /K102 divergence: `domain\.locked\.sneaky` depends on `infra\.db`/, "readable again, the edge is there");
});

test("a source file keylang cannot read is an opaque module and a hole, not code 2", { skip: process.getuid?.() === 0 ? "root reads any file" : false }, (t) => {
  const dir = repo(t, {
    "keylang.json": config({ domain: ["src/domain/**"], infra: ["src/infra/**"] }),
    "keylang/rules.md": "# rules\n\n- layers infra < domain\n- deny domain infra\n- no-cycles\n",
    "src/domain/order.ts": "export function total(): number {\n  return 1;\n}\n",
    "src/infra/db.ts": "export function save(): void {}\n",
    "src/domain/secret.ts": 'import { save } from "../infra/db.ts";\nexport function sneaky(): void {\n  save();\n}\n',
  });
  const secret = join(dir, "src/domain/secret.ts");
  chmodSync(secret, 0o000);
  try {
    const map = keylang(dir, ["map"]);
    assert.equal(map.status, 0, map.stderr);
    assert.match(map.stderr, /warning: `src\/domain\/secret\.ts`: file is not readable \(EACCES\); its contents are not indexed/);
    assert.equal(keylang(dir, ["map", "--check"]).status, 0);
    const check = keylang(dir, ["check", "--strict"]);
    assert.equal(check.status, 1, `unverified under --strict: ${check.stderr}`);
    assert.match(check.stdout, /rules\.md:4:1: unverified file is not readable \(EACCES\) \(src\/domain\/secret\.ts:1:1\)/, "deny over the module is not ok");
    assert.equal(keylang(dir, ["check"]).status, 0, "unverified is not a fail");
  } finally {
    // Before the temporary copy is removed.
    chmodSync(secret, 0o644);
  }
  assert.match(keylang(dir, ["check"]).stdout, /K102 divergence: `domain\.secret` depends on `infra\.db`/, "readable again, the edge is there");
});

test("exports with no names is only parser K005, and an empty entry has no verdict", (t) => {
  const exportsDir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"] }),
    "src/app/checkout.ts": "export function buy(): void {}\n",
    "keylang/rules.md": "# rules\n\n- module app.checkout\n  - exports\n",
  });
  const exported = keylang(exportsDir, ["check"]);
  assert.equal(exported.status, 1, exported.stdout);
  assert.match(exported.stdout, /`exports` needs at least one name/);
  assert.doesNotMatch(exported.stdout, /K104/);

  const entryDir = repo(t, {
    "keylang.json": config({ app: ["src/app/**"] }),
    "src/app/checkout.ts": "export function buy(): void {}\n",
    "keylang/rules.md": "# rules\n\n- entry\n  - app\n- entry\n",
  });
  const entered = keylang(entryDir, ["check", "--format", "json"]);
  assert.equal(entered.status, 0, entered.stderr + entered.stdout);
  const body = JSON.parse(entered.stdout) as { results: { criterion: string; line: number }[] };
  const entries = body.results.filter((result) => result.criterion === "entry");
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.line, 3);
});

test("compileSpec canonical text matches the spec-forms golden, and a line with no target is not an assertion", () => {
  const validDir = join(root, "tests/fixtures/spec-forms/valid");
  const invalidDir = join(root, "tests/fixtures/spec-forms/invalid");
  const validDocs = parsedDocs(validDir);
  const invalidDocs = parsedDocs(invalidDir);
  const valid = compileSpec(validDocs);
  const invalid = compileSpec(invalidDocs);
  assert.deepEqual(valid.diagnostics, []);
  assert.equal(invalid.spec.rules.filter((rule) => rule.kind === "layers").length, 1);
  assert.equal(invalid.spec.rejectedLayers.length, 3);
  const whenCount = invalid.spec.wires.reduce((count, wire) => count + wire.deps.reduce((deps, dep) => deps + dep.when.length, 0), 0);
  assert.equal(whenCount, 0);
  const invalidDeps = invalid.spec.rules.filter((rule) => rule.kind === "dependency");
  assert.equal(invalidDeps.length, 1);
  assert.ok(invalidDeps.every((rule) => rule.to.length > 0));
  const messages = invalid.diagnostics.map((diag) => diag.message);
  assert.ok(messages.some((message) => message.includes("`layers` lists layers") && message.includes("`app.buy`")));
  assert.ok(messages.some((message) => message.includes("`layers` orders layers") && message.includes("`app.buy`")));
  assert.ok(messages.some((message) => message.includes("contradicts an earlier `layers`")));
  assert.ok(messages.some((message) => message.includes("layer `domain` appears twice")));
  assert.ok(messages.some((message) => message.includes("both in a `layers` order")));
  assert.equal(messages.filter((message) => message === "a wiring condition must be `env.NAME = value`").length, 1);
  assert.equal(messages.some((message) => message.includes("takes layers") || message.includes("needs at least") || message.includes("deny")), false);

  for (const ref of assertionRefs(valid.spec)) assertRefInParse(validDocs, ref);
  for (const ref of assertionRefs(invalid.spec)) assertRefInParse(invalidDocs, ref);

  const golden = JSON.parse(readFileSync(join(root, "tests/fixtures/spec-forms/valid.expected/check.json"), "utf8")) as {
    results: { criterion: string; file: string; line: number; code: string | null; specHash: string; evidence: string }[];
  };
  const atoms = assertionTexts(valid.spec);
  const entryText = valid.spec.rules
    .filter((rule) => rule.kind === "entry")
    .map((rule) => rule.text)
    .join("\n");
  const layerText = valid.spec.rules
    .filter((rule) => rule.kind === "layers" && rule.layers.length > 0)
    .map((rule) => rule.text)
    .join("\n");
  for (const result of golden.results) {
    if (result.criterion === "K102") continue;
    if (result.criterion === "entry" || result.code === "K103") {
      assert.equal(result.specHash, sha256(entryText), result.evidence);
      continue;
    }
    if (result.code === "K101" || result.criterion.startsWith("layers ")) {
      assert.equal(result.specHash, sha256(layerText), result.evidence);
      continue;
    }
    const onLine = atoms.filter((atom) => atom.file === result.file && atom.line === result.line);
    if (onLine.length === 1) {
      assert.equal(result.specHash, sha256(onLine[0]!.text), result.evidence);
      continue;
    }
    const byText = atoms.filter((atom) => atom.text === result.criterion);
    assert.equal(byText.length, 1, result.evidence);
    assert.equal(result.specHash, sha256(byText[0]!.text), result.evidence);
  }

  assert.equal(valid.spec.rules.filter((rule) => rule.kind === "dependency" && rule.effect === "deny").length, 1);
  assert.ok(valid.spec.flows.some((flow) => flow.name === "buy" && flow.triggers.length === 1));
  assert.equal(valid.spec.planned[0]?.id, "app.buy.refund");
  assert.equal(valid.spec.wires[0]?.deps[0]?.when[0]?.env, "MODE");
  assert.equal(valid.spec.wires[0]?.deps[0]?.when[0]?.value, "fast");

  for (const [docs, spec] of [
    [validDocs, valid.spec],
    [invalidDocs, invalid.spec],
  ] as const) {
    const texts = assertionTexts(spec);
    for (const doc of docs) {
      for (const section of doc.sections) {
        for (const node of sectionNodes(section)) {
          walk(node, (item) => {
            if (!missingTarget(item)) return;
            const hit = texts.some((atom) => atom.file === doc.path && atom.line === item.span.start.line && atom.end === item.span.end.offset);
            assert.equal(hit, false, `${doc.path}:${item.span.start.line} ${item.kind} compiled without a target`);
          });
        }
      }
    }
  }

  const bare = parse("bare.md", "# rules\n\n- entry\n- deny app\n- module app.checkout\n  - exports\n");
  const bareSpec = compileSpec([bare]).spec;
  assert.deepEqual(bareSpec.rules, []);
  assert.equal(Object.hasOwn(api, "compileSpec"), false);
});

function parsedDocs(dir: string): Document[] {
  const parsed = keylang(dir, ["parse", "--json", "keylang"]);
  assert.ok(parsed.stdout.startsWith("["), parsed.stderr);
  return JSON.parse(parsed.stdout) as Document[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sameSpan(a: Span, b: Span): boolean {
  return a.start.offset === b.start.offset && a.start.line === b.start.line && a.start.col === b.start.col && a.end.offset === b.end.offset && a.end.line === b.end.line && a.end.col === b.end.col;
}

function assertRefInParse(docs: readonly Document[], ref: Ref & { file: string }): void {
  const found = docs.some((doc) => {
    if (doc.path !== ref.file) return false;
    return doc.sections.some((section) =>
      sectionNodes(section).some((node) => {
        let hit = false;
        walk(node, (item) => {
          if (item.refs.some((candidate) => candidate.target === ref.target && sameSpan(candidate.span, ref.span))) hit = true;
        });
        return hit;
      }),
    );
  });
  assert.equal(found, true, `${ref.file} ${ref.target} @ ${ref.span.start.line}:${ref.span.start.col}`);
}

function assertionRefs(spec: SpecIR): (Ref & { file: string })[] {
  const refs: (Ref & { file: string })[] = [];
  const add = (file: string, ref: Ref | null | undefined): void => {
    if (ref) refs.push({ ...ref, file });
  };
  for (const rule of spec.rules) {
    if (rule.kind === "layers") {
      for (const ref of rule.nested) add(rule.file, ref);
    } else if (rule.kind === "dependency") {
      add(rule.file, rule.from);
      for (const ref of rule.to) add(rule.file, ref);
    } else if (rule.kind === "entry") for (const ref of rule.entries) add(rule.file, ref);
    else if (rule.kind === "no-cycles") add(rule.file, rule.under);
    else {
      add(rule.file, rule.module);
      for (const ref of rule.names) add(rule.file, ref);
    }
  }
  const walkItems = (file: string, items: readonly FlowItem[]): void => {
    for (const item of items) {
      if (item.kind === "step") add(file, item.target);
      if (item.kind === "then" && item.form === "ref") add(file, item.target);
      if (item.kind === "reads" || item.kind === "emits" || item.kind === "invariant") add(file, item.target);
      if ("children" in item) walkItems(file, item.children);
    }
  };
  for (const flow of spec.flows) {
    for (const trigger of flow.triggers) {
      add(flow.file, trigger.target);
      walkItems(flow.file, trigger.children);
    }
    walkItems(flow.file, flow.items);
  }
  for (const wire of spec.wires) {
    add(wire.file, wire.target);
    for (const dep of wire.deps) {
      add(wire.file, dep.target);
      for (const when of dep.when) add(wire.file, when.target);
      for (const compose of dep.compose) add(wire.file, compose.target);
    }
  }
  return refs;
}

function assertionTexts(spec: SpecIR): { file: string; line: number; end: number; text: string }[] {
  const out: { file: string; line: number; end: number; text: string }[] = [];
  const add = (file: string, span: Span, text: string): void => {
    out.push({ file, line: span.start.line, end: span.end.offset, text });
  };
  const walkItems = (file: string, items: readonly FlowItem[]): void => {
    for (const item of items) {
      add(file, item.span, item.text);
      if ("children" in item) walkItems(file, item.children);
    }
  };
  for (const rule of spec.rules) add(rule.file, rule.span, rule.text);
  for (const flow of spec.flows) {
    for (const trigger of flow.triggers) {
      add(flow.file, trigger.span, trigger.text);
      walkItems(flow.file, trigger.children);
    }
    walkItems(flow.file, flow.items);
  }
  for (const item of spec.planned) add(item.file, item.span, item.text);
  return out;
}

function missingTarget(node: Node): boolean {
  if ((node.kind === "allow" || node.kind === "deny") && node.refs.length < 2) return true;
  if (node.kind === "exports" && node.refs.length === 0) return true;
  if (node.kind === "entry" && node.children.every((child) => child.refs.length === 0)) return true;
  if ((node.kind === "step" || node.kind === "trigger" || node.kind === "wire" || node.kind === "compose") && node.refs.length === 0) return true;
  if (node.kind === "planned" && node.id === null) return true;
  if (node.kind === "rule-module" && node.refs.length === 0) return true;
  return false;
}
