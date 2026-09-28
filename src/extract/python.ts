// Python facts: `def`/`class`, imports, `__all__`, calls. Each imported name
// is one import whose specifier is the dotted path (`..pkg.mod.f`); the
// resolver decides how much of it is a module. Methods through values,
// `getattr`, dynamic imports and replacing decorators are holes, not edges.

import type { CallFact, DeclFact, ExportRow, FileFacts, ImportFact, UnsupportedFact } from "./facts.ts";
import { errorLine, fingerprint, located, withTree, type Node } from "./treesitter.ts";

/** Decorators that keep the function a plain function (or method) of that name. */
const KEEPING_DECORATORS = new Set(
  "staticmethod classmethod property abstractmethod dataclass wraps functools.wraps cache functools.cache lru_cache functools.lru_cache cached_property functools.cached_property override typing.override overload typing.overload final typing.final".split(" "),
);

export function extractPython(path: string, src: string): Promise<FileFacts> {
  return withTree("python", src, (tree) => extractTree(path, tree.rootNode));
}

function extractTree(path: string, root: Node): FileFacts {
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "complete", parseError: null };
  const all = dunderAll(root);
  const values: string[] = [];
  const topLevel: Node[] = [];
  for (const node of root.namedChildren) collectTopLevel(node, topLevel);
  for (const node of topLevel) if (node.type === "import_statement" || node.type === "import_from_statement") facts.imports.push(...importsOf(node));
  for (const node of topLevel) {
    const def = node.type === "decorated_definition" ? node.childForFieldName("definition") : node;
    if (!def) continue;
    const name = def.childForFieldName("name")?.text;
    if (def.type === "function_definition" && name) {
      facts.decls.push(fnDecl(def, name, null));
      noteDecorators(node, name, facts);
    } else if (def.type === "class_definition" && name) {
      const at = located(def);
      const members: DeclFact[] = [];
      for (const item of def.childForFieldName("body")?.namedChildren ?? []) {
        const method = item.type === "decorated_definition" ? item.childForFieldName("definition") : item;
        const member = method?.childForFieldName("name")?.text;
        if (method?.type !== "function_definition" || !member) continue;
        const decl = fnDecl(method, member, name);
        // `_name` is private by convention; dunder methods (`__init__`) are the class's protocol.
        decl.exported = !member.startsWith("_") || /^__.+__$/.test(member);
        if (decorators(item).some((d) => d === "staticmethod" || d === "classmethod")) decl.static = true;
        members.push(decl);
        noteDecorators(item, `${name}.${member}`, facts);
      }
      const base = def.childForFieldName("superclasses")?.namedChildren[0]?.text;
      facts.decls.push({ kind: "class", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature: null, exported: false, calls: [], types: [], members, fingerprint: fingerprint(def), ...(base ? { base } : {}) });
    } else if (node.type === "expression_statement") {
      const assignment = node.namedChildren[0];
      const target = assignment?.type === "assignment" ? assignment.childForFieldName("left") : null;
      if (target?.type === "identifier" && target.text !== "__all__") values.push(target.text);
    }
  }
  // `__all__` lists the public names; without it, every name not starting with `_` is public.
  const isPublic = (name: string): boolean => (all ? all.has(name) : !name.startsWith("_"));
  for (const d of facts.decls) {
    d.exported = isPublic(d.name);
    if (d.exported) exportRow(facts, d.name, d.kind === "class" ? "class" : "fn");
  }
  for (const name of new Set(values)) if (isPublic(name)) exportRow(facts, name, "value");
  for (const imp of facts.imports) {
    for (const b of imp.bindings) if (all?.has(b.local)) exportRow(facts, b.local, "reexport");
  }
  facts.moduleCalls = moduleCalls(root);
  collectDynamic(root, facts);
  const end = located(root);
  facts.endLine = end.endLine;
  facts.endCol = end.endCol;
  if (root.hasError) {
    facts.completeness = "opaque";
    facts.parseError = { line: errorLine(root), reason: "syntax error" };
  }
  return facts;
}

/** Top-level statements, including those under `if`/`try` at module level (`if TYPE_CHECKING:`, `try: import x`). */
function collectTopLevel(node: Node, out: Node[]): void {
  if (node.type === "if_statement" || node.type === "try_statement" || node.type === "else_clause" || node.type === "elif_clause" || node.type === "except_clause" || node.type === "finally_clause" || node.type === "block") {
    // `if __name__ == "__main__":` is a script entry: its calls are module-level code, not declarations.
    for (const child of node.namedChildren) if (child.type !== "comparison_operator") collectTopLevel(child, out);
    return;
  }
  out.push(node);
}

