// `keylang spec-to-code <id>` (design §5.5), algo: a stub for a `planned`
// fn in the file its ID names, with the declared signature, analyzed as a
// new snapshot before anything is written; and for each `test` its flows
// name in a file that does not exist yet, a test that fails until it is
// written — `node:test` for TS/JS, PHPUnit for PHP (with a model: the test
// from the model). An ID that is neither planned
// nor in the code is a reference to fix or an intention to declare first:
// no code is guessed from a possible typo.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { analyze, type Analysis } from "./analyze.ts";
import { toPosix, type Config } from "./config.ts";
import { formatDiagnostic, type Diagnostic } from "./diag.ts";
import { globPrefix } from "./glob.ts";
import { languageOf } from "./languages.ts";
import { placeFile } from "./graph.ts";
import { plannedDecl } from "./lsp-features.ts";
import { codeProposalProblem, lineDiff } from "./proposals.ts";
import { sameFinding } from "./assess.ts";
import { blocksDependency, dependencyKindOf } from "./rules.ts";
import { walkFlow, type Flow, type FlowItem, type SpecIR, type Trigger } from "./spec-ir.ts";
import { allCrlf } from "./safe-write.ts";
import type { LlmCallOptions, LlmClient } from "./llm.ts";
import { formatVerdict, type Verdict } from "./verdict.ts";

export interface FileCandidate {
  /** POSIX, relative to the root. */
  file: string;
  /** The file as the candidate was built from it; a write refuses a file that no longer holds it. */
  before: string | null;
  after: string;
}

export interface CodeCandidate extends FileCandidate {
  id: string;
  /** New e2e test files for the `test` entries of the flows that use the ID. */
  tests: FileCandidate[];
  /** `test` entries left to the person, each with the reason. */
  testNotes: string[];
  /** What the candidate changes in `check`: every verdict and diagnostic it has that the code without it does not. */
  verdicts: Verdict[];
  diagnostics: Diagnostic[];
}

const EXTENSIONS: Record<string, string> = { typescript: ".ts", javascript: ".js", python: ".py", rust: ".rs", php: ".php" };

/**
 * `model`: the body comes from the model instead of the stub — the whole
 * function with the declared signature, in one fenced block — and is
 * analyzed the same way before anything is written. `options.signal`
 * cancels the model's requests (`LlmCancelled`); the file is read before
 * the first one, so the candidate's `before` is the text it was asked about.
 */
export async function specToCode(analysis: Analysis, id: string, into?: string, model?: LlmClient, options: LlmCallOptions = {}): Promise<CodeCandidate> {
  const target = plannedCodeTarget(analysis, id, into);
  if ("error" in target) throw new Error(target.error);
  const config = analysis.config;
  const abs = join(config.root, target.file);
  const before = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  const lf = before?.replace(/\r\n/g, "\n") ?? null;
  const code = model ? await modelBody(analysis, model, target, id, lf, options) : stubFor(target, id);
  const joined = placeStub(lf, target, code, target.file.endsWith(".php") ? phpFileHead(analysis, target.file) : "");
  // A file with CRLF on every line keeps it.
  const after = before !== null && allCrlf(before) ? joined.replace(/\n/g, "\r\n") : joined;
  // The candidate is checked as the code it would be, without touching the disk, against the code without it.
  const next = await analyze({ root: config.root, overlay: new Map([[abs, after]]), withoutEvidence: true });
  const { verdicts, diagnostics } = introduced(analysis, next);
  const { tests, notes } = await testCandidates(analysis, id, target, after, model, options);
  return { id, file: target.file, before, after, verdicts, diagnostics, tests, testNotes: notes };
}

/** Where the code of a planned fn goes: the file, and the class it is a method of. */
export interface CodeTarget {
  file: string;
  name: string;
  signature: string | null;
  /**
   * The class the fn is a method of: one in the code (`span`: its lines,
   * the method goes into its body) or a new one the stub declares (`null`).
   * Absent owner: a function of the file's module.
   */
  owner: { name: string; span: { line: number; endLine: number; endCol: number | null } | null } | null;
}

/**
 * Where the code of the planned fn `id` goes, or why spec-to-code builds
 * none — the checks it makes before any file is read: not planned (with a
 * suggestion), not a fn, already implemented (with the place), a `deny`
 * its flow would break (`field: "id"`); a file not of its module, a layer
 * without one root, a file name the layer's conventions leave ambiguous, a
 * file a code proposal may not change (`field: "into"`).
 * The prefix of the ID is a class when the code has it as one, or when it
 * is new and its last segment starts with a capital under a module
 * (`article.bookmark_service.BookmarkService`): the fn is then a method.
 * Reads the analysis and, for links, the file system; writes nothing.
 */
