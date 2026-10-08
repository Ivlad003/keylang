// Event IDs (ADR 0022 п. 6, business-flows/08). An event is a node of the
// snapshot named by its literal, whoever dispatches it: a member of the
// generated top-level group `events` (`events.checkout_submit_all_after`).
// The ID does not depend on which module dispatches or observes the event,
// so a spec that names it survives code moving between modules. A name with
// characters an ID segment does not allow (`.`, `/`, a leading digit) is
// encoded; the node keeps the literal as `name`.

/** The generated group of event nodes: a reserved top-level name, like `external`. */
export const EVENTS_LAYER = "events";

/** A character an ID segment may hold after the first (docs/grammar.md, Додаток А: `segment`). */
const SEGMENT_REST = /[\p{L}\p{M}\p{N}_$-]/u;
const SEGMENT_FIRST = /[\p{L}_$]/u;

/**
 * The ID segment of an event name: every character a segment does not allow
 * becomes `-`, and a name that does not start like a segment gets `_` in
 * front (`sales.order.place` → `sales-order-place`, `2fa_passed` → `_2fa_passed`).
 */
export function eventSegment(name: string): string {
  const body = [...name.normalize("NFC")].map((ch) => (SEGMENT_REST.test(ch) ? ch : "-")).join("");
  return body !== "" && SEGMENT_FIRST.test([...body][0]!) ? body : `_${body}`;
}

/**
 * The ID of every event name, by name: `events.<segment>`. Two names with one
 * segment (`a.b` and `a-b`) keep it in code-unit order of the names; the
 * later ones get `-2`, `-3`…, so the IDs are stable for the same names.
 */
export function eventIds(names: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of [...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const base = eventSegment(name);
    let segment = base;
    for (let n = 2; taken.has(segment); n++) segment = `${base}-${n}`;
    taken.add(segment);
    out.set(name, `${EVENTS_LAYER}.${segment}`);
  }
  return out;
}
