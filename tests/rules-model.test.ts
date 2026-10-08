// Reference model of allow/deny, layers, entry, no-cycles and dependency holes.
// It does not import the evaluator. Each predicate is a function of that name.
// Cases are temporary repos; the oracle is `keylang check --format json`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import fc from "fast-check";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const RULES = "keylang/rules.md";
const ORDER = ["base", "core", "app"] as const;
const LAYERS = ["base", "core", "app", "side", "extra"] as const;

const POOL: { id: string; file: string; layer: string }[] = [
  { id: "base.a", file: "src/base/a.ts", layer: "base" },
  { id: "base.b", file: "src/base/b.ts", layer: "base" },
  { id: "core.order.place", file: "src/core/order/place.ts", layer: "core" },
  { id: "core.order.hold", file: "src/core/order/hold.ts", layer: "core" },
  { id: "app.buy", file: "src/app/buy.ts", layer: "app" },
  { id: "app.cart.add", file: "src/app/cart/add.ts", layer: "app" },
  { id: "side.log", file: "src/side/log.ts", layer: "side" },
  { id: "extra.job", file: "src/extra/job.ts", layer: "extra" },
];

interface Mod {
  id: string;
  file: string;
  layer: string;
  /** False for a directory module and for `external.<pkg>`: the snapshot line is null. */
  ownCode: boolean;
}

interface Dep {
  effect: "allow" | "deny";
  text: string;
  file: string;
  line: number;
  a: string;
  b: string[];
}

interface LayersLine {
  text: string;
  file: string;
  line: number;
  layers: string[];
  nested: string[];
}

interface EntryLine {
  file: string;
  line: number;
  ids: string[];
}

interface CycleLine {
  file: string;
  line: number;
  under: string | null;
}

interface FactEdge {
  from: string;
  to: string;
  self: boolean;
}

interface HoleItem {
  source: string;
  file: string;
}

interface World {
  modules: Mod[];
  edges: FactEdge[];
  holes: HoleItem[];
  denies: Dep[];
  allows: Dep[];
  layers: LayersLine[];
  entry: EntryLine | null;
  cycles: CycleLine[];
}

interface Line {
  kind: "layers" | "deny" | "entry" | "no-cycles";
  text: string;
  file: string;
  line: number;
  verdict: "ok" | "unverified" | "absent";
  holeFile: string | null;
  allows: string[];
  moreSpecific: boolean;
  k105: number;
}

interface Prediction {
  k101: string[];
  k102: string[];
  k103: string[];
  /** `file:line`, verdict `warning`, and the K106 message, one per allow/deny pair. */
  k106: string[];
  entryUnverified: string[];
  entryHoleFile: string | null;
  lines: Line[];
}

interface Row {
  criterion: string;
  area: string;
  verdict: "ok" | "fail" | "unverified" | "warning";
  evidence: string;
  file: string;
  line: number;
  code: string | null;
}

function within(id: string, scope: string): boolean {
  return id === scope || id.startsWith(`${scope}.`);
}

function score(from: string, to: string, rule: Dep): { score: number; target: string } | null {
  if (!within(from, rule.a)) return null;
  let best = -1;
  let target = "";
  for (const item of rule.b) {
    if (!within(to, item)) continue;
    const next = rule.a.split(".").length + item.split(".").length;
    if (next > best) {
      best = next;
      target = item;
    }
  }
  return best >= 0 ? { score: best, target } : null;
}

interface Hit {
  rule: Dep;
  score: number;
  target: string;
}

function winner(hits: readonly Hit[], format: 1 | 2): Hit[] {
  if (format === 2) {
    const undominated = hits.filter((hit) => !hits.some((other) => other !== hit && dominates(other, hit)));
    const denies = undominated.filter((hit) => hit.rule.effect === "deny");
    return denies.length > 0 ? denies : undominated;
  }
  const best = hits.reduce((max, hit) => Math.max(max, hit.score), -1);
  const top = hits.filter((hit) => hit.score === best);
  const denyWins = top.some((hit) => hit.rule.effect === "deny");
  return denyWins ? top.filter((hit) => hit.rule.effect === "deny") : top;
}

/** `a` is strictly more specific than `b` on the targets that matched this edge. */
function dominates(a: Hit, b: Hit): boolean {
  const source = within(a.rule.a, b.rule.a);
  const target = within(a.target, b.target);
  return source && target && (a.rule.a !== b.rule.a || a.target !== b.target);
}

/** A `deny` hit that is not among the winners of this edge. */
function beaten(hit: Hit, winners: readonly Hit[]): boolean {
  return hit.rule.effect === "deny" && !winners.includes(hit);
}

