// «Огляд» of the diagram page (business-flows/15): the project tour of
// `GET /api/tour` — the data of `keylang tour --json` — over the canvas,
// in the order of the CLI's page: what the system is, layers and modules,
// business processes with links to their diagrams, entry points and events,
// integrations, blind spots and logic in data, where to start reading. A
// link to a diagram sets the fragment the page already follows and closes
// the tour; `#tour` opens it on load. Read-only, with the page's token.

import { ApiError, takeToken } from "./api.ts";

interface TourFlow {
  name: string;
  description: string | null;
  entry: { kind: string; label: string };
  file: string;
  inView: boolean;
  link: string;
}

/** The parts of `/api/tour` the tab draws; the rest of the JSON is ignored. */
interface Tour {
  reason?: string;
  system: { name: string | null; brief: string | null; source: string | null; languages: string[]; files: number; fns: number; entries: number };
  layers: { name: string; brief: string | null; files: number; fns: number; deps: { in: number; out: number; packages: number }; top: { id: string; fns: number; in: number; out: number }[] }[];
  processes: { source: string; domains: { name: string; processes: { name: string; description: string | null; provenance?: { agent: string; date: string }; flows: TourFlow[] }[] }[]; specified: { name: string; file: string; line: number; link: string }[] };
  entries: { total: number; kinds: { kind: string; count: number; labels: string[] }[] };
  events: { events: { id: string; publishers: string[]; subscribers: string[] }[]; note: string | null };
  integrations: { outgoing: { id: string; label: string; sites: number; hosts: string[]; reachedFrom: number }[]; webhooks: { kind: string; label: string; file: string; line: number }[]; queues: { publishers: number; consumers: number; pairs: number } };
  blindSpots: { reach: { fns: number; reachable: number; share: number; entries: number }; orphans: number; holes: { total: number; modules: { module: string; holes: number; reason: string; read: string }[] }; dataLogic: { total: number; signals: { id: string; label: string; count: number; sites: { file: string; line: number; in: string | null }[] }[] } };
  startHere: { id: string; file: string; line: number; flows: number; callers: number; brief: string | null }[];
}

const STYLE = `
#tour-tab { margin-right: 6px; border: 1px solid #b0bec5; border-radius: 4px; background: #ffffff; cursor: pointer; height: 26px; padding: 0 10px; }
#tour-tab.active { background: #cfe3f7; border-color: #1565c0; }
#tour { position: absolute; inset: 0; overflow: auto; background: #ffffff; padding: 12px 20px 40px; z-index: 5; line-height: 1.45; }
#tour[hidden] { display: none; }
#tour h1 { font-size: 18px; margin: 0 0 6px; }
#tour h2 { font-size: 15px; margin: 18px 0 6px; border-bottom: 1px solid #eceff1; padding-bottom: 3px; }
#tour h3 { font-size: 13px; margin: 10px 0 4px; color: #37474f; }
#tour p, #tour ul, #tour ol { margin: 4px 0; }
#tour .muted { color: #607d8b; }
#tour code { font: 12px ui-monospace, monospace; }
#tour a { color: #1565c0; }
#tour table { border-collapse: collapse; margin: 4px 0; }
#tour td, #tour th { border-bottom: 1px solid #eceff1; padding: 2px 10px 2px 0; text-align: left; }
`;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function code(text: string): HTMLElement {
  return make("code", text);
}

function item(...parts: (Node | string)[]): HTMLLIElement {
  const li = make("li");
  li.append(...parts);
  return li;
}

/** A link to a diagram of this page: the fragment changes, the page opens the view, the tour closes. */
function diagramLink(href: string, close: () => void): HTMLAnchorElement {
  const a = make("a", "diagram");
  a.href = href;
  a.addEventListener("click", (event) => {
    event.preventDefault();
    close();
    location.hash = href.slice(href.indexOf("#") + 1);
  });
  return a;
}

