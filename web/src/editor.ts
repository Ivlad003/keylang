// The diagram editor of the diagram page (business-flows/23), in the manner
// of diagrams.net: a maxGraph canvas whose shapes are keylang entities. A view
// of `/api/diagram` opens «з коду»: every shape of the model (a lane per
// layer, start events by trigger kind, tasks, `when` and `parallel` gateways,
// events, timers, external pools, holes) at the positions the server computed
// or the layout store keeps (layout-store.ts), and only the layout changes:
// move, resize, bend an edge, group, align, snap to the grid.
//
// «Чернетка» makes everything editable: the palette on the left (drag a
// shape onto the canvas, or click it) draws layers as lanes, modules, fns,
// types, steps, `when` and `parallel` gateways, events, timers, triggers and
// webhooks, external systems and notes; a new shape gets its kind and a
// temporary ID `planned:<layer>.<name>` from the lane it lands in. Notes are
// layout, so «з коду» draws them too.
//
// On the right, the properties panel (properties.ts): ID, kind, signature of
// a planned shape, tests, description. Connections carry a meaning, picked in
// the bar before drawing one (from the arrow over a shape) or in the panel:
// sequence, call, dependency allowed or denied (line styles differ), event →
// subscriber, `continues`. A connection that means nothing between those two
// shapes — a layer denying itself, a sequence into a note — is refused with a
// tooltip that says why.
//
// The editor writes nothing to the specs: its state lives in memory and in a
// draft of the tab (`sessionStorage`, so a reload comes back to it), the
// positions go to the layout store, and `currentModel()` is what ticket 24
// diffs against the model to write proposals.

