// `keylang.json`: what to index, how files map to layers, where specs live.
// Without a config file the layout is guessed from the directory tree
// (`keylang init` writes that guess down so it can be edited).

import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join, posix, relative } from "node:path";
import { firstMatchingGlob, globPrefix, globToRegExp, matchesGlob } from "./glob.ts";
import { isLanguage, LANGUAGE_NAMES, LANGUAGES, languageOf, type Language } from "./languages.ts";


/** The format `init` writes and a repository without `keylang.json` is read as. */
export const CURRENT_FORMAT = 2;

/** `1` keeps depth-sum priority. `2` is deny-overrides for incomparable rules. */
export type RuleFormat = 1 | 2;

/**
 * Which call edges prove a static path. `shape`: calls written in the code.
 * `behavior`: also the default of a hook and values resolved callers inject
 * for it — what runs, not only what is written.
 */
export type StaticMode = "behavior" | "shape";

export const STATIC_MODES: readonly StaticMode[] = ["behavior", "shape"];

/** Who chose the static mode. Absent when nobody set it and the mode is `behavior`. */
export type StaticSource = "flag" | "config";

/** Flag, then `check.static`, then `behavior`. */
export function resolveStatic(flag: StaticMode | undefined, configured: StaticMode | undefined): { mode: StaticMode; setBy?: StaticSource } {
  if (flag !== undefined) return { mode: flag, setBy: "flag" };
  if (configured !== undefined) return { mode: configured, setBy: "config" };
  return { mode: "behavior" };
}

export interface Config {
  /** Repository root (directory of `keylang.json`). Absolute. */
  root: string;
  /**
   * Rules edition. A file without the field is 1. No file at all is
   * {@link CURRENT_FORMAT}, so a new repository is not stuck on the old priority.
   */
  format: RuleFormat;
  /** Directory with map/rules/flows, relative to root. */
  dir: string;
  languages: Language[];
  /** `file`: a file is a module (dir with `index.*` = module with submodules); `dir`: a directory is a module. */
  module: "file" | "dir";
  /** Layer name → globs (POSIX, relative to root). Insertion order = order in the map. */
  layers: Map<string, string[]>;
  /** Globs excluded from indexing, in addition to the built-in list: opaque modules, a dependency hole. */
  exclude: string[];
  /**
   * Globs of code that is not part of the architecture (scripts, benchmarks):
   * modules of the synthetic layer `outside`, not analysed and not a hole.
   * Architecture code must not depend on them (K107).
   */
  outside: string[];
  /**
   * Globs of files the architecture imports but keylang neither reads nor
   * requires (generated code, configuration outside git): never indexed, even
   * when present; an import of one is no edge and no hole (`assumed-import`).
   */
  assume: string[];
  check: { tests?: string; trace?: string; static?: StaticMode };
  /** `anthropic:<model>`, `openrouter:<model>` or `cli:<name>[:<model>]` (an agent CLI); null: no model is configured. */
  agent: string | null;
  /** Voice input (`Ctrl+R`): which recognizer, and the OpenRouter model with audio input. */
  voice: { engine: "local" | "openrouter" | "auto"; model: string | null };
  /** Ghost text: pause in ms before the agent is asked for a next line (design §7.3); null: the default, 1500 ms for an agent CLI and 400 ms otherwise. */
  ghost: { delay: number | null };
  /** The clip in the TUI (ADR 0021); `clip: false` hides it and its status-line badge, F7 still opens its chat. Not part of the snapshot. */
  assistant: { clip: boolean };
  /**
   * Language and detail of LLM explanations (`keylang explain <id> --llm`);
   * `map`: `keylang map` also writes the explained map, `<dir>/map-explained/`.
   */
  explain: { lang: string; detail: "short" | "full"; map: boolean };
  /** `integrations.webhooks`: globs of files (or route paths) whose handlers are incoming webhooks (`keylang integrations`). Not part of the snapshot. */
  integrations: { webhooks: string[] };
  /** True when the layout was guessed (no `layers` in the file). */
  guessed: boolean;
  /**
   * The text of `keylang.json` this config was parsed from, null without the
   * file. A plan built on an analysis compares the disk with this text at its
   * commit, so a save made while the analysis ran refuses the write instead
   * of becoming the new base.
   */
  text: string | null;
}

/** The agent CLIs keylang knows how to run as a model (`cli:<name>`); other names are defined in `~/.config/keylang/agents.json`. */
export const AGENT_CLI_PRESETS = ["claude", "codex", "opencode", "cursor"] as const;

/** What a valid `agent` looks like, for error messages. */
export const AGENT_FORMS = '"anthropic:<model>", "openrouter:<model>" or "cli:<name>[:<model>]" (a model has no spaces, `<`, `>` or `--` and does not start with `-`)';

