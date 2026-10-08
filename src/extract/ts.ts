// TypeScript / JavaScript facts: imports, declarations, exports, calls.
// A tree walk over the top level plus tree-sitter queries inside bodies.

import { builtinModules } from "node:module";
import type { CallFact, DeclFact, FileFacts, HookFact, ImportBinding, ImportFact, PassFact, TypeRefFact, UnsupportedFact, ValueRefFact } from "./facts.ts";
import { blockCommentBody, isLicense, jsdocDescription, lineCommentsBody, nonEmpty } from "./doc-comments.ts";
import { errorLine, fingerprintFacts, grammarFor, located, query, startCol, valuesFingerprint, withTree, type Grammar, type Language, type Node, type Tree } from "./treesitter.ts";

// Every call and `new`, whatever its callee: each becomes an edge or a hole, never nothing.
const CALLS_QUERY = `
(call_expression function: (_) @call)
(new_expression constructor: (_) @new)
`;

/**
 * A JSX tag that names a component is a call of it. The `typescript` grammar
 * has no JSX nodes (a `<` there is a type assertion), and a query naming
 * them fails to compile on it, so this query is built for `tsx` and
 * `javascript` only. A closing tag is not a second call.
 */
const JSX_QUERY = `
(jsx_self_closing_element name: (_) @tag)
(jsx_opening_element name: (_) @tag)
`;

const REQUIRE_QUERY = `
(call_expression function: (identifier) @fn arguments: (arguments (string (string_fragment) @source)) (#eq? @fn "require"))
(call_expression function: (import) arguments: (arguments (string (string_fragment) @source)))
`;

/** A callee longer than this is not a name keylang resolves; it stays a hole with a shortened text. */
const MAX_CALLEE = 80;

export function extractTs(path: string, src: string): Promise<FileFacts> {
  const g = grammarFor(path);
  return withTsTree(path, src, (tree, language, typeStars) => extractTree(path, tree.rootNode, language, g, typeStars));
}

/**
 * Parse a TypeScript or JavaScript source and run `use` on the tree.
 * `export type * from` and `export type * as NS from` (TypeScript 5.0) are
 * syntax errors for the bundled grammar, while the same statement without
 * `type` is `export * from`: such a `type` is blanked with spaces — the same
 * length, so every position stays — and the source parsed again.
 * `typeStars`: the start offset of each such statement → its text as written.
 */
export async function withTsTree<T>(path: string, src: string, use: (tree: Tree, language: Language, typeStars: ReadonlyMap<number, string>) => T): Promise<T> {
  const g = grammarFor(path);
  const first = await withTree(g, src, (tree, language): { done: T } | { keywords: TypeStar[] } => {
    const keywords = typeStarKeywords(tree.rootNode);
    return keywords.length === 0 ? { done: use(tree, language, new Map()) } : { keywords };
  });
  if ("done" in first) return first.done;
  let blanked = src;
  for (const k of first.keywords) blanked = `${blanked.slice(0, k.start)}${" ".repeat(k.end - k.start)}${blanked.slice(k.end)}`;
  const typeStars = new Map(first.keywords.map((k) => [k.statement, k.text]));
  return withTree(g, blanked, (tree, language) => use(tree, language, typeStars));
}

/** The `type` of an `export type * from` statement the grammar could not read: offsets in the source (UTF-16 code units). */
interface TypeStar {
  start: number;
  end: number;
  statement: number;
  text: string;
}

/** `export type * from "./t"` read as `export`, an error node holding `type`, then `*` or `* as NS`. */
function typeStarKeywords(root: Node): TypeStar[] {
  if (!root.hasError) return [];
  const out: TypeStar[] = [];
  for (const stmt of root.namedChildren) {
    if (stmt.type !== "export_statement") continue;
    const [keyword, error, next] = stmt.children;
    if (keyword?.type !== "export" || error?.type !== "ERROR" || error.text !== "type" || (next?.type !== "*" && next?.type !== "namespace_export")) continue;
    out.push({ start: error.startIndex, end: error.endIndex, statement: stmt.startIndex, text: stmt.text });
  }
  return out;
}

/**
 * Syntax nested deeper than this (thousands of `+` terms, parentheses, a
 * member chain) is not read: scope lookups walk every ancestor, and a
 * recursive walk would overflow the stack. The file is opaque, with a parse
 * error at the first node that deep.
 */
const MAX_DEPTH = 1000;

/**
 * Parents of the named nodes of the tree being extracted, by node id.
 * tree-sitter's `parent` walks down from the root, so walking up every
 * ancestor with it is quadratic in depth; scope lookups do that for each
 * identifier. Set only while `extractTree` runs, which is synchronous.
 */
let parents: Map<number, Node> | null = null;

function parentOf(node: Node): Node | null {
  return parents?.get(node.id) ?? node.parent;
}

function parentIndex(root: Node): Map<number, Node> {
  const index = new Map<number, Node>();
  const stack: Node[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    for (const child of node.namedChildren) {
      if (!child) continue;
      index.set(child.id, node);
      stack.push(child);
    }
  }
  return index;
}

function extractTree(path: string, root: Node, language: Language, g: Grammar, typeStars: ReadonlyMap<number, string>): FileFacts {
  parents = parentIndex(root);
  const head = moduleHeader(root);
  header = head.nodes;
  try {
    const facts = extractIndexed(path, root, language, g, typeStars);
    if (head.doc !== null) facts.doc = head.doc;
    return facts;
  } finally {
    parents = null;
    header = new Set();
  }
}

/** Comments of the file's header, which document the module and never a declaration. Set while `extractTree` runs. */
let header: ReadonlySet<number> = new Set();

/** Statements a declaration sits in: a comment above any of them documents it. */
const DOC_WRAPPERS = new Set(["export_statement", "lexical_declaration", "variable_declaration", "variable_declarator", "ambient_declaration", "expression_statement", "assignment_expression"]);

const JSDOC = /^\/\*\*(?!\/)/;

/**
 * The declaration's JSDoc: the nearest `/** … *\/` right above it or above the
 * statements that wrap it (`export`, `const x =`), with decorators and line
 * comments between them allowed. A line comment is a note, not documentation;
 * other code in between, the file's header and a license document nothing.
 */
function docOf(node: Node): string | undefined {
  for (let at: Node | null = node; at; ) {
    for (let prev = at.previousNamedSibling; prev; prev = prev.previousNamedSibling) {
      if (prev.type === "decorator") continue;
      if (prev.type !== "comment" || header.has(prev.id)) return undefined;
      if (!JSDOC.test(prev.text)) continue;
      if (isLicense(prev.text)) return undefined;
      return nonEmpty(jsdocDescription(blockCommentBody(prev.text))) ?? undefined;
    }
    const parent = parentOf(at);
    at = parent && DOC_WRAPPERS.has(parent.type) ? parent : null;
  }
  return undefined;
}

/**
 * The module's documentation: the first block of comments in the file (after
 * `#!`; license notices, `/// <reference>` directives and blocks without text
 * skipped), unless it sits right above the first statement that is not an
 * import or a directive (`"use strict"`): then it documents that statement. Comments on adjacent lines are one block.
 */
function moduleHeader(root: Node): { doc: string | null; nodes: Set<number> } {
  const leading: Node[] = [];
  let first: Node | null = null;
  for (const child of root.namedChildren) {
    if (child.type === "hash_bang_line") continue;
    if (child.type !== "comment") {
      first = child;
      break;
    }
    leading.push(child);
  }
  const blocks: Node[][] = [];
  for (const comment of leading) {
    const last = blocks.at(-1)?.at(-1);
    if (last && comment.startPosition.row <= last.endPosition.row + 1) blocks.at(-1)!.push(comment);
    else blocks.push([comment]);
  }
  for (const [i, block] of blocks.entries()) {
    const text = block.map((c) => c.text).join("\n");
    if (isLicense(text) || block.every((c) => c.text.startsWith("/// <"))) continue;
    const doc = nonEmpty(jsdocDescription(block.map((c) => (c.text.startsWith("//") ? lineCommentsBody([c.text], /^\/\/[/!]?/) : blockCommentBody(c.text))).join("\n")));
    if (doc === null) continue;
    const end = block.at(-1)!.endPosition.row;
    const own = i < blocks.length - 1 || first === null || first.startPosition.row > end + 1 || first.type === "import_statement" || (first.type === "expression_statement" && first.namedChildren[0]?.type === "string");
    return own ? { doc, nodes: new Set(block.map((c) => c.id)) } : { doc: null, nodes: new Set() };
  }
  return { doc: null, nodes: new Set() };
}

