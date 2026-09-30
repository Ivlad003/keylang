// One text completion from the configured model (`keylang.json` `agent`):
// `anthropic:<model>` through the official SDK, `openrouter:<model>` through
// its chat completions endpoint with SSE. Keys come from the environment or
// `~/.config/keylang/<provider>.key` (mode 0600). Base URLs can be moved
// (`ANTHROPIC_BASE_URL`, `OPENROUTER_BASE_URL`), which is how tests run
// against a local server without the network. A request that takes longer
// than `KEYLANG_LLM_TIMEOUT_MS` (default 10 minutes, the SDK's own default) is
// aborted, and an answer without text is an error, never an empty
// explanation. A caller's signal cancels a request too: that is
// `LlmCancelled`, never a timeout, and the text streamed so far is dropped.
// Nothing here decides a verdict.

import Anthropic from "@anthropic-ai/sdk";
import { createParser } from "eventsource-parser";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readKey } from "./keys.ts";

export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

/** Per call: `signal` cancels the request (and its stream); without options a call ends by its answer or the timeout. */
export interface LlmCallOptions {
  signal?: AbortSignal;
}

export interface LlmClient {
  /** `anthropic:claude-opus-5`, as configured. */
  agent: string;
  model: string;
  complete(request: LlmRequest, options?: LlmCallOptions): Promise<string>;
}

/** The caller cancelled the request: not a timeout, not a provider error, and no partial answer. */
export class LlmCancelled extends Error {
  constructor(provider: string) {
    super(`${provider}: cancelled`);
    this.name = "LlmCancelled";
  }
}

export type LlmSetup = { client: LlmClient } | { missing: string };

type Env = Readonly<Record<string, string | undefined>>;

/** Models whose declines the Claude API can re-run on another model inside the same request. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|mythos-5)/;

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function llmClient(agent: string | null, env: Env = process.env, home: string = homedir()): LlmSetup {
  if (agent === null) return { missing: "no model configured: set `agent` in keylang.json, e.g. \"anthropic:claude-opus-5\" or \"openrouter:<model>\"" };
  const timeout = timeoutMs(env);
  if (typeof timeout === "string") return { missing: timeout };
  const colon = agent.indexOf(":");
  const provider = agent.slice(0, colon);
  const model = agent.slice(colon + 1);
  // An empty variable is no key: it would only fail later, as a 401.
  const fromEnv = (name: string): string | undefined => (env[name] === "" ? undefined : env[name]);
  if (provider === "anthropic") {
    const key = fromEnv("ANTHROPIC_API_KEY") ?? readKey(home, "anthropic");
    // The SDK also reads `ANTHROPIC_AUTH_TOKEN` and an `ant auth login` profile.
    const profile = fromEnv("ANTHROPIC_AUTH_TOKEN") !== undefined || existsSync(join(home, ".config/anthropic"));
    if (key === undefined && !profile) return { missing: "no Anthropic credentials: set ANTHROPIC_API_KEY, write ~/.config/keylang/anthropic.key (mode 0600), or run `ant auth login`" };
    const client = new Anthropic({ timeout, ...(key !== undefined ? { apiKey: key } : {}), ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
    return { client: { agent, model, complete: (request, options) => anthropicComplete(client, model, request, timeout, options?.signal) } };
  }
  if (provider === "openrouter") {
    const key = fromEnv("OPENROUTER_API_KEY") ?? readKey(home, "openrouter");
    if (key === undefined) return { missing: "no OpenRouter key: set OPENROUTER_API_KEY or write ~/.config/keylang/openrouter.key (mode 0600)" };
    const base = env.OPENROUTER_BASE_URL ?? "https://openrouter.ai";
    return { client: { agent, model, complete: (request, options) => openrouterComplete(base, key, model, request, timeout, options?.signal) } };
  }
  return { missing: `unknown provider \`${provider}\` in agent \`${agent}\`` };
}

/** `KEYLANG_LLM_TIMEOUT_MS`, a positive whole number of milliseconds; the reason when it is not one. */
function timeoutMs(env: Env): number | string {
  const raw = env.KEYLANG_LLM_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : `KEYLANG_LLM_TIMEOUT_MS must be a positive number of milliseconds, got \`${raw}\``;
}

