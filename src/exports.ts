// Export tables: the symbol each public name of a module stands for,
// following aliases, re-export chains, namespaces and `export *`. Plain data in
// and out: the graph builds the rows from facts, call resolution and the
// snapshot's `exports` read the result, so both see the same table.
//
// Cycles (`a` re-exports `b` re-exports `a`) resolve to the fixed point: a
// result that depends on a name still being computed higher up is not cached,
// so every module of a cycle gets every name the cycle exports.

export type ExportKind = "fn" | "class" | "type" | "value";
export type ExportForm = "alias" | "default" | "reexport" | "namespace";

/** The name `export *` from a module with unknown contents contributes: any name. */
export const UNKNOWN_EXPORT = "*";

/** What a name written in a module stands for, before resolution. */
export type ExportTarget =
  /** A declaration of this module (node id). */
  | { kind: "symbol"; id: string }
  /** A public name of another module: `export { a } from "./x"`, an imported name exported again. */
  | { kind: "name"; module: string; name: string }
  /** The module object of another module: `export * as ns from`, `import * as ns; export { ns }`. */
  | { kind: "namespace"; module: string }
  /** Nothing keylang indexes: a value (`export default 3`), a package's name. */
  | { kind: "none" };

export interface ExportRowInput {
  name: string;
  /** What the file shows the name is; a resolved symbol's kind wins. */
  kind: ExportKind;
  form?: ExportForm;
  /** The local or source name, when it differs from `name`. */
  local?: string;
  /** Module a re-export or a namespace comes from. */
  from?: string;
  target: ExportTarget;
}

export interface ModuleExportsInput {
  /** In file order; the first row of a name wins. */
  rows: ExportRowInput[];
  /** `export * from` sources: a module id, or null with the reason its names are unknown. */
  stars: { target: string | null; reason: string }[];
  /** Not every member is known (a syntax error, an excluded file): `export *` from it may supply any name. */
  opaque: boolean;
}

export interface ExportEntry {
  module: string;
  /** Public name; `*` for an `export *` whose names are unknown (`reason`). */
  name: string;
  /** Node the name stands for; null when it is not a declaration keylang indexes. */
  symbol: string | null;
  kind: ExportKind | "reexport";
  form?: ExportForm;
  local?: string;
  from?: string;
  reason?: string;
}

export interface ExportTables {
  /** The entry of a public name; null when the module does not export it (or has no table). */
  lookup(module: string, name: string): ExportEntry | null;
  /**
   * The symbol an importer of `name` gets: the entry's symbol, or — when the
   * module has no entry of that name (CommonJS, an unexported helper) — the
   * declaration of that name.
   */
  symbolOf(module: string, name: string): string | null;
  /** Every entry, sorted by module and name. */
  entries(): ExportEntry[];
}

interface Result<T> {
  value: T;
  /** Depth of the shallowest computation in progress this result read; Infinity when none. */
  low: number;
}

