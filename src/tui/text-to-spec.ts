// `Ctrl+G`: free text → keylang items, deterministically (no LLM). Clauses
// that start with `when`/`if` become `when` (with a nested `then` for the
// `then` part), `emits x` becomes `emits`, an
// `invariant: …` becomes `invariant`, and a clause that names a known ID —
// or the last segment of exactly one function — becomes `step`. The source
// text stays where it was, as description; the items follow it. The result
// is a proposal for MERGE, never written directly.
// Layer: TUI. The editor's `Ctrl+G` key feeds the result to the merge view.
//
// The patterns accept English and Ukrainian keywords.

/** `when <cond>[, then <action>]`: group 1 is the condition, group 2 the optional `then` part. */
const WHEN = /^(?:when|if|коли|якщо)\s+(.+?)(?:,?\s+(?:then|тоді|то)\s+(.+))?$/iu;

/** A sentence that starts with `then`; group 1 is the action. */
const THEN = /^(?:then|тоді|потім)\s+(.+)$/iu;

/** `emits [event] <name>` anywhere in a clause; group 1 is the event name. */
const EMITS = /(?:emits?|емітить|публікує)\s+(?:event\s+|подію\s+)?([\p{L}_][\p{L}\p{N}_.-]*)/iu;

/** `invariant: <text>` at the start of a clause; group 1 is the text. */
const INVARIANT = /^(?:invariant|інваріант)\s*:?\s+(.+)$/iu;

/** A dotted identifier (two or more segments), a candidate ID. */
const DOTTED = /[\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)+/gu;

/** A single identifier word, matched against the last segment of functions. */
const WORD = /[\p{L}_$][\p{L}\p{N}_$-]*/gu;

/** Sentences of the text. A line break inside a paragraph is a wrapped line, not a clause boundary; a blank line is. */
function clauses(text: string): string[] {
  // Split paragraphs on blank lines, join wrapped lines, split sentences after
  // `.;!?`, then drop the closing punctuation and empty pieces.
  return text
    .split(/\n\s*\n/u)
    .flatMap((paragraph) => paragraph.replace(/\s*\n\s*/gu, " ").split(/(?<=[.;!?])\s+/u))
    .map((clause) => clause.trim().replace(/[.;!?]+$/u, "").trim())
    .filter((clause) => clause !== "");
}

/** A known ID named in a clause: a dotted ID, else a word that is the last segment of exactly one callable. */
function idIn(clause: string, known: readonly string[], callables: readonly string[]): string | null {
  const ids = new Set(known);

  // A dotted ID counts only when it is known exactly.
  for (const match of clause.matchAll(DOTTED)) if (ids.has(match[0])) return match[0];

  // Otherwise a single word that ends exactly one function's ID; an ambiguous word names nothing.
  for (const match of clause.matchAll(WORD)) {
    const word = match[0];
    const hits = callables.filter((id) => id.endsWith(`.${word}`));

    if (hits.length === 1) return hits[0]!;
  }

  return null;
}

/**
 * Items for the text, indented under `indent` spaces. `known` are IDs of the
 * snapshot and `planned` declarations; `callables` the functions among them.
 */
export function textToSpec(text: string, indent: number, known: readonly string[], callables: readonly string[]): string[] {
  const pad = " ".repeat(indent);
  const out: string[] = [];
  // A `when` without its `then` part; the next sentence may be it ("When x. Then y.").
  let openWhen = false;

  // Each clause yields at most one item kind, tried in a fixed order:
  // invariant, when, then, emits, then a step by ID; a clause with none is skipped.
  for (const clause of clauses(text)) {
    const wasOpen = openWhen;
    openWhen = false;
    const invariant = INVARIANT.exec(clause);

    if (invariant) {
      out.push(`${pad}- invariant ${invariant[1]}`);
      continue;
    }

    const when = WHEN.exec(clause);

    if (when) {
      out.push(`${pad}- when ${when[1]}`);

      if (when[2]) out.push(...thenItems(when[2], `${pad}  `, known, callables, true));
      else openWhen = true;
      continue;
    }

    const then = THEN.exec(clause);

    if (then) {
      // `then` is allowed only under `when`; on its own it keeps only a step or an event.
      out.push(...(wasOpen ? thenItems(then[1]!, `${pad}  `, known, callables, true) : thenItems(then[1]!, pad, known, callables, false)));
      continue;
    }

    const emits = EMITS.exec(clause);

    if (emits) {
      out.push(`${pad}- emits ${emits[1]}`);
      continue;
    }

    const id = idIn(clause, known, callables);

    if (id) out.push(`${pad}- step ${id}`);
  }

  return out;
}

/**
 * The items for a `then` part: an event, else a step, else (only under a
 * `when`) the text itself as `then`.
 */
function thenItems(text: string, pad: string, known: readonly string[], callables: readonly string[], underWhen: boolean): string[] {
  const emits = EMITS.exec(text);

  if (emits) return [`${pad}- emits ${emits[1]}`];
  const id = idIn(text, known, callables);

  if (id) return [`${pad}- step ${id}`];

  return underWhen ? [`${pad}- then ${text}`] : [];
}
