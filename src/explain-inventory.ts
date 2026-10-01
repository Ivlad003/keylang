// Which explanations need work, without asking a model or writing a file:
// the stale and gone saved explanations (`explain --stale`), and the plan of
// a brief batch (`explain --missing|--stale` without `--llm`) with its
// dry-run size. One result for the CLI and the TUI; the batch itself asks
// the model through `runBriefs` (`explain-llm.ts`).

import type { Analysis } from "./analyze.ts";
import { currentBaseline, estimateTokens, explainedIds, isStale, planBriefs, readExplanation, type BriefBatch, type BriefLevel, type PlannedBrief } from "./explain-llm.ts";
import { explanationPath, loadBriefs, snapshotBaseline } from "./explanations.ts";
import { EXTERNAL } from "./graph.ts";
import { plannedDecl } from "./lsp-features.ts";

/** Requests a batch keeps in flight: enough to be quick, few enough for a provider's rate limit. */
export const DEFAULT_BRIEF_JOBS = 4;

/** The CLI's complaint about `--limit`/`--jobs` text that is not a whole number of at least 1, or null when it is one. */
export function positiveIntegerProblem(flag: string, text: string): string | null {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 ? null : `${flag} must be a positive whole number, got \`${text}\``;
}

/** Where a node is declared: its code, or the `planned` line of a spec; null for a node with no file (a layer). */
export interface NodePlace {
  /** Relative to the root, POSIX. */
  file: string;
  /** 1-based. */
  line: number;
  col: number;
}

/** A saved explanation that no longer matches the code: `stale` (the closure changed) or `gone` (the ID is in no snapshot and no `planned`). */
export interface StaleExplanation {
  id: string;
  /** A short/full answer (`<dir>/explain/<id>.md`) or a brief of the explained map (`brief/<id>.md`). */
  kind: "answer" | "brief";
  state: "stale" | "gone";
  /** `YYYY-MM-DD` of the saved explanation. */
  date: string;
  /** The saved file, relative to the root. */
  file: string;
  /** The CLI's command that asks again; null for a gone ID, which nothing generates. */
  again: string | null;
  /** The node, when the analysis knows where it is; null for a gone ID. */
  place: NodePlace | null;
}

/** `explain --stale`: every saved answer, then every saved brief, that is stale or gone. */
export interface StaleInventory {
  entries: StaleExplanation[];
  /** Saved answers and briefs read; the ones not listed are fresh. */
  saved: number;
}

/** One node of a brief plan, with why it is planned. */
export interface PlannedBriefEntry extends PlannedBrief {
  /** No brief yet, or a brief whose closure changed. */
  reason: "missing" | "stale";
  place: NodePlace | null;
}

/**
 * A brief batch as it would run, computed before any request: the nodes
 * bottom-up (`wave`), counts by level and, when asked, an approximate size
 * in tokens. A preview: a batch plans again on its own analysis.
 */
export interface BriefPlan {
  batch: BriefBatch;
  /** `--limit`; null for every candidate. */
  limit: number | null;
  /** `--jobs` a batch would keep in flight within a wave. */
  jobs: number;
  /** Candidates before the limit. */
  candidates: number;
  /** After the limit, in the order a batch asks. */
  plan: PlannedBriefEntry[];
  counts: Record<BriefLevel, number>;
  /** Waves of the plan in order: a wave only needs briefs of earlier ones. */
  waves: { level: BriefLevel; ids: string[] }[];
  /** About four characters a token in, about 80 tokens a brief out; not an API cost. Null when not asked for. */
  estimate: { input: number; output: number } | null;
  /** Nodes left out because their code has a doc comment, and because their brief is fresh. */
  skipped: { documented: number; fresh: number };
  /** Saved briefs whose ID is gone: `explain --stale` lists them; a batch never asks for them. */
  gone: string[];
}

function nodePlace(analysis: Analysis, id: string): NodePlace | null {
  const node = analysis.snapshot?.nodes[id];
  if (node?.file) return { file: node.file, line: node.line ?? 1, col: node.col ?? 1 };
  if (node) return null;
  const planned = plannedDecl(analysis.docs, id);
  return planned === null ? null : { file: planned.file, line: planned.line, col: planned.col };
}

