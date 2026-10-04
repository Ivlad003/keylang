// Whether a feature file is done: every `planned` in it is implemented
// (K202, not K201), every flow step and `calls` in it is static ok, no rule
// fail exists in any spec, and the plan was not weakened since the base
// commit. Tests and trace are reported and do not block.

import { sameFinding } from "./assess.ts";
import type { Diagnostic } from "./diag.ts";
import { isError } from "./diag.ts";
import { plannedMismatch } from "./flows.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import { compareText } from "./span.ts";
import { compileSpec, walkFlow, type Flow, type FlowItem, type FlowStep, type SpecIR, type Trigger } from "./spec-ir.ts";
import type { Verdict } from "./verdict.ts";

export interface Gap {
  kind: "planned" | "static" | "rule" | "spec";
  id: string;
  file: string;
  line: number;
  col: number;
  reason: string;
}

export interface FeatureInfo {
  id: string;
  file: string;
  line: number;
  col: number;
  verdict: string;
  reason: string;
}

/**
 * The feature file at its base commit (`HEAD` or `--since`). `compared`: the
 * file is there; `absent`: it is not (a new feature, or no commit yet);
 * `unavailable`: the history could not be read, so the plan is not compared.
 */
export type FeatureBase =
  | { ref: string; state: "compared"; doc: Document }
  | { ref: string; state: "absent" }
  | { ref: string; state: "unavailable"; reason: string };

/** `FeatureBase` as the report shows it. */
export type FeatureBaseInfo = { ref: string; state: "compared" | "absent" } | { ref: string; state: "unavailable"; reason: string };

export interface FeatureReport {
  done: boolean;
  gaps: Gap[];
  info: { tests: FeatureInfo[]; trace: FeatureInfo[]; base: FeatureBaseInfo | null };
}

export interface FeatureInput {
  dir: string;
  docs: readonly Document[];
  spec: SpecIR;
  diagnostics: readonly Diagnostic[];
  verdicts: readonly Verdict[];
  /** Snapshot nodes: whether a `planned` removed since the base is implemented. */
  nodes?: Readonly<Record<string, { kind: string; signature?: string | null }>>;
  /** The feature file at its base commit; omitted, the plan is not compared. */
  base?: FeatureBase;
}

const RULE_CODES = new Set(["K101", "K102", "K104", "K105", "K107"]);
const FLOW = new Set(["ID", "static", "tests", "trace"]);
const KIND_ORDER: Record<Gap["kind"], number> = { planned: 0, static: 1, rule: 2, spec: 3 };

/** Ids declared or named in one spec, in first-seen order. */
export function idsIn(doc: Document): string[] {
  const ids: string[] = [];
  for (const section of doc.sections) {
    for (const top of sectionNodes(section)) {
      walk(top, (node) => {
        if (node.id) ids.push(node.id);
        for (const ref of node.refs) ids.push(ref.target);
      });
    }
  }
  return [...new Set(ids)];
}

/**
 * The feature report, or null when `keylang/<dir>/features/<slug>.md` is not
 * one of the specs. Gaps are ordered by kind, then file, line, column, id.
 */