export function plannedCodeTarget(analysis: Analysis, id: string, into?: string): CodeTarget | { error: string; field: "id" | "into" } {
  const plan = plannedDecl(analysis.docs, id);
  if (!plan) {
    const present = analysis.snapshot?.nodes[id];
    if (present) return { field: "id", error: `\`${id}\` is already implemented (${present.file ?? "?"}:${present.line ?? 1}); spec-to-code builds planned nodes only` };
    const near = analysis.index.suggest(id);
    return { field: "id", error: `\`${id}\` is neither planned nor in the code: fix the reference${near ? ` (did you mean \`${near}\`?)` : ""}, or declare \`planned fn ${id} <signature>\` first` };
  }
  if (plan.kind !== "fn") return { field: "id", error: `\`${id}\` is a planned ${plan.kind}; spec-to-code builds planned fns` };
  // A second run would add a second function of the same name.
  const implemented = analysis.snapshot?.nodes[id];
  if (implemented) return { field: "id", error: `\`${id}\` is already implemented (${implemented.file ?? "?"}:${implemented.line ?? 1}); \`keylang check\` says whether the \`planned\` declaration can go (K202)` };
  // A stub the flow could never reach would contradict the rules it is checked by.
  for (const caller of callersInFlows(analysis, id)) {
    if (blocksDependency(analysis.spec, caller, id, dependencyKindOf(analysis.spec, analysis.index, analysis.snapshot?.nodes), analysis.config.format)) return { field: "id", error: `\`deny\` forbids \`${caller}\` → \`${id}\`, which its flow needs; change the rule or the plan first` };
  }
  const config = analysis.config;
  const name = id.slice(id.lastIndexOf(".") + 1);
  let placement: Placement;
  try {
    placement = placeCode(analysis, parentId(id), into);
  } catch (error) {
    return { field: "into", error: error instanceof Error ? error.message : String(error) };
  }
  const { file, moduleId, owner } = placement;
  if (moduleId !== null) {
    const placed = placeFile(config, file);
    if (!placed || [placed.layer, ...placed.segments].join(".") !== moduleId) return { field: "into", error: `${file} is not module \`${moduleId}\` under keylang.json layers; pass --into with a file of that module` };
  }
  // The rules of a code proposal, before the file is read: inside the repository, not generated (`keylang.gen.ts`).
  const problem = codeProposalProblem(config.root, file);
  if (problem) return { field: "into", error: `${file}: ${problem}` };
  return { file, name, signature: plan.signature, owner };
}

/** The file and owner of a planned fn under `ownerId`; `moduleId`: the module the file must be (null: the code says where the class is). */
interface Placement {
  file: string;
  moduleId: string | null;
  owner: CodeTarget["owner"];
}

function parentId(id: string): string {
  return id.slice(0, id.lastIndexOf("."));
}

function placeCode(analysis: Analysis, ownerId: string, into: string | undefined): Placement {
  const config = analysis.config;
  const nodes = analysis.snapshot?.nodes ?? {};
  const node = nodes[ownerId];
  const className = ownerId.slice(ownerId.lastIndexOf(".") + 1);
  if (node?.kind === "module" && node.class === true && node.file) {
    // A class in the code: the method goes into its body, wherever the class sits (nested ones included).
    if (into !== undefined && into !== node.file) throw new Error(`\`${ownerId}\` is a class in ${node.file}; --into names another file`);
    const span = node.line !== null && node.endLine !== undefined ? { line: node.line, endLine: node.endLine, endCol: node.endCol ?? null } : null;
    if (span === null) throw new Error(`\`${ownerId}\` is a class in ${node.file} without its lines in the snapshot; run \`keylang map\``);
    return { file: node.file, moduleId: null, owner: { name: className, span } };
  }
  const moduleId = parentId(ownerId);
  const moduleNode = nodes[moduleId];
  const newClass = node === undefined && moduleId.includes(".") && /^\p{Lu}/u.test(className) && moduleNode?.class !== true;
  // `--into` with a file of `ownerId` itself says the capital segment is a file, not a class.
  const intoOwner = into !== undefined && newClass && placedModule(config, into) === ownerId;
  if (!newClass || intoOwner) {
    const file = into ?? (node?.kind === "module" && node.file ? node.file : newModuleFile(analysis, ownerId));
    return { file, moduleId: ownerId, owner: null };
  }
  const file = into ?? (moduleNode?.kind === "module" && moduleNode.file ? moduleNode.file : newModuleFile(analysis, moduleId));
  return { file, moduleId, owner: { name: className, span: null } };
}

function placedModule(config: Config, file: string): string | null {
  const placed = placeFile(config, file);
  return placed ? [placed.layer, ...placed.segments].join(".") : null;
}

/**
 * What `spec-to-code <id> --print` writes on stdout: each file with its
 * `-`/`+` lines, and between the code and the tests every finding the
 * candidate adds (one the diagnostics already name, once, as in `check`).
 */
