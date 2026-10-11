// The diagram API of `keylang web` (docs/tui.md «Діаграми (API)») as the page
// sees it. The access token arrives once in the URL fragment, the same way as
// for the terminal page: it moves to `sessionStorage` and leaves the address
// bar (the rest of the fragment, the selected view, stays), and every request
// carries it as `Authorization: Bearer`. The types mirror src/diagram.ts and
// src/tui/web.ts; the client checks only what it draws.

const TOKEN_KEY = "keylang-token";

/** One answer of the API, whatever carried it. `file` is an attachment's name. */
export interface Reply {
  status: number;
  type: string;
  text: string;
  file?: string;
}

/**
 * How the page reaches the API: `server` is `keylang web` over HTTP; `static`
 * reads the answers a static export wrote (`web --export`); `local` asks a
 * Worker that analysed a folder in this tab (`app.html`). The last two, and
 * `web --read-only`, answer GET only.
 */
export interface Transport {
  readonly kind: "server" | "static" | "local";
  send(method: "GET" | "POST" | "PUT", path: string, query: URLSearchParams, body?: unknown): Promise<Reply>;
}

/** The query in one order: a static export files its answers by `path?query`, so the page spells it as `src/tui/read-api.ts` does. */
export function requestKey(path: string, query: URLSearchParams): string {
  const pairs = [...query.entries()].sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0));
  const text = new URLSearchParams(pairs).toString();
  return text === "" ? path : `${path}?${text}`;
}

/** The data shard of a key: FNV-1a over its UTF-16 code units, as `keyShard` of `src/tui/read-api.ts`. */
export function keyShard(key: string, shards: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shards;
}

