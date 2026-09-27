// Rules over a fresh analysis snapshot. Without a snapshot (a spec directory
// that has no code), rule results are unverified rather than a graph rebuilt
// from Markdown.

import { createHash } from "node:crypto";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, type Document, type Node } from "./ir.ts";
import type { Index } from "./resolve.ts";
import { cycleThrough, stronglyConnected } from "./scc.ts";
import type { Span } from "./span.ts";
import type { Verdict } from "./verdict.ts";

/** The slice of the snapshot rules need. Kept here so `check` does not import `map`. */
interface SnapshotView {
  snapshotId: string;
  nodes: Record<string, { kind: string; file: string | null; line: number | null }>;
  edges: { kind: string; source: string; target: string | null; file: string | null; line: number; col: number; resolution: string; reason?: string }[];
  coverage: { kind: string; file: string; line: number; col: number; reason: string; source: string | null }[];
  exports: { module: string; name: string; kind: string }[];
}

interface Rule {
  a: string;
  b: string[];
  file: string;
  span: Span;
  text: string;
}

interface UseEdge {
  from: string;
  to: string;
  kind: "import" | "call" | "type" | "reexport";
  file: string;
  line: number;
  col: number;
  resolution: string;
}

export const UNORDERED_LAYERS = new Set(["external", "unassigned"]);

export interface RuleReport {
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
}

export function checkRules(docs: readonly Document[], index: Index, snapshot: SnapshotView | null = null): Diagnostic[] {
  return evaluateRules(docs, index, snapshot).diagnostics;
}

/** Whether `from` depending on `to` is forbidden by the most specific deny rule. */
export function blocksDependency(docs: readonly Document[], from: string, to: string): boolean {
  const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const edge: UseEdge = { from, to, kind: "import", file: "", line: 1, col: 1, resolution: "resolved" };
  return specific(collectRules(docs), edge, within) === "deny";
}

export function evaluateRules(docs: readonly Document[], index: Index, snapshot: SnapshotView | null): RuleReport {
  const rules = collectRules(docs);
  if (!snapshot) {
    if (!rules.any) return { diagnostics: [], verdicts: [] };
    const file = docs[0]?.path ?? "keylang";
    const verdict: Verdict = {
      verdict: "unverified",
      criterion: "rules",
      area: file,
      snapshotId: null,
      specHash: hashText("no snapshot"),
      file,
      line: 1,
      col: 1,
      code: null,
      message: "no snapshot",
    };
    return { diagnostics: [], verdicts: [verdict] };
  }
  return evaluateOnSnapshot(rules, index, snapshot);
}

