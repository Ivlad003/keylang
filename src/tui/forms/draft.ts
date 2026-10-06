// The draft forms (design §2.4): a flow, rules or the layers drafted from
// the code, flows drafted from code (`code-to-spec`), and code from a planned
// fn (`spec-to-code`). Each shows its fields as rows with the CLI's defaults
// next to them and, on the selected row, what it means or why the draft
// cannot run yet; nothing runs before Enter. A proposal is written by the
// operation only, and merged hunk by hunk in MERGE.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { contextText } from "../../agent-context.ts";
import type { Analysis } from "../../analyze.ts";
import { CONFIG_FILE, toPosix } from "../../config.ts";
import { codeToSpecTriggers } from "../../draft.ts";
import type { CodeToSpecRequest, CodeToSpecSource, DraftLayoutRequest, DraftRulesRequest, SpecToCodeRequest } from "../../operations.ts";
import { PROPOSALS_DIR, proposalProblem } from "../../proposals.ts";
import { plannedCodeTarget } from "../../spec-to-code.ts";
import { compareText } from "../../span.ts";
import { isDirty } from "../buffer.ts";
import { errorText } from "../merge-session.ts";
import { caretAt, cycle, fieldOf, selectedRow, selectProblem, selectRow, showRows, type FormRow, type PromptKeys } from "../prompt-keys.ts";
import type { CodeDraftForm, DraftForm, Prompt, RulesDraftForm, SpecCodeForm, State } from "../state.ts";
import type { FormHost } from "./host.ts";

type Mode = "algo" | "hybrid" | "llm";
type Output = "proposal" | "preview";

/** Why a form cannot run now: the row to select and the reason. */
interface Problem {
  field: string;
  text: string;
}

/** The modes of a draft, in the order ←→ go through them. */
const DRAFT_MODES: readonly Mode[] = ["algo", "hybrid", "llm"];

/** Hybrid without a model drafts from the snapshot alone, as algo, and says so. */
const NO_MODEL = "no model configured (agent in keylang.json): hybrid drafts from the snapshot only, as algo, and says so";

/** The mode row of a draft: algo, hybrid, llm. */
function modeRow(mode: Mode): FormRow {
  return { id: "mode", text: `mode:    ${mode} · ←→ ${cycle(DRAFT_MODES, mode, 1)}` };
}

/** The output row: a proposal for MERGE, or a preview in F6. */
function outputRow(output: Output): FormRow {
  return { id: "output", text: `output:  ${output} · ←→ ${otherOutput(output)}` };
}

function otherOutput(output: Output): Output {
  return output === "proposal" ? "preview" : "proposal";
}

/** The run row of a draft into one target: the proposal it creates, or a preview. */
function runRow(output: Output, target: string, preview: string): FormRow {
  return { id: "run", text: output === "proposal" ? `Create the proposal ${PROPOSALS_DIR}/${target} (the target itself is not written)` : preview };
}

/** The note of a mode row: what algo does, what the model does, and without one what hybrid falls back to or why llm cannot run. */
function modeNote(mode: Mode, agent: string | null, problem: string | undefined, says: { algo: string; fallback?: string; model: (agent: string, mode: Mode) => string }): string {
  if (mode === "algo") return says.algo;
  if (agent === null) return mode === "hybrid" && says.fallback !== undefined ? says.fallback : (problem ?? "");
  return says.model(agent, mode);
}

/** The problem as the note of the selected row, when it is the row's own, the run row's or the output row's. */
function problemOn(problem: Problem | null, row: string): string | null {
  return problem !== null && (problem.field === row || row === "run" || row === "output") ? problem.text : null;
}

/** The name and target a flow draft would use: the typed ones, else the CLI's defaults. `specDir` is relative to the root, POSIX. */
export function flowDraftTarget(specDir: string, form: { trigger: string; name: string; into: string }): { name: string; target: string } {
  const trigger = form.trigger.trim();
  const name = form.name.trim() !== "" ? form.name.trim() : trigger.slice(trigger.lastIndexOf(".") + 1);
  const into = form.into.trim();
  return { name, target: into !== "" ? toPosix(into) : `${specDir}/flows/${name || "<name>"}.md` };
}

/** The target a rules draft would use: the typed one, else the CLI's default. */
export function rulesDraftTarget(specDir: string, into: string): string {
  return into.trim() !== "" ? toPosix(into.trim()) : `${specDir}/rules.md`;
}

/**
 * What the snapshot says of a code-to-spec position: the fns it names and
 * the spec's name, or why it names none (the CLI's message); null without a
 * snapshot or a file, and for a git change (git decides when the draft
 * runs). Reads the snapshot only.
 */
function codePosition(snapshot: Analysis["snapshot"] | null, form: CodeDraftForm): { name: string; triggers: string[] } | { error: string; field: "file" | "line" } | null {
  const file = toPosix(form.file.trim());
  if (form.source !== "file" || !snapshot || file === "") return null;
  const line = form.line.trim() === "" ? null : Number(form.line.trim());
  try {
    return codeToSpecTriggers(snapshot, file, line);
  } catch (error) {
    const declares = Object.values(snapshot.nodes).some((node) => node.kind === "fn" && node.file === file);
    return { error: errorText(error), field: declares ? "line" : "file" };
  }
}

