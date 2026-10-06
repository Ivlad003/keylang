// What the clip answers in its chat (ADR 0021, .scratch/tui-clip/03–04). A
// message that starts with `/` is a command, answered from the session or a
// shared operation without the model. Any other message goes to the model of
// `agent` as the session's one explicit operation, `assistant-reply` — an F6
// record with Cancel, the ghost paused meanwhile — with the open file, the
// ID under the cursor and the F4 pack as they are when it is sent. One
// request at a time: the eyes are ◔◔ until the answer lands in the
// conversation, and Esc cancels it. The answer's first `keylang path=` block
// becomes a proposal through the gate of MCP `apply_diff`; MERGE takes it or
// not. Without a model the commands work and free text says how to set one;
// nothing is asked.

import { join } from "node:path";
import { contextText, type ContextPack } from "../agent-context.ts";
import { selectedAgent } from "../agent-cli.ts";
import { errorText } from "../diag.ts";
import type { FeatureReport } from "../feature-status.ts";
import { existingText } from "../files.ts";
import { featureSlugOf, featureSummary, gapLine, hintLine, type AssistantReplyPayload, type AssistantReplyRequest, type OperationRequest, type OperationResult } from "../operations.ts";
import { proposalProblem, writeProposal } from "../proposals.ts";
import { isDirty } from "./buffer.ts";
import { openQuestions, questionRow, questionsAnswer } from "./clip-questions.ts";
import { totals } from "./evidence.ts";
import { findingRow, findingsOf } from "./findings.ts";
import type { Buffer, OperationRecord, State } from "./state.ts";

/** The record action of the clip's request to the model: F6 names it, and its answer goes back to the chat. */
export const CLIP_REPLY = "clip-reply";

/** What the chat needs from the session: what the person sees, and the session's one explicit operation. */
export interface ChatHost {
  readonly state: State;
  /** The buffer of the open file, or null. */
  buffer(): Buffer | null;
  /** The ID under the cursor, or null. */
  idAtCursor(): string | null;
  /** What the model sees, as the context panel (F4) shows it now. */
  contextPack(): ContextPack | null;
  /** Starts `request` as the session's operation at once; `then` hears its record when it ends. Null: not started, another one runs. */
  startOperation(action: string, request: OperationRequest, then: (record: OperationRecord) => void): OperationRecord | null;
  /** Starts `request` after the save step when it reads dirty buffers; `then` hears its record when it ends, and never when the step is left. */
  requestOperation(action: string, request: OperationRequest, then: (record: OperationRecord) => void): void;
  /** Cancels the session's running operation. */
  cancelOperation(): void;
  /** Async work the frame follows (`idle()` waits for it). */
  track(work: Promise<void>): void;
  /** The spec directory relative to the root, POSIX: the only place a proposal from the chat may change. */
  proposalDir(): string;
  /** The analysis knows `path` as a generated document. */
  generatedDoc(path: string): boolean;
  /** Something waits at `.keylang/proposals/<path>`. */
  proposalWaiting(path: string): boolean;
  /** Lists the proposals again: the status line counts them (`≈ N proposal(s): m`). */
  rescanProposals(): void;
}

/** A command of the chat: answered without the model. */
interface ChatCommand {
  name: string;
  /** What it takes, as `/help` shows it. */
  args: string;
  /** What it does, as `/help` shows it. */
  about: string;
  /** Named in the answer to free text without a model: what still works then. */
  offline: boolean;
  run(chat: ClipChat, arg: string): void;
}

/** The commands in `/help` order: a new one is one more row. */
const COMMANDS: readonly ChatCommand[] = [
  { name: "explain", args: "<код|ID>", about: "те саме, що keylang explain, офлайн; без аргументу — ID під курсором", offline: true, run: (chat, arg) => chat.explain(arg) },
  { name: "feature", args: "<slug>", about: "стадія й прогалини фічі, як keylang feature; без аргументу — відкритий файл фічі", offline: true, run: (chat, arg) => chat.feature(arg) },
  { name: "check", args: "", about: "підсумок ✗ ◌ ✓ сесії й перші fail з позиціями", offline: true, run: (chat) => chat.check() },
  { name: "questions", args: "", about: "відкриті питання з позиціями: рядки - ? відкритого файла, прогалини фічі, нові fail", offline: true, run: (chat) => chat.questions() },
  { name: "new", args: "", about: "нова розмова", offline: false, run: (chat) => chat.restart() },
  { name: "help", args: "", about: "команди й клавіші чату", offline: false, run: (chat) => chat.help() },
];