function extractIndexed(path: string, root: Node, language: Language, g: Grammar, typeStars: ReadonlyMap<number, string>): FileFacts {
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "complete", parseError: null };
  const end = located(root);
  facts.endLine = end.endLine;
  facts.endCol = end.endCol;
  const tooDeep = lineDeeperThan(root, MAX_DEPTH);
  if (tooDeep !== null) {
    facts.completeness = "opaque";
    facts.parseError = { line: tooDeep, reason: `syntax nested deeper than ${MAX_DEPTH} levels` };
    return facts;
  }
  const calls = query(language, g, "calls", CALLS_QUERY);
  const jsxTags = g === "typescript" ? null : query(language, g, "jsx", JSX_QUERY);
  const requires = query(language, g, "require", REQUIRE_QUERY);

  // Bodies whose calls belong to a declaration; every other call is module-level code.
  const covered = new Set<number>();
  const declCalls = (body: Node, cls: ClassScope | null = null, keep: (n: Node) => boolean = () => true): CallFact[] => {
    if (body.id !== root.id) covered.add(body.id);
    const out: CallFact[] = [];
    for (const c of calls.captures(body)) {
      if (!keep(c.node)) continue;
      const fact = calleeOfCall(c.node, body, cls);
      if (!fact) continue;
      const call = parentOf(c.node);
      const passes = call ? passesOf(call, body, cls) : [];
      if (passes.length > 0) fact.passes = passes;
      markClosure(fact, c.node, body);
      out.push(fact);
      // `jsx(Cart)` is the same call as `<Cart />` when `jsx` is React's. The factory call and its `passes` stay.
      if (!call) continue;
      const component = componentOfFactory(call, c.node, body, cls, react);
      if (!component) continue;
      markClosure(component, c.node, body);
      out.push(component);
    }
    if (!jsxTags) return out;
    for (const c of jsxTags.captures(body)) {
      if (!keep(c.node)) continue;
      const fact = componentOfTag(c.node, body, cls);
      if (!fact) continue;
      markClosure(fact, c.node, body);
      out.push(fact);
    }
    // Two queries walk the body in turn; the facts are kept in source order.
    return out.sort((a, b) => a.line - b.line || a.col - b.col);
  };

  const visitDecl = (node: Node, exported: boolean): void => {
    switch (node.type) {
      case "function_declaration":
      case "generator_function_declaration":
      case "function_signature": {
        const name = node.childForFieldName("name")?.text;
        if (!name) return;
        facts.decls.push(decl("fn", name, node, signature(node), exported, declCalls(node), collectTypeRefs(node), []));
        break;
      }
      case "lexical_declaration":
      case "variable_declaration": {
        for (const d of node.namedChildren) {
          if (d.type !== "variable_declarator") continue;
          const nameNode = d.childForFieldName("name");
          const value = d.childForFieldName("value");
          if (!nameNode || nameNode.type !== "identifier") continue;
          const name = nameNode.text;
          const req = value ? requireSource(value, requires) : null;
          if (req) {
            facts.imports.push(importAt(d, req.source, [{ kind: "module", local: name, ...(req.namespace ? { namespace: true as const } : {}) }], false));
            continue;
          }
          // `(() => …) as Handler` and `(function () {}) satisfies T` are the function itself.
          const fnValue = value ? unwrapValue(value) : null;
          // `const Cart = memo(() => …)` is the fn the React wrapper wraps; `let`/`var` stay values.
          const wrapped = fnValue && node.children.some((c) => c.type === "const") ? reactWrapperFn(fnValue, react) : null;
          const fnNode = wrapped ?? (fnValue && FUNCTION_VALUES.has(fnValue.type) ? fnValue : null);
          if (fnNode) {
            facts.decls.push(decl("fn", name, d, signature(fnNode), exported, declCalls(fnNode), collectTypeRefs(fnNode), []));
          } else if (fnValue && fnValue.type === "class") {
            facts.decls.push(classDecl(name, fnValue, d, exported, declCalls, facts));
          }
          if (exported) {
            facts.exports.add(name);
            const kind = fnNode ? "fn" : fnValue?.type === "class" ? "class" : "value";
            facts.exportRows.push({ name, kind, local: name });
          }
        }
        // `const { a, b } = require("./x")`
        for (const d of node.namedChildren) {
          const nameNode = d.childForFieldName("name");
          const value = d.childForFieldName("value");
          if (d.type !== "variable_declarator" || !nameNode || nameNode.type !== "object_pattern" || !value) continue;
          // `const { a } = mod;` where `mod` is an imported module binding.
          const req = requireSource(value, requires)?.source ?? (value.type === "identifier" ? moduleSource(facts, value.text) : null);
          if (!req) continue;
          const bindings: ImportBinding[] = [];
          for (const p of nameNode.namedChildren) {
            if (p.type === "shorthand_property_identifier_pattern") bindings.push({ kind: "named", local: p.text, imported: p.text });
            else if (p.type === "pair_pattern") {
              const k = p.childForFieldName("key")?.text;
              const v = p.childForFieldName("value")?.text;
              if (k && v) bindings.push({ kind: "named", local: v, imported: k });
            }
          }
          facts.imports.push(importAt(d, req, bindings, false));
        }
        return;
      }
      case "class_declaration":
      case "abstract_class_declaration": {
        const name = node.childForFieldName("name")?.text;
        if (!name) return;
        facts.decls.push(classDecl(name, node, node, exported, declCalls, facts));
        break;
      }
      case "type_alias_declaration":
      case "interface_declaration":
      case "enum_declaration": {
        const name = node.childForFieldName("name")?.text;
        if (!name) return;
        facts.decls.push(decl("type", name, node, typeSignature(node), exported, [], collectTypeRefs(node), []));
        break;
      }
      case "ambient_declaration": {
        // `export declare function f(): void;`, `export declare const x: T;`
        const inner = node.namedChildren.find((c) => c.type !== "comment");
        if (inner) visitDecl(inner, exported);
        return;
      }
      case "internal_module":
      case "module": {
        // `export namespace Util {}` exports the name `Util`; its members are not indexed (`unsupported`).
        const nameNode = node.childForFieldName("name");
        const name = nameNode?.type === "nested_identifier" ? nameNode.text.split(".")[0]?.trim() : nameNode?.type === "identifier" ? nameNode.text : undefined;
        if (exported && name) {
          facts.exports.add(name);
          facts.exportRows.push({ name, kind: "value", local: name, form: "namespace" });
        }
        return;
      }
      default:
        return;
    }
    if (exported) {
      const name = node.childForFieldName("name")?.text;
      if (name) {
        facts.exports.add(name);
        const kind = node.type.includes("class") ? "class" : node.type.includes("type") || node.type.includes("interface") || node.type.includes("enum") ? "type" : node.type.includes("function") ? "fn" : "value";
        facts.exportRows.push({ name, kind, local: name });
      }
    }
  };

  // Imports hoist, so a wrapper or factory may sit above its import. Read once.
  const react = reactBindings(root);

  // Declarations exported later by name: `function a() {}; export { a }`.
  const localExports = new Set<string>();
  for (const node of root.namedChildren) {
    switch (node.type) {
      case "import_statement":
        facts.imports.push(...importStatement(node));
        break;
      case "export_statement": {
        const source = node.childForFieldName("source");
        if (source) {
          const spec = stringValue(source);
          if (spec === null) break;
          const clause = node.namedChildren.find((c) => c.type === "export_clause");
          const star = node.children.some((c) => c.type === "*");
          const ns = node.namedChildren.find((c) => c.type === "namespace_export");
          const bindings: ImportBinding[] = [];
          if (clause) {
            for (const s of clause.namedChildren) {
              if (s.type !== "export_specifier") continue;
              const name = s.childForFieldName("name")?.text;
              const alias = s.childForFieldName("alias")?.text ?? name;
              if (name && alias) {
                bindings.push({ kind: "named", local: alias, imported: name });
                facts.exports.add(alias);
                facts.exportRows.push({ name: alias, kind: "value", local: name, form: "reexport", from: spec });
              }
            }
          } else if (ns) {
            const alias = ns.namedChildren[0]?.text;
            if (alias) {
              bindings.push({ kind: "module", local: alias, namespace: true });
              facts.exports.add(alias);
              facts.exportRows.push({ name: alias, kind: "value", local: null, form: "namespace", from: spec });
            }
          } else if (star) {
            facts.reexportsAll.push(spec);
            facts.exportRows.push({ name: "*", kind: "reexport", local: null, form: "reexport", from: spec });
          }
          // `export type { A } from`, `export type * from` (read without its blanked `type`): types only.
          const written = typeStars.get(node.startIndex);
          const fact = importAt(node, spec, bindings, true);
          if (written !== undefined) fact.text = written;
          if (written !== undefined || typeKeyword(node)) fact.typeOnly = true;
          else if (clause && inlineTypesOnly(clause, "export_specifier")) fact.inlineTypeOnly = true;
          facts.imports.push(fact);
          break;
        }
        const declaration = node.childForFieldName("declaration");
        const isDefault = node.children.some((c) => c.type === "default");
        if (declaration) {
          const before = facts.exportRows.length;
          visitDecl(declaration, true);
          // `export default function main() {}` is imported as `default`, not `main`.
          if (isDefault) {
            for (const row of facts.exportRows.slice(before)) {
              facts.exports.delete(row.name);
              facts.exports.add("default");
              row.local = row.name;
              row.name = "default";
              row.form = "default";
            }
          }
        } else {
          // `export { a, b as c }`, `export { x as default }`
          const clause = node.namedChildren.find((c) => c.type === "export_clause");
          for (const s of clause?.namedChildren ?? []) {
            if (s.type !== "export_specifier") continue;
            const alias = s.childForFieldName("alias")?.text ?? s.childForFieldName("name")?.text;
            if (alias) {
              const local = s.childForFieldName("name")?.text ?? alias;
              facts.exports.add(alias);
              facts.exportRows.push({ name: alias, kind: "value", local, ...(alias === "default" ? { form: "default" as const } : alias !== local ? { form: "alias" as const } : {}) });
              localExports.add(local);
            }
          }
          // `export default <expression>` and TypeScript `export = <expression>`: the module's default value.
          const written = node.childForFieldName("value") ?? (node.children.some((c) => c.type === "=") ? node.namedChildren.find((c) => c.type !== "comment") : undefined);
          const value = written ? unwrapValue(written) : null;
          if (value) {
            facts.exports.add("default");
            if (value.type === "identifier") {
              facts.exportRows.push({ name: "default", kind: "value", local: value.text, form: "default" });
              localExports.add(value.text);
            } else if (FUNCTION_VALUES.has(value.type)) {
              facts.decls.push(decl("fn", "default", value, signature(value), true, declCalls(value), collectTypeRefs(value), []));
              facts.exportRows.push({ name: "default", kind: "fn", local: "default", form: "default" });
            } else if (value.type === "class") {
              const name = value.childForFieldName("name")?.text ?? "default";
              facts.decls.push(classDecl(name, value, value, true, declCalls, facts));
              facts.exportRows.push({ name: "default", kind: "class", local: name, form: "default" });
            } else {
              // `export default 3`, `export default { a, b }`, `export default make()`: a value, no declaration.
              facts.exportRows.push({ name: "default", kind: "value", local: null, form: "default" });
            }
          }
        }
        break;
      }
      case "expression_statement":
        commonJsExports(node, facts, declCalls);
        break;
      default:
        visitDecl(node, false);
    }
  }
  for (const d of facts.decls) if (localExports.has(d.name)) d.exported = true;
  const inDeclaration = (n: Node): boolean => {
    for (let at: Node | null = n; at; at = parentOf(at)) if (covered.has(at.id)) return true;
    return false;
  };
  facts.moduleCalls = declCalls(root, null, (n) => !inDeclaration(n));
  collectDynamicImports(root, facts);
  collectUnsupported(root, facts);
  collectValueRefs(root, facts);
  collectRouteEntries(root, facts);
  const values = valuesFingerprint(root.namedChildren, facts.decls);
  if (values !== undefined) facts.values = values;
  if (root.hasError) {
    facts.completeness = "opaque";
    facts.parseError = { line: errorLine(root), reason: "syntax error" };
  }
  return facts;
}

/** The React exports keylang reads, per module: wrappers from `react`, factories from `react` and its JSX runtimes. */
const REACT_EXPORTS = new Map<string, ReadonlySet<string>>([
  ["react", new Set(["memo", "forwardRef", "lazy", "createElement", "jsx", "jsxs", "jsxDEV"])],
  ["react/jsx-runtime", new Set(["createElement", "jsx", "jsxs", "jsxDEV"])],
  ["react/jsx-dev-runtime", new Set(["createElement", "jsx", "jsxs", "jsxDEV"])],
]);

/** What value imports from React bind in one file. */
interface ReactBindings {
  /** Local name → the React export it binds: `h` → `createElement`. */
  names: Map<string, string>;
  /** Default or namespace object → the React exports read as its members (`React.memo`). */
  objects: Map<string, ReadonlySet<string>>;
}

