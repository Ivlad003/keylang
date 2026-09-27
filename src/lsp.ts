// Stdio language server. Diagnostics, hover, definition, symbols, and completion
// use the same in-memory analysis as `keylang check`. Buffer text is never written.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { analyze } from "./analyze.ts";
import type { Diagnostic } from "./diag.ts";
import { collectMdFiles, load } from "./files.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import { parse } from "./parser.ts";
import { check, refineOpacity, type Index } from "./resolve.ts";
import { blocksDependency, evaluateRules } from "./rules.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";

interface Rpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

interface TextDoc {
  uri?: string;
  text?: string;
}

export async function serveLsp(read: NodeJS.ReadableStream = process.stdin, write: NodeJS.WritableStream = process.stdout): Promise<void> {
  let buffer = Buffer.alloc(0);
  let root = process.cwd();
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
      if (message.method === "initialize") {
        const params = message.params ?? {};
        const hinted = typeof params.rootUri === "string" ? filePath(params.rootUri) : null;
        if (hinted && existsSync(hinted)) root = hinted;
      }
      try {
        const response = await handle(message, root);
        if (response) send(write, response);
      } catch (error) {
        send(write, { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32603, message: error instanceof Error ? error.stack ?? error.message : String(error) } });
      }
    }
  }
}

async function handle(message: Rpc, root: string): Promise<Rpc | null> {
  if (!message.method || message.id === undefined) return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: {
          diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
          hoverProvider: true,
          definitionProvider: true,
          documentSymbolProvider: true,
          completionProvider: { triggerCharacters: [" ", "."] },
          referencesProvider: true,
        },
      },
    };
  }
  if (message.method === "shutdown") return { jsonrpc: "2.0", id: message.id, result: null };
  const textDocument = message.params?.textDocument as TextDoc | undefined;
  const viewed = await view(root, textDocument);
  if (message.method === "textDocument/diagnostic") {
    const items = viewed.diagnostics.filter((diag) => uriMatches(textDocument?.uri, diag.file, root) || (textDocument?.text !== undefined && diag.file === viewed.bufferPath));
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        kind: "full",
        items: items.map((diag) => ({
          range: rangeOf(diag.span.start.line, diag.span.start.col),
          severity: diag.severity === "error" ? 1 : 2,
          code: diag.code,
          message: diag.message,
          source: "keylang",
        })),
      },
    };
  }
  if (message.method === "textDocument/documentSymbol") {
    return { jsonrpc: "2.0", id: message.id, result: symbols(viewed.docs, viewed.index) };
  }
  if (message.method === "textDocument/hover" || message.method === "textDocument/definition") {
    const word = wordAt(viewed.text, message.params?.position as { line?: number; character?: number } | undefined);
    const node = word ? viewed.snapshot?.nodes[word] : undefined;
    const decl = word ? viewed.index.lookup(word) : { kind: "missing" as const };
    if (!node && decl.kind === "missing") return { jsonrpc: "2.0", id: message.id, result: null };
    const id = word ?? "";
    const file = node?.file ?? (decl.kind !== "missing" ? decl.decl.file : null);
    const line = node?.line ?? (decl.kind !== "missing" ? decl.decl.span.start.line : 1);
    const col = decl.kind !== "missing" ? decl.decl.span.start.col : 1;
    if (message.method === "textDocument/definition") {
      const target = file ? pathToFileURL(file.startsWith("/") ? file : join(root, file)).href : (textDocument?.uri ?? "");
      return { jsonrpc: "2.0", id: message.id, result: { uri: target, range: rangeOf(line ?? 1, col) } };
    }
    const signature = node?.signature ? ` ${node.signature}` : "";
    const where = file ? `\n${file}:${line ?? 1}` : "";
    return { jsonrpc: "2.0", id: message.id, result: { contents: { kind: "plaintext", value: `${node?.kind ?? "id"} ${id}${signature}${where}` } } };
  }
  if (message.method === "textDocument/completion") {
    return { jsonrpc: "2.0", id: message.id, result: { isIncomplete: false, items: completions(viewed, message.params?.position as { line?: number } | undefined) } };
  }
  if (message.method === "textDocument/references") {
    const word = wordAt(viewed.text, message.params?.position as { line?: number; character?: number } | undefined);
    const hits: { uri: string; range: ReturnType<typeof rangeOf> }[] = [];
    if (word) {
      for (const doc of viewed.docs) {
        for (const section of doc.sections) {
          for (const top of sectionNodes(section)) {
            walk(top, (node) => {
              const mentioned = node.id === word || node.refs.some((ref) => ref.target === word);
              if (!mentioned) return;
              hits.push({ uri: pathToFileURL(join(root, doc.path)).href, range: rangeOf(node.span.start.line, node.span.start.col) });
            });
          }
        }
      }
    }
    return { jsonrpc: "2.0", id: message.id, result: hits };
  }
  return { jsonrpc: "2.0", id: message.id, result: null };
}

interface View {
  snapshot: AnalysisSnapshot | null;
  docs: Document[];
  index: Index;
  diagnostics: Diagnostic[];
  text: string;
  bufferPath: string | null;
}

