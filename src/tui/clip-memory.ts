// The clip's memory (ADR 0021 п. 6, .scratch/tui-clip/06). Where the person
// left the clip and its window is theirs, not the repository's: it lives in
// `~/.config/keylang/tui.json` beside `agents.json`, read when a session
// starts and written atomically when a drag, a keyboard move or a resize
// ends, the file's other fields kept. The conversation is a chronology by
// day in `.keylang/chat/<YYYY-MM-DD>.md` (local date): a `## <time>` section
// per conversation with its exchanges, and a new session goes on with the
// last section. Neither `check` nor the snapshot reads it (spec П7). It may
// hold code and spec text, so it is written only where git ignores it or
// outside any repository, never in Browse; the first time it cannot be, the
// chat says why, once.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { errorText } from "../diag.ts";
import { existingText, readTextOrNull } from "../files.ts";
import { landing, safeWrite, writeAtomic, writeProblem } from "../safe-write.ts";
import { CHAT_MIN_COLS, CHAT_MIN_ROWS, type Cell, type ChatMessage, type ClipState } from "./clip.ts";

// ---------- the place: ~/.config/keylang/tui.json ----------

/** `~/.config/keylang/tui.json`: the TUI's settings of its user, beside `agents.json`. */
function tuiFile(home: string): string {
  return join(home, ".config/keylang/tui.json");
}

/** Where the person left the clip and its window, cells from 0; null: where it stands by default. */
export interface ClipPlace {
  clip: Cell | null;
  window: { x: number; y: number; cols: number; rows: number } | null;
}

const NO_PLACE: ClipPlace = { clip: null, window: null };

/** The place of the clip and its window as the session has them: as the person set them, whatever a smaller terminal shows. */
export function placeOf(clip: ClipState): ClipPlace {
  const { place, size } = clip.chat;
  return { clip: clip.place === null ? null : { ...clip.place }, window: place === null ? null : { x: place.x, y: place.y, cols: size.cols, rows: size.rows } };
}

/** A session starts with the clip and its window where they were left; the frame keeps them inside its terminal. */
export function placeClip(clip: ClipState, place: ClipPlace): void {
  clip.place = place.clip === null ? null : { ...place.clip };
  if (place.window === null) return;
  const { x, y, cols, rows } = place.window;
  clip.chat.place = { x, y };
  clip.chat.size = { cols, rows };
}

/**
 * The place a parsed tui.json holds. No `assistant`, `clip` or `window`, or
 * null: the default. A field of the wrong shape throws, naming the file and
 * the field; a window is at least 30×7.
 */
export function parsePlace(file: string, value: unknown): ClipPlace {
  if (!isObject(value)) throw new Error(`${file}: must be a JSON object, got ${shown(value)}`);
  const assistant = value.assistant;
  if (assistant === undefined || assistant === null) return NO_PLACE;
  if (!isObject(assistant)) throw new Error(`${file}: \`assistant\` must be an object, got ${shown(assistant)}`);
  const clip = fieldsOf(file, "assistant.clip", assistant.clip, ["x", "y"]);
  const window = fieldsOf(file, "assistant.window", assistant.window, ["x", "y", "cols", "rows"]);
  return {
    clip: clip === null ? null : { x: whole(file, "assistant.clip.x", clip.x, 0), y: whole(file, "assistant.clip.y", clip.y, 0) },
    window:
      window === null
        ? null
        : {
            x: whole(file, "assistant.window.x", window.x, 0),
            y: whole(file, "assistant.window.y", window.y, 0),
            cols: whole(file, "assistant.window.cols", window.cols, CHAT_MIN_COLS),
            rows: whole(file, "assistant.window.rows", window.rows, CHAT_MIN_ROWS),
          },
  };
}

/** An object field with only `keys`, or null when it is left out. */
function fieldsOf(file: string, field: string, value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) throw new Error(`${file}: \`${field}\` must be an object of ${keys.join(", ")}, got ${shown(value)}`);
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown !== undefined) throw new Error(`${file}: unknown field \`${field}.${unknown}\` (known: ${keys.join(", ")})`);
  return value;
}

