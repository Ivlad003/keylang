// Evidence for flows: ID, static, tests, and trace are separate verdicts.
// A step is checked from its parent (the trigger for a top-level step), never
// from its siblings. Reports and traces are loaded by the caller; this module
// only compares them with the specs and the snapshot.

import { createHash } from "node:crypto";
import { OUTSIDE_LAYER, type StaticMode, type StaticSource } from "./config.ts";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { asciiLowerCase, caselessNames, constructorName } from "./languages.ts";
import type { Index } from "./resolve.ts";
import { compareText, type Span } from "./span.ts";
import { scheduleText } from "./parser.ts";
import type { ClaimItem, FlowItem, SpecIR, TestItem, ThenItem, TimerItem, Trigger, WhenItem } from "./spec-ir.ts";
import { matchTest, type TestCase } from "./test-report.ts";
import { traceFlow, type ShapeNode, type TraceEvidence, type TraceRun } from "./trace-evidence.ts";
import type { Verdict } from "./verdict.ts";

/** How a call edge came about when it is not a plain call of the code (`Via` of the graph): a hook, an argument, a framework's config. */
type Via = "default" | "injected" | "callable-arg" | "closure-arg" | "preference" | "argument" | "plugin:before" | "plugin:around" | "plugin:after" | "observer" | "dispatch";

interface SnapshotEdge {
  kind: string;
  source: string;
  target: string | null;
  candidates?: string[];
  resolution: string;
  file: string | null;
  line: number;
  col: number;
  reason?: string;
  text?: string;
  via?: Via;
  hook?: string;
  site?: string;
  /** Config edges (ADR 0022): the area, the module whose config declares it, the fact in words. */
  scope?: string;
  owner?: string;
  binding?: string;
  closure?: true;
  /** An `import` or `reexport` of types only (`import type`, `export type … from`): erased from the code that runs. */
  typeOnly?: true;
  /** `docblock`: the edge rests on a docblock the language does not check (PHP `@var`, `@param`), at `docblock`; the verdict names it. */
  provenance?: string;
  docblock?: string;
}

interface SnapshotNodeView {
  kind: string;
  /** A module node that is a class. */
  class?: true;
  layer?: string;
  members?: string;
  signature?: string | null;
  file: string | null;
  line: number | null;
  endLine?: number;
  escapes?: { file: string; line: number; col: number; reason: string };
}

export interface FlowInput {
  snapshotId: string | null;
  nodes: Record<string, SnapshotNodeView>;
  edges: SnapshotEdge[];
  /** Constructs the snapshot does not turn into edges (`eval`, computed members, …). */
  coverage?: { kind: string; file: string; line: number; col: number; reason: string; text?: string; source?: string | null }[];
  /**
   * Resolved by the caller (`resolveStatic`). Omitted is not a mode: a hook
   * edge is followed only when this is `behavior`.
   */
  static?: StaticMode;
  /** Who set `static`. The evidence names the flag or `keylang.json check.static`. */
  staticSetBy?: StaticSource;
  /** Test cases from `check.tests`; null when it is not configured. */
  tests: TestCase[] | null;
  /** Trace runs from `check.trace`; null when it is not configured. */
  traces: TraceRun[] | null;
  /**
   * Entry points of the snapshot (`keylang entries`): what `trigger <kind> <id>`
   * and `every` are compared with. Omitted for a snapshot written before them.
   */
  entries?: readonly EntryView[];
  /**
   * Whether a `test` path names a file of the repository. Omitted when the
   * specs are checked without the repository (no file is K203 then).
   */
  testFileExists?: (path: string) => boolean;
}

/** An entry point as flows read it. */
export interface EntryView {
  kind: string;
  id: string;
  label: string;
  framework?: string | null;
}

interface Planned {
  kind: string;
  signature: string | null;
  file: string;
  span: Span;
  /** The code now has a matching symbol: the step is checked as implemented. */
  implemented: boolean;
}

type Channel = "ID" | "static" | "tests" | "trace";

type FlowNode = Trigger | FlowItem;

