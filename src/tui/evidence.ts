// What the gutter shows for one spec line, from the shared analysis: the
// separate evidence channels and one mark over them. The mark is `ok` only
// when every reported criterion on the line is `ok`; `ID ✓` with a missing
// trace is `unverified`, never a plain ✓. `planned` is its own state.

import type { Analysis } from "../analyze.ts";
import type { Diagnostic } from "../diag.ts";
import { sectionNodes, walk, type Document } from "../ir.ts";

export type Mark = "ok" | "fail" | "unverified" | "planned" | "warning";

/** Evidence channels in display order; a flow step reports each one separately. */
export const CHANNELS = ["ID", "static", "tests", "trace"] as const;

export interface LineEvidence {
  mark: Mark;
  /** One entry per criterion reported on the line, in channel order, then the rest. */
  criteria: { criterion: string; verdict: "ok" | "fail" | "unverified"; message: string }[];
  diagnostics: Diagnostic[];
  /** The line declares `planned`: an intention, not a fact of the snapshot. */
  planned: boolean;
}

const RANK: Record<Mark, number> = { fail: 4, unverified: 3, warning: 2, planned: 1, ok: 0 };

export function worse(a: Mark | null, b: Mark | null): Mark | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

function plannedLines(doc: Document): Set<number> {
  const lines = new Set<number>();
  for (const section of doc.sections) {
    for (const top of sectionNodes(section)) {
      walk(top, (node) => {
        if (node.kind === "planned") lines.add(node.span.start.line);
      });
    }
  }
  return lines;
}

/** IDs declared `planned` that the snapshot does not have yet: evidence about them is missing by intention. */
function pendingPlanned(analysis: Analysis): Set<string> {
  const ids = new Set<string>();
  const nodes = analysis.snapshot?.nodes ?? {};
  for (const doc of analysis.docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind === "planned" && node.id && nodes[node.id] === undefined) ids.add(node.id);
        });
      }
    }
  }
  return ids;
}

/** Evidence of every document of an analysis, computed once per analysis (the UI asks on every frame). */
const cache = new WeakMap<Analysis, Map<string, Map<number, LineEvidence>>>();

function allEvidence(analysis: Analysis): Map<string, Map<number, LineEvidence>> {
  const cached = cache.get(analysis);
  if (cached) return cached;
  const byPath = new Map<string, Map<number, LineEvidence>>();
  const entry = (path: string, line: number): LineEvidence => {
    let lines = byPath.get(path);
    if (!lines) byPath.set(path, (lines = new Map()));
    let found = lines.get(line);
    if (!found) {
      found = { mark: "ok", criteria: [], diagnostics: [], planned: false };
      lines.set(line, found);
    }
    return found;
  };
  for (const diag of analysis.diagnostics) entry(diag.file, diag.span.start.line).diagnostics.push(diag);
  const planned = pendingPlanned(analysis);
  const areas = new Map<LineEvidence["criteria"][number], string>();
  for (const verdict of analysis.verdicts) {
    const criterion = { criterion: verdict.criterion, verdict: verdict.verdict, message: verdict.message };
    areas.set(criterion, verdict.area);
    entry(verdict.file, verdict.line).criteria.push(criterion);
  }
  for (const doc of analysis.docs) for (const line of plannedLines(doc)) entry(doc.path, line).planned = true;
  const order = (criterion: string): number => {
    const at = (CHANNELS as readonly string[]).indexOf(criterion);
    return at === -1 ? CHANNELS.length : at;
  };
  for (const lines of byPath.values()) {
    for (const item of lines.values()) {
      item.criteria.sort((a, b) => order(a.criterion) - order(b.criterion));
      let mark: Mark | null = null;
      for (const diag of item.diagnostics) mark = worse(mark, diag.severity === "error" ? "fail" : "warning");
      for (const criterion of item.criteria) {
        // Evidence missing because the target is only planned is the planned state, not a gap.
        if (criterion.verdict === "unverified" && planned.has(areas.get(criterion) ?? "")) item.planned = true;
        else mark = worse(mark, criterion.verdict);
      }
      if (item.planned) mark = worse(mark, "planned");
      item.mark = mark ?? "ok";
    }
  }
  cache.set(analysis, byPath);
  return byPath;
}

const EMPTY = new Map<number, LineEvidence>();

/** Evidence by 1-based line of one document. Lines with nothing reported are absent. */
export function evidenceOf(analysis: Analysis, path: string): Map<number, LineEvidence> {
  return allEvidence(analysis).get(path) ?? EMPTY;
}

export const MARK_GLYPH: Record<Mark, string> = { ok: "✓", fail: "✗", unverified: "◌", planned: "◇", warning: "!" };

/** Totals for the status bar: failing, unverified and passing lines across all documents. */
export function totals(analysis: Analysis): { fail: number; unverified: number; ok: number } {
  const counts = { fail: 0, unverified: 0, ok: 0 };
  for (const lines of allEvidence(analysis).values()) {
    for (const item of lines.values()) {
      if (item.mark === "fail") counts.fail++;
      else if (item.mark === "unverified") counts.unverified++;
      else if (item.mark === "ok") counts.ok++;
    }
  }
  return counts;
}
