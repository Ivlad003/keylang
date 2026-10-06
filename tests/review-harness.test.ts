// Review 2026-10-05, harness group: the Stop hook's contract, `.keylang/` in
// `.gitignore`, the spec directory in the harness files, the init hint, the
// grammar in the AGENTS.md block and the English cheatsheet. Every test runs
// the real CLI on a temporary repository.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run `keylang` with `cwd` as working directory; `input` is stdin, `env` replaces the environment. */
function keylang(cwd: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}): Run {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...(options.input !== undefined ? { input: options.input } : {}), ...(options.env ? { env: options.env } : {}) });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tempDir(t: { after: (fn: () => void) => void }, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** Relative paths and their bytes, so a command that must not write can be compared. */
function treeBytes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(join(dir, rel));
    } catch {
      return;
    }
    for (const name of names) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.set(path, readFileSync(join(dir, path), "utf8"));
    }
  };
  walk("");
  return out;
}

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

const LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] } };
const PAY = "export function charge(): number {\n  return 1;\n}\n";
const ORDER = "export function price(): number {\n  return 2;\n}\n";
const STOP = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });

/** A committed repository whose working tree adds an import the rules deny: `hook stop` blocks on it. */
function deniedRepo(t: { after: (fn: () => void) => void }): string {
  const dir = tempDir(t, "keylang-hook-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER, "keylang/rules.md": "# rules\n\n- deny app domain\n" });
  git(dir, ["init", "-q"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "base"]);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  return dir;
}

/** A turn `hook stop` could not check: code 0, one `systemMessage` object on one stdout line, and the same line on stderr. Returns the line. */
function uncheckedLine(run: Run, what: string): string {
  assert.equal(run.status, 0, `${what}: ${run.stderr}`);
  assert.match(run.stdout, /^\{[^\n]*\}\n$/, `${what}: one JSON object on one line`);
  const body = JSON.parse(run.stdout) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["systemMessage"], `${what}: a warning, never a decision`);
  assert.equal(run.stderr, `${String(body.systemMessage)}\n`, `${what}: the same line on stderr`);
  return String(body.systemMessage);
}

