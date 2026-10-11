// Entry points of a repository without a framework adapter (ADR 0022 п. 5):
// only what the code and its manifests write down. `bin` of package.json and
// `[project.scripts]` of pyproject.toml are `cli`; `fn main` of a Rust bin
// target, a Python `if __name__ == "__main__":` block and a PHP script in
// `bin/` or `public/index.php` are `main`; an exported `GET`/`POST`/… of a
// Next.js `app/**/route.ts` and `app.get('/x', h)` with a literal path and a
// named handler are `route`. Each collector is a pure function of the facts,
// the graph and the manifest texts; a computed path or a handler keylang
// cannot name is no entry, and a framework's routes are its adapter's.
//
// Sits after the graph (source → FileFacts → graph → snapshot): the snapshot's
// `entries` come from `collectEntries`, and framework adapters place theirs
// with `entryScope` + `frameworkEntry`. `fnIn` resolves a written name to a fn ID.

import { parse as parseToml, type TomlTable, type TomlValue } from "smol-toml";
import type { FileFacts } from "./extract/facts.ts";
import type { Graph, Module } from "./graph.ts";
import { parseJsonc } from "./imports.ts";
import { isJsonObject, isJsonString, type JsonObject } from "./json.ts";
import type { EntryPoint } from "./snapshot.ts";

/** The manifests the collectors read, by POSIX path from the root; null when absent. */
export interface EntryManifests {
  "package.json": string | null;
  "pyproject.toml": string | null;
  "Cargo.toml": string | null;
}

/** The POSIX paths of the manifests entry points come from, in `snapshotId` with their text. */
export const ENTRY_MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml"] as const satisfies readonly (keyof EntryManifests)[];

/** What the collectors read: the graph, its facts, the manifests and a file-existence check. */
export interface EntryInputs {
  graph: Graph;
  facts: readonly FileFacts[];
  manifests: EntryManifests;
  /** Whether a root-relative POSIX path exists (a nested `Cargo.toml` beside a `src/main.rs`). */
  exists: (path: string) => boolean;
}

/** The graph with the facts it was built from, by file, and every fn by id: what resolves a written name to a fn and places it. */
export interface EntryScope {
  graph: Graph;
  facts: ReadonlyMap<string, FileFacts>;
  fns: ReadonlyMap<string, { file: string; line: number }>;
}

/** Index the graph for the collectors: facts by path, and every fn (nested modules included) by ID. */
export function entryScope(graph: Graph, facts: readonly FileFacts[]): EntryScope {
  const fns = new Map<string, { file: string; line: number }>();

  const visit = (module: Module): void => {
    for (const fn of module.fns) fns.set(fn.id, { file: fn.file ?? module.path ?? "", line: fn.line });

    for (const child of module.children) visit(child);
  };

  for (const layer of graph.layers) for (const module of layer.modules) visit(module);

  return { graph, facts: new Map(facts.map((file) => [file.path, file])), fns };
}

/** Where an entry's id is declared: the fn, else the module's file and first line. */
function placeOf(scope: EntryScope, id: string, fallback: { file: string; line: number }): { file: string; line: number } {
  const fn = scope.fns.get(id);

  // A fn with a known file, else a module with a path, else where the fact was written.
  if (fn !== undefined && fn.file !== "") return fn;
  const module = scope.graph.modules.get(id);

  return module?.path != null ? { file: module.path, line: module.line ?? 1 } : fallback;
}

/** An entry a framework adapter found: placed like a language-level one, with its framework's name. */
export function frameworkEntry(scope: EntryScope, framework: string, kind: EntryPoint["kind"], id: string, label: string, source: string, fallback: { file: string; line: number }): EntryPoint {
  return { ...entry(scope, kind, id, label, source, fallback), framework };
}

/** A fn's place for the entry, with the manifest or the code position the fact is written at as `source`. */
function entry(scope: EntryScope, kind: EntryPoint["kind"], id: string, label: string, source: string, fallback: { file: string; line: number }): EntryPoint {
  const place = placeOf(scope, id, fallback);

  return { kind, id, label, framework: null, file: place.file, line: place.line, source };
}

