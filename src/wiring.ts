// `# wiring` (ADR 0003): each `wire <id>` is a factory, its children the
// named dependencies it is built from. The graph must be acyclic: its
// topological order is the order `keylang wire` initializes in. Checks here
// read specs and snapshot nodes only; the generated code is checked as code.

import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, type Document, type Token } from "./ir.ts";
import { languageOf } from "./languages.ts";
import { denyingRule } from "./rules.ts";
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

/** What the wiring checks read of the snapshot; `check` does not import `map`. */
export interface WiringView {
  /** The kind of every node, a class told apart as `class`. */
  kinds: ReadonlyMap<string, string>;
  nodes: Readonly<Record<string, { file: string | null; static?: true; name?: string }>>;
  /** The public exports table: `symbol` is the ID an exported name stands for. */
  exports: readonly { module: string; name: string; symbol: string | null; form?: string }[];
}

/**
 * How the generated file imports a factory: from its file, by its exported
 * name (`default` for a default export). A static method is called on its
 * imported class: `member` is its name as written.
 */
export interface WireImport {
  file: string;
  name: string;
  member?: string;
}

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
            const m = CONDITION.exec(conditionText(option.tokens));
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

/**
 * The condition of `- when <condition> → <id>` as written: the tokens between
 * the keyword and the arrow, touching ones joined. The IR's canonical text
 * puts a space after a comma, but the value is compared with the variable
 * as it is: `env.DB = a,b` means the value `a,b`.
 */
function conditionText(tokens: readonly Token[]): string {
  const arrow = tokens.findIndex((t) => t.text === "→" || t.text === "->");
  let out = "";
  let previous: Token | undefined;
  for (const t of tokens.slice(1, arrow === -1 ? tokens.length : arrow)) {
    if (previous !== undefined && previous.span.end.offset !== t.span.start.offset) out += " ";
    out += t.text;
    previous = t;
  }
  return out;
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

/**
 * The import the generated file needs for `id`, read from the exports table;
 * a reason instead when no import can reach it: code of a language `wire`
 * does not generate for, a method (static or not, the snapshot does not
 * say), a name its module does not export.
 */
export function wireImport(view: WiringView, id: string): WireImport | { problem: string } {
  const file = view.nodes[id]?.file ?? null;
  if (file === null) return { problem: "has no source file" };
  const language = languageOf(file);
  if (language !== "typescript" && language !== "javascript") return { problem: `is ${language ?? "not TS/JS"} code (${file}); \`keylang wire\` generates TypeScript and imports TS/JS only` };
  const parent = id.slice(0, id.lastIndexOf("."));
  const own = id.slice(id.lastIndexOf(".") + 1);
  if (view.kinds.get(parent) === "class") {
    // A static method is a factory called on its class; an instance method needs an instance nobody built.
    if (view.nodes[id]?.static !== true) return { problem: `is an instance method of the class \`${parent}\`; wire a module-level fn, a static method or the class` };
    const cls = exportedAs(view, parent);
    if (cls === null) return { problem: `is a static method of \`${parent}\`, which ${file} does not export; the generated file cannot import it` };
    return { file, name: cls, member: view.nodes[id]?.name ?? own };
  }
  const name = exportedAs(view, id);
  if (name === null) return { problem: `is not exported by ${file}; the generated file cannot import it` };
  return { file, name };
}

/** The name a symbol is imported by from its own module (`default` for a default export), or null when it is not exported. */
function exportedAs(view: WiringView, id: string): string | null {
  const module = id.slice(0, id.lastIndexOf("."));
  const own = id.slice(id.lastIndexOf(".") + 1);
  const rows = view.exports.filter((row) => row.module === module && row.symbol === id);
  const row = rows.find((r) => r.form === undefined && r.name === own) ?? rows.find((r) => r.form === "alias") ?? rows.find((r) => r.form === "default");
  return row === undefined ? null : row.form === "default" ? "default" : row.name;
}

/**
 * K301 for a cycle; K302 for a factory that is not a fn or class, a decorator
 * that is not a fn, or one the generated file cannot import; K002 for a
 * dependency name given twice; K102 for a dependency `deny` forbids.
 */
export function checkWiring(docs: readonly Document[], view: WiringView | null): Diagnostic[] {
  const { wires, diagnostics } = collectWiring(docs);
  if (wires.length === 0) return diagnostics;
  const seen = new Set<string>();
  for (const w of wires) {
    if (seen.has(w.target)) diagnostics.push(diagnostic("K002", w.file, w.span, `\`${w.target}\` is wired twice`));
    seen.add(w.target);
    const names = new Set<string>();
    for (const d of w.deps) {
      // The argument object would have the key twice: the second silently wins.
      if (names.has(d.name)) diagnostics.push(diagnostic("K002", w.file, d.span, `dependency \`${d.name}\` of \`${w.target}\` is named twice`));
      names.add(d.name);
    }
  }
  const order = wireOrder(wires);
  if ("cycle" in order) {
    const first = wires.find((w) => w.target === order.cycle[0])!;
    diagnostics.push(diagnostic("K301", first.file, first.span, `wiring cycle ${order.cycle.join(" → ")}: a factory would get a dependency that is not built yet`));
  }
  const uses = (w: Wire): { id: string; span: Span; role: string }[] => [
    { id: w.target, span: w.span, role: "wire" },
    ...w.deps.flatMap((d) => [
      { id: d.target, span: d.span, role: "dependency" },
      ...d.when.map((c) => ({ id: c.target, span: c.span, role: "dependency" })),
      ...d.compose.map((c) => ({ id: c.target, span: c.span, role: "compose" })),
    ]),
  ];
  for (const w of wires) {
    if (view) {
      for (const use of uses(w)) {
        const problem = useProblem(view, use.id, use.role);
        if (problem !== null) diagnostics.push(diagnostic("K302", w.file, use.span, `${use.role} \`${use.id}\` ${problem}`));
      }
    }
    for (const d of w.deps) {
      for (const target of [d.target, ...d.when.map((c) => c.target), ...d.compose.map((c) => c.target)]) {
        const rule = denyingRule(docs, w.target, target);
        if (rule) diagnostics.push(diagnostic("K102", w.file, d.span, `divergence: wiring \`${w.target}\` depends on \`${target}\`, which is denied by \`${rule.text}\` (${rule.file}:${rule.line})`));
      }
    }
  }
  return diagnostics;
}

/** Why the generated file could not build or apply `id` in this role, or null; a missing ID is K001 from the resolver. */
function useProblem(view: WiringView, id: string, role: string): string | null {
  const kind = view.kinds.get(id);
  if (kind === undefined) return null;
  if (role === "compose" && kind !== "fn") return `is a ${kind}; a decorator must be a fn of one argument`;
  if (kind !== "fn" && kind !== "class") return `is a ${kind}; a factory must be a fn or a class`;
  const found = wireImport(view, id);
  return "problem" in found ? found.problem : null;
}
