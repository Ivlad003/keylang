// One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts.

import { createHash } from "node:crypto";
import { compareDiagnostics, type Diagnostic } from "./diag.ts";
import type { StaticMode, StaticSource } from "./config.ts";
import { evaluateFlows, type FlowInput } from "./flows.ts";
import type { Document } from "./ir.ts";
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
  evidence: { tests: TestCase[] | null; traces: TraceRun[] | null; static?: StaticMode; staticSetBy?: StaticSource; knownExternal?: ReadonlySet<string> } = { tests: null, traces: null },
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
          tests: evidence.tests,
          traces: evidence.traces,
          ...(evidence.static ? { static: evidence.static } : {}),
          ...(evidence.staticSetBy ? { staticSetBy: evidence.staticSetBy } : {}),
        });
  const planned = new Set(spec.planned.map((item) => item.id));
  const kindOf = dependencyKindOf(spec, index, snapshot?.nodes);
  const wiring = checkWiring(spec, snapshot === null ? null : { kinds: nodeKinds(snapshot.nodes), nodes: snapshot.nodes, exports: snapshot.exports }, kindOf, format);
  const diagnostics = [...docs.flatMap((doc) => doc.diagnostics), ...specDiags, ...resolveDiags, ...rules.diagnostics, ...flows.diagnostics, ...wiring].filter(
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
  return { index, diagnostics, verdicts: [...rules.verdicts, ...refinedVerdicts, ...flows.verdicts], spec };
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