export function specToCodeText(candidate: CodeCandidate): string {
  let out = `${fileDiffText(candidate)}\n\nwith the candidate in place:\n`;
  for (const v of candidate.verdicts) if (!sameFinding(v, candidate.diagnostics)) out += `${formatVerdict(v)}\n`;
  for (const d of candidate.diagnostics) out += `${formatDiagnostic(d)}\n`;
  for (const t of candidate.tests) out += `\n${fileDiffText(t)}\n`;
  return out;
}

/** `src/a.ts (new file)` and its `-`/`+` lines against the file it was built from. */
export function fileDiffText(file: FileCandidate): string {
  return `${file.file}${file.before === null ? " (new file)" : ""}\n${lineDiff(file.before ?? "", file.after)}`;
}

/** Findings `next` has that `base` does not: what a candidate would change, wherever it lands (a K102 in the new file too). */
function introduced(base: Analysis, next: Analysis): { verdicts: Verdict[]; diagnostics: Diagnostic[] } {
  const diagnosticKey = (d: Diagnostic): string => [d.code, d.file, d.span.start.line, d.span.start.col, d.message].join("\u0000");
  const verdictKey = (v: Verdict): string => [v.criterion, v.verdict, v.area, v.file, v.line, v.col, v.message].join("\u0000");
  const knownDiagnostics = new Set(base.diagnostics.map(diagnosticKey));
  const knownVerdicts = new Set(base.verdicts.map(verdictKey));
  return { verdicts: next.verdicts.filter((v) => !knownVerdicts.has(verdictKey(v))), diagnostics: next.diagnostics.filter((d) => !knownDiagnostics.has(diagnosticKey(d))) };
}

const TEST_EXTENSIONS = /\.(ts|mts|cts|js|mjs|cjs)$/;

/** The `test` entries of the flows that name `id`: flow name, test file and test name. */
function flowTests(analysis: Analysis, id: string): { flow: string; file: string; name: string }[] {
  const out: { flow: string; file: string; name: string }[] = [];
  for (const flow of flowsMentioning(analysis, id)) {
    const tests: { file: string; name: string }[] = [];
    walkFlow(flow, (item) => {
      if (item.kind === "test" && item.name !== null) tests.push({ file: item.path, name: item.name });
    });
    for (const t of tests) out.push({ flow: flow.name, ...t });
  }
  return out;
}

/** Hand-written flows whose trigger, step, claim, `then`, or `planned` names `id`. */
function flowsMentioning(analysis: Analysis, id: string): Flow[] {
  const skipped = new Set(analysis.docs.filter((doc) => doc.generated !== null).map((doc) => doc.path));
  return analysis.spec.flows.filter((flow) => !skipped.has(flow.file) && flowMentions(analysis.spec, flow, id));
}

function flowMentions(spec: SpecIR, flow: Flow, id: string): boolean {
  if (spec.planned.some((item) => item.id === id && item.file === flow.file && flowOwns(spec, flow, item.span.start.line))) return true;
  let hit = false;
  walkFlow(flow, (item) => {
    if (hit) return;
    if ((item.kind === "trigger" || item.kind === "step") && item.target.target === id) hit = true;
    else if (item.kind === "then" && item.form === "ref" && item.target.target === id) hit = true;
    else if ((item.kind === "reads" || item.kind === "emits" || item.kind === "invariant") && item.target?.target === id) hit = true;
  });
  return hit;
}

/** `line` sits in this flow: after its heading and before the next flow of the same file. */
function flowOwns(spec: SpecIR, flow: Flow, line: number): boolean {
  if (line < flow.span.start.line) return false;
  return !spec.flows.some((other) => other.file === flow.file && other !== flow && other.span.start.line > flow.span.start.line && other.span.start.line <= line);
}

/**
 * One new file per test path the flows name and the disk lacks. A test in an
 * existing file, or in a language without a `node:test` shape, is a note:
 * editing someone's test file is theirs to do.
 */
