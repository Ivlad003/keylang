// The diagram editor of the diagram page (business-flows/23), in the manner
// of diagrams.net: a maxGraph canvas whose shapes are keylang entities. A view
// of `/api/diagram` opens «з коду»: every shape of the model (a lane per
// layer, start events by trigger kind, tasks, `when` and `parallel` gateways,
// events, timers, external pools, holes) at the positions the server computed
// or the layout store keeps (layout-store.ts), and only the layout changes:
// move, resize, bend an edge, group, align, snap to the grid.
//
// The editor writes nothing to the specs: its state lives in memory, the
// positions go to the layout store, and `currentModel()` is what ticket 24
// diffs against the model to write proposals.

import {
  BaseGraph,
  Cell,
  EdgeHandlerConfig,
  Geometry,
  InternalEvent,
  PanningHandler,
  Point,
  RubberBandHandler,
  SelectionCellsHandler,
  SelectionHandler,
  type CellStyle,
} from "@maxgraph/core";
import type { Api, Diagram, DiagramNode, Verdict, Views } from "./api.ts";
import { register, VERDICT_COLOUR, VERDICT_GLYPH, nodeStyle, wrapLabel } from "./canvas.ts";
import { button, make } from "./dom.ts";
import { layoutStore, type Layout } from "./layout-store.ts";

/** The kinds of shape the editor knows: those of the diagram model and those a person draws. */
export type ShapeKind = "lane" | "layer" | "module" | "fn" | "type" | "start" | "task" | "gateway" | "parallel" | "event" | "timer" | "external" | "hole" | "note" | "group";

/** The kinds of connection: the edges of the diagram model, and an event's subscriber. */
export type LinkKind = "sequence" | "call" | "dependency" | "allow" | "deny" | "emits" | "subscribes" | "continues";

/** «з коду»: the model's shapes, only the layout changes; «чернетка»: everything changes. */
export type EditorMode = "code" | "draft";

/** What a start event stands for: a trigger fn or an entry point's kind. */
export const TRIGGERS = ["fn", "route", "cron", "webhook", "consumer", "cli", "event"] as const;

const TRIGGER_GLYPH: Record<string, string> = { route: "⇥", cron: "⏱", webhook: "✉", consumer: "✉", cli: "›", event: "⚡" };

/** The keylang side of a vertex: its value in the maxGraph model. A class with `clone()`, so a copied cell gets its own. */
export class Shape {
  /** Stable within the view: the diagram node's ID (`step:6`), a lane's `lane:<layer>`, or `draft:<n>` for a drawn one. */
  key: string;
  kind: ShapeKind;
  /** The keylang ID (`application.purchase.buy`), `planned:<layer>.<name>` for one not built yet, or "" for none (a gateway, a note). */
  id: string;
  label: string;
  verdict: string | null = null;
  /** A start event: its trigger kind. */
  trigger: string | null = null;
  /** A parallel gateway: the split or the join. */
  role: "split" | "join" | null = null;
  signature = "";
  /** `test <file> "<name>"` lines. */
  tests: string[] = [];
  description = "";
  /** A hole: why the route is not proven. */
  reason = "";
  /** From the model (`code`) or drawn on the canvas (`draft`). */
  origin: "code" | "draft" = "draft";

  constructor(key: string, kind: ShapeKind, id: string, label: string) {
    this.key = key;
    this.kind = kind;
    this.id = id;
    this.label = label;
  }

  clone(): Shape {
    return Object.assign(new Shape(this.key, this.kind, this.id, this.label), this, { tests: [...this.tests] });
  }

  /** The text maxGraph draws. */
  toString(): string {
    const glyph = this.verdict ? `${VERDICT_GLYPH[this.verdict] ?? ""} ` : "";
    switch (this.kind) {
      case "lane":
      case "group":
        return this.label;
      case "gateway":
        return `× ${wrapLabel(this.label, 2)}`;
      case "parallel":
        return this.role === "join" ? "+ join" : "+";
      case "start":
        return `${TRIGGER_GLYPH[this.trigger ?? ""] ? `${TRIGGER_GLYPH[this.trigger ?? ""]} ` : ""}${glyph}${wrapLabel(this.label, 2)}`;
      case "timer":
        return `⏱ ${wrapLabel(this.label, 2)}`;
      case "event":
        return `${glyph}${wrapLabel(this.label, 2)}`;
      case "hole":
        return "?";
      case "type":
        return `«type» ${wrapLabel(this.label, 2)}`;
      case "note":
        return this.description || this.label;
      default:
        return `${glyph}${wrapLabel(this.label)}`;
    }
  }
}

