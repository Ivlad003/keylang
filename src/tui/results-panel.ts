// The F6 panel's keys: the pinned current analysis with its findings and
// filters, and the history of operation records — their reports, the items
// Tab selects in them, a rerun, an export, a proposal opened in MERGE. A
// finding's or an item's place is shown with the panel hidden, and Esc or
// Ctrl+O come back to the panel at the selection. view.ts draws the panel;
// reports/ say what each kind of record shows.

import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { CheckResult } from "../check-results.ts";
import type { OperationRequest } from "../operations.ts";
import { PROPOSALS_DIR } from "../proposals.ts";
import { bufferLines } from "./buffer.ts";
import { FILTER_KEYS, findingsOf, visibleFindings } from "./findings.ts";
import type { KeyEvent } from "./input.ts";
import { featureItems } from "./reports/check.ts";
import { reportItems, resultsReportRows } from "./reports/records.ts";
import type { ReportItem } from "./reports/rows.ts";
import type { Buffer, Cursor, OperationRecord, State } from "./state.ts";
import { findingsListRows, layout, reportOverflow, resultsSplit } from "./view.ts";
import { clusterAt } from "./width.ts";

/** Cells ←→ scroll a report sideways. */
const SIDE_STEP = 16;

/** What the F6 panel needs from the session: the operations its keys run, and the editor and viewer that show a place. */
export interface ResultsHost {
  readonly state: State;
  reanalyze(): void;
  quit(): void;
  requestOperation(action: string, request: OperationRequest): void;
  cancelOperation(): void;
  /** MERGE of the proposal for `path`, checked again first. */
  openMerge(path: string): void;
  openProposals(prefer: readonly string[]): void;
  /** A layout draft's layers into keylang.json's buffer. */
  moveLayers(record: OperationRecord): void;
  /** A spec-to-code candidate applied whole, after its save step. */
  applyCandidate(record: OperationRecord | undefined): void;
  askFeatureQuestions(slug: string): void;
  /** The export form of the selected report. */
  openExport(): void;
  /** The spec-to-code form for a planned fn. */
  openSpecCode(id: string): void;
  plannedFns(): string[];
  load(path: string): Buffer;
  open(path: string, cursor: Cursor, remember?: boolean): void;
  /** A code line in the read-only viewer; false when it cannot be shown. */
  showCode(rel: string, abs: string, line: number): boolean;
  clampCursor(): void;
}

export class ResultsPanel {
  private readonly host: ResultsHost;

