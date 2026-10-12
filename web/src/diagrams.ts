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
// the client places nothing itself. The editor is ticket 23. Two more modes
// share the page (business-flows/22): the entry explorer (explorer.ts) — the
// lazy call tree of an entry point with «Зберегти як флоу» — and «Сліпі
// зони» (blind.ts), the report of `keylang coverage`. The fourth, «Редактор»
// (editor.ts, business-flows/23), opens a view on an editable canvas.
// «Копіювати як пакет» (and Ctrl+C with no text selected) puts the open view —
// a flow as `keylang flow export` writes it, its shapes in the layout block —
// in the clipboard for another keylang web (business-flows/25).
//
// Place in the pipeline: the entry script of the web view (`/diagrams`), on
// top of the API client (api.ts) and the canvas (canvas.ts). It owns the page
// state: the mode, the open view (mirrored in the URL fragment), the list on
// the left and the side panel. Entry point: `main`, which picks the transport
// and starts `Page`. Key terms: view (a `ViewQuery` drawn from the snapshot and
// the specs), mode (one pane of the page), usages (views that name an ID).

import { Api, ApiError, readOnlyPage, transport, useTransport, type ClipEdge, type ClipShape, type Diagram, type DiagramNode, type DocList, type PageQuery, type Usages, type ViewQuery, type Views } from "./api.ts";
import { BlindSpots } from "./blind.ts";
import { Canvas, VERDICT_COLOUR, VERDICT_GLYPH } from "./canvas.ts";
import { writeClipboard } from "./bundle-clip.ts";
import { Changes, changeItems } from "./changes.ts";
import { Docs, docItems } from "./docs.ts";
import { MATRIX_FROM, renderMatrix } from "./matrix.ts";
import { codeLink, element, make } from "./dom.ts";
import { Editor } from "./editor.ts";
import { FileLayoutStore, useLayoutStore } from "./layout-store.ts";
import { Explorer } from "./explorer.ts";
import { mountGreenfield } from "./greenfield.ts";
import { mountExport } from "./export.ts";
import { VirtualList, type ListItem } from "./list.ts";
import { openLocal } from "./local.ts";
import { StaticTransport } from "./static.ts";
import { mountTour } from "./tour.ts";
import "./diagrams.css";

/** The call tree of an entry point: the server's default depth (src/diagram.ts) and the deepest the page offers. */
const DEFAULT_DEPTH = 2;

/** The deepest call tree the depth picker offers. */
const MAX_DEPTH = 5;

/** How often the page asks again, ms; a request that takes longer delays the next one. */
const POLL_MS = 5000;

/** One pane of the page; each has its own tab, list and status. */
type Mode = "diagrams" | "explore" | "blind" | "editor" | "docs" | "changes";

/** The pane a query opens: every drawable view is the «diagrams» mode. */
function modeOf(query: PageQuery): Mode {
  return query.view === "explore" ? "explore" : query.view === "blind" ? "blind" : query.view === "editor" ? "editor" : query.view === "docs" ? "docs" : query.view === "changes" ? "changes" : "diagrams";
}

/** A query that draws a diagram: not one of the other modes. */
function isViewQuery(query: PageQuery): query is ViewQuery {
  return modeOf(query) === "diagrams";
}

/** The fragment of a view (`view=flow&name=…`), with the selected node. */
function hashOf(query: PageQuery, node: string | null): string {
  // The editor's nested view does not fit flat params: it goes as the list key of that view.
  if (query.view === "editor") return new URLSearchParams({ view: "editor", of: query.of ? keyOf(query.of) : "" }).toString();
  const params = new URLSearchParams(query);

  if (node !== null) params.set("node", node);

  return params.toString();
}

/** The view and node the fragment names, or null. */
function readHash(): { query: PageQuery; node: string | null } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get("view");
  const node = params.get("node");
  const name = params.get("name");
  const id = params.get("id");

  // One case per view kind, each demanding the params it needs: a fragment with a
  // missing name or ID is no view (null), so a broken link opens nothing rather than a wrong view.
  // The non-diagram modes keep no selected node.
  if ((view === "flow" || view === "discovered") && name) return { query: { view, name }, node };
  const depth = params.get("depth");

  if (view === "entry" && id) return { query: depth ? { view, id, depth } : { view, id }, node };

  if (view === "module" && id) return { query: { view, id }, node };

  if ((view === "system" || view === "er") && name) return { query: { view, name }, node };
  const seq = params.get("seq");

  if (view === "sequence" && name && seq) return { query: { view, name, seq }, node };

  if (view === "layers") return { query: { view }, node };

  if (view === "explore") return { query: { view, id: id ?? "" }, node: null };

  if (view === "blind") return { query: { view }, node: null };

  if (view === "docs") {
    const at = params.get("at");

    return { query: at ? { view, path: params.get("path") ?? "", at } : { view, path: params.get("path") ?? "" }, node: null };
  }

  if (view === "changes") return { query: { view, since: params.get("since") ?? "" }, node: null };

  if (view === "editor") return { query: { view, of: viewOfKey(params.get("of") ?? "") }, node: null };

  return null;
}

