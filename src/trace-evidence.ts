// Trace evidence: JSONL spans from instrumented `@flow` tests (schema 1).
// Steps match as a nested subsequence inside one test: extra calls are fine,
// one span satisfies one step, order comes from start/end on one clock or
// from `links`, never from sorting timestamps. Absence is a failure only in a
// complete, sufficiently instrumented run.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TRACE_SCHEMA = 1;

interface Mark {
  clockId: string;
  seq: number;
  ts: number;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  symbolId: string;
  links: string[];
  start: Mark;
  end: (Mark & { outcome: string }) | null;
}

export interface TraceRun {
  file: string;
  runId: string;
  testId: string;
  flow: string;
  snapshotId: string | null;
  spans: TraceSpan[];
  /** From the `run` event: the test finished and every span closed. */
  complete: boolean;
  dropped: number;
  /** Symbols the adapter instrumented; null when the run did not say. */
  instrumented: Set<string> | null;
}

/** Read and validate trace files. A malformed line is an error naming file and line. */
export function loadTraces(root: string, files: readonly string[]): TraceRun[] {
  const runs = new Map<string, TraceRun>();
  for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((text, i) => {
      if (text.trim() === "") return;
      const at = `${file}:${i + 1}`;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (e) {
        throw new Error(`${at}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (typeof value !== "object" || value === null) throw new Error(`${at}: a trace event must be an object`);
      const event = value as Record<string, unknown>;
      if (event.schemaVersion !== TRACE_SCHEMA) throw new Error(`${at}: unsupported trace schemaVersion ${JSON.stringify(event.schemaVersion)}`);
      const str = (field: string): string => {
        const v = event[field];
        if (typeof v !== "string" || v === "") throw new Error(`${at}: \`${field}\` must be a non-empty string`);
        return v;
      };
      const num = (field: string): number => {
        const v = event[field];
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${at}: \`${field}\` must be a number`);
        return v;
      };
      const key = `${file}\0${str("runId")}\0${str("testId")}`;
      let run = runs.get(key);
      if (!run) {
        run = { file, runId: str("runId"), testId: str("testId"), flow: str("flow"), snapshotId: null, spans: [], complete: false, dropped: 0, instrumented: null };
        runs.set(key, run);
      }
      const snapshotId = typeof event.snapshotId === "string" ? event.snapshotId : null;
      // Events of one run that disagree on the snapshot make the run unbound.
      if (run.spans.length === 0 && run.snapshotId === null) run.snapshotId = snapshotId;
      else if (run.snapshotId !== snapshotId) run.snapshotId = null;
      const kind = str("event");
      if (kind === "start") {
        const links = event.links === undefined ? [] : event.links;
        if (!Array.isArray(links) || !links.every((link) => typeof link === "string")) throw new Error(`${at}: \`links\` must be an array of span ids`);
        const parent = event.parentSpanId;
        if (parent !== undefined && parent !== null && typeof parent !== "string") throw new Error(`${at}: \`parentSpanId\` must be a string or null`);
        run.spans.push({ spanId: str("spanId"), parentSpanId: parent ?? null, symbolId: str("symbolId"), links: links as string[], start: { clockId: str("clockId"), seq: num("seq"), ts: num("ts") }, end: null });
      } else if (kind === "end") {
        const spanId = str("spanId");
        const span = run.spans.find((item) => item.spanId === spanId);
        if (!span) throw new Error(`${at}: end of unknown span \`${spanId}\``);
        span.end = { clockId: str("clockId"), seq: num("seq"), ts: num("ts"), outcome: typeof event.outcome === "string" ? event.outcome : "ok" };
      } else if (kind === "run") {
        run.complete = event.complete === true;
        run.dropped = typeof event.dropped === "number" ? event.dropped : 0;
        const instrumented = event.instrumented;
        if (instrumented !== undefined) {
          if (!Array.isArray(instrumented) || !instrumented.every((id) => typeof id === "string")) throw new Error(`${at}: \`instrumented\` must be an array of symbol ids`);
          run.instrumented = new Set(instrumented as string[]);
        }
      } else {
        throw new Error(`${at}: unknown event \`${kind}\``);
      }
    });
  }
  for (const run of runs.values()) if (run.spans.some((span) => span.end === null)) run.complete = false;
  return [...runs.values()];
}

