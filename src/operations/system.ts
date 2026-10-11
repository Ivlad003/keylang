// `keylang system list|show|discover|new` (system-design/09): the `# system`
// sections of a repository, one of them as a tree with the `system` verdicts
// of its relations, the system of the code as a section to adopt, and a new
// system's skeleton. Read-only except `new`, which writes one new file.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { loadConfig } from "../config.ts";
import { errorText } from "../diag.ts";
import { isSegment } from "../parser.ts";
import { safeWrite } from "../safe-write.ts";
import { codeSchemas } from "../schema-discover.ts";
import { adoptedName, discoverSystem, systemMarkdown } from "../system-discover.ts";
import type { SystemSpec } from "../system.ts";
import { empty, rootRelative } from "./shared.ts";
import type { OperationContext, OperationEnvelope, SystemPayload, SystemRequest } from "./types.ts";

const GLYPH: Record<string, string> = { ok: "✓", fail: "✗", unverified: "◌" };

function listing(systems: readonly SystemSpec[]): SystemPayload["systems"] {
  return systems.map((system) => ({
    name: system.name,
    file: system.file,
    line: system.line,
    components: system.components.length,
    tables: system.components.reduce((sum, component) => sum + component.tables.length, 0),
    sequences: system.sequences.map((seq) => seq.name),
  }));
}

/** A system as a tree: zones and their components, each with its code, relations and verdicts, tables; then sequences and notes. */
export function systemText(system: SystemSpec, verdicts: SystemPayload["verdicts"]): string {
  const lines: string[] = [`system ${system.name} — ${system.file}:${system.line}`];
  const byArea = new Map(verdicts.map((verdict) => [verdict.area, verdict]));
  const component = (indent: string, item: SystemSpec["components"][number]): void => {
    lines.push(`${indent}${item.kind} ${item.name}${item.tech ? ` (${item.tech})` : ""}${item.code.length > 0 ? ` — code ${item.code.join(", ")}` : ""}`);
    for (const relation of system.relations) {
      if (relation.from !== item.name) continue;
      const verdict = byArea.get(`${relation.from} ${relation.verb} ${relation.to}`);
      lines.push(`${indent}  ${verdict ? `${GLYPH[verdict.verdict] ?? "·"} ` : "· "}${relation.verb} ${relation.to}${relation.caption ? ` ${relation.caption}` : ""}${verdict ? ` — ${verdict.message.slice(verdict.area.length + 2)}` : ""}`);
    }
    if (item.scale) lines.push(`${indent}  scale ${item.scale}`);
    for (const table of item.tables) {
      const columns = table.columns.map((column) => `${column.name} ${column.type}${column.pk ? " pk" : ""}${column.fk ? ` → ${column.fk.table}.${column.fk.column}` : ""}`);
      lines.push(`${indent}  table ${table.name}: ${columns.join(", ")}`);
    }
  };
  const zone = (name: string | null, indent: string): void => {
    for (const item of system.components) if (item.zone === name) component(indent, item);
    for (const child of system.zones) {
      if (child.parent !== name) continue;
      lines.push(`${indent}zone ${child.name}${child.label ? ` (${child.label})` : ""}`);
      zone(child.name, `${indent}  `);
    }
  };
  zone(null, "  ");
  for (const sequence of system.sequences) {
    lines.push(`  sequence ${sequence.name}`);
    sequence.messages.forEach((message, i) => lines.push(`    ${i + 1}. ${message.from} ${message.async ? "⇢" : "→"} ${message.to}${message.text ? ` ${message.text}` : ""}`));
  }
  for (const note of system.notes) lines.push(`  ${note.kind === "question" ? "?" : note.kind} ${note.text}`);
  const counts = { ok: 0, unverified: 0, fail: 0 };
  for (const verdict of verdicts) if (verdict.verdict in counts) counts[verdict.verdict as keyof typeof counts]++;
  lines.push(`${counts.fail} fail, ${counts.unverified} unverified, ${counts.ok} ok`);
  return `${lines.join("\n")}\n`;
}

