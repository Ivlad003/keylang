// Staleness of prose in specs (design §4.4): every node description and
// every flow `when` / `then` / `invariant` gets the fingerprint of the code it
// talks about — the closure fingerprints of the snapshot, so a change in a
// callee, a cycle included, reaches it. The accepted fingerprints live in
// `<dir>/baseline.json` under version control and change only on
// `check --stale --accept`; `map` never writes them. A stale statement is a
// reason to reread it, not a proof that it is wrong.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { analyze, within } from "./analyze.ts";
import { loadConfig, toPosix, type Config } from "./config.ts";
import { snapshotBaseline } from "./explanations.ts";
import { sectionNodes, type Document, type Node, type Section } from "./ir.ts";
import { safeWrite } from "./safe-write.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** Accepted fingerprints: spec file (relative to the root, POSIX) → statement key → fingerprint. */
export type StaleBaseline = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** One piece of prose bound to code. */
export interface Statement {
  /** Spec file, relative to the root, POSIX. */
  file: string;
  /**
   * Key in the baseline: the node ID for a description, `invariant:<text>`,
   * `when:<text>`, `then:<text or id>` for flow statements; ` #2`, ` #3`… for
   * a later statement with the same key in the same file.
   */
  key: string;
  line: number;
  col: number;
  /** How the report names it: ``description of `a.b` ``, ``invariant `total is positive` ``. */
  label: string;
  /** Snapshot IDs whose code the statement is about, sorted. */
  subjects: string[];
}

export interface StaleFinding extends Statement {
  /** `new`: no accepted fingerprint yet; `stale`: the code changed since it was accepted. */
  state: "fresh" | "stale" | "new";
  fingerprint: string;
  /**
   * Why the fingerprint may miss a change: a subject the snapshot does not
   * have, or code reached from it that keylang could not resolve. Empty when
   * the check is complete.
   */
  incomplete: string[];
}

export interface StaleReport {
  /** In file, then position order. */
  findings: StaleFinding[];
  /** Baseline entries of the checked files with no statement any more (the text changed or it was removed). */
  obsolete: { file: string; key: string }[];
}

/** Where the accepted fingerprints live, relative to the root, POSIX. */
export function staleBaselinePath(config: Pick<Config, "dir">): string {
  return `${config.dir}/baseline.json`;
}

/**
 * The statements of hand-written specs: descriptions of nodes in map and flow
 * sections, and every flow `when`, `then` and `invariant`. Generated map files
 * are skipped: their text is the code's own.
 */
export function specStatements(docs: readonly Document[]): Statement[] {
  const out: Statement[] = [];
  for (const doc of docs) {
    if (doc.generated !== null) continue;
    const seen = new Map<string, number>();
    const add = (node: Node, base: string, label: string, subjects: Iterable<string>): void => {
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const sorted = [...new Set(subjects)].sort(compareText);
      out.push({ file: doc.path, key: n === 1 ? base : `${base} #${n}`, line: node.span.start.line, col: node.span.start.col, label, subjects: sorted });
    };
    for (const section of doc.sections) {
      if (section.kind !== "map" && section.kind !== "flow") continue;
      const flowRefs = section.kind === "flow" ? sectionRefs(section) : [];
      const visit = (node: Node, around: readonly string[]): void => {
        const own = node.refs.map((ref) => ref.target);
        const subject = node.id ?? own[0];
        if (node.description.length > 0 && subject !== undefined) add(node, subject, `description of \`${subject}\``, node.id !== null ? [node.id] : own);
        if (section.kind === "flow" && (node.kind === "when" || node.kind === "then" || node.kind === "invariant")) {
          const written = node.text?.value ?? own[0];
          if (written !== undefined) {
            // About the step it stands under and the steps it names; a top-level text one, the whole flow.
            const named = [...around, ...subtreeRefs(node)];
            add(node, `${node.kind}:${written}`, `${node.kind} \`${written}\``, named.length > 0 ? named : flowRefs);
          }
        }
        const next = own.length > 0 && (node.kind === "step" || node.kind === "trigger") ? own : around;
        for (const child of node.children) visit(child, next);
      };
      for (const node of sectionNodes(section)) visit(node, []);
    }
  }
  return out;
}

