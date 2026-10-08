// Python facts: `def`/`class`, imports, `__all__`, calls. Each imported name
// is one import whose specifier is the dotted path (`..pkg.mod.f`); the
// resolver decides how much of it is a module. Methods through values whose
// class no annotation or `X(…)` names,
// `getattr`, dynamic imports and replacing decorators are holes, not edges.
// Every call expression is an edge or a hole: a callee keylang cannot name
// is a call through a value, never dropped.

import type { CallFact, DeclFact, ExportRow, FileFacts, ImportFact, Kwarg, LiteralValue, PassFact, StatementFact, UnsupportedFact, ValueRefFact } from "./facts.ts";
import { isLicense, nonEmpty } from "./doc-comments.ts";
import { errorLine, fingerprint, located, withTree, type Node } from "./treesitter.ts";

/** Decorators that keep the function a plain function (or method) of that name. */
const KEEPING_DECORATORS = new Set(
  "staticmethod classmethod property abstractmethod abc.abstractmethod dataclass dataclasses.dataclass wraps functools.wraps cache functools.cache lru_cache functools.lru_cache cached_property functools.cached_property override typing.override typing_extensions.override overload typing.overload final typing.final total_ordering functools.total_ordering unique enum.unique runtime_checkable typing.runtime_checkable".split(" "),
);

/** Decorators that make a method run on attribute access. */
const ACCESSOR_DECORATORS = new Set(["property", "cached_property", "functools.cached_property"]);

/** Nodes whose identifiers name what is bound, not what is read. */
const BINDING_PARENTS = new Set(["parameters", "lambda_parameters", "global_statement", "nonlocal_statement", "dotted_name", "aliased_import", "import_statement", "import_from_statement", "decorator", "list_splat_pattern", "dictionary_splat_pattern", "pattern_list", "tuple_pattern", "list_pattern", "type", "as_pattern_target"]);

export function extractPython(path: string, src: string): Promise<FileFacts> {
  return withTree("python", src, (tree) => extractTree(path, tree.rootNode));
}

function extractTree(path: string, root: Node): FileFacts {
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "complete", parseError: null };
  const values: string[] = [];
  const topLevel: Node[] = [];
  for (const node of root.namedChildren) collectTopLevel(node, topLevel);
  const all = dunderAll(topLevel);
  // A package re-exports what its `__init__.py` imports: `from .order import place` is `shop.domain.place`.
  const pkg = /(^|\/)__init__\.py$/.test(path);
  const isPublic = (name: string): boolean => (all ? all.has(name) : !name.startsWith("_"));
  // Imports anywhere in the file: one inside a function is a dependency of the module as much as one at the top.
  // A name in `__all__`, or any public name a package imports, is re-exported; so is `from .x import *` of a package without `__all__`.
  facts.imports = importsIn(root, (local) => (local === null ? pkg && all === null : all ? all.has(local) : pkg && isPublic(local)));
  for (const node of topLevel) {
    const def = node.type === "decorated_definition" ? node.childForFieldName("definition") : node;
    if (!def) continue;
    const name = def.childForFieldName("name")?.text;
    if (def.type === "function_definition" && name) {
      facts.decls.push(fnDecl(def, name, null));
      noteDecorators(node, name, false, facts);
      noteParamCalls(def, name, facts);
    } else if (def.type === "class_definition" && name) {
      facts.decls.push(classDecl(def, name, name, true, facts));
      noteDecorators(node, name, false, facts);
    } else if (node.type === "expression_statement") {
      const assignment = node.namedChildren[0];
      const target = assignment?.type === "assignment" ? assignment.childForFieldName("left") : null;
      if (target?.type === "identifier" && target.text !== "__all__") values.push(target.text);
    }
  }
  for (const d of facts.decls) {
    d.exported = isPublic(d.name);
    if (d.exported) exportRow(facts, d.name, d.kind === "class" ? "class" : "fn");
  }
  for (const name of new Set(values)) if (isPublic(name)) exportRow(facts, name, "value");
  for (const imp of facts.imports) {
    for (const b of imp.bindings) if (imp.reexport) exportRow(facts, b.local, "reexport");
  }
  if (all === null) {
    // Without `__all__`, `from m import *` brings every public name of the namespace, the imported ones
    // included: a plain module lists them in its table too. Only a package re-exports them (`reexport` above);
    // here the dependency stays an ordinary import.
    if (!pkg) {
      for (const node of topLevel) {
        if (node.type !== "import_statement" && node.type !== "import_from_statement") continue;
        for (const imp of importsOf(node, () => false)) for (const b of imp.bindings) if (!b.local.includes(".") && isPublic(b.local)) exportRow(facts, b.local, "value");
      }
    }
    const open = topLevel.find((node) => bindsUnlisted(node) !== null);
    if (open) facts.exportsIncomplete = `a module-level ${bindsUnlisted(open)} binds names keylang does not list`;
  }
  const names = new Set([...facts.decls.map((d) => d.name), ...facts.imports.flatMap((imp) => imp.bindings.map((b) => b.local))]);
  facts.moduleCalls = moduleCalls(root);
  const statements = statementsOf(topLevel);
  if (statements.length > 0) facts.statements = statements;
  collectMainEntries(root, names, facts);
  facts.valueRefs = [...facts.valueRefs, ...valueRefs(root, names, facts.imports.some((imp) => imp.glob))].sort((a, b) => a.line - b.line || a.col - b.col);
  collectDynamic(root, facts);
  const doc = docstring(root);
  if (doc !== undefined) facts.doc = doc;
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

