// The JavaScript web adapters (ADR 0022; business-flows/37): Express, Fastify
// and Next.js. These frameworks keep their routing in the code itself —
// `app.use('/api', router)`, `fastify.register(plugin, { prefix })`, the
// files of `pages/api/`, `'use server'`, `middleware.ts` — so the config files
// of an adapter are the analysed sources that register something with it,
// and the facts are what the TypeScript extractor records of them
// (`FileFacts.web`). `parse` gives no facts of its own: the files are inputs
// of the snapshot (manifest, `snapshotId`) and, with the adapter turned off,
// `skipped-file` holes (`framework:<name>`). Placing the registrations on the
// graph is `src/framework-code/web-entries.ts`.
//
// Detected from a dependency of the root `package.json` (`express`,
// `fastify`, `next`), or (Express, Fastify) an analysed file that imports the
// package; Next.js also from a `next.config.*`.
//
// Pipeline: config side of the framework adapters (detect → files → parse).
// Entry points: `express`, `fastify`, `next`, `WEB_FRAMEWORKS`.

import { posix } from "node:path";
import { isJsonObject, parseJson, type JsonValue } from "../json.ts";
import type { ConfigFacts, FrameworkAdapter, FrameworkContext } from "./adapter.ts";

/** `package.json` sections whose keys are dependency names. */
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

/** JavaScript and TypeScript source extensions. */
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** A registration on a literal path: `x.get('/…'`, `x.use('/…'`. */
const REGISTRATION = /\.(?:get|post|put|patch|delete|all|head|options|use|route)\(\s*['"`][/*]/;

/** The names of the web adapters, for the graph step that reads their registrations. */
export const WEB_FRAMEWORKS: readonly string[] = ["express", "fastify", "next"];

/** Whether the root `package.json` lists `pkg` as any kind of dependency. */
function depends(context: FrameworkContext, pkg: string): boolean {
  const manifest = readJson(context.read("package.json"));

  return DEPENDENCY_FIELDS.some((field) => isJsonObject(manifest) && isJsonObject(manifest[field]) && pkg in manifest[field]);
}

/** The directory that owns a config file; null for a file at the root. */
function owner(path: string): string | null {
  const dir = posix.dirname(path);

  return dir === "." ? null : dir;
}

/** The facts `parse` gives: none, since the extractor records these frameworks' registrations. */
function emptyFacts(path: string): ConfigFacts {
  return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], error: null };
}

/** Express and Fastify: the files that import the package, or register a route, a mount or a plugin. */
function routerAdapter(name: string, pkg: string, marker: RegExp): FrameworkAdapter {
  // An ES `from '<pkg>'`, a `require('<pkg>')` or a dynamic `import('<pkg>')`.
  const imports = new RegExp(`(?:from\\s*|require\\(\\s*|import\\(\\s*)['"]${pkg}['"]`);
  const sources = (context: FrameworkContext): string[] => context.sources.filter((path) => SOURCE.test(path));

  return {
    name,
    version: "1",
    detect(context) {
      return depends(context, pkg) || sources(context).some((path) => imports.test(context.read(path) ?? ""));
    },
    files(context) {
      const out: { path: string; owner: string | null }[] = [];

      // A config file: analysed source that imports the package, registers a literal route, or carries the adapter's marker.
      for (const path of sources(context)) {
        if (!context.analysed(path)) continue;
        const text = context.read(path);

        if (text !== null && (imports.test(text) || REGISTRATION.test(text) || marker.test(text))) out.push({ path, owner: owner(path) });
      }

      return out;
    },
    parse: emptyFacts,
  };
}

export const express = routerAdapter("express", "express", /\bRouter\(\)/);

export const fastify = routerAdapter("fastify", "fastify", /\.register\(|\.route\(\s*\{/);

/** `pages/api/**` handlers, `middleware.ts` at the root or in `src/`. */
const PAGES_API = /(?:^|\/)pages\/api\/.+\.(?:ts|tsx|js|jsx|mjs)$/;

/** Next.js middleware: `middleware.*` at the root or under `src/`. */
const MIDDLEWARE = /^(?:src\/)?middleware\.(?:ts|js|mjs)$/;

/** A `'use server'` directive: the file (or a function in it) holds server actions. */
const USE_SERVER = /['"]use server['"]/;

export const next: FrameworkAdapter = {
  name: "next",
  version: "1",
  detect(context) {
    return depends(context, "next") || ["js", "mjs", "ts", "cjs"].some((ext) => context.read(`next.config.${ext}`) !== null);
  },
  files(context) {
    const out: { path: string; owner: string | null }[] = [];

    for (const path of context.sources) {
      if (!SOURCE.test(path) || !context.analysed(path)) continue;

      if (PAGES_API.test(path) || MIDDLEWARE.test(path) || USE_SERVER.test(context.read(path) ?? "")) out.push({ path, owner: owner(path) });
    }

    return out;
  },
  parse: emptyFacts,
};

/** Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`. */
function readJson(text: string | null): JsonValue {
  if (text === null) return null;

  try {
    return parseJson(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}
