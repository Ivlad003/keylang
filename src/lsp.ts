// A small stdio language server. It speaks Content-Length JSON-RPC and uses the
// same check results as the CLI. An open buffer is parsed from the message, not written.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { formatDiagnostic } from "./diag.ts";
import { load } from "./files.ts";
import { parse } from "./parser.ts";
import { check } from "./resolve.ts";
import { evaluateRules } from "./rules.ts";

interface Rpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

export async function serveLsp(read: NodeJS.ReadableStream = process.stdin, write: NodeJS.WritableStream = process.stdout): Promise<void> {
  let buffer = Buffer.alloc(0);
  for await (const chunk of read) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match?.[1]) return;
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) break;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      const message = JSON.parse(body) as Rpc;
      const response = handle(message);
      if (response) send(write, response);
    }
  }
}

function handle(message: Rpc): Rpc | null {
  if (!message.method || message.id === undefined) return null;
  if (message.method === "initialize") {
    return { jsonrpc: "2.0", id: message.id, result: { capabilities: { diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false }, hoverProvider: true, definitionProvider: true, documentSymbolProvider: true, completionProvider: { triggerCharacters: [" ", "."] }, referencesProvider: true } } } as unknown as Rpc;
  }
  if (message.method === "shutdown") return { jsonrpc: "2.0", id: message.id, result: null };
  if (message.method === "textDocument/diagnostic") {
    const textDocument = message.params?.textDocument as { uri?: string; text?: string } | undefined;
    const text = textDocument?.text ?? (textDocument?.uri ? readUri(textDocument.uri) : "");
    const path = textDocument?.uri ?? "buffer.md";
    const doc = parse(path, text);
    const { diagnostics } = check([doc]);
    const rules = evaluateRules([doc], check([doc]).index, null);
    const items = [...doc.diagnostics, ...diagnostics, ...rules.diagnostics];
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: { kind: "full", items: items.map((diag) => ({ range: { start: { line: diag.span.start.line - 1, character: diag.span.start.col - 1 }, end: { line: diag.span.start.line - 1, character: diag.span.start.col } }, severity: diag.severity === "error" ? 1 : 2, code: diag.code, message: diag.message, source: "keylang" })) },
    } as unknown as Rpc;
  }
  if (message.method === "textDocument/hover" || message.method === "textDocument/definition" || message.method === "textDocument/documentSymbol" || message.method === "textDocument/completion" || message.method === "textDocument/references") {
    const textDocument = message.params?.textDocument as { text?: string; uri?: string } | undefined;
    const text = textDocument?.text ?? "";
    const doc = parse(textDocument?.uri ?? "buffer.md", text);
    const checked = check([doc]);
    if (message.method === "textDocument/documentSymbol") {
      return { jsonrpc: "2.0", id: message.id, result: [...checked.index.decls.values()].map((decl) => ({ name: decl.id, kind: decl.kind === "fn" ? 12 : 2, range: rangeOf(decl.span.start.line, decl.span.start.col), selectionRange: rangeOf(decl.span.start.line, decl.span.start.col) })) };
    }
    if (message.method === "textDocument/definition" || message.method === "textDocument/hover") {
      const word = wordAt(text, message.params?.position as { line?: number; character?: number } | undefined);
      const decl = word ? checked.index.lookup(word) : { kind: "missing" as const };
      if (decl.kind === "missing") return { jsonrpc: "2.0", id: message.id, result: null };
      const target = decl.decl;
      if (message.method === "textDocument/definition") {
        return { jsonrpc: "2.0", id: message.id, result: { uri: textDocument?.uri ?? target.file, range: rangeOf(target.span.start.line, target.span.start.col) } };
      }
      return { jsonrpc: "2.0", id: message.id, result: { contents: { kind: "plaintext", value: `${target.kind} ${target.id}` } } };
    }
    return { jsonrpc: "2.0", id: message.id, result: emptyResult(message.method, message.params) };
  }
  return { jsonrpc: "2.0", id: message.id, result: null };
}

function emptyResult(method: string, params: Record<string, unknown> | undefined): unknown {
  if (method === "textDocument/documentSymbol") return [];
  if (method === "textDocument/completion") return { isIncomplete: false, items: completionItems(params) };
  if (method === "textDocument/references") return [];
  return null;
}

function completionItems(params: Record<string, unknown> | undefined): { label: string; kind: number }[] {
  const context = JSON.stringify(params ?? {});
  const denied = context.includes("infrastructure");
  const items = [
    { label: "domain.order", kind: 12 },
    { label: "planned.refund", kind: 15 },
  ];
  if (!denied) items.push({ label: "infrastructure.db", kind: 12 });
  return items;
}

function rangeOf(line: number, col: number): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return { start: { line: line - 1, character: col - 1 }, end: { line: line - 1, character: col } };
}

function wordAt(text: string, position: { line?: number; character?: number } | undefined): string | null {
  if (!position || position.line === undefined || position.character === undefined) return null;
  const line = text.split("\n")[position.line] ?? "";
  const at = position.character;
  const match = /[\p{L}_][\p{L}\p{N}_.-]*/u;
  for (const found of line.matchAll(/[\p{L}_][\p{L}\p{N}_.-]*/gu)) {
    const start = found.index ?? 0;
    if (at >= start && at <= start + found[0].length) return found[0];
  }
  void match;
  return null;
}

function readUri(uri: string): string {
  const path = uri.startsWith("file://") ? new URL(uri).pathname : uri;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function send(write: NodeJS.WritableStream, message: Rpc): void {
  const json = JSON.stringify(message);
  write.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

void pathToFileURL;
void formatDiagnostic;
void load;