/** One hit is narrower on the source and the other on the matched target. */
function crosses(a: Hit, b: Hit): boolean {
  const sourceA = a.rule.a !== b.rule.a && within(a.rule.a, b.rule.a);
  const sourceB = a.rule.a !== b.rule.a && within(b.rule.a, a.rule.a);
  const targetA = a.target !== b.target && within(a.target, b.target);
  const targetB = a.target !== b.target && within(b.target, a.target);
  return (sourceA && targetB) || (sourceB && targetA);
}

/** One K106 per incomparable allow/deny line pair whose allow depth sum is greater and whose intersection is not itself a rule. */
function k106(world: World, format: 1 | 2): string[] {
  const ruleset = [...world.allows, ...world.denies];
  const out: string[] = [];
  for (const allow of world.allows) {
    for (const deny of world.denies) {
      let best: { src: string; tgt: string; allowScore: number; denyScore: number } | null = null;
      for (const allowTarget of allow.b) {
        for (const denyTarget of deny.b) {
          const sourceAllow = allow.a !== deny.a && within(allow.a, deny.a);
          const sourceDeny = allow.a !== deny.a && within(deny.a, allow.a);
          const targetAllow = allowTarget !== denyTarget && within(allowTarget, denyTarget);
          const targetDeny = allowTarget !== denyTarget && within(denyTarget, allowTarget);
          if (!((sourceAllow && targetDeny) || (sourceDeny && targetAllow))) continue;
          const allowScore = allow.a.split(".").length + allowTarget.split(".").length;
          const denyScore = deny.a.split(".").length + denyTarget.split(".").length;
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
      const where = `${deny.file}:${deny.line}`;
      const add = `add \`allow ${src} ${tgt}\` or \`deny ${src} ${tgt}\``;
      const message =
        format === 1
          ? `\`${allow.text}\` and \`${deny.text}\` (${where}) are incomparable; allow wins on depth sum (${allowScore} > ${denyScore}); ${add}`
          : `\`${allow.text}\` and \`${deny.text}\` (${where}) are incomparable; deny wins (deny-overrides); ${add}`;
      out.push(`${allow.file}:${allow.line}\twarning\t${message}`);
    }
  }
  return out.sort();
}

function above(lines: readonly LayersLine[]): Map<string, Set<string>> {
  const direct = new Map<string, Set<string>>();
  for (const line of lines) {
    for (let i = 0; i + 1 < line.layers.length; i++) {
      const lower = line.layers[i]!;
      const upper = line.layers[i + 1]!;
      const set = direct.get(lower) ?? new Set<string>();
      set.add(upper);
      direct.set(lower, set);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const start of direct.keys()) {
    const reached = new Set<string>();
    const stack = [...(direct.get(start) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined || reached.has(next)) continue;
      reached.add(next);
      stack.push(...(direct.get(next) ?? []));
    }
    out.set(start, reached);
  }
  return out;
}

function component(layer: string, up: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const seen = new Set<string>();
  const stack = [layer];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const higher of up.get(current) ?? []) stack.push(higher);
    for (const [lower, highs] of up) if (highs.has(current)) stack.push(lower);
  }
  return seen;
}

/** True when the edge breaks the layer order (before allow/deny). */
function breaks(fromLayer: string, toLayer: string, up: ReadonlyMap<string, ReadonlySet<string>>, ordered: ReadonlySet<string>, unordered: ReadonlySet<string>): boolean {
  if (fromLayer === toLayer) return false;
  if (up.get(fromLayer)?.has(toLayer)) return true;
  return !ordered.has(fromLayer) && ordered.has(toLayer) && !unordered.has(toLayer);
}

function hole(ids: readonly string[], items: readonly HoleItem[]): HoleItem | null {
  const sorted = [...items].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  for (const id of [...ids].sort()) {
    const found = sorted.find((item) => item.source === id || item.source.startsWith(`${id}.`));
    if (found) return found;
  }
  return null;
}

function area(kind: "deny" | "layers" | "cycles" | "entry", ids: readonly string[]): string[] {
  return [...ids];
}

function reach(seeds: readonly string[], forward: ReadonlyMap<string, readonly string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...seeds];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || out.has(id)) continue;
    out.add(id);
    for (const next of forward.get(id) ?? []) stack.push(next);
  }
  return out;
}

function scc(adj: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  const nodes = new Set<string>(adj.keys());
  for (const targets of adj.values()) for (const target of targets) nodes.add(target);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (node: string): void => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const next of adj.get(node) ?? []) visit(next);
    order.push(node);
  };
  for (const node of [...nodes].sort()) visit(node);
  const rev = new Map<string, string[]>();
  for (const node of nodes) {
    for (const next of adj.get(node) ?? []) {
      const list = rev.get(next) ?? [];
      list.push(node);
      rev.set(next, list);
    }
  }
  const used = new Set<string>();
  const cyclic: string[][] = [];
  for (const start of order.reverse()) {
    if (used.has(start)) continue;
    const members: string[] = [];
    const stack = [start];
    used.add(start);
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      members.push(node);
      for (const next of rev.get(node) ?? []) {
        if (used.has(next)) continue;
        used.add(next);
        stack.push(next);
      }
    }
    const loop = members.length > 1 || members.some((id) => adj.get(id)?.has(id) === true);
    if (loop) cyclic.push(members);
  }
  return cyclic;
}

