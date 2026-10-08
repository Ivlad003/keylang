// `keylang tour` (business-flows/15): one page for a newcomer and for an
// agent — what the system is, its layers and modules, the business
// processes with their diagrams, entry points and events, integrations,
// blind spots and «logic in data», and where to start reading. A view over
// the snapshot (ADR 0014): no new fact, only what the map, `flows discover`
// (with its names README), `coverage` and `integrations` already compute,
// put together in a fixed order. No model: a process description a model
// wrote is shown with its provenance. The same snapshot, specs and saved
// files give the same bytes, in any language the snapshot holds.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isTestFile } from "./call-sites.ts";
import { specPath, type Config } from "./config.ts";
import { coverageReport, findDataLogic, loadDataLogic, type CoverageReport } from "./coverage-report.ts";
import { flowIds } from "./diagram.ts";
import { DISCOVERED_DIR, discoverFlows, proseLine, specifiedTriggers, type DiscoveredFlow } from "./discover.ts";
import { readProcesses } from "./discover-names.ts";
import { EXTERNAL } from "./external-ids.ts";
import { findIntegrations, loadIntegrations, type IntegrationsReport } from "./integrations.ts";
import type { AnalysisSnapshot, EntryKind } from "./snapshot.ts";
import type { SpecIR } from "./spec-ir.ts";
import { compareText } from "./span.ts";

/** The first line of a tour `--out` writes. */
export const TOUR_MARK = "<!-- keylang:generated — не редагувати, `keylang tour` -->";

/** How many modules of a layer, labels of an entry kind, holes, data signals and fns the tour names. */
const TOP_MODULES = 8;
const TOP_LABELS = 5;
const TOP_BLIND = 5;
const SITES_TO_READ = 3;
const START_HERE = 10;

/** The domain of the flows no process names (business processes) or of all of them (none named yet). */
const OTHER_FLOWS = "Other flows";
const DISCOVERED_FLOWS = "Discovered flows by layer";

export interface TourFlow {
  name: string;
  /** The offline description of `flows discover` (doc comments); null without one. */
  description: string | null;
  trigger: string;
  entry: { kind: EntryKind; label: string };
  layer: string;
  /** The view's file, relative to the root: `<dir>/flows-discovered/<layer>.md`. */
  file: string;
  /** The view on disk has the flow; false until `keylang flows discover` writes it. */
  inView: boolean;
  /** The diagram on the `keylang web` page. */
  link: string;
  steps: number;
  holes: number;
}

export interface TourProcess {
  name: string;
  description: string | null;
  /** Who wrote the description: the model of `flows discover --names` and the date. Absent for the code's own words. */
  provenance?: { agent: string; date: string };
  flows: TourFlow[];
}

export interface Tour {
  snapshotId: string;
  system: {
    name: string | null;
    brief: string | null;
    source: string | null;
    languages: string[];
    files: number;
    fns: number;
    entries: number;
  };
  layers: {
    name: string;
    /** The README of the layer's directory, else the doc of its index module. */
    brief: string | null;
    files: number;
    fns: number;
    /** Module nodes (classes aside). */
    modules: number;
    /** Imports between modules: from other layers into this one, from this one into others, into packages. */
    deps: { in: number; out: number; packages: number };
    /** The modules with most fns (then most dependents, then ID), with their imports in and out. */
    top: { id: string; file: string | null; fns: number; in: number; out: number }[];
  }[];
  processes: {
    /** `names`: the README of `flows discover --names`; `discovered`: the discovered flows by layer; `none`: no entry point to draft from. */
    source: "names" | "discovered" | "none";
    domains: { name: string; processes: TourProcess[] }[];
    /** Hand-written flows, in spec order. */
    specified: { name: string; file: string; line: number; trigger: string | null; link: string }[];
  };
  entries: {
    total: number;
    /** By kind, in the snapshot's order, with the first labels. */
    kinds: { kind: EntryKind; count: number; labels: string[] }[];
  };
  events: {
    events: { id: string; publishers: string[]; subscribers: string[] }[];
    /** Why the section is empty; null when it is not. */
    note: string | null;
  };
  integrations: {
    outgoing: { id: string; label: string; kind: string; sites: number; hosts: string[]; reachedFrom: number; imports: number }[];
    webhooks: { kind: string; label: string; id: string; file: string; line: number; via: string }[];
    queues: { publishers: number; consumers: number; pairs: number; topics: string[] };
  };
  blindSpots: {
    reach: CoverageReport["reach"];
    orphans: number;
    unflowed: number;
    holes: { total: number; modules: { module: string; file: string | null; holes: number; reason: string; read: string }[] };
    dataLogic: { total: number; signals: { id: string; label: string; count: number; sites: { file: string; line: number; in: string | null }[] }[] };
  };
  startHere: { id: string; file: string; line: number; flows: number; callers: number; brief: string | null; flowNames: string[] }[];
}

