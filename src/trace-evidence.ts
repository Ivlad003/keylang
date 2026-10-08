// Trace evidence: JSONL spans from instrumented `@flow` tests (schema 1).
// Steps match as a nested subsequence inside one test: extra calls are fine,
// one span satisfies one step, order comes from start/end on one clock or
// from `links`, never from sorting timestamps. Only a complete run confirms or
// refutes: absence is a failure only when the run is also sufficiently instrumented.

import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

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
  /** Trace files the run's events came from, in reading order: one run may span several. */
  files: string[];
  runId: string;
  testId: string;
  flow: string;
  snapshotId: string | null;
  spans: TraceSpan[];
  /**
   * Every `run` event said the test finished, and every clock that wrote a span
   * wrote one; false without a `run` event.
   */
  complete: boolean;
  /** Clocks (processes) with spans that no `run` event covers: they ended before writing their record. */
  unfinished: number;
  /** Events the adapters dropped; null when a `run` event did not say. */
  dropped: number | null;
  /** Spans the adapters reported open and spans that started without an end. */
  open: Set<string>;
  /** Symbols every `run` event reported instrumented; null when one did not say. */
  instrumented: Set<string> | null;
  /** Why an adapter left a symbol uninstrumented (`uninstrumented` of a `run` event), when one said. */
  uninstrumented: Map<string, string>;
}

/**
 * A run as it is read. Spans are keyed by id, so a start and the end that
 * closes it are found without a scan; an end whose start is in a file not read
 * yet waits for the last file. `run` events accumulate until every file is read.
 */
interface RunDraft {
  files: string[];
  runId: string;
  testId: string;
  flow: string;
  snapshots: Set<string | null>;
  spans: Map<string, TraceSpan>;
  pendingEnds: { spanId: string; end: NonNullable<TraceSpan["end"]>; at: string }[];
  complete: boolean;
  dropped: number | null;
  open: Set<string>;
  instrumented: Set<string> | null;
  uninstrumented: Map<string, string>;
  runEvents: number;
  /** Clocks of `start` and `end` events. */
  clocks: Set<string>;
  /** Clocks that wrote a `run` event naming them. */
  finished: Set<string>;
  /** `run` events without a `clockId` (an adapter before that field): with one, no clock is judged unfinished. */
  anonymous: number;
}

/**
 * Read and validate trace files. A malformed line is an error naming file and
 * line. A run is `(runId, testId, flow)`, wherever its events are: processes
 * of one test may write to different files, in any order.
 */
export function loadTraces(root: string, files: readonly string[]): TraceRun[] {
  const runs = new Map<string, RunDraft>();
  for (const file of files) {
    eachLine(join(root, file), (text, line) => {
      // An editor may save the file with a byte order mark.
      const body = line === 1 && text.startsWith("\uFEFF") ? text.slice(1) : text;
      if (body.trim() !== "") readEvent(runs, file, line, body);
    });
  }
  return [...runs.values()].map(finishRun);
}

/** Each line of a file (1-based), read in chunks: a trace of millions of events may not fit in one string. */
function eachLine(path: string, visit: (text: string, line: number) => void): void {
  const fd = openSync(path, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const chunk = Buffer.allocUnsafe(1 << 16);
    let rest = "";
    let line = 0;
    for (let read = readSync(fd, chunk); read > 0; read = readSync(fd, chunk)) {
      const lines = (rest + decoder.write(chunk.subarray(0, read))).split("\n");
      rest = lines.pop() ?? "";
      for (const text of lines) visit(text, ++line);
    }
    visit(rest + decoder.end(), ++line);
  } finally {
    closeSync(fd);
  }
}

