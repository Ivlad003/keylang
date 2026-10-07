// PHP facts: namespaces, `use`, classes, interfaces, traits, enums, functions
// and methods, calls, type hints, `require`/`include` and PHPDoc. PHP names a
// class or a function by its qualified name, never by its file, and a class of
// the file's own namespace needs no `use`. So every class or function name the
// file uses is an import whose specifier is the qualified name the PHP rules
// give it (`App\Domain\Order`, `function App\Support\helper`); the resolver
// finds the file that declares it (`src/php-imports.ts`). A `use` is an import
// where it is written. A name used without one is an optional import at its
// first use: an edge when a file declares that name, nothing otherwise. An
// unqualified function falls back to the global namespace, as PHP does. Calls
// PHP resolves at run time (`$f()`, `$obj->$m()`, `new $class`,
// `call_user_func`) are holes; so is a method through a value whose class the
// syntax does not name. An untyped property (PHP 7) has the class of the
// constructor parameter assigned to it (`$this->x = $x` with `X $x`), a fact of
// the syntax; without one, the class its `@var` (or the parameter's `@param`)
// writes, which PHP does not check: provenance `docblock`.

import { asciiLowerCase } from "../languages.ts";
import type { CallFact, DeclFact, ExportRow, FileFacts, ImportFact, TypeRefFact, UnsupportedFact, ValueRefFact } from "./facts.ts";
import { blockCommentBody, isLicense, jsdocDescription, nonEmpty } from "./doc-comments.ts";
import { errorLine, fingerprint, located, withTree, type Node } from "./treesitter.ts";

/** Class names PHP gives a meaning of its own: never a class of the repository. */
const SPECIAL_CLASSES = new Set(["self", "static", "parent"]);
/** Type names that are no class (some grammars give them as names, not primitive types). */
const BUILTIN_TYPES = new Set(["self", "static", "parent", "mixed", "iterable", "object", "callable", "array", "bool", "int", "float", "string", "void", "never", "null", "false", "true"]);
/** Built-in functions that call a callable chosen at run time. */
const CALLABLE_CALLS = new Set(["call_user_func", "call_user_func_array", "forward_static_call", "forward_static_call_array"]);
/** Language constructs the grammar reads as calls: no function is called. */
const CONSTRUCTS = new Set(["isset", "empty"]);
const CALL_NODES = new Set(["function_call_expression", "member_call_expression", "nullsafe_member_call_expression", "scoped_call_expression", "object_creation_expression"]);
const CLOSURE_NODES = new Set(["anonymous_function", "arrow_function", "anonymous_class"]);
const DECLARATION_NODES = new Set(["class_declaration", "interface_declaration", "trait_declaration", "enum_declaration", "function_definition"]);
const INCLUDE_NODES = new Set(["include_expression", "include_once_expression", "require_expression", "require_once_expression"]);
/** A callee longer than this is written as an opaque call through an expression. */
const MAX_CALLEE = 80;

export function extractPhp(path: string, src: string): Promise<FileFacts> {
  return withTree("php", src, (tree) => extractTree(path, tree.rootNode));
}

/** What names mean in one namespace: its name and the aliases of its `use` statements (keys in ASCII lower case: PHP class and function names ignore ASCII case). */
interface Names {
  ns: string;
  classes: Map<string, Alias>;
  functions: Map<string, Alias>;
  /** Constants keep their case. */
  consts: Map<string, Alias>;
}

interface Alias {
  /** As written in the `use`: the binding the file's names go through. */
  alias: string;
  qualified: string;
}

/** A class while its members are read: what `self::`, `$this->field->` and `static` name. */
interface ClassContext {
  name: string;
  /** Names of the static methods, in ASCII lower case. */
  statics: ReadonlySet<string>;
  /**
   * Property → its class, for a property typed with one class: `private Store $store`, a promoted
   * constructor parameter, the constructor parameter assigned to it, or its `@var`.
   */
  fields: ReadonlyMap<string, FieldType>;
}

/** The class of a property, and the docblock it comes from when no checked syntax names it. */
interface FieldType {
  /** The class's binding in the file, as `Collector.klass` gives it. */
  cls: string;
  docblock?: { line: number; col: number };
}

/** A position in the file with its source fragment. */
interface At {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
}

/** A class name written in a docblock tag: `@var Foo`, `@param Foo $x`. */
interface DocType {
  written: string;
  at: At;
}

/** Where the class of a property comes from: a constructor parameter (typed, or by its `@param`) or a `@var`. */
interface TypeSource {
  written: string;
  /** The qualified name PHP gives it, in ASCII lower case: two spellings of one class compare equal. */
  key: string;
  local: string;
  docblock?: { line: number; col: number };
}

/** Per file: the imports, values read and holes the names of the code add. */
class Collector {
  readonly imports = new Map<string, ImportFact>();
  readonly values = new Map<string, ValueRefFact>();
  readonly unsupported: UnsupportedFact[] = [];
  /** The comment that documents the file: it documents no declaration. */
  header: number | null = null;

  /** A class the code names: the binding it goes through, registered as an optional import unless a `use` binds it. */
  klass(written: string, node: Node, names: Names): string {
    return this.klassAt(written, located(node), names, false);
  }

  /** The same for a name at `at`; `docblock`: written only in a docblock, so the import is one of provenance `docblock` unless the code names it too. */
  klassAt(written: string, at: At, names: Names, docblock: boolean): string {
    const name = canonicalClass(written.trim(), names);
    if (!name.explicit && name.qualified !== null) this.implicit(name.local, name.qualified, at, docblock);
    return name.local;
  }

  /** A function the code calls by name, likewise. */
  fn(written: string, node: Node, names: Names): string {
    const name = canonicalFunction(written.trim(), names);
    if (!name.explicit) this.implicit(name.local, name.spec, located(node), false);
    return name.local;
  }

