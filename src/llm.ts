// One text completion from the configured model (`keylang.json` `agent`):
// `anthropic:<model>` through the official SDK, `openrouter:<model>` through
// its chat completions endpoint with SSE. Keys come from the environment or
// `~/.config/keylang/<provider>.key` (mode 0600). Base URLs can be moved
// (`ANTHROPIC_BASE_URL`, `OPENROUTER_BASE_URL`), which is how tests run
// against a local server without the network. Nothing here decides a verdict.

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

export interface LlmClient {
  /** `anthropic:claude-opus-5`, as configured. */
  agent: string;
  model: string;
  complete(request: LlmRequest): Promise<string>;
}

export type LlmSetup = { client: LlmClient } | { missing: string };

type Env = Readonly<Record<string, string | undefined>>;

/** Models whose declines the Claude API can re-run on another model inside the same request. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|mythos-5)/;

export function llmClient(agent: string | null, env: Env = process.env, home: string = homedir()): LlmSetup {
  if (agent === null) return { missing: "no model configured: set `agent` in keylang.json, e.g. \"anthropic:claude-opus-5\" or \"openrouter:<model>\"" };
  const colon = agent.indexOf(":");
  const provider = agent.slice(0, colon);
  const model = agent.slice(colon + 1);
  if (provider === "anthropic") {
    const key = env.ANTHROPIC_API_KEY ?? readKey(home, "anthropic");
    // The SDK also reads `ANTHROPIC_AUTH_TOKEN` and an `ant auth login` profile.
    const profile = env.ANTHROPIC_AUTH_TOKEN !== undefined || existsSync(join(home, ".config/anthropic"));
    if (key === undefined && !profile) return { missing: "no Anthropic credentials: set ANTHROPIC_API_KEY, write ~/.config/keylang/anthropic.key (mode 0600), or run `ant auth login`" };
    const client = new Anthropic({ ...(key !== undefined ? { apiKey: key } : {}), ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
    return { client: { agent, model, complete: (request) => anthropicComplete(client, model, request) } };
  }
  if (provider === "openrouter") {
    const key = env.OPENROUTER_API_KEY ?? readKey(home, "openrouter");
    if (key === undefined) return { missing: "no OpenRouter key: set OPENROUTER_API_KEY or write ~/.config/keylang/openrouter.key (mode 0600)" };
    const base = env.OPENROUTER_BASE_URL ?? "https://openrouter.ai";
    return { client: { agent, model, complete: (request) => openrouterComplete(base, key, model, request) } };
  }
  return { missing: `unknown provider \`${provider}\` in agent \`${agent}\`` };
}

async function anthropicComplete(client: Anthropic, model: string, request: LlmRequest): Promise<string> {
  const fallbacks = FALLBACK_MODELS.test(model);
  const response = await client.beta.messages.create({
    model,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: [{ role: "user", content: request.prompt }],
    // A declined request is re-run server-side on a model chosen for the refusal category.
    ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  if (response.stop_reason === "refusal") throw new Error(`${model} declined the request${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`);
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

async function openrouterComplete(base: string, key: string, model: string, request: LlmRequest): Promise<string> {
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
  });
  if (!response.ok || !response.body) throw new Error(`openrouter: HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  let text = "";
  let failure: string | null = null;
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return;
      const chunk = JSON.parse(event.data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
      if (chunk.error) failure = chunk.error.message ?? "stream error";
      text += chunk.choices?.[0]?.delta?.content ?? "";
    },
  });
  const decoder = new TextDecoder();
  for await (const bytes of response.body) parser.feed(decoder.decode(bytes as Uint8Array, { stream: true }));
  if (failure !== null) throw new Error(`openrouter: ${failure}`);
  return text.trim();
}
