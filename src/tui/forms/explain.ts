// The explain forms: offline help of a diagnostic code or a node's summary
// (`explain`), the model's explanation of one ID (`explain <id> --llm`), and
// the inventory of what needs explaining with the batch of briefs
// (`explain --stale`, `explain --missing|--stale [--llm]`). They share the
// prompt kind `explain`; its `explainModel` or `explainPlan` says which.

import { selectedAgent } from "../../agent-cli.ts";
import { EXPLANATIONS } from "../../explain.ts";
import { defaultBriefJobs, positiveIntegerProblem } from "../../explain-inventory.ts";
import { readExplanation } from "../../explain-llm.ts";
import { codeExplanation, isDiagnosticCode, nodeExplanation, savedAnswerMiss } from "../../explain-offline.ts";
import { explainDir, explanationPath, type ExplanationDetail } from "../../explanations.ts";
import type { LlmSetup } from "../../llm.ts";
import { searchNodes } from "../../node-search.ts";
import type { ExplainBatchRequest, ExplainPlanRequest } from "../../operations.ts";
import { compareText } from "../../span.ts";
import { evidenceOf } from "../evidence.ts";
import { caretAt, cycle, fieldOf, NODE_HITS, promptText, selectedRow, selectProblem, showRows, type FormRow, type PromptKeys } from "../prompt-keys.ts";
import { operationLabel } from "../reports/records.ts";
import type { ExplainPlanForm, Prompt, State } from "../state.ts";
import type { FormHost } from "./host.ts";

/** The lists of the inventory form, in ←→ order. */
const EXPLAIN_PLAN_LISTS: readonly ExplainPlanForm["list"][] = ["stale-saved", "missing", "stale"];

/** The details of the model's form, in ←→ order. */
const DETAILS: readonly ExplanationDetail[] = ["short", "full", "brief"];

export class ExplainForms {
  private readonly host: FormHost;
  /** `llmClient`, loaded with the first model form: the form says before a run why no model can be asked. */
  private llmSetup: ((agent: string | null) => LlmSetup) | null = null;

  constructor(host: FormHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** The keys of the explain forms. */
  keys(prompt: Prompt): PromptKeys | null {
    if (prompt.kind !== "explain") return null;
    return {
      // The inventory's limit and jobs are typed as they are: 0, 1.5 or a word are refused on Enter with the CLI's message.
      field: () => {
        if (!prompt.explainPlan) return promptText(prompt);
        const row = prompt.ids?.[prompt.index];
        return row === "limit" || row === "jobs" ? fieldOf(prompt.explainPlan, row) : null;
      },
      typed: () => this.refresh(),
      moved: () => this.note(),
      change: (delta) => {
        if (prompt.explainPlan) this.changePlanList(delta);
        else if (prompt.explainModel) this.changeDetail(delta);
      },
      submit: () => this.submit(),
    };
  }

  // ---------- explain (offline) ----------

  /** The explain form: the ID under the cursor, else the code of the line's diagnostic, is the visible default. */
  open(): void {
    let initial = "";
    if (this.state.mode !== "merge") {
      const buffer = this.host.buffer();
      const code = buffer && this.state.analysis ? evidenceOf(this.state.analysis, buffer.path).get(this.state.cursor.line + 1)?.diagnostics[0]?.code : undefined;
      initial = this.host.idAtCursor() ?? code ?? "";
    }
    this.state.prompt = { kind: "explain", text: initial, items: [], ids: [], index: 0 };
    this.refresh();
  }

  /** The codes or the IDs of the session's snapshot matching the typed text (the exact one first). */
  private refresh(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "explain") return;
    if (prompt.explainPlan) return this.refreshPlan();
    const typed = prompt.text.trim();
    let ids: string[];
    if (!prompt.explainModel && /^k\d*$/i.test(typed)) ids = Object.keys(EXPLANATIONS).filter((code) => code.startsWith(typed.toUpperCase())).sort(compareText);
    else {
      const analysis = this.state.analysis;
      const hits = analysis && typed !== "" ? searchNodes(analysis, this.state.briefs, { query: typed, limit: NODE_HITS, fuzzy: true }).map((hit) => hit.id) : [];
      ids = [...new Set(hits)].sort((a, b) => Number(b === typed) - Number(a === typed));
    }
    prompt.ids = ids;
    prompt.items = ids;
    prompt.index = 0;
    this.note();
  }

