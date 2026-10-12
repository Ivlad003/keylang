// «Студія» of `keylang web` (.scratch/studio): the diagram, what it becomes
// and the agent on one screen. Three requests of the page live here, apart
// from the HTTP plumbing of `src/tui/web.ts`:
//
// - the projection of the canvas: `keylang` — the spec texts the drawing
//   would propose (`runDiagramPropose` with `print`, nothing written), each
//   with the lines it adds; `ts` — the same texts parsed and compiled over
//   the other specs (an overlay SpecIR), then `projectTypes` for the IDs on
//   the canvas, so a planned type drawn a second ago is already an interface;
// - the chat: one `runAssistantReply` with the studio's context (the view,
//   the selected IDs, the view's spec, the draft's diff); a `keylang
//   path=<file>` block of the answer goes through the gates of the TUI's clip
//   and is written as a proposal under `.keylang/proposals/`;
// - the decision on a proposal: `acceptProposal` / `rejectProposal`.
//
// Place in the pipeline: an operation over one analysis (snapshot + SpecIR);
// it reads the specs and writes only proposals and, on accept, the spec the
// person accepted. Entry points: `studioProjection`, `runStudioChat`,
// `decideProposal`.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Analysis } from "../analyze.ts";
import { loadConfig } from "../config.ts";
import { errorText } from "../diag.ts";
import { parseEditorModel, type EditorModel } from "../diagram-proposal.ts";
import { existingText } from "../files.ts";
import { isJsonObject, isJsonString, type JsonValue } from "../json.ts";
import { diffLines } from "../line-diff.ts";
import { parse } from "../parser.ts";
import { acceptProposal, lineDiff, PROPOSALS_DIR, proposalProblem, rejectProposal, writeProposal } from "../proposals.ts";
import { compileSpec } from "../spec-ir.ts";
import { plannedIdsOf, projectTypes, type ProjectedItem } from "../ts-projection.ts";
import { runAssistantReply } from "./assistant.ts";
import { runDiagramPropose, type DiagramProposeResult, type ProposedHunk } from "./diagram-propose.ts";
import { generatedIn, rootRelative } from "./shared.ts";
import type { ChatTurn } from "./types.ts";

/** What the studio's operations use besides their request: the shared analysis, and cancellation for the chat. */
export interface StudioContext {
  analyze: () => Promise<Analysis>;
  signal?: AbortSignal;
}

/** The two projections of the canvas. */
export type ProjectionFormat = "keylang" | "ts";

/** One spec file of the keylang projection: its full text, and which of its lines the drawing adds. */
export interface ProjectionFile {
  path: string;
  /** Whether the drawing changes it (false: the view's own spec, shown as it is). */
  changed: boolean;
  newFile: boolean;
  text: string;
  hunks: ProposedHunk[];
  /** 1-based lines of `text` the drawing adds or rewrites. */
  added: number[];
}

/** One declaration of the TypeScript projection with its lines in the text (1-based, inclusive). */
export interface ProjectionItem extends ProjectedItem {
  from: number;
  to: number;
}

/** The answer of `POST /api/projection`: the status of the drawing's proposal, and the text of the chosen format. */
export type StudioProjection =
  | { format: "keylang"; status: DiagramProposeResult["status"]; error: string | null; files: ProjectionFile[]; notes: string[]; weakenings: DiagramProposeResult["weakenings"] }
  | { format: "ts"; status: DiagramProposeResult["status"]; error: string | null; text: string; items: ProjectionItem[]; notes: string[] };

/** A projection request: the canvas, the spec hash it was opened with, the format. */
export interface ProjectionRequest {
  root: string;
  model: JsonValue | undefined;
  specHash: string | null;
  format: ProjectionFormat;
}

/**
 * The projection of the canvas in one format; writes nothing. A drawing the
 * operation refuses (an invalid model, specs changed since it was opened)
 * comes back with that status and no text.
 */
