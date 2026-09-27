// TypeScript / JavaScript facts: imports, declarations, exports, calls.
// A tree walk over the top level plus tree-sitter queries inside bodies.

import { builtinModules } from "node:module";
import type { CallFact, DeclFact, FileFacts, ImportBinding, ImportFact, TypeRefFact, UnsupportedFact } from "./facts.ts";
import { grammarFor, parseSource, query, type Grammar, type Node } from "./treesitter.ts";

const CALLS_QUERY = `
(call_expression function: (identifier) @callee)
(call_expression function: (member_expression) @member)
(new_expression constructor: (identifier) @new)
`;

const REQUIRE_QUERY = `
(call_expression function: (identifier) @fn arguments: (arguments (string (string_fragment) @source)) (#eq? @fn "require"))
(call_expression function: (import) arguments: (arguments (string (string_fragment) @source)))
`;

export async function extractTs(path: string, src: string): Promise<FileFacts> {
  const g = grammarFor(path);
  const { tree, language } = await parseSource(g, src);
  const root = tree.rootNode;
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], completeness: "complete", parseError: null };
  const calls = query(language, g, "calls", CALLS_QUERY);
  const requires = query(language, g, "require", REQUIRE_QUERY);

  const declCalls = (body: Node): CallFact[] => {
    const out: CallFact[] = [];
    for (const c of calls.captures(body)) {
      const n = c.node;
      // Skip calls that belong to a nested class/function declaration handled on its own.
      if (c.name === "member") {
        const text = n.text.replace(/\s+/g, "");
        // `a.b.c()` keeps only `a.b` prefixes we can resolve: object.property.
        const obj = n.childForFieldName("object");
        const prop = n.childForFieldName("property");
        if (!obj || !prop) continue;
        if (obj.type === "this" || obj.type === "identifier") out.push(boundCall(callFact(`${obj.text}.${prop.text}`, n), obj.type === "identifier" ? bindingOf(n, obj.text, body) : null));
        else if (text.length < 80) out.push(callFact(text, n));
      } else {
        if (n.text === "require") continue;
        out.push(boundCall(callFact(n.text, n), bindingOf(n, n.text, body)));
      }
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
          if (value && (value.type === "arrow_function" || value.type === "function_expression" || value.type === "generator_function")) {
            facts.decls.push(decl("fn", name, d, signature(value), exported, declCalls(value), collectTypeRefs(value), []));
          } else if (value && value.type === "class") {
            facts.decls.push(classDecl(name, value, d, exported, declCalls));
          }
          if (exported) {
            facts.exports.add(name);
            const kind = value && (value.type === "arrow_function" || value.type === "function_expression" || value.type === "generator_function") ? "fn" : value?.type === "class" ? "class" : "value";
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
        facts.decls.push(classDecl(name, node, node, exported, declCalls));
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
          const value = node.childForFieldName("value");
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
              facts.decls.push(classDecl(value.childForFieldName("name")?.text ?? "default", value, value, true, declCalls));
              facts.exports.add("default");
              facts.exportRows.push({ name: "default", kind: "default", local: "default" });
            }
          }
        }
        break;
      }
      case "expression_statement":
        commonJsExports(node, facts);
        break;
      default:
        visitDecl(node, false);
    }
  }
  for (const d of facts.decls) if (localExports.has(d.name)) d.exported = true;
  collectDynamicImports(root, facts);
  collectUnsupported(root, facts);
  const end = located(root);
  facts.endLine = end.endLine;
  facts.endCol = end.endCol;
  if (root.hasError) {
    facts.completeness = "opaque";
    facts.parseError = { line: errorLine(root), reason: "syntax error" };
  }
  return facts;
}

/** First syntax-error line, or the start of the tree when the grammar only sets `hasError`. */
function errorLine(node: Node): number {
  if (node.type === "ERROR" || node.isMissing) return node.startPosition.row + 1;
  for (const child of node.children) {
    if (!child.hasError) continue;
    return errorLine(child);
  }
  return node.startPosition.row + 1;
}

function decl(kind: DeclFact["kind"], name: string, node: Node, signature: string | null, exported: boolean, calls: CallFact[], types: TypeRefFact[], members: DeclFact[]): DeclFact {
  const at = located(node);
  return { kind, name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported, calls, types, members };
}

function boundCall(call: CallFact, bound: "parameter" | "local" | null): CallFact {
  return bound ? { ...call, bound } : call;
}

function callFact(callee: string, node: Node): CallFact {
  const at = located(node);
  return { callee, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol };
}

function located(node: Node): { line: number; col: number; endLine: number; endCol: number; text: string } {
  return {
    line: node.startPosition.row + 1,
    col: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endCol: node.endPosition.column + 1,
    text: node.text,
  };
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

function classDecl(name: string, cls: Node, at: Node, exported: boolean, declCalls: (n: Node) => CallFact[]): DeclFact {
  const body = cls.childForFieldName("body");
  const members: DeclFact[] = [];
  for (const m of body?.namedChildren ?? []) {
    if (m.type === "method_definition" || m.type === "method_signature") {
      const mname = m.childForFieldName("name")?.text;
      if (!mname) continue;
      const isPrivate = mname.startsWith("#") || m.children.some((c) => c.type === "accessibility_modifier" && c.text === "private");
      members.push(decl("fn", mname.replace(/^#/, ""), m, signature(m), !isPrivate, m.type === "method_definition" ? declCalls(m) : [], collectTypeRefs(m), []));
    }
  }
  const heritageNode = cls.namedChildren.find((c) => c.type === "class_heritage" || c.type === "extends_type_clause" || c.type === "extends_clause");
  return decl("class", name, at, heritage(cls), exported, [], heritageNode ? collectTypeRefs(heritageNode) : [], members);
}

function importStatement(node: Node): ImportFact[] {
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
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      const isImport = fn?.type === "import";
      const isRequire = fn?.type === "identifier" && fn.text === "require";
      if (isImport || isRequire) {
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

/** `module.exports = {…}`, `module.exports = f`, `exports.x = …` */
function commonJsExports(stmt: Node, facts: FileFacts): void {
  const expr = stmt.namedChildren[0];
  if (!expr || expr.type !== "assignment_expression") return;
  const left = expr.childForFieldName("left")?.text.replace(/\s+/g, "");
  const right = expr.childForFieldName("right");
  if (!left || !right) return;
  if (left === "module.exports") {
    if (right.type === "object") {
      for (const p of right.namedChildren) {
        if (p.type === "shorthand_property_identifier") facts.exports.add(p.text);
        else if (p.type === "pair") {
          const k = p.childForFieldName("key")?.text;
          if (k) facts.exports.add(k.replace(/^['"]|['"]$/g, ""));
        }
      }
    } else if (right.type === "identifier") {
      facts.exports.add(right.text);
    }
  } else if (left.startsWith("exports.") || left.startsWith("module.exports.")) {
    facts.exports.add(left.slice(left.lastIndexOf(".") + 1));
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