/** The view a list key names (`flow:checkout`, `entry:<id>`, `layers`), or null. */
function viewOfKey(key: string): ViewQuery | null {
  if (key === "layers") return { view: "layers" };
  const at = key.indexOf(":");
  // `<kind>:<rest>`: split on the first colon only, since IDs and names may hold more.
  const kind = key.slice(0, at);
  const rest = key.slice(at + 1);

  if (at === -1 || rest === "") return null;

  if (kind === "flow" || kind === "discovered") return { view: kind, name: rest };

  if (kind === "entry") return { view: "entry", id: rest };

  if (kind === "module") return { view: "module", id: rest };

  if (kind === "system" || kind === "er") return { view: kind, name: rest };

  if (kind === "sequence") {
    // `sequence:<system>/<sequence>`: the first slash splits the system from the sequence.
    const slash = rest.indexOf("/");

    return slash > 0 ? { view: "sequence", name: rest.slice(0, slash), seq: rest.slice(slash + 1) } : null;
  }

  return null;
}

/** The list key of a query (`flow:checkout`, `entry:<id>`, `layers`); `viewOfKey` reads it back for the drawable views. */
function keyOf(query: PageQuery): string {
  switch (query.view) {
    case "flow":
    case "discovered":
      return `${query.view}:${query.name}`;
    case "entry":
      return `entry:${query.id}`;
    case "module":
      return `module:${query.id}`;
    case "system":
    case "er":
      return `${query.view}:${query.name}`;
    case "sequence":
      return `sequence:${query.name}/${query.seq}`;
    case "explore":
      return `explore:${query.id}`;
    case "blind":
      return "blind";
    case "docs":
      return `docs:${query.path}`;
    case "changes":
      return `changes:${query.since}`;
    case "editor":
      return `editor:${query.of ? keyOf(query.of) : ""}`;
    default:
      return "layers";
  }
}

/** The explorer's list: entry points by kind, then the events of the snapshot; a click opens the call tree. */
function exploreItemsOf(views: Views): ListItem[] {
  const items: ListItem[] = [];

  // Each item's `search` is the lowercased text the filter matches; `group` is its heading in the list.
  for (const entry of views.entries) {
    const query: PageQuery = { view: "explore", id: entry.id };
    items.push({ key: keyOf(query), label: entry.label, hint: entry.kind, group: `Точки входу · ${entry.kind}`, search: `${entry.label} ${entry.id} ${entry.kind}`.toLowerCase(), title: `${entry.label}\n${entry.id}`, query });
  }

  for (const event of views.events ?? []) {
    const query: PageQuery = { view: "explore", id: event.id };
    items.push({ key: keyOf(query), label: event.id, hint: `${event.publishers}→${event.subscribers}`, group: "Події", search: `${event.id} event подія`.toLowerCase(), title: `${event.id}\n${event.publishers} publisher(s), ${event.subscribers} subscriber(s)`, query });
  }

  return items;
}

/** Every view `/api/views` offers: flows by trigger layer, discovered flows by layer, entry points by kind, the layers view. */
function itemsOf(views: Views): ListItem[] {
  const items: ListItem[] = [];
  // An answer without `flowList` names the flows only: list them with no place or layer.
  const flows = views.flowList ?? views.flows.map((name) => ({ name, file: "", line: 0, trigger: null, layer: null, ids: [] }));

  // Written flows, grouped by the layer of their trigger; the search text includes their IDs.
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

  // Systems (system-design/03): the `# system` sections, then the system of the code.
  for (const system of views.systems ?? []) {
    const code = system.name === CODE_SYSTEM;
    const group = code ? "Система з коду" : `Система · ${system.name}`;
    const where = system.file ? `${system.file}:${system.line ?? 1}` : "з точок входу, шарів і пакетів коду";
    const label = code ? "система з коду" : system.name;

    const add = (query: ViewQuery, text: string, hint: string): void => {
      items.push({ key: keyOf(query), label: text, hint, group, search: `${system.name} ${text} system система ${hint}`.toLowerCase(), title: `${text}\n${where}`, query });
    };

    add({ view: "system", name: system.name }, `${label}: схема`, `${system.components} компон.`);

    if (system.tables > 0) add({ view: "er", name: system.name }, `${label}: ER`, `${system.tables} табл.`);

    for (const seq of system.sequences) add({ view: "sequence", name: system.name, seq }, `${label}: ${seq}`, "sequence");
  }

  return items;
}

/** The status text of a failed request; a 403 on the live server means the tab lost its token. */
function explain(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 403 && transport().kind === "server" && !readOnlyPage()) return "No access: open the URL printed by `keylang web` (it carries the access token).";

  return cause instanceof Error ? cause.message : String(cause);
}

/** An ID or one under it: `a.b` covers `a.b` and `a.b.c`. */
function covers(id: string, target: string | undefined): boolean {
  return target !== undefined && (target === id || target.startsWith(`${id}.`));
}

