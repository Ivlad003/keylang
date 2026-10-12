// Extracted facts reused across runs. A file's facts depend only on its path,
// its content, and the extractor with its grammars, so that is the key; the
// graph and the snapshot are rebuilt from all facts every time, which keeps
// resolution of importers consistent when an export changes.
//
// In-process entries serve the language server. `.keylang/cache/facts.json`
// is read by every command; a cache of another schema, extractor, or grammar
// is ignored. The cache prepares its text: `keylang map` writes it with the
// map, and `check`, `feature`, `hook stop` and MCP save it best-effort when
// their facts differ from it (`saveFactCache`), so an agent's loop parses
// only what changed. A `--check` mode never writes it.
//
// Sits at the first step of the code pipeline (source → FileFacts → graph →
// map/index), between file reading and the language frontends. Entry points:
// `FactCache.open`, `FactCache#facts` / `#config`, `serialize`, `saveFactCache`.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE } from "./config.ts";
import type { FileFacts } from "./extract/facts.ts";
import { isConfigFacts, type ConfigFacts } from "./frameworks/adapter.ts";
import { isJsonBoolean, isJsonNumber, isJsonObject, isJsonString, parseJson, type JsonObject, type JsonValue } from "./json.ts";
import { landing, writeAtomic, writeProblem } from "./safe-write.ts";
import { compareText } from "./span.ts";

/** The layout of the cache file; bump it when the stored shape changes. */
const CACHE_SCHEMA = 1;

/** Relative to the root, POSIX. */
export const FACT_CACHE_FILE = ".keylang/cache/facts.json";

/** `FileFacts` as JSON: the `exports` set is stored as a sorted array. */
type StoredFacts = Omit<FileFacts, "exports"> & { exports: string[] };

/** The whole cache file: schema, extractor version, and entries by path keyed by content hash. */
interface Stored {
  schema: number;
  version: string;
  files: Record<string, { sha256: string; facts: StoredFacts }>;
  /** Framework config files (`etc/di.xml`) by path: what their adapter parsed from that content (ADR 0022). */
  configs?: Record<string, { sha256: string; facts: ConfigFacts }>;
}

/** A field of a parsed cache entry: absent, or any JSON value. */
type Field = JsonValue | undefined;

/** Config entries of a cache of this schema and version; one of the wrong shape is parsed again. */
function storedConfigs(value: JsonValue, version: string): NonNullable<Stored["configs"]> {
  if (!isJsonObject(value) || value.schema !== CACHE_SCHEMA || value.version !== version || !isJsonObject(value.configs)) return {};
  const configs: NonNullable<Stored["configs"]> = {};

  // Keep only well-formed entries whose facts name the path they are stored under.
  for (const [path, entry] of Object.entries(value.configs)) {
    if (!isJsonObject(entry) || !isJsonString(entry.sha256) || !isConfigFacts(entry.facts) || entry.facts.path !== path) continue;
    configs[path] = { sha256: entry.sha256, facts: entry.facts };
  }

  return configs;
}

/**
 * Entries of a cache written by this schema and version. An entry of the wrong
 * shape — any field the graph reads, at any depth — is dropped, so its file is
 * extracted again instead of trusted or thrown on.
 */
function storedFiles(value: JsonValue, version: string): Stored["files"] {
  if (!isJsonObject(value) || value.schema !== CACHE_SCHEMA || value.version !== version || !isJsonObject(value.files)) return {};
  const files: Stored["files"] = {};

  // Keep only well-formed entries whose facts name the path they are stored under.
  for (const [path, entry] of Object.entries(value.files)) {
    if (!isJsonObject(entry) || !isJsonString(entry.sha256) || !isStoredFacts(entry.facts) || entry.facts.path !== path) continue;
    files[path] = { sha256: entry.sha256, facts: entry.facts };
  }

  return files;
}

