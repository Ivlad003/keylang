// Salesforce Commerce Cloud cartridges (SFRA): where they are, the cartridge
// path they are searched in, and what an SFCC `require` names. A cartridge is
// a directory `…/cartridges/<name>/` with a `cartridge/` inside it; the
// cartridge path orders them, first cartridge first, and the platform answers
// `require('*/cartridge/scripts/x')` with the first cartridge on the path that
// has the file. `~/cartridge/x` is the requiring file's own cartridge,
// `<name>/cartridge/x` the named one, `module.superModule` the same path in the
// next cartridge after the current one, `dw/…` the platform API. The import
// resolver (`src/imports.ts`) asks here first; the SFCC adapter
// (`src/frameworks/sfcc.ts`) asks again to say when a guessed order decided.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The specifier the extractor records for `module.superModule` (`src/extract/ts.ts` writes the same literal). */
export const SUPER_MODULE = "module.superModule";

export interface Cartridge {
  name: string;
  /** Root-relative POSIX directory: `cartridges/app_custom`. */
  dir: string;
}

export interface CartridgeLayout {
  /** Every cartridge of the analysis, by name. */
  cartridges: Cartridge[];
  /** The search order: the configured path's cartridges that the repository has, else all of them by name. */
  path: Cartridge[];
  /** Where the order comes from: `keylang.json`, `dw.json`, `package.json`, or `guessed` (alphabetical). */
  source: "keylang.json" | "dw.json" | "package.json" | "guessed";
  /** `…/cartridges/modules`: bare requires (`require('server')`) resolve there, as on the platform. */
  modules: string[];
}

/** `…/cartridges/<name>/cartridge/…`: the cartridges directory and the cartridge's name. */
const CARTRIDGE_FILE = /^((?:.*\/)?cartridges)\/([^/]+)\/cartridge\//;
const MODULES_FILE = /^((?:.*\/)?cartridges)\/modules\//;

