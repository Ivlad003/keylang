// Rust facts: items, `impl` members, `use` trees, calls. A `use` leaf is one
// import whose specifier is the full path (`crate::domain::order::place`);
// the resolver decides how much of it is a module. Calls through values,
// traits and macros are not guessed: they stay holes in coverage.

import type { CallFact, DeclFact, ExportRow, FileFacts, ImportFact, UnsupportedFact } from "./facts.ts";
import { errorLine, fingerprint, located, withTree, type Node } from "./treesitter.ts";

/** Macros of `std` and common logging: they expand to calls keylang need not follow. */
const KNOWN_MACROS = new Set(
  "assert assert_eq assert_ne debug_assert debug_assert_eq debug_assert_ne cfg column compile_error concat dbg env eprint eprintln file format format_args include include_bytes include_str line matches module_path option_env panic print println stringify thread_local todo unimplemented unreachable vec write writeln trace debug info warn error anyhow bail ensure".split(" "),
);

/** Primitive types: `u64::from()` is the language's, not a module path. */
const PRIMITIVES = new Set("bool char str f32 f64 i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize".split(" "));

const TYPE_ITEMS: Record<string, DeclFact["kind"]> = { struct_item: "class", enum_item: "class", union_item: "class", trait_item: "type", type_item: "type" };

export function extractRust(path: string, src: string): Promise<FileFacts> {
  return withTree("rust", src, (tree) => extractTree(path, tree.rootNode));
}

function extractTree(path: string, root: Node): FileFacts {
  const facts: FileFacts = { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "complete", parseError: null };
  const impls: { type: string; node: Node; members: DeclFact[] }[] = [];
  const items = root.namedChildren.filter((node) => !testOnly(node));
  // Imports first: a call path resolves against every `use` of the file, wherever it is written.
  for (const node of items) {
    const exported = node.namedChildren.some((c) => c.type === "visibility_modifier");
    if (node.type === "use_declaration") {
      for (const leaf of useLeaves(node.childForFieldName("argument"), [])) facts.imports.push(useImport(node, leaf, exported, facts));
    } else if (node.type === "extern_crate_declaration") {
      const name = node.childForFieldName("name")?.text;
      if (name) facts.imports.push(importAt(node, name, [{ kind: "named", local: node.childForFieldName("alias")?.text ?? name, imported: name }], false));
    }
  }
  // Item names a call path may start with; a `mod` name starts a path to that module's file.
  const names = new Set(items.filter((node) => node.type !== "mod_item" || node.childForFieldName("body") !== null).map((node) => node.childForFieldName("name")?.text).filter((name) => name !== undefined));
  for (const binding of facts.imports.flatMap((imp) => imp.bindings)) names.add(binding.local);
  for (const node of items) {
    const exported = node.namedChildren.some((c) => c.type === "visibility_modifier");
    const name = node.childForFieldName("name")?.text;
    switch (node.type) {
      case "function_item":
        if (!name) break;
        facts.decls.push(fnDecl(node, name, exported, null, names, facts));
        if (exported) exportRow(facts, name, "fn");
        break;
      case "struct_item":
      case "enum_item":
      case "union_item":
      case "trait_item":
      case "type_item": {
        if (!name) break;
        const kind = TYPE_ITEMS[node.type]!;
        const at = located(node);
        facts.decls.push({ kind, name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature: null, exported, calls: [], types: [], members: [], fingerprint: fingerprint(node) });
        if (exported) exportRow(facts, name, kind === "class" ? "class" : "type");
        break;
      }
      case "const_item":
      case "static_item":
        if (name && exported) exportRow(facts, name, "value");
        break;
      case "impl_item": {
        const type = baseType(node.childForFieldName("type"));
        if (!type) {
          facts.unsupported.push(unsupported(node, "`impl` for a type keylang cannot name"));
          break;
        }
        const members: DeclFact[] = [];
        for (const item of node.childForFieldName("body")?.namedChildren ?? []) {
          const member = item.childForFieldName("name")?.text;
          if (item.type !== "function_item" || !member) continue;
          members.push(fnDecl(item, member, item.namedChildren.some((c) => c.type === "visibility_modifier"), type, names, facts));
        }
        impls.push({ type, node, members });
        break;
      }
      case "mod_item":
        // `mod x;` names the file `x.rs`; the dependency is whatever code uses from it.
        if (node.childForFieldName("body")) facts.unsupported.push(unsupported(node, `inline module \`${name ?? "?"}\` is not indexed`));
        break;
      case "macro_invocation":
        facts.unsupported.push(unsupported(node, `macro \`${macroName(node)}!\` at module level is not expanded`));
        break;
    }
  }
  for (const impl of impls) {
    const owner = facts.decls.find((d) => d.kind === "class" && d.name === impl.type);
    if (owner) owner.members.push(...impl.members);
    else facts.unsupported.push(unsupported(impl.node, `\`impl ${impl.type}\` for a type declared in another file`));
  }
  const end = located(root);
  facts.endLine = end.endLine;
  facts.endCol = end.endCol;
  if (root.hasError) {
    facts.completeness = "opaque";
    facts.parseError = { line: errorLine(root), reason: "syntax error" };
  }
  return facts;
}

