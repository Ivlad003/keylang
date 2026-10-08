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

import type { FrameworkAdapter } from "./adapter.ts";

const CONFIG_FILE = /^(?:routes\/[^/]+\.php|app\/Providers\/.+\.php|bootstrap\/(?:app|providers)\.php|app\/Console\/Kernel\.php)$/;

export const laravel: FrameworkAdapter = {
  name: "laravel",
  version: "1",
  detect(context) {
    const composer = parseJson(context.read("composer.json"));
    for (const field of ["require", "require-dev"]) {
      const deps = composer !== null && typeof composer === "object" ? (composer as Record<string, unknown>)[field] : null;
      if (deps !== null && typeof deps === "object" && "laravel/framework" in deps) return true;
    }
    return context.read("artisan") !== null && context.read("bootstrap/app.php") !== null;
  },
  files(context) {
    return context.sources.filter((path) => CONFIG_FILE.test(path) && context.analysed(path)).map((path) => ({ path, owner: null }));
  },
  // The files are PHP: what they say is read from the facts of the code (`src/framework-code/laravel.ts`).
  parse(path) {
    return { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], entries: [], error: null };
  },
};

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

