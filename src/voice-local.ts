// The optional native parts of voice (design §7.4): `decibri` for the
// microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition.
// Both ship prebuilt binaries and are loaded only when present; without them
// voice uses the browser's microphone (`keylang web`) and OpenRouter, or says
// what to install. The shapes used here are those of the packages' READMEs,
// checked at run time rather than trusted. Any failure to load one — absent,
// no prebuilt binary for this platform, an unexpected shape — makes it
// unavailable with the reason, never an error of the command.

import { createRequire } from "node:module";
import { windows, joinWindows } from "./voice.ts";

// `require` with literal names: the map sees which packages voice may load, and
// the packages' own TypeScript sources stay out of this project's type check.
const require = createRequire(import.meta.url);

type Microphone = { chunks: AsyncIterable<Int16Array>; stop: () => void };

/** Whether an optional package can be used here: `missing` when it is not installed, `unavailable` with the reason when it is there but does not load. */
export type ModuleStatus = { status: "ok" } | { status: "missing" } | { status: "unavailable"; reason: string };

interface WhisperContext {
  transcribeData(data: ArrayBuffer, options: { prompt?: string }): { stop: () => Promise<void>; promise: Promise<{ result?: string }> };
  release(): Promise<void>;
}

interface Whisper {
  initWhisper: (options: { filePath: string; useGpu: boolean }) => Promise<WhisperContext>;
  loadWhisperModule: () => Promise<unknown>;
}

type MicrophoneClass = new (options: { sampleRate: number; channels: number }) => unknown;

/**
 * `@fugood/whisper.node` with its platform binary: the package itself loads
 * the binary only on first use, so the check loads it, and a package without
 * a working binary is not reported as installed.
 */
async function loadWhisper(): Promise<{ module: Whisper } | Exclude<ModuleStatus, { status: "ok" }>> {
  const loaded = optional("@fugood/whisper.node", () => require("@fugood/whisper.node"));
  if (!("module" in loaded)) return loaded;
  const module = loaded.module as Partial<Whisper> | null;
  if (typeof module?.initWhisper !== "function" || typeof module.loadWhisperModule !== "function") {
    return { status: "unavailable", reason: "@fugood/whisper.node has no initWhisper/loadWhisperModule export; update it" };
  }
  const load = module.loadWhisperModule;
  const binary = await quietly(() => load());
  if ("error" in binary) return { status: "unavailable", reason: [binary.error, ...binary.warnings].join("; ") };
  if (typeof (binary.value as { WhisperContext?: unknown } | null)?.WhisperContext !== "function") {
    return { status: "unavailable", reason: ["@fugood/whisper.node loaded no WhisperContext", ...binary.warnings].join("; ") };
  }
  return { module: module as Whisper };
}

/** What `@fugood/whisper.node` can do on this machine. */
export async function localStatus(): Promise<ModuleStatus> {
  const loaded = await loadWhisper();
  return "module" in loaded ? { status: "ok" } : loaded;
}

/** Whether `@fugood/whisper.node` and its binary load on this machine. */
export async function localAvailable(): Promise<boolean> {
  return (await localStatus()).status === "ok";
}

function loadDecibri(): { module: { Microphone: MicrophoneClass } } | Exclude<ModuleStatus, { status: "ok" }> {
  const loaded = optional("decibri", () => require("decibri"));
  if (!("module" in loaded)) return loaded;
  const module = loaded.module as { Microphone?: unknown } | null;
  if (typeof module?.Microphone !== "function") return { status: "unavailable", reason: "decibri has no Microphone export; update decibri" };
  return { module: module as { Microphone: MicrophoneClass } };
}

/** What `decibri` can do on this machine. */
export async function microphoneStatus(): Promise<ModuleStatus> {
  const loaded = loadDecibri();
  return "module" in loaded ? { status: "ok" } : loaded;
}

/** Whether `decibri` loads on this machine. */
export async function microphoneAvailable(): Promise<boolean> {
  return (await microphoneStatus()).status === "ok";
}

/** The system microphone through `decibri` (16 kHz, mono, s16le); null when it is not installed. */
export async function defaultMicrophone(): Promise<Microphone | null> {
  const loaded = loadDecibri();
  if ("status" in loaded) {
    if (loaded.status === "missing") return null;
    throw new Error(`voice: the microphone is unavailable: ${loaded.reason}`);
  }
  const mic = new loaded.module.Microphone({ sampleRate: 16000, channels: 1 }) as AsyncIterable<Buffer> & { stop?: () => void };
  if (typeof mic.stop !== "function" || typeof mic[Symbol.asyncIterator] !== "function") throw new Error("voice: decibri's Microphone is not a readable stream; update decibri");
  return {
    chunks: (async function* () {
      for await (const chunk of mic) {
        // A copy: the stream may reuse its buffer, and Int16Array needs an even, aligned offset.
        const pcm = new Int16Array(Math.floor(chunk.length / 2));
        for (let i = 0; i < pcm.length; i++) pcm[i] = chunk.readInt16LE(i * 2);
        yield pcm;
      }
    })(),
    stop: () => mic.stop!(),
  };
}

/** whisper.cpp on this machine, window by window, with the glossary as the initial prompt. */
export async function transcribeLocal(modelFile: string, pcm: Int16Array, terms: readonly string[]): Promise<string> {
  const loaded = await loadWhisper();
  if (!("module" in loaded)) throw new Error(loaded.status === "missing" ? "voice: the optional @fugood/whisper.node is not installed" : `voice: @fugood/whisper.node is unavailable: ${loaded.reason}`);
  const { initWhisper } = loaded.module;
  const started = await quietly(() => initWhisper({ filePath: modelFile, useGpu: true }));
  if ("error" in started) throw new Error(`voice: whisper.cpp could not load ${modelFile}: ${[started.error, ...started.warnings].join("; ")}`);
  const context = started.value;
  try {
    const texts: string[] = [];
    for (const window of windows(pcm)) {
      const data = window.buffer.slice(window.byteOffset, window.byteOffset + window.byteLength) as ArrayBuffer;
      const { promise } = context.transcribeData(data, { prompt: terms.join(", ") });
      texts.push((await promise).result ?? "");
    }
    return joinWindows(texts);
  } finally {
    await context.release();
  }
}

/**
 * A package that may be absent or fail to load (a native binding without a
 * prebuilt binary for this platform throws on `require`). Literal specifiers,
 * so the map sees which packages voice may load.
 */
function optional(name: string, load: () => unknown): { module: unknown } | Exclude<ModuleStatus, { status: "ok" }> {
  try {
    return { module: load() };
  } catch (error) {
    // Missing is the package itself; a module it cannot find (its platform binary) makes it unavailable.
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if ((code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") && (message.includes(`'${name}'`) || message.includes(`"${name}"`))) return { status: "missing" };
    return { status: "unavailable", reason: message.split("\n")[0]! };
  }
}

let quiet: Promise<unknown> = Promise.resolve();

/**
 * Runs `load` with `console.warn` captured: whisper.node warns while it looks
 * for a platform binary, which would draw over the TUI. The warnings become
 * part of a failure's reason. One at a time, so the real `console.warn` is
 * always what gets restored.
 */
function quietly<T>(load: () => Promise<T>): Promise<({ value: T } | { error: string }) & { warnings: string[] }> {
  const run = quiet.then(async () => {
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      return { value: await load(), warnings };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), warnings };
    } finally {
      console.warn = warn;
    }
  });
  quiet = run.catch(() => undefined);
  return run;
}