/**
 * The names of `__all__`: a literal list or tuple, extended by `+=`, `+`,
 * `.extend([...])` and `.append("x")`; null without an `__all__`.
 */
function dunderAll(topLevel: Node[]): Set<string> | null {
  let out: Set<string> | null = null;
  const literal = (node: Node | null): string[] | null => {
    if (!node) return null;
    if (node.type === "list" || node.type === "tuple") return node.namedChildren.filter((s) => s.type === "string").map((s) => s.namedChildren.find((c) => c.type === "string_content")?.text ?? "");
    if (node.type === "binary_operator" && node.childForFieldName("operator")?.text === "+") {
      const left = literal(node.childForFieldName("left"));
      const right = literal(node.childForFieldName("right"));
      return left && right ? [...left, ...right] : null;
    }
    if (node.type === "string") return [node.namedChildren.find((c) => c.type === "string_content")?.text ?? ""];
    return null;
  };
  for (const node of topLevel) {
    const expr = node.type === "expression_statement" ? node.namedChildren[0] : null;
    if (!expr) continue;
    if ((expr.type === "assignment" || expr.type === "augmented_assignment") && expr.childForFieldName("left")?.text === "__all__") {
      const names = literal(expr.childForFieldName("right"));
      if (expr.type === "assignment") out = names ? new Set(names) : null;
      else if (names) out = new Set([...(out ?? []), ...names]);
    } else if (expr.type === "call" && /^__all__\.(extend|append)$/.test(expr.childForFieldName("function")?.text ?? "")) {
      const names = literal(expr.childForFieldName("arguments")?.namedChildren[0] ?? null);
      if (names) out = new Set([...(out ?? []), ...names]);
    }
  }
  return out;
}

/**
 * What a module-level statement that binds names the export table does not
 * list is, for the reason (`for`, `with`, `while`, `match`, `except … as`,
 * tuple unpacking); null for one whose bindings the table has.
 */
function bindsUnlisted(node: Node): string | null {
  if (node.type === "for_statement" || node.type === "while_statement" || node.type === "with_statement" || node.type === "match_statement") return `\`${node.type.replace(/_statement$/, "")}\``;
  if (node.type === "as_pattern") return "`except … as`";
  const assignment = node.type === "expression_statement" ? node.namedChildren[0] : undefined;
  const left = assignment?.type === "assignment" ? assignment.childForFieldName("left") : null;
  return left && (left.type === "pattern_list" || left.type === "tuple_pattern" || left.type === "list_pattern") ? "tuple assignment" : null;
}

function exportRow(facts: FileFacts, name: string, kind: ExportRow["kind"]): void {
  if (facts.exports.has(name)) return;
  facts.exports.add(name);
  facts.exportRows.push({ name, kind, local: null });
}

function decorators(node: Node): { name: string; node: Node }[] {
  if (node.type !== "decorated_definition") return [];
  return node.namedChildren
    .filter((c) => c.type === "decorator")
    .map((d) => ({ name: (d.namedChildren[0]?.type === "call" ? d.namedChildren[0].childForFieldName("function")?.text : d.namedChildren[0]?.text) ?? "", node: d }));
}

/** `@property`, `@x.setter`: the method runs on attribute access. */
function isAccessor(name: string): boolean {
  return ACCESSOR_DECORATORS.has(name) || /\.(setter|getter|deleter)$/.test(name);
}

/**
 * A decorator keylang does not know may return another function: calls of
 * the name may not reach the body (a hole of that declaration), and the
 * decorator holds the function as a value, so code keylang cannot follow may
 * call it (a framework calling a registered handler).
 */
function noteDecorators(node: Node, symbol: string, member: boolean, facts: FileFacts): void {
  for (const decorator of decorators(node)) {
    if (KEEPING_DECORATORS.has(decorator.name) || isAccessor(decorator.name)) continue;
    const at = located(decorator.node);
    const expr = decorator.node.namedChildren[0];
    (facts.decorators ??= []).push({ name: decorator.name, call: expr?.type === "call" ? argumentsOf(expr, { left: LITERAL_BUDGET }) : null, target: symbol, line: at.line, col: at.col });
    facts.unsupported.push({ ...unsupported(decorator.node, `decorator \`${decorator.name}\` may replace \`${symbol}\``), symbol });
    facts.valueRefs.push({ name: member ? symbol.slice(symbol.lastIndexOf(".") + 1) : symbol, ...(member ? { member: true as const } : {}), line: at.line, col: at.col });
  }
}

