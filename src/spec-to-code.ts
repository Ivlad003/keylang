// `keylang spec-to-code <id>` (design §5.5), algo: a stub for a `planned`
// fn in the file its ID names, with the declared signature, analyzed as a
// new snapshot before anything is written; and for each `test` its flows
// name in a file that does not exist yet, a TS/JS e2e test that fails until
// it is written (with a model: the test from the model). An ID that is neither planned
// nor in the code is a reference to fix or an intention to declare first:
// no code is guessed from a possible typo.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { analyze, type Analysis } from "./analyze.ts";
import { toPosix, type Config } from "./config.ts";
import type { Diagnostic } from "./diag.ts";
import { globPrefix } from "./glob.ts";
import { placeFile } from "./graph.ts";
import { sectionNodes, walk } from "./ir.ts";
import { plannedDecl } from "./lsp-features.ts";
import { codeProposalProblem } from "./proposals.ts";
import { blocksDependency } from "./rules.ts";
import { allCrlf } from "./safe-write.ts";
import type { LlmClient } from "./llm.ts";
import type { Verdict } from "./verdict.ts";

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

const EXTENSIONS: Record<string, string> = { typescript: ".ts", javascript: ".js", python: ".py", rust: ".rs" };

/**
 * `model`: the body comes from the model instead of the stub — the whole
 * function with the declared signature, in one fenced block — and is
 * analyzed the same way before anything is written.
 */
export async function specToCode(analysis: Analysis, id: string, into?: string, model?: LlmClient): Promise<CodeCandidate> {
  const plan = plannedDecl(analysis.docs, id);
  if (!plan) {
    const present = analysis.snapshot?.nodes[id];
    if (present) throw new Error(`\`${id}\` is already implemented (${present.file ?? "?"}:${present.line ?? 1}); spec-to-code builds planned nodes only`);
    const near = analysis.index.suggest(id);
    throw new Error(`\`${id}\` is neither planned nor in the code: fix the reference${near ? ` (did you mean \`${near}\`?)` : ""}, or declare \`planned fn ${id} <signature>\` first`);
  }
  if (plan.kind !== "fn") throw new Error(`\`${id}\` is a planned ${plan.kind}; spec-to-code builds planned fns`);
  // A second run would add a second function of the same name.
  const implemented = analysis.snapshot?.nodes[id];
  if (implemented) throw new Error(`\`${id}\` is already implemented (${implemented.file ?? "?"}:${implemented.line ?? 1}); \`keylang check\` says whether the \`planned\` declaration can go (K202)`);
  // A stub the flow could never reach would contradict the rules it is checked by.
  for (const caller of callersInFlows(analysis, id)) {
    if (blocksDependency(analysis.docs, caller, id)) throw new Error(`\`deny\` forbids \`${caller}\` → \`${id}\`, which its flow needs; change the rule or the plan first`);
  }
  const config = analysis.config;
  const moduleId = id.slice(0, id.lastIndexOf("."));
  const name = id.slice(id.lastIndexOf(".") + 1);
  const existing = analysis.snapshot?.nodes[moduleId];
  const file = into ?? (existing?.kind === "module" && existing.file ? existing.file : newModuleFile(config, moduleId));
  const placed = placeFile(config, file);
  if (!placed || [placed.layer, ...placed.segments].join(".") !== moduleId) throw new Error(`${file} is not module \`${moduleId}\` under keylang.json layers; pass --into with a file of that module`);
  // The rules of a code proposal, before the file is read: inside the repository, not generated (`keylang.gen.ts`).
  const problem = codeProposalProblem(config.root, file);
  if (problem) throw new Error(`${file}: ${problem}`);
  const abs = join(config.root, file);
  const before = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  const lf = before?.replace(/\r\n/g, "\n") ?? null;
  const stub = model ? await modelBody(analysis, model, file, name, id, plan.signature, lf) : stubFor(file, name, id, plan.signature, lf === null);
  const joined = lf === null || lf.trim() === "" ? stub : `${lf.replace(/\n*$/, "")}\n\n${stub}`;
  // A file with CRLF on every line keeps it.
  const after = before !== null && allCrlf(before) ? joined.replace(/\n/g, "\r\n") : joined;
  // The candidate is checked as the code it would be, without touching the disk, against the code without it.
  const next = await analyze({ root: config.root, overlay: new Map([[abs, after]]), withoutEvidence: true });
  const { verdicts, diagnostics } = introduced(analysis, next);
  const { tests, notes } = await testCandidates(analysis, id, file, after, model);
  return { id, file, before, after, verdicts, diagnostics, tests, testNotes: notes };
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
  for (const doc of analysis.docs) {
    if (doc.generated !== null) continue;
    for (const section of doc.sections) {
      if (section.kind !== "flow" || !section.name) continue;
      let mentions = false;
      const tests: { file: string; name: string }[] = [];
      for (const top of sectionNodes(section)) walk(top, (node) => {
        if (node.id === id || node.refs.some((ref) => ref.target === id)) mentions = true;
        if (node.kind === "test" && node.text && node.label) tests.push({ file: node.text.value, name: node.label.value });
      });
      if (mentions) for (const t of tests) out.push({ flow: section.name.value, ...t });
    }
  }
  return out;
}