/** The name of the system discovered from the code (src/system-discover.ts `DISCOVERED`). */
const CODE_SYSTEM = "@code";

/** Ukrainian names of the component kinds for the side panel. */
const COMPONENT_NAME = new Map(Object.entries({
  client: "клієнт",
  cdn: "CDN",
  dns: "DNS",
  lb: "балансувальник",
  gateway: "API gateway",
  service: "сервіс",
  worker: "воркер",
  function: "функція (serverless)",
  db: "база даних",
  cache: "кеш",
  queue: "черга / топік",
  storage: "файлове сховище",
  search: "пошуковий індекс",
  warehouse: "сховище аналітики",
  auth: "автентифікація",
  external: "зовнішній сервіс",
}));

/** Headings of a system's interview notes, by note kind. */
const NOTE_NAME = new Map(Object.entries({ requirement: "Вимоги", nfr: "Нефункціональні", estimate: "Оцінки", tradeoff: "Компроміси", question: "Відкриті питання" }));

/** How the side panel names a shape's kind. */
const KIND_NAME = new Map(Object.entries({
  component: "компонент системи",
  table: "таблиця",
  participant: "учасник sequence",
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
}));

/** The diagram page: the list, the canvas, the side panel and the other modes' panes, kept in step with the URL fragment. */
class Page {
  private readonly api: Api;
  private readonly list: VirtualList;
  private readonly canvas: Canvas;
  private readonly status = element<HTMLDivElement>("status");
  private readonly details = element<HTMLElement>("details");
  private readonly search = element<HTMLInputElement>("search");
  private views: Views | null = null;
  /** The last answers as JSON text: a poll that brings the same text redraws nothing. */
  private viewsText = "";
  private diagramText = "";
  private active: PageQuery | null = null;
  /** The last diagram open: the «Діаграми» tab goes back to it. */
  private lastDiagram: ViewQuery | null = null;
  private mode: Mode = "diagrams";
  private readonly explorer: Explorer;
  private readonly blind: BlindSpots;
  readonly editor: Editor;
  private readonly docs: Docs;
  private readonly changes: Changes;
  private readonly depth = make("select");
  /** The code the search box found (`GET /api/search`), listed after the views; null with no search. */
  private codeHits: { q: string; items: ListItem[]; total: number } | null = null;
  private searchTimer = 0;
  /** The layers view as a matrix (true), a drawing (false), or as its size says (null). */
  private matrixMode: boolean | null = null;
  private readonly matrixToggle = make("button", { title: "Шари як матриця залежностей або як схема" });
  /** Over the canvas of a system's view: its views to switch between and its interview notes. */
  private readonly systemBar = make("div", { className: "system-bar" });
  private shownDiagram: Diagram | null = null;
  private docList: DocList | null = null;
  private node: string | null = null;
  private usages: Usages | null = null;
  private items: ListItem[] = [];

  constructor() {
    this.api = new Api();
    // In the editor a view of the list opens on the editable canvas.
    this.list = new VirtualList(element("views"), (item) => void this.open(this.mode === "editor" && isViewQuery(item.query) ? { view: "editor", of: item.query } : item.query));
    this.canvas = new Canvas(element("graph"), element("minimap"), { select: (node) => this.pick(node) });
    const host = { root: () => this.views?.root, explore: (id: string) => void this.open({ view: "explore", id }), status: (text: string) => (this.status.textContent = text) };
    this.explorer = new Explorer(element("explorer"), this.api, host);
    // The editor's layouts are the view's layout files in the repository (business-flows/24).
    useLayoutStore(new FileLayoutStore(this.api));
    this.editor = new Editor(element("editor"), this.api, {
      status: (text: string) => (this.status.textContent = text),
      views: () => this.views,
      // A view drawn again from the specs as they are now (a conflict of «Запропонувати зміни»).
      reload: async (key: string) => {
        const query = viewOfKey(key);

        if (query) await this.editor.openDiagram(key, await this.api.diagram(query), true);
      },
    });
    // The browser tests read the editor's model through it.
    Object.assign(window, { keylangEditor: this.editor });

    // An answer that arrives after the person moved to another mode leaves that mode's status alone.
    const statusOf = (mode: Mode) => (text: string) => {
      if (this.mode === mode) this.status.textContent = text;
    };

    this.blind = new BlindSpots(element("blind"), this.api, { ...host, status: statusOf("blind"), discovered: (name: string) => void this.open({ view: "discovered", name }) });
    this.docs = new Docs(element("docs"), this.api, { status: statusOf("docs"), open: (path: string, at: string | null) => void this.open(at === null ? { view: "docs", path } : { view: "docs", path, at }) });
    this.changes = new Changes(element("changes"), this.api, { ...host, status: statusOf("changes"), openDoc: (path: string) => void this.open({ view: "docs", path }), pick: (since: string) => void this.open({ view: "changes", since }), showDiff: (diagram: Diagram | null) => this.showDiff(diagram) });

    // The mode tabs: each reopens what that mode showed last; «Діаграми» goes back to the last diagram.
    for (const tab of document.querySelectorAll<HTMLButtonElement>("#modes button[data-mode]")) {
      tab.addEventListener("click", () => {
        const mode = tab.dataset["mode"];

        if (mode === "explore") void this.open({ view: "explore", id: this.explorer.current() });
        else if (mode === "blind") void this.open({ view: "blind" });
        else if (mode === "docs") void this.open({ view: "docs", path: this.docs.current() });
        else if (mode === "changes") void this.open({ view: "changes", since: this.changes.current()?.since ?? "" });
        else if (mode === "editor") void this.open({ view: "editor", of: this.editor.view() === "" ? this.lastDiagram : viewOfKey(this.editor.view()) });
        else if (this.lastDiagram) void this.open(this.lastDiagram);
        else {
          this.setMode("diagrams");
          this.active = null;
          history.replaceState(null, "", location.pathname);
          this.status.textContent = "pick a view on the left";
        }
      });
    }

    this.search.addEventListener("input", () => {
      // Typing starts a new search: the usages of the last ID let go of the list.
      if (this.usages) this.clearUsages();
      this.list.setFilter(this.search.value);
      // The code too, not only the views: modules and fns whose ID holds the text, once typing pauses.
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => void this.searchCode(this.search.value.trim()), 250);
    });
    // Enter opens the first item the filter left.
    this.search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = this.list.visibleItems()[0];