import {
  BaseGraph,
  Cell,
  ConnectionHandler,
  EdgeHandlerConfig,
  Geometry,
  ImageBox,
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
import { Properties } from "./properties.ts";

/** The kinds of shape the editor knows: those of the diagram model and those a person draws. */
export type ShapeKind = "lane" | "layer" | "module" | "fn" | "type" | "start" | "task" | "gateway" | "parallel" | "event" | "timer" | "external" | "hole" | "note" | "group";

/** The kinds of connection: the edges of the diagram model, and an event's subscriber. */
export type LinkKind = "sequence" | "call" | "dependency" | "allow" | "deny" | "emits" | "subscribes" | "continues";

/** «з коду»: the model's shapes, only the layout changes; «чернетка»: everything changes. */
export type EditorMode = "code" | "draft";

/** The kinds as the panel names them. */
export const SHAPE_NAMES: Record<string, string> = {
  lane: "шар (доріжка)",
  layer: "шар",
  module: "модуль",
  fn: "fn",
  type: "тип",
  start: "тригер (стартова подія)",
  task: "крок (задача)",
  gateway: "шлюз when",
  parallel: "parallel",
  event: "подія",
  timer: "таймер",
  external: "зовнішня система",
  hole: "дірка: маршрут не доведено",
  note: "примітка",
  group: "група",
};

/** The meanings of a connection, as the bar and the panel name them. */
export const LINK_NAMES: Record<LinkKind, string> = {
  sequence: "послідовність (крок → крок)",
  call: "виклик",
  dependency: "залежність",
  allow: "allow: залежність дозволено",
  deny: "deny: залежність заборонено",
  emits: "emits: крок → подія",
  subscribes: "подія → підписник",
  continues: "continues: до тригера іншого флоу",
};

const FLOW: ReadonlySet<ShapeKind> = new Set(["start", "task", "gateway", "parallel", "event", "timer", "external", "hole", "fn"]);
const STRUCTURE: ReadonlySet<ShapeKind> = new Set(["lane", "layer", "module", "fn", "type"]);
const ACTORS: ReadonlySet<ShapeKind> = new Set(["start", "task", "fn"]);

/**
 * Why a connection of `kind` from `source` to `target` means nothing, or null when it is fine.
 * The rules follow the forms of keylang: rules between layers and modules, a flow's sequence
 * between its shapes, `emits` into an event and its subscribers out of it, `continues` into
 * another flow's trigger.
 */
export function linkError(kind: LinkKind, source: Shape | null, target: Shape | null): string | null {
  if (!source || !target) return "";
  if (source.kind === "note" || target.kind === "note") return "примітка — проза: з'єднань не має";
  if (source.kind === "group" || target.kind === "group") return "група — лише рамка розкладки: з'єднуйте фігури в ній";
  if (source === target) {
    if (kind === "deny" || kind === "allow") return `${kind}: шар не може ${kind === "deny" ? "заборонити" : "дозволити"} залежність від самого себе`;
    return "фігура не з'єднується сама з собою";
  }
  switch (kind) {
    case "allow":
    case "deny":
    case "dependency":
      if (!STRUCTURE.has(source.kind) || !STRUCTURE.has(target.kind)) return `${kind}: правило залежності — між шарами, модулями, fn чи типами, не між кроками флоу`;
      return null;
    case "sequence":
      if (!FLOW.has(source.kind) || !FLOW.has(target.kind)) return "послідовність — між фігурами флоу (тригер, крок, шлюз, подія, таймер)";
      if (target.kind === "start") return "послідовність не входить у тригер: інший флоу — continues";
      return null;
    case "call":
      if (!ACTORS.has(source.kind) && source.kind !== "module") return "виклик — від кроку, fn чи модуля";
      if (!ACTORS.has(target.kind) && target.kind !== "external" && target.kind !== "module") return "виклик — до кроку, fn, модуля чи зовнішньої системи";
      return null;
    case "emits":
      if (!ACTORS.has(source.kind)) return "emits — від кроку, fn чи тригера";
      if (target.kind !== "event") return "emits веде в подію";
      return null;
    case "subscribes":
      if (source.kind !== "event") return "підписка починається в події";
      if (!ACTORS.has(target.kind)) return "підписник події — крок, fn чи тригер";
      return null;
    case "continues":
      if (target.kind !== "start") return "continues веде до тригера іншого флоу";
      if (!FLOW.has(source.kind)) return "continues — від фігури флоу";
      return null;
  }
}

/** The arrow over a shape that starts a connection: an SVG image (the page allows `img-src data:`). */
const CONNECT_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#1565c0" fill-opacity="0.85"/><path d="M5 9h7M9 5.5 12.5 9 9 12.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`;

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
/** The draft of a view in `sessionStorage`: `keylang-editor:<view>`. */
const DRAFT_PREFIX = "keylang-editor:";

/** One item of the palette: what it draws, its kind, its name stem and size. */
export interface PaletteItem {
  item: string;
  text: string;
  title: string;
  kind: ShapeKind;
  stem: string;
  size: [number, number];
  trigger?: string;
  /** The shape carries a keylang ID (`planned:<layer>.<name>` until it is built). */
  named: boolean;
}

export const PALETTE: readonly PaletteItem[] = [
  { item: "layer", text: "▭ шар", title: "Шар: доріжка-контейнер", kind: "lane", stem: "layer", size: [720, 150], named: true },
  { item: "module", text: "▣ модуль", title: "Модуль", kind: "module", stem: "module", size: [180, 70], named: true },
  { item: "fn", text: "ƒ fn", title: "Функція", kind: "fn", stem: "fn", size: [160, 60], named: true },
  { item: "type", text: "T тип", title: "Тип", kind: "type", stem: "Type", size: [150, 50], named: true },
  { item: "step", text: "▢ крок", title: "Крок флоу (задача)", kind: "task", stem: "step", size: [160, 60], named: true },
  { item: "trigger", text: "○ тригер", title: "Тригер: стартова подія флоу", kind: "start", stem: "trigger", size: [36, 36], trigger: "fn", named: true },
  { item: "when", text: "◇× when", title: "Шлюз when: ексклюзивне розгалуження", kind: "gateway", stem: "condition", size: [50, 50], named: false },
  { item: "parallel", text: "◇+ parallel", title: "Паралельний шлюз", kind: "parallel", stem: "parallel", size: [50, 50], named: false },
  { item: "event", text: "◎ подія", title: "Подія (emits)", kind: "event", stem: "event", size: [36, 36], named: true },
  { item: "timer", text: "⏱ таймер", title: "Таймер (after / every)", kind: "timer", stem: "after 1h", size: [36, 36], named: false },
  { item: "webhook", text: "✉ вебхук", title: "Вебхук: стартова подія-повідомлення", kind: "start", stem: "webhook", size: [36, 36], trigger: "webhook", named: true },
  { item: "external", text: "┆▢┆ зовнішня система", title: "Зовнішня система чи пакет: окремий пул", kind: "external", stem: "system", size: [160, 60], named: true },
  { item: "note", text: "✎ примітка", title: "Примітка (проза)", kind: "note", stem: "примітка", size: [170, 80], named: false },
];

/** One cell of a draft: a shape or an edge with its parent, geometry relative to it, and its keylang side. */
type DraftCell =
  | { type: "shape"; parent: string | null; shape: Record<string, unknown>; x: number; y: number; w: number; h: number }
  | { type: "link"; parent: string | null; link: Record<string, unknown>; source: string; target: string; points: { x: number; y: number }[] };

interface Draft {
  view: string;
  mode: EditorMode;
  cells: DraftCell[];
}

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

/** The layer a lane stands for: its ID without `planned:`. */
function layerOf(lane: Shape): string {
  return lane.id.replace(/^planned:/, "");
}

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
  private editMode: EditorMode = "code";
  private saveTimer = 0;
  private loading = false;
  /** The diagram the open view came from: «скинути чернетку» draws it again. */
  private source: Diagram = { nodes: [], edges: [], groups: [] };
  private counter = 0;
  private readonly palette: HTMLDivElement;
  private readonly properties: Properties;
  private readonly tipBox: HTMLDivElement;
  private tipTimer = 0;
  private pointer = { x: 0, y: 0 };
  /** The meaning of the next connection drawn. */
  private linkKind: LinkKind = "sequence";

  constructor(root: HTMLElement, api: Api, host: EditorHost) {
    register();
    this.api = api;
    this.host = host;
    this.bar = make("div", { className: "editor-bar" });
    this.canvas = make("div", { className: "editor-canvas" });
    this.canvas.id = "editor-graph";
    this.palette = make("div", { className: "editor-palette" });
    this.palette.id = "editor-palette";
    this.palette.setAttribute("aria-label", "Палітра");
    const panel = make("aside", { className: "editor-panel" });
    panel.id = "editor-panel";
    panel.setAttribute("aria-label", "Властивості");
    this.tipBox = make("div", { className: "editor-tip" });
    this.tipBox.id = "editor-tip";
    this.tipBox.setAttribute("role", "alert");
    this.tipBox.hidden = true;
    root.replaceChildren(this.bar, make("div", { className: "editor-body" }, this.palette, this.canvas, panel, this.tipBox));
    this.properties = new Properties(panel, api, { mode: () => this.editMode, updateShape: (cell, patch) => this.updateShape(cell, patch), updateLink: (cell, patch) => this.updateLink(cell, patch) }, () => this.host.views());
    // Bends: a virtual handle in the middle of each segment adds a point, as in diagrams.net.
    EdgeHandlerConfig.virtualBendsEnabled = true;
    this.graph = new BaseGraph({ container: this.canvas, plugins: [SelectionCellsHandler, ConnectionHandler, SelectionHandler, RubberBandHandler, PanningHandler] });
    this.configure();
    this.toolbar();
    this.fillPalette();
    this.applyMode();
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
    // «з коду» deletes only what is layout: notes and group frames.
    graph.isCellDeletable = (cell: Cell): boolean => {
      if (this.editMode === "draft" || this.loading) return true;
      const kind = shapeOf(cell)?.kind;
      return kind === "note" || kind === "group";
    };
    // Connections: from the arrow over a shape, with the meaning picked in the bar; refused with a tooltip when it means nothing.
    graph.setAllowLoops(true);
    graph.setMultigraph(true);
    graph.getEdgeValidationError = (edge: Cell | null = null, source: Cell | null = null, target: Cell | null = null): string | null => {
      if (edge && linkOf(edge) && this.editMode === "code") return null;
      if (this.editMode === "code") return "«з коду» не змінює з'єднань: перейдіть у «чернетку»";
      const kind = linkOf(edge)?.kind ?? this.linkKind;
      const refused = linkError(kind, shapeOf(source), shapeOf(target));
      if (refused !== null) return refused;
      const twin = this.graph.getDataModel().getEdgesBetween(source!, target!, true).some((other) => other !== edge && linkOf(other)?.kind === kind);
      return twin ? `таке з'єднання (${kind}) вже є` : null;
    };
    graph.validationAlert = (message: string): void => this.tip(message);
    const connect = graph.getPlugin<ConnectionHandler>("ConnectionHandler");
    if (connect) {
      connect.connectImage = new ImageBox(CONNECT_ICON, 18, 18);
      connect.factoryMethod = (): Cell => {
        const link = new Link(this.newKey(), this.linkKind);
        const edge = new Cell(link, new Geometry(), linkStyle(link));
        edge.setEdge(true);
        edge.getGeometry()!.relative = true;
        return edge;
      };
      // The arrow sits at a shape's right edge (outside a small one), so a drag from the middle still moves the shape; a lane's stays on its header.
      const position = connect.getIconPosition.bind(connect);
      connect.getIconPosition = (icon, state) => {
        if (shapeOf(state.cell)?.kind === "lane") return position(icon, state);
        const scale = this.graph.getView().scale;
        const right = state.width > 80 * scale ? state.x + state.width - 12 * scale : state.x + state.width + 10;
        return new Point(right - 9, state.getCenterY() - 9);
      };
    }
    this.canvas.addEventListener("pointermove", (event) => (this.pointer = { x: event.clientX, y: event.clientY }), true);
    this.canvas.addEventListener("pointerdown", (event) => (this.pointer = { x: event.clientX, y: event.clientY }), true);
    // The panel follows the selection, and the model under it (an undo, a move into another lane).
    graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => this.properties.show(graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null));
    graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
      const shown = this.properties.current();
      if (document.activeElement && document.getElementById("editor-panel")?.contains(document.activeElement)) return;
      if (shown) this.properties.show(shown.getParent() || shown.isEdge() ? (graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null) : null);
    });
    // A planned shape moved into another lane takes that layer into its ID.
    graph.addListener(InternalEvent.MOVE_CELLS, () => this.relayer());
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
    const kind = make("select", { title: "Значення нового з'єднання" });
    kind.id = "editor-link-kind";
    for (const [value, text] of Object.entries(LINK_NAMES)) {
      const option = make("option", { text });
      option.value = value;
      kind.append(option);
    }
    kind.addEventListener("change", () => (this.linkKind = kind.value as LinkKind));
    const code = button("з коду", () => this.setMode("code"), { title: "Фігури з моделі: змінюється лише розкладка (і примітки)" });
    code.id = "editor-mode-code";
    const draft = button("чернетка", () => this.setMode("draft"), { title: "Усе редаговане: нові фігури отримують planned-ID" });
    draft.id = "editor-mode-draft";
    const remove = button("видалити", () => this.deleteSelection(), { title: "Видалити вибране (Delete)" });
    remove.id = "editor-delete";
    const reset = button("скинути чернетку", () => void this.resetDraft(), { title: "Забути чернетку вкладки й відкрити вид з коду заново" });
    reset.id = "editor-reset";
    this.bar.append(
      code,
      draft,
      make("span", { className: "sep" }),
      remove,
      make("span", { className: "editor-label", text: "з'єднання:" }),
      kind,
      make("span", { className: "sep" }),
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
      make("span", { className: "sep" }),
      reset,
    );
  }

  private fillPalette(): void {
    this.palette.append(make("div", { className: "palette-head", text: "Палітра" }));
    for (const entry of PALETTE) {
      const item = make("button", { className: "palette-item", text: entry.text, title: `${entry.title} — перетягніть на полотно або клацніть` });
      item.type = "button";
      item.draggable = true;
      item.dataset["item"] = entry.item;
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", `keylang-palette:${entry.item}`);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      });
      // A click drops it in the middle of the canvas.
      item.addEventListener("click", () => {
        const box = this.canvas.getBoundingClientRect();
        this.addFromPalette(entry, this.modelPoint(box.left + box.width / 2, box.top + box.height / 2));
      });
      this.palette.append(item);
    }
    this.canvas.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("text/plain")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    this.canvas.addEventListener("drop", (event) => {
      const data = event.dataTransfer?.getData("text/plain") ?? "";
      const entry = PALETTE.find((p) => `keylang-palette:${p.item}` === data);
      if (!entry) return;
      event.preventDefault();
      this.addFromPalette(entry, this.modelPoint(event.clientX, event.clientY));
    });
  }

  /** A point of the page in model coordinates. */
  private modelPoint(clientX: number, clientY: number): { x: number; y: number } {
    const view = this.graph.getView();
    const box = this.canvas.getBoundingClientRect();
    return { x: (clientX - box.left) / view.scale - view.translate.x, y: (clientY - box.top) / view.scale - view.translate.y };
  }

  /** The lanes, with their boxes in model coordinates. */
  private lanes(): { cell: Cell; shape: Shape; x: number; y: number; w: number; h: number }[] {
    const out: { cell: Cell; shape: Shape; x: number; y: number; w: number; h: number }[] = [];
    for (const cell of this.graph.getDefaultParent().getChildren()) {
      const shape = shapeOf(cell);
      const geometry = cell.getGeometry();
      if (shape?.kind === "lane" && geometry) out.push({ cell, shape, x: geometry.x, y: geometry.y, w: geometry.width, h: geometry.height });
    }
    return out;
  }

  /** A key no shape of the canvas has. */
  private newKey(): string {
    const used = new Set(this.allCells().map((cell) => shapeOf(cell)?.key ?? linkOf(cell)?.key));
    let key = "";
    do key = `draft:${++this.counter}`;
    while (used.has(key));
    return key;
  }

  /** `stem`, `stem2`, … : the first name no shape of that layer uses. */
  private newName(layer: string | null, stem: string): string {
    const prefix = layer === null ? "planned:" : `planned:${layer}.`;
    const ids = new Set(this.allCells().map((cell) => shapeOf(cell)?.id));
    for (let n = 1; ; n++) {
      const name = n === 1 ? stem : `${stem}${n}`;
      if (!ids.has(`${prefix}${name}`)) return name;
    }
  }

  /** Draws a palette shape at a model point: in the lane under it, with a planned ID of that lane's layer. */
  addFromPalette(entry: PaletteItem, at: { x: number; y: number }): Cell | null {
    if (this.editMode === "code" && entry.kind !== "note") {
      this.host.status("«з коду» змінює лише розкладку й примітки: перейдіть у «чернетку», щоб додати фігуру");
      return null;
    }
    const graph = this.graph;
    const [w, h] = entry.size;
    let cell: Cell;
    if (entry.kind === "lane") {
      const name = this.newName(null, entry.stem);
      const shape = new Shape(this.newKey(), "lane", `planned:${name}`, name);
      cell = graph.insertVertex({ parent: graph.getDefaultParent(), value: shape, position: [Math.round(at.x / GRID) * GRID, Math.round(at.y / GRID) * GRID], size: [w, h], style: shapeStyle(shape) });
    } else {
      const lane = this.lanes().find((l) => at.x >= l.x && at.x <= l.x + l.w && at.y >= l.y && at.y <= l.y + l.h);
      const layer = lane ? layerOf(lane.shape) : null;
      const name = entry.named ? this.newName(layer, entry.stem) : entry.stem;
      const id = entry.named ? `planned:${layer === null ? "" : `${layer}.`}${name}` : "";
      const shape = new Shape(this.newKey(), entry.kind, id, name);
      if (entry.trigger) shape.trigger = entry.trigger;
      if (entry.kind === "parallel") shape.role = "split";
      if (entry.kind === "note") shape.description = "примітка";
      const x = Math.round((at.x - w / 2 - (lane?.x ?? 0)) / GRID) * GRID;
      const y = Math.round((at.y - h / 2 - (lane?.y ?? 0)) / GRID) * GRID;
      cell = graph.insertVertex({ parent: lane?.cell ?? graph.getDefaultParent(), value: shape, position: [x, y], size: [w, h], style: shapeStyle(shape) });
    }
    graph.setSelectionCell(cell);
    this.host.status(`added ${entry.item}${shapeOf(cell)?.id ? ` ${shapeOf(cell)?.id}` : ""}`);
    return cell;
  }

  /** «з коду» or «чернетка»: what the canvas lets change. */
  setMode(mode: EditorMode): void {
    this.editMode = mode;
    this.applyMode();
    this.changed();
    this.host.status(mode === "draft" ? `editor · ${this.viewKey || "empty canvas"} · чернетка: everything changes; new shapes get planned IDs` : `editor · ${this.viewKey || "empty canvas"} · з коду: only the layout and notes change`);
  }

  private applyMode(): void {
    const draft = this.editMode === "draft";
    this.graph.setDropEnabled(draft);
    this.graph.setConnectable(draft);
    this.graph.setCellsDisconnectable(draft);
    const kind = document.getElementById("editor-link-kind") as HTMLSelectElement | null;
    if (kind) kind.disabled = !draft;
    this.properties.show(this.graph.getSelectionCount() === 1 ? this.graph.getSelectionCell() : null);
    for (const id of ["editor-mode-code", "editor-mode-draft"]) document.getElementById(id)?.setAttribute("aria-pressed", String(id.endsWith(this.editMode)));
    for (const item of this.palette.querySelectorAll<HTMLButtonElement>(".palette-item")) item.disabled = !draft && item.dataset["item"] !== "note";
    this.canvas.dataset["mode"] = this.editMode;
  }

  /** A message next to the pointer for a few seconds: why a connection or an edit was refused. */
  tip(text: string): void {
    const body = this.tipBox.parentElement!.getBoundingClientRect();
    this.tipBox.textContent = text;
    this.tipBox.hidden = false;
    this.tipBox.style.left = `${Math.max(4, Math.min(body.width - 260, this.pointer.x - body.left + 12))}px`;
    this.tipBox.style.top = `${Math.max(4, this.pointer.y - body.top + 12)}px`;
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => (this.tipBox.hidden = true), 4000);
    this.host.status(text);
  }

  /** The panel's change of a shape: one undoable value (and style, size) change; a refusal as text. */
  updateShape(cell: Cell, patch: Partial<Pick<Shape, "id" | "label" | "kind" | "trigger" | "role" | "signature" | "tests" | "description">>): string | null {
    const shape = shapeOf(cell);
    if (!shape) return "не фігура";
    if (this.editMode === "code" && shape.kind !== "note") return "«з коду»: зміст змінюється лише в «чернетці»";
    const next = shape.clone();
    Object.assign(next, patch);
    if (patch.id !== undefined) {
      if (patch.id === "" || /\s/.test(patch.id)) return "ID — без пробілів і не порожній: planned:<шар>.<назва> чи ID з коду";
      next.label = next.kind === "lane" || !patch.id.startsWith("planned:") ? patch.id.replace(/^planned:/, "") : patch.id.slice(patch.id.lastIndexOf(".") + 1).replace(/^planned:/, "");
      if (!patch.id.startsWith("planned:")) next.signature = "";
    }
    const model = this.graph.getDataModel();
    this.graph.batchUpdate(() => {
      if (patch.kind !== undefined && patch.kind !== shape.kind) {
        const named = PALETTE.find((p) => p.kind === patch.kind && p.named);
        if (!named) next.id = "";
        else if (next.id === "") {
          const lane = this.laneOf(cell);
          next.id = `planned:${lane ? `${layerOf(lane)}.` : ""}${this.newName(lane ? layerOf(lane) : null, next.label.replace(/\W+/g, "") || named.stem)}`;
        }
        if (patch.kind === "start" && !next.trigger) next.trigger = "fn";
        if (patch.kind === "parallel" && !next.role) next.role = "split";
        // A small shape and a box do not share a size.
        if (SMALL.has(patch.kind) !== SMALL.has(shape.kind)) {
          const size = PALETTE.find((p) => p.kind === patch.kind)?.size ?? [160, 60];
          const geometry = cell.getGeometry()!.clone();
          geometry.width = size[0];
          geometry.height = size[1];
          model.setGeometry(cell, geometry);
        }
      }
      model.setValue(cell, next);
      model.setStyle(cell, shapeStyle(next));
    });
    return null;
  }

  /** The panel's change of a connection: its meaning (checked as when it is drawn) or its label. */
  updateLink(cell: Cell, patch: Partial<Pick<Link, "kind" | "label">>): string | null {
    const link = linkOf(cell);
    if (!link) return "не з'єднання";
    if (this.editMode === "code") return "«з коду»: зміст змінюється лише в «чернетці»";
    if (patch.kind !== undefined && patch.kind !== link.kind) {
      const refused = linkError(patch.kind, shapeOf(cell.getTerminal(true)), shapeOf(cell.getTerminal(false)));
      if (refused) {
        this.tip(refused);
        return refused;
      }
    }
    const next = link.clone();
    Object.assign(next, patch);
    const model = this.graph.getDataModel();
    this.graph.batchUpdate(() => {
      model.setValue(cell, next);
      model.setStyle(cell, linkStyle(next));
    });
    return null;
  }

  /** Deletes the selection, as far as the mode lets. */
  deleteSelection(): void {
    const cells = this.graph.getDeletableCells(this.graph.getSelectionCells());
    if (cells.length === 0) {
      if (this.graph.getSelectionCount() > 0) this.host.status("«з коду» не видаляє фігур моделі: лише примітки й групи");
      return;
    }
    this.graph.removeCells(cells, true);
  }

  /** After a move: a planned shape in another lane takes that lane's layer into its ID. */
  private relayer(): void {
    if (this.editMode !== "draft") return;
    const model = this.graph.getDataModel();
    this.graph.batchUpdate(() => {
      for (const cell of this.allCells()) {
        const shape = shapeOf(cell);
        if (!shape || !cell.isVertex() || !shape.id.startsWith("planned:") || shape.kind === "lane") continue;
        const lane = this.laneOf(cell);
        const layer = lane ? layerOf(lane) : null;
        const name = shape.id.slice(shape.id.lastIndexOf(".") + 1).replace(/^planned:/, "");
        const id = `planned:${layer === null ? "" : `${layer}.`}${name}`;
        if (id === shape.id) continue;
        const next = shape.clone();
        next.id = id;
        model.setValue(cell, next);
      }
    });
  }

  /** The lane a cell sits in, at any depth. */
  private laneOf(cell: Cell): Shape | null {
    for (let up = cell.getParent(); up && up.isVertex(); up = up.getParent()) {
      const shape = shapeOf(up);
      if (shape?.kind === "lane") return shape;
    }
    return null;
  }

  /** The draft of this tab as JSON-ready cells, parents before children. */
  private draft(): Draft {
    const cells: DraftCell[] = [];
    const keyOf = (cell: Cell | null): string | null => shapeOf(cell)?.key ?? null;
    for (const cell of this.allCells()) {
      const shape = shapeOf(cell);
      const geometry = cell.getGeometry();
      if (shape && geometry) cells.push({ type: "shape", parent: keyOf(cell.getParent()), shape: { ...shape }, x: geometry.x, y: geometry.y, w: geometry.width, h: geometry.height });
    }
    for (const cell of this.allCells()) {
      const link = linkOf(cell);
      const source = keyOf(cell.getTerminal(true));
      const target = keyOf(cell.getTerminal(false));
      if (link && source && target) cells.push({ type: "link", parent: keyOf(cell.getParent()), link: { ...link }, source, target, points: (cell.getGeometry()?.points ?? []).map((p) => ({ x: p.x, y: p.y })) });
    }
    return { view: this.viewKey, mode: this.editMode, cells };
  }

  /** Draws a draft again: every cell where it was. */
  private restore(draft: Draft): void {
    const graph = this.graph;
    const root = graph.getDefaultParent();
    graph.batchUpdate(() => {
      graph.removeCells(graph.getChildCells(root, true, true), true);
      const byKey = new Map<string, Cell>();
      for (const item of draft.cells) {
        const parent = (item.parent !== null ? byKey.get(item.parent) : undefined) ?? root;
        if (item.type === "shape") {
          const shape = Object.assign(new Shape("", "task", "", ""), item.shape) as Shape;
          byKey.set(shape.key, graph.insertVertex({ parent, value: shape, position: [item.x, item.y], size: [item.w, item.h], style: shapeStyle(shape) }));
        } else {
          const source = byKey.get(item.source);
          const target = byKey.get(item.target);
          if (!source || !target) continue;
          const link = Object.assign(new Link("", "sequence"), item.link) as Link;
          const cell = graph.insertEdge({ parent, value: link, source, target, style: linkStyle(link) });
          if (item.points.length > 0) {
            const geometry = cell.getGeometry()!.clone();
            geometry.points = item.points.map((p) => new Point(p.x, p.y));
            graph.getDataModel().setGeometry(cell, geometry);
          }
        }
      }
    });
    this.editMode = draft.mode;
    this.applyMode();
  }

  private readDraft(view: string): Draft | null {
    try {
      const text = sessionStorage.getItem(`${DRAFT_PREFIX}${view}`);
      if (!text) return null;
      const draft = JSON.parse(text) as Draft;
      return draft.view === view && Array.isArray(draft.cells) ? draft : null;
    } catch {
      return null;
    }
  }

  private writeDraft(): void {
    try {
      sessionStorage.setItem(`${DRAFT_PREFIX}${this.viewKey}`, JSON.stringify(this.draft()));
    } catch {
      // A full or blocked storage keeps the draft in memory only.
    }
  }

  /** Forgets this tab's draft of the view and draws the view from the code again. */
  async resetDraft(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    try {
      sessionStorage.removeItem(`${DRAFT_PREFIX}${this.viewKey}`);
    } catch {
      // Nothing stored.
    }
    await this.openDiagram(this.viewKey, this.source, true);
  }

  /** The view open in the editor (`flow:checkout`, or "" for an empty canvas). */
  view(): string {
    return this.viewKey;
  }

  /**
   * Opens a diagram «з коду»: its shapes at the positions the layout store keeps, or the server's.
   * This tab's draft of the view, when there is one, comes back instead (`fresh` skips it).
   */
  async openDiagram(key: string, diagram: Diagram, fresh = false): Promise<void> {
    // The view being left keeps its layout and its draft.
    await this.flush();
    this.viewKey = key;
    this.source = diagram;
    this.editMode = "code";
    const draft = fresh ? null : this.readDraft(key);
    const layout = draft ? null : await layoutStore().load(key);
    this.loading = true;
    try {
      if (draft) this.restore(draft);
      else this.build(diagram, layout);
    } finally {
      this.loading = false;
    }
    this.applyMode();
    this.graph.clearSelection();
    this.fit();
    if (draft) this.host.status(`editor · ${key || "empty canvas"} · the draft of this tab is back (${draft.mode === "draft" ? "чернетка" : "з коду"}); «скинути чернетку» draws the view from the code`);
    else this.host.status(diagram.reason ?? `editor · ${key} · з коду: ${diagram.nodes.length} shapes, ${diagram.edges.length} edges · only the layout changes`);
  }

  /** An empty canvas: nothing from the code yet. */
  async openEmpty(): Promise<void> {
    await this.openDiagram("", { nodes: [], edges: [], groups: [] });
    if (this.allCells().length === 0) this.setMode("draft");
    this.host.status("editor · an empty canvas, чернетка: drag shapes from the palette, or pick a view on the left to open it «з коду»");
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
            layer = layerOf(above);
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
    return { view: this.viewKey, mode: this.editMode, nodes, edges, lanes };
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

  /** Writes the layout and the draft of the open view now if a change waits for them. */
  async flush(): Promise<void> {
    if (this.saveTimer === 0) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    this.writeDraft();
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
