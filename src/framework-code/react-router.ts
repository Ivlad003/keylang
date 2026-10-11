// Entry points of React Router route modules (`src/frameworks/react-router.ts`
// lists them, each owned by its routes directory), placed on the graph from
// the module's exports: `loader` → `GET <path>`, `action` → `POST <path>`,
// `clientLoader`/`clientAction` the same with `(client)`, the default export
// (the component the router renders) → `PAGE <path>`, and each other export
// the router calls (`meta`, `ErrorBoundary`, `shouldRevalidate`, …) →
// `<export> <path>`. A route other routes nest under is marked `(layout)`:
// its loader runs for each of them.
// An export keylang does not resolve to a fn leaves the module standing for it.
//
// Pipeline: graph (modules, exports, fns) → entry points of the snapshot.
// Entry point: `reactRouterEntries`; key terms: route module, route ID,
// handler export, layout route.

import { frameworkEntry, type EntryScope } from "../entries.ts";
import type { FrameworkConfig } from "../frameworks/adapter.ts";
import { flatRoutePath, isLayout, routeId } from "../frameworks/react-router.ts";
import type { EntryPoint } from "../snapshot.ts";

/** The data handlers of a route module: the HTTP method each serves and whether it runs in the browser. */
const HANDLERS: readonly { name: string; method: string; client: boolean }[] = [
  { name: "loader", method: "GET", client: false },
  { name: "action", method: "POST", client: false },
  { name: "clientLoader", method: "GET", client: true },
  { name: "clientAction", method: "POST", client: true },
];

/** Route module exports the router calls itself, besides the handlers and the default export. */
const ROUTE_EXPORTS = ["ErrorBoundary", "HydrateFallback", "Layout", "headers", "links", "meta", "middleware", "clientMiddleware", "unstable_middleware", "unstable_clientMiddleware", "shouldRevalidate"];

/** Whether a route module exports a name, and the fn keylang resolves it to. */
interface RouteExport {
  found: boolean;
  id: string | null;
}

/** The entry points of every route module the adapter found, in the order of its configs. */
export function reactRouterEntries(scope: EntryScope, configs: readonly FrameworkConfig[]): EntryPoint[] {
  // Only configs owned by a routes directory are route modules; their IDs also tell which routes are layouts.
  const modules = configs.flatMap((c) => (c.owner === null ? [] : [{ path: c.facts.path, id: routeId(c.owner, c.facts.path) }]));
  const ids = modules.map((m) => m.id);
  const out: EntryPoint[] = [];

  for (const { path, id } of modules) {
    const module = scope.graph.byPath.get(path);

    // A route file the graph does not know (not analysed) yields nothing.
    if (module === undefined) continue;
    const top = { file: path, line: module.line ?? 1 };
    const url = `${flatRoutePath(id)}${isLayout(id, ids) ? " (layout)" : ""}`;

    // Look an export up in the graph: whether it exists, and its fn when it resolves to one.
    const exported = (name: string): RouteExport => {
      const row = scope.graph.exports.find((e) => e.module === module.id && e.name === name);

      return { found: row !== undefined, id: row?.symbol != null && scope.fns.has(row.symbol) ? row.symbol : null };
    };

    // One entry per export; an export that is no resolved fn is anchored on the module itself, with a note.
    const add = (fn: string | null, label: string, method: string | null, what: string): void => {
      const entry = frameworkEntry(scope, "react-router", "route", fn ?? module.id, label, `${path}:${top.line}`, top);
      const point: EntryPoint = { ...entry };

      if (method !== null) point.method = method;

      if (fn === null) point.note = `the exported \`${what}\` is no fn keylang resolves: the route module stands for it`;
      out.push(point);
    };

    // Handlers, then the page, then the other router exports: a fixed order, so the entry list is stable.
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
