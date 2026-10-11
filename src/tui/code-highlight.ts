// Lexical highlight for the built-in code viewer: comments, strings, numbers,
// keywords. It is a reading aid only; facts come from the snapshot.
// Layer: TUI drawing. The code viewer in `view.ts` calls `highlightCode`; it is
// language-agnostic (TS/JS, Rust, Python keywords share one set).

import type { Style } from "./screen.ts";
import type { Run } from "./theme.ts";

/** Keywords of the languages the viewer shows, in one set: TS/JS, Rust and Python. */
const KEYWORDS = new Set(
  "abstract as async await break case catch class const continue default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of private protected public readonly return static super switch this throw true try type typeof undefined var void while yield fn impl mod pub use struct trait match def self None True False".split(" "),
);

/** The style of each token class. */
const STYLE: Record<"comment" | "string" | "number" | "keyword" | "type", Style> = {
  comment: { fg: 243, italic: true },
  string: { fg: 180 },
  number: { fg: 141 },
  keyword: { fg: 176, bold: true },
  type: { fg: 81 },
};

/**
 * Runs per line (0-based line index). Block comments and template strings
 * spanning lines are followed across lines.
 */
export function highlightCode(lines: readonly string[]): Run[][] {
  // A block comment or a template string left open at the end of a line carries
  // into the next one through `block`.
  const out: Run[][] = [];
  let block: "comment" | "template" | null = null;

  for (const line of lines) {
    const chars = [...line];
    const runs: Run[] = [];
    let i = 0;

    const push = (start: number, end: number, style: Style): void => {
      if (end > start) runs.push({ start, end, style });
    };

    // Scan the line left to right; each branch consumes one token and emits its run.
    while (i < chars.length) {
      // Inside a block comment carried from earlier: colour up to and including `*/`, or the whole line.
      if (block === "comment") {
        const start = i;

        while (i < chars.length && !(chars[i] === "*" && chars[i + 1] === "/")) i++;

        if (i < chars.length) {
          i += 2;
          block = null;
        }

        push(start, i, STYLE.comment);
        continue;
      }

      // Inside a template string carried from earlier: colour up to the closing backtick, skipping escapes.
      if (block === "template") {
        const start = i;

        while (i < chars.length && chars[i] !== "`") i += chars[i] === "\\" ? 2 : 1;

        if (i < chars.length) {
          i++;
          block = null;
        }

        push(start, Math.min(i, chars.length), STYLE.string);
        continue;
      }

      const ch = chars[i]!;
      const next = chars[i + 1];

      // A line comment: `//` anywhere, or `#` as the first non-space character (Python, shell). It runs to the end.
      if ((ch === "/" && next === "/") || (ch === "#" && i === chars.findIndex((c) => c !== " "))) {
        push(i, chars.length, STYLE.comment);
        break;
      }

      // A block comment opens; the branch above colours it from here on.
      if (ch === "/" && next === "*") {
        block = "comment";
        continue;
      }

      // A template string: colour it to the closing backtick, or open `block` when it spans lines.
      if (ch === "`") {
        const start = i;
        i++;

        while (i < chars.length && chars[i] !== "`") i += chars[i] === "\\" ? 2 : 1;

        if (i >= chars.length) block = "template";
        else i++;
        push(start, Math.min(i, chars.length), STYLE.string);
        continue;
      }

      // A quoted string on one line; an unclosed one runs to the end of the line.
      if (ch === '"' || ch === "'") {
        const start = i;
        i++;

        while (i < chars.length && chars[i] !== ch) i += chars[i] === "\\" ? 2 : 1;
        i = Math.min(i + 1, chars.length);
        push(start, i, STYLE.string);
        continue;
      }

      // A number that does not continue an identifier (`x1` is a name); hex, `_`, `.` and the `n` of BigInt are taken in.
      if (/[0-9]/.test(ch) && (i === 0 || !/[\p{L}\p{N}_$]/u.test(chars[i - 1]!))) {
        const start = i;

        while (i < chars.length && /[0-9a-fA-FxX_.n]/.test(chars[i]!)) i++;
        push(start, i, STYLE.number);
        continue;
      }

      // An identifier: a keyword, a capitalised word (likely a type), or plain and not coloured.
      if (/[\p{L}_$]/u.test(ch)) {
        const start = i;

        while (i < chars.length && /[\p{L}\p{N}_$]/u.test(chars[i]!)) i++;
        const word = chars.slice(start, i).join("");

        if (KEYWORDS.has(word)) push(start, i, STYLE.keyword);
        else if (/^[A-Z]/.test(word)) push(start, i, STYLE.type);
        continue;
      }

      // Any other character (operator, space) is not coloured.
      i++;
    }

    out.push(runs);
  }

  return out;
}
