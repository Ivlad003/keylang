// One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts.

import { createHash } from "node:crypto";
import { compareDiagnostics, type Diagnostic } from "./diag.ts";
import { evaluateFlows, type FlowInput, type StaticMode } from "./flows.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import { check, refineOpacity, type Index } from "./resolve.ts";
import { evaluateRules } from "./rules.ts";
import type { TestCase } from "./test-report.ts";
import type { TraceRun } from "./trace-evidence.ts";
import type { Verdict } from "./verdict.ts";
import { checkWiring } from "./wiring.ts";

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
  evidence: { tests: TestCase[] | null; traces: TraceRun[] | null; static?: StaticMode } = { tests: null, traces: null },
): Assessment {
  const { index, diagnostics: resolveDiags } = check(docs);
  const refined = refineOpacity(docs, index, snapshot?.nodes ?? null);
  const rules = evaluateRules(docs, index, snapshot);
  const flows =
    snapshot === null
      ? { diagnostics: [] as Diagnostic[], verdicts: [] as Verdict[] }
      : evaluateFlows(docs, index, {
          snapshotId: snapshot.snapshotId,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          coverage: snapshot.coverage,
          tests: evidence.tests,
          traces: evidence.traces,
          ...(evidence.static ? { static: evidence.static } : {}),
        });
  const planned = plannedIds(docs);
  const wiring = checkWiring(docs, snapshot === null ? null : nodeKinds(snapshot.nodes));
  const diagnostics = [...docs.flatMap((doc) => doc.diagnostics), ...resolveDiags, ...refined.added, ...rules.diagnostics, ...flows.diagnostics, ...wiring].filter(
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
    specHash: createHash("sha256").update(item.message).digest("hex"),
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
    return verdict.criterion === "ID" && verdict.verdict === "fail" && diag.code === "K001" && diag.target === verdict.area;
  });
}

/** Snapshot kinds, with a class told apart: a module node declared in the same file as its parent module. */
function nodeKinds(nodes: SnapshotInput["nodes"]): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const [id, node] of Object.entries(nodes)) {
    const parent = nodes[id.slice(0, id.lastIndexOf("."))];
    kinds.set(id, node.kind === "module" && parent?.kind === "module" && parent.file !== null && parent.file === node.file ? "class" : node.kind);
  }
  return kinds;
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
