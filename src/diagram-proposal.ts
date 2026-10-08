// What a drawing in the editor of `keylang web` asks of the specs
// (business-flows/24): the canvas (`window.keylangEditor.currentModel()`)
// compared with the diagram of the same view, as the text each spec would
// have. Pure: the files come in through `read`, the result is the full text
// of every target, and the operation (`operations/diagram-propose.ts`) writes
// them as proposals.
//
// - A flow's section is edited as little as the drawing asks
//   (`flowFromDrawio`, the import of a draw.io file): a shape the diagram
//   drew keeps its line — prose under it stays byte for byte — an ID, a
//   condition or the kind of a trigger changed on it rewrites that line, a
//   removed shape takes its line out, and a new step, `when`, `parallel`,
//   event or timer goes in after the shape its line comes from.
// - A new trigger the flow does not reach starts a new flow
//   (`<dir>/flows/<name>.md`); a `continues` line into a trigger adds
//   `- continues <flow>` to the flow that trigger starts.
// - A shape with a `planned:` ID nobody declared yet gets `- planned fn|module|type <id> [signature]`
//   at the end of its flow.
// - An `allow` or `deny` line between lanes (layers, modules, fns, types)
//   becomes that rule in `<dir>/rules.md` (`withRules`); a new lane gets a
//   `layers` line that places it in the order by its place among the lanes,
//   and goes into keylang.json as `keylang draft map` shows a layout:
//   printed, never written.
//
// What the drawing says that keylang cannot write — a removed connection, a
// connection between two shapes of the code, a call — is named in `notes`.

import { withLayers } from "./config.ts";
import { flowFromDrawio, flowSection, type DrawioCell, type DrawioModel } from "./drawio.ts";
import { withFlow, withRules } from "./draft.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { compareText } from "./span.ts";
import type { Flow, SpecIR } from "./spec-ir.ts";

