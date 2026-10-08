// `keylang coverage` (business-flows/13): where keylang does not see, so a
// person does not take the map for the whole program. A view over the
// snapshot (ADR 0014), never a verdict: (1) the share of fns reachable from
// at least one entry point over resolved call edges, (2) fns no entry point
// reaches (dead code, or an entry point keylang does not know), (3) the
// modules with most holes, by normalised reason, (4) entry points no
// hand-written flow starts from, with the discovered flow that would, and
// (5) «logic in data»: calls into configuration readers listed in
// `resources/data-logic.json`, to check by hand. The same snapshot, specs
// and data give the same report.

import { readFileSync } from "node:fs";
import type { Config } from "./config.ts";
import { appliesTo, callMatches, callsOf, compileMatcher, internalCallPositions, isTestFile, placer, readMatches, reachable, callGraph, resourcePath, snapshotFacts, sourceReader, textMatches, type Matcher } from "./call-sites.ts";
import { discoverFlows } from "./discover.ts";
import { leavesUnresolved, type AnalysisSnapshot, type EntryKind } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** One kind of «logic in data» the data file names. */
export interface DataLogicSignal extends Matcher {
  id: string;
  label: string;
}

/** A call or read of a configuration reader: the program's behaviour is decided by data keylang does not read. */
export interface DataLogicSite {
  signal: string;
  file: string;
  line: number;
  col: number;
  /** The callee, the read name, or the matched text. */
  text: string;
  /** The fn (else class or module) it is written in. */
  in: string | null;
}

/** A hole reason with the names in backticks replaced by `X`, and how often it occurs. */
export interface HoleReason {
  kind: string;
  reason: string;
  count: number;
}

export interface CoverageReport {
  snapshotId: string;
  reach: {
    /** fns outside test files. */
    fns: number;
    /** Of them, reachable from at least one entry point. */
    reachable: number;
    /** `reachable / fns`, 0 for none; four decimals. */
    share: number;
    /** Entry points of the snapshot. */
    entries: number;
    /** fns of test files, left out of `fns`. */
    tests: number;
  };
  /** fns no entry point reaches, but entry fns and fns of test files; by file, line, id. */
  orphans: { id: string; file: string; line: number; callers: number; escapes: string | null }[];
  holes: {
    total: number;
    /** By holes, most first, then by module id. */
    modules: { module: string; file: string | null; holes: number; reasons: HoleReason[] }[];
    /** Every module's reasons together, most first. */
    reasons: HoleReason[];
  };
  /** Entry points no hand-written flow names as its trigger, in the snapshot's order; `discovered`: the flow `flows discover` drafts for it. */
  unflowed: { kind: EntryKind; label: string; id: string; file: string; line: number; discovered: { name: string; file: string; inView: boolean } | null }[];
  dataLogic: {
    /** Each signal with sites, in the data file's order. */
    signals: { id: string; label: string; count: number }[];
    /** By signal (data order), file, line, column. */
    sites: DataLogicSite[];
  };
}

/** `resources/data-logic.json`: the configuration readers whose calls are «logic in data». */
export function loadDataLogic(path = resourcePath("data-logic.json")): DataLogicSignal[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as { signals?: unknown };
  if (!Array.isArray(value.signals)) throw new Error(`${path}: \`signals\` must be an array`);
  return value.signals.map((signal, i) => {
    if (typeof signal !== "object" || signal === null || typeof (signal as DataLogicSignal).id !== "string" || typeof (signal as DataLogicSignal).label !== "string") throw new Error(`${path}: \`signals[${i}]\` needs an \`id\` and a \`label\``);
    return signal as DataLogicSignal;
  });
}

/** Calls and reads of the snapshot's files that the signals match, in signal order, then file and position. */
export async function findDataLogic(config: Config, snapshot: AnalysisSnapshot, signals: readonly DataLogicSignal[]): Promise<DataLogicSite[]> {
  const files = callsOf(snapshot, await snapshotFacts(config, snapshot));
  const internal = internalCallPositions(snapshot);
  const place = placer(snapshot);
  const read = sourceReader(config.root);
  const out: DataLogicSite[] = [];
  // A place two signals match counts once, under the first in the data's order.
  const seen = new Set<string>();
  for (const signal of signals) {
    const matcher = compileMatcher(signal);
    const sites: DataLogicSite[] = [];
    const push = (site: DataLogicSite): void => {
      const key = `${site.file}:${site.line}:${site.col}`;
      if (seen.has(key)) return;
      seen.add(key);
      sites.push(site);
    };
    for (const file of files) {
      for (const call of file.calls) if (callMatches(matcher, call, file, internal.has(`${call.file}:${call.line}:${call.col}`))) push({ signal: signal.id, file: call.file, line: call.line, col: call.col, text: call.callee, in: call.in });
      for (const ref of file.reads) if (readMatches(matcher, ref, file)) push({ signal: signal.id, file: ref.file, line: ref.line, col: ref.col, text: ref.text, in: ref.in });
      if (matcher.text.length > 0 && appliesTo(matcher, file.language)) {
        const source = read(file.file);
        if (source !== null) for (const hit of textMatches(matcher, file, source.text, (line, col) => place(file.file, line, col))) push({ signal: signal.id, file: hit.file, line: hit.line, col: hit.col, text: hit.text, in: hit.in });
      }
    }
    out.push(...sites.sort((a, b) => compareText(a.file, b.file) || a.line - b.line || a.col - b.col));
  }
  return out;
}

