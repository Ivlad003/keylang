// The read half of the diagram API (`GET /api/…`): one function answers a
// path and its query from an analysis, for every transport the diagram page
// has — `keylang web` over HTTP, the static export (`web --export`, the
// answers computed once and written as files) and the analysis in the browser
// (`app.html`, a Worker over files in memory). Nothing here writes: the
// writes (proposals, layouts, greenfield, bundles) stay in `web.ts`.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Analysis, AnalysisRequest } from "../analyze.ts";
import { checkResults, type CheckResult } from "../check-results.ts";
import { toPosix } from "../config.ts";
import { diagramOf, flowListing, parseView, usagesOf, viewOfKey, viewsOf, type Diagram, type DiagramNode } from "../diagram.ts";
import { layoutFromFile, readLayout, type LayoutFile } from "../diagram-layout.ts";
import { PROCESSES_FILE, processViews, readProcesses } from "../discover-names.ts";
import { callsOf, eventsOf } from "../explorer.ts";
import { collectMdFiles } from "../files.ts";
import { DISCOVERED_FLOWS_DIR, EXPLAINED_MAP_DIR, explainedMapOf } from "../map.ts";
import { runCoverage } from "../operations/coverage.ts";
import { DIAGRAM_FORMATS, diagramExportText, exportSourcesOf, exportViewOfQuery } from "../operations/diagram-export.ts";
import { specHash } from "../operations/diagram-propose.ts";
import { rootRelative } from "../operations/shared.ts";
import { parse } from "../parser.ts";
import { pendingTargets } from "../proposals.ts";
import { compareText } from "../span.ts";
import { compileSpec, type SpecIR } from "../spec-ir.ts";
import { buildTour, tourMarkdown } from "../tour.ts";

/** One answer: a status, a media type, the body; `file` names an attachment. */
export interface ReadAnswer {
  status: number;
  type: string;
  body: string;
  file?: string;
}

export interface ReadApiOptions {
  root: string;
  /** The analysis the answers read; concurrent callers may share one. */
  analysis: () => Promise<Analysis>;
  /** The analyzer `coverage` runs its own fresh analysis with. */
  analyze: (request: AnalysisRequest) => Promise<Analysis>;
  /** Report the absolute root to the page (`vscode://` links); a static export leaves it out. */
  showRoot?: boolean;
}

/** The GET paths this module answers; `/api/layout` also takes a PUT, which `web.ts` handles. */
export const READ_PATHS: ReadonlySet<string> = new Set(["/api/views", "/api/diagram", "/api/usages", "/api/calls", "/api/ids", "/api/coverage", "/api/tour", "/api/export", "/api/layout", "/api/docs", "/api/doc"]);

/**
 * A request as one string, the query in one order: a static export files its
 * answers by it, and the page (`web/src/api.ts`, `requestKey`) spells it alike.
 */
export function requestKey(path: string, query: URLSearchParams): string {
  const pairs = [...query.entries()].sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0));
  const text = new URLSearchParams(pairs).toString();
  return text === "" ? path : `${path}?${text}`;
}

/** FNV-1a over the UTF-16 code units of a key: which data shard of a static export holds it (`web/src/api.ts`, `keyShard`). */
export function keyShard(key: string, shards: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shards;
}

/** At most this many IDs in one answer of `GET /api/ids`. */
const MAX_IDS = 100;

/** A spec Markdown file the «Карта» tab lists, with the group it is shown under. */
export interface DocEntry {
  path: string;
  group: "map" | "map-explained" | "explain" | "flows" | "flows-discovered" | "spec";
}

export interface ReadApi {
  answer(path: string, query: URLSearchParams): Promise<ReadAnswer>;
  /** The diagram of a view key (`flow:checkout`, `discovered:<name>`, `layers`…) before any layout file; a string says why there is none. */
  keyedDiagram(done: Analysis, key: string): Diagram | string;
  /** The discovered view (`<dir>/flows-discovered/*.md`) parsed as specs, or null when there is none. */
  discoveredSpec(done: Analysis): SpecIR | null;
  /** The Markdown files of the specs, the rendered map and the explained map among them. */
  docs(done: Analysis): { dir: string; files: DocEntry[]; text: Map<string, string | null> };
}