async function testCandidates(analysis: Analysis, id: string, target: CodeTarget, code: string, model: LlmClient | undefined, options: LlmCallOptions): Promise<{ tests: FileCandidate[]; notes: string[] }> {
  const root = analysis.config.root;
  const codeFile = target.file;
  const byFile = new Map<string, { flow: string; name: string }[]>();
  const notes: string[] = [];
  for (const t of flowTests(analysis, id)) {
    const label = `test ${t.file} "${t.name}"`;
    // Checked before the path is even looked at: a spec can name `../elsewhere` or a link out.
    const problem = codeProposalProblem(root, t.file);
    if (problem) {
      notes.push(`${label}: ${problem}; nothing proposed for it`);
      continue;
    }
    if (existsSync(join(root, t.file))) {
      if (!readFileSync(join(root, t.file), "utf8").includes(t.name)) notes.push(`${label}: ${t.file} exists without it; add it there`);
      continue;
    }
    const php = t.file.endsWith(".php") && codeFile.endsWith(".php");
    if (!php && (!TEST_EXTENSIONS.test(t.file) || !TEST_EXTENSIONS.test(codeFile))) {
      notes.push(`${label}: write it by hand (spec-to-code writes node:test files for TS/JS and PHPUnit tests for PHP)`);
      continue;
    }
    if (php && !PHP_IDENTIFIER.test(posix.basename(t.file, ".php"))) {
      notes.push(`${label}: write it by hand (a PHPUnit test file holds the class of its name, and \`${posix.basename(t.file, ".php")}\` is no class name)`);
      continue;
    }
    if (php && !PHP_IDENTIFIER.test(t.name)) {
      notes.push(`${label}: write it by hand (a PHPUnit test is a method, and \`${t.name}\` is no method name)`);
      continue;
    }
    const list = byFile.get(t.file) ?? [];
    if (!list.some((x) => x.name === t.name)) list.push({ flow: t.flow, name: t.name });
    byFile.set(t.file, list);
  }
  // A method is reached through its class: the test imports the class.
  const subject = target.owner ? { imported: target.owner.name, value: `${target.owner.name}.prototype.${target.name}` } : { imported: target.name, value: target.name };
  const tests: FileCandidate[] = [];
  for (const [file, entries] of [...byFile].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (file.endsWith(".php")) {
      const php = phpSubject(target, code);
      const head = phpFileHead(analysis, file);
      tests.push({ file, before: null, after: model ? await modelPhpTest(model, file, head, php, id, code, entries, options) : phpTestStub(file, head, php, entries) });
      continue;
    }
    let from = toPosix(relative(dirname(file), codeFile));
    if (!from.startsWith(".")) from = `./${from}`;
    const after = model ? await modelTest(model, file, from, subject, id, code, entries, options) : testStub(from, subject, entries);
    tests.push({ file, before: null, after });
  }
  return { tests, notes };
}

