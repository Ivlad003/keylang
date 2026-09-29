// SpecIR: typed assertions compiled from the text IR. `compileSpec` checks
// assertion form (a layer order, a wiring condition). Checks that need the
// snapshot still run later. This module stays in `lang` and must not import
// check, map, or extract.

import { SYNTHETIC_LAYERS } from "./config.ts";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, type Document, type Node, type Ref, type Section } from "./ir.ts";
import { renderMeaning } from "./parser.ts";
import type { Span } from "./span.ts";

/** Configured names that are layers even when `keylang.json` does not list them. Assertion checks use this later; compilation does not reject them. */
export function syntheticLayer(name: string): boolean {
  return (SYNTHETIC_LAYERS as readonly string[]).includes(name);
}

export type NonEmpty<T> = readonly [T, ...T[]];

interface Located {
  file: string;
  span: Span;
  /** Canonical text hashed as specHash. A flow element prefixes the flow name and the node kind, separated by a NUL. */
  text: string;
  readonly source: Node;
}

export interface LayerOrder extends Located {
  kind: "layers";
  /** Lowest first. Each name is a layer, none is repeated, and the line agrees with earlier orders. */
  layers: readonly string[];
  /** Nested names, including ones that are not layers. A dotted or ordered name is not unordered. */
  nested: readonly Ref[];
}

/** A `layers` line that is not an order. It is not an assertion; its text still enters the no-snapshot hash when it names an order. */
export interface RejectedLayers {
  file: string;
  span: Span;
  text: string;
  order: readonly Ref[];
  nested: readonly Ref[];
  readonly source: Node;
}

export interface DependencyRule extends Located {
  kind: "dependency";
  effect: "allow" | "deny";
  from: Ref;
  to: NonEmpty<Ref>;
}

export interface Entry extends Located {
  kind: "entry";
  entries: NonEmpty<Ref>;
}

export interface NoCycles extends Located {
  kind: "no-cycles";
  /** Null is the whole repository (`no-cycles *`). */
  under: Ref | null;
}

export interface ExportsRule extends Located {
  kind: "exports";
  module: Ref;
  names: NonEmpty<Ref>;
}

export type RuleAssertion = LayerOrder | DependencyRule | Entry | NoCycles | ExportsRule;

/** A `module x` line. It scopes nested rules and is not itself an assertion, so nothing hashes it. */
export interface SpecModule {
  file: string;
  span: Span;
  target: Ref;
  readonly source: Node;
}

export interface FlowStep extends Located {
  kind: "step";
  target: Ref;
  children: readonly FlowItem[];
}

export interface Trigger extends Located {
  kind: "trigger";
  target: Ref;
  children: readonly FlowItem[];
}

export interface WhenItem extends Located {
  kind: "when";
  condition: string;
  children: readonly FlowItem[];
}

export type ThenItem = Located & { kind: "then"; children: readonly FlowItem[] } & ({ form: "ref"; target: Ref } | { form: "text"; prose: string });

export interface ClaimItem extends Located {
  kind: "invariant" | "reads" | "emits";
  /** Prose of an invariant or emit, or the ID a `reads` names. */
  body: string;
  target: Ref | null;
  children: readonly FlowItem[];
}

export interface TestItem extends Located {
  kind: "test";
  /** The test file, as written. */
  path: string;
  name: string | null;
}

export type FlowItem = FlowStep | WhenItem | ThenItem | ClaimItem | TestItem;

export interface Flow {
  file: string;
  span: Span;
  name: string;
  kind: "business" | "technical" | null;
  triggers: readonly Trigger[];
  /** Top-level items that are not triggers, `kind`, or `planned`. */
  items: readonly FlowItem[];
  /** Top-level triggers and items in source order. */
  top: readonly (Trigger | FlowItem)[];
}

export interface Planned extends Located {
  kind: "planned";
  decl: "fn" | "module" | "type" | "event";
  id: string;
  signature: string | null;
}

