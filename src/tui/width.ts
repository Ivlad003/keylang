// Terminal cell width of text: graphemes, not code units. A wide character
// (CJK, most emoji, a keycap) takes two cells; combining marks, joiners, the
// other invisible format characters (Default_Ignorable_Code_Point: ZWSP,
// soft hyphen, word joiner) and Hangul vowels and finals after their
// consonant take none, and a cluster of width 0 is never drawn, so no
// terminal can disagree about it. The table is the usual East Asian
// Wide/Fullwidth ranges plus emoji blocks; a terminal may disagree on rare
// characters, which only shifts that one line.
//
// Part of the TUI layer: every screen measures, cuts, pads and wraps text
// through these helpers. Entry points: `stringWidth`, `padWidth`,
// `sliceCells`, `wrapRuns`/`wrapCells`, and `layoutLine` with its
// binary-search queries `scrollToFit` and `clusterAtCell`.

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Grapheme clusters of a string, in order. */
export function graphemes(text: string): string[] {
  const out: string[] = [];

  for (const { segment } of segmenter.segment(text)) out.push(segment);

  return out;
}

/** The same clusters, segmented only as far as they are read: drawing a long line stops at the screen's edge. */
export function* clusters(text: string): Generator<string> {
  for (const { segment } of segmenter.segment(text)) yield segment;
}

/** Inclusive code-point ranges drawn two cells wide: Hangul Jamo leads, CJK, Hangul syllables, fullwidth forms and the emoji blocks. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
];

/** ZWJ, variation selectors, ZWSP, soft hyphen, word joiner, bidi marks, tags: nothing to draw. */
const IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;

function codePointWidth(cp: number): 0 | 1 | 2 {
  // C0 and C1 control characters move the cursor or do nothing; they are never drawn.
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;

  // Hangul vowels and finals (jungseong, jongseong) join the leading consonant before them.
  if ((cp >= 0x1160 && cp <= 0x11ff) || (cp >= 0xd7b0 && cp <= 0xd7ff)) return 0;

  if (cp >= 0xa0 && IGNORABLE.test(String.fromCodePoint(cp))) return 0;

  // A linear scan is enough: the table is short and most text is ASCII, which falls through every range.
  for (const [lo, hi] of WIDE) if (cp >= lo && cp <= hi) return 2;

  return 1;
}

/** A single combining mark (accents, enclosing marks): drawn on the cell of the character before it. */
const COMBINING = /^\p{M}$/u;

/** Emoji shown as a picture by default (✅, 🚀), and a pictograph made one by VS16 (❤️). */
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;

/** A cluster that starts with a pictograph, which VS16 can turn into a two-cell emoji. */
const PICTOGRAPHIC = /^\p{Extended_Pictographic}/u;

/** A flag: exactly two regional indicator letters. */
const REGIONAL = /^\p{Regional_Indicator}{2}$/u;

/** COMBINING ENCLOSING KEYCAP: a keycap (`1` VS16 U+20E3) is drawn as an emoji picture. */
const KEYCAP = "\u20e3";

/**
 * Cells one grapheme takes. An emoji cluster (a ZWJ sequence, a flag, a
 * keycap, a pictograph with VS16) is one wide cell pair; otherwise the width
 * of its first visible code point.
 */
export function graphemeWidth(cluster: string): 0 | 1 | 2 {
  // Emoji clusters first: their parts measured one by one would give the wrong width.
  if (EMOJI_PRESENTATION.test(cluster) || REGIONAL.test(cluster) || cluster.includes(KEYCAP) || (cluster.includes("\ufe0f") && PICTOGRAPHIC.test(cluster))) return 2;

  // Otherwise the first code point that is not a combining mark decides; marks ride on it.
  for (const ch of cluster) {
    if (COMBINING.test(ch)) continue;
    const width = codePointWidth(ch.codePointAt(0)!);

    if (width > 0) return width;
  }

  return 0;
}

/** Total terminal cells of `text`, summed over its grapheme clusters. */
export function stringWidth(text: string): number {
  let width = 0;

  for (const cluster of graphemes(text)) width += graphemeWidth(cluster);

  return width;
}

/** The longest prefix of `text` that fits in `width` cells. */
export function fitWidth(text: string, width: number): string {
  let used = 0;
  let out = "";

  // Take whole clusters while they fit; a wide cluster that would straddle the edge is left out.
  for (const cluster of graphemes(text)) {
    const w = graphemeWidth(cluster);

    if (used + w > width) break;
    used += w;
    out += cluster;
  }

  return out;
}

/** `text` cut or padded with spaces to exactly `width` cells; a cut ends with `…`. */
export function padWidth(text: string, width: number): string {
  if (width <= 0) return "";
  const w = stringWidth(text);

  if (w <= width) return text + " ".repeat(width - w);

  // Too long: keep one cell for the ellipsis, then pad again since a wide cluster may leave a gap.
  const cut = fitWidth(text, width - 1);

  return cut + "…" + " ".repeat(width - 1 - stringWidth(cut));
}

/**
 * The part of `text` seen through a window `width` cells wide scrolled `left`
 * cells in: whole clusters only, with `…` at an edge that hides more text.
 * On the left `…` never covers a cluster in view: it takes the visible half
 * of a wide cluster the edge cuts, else a cell of its own before the text
 * from `left` on. On the right it takes the last cell. A text scrolled past
 * its end shows nothing.
 */
