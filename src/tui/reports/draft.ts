// Reports of the drafts: a flow, rules or layers drafted from the code, flows
// from code, code from a planned fn and its applied candidate, and the
// model's open questions for a feature. A proposal is written only through
// MERGE; a preview writes nothing.

import { PROPOSALS_DIR } from "../../proposals.ts";
import type { CodeToSpecPayload, DraftFlowPayload, DraftRulesPayload, FeatureQuestionsPayload, SpecToCodePayload } from "../../operations.ts";
import type { OperationRecord } from "../state.ts";
import { MARK_STYLE, THEME } from "../theme.ts";
import { BOLD, codeOf, ERROR, messageRow, MUTED, noticeRow, outcomeRow, textRows, WARNING, type Report, type ReportRow } from "./rows.ts";

type DraftKind = "feature-questions" | "draft-flow" | "draft-rules" | "draft-layout" | "code-to-spec" | "spec-to-code" | "apply-code";

/** ` --mode hybrid`; nothing for algo, the CLI's default. */
function modeFlag(mode: string | undefined): string {
  return mode !== undefined && mode !== "algo" ? ` --mode ${mode}` : "";
}

/** The source of a code-to-spec as the CLI names it: `src/a.ts:8` or `--since HEAD`. */
function codeSource(source: { file?: string | null | undefined; line?: number | null | undefined; since?: string | null | undefined }): string {
  if (source.since !== undefined && source.since !== null) return `--since ${source.since}`;
  return `${source.file ?? ""}${source.line !== undefined && source.line !== null ? `:${source.line}` : ""}`;
}

/** `3 step(s), preview, nothing written`, `3 step(s) proposed for <target>`, `refused, nothing written`, `write failed`. */
function draftOutcome(status: OperationRecord["status"], payload: DraftFlowPayload | DraftRulesPayload | CodeToSpecPayload): string {
  if (payload.candidate === null) return `no fn outside the flows changed since ${"since" in payload ? payload.since : ""}, nothing written`;
  if (payload.output === "preview") return `${payload.summary}, preview, nothing written`;
  if (payload.proposal !== null) return `${payload.summary} proposed for ${payload.candidate.target}`;
  if (payload.refused.length > 0) return "refused, nothing written";
  if (payload.error !== null) return "write failed";
  return `${status}, nothing written`;
}

/** What spec-to-code did with its candidate: previewed, proposed (all, or the ones before it stopped), refused. */
function specCodeOutcome(status: OperationRecord["status"], payload: SpecToCodePayload): string {
  const total = payload.candidate.targets.length;
  if (payload.output === "preview") return `${payload.summary}, preview, nothing written`;
  if (payload.proposals.length === total) return `${payload.summary} proposed`;
  if (payload.proposals.length > 0) return `${status} after ${payload.proposals.length} of ${total} proposal(s)`;
  if (payload.refused.length > 0) return "refused, nothing written";
  if (payload.error !== null) return "write failed, nothing written";
  return `${status}, nothing written`;
}

/** `3 question(s) proposed`, with the answer's lines left out when there were any. */
function questionsOutcome(payload: FeatureQuestionsPayload): string {
  const asked = payload.proposal !== null ? `${payload.questions.length} question(s) proposed` : payload.questions.length === 0 ? "no question asked" : `${payload.questions.length} question(s), nothing written`;
  return payload.dropped > 0 ? `${asked}, ${payload.dropped} line(s) left out` : asked;
}

/** What Enter does on a drafted report: MERGE of the proposal, or a draft again after a preview. */
function draftHint(rows: ReportRow[], payload: { proposal: string | null; output: "proposal" | "preview" }, target: string): void {
  if (payload.proposal !== null) rows.push({ text: `  Enter opens MERGE of ${target} (m and Proposals too)`, style: THEME.hint });
  else if (payload.output === "preview") rows.push({ text: "  Enter drafts again · the form's proposal output writes it", style: THEME.hint });
}

/** A preview's whole proposed target, when it is more than the drafted part. */
function proposedRows(rows: ReportRow[], payload: { output: "proposal" | "preview" }, candidate: { target: string; text: string | null }, drafted: string): void {
  if (payload.output === "preview" && candidate.text !== null && candidate.text !== drafted) rows.push(...textRows(`${candidate.target} as proposed`, candidate.text.replace(/\r\n/g, "\n")));
}

/** `(hybrid without a model)` after the mode of a draft that had to fall back. */
function fallback(payload: { fallback: unknown }): string {
  return payload.fallback !== null ? " (hybrid without a model)" : "";
}