/** The names in a literal `__all__ = [...]`; null without one. */
function dunderAll(root: Node): Set<string> | null {
  for (const node of root.namedChildren) {
    const assignment = node.type === "expression_statement" ? node.namedChildren[0] : null;
    if (assignment?.type !== "assignment" || assignment.childForFieldName("left")?.text !== "__all__") continue;
    const list = assignment.childForFieldName("right");
    if (!list || (list.type !== "list" && list.type !== "tuple")) return null;
    return new Set(list.namedChildren.filter((s) => s.type === "string").map((s) => s.namedChildren.find((c) => c.type === "string_content")?.text ?? ""));
  }
  return null;
}

function exportRow(facts: FileFacts, name: string, kind: ExportRow["kind"]): void {
  if (facts.exports.has(name)) return;
  facts.exports.add(name);
  facts.exportRows.push({ name, kind, local: null });
}

function decorators(node: Node): string[] {
  if (node.type !== "decorated_definition") return [];
  return node.namedChildren.filter((c) => c.type === "decorator").map((d) => (d.namedChildren[0]?.type === "call" ? d.namedChildren[0].childForFieldName("function")?.text : d.namedChildren[0]?.text) ?? "");
}

/** A decorator keylang does not know may return another function: calls of the name may not reach the body. */
function noteDecorators(node: Node, name: string, facts: FileFacts): void {
  for (const [i, decorator] of decorators(node).entries()) {
    if (KEEPING_DECORATORS.has(decorator)) continue;
    const at = node.namedChildren.filter((c) => c.type === "decorator")[i]!;
    facts.unsupported.push(unsupported(at, `decorator \`${decorator}\` may replace \`${name}\``));
  }
}

function fnDecl(node: Node, name: string, owner: string | null): DeclFact {
  const at = located(node);
  const params = node.childForFieldName("parameters");
  const returns = node.childForFieldName("return_type");
  const signature = params ? `${params.text.replace(/\s+/g, " ")}${returns ? ` → ${returns.text.replace(/\s+/g, " ")}` : ""}` : null;
  const first = params?.namedChildren[0];
  const receiver = owner !== null && first?.type === "identifier" ? first.text : null;
  const body = node.childForFieldName("body");
  const calls = body ? bodyCalls(body, { receiver, bound: boundNames(node) }) : [];
  return { kind: "fn", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported: false, calls, types: [], members: [], fingerprint: fingerprint(node) };
}

/** Parameter and assigned names in a function: a call through one of them is a call through a value. */
function boundNames(fn: Node): Map<string, "parameter" | "local"> {
  const out = new Map<string, "parameter" | "local">();
  const names = (target: Node | null, kind: "parameter" | "local"): void => {
    if (!target) return;
    if (target.type === "identifier") out.set(target.text, kind);
    else if (target.type === "pattern_list" || target.type === "tuple_pattern" || target.type === "list_pattern" || target.type === "list_splat_pattern" || target.type === "dictionary_splat_pattern") {
      for (const c of target.namedChildren) names(c, kind);
    } else if (target.type === "typed_parameter" || target.type === "default_parameter" || target.type === "typed_default_parameter") {
      names(target.childForFieldName("name") ?? target.namedChildren[0] ?? null, kind);
    }
  };
  for (const p of fn.childForFieldName("parameters")?.namedChildren ?? []) names(p, "parameter");
  const walk = (node: Node): void => {
    if (node.type === "assignment" || node.type === "augmented_assignment") names(node.childForFieldName("left"), "local");
    else if (node.type === "for_statement" || node.type === "for_in_clause") names(node.childForFieldName("left"), "local");
    else if (node.type === "as_pattern") names(node.childForFieldName("alias")?.namedChildren[0] ?? node.childForFieldName("alias"), "local");
    else if (node.type === "function_definition" || node.type === "class_definition") names(node.childForFieldName("name"), "local");
    else if (node.type === "lambda") for (const p of node.childForFieldName("parameters")?.namedChildren ?? []) names(p, "parameter");
    for (const c of node.namedChildren) walk(c);
  };
  const body = fn.childForFieldName("body");
  if (body) walk(body);
  return out;
}

interface CallScope {
  /** `self` (or `cls`) of a method. */
  receiver: string | null;
  bound: ReadonlyMap<string, "parameter" | "local">;
}

function bodyCalls(body: Node, scope: CallScope): CallFact[] {
  const out: CallFact[] = [];
  const walk = (node: Node, closure: boolean): void => {
    if (node.type === "call") {
      const fact = callOf(node.childForFieldName("function"), scope);
      if (fact) {
        const at = located(node);
        out.push({ ...fact, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, ...(closure ? { closure: true as const } : {}) });
      }
    }
    const inner = closure || node.type === "lambda" || node.type === "function_definition";
    for (const c of node.namedChildren) walk(c, inner);
  };
  walk(body, false);
  return out;
}

