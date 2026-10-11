// Export tables: the symbol each public name of a module stands for,
// following aliases, re-export chains, namespaces and `export *`. Plain data in
// and out: the graph builds the rows from facts, call resolution and the
// snapshot's `exports` read the result, so both see the same table.
//
// Cycles (`a` re-exports `b` re-exports `a`) resolve to the fixed point: a
// result that depends on a name still being computed higher up is not cached,
// so every module of a cycle gets every name the cycle exports.
//
// Sits in the code pipeline between FileFacts and the graph (source →
// FileFacts → graph → map/index). Entry point: `resolveExports`, which returns
// `ExportTables` (`lookup`, `symbolOf`, `entries`).

/** What kind of thing a public name is. */
export type ExportKind = "fn" | "class" | "type" | "value";

/** How a name is exported when it is not a plain `export` of a local declaration. */
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

/** One public name as a file writes it, before chains are followed. */
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

/** Everything one module contributes to the export tables. */
export interface ModuleExportsInput {
  /** In file order; the first row of a name wins. */
  rows: ExportRowInput[];
  /** `export * from` sources: a module id, or null with the reason its names are unknown. */
  stars: { target: string | null; reason: string }[];
  /** Not every member is known (a syntax error, an excluded file): `export *` from it may supply any name. */
  opaque: boolean;
  /** Stars bind in order and a later one rebinds a name (Python `from .x import *`); else two sources of a name export neither (ESM). */
  lastStarWins?: boolean;
}

/** A resolved public name of a module: the symbol it stands for and how it got there. */
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

/** The resolved export tables of every module, queried lazily and memoized. */
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

/** A computed value plus what it depended on, for cycle-aware memoization. */
interface Result<T> {
  value: T;
  /** Depth of the shallowest computation in progress this result read; Infinity when none. */
  low: number;
}

/**
 * Build the export tables of all modules. `symbolKind` gives a node's kind
 * (null when unknown); `declared` finds a module's own declaration of a name,
 * the fallback for an importer when there is no export entry.
 */
