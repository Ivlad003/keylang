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
