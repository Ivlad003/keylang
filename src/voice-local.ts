// The optional native parts of voice (design §7.4): `decibri` for the
// microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition.
// Both ship prebuilt binaries and are loaded only when present; without them
// voice uses the browser's microphone (`keylang web`) and OpenRouter, or says
// what to install. The shapes used here are those of the packages' READMEs,
// checked at run time rather than trusted.

import { createRequire } from "node:module";
import { windows, joinWindows } from "./voice.ts";

// `require` with literal names: the map sees which packages voice may load, and
// the packages' own TypeScript sources stay out of this project's type check.
const require = createRequire(import.meta.url);

type Microphone = { chunks: AsyncIterable<Int16Array>; stop: () => void };

/** Whether `@fugood/whisper.node` can be loaded on this machine. */
export async function localAvailable(): Promise<boolean> {
  const whisper = await optional(() => require("@fugood/whisper.node"));
  return whisper !== null && typeof (whisper as { initWhisper?: unknown }).initWhisper === "function";
}

/** The system microphone through `decibri` (16 kHz, mono, s16le), or null when it is not installed. */
export async function defaultMicrophone(): Promise<Microphone | null> {
  const decibri = (await optional(() => require("decibri"))) as { Microphone?: new (options: { sampleRate: number; channels: number }) => unknown } | null;
  if (decibri === null) return null;
  if (typeof decibri.Microphone !== "function") throw new Error("voice: decibri has no Microphone export; update decibri");
  const mic = new decibri.Microphone({ sampleRate: 16000, channels: 1 }) as AsyncIterable<Buffer> & { stop?: () => void };
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

interface WhisperContext {
  transcribeData(data: ArrayBuffer, options: { prompt?: string }): { stop: () => Promise<void>; promise: Promise<{ result?: string }> };
  release(): Promise<void>;
}

/** whisper.cpp on this machine, window by window, with the glossary as the initial prompt. */
export async function transcribeLocal(modelFile: string, pcm: Int16Array, terms: readonly string[]): Promise<string> {
  const whisper = (await optional(() => require("@fugood/whisper.node"))) as { initWhisper?: (options: { filePath: string; useGpu: boolean }) => Promise<WhisperContext> } | null;
  if (!whisper || typeof whisper.initWhisper !== "function") throw new Error("voice: the optional @fugood/whisper.node is not installed");
  const context = await whisper.initWhisper({ filePath: modelFile, useGpu: true });
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

/** Whether `decibri` can be loaded on this machine. */
export async function microphoneAvailable(): Promise<boolean> {
  return (await optional(() => require("decibri"))) !== null;
}

/**
 * A package that may be absent: its module, or null. A package that is there
 * but fails to load is an error. Literal specifiers, so the map sees which
 * packages voice may load.
 */
async function optional(load: () => unknown): Promise<unknown> {
  try {
    return load();
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND")) return null;
    throw error;
  }
}