/** The model's statuses next to the snapshot's: provenance, not evidence. */
const PROVENANCE = "  the statuses are provenance, not evidence: only check decides a verdict";

export const DRAFT_REPORTS: { [K in DraftKind]: Report<K> } = {
  "feature-questions": {
    label: (request) => `feature ${request.slug} questions`,
    params: (request) => request.slug,
    summary: (_record, result) => `${questionsOutcome(result.payload)} · code ${result.exitCode}`,
    rows(_state, _record, result, view) {
      // The model's questions as proposed: the feature file itself is written only through MERGE (c4-zoom/11).
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Questions · ${payload.agent} · ${payload.file} · proposal; the feature file itself is not written`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
        ...payload.questions.map((question) => ({ text: `  ${question}`, style: { ...THEME.panel, ...MARK_STYLE.question, bg: THEME.panel.bg! } })),
      ];
      if (payload.proposal !== null) rows.push({ text: `  Enter opens MERGE of ${payload.file} (m and Proposals too)`, style: THEME.hint });
      return rows;
    },
  },
  "draft-flow": {
    label: (request) => `draft flow ${request.trigger}${modeFlag(request.mode)}${request.output === "preview" ? " --print" : ""}`,
    params: (request) => `${request.mode ?? "algo"} · ${request.output} · ${request.trigger}`,
    summary: (record, result) => `${draftOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      // The candidate: what it keeps of the target, the flow section, and for a preview the whole proposed text.
      const { payload } = result;
      const { candidate } = payload;
      const rows: ReportRow[] = [
        { text: `Draft flow · ${payload.mode}${fallback(payload)} · ${candidate.trigger} → ${candidate.target} · ${payload.output === "preview" ? "preview, nothing written" : "proposal; the target itself is not written"}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
      ];
      const kept = candidate.before === null ? "a new file" : "exists: its other sections are kept, a section of the same flow is replaced";
      rows.push({ text: `  target ${candidate.target}: ${candidate.problem ?? kept}`, style: candidate.problem !== null ? WARNING : MUTED });
      if (payload.model === null) rows.push({ text: "  only the calls the snapshot resolved are steps; an unresolved one is a comment on its caller", style: MUTED });
      else {
        rows.push({ text: `  drafted by ${payload.model.agent} in ${payload.model.rounds} round(s): agree — the snapshot's calls have it; llm-only — the model's alone; conflict — not a fn`, style: MUTED });
        rows.push({ text: PROVENANCE, style: MUTED });
      }
      draftHint(rows, payload, candidate.target);
      rows.push(...textRows(`keylang draft flow ${candidate.trigger}${modeFlag(payload.mode)} --print · stdout`, candidate.flow));
      proposedRows(rows, payload, candidate, candidate.flow);
      return rows;
    },
  },
  "draft-rules": {
    label: (request) => `draft rules${modeFlag(request.mode)}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.output === "preview" ? " --print" : ""}`,
    params: (request) => `${request.mode ?? "algo"} · ${request.output}${request.into !== undefined ? ` · ${request.into}` : ""}`,
    summary: (record, result) => `${draftOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      // The drafted rules: how each compares with the code now, the conflicts with their evidence apart, then the CLI's stdout.
      const { payload } = result;
      const { candidate } = payload;
      const rows: ReportRow[] = [
        { text: `Draft rules · ${payload.mode}${fallback(payload)} → ${candidate.target} · ${payload.output === "preview" ? "preview, nothing written" : "proposal; the target itself is not written"}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.filter((message) => !message.text.startsWith("conflict: ")).map(messageRow),
      ];
      const kept = candidate.before === null ? "a new file" : "exists: its prose and other sections are kept; the rules join its last # rules section, a rule it has is not repeated";
      rows.push({ text: `  target ${candidate.target}: ${candidate.problem ?? kept}`, style: candidate.problem !== null ? WARNING : MUTED });
      rows.push({ text: `  algo: the rules the code keeps now${payload.cyclic ? "; the modules form a cycle, so no no-cycles" : ""}`, style: MUTED });
      if (payload.model !== null) {
        rows.push({ text: `  proposed by ${payload.model.agent}, each rule checked alone against the snapshot: agree — the code keeps it; conflict — the code breaks it now; llm-only — not enough evidence; algo-only — the snapshot's`, style: MUTED });
        rows.push({ text: "  the statuses are the draft's, not the workspace's verdict: the current report is unchanged, only check decides", style: MUTED });
        if (payload.model.conflicts.length > 0) {
          rows.push({ text: `  conflicts (${payload.model.conflicts.length}): the code breaks these rules now`, style: WARNING });
          for (const conflict of payload.model.conflicts) rows.push({ text: `    conflict: ${conflict}`, style: WARNING });
        }
      }
      draftHint(rows, payload, candidate.target);
      rows.push(...textRows(`keylang draft rules${modeFlag(payload.mode)} --print · stdout`, candidate.rules));
      proposedRows(rows, payload, candidate, candidate.rules);
      return rows;
    },
  },
  "draft-layout": {
    label: (request) => `draft map${modeFlag(request.mode)}`,
    params: (request) => request.mode ?? "algo",
    summary: (_record, result) => `${Object.keys(result.payload.layers).length} layer(s), nothing written · code ${result.exitCode}`,
    rows(_state, record, result, view) {
      // The drafted layers, then what Enter does with them, then the CLI's stdout.
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Draft layers · ${payload.mode}${fallback(payload)} · nothing written, not even a proposal`, style: BOLD },
        outcomeRow(view.summary, true),
        ...result.messages.map((message) => ({ text: `  ${message.text}`, style: THEME.panel })),
        { text: `  ${payload.agent === null ? "algo: the layers keylang would guess from the directories" : `proposed by ${payload.agent}, validated as keylang.json: a proposal, never assigned without you`}`, style: MUTED },
        ...Object.entries(payload.layers).map(([name, globs]) => ({ text: `  ${name}  ${globs.join(", ")}`, style: THEME.panel })),
      ];
      if (record.outdated === null)
        rows.push({
          text: `  Enter: move the layers into ${payload.configExists ? "keylang.json's buffer — only layers change, every other field stays" : "a new keylang.json buffer, the inferred config with these layers"}; written only by Ctrl+S, Ctrl+Z undoes`,
          style: THEME.hint,
        });
      rows.push(...textRows(`keylang draft map${modeFlag(payload.mode)} · stdout`, payload.preview));
      return rows;
    },
  },
  "code-to-spec": {
    label: (request) => `code-to-spec ${codeSource(request)} --mode ${request.mode ?? "algo"}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.output === "preview" ? " --print" : ""}`,
    params: (request) => `${request.mode ?? "algo"} · ${request.output}${request.into !== undefined ? ` · ${request.into}` : ""}`,
    summary: (record, result) => `${draftOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      // The flows the source names, the model's notes, what they make of the target, the CLI's --print, and for a preview the whole proposed text.
      const { payload } = result;
      const { candidate } = payload;
      const position = codeSource({ file: candidate?.file, line: candidate?.line, since: payload.since });
      const mode = `${payload.mode}${fallback(payload)}`;
      const rows: ReportRow[] = [
        { text: `Code to spec · ${mode} · ${position}${candidate !== null ? ` → ${candidate.target} · ${payload.output === "preview" ? "preview, nothing written" : "proposal; the target itself is not written"}` : " · nothing to draft, nothing written"}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(noticeRow),
      ];
      const scope =
        payload.since !== null
          ? `every fn changed in the working tree since ${payload.since}, untracked files whole; a fn already in a hand-written flow is named for review, not drafted again`
          : candidate !== null && candidate.line !== null
            ? `line ${candidate.line}: the innermost fn holding it`
            : "every exported fn of the file, in declaration order";
      rows.push({ text: `  ${scope}${candidate !== null ? `; the spec is named ${candidate.name}` : ""}`, style: MUTED });
      if (payload.described.length > 0) rows.push({ text: `  already in flows (review those): ${payload.described.join(", ")}`, style: WARNING });
      if (candidate === null) return rows;
      for (const flow of candidate.flows) rows.push({ text: `  flow ${flow.name} · trigger ${flow.trigger} · ${flow.steps.length} step(s)`, style: THEME.panel });
      const kept = candidate.before === null ? "a new file" : "exists: its other sections are kept, a section of the same flow is replaced";
      rows.push({ text: `  target ${candidate.target}: ${candidate.problem ?? kept}`, style: candidate.problem !== null ? WARNING : MUTED });
      if (payload.model === null) rows.push({ text: "  only the calls the snapshot resolved are steps; an unresolved one is a comment on its caller", style: MUTED });
      else {
        rows.push({ text: `  drafted by ${payload.model.agent}, one request per flow: agree — the snapshot's calls have it; llm-only — the model's alone; conflict — not a fn`, style: MUTED });
        rows.push({ text: PROVENANCE, style: MUTED });
      }
      draftHint(rows, payload, candidate.target);
      rows.push(...textRows(`keylang code-to-spec ${position} --mode ${payload.mode} --print · stdout`, candidate.print));
      proposedRows(rows, payload, candidate, candidate.print);
      return rows;
    },
  },
  "spec-to-code": {
    label: (request) => `spec-to-code ${request.id}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.mode === "llm" ? " --mode llm" : ""}${request.output === "preview" ? " --print" : ""}`,
    params: (request) => `${request.mode ?? "algo"} · ${request.output} · ${request.id}${request.into !== undefined ? ` · ${request.into}` : ""}`,
    summary: (record, result) => `${specCodeOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, record, result, view) {
      // Each file as its own proposal, the candidate's findings as a preview of check, the test notes, the CLI's stdout.
      const { payload } = result;
      const { candidate } = payload;
      const rows: ReportRow[] = [
        { text: `Spec to code · ${payload.mode === "llm" ? "llm" : "template"} · ${candidate.id} → ${candidate.targets.length} file(s) · ${payload.output === "preview" ? "preview, nothing written" : "proposals; no source or test file itself is written"}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(noticeRow),
      ];
      if (payload.model !== null) rows.push({ text: `  written by ${payload.model.agent} in ${payload.model.requests} request(s): provenance, not evidence — review each hunk in MERGE; nothing is accepted for you and its tests are not run`, style: MUTED });
      for (const target of candidate.targets) {
        const store = `${PROPOSALS_DIR}/${target.file}`;
        const state = payload.proposals.includes(store) ? `proposed as ${store}` : target.pending !== null ? `a proposal was waiting at ${store}` : payload.output === "preview" ? "previewed" : "not proposed";
        rows.push({ text: `  ${target.role} ${target.file}${target.before === null ? " (new file)" : " (the stub is appended)"} · ${state}`, style: THEME.panel });
      }
      rows.push({ text: `  with the candidate in place: ${candidate.verdicts.length} verdict(s), ${candidate.diagnostics.length} diagnostic(s) — the candidate's, a preview of check; not the workspace's verdict, and not the feature done`, style: MUTED });
      if (payload.proposals.length > 0) rows.push({ text: "  Enter opens the proposals list: each file merges on its own (m and Proposals too)", style: THEME.hint });
      else if (payload.output === "preview") rows.push({ text: "  Enter builds it again · the form's proposal output writes the proposals", style: THEME.hint });
      if (record.status === "completed" && record.outdated === null && payload.proposals.length === 0)
        rows.push({ text: `  a applies the entire candidate: writes these ${candidate.targets.length} file(s) directly, as --apply, after a step that names them — no proposal, no test is run`, style: THEME.hint });
      rows.push(...textRows(`keylang spec-to-code ${candidate.id}${payload.mode === "llm" ? " --mode llm" : ""} --print · stdout`, candidate.print.replace(/\r\n/g, "\n")));
      return rows;
    },
  },
  "apply-code": {
    label: (request) => `spec-to-code ${request.candidate.id}${request.mode === "llm" ? " --mode llm" : ""} --apply`,
    params: (request) => `${request.mode ?? "algo"} · ${request.candidate.targets.length} file(s)`,
    summary(record, result) {
      const { payload } = result;
      const done = payload.files.filter((file) => file.state === "completed").length;
      const outcome =
        done === payload.files.length
          ? `${done} file(s) written`
          : payload.refused.length > 0
            ? "refused, nothing written"
            : done === 0
              ? `${record.status}, nothing written`
              : `${done} of ${payload.files.length} file(s) written, ${record.status}`;
      return `${outcome}${codeOf(result.exitCode)}`;
    },
    rows(_state, _record, result, view) {
      // Each file of the candidate with what happened to it: written, failed with its error, not attempted.
      const { payload } = result;
      return [
        { text: `Apply spec-to-code candidate · ${payload.id} → ${payload.files.length} file(s) · written directly, no proposal`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
        ...payload.files.map((file) => ({
          text: `  ${file.role} ${file.file} · ${file.state === "completed" ? "written" : file.state === "failed" ? `failed: ${file.error ?? ""}` : "not attempted"}`,
          style: file.state === "failed" ? ERROR : THEME.panel,
        })),
        { text: "  no test was run and the feature is not marked done; u undoes only the last MERGE, not this write", style: MUTED },
      ];
    },
  },
};
