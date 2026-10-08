// Migration between stacks (business-flows/27): the rows of `# migration
// <name>` (`map <old> → [planned] <new>`, `dropped <old> <reason>`) checked
// against both sides, and the parity of the old stack's flows with the new
// one. Pure over two stacks — snapshot nodes, entries, flows (hand-written
// and discovered), test results and integrations — so it is the same for
// every language and for a mix of them; `migration-stack.ts` builds the
// stacks from a repository or an exported index.
//
// Parity follows the general aggregation (design §4.2): a confirmed gap is
// `fail` (no counterpart flow; a mapped step's new ID missing where the new
// snapshot reads everything; a shared test failing in the new stack),
// missing evidence is `unverified` (no tests, no report, a step not in the
// table, an opaque module), and `ok` needs every step present and every
// test of the old flow passing under the same name in both reports.

import { createHash } from "node:crypto";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, type Document } from "./ir.ts";
import type { EntryKind } from "./snapshot.ts";
import { compareText, type Span } from "./span.ts";
import { matchTest, type TestCase, type TestEvidence } from "./test-report.ts";
import type { Verdict, VerdictKind } from "./verdict.ts";

/** One row of a `# migration` section that parsed. */
export interface MigrationRow {
  kind: "map" | "dropped";
  /** The section's name. */
  section: string;
  /** The ID of the old stack. */
  old: string;
  /** `map`: the ID of this repository; null for `dropped`. */
  to: string | null;
  /** `map … → planned …`: the new ID is an intention. */
  planned: boolean;
  /** `dropped`: why the old ID is not carried over. */
  reason: string | null;
  file: string;
  line: number;
  col: number;
  /** The old ID as written. */
  oldSpan: Span;
  /** The row's canonical text (the verdict's hash). */
  text: string;
}

/** Every row of every `# migration` section, in file and line order. */
export function migrationRows(docs: readonly Document[]): MigrationRow[] {
  const rows: MigrationRow[] = [];
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "migration") continue;
      for (const node of sectionNodes(section)) {
        if ((node.kind !== "migrate" && node.kind !== "dropped") || node.id === null) continue;
        const oldSpan = node.tokens[1]?.span ?? node.span;
        const to = node.kind === "migrate" ? (node.refs[0]?.target ?? null) : null;
        if (node.kind === "migrate" && to === null) continue;
        rows.push({
          kind: node.kind === "migrate" ? "map" : "dropped",
          section: section.name?.value ?? "",
          old: node.id,
          to,
          planned: node.kind === "migrate" && node.label?.value === "planned",
          reason: node.kind === "dropped" ? (node.text?.value ?? null) : null,
          file: doc.path,
          line: node.span.start.line,
          col: node.span.start.col,
          oldSpan,
          text: `${node.kind === "migrate" ? "map" : "dropped"} ${node.text?.value ?? node.id}`,
        });
      }
    }
  }
  return rows.sort((a, b) => compareText(a.file, b.file) || a.line - b.line);
}

/** What a node of a snapshot says about its contents: enough to tell present, opaque and missing apart. */
export interface NodeView {
  kind: string;
  members?: "complete" | "opaque";
}

/** The old snapshot `check` resolves old IDs against: none configured, unreadable, or loaded. */
export type OldSnapshot =
  | { state: "absent" }
  | { state: "error"; from: string; reason: string }
  | { state: "loaded"; from: string; snapshotId: string; nodes: Readonly<Record<string, NodeView>> };

/**
 * Where `id` is in a snapshot's nodes: `present`; `opaque` when the nearest
 * enclosing node is a module whose contents keylang could not read; else
 * `missing` (the area is fully indexed).
 */
export function lookupNode(nodes: Readonly<Record<string, NodeView>>, id: string): "present" | "opaque" | "missing" {
  if (nodes[id] !== undefined) return "present";
  let end = id.length;
  for (;;) {
    const dot = id.lastIndexOf(".", end - 1);
    if (dot <= 0) return "missing";
    end = dot;
    const parent = nodes[id.slice(0, end)];
    if (parent === undefined) continue;
    return parent.kind === "module" && parent.members === "opaque" ? "opaque" : "missing";
  }
}

