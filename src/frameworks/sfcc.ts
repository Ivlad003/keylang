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

import { posix } from "node:path";
import type { ConfigFacts, EntryConfigFact, FrameworkAdapter, FrameworkContext } from "./adapter.ts";
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
    for (const { dir } of cartridgeDirs(context.sources)) {
      add(`${dir}/package.json`, dir);
      const hooks = hooksFileOf(dir, context);
      if (hooks !== null) add(hooks, dir);
      else for (const path of [`${dir}/cartridge/scripts/hooks.json`, `${dir}/hooks.json`]) add(path, dir);
      add(`${dir}/steptypes.json`, dir);
      add(`${dir}/cartridge/steptypes.json`, dir);
    }
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  },
  parse: parseSfccConfig,
};

/** The hooks file a cartridge's `package.json` names in `hooks`, relative to the cartridge; null when it names none. */
function hooksFileOf(dir: string, context: Pick<FrameworkContext, "read">): string | null {
  const hooks = field(parseJson(context.read(`${dir}/package.json`)).value, "hooks");
  return typeof hooks === "string" ? posix.normalize(posix.join(dir, hooks)) : null;
}

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
  const parsed = parseJson(text);
  if (parsed.error !== null) return { ...facts, error: { line: 1, reason: `\`${path}\` is no JSON: ${parsed.error}` } };
  const root = CARTRIDGE_ROOT.exec(path);
  const cartridges = root === null ? posix.dirname(path) : root[1]!;
  const cartridge = root === null ? posix.dirname(path) : `${root[1]}/${root[2]}`;
  const at = (needle: string): { line: number; col: number } => {
    const offset = text.indexOf(needle);
    if (offset === -1) return { line: 1, col: 1 };
    const before = text.slice(0, offset).split("\n");
    return { line: before.length, col: before.at(-1)!.length + 1 };
  };
  const entries: EntryConfigFact[] = facts.entries!;
  if (posix.basename(path) === "steptypes.json") {
    const kinds = field(parsed.value, "step-types");
    for (const steps of kinds !== null && typeof kinds === "object" ? Object.values(kinds) : []) {
      for (const step of Array.isArray(steps) ? steps : []) {
        const id = field(step, "@type-id");
        const module = field(step, "module");
        if (typeof id !== "string" || typeof module !== "string") continue;
        const fn = field(step, "function") ?? field(step, "process-function");
        entries.push({ kind: "cron", label: id, files: [posix.normalize(posix.join(cartridges, module)), posix.normalize(posix.join(cartridge, module))], fn: typeof fn === "string" ? fn : null, ...at(`"${id}"`) });
      }
    }
  } else if (posix.basename(path) !== "package.json") {
    const hooks = field(parsed.value, "hooks");
    for (const hook of Array.isArray(hooks) ? hooks : []) {
      const name = field(hook, "name");
      const script = field(hook, "script");
      if (typeof name !== "string" || typeof script !== "string") continue;
      const files = [posix.normalize(posix.join(cartridge, script)), posix.normalize(posix.join(posix.dirname(path), script))];
      entries.push({ kind: "observer", label: name, files: [...new Set(files)], fn: name.slice(name.lastIndexOf(".") + 1), ...at(`"${name}"`) });
    }
  }
  return facts;
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function parseJson(text: string | null): { value: unknown; error: string | null } {
  if (text === null) return { value: null, error: null };
  try {
    return { value: JSON.parse(text.replace(/^﻿/, "")), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}