/** `keylang web`: the token as a Bearer, the server's answer as it is. */
class HttpTransport implements Transport {
  readonly kind = "server";
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async send(method: "GET" | "POST" | "PUT", path: string, query: URLSearchParams, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const search = query.toString();
    // Relative to the page: the same server at `/` and mounted under `/r/<id>/` of `web --hub`.
    const relative = path.replace(/^\//, "");
    const response = await fetch(search === "" ? relative : `${relative}?${search}`, { method, headers, cache: "no-store", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const file = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1];
    return { status: response.status, type: response.headers.get("Content-Type") ?? "text/plain", text: await response.text(), ...(file ? { file } : {}) };
  }
}

let current: Transport | null = null;

/** The transport of this page: the one `useTransport` put, else HTTP with this tab's token. */
export function transport(): Transport {
  current ??= new HttpTransport(takeToken());
  return current;
}

/** Puts another transport in place before the page starts (the static export, `app.html`). */
export function useTransport(next: Transport): void {
  current = next;
}

/** Whether the page only reads: `--read-only`, a static export, `app.html`. */
export function readOnlyPage(): boolean {
  return document.body.dataset["readonly"] === "1";
}

/** The JSON of a reply, or an `ApiError` with its reason. */
export function replyJson<T>(reply: Reply): T {
  if (reply.status < 200 || reply.status >= 300) throw new ApiError(reply.status, errorOf(reply.text));
  return JSON.parse(reply.text) as T;
}

/** The token of this tab: from `#t=` once, then from `sessionStorage`. */
export function takeToken(): string {
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromUrl = hash.get("t");
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    hash.delete("t");
    const rest = hash.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `#${rest}` : ""}`);
  }
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export type Verdict = "ok" | "fail" | "unverified" | "planned" | null;

export interface FlowListing {
  name: string;
  file: string;
  line: number;
  trigger: string | null;
  layer: string | null;
  ids?: string[];
  /** A discovered flow: its entry point's kind and label. */
  kind?: string;
  label?: string;
}

export interface Views {
  flows: string[];
  entries: { id: string; kind: string; label: string }[];
  layers: string[];
  /** Domains of the business processes `flows discover --names` saved, and the processes with their flows. */
  domains?: string[];
  processes?: { name: string; domain: string; flows: string[] }[];
  /** The repository root, absolute: `vscode://file/<root>/<file>:<line>`. */
  root?: string;
  flowList?: FlowListing[];
  discovered?: FlowListing[];
  /** Event nodes of the snapshot (business-flows/08); none yet, with `eventsReason`. */
  events?: EventListing[];
  eventsReason?: string;
  /** The `# system` sections, then `@code`, the system of the code (system-design/03). */
  systems?: SystemListing[];
}

export interface SystemListing {
  name: string;
  file: string | null;
  line: number | null;
  sequences: string[];
  tables: number;
  components: number;
}

/** What a system's diagram says beside its shapes: the interview notes and its other views. */
export interface SystemSummary {
  name: string;
  file: string | null;
  notes: { kind: string; text: string; line: number }[];
  sequences: string[];
  tables: number;
}

export interface EventListing {
  id: string;
  file: string | null;
  line: number | null;
  publishers: number;
  subscribers: number;
}

export interface CallSite {
  file: string | null;
  line: number;
  col: number;
}

/** A callee or caller of `GET /api/calls` (src/explorer.ts). */
export interface CallRef {
  id: string;
  kind: string;
  file: string | null;
  line: number | null;
  layer: string | null;
  external?: true;
  via?: string;
  hook?: string;
  site?: string;
  closure?: true;
  at: CallSite;
  text: string;
  count: number;
  calls: number;
  holes: number;
  callers: number;
  entries: { kind: string; label: string }[];
}

export interface CallHole {
  kind: string;
  reason: string;
  text: string;
  at: CallSite;
  candidates?: string[];
}

export interface Calls {
  id: string;
  node: { kind: string; file: string | null; line: number | null; layer: string | null; doc: string | null } | null;
  entries: { kind: string; label: string }[];
  callees: CallRef[];
  holes: CallHole[];
  callers: CallRef[];
  reachedFrom: { id: string; kind: string; label: string; steps: number }[];
  reason?: string;
}

/** The payload of `keylang coverage --json` (src/coverage-report.ts). */
export interface Coverage {
  snapshotId: string;
  reach: { fns: number; reachable: number; share: number; entries: number; tests: number };
  orphans: { id: string; file: string; line: number; callers: number; escapes: string | null }[];
  holes: {
    total: number;
    modules: { module: string; file: string | null; holes: number; reasons: { kind: string; reason: string; count: number }[] }[];
    reasons: { kind: string; reason: string; count: number }[];
  };
  unflowed: { kind: string; label: string; id: string; file: string; line: number; discovered: { name: string; file: string; inView: boolean } | null }[];
  dataLogic: {
    signals: { id: string; label: string; count: number }[];
    sites: { signal: string; file: string; line: number; col: number; text: string; in: string | null }[];
  };
}

/** The answer of `GET /api/ids`. */
export interface IdList {
  prefix: string;
  ids: { id: string; kind: string }[];
  more: boolean;
  reason?: string;
}

/** A ticked branch of the explorer: a step and the steps under it. */
export interface FlowStep {
  id: string;
  steps?: FlowStep[];
}

/** The answer of `POST /api/flow-proposal`. */
export interface FlowProposal {
  proposal: string;
  target: string;
  name: string;
  steps: string[];
  flow: string;
  merge: string;
}

export interface NodeResult {
  verdict: string;
  criterion: string;
  message: string;
}

export interface DiagramNode {
  id: string;
  kind: string;
  label: string;
  ref?: { id?: string; file?: string; line?: number; specFile?: string; specLine?: number };
  verdict?: Verdict;
  reason?: string;
  group?: string;
  results?: NodeResult[];
  /** A system's component: its kind (`db`, `service`…) and technology. */
  component?: string;
  tech?: string;
  /** A table of the ER view: one line per column. */
  lines?: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
  verdict?: Verdict;
  async?: boolean;
}

export interface DiagramGroup {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  reason?: string;
  /** `down`: ranks are rows from the top (the layers view); the canvas draws its edges as arcs beside the stack. */
  direction?: "down";
  /** The specs the diagram was drawn from (business-flows/24): «Запропонувати зміни» sends it back. */
  specHash?: string;
  /** Already placed (ER, sequence). */
  placed?: true;
  system?: SystemSummary;
}

/** One entry of `GET /api/layout`: a shape's box, an edge's bends, a note, a drawn shape a proposal took (src/diagram-layout.ts). */
export interface LayoutEntry {
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: { x: number; y: number }[];
  id?: string;
  kind?: string;
  label?: string;
  note?: string;
  colour?: string;
  proposed?: string;
  from?: string;
  to?: string;
  status?: "pending" | "rejected";
}

/** The answer of `POST /api/diagram-proposal` (src/operations/diagram-propose.ts). */
export interface DiagramProposal {
  status: "proposed" | "printed" | "nothing" | "conflict" | "refused" | "invalid" | "failed";
  error?: string | null;
  view: string;
  targets: { target: string; proposal: string | null; newFile: boolean; hunks: { line: number; removed: string[]; added: string[] }[]; diff: string; shapes: string[] }[];
  weakenings: { file: string; line: number; col: number; message: string }[];
  config: { target: string; text: string; diff: string; note: string } | null;
  notes: string[];
  merge: string | null;
}

/** One shape of a copied fragment (src/diagram-clip.ts): a canvas key, the keylang side, a box in model coordinates. */
export interface ClipShape {
  key: string;
  id: string;
  kind: string;
  label: string;
  layer: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  signature?: string;
  trigger?: string;
  role?: "split" | "join";
  description?: string;
  tests?: string[];
  colour?: string;
}

export interface ClipEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
  points?: { x: number; y: number }[];
}

