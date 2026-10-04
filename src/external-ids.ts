// IDs of external packages: `external.<segment>`, one ID space for every
// package name a repository imports or declares. The map, the rules and the
// language server all name a package by this ID, so they share this module.

import { layerName } from "./config.ts";

export const EXTERNAL = "external";

/** ID segment of a package: `@scope/pkg` → `scope-pkg`, `lodash.get` → `lodash_get`. */
export function externalSegment(pkg: string): string {
  return layerName(pkg.replace(/^@/, "").replace("/", "-"));
}

/**
 * Module IDs of package names. Two names that sanitize to one segment
 * (`@scope/pkg` and `scope-pkg`) get two IDs: the one whose name is the
 * segment keeps it, the others get `-2`, `-3`… in name order, with a warning.
 * The IDs depend only on the set of names, not on their order.
 */
export function assignExternalIds(names: Iterable<string>): { ids: Map<string, string>; warnings: string[] } {
  const bySegment = new Map<string, string[]>();
  for (const pkg of [...new Set(names)].sort()) {
    const segment = externalSegment(pkg);
    bySegment.set(segment, [...(bySegment.get(segment) ?? []), pkg]);
  }
  const ids = new Map<string, string>();
  const warnings: string[] = [];
  for (const [segment, group] of bySegment) {
    const keeper = group.find((n) => n === segment) ?? group[0]!;
    ids.set(keeper, `${EXTERNAL}.${segment}`);
    let n = 2;
    for (const name of group) {
      if (name === keeper) continue;
      while (bySegment.has(`${segment}-${n}`)) n++;
      const id = `${EXTERNAL}.${segment}-${n++}`;
      ids.set(name, id);
      warnings.push(`packages \`${keeper}\` and \`${name}\` share the ID segment \`${segment}\`; \`${name}\` is \`${id}\``);
    }
  }
  return { ids, warnings };
}

/** The package part of an external ID (`external.pg.Pool` → `external.pg`); null for any other ID. */
export function externalPackageId(id: string): string | null {
  return /^external\.[^.]+/.exec(id)?.[0] ?? null;
}