export function createReadApi(options: ReadApiOptions): ReadApi {
  const root = options.root;
  // The discovered view parsed as specs, kept while its files are the same: `check` never reads it (ADR 0014).
  let discoveredCache: { key: string; spec: SpecIR } | null = null;
  const discoveredSpec = (done: Analysis): SpecIR | null => {
    const dir = join(root, done.config.dir, DISCOVERED_FLOWS_DIR);
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir)
      // The README of the business processes (`flows discover --names`) is no flow.
      .filter((name) => name.endsWith(".md") && name !== PROCESSES_FILE)
      .sort()
      .map((name) => join(dir, name));
    const key = files
      .map((file) => {
        const stat = statSync(file);
        return `${file}:${stat.mtimeMs}:${stat.size}`;
      })
      .join("\n");
    if (discoveredCache?.key !== key) {
      const docs = files.map((file) => parse(toPosix(relative(root, file)), readFileSync(file, "utf8")));
      discoveredCache = { key, spec: compileSpec(docs).spec };
    }
    return discoveredCache.spec;
  };

  const processesOf = (done: Analysis) => (done.snapshot ? processViews(done.snapshot, done.spec, readProcesses(done.config.root, done.config.dir)) : []);

  const keyedDiagram = (done: Analysis, key: string): Diagram | string => {
    const wanted = viewOfKey(key);
    if (wanted === null) return `view: a view key such as flow:<name>, discovered:<name>, entry:<id>, process:<domain> or layers`;
    const spec = wanted.discovered ? discoveredSpec(done) : done.spec;
    if (spec === null) return { nodes: [], edges: [], groups: [] };
    return diagramOf({ snapshot: done.snapshot, spec, results: [], view: wanted.view, processes: processesOf(done) });
  };

  // The explained map of a snapshot that was rendered without it (`explain.map` off), once per snapshot.
  const explained = new WeakMap<object, Map<string, string>>();
  const docs = (done: Analysis): { dir: string; files: DocEntry[]; text: Map<string, string | null> } => {
    const dir = rootRelative(root, done.config.dir);
    // `null`: read the file from disk when it is asked for.
    const text = new Map<string, string | null>();
    const mapDir = `${dir}/map/`;
    const explainedDir = `${dir}/${EXPLAINED_MAP_DIR}/`;
    const specDir = join(root, dir);
    if (existsSync(specDir)) {
      for (const abs of collectMdFiles([specDir])) {
        const path = toPosix(relative(root, abs));
        // The rendered map stands for the one on disk, which may be stale or absent.
        if (done.map && (path.startsWith(mapDir) || path.startsWith(explainedDir))) continue;
        text.set(path, null);
      }
    }
    if (done.map) {
      for (const [name, body] of done.map.files) text.set(`${mapDir}${name}`, body);
      let rendered = done.map.explained;
      if (rendered === null && done.snapshot) {
        rendered = explained.get(done.snapshot) ?? explainedMapOf(done.config, done.snapshot);
        explained.set(done.snapshot, rendered);
      }
      for (const [name, body] of rendered ?? []) text.set(`${explainedDir}${name}`, body);
    }
    const groupOf = (path: string): DocEntry["group"] =>
      path.startsWith(mapDir) ? "map" : path.startsWith(explainedDir) ? "map-explained" : path.startsWith(`${dir}/${DISCOVERED_FLOWS_DIR}/`) ? "flows-discovered" : path.startsWith(`${dir}/flows/`) ? "flows" : path.startsWith(`${dir}/explain/`) ? "explain" : "spec";
    const files = [...text.keys()].sort(compareText).map((path) => ({ path, group: groupOf(path) }));
    return { dir, files, text };
  };

  const answer = async (path: string, query: URLSearchParams): Promise<ReadAnswer> => {
    const json = (status: number, body: unknown): ReadAnswer => ({ status, type: "application/json", body: `${JSON.stringify(body)}\n` });
    if (!READ_PATHS.has(path)) return { status: 404, type: "text/plain", body: "not found\n" };
    // The project tour (business-flows/15): the data of `keylang tour --json` and its Markdown, for the «Огляд» tab.
    if (path === "/api/tour") {
      const done = await options.analysis();
      if (done.snapshot === null) return json(200, { reason: "no code to read: `languages` in keylang.json is empty" });
      const tour = await buildTour({ config: done.config, snapshot: done.snapshot, spec: done.spec });
      return json(200, { ...tour, markdown: tourMarkdown(tour) });
    }
    if (path === "/api/docs") {
      const done = await options.analysis();
      const found = docs(done);
      return json(200, { dir: found.dir, files: found.files });
    }
    if (path === "/api/doc") {
      const wanted = query.get("path") ?? "";
      const done = await options.analysis();
      const found = docs(done);
      // Only a listed file: the path is never joined to the root unchecked.
      if (!found.text.has(wanted)) return json(404, { error: `doc: ${wanted || "path="} is not a spec file of this repository` });
      const text = found.text.get(wanted) ?? readFileSync(join(root, wanted), "utf8");
      return json(200, { path: wanted, text });
    }
    if (path === "/api/layout") {
      const view = query.get("view") ?? "";
      const done = await options.analysis();
      const diagram = keyedDiagram(done, view);
      if (typeof diagram === "string") return json(400, { error: diagram });
      let saved: { path: string; file: LayoutFile | null };
      try {
        saved = readLayout(root, rootRelative(root, done.config.dir), view);
      } catch (error) {
        return json(409, { error: error instanceof Error ? error.message : String(error) });
      }
      const pending = new Set(pendingTargets(root));
      return json(200, { view, file: saved.path, exists: saved.file !== null, layout: saved.file === null ? {} : layoutFromFile(saved.file, diagram, pending) });
    }
    if (path === "/api/usages") {
      const id = query.get("id")?.trim() ?? "";
      if (id === "") return json(400, { error: "usages needs id=" });
      const done = await options.analysis();
      return json(200, usagesOf(done.snapshot, done.spec, discoveredSpec(done), id));
    }
    if (path === "/api/calls") {
      const id = query.get("id")?.trim() ?? "";
      if (id === "") return json(400, { error: "calls needs id=" });
      const done = await options.analysis();
      if (!done.snapshot) return json(200, { id, node: null, entries: [], callees: [], holes: [], callers: [], reachedFrom: [], reason: "no snapshot: the specs were checked without code" });
      return json(200, callsOf(done.snapshot, id));
    }
    if (path === "/api/ids") {
      // The editor's ID field (business-flows/23): the snapshot's IDs that start with the prefix, in text order.
      const prefix = query.get("prefix") ?? "";
      const done = await options.analysis();
      if (!done.snapshot) return json(200, { prefix, ids: [], more: false, reason: "no snapshot: the specs were checked without code" });
      const found = Object.keys(done.snapshot.nodes)
        .filter((id) => id.startsWith(prefix))
        .sort(compareText);
      const nodes = done.snapshot.nodes;
      return json(200, { prefix, ids: found.slice(0, MAX_IDS).map((id) => ({ id, kind: nodes[id]!.kind })), more: found.length > MAX_IDS });
    }
    if (path === "/api/export") {
      // The diagram as a file for other tools (business-flows/28): the view as `/api/diagram` names it, the bytes `keylang export` writes.
      const format = DIAGRAM_FORMATS.find((item) => item === query.get("format"));
      if (format === undefined) return json(400, { error: `export needs format=${DIAGRAM_FORMATS.join("|")}` });
      const wanted = exportViewOfQuery(query);
      if (typeof wanted === "string") return json(400, { error: wanted });
      const done = await options.analysis();
      let text: string;
      try {
        text = diagramExportText(format, wanted, exportSourcesOf(done, wanted.discovered ? discoveredSpec(done) : null));
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : String(error) });
      }
      return { status: 200, type: "application/xml; charset=utf-8", body: text, file: `${wanted.name.replace(/[^A-Za-z0-9._-]+/g, "_")}.${format}` };
    }
    if (path === "/api/coverage") {
      // The payload of `keylang coverage --json`: the same operation over the same analyzer as the other requests.
      const result = await runCoverage({ kind: "coverage", root }, { analyze: options.analyze });
      if (result.payload === null) return json(409, { error: result.messages[0]?.text ?? "coverage failed" });
      const { text: _text, ...report } = result.payload;
      return json(200, report);
    }
    // A discovered flow is drawn like a flow, from the discovered view and without verdicts: `check` does not judge it.
    const discovered = path === "/api/diagram" && query.get("view") === "discovered";
    const view = path !== "/api/diagram" ? null : parseView(discovered ? new URLSearchParams({ view: "flow", name: query.get("name") ?? "" }) : query);
    if (typeof view === "string") return json(400, { error: discovered ? "view=discovered needs name=" : view });
    const done = await options.analysis();
    // The business processes `flows discover --names` saved, with their flows found again in this snapshot.
    const processes = processesOf(done);
    if (view === null) {
      const found = discoveredSpec(done);
      const entries = new Map((done.snapshot?.entries ?? []).map((entry) => [entry.id, entry]));
      const events = eventsOf(done.snapshot);
      return json(200, {
        ...viewsOf(done.snapshot, done.spec, processes),
        ...(options.showRoot === false ? {} : { root }),
        events: events.events,
        ...(events.reason ? { eventsReason: events.reason } : {}),
        flowList: flowListing(done.snapshot, done.spec),
        discovered: (found ? flowListing(done.snapshot, found) : []).map(({ ids: _ids, ...flow }) => {
          const entry = flow.trigger === null ? undefined : entries.get(flow.trigger);
          return { ...flow, ...(entry ? { kind: entry.kind, label: entry.label } : {}) };
        }),
      });
    }
    const specDir = rootRelative(root, done.config.dir);
    if (discovered) {
      const found = discoveredSpec(done);
      let saved: LayoutFile | null = null;
      try {
        saved = readLayout(root, specDir, `discovered:${query.get("name") ?? ""}`).file;
      } catch {
        saved = null;
      }
      return json(200, found ? { ...diagramOf({ snapshot: done.snapshot, spec: found, results: [], view, saved }), specHash: specHash(root, done.docs) } : { nodes: [], edges: [], groups: [], reason: "no discovered flows: run `keylang flows discover`" });
    }
    const results = checkResults(done.verdicts, done.snapshot?.snapshotId ?? null, done.diagnostics);
    // The view's layout file places the shapes (business-flows/24); one that cannot be read leaves the computed places.
    const key = view.kind === "flow" ? `flow:${view.name}` : view.kind === "entry" ? `entry:${view.id}` : view.kind === "process" ? `process:${view.domain}` : view.kind === "layers" ? "layers" : null;
    let saved: LayoutFile | null = null;
    try {
      if (key !== null) saved = readLayout(root, specDir, key).file;
    } catch {
      saved = null;
    }
    return json(200, { ...withResults(diagramOf({ snapshot: done.snapshot, spec: done.spec, results, view, processes, saved }), results), specHash: specHash(root, done.docs) });
  };

  return { answer, keyedDiagram, discoveredSpec, docs };
}

