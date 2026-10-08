// Business names of discovered flows (business-flows/12): a model groups the
// flows of one layer into business processes — name, a few sentences, a
// domain, the entities in and out, the flows that belong to it — in one
// request per layer group, never per flow. Offline first: each flow already
// carries the words of its doc comments (`offlineDescription`), which the
// request passes on. The answer is checked (flows it names that the group
// does not have are dropped, IDs it invents are named) and kept in the
// generated `<dir>/flows-discovered/README.md`, domain → process → flows,
// each process under a `keylang:llm` comment with its model, date and
// baseline: a hash of the closures of its flows' steps, so a change of a
// step's code makes the process stale (as briefs go stale, ADR 0004). Pure
// over the snapshot, the discovery and the saved README; the operation asks
// and writes. Nothing here decides a verdict.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { specPath } from "./config.ts";
import type { DiagramProcess } from "./diagram.ts";
import { DISCOVER_MARK, DISCOVERED_DIR, discoverFlows, firstLevelSteps, proseLine, specifiedTriggers, unproseLine, type DiscoveredFlow } from "./discover.ts";
import { explanationOf, snapshotBaseline, type StoredExplanation } from "./explanations.ts";
import { EXTERNAL } from "./graph.ts";
import type { LlmRequest } from "./llm.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import type { SpecIR } from "./spec-ir.ts";
import { compareText } from "./span.ts";

/** `algo`: no model, the offline descriptions only; `llm`: a model is required; `hybrid`: a model when there is one. */
export const NAME_MODES = ["algo", "llm", "hybrid"] as const;
export type NameMode = (typeof NAME_MODES)[number];

export function isNameMode(value: string): value is NameMode {
  return (NAME_MODES as readonly string[]).includes(value);
}

/** The domains a model picks from, in the README's order; it may propose another, which goes before `Інше`. */
export const DOMAINS = ["Каталог", "Кошик", "Оформлення", "Оплата", "Доставка", "Повернення", "Інтеграції", "Адміністрування", "Інше"] as const;
const OTHER = "Інше";

/** The README of the view, beside its `<layer>.md` files. */
export const PROCESSES_FILE = "README.md";

/** One business process as saved in the README. */
export interface BusinessProcess {
  name: string;
  /** Two to four sentences. */
  description: string;
  domain: string;
  inputs: string[];
  outputs: string[];
  /** Names of its discovered flows, in the answer's order. */
  flows: string[];
  /** The layer group it was asked for. */
  layer: string;
  /** The agent that answered (`cli:claude:<model>`), the date (`YYYY-MM-DD`), the baseline (`processBaseline`). */
  agent: string;
  date: string;
  closure: string;
}

/** The flows of one layer: one request. */
export interface NameGroup {
  layer: string;
  flows: DiscoveredFlow[];
}

/** The flows of the discovery by the layer of their trigger, layers and flows sorted. */
export function nameGroups(flows: readonly DiscoveredFlow[]): NameGroup[] {
  const by = new Map<string, DiscoveredFlow[]>();
  for (const flow of flows) by.set(flow.layer, [...(by.get(flow.layer) ?? []), flow]);
  return [...by.keys()].sort(compareText).map((layer) => ({ layer, flows: by.get(layer)!.sort((a, b) => compareText(a.name, b.name)) }));
}

/**
 * The baseline of a process: a hash of every step of its flows with the
 * baseline of an explanation of that step (`snapshotBaseline`, the closure
 * fingerprint of a fn). A step's code changing, a step added or gone, makes
 * it differ.
 */
export function processBaseline(snapshot: AnalysisSnapshot, flows: readonly Pick<DiscoveredFlow, "name" | "steps">[]): string {
  const lines = [...new Set(flows.flatMap((flow) => flow.steps))].sort(compareText).map((id) => `${id} ${snapshotBaseline(snapshot, id) ?? "-"}`);
  const names = flows.map((flow) => flow.name).sort(compareText);
  return createHash("sha256").update([`flows ${names.join(",")}`, ...lines].join("\n")).digest("hex");
}

/** A saved process whose flows are gone or whose baseline changed. */
export function isStaleProcess(snapshot: AnalysisSnapshot, byName: ReadonlyMap<string, DiscoveredFlow>, process: BusinessProcess): boolean {
  const flows = process.flows.map((name) => byName.get(name));
  if (flows.some((flow) => flow === undefined)) return true;
  return processBaseline(snapshot, flows as DiscoveredFlow[]) !== process.closure;
}

