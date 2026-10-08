// `keylang flow export` and `keylang flow import` (business-flows/26): the
// portable bundle of business flows. Export reads a fresh snapshot, the
// hand-written flows and the discovered view and returns the bundle's text
// (written to `--out` only when that is a new file or a bundle). Import reads
// a bundle and this repository and writes two proposals through the
// proposals mechanism, as `flows adopt` does: the feature spec and the
// migration table. The model only proposes a layer map; a target layer it
// names that the repository lacks is left to the algorithm.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { redactUrl } from "../clone.ts";
import { toPosix } from "../config.ts";
import { errorText } from "../diag.ts";
import { discoverFlows, specifiedTriggers } from "../discover.ts";
import { readProcesses } from "../discover-names.ts";
import { withFlow } from "../draft.ts";
import { existingText } from "../files.ts";
import { algoLayers, BUNDLE_FORMAT, BUNDLE_MARK, bundleNodes, bundleText, flowEvents, flowTests, importPlan, layerMapRequest, MIGRATION_FILE, parseBundle, parseLayerMap, parseLayerMapAnswer, usedLayers, withMigration, type BundleHeader, type BundleReach, type ExportFlow, type LayerChoice, type TargetLayer } from "../flow-bundle.ts";
import { findIntegrations, loadIntegrations } from "../integrations.ts";
import { sourceInputs } from "../map.ts";
import { PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { writeAtomic, writeProblem } from "../safe-write.ts";
import { firstSentence } from "../brief.ts";
import { commitProposal, empty, generatedIn, modelSetup, proposalRefusal, rootRelative } from "./shared.ts";
import type { FlowExportPayload, FlowExportRequest, FlowImportPayload, FlowImportRequest, OperationContext, OperationEnvelope, OperationMessage } from "./types.ts";

/**
 * `flow export <name>…`. 0: the bundle (and `out` written); 2: a broken
 * keylang.json, no code, an unknown flow name, an `out` that is neither new
 * nor a bundle, or lies under the spec directory (it would be read as a
 * spec), an I/O error.
 */
export async function runFlowExport(request: FlowExportRequest, context: OperationContext): Promise<OperationEnvelope<"flow-export">> {
  const { root } = request;
  if (!isAbsolute(root)) return empty("flow-export", "failed", 2, "flow export: root must be an absolute path");
  if (request.names.length === 0) return empty("flow-export", "failed", 2, "flow export: at least one flow name is required");
  const withCallees = request.withCallees ?? 0;
  if (!Number.isInteger(withCallees) || withCallees < 0) return empty("flow-export", "failed", 2, `flow export: --with-callees must be a whole number, got \`${withCallees}\``);
  if (context.signal?.aborted) return empty("flow-export", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return empty("flow-export", "failed", 2, `flow export: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("flow-export", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (snapshot === null) return empty("flow-export", "failed", 2, "flow export: no code to read (`languages` in keylang.json is empty)");
  const specDir = rootRelative(root, analyzed.config.dir);
  if (request.out !== undefined) {
    const problem = outProblem(root, specDir, request.out);
    if (problem !== null) return empty("flow-export", "failed", 2, `flow export: --out ${request.out}: ${problem}; nothing written`);
  }
  const resolved = exportFlows(root, analyzed, request.names);
  if ("error" in resolved) return empty("flow-export", "failed", 2, `flow export: ${resolved.error}`);
  const { header, text, messages, summary } = await exportBundle(root, analyzed, resolved.flows, withCallees, request.version ?? "n/a");
  const payload: FlowExportPayload = { header, text, out: null };
  if (request.out === undefined) return { ...empty("flow-export", "completed", 0), payload, messages: [...messages, { level: "info", text: summary }] };
  try {
    const gate = await context.beforeCommit?.({ targets: [displayPath(root, request.out)] });
    if (context.signal?.aborted) return { ...empty("flow-export", "cancelled", null), payload };
    if (gate && gate.refused.length > 0) return { ...empty("flow-export", "failed", 1), payload, messages: gate.refused.map((t) => ({ level: "error" as const, text: t })) };
    writeAtomic(request.out, text);
  } catch (error) {
    return { ...empty("flow-export", "failed", 2, `flow export: ${errorText(error)}`), payload };
  }
  payload.out = displayPath(root, request.out);
  return { ...empty("flow-export", "completed", 0), payload, written: [payload.out], messages: [...messages, { level: "info", text: `${summary}; wrote ${payload.out}` }] };
}

/**
 * The flows of an export by name: a hand-written `# flow` section as written,
 * else the discovered view's flow, each with the business process it belongs
 * to; or which names are neither.
 */
export function exportFlows(root: string, analyzed: Analysis, names: readonly string[]): { flows: ExportFlow[] } | { error: string } {
  const snapshot = analyzed.snapshot;
  if (snapshot === null) return { error: "no code to read (`languages` in keylang.json is empty)" };
  const specDir = rootRelative(root, analyzed.config.dir);
  const generated = new Set(analyzed.docs.filter((doc) => doc.generated !== null).map((doc) => doc.path));
  const written = analyzed.spec.flows.filter((flow) => !generated.has(flow.file));
  const discovered = discoverFlows(snapshot, specifiedTriggers(analyzed.spec.flows)).flows;
  const processes = readProcesses(root, specDir);
  const flows: ExportFlow[] = [];
  const missing: string[] = [];
  for (const name of names) {
    if (flows.some((flow) => flow.name === name)) continue;
    const process = processes.find((p) => p.flows.includes(name));
    const business = process ? { name: process.name, domain: process.domain, description: process.description } : null;
    const spec = written.find((flow) => flow.name === name);
    if (spec !== undefined) {
      const text = sectionText(root, analyzed, spec.file, name);
      if (text !== null) {
        flows.push({ name, origin: "spec", source: spec.file, text, process: business });
        continue;
      }
    }
    const found = discovered.find((flow) => flow.name === name);
    if (found !== undefined) {
      flows.push({ name, origin: "discovered", source: `${specDir === "" ? "" : `${specDir}/`}flows-discovered/${found.file}`, text: found.text, process: business });
      continue;
    }
    missing.push(name);
  }
  if (missing.length > 0) {
    const known = [...new Set([...written.map((f) => f.name), ...discovered.map((f) => f.name)])].sort();
    return { error: `no flow ${missing.map((m) => `\`${m}\``).join(", ")}: neither a hand-written \`# flow\` nor a discovered one${known.length > 0 ? `; known: ${known.join(", ")}` : ""}` };
  }
  return { flows };
}

/**
 * The bundle of resolved flows: their nodes (and callees to `withCallees`),
 * tests, events and the integrations their nodes call, the layers, the
 * provenance; `layout` fills the ```keylang-layout``` block (business-flows/25).
 */
export async function exportBundle(root: string, analyzed: Analysis, flows: readonly ExportFlow[], withCallees: number, version: string, layout = ""): Promise<{ header: BundleHeader; text: string; messages: OperationMessage[]; summary: string }> {
  const snapshot = analyzed.snapshot!;
  const nodes = bundleNodes(snapshot, flows, withCallees);
  const tests = flows.flatMap((flow) => flowTests(flow.name, flow.text));
  const messages: OperationMessage[] = [];
  const reached: BundleReach[] = flows.flatMap((flow) => flowEvents(flow.name, flow.text));
  try {
    const report = await findIntegrations(analyzed.config, snapshot, loadIntegrations(), specifiedTriggers(analyzed.spec.flows));
    for (const flow of flows) {
      const own = new Set(nodes.filter((n) => n.flows.includes(flow.name)).map((n) => n.id));
      for (const integration of report.outgoing) {
        for (const site of integration.sites) if (site.in !== null && own.has(site.in)) reached.push({ flow: flow.name, kind: integration.kind, what: `${integration.label} (${site.callee}${site.host ? ` → ${site.host}` : ""})`, where: `${site.file}:${site.line}` });
      }
      for (const hook of report.webhooks) if (own.has(hook.id)) reached.push({ flow: flow.name, kind: "webhook", what: hook.label, where: `${hook.file}:${hook.line}` });
    }
  } catch (error) {
    messages.push({ level: "warning", text: `integrations not listed: ${errorText(error)}` });
  }
  const layers = [...analyzed.config.layers].map(([name, globs]) => {
    const doc = snapshot.nodes[name]?.doc ?? null;
    return { name, globs, description: doc === null ? "" : (firstSentence(doc) ?? doc) };
  });
  const git = gitOf(root);
  const header: BundleHeader = { format: BUNDLE_FORMAT, repo: git.repo, commit: git.commit, snapshotId: snapshot.snapshotId, keylang: version, flows: flows.map((f) => f.name), withCallees };
  const text = bundleText({ header, layers, nodes, tests, reached, flows, layout });
  const summary = `bundle of ${flows.length} flow(s): ${nodes.length} node(s), ${tests.length} test(s), ${reached.length} event(s) and integration(s)`;
  return { header, text, messages, summary };
}

/** Why the bundle may not be written to `out`: under the spec directory, an existing file that is no bundle, the write policy inside the repository. */
function outProblem(root: string, specDir: string, out: string): string | null {
  const rel = toPosix(relative(root, out));
  const inside = !rel.startsWith("..") && !isAbsolute(rel);
  if (inside && (specDir === "" || rel === specDir || rel.startsWith(`${specDir}/`))) return `a bundle under ${specDir === "" ? "the spec directory" : `${specDir}/`} would be read as a spec`;
  const before = existingText(out);
  if (before !== null && !before.split("\n", 1)[0]!.startsWith(`<!-- ${BUNDLE_MARK} `)) return "the file exists and is not a bundle `flow export` wrote";
  if (inside) return writeProblem(root, rel, {});
  return null;
}

function displayPath(root: string, abs: string): string {
  const rel = toPosix(relative(root, abs));
  return rel.startsWith("..") || isAbsolute(rel) ? toPosix(abs) : rel;
}

/** The `# flow <name>` section of a spec file as written, heading to the next heading; null when it is not there. */
function sectionText(root: string, analyzed: Analysis, file: string, name: string): string | null {
  const doc = analyzed.docs.find((d) => d.path === file);
  const source = existingText(join(root, file));
  if (doc === undefined || source === null) return null;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const headed = doc.sections.filter((s) => s.heading !== null);
  const at = headed.findIndex((s) => s.kind === "flow" && s.name?.value === name);
  if (at === -1) return null;
  const from = headed[at]!.heading!.span.start.line - 1;
  const to = headed[at + 1] ? headed[at + 1]!.heading!.span.start.line - 1 : lines.length;
  return `${lines.slice(from, to).join("\n").trimEnd()}\n`;
}

/** The repository as git names it (the `origin` URL without credentials, else the directory) and HEAD; `n/a` without git. */
export function gitOf(root: string): { repo: string; commit: string } {
  const run = (args: string[]): string | null => {
    try {
      const r = spawnSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
      return r.status === 0 ? r.stdout.trim() || null : null;
    } catch {
      return null;
    }
  };
  const origin = run(["remote", "get-url", "origin"]);
  return { repo: origin === null ? basename(root) : redactUrl(origin), commit: run(["rev-parse", "HEAD"]) ?? "n/a" };
}

/**
 * `flow import <bundle.md>`. 0: the proposals are written, or the preview;
 * 1: a proposal for a target is waiting (`pending: refuse`) or an input
 * changed meanwhile; 2: no bundle, a bad --layer-map, `--mode llm` without a
 * model, a target a proposal may not change, an I/O error.
 */
export async function runFlowImport(request: FlowImportRequest, context: OperationContext): Promise<OperationEnvelope<"flow-import">> {
  const { root } = request;
  if (!isAbsolute(root) || (request.source === undefined && !isAbsolute(request.bundle))) return empty("flow-import", "failed", 2, "flow import: root and bundle must be absolute paths");
  const mode = request.mode ?? "algo";
  if (context.signal?.aborted) return empty("flow-import", "cancelled", null);
  let source: string;
  try {
    // A paste of `keylang web` (business-flows/25) brings the text itself; `bundle` only names it.
    source = request.source ?? readFileSync(request.bundle, "utf8");
  } catch (error) {
    return empty("flow-import", "failed", 2, `flow import: ${errorText(error)}`);
  }
  const bundle = parseBundle(source);
  if ("error" in bundle) return empty("flow-import", "failed", 2, `flow import: ${bundle.error}`);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return empty("flow-import", "failed", 2, `flow import: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("flow-import", "cancelled", null);
  const config = analyzed.config;
  const snapshot = analyzed.snapshot;
  const target: TargetLayer[] = [...config.layers].map(([name, globs]) => {
    const doc = snapshot?.nodes[name]?.doc ?? null;
    return { name, globs, description: doc === null ? "" : (firstSentence(doc) ?? doc) };
  });
  if (target.length === 0) return empty("flow-import", "failed", 2, "flow import: no layers in keylang.json to place the flows in");
  const used = usedLayers(bundle);
  const taken = new Map<string, LayerChoice>();
  if (request.layerMap !== undefined) {
    const parsed = parseLayerMap(request.layerMap);
    if ("error" in parsed) return empty("flow-import", "failed", 2, `flow import: ${parsed.error}`);
    for (const [from, to] of parsed) {
      if (!bundle.layers.some((l) => l.name === from) && !used.includes(from)) return empty("flow-import", "failed", 2, `flow import: --layer-map: \`${from}\` is no layer of the bundle (${bundle.layers.map((l) => l.name).join(", ")})`);
      if (!target.some((t) => t.name === to)) return empty("flow-import", "failed", 2, `flow import: --layer-map: \`${to}\` is no layer of keylang.json here (${target.map((t) => t.name).join(", ")})`);
      taken.set(from, { from, to, by: "flag" });
    }
  }
  const notes: string[] = [];
  let agent: string | null = null;
  const rest = used.filter((layer) => !taken.has(layer));
  if (mode !== "algo" && rest.length > 0) {
    const setup = await modelSetup(mode, config, "flow import");
    if ("error" in setup) return empty("flow-import", "failed", 2, setup.error);
    if (setup.fallback !== null) notes.push(`no model: ${setup.fallback.replace("drafting from the snapshot only", "the algorithm maps the layers")}`);
    if (setup.client !== null) {
      agent = setup.client.agent;
      context.onProgress?.({ text: `asking ${agent} for a layer map` });
      try {
        const answer = await setup.client.complete(layerMapRequest(bundle, rest, target), context.signal ? { signal: context.signal } : {});
        const checked = parseLayerMapAnswer(answer, rest, target);
        for (const choice of checked.choices) taken.set(choice.from, choice);
        notes.push(...checked.notes);
      } catch (error) {
        if (context.signal?.aborted) return empty("flow-import", "cancelled", null);
        if (mode === "llm") return empty("flow-import", "failed", 2, `flow import --mode llm: ${errorText(error)}`);
        notes.push(`the model did not answer (${errorText(error)}): the algorithm maps the layers`);
      }
    }
  }
  const algo = algoLayers(used, target, taken);
  notes.push(...algo.notes);
  const choices = [...taken.values(), ...algo.choices].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const specDir = rootRelative(root, config.dir);
  const into = toPosix(request.into ?? `${specDir === "" ? "" : `${specDir}/`}features/${bundle.flows[0]!.name}.md`);
  const slug = basename(into).replace(/\.md$/, "");
  const migrationTarget = `${specDir === "" ? "" : `${specDir}/`}${MIGRATION_FILE}`;
  if (into === migrationTarget) return empty("flow-import", "failed", 2, `flow import: --into ${into} is the migration table`);
  const plannedElsewhere = new Set(analyzed.spec.planned.filter((p) => p.file !== into).map((p) => p.id));
  const plan = importPlan(bundle, choices, { layers: target, existing: new Set(Object.keys(snapshot?.nodes ?? {})), plannedElsewhere }, { name: slug, bundleFile: basename(request.bundle), mode });
  notes.push(...plan.notes);
  const featureBefore = existingText(join(root, into));
  const feature = plan.flows.reduce<string | null>((text, flow) => withFlow(text, flow), featureBefore) ?? "";
  const migrationBefore = existingText(join(root, migrationTarget));
  const migration = withMigration(migrationBefore, slug, plan.migration);
  const payload: FlowImportPayload = { header: bundle.header, target: into, migrationTarget, feature, migration, layers: choices, ids: plan.ids, agent, proposals: [], targetLayers: target.map((t) => ({ name: t.name, description: t.description })) };
  const messages: OperationMessage[] = [
    ...choices.map((c) => ({ level: "info" as const, text: `layer ${c.from} → ${c.to} (${c.by})` })),
    ...[...new Set(notes)].map((text) => ({ level: "warning" as const, text })),
  ];
  const planned = plan.ids.filter((x) => x.planned).length;
  const summary = `imported ${plan.flows.length} flow(s) from ${bundle.header.repo}@${bundle.header.commit}: ${plan.ids.length} id(s), ${planned} planned`;
  if ((request.output ?? "proposal") === "preview") return { ...empty("flow-import", "completed", 0), payload, messages: [...messages, { level: "info", text: summary }] };
  const generated = generatedIn(analyzed.docs);
  const candidates = [
    { target: into, text: feature, before: featureBefore },
    { target: migrationTarget, text: migration, before: migrationBefore },
  ].map((c) => {
    const problem = proposalProblem(root, specDir, c.target, generated);
    const pending = problem === null ? existingText(join(root, PROPOSALS_DIR, c.target)) : null;
    return { ...c, problem, pending };
  });
  for (const candidate of candidates) {
    const refusal = proposalRefusal(root, candidate, request.pending, "flow import");
    if (refusal !== null) return { ...empty("flow-import", "failed", refusal.exitCode, refusal.error), payload };
  }
  const inputs = sourceInputs(config, snapshot?.manifest.files ?? []);
  for (const candidate of candidates) {
    const committed = await commitProposal({ root, specDir, generated, target: candidate.target, text: candidate.text, expected: { target: candidate.before, proposal: candidate.pending }, config, inputs }, context);
    if ("cancelled" in committed) return { ...empty("flow-import", "cancelled", null), payload, proposals: payload.proposals };
    if ("refused" in committed) return { ...empty("flow-import", "failed", 1), payload, proposals: payload.proposals, messages: [...committed.refused.map((text) => ({ level: "error" as const, text })), { level: "info", text: payload.proposals.length === 0 ? "nothing was written" : `written before: ${payload.proposals.join(", ")}` }] };
    if ("failed" in committed) return { ...empty("flow-import", "failed", 2, committed.failed), payload, proposals: payload.proposals };
    payload.proposals.push(committed.proposal);
  }
  return {
    ...empty("flow-import", "completed", 0),
    payload,
    proposals: payload.proposals,
    messages: [...messages, { level: "info", text: `${summary}; proposed ${into} and ${migrationTarget} as ${payload.proposals.join(", ")}; merge them with \`m\` in \`keylang\`, or a person runs \`keylang proposals accept ${into}\` and \`keylang proposals accept ${migrationTarget}\`` }],
  };
}
