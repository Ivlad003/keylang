// «Запропонувати зміни» on a system's view (system-design/08): the editor's
// canvas as the `# system` section it draws. Components and zones come from
// the canvas — a component's kind, name and technology from its shape, its
// zone from the lane it sits in, its relations from the connections out of it
// (`<verb>[: caption]`); what the canvas does not draw stays as written: a
// kept component's other lines (`code`, `scale`, tables, its description),
// the zones' labels, the interview notes, sequences and prose of the
// section. A component taken off the canvas takes its lines with it. The
// system of the code (`@code`) is adopted as a new file. Pure: files come
// in through `read`.

import type { ChangedTarget, EditorModel } from "./diagram-proposal.ts";
import { sectionNodes, type Node } from "./ir.ts";
import { isComponentKind, isRelationVerb, isSegment, parse, RELATION_VERBS } from "./parser.ts";
import { compareText } from "./span.ts";
import type { SystemSpec } from "./system.ts";
import { systemMarkdown } from "./system-discover.ts";

export interface SystemChangeInput {
  model: EditorModel;
  /** The view's system: a `# system` of the specs, or the system of the code. */
  system: SystemSpec;
  /** The name a system of the code is adopted under (the repository's). */
  adoptAs: string;
  specDir: string;
  read: (path: string) => string | null;
}

/** The last line of an item: its own, its description's and its children's. */
function lastLine(node: Node): number {
  return Math.max(node.span.start.line, ...node.description.map((line) => line.span.start.line), ...node.children.map(lastLine));
}

/** The lines of an item and everything under it, re-indented to `indent`. */
function block(lines: readonly string[], node: Node, indent: string): string[] {
  const from = node.span.start.line - 1;
  const own = lines.slice(from, lastLine(node));
  const base = (own[0] ?? "").length - (own[0] ?? "").trimStart().length;

  return own.map((line) => (line.trim() === "" ? "" : `${indent}${line.slice(Math.min(base, line.length - line.trimStart().length))}`));
}

type SystemChanges = { targets: ChangedTarget[]; notes: string[] };