/**
 * `check` of the migration rows' old side: each old ID is `ok` when the old
 * snapshot has it, K001 when the snapshot reads its area and lacks it,
 * `unverified` inside an opaque module, without an old snapshot
 * (`migration.from`) or when it cannot be read. The new side is a reference
 * the resolver checks (K001 unless the code has it or a `planned` declares it).
 */
export function migrationCheck(docs: readonly Document[], old: OldSnapshot, snapshotId: string | null): { diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  for (const row of migrationRows(docs)) {
    const say = (verdict: VerdictKind, reason: string): void => {
      verdicts.push({
        verdict,
        criterion: "migration",
        area: row.old,
        snapshotId: old.state === "loaded" ? old.snapshotId : snapshotId,
        specHash: createHash("sha256").update(row.text).digest("hex"),
        file: row.file,
        line: row.oldSpan.start.line,
        col: row.oldSpan.start.col,
        code: "migration",
        message: `${verdict} ${row.old}: ${reason}`,
      });
    };
    if (old.state === "absent") {
      say("unverified", "no old snapshot (set `migration.from` in keylang.json)");
      continue;
    }
    if (old.state === "error") {
      say("unverified", `old snapshot ${old.from} unreadable: ${old.reason}`);
      continue;
    }
    const found = lookupNode(old.nodes, row.old);
    if (found === "present") say("ok", `in the old snapshot ${old.from}`);
    else if (found === "opaque") say("unverified", `inside an opaque module of the old snapshot ${old.from}`);
    else diagnostics.push(diagnostic("K001", row.file, row.oldSpan, `dangling reference \`${row.old}\` in the old stack: the old snapshot ${old.from} has no such ID`));
  }
  return { diagnostics, verdicts };
}

// ---------------------------------------------------------------- parity

/** A flow of one stack: hand-written (`spec`) or drafted from an entry point (`discovered`). */
export interface StackFlow {
  name: string;
  source: "spec" | "discovered";
  /** The spec file, or the discovered view's file; null when unknown (an exported index). */
  file: string | null;
  /** The first trigger's ID; null for a flow without one. */
  trigger: string | null;
  /** IDs of the triggers and steps, in order, each once. */
  steps: string[];
  /** `test <file> "<name>"` lines, each name once. */
  tests: { file: string; name: string }[];
  /** A hand-written flow `flow import` brought in: its section carries `keylang:import` provenance. */
  imported?: true;
}

export interface StackIntegration {
  id: string;
  label: string;
  kind: string;
  /** The fns its call sites are written in. */
  fns: string[];
}

export interface StackWebhook {
  id: string;
  label: string;
  kind: string;
}

/** What parity reads of one stack. */
export interface Stack {
  snapshotId: string;
  nodes: Readonly<Record<string, NodeView>>;
  entries: readonly { kind: EntryKind; label: string; id: string }[];
  flows: readonly StackFlow[];
  /** The test results of `check.tests`; null without a report. */
  tests: readonly TestCase[] | null;
  /** Outgoing integrations and incoming webhooks; null when the source does not carry them. */
  integrations: { outgoing: readonly StackIntegration[]; webhooks: readonly StackWebhook[] } | null;
}

export interface StepParity {
  /** The old ID. */
  old: string;
  status: "mapped" | "dropped" | "unmapped";
  /** Each new ID the table maps it to, and whether the new code has it. */
  to: { id: string; planned: boolean; verdict: VerdictKind; reason: string }[];
}

export interface TestParity {
  name: string;
  old: { file: string; verdict: VerdictKind; message: string };
  /** Null when the counterpart has no test of that name. */
  new: { file: string; verdict: VerdictKind; message: string } | null;
}

export interface FlowParity {
  name: string;
  source: "spec" | "discovered";
  file: string | null;
  trigger: string | null;
  verdict: VerdictKind;
  /** Why it is not `ok` (the reasons of the verdict's level), or what makes it `ok`. */
  reasons: string[];
  counterpart: { name: string; source: "spec" | "discovered"; file: string | null; by: "import" | "trigger" | "steps" } | null;
  steps: StepParity[];
  tests: TestParity[];
}