/** Every language-level entry point of the inputs, in a deterministic order: kind, label, id. */
export function collectEntries(inputs: EntryInputs): EntryPoint[] {
  const { graph, facts, manifests } = inputs;
  const scope = entryScope(graph, facts);

  const entries = [
    ...binEntries(manifests["package.json"], scope),
    ...nextRouteEntries(facts, scope),
    ...expressRouteEntries(facts, scope),
    ...pythonMainEntries(facts, scope),
    ...pyprojectScriptEntries(manifests["pyproject.toml"], scope),
    ...rustMainEntries(facts, scope, manifests["Cargo.toml"], inputs.exists),
    ...phpScriptEntries(facts, scope),
  ];

  // Drop exact duplicates (same kind, label, ID and place), then sort so the
  // snapshot lists entries in the same order on every run.
  const seen = new Set<string>();

  return entries
    .filter((entry) => {
      const key = `${entry.kind}\u0000${entry.label}\u0000${entry.id}\u0000${entry.file}:${entry.line}`;

      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    })
    .sort(compareEntries);
}

/** The entry order of the snapshot: kind, label, ID, file, line. */
export function compareEntries(a: EntryPoint, b: EntryPoint): number {
  return cmp(a.kind, b.kind) || cmp(a.label, b.label) || cmp(a.id, b.id) || cmp(a.file, b.file) || a.line - b.line;
}

/** `bin` of the root package.json: `"bin": "cli.js"` (named after the package) or `"bin": {name: path}`. Paths are POSIX, relative to the manifest. */
export function binTargets(packageJson: string | null): { name: string; path: string }[] {
  const manifest = packageJson === null ? null : parseJsonc(packageJson);

  if (!isParsedJsonObject(manifest)) return [];
  const bin = manifest.bin;
  const out: { name: string; path: string }[] = [];

  // The string form is named after the package, without its npm scope.
  if (isJsonString(bin)) {
    const name = isJsonString(manifest.name) ? manifest.name.replace(/^@[^/]+\//, "") : null;

    if (name !== null) out.push({ name, path: normalizePath(bin) });
  } else if (isJsonObject(bin)) {
    for (const [name, path] of Object.entries(bin)) if (isJsonString(path)) out.push({ name, path: normalizePath(path) });
  }

  return out;
}

/**
 * The source file a `bin` path names: itself when the graph has it, else the
 * TypeScript source of a JavaScript path in the same place (`bin/cli.js` →
 * `bin/cli.ts`). A built file outside the sources resolves to nothing.
 */
export function binSource(path: string, has: (path: string) => boolean): string | null {
  // The path itself first, then each JS extension's TypeScript twin.
  const candidates = [path, path.replace(/\.js$/, ".ts"), path.replace(/\.mjs$/, ".mts"), path.replace(/\.cjs$/, ".cts"), path.replace(/\.js$/, ".tsx")];

  return candidates.find(has) ?? null;
}

/** `cli` entries from package.json `bin`, one per name whose file has a source in the graph. */
function binEntries(packageJson: string | null, scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const { name, path } of binTargets(packageJson)) {
    const file = binSource(path, (candidate) => scope.graph.byPath.has(candidate));

    if (file === null) continue;
    const module = scope.graph.byPath.get(file)!;
    // The exported `main`, else the default export when it is a fn, else the module's top level.
    const main = fnIn(scope, file, "main");
    const defaultExport = scope.graph.exports.find((row) => row.module === module.id && row.name === "default" && row.kind === "fn")?.symbol ?? null;
    out.push(entry(scope, "cli", main ?? defaultExport ?? module.id, name, "package.json", { file, line: module.line ?? 1 }));
  }

  return out;
}