/** `f()` → `f`; `a.b.f()` → `a.b.f`; `self.m()` → `this.m`; `x.m()` through a value → `x.m`, bound. Null for other shapes. */
function callOf(fn: Node | null, scope: CallScope): Pick<CallFact, "callee" | "bound"> | null {
  if (!fn) return null;
  if (fn.type === "identifier") {
    const bound = scope.bound.get(fn.text);
    return bound ? { callee: fn.text, bound } : { callee: fn.text };
  }
  if (fn.type !== "attribute") return null;
  const parts: string[] = [];
  let at: Node | null = fn;
  while (at?.type === "attribute") {
    parts.unshift(at.childForFieldName("attribute")?.text ?? "");
    at = at.childForFieldName("object");
  }
  if (at?.type !== "identifier") return null;
  const head = at.text;
  // `self.m()` is a method; `self.queue.put()` goes through an attribute whose type keylang does not know.
  if (head === scope.receiver) return parts.length === 1 ? { callee: `this.${parts[0]}` } : { callee: ["this", ...parts].join("."), bound: "local" };
  const callee = [head, ...parts].join(".");
  const bound = scope.bound.get(head);
  return bound ? { callee, bound } : { callee };
}

/** Calls outside every `def` and `class`: they run when the module loads. */
function moduleCalls(root: Node): CallFact[] {
  const out: CallFact[] = [];
  const walk = (node: Node): void => {
    if (node.type === "function_definition" || node.type === "class_definition") return;
    if (node.type === "call") {
      const fact = callOf(node.childForFieldName("function"), { receiver: null, bound: new Map() });
      if (fact) {
        const at = located(node);
        out.push({ ...fact, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol });
      }
    }
    for (const c of node.namedChildren) walk(c);
  };
  for (const node of root.namedChildren) walk(node);
  return out;
}

/** `getattr(x, name)`, `importlib.import_module(name)`, `__import__(name)`, `exec`/`eval`: what they reach is decided at run time. */
function collectDynamic(root: Node, facts: FileFacts): void {
  const walk = (node: Node): void => {
    if (node.type === "call") {
      const callee = node.childForFieldName("function")?.text;
      if (callee === "getattr") facts.unsupported.push(unsupported(node, "`getattr` reads an attribute chosen at run time"));
      else if (callee === "importlib.import_module" || callee === "import_module" || callee === "__import__") facts.unsupported.push(unsupported(node, "dynamic import"));
      else if (callee === "exec" || callee === "eval") facts.unsupported.push(unsupported(node, `\`${callee}\` runs code keylang cannot read`));
    }
    for (const c of node.namedChildren) walk(c);
  };
  walk(root);
}

/** `import a.b as c` → `a.b` bound to `c`; `import a.b` → `a` bound to `a` plus a dependency on `a.b`; `from .m import x` → `.m.x` bound to `x`. */
function importsOf(node: Node): ImportFact[] {
  const out: ImportFact[] = [];
  if (node.type === "import_statement") {
    for (const item of node.namedChildren) {
      if (item.type === "aliased_import") {
        const name = item.childForFieldName("name")?.text;
        const alias = item.childForFieldName("alias")?.text;
        if (name && alias) out.push(importAt(node, name, [{ kind: "module", local: alias }]));
      } else if (item.type === "dotted_name") {
        const head = item.text.split(".")[0]!;
        out.push(importAt(node, head, [{ kind: "module", local: head }]));
        if (item.text !== head) out.push(importAt(node, item.text, []));
      }
    }
    return out;
  }
  const moduleNode = node.childForFieldName("module_name");
  const from = moduleNode?.text.replace(/\s+/g, "") ?? "";
  const join = (name: string): string => (from.endsWith(".") ? `${from}${name}` : `${from}.${name}`);
  let named = false;
  for (const item of node.namedChildren) {
    // Nodes are fresh wrappers on every access: compare ids, not objects.
    if (item.id === moduleNode?.id) continue;
    if (item.type === "wildcard_import") {
      out.push(importAt(node, from, []));
      named = true;
    } else if (item.type === "dotted_name") {
      out.push(importAt(node, join(item.text), [{ kind: "named", local: item.text, imported: item.text }]));
      named = true;
    } else if (item.type === "aliased_import") {
      const name = item.childForFieldName("name")?.text;
      const alias = item.childForFieldName("alias")?.text;
      if (name && alias) out.push(importAt(node, join(name), [{ kind: "named", local: alias, imported: name }]));
      named = true;
    }
  }
  if (!named) out.push(importAt(node, from, []));
  return out;
}

function importAt(node: Node, source: string, bindings: ImportFact["bindings"]): ImportFact {
  const at = located(node);
  return { source, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, bindings, reexport: false };
}

function unsupported(node: Node, reason: string): UnsupportedFact {
  const at = located(node);
  return { line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text.split("\n")[0]!, reason };
}
