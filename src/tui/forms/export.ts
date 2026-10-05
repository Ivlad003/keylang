// The export forms: a finished report saved to a file (`export`), and the
// C4 diagram of the map (`export c4`). Each shows the target as it is now —
// refused by the write policy before it is read — and writes nothing before
// Enter; Esc writes nothing.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { C4_FORMATS, C4_LEVELS, isC4Diagram } from "../../c4-export.ts";
import { CHECK_FORMATS, isCheckFormat } from "../../check-format.ts";
import { toPosix } from "../../config.ts";
import { c4OutProblem, exportTargetProblem, exportText, type ExportC4Request, type ExportFormat, type ExportSource } from "../../operations.ts";
import { PARSE_FORMATS } from "../../parse-format.ts";
import { exportRecord } from "../actions.ts";
import { isDirty } from "../buffer.ts";
import { readText } from "../disk.ts";
import { errorText } from "../merge-session.ts";
import { cycle, type PromptKeys } from "../prompt-keys.ts";
import { operationLabel, recordSummary } from "../reports/records.ts";
import type { C4Form, OperationRecord, Prompt, State } from "../state.ts";
import type { FormHost } from "./host.ts";

/** Where an export goes unless a path is typed: `.keylang/export/check.json`, `.keylang/export/edge.txt`, `.keylang/export/parse.txt`, `.keylang/export/trace-plan.json`. */
function defaultExportPath(kind: OperationRecord["kind"], format: ExportFormat): string {
  const extension: Record<ExportFormat, string> = { human: "txt", json: "json", sarif: "sarif", github: "github.txt", tree: "txt" };
  const name = kind === "explain-edge" ? "edge" : kind === "parse" || kind === "trace-plan" ? kind : "check";
  return `.keylang/export/${name}.${extension[format]}`;
}

/** The typed report of a finished record in a format, or null when it has none. */
function exportSourceOf(record: OperationRecord, format: ExportFormat): ExportSource | null {
  const result = record.result;
  if (result?.kind === "check" && result.payload !== null && isCheckFormat(format)) {
    const { results, snapshotId, coverage, lines } = result.payload;
    return { kind: "check", format, report: { results, snapshotId, coverage, lines } };
  }
  if (result?.kind === "explain-edge" && result.payload !== null) return { kind: "explain-edge", lines: result.payload.lines };
  // The documents as parsed then: the export renders them, it never parses again.
  const view = PARSE_FORMATS.find((candidate) => candidate === format);
  if (result?.kind === "parse" && result.payload !== null && view !== undefined) return { kind: "parse", format: view, documents: result.payload.documents };
  // The plan as it was computed: its snapshot and hashes, never a new plan.
  if (result?.kind === "trace-plan" && result.payload !== null && format === "json") return { kind: "trace-plan", plan: result.payload.plan };
  return null;
}

export class ExportForms {
  private readonly host: FormHost;

