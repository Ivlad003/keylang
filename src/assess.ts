// One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts.

import { createHash } from "node:crypto";
import { compareDiagnostics, type Diagnostic } from "./diag.ts";
import type { StaticMode, StaticSource } from "./config.ts";
import { evaluateFlows, type FlowInput } from "./flows.ts";
import { sectionNodes, type Document, type Node } from "./ir.ts";
import { migrationCheck, type OldSnapshot } from "./migration.ts";
import { check, type Index } from "./resolve.ts";
import type { RuleFormat } from "./config.ts";
import { canonicalRuleSpec, dependencyKindOf, evaluateRules } from "./rules.ts";
import { compileSpec, type SpecIR } from "./spec-ir.ts";
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
  manifest?: { config: { layers: Record<string, unknown> } };
};

export interface Assessment {
  index: Index;
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
  /** Assertions compiled once from the text IR. */
  spec: SpecIR;
}

export function assess(
  docs: readonly Document[],
  snapshot: SnapshotInput | null,
  evidence: {
    tests: TestCase[] | null;
    traces: TraceRun[] | null;
    static?: StaticMode;
    staticSetBy?: StaticSource;
    knownExternal?: ReadonlySet<string>;
    testFileExists?: FlowInput["testFileExists"];
    /** The old stack the old IDs of `# migration` rows resolve against; absent: none (they stay unverified). */
    migration?: OldSnapshot;
  } = { tests: null, traces: null },
  format: RuleFormat = 1,
): Assessment {
  const { spec, diagnostics: specDiags } = compileSpec(docs);
  // The snapshot decides what the map alone cannot: configured layers without modules, and modules it could not read.
  const nodes = snapshot?.nodes;
  const members = (id: string): "complete" | "opaque" | undefined => {
    const node = nodes?.[id];
    return node?.kind !== "module" ? undefined : node.members === "opaque" ? "opaque" : "complete";
  };
  const refined = check(docs, {
    layers: Object.keys(snapshot?.manifest?.config.layers ?? {}),
    ...(nodes ? { members } : {}),
    ...(evidence.knownExternal ? { knownExternal: evidence.knownExternal } : {}),
  });
  const { index, diagnostics: resolveDiags } = refined;
  const rules = evaluateRules(spec, index, snapshot, docs, format);
  const flows =
    snapshot === null
      ? { diagnostics: [] as Diagnostic[], verdicts: [] as Verdict[] }
      : evaluateFlows(spec, index, {
          snapshotId: snapshot.snapshotId,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          coverage: snapshot.coverage,
          ...(snapshot.entries ? { entries: snapshot.entries } : {}),
          tests: evidence.tests,
          traces: evidence.traces,
          ...(evidence.static ? { static: evidence.static } : {}),
          ...(evidence.staticSetBy ? { staticSetBy: evidence.staticSetBy } : {}),
          ...(evidence.testFileExists ? { testFileExists: evidence.testFileExists } : {}),
        });
  const planned = new Set(spec.planned.map((item) => item.id));
  const kindOf = dependencyKindOf(spec, index, snapshot?.nodes);
  const wiring = checkWiring(spec, snapshot === null ? null : { kinds: nodeKinds(snapshot.nodes), nodes: snapshot.nodes, exports: snapshot.exports }, kindOf, format);
  const migration = migrationCheck(docs, evidence.migration ?? { state: "absent" }, snapshot?.snapshotId ?? null);
  const diagnostics = [...docs.flatMap((doc) => doc.diagnostics), ...specDiags, ...resolveDiags, ...rules.diagnostics, ...flows.diagnostics, ...wiring, ...migration.diagnostics].filter(
    // A `planned` declaration answers a dangling reference to exactly its ID, not any message that mentions it.
    (diag) => diag.code !== "K001" || diag.target === undefined || !planned.has(diag.target),
  );
  diagnostics.sort(compareDiagnostics);
  // A flow step reports its own ID verdict for the same reference.
  const flowIds = new Set(flows.verdicts.filter((verdict) => verdict.criterion === "ID").map((verdict) => `${verdict.file}:${verdict.line}`));
  const refinedVerdicts: Verdict[] = refined.unverified.filter((item) => !flowIds.has(`${item.file}:${item.line}`)).map((item) => ({
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
  const verdicts = afterRecovery([...rules.verdicts, ...refinedVerdicts, ...flows.verdicts, ...migration.verdicts], recoveredLines(docs));
  return { index, diagnostics, verdicts, spec };
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
    for (const diag of doc.diagnostics) {
      const line = diag.span.start.line;
      if (diag.code === "K003" && !k003.has(line)) k003.set(line, `${line}:${diag.span.start.col}`);
    }
    if (k003.size === 0) continue;
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

export function sameFinding(verdict: Verdict, diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diag) => {
    if (diag.file !== verdict.file || diag.span.start.line !== verdict.line) return false;
    if (diag.message === verdict.message || verdict.message.includes(diag.message)) return true;
    return verdict.criterion === "ID" && verdict.verdict === "fail" && diag.code === "K001" && diag.target === verdict.area;
  });
}

/** Snapshot kinds, with a class told apart by its marker. */
function nodeKinds(nodes: SnapshotInput["nodes"]): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const [id, node] of Object.entries(nodes)) kinds.set(id, node.kind === "module" && node.class === true ? "class" : node.kind);
  return kinds;
}