  /** The subject Enter explains: the selected entry of the list, else the typed text. */
  private subject(): string {
    const prompt = this.state.prompt!;
    return prompt.ids?.[prompt.index] ?? prompt.text.trim();
  }

  private note(): void {
    const prompt = this.state.prompt!;
    if (prompt.explainModel) return this.modelNote(prompt.explainModel.detail);
    if (prompt.explainPlan) return this.refreshPlan();
    const subject = this.subject();
    if (subject === "") {
      prompt.note = "type a diagnostic code (K001) or an id";
      return;
    }
    if (isDiagnosticCode(subject)) {
      prompt.note = `${subject.toUpperCase()}: ${codeExplanation(subject) ? "offline help of the code · reads nothing, saves nothing first" : "not a keylang code"}`;
      return;
    }
    const analysis = this.state.analysis;
    const found = analysis ? nodeExplanation(analysis, subject, analysis.config.explain.detail) : null;
    const known = found === null ? "" : "unknown" in found ? `: not in the current snapshot${found.suggestion ? ` (did you mean ${found.suggestion}?)` : ""}` : ": in the current snapshot";
    prompt.note = `${subject}${known} · a fresh analysis of the saved code and specs · offline: no model, writes nothing`;
  }

  /** Enter in the explain form: the subject runs as the session's operation; an empty one keeps the form. */
  private submit(): void {
    if (this.state.prompt?.explainPlan) return this.submitPlan();
    const subject = this.subject();
    if (subject === "") {
      this.state.message = "explain: a code or an id is required";
      return;
    }
    const model = this.state.prompt?.explainModel;
    if (model) {
      if (isDiagnosticCode(subject)) {
        this.state.message = `explain --llm: ${subject.toUpperCase()} is a diagnostic code: its help is offline (Ctrl+P Explain)`;
        return;
      }
      this.state.prompt = null;
      this.host.requestOperation("explain-llm", { kind: "explain-llm", root: this.state.root, id: subject, detail: model.detail });
      return;
    }
    this.state.prompt = null;
    this.host.requestOperation("explain", { kind: "explain", root: this.state.root, subject });
  }

  /** Loads the model client off the key path, then shows the form's note again with what it says. */
  private loadModel(stillOpen: () => boolean, again: () => void): void {
    if (this.llmSetup !== null) return;
    this.host.track(
      import("../../llm.ts").then(({ llmClient }) => {
        this.llmSetup = (agent) => llmClient(agent, { root: this.state.root });
        if (stillOpen()) {
          again();
          this.host.draw();
        }
      }),
    );
  }

  // ---------- explain with the model ----------

  /** The model's explanation form: the ID under the cursor and the detail of keylang.json by default. */
  openModel(): void {
    const initial = this.state.mode === "merge" ? "" : (this.host.idAtCursor() ?? "");
    const detail = this.state.analysis?.config.explain.detail ?? "short";
    this.state.prompt = { kind: "explain", text: initial, items: [], ids: [], index: 0, explainModel: { detail } };
    this.refresh();
    this.loadModel(
      () => this.state.prompt?.kind === "explain" && this.state.prompt.explainModel !== undefined,
      () => this.note(),
    );
  }

  /** ←→ in the model's form: short, full, brief. */
  private changeDetail(step: number): void {
    const model = this.state.prompt?.explainModel;
    if (!model) return;
    model.detail = cycle(DETAILS, model.detail, step);
    this.note();
  }

