// `check --changed` keeps the full analysis and drops findings that do not
// touch the changed files: a changed spec (every finding in that file), a
// rule whose scope contains a changed module, and a flow with a step whose
// code is in a changed file. `hook stop` maps the fails that remain to JSON.

import { sameFinding } from "./assess.ts";
import type { Diagnostic } from "./diag.ts";
import { isError } from "./diag.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import type { Verdict } from "./verdict.ts";

export interface ChangedInput {
  docs: readonly Document[];
  diagnostics: readonly Diagnostic[];
  verdicts: readonly Verdict[];
  nodes: Readonly<Record<string, { kind: string; file: string | null; layer?: string }>>;
}

export interface HookFail {
  file: string;
  line: number;
  text: string;
}

interface RuleHit {
  file: string;
  line: number;
  /** Verdict `criterion` for this rule, when a fail is reported on the code line. */
  criterion: string;
  /** Empty: the rule covers every module (a top-level `no-cycles`). */
  scope: string[];
}

/**
 * Diagnostics and verdicts that touch `changed` (paths as check prints them).
 * `deleted` are module ids whose file git removed: the node is gone, so a
 * flow step that named it is still in the report. Order is preserved.
 */
export function filterChanged(input: ChangedInput, changed: ReadonlySet<string>, deleted: readonly string[] = []): { diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const gone = (id: string): boolean => deleted.some((scope) => id === scope || id.startsWith(`${scope}.`));
  const modules = Object.entries(input.nodes)
    .filter(([, node]) => node.kind === "module" && node.file !== null && changed.has(node.file))
    .map(([id, node]) => ({ id, layer: node.layer ?? id.split(".")[0] ?? id }));
  const rules = modules.length === 0 ? [] : collectRules(input.docs).filter((rule) => modules.some((mod) => covers(rule.scope, mod.id, mod.layer)));
  const flowLines = flowLinesTouching(input, changed, gone);
  const ruleLine = (file: string, line: number): boolean => rules.some((rule) => rule.file === file && rule.line === line);
  const ruleCriterion = (criterion: string): boolean => rules.some((rule) => rule.criterion === criterion);
  const verdicts = input.verdicts.filter(
    (verdict) => changed.has(verdict.file) || flowLines.has(`${verdict.file}:${verdict.line}`) || ruleLine(verdict.file, verdict.line) || ruleCriterion(verdict.criterion) || gone(verdict.area),
  );
  const diagnostics = input.diagnostics.filter(
    (diag) => changed.has(diag.file) || ruleLine(diag.file, diag.span.start.line) || (diag.target !== undefined && gone(diag.target)) || verdicts.some((verdict) => sameFinding(verdict, [diag])),
  );
  return { diagnostics, verdicts };
}

/** Error diagnostics, then fail verdicts that are not the same finding. */
export function hookFails(report: { diagnostics: readonly Diagnostic[]; verdicts: readonly Verdict[] }): HookFail[] {
  const diags = report.diagnostics.filter(isError);
  const fails = diags.map((diag) => ({ file: diag.file, line: diag.span.start.line, text: `${diag.code} ${diag.message}` }));
  for (const verdict of report.verdicts) {
    if (verdict.verdict !== "fail" || sameFinding(verdict, diags)) continue;
    fails.push({ file: verdict.file, line: verdict.line, text: verdict.message });
  }
  return fails;
}

/** Stdin event plus the fails of one changed check. `stop_hook_active` never blocks. The same inputs return the same JSON. */
export function hookDecision(event: { stop_hook_active?: boolean }, fails: readonly HookFail[]): string {
  if (event.stop_hook_active === true || fails.length === 0) return "{}\n";
  const reason = fails.map((fail) => `${fail.file}:${fail.line}: ${fail.text}`).join("\n");
  return `${JSON.stringify({ decision: "block", reason })}\n`;
}

/** The object on stdin. Empty stdin is an event with no `stop_hook_active`. */
export function parseHookEvent(text: string): { stop_hook_active?: boolean } {
  if (text.trim() === "") return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("hook stop: stdin is not JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("hook stop: stdin is not a JSON object");
  const active = (value as { stop_hook_active?: unknown }).stop_hook_active;
  if (active === undefined) return {};
  if (typeof active !== "boolean") throw new Error("hook stop: stop_hook_active is not a boolean");
  return { stop_hook_active: active };
}

function covers(scope: readonly string[], moduleId: string, layer: string): boolean {
  if (scope.length === 0) return true;
  return scope.some((id) => id === layer || moduleId === id || moduleId.startsWith(`${id}.`));
}

function collectRules(docs: readonly Document[]): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "rules" && section.kind !== "map") continue;
      for (const node of sectionNodes(section)) addRule(hits, doc.path, node, null);
    }
  }
  return hits;
}

function addRule(hits: RuleHit[], file: string, node: Node, under: string | null): void {
  if (node.kind === "allow" || node.kind === "deny") {
    const [from, ...to] = node.refs;
    if (from && to.length > 0) hits.push({ file, line: node.span.start.line, criterion: `${node.kind} ${from.target} ${to.map((ref) => ref.target).join(" ")}`, scope: [from.target] });
  } else if (node.kind === "layers" && node.refs.length > 0) {
    const layers = node.refs.map((ref) => ref.target);
    hits.push({ file, line: node.span.start.line, criterion: `layers ${layers.join(" < ")}`, scope: layers });
  } else if (node.kind === "entry") {
    const ids = node.children.flatMap((child) => child.refs.map((ref) => ref.target));
    hits.push({ file, line: node.span.start.line, criterion: `entry ${ids.join(" ")}`, scope: ids });
  } else if (node.kind === "no-cycles") {
    hits.push({ file, line: node.span.start.line, criterion: "no-cycles", scope: under === null ? [] : [under] });
  } else if (node.kind === "rule-module") {
    const target = node.refs[0]?.target ?? null;
    if (target !== null) for (const child of node.children) addRule(hits, file, child, target);
  }
}

/** `file:line` of every verdict in a flow that names a symbol whose file changed or was deleted. */
function flowLinesTouching(input: ChangedInput, changed: ReadonlySet<string>, gone: (id: string) => boolean): Set<string> {
  const lines = new Set<string>();
  for (const doc of input.docs) {
    doc.sections.forEach((section, index) => {
      if (section.kind !== "flow") return;
      let touch = false;
      const start = section.heading?.span.start.line ?? 1;
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind !== "step" && node.kind !== "trigger") return;
          for (const ref of node.refs) {
            const file = input.nodes[ref.target]?.file;
            if ((file !== null && file !== undefined && changed.has(file)) || gone(ref.target)) touch = true;
          }
        });
      }
      if (!touch) return;
      const next = doc.sections[index + 1]?.heading?.span.start.line ?? Number.POSITIVE_INFINITY;
      for (const verdict of input.verdicts) {
        if (verdict.file === doc.path && verdict.line >= start && verdict.line < next) lines.add(`${verdict.file}:${verdict.line}`);
      }
    });
  }
  return lines;
}