/** The target a code-to-spec draft would use: the typed one, else the CLI's default — `changes` for a git change, the position's name for a file (`<name>` while it names no fn). */
export function codeDraftTarget(specDir: string, snapshot: Analysis["snapshot"] | null, form: CodeDraftForm): string {
  const into = form.into.trim();
  if (into !== "") return toPosix(into);
  if (form.source === "since") return `${specDir}/flows/changes.md`;
  const position = codePosition(snapshot, form);
  return `${specDir}/flows/${position !== null && "name" in position ? position.name : "<name>"}.md`;
}

/** The form a code-to-spec request was made from, enough to name its default target. */
export function codeDraftFormOf(request: CodeToSpecRequest): CodeDraftForm {
  return {
    source: request.since !== undefined ? "since" : "file",
    file: request.file ?? "",
    line: request.line === undefined ? "" : String(request.line),
    since: request.since ?? "",
    into: request.into ?? "",
    mode: request.mode ?? "algo",
    output: request.output,
  };
}

/** Where spec-to-code would put the code, or why it builds none: its own checks on the analysis; null without one or without an ID. */
export function specCodePlace(analysis: Analysis | null, form: SpecCodeForm): ReturnType<typeof plannedCodeTarget> | null {
  const id = form.id.trim();
  if (!analysis || id === "") return null;
  const into = form.into.trim();
  return plannedCodeTarget(analysis, id, into !== "" ? toPosix(into) : undefined);
}

export class DraftForms {
  private readonly host: FormHost;

