// The state of one TUI session. The same state drives the terminal and the
// browser: a transport only feeds input and shows the frames `view.ts` draws.

import type { Analysis } from "../analyze.ts";
import type { StaticMode } from "../config.ts";
import type { StoredExplanation } from "../explanations.ts";
import type { CompletionItem } from "../lsp-features.ts";
import type { Document } from "../ir.ts";
import type { ExportFormat, OperationRequest, OperationResult, OperationStatus } from "../operations.ts";
import type { VerdictFilter } from "./findings.ts";
import type { Decision, Hunk } from "./merge.ts";

export type Mode = "view" | "edit" | "read" | "code" | "merge";
export type Focus = "editor" | "nav" | "files" | "context" | "results";

export interface Cursor {
  /** 0-based line. */
  line: number;
  /** 0-based column in code points. */
  col: number;
}

export interface Buffer {
  path: string;
  text: string;
  /** Text on disk (or of the rendered map); `text !== saved` is unsaved (`isDirty` also counts a new file). */
  saved: string;
  /**
   * A new specification (design §2.8): no file on disk until its first save,
   * so it is unsaved even while empty. `disk` stays null until then; the
   * first save requires the target still not to exist.
   */
  newFile: boolean;
  /** Generated map files are read-only. */
  readOnly: boolean;
  /** Line ending of the file on disk; `text` always uses `\n`, a save restores this one. */
  eol: "\n" | "\r\n";
  /** The file on disk when it was loaded or last written; a different file at `Ctrl+S` was changed elsewhere. */
  disk: string | null;
  /** `Ctrl+S` was pressed once over a file changed elsewhere; the next one overwrites it. */
  overwrite: boolean;
  /** Parsed `text`, for highlighting and positions while the analysis catches up. */
  doc: Document | null;
  undo: { text: string; cursor: Cursor }[];
  /** Bumped by every change of `text` (`setText`): work that finishes later checks it is still the text it was made for. */
  version: number;
}

export interface Hover {
  /** Screen cell the popup is anchored at. */
  x: number;
  y: number;
  lines: { text: string; kind: "title" | "text" | "code" | "evidence" | "rule" }[];
  /** Where the hover came from: the pointer or `K` at the cursor. */
  source: "mouse" | "key";
}

export interface CodeView {
  file: string;
  /** 1-based target line. */
  line: number;
  lines: string[];
  top: number;
  /** `vscode://file/…:line` (OSC 8). */
  link: string;
}

export interface MergeState {
  path: string;
  /** `proposal`: a spec under `.keylang/proposals/`; `code`: a source file there (`spec-to-code`); `text-to-spec`: from `Ctrl+G`. */
  origin: "proposal" | "code" | "text-to-spec";
  /** The mode the merge was started from; `w` and `Esc` return there. */
  from: Mode;
  base: string[];
  /**
   * `proposal`: the file on disk when the merge began (null: it did not
   * exist). A different file at `w` is a concurrent change; nothing is written.
   */
  disk: string | null;
  /**
   * The proposal file when the merge began: its identity. A different file at
   * `w` was rewritten meanwhile (by an agent); nothing is written. Null for `Ctrl+G`.
   */
  proposal: string | null;
  hunks: Hunk[];
  decisions: Decision[];
  /** Decisions in the order they were made, with the one each replaced, for `u`. */
  history: { hunk: number; previous: Decision }[];
  current: number;
  top: number;
}

export interface LastMerge {
  path: string;
  /** Buffer text before and after the merge; `u` applies only while the buffer still holds `after`. */
  before: string;
  after: string;
  /** Disk text before the merge (null: no file) and after it, when the merge wrote the disk. */
  disk: { before: string | null; after: string } | null;
  /**
   * The proposal file before the merge and what the merge left there (null:
   * removed, every hunk decided). `u` restores `before` only while the file
   * is still `after`; a newer proposal written since is kept.
   */
  proposal: { abs: string; before: string; after: string | null } | null;
  /** A source file: no buffer holds it, so `u` checks the disk only. */
  code?: true;
}