/** The answer to a message sent while another operation runs: nothing is asked. */
const BUSY = "вже працює інша операція: дочекайтеся її кінця або скасуйте її (x у F6), тоді спитайте знову; запиту не було";
/** The answer to a request that was cancelled: nothing was asked or written. */
const CANCELLED = "скасовано";
/** How many fails `/check` names. */
const CHECK_FAILS = 5;

/** The answer to free text without a model (spec §4.3); `reason` says what is missing when an agent is set. */
export function noModelAnswer(reason: string | null): string {
  const offline = COMMANDS.filter((command) => command.offline).map((command) => `/${command.name}`);
  return `немає моделі: ${reason ?? "задайте `agent` у keylang.json або `KEYLANG_AGENT`"}; без неї працюють ${offline.join(", ")}`;
}

/** The commands as `/help` and an unknown command list them. */
function commandRows(): string[] {
  return COMMANDS.map((command) => `/${command.name}${command.args === "" ? "" : ` ${command.args}`} — ${command.about}`);
}

/** `/help`: the commands and the chat's keys. */
export function helpAnswer(): string {
  return ["команди, без моделі:", ...commandRows(), "клавіші: Enter — надіслати · Esc — згорнути, а поки скрепка думає — скасувати · PgUp/PgDn і коліщатко — історія · Alt+стрілки — рух · Alt+Shift+стрілки — розмір · F7 — фокус"].join("\n");
}

/** `/check`: the session's `✗ ◌ ✓` as the status line counts them, and its first fails with their positions. */
export function checkAnswer(state: Pick<State, "analysis" | "updating" | "outdated" | "error">): string {
  const analysis = state.analysis;
  if (analysis === null) return "аналізу ще немає: він триває, або F5 запускає його";
  const count = totals(analysis);
  const stale = state.updating ? " · аналіз оновлюється, це попередній" : state.outdated || state.error !== null ? " · застарілий: F5 аналізує знову" : "";
  const fails = findingsOf(analysis).filter((result) => result.verdict === "fail");
  const more = fails.length > CHECK_FAILS ? [`… ще ${fails.length - CHECK_FAILS}: F6 — Current analysis`] : [];
  return [`✗ ${count.fail}  ◌ ${count.unverified}  ✓ ${count.ok}${stale}`, ...fails.slice(0, CHECK_FAILS).map((result) => `✗ ${findingRow(result)}`), ...more].join("\n");
}

/** `/feature`: what `keylang feature` prints — the gaps and hints, then its closing line. */
function featureAnswer(report: FeatureReport): string {
  return [...report.gaps.map(gapLine), ...report.hints.map(hintLine), featureSummary(report)].join("\n");
}

/** What an operation the chat started ended with: its text, `скасовано`, or the reasons it failed. */
function outcomeAnswer(record: OperationRecord, text: (result: OperationResult) => string | null): string {
  const result = record.result;
  if (record.status === "cancelled" || result === null) return CANCELLED;
  return text(result) ?? `помилка: ${failure(result)}`;
}

/** Why an operation failed, as its messages say. */
function failure(result: OperationResult): string {
  const errors = result.messages.filter((message) => message.level === "error").map((message) => message.text);
  return errors.length > 0 ? errors.join("; ") : `${result.status}${result.exitCode === null ? "" : `, code ${result.exitCode}`}`;
}

/** The model's request in flight: the agent it was sent with, and its record once it started. */
interface Asked {
  agent: string | null;
  record: number | null;
}

/**
 * The chat's answers: a command, or the model's reply as the session's
 * `assistant-reply` operation. The conversation is `state.clip.chat`; the
 * eyes follow `state.clip.waiting`. Every answer ends in `answer`.
 */
export class ClipChat {
  private readonly host: ChatHost;
  /** The request to the model being looked up or answered, or null. */
  private asked: Asked | null = null;