/** One shape of the editor's canvas, as `currentModel()` gives it (web/src/editor.ts). */
export interface EditorNode {
  key: string;
  id: string;
  kind: string;
  label: string;
  layer: string | null;
  trigger?: string;
  role?: "split" | "join";
  signature?: string;
  tests?: string[];
  description?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditorEdge {
  key: string;
  kind: string;
  from: string;
  to: string;
  label?: string;
  points?: { x: number; y: number }[];
}

export interface EditorLane {
  key: string;
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditorModel {
  view: string;
  mode?: string;
  nodes: EditorNode[];
  edges: EditorEdge[];
  lanes: EditorLane[];
}

/** At most this many shapes and connections in one model. */
export const MAX_MODEL_ITEMS = 5000;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The editor's model from JSON, or what is wrong with it. */
export function parseEditorModel(value: unknown): EditorModel | string {
  if (!isObject(value)) return "model: an object `{view, nodes, edges, lanes}` (window.keylangEditor.currentModel())";
  const { view, nodes, edges, lanes } = value;
  if (!text(view)) return "model.view: a view key such as `flow:checkout`";
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(lanes)) return "model: `nodes`, `edges` and `lanes` must be arrays";
  if (nodes.length + edges.length + lanes.length > MAX_MODEL_ITEMS) return `model: more than ${MAX_MODEL_ITEMS} shapes and connections`;
  const out: EditorModel = { view, nodes: [], edges: [], lanes: [], ...(text(value.mode) ? { mode: value.mode } : {}) };
  for (const [i, node] of nodes.entries()) {
    if (!isObject(node) || !text(node.key) || !text(node.id) || !text(node.kind) || !text(node.label)) return `model.nodes[${i}]: needs key, id, kind and label`;
    if (![node.x, node.y, node.w, node.h].every(finite)) return `model.nodes[${i}]: needs x, y, w and h`;
    const tests = Array.isArray(node.tests) ? node.tests.filter(text) : [];
    out.nodes.push({
      key: node.key,
      id: node.id,
      kind: node.kind,
      label: node.label,
      layer: text(node.layer) ? node.layer : null,
      ...(text(node.trigger) ? { trigger: node.trigger } : {}),
      ...(node.role === "split" || node.role === "join" ? { role: node.role } : {}),
      ...(text(node.signature) ? { signature: node.signature } : {}),
      tests,
      ...(text(node.description) ? { description: node.description } : {}),
      x: node.x as number,
      y: node.y as number,
      w: node.w as number,
      h: node.h as number,
    });
  }
  for (const [i, edge] of edges.entries()) {
    if (!isObject(edge) || !text(edge.key) || !text(edge.kind) || !text(edge.from) || !text(edge.to)) return `model.edges[${i}]: needs key, kind, from and to`;
    out.edges.push({ key: edge.key, kind: edge.kind, from: edge.from, to: edge.to, ...(text(edge.label) ? { label: edge.label } : {}) });
  }
  for (const [i, lane] of lanes.entries()) {
    if (!isObject(lane) || !text(lane.key) || !text(lane.id) || ![lane.x, lane.y, lane.w, lane.h].every(finite)) return `model.lanes[${i}]: needs key, id, x, y, w and h`;
    out.lanes.push({ key: lane.key, id: lane.id, label: text(lane.label) ? lane.label : lane.id, x: lane.x as number, y: lane.y as number, w: lane.w as number, h: lane.h as number });
  }
  return out;
}

/** The diagram of the view as `diagramOf` drew it: what the canvas is compared with. */
export interface BaseDiagram {
  nodes: readonly { id: string; kind: string; label: string; ref?: { id?: string } }[];
  edges: readonly { from: string; to: string; kind: string }[];
}

export interface ChangeInput {
  model: EditorModel;
  /** The view's diagram; empty for the empty canvas. */
  diagram: BaseDiagram;
  /** The flow the view draws (`flow:<name>`), or null. */
  flow: string | null;
  spec: SpecIR;
  snapshot: AnalysisSnapshot | null;
  /** The spec directory, relative to the root, POSIX. */
  specDir: string;
  /** A file's text, relative to the root; null when there is none. */
  read: (path: string) => string | null;
  /** keylang.json as it is, and its layers. */
  config: { text: string | null; layers: Readonly<Record<string, readonly string[]>> };
}

/** The full new text of one spec, and the shapes of the canvas it came from. */
export interface ChangedTarget {
  target: string;
  before: string | null;
  text: string;
  /** Keys of the drawn shapes this text holds. */
  shapes: string[];
}

export interface DiagramChanges {
  targets: ChangedTarget[];
  /** keylang.json with the new lanes as layers: printed, never written. */
  config: { target: string; before: string; text: string } | null;
  notes: string[];
}

const strip = (id: string): string => id.replace(/^planned:/, "");
const FLOW_EDGES: ReadonlySet<string> = new Set(["sequence", "emits"]);
const STRUCTURE: ReadonlySet<string> = new Set(["lane", "layer", "module", "fn", "type"]);
const PLANNED_DECL: Readonly<Record<string, "fn" | "module" | "type">> = { task: "fn", fn: "fn", start: "fn", module: "module", type: "type" };

/** A flow name from a trigger's ID: its last segment, what a name cannot hold as `-`. */
function flowNameOf(id: string): string {
  const name = (id.slice(id.lastIndexOf(".") + 1) || id).replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return name === "" ? "flow" : name;
}

/** Collects edits per target: each starts from the file on disk and takes edits in turn. */
class Targets {
  private readonly texts = new Map<string, { before: string | null; text: string | null; shapes: Set<string> }>();
  private readonly read: (path: string) => string | null;
  constructor(read: (path: string) => string | null) {
    this.read = read;
  }

  current(target: string): string | null {
    const known = this.texts.get(target);
    if (known) return known.text;
    const before = this.read(target);
    this.texts.set(target, { before, text: before, shapes: new Set() });
    return before;
  }

  set(target: string, text: string, shapes: Iterable<string> = []): void {
    this.current(target);
    const entry = this.texts.get(target)!;
    entry.text = text;
    for (const key of shapes) entry.shapes.add(key);
  }