// A model is one argv element after `--model` and, for every provider, a value
// in the header of a saved explanation: a leading `-` would be read as a flag,
// `--`/`<`/`>` would break `<!-- keylang:explain agent=… -->`.
const MODEL = String.raw`(?!-)(?!.*--)[^\s<>]+`;
const AGENT_PATTERN = new RegExp(String.raw`^(?:anthropic|openrouter):${MODEL}$|^cli:[a-z][a-z0-9-]*(?::${MODEL})?$`);

/** `agent` as `keylang.json`, `KEYLANG_AGENT` and `agents.json` "use" accept it. */
export function isAgent(value: string): boolean {
  return AGENT_PATTERN.test(value);
}

/** The agent runs through an agent CLI (`cli:claude`), not an API. */
export function isCliAgent(agent: string | null): boolean {
  return agent !== null && agent.startsWith("cli:");
}

export const CONFIG_FILE = "keylang.json";

/**
 * Layers keylang makes itself: packages outside the repository, files outside
 * every layer, and files `outside` in `keylang.json` puts outside the architecture.
 */
export const SYNTHETIC_LAYERS = ["external", "unassigned", "outside"] as const;

/** The synthetic layer of the files `outside` names. */
export const OUTSIDE_LAYER = "outside";

/**
 * Names a layer cannot have: the synthetic layers (a layer of that name would
 * merge with them) and the keywords at the top of a map, where the generated
 * map writes a layer as a bare `- <name>` (`- module` would be a rule).
 */
export const RESERVED_LAYER_NAMES: ReadonlySet<string> = new Set([...SYNTHETIC_LAYERS, "layer", "layers", "allow", "deny", "entry", "module", "no-cycles"]);

/** Directories never indexed. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "target", "vendor", "__pycache__", "venv", "site-packages"]);
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
  "**/test_*.py",
  "**/*_test.py",
  "**/conftest.py",
  // PHPUnit test classes, and the PHP that Laravel and Symfony compile into their caches.
  "**/*Test.php",
  "**/bootstrap/cache/**",
  "**/storage/framework/**",
  "**/var/cache/**",
  "*.config.*",
  "**/*.config.{js,cjs,mjs,ts}",
];

/** A directory we never descend into: hidden, build output, or a nested repository. */
function skipDir(abs: string, name: string): boolean {
  return name.startsWith(".") || SKIP_DIRS.has(name) || existsSync(join(abs, ".git"));
}

export interface RawConfig {
  format?: RuleFormat;
  dir?: string;
  languages?: Language[];
  module?: "file" | "dir";
  layers?: Record<string, string | string[]>;
  exclude?: string[];
  outside?: string[];
  assume?: string[];
  check?: { tests?: string; trace?: string; static?: StaticMode };
  agent?: string;
  ghost?: { delay?: number | null };
  assistant?: { clip?: boolean };
  voice?: { engine?: "local" | "openrouter" | "auto"; model?: string };
  explain?: { lang?: string; detail?: "short" | "full"; map?: boolean };
  integrations?: { webhooks?: string[] };
}