function k105(rule: CycleLine, components: readonly (readonly string[])[]): number {
  const inScope = (id: string): boolean => rule.under === null || within(id, rule.under);
  return components.filter((members) => members.some(inScope)).length;
}

function withStructure(modules: readonly Mod[], edges: readonly FactEdge[]): Mod[] {
  const out = [...modules];
  const ids = new Set(modules.map((mod) => mod.id));
  for (const mod of modules) {
    const parts = mod.id.split(".");
    for (let n = parts.length - 1; n > 1; n--) {
      const id = parts.slice(0, n).join(".");
      if (ids.has(id)) continue;
      ids.add(id);
      out.push({ id, file: "", layer: parts[0] ?? id, ownCode: false });
    }
  }
  for (const edge of edges) {
    if (edge.self || ids.has(edge.to)) continue;
    ids.add(edge.to);
    out.push({ id: edge.to, file: "", layer: edge.to.split(".")[0] ?? edge.to, ownCode: false });
  }
  return out;
}

function predict(world: World, format: 1 | 2 = 1): Prediction {
  const modules = withStructure(world.modules, world.edges);
  const moduleIds = new Set(modules.map((mod) => mod.id));
  const up = above(world.layers);
  const ordered = new Set(world.layers.flatMap((line) => line.layers));
  const unordered = new Set<string>(["external", "unassigned"]);
  for (const line of world.layers) for (const name of line.nested) if (!name.includes(".") && !ordered.has(name)) unordered.add(name);
  const layerOf = (id: string): string => id.split(".")[0] ?? id;
  const use = world.edges.filter((edge) => !edge.self && edge.from !== edge.to);
  const deps = [...world.denies, ...world.allows];
  const hitsOf = (from: string, to: string): Hit[] => {
    const hits: Hit[] = [];
    for (const rule of deps) {
      const value = score(from, to, rule);
      if (value !== null) hits.push({ rule, score: value.score, target: value.target });
    }
    return hits;
  };
  const k101: string[] = [];
  const k102 = new Set<string>();
  const violated = new Set<string>();
  const failed = new Set<Dep>();
  const overridden = new Map<Dep, { incomparable: boolean }[]>();
  const allowedUp = new Map<string, Set<string>>();
  const seen101 = new Set<string>();
  for (const edge of use) {
    const hits = hitsOf(edge.from, edge.to);
    const decided = winner(hits, format);
    for (const hit of hits) {
      if (!beaten(hit, decided)) continue;
      const notes = overridden.get(hit.rule) ?? [];
      for (const item of decided) notes.push({ incomparable: crosses(hit, item) });
      overridden.set(hit.rule, notes);
    }
    const fromLayer = layerOf(edge.from);
    const toLayer = layerOf(edge.to);
    const upward = breaks(fromLayer, toLayer, up, ordered, unordered);
    const denyWins = decided.some((hit) => hit.rule.effect === "deny");
    if (denyWins) {
      for (const hit of decided) {
        failed.add(hit.rule);
        const key = `${hit.rule.file}:${hit.rule.line}\t${edge.from}\t${edge.to}`;
        k102.add(key);
      }
      if (upward) {
        violated.add(fromLayer);
        violated.add(toLayer);
      }
      continue;
    }
    if (decided.some((hit) => hit.rule.effect === "allow")) {
      if (upward) {
        const noted = allowedUp.get(`${fromLayer}\0${toLayer}`) ?? new Set<string>();
        for (const hit of decided) if (hit.rule.effect === "allow") noted.add(hit.rule.text);
        allowedUp.set(`${fromLayer}\0${toLayer}`, noted);
      }
      continue;
    }
    if (!upward) continue;
    violated.add(fromLayer);
    violated.add(toLayer);
    const pair = `${edge.from}\t${edge.to}`;
    if (seen101.has(pair)) continue;
    seen101.add(pair);
    k101.push(pair);
  }
  const lines: Line[] = [];
  for (const line of world.layers) {
    if (line.layers.some((layer) => violated.has(layer))) {
      lines.push({ kind: "layers", text: line.text, file: line.file, line: line.line, verdict: "absent", holeFile: null, allows: [], moreSpecific: false, k105: 0 });
      continue;
    }
    const members = component(line.layers[0] ?? "", up);
    const ids = modules.filter((mod) => members.has(layerOf(mod.id)) || !ordered.has(layerOf(mod.id))).map((mod) => mod.id);
    const found = unverified(false, area("layers", ids), world.holes);
    const allows = [...allowedUp.entries()]
      .filter(([key]) => {
        const [from, to] = key.split("\0");
        return from !== undefined && to !== undefined && members.has(from) && members.has(to);
      })
      .flatMap(([, texts]) => [...texts])
      .sort();
    lines.push({
      kind: "layers",
      text: line.text,
      file: line.file,
      line: line.line,
      verdict: found ? "unverified" : "ok",
      holeFile: found?.file ?? null,
      allows: [...new Set(allows)],
      moreSpecific: false,
      k105: 0,
    });
  }
  for (const deny of world.denies) {
    if (failed.has(deny)) {
      lines.push({ kind: "deny", text: deny.text, file: deny.file, line: deny.line, verdict: "absent", holeFile: null, allows: [], moreSpecific: false, k105: 0 });
      continue;
    }
    const ids = modules.filter((mod) => within(mod.id, deny.a)).map((mod) => mod.id);
    const found = unverified(false, area("deny", ids), world.holes);
    const notes = overridden.get(deny) ?? [];
    lines.push({
      kind: "deny",
      text: deny.text,
      file: deny.file,
      line: deny.line,
      verdict: found ? "unverified" : "ok",
      holeFile: found?.file ?? null,
      allows: [],
      moreSpecific: notes.some((note) => !note.incomparable),
      k105: 0,
    });
  }
  const forward = new Map<string, string[]>();
  for (const edge of use) {
    const list = forward.get(edge.from) ?? [];
    list.push(edge.to);
    forward.set(edge.from, list);
  }
  const adj = new Map<string, Set<string>>();
  for (const edge of world.edges) {
    const list = adj.get(edge.from) ?? new Set<string>();
    list.add(edge.self ? edge.from : edge.to);
    adj.set(edge.from, list);
  }
  const components = scc(adj);
  let entryUnverified: string[] = [];
  let entryHoleFile: string | null = null;
  const k103: string[] = [];
  if (world.entry) {
    const seeds = world.entry.ids.flatMap((id) => {
      if (moduleIds.has(id)) return [id];
      const under = modules.filter((mod) => within(mod.id, id)).map((mod) => mod.id);
      return under.length > 0 ? under : [id];
    });
    const reached = reach(seeds, forward);
    const reachableHole = unverified(false, area("entry", [...reached]), world.holes);
    const reportable = modules.filter((mod) => mod.ownCode && !unordered.has(layerOf(mod.id)) && !reached.has(mod.id));
    if (reachableHole && reportable.length > 0) {
      entryUnverified = reportable.map((mod) => mod.id).sort();
      entryHoleFile = reachableHole.file;
    } else if (reportable.length > 0) {
      k103.push(...reportable.map((mod) => mod.id).sort());
    }
    const ok = reportable.length === 0;
    lines.push({
      kind: "entry",
      text: "entry",
      file: world.entry.file,
      line: world.entry.line,
      verdict: ok ? "ok" : "absent",
      holeFile: null,
      allows: [],
      moreSpecific: false,
      k105: 0,
    });
  }
  for (const rule of world.cycles) {
    const count = k105(rule, components);
    const under = rule.under;
    let ids: string[];
    if (under === null) ids = modules.map((mod) => mod.id);
    else {
      const start = modules.filter((mod) => within(mod.id, under)).map((mod) => mod.id);
      const seen = reach(start, forward);
      ids = [...seen];
    }
    const found = count === 0 ? unverified(false, area("cycles", ids), world.holes) : null;
    lines.push({
      kind: "no-cycles",
      text: "no-cycles",
      file: rule.file,
      line: rule.line,
      verdict: count > 0 ? "absent" : found ? "unverified" : "ok",
      holeFile: found?.file ?? null,
      allows: [],
      moreSpecific: false,
      k105: count,
    });
  }
  return { k101: k101.sort(), k102: [...k102].sort(), k103, k106: k106(world, format), entryUnverified, entryHoleFile, lines };
}

