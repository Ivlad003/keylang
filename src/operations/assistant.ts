// The clip's reply (ADR 0021, .scratch/tui-clip/03): what the configured
// model answers in the TUI's chat. The prompt and the reading of the answer
// are pure functions of the request — the conversation (its newest 16 000
// characters, whole messages), the open file around the cursor and the ID
// under it, the F4 pack, the open feature's stage and gaps, the open
// questions. Nothing is written: the first `keylang path=<file>` block of
// the answer comes back as a candidate that the TUI gates and writes as a
// proposal (spec §4.5), so the operation has no commit step.

import { isAbsolute } from "node:path";
import { loadConfig, type Config } from "../config.ts";
import { errorText } from "../diag.ts";
import type { LlmRequest, LlmSetup } from "../llm.ts";
import { empty, rootRelative } from "./shared.ts";
import type { AssistantReplyPayload, AssistantReplyRequest, ChatTurn, OperationContext, OperationEnvelope, OperationMessage } from "./types.ts";

/** A short answer, or one spec file proposed whole. */
export const REPLY_TOKENS = 1500;
/** The newest messages up to this many characters (UTF-16 code units, as `length` counts) go to the model; older ones are left out whole. */
export const HISTORY_CHARS = 16_000;
/** The lines of the open file around the cursor the model reads. */
export const FILE_LINES = 400;

/**
 * What the clip is and may do (spec §4.3): short answers in the person's
 * language, about this repository only, no invented verdicts or edges, a
 * spec change as one block with the whole file, no code.
 */
export function assistantSystem(specDir: string): string {
  const dir = specDir === "" ? "the repository root" : `${specDir}/`;
  return [
    "You are the clip, the assistant inside keylang's terminal UI. keylang describes a repository's architecture in Markdown specifications (flows, rules, features) and checks them against a snapshot of its code; a person writes those specifications with you.",
    "Answer briefly, in the language the person writes in.",
    "Talk only about this repository: its specifications, its code snapshot and its code. Decline anything else in one sentence.",
    "Never invent a verdict, an edge or an id. What the context below does not show is unverified: say so, or say that you do not know.",
    `To change a specification, give one fenced block opened with \`\`\`\`keylang path=<file> (four backticks, or more: always longer than any run of backticks in the file, so the spec's own code blocks stay inside) and closed with the same fence, where <file> is a hand-written spec under ${dir} as a path from the repository root, holding the full new text of that file, never a diff. Give at most one such block: it becomes a proposal the person reviews hunk by hunk in MERGE, and nothing is written before that.`,
    "Do not write code: a coding agent (the harness) writes it from the specification.",
  ].join("\n");
}

/**
 * The newest messages whose texts take at most `budget` characters
 * together, oldest first, and how many older ones were left out. The last
 * one — the person's new message — is kept however long it is.
 */
export function recentTurns(history: readonly ChatTurn[], budget = HISTORY_CHARS): { turns: ChatTurn[]; dropped: number } {
  let used = 0;
  let from = history.length;
  while (from > 0) {
    const size = history[from - 1]!.text.length;
    if (from < history.length && used + size > budget) break;
    used += size;
    from--;
  }
  return { turns: history.slice(from), dropped: from };
}

/**
 * At most `count` lines of `text` around the 0-based `line`, the cursor's
 * line in their middle where the file allows; `first` and `last` are
 * 1-based and inclusive.
 */
export function fileWindow(text: string, line: number, count = FILE_LINES): { first: number; last: number; total: number; text: string } {
  const lines = text.split("\n");
  // A final line break ends the last line; it starts none.
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  const total = lines.length;
  const start = Math.max(0, Math.min(line - Math.floor(count / 2), total - count));
  const end = Math.min(total, start + count);
  return { first: start + 1, last: end, total, text: lines.slice(start, end).join("\n") };
}

/**
 * The request as the model reads it: the system prompt, and one prompt with
 * the open file around the cursor, the cursor's line and the ID under it,
 * the open feature, the open questions, the F4 pack and the conversation,
 * the person's new message last.
 */
