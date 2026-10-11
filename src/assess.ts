// One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts.
// Pipeline: parsed spec Documents (Markdown → IR) + the analysis snapshot
// (code → graph) + test/trace evidence → resolve, rules, flows, wiring,
// migration and system checks → one sorted list of diagnostics and verdicts.
// Entry points: `assess`, `sameFinding` (used to merge a verdict with its diagnostic).

import { createHash } from "node:crypto";
import { compareDiagnostics, type Diagnostic } from "./diag.ts";
import type { StaticMode, StaticSource } from "./config.ts";
import { evaluateFlows, type FlowEvaluation, type FlowInput } from "./flows.ts";
import { sectionNodes, type Document, type Node } from "./ir.ts";
import { migrationCheck, type OldSnapshot } from "./migration.ts";
import { check, type Index, type ResolveContext } from "./resolve.ts";
import type { RuleFormat } from "./config.ts";
import { canonicalRuleSpec, dependencyKindOf, evaluateRules } from "./rules.ts";
import { compileSpec, type SpecIR } from "./spec-ir.ts";
import { systemCheck, type SystemSpec } from "./system.ts";
import type { TestCase } from "./test-report.ts";
import type { TraceRun } from "./trace-evidence.ts";
import type { Verdict } from "./verdict.ts";
import { checkWiring, type WiringView } from "./wiring.ts";

/** The slice of the analysis snapshot that checks read; `check` does not import `map`. */
export type SnapshotInput = NonNullable<Parameters<typeof evaluateRules>[2]> & {
  nodes: FlowInput["nodes"];
  edges: FlowInput["edges"];
  exports: WiringView["exports"];
  /** Entry points (`keylang entries`); absent from a snapshot written before them. */
  entries?: FlowInput["entries"];
  /** The configured layers, which exist before any module is in them. */
  manifest?: { config: { layers: Record<string, readonly string[]> } };
};

/** The outcome of one assessment: the resolved index, every diagnostic (sorted) and every verdict. */
export interface Assessment {
  index: Index;
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
  /** Assertions compiled once from the text IR. */
  spec: SpecIR;
  /** The `# system` sections of every document (system-design/02). */
  systems: SystemSpec[];
}

/** Evidence and options of one assessment beside the specs and the snapshot. */
export interface AssessEvidence {
  tests: TestCase[] | null;
  traces: TraceRun[] | null;
  static?: StaticMode;
  staticSetBy?: StaticSource;
  knownExternal?: ReadonlySet<string>;
  testFileExists?: FlowInput["testFileExists"];
  /** The old stack the old IDs of `# migration` rows resolve against; absent: none (they stay unverified). */
  migration?: OldSnapshot;
  /**
   * The spec files whose claims are assessed (`check <file>`): the others are
   * context only — their declarations, `planned` and flow names resolve
   * references, but their rules, flows and diagnostics are not reported.
   * Absent: every file.
   */
  assessed?: (file: string) => boolean;
}

/**
 * Assess spec documents against a snapshot (null: no code analysed yet) and the
 * evidence. `format` is the rules format of `keylang.json`.
 */
export function assess(
  docs: readonly Document[],
  snapshot: SnapshotInput | null,
  evidence: AssessEvidence = { tests: null, traces: null },
  format: RuleFormat = 1,
): Assessment {
  const { spec: whole, diagnostics: allSpecDiags } = compileSpec(docs);
  // Scope to the assessed files (`check <file>`): all files still resolve references,
  // but only claims and diagnostics of the assessed ones are reported.
  const assessed = evidence.assessed ?? (() => true);
  const own = <T extends { file: string }>(items: readonly T[]): T[] => items.filter((item) => assessed(item.file));
  const ownDocs = docs.filter((doc) => assessed(doc.path));
  const specDiags = own(allSpecDiags);
  const rulesInScope = own(whole.rules);
  const rejectedInScope = own(whole.rejectedLayers);
  // The planned IDs stay whole: a `planned` of another file answers a reference here.
  const spec: SpecIR = evidence.assessed === undefined ? whole : { ...whole, rules: rulesInScope, rejectedLayers: rejectedInScope, hasRules: whole.hasRules && (rulesInScope.length > 0 || rejectedInScope.length > 0), modules: own(whole.modules), flows: own(whole.flows), wires: own(whole.wires) };
  // The snapshot decides what the map alone cannot: configured layers without modules, and modules it could not read.
  const nodes = snapshot?.nodes;

  const members = (id: string): "complete" | "opaque" | undefined => {
    const node = nodes?.[id];

    return node?.kind !== "module" ? undefined : node.members === "opaque" ? "opaque" : "complete";
  };

  // Resolve references with what only the snapshot knows: empty layers, opaque modules, known packages.
  const resolveContext: ResolveContext = { layers: Object.keys(snapshot?.manifest?.config.layers ?? {}) };

  if (nodes) resolveContext.members = members;

  if (evidence.knownExternal) resolveContext.knownExternal = evidence.knownExternal;
  const refined = check(docs, resolveContext);

  const { index } = refined;
  const resolveDiags = own(refined.diagnostics);
  // Run each checker over the scoped spec; flows need a snapshot to say anything.
  const rules = evaluateRules(spec, index, snapshot, ownDocs, format);

  const flows: FlowEvaluation = snapshot === null ? { diagnostics: [], verdicts: [] } : evaluateFlows(spec, index, flowInput(snapshot, evidence));

  const planned = new Set(spec.planned.map((item) => item.id));
  const kindOf = dependencyKindOf(spec, index, snapshot?.nodes);
  const wiring = checkWiring(spec, snapshot === null ? null : { kinds: nodeKinds(snapshot.nodes), nodes: snapshot.nodes, exports: snapshot.exports }, kindOf, format);
  const migration = migrationCheck(ownDocs, evidence.migration ?? { state: "absent" }, snapshot?.snapshotId ?? null);
  const system = systemCheck(docs, snapshot);

  const diagnostics = [...ownDocs.flatMap((doc) => doc.diagnostics), ...specDiags, ...resolveDiags, ...rules.diagnostics, ...flows.diagnostics, ...wiring, ...migration.diagnostics, ...own(system.diagnostics)].filter(
    // A `planned` declaration answers a dangling reference to exactly its ID, not any message that mentions it.
    (diag) => diag.code !== "K001" || diag.target === undefined || !planned.has(diag.target),
  );

  // Sorted by file, position and code so every run prints the same order.
  diagnostics.sort(compareDiagnostics);
  // A flow step reports its own ID verdict for the same reference.
  const flowIds = new Set(flows.verdicts.filter((verdict) => verdict.criterion === "ID").map((verdict) => `${verdict.file}:${verdict.line}`));

  // References the resolver could not confirm become `unverified` ID verdicts,
  // hashed by their canonical rule line so the hash survives reformatting.
  const refinedVerdicts: Verdict[] = own(refined.unverified).filter((item) => !flowIds.has(`${item.file}:${item.line}`)).map((item) => ({
    verdict: "unverified",
    criterion: "ID",
    area: item.message,
    snapshotId: snapshot?.snapshotId ?? null,
    specHash: createHash("sha256").update(canonicalRuleSpec(spec, item.file, item.line) ?? item.spec).digest("hex"),
    file: item.file,
    line: item.line,
    col: item.col,
    code: null,
    message: item.message,
  }));

  // An `ok` on a line whose tree the parser had to guess is downgraded to unverified.
  const verdicts = afterRecovery([...rules.verdicts, ...refinedVerdicts, ...flows.verdicts, ...migration.verdicts, ...own(system.verdicts)], recoveredLines(docs));

  return { index, diagnostics, verdicts, spec: whole, systems: system.systems };
}

