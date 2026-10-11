// `keylang wire`: `# wiring` + the snapshot → `keylang.gen.ts` (ADR 0003).
// One memoized builder per factory: a builder awaits its dependencies, then
// calls the factory (`new` for a class) with them, so every node is built
// once per `wire()` call, after what it needs, and only when some chosen
// branch needs it. Disposers run newest first; a failed build disposes what
// was built. The output depends only on specs and snapshot: same input,
// same bytes.
//
// A generator downstream of both pipelines: SpecIR wires plus the snapshot's
// nodes and exports. Entry point: `generateWire`; `WIRE_MARKER` is the first
// line by which a generated file is recognised.

import { createHash } from "node:crypto";
import { dirname, join, posix } from "node:path";
import { readJsonc } from "./imports.ts";
import { isJsonObject, isJsonString, type JsonObject } from "./json.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import type { Wire, WireDep } from "./spec-ir.ts";
import { wireImport, wireOrder, type WiringView } from "./wiring.ts";

/** The first line of a generated file: marks it as owned by `keylang wire`. */
export const WIRE_MARKER = "// keylang:generated — не редагувати, `keylang wire`";

/** What `generateWire` needs: the project root (for tsconfig), the output path, the wires and the snapshot. */
export interface WireInput {
  root: string;
  /** Output path relative to root, POSIX. */
  out: string;
  wires: readonly Wire[];
  snapshot: AnalysisSnapshot;
}

/** Local names of one ID in the generated file. */
interface Names {
  local: string;
  builder: string;
  build: string;
  cell: string;
  value: string;
}

/** The text of the generated wiring file; throws on a cycle or a factory the file could not import. */
export function generateWire(input: WireInput): string {
  const { snapshot, wires, out } = input;
  const order = wireOrder(wires);

  if ("cycle" in order) throw new Error(`wiring cycle ${order.cycle.join(" → ")}`);
  const byId = new Map(wires.map((w) => [w.target.target, w]));
  // Every ID that is built (wire targets, leaves, `when` branches) and every decorator.
  const built = new Set<string>(order.order);
  const decorators = new Set<string>();

  for (const w of wires) for (const d of w.deps) for (const c of d.compose) decorators.add(c.target.target);
  const imports = [...new Set([...built, ...decorators])].sort();
  // Kinds of every imported ID and of its parent, so `wireImport` can tell a static method from a fn.
  const kinds = new Map<string, string>();

  for (const id of [...imports, ...imports.map((id) => id.slice(0, id.lastIndexOf(".")))]) kinds.set(id, isClass(snapshot, id) ? "class" : (snapshot.nodes[id]?.kind ?? "missing"));
  const view: WiringView = { kinds, nodes: snapshot.nodes, exports: snapshot.exports };
  const names = localNames(imports);
  const name = (id: string): Names => names.get(id)!;
  const ext = importExtension(input.root);
  const lines: string[] = [WIRE_MARKER, ""];
  const byFile = new Map<string, { default: string | null; named: { name: string; local: string }[] }>();
  // A static method is called on its class, under the method's own local name for the class.
  const members = new Map<string, string>();
  const callee = (id: string): string => `${name(id).local}${members.has(id) ? memberAccess(members.get(id)!) : ""}`;

  // Resolve each ID to an import and group the imports by file.
  for (const id of imports) {
    if (!snapshot.nodes[id]?.file) throw new Error(`\`${id}\` is not in the snapshot`);
    // `check` reports the same as K302: the generator never writes an import that cannot load.
    const found = wireImport(view, id);

    if ("problem" in found) throw new Error(`\`${id}\` ${found.problem}`);

    if (found.member !== undefined) members.set(id, found.member);
    const entry = byFile.get(found.file) ?? { default: null, named: [] };

    // One default binding per import line; a second one (a class and its static method) is `default as`.
    if (found.name === "default" && entry.default === null) entry.default = name(id).local;
    else entry.named.push({ name: found.name, local: name(id).local });
    byFile.set(found.file, entry);
  }

  // One import line per file, sorted by path (code-unit order, not locale) for byte-stable output.
  for (const [file, entry] of [...byFile].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const named = entry.named.length > 0 ? `{ ${entry.named.map((n) => (n.name === n.local ? n.name : `${n.name} as ${n.local}`)).join(", ")} }` : null;
    lines.push(`import ${[entry.default, named].filter((part) => part !== null).join(", ")} from ${JSON.stringify(specifier(out, file, ext))};`);
  }

  // The runtime prelude of `wire()`: disposer tracking and release.
  const classes = new Set(imports.filter((id) => kinds.get(id) === "class"));
  lines.push(
    "",
    "type Env = Readonly<Record<string, string | undefined>>;",
    "",
    "/** Builds every `wire` of the specs once, dependencies first; `dispose()` releases them newest first. */",
    "// `globalThis.process`: the file type-checks without Node types and runs outside Node.",
    "export async function wire(env: Env = (globalThis as { process?: { env: Env } }).process?.env ?? {}) {",
    "  const disposers: (() => unknown)[] = [];",
    "  const track = <T>(value: T): T => {",
    "    const disposable = value as { dispose?: unknown } | null;",
    '    if (disposable !== null && (typeof disposable === "object" || typeof disposable === "function") && typeof disposable.dispose === "function") {',
    "      const dispose = disposable.dispose as () => unknown;",
    "      disposers.push(() => dispose.call(disposable));",
    "    }",
    "    return value;",
    "  };",
    "  // Every disposer runs, newest first; what they threw is returned.",
    "  const release = async (): Promise<unknown[]> => {",
    "    const errors: unknown[] = [];",
    "    for (const dispose of disposers.splice(0).reverse()) {",
    "      try {",
    "        await dispose();",
    "      } catch (error) {",
    "        errors.push(error);",
    "      }",
    "    }",
    "    return errors;",
    "  };",
    "  const disposeAll = async (): Promise<void> => {",
    "    const errors = await release();",
    '    if (errors.length > 0) throw new AggregateError(errors, "keylang wire: dispose failed");',
    "  };",
  );

  // One lazy builder per ID in dependency order: `cell` memoizes the promise,
  // so a node shared by several dependents is built once.
  for (const id of order.order) {
    const w = byId.get(id);
    const n = name(id);
    const args = w && w.deps.length > 0 ? `{ ${w.deps.map((d) => `${key(d.name)}: ${depValue(d, name, callee)}`).join(", ")} }` : "";
    const call = classes.has(id) ? `new ${n.local}(${args})` : `${callee(id)}(${args})`;
    lines.push(`  let ${n.cell}: ReturnType<typeof ${n.build}> | undefined;`);
    lines.push(`  const ${n.build} = async () => track(await ${call});`);
    lines.push(`  const ${n.builder} = () => (${n.cell} ??= ${n.build}());`);
  }

  // Build the wire targets in declaration order and return them by ID.
  const targets = wires.map((w) => w.target.target);
  lines.push(
    "  try {",
    ...targets.map((id) => `    const ${name(id).value} = await ${name(id).builder}();`),
    "    return {",
    ...targets.map((id) => `      ${JSON.stringify(id)}: ${name(id).value},`),
    "      dispose: disposeAll,",
    "    };",
    "  } catch (error) {",
    "    // A failed build leaves nothing half-open: what was built is disposed, newest first, and the build error stays first.",
    "    const errors = await release();",
    '    if (errors.length > 0) throw new AggregateError([error, ...errors], "keylang wire: a factory failed, then dispose failed");',
    "    throw error;",
    "  }",
    "}",
    "",
  );

  return lines.join("\n");
}