/** What the tour reads besides the snapshot: the config, the hand-written specs. */
export interface TourInputs {
  config: Config;
  snapshot: AnalysisSnapshot;
  spec: SpecIR;
}

/** The diagram of a view on the `keylang web` page. */
function diagramLink(view: "flow" | "discovered", name: string): string {
  return `/diagrams#${new URLSearchParams({ view, name }).toString()}`;
}

function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/** The file module a node counts under: itself or its nearest ancestor that is a module and no class. */
function moduleOf(snapshot: AnalysisSnapshot, id: string): string | null {
  let at: string | null = id;
  while (at !== null) {
    const node = snapshot.nodes[at];
    if (node !== undefined && node.kind === "module" && node.class !== true) return at;
    const dot = at.lastIndexOf(".");
    at = dot === -1 ? null : at.slice(0, dot);
  }
  return null;
}

/** The repository's layers in `keylang.json` order, then the others by name; packages left out. */
function layerOrder(snapshot: AnalysisSnapshot): string[] {
  const configured = Object.keys(snapshot.manifest.config.layers).filter((layer) => snapshot.nodes[layer]?.kind === "layer");
  const own = new Set(configured);
  const others = Object.keys(snapshot.nodes)
    .filter((id) => snapshot.nodes[id]?.kind === "layer" && id !== EXTERNAL && !own.has(id))
    .sort(compareText);
  return [...configured, ...others];
}

function layersOf(snapshot: AnalysisSnapshot): Tour["layers"] {
  const order = layerOrder(snapshot);
  const stats = new Map(order.map((layer) => [layer, { files: new Set<string>(), fns: 0, modules: 0, in: 0, out: 0, packages: 0 }]));
  const moduleFns = new Map<string, number>();
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    const layer = stats.get(node.layer);
    if (layer === undefined || node.kind === "layer") continue;
    if (node.file !== null) layer.files.add(node.file);
    if (node.kind === "module" && node.class !== true) layer.modules++;
    if (node.kind === "fn") {
      layer.fns++;
      const module = moduleOf(snapshot, id);
      if (module !== null) moduleFns.set(module, (moduleFns.get(module) ?? 0) + 1);
    }
    if (node.kind === "module" && node.class !== true) {
      for (const dep of node.deps ?? []) {
        const target = snapshot.nodes[dep]?.layer;
        if (target === undefined || target === node.layer) continue;
        if (target === EXTERNAL) layer.packages++;
        else {
          layer.out++;
          const other = stats.get(target);
          if (other !== undefined) other.in++;
        }
      }
    }
  }
  return order.map((name) => {
    const s = stats.get(name)!;
    const top = Object.entries(snapshot.nodes)
      .filter(([, node]) => node.layer === name && node.kind === "module" && node.class !== true)
      .map(([id, node]) => ({ id, file: node.file, fns: moduleFns.get(id) ?? 0, in: node.dependents?.length ?? 0, out: node.deps?.length ?? 0 }))
      .sort((a, b) => b.fns - a.fns || b.in - a.in || compareText(a.id, b.id))
      // A layer without fns (files `outside` the architecture, scripts no layer names) has no module worth reading first.
      .slice(0, s.fns === 0 ? 0 : TOP_MODULES);
    return { name, brief: snapshot.nodes[name]?.doc ?? null, files: s.files.size, fns: s.fns, modules: s.modules, deps: { in: s.in, out: s.out, packages: s.packages }, top };
  });
}