function render(tour: Tour, close: () => void): Node[] {
  const out: Node[] = [];
  const list = (items: HTMLLIElement[], ordered = false): HTMLElement => {
    const node = make(ordered ? "ol" : "ul");
    node.append(...items);
    return node;
  };
  const { system } = tour;
  out.push(make("h1", `Огляд проєкту${system.name ? `: ${system.name}` : ""}`));
  out.push(make("p", "A view over the current snapshot (`keylang tour`): no spec, no model; `keylang tour --out keylang/tour.md` saves the same page.", "muted"));

  out.push(make("h2", "1. What the system is"));
  out.push(make("p", system.brief === null ? "The repository says nothing about itself: no README paragraph, no manifest description." : `${system.brief} (${system.source ?? ""})`));
  out.push(make("p", `${system.languages.join(", ") || "—"} · ${system.files} file(s) · ${system.fns} fn · ${system.entries} entry point(s)`, "muted"));

  out.push(make("h2", "2. Layers and modules"));
  for (const layer of tour.layers) {
    out.push(make("h3", `${layer.name} — ${layer.files} file(s), ${layer.fns} fn, deps in ${layer.deps.in} · out ${layer.deps.out} · packages ${layer.deps.packages}`));
    if (layer.brief) out.push(make("p", layer.brief));
    if (layer.top.length > 0) {
      const table = make("table");
      const head = make("tr");
      for (const name of ["module", "fns", "in", "out"]) head.append(make("th", name));
      table.append(head);
      for (const module of layer.top) {
        const row = make("tr");
        const id = make("td");
        id.append(code(module.id));
        row.append(id, make("td", String(module.fns)), make("td", String(module.in)), make("td", String(module.out)));
        table.append(row);
      }
      out.push(table);
    }
  }

  out.push(make("h2", "3. Business processes"));
  if (tour.processes.source === "discovered") out.push(make("p", "No business processes named yet (`keylang flows discover --names`): the discovered flows by layer.", "muted"));
  if (tour.processes.source === "none") out.push(make("p", "No entry point to draft a flow from.", "muted"));
  for (const domain of tour.processes.domains) {
    out.push(make("h3", domain.name));
    for (const process of domain.processes) {
      const flows = process.flows.map((flow) => item(make("b", flow.name), ` — ${flow.entry.kind} `, code(flow.entry.label), flow.description ? ` · ${flow.description} · ` : " · ", diagramLink(flow.link, close), " · ", code(flow.file), flow.inView ? "" : " (not in the view yet: `keylang flows discover`)"));
      const head = make("p");
      head.append(make("b", process.name));
      if (process.description) head.append(` — ${process.description}`);
      if (process.provenance) head.append(make("span", ` (model ${process.provenance.agent}, ${process.provenance.date})`, "muted"));
      out.push(head, list(flows));
    }
  }
  out.push(make("h3", `Hand-written flows: ${tour.processes.specified.length}`));
  out.push(list(tour.processes.specified.map((flow) => item(make("b", flow.name), " · ", diagramLink(flow.link, close), " · ", code(`${flow.file}:${flow.line}`)))));

  out.push(make("h2", "4. Entry points and events"));
  out.push(list(tour.entries.kinds.map((kind) => item(`${kind.kind}: ${kind.count} — `, ...kind.labels.flatMap((label, i) => (i === 0 ? [code(label)] : [", ", code(label)]))))));
  if (tour.events.note) out.push(make("p", tour.events.note, "muted"));
  out.push(list(tour.events.events.map((event) => item(code(event.id), `: published by ${event.publishers.join(", ") || "—"}; subscribers ${event.subscribers.join(", ") || "—"}`))));

  out.push(make("h2", "5. Integrations"));
  out.push(list(tour.integrations.outgoing.map((integration) => item(make("b", integration.id), ` (${integration.label}) · ${integration.sites} call site(s)${integration.hosts.length > 0 ? ` · ${integration.hosts.join(", ")}` : ""} · reached from ${integration.reachedFrom} entry point(s)`))));
  out.push(make("p", `Incoming webhooks: ${tour.integrations.webhooks.length} · queues: ${tour.integrations.queues.publishers} publisher(s), ${tour.integrations.queues.consumers} consumer(s)`, "muted"));

  out.push(make("h2", "6. Blind spots and logic in data"));
  const blind = tour.blindSpots;
  out.push(make("p", `${blind.reach.reachable} of ${blind.reach.fns} fn reachable from ${blind.reach.entries} entry point(s) (${(blind.reach.share * 100).toFixed(1)} %); ${blind.orphans} orphan fn; ${blind.holes.total} hole(s).`));
  out.push(list(blind.holes.modules.map((module) => item(code(module.module), ` — ${module.holes} hole(s), ${module.reason} · read `, code(module.read)))));
  out.push(make("h3", `Logic in data — read by hand: ${blind.dataLogic.total}`));
  out.push(list(blind.dataLogic.signals.map((signal) => item(`${signal.label} — ${signal.count} · read `, ...signal.sites.flatMap((site, i) => [...(i > 0 ? [", "] : []), code(`${site.file}:${site.line}`)])))));

  out.push(make("h2", "7. Where to start reading"));
  out.push(list(tour.startHere.map((fn) => item(code(fn.id), ` — ${fn.file}:${fn.line} · ${fn.flows} flow(s), ${fn.callers} caller(s)${fn.brief ? ` · ${fn.brief}` : ""}`)), true));
  return out;
}

/** `#tour` (also `#tour=`, as the page leaves it after taking the token from `#t=…&tour`). */
const tourHash = (): boolean => /^#tour=?$/.test(location.hash);

/** Puts the «Огляд» tab in the toolbar and the tour over the canvas; `#tour` opens it at once. */
export function mountTour(): void {
  const toolbar = document.getElementById("toolbar");
  const stage = document.getElementById("stage");
  if (!toolbar || !stage) return;
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
  const tab = make("button", "Огляд");
  tab.type = "button";
  tab.id = "tour-tab";
  tab.title = "The project tour: what the system is, processes, entry points, integrations, blind spots, where to start reading";
  toolbar.prepend(tab);
  const panel = make("section");
  panel.id = "tour";
  panel.hidden = true;
  stage.append(panel);
  const token = takeToken();
  const close = (): void => {
    panel.hidden = true;
    tab.classList.remove("active");
  };
  const open = async (): Promise<void> => {
    panel.hidden = false;
    tab.classList.add("active");
    if (!tourHash()) history.replaceState(null, "", `${location.pathname}#tour`);
    panel.replaceChildren(make("p", "loading the tour…", "muted"));
    try {
      const response = await fetch("/api/tour", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new ApiError(response.status, (await response.text()).trim() || response.statusText);
      const tour = (await response.json()) as Tour;
      panel.replaceChildren(...(tour.reason ? [make("p", tour.reason)] : render(tour, close)));
    } catch (error) {
      const text = error instanceof ApiError && error.status === 403 ? "No access: open the URL printed by `keylang web` (it carries the access token)." : error instanceof Error ? error.message : String(error);
      panel.replaceChildren(make("p", text));
    }
  };
  tab.addEventListener("click", () => (panel.hidden ? void open() : close()));
  // Another view chosen in the list or by a link closes the tour.
  window.addEventListener("hashchange", () => {
    if (!tourHash()) close();
  });
  document.getElementById("views")?.addEventListener("click", close);
  if (tourHash()) void open();
}
