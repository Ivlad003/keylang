// The Laravel adapter (ADR 0022; business-flows 35). Laravel writes its
// wiring in PHP, not in config files: service providers, `routes/*.php`,
// `routes/console.php` and the console kernel. The adapter detects the
// framework and lists those files as its config, so that `frameworks`
// without `laravel` makes them holes; what they say is read from the facts
// of the PHP extractor by `src/framework-code/laravel.ts`, which needs them
// and so lives beside the graph, not here.
//
// Detected from `laravel/framework` in the root `composer.json`, or an
// `artisan` beside `bootstrap/app.php`.
//
// Pipeline: config side of the framework adapters (detect → files → parse);
// the code side is in `src/framework-code/laravel.ts`. Entry point: `laravel`.

import { isJsonObject, parseJson, type JsonValue } from "../json.ts";
import type { FrameworkAdapter } from "./adapter.ts";

/** Laravel's wiring files: route files, service providers, the bootstrap files and the console kernel. */
const CONFIG_FILE = /^(?:routes\/[^/]+\.php|app\/Providers\/.+\.php|bootstrap\/(?:app|providers)\.php|app\/Console\/Kernel\.php)$/;

export const laravel: FrameworkAdapter = {
  name: "laravel",
  version: "1",
  detect(context) {
    const composer = readJson(context.read("composer.json"));

    // A dependency on the framework package in either section is enough.
    for (const field of ["require", "require-dev"]) {
      const deps = isJsonObject(composer) ? composer[field] : undefined;

      if (isJsonObject(deps) && "laravel/framework" in deps) return true;
    }

    // Without composer.json: the `artisan` script beside `bootstrap/app.php` marks a Laravel app.
    return context.read("artisan") !== null && context.read("bootstrap/app.php") !== null;
  },
  files(context) {
    // Only files the analysis reads count: the rest stay holes either way.
    return context.sources.filter((path) => CONFIG_FILE.test(path) && context.analysed(path)).map((path) => ({ path, owner: null }));
  },
  // The files are PHP: what they say is read from the facts of the code (`src/framework-code/laravel.ts`).
  parse(path) {
    return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], entries: [], error: null };
  },
};

/** Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`, so detection just fails. */
function readJson(text: string | null): JsonValue {
  if (text === null) return null;

  try {
    return parseJson(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

