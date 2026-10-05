// What a model or a microphone adds to a session: ghost text and voice. Each
// finishes later than it was asked for, so each remembers where it was asked
// — the buffer, its text version and the mode — and lands only while that is
// still where the person is (review 2026-09-28): a ghost line is not taken
// into another file, and speech does not go into a buffer opened since. A
// ghost request whose place is gone is not only dropped but aborted: a newer
// request, a key that leaves the place, an operation start and `close()`
// cancel it in flight. The agent's draft of a flow (`Ctrl+Space` in the view)
// is the session's draft-flow operation, cancelled by its Cancel and by
// `close()`; while any explicit operation runs, ghost requests are suspended.

import type { Analysis } from "../analyze.ts";
import type { ContextPack } from "../agent-context.ts";
import { selectedAgent } from "../agent-cli.ts";
import { isCliAgent } from "../config.ts";
import { ghostSignal, ghostSuggestions } from "../ghost.ts";
import { updateStats } from "../stats.ts";
import { glossary, speechToSpec, transcribeOpenRouter, voiceEngine } from "../voice.ts";
import { errorText } from "./merge-session.ts";
import type { Buffer, Cursor, Mode, State } from "./state.ts";
import { graphemes } from "./width.ts";

export type Microphone = () => Promise<{ chunks: AsyncIterable<Int16Array>; stop: () => void } | null>;

/** What the assists need from the session around them. */
export interface AssistHost {
  readonly state: State;
  readonly closed: boolean;
  buffer(): Buffer | null;
  contextPack(): ContextPack | null;
  edit(change: (lines: string[], cursor: Cursor) => void): void;
  /** Work the session waits for in `idle()`; the frame is drawn when it settles. */
  track(work: Promise<void>): void;
  /** A timer of this module stopped: `idle()` may resolve. */
  settled(): void;
  draw(): void;
}

/** Where async work was asked for; it lands only while the session is still there. */
interface Spot {
  path: string;
  version: number;
  mode: Mode;
}

/** The ghost request on its way: where it was asked, and how to abort it. */
interface GhostFlight {
  spot: Spot;
  line: number;
  controller: AbortController;
}

/** A recording from its first `Ctrl+R`: the microphone may still be opening when the second one comes. */
interface Recording {
  phase: "starting" | "recording" | "recognizing";
  stopped: boolean;
  mic: { stop: () => void } | null;
}

/**
 * Counts for design §7.3: ghost measured against the deterministic completion; an unwritable `.keylang/` only loses the count.
 * Browse (no `keylang.json`) counts nothing: it writes no file, `.keylang/` included.
 */
export function countSuggestion(state: Pick<State, "root" | "config">, source: "ghost" | "completion", field: "proposed" | "accepted" | "rejected", shown: number | null | undefined): void {
  if (state.config.kind === "missing-config") return;
  try {
    updateStats(state.root, (stats) => {
      const tally = (stats.suggestions[source] ??= { proposed: 0, accepted: 0, rejected: 0, ms: 0 });
      tally[field]++;
      if (field !== "proposed" && typeof shown === "number") tally.ms += Date.now() - shown;
    });
  } catch {
    // Metrics never stop editing.
  }
}

export class Assist {
  private readonly host: AssistHost;
  private readonly microphone: Microphone;
  private ghostTimer: NodeJS.Timeout | null = null;
  /** Bumped by every ghost request: only the latest one may show its line. */
  private ghostRequest = 0;
  private ghostFlight: GhostFlight | null = null;
  private recording: Recording | null = null;

  constructor(host: AssistHost, microphone: Microphone) {
    this.host = host;
    this.microphone = microphone;
  }

  private get state(): State {
    return this.host.state;
  }

  /** A ghost request waits for its pause. */
  get waiting(): boolean {
    return this.ghostTimer !== null;
  }

  get recordingNow(): boolean {
    return this.recording !== null;
  }

  close(): void {
    this.cancelGhost();
    this.recording?.mic?.stop();
  }

  private spot(buffer: Buffer): Spot {
    return { path: buffer.path, version: buffer.version, mode: this.state.mode };
  }

