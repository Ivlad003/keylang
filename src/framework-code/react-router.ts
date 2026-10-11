// Entry points of React Router route modules (`src/frameworks/react-router.ts`
// lists them, each owned by its routes directory), placed on the graph from
// the module's exports: `loader` → `GET <path>`, `action` → `POST <path>`,
// `clientLoader`/`clientAction` the same with `(client)`, the default export
// (the component the router renders) → `PAGE <path>`, and each other export
// the router calls (`meta`, `ErrorBoundary`, `shouldRevalidate`, …) →
// `<export> <path>`. A route other routes nest under is marked `(layout)`:
// its loader runs for each of them.
// An export keylang does not resolve to a fn leaves the module standing for it.

import { frameworkEntry, type EntryScope } from "../entries.ts";
import type { FrameworkConfig } from "../frameworks/adapter.ts";
import { flatRoutePath, isLayout, routeId } from "../frameworks/react-router.ts";
import type { EntryPoint } from "../snapshot.ts";

const HANDLERS: readonly { name: string; method: string; client: boolean }[] = [
  { name: "loader", method: "GET", client: false },
  { name: "action", method: "POST", client: false },
  { name: "clientLoader", method: "GET", client: true },
  { name: "clientAction", method: "POST", client: true },
];

/** Route module exports the router calls itself, besides the handlers and the default export. */
const ROUTE_EXPORTS = ["ErrorBoundary", "HydrateFallback", "Layout", "headers", "links", "meta", "middleware", "clientMiddleware", "unstable_middleware", "unstable_clientMiddleware", "shouldRevalidate"];

export function reactRouterEntries(scope: EntryScope, configs: readonly FrameworkConfig[]): EntryPoint[] {
  const modules = configs.filter((c) => c.owner !== null).map((c) => ({ path: c.facts.path, id: routeId(c.owner!, c.facts.path) }));
  const ids = modules.map((m) => m.id);
  const out: EntryPoint[] = [];
  for (const { path, id } of modules) {
    const module = scope.graph.byPath.get(path);
    if (module === undefined) continue;
    const top = { file: path, line: module.line ?? 1 };
    const url = `${flatRoutePath(id)}${isLayout(id, ids) ? " (layout)" : ""}`;
    const exported = (name: string): { found: boolean; id: string | null } => {
      const row = scope.graph.exports.find((e) => e.module === module.id && e.name === name);
      return { found: row !== undefined, id: row?.symbol != null && scope.fns.has(row.symbol) ? row.symbol : null };
    };
    const add = (fn: string | null, label: string, method: string | null, what: string): void => {
      const entry = frameworkEntry(scope, "react-router", "route", fn ?? module.id, label, `${path}:${top.line}`, top);
      out.push({ ...entry, ...(method !== null ? { method } : {}), ...(fn === null ? { note: `the exported \`${what}\` is no fn keylang resolves: the route module stands for it` } : {}) });
    };
    for (const handler of HANDLERS) {
      const found = exported(handler.name);
      if (found.found) add(found.id, `${handler.method} ${url}${handler.client ? " (client)" : ""}`, handler.method, handler.name);
    }
    const page = exported("default");
    if (page.found) add(page.id, `PAGE ${url}`, null, "default");
    for (const name of ROUTE_EXPORTS) {
      const found = exported(name);
      // Only a fn: `export const links = [...]`-like data is no code the router runs.
      if (found.id !== null) add(found.id, `${name} ${url}`, null, name);
    }
  }
  return out;
}
