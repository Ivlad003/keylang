// `keylang flows discover --names` (business-flows/12): the model's part of
// the discovery. One request per layer group (`planNames`), at most `jobs`
// at a time; each answer is checked (`parseNamesAnswer`) and the processes of
// the groups that answered replace their saved ones, the others stay. The
// result is the README of the view; `runFlowsDiscover` writes it with the
// layer files, through the same gate. A dry run only counts and estimates.
// Without a model: `algo` and `hybrid` are offline only (a note), `llm` is 2.
//
// Place in the pipeline: a helper of the `flows discover` operation
// (`operations/discover.ts`) over the snapshot's discovered flows; the
// grouping, prompts and answer checking live in `src/discover-names.ts`.
// Entry point: `nameProcesses`. Key term: business process (a named group
// of discovered flows of one layer).

import type { Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { estimateNameTokens, namesRequest, parseNamesAnswer, planNames, processBaseline, processesPath, readProcesses, renderProcesses, type BusinessProcess, type NameGroup } from "../discover-names.ts";
import type { Discovery } from "../discover.ts";
import { defaultBriefJobs } from "../explain-inventory.ts";
import { loadBriefs } from "../explanations.ts";
import { selectedAgent } from "../agent-cli.ts";
import type { FlowsDiscoverRequest, FlowsNamesPayload, OperationContext, OperationMessage } from "./types.ts";
import type { LlmCallOptions } from "../llm.ts";

/** What naming yields: a failure (exit 2), a cancellation, or the payload, messages and the README text to write (null when nothing changes). */
export type NamesOutcome = { fail: string } | { cancelled: true } | { payload: FlowsNamesPayload; messages: OperationMessage[]; file: { path: string; text: string } | null; failed: boolean };

/** Names the business processes of the discovered flows with the model, layer group by layer group; see the file header for the modes. */
export async function nameProcesses(analyzed: Analysis, discovery: Discovery, specDir: string, names: NonNullable<FlowsDiscoverRequest["names"]>, layer: string | undefined, context: OperationContext): Promise<NamesOutcome> {
  // Validate the numeric flags before any work.
  for (const [flag, value] of [["--limit", names.limit], ["--jobs", names.jobs]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) return { fail: `${flag} must be a positive whole number, got \`${value}\`` };
  }

  // Plan which layer groups to ask (all, one layer, only stale ones, at most
  // `limit`) and build each group's request up front, so a dry run can
  // estimate tokens without asking.
  const snapshot = analyzed.snapshot!;
  const config = analyzed.config;
  const saved = readProcesses(config.root, specDir);
  const planOptions: Parameters<typeof planNames>[3] = { stale: names.stale };

  if (layer !== undefined) planOptions.layer = layer;

  if (names.limit !== undefined) planOptions.limit = names.limit;
  const plan = planNames(snapshot, discovery.flows, saved, planOptions);
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

  // From here on a model is needed: `algo` never asks, and an empty plan
  // has nothing to ask.
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

  // No model configured: `llm` fails, the other modes keep the offline text.
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

  // One request per group: a provider error or an invalid answer marks the
  // group failed (it keeps its saved processes); a valid answer replaces
  // them, each process stamped with the answering model, the date and the
  // baseline of its steps' code (a later change there makes it stale).
  const one = async (group: NameGroup, request: (typeof requests)[number]["request"]): Promise<void> => {
    let answer: string;
    let reported: string | null = null;

    try {
      const options: LlmCallOptions = {};

      if (context.signal) options.signal = context.signal;
      options.onModel = (model) => (reported = model);
      answer = await client.complete(request, options);
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

  // A small worker pool: `jobs` workers drain a shared queue, so at most
  // `jobs` requests are in flight at once.
  const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await one(next.group, next.request);
  });

  await Promise.all(workers);

  if (context.signal?.aborted) return { cancelled: true };
  // Failures sorted by layer so the report does not depend on which answer
  // arrived first.
  payload.failed.sort((a, b) => (a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0));
  messages.push(...payload.failed.map((f) => ({ level: "error" as const, text: `${f.layer}: ${f.reason}` })));
  // The groups that answered replace their processes; the others keep what was saved.
  const processes = [...saved.filter((p) => !answered.has(p.layer)), ...[...answered.values()].flat()];
  payload.processes = processes;
  messages.push({ level: "info", text: `${answered.size} of ${requests.length} process group(s) named by ${client.agent}: ${processes.length} process(es) saved` });
  const files = new Map(discovery.flows.map((flow) => [flow.name, flow.file]));

  return { payload, messages, file: { path: processesPath(specDir), text: renderProcesses(processes, (flow) => files.get(flow) ?? null) }, failed: payload.failed.length > 0 };
}
