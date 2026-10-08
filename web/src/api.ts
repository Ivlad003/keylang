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

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    if (!response.ok) throw new ApiError(response.status, (await response.text()).trim() || response.statusText);
    return (await response.json()) as T;
  }
}
