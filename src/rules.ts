// Rules over a fresh analysis snapshot. Without a snapshot (a spec directory
// that has no code), rule results are unverified rather than a graph rebuilt
// from Markdown.

import { createHash } from "node:crypto";
import { OUTSIDE_LAYER, SYNTHETIC_LAYERS, type RuleFormat } from "./config.ts";
import { diagnostic, type Diagnostic } from "./diag.ts";
import type { Document } from "./ir.ts";
import type { Index } from "./resolve.ts";
import { cycleThrough, stronglyConnected } from "./scc.ts";
import { compileSpec, type SpecIR } from "./spec-ir.ts";
import type { Span } from "./span.ts";
import type { Verdict } from "./verdict.ts";

/** The slice of the snapshot rules need. Kept here so `check` does not import `map`. */
interface SnapshotView {
  snapshotId: string;
  nodes: Record<string, { kind: string; file: string | null; line: number | null; col?: number | null; members?: string; class?: true }>;
  edges: { kind: string; source: string; target: string | null; file: string | null; line: number; col: number; resolution: string; reason?: string; via?: string; typeOnly?: true; provenance?: string; docblock?: string; site?: string; owner?: string; binding?: string; scope?: string }[];
  coverage: { kind: string; file: string; line: number; col: number; reason: string; source: string | null }[];
  exports: { module: string; name: string; kind: string; form?: string; from?: string; reason?: string }[];
}

interface Rule {
  a: string;
  b: string[];
  file: string;
  span: Span;
  text: string;
  /** From the generated baseline: a manual rule over the same areas overrides it. */
  generated: boolean;
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
  /** An import of types only (TypeScript `import type`): erased before the code runs, so no cycle. */
  typeOnly: boolean;
  file: string;
  line: number;
  col: number;
  resolution: string;
  /** `file:line:col` of the docblock the edge rests on (PHP `@var`, `@param`): the verdict names it, since PHP does not check it. */
  docblock?: string;
  /** A call the framework makes by its config (ADR 0022): the fact in words, with its config line. */
  config?: string;
}

/** The note a verdict adds to a dependency that exists only thanks to a docblock, or only in a framework's config. */
function docblockNote(edge: Pick<UseEdge, "docblock" | "config">): string {
  return edge.config ? ` through ${edge.config}` : edge.docblock ? ` (typed by a docblock at ${edge.docblock})` : "";
}

/** Via values of the calls a framework makes by its config: the module whose config declares one depends on its target. */
const CONFIG_VIA = new Set(["preference", "argument", "plugin:before", "plugin:around", "plugin:after"]);

/** A config edge in words for a K102: `the preference `I → C` (app/etc/di.xml:12)`. */
function configNote(edge: { via?: string; binding?: string; site?: string; scope?: string }): string {
  const at = edge.site ? edge.site.replace(/:\d+$/, "") : "?";
  const scope = edge.scope && edge.scope !== "global" ? `, scope ${edge.scope}` : "";
  const what = edge.via === "preference" ? `the preference ${edge.binding ?? ""}` : edge.via === "argument" ? (edge.binding ?? "a constructor argument") : `the ${edge.binding ?? "plugin"} (${edge.via})`;
  return `${what} (${at}${scope})`;
}

/** `file:line:col` → its parts; null for another shape. */
function siteAt(site: string | undefined): { file: string; line: number; col: number } | null {
  const m = site === undefined ? null : /^(.*):(\d+):(\d+)$/.exec(site);
  return m ? { file: m[1]!, line: Number(m[2]), col: Number(m[3]) } : null;
}

export const UNORDERED_LAYERS: ReadonlySet<string> = new Set(SYNTHETIC_LAYERS);

export interface RuleReport {
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
}

export function checkRules(docs: readonly Document[], index: Index, snapshot: SnapshotView | null = null): Diagnostic[] {
  const compiled = compileSpec(docs);
  return [...compiled.diagnostics, ...evaluateRules(compiled.spec, index, snapshot, docs).diagnostics];
}

/** Kind of an id the way `evaluateRules` sees it: a fn, type, or event rule applies nowhere. */
export function dependencyKindOf(
  source: readonly Document[] | SpecIR,
  index: Index,
  nodes: Readonly<Record<string, { kind: string }>> | undefined,
): (id: string) => string | undefined {
  const spec = specOf(source);
  return (id: string): string | undefined => nodes?.[id]?.kind ?? index.decls.get(id)?.kind ?? (index.planned.has(id) ? `planned ${plannedDecl(spec, id)}` : undefined);
}

/** Whether `from` depending on `to` is forbidden by the deny that wins under `format`. */
export function blocksDependency(
  spec: SpecIR,
  from: string,
  to: string,
  kindOf: (id: string) => string | undefined = () => undefined,
  format: RuleFormat = 1,
): boolean {
  return denyingRule(spec, from, to, kindOf, format) !== null;
}

/**
 * The deny that wins `from → to`, or null. `aside` is the incomparable allow
 * a K102 should name: empty when the deny won because it was more specific.
 */
export function denyingRule(
  spec: SpecIR,
  from: string,
  to: string,
  kindOf: (id: string) => string | undefined = () => undefined,
  format: RuleFormat = 1,
): { text: string; file: string; line: number; aside: string } | null {
  const within = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const collected = collectRules(spec, kindOf);
  const hits = ruleHits(collected, from, to, within);
  if (format === 1) {
    const match = specific(collected, from, to, within);
    if (match?.kind !== "deny") return null;
    const hit = hits.find((item) => item.rule === match.rule && item.kind === "deny");
    if (hit === undefined) return null;
    return { text: match.rule.text, file: match.rule.file, line: match.rule.span.start.line, aside: incomparableAside(hit, hits, 1) };
  }
  const decision = decide(hits, format);
  if (!decision.denyWins) return null;
  const chosen = [...decision.winners].sort(byHit)[0];
  if (chosen === undefined || chosen.kind !== "deny") return null;
  return { text: chosen.rule.text, file: chosen.rule.file, line: chosen.rule.span.start.line, aside: incomparableAside(chosen, hits, format) };
}

