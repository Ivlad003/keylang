// The diagram page of `keylang web` (`/diagrams`, business-flows/21): a
// searchable, grouped, virtualised list of what there is to draw — flows,
// discovered flows, entry points, the layers — the chosen diagram on a
// read-only maxGraph canvas, and a side panel for the clicked shape: its ID,
// kind, place in the code and in the spec (as `vscode://` links), its
// verdicts with their messages, a hole's reason, and «where is this ID used»
// (`/api/usages`). The page polls `/api/views` and the open diagram every
// few seconds, so a `map`, a saved spec or a new discovered view shows up by
// itself; the URL fragment names the open view, so a reload or a shared
// link comes back to it. Shapes keep the positions `/api/diagram` computed:
// the client places nothing itself. The editor is ticket 23.

import { Api, ApiError, type Diagram, type DiagramNode, type Usages, type ViewQuery, type Views, takeToken } from "./api.ts";
import { Canvas, VERDICT_COLOUR, VERDICT_GLYPH } from "./canvas.ts";
import { mountExport } from "./export.ts";
import { VirtualList, type ListItem } from "./list.ts";
import "./diagrams.css";

/** How often the page asks again, ms; a request that takes longer delays the next one. */
const POLL_MS = 5000;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`the page has no #${id}`);
  return found as T;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string; title?: string } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title !== undefined) node.title = props.title;
  node.append(...children);
  return node;
}

/** The fragment of a view (`view=flow&name=…`), with the selected node. */
function hashOf(query: ViewQuery, node: string | null): string {
  const params = new URLSearchParams(query);
  if (node !== null) params.set("node", node);
  return params.toString();
}

/** The view and node the fragment names, or null. */
function readHash(): { query: ViewQuery; node: string | null } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get("view");
  const node = params.get("node");
  const name = params.get("name");
  const id = params.get("id");
  if ((view === "flow" || view === "discovered") && name) return { query: { view, name }, node };
  if (view === "entry" && id) return { query: { view, id }, node };
  if (view === "layers") return { query: { view }, node };
  return null;
}

function keyOf(query: ViewQuery): string {
  switch (query.view) {
    case "flow":
    case "discovered":
      return `${query.view}:${query.name}`;
    case "entry":
      return `entry:${query.id}`;
    default:
      return "layers";
  }
}

/** Every view `/api/views` offers: flows by trigger layer, discovered flows by layer, entry points by kind, the layers view. */
function itemsOf(views: Views): ListItem[] {
  const items: ListItem[] = [];
  const flows = views.flowList ?? views.flows.map((name) => ({ name, file: "", line: 0, trigger: null, layer: null, ids: [] }));
  for (const flow of flows) {
    const query: ViewQuery = { view: "flow", name: flow.name };
    items.push({ key: keyOf(query), label: flow.name, hint: "flow", group: `Флоу · ${flow.layer ?? "—"}`, search: [flow.name, flow.file, ...(flow.ids ?? [])].join(" ").toLowerCase(), title: [flow.name, flow.file && `${flow.file}:${flow.line}`, flow.trigger].filter(Boolean).join("\n"), query });
  }
  for (const flow of views.discovered ?? []) {
    const query: ViewQuery = { view: "discovered", name: flow.name };
    items.push({ key: keyOf(query), label: flow.label ? `${flow.name} — ${flow.label}` : flow.name, hint: flow.kind ?? "draft", group: `Знайдені флоу · ${flow.layer ?? "—"}`, search: [flow.name, flow.label ?? "", flow.trigger ?? "", flow.file].join(" ").toLowerCase(), title: [flow.name, `${flow.file}:${flow.line}`, flow.trigger].filter(Boolean).join("\n"), query });
  }
  for (const entry of views.entries) {
    const query: ViewQuery = { view: "entry", id: entry.id };
    items.push({ key: keyOf(query), label: entry.label, hint: entry.kind, group: `Точки входу · ${entry.kind}`, search: `${entry.label} ${entry.id} ${entry.kind}`.toLowerCase(), title: `${entry.label}\n${entry.id}`, query });
  }
  if (views.layers.length > 0) items.push({ key: "layers", label: views.layers.join(" · "), hint: "layers", group: "Шари", search: `layers шари ${views.layers.join(" ")}`.toLowerCase(), title: views.layers.join(" · "), query: { view: "layers" } });
  return items;
}

