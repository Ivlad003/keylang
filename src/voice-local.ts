// The optional native parts of voice (design §7.4): `decibri` for the
// microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition.
// Both ship prebuilt binaries and are optional peer dependencies: npm installs
// them only when the user adds them next to keylang, and they are loaded only
// when present. Without them voice uses the browser's microphone (`keylang
// web`) and OpenRouter, or says what to install. The shapes used here are
// those of the packages' READMEs, checked at run time rather than trusted.
// Any failure to load one — absent, no prebuilt binary for this platform, an
// unexpected shape — makes it unavailable with the reason, never an error of
// the command.
//
// Sits beside `voice.ts` at the TUI/CLI edge, outside the analysis pipeline.
// Entry points: `localStatus`/`microphoneStatus` (for `keylang doctor`),
// `defaultMicrophone` and `transcribeLocal`.

import { createRequire } from "node:module";
import { windows, joinWindows } from "./voice.ts";

// `require` with literal names: the map sees which packages voice may load, and
// the packages' own TypeScript sources stay out of this project's type check.
const require = createRequire(import.meta.url);

/** A started microphone: PCM chunks as they are recorded, and how to stop it. */
type Microphone = { chunks: AsyncIterable<Int16Array>; stop: () => void };

/** Whether an optional package can be used here: `missing` when it is not installed, `unavailable` with the reason when it is there but does not load. */
export type ModuleStatus = { status: "ok" } | { status: "missing" } | { status: "unavailable"; reason: string };

/** A loaded whisper model, as `@fugood/whisper.node` returns it; `release` frees the native memory. */
interface WhisperContext {
  transcribeData(data: ArrayBuffer, options: { prompt?: string }): { stop: () => Promise<void>; promise: Promise<{ result?: string }> };
  release(): Promise<void>;
}

/** The native binding `loadWhisperModule` resolves to; only its `WhisperContext` class is checked. */
interface WhisperBinding {
  WhisperContext: new (...args: never[]) => WhisperContext;
}

/** The two exports of `@fugood/whisper.node` this module uses. */
interface Whisper {
  initWhisper: (options: { filePath: string; useGpu: boolean }) => Promise<WhisperContext>;
  loadWhisperModule: () => Promise<Partial<WhisperBinding> | null>;
}

/** A `decibri` microphone: 16-bit PCM chunks until `stop()`. */
type MicrophoneStream = AsyncIterable<Buffer> & { stop: () => void };

// Unchecked until `isMicrophoneStream`: any member may be missing.
type MicrophoneClass = new (options: { sampleRate: number; channels: number }) => Partial<MicrophoneStream> | null;

/** The one export of `decibri` this module uses. */
interface Decibri {
  Microphone: MicrophoneClass;
}

/** The README's shape of `@fugood/whisper.node`: both entry points are functions. */
function isWhisper(exports: Partial<Whisper> | null): exports is Whisper {
  return typeof exports?.initWhisper === "function" && typeof exports.loadWhisperModule === "function";
}

/** The loaded native binding exposes a `WhisperContext` constructor. */
function isWhisperBinding(binding: Partial<WhisperBinding> | null): binding is WhisperBinding {
  return typeof binding?.WhisperContext === "function";
}

/** `decibri` exports a `Microphone` constructor. */
function isDecibri(exports: Partial<Decibri> | null): exports is Decibri {
  return typeof exports?.Microphone === "function";
}

/** A microphone instance that can be iterated asynchronously and stopped. */
function isMicrophoneStream(mic: Partial<MicrophoneStream> | null): mic is MicrophoneStream {
  return typeof mic?.stop === "function" && typeof mic[Symbol.asyncIterator] === "function";
}

/**
 * `@fugood/whisper.node` with its platform binary: the package itself loads
 * the binary only on first use, so the check loads it, and a package without
 * a working binary is not reported as installed.
 */
async function loadWhisper(): Promise<{ module: Whisper } | Exclude<ModuleStatus, { status: "ok" }>> {
  const loaded = optional("@fugood/whisper.node", () => require("@fugood/whisper.node"));

  if (!("module" in loaded)) return loaded;
  const { module } = loaded;

  if (!isWhisper(module)) return { status: "unavailable", reason: "@fugood/whisper.node has no initWhisper/loadWhisperModule export; update it" };

  // Force the lazy binary load now, with its warnings captured, so a broken install shows here and not mid-recording.
  const load = module.loadWhisperModule;
  const binary = await quietly(() => load());

  if ("error" in binary) return { status: "unavailable", reason: [binary.error, ...binary.warnings].join("; ") };

  if (!isWhisperBinding(binary.value)) return { status: "unavailable", reason: ["@fugood/whisper.node loaded no WhisperContext", ...binary.warnings].join("; ") };

  return { module };
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

/** `decibri`, when installed and of the expected shape, or why not. */
function loadDecibri(): { module: Decibri } | Exclude<ModuleStatus, { status: "ok" }> {
  const loaded = optional("decibri", () => require("decibri"));

  if (!("module" in loaded)) return loaded;
  const { module } = loaded;

  if (!isDecibri(module)) return { status: "unavailable", reason: "decibri has no Microphone export; update decibri" };

  return { module };
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

  // Not installed is a normal state (the caller falls back); installed but broken is an error worth showing.
  if ("status" in loaded) {
    if (loaded.status === "missing") return null;
    throw new Error(`voice: the microphone is unavailable: ${loaded.reason}`);
  }

  const mic = new loaded.module.Microphone({ sampleRate: 16000, channels: 1 });

  if (!isMicrophoneStream(mic)) throw new Error("voice: decibri's Microphone is not a readable stream; update decibri");

  // Adapt decibri's Buffer chunks to the Int16Array chunks the rest of voice uses.
  return {
    chunks: (async function* () {
      for await (const chunk of mic) {
        // A copy: the stream may reuse its buffer, and Int16Array needs an even, aligned offset.
        const pcm = new Int16Array(Math.floor(chunk.length / 2));

        for (let i = 0; i < pcm.length; i++) pcm[i] = chunk.readInt16LE(i * 2);
        yield pcm;
      }
    })(),
    stop: () => mic.stop(),
  };
}

/** whisper.cpp on this machine, window by window, with the glossary as the initial prompt. */
export async function transcribeLocal(modelFile: string, pcm: Int16Array, terms: readonly string[]): Promise<string> {
  const loaded = await loadWhisper();

  if (!("module" in loaded)) throw new Error(loaded.status === "missing" ? "voice: the optional @fugood/whisper.node is not installed" : `voice: @fugood/whisper.node is unavailable: ${loaded.reason}`);
  const { initWhisper } = loaded.module;

  // Loading the model may also print warnings (no GPU and so on); capture them into the failure.
  const started = await quietly(() => initWhisper({ filePath: modelFile, useGpu: true }));

  if ("error" in started) throw new Error(`voice: whisper.cpp could not load ${modelFile}: ${[started.error, ...started.warnings].join("; ")}`);
  const context = started.value;

  // One model load for the whole recording, released even when a window fails.
  try {
    const texts: string[] = [];

    for (const window of windows(pcm)) {
      // A copy of the window's samples in an ArrayBuffer of its own, as whisper.node takes.
      const data = new Int16Array(window).buffer;
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
function optional<T>(name: string, load: () => T): { module: T } | Exclude<ModuleStatus, { status: "ok" }> {
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

// The tail of the queue of `quietly` calls: each waits for the previous one,
// so two never swap `console.warn` at the same time.
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

  // The next call waits on this one; a rejection here must not stall the queue.
  quiet = run.catch(() => undefined);

  return run;
}
