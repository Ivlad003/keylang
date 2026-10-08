// `keylang flows discover` and `keylang flows adopt` (business-flows/11), the
// MCP tool `discover_flows` and the TUI's «Discover flows». Discover writes
// the generated view `<dir>/flows-discovered/<layer>.md` the way `map` writes
// the map: only files that changed, only over files with the generated
// marker, removing generated files no entry needs. Adopt writes one proposal
// through the proposals mechanism, as `draft flow` does.

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { adoptedFlow, discoverFlows, discoverySummary, DISCOVERED_DIR, specifiedTriggers, type Discovery, type DiscoverOptions } from "../discover.ts";
import { PROCESSES_FILE } from "../discover-names.ts";
import { sourceInputs } from "../map.ts";
import { nameProcesses } from "./discover-names.ts";
import { isGeneratedText, landing, writeAtomic, writeProblem } from "../safe-write.ts";
import { flowCandidate } from "./draft.ts";
import { commitProposal, empty, generatedIn, proposalRefusal, rootRelative } from "./shared.ts";
import type { FlowsAdoptPayload, FlowsAdoptRequest, FlowsDiscoverPayload, FlowsDiscoverRequest, OperationContext, OperationEnvelope, OperationMessage } from "./types.ts";

/** The analysis both operations start from: the saved code and the hand-written specs; nothing persisted but the fact cache. */
async function discoveryOf(root: string, options: DiscoverOptions, context: OperationContext): Promise<{ analyzed: Analysis; discovery: Discovery; specDir: string } | { error: string }> {
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return { error: errorText(error) };
  }
  const snapshot = analyzed.snapshot;
  if (snapshot === null) return { error: "no code to read (`languages` in keylang.json is empty)" };
  const specDir = rootRelative(root, analyzed.config.dir);
  return { analyzed, discovery: discoverFlows(snapshot, specifiedTriggers(analyzed.spec.flows), options), specDir };
}

/**
 * `flows discover`. 0: written, current (`check`) or printed; 1: `check`
 * found the view stale, or a file where the view goes has no generated
 * marker (nothing written); 2: a broken keylang.json, no code, an I/O error.
 */