/** The skeleton of a new system; `interview` adds the sections an interview asks for. Every line checks without a finding. */
export function systemTemplate(name: string, interview: boolean): string {
  const notes = interview
    ? [
        "- requirement <what a user can do, one per line>",
        "- nfr <latency, availability, consistency, scale>",
        "- estimate <users, requests per second, storage per year>",
        "- tradeoff <the choice and what it costs>",
        "- ? <an open question>",
      ]
    : [];
  return [
    `# system ${name}`,
    "",
    interview ? "The problem in one paragraph: who uses the system and for what." : "What the system is for, in one paragraph.",
    "",
    ...notes,
    "- client web browser",
    "  - calls api HTTPS",
    "- zone private",
    "  - service api",
    "    - reads db",
    "    - writes db",
    "  - db db postgres",
    "    - table items",
    "      - id bigint pk",
    "- sequence main",
    "  - web → api GET /items",
    "  - api → db SELECT",
    "",
  ].join("\n");
}

export async function runSystem(request: SystemRequest, context: OperationContext): Promise<OperationEnvelope<"system">> {
  const fail = (text: string): OperationEnvelope<"system"> => empty("system", "failed", 2, `system ${request.action}: ${text}`);
  if (!isAbsolute(request.root)) return fail("root must be an absolute path");
  if (request.action === "new") {
    const name = request.name ?? "";
    if (!isSegment(name)) return fail(name === "" ? "needs a name: `keylang system new <name>`" : `\`${name}\` is not a system name: a letter or _ first, then letters, digits, _ or -`);
    let dir: string;
    try {
      dir = rootRelative(request.root, loadConfig(request.root).dir);
    } catch (error) {
      return fail(errorText(error));
    }
    const path = `${dir === "" ? "" : `${dir}/`}system/${name}.md`;
    if (existsSync(join(request.root, path))) return fail(`${path} exists; edit it, or pick another name`);
    const text = systemTemplate(name, request.interview === true);
    try {
      safeWrite(request.root, path, text);
    } catch (error) {
      return fail(errorText(error));
    }
    const payload: SystemPayload = { action: "new", systems: [], markdown: text, verdicts: [], text: `${path}: written\n` };
    return { ...empty("system", "completed", 0), payload, messages: [{ level: "info", text: `${path}: written` }], written: [path] };
  }
  if (context.signal?.aborted) return empty("system", "cancelled", null);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return fail(errorText(error));
  }
  if (context.signal?.aborted) return empty("system", "cancelled", null);
  const systems = listing(analyzed.systems);
  if (request.action === "list") {
    const text = systems.length === 0 ? "no `# system` in the specs; `keylang system new <name>` starts one, `keylang system discover` prints the system of the code\n" : systems.map((system) => `${system.name}\t${system.file}:${system.line}\t${system.components} component(s), ${system.tables} table(s), ${system.sequences.length} sequence(s)`).join("\n") + "\n";
    return { ...empty("system", "completed", 0), payload: { action: "list", systems, markdown: null, verdicts: [], text } };
  }
  if (request.action === "discover") {
    if (analyzed.snapshot === null) return fail("no code to read (`languages` in keylang.json is empty)");
    const name = request.name ?? adoptedName(analyzed.snapshot);
    if (!isSegment(name)) return fail(`\`${name}\` is not a system name; pass one: \`keylang system discover <name>\``);
    const schemas = await codeSchemas(analyzed);
    const markdown = systemMarkdown(discoverSystem(analyzed.snapshot, schemas.schemas), name) + schemas.problems.map((problem) => `\n<!-- not read: ${problem.replace(/--/g, "- -")} -->\n`).join("");
    return { ...empty("system", "completed", 0), payload: { action: "discover", systems, markdown, verdicts: [], text: markdown } };
  }
  const system = analyzed.systems.find((item) => item.name === request.name);
  if (!system) {
    const known = systems.map((item) => item.name).join(", ");
    return fail(request.name === undefined ? "needs a name: `keylang system show <name>`" : `no \`# system ${request.name}\`${known ? `; there are: ${known}` : ""}`);
  }
  const criterion = `system ${system.name}`;
  const verdicts = analyzed.verdicts.filter((verdict) => verdict.criterion === criterion).map((verdict) => ({ verdict: verdict.verdict, area: verdict.area, line: verdict.line, message: verdict.message }));
  const findings = analyzed.diagnostics.filter((diag) => diag.file === system.file && diag.severity === "error");
  const text = systemText(system, verdicts) + findings.map((diag) => `${diag.file}:${diag.span.start.line}:${diag.span.start.col}: ${diag.code} ${diag.message}\n`).join("");
  return { ...empty("system", "completed", findings.length > 0 ? 1 : 0), payload: { action: "show", systems, markdown: null, verdicts, text } };
}
