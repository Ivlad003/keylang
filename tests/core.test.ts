// Regressions from the M0–M4 code review (2026-09-28), through the real CLI:
// false `ok` from unknown aliases and from `planned` text matching, opaque
// modules and dependency holes in rules, directory modules, config limits,
// fmt keeping heading comments, BOM, deep module chains, LSP robustness and
// output errors.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { matchTest, type TestCase } from "../src/test-report.ts";

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
