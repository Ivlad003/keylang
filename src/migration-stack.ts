// The two stacks of a migration (business-flows/27), as `migration.ts`
// reads them: this repository's analysis, the old repository's checkout
// (analysed read-only: nothing is written there, not even the fact cache),
// or an index file — a plain `.keylang/index.json` of the old repository
// (nodes and entries; flows only as `flows discover` drafts them) or the
// superset `keylang map --export-index <file>` writes (also the hand-written
// flows, the test results of `check.tests` and the integrations).

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { analyze, type Analysis } from "./analyze.ts";
import { evidenceFiles, toPosix } from "./config.ts";
import { errorText } from "./diag.ts";
import { discoverFlows, specifiedTriggers, DISCOVERED_DIR } from "./discover.ts";
import { findIntegrations, loadIntegrations } from "./integrations.ts";
import type { Document } from "./ir.ts";
import type { NodeView, OldSnapshot, Stack, StackFlow } from "./migration.ts";
import { SNAPSHOT_SCHEMA, type AnalysisSnapshot } from "./snapshot.ts";
import { walkFlow, type Flow } from "./spec-ir.ts";
import { compareText } from "./span.ts";
import { loadReports, type TestCase } from "./test-report.ts";

/** The `migration` block `map --export-index` adds to the snapshot. */
export const MIGRATION_EXPORT_SCHEMA = 1;

export interface MigrationExport {
  schema: typeof MIGRATION_EXPORT_SCHEMA;
  flows: StackFlow[];
  tests: TestCase[] | null;
  integrations: Stack["integrations"];
}

/** A stack and what the report should say about how it was read. */
export interface LoadedStack {
  stack: Stack;
  notes: string[];
}

/** The flows of an analysis: the hand-written ones (with `flow import` provenance marked), then the discovered drafts of entry points no hand-written flow starts from. */
export function stackFlows(analysis: Pick<Analysis, "spec" | "docs" | "config">, snapshot: AnalysisSnapshot): StackFlow[] {
  const specified = specifiedTriggers(analysis.spec.flows);
  const written = analysis.spec.flows.map((flow) => specFlow(flow, analysis.docs));
  const dir = analysis.config.dir === "" ? "" : `${analysis.config.dir}/`;
  const discovered = discoverFlows(snapshot, specified).flows.map((flow): StackFlow => ({
    name: flow.name,
    source: "discovered",
    file: `${dir}${DISCOVERED_DIR}/${flow.file}`,
    trigger: flow.trigger,
    steps: [...new Set(flow.steps)],
    tests: [],
  }));
  return [...written, ...discovered].sort((a, b) => compareText(a.name, b.name) || compareText(a.source, b.source) || compareText(a.file ?? "", b.file ?? ""));
}

function specFlow(flow: Flow, docs: readonly Document[]): StackFlow {
  const steps: string[] = [];
  const tests: StackFlow["tests"] = [];
  walkFlow(flow, (item) => {
    if ((item.kind === "trigger" || item.kind === "step") && !steps.includes(item.target.target)) steps.push(item.target.target);
    if (item.kind === "test" && item.name !== null && !tests.some((test) => test.name === item.name)) tests.push({ file: item.path, name: item.name });
  });
  const section = docs.find((doc) => doc.path === flow.file)?.sections.find((s) => s.kind === "flow" && s.name?.value === flow.name);
  const imported = section !== undefined && (section.comment?.value.includes("keylang:import ") === true || section.items.some((item) => item.type === "prose" && item.lines.some((line) => line.includes("<!-- keylang:import "))));
  return { name: flow.name, source: "spec", file: flow.file, trigger: flow.triggers[0]?.target.target ?? null, steps, tests, ...(imported ? { imported: true as const } : {}) };
}

/** The test results `check.tests` names; null when it names none. */
export function stackTests(analysis: Pick<Analysis, "config">): TestCase[] | null {
  const files = evidenceFiles(analysis.config, "tests");
  return files === null ? null : loadReports(analysis.config.root, files);
}

/** Outgoing integrations (with the fns of their call sites) and incoming webhooks of the snapshot. */
export async function stackIntegrations(analysis: Pick<Analysis, "spec" | "config">, snapshot: AnalysisSnapshot): Promise<NonNullable<Stack["integrations"]>> {
  const report = await findIntegrations(analysis.config, snapshot, loadIntegrations(), specifiedTriggers(analysis.spec.flows));
  return {
    outgoing: report.outgoing.map((item) => ({ id: item.id, label: item.label, kind: item.kind, fns: [...new Set(item.sites.flatMap((site) => (site.in === null ? [] : [site.in])))].sort(compareText) })),
    webhooks: report.webhooks.map((hook) => ({ id: hook.id, label: hook.label, kind: hook.kind })),
  };
}

/** The stack of an analysis with a snapshot: everything parity reads. */
export async function stackOf(analysis: Analysis): Promise<Stack> {
  const snapshot = analysis.snapshot;
  if (snapshot === null) throw new Error(`${analysis.config.root}: no code to read (\`languages\` in keylang.json is empty)`);
  return {
    snapshotId: snapshot.snapshotId,
    nodes: snapshot.nodes,
    entries: snapshot.entries,
    flows: stackFlows(analysis, snapshot),
    tests: stackTests(analysis),
    integrations: await stackIntegrations(analysis, snapshot),
  };
}

/** The old repository's checkout, analysed read-only: no fact cache, no `migration.from` of its own. */
function analyzeOld(dir: string, withoutEvidence: boolean): Promise<Analysis> {
  return analyze({ root: dir, withoutEvidence, withoutMigration: true });
}