/**
 * React bindings of one file: the single source for wrappers and factories,
 * so both follow one type-only rule. Imports hoist, so a `const` above its
 * import still counts; `require("react")` binds only below itself and is not
 * read. `import type`, `import type * as React` and `import { type memo }`
 * bind no value.
 */
function reactBindings(root: Node): ReactBindings {
  const names = new Map<string, string>();
  const objects = new Map<string, ReadonlySet<string>>();
  for (const stmt of root.namedChildren) {
    if (stmt.type !== "import_statement" || typeKeyword(stmt)) continue;
    for (const fact of importStatement(stmt)) {
      const exported = REACT_EXPORTS.get(fact.source);
      if (!exported) continue;
      for (const b of fact.bindings) {
        if (b.kind === "named") {
          if (exported.has(b.imported) && !typeOnlySpecifier(stmt, b.local)) names.set(b.local, b.imported);
        } else objects.set(b.local, exported);
      }
    }
  }
  return { names, objects };
}

/** The React export a callee names through a binding of the file (`memo`, `h`, `React.memo`), with the local it goes through. Shadowing is the caller's. */
function reactExportOf(callee: Node, react: ReactBindings): { name: string; local: string } | null {
  if (callee.type === "identifier") {
    const name = react.names.get(callee.text);
    return name ? { name, local: callee.text } : null;
  }
  if (callee.type !== "member_expression") return null;
  const object = callee.childForFieldName("object");
  const prop = callee.childForFieldName("property")?.text;
  if (object?.type !== "identifier" || !prop) return null;
  return react.objects.get(object.text)?.has(prop) ? { name: prop, local: object.text } : null;
}

/** The `type` keyword of `import type` or `import { type name }` — an unnamed child, not an identifier. */
function typeKeyword(node: Node): boolean {
  return node.children.some((c) => c.type === "type");
}

/**
 * `{ type A, type B as C }` of an import or an `export … from`: at least one
 * name, and every one of them `type`. Whether such a statement runs is the
 * tsconfig's to say (`ImportFact.inlineTypeOnly`), so it stays a fact of the
 * syntax here.
 */
function inlineTypesOnly(list: Node, specifier: "import_specifier" | "export_specifier"): boolean {
  const names = list.namedChildren.filter((c) => c.type === specifier);
  return names.length > 0 && names.every(typeKeyword);
}

/** `import { type memo as m }`: the specifier that binds `local` is type-only. */
function typeOnlySpecifier(stmt: Node, local: string): boolean {
  const named = stmt.namedChildren.find((c) => c.type === "import_clause")?.namedChildren.find((c) => c.type === "named_imports");
  for (const s of named?.namedChildren ?? []) {
    if (s.type !== "import_specifier") continue;
    const imported = s.childForFieldName("name")?.text;
    const alias = s.childForFieldName("alias")?.text ?? imported;
    if (alias === local) return typeKeyword(s);
  }
  return false;
}

function decl(kind: DeclFact["kind"], name: string, node: Node, signature: string | null, exported: boolean, calls: CallFact[], types: TypeRefFact[], members: DeclFact[]): DeclFact {
  const at = located(node);
  const doc = docOf(node);
  return { kind, name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported, calls, types, members, ...fingerprintFacts(node), ...(doc !== undefined ? { doc } : {}) };
}

function boundCall(call: CallFact, bound: "parameter" | "local" | null): CallFact {
  return bound ? { ...call, bound } : call;
}

function callFact(callee: string, node: Node): CallFact {
  const at = located(node);
  return { callee, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol };
}

/** A call through an expression keylang does not name: a hole with the source text. */
function opaqueCall(node: Node): CallFact {
  const text = collapse(node.text);
  return { ...callFact(text.length <= MAX_CALLEE ? text : `${text.slice(0, MAX_CALLEE - 1)}…`, node), opaque: true };
}

/**
 * The fact of one call or `new` from its callee node. Null only for a call
 * keylang records another way: `require()` and `import()` (imports),
 * `import.meta.resolve()` (an import), a function literal called in place
 * (the calls of its body are read where they are), a class expression under
 * `new`, `obj[k]()` (an `unsupported` hole). Any other callee keylang cannot
 * name is an `opaque` fact.
 */
function calleeOfCall(node: Node, body: Node, cls: ClassScope | null): CallFact | null {
  let n = unwrapValue(node);
  // `(0, f.g)()` calls `f.g` without its `this`.
  while (n.type === "sequence_expression" && n.namedChildren.length > 0) n = unwrapValue(n.namedChildren.at(-1)!);
  switch (n.type) {
    case "identifier": {
      if (n.text === "require" && parentOf(node)?.type === "call_expression" && requireKind(n) !== "shadowed") return null;
      const fact = boundCall(callFact(n.text, n), bindingOf(n, n.text, body));
      const hook = fact.bound ? localHook(n, n.text, body) : null;
      if (hook) fact.hook = hook;
      return fact;
    }
    case "member_expression": {
      // `import.meta.resolve()` is the platform's; its module is an import edge.
      if (n.childForFieldName("object")?.type === "meta_property") return null;
      const fact = calleeFact(n, body, cls);
      if (fact) return fact;
      // `a.b.c()`, `f().m()`, `super.m()`: the text keeps the head, which the graph resolves or leaves a hole.
      const text = n.text.replace(/\s+/g, "");
      return text.length < MAX_CALLEE ? callFact(text, n) : opaqueCall(n);
    }
    case "super":
      return callFact("super", n);
    case "import":
    case "subscript_expression":
    case "class":
      return null;
    default:
      return FUNCTION_VALUES.has(n.type) ? null : opaqueCall(n);
  }
}

/**
 * The call a JSX tag makes, from its name node: `<Cart />` calls `Cart`,
 * `<Cart.Item />` calls `Cart.Item`, as the call expressions would. Null
 * when the tag is not a component: an intrinsic element (`<div />`,
 * `<my-button />`: a lowercase first letter), a namespace name
 * (`<svg:path />`), or a fragment (no name). A tag through a parameter or
 * local (`<Comp />`) is bound, a hole, as the call of a parameter is.
 */
function componentOfTag(name: Node, body: Node, cls: ClassScope | null): CallFact | null {
  if (name.type === "identifier") {
    const first = name.text.codePointAt(0) ?? 0;
    if (first >= 0x61 && first <= 0x7a) return null;
    return calleeFact(name, body, cls);
  }
  if (name.type !== "member_expression") return null;
  const fact = calleeFact(name, body, cls);
  if (fact) return fact;
  const text = collapse(name.text);
  return text.length < MAX_CALLEE ? callFact(text, name) : opaqueCall(name);
}

/** The factory names. Which module bound the callee decides, not the spelling at the call. */
const REACT_FACTORIES = new Set(["createElement", "jsx", "jsxs", "jsxDEV"]);

/**
 * The component call hidden in a React factory: `createElement(Cart)`,
 * `jsx(Cart)`, `jsxs(Cart.Item)`, `jsxDEV(Cart)` are the call `<Cart />`
 * would be, when the callee is bound by an import from `react`,
 * `react/jsx-runtime` or `react/jsx-dev-runtime` (`h` for
 * `createElement as h`, `React.createElement` for a default or namespace
 * import). A local function or an import from anywhere else is not one, so
 * a helper named `createElement` keeps a single ordinary call. The first
 * argument is the component, by the same rule as a tag: a capital
 * identifier or a member. A string (`"div"`) or a lowercase identifier is
 * not a call.
 */
function componentOfFactory(call: Node, calleeNode: Node, body: Node, cls: ClassScope | null, react: ReactBindings): CallFact | null {
  if (call.type !== "call_expression" || !factoryCallee(calleeNode, body, react)) return null;
  const arg = call.childForFieldName("arguments")?.namedChildren.find((c) => c.type !== "comment");
  return arg ? componentOfTag(unwrapValue(arg), body, cls) : null;
}

/** The callee node is a React factory binding, and nothing between here and the body shadows it. */
function factoryCallee(node: Node, body: Node, react: ReactBindings): boolean {
  let n = unwrapValue(node);
  while (n.type === "sequence_expression" && n.namedChildren.length > 0) n = unwrapValue(n.namedChildren.at(-1)!);
  const bound = reactExportOf(n, react);
  return bound !== null && REACT_FACTORIES.has(bound.name) && bindingOf(n, bound.local, body) === null;
}

/**
 * What a `require` identifier is: Node's (`global`), one made by
 * `createRequire(…)` (`created`), which also loads modules, or a parameter or
 * local of another value (`shadowed`), whose call is not an import.
 */
function requireKind(node: Node): "global" | "created" | "shadowed" {
  const binding = declarationOf(node, "require", node.tree.rootNode);
  if (binding === null) return "global";
  if (binding.kind !== "local") return "shadowed";
  const value = binding.node.childForFieldName("value");
  const init = value ? unwrapValue(value) : null;
  const fn = init?.type === "call_expression" ? init.childForFieldName("function")?.text.replace(/\s+/g, "") : undefined;
  return fn === "createRequire" || fn?.endsWith(".createRequire") ? "created" : "shadowed";
}

function importAt(node: Node, source: string, bindings: ImportBinding[], reexport: boolean): ImportFact {
  const at = located(node);
  return { source, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, bindings, reexport };
}

const NESTED_DECL = new Set(["function_declaration", "generator_function_declaration", "function_signature", "class_declaration", "abstract_class_declaration", "method_definition", "interface_declaration", "type_alias_declaration", "enum_declaration", "internal_module"]);

/**
 * A declaration of its own below the one whose type names are collected. A method signature
 * is one in a class body (an overload of a member); in an interface or an object type
 * (`{ save(o: Order): void }`) it is part of that type.
 */
function nestedDeclaration(node: Node): boolean {
  return NESTED_DECL.has(node.type) || (node.type === "method_signature" && node.parent?.type === "class_body");
}

/** 1-based line of the first node nested deeper than `limit` below `root`; null when none is. */
function lineDeeperThan(root: Node, limit: number): number | null {
  const cursor = root.walk();
  try {
    for (let depth = 0; ; ) {
      if (depth > limit) return cursor.startPosition.row + 1;
      if (cursor.gotoFirstChild()) {
        depth++;
        continue;
      }
      while (!cursor.gotoNextSibling()) {
        if (depth === 0 || !cursor.gotoParent()) return null;
        depth--;
      }
    }
  } finally {
    cursor.delete();
  }
}

/**
 * Pre-order walk over named nodes with an explicit stack: an expression
 * nested thousands deep must not overflow the call stack. `enter` returns
 * false to skip the node's subtree.
 */
function walkNamed(root: Node, enter: (node: Node) => boolean | void): void {
  const stack: Node[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (enter(node) === false) continue;
    const children = node.namedChildren;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child) stack.push(child);
    }
  }
}

const NO_NAMES: ReadonlySet<string> = new Set();