function readEvent(runs: Map<string, RunDraft>, file: string, line: number, text: string): void {
  const at = `${file}:${line}`;
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
  const ids = (field: string, what: string): string[] | undefined => {
    const v = event[field];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || !v.every((id) => typeof id === "string")) throw new Error(`${at}: \`${field}\` must be an array of ${what}`);
    return v as string[];
  };
  // A missing snapshot leaves the run unbound; a value of another type is an error, not a missing one.
  const snapshotId = event.snapshotId;
  if (snapshotId !== undefined && snapshotId !== null && typeof snapshotId !== "string") throw new Error(`${at}: \`snapshotId\` must be a string or null`);
  const key = JSON.stringify([str("runId"), str("testId"), str("flow")]);
  let run = runs.get(key);
  if (!run) {
    run = { files: [], runId: str("runId"), testId: str("testId"), flow: str("flow"), snapshots: new Set(), spans: new Map(), pendingEnds: [], complete: true, dropped: 0, open: new Set(), instrumented: null, uninstrumented: new Map(), runEvents: 0, clocks: new Set(), finished: new Set(), anonymous: 0 };
    runs.set(key, run);
  }
  if (!run.files.includes(file)) run.files.push(file);
  // Events of one run that disagree on the snapshot make the run unbound.
  run.snapshots.add(snapshotId ?? null);
  const kind = str("event");
  if (kind === "start") {
    const links = ids("links", "span ids") ?? [];
    const parent = event.parentSpanId;
    if (parent !== undefined && parent !== null && typeof parent !== "string") throw new Error(`${at}: \`parentSpanId\` must be a string or null`);
    const spanId = str("spanId");
    // Two starts of one span id would let one process's steps nest under another's trigger.
    if (run.spans.has(spanId)) throw new Error(`${at}: span \`${spanId}\` started twice in run \`${run.runId}\``);
    run.spans.set(spanId, { spanId, parentSpanId: parent ?? null, symbolId: str("symbolId"), links, start: { clockId: str("clockId"), seq: num("seq"), ts: num("ts") }, end: null });
    run.clocks.add(str("clockId"));
  } else if (kind === "end") {
    const spanId = str("spanId");
    const end = { clockId: str("clockId"), seq: num("seq"), ts: num("ts"), outcome: typeof event.outcome === "string" ? event.outcome : "ok" };
    run.clocks.add(end.clockId);
    const span = run.spans.get(spanId);
    if (!span) run.pendingEnds.push({ spanId, end, at });
    else if (span.end !== null) throw new Error(`${at}: span \`${spanId}\` ended twice`);
    else span.end = end;
  } else if (kind === "run") {
    // Each process of a run writes its own `run` event: the run is complete only when all of them are.
    if (event.complete !== undefined && typeof event.complete !== "boolean") throw new Error(`${at}: \`complete\` must be a boolean`);
    // The clock the record is for; a record without one (an adapter before the field) stands for one process.
    const clock = event.clockId;
    if (clock !== undefined && clock !== null && (typeof clock !== "string" || clock === "")) throw new Error(`${at}: \`clockId\` must be a non-empty string`);
    if (typeof clock === "string") run.finished.add(clock);
    else run.anonymous++;
    const dropped = event.dropped;
    if (dropped !== undefined && (typeof dropped !== "number" || !Number.isInteger(dropped) || dropped < 0)) throw new Error(`${at}: \`dropped\` must be a non-negative integer`);
    const instrumented = ids("instrumented", "symbol ids");
    const reasons = event.uninstrumented;
    if (reasons !== undefined && (typeof reasons !== "object" || reasons === null || Array.isArray(reasons) || Object.values(reasons).some((r) => typeof r !== "string"))) throw new Error(`${at}: \`uninstrumented\` must be an object of strings`);
    for (const [id, reason] of Object.entries((reasons ?? {}) as Record<string, string>)) if (!run.uninstrumented.has(id)) run.uninstrumented.set(id, reason);
    const open = ids("open", "span ids") ?? [];
    run.complete &&= event.complete === true;
    run.dropped = run.dropped === null || dropped === undefined ? null : run.dropped + dropped;
    // A symbol is instrumented in the run only when every process says so.
    const known = run.instrumented;
    if (instrumented === undefined) run.instrumented = null;
    else if (run.runEvents === 0) run.instrumented = new Set(instrumented);
    else if (known !== null) run.instrumented = new Set(instrumented.filter((id) => known.has(id)));
    for (const id of open) run.open.add(id);
    run.runEvents++;
  } else {
    throw new Error(`${at}: unknown event \`${kind}\``);
  }
}