export function evaluateFlows(compiled: SpecIR, index: Index, input: FlowInput): { diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  const planned = collectPlanned(compiled, input, diagnostics);
  const graph = callGraph(input);
  // The spec line a verdict is about, for its hash: set while a node is visited.
  let spec = "";
  const verdict = (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string, evidence?: Verdict["evidence"]): void => {
    verdicts.push({
      verdict: value,
      criterion: channel,
      area,
      snapshotId: input.snapshotId,
      specHash: specHash(spec),
      file,
      line: span.start.line,
      col: span.start.col,
      code: channel,
      message: `${value} ${area}: ${message}`,
      ...(evidence ? { evidence } : {}),
    });
  };

  for (const flow of compiled.flows) {
    const file = flow.file;
    // A flow is matched from its first trigger. Later triggers stay in the spec and are reported, not matched.
    const triggerNode = flow.triggers[0];
    const trigger = triggerNode?.target.target ?? null;
    let key = 0;
    const keys = new Map<FlowNode, number>();
    const shape = (nodes: readonly FlowItem[]): ShapeNode[] =>
      nodes.flatMap((node): ShapeNode[] => {
        if (node.kind === "when" || node.kind === "parallel") {
          keys.set(node, key);
          return [{ kind: node.kind, key: key++, children: shape(node.children) }];
        }
        if (node.kind !== "step") return [];
        const id = node.target.target;
        // A planned step is not expected in a trace; its children cannot be matched under it.
        if (planned.get(id)?.implemented === false) return [];
        keys.set(node, key);
        return [{ kind: "step", key: key++, id, children: shape(node.children) }];
      });
    // Steps may sit under the trigger or beside it; either way the trigger is their parent.
    const tree = shape([...(triggerNode?.children ?? []), ...flow.items]);
    const triggerKey = triggerNode && trigger ? key++ : null;
    if (triggerNode && triggerKey !== null) keys.set(triggerNode, triggerKey);
    const traced: Map<number, TraceEvidence> | null =
      input.traces === null ? null : traceFlow(input.traces, flow.name, trigger && triggerKey !== null ? { key: triggerKey, id: trigger } : null, tree, input.snapshotId);

    // `blocked` is why this node is not matched: a later trigger, or the nearest planned ancestor.
    const visit = (node: FlowNode, parent: string | null, claim: ClaimItem | ThenItem | WhenItem | TimerItem | null, blocked: string | null): void => {
      spec = node.text;
      const nodeKey = keys.get(node);
      const traceOf = (): TraceEvidence | undefined => (nodeKey === undefined ? undefined : traced?.get(nodeKey));
      if (node.kind === "step" || node.kind === "trigger") {
        const id = node.target.target;
        const laterTrigger = node.kind === "trigger" && node !== triggerNode;
        const ownBlock = laterTrigger ? "a flow is matched from its first trigger only" : blocked;
        const plan = planned.get(id);
        const pending = plan !== undefined && !plan.implemented;
        const known = idVerdict(id, pending ? plan : undefined, node.span, file, index, input, verdict);
        if (node.kind === "trigger" && node.entry !== null && known !== "fail") {
          const entry = entryVerdict(node.entry.kind, id, input.entries);
          if (entry.mismatch) diagnostics.push(diagnostic("K205", file, node.entry.span, entry.message));
          else verdict("static", `${node.entry.kind} ${id}`, entry.verdict, file, node.span, entry.message, { provenance: "syntactic" });
        }
        const parentPlanned = parent !== null && planned.get(parent)?.implemented === false;
        // A dangling id is K001 already; a static line would count it twice.
        if (node.kind === "step" && known !== "fail") {
          if (pending) verdict("static", id, "unverified", file, node.span, `planned ${plan.kind}, not implemented`);
          else if (parentPlanned) verdict("static", id, "unverified", file, node.span, `parent \`${parent}\` is planned, not implemented`);
          else if (input.nodes[id] !== undefined) {
            const reach = reachability(graph, input, parent, id);
            verdict("static", id, reach.verdict, file, node.span, reach.message, { provenance: "syntactic" });
          } else verdict("static", id, "unverified", file, node.span, "not in the snapshot (opaque module)");
        }
        if (traced !== null) {
          if (pending) verdict("trace", id, "unverified", file, node.span, `planned ${plan.kind}`);
          else if (ownBlock) verdict("trace", id, "unverified", file, node.span, ownBlock);
          else {
            const evidence = traceOf();
            if (evidence) verdict("trace", id, evidence.verdict, file, node.span, evidence.message, traceProvenance(evidence));
          }
        }
        const childBlock = pending ? `parent step \`${id}\` is planned` : laterTrigger ? "a flow is matched from its first trigger only" : blocked;
        for (const child of node.children) visit(child, id, claim, childBlock);
        return;
      }
      if (node.kind === "calls") {
        // A static proof without order: the parent fn calls each target itself.
        const parentPlanned = parent !== null && planned.get(parent)?.implemented === false;
        for (const ref of node.targets) {
          const id = ref.target;
          const plan = planned.get(id);
          const pending = plan !== undefined && !plan.implemented;
          if (idVerdict(id, pending ? plan : undefined, ref.span, file, index, input, verdict) === "fail") continue;
          if (pending) verdict("static", id, "unverified", file, ref.span, `planned ${plan.kind}, not implemented`);
          else if (parentPlanned) verdict("static", id, "unverified", file, ref.span, `parent \`${parent}\` is planned, not implemented`);
          else if (input.nodes[id] !== undefined) {
            const call = directCall(graph, input, parent, id);
            verdict("static", id, call.verdict, file, ref.span, call.message, { provenance: "syntactic" });
          } else verdict("static", id, "unverified", file, ref.span, "not in the snapshot (opaque module)");
        }
        return;
      }
      // The steps of a group are checked from the group's parent, each on its own.
      if (node.kind === "parallel") {
        for (const child of node.children) visit(child, parent, claim, blocked);
        return;
      }
      // Both flows exist (K206 otherwise); one trace run is one request, so it cannot follow the other flow.
      if (node.kind === "continues") {
        const other = index.flows.get(node.flow);
        if (other === undefined) return;
        const area = `continues ${node.flow}`;
        verdict("ID", area, "ok", file, node.span, `flow \`${node.flow}\` at ${other.file}:${other.span.start.line}`);
        if (traced !== null) verdict("trace", area, "unverified", file, node.span, `crosses requests: \`${flow.name}\` starts in a later request than \`${node.flow}\`, and a trace run follows one request`);
        return;
      }
      if (node.kind === "after" || node.kind === "every") {
        const area = claimArea(node);
        if (node.kind === "every") {
          const schedule = scheduleVerdict(parent, node.value, input.entries);
          verdict("static", area, schedule.verdict, file, node.span, schedule.message, { provenance: "syntactic" });
        }
        const proofs = node.children.filter((child): child is TestItem => child.kind === "test");
        if (input.tests !== null && proofs.length === 0) verdict("tests", area, "unverified", file, node.span, "no test evidence: only a nested `test` checks a timer");
        for (const child of node.children) visit(child, parent, node, blocked);
        return;
      }
      // `reads` says only that the ID exists, until reads have evidence of their own.
      if (node.kind === "reads") {
        for (const ref of node.source.refs) {
          const plan = planned.get(ref.target);
          idVerdict(ref.target, plan !== undefined && !plan.implemented ? plan : undefined, ref.span, file, index, input, verdict);
        }
      }
      if (node.kind === "when") {
        const evidence = traceOf();
        if (evidence) verdict("trace", `when ${node.condition}`, evidence.verdict, file, node.span, evidence.message, traceProvenance(evidence));
      }
      // Without `check.tests` the channel is not asked for: nothing is printed and nothing counts.
      const tests = input.tests;
      if (node.kind === "invariant" || node.kind === "when" || node.kind === "then" || node.kind === "reads" || node.kind === "emits") {
        const area = claimArea(node);
        const proofs = node.children.filter((child): child is TestItem => child.kind === "test");
        if (tests !== null && proofs.length === 0 && node.kind !== "when") {
          const prose = node.kind === "then" ? (node.form === "text" ? node.prose : "") : node.kind === "reads" ? "" : node.body;
          verdict("tests", area, "unverified", file, node.span, quantitative(prose) ? "needs a separate predicate or test (quantitative or negative property)" : "no test evidence");
        }
        for (const child of node.children) visit(child, parent, node, blocked);
        return;
      }
      if (node.kind === "test") {
        // A dangling test file is checked with or without `check.tests`: no report can ever prove it.
        if (input.testFileExists && !input.testFileExists(node.path)) {
          diagnostics.push(diagnostic("K203", file, node.source.text?.span ?? node.span, `\`${node.path}\` does not exist`));
        }
        if (tests === null) return;
        const name = node.name ?? "";
        const matched = matchTest(tests, node.path, name, input.snapshotId);
        const area = claim ? claimArea(claim) : `test ${node.path} "${name}"`;
        verdict("tests", area, matched.verdict, file, node.span, `${matched.message} (${node.path} "${name}")`, { provenance: "test-report", ...(matched.runId ? { runId: matched.runId } : {}) });
      }
    };
    for (const node of flow.top) visit(node, trigger, null, null);
  }
  return { diagnostics, verdicts };
}

