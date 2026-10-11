// `lilconfig` for the analysis in the browser: `@mrleebo/prisma-ast` asks it
// for a `prisma-ast` config when it loads; the worker has none, so the search
// finds nothing and the parser keeps its defaults.

/** A config searcher whose `search` and `load` always find nothing. */
export function lilconfigSync() {
  return { search: () => null, load: () => null };
}