/** Load `<root>/keylang.json`, or guess a config for `root`. */
export function loadConfig(root: string): Config {
  const file = join(root, CONFIG_FILE);
  const fileExists = existsSync(file);
  const text = fileExists ? readFileSync(file, "utf8") : null;
  const raw: RawConfig = text !== null ? parseConfig(file, text) : {};
  const languages = raw.languages ?? detectLanguages(root);
  const exclude = raw.exclude ?? [];
  const outside = raw.outside ?? [];
  const assume = raw.assume ?? [];
  let layers: Map<string, string[]>;
  let guessed = false;
  if (raw.layers) {
    layers = new Map(Object.entries(raw.layers).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  } else {
    layers = guessLayers(root, [...exclude, ...outside, ...assume]);
    guessed = true;
  }
  return {
    root,
    format: fileExists ? (raw.format ?? 1) : CURRENT_FORMAT,
    dir: raw.dir ?? "keylang",
    languages,
    module: raw.module ?? defaultModule(languages),
    layers,
    exclude,
    outside,
    assume,
    check: raw.check ?? {},
    agent: raw.agent ?? null,
    ghost: { delay: raw.ghost?.delay ?? null },
    assistant: { clip: raw.assistant?.clip ?? true },
    voice: { engine: raw.voice?.engine ?? "auto", model: raw.voice?.model ?? null },
    explain: { lang: raw.explain?.lang ?? "en", detail: raw.explain?.detail ?? "short", map: raw.explain?.map ?? false },
    integrations: { webhooks: raw.integrations?.webhooks ?? [] },
    guessed,
    text,
  };
}

/** The languages' own module granularity when they agree; a file otherwise. */
function defaultModule(languages: readonly Language[]): Config["module"] {
  const modes = new Set(languages.map((name) => LANGUAGES[name].module));
  return modes.size === 1 ? [...modes][0]! : "file";
}

/**
 * `text` without a leading U+FEFF: a JSON file saved with a UTF-8 BOM
 * (PowerShell 5.1 `-Encoding UTF8`, old Notepad, Visual Studio) is the same
 * JSON, as Node and npm read a `package.json`, and as the `.md` parser, test
 * reports and trace already read theirs.
 */
export function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse and validate `keylang.json`. Errors name the file and the field. */
export function parseConfig(file: string, text: string): RawConfig {
  let value: unknown;
  try {
    value = JSON.parse(withoutBom(text));
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
  const known = new Set(["$schema", "format", "dir", "languages", "module", "layers", "exclude", "outside", "assume", "check", "agent", "explain", "ghost", "assistant", "voice", "integrations"]);
  for (const key of Object.keys(value)) if (!known.has(key)) throw new Error(`${file}: unknown field \`${key}\``);
  const raw: RawConfig = {};
  if (value.format !== undefined) raw.format = acceptFormat(file, value.format);
  if (value.dir !== undefined) {
    const dir = typeof value.dir === "string" && value.dir !== "" ? value.dir : fail("dir", "a non-empty string", value.dir);
    // `map` writes under `dir`: it must not lead out of the repository.
    const normal = posix.normalize(dir.replace(/\\/g, "/"));
    if (posix.isAbsolute(normal) || /^[A-Za-z]:/.test(normal) || normal === ".." || normal.startsWith("../")) fail("dir", "a directory inside the repository", value.dir);
    // `./keylang` and `keylang/` are `keylang`: the spec directory is compared with walked paths as written.
    raw.dir = normal.replace(/\/+$/, "") || ".";
  }
  if (value.languages !== undefined) {
    const list = value.languages;
    if (!Array.isArray(list)) return fail("languages", "an array", list);
    list.forEach((item, i) => {
      if (!isLanguage(item)) fail(`languages[${i}]`, `one of ${LANGUAGE_NAMES.map((name) => JSON.stringify(name)).join(", ")}`, item);
    });
    raw.languages = list as Language[];
  }
  if (value.module !== undefined) raw.module = value.module === "file" || value.module === "dir" ? value.module : fail("module", '"file" or "dir"', value.module);
  if (value.layers !== undefined) {
    if (!isObject(value.layers)) return fail("layers", "an object of layer → glob or globs", value.layers);
    const layers: Record<string, string | string[]> = {};
    const written = new Map<string, string>();
    for (const [key, globs] of Object.entries(value.layers)) {
      // IDs are NFC: a name typed in NFD is the same layer as the one a spec names.
      const name = key.normalize("NFC");
      const other = written.get(name);
      if (other !== undefined) throw new Error(`${file}: \`layers.${key}\` is the layer \`layers.${other}\` written in another Unicode normalization; keep one`);
      written.set(name, key);
      // A layer is the first segment of every ID under it; `core.domain` would be two.
      if (layerName(name) !== name) throw new Error(`${file}: layer name \`${name}\` must be one ID segment (letters, digits, \`_\`, \`$\`, \`-\`), e.g. \`${layerName(name)}\``);
      if (RESERVED_LAYER_NAMES.has(name)) throw new Error(`${file}: \`layers.${name}\`: ${reservedReason(name)}; rename the layer, e.g. \`${name}_\``);
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
  if (value.outside !== undefined) {
    if (!Array.isArray(value.outside) || !value.outside.every((glob) => typeof glob === "string")) return fail("outside", "an array of globs", value.outside);
    raw.outside = (value.outside as string[]).map((glob, i) => validGlob(`outside[${i}]`, glob));
  }
  if (value.assume !== undefined) {
    if (!Array.isArray(value.assume) || !value.assume.every((glob) => typeof glob === "string")) return fail("assume", "an array of globs", value.assume);
    raw.assume = (value.assume as string[]).map((glob, i) => validGlob(`assume[${i}]`, glob));
  }
  if (value.check !== undefined) {
    if (!isObject(value.check)) return fail("check", "an object", value.check);
    const check: { tests?: string; trace?: string; static?: StaticMode } = {};
    for (const [key, path] of Object.entries(value.check)) {
      if (key === "static") {
        if (path === "behavior" || path === "shape") check.static = path;
        else fail("check.static", '"behavior" or "shape"', path);
        continue;
      }
      if (key !== "tests" && key !== "trace") throw new Error(`${file}: unknown field \`check.${key}\``);
      if (typeof path === "string" && path !== "") check[key] = path;
      else fail(`check.${key}`, "a path", path);
    }
    raw.check = check;
  }
  if (value.agent !== undefined) {
    raw.agent = typeof value.agent === "string" && isAgent(value.agent) ? value.agent : fail("agent", AGENT_FORMS, value.agent);
  }
  if (value.ghost !== undefined) {
    if (!isObject(value.ghost)) return fail("ghost", "an object", value.ghost);
    for (const [key, v] of Object.entries(value.ghost)) {
      if (key !== "delay") throw new Error(`${file}: unknown field \`ghost.${key}\``);
      if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10000)) fail("ghost.delay", "milliseconds from 0 to 10000, or null for the default", v);
    }
    raw.ghost = value.ghost as { delay?: number | null };
  }
  if (value.assistant !== undefined) {
    if (!isObject(value.assistant)) return fail("assistant", "an object", value.assistant);
    const assistant: NonNullable<RawConfig["assistant"]> = {};
    for (const [key, v] of Object.entries(value.assistant)) {
      if (key !== "clip") throw new Error(`${file}: unknown field \`assistant.${key}\``);
      assistant.clip = typeof v === "boolean" ? v : fail("assistant.clip", "true or false", v);
    }
    raw.assistant = assistant;
  }
  if (value.voice !== undefined) {
    if (!isObject(value.voice)) return fail("voice", "an object", value.voice);
    const voice: NonNullable<RawConfig["voice"]> = {};
    for (const [key, v] of Object.entries(value.voice)) {
      if (key === "engine") voice.engine = v === "local" || v === "openrouter" || v === "auto" ? v : fail("voice.engine", '"local", "openrouter" or "auto"', v);
      else if (key === "model") voice.model = typeof v === "string" && v !== "" ? v : fail("voice.model", "a model name", v);
      else throw new Error(`${file}: unknown field \`voice.${key}\``);
    }
    raw.voice = voice;
  }
  if (value.explain !== undefined) {
    if (!isObject(value.explain)) return fail("explain", "an object", value.explain);
    const explain: NonNullable<RawConfig["explain"]> = {};
    for (const [key, v] of Object.entries(value.explain)) {
      if (key === "lang") explain.lang = typeof v === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(v) ? v : fail("explain.lang", "a language code such as \"uk\"", v);
      else if (key === "detail") explain.detail = v === "short" || v === "full" ? v : fail("explain.detail", '"short" or "full"', v);
      else if (key === "map") explain.map = typeof v === "boolean" ? v : fail("explain.map", "true or false", v);
      else throw new Error(`${file}: unknown field \`explain.${key}\``);
    }
    raw.explain = explain;
  }
  if (value.integrations !== undefined) {
    if (!isObject(value.integrations)) return fail("integrations", "an object", value.integrations);
    const integrations: NonNullable<RawConfig["integrations"]> = {};
    for (const [key, v] of Object.entries(value.integrations)) {
      if (key !== "webhooks") throw new Error(`${file}: unknown field \`integrations.${key}\``);
      if (!Array.isArray(v) || !v.every((glob) => typeof glob === "string")) return fail("integrations.webhooks", "an array of globs", v);
      integrations.webhooks = (v as string[]).map((glob, i) => validGlob(`integrations.webhooks[${i}]`, glob));
    }
    raw.integrations = integrations;
  }
  return raw;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `format` when it is present: a positive integer this keylang can read. */
export function acceptFormat(file: string, got: unknown): RuleFormat {
  if (typeof got !== "number" || !Number.isInteger(got) || got < 1) {
    throw new Error(`${file}: \`format\` must be a positive integer, got ${JSON.stringify(got)}`);
  }
  if (got > CURRENT_FORMAT) {
    throw new Error(`${file}: \`format\` ${got} is newer than this keylang reads (${CURRENT_FORMAT}); upgrade keylang`);
  }
  return got as RuleFormat;
}

/**
 * `fmt` and `parse` read nothing of the config except `format`. Invalid JSON
 * or a non-object root cannot tell them the edition, so they stop.
 */
export function assertFormatOnly(file: string, text: string): void {
  let value: unknown;
  try {
    value = JSON.parse(withoutBom(text));
  } catch (e) {
    throw new Error(`${file}: cannot determine \`format\`: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isObject(value)) throw new Error(`${file}: cannot determine \`format\`: the file is not a JSON object`);
  if (value.format !== undefined) acceptFormat(file, value.format);
}

/** The config as it would be written by `keylang init`. */
export function configToJson(c: Config): string {
  const out: RawConfig & { $schema?: string } = {
    format: c.format,
    languages: c.languages,
    module: c.module,
    layers: Object.fromEntries(c.layers),
  };
  if (c.exclude.length > 0) out.exclude = c.exclude;
  if (c.outside.length > 0) out.outside = c.outside;
  if (c.dir !== "keylang") out.dir = c.dir;
  if (Object.keys(c.check).length > 0) out.check = c.check;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * `text` (a `keylang.json` as written or being edited) with only its
 * `layers` replaced: every other field stays, unknown ones included, in
 * its order; a missing `layers` is appended. Whitespace is not kept (the
 * result is 2-space JSON). Text that is not a JSON object is never repaired
 * by guessing: its reason, named as `parseConfig` names it.
 */
export function withLayers(file: string, text: string, layers: Readonly<Record<string, readonly string[]>>): { text: string } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(withoutBom(text));
  } catch (e) {
    return { error: `${file}: invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isObject(value)) return { error: `${file}: \`(root)\` must be an object, got ${JSON.stringify(value)}` };
  // Assigning keeps the key's place when it exists; JSON.parse makes even `__proto__` an own key, so nothing is lost.
  value.layers = Object.fromEntries(Object.entries(layers).map(([name, globs]) => [name, [...globs]]));
  return { text: `${JSON.stringify(value, null, 2)}\n` };
}

/** All indexable source files under root, POSIX paths relative to root, sorted. */
export function sourceFiles(c: Config): string[] {
  return classifySources(c).analysed;
}

/**
 * The indexable source files and the directories that could not be listed
 * (no permission): their files are unknown, which is a hole, not an absence.
 */
export function sourceTree(c: Config): { files: string[]; unreadable: { dir: string; reason: string }[] } {
  const sources = classifySources(c);
  return { files: sources.analysed, unreadable: sources.unreadable };
}

/** Every source file of the configured languages by what keylang does with it; paths in walk order. */
export interface SourceClasses {
  /** Read and indexed. */
  analysed: string[];
  /** Left out by `exclude` only: opaque modules of their layer, a dependency hole. */
  excluded: string[];
  /** Put outside the architecture by `outside`: opaque modules of the layer `outside`, no hole. */
  outside: string[];
  /** Named by `assume`: never indexed, and an import of one is no hole. */
  assumed: string[];
  /** Directories that could not be listed (no permission): their files are unknown, a hole, not an absence. */
  unreadable: { dir: string; reason: string }[];
}

/** The source files by class, from one walk of the tree. */
export function classifySources(c: Config): SourceClasses {
  const sources: SourceClasses = { analysed: [], excluded: [], outside: [], assumed: [], unreadable: [] };
  for (const rel of walkSources(c, sources.unreadable)) {
    const kind = sourceClass(rel, c);
    if (kind !== null) sources[kind].push(rel);
  }
  return sources;
}

/**
 * What keylang does with a source file; null when the built-in list leaves it
 * out (tests, declaration files). The built-in list wins over `assume`,
 * `assume` over `outside`, and `outside` over `exclude`.
 */
export function sourceClass(rel: string, c: Pick<Config, "exclude" | "outside" | "assume">): "analysed" | "excluded" | "outside" | "assumed" | null {
  if (matchesAny(rel, DEFAULT_EXCLUDE)) return null;
  if (matchesAny(rel, c.assume)) return "assumed";
  if (matchesAny(rel, c.outside)) return "outside";
  return matchesAny(rel, c.exclude) ? "excluded" : "analysed";
}

/** A source file keylang reads: not left out by the built-in list, `assume`, `exclude` or `outside`. */
export function isAnalysed(rel: string, c: Pick<Config, "exclude" | "outside" | "assume">): boolean {
  return sourceClass(rel, c) === "analysed";
}

/** A path `assume` names: keylang neither reads nor requires it. */
export function isAssumed(rel: string, c: Pick<Config, "assume">): boolean {
  return matchesAny(rel, c.assume);
}

export function isOutside(rel: string, outside: readonly string[]): boolean {
  return matchesAny(rel, outside);
}

function matchesAny(rel: string, globs: readonly string[]): boolean {
  return firstMatchingGlob(rel, globs) !== null;
}

/**
 * Layer globs of keylang.json that likely do not say what was meant: files
 * the globs of two layers both match — the layer listed first takes them —
 * and a glob that matches no source file. `files` are the files layers place:
 * read or excluded. Warnings, not errors: the layout works as written. One
 * line per pair of layers and the glob that won, then per unmatched glob, in
 * the order of keylang.json.
 */
export function layerGlobWarnings(c: Pick<Config, "layers">, files: readonly string[]): string[] {
  const layers = [...c.layers];
  const matched = new Set<string>();
  const overlaps = new Map<string, { winner: number; glob: number; other: number; count: number; example: string }>();
  for (const file of files) {
    let winner: { layer: number; glob: number } | null = null;
    for (const [layer, [, globs]] of layers.entries()) {
      let first = -1;
      for (const [i, glob] of globs.entries()) {
        if (!matchesGlob(file, glob)) continue;
        matched.add(`${layer}/${i}`);
        if (first === -1) first = i;
      }
      if (first === -1) continue;
      if (winner === null) {
        winner = { layer, glob: first };
        continue;
      }
      const key = `${winner.layer}/${winner.glob}/${layer}`;
      const known = overlaps.get(key);
      if (known) known.count++;
      else overlaps.set(key, { winner: winner.layer, glob: winner.glob, other: layer, count: 1, example: file });
    }
  }
  const name = (layer: number): string => layers[layer]![0];
  const warnings = [...overlaps.values()]
    .sort((a, b) => a.winner - b.winner || a.glob - b.glob || a.other - b.other)
    .map(
      (o) =>
        `${CONFIG_FILE}: ${o.count} file(s) match the globs of both \`layers.${name(o.winner)}\` and \`layers.${name(o.other)}\` (e.g. \`${o.example}\`); the layer listed first takes them: \`${name(o.winner)}\` by \`${layers[o.winner]![1][o.glob]}\``,
    );
  for (const [i, [layer, globs]] of layers.entries()) {
    for (const [j, glob] of globs.entries()) {
      if (!matched.has(`${i}/${j}`)) warnings.push(`${CONFIG_FILE}: \`layers.${layer}\`: \`${glob}\` matches no source file`);
    }
  }
  return warnings;
}

/**
 * Source files of the configured languages under the root, depth first with
 * names in code-unit order; the spec directory, hidden and build directories
 * and nested repositories are skipped. A subdirectory that cannot be listed
 * goes to `unreadable`; the root itself is an I/O error.
 */
function walkSources(c: Config, unreadable: { dir: string; reason: string }[]): string[] {
  const out: string[] = [];
  const specDir = c.dir.replace(/\/$/, "");
  const walk = (abs: string, rel: string): void => {
    let listed: Dirent[];
    try {
      listed = readdirSync(abs, { withFileTypes: true });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (abs === c.root || (code !== "EACCES" && code !== "EPERM")) throw error;
      unreadable.push({ dir: rel, reason: `directory is not readable (${code})` });
      return;
    }
    const entries = listed.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const path = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        const child = join(abs, e.name);
        if (path === specDir || skipDir(child, e.name)) continue;
        walk(child, path);
      } else if (e.isFile()) {
        const lang = languageOf(e.name);
        if (lang && c.languages.includes(lang)) out.push(path);
      }
    }
  };
  walk(c.root, "");
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
  return matchesAny(rel, DEFAULT_EXCLUDE) || matchesAny(rel, extra);
}

export function toPosix(p: string): string {
  return p.split("\\").join("/");
}

/**
 * `rest` under the spec directory `dir`, relative to the root and POSIX, as
 * the analysis names its documents: `keylang/features/f1.md`, or plain
 * `features/f1.md` when `dir` is `.` (the root). Every path keylang builds
 * under `dir` goes through here: `./features/f1.md` would match no document
 * and fail the write policy's «plain relative path».
 */
export function specPath(dir: string, rest: string): string {
  return dir === "." || dir === "" ? rest : `${dir}/${rest}`;
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
 * else the one Python package in the repository root when it is the only
 * layer candidate there and has subdirectories with code (`app/` with
 * `app/__init__.py`), else the repository root. Each directory under the
 * source root that holds source files becomes a layer; files directly in the
 * source root form the layer `main`. With a separate source root, a top-level
 * `bin/` becomes the layer `bin` and source files in the repository root the
 * layer `app` (entry scripts).
 */
export function guessLayers(root: string, exclude: readonly string[]): Map<string, string[]> {
  return guessLayout(root, exclude).layers;
}

/**
 * The guessed layers, and a note for every directory whose layer name had to
 * change: a reserved name (`src/external/` → `external_`) or one that another
 * directory already sanitizes to (`2fa` and `_2fa` → `_2fa`, `_2fa_2`).
 */
export function guessLayout(root: string, exclude: readonly string[]): { layers: Map<string, string[]>; notes: string[] } {
  const srcRoot = sourceRoot(root, exclude);
  const layers = new Map<string, string[]>();
  const owners = new Map<string, string>();
  const notes: string[] = [];
  const add = (wanted: string, what: string, globs: string[]): void => {
    const name = freeLayerName(wanted, layers);
    if (name !== wanted) {
      const why = RESERVED_LAYER_NAMES.has(wanted) ? reservedReason(wanted) : `\`${wanted}\` is already the layer of ${owners.get(wanted) ?? "another directory"}`;
      notes.push(`${what} is layer \`${name}\`: ${why}`);
    }
    layers.set(name, globs);
    owners.set(name, what);
  };
  if (srcRoot) {
    if (hasRootFiles(root, "", exclude)) add("app", "the files in the repository root", ["*"]);
    if (existsSync(join(root, "bin")) && hasSource(join(root, "bin"), "bin", exclude)) add("bin", "`bin/`", ["bin/**"]);
  }
  const base = srcRoot ? `${srcRoot}/` : "";
  for (const { name, rel } of layerDirs(root, srcRoot, exclude)) add(layerName(name), `\`${rel}/\``, [`${rel}/**`]);
  if (hasRootFiles(root, srcRoot, exclude)) add("main", srcRoot ? `the files in \`${srcRoot}/\`` : "the files in the repository root", [`${base}*`]);
  return { layers, notes };
}

/**
 * `src` or `lib`; else the one directory the root `composer.json` maps its
 * PSR-4 namespaces to (Laravel's `app/`); else the single layer candidate of
 * the repository root when it is a Python package (`__init__.py`) whose
 * subdirectories hold code — one layer for the whole application would leave
 * nothing to rule; else `""`.
 */
function sourceRoot(root: string, exclude: readonly string[]): string {
  const conventional = ["src", "lib"].find((d) => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory());
  if (conventional) return conventional;
  const psr4 = composerSourceRoot(root);
  if (psr4 !== null) return psr4;
  const top = layerDirs(root, "", exclude);
  if (top.length !== 1) return "";
  const only = top[0]!.rel;
  return existsSync(join(root, only, "__init__.py")) && layerDirs(root, only, exclude).length > 0 ? only : "";
}

/** The single directory of the root `composer.json`'s `autoload.psr-4`, when it maps every namespace there; null otherwise. */
function composerSourceRoot(root: string): string | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(withoutBom(readFileSync(join(root, "composer.json"), "utf8")));
  } catch {
    return null;
  }
  const autoload = manifest !== null && typeof manifest === "object" ? (manifest as Record<string, unknown>).autoload : undefined;
  const psr4 = autoload !== null && typeof autoload === "object" ? (autoload as Record<string, unknown>)["psr-4"] : undefined;
  if (psr4 === null || typeof psr4 !== "object" || Array.isArray(psr4)) return null;
  const dirs = new Set<string>();
  for (const value of Object.values(psr4)) {
    for (const dir of Array.isArray(value) ? value : [value]) {
      if (typeof dir !== "string") return null;
      dirs.add(toPosix(dir).replace(/^\.\//, "").replace(/\/+$/, ""));
    }
  }
  const [only] = dirs;
  if (dirs.size !== 1 || only === undefined || only === "" || only === "." || only.startsWith("..") || only.includes("*")) return null;
  return existsSync(join(root, only)) && statSync(join(root, only)).isDirectory() ? only : null;
}

/** The directories directly under `dir` (repository-relative, `""` for the root) that become layers. */
function layerDirs(root: string, dir: string, exclude: readonly string[]): { name: string; rel: string }[] {
  const base = dir ? `${dir}/` : "";
  const out: { name: string; rel: string }[] = [];
  const entries = readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const rel = `${base}${e.name}`;
    if (!e.isDirectory() || skipDir(join(root, rel), e.name) || e.name === "keylang") continue;
    if (!dir && (e.name === "bench" || e.name === "examples")) continue;
    if (matchesGlob(rel, "**/{test,tests,e2e,__tests__,__mocks__}")) continue;
    if (hasSource(join(root, rel), rel, exclude)) out.push({ name: e.name, rel });
  }
  return out;
}

/** `wanted`, or the first free variant: a reserved name gets `_`, a taken one a number (`_2fa_2`). */
function freeLayerName(wanted: string, taken: ReadonlyMap<string, unknown>): string {
  const first = RESERVED_LAYER_NAMES.has(wanted) ? `${wanted}_` : wanted;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n++) {
    const name = `${wanted}_${n}`;
    if (!taken.has(name)) return name;
  }
}

function reservedReason(name: string): string {
  if (name === "external") return "`external` is reserved for packages outside the repository";
  if (name === "unassigned") return "`unassigned` is reserved for files outside every layer";
  if (name === OUTSIDE_LAYER) return "`outside` is reserved for files `outside` puts outside the architecture";
  return `\`${name}\` is a keyword at the top of a map`;
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

/** Same predicate as `isSegment`. Duplicated so `base` does not import `lang`. */
function isIdSegment(s: string): boolean {
  return /^[\p{Alphabetic}_$][\p{Alphabetic}\p{M}\p{N}_$-]*$/u.test(s);
}

const ID_BODY = /^[\p{Alphabetic}\p{M}\p{N}_-]$/u;
const ID_START = /^[\p{Alphabetic}_]$/u;
const utf8 = new TextEncoder();
const utf8Text = new TextDecoder();

/**
 * Next-style route segments keep a readable ID: the bracket form becomes a
 * prefix no hex escape can start (`$g`, `$p`, `$o`, `$al` are not `$HH`).
 * Longest form first: `[[...x]]` before `[...x]` before `[x]`.
 */
const ROUTE_FORMS: readonly { prefix: string; pattern: RegExp; wrap: (inner: string) => string }[] = [
  { prefix: "$opt-", pattern: /^\[\[\.\.\.([\p{Alphabetic}\p{M}\p{N}_-]+)\]\]$/u, wrap: (inner) => `[[...${inner}]]` },
  { prefix: "$all-", pattern: /^\[\.\.\.([\p{Alphabetic}\p{M}\p{N}_-]+)\]$/u, wrap: (inner) => `[...${inner}]` },
  { prefix: "$p-", pattern: /^\[([\p{Alphabetic}\p{M}\p{N}_-]+)\]$/u, wrap: (inner) => `[${inner}]` },
  { prefix: "$g-", pattern: /^\(([\p{Alphabetic}\p{M}\p{N}_-]+)\)$/u, wrap: (inner) => `(${inner})` },
];

/**
 * A path segment that is not an ID and contains `()[]`, written so
 * `decodeLayerName` restores it. A Next route form (`(shop)`, `[id]`,
 * `[...slug]`, `[[...slug]]`) gets a readable prefix (`$g-shop`, `$p-id`,
 * `$all-slug`, `$opt-slug`); any other name keeps its letters and writes each
 * other UTF-8 byte as `$` plus two lowercase hex digits (`(` is `$28`).
 */
function encodeBracketSegment(name: string): string {
  for (const form of ROUTE_FORMS) {
    const inner = form.pattern.exec(name)?.[1];
    if (inner !== undefined) return `${form.prefix}${inner}`;
  }
  let out = "";
  let started = false;
  for (const ch of name) {
    const keep = ID_BODY.test(ch) && (started || ID_START.test(ch));
    if (keep) {
      out += ch;
      started = true;
      continue;
    }
    for (const b of utf8.encode(ch)) out += `$${b.toString(16).padStart(2, "0")}`;
    started = true;
  }
  return out;
}

/** Inverse of the bracket encoding in `layerName`. A segment without a route prefix or `$HH` is unchanged. */
export function decodeLayerName(segment: string): string {
  for (const form of ROUTE_FORMS) {
    if (segment.startsWith(form.prefix)) return form.wrap(segment.slice(form.prefix.length));
  }
  const bytes: number[] = [];
  for (let i = 0; i < segment.length; ) {
    const hex = segment[i] === "$" ? segment.slice(i + 1, i + 3) : "";
    if (/^[0-9a-f]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 3;
      continue;
    }
    const cp = segment.codePointAt(i)!;
    for (const b of utf8.encode(String.fromCodePoint(cp))) bytes.push(b);
    i += cp > 0xffff ? 2 : 1;
  }
  return utf8Text.decode(Uint8Array.from(bytes));
}

/**
 * Make a directory or file name a valid ID segment, in Unicode NFC.
 * An existing segment is kept. Without `()[]`, any other character becomes `_`.
 * Brackets (and the rest of that name) are encoded reversibly — see `decodeLayerName`.
 */
export function layerName(written: string): string {
  // IDs are NFC: a directory macOS stores in NFD (`cafe` + U+0301) and the
  // same name typed in a spec (`café`) look alike, so they are one ID.
  const name = written.normalize("NFC");
  // Only a name that is not already a segment, and only when it has brackets.
  // `cats.controller` still collapses the dot; `_shop_` is already a segment.
  if (/[()[\]]/.test(name) && !isIdSegment(name)) return encodeBracketSegment(name);
  // The same characters as an ID segment (`isSegment`), combining marks included.
  let s = name.replace(/[^\p{Alphabetic}\p{M}\p{N}_$-]/gu, "_");
  if (!/^[\p{Alphabetic}_$]/u.test(s)) s = `_${s}`;
  return s;
}