function unverified(failed: boolean, ids: readonly string[], items: readonly HoleItem[]): HoleItem | null {
  if (failed) return null;
  return hole(ids, items);
}

interface Raw {
  pick: number;
  imports: number[][];
  self: boolean[];
  unresolved: boolean[];
  external: boolean[];
  rules: { deny: boolean; a: number; b: number[] }[];
  layerMasks: number[];
  nest: boolean[];
  entry: number;
  under: number;
  exclude: number;
}

interface Built {
  files: Record<string, string>;
  world: World;
  summary: string;
}

function realize(raw: Raw): Built {
  const chosen: number[] = [];
  for (let i = 0; i < POOL.length; i++) if ((raw.pick & (1 << i)) !== 0) chosen.push(i);
  for (let i = 0; chosen.length < 3 && i < POOL.length; i++) if (!chosen.includes(i)) chosen.push(i);
  while (chosen.length > 6) chosen.pop();
  const selected = chosen.map((index) => POOL[index]!);
  const excluded = raw.exclude >= 0 ? raw.exclude % selected.length : -1;
  const names = ["base", "core", "app", "side", "extra", "external", "external.left-pad"];
  for (const mod of selected) names.push(mod.id);
  for (const mod of selected) {
    const parts = mod.id.split(".");
    for (let n = parts.length - 1; n > 1; n--) {
      const id = parts.slice(0, n).join(".");
      if (!names.includes(id)) names.push(id);
    }
  }
  const nameAt = (index: number): string => names[index % names.length] ?? "base";
  const rules: { effect: "allow" | "deny"; a: string; b: string[] }[] = [];
  const seenRule = new Set<string>();
  for (const rule of raw.rules) {
    const b = [...new Set(rule.b.map(nameAt))];
    if (b.length === 0) continue;
    const built = { effect: rule.deny ? "deny" as const : "allow" as const, a: nameAt(rule.a), b };
    const text = `${built.effect} ${built.a} ${built.b.join(" ")}`;
    if (seenRule.has(text)) continue;
    seenRule.add(text);
    rules.push(built);
  }
  if (rules.length === 0) rules.push({ effect: "deny", a: "base", b: ["app"] });
  const layers: { layers: string[]; nestSide: boolean }[] = [];
  const seenLayers = new Set<string>();
  raw.layerMasks.forEach((mask, index) => {
    const parts = ORDER.filter((_, bit) => (mask & (1 << bit)) !== 0);
    if (parts.length < 2) return;
    const text = parts.join(" < ");
    if (seenLayers.has(text)) return;
    seenLayers.add(text);
    layers.push({ layers: [...parts], nestSide: raw.nest[index] ?? false });
  });
  const entryNames = [...LAYERS, ...selected.map((mod) => mod.id)];
  const entry = entryNames[raw.entry % entryNames.length] ?? "app";
  const under = selected[raw.under % selected.length]?.id ?? selected[0]!.id;
  const spec: string[] = ["# rules", ""];
  const at = (text: string): number => {
    spec.push(text);
    return spec.length;
  };
  const layerLines: LayersLine[] = [];
  for (const line of layers) {
    const row = at(`- layers ${line.layers.join(" < ")}`);
    if (line.nestSide) at("  - side");
    layerLines.push({ text: `layers ${line.layers.join(" < ")}`, file: RULES, line: row, layers: line.layers, nested: line.nestSide ? ["side"] : [] });
  }
  const denies: Dep[] = [];
  const allows: Dep[] = [];
  for (const rule of rules) {
    const text = `${rule.effect} ${rule.a} ${rule.b.join(" ")}`;
    const row = at(`- ${text}`);
    const dep: Dep = { effect: rule.effect, text, file: RULES, line: row, a: rule.a, b: rule.b };
    (rule.effect === "deny" ? denies : allows).push(dep);
  }
  const entryLine = at("- entry");
  at(`  - ${entry}`);
  const globalLine = at("- no-cycles");
  at(`- module ${under}`);
  const underLine = at("  - no-cycles");
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify({ name: "model-fixture", private: true, dependencies: { "left-pad": "1.0.0" } })}\n`,
    "keylang.json": `${JSON.stringify({
      languages: ["typescript"],
      module: "file",
      layers: { base: ["src/base/**"], core: ["src/core/**"], app: ["src/app/**"], side: ["src/side/**"], extra: ["src/extra/**"] },
      ...(excluded >= 0 ? { exclude: [selected[excluded]!.file] } : {}),
    })}\n`,
    [RULES]: `${spec.join("\n")}\n`,
  };
  const modules: Mod[] = [];
  const edges: FactEdge[] = [];
  const holes: HoleItem[] = [];
  selected.forEach((mod, index) => {
    const poolIndex = chosen[index]!;
    const isExcluded = index === excluded;
    modules.push({ id: mod.id, file: mod.file, layer: mod.layer, ownCode: true });
    const body: string[] = [];
    const targets = [...new Set((raw.imports[poolIndex] ?? []).map((item) => item % POOL.length))].filter((item) => chosen.includes(item) && item !== poolIndex);
    let alias = 0;
    for (const target of targets) {
      const other = POOL[target]!;
      const otherIndex = chosen.indexOf(target);
      if (otherIndex === excluded) continue;
      body.push(`import { token as t${alias} } from "${relativeImport(mod.file, other.file)}";`);
      if (!isExcluded) edges.push({ from: mod.id, to: other.id, self: false });
      alias += 1;
    }
    if (raw.self[poolIndex]) {
      body.push(`import { token as self } from "${relativeImport(mod.file, mod.file)}";`);
      if (!isExcluded) edges.push({ from: mod.id, to: mod.id, self: true });
    }
    if (raw.unresolved[poolIndex]) body.push(`import { z } from "./missing.ts";`);
    if (raw.external[poolIndex]) {
      body.push(`import lp from "left-pad";`);
      if (!isExcluded) edges.push({ from: mod.id, to: "external.left-pad", self: false });
    }
    if (isExcluded) holes.push({ source: mod.id, file: mod.file });
    else if (raw.unresolved[poolIndex]) holes.push({ source: mod.id, file: mod.file });
    body.push("export const token = 1;");
    files[mod.file] = `${body.join("\n")}\n`;
  });
  const world: World = {
    modules,
    edges,
    holes,
    denies,
    allows,
    layers: layerLines,
    entry: { file: RULES, line: entryLine, ids: [entry] },
    cycles: [
      { file: RULES, line: globalLine, under: null },
      { file: RULES, line: underLine, under },
    ],
  };
  return { files, world, summary: spec.join("\n") };
}

function relativeImport(from: string, to: string): string {
  let rel = posix.relative(posix.dirname(from), to);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

function cli(files: Record<string, string>, args: string[] = []): { status: number | null; rows: Row[]; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "keylang-model-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const run = spawnSync(process.execPath, [bin, "check", "--format", "json", ...args], { cwd: dir, encoding: "utf8" });
    if (run.status === 2 || run.status === null) throw new Error(`check exit ${run.status}\n${run.stderr}`);
    const parsed = JSON.parse(run.stdout) as { results: Row[] };
    return { status: run.status, rows: parsed.results, stderr: run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pairOf(evidence: string): string | null {
  const match = /^divergence: `([^`]+)` depends on `([^`]+)`/.exec(evidence);
  return match ? `${match[1]}\t${match[2]}` : null;
}

function deniedKey(row: Row): string | null {
  const pair = pairOf(row.evidence);
  const where = /denied by `[^`]+` \(([^:\s]+):(\d+)\)/.exec(row.evidence);
  if (!pair || !where) return null;
  return `${where[1]}:${where[2]}\t${pair}`;
}