function claimArea(node: ClaimItem | ThenItem | WhenItem | TimerItem): string {
  if (node.kind === "when") return `when ${node.condition}`;
  if (node.kind === "then") return node.form === "ref" ? `then ${node.target.target}` : `then ${node.prose}`;
  if ("value" in node) return `${node.kind} ${node.value}`;
  return `${node.kind} ${node.body}`.trim();
}

/**
 * `trigger <kind> <id>` against the entry points of the snapshot: `ok` with the
 * entry's label when the fn is an entry of that kind; `mismatch` (K205) when it
 * is an entry of other kinds only; `unverified` when no entry names it, since
 * an adapter keylang lacks may know it.
 */
function entryVerdict(kind: string, id: string, entries: readonly EntryView[] | undefined): { verdict: Verdict["verdict"]; message: string; mismatch: boolean } {
  if (entries === undefined) return { verdict: "unverified", message: "the snapshot records no entry points; run `keylang map` again", mismatch: false };
  const own = entries.filter((entry) => entry.id === id);
  const match = own.find((entry) => entry.kind === kind);
  if (match) return { verdict: "ok", message: `entry point \`${match.label}\`${match.framework ? ` (${match.framework})` : ""}`, mismatch: false };
  if (own.length > 0) {
    const listed = own.map((entry) => `${entry.kind} \`${entry.label}\``).join(", ");
    return { verdict: "fail", message: `\`trigger ${kind}\` names \`${id}\`, which the snapshot records as an entry point of another kind: ${listed}`, mismatch: true };
  }
  return { verdict: "unverified", message: `\`${id}\` is not an entry point the snapshot records (\`keylang entries\`); a framework's ${kind} entry points need its adapter`, mismatch: false };
}

/** The cron fields of `@hourly` and the other macros. */
const CRON_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

/** A schedule in a comparable form: cron fields (a macro expanded) or a duration. */
function scheduleForm(text: string): { form: "cron" | "duration"; value: string } {
  const macro = CRON_MACROS[text];
  if (macro !== undefined) return { form: "cron", value: macro };
  return text.includes(" ") ? { form: "cron", value: text } : { form: "duration", value: text };
}

/**
 * The schedule a cron entry's label carries: the whole label when it is one,
 * else its last six or five words (`clean_quotes 0 0 * * *`); null when the
 * adapter did not write it.
 */
function labelSchedule(label: string): string | null {
  const words = label.trim().split(/\s+/).filter((word) => word !== "");
  return scheduleText(words) ?? scheduleText(words.slice(-6)) ?? scheduleText(words.slice(-5));
}

/**
 * Static evidence of `every <schedule>`: the cron entry point of the parent (the
 * trigger for a top-level line) runs on the written schedule. `ok` when one
 * does, `fail` when every cron entry of the fn says another schedule of the
 * same form, else `unverified` (no cron entry, no schedule in its label, or a
 * duration against cron fields).
 */
function scheduleVerdict(parent: string | null, written: string, entries: readonly EntryView[] | undefined): { verdict: Verdict["verdict"]; message: string } {
  const only = "only a nested `test` checks it";
  if (parent === null) return { verdict: "unverified", message: `no trigger or step it schedules; ${only}` };
  if (entries === undefined) return { verdict: "unverified", message: `the snapshot records no entry points; ${only}` };
  const crons = entries.filter((entry) => entry.id === parent && entry.kind === "cron");
  if (crons.length === 0) return { verdict: "unverified", message: `\`${parent}\` is not a cron entry point the snapshot records; ${only}` };
  const want = scheduleForm(written);
  const known = crons.flatMap((entry) => {
    const text = labelSchedule(entry.label);
    return text === null ? [] : [{ entry, text, form: scheduleForm(text) }];
  });
  if (known.length === 0) return { verdict: "unverified", message: `the cron entry point \`${crons[0]!.label}\` does not say its schedule; ${only}` };
  const same = known.find((item) => item.form.form === want.form && item.form.value === want.value);
  if (same) return { verdict: "ok", message: `the cron entry point \`${same.entry.label}\` runs on \`${same.text}\`` };
  const comparable = known.filter((item) => item.form.form === want.form);
  if (comparable.length === known.length) return { verdict: "fail", message: `the cron entry point \`${known[0]!.entry.label}\` runs on \`${known[0]!.text}\`, not \`${written}\`` };
  return { verdict: "unverified", message: `\`${written}\` does not compare with the cron schedule \`${known[0]!.text}\`; ${only}` };
}

function traceProvenance(evidence: TraceEvidence): Verdict["evidence"] {
  return { provenance: "trace", ...(evidence.runId ? { runId: evidence.runId } : {}), ...(evidence.testId ? { testId: evidence.testId } : {}) };
}

/** A count, a bound, or a negation: a subsequence of calls cannot prove it. */
function quantitative(text: string): boolean {
  return /(\bno more than\b|\bat most\b|\bat least\b|\bnever\b|\bexactly\b|\bonly once\b|\bnot more\b|≤|≥|<=|>=|не більше|не менше|жодного|ніколи|рівно|лише раз)/i.test(text);
}

function idVerdict(
  id: string,
  plan: Planned | undefined,
  span: Span,
  file: string,
  index: Index,
  input: FlowInput,
  verdict: (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string) => void,
): Verdict["verdict"] {
  const say = (value: Verdict["verdict"], message: string): Verdict["verdict"] => {
    verdict("ID", id, value, file, span, message);
    return value;
  };
  if (plan) return say("unverified", `planned ${plan.kind}`);
  if (input.nodes[id] !== undefined || index.lookup(id).kind === "exact") return say("ok", "exact");
  if (moduleMembers(input.nodes, id) === "opaque") return say("unverified", "opaque module");
  return say("fail", "K001 dangling reference");
}

interface Step {
  from: string;
  to: string;
  edge: SnapshotEdge;
}

interface CallGraph {
  /** Resolved call edges by source; `to` is a class's constructor for `new X()`. */
  resolved: Map<string, Step[]>;
  /** Unresolved and ambiguous call edges by source function. */
  open: Map<string, SnapshotEdge[]>;
  /** Every known caller of a fn: resolved edges of both kinds and ambiguous candidates. */
  callers: Map<string, Step[]>;
  /** Fns by the name code calls them (`callName`), for calls whose receiver is unknown. */
  byName: Map<string, string[]>;
  /** Fns of a language whose names compare without case (PHP), by that name in ASCII lower case. */
  byCaselessName: Map<string, string[]>;
  /** Unsupported constructs by file. */
  unsupported: Map<string, NonNullable<FlowInput["coverage"]>>;
  /**
   * A module keylang has not read (excluded, unparsed): its calls are unknown.
   * Not one `outside` the architecture: architecture code cannot reach it without a K107.
   */
  opaque: string | null;
  /** A framework config keylang did not read, which may call any fn (ADR 0022). */
  unreadConfig: NonNullable<FlowInput["coverage"]>[number] | null;
  /** Fns a call of whose name may not run the body keylang read (a decorator that may replace it). */
  replaced: Map<string, string>;
  /** Fns in a file that does not parse: the module does not load, and its code is not what keylang read. */
  unreadable: Map<string, string>;
  /** What a call of `id` runs: the class constructor for a class, else `id` itself. */
  callable: (id: string) => string;
}