/** The body of `POST /api/bundle`. */
export interface BundleRequest {
  view?: string;
  flows?: string[];
  shapes?: ClipShape[];
  edges?: ClipEdge[];
  withCallees?: number;
}

export interface BundleHeader {
  format: number;
  repo: string;
  commit: string;
  snapshotId: string;
  keylang: string;
  flows: string[];
  withCallees: number;
}

/** The answer of `POST /api/bundle`: the text for the clipboard. */
export interface BundleCopy {
  text: string;
  header: BundleHeader;
  flows: string[];
  shapes: number;
  summary: string;
}

/** The answer of `POST /api/bundle-import`. */
export interface BundleImport {
  sameRepo: boolean;
  header: BundleHeader;
  flows: string[];
  shapes: ClipShape[];
  edges: ClipEdge[];
  laidOut: boolean;
  used?: string[];
  sourceLayers?: { name: string; description: string }[];
  targetLayers?: { name: string; description: string }[];
  layers?: { from: string; to: string; by: string }[];
  ids?: { from: string; to: string; planned: boolean }[];
  target?: string;
  migrationTarget?: string;
  proposals?: string[];
  agent?: string | null;
  notes?: string[];
  merge?: string;
}

export interface Usages {
  id: string;
  flows: { name: string; file: string; line: number }[];
  discovered: { name: string; file: string; line: number }[];
  entries: { id: string; kind: string; label: string }[];
}

/** The answer of `GET /api/docs`. */
export interface DocList {
  dir: string;
  files: { path: string; group: "map" | "map-explained" | "explain" | "flows" | "flows-discovered" | "spec" }[];
}

/** The answer of `GET /api/git`. */
export type GitAnswer =
  | { available: true; head: { commit: string | null; short: string | null; branch: string | null }; origin: string | null; base: { ref: string; source: string; label: string; main?: string }; bases: { ref: string; label: string }[] }
  | { available: false; reason: string };

/** A result of `check` as the «Зміни» tab shows it (src/check-results.ts). */
export interface CheckResultView {
  criterion: string;
  verdict: "ok" | "fail" | "unverified" | "warning";
  evidence: string;
  file: string;
  line: number;
  code: string | null;
}

/** The answer of `GET /api/changes`. */
export interface ChangesAnswer {
  base: { ref: string; source: string; label: string; main?: string };
  unborn: boolean;
  files: { path: string; kind: "spec" | "code" | "other"; modules: string[] }[];
  deleted: { path: string; modules: string[] }[];
  check: { results: CheckResultView[]; counts: { fail: number; unverified: number; ok: number }; changed: { hidden: number } | null } | null;
  checkReason?: string;
}

/** A view as the query of `GET /api/diagram` names it. */
export type ViewQuery = { view: "flow"; name: string } | { view: "discovered"; name: string } | { view: "entry"; id: string; depth?: string } | { view: "layers" } | { view: "process"; domain: string } | { view: "module"; id: string } | { view: "system"; name: string } | { view: "er"; name: string } | { view: "sequence"; name: string; seq: string };