/** A PHP class, method or function name. */
const PHP_IDENTIFIER = /^[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*$/;

/** What a PHPUnit test of the planned fn reaches: its class (qualified) and method, or its function. */
interface PhpSubject {
  /** `Shop\Domain\Order`; null for a function. */
  class: string | null;
  /** `refund`, or the qualified function `Shop\Support\format`. */
  name: string;
}

function phpSubject(target: CodeTarget, code: string): PhpSubject {
  const ns = phpNamespaceIn(code);
  const qualify = (name: string): string => (ns === null ? name : `${ns}\\${name}`);
  return target.owner ? { class: qualify(target.owner.name), name: target.name } : { class: null, name: qualify(target.name) };
}

/** A string literal of PHP: single quotes, `\\` and `'` escaped. */
function phpString(text: string): string {
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** The namespace a PHP file declares first; null without one. */
function phpNamespaceIn(text: string): string | null {
  return /^\s*namespace\s+([A-Za-z_\x80-\uffff][\w\x80-\uffff]*(?:\\[A-Za-z_\x80-\uffff][\w\x80-\uffff]*)*)\s*[;{]/m.exec(text)?.[1] ?? null;
}

/**
 * The head of a new PHP file at `file`: `<?php`, `declare(strict_types=1);`
 * when the files beside it have it, and the namespace they declare — else the
 * one the root `composer.json` maps the directory to (`autoload` and
 * `autoload-dev`, PSR-4) — so the class is autoloaded and its imports resolve.
 */
function phpFileHead(analysis: Analysis, file: string): string {
  const root = analysis.config.root;
  const dir = posix.dirname(file);
  const siblings = (analysis.snapshot?.manifest.files ?? []).map((f) => f.path).filter((path) => path.endsWith(".php") && path !== file && posix.dirname(path) === dir).sort();
  let strict = false;
  let ns: string | null = null;
  for (const path of siblings) {
    let text: string;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch {
      continue;
    }
    strict ||= /declare\s*\(\s*strict_types\s*=\s*1\s*\)/.test(text);
    ns ??= phpNamespaceIn(text);
  }
  ns ??= composerNamespace(root, dir);
  return `<?php\n\n${strict ? "declare(strict_types=1);\n\n" : ""}${ns !== null ? `namespace ${ns};\n\n` : ""}`;
}

/** The PSR-4 namespace of `dir` by the root `composer.json` (`autoload`, then `autoload-dev`); null when no prefix maps it. */
function composerNamespace(root: string, dir: string): string | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(root, "composer.json"), "utf8"));
  } catch {
    return null;
  }
  const record = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
  let best: { prefix: string; base: string } | null = null;
  for (const section of ["autoload", "autoload-dev"]) {
    const psr4 = record(record(record(manifest)?.[section])?.["psr-4"]);
    for (const [prefix, value] of Object.entries(psr4 ?? {})) {
      for (const path of Array.isArray(value) ? value : [value]) {
        if (typeof path !== "string") continue;
        const base = toPosix(path).replace(/^\.\//, "").replace(/\/+$/, "");
        const inside = base === "" || base === "." || dir === base || dir.startsWith(`${base}/`);
        if (inside && (best === null || base.length > best.base.length)) best = { prefix, base: base === "." ? "" : base };
      }
    }
  }
  if (best === null) return null;
  const rest = best.base === "" ? dir : dir.slice(best.base.length).replace(/^\//, "");
  const parts = [...best.prefix.split("\\").filter((part) => part !== ""), ...(rest === "" || rest === "." ? [] : rest.split("/"))];
  return parts.length > 0 ? parts.join("\\") : null;
}

/** A PHPUnit test class that fails until it is written: one test method per declared name. */
function phpTestStub(file: string, head: string, subject: PhpSubject, entries: readonly { flow: string; name: string }[]): string {
  const className = posix.basename(file, ".php");
  const exists = subject.class !== null ? `method_exists(${lastName(subject.class)}::class, ${phpString(subject.name)})` : `function_exists(${phpString(subject.name)})`;
  const reach = subject.class !== null ? `${lastName(subject.class)}::${subject.name}` : subject.name;
  const methods = entries.map((e) => {
    // PHPUnit runs a public method whose name starts with `test`, or one marked `#[Test]`.
    const marked = /^test/i.test(e.name) ? "" : "    #[\\PHPUnit\\Framework\\Attributes\\Test]\n";
    return `${marked}    public function ${e.name}(): void\n    {\n        $this->assertTrue(${exists});\n        $this->fail(${phpString(`not written: drive flow \`${e.flow}\` through ${reach} and assert what the flow promises`)});\n    }\n`;
  });
  const uses = ["PHPUnit\\Framework\\TestCase", ...(subject.class !== null ? [subject.class] : [])].sort();
  return `${head}${uses.map((use) => `use ${use};\n`).join("")}\nfinal class ${className} extends TestCase\n{\n${methods.join("\n")}}\n`;
}

function lastName(qualified: string): string {
  return qualified.slice(qualified.lastIndexOf("\\") + 1);
}

/** The PHPUnit test class from the model; each declared test method must be in it. */
async function modelPhpTest(model: LlmClient, file: string, head: string, subject: PhpSubject, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions): Promise<string> {
  const className = posix.basename(file, ".php");
  const reach = subject.class !== null ? `the method \`${subject.name}\` of \`${subject.class}\`` : `the function \`${subject.name}\``;
  const answer = await model.complete({
    system: `You write one PHPUnit test class (PHPUnit 10 or newer): \`final class ${className} extends \\PHPUnit\\Framework\\TestCase\`, in a file that starts as given. It tests ${reach}. Use exactly the test method names given, each a public method returning void. Answer with the whole file only, in one fenced code block.`,
    prompt: [
      `Test file: ${file}`,
      `It starts with:\n\`\`\`php\n${head.trimEnd()}\n\`\`\``,
      `Tests (flow → method):\n${entries.map((e) => `- flow ${e.flow}: ${e.name}`).join("\n")}`,
      `\`${id}\` as it will be:\n\`\`\`php\n${code}\n\`\`\``,
    ].join("\n\n"),
    maxTokens: 8192,
  }, options);
  const text = (/```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer).trim();
  const missing = entries.filter((e) => !new RegExp(`\\bfunction\\s+${e.name}\\s*\\(`).test(text));
  if (missing.length > 0) throw new Error(`the model's ${file} has no test method ${missing.map((e) => e.name).join(", ")}; nothing written`);
  return `${text}\n`;
}

/** `imported`: the name the test imports; `value`: the function it reaches through it (`X.prototype.m` for a method). */
interface TestSubject {
  imported: string;
  value: string;
}

function testStub(from: string, subject: TestSubject, entries: readonly { flow: string; name: string }[]): string {
  const cases = entries.map(
    (e) => `test(${JSON.stringify(e.name)}, () => {\n  assert.equal(typeof ${subject.value}, "function");\n  assert.fail(${JSON.stringify(`not written: drive flow \`${e.flow}\` through ${subject.value} and assert what the flow promises`)});\n});\n`,
  );
  return `import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { ${subject.imported} } from ${JSON.stringify(from)};\n\n${cases.join("\n")}`;
}

/** The e2e test file from the model; each declared test name must be in it verbatim. */
async function modelTest(model: LlmClient, file: string, from: string, subject: TestSubject, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions): Promise<string> {
  const reach = subject.value === subject.imported ? "" : ` and reach \`${subject.value}\` through it`;
  const answer = await model.complete({
    system: `You write one end-to-end test file with node:test and node:assert/strict. Import \`${subject.imported}\` from ${JSON.stringify(from)}${reach}. Use exactly the test names given. Answer with the whole file only, in one fenced code block.`,
    prompt: [
      `Test file: ${file}`,
      `Tests (flow → name):\n${entries.map((e) => `- flow ${e.flow}: ${JSON.stringify(e.name)}`).join("\n")}`,
      `\`${id}\` as it will be:\n\`\`\`\n${code}\n\`\`\``,
    ].join("\n\n"),
    maxTokens: 8192,
  }, options);
  const text = (/```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer).trim();
  const missing = entries.filter((e) => !text.includes(JSON.stringify(e.name)) && !text.includes(`'${e.name}'`));
  if (missing.length > 0) throw new Error(`the model's ${file} has no test ${missing.map((e) => JSON.stringify(e.name)).join(", ")}; nothing written`);
  return `${text}\n`;
}

