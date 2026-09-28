// `keylang wire`: `# wiring` + the snapshot → `keylang.gen.ts` (ADR 0003).
// One memoized builder per factory: a builder awaits its dependencies, then
// calls the factory (`new` for a class) with them, so every node is built
// once per `wire()` call, after what it needs, and only when some chosen
// branch needs it. Disposers run newest first; a failed build disposes what
// was built. The output depends only on specs and snapshot: same input,
// same bytes.

import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { readJsonc } from "./imports.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { wireOrder, type Wire, type WireDep } from "./wiring.ts";

export const WIRE_MARKER = "// keylang:generated — не редагувати, `keylang wire`";

export interface WireInput {
  root: string;
  /** Output path relative to root, POSIX. */
  out: string;
  wires: readonly Wire[];
  snapshot: AnalysisSnapshot;
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
  const ext = importExtension(input.root);
  const lines: string[] = [WIRE_MARKER, ""];
  const byFile = new Map<string, { name: string; local: string }[]>();
  for (const id of imports) {
    const node = snapshot.nodes[id];
    if (!node?.file) throw new Error(`\`${id}\` is not in the snapshot`);
    const list = byFile.get(node.file) ?? [];
    list.push({ name: id.slice(id.lastIndexOf(".") + 1), local: local(id) });
    byFile.set(node.file, list);
  }
  for (const [file, names] of [...byFile].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    lines.push(`import { ${names.map((n) => (n.name === n.local ? n.name : `${n.name} as ${n.local}`)).join(", ")} } from ${JSON.stringify(specifier(out, file, ext))};`);
  }
  const classes = new Set(imports.filter((id) => isClass(snapshot, id)));
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
    "  const disposeAll = async (): Promise<void> => {",
    "    const errors: unknown[] = [];",
    "    for (const dispose of disposers.splice(0).reverse()) {",
    "      try {",
    "        await dispose();",
    "      } catch (error) {",
    "        errors.push(error);",
    "      }",
    "    }",
    '    if (errors.length > 0) throw new AggregateError(errors, "keylang wire: dispose failed");',
    "  };",
  );
  for (const id of order.order) {
    const w = byId.get(id);
    const args = w && w.deps.length > 0 ? `{ ${w.deps.map((d) => `${key(d.name)}: ${depValue(d)}`).join(", ")} }` : "";
    const call = classes.has(id) ? `new ${local(id)}(${args})` : `${local(id)}(${args})`;
    lines.push(`  let ${cell(id)}: ReturnType<typeof ${builder(id)}Build> | undefined;`);
    lines.push(`  const ${builder(id)}Build = async () => track(await ${call});`);
    lines.push(`  const ${builder(id)} = () => (${cell(id)} ??= ${builder(id)}Build());`);
  }
  const targets = wires.map((w) => w.target);
  lines.push(
    "  try {",
    ...targets.map((id) => `    const ${local(id)}Value = await ${builder(id)}();`),
    "    return {",
    ...targets.map((id) => `      ${JSON.stringify(id)}: ${local(id)}Value,`),
    "      dispose: disposeAll,",
    "    };",
    "  } catch (error) {",
    "    // A failed build leaves nothing half-open: what was built is disposed, newest first.",
    "    await disposeAll();",
    "    throw error;",
    "  }",
    "}",
    "",
  );
  return lines.join("\n");
}

/** The value of one dependency: a `when` branch chosen from `env` (else the default), wrapped by `compose` innermost first. */
function depValue(d: WireDep): string {
  let value = `await ${builder(d.target)}()`;
  for (const c of [...d.when].reverse()) value = `env[${JSON.stringify(c.env)}] === ${JSON.stringify(c.value)} ? await ${builder(c.target)}() : ${value}`;
  if (d.when.length > 0) value = `(${value})`;
  for (const c of d.compose) value = `${local(c.target)}(${value})`;
  return value;
}

/** A class is a module node declared in the same file as its parent module. */
function isClass(snapshot: AnalysisSnapshot, id: string): boolean {
  const node = snapshot.nodes[id];
  const parent = snapshot.nodes[id.slice(0, id.lastIndexOf("."))];
  return node?.kind === "module" && parent?.kind === "module" && parent.file !== null && parent.file === node.file;
}

function local(id: string): string {
  return id.replace(/[^A-Za-z0-9_$]/g, "_");
}

function builder(id: string): string {
  return `build_${local(id)}`;
}

function cell(id: string): string {
  return `built_${local(id)}`;
}

function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * How the project writes relative imports: `.ts` with `allowImportingTsExtensions`
 * or `rewriteRelativeImportExtensions`, `.js` under `node16`/`nodenext`
 * resolution, no extension otherwise (bundlers).
 */
function importExtension(root: string): "ts" | "js" | "none" {
  const file = join(root, "tsconfig.json");
  const config = existsSync(file) ? (readJsonc(file) as { compilerOptions?: Record<string, unknown> } | null) : null;
  const options = config?.compilerOptions ?? {};
  if (options.allowImportingTsExtensions === true || options.rewriteRelativeImportExtensions === true) return "ts";
  const resolution = String(options.moduleResolution ?? options.module ?? "").toLowerCase();
  return resolution === "node16" || resolution === "nodenext" ? "js" : "none";
}

function specifier(out: string, file: string, ext: "ts" | "js" | "none"): string {
  let rel = posix.relative(posix.dirname(out), file);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  if (ext === "ts") return rel;
  const bare = rel.replace(/\.(tsx?|mts|cts)$/, "");
  return ext === "none" ? bare : `${bare}.js`;
}