  constructor(host: FormHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** The keys of the export forms. */
  keys(prompt: Prompt): PromptKeys | null {
    switch (prompt.kind) {
      case "export":
        return {
          typed: () => {
            // A typed path no longer follows the format.
            if (prompt.exportForm) prompt.exportForm.custom = true;
            this.refreshExportPrompt();
          },
          moved: () => this.refreshExportPrompt(),
          change: (delta) => this.changeExportFormat(delta),
          submit: () => this.submitExport(),
        };
      case "export-c4":
        return { typed: () => this.refreshC4Prompt(), moved: () => this.refreshC4Prompt(), change: (delta) => this.changeC4Choice(delta), submit: () => this.submitC4() };
      default:
        return null;
    }
  }

  // ---------- export of a report ----------

  /**
   * The export form of the report `exportRecord` picks (design §2.6): the
   * format, the path (a default per format under `.keylang/export/`) and the
   * target as it is now. Nothing is written before Save; Esc writes nothing.
   */
  openExportPrompt(): void {
    if (this.state.activeOperation !== null) {
      this.state.message = "export: an operation is already running";
      return;
    }
    const found = exportRecord(this.state);
    if ("reason" in found) {
      this.state.message = `export: ${found.reason}`;
      return;
    }
    const { record } = found;
    // A parse report is exported in the view it was shown in, unless another is chosen.
    // A trace plan has one format, the JSON the adapters read.
    const formats: readonly ExportFormat[] = record.kind === "check" ? CHECK_FORMATS : record.kind === "parse" ? PARSE_FORMATS : record.kind === "trace-plan" ? ["json"] : ["human"];
    const format: ExportFormat = record.kind === "check" || record.kind === "trace-plan" ? "json" : record.params.kind === "parse" ? record.params.format : "human";
    this.state.prompt = {
      kind: "export",
      text: defaultExportPath(record.kind, format),
      items: [],
      ids: ["format", "path", "save"],
      index: 2,
      exportForm: { record: record.id, formats, format, custom: false, expect: null, problem: null, bytes: this.exportBytes(record, format) },
    };
    this.refreshExportPrompt();
  }

  /** The bytes of the report in a format: exactly what the CLI prints, from the record's payload. */
  private exportBytes(record: OperationRecord, format: ExportFormat): number {
    const source = exportSourceOf(record, format);
    return source === null ? 0 : Buffer.byteLength(exportText(source), "utf8");
  }

  /** Why the typed target cannot receive the export now, or null. A dirty buffer of it is never written under. */
  private exportProblem(path: string): string | null {
    if (path === "") return "type the target path, relative to the root";
    let problem: string | null;
    try {
      problem = exportTargetProblem(this.state.root, path, this.host.specDir());
    } catch (error) {
      problem = errorText(error);
    }
    if (problem !== null) return problem;
    const buffer = this.state.buffers.get(path);
    return buffer && isDirty(buffer) ? "open with unsaved edits: save or undo them first; an export never writes under them" : null;
  }

  /** The rows of the form: the report (and whether it is outdated), the target as it is now, and what Save writes. Reading only. */
  private refreshExportPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.exportForm;
    if (prompt?.kind !== "export" || !form) return;
    const record = this.state.records.find((candidate) => candidate.id === form.record);
    const path = prompt.text.trim();
    prompt.items = [
      `format: ${form.format}${form.formats.length > 1 ? ` · ←→ ${form.formats.join(" / ")}` : " · the only output of an explained edge"}`,
      `path: ${prompt.text}▏`,
      `Save ${path === "" ? "…" : path} (writes this one file)`,
    ];
    form.problem = this.exportProblem(path);
    let target: string;
    if (form.problem !== null) {
      form.expect = null;
      target = `refused: ${form.problem}`;
    } else {
      // What the form shows is what Save expects: a change after this is a conflict.
      form.expect = readText(resolve(this.state.root, path));
      const parent = dirname(path);
      target =
        form.expect !== null
          ? `exists, ${Buffer.byteLength(form.expect, "utf8")} bytes: replaced on Save`
          : `new file${parent !== "." && !existsSync(resolve(this.state.root, parent)) ? ` · creates ${parent}/` : ""}`;
    }
    prompt.details = [
      record ? `report #${record.id}: ${operationLabel(record.params)} · ${recordSummary(record)}` : "the report is gone",
      ...(record?.outdated != null ? [`outdated: ${record.outdated} · saved as it ran; nothing is checked again`] : []),
      `target: ${path === "" ? "—" : path} · ${target}`,
      `${form.bytes} bytes of ${form.format}: the CLI's stdout, no ANSI, no status lines`,
    ];
    prompt.note = form.problem ?? "Enter saves · ←→ format · Esc writes nothing";
  }

  /** ←→ in the export form: the next format; an untouched default path follows it. */
  private changeExportFormat(delta: 1 | -1): void {
    const prompt = this.state.prompt;
    const form = prompt?.exportForm;
    if (!prompt || !form) return;
    const record = this.state.records.find((candidate) => candidate.id === form.record);
    form.format = cycle(form.formats, form.format, delta);
    if (!form.custom && record) prompt.text = defaultExportPath(record.kind, form.format);
    if (record) form.bytes = this.exportBytes(record, form.format);
    this.refreshExportPrompt();
  }