function callGraph(input: FlowInput): CallGraph {
  const resolved = new Map<string, Step[]>();
  const open = new Map<string, SnapshotEdge[]>();
  const callers = new Map<string, Step[]>();
  const add = <T>(map: Map<string, T[]>, key: string, item: T): void => {
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  };
  // `new X()` (Python `X()`) names the class; what runs is its constructor (`__init__`).
  const constructorOf = (id: string): string => `${id}.${constructorName(input.nodes[id]?.file) ?? "constructor"}`;
  const callable = (id: string): string => (input.nodes[id]?.kind !== "fn" && input.nodes[constructorOf(id)]?.kind === "fn" ? constructorOf(id) : id);
  for (const edge of input.edges) {
    if (edge.kind !== "call") continue;
    if (edge.resolution === "resolved" && edge.target) {
      const step = { from: edge.source, to: callable(edge.target), edge };
      add(resolved, edge.source, step);
      add(callers, step.to, step);
    } else {
      add(open, edge.source, edge);
      for (const candidate of edge.candidates ?? []) add(callers, callable(candidate), { from: edge.source, to: callable(candidate), edge });
    }
  }
  const byName = new Map<string, string[]>();
  const byCaselessName = new Map<string, string[]>();
  for (const [id, node] of Object.entries(input.nodes)) {
    if (node.kind !== "fn") continue;
    add(byName, callName(id), id);
    if (caselessNames(node.file)) add(byCaselessName, asciiLowerCase(callName(id)), id);
  }
  const unsupported = new Map<string, NonNullable<FlowInput["coverage"]>>();
  for (const item of input.coverage ?? []) if (item.kind === "unsupported") add(unsupported, item.file, item);
  const opaque = Object.entries(input.nodes).find(([, node]) => node.kind === "module" && node.members === "opaque" && node.layer !== "external" && node.layer !== OUTSIDE_LAYER)?.[0] ?? null;
  // A framework's config keylang did not read (`frameworks` leaves it out, it does not parse): the framework may call any fn by it.
  const unreadConfig = (input.coverage ?? []).find((item) => item.kind === "skipped-file" && item.text?.startsWith("framework:")) ?? null;
  return { resolved, open, callers, byName, byCaselessName, unsupported, opaque, unreadConfig, callable, ...doubtfulBodies(input) };
}

/**
 * Fns whose body a proof cannot pass through. A decorator in coverage
 * (`@replace` before `def decorated`) belongs to the fn it names as its source
 * or, when its source is the module, to the first fn declared at or after it.
 * A file with a syntax error makes every fn in it unreadable.
 */
function doubtfulBodies(input: FlowInput): { replaced: Map<string, string>; unreadable: Map<string, string> } {
  const fns = Object.entries(input.nodes)
    .flatMap(([id, node]) => (node.kind === "fn" && node.file !== null && node.line !== null ? [{ id, file: node.file, line: node.line }] : []))
    .sort((a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.id, b.id));
  const replaced = new Map<string, string>();
  const unreadable = new Map<string, string>();
  for (const item of input.coverage ?? []) {
    const where = `${item.file}:${item.line}:${item.col}`;
    if (item.kind === "parse-error") {
      for (const fn of fns) if (fn.file === item.file && !unreadable.has(fn.id)) unreadable.set(fn.id, `\`${fn.id}\` is in a module that does not parse: ${item.reason} at ${where}`);
      continue;
    }
    // A decorator (`@replace`) or an attribute macro (`#[replace]`) the extractor did not know.
    if (!item.text?.startsWith("@") && !item.text?.startsWith("#[")) continue;
    const owner = item.source && input.nodes[item.source]?.kind === "fn" ? item.source : fns.find((fn) => fn.file === item.file && fn.line >= item.line)?.id;
    if (owner && !replaced.has(owner)) replaced.set(owner, `\`${owner}\` may not run its own body: ${item.reason} at ${where}`);
  }
  return { replaced, unreadable };
}

function lastSegment(text: string): string {
  return text.slice(text.lastIndexOf(".") + 1);
}

/**
 * The name code calls a fn by: `m` for `X.m` and `X.m-static`, `#go` for
 * `X.go-private` (§11: a member that shares its name with another gets a suffix).
 */
function callName(id: string): string {
  const segment = lastSegment(id);
  const suffix = /-(static-private|private|static)$/.exec(segment);
  if (!suffix) return segment;
  const name = segment.slice(0, suffix.index);
  return suffix[1] === "static" ? name : `#${name}`;
}

/**
 * Fns a call by `name` (`feed`, `#work`) may run. A `#work` call also matches a private member
 * whose ID has no suffix; a fn of PHP matches the name in any ASCII case (`x.RUN` may run `run`).
 */
function namedLike(graph: CallGraph, name: string): string[] {
  const named = (key: string): string[] => [...(graph.byName.get(key) ?? []), ...(graph.byCaselessName.get(asciiLowerCase(key)) ?? [])];
  return [...new Set([...named(name), ...(name.startsWith("#") ? named(name.slice(1)) : [])])];
}

/** A `via` edge in words. `where`: with the position of a passed callable (a hole's message adds the edge's position itself). */
function describeVia(edge: SnapshotEdge, where = true): string {
  if (edge.via === "preference" || edge.via === "argument" || edge.via === "observer" || edge.via === "dispatch" || edge.via?.startsWith("plugin:")) return describeConfig(edge);
  if (edge.via === "injected") return `\`${edge.hook ?? edge.text ?? ""}\` injected at ${edge.site ?? "?"}`;
  if (edge.via === "callable-arg") return `the callable \`${edge.text ?? ""}\` passed${where ? ` at ${at(edge)}` : " as an argument"}`;
  if (edge.via === "closure-arg") return `the closure passed at ${edge.site ?? at(edge)}`;
  return `the default of the hook \`${edge.hook ?? edge.text ?? ""}\``;
}

/**
 * A call the framework makes by its config, as the verdict names it: `the
 * preference `I → C` in `etc/di.xml:12``, `the plugin `p` (`P`) on `X`
 * (plugin:around) in `etc/di.xml:30``, with the area when it is not global.
 */
