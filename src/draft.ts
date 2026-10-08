// `keylang draft flow <trigger> --mode algo`: the deterministic projection of
// a flow from the snapshot's call edges (design §5, §5.3). Each resolved call
// to a function of the repository becomes a nested `step`, in the order the
// code writes them; a function already listed is not expanded again, so a
// cycle ends. A call keylang did not resolve is a comment on its caller,
// never a step: the draft claims only what the edges show.

import { SYNTHETIC_LAYERS } from "./config.ts";
import { sectionNodes } from "./ir.ts";
import { parse, renderMeaning } from "./parser.ts";
import { keepLineEndings } from "./safe-write.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import type { TraceRun, TraceSpan } from "./trace-evidence.ts";

export interface FlowDraft {
  name: string;
  /** The `# flow` section, ending with a newline. */
  text: string;
  /** IDs of the steps, trigger first. */
  steps: string[];
}

export function draftFlow(snapshot: AnalysisSnapshot, trigger: string, options: { name?: string; depth?: number; entry?: string } = {}): FlowDraft {
  const node = snapshot.nodes[trigger];
  if (node?.kind !== "fn") throw new Error(`\`${trigger}\` is not a fn of the snapshot`);
  const name = options.name ?? trigger.slice(trigger.lastIndexOf(".") + 1);
  const depth = options.depth ?? 4;
  const holes = new Map<string, string[]>();
  for (const c of snapshot.coverage) {
    if ((c.kind !== "dynamic-call" && c.kind !== "unresolved-call" && c.kind !== "ambiguous-binding" && c.kind !== "dynamic-event") || c.source === null) continue;
    const list = holes.get(c.source) ?? [];
    list.push(`${c.text || c.reason} (${c.file}:${c.line})`);
    holes.set(c.source, list);
  }
  // How a caller reaches a callee when not by a plain call: a callable passed as an argument, a call in a closure passed as one.
  const via = new Map<string, string>();
  for (const e of snapshot.edges) {
    if (e.kind !== "call" || e.resolution !== "resolved" || e.target === null) continue;
    const key = `${e.source}\u0000${e.target}`;
    if (via.has(key)) continue;
    // A call the framework makes by its config (ADR 0022): a preference, a constructor argument, a plugin around the call, an observer of an event, a job registered for a queue.
    const config = e.via === "preference" || e.via === "argument" || e.via === "observer" || (e.via === "dispatch" && e.site !== undefined) || e.via?.startsWith("plugin:") ? ` <!-- keylang:algo via ${e.via} ${e.site ?? "?"}${e.scope && e.scope !== "global" ? ` scope ${e.scope}` : ""} -->` : null;
    via.set(key, config ?? (e.via === "callable-arg" ? " <!-- keylang:algo via callable -->" : e.via === "closure-arg" ? " <!-- keylang:algo via closure -->" : e.via === "dispatch" ? " <!-- keylang:algo via dispatch -->" : ""));
  }
  const listed = new Set<string>();
  const lines = [`# flow ${name}`, ""];
  const steps: string[] = [];
  const visit = (id: string, level: number, how: string): void => {
    listed.add(id);
    steps.push(id);
    const open = holes.get(id) ?? [];
    // Closing `-->` inside a comment would end it early.
    const comment = open.length > 0 ? ` <!-- keylang:algo unresolved: ${open.join("; ").replace(/-->/g, "-- >")} -->` : "";
    // `entry`: the kind of entry point the trigger is (`trigger route <id>`, ADR 0023 п. 3).
    const keyword = level === 0 ? (options.entry === undefined ? "trigger" : `trigger ${options.entry}`) : "step";
    lines.push(`${"  ".repeat(level)}- ${keyword} ${id}${how}${comment}`);
    if (level >= depth) return;
    for (const callee of snapshot.nodes[id]?.calls ?? []) {
      // An event the fn dispatches is a step too, with its observers under it (ADR 0022 п. 6).
      const kind = snapshot.nodes[callee]?.kind;
      if (listed.has(callee) || (kind !== "fn" && kind !== "event") || snapshot.nodes[callee]?.layer === "external") continue;
      visit(callee, level + 1, via.get(`${id}\u0000${callee}`) ?? "");
    }
  };
  visit(trigger, 0, "");
  return { name, text: `${lines.join("\n")}\n`, steps };
}

