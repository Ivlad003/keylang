// `keylang doctor`: the environment report — languages, the agent and its
// credentials, the agent CLIs, saved explanations, voice — never a key value.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { CONFIG_FILE, loadConfig, type Config } from "../config.ts";
import { errorText } from "../diag.ts";
import { explainedIds, moveHint, oldExplanations } from "../explain-llm.ts";
import { cliVersion, probeAgentClis, resolveAgent } from "../agent-cli.ts";
import type { LlmClientOptions, LlmSetup } from "../llm.ts";
import type { VoiceEngine } from "../voice.ts";
import type { DoctorPayload, DoctorRequest, OperationContext, OperationEnvelope } from "./types.ts";
import { empty } from "./shared.ts";

export async function runDoctor(request: DoctorRequest, context: OperationContext): Promise<OperationEnvelope<"doctor">> {
  // The root is absolute by contract: otherwise path resolution would fall
  // back on the working directory, which the operation must never read.
  if (!isAbsolute(request.root)) {
    return empty("doctor", "failed", 2, "doctor: root must be an absolute path");
  }
  if (context.signal?.aborted) return empty("doctor", "cancelled", null);
  // A broken keylang.json is an error naming the file and field, not a
  // "nothing is configured" report; loadConfig already throws that way.
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return empty("doctor", "failed", 2, errorText(error));
  }
  // The heavy adapters load only for this operation, as they did in the CLI.
  const { llmClient } = await import("../llm.ts");
  const { localStatus, microphoneStatus } = await import("../voice-local.ts");
  const { localModel, modelsDir, voiceEngine } = await import("../voice.ts");
  if (context.signal?.aborted) return empty("doctor", "cancelled", null);
  const native = await localStatus();
  if (context.signal?.aborted) return empty("doctor", "cancelled", null);
  const microphone = await microphoneStatus();
  const [agent, agentClis] = await Promise.all([agentState(config, llmClient), probeAgentClis()]);
  if (context.signal?.aborted) return empty("doctor", "cancelled", null);
  const engine = engineState(config, native.status === "ok", voiceEngine);
  const old = oldExplanations(request.root);
  const payload: DoctorPayload = {
    languages: [...config.languages],
    configFile: existsSync(join(request.root, CONFIG_FILE)),
    guessed: config.guessed,
    agent,
    agentClis,
    explanations: {
      saved: explainedIds(config, "answers").length,
      briefs: explainedIds(config, "briefs").length,
      dir: config.dir,
      map: config.explain.map,
      old,
      moveHint: old > 0 ? moveHint(config, old) : null,
    },
    voice: {
      engine: config.voice.engine,
      ...engine,
      model: localModel(),
      modelsDir: modelsDir(),
      native,
      microphone,
    },
  };
  const report = doctorLines(payload);
  return { ...empty("doctor", "completed", 0), payload, messages: report.map((text) => ({ level: "info" as const, text })) };
}

/** The effective agent, its source and its credential or binary state, without the key value. */
async function agentState(config: Config, llmClient: (agent: string | null, options: LlmClientOptions) => LlmSetup): Promise<DoctorPayload["agent"]> {
  let resolved: ReturnType<typeof resolveAgent>;
  try {
    resolved = resolveAgent(config.agent, process.env, homedir());
  } catch (error) {
    return { configured: config.agent, source: null, state: "error", detail: errorText(error) };
  }
  const { agent: configured, source } = resolved;
  if (configured === null) return { configured: null, source: null, state: "missing", detail: "not configured (keylang.json `agent`, KEYLANG_AGENT or ~/.config/keylang/agents.json)" };
  try {
    const setup = llmClient(config.agent, { root: config.root });
    if ("missing" in setup) return { configured, source, state: "missing", detail: setup.missing };
    const bin = setup.client.bin;
    if (bin === undefined) return { configured, source, state: "ok", detail: "credentials found" };
    // Login is the CLI's own: keylang never runs a login or status command.
    const version = await cliVersion(bin);
    return { configured, source, state: "ok", detail: `${bin} (${version ?? "no version"}); login is checked on the first request` };
  } catch (error) {
    return { configured, source, state: "error", detail: errorText(error) };
  }
}

/** The engine the voice configuration resolves to now, without the key. */
function engineState(
  config: Config,
  nativeAvailable: boolean,
  voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine,
): { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } {
  try {
    const found = voiceEngine(config.voice, nativeAvailable);
    if ("missing" in found) return { resolved: null, missing: found.missing, error: null };
    return found.kind === "openrouter"
      ? { resolved: { kind: "openrouter", model: found.model }, missing: null, error: null }
      : { resolved: { kind: "local", modelFile: found.modelFile }, missing: null, error: null };
  } catch (error) {
    return { resolved: null, missing: null, error: errorText(error) };
  }
}

/** The report lines, exactly as the CLI prints them; the payload carries the data. */
function doctorLines(payload: DoctorPayload): string[] {
  const { agent, explanations, voice } = payload;
  const engine =
    voice.error ??
    (voice.resolved?.kind === "openrouter"
      ? `openrouter (${voice.resolved.model})`
      : voice.resolved?.kind === "local"
        ? `local (${voice.resolved.modelFile})`
        : voice.missing);
  const native =
    voice.native.status === "ok" ? "installed" : voice.native.status === "missing" ? "not installed (optional)" : `unavailable: ${voice.native.reason}`;
  const microphone =
    voice.microphone.status === "ok"
      ? "installed"
      : voice.microphone.status === "missing"
        ? "not installed (optional; keylang web uses the browser's microphone)"
        : `unavailable: ${voice.microphone.reason} (keylang web uses the browser's microphone)`;
  // Optional peer dependencies: npm installs them only when the user asks, next to keylang.
  const missing = [voice.native.status === "missing" ? "@fugood/whisper.node" : null, voice.microphone.status === "missing" ? "decibri" : null].filter((name) => name !== null).join(" ");
  const install = missing === "" ? [] : [`local voice: npm i -g ${missing} (beside a global keylang) or npm i -D ${missing} (in a project with keylang)`];
  return [
    `languages: ${payload.languages.join(", ") || "none found"}${payload.configFile ? "" : ` (guessed; no ${CONFIG_FILE})`}`,
    `agent: ${agent.configured === null ? agent.detail : `${agent.configured}${agent.source === null || agent.source === "keylang.json" ? "" : ` (from ${agent.source})`}: ${agent.detail}`}`,
    `agent CLIs: ${payload.agentClis.map((cli) => `${cli.name} ${cli.bin === null ? "—" : (cli.version ?? "?")}`).join(" · ")}`,
    `explanations: ${explanations.saved} saved, ${explanations.briefs} brief(s) in ${explanations.dir}/explain/; explained map ${explanations.map ? "on" : "off"} (keylang.json \`explain.map\`)${explanations.old > 0 ? `; ${explanations.moveHint}` : ""}`,
    `voice: engine ${voice.engine} → ${engine}`,
    `voice model: ${voice.model ?? `none in ${voice.modelsDir}`}`,
    `@fugood/whisper.node: ${native}`,
    `microphone (decibri): ${microphone}`,
    ...install,
  ];
}