/** IDs directly above `id` in flows: the trigger or step each of its steps is nested under. */
function callersInFlows(analysis: Analysis, id: string): string[] {
  const out = new Set<string>();
  const visit = (item: Trigger | FlowItem, parent: string | null): void => {
    const own = item.kind === "trigger" || item.kind === "step" ? item.target.target : null;
    if (own === id && parent !== null) out.add(parent);
    if (item.kind === "test") return;
    for (const child of item.children) visit(child, own ?? parent);
  };
  for (const flow of analysis.spec.flows) for (const item of flow.top) visit(item, null);
  return [...out].sort();
}

/**
 * `<layer glob prefix>/<segments>.<ext>` for a module the code lacks; one
 * prefix per layer, or the path is ambiguous. The extension is the language
 * most files of the layer are written in (then of the repository, then the
 * first of `languages`); the file name follows the layer's files: the
 * module `bookmark_service` is `bookmark.service.ts` beside `x.service.ts`.
 */
function newModuleFile(analysis: Analysis, moduleId: string): string {
  const config = analysis.config;
  const [layer, ...segments] = moduleId.split(".");
  const globs = config.layers.get(layer!);
  if (!globs) throw new Error(`no layer \`${layer}\` in keylang.json`);
  const prefixes = [...new Set(globs.map((g) => globPrefix(g)))];
  if (prefixes.length !== 1) throw new Error(`layer \`${layer}\` has ${prefixes.length} roots (${prefixes.join(", ") || "none"}); pass --into <file>`);
  if (segments.length === 0) throw new Error(`\`${moduleId}\` is a layer, not a module; pass --into <file>`);
  const sources = (analysis.snapshot?.manifest.files ?? []).map((f) => f.path).filter((path) => languageOf(path) !== undefined);
  const layerFiles = sources.filter((path) => placeFile(config, path)?.layer === layer);
  const language = mostWritten(layerFiles, config.languages) ?? mostWritten(sources, config.languages) ?? config.languages[0] ?? "typescript";
  const ext = EXTENSIONS[language] ?? ".ts";
  const dir = [prefixes[0]!, ...segments.slice(0, -1)].filter((part) => part !== "").join("/");
  const inDir = layerFiles.filter((path) => posix.dirname(path) === (dir === "" ? "." : dir));
  const at = (stem: string): string => `${dir === "" ? "" : `${dir}/`}${stem}${ext}`;
  return at(fileStem(segments.at(-1)!, [inDir, layerFiles], (dotted, plain) => `\`${moduleId}\` could be ${at(dotted)} or ${at(plain)}: the layer names files both ways; pass --into <file>`));
}

/** The language most of `files` are written in; a tie goes to the one `languages` lists first. */
function mostWritten(files: readonly string[], languages: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const file of files) {
    const language = languageOf(file);
    if (language !== undefined) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const rank = (language: string): number => (languages.includes(language) ? languages.indexOf(language) : languages.length);
  const best = [...counts].sort(([a, x], [b, y]) => y - x || rank(a) - rank(b) || (a < b ? -1 : 1))[0];
  return best?.[0] ?? null;
}

/**
 * The file name (without extension) of the module segment `segment`. An ID
 * segment has `_` where the file had `.` (`bookmark.service` → `bookmark_service`),
 * so the nearest scope whose files end in `.service` or `_service` decides;
 * a scope with both is ambiguous.
 */
function fileStem(segment: string, scopes: readonly (readonly string[])[], ambiguous: (dotted: string, plain: string) => string): string {
  const cut = segment.lastIndexOf("_");
  if (cut <= 0) return segment;
  const head = segment.slice(0, cut);
  const suffix = segment.slice(cut + 1);
  for (const scope of scopes) {
    const stems = scope.map((path) => posix.basename(path).replace(/\.[^.]+$/, ""));
    const dotted = stems.some((stem) => stem.endsWith(`.${suffix}`) && stem.length > suffix.length + 1);
    const plain = stems.some((stem) => stem.endsWith(`_${suffix}`) && stem.length > suffix.length + 1);
    if (dotted && plain) throw new Error(ambiguous(`${head}.${suffix}`, segment));
    if (dotted) return `${head}.${suffix}`;
    if (plain) return segment;
  }
  return segment;
}

/**
 * `(order: Order) → Promise<Refund>` → a function of that signature that
 * fails until written; the declared parameters and result are kept as
 * written, so the stub's own signature matches the plan (no K201). A method
 * comes without indentation and without its class: `placeStub` puts it in.
 * A Python method gets `self` when the plan does not name it, as the map
 * shows it (`(self, to: str)` matches a plan `(to: str)`).
 */
