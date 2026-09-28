// Explanations of nodes (ADR 0004): the documentation comment in the code
// first, then a brief a model wrote, saved under `<dir>/explain/brief/`. One
// lookup for the explained map, the TUI, MCP and the language server; the
// store and its baselines live here so that lookup needs no model.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { briefOf } from "./brief.ts";
import type { Config } from "./config.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";

/** `short` and `full` answer `explain <id> --llm`; `brief` is the one or two sentences of the explained map. */
export type ExplanationDetail = "short" | "full" | "brief";

/** An explanation a model wrote, with the header it is saved under. */
export interface StoredExplanation {
  agent: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** The node's baseline when explained (`snapshotBaseline`); "" for a planned node. */
  closure: string;
  lang: string;
  detail: ExplanationDetail;
  text: string;
}

const HEADER = /^<!-- keylang:explain agent=(\S+) date=(\S+) closure=(\S*) lang=(\S+) detail=(short|full|brief) -->\r?\n/;

/** The saved form; null for a file keylang did not write, which is not an explanation it can date. */
export function parseStoredExplanation(text: string): StoredExplanation | null {
  const m = HEADER.exec(text);
  if (!m) return null;
  return { agent: m[1]!, date: m[2]!, closure: m[3]!, lang: m[4]!, detail: m[5] as ExplanationDetail, text: text.slice(m[0].length).trimEnd() };
}

export function formatStoredExplanation(e: StoredExplanation): string {
  return `<!-- keylang:explain agent=${e.agent} date=${e.date} closure=${e.closure} lang=${e.lang} detail=${e.detail} -->\n${e.text}\n`;
}

/** Where explanations are saved, relative to the root: `<dir>/explain`, committed next to the map. */
export function explainDir(config: Config): string {
  return `${config.dir}/explain`;
}

/** The explanation store of keylang 0.1: not read any more, only named so its files can be moved. */
export const OLD_EXPLAIN_DIR = ".keylang/explain";

/** File of an explanation relative to the root: `<dir>/explain/<id>.md`, a brief in `<dir>/explain/brief/<id>.md`. */
export function explanationPath(config: Config, id: string, detail: ExplanationDetail): string {
  return detail === "brief" ? `${explainDir(config)}/brief/${id}.md` : `${explainDir(config)}/${id}.md`;
}

export function readStoredExplanation(root: string, rel: string): StoredExplanation | null {
  const file = join(root, rel);
  return existsSync(file) ? parseStoredExplanation(readFileSync(file, "utf8")) : null;
}

/** IDs with a saved file in `dir` (relative to the root), sorted. */
export function storedIds(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.slice(0, -3))
    .sort();
}

/** Briefs saved under `<dir>/explain/brief/`, by ID. A file without keylang's header is not one. */
export function loadBriefs(config: Config): Map<string, StoredExplanation> {
  const dir = `${explainDir(config)}/brief`;
  const out = new Map<string, StoredExplanation>();
  for (const id of storedIds(config.root, dir)) {
    const e = readStoredExplanation(config.root, `${dir}/${id}.md`);
    if (e?.detail === "brief") out.set(id, e);
  }
  return out;
}

/** Sorted node IDs of a snapshot, computed once: IDs under a prefix are one run of them. */
const sortedIds = new WeakMap<AnalysisSnapshot, string[]>();

/**
 * The baseline an explanation of `id` is compared with: the closure
 * fingerprint of a fn or type; for a module, class or layer, which has no
 * closure of its own, a hash of its dependencies and of the closures of every
 * node under it, so a change inside makes its explanation stale. "" when there
 * is nothing to hash, null when the snapshot has no such node.
 */
export function snapshotBaseline(snapshot: AnalysisSnapshot, id: string): string | null {
  const node = snapshot.nodes[id];
  if (!node) return null;
  if (node.closure) return node.closure.fingerprint;
  let ids = sortedIds.get(snapshot);
  if (!ids) {
    ids = Object.keys(snapshot.nodes).sort();
    sortedIds.set(snapshot, ids);
  }
  const prefix = `${id}.`;
  const parts: string[] = [];
  for (let i = lowerBound(ids, prefix); i < ids.length && ids[i]!.startsWith(prefix); i++) {
    const other = ids[i]!;
    const n = snapshot.nodes[other];
    const print = n?.closure?.fingerprint ?? n?.fingerprint;
    if (print !== undefined) parts.push(`${other} ${print}`);
  }
  parts.sort();
  if (parts.length === 0 && (node.deps ?? []).length === 0) return "";
  return createHash("sha256").update([`deps ${(node.deps ?? []).join(",")}`, ...parts].join("\n")).digest("hex");
}

function lowerBound(sorted: readonly string[], key: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** What a node is, in plain words, and where the words come from. */
export interface NodeExplanation {
  text: string;
  /** `doc`: the documentation comment in the code; `llm`: a brief a model wrote. */
  origin: "doc" | "llm";
  /** A brief whose baseline changed since the model wrote it. A doc comment is never stale: it is the code. */
  stale: boolean;
  /** The model and the date of a brief. */
  agent?: string;
  date?: string;
}

/**
 * The explanation of a node: its documentation comment, else its saved brief
 * (fresh or stale), else null. Never a `short` or `full` explanation: those
 * answer a question about one node, not a line of the map.
 */
export function explanationOf(snapshot: AnalysisSnapshot, briefs: ReadonlyMap<string, StoredExplanation>, id: string): NodeExplanation | null {
  const node = snapshot.nodes[id];
  if (!node) return null;
  if (node.doc) return { text: node.doc, origin: "doc", stale: false };
  const brief = briefs.get(id);
  const text = brief ? briefOf(brief.text) : null;
  if (!brief || text === null) return null;
  return { text, origin: "llm", stale: snapshotBaseline(snapshot, id) !== brief.closure, agent: brief.agent, date: brief.date };
}

/** The model of an agent, as the map shows it: `claude-sonnet-5` for `anthropic:claude-sonnet-5`. */
export function modelName(agent: string): string {
  return agent.slice(agent.indexOf(":") + 1);
}
