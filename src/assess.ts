// One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts.

import { compareDiagnostics, type Diagnostic } from "./diag.ts";
import { evaluateFlows, type FlowInput } from "./flows.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import { check, refineOpacity, type Index } from "./resolve.ts";
import { evaluateRules } from "./rules.ts";
import type { Verdict } from "./verdict.ts";

/** The slice of the analysis snapshot that checks read; `check` does not import `map`. */
export type SnapshotInput = NonNullable<Parameters<typeof evaluateRules>[2]> & { nodes: FlowInput["nodes"]; edges: FlowInput["edges"] };

export interface Assessment {
  index: Index;
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
}

export function assess(
  docs: readonly Document[],
  snapshot: SnapshotInput | null,
  flow: { root: string; testsPath?: string; tracePath?: string } | null,
): Assessment {
  const { index, diagnostics: resolveDiags } = check(docs);
  const refined = refineOpacity(docs, index, snapshot?.nodes ?? null);
  const rules = evaluateRules(docs, index, snapshot);
  const flows =
    snapshot === null
      ? { diagnostics: [] as Diagnostic[], verdicts: [] as Verdict[] }
      : evaluateFlows(docs, index, {
          root: flow?.root ?? "",
          snapshotId: snapshot.snapshotId,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          ...(flow?.testsPath ? { testsPath: flow.testsPath } : {}),
          ...(flow?.tracePath ? { tracePath: flow.tracePath } : {}),
        });
  const planned = plannedIds(docs);
  const diagnostics = [...docs.flatMap((doc) => doc.diagnostics), ...resolveDiags, ...refined.added, ...rules.diagnostics, ...flows.diagnostics].filter(
    (diag) => diag.code !== "K001" || ![...planned].some((id) => diag.message.includes(`\`${id}\``)),
  );
  diagnostics.sort(compareDiagnostics);
  // A flow step reports its own ID verdict for the same reference.
  const flowIds = new Set(flows.verdicts.filter((verdict) => verdict.criterion === "ID").map((verdict) => `${verdict.file}:${verdict.line}`));
  const refinedVerdicts: Verdict[] = refined.unverified.filter((item) => !flowIds.has(`${item.file}:${item.line}`)).map((item) => ({
    verdict: "unverified",
    criterion: "ID",
    area: item.message,
    snapshotId: snapshot?.snapshotId ?? null,
    specHash: "",
    file: item.file,
    line: item.line,
    col: item.col,
    code: null,
    message: item.message,
  }));
  return { index, diagnostics, verdicts: [...rules.verdicts, ...refinedVerdicts, ...flows.verdicts] };
}

export function sameFinding(verdict: Verdict, diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diag) => {
    if (diag.file !== verdict.file || diag.span.start.line !== verdict.line) return false;
    if (diag.message === verdict.message || verdict.message.includes(diag.message)) return true;
    return verdict.criterion === "ID" && verdict.verdict === "fail" && diag.code === "K001" && diag.message.includes(`\`${verdict.area}\``);
  });
}

function plannedIds(docs: readonly Document[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind === "planned" && node.id) ids.add(node.id);
        });
      }
    }
  }
  return ids;
}
