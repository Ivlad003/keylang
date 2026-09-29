// Whether a feature file is done: every `planned` in it is implemented
// (K202, not K201), every flow step in it is static ok, and no rule fail
// exists in any spec. Tests and trace are reported and do not block.

import { sameFinding } from "./assess.ts";
import type { Diagnostic } from "./diag.ts";
import { isError } from "./diag.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import { compareText } from "./span.ts";
import type { Verdict } from "./verdict.ts";

export interface Gap {
  kind: "planned" | "static" | "rule";
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

export interface FeatureReport {
  done: boolean;
  gaps: Gap[];
  info: { tests: FeatureInfo[]; trace: FeatureInfo[] };
}

export interface FeatureInput {
  dir: string;
  docs: readonly Document[];
  diagnostics: readonly Diagnostic[];
  verdicts: readonly Verdict[];
}

const RULE_CODES = new Set(["K101", "K102", "K104", "K105"]);
const FLOW = new Set(["ID", "static", "tests", "trace"]);
const KIND_ORDER: Record<Gap["kind"], number> = { planned: 0, static: 1, rule: 2 };

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

  for (const section of doc.sections) {
    for (const top of sectionNodes(section)) {
      walk(top, (node) => {
        if (node.kind === "planned" && node.id) {
          const line = node.span.start.line;
          const col = node.span.start.col;
          const mismatch = finding(input.diagnostics, path, line, "K201");
          const implemented = finding(input.diagnostics, path, line, "K202");
          if (mismatch) gaps.push({ kind: "planned", id: node.id, file: path, line, col, reason: mismatch.message });
          else if (!implemented) gaps.push({ kind: "planned", id: node.id, file: path, line, col, reason: `planned \`${node.id}\` is not implemented` });
        }
        if (node.kind !== "step") return;
        const id = node.refs[0]?.target;
        if (!id) return;
        const verdict = input.verdicts.find((item) => item.file === path && item.criterion === "static" && item.line === node.span.start.line && item.area === id);
        if (verdict?.verdict === "ok") return;
        gaps.push({
          kind: "static",
          id,
          file: path,
          line: node.span.start.line,
          col: node.span.start.col,
          reason: verdict?.message ?? `no static ok for \`${id}\``,
        });
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
    });
  }
  for (const verdict of input.verdicts) {
    if (verdict.verdict !== "fail" || FLOW.has(verdict.criterion) || sameFinding(verdict, ruleDiags)) continue;
    gaps.push({ kind: "rule", id: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, reason: verdict.message });
  }

  gaps.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareText(a.file, b.file) || a.line - b.line || a.col - b.col || compareText(a.id, b.id) || compareText(a.reason, b.reason));
  const info = (criterion: "tests" | "trace"): FeatureInfo[] =>
    input.verdicts
      .filter((verdict) => verdict.file === path && verdict.criterion === criterion)
      .map((verdict) => ({ id: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, verdict: verdict.verdict, reason: verdict.message }));
  return { done: gaps.length === 0, gaps, info: { tests: info("tests"), trace: info("trace") } };
}

function finding(diagnostics: readonly Diagnostic[], file: string, line: number, code: string): Diagnostic | undefined {
  return diagnostics.find((diag) => diag.file === file && diag.span.start.line === line && diag.code === code);
}
