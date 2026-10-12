// How a `GraphDiff` is shown: a short text report (the terminal), Markdown
// for a PR comment (summary, tables, a mermaid block), a mermaid flowchart
// alone, and the diagram the web page draws on its canvas. Pure: the same
// diff gives the same bytes.
//
// The picture is the changed nodes and their neighbours one edge away
// (`diffSubgraph`), coloured by status: added green, removed red and
// dashed, changed yellow, context grey; a new edge is solid with `+`, a
// removed one dashed with `−`.
//
// Sits after graph-diff.ts, before the CLI and the read API. Entry points:
// `DIFF_FORMATS`, `diffText`, `diffMarkdown`, `diffMermaid`, `diffDiagram`,
// `diffSummary`.

import { layout, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode } from "./diagram.ts";
import { EXTERNAL } from "./external-ids.ts";
import type { DiffSubgraph, GraphDiff, SubgraphNode } from "./graph-diff.ts";
import { compareText } from "./span.ts";

/** The output formats of `keylang diff`. */
export const DIFF_FORMATS = ["text", "md", "mermaid", "json"] as const;

export type DiffFormat = (typeof DIFF_FORMATS)[number];

/** Whether `text` names an output format of `keylang diff`. */
export function isDiffFormat(text: string): text is DiffFormat {
  return DIFF_FORMATS.some((format) => format === text);
}

/** The glyph of a status in the text report and the tables. */
const MARK = { added: "+", removed: "−", changed: "~", new: "+", fixed: "−" } as const;

/** One line: what changed, counted by kind. */
export function diffSummary(diff: GraphDiff): string {
  const count = <Item extends { status: string }>(items: readonly Item[], status: Item["status"]): number => items.filter((item) => item.status === status).length;
  const nodeKind = diff.level === "fn" ? "nodes" : "modules";
  const newFails = diff.findings.filter((finding) => finding.status === "new" && finding.verdict === "fail").length;

  return [
    `${nodeKind}: +${count(diff.nodes, "added")} −${count(diff.nodes, "removed")} ~${count(diff.nodes, "changed")}`,
    `edges: +${count(diff.edges, "added")} −${count(diff.edges, "removed")}`,
    `flows: +${count(diff.flows, "added")} −${count(diff.flows, "removed")} ~${count(diff.flows, "changed")}`,
    `findings: ${count(diff.findings, "new")} new (${newFails} fail), ${count(diff.findings, "fixed")} fixed`,
    `spec weakened: ${diff.weakenings.length}`,
  ].join(" · ");
}

/** The heading both reports start with: from where to where, at which level. */
function heading(diff: GraphDiff): string {
  const side = (label: string, subject: string | null): string => (subject === null ? label : `${label} «${subject}»`);

  return `${side(diff.base.label, diff.base.subject)} → ${side(diff.head.label, diff.head.subject)} (level ${diff.level})`;
}

/** The `keylang diff` report for a terminal: a heading, the summary, then each kind of change. */
export function diffText(diff: GraphDiff): string {
  const lines = [`keylang diff: ${heading(diff)}`, diffSummary(diff)];

  // Each block only when it has something to say.
  const block = (title: string, rows: readonly string[]): void => {
    if (rows.length > 0) lines.push("", `${title}:`, ...rows.map((row) => `  ${row}`));
  };

  block(
    diff.level === "fn" ? "Nodes" : "Modules",
    diff.nodes.map((node) => `${MARK[node.status]} ${node.id}${diff.level === "fn" ? ` (${node.kind})` : ""}${node.changes.length > 0 ? `: ${node.changes.join(", ")}` : ""}${node.file === null ? "" : `  ${node.file}`}`),
  );
  block(
    "Edges",
    diff.edges.map((edge) => `${MARK[edge.status]} ${edge.source} → ${edge.target} (${edge.kind})`),
  );
  block(
    "Flows",
    diff.flows.flatMap((flow) => [`${MARK[flow.status]} ${flow.name}`, ...flow.steps.map((step) => `    ${MARK[step.status]} ${step.key}`)]),
  );
  block(
    "Findings",
    diff.findings.map((finding) => `${finding.status === "new" ? "new  " : "fixed"} ${finding.verdict} ${finding.code ?? finding.criterion} ${finding.area}: ${finding.message} (${finding.file}:${finding.line})`),
  );
  block(
    "Spec weakened (K108)",
    diff.weakenings.map((weakening) => `${weakening.file}:${weakening.line}:${weakening.col}: ${weakening.message}`),
  );

  if (diff.nodes.length + diff.edges.length + diff.flows.length + diff.findings.length + diff.weakenings.length === 0) lines.push("", "no changes in the graph, the flows or the findings");

  return `${lines.join("\n")}\n`;
}

