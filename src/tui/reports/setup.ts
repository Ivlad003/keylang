// Reports of the operations that set a repository up and keep its generated
// files: doctor, map check, map, baseline, agents, init, fmt and wire.

import { WIRE_OUT, type AgentsPayload, type AgentsRequest, type BaselinePayload, type FmtFile, type FmtPayload, type GitignoreStage, type InitPayload, type MapCheckPayload, type MapPayload, type OperationResult, type WirePayload } from "../../operations.ts";
import type { OperationRecord } from "../state.ts";
import { THEME } from "../theme.ts";
import { BOLD, codeOf, ERROR, messageRow, MUTED, outcomeRow, WARNING, type Done, type Report, type ReportRow, type ReportView } from "./rows.ts";

type SetupKind = "doctor" | "map-check" | "map" | "baseline" | "agents" | "init" | "fmt" | "wire";

/** `write`, `check`: the mode a setup form ran in. */
function mode(check: boolean): string {
  return check ? "check" : "write";
}

/** `auto`, `none`, `claude, codex`: the selection as requested. */
function choiceText(choice: AgentsRequest["harnesses"]): string {
  return typeof choice === "string" ? choice : choice.join(", ");
}

/** The map's warnings and its counts, under a map check or a map write. */
function mapTail(rows: ReportRow[], payload: MapCheckPayload | MapPayload): void {
  for (const warning of payload.warnings) rows.push({ text: `  warning: ${warning}`, style: WARNING });
  const stats = payload.stats;
  rows.push({ text: `${stats.files} file(s), ${stats.modules} module(s), ${stats.fns} fn, ${stats.types} type(s), ${stats.deps} dep(s)`, style: MUTED });
}

