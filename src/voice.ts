// Voice input (design §7.3 «Голосовий ввід»): PCM (16 kHz, mono, s16le) →
// text, by a local whisper.cpp model or OpenRouter's audio input. Speech
// goes into free text by default; a tiny command grammar («крок …», «коли …
// тоді …», «емітить …») turns into list items with IDs matched the way
// completion matches them. A glossary of at most 30 IDs around the cursor
// primes the recognizer: long term lists make recognition worse, not better.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Analysis } from "./analyze.ts";
import { sectionNodes, walk } from "./ir.ts";
import { readKey } from "./keys.ts";
import { parse } from "./parser.ts";

export const SAMPLE_RATE = 16000;
/** Recognition windows of ~25 s with 1 s of overlap (the voice-transcriber idea, not its code). */
export const WINDOW_SECONDS = 25;
export const OVERLAP_SECONDS = 1;
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-audio-preview";
export const LOCAL_MODELS = ["ggml-large-v3-turbo.bin", "ggml-small.bin"];

type Env = Readonly<Record<string, string | undefined>>;

export interface VoiceConfig {
  engine: "local" | "openrouter" | "auto";
  model: string | null;
}

export type VoiceEngine =
  | { kind: "openrouter"; key: string; base: string; model: string }
  | { kind: "local"; modelFile: string }
  | { missing: string };

export function modelsDir(home: string = homedir()): string {
  return join(home, ".cache/keylang/models");
}

/** The first downloaded whisper model, or null. */
export function localModel(home: string = homedir()): string | null {
  for (const name of LOCAL_MODELS) if (existsSync(join(modelsDir(home), name))) return join(modelsDir(home), name);
  return null;
}

/**
 * `local`: a downloaded model and the optional `@fugood/whisper.node`;
 * `openrouter`: a key; `auto`: local when its model is there, else OpenRouter
 * with a key. Otherwise what to set up, in one sentence.
 */