export function evaluateRules(spec: SpecIR, index: Index, snapshot: SnapshotView | null, docs: readonly Document[] = [], format: RuleFormat = 1): RuleReport {
  const kindOf = (id: string): string | undefined => snapshot?.nodes[id]?.kind ?? index.decls.get(id)?.kind ?? (index.planned.has(id) ? `planned ${plannedDecl(spec, id)}` : undefined);
  const rules = collectRules(spec, kindOf);
  const warnings = incomparableWarnings(rules, format);
  if (!snapshot) {
    if (!rules.any) return { diagnostics: [...rules.diagnostics, ...warnings], verdicts: [] };
    // One verdict for every rule line, on the first of them: a flow file sorted earlier is no rule.
    const first = firstRuleLine(spec);
    const file = first?.file ?? docs[0]?.path ?? "keylang";
    const verdict: Verdict = {
      verdict: "unverified",
      criterion: "rules",
      area: file,
      snapshotId: null,
      specHash: hashText(noSnapshotSpec(spec)),
      file,
      line: first?.span.start.line ?? 1,
      col: first?.span.start.col ?? 1,
      code: null,
      message: "no snapshot",
    };
    return { diagnostics: [...rules.diagnostics, ...warnings], verdicts: [verdict] };
  }
  const report = evaluateOnSnapshot(rules, index, snapshot, [...index.planned.keys()], format);
  return { diagnostics: [...rules.diagnostics, ...warnings, ...report.diagnostics], verdicts: report.verdicts };
}

function specOf(source: readonly Document[] | SpecIR): SpecIR {
  if ("rules" in source) return source;
  return compileSpec(source).spec;
}

function plannedDecl(spec: SpecIR, id: string): string {
  return spec.planned.find((item) => item.id === id)?.decl ?? "fn";
}