/** A `when` whose condition is `env.NAME = value` and whose target resolved. */
export interface WireWhen extends Located {
  env: string;
  value: string;
  target: Ref;
}

export interface WireCompose extends Located {
  target: Ref;
}

export interface WireDep extends Located {
  name: string;
  target: Ref;
  when: readonly WireWhen[];
  compose: readonly WireCompose[];
}

export interface Wire extends Located {
  target: Ref;
  deps: readonly WireDep[];
}

export interface SpecIR {
  rules: readonly RuleAssertion[];
  /** `layers` lines that did not become an order. Not assertions. */
  rejectedLayers: readonly RejectedLayers[];
  /** A rules or map section wrote a rule the old text IR would have compiled, even when the order was rejected. */
  hasRules: boolean;
  /** `module` lines under rules and map. Not assertions. */
  modules: readonly SpecModule[];
  flows: readonly Flow[];
  planned: readonly Planned[];
  wires: readonly Wire[];
}

/** Triggers and top-level items, then nested items, in source order. */
export function walkFlow(flow: Flow, visit: (item: Trigger | FlowItem) => void): void {
  const walk = (item: Trigger | FlowItem): void => {
    visit(item);
    if (item.kind === "test") return;
    for (const child of item.children) walk(child);
  };
  for (const item of flow.top) walk(item);
}

const WIRE_CONDITION = /^env\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)$/;

interface LayerCandidate {
  seq: number;
  file: string;
  span: Span;
  text: string;
  order: readonly Ref[];
  nested: readonly Ref[];
  source: Node;
  valid: boolean;
}

interface PlacedRule {
  seq: number;
  rule: RuleAssertion;
}

export function compileSpec(docs: readonly Document[]): { spec: SpecIR; diagnostics: Diagnostic[] } {
  const placed: PlacedRule[] = [];
  const candidates: LayerCandidate[] = [];
  const modules: SpecModule[] = [];
  const flows: Flow[] = [];
  const planned: Planned[] = [];
  const wires: Wire[] = [];
  const diagnostics: Diagnostic[] = [];
  let seq = 0;
  const nextSeq = (): number => seq++;
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind === "rules" || section.kind === "map") compileRules(doc.path, section, placed, candidates, modules, diagnostics, nextSeq);
      else if (section.kind === "flow" && section.name) flows.push(compileFlow(doc.path, section, planned));
      else if (section.kind === "wiring") compileWires(doc.path, section, wires, diagnostics);
    }
  }
  const { orders, rejectedLayers } = settleLayers(candidates, diagnostics);
  const merged = [...placed, ...orders].sort((a, b) => a.seq - b.seq);
  const rules = merged.map((item) => item.rule);
  const hasRules = rules.length > 0 || rejectedLayers.length > 0;
  return { spec: { rules, rejectedLayers, hasRules, modules, flows, planned, wires }, diagnostics };
}

function compileRules(
  file: string,
  section: Section,
  placed: PlacedRule[],
  candidates: LayerCandidate[],
  modules: SpecModule[],
  diagnostics: Diagnostic[],
  nextSeq: () => number,
): void {
  const place = (rule: RuleAssertion): void => {
    placed.push({ seq: nextSeq(), rule });
  };
  for (const node of sectionNodes(section)) {
    if (node.kind === "layers") {
      const line = considerLayers(file, node, diagnostics);
      if (line) candidates.push({ ...line, seq: nextSeq() });
    } else if (node.kind === "allow" || node.kind === "deny") {
      const rule = dependency(file, node, node.kind);
      if (rule) place(rule);
    } else if (node.kind === "entry") {
      const entry = entryLine(file, node);
      if (entry) place(entry);
    } else if (node.kind === "no-cycles") {
      place(noCycles(file, node, null));
    } else if (node.kind === "rule-module") {
      const module = node.refs[0];
      if (!module) continue;
      modules.push({ file, span: node.span, target: module, source: node });
      for (const child of node.children) {
        if (child.kind === "exports") {
          const rule = exportsRule(file, child, module);
          if (rule) place(rule);
        } else if (child.kind === "no-cycles") place(noCycles(file, child, module));
      }
    }
  }
}