export function assistantPrompt(request: AssistantReplyRequest, specDir: string): LlmRequest {
  const parts: string[] = [];
  const file = request.file;
  if (file === null) parts.push("No file is open.");
  else {
    const shown = fileWindow(file.text, file.line);
    const range = shown.first === 1 && shown.last === shown.total ? `${shown.total} line(s)` : `lines ${shown.first}–${shown.last} of ${shown.total}`;
    parts.push(`The open file ${file.path} (${range}, as the editor shows it, unsaved edits included):\n${fenced(shown.text)}`);
    parts.push(`The cursor is on line ${file.line + 1}: ${file.text.split("\n")[file.line] ?? ""}\nThe ID under the cursor: ${file.id ?? "none"}`);
  }
  if (request.feature !== null) parts.push(`The open feature: stage ${request.feature.stage}; its gaps:\n${listOf(request.feature.gaps)}`);
  if (request.questions.length > 0) parts.push(`The open questions:\n${listOf(request.questions)}`);
  if (request.context !== null && request.context !== "") parts.push(`What keylang shows the person around the cursor (the context panel):\n${request.context}`);
  const { turns, dropped } = recentTurns(request.history);
  const said = turns.map((turn) => `${turn.role === "you" ? "Person" : "Clip"}: ${turn.text}`).join("\n\n");
  parts.push(`The conversation, oldest first${dropped > 0 ? ` (${dropped} older message(s) left out)` : ""}. Answer the person's last message.\n\n${said}`);
  return { system: assistantSystem(specDir), prompt: parts.join("\n\n"), maxTokens: REPLY_TOKENS };
}

function listOf(lines: readonly string[]): string {
  return lines.length === 0 ? "none" : lines.map((line) => `- ${line}`).join("\n");
}