/** The value of one dependency: a `when` branch chosen from `env` (else the default), wrapped by `compose` innermost first. */
function depValue(d: WireDep, name: (id: string) => Names, callee: (id: string) => string): string {
  let value = `await ${name(d.target.target).builder}()`;
  const branches = d.when.map((when) => ({ env: when.env, value: when.value, id: when.target.target }));

  // Nest the branches from the last outwards, so the first `when` is tested first.
  for (const c of [...branches].reverse()) value = `env[${JSON.stringify(c.env)}] === ${JSON.stringify(c.value)} ? await ${name(c.id).builder}() : ${value}`;

  if (branches.length > 0) value = `(${value})`;

  // Each decorator wraps the previous result: the first listed is innermost.
  for (const c of d.compose) value = `${callee(c.target.target)}(${value})`;

  return value;
}

/** `.name`, or `["name"]` for a member name that is not an identifier. */
function memberAccess(member: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(member) ? `.${member}` : `[${JSON.stringify(member)}]`;
}

/** A class is a module node with the class marker. */
function isClass(snapshot: AnalysisSnapshot, id: string): boolean {
  const node = snapshot.nodes[id];

  return node?.kind === "module" && node.class === true;
}

/**
 * Identifiers for each ID: the ID with `_` for every character a JS name does
 * not take. IDs that collapse to one name (`a-b.f`, `a_b.f`, `a.b.f`) each
 * get a short hash of the ID, so a name does not change when an unrelated ID
 * comes or goes; the helpers derived from a name are unique as well.
 */
