// Stdio language server. It keeps the open buffers, runs one analysis per
// generation of changes (the same `analyze()` as `keylang check`, with the
// buffers as an overlay; nothing is written), and answers from the latest
// generation only: a request waits while a reanalysis is pending, and results
// of a superseded generation are never published.
//
// The protocol subset is small, so it is spoken directly instead of through
// `vscode-languageserver`, which would add a dependency for a few messages.

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

const ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, internal: -32603, cancelled: -32800 } as const;
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
  private running: { generation: number; result: Promise<Analysis> } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private shutdown = false;
  /** The client pulls diagnostics (`textDocument/diagnostic`), so pushing them too would show each twice. */
  private pulls = false;
  private refreshes = false;
  private serverRequests = 0;
  /** The last analysis failure shown to the client (an invalid keylang.json); shown again only when it changes. */
  private failure: string | null = null;

  constructor(send: (message: Rpc) => void) {
    this.send = send;
  }

  reject(id: number | string | null, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  receive(message: Rpc): void {
    // A response to one of our requests (`workspace/diagnostic/refresh`) needs nothing.
    if (typeof message.method !== "string") return;
    if (message.id === undefined || message.id === null) {
      // A notification has no reply channel: a failure (a URI that is not a local file) is logged.
      try {
        this.notify(message.method, message.params ?? {});
      } catch (error) {
        process.stderr.write(`keylang lsp: ${message.method}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      return;
    }
    const id = message.id;
    this.open.add(id);
    const task = this.request(message.method, message.params ?? {})
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
    const doc = params.textDocument as { uri?: string; version?: number; text?: string } | undefined;
    switch (method) {
      case "textDocument/didOpen":
        if (doc?.uri !== undefined && doc.text !== undefined) this.buffers.set(filePath(doc.uri), { uri: doc.uri, version: doc.version ?? 0, text: doc.text });
        this.changed();
        return;
      case "textDocument/didChange": {
        const changes = params.contentChanges as { text?: string; range?: unknown }[] | undefined;
        // Full sync: the last change without a range is the whole text.
        const full = [...(changes ?? [])].reverse().find((change) => change.range === undefined && change.text !== undefined);
        if (doc?.uri !== undefined && full?.text !== undefined) this.buffers.set(filePath(doc.uri), { uri: doc.uri, version: doc.version ?? 0, text: full.text });
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
      case "exit":
        this.exitCode = this.shutdown ? 0 : 1;
        return;
      default:
        return;
    }
  }

  /** A new generation: the running analysis, if any, is superseded. */
  private changed(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, SETTLE_MS);
  }

  private analysis(): Promise<Analysis> {
    if (this.running?.generation === this.generation) return this.running.result;
    const overlay = new Map([...this.buffers].map(([path, buffer]) => [path, buffer.text]));
    const result = analyze({ root: this.root, overlay });
    this.running = { generation: this.generation, result };
    // A failure (an invalid keylang.json) would otherwise reach the client only as errors of later requests.
    result.then(
      () => {
        this.failure = null;
      },
      (error: unknown) => this.report(error instanceof Error ? error.message : String(error)),
    );
    return result;
  }

  /** The analysis of the current buffers; waits again when they change meanwhile. */
  private async current(): Promise<Workspace> {
    for (;;) {
      const generation = this.generation;
      const analysis = await this.analysis();
      if (generation === this.generation) return workspace(this.root, analysis, new Map([...this.buffers].map(([path, buffer]) => [path, buffer.text])));
    }
  }

  private async publish(): Promise<void> {
    const generation = this.generation;
    let ws: Workspace;
    try {
      ws = await this.current();
    } catch {
      return;
    }
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

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === "initialize") return this.initialize(params);
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
    const path = doc?.uri ? this.relative(filePath(doc.uri)) : "";
    const position = params.position as LspPosition | undefined;
    switch (method) {
      case "textDocument/diagnostic":
        return { kind: "full", items: diagnosticsFor(await this.current(), path) };
      case "textDocument/hover":
        return position ? hover(await this.current(), path, position) : null;
      case "textDocument/definition":
        return position ? definition(await this.current(), path, position) : null;
      case "textDocument/references":
        return position ? references(await this.current(), path, position, (params.context as { includeDeclaration?: unknown } | undefined)?.includeDeclaration !== false) : [];
      case "textDocument/documentSymbol":
        return documentSymbols(await this.current(), path);
      case "textDocument/completion":
        return { isIncomplete: false, items: position ? completions(await this.current(), path, position) : [] };
      case "textDocument/signatureHelp":
        return position ? signatureHelp(await this.current(), path, position) : null;
      case "textDocument/codeLens":
        return codeLenses(await this.current(), path);
      case "workspace/symbol":
        const ws = await this.current();
        return workspaceSymbols(ws, loadBriefs(ws.analysis.config), typeof params.query === "string" ? params.query : "");
      default:
        throw new LspError(ERRORS.methodNotFound, `unsupported method \`${method}\``);
    }
  }

  private initialize(params: Record<string, unknown>): unknown {
    const capabilities = (params.capabilities ?? {}) as { textDocument?: { diagnostic?: unknown }; workspace?: { diagnostics?: { refreshSupport?: boolean } } };
    this.pulls = capabilities.textDocument?.diagnostic !== undefined;
    this.refreshes = capabilities.workspace?.diagnostics?.refreshSupport === true;
    const folders = params.workspaceFolders as { uri?: string }[] | null | undefined;
    const hinted = typeof params.rootUri === "string" ? params.rootUri : (folders?.[0]?.uri ?? (typeof params.rootPath === "string" ? pathToFileURL(params.rootPath).href : null));
    if (hinted) {
      // `resolve` drops a trailing slash (`file:///repo/`), so root-relative paths stay relative.
      const path = resolve(filePath(hinted));
      if (existsSync(path)) this.root = findRoot(statSync(path).isDirectory() ? path : dirname(path));
    } else {
      this.root = findRoot(this.root);
    }
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
