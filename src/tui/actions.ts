// The catalogue of TUI actions: one registry used by the palette (`:` /
// Ctrl+P) and by the help popup. An action has a stable id, a label, a group,
// search aliases, an optional key hint and an availability predicate with a
// reason; `App.runAction(id)` executes it. The palette never synthesizes fake
// key events. A new action joins this registry with the feature that
// implements it — an unimplemented generator is not listed as a fake success.

import type { OperationRecord, State } from "./state.ts";

/** What availability predicates may look at. Derived from `State` only. */
export interface ActionContext {
  mode: State["mode"];
  focus: State["focus"];
  /** A MERGE is in progress. */
  merge: boolean;
  /** The current file, or null when nothing is open. */
  current: string | null;
  /** The current buffer is a generated, read-only file. */
  readOnly: boolean;
  /** An explicit operation (doctor, feature, check, explain-edge, map-check, map, baseline, agents, init, fmt, wire, parse, trace-plan, export, draft-flow, draft-rules, draft-layout) is running. */
  operation: boolean;
  /** The start screen of a repository without `keylang.json` is open. */
  start: boolean;
  /** `keylang.json` is missing: the session browses with a guessed configuration. */
  missingConfig: boolean;
  /** Why there is no code snapshot to act on, or null when there is one. */
  noSnapshot: string | null;
  /** Why no finished report can be exported now (`exportRecord`), or null. */
  noExport: string | null;
}

export interface Action {
  id: string;
  label: string;
  group: string;
  aliases: string[];
  key?: string;
  /** Why the action cannot run now, or null when it can. */
  when?: (ctx: ActionContext) => string | null;
}

export interface ActionEntry {
  action: Action;
  /** The availability reason, or null when the action can run. */
  reason: string | null;
}

/** The shared reason for actions that would drop an open MERGE. */
export const MERGE_REASON = "finish the merge first (Esc cancels it)";

/** The shared reason for editor actions while the start screen covers the editor. */
export const START_REASON = "choose Browse on the start screen first (Enter)";

const mergeOnly = (ctx: ActionContext): string | null => (ctx.merge ? MERGE_REASON : null);
const editor = (ctx: ActionContext): string | null => (ctx.merge ? MERGE_REASON : ctx.start ? START_REASON : null);
const bufferOrMerge = (ctx: ActionContext): string | null => editor(ctx) ?? (ctx.current === null ? "no file open" : null);
const snapshot = (ctx: ActionContext): string | null => editor(ctx) ?? ctx.noSnapshot;