function processesOf(inputs: TourInputs, flows: readonly DiscoveredFlow[], specDir: string): Tour["processes"] {
  const { config, spec } = inputs;
  const viewDir = join(config.root, specDir, DISCOVERED_DIR);
  const views = new Map<string, string>();
  const viewText = (file: string): string => {
    if (!views.has(file)) views.set(file, readOrNull(join(viewDir, file)) ?? "");
    return views.get(file)!;
  };
  const tourFlow = (flow: DiscoveredFlow): TourFlow => ({
    name: flow.name,
    description: flow.description ?? null,
    trigger: flow.trigger,
    entry: flow.entry,
    layer: flow.layer,
    file: specPath(specDir, `${DISCOVERED_DIR}/${flow.file}`),
    inView: viewText(flow.file).split("\n").includes(`# flow ${flow.name}`),
    link: diagramLink("discovered", flow.name),
    steps: flow.steps.length,
    holes: flow.holes,
  });
  const byName = new Map(flows.map((flow) => [flow.name, flow]));
  const byLayer = (list: readonly DiscoveredFlow[]): TourProcess[] => {
    const layers = [...new Set(list.map((flow) => flow.layer))].sort(compareText);
    return layers.map((layer) => ({ name: layer, description: null, flows: list.filter((flow) => flow.layer === layer).sort((a, b) => compareText(a.name, b.name)).map(tourFlow) }));
  };
  const specified = (() => {
    const seen = new Set<string>();
    const out: Tour["processes"]["specified"] = [];
    for (const flow of spec.flows) {
      if (seen.has(flow.name)) continue;
      seen.add(flow.name);
      out.push({ name: flow.name, file: flow.file, line: flow.span.start.line, trigger: flow.triggers[0]?.target.target ?? null, link: diagramLink("flow", flow.name) });
    }
    return out;
  })();

  const saved = existsSync(viewDir) ? readProcesses(config.root, specDir) : [];
  if (saved.length === 0) {
    return { source: flows.length === 0 ? "none" : "discovered", domains: flows.length === 0 ? [] : [{ name: DISCOVERED_FLOWS, processes: byLayer(flows) }], specified };
  }
  // The README's order: domains as `renderProcesses` writes them, processes by name.
  const domains: Tour["processes"]["domains"] = [];
  const named = new Set<string>();
  for (const process of saved) {
    let domain = domains.find((d) => d.name === process.domain);
    if (domain === undefined) {
      domain = { name: process.domain, processes: [] };
      domains.push(domain);
    }
    const own = process.flows.flatMap((name) => {
      const flow = byName.get(name);
      if (flow === undefined) return [];
      named.add(name);
      return [tourFlow(flow)];
    });
    domain.processes.push({ name: process.name, description: process.description === "" ? null : process.description, ...(process.agent !== "" ? { provenance: { agent: process.agent, date: process.date } } : {}), flows: own });
  }
  const rest = flows.filter((flow) => !named.has(flow.name));
  if (rest.length > 0) domains.push({ name: OTHER_FLOWS, processes: byLayer(rest) });
  return { source: "names", domains, specified };
}

function entriesOf(snapshot: AnalysisSnapshot): Tour["entries"] {
  const kinds: Tour["entries"]["kinds"] = [];
  for (const entry of snapshot.entries) {
    let kind = kinds.find((k) => k.kind === entry.kind);
    if (kind === undefined) {
      kind = { kind: entry.kind, count: 0, labels: [] };
      kinds.push(kind);
    }
    kind.count++;
    if (kind.labels.length < TOP_LABELS && !kind.labels.includes(entry.label)) kind.labels.push(entry.label);
  }
  return { total: snapshot.entries.length, kinds };
}

/** Event nodes, should the snapshot hold them (a framework adapter's events): who dispatches each, and who listens. */
function eventsOf(snapshot: AnalysisSnapshot): Tour["events"] {
  const events = Object.entries(snapshot.nodes)
    .filter(([, node]) => (node.kind as string) === "event")
    .map(([id, node]) => ({ id, publishers: [...(node.callers ?? node.dependents ?? [])].sort(compareText), subscribers: [...(node.calls ?? node.deps ?? [])].sort(compareText) }))
    .sort((a, b) => compareText(a.id, b.id));
  return { events, note: events.length > 0 ? null : "no event nodes in the snapshot: a framework's events (events.xml, dispatch, signals) need its adapter (business-flows/08)" };
}

