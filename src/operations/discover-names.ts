// `keylang flows discover --names` (business-flows/12): the model's part of
// the discovery. One request per layer group (`planNames`), at most `jobs`
// at a time; each answer is checked (`parseNamesAnswer`) and the processes of
// the groups that answered replace their saved ones, the others stay. The
// result is the README of the view; `runFlowsDiscover` writes it with the
// layer files, through the same gate. A dry run only counts and estimates.
// Without a model: `algo` and `hybrid` are offline only (a note), `llm` is 2.

import type { Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { estimateNameTokens, namesRequest, parseNamesAnswer, planNames, processBaseline, processesPath, readProcesses, renderProcesses, type BusinessProcess, type NameGroup } from "../discover-names.ts";
import type { Discovery } from "../discover.ts";
import { defaultBriefJobs } from "../explain-inventory.ts";
import { loadBriefs } from "../explanations.ts";
import { selectedAgent } from "../agent-cli.ts";
import type { FlowsDiscoverRequest, FlowsNamesPayload, OperationContext, OperationMessage } from "./types.ts";

export type NamesOutcome = { fail: string } | { cancelled: true } | { payload: FlowsNamesPayload; messages: OperationMessage[]; file: { path: string; text: string } | null; failed: boolean };

export async function nameProcesses(analyzed: Analysis, discovery: Discovery, specDir: string, names: NonNullable<FlowsDiscoverRequest["names"]>, layer: string | undefined, context: OperationContext): Promise<NamesOutcome> {
  for (const [flag, value] of [["--limit", names.limit], ["--jobs", names.jobs]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) return { fail: `${flag} must be a positive whole number, got \`${value}\`` };
  }
  const snapshot = analyzed.snapshot!;
  const config = analyzed.config;
  const saved = readProcesses(config.root, specDir);
  const plan = planNames(snapshot, discovery.flows, saved, { stale: names.stale, ...(layer !== undefined ? { layer } : {}), ...(names.limit !== undefined ? { limit: names.limit } : {}) });
  const briefs = loadBriefs(config);
  const lang = config.explain.lang;
  const requests = plan.groups.map((group) => ({ group, request: namesRequest(snapshot, group, { lang, briefs }) }));
  const payload: FlowsNamesPayload = {
    mode: names.mode,
    agent: null,
    requests: plan.groups.map((group) => ({ layer: group.layer, flows: group.flows.map((flow) => flow.name) })),
    estimate: estimateNameTokens(requests.map((r) => r.request)),
    stale: plan.stale.map((p) => ({ name: p.name, layer: p.layer })),
    failed: [],
    processes: saved,
    text: "",
  };
  const staleLines = plan.stale.map((p) => `stale: ${p.name} (${p.layer})`);
  const messages: OperationMessage[] = [];
  if (names.dryRun) {
    const flows = payload.requests.reduce((sum, r) => sum + r.flows.length, 0);
    payload.text = `${[...staleLines, `would ask ${requests.length} request(s) for ${flows} flow(s): ~${payload.estimate.input} input tokens, ~${payload.estimate.output} output tokens`, ...payload.requests.map((r) => `  ${r.layer}: ${r.flows.join(", ")}`)].join("\n")}\n`;
    return { payload, messages, file: null, failed: false };
  }
  messages.push(...staleLines.map((text) => ({ level: "info" as const, text })));
  if (names.mode === "algo") return { payload, messages: [...messages, { level: "info", text: "--mode algo: offline descriptions only, no model asked" }], file: null, failed: false };
  if (requests.length === 0) return { payload, messages: [...messages, { level: "info", text: names.stale ? "no stale process: nothing to ask" : "every flow has a fresh process: nothing to ask" }], file: null, failed: false };
  const { answeringAgent, llmClient, LlmCancelled } = await import("../llm.ts");
  let setup;
  try {
    setup = llmClient(config.agent, { root: config.root });
  } catch (error) {
    return { fail: errorText(error) };
  }
  if ("missing" in setup) {
    if (names.mode === "llm") return { fail: setup.missing };
    return { payload, messages: [...messages, { level: "info", text: `no model: offline descriptions only (${setup.missing})` }], file: null, failed: false };
  }
  const client = setup.client;
  payload.agent = client.agent;
  const jobs = names.jobs ?? defaultBriefJobs(selectedAgent(config.agent));
  const date = new Date().toISOString().slice(0, 10);
  const answered = new Map<string, BusinessProcess[]>();
  const queue = [...requests];
  let done = 0;
  context.onProgress?.({ text: `asking ${client.agent}: ${requests.length} process group(s), ${jobs} at a time` });
  const one = async (group: NameGroup, request: (typeof requests)[number]["request"]): Promise<void> => {
    let answer: string;
    let reported: string | null = null;
    try {
      answer = await client.complete(request, { ...(context.signal ? { signal: context.signal } : {}), onModel: (model) => (reported = model) });
    } catch (error) {
      if (error instanceof LlmCancelled) return;
      payload.failed.push({ layer: group.layer, reason: errorText(error) });
      return;
    }
    const checked = parseNamesAnswer(snapshot, group, answer);
    done++;
    context.onProgress?.({ text: `${done}/${requests.length} · ${group.layer}` });
    if ("error" in checked) {
      payload.failed.push({ layer: group.layer, reason: checked.error });
      return;
    }
    if (checked.dropped.length > 0) messages.push({ level: "warning", text: `dropped unknown flow name(s) in ${group.layer}: ${checked.dropped.join(", ")}` });
    if (checked.unknownIds.length > 0) messages.push({ level: "warning", text: `unknown ids: ${checked.unknownIds.join(", ")} (${group.layer})` });
    const byName = new Map(group.flows.map((flow) => [flow.name, flow]));
    const agent = answeringAgent(client, reported);
    answered.set(
      group.layer,
      checked.processes.map((p) => ({ ...p, layer: group.layer, agent, date, closure: processBaseline(snapshot, p.flows.map((name) => byName.get(name)!)) })),
    );
  };
  const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await one(next.group, next.request);
  });
  await Promise.all(workers);
  if (context.signal?.aborted) return { cancelled: true };
  payload.failed.sort((a, b) => (a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0));
  messages.push(...payload.failed.map((f) => ({ level: "error" as const, text: `${f.layer}: ${f.reason}` })));
  // The groups that answered replace their processes; the others keep what was saved.
  const processes = [...saved.filter((p) => !answered.has(p.layer)), ...[...answered.values()].flat()];
  payload.processes = processes;
  messages.push({ level: "info", text: `${answered.size} of ${requests.length} process group(s) named by ${client.agent}: ${processes.length} process(es) saved` });
  const files = new Map(discovery.flows.map((flow) => [flow.name, flow.file]));
  return { payload, messages, file: { path: processesPath(specDir), text: renderProcesses(processes, (flow) => files.get(flow) ?? null) }, failed: payload.failed.length > 0 };
}
