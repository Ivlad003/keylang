// A frame of the terminal as a grid of cells, and the ANSI that turns one
// frame into the next. Views draw into a `Grid`; only changed rows are sent,
// so the same output works on a real terminal and on xterm.js in a browser.
// Tests read `Grid.lines()` instead of parsing escape sequences.

import { graphemes, graphemeWidth } from "./width.ts";

/** 256-colour palette index. */
export type Color = number;

export interface Style {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  /** OSC 8 hyperlink target. */
  link?: string;
}

interface Cell {
  /** The grapheme; "" for the second cell of a wide one. */
  ch: string;
  style: Style;
}

const PLAIN: Style = {};

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly cells: Cell[][];
  /** Where the terminal cursor is shown, or null to hide it. */
  cursor: { x: number; y: number } | null = null;

  constructor(cols: number, rows: number) {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => ({ ch: " ", style: PLAIN })));
  }

  /** Writes `text` from (x, y), clipped to `limit` cells; returns the cells used. */
  write(x: number, y: number, text: string, style: Style = PLAIN, limit = this.cols - x): number {
    if (y < 0 || y >= this.rows) return 0;
    const end = Math.min(this.cols, x + Math.max(0, limit));
    let col = x;
    for (const cluster of graphemes(text)) {
      const width = cluster === "\t" ? 1 : graphemeWidth(cluster);
      if (width === 0) continue;
      if (col + width > end) break;
      if (col >= 0) {
        this.clearWide(col, y);
        this.cells[y]![col] = { ch: cluster === "\t" ? " " : cluster, style };
        if (width === 2) {
          this.clearWide(col + 1, y);
          this.cells[y]![col + 1] = { ch: "", style };
        }
      }
      col += width;
    }
    return col - x;
  }

  fill(x: number, y: number, width: number, height: number, style: Style = PLAIN): void {
    for (let row = y; row < Math.min(this.rows, y + height); row++) {
      for (let col = Math.max(0, x); col < Math.min(this.cols, x + width); col++) {
        this.clearWide(col, row);
        this.cells[row]![col] = { ch: " ", style };
      }
    }
  }

  /** Restyles cells without changing their text (selection, highlight). */
  restyle(x: number, y: number, width: number, patch: Style): void {
    if (y < 0 || y >= this.rows) return;
    for (let col = Math.max(0, x); col < Math.min(this.cols, x + width); col++) {
      const cell = this.cells[y]![col]!;
      this.cells[y]![col] = { ch: cell.ch, style: { ...cell.style, ...patch } };
    }
  }

  /** A wide character split by an overwrite leaves no half behind. */
  private clearWide(col: number, row: number): void {
    const line = this.cells[row]!;
    if (line[col]?.ch === "" && col > 0 && line[col - 1]) line[col - 1] = { ch: " ", style: line[col - 1]!.style };
    if (line[col + 1]?.ch === "" && line[col]) line[col + 1] = { ch: " ", style: line[col + 1]!.style };
  }

  /** Plain text of each row, trailing spaces kept. */
  lines(): string[] {
    return this.cells.map((row) => row.map((cell) => cell.ch).join(""));
  }

  /** The style of one cell (tests check colours and emphasis this way). */
  styleAt(x: number, y: number): Style {
    return this.cells[y]?.[x]?.style ?? PLAIN;
  }

  row(y: number): readonly Cell[] {
    return this.cells[y] ?? [];
  }
}

const ESC = "\x1b";

function sgr(style: Style): string {
  const codes = ["0"];
  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.inverse) codes.push("7");
  if (style.fg !== undefined) codes.push(`38;5;${style.fg}`);
  if (style.bg !== undefined) codes.push(`48;5;${style.bg}`);
  return `${ESC}[${codes.join(";")}m`;
}

/**
 * An OSC 8 target that is safe to send: a control character (ESC, BEL, C1)
 * would end the sequence early and let the rest of a URL from a spec reach
 * the terminal as its own escape sequence. Such a link is dropped.
 */
export function safeLink(link: string | undefined): string | undefined {
  if (link === undefined || link === "" || /[\x00-\x1f\x7f-\x9f]/.test(link)) return undefined;
  return link;
}

function sameStyle(a: Style, b: Style): boolean {
  return a.fg === b.fg && a.bg === b.bg && !a.bold === !b.bold && !a.dim === !b.dim && !a.italic === !b.italic && !a.underline === !b.underline && !a.inverse === !b.inverse && a.link === b.link;
}

function rowEqual(a: readonly Cell[], b: readonly Cell[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.ch !== b[i]!.ch || !sameStyle(a[i]!.style, b[i]!.style)) return false;
  return true;
}

/** ANSI that turns `prev` into `next` on screen; a full repaint when there is no `prev` or the size changed. */
export function renderDiff(prev: Grid | null, next: Grid): string {
  const full = prev === null || prev.cols !== next.cols || prev.rows !== next.rows;
  let out = `${ESC}[?25l`;
  if (full) out += `${ESC}[0m${ESC}[2J`;
  for (let y = 0; y < next.rows; y++) {
    const cells = next.row(y);
    if (!full && rowEqual(prev.row(y), cells)) continue;
    out += `${ESC}[${y + 1};1H`;
    let style: Style | null = null;
    for (const cell of cells) {
      if (cell.ch === "") continue;
      if (style === null || !sameStyle(style, cell.style)) {
        const link = safeLink(cell.style.link);
        const open = safeLink(style?.link);
        if (open && open !== link) out += `${ESC}]8;;${ESC}\\`;
        out += sgr(cell.style);
        if (link && link !== open) out += `${ESC}]8;;${link}${ESC}\\`;
        style = cell.style;
      }
      out += cell.ch;
    }
    if (safeLink(style?.link)) out += `${ESC}]8;;${ESC}\\`;
    out += `${ESC}[0m`;
  }
  if (next.cursor) out += `${ESC}[${next.cursor.y + 1};${next.cursor.x + 1}H${ESC}[?25h`;
  return out;
}

/** Entering and leaving the TUI: alternate screen, SGR mouse with motion, bracketed paste. */
export const ENTER = `${ESC}[?1049h${ESC}[?25l${ESC}[?1000h${ESC}[?1002h${ESC}[?1003h${ESC}[?1006h${ESC}[?2004h`;
export const LEAVE = `${ESC}[?2004l${ESC}[?1006l${ESC}[?1003l${ESC}[?1002l${ESC}[?1000l${ESC}[0m${ESC}[?25h${ESC}[?1049l`;