export const SETUP_REPORTS: { [K in SetupKind]: Report<K> } = {
  doctor: {
    label: () => "doctor",
    rows: (_state, _record, result) => result.messages.map(messageRow),
  },
  "map-check": {
    label: () => "map check",
    summary: (_record, result) => `${mapCheckOutcome(result.payload)} · code ${result.exitCode}`,
    rows(_state, record, result, view) {
      // Nothing was written: the check compares a fresh render with the files on disk.
      const { payload } = result;
      const clean = payload.conflicts.length === 0 && payload.stale.length === 0;
      const rows: ReportRow[] = [{ text: `Map check · read-only, nothing written · snapshot ${payload.snapshot.slice(0, 8)}`, style: BOLD }, outcomeRow(view.summary, clean)];
      for (const file of payload.conflicts) rows.push({ text: `  conflict ${file}: manual file without keylang:generated marker`, style: THEME.panel });
      for (const file of payload.stale) rows.push({ text: `  stale    ${file}${payload.conflicts.length > 0 ? " (after the conflicts are resolved)" : ""}`, style: THEME.panel });
      mapTail(rows, payload);
      return rows;
    },
  },
  map: {
    label: () => "map write",
    summary: (record, result) => `${mapOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, record, result, view) {
      // What landed on disk, step by step: a partial commit is named as partial, nothing is rolled back.
      const { payload } = result;
      const ok = record.status === "completed" && result.exitCode === 0;
      const rows: ReportRow[] = [{ text: `Map write · generated files only · snapshot ${payload.snapshot.slice(0, 8)}`, style: BOLD }, outcomeRow(view.summary, ok)];
      for (const file of payload.conflicts) rows.push({ text: `  conflict ${file}: manual file without keylang:generated marker`, style: THEME.panel });
      for (const line of payload.refused) rows.push({ text: `  refused  ${line}`, style: THEME.panel });
      if (payload.refused.length > 0) rows.push({ text: "  nothing was written · Enter computes the map again", style: THEME.hint });
      const state = { completed: "", failed: "failed ", "not-attempted": "not attempted " } as const;
      for (const step of payload.steps) {
        const verb = step.action === "write" ? "written" : "removed";
        const text = step.state === "completed" ? `  ${verb.padEnd(8)} ${step.path}` : `  ${state[step.state]}${step.path}${step.error === undefined ? "" : `: ${step.error}`}`;
        rows.push({ text, style: step.state === "failed" ? ERROR : step.state === "not-attempted" ? MUTED : THEME.panel });
      }
      if (payload.steps.length === 0 && payload.conflicts.length === 0 && payload.refused.length === 0 && record.status === "cancelled") rows.push({ text: "  cancelled before writing: nothing written", style: THEME.panel });
      mapTail(rows, payload);
      return rows;
    },
  },
  baseline: {
    label: (request) => (request.check ? "baseline check" : "baseline write"),
    params: (request) => mode(request.check),
    summary: (record, result) => `${baselineOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, record, result, view) {
      // The allowed architecture as rule lines: what the new baseline adds and drops against the file on disk.
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Baseline ${payload.check ? "check · read-only, nothing written" : "write"} · ${payload.file} · snapshot ${payload.snapshot.slice(0, 8)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
      ];
      if (payload.refused.length > 0) rows.push({ text: "  Enter computes the baseline again", style: THEME.hint });
      if (payload.state !== "manual" && (payload.added.length > 0 || payload.removed.length > 0)) {
        rows.push({ text: payload.written ? "Allowed dependencies changed:" : "The current graph would change the allowed dependencies:", style: MUTED });
        for (const line of payload.added) rows.push({ text: `  + ${line}`, style: THEME.panel });
        for (const line of payload.removed) rows.push({ text: `  - ${line}`, style: THEME.panel });
      }
      return rows;
    },
  },
  agents: {
    label: (request) => (request.check ? "agents check" : "agents write"),
    params: (request) => `${mode(request.check)} · ${choiceText(request.harnesses)}`,
    summary: (record, result) => `${agentsOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, record, result, view) {
      // Managed files only: the report names the selection, the pinned version and each file; setting up is not a test of the client.
      const { payload } = result;
      const who = payload.choice === "list" ? payload.harnesses.join(", ") : `${payload.choice}${payload.choice === "auto" ? ` → ${payload.harnesses.join(", ") || "no harness detected"}` : ""}`;
      const rows: ReportRow[] = [
        { text: `Agents ${payload.check ? "check · read-only, nothing written" : "write"} · ${who} · keylang@${payload.version}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
      ];
      if (payload.error !== null) rows.push({ text: `  ${payload.error.file}: ${payload.error.message}`, style: ERROR });
      for (const line of payload.refused) rows.push({ text: `  refused  ${line}`, style: THEME.panel });
      if (payload.refused.length > 0) rows.push({ text: "  nothing was written · Enter plans again", style: THEME.hint });
      const steps = new Map(payload.steps.map((step) => [step.path, step]));
      for (const file of payload.files) {
        const step = steps.get(file.path);
        const verb = file.action === "write" ? "written" : "removed";
        const state =
          file.action === "keep"
            ? "current"
            : payload.check || payload.refused.length > 0
              ? "stale"
              : step === undefined || step.state === "not-attempted"
                ? `not ${verb}`
                : step.state === "failed"
                  ? "failed"
                  : verb;
        const style = step?.state === "failed" ? ERROR : file.action === "keep" ? MUTED : THEME.panel;
        rows.push({ text: `  ${state.padEnd(11)} ${file.category.padEnd(12)} ${file.path}${step?.error === undefined ? "" : `: ${step.error}`}`, style });
      }
      if (payload.steps.length === 0 && payload.refused.length === 0 && record.status === "cancelled") rows.push({ text: "  cancelled before writing: nothing written", style: THEME.panel });
      rows.push({ text: "Files only: no client is started or tested.", style: MUTED });
      return rows;
    },
  },
  init: {
    label: (request) => (request.check ? "init check" : "init"),
    params: (request) => `${mode(request.check)} · ${choiceText(request.harnesses)}`,
    summary: (record, result) => `${initOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows: initRows,
  },
  fmt: {
    label: (request) => (request.check ? "fmt check" : "fmt write"),
    params: (request) => `${mode(request.check)} · ${request.paths.join(" ")}`,
    summary: (record, result) => `${fmtOutcome(record.status, result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, record, result, view) {
      // Every file of the selection with what happened to it; a failure never hides the files already written.
      const { payload } = result;
      const rows: ReportRow[] = [{ text: `Fmt ${payload.check ? "check · read-only, nothing written" : "write"} · ${payload.files.length} file(s)`, style: BOLD }, outcomeRow(view.summary, result.exitCode === 0)];
      const label: Record<FmtFile["state"], string> = {
        current: "canonical",
        stale: payload.check ? "not formatted" : "not written",
        formatted: "formatted",
        invalid: "invalid",
        explanation: "skipped",
        generated: "skipped",
        unreadable: "unreadable",
        failed: "not written",
        "not-attempted": "not written",
      };
      for (const file of payload.files) {
        const why = file.state === "explanation" ? ": a saved explanation, not keylang Markdown" : file.state === "generated" ? ": a generated file, its generator writes it" : file.state === "not-attempted" ? ": cancelled before it" : file.error === undefined ? "" : `: ${file.error}`;
        const bad = file.state === "failed" || file.state === "unreadable" || file.state === "invalid";
        rows.push({ text: `  ${label[file.state].padEnd(13)} ${file.path}${why}`, style: bad ? ERROR : file.state === "current" || file.state === "explanation" || file.state === "generated" ? MUTED : THEME.panel });
        for (const d of file.diagnostics ?? []) rows.push({ text: `    ${d.span.start.line}:${d.span.start.col} ${d.code} ${d.message}`, style: ERROR });
      }
      // A message about no one file (the commit could not start) is shown as it is.
      for (const message of result.messages) if (!payload.files.some((file) => message.text.startsWith(`${file.shown}:`))) rows.push({ text: `  ${message.text}`, style: ERROR });
      return rows;
    },
  },
  wire: {
    label: (request) => (request.check ? "wire check" : "wire write"),
    params: (request) => `${mode(request.check)} · ${request.out ?? WIRE_OUT}`,
    summary: (record, result) => `${wireOutcome(record.status, result.payload, result.exitCode)}${codeOf(result.exitCode)}`,
    rows(_state, record, result, view) {
      // The generated file with what happened to it; the code itself opens read-only on Enter.
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Wire ${payload.check ? "check · read-only, nothing written" : "write"} · ${payload.file} · snapshot ${payload.snapshot.slice(0, 8)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
      ];
      if (payload.refused.length > 0) rows.push({ text: "  Enter on the entry generates it again", style: THEME.hint });
      if (payload.diagnostics.length > 0) rows.push({ text: "  Tab, then Enter opens the first error", style: THEME.hint });
      else if (payload.state !== "blocked" && (payload.written || payload.state !== "stale")) rows.push({ text: `  Tab, then Enter shows ${payload.file} read-only · never compiled or run here`, style: THEME.hint });
      return rows;
    },
  },
};

