// BPMN 2.0 of a diagram (business-flows/28): the picture `/diagrams` draws
// (`diagramOf` + `layout`), as XML with its BPMNDI so Camunda Modeler or
// bpmn.io opens it as drawn. The mapping is the table «Відображення в BPMN»
// of ADR 0023: a layer is a lane of the one pool, a trigger a start event
// (message for route/webhook/consumer, timer for cron, signal for an
// observer), a step a task, `when` an exclusive gateway whose branch carries
// the condition, `parallel` a diverging and a converging parallel gateway,
// `emits` a signal throw event, `after`/`every` a timer catch event, a package
// a collapsed pool reached by message flows, `continues` a message flow from
// the continued flow's collapsed pool, and a hole a `?` task documented with
// its reason. Every semantic element carries `keylang:id` and
// `keylang:verdict` in the keylang namespace. Pure: the same input gives the
// same bytes; full BPMN semantics are out of scope (spec §7).

import { diagramOf, type Diagram, type DiagramInput, type DiagramNode } from "./diagram.ts";
import { EXTERNAL } from "./external-ids.ts";
import { walkFlow, type Flow } from "./spec-ir.ts";

export const KEYLANG_NS = "https://github.com/Ivlad003/keylang/ns/diagram";
const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";

/** Pool header, lane header and the gap before a collapsed pool, px. */
const POOL_HEAD = 30;
const LANE_HEAD = 30;
const GAP = 40;
const COLLAPSED_H = 60;