/**
 * One new file per test path the flows name and the disk lacks. A test in an
 * existing file, or in a language without a `node:test` shape, is a note:
 * editing someone's test file is theirs to do.
 */
async function testCandidates(analysis: Analysis, id: string, codeFile: string, code: string, model: LlmClient | undefined): Promise<{ tests: FileCandidate[]; notes: string[] }> {
  const root = analysis.config.root;
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
    if (!TEST_EXTENSIONS.test(t.file) || !TEST_EXTENSIONS.test(codeFile)) {
      notes.push(`${label}: write it by hand (spec-to-code writes node:test files for TS/JS)`);
      continue;
    }
    const list = byFile.get(t.file) ?? [];
    if (!list.some((x) => x.name === t.name)) list.push({ flow: t.flow, name: t.name });
    byFile.set(t.file, list);
  }
  const name = id.slice(id.lastIndexOf(".") + 1);
  const tests: FileCandidate[] = [];
  for (const [file, entries] of [...byFile].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let from = toPosix(relative(dirname(file), codeFile));
    if (!from.startsWith(".")) from = `./${from}`;
    const after = model ? await modelTest(model, file, from, name, id, code, entries) : testStub(from, name, entries);
    tests.push({ file, before: null, after });
  }
  return { tests, notes };
}

function testStub(from: string, name: string, entries: readonly { flow: string; name: string }[]): string {
  const cases = entries.map(
    (e) => `test(${JSON.stringify(e.name)}, () => {\n  assert.equal(typeof ${name}, "function");\n  assert.fail(${JSON.stringify(`not written: drive flow \`${e.flow}\` through ${name} and assert what the flow promises`)});\n});\n`,
  );
  return `import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { ${name} } from ${JSON.stringify(from)};\n\n${cases.join("\n")}`;
}

/** The e2e test file from the model; each declared test name must be in it verbatim. */
async function modelTest(model: LlmClient, file: string, from: string, name: string, id: string, code: string, entries: readonly { flow: string; name: string }[]): Promise<string> {
  const answer = await model.complete({
    system: `You write one end-to-end test file with node:test and node:assert/strict. Import \`${name}\` from ${JSON.stringify(from)}. Use exactly the test names given. Answer with the whole file only, in one fenced code block.`,
    prompt: [
      `Test file: ${file}`,
      `Tests (flow → name):\n${entries.map((e) => `- flow ${e.flow}: ${JSON.stringify(e.name)}`).join("\n")}`,
      `\`${id}\` as it will be:\n\`\`\`\n${code}\n\`\`\``,
    ].join("\n\n"),
    maxTokens: 8192,
  });
  const text = (/```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer).trim();
  const missing = entries.filter((e) => !text.includes(JSON.stringify(e.name)) && !text.includes(`'${e.name}'`));
  if (missing.length > 0) throw new Error(`the model's ${file} has no test ${missing.map((e) => JSON.stringify(e.name)).join(", ")}; nothing written`);
  return `${text}\n`;
}

