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

import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join, relative } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { analyze, type Analysis } from "../analyze.ts";
import { checkResults, type CheckResult } from "../check-results.ts";
import { toPosix } from "../config.ts";
import { diagramOf, flowListing, parseView, usagesOf, viewsOf, type Diagram, type DiagramNode } from "../diagram.ts";
import { PROCESSES_FILE, processViews, readProcesses } from "../discover-names.ts";
import { DISCOVERED_FLOWS_DIR } from "../map.ts";
import { buildTour, tourMarkdown } from "../tour.ts";
import { parse } from "../parser.ts";
import { compileSpec, type SpecIR } from "../spec-ir.ts";
import { App, MAX_COLS, MAX_ROWS, type Analyzer, type OperationRunner } from "./app.ts";
import { SnapshotWorker } from "./background.ts";
import { ENTER } from "./screen.ts";

/** A detached session is kept this long for a reconnect. */
const KEEP_MS = 10 * 60 * 1000;
/** A socket that does not answer a ping within this interval is dropped. */
const PING_MS = 30 * 1000;
/** One message larger than this closes the connection (the client sends keys and sizes). */
const MAX_MESSAGE = 1 << 20;
/** Close codes the page understands: another tab took the session; the session ended. */
export const CLOSE_TAKEN = 4000;
export const CLOSE_ENDED = 4001;

const ASSETS = {
  "xterm.js": { pkg: "@xterm/xterm", file: "lib/xterm.js", type: "text/javascript" },
  "xterm.css": { pkg: "@xterm/xterm", file: "css/xterm.css", type: "text/css" },
  "addon-fit.js": { pkg: "@xterm/addon-fit", file: "lib/addon-fit.js", type: "text/javascript" },
} as const;

type AssetName = keyof typeof ASSETS;

/** The diagram client, bundled by scripts/build-web.mjs (ADR 0024): it exists only as built files, never in a package. */
const BUILT = {
  "diagrams.js": "text/javascript",
  "diagrams.css": "text/css",
} as const;

type BuiltName = keyof typeof BUILT;

// Literal directory URLs: `dist/tui/web.js` and `src/tui/web.ts` both sit two levels below the package root.
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BUILT_DIR = join(PACKAGE_ROOT, "dist", "web");
/** Only a checkout has the client's sources; the published package has the built files alone. */
const CLIENT_SOURCES = join(PACKAGE_ROOT, "web", "src");

/** The newest modification time under a directory, in ms. */
function newestUnder(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  }
  return newest;
}

/** Whether the bundle is missing or older than the client's sources or its build script. */
function clientStale(): boolean {
  if (!existsSync(CLIENT_SOURCES)) return false;
  const bundle = join(BUILT_DIR, "diagrams.js");
  if (!existsSync(bundle)) return true;
  const script = join(PACKAGE_ROOT, "scripts", "build-web.mjs");
  return statSync(bundle).mtimeMs < Math.max(newestUnder(CLIENT_SOURCES), existsSync(script) ? statSync(script).mtimeMs : 0);
}

let building: Promise<void> | null = null;

