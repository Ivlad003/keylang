// The canvas of the diagram page: one diagram of `/api/diagram` drawn
// read-only with maxGraph (ADR 0024) at the positions the server computed.
// BPMN-like shapes by node kind, a lane per layer, colours and glyphs by
// verdict; wheel zoom around the cursor, drag on the background to pan, fit
// to the window, and maxGraph's outline as the minimap. `BaseGraph` with the
// one plugin it needs (panning) and only the shapes, perimeters and markers
// drawn here keeps the bundle small (the build drops the outline's own
// default plugins, see scripts/build-web.mjs).

import {
  BaseGraph,
  DoubleEllipseShape,
  EdgeMarker,
  EdgeMarkerRegistry,
  EllipseShape,
  InternalEvent,
  Outline,
  PanningHandler,
  Perimeter,
  PerimeterRegistry,
  RectangleShape,
  RhombusShape,
  ShapeRegistry,
  SwimlaneShape,
  ConnectorShape,
  type Cell,
  type CellStyle,
  type EventObject,
} from "@maxgraph/core";
import type { Diagram, DiagramEdge, DiagramNode } from "./api.ts";

/** Colours by verdict, the same meaning as in the terminal: ok, fail, unproven, not yet built. */
export const VERDICT_COLOUR: Record<string, { stroke: string; fill: string }> = {
  ok: { stroke: "#2e7d32", fill: "#e8f5e9" },
  fail: { stroke: "#c62828", fill: "#ffebee" },
  unverified: { stroke: "#b26a00", fill: "#fff8e1" },
  warning: { stroke: "#8d6e00", fill: "#fffde7" },
  planned: { stroke: "#757575", fill: "#f5f5f5" },
};
const NEUTRAL = { stroke: "#455a64", fill: "#eceff1" };
/** The terminal's glyphs (src/tui/evidence.ts `MARK_GLYPH`). */
export const VERDICT_GLYPH: Record<string, string> = { ok: "✓", fail: "✗", unverified: "◌", warning: "!", planned: "◇" };

const SELECTED = "#1565c0";
const USED = "#8e24aa";
/** Shapes too small for their text: the text goes below them as a caption. */
const SMALL = new Set(["start", "event", "timer", "gateway", "parallel"]);
/** A caption under a small shape. */
const CAPTION_W = 140;
const CAPTION_H = 30;
/** Characters of a line of a task's label. */
const LINE = 24;

let registered = false;

/** Only what this canvas draws: `BaseGraph` registers nothing itself. */
function register(): void {
  if (registered) return;
  registered = true;
  ShapeRegistry.add("rectangle", RectangleShape);
  ShapeRegistry.add("ellipse", EllipseShape);
  ShapeRegistry.add("doubleEllipse", DoubleEllipseShape);
  ShapeRegistry.add("rhombus", RhombusShape);
  ShapeRegistry.add("swimlane", SwimlaneShape);
  ShapeRegistry.add("connector", ConnectorShape);
  PerimeterRegistry.add("rectanglePerimeter", Perimeter.RectanglePerimeter);
  PerimeterRegistry.add("ellipsePerimeter", Perimeter.EllipsePerimeter);
  PerimeterRegistry.add("rhombusPerimeter", Perimeter.RhombusPerimeter);
  EdgeMarkerRegistry.add("classic", EdgeMarker.createArrow(2));
  EdgeMarkerRegistry.add("open", EdgeMarker.createOpenArrow(2));
}