  constructor(host: FormHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** The keys of the draft forms. */
  keys(prompt: Prompt): PromptKeys | null {
    const selected = (): string | undefined => prompt.ids?.[prompt.index];
    switch (prompt.kind) {
      case "draft-flow":
        return {
          field: () => {
            const row = selected();
            return prompt.draft && (row === "trigger" || row === "name" || row === "into") ? fieldOf(prompt.draft, row) : null;
          },
          typed: () => this.refreshFlow(),
          moved: () => this.refreshFlow(),
          change: (delta) => this.changeFlow(delta),
          submit: () => this.submitFlow(),
        };
      case "draft-rules":
        return {
          field: () => (prompt.rulesDraft && selected() === "into" ? fieldOf(prompt.rulesDraft, "into") : null),
          typed: () => this.refreshRules(),
          moved: () => this.refreshRules(),
          change: (delta) => this.changeRules(delta),
          submit: () => this.submitRules(),
        };
      case "draft-layout":
        // A choice, not a query: nothing is typed.
        return { field: () => null, moved: () => this.refreshLayout(), change: (delta) => this.changeLayout(delta), submit: () => this.submitLayout() };
      case "code-to-spec":
        return {
          // The line is a number: anything but digits is not typed into it.
          field: () => {
            const row = selected();
            if (!prompt.codeDraft) return null;
            if (row === "line") return fieldOf(prompt.codeDraft, row, true);
            return row === "file" || row === "into" || row === "since" ? fieldOf(prompt.codeDraft, row) : null;
          },
          typed: () => this.refreshCode(),
          moved: () => this.refreshCode(),
          change: (delta) => this.changeCode(delta),
          submit: () => this.submitCode(),
        };
      case "spec-to-code":
        return {
          field: () => {
            const row = selected();
            return prompt.specCode && (row === "id" || row === "into") ? fieldOf(prompt.specCode, row) : null;
          },
          typed: () => this.refreshSpecCode(),
          moved: () => this.refreshSpecCode(),
          change: () => this.changeSpecCode(),
          submit: () => this.submitSpecCode(),
        };
      default:
        return null;
    }
  }

  /** The mode a draft starts in: the CLI's default (hybrid) with a model, else algo. */
  private firstMode(): Mode {
    return this.host.agentName() !== null ? "hybrid" : "algo";
  }

  /** Why a draft may not propose into `target` now: the proposal rules, a proposal waiting there, unsaved edits of it. */
  private targetProblem(target: string, field: string): Problem | null {
    const problem = proposalProblem(this.state.root, this.host.proposalDir(), target, (path) => this.host.generatedDoc(path));
    if (problem !== null) return { field, text: `${target}: ${problem}` };
    if (this.host.proposalWaiting(target)) return { field: "into", text: `a proposal for ${target} is waiting: merge it first (m, or Proposals)` };
    const buffer = this.state.buffers.get(target);
    if (buffer && isDirty(buffer)) return { field: "into", text: `${target} has unsaved changes: save (Ctrl+S) or undo them before a draft into it` };
    return null;
  }

  /** A form that may not run keeps its values: the row of the problem is selected, the reason is the message. */
  private refuse(prompt: Prompt, problem: Problem, label: string, refresh: () => void): void {
    selectProblem(prompt, problem.field, refresh);
    this.state.message = `${label}: ${problem.text}`;
  }

  // ---------- draft flow (algo, hybrid, llm) ----------

  /**
   * The draft-flow form (design §2.4): the fn under the cursor, else the
   * trigger of the flow under the cursor, is the visible default; name and
   * target stay empty for the CLI's defaults, shown next to them. The output
   * is a proposal unless preview is chosen; the mode is the CLI's default
   * (hybrid) when a model is configured, else algo.
   */
  openFlow(): void {
    const snapshot = this.state.analysis?.snapshot ?? null;
    const id = this.state.mode === "merge" ? null : this.host.idAtCursor();
    const trigger = id !== null && snapshot?.nodes[id]?.kind === "fn" ? id : (this.host.triggerAtCursor() ?? "");
    this.state.prompt = { kind: "draft-flow", text: "", items: [], ids: [], index: 0, draft: { trigger, name: "", into: "", mode: this.firstMode(), output: "proposal" } };
    this.refreshFlow();
  }

  /** The callable IDs of the current snapshot that contain the typed trigger, at most eight. */
  private triggerMatches(typed: string): string[] {
    const nodes = this.state.analysis?.snapshot?.nodes ?? {};
    if (nodes[typed]?.kind === "fn") return [];
    const query = typed.toLowerCase();
    return Object.keys(nodes)
      .filter((id) => nodes[id]!.kind === "fn" && nodes[id]!.layer !== "external" && id.toLowerCase().includes(query))
      .sort(compareText)
      .slice(0, 8);
  }

  /** Why a draft may not start now, or null: the checks the CLI makes first, then a pending proposal and an unsaved target (a proposal only). */
  private flowProblem(form: DraftForm): Problem | null {
    const trigger = form.trigger.trim();
    if (trigger === "") return { field: "trigger", text: "a trigger id is required" };
    const snapshot = this.state.analysis?.snapshot ?? null;
    if (snapshot !== null && snapshot.nodes[trigger]?.kind !== "fn") {
      const hint = this.state.analysis?.index.suggest(trigger);
      return { field: "trigger", text: `\`${trigger}\` is not a fn of the current snapshot${hint ? ` (did you mean \`${hint}\`?)` : ""}` };
    }
    if (form.mode === "llm" && this.host.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts from the snapshot without one)" };
    if (form.output === "preview") return null;
    return this.targetProblem(flowDraftTarget(this.host.proposalDir(), form).target, form.into.trim() === "" ? "name" : "into");
  }

  /** The rows, the root, and a note on the selected row; nothing is read but the snapshot and the target's state. */
  private refreshFlow(): void {
    const prompt = this.state.prompt;
    const form = prompt?.draft;
    if (prompt?.kind !== "draft-flow" || !form) return;
    const selected = selectedRow(prompt, "trigger");
    const caret = caretAt(selected);
    const { name, target } = flowDraftTarget(this.host.proposalDir(), form);
    showRows(
      prompt,
      [
        { id: "trigger", text: `trigger: ${form.trigger}${caret("trigger")}` },
        ...this.triggerMatches(form.trigger.trim()).map((id) => ({ id: `fn:${id}`, text: `    fn ${id}` })),
        { id: "name", text: `name:    ${form.name}${caret("name")}${form.name.trim() === "" ? `  (default ${name || "the trigger's last segment"})` : ""}` },
        { id: "into", text: `target:  ${form.into}${caret("into")}${form.into.trim() === "" ? `  (default ${target})` : ""}` },
        modeRow(form.mode),
        outputRow(form.output),
        runRow(form.output, target, "Preview the draft (writes nothing)"),
      ],
      selected,
    );
    prompt.details = [`root: ${this.state.root} · the target is relative to it · ${form.mode === "algo" ? "algo: only the calls the snapshot resolved" : "the model's steps are marked agree, llm-only or conflict; never evidence"}`];
    const now = prompt.ids![prompt.index]!;
    const problem = this.flowProblem(form);
    if (now.startsWith("fn:")) prompt.note = `Enter takes ${now.slice(3)} as the trigger`;
    else if (now === "mode")
      prompt.note = modeNote(form.mode, this.host.agentName(), problem?.text, {
        algo: "algo: only the calls the snapshot resolved; no model",
        fallback: NO_MODEL,
        model: (agent, mode) => `${agent} drafts with the context pack (F4); ${mode === "hybrid" ? "the steps it missed come from the snapshot" : "each step is judged against the snapshot"}`,
      });
    else if (now === "trigger") {
      const trigger = form.trigger.trim();
      const snapshot = this.state.analysis?.snapshot ?? null;
      prompt.note =
        trigger === ""
          ? "type a callable id · ↓ picks a match"
          : snapshot === null
            ? "no current snapshot to look it up; the operation reads the saved code"
            : snapshot.nodes[trigger]?.kind === "fn"
              ? `${trigger}: a fn of the current snapshot`
              : (problem?.text ?? "");
    } else prompt.note = problemOn(problem, now) ?? (now === "into" || now === "name" ? (existsSync(join(this.state.root, target)) ? `${target} exists: its other sections are kept` : `${target} is a new file`) : form.output === "proposal" ? "Enter proposes; MERGE applies it hunk by hunk" : "Enter shows the draft in F6; nothing is written");
  }

  /** ←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview). */
  private changeFlow(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "draft-flow" || !prompt.draft) return;
    if (row === "mode") prompt.draft.mode = cycle(DRAFT_MODES, prompt.draft.mode, delta);
    else if (row === "output") prompt.draft.output = otherOutput(prompt.draft.output);
    else return;
    this.refreshFlow();
  }

  /**
   * Enter in the draft form. On a match it takes that trigger; elsewhere a
   * problem keeps the form (the typed values stay) with the field selected,
   * else the draft runs as the session's operation.
   */
  private submitFlow(): void {
    const prompt = this.state.prompt;
    const form = prompt?.draft;
    if (prompt?.kind !== "draft-flow" || !form) return;
    const row = prompt.ids?.[prompt.index] ?? "";
    if (row.startsWith("fn:")) {
      form.trigger = row.slice(3);
      return selectRow(prompt, "name", () => this.refreshFlow());
    }
    const problem = this.flowProblem(form);
    if (problem !== null) return this.refuse(prompt, problem, "draft flow", () => this.refreshFlow());
    const name = form.name.trim();
    const into = form.into.trim();
    // The model sees the context pack as F4 shows it now: taken once, before anything else opens.
    const pack = form.mode === "algo" ? null : this.host.contextPack();
    this.state.prompt = null;
    this.host.requestOperation("draft-flow", {
      kind: "draft-flow",
      root: this.state.root,
      trigger: form.trigger.trim(),
      ...(name !== "" ? { name } : {}),
      ...(into !== "" ? { into: toPosix(into) } : {}),
      output: form.output,
      pending: "refuse",
      ...(form.mode !== "algo" ? { mode: form.mode } : {}),
      ...(pack ? { context: contextText(pack) } : {}),
    });
  }

  // ---------- draft rules (algo, hybrid, llm) ----------

  /**
   * The draft-rules form (design §2.4 `draft rules`): the target (empty: the
   * CLI's `<dir>/rules.md`, shown next to it), the mode (hybrid with a
   * model, else algo) and preview or proposal.
   */
  openRules(): void {
    this.state.prompt = { kind: "draft-rules", text: "", items: [], ids: [], index: 0, rulesDraft: { into: "", mode: this.firstMode(), output: "proposal" } };
    this.refreshRules();
  }

  /** Why a rules draft may not start now, or null: a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target. */
  private rulesProblem(form: RulesDraftForm): Problem | null {
    if (form.mode === "llm" && this.host.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts from the snapshot without one)" };
    if (form.output === "preview") return null;
    return this.targetProblem(rulesDraftTarget(this.host.proposalDir(), form.into), "into");
  }

  /** The rows, the root and what the model sees, and a note on the selected row. */
  private refreshRules(): void {
    const prompt = this.state.prompt;
    const form = prompt?.rulesDraft;
    if (prompt?.kind !== "draft-rules" || !form) return;
    const selected = selectedRow(prompt, "into");
    const target = rulesDraftTarget(this.host.proposalDir(), form.into);
    showRows(
      prompt,
      [
        { id: "into", text: `target:  ${form.into}${caretAt(selected)("into")}${form.into.trim() === "" ? `  (default ${target})` : ""}` },
        modeRow(form.mode),
        outputRow(form.output),
        runRow(form.output, target, "Preview the draft (writes nothing)"),
      ],
      selected,
    );
    prompt.details = [
      `root: ${this.state.root} · the target is relative to it · ${form.mode === "algo" ? "algo: the rules the code keeps now (layers or deny, no-cycles without a module cycle)" : "the model sees the layers and the edges between them; each of its rules is checked alone: agree, conflict or llm-only — never the workspace's verdict"}`,
    ];
    const now = prompt.ids![prompt.index]!;
    const problem = this.rulesProblem(form);
    if (now === "mode")
      prompt.note = modeNote(form.mode, this.host.agentName(), problem?.text, {
        algo: "algo: the rules the code keeps now; no model",
        fallback: NO_MODEL,
        model: (agent, mode) => `${agent} proposes rules; ${mode === "hybrid" ? "the algo rules it missed are added" : "each is checked alone against the snapshot"}`,
      });
    else prompt.note = problemOn(problem, now) ?? (now === "into" ? (existsSync(join(this.state.root, target)) ? `${target} exists: its prose and other sections are kept; the rules join its last # rules section` : `${target} is a new file`) : form.output === "proposal" ? "Enter proposes; MERGE applies it hunk by hunk" : "Enter shows the draft in F6; nothing is written");
  }

  /** ←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview). */
  private changeRules(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "draft-rules" || !prompt.rulesDraft) return;
    if (row === "mode") prompt.rulesDraft.mode = cycle(DRAFT_MODES, prompt.rulesDraft.mode, delta);
    else if (row === "output") prompt.rulesDraft.output = otherOutput(prompt.rulesDraft.output);
    else return;
    this.refreshRules();
  }

  /** Enter in the rules form: a problem keeps the form with the field selected, else the draft runs as the session's operation. */
  private submitRules(): void {
    const prompt = this.state.prompt;
    const form = prompt?.rulesDraft;
    if (prompt?.kind !== "draft-rules" || !form) return;
    const problem = this.rulesProblem(form);
    if (problem !== null) return this.refuse(prompt, problem, "draft rules", () => this.refreshRules());
    const into = form.into.trim();
    this.state.prompt = null;
    const request: DraftRulesRequest = {
      kind: "draft-rules",
      root: this.state.root,
      ...(into !== "" ? { into: toPosix(into) } : {}),
      output: form.output,
      pending: "refuse",
      ...(form.mode !== "algo" ? { mode: form.mode } : {}),
    };
    this.host.requestOperation("draft-rules", request);
  }

  // ---------- code-to-spec: flows from a source file, a line or the git changes (algo, hybrid, llm) ----------

  /**
   * The code-to-spec form (design §2.4 `code-to-spec`): the source is a
   * file — the code viewer's file and line, else the file (and, for a fn,
   * the line) of the ID under the cursor, else empty fields and a list of
   * the source files — or the git changes since a ref (`HEAD`). An empty
   * line drafts every exported fn; an empty target is the CLI's default.
   * The mode is the model's (hybrid) when one is configured, else algo.
   */
  openCode(): void {
    const code = this.state.mode === "code" ? this.state.code : null;
    let file = code?.file ?? "";
    let line = code ? String(code.line) : "";
    if (!code && this.state.mode !== "merge") {
      const id = this.host.idAtCursor();
      const node = id === null ? undefined : this.state.analysis?.snapshot?.nodes[id];
      if (node?.file) {
        file = node.file;
        line = node.kind === "fn" && node.line !== null && node.line !== undefined ? String(node.line) : "";
      }
    }
    this.state.prompt = { kind: "code-to-spec", text: "", items: [], ids: [], index: 0, codeDraft: { source: "file", file, line, since: "HEAD", into: "", mode: this.firstMode(), output: "proposal" } };
    this.refreshCode();
  }

  /** The source files of the current snapshot that declare a fn and contain the typed text, at most eight. */
  private sourceMatches(typed: string): string[] {
    const nodes = this.state.analysis?.snapshot?.nodes ?? {};
    const files = new Set<string>();
    for (const node of Object.values(nodes)) if (node.kind === "fn" && node.file && node.layer !== "external") files.add(node.file);
    if (files.has(typed)) return [];
    const query = typed.toLowerCase();
    return [...files].filter((file) => file.toLowerCase().includes(query)).sort(compareText).slice(0, 8);
  }

  /** Why the draft may not start now, or null: the source's fields, a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target. */
  private codeProblem(form: CodeDraftForm): Problem | null {
    let position: ReturnType<typeof codePosition> = null;
    if (form.source === "since") {
      if (form.since.trim() === "") return { field: "since", text: "a git ref is required (HEAD: the changes not committed yet)" };
    } else {
      if (form.file.trim() === "") return { field: "file", text: "a source file is required, relative to the root" };
      const line = form.line.trim();
      if (line !== "" && !(/^\d+$/.test(line) && Number(line) >= 1)) return { field: "line", text: `line \`${line}\`: a whole number from 1, or empty for every exported fn of the file` };
      position = codePosition(this.state.analysis?.snapshot ?? null, form);
      if (position !== null && "error" in position) return { field: position.field, text: position.error };
    }
    if (form.mode === "llm" && this.host.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts from the snapshot without one)" };
    if (form.output === "preview") return null;
    // Without a snapshot the default target of a file is not known yet: the operation checks it.
    if (form.source === "file" && form.into.trim() === "" && position === null) return null;
    return this.targetProblem(codeDraftTarget(this.host.proposalDir(), this.state.analysis?.snapshot ?? null, form), "into");
  }

  /** The rows, the root, and a note on the selected row: what the source names, the mode, the target's state or why it cannot run. */
  private refreshCode(): void {
    const prompt = this.state.prompt;
    const form = prompt?.codeDraft;
    if (prompt?.kind !== "code-to-spec" || !form) return;
    const selected = selectedRow(prompt, form.source === "file" ? "file" : "since");
    const caret = caretAt(selected);
    const snapshot = this.state.analysis?.snapshot ?? null;
    const target = codeDraftTarget(this.host.proposalDir(), snapshot, form);
    // Only the chosen source's rows: the other source's fields are kept as typed but never sent.
    const sourceRows: FormRow[] =
      form.source === "file"
        ? [
            { id: "file", text: `file:    ${form.file}${caret("file")}` },
            ...this.sourceMatches(toPosix(form.file.trim())).map((file) => ({ id: `src:${file}`, text: `    ${file}` })),
            { id: "line", text: `line:    ${form.line}${caret("line")}${form.line.trim() === "" ? "  (none: every exported fn of the file)" : ""}` },
          ]
        : [{ id: "since", text: `since:   ${form.since}${caret("since")}  (git ref: the fns changed in the working tree since it)` }];
    const rows: FormRow[] = [
      { id: "source", text: `source:  ${form.source === "file" ? "a file or a line" : "git changes"} · ←→ ${form.source === "file" ? "git changes" : "a file or a line"}` },
      ...sourceRows,
      { id: "into", text: `target:  ${form.into}${caret("into")}${form.into.trim() === "" ? `  (default ${target})` : ""}` },
      modeRow(form.mode),
      outputRow(form.output),
      runRow(form.output, target, "Preview the flows (writes nothing)"),
    ];
    // A row of the other source is gone after ←→ on the source: its counterpart is selected.
    const fallback = selected === "file" || selected === "line" || selected.startsWith("src:") ? "since" : selected === "since" ? "file" : selected;
    showRows(prompt, rows, rows.some((row) => row.id === selected) ? selected : fallback);
    const scope = form.source === "file" ? "the file and the target are relative to it" : "the target is relative to it; git runs in it and only reads";
    const how = form.mode === "algo" ? `algo: only the calls the snapshot resolved; no model, no search beyond the ${form.source === "file" ? "file" : "changed fns"}` : "the model drafts each flow; its steps are marked agree, llm-only or conflict; never evidence";
    prompt.details = [`root: ${this.state.root} · ${scope} · ${how}`];
    const now = prompt.ids![prompt.index]!;
    const problem = this.codeProblem(form);
    const position = codePosition(snapshot, form);
    const named = position !== null && "triggers" in position ? (form.line.trim() === "" ? `${position.triggers.length} exported fn(s): ${position.triggers.join(", ")}` : `line ${form.line.trim()} is in ${position.triggers[0]}`) : null;
    if (now.startsWith("src:")) prompt.note = `Enter takes ${now.slice(4)} as the file`;
    else if (now === "source") prompt.note = form.source === "file" ? "the fn at a line, or every exported fn of a file" : "every fn changed since the ref, untracked files whole; a fn already in a hand-written flow is named, not drafted again";
    else if (now === "file" && form.file.trim() === "") prompt.note = "type a source file · ↓ picks a match";
    else if (now === "mode")
      prompt.note = modeNote(form.mode, this.host.agentName(), problem?.text, {
        algo: "algo: only the calls the snapshot resolved; no model",
        fallback: NO_MODEL,
        model: (agent, mode) => `${agent} drafts each flow in turn with the context pack (F4)${mode === "hybrid" ? "; the steps it missed come from the snapshot" : "; each step is judged against the snapshot"}`,
      });
    else
      prompt.note =
        problemOn(problem, now) ??
        (now === "file" || now === "line"
          ? (named ?? (snapshot ? "" : "no current snapshot to look it up; the operation reads the saved code"))
          : now === "since"
            ? "the saved working tree against the ref: no checkout, no commit"
            : now === "into"
              ? existsSync(join(this.state.root, target))
                ? `${target} exists: its other sections are kept, a section of the same flow is replaced`
                : `${target} is a new file`
              : form.output === "proposal"
                ? `Enter proposes${named ? ` ${named}` : ""}; MERGE applies it hunk by hunk`
                : "Enter shows the flows in F6; nothing is written");
  }

  /** ←→ on the source row (a file or the git changes), the mode row (algo, hybrid, llm) or the output row (proposal or preview). */
  private changeCode(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const form = prompt?.codeDraft;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "code-to-spec" || !form) return;
    if (row === "source") form.source = form.source === "file" ? "since" : "file";
    else if (row === "mode") form.mode = cycle(DRAFT_MODES, form.mode, delta);
    else if (row === "output") form.output = otherOutput(form.output);
    else return;
    this.refreshCode();
  }

  /** The request of the form: only the chosen source's fields; the model's context as F4 shows it now. */
  private codeRequest(form: CodeDraftForm): CodeToSpecRequest {
    const line = form.line.trim();
    const into = form.into.trim();
    const pack = form.mode === "algo" ? null : this.host.contextPack();
    const source: CodeToSpecSource = form.source === "since" ? { since: form.since.trim() } : { file: toPosix(form.file.trim()), ...(line !== "" ? { line: Number(line) } : {}) };
    return {
      kind: "code-to-spec",
      root: this.state.root,
      ...source,
      ...(into !== "" ? { into: toPosix(into) } : {}),
      output: form.output,
      pending: "refuse",
      ...(form.mode !== "algo" ? { mode: form.mode } : {}),
      ...(pack ? { context: contextText(pack) } : {}),
    };
  }

  /**
   * Enter in the code-to-spec form. On a match it takes that file and moves
   * to the line; elsewhere a problem keeps the form (the typed values stay)
   * with the field selected, else the draft runs as the session's operation.
   */
  private submitCode(): void {
    const prompt = this.state.prompt;
    const form = prompt?.codeDraft;
    if (prompt?.kind !== "code-to-spec" || !form) return;
    const row = prompt.ids?.[prompt.index] ?? "";
    if (row.startsWith("src:")) {
      form.file = row.slice(4);
      return selectRow(prompt, "line", () => this.refreshCode());
    }
    const problem = this.codeProblem(form);
    if (problem !== null) return this.refuse(prompt, problem, "code-to-spec", () => this.refreshCode());
    // The model sees the context pack as F4 shows it now: taken once, before anything else opens.
    const request = this.codeRequest(form);
    this.state.prompt = null;
    this.host.requestOperation("code-to-spec", request);
  }

  // ---------- spec-to-code: a stub and failing tests for a planned fn (template), or the model's code ----------

  /**
   * The spec-to-code form (design §2.4 `spec-to-code`): the planned fn —
   * given (a feature's planned gap), else the one under the cursor, else
   * typed or picked from the planned fns — the code file (empty: the
   * module's, shown next to it), the mode (the offline template unless
   * llm is chosen) and preview or proposal.
   */
  openSpecCode(id?: string): void {
    let initial = id ?? "";
    if (id === undefined && this.state.mode !== "merge") {
      const at = this.host.idAtCursor();
      if (at !== null && this.host.plannedFns().includes(at)) initial = at;
    }
    this.state.prompt = { kind: "spec-to-code", text: "", items: [], ids: [], index: 0, specCode: { id: initial, into: "", mode: "algo", output: "proposal" } };
    this.refreshSpecCode();
  }

  /** The planned fns containing the typed text, at most eight; none once it is one. */
  private plannedMatches(typed: string): string[] {
    const planned = this.host.plannedFns();
    if (planned.includes(typed)) return [];
    const query = typed.toLowerCase();
    return planned.filter((id) => id.toLowerCase().includes(query)).slice(0, 8);
  }

  /** Why spec-to-code may not start now, or null: an ID, spec-to-code's own checks, a model llm needs, then (a proposal only) a proposal waiting for the code file. */
  private specCodeProblem(form: SpecCodeForm): Problem | null {
    if (form.id.trim() === "") return { field: "id", text: "a planned fn id is required" };
    const placed = specCodePlace(this.state.analysis, form);
    if (placed !== null && "error" in placed) return { field: placed.field, text: placed.error };
    if (form.mode === "llm" && this.host.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (algo writes the template without one)" };
    // Without an analysis the operation checks the ID; a test file's waiting proposal it refuses too.
    if (form.output === "preview" || placed === null) return null;
    if (this.host.proposalWaiting(placed.file)) return { field: "into", text: `a proposal for ${placed.file} is waiting: merge it first (m, or Proposals)` };
    return null;
  }

  /** The rows, the root and what the template is, and a note on the selected row. */
  private refreshSpecCode(): void {
    const prompt = this.state.prompt;
    const form = prompt?.specCode;
    if (prompt?.kind !== "spec-to-code" || !form) return;
    const selected = selectedRow(prompt, "id");
    const caret = caretAt(selected);
    const placed = specCodePlace(this.state.analysis, form);
    const file = placed !== null && "file" in placed ? placed.file : null;
    showRows(
      prompt,
      [
        { id: "id", text: `id:      ${form.id}${caret("id")}` },
        ...this.plannedMatches(form.id.trim()).map((id) => ({ id: `planned:${id}`, text: `    planned fn ${id}` })),
        { id: "into", text: `target:  ${form.into}${caret("into")}${form.into.trim() === "" ? `  (default ${file ?? "the module's file"})` : ""}` },
        { id: "mode", text: `mode:    ${form.mode} · ←→ ${form.mode === "algo" ? "llm" : "algo"}` },
        outputRow(form.output),
        { id: "run", text: form.output === "proposal" ? `Create the proposals under ${PROPOSALS_DIR}/: the code and each new test (no file itself is written)` : "Preview the candidate (writes nothing)" },
      ],
      selected,
    );
    const how =
      form.mode === "algo"
        ? "template: the declared signature with a body that fails until written, a failing node:test per flow test; no model"
        : "llm: the model writes the function and each new test file; checked as code, proposed for MERGE, never accepted for you; the tests are not run";
    prompt.details = [`root: ${this.state.root} · the target is relative to it · ${how}`];
    const now = prompt.ids![prompt.index]!;
    const problem = this.specCodeProblem(form);
    if (now.startsWith("planned:")) prompt.note = `Enter takes ${now.slice(8)}`;
    else if (now === "mode")
      prompt.note = modeNote(form.mode, this.host.agentName(), problem?.text, {
        algo: "algo: the template, offline; no model",
        model: (agent) => `${agent} writes the code, then each new test file: one request each; its credentials are checked before the first`,
      });
    else if (now === "id" && form.id.trim() === "") prompt.note = this.state.analysis ? `type a planned fn · ↓ picks one (${this.host.plannedFns().length} planned, not implemented)` : "no current analysis to look it up; the operation reads the saved specs";
    else
      prompt.note =
        problemOn(problem, now) ??
        (now === "id"
          ? file === null
            ? "no current analysis to look it up; the operation reads the saved specs"
            : `${form.id.trim()}: planned fn, its code goes to ${file}`
          : now === "into"
            ? file === null
              ? ""
              : existsSync(join(this.state.root, file))
                ? `${file} exists: the stub is appended, the rest is kept`
                : `${file} is a new file`
            : form.output === "proposal"
              ? "Enter proposes the code and its tests; each merges on its own in MERGE"
              : "Enter shows the candidate in F6; nothing is written");
  }

  /** ←→ on the mode row (algo or llm) or the output row (proposal or preview). */
  private changeSpecCode(): void {
    const prompt = this.state.prompt;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "spec-to-code" || !prompt.specCode) return;
    if (row === "mode") prompt.specCode.mode = prompt.specCode.mode === "algo" ? "llm" : "algo";
    else if (row === "output") prompt.specCode.output = otherOutput(prompt.specCode.output);
    else return;
    this.refreshSpecCode();
  }

  /** Enter in the form: a match takes that ID; elsewhere a problem keeps the form with the field selected, else spec-to-code runs as the session's operation. */
  private submitSpecCode(): void {
    const prompt = this.state.prompt;
    const form = prompt?.specCode;
    if (prompt?.kind !== "spec-to-code" || !form) return;
    const row = prompt.ids?.[prompt.index] ?? "";
    if (row.startsWith("planned:")) {
      form.id = row.slice(8);
      return selectRow(prompt, "into", () => this.refreshSpecCode());
    }
    const problem = this.specCodeProblem(form);
    if (problem !== null) return this.refuse(prompt, problem, "spec-to-code", () => this.refreshSpecCode());
    const into = form.into.trim();
    this.state.prompt = null;
    const request: SpecToCodeRequest = { kind: "spec-to-code", root: this.state.root, id: form.id.trim(), ...(into !== "" ? { into: toPosix(into) } : {}), output: form.output, pending: "refuse", ...(form.mode === "llm" ? { mode: "llm" as const } : {}) };
    this.host.requestOperation("spec-to-code", request);
  }

  // ---------- draft map: layers into keylang.json's buffer ----------

  /** The draft-layout form (design §2.4 `draft map`): the mode (hybrid with a model, else algo), then run; nothing is written. */
  openLayout(): void {
    this.state.prompt = { kind: "draft-layout", text: "", items: [], ids: [], index: 0, layoutDraft: { mode: this.firstMode() } };
    this.refreshLayout();
  }

  /** Why a layout draft may not start: llm needs a model. */
  private layoutProblem(mode: Mode): string | null {
    return mode === "llm" && this.host.agentName() === null ? "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts as algo without one)" : null;
  }

  private refreshLayout(): void {
    const prompt = this.state.prompt;
    const form = prompt?.layoutDraft;
    if (prompt?.kind !== "draft-layout" || !form) return;
    showRows(prompt, [modeRow(form.mode), { id: "run", text: "Draft the layers (writes nothing; F6 shows them, Enter there moves them into keylang.json's buffer)" }], selectedRow(prompt, "mode"));
    const exists = existsSync(join(this.state.root, CONFIG_FILE));
    prompt.details = [
      `root: ${this.state.root} · drafted from the saved ${CONFIG_FILE}${exists ? "" : " (none: the inferred one)"} and the code · only layers change, in the buffer, until Ctrl+S`,
    ];
    const problem = this.layoutProblem(form.mode);
    if (prompt.ids![prompt.index] === "mode")
      prompt.note = modeNote(form.mode, this.host.agentName(), problem ?? undefined, {
        algo: "algo: the layers keylang would guess from the directories; no model",
        fallback: "no model configured (agent in keylang.json): hybrid drafts as algo, and says so",
        model: (agent) => `${agent} groups the source files into layers, validated as keylang.json`,
      });
    else prompt.note = problem ?? "Enter drafts; nothing is written, not even a proposal";
  }

  private changeLayout(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "draft-layout" || !prompt.layoutDraft || prompt.ids?.[prompt.index] !== "mode") return;
    prompt.layoutDraft.mode = cycle(DRAFT_MODES, prompt.layoutDraft.mode, delta);
    this.refreshLayout();
  }

  private submitLayout(): void {
    const prompt = this.state.prompt;
    const form = prompt?.layoutDraft;
    if (prompt?.kind !== "draft-layout" || !form) return;
    const problem = this.layoutProblem(form.mode);
    if (problem !== null) return this.refuse(prompt, { field: "mode", text: problem }, "draft map", () => this.refreshLayout());
    this.state.prompt = null;
    const request: DraftLayoutRequest = { kind: "draft-layout", root: this.state.root, ...(form.mode !== "algo" ? { mode: form.mode } : {}) };
    this.host.requestOperation("draft-layout", request);
  }
}