/** Init stage by stage, each with what it really did; a partial init is named as partial and nothing is rolled back. */
function initRows(_state: unknown, record: OperationRecord, result: Done<"init">, view: ReportView): ReportRow[] {
  const { payload } = result;
  const ok = record.status === "completed" && result.exitCode === 0;
  const rows: ReportRow[] = [
    { text: `Init ${payload.check ? "check (as init --check) · read-only, nothing written" : "write"} · ${payload.languages.join(", ")}`, style: BOLD },
    outcomeRow(view.summary, ok),
  ];
  const stageRow = (name: string, text: string, failed: boolean): void => {
    rows.push({ text: `  ${name.padEnd(13)} ${text}`, style: failed ? ERROR : THEME.panel });
  };
  const notRun = payload.config.error !== null || record.status !== "cancelled" ? "not run" : "not run (cancelled)";
  // `.gitignore` is a file stage of init itself, not an operation: no code of its own, its reason on the row.
  const gitignoreRow = (): void => {
    const stage = payload.gitignore;
    if (stage === null) stageRow(".gitignore", notRun, false);
    else stageRow(stage.file, gitignoreOutcome(stage, payload.check), gitignoreFailed(stage));
  };
  if (payload.preflight?.status === "failed") {
    stageRow("harness plan", `${payload.preflight.messages.map((message) => message.text).join("; ")}${codeOf(payload.preflight.exitCode)}`, true);
    rows.push({ text: "  checked before any write: nothing was written, keylang.json included", style: THEME.hint });
  } else if (!payload.check) {
    const config = payload.config;
    stageRow(config.file, config.existed ? "kept as it is" : config.written ? `written (layers: ${config.layers.join(", ")})` : config.error !== null ? `failed: ${config.error}` : "not written", config.error !== null);
    for (const note of config.notes) rows.push({ text: `    note: ${note}`, style: MUTED });
    gitignoreRow();
  }
  const stages: { name: string; result: OperationResult | null }[] = payload.check
    ? [
        { name: "agents", result: payload.agents },
        { name: "baseline", result: payload.baseline },
      ]
    : payload.preflight?.status === "failed"
      ? []
      : initStages(payload);
  for (const { name, result: stage } of stages) {
    if (stage === null) {
      stageRow(name, notRun, false);
      continue;
    }
    const outcome =
      stage.kind === "map" && stage.payload !== null
        ? mapOutcome(stage.status, stage.payload)
        : stage.kind === "baseline" && stage.payload !== null
          ? baselineOutcome(stage.status, stage.payload)
          : stage.kind === "agents" && stage.payload !== null
            ? agentsOutcome(stage.status, stage.payload)
            : stage.status;
    stageRow(name, `${outcome}${codeOf(stage.exitCode)}`, stage.exitCode !== 0);
    for (const message of stage.messages) if (message.level === "error") rows.push({ text: `    ${message.text}`, style: ERROR });
    if (stage.kind === "map") for (const line of stage.payload?.refused ?? []) rows.push({ text: `    refused ${line}`, style: THEME.panel });
    for (const step of stage.kind === "map" || stage.kind === "agents" ? (stage.payload?.steps ?? []) : []) {
      if (step.state === "failed") rows.push({ text: `    failed ${step.path}${step.error === undefined ? "" : `: ${step.error}`}`, style: ERROR });
      else if (step.state === "not-attempted") rows.push({ text: `    not attempted ${step.path}`, style: MUTED });
    }
  }
  if (payload.check) gitignoreRow();
  rows.push({ text: `written: ${result.written.length} file(s)${result.removed.length > 0 ? `, removed: ${result.removed.length}` : ""}`, style: MUTED });
  if (payload.check) rows.push({ text: "The map is not part of init --check: Map: check compares it.", style: MUTED });
  else if (!ok) rows.push({ text: "  Enter runs init again: a kept keylang.json and hand-written files stay as they are", style: THEME.hint });
  rows.push({ text: "Files only: no harness client is started or tested.", style: MUTED });
  return rows;
}

