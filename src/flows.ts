// Static, test, and trace verdicts for one flow. Sibling steps are checked
// from their parent, never from each other.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import type { Index } from "./resolve.ts";
import type { Verdict } from "./verdict.ts";

interface CallEdge {
  source: string;
  target: string | null;
  resolution: string;
  file: string | null;
  line: number;
  col: number;
  reason?: string;
}

export interface FlowInput {
  root: string;
  snapshotId: string | null;
  nodes: Record<string, { kind: string; members?: string; signature?: string | null; file: string | null; line: number | null }>;
  edges: CallEdge[];
  testsPath?: string;
  tracePath?: string;
}

interface ReportCase {
  file: string;
  name: string;
  suite?: string;
  status: "pass" | "fail";
  snapshotId?: string;
}

export function evaluateFlows(docs: readonly Document[], index: Index, input: FlowInput): { diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  const calls = new Map<string, string[]>();
  for (const edge of input.edges) {
    if (edge.resolution !== "resolved" || !edge.target) continue;
    const list = calls.get(edge.source) ?? [];
    list.push(edge.target);
    calls.set(edge.source, list);
  }
  const planned = new Map<string, { kind: string; signature: string | null; file: string; line: number; col: number }>();
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const node of sectionNodes(section)) {
        walk(node, (item) => {
          if (item.kind === "planned" && item.id) {
            planned.set(item.id, { kind: item.label?.value ?? "fn", signature: item.text?.value ?? null, file: doc.path, line: item.span.start.line, col: item.span.start.col });
          }
        });
      }
    }
  }
  const tests = loadTests(input);
  const trace = loadTrace(input);
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "flow" || !section.name) continue;
      const flow = section.name.value;
      for (const top of sectionNodes(section)) noteNode(top, null, flow, doc.path, index, input, calls, planned, tests, trace, diagnostics, verdicts);
    }
  }
  return { diagnostics, verdicts };
}

function noteNode(
  node: Node,
  parent: string | null,
  flow: string,
  file: string,
  index: Index,
  input: FlowInput,
  calls: Map<string, string[]>,
  planned: Map<string, { kind: string; signature: string | null }>,
  tests: ReportCase[] | "missing" | "stale" | null,
  trace: TraceFile | null,
  diagnostics: Diagnostic[],
  verdicts: Verdict[],
): void {
  if (node.kind === "step" || node.kind === "trigger") {
    const id = node.refs[0]?.target ?? node.id;
    if (id) {
      const line = node.span.start.line;
      const col = node.span.start.col;
      const lookup = index.lookup(id);
      const plan = planned.get(id);
      const members = moduleMembers(input.nodes, id);
      if (plan) {
        verdicts.push(lineVerdict(input, "ID", id, "unverified", file, line, col, `planned ${plan.kind}`));
      } else if (lookup.kind === "exact") {
        verdicts.push(lineVerdict(input, "ID", id, "ok", file, line, col, lookup.kind));
      } else if (members === "opaque") {
        verdicts.push(lineVerdict(input, "ID", id, "unverified", file, line, col, `opaque module`));
      } else {
        verdicts.push(lineVerdict(input, "ID", id, "fail", file, line, col, "K001 dangling reference"));
      }
      if (node.kind === "step" && parent) {
        if (plan) verdicts.push(lineVerdict(input, "static", id, "unverified", file, line, col, "planned"));
        else if (reaches(calls, parent, id)) verdicts.push(lineVerdict(input, "static", id, "ok", file, line, col, `reachable from ${parent}`));
        else if (unresolvedNear(input, parent)) verdicts.push(lineVerdict(input, "static", id, "unverified", file, line, col, "unresolved call on the way"));
        else verdicts.push(lineVerdict(input, "static", id, "fail", file, line, col, `no path from ${parent}`));
      }
      const traced = traceStep(trace, input.snapshotId, flow, id);
      verdicts.push(lineVerdict(input, "trace", id, traced.verdict, file, line, col, traced.message));
      if (traced.diagnostic) diagnostics.push(diagnostic("K001", file, node.span, traced.message));
    }
  }
  if (node.kind === "invariant" || node.kind === "when" || node.kind === "then" || node.kind === "reads" || node.kind === "emits") {
    const proof = node.children.find((child) => child.kind === "test");
    if (!proof && node.kind !== "when") {
      verdicts.push(lineVerdict(input, "tests", node.kind, "unverified", file, node.span.start.line, node.span.start.col, "no evidence"));
    }
    if (node.kind === "when") {
      const exercised = trace?.events.some((event) => event.flow === flow && event.symbolId === node.text?.value) ?? false;
      verdicts.push(lineVerdict(input, "trace", node.text?.value ?? "when", exercised ? "ok" : "unverified", file, node.span.start.line, node.span.start.col, exercised ? "branch exercised" : "branch not exercised"));
    }
  }
  if (node.kind === "test") {
    const name = node.label?.value ?? "";
    const specFile = node.text?.value ?? "";
    const matched = matchTest(tests, specFile, name, input.snapshotId);
    verdicts.push(lineVerdict(input, "tests", name || specFile, matched.verdict, file, node.span.start.line, node.span.start.col, matched.message));
    if (matched.verdict === "fail") diagnostics.push(diagnostic("K001", file, node.span, matched.message));
  }
  const nextParent = node.kind === "step" || node.kind === "trigger" ? (node.refs[0]?.target ?? parent) : parent;
  for (const child of node.children) noteNode(child, nextParent, flow, file, index, input, calls, planned, tests, trace, diagnostics, verdicts);
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

function reaches(calls: Map<string, string[]>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    for (const next of calls.get(id) ?? []) {
      if (next === to) return true;
      stack.push(next);
    }
  }
  return false;
}