function evaluateOnSnapshot(rules: EvaluatedRules, index: Index, snapshot: SnapshotView, planned: readonly string[], format: RuleFormat): RuleReport {
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
    // A call the framework makes by its config belongs to the module whose config declares it (ADR 0022), at that config line.
    const configured = edge.via !== undefined && CONFIG_VIA.has(edge.via) ? siteAt(edge.site) : null;
    const from = configured && edge.owner !== undefined ? edge.owner : scopeOf(edge.source);
    const to = scopeOf(edge.target);
    if (!from || !to) continue;
    const fromUnit = unitOf(from);
    const toUnit = unitOf(to);
    if (fromUnit === toUnit) {
      if (edge.kind !== "call" && edge.kind !== "type" && edge.resolution === "resolved" && !edge.typeOnly) selfLoops.add(fromUnit);
      continue;
    }
    edges.push({
      from,
      to,
      fromUnit,
      toUnit,
      kind: edge.kind,
      typeOnly: edge.typeOnly === true,
      file: configured?.file ?? edge.file,
      line: configured?.line ?? edge.line,
      col: configured?.col ?? edge.col,
      resolution: edge.resolution,
      ...(edge.provenance === "docblock" ? { docblock: edge.docblock ?? `${edge.file}:${edge.line}:${edge.col}` } : {}),
      ...(configured ? { config: configNote(edge) } : {}),
    });
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
  // The dependency holes, indexed once in coverage order: under every ID prefix of their source, and by file.
  // A module's hole is then the first entry of its own lists, the one the coverage scan used to find.
  const bySource = new Map<string, IndexedHole[]>();
  const byFile = new Map<string, IndexedHole[]>();
  snapshot.coverage.forEach((item, order) => {
    if (!DEPENDENCY_HOLES.has(item.kind) || item.reason === "unsupported construct `computed call`" || (item.kind === "unsupported" && inDeclaration(item.source))) return;
    const entry = { item, order };
    const source = item.source;
    // `a.b.c` is under `a.b.c`, `a.b` and `a`.
    if (source !== null) for (let end = source.length; end > 0; end = source.lastIndexOf(".", end - 1)) listAt(bySource, source.slice(0, end)).push(entry);
    listAt(byFile, item.file).push(entry);
  });
  const dependencyHoleIn = (moduleId: string, ignore?: ReadonlySet<string>): Hole | null => {
    const file = snapshot.nodes[moduleId]?.file;
    const open = (entry: IndexedHole): boolean => !ignore?.has(entry.item.kind);
    const own = bySource.get(moduleId)?.find(open);
    const inFile = file === null || file === undefined ? undefined : byFile.get(file)?.find(open);
    const first = own && inFile ? (own.order <= inFile.order ? own : inFile) : (own ?? inFile);
    return first?.item ?? null;
  };
  const holeAmong = (ids: Iterable<string>, ignore?: ReadonlySet<string>): Hole | null => {
    for (const id of [...ids].sort()) {
      const hole = dependencyHoleIn(id, ignore);
      if (hole) return hole;
    }
    return null;
  };
  // A hole whose scope has no node — a directory that could not be read — may hide modules of any ID under
  // that scope: it is in the area of a rule over the scope, above it or below it (null: any area).
  const orphans = snapshot.coverage.filter((item) => DEPENDENCY_HOLES.has(item.kind) && item.source !== null && snapshot.nodes[item.source] === undefined);
  const scopeHole = (scope: string | null): Hole | null => orphans.find((item) => scope === null || within(item.source!, scope) || within(scope, item.source!)) ?? null;

  const pushFail = (code: Exclude<Diagnostic["code"], "K005">, file: string, line: number, col: number, message: string, criterion: string, area: string, spec = criterion, target?: string): void => {
    diagnostics.push(diagnostic(code, file, pointAt(line, col), message, target));
    verdicts.push(base(snapshot, criterion, area, "fail", file, line, col, code, message, spec));
  };
  /** `hole`: the coverage entry that leaves the rule unverified, named by its position on the verdict. */
  const pushUnverified = (file: string, line: number, col: number, criterion: string, area: string, reason: string, spec = criterion, hole: Hole | null = null): void => {
    const verdict = base(snapshot, criterion, area, "unverified", file, line, col, null, reason, spec);
    verdicts.push(hole === null ? verdict : { ...verdict, hole: holeAt(hole) });
  };
  const pushOk = (file: string, span: Span, criterion: string, area: string, message: string, spec = criterion): void => {
    verdicts.push(base(snapshot, criterion, area, "ok", file, span.start.line, span.start.col, null, message, spec));
  };

  // One dependency is one finding per rule, however many edges (import, call, a type of its class) show it.
  const deniedPairs = new Map<Rule, Set<string>>();
  const layeredPairs = new Set<string>();
  /** Layers named by a K101, or by an upward edge a `deny` already reported: their orders are not `ok`. */
  const violated = new Set<string>();
  const failedDenies = new Set<Rule>();
  /** A `deny` that lost, and the rules that decided its edges. */
  const overridden = new Map<Rule, OverrideNote[]>();
  /** Upward pairs an `allow` kept inside the order, and the allow lines that did it. */
  const allowedUp = new Map<string, Set<string>>();
  /** Pairs of an architecture module and a module `outside` it already reported (K107). */
  const outsidePairs = new Set<string>();
  for (const edge of edges) {
    if (edge.resolution !== "resolved") continue;
    const pair = `${edge.fromUnit}\0${edge.toUnit}`;
    // `outside` in keylang.json is a rule of its own: no `allow` lifts it, and it needs no line in the rules.
    if (layerOf(edge.toUnit) === OUTSIDE_LAYER && layerOf(edge.fromUnit) !== OUTSIDE_LAYER && !outsidePairs.has(pair)) {
      outsidePairs.add(pair);
      const file = snapshot.nodes[edge.toUnit]?.file;
      pushFail("K107", edge.file, edge.line, edge.col, `divergence: \`${edge.fromUnit}\` depends on \`${edge.toUnit}\`${docblockNote(edge)}${file ? ` (${file})` : ""}, which \`outside\` in keylang.json puts outside the architecture`, OUTSIDE_LAYER, edge.fromUnit);
    }
    const hits = ruleHits(rules, edge.from, edge.to, within);
    const decision = decide(hits, format);
    const deciders = decision.winners;
    const denyWins = decision.denyWins;
    for (const hit of hits) {
      if (hit.kind !== "deny" || deciders.includes(hit)) continue;
      const notes = overridden.get(hit.rule) ?? [];
      for (const winner of deciders) {
        notes.push({
          text: winner.rule.text,
          file: winner.rule.file,
          line: winner.rule.span.start.line,
          incomparable: crossRules(hit, winner),
          baseline: sameAreas(hit, winner) && hit.rule.generated && !winner.rule.generated,
          winnerScore: winner.score,
          denyScore: hit.score,
        });
      }
      overridden.set(hit.rule, notes);
    }
    const fromLayer = layerOf(edge.fromUnit);
    const toLayer = layerOf(edge.toUnit);
    const upward = fromLayer !== toLayer ? layerViolation(rules, fromLayer, toLayer) : null;
    if (denyWins) {
      for (const hit of deciders) {
        failedDenies.add(hit.rule);
        const seen = deniedPairs.get(hit.rule) ?? new Set<string>();
        deniedPairs.set(hit.rule, seen);
        if (seen.has(pair)) continue;
        seen.add(pair);
        pushFail("K102", edge.file, edge.line, edge.col, `divergence: \`${edge.from}\` depends on \`${edge.to}\`${docblockNote(edge)}, which is denied by \`${hit.rule.text}\` (${hit.rule.file}:${hit.rule.span.start.line})${incomparableAside(hit, hits, format)}`, hit.rule.text, edge.from);
      }
      // The deny is the finding. The layers line stays without `ok` and without a second K101.
      if (upward) {
        violated.add(fromLayer);
        violated.add(toLayer);
      }
      continue;
    }
    if (deciders.some((hit) => hit.kind === "allow")) {
      if (upward) {
        const noted = allowedUp.get(`${fromLayer}\0${toLayer}`) ?? new Set<string>();
        for (const hit of deciders) if (hit.kind === "allow") noted.add(hit.rule.text);
        allowedUp.set(`${fromLayer}\0${toLayer}`, noted);
      }
      continue;
    }
    if (!upward) continue;
    violated.add(fromLayer);
    violated.add(toLayer);
    if (layeredPairs.has(pair)) continue;
    layeredPairs.add(pair);
    pushFail("K101", edge.file, edge.line, edge.col, `divergence: \`${edge.fromUnit}\` depends on \`${edge.toUnit}\`${docblockNote(edge)} (${upward})`, `layers ${fromLayer} ${toLayer}`, edge.fromUnit, componentSpec(rules, toLayer));
  }

  for (const order of rules.orders) {
    if (order.layers.some((layer) => violated.has(layer))) continue;
    // The area is the whole connected order, plus every layer that is in no order (nested, external, unassigned).
    const component = layerComponent(rules, order.layers[0] ?? "");
    const area = [...units].filter((id) => {
      const layer = layerOf(id);
      return component.has(layer) || !rules.ordered.has(layer);
    });
    const inArea = (layer: string): boolean => component.has(layer) || !rules.ordered.has(layer);
    const orphan = orphans.find((item) => item.kind !== "unassigned-file" && inArea(layerOf(item.source!)));
    // `unassigned-file` names a file whose edges are known. Another hole in that file still counts.
    const hole = holeAmong(area, UNASSIGNED_FILE) ?? orphan ?? null;
    const names = order.layers.map((layer) => `\`${layer}\``).join(", ");
    const allows = [...allowedUp.entries()]
      .filter(([key]) => {
        const [from, to] = key.split("\0");
        return from !== undefined && to !== undefined && component.has(from) && component.has(to);
      })
      .flatMap(([, texts]) => [...texts])
      .sort();
    const uniqueAllows = [...new Set(allows)];
    const allowed = uniqueAllows.length > 0 ? ` or is allowed by ${uniqueAllows.map((text) => `\`${text}\``).join(", ")}` : "";
    if (hole) pushUnverified(order.file, order.span.start.line, order.span.start.col, order.text, order.layers.join(","), `no dependency against the order among the known edges, but ${holeText(hole)}`, order.text, hole);
    else pushOk(order.file, order.span, order.text, order.layers.join(","), `convergence: every dependency between ${names} points down${allowed}, and no dependency hole in the area`, order.text);
  }

  // A module the source imports a name from may re-export the denied target: while it is transparent the edge
  // runs through it to the target, so when it is opaque (excluded, unparsed) it is in the deny's area too.
  // A re-export chain is followed; a plain import of an import is the imported module's own dependency.
  const importsOf = new Map<string, string[]>();
  const reexportsOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.resolution !== "resolved" || (edge.kind !== "import" && edge.kind !== "reexport")) continue;
    listAt(importsOf, edge.from).push(edge.to);
    if (edge.kind === "reexport") listAt(reexportsOf, edge.from).push(edge.to);
  }
  const importedBy = (scope: readonly string[]): string[] => {
    const inScope = new Set(scope);
    const seen = new Set<string>();
    const stack = scope.flatMap((id) => importsOf.get(id) ?? []);
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || seen.has(id) || inScope.has(id)) continue;
      seen.add(id);
      for (const next of reexportsOf.get(id) ?? []) stack.push(next);
    }
    return [...seen];
  };

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
    // An imported file outside every layer has known edges; any other hole in it may hide a re-export of a target.
    const hole = holeAmong(scope) ?? holeAmong(importedBy(scope), UNASSIGNED_FILE) ?? scopeHole(deny.a);
    const winners = overridden.get(deny);
    if (hole) pushUnverified(...at, deny.text, area, holeText(hole), deny.text, hole);
    else if (scope.length === 0) pushOk(deny.file, deny.span, deny.text, area, `convergence: no module under \`${deny.a}\` yet, so no edge to ${targets}`);
    else if (winners && winners.length > 0) pushOk(deny.file, deny.span, deny.text, area, overrideEvidence(deny, targets, winners));
    else pushOk(deny.file, deny.span, deny.text, area, `convergence: no edge from \`${deny.a}\` to ${targets} and no dependency hole in the area`);
  }

  if (rules.entries.length > 0) {
    const reachable = new Set<string>();
    // An entry naming a layer or a directory seeds every module under it; it is not itself a module.
    const stack = rules.entries.flatMap((id) => {
      // A planned ID seeds only the units under it, not the module of its parent.
      const module = planned.includes(id) && !isModule(id) ? null : scopeOf(id);
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
    const entrySpec = [...rules.entryNodes]
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.span.start.line - b.span.start.line))
      .map((entry) => entry.text)
      .join("\n");
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
        pushUnverified(file, line, col, "entry", module, `not reached, but ${holeText(reachableHole)} may reach it`, entrySpec, reachableHole);
      } else {
        // A warning, not a verdict: it never fails the check, so no consumer may count it as `fail`.
        diagnostics.push({ ...diagnostic("K103", file, pointAt(line, col), `absence: module \`${module}\` is not reachable from any \`entry\``), criterion: "entry", area: module, specHash: hashText(entrySpec) });
      }
    }
    if (unreached === 0 && unknownModules !== null) {
      for (const entry of rules.entryNodes) pushUnverified(entry.file, entry.span.start.line, entry.span.start.col, "entry", rules.entries.join(","), `every known module is reachable from \`entry\`, but ${holeText(unknownModules)}`, entry.text, unknownModules);
    } else if (unreached === 0) {
      for (const entry of rules.entryNodes) pushOk(entry.file, entry.span, "entry", rules.entries.join(","), `convergence: every module is reachable from \`entry\``, entry.text);
    }
  }

  for (const rule of rules.exportsRules) {
    const criterion = `exports ${rule.module}`;
    const spec = `${criterion}: ${[...rule.names].sort().join(", ")}`;
    const at = [rule.file, rule.span.start.line, rule.span.start.col] as const;
    const node = snapshot.nodes[rule.module];
    if (node?.kind !== "module") {
      // One that exists only as an intention has no exports to compare yet; an unknown ID is K001 already.
      if (planned.includes(rule.module)) pushUnverified(...at, criterion, rule.module, `\`${rule.module}\` is planned: no code yet`, spec);
      else if (index.lookup(rule.module).kind !== "missing") pushUnverified(...at, criterion, rule.module, `\`${rule.module}\` is not a module of the snapshot`, spec);
      continue;
    }
    // Only the module's own table: `purchase.ts` does not export what `purchase/buy.ts` does.
    const actual = snapshot.exports.filter((row) => row.module === rule.module);
    // The table keeps a name as the code writes it, maybe in NFD (`cafe` + U+0301); names compare in NFC.
    const names = new Set(actual.map((row) => row.name.normalize("NFC")));
    // An `export *` from an unknown module may supply any listed name.
    const unknown = actual.find((row) => row.name === "*");
    let failed = false;
    for (const row of actual) {
      if (row.name === "*" || rule.names.has(row.name.normalize("NFC"))) continue;
      failed = true;
      // A name a Python module without `__all__` imports is public too, and no declaration of the module: say where it is from.
      const how = row.form === "reexport" && row.from ? `${row.kind}, re-exported from \`${row.from}\`` : row.form && row.form !== "reexport" ? `${row.kind}, ${row.form}` : row.from ? `${row.kind}, imported from \`${row.from}\`` : row.kind;
      pushFail("K104", ...at, `divergence: \`${rule.module}\` exports \`${row.name}\` (${how}), which is not listed in \`exports\``, criterion, rule.module, spec, `${rule.module}.${row.name.normalize("NFC")}`);
    }
    const missing = [...rule.names].sort().filter((name) => !names.has(name));
    // An opaque module (excluded, or with a syntax error) may export what the table does not show.
    const opaque = node.members === "opaque";
    if (opaque && missing.length > 0 && !failed) {
      pushUnverified(...at, criterion, rule.module, `opaque module \`${rule.module}\` may export ${missing.map((name) => `\`${name}\``).join(", ")}`, spec);
      continue;
    }
    if (!unknown && !opaque) {
      for (const name of missing) {
        failed = true;
        pushFail("K104", ...at, `absence: \`${rule.module}\` does not export \`${name}\``, criterion, rule.module, spec, `${rule.module}.${name}`);
      }
    }
    if (failed) continue;
    if (unknown) pushUnverified(...at, criterion, rule.module, unknown.reason ?? "re-export from an opaque module", spec);
    // The table of an opaque module may lack an export, which would be a K104: the match is no convergence.
    else if (opaque) pushUnverified(...at, criterion, rule.module, `opaque module \`${rule.module}\` may export more than its table shows`, spec);
    else pushOk(rule.file, rule.span, criterion, rule.module, `convergence: the export table is exactly ${[...rule.names].sort().join(", ")}`, spec);
  }

  if (rules.noCycles.length > 0) {
    const adj = new Map<string, Set<string>>();
    for (const edge of edges) {
      // A cycle is one the code runs: an import of types only is erased before that.
      if (edge.resolution !== "resolved" || (edge.kind !== "import" && edge.kind !== "reexport") || edge.typeOnly) continue;
      const list = adj.get(edge.fromUnit) ?? new Set<string>();
      list.add(edge.toUnit);
      adj.set(edge.fromUnit, list);
    }
    for (const module of selfLoops) adj.set(module, new Set([...(adj.get(module) ?? []), module]));
    const components = stronglyConnected(adj);
    for (const rule of rules.noCycles) {
      // A planned module under a file module is not that module: no code, so nothing to check yet.
      if (rule.under !== null && planned.includes(rule.under) && !isModule(rule.under)) {
        pushUnverified(rule.file, rule.span.start.line, rule.span.start.col, "no-cycles", rule.under, `\`${rule.under}\` is planned: no code yet`, `no-cycles ${rule.under}`);
        continue;
      }
      // A class is in a cycle when its file is.
      const scopeModule = rule.under === null ? null : scopeOf(rule.under);
      const under = rule.under === null ? null : scopeModule === null ? rule.under : unitOf(scopeModule);
      const inScope = (id: string): boolean => under === null || within(id, under);
      const relevant = components.filter((component) => component.some(inScope));
      const spec = `no-cycles ${rule.under ?? "*"}`;
      // A cycle may run through an import keylang could not resolve. Under a module the area is that
      // module, its submodules, and whatever they reach by import or re-export. `unassigned-file` is not
      // a hole there: the file's edges are known. A global `no-cycles` still counts it.
      const reached = new Set<string>();
      if (under !== null) {
        const stack = [...units].filter(inScope);
        while (stack.length > 0) {
          const id = stack.pop();
          if (id === undefined || reached.has(id)) continue;
          reached.add(id);
          for (const next of adj.get(id) ?? []) stack.push(next);
        }
      }
      const orphanHere = (item: (typeof orphans)[number]): boolean => {
        if (under !== null && item.kind === "unassigned-file") return false;
        if (under === null) return true;
        const source = item.source!;
        for (const id of reached) if (source === id || within(source, id) || within(id, source)) return true;
        return false;
      };
      const reachedOrphan = orphans.find(orphanHere);
      const hole =
        relevant.length === 0
          ? under === null
            ? (holeAmong(units) ?? scopeHole(null))
            : (holeAmong(reached, UNASSIGNED_FILE) ?? reachedOrphan ?? null)
          : null;
      if (hole) {
        pushUnverified(rule.file, rule.span.start.line, rule.span.start.col, "no-cycles", rule.under ?? "*", `no cycle among the known imports, but ${holeText(hole)}`, spec, hole);
        continue;
      }
      if (relevant.length === 0) {
        pushOk(rule.file, rule.span, "no-cycles", rule.under ?? "*", `convergence: no import cycle${rule.under ? ` through \`${rule.under}\`` : ""}`, spec);
        continue;
      }
      for (const component of relevant) {
        const focus = component.find(inScope) ?? component[0] ?? "";
        const cycle = cycleThrough(adj, new Set(component), focus);
        const route = [...cycle, cycle[0]].filter((id) => id !== undefined).join(" → ");
        pushFail("K105", rule.file, rule.span.start.line, rule.span.start.col, `divergence: dependency cycle ${route}`, "no-cycles", rule.under ?? focus, spec);
      }
    }
  }
  return { diagnostics, verdicts };
}

const DEPENDENCY_HOLES = new Set(["unresolved-import", "parse-error", "unsupported", "unassigned-file", "skipped-file", "unresolved-binding"]);

/** A coverage entry of the snapshot: a hole when its kind is one of `DEPENDENCY_HOLES`. */
type Hole = SnapshotView["coverage"][number];

/** A hole and its place in the coverage list, which decides between two holes of one module. */
interface IndexedHole {
  item: Hole;
  order: number;
}

function listAt<T>(map: Map<string, T[]>, key: string): T[] {
  const list = map.get(key);
  if (list) return list;
  const created: T[] = [];
  map.set(key, created);
  return created;
}

/** `unresolved import (src/a.ts:1:19)`: the hole in a verdict's reason. */
function holeText(hole: Hole): string {
  return `${hole.reason} (${holeAt(hole)})`;
}

/** `src/a.ts:1:19`: where the hole is, the `hole` field of a verdict. */
function holeAt(hole: Hole): string {
  return `${hole.file}:${hole.line}:${hole.col}`;
}
/** A file outside every layer: its edges are known, so a scoped cycle or a layer order does not treat it as a hole. */
const UNASSIGNED_FILE = new Set(["unassigned-file"]);

/** Why a dependency between two layers breaks the layer orders, or null. */
function layerViolation(rules: EvaluatedRules, fromLayer: string, toLayer: string): string | null {
  if (rules.above.get(fromLayer)?.has(toLayer)) return `layers say \`${fromLayer} < ${toLayer}\`, dependencies must point down`;
  if (!rules.ordered.has(fromLayer) && rules.ordered.has(toLayer) && !rules.unordered.has(toLayer)) {
    return `\`${fromLayer}\` is outside the layer order; add \`allow ${fromLayer} ${toLayer}\` to permit this`;
  }
  return null;
}

/** Layers joined to `layer` by the undirected partial order, including `layer` itself. */
function layerComponent(rules: EvaluatedRules, layer: string): Set<string> {
  const seen = new Set<string>();
  const stack = [layer];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const up of rules.above.get(current) ?? []) stack.push(up);
    for (const [lower, ups] of rules.above) if (ups.has(current)) stack.push(lower);
  }
  return seen;
}

