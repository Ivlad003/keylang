// Ghost text (design §7.3): one next line of a flow from the agent, shown
// grey after a pause and only on a cheap signal — the cursor on a new `- `
// item of a flow that has a trigger. A suggestion is checked where it would
// stand, in the buffer: one that does not parse there (a step under an
// `invariant`) or names anything but a snapshot ID or a declared `planned`
// is dropped before it is shown; longer changes go through MERGE
// (`Ctrl+Space`), never through `Tab`.

import type { Analysis } from "./analyze.ts";
import { contextText, type ContextPack } from "./agent-context.ts";
import { sectionNodes, walk } from "./ir.ts";
import type { LlmClient } from "./llm.ts";
import { parse } from "./parser.ts";

/** The cursor line starts a new list item (`- ` and nothing after it) inside a `# flow` with a trigger. */
export function ghostSignal(path: string, text: string, line: number, col: number): boolean {
  const lines = text.split("\n");
  const current = lines[line] ?? "";
  if (!/^\s*- ?$/.test(current) || col < current.length) return false;
  const doc = parse(path, text);
  const section = doc.sections.filter((s) => s.heading !== null && s.heading.span.start.line <= line + 1).at(-1);
  if (section?.kind !== "flow") return false;
  let trigger = false;
  for (const top of sectionNodes(section)) walk(top, (node) => (trigger ||= node.kind === "trigger"));
  return trigger;
}

/** Up to three one-line continuations; each keeps the indentation of the cursor line and names only known IDs. */
export async function ghostSuggestions(analysis: Analysis, client: LlmClient, path: string, text: string, line: number, pack: ContextPack | null): Promise<string[]> {
  const lines = text.split("\n");
  const indent = /^\s*/.exec(lines[line] ?? "")![0];
  const answer = await client.complete({
    system: "You continue a keylang flow by one line. Reply with up to three alternatives, one per line, each a complete list item such as `- step <id>`, `- when <condition>` or `- invariant <text>`. Use only IDs from the input. No other text.",
    prompt: [`The flow so far (the cursor is on the last line):\n${lines.slice(0, line + 1).join("\n")}`, ...(pack ? [`Context:\n${contextText(pack)}`] : [])].join("\n\n"),
    maxTokens: 256,
  });
  const planned = new Set<string>();
  for (const doc of analysis.docs) for (const section of doc.sections) for (const top of sectionNodes(section)) walk(top, (node) => {
    if (node.kind === "planned" && node.id) planned.add(node.id);
  });
  const known = (id: string): boolean => analysis.snapshot?.nodes[id] !== undefined || planned.has(id);
  const out: string[] = [];
  for (const raw of answer.split("\n")) {
    const item = raw.replace(/^[`\s]+|[`\s]+$/g, "");
    if (!item.startsWith("- ") || out.includes(`${indent}${item}`)) continue;
    // The buffer with the line in place, parsed the way `check` reads it: nesting and keywords are judged in context.
    const doc = parse(path, [...lines.slice(0, line), `${indent}${item}`, ...lines.slice(line + 1)].join("\n"));
    if (doc.diagnostics.some((d) => d.span.start.line === line + 1)) continue;
    const ids: string[] = [];
    for (const section of doc.sections) for (const top of sectionNodes(section)) walk(top, (node) => {
      if (node.span.start.line === line + 1) ids.push(...node.refs.map((ref) => ref.target));
    });
    if (ids.every(known)) out.push(`${indent}${item}`);
    if (out.length === 3) break;
  }
  return out;
}