export function describeConfig(edge: Pick<SnapshotEdge, "via" | "binding" | "site" | "scope">): string {
  const where = edge.site ? ` in \`${edge.site.replace(/:\d+$/, "")}\`` : "";
  const scope = edge.scope && edge.scope !== "global" ? ` (scope ${edge.scope})` : "";
  if (edge.via === "preference") return `the preference ${edge.binding ?? ""}${where}${scope}`;
  if (edge.via === "argument") return `${edge.binding ?? "a constructor argument"}${where}${scope}`;
  if (edge.via === "observer" || edge.via === "dispatch") return `${edge.binding ?? `the ${edge.via}`}${where}${scope}`;
  return `the ${edge.binding ?? "plugin"} (${edge.via})${where}${scope}`;
}

/**
 * The edges a static mode follows as a proof: plain calls outside closures;
 * in `behavior` also hook edges, callables passed as arguments and calls in
 * a closure passed as an argument (the callee of the call holds it).
 */
function provesIn(behavior: boolean): (step: Step) => boolean {
  return (step) => (behavior ? step.edge.via === "closure-arg" || !step.edge.closure : !step.edge.closure && step.edge.via === undefined);
}

/**
 * The edge is a route only when some holder calls the closure it sits in: a
 * call in a stored closure, or (in `behavior`) a callable passed from inside
 * one. In `shape`, a closure passed as an argument is named as its `via`.
 */
function closureOnly(edge: SnapshotEdge, behavior: boolean): boolean {
  return edge.closure === true && edge.resolution === "resolved" && (behavior ? edge.via !== "closure-arg" : edge.via === undefined);
}

function describeHole(edge: SnapshotEdge, target: string, input: FlowInput): string {
  if (edge.resolution === "ambiguous") return `ambiguous call \`${edge.text ?? edge.source}\` [${(edge.candidates ?? []).join(", ")}]`;
  if (edge.resolution === "resolved") {
    if (edge.via) {
      const by = input.staticSetBy === "config" ? "keylang.json check.static" : "--static";
      return `${describeVia(edge, false)} (not followed in static mode ${input.static}, set by ${by})`;
    }
    return `\`${edge.text ?? ""}\` may dispatch to another \`${lastSegment(edge.text ?? callName(target))}\``;
  }
  return edge.reason ?? `unresolved call \`${edge.text ?? ""}\``;
}

function at(edge: SnapshotEdge): string {
  return `${edge.file}:${edge.line}:${edge.col}`;
}

/**
 * Static reachability of `target` from `parent`.
 *
 * `ok`: a path over resolved calls outside closures (in `behavior` mode also
 * hook defaults and injected values) through bodies that surely run: not a fn
 * a decorator may replace, not a module that does not parse. Such a path
 * through a doubtful body is `unverified`. Otherwise the question is whether
 * code keylang cannot follow could still reach the target:
 * - a call with an unknown receiver (`x.feed()`, `cb()`) may run any fn of the
 *   same name, so the search goes on through every fn named like it; so does
 *   a resolved method call (an override may run instead), an ambiguous call
 *   (every candidate), a call in a closure (it runs only if that value is
 *   called), and a hook edge in `shape` mode. A path found this way is
 *   `unverified`, naming its first such call.
 * - a fn on some route to the target that escapes (read as a value, an
 *   accessor, an implicit method, called from a closure, from module-level
 *   code or by a base class keylang has not read) may be run by any code
 *   holding it; `eval`, `new Function`, a computed call in code a proven or
 *   possible route reaches, a computed member or a namespace that mentions
 *   such a fn, and a module keylang has not read are the same: `unverified`.
 * - otherwise the target is reachable only by name and no name matches:
 *   `fail`, a confirmed absence.
 */
function reachability(graph: CallGraph, input: FlowInput, parent: string | null, target: string): { verdict: Verdict["verdict"]; message: string } {
  if (parent === null) return { verdict: "unverified", message: "no trigger to reach it from" };
  const from = input.nodes[parent];
  if (!from) return { verdict: "unverified", message: `parent \`${parent}\` is not in the snapshot` };
  if (from.kind !== "fn") return { verdict: "unverified", message: `parent \`${parent}\` is a ${from.kind}, not a callable` };
  const to = input.nodes[target];
  // A step to a package is the import from the parent fn's module, not a call.
  // An import in some other module does not prove this step.
  if (to?.kind === "module" && to.layer === "external") return externalImport(input, parent, target);
  if (to && to.kind !== "fn") return { verdict: "unverified", message: `\`${target}\` is a ${to.kind}, not a callable` };
  const behavior = input.static === "behavior";
  // A call in a stored closure runs only when that function value is called: it is a possible route, not a proof.
  const proves = provesIn(behavior);

  // 1. A proof: breadth-first over the edges this mode follows, through bodies that surely run.
  const doubt = (id: string): string | undefined => graph.replaced.get(id) ?? graph.unreadable.get(id);
  const sure = graph.unreadable.has(parent) ? null : search(graph, parent, target, (step) => proves(step) && doubt(step.to) === undefined).route;
  if (sure) return { verdict: "ok", message: routeMessage(parent, target, sure) };
  // A body that may not run still may: its calls are reachable code for what follows.
  const { route, depth } = search(graph, parent, target, proves);
  if (route) {
    const blocked = graph.unreadable.get(parent) ?? routeSteps(parent, target, route).map((step) => doubt(step.to)).find((reason) => reason !== undefined);
    return { verdict: "unverified", message: `${routeMessage(parent, target, route)}, but ${blocked ?? "a body on the route may not run"}` };
  }

  // 2. A possible route through calls keylang cannot pin to one target.
  const { edge: uncertain, seen: possible } = possibleRoute(graph, input, parent, target, proves);
  const holes = [...depth.keys()].flatMap((id) => (graph.open.get(id) ?? []).map((edge) => ({ edge, depth: depth.get(id)! })));
  const more = (shown: SnapshotEdge): string => {
    const others = holes.filter((hole) => hole.edge !== shown).length;
    return others > 0 ? ` (and ${others} more unresolved call${others === 1 ? "" : "s"} in reachable code)` : "";
  };
  if (uncertain && closureOnly(uncertain, behavior)) {
    return { verdict: "unverified", message: `no resolved path from ${parent}; reached only through a closure of ${uncertain.source}: \`${uncertain.text ?? ""}\` at ${at(uncertain)} runs only when that function value is called${more(uncertain)}` };
  }
  if (uncertain) return { verdict: "unverified", message: `no resolved path from ${parent}; ${describeHole(uncertain, target, input)} at ${at(uncertain)} may reach it${more(uncertain)}` };

  // 3. Code that may run a fn without naming it.
  const routes = callersOf(graph, target);
  // `eval` and computed calls count in code reached by a possible route too, not only by a proof.
  const blocker = escapeOf(graph, input, routes, new Set([...depth.keys(), ...possible]));
  if (blocker) {
    // Only an unresolved call in code the escaping value is handed to can be the missing link.
    const near = blocker.from === null ? null : holeNear(graph, holes, blocker.from);
    const lead = near ? `no resolved path from ${parent}; ${describeHole(near, target, input)} at ${at(near)} may reach it${more(near)}` : `no call path from ${parent} in the static graph`;
    return { verdict: "unverified", message: `${lead}; ${blocker.reason}` };
  }
  const unseen = holes.length > 0 && graph.opaque ? graph.opaque : null;
  if (unseen) return { verdict: "unverified", message: `no call path from ${parent} in the static graph; \`${unseen}\` is opaque and may call it` };
  // Calls read from a file that does not parse may be missing: an absence there is not confirmed.
  const unread = [...depth.keys()].map((id) => graph.unreadable.get(id)).find((reason) => reason !== undefined);
  if (unread) return { verdict: "unverified", message: `no call path from ${parent} in the static graph; ${unread}` };
  return { verdict: "fail", message: `absence: no call path from ${parent}; \`${target}\` and its callers are called only by name, and no call from ${parent}'s reachable code can reach them; add a call to \`${target}\` in \`${parent}\` or in a function it reaches` };
}