/** The saved answers and briefs that are stale or gone, in the CLI's order. */
export function staleInventory(analysis: Analysis): StaleInventory {
  const entries: StaleExplanation[] = [];
  let saved = 0;
  for (const kind of ["answer", "brief"] as const) {
    for (const id of explainedIds(analysis.config, kind === "brief" ? "briefs" : "answers")) {
      const e = readExplanation(analysis.config, id, kind === "brief" ? "brief" : "short");
      if (!e) continue;
      saved++;
      const file = explanationPath(analysis.config, id, e.detail);
      if (currentBaseline(analysis, id) === null) entries.push({ id, kind, state: "gone", date: e.date, file, again: null, place: null });
      else if (isStale(analysis, id, e)) entries.push({ id, kind, state: "stale", date: e.date, file, again: `keylang explain ${id} --llm${kind === "brief" ? " --brief" : ""}`, place: nodePlace(analysis, id) });
    }
  }
  return { entries, saved };
}

/** `explain --stale` on stdout, byte for byte. */
export function staleInventoryText(inventory: StaleInventory): string {
  return inventory.entries
    .map((entry) => {
      const what = entry.kind === "brief" ? `${entry.id} (brief)` : entry.id;
      return entry.state === "gone" ? `${what}: gone (explained ${entry.date})\n` : `${what}: stale (explained ${entry.date}); run \`${entry.again}\`\n`;
    })
    .join("");
}

/** The plan of a brief batch on `analysis` (which must have a snapshot), cut to `limit` before the estimate. */
export function briefPlan(analysis: Analysis, options: { batch: BriefBatch; limit: number | null; jobs: number; estimate: boolean }): BriefPlan {
  const snapshot = analysis.snapshot;
  const briefs = loadBriefs(analysis.config);
  const all = planBriefs(analysis, options.batch, briefs);
  const planned = options.limit === null ? all : all.slice(0, options.limit);
  const plan = planned.map((entry): PlannedBriefEntry => ({ ...entry, reason: briefs.has(entry.id) ? "stale" : "missing", place: nodePlace(analysis, entry.id) }));
  const counts: Record<BriefLevel, number> = { "fn/type": 0, "class/module": 0, layer: 0 };
  const waves: { level: BriefLevel; ids: string[] }[] = [];
  let wave: number | null = null;
  for (const entry of plan) {
    counts[entry.level]++;
    if (entry.wave !== wave) waves.push({ level: entry.level, ids: [] });
    wave = entry.wave;
    waves.at(-1)!.ids.push(entry.id);
  }
  let documented = 0;
  let fresh = 0;
  for (const [id, node] of Object.entries(snapshot?.nodes ?? {})) {
    if (node.layer === EXTERNAL) continue;
    if (node.doc) documented++;
    else if (briefs.has(id) && snapshotBaseline(snapshot!, id) === briefs.get(id)!.closure) fresh++;
  }
  const gone = [...briefs.keys()].filter((id) => currentBaseline(analysis, id) === null);
  return {
    batch: options.batch,
    limit: options.limit,
    jobs: options.jobs,
    candidates: all.length,
    plan,
    counts,
    waves,
    estimate: options.estimate ? estimateTokens(analysis, planned, briefs) : null,
    skipped: { documented, fresh },
    gone,
  };
}

/** The CLI's stdout of a plan: the dry-run counts and estimate, or the nodes one per line. */
export function briefPlanText(plan: BriefPlan): string {
  if (plan.estimate === null) return plan.plan.map((entry) => `${entry.id} (${entry.level})\n`).join("");
  const { counts, estimate } = plan;
  return `would explain ${plan.plan.length} node(s): ${counts["fn/type"]} fn/type, ${counts["class/module"]} class/module, ${counts.layer} layer\nestimated tokens: ~${estimate.input} in, ~${estimate.output} out\n`;
}