function integrationsOf(report: IntegrationsReport): Tour["integrations"] {
  return {
    outgoing: report.outgoing.map((integration) => ({
      id: integration.id,
      label: integration.label,
      kind: integration.kind,
      sites: integration.sites.length,
      hosts: [...new Set(integration.sites.flatMap((site) => (site.host === null ? [] : [site.host])))].sort(compareText),
      reachedFrom: new Set(integration.sites.flatMap((site) => site.reachedFrom.map((reach) => reach.id))).size,
      imports: integration.imports.length,
    })),
    webhooks: report.webhooks.map((hook) => ({ kind: hook.kind, label: hook.label, id: hook.id, file: hook.file, line: hook.line, via: hook.via })),
    queues: {
      publishers: report.queues.publishers.length,
      consumers: report.queues.consumers.length,
      pairs: report.queues.pairs.length,
      topics: [...new Set(report.queues.publishers.flatMap((publisher) => (publisher.topic === null ? [] : [publisher.topic])))].sort(compareText),
    },
  };
}

function blindSpotsOf(report: CoverageReport): Tour["blindSpots"] {
  const signals = [...report.dataLogic.signals]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_BLIND)
    .map((signal) => ({ ...signal, sites: report.dataLogic.sites.filter((site) => site.signal === signal.id).slice(0, SITES_TO_READ).map((site) => ({ file: site.file, line: site.line, in: site.in })) }));
  return {
    reach: report.reach,
    orphans: report.orphans.length,
    unflowed: report.unflowed.length,
    holes: {
      total: report.holes.total,
      modules: report.holes.modules.slice(0, TOP_BLIND).map((module) => {
        const reason = module.reasons[0];
        return { module: module.module, file: module.file, holes: module.holes, reason: reason === undefined ? "" : `${reason.kind}: ${reason.reason}`, read: module.file ?? module.module };
      }),
    },
    dataLogic: { total: report.dataLogic.sites.length, signals },
  };
}

/**
 * The fns to read first: by the flows (hand-written and discovered) that name
 * them, then by their callers, then by ID; packages and test files left out.
 */
function startHereOf(snapshot: AnalysisSnapshot, spec: SpecIR, flows: readonly DiscoveredFlow[]): Tour["startHere"] {
  const through = new Map<string, string[]>();
  const add = (id: string, flow: string): void => {
    const names = through.get(id) ?? [];
    if (!names.includes(flow)) names.push(flow);
    through.set(id, names);
  };
  for (const flow of spec.flows) for (const id of flowIds(flow)) add(id, flow.name);
  for (const flow of flows) for (const id of flow.steps) add(id, flow.name);
  return Object.entries(snapshot.nodes)
    .filter(([, node]) => node.kind === "fn" && node.layer !== EXTERNAL && node.file !== null && !isTestFile(node.file))
    .map(([id, node]) => ({ id, file: node.file!, line: node.line ?? 1, flows: through.get(id)?.length ?? 0, callers: node.callers?.length ?? 0, brief: node.doc, flowNames: [...(through.get(id) ?? [])].sort(compareText).slice(0, 3) }))
    .sort((a, b) => b.flows - a.flows || b.callers - a.callers || compareText(a.id, b.id))
    .slice(0, START_HERE);
}

/**
 * The tour over a snapshot, the hand-written specs and the saved files beside
 * them (the discovered view and its names README). Reads the analysed files'
 * facts, as `coverage` and `integrations` do; writes nothing.
 */
export async function buildTour(inputs: TourInputs): Promise<Tour> {
  const { config, snapshot, spec } = inputs;
  const specDir = config.dir;
  const specified = specifiedTriggers(spec.flows);
  const flows = discoverFlows(snapshot, specified).flows;
  const signals = loadDataLogic();
  const sites = await findDataLogic(config, snapshot, signals);
  const viewDir = join(config.root, specDir, DISCOVERED_DIR);
  const coverage = coverageReport(snapshot, specified, signals, sites, (file) => readOrNull(join(viewDir, file)));
  const integrations = await findIntegrations(config, snapshot, loadIntegrations(), specified);
  const nodes = Object.values(snapshot.nodes);
  return {
    snapshotId: snapshot.snapshotId,
    system: {
      name: snapshot.system.name,
      brief: snapshot.system.brief,
      source: snapshot.system.source,
      languages: [...snapshot.manifest.config.languages],
      files: new Set(nodes.filter((node) => node.layer !== EXTERNAL && node.file !== null).map((node) => node.file)).size,
      fns: nodes.filter((node) => node.kind === "fn" && node.layer !== EXTERNAL).length,
      entries: snapshot.entries.length,
    },
    layers: layersOf(snapshot),
    processes: processesOf(inputs, flows, specDir),
    entries: entriesOf(snapshot),
    events: eventsOf(snapshot),
    integrations: integrationsOf(integrations),
    blindSpots: blindSpotsOf(coverage),
    startHere: startHereOf(snapshot, spec, flows),
  };
}

