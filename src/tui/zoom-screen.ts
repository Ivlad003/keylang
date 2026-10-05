// The zoom screen's keys and pointer (c4-zoom/07–09): the map one level at
// a time — its nodes or its edges, a flow laid over it — into a container
// and back up to its parent. zoom.ts computes the levels and view.ts draws
// them; this keeps where the screen is and what its keys do.

import { resolve } from "node:path";
import type { OperationRequest } from "../operations.ts";
import { nodeExplanation, unknownIdMessage } from "../explain-offline.ts";
import { noSnapshotReason } from "./actions.ts";
import { evidenceOf } from "./evidence.ts";
import type { KeyEvent, MouseEvent } from "./input.ts";
import type { Cursor, Hover, State } from "./state.ts";
import { layout, ZOOM_HEAD, zoomButtons, zoomListHeight, type ZoomButton } from "./view.ts";
import { flowOverlay, flowsThrough, MAX_DEPTH, zoomContainer, zoomEdges, zoomLevel, zoomParent, zoomSelectKey, zoomTarget, ZOOM_ROOT, type FlowOverlay, type ZoomEdge, type ZoomRow } from "./zoom.ts";

/** What the zoom screen needs from the session: where its keys lead out of it. */
export interface ZoomHost {
  readonly state: State;
  /** The node in the map of its layer, in the view. */
  goToNode(id: string): void;
  /** The line of a spec that declares or uses `id`. */
  goToSpec(id: string | null): void;
  open(path: string, cursor: Cursor): void;
  /** The code at `line` of the file at `abs`, in the viewer. */
  jump(abs: string, line: number): void;
  /** The explain hover of a node, as `e` shows it in the view. */
  explainLines(id: string, found: Exclude<ReturnType<typeof nodeExplanation>, { unknown: string }>): Hover["lines"];
  openNodeSearch(): void;
  openPalette(): void;
  requestOperation(action: string, request: OperationRequest): void;
}

export class ZoomScreen {
  private readonly host: ZoomHost;

  constructor(host: ZoomHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /**
   * `z`: the zoom screen at `id` (its own level, or the level it is a row
   * of, that row selected), else at the repository. The view underneath stays
   * as it is; `q` comes back to it at the node selected last.
   */
  openZoom(id: string | null): void {
    const analysis = this.state.analysis;
    if (!analysis?.snapshot) {
      this.state.message = analysis ? (noSnapshotReason(this.state) ?? "no code snapshot to zoom into") : "analysis is still running";
      return;
    }
    const target = (id === null ? null : zoomTarget(analysis, id)) ?? { focus: ZOOM_ROOT, select: null };
    this.state.zoom ??= { focus: ZOOM_ROOT, depth: 1, selected: new Map(), top: 0, view: "nodes", from: null, flow: null };
    this.state.mode = "zoom";
    this.state.focus = "editor";
    this.state.hover = null;
    this.state.completion = null;
    this.state.selection = null;
    this.zoomTo(target.focus, target.select);
  }

  /** The level of `focus`, `select` (or the row selected there before) under the cursor. */
  private zoomTo(focus: string, select: string | null): void {
    const zoom = this.state.zoom!;
    zoom.focus = focus;
    zoom.top = 0;
    if (select !== null && zoom.view === "nodes") {
      const index = this.zoomRows().findIndex((row) => row.id === select);
      if (index >= 0) zoom.selected.set(focus, index);
    }
    this.state.hover = null;
    this.keepZoomVisible();
  }

  /** The edges view of the level shown (`c`): its rows. */
  private zoomEdgeRows(): ZoomEdge[] {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis?.snapshot || !zoom) return [];
    this.zoomRows();
    return zoomEdges(analysis, zoom.focus);
  }

  /** How many rows the shown view of the level has. */
  private zoomCount(): number {
    return this.state.zoom?.view === "edges" ? this.zoomEdgeRows().length : this.zoomRows().length;
  }

