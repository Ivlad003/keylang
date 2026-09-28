// Extracted facts reused across runs. A file's facts depend only on its path,
// its content, and the extractor with its grammars, so that is the key; the
// graph and the snapshot are rebuilt from all facts every time, which keeps
// resolution of importers consistent when an export changes.
//
// In-process entries serve the language server. `.keylang/cache/facts.json`
// is written by `keylang map` only (`check` writes nothing) and read by every
// command; a cache of another schema, extractor, or grammar is ignored.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileFacts } from "./extract/facts.ts";
import { compareText } from "./span.ts";

const CACHE_SCHEMA = 1;
const CACHE_FILE = ".keylang/cache/facts.json";

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
    optional(value.doc, isString)
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
    const file = join(root, CACHE_FILE);
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

  /** Write the facts of this run (and nothing else) for the next process. */
  save(): void {
    const files: Stored["files"] = {};
    for (const [path, entry] of [...this.used].sort(([a], [b]) => compareText(a, b))) {
      files[path] = { sha256: entry.sha256, facts: { ...entry.facts, exports: [...entry.facts.exports].sort() } };
    }
    const file = join(this.root, CACHE_FILE);
    mkdirSync(join(this.root, ".keylang/cache"), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ schema: CACHE_SCHEMA, version: this.version, files } satisfies Stored)}\n`);
  }
}
