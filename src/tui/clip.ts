// The clip (ADR 0021): the built-in agent's face in the corner of the
// editor and the window of its chat. This module keeps where they stand,
// what lies under a cell of the pointer, what a press, a drag and the keys
// do to them, and the conversation; `clip-view.ts` draws them. The clip
// never speaks by itself: its window opens on a click or F7 only.

import { MERGE_CLICK } from "./actions.ts";
import type { KeyEvent, MouseEvent } from "./input.ts";
import { backspaced } from "./prompt-keys.ts";
import type { State } from "./state.ts";
import type { Rect } from "./view.ts";
import { sliceCells, stringWidth, wrapCells } from "./width.ts";

/** A cell of the screen, 0-based. */
export interface Cell {
  x: number;
  y: number;
}

/** One message of the conversation: the person's or the clip's. */
export interface ChatMessage {
  role: "you" | "clip";
  text: string;
}

/** The chat window of the clip: where it stands, whether it has the keys, and the conversation. */
export interface ChatState {
  open: boolean;
  /** The keys go to the input line while no form, help or modal step is over the window (`chatTakesKeys`). */
  focused: boolean;
  /** The top-left cell once moved or resized; null: above the clip. */
  place: Cell | null;
  /** With the frame; a smaller terminal shows it smaller. */
  size: { cols: number; rows: number };
  /** Oldest first. Folding the window keeps it. */
  messages: ChatMessage[];
  /** The input line as typed: one line. */
  input: string;
  /** History rows scrolled back from its end; 0 shows the newest. */
  scroll: number;
}

/** The clip and its chat, as the session draws them. */
export interface ClipState {
  /** `assistant.clip` of the saved keylang.json: false hides the clip and its badge; F7 still opens the chat. */
  enabled: boolean;
  /** The clip's top-left cell once dragged; null: the editor's bottom-right corner. */
  place: Cell | null;
  /** A reply of the model is awaited: the eyes are ◔◔ instead of ◕◕. */
  waiting: boolean;
  /** Open questions, shown next to the clip; 0 shows no counter. */
  questions: number;
  chat: ChatState;
}

const CLIP_COLS = 5;
const CLIP_ROWS = 3;
/** Below this many columns or rows the clip is a badge in the status line and the window takes the width. */
const NARROW_COLS = 60;
const NARROW_ROWS = 12;
/** The window's size with its frame, and the least it is resized to. */
const CHAT_COLS = 40;
const CHAT_ROWS = 10;
const CHAT_MIN_COLS = 30;
const CHAT_MIN_ROWS = 7;
/** The window's height on a narrow terminal. */
const NARROW_CHAT_ROWS = 8;

/** Who said a message, before its first row; its other rows are indented under the text. */
const SPEAKER: Record<ChatMessage["role"], string> = { you: "ти › ", clip: "◕◕ › " };
const SPEAKER_CELLS = 5;

/** Rows the wheel scrolls the history by. */
const WHEEL_ROWS = 3;

/** What a narrow terminal answers to moving or resizing the window. */
const NARROW_WINDOW = "the chat window takes the whole width of a narrow terminal: it neither moves nor resizes";

export function newClip(): ClipState {
  return {
    enabled: true,
    place: null,
    waiting: false,
    questions: 0,
    chat: { open: false, focused: false, place: null, size: { cols: CHAT_COLS, rows: CHAT_ROWS }, messages: [], input: "", scroll: 0 },
  };
}

/** Whether the terminal is too small for the clip in its corner. */
function narrow(size: Pick<State, "cols" | "rows">): boolean {
  return size.cols < NARROW_COLS || size.rows < NARROW_ROWS;
}

/** The clip and its window take part in the frame: the start screen and the F6 panel cover them. */
export function assistantShown(state: Pick<State, "start" | "results">): boolean {
  return state.start === null && !(state.results.open && !state.results.viewing);
}

/**
 * The window takes the keys: open, focused, and nothing modal over it — a
 * form, the help, a save or quit step, MERGE (which takes no clicks either).
 */
