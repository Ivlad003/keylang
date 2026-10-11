// `keylang web`: the same TUI in a browser tab. `node:http` serves a page and
// the bundled xterm.js; a WebSocket (`ws`) carries ANSI frames to xterm.js and
// its keyboard, mouse, paste and resize events back to an `App` in this
// process. No PTY and no CDN. A session outlives its socket for a while, so a
// reload or a dropped connection reattaches to the same state. Operations
// belong to that `App`, not to a socket: a drop leaves a running one and its
// F6 record as they are, and only the session's end (`q`, expiry,
// `server.close()`) cancels it, through the same lifecycle as a terminal.
//
// The server listens on localhost by default, and every socket needs the
// random token printed at start: the TUI can write spec files. The token is in
// the URL fragment, which the browser never sends; the page moves it to
// `sessionStorage`, drops it from the address bar, and offers it as a
// WebSocket subprotocol. No cookie: cookies are not scoped by port, so any
// other server on localhost would receive it.

//
// Layer: TUI/web, the browser transport of the TUI. The CLI's `keylang web`
// calls `serveWeb`; the hub (`hub.ts`) mounts `createWebApp` per repository;
// `web-export.ts` reuses `diagramsPage`, `BUILT_DIR` and `ensureClient`. The
// diagram page's JSON API is answered by `read-api.ts` plus the write
// endpoints below (proposals, layouts, bundles, greenfield).

import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { analyze, type Analysis } from "../analyze.ts";
import { viewOfKey } from "../diagram.ts";
import { layoutText, layoutToFile, readLayout, writeLayout, type ClientEntry, type ClientLayout, type LayoutFile } from "../diagram-layout.ts";
import { explorerFlow, parseExplorerFlow } from "../explorer.ts";
import { sourceInputs } from "../map.ts";
import { runDiagramPropose } from "../operations/diagram-propose.ts";
import { greenfieldAvailability, runGreenfield } from "../operations/greenfield.ts";
import { GREENFIELD_LANGUAGES } from "../greenfield.ts";
import { exportBundle, exportFlows, gitOf, runFlowImport } from "../operations/flow-bundle.ts";
import { clipLayout, clipLayoutText, fragmentFlow, fragmentName, parseClipSelection, pastedShapes } from "../diagram-clip.ts";
import { parseBundle, usedLayers, type ExportFlow } from "../flow-bundle.ts";
import { keylangVersion } from "../harness.ts";
import { isJsonNumber, isJsonObject, isJsonString, parseJson, type JsonValue } from "../json.ts";
import { flowCandidate } from "../operations/draft.ts";
import type { FlowImportRequest } from "../operations/types.ts";
import { commitProposal, generatedIn, proposalRefusal, rootRelative } from "../operations/shared.ts";
import { App, MAX_COLS, MAX_ROWS, type Analyzer, type AppOptions, type OperationRunner } from "./app.ts";
import { SnapshotWorker } from "./background.ts";
import { createReadApi, isRefusal, READ_PATHS, type ReadAnswer } from "./read-api.ts";
import { inputsOf, stampOf } from "./tree-stamp.ts";
import { ENTER } from "./screen.ts";

/** A detached session is kept this long for a reconnect. */
const KEEP_MS = 10 * 60 * 1000;

/** A socket that does not answer a ping within this interval is dropped. */
const PING_MS = 30 * 1000;

/** One message larger than this closes the connection (the client sends keys and sizes). */
const MAX_MESSAGE = 1 << 20;

/** The text with C0 controls and DEL as spaces: an error's text shown in the terminal must not move the cursor or start a sequence. */
function withoutControls(text: string): string {
  let out = "";

  for (const char of text) {
    // Replace per code point, so a multi-unit character is kept whole.
    const code = char.charCodeAt(0);
    out += code < 0x20 || code === 0x7f ? " " : char;
  }

  return out;
}

/** Close codes the page understands: another tab took the session; the session ended. */
export const CLOSE_TAKEN = 4000;

/** Close code: the session ended (`q`, or no session could be opened); the page does not reconnect. */
export const CLOSE_ENDED = 4001;

/** The xterm.js files the terminal page loads, resolved from their npm packages. */
const ASSETS = {
  "xterm.js": { pkg: "@xterm/xterm", file: "lib/xterm.js", type: "text/javascript" },
  "xterm.css": { pkg: "@xterm/xterm", file: "css/xterm.css", type: "text/css" },
  "addon-fit.js": { pkg: "@xterm/addon-fit", file: "lib/addon-fit.js", type: "text/javascript" },
} as const;

/** The name of an xterm.js asset under `/assets/`. */
type AssetName = keyof typeof ASSETS;

/** The diagram client, bundled by scripts/build-web.mjs (ADR 0024): it exists only as built files, never in a package. */
const BUILT = {
  "diagrams.js": "text/javascript",
  "diagrams.css": "text/css",
} as const;

/** The name of a built diagram-client file under `/assets/`. */
type BuiltName = keyof typeof BUILT;

/** Whether `/assets/<name>` is a built diagram-client file. */
function isBuiltName(name: string): name is BuiltName {
  return Object.hasOwn(BUILT, name);
}

/** Whether `/assets/<name>` is an xterm.js file. */
function isAssetName(name: string): name is AssetName {
  return Object.hasOwn(ASSETS, name);
}

// Literal directory URLs: `dist/tui/web.js` and `src/tui/web.ts` both sit two levels below the package root.
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Where `scripts/build-web.mjs` writes the diagram client. */
export const BUILT_DIR = join(PACKAGE_ROOT, "dist", "web");

/** Only a checkout has the client's sources; the published package has the built files alone. */
const CLIENT_SOURCES = join(PACKAGE_ROOT, "web", "src");

/** The newest modification time under a directory, in ms. */
function newestUnder(dir: string): number {
  let newest = 0;

  // Walk the whole tree; only files count, since a directory's mtime says nothing about edits inside existing files.
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  }

  return newest;
}

/** Whether a built file is missing or older than the client's sources (the page's, the worker's and the keylang modules the worker bundles) or its build script. */
function clientStale(): boolean {
  // A published package has no sources, so its built files are never stale.
  if (!existsSync(CLIENT_SOURCES)) return false;
  const built = ["diagrams.js", "analysis.js", "site.json"].map((name) => join(BUILT_DIR, name));

  if (built.some((file) => !existsSync(file))) return true;
  const script = join(PACKAGE_ROOT, "scripts", "build-web.mjs");
  // Stale when the oldest built file predates the newest source file or the build script.
  const sources = [CLIENT_SOURCES, join(PACKAGE_ROOT, "web", "worker"), join(PACKAGE_ROOT, "src")].filter((dir) => existsSync(dir));
  const oldest = Math.min(...built.map((file) => statSync(file).mtimeMs));

  return oldest < Math.max(...sources.map(newestUnder), existsSync(script) ? statSync(script).mtimeMs : 0);
}

/** The build in progress, shared by every request that needs the client meanwhile. */
let building: Promise<void> | null = null;