  changed(): ChangedTarget[] {
    return [...this.texts]
      .filter(([, entry]) => entry.text !== null && entry.text !== entry.before)
      .map(([target, entry]) => ({ target, before: entry.before, text: entry.text!, shapes: [...entry.shapes].sort(compareText) }))
      .sort((a, b) => compareText(a.target, b.target));
  }
}

/** The section of a flow in the text of its file replaced, the rest byte for byte (CRLF kept). */
function replaceSection(own: string, section: { text: string; firstLine: number }, edited: string): string {
  const lines = own.replace(/\r\n/g, "\n").split("\n");
  const count = section.text.split("\n").length;
  const out = [...lines.slice(0, section.firstLine - 1), ...edited.split("\n"), ...lines.slice(section.firstLine - 1 + count)].join("\n");
  return /\r\n/.test(own) ? out.replace(/\n/g, "\r\n") : out;
}

/** Lines added at the end of a flow section's list (after its last list line), as more of the list. */
function appendToList(section: string, added: readonly string[]): string {
  if (added.length === 0) return section;
  const lines = section.replace(/\n+$/, "").split("\n");
  const tail = /\n*$/.exec(section)![0];
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*- /.test(lines[i]!)) {
      last = i;
      break;
    }
  }
  if (last === -1) return `${[...lines, "", ...added].join("\n")}${tail}`;
  // The end of that list item: its continuation lines (nested or wrapped) up to a blank line.
  let end = last + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end]!) && !/^\s*- /.test(lines[end]!)) end++;
  return `${[...lines.slice(0, end), ...added, ...lines.slice(end)].join("\n")}${tail}`;
}

/** `- continues <flow>` as the first list line of a section (once). */
function withContinues(section: string, from: string): string {
  const line = `- continues ${from}`;
  const lines = section.split("\n");
  if (lines.some((l) => l.trim() === line)) return section;
  const first = lines.findIndex((l) => /^- /.test(l));
  if (first === -1) return appendToList(section, [line]);
  return [...lines.slice(0, first), line, ...lines.slice(first)].join("\n");
}

/**
 * The texts the drawing asks for. `model` is the canvas, `diagram` the view
 * as the code and the specs draw it now; nothing is read but through `read`.
 */