export function featureStatus(input: FeatureInput, slug: string): FeatureReport | null {
  const path = `${input.dir}/features/${slug}.md`;
  const doc = input.docs.find((item) => item.path === path);
  if (doc === undefined) return null;
  const gaps: Gap[] = [];

  for (const item of input.spec.planned) {
    if (item.file !== path) continue;
    const line = item.span.start.line;
    const col = item.span.start.col;
    const mismatch = finding(input.diagnostics, path, line, "K201");
    const implemented = finding(input.diagnostics, path, line, "K202");
    if (mismatch) gaps.push({ kind: "planned", id: item.id, file: path, line, col, reason: mismatch.message });
    else if (!implemented) gaps.push({ kind: "planned", id: item.id, file: path, line, col, reason: `planned \`${item.id}\` is not implemented` });
  }
  for (const flow of input.spec.flows) {
    if (flow.file !== path) continue;
    walkFlow(flow, (item) => {
      // A `calls` line is a static claim like a step: each target needs its own static ok.
      const claims = item.kind === "step" ? [{ id: item.target.target, span: item.span }] : item.kind === "calls" ? item.targets.map((ref) => ({ id: ref.target, span: ref.span })) : [];
      for (const { id, span } of claims) {
        const verdict = input.verdicts.find((entry) => entry.file === path && entry.criterion === "static" && entry.line === span.start.line && entry.area === id);
        if (verdict?.verdict === "ok") continue;
        gaps.push({
          kind: "static",
          id,
          file: path,
          line: span.start.line,
          col: span.start.col,
          reason: verdict?.message ?? `no static ok for \`${id}\``,
        });
      }
    });
  }

  const ruleDiags = input.diagnostics.filter((diag) => isError(diag) && RULE_CODES.has(diag.code));
  for (const diag of ruleDiags) {
    const owner = input.verdicts.find((verdict) => sameFinding(verdict, [diag]));
    gaps.push({
      kind: "rule",
      id: owner?.area ?? diag.code,
      file: diag.file,
      line: diag.span.start.line,
      col: diag.span.start.col,
      reason: diag.message,
    });
  }
  for (const verdict of input.verdicts) {
    if (verdict.verdict !== "fail" || FLOW.has(verdict.criterion) || sameFinding(verdict, ruleDiags)) continue;
    gaps.push({ kind: "rule", id: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, reason: verdict.message });
  }

  if (input.base?.state === "compared") gaps.push(...planGaps(input, path, input.base.ref, input.base.doc));

  gaps.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareText(a.file, b.file) || a.line - b.line || a.col - b.col || compareText(a.id, b.id) || compareText(a.reason, b.reason));
  const info = (criterion: "tests" | "trace"): FeatureInfo[] =>
    input.verdicts
      .filter((verdict) => verdict.file === path && verdict.criterion === criterion)
      .map((verdict) => ({ id: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, verdict: verdict.verdict, reason: verdict.message }));
  const base: FeatureBaseInfo | null =
    input.base === undefined ? null : input.base.state === "unavailable" ? { ref: input.base.ref, state: "unavailable", reason: input.base.reason } : { ref: input.base.ref, state: input.base.state };
  return { done: gaps.length === 0, gaps, info: { tests: info("tests"), trace: info("trace"), base } };
}

/**
 * Where the feature file weakened its plan since `ref`: a `planned` removed
 * while the code does not implement it (no K202), and a `trigger` or `step`
 * that is no longer there under the same flow and parents. Added items and
 * order among siblings are not compared. Positions are the base file's.
 */
function planGaps(input: FeatureInput, path: string, ref: string, baseDoc: Document): Gap[] {
  const base = compileSpec([baseDoc]).spec;
  const gaps: Gap[] = [];
  const kept = new Set(input.spec.planned.filter((item) => item.file === path).map((item) => item.id));
  for (const item of base.planned) {
    if (kept.has(item.id)) continue;
    const code = input.nodes?.[item.id];
    const mismatch = code === undefined ? "missing" : plannedMismatch(item, code);
    if (mismatch === null) continue;
    const why = mismatch === "missing" ? "the code does not have it" : `the code has a different ${mismatch}`;
    gaps.push({ kind: "spec", id: item.id, file: path, line: item.span.start.line, col: item.span.start.col, reason: `planned ${item.decl} \`${item.id}\` (line ${item.span.start.line} at ${ref}) was removed, but ${why}; restore it or implement it` });
  }
  const now = new Map<string, number>();
  for (const flow of input.spec.flows) if (flow.file === path) for (const { key } of planItems(flow)) now.set(key, (now.get(key) ?? 0) + 1);
  for (const flow of base.flows) {
    for (const { key, item } of planItems(flow)) {
      const left = now.get(key) ?? 0;
      if (left > 0) {
        now.set(key, left - 1);
        continue;
      }
      const id = item.target.target;
      gaps.push({ kind: "spec", id, file: path, line: item.span.start.line, col: item.span.start.col, reason: `${item.kind} \`${id}\` of flow \`${flow.name}\` (line ${item.span.start.line} at ${ref}) was changed or removed; done is judged against the plan at ${ref}` });
    }
  }
  return gaps;
}

type PlanItem = Trigger | FlowStep;

/** Every `trigger` and `step` of a flow with a key: the flow, its parents, and itself. */
function planItems(flow: Flow): { key: string; item: PlanItem }[] {
  const out: { key: string; item: PlanItem }[] = [];
  const visit = (item: Trigger | FlowItem, parents: string): void => {
    const self = item.kind === "trigger" || item.kind === "step" ? `${item.kind} ${item.target.target}` : item.kind === "when" ? `when ${item.condition}` : item.kind;
    const key = `${parents}\0${self}`;
    if (item.kind === "trigger" || item.kind === "step") out.push({ key, item });
    if (item.kind === "test") return;
    for (const child of item.children) visit(child, key);
  };
  for (const item of flow.top) visit(item, flow.name);
  return out;
}

function finding(diagnostics: readonly Diagnostic[], file: string, line: number, code: string): Diagnostic | undefined {
  return diagnostics.find((diag) => diag.file === file && diag.span.start.line === line && diag.code === code);
}