/** `written`, `up to date`, `stale`, `2 error(s) in wiring`, `manual file`, `inputs changed, nothing written`: what wire found and really did. */
function wireOutcome(status: OperationRecord["status"], payload: WirePayload, exitCode: 0 | 1 | 2 | null): string {
  if (payload.state === "blocked") return `${payload.diagnostics.length} error(s) in wiring, nothing written`;
  if (payload.state === "manual") return "manual file, not written";
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  if (payload.error !== null) return "write failed";
  if (exitCode === 2) return "not generated";
  if (status === "cancelled") return "cancelled, nothing written";
  if (payload.written) return "written";
  return payload.state === "current" ? "up to date" : payload.check ? "stale" : "not written";
}

/** `3 file(s) canonical`, `2 not formatted`, `1 formatted, 1 invalid`, `1 of 2 formatted, cancelled`: what fmt found and really did. */
function fmtOutcome(status: OperationRecord["status"], payload: FmtPayload): string {
  const count = (state: FmtFile["state"]): number => payload.files.filter((file) => file.state === state).length;
  const parts: string[] = [];
  const planned = count("formatted") + count("failed") + count("not-attempted");
  if (status === "cancelled" && planned > 0) parts.push(`${count("formatted")} of ${planned} formatted, cancelled`);
  else if (count("formatted") > 0) parts.push(`${count("formatted")} formatted`);
  if (count("stale") > 0) parts.push(`${count("stale")} not formatted`);
  if (count("invalid") > 0) parts.push(`${count("invalid")} invalid`);
  if (count("failed") > 0) parts.push(`${count("failed")} not written`);
  if (count("unreadable") > 0) parts.push(`${count("unreadable")} unreadable`);
  if (parts.length === 0) parts.push(payload.files.length === 0 ? "no Markdown files" : `${count("current")} file(s) canonical`);
  return parts.join(", ");
}

/** `up to date`, `2 stale`, `3 written, 1 removed`, `broken file, nothing written`, `2 of 4 step(s) done, failed`. */
function agentsOutcome(status: OperationRecord["status"], payload: AgentsPayload): string {
  if (payload.error !== null) return `${payload.error.file} is broken, nothing written`;
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  const changed = payload.files.filter((file) => file.action !== "keep").length;
  if (payload.check || changed === 0) return changed === 0 ? "up to date" : `${changed} stale`;
  const done = payload.steps.filter((step) => step.state === "completed");
  if (status === "completed") {
    const written = done.filter((step) => step.action === "write").length;
    const removed = done.length - written;
    return `${written} written${removed > 0 ? `, ${removed} removed` : ""}`;
  }
  return `${done.length} of ${payload.steps.length} step(s) done, ${status}`;
}