export function chatTakesKeys(state: State): boolean {
  const chat = state.clip.chat;
  return chat.open && chat.focused && assistantShown(state) && state.mode !== "merge" && !state.help && state.prompt === null && state.barrier === null && state.quit === null;
}

/** `◕◕` waits; `◔◔` waits for the model's reply. */
export function clipEyes(clip: Pick<ClipState, "waiting">): string {
  return clip.waiting ? "◔◔" : "◕◕";
}

/** The counter of open questions next to the clip: nothing for none, `1`–`9`, then `9+`. */
export function counterText(questions: number): string {
  return questions <= 0 ? "" : questions > 9 ? "9+" : String(questions);
}

/** The badge that stands for the clip in the status line of a narrow terminal. */
export function badgeText(clip: Pick<ClipState, "waiting" | "questions">): string {
  const counter = counterText(clip.questions);
  return counter === "" ? clipEyes(clip) : `${clipEyes(clip)} ${counter}`;
}

/** The cells the clip may stand on: the terminal without the title row and the status line. */
function clipArea(state: Pick<State, "cols" | "rows">): Rect {
  return { x: 0, y: 1, width: state.cols, height: Math.max(1, state.rows - 2) };
}

/** The cells the window may take: below the title row, above the detail line, whose messages stay readable. */
function chatArea(state: Pick<State, "cols" | "rows">): Rect {
  return { x: 0, y: 1, width: state.cols, height: Math.max(1, state.rows - 3) };
}

/** `rect` moved as little as it takes to lie inside `area` (where it is wider, from the area's start). */
function inside(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width)),
    y: Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height)),
  };
}