/** The run once every file is read: each end closes its start, wherever the two were. */
function finishRun(draft: RunDraft): TraceRun {
  for (const { spanId, end, at } of draft.pendingEnds) {
    const span = draft.spans.get(spanId);
    if (!span) throw new Error(`${at}: end of unknown span \`${spanId}\``);
    if (span.end !== null) throw new Error(`${at}: span \`${spanId}\` ended twice`);
    span.end = end;
  }
  const spans = [...draft.spans.values()];
  for (const span of spans) if (span.end === null) draft.open.add(span.spanId);
  const [snapshotId] = draft.snapshots;
  // A process that wrote spans but no `run` record (killed, terminated, gone with its parent's exit) left the run
  // short of its end. A record without a clock does not say whose it is, so with one the clocks are not judged.
  const unfinished = draft.anonymous > 0 ? 0 : [...draft.clocks].filter((clock) => !draft.finished.has(clock)).length;
  return {
    files: draft.files,
    runId: draft.runId,
    testId: draft.testId,
    flow: draft.flow,
    snapshotId: draft.snapshots.size === 1 ? (snapshotId ?? null) : null,
    spans,
    complete: draft.complete && draft.runEvents > 0 && unfinished === 0,
    unfinished,
    dropped: draft.runEvents > 0 ? draft.dropped : null,
    open: draft.open,
    instrumented: draft.instrumented,
    uninstrumented: draft.uninstrumented,
  };
}

/**
 * A flow as trace matching sees it. `key` identifies the spec node across runs.
 * A `parallel` group's steps are matched under the group's parent in any
 * order, each after the sibling before the group; the sibling after the group
 * starts after every step of it.
 */
export type ShapeNode =
  | { kind: "step"; key: number; id: string; children: ShapeNode[] }
  | { kind: "when"; key: number; children: ShapeNode[] }
  | { kind: "parallel"; key: number; children: ShapeNode[] };

export interface TraceEvidence {
  verdict: "ok" | "fail" | "unverified";
  message: string;
  runId: string | null;
  testId: string | null;
}

type Outcome = TraceEvidence;

/**
 * Trace verdicts for every step and `when` of one flow, keyed by `ShapeNode.key`.
 * The trigger (if any) must be observed; its steps are matched inside it. A
 * run that never entered the trigger ran something else (a unit test of one
 * step): it says nothing about the flow while another run entered it.
 */