/** At most this many check results ride on one shape. */
const MAX_NODE_RESULTS = 20;

type NodeResult = { verdict: string; criterion: string; message: string };

/**
 * Each shape with the check results behind its verdict, for the side panel of
 * the diagram page: those on its spec line, or, for a shape of code alone
 * (an entry's call tree), those about its ID.
 */
function withResults(diagram: Diagram, results: readonly CheckResult[]): Omit<Diagram, "nodes"> & { nodes: (DiagramNode & { results?: NodeResult[] })[] } {
  const byLine = new Map<string, CheckResult[]>();
  const byArea = new Map<string, CheckResult[]>();
  const push = (map: Map<string, CheckResult[]>, key: string, result: CheckResult): void => {
    const list = map.get(key);
    if (list) list.push(result);
    else map.set(key, [result]);
  };
  for (const result of results) {
    push(byLine, `${result.file}:${result.line}`, result);
    push(byArea, result.area, result);
  }
  const nodes = diagram.nodes.map((node) => {
    const ref = node.ref;
    const found = ref?.specFile !== undefined && ref.specLine !== undefined ? byLine.get(`${ref.specFile}:${ref.specLine}`) : ref?.id !== undefined ? byArea.get(ref.id) : undefined;
    if (!found || found.length === 0) return node;
    return { ...node, results: found.slice(0, MAX_NODE_RESULTS).map((result): NodeResult => ({ verdict: result.verdict, criterion: result.criterion, message: result.evidence })) };
  });
  return { ...diagram, nodes };
}