  /** The session is where `spot` was taken: the same buffer, its text unchanged, the same mode, no merge on top. */
  private at(spot: Spot): boolean {
    const buffer = this.host.buffer();
    return !this.host.closed && buffer !== null && buffer.path === spot.path && buffer.version === spot.version && this.state.mode === spot.mode;
  }

  // ---------- ghost text ----------

  private stopGhostTimer(): void {
    if (!this.ghostTimer) return;
    clearTimeout(this.ghostTimer);
    this.ghostTimer = null;
    this.host.settled();
  }

  /** No ghost request waits for its pause or runs: the one in flight is aborted. */
  cancelGhost(): void {
    this.stopGhostTimer();
    this.ghostFlight?.controller.abort();
    this.ghostFlight = null;
  }

  /** After any input: a ghost request in flight for a place the session has left (buffer, text, mode, line) is aborted. */
  cancelStaleGhost(): void {
    const flight = this.ghostFlight;
    if (flight && (!this.at(flight.spot) || this.state.cursor.line !== flight.line)) this.cancelGhost();
  }

  /**
   * An explicit operation starts: a ghost request waiting for its pause is
   * not made, and one already asked is aborted and never shown.
   */
  suspendGhost(): void {
    this.cancelGhost();
    this.ghostRequest++;
  }

  /** After a pause with the cursor on a new flow item, ask the agent for one next line; never while an operation runs. */
  ghostSoon(): void {
    // A newer request supersedes the one in flight: at most one runs.
    this.cancelGhost();
    const buffer = this.host.buffer();
    const analysis = this.state.analysis;
    const agent = analysis ? selectedAgent(analysis.config.agent) : null;
    if (!buffer || !analysis?.snapshot || agent === null || this.state.completion || this.state.activeOperation !== null) return;
    const { line, col } = this.state.cursor;
    if (!ghostSignal(buffer.path, buffer.text, line, col)) return;
    const spot = this.spot(buffer);
    const request = ++this.ghostRequest;
    this.ghostTimer = setTimeout(() => {
      this.ghostTimer = null;
      if (request !== this.ghostRequest || this.state.activeOperation !== null) return this.host.settled();
      const text = buffer.text;
      const flight: GhostFlight = { spot, line, controller: new AbortController() };
      this.ghostFlight = flight;
      const work = (async () => {
        const { llmClient, isCancelled } = await import("../llm.ts");
        const setup = llmClient(analysis.config.agent, { root: this.state.root });
        if ("missing" in setup || flight.controller.signal.aborted) return;
        let variants: string[];
        try {
          variants = await ghostSuggestions(analysis, setup.client, buffer.path, text, line, this.host.contextPack(), flight.controller.signal);
        } catch (error) {
          // A cancelled request has no message: the person moved on, nothing failed.
          if (isCancelled(error)) return;
          throw error;
        }
        // The person typed on, moved, or a newer request was made meanwhile: a suggestion for older text is not shown.
        if (request !== this.ghostRequest || this.state.activeOperation !== null || !this.at(spot) || this.state.cursor.line !== line || variants.length === 0) return;
        this.state.ghost = { path: spot.path, version: spot.version, line, variants, index: 0, shown: Date.now() };
        countSuggestion(this.state, "ghost", "proposed", null);
      })()
        .catch((error: unknown) => {
          this.state.message = `agent: ${errorText(error)}`;
        })
        .finally(() => {
          if (this.ghostFlight === flight) this.ghostFlight = null;
        });
      this.host.track(work);
      // An agent CLI starts a process per request: it waits for a longer pause.
    }, analysis.config.ghost.delay ?? (isCliAgent(agent) ? 1500 : 400));
  }

  /** `Tab` on a ghost line: taken only into the text it was shown for. */
  acceptGhost(ghost: NonNullable<State["ghost"]>): void {
    const buffer = this.host.buffer();
    if (!buffer || buffer.path !== ghost.path || buffer.version !== ghost.version || this.state.mode !== "edit") {
      countSuggestion(this.state, "ghost", "rejected", ghost.shown);
      return;
    }
    const text = ghost.variants[ghost.index]!;
    this.host.edit((lines, cursor) => {
      lines[ghost.line] = text;
      cursor.line = ghost.line;
      cursor.col = graphemes(text).length;
    });
    countSuggestion(this.state, "ghost", "accepted", ghost.shown);
  }