function subtreeRefs(node: Node): string[] {
  return [...node.refs.map((ref) => ref.target), ...node.children.flatMap(subtreeRefs)];
}

function sectionRefs(section: Section): string[] {
  return sectionNodes(section).flatMap(subtreeRefs);
}

/**
 * The fingerprint of a statement's subjects in the snapshot, and what makes it
 * incomplete. A subject the snapshot lacks hashes as `?`, so it turning up
 * later is a change too.
 */
export function statementPrint(snapshot: AnalysisSnapshot, subjects: readonly string[]): { fingerprint: string; incomplete: string[] } {
  const parts: string[] = [];
  const incomplete: string[] = [];
  for (const id of subjects) {
    const print = snapshotBaseline(snapshot, id);
    parts.push(`${id}=${print ?? "?"}`);
    if (print === null) incomplete.push(`\`${id}\` is not in the snapshot`);
    else if (!closureComplete(snapshot, id)) incomplete.push(`\`${id}\` reaches calls keylang does not resolve`);
  }
  return { fingerprint: createHash("sha256").update(parts.join("\n")).digest("hex"), incomplete };
}

/** A fn or type: its closure; a module or layer: every fn and type under it. */
function closureComplete(snapshot: AnalysisSnapshot, id: string): boolean {
  const node = snapshot.nodes[id];
  if (node?.closure) return node.closure.complete;
  if (node?.kind === "fn" || node?.kind === "type") return false;
  const prefix = `${id}.`;
  for (const [other, n] of Object.entries(snapshot.nodes)) {
    if (!other.startsWith(prefix) || (n.kind !== "fn" && n.kind !== "type")) continue;
    if (n.closure?.complete !== true) return false;
  }
  return true;
}

/**
 * The statements of `docs` against the snapshot and the accepted baseline.
 * Entries of the checked (hand-written) files can be obsolete; with `whole`
 * (every spec of the repository was read) so can those of a file that is gone.
 */
export function staleReport(docs: readonly Document[], snapshot: AnalysisSnapshot, baseline: StaleBaseline, whole = false): StaleReport {
  const findings: StaleFinding[] = specStatements(docs).map((statement) => {
    const { fingerprint, incomplete } = statementPrint(snapshot, statement.subjects);
    const accepted = baseline.get(statement.file)?.get(statement.key);
    const state = accepted === undefined ? "new" : accepted === fingerprint ? "fresh" : "stale";
    return { ...statement, state, fingerprint, incomplete };
  });
  const checked = new Set(docs.filter((doc) => doc.generated === null).map((doc) => doc.path));
  const present = new Set(findings.map((f) => `${f.file}\u0000${f.key}`));
  const obsolete: StaleReport["obsolete"] = [];
  for (const [file, entries] of [...baseline].sort(([a], [b]) => compareText(a, b))) {
    if (!whole && !checked.has(file)) continue;
    for (const key of [...entries.keys()].sort(compareText)) if (!present.has(`${file}\u0000${key}`)) obsolete.push({ file, key });
  }
  return { findings, obsolete };
}

/**
 * The baseline after accepting `report`: the checked files' entries are
 * replaced by the current fingerprints (a file with no statement left is
 * dropped); other files keep theirs.
 */
export function acceptBaseline(baseline: StaleBaseline, report: StaleReport, checked: readonly string[]): StaleBaseline {
  const out = new Map<string, Map<string, string>>();
  const replaced = new Set(checked);
  for (const [file, entries] of baseline) if (!replaced.has(file)) out.set(file, new Map(entries));
  for (const f of report.findings) {
    let entries = out.get(f.file);
    if (!entries) out.set(f.file, (entries = new Map()));
    entries.set(f.key, f.fingerprint);
  }
  return out;
}