      if (first) void this.open(first.query);
    });
    element<HTMLButtonElement>("find-usages").addEventListener("click", () => {
      const id = this.search.value.trim();

      if (id) void this.findUsages(id);
    });
    // The toolbar: zoom, export of the open view (the editor exports the view it holds) and the bundle copy.
    element<HTMLButtonElement>("zoom-in").addEventListener("click", () => this.canvas.zoomAt(1.25));
    element<HTMLButtonElement>("zoom-out").addEventListener("click", () => this.canvas.zoomAt(1 / 1.25));
    element<HTMLButtonElement>("zoom-fit").addEventListener("click", () => this.canvas.fit());
    mountExport(element("toolbar"), () => (this.active === null ? null : this.active.view === "editor" ? this.active.of : isViewQuery(this.active) ? this.active : null), (text) => (this.status.textContent = text));
    const copy = make("button", { text: "Копіювати як пакет", title: "Відкритий вид як пакет keylang у буфер обміну (Ctrl+C): вставте його в редакторі іншого keylang web" });
    copy.type = "button";
    copy.id = "copy-bundle";
    copy.addEventListener("click", () => void this.copyBundle(true));
    element("toolbar").append(copy);
    // How deep an entry point's call tree opens: 2 by default (the server's), deeper on demand.
    this.depth.id = "depth";
    this.depth.title = "Глибина дерева викликів точки входу";
    this.depth.hidden = true;

    for (let n = 1; n <= MAX_DEPTH; n++) {
      const option = make("option", { text: `глибина ${n}` });
      option.value = String(n);
      this.depth.append(option);
    }

    this.depth.addEventListener("change", () => {
      const active = this.active;

      if (active?.view !== "entry") return;
      // The default depth leaves the query without `depth`, so its fragment matches a plain entry link.
      void this.open(this.depth.value === String(DEFAULT_DEPTH) ? { view: "entry", id: active.id } : { view: "entry", id: active.id, depth: this.depth.value });
    });
    element("toolbar").insertBefore(this.depth, element("zoom-out"));
    this.matrixToggle.type = "button";
    this.matrixToggle.id = "matrix-toggle";
    this.matrixToggle.hidden = true;
    this.matrixToggle.addEventListener("click", () => {
      this.matrixMode = document.body.dataset["matrix"] !== "1";

      // The drawing was put off while the matrix stood over it.
      if (this.shownDiagram && !this.showMatrix(this.shownDiagram)) this.showDiagram(this.shownDiagram, false);
    });
    element("toolbar").insertBefore(this.matrixToggle, element("zoom-out"));
    this.systemBar.id = "system-bar";
    this.systemBar.hidden = true;
    element("stage").append(this.systemBar);
    // Ctrl/Cmd+C in the diagrams mode copies the open view as a bundle, unless the
    // focus is in a text field or the person selected text.
    document.addEventListener("keydown", (event) => {
      if (this.mode !== "diagrams" || readOnlyPage() || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c" || event.shiftKey) return;
      const target = event.target;

      if (target instanceof Element && (target.closest("input, textarea, select") || (target instanceof HTMLElement && target.isContentEditable))) return;

      // Text the person selected is theirs to copy.
      if (!(window.getSelection()?.isCollapsed ?? true)) return;
      event.preventDefault();
      void this.copyBundle(false);
    });
    // Back/forward or an edited fragment: open what it names, unless that view is already open.
    window.addEventListener("hashchange", () => {
      const wanted = readHash();

      if (wanted && (this.active === null || keyOf(wanted.query) !== keyOf(this.active))) void this.open(wanted.query, wanted.node);
    });
    document.body.dataset["mode"] = this.mode;
    this.legend();
    this.renderDetails(null);
  }

  /** Loads the list, opens the view the fragment names, then starts polling. */
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

  /** Asks `/api/views` and refills the list when the answer changed; whether it did. */
  private async loadViews(): Promise<boolean> {
    const views = await this.api.views();
    const text = JSON.stringify(views);

    if (text === this.viewsText) return false;
    this.viewsText = text;
    this.views = views;
    this.explorer.setEventsReason(views.eventsReason);
    this.fillList();

    return true;
  }

  /** The list of the mode: every view to draw, or the entry points and events to explore. */
  private fillList(): void {
    if (!this.views) return;
    const changed = this.changes.current();
    // Each mode has its own list: changed files, docs, drawable views, or entry points and events.
    this.items = this.mode === "changes" ? (changed ? changeItems(changed.answer, changed.since) : []) : this.mode === "docs" ? (this.docList ? docItems(this.docList) : []) : this.mode === "diagrams" || this.mode === "editor" ? itemsOf(this.views) : exploreItemsOf(this.views);

    // The code the search found, after the views: in the modes that open a module or a fn.
    if ((this.mode === "diagrams" || this.mode === "explore") && this.codeHits) this.items = [...this.items, ...this.codeHits.items];
    this.list.setItems(this.items);
    this.markList();
  }

  /**
   * The code whose ID holds the search text, listed under «Код · module|fn|type»: a module opens
   * its dependency graph, a fn or type the explorer. A static export has no search: the views only.
   */
  private async searchCode(text: string): Promise<void> {
    // Too short to be useful, or no server to ask: drop any earlier hits.
    if (text.length < 2 || transport().kind === "static") {
      if (this.codeHits) {
        this.codeHits = null;
        this.fillList();
      }

      return;
    }

    try {
      const found = await this.api.search(text);

      // The person typed on while we waited: a newer search will answer, so drop this stale one.
      if (this.search.value.trim() !== text) return;

      const items: ListItem[] = found.hits.map((hit) => {
        const query: PageQuery = hit.kind === "module" ? { view: "module", id: hit.id } : { view: "explore", id: hit.id };

        return { key: `code:${hit.id}`, label: hit.id, hint: hit.layer, group: `Код · ${hit.kind}`, search: hit.id.toLowerCase(), title: [hit.id, hit.file && `${hit.file}:${hit.line ?? ""}`, hit.kind === "module" ? "граф залежностей модуля" : "дерево викликів у досліднику"].filter(Boolean).join("\n"), query };
      });

      this.codeHits = { q: text, items, total: found.total };
      this.fillList();
      this.status.textContent = `«${text}»: ${found.total} у коді${found.total > items.length ? ` (показано ${items.length})` : ""}`;
    } catch {
      // A search that failed leaves the list as it was.
    }
  }

  /** Shows one mode's pane; the list follows the mode. */
  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    document.body.dataset["mode"] = mode;

    for (const tab of document.querySelectorAll<HTMLButtonElement>("#modes button[data-mode]")) tab.setAttribute("aria-pressed", String(tab.dataset["mode"] === mode));
    this.fillList();
  }

  /** The «Карта» list, asked once per entry into the mode; a static or local page asks once at all. */
  private async loadDocs(): Promise<void> {
    if (this.docList && transport().kind !== "server") return;
    const list = await this.api.docs();
    this.docList = list;
    this.docs.setList(list);

    if (this.mode === "docs") this.fillList();
  }

  /** Asks again every few seconds while the tab is visible: a new map, a saved spec or a discovered view shows up without a reload. */
  private poll(): void {
    // Answers a static export wrote, or an analysis of files in memory, do not change.
    if (transport().kind !== "server") return;
    window.setTimeout(async () => {
      // Only the diagrams follow the code live; the other modes ask when opened or refreshed.
      if (!document.hidden && this.mode === "diagrams") {
        try {
          await this.loadViews();
          const query = this.active;

          if (query && isViewQuery(query)) {
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

  /**
   * Opens a query in its mode and records it in the fragment. Every await is followed by a check
   * that `this.active` is still this query, so a slow answer never draws over a newer choice.
   */
  async open(wanted: PageQuery, node: string | null = null): Promise<void> {
    this.active = wanted;
    this.node = node;
    this.setMode(modeOf(wanted));
    const key = keyOf(wanted);
    // The editor marks the view it holds in the list.
    const listKey = wanted.view === "editor" ? (wanted.of ? keyOf(wanted.of) : "") : key;
    this.list.setActive(listKey);
    this.list.reveal(listKey);
    this.writeHash();

    // The other modes hand over to their own pane.
    if (wanted.view === "explore") return this.explorer.show(wanted.id);

    if (wanted.view === "blind") return this.blind.show();

    if (wanted.view === "changes") {
      await this.changes.show(wanted.since);

      if (this.active === wanted) this.fillList();

      return;
    }

    if (wanted.view === "docs") {
      try {
        await this.loadDocs();
      } catch (error) {
        this.status.textContent = explain(error);

        return;
      }

      // The docs list was only just filled: mark and scroll to the open file again.
      this.list.setActive(listKey);
      this.list.reveal(listKey);

      return this.docs.show(wanted.path, wanted.at ?? null);
    }

    if (wanted.view === "editor") return this.openEditor(wanted.of);
    // A drawable view from here on.
    const query: ViewQuery = wanted;
    this.lastDiagram = query;
    // A static export holds each entry point at the default depth only.
    this.depth.hidden = query.view !== "entry" || transport().kind === "static";

    if (query.view === "entry") this.depth.value = query.depth ?? String(DEFAULT_DEPTH);
    this.status.textContent = `loading ${key}…`;

    try {
      const diagram = await this.api.diagram(query);

      if (this.active !== query) return;
      // A fresh open always redraws and fits, even when the answer equals the last one.
      this.diagramText = "";
      this.showDiagram(diagram, false);

      // A module's graph opens on the module itself: its shape marked, its panel shown.
      if (node === null && query.view === "module" && diagram.nodes[0]) node = diagram.nodes[0].id;

      if (node !== null) {
        this.canvas.select(node);
        this.canvas.reveal(node);
      }

      this.pick(diagram.nodes.find((n) => n.id === node) ?? null, false);
    } catch (error) {
      if (this.active === query) this.status.textContent = explain(error);
    }
  }

  /** A view on the editor's canvas «з коду», or an empty canvas. */
  private async openEditor(of: ViewQuery | null): Promise<void> {
    const key = of ? keyOf(of) : "";

    // The editor already holds this view (and maybe unsaved edits): leave it as it is.
    if (key !== "" && key === this.editor.view()) return;

    if (!of) return this.editor.openEmpty();
    this.status.textContent = `loading ${key} into the editor…`;

    try {
      const diagram = await this.api.diagram(of);

      // The person moved on while the diagram loaded.
      if (this.active?.view !== "editor" || !this.active.of || keyOf(this.active.of) !== key) return;
      await this.editor.openDiagram(key, diagram);
    } catch (error) {
      this.status.textContent = explain(error);
    }
  }

  /** The layers view as the matrix when chosen, or when its edges are too many to draw; any other view as drawn. Whether the matrix is shown. */
  private showMatrix(diagram: Diagram): boolean {
    const layers = this.active?.view === "layers";
    // The person's choice wins; with none, the edge count decides.
    const matrix = layers && (this.matrixMode ?? diagram.edges.length > MATRIX_FROM);
    this.matrixToggle.hidden = !layers;
    this.matrixToggle.textContent = matrix ? "схема" : "матриця";

    if (matrix) {
      document.body.dataset["matrix"] = "1";
      renderMatrix(element("matrix"), diagram, (node) => this.pick(node), this.node);
    } else delete document.body.dataset["matrix"];

    return matrix;
  }

  /**
   * «Зміни» → «Діаграма»: the picture of the architecture diff on the canvas, the side panel
   * for its shapes; null puts the canvas away again (the list). The diagrams mode draws its
   * own view anew afterwards: the canvas no longer holds what it drew last.
   */
  private showDiff(diagram: Diagram | null): void {
    if (diagram === null) {
      document.body.dataset["changesView"] = "list";

      return;
    }

    document.body.dataset["changesView"] = "diagram";
    delete document.body.dataset["matrix"];
    this.diagramText = "";
    this.shownDiagram = diagram;
    this.node = null;
    this.canvas.show(diagram, false);
    this.renderDetails(null);
  }

  /** Draws a diagram (or its matrix) and sets the status counts; `keepView` is a poll's refresh that keeps zoom, pan and the panel's node. */
  private showDiagram(diagram: Diagram, keepView: boolean): void {
    const text = JSON.stringify(diagram);
    this.shownDiagram = diagram;

    // Under the matrix nothing is drawn: three hundred edges cost half a second the person does not see.
    if (this.showMatrix(diagram)) {
      this.diagramText = "";
      this.status.textContent = `layers · ${diagram.nodes.length} shapes · ${diagram.edges.length} edges · matrix`;

      return;
    }

    // The same answer as drawn: a poll changes nothing on screen.
    if (text === this.diagramText) return;
    this.diagramText = text;
    this.renderSystemBar(diagram);
    this.canvas.show(diagram, keepView);
    this.canvas.select(this.node);
    this.markCanvas();
    // Counts for the status line: failed and unverified shapes, and holes.
    const counts = { fail: 0, unverified: 0, holes: 0 };

    for (const node of diagram.nodes) {
      if (node.verdict === "fail") counts.fail++;

      if (node.verdict === "unverified") counts.unverified++;

      if (node.kind === "hole") counts.holes++;
    }

    const name = this.active ? keyOf(this.active) : "";
    // A sequence's anchors and lifelines are no shapes or edges a person counts.
    const shapes = diagram.nodes.filter((node) => node.kind !== "anchor").length;
    const edges = diagram.edges.filter((edge) => edge.kind !== "lifeline").length;
    this.status.textContent = diagram.reason ?? `${name} · ${shapes} shapes · ${edges} edges · ✗ ${counts.fail} · ◌ ${counts.unverified} · ? ${counts.holes}`;

    // A refresh keeps the panel on the same node with its new verdicts.
    if (keepView && this.node !== null) {
      const node = diagram.nodes.find((n) => n.id === this.node) ?? null;
      this.renderDetails(node);
    }
  }

  /**
   * The open view as a bundle in the clipboard: a flow (written or discovered)
   * as `flow export` writes it, another view as a flow of its IDs; the shapes
   * where the canvas draws them go into the layout block.
   */
  private async copyBundle(fromButton: boolean): Promise<void> {
    const query = this.active;

    if (query === null || modeOf(query) !== "diagrams") {
      if (fromButton) this.status.textContent = "pick a view first";

      return;
    }

    // The shapes as drawn: canvas key, keylang ID (empty for shapes with no ID) and box, for the layout block.
    const diagram = this.canvas.current();
    const shapes: ClipShape[] = diagram.nodes.map((n) => ({ key: n.id, id: n.ref?.id ?? "", kind: n.kind, label: n.label, layer: n.group ?? null, x: n.x, y: n.y, w: n.w, h: n.h }));

    const edges = diagram.edges.map((e) => {
      const edge: ClipEdge = { from: e.from, to: e.to, kind: e.kind };

      if (e.label) edge.label = e.label;

      return edge;
    });

    try {
      const answer = await this.api.bundle({ view: keyOf(query), shapes, edges });
      // The button may fall back to a dialog when the clipboard is refused; the shortcut only tries the clipboard.
      const way = fromButton ? await writeClipboard(answer.text) : await navigator.clipboard.writeText(answer.text).then(() => "clipboard" as const, () => "refused" as const);
      this.status.textContent = way === "clipboard" ? `copied as a bundle: ${answer.flows.join(", ")} · ${answer.shapes} shape(s) — paste it with Ctrl+V in the editor of another keylang web` : way === "dialog" ? "the bundle is selected in the dialog: Ctrl+C copies it" : "the browser refused the clipboard: «Копіювати як пакет» shows the bundle to copy";
    } catch (error) {
      this.status.textContent = `copy as bundle failed: ${explain(error)}`;
    }
  }

  /** Puts the open query and node in the fragment without a history entry; an unchanged fragment is left alone. */
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

    // The matrix marks the picked layer's row.
    if (document.body.dataset["matrix"] === "1" && this.shownDiagram) renderMatrix(element("matrix"), this.shownDiagram, (next) => this.pick(next), this.node);
  }

  /** A `vscode://` link to a file and line of the repository. */
  private link(file: string, line: number | undefined): HTMLElement {
    return codeLink(this.views?.root, file, line);
  }

  /** The side panel: the picked shape's facts and actions, then the usages block; with neither, the system's notes or a hint. */
  private renderDetails(node: DiagramNode | null): void {
    const body: Node[] = [];

    // The picked shape: a table of its facts, the reason of a hole, its verdicts, then buttons.
    if (node) {
      body.push(make("h2", { text: node.label }));
      const rows: [string, Node | string][] = [["kind", node.component ? `${COMPONENT_NAME.get(node.component) ?? node.component} (${node.component})` : (KIND_NAME.get(node.kind) ?? node.kind)]];

      if (node.tech) rows.push(["tech", node.tech]);

      if (node.lines && node.lines.length > 0) rows.push(["columns", make("pre", { className: "columns", text: node.lines.join("\n") })]);

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

        // Its module's dependencies, the map as a graph: who imports it, what it imports.
        if (node.kind !== "layer" && node.kind !== "hole" && !(this.active?.view === "module" && node.ref?.id === this.active.id)) {
          const graph = make("button", { className: "usages-button", text: `dependencies of the module of ${id}` });
          graph.type = "button";
          graph.id = "node-module";
          graph.addEventListener("click", () => void this.open({ view: "module", id }));
          body.push(graph);
        }

        // A fn or an entry point opens in the explorer: its call tree, both ways.
        if (node.kind === "start" || node.kind === "task" || node.kind === "fn") {
          const explore = make("button", { className: "usages-button", text: `explore the calls of ${id}` });
          explore.type = "button";
          explore.id = "node-explore";
          explore.addEventListener("click", () => void this.open({ view: "explore", id }));
          body.push(explore);
        }
      }
    }

    if (this.usages) body.push(this.usagesBlock(this.usages));

    // The panel keeps its width when empty, so the canvas does not change size (and lose its fit) on the first click.
    if (body.length === 0) body.push(...this.systemNotes());

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

  /** The usages of an ID in the panel: a button per flow or entry point, which opens it and centres the first shape under the ID. */
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

  /** Drops the usages: the list, the canvas and the panel lose their marks. */
  private clearUsages(): void {
    this.usages = null;
    this.markList();
    this.markCanvas();
    this.renderDetails(this.canvas.current().nodes.find((n) => n.id === this.node) ?? null);
  }

  /** Marks the list items of the views the usages found; none without usages. */
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

  /** Marks the shapes whose ID is the usages' ID or under it. */
  private markCanvas(): void {
    const id = this.usages?.id;
    this.canvas.markUsed(id === undefined ? () => false : (node) => covers(id, node.ref?.id));
  }

  /** The views of the open system (Схема · ER · each sequence) and its notes, over the canvas; hidden for any other view. */
  private renderSystemBar(diagram: Diagram): void {
    const system = diagram.system;
    const active = this.active;
    this.systemBar.hidden = !system || active === null || !isViewQuery(active);
    this.legend(system !== undefined);

    // BPMN and draw.io export flows and code views; a system has neither export nor bundle.
    if (system) document.body.dataset["system"] = "1";
    else delete document.body.dataset["system"];

    if (this.node === null) this.renderDetails(null);

    if (!system || active === null) return;
    // One button per view of the system: the scheme, ER when it has tables, then each sequence.
    const views: ViewQuery[] = [{ view: "system", name: system.name }, ...(system.tables > 0 ? [{ view: "er" as const, name: system.name }] : []), ...system.sequences.map((seq): ViewQuery => ({ view: "sequence", name: system.name, seq }))];
    const switcher = make("div", { className: "system-views" });

    for (const query of views) {
      const text = query.view === "system" ? "Схема" : query.view === "er" ? "ER" : query.view === "sequence" ? `↧ ${query.seq}` : "";
      const button = make("button", { text, title: query.view === "sequence" ? `sequence ${query.seq}` : query.view === "er" ? "таблиці й зовнішні ключі" : "компоненти, зони й зв'язки" });
      button.type = "button";
      button.setAttribute("aria-pressed", String(keyOf(query) === keyOf(active)));
      button.addEventListener("click", () => void this.open(query));
      switcher.append(button);
    }

    this.systemBar.replaceChildren(switcher);
  }

  /** The interview notes of the open system, by kind: the panel with no shape picked. */
  private systemNotes(): Node[] {
    const system = this.shownDiagram?.system;

    if (!system || this.mode !== "diagrams") return [];
    const out: Node[] = [make("h2", { text: system.name === CODE_SYSTEM ? "Система з коду" : `Система ${system.name}` })];

    if (system.file) out.push(make("p", {}, this.link(system.file, undefined)));

    if (system.name === CODE_SYSTEM) out.push(make("p", { className: "empty", text: "Виведено з коду: шари з точками входу — сервіси й воркери, імпортовані драйвери — сховища, черги й зовнішні сервіси. `keylang system discover` друкує це як `# system`." }));

    // Notes in a fixed order of kinds, so the panel reads the same every time.
    for (const kind of ["requirement", "nfr", "estimate", "tradeoff", "question"]) {
      const own = system.notes.filter((note) => note.kind === kind);

      if (own.length === 0) continue;
      const list = make("ul", { className: "system-notes" });

      for (const note of own) list.append(make("li", { text: note.text }));
      out.push(make("h3", { text: NOTE_NAME.get(kind) ?? kind }), list);
    }

    out.push(make("p", { className: "empty", text: "Клацніть фігуру: її технологія, код і вердикти зв'язків." }));

    return out;
  }

  /** The legend under the canvas: the verdict colours, then the shapes of a flow or of a system. */
  private legend(system = false): void {
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
    rows.push(make("div", { className: "shapes", text: system ? "👤 клієнт · ☁ CDN/зовнішній · ⬡ LB/gateway · ▢ сервіс · ⚙ воркер · ⛁ БД · ⚡ кеш · ☰ черга · 🪣 сховище · 🔍 пошук; пунктир — асинхронно" : "○ start · ▢ task · ◇× gateway · ◇+ parallel · ◎ event · ⏱ timer · ┆▢┆ external" }));
    legend.replaceChildren(...rows);
  }
}

/** The page over its transport: `keylang web` by default, the answers of a static export, or a folder analysed in this tab. */
async function main(): Promise<void> {
  const source = document.body.dataset["source"];

  if (source === "static") useTransport(new StaticTransport(Number(document.body.dataset["shards"] ?? "1")));

  if (source === "local") useTransport(await openLocal());
  // The browser tests ask the page's transport directly, as the page does.
  Object.assign(window, { keylangTransport: transport() });
  const page = new Page();
  void page.start();
  // «Огляд»: the project tour over the canvas (business-flows/15).
  mountTour();
  // «Новий проєкт»: a project drawn before its code, when the root has no keylang.json (business-flows/29).
  void mountGreenfield(page.editor, (text) => (element("status").textContent = text));
}

void main();