/** A reason with every backticked name as `X`: `call through a local value \`X\``. */
export function normaliseReason(reason: string): string {
  return reason.replace(/`[^`]*`/g, "`X`");
}

/** The module a hole counts under: the file module of its fn or class, else its file. */
function holeModule(snapshot: AnalysisSnapshot, source: string | null): string | null {
  let id = source;
  while (id !== null) {
    const node = snapshot.nodes[id];
    if (node !== undefined && node.kind === "module" && node.class !== true) return id;
    const dot = id.lastIndexOf(".");
    id = dot === -1 ? null : id.slice(0, dot);
  }
  return null;
}

function reasonList(counts: ReadonlyMap<string, HoleReason>): HoleReason[] {
  return [...counts.values()].sort((a, b) => b.count - a.count || compareText(a.kind, b.kind) || compareText(a.reason, b.reason));
}

/**
 * The report over a snapshot. `specified`: triggers the hand-written flows
 * name; `viewText`: the text of a file of the discovered view, by its name
 * (`<layer>.md`), or null; `dataLogic`: the sites `findDataLogic` found.
 */
export function coverageReport(
  snapshot: AnalysisSnapshot,
  specified: ReadonlyMap<string, { file: string; flow: string }>,
  signals: readonly DataLogicSignal[],
  dataLogic: readonly DataLogicSite[],
  viewText: (file: string) => string | null,
): CoverageReport {
  const graph = callGraph(snapshot);
  const entryIds = new Set(snapshot.entries.map((entry) => entry.id));
  const seen = reachable(graph.out, entryIds);
  const fns = Object.entries(snapshot.nodes).filter(([, node]) => node.kind === "fn");
  const counted = fns.filter(([, node]) => node.file === null || !isTestFile(node.file));
  const reachableCount = counted.filter(([id]) => seen.has(id)).length;
  const orphans = counted
    .filter(([id]) => !seen.has(id) && !entryIds.has(id))
    .map(([id, node]) => ({ id, file: node.file ?? "", line: node.line ?? 1, callers: graph.in.get(id)?.size ?? 0, escapes: node.escapes?.reason ?? null }))
    .sort((a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.id, b.id));

  const byModule = new Map<string, { module: string; file: string | null; holes: number; reasons: Map<string, HoleReason> }>();
  const all = new Map<string, HoleReason>();
  let total = 0;
  for (const item of snapshot.coverage) {
    if (!leavesUnresolved(item) || item.kind === "outside-file") continue;
    total++;
    const module = holeModule(snapshot, item.source);
    const key = module ?? item.file;
    const group = byModule.get(key) ?? { module: key, file: module === null ? item.file : (snapshot.nodes[module]?.file ?? null), holes: 0, reasons: new Map<string, HoleReason>() };
    group.holes++;
    const reason = normaliseReason(item.reason);
    const reasonKey = `${item.kind}\0${reason}`;
    for (const counts of [group.reasons, all]) {
      const known = counts.get(reasonKey);
      if (known !== undefined) known.count++;
      else counts.set(reasonKey, { kind: item.kind, reason, count: 1 });
    }
    byModule.set(key, group);
  }
  const modules = [...byModule.values()]
    .map((group) => ({ module: group.module, file: group.file, holes: group.holes, reasons: reasonList(group.reasons) }))
    .sort((a, b) => b.holes - a.holes || compareText(a.module, b.module));

  // The flows `flows discover` would draft, for the entry points no spec starts from.
  const discovery = discoverFlows(snapshot, specified);
  const drafted = new Map(discovery.flows.map((flow) => [flow.trigger, flow]));
  const views = new Map<string, string | null>();
  const unflowed = snapshot.entries
    .filter((entry) => !specified.has(entry.id))
    .map((entry) => {
      const flow = drafted.get(entry.id);
      if (flow === undefined) return { kind: entry.kind, label: entry.label, id: entry.id, file: entry.file, line: entry.line, discovered: null };
      if (!views.has(flow.file)) views.set(flow.file, viewText(flow.file));
      const inView = (views.get(flow.file) ?? "").split("\n").includes(`# flow ${flow.name}`);
      return { kind: entry.kind, label: entry.label, id: entry.id, file: entry.file, line: entry.line, discovered: { name: flow.name, file: flow.file, inView } };
    });

  const counts = new Map<string, number>();
  for (const site of dataLogic) counts.set(site.signal, (counts.get(site.signal) ?? 0) + 1);
  return {
    snapshotId: snapshot.snapshotId,
    reach: { fns: counted.length, reachable: reachableCount, share: counted.length === 0 ? 0 : Math.round((reachableCount / counted.length) * 10000) / 10000, entries: snapshot.entries.length, tests: fns.length - counted.length },
    orphans,
    holes: { total, modules, reasons: reasonList(all) },
    unflowed,
    dataLogic: { signals: signals.filter((signal) => counts.has(signal.id)).map((signal) => ({ id: signal.id, label: signal.label, count: counts.get(signal.id)! })), sites: [...dataLogic] },
  };
}