function evaluateOnSnapshot(rules: Collected, index: Index, snapshot: SnapshotView): RuleReport {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  const moduleOf = (id: string): string | null => {
    let cur = id;
    for (;;) {
      if (snapshot.nodes[cur]?.kind === "module") return cur;
      const dot = cur.lastIndexOf(".");
      if (dot === -1) return null;
      cur = cur.slice(0, dot);
    }
  };
  const layerOf = (id: string): string => id.split(".")[0] ?? id;
  const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const edges: UseEdge[] = [];
  for (const edge of snapshot.edges) {
    if (edge.kind !== "import" && edge.kind !== "reexport" && edge.kind !== "call" && edge.kind !== "type") continue;
    if (!edge.target || !edge.file) continue;
    const from = moduleOf(edge.source);
    const to = moduleOf(edge.target);
    if (!from || !to || from === to) continue;
    edges.push({
      from,
      to,
      kind: edge.kind,
      file: edge.file,
      line: edge.line,
      col: edge.col,
      resolution: edge.resolution,
    });
  }
  const modules = new Set<string>();
  for (const [id, node] of Object.entries(snapshot.nodes)) if (node.kind === "module") modules.add(id);

  const holesIn = (moduleId: string): string[] => {
    const file = snapshot.nodes[moduleId]?.file;
    return snapshot.coverage
      .filter((item) => item.kind !== "skipped-file" && (item.source === moduleId || item.source?.startsWith(`${moduleId}.`) || (file !== null && file !== undefined && item.file === file)))
      .map((item) => `${item.reason} (${item.file}:${item.line})`);
  };
  const holeIn = (moduleId: string): string | null => {
    const holes = holesIn(moduleId);
    return holes.find((item) => item.startsWith("unresolved import")) ?? holes[0] ?? null;
  };

  const pushFail = (code: Diagnostic["code"], file: string, line: number, col: number, message: string, criterion: string, area: string): void => {
    const span: Span = { start: { offset: 0, line, col }, end: { offset: 0, line, col: col + 1 } };
    diagnostics.push(diagnostic(code, file, span, message));
    verdicts.push(base(snapshot, criterion, area, "fail", file, line, col, code, message));
  };
  const pushUnverified = (file: string, line: number, col: number, criterion: string, area: string, reason: string): void => {
    verdicts.push(base(snapshot, criterion, area, "unverified", file, line, col, null, reason));
  };

  const reported = new Set<string>();
  let sawDenyFail = false;
  for (const edge of edges) {
    if (edge.resolution !== "resolved") continue;
    const key = `${edge.from}\0${edge.to}`;
    if (reported.has(key)) continue;
    const verdict = specific(rules, edge, within);
    if (verdict === "deny") {
      reported.add(key);
      sawDenyFail = true;
      pushFail("K102", edge.file, edge.line, edge.col, `divergence: \`${edge.from}\` depends on \`${edge.to}\`, which is denied by \`deny\``, `deny ${edge.from} ${edge.to}`, edge.from);
      continue;
    }
    if (verdict === "allow") continue;
    const fromLayer = layerOf(edge.from);
    const toLayer = layerOf(edge.to);
    if (fromLayer === toLayer || rules.order.size === 0) continue;
    const fromOrder = rules.order.get(fromLayer);
    const toOrder = rules.order.get(toLayer);
    let reason: string | null = null;
    if (fromOrder !== undefined && toOrder !== undefined) {
      if (toOrder > fromOrder) reason = `layers say \`${fromLayer} < ${toLayer}\`, dependencies must point down`;
    } else if (rules.unordered.has(toLayer) || !rules.order.has(toLayer)) {
      reason = null;
    } else if (fromOrder === undefined) {
      reason = `\`${fromLayer}\` is outside the layer order; add \`allow ${fromLayer} ${toLayer}\` to permit this`;
    }
    if (reason) {
      reported.add(key);
      pushFail("K101", edge.file, edge.line, edge.col, `divergence: \`${edge.from}\` depends on \`${edge.to}\` (${reason})`, `layers ${fromLayer} ${toLayer}`, edge.from);
    }
  }

  for (const deny of rules.denies) {
    if (sawDenyFail) continue;
    const area = modules.size === 0 ? deny.a : [...modules].filter((id) => within(id, deny.a)).join(",");
    const hole = [...modules].filter((id) => within(id, deny.a)).map(holeIn).find((item) => item !== null) ?? null;
    if (hole) pushUnverified(deny.file, deny.span.start.line, deny.span.start.col, deny.text, area || deny.a, hole);
    else verdicts.push(base(snapshot, deny.text, area || deny.a, "ok", deny.file, deny.span.start.line, deny.span.start.col, null, "ok"));
  }

  if (rules.entries.length > 0) {
    const reachable = new Set<string>();
    const stack = rules.entries.map((id) => moduleOf(id) ?? id);
    const forward = new Map<string, UseEdge[]>();
    for (const edge of edges) {
      if (edge.resolution !== "resolved") continue;
      const list = forward.get(edge.from) ?? [];
      list.push(edge);
      forward.set(edge.from, list);
    }
    while (stack.length > 0) {
      const module = stack.pop();
      if (module === undefined || reachable.has(module)) continue;
      reachable.add(module);
      for (const edge of forward.get(module) ?? []) stack.push(edge.to);
    }
    const reachableHasHole = [...reachable].some((id) => holeIn(id) !== null);
    for (const module of [...modules].sort()) {
      if (reachable.has(module) || rules.unordered.has(layerOf(module))) continue;
      const decl = index.decls.get(module);
      const node = snapshot.nodes[module];
      const file = decl?.file ?? node?.file ?? rules.entryFile;
      const line = decl?.span.start.line ?? node?.line ?? 1;
      const col = decl?.span.start.col ?? 1;
      if (reachableHasHole) {
        pushUnverified(file, line, col, "entry", module, "unresolved edge may reach this module");
      } else if (decl) {
        pushFail("K103", file, line, col, `absence: module \`${module}\` is not reachable from any \`entry\``, "entry", module);
      } else {
        pushFail("K103", file, line, col, `absence: module \`${module}\` is not reachable from any \`entry\``, "entry", module);
      }
    }
  }

  for (const rule of rules.exportsRules) {
    const actual = snapshot.exports.filter((row) => row.module === rule.module || row.module.startsWith(`${rule.module}.`));
    const names = new Set(actual.map((row) => row.name));
    let failed = false;
    for (const row of actual) {
      if (row.name === "*" || rule.names.has(row.name)) continue;
      failed = true;
      pushFail("K104", rule.file, rule.span.start.line, rule.span.start.col, `divergence: \`${rule.module}\` exports \`${row.name}\` (${row.kind}), which is not listed in \`exports\``, `exports ${rule.module}`, rule.module);
    }
    for (const name of [...rule.names].sort()) {
      if (names.has(name)) continue;
      failed = true;
      pushFail("K104", rule.file, rule.span.start.line, rule.span.start.col, `absence: \`${rule.module}\` does not export \`${name}\``, `exports ${rule.module}`, rule.module);
    }
    const opaque = (holeIn(rule.module) ?? "").includes("opaque");
    if (!failed && opaque) pushUnverified(rule.file, rule.span.start.line, rule.span.start.col, `exports ${rule.module}`, rule.module, "reexport from an opaque module");
    else if (!failed) verdicts.push(base(snapshot, `exports ${rule.module}`, rule.module, "ok", rule.file, rule.span.start.line, rule.span.start.col, null, "ok"));
  }

  if (rules.noCycles.length > 0) {
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (edge.resolution !== "resolved" || (edge.kind !== "import" && edge.kind !== "reexport")) continue;
      const list = adj.get(edge.from) ?? new Set<string>();
      list.add(edge.to);
      adj.set(edge.from, list);
    }
    const components = stronglyConnected(adj);
    for (const rule of rules.noCycles) {
      const relevant = components.filter((component) => rule.under === null || component.some((id) => within(id, rule.under ?? "")));
      if (relevant.length === 0) {
        verdicts.push(base(snapshot, "no-cycles", rule.under ?? "*", "ok", rule.file, rule.span.start.line, rule.span.start.col, null, "ok"));
        continue;
      }
      for (const component of relevant) {
        const focus = rule.under && component.includes(rule.under) ? rule.under : component[0] ?? "";
        const cycle = cycleThrough(adj, new Set(component), focus);
        const route = [...cycle, cycle[0]].filter((id) => id !== undefined).join(" → ");
        pushFail("K105", rule.file, rule.span.start.line, rule.span.start.col, `divergence: dependency cycle ${route}`, "no-cycles", rule.under ?? focus);
      }
    }
  }
  return { diagnostics, verdicts };
}

