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

/** At most `max` code points: cut at the last space before the limit, then `…`. */
export function capText(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s,;:–—-]+$/u, "")}…`;
}
