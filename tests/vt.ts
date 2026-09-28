// A minimal terminal for tests: applies the ANSI the TUI writes (cursor
// moves, clears, SGR, OSC 8) to a grid of cells, so a test reads what a
// terminal or xterm.js would show without a TTY.

import { graphemes, graphemeWidth } from "../src/tui/width.ts";

export class VirtualTerminal {
  cols: number;
  rows: number;
  private cells: string[][];
  private x = 0;
  private y = 0;
  private pending = "";
  /** OSC 8 targets seen, in order. */
  readonly links: string[] = [];

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = this.blank();
  }

  private blank(): string[][] {
    return Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => " "));
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.cells = this.blank();
  }

  feed(data: string): void {
    let text = this.pending + data;
    this.pending = "";
    while (text.length > 0) {
      if (text[0] === "\x1b") {
        const osc = /^\x1b\]8;;([^\x1b]*)\x1b\\/.exec(text);
        if (osc) {
          if (osc[1]) this.links.push(osc[1]);
          text = text.slice(osc[0].length);
          continue;
        }
        const csi = /^\x1b\[([?\d;]*)([A-Za-z])/.exec(text);
        if (!csi) {
          this.pending = text;
          return;
        }
        this.csi(csi[1]!, csi[2]!);
        text = text.slice(csi[0].length);
        continue;
      }
      const next = text.indexOf("\x1b");
      const chunk = next === -1 ? text : text.slice(0, next);
      for (const cluster of graphemes(chunk)) this.put(cluster);
      text = next === -1 ? "" : text.slice(next);
    }
  }

  private csi(params: string, final: string): void {
    if (final === "H") {
      const [row, col] = params.split(";").map((part) => Number(part || "1"));
      this.y = (row ?? 1) - 1;
      this.x = (col ?? 1) - 1;
    } else if (final === "J" && params === "2") this.cells = this.blank();
  }

  private put(cluster: string): void {
    if (cluster === "\r") {
      this.x = 0;
      return;
    }
    if (cluster === "\n") {
      this.y++;
      return;
    }
    const width = graphemeWidth(cluster);
    if (width === 0 || this.y >= this.rows) return;
    if (this.x < this.cols) this.cells[this.y]![this.x] = cluster;
    if (width === 2 && this.x + 1 < this.cols) this.cells[this.y]![this.x + 1] = "";
    this.x += width;
  }

  lines(): string[] {
    return this.cells.map((row) => row.join(""));
  }

  text(): string {
    return this.lines().join("\n");
  }
}