  /** A name's first use is its import; a use in the code replaces one in a docblock, whichever came first. */
  private implicit(local: string, spec: string, at: At, docblock: boolean): void {
    const key = `${spec}\0${local}`;
    const existing = this.imports.get(key);
    if (existing && (docblock || !existing.docblock)) return;
    const imported = spec.replace(/^(function|const) /, "").replace(/ \?\? .*$/, "");
    this.imports.set(key, { source: spec, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: firstLine(at.text), bindings: [{ kind: "named", local, imported: lastSegment(imported) }], reexport: false, optional: true, ...(docblock ? { docblock: true as const } : {}) });
  }

  value(name: string, node: Node, member: boolean): void {
    const key = `${member ? "." : ""}${name}`;
    if (!this.values.has(key)) this.values.set(key, { name, ...(member ? { member: true as const } : {}), line: node.startPosition.row + 1, col: node.startPosition.column + 1 });
  }

  hole(node: Node, reason: string, symbol: string | null): void {
    this.unsupported.push({ ...unsupported(node, reason), ...(symbol ? { symbol } : {}) });
  }
}

function extractTree(path: string, root: Node): FileFacts {
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "complete", parseError: null, symbols: [] };
  const collector = new Collector();
  const header = fileDoc(root);
  collector.header = header?.id ?? null;
  const explicit: ImportFact[] = [];
  for (const region of regionsOf(root)) {
    const names: Names = { ns: region.ns, classes: new Map(), functions: new Map(), consts: new Map() };
    const statements: Node[] = [];
    for (const node of region.statements) collectTopLevel(node, statements);
    // `use` binds for the whole namespace: read them all before any name is resolved.
    for (const node of statements) if (node.type === "namespace_use_declaration") explicit.push(...usesOf(node, names));
    for (const node of statements) {
      if (node.type === "namespace_use_declaration") continue;
      if (DECLARATION_NODES.has(node.type)) {
        const decl = declarationOf(node, names, collector);
        if (!decl) continue;
        facts.decls.push(decl);
        const table = node.type === "function_definition" ? "function" : "class";
        facts.symbols!.push({ name: decl.name, qualified: qualify(names.ns, decl.name), table });
        exportRow(facts, decl.name, decl.kind === "fn" ? "fn" : decl.kind === "type" ? "type" : "class");
        continue;
      }
      if (node.type === "const_declaration") {
        for (const element of node.namedChildren.filter((c) => c.type === "const_element")) {
          const name = element.namedChildren.find((c) => c.type === "name")?.text;
          if (!name) continue;
          facts.symbols!.push({ name, qualified: qualify(names.ns, name), table: "const" });
          exportRow(facts, name, "value");
        }
      }
      // Code outside declarations runs when the file is included.
      facts.moduleCalls.push(...callsIn(node, { names, ctx: null, bound: new Map(), classes: new Map(), symbol: null }, collector, false));
    }
  }
  facts.imports = [...explicit, ...includesIn(root, path, collector), ...collector.imports.values()].sort((a, b) => a.line - b.line || a.col - b.col);
  facts.unsupported = collector.unsupported;
  facts.valueRefs = [...collector.values.values()].sort((a, b) => a.line - b.line || a.col - b.col);
  if (header) facts.doc = header.doc;
  const end = located(root);
  facts.endLine = end.endLine;
  facts.endCol = end.endCol;
  if (root.hasError) {
    facts.completeness = "opaque";
    facts.parseError = { line: errorLine(root), reason: "syntax error" };
  }
  return facts;
}

/**
 * The file in namespace regions: `namespace A;` runs to the next namespace
 * statement, `namespace A { … }` is its block, and code before the first
 * namespace (or in `namespace { … }`) is global.
 */
function regionsOf(root: Node): { ns: string; statements: Node[] }[] {
  const out: { ns: string; statements: Node[] }[] = [];
  let current = { ns: "", statements: [] as Node[] };
  out.push(current);
  for (const node of root.namedChildren) {
    if (node.type !== "namespace_definition") {
      current.statements.push(node);
      continue;
    }
    const ns = node.childForFieldName("name")?.text.replace(/\s+/g, "") ?? "";
    const body = node.childForFieldName("body");
    if (body) {
      out.push({ ns, statements: body.namedChildren });
      current = { ns: "", statements: [] };
    } else current = { ns, statements: [] };
    out.push(current);
  }
  return out.filter((region) => region.statements.length > 0);
}

/** Statements of a namespace, including those under a top-level `if` (`if (!function_exists('x')) { function x() {} }`) and in plain blocks. */
function collectTopLevel(node: Node, out: Node[]): void {
  if (node.type === "if_statement" || node.type === "else_clause" || node.type === "else_if_clause" || node.type === "compound_statement") {
    for (const child of node.namedChildren) if (child.type !== "parenthesized_expression") collectTopLevel(child, out);
    return;
  }
  out.push(node);
}

function qualify(ns: string, name: string): string {
  return ns === "" ? name : `${ns}\\${name}`;
}

function lastSegment(name: string): string {
  return name.slice(name.lastIndexOf("\\") + 1);
}

function firstLine(text: string): string {
  return text.split("\n")[0]!;
}

/** `function` or `const` of a `use` or one of its clauses; null for a class. */
function useKind(node: Node): "function" | "const" | null {
  const kind = node.childForFieldName("type")?.text;
  return kind === "function" || kind === "const" ? kind : null;
}

/**
 * The imports of one `use` statement, one per clause (`use A\{B, C as D}` is
 * two), and the aliases they add to `names`. A function is `function <name>`,
 * a constant `const <name>`, a class its name.
 */
