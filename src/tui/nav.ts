// The navigation panel: layers → modules → members from the snapshot, then
// flows and rules from the specs with their worst mark. Items point at the
// spec line that declares them and, for code entities, at the code. The tree
// is indexed once per analysis; each frame only lists the expanded part.
//
// Layer: TUI. `view.ts` draws `navItems`; `zoom.ts` reuses `codeTree`.
// Item keys (`l:`, `m:`, `f:`, `w:`, `r:`) are stable across analyses, so the
// set of expanded keys survives a rescan.

import type { Analysis } from "../analyze.ts";
import { kindLabel, sectionNodes, walk, type Node } from "../ir.ts";
import { compareText } from "../span.ts";
import { evidenceOf, worse, type LineEvidence, type Mark } from "./evidence.ts";

/** A place in a file: the spec line or the code line an item opens. */
export interface Place {
  file: string;
  /** 1-based. */
  line: number;
}

/** One row of the panel: a heading, a code entity, a flow or a rule, with its places and mark. */
export interface NavItem {
  key: string;
  depth: number;
  label: string;
  kind: "heading" | "layer" | "module" | "fn" | "type" | "flow" | "rule";
  id: string | null;
  spec: Place | null;
  code: Place | null;
  mark: Mark | null;
  /** Has children; `expanded` says whether they are listed. */
  parent: boolean;
  expanded: boolean;
}

/** The panel's index of one analysis: layers, the code tree, and the flow and rule rows. */
interface Tree {
  layers: string[];
  /** Direct children (members and nested modules) by module id, and top modules by layer. */
  children: Map<string, string[]>;
  flows: NavItem[];
  rules: NavItem[];
}

/** The code part of `Tree`, read-only for its readers. */
export interface CodeTree {
  layers: readonly string[];
  children: ReadonlyMap<string, readonly string[]>;
}

// One tree per analysis; a new analysis is a new key, so nothing has to be invalidated.
const trees = new WeakMap<Analysis, Tree>();

/** The worst evidence mark on the spec lines `[from, to]`, both inclusive. */
function markOver(evidence: Map<number, LineEvidence>, from: number, to: number): Mark | null {
  let mark: Mark | null = null;

  for (const [line, item] of evidence) if (line >= from && line <= to) mark = worse(mark, item.mark);

  return mark;
}

/** The last line a node or any of its nested items starts on. */
function lastLine(node: Node): number {
  let end = node.span.start.line;
  walk(node, (child) => {
    end = Math.max(end, child.span.start.line);
  });

  return end;
}

/** A section heading row (LAYERS, FLOWS, RULES); always expanded, never selectable as an entity. */
function heading(key: string, label: string): NavItem {
  return { key, depth: 0, label, kind: "heading", id: null, spec: null, code: null, mark: null, parent: false, expanded: true };
}