const percent = (share: number): string => `${(share * 100).toFixed(1)} %`;
const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;
/** One table cell: no pipe or line break. */
const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\s+/g, " ");

/** The tour as one Markdown page, the seven sections in order. Ends with a newline. */
export function tourMarkdown(tour: Tour): string {
  const out: string[] = [];
  const { system } = tour;
  out.push(`# Project tour${system.name === null ? "" : `: ${system.name}`}`, "");
  out.push("A view over the current snapshot (`keylang tour`): nothing here is a spec, and `check` does not read it. Without a model; a description a model wrote names its model.", "");

  out.push("## 1. What the system is", "");
  out.push(system.brief === null ? "The repository says nothing about itself: no README paragraph and no manifest `description`." : `${proseLine(system.brief)} (${system.source})`, "");
  out.push(`- languages: ${system.languages.length > 0 ? system.languages.join(", ") : "—"}`);
  out.push(`- ${system.files} file(s), ${system.fns} fn, ${system.entries} entry point(s), ${tour.layers.length} layer(s)`);
  for (const layer of tour.layers) out.push(`- ${code(layer.name)}: ${layer.brief === null ? "no README in the layer's directory, no doc on its index module" : proseLine(layer.brief)}`);
  out.push("");

  out.push("## 2. Layers and modules", "");
  out.push("Size in files and fns; coupling as imports between modules: in from other layers, out to other layers, into packages.", "");
  for (const layer of tour.layers) {
    out.push(`### ${layer.name} — ${layer.files} file(s), ${layer.fns} fn, deps in ${layer.deps.in} · out ${layer.deps.out} · packages ${layer.deps.packages}`, "");
    if (layer.brief !== null) out.push(proseLine(layer.brief), "");
    if (layer.top.length === 0) {
      out.push(layer.fns === 0 ? "No fn: nothing here to read first." : "No module.", "");
      continue;
    }
    out.push("| module | file | fns | in | out |", "|---|---|---:|---:|---:|");
    for (const module of layer.top) out.push(`| ${code(module.id)} | ${cell(module.file ?? "—")} | ${module.fns} | ${module.in} | ${module.out} |`);
    if (layer.modules > layer.top.length) out.push(`| … ${layer.modules - layer.top.length} more | | | | |`);
    out.push("");
  }

  out.push("## 3. Business processes", "");
  const { processes } = tour;
  if (processes.source === "none") out.push("No entry point to draft a flow from: see section 4.", "");
  else if (processes.source === "discovered") out.push("No business processes named yet (`keylang flows discover --names` asks a model to group the flows): the discovered flows by layer, with the words of their doc comments.", "");
  else out.push("Business processes as `keylang flows discover --names` saved them, domain → process → flows.", "");
  const unwritten = processes.domains.some((domain) => domain.processes.some((p) => p.flows.some((flow) => !flow.inView)));
  if (unwritten) out.push("Some flows are not in the view yet: `keylang flows discover` writes their files.", "");
  for (const domain of processes.domains) {
    out.push(`### ${domain.name}`, "");
    for (const process of domain.processes) {
      out.push(`#### ${process.name}`, "");
      if (process.description !== null) out.push(`${proseLine(process.description)}${process.provenance === undefined ? "" : ` (model ${process.provenance.agent}, ${process.provenance.date})`}`, "");
      for (const flow of process.flows) {
        const parts = [`${flow.entry.kind} ${code(flow.entry.label)}`, ...(flow.description === null ? [] : [proseLine(flow.description)]), `[diagram](${flow.link})`, code(flow.file)];
        out.push(`- **${flow.name}** — ${parts.join(" · ")}`);
      }
      if (process.flows.length === 0) out.push("- no flow of it is discovered in this snapshot");
      out.push("");
    }
  }
  out.push(`### Hand-written flows: ${processes.specified.length}`, "");
  for (const flow of processes.specified) out.push(`- **${flow.name}** · trigger ${flow.trigger === null ? "—" : code(flow.trigger)} · [diagram](${flow.link}) · ${code(`${flow.file}:${flow.line}`)}`);
  if (processes.specified.length === 0) out.push("None yet: `keylang flows adopt <name>` proposes a discovered flow as a spec.");
  out.push("");

  out.push("## 4. Entry points and events", "");
  out.push(`${tour.entries.total} entry point(s) (\`keylang entries\`).`, "");
  for (const kind of tour.entries.kinds) out.push(`- ${kind.kind}: ${kind.count} — ${kind.labels.map(code).join(", ")}${kind.count > kind.labels.length ? ", …" : ""}`);
  if (tour.entries.kinds.length > 0) out.push("");
  else out.push("None found: keylang records what the code and its manifests write (`bin`, `[project.scripts]`, `fn main`, `__main__`, scripts in bin/, Next.js route handlers, `app.get('/x', handler)`); a framework's routes, cron jobs and consumers need its adapter.", "");
  out.push("### Events", "");
  if (tour.events.note !== null) out.push(`${tour.events.note}.`, "");
  for (const event of tour.events.events) out.push(`- ${code(event.id)}: published by ${event.publishers.map(code).join(", ") || "—"}; subscribers ${event.subscribers.map(code).join(", ") || "—"}`);
  if (tour.events.events.length > 0) out.push("");

  out.push("## 5. Integrations", "");
  const { integrations } = tour;
  out.push(`Outgoing: ${integrations.outgoing.length} integration(s) (\`keylang integrations\`).`, "");
  for (const integration of integrations.outgoing) {
    const parts = [`${integration.sites} call site(s)`, ...(integration.hosts.length > 0 ? [integration.hosts.join(", ")] : []), integration.sites === 0 ? `imported ${integration.imports} time(s)` : `reached from ${integration.reachedFrom} entry point(s)`];
    out.push(`- **${integration.id}** (${integration.label}, ${integration.kind}) · ${parts.join(" · ")}`);
  }
  if (integrations.outgoing.length > 0) out.push("");
  out.push(`Incoming webhooks: ${integrations.webhooks.length}.`, "");
  for (const hook of integrations.webhooks) out.push(`- ${hook.kind} ${code(hook.label)} · ${code(hook.id)} · ${hook.file}:${hook.line}`);
  if (integrations.webhooks.length > 0) out.push("");
  const { queues } = integrations;
  out.push(`Queues: ${queues.publishers} publisher(s), ${queues.consumers} consumer(s), ${queues.pairs} pair(s)${queues.topics.length > 0 ? `; topics ${queues.topics.map(code).join(", ")}` : ""}.`, "");

  out.push("## 6. Blind spots and logic in data", "");
  const blind = tour.blindSpots;
  out.push(`${blind.reach.reachable} of ${blind.reach.fns} fn reachable from ${blind.reach.entries} entry point(s) over resolved calls (${percent(blind.reach.share)}); ${blind.orphans} orphan fn; ${blind.unflowed} entry point(s) without a hand-written flow (\`keylang coverage\`).`, "");
  out.push(`### Holes: ${blind.holes.total}`, "");
  for (const module of blind.holes.modules) out.push(`- ${code(module.module)} — ${module.holes} hole(s), ${module.reason} · read ${code(module.read)}`);
  if (blind.holes.modules.length === 0) out.push("- none");
  out.push("");
  out.push(`### Logic in data — read by hand: ${blind.dataLogic.total}`, "");
  for (const signal of blind.dataLogic.signals) out.push(`- ${signal.id} · ${signal.label} — ${signal.count} · read ${signal.sites.map((site) => `${code(`${site.file}:${site.line}`)}${site.in === null ? "" : ` (${site.in})`}`).join(", ")}${signal.count > signal.sites.length ? ", …" : ""}`);
  if (blind.dataLogic.signals.length === 0) out.push("- none");
  out.push("");

  out.push("## 7. Where to start reading", "");
  out.push("The fns most flows go through, then the most called.", "");
  tour.startHere.forEach((fn, i) => out.push(`${i + 1}. ${code(fn.id)} — ${fn.file}:${fn.line} · ${fn.flows} flow(s), ${fn.callers} caller(s)${fn.brief === null ? "" : ` · ${proseLine(fn.brief)}`}`));
  if (tour.startHere.length === 0) out.push("No fn in the snapshot.");
  return `${out.join("\n").trimEnd()}\n`;
}
