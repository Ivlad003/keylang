// Documentation comments without their syntax. Frontends decide which comment
// documents what; this module only turns comment source into text, lines kept,
// so the brief rule (`src/brief.ts`) can find the first paragraph.

/** A license or copyright notice: never documentation, wherever it stands. */
export function isLicense(text: string): boolean {
  return /SPDX-|copyright|\(c\)\s*\d|©/i.test(text);
}

/** `/** … *\/`, `/*! … *\/` or `/* … *\/` without delimiters and the ` * ` that starts each line. */
export function blockCommentBody(text: string): string {
  return text
    .replace(/^\/\*[*!]?/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*(?!\/) ?/, "").trimEnd())
    .join("\n");
}

/** Consecutive line comments (`//`, `///`, `//!`, `#`) as lines of text, one comment marker and one space removed from each. */
export function lineCommentsBody(lines: readonly string[], marker: RegExp): string {
  return lines.map((line) => line.trim().replace(marker, "").replace(/^ /, "").trimEnd()).join("\n");
}

/**
 * JSDoc text: the description before the first block tag (`@param`, `@returns`, …),
 * with inline `{@link x}` as `x` and `{@link x label}` / `{@link x|label}` as `label`.
 */
export function jsdocDescription(body: string): string {
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    if (/^\s*@\w/.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n").replace(/\{@link(?:code|plain)?\s+([^\s|}]+)(?:\s*\|\s*|\s+)?([^}]*)\}/g, (_, target: string, label: string) => (label.trim() !== "" ? label.trim() : target));
}

/** Text of the whole comment, or null when it has none: an empty comment, only tags, a directive. */
export function nonEmpty(text: string): string | null {
  return text.trim() === "" ? null : text;
}
