// `check --changed` keeps the full analysis and drops findings that do not
// touch the changed files: a changed spec (every finding in that file), a
// rule whose scope contains a changed module, and a flow with a step whose
// code is in a changed file. `hook stop` maps the fails that remain to JSON.
// Sits after `assess` (spec IR + snapshot → diagnostics and verdicts) and
// before the CLI output. Entry points: `filterChanged`, `hookFails`,
// `hookDecision`, `parseHookEvent`, `uncheckedTurn`.

import { sameFinding } from "./assess.ts";
import type { Diagnostic } from "./diag.ts";
import { isError } from "./diag.ts";
import type { Document } from "./ir.ts";
import { isJsonBoolean, isJsonObject, parseJson, type JsonValue } from "./json.ts";
import { walkFlow, type SpecIR } from "./spec-ir.ts";
import type { Verdict } from "./verdict.ts";

/** One full assessment plus the snapshot nodes (and edges) needed to tie findings to files. */
export interface ChangedInput {
  docs: readonly Document[];
  spec: SpecIR;
  diagnostics: readonly Diagnostic[];
  verdicts: readonly Verdict[];
  nodes: Readonly<Record<string, { kind: string; file: string | null; layer?: string }>>;
  /** Snapshot edges: what the area of `no-cycles` under a module reaches by import or re-export. Omitted, that area is the module alone. */
  edges?: readonly ChangedEdge[];
}

/** The part of a snapshot edge the `--changed` slice reads; a `call` or `type` edge, an unresolved or a types-only import is not a dependency a cycle runs through. */
export interface ChangedEdge {
  kind: string;
  source: string;
  target: string | null;
  resolution?: string;
  typeOnly?: true;
}

/** One failure the stop hook reports: where, and the text a person reads. */
export interface HookFail {
  file: string;
  line: number;
  text: string;
}

/** A rule line and the modules or layers it is about. */
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
export function filterChanged(input: ChangedInput, changed: ReadonlySet<string>, deleted: readonly string[] = []): ChangedReport {
  // An ID is gone when it is a deleted module or lies under one.
  const gone = (id: string): boolean => deleted.some((scope) => id === scope || id.startsWith(`${scope}.`));

  // The modules whose files changed, with their layer (else the first ID segment).
  const modules = Object.entries(input.nodes)
    .filter(([, node]) => node.kind === "module" && node.file !== null && changed.has(node.file))
    .map(([id, node]) => ({ id, layer: node.layer ?? id.split(".")[0] ?? id }));

  // Rules whose scope covers a changed module; flows with a step in a changed or deleted file.
  const rules = modules.length === 0 ? [] : ruleHits(input).filter((rule) => modules.some((mod) => covers(rule.scope, mod.id, mod.layer)));
  const flowLines = flowLinesTouching(input, changed, gone);
  const ruleLine = (file: string, line: number): boolean => rules.some((rule) => rule.file === file && rule.line === line);
  const ruleCriterion = (criterion: string): boolean => rules.some((rule) => rule.criterion === criterion);

  // Keep a verdict when its spec file changed, it sits in a touched flow or rule
  // line, it shares a touched rule's criterion (a fail reported on the code
  // line), or it is about a deleted module.
  const verdicts = input.verdicts.filter(
    (verdict) => changed.has(verdict.file) || flowLines.has(`${verdict.file}:${verdict.line}`) || ruleLine(verdict.file, verdict.line) || ruleCriterion(verdict.criterion) || gone(verdict.area),
  );

  // Keep a diagnostic by the same tests, or because it is the same finding as a kept verdict.
  const diagnostics = input.diagnostics.filter(
    (diag) => changed.has(diag.file) || ruleLine(diag.file, diag.span.start.line) || (diag.target !== undefined && gone(diag.target)) || verdicts.some((verdict) => sameFinding(verdict, [diag])),
  );

  return { diagnostics, verdicts };
}

