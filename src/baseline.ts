// `keylang/rules.baseline.md`: deny rules for the dependencies the current
// graph does not have, so a new edge between layers or a new package is K102.
// The grammar is the ordinary `deny` / `allow`. Point `allow`s name packages
// the layer already imports, and they beat `deny <layer> external`.

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