/**
 * Type names used by `node`, excluding its own declared name, nested
 * declarations and the names a generic binds in its scope: a type parameter
 * (`<T>`), a mapped type's key (`[K in keyof T]`), an `infer U`. `bound`: the
 * type parameters already in scope, a class's for its members.
 */
function collectTypeRefs(node: Node, bound: ReadonlySet<string> = NO_NAMES): TypeRefFact[] {
  const skip = node.childForFieldName("name");
  const out: TypeRefFact[] = [];
  // An explicit stack, as in `walkNamed`, with the names bound at each node.
  const stack: { node: Node; bound: ReadonlySet<string> }[] = [{ node, bound }];
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const current = item.node;
    if (current.id !== node.id && nestedDeclaration(current)) continue;
    if (current.type === "nested_type_identifier") {
      const at = located(current);
      out.push({ name: at.text.replace(/\s+/g, ""), line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text });
      continue;
    }
    const scope = typeNamesBound(current, item.bound);
    if (current.type === "type_identifier" && current.id !== skip?.id && !scope.has(current.text)) {
      const at = located(current);
      out.push({ name: at.text, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text });
    }
    const children = current.namedChildren;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child) stack.push({ node: child, bound: scope });
    }
  }
  return out;
}

/** `bound` and the type names `node` binds for its subtree: its type parameters, a mapped type's key, the `infer` names of a conditional type. */
function typeNamesBound(node: Node, bound: ReadonlySet<string>): ReadonlySet<string> {
  const names: string[] = [];
  for (const param of node.childForFieldName("type_parameters")?.namedChildren ?? []) {
    const name = param.type === "type_parameter" ? param.childForFieldName("name") : null;
    if (name) names.push(name.text);
  }
  if (node.type === "index_signature") {
    for (const clause of node.namedChildren) {
      const name = clause.type === "mapped_type_clause" ? clause.childForFieldName("name") : null;
      if (name) names.push(name.text);
    }
  }
  // `T extends Array<infer U> ? U : never`: `U` is bound in the whole conditional type.
  const tested = node.type === "conditional_type" ? node.childForFieldName("right") : null;
  if (tested) {
    walkNamed(tested, (n) => {
      const name = n.type === "infer_type" ? n.namedChildren[0] : undefined;
      if (name?.type === "type_identifier") names.push(name.text);
    });
  }
  return names.length === 0 ? bound : new Set([...bound, ...names]);
}

/**
 * Members of a class. Methods and function-valued fields (`handler = () => …`)
 * are fns with their own calls and types. Any other field is no node: the
 * types its annotation and initializer name (`repo!: Order`,
 * `s = new Map<string, Item>()`), and an index signature's, are the
 * class's. Instance field initializers run on
 * construction: their calls belong to `constructor`, synthesized when the
 * class has none. Static field initializers and `static {}` blocks run once
 * when the class is evaluated: their calls belong to a synthesized `static`
 * member, never to the constructor. A computed member name (`[key]() {}`) is
 * unsupported: nothing names it statically.
 */
function classDecl(name: string, cls: Node, at: Node, exported: boolean, declCalls: (n: Node, scope: ClassScope | null) => CallFact[], facts: FileFacts): DeclFact {
  const body = cls.childForFieldName("body");
  const items = body?.namedChildren ?? [];
  const scope = classScope(items);
  // `class C<T>`: `T` is no type reference in its heritage or its members.
  const typeParams = typeNamesBound(cls, NO_NAMES);
  const members: DeclFact[] = [];
  const fieldTypes: TypeRefFact[] = [];
  const instance: { node: Node; calls: CallFact[] }[] = [];
  const statics: { node: Node; calls: CallFact[] }[] = [];
  for (const m of items) {
    const isField = m.type === "public_field_definition" || m.type === "field_definition";
    if (m.type === "class_static_block") {
      statics.push({ node: m, calls: declCalls(m, scope) });
      continue;
    }
    if (m.type === "index_signature") {
      fieldTypes.push(...collectTypeRefs(m, typeParams));
      continue;
    }
    if (!isField && m.type !== "method_definition" && m.type !== "method_signature" && m.type !== "abstract_method_signature") continue;
    const nameNode = m.childForFieldName("name") ?? m.childForFieldName("property");
    if (!nameNode) continue;
    if (nameNode.type === "computed_property_name") {
      facts.unsupported.push(unsupported(m, `unsupported construct \`computed class member\``));
      continue;
    }
    const mname = memberName(nameNode);
    const hash = nameNode.type === "private_property_identifier";
    const isStatic = m.children.some((c) => c.type === "static");
    const isPrivate = hash || m.children.some((c) => c.type === "accessibility_modifier" && c.text === "private");
    const flag = (member: DeclFact): DeclFact => {
      if (isStatic) member.static = true;
      if (hash) member.hash = true;
      return member;
    };
    if (!isField) {
      const member = flag(decl("fn", mname, m, signature(m), !isPrivate, m.type === "method_definition" ? declCalls(m, scope) : [], collectTypeRefs(m, typeParams), []));
      if (m.children.some((c) => c.type === "get" || c.type === "set")) member.accessor = true;
      members.push(member);
      continue;
    }
    const written = m.childForFieldName("value");
    const value = written ? unwrapValue(written) : null;
    if (value && FUNCTION_VALUES.has(value.type)) {
      members.push(flag(decl("fn", mname, m, signature(value), !isPrivate, declCalls(value, scope), collectTypeRefs(m, typeParams), [])));
      continue;
    }
    fieldTypes.push(...collectTypeRefs(m, typeParams));
    if (!value) continue;
    const calls = declCalls(value, scope);
    if (calls.length === 0) continue;
    (m.children.some((c) => c.type === "static") ? statics : instance).push({ node: m, calls });
  }
  if (instance.length > 0) {
    const constructor = members.find((m) => m.kind === "fn" && m.name === "constructor");
    if (constructor) constructor.calls.unshift(...instance.flatMap((item) => item.calls));
    else members.push(initializer("constructor", instance));
  }
  if (statics.length > 0) {
    if (members.some((m) => m.name === "static")) for (const item of statics) facts.unsupported.push(unsupported(item.node, "static initializer of a class with a member named `static`"));
    else members.push(initializer("static", statics));
  }
  const heritageNode = cls.namedChildren.find((c) => c.type === "class_heritage" || c.type === "extends_type_clause" || c.type === "extends_clause");
  // `class C<T extends Order, U = Item>`: a constraint and a default name types; the parameters themselves do not.
  const typeParamsNode = cls.childForFieldName("type_parameters");
  const types = [...(typeParamsNode ? collectTypeRefs(typeParamsNode, typeParams) : []), ...(heritageNode ? collectTypeRefs(heritageNode, typeParams) : []), ...fieldTypes];
  const out = decl("class", name, at, heritage(cls), exported, [], types, members);
  const values = valuesFingerprint(items, members);
  if (values !== undefined) out.values = values;
  const base = heritageNode ? baseClass(heritageNode) : null;
  if (base) out.base = base;
  return out;
}

/** The `extends` expression: `(extends_clause value: …)` in TypeScript, the bare expression in JavaScript. */
function baseClass(heritage: Node): string | null {
  const clause = heritage.type === "extends_clause" ? heritage : heritage.namedChildren.find((c) => c.type === "extends_clause");
  const value = clause ? clause.childForFieldName("value") : heritage.type === "class_heritage" ? heritage.namedChildren[0] : null;
  return value && value.type !== "implements_clause" ? collapse(value.text) : null;
}

/** `(f)`, `f as T`, `f satisfies T`, `f!`: the expression they wrap. */
export function unwrapValue(node: Node): Node {
  let at = node;
  while ((at.type === "parenthesized_expression" || at.type === "as_expression" || at.type === "satisfies_expression" || at.type === "non_null_expression") && at.namedChildren[0]) at = at.namedChildren[0];
  return at;
}

const FUNCTION_VALUES = new Set(["arrow_function", "function_expression", "function", "generator_function"]);

/** Wrappers that return the component they wrap; their `const` is the fn of the wrapped render. */
const REACT_WRAPPERS = new Set(["memo", "forwardRef", "lazy"]);

/**
 * The function a React wrapper call hides: `memo(() => …)` is the function it
 * wraps when — and only when — the callee is bound by an import from `react`
 * (the `names` / `objects` such an import binds; `React.memo` through a
 * default or namespace import counts). By name alone a `forwardRef` from
 * `@nestjs/common` or a local `memo` would unwrap too, so the import decides,
 * not the text. The wrapped function is the first argument; any other shape
 * keeps the declarator a value.
 */
function reactWrapperFn(value: Node, react: ReactBindings): Node | null {
  if (value.type !== "call_expression") return null;
  const callee = value.childForFieldName("function");
  const bound = callee ? reactExportOf(callee, react) : null;
  if (!bound || !REACT_WRAPPERS.has(bound.name)) return null;
  const arg = value.childForFieldName("arguments")?.namedChildren.find((c) => c.type !== "comment");
  const fn = arg ? unwrapValue(arg) : null;
  return fn && FUNCTION_VALUES.has(fn.type) ? fn : null;
}

/** A synthesized member over the initializers it runs, from the first to the last. */
function initializer(name: "constructor" | "static", items: { node: Node; calls: CallFact[] }[]): DeclFact {
  const first = located(items[0]!.node);
  const last = located(items[items.length - 1]!.node);
  const prints = items.map((item) => fingerprintFacts(item.node));
  const readsImports = [...new Set(prints.flatMap((p) => p.readsImports ?? []))].sort();
  return { kind: "fn", name, line: first.line, col: first.col, endLine: last.endLine, endCol: last.endCol, signature: null, exported: true, calls: items.flatMap((item) => item.calls), types: [], members: [], fingerprint: prints.map((p) => p.fingerprint).join(":"), ...(readsImports.length > 0 ? { readsImports } : {}) };
}

