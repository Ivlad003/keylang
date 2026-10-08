// The diagram API of `keylang web` (docs/tui.md «Діаграми (API)») as the page
// sees it. The access token arrives once in the URL fragment, the same way as
// for the terminal page: it moves to `sessionStorage` and leaves the address
// bar (the rest of the fragment, the selected view, stays), and every request
// carries it as `Authorization: Bearer`. The types mirror src/diagram.ts and
// src/tui/web.ts; the client checks only what it draws.

const TOKEN_KEY = "keylang-token";

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
}

export interface Usages {
  id: string;
  flows: { name: string; file: string; line: number }[];
  discovered: { name: string; file: string; line: number }[];
  entries: { id: string; kind: string; label: string }[];
}

/** A view as the query of `GET /api/diagram` names it. */
export type ViewQuery = { view: "flow"; name: string } | { view: "discovered"; name: string } | { view: "entry"; id: string } | { view: "layers" } | { view: "process"; domain: string };

/** What the page shows: a diagram, the explorer at an ID (`""`: none picked yet), or the blind spots. */
export type PageQuery = ViewQuery | { view: "explore"; id: string } | { view: "blind" };

/** A refused or failed request, with the status the page explains. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Api {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  views(): Promise<Views> {
    return this.get<Views>("/api/views");
  }

  diagram(query: ViewQuery): Promise<Diagram> {
    return this.get<Diagram>(`/api/diagram?${new URLSearchParams(query).toString()}`);
  }

  usages(id: string): Promise<Usages> {
    return this.get<Usages>(`/api/usages?${new URLSearchParams({ id }).toString()}`);
  }

  calls(id: string): Promise<Calls> {
    return this.get<Calls>(`/api/calls?${new URLSearchParams({ id }).toString()}`);
  }

  coverage(): Promise<Coverage> {
    return this.get<Coverage>("/api/coverage");
  }

  /** One proposal of the ticked branches; a refusal (a generated target, a proposal waiting) is an `ApiError` with the server's reason. */
  async flowProposal(body: { name: string; trigger: string; steps: FlowStep[] }): Promise<FlowProposal> {
    const response = await fetch("/api/flow-proposal", { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (!response.ok) throw new ApiError(response.status, await errorText(response));
    return (await response.json()) as FlowProposal;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    if (!response.ok) throw new ApiError(response.status, await errorText(response));
    return (await response.json()) as T;
  }
}

/** The reason of a refused request: `{"error"}` of a JSON answer, else its text. */
async function errorText(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: the text itself.
  }
  return text || response.statusText;
}
