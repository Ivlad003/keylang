// The catalogue of TUI actions: one registry used by the palette (`:` /
// Ctrl+P) and by the help popup. An action has a stable id, a label, a group,
// search aliases, an optional key hint and an availability predicate with a
// reason; `App.runAction(id)` executes it. The palette never synthesizes fake
// key events. A new action joins this registry with the feature that
// implements it — an unimplemented generator is not listed as a fake success.

import type { State } from "./state.ts";

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
  /** An explicit operation (doctor) is running. */
  operation: boolean;
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

const mergeOnly = (ctx: ActionContext): string | null => (ctx.merge ? MERGE_REASON : null);
const bufferOrMerge = (ctx: ActionContext): string | null => (ctx.merge ? MERGE_REASON : ctx.current === null ? "no file open" : null);

/** The static actions, in palette order; per-file "open" entries come from `catalog()`. */
export const ACTIONS: readonly Action[] = [
  { id: "check", label: "Check again", group: "Check", aliases: ["check", "analyze"], key: "F5" },
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
  { id: "find-node", label: "Find a node", group: "Navigate", aliases: ["find node", "node"], key: "s", when: mergeOnly },
  { id: "toggle-map", label: "Map / explained map", group: "Navigate", aliases: ["toggle map", "explained map"], key: "t", when: mergeOnly },
  { id: "reading", label: "Reading mode", group: "Edit", aliases: ["read", "reading"], key: "v", when: bufferOrMerge },
  {
    id: "edit",
    label: "Edit",
    group: "Edit",
    aliases: ["edit", "insert mode"],
    key: "i",
    when: (ctx) => (ctx.merge ? MERGE_REASON : ctx.current === null ? "no file open" : ctx.readOnly ? "generated map files are read-only" : null),
  },
  { id: "merge", label: "Merge proposal", group: "Proposals", aliases: ["merge", "proposal"], key: "m", when: (ctx) => (ctx.merge ? "already merging" : null) },
  { id: "help", label: "Keys and help", group: "Help", aliases: ["help", "keys"], key: "?" },
  { id: "version", label: "About keylang", group: "Help", aliases: ["version", "about"] },
  { id: "quit", label: "Quit", group: "Session", aliases: ["quit", "exit"], key: "q" },
];

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
  return {
    mode: state.mode,
    focus: state.focus,
    merge: state.merge !== null,
    current: state.current,
    readOnly: buffer?.readOnly === true,
    operation: state.activeOperation !== null,
  };
}

/** The palette item text of an action: its label, with the key hint when it has one. */
export function actionLabel(action: Action): string {
  return action.key !== undefined ? `${action.label} (${action.key})` : action.label;
}

/** The catalogue entries matching `query`: every query word is a subsequence of some token of the label, key or aliases. */
export function matchActions(entries: readonly ActionEntry[], query: string): ActionEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    // Token matching, not one long string: a query never matches across word boundaries
    // ("rules" must not match "infrastructure" via the "keylang" of a repeated alias).
    const tokens = searchText(entry.action).toLowerCase().split(/\s+/);
    return words.every((word) => tokens.some((token) => subsequence(token, word)));
  });
}

function searchText(action: Action): string {
  return `${action.label} ${action.key ?? ""} ${action.aliases.join(" ")}`;
}

function subsequence(text: string, query: string): boolean {
  let at = 0;
  for (const ch of text) if (ch === query[at]) at++;
  return at === query.length;
}