/**
 * `draft flow --from-trace`: a flow from what one trace run observed. The
 * first root span (in start order) is the trigger; nesting is the span tree,
 * order among siblings is start order (`seq` on one clock, else `ts`). A fn
 * already listed is not listed again, as in `draftFlow`, so a loop or a
 * recursion is one step. A step the static graph does not show — no path of
 * resolved calls from its parent — is marked `<!-- keylang:trace via
 * observed -->`. `rest` names the root spans left out: they ran outside the
 * trigger's call tree.
 */
export function draftFlowFromTrace(snapshot: AnalysisSnapshot, run: TraceRun, options: { name?: string } = {}): FlowDraft & { rest: string[] } {
  const known = new Set(run.spans.map((span) => span.spanId));
  const children = new Map<string | null, TraceSpan[]>();
  for (const span of run.spans) {
    const parent = span.parentSpanId !== null && known.has(span.parentSpanId) ? span.parentSpanId : null;
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }
  const order = (a: TraceSpan, b: TraceSpan): number => (a.start.clockId === b.start.clockId ? a.start.seq - b.start.seq : a.start.ts - b.start.ts);
  for (const list of children.values()) list.sort(order);
  const roots = children.get(null) ?? [];
  const trigger = roots[0];
  if (trigger === undefined) throw new Error(`run \`${run.runId}\` has no span`);
  const name = options.name ?? (run.flow || trigger.symbolId.slice(trigger.symbolId.lastIndexOf(".") + 1));
  const listed = new Set<string>();
  const lines = [`# flow ${name}`, ""];
  const steps: string[] = [];
  const visit = (span: TraceSpan, level: number, parent: string | null): void => {
    listed.add(span.symbolId);
    steps.push(span.symbolId);
    const seen = parent === null || reachesByCalls(snapshot, parent, span.symbolId);
    lines.push(`${"  ".repeat(level)}- ${level === 0 ? "trigger" : "step"} ${span.symbolId}${seen ? "" : " <!-- keylang:trace via observed -->"}`);
    for (const child of children.get(span.spanId) ?? []) if (!listed.has(child.symbolId)) visit(child, level + 1, span.symbolId);
  };
  visit(trigger, 0, null);
  const rest = roots.slice(1).map((span) => span.symbolId).filter((id) => !listed.has(id));
  return { name, text: `${lines.join("\n")}\n`, steps, rest: [...new Set(rest)] };
}

/** A path of resolved calls (the snapshot's `calls`) from `from` to `to`. */
function reachesByCalls(snapshot: AnalysisSnapshot, from: string, to: string): boolean {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    for (const callee of snapshot.nodes[queue.pop()!]?.calls ?? []) {
      if (callee === to) return true;
      if (!seen.has(callee)) {
        seen.add(callee);
        queue.push(callee);
      }
    }
  }
  return false;
}

/**
 * A spec with the draft added: the section of the same flow is replaced,
 * whatever follows the name on its heading line, otherwise the draft is
 * appended. Sections come from the parser, so a `# ` line in a code block is
 * not a heading. The line endings are kept (`keepLineEndings`), mixed ones too.
 */
