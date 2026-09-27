// Evidence for flows: ID, static, tests, and trace are separate verdicts.
// A step is checked from its parent (the trigger for a top-level step), never
// from its siblings. Reports and traces are loaded by the caller; this module
// only compares them with the specs and the snapshot.

import { createHash } from "node:crypto";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import { renderTokens } from "./parser.ts";
import type { Index } from "./resolve.ts";
import type { Span } from "./span.ts";
import { matchTest, type TestCase } from "./test-report.ts";
import { traceFlow, type ShapeNode, type TraceEvidence, type TraceRun } from "./trace-evidence.ts";
import type { Verdict } from "./verdict.ts";

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
}

export interface FlowInput {
  snapshotId: string | null;
  nodes: Record<string, { kind: string; members?: string; signature?: string | null; file: string | null; line: number | null }>;
  edges: SnapshotEdge[];
  /** Test cases from `check.tests`; null when it is not configured. */
  tests: TestCase[] | null;
  /** Trace runs from `check.trace`; null when it is not configured. */
  traces: TraceRun[] | null;
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

export function evaluateFlows(docs: readonly Document[], index: Index, input: FlowInput): { diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  const planned = collectPlanned(docs, input, diagnostics);
  const graph = callGraph(input.edges);
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

  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "flow" || !section.name) continue;
      const flow = section.name.value;
      const top = sectionNodes(section);
      const triggerNode = top.find((node) => node.kind === "trigger");
      const trigger = triggerNode ? refOf(triggerNode) : null;
      let key = 0;
      const keys = new Map<Node, number>();
      const shape = (nodes: readonly Node[]): ShapeNode[] =>
        nodes.flatMap((node): ShapeNode[] => {
          if (node.kind === "when") {
            keys.set(node, key);
            return [{ kind: "when", key: key++, children: shape(node.children) }];
          }
          const id = node.kind === "step" ? refOf(node) : null;
          if (!id) return [];
          // A planned step is not expected in a trace; its children cannot be matched under it.
          if (planned.get(id)?.implemented === false) return [];
          keys.set(node, key);
          return [{ kind: "step", key: key++, id, children: shape(node.children) }];
        });
      // Steps may sit under the trigger or beside it; either way the trigger is their parent.
      const tree = shape([...(triggerNode?.children ?? []), ...top.filter((node) => node.kind !== "trigger")]);
      const triggerKey = triggerNode && trigger ? key++ : null;
      if (triggerNode && triggerKey !== null) keys.set(triggerNode, triggerKey);
      const traced: Map<number, TraceEvidence> | null =
        input.traces === null ? null : traceFlow(input.traces, flow, trigger && triggerKey !== null ? { key: triggerKey, id: trigger } : null, tree, input.snapshotId);