/** A Markdown table cell: pipes escaped, line breaks flattened. */
function cell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Inline code in a table cell, safe for backticks in the text. */
function code(text: string): string {
  return text.includes("`") ? `\`\` ${cell(text)} \`\`` : `\`${cell(text)}\``;
}

/** The report for a PR comment: the heading, the summary, a table per kind of change and the mermaid picture. */
export function diffMarkdown(diff: GraphDiff, subgraph: DiffSubgraph): string {
  const out = [`## keylang diff`, "", `${cell(heading(diff))}`, "", `**${diffSummary(diff)}**`];

  const table = (title: string, header: readonly string[], rows: readonly (readonly string[])[]): void => {
    if (rows.length === 0) return;
    out.push("", `### ${title}`, "", `| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`));
  };

  table(
    diff.level === "fn" ? "Nodes" : "Modules",
    ["", "ID", "Kind", "Changes", "File"],
    diff.nodes.map((node) => [MARK[node.status], code(node.id), node.kind, node.changes.join(", "), node.file === null ? "" : code(node.file)]),
  );
  table(
    "Edges",
    ["", "Source", "Target", "Kind"],
    diff.edges.map((edge) => [MARK[edge.status], code(edge.source), code(edge.target), edge.kind]),
  );
  table(
    "Flows",
    ["", "Flow", "Steps"],
    diff.flows.map((flow) => [MARK[flow.status], code(flow.name), flow.steps.map((step) => `${MARK[step.status]} ${cell(step.key)}`).join("<br>")]),
  );
  table(
    "Findings",
    ["", "Verdict", "Code", "Area", "Message"],
    diff.findings.map((finding) => [finding.status, finding.verdict, cell(finding.code ?? finding.criterion), code(finding.area), `${cell(finding.message)} (${code(`${finding.file}:${finding.line}`)})`]),
  );

  if (diff.weakenings.length > 0) out.push("", "### Spec weakened (K108)", "", ...diff.weakenings.map((weakening) => `- ${code(`${weakening.file}:${weakening.line}`)} ${weakening.message}`));

  if (diff.nodes.length + diff.edges.length + diff.flows.length + diff.findings.length + diff.weakenings.length === 0) out.push("", "No changes in the graph, the flows or the findings.");

  if (subgraph.nodes.length > 0) out.push("", "```mermaid", diffMermaid(subgraph).trimEnd(), "```");

  return `${out.join("\n")}\n`;
}

/** The colours of the picture by status; `removed` is dashed too. */
const CLASS_DEFS = [
  "classDef added fill:#d4f8d4,stroke:#2e7d32,color:#1b1b1b",
  "classDef removed fill:#f8d4d4,stroke:#c62828,stroke-dasharray:5 3,color:#1b1b1b",
  "classDef changed fill:#fff4c2,stroke:#b26a00,color:#1b1b1b",
  "classDef unchanged fill:#eeeeee,stroke:#9e9e9e,color:#616161",
];

/** A label inside `["…"]`: quotes and the characters mermaid reads as markup as entities. */
function mermaidLabel(text: string): string {
  return text.replace(/&/g, "#amp;").replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
}