/** A flow as trace matching sees it. `key` identifies the spec node across runs. */
export type ShapeNode = { kind: "step"; key: number; id: string; children: ShapeNode[] } | { kind: "when"; key: number; children: ShapeNode[] };

export interface TraceEvidence {
  verdict: "ok" | "fail" | "unverified";
  message: string;
  runId: string | null;
  testId: string | null;
}

type Outcome = TraceEvidence;

/**
 * Trace verdicts for every step and `when` of one flow, keyed by `ShapeNode.key`.
 * The trigger (if any) must be observed; its steps are matched inside it.
 */
export function traceFlow(runs: readonly TraceRun[], flow: string, trigger: { key: number; id: string } | null, shape: readonly ShapeNode[], snapshotId: string | null): Map<number, TraceEvidence> {
  const perNode = new Map<number, Outcome[]>();
  const note = (key: number, outcome: Outcome): void => {
    const list = perNode.get(key) ?? [];
    list.push(outcome);
    perNode.set(key, list);
  };
  const all = (nodes: readonly ShapeNode[], outcome: Outcome): void => {
    for (const node of nodes) {
      note(node.key, outcome);
      all(node.children, outcome);
    }
  };
  const mine = runs.filter((run) => run.flow === flow);
  for (const run of mine) {
    const base = { runId: run.runId, testId: run.testId };
    if (run.snapshotId === null) {
      all(trigger ? [{ kind: "step", key: trigger.key, id: trigger.id, children: [...shape] }] : shape, { verdict: "unverified", message: `trace ${run.file} is not bound to a snapshot`, ...base });
      continue;
    }
    if (run.snapshotId !== snapshotId) {
      all(trigger ? [{ kind: "step", key: trigger.key, id: trigger.id, children: [...shape] }] : shape, { verdict: "unverified", message: `stale trace ${run.file} (snapshot ${run.snapshotId.slice(0, 12)})`, ...base });
      continue;
    }
    const matcher = new Matcher(run);
    if (trigger) {
      const root = matcher.take(null, trigger.id, null);
      if (!root.span) {
        note(trigger.key, root.outcome);
        all(shape, { verdict: "unverified", message: "trigger not observed", ...base });
        continue;
      }
      note(trigger.key, { verdict: "ok", message: `observed in ${run.testId}`, ...base });
      matcher.children(root.span, shape, note);
    } else {
      matcher.children(null, shape, note);
    }
  }
  const out = new Map<number, TraceEvidence>();
  const keys = new Set<number>();
  const collect = (nodes: readonly ShapeNode[]): void => {
    for (const node of nodes) {
      keys.add(node.key);
      collect(node.children);
    }
  };
  collect(shape);
  if (trigger) keys.add(trigger.key);
  for (const key of keys) {
    const outcomes = perNode.get(key) ?? [];
    const fail = outcomes.find((item) => item.verdict === "fail");
    const ok = outcomes.find((item) => item.verdict === "ok");
    const first = outcomes[0];
    if (fail) out.set(key, fail);
    else if (ok) out.set(key, ok);
    else if (first) out.set(key, first);
    else out.set(key, { verdict: "unverified", message: mine.length === 0 ? `no trace for flow \`${flow}\`` : "not observed", runId: null, testId: null });
  }
  return out;
}

class Matcher {
  private readonly used = new Set<string>();
  private readonly byParent = new Map<string | null, TraceSpan[]>();
  private readonly run: TraceRun;

  constructor(run: TraceRun) {
    this.run = run;
    for (const span of run.spans) {
      const list = this.byParent.get(span.parentSpanId) ?? [];
      list.push(span);
      this.byParent.set(span.parentSpanId, list);
    }
  }

  private base(): { runId: string; testId: string } {
    return { runId: this.run.runId, testId: this.run.testId };
  }

  /** Spans under `parent` (all spans for null), depth-first in start order. */
  private descendants(parent: TraceSpan | null): TraceSpan[] {
    if (parent === null) return [...this.run.spans];
    const out: TraceSpan[] = [];
    const visit = (id: string): void => {
      for (const child of this.byParent.get(id) ?? []) {
        out.push(child);
        visit(child.spanId);
      }
    };
    visit(parent.spanId);
    return out;
  }

