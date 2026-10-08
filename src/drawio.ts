// draw.io (diagrams.net) of a diagram, and a flow from a draw.io file
// (business-flows/28). The export is the picture `/diagrams` draws
// (`diagramOf` + `layout`) as an uncompressed `<mxfile>`: lanes as swimlanes,
// shapes styled as the web canvas styles them, every shape and edge an
// `<object>` cell whose `keylang_id` / `keylang_kind` (and, for a flow,
// `keylang_line`) say what it stands for. The import reads such a file back
// as the text of one flow, edited as little as the drawing asks: a shape the
// export made keeps its line (an ID or a condition changed on it rewrites
// that line, a shape removed removes it), a new shape with a `keylang_kind`
// becomes a trigger, step, `when`, `emits` or timer after the shape its edge
// comes from, and a shape keylang does not know becomes a
// `<!-- keylang:drawio note … -->` comment. An unchanged drawing gives the
// flow's text back unchanged, so a round trip proposes nothing. Pure.

import { inflateRawSync } from "node:zlib";
import { xmlEscape } from "./bpmn-export.ts";
import { diagramOf, type DiagramEdge, type DiagramInput, type DiagramNode } from "./diagram.ts";
import { parse } from "./parser.ts";
import { walkFlow, type Flow, type FlowItem, type Trigger } from "./spec-ir.ts";

/** Colours by verdict, as the web canvas (`web/src/canvas.ts`) draws them. */
const VERDICT_COLOUR: Record<string, { stroke: string; fill: string }> = {
  ok: { stroke: "#2e7d32", fill: "#e8f5e9" },
  fail: { stroke: "#c62828", fill: "#ffebee" },
  unverified: { stroke: "#b26a00", fill: "#fff8e1" },
  planned: { stroke: "#757575", fill: "#f5f5f5" },
};
const NEUTRAL = { stroke: "#455a64", fill: "#eceff1" };

function style(parts: Record<string, string | number>): string {
  return `${Object.entries(parts)
    .map(([key, value]) => `${key}=${value}`)
    .join(";")};`;
}

/** The style of a shape: the canvas's shape, colours and dashes, in draw.io's names. */
export function nodeStyle(node: Pick<DiagramNode, "kind" | "verdict">): string {
  const colour = (node.verdict && VERDICT_COLOUR[node.verdict]) || NEUTRAL;
  const base: Record<string, string | number> = { whiteSpace: "wrap", html: 1, strokeColor: colour.stroke, fillColor: colour.fill, fontColor: "#212121", fontSize: 11, strokeWidth: 1.5 };
  if (node.verdict === "planned") base.dashed = 1;
  // Small shapes carry their text below, as the canvas's captions.
  const below = { verticalLabelPosition: "bottom", verticalAlign: "top", labelPosition: "center", align: "center" };
  switch (node.kind) {
    case "start":
      return style({ ellipse: "", ...base, ...below, strokeWidth: 2, perimeter: "ellipsePerimeter" });
    case "event":
    case "timer":
      return style({ shape: "doubleEllipse", ...base, ...below, perimeter: "ellipsePerimeter" });
    case "gateway":
    case "parallel":
      return style({ rhombus: "", ...base, ...below, perimeter: "rhombusPerimeter" });
    case "hole":
      return style({ rounded: 1, ...base, dashed: 1, fontSize: 20, fontStyle: 1 });
    case "external":
      return style({ rounded: 1, ...base, dashed: 1, fillColor: "#ffffff" });
    case "layer":
      return style({ rounded: 1, ...base, fontStyle: 1 });
    default:
      return style({ rounded: 1, ...base });
  }
}

