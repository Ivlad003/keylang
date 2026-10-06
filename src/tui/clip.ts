// The clip (ADR 0021): the built-in agent's face in the corner of the
// editor and the window of its chat. This module keeps where they stand,
// what lies under a cell of the pointer and what a press, a drag and F7 do
// to them; `clip-view.ts` draws them. The clip never speaks by itself: its
// window opens on a click or F7 only.

import { MERGE_CLICK } from "./actions.ts";
import type { MouseEvent } from "./input.ts";
import type { State } from "./state.ts";
import type { Rect } from "./view.ts";
import { stringWidth } from "./width.ts";

/** A cell of the screen, 0-based. */
export interface Cell {
  x: number;
  y: number;
}

/** The chat window of the clip. */
export interface ChatState {
  open: boolean;
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

export const CLIP_COLS = 5;
export const CLIP_ROWS = 3;
/** Below this many columns or rows the clip is a badge in the status line and the window takes the width. */
export const NARROW_COLS = 60;
export const NARROW_ROWS = 12;
/** The window's size with its frame. */
export const CHAT_COLS = 40;
export const CHAT_ROWS = 10;
/** The window's height on a narrow terminal. */
export const NARROW_CHAT_ROWS = 8;

export function newClip(): ClipState {
  return { enabled: true, place: null, waiting: false, questions: 0, chat: { open: false } };
}

/** Whether the terminal is too small for the clip in its corner. */
export function narrow(size: Pick<State, "cols" | "rows">): boolean {
  return size.cols < NARROW_COLS || size.rows < NARROW_ROWS;
}

/** The clip and its window take part in the frame: the start screen and the F6 panel cover them. */
export function assistantShown(state: Pick<State, "start" | "results">): boolean {
  return state.start === null && !(state.results.open && !state.results.viewing);
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

/** `rect` moved as little as it takes to lie inside `area` (where it is wider, from the area's start). */
export function inside(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width)),
    y: Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height)),
  };
}

export function contains(rect: Rect, cell: Cell): boolean {
  return cell.x >= rect.x && cell.x < rect.x + rect.width && cell.y >= rect.y && cell.y < rect.y + rect.height;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Where the clip stands, whether it is drawn or not: where it was dragged,
 * else the editor's bottom-right corner one cell in; always inside the
 * terminal, so a smaller terminal moves it in.
 */
export function clipPlace(state: Pick<State, "cols" | "rows" | "clip">, editor: Rect): Rect {
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
 * The chat window: above the clip, its right edge at the clip's (below it
 * when there is no room above), inside the terminal and above the detail
 * line; on a narrow terminal the whole width above the detail line.
 */
export function chatRect(state: Pick<State, "cols" | "rows" | "clip">, editor: Rect): Rect {
  if (narrow(state)) {
    const height = Math.max(1, Math.min(NARROW_CHAT_ROWS, state.rows - 3));
    return { x: 0, y: state.rows - 2 - height, width: state.cols, height };
  }
  const area: Rect = { x: 0, y: 1, width: state.cols, height: Math.max(1, state.rows - 3) };
  const width = Math.min(CHAT_COLS, area.width);
  const height = Math.min(CHAT_ROWS, area.height);
  const clip = clipPlace(state, editor);
  const y = clip.y - height >= area.y ? clip.y - height : clip.y + CLIP_ROWS;
  return inside({ x: clip.x + CLIP_COLS - width, y, width, height }, area);
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
type Target = "clip" | "badge" | "window";

/** A press of the left button on the clip, its badge or its window, until the release. */
interface Press {
  target: Target;
  /** The cell the button went down on. */
  from: Cell;
  /** The clip's place then: a drag moves it by the pointer's offset. */
  origin: Rect;
  /** The pointer left that cell: the release ends a drag, not a click. */
  moved: boolean;
}

/** The clip's keys and pointer: a click opens the chat, a drag moves the clip, F7 opens and folds the chat. */
export class Clip {
  private readonly host: ClipHost;
  private press: Press | null = null;

  constructor(host: ClipHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** F7: opens the chat, or folds it. MERGE takes no clicks and so no F7: it would leave the decisions. */
  toggle(): void {
    if (this.state.mode === "merge") {
      this.state.message = MERGE_CLICK;
      return;
    }
    const chat = this.state.clip.chat;
    chat.open = !chat.open;
  }

  /** A click on the clip or its badge: the chat opens. */
  open(): void {
    this.state.clip.chat.open = true;
  }

  /**
   * A pointer event: true when it was the clip's, its badge's or its
   * window's (they are on top of the editor and the panels); false leaves it
   * to the session. A click is a press and a release in the same cell; a
   * drag moves the clip. In MERGE a press is left to the session, which
   * answers it as any click there.
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
    if (target === null) return false;
    // The pointer over the clip points at it, not at the text under it.
    if (event.action === "move") {
      if (this.state.hover?.source === "mouse") this.state.hover = null;
      return true;
    }
    // The wheel over the clip scrolls the editor under it.
    if (event.action === "wheel-up" || event.action === "wheel-down") return target === "window";
    if (this.state.mode === "merge") return false;
    // A form or the help is over the clip and its window: it takes no clicks while they are open.
    if (this.state.help || this.state.prompt !== null) return true;
    if (event.button === 0) this.press = { target, from: { x: event.x, y: event.y }, origin: clipPlace(this.state, this.host.editor()), moved: false };
    return true;
  }

  /** What is under a cell: the window is over the clip, the clip over the editor. */
  private targetAt(cell: Cell): Target | null {
    const state = this.state;
    if (state.clip.chat.open && contains(chatRect(state, this.host.editor()), cell)) return "window";
    const clip = this.host.clipOnScreen();
    if (clip !== null && contains(clip, cell)) return "clip";
    const badge = badgeRect(state);
    if (badge !== null && contains(badge, cell)) return "badge";
    return null;
  }

  /** The pointer at `cell` with the button down: the clip follows it, inside the terminal. */
  private dragTo(press: Press, cell: Cell): void {
    const dx = cell.x - press.from.x;
    const dy = cell.y - press.from.y;
    if (dx !== 0 || dy !== 0) press.moved = true;
    if (press.target !== "clip") return;
    const moved = inside({ ...press.origin, x: press.origin.x + dx, y: press.origin.y + dy }, clipArea(this.state));
    this.state.clip.place = { x: moved.x, y: moved.y };
  }

  private click(target: Target): void {
    if (target === "clip" || target === "badge") this.open();
  }
}