/** HTTP methods a Next.js route handler file exports, one handler each. */
const NEXT_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** A `route.<ext>` file under an `app/` directory; group 1 is the path between `app/` and the file. */
const NEXT_ROUTE_FILE = /(?:^|\/)app\/(.*?)(?:\/)?route\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * The URL path of a Next.js `app/**\/route.ts`: the directories after `app/`,
 * without route groups (`(marketing)`); `/` for the root handler. Null for a
 * file that is no route handler.
 */
export function nextRoutePath(file: string): string | null {
  const match = NEXT_ROUTE_FILE.exec(file);

  if (match === null) return null;
  // Route groups `(name)` organise files but add nothing to the URL.
  const segments = (match[1] ?? "").split("/").filter((segment) => segment !== "" && !/^\(.*\)$/.test(segment));

  return `/${segments.join("/")}`;
}

/** `route` entries for the HTTP-method handlers a Next.js route file exports. */
function nextRouteEntries(facts: readonly FileFacts[], scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const file of facts) {
    const path = nextRoutePath(file.path);

    if (path === null) continue;

    // Handlers declared in the file itself.
    for (const decl of file.decls) {
      if (decl.kind !== "fn" || !decl.exported || !NEXT_METHODS.has(decl.name)) continue;
      const id = fnIn(scope, file.path, decl.name);

      if (id !== null) out.push(entry(scope, "route", id, `${decl.name} ${path}`, `${file.path}:${decl.line}`, { file: file.path, line: decl.line }));
    }

    // `export { GET } from "./handlers"` or `export const GET = handler`: the name stands for a fn elsewhere.
    for (const row of file.exportRows) {
      if (!NEXT_METHODS.has(row.name) || file.decls.some((decl) => decl.name === row.name && decl.kind === "fn")) continue;
      const module = scope.graph.byPath.get(file.path);
      const symbol = module === undefined ? null : (scope.graph.exports.find((entry) => entry.module === module.id && entry.name === row.name && entry.kind === "fn")?.symbol ?? null);

      if (symbol !== null) out.push(entry(scope, "route", symbol, `${row.name} ${path}`, `${file.path}:${module?.line ?? 1}`, { file: file.path, line: module?.line ?? 1 }));
    }
  }

  return out;
}

/** `route` entries for `app.get('/x', h)`-style registrations the frontend recorded with a literal path and a named handler. */
function expressRouteEntries(facts: readonly FileFacts[], scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const file of facts) {
    for (const fact of file.entries ?? []) {
      if (fact.kind !== "route" || fact.callee === null) continue;
      const id = fnIn(scope, file.path, fact.callee);

      if (id !== null) out.push(entry(scope, "route", id, fact.label, `${file.path}:${fact.line}`, { file: file.path, line: fact.line }));
    }
  }

  return out;
}

/** `main` entries for Python `if __name__ == "__main__":` blocks: the fn the block calls, else the module. */
function pythonMainEntries(facts: readonly FileFacts[], scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const file of facts) {
    for (const fact of file.entries ?? []) {
      if (fact.kind !== "main") continue;
      const module = scope.graph.byPath.get(file.path);

      if (module === undefined) continue;
      const id = fact.callee === null ? null : fnIn(scope, file.path, fact.callee);
      out.push(entry(scope, "main", id ?? module.id, file.path, `${file.path}:${fact.line}`, { file: file.path, line: fact.line }));
    }
  }

  return out;
}

/** `[project.scripts]` of pyproject.toml: script name → `pkg.module:func` (or `pkg.module` alone). Empty for no manifest or an unreadable one. */
export function pyprojectScripts(pyproject: string | null): { name: string; module: string; fn: string | null }[] {
  if (pyproject === null) return [];
  let parsed: TomlTable;

  try {
    parsed = parseToml(pyproject);
  } catch {
    return [];
  }

  // Only `[project.scripts]` with string values; anything else is ignored.
  const project = parsed.project;
  const scripts = isTomlTable(project) && isTomlTable(project.scripts) ? project.scripts : null;

  if (scripts === null) return [];
  const out: { name: string; module: string; fn: string | null }[] = [];

  for (const [name, target] of Object.entries(scripts)) {
    if (!isTomlString(target)) continue;
    // `pkg.module:func`; without `:` the script runs the module itself.
    const [module, fn] = target.split(":", 2);

    if (module === undefined || module === "") continue;
    out.push({ name, module: module.trim(), fn: fn === undefined || fn.trim() === "" ? null : fn.trim() });
  }

  return out;
}