  /** Why an unobserved step is not a proven absence, or null when it is. */
  private absenceDoubt(id: string): string | null {
    if (!this.run.complete) return "incomplete trace";
    if (this.run.dropped > 0) return `incomplete trace (${this.run.dropped} dropped)`;
    if (this.run.instrumented === null) return "incomplete trace (instrumented symbols unknown)";
    if (!this.run.instrumented.has(id)) return `\`${id}\` is not instrumented`;
    return null;
  }

  /** Take the first unused span of `id` under `parent` that does not start before `after`. */
  take(parent: TraceSpan | null, id: string, after: TraceSpan | null): { span: TraceSpan | null; outcome: Outcome } {
    const pool = this.descendants(parent).filter((span) => span.symbolId === id && !this.used.has(span.spanId));
    const inOrder = pool.find((span) => !after || !startsBefore(span, after));
    if (inOrder) {
      this.used.add(inOrder.spanId);
      return { span: inOrder, outcome: this.orderOutcome(parent, inOrder, after) };
    }
    const early = pool[0];
    if (early && after) {
      this.used.add(early.spanId);
      return { span: early, outcome: { verdict: "fail", message: `out of order: starts before \`${after.symbolId}\``, ...this.base() } };
    }
    const doubt = this.absenceDoubt(id);
    return { span: null, outcome: doubt ? { verdict: "unverified", message: doubt, ...this.base() } : { verdict: "fail", message: `missing step in ${this.run.testId}`, ...this.base() } };
  }

  private orderOutcome(parent: TraceSpan | null, span: TraceSpan, after: TraceSpan | null): Outcome {
    // A child that starts after its parent ended ran asynchronously: nesting needs a link.
    if (parent && parent.end && sameClock(parent.end, span.start) && parent.end.seq < span.start.seq && !span.links.includes(parent.spanId)) {
      return { verdict: "unverified", message: `async step without a link to \`${parent.symbolId}\``, ...this.base() };
    }
    if (after) {
      if (span.links.includes(after.spanId)) return { verdict: "ok", message: `observed in ${this.run.testId}`, ...this.base() };
      if (!sameClock(after.start, span.start)) return { verdict: "unverified", message: `order unverified: \`${after.symbolId}\` and \`${span.symbolId}\` ran on different clocks without links`, ...this.base() };
      if (!after.end || after.end.seq > span.start.seq) return { verdict: "unverified", message: `order unverified: \`${span.symbolId}\` starts before \`${after.symbolId}\` ends (parallel)`, ...this.base() };
    }
    return { verdict: "ok", message: `observed in ${this.run.testId}`, ...this.base() };
  }

  children(parent: TraceSpan | null, nodes: readonly ShapeNode[], note: (key: number, outcome: Outcome) => void): void {
    let previous: TraceSpan | null = null;
    for (const node of nodes) {
      if (node.kind === "when") {
        // A branch is exercised in this test when its first step is observed.
        const first = node.children.find((child) => child.kind === "step");
        const probe = first && first.kind === "step" ? this.descendants(parent).some((span) => span.symbolId === first.id && !this.used.has(span.spanId)) : false;
        if (!probe) {
          note(node.key, { verdict: "unverified", message: "branch not exercised", ...this.base() });
          markAll(node.children, { verdict: "unverified", message: "branch not exercised", ...this.base() }, note);
          continue;
        }
        note(node.key, { verdict: "ok", message: `branch exercised in ${this.run.testId}`, ...this.base() });
        this.children(parent, node.children, note);
        continue;
      }
      const taken = this.take(parent, node.id, previous);
      note(node.key, taken.outcome);
      if (!taken.span) {
        markAll(node.children, { verdict: "unverified", message: `parent step \`${node.id}\` not observed`, ...this.base() }, note);
        continue;
      }
      this.children(taken.span, node.children, note);
      previous = taken.span;
    }
  }
}

function markAll(nodes: readonly ShapeNode[], outcome: Outcome, note: (key: number, outcome: Outcome) => void): void {
  for (const node of nodes) {
    note(node.key, outcome);
    markAll(node.children, outcome, note);
  }
}

function sameClock(a: Mark, b: Mark): boolean {
  return a.clockId === b.clockId;
}

function startsBefore(span: TraceSpan, other: TraceSpan): boolean {
  return sameClock(span.start, other.start) && span.start.seq < other.start.seq;
}