/**
 * Static evidence for `calls`: whether `parent` calls `target` itself, without
 * order. `ok` is a resolved call in the parent's own body that this mode
 * follows. `fail` is a confirmed absence under the rules of a step's absence:
 * no call of the parent can be the target (no unresolved or ambiguous call by
 * its name, no override, no closure or hook call of it), the parent's body is
 * what keylang read, and nothing keylang cannot follow may call the target.
 * Anything else is `unverified`.
 */
function directCall(graph: CallGraph, input: FlowInput, parent: string | null, target: string): { verdict: Verdict["verdict"]; message: string } {
  if (parent === null) return { verdict: "unverified", message: "no trigger or step to call it from" };
  const from = input.nodes[parent];
  if (!from) return { verdict: "unverified", message: `parent \`${parent}\` is not in the snapshot` };
  if (from.kind !== "fn") return { verdict: "unverified", message: `parent \`${parent}\` is a ${from.kind}, not a callable` };
  const to = input.nodes[target];
  if (to?.kind === "module" && to.layer === "external") return externalImport(input, parent, target);
  if (to && to.kind !== "fn") return { verdict: "unverified", message: `\`${target}\` is a ${to.kind}, not a callable` };
  const behavior = input.static === "behavior";
  const proves = provesIn(behavior);
  const own = graph.resolved.get(parent) ?? [];
  const unread = graph.unreadable.get(parent);
  const direct = own.filter((step) => step.to === target);
  const sure = direct.find(proves);
  if (sure) {
    const message = routeMessage(parent, target, new Map([[target, sure]]));
    return unread ? { verdict: "unverified", message: `${message}, but ${unread}` } : { verdict: "ok", message };
  }
  const weak = direct[0];
  if (weak && closureOnly(weak.edge, behavior)) return { verdict: "unverified", message: `\`${weak.edge.text ?? ""}\` at ${at(weak.edge)} is in a closure of ${parent} and runs only when that function value is called` };
  if (weak) return { verdict: "unverified", message: `${describeHole(weak.edge, target, input)} at ${at(weak.edge)}` };
  const lead = `no resolved call from ${parent}`;
  if (unread) return { verdict: "unverified", message: `${lead}; ${unread}` };
  // A call keylang cannot pin to one target may be the target itself.
  for (const edge of graph.open.get(parent) ?? []) {
    const names = edge.resolution === "ambiguous" ? (edge.candidates ?? []).map(graph.callable) : namedLike(graph, lastSegment(edge.text ?? ""));
    if (names.includes(target)) return { verdict: "unverified", message: `${lead}; ${describeHole(edge, target, input)} at ${at(edge)} may be it` };
  }
  // An override has the name of the method the call resolved to; in PHP, in any ASCII case.
  const caseless = caselessNames(to?.file);
  const sameName = (id: string): boolean => callName(id) === callName(target) || (caseless && asciiLowerCase(callName(id)) === asciiLowerCase(callName(target)));
  const override = own.find((step) => step.edge.text?.includes(".") && !step.edge.via && step.to !== target && sameName(step.to));
  if (override) return { verdict: "unverified", message: `${lead}; ${describeHole(override.edge, target, input)} at ${at(override.edge)}` };
  const blocker = escapeOf(graph, input, new Set([target]), new Set([parent]));
  if (blocker) return { verdict: "unverified", message: `${lead}; ${blocker.reason}` };
  // A path through other calls is what `step` proves; say so, it is the likely intent.
  const { route } = search(graph, parent, target, proves);
  const via = route ? routeSteps(parent, target, route).slice(0, -1).map((step) => step.to) : [];
  const hint = via.length > 0 ? ` (it reaches it via ${via.join(" → ")}; \`step\` proves a path)` : "";
  return { verdict: "fail", message: `absence: \`${parent}\` does not call \`${target}\`${hint}; add a direct call in \`${parent}\`` };
}

/**
 * Breadth-first from `parent` over the steps `follow` accepts: the route to
 * `target` (null when there is none) and the depth of every fn reached. The
 * search stops at the target, so `depth` is complete only without a route.
 */
function search(graph: CallGraph, parent: string, target: string, follow: (step: Step) => boolean): { route: Map<string, Step> | null; depth: Map<string, number> } {
  const previous = new Map<string, Step>();
  const depth = new Map<string, number>([[parent, 0]]);
  const queue = [parent];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const step of graph.resolved.get(id) ?? []) {
      if (!follow(step)) continue;
      // A step that is its own parent is reached by recursion.
      if (step.to === target) {
        previous.set(target, step);
        return { route: previous, depth };
      }
      if (depth.has(step.to)) continue;
      depth.set(step.to, depth.get(id)! + 1);
      previous.set(step.to, step);
      queue.push(step.to);
    }
  }
  return { route: null, depth };
}

/** The steps of a route from `parent` to `target`, in call order. */
function routeSteps(parent: string, target: string, previous: Map<string, Step>): Step[] {
  const steps: Step[] = [];
  // do-while: a recursive step (target = parent) still has its route.
  let id = target;
  do {
    const step = previous.get(id)!;
    steps.unshift(step);
    id = step.from;
  } while (id !== parent);
  return steps;
}

/** The file module of a fn: the nearest module that is not a class. */
function fileModule(nodes: FlowInput["nodes"], id: string): string | null {
  let cur = id;
  for (;;) {
    const dot = cur.lastIndexOf(".");
    if (dot === -1) return null;
    cur = cur.slice(0, dot);
    const node = nodes[cur];
    if (node?.kind === "module" && node.class !== true) return cur;
  }
}