/** Canonical texts of the `layers` lines in `layer`'s connected order, one hash input. */
function componentSpec(rules: EvaluatedRules, layer: string): string {
  const component = layerComponent(rules, layer);
  return rules.orders
    .filter((order) => order.layers.some((item) => component.has(item)))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.span.start.line - b.span.start.line))
    .map((order) => order.text)
    .join("\n");
}

interface RuleHit {
  kind: "allow" | "deny";
  score: number;
  rule: Rule;
  /** The deepest target of this rule that covers the edge. */
  target: string;
}

interface OverrideNote {
  text: string;
  file: string;
  line: number;
  incomparable: boolean;
  /** A manual rule over the same areas as this baseline deny. */
  baseline: boolean;
  winnerScore: number;
  denyScore: number;
}

/** Every allow or deny that matches the edge, scored by the deepest target it names. */
function ruleHits(rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean): RuleHit[] {
  const hits: RuleHit[] = [];
  const consider = (list: Rule[], kind: "allow" | "deny"): void => {
    for (const rule of list) {
      if (!within(from, rule.a)) continue;
      let score = -1;
      let target = "";
      for (const item of rule.b) {
        if (!within(to, item)) continue;
        const next = scopeDepth(rule.a) + scopeDepth(item);
        if (next > score) {
          score = next;
          target = item;
        }
      }
      if (score >= 0) hits.push({ kind, score, rule, target });
    }
  };
  consider(rules.denies, "deny");
  consider(rules.allows, "allow");
  return hits;
}