export function resolveExports(inputs: ReadonlyMap<string, ModuleExportsInput>, symbolKind: (id: string) => ExportKind | null, declared: (module: string, name: string) => string | null): ExportTables {
  // Index each module's rows by name; the first row of a name wins, and a
  // literal `*` row is never a name.
  const rows = new Map<string, Map<string, ExportRowInput>>();

  for (const [module, input] of inputs) {
    const byName = new Map<string, ExportRowInput>();

    for (const row of input.rows) if (row.name !== UNKNOWN_EXPORT && !byName.has(row.name)) byName.set(row.name, row);
    rows.set(module, byName);
  }

  // Memo tables plus the recursion stack: `onStack` maps a key being computed
  // to its depth, which is how a cycle is detected and its result left uncached.
  const entryMemo = new Map<string, ExportEntry | null>();
  const namesMemo = new Map<string, string[]>();
  const onStack = new Map<string, number>();
  let depth = 0;

  /** Run `compute` for `key` at the next depth; cache the value when it read nothing still in progress above it. */
  const guarded = <T>(key: string, memo: Map<string, T>, empty: T, compute: () => Result<T>): Result<T> => {
    const cached = memo.get(key);

    // Memoized values are entries, null or name lists, never undefined: undefined means not computed yet.
    if (cached !== undefined) return { value: cached, low: Infinity };
    const at = onStack.get(key);

    // Re-entering a key still in progress: a cycle. Answer empty for now and
    // report the depth, so every result built on this one stays uncached.
    if (at !== undefined) return { value: empty, low: at };
    const mine = depth++;
    onStack.set(key, mine);
    const result = compute();
    onStack.delete(key);
    depth--;

    // Cache only when nothing read came from a computation above this one;
    // otherwise pass the dependency up so the outer call caches instead.
    if (result.low >= mine) {
      memo.set(key, result.value);

      return { value: result.value, low: Infinity };
    }

    return result;
  };

  /** The `*` entry: a module may export names keylang cannot list. */
  const unknown = (module: string, reason: string): ExportEntry => ({ module, name: UNKNOWN_EXPORT, symbol: null, kind: "reexport", form: "reexport", reason });

  const entry = (module: string, name: string): Result<ExportEntry | null> =>
    guarded(`${module}\0${name}`, entryMemo, null, () => {
      const input = inputs.get(module);

      if (!input) return { value: null, low: Infinity };
      const row = rows.get(module)?.get(name);

      // An explicit row: resolve its target, following a re-exported name
      // through its source module.
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

        // A namespace is a value; otherwise the resolved symbol's kind beats
        // what the file showed.
        const kind = row.target.kind === "namespace" ? "value" : symbol !== null ? (symbolKind(symbol) ?? row.kind) : row.kind;

        const value: ExportEntry = { module, name, symbol, kind };

        if (row.form) value.form = row.form;

        if (row.local !== undefined && row.local !== name) value.local = row.local;

        if (row.from) value.from = row.from;

        return { value, low };
      }

      // `export *` re-exports every name of its source except `default`.
      if (name === "default") return { value: null, low: Infinity };
      let low = Infinity;
      const found: { entry: ExportEntry; star: string | null }[] = [];

      // No row: ask every `export *` source for the name. A source keylang
      // does not know only contributes to the `*` (unknown names) entry.
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

      return { value: pickStar(module, name, found, input.lastStarWins === true), low };
    });

  const symbolFrom = (module: string, name: string): Result<string | null> => {
    const found = entry(module, name);

    // No export entry: fall back to the module's own declaration of that name.
    if (found.value) return { value: found.value.symbol, low: found.low };

    return { value: declared(module, name), low: found.low };
  };

  const names = (module: string): Result<string[]> =>
    guarded(module, namesMemo, [], () => {
      const input = inputs.get(module);

      if (!input) return { value: [], low: Infinity };
      // Own names plus every star source's names except `default`; an
      // unknown or opaque source adds `*`.
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

      // Sorted by module, then name (code-unit order), so the index is stable.
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
 * ESM exports neither; with `lastWins` (Python's glob imports) the last such
 * source gives it. An unknown source is reported once, with its reason.
 */
function pickStar(module: string, name: string, found: readonly { entry: ExportEntry; star: string | null }[], lastWins = false): ExportEntry | null {
  // An unknown-source `*` entry only answers the `*` name itself.
  const known = found.filter((f) => f.entry.name !== UNKNOWN_EXPORT || name === UNKNOWN_EXPORT);

  if (known.length === 0) return null;
  // A value (`export const V`) has no symbol: its origin is the module that declares it and its name
  // there. A name from no module of the snapshot (the standard library) has no origin to compare.
  const originOf = (e: ExportEntry): string | null => e.symbol ?? (e.from !== undefined ? `${e.from}\0${e.local ?? e.name}` : e.form === undefined ? `${e.module}\0${e.name}` : null);

  // Distinct declarations the sources point at; one origin reached through
  // several stars is not ambiguous.
  const origins = new Set(
    known.flatMap((f) => {
      const origin = f.entry.name === UNKNOWN_EXPORT ? null : originOf(f.entry);

      return origin === null ? [] : [origin];
    }),
  );

  if (origins.size > 1 && !lastWins) return null;
  // Python binds names in statement order: the last `from .x import *` that has the name wins.
  const chosen = lastWins && origins.size > 1 ? known.at(-1)! : (known.find((f) => f.entry.symbol !== null) ?? known[0]!);

  if (chosen.entry.name === UNKNOWN_EXPORT) return { ...chosen.entry, module };
  // `from`: the module the name comes from, through a chain of re-exports.
  const from = chosen.entry.form === "reexport" && chosen.entry.from ? chosen.entry.from : chosen.star;
  const entry: ExportEntry = { module, name, symbol: chosen.entry.symbol, kind: chosen.entry.kind, form: "reexport" };

  if (from) entry.from = from;

  return entry;
}

/** Plain code-unit order, independent of locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