export function withFlow(existing: string | null, draft: Pick<FlowDraft, "name" | "text">): string {
  if (existing === null || existing.trim() === "") return draft.text;
  const text = existing.replace(/\r\n/g, "\n");
  const lines = text.replace(/\n*$/, "").split("\n");
  const sections = parse("spec.md", text).sections;
  const index = sections.findIndex((section) => section.kind === "flow" && section.name?.value === draft.name);
  let out: string;
  if (index === -1) {
    out = `${lines.join("\n")}\n\n${draft.text}`;
  } else {
    const start = sections[index]!.heading!.span.start.line - 1;
    const end = nextHeading(sections, index) ?? lines.length;
    const after = lines.slice(end);
    out = `${[...lines.slice(0, start), ...draft.text.trimEnd().split("\n"), ...(after.length > 0 ? ["", ...after] : [])].join("\n")}\n`;
  }
  return keepLineEndings(existing, out);
}

/**
 * `draft rules` into an existing spec: the drafted rules go at the end of its
 * last `# rules` section, or into a new `# rules` section at the end, never
 * under a trailing `# flow`. A rule the file already has (comments aside) is
 * not repeated. The line endings are kept (`keepLineEndings`), mixed ones too.
 */
export function withRules(existing: string | null, draftText: string): string {
  if (existing === null || existing.trim() === "") return draftText;
  const text = existing.replace(/\r\n/g, "\n");
  const lines = text.replace(/\n*$/, "").split("\n");
  const sections = parse("rules.md", text).sections;
  const written = new Set<string>();
  for (const section of sections) if (section.kind === "rules") for (const node of sectionNodes(section)) written.add(renderMeaning(node));
  const draftLines = draftText.split("\n");
  const added: string[] = [];
  for (const section of parse("draft.md", draftText).sections) {
    for (const node of sectionNodes(section)) if (!written.has(renderMeaning(node))) added.push(draftLines[node.span.start.line - 1]!);
  }
  if (added.length === 0) return existing;
  const index = sections.findLastIndex((section) => section.kind === "rules" && section.heading !== null);
  let out: string;
  if (index === -1) {
    out = `${lines.join("\n")}\n\n# rules\n\n${added.join("\n")}\n`;
  } else {
    let end = nextHeading(sections, index) ?? lines.length;
    while (end > 0 && lines[end - 1]!.trim() === "") end--;
    // A list starts on its own paragraph after prose.
    const gap = /^\s*- /.test(lines[end - 1] ?? "") ? [] : [""];
    const after = lines.slice(end);
    while (after[0]?.trim() === "") after.shift();
    out = `${[...lines.slice(0, end), ...gap, ...added, ...(after.length > 0 ? ["", ...after] : [])].join("\n")}\n`;
  }
  return keepLineEndings(existing, out);
}

/** 0-based line index of the heading after `sections[index]`, or null at the end of the file. */
function nextHeading(sections: readonly { heading: { span: { start: { line: number } } } | null }[], index: number): number | null {
  const next = sections.slice(index + 1).find((section) => section.heading !== null);
  return next ? next.heading!.span.start.line - 1 : null;
}

/**
 * Flow names that keep drafts apart in one spec: two `save` triggers
 * (`A.save`, `B.save`) become `A-save` and `B-save`, taking as many trailing
 * ID segments as it needs.
 */
