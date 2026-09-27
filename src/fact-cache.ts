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

const CACHE_SCHEMA = 1;
const CACHE_FILE = ".keylang/cache/facts.json";

type StoredFacts = Omit<FileFacts, "exports"> & { exports: string[] };

interface Stored {
  schema: number;
  version: string;
  files: Record<string, { sha256: string; facts: StoredFacts }>;
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
        const stored = JSON.parse(readFileSync(file, "utf8")) as Partial<Stored>;
        if (stored.schema === CACHE_SCHEMA && stored.version === version && stored.files && typeof stored.files === "object") disk = stored.files;
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
    for (const [path, entry] of [...this.used].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      files[path] = { sha256: entry.sha256, facts: { ...entry.facts, exports: [...entry.facts.exports].sort() } };
    }
    const file = join(this.root, CACHE_FILE);
    mkdirSync(join(this.root, ".keylang/cache"), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ schema: CACHE_SCHEMA, version: this.version, files } satisfies Stored)}\n`);
  }
}