/**
 * One signal for a whole call: aborted by the deadline or by the caller's
 * signal, whichever comes first; `dispose` clears the timer and the listener
 * on the caller's signal, so a long-lived signal does not collect them.
 */
function callSignal(timeout: number, outer: AbortSignal | undefined): { signal: AbortSignal; timedOut: () => boolean; cancelled: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  // What aborted the call first: a cancel after the deadline is still a timeout, and the other way round.
  let cause: "timeout" | "cancel" | null = null;
  const stop = (why: "timeout" | "cancel"): void => {
    cause ??= why;
    controller.abort();
  };
  const timer = setTimeout(() => stop("timeout"), timeout);
  timer.unref();
  const onAbort = (): void => stop("cancel");
  if (outer?.aborted) stop("cancel");
  else outer?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => cause === "timeout",
    cancelled: () => cause === "cancel",
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}

async function anthropicComplete(client: Anthropic, model: string, request: LlmRequest, timeout: number, outer?: AbortSignal): Promise<string> {
  const fallbacks = FALLBACK_MODELS.test(model);
  // The client's `timeout` bounds one attempt and the SDK retries; the signal bounds the whole call.
  const call = callSignal(timeout, outer);
  const signal = call.signal;
  let response: Awaited<ReturnType<typeof client.beta.messages.create>>;
  try {
    response = await client.beta.messages.create(
      {
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        // A declined request is re-run server-side on a model chosen for the refusal category.
        ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
  } catch (error) {
    if (call.cancelled()) throw new LlmCancelled("anthropic");
    if (call.timedOut()) throw new Error(`anthropic: no answer within ${timeout} ms (KEYLANG_LLM_TIMEOUT_MS)`);
    throw error;
  } finally {
    call.dispose();
  }
  if (response.stop_reason === "refusal") throw new Error(`${model} declined the request${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`);
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (text === "") throw new Error(`${model} answered without text (stop reason: ${response.stop_reason ?? "none"})`);
  return text;
}

async function openrouterComplete(base: string, key: string, model: string, request: LlmRequest, timeout: number, outer?: AbortSignal): Promise<string> {
  // One deadline for the request and the whole stream: a stalled stream never hangs the CLI or the TUI.
  const call = callSignal(timeout, outer);
  const signal = call.signal;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: request.maxTokens,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`openrouter: HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    // An error can come back as plain JSON with status 200 instead of a stream.
    if (!/text\/event-stream/.test(response.headers.get("content-type") ?? "")) {
      const body = await response.text();
      const parsed = parseJson(body) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] } | undefined;
      if (parsed?.error) throw new Error(`openrouter: ${parsed.error.message ?? "error without a message"}`);
      const text = parsed?.choices?.[0]?.message?.content?.trim() ?? "";
      if (text === "") throw new Error(`openrouter: ${model} answered without text: ${body.slice(0, 200)}`);
      return text;
    }
    let text = "";
    let failure: string | null = null;
    const parser = createParser({
      onEvent(event) {
        if (event.data === "[DONE]" || failure !== null) return;
        const chunk = parseJson(event.data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } } | undefined;
        if (chunk === undefined) {
          failure = `invalid JSON in the stream: ${event.data.slice(0, 100)}`;
          return;
        }
        if (chunk.error) failure = chunk.error.message ?? "stream error";
        text += chunk.choices?.[0]?.delta?.content ?? "";
      },
    });
    const decoder = new TextDecoder();
    for await (const bytes of response.body) parser.feed(decoder.decode(bytes as Uint8Array, { stream: true }));
    // A stream the caller cancelled may end quietly: what came until then is not an answer.
    if (signal.aborted) throw signal.reason;
    if (failure !== null) throw new Error(`openrouter: ${failure}`);
    if (text.trim() === "") throw new Error(`openrouter: ${model} answered without text`);
    return text.trim();
  } catch (error) {
    if (call.cancelled()) throw new LlmCancelled("openrouter");
    if (call.timedOut()) throw new Error(`openrouter: no answer within ${timeout} ms (KEYLANG_LLM_TIMEOUT_MS)`);
    throw error;
  } finally {
    call.dispose();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