/** A JSON object with every field of `StoredFacts`, checked at any depth. */
function isStoredFacts(value: Field): value is JsonObject & StoredFacts {
  if (!isJsonObject(value)) return false;

  return (
    isJsonString(value.path) &&
    isPosition(value.endLine) &&
    isPosition(value.endCol) &&
    every(value.imports, isImport) &&
    every(value.decls, isDecl) &&
    every(value.exports, isString) &&
    every(value.reexportsAll, isString) &&
    every(value.exportRows, isExportRow) &&
    every(value.unsupported, (u) => isJsonObject(u) && isRange(u) && isJsonString(u.text) && isJsonString(u.reason) && optional(u.symbol, isString)) &&
    every(value.valueRefs, (r) => isJsonObject(r) && isJsonString(r.name) && optionalTrue(r.member) && isPosition(r.line) && isPosition(r.col)) &&
    every(value.moduleCalls, isCall) &&
    (value.completeness === "complete" || value.completeness === "opaque") &&
    (value.parseError === null || (isJsonObject(value.parseError) && isPosition(value.parseError.line) && isJsonString(value.parseError.reason))) &&
    optional(value.doc, isString) &&
    optional(value.symbols, (symbols) => every(symbols, (s) => isJsonObject(s) && isJsonString(s.name) && isJsonString(s.qualified) && (s.table === "class" || s.table === "function" || s.table === "const")))
  );
}

/** An `ImportFact` of the right shape, bindings included. */
function isImport(value: Field): boolean {
  return (
    isJsonObject(value) &&
    isJsonString(value.source) &&
    isRange(value) &&
    isJsonString(value.text) &&
    isJsonBoolean(value.reexport) &&
    optionalTrue(value.optional) &&
    optionalTrue(value.glob) &&
    optionalTrue(value.typeOnly) &&
    optionalTrue(value.inlineTypeOnly) &&
    every(value.bindings, (b) => isJsonObject(b) && isJsonString(b.local) && ((b.kind === "module" && optionalTrue(b.namespace)) || b.kind === "default" || (b.kind === "named" && isJsonString(b.imported))))
  );
}

/** A `DeclFact` of the right shape, its calls, types and members checked recursively. */
function isDecl(value: Field): boolean {
  return (
    isJsonObject(value) &&
    (value.kind === "fn" || value.kind === "class" || value.kind === "type") &&
    isJsonString(value.name) &&
    isRange(value) &&
    (value.signature === null || isJsonString(value.signature)) &&
    isJsonBoolean(value.exported) &&
    every(value.calls, isCall) &&
    every(value.types, (t) => isJsonObject(t) && isJsonString(t.name) && isRange(t) && isJsonString(t.text)) &&
    every(value.members, isDecl) &&
    optional(value.fingerprint, isString) &&
    optionalTrue(value.accessor) &&
    optionalTrue(value.static) &&
    optionalTrue(value.hash) &&
    optionalTrue(value.implicit) &&
    optional(value.base, isString) &&
    optional(value.traits, (traits) => every(traits, isString)) &&
    optional(value.implements, (names) => every(names, isString)) &&
    optional(value.doc, isString)
  );
}

/** A `CallFact` of the right shape. */
function isCall(value: Field): boolean {
  return (
    isJsonObject(value) &&
    isJsonString(value.callee) &&
    isRange(value) &&
    optionalTrue(value.opaque) &&
    optional(value.bound, isBound) &&
    optional(value.receiver, isString) &&
    optional(value.param, isString) &&
    optional(value.hook, isHook) &&
    optional(value.passes, (p) => every(p, isPass)) &&
    optionalTrue(value.closure)
  );
}

/** A `HookFact` of the right shape. */
function isHook(value: Field): boolean {
  return (
    isJsonObject(value) &&
    isJsonString(value.name) &&
    isJsonString(value.fallback) &&
    (value.param === null || (isInteger(value.param) && value.param >= 0)) &&
    isJsonString(value.path) &&
    (value.owner === "self" || value.owner === "constructor")
  );
}

/** A `PassFact` of the right shape. */
function isPass(value: Field): boolean {
  return isJsonObject(value) && Number.isInteger(value.arg) && isJsonString(value.path) && isJsonString(value.callee) && optional(value.bound, isBound) && optional(value.receiver, isString);
}

/** The kinds and forms an export row may carry. */
const ROW_KINDS = new Set(["fn", "value", "class", "type", "alias", "default", "reexport"]);

