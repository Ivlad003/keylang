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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE } from "./config.ts";
import type { FileFacts } from "./extract/facts.ts";
import { landing, writeAtomic, writeProblem } from "./safe-write.ts";
import { compareText } from "./span.ts";

const CACHE_SCHEMA = 1;
/** Relative to the root, POSIX. */
export const FACT_CACHE_FILE = ".keylang/cache/facts.json";

type StoredFacts = Omit<FileFacts, "exports"> & { exports: string[] };

interface Stored {
  schema: number;
  version: string;
  files: Record<string, { sha256: string; facts: StoredFacts }>;
}

/**
 * Entries of a cache written by this schema and version. An entry of the wrong
 * shape — any field the graph reads, at any depth — is dropped, so its file is
 * extracted again instead of trusted or thrown on.
 */
function storedFiles(value: unknown, version: string): Stored["files"] {
  if (!isRecord(value) || value.schema !== CACHE_SCHEMA || value.version !== version || !isRecord(value.files)) return {};
  const files: Stored["files"] = {};
  for (const [path, entry] of Object.entries(value.files)) {
    if (!isRecord(entry) || typeof entry.sha256 !== "string" || !isStoredFacts(entry.facts) || entry.facts.path !== path) continue;
    files[path] = { sha256: entry.sha256, facts: entry.facts };
  }
  return files;
}

function isStoredFacts(value: unknown): value is StoredFacts {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    isPosition(value.endLine) &&
    isPosition(value.endCol) &&
    every(value.imports, isImport) &&
    every(value.decls, isDecl) &&
    every(value.exports, isString) &&
    every(value.reexportsAll, isString) &&
    every(value.exportRows, isExportRow) &&
    every(value.unsupported, (u) => isRecord(u) && isRange(u) && typeof u.text === "string" && typeof u.reason === "string" && optional(u.symbol, isString)) &&
    every(value.valueRefs, (r) => isRecord(r) && typeof r.name === "string" && optionalTrue(r.member) && isPosition(r.line) && isPosition(r.col)) &&
    every(value.moduleCalls, isCall) &&
    (value.completeness === "complete" || value.completeness === "opaque") &&
    (value.parseError === null || (isRecord(value.parseError) && isPosition(value.parseError.line) && typeof value.parseError.reason === "string")) &&
    optional(value.doc, isString) &&
    optional(value.symbols, (symbols) => every(symbols, (s) => isRecord(s) && typeof s.name === "string" && typeof s.qualified === "string" && (s.table === "class" || s.table === "function" || s.table === "const")))
  );
}

function isImport(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    isRange(value) &&
    typeof value.text === "string" &&
    typeof value.reexport === "boolean" &&
    optionalTrue(value.optional) &&
    every(value.bindings, (b) => isRecord(b) && typeof b.local === "string" && (b.kind === "module" || b.kind === "default" || (b.kind === "named" && typeof b.imported === "string")))
  );
}

function isDecl(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === "fn" || value.kind === "class" || value.kind === "type") &&
    typeof value.name === "string" &&
    isRange(value) &&
    (value.signature === null || typeof value.signature === "string") &&
    typeof value.exported === "boolean" &&
    every(value.calls, isCall) &&
    every(value.types, (t) => isRecord(t) && typeof t.name === "string" && isRange(t) && typeof t.text === "string") &&
    every(value.members, isDecl) &&
    optional(value.fingerprint, isString) &&
    optionalTrue(value.accessor) &&
    optionalTrue(value.static) &&
    optionalTrue(value.hash) &&
    optionalTrue(value.implicit) &&
    optional(value.base, isString) &&
    optional(value.doc, isString)
  );
}

function isCall(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.callee === "string" &&
    isRange(value) &&
    optionalTrue(value.opaque) &&
    optional(value.bound, isBound) &&
    optional(value.receiver, isString) &&
    optional(value.hook, isHook) &&
    optional(value.passes, (p) => every(p, isPass)) &&
    optionalTrue(value.closure)
  );
}

function isHook(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.fallback === "string" &&
    (value.param === null || (isInteger(value.param) && value.param >= 0)) &&
    typeof value.path === "string" &&
    (value.owner === "self" || value.owner === "constructor")
  );
}