export function voiceEngine(config: VoiceConfig, localAvailable: boolean, env: Env = process.env, home: string = homedir()): VoiceEngine {
  const key = env.OPENROUTER_API_KEY ?? readKey(home, "openrouter");
  const model = localModel(home);
  const local = (): VoiceEngine | null => (model && localAvailable ? { kind: "local", modelFile: model } : null);
  const openrouter = (): VoiceEngine | null =>
    key ? { kind: "openrouter", key, base: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai", model: config.model ?? DEFAULT_OPENROUTER_MODEL } : null;
  const setup = `install the optional @fugood/whisper.node and put a model (${LOCAL_MODELS.join(" or ")}) in ${modelsDir(home)}, or set OPENROUTER_API_KEY`;
  if (config.engine === "local") return local() ?? { missing: model ? "voice.engine is local, but the optional @fugood/whisper.node is not installed" : `voice.engine is local, but no model in ${modelsDir(home)}` };
  if (config.engine === "openrouter") return openrouter() ?? { missing: "voice.engine is openrouter, but OPENROUTER_API_KEY is not set" };
  return local() ?? openrouter() ?? { missing: setup };
}

/** A RIFF/WAVE file around 16-bit mono PCM. */
export function wav(pcm: Int16Array, rate: number = SAMPLE_RATE): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Windows of `WINDOW_SECONDS` that overlap by `OVERLAP_SECONDS`; a short recording is one window, an empty one none. */
export function windows(pcm: Int16Array, rate: number = SAMPLE_RATE): Int16Array[] {
  const size = WINDOW_SECONDS * rate;
  const step = (WINDOW_SECONDS - OVERLAP_SECONDS) * rate;
  if (pcm.length === 0) return [];
  if (pcm.length <= size) return [pcm];
  const out: Int16Array[] = [];
  for (let start = 0; start < pcm.length; start += step) {
    out.push(pcm.subarray(start, Math.min(pcm.length, start + size)));
    if (start + size >= pcm.length) break;
  }
  return out;
}

/** Most words one second of overlap holds (fast speech is about five a second). */
const SEAM_WORDS = 8;

/** A word as the overlap repeats it: case and punctuation differ between windows (`card,` / `Card`). */
function seamWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Joins window texts, dropping the words the overlap repeated at a seam: the longest run that ends one window and starts the next. */
export function joinWindows(texts: readonly string[]): string {
  let out = "";
  for (const text of texts.map((t) => t.trim()).filter((t) => t !== "")) {
    if (out === "") {
      out = text;
      continue;
    }
    const tail = out.split(/\s+/).slice(-SEAM_WORDS).map(seamWord);
    const words = text.split(/\s+/);
    const head = words.map(seamWord);
    let skip = 0;
    for (let n = Math.min(tail.length, words.length); n > 0; n--) {
      if (tail.slice(-n).join(" ") === head.slice(0, n).join(" ")) {
        skip = n;
        break;
      }
    }
    out = `${out} ${words.slice(skip).join(" ")}`.trim();
  }
  return out;
}

/**
 * At most 30 IDs near the cursor: those of the current flow, the neighbours
 * of the IDs on the cursor line, and those IDs last — the end of a prompt
 * weighs most.
 */
export function glossary(analysis: Analysis, path: string, text: string, line: number): string[] {
  const doc = parse(path, text);
  const onLine: string[] = [];
  const inFlow: string[] = [];
  const section = doc.sections.filter((s) => s.heading !== null && s.heading.span.start.line <= line + 1).at(-1);
  for (const s of doc.sections) {
    for (const top of sectionNodes(s)) {
      walk(top, (node) => {
        for (const ref of node.refs) {
          if (node.span.start.line === line + 1) onLine.push(ref.target);
          else if (s === section) inFlow.push(ref.target);
        }
      });
    }
  }
  const nodes = analysis.snapshot?.nodes ?? {};
  const last = [...new Set(onLine)].slice(0, 30);
  const neighbours = last.flatMap((id) => [...(nodes[id]?.calls ?? []), ...(nodes[id]?.callers ?? [])]);
  // The cursor line's IDs are kept whatever else is cut, and come last.
  const rest = [...new Set([...inFlow, ...neighbours])].filter((id) => !last.includes(id));
  return [...rest.slice(Math.max(0, rest.length - (30 - last.length))), ...last];
}

/** The words people say for an ID: its last segments split at case and separators. */
function spoken(id: string): string {
  return id
    .split(".")
    .slice(-2)
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .toLowerCase();
}

/**
 * The ID whose spoken form holds every word (the fuzzy match of completion).
 * Several such IDs are ambiguous unless exactly one is said in full («order
 * total» for `domain.order.total` beside `domain.order.totalTax`); then null,
 * and the words stay as said.
 */
export function matchId(words: string, ids: readonly string[]): string | null {
  const want = words.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (want.length === 0) return null;
  const hits = ids.filter((id) => {
    const said = spoken(id);
    return want.every((w) => said.includes(w));
  });
  if (hits.length <= 1) return hits[0] ?? null;
  const exact = hits.filter((id) => spoken(id) === want.join(" "));
  return exact.length === 1 ? exact[0]! : null;
}

/**
 * «крок X» → `- step <id>`, «коли A тоді B» → `- when A` + `  - then B`,
 * «емітить X» → `- emits X` (also `step`, `when … then …`, `emits`); anything
 * else stays free text. A step whose ID does not match stays as said.
 */
export function speechToSpec(text: string, ids: readonly string[], indent = ""): string {
  const said = text.trim().replace(/[.!?]+$/, "");
  let m = /^(?:крок|step)\s+(.+)$/iu.exec(said);
  if (m) return `${indent}- step ${matchId(m[1]!, ids) ?? m[1]!}`;
  m = /^(?:коли|when)\s+(.+?)\s*,?\s+(?:тоді|then)\s+(.+)$/iu.exec(said);
  if (m) return `${indent}- when ${m[1]!}\n${indent}  - then ${m[2]!}`;
  m = /^(?:емітить|emits)\s+(.+)$/iu.exec(said);
  if (m) return `${indent}- emits ${m[1]!.replace(/\s+/g, ".")}`;
  return said;
}

/** The text of an OpenRouter chat completion; anything else (not JSON, an error with status 200) is an error that says so. */
function transcriptOf(reply: string): string {
  let body: unknown;
  try {
    body = JSON.parse(reply);
  } catch {
    throw new Error(`voice: openrouter answered with something other than JSON: ${reply.slice(0, 200)}`);
  }
  const answer = body as { choices?: { message?: { content?: unknown } }[]; error?: { message?: unknown } } | null;
  if (answer?.error !== undefined) throw new Error(`voice: openrouter: ${typeof answer.error?.message === "string" ? answer.error.message : JSON.stringify(answer.error)}`);
  const content = answer?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(`voice: openrouter returned no transcript: ${reply.slice(0, 200)}`);
  return content;
}

/** One OpenRouter chat completion per window, with the glossary as the prompt; an empty recording sends nothing. */
export async function transcribeOpenRouter(engine: Extract<VoiceEngine, { kind: "openrouter" }>, pcm: Int16Array, terms: readonly string[]): Promise<string> {
  const key = engine.key;
  const texts: string[] = [];
  for (const window of windows(pcm)) {
    const response = await fetch(`${engine.base.replace(/\/$/, "")}/api/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: engine.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Transcribe this speech verbatim; return only the text. Terms that may occur: ${terms.join(", ")}` },
              { type: "input_audio", input_audio: { data: wav(window).toString("base64"), format: "wav" } },
            ],
          },
        ],
      }),
    });
    const reply = await response.text();
    if (!response.ok) throw new Error(`voice: openrouter HTTP ${response.status}: ${reply.slice(0, 200)}`);
    texts.push(transcriptOf(reply));
  }
  return joinWindows(texts);
}
