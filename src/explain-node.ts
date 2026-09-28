// `keylang explain <id>` without a model: what the snapshot and the specs
// say about one node. Deterministic and offline; the LLM explanation (§5.4)
// builds on it and falls back to it.

import type { Analysis } from "./analyze.ts";
import { sectionNodes, walk } from "./ir.ts";
import { flowsUsing, plannedDecl } from "./lsp-features.ts";

export interface NodeSummary {
  id: string;
  /** `fn`, `type`, `module`, `class`, `layer`, `planned fn`, … */
  kind: string;
  signature: string | null;
  /** `file:line`, null for a layer or an external package. */
  at: string | null;
  exported: boolean | null;
  calls: string[];
  callers: string[];
  deps: string[];
  dependents: string[];
  flows: string[];
  /** `file:line: rule text` of rules that name the node or a scope around it. */
  rules: string[];
  /** Constructs inside the node keylang did not turn into edges, counted by kind. */
  holes: Record<string, number>;
  fingerprint: { own: string; closure: string; complete: boolean } | null;
  planned: boolean;
}

export type ExplainResult = { summary: NodeSummary } | { unknown: string; suggestion: string | null };

export function summarizeNode(analysis: Analysis, id: string): ExplainResult {
  const node = analysis.snapshot?.nodes[id];
  const plan = plannedDecl(analysis.docs, id);
  const within = (scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const rules: string[] = [];
  for (const doc of analysis.docs) {
    for (const section of doc.sections) {
      if (section.kind !== "rules" && section.kind !== "map") continue;
      if (doc.generated !== null) continue;
      for (const top of sectionNodes(section)) {
        walk(top, (n) => {
          if (n.kind === "deny" || n.kind === "allow" || n.kind === "entry" || n.kind === "rule-module" || n.kind === "ref") {
            if (n.refs.some((ref) => within(ref.target))) rules.push(`${doc.path}:${n.span.start.line}: ${n.tokens.map((t) => t.text).join(" ")}`.trimEnd());
          }
        });
      }
    }
  }
  const flows = flowsUsing(analysis.docs, id);
  if (node) {
    const holes: Record<string, number> = {};
    for (const c of analysis.snapshot?.coverage ?? []) if (c.source === id) holes[c.kind] = (holes[c.kind] ?? 0) + 1;
    const parent = analysis.snapshot?.nodes[id.slice(0, id.lastIndexOf("."))];
    const isClass = node.kind === "module" && parent?.kind === "module" && parent.file !== null && parent.file === node.file;
    return {
      summary: {
        id,
        kind: isClass ? "class" : node.kind,
        signature: node.signature ?? null,
        at: node.file ? `${node.file}:${node.line ?? 1}` : null,
        exported: node.exported ?? null,
        calls: node.calls ?? [],
        callers: node.callers ?? [],
        deps: node.deps ?? [],
        dependents: node.dependents ?? [],
        flows,
        rules: rules.sort(),
        holes,
        fingerprint: node.fingerprint && node.closure ? { own: node.fingerprint, closure: node.closure.fingerprint, complete: node.closure.complete } : null,
        planned: plan !== null,
      },
    };
  }
  if (plan) {
    return {
      summary: { id, kind: `planned ${plan.kind}`, signature: plan.signature, at: `${plan.file}:${plan.line}`, exported: null, calls: [], callers: [], deps: [], dependents: [], flows, rules: rules.sort(), holes: {}, fingerprint: null, planned: true },
    };
  }
  return { unknown: id, suggestion: analysis.index.suggest(id) ?? null };
}

/** The summary as text: one line per fact, empty facts left out. */
export function formatSummary(s: NodeSummary): string {
  const lines = [`${s.kind} ${s.id}${s.signature ? ` ${s.signature}` : ""}`];
  const where = [s.at, s.exported === true ? "exported" : s.exported === false ? "internal" : null, s.planned && !s.kind.startsWith("planned") ? "planned, implemented" : null, s.kind.startsWith("planned") ? "planned, not implemented" : null];
  const whereText = where.filter((x) => x !== null).join(" · ");
  if (whereText) lines.push(whereText);
  const list = (label: string, items: readonly string[]): void => {
    if (items.length > 0) lines.push(`${label}: ${items.join(", ")}`);
  };
  list("calls", s.calls);
  list("called by", s.callers);
  list("depends on", s.deps);
  list("used by", s.dependents);
  list("flows", s.flows);
  for (const rule of s.rules) lines.push(`rule ${rule}`);
  const holes = Object.entries(s.holes).sort(([a], [b]) => (a < b ? -1 : 1)).map(([kind, n]) => `${n} ${kind}`);
  list("not resolved", holes);
  if (s.fingerprint) lines.push(`fingerprint ${s.fingerprint.own.slice(0, 12)} · closure ${s.fingerprint.closure.slice(0, 12)}${s.fingerprint.complete ? "" : " (incomplete)"}`);
  return lines.join("\n");
}