export interface MigrationStatus {
  /** The old stack as given (`--from` or `migration.from`). */
  from: string;
  oldSnapshotId: string;
  newSnapshotId: string;
  flows: FlowParity[];
  counts: { ok: number; fail: number; unverified: number };
  /** Flows whose trigger a `dropped` row names: not judged. */
  droppedFlows: { name: string; reason: string }[];
  /** What the table does not carry over yet. */
  notMigrated: {
    flows: { name: string; source: "spec" | "discovered" }[];
    entries: { kind: EntryKind; label: string; id: string }[];
    integrations: { id: string; label: string; kind: string }[];
  };
  /** Flows with a counterpart but no test of the same name on both sides. */
  withoutTests: string[];
  dropped: { id: string; reason: string; file: string; line: number }[];
  notes: string[];
}

/** Entry kinds the report lists when the table has no row for them: work that runs without a user's request. */
const BACKGROUND_KINDS: ReadonlySet<EntryKind> = new Set(["cron", "consumer", "observer", "webhook"]);

const RANK: Record<VerdictKind, number> = { ok: 0, unverified: 1, fail: 2 };

/** The parity of every flow of the old stack, and what is not carried over yet. Deterministic: same inputs, same bytes. */
export function migrationStatus(input: { from: string; old: Stack; current: Stack; rows: readonly MigrationRow[]; notes?: readonly string[] }): MigrationStatus {
  const { old, current, rows } = input;
  const mapped = new Map<string, MigrationRow[]>();
  const dropped = new Map<string, MigrationRow>();
  for (const row of rows) {
    if (row.kind === "map") mapped.set(row.old, [...(mapped.get(row.old) ?? []), row]);
    else if (!dropped.has(row.old)) dropped.set(row.old, row);
  }
  const candidates = [...current.flows].sort((a, b) => (a.source === b.source ? compareText(a.name, b.name) || compareText(a.file ?? "", b.file ?? "") : a.source === "spec" ? -1 : 1));
  const flows: FlowParity[] = [];
  const droppedFlows: MigrationStatus["droppedFlows"] = [];
  const notFlows: MigrationStatus["notMigrated"]["flows"] = [];
  const withoutTests: string[] = [];
  const oldFlows = [...old.flows].sort((a, b) => compareText(a.name, b.name) || compareText(a.source, b.source));
  for (const flow of oldFlows) {
    const drop = flow.trigger === null ? undefined : dropped.get(flow.trigger);
    if (drop !== undefined) {
      droppedFlows.push({ name: flow.name, reason: drop.reason ?? "" });
      continue;
    }
    const findings: { verdict: VerdictKind; reason: string }[] = [];
    const steps = flow.steps.map((id): StepParity => {
      if (dropped.has(id)) return { old: id, status: "dropped", to: [] };
      const targets = mapped.get(id);
      if (targets === undefined) {
        findings.push({ verdict: "unverified", reason: `step ${id} is not in the migration table` });
        return { old: id, status: "unmapped", to: [] };
      }
      return {
        old: id,
        status: "mapped",
        to: targets.map((row) => {
          const where = lookupNode(current.nodes, row.to!);
          const judged =
            where === "present" ? { verdict: "ok" as const, reason: "in the new code" }
            : where === "opaque" ? { verdict: "unverified" as const, reason: "inside an opaque module of the new snapshot" }
            : { verdict: "fail" as const, reason: row.planned ? "planned, not implemented yet" : "missing in the new code" };
          if (judged.verdict !== "ok") findings.push({ verdict: judged.verdict, reason: `${id} → ${row.to}: ${judged.reason}` });
          return { id: row.to!, planned: row.planned, verdict: judged.verdict, reason: judged.reason };
        }),
      };
    });
    const counterpart = counterpartOf(flow, candidates, mapped);
    const tests: TestParity[] = [];
    if (counterpart === null) {
      findings.push({ verdict: "fail", reason: "no counterpart flow in the new stack" });
      notFlows.push({ name: flow.name, source: flow.source });
    } else {
      if (flow.tests.length === 0) findings.push({ verdict: "unverified", reason: "the old flow has no tests" });
      let shared = 0;
      for (const test of flow.tests) {
        const oldResult = evidence(old, test.file, test.name, "old");
        const match = counterpart.flow.tests.find((item) => item.name === test.name) ?? null;
        const newResult = match === null ? null : evidence(current, match.file, match.name, "new");
        tests.push({ name: test.name, old: { file: test.file, ...oldResult }, new: match === null || newResult === null ? null : { file: match.file, ...newResult } });
        if (match === null || newResult === null) {
          findings.push({ verdict: "unverified", reason: `test "${test.name}" has no counterpart in flow ${counterpart.flow.name}` });
          continue;
        }
        shared++;
        if (newResult.verdict === "fail") findings.push({ verdict: "fail", reason: `test "${test.name}" fails in the new stack: ${newResult.message}` });
        else if (newResult.verdict !== "ok") findings.push({ verdict: "unverified", reason: `test "${test.name}" in the new stack: ${newResult.message}` });
        if (oldResult.verdict !== "ok") findings.push({ verdict: "unverified", reason: `test "${test.name}" in the old stack: ${oldResult.message}` });
      }
      if (shared === 0) withoutTests.push(flow.name);
    }
    const verdict = findings.reduce<VerdictKind>((worst, item) => (RANK[item.verdict] > RANK[worst] ? item.verdict : worst), "ok");
    const reasons = verdict === "ok"
      ? [`${steps.filter((step) => step.status === "mapped").length} step(s) present, ${tests.length} test(s) pass in both stacks`]
      : [...new Set(findings.filter((item) => item.verdict === verdict).map((item) => item.reason))];
    flows.push({
      name: flow.name,
      source: flow.source,
      file: flow.file,
      trigger: flow.trigger,
      verdict,
      reasons,
      counterpart: counterpart === null ? null : { name: counterpart.flow.name, source: counterpart.flow.source, file: counterpart.flow.file, by: counterpart.by },
      steps,
      tests,
    });
  }
  const carried = (id: string): boolean => mapped.has(id) || dropped.has(id);
  const entrySeen = new Set<string>();
  const entries: MigrationStatus["notMigrated"]["entries"] = [];
  for (const entry of old.entries) {
    if (!BACKGROUND_KINDS.has(entry.kind) || carried(entry.id)) continue;
    const key = `${entry.kind}\u0000${entry.label}\u0000${entry.id}`;
    if (entrySeen.has(key)) continue;
    entrySeen.add(key);
    entries.push({ kind: entry.kind, label: entry.label, id: entry.id });
  }
  entries.sort((a, b) => compareText(a.kind, b.kind) || compareText(a.label, b.label) || compareText(a.id, b.id));
  const notes = [...(input.notes ?? [])];
  const integrations: MigrationStatus["notMigrated"]["integrations"] = [];
  if (old.integrations === null) notes.push("the old stack's integrations are unknown: the old snapshot does not carry them (export it with `keylang map --export-index <file>`, or pass the old repository's directory)");
  else {
    const newIds = new Set(current.integrations?.outgoing.map((item) => item.id) ?? []);
    const newHooks = new Set(current.integrations?.webhooks.map((item) => item.label) ?? []);
    for (const item of old.integrations.outgoing) {
      if (newIds.has(item.id) || item.fns.some(carried)) continue;
      integrations.push({ id: item.id, label: item.label, kind: item.kind });
    }
    for (const hook of old.integrations.webhooks) {
      if (newHooks.has(hook.label) || carried(hook.id)) continue;
      integrations.push({ id: hook.id, label: hook.label, kind: "webhook" });
    }
    if (current.integrations === null) notes.push("the new stack's integrations are unknown: only the table's rows carry an old integration over");
  }
  integrations.sort((a, b) => compareText(a.kind, b.kind) || compareText(a.id, b.id) || compareText(a.label, b.label));
  if (old.tests === null) notes.push("the old stack has no test report (`check.tests` of the old repository): its tests stay unverified");
  if (current.tests === null) notes.push("this repository has no test report (`check.tests` in keylang.json): the new side of every test stays unverified");
  const counts = { ok: 0, fail: 0, unverified: 0 };
  for (const flow of flows) counts[flow.verdict]++;
  return {
    from: input.from,
    oldSnapshotId: old.snapshotId,
    newSnapshotId: current.snapshotId,
    flows,
    counts,
    droppedFlows,
    notMigrated: { flows: notFlows, entries, integrations },
    withoutTests: withoutTests.sort(compareText),
    dropped: [...dropped.values()].map((row) => ({ id: row.old, reason: row.reason ?? "", file: row.file, line: row.line })).sort((a, b) => compareText(a.id, b.id)),
    notes: [...new Set(notes)],
  };
}