/** The section's text with its components and zones as the canvas draws them; null when the canvas says nothing new. */
export function systemChanges(input: SystemChangeInput): SystemChanges {
  const { model, system } = input;
  const notes: string[] = [];
  const adopting = system.file === "";
  const target = adopting ? `${input.specDir === "" ? "" : `${input.specDir}/`}system/${input.adoptAs}.md` : system.file;
  const before = input.read(target);

  if (adopting && before !== null) return { targets: [], notes: [`${target} exists: open its system and draw there, or remove the file to adopt the system of the code again`] };

  // The canvas: components by key, the zone of each, relations out of each.
  const components = model.nodes.filter((node) => node.kind === "component");
  const names = new Map<string, string>();

  for (const node of components) {
    const kind = node.component ?? "service";

    if (!isComponentKind(kind)) {
      notes.push(`${node.label}: \`${kind}\` is no component kind; left out`);
      continue;
    }

    if (!isSegment(node.label)) {
      notes.push(`\`${node.label}\` is no component name (a letter or _ first, then letters, digits, _ or -); left out`);
      continue;
    }

    if ([...names.values()].includes(node.label)) {
      notes.push(`two components are named \`${node.label}\`; the second is left out`);
      continue;
    }

    names.set(node.key, node.label);
  }

  const relations = new Map<string, string[]>();

  for (const edge of model.edges) {
    if (edge.kind !== "relation") continue;
    const from = names.get(edge.from);
    const to = names.get(edge.to);

    if (from === undefined || to === undefined) continue;
    const label = (edge.label ?? "calls").trim();
    const verb = label.split(/[:\s]/)[0] ?? "";

    if (!isRelationVerb(verb)) {
      notes.push(`${from} → ${to}: \`${label}\` does not start with a verb (${RELATION_VERBS.join(", ")}); left out`);
      continue;
    }

    const caption = label.slice(verb.length).replace(/^[:\s]+/, "").trim();
    relations.set(from, [...(relations.get(from) ?? []), `- ${verb} ${to}${caption ? ` ${caption}` : ""}`]);
  }

  // The section as written: its lines, the component and zone items in it.
  // The system of the code adopted: its section as `system discover` prints it, then the canvas over it.
  const text = before ?? systemMarkdown(system, input.adoptAs);
  const doc = parse(target, text);
  const section = doc.sections.find((item) => item.kind === "system" && item.name?.value === (adopting ? input.adoptAs : system.name));
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const written = new Map<string, Node>();
  const zoneLabels = new Map<string, string | null>();
  const removed = new Set<number>();
  let insertAt: number | null = null;

  const take = (node: Node): void => {
    if (insertAt === null) insertAt = node.span.start.line - 1;

    for (let line = node.span.start.line; line <= lastLine(node); line++) removed.add(line - 1);

    if (node.kind === "zone" && node.name) {
      zoneLabels.set(node.name.value, node.text?.value ?? null);

      for (const child of node.children) if (child.kind === "component" && child.name) written.set(child.name.value, child);
    }

    if (node.kind === "component" && node.name) written.set(node.name.value, node);
  };

  const nodes = section ? sectionNodes(section) : [];

  for (const node of nodes) if (node.kind === "zone" || node.kind === "component") take(node);
  // A system of the code adopted: its section starts after the heading.
  const headingLine = section?.heading ? section.heading.span.start.line : 1;

  const end = (() => {
    const next = doc.sections.find((item) => item !== section && item.heading !== null && item.heading.span.start.line > headingLine);

    return next?.heading ? next.heading.span.start.line - 1 : lines.length;
  })();

  if (insertAt === null) {
    // No component yet: after the notes, before the first sequence.
    const sequence = nodes.find((node) => node.kind === "sequence");
    insertAt = sequence ? sequence.span.start.line - 1 : end;

    while (insertAt > headingLine && lines[insertAt - 1]?.trim() === "") insertAt--;
  }

  const componentLines = (key: string, indent: string): string[] => {
    const node = components.find((item) => item.key === key)!;
    const name = names.get(key)!;
    const tech = node.tech ?? null;
    const out = [`${indent}- ${node.component ?? "service"} ${name}${tech ? ` ${tech}` : ""}`];
    const old = written.get(name);

    if (old) {
      // Everything under it but its relations: `code`, `scale`, tables, the description.
      for (const line of old.description) out.push(`${indent}  ${line.value}`);

      for (const child of old.children) if (child.kind !== "relation") out.push(...block(lines, child, `${indent}  `));
    }

    for (const line of relations.get(name) ?? []) out.push(`${indent}  ${line}`);

    return out;
  };

  const byZone = new Map<string | null, string[]>();

  for (const node of components.filter((item) => names.has(item.key)).sort((a, b) => a.y - b.y || a.x - b.x || compareText(a.key, b.key))) {
    const zone = node.layer === null ? null : node.layer.replace(/^planned:/, "");
    byZone.set(zone, [...(byZone.get(zone) ?? []), node.key]);
  }

  const generated: string[] = [];

  for (const key of byZone.get(null) ?? []) generated.push(...componentLines(key, ""));
  const lanes = [...model.lanes].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const lane of lanes) {
    const zone = lane.id.replace(/^planned:/, "");

    if (!isSegment(zone)) {
      notes.push(`\`${zone}\` is no zone name; its components are left out of it`);
      continue;
    }

    const label = zoneLabels.get(zone) ?? null;
    generated.push(`- zone ${zone}${label ? ` ${label}` : ""}`);

    for (const key of byZone.get(zone) ?? []) generated.push(...componentLines(key, "  "));
  }

  for (const [name] of written) if (![...names.values()].includes(name)) notes.push(`component \`${name}\` is not on the canvas: its lines are taken out`);

  for (const sequence of system.sequences) {
    const gone = [...new Set(sequence.messages.flatMap((message) => [message.from, message.to]))].filter((who) => !(names.size > 0 && [...names.values()].includes(who)));

    if (gone.length > 0 && names.size > 0) notes.push(`sequence \`${sequence.name}\` names ${gone.map((who) => `\`${who}\``).join(", ")}, not on the canvas: \`check\` will say K401 until it is fixed`);
  }

  const kept = lines.map((line, i) => (removed.has(i) ? null : line));
  const head = kept.slice(0, insertAt).filter((line): line is string => line !== null);
  // A list right under a heading or prose starts after a blank line.
  const previous = head.at(-1);

  if (generated.length > 0 && previous !== undefined && previous.trim() !== "" && !/^\s*- /.test(previous) && !/^\s{2,}\S/.test(previous)) head.push("");
  const out = [...head, ...generated, ...kept.slice(insertAt).filter((line): line is string => line !== null)];
  let next = out.join("\n");

  if (before !== null && /\r\n/.test(before)) next = next.replace(/\n/g, "\r\n");

  if (!next.endsWith("\n")) next += "\n";

  if (next === before) return { targets: [], notes };

  return { targets: [{ target, before, text: next, shapes: components.flatMap((item) => (names.has(item.key) ? [item.key] : [])).sort(compareText) }], notes };
}
