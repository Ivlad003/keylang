// Whether a feature file is done: it declares something to check, keylang
// reads it without errors, every `planned` in it is implemented (K202, not
// K201), every flow step and `calls` in it is static ok, no rule fail exists
// in any spec, and the plan was not weakened since the base commit. Tests and
// trace are reported and do not block. The stage says how far the file got
// from an idea to a spec an agent can implement (.scratch/c4-zoom, B1).

import { sameFinding } from "./assess.ts";
import type { RuleFormat } from "./config.ts";
import type { Diagnostic } from "./diag.ts";
import { isError } from "./diag.ts";
import { plannedMismatch } from "./flows.ts";
import type { Index } from "./resolve.ts";
import { denyingRule, dependencyKindOf } from "./rules.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import { compareText, type Span } from "./span.ts";
import { compileSpec, walkFlow, type Flow, type FlowItem, type FlowStep, type QuestionItem, type SpecIR, type Trigger } from "./spec-ir.ts";
import type { Verdict } from "./verdict.ts";

/**
 * How far a feature file got, the first that holds: `done` (no gaps), `idea`
 * (no `# flow` yet), `behavior` (a flow without a trigger or steps),
 * `structure` (the spec itself has gaps: errors, open questions, a predicted
 * deny, a planned id outside the layers, a planned fn without a signature),
 * `ready` (only the implementation is missing).
 */
export type Stage = "idea" | "behavior" | "structure" | "ready" | "done";

/** What keeps a feature from done. Every gap blocks it; `stage` is where it is fixed. */
export interface Gap {
  kind: "planned" | "static" | "rule" | "spec" | "empty" | "diagnostic" | "question" | "deny";
  id: string;
  file: string;
  line: number;
  col: number;
  reason: string;
  stage: Exclude<Stage, "done">;
}

/** What the spec still lacks that does not keep the feature from done: the next step of a stage. */
export interface Hint {
  kind: "trigger" | "steps" | "layer" | "signature";
  id: string;
  file: string;
  line: number;
  col: number;
  reason: string;
  stage: Exclude<Stage, "done">;
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
  stage: Stage;
  gaps: Gap[];
  hints: Hint[];
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
  /** The resolver index and the format edition: with both, a planned edge a rule would deny is predicted (c4-zoom/05). */
  index?: Index;
  format?: RuleFormat;
  /** Layers of `keylang.json`: a planned id outside them and `external` is a `layer` hint. */
  layers?: readonly string[];
}

