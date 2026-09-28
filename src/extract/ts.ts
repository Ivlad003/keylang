// TypeScript / JavaScript facts: imports, declarations, exports, calls.
// A tree walk over the top level plus tree-sitter queries inside bodies.

import { builtinModules } from "node:module";
import type { CallFact, DeclFact, FileFacts, HookFact, ImportBinding, ImportFact, PassFact, TypeRefFact, UnsupportedFact, ValueRefFact } from "./facts.ts";
import { errorLine, fingerprint, grammarFor, located, query, startCol, withTree, type Grammar, type Language, type Node } from "./treesitter.ts";

const CALLS_QUERY = `
(call_expression function: (identifier) @callee)
(call_expression function: (member_expression) @member)
(new_expression constructor: (identifier) @new)
`;

const REQUIRE_QUERY = `
(call_expression function: (identifier) @fn arguments: (arguments (string (string_fragment) @source)) (#eq? @fn "require"))
(call_expression function: (import) arguments: (arguments (string (string_fragment) @source)))
`;

export function extractTs(path: string, src: string): Promise<FileFacts> {
  const g = grammarFor(path);
  return withTree(g, src, (tree, language) => extractTree(path, tree.rootNode, language, g));
}

function extractTree(path: string, root: Node, language: Language, g: Grammar): FileFacts {
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "complete", parseError: null };
  const calls = query(language, g, "calls", CALLS_QUERY);
  const requires = query(language, g, "require", REQUIRE_QUERY);

  // Bodies whose calls belong to a declaration; every other call is module-level code.
  const covered = new Set<number>();
  const declCalls = (body: Node, cls: ClassScope | null = null, keep: (n: Node) => boolean = () => true): CallFact[] => {
    if (body.id !== root.id) covered.add(body.id);
    const out: CallFact[] = [];
    for (const c of calls.captures(body)) {
      const n = c.node;
      if (!keep(n)) continue;
      let fact: CallFact | null;
      if (c.name === "member") {
        // `import.meta.resolve()` is the platform's; its module is an import edge.
        if (n.childForFieldName("object")?.type === "meta_property") continue;
        fact = calleeFact(n, body, cls);
        if (!fact) {
          // `a.b.c()` keeps only `a.b` prefixes we can resolve: object.property.
          const text = n.text.replace(/\s+/g, "");
          if (!n.childForFieldName("object") || !n.childForFieldName("property") || text.length >= 80) continue;
          fact = callFact(text, n);
        }
      } else {
        if (n.text === "require") continue;
        fact = boundCall(callFact(n.text, n), bindingOf(n, n.text, body));
        const hook = fact.bound ? localHook(n, n.text, body) : null;
        if (hook) fact.hook = hook;
      }
      const call = n.parent;
      const passes = call ? passesOf(call, body, cls) : [];
      if (passes.length > 0) fact.passes = passes;
      if (insideClosure(n, body)) fact.closure = true;
      out.push(fact);
    }
    return out;
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
            facts.imports.push(importAt(d, req, [{ kind: "module", local: name }], false));
            continue;
          }
          // `(() => …) as Handler` and `(function () {}) satisfies T` are the function itself.
          const fnValue = value ? unwrapValue(value) : null;
          if (fnValue && FUNCTION_VALUES.has(fnValue.type)) {
            facts.decls.push(decl("fn", name, d, signature(fnValue), exported, declCalls(fnValue), collectTypeRefs(fnValue), []));
          } else if (fnValue && fnValue.type === "class") {
            facts.decls.push(classDecl(name, fnValue, d, exported, declCalls, facts));
          }
          if (exported) {
            facts.exports.add(name);
            const kind = fnValue && FUNCTION_VALUES.has(fnValue.type) ? "fn" : fnValue?.type === "class" ? "class" : "value";
            facts.exportRows.push({ name, kind, local: name });
          }
        }
        // `const { a, b } = require("./x")`
        for (const d of node.namedChildren) {
          const nameNode = d.childForFieldName("name");
          const value = d.childForFieldName("value");
          if (d.type !== "variable_declarator" || !nameNode || nameNode.type !== "object_pattern" || !value) continue;
          // `const { a } = mod;` where `mod` is an imported module binding.
          const req = requireSource(value, requires) ?? (value.type === "identifier" ? moduleSource(facts, value.text) : null);
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
                facts.exportRows.push({ name: alias, kind: "alias", local: name });
              }
            }
          } else if (ns) {
            const alias = ns.namedChildren[0]?.text;
            if (alias) {
              bindings.push({ kind: "module", local: alias });
              facts.exports.add(alias);
              facts.exportRows.push({ name: alias, kind: "alias", local: alias });
            }
          } else if (star) {
            facts.reexportsAll.push(spec);
          }
          facts.imports.push(importAt(node, spec, bindings, true));
          if (star) facts.exportRows.push({ name: "*", kind: "reexport", local: null });
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
            }
          }
        } else {
          // `export { a, b as c }` and `export default x`
          const clause = node.namedChildren.find((c) => c.type === "export_clause");
          for (const s of clause?.namedChildren ?? []) {
            if (s.type !== "export_specifier") continue;
            const alias = s.childForFieldName("alias")?.text ?? s.childForFieldName("name")?.text;
            if (alias) {
              const local = s.childForFieldName("name")?.text ?? alias;
              facts.exports.add(alias);
              facts.exportRows.push({ name: alias, kind: "alias", local });
              localExports.add(local);
            }
          }
          const written = node.childForFieldName("value");
          const value = written ? unwrapValue(written) : null;
          if (value) {
            if (value.type === "identifier") {
              facts.exports.add(value.text);
              facts.exportRows.push({ name: "default", kind: "default", local: value.text });
              localExports.add(value.text);
            } else if (value.type === "arrow_function" || value.type === "function_expression" || value.type === "function") {
              facts.decls.push(decl("fn", "default", value, signature(value), true, declCalls(value), collectTypeRefs(value), []));
              facts.exports.add("default");
              facts.exportRows.push({ name: "default", kind: "default", local: "default" });
            } else if (value.type === "class") {
              facts.decls.push(classDecl(value.childForFieldName("name")?.text ?? "default", value, value, true, declCalls, facts));
              facts.exports.add("default");
              facts.exportRows.push({ name: "default", kind: "default", local: "default" });
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
    for (let at: Node | null = n; at; at = at.parent) if (covered.has(at.id)) return true;
    return false;
  };
  facts.moduleCalls = declCalls(root, null, (n) => !inDeclaration(n));
  collectDynamicImports(root, facts);
  collectUnsupported(root, facts);
  collectValueRefs(root, facts);
  const end = located(root);
  facts.endLine = end.endLine;
  facts.endCol = end.endCol;
  if (root.hasError) {
    facts.completeness = "opaque";
    facts.parseError = { line: errorLine(root), reason: "syntax error" };
  }
  return facts;
}

function decl(kind: DeclFact["kind"], name: string, node: Node, signature: string | null, exported: boolean, calls: CallFact[], types: TypeRefFact[], members: DeclFact[]): DeclFact {
  const at = located(node);
  return { kind, name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported, calls, types, members, fingerprint: fingerprint(node) };
}

function boundCall(call: CallFact, bound: "parameter" | "local" | null): CallFact {
  return bound ? { ...call, bound } : call;
}

function callFact(callee: string, node: Node): CallFact {
  const at = located(node);
  return { callee, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol };
}

function importAt(node: Node, source: string, bindings: ImportBinding[], reexport: boolean): ImportFact {
  const at = located(node);
  return { source, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, bindings, reexport };
}

const NESTED_DECL = new Set(["function_declaration", "generator_function_declaration", "function_signature", "class_declaration", "abstract_class_declaration", "method_definition", "method_signature", "interface_declaration", "type_alias_declaration", "enum_declaration", "internal_module"]);

/** Type names used by `node`, excluding its own declared name and nested declarations. */
function collectTypeRefs(node: Node): TypeRefFact[] {
  const skip = node.childForFieldName("name");
  const out: TypeRefFact[] = [];
  const walk = (current: Node, top: boolean): void => {
    if (!top && NESTED_DECL.has(current.type)) return;
    if (current.type === "nested_type_identifier") {
      const at = located(current);
      out.push({ name: at.text.replace(/\s+/g, ""), line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text });
      return;
    }
    if (current.type === "type_identifier" && current.id !== skip?.id) {
      const at = located(current);
      out.push({ name: at.text, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text });
    }
    for (const child of current.namedChildren) walk(child, false);
  };
  walk(node, true);
  return out;
}

/**
 * Members of a class. Methods and function-valued fields (`handler = () => …`)
 * are fns with their own calls. Instance field initializers run on
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
  const members: DeclFact[] = [];
  const instance: { node: Node; calls: CallFact[] }[] = [];
  const statics: { node: Node; calls: CallFact[] }[] = [];
  for (const m of items) {
    const isField = m.type === "public_field_definition" || m.type === "field_definition";
    if (m.type === "class_static_block") {
      statics.push({ node: m, calls: declCalls(m, scope) });
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
      const member = flag(decl("fn", mname, m, signature(m), !isPrivate, m.type === "method_definition" ? declCalls(m, scope) : [], collectTypeRefs(m), []));
      if (m.children.some((c) => c.type === "get" || c.type === "set")) member.accessor = true;
      members.push(member);
      continue;
    }
    const written = m.childForFieldName("value");
    const value = written ? unwrapValue(written) : null;
    if (!value) continue;
    if (FUNCTION_VALUES.has(value.type)) {
      members.push(flag(decl("fn", mname, m, signature(value), !isPrivate, declCalls(value, scope), collectTypeRefs(m), [])));
      continue;
    }
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
  const out = decl("class", name, at, heritage(cls), exported, [], heritageNode ? collectTypeRefs(heritageNode) : [], members);
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
function unwrapValue(node: Node): Node {
  let at = node;
  while ((at.type === "parenthesized_expression" || at.type === "as_expression" || at.type === "satisfies_expression" || at.type === "non_null_expression") && at.namedChildren[0]) at = at.namedChildren[0];
  return at;
}

const FUNCTION_VALUES = new Set(["arrow_function", "function_expression", "function", "generator_function"]);

/** A synthesized member over the initializers it runs, from the first to the last. */
function initializer(name: "constructor" | "static", items: { node: Node; calls: CallFact[] }[]): DeclFact {
  const first = located(items[0]!.node);
  const last = located(items[items.length - 1]!.node);
  const print = items.map((item) => fingerprint(item.node)).join(":");
  return { kind: "fn", name, line: first.line, col: first.col, endLine: last.endLine, endCol: last.endCol, signature: null, exported: true, calls: items.flatMap((item) => item.calls), types: [], members: [], fingerprint: print };
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
    if (c.type === "identifier") bindings.push({ kind: "module", local: c.text });
    else if (c.type === "namespace_import") {
      const id = c.namedChildren.find((x) => x.type === "identifier");
      if (id) bindings.push({ kind: "module", local: id.text });
    } else if (c.type === "named_imports") {
      for (const s of c.namedChildren) {
        if (s.type !== "import_specifier") continue;
        const name = s.childForFieldName("name")?.text;
        const alias = s.childForFieldName("alias")?.text ?? name;
        if (name && alias) bindings.push({ kind: "named", local: alias, imported: name });
      }
    }
  }
  return [importAt(node, spec, bindings, false)];
}