/** An integer of at least `least`; a missing one is named as missing. */
function whole(file: string, field: string, value: unknown, least: number): number {
  if (value === undefined) throw new Error(`${file}: \`${field}\` is missing`);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < least) throw new Error(`${file}: \`${field}\` must be an integer, at least ${least}, got ${shown(value)}`);
  return value;
}

/**
 * The place tui.json holds as a session starts. No file: the default, and
 * nothing to say. A file that cannot be read or used: the default and why,
 * which the session says once; the file stays as it is until a drag.
 */
export function readPlace(home: string): { place: ClipPlace; problem: string | null } {
  const file = tuiFile(home);
  let text: string | null;
  try {
    text = existingText(file);
  } catch (error) {
    return { place: NO_PLACE, problem: `${file}: ${errorText(error)}` };
  }
  if (text === null) return { place: NO_PLACE, problem: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { place: NO_PLACE, problem: `${file}: invalid JSON: ${errorText(error)}` };
  }
  try {
    return { place: parsePlace(file, value), problem: null };
  } catch (error) {
    return { place: NO_PLACE, problem: errorText(error) };
  }
}

/**
 * tui.json's text with the place: `assistant.clip` and `assistant.window`
 * replaced (left out for the default), every other field as it was. Text
 * that is no JSON object is replaced: the place is all it holds then.
 */
export function withPlace(text: string | null, place: ClipPlace): string {
  const value = parsedObject(text);
  const assistant = isObject(value.assistant) ? value.assistant : {};
  const kept = Object.fromEntries(Object.entries(assistant).filter(([key]) => key !== "clip" && key !== "window"));
  const next = { ...kept, ...(place.clip === null ? {} : { clip: place.clip }), ...(place.window === null ? {} : { window: place.window }) };
  return `${JSON.stringify({ ...value, assistant: next }, null, 2)}\n`;
}

