// Stdio language server. It keeps the open buffers and analyses them (the
// same `analyze()` as `keylang check`, with the buffers as an overlay; nothing
// is written). Every change is a new generation. One analysis runs at a time:
// the changes that arrive meanwhile are analysed together after it. A request
// is answered from the newest finished analysis that includes the changes
// that came before it, and results of a superseded generation are never
// published.
//
// Hand-written on purpose: framing and lifecycle are stricter than
// `vscode-languageserver` (docs/adr/0006-lsp-transport.md).

import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, findRoot, within, type Analysis } from "./analyze.ts";
import { toPosix } from "./config.ts";
import { codeLenses, completions, definition, diagnosticsFor, documentSymbols, hover, references, signatureHelp, workspace, workspaceSymbols, type LspPosition, type Workspace } from "./lsp-features.ts";
import { loadBriefs } from "./explanations.ts";

interface Rpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, internal: -32603, notInitialized: -32002, cancelled: -32800 } as const;
/** Changes that arrive together are analysed once. */
const SETTLE_MS = 60;

export async function serveLsp(read: NodeJS.ReadableStream = process.stdin, write: NodeJS.WritableStream = process.stdout): Promise<number> {
  const server = new Server((message) => {
    const json = JSON.stringify(message);
    write.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  });
  let buffer = Buffer.alloc(0);
  for await (const chunk of read) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const match = /^Content-Length:\s*(\d+)\s*$/im.exec(buffer.subarray(0, headerEnd).toString("utf8"));
      if (!match?.[1]) {
        // Without a length the stream cannot be framed again: an I/O failure (2), not the client's
        // `exit` before `shutdown` (1). Say why instead of exiting silently.
        process.stderr.write("keylang lsp: a message header without Content-Length; the stream cannot continue\n");
        await server.drain();
        return 2;
      }
      const start = headerEnd + 4;
      const length = Number(match[1]);
      if (buffer.length < start + length) break;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      // One malformed message is answered as an error; the session goes on.
      let message: unknown;
      try {
        message = JSON.parse(body);
      } catch (error) {
        server.reject(null, ERRORS.parse, `parse error: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (typeof message !== "object" || message === null || Array.isArray(message)) {
        server.reject(null, ERRORS.invalidRequest, "a message must be a JSON object");
        continue;
      }
      server.receive(message as Rpc);
      if (server.exitCode !== null) {
        await server.drain();
        return server.exitCode;
      }
    }
  }
  await server.drain();
  return server.exitCode ?? 0;
}

/** An analysis of the buffers as they were at `generation`, or why it failed. */
type Finished = { generation: number; overlay: ReadonlyMap<string, string> } & ({ analysis: Analysis } | { analysis: null; error: unknown });

class Server {
  exitCode: number | null = null;
  private root = process.cwd();
  private readonly buffers = new Map<string, { uri: string; version: number; text: string }>();
  /** Requests still being answered, and those among them already answered as cancelled. */
  private readonly open = new Set<number | string>();
  private readonly cancelled = new Set<number | string>();
  private readonly pending = new Set<Promise<void>>();
  private readonly published = new Set<string>();
  private readonly send: (message: Rpc) => void;
  private generation = 0;
  /** The newest analysis that has finished, and the one running now (at most one). */
  private finished: Finished | null = null;
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private shutdown = false;
  /** False until `initialize` has succeeded. Requests before that are not served. */
  private initialized = false;
  /** The client pulls diagnostics (`textDocument/diagnostic`), so pushing them too would show each twice. */
  private pulls = false;
  private refreshes = false;
  private serverRequests = 0;
  /** The last analysis failure shown to the client (an invalid keylang.json); shown again only when it changes. */
  private failure: string | null = null;
  /** A ranged `didChange` despite full sync was logged: once is enough. */
  private rangedLogged = false;

  constructor(send: (message: Rpc) => void) {
    this.send = send;
  }

  reject(id: number | string | null, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  receive(message: Rpc): void {
    const id = message.id;
    // JSON-RPC: an id is a string, a number or null; any other cannot be echoed in a reply.
    if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
      this.reject(null, ERRORS.invalidRequest, "`id` must be a string, a number or null");
      return;
    }
    if (message.method === undefined) {
      // A response to one of our requests (`workspace/diagnostic/refresh`) needs nothing.
      if ("result" in message || "error" in message) return;
      this.reject(id ?? null, ERRORS.invalidRequest, "a message needs `method` (a request or notification) or `result` or `error` (a response)");
      return;
    }
    if (typeof message.method !== "string") {
      this.reject(id ?? null, ERRORS.invalidRequest, "`method` must be a string");
      return;
    }
    if (id === undefined || id === null) {
      // A notification has no reply channel: a failure (a URI that is not a local file) is logged.
      try {
        this.notify(message.method, message.params ?? {});
      } catch (error) {
        process.stderr.write(`keylang lsp: ${message.method}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      return;
    }
    this.open.add(id);
    const task = this.request(message.method, message.params ?? {}, () => this.cancelled.has(id))
      .then(
        (result): Rpc => ({ jsonrpc: "2.0", id, result }),
        (error: unknown): Rpc => {
          const code = error instanceof LspError ? error.code : ERRORS.internal;
          return { jsonrpc: "2.0", id, error: { code, message: error instanceof Error ? error.message : String(error) } };
        },
      )
      .then((response) => {
        this.open.delete(id);
        // A cancelled request was answered when the cancel arrived.
        if (!this.cancelled.delete(id)) this.send(response);
      });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
    if (this.timer) clearTimeout(this.timer);
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (method === "exit") {
      this.exitCode = this.shutdown ? 0 : 1;
      return;
    }
    // A notification before `initialize` has no reply. Drop it, including `didOpen`, so the overlay stays empty.
    if (!this.initialized) return;
    const doc = params.textDocument as { uri?: string; version?: number; text?: string } | undefined;
    switch (method) {
      case "textDocument/didOpen":
        if (doc?.uri !== undefined && doc.text !== undefined) this.buffers.set(filePath(doc.uri), { uri: doc.uri, version: doc.version ?? 0, text: doc.text });
        this.changed();
        return;
      case "textDocument/didChange": {
        if (doc?.uri !== undefined) {
          const path = filePath(doc.uri);
          const text = this.edited(this.buffers.get(path)?.text ?? null, params.contentChanges);
          if (text !== null) this.buffers.set(path, { uri: doc.uri, version: doc.version ?? 0, text });
        }
        this.changed();
        return;
      }
      case "textDocument/didClose":
        if (doc?.uri !== undefined) this.buffers.delete(filePath(doc.uri));
        this.changed();
        return;
      case "textDocument/didSave":
      case "workspace/didChangeWatchedFiles":
        this.changed();
        return;
      case "$/cancelRequest": {
        const id = params.id;
        if ((typeof id === "number" || typeof id === "string") && this.open.has(id) && !this.cancelled.has(id)) {
          this.cancelled.add(id);
          this.send({ jsonrpc: "2.0", id, error: { code: ERRORS.cancelled, message: "request cancelled" } });
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * The text of a buffer after a `didChange`. The server asks for the whole
   * text (`change: 1`); a client that sends ranges anyway gets them applied in
   * order to the text it has (an unopened buffer has none) and a note in stderr, once.
   */
  private edited(text: string | null, changes: unknown): string | null {
    let out = text;
    for (const change of Array.isArray(changes) ? (changes as { text?: unknown; range?: unknown }[]) : []) {
      if (typeof change?.text !== "string") continue;
      if (change.range === undefined) {
        out = change.text;
        continue;
      }
      if (!this.rangedLogged) {
        this.rangedLogged = true;
        process.stderr.write("keylang lsp: textDocument/didChange sent a range although the server asked for the full text (textDocumentSync.change 1); the ranges are applied\n");
      }
      if (out !== null && isRange(change.range)) out = replaceRange(out, change.range, change.text);
    }
    return out;
  }

  /** A new generation: the analysis running now, if any, no longer covers the buffers. */
  private changed(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, SETTLE_MS);
  }

  /** Starts an analysis of the buffers as they are now; one runs at a time. */
  private analyse(): Promise<void> {
    const generation = this.generation;
    const overlay = new Map([...this.buffers].map(([path, buffer]) => [path, buffer.text]));
    return analyze({ root: this.root, overlay }).then(
      (analysis) => {
        this.finished = { generation, overlay, analysis };
        this.failure = null;
      },
      (error: unknown) => {
        this.finished = { generation, overlay, analysis: null, error };
        // A failure (an invalid keylang.json) would otherwise reach the client only as errors of later requests.
        this.report(error instanceof Error ? error.message : String(error));
      },
    );
  }

  /**
   * The newest finished analysis that includes generation `needed`. While
   * another analysis runs, this waits for it and then starts one for all the
   * changes so far; a request cancelled meanwhile starts none.
   */
  private async current(needed: number, cancelled: () => boolean = () => false): Promise<Workspace> {
    for (;;) {
      const done = this.finished;
      if (done !== null && done.generation >= needed) {
        if (done.analysis === null) throw done.error;
        return workspace(this.root, done.analysis, done.overlay);
      }
      if (cancelled()) throw new LspError(ERRORS.cancelled, "request cancelled");
      if (this.running === null) {
        const running = this.analyse().finally(() => {
          if (this.running === running) this.running = null;
        });
        this.running = running;
      }
      await this.running;
    }
  }

  private async publish(): Promise<void> {
    const generation = this.generation;
    let ws: Workspace;
    try {
      ws = await this.current(generation);
    } catch {
      return;
    }
    // A newer change publishes its own generation.
    if (generation !== this.generation) return;
    if (this.pulls) {
      // Ask the client to pull again: a change in one file can change another's findings.
      if (this.refreshes) this.send({ jsonrpc: "2.0", id: `keylang-${++this.serverRequests}`, method: "workspace/diagnostic/refresh", params: null as unknown as Record<string, unknown> });
      return;
    }
    const open = new Set<string>();
    for (const [abs, buffer] of this.buffers) {
      open.add(buffer.uri);
      this.send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: buffer.uri, version: buffer.version, diagnostics: diagnosticsFor(ws, this.relative(abs)) } });
    }
    for (const uri of this.published) if (!open.has(uri)) this.send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, diagnostics: [] } });
    this.published.clear();
    for (const uri of open) this.published.add(uri);
  }

  private relative(abs: string): string {
    return toPosix(within(abs, this.root) ? relative(this.root, abs) : abs);
  }

  /** In stderr (the client's log) and as a message the editor shows, once while the same failure lasts. */
  private report(message: string): void {
    if (message === this.failure) return;
    this.failure = message;
    process.stderr.write(`keylang lsp: ${message}\n`);
    this.send({ jsonrpc: "2.0", method: "window/showMessage", params: { type: 1, message: `keylang: ${message}` } });
  }

  private async request(method: string, params: Record<string, unknown>, cancelled: () => boolean): Promise<unknown> {
    if (method === "initialize") {
      // LSP: `initialize` is sent once. It counts only when it succeeds: a failed one may be sent again.
      if (this.initialized) throw new LspError(ERRORS.invalidRequest, "the server is already initialized");
      const result = this.initialize(params);
      this.initialized = true;
      return result;
    }
    // LSP: a request before `initialize` is not served, shutdown included.
    if (!this.initialized) throw new LspError(ERRORS.notInitialized, "server not initialized");
    // After `shutdown` the only valid message is `exit`.
    if (this.shutdown) throw new LspError(ERRORS.invalidRequest, `\`${method}\` after shutdown`);
    if (method === "shutdown") {
      this.shutdown = true;
      return null;
    }
    const doc = params.textDocument as { uri?: string; text?: string } | undefined;
    // A request may carry the buffer text itself (older clients and tests).
    if (doc?.uri !== undefined && doc.text !== undefined) {
      const abs = filePath(doc.uri);
      if (this.buffers.get(abs)?.text !== doc.text) {
        this.buffers.set(abs, { uri: doc.uri, version: 0, text: doc.text });
        this.generation++;
      }
    }
    // The request is about the buffers as they are now: any analysis that includes them answers it.
    const needed = this.generation;
    const ready = (): Promise<Workspace> => this.current(needed, cancelled);
    const path = doc?.uri ? this.relative(filePath(doc.uri)) : "";
    const position = params.position as LspPosition | undefined;
    switch (method) {
      case "textDocument/diagnostic":
        return { kind: "full", items: diagnosticsFor(await ready(), path) };
      case "textDocument/hover":
        return position ? hover(await ready(), path, position) : null;
      case "textDocument/definition":
        return position ? definition(await ready(), path, position) : null;
      case "textDocument/references":
        return position ? references(await ready(), path, position, (params.context as { includeDeclaration?: unknown } | undefined)?.includeDeclaration !== false) : [];
      case "textDocument/documentSymbol":
        return documentSymbols(await ready(), path);
      case "textDocument/completion":
        return { isIncomplete: false, items: position ? completions(await ready(), path, position) : [] };
      case "textDocument/signatureHelp":
        return position ? signatureHelp(await ready(), path, position) : null;
      case "textDocument/codeLens":
        return codeLenses(await ready(), path);
      case "workspace/symbol":
        const ws = await ready();
        return workspaceSymbols(ws, loadBriefs(ws.analysis.config), typeof params.query === "string" ? params.query : "");
      default:
        throw new LspError(ERRORS.methodNotFound, `unsupported method \`${method}\``);
    }
  }

  /** The capabilities; the server's state changes only once everything else succeeded. */
  private initialize(params: Record<string, unknown>): unknown {
    const capabilities = (params.capabilities ?? {}) as { textDocument?: { diagnostic?: unknown }; workspace?: { diagnostics?: { refreshSupport?: boolean } } };
    const folders = params.workspaceFolders as { uri?: string }[] | null | undefined;
    const hinted = typeof params.rootUri === "string" ? params.rootUri : (folders?.[0]?.uri ?? (typeof params.rootPath === "string" ? pathToFileURL(params.rootPath).href : null));
    let root = this.root;
    if (hinted) {
      // `resolve` drops a trailing slash (`file:///repo/`), so root-relative paths stay relative.
      const path = resolve(filePath(hinted));
      if (existsSync(path)) root = findRoot(statSync(path).isDirectory() ? path : dirname(path));
    } else {
      root = findRoot(root);
    }
    this.root = root;
    this.pulls = capabilities.textDocument?.diagnostic !== undefined;
    this.refreshes = capabilities.workspace?.diagnostics?.refreshSupport === true;
    return {
      capabilities: {
        positionEncoding: "utf-16",
        textDocumentSync: { openClose: true, change: 1, save: { includeText: false } },
        diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        completionProvider: { triggerCharacters: [" ", "."] },
        signatureHelpProvider: { triggerCharacters: [" ", "("] },
        codeLensProvider: { resolveProvider: false },
      },
      serverInfo: { name: "keylang" },
    };
  }
}