  /** The rows of the level shown; the repository's when the focus left the snapshot with a new analysis. */
  private zoomRows(): ZoomRow[] {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis?.snapshot || !zoom) return [];
    if (zoom.focus !== ZOOM_ROOT && !analysis.snapshot.nodes[zoom.focus]) {
      zoom.focus = ZOOM_ROOT;
      this.state.message = "that level is gone from the snapshot: back at the repository";
    }
    return zoomLevel(analysis, zoom.focus, zoom.depth).rows;
  }

  /** The selected row of the shown view, clamped to `rows`. */
  private zoomIndex(rows: readonly unknown[]): number {
    const zoom = this.state.zoom!;
    return Math.max(0, Math.min(zoom.selected.get(zoomSelectKey(zoom)) ?? 0, rows.length - 1));
  }

  /** Keeps the selected row inside the shown rows of the zoom screen. */
  private keepZoomVisible(): void {
    const zoom = this.state.zoom;
    if (!zoom) return;
    const visible = Math.max(1, zoomListHeight(this.state, layout(this.state).editor));
    const at = zoom.view === "edges" ? this.zoomIndex(this.zoomEdgeRows()) : this.zoomIndex(this.zoomRows());
    if (at < zoom.top) zoom.top = at;
    else if (at >= zoom.top + visible) zoom.top = at - visible + 1;
  }

  /**
   * One level up, the cursor on the node it came from. At the repository Esc
   * closes the screen and leaves the view where it was; `q` is the one that
   * goes to the selected node.
   */
  private zoomUp(close: boolean): void {
    const analysis = this.state.analysis!;
    const zoom = this.state.zoom!;
    const above = zoomParent(analysis, zoom.focus);
    if (above === null) {
      if (close) return this.closeZoom(false);
      this.state.message = "the repository is the top level: q closes the zoom";
      return;
    }
    this.zoomTo(above, zoom.focus);
  }

  /** `>` and `<`: neighbors one edge farther or nearer, from none up to `MAX_DEPTH`. */
  private zoomDepth(delta: number): void {
    const zoom = this.state.zoom!;
    if (zoom.view === "edges") {
      this.state.message = "the edges view shows direct edges: c goes back to the nodes and their depth";
      return;
    }
    const depth = Math.max(0, Math.min(MAX_DEPTH, zoom.depth + delta));
    if (depth === zoom.depth) {
      this.state.message = delta > 0 ? `depth ${MAX_DEPTH} is the farthest` : "depth 0: only the children";
      return;
    }
    const before = this.zoomRows();
    const selected = before[this.zoomIndex(before)]?.id ?? null;
    zoom.depth = depth;
    const rows = this.zoomRows();
    const index = selected === null ? -1 : rows.findIndex((row) => row.id === selected);
    zoom.selected.set(zoom.focus, index >= 0 ? index : this.zoomIndex(rows));
    this.keepZoomVisible();
  }

  /** `q`: back to the view, at the node selected on the level (in the map of its layer), or at the focus. */
  private closeZoom(follow = true): void {
    const rows = this.zoomRows();
    const row = rows[this.zoomIndex(rows)];
    const focus = this.state.zoom?.focus ?? ZOOM_ROOT;
    this.state.mode = "view";
    this.state.hover = null;
    if (!follow) return;
    const id = row && row.kind !== "more" ? row.id : focus;
    if (id !== ZOOM_ROOT) this.host.goToNode(id);
  }

  /** Enter on a fn or type: its code in the viewer; Esc there comes back to this level. */
  private zoomCode(id: string): void {
    const node = this.state.analysis?.snapshot?.nodes[id];
    if (!node?.file) {
      this.state.message = `\`${id}\` has no code to open`;
      return;
    }
    this.host.jump(resolve(this.state.root, node.file), node.line ?? 1);
  }

  /** The wheel scrolls the rows of the zoom screen; a click on a row selects it and opens nothing. */
  zoomMouse(event: MouseEvent, editor: { x: number; y: number; width: number; height: number }): void {
    const zoom = this.state.zoom;
    if (!zoom) return;
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      zoom.top = Math.max(0, Math.min(Math.max(0, this.zoomCount() - 1), zoom.top + (event.action === "wheel-up" ? -3 : 3)));
      this.state.hover = null;
      return;
    }
    if (event.action !== "down" || event.button !== 0) return;
    // A button of the header does what its key does.
    if (event.y === editor.y) {
      const button = zoomButtons(zoom, editor.width).buttons.find((item) => event.x - editor.x >= item.x && event.x - editor.x < item.x + item.width);
      if (button) this.zoomButton(button.action);
      return;
    }
    const index = zoom.top + event.y - editor.y - ZOOM_HEAD;
    if (event.y < editor.y + ZOOM_HEAD || index >= this.zoomCount()) return;
    zoom.selected.set(zoomSelectKey(zoom), index);
    this.state.hover = null;
  }

  /** A header button of the zoom screen: the same as its key. */
  private zoomButton(action: ZoomButton["action"]): void {
    const key = { up: "-", in: "+", shallower: "<", deeper: ">", edges: "c", flow: "f" }[action];
    this.zoomKey({ type: "key", name: key, ctrl: false, alt: false, shift: false, text: key });
  }

  /** `e` and `K`: the explain hover of the selected node, as `e` shows it in the view. */
  private zoomExplain(row: ZoomRow | undefined): void {
    const analysis = this.state.analysis;
    if (!analysis || !row || row.kind === "more") return;
    const found = nodeExplanation(analysis, row.id, analysis.config.explain.detail);
    if ("unknown" in found) {
      this.state.message = unknownIdMessage(row.id, found.suggestion);
      return;
    }
    const editor = layout(this.state).editor;
    const zoom = this.state.zoom!;
    const at = zoom.view === "edges" ? this.zoomIndex(this.zoomEdgeRows()) : this.zoomIndex(this.zoomRows());
    const y = editor.y + ZOOM_HEAD + (at - zoom.top);
    this.state.hover = { x: editor.x + 2, y, lines: this.host.explainLines(row.id, found), source: "key" };
  }

  /** `f`: the flow picker, the flows through this level first; with a flow laid over the levels, `f` takes it off. */
  private zoomFlowKey(): void {
    const zoom = this.state.zoom!;
    if (zoom.flow !== null) {
      this.state.message = `flow ${zoom.flow} taken off`;
      zoom.flow = null;
      return;
    }
    this.state.prompt = { kind: "flow", text: "", items: [], ids: [], index: 0 };
    this.findFlows();
  }

  /** The flow picker's list: every flow whose name has the typed text, those through the level first. */
  findFlows(): void {
    const prompt = this.state.prompt;
    const analysis = this.state.analysis;
    if (prompt?.kind !== "flow" || !analysis) return;
    const through = new Set(flowsThrough(analysis, this.state.zoom?.focus ?? ZOOM_ROOT));
    const query = prompt.text.trim().toLowerCase();
    const names = [...new Set(analysis.spec.flows.map((flow) => flow.name))].filter((name) => name.toLowerCase().includes(query));
    names.sort((a, b) => Number(through.has(b)) - Number(through.has(a)) || (a < b ? -1 : a > b ? 1 : 0));
    prompt.ids = names;
    prompt.items = names.map((name) => `${name}${through.has(name) ? " · through this level" : ""}`);
    prompt.index = Math.min(prompt.index, Math.max(0, names.length - 1));
  }

  /** `F`: the next flow through the level, after the one laid over it. */
  private zoomNextFlow(): void {
    const zoom = this.state.zoom!;
    const through = flowsThrough(this.state.analysis!, zoom.focus);
    if (through.length === 0) {
      this.state.message = "no flow goes through this level";
      return;
    }
    const at = zoom.flow === null ? -1 : through.indexOf(zoom.flow);
    zoom.flow = through[(at + 1) % through.length]!;
    this.state.message = `flow ${zoom.flow} (${((at + 1) % through.length) + 1} of ${through.length} through this level)`;
  }

  /** The flow laid over the shown level, numbered on its units. */
  private zoomOverlay(): FlowOverlay | null {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis || !zoom || zoom.flow === null) return null;
    return flowOverlay(analysis, zoom.flow, zoom.focus, (file, line) => evidenceOf(analysis, file).get(line)?.mark ?? null);
  }

  /** `c`: the level's edges as rows, or back to its nodes. */
  private zoomToggleView(): void {
    const zoom = this.state.zoom!;
    zoom.view = zoom.view === "edges" ? "nodes" : "edges";
    zoom.top = 0;
    this.state.hover = null;
    this.keepZoomVisible();
  }

  /** Enter on an edge: the level of its other end, in the edges view; a fn or type, the level it is a row of. */
  private zoomAlongEdge(edge: ZoomEdge): void {
    const analysis = this.state.analysis!;
    const target = zoomContainer(analysis, edge.other) ? edge.other : zoomParent(analysis, edge.other);
    if (target === null || edge.group === "unresolved") {
      this.state.message = edge.group === "unresolved" ? "these constructs have no edge to follow: e explains the node" : `\`${edge.other}\` has no level`;
      return;
    }
    this.zoomTo(target, null);
  }

  /** `x`: in the edges view the edges of the selected row; on nodes, the first `x` marks the from end, the second explains from it to the selected node. */
  private zoomExplainEdge(row: ZoomRow | undefined, edge: ZoomEdge | undefined): void {
    const zoom = this.state.zoom!;
    let from: string;
    let to: string;
    if (zoom.view === "edges") {
      if (!edge || edge.group === "unresolved") return;
      from = edge.from;
      to = edge.to;
    } else {
      if (!row || row.kind === "more") return;
      if (zoom.from === null || zoom.from === row.id) {
        zoom.from = row.id;
        this.state.message = `from ${row.id}: x on another node explains the edges between them`;
        return;
      }
      from = zoom.from;
      to = row.id;
      zoom.from = null;
    }
    this.host.requestOperation("explain-edge", { kind: "explain-edge", root: this.state.root, from: from === ZOOM_ROOT ? to : from, to });
  }

  zoomKey(event: KeyEvent): void {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis?.snapshot || !zoom) {
      this.state.mode = "view";
      return;
    }
    const edges = zoom.view === "edges" ? this.zoomEdgeRows() : [];
    const rows = zoom.view === "edges" ? [] : this.zoomRows();
    const count = zoom.view === "edges" ? edges.length : rows.length;
    const at = zoom.view === "edges" ? this.zoomIndex(edges) : this.zoomIndex(rows);
    const row = rows[at];
    const edge = edges[at];
    const page = Math.max(1, zoomListHeight(this.state, layout(this.state).editor) - 1);
    const select = (index: number): void => {
      zoom.selected.set(zoomSelectKey(zoom), Math.max(0, Math.min(index, count - 1)));
      this.state.hover = null;
      this.keepZoomVisible();
    };
    if (event.alt && event.name === "enter") {
      const id = zoom.view === "edges" ? edge?.other : row && row.kind !== "more" ? row.id : undefined;
      if (id === undefined) return;
      // With a flow laid over the level, a step of it goes to its line in the flow.
      const overlay = this.zoomOverlay();
      const step = overlay?.steps.get(id)?.[0];
      const line = step === undefined ? undefined : overlay!.marks.get(step)?.line;
      this.closeZoom(false);
      if (overlay && line !== undefined) return this.host.open(overlay.file, { line: line - 1, col: 0 });
      return this.host.goToSpec(id);
    }
    if (event.ctrl || event.alt) return;
    switch (event.name) {
      case "up":
      case "k":
        return select(at - 1);
      case "down":
      case "j":
        return select(at + 1);
      case "pageup":
        return select(at - page);
      case "pagedown":
        return select(at + page);
      case "home":
      case "g":
        return select(0);
      case "end":
      case "G":
        return select(count - 1);
      case "+":
      case "=":
      case "enter": {
        if (zoom.view === "edges") return edge ? this.zoomAlongEdge(edge) : undefined;
        if (!row) return;
        if (row.kind === "more") return this.zoomDepth(1);
        if (row.container) return this.zoomTo(row.id, null);
        if (event.name === "enter") return this.zoomCode(row.id);
        this.state.message = `\`${row.id}\` has no level of its own: Enter opens its code`;
        return;
      }
      case "-":
      case "backspace":
        return this.zoomUp(false);
      case "escape":
        if (this.state.hover) {
          this.state.hover = null;
          return;
        }
        return this.zoomUp(true);
      case ">":
        return this.zoomDepth(1);
      case "<":
        return this.zoomDepth(-1);
      case "s":
        return this.host.openNodeSearch();
      case "e":
      case "K":
        return zoom.view === "edges" ? this.zoomExplain(edge ? this.zoomRows().find((item) => item.id === edge.other) : undefined) : this.zoomExplain(row);
      case "c":
        return this.zoomToggleView();
      case "f":
        return this.zoomFlowKey();
      case "F":
        return this.zoomNextFlow();
      case "x":
        return this.zoomExplainEdge(row, edge);
      case ":":
        return this.host.openPalette();
      case "?":
        this.state.help = true;
        return;
      case "q":
        return this.closeZoom();
      default:
        return;
    }
  }
}