/** A test's evidence on one side; a stack without a report leaves it unverified. */
function evidence(stack: Stack, file: string, name: string, side: "old" | "new"): Pick<TestEvidence, "verdict" | "message"> {
  if (stack.tests === null) return { verdict: "unverified", message: `no test report in the ${side} stack` };
  const found = matchTest(stack.tests, file, name, stack.snapshotId);
  return { verdict: found.verdict, message: found.message };
}

/**
 * The new flow an old one became: a hand-written flow `flow import` brought
 * in under the same name; else one whose trigger the table maps the old
 * trigger to; else the one with most of the old steps mapped into it (at
 * least one). Hand-written flows before discovered ones, then by name.
 */
function counterpartOf(flow: StackFlow, candidates: readonly StackFlow[], mapped: ReadonlyMap<string, readonly MigrationRow[]>): { flow: StackFlow; by: "import" | "trigger" | "steps" } | null {
  const imported = candidates.find((item) => item.imported === true && item.name === flow.name);
  if (imported !== undefined) return { flow: imported, by: "import" };
  const targets = (id: string): string[] => (mapped.get(id) ?? []).map((row) => row.to!);
  if (flow.trigger !== null) {
    const triggers = new Set(targets(flow.trigger));
    const byTrigger = candidates.find((item) => item.trigger !== null && triggers.has(item.trigger));
    if (byTrigger !== undefined) return { flow: byTrigger, by: "trigger" };
  }
  const wanted = new Set(flow.steps.flatMap(targets));
  let best: { flow: StackFlow; overlap: number } | null = null;
  for (const item of candidates) {
    const overlap = item.steps.filter((id) => wanted.has(id)).length;
    if (overlap > 0 && (best === null || overlap > best.overlap)) best = { flow: item, overlap };
  }
  return best === null ? null : { flow: best.flow, by: "steps" };
}