function memberName(node: Node): string {
  const text = node.type === "string" ? (stringValue(node) ?? node.text) : node.text;
  return text.replace(/^#/, "");
}

/** Where `this.<field>` values come from, for `this.decoder.feed()` and `this.run()`. */
interface ClassScope {
  /** Field → class named by its type annotation, `new X()` initializer, or constructor assignment. */
  fields: Map<string, string>;
  /** Field → hook set in the constructor: `this.analyzer = options.analyzer ?? analyze`. */
  hooks: Map<string, HookFact>;
}

function classScope(items: readonly Node[]): ClassScope {
  const fields = new Map<string, string>();
  const hooks = new Map<string, HookFact>();
  for (const m of items) {
    if (m.type !== "public_field_definition" && m.type !== "field_definition") continue;
    const nameNode = m.childForFieldName("name") ?? m.childForFieldName("property");
    if (!nameNode || nameNode.type === "computed_property_name") continue;
    const type = typeName(m.childForFieldName("type")) ?? newClass(m.childForFieldName("value"));
    if (type) fields.set(memberName(nameNode), type);
  }
  const ctor = items.find((m) => m.type === "method_definition" && m.childForFieldName("name")?.text === "constructor");
  if (!ctor) return { fields, hooks };
  const params = ctor.childForFieldName("parameters")?.namedChildren.filter((p) => p.type === "required_parameter" || p.type === "optional_parameter") ?? [];
  params.forEach((param, index) => {
    // `constructor(private readonly x: X = fallback)` declares a field.
    if (!param.children.some((c) => c.type === "accessibility_modifier" || c.type === "readonly" || c.type === "override_modifier")) return;
    const pattern = param.childForFieldName("pattern");
    if (pattern?.type !== "identifier") return;
    const type = typeName(param.childForFieldName("type"));
    if (type) fields.set(pattern.text, type);
    const fallback = param.childForFieldName("value");
    const callee = fallback ? fallbackCallee(fallback, ctor) : null;
    if (callee) hooks.set(pattern.text, { name: pattern.text, fallback: callee, param: index, path: "", owner: "constructor" });
  });
  const paramIndex = (name: string): number => params.findIndex((p) => p.childForFieldName("pattern")?.text === name);
  for (const stmt of ctor.childForFieldName("body")?.namedChildren ?? []) {
    const expr = stmt.type === "expression_statement" ? stmt.namedChildren[0] : null;
    if (expr?.type !== "assignment_expression") continue;
    const left = expr.childForFieldName("left");
    const right = expr.childForFieldName("right");
    if (left?.type !== "member_expression" || left.childForFieldName("object")?.type !== "this" || !right) continue;
    const field = memberName(left.childForFieldName("property")!);
    const created = newClass(right);
    if (created) fields.set(field, created);
    else if (right.type === "identifier" && paramIndex(right.text) !== -1) {
      const type = typeName(params[paramIndex(right.text)]!.childForFieldName("type"));
      if (type) fields.set(field, type);
    }
    // `this.run = options.run ?? defaultRun`: the default runs unless a caller injects one.
    const hook = fallbackOf(right, ctor);
    if (!hook) continue;
    const source = hook.source;
    let param: number | null = null;
    let path = "";
    if (source.type === "identifier") param = paramIndex(source.text);
    else if (source.type === "member_expression" && source.childForFieldName("object")?.type === "identifier") {
      param = paramIndex(source.childForFieldName("object")!.text);
      path = source.childForFieldName("property")?.text ?? "";
    }
    hooks.set(field, { name: field, fallback: hook.fallback, param: param === -1 ? null : param, path: param === -1 ? "" : path, owner: "constructor" });
  }
  return { fields, hooks };
}

function importStatement(node: Node): ImportFact[] {
  // TypeScript `import y = require("./y")`: `y` is the whole module.
  const required = node.namedChildren.find((c) => c.type === "import_require_clause");
  if (required) {
    const local = required.namedChildren.find((c) => c.type === "identifier")?.text;
    const from = required.childForFieldName("source");
    const spec = from ? stringValue(from) : null;
    return local && spec !== null ? [importAt(node, spec, [{ kind: "module", local }], false)] : [];
  }
  const source = node.childForFieldName("source");
  const spec = source ? stringValue(source) : null;
  if (spec === null) return [];
  const bindings: ImportBinding[] = [];
  const clause = node.namedChildren.find((c) => c.type === "import_clause");
  for (const c of clause?.namedChildren ?? []) {
    if (c.type === "identifier") bindings.push({ kind: "default", local: c.text });
    else if (c.type === "namespace_import") {
      const id = c.namedChildren.find((x) => x.type === "identifier");
      if (id) bindings.push({ kind: "module", local: id.text, namespace: true });
    } else if (c.type === "named_imports") {
      for (const s of c.namedChildren) {
        if (s.type !== "import_specifier") continue;
        const name = s.childForFieldName("name")?.text;
        const alias = s.childForFieldName("alias")?.text ?? name;
        if (name && alias) bindings.push({ kind: "named", local: alias, imported: name });
      }
    }
  }
  // `import type …` is erased from the code that runs. `import { type A }` is erased unless
  // `verbatimModuleSyntax` keeps it as `import {} from`: the graph decides, with the tsconfig.
  const fact = importAt(node, spec, bindings, false);
  const parts = clause?.namedChildren.filter((c) => c.type !== "comment") ?? [];
  if (typeKeyword(node)) fact.typeOnly = true;
  else if (parts.length === 1 && parts[0]!.type === "named_imports" && inlineTypesOnly(parts[0]!, "import_specifier")) fact.inlineTypeOnly = true;
  return [fact];
}

/** Literal `import("…")` / `require("…")` anywhere in the file. A non-literal specifier is coverage, not an edge. */
function collectDynamicImports(root: Node, facts: FileFacts): void {
  const add = (node: Node, spec: string, optional: boolean, typeOnly = false): void => {
    const line = node.startPosition.row + 1;
    const same = facts.imports.find((i) => i.source === spec && i.line === line);
    if (same) {
      // One runtime `import()` on the line makes the dependency a runtime one.
      if (same.typeOnly && !typeOnly) delete same.typeOnly;
      return;
    }
    const fact = importAt(node, spec, [], false);
    if (optional) fact.optional = true;
    if (typeOnly) fact.typeOnly = true;
    facts.imports.push(fact);
  };
  walkNamed(root, (node) => {
    if (node.type === "new_expression" || node.type === "call_expression") {
      const specs = moduleUrlSpecs(node);
      if (specs === null) facts.unsupported.push(unsupported(node, "computed specifier"));
      for (const spec of specs ?? []) add(node, spec.spec, spec.optional);
    }
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      const isImport = fn?.type === "import";
      // A `require` parameter or local is not Node's; `createRequire(…)`'s is.
      const isRequire = fn?.type === "identifier" && fn.text === "require" && requireKind(fn) !== "shadowed";
      // `import.meta.resolve("./w.ts")` names a module the way `import()` does.
      const isResolve = fn?.type === "member_expression" && fn.text.replace(/\s+/g, "") === "import.meta.resolve";
      if (isImport || isRequire || isResolve) {
        const arg = node.childForFieldName("arguments")?.namedChildren[0];
        if (arg?.type === "string") {
          const spec = stringValue(arg);
          if (spec) add(node, spec, false, isImport && inTypePosition(node));
        } else if (arg) {
          facts.unsupported.push(unsupported(node, "computed specifier"));
        }
      }
    }
  });
}

/** Nodes whose whole subtree is a type: an `import("./a")` in one is erased by tsc. */
const TYPE_CONTEXT = new Set(["type_annotation", "opting_type_annotation", "omitting_type_annotation", "asserts_annotation", "type_predicate_annotation", "type_query", "type_arguments", "type_parameters", "type_alias_declaration", "interface_declaration", "implements_clause"]);

/**
 * Whether an `import(…)` call is written where a type goes (`x: import("./a").A`,
 * `typeof import("./a")`, `v as import("./a").T`): a type-only dependency, as `import type` is.
 */
function inTypePosition(node: Node): boolean {
  for (let child = node, parent = node.parent; parent !== null; child = parent, parent = parent.parent) {
    if (TYPE_CONTEXT.has(parent.type)) return true;
    // `v as T`, `v satisfies T`: the operand after the value is the type.
    if ((parent.type === "as_expression" || parent.type === "satisfies_expression") && parent.namedChildren[0]?.id !== child.id) return true;
    if (parent.type === "statement_block" || parent.type === "program") return false;
  }
  return false;
}

/** Namespace, `eval`, `new Function`, and a call through `obj[expr]` are coverage, not edges. */
function collectUnsupported(root: Node, facts: FileFacts): void {
  walkNamed(root, (node) => {
    if (node.type === "internal_module" || (node.type === "module" && parentOf(node)?.type !== "ambient_declaration")) facts.unsupported.push(unsupported(node, "unsupported construct `namespace`"));
    if (node.type === "call_expression" || node.type === "new_expression") {
      const written = node.childForFieldName(node.type === "call_expression" ? "function" : "constructor");
      const fn = written ? unwrapValue(written) : null;
      if (node.type === "call_expression" && fn?.type === "identifier" && fn.text === "eval") facts.unsupported.push(unsupported(fn, "unsupported construct `eval`"));
      if (fn?.type === "subscript_expression") facts.unsupported.push(unsupported(fn, "unsupported construct `computed call`"));
      if (node.type === "new_expression" && fn?.type === "identifier" && fn.text === "Function") facts.unsupported.push(unsupported(fn, "unsupported construct `Function`"));
    }
  });
}

function unsupported(node: Node, reason: string): UnsupportedFact {
  const at = located(node);
  return { line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, reason };
}

/**
 * The callee of a call or a function value in an argument: `f`, `a.b`,
 * `this.m`, or `this.field.m` when the field's class is known. Null for any
 * other shape.
 */
function calleeFact(n: Node, stop: Node, cls: ClassScope | null): CallFact | null {
  if (n.type === "identifier" || n.type === "shorthand_property_identifier") return boundCall(callFact(n.text, n), bindingOf(n, n.text, stop));
  if (n.type !== "member_expression") return null;
  const obj = n.childForFieldName("object");
  const prop = n.childForFieldName("property");
  if (!obj || !prop) return null;
  if (obj.type === "this") {
    // `this` of an object-literal method or a nested `function` is not the class.
    if (!classThis(n)) return { ...callFact(`this.${prop.text}`, n), bound: "local" };
    const fact = callFact(`this.${prop.text}`, n);
    const hook = cls?.hooks.get(memberName(prop));
    if (hook) fact.hook = hook;
    return fact;
  }
  if (obj.type === "identifier") {
    const fact = boundCall(callFact(`${obj.text}.${prop.text}`, n), bindingOf(n, obj.text, stop));
    const receiver = fact.bound ? localClass(n, obj.text, stop) : null;
    if (receiver) fact.receiver = receiver;
    return fact;
  }
  // `this.decoder.feed()`: the receiver is a field whose class the class body names.
  const field = obj.type === "member_expression" && obj.childForFieldName("object")?.type === "this" ? obj.childForFieldName("property") : null;
  const type = field ? cls?.fields.get(memberName(field)) : undefined;
  if (field && type && classThis(n)) return { ...callFact(`this.${field.text}.${prop.text}`, n), receiver: type };
  // `new Foo().run()`: an instance of the class `new` names, unless `Foo` is rebound here.
  const created = newClass(unwrapValue(obj));
  const text = collapse(n.text);
  if (created && bindingOf(obj, created, stop) === null && text.length < MAX_CALLEE) return { ...callFact(text, n), receiver: created };
  return null;
}

/** `this` at `n` is the class instance: the nearest enclosing non-arrow function is a class member, or a field initializer or `static {}` holds it. */
function classThis(n: Node): boolean {
  for (let at = parentOf(n); at; at = parentOf(at)) {
    if (at.type === "class_body") return true;
    if (FUNCTION_NODES.has(at.type) && at.type !== "arrow_function") return at.type === "method_definition" && parentOf(at)?.type === "class_body";
  }
  return false;
}