function localNames(ids: readonly string[]): Map<string, Names> {
  const base = (id: string): string => {
    const name = id.replace(/[^A-Za-z0-9_$]/g, "_");

    return /^[0-9]/.test(name) ? `_${name}` : name;
  };

  // Count how many IDs map to each base name, to know which need a hash suffix.
  const shared = new Map<string, number>();

  for (const id of ids) shared.set(base(id), (shared.get(base(id)) ?? 0) + 1);
  const derive = (local: string): Names => ({ local, builder: `build_${local}`, build: `build_${local}Build`, cell: `built_${local}`, value: `${local}Value` });
  const used = new Set<string>();
  const out = new Map<string, Names>();

  // Sorted so suffix choices do not depend on input order. Re-salt the hash
  // until none of the five derived names clashes with one already taken.
  for (const id of [...ids].sort()) {
    let local = shared.get(base(id))! > 1 ? `${base(id)}_${shortHash(id)}` : base(id);

    for (let salt = 1; Object.values(derive(local)).some((n) => used.has(n)); salt++) local = `${base(id)}_${shortHash(`${id}#${salt}`)}`;
    const names = derive(local);

    for (const n of Object.values(names)) used.add(n);
    out.set(id, names);
  }

  return out;
}

/** The first six hex digits of the SHA-256 of `text`: a stable disambiguator. */
function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 6);
}

/** An object key: bare when it is a JS identifier, else quoted. */
function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * How the project writes relative imports: `.ts` with `allowImportingTsExtensions`
 * or `rewriteRelativeImportExtensions`, `.js` under `node16`/`nodenext`
 * resolution, no extension otherwise (bundlers). Relative `extends` are followed.
 */
function importExtension(root: string): "ts" | "js" | "none" {
  const options = compilerOptions(join(root, "tsconfig.json"), 0);

  if (options.allowImportingTsExtensions === true || options.rewriteRelativeImportExtensions === true) return "ts";

  return NODE_RESOLUTION.test(moduleResolution(options)) ? "js" : "none";
}

/** The resolutions that require explicit runtime extensions in relative imports. */
const NODE_RESOLUTION = /^node(16|next)$/;

/** The module resolution tsc uses: the explicit one, else the one `module` implies (node16/node18/node20 → node16, nodenext → nodenext). */
function moduleResolution(options: JsonObject): string {
  if (options.moduleResolution !== undefined) return String(options.moduleResolution).toLowerCase();
  const module = String(options.module ?? "").toLowerCase();

  return /^node(16|18|20)$/.test(module) ? "node16" : module;
}

/** `compilerOptions` of a tsconfig over those of its relative `extends`; package configs are not read. */
function compilerOptions(file: string, depth: number): JsonObject {
  const config = readJsonc(file);

  // An unreadable config, or an `extends` chain deeper than five (likely a loop), contributes nothing.
  if (!isJsonObject(config) || depth > 5) return {};
  const extended = config.extends;
  const parents = isJsonString(extended) ? [extended] : Array.isArray(extended) ? extended.filter(isJsonString) : [];
  // Later layers win; `fromEntries` defines keys as a spread does, so a `__proto__` key stays a plain key.
  const layers = parents.flatMap((parent) => (parent.startsWith(".") ? [compilerOptions(join(dirname(file), parent.endsWith(".json") ? parent : `${parent}.json`), depth + 1)] : []));
  const own = config.compilerOptions;

  if (isJsonObject(own)) layers.push(own);

  return Object.fromEntries(layers.flatMap((layer) => Object.entries(layer)));
}

/** What a relative import names at run time for each source extension (`.mts` → `.mjs`); a bundler resolves the plain ones itself. */
const RUNTIME_EXTENSION = new Map(Object.entries({ ".ts": ".js", ".tsx": ".js", ".mts": ".mjs", ".cts": ".cjs", ".js": ".js", ".jsx": ".jsx", ".mjs": ".mjs", ".cjs": ".cjs" }));

/** The import specifier for `file` as seen from the output file, with the extension the project's resolution expects. */
function specifier(out: string, file: string, ext: "ts" | "js" | "none"): string {
  // A relative specifier must start with `./` or `../`, or it would be read as a package name.
  let rel = posix.relative(posix.dirname(out), file);

  if (!rel.startsWith("./") && !rel.startsWith("../")) rel = `./${rel}`;

  if (ext === "ts") return rel;
  const source = posix.extname(rel);
  const runtime = RUNTIME_EXTENSION.get(source);

  if (runtime === undefined) return rel;
  const stem = rel.slice(0, -source.length);

  if (ext === "js") return `${stem}${runtime}`;

  // Bundler resolution: drop the extensions a bundler adds itself; keep `.mjs`/`.cjs` style ones, which it does not.
  return source === ".ts" || source === ".tsx" || source === ".js" || source === ".jsx" ? stem : `${stem}${runtime}`;
}