/** The cartridges the analysed files are in, by name; a name met twice is the first directory's. */
export function cartridgeDirs(sources: Iterable<string>): Cartridge[] {
  const byName = new Map<string, Cartridge>();
  for (const path of sources) {
    const match = CARTRIDGE_FILE.exec(path);
    if (match !== null && !byName.has(match[2]!)) byName.set(match[2]!, { name: match[2]!, dir: `${match[1]}/${match[2]}` });
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * The cartridges of the analysed files and their search order; null when the
 * repository has no cartridge and no `dw.json` — no SFCC. `configured`: the
 * `sfcc.cartridgePath` of keylang.json. Without it the order is a hint of
 * `dw.json` (`cartridgePath`/`cartridge_path` as `a:b` or a list, else the
 * upload list `cartridge`) or of the root `package.json` (`sfcc.cartridgePath`
 * or `cartridgePath`), else every cartridge by name — a guess.
 */
export function cartridgeLayout(root: string, sources: Iterable<string>, configured: readonly string[] | null): CartridgeLayout | null {
  const files = [...sources];
  const cartridges = cartridgeDirs(files);
  const byName = new Map(cartridges.map((c) => [c.name, c]));
  const modules = new Set<string>();
  for (const path of files) {
    const mod = MODULES_FILE.exec(path);
    if (mod !== null && !CARTRIDGE_FILE.test(path)) modules.add(`${mod[1]}/modules`);
  }
  const hint = cartridgePathHint(root);
  if (cartridges.length === 0 && hint.dw === false) return null;
  const order = (names: readonly string[]): Cartridge[] => names.flatMap((name) => byName.get(name) ?? []);
  let path: Cartridge[];
  let source: CartridgeLayout["source"];
  if (configured !== null) {
    path = order(configured);
    source = "keylang.json";
  } else if (hint.names !== null) {
    path = order(hint.names);
    source = hint.from!;
  } else {
    path = cartridges;
    source = "guessed";
  }
  return { cartridges, path, source, modules: [...modules].sort() };
}

/** The cartridge path `dw.json` or the root `package.json` writes, and whether `dw.json` exists. */
function cartridgePathHint(root: string): { names: string[] | null; from: "dw.json" | "package.json" | null; dw: boolean } {
  const dw = readJson(join(root, "dw.json"));
  const fromDw = dw === undefined ? null : (names(field(dw, "cartridgePath")) ?? names(field(dw, "cartridge_path")) ?? names(field(dw, "cartridgesPath")) ?? names(field(dw, "cartridge")));
  if (fromDw !== null) return { names: fromDw, from: "dw.json", dw: true };
  const pkg = readJson(join(root, "package.json"));
  const fromPkg = pkg === undefined ? null : (names(field(field(pkg, "sfcc"), "cartridgePath")) ?? names(field(pkg, "cartridgePath")));
  return { names: fromPkg, from: fromPkg === null ? null : "package.json", dw: dw !== undefined };
}

/** `a:b:c` as Business Manager writes it, or a list of names. */
function names(value: unknown): string[] | null {
  const list = typeof value === "string" ? value.split(":") : Array.isArray(value) ? value : null;
  if (list === null) return null;
  const out = list.filter((name): name is string => typeof name === "string").map((name) => name.trim()).filter((name) => name !== "");
  return out.length > 0 ? out : null;
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

/** A JSON file's value; undefined when it is absent, null when it does not parse. */
function readJson(path: string): unknown {
  let text: string;
  try {
    if (!statSync(path).isFile()) return undefined;
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

/** The cartridge a root-relative file belongs to; null outside every cartridge. */
export function cartridgeOf(layout: CartridgeLayout, file: string): Cartridge | null {
  const match = CARTRIDGE_FILE.exec(file);
  if (match === null) return null;
  return layout.cartridges.find((c) => c.dir === `${match[1]}/${match[2]}`) ?? null;
}

/**
 * What an SFCC specifier names from `fromFile`: `external` for the platform
 * API (`dw/…`); otherwise every file that answers, in the order the platform
 * tries them — the first one wins, a second one says the order decided —
 * where an empty list is a specifier keylang knows and no file answers.
 * Null for a specifier that is not SFCC's (`./x`, a package): the usual
 * resolution goes on. `probe` turns a candidate path into the source file it
 * names (extension and index probing), or null.
 */
export function cartridgeAnswers(layout: CartridgeLayout, fromFile: string, spec: string, probe: (candidate: string) => string | null): string[] | "external" | null {
  if (spec === "dw" || spec.startsWith("dw/")) return "external";
  const found = (dirs: readonly string[], rest: string): string[] => dirs.flatMap((dir) => probe(`${dir}/${rest}`) ?? []);
  if (spec === SUPER_MODULE) {
    const own = cartridgeOf(layout, fromFile);
    const at = own === null ? -1 : layout.path.findIndex((c) => c.dir === own.dir);
    if (own === null || at === -1) return [];
    const rest = fromFile.slice(own.dir.length + 1);
    return found(layout.path.slice(at + 1).map((c) => c.dir), rest);
  }
  if (spec.startsWith("*/")) return found(layout.path.map((c) => c.dir), spec.slice(2));
  if (spec.startsWith("~/")) {
    const own = cartridgeOf(layout, fromFile);
    return own === null ? [] : found([own.dir], spec.slice(2));
  }
  const slash = spec.indexOf("/");
  const head = slash === -1 ? spec : spec.slice(0, slash);
  const named = layout.cartridges.find((c) => c.name === head);
  if (named !== undefined && slash !== -1) return found([named.dir], spec.slice(slash + 1));
  // `require('server')`: the `modules` folder beside the cartridges, as the platform has it; else a package.
  if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("#")) {
    const modules = found(layout.modules, spec);
    if (modules.length > 0) return modules;
  }
  return null;
}