/**
 * Function values in the arguments: the argument itself (`run(save)`,
 * `run(this.m)`, `run(obj.m)` with the class of `obj` known, `run(this.m.bind(this))`)
 * or a property of an object literal. A closure literal is not a pass: its
 * calls carry `closureArg`.
 */
function passesOf(call: Node, stop: Node, cls: ClassScope | null): PassFact[] {
  if (call.type !== "call_expression" && call.type !== "new_expression") return [];
  const args = call.childForFieldName("arguments");
  if (args?.type !== "arguments") return [];
  const out: PassFact[] = [];
  args.namedChildren.filter((arg) => arg.type !== "comment").forEach((arg, index) => {
    const add = (node: Node, path: string, written: Node = node): void => {
      const fact = calleeFact(node, stop, cls);
      // A local value of unknown class names nothing the graph can resolve.
      if (!fact || (fact.bound && !fact.receiver)) return;
      const at = located(written);
      out.push({ arg: index, path, callee: fact.callee, ...(fact.bound ? { bound: fact.bound } : {}), ...(fact.receiver ? { receiver: fact.receiver } : {}), text: collapse(at.text).slice(0, MAX_CALLEE), line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol });
    };
    if (arg.type === "identifier" || arg.type === "member_expression") add(arg, "");
    // `this.m.bind(this)`: the function `this.m`, with `this` fixed.
    const bound = arg.type === "call_expression" ? arg.childForFieldName("function") : null;
    const fn = bound?.type === "member_expression" && bound.childForFieldName("property")?.text === "bind" ? bound.childForFieldName("object") : null;
    if (fn && (fn.type === "identifier" || fn.type === "member_expression")) add(fn, "", arg);
    if (arg.type !== "object") return;
    for (const p of arg.namedChildren) {
      if (p.type === "shorthand_property_identifier") add(p, p.text);
      if (p.type !== "pair") continue;
      const key = p.childForFieldName("key");
      const value = p.childForFieldName("value");
      if (key && value && (key.type === "property_identifier" || key.type === "string")) add(value, memberName(key));
    }
  });
  return out;
}

/**
 * A call inside a function nested in the declaration `stop` gets `closure`;
 * when every such function is a closure literal written as an argument of a
 * call (`items.map(() => hit())`, `new Promise((ok) => hit())`), also
 * `closureArg` at the outermost one. A closure stored in a value, a method of
 * an object literal, a nested `function` declaration: `closure` alone.
 */
function markClosure(fact: CallFact, n: Node, stop: Node): void {
  let outermost: Node | null = null;
  let stored = false;
  for (let at = parentOf(n); at && at.id !== stop.id; at = parentOf(at)) {
    if (!FUNCTION_NODES.has(at.type)) continue;
    outermost = at;
    if (parentOf(at)?.type !== "arguments") stored = true;
  }
  if (!outermost) return;
  fact.closure = true;
  if (!stored) fact.closureArg = { line: outermost.startPosition.row + 1, col: startCol(outermost) };
}

/** `: X` → `X`; generics, unions and qualified names are not a class the graph can resolve. */
function typeName(annotation: Node | null): string | null {
  const type = annotation?.type === "type_annotation" ? annotation.namedChildren[0] : null;
  return type?.type === "type_identifier" ? type.text : null;
}

/** `new X(…)` → `X`. */
function newClass(value: Node | null): string | null {
  const ctor = value?.type === "new_expression" ? value.childForFieldName("constructor") : null;
  return ctor?.type === "identifier" ? ctor.text : null;
}

type Declaration = { kind: "local"; node: Node } | { kind: "parameter"; node: Node; fn: Node; index: number } | { kind: "other" };

/**
 * The nearest binding of `name` between `from` and `stop`, in the scopes
 * `bindingOf` walks: a declarator or a parameter; `other` for a loop or
 * `catch` variable, a nested function or class name. Null when nothing binds it.
 */
function declarationOf(from: Node, name: string, stop: Node): Declaration | null {
  for (let at: Node | null = from; at; at = parentOf(at)) {
    if (FUNCTION_NODES.has(at.type)) {
      const single = at.childForFieldName("parameter");
      if (single?.type === "identifier" && single.text === name) return { kind: "parameter", node: single, fn: at, index: 0 };
      const params = at.childForFieldName("parameters")?.namedChildren.filter((p) => p.type !== "comment") ?? [];
      for (const [index, param] of params.entries()) if (patternNames(param).includes(name)) return { kind: "parameter", node: param, fn: at, index };
      if (at.id !== stop.id && at.type !== "arrow_function" && at.childForFieldName("name")?.text === name) return { kind: "other" };
    }
    if (BLOCK_NODES.has(at.type) || at.type === "program") {
      for (const stmt of blockStatements(at)) {
        const target = stmt.type === "export_statement" ? stmt.childForFieldName("declaration") : stmt;
        if (!target) continue;
        if (target.type === "lexical_declaration" || target.type === "variable_declaration") {
          for (const d of target.namedChildren) {
            const pattern = d.type === "variable_declarator" ? d.childForFieldName("name") : null;
            if (pattern && patternNames(pattern).includes(name)) return { kind: "local", node: d };
          }
        } else if (declaredNames(target).includes(name)) return { kind: "other" };
      }
    }
    if (at.type === "for_in_statement") {
      const left = at.childForFieldName("left");
      if (left && patternNames(left).includes(name)) return { kind: "other" };
    }
    if (at.type === "for_statement") {
      const init = at.childForFieldName("initializer");
      if (init && declaredNames(init).includes(name)) return { kind: "other" };
    }
    if (at.type === "catch_clause") {
      const param = at.childForFieldName("parameter");
      if (param && patternNames(param).includes(name)) return { kind: "other" };
    }
    if (at.id === stop.id) break;
  }
  return null;
}

/**
 * Class of a local or parameter: `const w = new X()`, `const w: X = …`, `(w: X) =>`.
 * Null when a nearer binding (a loop variable) hides the declaration, or when
 * `X` itself is rebound between the declaration and `stop` (`const X = Ctor`).
 */
function localClass(from: Node, name: string, stop: Node): string | null {
  const binding = declarationOf(from, name, stop);
  if (!binding || binding.kind === "other") return null;
  let type: string | null;
  if (binding.kind === "local") type = binding.node.childForFieldName("name")?.type === "identifier" ? (typeName(binding.node.childForFieldName("type")) ?? newClass(binding.node.childForFieldName("value"))) : null;
  else type = binding.node.childForFieldName("pattern")?.type === "identifier" ? typeName(binding.node.childForFieldName("type")) : null;
  return type && bindingOf(binding.node, type, stop) === null ? type : null;
}

/** `x ?? f` / `x || f` with a callee `f`: the value `x` and the default. */
function fallbackOf(expr: Node, stop: Node): { source: Node; fallback: string } | null {
  if (expr.type !== "binary_expression") return null;
  const operator = expr.childForFieldName("operator")?.text;
  const left = expr.childForFieldName("left");
  const right = expr.childForFieldName("right");
  if ((operator !== "??" && operator !== "||") || !left || !right) return null;
  const fallback = fallbackCallee(right, stop);
  return fallback ? { source: left, fallback } : null;
}

/** A default that names a declaration: an unbound `f`, `mod.f`, or `this.m`. */
function fallbackCallee(node: Node, stop: Node): string | null {
  if (node.type === "identifier") return bindingOf(node, node.text, stop) === null ? node.text : null;
  if (node.type !== "member_expression") return null;
  const obj = node.childForFieldName("object");
  const prop = node.childForFieldName("property");
  if (!obj || !prop) return null;
  if (obj.type === "this") return `this.${prop.text}`;
  return obj.type === "identifier" && bindingOf(node, obj.text, stop) === null ? `${obj.text}.${prop.text}` : null;
}

/**
 * The hook behind a call of a local or parameter `name`:
 * `const g = request.generate ?? generateMap`, `const { g = f } = request`,
 * `function run(g = f)`, `function run({ g = f })`. Injection is known only
 * for a parameter of the declaration itself.
 */
function localHook(from: Node, name: string, stop: Node): HookFact | null {
  const binding = declarationOf(from, name, stop);
  if (!binding || binding.kind === "other") return null;
  if (binding.kind === "parameter") {
    const found = defaultIn(binding.node, name, "");
    const fallback = found ? fallbackCallee(found.value, stop) : null;
    if (!found || !fallback) return null;
    return { name, fallback, param: binding.fn.id === stop.id ? binding.index : null, path: found.path, owner: "self" };
  }
  const pattern = binding.node.childForFieldName("name");
  const value = binding.node.childForFieldName("value");
  if (!pattern || !value) return null;
  let source: Node;
  let fallback: string;
  let path = "";
  if (pattern.type === "identifier") {
    const hook = fallbackOf(value, stop);
    if (!hook) return null;
    source = hook.source;
    fallback = hook.fallback;
  } else {
    // `const { generate = generateMap } = request`
    const found = defaultIn(pattern, name, "");
    const callee = found ? fallbackCallee(found.value, stop) : null;
    if (!found || !callee) return null;
    source = value;
    fallback = callee;
    path = found.path;
  }
  const head = source.type === "member_expression" ? source.childForFieldName("object") : source;
  if (source.type === "member_expression") path = source.childForFieldName("property")?.text ?? "";
  const param = head?.type === "identifier" ? declarationOf(binding.node, head.text, stop) : null;
  // Callers inject through a plain parameter of this declaration, not a destructured one or a closure's.
  const index = param?.kind === "parameter" && param.fn.id === stop.id && plainParameter(param.node) ? param.index : null;
  return { name, fallback, param: index, path: index === null ? "" : path, owner: "self" };
}

function plainParameter(node: Node): boolean {
  if (node.type === "identifier") return true;
  if (node.type === "required_parameter" || node.type === "optional_parameter") return node.childForFieldName("pattern")?.type === "identifier";
  return node.type === "assignment_pattern" && node.childForFieldName("left")?.type === "identifier";
}

/** The default value of `name` in a parameter or pattern, with its property path. */
function defaultIn(node: Node, name: string, path: string): { value: Node; path: string } | null {
  switch (node.type) {
    case "required_parameter":
    case "optional_parameter": {
      const pattern = node.childForFieldName("pattern");
      const value = node.childForFieldName("value");
      if (pattern?.type === "identifier") return pattern.text === name && value ? { value, path } : null;
      return pattern ? defaultIn(pattern, name, path) : null;
    }
    case "assignment_pattern": {
      const left = node.childForFieldName("left");
      const right = node.childForFieldName("right");
      return left?.type === "identifier" && left.text === name && right ? { value: right, path } : null;
    }
    case "object_assignment_pattern": {
      const left = node.childForFieldName("left");
      const right = node.childForFieldName("right");
      return left?.text === name && right ? { value: right, path: left.text } : null;
    }
    case "pair_pattern": {
      const key = node.childForFieldName("key");
      const value = node.childForFieldName("value");
      const found = value ? defaultIn(value, name, path) : null;
      return found && key ? { value: found.value, path: memberName(key) } : null;
    }
    case "object_pattern":
      for (const child of node.namedChildren) {
        const found = defaultIn(child, name, path);
        if (found) return found;
      }
      return null;
    default:
      return null;
  }
}