/** A `layers` line the old text IR would have kept, with K005 for a non-layer or a repeated layer. An empty line is absent. */
function considerLayers(file: string, node: Node, diagnostics: Diagnostic[]): Omit<LayerCandidate, "seq"> | null {
  const nested = node.children.flatMap((child) => child.refs);
  if (node.refs.length === 0 && nested.length === 0) return null;
  const text = node.refs.length > 0 ? `layers ${node.refs.map((ref) => ref.target).join(" < ")}` : "layers";
  const seen = new Set<string>();
  let valid = node.refs.length > 0;
  for (const ref of node.refs) {
    if (ref.target.includes(".")) {
      diagnostics.push(diagnostic("K005", file, ref.span, `\`layers\` orders layers; \`${ref.target}\` is not a layer`, "layer"));
      valid = false;
    } else if (seen.has(ref.target)) {
      diagnostics.push(diagnostic("K005", file, ref.span, `layer \`${ref.target}\` appears twice in one order`, "layer"));
      valid = false;
    }
    seen.add(ref.target);
  }
  for (const ref of nested) {
    if (ref.target.includes(".")) diagnostics.push(diagnostic("K005", file, ref.span, `\`layers\` lists layers; \`${ref.target}\` is not a layer`, "layer"));
  }
  return { file, span: node.span, text, order: node.refs, nested, source: node, valid };
}

/**
 * One partial order across every document, in encounter order. A line that
 * contradicts an earlier order is K005 and not an order. A nested name that
 * is also ordered is K005; the line itself may still be an order.
 */
function settleLayers(candidates: readonly LayerCandidate[], diagnostics: Diagnostic[]): { orders: PlacedRule[]; rejectedLayers: RejectedLayers[] } {
  const direct = new Map<string, Set<string>>();
  let above = new Map<string, Set<string>>();
  const surviving: LayerCandidate[] = [];
  for (const chain of candidates) {
    if (!chain.valid) continue;
    const names = chain.order.map((ref) => ref.target);
    let conflict: [string, string] | null = null;
    for (let i = 0; i < names.length && !conflict; i++) {
      for (let j = i + 1; j < names.length && !conflict; j++) {
        const lower = names[i]!;
        const upper = names[j]!;
        if (above.get(upper)?.has(lower)) conflict = [lower, upper];
      }
    }
    if (conflict) {
      const [lower, upper] = conflict;
      diagnostics.push(diagnostic("K005", chain.file, chain.span, `\`${chain.text}\` contradicts an earlier \`layers\`, which puts \`${lower}\` above \`${upper}\``, "layer"));
      chain.valid = false;
      continue;
    }
    surviving.push(chain);
    for (let i = 0; i + 1 < names.length; i++) {
      const lower = names[i]!;
      const set = direct.get(lower) ?? new Set<string>();
      set.add(names[i + 1]!);
      direct.set(lower, set);
    }
    above = layersAbove(direct);
  }
  const ordered = new Set(surviving.flatMap((chain) => chain.order.map((ref) => ref.target)));
  for (const candidate of candidates) {
    for (const ref of candidate.nested) {
      if (ref.target.includes(".")) continue;
      if (ordered.has(ref.target)) diagnostics.push(diagnostic("K005", candidate.file, ref.span, `layer \`${ref.target}\` is both in a \`layers\` order and unordered under it`, "layer"));
    }
  }
  const orders = surviving.map((chain) => ({
    seq: chain.seq,
    rule: {
      kind: "layers" as const,
      layers: chain.order.map((ref) => ref.target),
      nested: chain.nested,
      ...at(chain.file, chain.source, chain.text),
    },
  }));
  const rejectedLayers = candidates
    .filter((chain) => !chain.valid)
    .map((chain) => ({ file: chain.file, span: chain.span, text: chain.text, order: chain.order, nested: chain.nested, source: chain.source }));
  return { orders, rejectedLayers };
}