function byHit(a: RuleHit, b: RuleHit): number {
  if (a.rule.file !== b.rule.file) return a.rule.file < b.rule.file ? -1 : 1;
  return a.rule.span.start.line - b.rule.span.start.line;
}

/** `a` is strictly more specific than `b`: neither of its areas is wider, and one is narrower. */
function dominates(a: RuleHit, b: RuleHit): boolean {
  const source = areaWithin(a.rule.a, b.rule.a);
  const target = areaWithin(a.target, b.target);
  return source && target && (a.rule.a !== b.rule.a || a.target !== b.target);
}

/** One rule is narrower on the source and the other on the target. */
function crossRules(a: RuleHit, b: RuleHit): boolean {
  const sourceA = a.rule.a !== b.rule.a && areaWithin(a.rule.a, b.rule.a);
  const sourceB = a.rule.a !== b.rule.a && areaWithin(b.rule.a, a.rule.a);
  const targetA = a.target !== b.target && areaWithin(a.target, b.target);
  const targetB = a.target !== b.target && areaWithin(b.target, a.target);
  return (sourceA && targetB) || (sourceB && targetA);
}

function sameAreas(a: RuleHit, b: RuleHit): boolean {
  return a.rule.a === b.rule.a && a.target === b.target;
}

/** The baseline is a lower rule layer: a manual hit over the same areas drops a generated one. */
function overManualRules(hits: readonly RuleHit[]): RuleHit[] {
  return hits.filter((hit) => !(hit.rule.generated && hits.some((other) => !other.rule.generated && sameAreas(other, hit))));
}

