// keylang core: IR, Markdown parser, cross-file resolver, formatter.
//
//   import { parse, check } from "keylang";
//   const doc = parse("map.md", "- domain\n  - orderAggregate\n");
//   const { index, diagnostics } = check([doc]);
//   index.decls.has("domain.orderAggregate"); // true

export type { Code, Diagnostic, K005Reason, Severity } from "./diag.ts";
export { compareDiagnostics, diagnostic, formatDiagnostic, isError, severityOf } from "./diag.ts";
export { collectMdFiles, load } from "./files.ts";
export { formatDocument, formatSource } from "./fmt.ts";
export type { Document, Item, Link, Node, NodeKind, Ref, Section, SectionKind, Token, TokenKind } from "./ir.ts";
export { isDecl, kindLabel, sectionNodes, walk } from "./ir.ts";
export { isId, isSegment, parse, renderTokens } from "./parser.ts";
export type { Decl, Lookup } from "./resolve.ts";
export { Index, check } from "./resolve.ts";
export type { Pos, Span, Spanned } from "./span.ts";
export { spanContains } from "./span.ts";
