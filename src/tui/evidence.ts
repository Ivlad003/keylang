// What the gutter shows for one spec line, from the shared analysis: the
// separate evidence channels and one mark over them. The mark is `ok` only
// when every reported criterion on the line is `ok`; `ID ✓` with a missing
// trace is `unverified`, never a plain ✓. `planned` is its own state.

import type { Analysis } from "../analyze.ts";
import type { Diagnostic } from "../diag.ts";
import { sectionNodes, walk, type Document } from "../ir.ts";

/** `question`: an open question of a flow (`- ? …`, c4-zoom/11), a mark of its own and no verdict. */
export type Mark = "ok" | "fail" | "unverified" | "planned" | "warning" | "question";

/** Evidence channels in display order; a flow step reports each one separately. */
export const CHANNELS = ["ID", "static", "tests", "trace"] as const;

export interface LineEvidence {
  mark: Mark;
  /** One entry per criterion reported on the line, in channel order, then the rest. */
  criteria: { criterion: string; verdict: "ok" | "fail" | "unverified"; message: string }[];
  diagnostics: Diagnostic[];
  /** The line declares `planned`: an intention, not a fact of the snapshot. */
  planned: boolean;
  /** The line is an open question (`- ? …`): no claim, a person answers it. */
  question?: true;
  /** A `parallel` line: no verdict of its own, the mark is the worst of its steps' lines; not counted in the totals. */
  group?: true;
}

const RANK: Record<Mark, number> = { fail: 4, unverified: 3, warning: 2, question: 1, planned: 1, ok: 0 };

export function worse(a: Mark | null, b: Mark | null): Mark | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

function linesOf(doc: Document, kind: "planned" | "question"): Set<number> {
  const lines = new Set<number>();
  for (const section of doc.sections) {
    for (const top of sectionNodes(section)) {
      walk(top, (node) => {
        if (node.kind === kind) lines.add(node.span.start.line);
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
  for (const doc of analysis.docs) {
    for (const line of linesOf(doc, "planned")) entry(doc.path, line).planned = true;
    for (const line of linesOf(doc, "question")) entry(doc.path, line).question = true;
  }
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
      if (item.question) mark = worse(mark, "question");
      item.mark = mark ?? "ok";
    }
  }
  groupMarks(analysis, byPath);
  cache.set(analysis, byPath);
  return byPath;
}

/** A `parallel` group (ADR 0023) shows the worst mark of the lines under it, so the gutter reads the group at a glance. */
function groupMarks(analysis: Analysis, byPath: Map<string, Map<number, LineEvidence>>): void {
  for (const doc of analysis.docs) {
    const lines = byPath.get(doc.path);
    if (!lines) continue;
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          const line = node.span.start.line;
          if (node.kind !== "parallel" || lines.has(line)) return;
          let mark: Mark | null = null;
          for (const child of node.children) {
            walk(child, (inner) => {
              mark = worse(mark, lines.get(inner.span.start.line)?.mark ?? null);
            });
          }
          if (mark !== null) lines.set(line, { mark, criteria: [], diagnostics: [], planned: false, group: true });
        });
      }
    }
  }
}

const EMPTY = new Map<number, LineEvidence>();

/** Evidence by 1-based line of one document. Lines with nothing reported are absent. */
export function evidenceOf(analysis: Analysis, path: string): Map<number, LineEvidence> {
  return allEvidence(analysis).get(path) ?? EMPTY;
}

export const MARK_GLYPH: Record<Mark, string> = { ok: "✓", fail: "✗", unverified: "◌", planned: "◇", warning: "!", question: "?" };

/** Totals for the status bar: failing, unverified and passing lines across all documents. */
export function totals(analysis: Analysis): { fail: number; unverified: number; ok: number } {
  const counts = { fail: 0, unverified: 0, ok: 0 };
  for (const lines of allEvidence(analysis).values()) {
    for (const item of lines.values()) {
      if (item.group) continue;
      if (item.mark === "fail") counts.fail++;
      else if (item.mark === "unverified") counts.unverified++;
      else if (item.mark === "ok") counts.ok++;
    }
  }
  return counts;
}
