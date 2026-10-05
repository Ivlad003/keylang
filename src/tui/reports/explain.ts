// Reports of the explanations: offline help and summaries, the model's
// answer for one node, the inventory of what needs explaining and the batch
// of briefs.

import { formatSummary } from "../../explain-node.ts";
import { briefCounts } from "../../explain-inventory.ts";
import type { SavedAnswer } from "../../explain-offline.ts";
import type { ExplainBatchPayload, ExplainBatchRequest, ExplainPlanPayload, ExplainPlanRequest } from "../../operations.ts";
import { THEME } from "../theme.ts";
import { BOLD, codeOf, ERROR, MUTED, outcomeRow, shortId, WARNING, type Report, type ReportItem, type ReportRow } from "./rows.ts";

type ExplainKind = "explain" | "explain-llm" | "explain-plan" | "explain-batch";

/** The CLI command of an inventory: `explain --stale`, `explain --missing --dry-run --limit 3 --jobs 2`. */
function explainPlanLabel(request: ExplainPlanRequest): string {
  if (request.list === "stale-saved") return "explain --stale";
  return [`explain --${request.batch}`, ...(request.estimate === true ? ["--dry-run"] : []), ...(request.limit !== undefined ? ["--limit", String(request.limit)] : []), ...(request.jobs !== undefined ? ["--jobs", String(request.jobs)] : [])].join(" ");
}

/** The CLI command of a batch: `explain --missing --llm --limit 3 --jobs 2`. */
function explainBatchLabel(request: ExplainBatchRequest): string {
  return [`explain --${request.batch} --llm`, ...(request.limit !== undefined ? ["--limit", String(request.limit)] : []), ...(request.jobs !== undefined ? ["--jobs", String(request.jobs)] : [])].join(" ");
}

/** `2 stale, 1 gone of 5 saved explanation(s)`, `nothing to explain: zero work, no request`, `6 brief(s) planned, ~1200 in, ~480 out tokens (approximate)`. */
function explainPlanOutcome(payload: ExplainPlanPayload): string {
  if (payload.list === "stale-saved") {
    const stale = payload.entries.filter((entry) => entry.state === "stale").length;
    return payload.entries.length === 0 ? `every one of ${payload.saved} saved explanation(s) is fresh` : `${stale} stale, ${payload.entries.length - stale} gone of ${payload.saved} saved explanation(s)`;
  }
  if (payload.plan.length === 0) return "nothing to explain: zero work, no request";
  const cut = payload.candidates > payload.plan.length ? ` of ${payload.candidates}` : "";
  return `${payload.plan.length}${cut} brief(s) planned${payload.estimate === null ? "" : `, ~${payload.estimate.input} in, ~${payload.estimate.output} out tokens (approximate)`}`;
}

/** `6 of 6 brief(s) written`, `5 of 6 brief(s) written, 1 failed`, `cancelled: 1 of 6 written, 5 not started`, `outdated: …`. */
function explainBatchOutcome(payload: ExplainBatchPayload): string {
  if (payload.plan.length === 0) return "nothing to explain: zero work, no request";
  const counts = `${payload.done.length} of ${payload.plan.length} brief(s) written${payload.failed.length > 0 ? `, ${payload.failed.length} failed` : ""}${payload.notStarted.length > 0 ? `, ${payload.notStarted.length} not started` : ""}`;
  if (payload.stopped === "cancelled") return `cancelled: ${counts}`;
  if (payload.stopped === "outdated") return `outdated, stopped: ${counts}`;
  if (payload.stopped === "refused") return `refused: ${counts}`;
  return payload.failed.length > 0 ? `partial: ${counts}` : counts;
}

/** What became of one planned node of a batch: `written <file>`, `failed: <reason>`, `not started`. */
function batchState(payload: ExplainBatchPayload, id: string): string {
  const done = payload.done.find((entry) => entry.id === id);
  if (done) return `written ${done.file}`;
  const failed = payload.failed.find((entry) => entry.id === id);
  return failed ? `failed: ${failed.reason}` : "not started";
}

/** A saved answer or brief: its provenance on one row, then its text and the IDs it made up. */
function savedRows(rows: ReportRow[], label: string, saved: SavedAnswer): void {
  rows.push({ text: `── ${label} · ${saved.detail} · ${saved.agent} · ${saved.date} · ${saved.fresh ? "fresh" : "stale: the code changed since"} · ${saved.file} ──`, style: { ...THEME.panel, fg: saved.fresh ? 243 : 179 } });
  for (const line of saved.text.split("\n")) {
    // A `full` answer is in sections: a `##` heading is a bold title row.
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    rows.push(heading ? { text: `  ${heading[1]!}`, style: BOLD } : { text: `  ${line}`, style: THEME.panel });
  }
  if (saved.unknownIds.length > 0) rows.push({ text: `  unknown ids (in no snapshot, no planned; not followed): ${saved.unknownIds.join(", ")}`, style: WARNING });
}