/**
 * Static proof for `external.<pkg>`: a resolved import from the parent fn's own module that
 * loads the package. A type-only one (`import type`, `export type … from`) is erased from the
 * code that runs, so it proves nothing.
 */
function externalImport(input: FlowInput, parent: string, target: string): { verdict: Verdict["verdict"]; message: string } {
  const moduleId = fileModule(input.nodes, parent);
  if (moduleId === null) return { verdict: "unverified", message: `no module of \`${parent}\` imports \`${target}\`` };
  const imports = input.edges.filter(
    (item) => (item.kind === "import" || item.kind === "reexport") && item.resolution === "resolved" && item.source === moduleId && item.target === target,
  );
  if (imports.some((edge) => !edge.typeOnly)) return { verdict: "ok", message: `imported by \`${moduleId}\`` };
  const erased = imports[0] ? `; the type-only import at ${at(imports[0])} is erased from the code that runs` : "";
  return { verdict: "unverified", message: `no import of \`${target}\` from \`${moduleId}\`${erased}` };
}

/** An edge that rests on a docblock: where PHP's `@var` or `@param` types the receiver. */
function describeDocblock(edge: SnapshotEdge): string {
  return `typed by a docblock at ${edge.docblock ?? at(edge)}`;
}

/**
 * The route as the verdict prints it, with a note on every step that is not a
 * plain call of the code: a hook (its default, or the value injected at a site)
 * or a call whose receiver only a docblock types.
 */
function routeMessage(parent: string, target: string, previous: Map<string, Step>): string {
  const steps = routeSteps(parent, target, previous);
  const label = (step: Step, note: string): string => (steps.length === 1 ? note : `${step.from} → ${step.to}: ${note}`);
  const hooks = steps.filter((step) => step.edge.via).map((step) => label(step, describeVia(step.edge)));
  const docblocks = steps.filter((step) => step.edge.provenance === "docblock").map((step) => label(step, describeDocblock(step.edge)));
  if (steps.length === 1) return `called from ${parent}${hooks.length > 0 ? ` through ${hooks[0]}` : ""}${docblocks.length > 0 ? `, ${docblocks[0]}` : ""}`;
  const notes = [...hooks, ...docblocks];
  const through = notes.length > 0 ? ` (${notes.join("; ")})` : "";
  return `reachable from ${parent} via ${steps.slice(0, -1).map((step) => step.to).join(" → ")}${through}`;
}

/**
 * Breadth-first search that also follows calls with more than one possible
 * target and calls in closures. Returns the first such call on the shortest
 * route (null when there is none) and every fn the search reached.
 */
function possibleRoute(graph: CallGraph, input: FlowInput, parent: string, target: string, proves: (step: Step) => boolean): { edge: SnapshotEdge | null; seen: Set<string> } {
  const first = new Map<string, SnapshotEdge | null>([[parent, null]]);
  const queue = [parent];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const lead = first.get(id) ?? null;
    const next: { to: string; edge: SnapshotEdge | null }[] = [];
    for (const step of graph.resolved.get(id) ?? []) {
      next.push({ to: step.to, edge: proves(step) ? null : step.edge });
      // A method call may run an override of the same name.
      if (step.edge.text?.includes(".") && !step.edge.via) for (const other of namedLike(graph, callName(step.to))) if (other !== step.to) next.push({ to: other, edge: step.edge });
    }
    for (const edge of graph.open.get(id) ?? []) {
      const names = edge.resolution === "ambiguous" ? (edge.candidates ?? []) : namedLike(graph, lastSegment(edge.text ?? ""));
      for (const other of names) next.push({ to: input.nodes[other]?.kind === "fn" ? other : graph.callable(other), edge });
    }
    for (const item of next) {
      if (first.has(item.to)) continue;
      const via = lead ?? item.edge;
      if (item.to === target) return { edge: via, seen: new Set(first.keys()) };
      first.set(item.to, via);
      queue.push(item.to);
    }
  }
  return { edge: null, seen: new Set(first.keys()) };
}

/** Every fn with a resolved or candidate route to `target`, the target included. */
function callersOf(graph: CallGraph, target: string): Set<string> {
  const seen = new Set([target]);
  const stack = [target];
  while (stack.length > 0) {
    for (const step of graph.callers.get(stack.pop()!) ?? []) {
      if (seen.has(step.from)) continue;
      seen.add(step.from);
      stack.push(step.from);
    }
  }
  return seen;
}

/**
 * Why code keylang cannot follow may still run a fn of `routes`, and the fn
 * whose code hands that fn on (null when it is not in a fn: module level, an
 * unsupported construct); null when every route is by name.
 */