function stubFor(target: CodeTarget, id: string): string {
  const { file, name, owner } = target;
  const { params, result } = declared(target.signature);
  const message = JSON.stringify(`not implemented: ${id}`);
  if (file.endsWith(".py")) {
    const receiver = owner !== null && !/^(self|cls)\b/.test(params) ? (params === "" ? "self" : `self, ${params}`) : params;
    return `def ${name}(${receiver})${result ? ` -> ${result}` : ""}:\n    raise NotImplementedError(${message})\n`;
  }
  if (file.endsWith(".rs")) return `pub fn ${name}(${params})${result ? ` -> ${result}` : ""} {\n    todo!(${message})\n}\n`;
  if (file.endsWith(".php")) return `${owner ? "public " : ""}function ${name}(${params})${result ? `: ${result}` : ""}\n{\n    throw new \\LogicException(${phpString(`not implemented: ${id}`)});\n}\n`;
  const isAsync = result !== null && /^Promise</.test(result);
  return `${owner ? "" : "export "}${isAsync ? "async " : ""}${owner ? "" : "function "}${name}(${params})${result ? `: ${result}` : ""} {\n  throw new Error(${message});\n}\n`;
}

/** The parameters and result of a declared signature, as written. */
function declared(signature: string | null): { params: string; result: string | null } {
  const m = /^\s*\((.*)\)\s*(?:(?:→|->)\s*(.+))?$/.exec(signature ?? "()");
  return { params: m?.[1]?.trim() ?? "", result: m?.[2]?.trim() ?? null };
}

/**
 * The file's text with `code` in place: appended to the module, wrapped in
 * a new class appended to it, or inside the body of the class the code has.
 * A new Python file gets postponed annotations: they name types it does not
 * import, and are not evaluated when it loads. A new PHP file starts with
 * `phpHead` (`<?php`, its namespace); one that ends with `?>` keeps the code
 * before it.
 */
function placeStub(before: string | null, target: CodeTarget, code: string, phpHead = ""): string {
  const python = target.file.endsWith(".py");
  const rust = target.file.endsWith(".rs");
  const php = target.file.endsWith(".php");
  const { owner } = target;
  if (owner?.span && before !== null && !rust) return intoClass(before, owner.span, code, python);
  let block = code;
  if (owner) {
    const body = indent(code, python || rust || php ? "    " : "  ");
    block = python ? `class ${owner.name}:\n${body}` : rust ? `${owner.span ? "" : `pub struct ${owner.name};\n\n`}impl ${owner.name} {\n${body}}\n` : php ? `class ${owner.name}\n{\n${body}}\n` : `export class ${owner.name} {\n${body}}\n`;
  }
  if (before === null || before.trim() === "") {
    const { params, result } = declared(target.signature);
    const future = python && before === null && (params.includes(":") || result !== null) ?"from __future__ import annotations\n\n\n" : "";
    return `${future}${php ? phpHead : ""}${block}`;
  }
  if (php && /\?>\s*$/.test(before)) {
    const close = before.lastIndexOf("?>");
    return `${before.slice(0, close).replace(/\n*$/, "")}\n\n${block}\n${before.slice(close)}`;
  }
  // PEP 8: two blank lines around a top-level definition.
  return `${before.replace(/\n*$/, "")}${python ? "\n\n\n" : "\n\n"}${block}`;
}

/** `code` as the last member of the class whose lines `span` gives, indented as its other members are. */
function intoClass(text: string, span: { line: number; endLine: number; endCol: number | null }, code: string, python: boolean): string {
  const lines = text.split("\n");
  const start = span.line - 1;
  const end = span.endLine - 1;
  const classIndent = leadingSpace(lines[start] ?? "");
  // Python: the class ends at its last statement; others: at the line of the closing brace.
  const body = lines.slice(start + 1, python ? end + 1 : end).find((line) => line.trim() !== "" && leadingSpace(line).length > classIndent.length);
  const memberIndent = body !== undefined ? leadingSpace(body) : `${classIndent}${python ? "    " : "  "}`;
  const member = indent(code, memberIndent).replace(/\n$/, "").split("\n");
  if (python) {
    lines.splice(end + 1, 0, "", ...member);
    return lines.join("\n");
  }
  const closing = lines[end] ?? "";
  const brace = span.endCol !== null && closing[span.endCol - 2] === "}" ? span.endCol - 2 : closing.lastIndexOf("}");
  const head = closing.slice(0, brace);
  if (head.trim() === "") {
    const opens = (lines[end - 1] ?? "").trimEnd().endsWith("{");
    lines.splice(end, 0, ...(opens ? [] : [""]), ...member);
  } else {
    // `class A {}` on one line: the body opens onto lines of its own.
    lines.splice(end, 1, head.trimEnd(), ...member, `${classIndent}${closing.slice(brace)}`);
  }
  return lines.join("\n");
}

