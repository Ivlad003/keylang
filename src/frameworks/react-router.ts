// The React Router adapter (framework mode, v7; ADR 0022): file-system routes
// of `@react-router/fs-routes`. An app directory is `app/` or `src/` (or the
// literal `appDirectory` of `react-router.config.*`) holding a `root.*` and a
// `routes.*` whose default export calls `flatRoutes()`; its route modules are
// the files of `<app>/routes/` (`rootDirectory` if written as a literal):
// `<name>.<ext>`, or `<name>/route.<ext>` for a folder route. Salesforce
// Storefront Next wraps `flatRoutes` (`@salesforce/storefront-next-runtime/
// routing`) and merges the routes of `<app>/extensions/*/routes/` too.
//
// Test files (`*.test.*`, `*.spec.*`) are no route modules: the Storefront
// Next wrapper ignores them, and a stock `flatRoutes` project names them in
// `ignoredRouteFiles`, which keylang does not read. A route config written
// with `route()`, `index()`, `layout()` (no `flatRoutes()`) is a hole of the
// config file: its routes are not read yet.
//
// The adapter lists the config and the route modules (each owned by its
// routes directory); placing their `loader`/`action` exports on the graph is
// `src/framework-code/react-router.ts`.

import { posix } from "node:path";
import { isJsonObject, parseJson, type JsonValue } from "../json.ts";
import type { ConfigFacts, FrameworkAdapter, FrameworkContext } from "./adapter.ts";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

const PACKAGES = ["@react-router/dev", "@react-router/fs-routes"];

const EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs"];

const ROUTE_MODULE = /\.(?:ts|tsx|js|jsx|mjs|md|mdx)$/;

const TEST_FILE = /\.(?:test|spec)\.[^/.]+$/;

