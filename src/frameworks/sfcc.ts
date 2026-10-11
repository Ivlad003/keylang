// The Salesforce Commerce Cloud adapter (SFRA cartridges; ADR 0022 п. 2, 5).
// Detected from a cartridge among the analysed files (`…/cartridges/<c>/cartridge/…`)
// or a `dw.json`. Its config files are, per cartridge, the `package.json`
// (whose `hooks` names the hooks file), `hooks.json` — one `observer` per hook
// — and `steptypes.json` — one `cron` per job step type. Each is parsed into
// entry facts that name the script by the paths the platform tries; the
// snapshot places them on the graph (`src/framework-entries.ts`), with the
// controllers' `server.get('Show', …)` the TypeScript extractor records.
// Requires resolve along the cartridge path in `src/imports.ts` through
// `./cartridges.ts`. Composable Storefront (PWA Kit) has an adapter of its own
// (`./pwa-kit.ts`); Apex (B2B Commerce) is not read.
//
// Pipeline: config side of the framework adapters (detect → files → parse);
// entry facts go on to `src/framework-entries.ts`. Entry points: `sfcc`,
// `parseSfccConfig`; key terms: cartridge, hook (observer), step type (cron).

import { posix } from "node:path";
import { isJsonObject, isJsonString, parseJson, type JsonValue } from "../json.ts";
import type { ConfigAt, ConfigFacts, EntryConfigFact, FrameworkAdapter, FrameworkContext } from "./adapter.ts";
import { cartridgeDirs } from "./cartridges.ts";

export const sfcc: FrameworkAdapter = {
  name: "sfcc",
  version: "1",
  detect(context) {
    return cartridgeDirs(context.sources).length > 0 || context.read("dw.json") !== null;
  },
  files(context) {
    const out: { path: string; owner: string | null }[] = [];

    const add = (path: string, owner: string): void => {
      if (!out.some((f) => f.path === path) && context.analysed(path) && context.read(path) !== null) out.push({ path, owner });
    };

    // Per cartridge: `package.json`, the hooks file it names (or the two usual
    // places when it names none), and `steptypes.json` at either level.
    for (const { dir } of cartridgeDirs(context.sources)) {
      add(`${dir}/package.json`, dir);
      const hooks = hooksFileOf(dir, context);

      if (hooks !== null) add(hooks, dir);
      else for (const path of [`${dir}/cartridge/scripts/hooks.json`, `${dir}/hooks.json`]) add(path, dir);
      add(`${dir}/steptypes.json`, dir);
      add(`${dir}/cartridge/steptypes.json`, dir);
    }

    // Sorted by path (code units) so the config file order is stable.
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse: parseSfccConfig,
};

/** The hooks file a cartridge's `package.json` names in `hooks`, relative to the cartridge; null when it names none. */
function hooksFileOf(dir: string, context: Pick<FrameworkContext, "read">): string | null {
  const hooks = field(readJson(context.read(`${dir}/package.json`)).value, "hooks");

  return isJsonString(hooks) ? posix.normalize(posix.join(dir, hooks)) : null;
}

/** Splits a path at `…/cartridges/<name>/`: group 1 is the cartridges directory, group 2 the cartridge. */
const CARTRIDGE_ROOT = /^((?:.*\/)?cartridges)\/([^/]+)(?:\/|$)/;

/**
 * Entry facts of one SFCC config file. `hooks.json` (`{"hooks": [{"name",
 * "script"}]}`): an `observer` per hook, its script written from the
 * cartridge's root (`./cartridge/scripts/…`) or from the hooks file, its fn
 * the hook's last segment (`dw.order.calculate` → `calculate`).
 * `steptypes.json` (`{"step-types": {"script-module-step": [{"@type-id",
 * "module", "function"}]}}`): a `cron` per step type, its `module` written
 * from the cartridges (`int_x/cartridge/scripts/steps/x`), its fn `function`
 * or, for a chunk step, `process-function`. A cartridge's `package.json`
 * names no entry: it is read for its `hooks`.
 */
export function parseSfccConfig(path: string, text: string): ConfigFacts {
  const facts: ConfigFacts = { path, scope: "global", bindings: [], arguments: [], aliases: [], intercepts: [], entries: [], error: null };
  const parsed = readJson(text);

  if (parsed.error !== null) return { ...facts, error: { line: 1, reason: `\`${path}\` is no JSON: ${parsed.error}` } };
  // Script paths are tried from the cartridges directory and from the cartridge
  // itself; a file outside any `cartridges/` falls back to its own directory.
  const root = CARTRIDGE_ROOT.exec(path);
  const cartridges = root === null ? posix.dirname(path) : root[1]!;
  const cartridge = root === null ? posix.dirname(path) : `${root[1]}/${root[2]}`;

  // Position of the first occurrence of `needle` in the text, for diagnostics; the file start when absent.
  const at = (needle: string): ConfigAt => {
    const offset = text.indexOf(needle);

    if (offset === -1) return { line: 1, col: 1 };
    const before = text.slice(0, offset).split("\n");

    return { line: before.length, col: before.at(-1)!.length + 1 };
  };

  const entries: EntryConfigFact[] = facts.entries!;

  // `step-types` maps each step kind to a list of steps; an array is accepted too.
  if (posix.basename(path) === "steptypes.json") {
    const kinds = field(parsed.value, "step-types");

    for (const steps of isJsonObject(kinds) ? Object.values(kinds) : Array.isArray(kinds) ? kinds : []) {
      for (const step of Array.isArray(steps) ? steps : []) {
        const id = field(step, "@type-id");
        const module = field(step, "module");

        if (!isJsonString(id) || !isJsonString(module)) continue;
        const fn = field(step, "function") ?? field(step, "process-function");
        entries.push({ kind: "cron", label: id, files: [posix.normalize(posix.join(cartridges, module)), posix.normalize(posix.join(cartridge, module))], fn: isJsonString(fn) ? fn : null, ...at(`"${id}"`) });
      }
    }
  // Any other config file is a hooks file; `package.json` yields no entries.
  } else if (posix.basename(path) !== "package.json") {
    const hooks = field(parsed.value, "hooks");

    for (const hook of Array.isArray(hooks) ? hooks : []) {
      const name = field(hook, "name");
      const script = field(hook, "script");

      if (!isJsonString(name) || !isJsonString(script)) continue;
      // The script is tried from the cartridge root and from the hooks file's directory, deduplicated.
      const files = [posix.normalize(posix.join(cartridge, script)), posix.normalize(posix.join(posix.dirname(path), script))];
      entries.push({ kind: "observer", label: name, files: [...new Set(files)], fn: name.slice(name.lastIndexOf(".") + 1), ...at(`"${name}"`) });
    }
  }

  return facts;
}

/** `value[key]` when `value` is a JSON object, else undefined. */
function field(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return isJsonObject(value) ? value[key] : undefined;
}

/** A config file's JSON, or why it does not parse; an absent file is `null` without an error. */
interface ParsedConfig {
  value: JsonValue;
  error: string | null;
}

/** Parse a JSON file, tolerating a BOM; the parse error message is kept for the config fact. */
function readJson(text: string | null): ParsedConfig {
  if (text === null) return { value: null, error: null };

  try {
    return { value: parseJson(text.replace(/^﻿/, "")), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}