function areaWithin(id: string, scope: string): boolean {
  return id === scope || id.startsWith(`${scope}.`);
}

/**
 * First a manual hit drops a baseline hit over the same areas (both formats).
 * Format 1: the greatest depth sum, and every `deny` on that sum.
 * Format 2: drop dominated hits; any undominated `deny` wins (deny-overrides).
 */
function decide(all: readonly RuleHit[], format: RuleFormat): { winners: RuleHit[]; denyWins: boolean } {
  const hits = overManualRules(all);
  if (format === 1) {
    const best = hits.reduce((score, hit) => Math.max(score, hit.score), -1);
    const top = hits.filter((hit) => hit.score === best);
    const denyWins = top.some((hit) => hit.kind === "deny");
    return { winners: denyWins ? top.filter((hit) => hit.kind === "deny") : top, denyWins };
  }
  const undominated = hits.filter((hit) => !hits.some((other) => other !== hit && dominates(other, hit)));
  const denies = undominated.filter((hit) => hit.kind === "deny");
  if (denies.length > 0) return { winners: denies, denyWins: true };
  return { winners: undominated, denyWins: false };
}

function incomparableAside(deny: RuleHit, hits: readonly RuleHit[], format: RuleFormat): string {
  const seen = new Set<Rule>();
  const parts: string[] = [];
  const lost = hits
    .filter((hit) => hit.kind === "allow" && crossRules(deny, hit) && (format === 2 || hit.score <= deny.score))
    .sort(byHit);
  for (const allow of lost) {
    if (seen.has(allow.rule)) continue;
    seen.add(allow.rule);
    const loc = `${allow.rule.file}:${allow.rule.span.start.line}`;
    if (format === 2) parts.push(`; deny-overrides beats incomparable \`${allow.rule.text}\` (${loc})`);
    else if (allow.score === deny.score) parts.push(`; incomparable \`${allow.rule.text}\` (${loc}) loses on a depth-sum tie`);
    else parts.push(`; incomparable \`${allow.rule.text}\` (${loc}) loses on depth sum (${deny.score} > ${allow.score})`);
  }
  return parts.join("");
}