/**
 * Names read as values: identifiers outside callee and binding positions,
 * shorthand properties, and member names read without a call. The first
 * position of each name in the file.
 */
function collectValueRefs(root: Node, facts: FileFacts): void {
  const first = new Map<string, ValueRefFact>();
  const note = (name: string, node: Node, member: boolean): void => {
    const key = `${member ? "." : ""}${name}`;
    if (!first.has(key)) first.set(key, { name, ...(member ? { member: true as const } : {}), line: node.startPosition.row + 1, col: startCol(node) });
  };
  walkNamed(root, (node) => {
    const parent = parentOf(node);
    // A local binding of the name is not the module-level declaration; exporting a name is not reading it.
    if (((node.type === "identifier" && parent && !bindsOrCalls(node, parent)) || node.type === "shorthand_property_identifier") && !exportedValue(node) && !memberObject(node, parent, facts)) {
      if (bindingOf(node, node.text, root) === null) note(node.text, node, false);
    }
    // Destructuring reads properties: `const { feed } = decoder` takes the method as a value.
    if (node.type === "shorthand_property_identifier_pattern" || (node.type === "property_identifier" && parent?.type === "pair_pattern" && parent.childForFieldName("key")?.id === node.id)) note(node.text, node, true);
    if ((node.type === "property_identifier" || node.type === "private_property_identifier") && parent?.type === "member_expression" && parent.childForFieldName("property")?.id === node.id) {
      const grand = parentOf(parent);
      const called = calledMember(parent);
      const written = grand?.type === "assignment_expression" && grand.childForFieldName("left")?.id === parent.id;
      const object = parent.childForFieldName("object");
      // `mod.save` of an imported module reads the module function itself.
      const moduleRead = object?.type === "identifier" && moduleSource(facts, object.text, true) !== null && bindingOf(object, object.text, root) === null;
      if (!called && !written) {
        if (moduleRead) note(`${object.text}.${node.text}`, node, false);
        else note(memberName(node), node, true);
      }
    }
    return true;
  });
  facts.valueRefs = [...first.values()].sort((a, b) => a.line - b.line || a.col - b.col);
}

/**
 * The identifier is the object of a member access that uses only a member of
 * it: `ns.helper()`, `new ns.X()`, and any `mod.x` of a module binding (the
 * read is `mod.x`, noted on its own). `.call`, `.apply` and `.bind` use the
 * function itself, so they read it.
 */
function memberObject(node: Node, parent: Node | null, facts: FileFacts): boolean {
  if (parent?.type !== "member_expression" || parent.childForFieldName("object")?.id !== node.id) return false;
  const property = parent.childForFieldName("property")?.text;
  if (property === "call" || property === "apply" || property === "bind") return false;
  return calledMember(parent) || moduleSource(facts, node.text, true) !== null;
}

/** The member expression is what a call or `new` runs: `a.b()`, `new a.B()`. */
function calledMember(member: Node): boolean {
  const grand = parentOf(member);
  return (grand?.type === "call_expression" && grand.childForFieldName("function")?.id === member.id) || (grand?.type === "new_expression" && grand.childForFieldName("constructor")?.id === member.id);
}

/**
 * A name the module exports as a value: `export default handler`, `export =
 * handler`, `module.exports = handler` or `= { handler }`, `exports.run = run`.
 * Importers that call it are resolved callers, as for `export { handler }`.
 */
function exportedValue(node: Node): boolean {
  let at = node;
  let parent = parentOf(at);
  // `module.exports = { a, b: impl }`: the property value is the export.
  if (parent?.type === "pair" && parent.childForFieldName("value")?.id === at.id) {
    at = parent;
    parent = parentOf(at);
  }
  if (parent?.type === "object" && (node.type === "shorthand_property_identifier" || at.type === "pair")) {
    at = parent;
    parent = parentOf(at);
  } else if (node.type === "shorthand_property_identifier") return false;
  if (parent?.type === "export_statement") return at.type !== "object" && parent.childForFieldName("declaration") === null && parent.childForFieldName("source") === null;
  const statement = parent ? parentOf(parent) : null;
  if (parent?.type !== "assignment_expression" || parent.childForFieldName("right")?.id !== at.id || statement?.type !== "expression_statement" || (statement ? parentOf(statement) : null)?.type !== "program") return false;
  const left = parent.childForFieldName("left")?.text.replace(/\s+/g, "") ?? "";
  return left === "module.exports" || ((left.startsWith("exports.") || left.startsWith("module.exports.")) && at.type !== "object");
}

const BINDING_PARENTS = new Set(["import_specifier", "export_specifier", "namespace_import", "import_clause", "namespace_export", "labeled_statement", "break_statement", "continue_statement", "object_pattern", "array_pattern", "rest_pattern"]);

/** The identifier is a callee, a declared name, or a binding — not a value read. */
function bindsOrCalls(node: Node, parent: Node): boolean {
  const is = (field: string): boolean => parent.childForFieldName(field)?.id === node.id;
  if (parent.type === "call_expression" && is("function")) return true;
  if (parent.type === "new_expression" && is("constructor")) return true;
  if (BINDING_PARENTS.has(parent.type)) return true;
  if ((parent.type === "assignment_pattern" || parent.type === "object_assignment_pattern") && is("left")) return true;
  if (parent.type === "pair_pattern" && is("value")) return true;
  if ((parent.type === "required_parameter" || parent.type === "optional_parameter") && is("pattern")) return true;
  if (parent.type === "variable_declarator" && is("name")) return true;
  if (FUNCTION_NODES.has(parent.type) && (is("name") || is("parameter"))) return true;
  if (parent.type === "formal_parameters") return true;
  if ((parent.type === "class_declaration" || parent.type === "class" || parent.type === "abstract_class_declaration") && is("name")) return true;
  return false;
}

/** Strings an expression can evaluate to: a literal, a ternary of literals, a `const` bound to one. */
function stringsOf(node: Node): string[] | null {
  if (node.type === "string") return [stringValue(node) ?? ""];
  if (node.type === "template_string") return node.namedChildren.some((c) => c.type === "template_substitution") ? null : [node.text.slice(1, -1)];
  if (node.type === "parenthesized_expression") return node.namedChildren[0] ? stringsOf(node.namedChildren[0]) : null;
  if (node.type === "ternary_expression") {
    const a = node.childForFieldName("consequence");
    const b = node.childForFieldName("alternative");
    const left = a ? stringsOf(a) : null;
    const right = b ? stringsOf(b) : null;
    return left && right ? [...new Set([...left, ...right])] : null;
  }
  if (node.type !== "identifier") return null;
  const binding = declarationOf(node, node.text, node.tree.rootNode);
  const decl = binding?.kind === "local" ? binding.node : null;
  const value = decl?.childForFieldName("value");
  const holder = decl ? parentOf(decl) : null;
  const isConst = holder?.type === "lexical_declaration" && holder.children.some((c) => c.type === "const");
  return isConst && value && decl?.childForFieldName("name")?.type === "identifier" ? stringsOf(value) : null;
}

const MODULE_FILE = /\.[cm]?[jt]sx?$/;

function isImportMetaUrl(node: Node | undefined): boolean {
  return node !== undefined && node.text.replace(/\s+/g, "") === "import.meta.url";
}

/**
 * Module files named relative to this module: `new URL("./worker.ts", import.meta.url)`
 * (a `Worker`, a loader) and `register(spec, import.meta.url | { parentURL: import.meta.url })`.
 * Null when the specifier is not a string the syntax fixes: a module edge may
 * be hidden there. A computed URL whose fixed suffix names a non-module file
 * (`./img/${n}.png` in a template) is not a module. A relative URL without an
 * extension (`./worker`) is `optional`: a module when it resolves to a source
 * file, which a bundler would load, and nothing otherwise.
 */
function moduleUrlSpecs(node: Node): { spec: string; optional: boolean }[] | null {
  const args = node.childForFieldName("arguments")?.namedChildren.filter((c) => c.type !== "comment") ?? [];
  const [spec, base] = args;
  if (!spec) return [];
  if (node.type === "new_expression" && node.childForFieldName("constructor")?.text === "URL" && isImportMetaUrl(base)) {
    const strings = stringsOf(spec);
    if (strings === null) return NON_MODULE_SUFFIX.test(staticSuffix(spec)) && !MODULE_FILE.test(staticSuffix(spec)) ? [] : null;
    return strings.filter((s) => s.startsWith(".") && (MODULE_FILE.test(s) || extensionless(s))).map((s) => ({ spec: s, optional: !MODULE_FILE.test(s) }));
  }
  const fn = node.type === "call_expression" ? node.childForFieldName("function") : null;
  const isRegister = fn?.text === "register" || fn?.text.replace(/\s+/g, "") === "module.register";
  const parentUrl = isImportMetaUrl(base) || (base?.type === "object" && base.namedChildren.some((p) => p.type === "pair" && p.childForFieldName("key")?.text === "parentURL" && isImportMetaUrl(p.childForFieldName("value") ?? undefined)));
  return isRegister && parentUrl ? (stringsOf(spec)?.map((s) => ({ spec: s, optional: false })) ?? null) : [];
}

/** `./worker`, `../lib/job`: a path whose last segment has no extension (not a directory `./dir/`, not `.` or `..`). */
function extensionless(spec: string): boolean {
  const last = spec.slice(spec.lastIndexOf("/") + 1);
  return last !== "" && last !== "." && last !== ".." && !last.includes(".");
}

const NON_MODULE_SUFFIX = /\.[A-Za-z0-9]+$/;

/** The literal end of a computed string: the tail of a template, the last operand of `+`. */
function staticSuffix(node: Node): string {
  if (node.type === "string") return stringValue(node) ?? "";
  if (node.type === "template_string") {
    const last = node.namedChildren.at(-1);
    return last && last.type !== "template_substitution" ? node.text.slice(last.startIndex - node.startIndex, -1) : "";
  }
  if (node.type === "binary_expression" && node.childForFieldName("operator")?.text === "+") {
    const right = node.childForFieldName("right");
    return right ? staticSuffix(right) : "";
  }
  if (node.type === "parenthesized_expression" && node.namedChildren[0]) return staticSuffix(node.namedChildren[0]);
  return "";
}

