// Rules over a fresh analysis snapshot. Without a snapshot (a spec directory
// that has no code), rule results are unverified rather than a graph rebuilt
// from Markdown.

import { createHash } from "node:crypto";
import { SYNTHETIC_LAYERS } from "./config.ts";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import type { Index } from "./resolve.ts";
import { cycleThrough, stronglyConnected } from "./scc.ts";
import type { Span } from "./span.ts";
import type { Verdict } from "./verdict.ts";

/** The slice of the snapshot rules need. Kept here so `check` does not import `map`. */
interface SnapshotView {
  snapshotId: string;
  nodes: Record<string, { kind: string; file: string | null; line: number | null; col?: number | null; members?: string; class?: true }>;
  edges: { kind: string; source: string; target: string | null; file: string | null; line: number; col: number; resolution: string; reason?: string; via?: string }[];
  coverage: { kind: string; file: string; line: number; col: number; reason: string; source: string | null }[];
  exports: { module: string; name: string; kind: string; form?: string; from?: string; reason?: string }[];
}

interface Rule {
  a: string;
  b: string[];
  file: string;
  span: Span;
  text: string;
}

/** One `layers a < b < c` line: `a` lowest. */
interface LayerOrder {
  layers: string[];
  file: string;
  span: Span;
  text: string;
}

interface UseEdge {
  /** The nearest module of each end, a class included: what `allow` / `deny` scopes match. */
  from: string;
  to: string;
  /** The file module of each end (a class is part of its file): what a dependency is between. */
  fromUnit: string;
  toUnit: string;
  kind: "import" | "call" | "type" | "reexport";
  file: string;
  line: number;
  col: number;
  resolution: string;
}

export const UNORDERED_LAYERS: ReadonlySet<string> = new Set(SYNTHETIC_LAYERS);

export interface RuleReport {
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
}

export function checkRules(docs: readonly Document[], index: Index, snapshot: SnapshotView | null = null): Diagnostic[] {
  return evaluateRules(docs, index, snapshot).diagnostics;
}

/** Whether `from` depending on `to` is forbidden by the most specific deny rule. */
export function blocksDependency(docs: readonly Document[], from: string, to: string): boolean {
  return denyingRule(docs, from, to) !== null;
}

/** The most specific rule when it forbids `from` depending on `to`: its text, file and line, as K102 names it; null otherwise. */
export function denyingRule(docs: readonly Document[], from: string, to: string): { text: string; file: string; line: number } | null {
  const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const match = specific(collectRules(docs, () => undefined), from, to, within);
  return match?.kind === "deny" ? { text: match.rule.text, file: match.rule.file, line: match.rule.span.start.line } : null;
}

export function evaluateRules(docs: readonly Document[], index: Index, snapshot: SnapshotView | null): RuleReport {
  const kindOf = (id: string): string | undefined => snapshot?.nodes[id]?.kind ?? index.decls.get(id)?.kind ?? (index.planned.has(id) ? `planned ${plannedKind(docs, id)}` : undefined);
  const rules = collectRules(docs, kindOf);
  if (!snapshot) {
    if (!rules.any) return { diagnostics: rules.diagnostics, verdicts: [] };
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
    return { diagnostics: rules.diagnostics, verdicts: [verdict] };
  }
  const report = evaluateOnSnapshot(rules, index, snapshot, [...index.planned.keys()]);
  return { diagnostics: [...rules.diagnostics, ...report.diagnostics], verdicts: report.verdicts };
}