/** IDs directly above `id` in flows: the trigger or step each of its steps is nested under. */
function callersInFlows(analysis: Analysis, id: string): string[] {
  const out = new Set<string>();
  for (const doc of analysis.docs) {
    for (const section of doc.sections) {
      if (section.kind !== "flow") continue;
      const visit = (node: (typeof section.items)[number] & { type: "node" }, parent: string | null): void => {
        const own = node.kind === "trigger" || node.kind === "step" ? (node.refs[0]?.target ?? null) : null;
        if (own === id && parent !== null) out.add(parent);
        for (const child of node.children) visit(child as typeof node, own ?? parent);
      };
      for (const top of sectionNodes(section)) visit(top as never, null);
    }
  }
  return [...out].sort();
}

/** `<layer glob prefix>/<segments>.<ext>`; one prefix per layer, or the path is ambiguous. */
function newModuleFile(config: Config, moduleId: string): string {
  const [layer, ...segments] = moduleId.split(".");
  const globs = config.layers.get(layer!);
  if (!globs) throw new Error(`no layer \`${layer}\` in keylang.json`);
  const prefixes = [...new Set(globs.map((g) => globPrefix(g)))];
  if (prefixes.length !== 1) throw new Error(`layer \`${layer}\` has ${prefixes.length} roots (${prefixes.join(", ") || "none"}); pass --into <file>`);
  const ext = EXTENSIONS[config.languages[0] ?? "typescript"] ?? ".ts";
  return `${prefixes[0] ? `${prefixes[0]}/` : ""}${segments.join("/")}${ext}`;
}

/**
 * `(order: Order) → Promise<Refund>` → a function of that signature that
 * fails until written; the declared parameters and result are kept as
 * written, so the stub's own signature matches the plan (no K201).
 */
function stubFor(file: string, name: string, id: string, signature: string | null, newFile: boolean): string {
  const m = /^\s*\((.*)\)\s*(?:(?:→|->)\s*(.+))?$/.exec(signature ?? "()");
  const params = m?.[1]?.trim() ?? "";
  const result = m?.[2]?.trim() ?? null;
  const message = JSON.stringify(`not implemented: ${id}`);
  if (file.endsWith(".py")) {
    // Annotations name types the new file does not import: postponed, they are not evaluated when it loads.
    const future = newFile && (params.includes(":") || result !== null) ? "from __future__ import annotations\n\n\n" : "";
    return `${future}def ${name}(${params})${result ? ` -> ${result}` : ""}:\n    raise NotImplementedError(${message})\n`;
  }
  if (file.endsWith(".rs")) return `pub fn ${name}(${params})${result ? ` -> ${result}` : ""} {\n    todo!(${message})\n}\n`;
  const isAsync = result !== null && /^Promise</.test(result);
  return `export ${isAsync ? "async " : ""}function ${name}(${params})${result ? `: ${result}` : ""} {\n  throw new Error(${message});\n}\n`;
}

/** The function from the model, with its declared name; the rest of its answer is dropped. */
async function modelBody(analysis: Analysis, model: LlmClient, file: string, name: string, id: string, signature: string | null, before: string | null): Promise<string> {
  const language = file.endsWith(".py") ? "Python" : file.endsWith(".rs") ? "Rust" : file.endsWith(".js") ? "JavaScript" : "TypeScript";
  const flows: string[] = [];
  for (const doc of analysis.docs) {
    if (doc.generated !== null) continue;
    for (const section of doc.sections) {
      if (section.kind !== "flow") continue;
      let mentions = false;
      for (const top of sectionNodes(section)) walk(top, (node) => {
        if (node.id === id || node.refs.some((ref) => ref.target === id)) mentions = true;
      });
      if (mentions && section.heading) flows.push(`# ${section.heading.value}`);
    }
  }
  const answer = await model.complete({
    system: `You implement one planned function in ${language}. Keep its name \`${name}\` and the signature exactly as declared. Answer with the whole function only, in one fenced code block.`,
    prompt: [
      `Planned: \`${id}\` ${signature ?? "()"}`,
      ...(flows.length > 0 ? [`Flows that use it: ${flows.join(", ")}`] : []),
      `File ${file}:\n\`\`\`\n${before ?? ""}\n\`\`\``,
    ].join("\n\n"),
    maxTokens: 8192,
  });
  const code = (/```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer).trim();
  const declares = new RegExp(`\\b(function|def|fn)\\s+${name.replace(/[$]/g, "\\$")}\\b`);
  if (!declares.test(code)) throw new Error(`the model did not return a function named \`${name}\`; nothing written`);
  return `${code}\n`;
}