  /** Anything but `Tab` and `Alt+]` drops a shown ghost line. */
  dropGhost(): void {
    const ghost = this.state.ghost;
    if (!ghost) return;
    this.state.ghost = null;
    countSuggestion(this.state, "ghost", "rejected", ghost.shown);
  }

  // ---------- voice ----------

  /**
   * `Ctrl+R`: record until `Ctrl+R` again (or the source ends), recognize,
   * and insert: on a new list item a command («крок …», «коли … тоді …»)
   * becomes the item, anything else is free text at the cursor. The speech
   * goes in only while the same buffer, with the same text, is still being
   * edited; otherwise the message shows what was heard.
   */
  voice(): void {
    const current = this.recording;
    if (current) {
      if (current.phase === "recognizing") {
        this.state.message = "voice: still recognizing the last recording";
        return;
      }
      current.stopped = true;
      current.mic?.stop();
      this.state.message = "voice: recognizing…";
      return;
    }
    const analysis = this.state.analysis;
    const buffer = this.host.buffer();
    if (!analysis || !buffer) {
      this.state.message = "analysis is still running";
      return;
    }
    const spot = this.spot(buffer);
    const line = this.state.cursor.line;
    // Set before the first `await`: a second Ctrl+R while the microphone opens stops this recording, not opens another.
    const recording: Recording = { phase: "starting", stopped: false, mic: null };
    this.recording = recording;
    const work = (async () => {
      const { localAvailable } = await import("../voice-local.ts");
      const engine = voiceEngine(analysis.config.voice, await localAvailable());
      if ("missing" in engine) throw new Error(engine.missing);
      const mic = await this.microphone();
      if (!mic) throw new Error("voice: no microphone: install the optional decibri, or speak in `keylang web`");
      recording.mic = mic;
      recording.phase = "recording";
      if (recording.stopped || this.host.closed) mic.stop();
      else {
        this.state.message = "● voice: recording… Ctrl+R stops";
        this.host.draw();
      }
      const chunks: Int16Array[] = [];
      for await (const chunk of mic.chunks) chunks.push(chunk);
      recording.phase = "recognizing";
      const pcm = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) {
        pcm.set(c, at);
        at += c.length;
      }
      if (pcm.length === 0) {
        this.state.message = "voice: nothing was recorded";
        return;
      }
      const terms = glossary(analysis, buffer.path, buffer.text, line);
      const text = engine.kind === "openrouter" ? await transcribeOpenRouter(engine, pcm, terms) : await (await import("../voice-local.ts")).transcribeLocal(engine.modelFile, pcm, terms);
      if (this.host.closed || text.trim() === "") return;
      if (!this.at(spot)) {
        this.state.message = `voice: «${text.trim()}» not inserted: ${buffer.path} changed or edit mode was left while recording`;
        return;
      }
      this.insertSpeech(text, line, analysis);
    })()
      .catch((error: unknown) => {
        this.state.message = errorText(error);
      })
      .finally(() => {
        if (this.recording === recording) this.recording = null;
      });
    this.host.track(work);
  }

  private insertSpeech(text: string, line: number, analysis: Analysis): void {
    const buffer = this.host.buffer();
    if (!buffer) return;
    const current = buffer.text.split("\n")[line] ?? "";
    const indent = /^\s*/.exec(current)![0];
    const ids = Object.keys(analysis.snapshot?.nodes ?? {}).filter((id) => analysis.snapshot!.nodes[id]!.kind === "fn");
    this.host.edit((lines, cursor) => {
      if (/^\s*-?\s*$/.test(current)) {
        const spec = speechToSpec(text, ids, indent);
        const items = spec.startsWith(`${indent}- `) ? spec.split("\n") : [`${indent}- ${spec}`];
        lines.splice(line, 1, ...items);
        cursor.line = line + items.length - 1;
        cursor.col = graphemes(items.at(-1)!).length;
      } else {
        const chars = graphemes(lines[cursor.line] ?? "");
        chars.splice(cursor.col, 0, text.trim());
        lines[cursor.line] = chars.join("");
        cursor.col += graphemes(text.trim()).length;
      }
    });
    this.state.message = `voice: ${text.trim()}`;
  }
}