/** What a `--names` run asks: the groups, and the saved processes that are stale. */
export interface NamesPlan {
  groups: NameGroup[];
  stale: BusinessProcess[];
}

/**
 * The groups to ask for: with `stale`, only the layers of stale processes;
 * otherwise also every layer with a flow no fresh process has. `layer`
 * narrows to one layer, `limit` keeps the first groups.
 */
export function planNames(snapshot: AnalysisSnapshot, flows: readonly DiscoveredFlow[], saved: readonly BusinessProcess[], options: { stale: boolean; layer?: string; limit?: number }): NamesPlan {
  const byName = new Map(flows.map((flow) => [flow.name, flow]));
  const stale = saved.filter((p) => isStaleProcess(snapshot, byName, p));
  const staleLayers = new Set(stale.map((p) => p.layer));
  const covered = new Set(saved.filter((p) => !stale.includes(p)).flatMap((p) => p.flows));
  let groups = nameGroups(flows).filter((group) => staleLayers.has(group.layer) || (!options.stale && group.flows.some((flow) => !covered.has(flow.name))));
  if (options.layer !== undefined) groups = groups.filter((group) => group.layer === options.layer);
  if (options.limit !== undefined) groups = groups.slice(0, options.limit);
  return { groups, stale };
}

/** Most steps of one flow a prompt lists; the rest are counted. */
const MAX_STEPS = 30;

/**
 * The request for one layer group: each flow with its entry point, trigger,
 * offline description and its steps with what the explained map says about
 * them (doc comments, briefs). The answer is JSON.
 */
export function namesRequest(snapshot: AnalysisSnapshot, group: NameGroup, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }): LlmRequest {
  const flows = group.flows.map((flow) => {
    const steps = flow.steps.slice(1, MAX_STEPS + 1).map((id) => {
      const e = explanationOf(snapshot, options.briefs, id);
      return `  - \`${id}\`${e ? `: ${e.text}` : ""}`;
    });
    if (flow.steps.length - 1 > MAX_STEPS) steps.push(`  … (${flow.steps.length - 1 - MAX_STEPS} more not shown)`);
    const trigger = explanationOf(snapshot, options.briefs, flow.trigger);
    return [
      `Flow ${flow.name} — ${flow.entry.kind} ${flow.entry.label}, trigger \`${flow.trigger}\`${trigger && !flow.description ? `: ${trigger.text}` : ""}`,
      ...(flow.description ? [`  described in the code: ${flow.description}`] : []),
      ...(steps.length > 0 ? ["  steps:", ...steps] : []),
      ...(flow.holes > 0 ? [`  ${flow.holes} call(s) on its route keylang did not resolve`] : []),
    ].join("\n");
  });
  const prompt = [`Layer: ${group.layer}`, `Discovered flows (${group.flows.length}):\n${flows.join("\n\n")}`].join("\n\n");
  const system = [
    "You group the discovered flows of one layer of a codebase into business processes, for a person new to the repository.",
    `Write names and descriptions in the language with code \`${options.lang}\`.`,
    'Answer with JSON only: {"processes":[{"name":"…","description":"…","domain":"…","inputs":["…"],"outputs":["…"],"flows":["…"]}]}.',
    "name: the business process in plain words, not a technical trigger. description: 2-4 sentences on what it does for the business.",
    `domain: one of ${DOMAINS.join(", ")}; another short domain only when none fits.`,
    "inputs and outputs: the business entities it takes and produces (Cart, Order, Payment…).",
    "flows: the names of the flows given that belong to the process, exactly as written; every flow in one process.",
    "Refer to code only by the IDs given, in backticks. Never invent a flow name or an ID.",
  ].join("\n");
  return { system, prompt, maxTokens: 4096 };
}

/** A rough size of the requests for `--dry-run`: about four characters a token, about 300 tokens out per process group. */
export function estimateNameTokens(requests: readonly LlmRequest[]): { input: number; output: number } {
  const chars = requests.reduce((sum, r) => sum + r.system.length + r.prompt.length, 0);
  return { input: Math.ceil(chars / 4), output: requests.length * 300 };
}

