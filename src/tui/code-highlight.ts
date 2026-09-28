// Lexical highlight for the built-in code viewer: comments, strings, numbers,
// keywords. It is a reading aid only; facts come from the snapshot.

import type { Style } from "./screen.ts";
import type { Run } from "./theme.ts";

const KEYWORDS = new Set(
  "abstract as async await break case catch class const continue default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of private protected public readonly return static super switch this throw true try type typeof undefined var void while yield fn impl mod pub use struct trait match def self None True False".split(" "),
);

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
  const out: Run[][] = [];
  let block: "comment" | "template" | null = null;
  for (const line of lines) {
    const chars = [...line];
    const runs: Run[] = [];
    let i = 0;
    const push = (start: number, end: number, style: Style): void => {
      if (end > start) runs.push({ start, end, style });
    };
    while (i < chars.length) {
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
      if ((ch === "/" && next === "/") || (ch === "#" && i === chars.findIndex((c) => c !== " "))) {
        push(i, chars.length, STYLE.comment);
        break;
      }
      if (ch === "/" && next === "*") {
        block = "comment";
        continue;
      }
      if (ch === "`") {
        const start = i;
        i++;
        while (i < chars.length && chars[i] !== "`") i += chars[i] === "\\" ? 2 : 1;
        if (i >= chars.length) block = "template";
        else i++;
        push(start, Math.min(i, chars.length), STYLE.string);
        continue;
      }
      if (ch === '"' || ch === "'") {
        const start = i;
        i++;
        while (i < chars.length && chars[i] !== ch) i += chars[i] === "\\" ? 2 : 1;
        i = Math.min(i + 1, chars.length);
        push(start, i, STYLE.string);
        continue;
      }
      if (/[0-9]/.test(ch) && (i === 0 || !/[\p{L}\p{N}_$]/u.test(chars[i - 1]!))) {
        const start = i;
        while (i < chars.length && /[0-9a-fA-FxX_.n]/.test(chars[i]!)) i++;
        push(start, i, STYLE.number);
        continue;
      }
      if (/[\p{L}_$]/u.test(ch)) {
        const start = i;
        while (i < chars.length && /[\p{L}\p{N}_$]/u.test(chars[i]!)) i++;
        const word = chars.slice(start, i).join("");
        if (KEYWORDS.has(word)) push(start, i, STYLE.keyword);
        else if (/^[A-Z]/.test(word)) push(start, i, STYLE.type);
        continue;
      }
      i++;
    }
    out.push(runs);
  }
  return out;
}