/** In a checkout, builds the diagram client when it is missing or stale (esbuild takes about a second); concurrent requests share one build. */
function ensureClient(): Promise<void> {
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
  try {
    const asset = ASSETS[name];
    const dir = dirname(createRequire(import.meta.url).resolve(`${asset.pkg}/package.json`));
    const file = join(dir, asset.file);
    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

export interface WebServer {
  url: string;
  port: number;
  /** Specs with unsaved changes, across sessions. */
  unsaved(): string[];
  close(): Promise<void>;
}

/** The subprotocol the page speaks; the token rides along as `keylang.t.<token>`. */
export const PROTOCOL = "keylang";
const TOKEN_PROTOCOL = `${PROTOCOL}.t.`;

interface Session {
  app: App;
  connection: WebSocket | null;
  timer: NodeJS.Timeout | null;
  /** The browser's microphone while `Ctrl+R` records: PCM the page sends in `audio` messages. */
  audio: AudioQueue | null;
}

/** A control message for the page: a frame that starts with NUL, which no ANSI frame does. */
function control(message: object): string {
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

  push(chunk: Int16Array): void {
    if (this.ended || this.samples + chunk.length > MAX_SAMPLES) return;
    this.samples += chunk.length;
    this.pending.push(chunk);
    this.wake();
  }

  end(failure: Error | null = null): void {
    this.ended = true;
    this.failure ??= failure;
    this.wake();
  }

  private wake(): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.();
  }

  /** The chunks as they come, until `end`. */
  async *chunks(): AsyncGenerator<Int16Array> {
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
function pcmOf(data: unknown): Int16Array | null {
  if (typeof data !== "string" || data.length > MAX_MESSAGE) return null;
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0 || bytes.length % 2 !== 0) return null;
  const pcm = new Int16Array(bytes.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = bytes.readInt16LE(i * 2);
  return pcm;
}

/** A size from the client: an integer within the grid limits, else the fallback. */
export function clampSize(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function sameSecret(given: string | null | undefined, token: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The token a socket offers among its subprotocols. */
function offeredToken(request: IncomingMessage): string | null {
  for (const protocol of String(request.headers["sec-websocket-protocol"] ?? "").split(",")) {
    const name = protocol.trim();
    if (name.startsWith(TOKEN_PROTOCOL)) return name.slice(TOKEN_PROTOCOL.length);
  }
  return null;
}

export interface WebOptions {
  root: string;
  port: number;
  host?: string;
  analyzer?: Analyzer;
  /** Every session's operation runner (tests inject a gated one); default: the session's own worker, as in a terminal. */
  operations?: OperationRunner;
  /** How long a detached session waits for a reconnect. */
  keepMs?: number;
}

export async function serveWeb(options: WebOptions): Promise<WebServer> {
  const host = options.host ?? "127.0.0.1";
  const token = randomBytes(16).toString("hex");
  const worker = new SnapshotWorker();
  const analyzer: Analyzer = options.analyzer ?? ((request) => analyze({ ...request, generate: worker.generate }));
  const sessions = new Map<string, Session>();
  const alive = new WeakMap<WebSocket, boolean>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE, perMessageDeflate: false, handleProtocols: (offered) => (offered.has(PROTOCOL) ? PROTOCOL : false) });
  let port = options.port;

  // On loopback the Host header stops DNS rebinding; on another address the token alone guards access.
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
  const allowedHost = (header: string | undefined): boolean => {
    if (!header) return false;
    return !loopback || [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(header);
  };
  const authorized = (request: IncomingMessage): boolean => sameSecret(offeredToken(request), token);
  // A page of another origin may send a request but must not read the answer: the Origin a browser sets is checked as for the socket.
  const sameOrigin = (request: IncomingMessage): boolean => request.headers.origin === undefined || request.headers.origin === `http://${request.headers.host}`;

  // Concurrent API requests share one analysis; the next request after it ends analyses again (the code may have changed).
  let pending: Promise<Analysis> | null = null;
  const analysis = (): Promise<Analysis> => {
    pending ??= Promise.resolve()
      .then(() => analyzer({ root: options.root }))
      .finally(() => (pending = null));
    return pending;
  };

  // The discovered view (`<dir>/flows-discovered/*.md`) parsed as specs, kept while its files are the same: `check` never reads it (ADR 0014).
  let discoveredCache: { key: string; spec: SpecIR } | null = null;
  const discoveredSpec = (done: Analysis): SpecIR | null => {
    const dir = join(options.root, done.config.dir, DISCOVERED_FLOWS_DIR);
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
      const docs = files.map((file) => parse(toPosix(relative(options.root, file)), readFileSync(file, "utf8")));
      discoveredCache = { key, spec: compileSpec(docs).spec };
    }
    return discoveredCache.spec;
  };

  /** `GET /api/views`, `GET /api/diagram?view=…`, `GET /api/usages?id=…`, `GET /api/tour`: JSON for the diagram client, with the socket's token as a Bearer. */
  const api = async (request: IncomingMessage, response: ServerResponse, path: string, query: URLSearchParams): Promise<void> => {
    // These paths are public (docs/tui.md); any other is the 404 of every unknown path, token or not.
    if (path !== "/api/views" && path !== "/api/diagram" && path !== "/api/usages" && path !== "/api/tour") return reply(response, 404, "text/plain", "not found\n");
    if (!sameOrigin(request) || !sameSecret(bearerToken(request), token)) return reply(response, 403, "text/plain", "forbidden\n");
    if (request.method !== "GET") return reply(response, 405, "text/plain", "method not allowed\n");
    const json = (status: number, body: unknown): void => reply(response, status, "application/json", `${JSON.stringify(body)}\n`);
    // The project tour (business-flows/15): the data of `keylang tour --json` and its Markdown, for the «Огляд» tab.
    if (path === "/api/tour") {
      const done = await analysis();
      if (done.snapshot === null) return json(200, { reason: "no code to read: `languages` in keylang.json is empty" });
      const tour = await buildTour({ config: done.config, snapshot: done.snapshot, spec: done.spec });
      return json(200, { ...tour, markdown: tourMarkdown(tour) });
    }
    if (path === "/api/usages") {
      const id = query.get("id")?.trim() ?? "";
      if (id === "") return json(400, { error: "usages needs id=" });
      const done = await analysis();
      return json(200, usagesOf(done.snapshot, done.spec, discoveredSpec(done), id));
    }
    // A discovered flow is drawn like a flow, from the discovered view and without verdicts: `check` does not judge it.
    const discovered = path === "/api/diagram" && query.get("view") === "discovered";
    const view = path !== "/api/diagram" ? null : parseView(discovered ? new URLSearchParams({ view: "flow", name: query.get("name") ?? "" }) : query);
    if (typeof view === "string") return json(400, { error: discovered ? "view=discovered needs name=" : view });
    const done = await analysis();
    // The business processes `flows discover --names` saved, with their flows found again in this snapshot.
    const processes = done.snapshot ? processViews(done.snapshot, done.spec, readProcesses(done.config.root, done.config.dir)) : [];
    if (view === null) {
      const found = discoveredSpec(done);
      const entries = new Map((done.snapshot?.entries ?? []).map((entry) => [entry.id, entry]));
      return json(200, {
        ...viewsOf(done.snapshot, done.spec, processes),
        root: options.root,
        flowList: flowListing(done.snapshot, done.spec),
        discovered: (found ? flowListing(done.snapshot, found) : []).map(({ ids: _ids, ...flow }) => {
          const entry = flow.trigger === null ? undefined : entries.get(flow.trigger);
          return { ...flow, ...(entry ? { kind: entry.kind, label: entry.label } : {}) };
        }),
      });
    }
    if (discovered) {
      const found = discoveredSpec(done);
      return json(200, found ? diagramOf({ snapshot: done.snapshot, spec: found, results: [], view }) : { nodes: [], edges: [], groups: [], reason: "no discovered flows: run `keylang flows discover`" });
    }
    const results = checkResults(done.verdicts, done.snapshot?.snapshotId ?? null, done.diagnostics);
    return json(200, withResults(diagramOf({ snapshot: done.snapshot, spec: done.spec, results, view, processes }), results));
  };

  const serve = (request: IncomingMessage, response: ServerResponse): void => {
    // A request line the socket accepts may still be no URL (`GET //[`): that is the client's error, not the server's end.
    const path = pathOf(request.url);
    if (path === null) return reply(response, 400, "text/plain", "bad request\n");
    if (!allowedHost(request.headers.host)) return reply(response, 421, "text/plain", "unknown host\n");
    if (path === "/api" || path.startsWith("/api/")) {
      api(request, response, path, new URL(request.url ?? "/", "http://localhost").searchParams).catch((error: unknown) => {
        process.stderr.write(`keylang web: ${error instanceof Error ? error.message : String(error)}\n`);
        if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
        else response.destroy();
      });
      return;
    }
    if (path.startsWith("/assets/") && Object.hasOwn(BUILT, path.slice("/assets/".length))) {
      const name = path.slice("/assets/".length) as BuiltName;
      ensureClient()
        .then(() => {
          const file = join(BUILT_DIR, name);
          if (!existsSync(file)) return reply(response, 404, "text/plain", "not built: run `npm run web:build`\n");
          reply(response, 200, BUILT[name], readFileSync(file));
        })
        .catch((error: unknown) => {
          process.stderr.write(`keylang web: ${error instanceof Error ? error.message : String(error)}\n`);
          if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
        });
      return;
    }
    if (path.startsWith("/assets/")) {
      const name = path.slice("/assets/".length) as AssetName;
      const file = Object.hasOwn(ASSETS, name) ? assetPath(name) : null;
      if (!file) return reply(response, 404, "text/plain", "not found\n");
      return reply(response, 200, ASSETS[name].type, readFileSync(file));
    }
    if (path === "/diagrams") {
      // Static like `/`: the token stays in the fragment and the data comes from `/api/`, which needs it. No inline script.
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
      return reply(response, 200, "text/html; charset=utf-8", diagramsPage());
    }
    if (path !== "/") return reply(response, 404, "text/plain", "not found\n");
    // The page is static and holds no data; everything goes through the socket, which needs the token.
    response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${request.headers.host}; img-src 'self' data:`);
    return reply(response, 200, "text/html; charset=utf-8", page());
  };

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    // One request failing (an asset that cannot be read) answers 500; the server and its sessions go on.
    try {
      serve(request, response);
    } catch (error) {
      process.stderr.write(`keylang web: ${error instanceof Error ? error.message : String(error)}\n`);
      if (!response.headersSent) reply(response, 500, "text/plain", "server error\n");
      else response.destroy();
    }
  });

  const refuse = (socket: Duplex, status = "403 Forbidden"): void => {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  };

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    // A reset from the client must not become an uncaught error of the server.
    socket.on("error", () => socket.destroy());
    const path = pathOf(request.url);
    if (path === null) return refuse(socket, "400 Bad Request");
    const origin = request.headers.origin;
    if (path !== "/ws" || !authorized(request) || !allowedHost(request.headers.host) || (origin !== undefined && origin !== `http://${request.headers.host}`)) return refuse(socket);
    wss.handleUpgrade(request, socket, head, (connection) => connect(connection));
  });

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
    const receive = (text: string): void => {
      let message: { type?: unknown; session?: unknown; data?: unknown; cols?: unknown; rows?: unknown };
      try {
        message = JSON.parse(text) as typeof message;
      } catch {
        return;
      }
      if (typeof message !== "object" || message === null) return;
      const cols = clampSize(message.cols, 80, MAX_COLS);
      const rows = clampSize(message.rows, 24, MAX_ROWS);
      if (message.type === "hello" && session === null) {
        try {
          session = hello(connection, message.session, cols, rows);
        } catch (error) {
          // No session could be opened: the tab says why instead of staying blank.
          const reason = error instanceof Error ? error.message : String(error);
          connection.send(`\x1b[0m\x1b[2J\x1b[H keylang: cannot open a session: ${reason.replace(/[\x00-\x1f\x7f]/g, " ")}\r\n`);
          connection.close(CLOSE_ENDED, "no session");
        }
        return;
      }
      // A connection whose session moved to another tab no longer drives it.
      if (!session || session.connection !== connection) return;
      if (message.type === "input" && typeof message.data === "string") session.app.input(message.data);
      else if (message.type === "resize") session.app.resize(cols, rows);
      else if (message.type === "audio") {
        const pcm = pcmOf(message.data);
        if (pcm) session.audio?.push(pcm);
      } else if (message.type === "audio-end") {
        session.audio?.end();
        session.audio = null;
      } else if (message.type === "audio-error") {
        session.audio?.end(new Error(`voice: the browser gave no microphone${typeof message.data === "string" ? ` (${message.data.slice(0, 200)})` : ""}`));
        session.audio = null;
      }
    };
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

  const hello = (connection: WebSocket, requested: unknown, cols: number, rows: number): Session => {
    const id = typeof requested === "string" && /^[\w-]{8,64}$/.test(requested) ? requested : randomBytes(8).toString("hex");
    let found = sessions.get(id);
    if (!found) {
      const app = new App({
        root: options.root,
        cols,
        rows,
        analyzer,
        ...(options.operations ? { operations: options.operations } : {}),
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
      });
      found = { app, connection: null, timer: null, audio: null };
      sessions.set(id, found);
    }
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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  // A rejection no session handled (a helper it did not track) would make Node end the process, and with it
  // every other session and its unsaved buffers: while the server runs it is logged instead.
  const onRejection = (reason: unknown): void => {
    process.stderr.write(`keylang web: unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}\n`);
  };
  process.on("unhandledRejection", onRejection);
  const shown = loopback ? "localhost" : host.includes(":") ? `[${host}]` : host;
  return {
    url: `http://${shown}:${port}/#t=${token}`,
    port,
    unsaved: () => [...sessions.values()].flatMap((session) => session.app.unsaved()),
    close: async () => {
      process.off("unhandledRejection", onRejection);
      clearInterval(heartbeat);
      for (const session of sessions.values()) {
        session.app.close();
        if (session.timer) clearTimeout(session.timer);
      }
      sessions.clear();
      for (const connection of wss.clients) connection.terminate();
      wss.close();
      worker.close();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // Idle keep-alive sockets and upgrades that never finished would hold `close` open.
      server.closeAllConnections();
      await closed;
    },
  };
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

function reply(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

/** The diagram page: markup only; `/assets/diagrams.js` takes the token from the fragment and fills it from `/api/`. */
function diagramsPage(): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>keylang · діаграми</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/assets/diagrams.css">
<script src="/assets/diagrams.js" defer></script>
</head>
<body>
<aside id="list">
<header><span>Діаграми</span><a href="/">термінал</a></header>
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
</div>
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
<link rel="stylesheet" href="/assets/xterm.css">
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
<a id="diagrams" href="/diagrams" target="_blank" rel="noopener">Діаграми</a>
<div id="state">reconnecting…</div>
<script src="/assets/xterm.js"></script>
<script src="/assets/addon-fit.js"></script>
<script>
(() => {
  // The token comes in the fragment once; the address bar and history keep only \`/\`.
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get("t");
  if (fromUrl) {
    sessionStorage.setItem("keylang-token", fromUrl);
    history.replaceState(null, "", "/");
  }
  const token = sessionStorage.getItem("keylang-token") || "";
  // The diagram page opens in a new tab, which has its own sessionStorage: the token goes along in the fragment.
  if (token) document.getElementById("diagrams").href = "/diagrams#t=" + encodeURIComponent(token);
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
    socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws", ["${PROTOCOL}", "${TOKEN_PROTOCOL}" + token]);
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