/** An item under `#[cfg(test)]`: test code, kept out of the map like test files. */
function testOnly(node: Node): boolean {
  for (let prev = node.previousNamedSibling; prev?.type === "attribute_item"; prev = prev.previousNamedSibling) {
    if (/^#\[cfg\(test\)\]$/.test(prev.text.replace(/\s+/g, ""))) return true;
  }
  return false;
}

function exportRow(facts: FileFacts, name: string, kind: ExportRow["kind"]): void {
  facts.exports.add(name);
  facts.exportRows.push({ name, kind, local: null });
}

/** `Gen<T>` → `Gen`, `crate::a::S` → `S`; null for references, tuples and the like. */
function baseType(node: Node | null): string | null {
  if (!node) return null;
  if (node.type === "type_identifier") return node.text;
  if (node.type === "generic_type") return baseType(node.childForFieldName("type"));
  if (node.type === "scoped_type_identifier") return node.childForFieldName("name")?.text ?? null;
  return null;
}

function fnDecl(node: Node, name: string, exported: boolean, owner: string | null, names: ReadonlySet<string>, facts: FileFacts): DeclFact {
  const at = located(node);
  const params = node.childForFieldName("parameters");
  const returns = node.childForFieldName("return_type");
  const signature = params ? `${params.text.replace(/\s+/g, " ")}${returns ? ` → ${returns.text.replace(/\s+/g, " ")}` : ""}` : null;
  const self = params?.namedChildren.some((c) => c.type === "self_parameter") ?? false;
  const body = node.childForFieldName("body");
  const calls = body ? bodyCalls(body, { owner, self, bound: boundNames(node), names }, facts) : [];
  const decl: DeclFact = { kind: "fn", name, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, signature, exported, calls, types: [], members: [], fingerprint: fingerprint(node) };
  // An associated function without `self` is called on the type: `S::new()`.
  if (owner !== null && !self) decl.static = true;
  return decl;
}

/** Parameter and `let` names in a function: a call through one of them is a call through a value. */
function boundNames(fn: Node): Map<string, "parameter" | "local"> {
  const out = new Map<string, "parameter" | "local">();
  const names = (pattern: Node | null, kind: "parameter" | "local"): void => {
    if (!pattern) return;
    if (pattern.type === "identifier") out.set(pattern.text, kind);
    // `Some(x)`, `Point { x, .. }`: the constructor is not a binding.
    else for (const c of pattern.namedChildren) if (c.type !== "type_identifier" && c.type !== "scoped_identifier" && c !== pattern.childForFieldName("type")) names(c, kind);
  };
  for (const p of fn.childForFieldName("parameters")?.namedChildren ?? []) if (p.type === "parameter") names(p.childForFieldName("pattern"), "parameter");
  const walk = (node: Node): void => {
    if (node.type === "let_declaration") names(node.childForFieldName("pattern"), "local");
    if (node.type === "closure_parameters") for (const c of node.namedChildren) names(c, "parameter");
    for (const c of node.namedChildren) walk(c);
  };
  const body = fn.childForFieldName("body");
  if (body) walk(body);
  return out;
}

/** Where a call is written: the `impl` type, whether the fn takes `self`, its bound names, and the file's item and import names. */
interface CallScope {
  owner: string | null;
  self: boolean;
  bound: ReadonlyMap<string, "parameter" | "local">;
  names: ReadonlySet<string>;
}

function bodyCalls(body: Node, scope: CallScope, facts: FileFacts): CallFact[] {
  const out: CallFact[] = [];
  const walk = (node: Node, closure: boolean): void => {
    if (node.type === "call_expression") {
      const fact = callOf(node.childForFieldName("function"), scope, facts);
      if (fact) {
        const at = located(node);
        out.push({ ...fact, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, ...(closure ? { closure: true as const } : {}) });
      }
    } else if (node.type === "macro_invocation") {
      const name = macroName(node);
      // `serde_json::json!` comes from another crate; a macro of this crate (`ui_message!`, `crate::m!`) hides calls.
      const foreign = name.includes("::") && !/^(crate|self|super)::/.test(name);
      if (!KNOWN_MACROS.has(name) && !foreign) facts.unsupported.push(unsupported(node, `macro \`${name}!\` is not expanded`));
    }
    const inner = closure || node.type === "closure_expression" || node.type === "async_block";
    for (const c of node.namedChildren) walk(c, inner);
  };
  walk(body, false);
  return out;
}

type Callee = Pick<CallFact, "callee" | "bound">;

/**
 * `f()` → `f`; `a::b::f()` → `a.b.f`; `Self::new()` → `<Type>.new`;
 * `self.m()` → `this.m`; `x.m()` → `x.m` (through a value). A path that
 * starts at `crate`, `super`, `self` or a lower-case name keylang does not
 * know imports what it names: the call is an edge to that module's item.
 * A last segment in `CamelCase` (`Some(x)`, `Event::Progress(p)`) is an
 * enum variant or a tuple struct by the naming convention: no call.
 */
function callOf(fn: Node | null, scope: CallScope, facts: FileFacts): Callee | null {
  if (!fn) return null;
  const { owner, self, bound, names } = scope;
  if (fn.type === "generic_function") return callOf(fn.childForFieldName("function"), scope, facts);
  if (fn.type === "identifier") {
    if (/^[A-Z]/.test(fn.text)) return null;
    const kind = bound.get(fn.text);
    return kind ? { callee: fn.text, bound: kind } : { callee: fn.text };
  }
  if (fn.type === "field_expression") {
    const value = fn.childForFieldName("value");
    const field = fn.childForFieldName("field")?.text;
    if (!value || !field) return null;
    if (value.type === "self") return self && owner !== null ? { callee: `this.${field}` } : null;
    if (value.type !== "identifier") return null;
    return { callee: `${value.text}.${field}`, bound: bound.get(value.text) ?? "local" };
  }
  if (fn.type !== "scoped_identifier") return null;
  const segments = pathSegments(fn);
  if (!segments) return null;
  const [head, ...rest] = segments;
  if (/^[A-Z]/.test(segments.at(-1)!)) return null;
  if (PRIMITIVES.has(head!)) return { callee: segments.join(".") };
  if (head === "Self" && owner !== null) return { callee: [owner, ...rest].join(".") };
  if (head === "self" && rest.length === 1) return { callee: rest[0]! };
  if (head === "crate" || head === "super" || head === "self" || (/^[a-z_]/.test(head!) && !bound.has(head!) && !names.has(head!))) {
    // The path is its own import: the call site names the module, or a type in it (`a::Message::raw` → `Message.raw`).
    const type = segments.findIndex((segment, i) => i > 0 && /^[A-Z]/.test(segment));
    const path = type === -1 ? segments : segments.slice(0, type + 1);
    const source = path.join("::");
    if (!facts.imports.some((imp) => imp.source === source && imp.bindings.some((b) => b.local === source))) {
      const at = located(fn);
      facts.imports.push({ source, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, bindings: [{ kind: "named", local: source, imported: path.at(-1)! }], reexport: false });
    }
    return { callee: [source, ...segments.slice(path.length)].join(".") };
  }
  return { callee: segments.join(".") };
}

/** `a::b::c` → `["a", "b", "c"]`; null when a segment is not a plain name (`<T as X>::f`). */
function pathSegments(node: Node): string[] | null {
  if (node.type === "identifier" || node.type === "crate" || node.type === "self" || node.type === "super" || node.type === "type_identifier") return [node.text];
  if (node.type !== "scoped_identifier" && node.type !== "scoped_type_identifier") return null;
  const name = node.childForFieldName("name");
  const path = node.childForFieldName("path");
  if (!name) return null;
  if (!path) return [name.text];
  const head = pathSegments(path);
  return head ? [...head, name.text] : null;
}

interface UseLeaf {
  path: string[];
  alias: string | null;
  glob: boolean;
}

/** Flatten a `use` tree: `a::{b, c::d as e, f::*}` → `a::b`, `a::c::d` as `e`, `a::f::*`. */
function useLeaves(node: Node | null, prefix: string[]): UseLeaf[] {
  if (!node) return [];
  switch (node.type) {
    case "use_as_clause": {
      const path = node.childForFieldName("path");
      const segments = path ? pathSegments(path) : null;
      return segments ? [{ path: [...prefix, ...segments], alias: node.childForFieldName("alias")?.text ?? null, glob: false }] : [];
    }
    case "use_list":
      return node.namedChildren.flatMap((c) => useLeaves(c, prefix));
    case "scoped_use_list": {
      const path = node.childForFieldName("path");
      const segments = path ? pathSegments(path) : [];
      return segments ? useLeaves(node.childForFieldName("list"), [...prefix, ...segments]) : [];
    }
    case "use_wildcard": {
      const path = node.namedChildren[0];
      const segments = path ? pathSegments(path) : [];
      return segments ? [{ path: [...prefix, ...segments], alias: null, glob: true }] : [];
    }
    case "self":
      // `a::{self}` is the module `a`.
      return prefix.length > 0 ? [{ path: prefix, alias: null, glob: false }] : [];
    default: {
      const segments = pathSegments(node);
      if (!segments) return [];
      const path = [...prefix, ...segments];
      // `use a::b::self` (rare, but valid) is `a::b`.
      return [{ path: path.at(-1) === "self" ? path.slice(0, -1) : path, alias: null, glob: false }];
    }
  }
}

function useImport(node: Node, leaf: UseLeaf, exported: boolean, facts: FileFacts): ImportFact {
  const source = leaf.path.join("::");
  if (leaf.glob) {
    if (exported) facts.reexportsAll.push(source);
    return importAt(node, source, [], exported);
  }
  const imported = leaf.path.at(-1)!;
  const local = leaf.alias ?? imported;
  if (exported && local !== "_") exportRow(facts, local, "reexport");
  return importAt(node, source, local === "_" ? [] : [{ kind: "named", local, imported }], exported);
}

function importAt(node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean): ImportFact {
  const at = located(node);
  return { source, line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text, bindings, reexport };
}

function macroName(node: Node): string {
  return node.childForFieldName("macro")?.text ?? node.namedChildren[0]?.text ?? "?";
}

function unsupported(node: Node, reason: string): UnsupportedFact {
  const at = located(node);
  return { line: at.line, col: at.col, endLine: at.endLine, endCol: at.endCol, text: at.text.split("\n")[0]!, reason };
}
