// Drawing the clip (ADR 0021): the figure in the editor's corner and the
// window of its chat. Where they stand comes from `clip.ts`; `view.ts`
// calls these in its order of layers.

import { clipEyes, counterText, type ClipState } from "./clip.ts";
import { drawBox, type Grid, type Style } from "./screen.ts";
import type { State } from "./state.ts";
import { MARK_STYLE, THEME } from "./theme.ts";
import type { Rect } from "./view.ts";
import { graphemes, stringWidth } from "./width.ts";

const WIRE: Style = { fg: 110 };
const EYES: Style = { fg: 231, bold: true };

/** The badge in the status line of a narrow terminal. */
export const BADGE_STYLE: Style = { ...THEME.status, fg: 117, bold: true };

/**
 * The clip, 5×3 cells over the editor, on the background of what is under
 * it, and the counter of open questions right of its top row (left of it at
 * the terminal's right edge).
 */
export function drawClip(grid: Grid, rect: Rect, clip: ClipState): void {
  const rows = [`╭─${clipEyes(clip)}╮`, "│╭─╮│", "╰╯ ╰╯"];
  rows.forEach((row, dy) => {
    graphemes(row).forEach((cell, dx) => {
      const x = rect.x + dx;
      const y = rect.y + dy;
      const eye = dy === 0 && (dx === 2 || dx === 3);
      grid.write(x, y, cell, { ...(eye ? EYES : WIRE), ...bgAt(grid, x, y) });
    });
  });
  const counter = counterText(clip.questions);
  if (counter === "") return;
  const right = rect.x + rect.width;
  const x = right + stringWidth(counter) <= grid.cols ? right : rect.x - stringWidth(counter);
  grid.write(x, rect.y, counter, { ...MARK_STYLE.question, ...bgAt(grid, x, rect.y) });
}

/** The background of a cell, so the clip stands on the line under it. */
function bgAt(grid: Grid, x: number, y: number): Style {
  const bg = grid.styleAt(x, y).bg;
  return bg === undefined ? {} : { bg };
}

/** The chat window: a rounded frame titled with the clip's eyes. */
export function drawChat(grid: Grid, state: State, rect: Rect): void {
  drawBox(grid, rect, `${clipEyes(state.clip)} скрепка`, { ...THEME.popup, fg: 75 }, THEME.popupTitle, true);
}