/** The keylang side of an edge. */
export class Link {
  key: string;
  kind: LinkKind;
  label: string;

  constructor(key: string, kind: LinkKind, label = "") {
    this.key = key;
    this.kind = kind;
    this.label = label;
  }

  clone(): Link {
    return new Link(this.key, this.kind, this.label);
  }

  toString(): string {
    return this.label;
  }
}

/** One shape of `currentModel()`: absolute model coordinates. */
export interface ModelNode {
  key: string;
  id: string;
  kind: ShapeKind;
  label: string;
  /** The layer of the lane it sits in, or null outside every lane. */
  layer: string | null;
  planned: boolean;
  trigger?: string;
  role?: "split" | "join";
  signature?: string;
  tests: string[];
  description?: string;
  /** The key of the group it sits in. */
  group?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ModelEdge {
  key: string;
  kind: LinkKind;
  /** Shape keys. */
  from: string;
  to: string;
  /** The keylang IDs at both ends ("" for a shape without one). */
  fromId: string;
  toId: string;
  label?: string;
  points: { x: number; y: number }[];
}

export interface ModelLane {
  key: string;
  /** The layer: `planned:<name>` for a lane drawn on the canvas. */
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the canvas holds, for ticket 24 to diff against the model. */
export interface EditorModel {
  view: string;
  mode: EditorMode;
  nodes: ModelNode[];
  edges: ModelEdge[];
  lanes: ModelLane[];
}

const SMALL: ReadonlySet<ShapeKind> = new Set(["start", "event", "timer", "gateway", "parallel"]);
const LANE_STYLE: CellStyle = { shape: "swimlane", horizontal: false, startSize: 26, fillColor: "#eef2f4", swimlaneFillColor: "#ffffff", strokeColor: "#b0bec5", fontColor: "#37474f", fontStyle: 1, fontSize: 12 };
const GRID = 10;

/** The style of a shape: the viewer's BPMN-like look, a caption under a small shape, dashed for `planned`. */
export function shapeStyle(shape: Shape): CellStyle {
  if (shape.kind === "lane") return { ...LANE_STYLE };
  if (shape.kind === "group") return { shape: "rectangle", fillColor: "none", strokeColor: "#90a4ae", dashed: true, rounded: true, verticalAlign: "top", align: "left", fontColor: "#607d8b", fontSize: 10, spacingLeft: 4 };
  if (shape.kind === "note") return { shape: "rectangle", fillColor: "#fff9c4", strokeColor: "#f9a825", fontColor: "#5d4037", fontSize: 11, align: "left", verticalAlign: "top", spacing: 6, whiteSpace: "wrap" };
  const viewKind = shape.kind === "type" || shape.kind === "module" ? "fn" : shape.kind;
  const planned = shape.id.startsWith("planned:");
  const style: CellStyle = { ...nodeStyle({ kind: viewKind, verdict: (planned ? "planned" : shape.verdict) as Verdict }) };
  if (planned) style.dashed = true;
  if (shape.kind === "type") Object.assign(style, { rounded: false, fillColor: "#ffffff" });
  if (shape.kind === "module") Object.assign(style, { rounded: false, fontStyle: 1 });
  if (shape.kind === "start" && (shape.trigger === "webhook" || shape.trigger === "consumer")) style.shape = "doubleEllipse";
  if (shape.kind === "parallel" || shape.kind === "gateway") style.fontSize = 11;
  if (shape.kind === "event" || shape.kind === "timer") style.fontSize = 11;
  if (SMALL.has(shape.kind)) Object.assign(style, { verticalLabelPosition: "bottom", verticalAlign: "top", labelBackgroundColor: "none" });
  return style;
}

/** The look of a connection by its meaning: dependencies allowed and denied differ in line style. */
export function linkStyle(link: Link): CellStyle {
  const base: CellStyle = { strokeColor: "#455a64", fontColor: "#424242", fontSize: 10, endArrow: "classic", labelBackgroundColor: "#ffffff", strokeWidth: 1.5 };
  switch (link.kind) {
    case "call":
    case "dependency":
      return { ...base, dashed: true, endArrow: "open" };
    case "allow":
      return { ...base, strokeColor: VERDICT_COLOUR["ok"]!.stroke, endArrow: "open", strokeWidth: 2 };
    case "deny":
      return { ...base, strokeColor: VERDICT_COLOUR["fail"]!.stroke, dashed: true, dashPattern: "6 4", endArrow: "open", strokeWidth: 2 };
    case "emits":
      return { ...base, dashed: true, strokeColor: "#00695c" };
    case "subscribes":
      return { ...base, dashed: true, dashPattern: "2 3", strokeColor: "#00695c" };
    case "continues":
      return { ...base, dashed: true, dashPattern: "8 3 2 3", strokeColor: "#1565c0" };
    default:
      return base;
  }
}

const NODE_KINDS: ReadonlySet<string> = new Set(["start", "task", "gateway", "parallel", "event", "timer", "external", "hole", "module", "fn", "layer"]);
const LINK_KINDS: ReadonlySet<string> = new Set(["sequence", "call", "dependency", "allow", "deny", "emits", "subscribes", "continues"]);

function shapeOf(cell: Cell | null | undefined): Shape | null {
  const value: unknown = cell?.getValue();
  return value instanceof Shape ? value : null;
}

function linkOf(cell: Cell | null | undefined): Link | null {
  const value: unknown = cell?.getValue();
  return value instanceof Link ? value : null;
}

export interface EditorHost {
  status(text: string): void;
  views(): Views | null;
}

export class Editor {
  readonly graph: BaseGraph;
  private readonly host: EditorHost;
  readonly api: Api;
  private readonly canvas: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private viewKey = "";
  private mode: EditorMode = "code";
  private saveTimer = 0;
  private loading = false;