/** The source file of a dotted Python module name, at the root or under `src/`: `pkg.cli` → `pkg/cli.py`, `pkg/cli/__init__.py`, `src/pkg/cli.py`, … */
export function pythonModuleFile(module: string, has: (path: string) => boolean): string | null {
  const stem = module.split(".").join("/");
  const candidates = [`${stem}.py`, `${stem}/__init__.py`, `src/${stem}.py`, `src/${stem}/__init__.py`];

  return candidates.find(has) ?? null;
}

/** `cli` entries for pyproject.toml scripts whose module is a file of the graph. */
function pyprojectScriptEntries(pyproject: string | null, scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const script of pyprojectScripts(pyproject)) {
    const file = pythonModuleFile(script.module, (path) => scope.graph.byPath.has(path));

    if (file === null) continue;
    const module = scope.graph.byPath.get(file)!;
    const id = script.fn === null ? null : fnIn(scope, file, script.fn);
    out.push(entry(scope, "cli", id ?? module.id, script.name, "pyproject.toml", { file, line: module.line ?? 1 }));
  }

  return out;
}

/** A Cargo bin target path; group 1 is the crate directory (with trailing `/`, or empty at the root). */
const RUST_BIN_FILE = /^(.*?)src\/(?:main\.rs|bin\/[^/]+\.rs|bin\/[^/]+\/main\.rs)$/;

/**
 * Whether a Rust file is a bin target by Cargo's layout: `src/main.rs`,
 * `src/bin/<name>.rs` or `src/bin/<name>/main.rs` of a crate (a `Cargo.toml`
 * beside its `src/`), or a `[[bin]] path` of the root manifest.
 */
export function rustBinTarget(file: string, cargoToml: string | null, exists: (path: string) => boolean): boolean {
  const match = RUST_BIN_FILE.exec(file);

  // Cargo's default layout counts only when a manifest sits beside `src/`.
  if (match !== null && exists(`${match[1] ?? ""}Cargo.toml`)) return true;

  if (cargoToml === null) return false;
  let parsed: TomlTable;

  try {
    parsed = parseToml(cargoToml);
  } catch {
    return false;
  }

  // Otherwise an explicit `[[bin]]` table of the root manifest may name the file.
  const bins = Array.isArray(parsed.bin) ? parsed.bin : [];

  return bins.some((bin) => isTomlTable(bin) && isTomlString(bin.path) && normalizePath(bin.path) === file);
}

/** `main` entries for `fn main` of each Rust bin target. */
function rustMainEntries(facts: readonly FileFacts[], scope: EntryScope, cargoToml: string | null, exists: (path: string) => boolean): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const file of facts) {
    if (!file.path.endsWith(".rs") || !rustBinTarget(file.path, cargoToml, exists)) continue;
    const main = file.decls.find((decl) => decl.kind === "fn" && decl.name === "main");

    if (main === undefined) continue;
    const id = fnIn(scope, file.path, "main");

    if (id !== null) out.push(entry(scope, "main", id, file.path, `${file.path}:${main.line}`, { file: file.path, line: main.line }));
  }

  return out;
}

/** The places a PHP file runs as a script from: `bin/<name>.php` or `public/index.php`. */
const PHP_SCRIPT = /^(?:bin\/[^/]+\.php|public\/index\.php)$/;

/** A PHP file run as a script, by its place: `bin/*.php` or `public/index.php`, with code at its top level. A class in `bin/` is a declaration, not a script. */
export function phpScript(file: Pick<FileFacts, "path" | "decls" | "moduleCalls">): boolean {
  return PHP_SCRIPT.test(file.path) && (file.decls.length === 0 || file.moduleCalls.length > 0);
}