/**
 * The picture as a mermaid `flowchart LR`. A node's mermaid ID is its index
 * (`n0`, `n1`…): an ID of the code may hold any character, so it only ever
 * appears as an escaped label.
 */
export function diffMermaid(subgraph: DiffSubgraph): string {
  const lines = ["flowchart LR"];
  const ids = new Map(subgraph.nodes.map((node, i) => [node.id, `n${i}`]));

  for (const node of subgraph.nodes) lines.push(`  ${ids.get(node.id)}["${mermaidLabel(node.id)}"]:::${node.diff ?? "unchanged"}`);

  if (subgraph.nodes.length === 0) lines.push(`  empty["no changes"]:::unchanged`);

  if (subgraph.more > 0) lines.push(`  more["+${subgraph.more} more"]:::unchanged`);
  // linkStyle counts edges in the order they are written.
  const styles: string[] = [];

  subgraph.edges.forEach((edge, i) => {
    const from = ids.get(edge.source);
    const to = ids.get(edge.target);
    lines.push(edge.diff === "added" ? `  ${from} -->|+| ${to}` : edge.diff === "removed" ? `  ${from} -.->|−| ${to}` : `  ${from} --> ${to}`);

    if (edge.diff === "added") styles.push(`  linkStyle ${i} stroke:#2e7d32,stroke-width:2px`);
    else if (edge.diff === "removed") styles.push(`  linkStyle ${i} stroke:#c62828`);
    else styles.push(`  linkStyle ${i} stroke:#9e9e9e`);
  });

  return `${[...lines, ...styles, ...CLASS_DEFS.map((line) => `  ${line}`)].join("\n")}\n`;
}

/**
 * The picture as a diagram of the web page, laid out by `layout`: a lane per
 * layer in `layerOrder` (then any other, by name), module and fn shapes with
 * `diff`, edges as dependencies or calls labelled `+`/`−`.
 */
export function diffDiagram(subgraph: DiffSubgraph, layerOrder: readonly string[]): Diagram {
  const shapeId = (node: Pick<SubgraphNode, "id" | "kind">): string => `${node.kind === "fn" ? "fn" : "mod"}:${node.id}`;
  const kinds = new Map(subgraph.nodes.map((node) => [node.id, node.kind]));

  const nodes = subgraph.nodes.map((node): DiagramNode => {
    const ref: NonNullable<DiagramNode["ref"]> = { id: node.id };

    if (node.file !== null) ref.file = node.file;

    if (node.line !== null) ref.line = node.line;

    return { id: shapeId(node), kind: node.layer === EXTERNAL ? "external" : node.kind, label: node.id, ref, diff: node.diff, group: node.layer, x: 0, y: 0, w: 0, h: 0 };
  });

  const edges = subgraph.edges.map((edge): DiagramEdge => {
    const line: DiagramEdge = { from: shapeId({ id: edge.source, kind: kinds.get(edge.source) ?? "module" }), to: shapeId({ id: edge.target, kind: kinds.get(edge.target) ?? "module" }), kind: edge.kind === "call" ? "call" : "dependency", diff: edge.diff };

    if (edge.diff !== null) line.label = edge.diff === "added" ? "+" : "−";

    return line;
  });

  // Lanes in the order of the layers, then the others by name; only lanes a shape sits in.
  const used = new Set(subgraph.nodes.map((node) => node.layer));
  const lanes = [...layerOrder.filter((layer) => used.has(layer)), ...[...used].filter((layer) => !layerOrder.includes(layer)).sort(compareText)];
  const groups = lanes.map((id): DiagramGroup => ({ id, label: id, kind: "lane", x: 0, y: 0, w: 0, h: 0 }));
  const diagram: Diagram = { nodes, edges, groups };

  if (subgraph.nodes.length === 0) diagram.reason = "no changes in the graph";
  else if (subgraph.more > 0) diagram.reason = `cut at ${subgraph.nodes.length} nodes: ${subgraph.more} more`;

  return layout(diagram);
}
