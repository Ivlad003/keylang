// Plain-language text → a brief: its first paragraph cut to two sentences.
// Doc comments (once an extractor strips their syntax) and model answers go
// through the same rule, so a brief reads the same whatever wrote it.
// Used wherever keylang shows a one-line description: the map, the tour and
// flow drafts. Entry points: `briefOf`, `firstSentence`, `readmeBrief`, `capText`.

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
  // Paragraphs are separated by a blank line (whitespace allowed); take the first non-empty one.
  const paragraph = text
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find((p) => p !== "");

  if (paragraph === undefined) return null;

  return capText(firstSentences(paragraph, 2), BRIEF_MAX);
}

/** The first sentence of the first paragraph of `text`, by the rule of `briefOf`; null when nothing is left. */
export function firstSentence(text: string): string | null {
  const brief = briefOf(text);

  return brief === null ? null : firstSentences(brief, 1);
}

// A sentence end: `.`, `!` or `?`, optionally followed by closing quotes or
// brackets, and then (lookahead) whitespace and an uppercase letter.
const SENTENCE_END = /[.!?]["'»”’)\]]*(?=\s+\p{Lu})/gu;

/** `text` up to the end of its `count`-th sentence, or all of it when it has fewer. */
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

    // Skip badge rows and language switchers: a real paragraph has some words and a sentence end.
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

  // Close the paragraph being collected, if any.
  const flush = (): void => {
    if (current.length > 0) out.push(current.join("\n"));
    current = [];
  };

  // A line-by-line scanner with two skip states: inside a fenced code block,
  // and inside a multi-line HTML comment. Any non-prose block ends the paragraph.
  // A leading BOM is removed first so it cannot hide a heading on line one.
  for (const line of markdown.replace(/^﻿/, "").split(/\r?\n/)) {
    // Inside a fence, wait for the closing fence that starts with the same marker.
    if (fence !== null) {
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }

    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }

    // A fence opens with three or more backticks or tildes, indented at most three spaces.
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

    // An HTML comment hides everything until `-->`, which may be on the same line.
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
    // A linked image (badge): `[![alt](img)](link)` is dropped entirely.
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, " ")
    // A plain image, inline `![alt](src)` or reference `![alt][ref]`.
    .replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g, " ")
    // A link, inline or reference: keep its text.
    .replace(/\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, "$1")
    // HTML tags.
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    // Strong emphasis `**x**` / `__x__`: keep the words.
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
    // Single `*x*` / `_x_` emphasis, only at word boundaries so `snake_case` survives.
    .replace(/(^|[^\p{L}\p{N}*_])([*_])(?=\S)([^*_\n]*?\S)\2(?=[^\p{L}\p{N}*_]|$)/gu, "$1$3")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many words `text` has: runs of letters and digits, with inner apostrophes and hyphens. */
function words(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** At most `max` code points: cut at the last space before the limit, then `…`. */
export function capText(text: string, max: number): string {
  const chars = [...text];

  if (chars.length <= max) return text;
  // Leave room for the ellipsis, cut at the last space, and drop dangling punctuation before `…`.
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");

  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s,;:–—-]+$/u, "")}…`;
}