function usesOf(decl: Node, names: Names): ImportFact[] {
  const out: ImportFact[] = [];
  const group = decl.childForFieldName("body");
  const prefix = group ? (decl.namedChildren.find((c) => c.type === "namespace_name")?.text.replace(/\s+/g, "") ?? "") : "";
  const clauses = (group ?? decl).namedChildren.filter((c) => c.type === "namespace_use_clause");
  const at = located(decl);
  for (const clause of clauses) {
    const aliasNode = clause.childForFieldName("alias");
    const nameNode = clause.namedChildren.find((c) => (c.type === "name" || c.type === "qualified_name") && c.id !== aliasNode?.id);
    if (!nameNode) continue;
    const written = nameNode.text.replace(/\s+/g, "").replace(/^\\/, "");
    const qualified = prefix ? `${prefix}\\${written}` : written;
    const kind = useKind(clause) ?? useKind(decl) ?? "class";
    const alias = aliasNode?.text ?? lastSegment(qualified);
    const table = kind === "function" ? names.functions : kind === "const" ? names.consts : names.classes;
    table.set(kind === "const" ? alias : asciiLowerCase(alias), { alias, qualified });
    out.push({ source: kind === "class" ? qualified : `${kind} ${qualified}`, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: firstLine(at.text), bindings: [{ kind: "named", local: alias, imported: lastSegment(qualified) }], reexport: false });
  }
  return out;
}

/**
 * A class name as the code writes it → the binding it goes through (`local`)
 * and the qualified name PHP gives it. `explicit`: a `use` binds exactly this
 * name. A name through an alias keeps the alias's spelling, so a call written
 * in another case still finds the binding. Null `qualified` for `self`,
 * `static` and `parent`.
 */
function canonicalClass(written: string, names: Names): { local: string; qualified: string | null; explicit: boolean } {
  if (written.startsWith("\\")) return { local: written, qualified: written.slice(1), explicit: false };
  const lower = asciiLowerCase(written);
  if (SPECIAL_CLASSES.has(lower)) return { local: written, qualified: null, explicit: true };
  if (lower.startsWith("namespace\\")) return { local: written, qualified: qualify(names.ns, written.slice("namespace\\".length)), explicit: false };
  const [head = "", ...rest] = written.split("\\");
  const alias = names.classes.get(asciiLowerCase(head));
  if (alias) return rest.length === 0 ? { local: alias.alias, qualified: alias.qualified, explicit: true } : { local: [alias.alias, ...rest].join("\\"), qualified: [alias.qualified, ...rest].join("\\"), explicit: false };
  return { local: written, qualified: qualify(names.ns, written), explicit: false };
}

/**
 * A called function name → its binding and the specifier PHP resolves:
 * `function A\f`, or for an unqualified name in a namespace
 * `function A\f ?? f` (the global function when the namespace has none).
 */
function canonicalFunction(written: string, names: Names): { local: string; spec: string; explicit: boolean } {
  if (written.startsWith("\\")) return { local: written, spec: `function ${written.slice(1)}`, explicit: false };
  if (written.includes("\\")) {
    const name = canonicalClass(written, names);
    return { local: name.local, spec: `function ${name.qualified ?? written}`, explicit: false };
  }
  const alias = names.functions.get(asciiLowerCase(written));
  if (alias) return { local: alias.alias, spec: `function ${alias.qualified}`, explicit: true };
  return { local: written, spec: names.ns === "" ? `function ${written}` : `function ${names.ns}\\${written} ?? ${written}`, explicit: false };
}

function exportRow(facts: FileFacts, name: string, kind: ExportRow["kind"]): void {
  if (facts.exports.has(name)) return;
  facts.exports.add(name);
  facts.exportRows.push({ name, kind, local: null });
}

/** A class name in a name or qualified-name node, as written. */
function classNameOf(node: Node | null): string | null {
  return node && (node.type === "name" || node.type === "qualified_name") ? node.text.replace(/\s+/g, "") : null;
}