export function sliceCells(text: string, left: number, width: number): string {
  if (width <= 0) return "";
  let used = 0;
  let room = width;
  let out = "";
  let cut = false;
  let marked = left <= 0;

  // Walk clusters with `used` as the cell where the next one starts. Clusters
  // wholly left of the window are skipped; the first one in view triggers the
  // left marker; the first one that no longer fits ends the walk.
  for (const cluster of graphemes(text)) {
    const w = graphemeWidth(cluster);
    const at = used;
    used += w;

    if (used <= left) continue;

    if (!marked) {
      marked = true;
      out = "…";
      room--;

      // Straddles the left edge: its visible half is the marker's cell.
      if (at < left) continue;
    }

    if (w > room) {
      cut = true;
      break;
    }

    out += cluster;
    room -= w;
  }

  // Something was hidden on the right: give its last cell to the marker.
  if (cut) out = `${fitWidth(out, width - 1)}…`;

  return out;
}

/** A piece of text in one style: what `wrapRuns` breaks into rows. */
export interface StyledText<S> {
  text: string;
  style: S;
}

/**
 * Word-wraps runs of styled text into rows of `width` cells. A run splits
 * after each space; a word goes to the next row when it does not fit —
 * measured without the spaces after it, which stay at the end of its row —
 * and a word wider than a whole row is cut between clusters and goes on in
 * the next one, so no text is lost at the edge. Rows after the first start
 * with `hang` spaces in the style `blank` (the indent of a list item).
 */
export function wrapRuns<S>(runs: readonly StyledText<S>[], width: number, hang: number, blank: S): StyledText<S>[][] {
  const rows: StyledText<S>[][] = [];
  let row: StyledText<S>[] = [];
  let used = 0;

  // Close the current row and open the next one with the hanging indent.
  const flush = (): void => {
    rows.push(row);
    row = hang > 0 ? [{ text: " ".repeat(hang), style: blank }] : [];
    used = hang;
  };

  for (const run of runs) {
    // Split after every space so each piece is a word plus its trailing spaces.
    for (let word of run.text.split(/(?<= )/u)) {
      // Move the word down when it does not fit, unless the row is still empty (nothing would be gained).
      if (used + stringWidth(word.trimEnd()) > width && used > hang) flush();

      // Wider than the room after the hang: a row's worth at a time, at least one cluster each.
      while (width > hang && used + stringWidth(word.trimEnd()) > width) {
        const part = fitWidth(word, width - used) || graphemes(word)[0]!;

        if (part === word) break;
        row.push({ text: part, style: run.style });
        word = word.slice(part.length);
        flush();
      }

      row.push({ text: word, style: run.style });
      used += stringWidth(word);
    }
  }

  rows.push(row);

  return rows;
}

/** `text` word-wrapped to rows of at most `width` cells (`wrapRuns`); the spaces at a break are left out. */
export function wrapCells(text: string, width: number): string[] {
  if (width <= 0) return [text];
  // Wrap as a single unstyled run, then drop the trailing spaces each break left at a row's end.
  const rows = wrapRuns([{ text, style: null }], width, 0, null).map((row) => row.map((run) => run.text).join(""));

  return rows.map((row, index) => (index < rows.length - 1 ? row.trimEnd() : row));
}

/** Cells a cluster takes in a `Grid`: a tab is drawn as one blank cell. */
export function cellWidth(cluster: string): number {
  return cluster === "\t" ? 1 : graphemeWidth(cluster);
}

/**
 * One line cut into clusters once, with prefix sums: the cells, code points
 * and UTF-16 units before each cluster (index `clusters.length` is the whole
 * line). Scrolling, drawing and hit-testing then take constant or
 * logarithmic time per question instead of segmenting the line again.
 */
export interface LineLayout {
  readonly clusters: readonly string[];
  readonly cells: Uint32Array;
  readonly points: Uint32Array;
  readonly units: Uint32Array;
}

/** Segments `line` once and builds the `LineLayout` prefix sums for it. */
export function layoutLine(line: string): LineLayout {
  const clusters = graphemes(line);
  const cells = new Uint32Array(clusters.length + 1);
  const points = new Uint32Array(clusters.length + 1);
  const units = new Uint32Array(clusters.length + 1);

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!;
    cells[i + 1] = cells[i]! + cellWidth(cluster);
    points[i + 1] = points[i]! + [...cluster].length;
    units[i + 1] = units[i]! + cluster.length;
  }

  return { clusters, cells, points, units };
}

/** The smallest first cluster from `left` on such that clusters `[first, col)` fit in `width` cells. */
export function scrollToFit(layout: LineLayout, left: number, col: number, width: number): number {
  let lo = Math.min(left, col);
  let hi = col;

  // Binary search over `cells`: it is non-decreasing, so the width of
  // `[mid, col)` shrinks as `mid` grows.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (layout.cells[col]! - layout.cells[mid]! > width) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

/** The cluster under cell `x` of a line drawn from cluster `left`; past the end, the end. */
export function clusterAtCell(layout: LineLayout, left: number, x: number): number {
  const n = layout.clusters.length;
  const base = layout.cells[Math.min(left, n)]!;
  // The first cluster from `left` whose right edge is past `x`.
  let lo = Math.min(left, n);
  let hi = n;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (layout.cells[mid + 1]! - base > x) hi = mid;
    else lo = mid + 1;
  }

  return lo;
}

/** Grapheme index of a code-point column in `line` (a column inside a cluster maps to that cluster). */
export function clusterAt(line: string, codePoints: number): number {
  let seen = 0;
  let index = 0;

  // Count code points cluster by cluster until the column falls inside one.
  for (const cluster of graphemes(line)) {
    seen += [...cluster].length;

    if (seen > codePoints) return index;
    index++;
  }

  return index;
}

/** UTF-16 offset of the first `clusters` graphemes of `line`. */
export function clusterOffset(line: string, clusters: number): number {
  return graphemes(line).slice(0, clusters).join("").length;
}