/** Parameters and locals declared directly in a function, not inside a nested one. */
const FUNCTION_NODES = new Set(["function_declaration", "generator_function_declaration", "function_expression", "function", "generator_function", "arrow_function", "method_definition", "function_signature"]);
const BLOCK_NODES = new Set(["statement_block", "switch_body", "class_body"]);

/**
 * Where the head identifier of a call is bound between the call and `stop`
 * (the declaration being extracted): a parameter, a local, a destructured
 * name, a nested function or class, a loop or catch variable. Such a call
 * does not name the module-level symbol of the same name.
 */
function bindingOf(call: Node, name: string, stop: Node): "parameter" | "local" | null {
  for (let at: Node | null = call; at; at = parentOf(at)) {
    if (FUNCTION_NODES.has(at.type)) {
      const params = at.childForFieldName("parameters") ?? at.childForFieldName("parameter");
      if (params && patternNames(params).includes(name)) return "parameter";
      // A named function expression sees its own name.
      if (at.id !== stop.id && at.type !== "arrow_function" && at.childForFieldName("name")?.text === name) return "local";
    }
    if (BLOCK_NODES.has(at.type) || (at.id === stop.id && at.childForFieldName("body")?.type === "statement_block")) {
      const block = BLOCK_NODES.has(at.type) ? at : at.childForFieldName("body");
      if (block && blockDeclares(block, name)) return "local";
    }
    if (at.type === "for_in_statement") {
      const left = at.childForFieldName("left");
      if (left && patternNames(left).includes(name)) return "local";
    }
    if (at.type === "for_statement") {
      const init = at.childForFieldName("initializer");
      if (init && declaredNames(init).includes(name)) return "local";
    }
    if (at.type === "catch_clause") {
      const param = at.childForFieldName("parameter");
      if (param && patternNames(param).includes(name)) return "local";
    }
    if (at.id === stop.id) break;
  }
  return null;
}

/** The statements of a block. A `switch` is one block: a `const` or `function` of one case is in scope in every case. */
function blockStatements(block: Node): Node[] {
  if (block.type !== "switch_body") return block.namedChildren;
  return block.namedChildren.flatMap((c) => (c.type === "switch_case" || c.type === "switch_default" ? c.childrenForFieldName("body") : []));
}

function blockDeclares(block: Node, name: string): boolean {
  for (const stmt of blockStatements(block)) {
    const target = stmt.type === "export_statement" ? stmt.childForFieldName("declaration") : stmt;
    if (!target) continue;
    if (declaredNames(target).includes(name)) return true;
  }
  return false;
}

function declaredNames(stmt: Node): string[] {
  if (stmt.type === "lexical_declaration" || stmt.type === "variable_declaration") {
    return stmt.namedChildren.filter((d) => d.type === "variable_declarator").flatMap((d) => {
      const nameNode = d.childForFieldName("name");
      return nameNode ? patternNames(nameNode) : [];
    });
  }
  if (FUNCTION_NODES.has(stmt.type) || stmt.type === "class_declaration" || stmt.type === "abstract_class_declaration") {
    const nameNode = stmt.childForFieldName("name");
    return nameNode ? [nameNode.text] : [];
  }
  return [];
}

/** Every identifier bound by a parameter list or a destructuring pattern. */
function patternNames(node: Node): string[] {
  switch (node.type) {
    case "identifier":
    case "shorthand_property_identifier_pattern":
      return [node.text];
    case "pair_pattern": {
      const value = node.childForFieldName("value");
      return value ? patternNames(value) : [];
    }
    case "assignment_pattern":
    case "object_assignment_pattern": {
      const left = node.childForFieldName("left");
      return left ? patternNames(left) : [];
    }
    case "required_parameter":
    case "optional_parameter": {
      const pattern = node.childForFieldName("pattern");
      return pattern ? patternNames(pattern) : [];
    }
    case "lexical_declaration":
    case "variable_declaration":
      return declaredNames(node);
    default:
      if (node.type.endsWith("_pattern") || node.type === "formal_parameters" || node.type === "rest_pattern") return node.namedChildren.flatMap(patternNames);
      return [];
  }
}

/**
 * Source of the import that bound `local` as a whole module (a namespace or
 * `require`), if any; with `orDefault`, also as a default import, whose
 * members the graph resolves on the default export.
 */
function moduleSource(facts: FileFacts, local: string, orDefault = false): string | null {
  return facts.imports.find((i) => i.bindings.some((b) => (b.kind === "module" || (orDefault && b.kind === "default")) && b.local === local))?.source ?? null;
}

/**
 * `require("./x")`, `import("./x")`, `await import("./x")` as the whole value:
 * the module a declarator binds. A `require` parameter or local is not Node's.
 * `namespace`: `import()` gives the module's namespace object, `require()`
 * its `module.exports`.
 */
function requireSource(value: Node, requires: ReturnType<typeof query>): { source: string; namespace: boolean } | null {
  const call = value.type === "await_expression" ? value.namedChildren[0] : value;
  if (call?.type !== "call_expression") return null;
  for (const m of requires.matches(call)) {
    const src = m.captures.find((c) => c.name === "source");
    if (!src) continue;
    // `(string (string_fragment))` in the arguments of `call` itself.
    const string = parentOf(src.node);
    const args = string ? parentOf(string) : null;
    if ((args ? parentOf(args) : null)?.id !== call.id) continue;
    const fn = m.captures.find((c) => c.name === "fn");
    if (fn && requireKind(fn.node) === "shadowed") continue;
    return { source: src.node.text, namespace: fn === undefined };
  }
  return null;
}

/**
 * `module.exports = {…}`, `module.exports = f`, `exports.x = …`. A function
 * value assigned there is a fn of the module, like `export const x = () => …`:
 * `exports.run = function () {}` and `module.exports = { go() {} }` declare
 * `run` and `go`; `module.exports = function () {}` declares `default`.
 */
function commonJsExports(stmt: Node, facts: FileFacts, declCalls: (n: Node) => CallFact[]): void {
  const expr = stmt.namedChildren[0];
  if (!expr || expr.type !== "assignment_expression") return;
  const left = expr.childForFieldName("left")?.text.replace(/\s+/g, "");
  const written = expr.childForFieldName("right");
  if (!left || !written) return;
  const right = unwrapValue(written);
  /** A function value becomes the fn `name`; the kind of the module's declaration of that name, if any. */
  const declare = (name: string, fn: Node, at: Node): DeclFact["kind"] | null => {
    const existing = facts.decls.find((d) => d.name === name);
    if (existing) return existing.kind;
    if (!FUNCTION_VALUES.has(fn.type) && fn.type !== "method_definition") return null;
    facts.decls.push(decl("fn", name, at, signature(fn), true, declCalls(fn), collectTypeRefs(fn), []));
    return "fn";
  };
  /** The row of `name = value`: a local it names, a declared fn, or a value keylang does not follow. */
  const row = (name: string, value: Node | null, at: Node): void => {
    facts.exports.add(name);
    const target = value ? unwrapValue(value) : null;
    const form = name === "default" ? { form: "default" as const } : {};
    if (target?.type === "identifier" || target?.type === "shorthand_property_identifier") {
      facts.exportRows.push({ name, kind: "value", local: target.text, ...(name === "default" ? form : target.text !== name ? { form: "alias" as const } : {}) });
      return;
    }
    const kind = target ? declare(name, target, at) : null;
    facts.exportRows.push({ name, kind: kind ?? "value", local: kind ? name : null, ...form });
  };
  if (left === "module.exports") {
    if (right.type === "object") {
      for (const p of right.namedChildren) {
        if (p.type === "shorthand_property_identifier") row(p.text, p, p);
        else if (p.type === "pair") {
          const k = p.childForFieldName("key")?.text;
          if (!k) continue;
          row(k.replace(/^['"]|['"]$/g, ""), p.childForFieldName("value"), p);
        } else if (p.type === "method_definition") {
          const name = p.childForFieldName("name");
          if (name?.type === "property_identifier") row(name.text, p, p);
        }
      }
    } else {
      // `module.exports = handler`, `= function () {}`: the module's value, `default` to an ESM importer.
      row("default", right, expr);
    }
  } else if (left.startsWith("exports.") || left.startsWith("module.exports.")) {
    row(left.slice(left.lastIndexOf(".") + 1), right, expr);
  }
}

function stringValue(n: Node): string | null {
  if (n.type !== "string") return null;
  return n.namedChildren.find((c) => c.type === "string_fragment")?.text ?? "";
}

/** HTTP verbs of a router's registration methods, as Express, Koa-router, Fastify and Hono write them. */
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);

/**
 * `app.get('/x', h)`, `router.post('/x', auth, h)`: a handler registered on a
 * literal path — a `route` entry labelled `GET /x` whose callee is the last
 * argument when it is a name (`h`, `handlers.save`). A computed path, or a
 * handler written in place, is not recorded: nothing in the code names it.
 */
function collectRouteEntries(root: Node, facts: FileFacts): void {
  const entries: NonNullable<FileFacts["entries"]> = [];
  const walk = (node: Node): void => {
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      const property = fn?.type === "member_expression" ? fn.childForFieldName("property") : null;
      const method = property?.type === "property_identifier" ? property.text : null;
      const args = node.childForFieldName("arguments")?.namedChildren.filter((arg) => arg.type !== "comment") ?? [];
      const path = args[0] === undefined ? null : stringValue(args[0]);
      const handler = args.length >= 2 ? args[args.length - 1] : undefined;
      if (method !== null && ROUTE_METHODS.has(method) && path !== null && path.startsWith("/") && handler !== undefined && (handler.type === "identifier" || handler.type === "member_expression")) {
        const at = located(node);
        entries.push({ kind: "route", label: `${method.toUpperCase()} ${path}`, callee: collapse(handler.text), line: at.line, col: at.col });
      }
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
  if (entries.length > 0) facts.entries = entries;
}

function signature(fn: Node): string {
  const params = fn.childForFieldName("parameters") ?? fn.childForFieldName("parameter");
  const ret = fn.childForFieldName("return_type");
  let s = params ? collapse(params.text) : "()";
  if (params && params.type !== "formal_parameters") s = `(${s})`;
  if (ret) s += ` → ${collapse(ret.text.replace(/^:\s*/, ""))}`;
  return s;
}

function typeSignature(n: Node): string | null {
  const v = n.childForFieldName("value");
  if (n.type === "type_alias_declaration" && v) {
    const t = collapse(v.text);
    return t.length <= 60 ? `= ${t}` : null;
  }
  return heritage(n);
}

function heritage(n: Node): string | null {
  const h = n.namedChildren.find((c) => c.type === "class_heritage" || c.type === "extends_type_clause" || c.type === "extends_clause");
  return h ? collapse(h.text) : null;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Is this specifier a Node built-in (`fs`, `node:fs`)? */
export function isNodeBuiltin(spec: string): boolean {
  return spec.startsWith("node:") || builtinModules.includes(spec);
}

export type { Grammar };