function specific(rules: Collected, edge: UseEdge, within: (id: string, scope: string) => boolean): "allow" | "deny" | null {
  const box: { best: { kind: "allow" | "deny"; score: number } | null } = { best: null };
  const consider = (list: Rule[], kind: "allow" | "deny"): void => {
    for (const rule of list) {
      if (!within(edge.from, rule.a)) continue;
      for (const target of rule.b) {
        if (!within(edge.to, target)) continue;
        const score = rule.a.length + target.length;
        const current = box.best;
        if (!current || score > current.score || (score === current.score && kind === "deny")) box.best = { kind, score };
      }
    }
  };
  consider(rules.denies, "deny");
  consider(rules.allows, "allow");
  return box.best === null ? null : box.best.kind;
}

interface Collected {
  any: boolean;
  order: Map<string, number>;
  unordered: Set<string>;
  allows: Rule[];
  denies: Rule[];
  entries: string[];
  entryFile: string;
  noCycles: { under: string | null; file: string; span: Span }[];
  exportsRules: { module: string; names: Set<string>; file: string; span: Span }[];
}

function collectRules(docs: readonly Document[]): Collected {
  const order = new Map<string, number>();
  const unordered = new Set<string>(UNORDERED_LAYERS);
  const allows: Rule[] = [];
  const denies: Rule[] = [];
  const entries: string[] = [];
  let entryFile = docs[0]?.path ?? "keylang";
  const noCycles: Collected["noCycles"] = [];
  const exportsRules: Collected["exportsRules"] = [];
  let any = false;
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "rules" && section.kind !== "map") continue;
      for (const node of sectionNodes(section)) {
        if (isRuleNode(node) || node.kind === "rule-module") any = true;
        switch (node.kind) {
          case "layers":
            node.refs.forEach((ref, i) => order.set(ref.target, i));
            for (const child of node.children) for (const ref of child.refs) unordered.add(ref.target);
            break;
          case "allow":
          case "deny": {
            const [from, ...to] = node.refs;
            if (!from || to.length === 0) break;
            const rule = { a: from.target, b: to.map((ref) => ref.target), file: doc.path, span: node.span, text: `${node.kind} ${from.target} ${to.map((ref) => ref.target).join(" ")}` };
            (node.kind === "allow" ? allows : denies).push(rule);
            break;
          }
          case "entry":
            entryFile = doc.path;
            for (const child of node.children) for (const ref of child.refs) entries.push(ref.target);
            break;
          case "no-cycles":
            noCycles.push({ under: null, file: doc.path, span: node.span });
            break;
          case "rule-module": {
            const target = node.refs[0]?.target;
            if (!target) break;
            for (const child of node.children) {
              if (child.kind === "exports") exportsRules.push({ module: target, names: new Set(child.refs.map((ref) => ref.text)), file: doc.path, span: child.span });
              if (child.kind === "no-cycles") noCycles.push({ under: target, file: doc.path, span: child.span });
            }
            break;
          }
          default:
            break;
        }
      }
    }
  }
  return { any, order, unordered, allows, denies, entries, entryFile, noCycles, exportsRules };
}

function base(snapshot: SnapshotView, criterion: string, area: string, verdict: Verdict["verdict"], file: string, line: number, col: number, code: string | null, message: string): Verdict {
  return { verdict, criterion, area, snapshotId: snapshot.snapshotId, specHash: hashText(criterion), file, line, col, code, message };
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function isRuleNode(n: Node): boolean {
  return n.kind === "layers" || n.kind === "allow" || n.kind === "deny" || n.kind === "entry" || n.kind === "rule-module" || n.kind === "no-cycles";
}