/** The static actions, in palette order; per-file "open" entries come from `catalog()`. */
export const ACTIONS: readonly Action[] = [
  { id: "check", label: "Check again", group: "Check", aliases: ["check", "analyze"], key: "F5" },
  {
    id: "browse",
    label: "Browse with the guessed configuration",
    group: "Project",
    aliases: ["browse", "guess", "inferred", "view repository"],
    when: (ctx) => (ctx.missingConfig ? mergeOnly(ctx) : "keylang.json exists: F5 analyses with it"),
  },
  { id: "files", label: "Files panel", group: "View", aliases: ["files", "file panel"], key: "F2" },
  { id: "navigation", label: "Navigation panel", group: "View", aliases: ["navigation", "nav"], key: "F3" },
  { id: "context", label: "Agent context panel", group: "View", aliases: ["context", "agent context"], key: "F4" },
  { id: "results", label: "Operation results", group: "View", aliases: ["results", "history", "reports"], key: "F6" },
  {
    id: "doctor",
    label: "Environment diagnostics",
    group: "Project",
    aliases: ["doctor", "diagnostics", "health", "integrations"],
    when: (ctx) => (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "feature",
    label: "Feature readiness",
    group: "Check",
    aliases: ["feature", "readiness", "done", "gaps"],
    // It reads the saved files; unsaved buffers are offered for saving first.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "full-check",
    label: "Check: paths, strict, static",
    group: "Check",
    aliases: ["keylang check", "full check", "check paths", "check --strict", "check --static", "strict", "static mode", "check report"],
    // A form names the paths and the options; it reads the saved files, so unsaved buffers are offered for saving first. Never writes.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "explain-edge",
    label: "Check: explain the edge between two ids",
    group: "Check",
    aliases: ["explain edge", "check --explain-edge", "edge", "dependency evidence", "why depends", "between ids"],
    // A form takes two ids (the one under the cursor fills the first); it reads the saved code in a worker and never writes.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "trace-plan",
    label: "Trace plan: the functions of a flow to instrument",
    group: "Check",
    aliases: ["trace-plan", "trace plan", "keylang trace-plan", "instrument", "trace adapter", "flow trace"],
    // A form takes a flow of the current documents (the one under the cursor by default); a fresh snapshot in a worker; writes nothing, runs nothing.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "export",
    label: "Export the report to a file",
    group: "Check",
    key: "e in F6",
    aliases: ["export", "save report", "report to file", "check --format", "json", "sarif", "github", "human"],
    // A form names the format and the path and shows the target first; only Save writes, and the report is never run again.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : ctx.noExport),
  },
  {
    id: "map-check",
    label: "Map: check",
    group: "Map",
    aliases: ["map check", "map --check", "stale map", "up to date"],
    // Read-only and in a worker; `keylang.json` is read from disk, so unsaved buffers are offered for saving first.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "map",
    label: "Map: write",
    group: "Map",
    aliases: ["map", "update map", "write map", "regenerate map", "keylang map"],
    // Writes generated files only after a step that names them; F5 never writes.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "baseline",
    label: "Baseline: write or check",
    group: "Rules",
    aliases: ["baseline", "update baseline", "check baseline", "keylang baseline", "allowed dependencies"],
    // A form chooses the mode first; F5 and the ordinary check never write it.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "agents",
    label: "Agents: set up or check integrations",
    group: "Project",
    aliases: ["agents", "keylang agents", "harness", "harnesses", "mcp config", "claude codex cursor opencode"],
    // A form chooses the harnesses and the mode and shows what would change; it installs files and never starts a harness.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "init",
    label: "Init: set up keylang in this repository",
    group: "Project",
    aliases: ["init", "keylang init", "initialize", "init --check", "first run", "new project"],
    // A form shows the root, the layout, the harness selection and the classes of files first; an existing keylang.json is kept.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "fmt",
    label: "Format: write or check specifications",
    group: "Edit",
    aliases: ["fmt", "format", "keylang fmt", "fmt --check", "canonical form"],
    // A form names the files (the current spec by default, a directory only when typed) and the mode; never on save.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "parse",
    label: "Parse: show the Text IR of specifications",
    group: "Edit",
    aliases: ["parse", "keylang parse", "parse --json", "text ir", "ir", "syntax tree", "ir json"],
    // A form names the files (the current spec by default) and the view, tree or JSON; it reads the saved files, needs no snapshot and never writes.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "wire",
    label: "Wire: generate or check",
    group: "Project",
    aliases: ["wire", "keylang wire", "wire --check", "wiring", "generate wiring", "keylang.gen.ts", "container"],
    // A form names the output file (the CLI's default) and the mode; the generated code is shown read-only, never compiled or run.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "draft-flow",
    label: "Draft flow: from the code's calls or the model (algo, hybrid, llm)",
    group: "Generate",
    aliases: ["draft flow", "keylang draft flow", "draft --mode algo", "draft --mode hybrid", "draft --mode llm", "flow draft", "propose flow", "algo"],
    // A form names the trigger (a fn), the name, the target, the mode and preview or proposal; the target itself is never written, MERGE applies the proposal.
    when: (ctx) => editor(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "draft-rules",
    label: "Draft rules: the rules the code keeps, or the model's (algo, hybrid, llm)",
    group: "Generate",
    aliases: ["draft rules", "keylang draft rules", "draft rules --mode hybrid", "draft rules --mode llm", "rules draft", "propose rules"],
    // A form names the target, the mode and preview or proposal; each model rule is checked alone against the snapshot; the target itself is never written, MERGE applies the proposal.
    when: (ctx) => editor(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "draft-layout",
    label: "Draft layers: the layout keylang would guess, or the model's (algo, hybrid, llm)",
    group: "Generate",
    aliases: ["draft map", "keylang draft map", "draft map --mode hybrid", "draft map --mode llm", "draft layers", "layer layout", "propose layers"],
    // A form names the mode; F6 shows the layers and moves them into keylang.json's buffer on Enter — never a file, never a proposal.
    // Also on the start screen: without keylang.json the move opens a new, unsaved one.
    when: (ctx) => mergeOnly(ctx) ?? (ctx.operation ? "an operation is already running" : null),
  },
  {
    id: "cancel",
    label: "Cancel the running operation",
    group: "Session",
    aliases: ["cancel", "stop", "abort"],
    key: "x in F6",
    when: (ctx) => (ctx.operation ? null : "no operation is running"),
  },
  { id: "find-node", label: "Find a node", group: "Navigate", aliases: ["find node", "node"], key: "s", when: snapshot },
  { id: "toggle-map", label: "Map / explained map", group: "Navigate", aliases: ["toggle map", "explained map"], key: "t", when: snapshot },
  // A new buffer, not a file: nothing is written until Ctrl+S (design §2.8).
  { id: "new-spec", label: "New specification", group: "Edit", aliases: ["new spec", "new file", "create"], when: mergeOnly },
  { id: "reading", label: "Reading mode", group: "Edit", aliases: ["read", "reading"], key: "v", when: bufferOrMerge },
  {
    id: "edit",
    label: "Edit",
    group: "Edit",
    aliases: ["edit", "insert mode"],
    key: "i",
    when: (ctx) => bufferOrMerge(ctx) ?? (ctx.readOnly ? "generated map files are read-only" : null),
  },
  { id: "merge", label: "Merge proposal", group: "Proposals", aliases: ["merge", "proposal"], key: "m", when: (ctx) => (ctx.merge ? "already merging" : ctx.start ? START_REASON : null) },
  // Every pending target, spec or code, whatever file is open and whatever proposal is still undecided (design §2.9).
  { id: "proposals", label: "Proposals", group: "Proposals", aliases: ["proposals", "pending", "targets", "pick proposal"], when: (ctx) => (ctx.merge ? MERGE_REASON : ctx.start ? START_REASON : null) },
  { id: "help", label: "Keys and help", group: "Help", aliases: ["help", "keys"], key: "?" },
  { id: "version", label: "About keylang", group: "Help", aliases: ["version", "about"] },
  { id: "quit", label: "Quit", group: "Session", aliases: ["quit", "exit"], key: "q" },
];

/** The items of the start screen of a repository without `keylang.json`, in order (design §2.1). */
export const START_ACTIONS = ["init", "browse", "doctor"] as const;

/** The per-file "open" action of the palette. */
export function openAction(path: string): Action {
  return { id: `open:${path}`, label: `Open ${path}`, group: "Files", aliases: [path, `open ${path}`], when: mergeOnly };
}

/** The full catalogue for the current session: static actions plus one "open" entry per file. */
export function catalog(state: State): ActionEntry[] {
  const ctx = availabilityOf(state);
  return [...ACTIONS, ...state.files.map((path) => openAction(path))].map((action) => ({ action, reason: action.when?.(ctx) ?? null }));
}

/** The availability context of the current session state. */
export function availabilityOf(state: State): ActionContext {
  const buffer = state.current !== null ? state.buffers.get(state.current) : undefined;
  const exported = exportRecord(state);
  return {
    mode: state.mode,
    focus: state.focus,
    merge: state.merge !== null,
    current: state.current,
    readOnly: buffer?.readOnly === true,
    operation: state.activeOperation !== null,
    start: state.start !== null,
    missingConfig: state.config.kind === "missing-config",
    noSnapshot: noSnapshotReason(state),
    noExport: "reason" in exported ? exported.reason : null,
  };
}

/** The operation kinds whose finished report Export saves. */
export const EXPORTABLE_KINDS: ReadonlySet<OperationRecord["kind"]> = new Set(["check", "explain-edge", "parse", "trace-plan"]);

/**
 * The report Export saves: the record selected in F6 while the panel is open,
 * else the newest check, explain-edge, parse or trace-plan record — exactly that run, as it ran.
 */
export function exportRecord(state: Pick<State, "records" | "results">): { record: OperationRecord } | { reason: string } {
  const { results, records } = state;
  const record = results.open ? (results.entry === "record" ? records[results.index] : undefined) : records.findLast((candidate) => EXPORTABLE_KINDS.has(candidate.kind));
  if (!record) return { reason: results.open ? "select a check report in F6: the current analysis is not a saved report" : "no report yet: run a check first" };
  if (!EXPORTABLE_KINDS.has(record.kind)) return { reason: "only a check, explain-edge, parse or trace-plan report is exported" };
  if (record.status === "running") return { reason: "the report is still running" };
  if (!record.result || record.result.payload === null) return { reason: "this run has no report to export" };
  return { record };
}

/** Why the session has no code snapshot, or null when it has one. Also the status line's note. */
export function noSnapshotReason(state: Pick<State, "analysis" | "config" | "error" | "updating">): string | null {
  if (state.analysis?.snapshot) return null;
  if (state.config.kind === "invalid-config") return "keylang.json is invalid: fix it and save (Ctrl+S)";
  if (state.analysis) return "no supported source files (TypeScript, JavaScript, Python, Rust)";
  if (state.updating) return "the analysis is still running";
  if (state.error !== null) return "the analysis failed";
  return state.config.kind === "missing-config" ? "no analysis yet: browse the repository first" : "the analysis is still running";
}

/** The palette item text of an action: its label, with the key hint when it has one. */
export function actionLabel(action: Action): string {
  return action.key !== undefined ? `${action.label} (${action.key})` : action.label;
}

/** The catalogue entries matching `query`: every query word is a subsequence of some token of the label, key or aliases. */
export function matchActions(entries: readonly ActionEntry[], query: string): ActionEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [...entries];
  const matched = entries.filter((entry) => {
    // Token matching, not one long string: a query never matches across word boundaries
    // ("rules" must not match "infrastructure" via the "keylang" of a repeated alias).
    const tokens = searchText(entry.action).toLowerCase().split(/\s+/);
    return words.every((word) => tokens.some((token) => subsequence(token, word)));
  });
  // One word that is exactly a file's name opens that file first (`rules` → rules.md, before "Draft rules").
  const named = (entry: ActionEntry): boolean => words.length === 1 && entry.action.id.startsWith("open:") && fileName(entry.action.id) === words[0];
  return [...matched.filter(named), ...matched.filter((entry) => !named(entry))];
}

/** `rules` for `open:keylang/rules.md`: the base name without its extension, lower case. */
function fileName(id: string): string {
  const base = id.slice(id.lastIndexOf("/") + 1);
  return (base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base).toLowerCase();
}

function searchText(action: Action): string {
  return `${action.label} ${action.key ?? ""} ${action.aliases.join(" ")}`;
}

function subsequence(text: string, query: string): boolean {
  let at = 0;
  for (const ch of text) if (ch === query[at]) at++;
  return at === query.length;
}