/** A top-level class, interface, trait, enum or function. */
function declarationOf(node: Node, names: Names, collector: Collector): DeclFact | null {
  const name = node.childForFieldName("name")?.text;
  if (!name) return null;
  if (node.type === "function_definition") return fnDecl(node, name, names, null, collector, name);
  const at = located(node);
  const types: TypeRefFact[] = [];
  let base: string | undefined;
  for (const child of node.namedChildren) {
    if (child.type === "base_clause") {
      // A class has one parent; `extends` of an interface lists several, and those are types.
      for (const parent of child.namedChildren) {
        const written = classNameOf(parent);
        if (!written) continue;
        const local = collector.klass(written, parent, names);
        if (node.type === "class_declaration" && base === undefined) base = local;
        else types.push(typeRef(local, parent));
      }
    } else if (child.type === "class_interface_clause") {
      for (const iface of child.namedChildren) {
        const written = classNameOf(iface);
        if (written) types.push(typeRef(collector.klass(written, iface, names), iface));
      }
    }
  }
  const doc = docOf(node, collector.header);
  if (node.type === "interface_declaration") {
    // An interface is a type: a call through a value typed with it stays a hole, as in TypeScript.
    return { kind: "type", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature: null, exported: true, calls: [], types, members: [], fingerprint: fingerprint(node), ...(doc !== undefined ? { doc } : {}) };
  }
  const body = node.childForFieldName("body");
  const items = body?.namedChildren ?? [];
  const methods = items.filter((item) => item.type === "method_declaration");
  const statics = new Set(methods.filter((m) => m.namedChildren.some((c) => c.type === "static_modifier")).map((m) => asciiLowerCase(m.childForFieldName("name")?.text ?? "")));
  const fields = new Map<string, FieldType>();
  /** Untyped properties: their declarations and their `@var`, for the constructor to type. */
  const untyped = new Map<string, { node: Node; doc: DocType | null }>();
  /** Properties the constructor settled: typed, or a hole for conflicting classes. */
  const decided = new Set<string>();
  const traits: string[] = [];
  for (const item of items) {
    if (item.type === "property_declaration") {
      const type = singleClass(item.childForFieldName("type"));
      for (const element of item.namedChildren.filter((c) => c.type === "property_element")) {
        const prop = element.childForFieldName("name")?.text.replace(/^\$/, "");
        if (!prop) continue;
        if (type) fields.set(prop, { cls: collector.klass(type, item, names) });
        else if (!item.childForFieldName("type")) untyped.set(prop, { node: item, doc: docTag(item, collector.header, /@var\s+(\S+)/) });
      }
      for (const named of namedTypes(item.childForFieldName("type"))) types.push(typeRef(collector.klass(named.text, named.node, names), named.node));
    } else if (item.type === "use_declaration") {
      // `use SomeTrait;` in a class: its methods become the class's own (`$this->log()`); the trait is a dependency.
      for (const traitNode of item.namedChildren) {
        const written = classNameOf(traitNode);
        if (!written) continue;
        const local = collector.klass(written, traitNode, names);
        types.push(typeRef(local, traitNode));
        traits.push(local);
      }
    }
  }
  for (const method of methods) {
    if (asciiLowerCase(method.childForFieldName("name")?.text ?? "") !== "__construct") continue;
    for (const param of method.childForFieldName("parameters")?.namedChildren ?? []) {
      if (param.type !== "property_promotion_parameter") continue;
      const typeNode = param.childForFieldName("type");
      const type = singleClass(typeNode);
      const prop = param.childForFieldName("name")?.text.replace(/^\$/, "");
      if (prop && type && typeNode) fields.set(prop, { cls: collector.klass(type, typeNode, names) });
    }
    for (const prop of constructorFields(method, name, names, collector, fields, untyped)) decided.add(prop);
  }
  // A property the constructor neither types nor contradicts: its `@var`.
  for (const [prop, { doc }] of untyped) {
    if (fields.has(prop) || decided.has(prop) || !doc) continue;
    const source = docSource(doc, names, collector);
    if (source) fields.set(prop, { cls: source.local, docblock: source.docblock! });
  }
  const ctx: ClassContext = { name, statics, fields };
  const members: DeclFact[] = [];
  for (const method of methods) {
    const written = method.childForFieldName("name")?.text;
    if (!written) continue;
    // PHP names the constructor in any case; its ID is `<class>.__construct`, the name `new X()` runs.
    const member = asciiLowerCase(written) === "__construct" ? "__construct" : written;
    const decl = fnDecl(method, member, names, ctx, collector, `${name}.${member}`);
    const visibility = asciiLowerCase(method.namedChildren.find((c) => c.type === "visibility_modifier")?.text ?? "");
    decl.exported = visibility !== "private" && visibility !== "protected";
    if (statics.has(asciiLowerCase(member))) decl.static = true;
    members.push(decl);
  }
  return { kind: "class", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature: null, exported: true, calls: [], types, members, fingerprint: fingerprint(node), ...(base !== undefined ? { base } : {}), ...(traits.length > 0 ? { traits } : {}), ...(doc !== undefined ? { doc } : {}) };
}

/**
 * The classes the constructor gives the class's untyped properties. `$this->x = $x`
 * with a parameter `X $x` is a fact of the syntax; with an untyped `$x` and
 * `@param X $x`, or no assignment and `@var X` above the property, the class
 * comes from a docblock PHP does not check. Only a parameter assigned as it is
 * counts: an expression (`$x ?: new X()`) has no class the syntax names.
 * Assignments of two classes, or a `@var` the constructor contradicts, type
 * nothing: a hole `ambiguous property type` of the class. Returns the
 * properties settled either way; the rest may still have a `@var`.
 */
