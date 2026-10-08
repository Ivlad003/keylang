// The diagram page of `keylang web` (`/diagrams`): a list of what there is to
// draw — flows, entry points, the layers — and one diagram drawn read-only
// with maxGraph. This is the skeleton of business-flows/33: it proves the
// bundle, the token and the API; the viewer proper is ticket 21 and the
// editor ticket 23. Shapes keep the positions `/api/diagram` computed (or the
// layout file overrides): the client places nothing itself.

import { Graph, type Cell, type CellStyle, type FitPlugin } from "@maxgraph/core";
import { Api, ApiError, type Diagram, type DiagramEdge, type DiagramNode, type ViewQuery, type Views, takeToken } from "./api.ts";
import "./diagrams.css";

/** Colours by verdict, the same meaning as in the terminal: ok, fail, unproven, not yet built. */
const VERDICT_COLOUR: Record<string, { stroke: string; fill: string }> = {
  ok: { stroke: "#2e7d32", fill: "#e8f5e9" },
  fail: { stroke: "#c62828", fill: "#ffebee" },
  unverified: { stroke: "#b26a00", fill: "#fff8e1" },
  planned: { stroke: "#757575", fill: "#f5f5f5" },
};
const NEUTRAL = { stroke: "#455a64", fill: "#eceff1" };

interface Item {
  label: string;
  hint: string;
  query: ViewQuery;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`the page has no #${id}`);
  return found as T;
}

/** Every view `/api/views` offers, in its order: flows, entry points, the one layers view, then a view per process domain. */
function itemsOf(views: Views): Item[] {
  return [
    ...views.flows.map((name): Item => ({ label: name, hint: "flow", query: { view: "flow", name } })),
    ...views.entries.map((entry): Item => ({ label: entry.label, hint: entry.kind, query: { view: "entry", id: entry.id } })),
    ...(views.layers.length > 0 ? [{ label: views.layers.join(" · "), hint: "layers", query: { view: "layers" } } satisfies Item] : []),
    ...(views.domains ?? []).map((domain): Item => ({ label: domain, hint: "process", query: { view: "process", domain } })),
  ];
}

function nodeStyle(node: DiagramNode): CellStyle {
  const colour = (node.verdict && VERDICT_COLOUR[node.verdict]) || NEUTRAL;
  const style: CellStyle = { strokeColor: colour.stroke, fillColor: colour.fill, fontColor: "#212121", whiteSpace: "wrap", fontSize: 11 };
  switch (node.kind) {
    case "start":
    case "event":
    case "timer":
      return { ...style, shape: "ellipse" };
    case "gateway":
    case "parallel":
      return { ...style, shape: "rhombus" };
    case "hole":
      return { ...style, dashed: true };
    case "external":
      return { ...style, rounded: false, strokeWidth: 2 };
    default:
      return { ...style, rounded: true };
  }
}

function edgeStyle(edge: DiagramEdge): CellStyle {
  const colour = (edge.verdict && VERDICT_COLOUR[edge.verdict]) || NEUTRAL;
  return { strokeColor: colour.stroke, fontColor: "#424242", fontSize: 10, endArrow: "classic", dashed: edge.kind === "deny" || edge.kind === "emits" || edge.kind === "continues" };
}

/** Draws a diagram from scratch: lanes first, so the shapes sit on top of them, then shapes, then edges. */
function draw(graph: Graph, diagram: Diagram): void {
  const parent = graph.getDefaultParent();
  graph.batchUpdate(() => {
    graph.removeCells(graph.getChildCells(parent, true, true), true);
    for (const group of diagram.groups) {
      graph.insertVertex({
        parent,
        value: group.label,
        position: [group.x, group.y],
        size: [group.w, group.h],
        style: { shape: "swimlane", horizontal: false, startSize: 24, fillColor: "#fafafa", swimlaneFillColor: "#ffffff", strokeColor: "#b0bec5", fontColor: "#37474f", fontStyle: 1 },
      });
    }
    const cells = new Map<string, Cell>();
    for (const node of diagram.nodes) {
      const label = node.kind === "hole" && node.reason ? `? ${node.label}\n${node.reason}` : node.label;
      cells.set(node.id, graph.insertVertex({ parent, value: label, position: [node.x, node.y], size: [node.w, node.h], style: nodeStyle(node) }));
    }
    for (const edge of diagram.edges) {
      const source = cells.get(edge.from);
      const target = cells.get(edge.to);
      if (source && target) graph.insertEdge({ parent, value: edge.label ?? "", source, target, style: edgeStyle(edge) });
    }
  });
  // A small diagram keeps its size; a large one shrinks to the window.
  const fit = graph.getPlugin<FitPlugin>("fit");
  if (fit) {
    fit.maxFitScale = 1;
    fit.fitCenter({ margin: 16 });
  }
}

function explain(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "No access: open the URL printed by `keylang web` (it carries the access token).";
  return error instanceof Error ? error.message : String(error);
}

async function start(): Promise<void> {
  const api = new Api(takeToken());
  const search = element<HTMLInputElement>("search");
  const list = element<HTMLUListElement>("views");
  const status = element<HTMLDivElement>("status");
  const graph = new Graph(element<HTMLDivElement>("graph"));
  // Read-only: no selection, no moves, no edits; the editor is ticket 23.
  graph.setEnabled(false);

  let items: Item[] = [];
  let active: Item | null = null;
  const render = (): void => {
    const needle = search.value.trim().toLowerCase();
    list.replaceChildren(
      ...items
        .filter((item) => !needle || `${item.label} ${item.hint}`.toLowerCase().includes(needle))
        .map((item) => {
          const li = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = item === active ? "active" : "";
          const hint = document.createElement("span");
          hint.className = "hint";
          hint.textContent = item.hint;
          button.append(hint, document.createTextNode(item.label));
          button.addEventListener("click", () => void open(item));
          li.append(button);
          return li;
        }),
    );
  };
  const open = async (item: Item): Promise<void> => {
    active = item;
    render();
    status.textContent = `loading ${item.label}…`;
    try {
      const diagram = await api.diagram(item.query);
      if (active !== item) return;
      draw(graph, diagram);
      status.textContent = diagram.reason ?? `${diagram.nodes.length} shapes · ${diagram.edges.length} edges`;
    } catch (error) {
      if (active === item) status.textContent = explain(error);
    }
  };
  search.addEventListener("input", render);

  status.textContent = "loading views…";
  try {
    items = itemsOf(await api.views());
    status.textContent = items.length > 0 ? "pick a view on the left" : "nothing to draw: no flows, entry points or layers";
    render();
  } catch (error) {
    status.textContent = explain(error);
  }
}

void start();
