// The state of one TUI session. The same state drives the terminal and the
// browser: a transport only feeds input and shows the frames `view.ts` draws.

import type { Analysis } from "../analyze.ts";
import type { StoredExplanation } from "../explanations.ts";
import type { CompletionItem } from "../lsp-features.ts";
import type { Document } from "../ir.ts";
import type { Decision, Hunk } from "./merge.ts";

export type Mode = "view" | "edit" | "read" | "code" | "merge";
export type Focus = "editor" | "nav" | "files" | "context";

export interface Cursor {
  /** 0-based line. */
  line: number;
  /** 0-based column in code points. */
  col: number;
}

export interface Buffer {
  path: string;
  text: string;
  /** Text on disk (or of the rendered map); `text !== saved` is unsaved. */
  saved: string;
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
  /** `context`: an ID to add to the agent's context (`@` in the context panel); `node`: find a node (`s`). */
  kind: "search" | "palette" | "context" | "node";
  text: string;
  /** Palette entries or found nodes matching `text`, and the selected one. */
  items: string[];
  /** `node`: the ID of each item. */
  ids?: string[];
  index: number;
}

export interface Place {
  path: string;
  cursor: Cursor;
  mode: Mode;
}

export interface State {
  root: string;
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
  /** Model briefs saved under `<dir>/explain/brief/`, read with each analysis: explanations for the nav panel and the node search. */
  briefs: ReadonlyMap<string, StoredExplanation>;
}
