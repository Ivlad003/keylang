// `keylang.json`: what to index, how files map to layers, where specs live.
// Without a config file the layout is guessed from the directory tree
// (`keylang init` writes that guess down so it can be edited).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { globPrefix, globToRegExp, matchesGlob } from "./glob.ts";

export type Language = "typescript" | "javascript";

export interface Config {
  /** Repository root (directory of `keylang.json`). Absolute. */
  root: string;
  /** Directory with map/rules/flows, relative to root. */
  dir: string;
  languages: Language[];
  /** `file`: a file is a module (dir with `index.*` = module with submodules); `dir`: a directory is a module. */
  module: "file" | "dir";
  /** Layer name → globs (POSIX, relative to root). Insertion order = order in the map. */
  layers: Map<string, string[]>;
  /** Globs excluded from indexing, in addition to the built-in list. */
  exclude: string[];
  check: { tests?: string; trace?: string };
  /** True when the layout was guessed (no `layers` in the file). */
  guessed: boolean;
}

export const CONFIG_FILE = "keylang.json";

/** Directories never indexed. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "target", "vendor", "__pycache__"]);
/** Test and tooling files: kept out of the map (flows reference tests by path, §3.4). */
const DEFAULT_EXCLUDE = [
  "**/*.d.ts",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
  "**/stories/**",
  "**/*-snapshot.*",
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/e2e/**",
  "**/__mocks__/**",
  "*.config.*",
  "**/*.config.{js,cjs,mjs,ts}",
];

const EXT_LANG: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
};

/** A directory we never descend into: hidden, build output, or a nested repository. */
function skipDir(abs: string, name: string): boolean {
  return name.startsWith(".") || SKIP_DIRS.has(name) || existsSync(join(abs, ".git"));
}

export function languageOf(path: string): Language | undefined {
  const m = /\.[cm]?[jt]sx?$/.exec(path);
  return m ? EXT_LANG[m[0]] : undefined;
}

export interface RawConfig {
  dir?: string;
  languages?: Language[];
  module?: "file" | "dir";
  layers?: Record<string, string | string[]>;
  exclude?: string[];
  check?: { tests?: string; trace?: string };
}