function compare(expected: Prediction, rows: readonly Row[]): string | null {
  const bad: string[] = [];
  const show = (label: string, model: readonly string[], actual: readonly string[]): void => {
    if (model.join("\n") === actual.join("\n")) return;
    bad.push(`${label}\n  model: ${model.join(" | ") || "(none)"}\n  cli:   ${actual.join(" | ") || "(none)"}`);
  };
  show("K101", expected.k101, rows.filter((row) => row.code === "K101").map((row) => pairOf(row.evidence) ?? row.evidence).sort());
  show("K102", expected.k102, rows.filter((row) => row.code === "K102").map((row) => deniedKey(row) ?? row.evidence).sort());
  show("K103", expected.k103, rows.filter((row) => row.code === "K103").map((row) => row.area).sort());
  show(
    "K106",
    expected.k106,
    rows.filter((row) => row.code === "K106").map((row) => `${row.file}:${row.line}\t${row.verdict}\t${row.evidence}`).sort(),
  );
  show(
    "entry unverified",
    expected.entryUnverified,
    rows.filter((row) => row.criterion === "entry" && row.verdict === "unverified").map((row) => row.area).sort(),
  );
  if (expected.entryHoleFile !== null) {
    for (const row of rows.filter((item) => item.criterion === "entry" && item.verdict === "unverified")) {
      if (!row.evidence.includes(`(${expected.entryHoleFile}:`)) bad.push(`entry hole ${expected.entryHoleFile} missing in ${row.evidence}`);
    }
  }
  for (const line of expected.lines) {
    const here = rows.filter((row) => row.file === line.file && row.line === line.line);
    if (line.kind === "no-cycles") {
      const count = here.filter((row) => row.code === "K105").length;
      if (count !== line.k105) bad.push(`K105 ${line.file}:${line.line} model ${line.k105} cli ${count}`);
    }
    if (line.verdict === "absent") {
      const stray = here.find((row) => row.verdict === "ok" || row.verdict === "unverified");
      if (stray) bad.push(`${line.kind} ${line.file}:${line.line} expected no verdict, cli ${stray.verdict} ${stray.evidence}`);
      continue;
    }
    const row = here.find((item) => item.verdict === line.verdict);
    if (!row) {
      bad.push(`${line.kind} ${line.text} ${line.file}:${line.line} expected ${line.verdict}, cli ${here.map((item) => item.verdict).join(",") || "(none)"}`);
      continue;
    }
    if (line.holeFile !== null && !row.evidence.includes(`(${line.holeFile}:`)) bad.push(`${line.text} hole ${line.holeFile} missing in ${row.evidence}`);
    if (line.kind === "layers" && line.verdict === "ok") {
      for (const allow of line.allows) if (!row.evidence.includes(`\`${allow}\``)) bad.push(`layers ok missing ${allow} in ${row.evidence}`);
      if (line.allows.length === 0 && row.evidence.includes("allowed by")) bad.push(`layers ok names an allow: ${row.evidence}`);
    }
    if (line.kind === "deny" && line.verdict === "ok") {
      const specific = row.evidence.includes("more specific rules");
      if (specific !== line.moreSpecific) bad.push(`${line.text} more specific model ${line.moreSpecific} cli ${row.evidence}`);
    }
  }
  const extra = rows.filter((row) => row.code !== null && row.code !== "K101" && row.code !== "K102" && row.code !== "K103" && row.code !== "K105" && row.code !== "K106");
  if (extra.length > 0) bad.push(`extra codes ${extra.map((row) => `${row.code} ${row.evidence}`).join(" | ")}`);
  return bad.length > 0 ? bad.join("\n") : null;
}

