// `lilconfig` for the analysis in the browser: `@mrleebo/prisma-ast` asks it
// for a `prisma-ast` config when it loads; the worker has none, so the search
// finds nothing and the parser keeps its defaults.

export function lilconfigSync() {
  return { search: () => null, load: () => null };
}