      const visit = (node: Node, parent: string | null, claim: Node | null): void => {
        spec = `${flow}\0${node.kind} ${renderTokens(node.tokens)}`;
        const nodeKey = keys.get(node);
        const traceOf = (): TraceEvidence | undefined => (nodeKey === undefined ? undefined : traced?.get(nodeKey));
        if (node.kind === "step" || node.kind === "trigger") {
          const id = refOf(node);
          if (id) {
            const plan = planned.get(id);
            const pending = plan !== undefined && !plan.implemented;
            const known = idVerdict(id, pending ? plan : undefined, node, doc.path, index, input, verdict);
            // A dangling id is K001 already; a static line would count it twice.
            if (node.kind === "step" && known !== "fail") {
              if (pending) verdict("static", id, "unverified", doc.path, node.span, `planned ${plan.kind}, not implemented`);
              else if (input.nodes[id] !== undefined) {
                const reach = reachability(graph, input, parent, id);
                verdict("static", id, reach.verdict, doc.path, node.span, reach.message, { provenance: "syntactic" });
              } else verdict("static", id, "unverified", doc.path, node.span, "not in the snapshot (opaque module)");
            }
            if (traced !== null) {
              if (pending) verdict("trace", id, "unverified", doc.path, node.span, `planned ${plan.kind}`);
              else {
                const evidence = traceOf();
                if (evidence) verdict("trace", id, evidence.verdict, doc.path, node.span, evidence.message, traceProvenance(evidence));
              }
            }
          }
          const next = node.kind === "step" || node.kind === "trigger" ? (id ?? parent) : parent;
          for (const child of node.children) visit(child, next, claim);
          return;
        }
        if (node.kind === "when") {
          const evidence = traceOf();
          if (evidence) verdict("trace", `when ${node.text?.value ?? ""}`, evidence.verdict, doc.path, node.span, evidence.message, traceProvenance(evidence));
        }
        if (node.kind === "invariant" || node.kind === "when" || node.kind === "then" || node.kind === "reads" || node.kind === "emits") {
          const area = claimArea(node);
          const proofs = node.children.filter((child) => child.kind === "test");
          if (proofs.length === 0 && node.kind !== "when") {
            verdict("tests", area, "unverified", doc.path, node.span, quantitative(node.text?.value ?? "") ? "needs a separate predicate or test (quantitative or negative property)" : "no test evidence");
          }
          for (const child of node.children) visit(child, parent, node);
          return;
        }
        if (node.kind === "test") {
          const name = node.label?.value ?? "";
          const file = node.text?.value ?? "";
          const matched = matchTest(input.tests, file, name, input.snapshotId);
          const area = claim ? claimArea(claim) : `test ${file} "${name}"`;
          verdict("tests", area, matched.verdict, doc.path, node.span, `${matched.message} (${file} "${name}")`, { provenance: "test-report", ...(matched.runId ? { runId: matched.runId } : {}) });
          return;
        }
        for (const child of node.children) visit(child, parent, claim);
      };
      for (const node of top) visit(node, trigger, null);
    }
  }
  return { diagnostics, verdicts };
}

function refOf(node: Node): string | null {
  return node.refs[0]?.target ?? node.id ?? null;
}

function claimArea(node: Node): string {
  const text = node.text?.value ?? node.refs[0]?.target ?? "";
  return `${node.kind} ${text}`.trim();
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
  node: Node,
  file: string,
  index: Index,
  input: FlowInput,
  verdict: (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string) => void,
): Verdict["verdict"] {
  const say = (value: Verdict["verdict"], message: string): Verdict["verdict"] => {
    verdict("ID", id, value, file, node.span, message);
    return value;
  };
  if (plan) return say("unverified", `planned ${plan.kind}`);
  if (input.nodes[id] !== undefined || index.lookup(id).kind === "exact") return say("ok", "exact");
  if (moduleMembers(input.nodes, id) === "opaque") return say("unverified", "opaque module");
  return say("fail", "K001 dangling reference");
}

interface CallGraph {
  resolved: Map<string, string[]>;
  /** Unresolved and ambiguous call edges by source function. */
  open: Map<string, SnapshotEdge[]>;
}

function callGraph(edges: readonly SnapshotEdge[]): CallGraph {
  const resolved = new Map<string, string[]>();
  const open = new Map<string, SnapshotEdge[]>();
  for (const edge of edges) {
    if (edge.kind !== "call") continue;
    if (edge.resolution === "resolved" && edge.target) {
      const list = resolved.get(edge.source) ?? [];
      list.push(edge.target);
      resolved.set(edge.source, list);
    } else {
      const list = open.get(edge.source) ?? [];
      list.push(edge);
      open.set(edge.source, list);
    }
  }
  return { resolved, open };
}

/**
 * Possible reachability of `target` from `parent` over resolved calls. A route
 * through an unresolved call, an ambiguous call, or an opaque module is
 * unverified with that construct as the reason; so is plain absence of a path.
 */
