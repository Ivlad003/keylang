// In-process reuse of extracted facts. A changed file also invalidates importers.

import type { FileFacts } from "./extract/facts.ts";

const factCache = new Map<string, { hash: string; facts: FileFacts }>();

export function cachedFacts(path: string, hash: string, extract: () => Promise<FileFacts>): Promise<FileFacts> {
  const hit = factCache.get(path);
  if (hit && hit.hash === hash) return Promise.resolve(hit.facts);
  return extract().then((facts) => {
    factCache.set(path, { hash, facts });
    return facts;
  });
}

/** Importers of a changed file must be resolved again. */
export function filesToReextract(changed: readonly string[], edges: readonly { from: string; to: string }[]): string[] {
  const out = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of edges) {
      if (out.has(edge.to) && !out.has(edge.from)) {
        out.add(edge.from);
        grew = true;
      }
    }
  }
  return [...out].sort();
}