function edgeStyle(edge: DiagramEdge): string {
  const colour = (edge.verdict && VERDICT_COLOUR[edge.verdict]) || NEUTRAL;
  const dashed = edge.kind === "deny" || edge.kind === "emits" || edge.kind === "continues" || edge.kind === "call" || edge.kind === "dependency";
  return style({ edgeStyle: "orthogonalEdgeStyle", rounded: 0, html: 1, strokeColor: colour.stroke, fontColor: "#424242", fontSize: 10, endArrow: edge.kind === "call" || edge.kind === "dependency" ? "open" : "classic", dashed: dashed ? 1 : 0, labelBackgroundColor: "#ffffff" });
}

const LANE_STYLE = style({ swimlane: "", horizontal: 0, startSize: 26, fillColor: "#eef2f4", swimlaneFillColor: "#ffffff", strokeColor: "#b0bec5", fontColor: "#37474f", fontStyle: 1, fontSize: 12, html: 1 });

/** Text as draw.io reads an `html=1` label: `&`, `<` and `>` escaped, so a condition `a < b` is no tag. */
function htmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The label of a shape: a hole shows `?`, every other shape its label (a gateway's condition, a timer's `after 5m`). */
function labelOf(node: DiagramNode): string {
  return htmlText(node.kind === "hole" ? "?" : node.label);
}

/**
 * The `.drawio` of a view: `view` names it (`flow:<name>`, `discovered:<name>`,
 * `process:<domain>`, `entry:<id>`, `layers`) on the root cell and the page.
 * Throws on an empty diagram, with its reason.
 */
export function renderDrawio(input: DiagramInput, view: string): string {
  const diagram = diagramOf(input);
  if (diagram.nodes.length === 0) throw new Error(`export drawio: nothing to draw${diagram.reason ? `: ${diagram.reason}` : ""}`);
  const width = Math.max(800, ...diagram.nodes.map((node) => node.x + node.w + 40), ...diagram.groups.map((group) => group.x + group.w));
  const height = Math.max(600, ...diagram.nodes.map((node) => node.y + node.h + 40), ...diagram.groups.map((group) => group.y + group.h));
  const attr = (name: string, value: string | number | undefined): string => (value === undefined || value === "" ? "" : ` ${name}="${xmlEscape(String(value))}"`);
  const out: string[] = [];
  out.push(`<mxfile host="keylang" agent="keylang export drawio" version="1" type="device">`);
  out.push(`  <diagram id="keylang" name="${xmlEscape(view)}">`);
  out.push(`    <mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">`);
  out.push("      <root>");
  out.push(`        <object id="0" label=""${attr("keylang_view", view)}>`, "          <mxCell />", "        </object>");
  out.push('        <mxCell id="1" parent="0" />');
  for (const group of diagram.groups) {
    out.push(`        <object id="${xmlEscape(`lane:${group.id}`)}"${attr("label", htmlText(group.label))}${attr("keylang_id", group.id)} keylang_kind="lane">`);
    out.push(`          <mxCell style="${LANE_STYLE}" vertex="1" parent="1">`, `            <mxGeometry x="${group.x}" y="${group.y}" width="${group.w}" height="${group.h}" as="geometry" />`, "          </mxCell>", "        </object>");
  }
  for (const node of diagram.nodes) {
    const ref = node.ref;
    out.push(`        <object id="${xmlEscape(node.id)}"${attr("label", labelOf(node))}${attr("keylang_id", ref?.id ?? (node.kind === "gateway" ? node.label : undefined))} keylang_kind="${node.kind}"${attr("keylang_line", ref?.specLine)}${attr("keylang_verdict", node.verdict ?? undefined)}${attr("keylang_reason", node.reason)}${attr("keylang_file", ref?.file)}>`);
    out.push(`          <mxCell style="${nodeStyle(node)}" vertex="1" parent="1">`, `            <mxGeometry x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" as="geometry" />`, "          </mxCell>", "        </object>");
  }
  diagram.edges.forEach((edge, i) => {
    out.push(`        <object id="edge:${i}"${attr("label", edge.label === undefined ? undefined : htmlText(edge.label))} keylang_kind="${edge.kind}"${attr("keylang_verdict", edge.verdict ?? undefined)}>`);
    out.push(`          <mxCell style="${edgeStyle(edge)}" edge="1" parent="1"${attr("source", edge.from)}${attr("target", edge.to)}>`, '            <mxGeometry relative="1" as="geometry" />', "          </mxCell>", "        </object>");
  });
  out.push("      </root>", "    </mxGraphModel>", "  </diagram>", "</mxfile>");
  return `${out.join("\n")}\n`;
}

