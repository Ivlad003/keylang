// Intermediate representation of keylang Markdown files.
//
// The IR is a faithful tree of what was written: it keeps the raw tokens of
// every item (for `keylang fmt`) plus the interpreted parts (declared name and
// ID, code link, references, free text) with spans (for diagnostics and LSP).

import type { Diagnostic } from "./diag.ts";
import type { Span, Spanned } from "./span.ts";

export interface Document {
  path: string;
  /** The `<!-- keylang:generated … -->` line, if the file is a generated map. */
  generated: string | null;
  sections: Section[];
  /** Parse-time diagnostics (K003–K006). Resolution diagnostics come from `check`. */
  diagnostics: Diagnostic[];
}

export type SectionKind = "map" | "rules" | "flow" | "wiring" | "migration";

/** Content under one `# …` heading (or before the first heading). */
export interface Section {
  kind: SectionKind;
  /** Canonical heading text without `# `, e.g. `flow checkout`. */
  heading: Spanned<string> | null;
  /** Second heading word, e.g. the flow name. */
  name: Spanned<string> | null;
  /** `<!-- … -->` after the heading words, kept by `fmt`. */
  comment?: Spanned<string>;
  items: Item[];
}

export type Item =
  | ({ type: "node" } & Node)
  /** A paragraph of free Markdown (lines verbatim). */
  | { type: "prose"; lines: string[] }
  /** A fenced code block (lines verbatim, fences included). */
  | { type: "code"; lines: string[] };

export type NodeKind =
  // map
  | "layer"
  | "module"
  | "fn"
  | "type"
  | "event"
  /** `alias path` under a module. */
  | "dep"
  | "calls"
  // rules
  | "layers"
  | "allow"
  | "deny"
  | "entry"
  /** `module <id>` at top level: rules about an existing module. */
  | "rule-module"
  | "exports"
  | "no-cycles"
  /** A bare ID under `entry` or `layers`. */
  | "ref"
  // flows
  | "kind"
  | "trigger"
  | "step"
  | "reads"
  | "emits"
  | "invariant"
  | "when"
  | "then"
  | "test"
  /** `? <text>`: an open question of a flow; a person answers it (c4-zoom/04). Spelled `?`. */
  | "question"
  /** `parallel`: nested steps run in any order; the group is one sibling (ADR 0023 п. 2). */
  | "parallel"
  /** `continues <flow>`: this flow continues another in a later request (ADR 0023 п. 4). */
  | "continues"
  /** `after <duration>` and `every <schedule>`: timers a nested `test` checks (ADR 0023 п. 5). */
  | "after"
  | "every"
  // wiring
  | "wire"
  /** `planned <kind> <id> <signature>` — an intention, not an implementation. */
  | "planned"
  /** `alias path` under `wire`. */
  | "wire-dep"
  | "compose"
  // migration (business-flows/26; ticket 27 checks them)
  /** `map <old> → [planned] <new>`: an ID of the old stack and its counterpart here. Spelled `map`. */
  | "migrate"
  /** `dropped <id> <reason>`: an ID of the old stack that is not carried over. */
  | "dropped"
  /** Item that could not be interpreted (a diagnostic was reported). */
  | "unknown";

/** Kinds that declare an ID in the global namespace. */
export function isDecl(kind: NodeKind): boolean {
  return (
    kind === "layer" ||
    kind === "module" ||
    kind === "fn" ||
    kind === "type" ||
    kind === "event" ||
    kind === "dep"
  );
}

/** The keyword as written in the language (`rule-module` is spelled `module`). */
export function kindLabel(kind: NodeKind): string {
  return kind === "rule-module" ? "module" : kind === "question" ? "?" : kind === "migrate" ? "map" : kind;
}

/** One list item `- <kind>? <name> <args…>` and everything nested under it. */
export interface Node {
  kind: NodeKind;
  /** Span of the explicit keyword, `null` when implied by position. */
  keyword: Span | null;
  /** Declared name (layer, module, fn, type, event, dependency alias). */
  name: Spanned<string> | null;
  /** Full dotted ID for declarations, e.g. `application.purchase.buy`. */
  id: string | null;
  /** Code anchor `[name](path#Lnn)`. */
  link: Link | null;
  /** IDs this item refers to (checked by the resolver). */
  refs: Ref[];
  /** Free text: fn signature, condition, invariant, `kind` value, test file. */
  text: Spanned<string> | null;
  /** Quoted test name of `test <file> "name"`. */
  label: Spanned<string> | null;
  /** Raw head tokens after the bullet (used by the formatter). */
  tokens: Token[];
  /** Trailing `<!-- … -->` on the item line. */
  comment: Spanned<string> | null;
  /** Text lines under the item (not list items) — its description. */
  description: Spanned<string>[];
  children: Node[];
  /** The item line from the bullet to the end of the line. */
  span: Span;
}

export interface Link {
  text: string;
  /** Everything inside `(…)`. */
  target: string;
  /** Target without the `#…` fragment. */
  path: string;
  /** `nn` from a `#Lnn` fragment. */
  line: number | null;
  span: Span;
}

export interface Ref {
  /** As written; for a link, its text. */
  text: string;
  /**
   * Absolute ID to resolve (differs from `text` for relative names such as
   * `exports buy` under `module application.purchase`).
   */
  target: string;
  /** Of the ID: inside `[…]` when the reference is a link. */
  span: Span;
  /** The reference written as a Markdown link `[id](href)`: `text` is the ID, the target is kept and never checked. */
  link?: Link;
}

export type TokenKind = "word" | "link" | "quoted" | "comma";

export interface Token {
  kind: TokenKind;
  text: string;
  span: Span;
}

/** Pre-order walk over a node and its descendants. */
export function walk(node: Node, f: (n: Node) => void): void {
  f(node);
  for (const c of node.children) walk(c, f);
}

export function sectionNodes(section: Section): Node[] {
  return section.items.filter((i): i is { type: "node" } & Node => i.type === "node");
}