function ranked(world: World): Map<string, string> {
  const expected = predict(world);
  const rank: Record<string, number> = { fail: 4, warning: 3, unverified: 2, ok: 1 };
  const map = new Map<string, { verdict: string; rank: number }>();
  const put = (key: string, verdict: string): void => {
    const value = rank[verdict] ?? 0;
    const prev = map.get(key);
    if (!prev || value > prev.rank) map.set(key, { verdict, rank: value });
  };
  for (const line of expected.lines) {
    if (line.verdict === "absent") continue;
    const key = line.kind === "entry" ? "entry" : line.kind === "no-cycles" ? `no-cycles:${line.file}:${line.line}` : line.kind === "layers" ? `layers:${line.text}` : `rule:${line.text}`;
    put(key, line.verdict);
  }
  for (const pair of expected.k101) {
    const [from, to] = pair.split("\t");
    const fromLayer = from?.split(".")[0] ?? "";
    const toLayer = to?.split(".")[0] ?? "";
    const seen = new Set<string>([toLayer]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const line of world.layers) {
        if (!line.layers.some((item) => seen.has(item))) continue;
        for (const item of line.layers) if (!seen.has(item)) {
          seen.add(item);
          grew = true;
        }
      }
    }
    for (const line of world.layers) {
      if (!line.layers.some((item) => seen.has(item))) continue;
      if (line.layers.includes(fromLayer) || line.layers.includes(toLayer)) put(`layers:${line.text}`, "fail");
    }
  }
  for (const key of expected.k102) {
    const text = world.denies.find((deny) => key.startsWith(`${deny.file}:${deny.line}\t`))?.text;
    if (text) put(`rule:${text}`, "fail");
  }
  if (expected.k103.length > 0) put("entry", "warning");
  if (expected.entryUnverified.length > 0) put("entry", "unverified");
  for (const line of expected.lines) if (line.k105 > 0) put(`no-cycles:${line.file}:${line.line}`, "fail");
  return new Map([...map].map(([key, value]) => [key, value.verdict]));
}

