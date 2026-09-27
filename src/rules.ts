// Rules check on the IR: layer order, allow/deny, entry reachability, exports,
// cycles. Works on parsed map + rules documents only, so `keylang check` needs
// no source code and no index. Vocabulary from reflexion models: a forbidden
// edge that exists is a *divergence*; a declared edge missing from code is an
// *absence* (flows, M3).

import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import type { Index } from "./resolve.ts";
import type { Span } from "./span.ts";

interface Edge {
  from: string;
  to: string;
  kind: "import" | "call";
  file: string;
  span: Span;
}

interface Rule {
  a: string;
  b: string[];
  file: string;
  span: Span;
}

export const UNORDERED_LAYERS = new Set(["external", "unassigned"]);

export function checkRules(docs: readonly Document[], index: Index): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const moduleOf = (id: string): string | null => {
    // Longest declared prefix that is a module (or the module itself).
    let cur = id;
    for (;;) {
      const d = index.decls.get(cur);
      if (d?.kind === "module") return cur;
      const dot = cur.lastIndexOf(".");
      if (dot === -1) return null;
      cur = cur.slice(0, dot);
    }
  };
  const layerOf = (id: string): string => id.split(".")[0]!;

  // Graph edges from map documents.
  const edges: Edge[] = [];
  const modules = new Set<string>();
  const exportedFns = new Map<string, Set<string>>(); // module → fn names with no `internal` mark
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "map") continue;
      for (const top of sectionNodes(section)) {
        walk(top, (n) => {
          if (n.kind === "module" && n.id) modules.add(n.id);
          if (n.kind === "dep" && n.id && n.refs[0]) {
            const from = n.id.slice(0, n.id.lastIndexOf("."));
            const to = moduleOf(n.refs[0].target);
            if (to && to !== from) edges.push({ from, to, kind: "import", file: doc.path, span: n.refs[0].span });
          }
          if (n.kind === "fn" && n.id) {
            const from = moduleOf(n.id);
            const internal = n.comment?.value.includes("internal") ?? false;
            if (from && !internal) {
              const set = exportedFns.get(from) ?? new Set<string>();
              exportedFns.set(from, set);
              set.add(n.name!.value);
            }
            for (const c of n.children) {
              if (c.kind !== "calls") continue;
              for (const r of c.refs) {
                const to = moduleOf(r.target);
                if (from && to && to !== from) edges.push({ from, to, kind: "call", file: doc.path, span: r.span });
              }
            }
          }
        });
      }
    }
  }

  // Rules.
  const order = new Map<string, number>();
  const unordered = new Set<string>(UNORDERED_LAYERS);
  const allows: Rule[] = [];
  const denies: Rule[] = [];
  const entries: string[] = [];
  const noCycles: { under: string | null; file: string; span: Span }[] = [];
  const exportsRules: { module: string; names: Set<string>; file: string; span: Span }[] = [];
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "rules" && section.kind !== "map") continue;
      for (const n of sectionNodes(section)) {
        switch (n.kind) {
          case "layers":
            n.refs.forEach((r, i) => order.set(r.target, i));
            for (const c of n.children) for (const r of c.refs) unordered.add(r.target);
            break;
          case "allow":
          case "deny": {
            const [a, ...b] = n.refs;
            if (!a || b.length === 0) break;
            (n.kind === "allow" ? allows : denies).push({ a: a.target, b: b.map((r) => r.target), file: doc.path, span: n.span });
            break;
          }
          case "entry":
            for (const c of n.children) for (const r of c.refs) entries.push(r.target);
            break;
          case "no-cycles":
            noCycles.push({ under: null, file: doc.path, span: n.span });
            break;
          case "rule-module": {
            const target = n.refs[0]?.target;
            if (!target) break;
            for (const c of n.children) {
              if (c.kind === "exports") exportsRules.push({ module: target, names: new Set(c.refs.map((r) => r.text)), file: doc.path, span: c.span });
              if (c.kind === "no-cycles") noCycles.push({ under: target, file: doc.path, span: c.span });
            }
            break;
          }
          default:
            break;
        }
      }
    }
  }

  const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  /** Most specific matching rule wins; ties go to deny. */
  const verdict = (e: Edge): "allow" | "deny" | null => {
    let best: { kind: "allow" | "deny"; score: number } | null = null;
    const consider = (rules: Rule[], kind: "allow" | "deny"): void => {
      for (const r of rules) {
        if (!within(e.from, r.a)) continue;
        for (const b of r.b) {
          if (!within(e.to, b)) continue;
          const score = r.a.length + b.length;
          if (!best || score > best.score || (score === best.score && kind === "deny")) best = { kind, score };
        }
      }
    };
    consider(denies, "deny");
    consider(allows, "allow");
    return best ? (best as { kind: "allow" | "deny" }).kind : null;
  };

  // K101 layer order, K102 deny: one report per module pair, at its first
  // edge (the `import` dependency when there is one; calls repeat it).
  const reported = new Set<string>();
  for (const e of edges) {
    const key = `${e.from}\0${e.to}`;
    if (reported.has(key)) continue;
    const v = verdict(e);
    if (v === "deny") {
      reported.add(key);
      diags.push(diagnostic("K102", e.file, e.span, `divergence: \`${e.from}\` depends on \`${e.to}\`, which is denied by \`deny\``));
      continue;
    }
    if (v === "allow") continue;
    const lf = layerOf(e.from);
    const lt = layerOf(e.to);
    if (lf === lt) continue;
    const of = order.get(lf);
    const ot = order.get(lt);
    if (order.size === 0) continue;
    let bad: string | null = null;
    if (of !== undefined && ot !== undefined) {
      if (ot > of) bad = `layers say \`${lf} < ${lt}\`, dependencies must point down`;
    } else if (unordered.has(lt) || !order.has(lt)) {
      bad = null; // into an unordered layer: free unless denied
    } else if (of === undefined) {
      bad = `\`${lf}\` is outside the layer order; add \`allow ${lf} ${lt}\` to permit this`;
    }
    if (bad) {
      reported.add(key);
      diags.push(diagnostic("K101", e.file, e.span, `divergence: \`${e.from}\` depends on \`${e.to}\` (${bad})`));
    }
  }

  // K103 unreachable from entry (warning).
  if (entries.length > 0) {
    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      const s = adj.get(e.from) ?? new Set<string>();
      adj.set(e.from, s);
      s.add(e.to);
    }
    const seen = new Set<string>();
    const stack = entries.map((id) => moduleOf(id) ?? id);
    while (stack.length > 0) {
      const m = stack.pop()!;
      if (seen.has(m)) continue;
      seen.add(m);
      for (const n of adj.get(m) ?? []) stack.push(n);
      // A module reaches its submodules and its parent implicitly.
      for (const other of modules) if (within(other, m) || within(m, other)) if (!seen.has(other)) stack.push(other);
    }
    for (const m of modules) {
      const d = index.decls.get(m);
      if (!d || seen.has(m) || unordered.has(layerOf(m))) continue;
      diags.push(diagnostic("K103", d.file, d.span, `absence: module \`${m}\` is not reachable from any \`entry\``));
    }
  }

  // K104 exports.
  for (const r of exportsRules) {
    const actual = exportedFns.get(r.module) ?? new Set<string>();
    for (const name of [...actual].sort()) {
      if (!r.names.has(name)) diags.push(diagnostic("K104", r.file, r.span, `divergence: \`${r.module}\` exports \`${name}\`, which is not listed in \`exports\``));
    }
  }

  // K105 cycles.
  if (noCycles.length > 0) {
    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      if (e.kind !== "import") continue;
      const s = adj.get(e.from) ?? new Set<string>();
      adj.set(e.from, s);
      s.add(e.to);
    }
    const cycles = findCycles(adj);
    for (const rule of noCycles) {
      for (const cycle of cycles) {
        if (rule.under !== null && !cycle.some((m) => within(m, rule.under!))) continue;
        diags.push(diagnostic("K105", rule.file, rule.span, `divergence: dependency cycle ${[...cycle, cycle[0]].join(" → ")}`));
      }
    }
  }
  return diags;
}

/** Elementary cycles via DFS back-edges (one per back-edge, enough for a report). */
function findCycles(adj: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 1 | 2>();
  const path: string[] = [];
  const seenCycle = new Set<string>();
  const dfs = (n: string): void => {
    state.set(n, 1);
    path.push(n);
    for (const m of adj.get(n) ?? []) {
      const s = state.get(m);
      if (s === 1) {
        const cycle = path.slice(path.indexOf(m));
        const key = [...cycle].sort().join("|");
        if (!seenCycle.has(key)) {
          seenCycle.add(key);
          cycles.push(cycle);
        }
      } else if (!s) {
        dfs(m);
      }
    }
    path.pop();
    state.set(n, 2);
  };
  for (const n of [...adj.keys()].sort()) if (!state.has(n)) dfs(n);
  return cycles;
}

export function isRuleNode(n: Node): boolean {
  return n.kind === "layers" || n.kind === "allow" || n.kind === "deny" || n.kind === "entry" || n.kind === "rule-module" || n.kind === "no-cycles";
}