export async function runFlowsDiscover(request: FlowsDiscoverRequest, context: OperationContext): Promise<OperationEnvelope<"flows-discover">> {
  const { root } = request;
  if (!isAbsolute(root)) return empty("flows-discover", "failed", 2, "flows discover: root must be an absolute path");
  if (context.signal?.aborted) return empty("flows-discover", "cancelled", null);
  if (request.names !== undefined && request.output !== "write") return empty("flows-discover", "failed", 2, "flows discover: --names writes the view; it takes no --print or --check (--dry-run writes nothing)");
  if (request.names !== undefined && request.only !== undefined) return empty("flows-discover", "failed", 2, "flows discover: --names groups the flows of whole layers; it takes no --kind");
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  // With --names the view is whole: `layer` and `limit` narrow the requests, not the flows.
  const options: DiscoverOptions = {
    ...(request.only !== undefined ? { kind: request.only } : {}),
    ...(request.layer !== undefined && request.names === undefined ? { layer: request.layer } : {}),
    ...(request.limit !== undefined && request.names === undefined ? { limit: request.limit } : {}),
    ...(request.depth !== undefined ? { depth: request.depth } : {}),
  };
  const found = await discoveryOf(root, options, context);
  if (context.signal?.aborted) return empty("flows-discover", "cancelled", null);
  if ("error" in found) return empty("flows-discover", "failed", 2, `flows discover: ${found.error}`);
  const { analyzed, discovery, specDir } = found;
  const dir = `${specDir === "" ? "" : `${specDir}/`}${DISCOVERED_DIR}`;
  const files = [...discovery.files].map(([name, text]) => ({ path: `${dir}/${name}`, text }));
  const named = request.names === undefined ? null : await nameProcesses(analyzed, discovery, specDir, request.names, request.layer, context);
  if (named !== null && "fail" in named) return empty("flows-discover", "failed", 2, `flows discover --names: ${named.fail}`);
  if (named !== null && "cancelled" in named) return empty("flows-discover", "cancelled", null);
  if (named?.file) files.push(named.file);
  // A filtered run is a partial view: it removes nothing.
  const filtered = Object.keys(options).some((key) => key !== "depth");
  const extra = filtered ? [] : extraGenerated(join(root, dir), discovery.files).map((name) => `${dir}/${name}`);
  const changed = files.filter((file) => readOrNull(join(root, file.path)) !== file.text);
  const conflicts = changed.filter((file) => existsSync(join(root, file.path)) && !isGeneratedText(readFileSync(join(root, file.path), "utf8"))).map((file) => file.path);
  const stale = [...changed.map((file) => file.path), ...extra];
  const summary = discoverySummary(discovery);
  const payload: FlowsDiscoverPayload = { snapshotId: analyzed.snapshot!.snapshotId, output: request.output, dir, flows: discovery.flows, specified: discovery.specified, notFns: discovery.notFns, files, stale, conflicts, summary, ...(named !== null ? { names: named.payload } : {}) };
  const notes: OperationMessage[] = [
    ...discovery.specified.map((s) => ({ level: "info" as const, text: `already specified: ${s.trigger} (${s.file}, flow ${s.flow})` })),
    ...discovery.notFns.map((entry) => ({ level: "info" as const, text: `no fn to draft from: ${entry.kind} ${entry.label} (${entry.id})` })),
    ...(named?.messages ?? []),
  ];
  const done = (exitCode: 0 | 1, messages: OperationMessage[], written: string[] = [], removed: string[] = []): OperationEnvelope<"flows-discover"> => ({
    ...empty("flows-discover", "completed", exitCode),
    payload,
    messages: [...notes, ...messages, { level: "info", text: summary }],
    written,
    removed,
  });
  if (request.output === "print" || request.names?.dryRun === true) return done(0, []);
  if (request.output === "check") {
    if (stale.length === 0) return done(0, [{ level: "info", text: `${dir}/ is current` }]);
    return done(1, [...stale.map((path) => ({ level: "error" as const, text: `${path}: stale; run \`keylang flows discover\`` }))]);
  }
  if (conflicts.length > 0) return done(1, [...conflicts.map((path) => ({ level: "error" as const, text: `${path}: manual file without keylang:generated marker` })), { level: "info", text: "nothing was written" }]);
  const targets = [...changed.map((file) => file.path), ...extra];
  if (targets.length > 0) {
    context.onProgress?.({ text: "waiting to write" });
    try {
      const gate = await context.beforeCommit?.({ targets });
      if (context.signal?.aborted) return { ...empty("flows-discover", "cancelled", null), payload };
      if (gate && gate.refused.length > 0) return done(1, gate.refused.map((text) => ({ level: "error" as const, text })));
    } catch (error) {
      return { ...empty("flows-discover", "failed", 2, errorText(error)), payload };
    }
  }
  const problems = [
    ...changed.map((file) => [file.path, writeProblem(root, file.path, { under: dir, generated: true, expect: readOrNull(join(root, file.path)) })] as const),
    ...extra.map((path) => [path, writeProblem(root, path, { under: dir, generated: true })] as const),
  ].filter(([, problem]) => problem !== null);
  if (problems.length > 0) return { ...empty("flows-discover", "failed", 2), payload, messages: problems.map(([path, problem]) => ({ level: "error", text: `${path}: ${problem}` })) };
  const written: string[] = [];
  const removed: string[] = [];
  try {
    for (const file of changed) {
      const abs = join(root, file.path);
      writeAtomic(landing(abs) ?? abs, file.text, { exact: true });
      written.push(file.path);
    }
    for (const path of extra) {
      rmSync(join(root, path));
      removed.push(path);
    }
  } catch (error) {
    return { ...empty("flows-discover", "failed", 2, errorText(error)), payload, written, removed };
  }
  const lines: OperationMessage[] = [...written.map((path) => ({ level: "info" as const, text: `wrote ${path}` })), ...removed.map((path) => ({ level: "info" as const, text: `removed ${path}` }))];
  // A layer group whose request failed keeps its saved processes; the run says so with 1.
  return done(named?.failed === true ? 1 : 0, lines, written, removed);
}