test("hook stop: once started it prints one JSON object and exits 0; a turn it cannot check is a systemMessage the person sees, and the same line on stderr", (t) => {
  const dir = deniedRepo(t);
  const blocked = keylang(dir, ["hook", "stop"], { input: STOP });
  assert.equal(blocked.status, 0, blocked.stderr);
  assert.equal((JSON.parse(blocked.stdout) as { decision?: string }).decision, "block");
  const before = treeBytes(dir);

  // No git on PATH: the changed files cannot be listed, so the turn is not checked rather than blocked.
  const noGit = keylang(dir, ["hook", "stop"], { input: STOP, env: { ...process.env, PATH: tempDir(t, "keylang-empty-path-") } });
  assert.match(uncheckedLine(noGit, "no git"), /^keylang: this turn was not checked: git is not available \([^)]*\)$/);

  // Stdin that is not JSON, or not an object, or a non-boolean stop_hook_active.
  for (const [input, reason] of [
    ["not json", "stdin is not JSON"],
    ["[1]", "stdin is not a JSON object"],
    ['{"stop_hook_active":"yes"}', "stop_hook_active is not a boolean"],
  ] as const) {
    assert.equal(uncheckedLine(keylang(dir, ["hook", "stop"], { input }), input), `keylang: this turn was not checked: ${reason}`);
  }

  // A broken keylang.json: the analysis cannot start.
  writeFileSync(join(dir, "keylang.json"), "{ broken\n");
  const config = keylang(dir, ["hook", "stop"], { input: STOP });
  assert.match(uncheckedLine(config, "broken keylang.json"), /^keylang: this turn was not checked: .*keylang\.json: invalid JSON/);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(LAYERS)}\n`);
  assert.deepEqual(treeBytes(dir), before, "hook stop writes nothing, on success or failure");

  // `check --changed` keeps its codes: without git it is still a usage or I/O error.
  const changed = keylang(dir, ["check", "--changed"], { env: { ...process.env, PATH: tempDir(t, "keylang-empty-path-") } });
  assert.equal(changed.status, 2, changed.stdout);
  assert.match(changed.stderr, /check --changed: git is not available/);
});

test("hook: a bad invocation is still code 2, with nothing on stdout", (t) => {
  const dir = deniedRepo(t);
  for (const args of [["hook"], ["hook", "nope"], ["hook", "stop", "extra"], ["hook", "install", "extra"]]) {
    const bad = keylang(dir, args, { input: STOP });
    assert.equal(bad.status, 2, `${args.join(" ")}: ${bad.stdout}`);
    assert.equal(bad.stdout, "", args.join(" "));
    assert.match(bad.stderr, /^keylang: hook/, args.join(" "));
  }
});

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the harness files follow `dir` of keylang.json: deny rules, the AGENTS.md block and the skill name <dir>/; a dir change is stale and moves only keylang's deny entries", (t) => {
  const dir = tempDir(t, "keylang-specdir-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    ".claude/settings.json": `${JSON.stringify({ permissions: { deny: ["Read(secret)"] } }, null, 2)}\n`,
  });
  const read = (path: string): string => readFileSync(join(dir, path), "utf8");
  const deny = (): string[] => (JSON.parse(read(".claude/settings.json")) as { permissions?: { deny?: string[] } }).permissions?.deny ?? [];
  const rules = (spec: string): string[] => [`Edit(${spec}/rules.md)`, `Write(${spec}/rules.md)`, `Edit(${spec}/rules.baseline.md)`, `Write(${spec}/rules.baseline.md)`];
  const proposals = ["Bash(* proposals accept *)", "Bash(* proposals reject *)"];
  const skills = [".agents/skills/keylang-feature/SKILL.md", ".claude/skills/keylang-feature/SKILL.md"];
  const init = keylang(dir, ["init"]);
  assert.equal(init.status, 0, init.stderr);
  assert.deepEqual(deny(), ["Read(secret)", ...rules("keylang"), ...proposals]);

  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ ...LAYERS, dir: "spec" })}\n`);
  const before = treeBytes(dir);
  const stale = keylang(dir, ["agents", "--check"]);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  for (const path of ["AGENTS.md", ...skills, ".claude/settings.json"]) assert.match(stale.stdout, new RegExp(`^${escaped(path)}: stale`, "m"), path);
  assert.deepEqual(treeBytes(dir), before, "agents --check writes nothing");

  const agents = keylang(dir, ["agents"]);
  assert.equal(agents.status, 0, agents.stderr);
  assert.deepEqual(deny(), ["Read(secret)", ...proposals, ...rules("spec")], "keylang's entries for the old default dir go; the user's stays; the dir-free entries keep their place");
  for (const path of ["AGENTS.md", ...skills]) {
    const text = read(path);
    for (const named of ["spec/features/<slug>.md", "spec/rules.md", "spec/rules.baseline.md"]) assert.ok(text.includes(`\`${named}\``), `${path}: ${named}`);
    assert.doesNotMatch(text, /keylang\/(features|rules|map)/, path);
    assert.doesNotMatch(text, /<dir>/, path);
  }
  assert.equal(read(skills[0]!), read(skills[1]!));
  assert.equal(keylang(dir, ["agents", "--check"]).status, 0);
  const baseline = keylang(dir, ["baseline"]);
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.ok(existsSync(join(dir, "spec/rules.baseline.md")), "the baseline the deny rules protect is where `dir` says");

  const none = keylang(dir, ["agents", "--agents=none"]);
  assert.equal(none.status, 0, none.stderr);
  assert.deepEqual(deny(), ["Read(secret)"]);
});

test("agents names a broken keylang.json (code 2) and writes nothing: the harness files depend on its `dir`", (t) => {
  const dir = tempDir(t, "keylang-specdir-broken-");
  writeTree(dir, { "keylang.json": "{ broken\n", "src/app/pay.ts": PAY });
  mkdirSync(join(dir, ".claude"));
  const before = treeBytes(dir);
  const agents = keylang(dir, ["agents"]);
  assert.equal(agents.status, 2, agents.stdout);
  assert.match(agents.stderr, /keylang\.json: invalid JSON/);
  assert.deepEqual(treeBytes(dir), before);
});

