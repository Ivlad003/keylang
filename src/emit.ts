// Graph → generated `map/<layer>.md` files and `.keylang/index.json`.

import type { Fn, Graph, Module } from "./graph.ts";

export const GENERATED_MARK = "<!-- keylang:generated — не редагувати, `keylang map` -->";

/** One Markdown document per layer, keyed by file name (`domain.md`). */
export function renderMap(graph: Graph): Map<string, string> {
  const out = new Map<string, string>();
  for (const layer of graph.layers) {
    let s = `${GENERATED_MARK}\n\n# map\n\n- ${layer.name}\n`;
    for (const m of sortModules(layer.modules)) s += renderModule(m, 1);
    out.set(`${layer.name}.md`, s);
  }
  return out;
}

function sortModules(ms: Module[]): Module[] {
  return [...ms].sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name, "en") || a.line! - b.line!);
}

function renderModule(m: Module, depth: number): string {
  const pad = "  ".repeat(depth);
  let head = m.path && m.line !== null ? `[${m.name}](${m.path}#L${m.line})` : m.name;
  if (m.comment) head += ` <!-- ${m.comment} -->`;
  let s = `${pad}- module ${head}\n`;
  for (const d of m.deps) s += `${pad}  - ${d.alias} ${d.target}\n`;
  const items: { line: number; text: string }[] = [];
  for (const f of m.fns) items.push({ line: f.line, text: renderFn(m, f, depth + 1) });
  for (const t of m.types) {
    let head = `[${t.name}](${m.path}#L${t.line})`;
    if (t.signature) head += ` ${t.signature}`;
    if (!t.exported) head += " <!-- internal -->";
    items.push({ line: t.line, text: `${pad}  - type ${head}\n` });
  }
  for (const c of m.children) items.push({ line: c.line ?? 0, text: renderModule(c, depth + 1) });
  items.sort((a, b) => a.line - b.line);
  for (const i of items) s += i.text;
  return s;
}

function renderFn(m: Module, f: Fn, depth: number): string {
  const pad = "  ".repeat(depth);
  let head = `[${f.name}](${m.path}#L${f.line})`;
  if (f.signature) head += ` ${f.signature}`;
  if (!f.exported) head += " <!-- internal -->";
  let s = `${pad}- fn ${head}\n`;
  if (f.calls.length > 0) s += `${pad}  - calls ${f.calls.map((c) => c.target).join(", ")}\n`;
  return s;
}

export interface IndexJson {
  version: 1;
  generated: string;
  languages: string[];
  stats: Graph["stats"];
  files: Record<string, { layer: string; module: string }>;
  nodes: Record<string, IndexNode>;
}

export interface IndexNode {
  kind: "layer" | "module" | "fn" | "type";
  layer: string;
  file: string | null;
  line: number | null;
  endLine?: number;
  signature?: string | null;
  exported?: boolean;
  deps?: string[];
  dependents?: string[];
  calls?: string[];
  callers?: string[];
  precision: "syntactic";
}

export function buildIndex(graph: Graph, languages: string[]): IndexJson {
  const nodes: Record<string, IndexNode> = {};
  const files: Record<string, { layer: string; module: string }> = {};
  const visit = (m: Module): void => {
    nodes[m.id] = {
      kind: "module",
      layer: m.layer,
      file: m.path,
      line: m.line,
      deps: m.deps.map((d) => d.target),
      dependents: [],
      precision: "syntactic",
    };
    if (m.path && !m.synthetic && !files[m.path]) files[m.path] = { layer: m.layer, module: m.id };
    for (const f of m.fns) {
      nodes[f.id] = {
        kind: "fn",
        layer: m.layer,
        file: m.path,
        line: f.line,
        endLine: f.endLine,
        signature: f.signature,
        exported: f.exported,
        calls: f.calls.map((c) => c.target),
        callers: [],
        precision: "syntactic",
      };
    }
    for (const t of m.types) {
      nodes[t.id] = { kind: "type", layer: m.layer, file: m.path, line: t.line, signature: t.signature, exported: t.exported, precision: "syntactic" };
    }
    for (const c of m.children) visit(c);
  };
  for (const l of graph.layers) {
    nodes[l.name] = { kind: "layer", layer: l.name, file: null, line: null, precision: "syntactic" };
    for (const m of l.modules) visit(m);
  }
  for (const [id, n] of Object.entries(nodes)) {
    for (const d of n.deps ?? []) nodes[d]?.dependents?.push(id);
    for (const c of n.calls ?? []) nodes[c]?.callers?.push(id);
  }
  return { version: 1, generated: new Date().toISOString(), languages, stats: graph.stats, files, nodes };
}