function constructorFields(method: Node, className: string, names: Names, collector: Collector, fields: Map<string, FieldType>, untyped: ReadonlyMap<string, { node: Node; doc: DocType | null }>): Set<string> {
  const decided = new Set<string>();
  const paramDocs = new Map<string, DocType>();
  for (const doc of docTags(method, collector.header, /@param\s+(\S+)\s+(?:\.\.\.)?&?\$([A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)/)) if (doc.name && !paramDocs.has(doc.name)) paramDocs.set(doc.name, doc);
  /** Parameter → the class it names, or null for one of no single class. */
  const params = new Map<string, TypeSource | null>();
  for (const param of method.childForFieldName("parameters")?.namedChildren ?? []) {
    const variable = param.childForFieldName("name")?.text.replace(/^\$/, "");
    if (!variable) continue;
    const typeNode = param.childForFieldName("type");
    if (typeNode) {
      const written = singleClass(typeNode);
      params.set(variable, written ? { written, key: classKey(written, names), local: collector.klass(written, typeNode, names) } : null);
      continue;
    }
    const doc = paramDocs.get(variable);
    params.set(variable, doc ? docSource(doc, names, collector) : null);
  }
  /** Property → what each constructor assignment gives it, in order; null for a value of no known class. */
  const assigned = new Map<string, { node: Node; sources: (TypeSource | null)[] }>();
  const body = method.childForFieldName("body");
  if (body) {
    walkScope(body, (n) => {
      if (n.type !== "assignment_expression") return;
      const left = n.childForFieldName("left");
      if (left?.type !== "member_access_expression" || left.childForFieldName("object")?.text !== "$this") return;
      const prop = left.childForFieldName("name");
      if (prop?.type !== "name" || fields.has(prop.text)) return;
      const right = n.childForFieldName("right");
      const value = right ? unparenthesized(right) : null;
      const source = value?.type === "variable_name" ? (params.get(value.text.replace(/^\$/, "")) ?? null) : null;
      const entry = assigned.get(prop.text) ?? { node: n, sources: [] };
      entry.sources.push(source);
      assigned.set(prop.text, entry);
    });
  }
  for (const [prop, { node, sources }] of assigned) {
    const known = sources.filter((source): source is TypeSource => source !== null);
    if (known.length === 0) continue;
    decided.add(prop);
    const declared = untyped.get(prop);
    const where = declared?.node ?? node;
    const distinct = [...new Map(known.map((source) => [source.key, source.written])).values()];
    if (distinct.length > 1 || known.length < sources.length) {
      const listed = [...distinct, ...(known.length < sources.length ? ["a value of no known class"] : [])].map((item, i) => (i < distinct.length ? `\`${item}\`` : item));
      collector.hole(where, `ambiguous property type \`$${prop}\`: assigned ${listed.join(" and ")} in the constructor`, className);
      continue;
    }
    const first = known[0]!;
    const doc = declared?.doc ? docSource(declared.doc, names, collector) : null;
    if (doc && doc.key !== first.key) {
      collector.hole(where, `ambiguous property type \`$${prop}\`: \`@var ${doc.written}\`, assigned \`${first.written}\` in the constructor`, className);
      continue;
    }
    // One class from every assignment: a fact of the syntax when any parameter is typed.
    const syntactic = known.find((source) => !source.docblock);
    fields.set(prop, syntactic ? { cls: syntactic.local } : { cls: first.local, docblock: first.docblock! });
  }
  return decided;
}

/** The qualified name of a class as written, in ASCII lower case: how two spellings compare. */
function classKey(written: string, names: Names): string {
  return asciiLowerCase(canonicalClass(written, names).qualified ?? written);
}

/** The class a docblock type names, registered as a docblock import; null when it names no single class. */
function docSource(doc: DocType, names: Names, collector: Collector): TypeSource | null {
  const written = singleDocClass(doc.written);
  if (!written) return null;
  return { written, key: classKey(written, names), local: collector.klassAt(written, doc.at, names, true), docblock: { line: doc.at.line, col: doc.at.col } };
}

/**
 * The one class a docblock type names: `Foo`, `?Foo`, `Foo|null`, `\App\Foo`.
 * Null for a union of classes, an array (`Foo[]`, `array<Foo>`), a built-in
 * type or anything else PHPDoc writes.
 */
function singleDocClass(written: string): string | null {
  const parts = written
    .replace(/^\?/, "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "" && asciiLowerCase(part) !== "null");
  if (parts.length !== 1) return null;
  const name = parts[0]!;
  if (!/^\\?[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*(\\[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)*$/.test(name)) return null;
  return BUILTIN_TYPES.has(asciiLowerCase(name)) ? null : name;
}

/** The one class a type names: `Store`, `?Store`; null for a union, an intersection, a built-in type or none. */
function singleClass(type: Node | null): string | null {
  if (!type) return null;
  const inner = type.type === "optional_type" ? type.namedChildren[0] : type;
  if (inner?.type !== "named_type") return null;
  const written = classNameOf(inner.namedChildren[0] ?? null);
  return written && !BUILTIN_TYPES.has(asciiLowerCase(written)) ? written : null;
}

/** Every class a type names, in unions, intersections and nullable types. */
function namedTypes(type: Node | null): { text: string; node: Node }[] {
  const out: { text: string; node: Node }[] = [];
  const walk = (node: Node): void => {
    if (node.type === "named_type") {
      const nameNode = node.namedChildren[0] ?? null;
      const written = classNameOf(nameNode);
      if (written && nameNode && !BUILTIN_TYPES.has(asciiLowerCase(written))) out.push({ text: written, node: nameNode });
      return;
    }
    for (const child of node.namedChildren) walk(child);
  };
  if (type) walk(type);
  return out;
}

function typeRef(name: string, node: Node): TypeRefFact {
  const at = located(node);
  return { name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: firstLine(at.text) };
}

/** What a call in a function sees: the namespace's names, the class, the function's variables and their classes. */
interface Scope {
  names: Names;
  ctx: ClassContext | null;
  /** Variables of the function, without `$`: parameters, then any other assigned name. */
  bound: ReadonlyMap<string, "parameter" | "local">;
  /** Variables whose class the syntax names: a parameter typed with one class, a variable whose only assignment is `new X(…)`. */
  classes: ReadonlyMap<string, string>;
  /** The declaration as a dotted path in the file (`Order.place`), for a hole of its own behaviour. */
  symbol: string | null;
}

/** A function or a method. `symbol` is its dotted path in the file. */
function fnDecl(node: Node, name: string, names: Names, ctx: ClassContext | null, collector: Collector, symbol: string): DeclFact {
  const at = located(node);
  const params = node.childForFieldName("parameters");
  const returns = node.childForFieldName("return_type");
  const signature = params ? `${params.text.replace(/\s+/g, " ")}${returns ? ` → ${returns.text.replace(/\s+/g, " ")}` : ""}` : null;
  const types: TypeRefFact[] = [];
  const bound = new Map<string, "parameter" | "local">();
  const evidence = new Map<string, string | null>();
  for (const param of params?.namedChildren ?? []) {
    const variable = param.childForFieldName("name")?.text.replace(/^\$/, "");
    if (!variable) continue;
    bound.set(variable, "parameter");
    const type = param.childForFieldName("type");
    const single = singleClass(type);
    evidence.set(variable, single ? collector.klass(single, type!, names) : null);
    for (const named of namedTypes(type)) types.push(typeRef(collector.klass(named.text, named.node, names), named.node));
  }
  for (const named of namedTypes(returns)) types.push(typeRef(collector.klass(named.text, named.node, names), named.node));
  const body = node.childForFieldName("body");
  /** A variable bound some other way than `$x = new X(…)`: its class is not known. */
  const bindAll = (target: Node | null): void => {
    if (!target) return;
    const walk = (n: Node): void => {
      if (n.type === "variable_name") {
        const variable = n.text.replace(/^\$/, "");
        if (!bound.has(variable)) bound.set(variable, "local");
        evidence.set(variable, null);
        return;
      }
      if (!CLOSURE_NODES.has(n.type)) for (const child of n.namedChildren) walk(child);
    };
    walk(target);
  };
  if (body) {
    walkScope(body, (n) => {
      if (n.type === "assignment_expression" || n.type === "augmented_assignment_expression" || n.type === "reference_assignment_expression") {
        const left = n.childForFieldName("left");
        if (left?.type === "list_literal" || left?.type === "array_creation_expression") return bindAll(left);
        if (left?.type !== "variable_name") return;
        const variable = left.text.replace(/^\$/, "");
        if (!bound.has(variable)) bound.set(variable, "local");
        const right = n.childForFieldName("right");
        const created = n.type === "assignment_expression" && right?.type === "object_creation_expression" ? classNameOf(right.namedChildren[0] ?? null) : null;
        const cls = created && !SPECIAL_CLASSES.has(asciiLowerCase(created)) ? collector.klass(created, right!, names) : null;
        evidence.set(variable, evidence.has(variable) ? null : cls);
      } else if (n.type === "foreach_statement") {
        // `foreach ($items as $k => $v)`: what follows `as` is bound; the iterated expression is only read.
        bindAll(n.namedChildren.filter((c) => c.id !== n.childForFieldName("body")?.id)[1] ?? null);
      } else if (n.type === "global_declaration" || n.type === "function_static_declaration") {
        bindAll(n);
      } else if (n.type === "catch_clause") {
        const variable = n.childForFieldName("name")?.text.replace(/^\$/, "");
        if (variable && !bound.has(variable)) bound.set(variable, "local");
        if (variable) evidence.set(variable, null);
        for (const named of namedTypes(n.childForFieldName("type"))) types.push(typeRef(collector.klass(named.text, named.node, names), named.node));
      } else if (n.type === "binary_expression" && n.childForFieldName("operator")?.text === "instanceof") {
        const right = n.childForFieldName("right");
        const written = classNameOf(right);
        if (written && right && !SPECIAL_CLASSES.has(asciiLowerCase(written))) types.push(typeRef(collector.klass(written, right, names), right));
      }
    });
  }
  const classes = new Map<string, string>();
  for (const [variable, cls] of evidence) if (cls) classes.set(variable, cls);
  const scope: Scope = { names, ctx, bound, classes, symbol };
  const calls = body ? callsIn(body, scope, collector, false) : [];
  const doc = docOf(node, collector.header);
  return { kind: "fn", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported: true, calls, types, members: [], fingerprint: fingerprint(node), ...(doc !== undefined ? { doc } : {}) };
}

/** Every node of a function body that runs in its own scope: not into a nested named function or class. */
function walkScope(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const child of node.namedChildren) {
    if (child.type === "function_definition" || child.type === "class_declaration") continue;
    walkScope(child, visit);
  }
}

/**
 * The calls under `node`: in a function body, or in code outside declarations.
 * A call inside a closure, an arrow function or an anonymous class has
 * `closure`: it runs when that value is called.
 */
function callsIn(node: Node, scope: Scope, collector: Collector, closure: boolean): CallFact[] {
  const out: CallFact[] = [];
  const walk = (n: Node, inner: boolean): void => {
    if (DECLARATION_NODES.has(n.type) && n.id !== node.id) return;
    if (CALL_NODES.has(n.type)) {
      const fact = callOf(n, scope, collector);
      if (fact) {
        const at = located(n);
        out.push({ ...fact, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, ...(inner ? { closure: true as const } : {}) });
      }
    } else if (n.type === "class_constant_access_expression") {
      // `X::class` reads the class as a value: whoever holds it may construct it.
      const [scopeNode, member] = n.namedChildren;
      const written = classNameOf(scopeNode ?? null);
      if (asciiLowerCase(member?.text ?? "") === "class" && written && !SPECIAL_CLASSES.has(asciiLowerCase(written))) collector.value(collector.klass(written, scopeNode!, scope.names), n, false);
      else if (written && !SPECIAL_CLASSES.has(asciiLowerCase(written))) collector.klass(written, scopeNode!, scope.names);
    } else if (n.type === "scoped_property_access_expression") {
      const written = classNameOf(n.childForFieldName("scope"));
      if (written && !SPECIAL_CLASSES.has(asciiLowerCase(written))) collector.klass(written, n.childForFieldName("scope")!, scope.names);
    } else if (n.type === "array_creation_expression") arrayCallable(n, scope, collector);
    for (const child of n.namedChildren) walk(child, inner || CLOSURE_NODES.has(n.type));
  };
  walk(node, closure);
  return out;
}

/** `[$this, 'save']`, `[Order::class, 'place']`, `['Order', 'place']`: a method read as a callable value. */
function arrayCallable(n: Node, scope: Scope, collector: Collector): void {
  const elements = n.namedChildren.filter((c) => c.type === "array_element_initializer");
  if (elements.length !== 2) return;
  const [target, method] = elements.map((e) => e.namedChildren[0] ?? null);
  const name = method?.type === "string" || method?.type === "encapsed_string" ? stringValue(method) : null;
  if (!name || !/^[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*$/.test(name)) return;
  const holder = target?.type === "variable_name" || target?.type === "class_constant_access_expression" || target?.type === "string" || target?.type === "encapsed_string";
  if (holder) collector.value(name, n, true);
}

/** The text of a string literal without interpolation; null for anything else. */
function stringValue(node: Node): string | null {
  if (node.type !== "string" && node.type !== "encapsed_string") return null;
  if (node.namedChildren.some((c) => c.type !== "string_content" && c.type !== "string_value" && c.type !== "escape_sequence")) return null;
  return node.namedChildren.map((c) => c.text).join("");
}

/** The callable `f(...)`, `$x->m(...)`, `X::m(...)` makes from its callee: a value, not a call. */
function firstClassCallable(n: Node): boolean {
  const args = n.childForFieldName("arguments") ?? n.namedChildren.find((c) => c.type === "arguments");
  return args?.namedChildren.length === 1 && args.namedChildren[0]!.type === "variadic_placeholder";
}

/**
 * One call: `f()` → `f`, `A\f()` → `A\f`; `$this->m()` → `this.m`;
 * `$this->store->m()` → `this.store.m` with the property's class;
 * `$x->m()` → `x.m`, bound, with the variable's class when the syntax names
 * it; `X::m()` → `X.m`; `self::m()` / `static::m()` → `this.m`, or `X.m` for a
 * static method; `parent::m()` → `super.m`; `new X()` → `X`;
 * `(new X())->m()` → `(new X()).m` and PHP 8.4's `new X()->m()` → `new X().m`,
 * with the class `X`. A name chosen at run time is a call through a value or
 * an opaque expression. Null for a first-class callable (`f(...)`), which is a
 * value.
 */
function callOf(n: Node, scope: Scope, collector: Collector): Pick<CallFact, "callee" | "bound" | "receiver" | "opaque" | "docblock"> | null {
  const opaque = (): Pick<CallFact, "callee" | "opaque"> => ({ callee: n.text.replace(/\s+/g, " ").slice(0, MAX_CALLEE), opaque: true });
  if (n.type === "object_creation_expression") {
    const target = n.namedChildren[0];
    if (!target || target.type === "anonymous_class") return null;
    const written = classNameOf(target);
    if (written) {
      const lower = asciiLowerCase(written);
      if (lower === "self" || lower === "static") return scope.ctx ? { callee: scope.ctx.name } : opaque();
      if (lower === "parent") return scope.ctx ? { callee: "super" } : opaque();
      return { callee: collector.klass(written, target, scope.names) };
    }
    if (target.type === "variable_name") return variableCall(target.text.replace(/^\$/, ""), scope);
    return opaque();
  }
  if (firstClassCallable(n)) {
    callableValue(n, scope, collector);
    return null;
  }
  if (n.type === "function_call_expression") {
    const fn = n.childForFieldName("function");
    if (fn?.type === "name" || fn?.type === "qualified_name") {
      const written = fn.text.replace(/\s+/g, "");
      const lower = asciiLowerCase(lastSegment(written));
      if (CONSTRUCTS.has(lower) && !written.includes("\\")) return null;
      if (CALLABLE_CALLS.has(lower)) collector.hole(n, `\`${lastSegment(written)}\` calls a callable chosen at run time`, scope.symbol);
      if (lower === "eval") collector.hole(n, "`eval` runs code keylang cannot read", scope.symbol);
      return { callee: collector.fn(written, fn, scope.names) };
    }
    if (fn?.type === "variable_name") return variableCall(fn.text.replace(/^\$/, ""), scope);
    return opaque();
  }
  const name = n.childForFieldName("name");
  if (name?.type !== "name") return opaque();
  const member = name.text;
  if (n.type === "scoped_call_expression") {
    const scopeNode = n.childForFieldName("scope");
    if (scopeNode?.type === "relative_scope" || (scopeNode && SPECIAL_CLASSES.has(asciiLowerCase(scopeNode.text)))) {
      const relative = asciiLowerCase(scopeNode.text);
      if (!scope.ctx) return opaque();
      if (relative === "parent") return { callee: `super.${member}` };
      return scope.ctx.statics.has(asciiLowerCase(member)) ? { callee: `${scope.ctx.name}.${member}` } : { callee: `this.${member}` };
    }
    const written = classNameOf(scopeNode);
    if (written) return { callee: `${collector.klass(written, scopeNode!, scope.names)}.${member}` };
    if (scopeNode?.type === "variable_name") return variableCall(`${scopeNode.text.replace(/^\$/, "")}.${member}`, scope);
    return opaque();
  }
  // `->` and `?->`.
  const object = n.childForFieldName("object");
  if (object?.type === "variable_name") {
    const variable = object.text.replace(/^\$/, "");
    if (variable === "this") return scope.ctx ? { callee: `this.${member}` } : { callee: `this.${member}`, bound: "local" };
    const fact = variableCall(`${variable}.${member}`, scope);
    const receiver = scope.classes.get(variable);
    return receiver ? { ...fact, receiver } : fact;
  }
  if ((object?.type === "member_access_expression" || object?.type === "nullsafe_member_access_expression") && object.childForFieldName("object")?.text === "$this") {
    const prop = object.childForFieldName("name");
    if (prop?.type === "name") {
      const field = scope.ctx?.fields.get(prop.text);
      // A property of unknown class: a call through a value, as `self.queue.put()` in Python.
      if (!field) return { callee: `this.${prop.text}.${member}`, bound: "local" };
      return { callee: `this.${prop.text}.${member}`, receiver: field.cls, ...(field.docblock ? { docblock: field.docblock } : {}) };
    }
  }
  // `(new Order())->total()` and `new Order()->total()`: a method of the class `new` names. The
  // callee ends in `.total`, the member the graph looks up in that class. What `total()` returns
  // has no class the syntax names, so `->total()->tax()` stays a call through an expression.
  const creation = object ? unparenthesized(object) : null;
  const created = creation?.type === "object_creation_expression" ? classNameOf(creation.namedChildren[0] ?? null) : null;
  if (object && creation && created && !SPECIAL_CLASSES.has(asciiLowerCase(created))) {
    const callee = `${object.text.replace(/\s+/g, " ")}.${member}`;
    if (callee.length <= MAX_CALLEE) return { callee, receiver: collector.klass(created, creation, scope.names) };
  }
  return opaque();
}

/** The expression inside any parentheses around it: `((new X()))` → `new X()`. */
function unparenthesized(node: Node): Node {
  let inner = node;
  while (inner.type === "parenthesized_expression" && inner.namedChildren[0]) inner = inner.namedChildren[0];
  return inner;
}

/** A call through a variable: `$f()`, `$x->m()`, `$class::m()`. */
function variableCall(callee: string, scope: Scope): Pick<CallFact, "callee" | "bound"> {
  const head = callee.split(".")[0]!;
  return { callee, bound: scope.bound.get(head) ?? "local" };
}

/** `f(...)`, `$this->m(...)`, `X::m(...)`: the function or method read as a value. */
function callableValue(n: Node, scope: Scope, collector: Collector): void {
  if (n.type === "function_call_expression") {
    const fn = n.childForFieldName("function");
    if (fn?.type === "name" || fn?.type === "qualified_name") collector.value(collector.fn(fn.text.replace(/\s+/g, ""), fn, scope.names), n, false);
    return;
  }
  const name = n.childForFieldName("name");
  if (name?.type === "name") collector.value(name.text, n, true);
}

/**
 * `require`/`include` of a path the code spells out: a string, or `__DIR__`
 * (`dirname(__DIR__)`, `dirname(__FILE__)`) joined with one. The specifier is
 * `include <path>`, relative to the repository root; a path computed at run
 * time is a hole.
 */
function includesIn(root: Node, path: string, collector: Collector): ImportFact[] {
  const out: ImportFact[] = [];
  const walk = (n: Node): void => {
    if (INCLUDE_NODES.has(n.type)) {
      const target = includedPath(n.namedChildren[0] ?? null, path);
      const at = located(n);
      if (target === null) collector.hole(n, "an include of a path computed at run time", null);
      else out.push({ source: `include ${target}`, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: firstLine(at.text), bindings: [], reexport: false });
    }
    for (const child of n.namedChildren) walk(child);
  };
  walk(root);
  return out;
}

/**
 * The repository-relative path an include expression names: string literals,
 * `__DIR__`, `dirname(__DIR__[, n])` and `dirname(__FILE__[, n])` joined with
 * `.`; a relative literal is taken from the file's directory. Null when part of
 * it is computed at run time.
 */
function includedPath(expr: Node | null, file: string): string | null {
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const up = (path: string, levels: number): string => normalize([path, ...Array<string>(levels).fill("..")].filter((part) => part !== "").join("/"));
  const evaluate = (node: Node | null): { text: string; anchored: boolean } | null => {
    if (!node) return null;
    if (node.type === "parenthesized_expression") return evaluate(node.namedChildren[0] ?? null);
    const literal = stringValue(node);
    if (literal !== null) return { text: literal, anchored: false };
    if (node.type === "name" && node.text === "__DIR__") return { text: dir, anchored: true };
    if (node.type === "function_call_expression" && asciiLowerCase(node.childForFieldName("function")?.text ?? "") === "dirname") {
      const args = (node.childForFieldName("arguments")?.namedChildren ?? []).map((a) => a.namedChildren[0] ?? null);
      const levels = args[1] ? Number(args[1].text) : 1;
      if (!Number.isInteger(levels) || levels < 1) return null;
      // `dirname(__FILE__)` is the file's own directory: one level above the file.
      if (args[0]?.type === "name" && args[0].text === "__FILE__") return { text: up(dir, levels - 1), anchored: true };
      const inner = evaluate(args[0] ?? null);
      return inner?.anchored ? { text: up(inner.text, levels), anchored: true } : null;
    }
    if (node.type === "binary_expression" && node.childForFieldName("operator")?.text === ".") {
      const left = evaluate(node.childForFieldName("left"));
      const right = evaluate(node.childForFieldName("right"));
      return left && right && !right.anchored ? { text: `${left.text}${right.text}`, anchored: left.anchored } : null;
    }
    return null;
  };
  const value = evaluate(expr);
  if (value === null) return null;
  if (value.anchored) return normalize(value.text);
  // An absolute path names no file of the repository: the resolver says so.
  return value.text.startsWith("/") ? value.text : normalize(dir === "" ? value.text : `${dir}/${value.text}`);
}

/** `a/./b/../c` → `a/c`; a path above the root keeps its leading `..`. */
function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out.at(-1) !== "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * The PHPDoc of a declaration: the `/** … *\/` right above it. Line comments
 * may stand between them, other code may not. Its description is the text
 * before the first tag (`@param` and the rest).
 */
function docOf(node: Node, header: number | null): string | undefined {
  const at = docComment(node, header);
  if (!at) return undefined;
  const text = jsdocDescription(blockCommentBody(at.text)).trim();
  return isLicense(text) ? undefined : (nonEmpty(text) ?? undefined);
}

/** The PHPDoc comment node right above a declaration, as `docOf` finds it; null without one. */
function docComment(node: Node, header: number | null): Node | null {
  let at = node.previousNamedSibling;
  while (at?.type === "comment" && !at.text.startsWith("/*")) at = at.previousNamedSibling;
  return at?.type === "comment" && at.text.startsWith("/**") && at.id !== header ? at : null;
}

/**
 * The tags of a declaration's PHPDoc that `tag` matches, one per line, with
 * the type (first group) and the variable name (second group, if any) and the
 * position of the `@`. The fragment is the tag's line.
 */
function docTags(node: Node, header: number | null, tag: RegExp): (DocType & { name?: string })[] {
  const comment = docComment(node, header);
  if (!comment) return [];
  const out: (DocType & { name?: string })[] = [];
  comment.text.split("\n").forEach((text, i) => {
    const match = tag.exec(text);
    if (!match?.[1]) return;
    const line = comment.startPosition.row + 1 + i;
    const col = (i === 0 ? comment.startPosition.column : 0) + match.index + match[0].indexOf("@") + 1;
    out.push({ written: match[1], at: { line, col, endLine: line, endCol: col + match[0].length, text: text.trim() }, ...(match[2] ? { name: match[2] } : {}) });
  });
  return out;
}

/** The first tag of a declaration's PHPDoc that `tag` matches; null without one. */
function docTag(node: Node, header: number | null, tag: RegExp): DocType | null {
  return docTags(node, header, tag)[0] ?? null;
}

/**
 * The file's PHPDoc and its comment: the first `/** … *\/` after `<?php` (and
 * `declare`), unless it stands right above a declaration, which it documents
 * instead. A license documents nothing.
 */
function fileDoc(root: Node): { doc: string; id: number } | null {
  const first = root.namedChildren.find((c) => c.type !== "php_tag" && c.type !== "declare_statement" && c.type !== "text");
  if (first?.type !== "comment" || !first.text.startsWith("/**")) return null;
  const next = first.nextNamedSibling;
  if (next && DECLARATION_NODES.has(next.type) && next.startPosition.row <= first.endPosition.row + 1) return null;
  const text = jsdocDescription(blockCommentBody(first.text)).trim();
  const doc = isLicense(text) ? null : nonEmpty(text);
  return doc === null ? null : { doc, id: first.id };
}

function unsupported(node: Node, reason: string): UnsupportedFact {
  const at = located(node);
  return { line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: firstLine(at.text), reason };
}