const RULE_CODES = new Set(["K101", "K102", "K104", "K105", "K107"]);
/** Errors of the spec itself: a line keylang could not read is no claim it checks. */
const SPEC_CODES = new Set(["K001", "K002", "K003", "K004", "K005"]);
const FLOW = new Set(["ID", "static", "tests", "trace"]);
const KIND_ORDER: Record<Gap["kind"], number> = { empty: 0, diagnostic: 1, question: 2, deny: 3, planned: 4, static: 5, rule: 6, spec: 7 };
const HINT_ORDER: Record<Hint["kind"], number> = { trigger: 0, steps: 1, layer: 2, signature: 3 };

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
  const hasFlow = doc.sections.some((section) => section.kind === "flow");
  const flows = input.spec.flows.filter((flow) => flow.file === path);
  const planned = input.spec.planned.filter((item) => item.file === path);

  if (planned.length === 0 && !flows.some((flow) => flow.triggers.length > 0 || claimsOf(flow).length > 0)) {
    gaps.push({
      kind: "empty",
      id: slug,
      file: path,
      line: 1,
      col: 1,
      reason: "the feature declares nothing to check yet: add a `# flow` with a `trigger`, its steps, and `planned` for what is new",
      stage: hasFlow ? "behavior" : "idea",
    });
  }
  const specErrors = input.diagnostics.filter((diag) => diag.file === path && isError(diag) && SPEC_CODES.has(diag.code));
  for (const diag of specErrors) {
    gaps.push({ kind: "diagnostic", id: diag.code, file: path, line: diag.span.start.line, col: diag.span.start.col, reason: diag.message, stage: "structure" });
  }

  // An open question keeps the feature from done: a person answers it, in a commit (c4-zoom/04).
  for (const flow of flows) {
    walkFlow(flow, (item) => {
      if (item.kind !== "question") return;
      gaps.push({ kind: "question", id: flow.name, file: path, line: item.span.start.line, col: item.span.start.col, reason: `open question: ${item.question}`, stage: "structure" });
    });
  }

  gaps.push(...denyGaps(input, path, flows));

  for (const item of planned) {
    const line = item.span.start.line;
    const col = item.span.start.col;
    const mismatch = finding(input.diagnostics, path, line, "K201");
    const implemented = finding(input.diagnostics, path, line, "K202");
    if (mismatch) gaps.push({ kind: "planned", id: item.id, file: path, line, col, reason: mismatch.message, stage: "ready" });
    else if (!implemented) gaps.push({ kind: "planned", id: item.id, file: path, line, col, reason: `planned \`${item.id}\` is not implemented`, stage: "ready" });
  }
  for (const flow of flows) {
    for (const { id, span } of claimsOf(flow)) {
      // A dangling id is the spec's gap (K001 above); its missing static ok would only repeat it.
      if (specErrors.some((diag) => diag.code === "K001" && diag.span.start.line === span.start.line)) continue;
      const verdict = input.verdicts.find((entry) => entry.file === path && entry.criterion === "static" && entry.line === span.start.line && entry.area === id);
      if (verdict?.verdict === "ok") continue;
      gaps.push({
        kind: "static",
        id,
        file: path,
        line: span.start.line,
        col: span.start.col,
        reason: verdict?.message ?? `no static ok for \`${id}\``,
        stage: "ready",
      });
    }
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
      stage: "ready",
    });
  }
  for (const verdict of input.verdicts) {
    if (verdict.verdict !== "fail" || FLOW.has(verdict.criterion) || sameFinding(verdict, ruleDiags)) continue;
    gaps.push({ kind: "rule", id: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, reason: verdict.message, stage: "ready" });
  }

  if (input.base?.state === "compared") gaps.push(...planGaps(input, path, input.base.ref, input.base.doc));

  const hints: Hint[] = [];
  for (const flow of flows) {
    const at = { file: path, line: flow.span.start.line, col: flow.span.start.col };
    if (flow.triggers.length === 0) hints.push({ kind: "trigger", id: flow.name, ...at, reason: `flow \`${flow.name}\` has no trigger: name its entry point with \`- trigger <id>\``, stage: "behavior" });
    let steps = false;
    walkFlow(flow, (item) => {
      if (item.kind === "step" || item.kind === "calls" || item.kind === "when" || item.kind === "invariant") steps = true;
    });
    if (!steps) hints.push({ kind: "steps", id: flow.name, ...at, reason: `flow \`${flow.name}\` has no steps yet: add \`- step\`, \`- calls\`, \`- when\` or \`- invariant\``, stage: "behavior" });
  }

  for (const item of planned) {
    const at = { file: path, line: item.span.start.line, col: item.span.start.col };
    const layer = item.id.split(".")[0]!;
    if (input.layers !== undefined && layer !== EXTERNAL_LAYER && !input.layers.includes(layer)) {
      hints.push({ kind: "layer", id: item.id, ...at, reason: `\`${layer}\` is no layer of keylang.json, so code can never implement \`${item.id}\`: start the id with a layer (${input.layers.join(", ")}) or \`external\``, stage: "structure" });
    }
    if (item.decl === "fn" && item.signature === null) {
      hints.push({ kind: "signature", id: item.id, ...at, reason: `planned fn \`${item.id}\` has no signature: write it after the id, so an agent knows the contract and K201 can check it`, stage: "structure" });
    }
  }

  gaps.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareText(a.file, b.file) || a.line - b.line || a.col - b.col || compareText(a.id, b.id) || compareText(a.reason, b.reason));
  hints.sort((a, b) => a.line - b.line || a.col - b.col || HINT_ORDER[a.kind] - HINT_ORDER[b.kind] || compareText(a.id, b.id));
  const info = (criterion: "tests" | "trace"): FeatureInfo[] =>
    input.verdicts
      .filter((verdict) => verdict.file === path && verdict.criterion === criterion)
      .map((verdict) => ({ id: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, verdict: verdict.verdict, reason: verdict.message }));
  const base: FeatureBaseInfo | null =
    input.base === undefined ? null : input.base.state === "unavailable" ? { ref: input.base.ref, state: "unavailable", reason: input.base.reason } : { ref: input.base.ref, state: input.base.state };
  return { done: gaps.length === 0, stage: stageOf(hasFlow, gaps, hints), gaps, hints, info: { tests: info("tests"), trace: info("trace"), base } };
}

/** The first stage that holds, from `done` down: see `Stage`. */
function stageOf(hasFlow: boolean, gaps: readonly Gap[], hints: readonly Hint[]): Stage {
  if (gaps.length === 0) return "done";
  if (!hasFlow) return "idea";
  const at = (stage: Stage): boolean => gaps.some((gap) => gap.stage === stage) || hints.some((hint) => hint.stage === stage);
  if (at("idea") || at("behavior")) return "behavior";
  if (at("structure")) return "structure";
  return "ready";
}

/** The packages' layer: a planned id there names an integration, not a module of a layer. */
const EXTERNAL_LAYER = "external";

/**
 * Edges a flow of the feature asks for that a rule would deny once they are
 * code: a `step` or `calls` target under its parent `trigger` or `step` (a
 * top-level one under the first trigger), while one end is still `planned`
 * and not implemented. Once both ends are code, `check` judges the real edge.
 * The baseline's deny is lifted by a manual `allow` over the same areas (ADR
 * 0013); a person's own deny needs another design, or a person changes it.
 */