function layersAbove(direct: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Set<string>> {
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

function dependency(file: string, node: Node, effect: "allow" | "deny"): DependencyRule | null {
  const [from, ...rest] = node.refs;
  const to = nonEmpty(rest);
  if (!from || !to) return null;
  return { kind: "dependency", effect, from, to, ...at(file, node, `${effect} ${from.target} ${rest.map((ref) => ref.target).join(" ")}`) };
}

function nonEmpty(refs: readonly Ref[]): NonEmpty<Ref> | null {
  const [first, ...rest] = refs;
  return first === undefined ? null : [first, ...rest];
}

function entryLine(file: string, node: Node): Entry | null {
  const entries = node.children.flatMap((child) => child.refs);
  const [first, ...rest] = entries;
  if (!first) return null;
  return { kind: "entry", entries: [first, ...rest], ...at(file, node, `entry ${entries.map((ref) => ref.target).join(" ")}`) };
}

function noCycles(file: string, node: Node, under: Ref | null): NoCycles {
  return { kind: "no-cycles", under, ...at(file, node, `no-cycles ${under?.target ?? "*"}`) };
}

function exportsRule(file: string, node: Node, module: Ref): ExportsRule | null {
  const [first, ...rest] = node.refs;
  if (!first) return null;
  const names = node.refs.map((ref) => ref.text).sort().join(", ");
  return { kind: "exports", module, names: [first, ...rest], ...at(file, node, `exports ${module.target}: ${names}`) };
}

function compileFlow(file: string, section: Section, planned: Planned[]): Flow {
  const name = section.name!.value;
  const triggers: Trigger[] = [];
  const items: FlowItem[] = [];
  const top: (Trigger | FlowItem)[] = [];
  let kind: Flow["kind"] = null;
  for (const node of sectionNodes(section)) {
    if (node.kind === "planned") {
      const item = plannedDecl(file, node);
      if (item) planned.push(item);
      continue;
    }
    if (node.kind === "kind") {
      const value = node.text?.value;
      if (kind === null && (value === "business" || value === "technical")) kind = value;
      continue;
    }
    if (node.kind === "trigger") {
      const trigger = triggerItem(file, name, node);
      if (trigger) {
        triggers.push(trigger);
        top.push(trigger);
      } else {
        const hoisted = flowItems(file, name, node.children);
        items.push(...hoisted);
        top.push(...hoisted);
      }
      continue;
    }
    const compiled = flowNode(file, name, node);
    items.push(...compiled);
    top.push(...compiled);
  }
  return { file, span: section.name!.span, name, kind, triggers, items, top };
}

function flowNode(file: string, flow: string, node: Node): FlowItem[] {
  if (node.kind === "step") {
    const target = node.refs[0];
    if (!target) return flowItems(file, flow, node.children);
    return [{ kind: "step", target, children: flowItems(file, flow, node.children), ...flowAt(file, flow, node) }];
  }
  if (node.kind === "when") {
    const condition = node.text?.value;
    if (condition === undefined) return flowItems(file, flow, node.children);
    return [{ kind: "when", condition, children: flowItems(file, flow, node.children), ...flowAt(file, flow, node) }];
  }
  if (node.kind === "then") {
    const target = node.refs[0];
    const children = flowItems(file, flow, node.children);
    if (target) return [{ kind: "then", form: "ref", target, children, ...flowAt(file, flow, node) }];
    const prose = node.text?.value;
    if (prose === undefined) return children;
    return [{ kind: "then", form: "text", prose, children, ...flowAt(file, flow, node) }];
  }
  if (node.kind === "invariant" || node.kind === "reads" || node.kind === "emits") {
    const target = node.refs[0] ?? null;
    const body = node.text?.value ?? target?.target;
    if (body === undefined) return flowItems(file, flow, node.children);
    return [{ kind: node.kind, body, target, children: flowItems(file, flow, node.children), ...flowAt(file, flow, node) }];
  }
  if (node.kind === "test") {
    const path = node.text?.value;
    if (path === undefined) return [];
    return [{ kind: "test", path, name: node.label?.value ?? null, ...flowAt(file, flow, node) }];
  }
  if (node.kind === "planned") return [];
  return flowItems(file, flow, node.children);
}

function flowItems(file: string, flow: string, nodes: readonly Node[]): FlowItem[] {
  return nodes.flatMap((node) => flowNode(file, flow, node));
}

function triggerItem(file: string, flow: string, node: Node): Trigger | null {
  const target = node.refs[0];
  if (!target) return null;
  return { kind: "trigger", target, children: flowItems(file, flow, node.children), ...flowAt(file, flow, node) };
}

function plannedDeclKind(value: string): Planned["decl"] | null {
  if (value === "fn" || value === "module" || value === "type" || value === "event") return value;
  return null;
}

function plannedDecl(file: string, node: Node): Planned | null {
  const decl = node.label ? plannedDeclKind(node.label.value) : null;
  if (!node.id || !decl) return null;
  return { kind: "planned", decl, id: node.id, signature: node.text?.value ?? null, ...at(file, node, renderMeaning(node)) };
}

function compileWires(file: string, section: Section, wires: Wire[], diagnostics: Diagnostic[]): void {
  for (const node of sectionNodes(section)) {
    const target = node.kind === "wire" ? node.refs[0] : undefined;
    if (!target) continue;
    const deps: WireDep[] = [];
    for (const child of node.children) {
      const depTarget = child.kind === "wire-dep" ? child.refs[0] : undefined;
      if (!child.name || !depTarget) continue;
      const when: WireWhen[] = [];
      const compose: WireCompose[] = [];
      for (const option of child.children) {
        if (option.kind === "compose") {
          const composeTarget = option.refs[0];
          if (composeTarget) compose.push({ target: composeTarget, ...at(file, option, renderMeaning(option)) });
        } else if (option.kind === "when") {
          const parsed = wireWhen(file, option, diagnostics);
          if (parsed) when.push(parsed);
        }
      }
      deps.push({ name: child.name.value, target: depTarget, when, compose, ...at(file, child, renderMeaning(child)) });
    }
    wires.push({ target, deps, ...at(file, node, renderMeaning(node)) });
  }
}

/** `env.NAME = value` with a target. A condition of another shape is K005 and is not stored. A matching condition with no target is absent: the parser already reported the missing arrow. */
function wireWhen(file: string, option: Node, diagnostics: Diagnostic[]): WireWhen | null {
  const match = WIRE_CONDITION.exec(wireConditionText(option));
  const env = match?.[1];
  const value = match?.[2];
  if (env === undefined || value === undefined) {
    diagnostics.push(diagnostic("K005", file, option.text?.span ?? option.span, "a wiring condition must be `env.NAME = value`", "arguments"));
    return null;
  }
  const target = option.refs[0];
  if (!target) return null;
  return { env, value, target, ...at(file, option, renderMeaning(option)) };
}

/**
 * Condition text of `- when <condition> → <id>`, matching the bytes the wiring
 * check compares: tokens between the keyword and the arrow, joined only where
 * they do not already touch. `env.DB = a,b` stays `a,b`.
 */
function wireConditionText(node: Node): string {
  const tokens = node.tokens;
  const arrow = tokens.findIndex((token) => token.text === "→" || token.text === "->");
  let out = "";
  let previous: (typeof tokens)[number] | undefined;
  for (const token of tokens.slice(1, arrow === -1 ? tokens.length : arrow)) {
    if (previous !== undefined && previous.span.end.offset !== token.span.start.offset) out += " ";
    out += token.text;
    previous = token;
  }
  return out;
}

function at(file: string, node: Node, text: string): Located {
  return { file, span: node.span, text, source: node };
}

function flowAt(file: string, flow: string, node: Node): Located {
  return at(file, node, `${flow}\0${node.kind} ${renderMeaning(node)}`);
}