/** A long ID in lines of at most `LINE` characters, broken after dots; three lines at most. */
export function wrapLabel(text: string, max = 3): string {
  const lines: string[] = [];
  let line = "";
  for (const part of text.split(/(?<=\.)/)) {
    if (line !== "" && line.length + part.length > LINE) {
      lines.push(line);
      line = "";
    }
    line += part;
    while (line.length > LINE) {
      lines.push(line.slice(0, LINE));
      line = line.slice(LINE);
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length <= max) return lines.join("\n");
  return [...lines.slice(0, max - 1), `…${lines.slice(max - 1).join("").slice(-(LINE - 1))}`].join("\n");
}

function glyphOf(node: DiagramNode): string {
  return node.verdict ? (VERDICT_GLYPH[node.verdict] ?? "") : "";
}

/** The text inside a shape: the glyph of a small shape, or the verdict glyph and the label. */
function labelOf(node: DiagramNode): string {
  switch (node.kind) {
    case "parallel":
      return "+";
    case "gateway":
      return "×";
    case "timer":
      return "⏱";
    case "start":
    case "event":
      return "";
    case "hole":
      return "?";
    default: {
      const glyph = glyphOf(node);
      return `${glyph ? `${glyph} ` : ""}${wrapLabel(node.label)}`;
    }
  }
}

function nodeStyle(node: DiagramNode): CellStyle {
  const colour = (node.verdict && VERDICT_COLOUR[node.verdict]) || NEUTRAL;
  const style: CellStyle = { strokeColor: colour.stroke, fillColor: colour.fill, fontColor: "#212121", fontSize: 11, strokeWidth: 1.5 };
  if (node.verdict === "planned") style.dashed = true;
  switch (node.kind) {
    case "start":
      return { ...style, shape: "ellipse", perimeter: "ellipsePerimeter", strokeWidth: 2 };
    case "event":
    case "timer":
      return { ...style, shape: "doubleEllipse", perimeter: "ellipsePerimeter", fontSize: 14 };
    case "gateway":
    case "parallel":
      return { ...style, shape: "rhombus", perimeter: "rhombusPerimeter", fontSize: 22, fontStyle: 1 };
    case "hole":
      return { ...style, dashed: true, fontSize: 20, fontStyle: 1, rounded: true };
    case "external":
      return { ...style, dashed: true, rounded: true, fillColor: "#ffffff" };
    case "layer":
      return { ...style, rounded: true, fontStyle: 1 };
    default:
      return { ...style, rounded: true };
  }
}

function edgeStyle(edge: DiagramEdge): CellStyle {
  const colour = (edge.verdict && VERDICT_COLOUR[edge.verdict]) || NEUTRAL;
  const dashed = edge.kind === "deny" || edge.kind === "emits" || edge.kind === "continues" || edge.kind === "call" || edge.kind === "dependency";
  return { strokeColor: colour.stroke, fontColor: "#424242", fontSize: 10, endArrow: edge.kind === "call" || edge.kind === "dependency" ? "open" : "classic", dashed, labelBackgroundColor: "#ffffff" };
}

export interface CanvasEvents {
  /** A click on a shape, or on the background (null). */
  select(node: DiagramNode | null): void;
}

export class Canvas {
  readonly graph: BaseGraph;
  private readonly container: HTMLElement;
  private readonly events: CanvasEvents;
  private diagram: Diagram = { nodes: [], edges: [], groups: [] };
  /** Shapes and captions of each node; a click on either picks the node. */
  private readonly cells = new Map<string, Cell[]>();
  private readonly nodeOf = new Map<Cell, DiagramNode>();
  private selected: string | null = null;
  private used: (node: DiagramNode) => boolean = () => false;
  private downAt: { x: number; y: number } | null = null;

  constructor(container: HTMLElement, minimap: HTMLElement, events: CanvasEvents) {
    register();
    this.container = container;
    this.events = events;
    this.graph = new BaseGraph({ container, plugins: [PanningHandler] });
    const graph = this.graph;
    // Read-only: nothing moves, resizes, connects or edits; the editor is ticket 23. Events stay on for clicks and panning.
    graph.setCellsMovable(false);
    graph.setCellsResizable(false);
    graph.setCellsEditable(false);
    graph.setCellsBendable(false);
    graph.setCellsDeletable(false);
    graph.setCellsSelectable(false);
    graph.setConnectable(false);
    graph.setPanning(true);
    const panning = graph.getPlugin<PanningHandler>("PanningHandler");
    if (panning) panning.useLeftButtonForPanning = true;
    graph.getStylesheet().getDefaultVertexStyle().fontFamily = "system-ui, sans-serif";
    graph.getStylesheet().getDefaultEdgeStyle().fontFamily = "system-ui, sans-serif";

    // A click picks the node under it; the end of a drag (panning) is no click.
    container.addEventListener("pointerdown", (event) => (this.downAt = { x: event.clientX, y: event.clientY }));
    graph.addListener(InternalEvent.CLICK, (_sender: unknown, event: EventObject) => {
      const native = event.getProperty("event") as MouseEvent | undefined;
      if (native && this.downAt && Math.hypot(native.clientX - this.downAt.x, native.clientY - this.downAt.y) > 4) return;
      const cell = event.getProperty("cell") as Cell | null;
      const node = cell ? (this.nodeOf.get(cell) ?? null) : null;
      this.select(node?.id ?? null);
      this.events.select(node);
    });
    // The wheel zooms around the cursor.
    container.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = container.getBoundingClientRect();
        this.zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - box.left, event.clientY - box.top);
      },
      { passive: false },
    );
    new Outline(graph, minimap);
  }

  /** The diagram on screen. */
  current(): Diagram {
    return this.diagram;
  }

  /** Draws a diagram from scratch: lanes first, so the shapes sit on top of them, then shapes and captions, then edges. `keepView` leaves zoom and pan as they are (a refresh). */
  show(diagram: Diagram, keepView = false): void {
    const graph = this.graph;
    this.diagram = diagram;
    this.cells.clear();
    this.nodeOf.clear();
    const parent = graph.getDefaultParent();
    graph.batchUpdate(() => {
      graph.removeCells(graph.getChildCells(parent, true, true), true);
      for (const group of diagram.groups) {
        graph.insertVertex({
          parent,
          value: group.label,
          position: [group.x, group.y],
          size: [group.w, group.h],
          style: { shape: "swimlane", horizontal: false, startSize: 26, fillColor: "#eef2f4", swimlaneFillColor: "#ffffff", strokeColor: "#b0bec5", fontColor: "#37474f", fontStyle: 1, fontSize: 12 },
        });
      }
      const byId = new Map<string, Cell>();
      for (const node of diagram.nodes) {
        const shape = graph.insertVertex({ parent, value: labelOf(node), position: [node.x, node.y], size: [node.w, node.h], style: this.styleOf(node) });
        const own = [shape];
        if (SMALL.has(node.kind)) {
          const glyph = glyphOf(node);
          own.push(
            graph.insertVertex({
              parent,
              value: `${glyph ? `${glyph} ` : ""}${wrapLabel(node.label, 2)}`,
              position: [node.x + node.w / 2 - CAPTION_W / 2, node.y + node.h + 2],
              size: [CAPTION_W, CAPTION_H],
              style: { shape: "rectangle", fillColor: "none", strokeColor: "none", fontColor: "#263238", fontSize: 10, verticalAlign: "top" },
            }),
          );
        }
        for (const cell of own) this.nodeOf.set(cell, node);
        this.cells.set(node.id, own);
        byId.set(node.id, shape);
      }
      for (const edge of diagram.edges) {
        const source = byId.get(edge.from);
        const target = byId.get(edge.to);
        if (source && target) graph.insertEdge({ parent, value: edge.label ?? "", source, target, style: edgeStyle(edge) });
      }
    });
    if (!keepView) this.fit();
  }

  /** Marks the selected node; null clears it. */
  select(id: string | null): void {
    this.selected = id !== null && this.cells.has(id) ? id : null;
    this.restyle();
  }

  /** Marks the nodes a usages search found. */
  markUsed(test: (node: DiagramNode) => boolean): void {
    this.used = test;
    this.restyle();
  }

  /** The whole diagram in the window, never above its natural size. */
  fit(margin = 24): void {
    const view = this.graph.getView();
    const bounds = this.graph.getGraphBounds();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (bounds.width === 0 || bounds.height === 0 || width === 0 || height === 0) return view.scaleAndTranslate(1, margin, margin);
    const scale = view.scale;
    const model = { x: bounds.x / scale - view.translate.x, y: bounds.y / scale - view.translate.y, w: bounds.width / scale, h: bounds.height / scale };
    const next = Math.max(0.05, Math.min(1, (width - 2 * margin) / model.w, (height - 2 * margin) / model.h));
    view.scaleAndTranslate(next, width / 2 / next - (model.x + model.w / 2), height / 2 / next - (model.y + model.h / 2));
  }

  /** Zooms by `factor` keeping the point at `(x, y)` of the container in place. */
  zoomAt(factor: number, x = this.container.clientWidth / 2, y = this.container.clientHeight / 2): void {
    const view = this.graph.getView();
    const scale = view.scale;
    const next = Math.max(0.05, Math.min(4, scale * factor));
    const px = x / scale - view.translate.x;
    const py = y / scale - view.translate.y;
    view.scaleAndTranslate(next, x / next - px, y / next - py);
  }

  /** Centres a node without zooming. */
  reveal(id: string): void {
    const node = this.diagram.nodes.find((n) => n.id === id);
    if (!node) return;
    const view = this.graph.getView();
    const scale = view.scale;
    view.setTranslate(this.container.clientWidth / 2 / scale - (node.x + node.w / 2), this.container.clientHeight / 2 / scale - (node.y + node.h / 2));
  }

  private styleOf(node: DiagramNode): CellStyle {
    const style = nodeStyle(node);
    if (node.id === this.selected) return { ...style, strokeColor: SELECTED, strokeWidth: 3.5 };
    if (this.used(node)) return { ...style, strokeColor: USED, strokeWidth: 3 };
    return style;
  }

  private restyle(): void {
    const model = this.graph.getDataModel();
    this.graph.batchUpdate(() => {
      for (const node of this.diagram.nodes) {
        const shape = this.cells.get(node.id)?.[0];
        if (shape) model.setStyle(shape, this.styleOf(node));
      }
    });
  }
}
