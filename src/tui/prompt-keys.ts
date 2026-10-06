// The keys of a prompt — the palette, a search, a picker, the form of an
// operation. Every kind answers the same keys: typing and Backspace edit the
// text of the selected row, ↑↓ move the selection, ←→ change a choice, Enter
// runs it. One handler does that for all of them; a `PromptKeys` per kind
// says which text a row edits and what follows each key. The helpers below
// are the shapes the forms' rows share.

import type { KeyEvent } from "./input.ts";
import type { Prompt } from "./state.ts";
import { graphemes } from "./width.ts";

/** Most nodes a prompt lists from a search (`s`, the explain form). */
export const NODE_HITS = 50;

/** A text the selected row of a prompt edits. */
export interface TextField {
  value: string;
  set(value: string): void;
  /** Typing keeps only digits (a line number). */
  digits?: boolean;
}

/** What the keys of a prompt do for one kind of it. */
export interface PromptKeys {
  /** The text the selected row edits; null: that row takes none. Absent: the prompt's own text. */
  field?(prompt: Prompt): TextField | null;
  /** After typing, Backspace or a paste went to the prompt. */
  typed?(): void;
  /** After ↑↓ moved the selection. */
  moved?(): void;
  /** ←→ on the selected row. */
  change?(delta: 1 | -1): void;
  /** Enter. */
  submit(): void;
}

/** The prompt's own text as a field: the query, the paths, the target. */
export function promptText(prompt: Prompt): TextField {
  return {
    value: prompt.text,
    set: (value) => {
      prompt.text = value;
    },
  };
}

/** A text of a form object as a field. */
export function fieldOf<K extends string>(form: Record<K, string>, key: K, digits = false): TextField {
  return {
    value: form[key],
    set: (value) => {
      form[key] = value;
    },
    ...(digits ? { digits } : {}),
  };
}

function fieldIn(prompt: Prompt, keys: PromptKeys): TextField | null {
  return keys.field ? keys.field(prompt) : promptText(prompt);
}

/** A typed line after Backspace: its last grapheme cluster gone. The prompts and the clip's input line edit this way. */
export function backspaced(text: string): string {
  return graphemes(text).slice(0, -1).join("");
}

/** Text typed or pasted into the prompt: into the selected row's field, then the prompt follows it. */
export function typeInto(prompt: Prompt, keys: PromptKeys, text: string): void {
  const field = fieldIn(prompt, keys);
  if (field) field.set(field.value + (field.digits ? text.replace(/[^0-9]/g, "") : text));
  keys.typed?.();
}

/**
 * Every key of a prompt but Esc (the caller closes it): Backspace, ←→ when
 * the kind has choices, ↑↓ over a list that has items, Enter, and text.
 */
export function promptKey(prompt: Prompt, keys: PromptKeys, event: KeyEvent): void {
  if (event.name === "backspace") {
    const field = fieldIn(prompt, keys);
    if (field) field.set(backspaced(field.value));
    keys.typed?.();
    return;
  }
  if ((event.name === "left" || event.name === "right") && keys.change) return keys.change(event.name === "left" ? -1 : 1);
  if ((event.name === "up" || event.name === "down") && prompt.items.length > 0) {
    prompt.index = (prompt.index + (event.name === "up" ? -1 : 1) + prompt.items.length) % prompt.items.length;
    keys.moved?.();
    return;
  }
  if (event.name === "enter") return keys.submit();
  if (event.text !== undefined && !event.ctrl && !event.alt) typeInto(prompt, keys, event.text);
}

/** The note of the selected item, where each item has its own (`notes`). */
export function noteOfSelection(prompt: Prompt): void {
  prompt.note = prompt.notes?.[prompt.index] ?? "";
}

/** One row of a form: its id, which the selection keeps across a refresh, and its text. */
export interface FormRow {
  id: string;
  text: string;
}

/** The rows of a form, the row `selected` selected (the first when it is gone). */
export function showRows(prompt: Prompt, rows: readonly FormRow[], selected: string): void {
  prompt.ids = rows.map((row) => row.id);
  prompt.items = rows.map((row) => row.text);
  prompt.index = Math.max(0, prompt.ids.indexOf(selected));
}

/** The id of the selected row, or `fallback` before the rows are built. */
export function selectedRow(prompt: Prompt, fallback: string): string {
  return prompt.ids?.[prompt.index] ?? fallback;
}

/** The caret after the text of a field's row while it is the `selected` one: `caretAt(selected)("into")`. */
export function caretAt(selected: string): (row: string) => string {
  return (row) => (row === selected ? "▏" : "");
}

/** The value `delta` steps from `value` in `list`, around the ends. */
export function cycle<T>(list: readonly T[], value: T, delta: number): T {
  return list[(list.indexOf(value) + delta + list.length) % list.length]!;
}

/** Selects `row` among rows that depend on the values just changed: built once to find it, once to show it selected. */
export function selectRow(prompt: Prompt, row: string, refresh: () => void): void {
  prompt.index = -1;
  prompt.ids = [];
  refresh();
  prompt.index = prompt.ids.indexOf(row);
  refresh();
}

/** A form that may not run keeps its values: the row the problem is about is selected again. */
export function selectProblem(prompt: Prompt, field: string, refresh: () => void): void {
  prompt.index = Math.max(0, prompt.ids!.indexOf(field));
  refresh();
}
