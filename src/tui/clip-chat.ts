// What the clip answers in its chat (ADR 0021, .scratch/tui-clip/03–04, 06). A
// message that starts with `/` is a command, answered from the session or a
// shared operation without the model. Any other message goes to the model of
// `agent` as the session's one explicit operation, `assistant-reply` — an F6
// record with Cancel, the ghost paused meanwhile — with the open file, the
// ID under the cursor and the F4 pack as they are when it is sent. One
// request at a time: the eyes are ◔◔ until the answer lands in the
// conversation, and Esc cancels it. The answer's first `keylang path=` block
// becomes a proposal through the gate of MCP `apply_diff`; MERGE takes it or
// not. Without a model the commands work and free text says how to set one;
// nothing is asked. Every answer to a message ends an exchange, which goes
// into today's log of the conversation (`clip-memory.ts`); a cancelled
// request is no exchange.

import { join } from "node:path";
import { contextText, type ContextPack } from "../agent-context.ts";
import { selectedAgent } from "../agent-cli.ts";
import { specPath } from "../config.ts";
import { errorText } from "../diag.ts";
import type { FeatureReport } from "../feature-status.ts";
import { existingText } from "../files.ts";
import { featureSlugOf, featureSummary, gapLine, hintLine, type AssistantReplyPayload, type AssistantReplyRequest, type OperationRequest, type OperationResult } from "../operations.ts";
import { proposalProblem, writeProposal } from "../proposals.ts";
import { isDirty } from "./buffer.ts";
import { openQuestions, questionRows, questionsAnswer } from "./clip-questions.ts";
import { ChatLog } from "./clip-memory.ts";
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

/** The operation was cancelled, or ended without a result: nothing was asked, and the log keeps nothing of it. */
function cancelled(record: OperationRecord): boolean {
  return record.status === "cancelled" || record.result === null;
}

/** What an operation the chat started ended with: its text, `скасовано`, or the reasons it failed. */
function outcomeAnswer(record: OperationRecord, text: (result: OperationResult) => string | null): string {
  const result = record.result;
  if (cancelled(record) || result === null) return CANCELLED;
  return text(result) ?? `помилка: ${failure(result)}`;
}

/** What the chat says of a proposal it wrote. The log keeps its path alone (`**пропозиція:**`): its MERGE may be over by the time the log is read. */
function proposalWritten(path: string): string {
  return `пропозиція: ${path} · m — MERGE`;
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
  /** The person's message it answers: the log keeps them as one exchange. */
  said: string | null;
}

/**
 * How an answer ends its exchange in the log: the person's message it
 * answers (null: nothing goes into the log — a cancelled request, or no one
 * asked), the model that answered, the proposal written from it.
 */
interface Ending {
  said: string | null;
  agent?: string;
  proposal?: string;
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
  /** Today's conversation in `.keylang/chat/`. */
  private readonly log: ChatLog;
  /** The person's message `said` answers now; null outside it. An answer later carries its message itself. */
  private sent: string | null = null;

  constructor(host: ChatHost) {
    this.host = host;
    this.log = new ChatLog(host.state.root);
  }

  private get state(): State {
    return this.host.state;
  }

  /** The session starts: the history goes on with today's last conversation in the log. */
  restore(): void {
    this.state.clip.chat.messages = this.log.restore();
  }

  /** The person sent `text` (already in the history): a command runs, anything else goes to the model. */
  said(text: string): void {
    this.sent = text;
    try {
      if (text.startsWith("/")) return this.command(text.slice(1));
      this.ask();
    } finally {
      this.sent = null;
    }
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
      return this.answer(CANCELLED, { said: null });
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
    if (slug === null) return this.answer(`/feature <slug>: стадія й прогалини файла ${specPath(dir, "features/<slug>.md")}; без аргументу — відкритий файл фічі`);
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

  /** `/new`: a new conversation; the old one is gone from the window, and the log starts a section. */
  restart(): void {
    const chat = this.state.clip.chat;
    chat.messages = [];
    chat.scroll = 0;
    this.note(this.log.restart(this.browsing()));
  }

  /** `/help`: the commands and the keys. */
  help(): void {
    this.answer(helpAnswer());
  }

  /** A command's shared operation, as the session runs any: one at a time, after the save step when it reads dirty buffers. */
  private operation(action: string, request: OperationRequest, text: (result: OperationResult) => string | null): void {
    if (this.state.activeOperation !== null) return this.answer(BUSY);
    const said = this.sent;
    this.host.requestOperation(action, request, (record) => this.answer(outcomeAnswer(record, text), { said: cancelled(record) ? null : said }));
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
    const asked: Asked = { agent: analysis.config.agent, record: null, said: this.sent };
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
      questions: questionRows(openQuestions(state)),
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
      return this.answer(noModelAnswer(missing), { said: asked.said });
    }
    const record = this.host.startOperation(CLIP_REPLY, request, (done) => this.replied(asked, done));
    if (record === null) {
      this.stopWaiting();
      return this.answer(BUSY, { said: asked.said });
    }
    asked.record = record.id;
  }

  /** The operation ended: its reply, `скасовано`, or the model's error with its reason. Nothing was written. */
  private replied(asked: Asked, record: OperationRecord): void {
    if (this.asked === asked) this.stopWaiting();
    const result = record.result;
    if (cancelled(record) || result === null) return this.answer(CANCELLED, { said: null });
    if (result.kind !== "assistant-reply" || result.payload === null) return this.answer(`помилка моделі: ${failure(result)}`, { said: asked.said });
    const { agent, reply, proposal, dropped } = result.payload;
    const proposed = proposal === null ? null : this.propose(proposal);
    const notes = [...(proposed === null ? [] : [proposed]), ...(dropped.length > 0 ? [`відкинуто: ${dropped.join(", ")} — береться лише перший закритий блок keylang path=`] : [])];
    const written = proposal !== null && proposed === proposalWritten(proposal.path) ? { proposal: proposal.path } : {};
    this.answer([reply, ...notes].filter((line) => line !== "").join("\n"), { said: asked.said, agent, ...written });
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
    return proposalWritten(path);
  }

  private stopWaiting(): void {
    this.asked = null;
    this.state.clip.waiting = false;
  }

  /**
   * The clip's message ends an exchange: it joins the history, and the
   * history shows its end. The exchange goes into today's log; `ending`
   * names the message it answers — by default the one `said` answers now.
   */
  private answer(text: string, ending: Ending = { said: this.sent }): void {
    const chat = this.state.clip.chat;
    chat.messages.push({ role: "clip", text });
    chat.scroll = 0;
    const { said, agent = null, proposal = null } = ending;
    if (said === null) return;
    // The proposal goes in as its path: the line that points at MERGE is the session's.
    const clip = proposal === null ? text : text.split("\n").filter((line) => line !== proposalWritten(proposal)).join("\n");
    this.note(this.log.exchange({ you: said, clip, agent, proposal }, this.browsing()));
  }

  /** Why the log is not written, said once a session: the clip's message after the answer, and no exchange itself. */
  private note(why: string | null): void {
    if (why === null) return;
    const chat = this.state.clip.chat;
    chat.messages.push({ role: "clip", text: why });
    chat.scroll = 0;
  }

  /** Browse writes nothing: not the log either. */
  private browsing(): boolean {
    return this.state.config.kind === "missing-config";
  }
}