export function distinctNames(drafts: readonly FlowDraft[]): FlowDraft[] {
  const widths = drafts.map(() => 1);
  const segments = drafts.map((d) => d.steps[0]!.split("."));
  const nameOf = (i: number): string => (widths[i] === 1 ? drafts[i]!.name : segments[i]!.slice(-widths[i]!).join("-"));
  for (let changed = true; changed; ) {
    changed = false;
    const byName = new Map<string, number[]>();
    drafts.forEach((_, i) => byName.set(nameOf(i), [...(byName.get(nameOf(i)) ?? []), i]));
    for (const indices of byName.values()) {
      if (indices.length < 2) continue;
      for (const i of indices) {
        if (widths[i]! >= segments[i]!.length) continue;
        widths[i]!++;
        changed = true;
      }
    }
  }
  return drafts.map((d, i) => {
    const name = nameOf(i);
    return name === d.name ? d : { ...d, name, text: d.text.replace(/^# flow \S+/, `# flow ${name}`) };
  });
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
    .filter(([, n]) => n.kind === "layer" && !(SYNTHETIC_LAYERS as readonly string[]).includes(n.layer))
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
 * in declaration order without a line — and the spec's name: the fn's, or
 * the file's module's. Reads the snapshot only; a position that names no fn
 * throws the CLI's message.
 */
export function codeToSpecTriggers(snapshot: AnalysisSnapshot, file: string, line: number | null): { name: string; triggers: string[] } {
  const fns = Object.entries(snapshot.nodes).filter(([, n]) => n.kind === "fn" && n.file === file && n.line !== null);
  if (fns.length === 0) throw new Error(`${file}: no function of the snapshot is declared here`);
  if (line !== null) {
    const holding = fns
      .filter(([, n]) => n.line! <= line && (n.endLine ?? n.line!) >= line)
      .sort(([, a], [, b]) => (b.line ?? 0) - (a.line ?? 0));
    const [id] = holding[0] ?? [];
    if (!id) throw new Error(`${file}:${line}: no function holds this line`);
    return { name: id.slice(id.lastIndexOf(".") + 1), triggers: [id] };
  }
  const exported = fns.filter(([, n]) => n.exported === true).map(([id]) => id).sort((a, b) => (snapshot.nodes[a]!.line ?? 0) - (snapshot.nodes[b]!.line ?? 0));
  if (exported.length === 0) throw new Error(`${file}: no exported function; name a line`);
  // The file's own module names the spec, not the class of its first method.
  const moduleId =
    Object.entries(snapshot.nodes)
      .filter(([, n]) => n.kind === "module" && n.file === file)
      .map(([id]) => id)
      .sort((a, b) => a.length - b.length)[0] ?? exported[0]!.slice(0, exported[0]!.lastIndexOf("."));
  return { name: moduleId.slice(moduleId.lastIndexOf(".") + 1), triggers: exported };
}

/** `code-to-spec <path[:line]>`: each fn `codeToSpecTriggers` names as a flow draft; same-named fns get distinct flow names. */
export function codeToSpec(snapshot: AnalysisSnapshot, file: string, line: number | null): { name: string; drafts: FlowDraft[] } {
  const { name, triggers } = codeToSpecTriggers(snapshot, file, line);
  const drafts = triggers.map((id) => draftFlow(snapshot, id));
  return { name, drafts: line !== null ? drafts : distinctNames(drafts) };
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
      file = line === "+++ /dev/null" ? null : gitPath(line.slice(4)).replace(/^b\//, "");
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
 * Paths removed in `git diff` (`--- a/file` then `+++ /dev/null`). `diffHunks`
 * follows the new side, so a deletion has no hunk to land on.
 */
export function deletedDiffPaths(diff: string): string[] {
  const out: string[] = [];
  const lines = diff.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("--- ")) continue;
    if (!(lines[i + 1] ?? "").startsWith("+++ /dev/null")) continue;
    const path = gitPath(line.slice(4)).replace(/^a\//, "");
    if (path !== "" && path !== "/dev/null") out.push(path);
  }
  return out;
}

/** A path as `git diff` prints it: C-quoted (`"b/\303\251.ts"`, `"b/a\"b.ts"`) when it holds a quote, a backslash or a control byte. */
function gitPath(text: string): string {
  if (!text.startsWith('"') || !text.endsWith('"')) return text;
  const escapes: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, "\\": 92 };
  const chars = Array.from(text.slice(1, -1));
  const bytes: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
      continue;
    }
    const next = chars[++i] ?? "";
    if (/^[0-7]$/.test(next)) {
      bytes.push(parseInt(chars.slice(i, i + 3).join(""), 8));
      i += 2;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString("utf8");
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
  return { drafts: distinctNames(drafts.filter((d) => kept.has(d))), named: touched.filter((id) => named.has(id)) };
}