  /**
   * What Enter would do, by the session's analysis: read a fresh saved answer
   * (no request), ask the model once and save, or — no model — show the
   * summary and the saved answer; with the detail, the language and the agent.
   */
  private modelNote(detail: ExplanationDetail): void {
    const prompt = this.state.prompt!;
    const id = this.subject();
    const analysis = this.state.analysis;
    const agent = analysis ? selectedAgent(analysis.config.agent) : null;
    const lang = analysis?.config.explain.lang ?? "en";
    const settings = `${detail} (←→) · lang ${lang} · agent ${agent ?? "none"} · keylang.json sets lang and agent`;
    if (id === "") {
      prompt.note = `type an id · ${settings}`;
      return;
    }
    if (isDiagnosticCode(id)) {
      prompt.note = `${id.toUpperCase()} is a diagnostic code: its help is offline (Ctrl+P Explain) · ${settings}`;
      return;
    }
    const found = analysis ? nodeExplanation(analysis, id, detail) : null;
    if (found === null || "unknown" in found) {
      const near = found !== null && found.suggestion ? ` (did you mean ${found.suggestion}?)` : "";
      prompt.note = `${id}: ${found === null ? "analysis is still running" : `not in the current snapshot${near}`} · ${settings}`;
      return;
    }
    const saved = readExplanation(analysis!.config, id, detail);
    const miss = savedAnswerMiss(analysis!, id, saved, lang, detail);
    if (miss === null && saved !== null) {
      prompt.note = `${id}: the saved ${detail} answer (${saved.agent} · ${saved.date}) is fresh: read, no request, nothing written · ${settings}`;
      return;
    }
    const why = miss === "missing" || saved === null ? `no saved ${detail === "brief" ? "brief" : "answer"}` : miss === "stale" ? "the saved answer is stale" : miss === "lang" ? `the saved answer is in ${saved.lang}` : `the saved answer is ${saved.detail}`;
    const setup = this.llmSetup === null ? null : this.llmSetup(agent);
    const ask =
      setup === null
        ? "checking the model…"
        : "missing" in setup
          ? `no request can be made: ${setup.missing}; Enter shows the summary and the saved answer`
          : `asks ${setup.client.agent} once, then saves ${explanationPath(analysis!.config, id, detail)}`;
    prompt.note = `${id}: ${why} · ${ask} · ${settings}`;
  }

  // ---------- explanations to do (inventory, brief plan, dry run) ----------

  /** The inventory form: the stale saved explanations by default; limit and jobs empty (every candidate, 4). */
  openPlan(row: "list" | "batch" = "list"): void {
    this.state.prompt = { kind: "explain", text: "", items: [], ids: [row], index: 0, explainPlan: { list: row === "batch" ? "missing" : "stale-saved", limit: "", jobs: "" } };
    this.refreshPlan();
    // The batch row names the model it would ask.
    if (row !== "batch") return;
    this.loadModel(
      () => this.state.prompt?.kind === "explain" && this.state.prompt.explainPlan !== undefined,
      () => this.refreshPlan(),
    );
  }

  /** The request the form makes, or the field it refuses with the CLI's message. */
  private planRequest(form: ExplainPlanForm): ExplainPlanRequest | { field: "limit" | "jobs"; text: string } {
    if (form.list === "stale-saved") return { kind: "explain-plan", root: this.state.root, list: "stale-saved" };
    const limit = form.limit.trim();
    const jobs = form.jobs.trim();
    const limitProblem = limit === "" ? null : positiveIntegerProblem("--limit", limit);
    if (limitProblem !== null) return { field: "limit", text: limitProblem };
    const jobsProblem = jobs === "" ? null : positiveIntegerProblem("--jobs", jobs);
    if (jobsProblem !== null) return { field: "jobs", text: jobsProblem };
    return { kind: "explain-plan", root: this.state.root, list: "briefs", batch: form.list, ...(limit !== "" ? { limit: Number(limit) } : {}), ...(jobs !== "" ? { jobs: Number(jobs) } : {}), estimate: true };
  }