/** One process of an answer, checked: what is saved without the provenance. */
export type AnsweredProcess = Omit<BusinessProcess, "agent" | "date" | "closure" | "layer">;

/**
 * The model's answer for `group`, checked: flow names the group does not have
 * are dropped (`dropped`), a flow named twice stays with its first process,
 * a process left without flows is dropped; `unknownIds` are the IDs in
 * backticks it mentions that the snapshot does not have. Not JSON, or no
 * `processes` list: `error`.
 */
export function parseNamesAnswer(snapshot: AnalysisSnapshot, group: NameGroup, answer: string): { processes: AnsweredProcess[]; dropped: string[]; unknownIds: string[] } | { error: string } {
  const value = jsonOf(answer);
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.processes) ? value.processes : null;
  if (list === null) return { error: "the answer is not JSON with a `processes` list" };
  const names = new Set(group.flows.map((flow) => flow.name));
  const taken = new Set<string>();
  const dropped = new Set<string>();
  const processes: AnsweredProcess[] = [];
  const texts: string[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const name = oneLine(item.name);
    if (name === "") continue;
    const flows: string[] = [];
    for (const raw of Array.isArray(item.flows) ? item.flows : []) {
      const flow = typeof raw === "string" ? raw.trim() : "";
      if (!names.has(flow)) {
        if (flow !== "") dropped.add(flow);
        continue;
      }
      if (taken.has(flow)) continue;
      taken.add(flow);
      flows.push(flow);
    }
    const process: AnsweredProcess = {
      name: name.replace(/^#+\s*/, ""),
      description: oneLine(item.description),
      domain: oneLine(item.domain).replace(/^#+\s*/, "") || OTHER,
      inputs: entities(item.inputs),
      outputs: entities(item.outputs),
      flows,
    };
    texts.push(process.name, process.description, ...process.inputs, ...process.outputs);
    if (flows.length > 0) processes.push(process);
  }
  return { processes, dropped: [...dropped].sort(compareText), unknownIds: unknownIdsIn(snapshot, texts.join("\n")) };
}

/** `` `a.b.c` `` in `text` whose first segment is a layer of the snapshot and which the snapshot does not have. */
function unknownIdsIn(snapshot: AnalysisSnapshot, text: string): string[] {
  const layers = new Set(Object.keys(snapshot.nodes).map((id) => id.split(".")[0]!));
  const out = new Set<string>();
  for (const m of text.matchAll(/`([\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)+)`/gu)) {
    const id = m[1]!;
    if (layers.has(id.split(".")[0]!) && snapshot.nodes[id] === undefined) out.add(id);
  }
  return [...out].sort(compareText);
}

function jsonOf(answer: string): unknown {
  const text = answer.trim().replace(/^```[a-z]*\s*\n([\s\S]*)\n```$/i, "$1");
  const from = Math.min(...[text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0));
  const to = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (!Number.isFinite(from) || to < from) return undefined;
  try {
    return JSON.parse(text.slice(from, to + 1)) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string of the answer on one line, without a comment it could open. */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").replaceAll("<!--", "&lt;!--").trim() : "";
}

/** Entities as the README lists them: one line each, no `, ` inside (the list's separator). */
function entities(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => oneLine(item).replace(/,\s*/g, "; "))
    .filter((item) => item !== "" && item !== "—");
}

/** GitHub's anchor of a `# flow <name>` heading. */
export function flowAnchor(name: string): string {
  return `flow-${name}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

const PROVENANCE = /^<!-- keylang:llm model=(\S+) date=(\S+) closure=(\S*) layer=(\S+) -->$/;

/** Domains in the README's order: the known ones, then others by name, `Інше` last. */
function domainOrder(a: string, b: string): number {
  const rank = (d: string): number => (d === OTHER ? 2 : (DOMAINS as readonly string[]).includes(d) ? 0 : 1);
  return rank(a) - rank(b) || (DOMAINS as readonly string[]).indexOf(a) - (DOMAINS as readonly string[]).indexOf(b) || compareText(a, b);
}

/**
 * The README of the view: domain → process → flows, each process under its
 * provenance, with its description, entities and links to its flows in the
 * layer files. The same processes give the same bytes.
 */
export function renderProcesses(processes: readonly BusinessProcess[], fileOf: (flow: string) => string | null): string {
  const lines = [DISCOVER_MARK, "", "# Business processes", ""];
  const domains = [...new Set(processes.map((p) => p.domain))].sort(domainOrder);
  if (domains.length === 0) lines.push("No process yet: `keylang flows discover --names` asks a model to group the discovered flows.", "");
  for (const domain of domains) {
    lines.push(`## ${domain}`, "");
    const own = processes.filter((p) => p.domain === domain).sort((a, b) => compareText(a.name, b.name) || compareText(a.layer, b.layer));
    for (const p of own) {
      lines.push(`### ${p.name}`, "", `<!-- keylang:llm model=${p.agent} date=${p.date} closure=${p.closure} layer=${p.layer} -->`, "");
      if (p.description !== "") lines.push(proseLine(p.description), "");
      const links = p.flows.map((flow) => {
        const file = fileOf(flow);
        return file === null ? flow : `[${flow}](${file}#${flowAnchor(flow)})`;
      });
      lines.push(`- in: ${p.inputs.length > 0 ? p.inputs.join(", ") : "—"}`, `- out: ${p.outputs.length > 0 ? p.outputs.join(", ") : "—"}`, `- flows: ${links.join(", ")}`, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** The processes of a README `renderProcesses` wrote; a file without the generated marker has none. */
export function parseProcesses(text: string): BusinessProcess[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== DISCOVER_MARK) return [];
  const out: BusinessProcess[] = [];
  let domain = OTHER;
  let current: BusinessProcess | null = null;
  const list = (rest: string): string[] => (rest === "—" ? [] : rest.split(", ").filter((item) => item !== ""));
  for (const line of lines) {
    if (line.startsWith("## ")) {
      domain = line.slice(3).trim();
      current = null;
    } else if (line.startsWith("### ")) {
      current = { name: line.slice(4).trim(), description: "", domain, inputs: [], outputs: [], flows: [], layer: "", agent: "", date: "", closure: "" };
      out.push(current);
    } else if (current !== null) {
      const provenance = PROVENANCE.exec(line);
      if (provenance) {
        current.agent = provenance[1]!;
        current.date = provenance[2]!;
        current.closure = provenance[3]!;
        current.layer = provenance[4]!;
      } else if (line.startsWith("- in: ")) current.inputs = list(line.slice(6));
      else if (line.startsWith("- out: ")) current.outputs = list(line.slice(7));
      else if (line.startsWith("- flows: ")) current.flows = line.slice(9).split(", ").map((item) => /^\[([^\]]+)\]\(/.exec(item)?.[1] ?? item);
      else if (line.trim() !== "") current.description = current.description === "" ? unproseLine(line) : `${current.description} ${unproseLine(line)}`;
    }
  }
  return out.filter((p) => p.layer !== "");
}

/** The README's path relative to the root. */
export function processesPath(specDir: string): string {
  return specPath(specDir, `${DISCOVERED_DIR}/${PROCESSES_FILE}`);
}

/** The processes saved under `<dir>/flows-discovered/README.md` of `root`; none without the file. */
export function readProcesses(root: string, specDir: string): BusinessProcess[] {
  const file = join(root, processesPath(specDir));
  return existsSync(file) ? parseProcesses(readFileSync(file, "utf8")) : [];
}

/**
 * The saved processes as the diagram draws them: each flow found again in a
 * fresh discovery, with its trigger and the steps right under it; a flow no
 * longer discovered is left out, and a process left without flows too.
 */
export function processViews(snapshot: AnalysisSnapshot, spec: SpecIR, processes: readonly BusinessProcess[]): DiagramProcess[] {
  if (processes.length === 0) return [];
  const flows = new Map(discoverFlows(snapshot, specifiedTriggers(spec.flows)).flows.map((flow) => [flow.name, flow]));
  const out: DiagramProcess[] = [];
  for (const p of processes) {
    const found = p.flows.flatMap((name) => {
      const flow = flows.get(name);
      return flow ? [{ name, trigger: flow.trigger, steps: firstLevelSteps(flow.text).filter((id) => snapshot.nodes[id]?.layer !== EXTERNAL) }] : [];
    });
    if (found.length > 0) out.push({ name: p.name, domain: p.domain, flows: found });
  }
  return out;
}