/** In a checkout, builds the diagram client when it is missing or stale (esbuild takes about a second); concurrent requests share one build. */
export function ensureClient(): Promise<void> {
  if (building) return building;

  if (!clientStale()) return Promise.resolve();
  building = new Promise<void>((done, fail) => {
    execFile(process.execPath, [join(PACKAGE_ROOT, "scripts", "build-web.mjs")], { cwd: PACKAGE_ROOT }, (error, _stdout, stderr) => {
      if (error) fail(new Error(`cannot build the diagram client (npm run web:build): ${stderr.trim() || error.message}`));
      else done();
    });
  }).finally(() => (building = null));

  return building;
}

/** The published package carries the assets in `dist/web/`; a checkout reads them from `node_modules`. */
export function assetPath(name: AssetName): string | null {
  // A literal directory URL: an asset is not a module, and a computed `new URL` would read as a hidden import.
  const packaged = join(fileURLToPath(new URL("../web/", import.meta.url)), name);

  if (existsSync(packaged)) return packaged;

  // A checkout: resolve the npm package's directory and the file inside it.
  try {
    const asset = ASSETS[name];
    const dir = dirname(createRequire(import.meta.url).resolve(`${asset.pkg}/package.json`));
    const file = join(dir, asset.file);

    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

/** A running `keylang web` server: its printed URL and port, unsaved specs, and shutdown. */
export interface WebServer {
  url: string;
  port: number;
  /** Specs with unsaved changes, across sessions. */
  unsaved(): string[];
  close(): Promise<void>;
}

/** The subprotocol the page speaks; the token rides along as `keylang.t.<token>`. */
export const PROTOCOL = "keylang";

/** The prefix of the subprotocol that carries the token. */
const TOKEN_PROTOCOL = `${PROTOCOL}.t.`;

/** One TUI session: its `App`, the socket driving it (null while detached), and the expiry timer. */
interface Session {
  app: App;
  connection: WebSocket | null;
  timer: NodeJS.Timeout | null;
  /** The browser's microphone while `Ctrl+R` records: PCM the page sends in `audio` messages. */
  audio: AudioQueue | null;
}

/** What the page is told besides ANSI: the microphone goes on or off. */
interface ControlMessage {
  type: "mic";
  on: boolean;
}

/** A control message for the page: a frame that starts with NUL, which no ANSI frame does. */
function control(message: ControlMessage): string {
  return `\u0000${JSON.stringify(message)}`;
}

/** At most 10 minutes of 16 kHz speech per recording: a page cannot fill the server's memory. */
const MAX_SAMPLES = 16000 * 600;

/** PCM chunks from the page, read by the session's recognizer as they arrive. */
class AudioQueue {
  private readonly pending: Int16Array[] = [];
  private waiting: (() => void) | null = null;
  private ended = false;
  private failure: Error | null = null;
  private samples = 0;

  /** Adds a chunk; chunks after `end` or past `MAX_SAMPLES` are dropped. */
  push(chunk: Int16Array): void {
    if (this.ended || this.samples + chunk.length > MAX_SAMPLES) return;
    this.samples += chunk.length;
    this.pending.push(chunk);
    this.wake();
  }

  /** Ends the stream; a failure is thrown to the reader once the queued chunks are read. */
  end(failure: Error | null = null): void {
    this.ended = true;
    this.failure ??= failure;
    this.wake();
  }

  /** Resolves the reader waiting for a chunk, if any. */
  private wake(): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.();
  }

  /** The chunks as they come, until `end`. */
  async *chunks(): AsyncGenerator<Int16Array> {
    // Yield queued chunks first; only when the queue is empty does a failure or the end stop the reader, else wait for `wake`.
    for (;;) {
      const chunk = this.pending.shift();

      if (chunk) {
        yield chunk;
        continue;
      }

      if (this.failure) throw this.failure;

      if (this.ended) return;
      await new Promise<void>((done) => (this.waiting = done));
    }
  }
}

/** s16le PCM from base64; an odd byte count or bad base64 is dropped, not trusted. */
function pcmOf(data: JsonValue | undefined): Int16Array | null {
  if (!isJsonString(data) || data.length > MAX_MESSAGE) return null;
  const bytes = Buffer.from(data, "base64");

  if (bytes.length === 0 || bytes.length % 2 !== 0) return null;
  const pcm = new Int16Array(bytes.length / 2);

  // Little-endian 16-bit samples, read explicitly so the host's byte order does not matter.
  for (let i = 0; i < pcm.length; i++) pcm[i] = bytes.readInt16LE(i * 2);

  return pcm;
}

/** A size from the client: an integer within the grid limits, else the fallback. */
export function clampSize(value: JsonValue | undefined, fallback: number, max: number): number {
  if (!isJsonNumber(value) || !Number.isFinite(value)) return fallback;

  return Math.max(1, Math.min(max, Math.floor(value)));
}

/** Whether `given` equals the token, compared in constant time so timing tells nothing about it. */
function sameSecret(given: string | null | undefined, token: string): boolean {
  if (given === null || given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);

  return a.length === b.length && timingSafeEqual(a, b);
}

/** The token a socket offers among its subprotocols. */
function offeredToken(request: IncomingMessage): string | null {
  // The header lists the offered subprotocols comma-separated; the token is the one with the token prefix.
  for (const protocol of String(request.headers["sec-websocket-protocol"] ?? "").split(",")) {
    const name = protocol.trim();

    if (name.startsWith(TOKEN_PROTOCOL)) return name.slice(TOKEN_PROTOCOL.length);
  }

  return null;
}

/** How `createWebApp` and `serveWeb` run one repository. */
export interface WebOptions {
  root: string;
  port: number;
  host?: string;
  analyzer?: Analyzer;
  /** Every session's operation runner (tests inject a gated one); default: the session's own worker, as in a terminal. */
  operations?: OperationRunner;
  /** How long a detached session waits for a reconnect. */
  keepMs?: number;
  /**
   * `web --read-only`: the diagram page alone, with its «Карта» tab — no TUI
   * session, no write of any kind (a method other than GET is refused, and
   * analyses keep no fact cache), so nothing in the repository changes.
   */
  readOnly?: boolean;
}

/**
 * One repository's `keylang web` without a server of its own: the handlers of
 * its requests and socket upgrades, for `serveWeb` and for the hub
 * (`web --hub`), which mounts each repository under `/r/<id>/` of one port
 * and passes requests on with the prefix taken off.
 */
export interface WebApp {
  /** The access token of this repository's page and API. */
  readonly token: string;
  handle(request: IncomingMessage, response: ServerResponse): void;
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  /** The port the requests arrive on: the Host header on loopback must name it. */
  setPort(port: number): void;
  unsaved(): string[];
  close(): Promise<void>;
}

/** One analysis of the tree and the stamp of its inputs, kept while no input changes. */
interface CachedAnalysis {
  /** Null while the analysis runs: its inputs are known only when it ends. */
  inputs: string[] | null;
  stamp: string;
  done: Promise<Analysis>;
}

/** A request's `flows`: flow names, absent, or null when it is no array of names. */
function flowNamesOf(value: JsonValue | undefined): string[] | undefined | null {
  if (value === undefined) return undefined;

  if (!Array.isArray(value)) return null;
  const names = value.filter(isJsonString);

  // Only plain flow names: letters, digits, `_`, `.` and `-`.
  return names.length === value.length && names.every((name) => /^[\p{L}\p{N}_.-]+$/u.test(name)) ? names : null;
}

/**
 * The page, API and socket handlers of one repository's `keylang web`, with
 * its token, sessions and shared analysis; `serveWeb` and the hub put it on a port.
 */
export function createWebApp(options: WebOptions): WebApp {
  const host = options.host ?? "127.0.0.1";
  const token = randomBytes(16).toString("hex");
  const worker = new SnapshotWorker();
  const base: Analyzer = options.analyzer ?? ((request) => analyze({ ...request, generate: worker.generate }));
  const readOnly = options.readOnly === true;
  // A viewer keeps no fact cache: `.keylang/` is the repository's too.
  const analyzer: Analyzer = readOnly ? (request) => base({ ...request, persistFacts: false, saveFacts: false }) : base;
  const sessions = new Map<string, Session>();
  const alive = new WeakMap<WebSocket, boolean>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE, perMessageDeflate: false, handleProtocols: (offered) => (offered.has(PROTOCOL) ? PROTOCOL : false) });
  let port = options.port;

  // On loopback the Host header stops DNS rebinding; on another address the token alone guards access.
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";

  /** Whether the Host header names this server; anything goes off loopback, where the token is the guard. */
  const allowedHost = (header: string | undefined): boolean => {
    if (!header) return false;

    return !loopback || [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(header);
  };

  /** Whether the socket offered the right token. */
  const authorized = (request: IncomingMessage): boolean => sameSecret(offeredToken(request), token);
  // A page of another origin may send a request but must not read the answer: the Origin a browser sets is checked as for the socket.
  const sameOrigin = (request: IncomingMessage): boolean => request.headers.origin === undefined || request.headers.origin === `http://${request.headers.host}`;

  // Concurrent API requests share one analysis; the next request after it ends analyses again (the code may have changed).
  // One analysis per state of the tree: a request reuses it while no file under the root changed
  // (`treeStamp`: paths, sizes, modification times — tens of ms where an analysis takes seconds).
  // Before, every request (a click, the page's poll every 5 s) analysed the repository again.
  let cached: CachedAnalysis | null = null;

  const analysis = (): Promise<Analysis> => {
    // While the first analysis runs its inputs are unknown: requests meanwhile share it.
    if (cached !== null && (cached.inputs === null || stampOf(options.root, cached.inputs) === cached.stamp)) return cached.done;
    // Otherwise start a new analysis and make it the cached one at once, so concurrent requests share it.
    const done = Promise.resolve().then(() => analyzer({ root: options.root }));
    const entry: CachedAnalysis = { inputs: null, stamp: "", done };
    cached = entry;
    done.then(
      (result) => {
        // Its inputs are known only now; a file saved while it ran is seen at its next save (the TUI saves through the same files).
        entry.stamp = stampOf(options.root, inputsOf(result));
        entry.inputs = inputsOf(result);
      },
      () => {
        // A failed analysis is not kept: the next request tries again.
        if (cached === entry) cached = null;
      },
    );

    return done;
  };

  // Coverage and `check --changed` take the same analysis: their own fresh one cost seconds a request.
  const read = createReadApi({ root: options.root, analysis, analyze: () => analysis() });

  /**
   * `POST /api/flow-proposal` (business-flows/22): the branches a person ticked in the explorer as one proposal
   * for `<dir>/flows/<name>.md`, through the proposals mechanism `flows adopt` uses. The token (a header no other
   * origin can set without a preflight this server never answers), a JSON body and the same origin guard it.
   */
  const flowProposal = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    // Parse the explorer's ticked branches and draft a flow from them over the snapshot.
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);
    const body = await jsonBody(request, response, "flow-proposal", "POST", MAX_BODY);

    if (body === NO_BODY) return;
    const wanted = parseExplorerFlow(body);

    if (isRefusal(wanted)) return json(400, { error: wanted });
    const done = await analysis();

    if (!done.snapshot) return json(409, { error: "no code to read (`languages` in keylang.json is empty)" });
    const draft = explorerFlow(done.snapshot, wanted);

    if (isRefusal(draft)) return json(400, { error: draft });
    // Where the flow would land, given the spec directory and the documents that are generated.
    const specDir = rootRelative(options.root, done.config.dir);
    const generated = generatedIn(done.docs);
    let candidate;

    try {
      candidate = flowCandidate(options.root, specDir, generated, draft);
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : String(error) });
    }

    // The same refusals as `flows adopt`: a generated target, a store that breaks the write policy, a proposal already waiting.
    const refusal = proposalRefusal(options.root, candidate, "refuse", "web explorer");

    if (refusal !== null) return json(409, { error: refusal.error, target: candidate.target });

    // Write the proposal under `.keylang/proposals/`; the spec itself changes only when a person merges it.
    const committed = await commitProposal(
      { root: options.root, specDir, generated, target: candidate.target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: done.config, inputs: sourceInputs(done.config, done.snapshot.manifest.files) },
      {},
    );

    if ("refused" in committed) return json(409, { error: committed.refused.join("; "), target: candidate.target });

    if ("failed" in committed) return json(500, { error: committed.failed });

    if ("cancelled" in committed) return json(409, { error: "cancelled" });

    return json(200, {
      proposal: committed.proposal,
      target: candidate.target,
      name: draft.name,
      steps: draft.steps,
      flow: draft.text,
      merge: `merge it with MERGE in the TUI (\`keylang\`, m on the proposal), or a person runs \`keylang proposals accept ${candidate.target}\``,
    });
  };

  /**
   * `GET /api/layout?view=<key>` and `PUT` (business-flows/24): the layout file of a view,
   * `<dir>/diagrams/<view>.layout.json`, in the keys of the editor's canvas. A PUT replaces
   * it; the same guards as every write (token, JSON, origin).
   */
  const layoutRequest = async (request: IncomingMessage, response: ServerResponse, query: URLSearchParams): Promise<void> => {
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);
    const view = query.get("view") ?? "";

    // Only GET (answered by the read API) and PUT (a write) are allowed.
    if (request.method !== "GET" && request.method !== "PUT") {
      response.setHeader("Allow", "GET, PUT");

      return json(405, { error: "layout takes GET or PUT" });
    }

    if (request.method === "GET") return send(response, await read.answer("/api/layout", query));
    const body = await jsonBody(request, response, "layout", "PUT", MAX_LAYOUT_BODY);

    if (body === NO_BODY) return;
    // The view must exist, and an existing layout file must be readable, before anything is written.
    const done = await analysis();
    const diagram = read.keyedDiagram(done, view);

    if (isRefusal(diagram)) return json(400, { error: diagram });
    const specDir = rootRelative(options.root, done.config.dir);
    let saved: { path: string; file: LayoutFile | null };

    try {
      saved = readLayout(options.root, specDir, view);
    } catch (error) {
      return json(409, { error: error instanceof Error ? error.message : String(error) });
    }

    // Validate the posted layout, convert it to the file's form, and skip the write when nothing changed.
    const layout = parseClientLayout(body);

    if (isRefusal(layout)) return json(400, { error: layout });
    const file = layoutToFile(view, layout, diagram);

    if (saved.file !== null && layoutText(saved.file) === layoutText(file)) return json(200, { view, file: saved.path, written: false });

    try {
      writeLayout(options.root, specDir, file);
    } catch (error) {
      return json(409, { error: error instanceof Error ? error.message : String(error) });
    }

    return json(200, { view, file: saved.path, written: true });
  };

  /**
   * `POST /api/diagram-proposal` (business-flows/24): «Запропонувати зміни» of the editor —
   * `{model, specHash}`, the canvas and the specs it was opened with — as proposals, by
   * the operation `keylang diagram propose` runs. 409 when the specs changed since or a
   * proposal waits; 200 with the targets, their hunks and the K108 warnings.
   */
  const diagramProposal = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);
    const body = await jsonBody(request, response, "diagram-proposal", "POST", MAX_MODEL_BODY);

    if (body === NO_BODY) return;

    if (!isJsonObject(body)) return json(400, { error: "the body: {model, specHash}" });
    // Validate the body's shape here; the operation validates the model itself.
    const { model, specHash: hash } = body;
    const modelView = isJsonObject(model) ? model.view : undefined;
    const view = isJsonString(modelView) ? modelView : null;

    if (view === null) return json(400, { error: "model.view: a view key such as `flow:checkout`" });

    if (hash !== undefined && hash !== null && !isJsonString(hash)) return json(400, { error: "specHash: the string /api/diagram answered" });
    const done = await runDiagramPropose({ root: options.root, view, model, specHash: hash ?? null }, { analyze: () => analysis() });
    // Map the operation's status to HTTP: invalid 400, conflict or refused 409, failed 500.
    const status = done.status === "invalid" ? 400 : done.status === "conflict" || done.status === "refused" ? 409 : done.status === "failed" ? 500 : 200;

    return json(status, done);
  };

  /**
   * `GET /api/greenfield` and `POST` (business-flows/29): whether a new project may be drawn here
   * (no keylang.json), and «Створити специфікацію» — `{model, languages, idea}` as the project's
   * first files, by `runGreenfield`. 409 when keylang.json or a target is already there (nothing
   * written); the same guards as every write (token, JSON, origin).
   */
  const greenfieldRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);

    // GET: whether a project may be started here, and which languages it may use.
    if (request.method === "GET") return json(200, { root: options.root, ...greenfieldAvailability(options.root), languages: Object.keys(GREENFIELD_LANGUAGES) });
    const body = await jsonBody(request, response, "greenfield", "POST", MAX_MODEL_BODY);

    if (body === NO_BODY) return;

    if (!isJsonObject(body)) return json(400, { error: "the body: {model, languages, idea}" });
    const { model, languages, idea } = body;
    // Map the operation's status to HTTP: invalid 400, conflict 409, failed 500.
    const done = runGreenfield({ root: options.root, model, languages, idea });
    const status = done.status === "invalid" ? 400 : done.status === "conflict" ? 409 : done.status === "failed" ? 500 : 200;

    return json(status, done);
  };

  /**
   * `POST /api/bundle` (business-flows/25): «Копіювати як пакет» — `{view?, flows?, shapes?, edges?, withCallees?}`.
   * The flows named (or the flow of a `flow:`/`discovered:` view; else a flow made of the
   * selected shapes' IDs) as the bundle `keylang flow export` writes, with callees to
   * `withCallees` (default 1) and the selection in its ```keylang-layout``` block. One
   * `text/plain` the page puts in the clipboard: no custom MIME type.
   */
  const bundleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);
    const body = await jsonBody(request, response, "bundle", "POST", MAX_MODEL_BODY);

    if (body === NO_BODY) return;

    if (!isJsonObject(body)) return json(400, { error: "the body: {view?, flows?, shapes?, edges?, withCallees?}" });
    // Validate the request fields: the view key, the flow names, the callee depth and the selection.
    const raw = body;
    const view = isJsonString(raw.view) ? raw.view : "";
    const named = flowNamesOf(raw.flows);

    if (named === null) return json(400, { error: "flows: an array of flow names" });
    const withCallees = raw.withCallees ?? 1;

    if (!isJsonNumber(withCallees) || !Number.isInteger(withCallees) || withCallees < 0 || withCallees > 10) return json(400, { error: "withCallees: a whole number from 0 to 10" });
    const selection = parseClipSelection(raw.shapes, raw.edges);

    if (isRefusal(selection)) return json(400, { error: selection });
    const done = await analysis();

    if (!done.snapshot) return json(409, { error: "no code to read (`languages` in keylang.json is empty)" });
    // The flows: the names given, else the flow of an open `flow:` view, else none.
    const wanted = viewOfKey(view);
    const names = named ?? (wanted?.view.kind === "flow" ? [wanted.view.name] : []);
    const flows: ExportFlow[] = [];

    if (names.length > 0) {
      const resolved = exportFlows(options.root, done, names);

      if ("error" in resolved) return json(400, { error: resolved.error });
      flows.push(...resolved.flows);
    } else {
      // No flow open: the selection's IDs as one flow of their own.
      const name = fragmentName(selection.shapes);
      const text = fragmentFlow(name, selection.shapes);

      if (text === null) return json(400, { error: "nothing to copy: select shapes with keylang IDs, or open a flow" });
      flows.push({ name, origin: "spec", source: `web:${view || "canvas"}`, text, process: null });
    }

    // The selection's layout rides along so a paste can draw the shapes where they were.
    const layout = selection.shapes.length === 0 ? "" : clipLayoutText(clipLayout(view, selection.shapes, selection.edges));
    const bundle = await exportBundle(options.root, done, flows, withCallees, keylangVersion(), layout);

    return json(200, { text: bundle.text, header: bundle.header, flows: flows.map((f) => f.name), shapes: selection.shapes.length, summary: bundle.summary, messages: bundle.messages });
  };

  /**
   * `POST /api/bundle-import` (business-flows/25): a paste — `{text, layerMap?, mode?, output?}`.
   * The text is data: it is parsed as a bundle and never run. From another repository it
   * goes through `flow import` (`output: "preview"` first: the layer choices for the
   * dialog; then `proposal`: the feature and the migration table as proposals); from this
   * repository nothing is written and the shapes come back for copies with new draft IDs.
   * Either way the shapes to draw, re-homed, at the bundle's layout (or laid out here).
   */
  const bundleImport = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const json = <Body>(status: number, body: Body): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);
    const body = await jsonBody(request, response, "bundle-import", "POST", MAX_MODEL_BODY);

    if (body === NO_BODY) return;

    if (!isJsonObject(body)) return json(400, { error: "the body: {text, layerMap?, mode?, output?}" });
    // Validate the paste and its options; each wrong field gets its own error.
    const raw = body;
    const pastedText = raw.text;

    if (!isJsonString(pastedText)) return json(400, { error: "text: the pasted bundle" });
    const mode = raw.mode ?? "algo";

    if (mode !== "algo" && mode !== "hybrid") return json(400, { error: "mode: algo or hybrid" });
    const output = raw.output ?? "proposal";

    if (output !== "preview" && output !== "proposal") return json(400, { error: "output: preview or proposal" });
    let layerMap: string | undefined;

    // The layer map arrives as an object and goes on as `from=to,…`, the CLI's form; layer names may not contain `=`, `,` or spaces.
    if (raw.layerMap !== undefined) {
      const map = raw.layerMap;

      const pairs = isJsonObject(map) ? Object.entries(map) : null;
      const layers = pairs?.flatMap(([from, to]) => (isJsonString(to) && /^[^=,\s]+$/.test(from) && /^[^=,\s]+$/.test(to) ? [`${from}=${to}`] : []));

      if (pairs === null || layers === undefined || layers.length !== pairs.length) return json(400, { error: "layerMap: {<layer of the bundle>: <layer here>}" });
      layerMap = layers.join(",");
    }

    // The bundle text is parsed as data, never run.
    const bundle = parseBundle(pastedText);

    if ("error" in bundle) return json(400, { error: bundle.error });
    const here = gitOf(options.root);

    // From this repository: nothing to import, only the shapes to draw as copies.
    if (bundle.header.repo === here.repo) {
      const pasted = pastedShapes(bundle, [], []);

      return json(200, { sameRepo: true, header: bundle.header, flows: bundle.flows.map((f) => f.name), ...pasted });
    }

    // From another repository: `flow import`, with the paste as the bundle's text.
    const importRequest: FlowImportRequest = { kind: "flow-import", root: options.root, bundle: "clipboard.bundle.md", source: pastedText, mode, output, pending: "refuse" };

    if (layerMap !== undefined) importRequest.layerMap = layerMap;
    const done = await runFlowImport(importRequest, { analyze: () => analysis() });
    const notes = done.messages.filter((m) => m.level === "warning").map((m) => m.text);

    if (done.status !== "completed" || !done.payload) {
      const errors = done.messages.filter((m) => m.level === "error").map((m) => m.text);

      return json(done.exitCode === 1 ? 409 : 400, { error: errors.join("; ") || `the import ${done.status}`, notes });
    }

    // Imported: the shapes to draw with the IDs and layers the import assigned.
    const payload = done.payload;
    const pasted = pastedShapes(bundle, payload.ids, payload.layers);

    return json(200, {
      sameRepo: false,
      header: payload.header,
      flows: bundle.flows.map((f) => f.name),
      used: usedLayers(bundle),
      sourceLayers: bundle.layers.map((l) => ({ name: l.name, description: l.description })),
      targetLayers: payload.targetLayers,
      layers: payload.layers,
      ids: payload.ids,
      target: payload.target,
      migrationTarget: payload.migrationTarget,
      proposals: payload.proposals,
      agent: payload.agent,
      notes,
      ...pasted,
      // JSON.stringify leaves an undefined `merge` out: no proposals, no merge hint.
      merge: payload.proposals.length > 0 ? `merge them with MERGE in the TUI (\`keylang\`, m on a proposal), or a person runs \`keylang proposals accept ${payload.target}\` and \`keylang proposals accept ${payload.migrationTarget}\`` : undefined,
    });
  };

  /** `GET /api/views`, `/api/diagram?view=…`, `/api/usages?id=…`, `/api/calls?id=…`, `/api/ids?prefix=…`, `/api/coverage`, `/api/tour`; `POST /api/flow-proposal`: JSON for the diagram client (`GET /api/export?format=bpmn|drawio&view=…`: the file), with the socket's token as a Bearer. */
  const api = async (request: IncomingMessage, response: ServerResponse, path: string, query: URLSearchParams): Promise<void> => {
    // These paths are public (docs/tui.md); any other is the 404 of every unknown path, token or not.
    if (!API_PATHS.has(path)) return reply(response, 404, "text/plain", "not found\n");

    // Then the guards, in order: same origin and the Bearer token; read-only mode; a cross-site write.
    if (!sameOrigin(request) || !sameSecret(bearerToken(request), token)) return reply(response, 403, "text/plain", "forbidden\n");

    if (readOnly && (request.method !== "GET" || !READ_PATHS.has(path))) return reply(response, 403, "application/json", `${JSON.stringify({ error: "read-only: this keylang web (--read-only) writes nothing" })}\n`);

    if (request.method !== "GET") {
      // A write: a browser's own word that the request comes from another site refuses it, besides Origin.
      const site = request.headers["sec-fetch-site"];

      if (site !== undefined && site !== "same-origin" && site !== "none") return reply(response, 403, "text/plain", "forbidden\n");
    }

    // The write endpoints have handlers of their own; every other path is a read.
    if (path === "/api/flow-proposal") return flowProposal(request, response);

    if (path === "/api/diagram-proposal") return diagramProposal(request, response);

    if (path === "/api/bundle") return bundleRequest(request, response);

    if (path === "/api/bundle-import") return bundleImport(request, response);

    if (path === "/api/layout") return layoutRequest(request, response, query);

    if (path === "/api/greenfield") return greenfieldRequest(request, response);

    if (request.method !== "GET") return reply(response, 405, "text/plain", "method not allowed\n");

    return send(response, await read.answer(path, query));
  };

  /** Routes one HTTP request: the API, the built and xterm assets, the diagram page and the terminal page. */
  const serve = (request: IncomingMessage, response: ServerResponse): void => {
    // A request line the socket accepts may still be no URL (`GET //[`): that is the client's error, not the server's end.
    const path = pathOf(request.url);

    if (path === null) return reply(response, 400, "text/plain", "bad request\n");

    if (!allowedHost(request.headers.host)) return reply(response, 421, "text/plain", "unknown host\n");

    // The API runs async; a failure answers 500, or cuts a reply already under way.
    if (path === "/api" || path.startsWith("/api/")) {
      api(request, response, path, new URL(request.url ?? "/", "http://localhost").searchParams).catch((cause: unknown) => {
        process.stderr.write(`keylang web: ${cause instanceof Error ? cause.message : String(cause)}\n`);

        if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
        else response.destroy();
      });

      return;
    }

    const assetName = path.startsWith("/assets/") ? path.slice("/assets/".length) : null;

    // A built diagram-client file: built first in a checkout when missing or stale.
    if (assetName !== null && isBuiltName(assetName)) {
      const name = assetName;
      ensureClient()
        .then(() => {
          const file = join(BUILT_DIR, name);

          if (!existsSync(file)) return reply(response, 404, "text/plain", "not built: run `npm run web:build`\n");
          reply(response, 200, BUILT[name], readFileSync(file));
        })
        .catch((cause: unknown) => {
          process.stderr.write(`keylang web: ${cause instanceof Error ? cause.message : String(cause)}\n`);

          if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
        });

      return;
    }

    // An xterm.js asset, from the package or `node_modules`.
    if (assetName !== null) {
      if (!isAssetName(assetName)) return reply(response, 404, "text/plain", "not found\n");
      const file = assetPath(assetName);

      if (!file) return reply(response, 404, "text/plain", "not found\n");

      return reply(response, 200, ASSETS[assetName].type, readFileSync(file));
    }

    if (path === "/diagrams") {
      // Static like `/`: the token stays in the fragment and the data comes from `/api/`, which needs it. No inline script.
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");

      return reply(response, 200, "text/html; charset=utf-8", diagramsPage({ readOnly }));
    }

    if (path !== "/") return reply(response, 404, "text/plain", "not found\n");

    // No terminal in a viewer: the diagram page is the whole of it. The fragment (the token) survives a redirect.
    if (readOnly) {
      response.setHeader("Location", "diagrams");

      return reply(response, 302, "text/plain", "/diagrams\n");
    }

    // The page is static and holds no data; everything goes through the socket, which needs the token.
    response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${request.headers.host}; img-src 'self' data:`);

    return reply(response, 200, "text/html; charset=utf-8", page());
  };

  /** `handle` of `WebApp`: `serve` with every throw turned into a 500. */
  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    // One request failing (an asset that cannot be read) answers 500; the server and its sessions go on.
    try {
      serve(request, response);
    } catch (error) {
      process.stderr.write(`keylang web: ${error instanceof Error ? error.message : String(error)}\n`);

      if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
      else response.destroy();
    }
  };

  /** Refuses a socket upgrade with a plain HTTP status. */
  const refuse = (socket: Duplex, status = "403 Forbidden"): void => {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  };

  /** `upgrade` of `WebApp`: only `/ws`, with the token, the right Host and the same origin, and never in read-only mode. */
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // A reset from the client must not become an uncaught error of the server.
    socket.on("error", () => socket.destroy());
    const path = pathOf(request.url);

    if (path === null) return refuse(socket, "400 Bad Request");
    const origin = request.headers.origin;

    if (readOnly || path !== "/ws" || !authorized(request) || !allowedHost(request.headers.host) || (origin !== undefined && origin !== `http://${request.headers.host}`)) return refuse(socket);
    wss.handleUpgrade(request, socket, head, (connection) => connect(connection));
  };

  /** Wires one accepted socket: liveness for the heartbeat, its messages, and its close. */
  const connect = (connection: WebSocket): void => {
    alive.set(connection, true);
    connection.on("pong", () => alive.set(connection, true));
    connection.on("error", () => connection.terminate());
    let session: Session | null = null;
    connection.on("message", (data, binary) => {
      if (binary) return;

      // One session failing must not stop the server and every other session with it.
      try {
        receive(data.toString());
      } catch (error) {
        process.stderr.write(`keylang web: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      }
    });

    /** Applies one message from the page: `hello` opens or rejoins a session; the rest drive it. */
    const receive = (text: string): void => {
      let parsed: JsonValue;

      // A message that is no JSON is ignored, not an error.
      try {
        parsed = parseJson(text);
      } catch {
        return;
      }

      // Every message is an object; an array or a scalar is ignored.
      if (!isJsonObject(parsed)) return;
      const message = parsed;
      // Sizes from the page are clamped to the grid limits; absent or bad sizes fall back to 80×24.
      const cols = clampSize(message.cols, 80, MAX_COLS);
      const rows = clampSize(message.rows, 24, MAX_ROWS);

      if (message.type === "hello" && session === null) {
        try {
          session = hello(connection, message.session, cols, rows);
        } catch (error) {
          // No session could be opened: the tab says why instead of staying blank.
          const reason = error instanceof Error ? error.message : String(error);
          connection.send(`\x1b[0m\x1b[2J\x1b[H keylang: cannot open a session: ${withoutControls(reason)}\r\n`);
          connection.close(CLOSE_ENDED, "no session");
        }

        return;
      }

      // A connection whose session moved to another tab no longer drives it.
      if (!session || session.connection !== connection) return;

      // Keys and pastes, resizes, and the microphone's PCM and its end or failure.
      if (message.type === "input" && isJsonString(message.data)) session.app.input(message.data, true);
      else if (message.type === "resize") session.app.resize(cols, rows);
      else if (message.type === "audio") {
        const pcm = pcmOf(message.data);

        if (pcm) session.audio?.push(pcm);
      } else if (message.type === "audio-end") {
        session.audio?.end();
        session.audio = null;
      } else if (message.type === "audio-error") {
        session.audio?.end(new Error(`voice: the browser gave no microphone${isJsonString(message.data) ? ` (${message.data.slice(0, 200)})` : ""}`));
        session.audio = null;
      }
    };

    // A closed socket detaches its session and starts the expiry timer; a reconnect within `keepMs` resumes it.
    connection.on("close", () => {
      const current = session;

      if (!current || current.connection !== connection) return;
      current.connection = null;
      current.app.detach();
      // A tab closed while it recorded sends no `audio-end`: the recording ends here, not never.
      current.audio?.end(new Error("voice: the page closed during the recording"));
      current.audio = null;
      current.timer = setTimeout(() => {
        current.app.close();

        for (const [id, value] of sessions) if (value === current) sessions.delete(id);
      }, options.keepMs ?? KEEP_MS);
      current.timer.unref();
    });
  };

  /** Opens session `requested` (a fresh ID when absent or malformed), or rejoins it, and attaches `connection` to it. */
  const hello = (connection: WebSocket, requested: JsonValue | undefined, cols: number, rows: number): Session => {
    const id = isJsonString(requested) && /^[\w-]{8,64}$/.test(requested) ? requested : randomBytes(8).toString("hex");
    // A new session: a fresh `App` whose quit closes the socket and forgets the session.
    let found = sessions.get(id);

    if (!found) {
      const appOptions: AppOptions = {
        root: options.root,
        cols,
        rows,
        analyzer,
        onQuit: () => {
          const ended = sessions.get(id);
          sessions.delete(id);

          if (ended?.timer) clearTimeout(ended.timer);
          // The session's resources (its operation worker) end with it.
          ended?.app.close();
          ended?.connection?.send("\x1b[0m\x1b[2J\x1b[H keylang session ended; reload the page for a new one.\r\n");
          ended?.connection?.close(CLOSE_ENDED, "session ended");
        },
        // The browser's microphone: the page records while `Ctrl+R` does, and sends PCM on this socket.
        microphone: async () => {
          const current = sessions.get(id);
          const socket = current?.connection;

          if (!current || !socket) return null;
          current.audio?.end();
          const queue = new AudioQueue();
          current.audio = queue;
          socket.send(control({ type: "mic", on: true }));

          // The page answers "mic off" with `audio-end`; without a page there is nobody to wait for.
          return { chunks: queue.chunks(), stop: () => (current.connection ? current.connection.send(control({ type: "mic", on: false })) : queue.end()) };
        },
      };

      if (options.operations) appOptions.operations = options.operations;
      const app = new App(appOptions);
      found = { app, connection: null, timer: null, audio: null };
      sessions.set(id, found);
    }

    // A rejoined session no longer expires.
    if (found.timer) clearTimeout(found.timer);
    found.timer = null;
    // A newer tab of the same session takes it over. The session points at the
    // new connection first, so the close of the old one does not detach it.
    const previous = found.connection;
    found.connection = connection;
    previous?.close(CLOSE_TAKEN, "session opened in another tab");
    // xterm.js follows the same modes as a terminal: SGR mouse and bracketed paste are opt-in.
    connection.send(ENTER);
    found.app.attach({ write: (ansi) => connection.send(ansi) }, cols, rows);

    return found;
  };

  // Every `PING_MS`: drop sockets that did not answer the last ping, then ping the rest.
  const heartbeat = setInterval(() => {
    for (const connection of wss.clients) {
      if (alive.get(connection) === false) {
        connection.terminate();
        continue;
      }

      alive.set(connection, false);
      connection.ping();
    }
  }, PING_MS);

  heartbeat.unref();

  return {
    token,
    handle,
    upgrade,
    setPort: (value) => {
      port = value;
    },
    unsaved: () => [...sessions.values()].flatMap((session) => session.app.unsaved()),
    // Shutdown: stop the heartbeat, close every session's `App`, drop sockets and the analysis worker.
    close: async () => {
      clearInterval(heartbeat);

      for (const session of sessions.values()) {
        session.app.close();

        if (session.timer) clearTimeout(session.timer);
      }

      sessions.clear();

      for (const connection of wss.clients) connection.terminate();
      wss.close();
      worker.close();
    },
  };
}

/** A rejection no session handled (a helper it did not track) would end the process, and every session's unsaved buffers with it: it is logged instead. */
export function logUnhandled(): () => void {
  const onRejection = (cause: unknown): void => {
    process.stderr.write(`keylang web: unhandled rejection: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`);
  };

  process.on("unhandledRejection", onRejection);

  return () => process.off("unhandledRejection", onRejection);
}

/** The address in a printed URL: `localhost` for loopback, a bracketed IPv6 address. */
export function shownHost(host: string): string {
  return host === "127.0.0.1" || host === "::1" || host === "localhost" ? "localhost" : host.includes(":") ? `[${host}]` : host;
}

/** Starts `keylang web` for one repository on `options.port` (0: any free port); the URL carries the token in its fragment. */
export async function serveWeb(options: WebOptions): Promise<WebServer> {
  const host = options.host ?? "127.0.0.1";
  const app = createWebApp(options);
  const server: Server = createServer(app.handle);
  server.on("upgrade", app.upgrade);
  // Wait until the server listens; a taken port rejects here.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => resolve());
  });
  // SAFETY: a server listening on a host and port reports an AddressInfo; a string comes only from a pipe or a Unix socket.
  const port = (server.address() as AddressInfo).port;
  app.setPort(port);
  const stopLogging = logUnhandled();

  return {
    url: `http://${shownHost(host)}:${port}/#t=${app.token}`,
    port,
    unsaved: app.unsaved,
    close: async () => {
      stopLogging();
      await app.close();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // Idle keep-alive sockets and upgrades that never finished would hold `close` open.
      server.closeAllConnections();
      await closed;
    },
  };
}

/** The paths of the diagram API; any other under `/api/` is 404. */
const API_PATHS: ReadonlySet<string> = new Set([...READ_PATHS, "/api/flow-proposal", "/api/diagram-proposal", "/api/greenfield", "/api/bundle", "/api/bundle-import"]);

/** The largest body `POST /api/flow-proposal` reads. */
const MAX_BODY = 64 * 1024;

/** The largest layout `PUT /api/layout` reads. */
const MAX_LAYOUT_BODY = 2 * 1024 * 1024;

/** The largest model `POST /api/diagram-proposal` reads. */
const MAX_MODEL_BODY = 4 * 1024 * 1024;

/** What `jsonBody` returns when it has answered the request itself. */
const NO_BODY: unique symbol = Symbol("no body");

/**
 * The JSON body of a write, or `NO_BODY` once the refusal is sent: another
 * method is 405, a content type that is not `application/json` 415 (an HTML
 * form cannot send it), a body over `max` 413, no JSON 400.
 */
async function jsonBody(request: IncomingMessage, response: ServerResponse, name: string, method: string, max: number): Promise<JsonValue | typeof NO_BODY> {
  /** Answers an error as JSON and returns `NO_BODY`. */
  const json = (status: number, body: { error: string }): typeof NO_BODY => {
    reply(response, status, "application/json", `${JSON.stringify(body)}\n`);

    return NO_BODY;
  };

  if (request.method !== method) {
    response.setHeader("Allow", method);

    return json(405, { error: `${name} takes ${method}` });
  }

  if (!/^application\/json\s*(;|$)/i.test(String(request.headers["content-type"] ?? ""))) return json(415, { error: `${name} takes Content-Type: application/json` });
  const text = await readBody(request, max);

  if (text === null) return json(413, { error: `the body is larger than ${max} bytes` });

  try {
    return parseJson(text);
  } catch {
    return json(400, { error: "the body is no JSON" });
  }
}

/** The editor's layout from a `PUT /api/layout` body (`{layout: {key: {x, y, …}}}`), or what is wrong with it. */
function parseClientLayout(body: JsonValue): ClientLayout | string {
  const layout = isJsonObject(body) ? body.layout : undefined;

  if (!isJsonObject(layout)) return "the body: {layout: {<shape key>: {x, y, w?, h?, points?}}}";
  const out: ClientLayout = {};
  const finite = (value: JsonValue | undefined): value is number => isJsonNumber(value) && Number.isFinite(value);

  // Copy only known fields with the right types, so the file gets no stray data from the page.
  for (const [key, entry] of Object.entries(layout)) {
    if (!isJsonObject(entry)) return `layout.${key}: an object`;

    if (!finite(entry.x) || !finite(entry.y)) return `layout.${key}: needs x and y`;
    const clean: ClientEntry = { x: entry.x, y: entry.y };

    if (finite(entry.w)) clean.w = entry.w;

    if (finite(entry.h)) clean.h = entry.h;

    // Optional edge waypoints; one bad point refuses the whole layout.
    if (Array.isArray(entry.points)) {
      const points: { x: number; y: number }[] = [];

      for (const point of entry.points) {
        if (!isJsonObject(point) || !finite(point.x) || !finite(point.y)) return `layout.${key}.points: {x, y} each`;
        points.push({ x: point.x, y: point.y });
      }

      clean.points = points;
    }

    for (const field of ["id", "kind", "label", "note", "colour", "proposed", "from", "to"] as const) {
      const value = entry[field];

      if (isJsonString(value)) clean[field] = value;
    }

    out[key] = clean;
  }

  return out;
}

/** A request's body as text, or null when it is larger than `max` bytes (the rest is not read). */
function readBody(request: IncomingMessage, max: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    // Count bytes as they come and stop collecting past `max`; the rest of the body is ignored, not buffered.
    request.on("data", (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;

      if (size > max) {
        over = true;
        resolve(null);

        return;
      }

      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!over) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

/** The token of an `Authorization: Bearer <token>` header. */
function bearerToken(request: IncomingMessage): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(String(request.headers.authorization ?? ""));

  return match ? match[1]! : null;
}

/** The path of a request target, or null when it is not a URL at all. */
function pathOf(target: string | undefined): string | null {
  try {
    return new URL(target ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
}

/** A read answer as the HTTP reply, an attachment with its file name. */
function send(response: ServerResponse, answer: ReadAnswer): void {
  if (answer.file !== undefined) response.setHeader("Content-Disposition", `attachment; filename="${answer.file}"`);
  reply(response, answer.status, answer.type, answer.body);
}

/** Writes a whole reply: no caching, and no MIME sniffing of the body. */
function reply(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

/**
 * The diagram page: markup only; `diagrams.js` fills it. Over HTTP it takes the
 * token from the fragment and reads `/api/`; `source` names another transport:
 * `static` reads the answers a static export wrote under `data/`, `local`
 * analyses a folder the person opens in the tab (`app.html`). A read-only
 * page (`--read-only`, both static ones) has no editor and no terminal link.
 */
export function diagramsPage(options: { readOnly?: boolean; source?: "server" | "static" | "local"; assets?: string; title?: string; shards?: number } = {}): string {
  const source = options.source ?? "server";
  // The pages a static export writes have no server to write to, so they are read-only too.
  const readOnly = options.readOnly === true || source !== "server";
  // Relative to the page, so a server mounted under `/r/<id>/` (`web --hub`) serves the same markup.
  const assets = options.assets ?? "assets/";
  const title = options.title ?? "keylang · діаграми";
  // The title is the only value put in the markup that may come from outside (a repository name), so it is escaped.
  const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${assets}diagrams.css">
<script src="${assets}diagrams.js" defer></script>
</head>
<body data-source="${source}"${readOnly ? ' data-readonly="1"' : ""}${options.shards !== undefined ? ` data-shards="${options.shards}"` : ""}>
<aside id="list">
<header><span>Діаграми</span>${source === "server" && !readOnly ? '<a href="./">термінал</a>' : ""}</header>
<nav id="modes" aria-label="Режим"><button type="button" data-mode="diagrams" aria-pressed="true">Діаграми</button><button type="button" data-mode="docs" aria-pressed="false">Карта</button><button type="button" data-mode="explore" aria-pressed="false">Дослідник</button><button type="button" data-mode="blind" aria-pressed="false">Сліпі зони</button><button type="button" data-mode="changes" aria-pressed="false">Зміни</button>${readOnly ? "" : '<button type="button" data-mode="editor" aria-pressed="false">Редактор</button>'}</nav>
<div id="find">
<input id="search" type="search" placeholder="Пошук: флоу, точка входу, ID" aria-label="Пошук">
<button id="find-usages" type="button" title="Де використовується цей ID">де ID?</button>
</div>
<div id="views" role="list"></div>
</aside>
<main>
<div id="toolbar"><div id="status">loading…</div><button id="zoom-out" type="button" title="Зменшити">−</button><button id="zoom-in" type="button" title="Збільшити">+</button><button id="zoom-fit" type="button" title="Вмістити">вмістити</button></div>
<div id="stage">
<div id="graph"></div>
<div id="legend" aria-label="Легенда"></div>
<div id="minimap" aria-label="Мінікарта"></div>
<div id="matrix" aria-label="Матриця залежностей шарів"></div>
</div>
<section id="docs" aria-label="Карта й специфікації"></section>
<section id="changes" aria-label="Зміни від бази"></section>
<section id="explorer" aria-label="Дослідник точок входу"></section>
<section id="blind" aria-label="Сліпі зони"></section>
<section id="editor" aria-label="Редактор діаграм"></section>
</main>
<aside id="details"></aside>
</body>
</html>
`;
}

/** The page: xterm.js from `/assets/`, a WebSocket back to this server, reconnect with the same session. */
function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>keylang</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="assets/xterm.css">
<style>
  html, body { margin: 0; height: 100%; background: #1c1c1c; }
  #term { position: absolute; inset: 0; padding: 4px; }
  #state { position: fixed; right: 8px; bottom: 8px; font: 12px system-ui, sans-serif; color: #ddd; background: #5f3a00; padding: 4px 8px; border-radius: 4px; display: none; }
  #diagrams { position: fixed; right: 8px; top: 6px; z-index: 10; font: 12px system-ui, sans-serif; color: #9cc4ff; background: #262b33; padding: 2px 8px; border-radius: 4px; opacity: 0.6; text-decoration: none; }
  #diagrams:hover, #diagrams:focus { opacity: 1; }
</style>
</head>
<body>
<div id="term"></div>
<a id="diagrams" href="diagrams" target="_blank" rel="noopener">Діаграми</a>
<div id="state">reconnecting…</div>
<script src="assets/xterm.js"></script>
<script src="assets/addon-fit.js"></script>
<script>
(() => {
  // The token comes in the fragment once; the address bar and history keep only \`/\`.
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get("t");
  if (fromUrl) {
    sessionStorage.setItem("keylang-token", fromUrl);
    history.replaceState(null, "", location.pathname);
  }
  const token = sessionStorage.getItem("keylang-token") || "";
  // The diagram page opens in a new tab, which has its own sessionStorage: the token goes along in the fragment.
  if (token) document.getElementById("diagrams").href = "diagrams#t=" + encodeURIComponent(token);
  let session = sessionStorage.getItem("keylang-session");
  if (!session) {
    session = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("keylang-session", session);
  }
  const term = new Terminal({
    fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
    fontSize: 14,
    cursorBlink: false,
    allowProposedApi: false,
    theme: { background: "#1c1c1c" },
    // OSC 8 links go to vscode://; xterm.js ignores non-HTTP links unless allowed.
    linkHandler: { allowNonHttpProtocols: true, activate: (event, uri) => { if (/^(https?|vscode):/.test(uri)) window.location.href = uri; } },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById("term"));
  fit.fit();
  const state = document.getElementById("state");
  let socket = null;
  let delay = 250;
  let failures = 0;
  const send = (message) => { if (socket && socket.readyState === 1) socket.send(JSON.stringify(message)); };
  const connect = () => {
    socket = new WebSocket(new URL("ws", location.href).href.replace(/^http/, "ws").replace(/#.*$/, ""), ["${PROTOCOL}", "${TOKEN_PROTOCOL}" + token]);
    socket.onerror = () => {};
    socket.onopen = () => {
      delay = 250;
      failures = 0;
      state.style.display = "none";
      send({ type: "hello", session, cols: term.cols, rows: term.rows });
    };
    socket.onmessage = (event) => {
      // A frame starting with NUL is a control message (the microphone), never ANSI.
      if (typeof event.data === "string" && event.data.charCodeAt(0) === 0) return onControl(JSON.parse(event.data.slice(1)));
      term.write(event.data);
    };
    socket.onclose = (event) => {
      if (event.code === ${CLOSE_ENDED}) return;
      // Another tab took the session: wait for a click here, or two tabs would take it back and forth.
      if (event.code === ${CLOSE_TAKEN}) {
        state.textContent = "this session is open in another tab — click to use it here";
        state.style.display = "block";
        state.style.cursor = "pointer";
        state.onclick = () => { state.onclick = null; state.style.cursor = ""; state.textContent = "reconnecting…"; connect(); };
        return;
      }
      // Refused again and again: a restarted server has a new token, or this tab never had one.
      failures++;
      state.textContent = !token ? "open the URL printed by \`keylang web\` (it carries the access token)" : failures >= 3 ? "cannot connect — if the server restarted, open the new URL it printed" : "reconnecting…";
      state.style.display = "block";
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 4000);
    };
  };
  // Voice (Ctrl+R): 16 kHz mono PCM from getUserMedia, as base64 s16le in "audio" messages.
  let mic = null;
  // Every "mic" message starts a new generation: a microphone granted after "mic off" (or after a newer
  // "mic on") belongs to an older one and is released at once instead of recording on.
  let micGeneration = 0;
  const onControl = async (message) => {
    if (message.type !== "mic") return;
    const generation = ++micGeneration;
    if (!message.on) {
      if (mic) {
        mic.node.disconnect();
        mic.stream.getTracks().forEach((track) => track.stop());
        mic.context.close();
        mic = null;
      }
      send({ type: "audio-end" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      if (generation !== micGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const node = context.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
        const bytes = new Uint8Array(pcm.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        send({ type: "audio", data: btoa(binary) });
      };
      source.connect(node);
      node.connect(context.destination);
      mic = { stream, context, node };
    } catch (error) {
      if (generation === micGeneration) send({ type: "audio-error", data: String(error) });
    }
  };
  term.onData((data) => send({ type: "input", data }));
  term.onBinary((data) => send({ type: "input", data }));
  term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
  window.addEventListener("resize", () => fit.fit());
  term.focus();
  connect();
})();
</script>
</body>
</html>
`;
}