/** A class and its members: methods, and nested classes with theirs. `symbol` is its dotted path in the file. */
function classDecl(def: Node, name: string, symbol: string, topLevel: boolean, facts: FileFacts): DeclFact {
  const at = located(def);
  const items = (def.childForFieldName("body")?.namedChildren ?? []).map((item) => ({ item, def: item.type === "decorated_definition" ? item.childForFieldName("definition") : item }));
  const statics = new Set<string>();
  for (const { item, def: method } of items) {
    const member = method?.childForFieldName("name")?.text;
    if (method?.type === "function_definition" && member && decorators(item).some((d) => d.name === "staticmethod" || d.name === "classmethod")) statics.add(member);
  }
  const members: DeclFact[] = [];
  for (const { item, def: inner } of items) {
    const member = inner?.childForFieldName("name")?.text;
    if (!inner || !member) continue;
    const path = `${symbol}.${member}`;
    // `_name` is private by convention; dunder methods (`__init__`) are the class's protocol.
    const exported = !member.startsWith("_") || /^__.+__$/.test(member);
    if (inner.type === "class_definition") {
      members.push({ ...classDecl(inner, member, path, false, facts), exported });
      noteDecorators(item, path, true, facts);
      continue;
    }
    if (inner.type !== "function_definition") continue;
    const names = decorators(item).map((d) => d.name);
    const isStatic = names.includes("staticmethod");
    const decl = fnDecl(inner, member, { name, statics: topLevel ? statics : new Set(), receiver: !isStatic });
    noteParamCalls(inner, path, facts);
    decl.exported = exported;
    if (isStatic || names.includes("classmethod")) decl.static = true;
    if (names.some(isAccessor)) decl.accessor = true;
    members.push(decl);
    noteDecorators(item, path, true, facts);
  }
  const base = def.childForFieldName("superclasses")?.namedChildren[0]?.text;
  const doc = docstring(def.childForFieldName("body"));
  return { kind: "class", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature: null, exported: false, calls: [], types: [], members, fingerprint: fingerprint(def), ...(base ? { base } : {}), ...(doc !== undefined ? { doc } : {}) };
}

/** The class a method belongs to: its name, its static and class methods (for a top-level class), and whether the first parameter is the receiver. */
interface Owner {
  name: string;
  statics: ReadonlySet<string>;
  receiver: boolean;
}

function fnDecl(node: Node, name: string, owner: Owner | null): DeclFact {
  const at = located(node);
  const params = node.childForFieldName("parameters");
  const returns = node.childForFieldName("return_type");
  const signature = params ? `${params.text.replace(/\s+/g, " ")}${returns ? ` → ${returns.text.replace(/\s+/g, " ")}` : ""}` : null;
  const first = params?.namedChildren[0];
  const firstName = first?.type === "identifier" ? first.text : first?.type === "typed_parameter" ? first.namedChildren.find((c) => c.type === "identifier")?.text : undefined;
  // A `@staticmethod` has no receiver: its first parameter is an ordinary value.
  const receiver = owner?.receiver && firstName ? firstName : null;
  const body = node.childForFieldName("body");
  const calls = body ? bodyCalls(body, { receiver, owner, bound: boundNames(node), classes: typedValues(node) }) : [];
  const doc = docstring(body);
  return { kind: "fn", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported: false, calls, types: [], members: [], fingerprint: fingerprint(node), ...(doc !== undefined ? { doc } : {}) };
}

/**
 * The docstring of a module, class or function body: its first statement when
 * that is a lone string literal. An f-string, a bytes literal or concatenated
 * strings are code, not documentation, and give none.
 */
