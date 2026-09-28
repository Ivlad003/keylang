// `keylang draft flow <trigger> --mode algo`: the deterministic projection of
// a flow from the snapshot's call edges (design §5, §5.3). Each resolved call
// to a function of the repository becomes a nested `step`, in the order the
// code writes them; a function already listed is not expanded again, so a
// cycle ends. A call keylang did not resolve is a comment on its caller,
// never a step: the draft claims only what the edges show.

import type { AnalysisSnapshot } from "./snapshot.ts";

export interface FlowDraft {
  name: string;
  /** The `# flow` section, ending with a newline. */
  text: string;
  /** IDs of the steps, trigger first. */
  steps: string[];
}

export function draftFlow(snapshot: AnalysisSnapshot, trigger: string, options: { name?: string; depth?: number } = {}): FlowDraft {
  const node = snapshot.nodes[trigger];
  if (node?.kind !== "fn") throw new Error(`\`${trigger}\` is not a fn of the snapshot`);
  const name = options.name ?? trigger.slice(trigger.lastIndexOf(".") + 1);
  const depth = options.depth ?? 4;
  const holes = new Map<string, string[]>();
  for (const c of snapshot.coverage) {
    if ((c.kind !== "dynamic-call" && c.kind !== "unresolved-call") || c.source === null) continue;
    const list = holes.get(c.source) ?? [];
    list.push(`${c.text || c.reason} (${c.file}:${c.line})`);
    holes.set(c.source, list);
  }
  const listed = new Set<string>();
  const lines = [`# flow ${name}`, ""];
  const steps: string[] = [];
  const visit = (id: string, level: number): void => {
    listed.add(id);
    steps.push(id);
    const open = holes.get(id) ?? [];
    // Closing `-->` inside a comment would end it early.
    const comment = open.length > 0 ? ` <!-- keylang:algo unresolved: ${open.join("; ").replace(/-->/g, "-- >")} -->` : "";
    lines.push(`${"  ".repeat(level)}- ${level === 0 ? "trigger" : "step"} ${id}${comment}`);
    if (level >= depth) return;
    for (const callee of snapshot.nodes[id]?.calls ?? []) {
      if (listed.has(callee) || snapshot.nodes[callee]?.kind !== "fn" || snapshot.nodes[callee]?.layer === "external") continue;
      visit(callee, level + 1);
    }
  };
  visit(trigger, 0);
  return { name, text: `${lines.join("\n")}\n`, steps };
}