function evaluateOnSnapshot(rules: Collected, index: Index, snapshot: SnapshotView, planned: readonly string[]): RuleReport {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const isModule = (id: string): boolean => snapshot.nodes[id]?.kind === "module";
  // A class is a module node of its file's module; the snapshot marks it (any file of a `module: "dir"` module too).
  const isClass = (id: string): boolean => snapshot.nodes[id]?.kind === "module" && snapshot.nodes[id]?.class === true;
  const scopeOf = (id: string): string | null => {
    for (let cur = id; ; cur = cur.slice(0, cur.lastIndexOf("."))) {
      if (isModule(cur)) return cur;
      if (!cur.includes(".")) return null;
    }
  };
  const unitOf = (module: string): string => {
    let cur = module;
    while (isClass(cur)) cur = cur.slice(0, cur.lastIndexOf("."));
    return cur;
  };
  const layerOf = (id: string): string => id.split(".")[0] ?? id;
  const edges: UseEdge[] = [];
  const selfLoops = new Set<string>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "import" && edge.kind !== "reexport" && edge.kind !== "call" && edge.kind !== "type") continue;
    if (!edge.target || !edge.file) continue;
    // An injected hook value is the injector's dependency, which has its own edge to it.
    if (edge.via === "injected") continue;
    const from = scopeOf(edge.source);
    const to = scopeOf(edge.target);
    if (!from || !to) continue;
    const fromUnit = unitOf(from);
    const toUnit = unitOf(to);
    if (fromUnit === toUnit) {
      if (edge.kind !== "call" && edge.kind !== "type" && edge.resolution === "resolved") selfLoops.add(fromUnit);
      continue;
    }
    edges.push({ from, to, fromUnit, toUnit, kind: edge.kind, file: edge.file, line: edge.line, col: edge.col, resolution: edge.resolution });
  }
  /** Every module node, classes included: the area of a scope. */
  const modules = new Set<string>();
  for (const [id, node] of Object.entries(snapshot.nodes)) if (node.kind === "module") modules.add(id);
  /** File (and directory) modules: what is reachable and what a cycle runs through. */
  const units = new Set([...modules].filter((id) => !isClass(id)));

  // A module reaches another module's code only through an import, so a call
  // through a local value cannot hide a dependency; an unknown import can.
  // So cannot a construct inside one declaration, like a decorator that may
  // replace a fn: it changes which code a call runs, not what the module imports.
  const inDeclaration = (source: string | null): boolean => {
    const node = source === null ? undefined : snapshot.nodes[source];
    return node?.kind === "fn" || isClass(source ?? "");
  };
  const dependencyHoleIn = (moduleId: string): string | null => {
    const file = snapshot.nodes[moduleId]?.file;
    const hole = snapshot.coverage.find(
      (item) =>
        DEPENDENCY_HOLES.has(item.kind) &&
        item.reason !== "unsupported construct `computed call`" &&
        !(item.kind === "unsupported" && inDeclaration(item.source)) &&
        (item.source === moduleId || item.source?.startsWith(`${moduleId}.`) || (file !== null && file !== undefined && item.file === file)),
    );
    return hole ? `${hole.reason} (${hole.file}:${hole.line}:${hole.col})` : null;
  };
  const holeAmong = (ids: Iterable<string>): string | null => [...ids].sort().map(dependencyHoleIn).find((item) => item !== null) ?? null;
  // A hole whose scope has no node — a directory that could not be read — may hide modules of any ID under
  // that scope: it is in the area of a rule over the scope, above it or below it (null: any area).
  const orphans = snapshot.coverage.filter((item) => DEPENDENCY_HOLES.has(item.kind) && item.source !== null && snapshot.nodes[item.source] === undefined);
  const scopeHole = (scope: string | null): string | null => {
    const hole = orphans.find((item) => scope === null || within(item.source!, scope) || within(scope, item.source!));
    return hole ? `${hole.reason} (${hole.file}:${hole.line}:${hole.col})` : null;
  };

  const pushFail = (code: Diagnostic["code"], file: string, line: number, col: number, message: string, criterion: string, area: string): void => {
    diagnostics.push(diagnostic(code, file, pointAt(line, col), message));
    verdicts.push(base(snapshot, criterion, area, "fail", file, line, col, code, message));
  };
  const pushUnverified = (file: string, line: number, col: number, criterion: string, area: string, reason: string, spec = criterion): void => {
    verdicts.push(base(snapshot, criterion, area, "unverified", file, line, col, null, reason, spec));
  };
  const pushOk = (file: string, span: Span, criterion: string, area: string, message: string, spec = criterion): void => {
    verdicts.push(base(snapshot, criterion, area, "ok", file, span.start.line, span.start.col, null, message, spec));
  };

  // One dependency is one finding per rule, however many edges (import, call, a type of its class) show it.
  const deniedPairs = new Map<Rule, Set<string>>();
  const layeredPairs = new Set<string>();
  /** Layers named by a K101: their orders are not `ok`. */
  const violated = new Set<string>();
  const failedDenies = new Set<Rule>();
  /** A `deny` whose edges a more specific rule decided, with those rules. */
  const overridden = new Map<Rule, Set<string>>();
  for (const edge of edges) {
    if (edge.resolution !== "resolved") continue;
    const pair = `${edge.fromUnit}\0${edge.toUnit}`;
    const match = specific(rules, edge.from, edge.to, within);
    for (const deny of rules.denies) {
      if (match && match.rule !== deny && within(edge.from, deny.a) && deny.b.some((target) => within(edge.to, target))) {
        const winners = overridden.get(deny) ?? new Set<string>();
        winners.add(match.rule.text);
        overridden.set(deny, winners);
      }
    }
    if (match?.kind === "deny") {
      const rule = match.rule;
      failedDenies.add(rule);
      const seen = deniedPairs.get(rule) ?? new Set<string>();
      deniedPairs.set(rule, seen);
      if (seen.has(pair)) continue;
      seen.add(pair);
      pushFail("K102", edge.file, edge.line, edge.col, `divergence: \`${edge.from}\` depends on \`${edge.to}\`, which is denied by \`${rule.text}\` (${rule.file}:${rule.span.start.line})`, rule.text, edge.from);
      continue;
    }
    if (match?.kind === "allow") continue;
    const fromLayer = layerOf(edge.fromUnit);
    const toLayer = layerOf(edge.toUnit);
    if (fromLayer === toLayer) continue;
    const reason = layerViolation(rules, fromLayer, toLayer);
    if (!reason) continue;
    violated.add(fromLayer);
    violated.add(toLayer);
    if (layeredPairs.has(pair)) continue;
    layeredPairs.add(pair);
    pushFail("K101", edge.file, edge.line, edge.col, `divergence: \`${edge.fromUnit}\` depends on \`${edge.toUnit}\` (${reason})`, `layers ${fromLayer} ${toLayer}`, edge.fromUnit);
  }

  for (const order of rules.orders) {
    if (order.layers.some((layer) => violated.has(layer))) continue;
    // An unknown import of a module in the order, or of one outside every order, could point up.
    const area = [...units].filter((id) => {
      const layer = layerOf(id);
      return order.layers.includes(layer) || (!rules.ordered.has(layer) && !rules.unordered.has(layer));
    });
    const hole = holeAmong(area) ?? orphans.map((item) => layerOf(item.source!)).filter((layer) => order.layers.includes(layer) || (!rules.ordered.has(layer) && !rules.unordered.has(layer))).map(scopeHole)[0] ?? null;
    const names = order.layers.map((layer) => `\`${layer}\``).join(", ");
    if (hole) pushUnverified(order.file, order.span.start.line, order.span.start.col, order.text, order.layers.join(","), `no dependency against the order among the known edges, but ${hole}`);
    else pushOk(order.file, order.span, order.text, order.layers.join(","), `convergence: every dependency between ${names} points down, and no dependency hole in the area`);
  }

  for (const deny of rules.denies) {
    if (failedDenies.has(deny)) continue;
    const scope = [...modules].filter((id) => within(id, deny.a));
    const area = scope.join(",") || deny.a;
    const at = [deny.file, deny.span.start.line, deny.span.start.col] as const;
    const targets = deny.b.map((b) => `\`${b}\``).join(", ");
    // Nothing to check yet, because the area exists only as an intention: that is no evidence either way.
    const intended = scope.length === 0 ? planned.find((id) => within(id, deny.a) || within(deny.a, id)) : undefined;
    if (intended !== undefined) {
      pushUnverified(...at, deny.text, area, `\`${intended}\` is planned: no code in the area yet`);
      continue;
    }
    const hole = holeAmong(scope) ?? scopeHole(deny.a);
    const winners = overridden.get(deny);
    if (hole) pushUnverified(...at, deny.text, area, hole);
    else if (scope.length === 0) pushOk(deny.file, deny.span, deny.text, area, `convergence: no module under \`${deny.a}\` yet, so no edge to ${targets}`);
    else if (winners) pushOk(deny.file, deny.span, deny.text, area, `convergence: the edges from \`${deny.a}\` to ${targets} are decided by more specific rules (${[...winners].sort().map((text) => `\`${text}\``).join(", ")}); no other edge and no dependency hole in the area`);
    else pushOk(deny.file, deny.span, deny.text, area, `convergence: no edge from \`${deny.a}\` to ${targets} and no dependency hole in the area`);
  }

  if (rules.entries.length > 0) {
    const reachable = new Set<string>();
    // An entry naming a layer or a directory seeds every module under it; it is not itself a module.
    const stack = rules.entries.flatMap((id) => {
      const module = scopeOf(id);
      if (module) return [unitOf(module)];
      const under = [...units].filter((candidate) => within(candidate, id));
      return under.length > 0 ? under : [id];
    });
    const forward = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.resolution !== "resolved") continue;
      const list = forward.get(edge.fromUnit) ?? [];
      list.push(edge.toUnit);
      forward.set(edge.fromUnit, list);
    }
    while (stack.length > 0) {
      const module = stack.pop();
      if (module === undefined || reachable.has(module)) continue;
      reachable.add(module);
      for (const next of forward.get(module) ?? []) stack.push(next);
    }
    // Only an unknown import can lead to a module the known edges do not reach.
    const reachableHole = holeAmong(reachable);
    // Modules in a directory keylang could not read may be unreachable too.
    const unknownModules = scopeHole(null);
    let unreached = 0;
    for (const module of [...units].sort()) {
      if (reachable.has(module) || rules.unordered.has(layerOf(module))) continue;
      // A directory module without code of its own is not reached by itself.
      if (snapshot.nodes[module]?.line === null) continue;
      unreached++;
      // The module's own file is the evidence; the map line is a projection of it.
      const node = snapshot.nodes[module];
      const decl = index.decls.get(module);
      const file = node?.file ?? decl?.file ?? rules.entryNodes[0]?.file ?? "keylang";
      const line = node?.file ? (node.line ?? 1) : (decl?.span.start.line ?? 1);
      const col = node?.file ? (node.col ?? 1) : (decl?.span.start.col ?? 1);
      if (reachableHole) {
        pushUnverified(file, line, col, "entry", module, `not reached, but ${reachableHole} may reach it`);
      } else {
        // A warning, not a verdict: it never fails the check, so no consumer may count it as `fail`.
        diagnostics.push({ ...diagnostic("K103", file, pointAt(line, col), `absence: module \`${module}\` is not reachable from any \`entry\``), criterion: "entry", area: module });
      }
    }
    if (unreached === 0 && unknownModules !== null) {
      for (const entry of rules.entryNodes) pushUnverified(entry.file, entry.span.start.line, entry.span.start.col, "entry", rules.entries.join(","), `every known module is reachable from \`entry\`, but ${unknownModules}`, entry.text);
    } else if (unreached === 0) {
      for (const entry of rules.entryNodes) pushOk(entry.file, entry.span, "entry", rules.entries.join(","), `convergence: every module is reachable from \`entry\``, entry.text);
    }
  }

  for (const rule of rules.exportsRules) {
    const criterion = `exports ${rule.module}`;
    const at = [rule.file, rule.span.start.line, rule.span.start.col] as const;
    const node = snapshot.nodes[rule.module];
    if (node?.kind !== "module") {
      // One that exists only as an intention has no exports to compare yet; an unknown ID is K001 already.
      if (planned.includes(rule.module)) pushUnverified(...at, criterion, rule.module, `\`${rule.module}\` is planned: no code yet`);
      else if (index.lookup(rule.module).kind !== "missing") pushUnverified(...at, criterion, rule.module, `\`${rule.module}\` is not a module of the snapshot`);
      continue;
    }
    // Only the module's own table: `purchase.ts` does not export what `purchase/buy.ts` does.
    const actual = snapshot.exports.filter((row) => row.module === rule.module);
    const names = new Set(actual.map((row) => row.name));
    // An `export *` from an unknown module may supply any listed name.
    const unknown = actual.find((row) => row.name === "*");
    let failed = false;
    for (const row of actual) {
      if (row.name === "*" || rule.names.has(row.name)) continue;
      failed = true;
      const how = row.form === "reexport" && row.from ? `${row.kind}, re-exported from \`${row.from}\`` : row.form && row.form !== "reexport" ? `${row.kind}, ${row.form}` : row.kind;
      pushFail("K104", ...at, `divergence: \`${rule.module}\` exports \`${row.name}\` (${how}), which is not listed in \`exports\``, criterion, rule.module);
    }
    const missing = [...rule.names].sort().filter((name) => !names.has(name));
    // An opaque module (excluded, or with a syntax error) may export what the table does not show.
    const opaque = node.members === "opaque";
    if (opaque && missing.length > 0 && !failed) {
      pushUnverified(...at, criterion, rule.module, `opaque module \`${rule.module}\` may export ${missing.map((name) => `\`${name}\``).join(", ")}`);
      continue;
    }
    if (!unknown && !opaque) {
      for (const name of missing) {
        failed = true;
        pushFail("K104", ...at, `absence: \`${rule.module}\` does not export \`${name}\``, criterion, rule.module);
      }
    }
    if (failed) continue;
    if (unknown) pushUnverified(...at, criterion, rule.module, unknown.reason ?? "re-export from an opaque module");
    else pushOk(rule.file, rule.span, criterion, rule.module, `convergence: the export table is exactly ${[...rule.names].sort().join(", ")}`, `${criterion}: ${[...rule.names].sort().join(", ")}`);
  }

  if (rules.noCycles.length > 0) {
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (edge.resolution !== "resolved" || (edge.kind !== "import" && edge.kind !== "reexport")) continue;
      const list = adj.get(edge.fromUnit) ?? new Set<string>();
      list.add(edge.toUnit);
      adj.set(edge.fromUnit, list);
    }
    for (const module of selfLoops) adj.set(module, new Set([...(adj.get(module) ?? []), module]));
    const components = stronglyConnected(adj);
    for (const rule of rules.noCycles) {
      // A class is in a cycle when its file is.
      const scopeModule = rule.under === null ? null : scopeOf(rule.under);
      const under = rule.under === null ? null : scopeModule === null ? rule.under : unitOf(scopeModule);
      const inScope = (id: string): boolean => under === null || within(id, under);
      const relevant = components.filter((component) => component.some(inScope));
      // A cycle may run through an import keylang could not resolve.
      const hole = relevant.length === 0 ? (holeAmong([...units].filter(inScope)) ?? scopeHole(under)) : null;
      if (hole) {
        pushUnverified(rule.file, rule.span.start.line, rule.span.start.col, "no-cycles", rule.under ?? "*", `no cycle among the known imports, but ${hole}`);
        continue;
      }
      if (relevant.length === 0) {
        pushOk(rule.file, rule.span, "no-cycles", rule.under ?? "*", `convergence: no import cycle${rule.under ? ` through \`${rule.under}\`` : ""}`, `no-cycles ${rule.under ?? "*"}`);
        continue;
      }
      for (const component of relevant) {
        const focus = component.find(inScope) ?? component[0] ?? "";
        const cycle = cycleThrough(adj, new Set(component), focus);
        const route = [...cycle, cycle[0]].filter((id) => id !== undefined).join(" → ");
        pushFail("K105", rule.file, rule.span.start.line, rule.span.start.col, `divergence: dependency cycle ${route}`, "no-cycles", rule.under ?? focus);
      }
    }
  }
  return { diagnostics, verdicts };
}

const DEPENDENCY_HOLES = new Set(["unresolved-import", "parse-error", "unsupported", "unassigned-file", "skipped-file"]);

/** Why a dependency between two layers breaks the layer orders, or null. */
function layerViolation(rules: Collected, fromLayer: string, toLayer: string): string | null {
  if (rules.above.get(fromLayer)?.has(toLayer)) return `layers say \`${fromLayer} < ${toLayer}\`, dependencies must point down`;
  if (!rules.ordered.has(fromLayer) && rules.ordered.has(toLayer) && !rules.unordered.has(toLayer)) {
    return `\`${fromLayer}\` is outside the layer order; add \`allow ${fromLayer} ${toLayer}\` to permit this`;
  }
  return null;
}

/** How specific a scope is: its depth in segments (`app.purchase` is 2), not its length in characters. */
export function scopeDepth(id: string): number {
  return id.split(".").length;
}

/**
 * The rule that decides `from → to`: the one whose scopes are deepest in
 * total (`deny app.purchase domain` and `allow app domain.store` both 3), a
 * `deny` on a tie.
 */
function specific(rules: Collected, from: string, to: string, within: (id: string, scope: string) => boolean): { kind: "allow" | "deny"; rule: Rule } | null {
  const box: { best: { kind: "allow" | "deny"; score: number; rule: Rule } | null } = { best: null };
  const consider = (list: Rule[], kind: "allow" | "deny"): void => {
    for (const rule of list) {
      if (!within(from, rule.a)) continue;
      for (const target of rule.b) {
        if (!within(to, target)) continue;
        const score = scopeDepth(rule.a) + scopeDepth(target);
        const current = box.best;
        if (!current || score > current.score || (score === current.score && kind === "deny" && current.kind === "allow")) box.best = { kind, score, rule };
      }
    }
  };
  consider(rules.denies, "deny");
  consider(rules.allows, "allow");
  return box.best === null ? null : { kind: box.best.kind, rule: box.best.rule };
}

interface Collected {
  any: boolean;
  /** Valid `layers` lines. */
  orders: LayerOrder[];
  /** Layer → the layers above it, over every order (they form one partial order). */
  above: Map<string, Set<string>>;
  ordered: Set<string>;
  unordered: Set<string>;
  allows: Rule[];
  denies: Rule[];
  entries: string[];
  entryNodes: { file: string; span: Span; text: string }[];
  noCycles: { under: string | null; file: string; span: Span }[];
  exportsRules: { module: string; names: Set<string>; file: string; span: Span }[];
  /** Rules that cannot be evaluated as written (K005); they are left out. */
  diagnostics: Diagnostic[];
}

/** What `allow` / `deny` cannot scope: a member of a module rather than a layer, a module or a prefix. */
const MEMBER_KINDS = new Set(["fn", "type", "event", "dep", "planned fn", "planned type", "planned event"]);

function collectRules(docs: readonly Document[], kindOf: (id: string) => string | undefined): Collected {
  const unordered = new Set<string>(UNORDERED_LAYERS);
  const allows: Rule[] = [];
  const denies: Rule[] = [];
  const entries: string[] = [];
  const entryNodes: Collected["entryNodes"] = [];
  const noCycles: Collected["noCycles"] = [];
  const exportsRules: Collected["exportsRules"] = [];
  const diagnostics: Diagnostic[] = [];
  const chains: LayerOrder[] = [];
  const nested: { file: string; target: string; span: Span }[] = [];
  let any = false;
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "rules" && section.kind !== "map") continue;
      for (const node of sectionNodes(section)) {
        if (isRuleNode(node) || node.kind === "rule-module") any = true;
        switch (node.kind) {
          case "layers": {
            const chain = layerChain(doc.path, node, diagnostics);
            if (chain) chains.push(chain);
            for (const child of node.children) {
              for (const ref of child.refs) {
                if (ref.target.includes(".")) diagnostics.push(diagnostic("K005", doc.path, ref.span, `\`layers\` lists layers; \`${ref.target}\` is not a layer`));
                else nested.push({ file: doc.path, target: ref.target, span: ref.span });
              }
            }
            break;
          }
          case "allow":
          case "deny": {
            const [from, ...to] = node.refs;
            if (!from || to.length === 0) break;
            // A rule over a function is not evaluated at that granularity: edges are between modules.
            const members = node.refs.flatMap((ref) => {
              const kind = kindOf(ref.target);
              return kind !== undefined && MEMBER_KINDS.has(kind) ? [{ ref, kind }] : [];
            });
            for (const { ref, kind } of members) {
              const module = ref.target.slice(0, ref.target.lastIndexOf("."));
              diagnostics.push(diagnostic("K005", doc.path, ref.span, `\`${node.kind}\` takes layers, modules and ID prefixes; \`${ref.target}\` is a ${kind}, name its module \`${module}\``));
            }
            if (members.length > 0) break;
            const rule = { a: from.target, b: to.map((ref) => ref.target), file: doc.path, span: node.span, text: `${node.kind} ${from.target} ${to.map((ref) => ref.target).join(" ")}` };
            (node.kind === "allow" ? allows : denies).push(rule);
            break;
          }
          case "entry":
            entryNodes.push({ file: doc.path, span: node.span, text: `entry ${node.children.flatMap((child) => child.refs.map((ref) => ref.target)).join(" ")}` });
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
  const { orders, above } = combineOrders(chains, diagnostics);
  const ordered = new Set(orders.flatMap((order) => order.layers));
  for (const item of nested) {
    if (ordered.has(item.target)) diagnostics.push(diagnostic("K005", item.file, item.span, `layer \`${item.target}\` is both in a \`layers\` order and unordered under it`));
    else unordered.add(item.target);
  }
  return { any, orders, above, ordered, unordered, allows, denies, entries, entryNodes, noCycles, exportsRules, diagnostics };
}

/** A `layers` line as an order, or null (with K005) when it names a non-layer or one layer twice. */
function layerChain(file: string, node: Node, diagnostics: Diagnostic[]): LayerOrder | null {
  const seen = new Set<string>();
  let valid = node.refs.length > 0;
  for (const ref of node.refs) {
    if (ref.target.includes(".")) {
      diagnostics.push(diagnostic("K005", file, ref.span, `\`layers\` orders layers; \`${ref.target}\` is not a layer`));
      valid = false;
    } else if (seen.has(ref.target)) {
      diagnostics.push(diagnostic("K005", file, ref.span, `layer \`${ref.target}\` appears twice in one order`));
      valid = false;
    }
    seen.add(ref.target);
  }
  if (!valid) return null;
  const layers = node.refs.map((ref) => ref.target);
  return { layers, file, span: node.span, text: `layers ${layers.join(" < ")}` };
}

/**
 * All `layers` lines as one partial order: `a < b` and `b < c` put `c` above
 * `a`, while `a < b` and `c < d` say nothing about `a` and `d`. A line that
 * contradicts the lines before it is K005 and left out.
 */
function combineOrders(chains: readonly LayerOrder[], diagnostics: Diagnostic[]): { orders: LayerOrder[]; above: Map<string, Set<string>> } {
  const direct = new Map<string, Set<string>>();
  let above = new Map<string, Set<string>>();
  const orders: LayerOrder[] = [];
  for (const chain of chains) {
    let conflict: [string, string] | null = null;
    for (let i = 0; i < chain.layers.length && !conflict; i++) {
      for (let j = i + 1; j < chain.layers.length && !conflict; j++) {
        const lower = chain.layers[i]!;
        const upper = chain.layers[j]!;
        if (above.get(upper)?.has(lower)) conflict = [lower, upper];
      }
    }
    if (conflict) {
      const [lower, upper] = conflict;
      diagnostics.push(diagnostic("K005", chain.file, chain.span, `\`${chain.text}\` contradicts an earlier \`layers\`, which puts \`${lower}\` above \`${upper}\``));
      continue;
    }
    orders.push(chain);
    for (let i = 0; i + 1 < chain.layers.length; i++) {
      const lower = chain.layers[i]!;
      const set = direct.get(lower) ?? new Set<string>();
      set.add(chain.layers[i + 1]!);
      direct.set(lower, set);
    }
    above = transitive(direct);
  }
  return { orders, above };
}

function transitive(direct: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const start of direct.keys()) {
    const reached = new Set<string>();
    const stack = [...(direct.get(start) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (reached.has(next)) continue;
      reached.add(next);
      stack.push(...(direct.get(next) ?? []));
    }
    out.set(start, reached);
  }
  return out;
}

function plannedKind(docs: readonly Document[], id: string): string {
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        let kind: string | null = null;
        walk(top, (node) => {
          if (kind === null && node.kind === "planned" && node.id === id) kind = node.label?.value ?? "fn";
        });
        if (kind !== null) return kind;
      }
    }
  }
  return "fn";
}

/** A one-column span at a code position (a rule finding has no source offset). */
function pointAt(line: number, col: number): Span {
  return { start: { offset: 0, line, col }, end: { offset: 0, line, col: col + 1 } };
}

/** `spec` is the rule as written; its hash changes when the rule does. */
function base(snapshot: SnapshotView, criterion: string, area: string, verdict: Verdict["verdict"], file: string, line: number, col: number, code: string | null, message: string, spec = criterion): Verdict {
  return { verdict, criterion, area, snapshotId: snapshot.snapshotId, specHash: hashText(spec), file, line, col, code, message };
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function isRuleNode(n: Node): boolean {
  return n.kind === "layers" || n.kind === "allow" || n.kind === "deny" || n.kind === "entry" || n.kind === "rule-module" || n.kind === "no-cycles";
}