function reachability(graph: CallGraph, input: FlowInput, parent: string | null, target: string): { verdict: Verdict["verdict"]; message: string } {
  if (parent === null) return { verdict: "unverified", message: "no trigger to reach it from" };
  const from = input.nodes[parent];
  if (!from) return { verdict: "unverified", message: `parent \`${parent}\` is not in the snapshot` };
  if (from.kind !== "fn") return { verdict: "unverified", message: `parent \`${parent}\` is a ${from.kind}, not a callable` };
  const to = input.nodes[target];
  if (to && to.kind !== "fn") return { verdict: "unverified", message: `\`${target}\` is a ${to.kind}, not a callable` };
  const previous = new Map<string, string>();
  const seen = new Set<string>([parent]);
  const queue = [parent];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of graph.resolved.get(id) ?? []) {
      if (next === target) {
        previous.set(next, id);
        const route = [next];
        for (let at = id; at !== parent; at = previous.get(at)!) route.unshift(at);
        route.unshift(parent);
        return { verdict: "ok", message: route.length === 2 ? `called from ${parent}` : `reachable from ${parent} via ${route.slice(1, -1).join(" → ")}` };
      }
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, id);
      queue.push(next);
    }
  }
  const holes = [...seen]
    .sort()
    .flatMap((id) => graph.open.get(id) ?? [])
    .sort((a, b) => ((a.file ?? "") < (b.file ?? "") ? -1 : (a.file ?? "") > (b.file ?? "") ? 1 : a.line - b.line || a.col - b.col));
  const hole = holes.find((edge) => edge.resolution === "ambiguous" && edge.candidates?.includes(target)) ?? holes[0];
  if (hole) {
    const what = hole.resolution === "ambiguous" ? `ambiguous call \`${hole.text ?? hole.source}\` [${(hole.candidates ?? []).join(", ")}]` : (hole.reason ?? `unresolved call \`${hole.text ?? ""}\``);
    return { verdict: "unverified", message: `no resolved path from ${parent}; ${what} at ${hole.file}:${hole.line}:${hole.col} may reach it` };
  }
  return { verdict: "unverified", message: `no call path from ${parent} in the static graph` };
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
function collectPlanned(docs: readonly Document[], input: FlowInput, diagnostics: Diagnostic[]): Map<string, Planned> {
  const planned = new Map<string, Planned>();
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind !== "planned" || !node.id) return;
          const span = node.name?.span ?? node.span;
          const first = planned.get(node.id);
          if (first) {
            diagnostics.push(diagnostic("K002", doc.path, node.span, `duplicate planned \`${node.id}\` (first declared at ${first.file}:${first.span.start.line}:${first.span.start.col})`));
            return;
          }
          const kind = node.label?.value ?? "fn";
          const signature = node.text?.value ?? null;
          const code = input.nodes[node.id];
          const entry: Planned = { kind, signature, file: doc.path, span, implemented: false };
          planned.set(node.id, entry);
          if (!code) return;
          entry.implemented = true;
          if (kind !== "event" && code.kind !== kind) {
            diagnostics.push(diagnostic("K201", doc.path, node.span, `planned ${kind} \`${node.id}\` is implemented as a ${code.kind} (${code.file ?? "?"}:${code.line ?? 1})`));
          } else if (signature !== null && code.signature && normalizeSignature(signature) !== normalizeSignature(code.signature)) {
            diagnostics.push(diagnostic("K201", doc.path, node.span, `planned ${kind} \`${node.id}\` has signature \`${signature}\`, the code has \`${code.signature}\` (${code.file ?? "?"}:${code.line ?? 1})`));
          } else {
            diagnostics.push(diagnostic("K202", doc.path, node.span, `planned ${kind} \`${node.id}\` is implemented (${code.file ?? "?"}:${code.line ?? 1}); remove the declaration`));
          }
        });
      }
    }
  }
  return planned;
}

function normalizeSignature(text: string): string {
  return text.replace(/->/g, "→").replace(/\s+/g, "").replace(/;$/, "");
}

function specHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