/** The report `keylang migration status` prints. */
export function migrationStatusText(status: MigrationStatus): string {
  const lines: string[] = [`migration status · old ${status.from} (snapshot ${status.oldSnapshotId.slice(0, 12)}) → this repository (snapshot ${status.newSnapshotId.slice(0, 12)})`];
  if (status.flows.length === 0) lines.push("no flows in the old stack");
  const width = Math.max(0, ...status.flows.map((flow) => flow.name.length));
  for (const flow of status.flows) {
    const to = flow.counterpart === null ? "no counterpart" : `→ ${flow.counterpart.name} (${flow.counterpart.source}, by ${flow.counterpart.by})`;
    lines.push(`${flow.verdict.padEnd(10)}  ${flow.name.padEnd(width)}  ${flow.source.padEnd(10)}  ${to}`);
    for (const reason of flow.reasons) lines.push(`            ${reason}`);
  }
  if (status.droppedFlows.length > 0) {
    lines.push("", "dropped flows (not judged):");
    for (const flow of status.droppedFlows) lines.push(`  ${flow.name}  ${flow.reason}`);
  }
  const { flows, entries, integrations } = status.notMigrated;
  if (flows.length + entries.length + integrations.length > 0) {
    lines.push("", "not migrated yet:");
    for (const flow of flows) lines.push(`  flow ${flow.name} (${flow.source})`);
    for (const entry of entries) lines.push(`  ${entry.kind} ${entry.label}  ${entry.id}`);
    for (const item of integrations) lines.push(`  integration ${item.id} (${item.kind})  ${item.label}`);
  }
  if (status.withoutTests.length > 0) lines.push("", `migrated without shared tests: ${status.withoutTests.join(", ")}`);
  if (status.dropped.length > 0) {
    lines.push("", "dropped:");
    for (const row of status.dropped) lines.push(`  ${row.id}  ${row.reason}  (${row.file}:${row.line})`);
  }
  for (const note of status.notes) lines.push(`note: ${note}`);
  lines.push("", `${status.counts.fail} fail, ${status.counts.unverified} unverified, ${status.counts.ok} ok`);
  return `${lines.join("\n")}\n`;
}