/** Load `<root>/keylang.json`, or guess a config for `root`. */
export function loadConfig(root: string): Config {
  const file = join(root, CONFIG_FILE);
  const raw: RawConfig = existsSync(file) ? parseConfig(file, readFileSync(file, "utf8")) : {};
  const languages = raw.languages ?? detectLanguages(root);
  const exclude = raw.exclude ?? [];
  let layers: Map<string, string[]>;
  let guessed = false;
  if (raw.layers) {
    layers = new Map(Object.entries(raw.layers).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  } else {
    layers = guessLayers(root, exclude);
    guessed = true;
  }
  return {
    root,
    dir: raw.dir ?? "keylang",
    languages,
    module: raw.module ?? "file",
    layers,
    exclude,
    check: raw.check ?? {},
    guessed,
  };
}

/** Parse and validate `keylang.json`. Errors name the file and the field. */
export function parseConfig(file: string, text: string): RawConfig {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const fail = (field: string, expected: string, got: unknown): never => {
    throw new Error(`${file}: \`${field}\` must be ${expected}, got ${JSON.stringify(got)}`);
  };
  const validGlob = (field: string, glob: string): string => {
    try {
      globToRegExp(glob);
    } catch (e) {
      throw new Error(`${file}: \`${field}\`: invalid glob ${JSON.stringify(glob)}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return glob;
  };
  if (!isObject(value)) return fail("(root)", "an object", value);
  const known = new Set(["$schema", "dir", "languages", "module", "layers", "exclude", "check"]);
  for (const key of Object.keys(value)) if (!known.has(key)) throw new Error(`${file}: unknown field \`${key}\``);
  const raw: RawConfig = {};
  if (value.dir !== undefined) {
    raw.dir = typeof value.dir === "string" && value.dir !== "" ? value.dir : fail("dir", "a non-empty string", value.dir);
    // `map` writes under `dir`: it must not lead out of the repository.
    const normal = posix.normalize(raw.dir.replace(/\\/g, "/"));
    if (posix.isAbsolute(normal) || /^[A-Za-z]:/.test(normal) || normal === ".." || normal.startsWith("../")) fail("dir", "a directory inside the repository", value.dir);
  }
  if (value.languages !== undefined) {
    const list = value.languages;
    if (!Array.isArray(list)) return fail("languages", "an array", list);
    list.forEach((item, i) => {
      if (item !== "typescript" && item !== "javascript") fail(`languages[${i}]`, '"typescript" or "javascript"', item);
    });
    raw.languages = list as Language[];
  }
  if (value.module !== undefined) raw.module = value.module === "file" || value.module === "dir" ? value.module : fail("module", '"file" or "dir"', value.module);
  if (value.layers !== undefined) {
    if (!isObject(value.layers)) return fail("layers", "an object of layer → glob or globs", value.layers);
    const layers: Record<string, string | string[]> = {};
    for (const [name, globs] of Object.entries(value.layers)) {
      // A layer is the first segment of every ID under it; `core.domain` would be two.
      if (layerName(name) !== name) throw new Error(`${file}: layer name \`${name}\` must be one ID segment (letters, digits, \`_\`, \`$\`, \`-\`), e.g. \`${layerName(name)}\``);
      if (typeof globs === "string") layers[name] = validGlob(`layers.${name}`, globs);
      else if (Array.isArray(globs) && globs.every((glob) => typeof glob === "string")) layers[name] = (globs as string[]).map((glob, i) => validGlob(`layers.${name}[${i}]`, glob));
      else fail(`layers.${name}`, "a glob or an array of globs", globs);
    }
    raw.layers = layers;
  }
  if (value.exclude !== undefined) {
    if (!Array.isArray(value.exclude) || !value.exclude.every((glob) => typeof glob === "string")) return fail("exclude", "an array of globs", value.exclude);
    raw.exclude = (value.exclude as string[]).map((glob, i) => validGlob(`exclude[${i}]`, glob));
  }
  if (value.check !== undefined) {
    if (!isObject(value.check)) return fail("check", "an object", value.check);
    const check: { tests?: string; trace?: string } = {};
    for (const [key, path] of Object.entries(value.check)) {
      if (key !== "tests" && key !== "trace") throw new Error(`${file}: unknown field \`check.${key}\``);
      if (typeof path !== "string" || path === "") fail(`check.${key}`, "a path", path);
      check[key] = path as string;
    }
    raw.check = check;
  }
  return raw;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The config as it would be written by `keylang init`. */
export function configToJson(c: Config): string {
  const out: RawConfig & { $schema?: string } = {
    languages: c.languages,
    module: c.module,
    layers: Object.fromEntries(c.layers),
  };
  if (c.exclude.length > 0) out.exclude = c.exclude;
  if (c.dir !== "keylang") out.dir = c.dir;
  if (Object.keys(c.check).length > 0) out.check = c.check;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** All indexable source files under root, POSIX paths relative to root, sorted. */
export function sourceFiles(c: Config): string[] {
  return walkSources(c, (rel) => !isExcluded(rel, c.exclude));
}

/** Source files left out only by the `exclude` of `keylang.json`: their modules are opaque. */
export function excludedSourceFiles(c: Config): string[] {
  if (c.exclude.length === 0) return [];
  return walkSources(c, (rel) => !isExcluded(rel, []) && isExcluded(rel, c.exclude));
}

function walkSources(c: Config, keep: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const specDir = c.dir.replace(/\/$/, "");
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = toPosix(relative(c.root, abs));
      if (e.isDirectory()) {
        if (rel === specDir || skipDir(abs, e.name)) continue;
        walk(abs);
      } else if (e.isFile()) {
        const lang = languageOf(e.name);
        if (!lang || !c.languages.includes(lang)) continue;
        if (!keep(rel)) continue;
        out.push(rel);
      }
    }
  };
  walk(c.root);
  return out;
}

/**
 * Files named by `check.tests` / `check.trace`: a plain path (which must
 * exist) or a glob (which may match nothing yet, before the first test run).
 */
export function evidenceFiles(c: Config, field: "tests" | "trace"): string[] | null {
  const pattern = c.check[field];
  if (pattern === undefined) return null;
  if (!/[*?{[]/.test(pattern)) {
    if (!existsSync(join(c.root, pattern))) throw new Error(`${join(c.root, CONFIG_FILE)}: check.${field}: no such file \`${pattern}\``);
    return [pattern];
  }
  const base = globPrefix(pattern);
  const start = join(c.root, base);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = toPosix(relative(c.root, abs));
      if (e.isDirectory()) walk(abs);
      else if (matchesGlob(rel, pattern)) out.push(rel);
    }
  };
  if (existsSync(start) && statSync(start).isDirectory()) walk(start);
  return out.sort();
}

export function isExcluded(rel: string, extra: readonly string[]): boolean {
  return [...DEFAULT_EXCLUDE, ...extra].some((g) => matchesGlob(rel, g));
}

export function toPosix(p: string): string {
  return p.split("\\").join("/");
}

function detectLanguages(root: string): Language[] {
  const found = new Set<Language>();
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skipDir(join(dir, e.name), e.name)) walk(join(dir, e.name), depth + 1);
      } else {
        const l = languageOf(e.name);
        if (l && !e.name.endsWith(".d.ts")) found.add(l);
      }
    }
  };
  walk(root, 0);
  return [...found].sort();
}