  /** The rows (the list; limit and jobs for a brief plan; run), what the selected list is and is not, and a note on the selected row. */
  private refreshPlan(): void {
    const prompt = this.state.prompt;
    const form = prompt?.explainPlan;
    if (prompt?.kind !== "explain" || !form) return;
    const selected = selectedRow(prompt, "list");
    const caret = caretAt(selected);
    const names: Record<ExplainPlanForm["list"], string> = {
      "stale-saved": "stale saved explanations (answers and briefs)",
      missing: "brief plan: missing and stale briefs",
      stale: "brief plan: stale briefs only",
    };
    const rows: FormRow[] = [{ id: "list", text: `list:   ${names[form.list]} · ←→ ${names[cycle(EXPLAIN_PLAN_LISTS, form.list, 1)]}` }];
    if (form.list !== "stale-saved") {
      rows.push({ id: "limit", text: `limit:  ${form.limit}${caret("limit")}${form.limit.trim() === "" ? "  (empty: every candidate)" : ""}` });
      rows.push({ id: "jobs", text: `jobs:   ${form.jobs}${caret("jobs")}${form.jobs.trim() === "" ? `  (empty: ${defaultBriefJobs(this.host.agentName())}, the requests a batch keeps in flight)` : ""}` });
    }
    rows.push({ id: "run", text: form.list === "stale-saved" ? "List them (reads the saved files, no model, writes nothing)" : "Plan and estimate: a dry run (no model, writes nothing)" });
    if (form.list !== "stale-saved") rows.push({ id: "batch", text: "Ask the model for them: the batch (plans again, saves each brief)" });
    showRows(prompt, rows, selected);
    prompt.details = [
      form.list === "stale-saved"
        ? "keylang explain --stale: every saved answer and brief whose code changed since (stale) or whose id is gone; each is asked again one by one (explain <id> --llm); not the brief plan"
        : form.list === "missing"
          ? "keylang explain --missing --dry-run: the briefs a batch would ask for, bottom-up — nodes with no doc comment and no fresh brief, stale briefs included"
          : "keylang explain --stale --dry-run: only the stale briefs a batch would ask for again — not the saved answers, not gone ids, not missing briefs",
    ];
    const request = this.planRequest(form);
    const now = prompt.ids![prompt.index]!;
    if ("field" in request) prompt.note = now === request.field || now === "run" ? request.text : `${request.field}: ${request.text}`;
    else if (now === "limit") prompt.note = "a whole number of at least 1: the plan is cut to it before the estimate";
    else if (now === "jobs") prompt.note = "a whole number of at least 1, for the batch the plan is for; a dry run asks nothing";
    else if (now === "batch") {
      const batch = this.batchRequest(request);
      prompt.note = `${operationLabel(batch)} · ${this.batchAsk()} · plans again on a fresh analysis of the saved files; ${batch.jobs ?? defaultBriefJobs(this.host.agentName())} request(s) at a time within a wave, bottom-up; each brief saved to ${explainDir({ dir: this.host.specDir() })}/brief/ as it lands`;
    } else prompt.note = `${operationLabel(request)} · a fresh analysis of the saved code and specs · no model, writes nothing`;
  }

  /** ←→ on the list row. */
  private changePlanList(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const form = prompt?.explainPlan;
    if (!form || prompt.ids?.[prompt.index] !== "list") return;
    form.list = cycle(EXPLAIN_PLAN_LISTS, form.list, delta);
    this.refreshPlan();
  }

  /** Enter: a refused limit or jobs keeps the form with the field selected, else the inventory runs as the session's operation. */
  private submitPlan(): void {
    const prompt = this.state.prompt;
    const form = prompt?.explainPlan;
    if (!form) return;
    const request = this.planRequest(form);
    if ("field" in request) {
      selectProblem(prompt, request.field, () => this.refreshPlan());
      this.state.message = `explain: ${request.text}`;
      return;
    }
    this.state.prompt = null;
    if (prompt.ids?.[prompt.index] === "batch") return this.host.requestOperation("explain-batch", this.batchRequest(request));
    this.host.requestOperation("explain-plan", request);
  }

  /** The batch of a brief plan's form: the same list, limit and jobs, no estimate. */
  private batchRequest(plan: ExplainPlanRequest): ExplainBatchRequest {
    const batch = plan.list === "briefs" ? plan.batch : "missing";
    const limit = plan.list === "briefs" ? plan.limit : undefined;
    return { kind: "explain-batch", root: this.state.root, batch, ...(limit !== undefined ? { limit } : {}), jobs: (plan.list === "briefs" ? plan.jobs : undefined) ?? defaultBriefJobs(this.host.agentName()) };
  }

  /** Who the batch row would ask, by the session's configuration, or why no request can be made. */
  private batchAsk(): string {
    const setup = this.llmSetup === null ? null : this.llmSetup(this.state.analysis?.config.agent ?? null);
    return setup === null ? "checking the model…" : "missing" in setup ? `no request can be made: ${setup.missing}` : `asks ${setup.client.agent} once a brief`;
  }
}