function parsedObject(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

/** Writes the place into tui.json atomically, at the target of a link to it; throws, naming the file, when it cannot. */
export function writePlace(home: string, place: ClipPlace): void {
  const file = tuiFile(home);
  const at = landing(file);
  if (at === null) throw new Error(`${file}: leads through a loop of links`);
  try {
    writeAtomic(at, withPlace(existingText(at), place));
  } catch (error) {
    throw new Error(`${file}: ${errorText(error)}`);
  }
}

// ---------- the conversation: .keylang/chat/<YYYY-MM-DD>.md ----------

/** The logs of the conversations, relative to the root: keylang's own state, never a spec or a source. */
const CHAT_DIR = ".keylang/chat";

const two = (n: number): string => String(n).padStart(2, "0");

/** A local date as the log names its file: `2026-10-06`. */
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** A local time as a section's heading names it: `14:05`. */
function timeOf(date: Date): string {
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The log of a day, relative to the root, POSIX. */
export function chatLogPath(day: string): string {
  return `${CHAT_DIR}/${day}.md`;
}

/** One exchange as the log keeps it. */
export interface ChatExchange {
  /** The person's message. */
  you: string;
  /** The clip's answer; a proposal is `proposal`, not a line of it. */
  clip: string;
  /** The model that answered; null: a command, or keylang without a model. */
  agent: string | null;
  /** The proposal written from the answer, relative to the root. */
  proposal: string | null;
}

/** The labels of a message's block. */
const YOU = "ти";
const CLIP = "скрепка";
const PROPOSAL = "пропозиція";
const LABEL = /^\*\*(ти|скрепка|пропозиція):\*\*(?: (.*))?$/;

/** A message's lines after its first are indented: only the log's own lines (title, headings, labels) start at the margin. */
const INDENT = "  ";

/** A message as a block: the label and its first line, its other lines indented, its empty lines empty. */
function block(label: string, text: string): string {
  const [first = "", ...rest] = text.replace(/\r\n?/g, "\n").split("\n");
  return [`**${label}:** ${first}`, ...rest.map((line) => (line === "" ? "" : `${INDENT}${line}`))].join("\n");
}

/** The blocks of an exchange: the person's message, the clip's answer when it says anything, the proposal written. */
function exchangeBlocks(exchange: ChatExchange): string[] {
  return [
    block(YOU, exchange.you),
    ...(exchange.clip.trim() === "" ? [] : [block(CLIP, exchange.clip.trimEnd())]),
    ...(exchange.proposal === null ? [] : [block(PROPOSAL, exchange.proposal)]),
  ];
}

const isHeading = (line: string): boolean => line.startsWith("## ");

/** A section's heading: when its conversation started, and the models that answered in it. */
function heading(time: string, agents: readonly string[]): string {
  return `## ${time}${agents.length === 0 ? "" : ` · ${agents.join(", ")}`}`;
}

/** The log's last section heading names `agent` too: a section started by `/new` or a command learns its model from its first answer. */
function withAgent(text: string, agent: string): string {
  const lines = text.split("\n");
  const at = lines.findLastIndex(isHeading);
  if (at === -1) return text;
  const [time = "", named = ""] = lines[at]!.slice(3).trimEnd().split(" · ");
  const agents = named === "" ? [] : named.split(", ");
  if (agents.includes(agent)) return text;
  lines[at] = heading(time, [...agents, agent]);
  return lines.join("\n");
}

/** `text` and the blocks after it, a blank line between any two. */
function appended(text: string, blocks: readonly string[]): string {
  const kept = text.trimEnd();
  return `${kept === "" ? "" : `${kept}\n\n`}${blocks.join("\n\n")}\n`;
}

/**
 * The log of `day` with an exchange after its last line. `going`: the
 * conversation goes on in the last section, whose heading learns the model
 * that answered; otherwise a section starts at `time` (and an empty log
 * gets its title first).
 */
export function withExchange(text: string | null, day: string, time: string, exchange: ChatExchange, going: boolean): string {
  const current = text ?? "";
  const fresh = current.trim() === "";
  const goesOn = going && current.split("\n").some(isHeading);
  const base = goesOn && exchange.agent !== null ? withAgent(current, exchange.agent) : current;
  const opening = goesOn ? [] : [heading(time, exchange.agent === null ? [] : [exchange.agent])];
  return appended(base, [...(fresh ? [`# chat ${day}`] : []), ...opening, ...exchangeBlocks(exchange)]);
}

/** The log of `day` with a new section at `time`: `/new`. */
export function withSection(text: string | null, day: string, time: string): string {
  const current = text ?? "";
  return appended(current, [...(current.trim() === "" ? [`# chat ${day}`] : []), heading(time, [])]);
}

/**
 * The conversation of the log's last section, as the history shows it: the
 * person's messages and the clip's, a proposal as the clip's line
 * `пропозиція: <path>`. Null when the log has no section.
 */
export function lastConversation(text: string): ChatMessage[] | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findLastIndex(isHeading);
  if (start === -1) return null;
  const messages: ChatMessage[] = [];
  let label: string | null = null;
  let body: string[] = [];
  const close = (): void => {
    if (label === null) return;
    const said = body.join("\n").replace(/\n+$/, "");
    const last = messages.at(-1);
    if (label === YOU) messages.push({ role: "you", text: said });
    else if (label === CLIP) messages.push({ role: "clip", text: said });
    // The proposal of an answer is its last line, as the chat said it.
    else if (last?.role === "clip") messages[messages.length - 1] = { role: "clip", text: `${last.text}\n${PROPOSAL}: ${said}` };
    else messages.push({ role: "clip", text: `${PROPOSAL}: ${said}` });
    label = null;
    body = [];
  };
  for (const line of lines.slice(start + 1)) {
    const opened = LABEL.exec(line);
    if (opened !== null) {
      close();
      label = opened[1]!;
      body = [opened[2] ?? ""];
    } else if (label !== null && (line === "" || line.startsWith(INDENT))) body.push(line.slice(INDENT.length));
    // Any other line at the margin ends the message and is none.
    else close();
  }
  close();
  return messages;
}

/** What the chat says when git does not ignore the log: once a session. */
export const NOT_IGNORED = "розмову не записано: git не ігнорує .keylang/, а лог розмови може містити код і текст специфікацій; додайте .keylang/ у .gitignore — keylang init це робить";

/**
 * Why the log may not be written at `path` (relative to `root`): null when
 * git ignores it (`git check-ignore -q`, an argument array, no shell) or
 * when `root` is in no repository — with no `.git` above it, whether git
 * runs or not. In a repository git must say so: anything else keeps the log
 * from being written.
 */
function logBlocked(root: string, path: string): string | null {
  // stdin is the null device, never a pipe (see git-changes.ts).
  const run = spawnSync("git", ["check-ignore", "-q", "--", path], { cwd: root, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (run.status === 0) return null;
  if (run.status === 1) return NOT_IGNORED;
  if (!inRepository(root)) return null;
  const why = run.error?.message ?? (run.stderr.trim().split("\n")[0] || `exit code ${run.status}`);
  return `розмову не записано: git не сказав, чи ігнорує він ${path} (${why}), а лог пишеться лише туди, де його не закомітять`;
}

/** A `.git` in `dir` or above it: a repository, or a worktree's link to one. */
function inRepository(dir: string): boolean {
  for (let at = dir; ; at = dirname(at)) {
    if (existsSync(join(at, ".git"))) return true;
    if (dirname(at) === at) return false;
  }
}

/**
 * Today's conversation of one session in `.keylang/chat/`. The exchanges of
 * a conversation go into one section; `/new` and a new day start another.
 * Browse writes nothing; elsewhere the log is written only where git
 * ignores it or outside any repository, and the first time it cannot be
 * written the session hears why, once.
 */
export class ChatLog {
  private readonly root: string;
  private readonly now: () => Date;
  /** The day whose log holds the conversation going on; null: the next exchange starts a section. */
  private going: string | null = null;
  /** Why the log is not written has been said: once a session. */
  private told = false;

  constructor(root: string, now: () => Date = () => new Date()) {
    this.root = root;
    this.now = now;
  }

  /** The conversation a session goes on with: the last section of today's log, or none. Reading writes nothing, in Browse too. */
  restore(): ChatMessage[] {
    const day = dayOf(this.now());
    const text = readTextOrNull(join(this.root, chatLogPath(day)));
    const messages = text === null ? null : lastConversation(text);
    this.going = messages === null ? null : day;
    return messages ?? [];
  }

  /** An exchange ended: it goes into the log. Returns what the chat says the first time the log cannot be written, else null. */
  exchange(exchange: ChatExchange, browsing: boolean): string | null {
    return this.write(browsing, (text, day, time) => withExchange(text, day, time, exchange, this.going === day));
  }

  /** `/new`: a new section, so the conversation before it is not the one a new session goes on with. */
  restart(browsing: boolean): string | null {
    this.going = null;
    return this.write(browsing, withSection);
  }

  private write(browsing: boolean, next: (text: string | null, day: string, time: string) => string): string | null {
    if (browsing) return null;
    const date = this.now();
    const day = dayOf(date);
    const path = chatLogPath(day);
    const blocked = logBlocked(this.root, path);
    if (blocked !== null) return this.tell(blocked);
    try {
      // Nothing is read through a link out of the repository; the write checks it again, with the text it read.
      const problem = writeProblem(this.root, path, { under: ".keylang" });
      if (problem !== null) return this.tell(`розмову не записано: ${path}: ${problem}`);
      const text = existingText(join(this.root, path));
      safeWrite(this.root, path, next(text, day, timeOf(date)), { under: ".keylang", expect: text });
    } catch (error) {
      return this.tell(`розмову не записано: ${errorText(error)}`);
    }
    this.going = day;
    return null;
  }

  private tell(why: string): string | null {
    if (this.told) return null;
    this.told = true;
    return why;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shown(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}