/** A spec with the draft added: a section of the same flow is replaced, otherwise the draft is appended. */
export function withFlow(existing: string | null, draft: Pick<FlowDraft, "name" | "text">): string {
  if (existing === null || existing.trim() === "") return draft.text;
  const lines = existing.replace(/\n*$/, "").split("\n");
  const start = lines.findIndex((line) => line.trim() === `# flow ${draft.name}`);
  if (start === -1) return `${lines.join("\n")}\n\n${draft.text}`;
  let end = lines.findIndex((line, i) => i > start && /^# /.test(line));
  if (end === -1) end = lines.length;
  const before = lines.slice(0, start);
  const after = lines.slice(end);
  return `${[...before, ...draft.text.trimEnd().split("\n"), ...(after.length > 0 ? ["", ...after] : [])].join("\n")}\n`;
}

/**
 * `draft rules --mode algo`: rules the current code already keeps, so each
 * passes `check` as written. Layers in an order where every observed
 * dependency points down (`a < b`: `b` may use `a`), when the layers form no
 * cycle; otherwise a `deny` for each pair used in one direction only.
 * `no-cycles` when no module cycle exists. The person decides which to keep.
 */
export function draftRules(snapshot: AnalysisSnapshot, cyclic: boolean): string {
  const layers = Object.entries(snapshot.nodes)
    .filter(([, n]) => n.kind === "layer" && n.layer !== "external" && n.layer !== "unassigned")
    .map(([id]) => id)
    .sort();
  const uses = new Map(layers.map((l) => [l, new Set<string>()]));
  for (const e of snapshot.edges) {
    if (e.resolution !== "resolved" || e.target === null) continue;
    const from = snapshot.nodes[e.source]?.layer;
    const to = snapshot.nodes[e.target]?.layer;
    if (from && to && from !== to && uses.has(from) && uses.has(to)) uses.get(from)!.add(to);
  }
  const mark = " <!-- keylang:algo status=algo-only -->";
  const lines = ["# rules", ""];
  const order = layerOrder(layers, uses);
  if (order) {
    if (order.length > 1) lines.push(`- layers ${order.join(" < ")}${mark}`);
  } else {
    for (const a of layers) for (const b of layers) if (a !== b && uses.get(b)!.has(a) && !uses.get(a)!.has(b)) lines.push(`- deny ${a} ${b}${mark}`);
  }
  if (!cyclic) lines.push(`- no-cycles${mark}`);
  return `${lines.join("\n")}\n`;
}

/** Layers with those used first (Kahn, ties by name); null for a cycle. */
function layerOrder(layers: readonly string[], uses: ReadonlyMap<string, ReadonlySet<string>>): string[] | null {
  const order: string[] = [];
  const left = new Set(layers);
  while (left.size > 0) {
    const next = [...left].find((l) => [...uses.get(l)!].every((dep) => !left.has(dep)));
    if (next === undefined) return null;
    order.push(next);
    left.delete(next);
  }
  return order;
}

/**
 * `code-to-spec <path[:line]>`: the functions the code position names — the
 * innermost fn whose range holds the line, or every exported fn of the file
 * without a line — each as a flow draft.
 */
export function codeToSpec(snapshot: AnalysisSnapshot, file: string, line: number | null): { name: string; drafts: FlowDraft[] } {
  const fns = Object.entries(snapshot.nodes).filter(([, n]) => n.kind === "fn" && n.file === file && n.line !== null);
  if (fns.length === 0) throw new Error(`${file}: no function of the snapshot is declared here`);
  if (line !== null) {
    const holding = fns
      .filter(([, n]) => n.line! <= line && (n.endLine ?? n.line!) >= line)
      .sort(([, a], [, b]) => (b.line ?? 0) - (a.line ?? 0));
    const [id] = holding[0] ?? [];
    if (!id) throw new Error(`${file}:${line}: no function holds this line`);
    const draft = draftFlow(snapshot, id);
    return { name: draft.name, drafts: [draft] };
  }
  const exported = fns.filter(([, n]) => n.exported === true).map(([id]) => id).sort((a, b) => (snapshot.nodes[a]!.line ?? 0) - (snapshot.nodes[b]!.line ?? 0));
  if (exported.length === 0) throw new Error(`${file}: no exported function; name a line`);
  const moduleId = exported[0]!.slice(0, exported[0]!.lastIndexOf("."));
  return { name: moduleId.slice(moduleId.lastIndexOf(".") + 1), drafts: exported.map((id) => draftFlow(snapshot, id)) };
}

/** Changed lines per file, 1-based and inclusive; `all` for a file git does not track yet. */
export type ChangedLines = ReadonlyMap<string, readonly (readonly [number, number])[] | "all">;

/**
 * The new-side line ranges of `git diff --unified=0`. A deletion is the line
 * it happened after, so the fn around it counts as changed.
 */
export function diffHunks(diff: string): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  let file: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.slice(4).replace(/^b\//, "");
      continue;
    }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m || file === null) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    const ranges = out.get(file) ?? [];
    ranges.push(count === 0 ? [Math.max(1, start), Math.max(1, start)] : [start, start + count - 1]);
    out.set(file, ranges);
  }
  return out;
}

/**
 * `code-to-spec --since <ref>`: a flow draft for each fn the change touches.
 * A fn some hand-written spec already names is reported, not drafted again —
 * its flow is the place to look. A fn that is a step of another changed fn's
 * draft is left inside that draft.
 */
export function changedFlows(snapshot: AnalysisSnapshot, changed: ChangedLines, named: ReadonlySet<string>): { drafts: FlowDraft[]; named: string[] } {
  const touched = Object.entries(snapshot.nodes)
    .filter(([, n]) => {
      if (n.kind !== "fn" || n.file === null || n.line === null) return false;
      const ranges = changed.get(n.file);
      if (ranges === undefined) return false;
      return ranges === "all" || ranges.some(([from, to]) => from <= (n.endLine ?? n.line!) && to >= n.line!);
    })
    .sort(([a, x], [b, y]) => (x.file! < y.file! ? -1 : x.file! > y.file! ? 1 : x.line! - y.line! || (a < b ? -1 : 1)))
    .map(([id]) => id);
  const drafts = touched.filter((id) => !named.has(id)).map((id) => draftFlow(snapshot, id));
  // Widest drafts first, so of two fns that call each other one draft stays.
  const kept = new Set<FlowDraft>();
  for (const d of [...drafts].sort((x, y) => y.steps.length - x.steps.length)) {
    if (![...kept].some((k) => k.steps.includes(d.steps[0]!))) kept.add(d);
  }
  return { drafts: drafts.filter((d) => kept.has(d)), named: touched.filter((id) => named.has(id)) };
}