/** The baseline as committed: files, then keys in code-unit order; two-space JSON with a final newline. */
export function baselineJson(baseline: StaleBaseline): string {
  const out: Record<string, Record<string, string>> = {};
  for (const file of [...baseline.keys()].sort(compareText)) {
    const entries = baseline.get(file)!;
    if (entries.size === 0) continue;
    const row: Record<string, string> = {};
    for (const key of [...entries.keys()].sort(compareText)) row[key] = entries.get(key)!;
    out[file] = row;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

const FINGERPRINT = /^[0-9a-f]{64}$/;

/** Reads a committed baseline; throws `path: problem` naming the field when it is not one. */
export function parseBaseline(text: string, path: string): StaleBaseline {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}: not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${path}: expected an object of spec files`);
  const out = new Map<string, Map<string, string>>();
  for (const [file, entries] of Object.entries(value)) {
    if (!isRecord(entries)) throw new Error(`${path}: \`${file}\`: expected an object of statement keys`);
    const row = new Map<string, string>();
    for (const [key, print] of Object.entries(entries)) {
      if (typeof print !== "string" || !FINGERPRINT.test(print)) throw new Error(`${path}: \`${file}\` → \`${key}\`: expected a SHA-256 fingerprint (64 hex digits)`);
      row.set(key, print);
    }
    out.set(file, row);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One report line: `file:line:col: stale invariant `…`: …`. */
export function staleLine(f: StaleFinding): string {
  const where = `${f.file}:${f.line}:${f.col}`;
  const about = f.subjects.length > 0 ? f.subjects.map((id) => `\`${id}\``).join(", ") : "nothing in the code";
  const head =
    f.state === "stale"
      ? `${where}: stale ${f.label}: the code under it changed since it was accepted (${about})`
      : f.state === "new"
        ? `${where}: new ${f.label}: no accepted fingerprint yet (${about})`
        : `${where}: incomplete ${f.label}: unchanged as far as keylang can see (${about})`;
  return f.incomplete.length > 0 ? `${head}; incomplete: ${f.incomplete.join("; ")}` : head;
}

/** The stderr summary: counts by state, incomplete and obsolete. */
export function staleSummary(report: StaleReport): string {
  const count = (state: StaleFinding["state"]): number => report.findings.filter((f) => f.state === state).length;
  const incomplete = report.findings.filter((f) => f.incomplete.length > 0).length;
  const parts = [`${count("stale")} stale`, `${count("new")} new`, `${count("fresh")} fresh`, `${incomplete} incomplete`];
  if (report.obsolete.length > 0) parts.push(`${report.obsolete.length} obsolete`);
  return parts.join(", ");
}

export interface StaleCheck {
  report: StaleReport;
  /** `<dir>/baseline.json`. */
  path: string;
  /** Written with `accept`: the number of accepted fingerprints; null when nothing was written. */
  accepted: number | null;
}

/**
 * `check --stale [paths…] [--accept]`: analyses the repository (nothing of it
 * is written), compares its specs with the committed baseline, and with
 * `accept` writes the current fingerprints of the checked files. Throws on a
 * usage or I/O problem, naming the file.
 */
export async function runStaleCheck(request: { root: string; base: string; paths: readonly string[]; accept: boolean }): Promise<StaleCheck> {
  const { root } = request;
  const config = loadConfig(root);
  if (config.languages.length === 0) throw new Error("check --stale: no languages to analyse; the fingerprints come from the code");
  const specDir = join(root, config.dir);
  const specs = request.paths.length > 0 ? request.paths.map((path) => resolve(request.base, path)) : [specDir];
  for (const spec of specs) {
    if (!existsSync(spec)) throw new Error(`${toPosix(relative(request.base, spec)) || spec}: not found`);
    if (!within(spec, specDir)) throw new Error(`check --stale: ${toPosix(relative(request.base, spec))} is outside \`${config.dir}/\`; the baseline covers this repository's specs only`);
  }
  const path = staleBaselinePath(config);
  const abs = join(root, path);
  const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  const baseline = current === null ? new Map() : parseBaseline(current, path);
  // `display` relative to the root: the paths are the baseline's keys.
  const analysis = await analyze({ root, specs, withoutEvidence: true });
  if (analysis.snapshot === null) throw new Error("check --stale: no snapshot of the code");
  const whole = request.paths.length === 0;
  const report = staleReport(analysis.docs, analysis.snapshot, baseline, whole);
  if (!request.accept) return { report, path, accepted: null };
  // Without paths every spec was read: a file that is gone loses its entries too.
  const checked = whole ? [...baseline.keys()] : analysis.docs.filter((doc) => doc.generated === null).map((doc) => doc.path);
  const next = acceptBaseline(baseline, report, checked);
  const text = baselineJson(next);
  if (text !== current) safeWrite(root, path, text, { expect: current });
  return { report, path, accepted: report.findings.length };
}
