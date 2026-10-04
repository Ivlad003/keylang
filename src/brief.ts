// Plain-language text → a brief: its first paragraph cut to two sentences.
// Doc comments (once an extractor strips their syntax) and model answers go
// through the same rule, so a brief reads the same whatever wrote it.

/** Past this many characters a brief is cut at a word and ends with `…`. */
export const BRIEF_MAX = 280;

/**
 * The first paragraph of `text` with whitespace collapsed, cut to its first
 * two sentences and to about `BRIEF_MAX` characters; null when nothing
 * is left. A sentence ends at `.`, `!` or `?` (closing quotes and brackets
 * after it included) before whitespace and an uppercase letter, or at the end
 * of the text: `e.g. this` and `a.b()` stay inside one sentence. The rule is
 * plain code-point matching, so the result does not depend on ICU or the Node version.
 */
export function briefOf(text: string): string | null {
  const paragraph = text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find((p) => p !== "");
  if (paragraph === undefined) return null;
  return capText(firstSentences(paragraph, 2), BRIEF_MAX);
}

const SENTENCE_END = /[.!?]["'»”’)\]]*(?=\s+\p{Lu})/gu;

function firstSentences(text: string, count: number): string {
  let seen = 0;
  for (const end of text.matchAll(SENTENCE_END)) {
    seen++;
    if (seen === count) return text.slice(0, end.index + end[0].length);
  }
  return text;
}

/**
 * The brief of a README: its first paragraph of prose that reads as a
 * sentence, through `briefOf`. Headings, fenced and indented code, HTML,
 * lists, quotes and tables are passed over; images and badges are dropped,
 * links keep their text, emphasis its words. A paragraph counts when at least
 * four words are left and one of them ends a sentence (`.`, `!`, `?`), so a
 * language switcher or a row of badges at the top is skipped. Null when no
 * paragraph counts.
 */
export function readmeBrief(markdown: string): string | null {
  for (const paragraph of proseParagraphs(markdown)) {
    const text = plainInline(paragraph);
    if (words(text) >= 4 && /[.!?](?:\s|$)/.test(text)) return briefOf(text);
  }
  return null;
}

/** Paragraphs of plain text, in order: blocks of non-blank lines that are not another kind of Markdown block. */
function proseParagraphs(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let comment = false;
  const flush = (): void => {
    if (current.length > 0) out.push(current.join("\n"));
    current = [];
  };
  for (const line of markdown.replace(/^﻿/, "").split(/\r?\n/)) {
    if (fence !== null) {
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      flush();
      fence = open[1]!;
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (/^ {0,3}<!--/.test(line)) {
      flush();
      comment = !line.includes("-->");
      continue;
    }
    // A setext underline makes the lines above it a heading, not a paragraph.
    if (current.length > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(line)) {
      current = [];
      continue;
    }
    // ATX heading, quote, table row, HTML block, list item, thematic break.
    if (/^ {0,3}(?:#{1,6}(?:\s|$)|[>|<]|(?:[-*+]|\d{1,9}[.)])(?:\s|$)|(?:\*\s*){3,}$|(?:_\s*){3,}$)/.test(line)) {
      flush();
      continue;
    }
    // Indented code starts only where no paragraph is open.
    if (current.length === 0 && /^(?: {4}|\t)/.test(line)) continue;
    current.push(line.trim());
  }
  flush();
  return out;
}

/** The words of an inline Markdown text: images and badges dropped, links as their text, no tags or emphasis marks. */
function plainInline(text: string): string {
  return text
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, " ")
    .replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g, " ")
    .replace(/\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/(^|[^\p{L}\p{N}*_])([*_])(?=\S)([^*_\n]*?\S)\2(?=[^\p{L}\p{N}*_]|$)/gu, "$1$3")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** At most `max` code points: cut at the last space before the limit, then `…`. */
export function capText(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s,;:–—-]+$/u, "")}…`;
}
