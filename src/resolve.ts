// Cross-file ID resolution: builds the declaration index and reports
// duplicate declarations (K002) and dangling references (K001).

import { diagnostic, type Diagnostic } from "./diag.ts";
import { isDecl, sectionNodes, walk, type Document, type Node, type NodeKind } from "./ir.ts";
import type { Span } from "./span.ts";

export interface Decl {
  id: string;
  kind: NodeKind;
  file: string;
  /** Span of the declared name (LSP: definition target). */
  span: Span;
  /**
   * Module declares `fn`/`type`/`event`/`module` children. A module without
   * members is opaque: `module.anything` resolves to it.
   */
  hasMembers: boolean;
}

export type Lookup =
  | { kind: "exact"; decl: Decl }
  /** Resolved into an opaque module (the tail is not modelled). */
  | { kind: "opaque"; decl: Decl }
  | { kind: "missing" };

export class Index {
  readonly decls = new Map<string, Decl>();
  readonly flows = new Map<string, Decl>();

  lookup(id: string): Lookup {
    const exact = this.decls.get(id);
    if (exact) return { kind: "exact", decl: exact };
    const prefix = this.longestPrefix(id);
    if (prefix && prefix.kind === "module" && !prefix.hasMembers) return { kind: "opaque", decl: prefix };
    return { kind: "missing" };
  }

  private longestPrefix(id: string): Decl | undefined {
    let end = id.length;
    for (;;) {
      const dot = id.lastIndexOf(".", end - 1);
      if (dot === -1) return undefined;
      end = dot;
      const d = this.decls.get(id.slice(0, end));
      if (d) return d;
    }
  }

  /** Best-effort "did you mean" among siblings of the missing segment. */
  suggest(id: string): string | undefined {
    const prefix = this.longestPrefix(id)?.id;
    const rest = prefix === undefined ? id : id.slice(prefix.length + 1);
    const missing = rest.split(".")[0]?.toLowerCase();
    if (missing === undefined) return undefined;
    const depth = (prefix === undefined ? 0 : prefix.split(".").length) + 1;
    let best: [number, string] | undefined;
    for (const k of this.decls.keys()) {
      if (k.split(".").length !== depth) continue;
      if (prefix !== undefined && !k.startsWith(`${prefix}.`)) continue;
      const last = k.slice(k.lastIndexOf(".") + 1).toLowerCase();
      const score = last.includes(missing) || missing.includes(last) ? 0 : levenshtein(last, missing);
      if (score > 2) continue;
      if (!best || score < best[0] || (score === best[0] && k < best[1])) best = [score, k];
    }
    return best?.[1];
  }

  toJSON(): { decls: Record<string, Decl>; flows: Record<string, Decl> } {
    return { decls: Object.fromEntries(this.decls), flows: Object.fromEntries(this.flows) };
  }
}

/** Build the index over all documents and check every reference. */
export function check(docs: readonly Document[]): { index: Index; diagnostics: Diagnostic[] } {
  const index = new Index();
  const diags: Diagnostic[] = [];

  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind === "flow" && section.name) {
        insert(
          index.flows,
          { id: section.name.value, kind: "step", file: doc.path, span: section.name.span, hasMembers: false },
          "flow",
          diags,
        );
      }
      for (const node of sectionNodes(section)) {
        walk(node, (n) => {
          if (isDecl(n.kind) && n.id !== null && n.name) {
            insert(index.decls, { id: n.id, kind: n.kind, file: doc.path, span: n.name.span, hasMembers: false }, "ID", diags);
          }
        });
      }
    }
  }

  for (const d of index.decls.values()) {
    if (d.kind === "fn" || d.kind === "type" || d.kind === "event" || d.kind === "module") {
      const dot = d.id.lastIndexOf(".");
      if (dot === -1) continue;
      const parent = index.decls.get(d.id.slice(0, dot));
      if (parent) parent.hasMembers = true;
    }
  }

  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const node of sectionNodes(section)) checkRefs(index, doc, node, diags);
    }
  }
  return { index, diagnostics: diags };
}

function insert(map: Map<string, Decl>, decl: Decl, what: string, diags: Diagnostic[]): void {
  const prev = map.get(decl.id);
  if (!prev) {
    map.set(decl.id, decl);
    return;
  }
  // A layer may be continued in several map files.
  if (prev.kind === "layer" && decl.kind === "layer") return;
  diags.push(
    diagnostic(
      "K002",
      decl.file,
      decl.span,
      `duplicate ${what} \`${decl.id}\` (first declared at ${prev.file}:${prev.span.start.line}:${prev.span.start.col})`,
    ),
  );
}

function checkRefs(index: Index, doc: Document, node: Node, diags: Diagnostic[]): void {
  let ok = true;
  for (const r of node.refs) {
    if (index.lookup(r.target).kind === "missing") {
      ok = false;
      let msg = `dangling reference \`${r.target}\``;
      const s = index.suggest(r.target);
      if (s !== undefined) msg += ` (did you mean \`${s}\`?)`;
      diags.push(diagnostic("K001", doc.path, r.span, msg));
    }
  }
  for (const child of node.children) {
    // `exports` of an unknown module would only repeat the error.
    if (ok || node.kind !== "rule-module") checkRefs(index, doc, child, diags);
  }
}

function levenshtein(a: string, b: string): number {
  const bs = [...b];
  let prev = Array.from({ length: bs.length + 1 }, (_, i) => i);
  let i = 0;
  for (const ca of a) {
    const cur = [i + 1];
    bs.forEach((cb, j) => {
      cur.push(Math.min(prev[j]! + (ca === cb ? 0 : 1), prev[j + 1]! + 1, cur[j]! + 1));
    });
    prev = cur;
    i++;
  }
  return prev[bs.length]!;
}