export function traceFlow(runs: readonly TraceRun[], flow: string, trigger: { key: number; id: string } | null, shape: readonly ShapeNode[], snapshotId: string | null): Map<number, TraceEvidence> {
  // Outcomes of runs that entered the trigger (every current run for a flow without one), and of the others.
  const entered = new Map<number, Outcome[]>();
  const others = new Map<number, Outcome[]>();
  const note = (into: Map<number, Outcome[]>, key: number, outcome: Outcome): void => {
    const list = into.get(key) ?? [];
    list.push(outcome);
    into.set(key, list);
  };
  const tree: ShapeNode[] = trigger ? [{ kind: "step", key: trigger.key, id: trigger.id, children: [...shape] }] : [...shape];
  const keys = keysOf(tree);
  const mine = runs.filter((run) => run.flow === flow);
  for (const run of mine) {
    const base = { runId: run.runId, testId: run.testId };
    const where = run.files.join(", ");
    if (run.snapshotId === null) {
      for (const key of keys) note(others, key, { verdict: "unverified", message: `trace ${where} is not bound to a snapshot`, ...base });
      continue;
    }
    if (run.snapshotId !== snapshotId) {
      for (const key of keys) note(others, key, { verdict: "unverified", message: `stale trace ${where} (snapshot ${run.snapshotId.slice(0, 12)})`, ...base });
      continue;
    }
    if (trigger && !run.spans.some((span) => span.symbolId === trigger.id)) {
      for (const key of keys) note(others, key, { verdict: "unverified", message: `trigger not observed in ${run.testId}`, ...base });
      continue;
    }
    for (const [key, outcome] of new Matcher(run).match(tree, trigger !== null)) note(entered, key, outcome);
  }
  const out = new Map<number, TraceEvidence>();
  for (const key of keys) {
    const outcomes = entered.get(key) ?? others.get(key) ?? [];
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

function keysOf(nodes: readonly ShapeNode[]): number[] {
  return nodes.flatMap((node) => [node.key, ...keysOf(node.children)]);
}

/** Spans of one run tried before its matching is given up as too large to search. */
const MATCH_BUDGET = 200_000;

class OverBudget extends Error {}

/** Spans assigned to flow nodes: an outcome per node and the spans it took. */
interface Assignment {
  outcomes: [number, Outcome][];
  spans: string[];
  ok: number;
  fail: number;
}

const NOTHING: Assignment = { outcomes: [], spans: [], ok: 0, fail: 0 };

function assignment(outcomes: [number, Outcome][], spans: string[] = []): Assignment {
  return { outcomes, spans, ok: outcomes.filter(([, o]) => o.verdict === "ok").length, fail: outcomes.filter(([, o]) => o.verdict === "fail").length };
}

function combine(...parts: Assignment[]): Assignment {
  return { outcomes: parts.flatMap((p) => p.outcomes), spans: parts.flatMap((p) => p.spans), ok: parts.reduce((n, p) => n + p.ok, 0), fail: parts.reduce((n, p) => n + p.fail, 0) };
}

/** More steps observed wins, then fewer failures; an earlier candidate keeps a tie. */
function better(a: Assignment, b: Assignment): boolean {
  return a.ok !== b.ok ? a.ok > b.ok : a.fail < b.fail;
}

/**
 * Matches one run against a flow. A test may call the trigger or a step more
 * than once (an early `return` first, the real call later), so every span of a
 * symbol is a candidate: the search keeps the assignment with the most
 * observed steps, and a step fails only when no assignment observes it.
 */
class Matcher {
  private readonly run: TraceRun;
  private readonly byParent = new Map<string | null, TraceSpan[]>();
  private readonly below = new Map<string | null, TraceSpan[]>();
  private readonly belowIds = new Map<string | null, Set<string>>();
  private readonly bounds = new Map<string, number>();
  private readonly spans = new Map<string, TraceSpan>();
  private readonly suffixes = new Map<readonly ShapeNode[], Set<string>[]>();
  private readonly memo = new Map<readonly ShapeNode[], Map<string, Assignment>>();
  private readonly singles = new Map<ShapeNode, readonly ShapeNode[]>();
  /** Spans the assignment being built has taken: one span satisfies one step. */
  private readonly used = new Set<string>();
  private budget = MATCH_BUDGET;

  constructor(run: TraceRun) {
    this.run = run;
    for (const span of run.spans) {
      this.spans.set(span.spanId, span);
      const list = this.byParent.get(span.parentSpanId) ?? [];
      list.push(span);
      this.byParent.set(span.parentSpanId, list);
    }
  }

  /** Outcomes for `nodes` (the trigger with the steps inside it when `trigger`). */
  match(nodes: readonly ShapeNode[], trigger: boolean): [number, Outcome][] {
    let best: Assignment;
    try {
      best = this.list(null, nodes, 0, [], trigger);
    } catch (e) {
      if (!(e instanceof OverBudget)) throw e;
      return keysOf(nodes).map((key) => [key, { verdict: "unverified", message: `trace of ${this.run.testId} is too large to match (${this.run.spans.length} spans)`, ...this.base() }]);
    }
    const doubt = this.incompleteness();
    if (doubt === null) return best.outcomes;
    // A run that did not finish may miss the events that would contradict what was observed.
    return best.outcomes.map(([key, outcome]) => [key, outcome.verdict === "unverified" ? outcome : { ...outcome, verdict: "unverified", message: `${outcome.message}; ${doubt}` }]);
  }

  private base(): { runId: string; testId: string } {
    return { runId: this.run.runId, testId: this.run.testId };
  }

  /** Spans under `parent` (all spans for null), depth-first in start order. */
  private descendants(parent: TraceSpan | null): TraceSpan[] {
    const key = parent?.spanId ?? null;
    const cached = this.below.get(key);
    if (cached) return cached;
    const out: TraceSpan[] = [];
    if (parent === null) out.push(...this.run.spans);
    else {
      const visit = (id: string): void => {
        for (const child of this.byParent.get(id) ?? []) {
          out.push(child);
          visit(child.spanId);
        }
      };
      visit(parent.spanId);
    }
    this.below.set(key, out);
    return out;
  }

  private candidates(parent: TraceSpan | null, id: string): TraceSpan[] {
    return this.descendants(parent).filter((span) => span.symbolId === id && !this.used.has(span.spanId));
  }

  /** Why the run cannot confirm or refute what it shows, or null for a finished run. */
  private incompleteness(): string | null {
    if (this.run.unfinished > 0) return `incomplete trace (${this.run.unfinished} process${this.run.unfinished === 1 ? "" : "es"} ended without its run record)`;
    if (!this.run.complete) return "incomplete trace";
    if (this.run.dropped === null) return "incomplete trace (dropped events unknown)";
    if (this.run.dropped > 0) return `incomplete trace (${this.run.dropped} dropped)`;
    if (this.run.open.size > 0) return `incomplete trace (${this.run.open.size} span${this.run.open.size === 1 ? "" : "s"} open)`;
    return null;
  }

  /** Why an unobserved step is not a proven absence, or null when it is. */
  private absenceDoubt(id: string): string | null {
    const doubt = this.incompleteness();
    if (doubt !== null) return doubt;
    if (this.run.instrumented === null) return "incomplete trace (instrumented symbols unknown)";
    if (!this.run.instrumented.has(id)) {
      const reason = this.run.uninstrumented.get(id);
      return `\`${id}\` is not instrumented${reason ? ` (${reason})` : ""}`;
    }
    return null;
  }

  /** The most steps of `node` and below that any assignment under `parent` could observe. */
  private bound(parent: TraceSpan | null, node: ShapeNode): number {
    const key = `${parent?.spanId ?? ""}\0${node.key}`;
    const cached = this.bounds.get(key);
    if (cached !== undefined) return cached;
    let value: number;
    if (node.kind === "parallel") value = node.children.reduce((sum, child) => sum + this.bound(parent, child), 0);
    else {
      const probe = node.kind === "step" ? node.id : node.children.find((child) => child.kind === "step")?.id;
      const seen = probe !== undefined && this.descendants(parent).some((span) => span.symbolId === probe);
      value = seen ? 1 + node.children.reduce((sum, child) => sum + this.bound(parent, child), 0) : 0;
    }
    this.bounds.set(key, value);
    return value;
  }

  /** Symbols of `nodes[i..]` and everything under them. */
  private symbolsFrom(nodes: readonly ShapeNode[], i: number): Set<string> {
    let cached = this.suffixes.get(nodes);
    if (!cached) {
      cached = [];
      this.suffixes.set(nodes, cached);
    }
    const hit = cached[i];
    if (hit) return hit;
    const out = new Set<string>();
    const add = (node: ShapeNode): void => {
      if (node.kind === "step") out.add(node.id);
      node.children.forEach(add);
    };
    nodes.slice(i).forEach(add);
    cached[i] = out;
    return out;
  }

  /**
   * The best assignment for `nodes[i..]` under `parent`, the sibling before
   * them matched to `previous` (every step of it for a `parallel` group).
   * Memoized: the answer depends on the spans taken so far only through those
   * it could take itself, so the search stays polynomial in the spans of a symbol.
   */
  private list(parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: readonly TraceSpan[], trigger: boolean): Assignment {
    if (i >= nodes.length) return NOTHING;
    const symbols = this.symbolsFrom(nodes, i);
    const parentKey = parent?.spanId ?? null;
    let under = this.belowIds.get(parentKey);
    if (!under) {
      under = new Set(this.descendants(parent).map((span) => span.spanId));
      this.belowIds.set(parentKey, under);
    }
    const inside = under;
    const taken = [...this.used].filter((id) => inside.has(id) && symbols.has(this.spans.get(id)?.symbolId ?? "")).sort();
    const key = JSON.stringify([parent?.spanId ?? null, i, previous.map((span) => span.spanId), taken]);
    let cache = this.memo.get(nodes);
    if (!cache) {
      cache = new Map();
      this.memo.set(nodes, cache);
    }
    const known = cache.get(key);
    if (known) return known;
    const best = this.solve(parent, nodes, i, previous, trigger);
    cache.set(key, best);
    return best;
  }

  private solve(parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: readonly TraceSpan[], trigger: boolean): Assignment {
    const node = nodes[i];
    if (!node) return NOTHING;
    if (node.kind === "when") return this.branch(parent, nodes, i, node, previous, trigger);
    if (node.kind === "parallel") return this.group(parent, nodes, i, node, previous, trigger);
    const pool = this.candidates(parent, node.id);
    const inOrder = pool.filter((span) => !previous.some((before) => startsBefore(span, before)));
    if (inOrder.length > 0) {
      const ceiling = nodes.slice(i).reduce((sum, item) => sum + this.bound(parent, item), 0);
      let best: Assignment | null = null;
      for (const span of inOrder) {
        const option = this.take(parent, nodes, i, node, span, this.orderOutcome(parent, span, previous), trigger);
        if (best === null || better(option, best)) best = option;
        if (best.ok >= ceiling) break;
      }
      return best!;
    }
    const early = pool[0];
    const passed = early ? previous.find((before) => startsBefore(early, before)) : undefined;
    if (early && passed) return this.take(parent, nodes, i, node, early, { verdict: "fail", message: `out of order: starts before \`${passed.symbolId}\``, ...this.base() }, trigger);
    const doubt = this.absenceDoubt(node.id);
    // A span only in another call tree does not prove the step ran under this parent, and it does not prove it never ran.
    const outside = !doubt && parent ? this.outsideRoot(parent, node.id) : null;
    const missing: Outcome = doubt
      ? { verdict: "unverified", message: doubt, ...this.base() }
      : outside
        ? { verdict: "unverified", message: `observed outside \`${parent!.symbolId}\` in another call tree (root \`${outside.symbolId}\`): nesting unknown`, ...this.base() }
        : { verdict: "fail", message: `missing step in ${this.run.testId}`, ...this.base() };
    const unseen: Outcome = { verdict: "unverified", message: trigger ? "trigger not observed" : `parent step \`${node.id}\` not observed`, ...this.base() };
    return combine(assignment([[node.key, missing], ...keysOf(node.children).map((key): [number, Outcome] => [key, unseen])]), this.list(parent, nodes, i + 1, previous, trigger));
  }

  /** `span` as `node`: its children are matched inside it, the siblings after it. */
  private take(parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, span: TraceSpan, outcome: Outcome, trigger: boolean): Assignment {
    if (--this.budget < 0) throw new OverBudget();
    this.used.add(span.spanId);
    const inside = this.list(span, node.children, 0, [], false);
    for (const id of inside.spans) this.used.add(id);
    const after = this.list(parent, nodes, i + 1, [span], trigger);
    for (const id of inside.spans) this.used.delete(id);
    this.used.delete(span.spanId);
    return combine(assignment([[node.key, outcome]], [span.spanId]), inside, after);
  }

  /** A `when` is exercised in this test when its first step is observed; its steps are not ordered after the siblings before it. */
  private branch(parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: readonly TraceSpan[], trigger: boolean): Assignment {
    const first = node.children.find((child) => child.kind === "step");
    if (!first || first.kind !== "step" || this.candidates(parent, first.id).length === 0) {
      const skipped: Outcome = { verdict: "unverified", message: "branch not exercised", ...this.base() };
      return combine(assignment(keysOf([node]).map((key): [number, Outcome] => [key, skipped])), this.list(parent, nodes, i + 1, previous, trigger));
    }
    const inside = this.list(parent, node.children, 0, [], false);
    for (const id of inside.spans) this.used.add(id);
    const after = this.list(parent, nodes, i + 1, previous, trigger);
    for (const id of inside.spans) this.used.delete(id);
    return combine(assignment([[node.key, { verdict: "ok", message: `branch exercised in ${this.run.testId}`, ...this.base() }]]), inside, after);
  }

  /**
   * A `parallel` group: each step is matched under the group's parent after the
   * sibling before the group, in any order with the others, overlap allowed.
   * The sibling after the group is ordered after every step it observed. The
   * group itself is `ok` when every step is, else it takes the worst of them.
   */
  private group(parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: readonly TraceSpan[], trigger: boolean): Assignment {
    const parts: Assignment[] = [];
    const taken: TraceSpan[] = [];
    for (const child of node.children) {
      const part = this.list(parent, this.alone(child), 0, previous, false);
      parts.push(part);
      const first = part.spans[0];
      const span = first === undefined ? undefined : this.spans.get(first);
      // The first span an observed step takes is its own image; its children follow it.
      if (span && span.symbolId === (child.kind === "step" ? child.id : "")) taken.push(span);
      for (const id of part.spans) this.used.add(id);
    }
    const inside = combine(...parts);
    const after = this.list(parent, nodes, i + 1, taken.length > 0 ? taken : previous, trigger);
    for (const id of inside.spans) this.used.delete(id);
    const verdicts = inside.outcomes.filter(([key]) => node.children.some((child) => child.key === key)).map(([, outcome]) => outcome);
    const worst = verdicts.find((outcome) => outcome.verdict === "fail") ?? verdicts.find((outcome) => outcome.verdict === "unverified");
    const own: Outcome = worst ?? { verdict: "ok", message: `every step of the group observed in ${this.run.testId}`, ...this.base() };
    return combine(assignment([[node.key, own]]), inside, after);
  }

  /** `[node]`, the same array every time: `list` memoizes by the array. */
  private alone(node: ShapeNode): readonly ShapeNode[] {
    let list = this.singles.get(node);
    if (!list) {
      list = [node];
      this.singles.set(node, list);
    }
    return list;
  }

  /** Root of the `parentSpanId` chain. A span whose parent is missing is its own root. */
  private rootSpan(span: TraceSpan): TraceSpan {
    let current = span;
    const seen = new Set<string>();
    while (current.parentSpanId && !seen.has(current.spanId)) {
      seen.add(current.spanId);
      const parent = this.spans.get(current.parentSpanId);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  /**
   * A span of `id` whose call tree is not the parent's, and which did not start
   * before the parent image on the same clock. Spans that did start earlier, and
   * spans in the parent's own tree, stay a confirmed absence.
   */
  private outsideRoot(parent: TraceSpan, id: string): TraceSpan | null {
    const parentRoot = this.rootSpan(parent).spanId;
    for (const span of this.run.spans) {
      if (span.symbolId !== id || this.used.has(span.spanId)) continue;
      const root = this.rootSpan(span);
      if (root.spanId === parentRoot || startsBefore(span, parent)) continue;
      return root;
    }
    return null;
  }

  /** `span`'s parent chain passes through `ancestor` (the image of the previous sibling). */
  private nestedIn(span: TraceSpan, ancestor: TraceSpan): boolean {
    const seen = new Set<string>();
    let id = span.parentSpanId;
    while (id && !seen.has(id)) {
      if (id === ancestor.spanId) return true;
      seen.add(id);
      id = this.spans.get(id)?.parentSpanId ?? null;
    }
    return false;
  }

  /** The order of `span` after every span of `previous`: the first that is not `ok`, else `ok`. */
  private orderOutcome(parent: TraceSpan | null, span: TraceSpan, previous: readonly TraceSpan[]): Outcome {
    if (previous.length === 0) return this.orderAfter(parent, span, null);
    const outcomes = previous.map((before) => this.orderAfter(parent, span, before));
    return outcomes.find((outcome) => outcome.verdict === "fail") ?? outcomes.find((outcome) => outcome.verdict === "unverified") ?? outcomes[0]!;
  }

  private orderAfter(parent: TraceSpan | null, span: TraceSpan, after: TraceSpan | null): Outcome {
    // A later sibling inside the previous sibling's subtree is not after it. `links` do not repair that.
    if (after && this.nestedIn(span, after)) {
      return { verdict: "fail", message: `nested in \`${after.symbolId}\`, not after it`, ...this.base() };
    }
    // A child that starts after its parent ended ran asynchronously: nesting needs a link.
    if (parent?.end && sameClock(parent.end, span.start) && parent.end.seq < span.start.seq && !span.links.includes(parent.spanId)) {
      return { verdict: "unverified", message: `async step without a link to \`${parent.symbolId}\``, ...this.base() };
    }
    if (after) {
      if (span.links.includes(after.spanId)) return { verdict: "ok", message: `observed in ${this.run.testId}`, ...this.base() };
      if (!sameClock(after.start, span.start)) return { verdict: "unverified", message: `order unverified: \`${after.symbolId}\` and \`${span.symbolId}\` ran on different clocks without links`, ...this.base() };
      if (!after.end || (sameClock(after.end, span.start) && after.end.seq > span.start.seq)) return { verdict: "unverified", message: `order unverified: \`${span.symbolId}\` starts before \`${after.symbolId}\` ends (parallel)`, ...this.base() };
      // Sequence numbers of different clocks do not compare.
      if (!sameClock(after.end, span.start)) return { verdict: "unverified", message: `order unverified: \`${after.symbolId}\` ended on another clock than \`${span.symbolId}\` started, without links`, ...this.base() };
    }
    return { verdict: "ok", message: `observed in ${this.run.testId}`, ...this.base() };
  }
}

function sameClock(a: Mark, b: Mark): boolean {
  return a.clockId === b.clockId;
}

function startsBefore(span: TraceSpan, other: TraceSpan): boolean {
  return sameClock(span.start, other.start) && span.start.seq < other.start.seq;
}
