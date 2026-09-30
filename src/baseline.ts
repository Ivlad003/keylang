// `keylang/rules.baseline.md`: deny rules for the dependencies the current
// graph does not have, so a new edge between layers or a new package is K102.
// The grammar is the ordinary `deny` / `allow`. Point `allow`s name packages
// the layer already imports, and they beat `deny <layer> external`.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { sourceInputProblems, sourceInputs, type SourceInputs } from "./map.ts";
import { isGeneratedText, landing, writeAtomic, writeProblem } from "./safe-write.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** First line of the generated file. `check` still reads it: it is not under `map/`. */
export const BASELINE_MARK = "<!-- keylang:generated — не редагувати, `keylang baseline` -->";

const EDGE_KINDS = new Set(["import", "call", "type", "reexport"]);

/**
 * Baseline rules for one snapshot. Layers come from `keylang.json`, in code-unit
 * order; `unassigned` is a source only when a module is in it. Targets include
 * `external` and `unassigned`. A layer that already imports packages gets
 * `deny <layer> external` plus one `allow` per package.
 */
export function baselineText(snapshot: AnalysisSnapshot): string {
  const configured = Object.keys(snapshot.manifest.config.layers).sort(compareText);
  const hasUnassigned = Object.values(snapshot.nodes).some((node) => node.kind === "module" && node.layer === "unassigned");
  const sources = hasUnassigned ? [...configured, "unassigned"].sort(compareText) : configured;
  const universe = [...new Set([...sources, "external", "unassigned"])].sort(compareText);
  const layerOf = new Map<string, string>();
  for (const [id, node] of Object.entries(snapshot.nodes)) layerOf.set(id, node.layer);

  const depends = new Map<string, Set<string>>(sources.map((layer) => [layer, new Set()]));
  const packages = new Map<string, Set<string>>(sources.map((layer) => [layer, new Set()]));
  for (const edge of snapshot.edges) {
    if (!EDGE_KINDS.has(edge.kind) || edge.resolution !== "resolved" || edge.target === null) continue;
    const from = layerOf.get(edge.source);
    const to = layerOf.get(edge.target);
    if (from === undefined || to === undefined || from === to || !depends.has(from)) continue;
    depends.get(from)!.add(to);
    if (to === "external") {
      const pkg = externalModule(snapshot, edge.target);
      if (pkg !== null) packages.get(from)!.add(pkg);
    }
  }

  const lines = [BASELINE_MARK, "", "# rules", ""];
  for (const source of sources) {
    const used = depends.get(source)!;
    const pkgs = [...packages.get(source)!].sort(compareText);
    const targets = universe.filter((layer) => layer !== source && !used.has(layer) && !(layer === "external" && pkgs.length > 0));
    if (targets.length > 0) lines.push(`- deny ${source} ${targets.join(", ")}`);
    if (pkgs.length > 0) {
      lines.push(`- deny ${source} external`);
      for (const pkg of pkgs) lines.push(`- allow ${source} ${pkg}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** The external module an id belongs to (`external.stripe` for a symbol under it). */
function externalModule(snapshot: AnalysisSnapshot, id: string): string | null {
  let cur = id;
  for (;;) {
    const node = snapshot.nodes[cur];
    if (node?.kind === "module" && node.layer === "external") return cur;
    const dot = cur.lastIndexOf(".");
    if (dot === -1) return null;
    cur = cur.slice(0, dot);
  }
}

/** Where the baseline lives: `<dir>/rules.baseline.md`, relative to the root, POSIX. */
export function baselinePath(config: Pick<Config, "dir">): string {
  return `${config.dir}/rules.baseline.md`;
}

/**
 * What `keylang baseline` would do, computed before anything is written.
 * Internal to one operation — not a stored format.
 */
export interface BaselinePlan {
  config: Config;
  /** `<dir>/rules.baseline.md`. */
  path: string;
  /** The new text. */
  text: string;
  /** The file as it is now, or null when there is none: the commit expects exactly these bytes. */
  current: string | null;
  /**
   * `current`: the file already holds the text (CRLF read as LF, as a checkout
   * may have it); `stale`: it is missing or differs; `manual`: it exists
   * without the keylang:generated marker, so only a person writes it.
   */
  state: "current" | "stale" | "manual";
  /** Rule lines the new text adds and drops, against the file on disk: how the allowed architecture changes. */
  added: string[];
  removed: string[];
  inputs: SourceInputs;
}

/** Plans the baseline of `snapshot` against the file on disk. Reads, writes nothing. */
export function planBaseline(config: Config, snapshot: AnalysisSnapshot): BaselinePlan {
  const path = baselinePath(config);
  const text = baselineText(snapshot);
  const current = readOrNull(join(config.root, path));
  const state = current === null ? "stale" : !isGeneratedText(current) ? "manual" : current.replace(/\r\n/g, "\n") === text ? "current" : "stale";
  const before = new Set(ruleLines(current ?? ""));
  const after = new Set(ruleLines(text));
  return {
    config,
    path,
    text,
    current,
    state,
    added: [...after].filter((line) => !before.has(line)),
    removed: [...before].filter((line) => !after.has(line)),
    inputs: sourceInputs(config, snapshot.manifest.files),
  };
}

/**
 * Why the plan may not be committed now (`path: reason` lines; empty when it
 * may): the target must pass the repository's write rules and still hold the
 * bytes the plan saw, and `keylang.json` and the sources must be the ones the
 * baseline was computed from.
 */
export function baselinePlanProblems(plan: BaselinePlan): string[] {
  const problems: string[] = [];
  const problem = writeProblem(plan.config.root, plan.path, { generated: true, expect: plan.current });
  if (problem !== null) problems.push(`${plan.path}: ${problem}`);
  // A manual file written meanwhile is refused by `expect`; one there from the start never reaches the commit.
  return [...problems, ...sourceInputProblems(plan.config, plan.inputs, "the baseline")];
}

/** Writes the planned text atomically at the target (a link inside the repository is followed; CRLF of the old file kept). Throws on an I/O error. */
export function commitBaseline(plan: BaselinePlan): void {
  const abs = landing(join(plan.config.root, plan.path));
  if (abs === null) throw new Error(`${plan.path}: leads through a loop of links`);
  writeAtomic(abs, plan.text);
}

/** The `- deny` / `- allow` lines of a rules text, in order. */
function ruleLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => /^- (?:deny|allow) /.test(line));
}

function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}