export interface Prompt {
  /**
   * `context`: an ID to add to the agent's context (`@` in the context panel); `node`: find a node (`s`);
   * `feature`: the slug of the feature to check (the matching feature files are the items);
   * `proposal`: the proposals list, filtered by the typed text (design §2.9);
   * `new-spec`: the form of a new specification, one field at a time (`form`, design §2.8);
   * `baseline`: write or check `<dir>/rules.baseline.md` (the items; `ids` are `write` / `check`);
   * `agents`: the harness selection as typed (empty is auto, `none`, or names as in `--agents`) and the mode (`ids` are `write` / `check`);
   * `init`: the harness selection as in `agents` and the mode (`ids` are `write` / `check`; `notes` say what each does);
   * `fmt`: the files and directories to format, relative to the root and separated by spaces, and the mode (`ids` are `write` / `check`);
   * `wire`: the generated file, relative to the root (`keylang.gen.ts` by default), and the mode (`ids` are `write` / `check`);
   * `full-check`: the spec files and directories to check, relative to the root and separated by spaces (the spec directory by default), and `checkOptions` (the items; ←→ change the selected one; on the `since` row typing edits the git ref instead of the paths).
   * `explain-edge`: two ids, `edge.from` and `edge.to` (the items `from`, `to`, run; typing edits the selected id row; `text` is unused).
   * `parse`: the spec files and directories to parse, relative to the root and separated by spaces (the current spec by default), and the view (`ids` are `tree` / `json`);
   * `trace-plan`: the flow's name, typed or taken from the list of the flows of the current documents (`ids` are the matching names; the one under the cursor by default);
   * `export`: the target path of a finished report, relative to the root (`text`), and `exportForm` (the items `format`, `path`, save; ←→ change the format).
   * `draft-flow`: the flow draft, `draft` (the rows `trigger`, the callable IDs matching it as `fn:<id>`, `name`, `into`, `mode`, `output`, run; typing edits the selected field, ←→ change the mode or the output; `text` is unused).
   * `draft-rules`: the rules draft, `rulesDraft` (the rows `into`, `mode`, `output`, run; typing edits the target, ←→ change the mode or the output; `text` is unused).
   * `draft-layout`: the layer layout draft, `layoutDraft` (the rows `mode`, run; ←→ change the mode; `text` is unused).
   */
  kind: "search" | "palette" | "context" | "node" | "feature" | "proposal" | "new-spec" | "baseline" | "agents" | "init" | "fmt" | "wire" | "full-check" | "explain-edge" | "export" | "parse" | "trace-plan" | "draft-flow" | "draft-rules" | "draft-layout";
  text: string;
  /** Palette entries or found nodes matching `text`, and the selected one. */
  items: string[];
  /** `node`: the ID of each item; `palette`: the action id of each item; `feature`: the slug of each item; `proposal`: the target path. */
  ids?: string[];
  /** `palette`: the group or the availability reason of each item; `proposal`: what Enter does or why it cannot; parallel to `items`. */
  notes?: string[];
  /** `init`: rows that describe the form (root, layout, harnesses, files), shown above the items and never selected. */
  details?: string[];
  /** The note of the selected item (`feature`: the target file or why the slug is invalid), shown next to the query. */
  note?: string;
  index: number;
  /** `new-spec`: the field being typed and the fields already chosen. Esc at any field creates nothing. */
  form?: NewSpecForm;
  /** `full-check`: strict, the static mode (null: what keylang.json says, then `behavior`), and the git slice: `changed` with its ref (`since`, `HEAD` by default). */
  checkOptions?: { strict: boolean; static: StaticMode | null; changed: boolean; since: string };
  /** `explain-edge`: the two ids as typed; the id under the cursor fills only `from`. */
  edge?: { from: string; to: string };
  /** `export`: the report and what the form showed about the target. */
  exportForm?: ExportForm;
  /** `draft-flow`: the fields as typed; an empty name or target is the CLI's default, shown next to it. */
  draft?: DraftForm;
  /** `draft-rules`: the fields as typed; an empty target is the CLI's default, shown next to it. */
  rulesDraft?: RulesDraftForm;
  /** `draft-layout`: the mode of `draft map`. */
  layoutDraft?: { mode: "algo" | "hybrid" | "llm" };
}