/** Text in an XML attribute or element. */
export function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** NCName ids for the document: distinct even where two keys map to one. */
function ids(): (key: string) => string {
  const byKey = new Map<string, string>();
  const used = new Set<string>();
  return (key) => {
    const known = byKey.get(key);
    if (known !== undefined) return known;
    const base = `k_${key.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    byKey.set(key, id);
    return id;
  };
}

type StartKind = "message" | "timer" | "signal" | null;

/** The start event of an entry point's kind (ADR 0023): a request or a message waits for a message, cron for a timer, an observer for a signal. */
export function startKindOf(kind: string | null | undefined): StartKind {
  if (kind === "cron") return "timer";
  if (kind === "observer") return "signal";
  if (kind === "route" || kind === "rest" || kind === "graphql" || kind === "consumer" || kind === "webhook" || kind === "controller") return "message";
  return null;
}

/** What the diagram does not keep of a flow: the kind of each trigger (by node id) and the flows it continues. */
function flowFacts(input: DiagramInput): { triggers: Map<string, string | null>; continues: string[]; flow: Flow | null } {
  const triggers = new Map<string, string | null>();
  const view = input.view;
  if (view.kind !== "flow") return { triggers, continues: [], flow: null };
  const flow = input.spec.flows.find((f) => f.name === view.name) ?? null;
  const continues: string[] = [];
  if (flow) {
    const entries = new Map((input.snapshot?.entries ?? []).map((entry) => [entry.id, entry.kind as string]));
    walkFlow(flow, (item) => {
      if (item.kind === "trigger") triggers.set(`trigger:${item.span.start.line}`, item.entry?.kind ?? entries.get(item.target.target) ?? null);
      else if (item.kind === "continues") continues.push(item.flow);
    });
  }
  return { triggers, continues, flow };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Waypoints from one box to another: out of the right side, across, into the left side; down or up when the target is not to the right. */
function route(from: Box, to: Box): [number, number][] {
  const fy = from.y + from.h / 2;
  const ty = to.y + to.h / 2;
  if (to.x >= from.x + from.w) {
    const sx = from.x + from.w;
    const mid = Math.round((sx + to.x) / 2);
    return fy === ty ? [[sx, fy], [to.x, ty]] : [[sx, fy], [mid, fy], [mid, ty], [to.x, ty]];
  }
  const fx = from.x + from.w / 2;
  const tx = to.x + to.w / 2;
  const down = to.y >= from.y + from.h;
  const sy = down ? from.y + from.h : from.y;
  const ey = down ? to.y : to.y + to.h;
  const mid = Math.round((sy + ey) / 2);
  return fx === tx ? [[fx, sy], [tx, ey]] : [[fx, sy], [fx, mid], [tx, mid], [tx, ey]];
}

/**
 * The BPMN of a view: `flow` (and a discovered flow, drawn as a flow),
 * `process` and `entry`. Throws on `layers` (no process to show) and on an
 * empty diagram, with the reason the diagram gives.
 */
export function renderBpmn(input: DiagramInput, name: string): string {
  if (input.view.kind === "layers" || input.view.kind === "event") throw new Error(`export bpmn: the ${input.view.kind} view is no process; export a flow, a discovered flow or a business process`);
  const diagram = diagramOf(input);
  if (diagram.nodes.length === 0) throw new Error(`export bpmn: nothing to draw${diagram.reason ? `: ${diagram.reason}` : ""}`);
  return bpmnOf(diagram, input, name);
}

function bpmnOf(diagram: Diagram, input: DiagramInput, name: string): string {
  const id = ids();
  const facts = flowFacts(input);
  const entries = new Map((input.snapshot?.entries ?? []).map((entry) => [entry.id, entry.kind as string]));
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const external = (node: DiagramNode): boolean => node.kind === "external" || (node.group === EXTERNAL && node.kind !== "start");
  const inside = diagram.nodes.filter((node) => !external(node));
  const outside = diagram.nodes.filter(external);

  // Geometry: the pool and its lane headers push the drawn shapes right; a node out of every lane gets a lane of its own below.
  const dx = POOL_HEAD + LANE_HEAD;
  const box = new Map<string, Box>();
  for (const node of inside) box.set(node.id, { x: node.x + dx, y: node.y, w: node.w, h: node.h });
  const laneIds = new Set(diagram.groups.map((group) => group.id));
  const lanes = diagram.groups
    .map((group) => ({ key: group.id, label: group.label, members: inside.filter((node) => node.group === group.id), box: { x: POOL_HEAD, y: group.y, w: group.w + LANE_HEAD, h: group.h } }))
    .filter((lane) => lane.members.length > 0);
  const loose = inside.filter((node) => node.group === undefined || !laneIds.has(node.group));
  const right = Math.max(...inside.map((node) => node.x + node.w + dx), ...lanes.map((lane) => lane.box.x + lane.box.w), 200) + 20;
  for (const lane of lanes) lane.box.w = right - POOL_HEAD;
  if (lanes.length > 0 && loose.length > 0) {
    const top = Math.min(...loose.map((node) => node.y)) - 20;
    const bottom = Math.max(...loose.map((node) => node.y + node.h)) + 20;
    const from = Math.max(top, ...lanes.map((lane) => lane.box.y + lane.box.h));
    lanes.push({ key: "@other", label: "—", members: loose, box: { x: POOL_HEAD, y: from, w: right - POOL_HEAD, h: Math.max(bottom - from, 60) } });
  }
  const poolTop = Math.min(0, ...inside.map((node) => node.y - 20), ...lanes.map((lane) => lane.box.y));
  const poolBottom = Math.max(...inside.map((node) => node.y + node.h + 20), ...lanes.map((lane) => lane.box.y + lane.box.h));
  const pool: Box = { x: 0, y: poolTop, w: right, h: poolBottom - poolTop };
  // Collapsed pools under the main one: each package, then each flow this one continues.
  const collapsed: { key: string; label: string; node: DiagramNode | null; box: Box }[] = [];
  let y = poolBottom + GAP;
  for (const node of outside) {
    collapsed.push({ key: node.id, label: node.label, node, box: { x: 0, y, w: right, h: COLLAPSED_H } });
    y += COLLAPSED_H + GAP;
  }
  for (const flow of facts.continues) {
    collapsed.push({ key: `continues:${flow}`, label: flow, node: null, box: { x: 0, y, w: right, h: COLLAPSED_H } });
    y += COLLAPSED_H + GAP;
  }

  const processId = id("@process");
  const collaborationId = id("@collaboration");
  const verdictOf = (node: DiagramNode | null): string => node?.verdict ?? "none";
  const keyAttrs = (key: string, verdict: string): string => ` keylang:id="${xmlEscape(key)}" keylang:verdict="${xmlEscape(verdict)}"`;
  const nodeKey = (node: DiagramNode): string => node.ref?.id ?? node.id;

  // Sequence flows inside the pool; an edge to or from a package is a message flow to or from its pool, and the sequence goes around it.
  const sequence: { key: string; from: string; to: string; label?: string; condition?: string }[] = [];
  const messages: { key: string; from: string; to: string; fromBox: Box; toBox: Box; label?: string }[] = [];
  const outsideIds = new Set(outside.map((node) => node.id));
  const collapsedBox = new Map(collapsed.map((pool) => [pool.key, pool.box]));
  const seen = new Set<string>();
  diagram.edges.forEach((edge, i) => {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) return;
    const fromOut = outsideIds.has(edge.from);
    const toOut = outsideIds.has(edge.to);
    if (fromOut || toOut) {
      if (fromOut && toOut) return;
      const own = fromOut ? edge.to : edge.from;
      const pool = fromOut ? edge.from : edge.to;
      messages.push({ key: `m${i}`, from: fromOut ? `pool:${pool}` : own, to: fromOut ? own : `pool:${pool}`, fromBox: fromOut ? collapsedBox.get(pool)! : box.get(own)!, toBox: fromOut ? box.get(own)! : collapsedBox.get(pool)!, ...(edge.label !== undefined ? { label: edge.label } : {}) });
      if (toOut) {
        // A → package → B stays a sequence A → B in the pool.
        for (const next of diagram.edges) {
          if (next.from !== edge.to || outsideIds.has(next.to) || !nodes.has(next.to)) continue;
          const key = `${edge.from}\u0000${next.to}`;
          if (seen.has(key)) continue;
          seen.add(key);
          sequence.push({ key: `s${i}_${next.to}`, from: edge.from, to: next.to });
        }
      }
      return;
    }
    const key = `${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    const from = nodes.get(edge.from)!;
    const condition = from.kind === "gateway" && edge.label === from.label ? from.label : undefined;
    sequence.push({ key: `s${i}`, from: edge.from, to: edge.to, ...(edge.label !== undefined ? { label: edge.label } : {}), ...(condition !== undefined ? { condition } : {}) });
  });
  for (const flow of facts.continues) {
    for (const start of inside.filter((node) => node.kind === "start")) {
      messages.push({ key: `c:${flow}:${start.id}`, from: `pool:continues:${flow}`, to: start.id, fromBox: collapsedBox.get(`continues:${flow}`)!, toBox: box.get(start.id)!, label: `continues ${flow}` });
    }
  }

  const signals = new Map<string, string>();
  for (const node of inside) if (node.kind === "event" && !signals.has(node.label)) signals.set(node.label, id(`signal:${node.label}`));

  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<bpmn:definitions xmlns:bpmn="${BPMN_NS}" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:keylang="${KEYLANG_NS}" id="${id("@definitions")}" targetNamespace="${KEYLANG_NS}" exporter="keylang" exporterVersion="1">`);
  for (const [label, signal] of signals) out.push(`  <bpmn:signal id="${signal}" name="${xmlEscape(label)}" />`);
  out.push(`  <bpmn:collaboration id="${collaborationId}">`);
  out.push(`    <bpmn:participant id="${id("@pool")}" name="${xmlEscape(name)}" processRef="${processId}"${keyAttrs(name, "none")} />`);
  for (const c of collapsed) out.push(`    <bpmn:participant id="${id(`pool:${c.key}`)}" name="${xmlEscape(c.label)}"${keyAttrs(c.node ? nodeKey(c.node) : c.label, verdictOf(c.node))} />`);
  for (const m of messages) out.push(`    <bpmn:messageFlow id="${id(m.key)}" sourceRef="${id(m.from)}" targetRef="${id(m.to)}"${m.label !== undefined ? ` name="${xmlEscape(m.label)}"` : ""} />`);
  out.push("  </bpmn:collaboration>");
  out.push(`  <bpmn:process id="${processId}" name="${xmlEscape(name)}" isExecutable="false">`);
  if (lanes.length > 0) {
    out.push(`    <bpmn:laneSet id="${id("@lanes")}">`);
    for (const lane of lanes) {
      out.push(`      <bpmn:lane id="${id(`lane:${lane.key}`)}" name="${xmlEscape(lane.label)}"${keyAttrs(lane.key, "none")}>`);
      for (const node of lane.members) out.push(`        <bpmn:flowNodeRef>${id(node.id)}</bpmn:flowNodeRef>`);
      out.push("      </bpmn:lane>");
    }
    out.push("    </bpmn:laneSet>");
  }
  for (const node of inside) out.push(...flowNode(node, id(node.id), keyAttrs(nodeKey(node), verdictOf(node)), facts.triggers.get(node.id) ?? entries.get(node.ref?.id ?? "") ?? null, signals, diagram, id));
  for (const s of sequence) {
    const label = s.label !== undefined ? ` name="${xmlEscape(s.label)}"` : "";
    const head = `    <bpmn:sequenceFlow id="${id(s.key)}" sourceRef="${id(s.from)}" targetRef="${id(s.to)}"${label}`;
    if (s.condition === undefined) out.push(`${head} />`);
    else out.push(`${head}>`, `      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${xmlEscape(s.condition)}</bpmn:conditionExpression>`, "    </bpmn:sequenceFlow>");
  }
  out.push("  </bpmn:process>");

  // BPMNDI: the pool, its lanes, the shapes, the collapsed pools, then the edges with their waypoints.
  const bounds = (b: Box): string => `<dc:Bounds x="${Math.round(b.x)}" y="${Math.round(b.y)}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" />`;
  const shape = (element: string, b: Box, extra = ""): string => `      <bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}"${extra}>${bounds(b)}</bpmndi:BPMNShape>`;
  const edge = (element: string, points: [number, number][]): string => `      <bpmndi:BPMNEdge id="${element}_di" bpmnElement="${element}">${points.map(([px, py]) => `<di:waypoint x="${Math.round(px)}" y="${Math.round(py)}" />`).join("")}</bpmndi:BPMNEdge>`;
  out.push(`  <bpmndi:BPMNDiagram id="${id("@diagram")}">`);
  out.push(`    <bpmndi:BPMNPlane id="${id("@plane")}" bpmnElement="${collaborationId}">`);
  out.push(shape(id("@pool"), pool, ' isHorizontal="true"'));
  for (const lane of lanes) out.push(shape(id(`lane:${lane.key}`), lane.box, ' isHorizontal="true"'));
  for (const node of inside) out.push(shape(id(node.id), box.get(node.id)!, node.kind === "gateway" ? ' isMarkerVisible="true"' : ""));
  for (const c of collapsed) out.push(shape(id(`pool:${c.key}`), c.box, ' isHorizontal="true" isExpanded="false"'));
  for (const s of sequence) out.push(edge(id(s.key), route(box.get(s.from)!, box.get(s.to)!)));
  for (const m of messages) {
    // A message goes straight up or down between a shape and a pool, at the shape's middle.
    const fromPool = m.from.startsWith("pool:");
    const shapeBox = fromPool ? m.toBox : m.fromBox;
    const poolBox = fromPool ? m.fromBox : m.toBox;
    const x = shapeBox.x + shapeBox.w / 2;
    const shapeEdge = poolBox.y >= shapeBox.y + shapeBox.h ? shapeBox.y + shapeBox.h : shapeBox.y;
    const poolEdge = poolBox.y >= shapeBox.y + shapeBox.h ? poolBox.y : poolBox.y + poolBox.h;
    out.push(edge(id(m.key), fromPool ? [[x, poolEdge], [x, shapeEdge]] : [[x, shapeEdge], [x, poolEdge]]));
  }
  out.push("    </bpmndi:BPMNPlane>");
  out.push("  </bpmndi:BPMNDiagram>");
  out.push("</bpmn:definitions>");
  return `${out.join("\n")}\n`;
}