const FLAT_ROUTES = /\bflatRoutes\s*\(/;

const STOREFRONT_ROUTING = /['"]@salesforce\/storefront-next-runtime\/routing['"]/;

const ROOT_DIRECTORY = /\brootDirectory\s*:\s*['"`]([^'"`$]+)['"`]/;

const APP_DIRECTORY = /\bappDirectory\s*:\s*['"`]([^'"`$]+)['"`]/;

export const reactRouter: FrameworkAdapter = {
  name: "react-router",
  version: "1",
  detect(context) {
    return depends(context) && apps(context).length > 0;
  },
  files(context) {
    const out: { path: string; owner: string | null }[] = [];

    for (const app of apps(context)) {
      out.push({ path: app.config, owner: null });

      for (const dir of app.routeDirs) for (const path of routeModules(context.sources, dir)) out.push({ path, owner: dir });
    }

    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse(path, text) {
    const facts: ConfigFacts = { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], error: null };

    if (!/^routes\.[^/]+$/.test(posix.basename(path)) || FLAT_ROUTES.test(text)) return facts;
    const line = text.split("\n").findIndex((l) => /\bexport\s+default\b/.test(l)) + 1;

    return { ...facts, holes: [{ line: line || 1, col: 1, text: "routes", reason: "a route config without `flatRoutes()` (`route()`, `index()`, `layout()`): keylang does not read its routes yet" }] };
  },
};

/** An app directory: its route config and the directories of its route modules. */
interface App {
  config: string;
  routeDirs: string[];
}

function apps(context: Pick<FrameworkContext, "sources" | "read" | "dirs" | "analysed">): App[] {
  const configured = ["ts", "js", "mjs", "mts"].map((ext) => APP_DIRECTORY.exec(context.read(`react-router.config.${ext}`) ?? "")?.[1]).find((dir) => dir !== undefined);
  const candidates = configured !== undefined ? [normalize(configured)] : ["app", "src"];
  const out: App[] = [];

  for (const dir of candidates) {
    const has = (name: string): string | null => EXTENSIONS.map((ext) => `${dir}/${name}.${ext}`).find((path) => context.analysed(path) && context.read(path) !== null) ?? null;
    const config = has("routes");

    if (config === null || has("root") === null) continue;
    const text = context.read(config) ?? "";
    const routeDirs = [`${dir}/${normalize(ROOT_DIRECTORY.exec(text)?.[1] ?? "routes")}`];

    if (FLAT_ROUTES.test(text) && STOREFRONT_ROUTING.test(text)) {
      for (const extension of context.dirs(`${dir}/extensions`)) routeDirs.push(`${dir}/extensions/${extension}/routes`);
    }

    out.push({ config, routeDirs: FLAT_ROUTES.test(text) ? routeDirs : [] });
  }

  return out;
}

/** The route modules of a routes directory, sorted: `<name>.<ext>` and `<name>/route.<ext>`, tests left out. */
export function routeModules(sources: readonly string[], dir: string): string[] {
  const prefix = `${dir}/`;

  return sources.filter((path) => {
    if (!path.startsWith(prefix) || TEST_FILE.test(path) || !ROUTE_MODULE.test(path)) return false;
    const rest = path.slice(prefix.length).split("/");

    return rest.length === 1 || (rest.length === 2 && /^route\.[^.]+$/.test(rest[1]!));
  });
}

/** The route ID of a route module: its file name without the extension, or its folder. */
export function routeId(dir: string, path: string): string {
  const rest = path.slice(dir.length + 1);

  return rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : rest.replace(/\.[^.]+$/, "");
}

/**
 * The URL path of a flat route ID (`_app.orders.$orderNo` → `/orders/:orderNo`):
 * `.` separates segments (`[.]` escapes), `_x` is pathless, `x_` opts out of
 * the layout but keeps `x`, `_index` is the index, `$x` a parameter, `$` the
 * splat, `(x)` optional.
 */
export function flatRoutePath(id: string): string {
  const segments = splitSegments(id);
  const parts: string[] = [];

  for (const [i, raw] of segments.entries()) {
    const escaped = raw.startsWith("[") || raw.includes("[");

    if (raw === "_index" && i === segments.length - 1) continue;

    if (!escaped && raw.startsWith("_")) continue;
    let segment = !escaped && raw.endsWith("_") ? raw.slice(0, -1) : raw;
    const optional = /^\((.*)\)$/.exec(segment);

    if (optional !== null) segment = optional[1]!;
    segment = segment === "$" ? "*" : segment.startsWith("$") ? `:${segment.slice(1)}` : segment;
    parts.push(segment.replace(/\[([^\]]*)\]/g, "$1") + (optional !== null ? "?" : ""));
  }

  return `/${parts.join("/")}`;
}

/** Whether another route ID nests under this one (`_app` of `_app.cart`). */
export function isLayout(id: string, ids: readonly string[]): boolean {
  const own = splitSegments(id);

  return ids.some((other) => {
    if (other === id) return false;
    const segments = splitSegments(other);

    return segments.length > own.length && own.every((s, i) => s === segments[i] || `${s}_` === segments[i]);
  });
}

function splitSegments(id: string): string[] {
  const out: string[] = [];
  let current = "";
  let bracket = false;

  for (const ch of id) {
    if (ch === "[") bracket = true;
    else if (ch === "]") bracket = false;

    if (ch === "." && !bracket) {
      out.push(current);
      current = "";
    } else current += ch;
  }

  out.push(current);

  return out;
}

function normalize(dir: string): string {
  return posix.normalize(dir.replace(/\\/g, "/")).replace(/^\.\/?/, "").replace(/\/$/, "");
}

function depends(context: Pick<FrameworkContext, "read">): boolean {
  let manifest: JsonValue;

  try {
    manifest = parseJson((context.read("package.json") ?? "null").replace(/^﻿/, ""));
  } catch {
    return false;
  }

  return DEPENDENCY_FIELDS.some((field) => {
    const deps = isJsonObject(manifest) ? manifest[field] : undefined;

    return isJsonObject(deps) && PACKAGES.some((pkg) => pkg in deps);
  });
}
