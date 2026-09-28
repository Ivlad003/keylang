// `keylang wire`: `# wiring` + the snapshot → `keylang.gen.ts` (ADR 0003).
// One memoized builder per factory: a builder awaits its dependencies, then
// calls the factory (`new` for a class) with them, so every node is built
// once per `wire()` call, after what it needs, and only when some chosen
// branch needs it. Disposers run newest first; a failed build disposes what
// was built. The output depends only on specs and snapshot: same input,
// same bytes.

import { createHash } from "node:crypto";
import { dirname, join, posix } from "node:path";
import { readJsonc } from "./imports.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { wireImport, wireOrder, type Wire, type WireDep, type WiringView } from "./wiring.ts";

export const WIRE_MARKER = "// keylang:generated — не редагувати, `keylang wire`";

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

export function generateWire(input: WireInput): string {
  const { snapshot, wires, out } = input;
  const order = wireOrder(wires);
  if ("cycle" in order) throw new Error(`wiring cycle ${order.cycle.join(" → ")}`);
  const byId = new Map(wires.map((w) => [w.target, w]));
  // Every ID that is built (wire targets, leaves, `when` branches) and every decorator.
  const built = new Set<string>(order.order);
  const decorators = new Set<string>();
  for (const w of wires) for (const d of w.deps) for (const c of d.compose) decorators.add(c.target);
  const imports = [...new Set([...built, ...decorators])].sort();
  const kinds = new Map<string, string>();
  for (const id of [...imports, ...imports.map((id) => id.slice(0, id.lastIndexOf(".")))]) kinds.set(id, isClass(snapshot, id) ? "class" : (snapshot.nodes[id]?.kind ?? "missing"));
  const view: WiringView = { kinds, nodes: snapshot.nodes, exports: snapshot.exports };
  const names = localNames(imports);
  const name = (id: string): Names => names.get(id)!;
  const ext = importExtension(input.root);
  const lines: string[] = [WIRE_MARKER, ""];
  const byFile = new Map<string, { default: string | null; named: { name: string; local: string }[] }>();
  for (const id of imports) {
    if (!snapshot.nodes[id]?.file) throw new Error(`\`${id}\` is not in the snapshot`);
    // `check` reports the same as K302: the generator never writes an import that cannot load.
    const found = wireImport(view, id);
    if ("problem" in found) throw new Error(`\`${id}\` ${found.problem}`);
    const entry = byFile.get(found.file) ?? { default: null, named: [] };
    if (found.name === "default") entry.default = name(id).local;
    else entry.named.push({ name: found.name, local: name(id).local });
    byFile.set(found.file, entry);
  }
  for (const [file, entry] of [...byFile].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const named = entry.named.length > 0 ? `{ ${entry.named.map((n) => (n.name === n.local ? n.name : `${n.name} as ${n.local}`)).join(", ")} }` : null;
    lines.push(`import ${[entry.default, named].filter((part) => part !== null).join(", ")} from ${JSON.stringify(specifier(out, file, ext))};`);
  }
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
  for (const id of order.order) {
    const w = byId.get(id);
    const n = name(id);
    const args = w && w.deps.length > 0 ? `{ ${w.deps.map((d) => `${key(d.name)}: ${depValue(d, name)}`).join(", ")} }` : "";
    const call = classes.has(id) ? `new ${n.local}(${args})` : `${n.local}(${args})`;
    lines.push(`  let ${n.cell}: ReturnType<typeof ${n.build}> | undefined;`);
    lines.push(`  const ${n.build} = async () => track(await ${call});`);
    lines.push(`  const ${n.builder} = () => (${n.cell} ??= ${n.build}());`);
  }
  const targets = wires.map((w) => w.target);
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
function depValue(d: WireDep, name: (id: string) => Names): string {
  let value = `await ${name(d.target).builder}()`;
  for (const c of [...d.when].reverse()) value = `env[${JSON.stringify(c.env)}] === ${JSON.stringify(c.value)} ? await ${name(c.target).builder}() : ${value}`;
  if (d.when.length > 0) value = `(${value})`;
  for (const c of d.compose) value = `${name(c.target).local}(${value})`;
  return value;
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
  const shared = new Map<string, number>();
  for (const id of ids) shared.set(base(id), (shared.get(base(id)) ?? 0) + 1);
  const derive = (local: string): Names => ({ local, builder: `build_${local}`, build: `build_${local}Build`, cell: `built_${local}`, value: `${local}Value` });
  const used = new Set<string>();
  const out = new Map<string, Names>();
  for (const id of [...ids].sort()) {
    let local = shared.get(base(id))! > 1 ? `${base(id)}_${shortHash(id)}` : base(id);
    for (let salt = 1; Object.values(derive(local)).some((n) => used.has(n)); salt++) local = `${base(id)}_${shortHash(`${id}#${salt}`)}`;
    const names = derive(local);
    for (const n of Object.values(names)) used.add(n);
    out.set(id, names);
  }
  return out;
}

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 6);
}

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
  const resolution = String(options.moduleResolution ?? options.module ?? "").toLowerCase();
  return resolution === "node16" || resolution === "nodenext" ? "js" : "none";
}

/** `compilerOptions` of a tsconfig over those of its relative `extends`; package configs are not read. */
function compilerOptions(file: string, depth: number): Record<string, unknown> {
  const config = readJsonc(file) as { extends?: unknown; compilerOptions?: Record<string, unknown> } | null;
  if (config === null || typeof config !== "object" || depth > 5) return {};
  const parents = typeof config.extends === "string" ? [config.extends] : Array.isArray(config.extends) ? config.extends.filter((e): e is string => typeof e === "string") : [];
  let options: Record<string, unknown> = {};
  for (const parent of parents) {
    if (!parent.startsWith(".")) continue;
    options = { ...options, ...compilerOptions(join(dirname(file), parent.endsWith(".json") ? parent : `${parent}.json`), depth + 1) };
  }
  return { ...options, ...(config.compilerOptions ?? {}) };
}

/** What a relative import names at run time for each source extension (`.mts` → `.mjs`); a bundler resolves the plain ones itself. */
const RUNTIME_EXTENSION: Record<string, string> = { ".ts": ".js", ".tsx": ".js", ".mts": ".mjs", ".cts": ".cjs", ".js": ".js", ".jsx": ".jsx", ".mjs": ".mjs", ".cjs": ".cjs" };

function specifier(out: string, file: string, ext: "ts" | "js" | "none"): string {
  let rel = posix.relative(posix.dirname(out), file);
  if (!rel.startsWith("./") && !rel.startsWith("../")) rel = `./${rel}`;
  if (ext === "ts") return rel;
  const source = posix.extname(rel);
  const runtime = RUNTIME_EXTENSION[source];
  if (runtime === undefined) return rel;
  const stem = rel.slice(0, -source.length);
  if (ext === "js") return `${stem}${runtime}`;
  return source === ".ts" || source === ".tsx" || source === ".js" || source === ".jsx" ? stem : `${stem}${runtime}`;
}