function docstring(body: Node | null): string | undefined {
  const first = body?.namedChildren.find((c) => c.type !== "comment");
  const literal = first?.type === "expression_statement" && first.namedChildren.length === 1 ? first.namedChildren[0] : undefined;
  if (literal?.type !== "string") return undefined;
  const match = /^([rRuU]?)("""|\'\'\'|"|')([\s\S]*)\2$/.exec(literal.text);
  if (!match) return undefined;
  const text = cleandoc(match[3] ?? "");
  return isLicense(text) ? undefined : nonEmpty(text) ?? undefined;
}

/** `inspect.cleandoc`: the first line stripped, the rest dedented by their common indentation. */
function cleandoc(text: string): string {
  const [head = "", ...rest] = text.replace(/\t/g, "        ").split("\n");
  const indents = rest.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return [head.trim(), ...rest.map((line) => line.slice(cut).trimEnd())].join("\n").trim();
}

/**
 * Every binding a function makes, nested scopes included — one scope for the
 * whole function, as `boundNames` and `typedValues` read it: its parameters,
 * assignments, loop and comprehension variables, `with … as x`,
 * `except … as x`, `:=`, `case` captures (`case (x,)`, `case {"k": x}`,
 * `case [*x]`, `case P(k=x)`, `case str() as x`), nested `def` and `class`
 * names and the parameters of nested functions and lambdas. `global` and
 * `nonlocal` are `declared`: the name lives outside the function. `by` is
 * the node that binds (an `assignment` may name the class).
 */
function walkBindings(fn: Node, visit: (target: Node, kind: "parameter" | "local" | "declared", by: Node) => void): void {
  const params = (owner: Node): void => {
    for (const p of owner.childForFieldName("parameters")?.namedChildren ?? []) visit(p, "parameter", owner);
  };
  params(fn);
  const walk = (node: Node): void => {
    const field = (name: string): void => {
      const target = node.childForFieldName(name);
      if (target) visit(target, "local", node);
    };
    if (node.type === "assignment" || node.type === "augmented_assignment" || node.type === "for_statement" || node.type === "for_in_clause") field("left");
    else if (node.type === "named_expression" || node.type === "function_definition" || node.type === "class_definition") field("name");
    else if (node.type === "as_pattern") {
      // `with … as x` and `except … as x` name an alias; `case … as x` ends with the name.
      const alias = node.childForFieldName("alias") ?? node.namedChildren.at(-1);
      if (alias && (alias.type === "as_pattern_target" || alias.type === "identifier")) visit(alias, "local", node);
    } else if (node.type === "splat_pattern" || (node.type === "dotted_name" && captures(node))) {
      const name = node.namedChildren[0];
      if (name?.type === "identifier") visit(name, "local", node);
    } else if (node.type === "global_statement" || node.type === "nonlocal_statement") visit(node, "declared", node);
    if (node.type === "function_definition" || node.type === "lambda") params(node);
    for (const c of node.namedChildren) walk(c);
  };
  const body = fn.childForFieldName("body");
  if (body) walk(body);
}

/** A bare name in a `case` pattern binds it (`case x:`, `P(k=x)`); a dotted one (`Color.RED`) and a class (`case P():`) are values. */
function captures(name: Node): boolean {
  const parent = name.parent;
  return name.namedChildren.length === 1 && (parent?.type === "case_pattern" || parent?.type === "keyword_pattern");
}

/** Parameter and assigned names in a function: a call through one of them is a call through a value. */
function boundNames(fn: Node): Map<string, "parameter" | "local"> {
  const out = new Map<string, "parameter" | "local">();
  const names = (target: Node | null, kind: "parameter" | "local"): void => {
    if (!target) return;
    if (target.type === "identifier") out.set(target.text, kind);
    else if (target.type === "pattern_list" || target.type === "tuple_pattern" || target.type === "list_pattern" || target.type === "list_splat_pattern" || target.type === "dictionary_splat_pattern" || target.type === "as_pattern_target") {
      for (const c of target.namedChildren) names(c, kind);
    } else if (target.type === "typed_parameter" || target.type === "default_parameter" || target.type === "typed_default_parameter") {
      names(target.childForFieldName("name") ?? target.namedChildren[0] ?? null, kind);
    }
  };
  walkBindings(fn, (target, kind) => {
    if (kind !== "declared") names(target, kind);
  });
  return out;
}

interface CallScope {
  /** `self` (or `cls`) of a method. */
  receiver: string | null;
  owner: Owner | null;
  bound: ReadonlyMap<string, "parameter" | "local">;
  /** Parameters and locals whose class the syntax names (`typedValues`). */
  classes: ReadonlyMap<string, string>;
}

/**
 * Names in a function whose class the syntax names, bound nowhere else in it:
 * a parameter annotated with a class (`repo: Repo`, `repo: Repo = Depends(…)`,
 * `Optional[Repo]`, `Repo | None`, `Annotated[Repo, …]`) or a local whose
 * only assignment is `x = Repo(…)` or `x: Repo = …`. The graph keeps the
 * name only when it is a class: then `x.m()` is `Repo.m`. A second binding
 * anywhere in the function, nested scopes included, drops the name.
 */
function typedValues(fn: Node): Map<string, string> {
  const evidence = new Map<string, string | null>();
  const bind = (name: string, cls: string | null): void => {
    evidence.set(name, evidence.has(name) ? null : cls);
  };
  const targets = (target: Node | null, cls: string | null): void => {
    if (!target) return;
    if (target.type === "identifier") bind(target.text, cls);
    else if (target.type === "typed_parameter") targets(target.namedChildren[0] ?? null, annotatedClass(target.childForFieldName("type")));
    else if (target.type === "typed_default_parameter") targets(target.childForFieldName("name"), annotatedClass(target.childForFieldName("type")));
    else if (target.type === "default_parameter") targets(target.childForFieldName("name"), null);
    else for (const c of target.namedChildren) targets(c, null);
  };
  walkBindings(fn, (target, _kind, by) => {
    const cls = by.type === "assignment" && target.type === "identifier" ? (annotatedClass(by.childForFieldName("type")) ?? constructedClass(by.childForFieldName("right"))) : null;
    targets(target, cls);
  });
  const out = new Map<string, string>();
  // A class shadowed in the function is not the module's class.
  for (const [name, cls] of evidence) if (cls && !evidence.has(cls)) out.set(name, cls);
  return out;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The one class an annotation names: `X`, `"X"`, `Optional[X]`, `X | None`, `Annotated[X, …]`; null for anything else. */
function annotatedClass(type: Node | null): string | null {
  return type ? classInAnnotation(type.text.replace(/\s+/g, "")) : null;
}

function classInAnnotation(text: string): string | null {
  const quoted = /^(["'])(.*)\1$/.exec(text);
  if (quoted) return classInAnnotation(quoted[2]!);
  if (IDENTIFIER.test(text)) return text === "None" ? null : text;
  const optional = /^(?:typing\.)?Optional\[(.+)\]$/.exec(text);
  if (optional) return classInAnnotation(optional[1]!);
  const annotated = /^(?:typing\.|typing_extensions\.)?Annotated\[([^,[\]]+),/.exec(text);
  if (annotated) return classInAnnotation(annotated[1]!);
  if (text.includes("[")) return null;
  const members = text.split("|").filter((part) => part !== "None");
  return members.length === 1 && members.length < text.split("|").length ? classInAnnotation(members[0]!) : null;
}

/** `X(…)` → `X`. */
function constructedClass(value: Node | null): string | null {
  const fn = value?.type === "call" ? value.childForFieldName("function") : null;
  return fn?.type === "identifier" ? fn.text : null;
}

/**
 * Where a call sits with respect to closures: null outside them; `stored`
 * under a nested `def` or a lambda some value holds (`g = lambda: …`);
 * otherwise the position of the outermost lambda, every lambda between being
 * an argument of a call (`run(lambda: self.m())`, `sorted(xs, key=lambda x: …)`).
 */
type ClosureState = null | "stored" | { line: number; col: number };

function bodyCalls(body: Node, scope: CallScope): CallFact[] {
  const out: CallFact[] = [];
  const walk = (node: Node, closure: ClosureState): void => {
    if (node.type === "call") {
      const at = located(node);
      const passes = passesOf(node, scope);
      out.push({
        ...callOf(node.childForFieldName("function"), scope),
        ...(passes.length > 0 ? { passes } : {}),
        line: at.line,
        col: at.col,
        endLine: at.endLine,
        endCol: at.endCol,
        ...(closure ? { closure: true as const } : {}),
        ...(closure && closure !== "stored" ? { closureArg: closure } : {}),
      });
    }
    let inner = closure;
    if (node.type === "function_definition") inner = "stored";
    else if (node.type === "lambda") {
      const parent = node.parent;
      const argument = parent?.type === "argument_list" || (parent?.type === "keyword_argument" && parent.parent?.type === "argument_list");
      inner = closure === "stored" || !argument ? "stored" : (closure ?? { line: located(node).line, col: located(node).col });
    }
    for (const c of node.namedChildren) walk(c, inner);
  };
  walk(body, null);
  return out;
}

/**
 * Callable references among the arguments: `run(self.m)`, `run(Order.m)`,
 * `run(obj.m)` with the class of `obj` known, `run(callback=self.m)`,
 * `functools.partial(self.m, …)`. A lambda is not a pass: its calls carry
 * `closureArg`.
 */
function passesOf(call: Node, scope: CallScope): PassFact[] {
  const args = call.childForFieldName("arguments");
  if (args?.type !== "argument_list") return [];
  const out: PassFact[] = [];
  args.namedChildren
    .filter((arg) => arg.type !== "comment")
    .forEach((arg, index) => {
      const value = arg.type === "keyword_argument" ? arg.childForFieldName("value") : arg;
      const node = value ? callableOf(value) : null;
      if (!node) return;
      const fact = callOf(node, scope);
      // A value keylang cannot name, or a local of unknown class, resolves to nothing.
      if (fact.callee === "?" || (fact.bound && !fact.receiver)) return;
      const at = located(node);
      out.push({ arg: index, path: "", callee: fact.callee, ...(fact.bound ? { bound: fact.bound } : {}), ...(fact.receiver ? { receiver: fact.receiver } : {}), text: at.text.replace(/\s+/g, " "), line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol });
    });
  return out;
}

/** The expression that names the callable an argument passes: a name, an attribute, or the first argument of `functools.partial(…)`. */
function callableOf(value: Node): Node | null {
  if (value.type === "identifier" || value.type === "attribute") return value;
  if (value.type !== "call") return null;
  const fn = value.childForFieldName("function");
  const name = fn?.type === "identifier" ? fn.text : fn?.type === "attribute" ? fn.childForFieldName("attribute")?.text : undefined;
  if (name !== "partial") return null;
  const first = value.childForFieldName("arguments")?.namedChildren.find((c) => c.type !== "comment");
  return first ? callableOf(first) : null;
}

/**
 * `f()` → `f`; `a.b.f()` → `a.b.f`; `self.m()` → `this.m` (`Order.m` for a
 * static method); `x.m()` through a value → `x.m`, bound, with the receiver's
 * class when `typedValues` names it. Any other callee
 * (`super().m()`, `f().m()`, `x[0]()`) is a call through a value keylang
 * cannot name, written as in the source.
 */
function callOf(fn: Node | null, scope: CallScope): Pick<CallFact, "callee" | "bound" | "receiver"> {
  if (!fn) return { callee: "?", bound: "local" };
  // `(f)()` is `f()`.
  if (fn.type === "parenthesized_expression" && fn.namedChildren.length === 1) return callOf(fn.namedChildren[0]!, scope);
  if (fn.type === "identifier") {
    const bound = scope.bound.get(fn.text);
    return bound ? { callee: fn.text, bound } : { callee: fn.text };
  }
  const parts: string[] = [];
  let at: Node | null = fn;
  while (at?.type === "attribute") {
    parts.unshift(at.childForFieldName("attribute")?.text ?? "");
    at = at.childForFieldName("object");
  }
  if (fn.type !== "attribute" || at?.type !== "identifier") return { callee: fn.text.replace(/\s+/g, " "), bound: "local" };
  const head = at.text;
  if (head === scope.receiver) {
    // `self.queue.put()` goes through an attribute whose type keylang does not know.
    if (parts.length !== 1) return { callee: [head, ...parts].join("."), bound: "local" };
    return scope.owner?.statics.has(parts[0]!) ? { callee: `${scope.owner.name}.${parts[0]}` } : { callee: `this.${parts[0]}` };
  }
  const callee = [head, ...parts].join(".");
  const bound = scope.bound.get(head);
  // `repo.save()` with `repo: Repo` or `repo = Repo()`: the graph looks `save` up in `Repo`.
  const receiver = parts.length === 1 ? scope.classes.get(head) : undefined;
  return { callee, ...(bound ? { bound } : {}), ...(receiver ? { receiver } : {}) };
}

/**
 * `if __name__ == "__main__":` at module level: the script's entry. Its
 * callee is the first fn of the file (a `def`, or an imported name) the block
 * calls directly (`main()`, `sys.exit(main())`, `asyncio.run(main())`); null
 * when the block calls no such name, and the module's top level is the entry.
 */
function collectMainEntries(root: Node, names: ReadonlySet<string>, facts: FileFacts): void {
  const entries: NonNullable<FileFacts["entries"]> = [];
  for (const node of root.namedChildren) {
    if (node.type !== "if_statement") continue;
    const condition = node.childForFieldName("condition")?.text.replace(/\s+/g, "") ?? "";
    if (!/^(__name__==["']__main__["']|["']__main__["']==__name__)$/.test(condition)) continue;
    let callee: string | null = null;
    const walk = (at: Node): void => {
      if (callee !== null || at.type === "function_definition" || at.type === "class_definition") return;
      if (at.type === "call") {
        const fn = at.childForFieldName("function");
        if (fn?.type === "identifier" && names.has(fn.text)) {
          callee = fn.text;
          return;
        }
      }
      for (const child of at.namedChildren) walk(child);
    };
    for (const child of node.namedChildren) if (child.type !== "comparison_operator") walk(child);
    const at = located(node);
    entries.push({ kind: "main", label: "__main__", callee, line: at.line, col: at.col });
  }
  if (entries.length > 0) facts.entries = entries;
}

/** Calls outside every `def`: module level and class bodies run when the module loads; so does a decorator. */
function moduleCalls(root: Node): CallFact[] {
  const out: CallFact[] = [];
  const noScope: CallScope = { receiver: null, owner: null, bound: new Map(), classes: new Map() };
  const walk = (node: Node): void => {
    if (node.type === "function_definition") return;
    if (node.type === "call") {
      const at = located(node);
      out.push({ ...callOf(node.childForFieldName("function"), noScope), line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol });
    } else if (node.type === "decorator" && node.namedChildren[0]?.type !== "call") {
      // `@register` calls `register(fn)`.
      const at = located(node);
      out.push({ ...callOf(node.namedChildren[0] ?? null, noScope), line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol });
    }
    for (const c of node.namedChildren) walk(c);
  };
  for (const node of root.namedChildren) walk(node);
  return out;
}

/**
 * Functions read as values: `later(hit)`, `{"save": save}`, `callback=self.save`,
 * `mod.save` without a call. Code holding the value may call it. Names bound
 * in an enclosing `def` are locals, not the module's. `glob`: a `from m import *`
 * may bind any name, so every free name read is noted.
 */
function valueRefs(root: Node, names: ReadonlySet<string>, glob: boolean): ValueRefFact[] {
  const first = new Map<string, ValueRefFact>();
  const note = (name: string, node: Node, member: boolean): void => {
    const key = `${member ? "." : ""}${name}`;
    if (!first.has(key)) first.set(key, { name, ...(member ? { member: true as const } : {}), line: node.startPosition.row + 1, col: node.startPosition.column + 1 });
  };
  const walk = (node: Node, bound: ReadonlySet<string>): void => {
    if (node.type === "import_statement" || node.type === "import_from_statement" || node.type === "future_import_statement" || node.type === "type") return;
    if (node.type === "function_definition" || node.type === "lambda") bound = new Set([...bound, ...boundNames(node).keys()]);
    const parent = node.parent;
    if (node.type === "identifier" && parent && (glob || names.has(node.text)) && !bound.has(node.text) && !bindsOrCalls(node, parent)) note(node.text, node, false);
    // `@app.route` is called with the function, not read.
    if (node.type === "attribute" && parent && parent.type !== "decorator" && !(parent.type === "call" && parent.childForFieldName("function")?.id === node.id) && !assigned(node, parent)) {
      const member = node.childForFieldName("attribute")?.text;
      const object = node.childForFieldName("object");
      if (member) {
        note(member, node, true);
        // `order.place` of an imported module reads the module function itself.
        if (object?.type === "identifier" && names.has(object.text) && !bound.has(object.text)) note(`${object.text}.${member}`, node, false);
      }
    }
    for (const child of node.namedChildren) walk(child, bound);
  };
  walk(root, new Set());
  return [...first.values()];
}

/** The identifier is a callee, a declared name or a binding — not a value read. */
function bindsOrCalls(node: Node, parent: Node): boolean {
  const is = (field: string): boolean => parent.childForFieldName(field)?.id === node.id;
  if (parent.type === "call" && is("function")) return true;
  if (parent.type === "attribute") return true;
  if ((parent.type === "function_definition" || parent.type === "class_definition") && is("name")) return true;
  if ((parent.type === "typed_parameter" || parent.type === "default_parameter" || parent.type === "typed_default_parameter") && (is("name") || parent.namedChildren[0]?.id === node.id)) return true;
  if (BINDING_PARENTS.has(parent.type)) return true;
  if (assigned(node, parent)) return true;
  if ((parent.type === "for_statement" || parent.type === "for_in_clause") && is("left")) return true;
  return (parent.type === "keyword_argument" || parent.type === "named_expression") && is("name");
}

/** The node is the target of an assignment (`x = …`, `x += …`, `self.x = …`). */
function assigned(node: Node, parent: Node): boolean {
  return (parent.type === "assignment" || parent.type === "augmented_assignment") && parent.childForFieldName("left")?.id === node.id;
}

/**
 * `getattr(x, name)`, `importlib.import_module(name)`, `__import__(name)`,
 * `exec`/`eval`: what they reach is decided at run time. A `getattr` in a
 * `def` is a hole of that function's calls; the others may import anything.
 */
function collectDynamic(root: Node, facts: FileFacts): void {
  const walk = (node: Node): void => {
    if (node.type === "call") {
      const callee = node.childForFieldName("function")?.text;
      const symbol = enclosingFn(node);
      if (callee === "getattr") facts.unsupported.push({ ...unsupported(node, "`getattr` reads an attribute chosen at run time"), ...(symbol ? { symbol } : {}) });
      else if (callee === "importlib.import_module" || callee === "import_module" || callee === "__import__") facts.unsupported.push(unsupported(node, "dynamic import"));
      else if (callee === "exec" || callee === "eval") facts.unsupported.push(unsupported(node, `\`${callee}\` runs code keylang cannot read`));
    }
    for (const c of node.namedChildren) walk(c);
  };
  walk(root);
}

/** No `def` or `class` encloses the node: it is at the top of the module (possibly under `if`/`try`). */
function isDeclarationLevel(node: Node): boolean {
  for (let at = node.parent; at; at = at.parent) if (at.type === "function_definition" || at.type === "class_definition") return false;
  return true;
}

/**
 * The indexed fn whose body holds the node, as a dotted path (`place`,
 * `Order.save`, `Order.Line.price`); a `def` nested in a `def` belongs to
 * the outer one. Null at module level and in a class body outside methods.
 */
function enclosingFn(node: Node): string | null {
  const chain: Node[] = [];
  for (let at = node.parent; at; at = at.parent) if (at.type === "function_definition" || at.type === "class_definition") chain.unshift(at);
  const path: string[] = [];
  let last: Node | null = null;
  for (const def of chain) {
    // After a `def`, nested declarations are part of its body; after a class, only its direct members are indexed.
    if (last?.type === "function_definition") break;
    const holder = def.parent?.type === "decorated_definition" ? def.parent.parent : def.parent;
    if (last !== null && holder?.parent?.id !== last.id) break;
    path.push(def.childForFieldName("name")?.text ?? "?");
    last = def;
  }
  return last?.type === "function_definition" ? path.join(".") : null;
}

/**
 * Every import of the file, in source order, wherever it is written.
 * `import a.b as c` → `a.b` bound to `c`; `import a.b` → `a` bound to `a`
 * plus `a.b` bound to the path `a.b`; `from .m import x` → `.m.x` bound to `x`;
 * `from .m import *` → `.m.*`, which binds no name of its own.
 * `reexported(local)`: the name (null for `*`) is part of this module's public API.
 */
function importsIn(root: Node, reexported: (local: string | null) => boolean): ImportFact[] {
  const out: ImportFact[] = [];
  const walk = (node: Node): void => {
    if (node.type === "import_statement" || node.type === "import_from_statement") {
      out.push(...importsOf(node, reexported));
      return;
    }
    for (const c of node.namedChildren) walk(c);
  };
  walk(root);
  return out;
}

function importsOf(node: Node, reexported: (local: string | null) => boolean): ImportFact[] {
  const out: ImportFact[] = [];
  // Only a top-level import makes a public name; one inside a `def` binds a local.
  const top = isDeclarationLevel(node);
  const at = (source: string, bindings: ImportFact["bindings"], reexport = false): ImportFact => importAt(node, source, bindings, top && reexport);
  if (node.type === "import_statement") {
    for (const item of node.namedChildren) {
      if (item.type === "aliased_import") {
        const name = item.childForFieldName("name")?.text;
        const alias = item.childForFieldName("alias")?.text;
        // A module object: `alias.f()` is its function `f`, and `alias()` no call of anything.
        if (name && alias) out.push(at(name, [{ kind: "module", local: alias, namespace: true }], reexported(alias)));
      } else if (item.type === "dotted_name") {
        const head = item.text.split(".")[0]!;
        out.push(at(head, [{ kind: "module", local: head, namespace: true }], reexported(head)));
        // `a.b.f()` goes through the path; the dependency alias stays the module's own name.
        if (item.text !== head) out.push(at(item.text, [{ kind: "named", local: item.text, imported: item.text.slice(item.text.lastIndexOf(".") + 1) }]));
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
      out.push({ ...at(join("*"), [], reexported(null)), glob: true });
      named = true;
    } else if (item.type === "dotted_name") {
      out.push(at(join(item.text), [{ kind: "named", local: item.text, imported: item.text }], reexported(item.text)));
      named = true;
    } else if (item.type === "aliased_import") {
      const name = item.childForFieldName("name")?.text;
      const alias = item.childForFieldName("alias")?.text;
      if (name && alias) out.push(at(join(name), [{ kind: "named", local: alias, imported: name }], reexported(alias)));
      named = true;
    }
  }
  if (!named) out.push(at(from, []));
  return out;
}

function importAt(node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean): ImportFact {
  const at = located(node);
  return { source, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, bindings, reexport };
}

function unsupported(node: Node, reason: string): UnsupportedFact {
  const at = located(node);
  return { line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text.split("\n")[0]!, reason };
}

/** How many value nodes one statement, decorator or parameter call records at most: a big data literal stays `other`. */
const LITERAL_BUDGET = 2000;

/**
 * Module-level statements a framework may execute as its config: an
 * assignment (`x = …`, `x += …`, `a.b = …`) or a call statement whose value
 * has a call in it, the value as written (`LiteralValue`).
 */
function statementsOf(topLevel: readonly Node[]): StatementFact[] {
  const out: StatementFact[] = [];
  for (const node of topLevel) {
    const expr = node.type === "expression_statement" ? node.namedChildren[0] : undefined;
    if (!expr) continue;
    const at = located(node);
    if (expr.type === "call") {
      out.push({ target: null, value: literalOf(expr, { left: LITERAL_BUDGET }), line: at.line, col: at.col });
      continue;
    }
    if (expr.type !== "assignment" && expr.type !== "augmented_assignment") continue;
    const left = expr.childForFieldName("left");
    const right = expr.childForFieldName("right");
    if (!left || !right || !dottedName(left) || !hasCall(right)) continue;
    if (expr.type === "augmented_assignment" && expr.childForFieldName("operator")?.text !== "+=") continue;
    out.push({ target: left.text.replace(/\s+/g, ""), ...(expr.type === "augmented_assignment" ? { augmented: true as const } : {}), value: literalOf(right, { left: LITERAL_BUDGET }), line: at.line, col: at.col });
  }
  return out;
}

/** Calls written in the parameters of a `def`, defaults and annotations: `db = Depends(get_db)`. */
function noteParamCalls(def: Node, symbol: string, facts: FileFacts): void {
  for (const param of def.childForFieldName("parameters")?.namedChildren ?? []) {
    const name = param.type === "identifier" ? param.text : (param.childForFieldName("name") ?? param.namedChildren.find((c) => c.type === "identifier"))?.text;
    if (!name) continue;
    const walk = (node: Node): void => {
      if (node.type === "call") {
        const value = literalOf(node, { left: LITERAL_BUDGET });
        if (value.kind === "call") (facts.paramCalls ??= []).push({ symbol, param: name, value });
        return;
      }
      if (node.type === "lambda") return;
      for (const c of node.namedChildren) walk(c);
    };
    for (const c of param.namedChildren) walk(c);
  }
}

function hasCall(node: Node): boolean {
  if (node.type === "call") return true;
  if (node.type === "lambda") return false;
  return node.namedChildren.some(hasCall);
}

/** `a`, `a.b.c`: a name or a chain of attributes on a name. */
function dottedName(node: Node): boolean {
  if (node.type === "identifier") return true;
  if (node.type !== "attribute") return false;
  const object = node.childForFieldName("object");
  return object !== null && dottedName(object);
}

/** A value as written, within `budget` nodes; past it, `other`. */
function literalOf(node: Node, budget: { left: number }): LiteralValue {
  if (budget.left-- <= 0) return other(node);
  switch (node.type) {
    case "string": {
      if (node.namedChildren.some((c) => c.type === "interpolation")) return other(node);
      return { kind: "string", value: node.namedChildren.filter((c) => c.type === "string_content").map((c) => c.text).join("") };
    }
    case "concatenated_string": {
      const parts = node.namedChildren.map((c) => literalOf(c, budget));
      return parts.every((p) => p.kind === "string") ? { kind: "string", value: parts.map((p) => (p.kind === "string" ? p.value : "")).join("") } : other(node);
    }
    case "integer":
    case "float": {
      const value = Number(node.text.replace(/_/g, ""));
      return Number.isFinite(value) ? { kind: "number", value } : other(node);
    }
    case "true":
    case "false":
    case "none":
      return { kind: "name", value: node.text };
    case "identifier":
    case "attribute":
      return dottedName(node) ? { kind: "name", value: node.text.replace(/\s+/g, "") } : other(node);
    case "parenthesized_expression":
      return node.namedChildren.length === 1 ? literalOf(node.namedChildren[0]!, budget) : other(node);
    case "list":
    case "tuple":
    case "set":
      return { kind: "list", items: node.namedChildren.filter((c) => c.type !== "comment").map((c) => literalOf(c, budget)) };
    case "dictionary":
      return {
        kind: "dict",
        entries: node.namedChildren.filter((c) => c.type === "pair").map((pair) => {
          const key = pair.childForFieldName("key");
          const value = pair.childForFieldName("value");
          return { key: key ? literalOf(key, budget) : other(pair), value: value ? literalOf(value, budget) : other(pair) };
        }),
      };
    case "call": {
      const fn = node.childForFieldName("function");
      const args = node.childForFieldName("arguments");
      if (!fn || !dottedName(fn) || args?.type !== "argument_list") return other(node);
      const at = located(node);
      return { kind: "call", callee: fn.text.replace(/\s+/g, ""), ...argumentsOf(node, budget), line: at.line, col: at.col };
    }
    default:
      return other(node);
  }
}

/** The positional and keyword arguments of a call; a `*xs` or `**kw` is an `other` positional. */
function argumentsOf(call: Node, budget: { left: number }): { args: LiteralValue[]; kwargs: Kwarg[] } {
  const args: LiteralValue[] = [];
  const kwargs: Kwarg[] = [];
  const list = call.childForFieldName("arguments");
  for (const arg of list?.type === "argument_list" ? list.namedChildren : []) {
    if (arg.type === "comment") continue;
    if (arg.type === "keyword_argument") {
      const name = arg.childForFieldName("name")?.text;
      const value = arg.childForFieldName("value");
      if (name && value) kwargs.push({ name, value: literalOf(value, budget) });
      continue;
    }
    args.push(literalOf(arg, budget));
  }
  return { args, kwargs };
}

function other(node: Node): LiteralValue {
  const text = node.text.replace(/\s+/g, " ");
  return { kind: "other", text: text.length > 80 ? `${text.slice(0, 79)}…` : text };
}