const ROW_FORMS = new Set(["alias", "default", "reexport", "namespace"]);

/** An `ExportRow` of the right shape. */
function isExportRow(value: Field): boolean {
  return isJsonObject(value) && isJsonString(value.name) && isJsonString(value.kind) && ROW_KINDS.has(value.kind) && (value.local === null || isJsonString(value.local)) && optional(value.form, (f) => isJsonString(f) && ROW_FORMS.has(f)) && optional(value.from, isString);
}

/** How a call's receiver is bound: a parameter or a local. */
function isBound(value: Field): boolean {
  return value === "parameter" || value === "local";
}

/** 1-based `line`, `col`, `endLine`, `endCol`. */
function isRange(value: JsonObject): boolean {
  return isPosition(value.line) && isPosition(value.col) && isPosition(value.endLine) && isPosition(value.endCol);
}

/** A 1-based line or column. */
function isPosition(value: Field): boolean {
  return isInteger(value) && value >= 1;
}

/** A JSON number with no fraction. */
function isInteger(value: Field): value is number {
  return isJsonNumber(value) && Number.isInteger(value);
}

/** A JSON string, as a plain predicate for `every` and `optional`. */
function isString(value: Field): boolean {
  return isJsonString(value);
}

/** An array whose every item passes `check`. */
function every(value: Field, check: (item: JsonValue) => boolean): boolean {
  return Array.isArray(value) && value.every(check);
}

/** Absent, or present and passing `check`. */
function optional(value: Field, check: (item: JsonValue) => boolean): boolean {
  return value === undefined || check(value);
}

/** Absent, or `true`: the encoding of an optional flag. */
function optionalTrue(value: Field): boolean {
  return value === undefined || value === true;
}

/**
 * Process-wide caches by cache root, version and path, so a long-lived process
 * (the language server) reuses facts across analyses without reading the
 * file. The cache root is the repository's, also for a revision of it
 * analysed in a temporary directory (`keylang diff`): facts depend on the
 * path and content only, so both share entries.
 */
const memory = new Map<string, { hash: string; facts: FileFacts }>();

const configMemory = new Map<string, { hash: string; facts: ConfigFacts }>();

/** The fact cache of one analysis: lookups by content hash, and the entries this run used, for saving. */
export class FactCache {
  private readonly root: string;
  private readonly version: string;
  private readonly disk: Stored["files"];
  private readonly diskConfigs: NonNullable<Stored["configs"]>;
  private readonly used = new Map<string, { sha256: string; facts: FileFacts }>();
  private readonly usedConfigs = new Map<string, { sha256: string; facts: ConfigFacts }>();
  /** Files whose facts came from memory or disk, and files extracted in this run. */
  reused = 0;
  extracted = 0;

  private constructor(root: string, version: string, disk: Stored["files"], configs: NonNullable<Stored["configs"]>) {
    this.root = root;
    this.version = version;
    this.disk = disk;
    this.diskConfigs = configs;
  }

  /**
   * `root` holds `FACT_CACHE_FILE` and keys the in-process entries; `version`
   * names the extractor and grammars; any other stored version is ignored.
   */
  static open(root: string, version: string): FactCache {
    const file = join(root, FACT_CACHE_FILE);
    let disk: Stored["files"] = {};
    let configs: NonNullable<Stored["configs"]> = {};

    // Read the disk cache if there is one; only entries of this schema and
    // version, of the right shape, are kept.
    if (existsSync(file)) {
      try {
        const value = parseJson(readFileSync(file, "utf8"));
        disk = storedFiles(value, version);
        configs = storedConfigs(value, version);
      } catch {
        // A damaged cache is rebuilt, never an error.
      }
    }

    return new FactCache(root, version, disk, configs);
  }