// ── reading XML ─────────────────────────────────────────────────────────────

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITY[name] ?? whole;
  });
}

/**
 * The element tree of an XML document — what a `.drawio` file needs: tags,
 * attributes, text, entities, comments, CDATA, processing instructions and a
 * doctype skipped. Throws on a document that is not well formed enough to
 * read (an unclosed or mismatched tag), naming the offset.
 */
export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlElement[] = [root];
  let at = 0;
  const fail = (what: string): never => {
    throw new Error(`not well-formed XML at offset ${at}: ${what}`);
  };
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    if (lt === -1) {
      stack.at(-1)!.text += decode(text.slice(at));
      break;
    }
    if (lt > at) stack.at(-1)!.text += decode(text.slice(at, lt));
    at = lt;
    if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at + 4);
      if (end === -1) fail("unclosed comment");
      at = end + 3;
    } else if (text.startsWith("<![CDATA[", at)) {
      const end = text.indexOf("]]>", at + 9);
      if (end === -1) fail("unclosed CDATA");
      stack.at(-1)!.text += text.slice(at + 9, end);
      at = end + 3;
    } else if (text.startsWith("<?", at)) {
      const end = text.indexOf("?>", at + 2);
      if (end === -1) fail("unclosed processing instruction");
      at = end + 2;
    } else if (text.startsWith("<!", at)) {
      const end = text.indexOf(">", at + 2);
      if (end === -1) fail("unclosed declaration");
      at = end + 1;
    } else if (text.startsWith("</", at)) {
      const end = text.indexOf(">", at);
      if (end === -1) fail("unclosed end tag");
      const name = text.slice(at + 2, end).trim();
      const open = stack.pop();
      if (!open || open === root || open.name !== name) fail(`</${name}> closes ${open && open !== root ? `<${open.name}>` : "nothing"}`);
      at = end + 1;
    } else {
      const tag = /^<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(text.slice(at));
      if (!tag) fail("a tag that cannot be read");
      const attrs: Record<string, string> = {};
      for (const m of tag![2]!.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]!] = decode(m[2] ?? m[3] ?? "");
      const element: XmlElement = { name: tag![1]!, attrs, children: [], text: "" };
      stack.at(-1)!.children.push(element);
      if (tag![3] !== "/") stack.push(element);
      at += tag![0].length;
    }
  }
  if (stack.length > 1) throw new Error(`not well-formed XML: <${stack.at(-1)!.name}> is not closed`);
  return root;
}

// ── reading a .drawio ───────────────────────────────────────────────────────

export interface DrawioCell {
  id: string;
  /** The label as draw.io shows it, HTML and line breaks dropped. */
  label: string;
  attrs: Record<string, string>;
  vertex: boolean;
  edge: boolean;
  source: string | null;
  target: string | null;
  style: string;
}

export interface DrawioModel {
  /** `keylang_view` of the root cell, else the page's name. */
  view: string | null;
  cells: DrawioCell[];
}