/** `main` entries for PHP scripts; the entry is the file's module, since a script has no main fn. */
function phpScriptEntries(facts: readonly FileFacts[], scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];

  for (const file of facts) {
    if (!phpScript(file)) continue;
    const module = scope.graph.byPath.get(file.path);

    if (module !== undefined) out.push(entry(scope, "main", module.id, file.path, `${file.path}:${module.line ?? 1}`, { file: file.path, line: module.line ?? 1 }));
  }

  return out;
}

/**
 * The fn a name written in `file` stands for: a fn declared there (`h`, or
 * `Class.method`), or one imported under that name (`import { h } from
 * "./handlers"`, `import handlers from`; `handlers.save` through a module
 * import). Null when the graph does not resolve it: a name is no fn until
 * the code shows one.
 */
export function fnIn(scope: EntryScope, file: string, name: string): string | null {
  const module = scope.graph.byPath.get(file);

  if (module === undefined) return null;
  const [head, ...rest] = name.split(".");

  if (head === undefined || head === "") return null;

  // A bare name: a fn declared in this file (by its written name), else an import.
  if (rest.length === 0) {
    const own = module.fns.find((fn) => (fn.written ?? fn.name) === head && (fn.file === null || fn.file === file));

    if (own !== undefined) return own.id;

    return importedSymbol(scope, module, file, head, null);
  }

  // `Head.member`: a method of a class declared in this file, else a member
  // of a module import. Longer paths are not resolved.
  if (rest.length === 1) {
    const member = rest[0]!;
    const cls = module.children.find((child) => child.class && child.name === head && (child.path === null || child.path === file));
    const method = cls?.fns.find((fn) => (fn.written ?? fn.name) === member);

    if (method !== undefined) return method.id;

    return importedSymbol(scope, module, file, head, member);
  }

  return null;
}

/** The symbol an import of `file` binds `local` to; with `member`, the export of a module import (`ns.member`). */
function importedSymbol(scope: EntryScope, module: Module, file: string, local: string, member: string | null): string | null {
  const facts = scope.facts.get(file);

  if (facts === undefined) return null;

  for (const imp of facts.imports) {
    for (const binding of imp.bindings) {
      if (binding.local !== local) continue;
      // The export name to look up: the member for a namespace import,
      // `default` or the imported name for a plain one. A namespace without a
      // member, or a named binding with one, cannot name a fn.
      const exported = binding.kind === "module" ? member : member === null ? (binding.kind === "default" ? "default" : binding.imported) : null;

      if (exported === null) continue;

      // One dep stands for every import of a target from the file: by position, else by the statement, else by the specifier.
      const dep =
        module.deps.find((d) => d.file === file && d.line === imp.line && d.col === imp.col) ??
        module.deps.find((d) => d.file === file && d.text === imp.text) ??
        module.deps.find((d) => d.file === file && (d.text.includes(`"${imp.source}"`) || d.text.includes(`'${imp.source}'`)));

      if (dep === undefined) continue;
      // Only a fn or a value export can be a handler; a class or a type cannot.
      const row = scope.graph.exports.find((entry) => entry.module === dep.target && entry.name === exported);

      if (row?.symbol != null && (row.kind === "fn" || row.kind === "value")) return row.symbol;
    }
  }

  return null;
}

/** A manifest path in POSIX form without a leading `./`. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** A JSON object out of `parseJsonc`, which returns what `JSON.parse` does, or null for unreadable text. */
function isParsedJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A TOML table: an object that is neither an array nor a date. */
function isTomlTable(value: TomlValue | undefined): value is TomlTable {
  return value !== undefined && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

/** A TOML string value. */
function isTomlString(value: TomlValue | undefined): value is string {
  return typeof value === "string";
}

/** Plain code-unit order, independent of locale. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