function escapeOf(graph: CallGraph, input: FlowInput, routes: Set<string>, reachable: ReadonlySet<string>): { reason: string; from: string | null } | null {
  for (const id of [...routes].sort()) {
    const escapes = input.nodes[id]?.escapes;
    if (escapes) return { reason: `${escapes.reason} at ${escapes.file}:${escapes.line}:${escapes.col}, so code keylang cannot follow may call \`${id}\``, from: fnAt(input, escapes.file, escapes.line) };
  }
  for (const id of [...routes].sort()) {
    const closure = (graph.callers.get(id) ?? []).find((step) => step.edge.closure);
    if (closure) return { reason: `\`${id}\` is called from a closure in \`${closure.from}\` at ${at(closure.edge)}, which code keylang cannot follow may run`, from: closure.from };
  }
  // PHP names a fn in any ASCII case: `call_user_func('HELPER')` mentions `helper`.
  const patterns = new Map<string, RegExp>();
  for (const id of routes) {
    const name = callName(id).replace(/^#/, "");
    const caseless = caselessNames(input.nodes[id]?.file);
    const key = `${caseless ? "i" : ""}:${name}`;
    if (!patterns.has(key)) patterns.set(key, identifierPattern(name, caseless));
  }
  const names = [...patterns.values()];
  for (const [file, items] of [...graph.unsupported].sort(([a], [b]) => compareText(a, b))) {
    for (const item of items) {
      // `eval`, `new Function`, `obj[key]()`, `import(expr)` in reachable code may call anything.
      const inReachable = [...reachable].some((id) => {
        const node = input.nodes[id];
        return node?.file === file && node.line !== null && item.line >= node.line && item.line <= (node.endLine ?? node.line);
      });
      const text = item.text;
      const mentions = text !== undefined && names.some((name) => name.test(text));
      if (inReachable || mentions) return { reason: `${item.reason} at ${file}:${item.line}:${item.col} may call it`, from: null };
    }
  }
  const config = graph.unreadConfig;
  if (config) return { reason: `${config.reason}, and the framework may call \`${[...routes].sort()[0] ?? ""}\` by it`, from: null };
  return null;
}

/**
 * `name` as a whole identifier: `$save` and `зберегти` too, which `\b` does not delimit;
 * `caseless`: in any ASCII case, as PHP compares names (`HELPER` is `helper`, `ÄNDERN` is no `ändern`),
 * which the flag `i` would not keep apart.
 */
function identifierPattern(name: string, caseless = false): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = caseless ? escaped.replace(/[A-Za-z]/g, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`) : escaped;
  return new RegExp(`(?<![\\p{ID_Continue}$\\u200c\\u200d])${body}(?![\\p{ID_Continue}$\\u200c\\u200d])`, "u");
}

/** The innermost fn whose declaration holds `file:line`. */
function fnAt(input: FlowInput, file: string, line: number): string | null {
  let best: { id: string; line: number } | null = null;
  for (const [id, node] of Object.entries(input.nodes)) {
    if (node.kind !== "fn" || node.file !== file || node.line === null || line < node.line || line > (node.endLine ?? node.line)) continue;
    if (best === null || node.line > best.line) best = { id, line: node.line };
  }
  return best?.id ?? null;
}

/**
 * The unresolved call in reachable code nearest `from` among the fns `from`
 * calls, itself included: where a value handed on by `from` may be called.
 * Null when no hole is downstream of it.
 */
function holeNear(graph: CallGraph, holes: { edge: SnapshotEdge }[], from: string): SnapshotEdge | null {
  const distance = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const step of graph.resolved.get(id) ?? []) {
      if (distance.has(step.to)) continue;
      distance.set(step.to, distance.get(id)! + 1);
      queue.push(step.to);
    }
  }
  const near = holes.filter((hole) => distance.has(hole.edge.source));
  near.sort((a, b) => distance.get(a.edge.source)! - distance.get(b.edge.source)! || compareText(a.edge.file ?? "", b.edge.file ?? "") || a.edge.line - b.edge.line || a.edge.col - b.edge.col);
  return near[0]?.edge ?? null;
}

function moduleMembers(nodes: FlowInput["nodes"], id: string): "complete" | "opaque" | null {
  let cur = id;
  for (;;) {
    const dot = cur.lastIndexOf(".");
    if (dot === -1) return null;
    cur = cur.slice(0, dot);
    const node = nodes[cur];
    if (node?.kind === "module" && (node.members === "complete" || node.members === "opaque")) return node.members;
  }
}

/**
 * `planned` declarations. A duplicate is K002. When the code has the symbol,
 * a different kind or signature is K201, a match is the K202 hint to remove
 * the declaration, and the step is checked as implemented.
 */
function collectPlanned(spec: SpecIR, input: FlowInput, diagnostics: Diagnostic[]): Map<string, Planned> {
  const planned = new Map<string, Planned>();
  for (const item of spec.planned) {
    // A duplicate is K002 of resolution (`resolve.ts`), with or without a snapshot.
    if (planned.has(item.id)) continue;
    const kind = item.decl;
    const signature = item.signature;
    const code = input.nodes[item.id];
    const entry: Planned = { kind, signature, file: item.file, span: item.span, implemented: false };
    planned.set(item.id, entry);
    if (!code) continue;
    entry.implemented = true;
    const where = codeLocation(item.id, code, input.edges);
    const mismatch = plannedMismatch(item, code);
    if (mismatch === "kind") {
      diagnostics.push(diagnostic("K201", item.file, item.span, `planned ${kind} \`${item.id}\` is implemented as a ${code.kind} (${where})`));
    } else if (mismatch === "signature") {
      diagnostics.push(diagnostic("K201", item.file, item.span, `planned ${kind} \`${item.id}\` has signature \`${signature}\`, the code has \`${code.signature}\` (${where})`));
    } else {
      diagnostics.push(diagnostic("K202", item.file, item.span, `planned ${kind} \`${item.id}\` is implemented (${where}); remove the declaration`));
    }
  }
  return planned;
}

/**
 * Where the code of a planned id is: its file and line, or for a node without
 * a file (a package) its first importer. Neither: `in the code`.
 */
function codeLocation(id: string, code: SnapshotNodeView, edges: readonly SnapshotEdge[]): string {
  if (code.file) return `${code.file}:${code.line ?? 1}`;
  let first: SnapshotEdge | null = null;
  for (const edge of edges) {
    if (edge.target !== id || edge.file === null || (edge.kind !== "import" && edge.kind !== "reexport")) continue;
    if (first === null || compareText(edge.file, first.file!) < 0 || (edge.file === first.file && edge.line < first.line)) first = edge;
  }
  return first === null ? "in the code" : `imported by ${first.file}:${first.line}`;
}

/** How the code differs from a `planned` declaration of the same id: K201 for a kind or a signature, null (K202) when it matches. */
export function plannedMismatch(item: { decl: string; signature: string | null }, code: { kind: string; signature?: string | null; file?: string | null }): "kind" | "signature" | null {
  if (code.kind !== item.decl) return "kind";
  if (item.signature !== null && code.signature && !sameSignature(item.signature, code.signature, code.file ?? null)) return "signature";
  return null;
}

/**
 * Signatures match without spaces, `->` as `→`. A Python method shows its
 * receiver (`(self, to: str)`), a plan may name only what the caller passes
 * (`(to: str)`): both match. A plan that is only a parameter list, with no
 * return part, claims only the parameters: `(order: Order)` matches the code
 * `(order: Order) → Refund`. A plan with a return part must match in full.
 */
function sameSignature(planned: string, code: string, file: string | null): boolean {
  const plan = normalizeSignature(planned);
  const written = normalizeSignature(code);
  const receiverless = (text: string): string => (file !== null && file.endsWith(".py") ? text.replace(/^\((?:self|cls)(?:,|(?=\)))/, "(") : text);
  if (plan === written || plan === receiverless(written)) return true;
  if (parameterList(plan) !== plan) return false;
  const params = parameterList(written);
  return params !== null && (plan === params || plan === receiverless(params));
}

/** The leading `(…)` of a normalized signature, up to the parenthesis that closes the first; null when there is none. */
function parameterList(signature: string): string | null {
  if (!signature.startsWith("(")) return null;
  let depth = 0;
  for (let i = 0; i < signature.length; i++) {
    if (signature[i] === "(") depth++;
    else if (signature[i] === ")" && --depth === 0) return signature.slice(0, i + 1);
  }
  return null;
}

function normalizeSignature(text: string): string {
  return text.replace(/->/g, "→").replace(/\s+/g, "").replace(/;$/, "");
}

function specHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