  constructor(root: HTMLElement, api: Api, host: EditorHost) {
    register();
    this.api = api;
    this.host = host;
    this.bar = make("div", { className: "editor-bar" });
    this.canvas = make("div", { className: "editor-canvas" });
    this.canvas.id = "editor-graph";
    root.replaceChildren(this.bar, make("div", { className: "editor-body" }, this.canvas));
    // Bends: a virtual handle in the middle of each segment adds a point, as in diagrams.net.
    EdgeHandlerConfig.virtualBendsEnabled = true;
    this.graph = new BaseGraph({ container: this.canvas, plugins: [SelectionCellsHandler, SelectionHandler, RubberBandHandler, PanningHandler] });
    this.configure();
    this.toolbar();
  }

  private configure(): void {
    const graph = this.graph;
    InternalEvent.disableContextMenu(this.canvas);
    // No collapse button on lanes and groups: its image is a file this page does not serve.
    graph.options.foldingEnabled = false;
    graph.setPanning(true);
    graph.setGridEnabled(true);
    graph.setGridSize(GRID);
    graph.setCellsEditable(false);
    graph.setCellsDisconnectable(false);
    graph.setConnectable(false);
    graph.setDropEnabled(false);
    graph.setSwimlaneNesting(false);
    graph.setAllowDanglingEdges(false);
    graph.setHtmlLabels(false);
    graph.setExtendParents(true);
    graph.setExtendParentsOnMove(true);
    graph.getStylesheet().getDefaultVertexStyle().fontFamily = "system-ui, sans-serif";
    graph.getStylesheet().getDefaultEdgeStyle().fontFamily = "system-ui, sans-serif";
    const selection = graph.getPlugin<SelectionHandler>("SelectionHandler");
    if (selection) selection.guidesEnabled = true;
    // Shift-click adds to the selection, as in diagrams.net; so do Ctrl and Cmd.
    graph.isToggleEvent = (event: MouseEvent): boolean => event.shiftKey || event.ctrlKey || event.metaKey;
    // The label maxGraph draws comes from the Shape or Link value.
    graph.convertValueToString = (cell: Cell): string => String(cell.getValue() ?? "");
    // A lane holds shapes; a lane never goes into another lane or a group.
    graph.isValidDropTarget = (cell: Cell, cells?: Cell[]): boolean => {
      const kind = shapeOf(cell)?.kind;
      if (kind !== "lane" && kind !== "group") return false;
      return !(cells ?? []).some((c) => shapeOf(c)?.kind === "lane");
    };
    // The wheel zooms around the cursor.
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = this.canvas.getBoundingClientRect();
        this.zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - box.left, event.clientY - box.top);
      },
      { passive: false },
    );
    graph.getDataModel().addListener(InternalEvent.CHANGE, () => this.changed());
    // The dotted grid of the background follows zoom and pan.
    const view = graph.getView();
    const grid = (): void => {
      const step = view.scale * GRID;
      this.canvas.style.backgroundSize = `${step}px ${step}px`;
      this.canvas.style.backgroundPosition = `${view.translate.x * view.scale}px ${view.translate.y * view.scale}px`;
    };
    for (const name of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) view.addListener(name, grid);
  }

  private toolbar(): void {
    const align = (value: "left" | "center" | "right" | "top" | "middle" | "bottom", text: string, title: string): HTMLButtonElement => {
      const b = button(text, () => this.align(value), { title });
      b.dataset["align"] = value;
      return b;
    };
    const snap = make("label", { className: "snap", title: "Прив'язка до сітки" });
    const box = make("input");
    box.type = "checkbox";
    box.id = "editor-snap";
    box.checked = true;
    box.addEventListener("change", () => this.graph.setGridEnabled(box.checked));
    snap.append(box, " сітка");
    const group = button("групувати", () => this.group(), { title: "Згрупувати вибране (Ctrl+G)" });
    group.id = "editor-group";
    const ungroup = button("розгрупувати", () => this.ungroup(), { title: "Розгрупувати (Ctrl+Shift+U)" });
    ungroup.id = "editor-ungroup";
    const fit = button("вмістити", () => this.fit(), { title: "Вмістити (Ctrl+Shift+H)" });
    fit.id = "editor-fit";
    this.bar.append(
      make("span", { className: "editor-label", text: "вирівняти:" }),
      align("left", "⇤", "За лівим краєм"),
      align("center", "↔", "По центру"),
      align("right", "⇥", "За правим краєм"),
      align("top", "⤒", "За верхом"),
      align("middle", "↕", "Посередині"),
      align("bottom", "⤓", "За низом"),
      group,
      ungroup,
      snap,
      fit,
    );
  }

  /** The view open in the editor (`flow:checkout`, or "" for an empty canvas). */
  view(): string {
    return this.viewKey;
  }

  /** Opens a diagram «з коду»: its shapes at the positions the layout store keeps, or the server's. */
  async openDiagram(key: string, diagram: Diagram): Promise<void> {
    // The view being left keeps its layout.
    await this.flush();
    this.viewKey = key;
    this.mode = "code";
    const layout = await layoutStore().load(key);
    this.loading = true;
    try {
      this.build(diagram, layout);
    } finally {
      this.loading = false;
    }
    this.fit();
    this.host.status(diagram.reason ?? `editor · ${key} · з коду: ${diagram.nodes.length} shapes, ${diagram.edges.length} edges · only the layout changes`);
  }

  /** An empty canvas: nothing from the code yet. */
  async openEmpty(): Promise<void> {
    await this.openDiagram("", { nodes: [], edges: [], groups: [] });
    this.host.status("editor · an empty canvas: pick a view on the left to open it «з коду»");
  }

  private build(diagram: Diagram, layout: Layout | null): void {
    const graph = this.graph;
    const parent = graph.getDefaultParent();
    const entries = new Map((this.host.views()?.entries ?? []).map((e) => [e.id, e.kind]));
    graph.batchUpdate(() => {
      graph.removeCells(graph.getChildCells(parent, true, true), true);
      const lanes = new Map<string, Cell>();
      for (const group of diagram.groups) {
        const shape = new Shape(`lane:${group.id}`, "lane", group.id, group.label);
        shape.origin = "code";
        const at = layout?.[shape.key];
        lanes.set(group.id, graph.insertVertex({ parent, value: shape, position: [at?.x ?? group.x, at?.y ?? group.y], size: [at?.w ?? group.w, at?.h ?? group.h], style: shapeStyle(shape) }));
      }
      const cells = new Map<string, Cell>();
      for (const node of diagram.nodes) {
        const shape = this.shapeFromNode(node, entries);
        const lane = node.group !== undefined ? lanes.get(node.group) : undefined;
        const origin = lane?.getGeometry() ?? { x: 0, y: 0 };
        const at = layout?.[shape.key];
        const x = (at?.x ?? node.x) - origin.x;
        const y = (at?.y ?? node.y) - origin.y;
        cells.set(node.id, graph.insertVertex({ parent: lane ?? parent, value: shape, position: [x, y], size: [at?.w ?? node.w, at?.h ?? node.h], style: shapeStyle(shape) }));
      }
      const seen = new Map<string, number>();
      for (const edge of diagram.edges) {
        const source = cells.get(edge.from);
        const target = cells.get(edge.to);
        if (!source || !target) continue;
        const base = `edge:${edge.from}->${edge.to}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const link = new Link(n === 0 ? base : `${base}#${n}`, LINK_KINDS.has(edge.kind) ? (edge.kind as LinkKind) : "sequence", edge.label ?? "");
        const cell = graph.insertEdge({ parent, value: link, source, target, style: linkStyle(link) });
        const points = layout?.[link.key]?.points;
        if (points && points.length > 0) {
          const geometry = cell.getGeometry()!.clone();
          const offset = this.origin(cell.getParent());
          geometry.points = points.map((p) => new Point(p.x - offset.x, p.y - offset.y));
          graph.getDataModel().setGeometry(cell, geometry);
        }
      }
    });
  }

  private shapeFromNode(node: DiagramNode, entries: Map<string, string>): Shape {
    const kind: ShapeKind = NODE_KINDS.has(node.kind) ? (node.kind as ShapeKind) : "task";
    const id = node.ref?.id ?? (kind === "layer" ? node.label : "");
    const shape = new Shape(node.id, kind, id, node.label);
    shape.origin = "code";
    shape.verdict = node.verdict ?? null;
    shape.reason = node.reason ?? "";
    if (kind === "start") shape.trigger = entries.get(id) ?? "fn";
    if (kind === "parallel") shape.role = node.id.endsWith(":join") ? "join" : "split";
    if (id.startsWith("planned:") || node.verdict === "planned") shape.signature = "";
    return shape;
  }

  /** The top-left of a cell in model coordinates: the sum of its ancestors' geometries. */
  private origin(cell: Cell | null): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (let at = cell; at && at.isVertex(); at = at.getParent()) {
      const geometry = at.getGeometry();
      if (geometry) {
        x += geometry.x;
        y += geometry.y;
      }
    }
    return { x, y };
  }

  /** Every cell under the default parent, depth first. */
  private allCells(): Cell[] {
    const out: Cell[] = [];
    const walk = (parent: Cell): void => {
      for (const child of parent.getChildren()) {
        out.push(child);
        walk(child);
      }
    };
    walk(this.graph.getDefaultParent());
    return out;
  }

  /** The canvas as keylang sees it: shapes with their IDs and kinds, connections with their meaning, lanes as layers. */
  currentModel(): EditorModel {
    const nodes: ModelNode[] = [];
    const edges: ModelEdge[] = [];
    const lanes: ModelLane[] = [];
    for (const cell of this.allCells()) {
      const shape = shapeOf(cell);
      if (shape && cell.isVertex()) {
        const geometry = cell.getGeometry()!;
        const at = this.origin(cell);
        const box = { x: at.x, y: at.y, w: geometry.width, h: geometry.height };
        if (shape.kind === "lane") {
          lanes.push({ key: shape.key, id: shape.id, label: shape.label, ...box });
          continue;
        }
        if (shape.kind === "group") continue;
        let layer: string | null = null;
        let group: string | undefined;
        for (let up = cell.getParent(); up && up.isVertex(); up = up.getParent()) {
          const above = shapeOf(up);
          if (above?.kind === "group" && group === undefined) group = above.key;
          if (above?.kind === "lane") {
            layer = above.id.replace(/^planned:/, "");
            break;
          }
        }
        const node: ModelNode = { key: shape.key, id: shape.id, kind: shape.kind, label: shape.label, layer, planned: shape.id.startsWith("planned:"), tests: [...shape.tests], ...box };
        if (shape.trigger) node.trigger = shape.trigger;
        if (shape.role) node.role = shape.role;
        if (shape.signature) node.signature = shape.signature;
        if (shape.description) node.description = shape.description;
        if (group !== undefined) node.group = group;
        nodes.push(node);
      }
      const link = linkOf(cell);
      if (link && cell.isEdge()) {
        const source = shapeOf(cell.getTerminal(true));
        const target = shapeOf(cell.getTerminal(false));
        if (!source || !target) continue;
        const offset = this.origin(cell.getParent());
        const edge: ModelEdge = { key: link.key, kind: link.kind, from: source.key, to: target.key, fromId: source.id, toId: target.id, points: (cell.getGeometry()?.points ?? []).map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })) };
        if (link.label) edge.label = link.label;
        edges.push(edge);
      }
    }
    return { view: this.viewKey, mode: this.mode, nodes, edges, lanes };
  }

  /** Positions of every shape and the bends of every edge, by key: what the layout store keeps. */
  layout(): Layout {
    const model = this.currentModel();
    const layout: Layout = {};
    for (const box of [...model.lanes, ...model.nodes]) layout[box.key] = { x: box.x, y: box.y, w: box.w, h: box.h };
    for (const edge of model.edges) if (edge.points.length > 0) layout[edge.key] = { x: 0, y: 0, points: edge.points };
    return layout;
  }

  private changed(): void {
    if (this.loading) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), 250);
  }

  /** Writes the layout of the open view now if a change waits for it. */
  async flush(): Promise<void> {
    if (this.saveTimer === 0) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (this.viewKey !== "") await layoutStore().save(this.viewKey, this.layout());
  }

  /** The selected shapes (no edges). */
  private selectedVertices(): Cell[] {
    return this.graph.getSelectionCells().filter((cell) => cell.isVertex());
  }

  align(value: "left" | "center" | "right" | "top" | "middle" | "bottom"): void {
    // In model coordinates, not maxGraph's `alignCells`: shapes in different lanes have different parents.
    const cells = this.selectedVertices();
    if (cells.length < 2) return;
    const boxes = cells.map((cell) => {
      const at = this.origin(cell);
      const geometry = cell.getGeometry()!;
      return { cell, x: at.x, y: at.y, w: geometry.width, h: geometry.height };
    });
    const horizontal = value === "left" || value === "center" || value === "right";
    const edge = (box: { x: number; y: number; w: number; h: number }): number => {
      switch (value) {
        case "left":
          return box.x;
        case "center":
          return box.x + box.w / 2;
        case "right":
          return box.x + box.w;
        case "top":
          return box.y;
        case "middle":
          return box.y + box.h / 2;
        default:
          return box.y + box.h;
      }
    };
    const values = boxes.map(edge);
    const target = value === "right" || value === "bottom" ? Math.max(...values) : value === "center" || value === "middle" ? values.reduce((a, b) => a + b, 0) / values.length : Math.min(...values);
    this.graph.batchUpdate(() => {
      for (const box of boxes) {
        const delta = target - edge(box);
        if (delta === 0) continue;
        const geometry = box.cell.getGeometry()!.clone();
        if (horizontal) geometry.x += delta;
        else geometry.y += delta;
        this.graph.getDataModel().setGeometry(box.cell, geometry);
      }
    });
  }

  /** Puts the selected shapes in a group: a dashed frame that moves them together. */
  group(): void {
    const cells = this.selectedVertices().filter((cell) => shapeOf(cell)?.kind !== "lane");
    if (cells.length < 2) return this.host.status("групувати: виберіть дві чи більше фігур (Shift-клік, рамка)");
    // A group lives inside one lane: shapes of two lanes would leave their layers.
    if (new Set(cells.map((cell) => cell.getParent())).size > 1) return this.host.status("групувати можна лише фігури однієї доріжки");
    const shape = new Shape(`group:${Date.now().toString(36)}`, "group", "", "група");
    const frame = new Cell(shape, new Geometry(), shapeStyle(shape));
    frame.setVertex(true);
    const done = this.graph.groupCells(frame, GRID, cells);
    this.graph.setSelectionCell(done);
  }

  ungroup(): void {
    const groups = this.graph.getSelectionCells().filter((cell) => shapeOf(cell)?.kind === "group");
    if (groups.length > 0) this.graph.setSelectionCells(this.graph.ungroupCells(groups));
  }

  /** The whole canvas in the window, never above its natural size. */
  fit(margin = 24): void {
    const view = this.graph.getView();
    const bounds = this.graph.getGraphBounds();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (bounds.width === 0 || bounds.height === 0 || width === 0 || height === 0) return view.scaleAndTranslate(1, margin, margin);
    const scale = view.scale;
    const model = { x: bounds.x / scale - view.translate.x, y: bounds.y / scale - view.translate.y, w: bounds.width / scale, h: bounds.height / scale };
    const next = Math.max(0.05, Math.min(1, (width - 2 * margin) / model.w, (height - 2 * margin) / model.h));
    view.scaleAndTranslate(next, width / 2 / next - (model.x + model.w / 2), height / 2 / next - (model.y + model.h / 2));
  }

  zoomAt(factor: number, x = this.canvas.clientWidth / 2, y = this.canvas.clientHeight / 2): void {
    const view = this.graph.getView();
    const scale = view.scale;
    const next = Math.max(0.05, Math.min(4, scale * factor));
    const px = x / scale - view.translate.x;
    const py = y / scale - view.translate.y;
    view.scaleAndTranslate(next, x / next - px, y / next - py);
  }
}