function unresolvedNear(input: FlowInput, parent: string): boolean {
  return input.edges.some((edge) => edge.resolution !== "resolved" && (edge.source === parent || edge.source.startsWith(`${parent}.`)));
}

function lineVerdict(input: FlowInput, criterion: "ID" | "static" | "tests" | "trace", area: string, verdict: Verdict["verdict"], file: string, line: number, col: number, message: string): Verdict {
  return { verdict, criterion, area, snapshotId: input.snapshotId, specHash: "", file, line, col, code: criterion, message: `${verdict} ${area}: ${message}` };
}

function matchTest(tests: ReportCase[] | "missing" | "stale" | null, file: string, name: string, snapshotId: string | null): { verdict: Verdict["verdict"]; message: string } {
  if (tests === null) return { verdict: "unverified", message: "tests unverified no report" };
  if (tests === "missing") return { verdict: "unverified", message: "tests unverified no report" };
  if (tests === "stale") return { verdict: "unverified", message: "tests unverified stale report" };
  const hits = tests.filter((item) => item.file === file && item.name === name);
  if (hits.length === 0) return { verdict: "unverified", message: "tests unverified no report" };
  if (hits.length > 1) return { verdict: "unverified", message: `tests unverified ambiguous ${hits.map((hit) => hit.suite ?? hit.file).join(", ")}` };
  const hit = hits[0];
  if (!hit) return { verdict: "unverified", message: "tests unverified no report" };
  if (hit.snapshotId && snapshotId && hit.snapshotId !== snapshotId) return { verdict: "unverified", message: "tests unverified stale report" };
  if (hit.status === "fail") return { verdict: "fail", message: "tests fail" };
  return { verdict: "ok", message: "tests ok" };
}

function loadTests(input: FlowInput): ReportCase[] | "missing" | "stale" | null {
  if (!input.testsPath) return null;
  const path = join(input.root, input.testsPath);
  if (!existsSync(path)) return "missing";
  const body = JSON.parse(readFileSync(path, "utf8")) as { snapshotId?: string; tests?: ReportCase[] };
  if (body.snapshotId && input.snapshotId && body.snapshotId !== input.snapshotId) return "stale";
  return body.tests ?? [];
}

interface TraceEvent {
  snapshotId?: string;
  flow?: string;
  symbolId?: string;
  event?: string;
  spanId?: string;
  parentSpanId?: string;
  seq?: number;
  ts?: number;
  clockId?: string;
  links?: string[];
  dropped?: number;
  complete?: boolean;
}

interface TraceFile {
  events: TraceEvent[];
  complete: boolean;
  dropped: number;
  stale: boolean;
}

function loadTrace(input: FlowInput): TraceFile | null {
  if (!input.tracePath) return null;
  const path = join(input.root, input.tracePath);
  if (!existsSync(path)) return { events: [], complete: false, dropped: 0, stale: false };
  const events = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as TraceEvent);
  const meta = events.find((event) => event.event === "meta");
  const stale = events.some((event) => event.snapshotId && input.snapshotId && event.snapshotId !== input.snapshotId);
  return { events, complete: meta?.complete === true, dropped: meta?.dropped ?? 0, stale };
}

function traceStep(trace: TraceFile | null, snapshotId: string | null, flow: string, id: string): { verdict: Verdict["verdict"]; message: string; diagnostic: boolean } {
  if (!trace) return { verdict: "unverified", message: "trace unverified no trace", diagnostic: false };
  if (trace.stale || trace.events.some((event) => event.snapshotId && snapshotId && event.snapshotId !== snapshotId)) {
    return { verdict: "unverified", message: "trace unverified stale trace", diagnostic: false };
  }
  const starts = trace.events.filter((event) => event.event === "start" && event.flow === flow && event.symbolId === id);
  if (starts.length === 0) {
    if (!trace.complete || trace.dropped > 0) return { verdict: "unverified", message: "trace unverified incomplete trace", diagnostic: false };
    return { verdict: "fail", message: "trace fail missing step", diagnostic: false };
  }
  return { verdict: "ok", message: "trace ok", diagnostic: false };
}

export function traceOrderProblem(events: TraceEvent[]): string | null {
  const starts = events.filter((event) => event.event === "start" && event.ts !== undefined);
  for (let i = 0; i < starts.length; i++) {
    for (let j = i + 1; j < starts.length; j++) {
      const a = starts[i];
      const b = starts[j];
      if (!a || !b) continue;
      if (a.ts === b.ts && a.clockId && b.clockId && a.clockId !== b.clockId && !(a.links ?? []).length && !(b.links ?? []).length) {
        return "order unverified";
      }
    }
  }
  return null;
}