export async function studioProjection(request: ProjectionRequest, context: StudioContext): Promise<StudioProjection> {
  // The view comes from the model itself: the projection is of what the canvas holds.
  const model = parseEditorModel(request.model);
  const view = isProblem(model) ? "" : model.view;
  const proposed = await runDiagramPropose({ root: request.root, view, model: request.model, specHash: request.specHash, print: true }, { analyze: context.analyze });
  const failed = proposed.status !== "printed" && proposed.status !== "nothing";

  if (request.format === "keylang") {
    if (failed) return { format: "keylang", status: proposed.status, error: proposed.error, files: [], notes: proposed.notes, weakenings: [] };
    const analysis = await context.analyze();

    return { format: "keylang", status: proposed.status, error: null, files: keylangFiles(request.root, analysis, view, proposed), notes: proposed.notes, weakenings: proposed.weakenings };
  }

  if (failed || isProblem(model)) return { format: "ts", status: proposed.status, error: proposed.error, text: "", items: [], notes: proposed.notes };
  const analysis = await context.analyze();
  // The overlay: the proposed texts in place of their files (or beside them, for new files), every other spec as the analysis read it.
  const texts = new Map(proposed.targets.filter((t) => t.target.endsWith(".md")).map((t) => [t.target, t.text]));
  const docs = [...analysis.docs.filter((doc) => !texts.has(doc.path)), ...[...texts].map(([path, text]) => parse(path, text))];
  const spec = compileSpec(docs).spec;
  // The IDs: every keylang ID on the canvas (a draft's without its `planned:` prefix), and the planned lines of the flow it draws.
  const ids = new Set(model.nodes.map((node) => node.id.replace(/^planned:/, "")).filter((id) => id !== ""));
  const flow = /^flow:(.+)$/.exec(view)?.[1];

  if (flow !== undefined) for (const id of plannedIdsOf(spec, [flow], rootRelative(request.root, analysis.config.dir)).ids) ids.add(id);
  const projection = projectTypes({ spec, snapshot: analysis.snapshot, ids: [...ids] });

  return { format: "ts", status: proposed.status, error: null, text: projection.text, items: placeItems(projection.text, projection.items), notes: proposed.notes };
}

/** Whether the model parse gave its reason instead of the model. */
function isProblem(value: EditorModel | string): value is string {
  return typeof value === "string";
}

/** The files of the keylang projection: each proposed target with its added lines, then the view's own flow file when the drawing leaves it as it is. */
function keylangFiles(root: string, analysis: Analysis, view: string, proposed: DiagramProposeResult): ProjectionFile[] {
  const files: ProjectionFile[] = proposed.targets.map((t) => ({ path: t.target, changed: true, newFile: t.newFile, text: t.text, hunks: t.hunks, added: addedLines(t.hunks) }));
  const flow = /^flow:(.+)$/.exec(view)?.[1];
  const own = flow === undefined ? undefined : analysis.spec.flows.find((f) => f.name === flow)?.file;

  // The view's spec is shown even unchanged: the projection pane is never empty for a written flow.
  if (own !== undefined && !files.some((f) => f.path === own)) {
    const text = existingText(join(root, own));

    if (text !== null) files.push({ path: own, changed: false, newFile: false, text, hunks: [], added: [] });
  }

  return files;
}

/**
 * The 1-based lines of the new text that the hunks put in. A hunk's `line`
 * is its first base line; every earlier hunk shifts the new text by what it
 * added minus what it removed.
 */
export function addedLines(hunks: readonly ProposedHunk[]): number[] {
  const lines: number[] = [];
  let shift = 0;

  for (const hunk of hunks) {
    const start = hunk.line + shift;

    for (let i = 0; i < hunk.added.length; i++) lines.push(start + i);
    shift += hunk.added.length - hunk.removed.length;
  }

  return lines;
}

/** Each item with the lines its text takes in the projection text, found in output order. */
function placeItems(text: string, items: readonly ProjectedItem[]): ProjectionItem[] {
  const placed: ProjectionItem[] = [];
  let from = 0;

  // Items appear in the text in their own order, so each search starts after the previous item.
  for (const item of items) {
    const at = text.indexOf(item.text, from);

    if (at === -1) continue;
    const first = text.slice(0, at).split("\n").length;
    const last = first + item.text.replace(/\n$/, "").split("\n").length - 1;
    placed.push({ ...item, from: first, to: last });
    from = at + item.text.length;
  }

  return placed;
}

/** A chat request of the studio: the conversation, the open view, the selected IDs and the canvas. */
export interface StudioChatRequest {
  root: string;
  history: ChatTurn[];
  view: string;
  selection: string[];
  /** The canvas (`currentModel()`); null: the chat is about the specs as they are. */
  model: JsonValue | null;
  specHash: string | null;
}