/** `text` in a fence longer than any run of backticks in it, so a spec's own code blocks stay inside. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${text}\n${fence}`;
}

/** A fence line: up to three spaces, three or more backticks or tildes, then the info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** The info string of a candidate block: `keylang path=<file>`, the path bare or quoted. */
const CANDIDATE = /^\s*keylang\s+path=(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/;

/**
 * The model's answer as the chat shows it and the candidate it proposes:
 * the first `keylang path=<file>` block the answer closes is the candidate,
 * its lines the file's full text. The answer's other such blocks are left
 * out by path, and so is one it never closes: an answer cut at the token
 * limit holds no whole file. Any other fenced block stays in the reply.
 * The prompt asks for a candidate fence longer than the file's own; for one
 * that is not, a block the file opens inside it (a fence with an info string)
 * takes the next closing fence (`candidateEnd`). The opening fence's indent
 * leaves the body's lines, as CommonMark has it.
 */
export function parseReply(answer: string): Pick<AssistantReplyPayload, "reply" | "proposal" | "dropped"> {
  const lines = answer.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  const dropped: string[] = [];
  let proposal: AssistantReplyPayload["proposal"] = null;
  for (let at = 0; at < lines.length; at++) {
    const open = FENCE.exec(lines[at]!);
    // A backtick fence's info string has no backtick (CommonMark): such a line is text.
    if (open === null || (open[1]![0] === "`" && open[2]!.includes("`"))) {
      kept.push(lines[at]!);
      continue;
    }
    const candidate = CANDIDATE.exec(open[2]!);
    let end = at + 1;
    if (candidate !== null) end = candidateEnd(lines, at + 1, open[1]!);
    else while (end < lines.length && !closes(lines[end]!, open[1]!)) end++;
    if (candidate === null) kept.push(...lines.slice(at, end + 1));
    else {
      const path = (candidate[1] ?? candidate[2] ?? candidate[3]!).replace(/^\.\//, "");
      if (end < lines.length && proposal === null) {
        const indent = /^ */.exec(lines[at]!)![0].length;
        const body = lines.slice(at + 1, end).map((line) => line.replace(new RegExp(`^ {0,${indent}}`), ""));
        proposal = { path, text: body.length === 0 ? "" : `${body.join("\n")}\n` };
      } else dropped.push(path);
    }
    at = end;
  }
  return { reply: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), proposal, dropped };
}

/**
 * The line that closes a candidate opened by `fence`, from `from` on, or
 * `lines.length`. A fence of the same character at least as long with an
 * info string opens a block of the file's own (CommonMark would close the
 * candidate at its end): the next fence that closes that block is its end,
 * not the candidate's. Shorter or other fences cannot close the candidate
 * and are text in it.
 */
function candidateEnd(lines: readonly string[], from: number, fence: string): number {
  let inner: string | null = null;
  for (let at = from; at < lines.length; at++) {
    const line = lines[at]!;
    if (inner !== null) {
      if (closes(line, inner)) inner = null;
      continue;
    }
    if (closes(line, fence)) return at;
    const open = FENCE.exec(line);
    if (open !== null && open[1]![0] === fence[0] && open[1]!.length >= fence.length && open[2]!.trim() !== "" && !(fence[0] === "`" && open[2]!.includes("`"))) inner = open[1]!;
  }
  return lines.length;
}

/** Whether `line` closes a block opened by `fence`: the same character, at least as many, nothing after. */
function closes(line: string, fence: string): boolean {
  const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return close !== null && close[1]![0] === fence[0] && close[1]!.length >= fence.length;
}

/**
 * Asks the model of `agent` once and reads its answer: the reply for the
 * chat and the candidate block, if any. Nothing is written. No model or an
 * unreadable keylang.json is 2 before any request; a provider error, a
 * timeout or an answer without text is 2 with the reason; Cancel is
 * cancelled, and the request is dropped with it.
 */
export async function runAssistantReply(request: AssistantReplyRequest, context: OperationContext): Promise<OperationEnvelope<"assistant-reply">> {
  const { root } = request;
  if (!isAbsolute(root)) return empty("assistant-reply", "failed", 2, "chat: root must be an absolute path");
  if (request.history.at(-1)?.role !== "you") return empty("assistant-reply", "failed", 2, "chat: the person's message is required");
  if (context.signal?.aborted) return empty("assistant-reply", "cancelled", null);
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (error) {
    return empty("assistant-reply", "failed", 2, errorText(error));
  }
  const { answeringAgent, llmClient, LlmCancelled } = await import("../llm.ts");
  let setup: LlmSetup;
  try {
    setup = llmClient(config.agent, { root });
  } catch (error) {
    return empty("assistant-reply", "failed", 2, `chat: ${errorText(error)}`);
  }
  if ("missing" in setup) return empty("assistant-reply", "failed", 2, `chat: ${setup.missing}`);
  const client = setup.client;
  context.onProgress?.({ text: `asking ${client.agent}` });
  let answer: string;
  let reported: string | null = null;
  try {
    answer = await client.complete(assistantPrompt(request, rootRelative(root, config.dir)), { ...(context.signal ? { signal: context.signal } : {}), onModel: (model) => (reported = model) });
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return empty("assistant-reply", "cancelled", null);
    return empty("assistant-reply", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("assistant-reply", "cancelled", null);
  const payload: AssistantReplyPayload = { agent: answeringAgent(client, reported), ...parseReply(answer) };
  return { ...empty("assistant-reply", "completed", 0), payload, messages: replyMessages(payload) };
}

/** The record's report: who answered, the candidate and what was left out. */
function replyMessages(payload: AssistantReplyPayload): OperationMessage[] {
  const messages: OperationMessage[] = [{ level: "info", text: `${payload.agent} replied; nothing was written` }];
  if (payload.proposal !== null) messages.push({ level: "info", text: `a block for ${payload.proposal.path}: the session gates it as MCP apply_diff does before writing a proposal` });
  if (payload.dropped.length > 0) messages.push({ level: "warning", text: `left out: ${payload.dropped.join(", ")}: only the first closed keylang path= block is taken` });
  return messages;
}