  /** The facts of `path` with content hash `sha256`: from memory, else disk, else `extract`. */
  async facts(path: string, sha256: string, extract: () => Promise<FileFacts>): Promise<FileFacts> {
    // Memory first, then disk; either counts only when the content hash matches.
    const key = `${this.root}\0${this.version}\0${path}`;
    const hot = memory.get(key);
    let facts: FileFacts | undefined = hot && hot.hash === sha256 ? hot.facts : undefined;

    if (!facts) {
      const cold = this.disk[path];

      // JSON has no Set: rebuild `exports` from its stored array.
      if (cold && cold.sha256 === sha256) facts = { ...cold.facts, exports: new Set(cold.facts.exports) };
    }

    if (facts) this.reused++;
    else {
      this.extracted++;
      facts = await extract();
    }

    // Remember for this process and record as used, so `serialize` writes it.
    memory.set(key, { hash: sha256, facts });
    this.used.set(path, { sha256, facts });

    return facts;
  }

  /**
   * The facts of a framework config file (ADR 0022), by its content: a config
   * whose text changed is parsed again, as a source file is. `adapter` names
   * the adapter and its version, part of the key.
   */
  config(path: string, sha256: string, adapter: string, parse: () => ConfigFacts): ConfigFacts {
    // The adapter is part of the stored hash: a new adapter version re-parses.
    const hash = `${adapter}\0${sha256}`;
    const key = `${this.root}\0${this.version}\0${path}`;
    const hot = configMemory.get(key);
    let facts: ConfigFacts | undefined = hot && hot.hash === hash ? hot.facts : undefined;

    if (!facts) {
      const cold = this.diskConfigs[path];

      if (cold && cold.sha256 === hash) facts = cold.facts;
    }

    if (facts) this.reused++;
    else {
      this.extracted++;
      facts = parse();
    }

    configMemory.set(key, { hash, facts });
    this.usedConfigs.set(path, { sha256: hash, facts });

    return facts;
  }

  /**
   * Whether the facts of this run differ from the cache on disk: a file the
   * disk has no entry for or holds for other content, or an entry of a file
   * this run did not read. Unchanged, a write would put back the same facts.
   */
  changed(): boolean {
    // A different count means an entry was added or one would be dropped.
    if (Object.keys(this.disk).length !== this.used.size) return true;

    for (const [path, entry] of this.used) if (this.disk[path]?.sha256 !== entry.sha256) return true;

    if (Object.keys(this.diskConfigs).length !== this.usedConfigs.size) return true;

    for (const [path, entry] of this.usedConfigs) if (this.diskConfigs[path]?.sha256 !== entry.sha256) return true;

    return false;
  }

  /** The text of `FACT_CACHE_FILE` with the facts of this run (and nothing else), for the next process. */
  serialize(): string {
    const files: Stored["files"] = {};

    // Paths sorted and `exports` sorted, so the same facts give the same bytes.
    for (const [path, entry] of [...this.used].sort(([a], [b]) => compareText(a, b))) {
      files[path] = { sha256: entry.sha256, facts: { ...entry.facts, exports: [...entry.facts.exports].sort() } };
    }

    const configs: NonNullable<Stored["configs"]> = {};

    for (const [path, entry] of [...this.usedConfigs].sort(([a], [b]) => compareText(a, b))) configs[path] = entry;
    const stored: Stored = { schema: CACHE_SCHEMA, version: this.version, files };

    if (this.usedConfigs.size > 0) stored.configs = configs;

    return `${JSON.stringify(stored)}\n`;
  }
}

/**
 * A repository keylang was set up in (`keylang.json`) keeps the fact cache
 * from every analysis of the saved files; one only browsed gets nothing written.
 */
export function keepsFactCache(root: string): boolean {
  return existsSync(join(root, CONFIG_FILE));
}

/**
 * Writes the fact cache for the next process, best-effort: the cache only
 * saves time, so a write the protocol refuses (a link out of `.keylang/`) or
 * the file system refuses (read-only, a sandbox, EACCES) leaves the old cache,
 * or none, and is no error. The generator's bytes, as `keylang map` writes
 * them. True when it was written.
 */
export function saveFactCache(root: string, text: string): boolean {
  try {
    // Refuse a target that is not a plain generated file under `.keylang`.
    if (writeProblem(root, FACT_CACHE_FILE, { under: ".keylang", generated: true }) !== null) return false;
    writeAtomic(landing(join(root, FACT_CACHE_FILE))!, text, { exact: true });

    return true;
  } catch {
    return false;
  }
}