export function resolveExports(inputs: ReadonlyMap<string, ModuleExportsInput>, symbolKind: (id: string) => ExportKind | null, declared: (module: string, name: string) => string | null): ExportTables {
  const rows = new Map<string, Map<string, ExportRowInput>>();
  for (const [module, input] of inputs) {
    const byName = new Map<string, ExportRowInput>();
    for (const row of input.rows) if (row.name !== UNKNOWN_EXPORT && !byName.has(row.name)) byName.set(row.name, row);
    rows.set(module, byName);
  }
  const entryMemo = new Map<string, ExportEntry | null>();
  const namesMemo = new Map<string, string[]>();
  const onStack = new Map<string, number>();
  let depth = 0;

  /** Run `compute` for `key` at the next depth; cache the value when it read nothing still in progress above it. */
  const guarded = <T>(key: string, memo: Map<string, T>, empty: T, compute: () => Result<T>): Result<T> => {
    if (memo.has(key)) return { value: memo.get(key) as T, low: Infinity };
    const at = onStack.get(key);
    if (at !== undefined) return { value: empty, low: at };
    const mine = depth++;
    onStack.set(key, mine);
    const result = compute();
    onStack.delete(key);
    depth--;
    if (result.low >= mine) {
      memo.set(key, result.value);
      return { value: result.value, low: Infinity };
    }
    return result;
  };

  const unknown = (module: string, reason: string): ExportEntry => ({ module, name: UNKNOWN_EXPORT, symbol: null, kind: "reexport", form: "reexport", reason });

  const entry = (module: string, name: string): Result<ExportEntry | null> =>
    guarded(`${module}\0${name}`, entryMemo, null, () => {
      const input = inputs.get(module);
      if (!input) return { value: null, low: Infinity };
      const row = rows.get(module)?.get(name);
      if (row) {
        let low = Infinity;
        let symbol: string | null = null;
        if (row.target.kind === "symbol") symbol = row.target.id;
        else if (row.target.kind === "namespace") symbol = row.target.module;
        else if (row.target.kind === "name") {
          const found = symbolFrom(row.target.module, row.target.name);
          symbol = found.value;
          low = found.low;
        }
        const kind = row.target.kind === "namespace" ? "value" : symbol !== null ? (symbolKind(symbol) ?? row.kind) : row.kind;
        return { value: { module, name, symbol, kind, ...(row.form ? { form: row.form } : {}), ...(row.local !== undefined && row.local !== name ? { local: row.local } : {}), ...(row.from ? { from: row.from } : {}) }, low };
      }
      // `export *` re-exports every name of its source except `default`.
      if (name === "default") return { value: null, low: Infinity };
      let low = Infinity;
      const found: { entry: ExportEntry; star: string | null }[] = [];
      for (const star of input.stars) {
        if (star.target === null || !inputs.has(star.target)) {
          if (name === UNKNOWN_EXPORT) found.push({ entry: unknown(module, star.reason || `re-export from \`${star.target}\``), star: null });
          continue;
        }
        const from = entry(star.target, name);
        low = Math.min(low, from.low);
        if (from.value) found.push({ entry: from.value, star: star.target });
        else if (name === UNKNOWN_EXPORT && inputs.get(star.target)?.opaque) found.push({ entry: unknown(module, `re-export from \`${star.target}\`, whose contents keylang did not read`), star: null });
      }
      return { value: pickStar(module, name, found), low };
    });

  const symbolFrom = (module: string, name: string): Result<string | null> => {
    const found = entry(module, name);
    if (found.value) return { value: found.value.symbol, low: found.low };
    return { value: declared(module, name), low: found.low };
  };

  const names = (module: string): Result<string[]> =>
    guarded(module, namesMemo, [], () => {
      const input = inputs.get(module);
      if (!input) return { value: [], low: Infinity };
      const out = new Set<string>(rows.get(module)?.keys() ?? []);
      let low = Infinity;
      for (const star of input.stars) {
        if (star.target === null || !inputs.has(star.target)) {
          out.add(UNKNOWN_EXPORT);
          continue;
        }
        const from = names(star.target);
        low = Math.min(low, from.low);
        for (const name of from.value) if (name !== "default") out.add(name);
        if (inputs.get(star.target)?.opaque) out.add(UNKNOWN_EXPORT);
      }
      return { value: [...out], low };
    });

  return {
    lookup: (module, name) => entry(module, name).value,
    symbolOf: (module, name) => symbolFrom(module, name).value,
    entries: () => {
      const out: ExportEntry[] = [];
      for (const module of [...inputs.keys()].sort(compare)) {
        for (const name of [...names(module).value].sort(compare)) {
          const found = entry(module, name).value;
          if (found) out.push(found);
        }
      }
      return out;
    },
  };
}

/**
 * The entry `export *` gives a name: the one source that has it. Two sources
 * whose names stand for different declarations make the name ambiguous, and
 * ESM exports neither; an unknown source is reported once, with its reason.
 */
function pickStar(module: string, name: string, found: readonly { entry: ExportEntry; star: string | null }[]): ExportEntry | null {
  const known = found.filter((f) => f.entry.name !== UNKNOWN_EXPORT || name === UNKNOWN_EXPORT);
  if (known.length === 0) return null;
  // A value (`export const V`) has no symbol: its origin is the module that declares it and its name
  // there. A name from no module of the snapshot (the standard library) has no origin to compare.
  const originOf = (e: ExportEntry): string | null => e.symbol ?? (e.from !== undefined ? `${e.from}\0${e.local ?? e.name}` : e.form === undefined ? `${e.module}\0${e.name}` : null);
  const origins = new Set(known.filter((f) => f.entry.name !== UNKNOWN_EXPORT).map((f) => originOf(f.entry)).filter((o) => o !== null));
  if (origins.size > 1) return null;
  const chosen = known.find((f) => f.entry.symbol !== null) ?? known[0]!;
  if (chosen.entry.name === UNKNOWN_EXPORT) return { ...chosen.entry, module };
  // `from`: the module the name comes from, through a chain of re-exports.
  const from = chosen.entry.form === "reexport" && chosen.entry.from ? chosen.entry.from : chosen.star;
  const entry: ExportEntry = { module, name, symbol: chosen.entry.symbol, kind: chosen.entry.kind, form: "reexport" };
  if (from) entry.from = from;
  return entry;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