/** What the page shows: a diagram, the explorer at an ID (`""`: none picked yet), the blind spots, or the editor on a view (`null`: an empty canvas). */
export type PageQuery = ViewQuery | { view: "explore"; id: string } | { view: "blind" } | { view: "editor"; of: ViewQuery | null } | { view: "docs"; path: string; at?: string } | { view: "changes"; since: string };

/** A refused or failed request, with the status the page explains. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Api {
  views(): Promise<Views> {
    return this.get<Views>("/api/views");
  }

  diagram(query: ViewQuery): Promise<Diagram> {
    return this.get<Diagram>("/api/diagram", query);
  }

  usages(id: string): Promise<Usages> {
    return this.get<Usages>("/api/usages", { id });
  }

  calls(id: string): Promise<Calls> {
    return this.get<Calls>("/api/calls", { id });
  }

  /** The snapshot's IDs under a prefix (the editor's ID field). */
  ids(prefix: string): Promise<IdList> {
    return this.get<IdList>("/api/ids", { prefix });
  }

  coverage(): Promise<Coverage> {
    return this.get<Coverage>("/api/coverage");
  }

  /** The Markdown files of the specs: the map, the explained map, the flows (the «Карта» tab). */
  docs(): Promise<DocList> {
    return this.get<DocList>("/api/docs");
  }

  doc(path: string): Promise<{ path: string; text: string }> {
    return this.get("/api/doc", { path });
  }

  /** IDs of the code holding `q` (`GET /api/search`): the search box finds modules and fns, not only views. */
  search(q: string): Promise<{ q: string; hits: { id: string; kind: string; layer: string; file: string | null; line: number | null }[]; total: number }> {
    return this.get("/api/search", { q });
  }

  /** HEAD, the base of a feature and the branches (the «Зміни» tab). */
  git(): Promise<GitAnswer> {
    return this.get<GitAnswer>("/api/git");
  }

  /** The changes since `since` ("" — the base of a feature) and the findings over them. */
  changes(since: string): Promise<ChangesAnswer> {
    return this.get<ChangesAnswer>("/api/changes", since === "" ? {} : { since });
  }

  /** One proposal of the ticked branches; a refusal (a generated target, a proposal waiting) is an `ApiError` with the server's reason. */
  flowProposal(body: { name: string; trigger: string; steps: FlowStep[] }): Promise<FlowProposal> {
    return this.post<FlowProposal>("/api/flow-proposal", body);
  }

  /** The layout file of a view (`flow:checkout`), in the keys of the editor's canvas. */
  async layout(view: string): Promise<{ exists: boolean; file: string; layout: Record<string, LayoutEntry> }> {
    return this.get("/api/layout", { view });
  }

  /** Replaces the layout file of a view. */
  async saveLayout(view: string, layout: Record<string, LayoutEntry>): Promise<void> {
    replyJson(await transport().send("PUT", "/api/layout", new URLSearchParams({ view }), { layout }));
  }

  /** The drawing as proposals; a conflict or a refusal (409) is an answer too, with its `status` and `error`. */
  async diagramProposal(model: unknown, specHash: string | null): Promise<DiagramProposal> {
    const reply = await transport().send("POST", "/api/diagram-proposal", new URLSearchParams(), { model, specHash });
    if (reply.status === 409) return JSON.parse(reply.text) as DiagramProposal;
    return replyJson<DiagramProposal>(reply);
  }

  /** «Копіювати як пакет» (business-flows/25): the bundle of the flows (or the selection) with the selection in its layout block. */
  bundle(body: BundleRequest): Promise<BundleCopy> {
    return this.post<BundleCopy>("/api/bundle", body);
  }

  /** A pasted bundle: the preview (layer choices for the dialog) or the import (proposals), and the shapes to draw. */
  bundleImport(body: { text: string; layerMap?: Record<string, string>; mode?: "algo" | "hybrid"; output?: "preview" | "proposal" }): Promise<BundleImport> {
    return this.post<BundleImport>("/api/bundle-import", body);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return replyJson<T>(await transport().send("POST", path, new URLSearchParams(), body));
  }

  private async get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return replyJson<T>(await transport().send("GET", path, new URLSearchParams(query)));
  }
}

/** The reason of a refused request: `{"error"}` of a JSON answer, else its text. */
export function errorOf(body: string): string {
  const text = body.trim();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: the text itself.
  }
  return text || "request failed";
}