function leadingSpace(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

/** Each non-blank line of `code` with `prefix` before it. */
function indent(code: string, prefix: string): string {
  return code.split("\n").map((line) => (line.trim() === "" ? line : `${prefix}${line}`)).join("\n");
}

/** `code` without the indentation all its non-blank lines share. */
function dedent(code: string): string {
  const lines = code.split("\n");
  const common = Math.min(...lines.filter((line) => line.trim() !== "").map((line) => leadingSpace(line).length));
  return Number.isFinite(common) ? lines.map((line) => line.slice(Math.min(common, leadingSpace(line).length))).join("\n") : code;
}

/** Most lines of the target file a request shows whole, and of the part where the code goes: the cap of the code `explain --llm` sends. */
const EXCERPT_LINES = 200;
/** Most lines of a long file's head (its imports) a request shows. */
const HEAD_LINES = 50;

/**
 * What the model is shown of the file the code goes into, never more than
 * about `HEAD_LINES + EXCERPT_LINES` lines: a file of up to `EXCERPT_LINES`
 * lines whole; a longer one as its head up to the first declaration (the
 * imports, at most `HEAD_LINES` lines), then the class the method joins
 * (from its first line) or the end of the file a function is appended to,
 * at most `EXCERPT_LINES` lines, each gap named with its lines.
 */
function fileExcerpt(text: string, owner: CodeTarget["owner"], firstDeclaration: number | null): string {
  const lines = text.split("\n");
  // The newline that ends the file is no line of its own.
  if (lines.at(-1) === "") lines.pop();
  if (lines.length <= EXCERPT_LINES) return text;
  const span = owner?.span ?? null;
  const from = span === null ? Math.max(0, lines.length - EXCERPT_LINES) : span.line - 1;
  const to = span === null ? lines.length : Math.min(span.endLine, from + EXCERPT_LINES);
  const head = Math.min(HEAD_LINES, from, Math.max(0, (firstDeclaration ?? HEAD_LINES + 1) - 1));
  const gap = (start: number, end: number): string[] => (end > start ? [`… (lines ${start + 1}–${end} not shown)`] : []);
  return [...lines.slice(0, head), ...gap(head, from), ...lines.slice(from, to), ...gap(to, lines.length)].join("\n");
}

/** The first line of a declaration in `file` the snapshot knows: a fn, a type or a class; null without one. */
function firstDeclarationLine(analysis: Analysis, file: string): number | null {
  let first: number | null = null;
  for (const node of Object.values(analysis.snapshot?.nodes ?? {})) {
    if (node.file !== file || node.line === null || (node.kind === "module" && node.class !== true) || node.kind === "layer") continue;
    if (first === null || node.line < first) first = node.line;
  }
  return first;
}

/** The function (or method, without its class) from the model, with its declared name; the rest of its answer is dropped. */
async function modelBody(analysis: Analysis, model: LlmClient, target: CodeTarget, id: string, before: string | null, options: LlmCallOptions): Promise<string> {
  const { file, name, signature, owner } = target;
  const language = file.endsWith(".py") ? "Python" : file.endsWith(".rs") ? "Rust" : file.endsWith(".php") ? "PHP" : file.endsWith(".js") ? "JavaScript" : "TypeScript";
  const what = owner ? `method of class \`${owner.name}\`` : "function";
  const flows = flowsMentioning(analysis, id).map((flow) => `# flow ${flow.name}`);
  // Not the whole file: a large one would make a long request, and for an agent CLI an argument past its limit.
  const shown = before === null ? "" : fileExcerpt(before, owner, firstDeclarationLine(analysis, file));
  const answer = await model.complete({
    system: `You implement one planned ${what} in ${language}. Keep its name \`${name}\` and the signature exactly as declared. Answer with the whole ${owner ? "method only, without the class around it" : "function only"}, in one fenced code block.`,
    prompt: [
      `Planned: \`${id}\` ${signature ?? "()"}`,
      ...(flows.length > 0 ? [`Flows that use it: ${flows.join(", ")}`] : []),
      `File ${file}${before === null ? " (a new file)" : shown === before ? "" : " (its head and the part where the code goes)"}:\n\`\`\`\n${shown}\n\`\`\``,
    ].join("\n\n"),
    maxTokens: 8192,
  }, options);
  const code = dedent((/```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer).replace(/^\n+|\s+$/g, ""));
  const escaped = name.replace(/[$]/g, "\\$");
  // A TS/JS method has no keyword before its name.
  const declares = owner && (language === "TypeScript" || language === "JavaScript") ? new RegExp(`^(?:(?:public|private|protected|static|async|override)\\s+)*\\*?${escaped}\\s*[<(]`, "m") : new RegExp(`\\b(function|def|fn)\\s+${escaped}\\b`);
  if (!declares.test(code)) throw new Error(`the model did not return a ${owner ? "method" : "function"} named \`${name}\`; nothing written`);
  return `${code}\n`;
}