/** The panel's index for `analysis`, built once and cached. */
function treeOf(analysis: Analysis): Tree {
  const cached = trees.get(analysis);

  if (cached) return cached;
  const nodes = analysis.snapshot?.nodes ?? {};
  const children = new Map<string, string[]>();

  const push = (parent: string, id: string): void => {
    let list = children.get(parent);

    if (!list) children.set(parent, (list = []));
    list.push(id);
  };

  // Code tree: modules, fns and types under their parents, in sorted ID order so siblings list stably.
  for (const id of Object.keys(nodes).sort(compareText)) {
    const node = nodes[id]!;

    if (node.kind !== "module" && node.kind !== "fn" && node.kind !== "type") continue;
    const parent = id.slice(0, id.lastIndexOf("."));

    // A module's parent is the nearest module above it, else its layer (directories are not nodes).
    if (node.kind === "module") push(nodes[parent]?.kind === "module" ? parent : id.split(".")[0]!, id);
    else if (nodes[parent]?.kind === "module") push(parent, id);
  }

  const flows: NavItem[] = [];
  const rules: NavItem[] = [];

  // Spec rows from the hand-written docs only: each `# flow` section with the
  // worst mark up to the next heading, and each rule node with the worst mark over its lines.
  for (const doc of analysis.docs) {
    if (doc.generated !== null) continue;
    const evidence = evidenceOf(analysis, doc.path);
    doc.sections.forEach((section, index) => {
      const next = doc.sections[index + 1]?.heading?.span.start.line ?? Number.MAX_SAFE_INTEGER;
      const start = section.heading?.span.start.line ?? 1;

      if (section.kind === "flow" && section.name) {
        flows.push({ key: `w:${doc.path}:${start}`, depth: 1, label: section.name.value, kind: "flow", id: null, spec: { file: doc.path, line: start }, code: null, mark: markOver(evidence, start, next - 1), parent: false, expanded: false });
      }

      if (section.kind === "rules") {
        for (const node of sectionNodes(section)) {
          const label = `${kindLabel(node.kind)} ${node.refs.map((ref) => ref.text).join(node.kind === "layers" ? " < " : " ")}`.trim();
          rules.push({ key: `r:${doc.path}:${node.span.start.line}`, depth: 1, label, kind: "rule", id: null, spec: { file: doc.path, line: node.span.start.line }, code: null, mark: markOver(evidence, node.span.start.line, lastLine(node)), parent: false, expanded: false });
        }
      }
    });
  }

  // Only layers the snapshot knows, in config order.
  const tree = { layers: [...analysis.config.layers.keys()].filter((layer) => nodes[layer] !== undefined), children, flows, rules };
  trees.set(analysis, tree);

  return tree;
}

/**
 * Layers in the map's order and the direct children of every layer, module
 * and class (top modules of a layer; nested modules and members of a
 * module): one index for this panel and the zoom screen (`zoom.ts`).
 */
export function codeTree(analysis: Analysis): CodeTree {
  const tree = treeOf(analysis);

  return { layers: tree.layers, children: tree.children };
}

/** Visible items for the expanded keys. Layers start expanded unless `-<key>` collapses them. */
export function navItems(analysis: Analysis | null, expanded: ReadonlySet<string>): NavItem[] {
  if (!analysis) return [];
  const tree = treeOf(analysis);
  const nodes = analysis.snapshot?.nodes ?? {};

  /** Where the spec declares `id`, or null when no spec names it. */
  const specPlace = (id: string): Place | null => {
    const found = analysis.index.lookup(id);

    return found.kind === "missing" ? null : { file: found.decl.file, line: found.decl.span.start.line };
  };

  const out: NavItem[] = [];

  // Depth-first: a module row, then (when expanded) its nested modules and members in index order.
  const addModule = (id: string, depth: number, base: string): void => {
    const node = nodes[id]!;
    const key = `m:${id}`;
    const children = tree.children.get(id) ?? [];
    const open = expanded.has(key);
    out.push({ key, depth, label: id.slice(base.length + 1), kind: "module", id, spec: specPlace(id), code: node.file ? { file: node.file, line: node.line ?? 1 } : null, mark: null, parent: children.length > 0, expanded: open });

    if (!open) return;

    for (const child of children) {
      const facts = nodes[child]!;

      if (facts.kind === "module") {
        addModule(child, depth + 1, id);
        continue;
      }

      out.push({ key: `f:${child}`, depth: depth + 1, label: `${facts.kind} ${child.slice(id.length + 1)}`, kind: facts.kind === "fn" ? "fn" : "type", id: child, spec: specPlace(child), code: facts.file ? { file: facts.file, line: facts.line ?? 1 } : null, mark: null, parent: false, expanded: false });
    }
  };

  // The layers section; a layer is open unless its `-l:` key collapses it.
  if (tree.layers.length > 0) out.push(heading("h:layers", "LAYERS"));

  for (const layer of tree.layers) {
    const key = `l:${layer}`;
    const open = !expanded.has(`-${key}`);
    out.push({ key, depth: 0, label: layer, kind: "layer", id: layer, spec: specPlace(layer), code: null, mark: null, parent: true, expanded: open });

    if (open) for (const id of tree.children.get(layer) ?? []) addModule(id, 1, layer);
  }

  if (tree.flows.length > 0) out.push(heading("h:flows", "FLOWS"), ...tree.flows);

  if (tree.rules.length > 0) out.push(heading("h:rules", "RULES"), ...tree.rules);

  return out;
}