/**
 * `set up`, `partial: map failed`, `keylang.json not written`, `cancelled
 * after map`, or a check's three stages: never a success for a partial run.
 * A completed write names the stages with their own reports; `.gitignore`
 * is named once it failed or did not run.
 */
function initOutcome(status: OperationRecord["status"], payload: InitPayload): string {
  if (payload.preflight !== null && payload.preflight.status === "failed" && payload.preflight.payload !== null) return agentsOutcome(payload.preflight.status, payload.preflight.payload);
  if (payload.check) {
    const agents = payload.agents?.payload ? `harness files ${agentsOutcome(payload.agents.status, payload.agents.payload)}` : "harness files not checked";
    const baseline = payload.baseline?.payload ? `baseline ${baselineOutcome(payload.baseline.status, payload.baseline.payload)}` : payload.baseline ? "baseline not checked" : "";
    const ignore = payload.gitignore === null ? "" : `.gitignore ${gitignoreOutcome(payload.gitignore, true)}`;
    return [agents, baseline, ignore].filter((part) => part !== "").join(", ");
  }
  if (payload.config.error !== null) return "keylang.json not written, nothing else attempted";
  const stages = initStages(payload);
  if (status === "completed") return `set up: ${stages.map((stage) => stage.name).join(", ")}`;
  const ignore = payload.gitignore;
  const bad = [...(ignore !== null && gitignoreFailed(ignore) ? [".gitignore"] : []), ...stages.filter((stage) => stage.result !== null && stage.result.exitCode !== 0).map((stage) => stage.name)];
  const missing = [...(ignore === null ? [".gitignore"] : []), ...stages.filter((stage) => stage.result === null).map((stage) => stage.name)];
  if (status === "cancelled") return `cancelled${missing.length > 0 ? `, not run: ${missing.join(", ")}` : ""}`;
  return `partial: ${bad.join(", ")} did not finish`;
}

/** What init's `.gitignore` stage found or did: `lists .keylang/`, `.keylang/ added`, `does not list .keylang/`, a refusal or an I/O error. */
function gitignoreOutcome(stage: GitignoreStage, check: boolean): string {
  if (stage.error !== null) return `failed: ${stage.error}`;
  if (stage.refused !== null) return `${check ? "not read" : ".keylang/ not added"} (${stage.refused})`;
  if (stage.written) return ".keylang/ added";
  return stage.listed ? "lists .keylang/" : "does not list .keylang/";
}

/** The stage keeps init from code 0: an I/O error, a refusal, or no `.keylang/` line (a check). */
function gitignoreFailed(stage: GitignoreStage): boolean {
  return stage.error !== null || stage.refused !== null || !stage.listed;
}

/** The stages of an init write, in the order they ran. */
function initStages(payload: InitPayload): { name: string; result: OperationResult | null }[] {
  return [
    { name: "map", result: payload.map },
    { name: "baseline", result: payload.baseline },
    { name: "agents", result: payload.agents },
  ];
}

/** `3 written, 1 removed`, `1 conflict(s), nothing written`, `2 of 5 done, failed` — what a map write really did. */
function mapOutcome(status: OperationRecord["status"], payload: MapPayload): string {
  if (payload.conflicts.length > 0) return `${payload.conflicts.length} conflict(s), nothing written`;
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  const done = payload.steps.filter((step) => step.state === "completed");
  if (status === "completed") {
    const written = done.filter((step) => step.action === "write").length;
    const removed = done.length - written;
    return `${written} written${removed > 0 ? `, ${removed} removed` : ""}`;
  }
  return `${done.length} of ${payload.steps.length} step(s) done, ${status}`;
}

/** `up to date`, `stale`, `written`, `manual file, nothing written`, `inputs changed, nothing written`. */
function baselineOutcome(status: OperationRecord["status"], payload: BaselinePayload): string {
  if (payload.state === "manual") return payload.check ? "manual file" : "manual file, nothing written";
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  if (payload.error !== null) return "write failed, nothing written";
  if (payload.written) return "written";
  if (payload.state === "current") return "up to date";
  return payload.check ? "stale" : `${status}, nothing written`;
}

/** `up to date`, `3 stale`, `1 conflict(s)` (conflicts first: they block `keylang map`). */
function mapCheckOutcome(payload: MapCheckPayload): string {
  if (payload.conflicts.length > 0) return `${payload.conflicts.length} conflict(s)${payload.stale.length > 0 ? `, ${payload.stale.length} stale` : ""}`;
  return payload.stale.length > 0 ? `${payload.stale.length} stale` : "up to date";
}