function monotonic(world: World): string | null {
  const first = world.modules.find((mod) => mod.ownCode);
  if (!first) return null;
  // Excluding a file makes it opaque: edges from it disappear with its imports.
  // Edges to it stay, so a hole on a module the entry already reached stays in reach.
  const less: World = {
    ...world,
    edges: world.edges.filter((edge) => edge.from !== first.id),
    holes: [...world.holes.filter((item) => item.source !== first.id && !item.source.startsWith(`${first.id}.`)), { source: first.id, file: first.file }],
  };
  const before = ranked(world);
  const after = ranked(less);
  const bad: string[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const from = before.get(key) ?? "unverified";
    const to = after.get(key) ?? "unverified";
    if (from === to || to === "unverified") continue;
    bad.push(`${key}: ${from} → ${to}`);
  }
  return bad.length > 0 ? bad.join("\n") : null;
}

const caseArb: fc.Arbitrary<Raw> = fc.record({
  pick: fc.integer({ min: 0, max: 255 }),
  imports: fc.array(fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 3 }), { minLength: 8, maxLength: 8 }),
  self: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
  unresolved: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
  external: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
  rules: fc.array(
    fc.record({
      deny: fc.boolean(),
      a: fc.integer({ min: 0, max: 20 }),
      b: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 2 }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  layerMasks: fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 2 }),
  nest: fc.array(fc.boolean(), { minLength: 2, maxLength: 2 }),
  entry: fc.integer({ min: 0, max: 20 }),
  under: fc.integer({ min: 0, max: 7 }),
  exclude: fc.integer({ min: -1, max: 7 }),
});

function runs(): number {
  const value = Number(process.env.KEYLANG_MODEL_RUNS ?? "20");
  return Number.isInteger(value) && value > 0 ? value : 20;
}

function seed(): number {
  const value = Number(process.env.KEYLANG_MODEL_SEED ?? "20260929");
  return Number.isInteger(value) ? value : 20260929;
}

function fixed(partial: Partial<Raw>): Raw {
  return {
    pick: 0b00010101,
    imports: [[4], [], [], [], [], [], [], []],
    self: [false, false, false, false, false, false, false, false],
    unresolved: [false, false, false, false, false, false, false, false],
    external: [false, false, false, false, false, false, false, false],
    rules: [{ deny: true, a: 0, b: [2] }],
    layerMasks: [0b101],
    nest: [false, false],
    entry: 2,
    under: 0,
    exclude: -1,
    ...partial,
  };
}