function explain(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "No access: open the URL printed by `keylang web` (it carries the access token).";
  return error instanceof Error ? error.message : String(error);
}

/** An ID or one under it: `a.b` covers `a.b` and `a.b.c`. */
function covers(id: string, target: string | undefined): boolean {
  return target !== undefined && (target === id || target.startsWith(`${id}.`));
}

const KIND_NAME: Record<string, string> = {
  start: "start (trigger)",
  task: "task (step)",
  gateway: "gateway (when)",
  parallel: "parallel gateway",
  event: "event (emits)",
  timer: "timer",
  external: "external (package)",
  hole: "hole: route not proven",
  module: "module",
  fn: "fn",
  layer: "layer",
};

class Page {
  private readonly api: Api;
  private readonly list: VirtualList;
  private readonly canvas: Canvas;
  private readonly status = element<HTMLDivElement>("status");
  private readonly details = element<HTMLElement>("details");
  private readonly search = element<HTMLInputElement>("search");
  private views: Views | null = null;
  private viewsText = "";
  private diagramText = "";
  private active: ViewQuery | null = null;
  private node: string | null = null;
  private usages: Usages | null = null;
  private items: ListItem[] = [];

  constructor() {
    this.api = new Api(takeToken());
    this.list = new VirtualList(element("views"), (item) => void this.open(item.query));
    this.canvas = new Canvas(element("graph"), element("minimap"), { select: (node) => this.pick(node) });
    this.search.addEventListener("input", () => {
      // Typing starts a new search: the usages of the last ID let go of the list.
      if (this.usages) this.clearUsages();
      this.list.setFilter(this.search.value);
    });
    this.search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = this.list.visibleItems()[0];
      if (first) void this.open(first.query);
    });
    element<HTMLButtonElement>("find-usages").addEventListener("click", () => {
      const id = this.search.value.trim();
      if (id) void this.findUsages(id);
    });
    element<HTMLButtonElement>("zoom-in").addEventListener("click", () => this.canvas.zoomAt(1.25));
    element<HTMLButtonElement>("zoom-out").addEventListener("click", () => this.canvas.zoomAt(1 / 1.25));
    element<HTMLButtonElement>("zoom-fit").addEventListener("click", () => this.canvas.fit());
    mountExport(element("toolbar"), () => this.active, (text) => (this.status.textContent = text));
    window.addEventListener("hashchange", () => {
      const wanted = readHash();
      if (wanted && (this.active === null || keyOf(wanted.query) !== keyOf(this.active))) void this.open(wanted.query, wanted.node);
    });
    this.legend();
    this.renderDetails(null);
  }

  async start(): Promise<void> {
    this.status.textContent = "loading views…";
    try {
      await this.loadViews();
      const wanted = readHash();
      if (wanted) await this.open(wanted.query, wanted.node);
      else this.status.textContent = this.items.length > 0 ? "pick a view on the left" : "nothing to draw: no flows, entry points or layers";
    } catch (error) {
      this.status.textContent = explain(error);
    }
    this.poll();
  }

  private async loadViews(): Promise<boolean> {
    const views = await this.api.views();
    const text = JSON.stringify(views);
    if (text === this.viewsText) return false;
    this.viewsText = text;
    this.views = views;
    this.items = itemsOf(views);
    this.list.setItems(this.items);
    this.markList();
    return true;
  }

  /** Asks again every few seconds while the tab is visible: a new map, a saved spec or a discovered view shows up without a reload. */
  private poll(): void {
    window.setTimeout(async () => {
      if (!document.hidden) {
        try {
          await this.loadViews();
          if (this.active) {
            const query = this.active;
            const diagram = await this.api.diagram(query);
            if (this.active === query) this.showDiagram(diagram, true);
          }
        } catch {
          // The next round tries again; the status keeps what the user did last.
        }
      }
      this.poll();
    }, POLL_MS);
  }

  async open(query: ViewQuery, node: string | null = null): Promise<void> {
    this.active = query;
    this.node = node;
    const key = keyOf(query);
    this.list.setActive(key);
    this.list.reveal(key);
    this.writeHash();
    this.status.textContent = `loading ${key}…`;
    try {
      const diagram = await this.api.diagram(query);
      if (this.active !== query) return;
      this.diagramText = "";
      this.showDiagram(diagram, false);
      if (node !== null) {
        this.canvas.select(node);
        this.canvas.reveal(node);
      }
      this.pick(diagram.nodes.find((n) => n.id === node) ?? null, false);
    } catch (error) {
      if (this.active === query) this.status.textContent = explain(error);
    }
  }

  private showDiagram(diagram: Diagram, keepView: boolean): void {
    const text = JSON.stringify(diagram);
    if (text === this.diagramText) return;
    this.diagramText = text;
    this.canvas.show(diagram, keepView);
    this.canvas.select(this.node);
    this.markCanvas();
    const counts = { fail: 0, unverified: 0, holes: 0 };
    for (const node of diagram.nodes) {
      if (node.verdict === "fail") counts.fail++;
      if (node.verdict === "unverified") counts.unverified++;
      if (node.kind === "hole") counts.holes++;
    }
    const name = this.active ? keyOf(this.active) : "";
    this.status.textContent = diagram.reason ?? `${name} · ${diagram.nodes.length} shapes · ${diagram.edges.length} edges · ✗ ${counts.fail} · ◌ ${counts.unverified} · ? ${counts.holes}`;
    // A refresh keeps the panel on the same node with its new verdicts.
    if (keepView && this.node !== null) {
      const node = diagram.nodes.find((n) => n.id === this.node) ?? null;
      this.renderDetails(node);
    }
  }

  private writeHash(): void {
    if (!this.active) return;
    const hash = hashOf(this.active, this.node);
    if (location.hash.slice(1) !== hash) history.replaceState(null, "", `${location.pathname}#${hash}`);
  }

  /** A click on a shape (or the background): the side panel and the fragment follow it. */
  private pick(node: DiagramNode | null, write = true): void {
    this.node = node?.id ?? null;
    if (write) this.writeHash();
    this.renderDetails(node);
  }

  private link(file: string, line: number | undefined): HTMLElement {
    const text = `${file}${line ? `:${line}` : ""}`;
    const root = this.views?.root;
    if (!root) return make("code", { text });
    const a = make("a", { text, title: "open in VS Code" });
    a.href = `vscode://file/${encodeURI(`${root.replace(/\\/g, "/").replace(/\/$/, "")}/${file}`)}${line ? `:${line}` : ""}`;
    a.className = "code-link";
    return a;
  }

  private renderDetails(node: DiagramNode | null): void {
    const body: Node[] = [];
    if (node) {
      body.push(make("h2", { text: node.label }));
      const rows: [string, Node | string][] = [["kind", KIND_NAME[node.kind] ?? node.kind]];
      if (node.ref?.id) rows.push(["ID", make("code", { text: node.ref.id })]);
      if (node.group) rows.push(["layer", node.group]);
      if (node.ref?.file) rows.push(["code", this.link(node.ref.file, node.ref.line)]);
      if (node.ref?.specFile) rows.push(["spec", this.link(node.ref.specFile, node.ref.specLine)]);
      const verdict = node.verdict ?? null;
      rows.push(["verdict", make("span", { className: `verdict v-${verdict ?? "none"}`, text: verdict ? `${VERDICT_GLYPH[verdict] ?? ""} ${verdict}` : "—" })]);
      const table = make("dl");
      for (const [name, value] of rows) table.append(make("dt", { text: name }), make("dd", {}, value));
      body.push(table);
      if (node.reason) body.push(make("h3", { text: "why the route is not proven" }), make("p", { className: "reason", text: node.reason }));
      if (node.results && node.results.length > 0) {
        body.push(make("h3", { text: "verdicts" }));
        const list = make("ul", { className: "results" });
        for (const result of node.results) list.append(make("li", { className: `v-${result.verdict}` }, make("span", { className: "glyph", text: VERDICT_GLYPH[result.verdict] ?? "·" }), make("b", { text: result.criterion }), ` ${result.message}`));
        body.push(list);
      }
      const id = node.ref?.id;
      if (id) {
        const button = make("button", { className: "usages-button", text: `where is ${id} used` });
        button.type = "button";
        button.id = "node-usages";
        button.addEventListener("click", () => void this.findUsages(id));
        body.push(button);
      }
    }
    if (this.usages) body.push(this.usagesBlock(this.usages));
    // The panel keeps its width when empty, so the canvas does not change size (and lose its fit) on the first click.
    if (body.length === 0) body.push(make("p", { className: "empty", text: "Click a shape: its ID, code, spec line and verdicts show here. «де ID?» finds where an ID is used." }));
    this.details.replaceChildren(...body);
  }

  /** «Where is this ID used»: the flows, discovered flows and entry points; a click opens one and marks the ID's shapes. */
  private async findUsages(id: string): Promise<void> {
    this.status.textContent = `looking for ${id}…`;
    try {
      this.usages = await this.api.usages(id);
      const total = this.usages.flows.length + this.usages.discovered.length + this.usages.entries.length;
      this.status.textContent = `${id}: used in ${total} view(s)`;
    } catch (error) {
      this.status.textContent = explain(error);
      return;
    }
    this.markList();
    this.markCanvas();
    this.renderDetails(this.canvas.current().nodes.find((n) => n.id === this.node) ?? null);
  }

  private usagesBlock(usages: Usages): HTMLElement {
    const block = make("section", { className: "usages" });
    block.id = "usages";
    const clear = make("button", { className: "clear", text: "×", title: "clear" });
    clear.type = "button";
    clear.addEventListener("click", () => this.clearUsages());
    block.append(make("h3", {}, `used: `, make("code", { text: usages.id }), clear));
    const entries: [string, ViewQuery, string][] = [
      ...usages.flows.map((f): [string, ViewQuery, string] => [`flow ${f.name}`, { view: "flow", name: f.name }, `${f.file}:${f.line}`]),
      ...usages.discovered.map((f): [string, ViewQuery, string] => [`discovered ${f.name}`, { view: "discovered", name: f.name }, `${f.file}:${f.line}`]),
      ...usages.entries.map((e): [string, ViewQuery, string] => [`${e.kind} ${e.label}`, { view: "entry", id: e.id }, e.id]),
    ];
    if (entries.length === 0) block.append(make("p", { text: "no flow or entry point names it" }));
    const list = make("ul");
    for (const [label, query, where] of entries) {
      const button = make("button", { text: label, title: where });
      button.type = "button";
      button.addEventListener("click", () => {
        const id = usages.id;
        void this.open(query).then(() => {
          const hit = this.canvas.current().nodes.find((n) => covers(id, n.ref?.id));
          if (hit) this.canvas.reveal(hit.id);
        });
      });
      list.append(make("li", {}, button));
    }
    block.append(list);
    return block;
  }

  private clearUsages(): void {
    this.usages = null;
    this.markList();
    this.markCanvas();
    this.renderDetails(this.canvas.current().nodes.find((n) => n.id === this.node) ?? null);
  }

  private markList(): void {
    const usages = this.usages;
    if (!usages) return this.list.setMarked(null);
    this.list.setMarked(
      new Set([
        ...usages.flows.map((f) => keyOf({ view: "flow", name: f.name })),
        ...usages.discovered.map((f) => keyOf({ view: "discovered", name: f.name })),
        ...usages.entries.map((e) => keyOf({ view: "entry", id: e.id })),
      ]),
    );
  }

  private markCanvas(): void {
    const id = this.usages?.id;
    this.canvas.markUsed(id === undefined ? () => false : (node) => covers(id, node.ref?.id));
  }

  private legend(): void {
    const legend = element<HTMLElement>("legend");
    const rows: Node[] = [];
    for (const verdict of ["ok", "fail", "unverified", "warning", "planned"]) {
      const colour = VERDICT_COLOUR[verdict]!;
      const swatch = make("span", { className: "swatch", text: VERDICT_GLYPH[verdict] ?? "" });
      swatch.style.borderColor = colour.stroke;
      swatch.style.background = colour.fill;
      swatch.style.color = colour.stroke;
      rows.push(make("div", {}, swatch, verdict));
    }
    rows.push(make("div", {}, make("span", { className: "swatch hole", text: "?" }), "hole"));
    rows.push(make("div", { className: "shapes", text: "○ start · ▢ task · ◇× gateway · ◇+ parallel · ◎ event · ⏱ timer · ┆▢┆ external" }));
    legend.replaceChildren(...rows);
  }
}

void new Page().start();
