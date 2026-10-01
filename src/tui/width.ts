// Terminal cell width of text: graphemes, not code units. A wide character
// (CJK, most emoji) takes two cells, combining marks and joiners none. The
// table is the usual East Asian Wide/Fullwidth ranges plus emoji blocks; a
// terminal may disagree on rare characters, which only shifts that one line.

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

function codePointWidth(cp: number): 0 | 1 | 2 {
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  for (const [lo, hi] of WIDE) if (cp >= lo && cp <= hi) return 2;
  return 1;
}

const COMBINING = /^\p{M}$/u;
/** Emoji shown as a picture by default (✅, 🚀), and a pictograph made one by VS16 (❤️). */
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const PICTOGRAPHIC = /^\p{Extended_Pictographic}/u;
const REGIONAL = /^\p{Regional_Indicator}{2}$/u;

/**
 * Cells one grapheme takes. An emoji cluster (a ZWJ sequence, a flag, a
 * pictograph with VS16) is one wide cell pair; otherwise the width of its
 * first visible code point.
 */
export function graphemeWidth(cluster: string): 0 | 1 | 2 {
  if (EMOJI_PRESENTATION.test(cluster) || REGIONAL.test(cluster) || (cluster.includes("\ufe0f") && PICTOGRAPHIC.test(cluster))) return 2;
  for (const ch of cluster) {
    if (COMBINING.test(ch)) continue;
    const width = codePointWidth(ch.codePointAt(0)!);
    if (width > 0) return width;
  }
  return 0;
}

export function stringWidth(text: string): number {
  let width = 0;
  for (const cluster of graphemes(text)) width += graphemeWidth(cluster);
  return width;
}

/** The longest prefix of `text` that fits in `width` cells. */
export function fitWidth(text: string, width: number): string {
  let used = 0;
  let out = "";
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
  const cut = fitWidth(text, width - 1);
  return cut + "…" + " ".repeat(width - 1 - stringWidth(cut));
}

/**
 * The part of `text` seen through a window `width` cells wide scrolled `left`
 * cells in: whole clusters only (a wide one cut by an edge becomes a blank),
 * with `…` at an edge that hides more text.
 */
export function sliceCells(text: string, left: number, width: number): string {
  if (width <= 0) return "";
  let used = 0;
  let out = "";
  let cut = false;
  for (const cluster of graphemes(text)) {
    const w = graphemeWidth(cluster);
    const at = used;
    used += w;
    if (used <= left) continue;
    if (at < left) {
      // Straddles the left edge: its visible half is a blank.
      out += " ".repeat(used - left);
      continue;
    }
    if (used - left > width) {
      cut = true;
      break;
    }
    out += cluster;
  }
  if (left > 0 && out !== "") {
    const [first, ...rest] = graphemes(out);
    out = `…${" ".repeat(Math.max(0, graphemeWidth(first!) - 1))}${rest.join("")}`;
  }
  if (cut) out = `${fitWidth(out, width - 1)}…`;
  return out;
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
  for (const cluster of graphemes(line)) {
    if (seen >= codePoints) return index;
    seen += [...cluster].length;
    index++;
  }
  return index;
}

/** UTF-16 offset of the first `clusters` graphemes of `line`. */
export function clusterOffset(line: string, clusters: number): number {
  return graphemes(line).slice(0, clusters).join("").length;
}