function isPass(value: unknown): boolean {
  return isRecord(value) && Number.isInteger(value.arg) && typeof value.path === "string" && typeof value.callee === "string" && optional(value.bound, isBound) && optional(value.receiver, isString);
}

const ROW_KINDS = new Set(["fn", "value", "class", "type", "alias", "default", "reexport"]);
const ROW_FORMS = new Set(["alias", "default", "reexport", "namespace"]);

function isExportRow(value: unknown): boolean {
  return isRecord(value) && typeof value.name === "string" && typeof value.kind === "string" && ROW_KINDS.has(value.kind) && (value.local === null || typeof value.local === "string") && optional(value.form, (f) => typeof f === "string" && ROW_FORMS.has(f)) && optional(value.from, isString);
}

function isBound(value: unknown): boolean {
  return value === "parameter" || value === "local";
}

/** 1-based `line`, `col`, `endLine`, `endCol`. */
function isRange(value: Record<string, unknown>): boolean {
  return isPosition(value.line) && isPosition(value.col) && isPosition(value.endLine) && isPosition(value.endCol);
}

function isPosition(value: unknown): boolean {
  return isInteger(value) && value >= 1;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isString(value: unknown): boolean {
  return typeof value === "string";
}

function every(value: unknown, check: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(check);
}

function optional(value: unknown, check: (item: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

function optionalTrue(value: unknown): boolean {
  return value === undefined || value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const memory = new Map<string, { hash: string; facts: FileFacts }>();

export class FactCache {
  private readonly root: string;
  private readonly version: string;
  private readonly disk: Stored["files"];
  private readonly used = new Map<string, { sha256: string; facts: FileFacts }>();
  /** Files whose facts came from memory or disk, and files extracted in this run. */
  reused = 0;
  extracted = 0;

  private constructor(root: string, version: string, disk: Stored["files"]) {
    this.root = root;
    this.version = version;
    this.disk = disk;
  }

  /** `version` names the extractor and grammars; any other stored version is ignored. */
  static open(root: string, version: string): FactCache {
    const file = join(root, FACT_CACHE_FILE);
    let disk: Stored["files"] = {};
    if (existsSync(file)) {
      try {
        disk = storedFiles(JSON.parse(readFileSync(file, "utf8")), version);
      } catch {
        // A damaged cache is rebuilt, never an error.
      }
    }
    return new FactCache(root, version, disk);
  }

  async facts(path: string, sha256: string, extract: () => Promise<FileFacts>): Promise<FileFacts> {
    const key = `${this.root}\0${this.version}\0${path}`;
    const hot = memory.get(key);
    let facts: FileFacts | undefined = hot && hot.hash === sha256 ? hot.facts : undefined;
    if (!facts) {
      const cold = this.disk[path];
      if (cold && cold.sha256 === sha256) facts = { ...cold.facts, exports: new Set(cold.facts.exports) };
    }
    if (facts) this.reused++;
    else {
      this.extracted++;
      facts = await extract();
    }
    memory.set(key, { hash: sha256, facts });
    this.used.set(path, { sha256, facts });
    return facts;
  }

  /**
   * Whether the facts of this run differ from the cache on disk: a file the
   * disk has no entry for or holds for other content, or an entry of a file
   * this run did not read. Unchanged, a write would put back the same facts.
   */
  changed(): boolean {
    if (Object.keys(this.disk).length !== this.used.size) return true;
    for (const [path, entry] of this.used) if (this.disk[path]?.sha256 !== entry.sha256) return true;
    return false;
  }

  /** The text of `FACT_CACHE_FILE` with the facts of this run (and nothing else), for the next process. */
  serialize(): string {
    const files: Stored["files"] = {};
    for (const [path, entry] of [...this.used].sort(([a], [b]) => compareText(a, b))) {
      files[path] = { sha256: entry.sha256, facts: { ...entry.facts, exports: [...entry.facts.exports].sort() } };
    }
    return `${JSON.stringify({ schema: CACHE_SCHEMA, version: this.version, files } satisfies Stored)}\n`;
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
    if (writeProblem(root, FACT_CACHE_FILE, { under: ".keylang", generated: true }) !== null) return false;
    writeAtomic(landing(join(root, FACT_CACHE_FILE))!, text, { exact: true });
    return true;
  } catch {
    return false;
  }
}