/**
 * Item lines whose place in the tree the parser recovered after a K003 (an
 * odd indent, a jump, a tab): the line itself and its subtree, keyed
 * `file:line`, with the position of the nearest such K003.
 */
function recoveredLines(docs: readonly Document[]): Map<string, string> {
  const recovered = new Map<string, string>();

  for (const doc of docs) {
    const k003 = new Map<number, string>();

    // The first K003 on each line, as `line:col`.
    for (const diag of doc.diagnostics) {
      const line = diag.span.start.line;

      if (diag.code === "K003" && !k003.has(line)) k003.set(line, `${line}:${diag.span.start.col}`);
    }

    if (k003.size === 0) continue;

    // Walk the tree: a node on a K003 line, and every descendant of one, inherits that position.
    const visit = (node: Node, inherited: string | undefined): void => {
      const at = k003.get(node.span.start.line) ?? inherited;

      if (at !== undefined) recovered.set(`${doc.path}:${node.span.start.line}`, at);

      for (const child of node.children) visit(child, at);
    };

    for (const section of doc.sections) for (const node of sectionNodes(section)) visit(node, undefined);
  }

  return recovered;
}

/** An `ok` on a recovered line is about a tree the file does not have: `unverified`. `fail` stays. */
function afterRecovery(verdicts: Verdict[], recovered: ReadonlyMap<string, string>): Verdict[] {
  if (recovered.size === 0) return verdicts;

  return verdicts.map((verdict) => {
    const at = recovered.get(`${verdict.file}:${verdict.line}`);

    if (verdict.verdict !== "ok" || at === undefined) return verdict;
    // A flow verdict's message repeats the verdict and area (`ok <area>: <reason>`); a rule's is the reason alone.
    const prefix = `ok ${verdict.area}: `;
    const flow = verdict.message.startsWith(prefix);
    const reason = `structure recovered after K003 at ${at}; on that structure: ${flow ? verdict.message.slice(prefix.length) : verdict.message}`;

    return { ...verdict, verdict: "unverified", message: flow ? `unverified ${verdict.area}: ${reason}` : reason };
  });
}

/**
 * Whether a diagnostic on the verdict's line reports the same finding: same or
 * contained message, or a failed ID verdict and the K001 about the same target.
 */
export function sameFinding(verdict: Verdict, diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diag) => {
    if (diag.file !== verdict.file || diag.span.start.line !== verdict.line) return false;

    if (diag.message === verdict.message || verdict.message.includes(diag.message)) return true;

    return verdict.criterion === "ID" && verdict.verdict === "fail" && diag.code === "K001" && diag.target === verdict.area;
  });
}

/** What flows read of the snapshot and the evidence. */
function flowInput(snapshot: SnapshotInput, evidence: AssessEvidence): FlowInput {
  const input: FlowInput = {
    snapshotId: snapshot.snapshotId,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    coverage: snapshot.coverage,
    tests: evidence.tests,
    traces: evidence.traces,
  };

  if (snapshot.entries) input.entries = snapshot.entries;

  if (evidence.static) input.static = evidence.static;

  if (evidence.staticSetBy) input.staticSetBy = evidence.staticSetBy;

  if (evidence.testFileExists) input.testFileExists = evidence.testFileExists;

  return input;
}

/** Snapshot kinds, with a class told apart by its marker. */
function nodeKinds(nodes: SnapshotInput["nodes"]): Map<string, string> {
  const kinds = new Map<string, string>();

  for (const [id, node] of Object.entries(nodes)) kinds.set(id, node.kind === "module" && node.class === true ? "class" : node.kind);

  return kinds;
}