/** The diagnostics and verdicts a change touches. */
export interface ChangedReport {
  diagnostics: Diagnostic[];
  verdicts: Verdict[];
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
export function hookDecision(event: HookEvent, fails: readonly HookFail[]): string {
  if (event.stop_hook_active === true || fails.length === 0) return "{}\n";
  // One `file:line: text` line per fail, so the agent sees what to fix.
  const reason = fails.map((fail) => `${fail.file}:${fail.line}: ${fail.text}`).join("\n");

  return `${JSON.stringify({ decision: "block", reason })}\n`;
}

/** A turn the hook could not check: the line a person reads and the hook's JSON. */
export interface UncheckedTurn {
  line: string;
  decision: string;
}

/** The stop hook's stdin event, as far as keylang reads it. */
export interface HookEvent {
  stop_hook_active?: boolean;
}

/**
 * A turn the hook could not check — stdin that is no event, no git, a broken
 * keylang.json, a failed analysis — as the line a person reads and the JSON
 * that carries it: a `systemMessage`, which Claude Code and Codex show the
 * person as a warning without blocking the agent (stderr of a hook that exits
 * 0 reaches only Claude Code's debug log). The command's own `hook stop: `
 * prefix is dropped; a reason of several lines is kept on one.
 */
export function uncheckedTurn(error: string): UncheckedTurn {
  // Strip the command prefix and fold the reason onto a single line.
  const reason = error.replace(/^hook stop: /, "").trim().replace(/\s*\n\s*/g, " ");
  const line = `keylang: this turn was not checked: ${reason}`;

  return { line, decision: `${JSON.stringify({ systemMessage: line })}\n` };
}

/** The object on stdin. Empty stdin is an event with no `stop_hook_active`. */
export function parseHookEvent(text: string): HookEvent {
  // Validate stdin step by step, so each error says which part is wrong.
  if (text.trim() === "") return {};
  let value: JsonValue;

  try {
    value = parseJson(text);
  } catch {
    throw new Error("hook stop: stdin is not JSON");
  }

  if (!isJsonObject(value)) throw new Error("hook stop: stdin is not a JSON object");
  const active = value.stop_hook_active;

  if (active === undefined) return {};

  if (!isJsonBoolean(active)) throw new Error("hook stop: stop_hook_active is not a boolean");

  return { stop_hook_active: active };
}

/** Whether a rule scope covers a module: empty scope covers all; otherwise its layer, itself or an ancestor ID. */
function covers(scope: readonly string[], moduleId: string, layer: string): boolean {
  if (scope.length === 0) return true;

  return scope.some((id) => id === layer || moduleId === id || moduleId.startsWith(`${id}.`));
}

/** Scope and the verdict criterion `--changed` already matches. `no-cycles` stays the literal criterion, not the hashed `no-cycles <module|*>`. */
function ruleHits(input: ChangedInput): RuleHit[] {
  const { spec } = input;
  const hits: RuleHit[] = [];

  // One hit per rule line, with the IDs its area starts from, by rule kind.
  for (const rule of spec.rules) {
    const line = rule.span.start.line;

    if (rule.kind === "dependency") hits.push({ file: rule.file, line, criterion: rule.text, scope: [rule.from.target] });
    else if (rule.kind === "layers" && rule.layers.length > 0) hits.push({ file: rule.file, line, criterion: rule.text, scope: [...rule.layers] });
    else if (rule.kind === "entry") hits.push({ file: rule.file, line, criterion: rule.text, scope: rule.entries.map((ref) => ref.target) });
    // Under M the area is M, its submodules and what they reach (semantics.md `area(no-cycles під M, U)`): a file
    // outside M that closes a cycle through M is a change of this rule.
    else if (rule.kind === "no-cycles") hits.push({ file: rule.file, line, criterion: "no-cycles", scope: rule.under === null ? [] : noCyclesArea(input, rule.under.target) });
    // K104 sits on the rules line, never in the code: the area is the module whose export table it describes.
    else if (rule.kind === "exports") hits.push({ file: rule.file, line, criterion: `exports ${rule.module.target}`, scope: [rule.module.target] });
  }

  // A `layers` line the parser rejected still names its layers: a change there is relevant.
  for (const line of spec.rejectedLayers) {
    if (line.order.length === 0) continue;
    hits.push({ file: line.file, line: line.span.start.line, criterion: line.text, scope: line.order.map((ref) => ref.target) });
  }

  return hits;
}

/**
 * `under`, its submodules, and every module they reach by a resolved `import`
 * or `reexport` that is not types-only: the area `rules.ts` judges the rule
 * over. Edges are between symbols; their module is the nearest `module` node
 * up the id (a class is one too, and lies under its file's module).
 */
function noCyclesArea(input: ChangedInput, under: string): string[] {
  // Walk up the dotted ID to the nearest module node.
  const moduleOf = (id: string): string | null => {
    for (let cur = id; ; cur = cur.slice(0, cur.lastIndexOf("."))) {
      if (input.nodes[cur]?.kind === "module") return cur;

      if (!cur.includes(".")) return null;
    }
  };

  // Module-level adjacency over the edges a cycle can run through: resolved, non-types-only import/reexport.
  const adj = new Map<string, Set<string>>();

  for (const edge of input.edges ?? []) {
    if ((edge.kind !== "import" && edge.kind !== "reexport") || edge.typeOnly === true || edge.target === null) continue;

    if (edge.resolution !== undefined && edge.resolution !== "resolved") continue;
    const from = moduleOf(edge.source);
    const to = moduleOf(edge.target);

    if (from === null || to === null || from === to) continue;
    const list = adj.get(from) ?? new Set<string>();
    list.add(to);
    adj.set(from, list);
  }

  const reached = new Set<string>();

  // Depth-first search from `under` and all its submodules.
  const stack = Object.entries(input.nodes)
    .filter(([id, node]) => node.kind === "module" && (id === under || id.startsWith(`${under}.`)))
    .map(([id]) => id);

  while (stack.length > 0) {
    const id = stack.pop();

    if (id === undefined || reached.has(id)) continue;
    reached.add(id);

    for (const next of adj.get(id) ?? []) stack.push(next);
  }

  // `under` goes first; the rest are in discovery order.
  reached.delete(under);

  return [under, ...reached];
}

/** `file:line` of every verdict in a flow that names a symbol whose file changed or was deleted. */
function flowLinesTouching(input: ChangedInput, changed: ReadonlySet<string>, gone: (id: string) => boolean): Set<string> {
  const lines = new Set<string>();

  for (const doc of input.docs) {
    doc.sections.forEach((section, index) => {
      if (section.kind !== "flow" || section.name === null) return;
      const name = section.name;
      // Match the IR section with its compiled flow by file, name and name offset.
      const flow = input.spec.flows.find((item) => item.file === doc.path && item.name === name.value && item.span.start.offset === name.span.start.offset);

      if (flow === undefined) return;
      let touch = false;
      // The flow is touched when any trigger or step names code in a changed file or a deleted module.
      walkFlow(flow, (item) => {
        if (item.kind !== "step" && item.kind !== "trigger") return;
        const file = input.nodes[item.target.target]?.file;

        if ((file !== null && file !== undefined && changed.has(file)) || gone(item.target.target)) touch = true;
      });

      if (!touch) return;
      // The flow's lines run from its heading to the next section's heading: report every verdict there.
      const start = section.heading?.span.start.line ?? 1;
      const next = doc.sections[index + 1]?.heading?.span.start.line ?? Number.POSITIVE_INFINITY;

      for (const verdict of input.verdicts) {
        if (verdict.file === doc.path && verdict.line >= start && verdict.line < next) lines.add(`${verdict.file}:${verdict.line}`);
      }
    });
  }

  return lines;
}