/** `from` as written, resolved against `base` (the root for keylang.json, the working directory for `--from`). */
export function resolveFrom(base: string, from: string): string {
  return isAbsolute(from) ? from : resolve(base, from);
}

/** How a path is shown in a report: relative to the root, POSIX. */
export function fromLabel(root: string, abs: string): string {
  const rel = toPosix(relative(root, abs));
  return rel === "" ? "." : rel;
}

/** The old stack from a directory (its checkout) or a file (an index or an export). */
export async function loadOldStack(abs: string): Promise<LoadedStack> {
  if (statSync(abs).isDirectory()) {
    const analysis = await analyzeOld(abs, false);
    return { stack: await stackOf(analysis), notes: [] };
  }
  const body = readIndex(abs);
  const migration = body.migration as MigrationExport | undefined;
  if (migration !== undefined) {
    if (migration.schema !== MIGRATION_EXPORT_SCHEMA || !Array.isArray(migration.flows)) throw new Error(`${abs}: unsupported \`migration\` block (expected schema ${MIGRATION_EXPORT_SCHEMA})`);
    return {
      stack: { snapshotId: body.snapshotId, nodes: body.nodes, entries: body.entries, flows: migration.flows, tests: migration.tests, integrations: migration.integrations },
      notes: [],
    };
  }
  const notes = ["the old snapshot is a plain index.json: its hand-written flows, test results and integrations are not in it (`keylang map --export-index <file>` in the old repository writes them); its flows are the drafts `flows discover` makes from its entry points"];
  let flows: StackFlow[] = [];
  if (body.schema === SNAPSHOT_SCHEMA) {
    flows = discoverFlows(body, new Map()).flows.map((flow) => ({ name: flow.name, source: "discovered" as const, file: null, trigger: flow.trigger, steps: [...new Set(flow.steps)], tests: [] }));
  } else notes.push(`the old snapshot has schema ${String(body.schema)}, this keylang reads ${SNAPSHOT_SCHEMA}: no flows drafted from it`);
  return { stack: { snapshotId: body.snapshotId, nodes: body.nodes, entries: body.entries, flows, tests: null, integrations: null }, notes };
}

function readIndex(abs: string): AnalysisSnapshot & { migration?: unknown } {
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(abs, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`${abs}: not a keylang index: ${errorText(error)}`);
  }
  const value = body as Record<string, unknown> | null;
  if (typeof value !== "object" || value === null || typeof value.snapshotId !== "string" || typeof value.nodes !== "object" || value.nodes === null || !Array.isArray(value.entries ?? [])) {
    throw new Error(`${abs}: not a keylang index (expected \`snapshotId\`, \`nodes\` and \`entries\` of .keylang/index.json)`);
  }
  return { ...(value as unknown as AnalysisSnapshot), entries: (value.entries as AnalysisSnapshot["entries"] | undefined) ?? [] };
}

/** Old snapshots `check` has read in this process, by path: a directory once, a file while it is the same. */
const oldIds = new Map<string, { stamp: string; ids: Promise<{ snapshotId: string; nodes: Record<string, NodeView> }> }>();

/**
 * The nodes of the old stack for `check` (`migration.from` of keylang.json,
 * relative to the root). An unreadable one is a state, never a thrown error:
 * the rows stay unverified and say why.
 */
export async function oldSnapshotFor(root: string, from: string | null): Promise<OldSnapshot> {
  if (from === null) return { state: "absent" };
  const abs = resolveFrom(root, from);
  try {
    const stat = statSync(abs);
    const stamp = stat.isDirectory() ? "dir" : `${stat.mtimeMs}:${stat.size}`;
    let known = oldIds.get(abs);
    if (known === undefined || known.stamp !== stamp) {
      const ids = stat.isDirectory()
        ? analyzeOld(abs, true).then((analysis) => {
            if (analysis.snapshot === null) throw new Error("no code to read (`languages` in its keylang.json is empty)");
            return { snapshotId: analysis.snapshot.snapshotId, nodes: analysis.snapshot.nodes };
          })
        : Promise.resolve().then(() => {
            const body = readIndex(abs);
            return { snapshotId: body.snapshotId, nodes: body.nodes };
          });
      known = { stamp, ids };
      oldIds.set(abs, known);
      // A failure is not remembered: the next check reads again.
      ids.catch(() => oldIds.delete(abs));
    }
    const { snapshotId, nodes } = await known.ids;
    return { state: "loaded", from, snapshotId, nodes };
  } catch (error) {
    return { state: "error", from, reason: errorText(error) };
  }
}

/** `keylang map --export-index <file>`: the snapshot of this repository with the `migration` block, as JSON text. */
export async function migrationExport(root: string): Promise<string> {
  const analysis = await analyze({ root, withoutMigration: true });
  const snapshot = analysis.snapshot;
  if (snapshot === null) throw new Error("map --export-index: no code to read (`languages` in keylang.json is empty)");
  const stack = await stackOf(analysis);
  const migration: MigrationExport = { schema: MIGRATION_EXPORT_SCHEMA, flows: [...stack.flows], tests: stack.tests === null ? null : [...stack.tests], integrations: stack.integrations };
  return `${JSON.stringify({ ...snapshot, migration }, null, 2)}\n`;
}

/** Writes the export to `out` (relative to the working directory). */
export async function writeMigrationExport(root: string, out: string): Promise<string> {
  const text = await migrationExport(root);
  const abs = resolve(process.cwd(), out);
  writeFileSync(abs, text);
  return abs;
}