  constructor(host: ResultsHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** F6 or the palette: the pinned current analysis and the history of operation records. */
  openResults(): void {
    const results = this.state.results;
    // Already open: keep the current selection — re-entering must not capture a stale focus or reset the record.
    if (results.open) return;
    results.open = true;
    results.previousFocus = this.state.focus;
    results.scrollReport = false;
    results.viewing = false;
    results.top = 0;
    results.left = 0;
    // The pinned "Current analysis" is the first entry; with records, the newest one stays selected as before.
    results.entry = this.state.records.length > 0 ? "record" : "analysis";
    results.index = Math.max(0, this.state.records.length - 1);
    this.clampFinding();
    this.state.focus = "results";
  }

  /** Esc closes the panel, not the running operation; the focus goes back where F6 was pressed. */
  closeResults(): void {
    this.state.results.open = false;
    this.state.results.scrollReport = false;
    this.state.results.viewing = false;
    this.state.results.origin = null;
    this.state.focus = this.state.results.previousFocus;
  }

  /** Enter in the panel: reruns the selected record with its exact parameters. */
  private rerunRecord(): void {
    const record = this.state.records[this.state.results.index];
    if (!record) return;
    if (record.status === "running") {
      this.state.message = "this operation is still running";
      return;
    }
    // An export was made from the target as its form showed it: a new one shows the target again first.
    if (record.params.kind === "export") {
      this.state.message = "export: select the report and press e: the form shows the target again before Save";
      return;
    }
    // A proposed draft: Enter opens its MERGE (checked again: a proposal merged or rewritten since is judged as it is now).
    if ((record.result?.kind === "draft-flow" || record.result?.kind === "draft-rules" || record.result?.kind === "code-to-spec") && record.result.payload?.proposal != null && record.result.payload.candidate !== null) {
      this.closeResults();
      return this.host.openMerge(record.result.payload.candidate.target);
    }
    // The model's questions: Enter opens MERGE of the feature file (checked again, as a draft's).
    if (record.result?.kind === "feature-questions" && record.result.payload?.proposal != null) {
      this.closeResults();
      return this.host.openMerge(record.result.payload.file);
    }
    // Spec-to-code proposes several files: Enter opens the proposals list on the first still waiting, so each merges on its own.
    if (record.result?.kind === "spec-to-code" && (record.result.payload?.proposals.length ?? 0) > 0) {
      this.closeResults();
      return this.host.openProposals(record.result.payload!.proposals.map((store) => store.slice(PROPOSALS_DIR.length + 1)));
    }
    // A current layout draft: Enter moves its layers into keylang.json's buffer; an outdated one drafts again.
    if (record.result?.kind === "draft-layout" && record.result.payload !== null && record.outdated === null) return this.host.moveLayers(record);
    // The same save step as the first run: a feature rerun reads the saved files; doctor reads no specs.
    return this.host.requestOperation(record.action, record.params);
  }

  /** While the panel is open its keys stay with it; Tab switches between the entries and the content. */
  resultsKey(event: KeyEvent): void {
    if (this.state.results.entry === "analysis") return this.findingsKey(event);
    const results = this.state.results;
    const records = this.state.records;
    const page = Math.max(1, layout(this.state).panel.height - 4);
    const select = (next: number): void => {
      results.index = Math.max(0, Math.min(Math.max(0, records.length - 1), next));
      // Each record shows its report from the top; a selection change never keeps a scroll offset of another report.
      results.top = 0;
      results.left = 0;
      results.gap = 0;
    };
    switch (event.name) {
      case "left":
      case "right": {
        // Sideways over the report (after Tab): a long row of an edge, a JSON line or a path is read whole.
        if (!results.scrollReport) return;
        const max = reportOverflow(resultsReportRows(this.state), layout(this.state).panel.width - 4);
        results.left = Math.max(0, Math.min(max, results.left + (event.name === "left" ? -SIDE_STEP : SIDE_STEP)));
        return;
      }
      case "up":
      case "k":
        if (results.scrollReport) return this.scrollReport(-1);
        if (results.index === 0) {
          // The pinned current analysis sits above the records.
          results.entry = "analysis";
          results.top = 0;
          return this.clampFinding();
        }
        return select(results.index - 1);
      case "down":
      case "j":
        if (results.scrollReport) return this.scrollReport(1);
        return select(results.index + 1);
      case "pageup":
        if (results.scrollReport) return this.scrollReport(-page);
        return select(results.index - page);
      case "pagedown":
        if (results.scrollReport) return this.scrollReport(page);
        return select(results.index + page);
      case "tab":
        results.scrollReport = !results.scrollReport;
        if (results.scrollReport) this.showGapReason();
        return;
      case "enter":
        // Over the gaps of a feature record Enter opens the selected gap; over the entries it reruns.
        if (results.scrollReport && this.selectedGap()) return this.openGap();
        // Over a wire report: the generated file in the read-only viewer, or the first blocking error.
        if (results.scrollReport && this.wireTarget()) return this.openWireTarget();
        return this.rerunRecord();
      case "f5":
        return this.host.reanalyze();
      case "f6":
      case "escape":
        return this.closeResults();
      case "x":
        return this.host.cancelOperation();
      case "e":
        return this.host.openExport();
      case "a":
        return this.host.applyCandidate(this.state.records[this.state.results.index]);
      case "g":
        // Over a planned gap of a feature report: the spec-to-code form for the same ID.
        if (results.scrollReport) return this.specCodeForGap();
        return;
      case "m": {
        // On a feature report: the model's open questions for that feature, as a proposal (c4-zoom/11).
        const record = records[results.index];
        if (record?.result?.kind === "feature" && record.params.kind === "feature") return this.host.askFeatureQuestions(record.params.slug);
        return;
      }
      case "q":
        return this.host.quit();
      case "?":
        this.state.help = true;
        return;
      default:
        return;
    }
  }

  /** The keys of the pinned "Current analysis" entry: the findings list with verdict filters. */
  private findingsKey(event: KeyEvent): void {
    const results = this.state.results;
    const page = Math.max(1, findingsListRows(this.state, layout(this.state).panel));
    switch (event.name) {
      case "up":
      case "k":
        if (results.scrollReport) return this.moveFinding(-1);
        return; // The analysis entry is pinned at the top; nothing above it.
      case "down":
      case "j":
        if (results.scrollReport) return this.moveFinding(1);
        if (this.state.records.length > 0) {
          // Below the pinned entry come the records.
          results.entry = "record";
          results.index = 0;
          results.top = 0;
        }
        return;
      case "pageup":
      case "pagedown":
        if (results.scrollReport) return this.moveFinding(event.name === "pageup" ? -page : page);
        return;
      case "tab":
        // Tab switches the arrows between the entries and the findings.
        results.scrollReport = !results.scrollReport;
        return;
      case "enter":
        // Enter opens the selected finding straight away; back in the list the arrows select findings.
        results.scrollReport = true;
        return this.openFinding();
      case "f5":
        return this.host.reanalyze();
      case "f6":
      case "escape":
        return this.closeResults();
      case "x":
        return this.host.cancelOperation();
      case "q":
        return this.host.quit();
      case "?":
        this.state.help = true;
        return;
      default: {
        // The filters hide verdicts; the report itself and its totals stay unchanged.
        const verdict = FILTER_KEYS.get(event.name);
        if (verdict === undefined) return;
        results.filter[verdict] = !results.filter[verdict];
        return this.clampFinding();
      }
    }
  }

  /** Moves the finding selection and keeps it in the visible part of the list. */
  private moveFinding(delta: number): void {
    this.state.results.finding += delta;
    this.clampFinding();
  }

  /** The finding selection stays within the filtered list, and the list scrolls to keep it in view. */
  clampFinding(): void {
    const results = this.state.results;
    const visible = visibleFindings(findingsOf(this.state.analysis), results.filter);
    results.finding = Math.max(0, Math.min(results.finding, Math.max(0, visible.length - 1)));
    const rows = findingsListRows(this.state, layout(this.state).panel);
    if (results.finding < results.top) results.top = results.finding;
    if (results.finding >= results.top + rows) results.top = results.finding - rows + 1;
  }

  /** The finding selected in the filtered list of the current analysis, if any. */
  selectedFinding(): CheckResult | undefined {
    return visibleFindings(findingsOf(this.state.analysis), this.state.results.filter)[this.state.results.finding];
  }

  /**
   * Enter on a finding: the panel hides while the target is shown — a spec
   * position in the editor (the file need not be among the Markdown buffers)
   * or the line in the read-only code viewer. Esc / Ctrl+O return to the list
   * without losing the selection and put back the place it was opened from.
   */
  private openFinding(): void {
    const finding = this.selectedFinding();
    if (finding) this.openTarget(finding.file, finding.line, finding.col);
  }

  /** Shows a spec position (1-based line, code-point column) or a code line with the F6 panel hidden; the origin is kept for the way back. */
  private openTarget(file: string, targetLine: number, targetCol: number): void {
    const results = this.state.results;
    // Leaving MERGE for the target would drop the open hunk decisions.
    if (this.state.mode === "merge") {
      this.state.message = "finish the merge first: it opens after MERGE";
      return;
    }
    const origin = { path: this.state.current, cursor: { ...this.state.cursor }, top: this.state.top, mode: this.state.mode, code: this.state.code };
    const abs = resolve(this.state.root, file);
    if (extname(file) === ".md" && !file.startsWith("..")) {
      const lines = bufferLines(this.host.load(file));
      const line = Math.max(0, Math.min(targetLine - 1, lines.length - 1));
      // Verdict columns are 1-based code points; the cursor counts grapheme clusters.
      const col = clusterAt(lines[line] ?? "", targetCol - 1);
      this.host.open(file, { line, col }, false);
      this.state.code = null;
    } else if (!this.host.showCode(file, abs, targetLine)) {
      return;
    }
    results.viewing = true;
    results.origin = origin;
    this.state.message = `Esc or Ctrl+O: back to the ${results.entry === "analysis" ? "findings list" : "report"} · F6: stay here`;
  }

  /** Back from a finding's target: the list with its selection, over the place the finding was opened from. */
  returnToFindings(): void {
    const results = this.state.results;
    const origin = results.origin;
    results.viewing = false;
    results.origin = null;
    if (!origin) return;
    if (origin.path !== null) {
      this.host.load(origin.path);
      this.state.filesIndex = Math.max(0, this.state.files.indexOf(origin.path));
    }
    this.state.current = origin.path;
    this.state.cursor = { ...origin.cursor };
    this.state.mode = origin.mode;
    this.state.code = origin.code;
    this.state.selection = null;
    this.state.completion = null;
    this.state.hover = null;
    this.host.clampCursor();
    this.state.top = origin.top;
  }

  scrollReport(delta: number): void {
    // Over the findings the selection moves, so it never leaves the shown rows.
    if (this.state.results.entry === "analysis") return this.moveFinding(delta);
    const results = this.state.results;
    const rows = resultsReportRows(this.state);
    const gaps = reportItems(this.state);
    // A parse or trace-plan report is long text under its items: ↑↓ select one, a page or the wheel scrolls the text.
    const kind = this.state.records[results.index]?.kind;
    const scrollText = (kind === "parse" || kind === "trace-plan") && Math.abs(delta) > 1;
    if (gaps.length > 0 && !scrollText) {
      // A feature report: the arrows select a gap, and the report scrolls to keep it in view.
      results.gap = Math.max(0, Math.min(results.gap + delta, gaps.length - 1));
      const row = rows.findIndex((item) => item.gap === results.gap);
      const height = Math.max(1, resultsSplit(this.state, layout(this.state).panel.height).report);
      if (row < results.top) results.top = row;
      if (row >= results.top + height) results.top = row - height + 1;
      return this.showGapReason();
    }
    // The last page ends at the report's last row: a page down never leaves a lone row on an empty panel.
    const height = Math.max(1, resultsSplit(this.state, layout(this.state).panel.height).report);
    results.top = Math.max(0, Math.min(results.top + delta, Math.max(0, rows.length - height)));
  }

  private selectedGap(): ReportItem | undefined {
    return reportItems(this.state)[this.state.results.gap];
  }

  /** The report row cuts a long reason; the message line shows the selected item's whole reason. */
  private showGapReason(): void {
    const gap = this.selectedGap();
    if (gap) this.state.message = `${gap.file === "" ? `${gap.text} · no position in the code` : `${gap.text} · Enter opens ${gap.file}:${gap.line}`}${this.plannedGap() !== null ? " · g: spec-to-code" : ""}`;
  }

  /** The ID of the selected gap of a feature report when it is a planned fn no code implements yet, else null. */
  private plannedGap(): string | null {
    const result = this.state.records[this.state.results.index]?.result;
    if (result?.kind !== "feature" || result.payload === null) return null;
    const entry = featureItems(result.payload.report)[this.state.results.gap];
    return entry !== undefined && !entry.hint && entry.item.kind === "planned" && this.host.plannedFns().includes(entry.item.id) ? entry.item.id : null;
  }

  /** `g` on a planned gap: the spec-to-code form with its ID; the report stays in the history. */
  private specCodeForGap(): void {
    const id = this.plannedGap();
    if (id === null) {
      this.state.message = "g drafts code for a planned fn gap of a feature report";
      return;
    }
    this.closeResults();
    this.host.openSpecCode(id);
  }

  /** Enter on a gap or a check result: its file and position, like a finding (Esc / Ctrl+O come back to the report). */
  private openGap(): void {
    const gap = this.selectedGap();
    if (gap && gap.file !== "") this.openTarget(gap.file, gap.line, gap.col);
  }

  /** What Enter over the selected wire report opens: the first blocking error, else the generated file when it is on disk. */
  private wireTarget(): { file: string; line: number; col: number } | null {
    const result = this.state.records[this.state.results.index]?.result;
    if (result?.kind !== "wire" || result.payload === null) return null;
    const first = result.payload.diagnostics[0];
    if (first) return { file: first.file, line: first.span.start.line, col: first.span.start.col };
    return existsSync(resolve(this.state.root, result.payload.file)) ? { file: result.payload.file, line: 1, col: 1 } : null;
  }

  /** The generated code opens in the read-only viewer, not as a writable buffer; Esc / Ctrl+O come back to the report. */
  private openWireTarget(): void {
    const target = this.wireTarget();
    if (target) this.openTarget(target.file, target.line, target.col);
  }
}