/**
 * `flows adopt <name> [--into <spec.md>]`. 0: the proposal is written; 1: a
 * proposal for the target is waiting (`pending: refuse`) or the inputs
 * changed meanwhile; 2: no discovered flow of that name, a flow already
 * specified by hand, a target a proposal may not change, an I/O error.
 */
export async function runFlowsAdopt(request: FlowsAdoptRequest, context: OperationContext): Promise<OperationEnvelope<"flows-adopt">> {
  const { root, name } = request;
  if (!isAbsolute(root)) return empty("flows-adopt", "failed", 2, "flows adopt: root must be an absolute path");
  if (name === "") return empty("flows-adopt", "failed", 2, "flows adopt: a discovered flow's name is required");
  if (context.signal?.aborted) return empty("flows-adopt", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  const found = await discoveryOf(root, request.depth !== undefined ? { depth: request.depth } : {}, context);
  if (context.signal?.aborted) return empty("flows-adopt", "cancelled", null);
  if ("error" in found) return empty("flows-adopt", "failed", 2, `flows adopt: ${found.error}`);
  const { analyzed, discovery, specDir } = found;
  const flow = discovery.flows.find((f) => f.name === name);
  if (flow === undefined) {
    const written = discovery.specified.find((s) => s.flow === name || s.trigger === name || s.trigger.endsWith(`.${name}`));
    if (written !== undefined) return empty("flows-adopt", "failed", 2, `flows adopt: \`${name}\` is already specified in ${written.file} (flow ${written.flow})`);
    const names = discovery.flows.map((f) => f.name);
    return empty("flows-adopt", "failed", 2, `flows adopt: no discovered flow \`${name}\`${names.length > 0 ? `; discovered: ${names.join(", ")}` : ""}`);
  }
  const draft = adoptedFlow(flow, specDir);
  const generated = generatedIn(analyzed.docs);
  const inputs = sourceInputs(analyzed.config, analyzed.snapshot!.manifest.files);
  let candidate;
  try {
    candidate = flowCandidate(root, specDir, generated, draft, request.into);
  } catch (error) {
    return empty("flows-adopt", "failed", 2, errorText(error));
  }
  const payload: FlowsAdoptPayload = { flow, candidate, proposal: null };
  const refusal = proposalRefusal(root, candidate, request.pending, "flows adopt");
  if (refusal !== null) return { ...empty("flows-adopt", "failed", refusal.exitCode, refusal.error), payload };
  const committed = await commitProposal({ root, specDir, generated, target: candidate.target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...empty("flows-adopt", "cancelled", null), payload };
  if ("refused" in committed) return { ...empty("flows-adopt", "failed", 1), payload, messages: [...committed.refused.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written" }] };
  if ("failed" in committed) return { ...empty("flows-adopt", "failed", 2, committed.failed), payload };
  payload.proposal = committed.proposal;
  return {
    ...empty("flows-adopt", "completed", 0),
    payload,
    proposals: [committed.proposal],
    messages: [{ level: "info", text: `proposed flow \`${flow.name}\` (${flow.entry.kind} ${flow.entry.label}) for ${candidate.target} as ${committed.proposal}; merge it with \`m\` in \`keylang\`, or a person runs \`keylang proposals accept ${candidate.target}\`` }],
  };
}

/** Generated `.md` files in `dir` the view no longer has: never the README of the processes, which only `--names` writes. Sorted. */
function extraGenerated(dir: string, files: ReadonlyMap<string, string>): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== PROCESSES_FILE && !files.has(name) && isGeneratedText(readOrNull(join(dir, name)) ?? ""))
    .sort();
}

function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}