  /**
   * Enter in the export form, on any row: the report as it ran goes to the
   * shown target through the file protocol. A refusal keeps the form; the
   * target is expected as the form last showed it.
   */
  private submitExport(): void {
    const prompt = this.state.prompt;
    const form = prompt?.exportForm;
    if (prompt?.kind !== "export" || !form) return;
    const record = this.state.records.find((candidate) => candidate.id === form.record);
    const source = record ? exportSourceOf(record, form.format) : null;
    if (!record || source === null) {
      this.state.prompt = null;
      this.state.message = "export: the report is gone";
      return;
    }
    const path = prompt.text.trim();
    const problem = this.exportProblem(path);
    if (problem !== null || form.problem !== null) {
      // A target that became writable since the form showed a refusal is shown again first.
      this.refreshExportPrompt();
      this.state.message = problem === null ? "export: the target changed; check the form and press Enter again" : `export: ${problem}`;
      return;
    }
    this.state.prompt = null;
    this.host.startOperation("export", { kind: "export", root: this.state.root, path, expect: form.expect, source });
  }

  // ---------- export c4 ----------

  /**
   * The C4 form (c4-zoom/12): the format, the level, one layer or all, and
   * the file to write. Without a file the diagram shows in F6 and nothing is
   * written. Nothing runs before Enter; Esc runs nothing.
   */
  openC4Prompt(): void {
    const layers = this.state.analysis ? [...this.state.analysis.config.layers.keys()] : [];
    this.state.prompt = { kind: "export-c4", text: "", items: [], ids: ["format", "level", "layer", "out", "run"], index: 4, c4: { format: "plantuml", level: "component", layer: null, layers } };
    this.refreshC4Prompt();
  }

  /** The request the form would run: the CLI's flags, a layer only at the component level. */
  private c4Request(form: C4Form, out: string): ExportC4Request {
    return {
      kind: "export-c4",
      root: this.state.root,
      format: form.format,
      level: form.level,
      ...(form.level === "component" && form.layer !== null ? { layer: form.layer } : {}),
      ...(out !== "" ? { out: toPosix(out) } : {}),
    };
  }

  /** The rows of the form, and what Enter would do with the file as it is now. Reading only. */
  private refreshC4Prompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.c4;
    if (prompt?.kind !== "export-c4" || !form) return;
    const out = prompt.text.trim();
    prompt.items = [
      `format: ${form.format} · ←→ ${C4_FORMATS.join(" / ")}`,
      `level: ${form.level} · ←→ ${C4_LEVELS.join(" / ")}`,
      form.level === "component" ? `layer: ${form.layer ?? "all"} · ←→ all / ${form.layers.join(" / ")}` : "layer: — the container level draws the repository as one container",
      `out: ${prompt.text}▏`,
      `Run ${operationLabel(this.c4Request(form, out))}`,
    ];
    if (out === "") {
      prompt.note = "no file: the diagram shows in F6 and nothing is written · type a path to write it";
      return;
    }
    // The write policy first, as the operation checks it: a path outside or a link out of the repository is never read.
    const problem = c4OutProblem(this.state.root, toPosix(out));
    if (problem !== null) {
      prompt.note = problem;
      return;
    }
    const current = readText(resolve(this.state.root, out));
    prompt.note =
      current === null
        ? `${out}: a new file, written on Enter`
        : isC4Diagram(current)
          ? `${out}: a diagram export c4 wrote: replaced on Enter`
          : `${out}: not a diagram export c4 wrote: Enter refuses it, nothing is written`;
  }

  /** ←→ on the format, the level or the layer row: the next choice. */
  private changeC4Choice(delta: 1 | -1): void {
    const prompt = this.state.prompt;
    const form = prompt?.c4;
    if (!prompt || !form) return;
    const row = prompt.ids?.[prompt.index];
    if (row === "format") form.format = cycle(C4_FORMATS, form.format, delta);
    else if (row === "level") form.level = cycle(C4_LEVELS, form.level, delta);
    else if (row === "layer" && form.level === "component") form.layer = cycle([null, ...form.layers], form.layer, delta);
    else return;
    this.refreshC4Prompt();
  }

  /** Enter on any row: the export as the form shows it; the operation checks the file again before it writes. */
  private submitC4(): void {
    const prompt = this.state.prompt;
    const form = prompt?.c4;
    if (prompt?.kind !== "export-c4" || !form) return;
    const request = this.c4Request(form, prompt.text.trim());
    this.state.prompt = null;
    this.host.requestOperation("export-c4", request);
  }
}