function overrideEvidence(deny: Rule, targets: string, notes: readonly OverrideNote[]): string {
  const manual = [...new Set(notes.filter((note) => note.baseline).map((note) => note.text))].sort();
  const specific = [...new Set(notes.filter((note) => !note.incomparable && !note.baseline).map((note) => note.text))].sort();
  const cross = [...new Map(notes.filter((note) => note.incomparable).map((note) => [`${note.file}:${note.line}:${note.text}`, note])).values()].sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );
  const head = `convergence: the edges from \`${deny.a}\` to ${targets} are decided by `;
  const tail = "; no other edge and no dependency hole in the area";
  const quoted = (texts: readonly string[]): string => texts.map((text) => `\`${text}\``).join(", ");
  const parts = cross.map((note) => `incomparable \`${note.text}\` (${note.file}:${note.line}) on depth sum (${note.winnerScore} > ${note.denyScore})`);
  if (specific.length > 0) parts.push(`${parts.length > 0 ? "by " : ""}more specific rules (${quoted(specific)})`);
  if (manual.length > 0) parts.push(`${parts.length > 0 ? "by " : ""}manual rules over the baseline (${quoted(manual)})`);
  return `${head}${parts.join(" and ")}${tail}`;
}

/** One K106 per incomparable allow/deny line pair, on the allow line. Static: no snapshot required. */
function incomparableWarnings(rules: EvaluatedRules, format: RuleFormat): Diagnostic[] {
  const out: Diagnostic[] = [];
  const ruleset = [...rules.allows, ...rules.denies];
  for (const allow of rules.allows) {
    for (const deny of rules.denies) {
      let best: { src: string; tgt: string; allowScore: number; denyScore: number } | null = null;
      for (const allowTarget of allow.b) {
        for (const denyTarget of deny.b) {
          const sourceAllow = allow.a !== deny.a && areaWithin(allow.a, deny.a);
          const sourceDeny = allow.a !== deny.a && areaWithin(deny.a, allow.a);
          const targetAllow = allowTarget !== denyTarget && areaWithin(allowTarget, denyTarget);
          const targetDeny = allowTarget !== denyTarget && areaWithin(denyTarget, allowTarget);
          if (!((sourceAllow && targetDeny) || (sourceDeny && targetAllow))) continue;
          const allowScore = scopeDepth(allow.a) + scopeDepth(allowTarget);
          const denyScore = scopeDepth(deny.a) + scopeDepth(denyTarget);
          if (allowScore <= denyScore) continue;
          const src = sourceAllow ? allow.a : deny.a;
          const tgt = targetAllow ? allowTarget : denyTarget;
          const gap = allowScore - denyScore;
          const key = `${src} ${tgt}`;
          if (best === null || gap > best.allowScore - best.denyScore || (gap === best.allowScore - best.denyScore && key < `${best.src} ${best.tgt}`)) {
            best = { src, tgt, allowScore, denyScore };
          }
        }
      }
      if (best === null) continue;
      const { src, tgt, allowScore, denyScore } = best;
      if (ruleset.some((rule) => rule.a === src && rule.b.includes(tgt))) continue;
      const where = `${deny.file}:${deny.span.start.line}`;
      const add = `add \`allow ${src} ${tgt}\` or \`deny ${src} ${tgt}\``;
      const message =
        format === 1
          ? `\`${allow.text}\` and \`${deny.text}\` (${where}) are incomparable; allow wins on depth sum (${allowScore} > ${denyScore}); ${add}`
          : `\`${allow.text}\` and \`${deny.text}\` (${where}) are incomparable; deny wins (deny-overrides); ${add}`;
      out.push({ ...diagnostic("K106", allow.file, allow.span, message), criterion: allow.text, area: `${src} ${tgt}`, specHash: hashText(allow.text) });
    }
  }
  return out;
}

/**
 * Canonical text of the rule line at `file:line`, or null when that line is not a rule.
 * K101, K103, and an unreachable module's entry verdict hash several lines themselves.
 */