/** How many modules and orphans the text shows; `--json` has them all. */
const TOP_MODULES = 10;
const SHOWN_ORPHANS = 50;

const percent = (share: number): string => `${(share * 100).toFixed(1)} %`;

/** What `keylang coverage` prints: the five sections, each with what to do about it. */
export function coverageText(report: CoverageReport, specDir = "keylang"): string {
  const out: string[] = [];
  const { reach } = report;
  out.push(`reach: ${reach.reachable} of ${reach.fns} fn reachable from ${reach.entries} entry point(s) over resolved calls (${percent(reach.share)})${reach.tests > 0 ? `; ${reach.tests} fn of test files left out` : ""}`);
  if (reach.entries === 0) out.push("  no entry points: see `keylang entries`; a framework's routes, cron jobs and consumers need its adapter");
  out.push("");
  out.push(`orphans: ${report.orphans.length} fn no entry point reaches (dead code, or an entry point keylang does not know)`);
  for (const orphan of report.orphans.slice(0, SHOWN_ORPHANS)) {
    const notes = [orphan.callers > 0 ? `${orphan.callers} caller(s), none reached` : "no caller", ...(orphan.escapes !== null ? [orphan.escapes] : [])];
    out.push(`  ${orphan.id}  ${orphan.file}:${orphan.line}  ${notes.join("; ")}`);
  }
  if (report.orphans.length > SHOWN_ORPHANS) out.push(`  … ${report.orphans.length - SHOWN_ORPHANS} more (--json lists them all)`);
  out.push("");
  out.push(`holes: ${report.holes.total} unresolved place(s)${report.holes.modules.length > TOP_MODULES ? `; top ${TOP_MODULES} of ${report.holes.modules.length} modules` : ""}`);
  for (const module of report.holes.modules.slice(0, TOP_MODULES)) {
    out.push(`  ${module.module}  ${module.holes}${module.file !== null ? `  ${module.file}` : ""}`);
    for (const reason of module.reasons) out.push(`    ${String(reason.count).padStart(4)}  ${reason.kind}: ${reason.reason}`);
  }
  out.push("");
  out.push(`entry points without a hand-written flow: ${report.unflowed.length}`);
  for (const entry of report.unflowed) {
    const flow = entry.discovered === null ? "no flow to discover (not a fn)" : entry.discovered.inView ? `discovered flow ${entry.discovered.name} in ${specDir}/flows-discovered/${entry.discovered.file}` : `discovered flow ${entry.discovered.name}, not in the view yet (\`keylang flows discover\`)`;
    out.push(`  ${entry.kind}  ${entry.label}  ${entry.id}  ${entry.file}:${entry.line}  ${flow}`);
  }
  out.push("");
  out.push(`logic in data — check by hand: ${report.dataLogic.sites.length} call(s) into configuration readers (resources/data-logic.json)`);
  const labels = new Map(report.dataLogic.signals.map((signal) => [signal.id, signal.label]));
  let last: string | null = null;
  for (const site of report.dataLogic.sites) {
    if (site.signal !== last) {
      out.push(`  ${site.signal} · ${labels.get(site.signal) ?? site.signal}`);
      last = site.signal;
    }
    out.push(`    ${site.file}:${site.line}  ${site.in ?? "-"}  ${site.text}`);
  }
  return `${out.join("\n")}\n`;
}