async function view(root: string, textDocument: TextDoc | undefined): Promise<View> {
  let snapshot: AnalysisSnapshot | null = null;
  let specDir = "keylang";
  try {
    const analyzed = await analyze(root);
    snapshot = analyzed.index;
    specDir = analyzed.config.dir;
  } catch {
    snapshot = null;
  }
  const specRoot = join(root, specDir);
  const docs = existsSync(specRoot) ? load(collectMdFiles([specRoot])) : [];
  const bufferPath = textDocument?.uri ? relativeTo(root, filePath(textDocument.uri)) : null;
  const text = textDocument?.text ?? (textDocument?.uri && existsSync(filePath(textDocument.uri)) ? readFileSync(filePath(textDocument.uri), "utf8") : "");
  if (textDocument?.text !== undefined && bufferPath) {
    const parsed = parse(bufferPath, textDocument.text);
    const at = docs.findIndex((doc) => doc.path === bufferPath);
    if (at >= 0) docs[at] = parsed;
    else docs.push(parsed);
  }
  const { index, diagnostics: resolveDiags } = check(docs);
  const refined = refineOpacity(docs, index, snapshot?.nodes ?? null);
  const rules = evaluateRules(docs, index, snapshot);
  const diagnostics = [...docs.flatMap((doc) => doc.diagnostics), ...resolveDiags, ...refined.added, ...rules.diagnostics];
  return { snapshot, docs, index, diagnostics, text, bufferPath };
}

function completions(viewed: View, position: { line?: number } | undefined): { label: string; kind: number; detail?: string }[] {
  const from = position?.line !== undefined ? enclosingId(viewed.docs, viewed.bufferPath, position.line + 1) : null;
  const labels = new Map<string, { label: string; kind: number; detail?: string }>();
  for (const [id, node] of Object.entries(viewed.snapshot?.nodes ?? {})) {
    if (node.kind !== "module" && node.kind !== "fn") continue;
    if (from && blocksDependency(viewed.docs, from, id)) continue;
    labels.set(id, { label: id, kind: node.kind === "fn" ? 12 : 2, ...(node.signature ? { detail: node.signature } : {}) });
  }
  for (const doc of viewed.docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind !== "planned" || !node.id) return;
          if (from && blocksDependency(viewed.docs, from, node.id)) return;
          labels.set(node.id, { label: node.id, kind: 12, detail: "planned" });
        });
      }
    }
  }
  return [...labels.values()].sort((a, b) => (a.label < b.label ? -1 : 1));
}

function enclosingId(docs: readonly Document[], bufferPath: string | null, line: number): string | null {
  let found: string | null = null;
  for (const doc of docs) {
    if (bufferPath && doc.path !== bufferPath) continue;
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.span.start.line !== line) return;
          const id = node.id ?? node.refs[0]?.target ?? null;
          if (id) found = id;
        });
      }
    }
  }
  return found;
}

function symbols(docs: readonly Document[], index: Index): { name: string; kind: number; range: ReturnType<typeof rangeOf>; selectionRange: ReturnType<typeof rangeOf> }[] {
  const out: { name: string; kind: number; range: ReturnType<typeof rangeOf>; selectionRange: ReturnType<typeof rangeOf> }[] = [];
  const add = (name: string, kind: number, line: number, col: number) => {
    const range = rangeOf(line, col);
    out.push({ name, kind, range, selectionRange: range });
  };
  for (const decl of index.decls.values()) add(decl.id, decl.kind === "fn" ? 12 : 2, decl.span.start.line, decl.span.start.col);
  for (const flow of index.flows.values()) add(flow.id, 11, flow.span.start.line, flow.span.start.col);
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind !== "allow" && node.kind !== "deny" && node.kind !== "entry" && node.kind !== "layers" && node.kind !== "no-cycles" && node.kind !== "rule-module") return;
          const name = node.kind === "rule-module" ? (node.refs[0]?.target ?? "module") : node.kind;
          add(name, 7, node.span.start.line, node.span.start.col);
        });
      }
    }
  }
  return out;
}

function uriMatches(uri: string | undefined, file: string, root: string): boolean {
  if (!uri) return false;
  const path = filePath(uri);
  const abs = file.startsWith("/") ? file : join(root, file);
  return path === abs || path.endsWith(`/${file}`);
}

function filePath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  return decodeURIComponent(new URL(uri).pathname);
}

function relativeTo(root: string, path: string): string {
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path;
}

function rangeOf(line: number, col: number): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return { start: { line: Math.max(0, line - 1), character: Math.max(0, col - 1) }, end: { line: Math.max(0, line - 1), character: Math.max(0, col) } };
}

function wordAt(text: string, position: { line?: number; character?: number } | undefined): string | null {
  if (!position || position.line === undefined || position.character === undefined) return null;
  const line = text.split("\n")[position.line] ?? "";
  const at = position.character;
  for (const found of line.matchAll(/[\p{L}_][\p{L}\p{N}_.-]*/gu)) {
    const start = found.index ?? 0;
    if (at >= start && at <= start + found[0].length) return found[0];
  }
  return null;
}

function send(write: NodeJS.WritableStream, message: Rpc): void {
  const json = JSON.stringify(message);
  write.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

void sectionNodes;
void walk;