export function diagramChanges(input: ChangeInput): DiagramChanges {
  const { model, diagram, spec, snapshot } = input;
  const notes: string[] = [];
  const targets = new Targets(input.read);
  const flowsDir = `${input.specDir === "" ? "" : `${input.specDir}/`}flows`;
  const codeNodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const byKey = new Map(model.nodes.map((node) => [node.key, node]));
  const isCode = (key: string): boolean => codeNodes.has(key);
  const declared = new Set(spec.planned.map((p) => p.id));
  const known = (id: string): boolean => snapshot?.nodes[id] !== undefined;
  const triggerFlows = new Map<string, Flow>();
  for (const flow of spec.flows) for (const trigger of flow.triggers) if (!triggerFlows.has(trigger.target.target)) triggerFlows.set(trigger.target.target, flow);
  const entryKinds = new Map((snapshot?.entries ?? []).map((entry) => [entry.id, entry.kind]));
  const flowEdges = model.edges.filter((edge) => FLOW_EDGES.has(edge.kind) && byKey.has(edge.from) && byKey.has(edge.to));

  // ── flows ────────────────────────────────────────────────────────────────
  const mainFlow = input.flow === null ? null : (spec.flows.find((flow) => flow.name === input.flow) ?? null);
  if (input.flow !== null && mainFlow === null) notes.push(`flow \`${input.flow}\` is not in the specs any more: its changes are not proposed`);
  // A new trigger is a new flow, unless an existing flow starts there (then only `continues` lines go to it).
  const newStarts = model.nodes.filter((node) => node.kind === "start" && !isCode(node.key) && strip(node.id) !== "");
  const startFlow = new Map<string, string>();
  const usedNames = new Set(spec.flows.map((flow) => flow.name));
  for (const start of newStarts) {
    const existing = triggerFlows.get(strip(start.id));
    if (existing) {
      startFlow.set(start.key, existing.name);
      continue;
    }
    let name = flowNameOf(strip(start.id));
    for (let n = 2; usedNames.has(name); n++) name = `${flowNameOf(strip(start.id))}-${n}`;
    usedNames.add(name);
    startFlow.set(start.key, name);
  }
  // Which flow each shape belongs to: the view's flow holds the shapes of the code and what its lines reach; a new trigger, what it reaches.
  const owner = new Map<string, string>();
  const reach = (from: string[], flow: string): void => {
    const queue = [...from];
    while (queue.length > 0) {
      const key = queue.shift()!;
      for (const edge of flowEdges) {
        if (edge.from !== key || owner.has(edge.to) || isCode(edge.to)) continue;
        const target = byKey.get(edge.to)!;
        if (target.kind === "start") continue;
        owner.set(edge.to, flow);
        queue.push(edge.to);
      }
    }
  };
  if (mainFlow !== null) {
    const codeKeys = model.nodes.filter((node) => isCode(node.key)).map((node) => node.key);
    for (const key of codeKeys) owner.set(key, mainFlow.name);
    reach(codeKeys, mainFlow.name);
  }
  for (const start of newStarts) {
    const name = startFlow.get(start.key)!;
    if (triggerFlows.has(strip(start.id))) continue;
    owner.set(start.key, name);
    reach([start.key], name);
  }

  const cellOf = (node: EditorNode): DrawioCell => {
    const attrs: Record<string, string> = { keylang_kind: STRUCTURE.has(node.kind) && node.kind !== "lane" && node.kind !== "layer" ? "task" : node.kind, keylang_id: strip(node.id) };
    if (node.kind === "start" && node.trigger !== undefined) {
      if (!isCode(node.key)) attrs.keylang_trigger = node.trigger;
      else {
        // A trigger of the code changes kind only when the drawing names another than the spec or the entry point does.
        const item = mainFlow?.triggers.find((t) => t.target.target === strip(node.id));
        const implied = item?.entry?.kind ?? entryKinds.get(strip(node.id)) ?? "fn";
        if (node.trigger !== implied) attrs.keylang_trigger = node.trigger;
      }
    }
    if (node.role !== undefined) attrs.keylang_role = node.role;
    if (!isCode(node.key) && (node.tests ?? []).length > 0) attrs.keylang_tests = node.tests!.join("\n");
    return { id: node.key, label: node.label, attrs, vertex: true, edge: false, source: null, target: null, style: "" };
  };
  /** The drawing of one flow: its shapes and the lines between them; the first unlabelled line out of a new `when` is its branch. */
  const drawingOf = (flow: string): DrawioModel => {
    const members = model.nodes.filter((node) => owner.get(node.key) === flow);
    const inside = new Set(members.map((node) => node.key));
    const cells: DrawioCell[] = members.map(cellOf);
    const branched = new Set<string>();
    for (const edge of flowEdges) {
      if (!inside.has(edge.from) || !inside.has(edge.to)) continue;
      const source = byKey.get(edge.from)!;
      let label = edge.label ?? "";
      if (source.kind === "gateway" && !isCode(source.key) && label === "" && !branched.has(source.key)) {
        branched.add(source.key);
        label = source.label;
      }
      cells.push({ id: edge.key, label, attrs: {}, vertex: false, edge: true, source: edge.from, target: edge.to, style: "" });
    }
    return { view: `flow:${flow}`, cells };
  };
  /** The drawn shapes of a flow that its text now holds a line for. */
  const drawnIn = (flow: string): string[] => model.nodes.filter((node) => owner.get(node.key) === flow && !isCode(node.key)).map((node) => node.key);

  // Planned declarations: a `planned:` ID that neither the specs declare nor the code has, once each.
  const plannedLines = new Map<string, string[]>();
  const plannedShapes = new Map<string, string[]>();
  const loose: EditorNode[] = [];
  const seenPlanned = new Set<string>();
  for (const node of model.nodes) {
    if (!node.id.startsWith("planned:")) continue;
    const id = strip(node.id);
    const decl = PLANNED_DECL[node.kind];
    if (decl === undefined || id === "" || !id.includes(".") || declared.has(id) || known(id) || seenPlanned.has(id)) continue;
    seenPlanned.add(id);
    const flow = owner.get(node.key) ?? (mainFlow?.name ?? null);
    const line = `- planned ${decl} ${id}${node.signature ? ` ${node.signature}` : ""}`;
    if (flow === null) {
      loose.push(node);
      continue;
    }
    plannedLines.set(flow, [...(plannedLines.get(flow) ?? []), line]);
    plannedShapes.set(flow, [...(plannedShapes.get(flow) ?? []), node.key]);
  }
  // The rest of the drawn flow shapes no flow reaches: nothing to say about them in a flow.
  for (const node of model.nodes) {
    if (isCode(node.key) || owner.has(node.key) || STRUCTURE.has(node.kind) || node.kind === "note" || node.kind === "group" || node.kind === "start") continue;
    notes.push(`${node.kind} \`${node.id || node.label}\` is connected to no flow by a sequence or emits line: not proposed`);
  }
  for (const node of loose) notes.push(`planned \`${strip(node.id)}\` belongs to no flow on this canvas: declare it in a flow or a feature`);

  // The view's flow: its section edited in place.
  if (mainFlow !== null) {
    const own = targets.current(mainFlow.file);
    const section = own === null ? null : flowSection(own, mainFlow.name);
    if (own === null || section === null) notes.push(`${mainFlow.file}: flow \`${mainFlow.name}\` is no longer there; its changes are not proposed`);
    else {
      let edited = flowFromDrawio(drawingOf(mainFlow.name), mainFlow.name, { text: section.text, flow: mainFlow, firstLine: section.firstLine });
      edited = appendToList(edited, plannedLines.get(mainFlow.name) ?? []);
      if (edited !== section.text) targets.set(mainFlow.file, replaceSection(own, section, edited), [...drawnIn(mainFlow.name), ...(plannedShapes.get(mainFlow.name) ?? [])]);
    }
  }
  // New flows: one section each, in `<dir>/flows/<name>.md`.
  for (const start of newStarts) {
    if (triggerFlows.has(strip(start.id))) continue;
    const name = startFlow.get(start.key)!;
    const target = `${flowsDir}/${name}.md`;
    let section = flowFromDrawio(drawingOf(name), name, null);
    section = appendToList(section, plannedLines.get(name) ?? []);
    targets.set(target, withFlow(targets.current(target), { name, text: section.replace(/\n*$/, "\n") }), [...drawnIn(name), ...(plannedShapes.get(name) ?? [])]);
  }
  // `continues`: the flow a line enters continues the flow it leaves.
  for (const edge of model.edges) {
    if (edge.kind !== "continues") continue;
    const from = owner.get(edge.from);
    const to = byKey.get(edge.to);
    if (from === undefined || to === undefined) {
      notes.push(`continues \`${edge.key}\`: its shapes belong to no flow on this canvas`);
      continue;
    }
    const intoName = owner.get(to.key) ?? startFlow.get(to.key) ?? triggerFlows.get(strip(to.id))?.name;
    if (intoName === undefined || intoName === from) {
      notes.push(`continues \`${edge.key}\`: it must enter the trigger of another flow`);
      continue;
    }
    const into = spec.flows.find((flow) => flow.name === intoName);
    const file = into?.file ?? `${flowsDir}/${intoName}.md`;
    const own = targets.current(file);
    const section = own === null ? null : flowSection(own, intoName);
    if (own === null || section === null) {
      notes.push(`continues: flow \`${intoName}\` has no section in ${file}`);
      continue;
    }
    const edited = withContinues(section.text, from);
    if (edited !== section.text) targets.set(file, replaceSection(own, section, edited), [edge.key]);
  }

  // ── rules ────────────────────────────────────────────────────────────────
  const rulesFile = `${input.specDir === "" ? "" : `${input.specDir}/`}rules.md`;
  const laneIds = new Map(model.lanes.map((lane) => [lane.key, lane.id]));
  const endId = (key: string): string | null => {
    const lane = laneIds.get(key);
    if (lane !== undefined) return strip(lane);
    const node = byKey.get(key);
    return node !== undefined && STRUCTURE.has(node.kind) && strip(node.id) !== "" ? strip(node.id) : null;
  };
  const written = new Set<string>();
  for (const rule of spec.rules) if (rule.kind === "dependency") for (const to of rule.to) written.add(`${rule.effect} ${rule.from.target} ${to.target}`);
  const ruleLines: string[] = [];
  const ruleEdges: string[] = [];
  for (const edge of model.edges) {
    if (edge.kind !== "allow" && edge.kind !== "deny") continue;
    const from = endId(edge.from);
    const to = endId(edge.to);
    if (from === null || to === null) {
      notes.push(`${edge.kind} \`${edge.key}\`: a rule is between layers, modules, fns or types with an ID`);
      continue;
    }
    const key = `${edge.kind} ${from} ${to}`;
    if (written.has(key)) continue;
    written.add(key);
    ruleLines.push(`- ${key}`);
    ruleEdges.push(edge.key);
  }
  // New lanes: a `layers` line that puts each between the layer of the nearest lane above it that the order has and the one after it
  // in the order — a line that agrees with the order (grammar Р: several `layers` lines must agree), so nothing the order says is removed.
  const configured = new Set(Object.keys(input.config.layers));
  const newLanes = model.lanes.filter((lane) => lane.id.startsWith("planned:") && strip(lane.id) !== "" && !configured.has(strip(lane.id)));
  const order = spec.rules.find((rule) => rule.kind === "layers");
  if (order !== undefined && order.kind === "layers") {
    const lanes = [...model.lanes].sort((a, b) => a.y - b.y || compareText(a.key, b.key));
    const layerLines: string[] = [];
    for (const lane of lanes) {
      const name = strip(lane.id);
      if (!newLanes.includes(lane) || order.layers.includes(name)) continue;
      const above = lanes.slice(0, lanes.indexOf(lane)).reverse().find((other) => order.layers.includes(strip(other.id)));
      const lower = above === undefined ? undefined : strip(above.id);
      const higher = lower === undefined ? order.layers[0] : order.layers[order.layers.indexOf(lower) + 1];
      layerLines.push(`- layers ${[lower, name, higher].filter((layer) => layer !== undefined).join(" < ")}`);
      ruleEdges.push(lane.key);
    }
    ruleLines.unshift(...layerLines);
  }
  if (ruleLines.length > 0) targets.set(rulesFile, withRules(targets.current(rulesFile), `# rules\n\n${ruleLines.join("\n")}\n`), ruleEdges);

  // keylang.json: the new layers, as `keylang draft map` prints a layout — never written.
  let config: DiagramChanges["config"] = null;
  if (newLanes.length > 0 && input.config.text !== null) {
    const layers: Record<string, readonly string[]> = { ...input.config.layers };
    for (const lane of newLanes) layers[strip(lane.id)] = [globFor(strip(lane.id), input.config.layers)];
    const done = withLayers("keylang.json", input.config.text, layers);
    if ("text" in done) config = { target: "keylang.json", before: input.config.text, text: done.text };
    else notes.push(done.error);
  }
  for (const edge of model.edges) {
    if (edge.kind === "call" && !(isCode(edge.from) && isCode(edge.to)) && (owner.has(edge.from) || owner.has(edge.to))) notes.push(`call \`${edge.key}\`: a call is what the code does; draw a step instead`);
  }
  return { targets: targets.changed(), config, notes };
}

/** A glob for a new layer like the others' (`src/<layer>/**` when they are `src/<their name>/**`), else `src/<layer>/**`. */
function globFor(layer: string, layers: Readonly<Record<string, readonly string[]>>): string {
  for (const [name, globs] of Object.entries(layers)) {
    for (const glob of globs) {
      const at = glob.indexOf(`/${name}/`);
      if (at !== -1 && glob.endsWith("/**")) return `${glob.slice(0, at)}/${layer}/**`;
      if (glob.startsWith(`${name}/`) && glob.endsWith("/**")) return `${layer}/**`;
    }
  }
  return `src/${layer}/**`;
}