class LspError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function filePath(uri: string): string {
  return uri.startsWith("file:") ? fileURLToPath(uri) : resolve(uri);
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

function isRange(value: unknown): value is LspRange {
  const position = (p: unknown): boolean => typeof p === "object" && p !== null && Number.isInteger((p as LspPosition).line) && Number.isInteger((p as LspPosition).character);
  return typeof value === "object" && value !== null && position((value as LspRange).start) && position((value as LspRange).end);
}

/** `text` with `range` replaced by `insert`. Characters are UTF-16 code units, as JavaScript counts them. */
function replaceRange(text: string, range: LspRange, insert: string): string {
  const start = offsetAt(text, range.start);
  return text.slice(0, start) + insert + text.slice(Math.max(start, offsetAt(text, range.end)));
}

/** The offset of a position; past the end of its line is the line's end, past the last line the text's end. */
function offsetAt(text: string, position: LspPosition): number {
  let start = 0;
  for (let line = 0; line < position.line; line++) {
    const next = lineBreak(text, start);
    if (next === null) return text.length;
    start = next.after;
  }
  const end = lineBreak(text, start)?.at ?? text.length;
  return Math.min(start + Math.max(0, position.character), end);
}

/** The first line break at or after `from`: `\r\n`, `\n` or `\r`, as LSP counts lines. */
function lineBreak(text: string, from: number): { at: number; after: number } | null {
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10) return { at: i, after: i + 1 };
    if (code === 13) return { at: i, after: text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1 };
  }
  return null;
}