/** The semantic element of one shape in the pool. */
function flowNode(node: DiagramNode, element: string, attrs: string, entryKind: string | null, signals: ReadonlyMap<string, string>, diagram: Diagram, id: (key: string) => string): string[] {
  const named = ` name="${xmlEscape(node.label)}"`;
  switch (node.kind) {
    case "start": {
      const kind = startKindOf(entryKind);
      const head = `    <bpmn:startEvent id="${element}"${named}${attrs}`;
      if (kind === null) return [`${head} />`];
      if (kind === "timer") return [`${head}>`, `      <bpmn:timerEventDefinition id="${id(`${node.id}:def`)}" />`, "    </bpmn:startEvent>"];
      return [`${head}>`, `      <bpmn:${kind}EventDefinition id="${id(`${node.id}:def`)}" />`, "    </bpmn:startEvent>"];
    }
    case "gateway":
      return [`    <bpmn:exclusiveGateway id="${element}"${named}${attrs} />`];
    case "parallel": {
      const join = node.id.endsWith(":join") || diagram.edges.filter((edge) => edge.to === node.id).length > 1;
      return [`    <bpmn:parallelGateway id="${element}" gatewayDirection="${join ? "Converging" : "Diverging"}"${attrs} />`];
    }
    case "event":
      return [`    <bpmn:intermediateThrowEvent id="${element}"${named}${attrs}>`, `      <bpmn:signalEventDefinition id="${id(`${node.id}:def`)}" signalRef="${signals.get(node.label)!}" />`, "    </bpmn:intermediateThrowEvent>"];
    case "timer": {
      const [word, ...rest] = node.label.split(" ");
      const value = xmlEscape(rest.join(" "));
      const timer = word === "every" ? `<bpmn:timeCycle xsi:type="bpmn:tFormalExpression">${value}</bpmn:timeCycle>` : `<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${value}</bpmn:timeDuration>`;
      return [`    <bpmn:intermediateCatchEvent id="${element}"${named}${attrs}>`, `      <bpmn:timerEventDefinition id="${id(`${node.id}:def`)}">${timer}</bpmn:timerEventDefinition>`, "    </bpmn:intermediateCatchEvent>"];
    }
    case "hole":
      return [`    <bpmn:task id="${element}" name="?"${attrs}>`, `      <bpmn:documentation>${xmlEscape(`keylang: ${node.reason ?? "the route here is not proven"}`)}</bpmn:documentation>`, "    </bpmn:task>"];
    default:
      return [`    <bpmn:task id="${element}"${named}${attrs} />`];
  }
}