/**
 * Zero-config layering: the source root is `src/` (or `lib/`) when present,
 * else the repository root. Each directory under it that holds source files
 * becomes a layer; files directly in the source root form the layer `main`.
 * With a separate source root, a top-level `bin/` becomes the layer `bin` and
 * source files in the repository root the layer `app` (entry scripts).
 */
export function guessLayers(root: string, exclude: readonly string[]): Map<string, string[]> {
  const srcRoot = ["src", "lib"].find((d) => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory()) ?? "";
  const layers = new Map<string, string[]>();
  if (srcRoot) {
    if (hasRootFiles(root, "", exclude)) layers.set("app", ["*"]);
    if (existsSync(join(root, "bin")) && hasSource(join(root, "bin"), "bin", exclude)) layers.set("bin", ["bin/**"]);
  }
  const base = srcRoot ? `${srcRoot}/` : "";
  const entries = readdirSync(join(root, srcRoot), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const rel = `${base}${e.name}`;
    if (!e.isDirectory() || skipDir(join(root, rel), e.name) || e.name === "keylang") continue;
    if (!srcRoot && (e.name === "bench" || e.name === "examples")) continue;
    if (matchesGlob(rel, "**/{test,tests,e2e,__tests__,__mocks__}")) continue;
    if (hasSource(join(root, rel), rel, exclude)) layers.set(layerName(e.name), [`${rel}/**`]);
  }
  if (hasRootFiles(root, srcRoot, exclude)) layers.set(layers.has("main") ? "main_" : "main", [`${base}*`]);
  return layers;
}

function hasRootFiles(root: string, dir: string, exclude: readonly string[]): boolean {
  return readdirSync(join(root, dir), { withFileTypes: true }).some((e) => e.isFile() && languageOf(e.name) !== undefined && !isExcluded(dir ? `${dir}/${e.name}` : e.name, exclude));
}

function hasSource(absDir: string, rel: string, exclude: readonly string[]): boolean {
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (!skipDir(join(absDir, e.name), e.name) && hasSource(join(absDir, e.name), r, exclude)) return true;
    } else if (languageOf(e.name) && !isExcluded(r, exclude)) {
      return true;
    }
  }
  return false;
}

/** Make a directory or file name a valid ID segment. */
export function layerName(name: string): string {
  let s = name.replace(/[^\p{Alphabetic}\p{N}_$-]/gu, "_");
  if (!/^[\p{Alphabetic}_$]/u.test(s)) s = `_${s}`;
  return s;
}