function denyGaps(input: FeatureInput, path: string, flows: readonly Flow[]): Gap[] {
  if (input.index === undefined || input.format === undefined) return [];
  const kindOf = dependencyKindOf(input.spec, input.index, input.nodes);
  const pending = new Set(input.spec.planned.filter((item) => input.nodes?.[item.id] === undefined).map((item) => item.id));
  const generated = new Set(input.docs.filter((doc) => doc.generated !== null).map((doc) => doc.path));
  const gaps: Gap[] = [];
  const seen = new Set<string>();
  const check = (from: string | null, to: string, span: Span): void => {
    if (from === null || from === to || (!pending.has(from) && !pending.has(to))) return;
    const rule = denyingRule(input.spec, from, to, kindOf, input.format);
    const key = `${from}\0${to}\0${span.start.line}`;
    if (rule === null || seen.has(key)) return;
    seen.add(key);
    const scope = (id: string): string => (id.startsWith(`${EXTERNAL_LAYER}.`) ? id.split(".").slice(0, 2).join(".") : id.split(".")[0]!);
    const what = generated.has(rule.file)
      ? `a person adds \`- allow ${scope(from)} ${scope(to)}\` to keylang/rules.md (an agent proposes it through apply_diff)`
      : "the rule is a person's: the plan needs another path, or a person changes the rule";
    gaps.push({
      kind: "deny",
      id: to,
      file: path,
      line: span.start.line,
      col: span.start.col,
      reason: `once implemented, \`${from}\` → \`${to}\` breaks \`${rule.text}\` (${rule.file}:${rule.line}): ${what}`,
      stage: "structure",
    });
  };
  for (const flow of flows) {
    const visit = (item: Trigger | FlowItem, parent: string | null): void => {
      if (item.kind === "step") check(parent, item.target.target, item.span);
      if (item.kind === "calls") for (const ref of item.targets) check(parent, ref.target, ref.span);
      if (item.kind === "test") return;
      const next = item.kind === "trigger" || item.kind === "step" ? item.target.target : parent;
      for (const child of item.children) visit(child, next);
    };
    const first = flow.triggers[0]?.target.target ?? null;
    for (const item of flow.top) visit(item, item.kind === "trigger" ? null : first);
  }
  return gaps;
}

/** The static claims of a flow, in order: every `step`, and every target of a `calls` line. */
function claimsOf(flow: Flow): { id: string; span: Span }[] {
  const claims: { id: string; span: Span }[] = [];
  walkFlow(flow, (item) => {
    // A `calls` line is a static claim like a step: each target needs its own static ok.
    if (item.kind === "step") claims.push({ id: item.target.target, span: item.span });
    else if (item.kind === "calls") for (const ref of item.targets) claims.push({ id: ref.target, span: ref.span });
  });
  return claims;
}

/**
 * Where the feature file weakened its plan since `ref`: a `planned` removed
 * while the code does not implement it (no K202), and a `trigger`, `step` or
 * open question that is no longer there under the same flow and parents: a
 * question is answered in a commit, never by deleting it. Added items and
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
    gaps.push({ kind: "spec", id: item.id, file: path, line: item.span.start.line, col: item.span.start.col, reason: `planned ${item.decl} \`${item.id}\` (line ${item.span.start.line} at ${ref}) was removed, but ${why}; restore it or implement it`, stage: "ready" });
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
      if (item.kind === "question") {
        gaps.push({ kind: "spec", id: flow.name, file: path, line: item.span.start.line, col: item.span.start.col, reason: `question «${item.question}» of flow \`${flow.name}\` (line ${item.span.start.line} at ${ref}) was removed; done is judged against the plan at ${ref}: answer the question in a commit`, stage: "ready" });
        continue;
      }
      const id = item.target.target;
      gaps.push({ kind: "spec", id, file: path, line: item.span.start.line, col: item.span.start.col, reason: `${item.kind} \`${id}\` of flow \`${flow.name}\` (line ${item.span.start.line} at ${ref}) was changed or removed; done is judged against the plan at ${ref}`, stage: "ready" });
    }
  }
  return gaps;
}

type PlanItem = Trigger | FlowStep | QuestionItem;

/** Every `trigger`, `step` and open question of a flow with a key: the flow, its parents, and itself. */
function planItems(flow: Flow): { key: string; item: PlanItem }[] {
  const out: { key: string; item: PlanItem }[] = [];
  const visit = (item: Trigger | FlowItem, parents: string): void => {
    const self =
      item.kind === "trigger" || item.kind === "step" ? `${item.kind} ${item.target.target}` : item.kind === "when" ? `when ${item.condition}` : item.kind === "question" ? `? ${item.question}` : item.kind;
    const key = `${parents}\0${self}`;
    if (item.kind === "trigger" || item.kind === "step" || item.kind === "question") out.push({ key, item });
    if (item.kind === "test") return;
    for (const child of item.children) visit(child, key);
  };
  for (const item of flow.top) visit(item, flow.name);
  return out;
}

function finding(diagnostics: readonly Diagnostic[], file: string, line: number, code: string): Diagnostic | undefined {
  return diagnostics.find((diag) => diag.file === file && diag.span.start.line === line && diag.code === code);
}