export function canonicalRuleSpec(spec: SpecIR, file: string, line: number): string | null {
  const rules = collectRules(spec, () => undefined);
  const here = (span: Span, path: string): boolean => path === file && span.start.line === line;
  const entry = rules.entryNodes.find((item) => here(item.span, item.file));
  if (entry) return entry.text;
  const order = rules.orders.find((item) => here(item.span, item.file));
  if (order) return order.text;
  const rule = [...rules.denies, ...rules.allows].find((item) => here(item.span, item.file));
  if (rule) return rule.text;
  const cycle = rules.noCycles.find((item) => here(item.span, item.file));
  if (cycle) return `no-cycles ${cycle.under ?? "*"}`;
  const exported = rules.exportsRules.find((item) => here(item.span, item.file));
  if (exported) return `exports ${exported.module}: ${[...exported.names].sort().join(", ")}`;
  return null;
}

/** Every rule line of the specs, valid or not, joined in file and line order. The hash of `no snapshot`. A `layers` line with no order is left out; a rejected order still counts. */
export function noSnapshotSpec(spec: SpecIR): string {
  const lines = [
    ...spec.rules.filter((rule) => rule.kind !== "layers" || rule.layers.length > 0).map((rule) => ({ file: rule.file, line: rule.span.start.line, text: rule.text })),
    ...spec.rejectedLayers.filter((line) => line.order.length > 0).map((line) => ({ file: line.file, line: line.span.start.line, text: line.text })),
  ];
  lines.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return lines.map((line) => line.text).join("\n");
}

/** The first rule line in file, line and column order, a rejected `layers` line included; null without one. */
function firstRuleLine(spec: SpecIR): { file: string; span: Span } | null {
  let first: { file: string; span: Span } | null = null;
  for (const line of [...spec.rules, ...spec.rejectedLayers]) {
    if (first === null || line.file < first.file || (line.file === first.file && (line.span.start.line < first.span.start.line || (line.span.start.line === first.span.start.line && line.span.start.col < first.span.start.col)))) first = line;
  }
  return first;
}

/** How specific a scope is: its depth in segments (`app.purchase` is 2), not its length in characters. */
export function scopeDepth(id: string): number {
  return id.split(".").length;
}

/**
 * The rule that decides `from → to` in format 1: the one whose scopes are
 * deepest in total (`deny app.purchase domain` and `allow app domain.store`
 * both 3), a `deny` on a tie. Format 2 keeps every undominated rule and lets
 * any undominated `deny` win (deny-overrides), so an incomparable `allow`
 * with a greater depth sum no longer beats that `deny`.
 */
function specific(rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean): { kind: "allow" | "deny"; rule: Rule } | null {
  const decision = decide(ruleHits(rules, from, to, within), 1);
  const winner = [...decision.winners].sort(byHit)[0];
  return winner === undefined ? null : { kind: winner.kind, rule: winner.rule };
}

interface EvaluatedRules {
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

function collectRules(spec: SpecIR, kindOf: (id: string) => string | undefined): EvaluatedRules {
  const unordered = new Set<string>(UNORDERED_LAYERS);
  const allows: Rule[] = [];
  const denies: Rule[] = [];
  const entries: string[] = [];
  const entryNodes: EvaluatedRules["entryNodes"] = [];
  const noCycles: EvaluatedRules["noCycles"] = [];
  const exportsRules: EvaluatedRules["exportsRules"] = [];
  const diagnostics: Diagnostic[] = [];
  const chains: LayerOrder[] = [];
  const nested: { file: string; target: string; span: Span }[] = [];
  const takeNested = (file: string, refs: readonly { target: string; span: Span }[]): void => {
    for (const ref of refs) {
      if (ref.target.includes(".")) continue;
      nested.push({ file, target: ref.target, span: ref.span });
    }
  };
  for (const rule of spec.rules) {
    if (rule.kind === "layers") {
      chains.push({ layers: [...rule.layers], file: rule.file, span: rule.span, text: rule.text });
      takeNested(rule.file, rule.nested);
    } else if (rule.kind === "dependency") {
      const refs = [rule.from, ...rule.to];
      // A rule over a function is not evaluated at that granularity: edges are between modules.
      const members = refs.flatMap((ref) => {
        const kind = kindOf(ref.target);
        return kind !== undefined && MEMBER_KINDS.has(kind) ? [{ ref, kind }] : [];
      });
      for (const { ref, kind } of members) {
        const module = ref.target.slice(0, ref.target.lastIndexOf("."));
        diagnostics.push(diagnostic("K005", rule.file, ref.span, `\`${rule.effect}\` takes layers, modules and ID prefixes; \`${ref.target}\` is a ${kind}, name its module \`${module}\``, "scope"));
      }
      if (members.length > 0) continue;
      const built = { a: rule.from.target, b: rule.to.map((ref) => ref.target), file: rule.file, span: rule.span, text: rule.text, generated: rule.generated };
      (rule.effect === "allow" ? allows : denies).push(built);
    } else if (rule.kind === "entry") {
      entryNodes.push({ file: rule.file, span: rule.span, text: rule.text });
      for (const ref of rule.entries) entries.push(ref.target);
    } else if (rule.kind === "no-cycles") {
      noCycles.push({ under: rule.under?.target ?? null, file: rule.file, span: rule.span });
    } else {
      exportsRules.push({ module: rule.module.target, names: new Set(rule.names.map((ref) => ref.text.normalize("NFC"))), file: rule.file, span: rule.span });
    }
  }
  for (const line of spec.rejectedLayers) takeNested(line.file, line.nested);
  const { orders, above } = combineOrders(chains, []);
  const ordered = new Set(orders.flatMap((order) => order.layers));
  for (const item of nested) {
    if (!ordered.has(item.target)) unordered.add(item.target);
  }
  return { any: spec.hasRules, orders, above, ordered, unordered, allows, denies, entries, entryNodes, noCycles, exportsRules, diagnostics };
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
      diagnostics.push(diagnostic("K005", chain.file, chain.span, `\`${chain.text}\` contradicts an earlier \`layers\`, which puts \`${lower}\` above \`${upper}\``, "layer"));
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