/** The fields of `draft rules [--into] [--mode]` and whether it proposes or only previews. */
export interface RulesDraftForm {
  /** Relative to the root, POSIX. */
  into: string;
  mode: "algo" | "hybrid" | "llm";
  output: "proposal" | "preview";
}

/** The fields of `draft flow <trigger> [--name] [--into] [--mode]` and whether it proposes or only previews. */
export interface DraftForm {
  trigger: string;
  name: string;
  /** Relative to the root, POSIX. */
  into: string;
  mode: "algo" | "hybrid" | "llm";
  output: "proposal" | "preview";
}

/**
 * The export form of one finished report. `expect` is the target as the form
 * last showed it (null: absent); Save sends it, so a file changed after that
 * is a conflict, never overwritten. `problem` is why Save is refused now.
 */
export interface ExportForm {
  /** The id of the exported record: the report as it ran, never run again. */
  record: number;
  formats: readonly ExportFormat[];
  format: ExportFormat;
  /** The path was typed: a format change no longer replaces it with its default. */
  custom: boolean;
  expect: string | null;
  problem: string | null;
  /** The size of the report in `format`, in UTF-8 bytes. */
  bytes: number;
}

/** The kinds of a new specification: its first text follows the kind (design §2.8). */
export type SpecKind = "flow" | "rules" | "wiring" | "feature" | "blank";

export interface NewSpecForm {
  /** `kind`: choose from the items; `path`: the text is the relative path; `name`: the text is the flow name. */
  field: "kind" | "path" | "name";
  kind: SpecKind;
  /** The path chosen in the `path` field; empty before it. */
  path: string;
}

/** A run of one explicit operation in this session, kept in memory for F6 (design §2.6). */
export interface OperationRecord {
  /** Stable within the session. */
  id: number;
  /** The action id from the registry. */
  action: string;
  kind: OperationRequest["kind"];
  /** The request snapshot, for a rerun with the same parameters. */
  params: OperationRequest;
  /** ms timestamps; `finished` is null while the operation runs. */
  started: number;
  finished: number | null;
  status: OperationStatus | "running";
  /** The operation result; null while it runs. */
  result: OperationResult | null;
  /**
   * Why the result no longer describes the inputs (an edit, a save, a new
   * snapshot since it ran), or null. A saved `done` is never shown as current
   * after its inputs changed; a rerun makes a new record.
   */
  outdated: string | null;
  /** The last progress note of a running operation, or null. Presentation only. */
  progress: string | null;
}

/**
 * The step before an operation that reads the disk (design §2.5): the dirty
 * spec and config buffers it would not see, and what it would write. Save and continue writes them in
 * order and starts the operation only when every write succeeded; Back writes
 * nothing. `error` names the file whose save failed; the step stays open.
 */
export interface SaveBarrier {
  /** What waits for the save, as shown in the title. */
  action: string;
  files: string[];
  /**
   * What a writing operation will write, shown before it starts (design §2.2:
   * a write action first shows its target); null for one that only reads.
   * With targets the step opens even without unsaved buffers.
   */
  writes: string[] | null;
  choice: "save" | "back";
  error: string | null;
}

/**
 * How the session found `keylang.json` on disk. The analysis always reads the
 * saved file; an unsaved config buffer never takes effect. Whether a snapshot
 * exists is separate: `analysis?.snapshot` (a valid config may find no sources).
 */