test("rules model: an upward edge denied by deny leaves the layers line without a verdict", () => {
  const built = realize(fixed({}));
  const expected = predict(built.world);
  const layers = expected.lines.find((line) => line.kind === "layers");
  assert.equal(layers?.verdict, "absent");
  assert.ok(expected.k102.length > 0);
  assert.deepEqual(expected.k101, []);
  const diff = compare(expected, cli(built.files).rows);
  assert.equal(diff, null, diff ?? "");
});

test("rules model: an upward edge allowed by allow keeps the layers line ok", () => {
  const built = realize(fixed({ rules: [{ deny: false, a: 0, b: [2] }] }));
  const expected = predict(built.world);
  const layers = expected.lines.find((line) => line.kind === "layers");
  assert.equal(layers?.verdict, "ok");
  assert.ok(layers?.allows.includes("allow base app"));
  assert.deepEqual(expected.k101, []);
  const diff = compare(expected, cli(built.files).rows);
  assert.equal(diff, null, diff ?? "");
});

test("rules model: a dependency hole without a violation is exit 0 and strict exit 1", () => {
  const built = realize(fixed({
    pick: 0b00000011,
    imports: [[2], [], [], [], [], [], [], []],
    unresolved: [true, false, false, false, false, false, false, false],
    rules: [{ deny: true, a: 2, b: [4] }],
    layerMasks: [],
    entry: 0,
  }));
  const expected = predict(built.world);
  assert.equal(expected.k101.length + expected.k102.length + expected.k103.length, 0);
  assert.ok(expected.lines.some((line) => line.verdict === "unverified"));
  const plain = cli(built.files);
  const strict = cli(built.files, ["--strict"]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(strict.status, 1, strict.stderr);
  const diff = compare(expected, plain.rows);
  assert.equal(diff, null, diff ?? "");
});

test("rules model: excluding the only importer of a declared package is not K001", () => {
  const built = realize(fixed({
    pick: 0b00010001,
    imports: [[], [], [], [], [], [], [], []],
    external: [false, false, false, false, true, false, false, false],
    rules: [{ deny: true, a: 2, b: [6] }],
    exclude: 1,
    entry: 0,
  }));
  const rows = cli(built.files).rows;
  assert.equal(rows.some((row) => row.code === "K001"), false, rows.filter((row) => row.code === "K001").map((row) => row.evidence).join("\n"));
  const diff = compare(predict(built.world), rows);
  assert.equal(diff, null, diff ?? "");
});

test("rules model: excluding a reached hole does not turn entry unverified into K103", () => {
  const rules = "# rules\n\n- entry\n  - core.order.place\n";
  const config = {
    languages: ["typescript"],
    module: "file",
    layers: { base: ["src/base/**"], core: ["src/core/**"] },
  };
  const files = {
    "package.json": "{\"name\":\"model-fixture\",\"private\":true}\n",
    "keylang.json": `${JSON.stringify(config)}\n`,
    "keylang/rules.md": rules,
    "src/base/a.ts": "import { z } from \"./missing.ts\";\nexport const token = 1;\n",
    "src/base/b.ts": "export const token = 1;\n",
    "src/core/order/place.ts": "import { token } from \"../../base/a.ts\";\nexport const token = 1;\n",
  };
  const before = cli(files).rows.filter((row) => row.criterion === "entry");
  const after = cli({
    ...files,
    "keylang.json": `${JSON.stringify({ ...config, exclude: ["src/base/a.ts"] })}\n`,
  }).rows.filter((row) => row.criterion === "entry");
  assert.ok(before.some((row) => row.verdict === "unverified" && row.code !== "K103"));
  assert.equal(before.some((row) => row.code === "K103"), false);
  assert.equal(after.some((row) => row.code === "K103"), false);
  assert.ok(after.some((row) => row.verdict === "unverified"));
});

function filesFor(files: Record<string, string>, format: 1 | 2): Record<string, string> {
  if (format === 1) return files;
  const config = JSON.parse(files["keylang.json"] ?? "{}") as Record<string, unknown>;
  return { ...files, "keylang.json": `${JSON.stringify({ format, ...config })}\n` };
}

test("rules model: generated repos match check --format json", () => {
  fc.assert(
    fc.property(caseArb, (raw) => {
      const built = realize(raw);
      const drift = monotonic(built.world);
      const problems: string[] = [];
      if (drift) problems.push(drift);
      for (const format of [1, 2] as const) {
        const expected = predict(built.world, format);
        const diff = compare(expected, cli(filesFor(built.files, format)).rows);
        if (diff) problems.push(`format ${format}\n${diff}`);
      }
      if (problems.length > 0) throw new Error(`${problems.join("\n")}\n${built.summary}`);
    }),
    { numRuns: runs(), seed: seed(), endOnFailure: true },
  );
});