test("init without a detected harness names `keylang agents --agents=…` once on stderr; not with a harness, --agents=none or --check", (t) => {
  const hint = /keylang agents --agents=claude,codex,cursor,opencode/;
  const bare = tempDir(t, "keylang-hint-");
  writeTree(bare, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  const init = keylang(bare, ["init"]);
  assert.equal(init.status, 0, init.stderr);
  assert.equal(init.stderr.split("\n").filter((line) => hint.test(line)).length, 1, init.stderr);
  assert.match(init.stderr, /^keylang: no harness detected .*only the AGENTS\.md block was written; for MCP, the skill, deny rules and the Stop hook run `keylang agents --agents=claude,codex,cursor,opencode`/m);
  assert.doesNotMatch(init.stdout, hint);
  assert.ok(existsSync(join(bare, "AGENTS.md")));
  assert.doesNotMatch(keylang(bare, ["init", "--check"]).stderr, hint);

  const none = tempDir(t, "keylang-hint-none-");
  writeTree(none, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  const stripped = keylang(none, ["init", "--agents=none"]);
  assert.equal(stripped.status, 0, stripped.stderr);
  assert.doesNotMatch(stripped.stderr, hint);

  const claude = tempDir(t, "keylang-hint-claude-");
  writeTree(claude, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  mkdirSync(join(claude, ".claude"));
  const detected = keylang(claude, ["init"]);
  assert.equal(detected.status, 0, detected.stderr);
  assert.doesNotMatch(detected.stderr, hint);
});

/** The `keylang` diagnostics K001–K005 in `check` output: an example that is not valid keylang. */
const SPEC_ERRORS = /\bK00[1-5]\b/;

test("the AGENTS.md block teaches the grammar: its feature example parses and checks without K001–K005, and it says where ids come from", (t) => {
  const dir = tempDir(t, "keylang-block-grammar-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  assert.equal(keylang(dir, ["init"]).status, 0);
  const text = readFileSync(join(dir, "AGENTS.md"), "utf8");
  const block = text.slice(text.indexOf("<!-- keylang:begin -->"), text.indexOf("<!-- keylang:end -->") + "<!-- keylang:end -->".length);
  assert.ok(Buffer.byteLength(block) <= 4096, `${Buffer.byteLength(block)} bytes`);
  const fence = /^```markdown\n([\s\S]*?)^```$/m.exec(block);
  assert.ok(fence, block);
  const example = fence[1]!;
  assert.ok(example.split("\n").length - 1 <= 10, example);
  for (const shape of [/^# flow \S+$/m, /^- planned fn \S+ \(.*\) → \S+$/m, /^- trigger \S+$/m, /^ {2}- step \S+$/m, /^- \? \S/m]) assert.match(example, shape);
  for (const said of ["keylang/map/*.md", "`search`", "keylang@", " map` regenerates the map", "`- ? <question>`"]) assert.ok(block.includes(said), said);

  const spec = tempDir(t, "keylang-block-example-");
  const trigger = /^- trigger (\S+)$/m.exec(example)![1]!.split(".");
  writeTree(spec, {
    "keylang/features/example.md": example,
    // The trigger's layer, module and fn, and the planned fn's layer; the planned fn itself needs no declaration.
    "keylang/map/ids.md": `# map\n\n- ${trigger[0]}\n  - module ${trigger[1]}\n    - fn ${trigger[2]} () → void\n- ${/^- planned fn ([^.\s]+)\./m.exec(example)![1]}\n`,
  });
  const parsed = keylang(spec, ["parse", "--json", "keylang/features/example.md"]);
  assert.equal(parsed.status, 0, parsed.stderr);
  const diagnostics = (JSON.parse(parsed.stdout) as { diagnostics: { code: string }[] }[])[0]!.diagnostics.map((d) => d.code);
  assert.deepEqual(diagnostics.filter((code) => ["K003", "K004", "K005"].includes(code)), []);
  const checked = keylang(spec, ["check"]);
  assert.doesNotMatch(checked.stdout, SPEC_ERRORS, checked.stdout);
  const feature = keylang(spec, ["feature", "example"]);
  assert.match(feature.stdout, /question/, "the open question is a gap for a person");
});

test("docs/cheatsheet.md: every keylang example parses alone and checks with the others against its map example, without K001–K005 or a fail", (t) => {
  const sheet = readFileSync(join(root, "docs/cheatsheet.md"), "utf8");
  assert.match(sheet, /\]\(format\.md\)/, "the cheatsheet names the normative grammar");
  for (const keyword of ["layers", "allow", "deny", "entry", "exports", "no-cycles", "trigger", "step", "calls", "when", "then", "invariant", "test", "planned", "?", "wire"]) {
    assert.ok(new RegExp(`^ *- ${escaped(keyword)}(?: |$)`, "m").test(sheet), `an example of \`${keyword}\``);
  }
  const examples = [...sheet.matchAll(/^```keylang\n([\s\S]*?)^```$/gm)].map((match) => match[1]!);
  assert.ok(examples.length >= 10 && examples.length <= 15, `${examples.length} examples`);
  const files = Object.fromEntries(examples.map((body, i) => [`keylang/example-${String(i + 1).padStart(2, "0")}.md`, body]));
  const dir = tempDir(t, "keylang-cheatsheet-");
  writeTree(dir, files);
  const parsed = keylang(dir, ["parse", "--json", "keylang"]);
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const doc of JSON.parse(parsed.stdout) as { path: string; diagnostics: { code: string; message: string }[] }[]) {
    assert.deepEqual(doc.diagnostics.filter((d) => ["K003", "K004", "K005"].includes(d.code)), [], doc.path);
  }
  const checked = keylang(dir, ["check"]);
  assert.doesNotMatch(checked.stdout, SPEC_ERRORS, checked.stdout);
  assert.match(checked.stderr, /^0 fail, /m, checked.stdout);
  const formatted = keylang(dir, ["fmt", "--check", "keylang"]);
  assert.equal(formatted.status, 0, `the examples are in canonical form: ${formatted.stdout}${formatted.stderr}`);
  // The control: an id the map does not declare is reported, so the examples above were really read.
  const [first, second] = Object.keys(files).slice(4, 6);
  writeFileSync(join(dir, first!), files[first!]!.replace("app.orders.place", "app.orders.nope"));
  writeFileSync(join(dir, second!), `${files[second!]!}- deny app infra\n`);
  const broken = keylang(dir, ["check"]);
  assert.match(broken.stdout, /K001 dangling reference `app\.orders\.nope`/);
  assert.match(broken.stdout, /K004 unknown keyword `deny`/);
});

const IGNORED = "# keylang: local cache (index, facts, proposals, traces), not the spec\n.keylang/\n";

test("init lists .keylang/ in the root .gitignore: created when missing, appended once in the file's line ends, kept when listed", (t) => {
  const dir = tempDir(t, "keylang-gitignore-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  const first = keylang(dir, ["init", "--agents=none"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), IGNORED);
  assert.match(first.stdout, /^\.gitignore: \.keylang\/ added$/m);
  const again = keylang(dir, ["init", "--agents=none"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), IGNORED);
  assert.doesNotMatch(again.stdout, /\.gitignore/);
  assert.equal(keylang(dir, ["init", "--check", "--agents=none"]).status, 0);

  // CRLF on every line and no newline at the end: the bytes stay, the entry follows in CRLF.
  const crlf = "node_modules/\r\ndist/";
  writeFileSync(join(dir, ".gitignore"), crlf);
  const appended = keylang(dir, ["init", "--agents=none"]);
  assert.equal(appended.status, 0, appended.stderr);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), `${crlf}\r\n\r\n${IGNORED.replace(/\n/g, "\r\n")}`);

  // Already listed, in any of git's spellings: not a byte changes.
  for (const listed of [".keylang", ".keylang/", "/.keylang", "/.keylang/", "/.keylang/  "]) {
    const text = `node_modules/\n${listed}\n*.log\n`;
    writeFileSync(join(dir, ".gitignore"), text);
    const kept = keylang(dir, ["init", "--agents=none"]);
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), text, JSON.stringify(listed));
    assert.equal(keylang(dir, ["init", "--check", "--agents=none"]).status, 0, JSON.stringify(listed));
  }
  // A comment, a negation, a deeper path or the contents only is not the entry.
  for (const other of ["# .keylang/", "!.keylang/", "sub/.keylang/", ".keylang/*"]) {
    writeFileSync(join(dir, ".gitignore"), `${other}\n`);
    assert.equal(keylang(dir, ["init", "--check", "--agents=none"]).status, 1, other);
  }
});

test("init --check reports a .gitignore without .keylang/ (code 1) and writes nothing; init adds it with harnesses too", (t) => {
  const dir = tempDir(t, "keylang-gitignore-check-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER, ".gitignore": "dist/\n" });
  mkdirSync(join(dir, ".claude"));
  const init = keylang(dir, ["init"]);
  assert.equal(init.status, 0, init.stderr);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), `dist/\n\n${IGNORED}`);
  assert.equal(keylang(dir, ["init", "--check"]).status, 0);
  writeFileSync(join(dir, ".gitignore"), "dist/\n");
  const before = treeBytes(dir);
  const check = keylang(dir, ["init", "--check"]);
  assert.equal(check.status, 1, check.stdout + check.stderr);
  assert.equal(check.stdout, ".gitignore: .keylang/ is not listed; run `keylang init`\n");
  assert.deepEqual(treeBytes(dir), before, "init --check writes nothing");
  rmSync(join(dir, ".gitignore"));
  const missing = keylang(dir, ["init", "--check"]);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, ".gitignore: .keylang/ is not listed; run `keylang init`\n");
});

test("init does not write .gitignore through a link out of the repository: code 1, the target untouched", { skip: process.platform === "win32" }, (t) => {
  const dir = tempDir(t, "keylang-gitignore-link-");
  const outside = tempDir(t, "keylang-gitignore-outside-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  writeFileSync(join(outside, "shared"), "dist/\n");
  symlinkSync(join(outside, "shared"), join(dir, ".gitignore"));
  const refused = ".gitignore: .keylang/ not added (leads out of the repository through a link)";
  const init = keylang(dir, ["init", "--agents=none"]);
  assert.equal(init.status, 1, init.stdout + init.stderr);
  assert.ok(init.stdout.split("\n").includes(refused), init.stdout);
  assert.equal(readFileSync(join(outside, "shared"), "utf8"), "dist/\n");
  assert.ok(existsSync(join(dir, "keylang/rules.baseline.md")), "the stages after it still run");
  const check = keylang(dir, ["init", "--check", "--agents=none"]);
  assert.equal(check.status, 1);
  assert.equal(check.stdout, `${refused}\n`);
});