export type ConfigState =
  | { kind: "configured" }
  /** No `keylang.json`: the guessed languages and layers, and the notes of renamed layers. Nothing is written. */
  | { kind: "missing-config"; languages: string[]; layers: string[]; notes: string[] }
  /** `keylang.json` does not parse or validate: `reason` names the field; the analyzer is not run. */
  | { kind: "invalid-config"; reason: string };

export interface Place {
  path: string;
  cursor: Cursor;
  mode: Mode;
}

export interface State {
  root: string;
  config: ConfigState;
  /**
   * The start screen of a repository without `keylang.json` (design §2.1): the
   * selected item, or null when it is closed. No analysis runs before Browse.
   */
  start: number | null;
  cols: number;
  rows: number;
  files: string[];
  current: string | null;
  buffers: Map<string, Buffer>;
  cursor: Cursor;
  top: number;
  left: number;
  mode: Mode;
  focus: Focus;
  showFiles: boolean;
  showNav: boolean;
  navIndex: number;
  navTop: number;
  navExpanded: Set<string>;
  filesIndex: number;
  analysis: Analysis | null;
  /** An analysis is running; the shown results belong to an older generation. */
  updating: boolean;
  /** The buffers changed after the shown analysis started. */
  outdated: boolean;
  /**
   * Persistent reason the shown report is not current: the last analysis failed.
   * A key does not clear it; only a successful analysis of a newer generation does.
   */
  error: string | null;
  hover: Hover | null;
  code: CodeView | null;
  merge: MergeState | null;
  /** The last written merge, for `u` in the view. Any later edit of the file clears it. */
  lastMerge: LastMerge | null;
  /** `shown`: ms timestamp, for the time to a decision in `.keylang/stats.json`. */
  completion: { items: CompletionItem[]; index: number; from: number; shown?: number } | null;
  /**
   * A grey next line from the agent on `line` of the buffer `path` at `version`:
   * `Tab` takes `variants[index]` while that text is still there, `Alt+]` the next, `Esc` drops it.
   */
  ghost: { path: string; version: number; line: number; variants: string[]; index: number; shown: number } | null;
  /** Lines selected with Shift+arrows in the editor: anchor line. */
  selection: number | null;
  prompt: Prompt | null;
  help: boolean;
  back: Place[];
  message: string | null;
  proposals: string[];
  /** The context panel (F4): what goes to the model; `added` by `@id`, `removed` by `x` (item keys). */
  context: { open: boolean; index: number; added: string[]; removed: Set<string> };
  search: string | null;
  quitArmed: boolean;
  /** Runs of explicit operations in this session, newest last; F6 shows them. */
  records: OperationRecord[];
  /** The id of the record of the operation running now, or null. One explicit operation at a time. */
  activeOperation: number | null;
  /** The save step before an operation, or null. It is modal: keys go to it until Save and continue or Back. */
  barrier: SaveBarrier | null;
  /**
   * The F6 panel: the pinned current analysis and the history of operation
   * records. `top` is the first report row of a record or the first finding
   * row of the analysis; `scrollReport` routes the arrows from the entries to
   * the report or the findings. `filter` only hides verdicts: the report is
   * unchanged. `gap` is the selected item of a record: a gap of a feature
   * record, a result of a check record (Tab moves the arrows to them). `viewing` hides the panel while a finding's or gap's target is shown;
   * leaving it puts back `origin`, where the finding was opened from.
   * `previousFocus` is where Esc returns when the panel closes.
   */
  results: {
    open: boolean;
    entry: "analysis" | "record";
    index: number;
    finding: number;
    gap: number;
    filter: VerdictFilter;
    top: number;
    scrollReport: boolean;
    viewing: boolean;
    origin: { path: string | null; cursor: Cursor; top: number; mode: Mode; code: CodeView | null } | null;
    previousFocus: Focus;
  };
  /** Model briefs saved under `<dir>/explain/brief/`, read with each analysis: explanations for the nav panel and the node search. */
  briefs: ReadonlyMap<string, StoredExplanation>;
}
