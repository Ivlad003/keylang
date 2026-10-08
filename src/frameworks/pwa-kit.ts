// The PWA Kit adapter: Salesforce Composable Storefront (ADR 0022). A
// project is a directory whose `package.json` writes `ccExtensibility`
// (template extensibility: `extends` names the base template package,
// `overridesDir` the directory whose `app/…` files replace the base's) or
// depends on `@salesforce/pwa-kit-runtime`.
//
// - Imports: `@salesforce/retail-react-app/app/x` is the project's
//   `overrides/app/x` when that file exists, else the base package
//   (external); `^@salesforce/retail-react-app/app/x` is always the base
//   package. The resolver asks here (`src/imports.ts`, `extensibilityOf`).
// - Entry points (`src/framework-entries.ts`): the array of `routes.jsx`
//   (`{ path, component }` → a `route` labelled with the path on the
//   component, a lazy `loadable(() => import('./pages/x'))` on the page
//   module's default export), and the server of `app/ssr.js`
//   (`app.get('*', runtime.render)` and the exported `get` the Managed
//   Runtime calls) as `route` entries with a note.
//
// Its config files are each project's `package.json`, `routes.*` and
// `ssr.*` of `app/` and of the overrides' `app/`.

import { posix } from "node:path";
import type { ConfigFacts, FrameworkAdapter, FrameworkContext } from "./adapter.ts";

const RUNTIME = "@salesforce/pwa-kit-runtime";
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
/** `app/routes.jsx`, `overrides/app/ssr.js`: the files that place a project. */
const PROJECT_FILE = /^(?:(.*)\/)?app\/(?:routes|ssr)\.(?:js|jsx|ts|tsx|mjs)$/;
const EXTENSIONS = ["js", "jsx", "ts", "tsx", "mjs"];

/** Template extensibility of a `package.json`: the base package and the overrides directory (POSIX, relative to the manifest, no `./`). */
export interface Extensibility {
  base: string;
  overridesDir: string;
}

/** `ccExtensibility` of a parsed `package.json`; null when it writes none or no base package. */
export function extensibilityOf(manifest: unknown): Extensibility | null {
  const cc = isRecord(manifest) ? manifest.ccExtensibility : undefined;
  if (!isRecord(cc) || typeof cc.extends !== "string" || cc.extends === "") return null;
  const dir = typeof cc.overridesDir === "string" ? posix.normalize(cc.overridesDir.replace(/\\/g, "/").replace(/^\/+/, "")).replace(/^\.\/?/, "").replace(/\/$/, "") : "";
  return { base: cc.extends, overridesDir: dir === "." ? "" : dir };
}

export const pwaKit: FrameworkAdapter = {
  name: "pwa-kit",
  version: "1",
  detect(context) {
    return projects(context).length > 0;
  },
  files(context) {
    const out: { path: string; owner: string | null }[] = [];
    const add = (path: string, owner: string | null): void => {
      if (!out.some((f) => f.path === path) && context.analysed(path) && context.read(path) !== null) out.push({ path, owner });
    };
    for (const { dir, extensibility } of projects(context)) {
      const at = (rel: string): string => (dir === "" ? rel : `${dir}/${rel}`);
      add(at("package.json"), dir === "" ? null : dir);
      const apps = ["app", ...(extensibility !== null && extensibility.overridesDir !== "" ? [`${extensibility.overridesDir}/app`] : [])];
      for (const app of apps) for (const name of ["routes", "ssr"]) for (const ext of EXTENSIONS) add(at(`${app}/${name}.${ext}`), dir === "" ? null : dir);
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse(path, text) {
    const facts: ConfigFacts = { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], error: null };
    if (posix.basename(path) !== "package.json") return facts;
    try {
      JSON.parse(text.replace(/^﻿/, ""));
      return facts;
    } catch (e) {
      return { ...facts, error: { line: 1, reason: `\`${path}\` is no JSON: ${e instanceof Error ? e.message : String(e)}` } };
    }
  },
  // `routes.jsx` and `ssr.js` are sources: their facts are the extractor's (`entries`), placed on the graph.
  code(path) {
    return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], error: null };
  },
};

/** The PWA Kit projects of the analysis: the root, and each directory above an `app/routes.*` or `app/ssr.*`, whose `package.json` says so. */
export function projects(context: Pick<FrameworkContext, "sources" | "read">): { dir: string; extensibility: Extensibility | null }[] {
  const dirs = new Set<string>([""]);
  for (const path of context.sources) {
    const match = PROJECT_FILE.exec(path);
    if (match === null) continue;
    // `overrides/app/routes.jsx` belongs to the project above the overrides directory.
    let dir = match[1] ?? "";
    dirs.add(dir);
    while (dir !== "") {
      dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
      dirs.add(dir);
    }
  }
  const out: { dir: string; extensibility: Extensibility | null }[] = [];
  for (const dir of [...dirs].sort()) {
    const manifest = parseJson(context.read(dir === "" ? "package.json" : `${dir}/package.json`));
    const extensibility = extensibilityOf(manifest);
    const runtime = DEPENDENCY_FIELDS.some((field) => isRecord(manifest) && isRecord(manifest[field]) && RUNTIME in manifest[field]);
    if (extensibility !== null || runtime) out.push({ dir, extensibility });
  }
  return out;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