  constructor(host: ChatHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  /** The person sent `text` (already in the history): a command runs, anything else goes to the model. */
  said(text: string): void {
    if (text.startsWith("/")) return this.command(text.slice(1));
    this.ask();
  }

  /**
   * The person opened the chat or gave it the focus (a click on the clip,
   * F7): with open questions the clip lists them, unless that list is its
   * last message already, and asks the model nothing. The new fails are told
   * then and count no more (spec §4.6).
   */
  opened(): void {
    const questions = openQuestions(this.state);
    this.state.clip.newFails = [];
    if (questions.length === 0) return;
    const chat = this.state.clip.chat;
    const text = questionsAnswer(questions);
    const last = chat.messages.at(-1);
    if (last?.role === "clip" && last.text === text) return;
    // No message of the person's is answered: the clip's word starts no exchange and ends none.
    chat.messages.push({ role: "clip", text });
    chat.scroll = 0;
  }

  /** Esc while the model answers: the request is cancelled, nothing is written, and the history says `скасовано`. */
  cancel(): void {
    const asked = this.asked;
    if (asked === null) return;
    if (asked.record === null) {
      // The model is still being looked up: nothing was asked.
      this.stopWaiting();
      return this.answer(CANCELLED);
    }
    // The operation's record ends as cancelled, and `replied` says so.
    if (this.state.activeOperation === asked.record) this.host.cancelOperation();
  }

  /** The session ends: a request still being looked up is never started. */
  close(): void {
    this.stopWaiting();
  }

  // ---------- commands ----------

  private command(line: string): void {
    const [, word = "", rest = ""] = /^(\S*)\s*([\s\S]*)$/.exec(line) ?? [];
    const name = word.toLowerCase();
    const command = COMMANDS.find((candidate) => candidate.name === name);
    if (command === undefined) return this.answer([`невідома команда /${name}; команди:`, ...commandRows()].join("\n"));
    command.run(this, rest.trim());
  }

  /** `/explain <code|ID>`: the offline `explain` operation, its text as `keylang explain` prints it. */
  explain(arg: string): void {
    const subject = arg !== "" ? arg : this.host.idAtCursor();
    if (subject === null) return this.answer("/explain <код|ID>: довідка коду діагностики (K105) чи зведення ID; без аргументу — ID під курсором");
    this.operation("explain", { kind: "explain", root: this.state.root, subject }, (result) => (result.kind === "explain" && result.payload !== null ? result.payload.text.trimEnd() : null));
  }

  /** `/feature <slug>`: the `feature` operation, its gaps and stage as `keylang feature` prints them. */
  feature(arg: string): void {
    const dir = this.state.analysis?.config.dir ?? "keylang";
    const slug = arg !== "" ? arg : this.state.current === null ? null : featureSlugOf(this.state.current, dir);
    if (slug === null) return this.answer(`/feature <slug>: стадія й прогалини файла ${dir}/features/<slug>.md; без аргументу — відкритий файл фічі`);
    this.operation("feature", { kind: "feature", root: this.state.root, slug }, (result) => (result.kind === "feature" && result.payload !== null ? featureAnswer(result.payload.report) : null));
  }

  /** `/check`: the session's analysis as it is; nothing runs. */
  check(): void {
    this.answer(checkAnswer(this.state));
  }

  /** `/questions`: the open questions with their places, the list the clip says when its chat opens. */
  questions(): void {
    this.answer(questionsAnswer(openQuestions(this.state)));
  }

  /** `/new`: a new conversation; the old one is gone from the window. */
  restart(): void {
    const chat = this.state.clip.chat;
    chat.messages = [];
    chat.scroll = 0;
  }

  /** `/help`: the commands and the keys. */
  help(): void {
    this.answer(helpAnswer());
  }

  /** A command's shared operation, as the session runs any: one at a time, after the save step when it reads dirty buffers. */
  private operation(action: string, request: OperationRequest, text: (result: OperationResult) => string | null): void {
    if (this.state.activeOperation !== null) return this.answer(BUSY);
    this.host.requestOperation(action, request, (record) => this.answer(outcomeAnswer(record, text)));
  }

  // ---------- the model ----------

  /**
   * Free text: the model's reply as the session's `assistant-reply`
   * operation. Without an analysis, a model or a free slot for the
   * operation it answers at once and asks nothing.
   */
  private ask(): void {
    const analysis = this.state.analysis;
    if (analysis === null) return this.answer("аналіз ще триває: спитайте, коли він закінчиться");
    if (selectedAgent(analysis.config.agent) === null) return this.answer(noModelAnswer(null));
    if (this.state.activeOperation !== null) return this.answer(BUSY);
    const asked: Asked = { agent: analysis.config.agent, record: null };
    this.asked = asked;
    this.state.clip.waiting = true;
    this.host.track(this.start(asked, this.request()));
  }

  /**
   * What the model reads, frozen when the message is sent: the conversation,
   * the open buffer with the cursor's line and the ID under it, the F4 pack
   * without the buffer it already shows, the open feature's stage and gaps
   * as the status line has them, and the open questions the clip counts.
   */
  private request(): AssistantReplyRequest {
    const state = this.state;
    const buffer = this.host.buffer();
    const pack = this.host.contextPack();
    const feature = state.featureLine;
    return {
      kind: "assistant-reply",
      root: state.root,
      history: state.clip.chat.messages.map(({ role, text }) => ({ role, text })),
      file: buffer === null ? null : { path: buffer.path, text: buffer.text, line: state.cursor.line, id: this.host.idAtCursor() },
      context: pack === null ? null : contextText({ ...pack, items: pack.items.filter((item) => item.kind !== "buffer") }),
      feature: feature !== null && buffer !== null && feature.path === buffer.path ? { stage: feature.stage, gaps: feature.gaps.map(gapLine) } : null,
      questions: openQuestions(state).map(questionRow),
    };
  }

  /** The model's client is looked up off the key path (as `Ctrl+Space` does); then the operation starts, unless Esc came first. */
  private async start(asked: Asked, request: AssistantReplyRequest): Promise<void> {
    let missing: string | null;
    try {
      const { llmClient } = await import("../llm.ts");
      const setup = llmClient(asked.agent, { root: request.root });
      missing = "missing" in setup ? setup.missing : null;
    } catch (error) {
      missing = errorText(error);
    }
    if (this.asked !== asked) return;
    if (missing !== null) {
      this.stopWaiting();
      return this.answer(noModelAnswer(missing));
    }
    const record = this.host.startOperation(CLIP_REPLY, request, (done) => this.replied(asked, done));
    if (record === null) {
      this.stopWaiting();
      return this.answer(BUSY);
    }
    asked.record = record.id;
  }

  /** The operation ended: its reply, `скасовано`, or the model's error with its reason. Nothing was written. */
  private replied(asked: Asked, record: OperationRecord): void {
    if (this.asked === asked) this.stopWaiting();
    const result = record.result;
    if (record.status === "cancelled" || result === null) return this.answer(CANCELLED);
    if (result.kind !== "assistant-reply" || result.payload === null) return this.answer(`помилка моделі: ${failure(result)}`);
    const { reply, proposal, dropped } = result.payload;
    const notes = [...(proposal === null ? [] : [this.propose(proposal)]), ...(dropped.length > 0 ? [`відкинуто: ${dropped.join(", ")} — береться лише перший закритий блок keylang path=`] : [])];
    this.answer([reply, ...notes].filter((line) => line !== "").join("\n"));
  }

  /**
   * The model's block as a proposal, by the gate of MCP `apply_diff`
   * (`proposalProblem` with the analysis's generated documents) and the
   * refusals before it: Browse writes nothing, code is the harness's, a
   * target with unsaved edits would come back as hunks reverting them, and a
   * proposal waiting for it is never covered. Only `.keylang/proposals/<p>`
   * is written; the file itself changes in MERGE on `w`. Returns the chat's
   * line about it.
   */
  private propose({ path, text }: NonNullable<AssistantReplyPayload["proposal"]>): string {
    const state = this.state;
    const refused = (why: string): string => `пропозицію для ${path} не записано: ${why}`;
    if (state.config.kind === "missing-config") return refused("режим перегляду нічого не пише; keylang init створює keylang.json");
    const dir = this.host.proposalDir();
    if (!path.endsWith(".md")) return refused(`це не специфікація: код пише харнес, скрепка пропонує лише .md під ${dir === "" ? "коренем репозиторію" : `${dir}/`}`);
    try {
      const problem = proposalProblem(state.root, dir, path, (candidate) => this.host.generatedDoc(candidate));
      if (problem !== null) return refused(problem);
      const buffer = state.buffers.get(path);
      if (buffer !== undefined && isDirty(buffer)) return refused("файл має незбережені правки: збережіть (Ctrl+S) чи відкотіть їх і спитайте знову");
      if (this.host.proposalWaiting(path)) return refused("для нього вже чекає пропозиція: m — MERGE, потім спитайте знову");
      // Against the target as it is now and no proposal: one that appears meanwhile is never overwritten.
      writeProposal(state.root, path, text, { target: existingText(join(state.root, path)), proposal: null });
    } catch (error) {
      return refused(errorText(error));
    }
    this.host.rescanProposals();
    return `пропозиція: ${path} · m — MERGE`;
  }

  private stopWaiting(): void {
    this.asked = null;
    this.state.clip.waiting = false;
  }

  /** The clip's message ends an exchange: it joins the history, and the history shows its end. */
  private answer(text: string): void {
    const chat = this.state.clip.chat;
    chat.messages.push({ role: "clip", text });
    chat.scroll = 0;
  }
}