function contains(rect: Rect, cell: Cell): boolean {
  return cell.x >= rect.x && cell.x < rect.x + rect.width && cell.y >= rect.y && cell.y < rect.y + rect.height;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/**
 * Where the clip stands, whether it is drawn or not: where it was dragged,
 * else the editor's bottom-right corner one cell in; always inside the
 * terminal, so a smaller terminal moves it in.
 */
function clipPlace(state: Pick<State, "cols" | "rows" | "clip">, editor: Rect): Rect {
  const corner = { x: editor.x + editor.width - CLIP_COLS - 1, y: editor.y + editor.height - CLIP_ROWS - 1 };
  return inside({ ...(state.clip.place ?? corner), width: CLIP_COLS, height: CLIP_ROWS }, clipArea(state));
}

/** The clip in the editor's corner; null when it is off or the terminal is narrow (a badge stands for it). */
export function clipRect(state: Pick<State, "cols" | "rows" | "clip">, editor: Rect): Rect | null {
  return state.clip.enabled && !narrow(state) ? clipPlace(state, editor) : null;
}

/** The badge at the start of the status line of a narrow terminal; null when the clip is in its corner or off. */
export function badgeRect(state: Pick<State, "cols" | "rows" | "clip">): Rect | null {
  if (!state.clip.enabled || !narrow(state)) return null;
  return { x: 1, y: state.rows - 1, width: stringWidth(badgeText(state.clip)), height: 1 };
}

/**
 * The clip does not cover what the person works on: a frame with the
 * editor's cursor under it, or a popup over it (the hover), draws no clip.
 */
export function clipYields(clip: Rect, cursor: Cell | null, popups: readonly Rect[]): boolean {
  return (cursor !== null && contains(clip, cursor)) || popups.some((popup) => overlaps(clip, popup));
}

/**
 * The chat window: where it was moved, else above the clip, its right edge
 * at the clip's (below it when there is no room above); inside the
 * terminal, above the detail line, and no bigger than that. On a narrow
 * terminal it takes the whole width above the detail line.
 */
export function chatRect(state: Pick<State, "cols" | "rows" | "clip">, editor: Rect): Rect {
  if (narrow(state)) {
    const height = Math.max(1, Math.min(NARROW_CHAT_ROWS, state.rows - 3));
    return { x: 0, y: state.rows - 2 - height, width: state.cols, height };
  }
  const chat = state.clip.chat;
  const area = chatArea(state);
  const width = Math.min(chat.size.cols, area.width);
  const height = Math.min(chat.size.rows, area.height);
  if (chat.place !== null) return inside({ ...chat.place, width, height }, area);
  const clip = clipPlace(state, editor);
  const y = clip.y - height >= area.y ? clip.y - height : clip.y + CLIP_ROWS;
  return inside({ x: clip.x + CLIP_COLS - width, y, width, height }, area);
}

/** What a cell of the window is to the pointer: `✕` folds it, the top edge moves it, the bottom-right corner resizes it, the rest focuses it. */
type ChatPart = "close" | "move" | "resize" | "window";

function chatPart(rect: Rect, cell: Cell): ChatPart | null {
  if (!contains(rect, cell)) return null;
  const right = rect.x + rect.width - 1;
  if (cell.y === rect.y) return cell.x >= right - 3 && cell.x < right ? "close" : "move";
  return cell.y === rect.y + rect.height - 1 && cell.x === right ? "resize" : "window";
}

/** The rows of a window: the history over the input line, one cell in from the frame. */
export function chatLayout(rect: Rect): { history: Rect; input: Rect } {
  const width = Math.max(1, rect.width - 4);
  return {
    history: { x: rect.x + 2, y: rect.y + 1, width, height: Math.max(0, rect.height - 3) },
    input: { x: rect.x + 2, y: rect.y + rect.height - 2, width, height: 1 },
  };
}

/**
 * The conversation as rows of `width` cells: each message after its
 * speaker, its lines wrapped by the shared wrap and indented under its text.
 */
export function historyRows(messages: readonly ChatMessage[], width: number): { role: ChatMessage["role"]; text: string }[] {
  const room = Math.max(1, width - SPEAKER_CELLS);
  const rows: { role: ChatMessage["role"]; text: string }[] = [];
  for (const message of messages) {
    let lead = SPEAKER[message.role];
    for (const line of message.text.split("\n")) {
      for (const row of line === "" ? [""] : wrapCells(line, room)) {
        rows.push({ role: message.role, text: `${lead}${row}` });
        lead = " ".repeat(SPEAKER_CELLS);
      }
    }
  }
  return rows;
}

/** The rows `height` rows of the history show, `scroll` rows back from its end; a short history starts at the top. */
export function shownHistory<T>(rows: readonly T[], height: number, scroll: number): T[] {
  const end = rows.length - clamp(scroll, 0, Math.max(0, rows.length - height));
  return rows.slice(Math.max(0, end - height), end);
}

/** The end of the input line that fits `room` cells: a longer line scrolls, and `…` marks what it hides on the left. */
export function inputTail(input: string, room: number): string {
  const width = stringWidth(input);
  return width <= room ? input : sliceCells(input, width - room + 1, room);
}

/** `rect` shifted by the offset, then kept inside `area`: a drag and Alt+arrows move the window the same way. */
function moved(rect: Rect, dx: number, dy: number, area: Rect): Cell {
  const to = inside({ ...rect, x: rect.x + dx, y: rect.y + dy }, area);
  return { x: to.x, y: to.y };
}

/** `rect` grown by the offset from its top-left: at least 30×7, at most to the area's right and bottom edges. */
function resized(rect: Rect, dx: number, dy: number, area: Rect): ChatState["size"] {
  const cols = area.x + area.width - rect.x;
  const rows = area.y + area.height - rect.y;
  return { cols: clamp(rect.width + dx, Math.min(CHAT_MIN_COLS, cols), cols), rows: clamp(rect.height + dy, Math.min(CHAT_MIN_ROWS, rows), rows) };
}

/** What the session gives the clip: its state and where the editor and the drawn clip are now. */
export interface ClipHost {
  readonly state: State;
  /** The editor's rectangle: the clip's default corner is in it. */
  editor(): Rect;
  /** The clip as this frame draws it; null when it is not drawn (off, narrow, yielding to the cursor or a popup). */
  clipOnScreen(): Rect | null;
}

/** What a press was on. */
type Target = "clip" | "badge" | ChatPart;

/** A press of the left button on the clip, its badge or its window, until the release. */
interface Press {
  target: Target;
  /** The cell the button went down on. */
  from: Cell;
  /** The pressed thing's rectangle then: a drag moves or resizes it by the pointer's offset. */
  origin: Rect;
  /** The pointer left that cell: the release ends a drag, not a click. */
  moved: boolean;
}

const ARROWS: Record<string, Cell> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

/**
 * The clip's pointer and keys: a click on it opens the chat, a drag moves it;
 * the window moves by its top edge, resizes by its bottom-right corner,
 * folds on `✕`, and while it has the focus its input line and history take
 * the keys. Every pointer action has a key: F7, Alt+arrows, Alt+Shift+arrows,
 * PgUp/PgDn and the palette's «Скрепка: повернути на місце».
 */
export class Clip {
  private readonly host: ClipHost;
  private press: Press | null = null;

  constructor(host: ClipHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /**
   * F7: a folded window opens with the focus, an open one gets the focus,
   * a focused one folds. MERGE takes no clicks and so no F7: it would leave
   * the decisions.
   */
  toggle(): void {
    if (this.state.mode === "merge") {
      this.state.message = MERGE_CLICK;
      return;
    }
    const chat = this.state.clip.chat;
    if (chat.open && chat.focused) return this.fold();
    this.open();
  }

  /** A click on the clip or its badge: the chat opens with the focus. */
  open(): void {
    this.state.clip.chat.open = true;
    this.focus();
  }

  /** The window takes the keys: the editor's completion, which waits for them, goes. */
  private focus(): void {
    this.state.clip.chat.focused = true;
    this.state.completion = null;
  }

  /** Esc, `✕`, or F7 on the focused window: it folds; the conversation stays. */
  fold(): void {
    const chat = this.state.clip.chat;
    chat.open = false;
    chat.focused = false;
  }

  /** Enter: the input line goes into the history as the person's message, and the history shows its end. An empty line sends nothing. */
  send(): void {
    const chat = this.state.clip.chat;
    const text = chat.input.trim();
    if (text === "") return;
    chat.messages.push({ role: "you", text });
    chat.input = "";
    chat.scroll = 0;
  }

  /** The palette's «Скрепка: повернути на місце»: the clip in its corner, the window above it at its default size. */
  reset(): void {
    const clip = this.state.clip;
    clip.place = null;
    clip.chat.place = null;
    clip.chat.size = { cols: CHAT_COLS, rows: CHAT_ROWS };
    this.state.message = "the clip is back in its corner, its window above it";
  }

  /** A key while the window has the focus (`chatTakesKeys`): its input line, its history and its place. */
  key(event: KeyEvent): void {
    const chat = this.state.clip.chat;
    const arrow = ARROWS[event.name];
    if (arrow !== undefined && event.alt) return this.nudge(arrow, event.shift);
    switch (event.name) {
      case "escape":
        return this.fold();
      case "enter":
        return this.send();
      case "pageup":
        return this.scrollBy(this.page());
      case "pagedown":
        return this.scrollBy(-this.page());
      case "backspace":
        chat.input = backspaced(chat.input);
        return;
    }
    if (event.text !== undefined && !event.ctrl && !event.alt) chat.input += event.text;
  }

  /** Text pasted while the window has the focus: one line, its breaks and tabs as spaces. */
  paste(text: string): void {
    this.state.clip.chat.input += text.replace(/\r\n|[\r\n\t]/g, " ");
  }

  /**
   * A pointer event: true when it was the clip's, its badge's or its
   * window's (they are over the editor and the panels); false leaves it to
   * the session. A click is a press and a release in the same cell; a drag
   * moves the clip or the window or resizes the window. A press elsewhere
   * takes the keys where it lands, and the window stays open. In MERGE a
   * press is left to the session, which answers it as any click there.
   */
  mouse(event: MouseEvent): boolean {
    if (!assistantShown(this.state)) return false;
    const press = this.press;
    if (event.action === "drag") {
      if (press === null) return false;
      this.dragTo(press, event);
      return true;
    }
    if (event.action === "up") {
      if (press === null) return false;
      this.press = null;
      // A terminal that reports no motion still says where the button came up.
      this.dragTo(press, event);
      if (!press.moved) this.click(press.target);
      return true;
    }
    const target = this.targetAt(event);
    if (target === null) {
      if (event.action === "down" && event.button === 0) this.state.clip.chat.focused = false;
      return false;
    }
    // The pointer over the clip or the window points at them, not at the text under them.
    if (event.action === "move") {
      if (this.state.hover?.source === "mouse") this.state.hover = null;
      return true;
    }
    // A form or the help is over them: they take no clicks and no wheel while it is open.
    const modal = this.state.help || this.state.prompt !== null;
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      // The wheel over the clip scrolls the editor under it; over the window, the history.
      if (target === "clip" || target === "badge") return false;
      if (!modal) this.scrollBy(event.action === "wheel-up" ? WHEEL_ROWS : -WHEEL_ROWS);
      return true;
    }
    if (this.state.mode === "merge") return false;
    if (modal) return true;
    if (event.button === 0) this.press = { target, from: { x: event.x, y: event.y }, origin: this.rectOf(target), moved: false };
    return true;
  }

  /** What is under a cell: the window is over the clip, the clip over the editor. */
  private targetAt(cell: Cell): Target | null {
    const state = this.state;
    const part = state.clip.chat.open ? chatPart(chatRect(state, this.host.editor()), cell) : null;
    if (part !== null) return part;
    const clip = this.host.clipOnScreen();
    if (clip !== null && contains(clip, cell)) return "clip";
    const badge = badgeRect(state);
    if (badge !== null && contains(badge, cell)) return "badge";
    return null;
  }

  private rectOf(target: Target): Rect {
    if (target === "clip") return clipPlace(this.state, this.host.editor());
    if (target === "badge") return badgeRect(this.state)!;
    return chatRect(this.state, this.host.editor());
  }

  /** The pointer at `cell` with the button down: the clip or the window follows it, inside the terminal. */
  private dragTo(press: Press, cell: Cell): void {
    const dx = cell.x - press.from.x;
    const dy = cell.y - press.from.y;
    if (dx !== 0 || dy !== 0) press.moved = true;
    const state = this.state;
    if (press.target === "clip") state.clip.place = moved(press.origin, dx, dy, clipArea(state));
    // On a narrow terminal the window takes the width: it does not move.
    else if (narrow(state)) return;
    else if (press.target === "move") state.clip.chat.place = moved(press.origin, dx, dy, chatArea(state));
    else if (press.target === "resize") {
      state.clip.chat.place = { x: press.origin.x, y: press.origin.y };
      state.clip.chat.size = resized(press.origin, dx, dy, chatArea(state));
    }
  }

  private click(target: Target): void {
    if (target === "clip" || target === "badge") return this.open();
    if (target === "close") return this.fold();
    this.focus();
  }

  /** Alt+arrows move the window a cell, Alt+Shift+arrows resize it: what a drag does. */
  private nudge(delta: Cell, resize: boolean): void {
    const state = this.state;
    if (narrow(state)) {
      state.message = NARROW_WINDOW;
      return;
    }
    const rect = chatRect(state, this.host.editor());
    const chat = state.clip.chat;
    if (resize) {
      chat.place = { x: rect.x, y: rect.y };
      chat.size = resized(rect, delta.x, delta.y, chatArea(state));
    } else chat.place = moved(rect, delta.x, delta.y, chatArea(state));
  }

  /** Rows PgUp and PgDn scroll the history by: its height but one. */
  private page(): number {
    return Math.max(1, chatLayout(chatRect(this.state, this.host.editor())).history.height - 1);
  }

  /** The history `rows` rows back (negative: forward), between its start and its end. */
  private scrollBy(rows: number): void {
    const chat = this.state.clip.chat;
    const { history } = chatLayout(chatRect(this.state, this.host.editor()));
    const total = historyRows(chat.messages, history.width).length;
    chat.scroll = clamp(chat.scroll + rows, 0, Math.max(0, total - history.height));
  }
}
