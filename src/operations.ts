// Shared workspace operations (ADR 0008): transport-independent orchestration
// of the application-level actions. The CLI and the TUI call the same
// interface: a typed request with an explicit absolute root, a typed result
// with a domain payload. This module never imports a transport, reads the
// working directory, or writes stdout/stderr. One operation variant at a
// time: each feature ticket adds its own, not every handler in advance.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { CONFIG_FILE, loadConfig, type Config } from "./config.ts";
import { explainedIds, moveHint, oldExplanations } from "./explain-llm.ts";
import type { LlmSetup } from "./llm.ts";
import type { ModuleStatus } from "./voice-local.ts";
import type { VoiceEngine } from "./voice.ts";

/** The known operations. `doctor` is the first; new kinds arrive with their feature. */
export interface DoctorRequest {
  kind: "doctor";
  /** Repository root (absolute): where keylang.json and the specs live. */
  root: string;
}

export type OperationRequest = DoctorRequest;

/** What an operation may use besides its request. No UI state, no shell. */
export interface OperationContext {
  /** Cancellation: the caller reports `cancelled`, never a success. */
  signal?: AbortSignal;
  /** Progress notes. Presentation only; never a source of domain data. */
  onProgress?: (progress: { text: string }) => void;
}

export type OperationStatus = "completed" | "failed" | "cancelled";

export interface OperationMessage {
  level: "info" | "warning" | "error";
  /** Human-readable text; the payload carries the domain data. */
  text: string;
}

/** The structured doctor report. Key values never reach it. */
export interface DoctorPayload {
  /** Languages keylang indexes, in map order; empty when none were found. */
  languages: string[];
  /** True when the report was built without a keylang.json at the root. */
  configFile: boolean;
  /** True when the file exists but declares no `layers` (a guessed layout). */
  guessed: boolean;
  /** The configured agent and the state of its credentials, never the key value. */
  agent: { configured: string | null; state: "ok" | "missing" | "error"; detail: string };
  explanations: {
    /** Saved answers and briefs, and how the explained map is configured. */
    saved: number;
    briefs: number;
    /** The spec directory, relative to the root. */
    dir: string;
    /** `explain.map` in keylang.json. */
    map: boolean;
    /** Explanation files of the keylang 0.1 store, no longer read. */
    old: number;
    /** How to move them, when there are any. */
    moveHint: string | null;
  };
  voice: {
    /** The configured engine. */
    engine: "local" | "openrouter" | "auto";
    /** What the configuration resolves to now, without the key; null when nothing does. */
    resolved: { kind: "openrouter"; model: string } | { kind: "local"; modelFile: string } | null;
    /** What to install or set so an engine resolves, or null. */
    missing: string | null;
    /** An error reading the voice set-up (a key file others can read), or null. */
    error: string | null;
    /** The first downloaded local model, or null. */
    model: string | null;
    /** Where local models live (for the "none in …" report). */
    modelsDir: string;
    /** The optional native recognizer (@fugood/whisper.node). */
    native: ModuleStatus;
    /** The optional native microphone (decibri). */
    microphone: ModuleStatus;
  };
}

/** The result of one operation. File paths are POSIX, relative to the request's root. */
export interface OperationResult {
  kind: OperationRequest["kind"];
  status: OperationStatus;
  /**
   * The exit code the CLI uses for the same action: 0 ok, 1 findings,
   * 2 usage or I/O error; null when cancelled. It never ends a TUI session.
   */
  exitCode: 0 | 1 | 2 | null;
  /** The domain result; null when nothing was computed (failed or cancelled). */
  payload: DoctorPayload | null;
  /** The human-readable report; presentation, not the source of domain data. */
  messages: OperationMessage[];
  /** Files the operation wrote. */
  written: string[];
  /** Files the operation removed. */
  removed: string[];
  /** Proposal files the operation created. */
  proposals: string[];
}

/** Runs one operation and returns its typed result. */
export async function runOperation(request: OperationRequest, context: OperationContext = {}): Promise<OperationResult> {
  switch (request.kind) {
    case "doctor":
      return runDoctor(request, context);
  }
}

function emptyDoctor(status: OperationStatus, exitCode: 0 | 1 | 2 | null): OperationResult {
  return { kind: "doctor", status, exitCode, payload: null, messages: [], written: [], removed: [], proposals: [] };
}

async function runDoctor(request: DoctorRequest, context: OperationContext): Promise<OperationResult> {
  // The root is absolute by contract: otherwise path resolution would fall
  // back on the working directory, which the operation must never read.
  if (!isAbsolute(request.root)) {
    return { ...emptyDoctor("failed", 2), messages: [{ level: "error", text: "doctor: root must be an absolute path" }] };
  }
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  // A broken keylang.json is an error naming the file and field, not a
  // "nothing is configured" report; loadConfig already throws that way.
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return { ...emptyDoctor("failed", 2), messages: [{ level: "error", text: messageOf(error) }] };
  }
  // The heavy adapters load only for this operation, as they did in the CLI.
  const { llmClient } = await import("./llm.ts");
  const { localStatus, microphoneStatus } = await import("./voice-local.ts");
  const { localModel, modelsDir, voiceEngine } = await import("./voice.ts");
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  const native = await localStatus();
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  const microphone = await microphoneStatus();
  const agent = agentState(config, llmClient);
  const engine = engineState(config, native.status === "ok", voiceEngine);
  const old = oldExplanations(request.root);
  const payload: DoctorPayload = {
    languages: [...config.languages],
    configFile: existsSync(join(request.root, CONFIG_FILE)),
    guessed: config.guessed,
    agent,
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
  return { ...emptyDoctor("completed", 0), payload, messages: report.map((text) => ({ level: "info" as const, text })) };
}

/** The configured agent and its credential state, without the key value. */
function agentState(config: Config, llmClient: (agent: string | null) => LlmSetup): DoctorPayload["agent"] {
  if (config.agent === null) return { configured: null, state: "missing", detail: "not configured (keylang.json `agent`)" };
  try {
    const setup = llmClient(config.agent);
    if ("missing" in setup) return { configured: config.agent, state: "missing", detail: setup.missing };
    return { configured: config.agent, state: "ok", detail: "credentials found" };
  } catch (error) {
    return { configured: config.agent, state: "error", detail: messageOf(error) };
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
    return { resolved: null, missing: null, error: messageOf(error) };
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
  return [
    `languages: ${payload.languages.join(", ") || "none found"}${payload.configFile ? "" : ` (guessed; no ${CONFIG_FILE})`}`,
    `agent: ${agent.configured === null ? agent.detail : `${agent.configured}: ${agent.detail}`}`,
    `explanations: ${explanations.saved} saved, ${explanations.briefs} brief(s) in ${explanations.dir}/explain/; explained map ${explanations.map ? "on" : "off"} (keylang.json \`explain.map\`)${explanations.old > 0 ? `; ${explanations.moveHint}` : ""}`,
    `voice: engine ${voice.engine} → ${engine}`,
    `voice model: ${voice.model ?? `none in ${voice.modelsDir}`}`,
    `@fugood/whisper.node: ${native}`,
    `microphone (decibri): ${microphone}`,
  ];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