/** Literal `import("…")` / `require("…")` anywhere in the file. A non-literal specifier is coverage, not an edge. */
function collectDynamicImports(root: Node, facts: FileFacts): void {
  const walk = (node: Node): void => {
    if (node.type === "new_expression" || node.type === "call_expression") {
      const line = node.startPosition.row + 1;
      const specs = moduleUrlSpecs(node);
      if (specs === null) facts.unsupported.push(unsupported(node, "computed specifier"));
      for (const spec of specs ?? []) if (!facts.imports.some((i) => i.source === spec && i.line === line)) facts.imports.push(importAt(node, spec, [], false));
    }
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      const isImport = fn?.type === "import";
      const isRequire = fn?.type === "identifier" && fn.text === "require";
      // `import.meta.resolve("./w.ts")` names a module the way `import()` does.
      const isResolve = fn?.type === "member_expression" && fn.text.replace(/\s+/g, "") === "import.meta.resolve";
      if (isImport || isRequire || isResolve) {
        const arg = node.childForFieldName("arguments")?.namedChildren[0];
        const line = node.startPosition.row + 1;
        const col = node.startPosition.column + 1;
        if (arg?.type === "string") {
          const spec = stringValue(arg);
          if (spec && !facts.imports.some((i) => i.source === spec && i.line === line)) facts.imports.push(importAt(node, spec, [], false));
        } else if (arg) {
          facts.unsupported.push(unsupported(node, "computed specifier"));
        }
      }
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
}

/** Namespace, `eval`, `new Function`, and a call through `obj[expr]` are coverage, not edges. */
function collectUnsupported(root: Node, facts: FileFacts): void {
  const walk = (node: Node): void => {
    if (node.type === "internal_module") facts.unsupported.push(unsupported(node, "unsupported construct `namespace`"));
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier" && fn.text === "eval") facts.unsupported.push(unsupported(fn, "unsupported construct `eval`"));
      if (fn?.type === "subscript_expression") facts.unsupported.push(unsupported(fn, "unsupported construct `computed call`"));
    }
    if (node.type === "new_expression") {
      const ctor = node.childForFieldName("constructor");
      if (ctor?.type === "identifier" && ctor.text === "Function") facts.unsupported.push(unsupported(ctor, "unsupported construct `Function`"));
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
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
  return null;
}

/** `this` at `n` is the class instance: the nearest enclosing non-arrow function is a class member, or a field initializer or `static {}` holds it. */
function classThis(n: Node): boolean {
  for (let at = n.parent; at; at = at.parent) {
    if (at.type === "class_body") return true;
    if (FUNCTION_NODES.has(at.type) && at.type !== "arrow_function") return at.type === "method_definition" && at.parent?.type === "class_body";
  }
  return false;
}

/** Function values in the arguments: the argument itself or a property of an object literal. */
function passesOf(call: Node, stop: Node, cls: ClassScope | null): PassFact[] {
  if (call.type !== "call_expression" && call.type !== "new_expression") return [];
  const args = call.childForFieldName("arguments");
  if (args?.type !== "arguments") return [];
  const out: PassFact[] = [];
  args.namedChildren.filter((arg) => arg.type !== "comment").forEach((arg, index) => {
    const add = (node: Node, path: string): void => {
      const fact = calleeFact(node, stop, cls);
      // A local value of unknown class names nothing the graph can resolve.
      if (!fact || (fact.bound && !fact.receiver)) return;
      out.push({ arg: index, path, callee: fact.callee, ...(fact.bound ? { bound: fact.bound } : {}), ...(fact.receiver ? { receiver: fact.receiver } : {}) });
    };
    if (arg.type === "identifier" || arg.type === "member_expression") add(arg, "");
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

/** A call inside a function nested in the declaration `stop`. */
function insideClosure(n: Node, stop: Node): boolean {
  for (let at = n.parent; at && at.id !== stop.id; at = at.parent) if (FUNCTION_NODES.has(at.type)) return true;
  return false;
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
  for (let at: Node | null = from; at; at = at.parent) {
    if (FUNCTION_NODES.has(at.type)) {
      const single = at.childForFieldName("parameter");
      if (single?.type === "identifier" && single.text === name) return { kind: "parameter", node: single, fn: at, index: 0 };
      const params = at.childForFieldName("parameters")?.namedChildren.filter((p) => p.type !== "comment") ?? [];
      for (const [index, param] of params.entries()) if (patternNames(param).includes(name)) return { kind: "parameter", node: param, fn: at, index };
      if (at.id !== stop.id && at.type !== "arrow_function" && at.childForFieldName("name")?.text === name) return { kind: "other" };
    }
    if (BLOCK_NODES.has(at.type) || at.type === "program") {
      for (const stmt of at.namedChildren) {
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
  const walk = (node: Node): void => {
    const parent = node.parent;
    // A local binding of the name is not the module-level declaration.
    if ((node.type === "identifier" && parent && !bindsOrCalls(node, parent)) || node.type === "shorthand_property_identifier") {
      if (bindingOf(node, node.text, root) === null) note(node.text, node, false);
    }
    // Destructuring reads properties: `const { feed } = decoder` takes the method as a value.
    if (node.type === "shorthand_property_identifier_pattern" || (node.type === "property_identifier" && parent?.type === "pair_pattern" && parent.childForFieldName("key")?.id === node.id)) note(node.text, node, true);
    if ((node.type === "property_identifier" || node.type === "private_property_identifier") && parent?.type === "member_expression" && parent.childForFieldName("property")?.id === node.id) {
      const called = parent.parent?.type === "call_expression" && parent.parent.childForFieldName("function")?.id === parent.id;
      const written = parent.parent?.type === "assignment_expression" && parent.parent.childForFieldName("left")?.id === parent.id;
      const object = parent.childForFieldName("object");
      // `mod.save` of an imported module reads the module function itself.
      const moduleRead = object?.type === "identifier" && moduleSource(facts, object.text) !== null && bindingOf(object, object.text, root) === null;
      if (!called && !written) {
        if (moduleRead) note(`${object.text}.${node.text}`, node, false);
        else note(memberName(node), node, true);
      }
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
  facts.valueRefs = [...first.values()].sort((a, b) => a.line - b.line || a.col - b.col);
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
  const isConst = decl?.parent?.type === "lexical_declaration" && decl.parent.children.some((c) => c.type === "const");
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
 * (`./img/${n}.png` in a template) is not a module.
 */
function moduleUrlSpecs(node: Node): string[] | null {
  const args = node.childForFieldName("arguments")?.namedChildren.filter((c) => c.type !== "comment") ?? [];
  const [spec, base] = args;
  if (!spec) return [];
  if (node.type === "new_expression" && node.childForFieldName("constructor")?.text === "URL" && isImportMetaUrl(base)) {
    const strings = stringsOf(spec);
    if (strings === null) return NON_MODULE_SUFFIX.test(staticSuffix(spec)) && !MODULE_FILE.test(staticSuffix(spec)) ? [] : null;
    return strings.filter((s) => s.startsWith(".") && MODULE_FILE.test(s));
  }
  const fn = node.type === "call_expression" ? node.childForFieldName("function") : null;
  const isRegister = fn?.text === "register" || fn?.text.replace(/\s+/g, "") === "module.register";
  const parentUrl = isImportMetaUrl(base) || (base?.type === "object" && base.namedChildren.some((p) => p.type === "pair" && p.childForFieldName("key")?.text === "parentURL" && isImportMetaUrl(p.childForFieldName("value") ?? undefined)));
  return isRegister && parentUrl ? stringsOf(spec) : [];
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
  for (let at: Node | null = call; at; at = at.parent) {
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

function blockDeclares(block: Node, name: string): boolean {
  for (const stmt of block.namedChildren) {
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

/** Source of the import that bound `local` as a whole module, if any. */
function moduleSource(facts: FileFacts, local: string): string | null {
  return facts.imports.find((i) => i.bindings.some((b) => b.kind === "module" && b.local === local))?.source ?? null;
}

function requireSource(value: Node, requires: ReturnType<typeof query>): string | null {
  if (value.type !== "call_expression" && value.type !== "await_expression") return null;
  for (const m of requires.matches(value)) {
    const src = m.captures.find((c) => c.name === "source");
    if (src && src.node.parent?.parent?.parent?.id === value.id) return src.node.text;
    if (src && value.type === "await_expression") return src.node.text;
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
  const declare = (name: string, fn: Node, at: Node): void => {
    if ((!FUNCTION_VALUES.has(fn.type) && fn.type !== "method_definition") || facts.decls.some((d) => d.name === name)) return;
    facts.decls.push(decl("fn", name, at, signature(fn), true, declCalls(fn), collectTypeRefs(fn), []));
  };
  if (left === "module.exports") {
    if (right.type === "object") {
      for (const p of right.namedChildren) {
        if (p.type === "shorthand_property_identifier") facts.exports.add(p.text);
        else if (p.type === "pair") {
          const k = p.childForFieldName("key")?.text;
          const value = p.childForFieldName("value");
          if (!k) continue;
          const name = k.replace(/^['"]|['"]$/g, "");
          facts.exports.add(name);
          if (value) declare(name, unwrapValue(value), p);
        } else if (p.type === "method_definition") {
          const name = p.childForFieldName("name");
          if (name?.type !== "property_identifier") continue;
          facts.exports.add(name.text);
          declare(name.text, p, p);
        }
      }
    } else if (right.type === "identifier") {
      facts.exports.add(right.text);
    } else {
      declare("default", right, expr);
    }
  } else if (left.startsWith("exports.") || left.startsWith("module.exports.")) {
    const name = left.slice(left.lastIndexOf(".") + 1);
    facts.exports.add(name);
    declare(name, right, expr);
  }
}

function stringValue(n: Node): string | null {
  if (n.type !== "string") return null;
  return n.namedChildren.find((c) => c.type === "string_fragment")?.text ?? "";
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