/** A proposal the chat wrote: where it waits, and what it changes. */
export interface StudioChatProposal {
  target: string;
  proposal: string;
  newFile: boolean;
  diff: string;
  hunks: ProposedHunk[];
}

/** What the chat answers: the reply, the proposal written (or why not), and the blocks left out. */
export interface StudioChatResult {
  status: "replied" | "no-model" | "invalid" | "failed" | "cancelled";
  error: string | null;
  reply: string;
  agent: string | null;
  proposal: StudioChatProposal | null;
  /** Why the model's block was not written as a proposal, or null. */
  refused: string | null;
  dropped: string[];
}

/** The largest draft diff the chat's context carries, in characters. */
const DRAFT_CHARS = 8000;

/** A chat answer without a reply: a status and its reason. */
function chatResult(status: StudioChatResult["status"], error: string | null): StudioChatResult {
  return { status, error, reply: "", agent: null, proposal: null, refused: null, dropped: [] };
}

/**
 * The conversation of a chat request (`[{role: "you"|"clip", text}]`, the
 * person's message last), or what is wrong with it.
 */
export function parseHistory(value: JsonValue | undefined): ChatTurn[] | string {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return "history: 1–500 messages [{role: \"you\"|\"clip\", text}]";
  const turns: ChatTurn[] = [];

  for (const [i, turn] of value.entries()) {
    if (!isJsonObject(turn) || (turn.role !== "you" && turn.role !== "clip") || !isJsonString(turn.text)) return `history[${i}]: {role: "you"|"clip", text}`;
    turns.push({ role: turn.role, text: turn.text });
  }

  if (turns.at(-1)!.role !== "you") return "history: the last message is the person's";

  return turns;
}

/**
 * One answer of the configured model in the studio. No model: `no-model`
 * with what to set up, before any request. The model's `keylang path=` block
 * is written as a proposal through the clip's gates: a spec (`.md`) the
 * proposal store may hold, none waiting for it, and the target as it was
 * when the model was asked (a file saved meanwhile is refused).
 */
export async function runStudioChat(request: StudioChatRequest, context: StudioContext): Promise<StudioChatResult> {
  const { root } = request;

  if (!isAbsolute(root)) return chatResult("invalid", "chat: root must be an absolute path");

  // The model first: without one there is nothing to ask, and the page says what to configure.
  // The client module loads lazily, as in `runAssistantReply`: the server starts without the SDK.
  const { llmClient } = await import("../llm.ts");

  try {
    const setup = llmClient(loadConfig(root).agent, { root });

    if ("missing" in setup) return chatResult("no-model", `chat: ${setup.missing}`);
  } catch (error) {
    return chatResult("failed", `chat: ${errorText(error)}`);
  }

  const analysis = await context.analyze();
  const specDir = rootRelative(root, analysis.config.dir);
  // The view's spec file, as the model reads it and as the proposal's basis.
  const flow = /^flow:(.+)$/.exec(request.view)?.[1];
  const path = flow === undefined ? undefined : analysis.spec.flows.find((f) => f.name === flow)?.file;
  const basisText = path === undefined ? null : existingText(join(root, path));
  const selected = request.selection[0] ?? null;
  const file = path === undefined || basisText === null ? null : { path, text: basisText, line: lineOf(basisText, selected), id: selected };
  const shown = await studioContext(request, context);
  const asked = await runAssistantReply({ kind: "assistant-reply", root, history: request.history, file, context: shown, feature: null, questions: [] }, context.signal ? { signal: context.signal } : {});

  if (asked.status === "cancelled") return chatResult("cancelled", null);

  if (asked.status !== "completed" || asked.payload === null) return chatResult("failed", asked.messages.find((m) => m.level === "error")?.text ?? `chat: ${asked.status}`);
  const { reply, proposal, dropped, agent } = asked.payload;
  const out: StudioChatResult = { status: "replied", error: null, reply, agent, proposal: null, refused: null, dropped };

  if (proposal === null) return out;
  // The candidate through the clip's gates, against the target the model read.
  const basis = proposal.path === path ? basisText : existingText(join(root, proposal.path));
  const refusal = proposalGate(root, specDir, proposal.path, generatedIn(analysis.docs));

  if (refusal !== null) return { ...out, refused: refusal };

  try {
    const written = writeProposal(root, proposal.path, proposal.text, { target: basis, proposal: null });
    const normal = (text: string): string[] => text.replace(/\r\n/g, "\n").split("\n");
    const hunks = diffLines(normal(basis ?? ""), normal(proposal.text)).map((h) => ({ line: h.baseStart + 1, removed: normal(basis ?? "").slice(h.baseStart, h.baseStart + h.baseCount), added: h.lines }));
    out.proposal = { target: proposal.path, proposal: written, newFile: basis === null, diff: lineDiff(basis ?? "", proposal.text), hunks };
  } catch (error) {
    out.refused = errorText(error);
  }

  return out;
}