/** The places an explanation links to, each an item Tab selects. */
function linkRows(rows: ReportRow[], links: readonly { file: string | null; text: string }[], selected: number): void {
  if (links.length > 0) rows.push({ text: "── places ──", style: MUTED });
  links.forEach((link, index) => {
    rows.push({ text: `  ${link.text}`, style: index === selected ? THEME.selected : link.file === null ? MUTED : THEME.panel, gap: index });
  });
  if (links.length > 0) rows.push({ text: "  Tab, then ↑↓ select a place and Enter opens it", style: THEME.hint });
}

/** A place an explanation names: the node, a related ID the snapshot or a planned declares, a flow, a rule line. */
function linkItems(links: readonly { file: string | null; line: number; col: number; text: string }[]): ReportItem[] {
  return links.map((link) => ({ file: link.file ?? "", line: link.line, col: link.col, text: link.text }));
}

export const EXPLAIN_REPORTS: { [K in ExplainKind]: Report<K> } = {
  explain: {
    label: (request) => `explain ${request.subject}`,
    params: (request) => request.subject,
    summary(_record, result) {
      const { payload } = result;
      const outcome = payload.subject === "code" ? `${payload.code}: offline help` : `${payload.summary.kind} ${payload.id}: ${payload.saved === null ? "no saved answer" : `saved answer ${payload.saved.fresh ? "fresh" : "stale"}`}`;
      return `${outcome} · code ${result.exitCode}`;
    },
    rows(_state, _record, result, view) {
      // Offline: a code's help, or the node's summary with its saved answer and brief apart, each with its provenance.
      const { payload } = result;
      if (payload.subject === "code") {
        return [
          { text: `Explain · ${payload.code} · offline help of the code · nothing read, nothing written`, style: BOLD },
          outcomeRow(view.summary, true),
          ...payload.text.trimEnd().split("\n").map((line) => ({ text: `  ${line}`, style: THEME.panel })),
        ];
      }
      const rows: ReportRow[] = [
        { text: `Explain · ${payload.id} · offline, no model, nothing written · saved code and specs · snapshot ${shortId(payload.snapshotId)}`, style: BOLD },
        outcomeRow(view.summary, true),
      ];
      for (const message of result.messages) if (message.level === "warning") rows.push({ text: `  ${message.text}`, style: WARNING });
      rows.push({ text: "── the snapshot and the specs (doc: is the code's documentation comment) ──", style: MUTED });
      for (const line of formatSummary(payload.summary).split("\n")) rows.push({ text: `  ${line}`, style: THEME.panel });
      if (payload.saved !== null) savedRows(rows, "saved answer", payload.saved);
      else rows.push({ text: `  no saved ${payload.detail === "brief" ? "brief" : "answer"}: keylang explain ${payload.id} --llm${payload.detail === "brief" ? " --brief" : ""} asks the model; nothing here does`, style: MUTED });
      if (payload.brief !== null) savedRows(rows, "saved brief (the explained map)", payload.brief);
      linkRows(rows, payload.links, view.selected);
      return rows;
    },
    items: { noun: "place", of: (_state, result) => (result.payload.subject === "node" ? linkItems(result.payload.links) : []) },
  },
  "explain-llm": {
    label: (request) => `explain ${request.id} --llm${request.detail === "full" ? " --full" : request.detail === "brief" ? " --brief" : ""}`,
    params: (request) => `${request.detail ?? "default detail"} · ${request.id}`,
    summary(_record, result) {
      const { payload } = result;
      const what = `${payload.summary.kind} ${payload.id}`;
      const outcome =
        payload.source === "cache"
          ? `${what}: the fresh saved ${payload.detail} answer, no request`
          : payload.source === "offline"
            ? `${what}: no model, nothing asked; ${payload.answer === null ? "no saved answer" : `saved answer ${payload.answer.fresh ? "fresh" : "stale"}`}`
            : payload.written !== null
              ? `${what}: new ${payload.detail} answer saved to ${payload.written}`
              : payload.refused.length > 0
                ? `${what}: refused, nothing written`
                : `${what}: the model failed, nothing written`;
      return `${outcome}${codeOf(result.exitCode)}`;
    },
    rows(_state, _record, result, view) {
      // The model's answer with where it came from (cache, model, none), the summary it was asked about, and what was written.
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Explain with the model · ${payload.id} · ${payload.detail} · lang ${payload.lang} · agent ${payload.agent ?? "none"} · saved code and specs · snapshot ${shortId(payload.snapshotId)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
      ];
      const why = payload.reason === "missing" ? "no saved answer" : payload.reason === "stale" ? "the saved answer was stale" : payload.reason === "lang" ? `the saved answer was in ${payload.previous?.lang ?? "another language"}` : payload.reason === "detail" ? `the saved answer was ${payload.previous?.detail ?? "another detail"}` : null;
      if (payload.source === "cache") rows.push({ text: "  read from the saved file: fresh, same detail and language; the model was not asked, nothing was written", style: MUTED });
      if (payload.source === "model" && why !== null) rows.push({ text: `  ${why}: the model was asked once${payload.written === null ? "" : `; the map is not written (the explained map follows keylang map)`}`, style: MUTED });
      for (const message of result.messages) if (message.level !== "info") rows.push({ text: `  ${message.text}`, style: message.level === "error" ? ERROR : WARNING });
      rows.push({ text: "── the snapshot and the specs (doc: is the code's documentation comment) ──", style: MUTED });
      for (const line of formatSummary(payload.summary).split("\n")) rows.push({ text: `  ${line}`, style: THEME.panel });
      if (payload.source === "model" && payload.answer !== null) savedRows(rows, payload.written === null ? "the model's answer, not written" : "new answer, saved", payload.answer);
      if (payload.source === "model" && payload.written === null) {
        if (payload.previous !== null) savedRows(rows, "saved answer, kept", payload.previous);
        else rows.push({ text: "  no saved answer: nothing was written", style: MUTED });
      }
      if (payload.source !== "model") {
        if (payload.answer !== null) savedRows(rows, payload.source === "cache" ? "saved answer, read" : "saved answer", payload.answer);
        else rows.push({ text: "  no saved answer", style: MUTED });
      }
      linkRows(rows, payload.links, view.selected);
      return rows;
    },
    items: { noun: "place", of: (_state, result) => linkItems(result.payload.links) },
  },
  "explain-plan": {
    label: explainPlanLabel,
    params: explainPlanLabel,
    summary: (_record, result) => `${explainPlanOutcome(result.payload)} · code ${result.exitCode}`,
    rows(_state, _record, result, view) {
      // What needs explaining: the stale and gone saved explanations, or a brief plan in waves with its approximate size; Tab, then Enter opens a known node.
      const { payload } = result;
      const snapshot = `snapshot ${shortId(payload.snapshotId)}`;
      const place = (where: { file: string; line: number } | null): string => (where === null ? "" : `  ${where.file}:${where.line}`);
      const rows: ReportRow[] = [];
      if (payload.list === "stale-saved") {
        rows.push({ text: `Explanations to do · stale saved answers and briefs (keylang explain --stale) · no model, nothing written · saved code and specs · ${snapshot}`, style: BOLD });
        rows.push(outcomeRow(view.summary, true));
        for (const message of result.messages) if (message.level === "warning") rows.push({ text: `  ${message.text}`, style: WARNING });
        rows.push({ text: "  the saved explanations themselves, not the brief plan: a stale one is asked again by its command; a gone id is only listed, nothing generates it", style: MUTED });
        payload.entries.forEach((entry, index) => {
          const what = `${entry.id}${entry.kind === "brief" ? " (brief)" : ""}`;
          const text = entry.state === "gone" ? `${what}: gone (explained ${entry.date}) · ${entry.file} · not in the snapshot, not planned` : `${what}: stale (explained ${entry.date}) · ${entry.again}${place(entry.place)}`;
          rows.push({ text: `  ${text}`, style: index === view.selected ? THEME.selected : entry.state === "gone" ? MUTED : THEME.panel, gap: index });
        });
      } else {
        const command = `keylang explain --${payload.batch}${payload.estimate === null ? "" : " --dry-run"}${payload.limit === null ? "" : ` --limit ${payload.limit}`} --jobs ${payload.jobs}`;
        rows.push({ text: `Explanations to do · brief plan: ${payload.batch === "missing" ? "missing and stale briefs" : "stale briefs only"} (${command}) · a preview: no model, nothing written · ${snapshot}`, style: BOLD });
        rows.push(outcomeRow(view.summary, true));
        for (const message of result.messages) if (message.level === "warning") rows.push({ text: `  ${message.text}`, style: WARNING });
        const { counts } = payload;
        rows.push({ text: `  ${briefCounts(counts)} · ${payload.waves.length} wave(s) bottom-up · jobs ${payload.jobs} · limit ${payload.limit ?? "none"}${payload.candidates > payload.plan.length ? ` (${payload.candidates - payload.plan.length} more left out)` : ""}`, style: THEME.panel });
        if (payload.estimate !== null) rows.push({ text: `  approximate tokens: ~${payload.estimate.input} in, ~${payload.estimate.output} out — about 4 characters a token and 80 a brief; not the API's count or cost`, style: THEME.panel });
        rows.push({ text: `  left out: ${payload.skipped.documented} node(s) with a doc comment, ${payload.skipped.fresh} with a fresh brief${payload.gone.length > 0 ? ` · gone, never asked for: ${payload.gone.join(", ")}` : ""}`, style: MUTED });
        rows.push({ text: "  a preview, not a permission: the batch (the form's last row, or keylang explain --missing --llm) plans again on its own analysis", style: MUTED });
        let index = 0;
        payload.waves.forEach((wave, number) => {
          rows.push({ text: `── wave ${number + 1} · ${wave.level} · ${wave.ids.length} ──`, style: MUTED });
          for (const id of wave.ids) {
            const entry = payload.plan[index]!;
            rows.push({ text: `  ${id} (${entry.level}) · ${entry.reason === "stale" ? "stale brief" : "no brief"}${place(entry.place)}`, style: index === view.selected ? THEME.selected : entry.place === null ? MUTED : THEME.panel, gap: index });
            index++;
          }
        });
        if (payload.plan.length === 0) rows.push({ text: "  zero work: no node needs a brief; no request would be made", style: THEME.panel });
      }
      const listed = payload.list === "stale-saved" ? payload.entries.length : payload.plan.length;
      if (listed > 0) rows.push({ text: "  Tab, then ↑↓ select a node and Enter opens its code", style: THEME.hint });
      return rows;
    },
    items: {
      noun: "node",
      // A node the inventory lists: its code (or its planned line); a gone ID has no place.
      of(_state, result) {
        const { payload } = result;
        const entries = payload.list === "stale-saved" ? payload.entries.map((entry) => ({ place: entry.place, text: `${entry.id}${entry.kind === "brief" ? " (brief)" : ""}: ${entry.state}` })) : payload.plan.map((entry) => ({ place: entry.place, text: `${entry.id} (${entry.level}): ${entry.reason}` }));
        return entries.map(({ place, text }) => ({ file: place?.file ?? "", line: place?.line ?? 1, col: place?.col ?? 1, text }));
      },
    },
  },
  "explain-batch": {
    label: explainBatchLabel,
    params: explainBatchLabel,
    summary: (_record, result) => `${explainBatchOutcome(result.payload)}${codeOf(result.exitCode)}`,
    rows(_state, _record, result, view) {
      // A batch: what it planned, what landed, what failed with why, what was never asked; Tab, then Enter opens a node.
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Explain briefs with the model · keylang ${explainBatchLabel({ kind: "explain-batch", root: "", batch: payload.batch, ...(payload.limit !== null ? { limit: payload.limit } : {}), jobs: payload.jobs })} · lang ${payload.lang} · agent ${payload.agent || "none"} · snapshot ${shortId(payload.snapshotId)}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
      ];
      if (payload.stopped === "cancelled") rows.push({ text: "  cancelled: no request was started after it, the ones in flight were closed; the briefs written before stay (no rollback)", style: WARNING });
      if (payload.stopped === "outdated") rows.push({ text: "  the inputs changed while the batch ran: nothing was asked for or written after it; the briefs written before stay — run the batch again", style: WARNING });
      if (payload.stopped === "refused") rows.push({ text: "  the session refused the write: nothing was written", style: WARNING });
      for (const message of result.messages) if (message.level === "warning" || (message.level === "error" && payload.refused.includes(message.text))) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? ERROR : WARNING });
      if (payload.plan.length > 0) rows.push({ text: `  ${payload.plan.length} planned · ${payload.done.length} written · ${payload.failed.length} failed · ${payload.notStarted.length} not started · jobs ${payload.jobs} · limit ${payload.limit ?? "none"} · a run again asks only for what is still missing or stale`, style: MUTED });
      let wave: number | null = null;
      payload.plan.forEach((entry, index) => {
        if (entry.wave !== wave) rows.push({ text: `── ${entry.level} ──`, style: MUTED });
        wave = entry.wave;
        const now = batchState(payload, entry.id);
        const style = index === view.selected ? THEME.selected : now.startsWith("failed") ? ERROR : now === "not started" ? MUTED : THEME.panel;
        rows.push({ text: `  ${entry.id} (${entry.level}) · ${now}`, style, gap: index });
      });
      if (payload.plan.length === 0) rows.push({ text: "  zero work: no node needs a brief; no request was made", style: THEME.panel });
      if (payload.plan.length > 0) rows.push({ text: "  Tab, then ↑↓ select a node and Enter opens its code", style: THEME.hint });
      return rows;
    },
    items: {
      noun: "node",
      // A node of the batch's plan, with what became of it.
      of: (_state, result) => result.payload.plan.map((entry) => ({ file: entry.place?.file ?? "", line: entry.place?.line ?? 1, col: entry.place?.col ?? 1, text: `${entry.id} (${entry.level}): ${batchState(result.payload, entry.id)}` })),
    },
  },
};
