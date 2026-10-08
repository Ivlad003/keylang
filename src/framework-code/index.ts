// Facts the framework adapters take from code rather than config files (ADR
// 0022): Laravel's service providers and route files, Symfony's attributes.
// They read the PHP extractor's facts, so they live beside the graph (layer
// `map`) while the adapters themselves (`src/frameworks/`) only detect the
// framework, list its config files and parse them. One reader per adapter
// name; `src/map.ts` runs it for an active adapter after its config files.

import type { FileFacts } from "../extract/facts.ts";
import type { ConfigFacts, FrameworkConfig } from "../frameworks/adapter.ts";
import { laravelFacts } from "./laravel.ts";
import { symfonyFacts } from "./symfony.ts";

/** What an adapter reads from code: one config per source file that says anything, given the adapter's parsed config files. */
export type CodeReader = (facts: readonly FileFacts[], configs: readonly ConfigFacts[]) => FrameworkConfig[];

export const FRAMEWORK_CODE: ReadonlyMap<string, CodeReader> = new Map<string, CodeReader>([
  ["laravel", (facts) => laravelFacts(facts)],
  ["symfony", symfonyFacts],
]);
