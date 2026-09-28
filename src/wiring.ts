// `# wiring` (ADR 0003): each `wire <id>` is a factory, its children the
// named dependencies it is built from. The graph must be acyclic: its
// topological order is the order `keylang wire` initializes in. Checks here
// read specs and snapshot nodes only; the generated code is checked as code.

import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, type Document } from "./ir.ts";
import { blocksDependency } from "./rules.ts";
import type { Span } from "./span.ts";

export interface WireDep {
  /** Name of the dependency in the factory's argument object. */
  name: string;
  /** Default implementation. */
  target: string;
  /** `when env.NAME = value → id`, in the order written. */
  when: { env: string; value: string; target: string; span: Span }[];
  /** `compose id` decorators, innermost first. */
  compose: { target: string; span: Span }[];
  span: Span;
}

export interface Wire {
  target: string;
  deps: WireDep[];
  file: string;
  span: Span;
}

/** The kind of a snapshot node, for the target check; null without a snapshot. */
export type NodeKinds = ReadonlyMap<string, string> | null;

const CONDITION = /^env\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)$/;

/** Wires of every `# wiring` section, with K005 for a malformed `when` condition. */
export function collectWiring(docs: readonly Document[]): { wires: Wire[]; diagnostics: Diagnostic[] } {
  const wires: Wire[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "wiring") continue;
      for (const node of sectionNodes(section)) {
        const target = node.kind === "wire" ? node.refs[0]?.target : undefined;
        if (!target) continue;
        const deps: WireDep[] = [];
        for (const child of node.children) {
          const depTarget = child.kind === "wire-dep" ? child.refs[0]?.target : undefined;
          if (!child.name || !depTarget) continue;
          const dep: WireDep = { name: child.name.value, target: depTarget, when: [], compose: [], span: child.span };
          for (const option of child.children) {
            const optionTarget = option.refs[0]?.target;
            if (!optionTarget) continue;
            if (option.kind === "compose") dep.compose.push({ target: optionTarget, span: option.span });
            if (option.kind !== "when") continue;
            const m = CONDITION.exec(option.text?.value.trim() ?? "");
            if (m) dep.when.push({ env: m[1]!, value: m[2]!, target: optionTarget, span: option.span });
            else diagnostics.push(diagnostic("K005", doc.path, option.text?.span ?? option.span, "a wiring condition must be `env.NAME = value`"));
          }
          deps.push(dep);
        }
        wires.push({ target, deps, file: doc.path, span: node.span });
      }
    }
  }
  return { wires, diagnostics };
}

export type WireOrder = { order: string[] } | { cycle: string[] };

/**
 * Dependencies before dependents, depth first in declaration order; an ID
 * without its own `wire` is a leaf. The first cycle found otherwise.
 */
export function wireOrder(wires: readonly Wire[]): WireOrder {
  const byId = new Map(wires.map((w) => [w.target, w]));
  const state = new Map<string, "visiting" | "done">();
  const order: string[] = [];
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...path.slice(path.indexOf(id)), id];
    state.set(id, "visiting");
    path.push(id);
    for (const dep of byId.get(id)?.deps ?? []) {
      for (const target of [dep.target, ...dep.when.map((w) => w.target)]) {
        const cycle = visit(target);
        if (cycle) return cycle;
      }
    }
    path.pop();
    state.set(id, "done");
    order.push(id);
    return null;
  };
  for (const w of wires) {
    const cycle = visit(w.target);
    if (cycle) return { cycle };
  }
  return { order };
}

/** K301 for a cycle, K302 for a factory that is not a fn or class, K102 for a dependency `deny` forbids. */
export function checkWiring(docs: readonly Document[], kinds: NodeKinds): Diagnostic[] {
  const { wires, diagnostics } = collectWiring(docs);
  if (wires.length === 0) return diagnostics;
  const seen = new Set<string>();
  for (const w of wires) {
    if (seen.has(w.target)) diagnostics.push(diagnostic("K002", w.file, w.span, `\`${w.target}\` is wired twice`));
    seen.add(w.target);
  }
  const order = wireOrder(wires);
  if ("cycle" in order) {
    const first = wires.find((w) => w.target === order.cycle[0])!;
    diagnostics.push(diagnostic("K301", first.file, first.span, `wiring cycle ${order.cycle.join(" → ")}: a factory would get a dependency that is not built yet`));
  }
  const factories = (w: Wire): { id: string; span: Span; role: string }[] => [
    { id: w.target, span: w.span, role: "wire" },
    ...w.deps.flatMap((d) => [{ id: d.target, span: d.span, role: "dependency" }, ...d.when.map((c) => ({ id: c.target, span: c.span, role: "dependency" }))]),
  ];
  for (const w of wires) {
    if (kinds) {
      for (const f of factories(w)) {
        const kind = kinds.get(f.id);
        // A missing ID is K001 from the resolver; a class is a module node in the snapshot.
        if (kind !== undefined && kind !== "fn" && kind !== "class") diagnostics.push(diagnostic("K302", w.file, f.span, `${f.role} \`${f.id}\` is a ${kind}; a factory must be a fn or a class`));
      }
    }
    for (const d of w.deps) {
      for (const target of [d.target, ...d.when.map((c) => c.target), ...d.compose.map((c) => c.target)]) {
        if (blocksDependency(docs, w.target, target)) diagnostics.push(diagnostic("K102", w.file, d.span, `divergence: wiring \`${w.target}\` depends on \`${target}\`, which is denied`));
      }
    }
  }
  return diagnostics;
}