/** HTML of a label as plain text: tags out, `<br>` and `<div>` as spaces, entities decoded, spaces collapsed. */
function plain(label: string): string {
  return decode(label.replace(/<br\s*\/?>|<\/div>|<\/p>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function find(element: XmlElement, name: string): XmlElement | null {
  for (const child of element.children) {
    if (child.name === name) return child;
    const deeper = find(child, name);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * The cells of the first page of a `.drawio` file: plain, or compressed as
 * draw.io once saved by default (base64 of raw deflate of the URI-encoded
 * model). Cells wrapped in `<object>`/`<UserObject>` carry their attributes.
 */
export function parseDrawio(text: string): DrawioModel {
  const doc = parseXml(text);
  const page = find(doc, "diagram");
  let model = page ? find(page, "mxGraphModel") : find(doc, "mxGraphModel");
  if (!model && page && page.text.trim() !== "") {
    let inner: string;
    try {
      inner = decodeURIComponent(inflateRawSync(Buffer.from(page.text.trim(), "base64")).toString("latin1"));
    } catch {
      throw new Error("a compressed draw.io page that cannot be read");
    }
    model = find(parseXml(inner), "mxGraphModel");
  }
  if (!model) throw new Error("no draw.io diagram: no <mxGraphModel>");
  const root = find(model, "root");
  const cells: DrawioCell[] = [];
  let view: string | null = null;
  for (const child of root?.children ?? []) {
    const wrapped = child.name === "object" || child.name === "UserObject";
    const cell = wrapped ? (child.children.find((c) => c.name === "mxCell") ?? null) : child.name === "mxCell" ? child : null;
    if (cell === null) continue;
    const attrs = wrapped ? child.attrs : {};
    const id = attrs.id ?? cell.attrs.id ?? "";
    if (id === "0" && attrs.keylang_view) view = attrs.keylang_view;
    cells.push({
      id,
      label: plain(wrapped ? (attrs.label ?? "") : (cell.attrs.value ?? "")),
      attrs,
      vertex: cell.attrs.vertex === "1",
      edge: cell.attrs.edge === "1",
      source: cell.attrs.source ?? null,
      target: cell.attrs.target ?? null,
      style: cell.attrs.style ?? "",
    });
  }
  return { view: view ?? page?.attrs.name ?? null, cells };
}

// ── a flow from a drawing ───────────────────────────────────────────────────

/** The kinds a new shape may have to become a line of the flow. */
const NEW_KINDS = new Set(["start", "task", "external", "gateway", "parallel", "event", "timer"]);
/** The kinds of entry point a trigger line names (`trigger route <id>`); any other is a plain trigger. */
const TRIGGER_KINDS = new Set(["route", "cron", "consumer", "webhook"]);
/** Ids of shapes the export makes for a flow but which no line edits: holes, `calls`, parallel gateways. */
const DERIVED = /^(?:hole:\d+|calls:\d+:\d+|parallel:\d+(?::join)?)$/;

interface Entry {
  text: string;
  indent: number;
  /** The id of the shape the line stands for (`step:12`), or of the new cell it came from. */
  cell: string | null;
}

function indentOf(line: string): number {
  return /^ */.exec(line)![0].length;
}

/** `- step a.b` and its kin: a list line with its keyword. */
function listLine(indent: number, body: string): string {
  return `${" ".repeat(indent)}- ${body}`;
}

/** Text that cannot end an HTML comment. */
function commentSafe(text: string): string {
  return text.replace(/--+/g, (dashes) => dashes.split("").join(" "));
}

/** A flow line of a new shape, or null when it has nothing to say (no ID, no label). */
function lineOf(cell: DrawioCell): string | null {
  const kind = cell.attrs.keylang_kind;
  const id = (cell.attrs.keylang_id ?? "").trim() || cell.label;
  if (id === "" && kind !== "parallel") return null;
  switch (kind) {
    case "start": {
      const trigger = cell.attrs.keylang_trigger ?? "";
      return `trigger ${TRIGGER_KINDS.has(trigger) ? `${trigger} ` : ""}${id}`;
    }
    case "parallel":
      // The split is the line; a join is where the group ends, no line of its own.
      return cell.attrs.keylang_role === "join" ? null : "parallel";
    case "task":
    case "external":
      return `step ${id}`;
    case "gateway":
      return `when ${cell.label || id}`;
    case "event":
      return `emits event ${cell.label || id}`;
    case "timer": {
      const text = cell.label || id;
      return /^(?:after|every)\s/.test(text) ? text : `after ${text}`;
    }
    default:
      return null;
  }
}

/** The line of an existing item rewritten for the shape's new ID or label, or null when nothing on it changed. */
function rewritten(line: string, item: Trigger | FlowItem, cell: DrawioCell): string | null {
  const swap = (from: string, to: string): string | null => {
    if (to === "" || to === from) return null;
    const at = line.indexOf(from);
    return at === -1 ? null : `${line.slice(0, at)}${to}${line.slice(at + from.length)}`;
  };
  // The property or the label, whichever was edited: draw.io users edit what they see.
  const renamed = (from: string): string => {
    const id = (cell.attrs.keylang_id ?? "").trim();
    return id !== "" && id !== from ? id : cell.label;
  };
  switch (item.kind) {
    case "trigger": {
      const named = swap(item.target.target, renamed(item.target.target)) ?? line;
      // A trigger whose kind of entry point changed (the editor of `keylang web` says so only then).
      const kind = cell.attrs.keylang_trigger;
      if (kind === undefined) return named === line ? null : named;
      const next = named.replace(/^(\s*- trigger)(?:\s+(?:route|cron|consumer|webhook))?(\s+)/, (_all, head: string, space: string) => `${head}${TRIGGER_KINDS.has(kind) ? ` ${kind}` : ""}${space}`);
      return next === line ? null : next;
    }
    case "step":
      return swap(item.target.target, renamed(item.target.target));
    case "then":
      return item.form === "ref" ? swap(item.target.target, renamed(item.target.target)) : swap(item.prose, cell.label);
    case "when":
      return swap(item.condition, cell.label);
    case "emits":
      return swap(item.body.replace(/^event\s+/, "").trim(), cell.label);
    case "after":
    case "every": {
      const value = cell.label.startsWith(`${item.kind} `) ? cell.label.slice(item.kind.length + 1).trim() : cell.label;
      return swap(item.value, value);
    }
    default:
      return null;
  }
}

/**
 * The section of flow `name` as the drawing says it: `current` is the flow's
 * section as it is (lines from its heading to the next heading) and `flow`
 * its IR with lines counted from `firstLine` (the heading's line in the
 * file); both null for a flow the specs do not have yet, which the drawing
 * then builds from its start shapes along its edges. Returns the new section
 * text; the same text when the drawing changed nothing keylang reads.
 */
export function flowFromDrawio(model: DrawioModel, name: string, current: { text: string; flow: Flow; firstLine: number } | null): string {
  const lines = current ? current.text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n") : [`# flow ${name}`, ""];
  const items = new Map<string, Trigger | FlowItem>();
  if (current) {
    walkFlow(current.flow, (item) => {
      if (item.kind === "trigger" || item.kind === "step" || item.kind === "then" || item.kind === "when" || item.kind === "emits" || item.kind === "after" || item.kind === "every" || item.kind === "parallel") items.set(`${item.kind}:${item.span.start.line}`, item);
    });
  }
  const entries: Entry[] = lines.map((text) => ({ text, indent: indentOf(text), cell: null }));
  const entryOf = new Map<string, Entry>();
  for (const [id, item] of items) {
    const entry = entries[item.span.start.line - (current?.firstLine ?? 1)];
    if (entry) {
      entry.cell = id;
      entryOf.set(id, entry);
    }
  }
  const byId = new Map(model.cells.map((cell) => [cell.id, cell]));
  const vertices = model.cells.filter((cell) => cell.vertex && cell.id !== "0" && cell.id !== "1");

  // Shapes the export made: an ID or a label changed rewrites the line; a removed shape takes its line out, its nested lines move up one level.
  for (const [id, item] of items) {
    const entry = entryOf.get(id)!;
    const cell = byId.get(id);
    if (cell === undefined) {
      const at = entries.indexOf(entry);
      for (let i = at + 1; i < entries.length && entries[i]!.text.trim() !== "" && entries[i]!.indent > entry.indent; i++) {
        const below = entries[i]!;
        const less = Math.min(2, below.indent - entry.indent);
        below.text = below.text.slice(less);
        below.indent -= less;
      }
      entries.splice(at, 1);
      continue;
    }
    const line = rewritten(entry.text, item, cell);
    if (line !== null) entry.text = line;
  }

  // New shapes, each after the shape its first incoming edge leaves; a chain of new shapes in order.
  const incoming = (id: string): DrawioCell | null => {
    for (const cell of model.cells) if (cell.edge && cell.target === id && cell.source !== null && byId.get(cell.source)?.vertex) return cell;
    return null;
  };
  const fresh = vertices.filter((cell) => !items.has(cell.id) && !DERIVED.test(cell.id) && cell.attrs.keylang_kind !== undefined && NEW_KINDS.has(cell.attrs.keylang_kind) && lineOf(cell) !== null);
  const notes = vertices.filter((cell) => cell.attrs.keylang_kind === undefined && cell.label !== "" && !/(?:^|;)swimlane(?:;|$)/.test(cell.style));
  const pending = new Set(fresh.map((cell) => cell.id));
  const flowEnd = (): number => {
    let end = entries.length;
    while (end > 0 && entries[end - 1]!.text.trim() === "") end--;
    return end;
  };
  /** The end of an entry's nested lines. */
  const subtreeEnd = (at: number): number => {
    let end = at + 1;
    while (end < entries.length && entries[end]!.text.trim() !== "" && entries[end]!.indent > entries[at]!.indent) end++;
    return end;
  };
  /** A new step's `test` lines (`keylang_tests`, one per line) go right under it. */
  const testsOf = (cell: DrawioCell, indent: number): Entry[] =>
    (cell.attrs.keylang_tests ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^test\s/.test(line))
      .map((line) => ({ text: listLine(indent + 2, line), indent: indent + 2, cell: null }));
  const place = (cell: DrawioCell, after: Entry | null, branch: boolean, sibling = false): void => {
    const body = lineOf(cell)!;
    if (after === null) {
      const end = flowEnd();
      const entry = { text: listLine(0, body), indent: 0, cell: cell.id };
      // A first list line after prose needs a blank line before it.
      const before = entries[end - 1];
      const gap = before !== undefined && before.text.trim() !== "" && !/^\s*- /.test(before.text) ? [{ text: "", indent: 0, cell: null }] : [];
      entries.splice(end, 0, ...gap, entry, ...testsOf(cell, 0));
      entryOf.set(cell.id, entry);
      return;
    }
    const at = entries.indexOf(after);
    const end = subtreeEnd(at);
    const gateway = after.cell !== null && (after.cell.startsWith("when:") || byId.get(after.cell)?.attrs.keylang_kind === "gateway");
    const parallel = after.cell !== null && (/^parallel:\d+$/.test(after.cell) || (byId.get(after.cell)?.attrs.keylang_kind === "parallel" && byId.get(after.cell)?.attrs.keylang_role !== "join"));
    // Into a gateway's branch when the edge carries its condition, into a parallel group always; else as the first nested line of a parent, or the next sibling.
    // A `test` line under a step is not a nested step: the next shape is its sibling.
    const hasNested = entries.slice(at + 1, end).some((entry) => !/^\s*- test\s/.test(entry.text));
    const nested = sibling ? false : parallel ? true : gateway ? branch : hasNested;
    const indent = nested ? after.indent + 2 : after.indent;
    const entry = { text: listLine(indent, body), indent, cell: cell.id };
    // A group's steps keep the order they are placed in; a nested line otherwise goes first under its parent.
    entries.splice(nested ? (parallel ? end : at + 1) : end, 0, entry, ...testsOf(cell, indent));
    entryOf.set(cell.id, entry);
  };
  /** The split of a parallel group a join closes: back along the edges into the join, to the first split. */
  const splitOf = (join: string): string | null => {
    const code = /^(parallel:\d+):join$/.exec(join);
    if (code) return code[1]!;
    let frontier = [join];
    const seen = new Set(frontier);
    for (let depth = 0; depth < 50 && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of model.cells) {
          if (!edge.edge || edge.target !== id || edge.source === null || seen.has(edge.source)) continue;
          const source = byId.get(edge.source);
          if (source?.attrs.keylang_kind === "parallel" && source.attrs.keylang_role !== "join") return source.id;
          seen.add(edge.source);
          next.push(edge.source);
        }
      }
      frontier = next;
    }
    return null;
  };
  for (let progress = true; progress && pending.size > 0; ) {
    progress = false;
    for (const cell of fresh) {
      if (!pending.has(cell.id)) continue;
      const edge = incoming(cell.id);
      const from = edge?.source ?? null;
      if (from !== null && pending.has(from)) continue;
      // After the join of a parallel group: the next sibling of the group's line.
      const fromJoin = from !== null && (/^parallel:\d+:join$/.test(from) || byId.get(from)?.attrs.keylang_role === "join");
      const split = fromJoin ? splitOf(from!) : null;
      if (split !== null && pending.has(split)) continue;
      const anchor = from === null ? null : fromJoin ? (split === null ? null : (entryOf.get(split) ?? null)) : (entryOf.get(from) ?? null);
      if (fromJoin && anchor !== null) {
        place(cell, anchor, false, true);
      } else if (from !== null && anchor === null && !(cell.attrs.keylang_kind === "start")) {
        // Its edge leaves a shape that is no line (a hole, a parallel gateway, a note): the end of the flow.
        place(cell, null, false);
      } else {
        const source = from === null ? undefined : byId.get(from);
        place(cell, anchor, edge !== null && source !== undefined && edge.label !== "" && edge.label === source.label);
      }
      pending.delete(cell.id);
      progress = true;
    }
  }

  // Notes: once each, after the flow's last line, with a blank line before them.
  const have = new Set(entries.map((entry) => entry.text.trim()));
  const added = notes.map((cell) => `<!-- keylang:drawio note ${commentSafe(cell.label)} -->`).filter((note, i, all) => !have.has(note) && all.indexOf(note) === i);
  if (added.length > 0) {
    const end = flowEnd();
    entries.splice(end, 0, ...[{ text: "", indent: 0, cell: null }, ...added.map((text) => ({ text, indent: 0, cell: null }))]);
  }
  const body = entries.map((entry) => entry.text).join("\n");
  if (!current) return `${body.replace(/\n+$/, "")}\n`;
  // The section ends as it ended: the same trailing newlines.
  const tail = /\n*$/.exec(current.text.replace(/\r\n/g, "\n"))![0];
  return `${body}${tail}`;
}

/** The flow a `.drawio` file draws: `flow:<name>` or `discovered:<name>` of its view, or null for any other view. */
export function drawioFlowName(model: DrawioModel): string | null {
  const match = /^(?:flow|discovered):(.+)$/.exec(model.view ?? "");
  return match ? match[1]! : null;
}

/**
 * The section of flow `name` in a spec's text: its lines from the heading to
 * the next heading (LF), and the heading's line; null when the text has none.
 */
export function flowSection(text: string, name: string): { text: string; firstLine: number } | null {
  const normal = text.replace(/\r\n/g, "\n");
  const sections = parse("spec.md", normal).sections;
  const index = sections.findIndex((section) => section.kind === "flow" && section.name?.value === name && section.heading !== null);
  if (index === -1) return null;
  const lines = normal.split("\n");
  const start = sections[index]!.heading!.span.start.line - 1;
  const next = sections.slice(index + 1).find((section) => section.heading !== null);
  const end = next ? next.heading!.span.start.line - 1 : lines.length;
  return { text: lines.slice(start, end).join("\n"), firstLine: start + 1 };
}