/** Why the model's block may not become a proposal, or null: not a spec, a target no proposal may change, one already waiting. */
function proposalGate(root: string, specDir: string, path: string, generated: (path: string) => boolean): string | null {
  if (!path.endsWith(".md")) return `${path}: not a spec — the agent proposes only .md under ${specDir === "" ? "the repository root" : `${specDir}/`}; code is the harness's`;
  const problem = proposalProblem(root, specDir, path, generated);

  if (problem !== null) return `${path}: ${problem}`;

  if (existsSync(join(root, PROPOSALS_DIR, path))) return `${path}: a proposal for it is already waiting — accept or reject it first`;

  return null;
}

/** The 0-based line of the first mention of `id` in `text`, or 0. */
function lineOf(text: string, id: string | null): number {
  if (id === null || id === "") return 0;
  const bare = id.replace(/^planned:/, "");
  const at = text.split("\n").findIndex((line) => line.includes(bare));

  return Math.max(0, at);
}

/** What the studio shows the person, for the model: the view, the selection, and the draft the canvas holds beyond the specs. */
async function studioContext(request: StudioChatRequest, context: StudioContext): Promise<string> {
  const parts = [`The person is in keylang's studio: a diagram canvas, its projection to keylang specs and TypeScript, and this chat. The open view: ${request.view === "" ? "an empty canvas" : `\`${request.view}\``}.`];
  parts.push(request.selection.length === 0 ? "Nothing is selected on the canvas." : `Selected on the canvas: ${request.selection.map((id) => `\`${id}\``).join(", ")}.`);

  if (request.model === null) return parts.join("\n");
  // The draft: what the drawing would change in the specs, as diffs (the projection the person sees).
  const projection = await studioProjection({ root: request.root, model: request.model, specHash: request.specHash, format: "keylang" }, context);

  if (projection.format === "keylang") {
    const changed = projection.files.filter((f) => f.changed);
    const diff = changed.map((f) => `${f.path}${f.newFile ? " (new file)" : ""}\n${f.hunks.map((h) => [`@@ line ${h.line} @@`, ...h.removed.map((l) => `-${l}`), ...h.added.map((l) => `+${l}`)].join("\n")).join("\n")}`).join("\n\n");

    if (projection.error !== null) parts.push(`The canvas cannot be projected now: ${projection.error}`);
    else if (diff === "") parts.push("The canvas says nothing the specs do not already say.");
    else parts.push(`The canvas draws more than the specs say; not proposed yet, this is what it would change:\n${diff.length > DRAFT_CHARS ? `${diff.slice(0, DRAFT_CHARS)}\n… (cut)` : diff}`);
  }

  return parts.join("\n");
}

/** What a decision on a proposal did, for the page. */
export type ProposalDecision = { status: "none" | "refused" | "written" | "unchanged" | "removed"; error: string | null; kept: string | null };

/** «Прийняти» / «Відхилити» of the studio: the proposal for `target` merged whole, or removed. */
export function decideProposal(root: string, target: string, action: "accept" | "reject"): ProposalDecision {
  const specDir = rootRelative(root, loadConfig(root).dir);

  if (action === "reject") {
    const done = rejectProposal(root, specDir, target);

    return done.state === "refused" ? { status: "refused", error: done.reason, kept: null } : { status: done.state, error: null, kept: null };
  }

  const done = acceptProposal(root, specDir, target);

  if (done.state === "none") return { status: "none", error: null, kept: null };

  if (done.state === "refused") return { status: "refused", error: done.reason, kept: null };

  return { status: done.state, error: null, kept: done.kept };
}
