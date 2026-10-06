// The clip's open questions (ADR 0021 п. 2, .scratch/tui-clip/05): the `- ?`
// lines of the open file, the gaps of the open feature file, and the fails
// the session's analyses added since the chat was last opened. Lines and
// gaps are a state; a new fail is an event the opening of the chat clears
// (spec П8). The counter next to the clip is the length of the list; the
// chat says the list when it opens and on `/questions`, and the model reads
// it with every message.

import type { Analysis } from "../analyze.ts";
import { walkFlow } from "../spec-ir.ts";
import type { Verdict } from "../verdict.ts";
import type { State } from "./state.ts";

/** One open question: where it is, and what it says after the place. */
export interface OpenQuestion {
  file: string;
  line: number;
  text: string;
}

/** A fail is told from another by its place and its message. */
function failKey(fail: Pick<Verdict, "file" | "line" | "message">): string {
  return `${fail.file}\0${fail.line}\0${fail.message}`;
}

function failsOf(analysis: Analysis): Verdict[] {
  return analysis.verdicts.filter((verdict) => verdict.verdict === "fail");
}

/**
 * The new fails once `next` replaced `previous`: those counted so far that
 * `next` still reports, then those it reports that `previous` did not. A fail
 * gone before anyone looked is no question; with no previous analysis (the
 * session's first) every fail was there before the session.
 */
export function newFailsAfter(counted: readonly Verdict[], previous: Analysis | null, next: Analysis): Verdict[] {
  const now = failsOf(next);
  const reported = new Set(now.map(failKey));
  const before = new Set((previous === null ? now : failsOf(previous)).map(failKey));
  const kept = counted.filter((fail) => reported.has(failKey(fail)));
  const seen = new Set(kept.map(failKey));
  for (const fail of now) {
    const key = failKey(fail);
    if (before.has(key) || seen.has(key)) continue;
    seen.add(key);
    kept.push(fail);
  }
  return kept;
}

/** The `- ?` lines of `path` as the analysis read it, unsaved edits included, in the file's order. */
function questionsIn(analysis: Analysis, path: string): OpenQuestion[] {
  const found: OpenQuestion[] = [];
  for (const flow of analysis.spec.flows) {
    if (flow.file !== path) continue;
    walkFlow(flow, (item) => {
      if (item.kind === "question") found.push({ file: path, line: item.span.start.line, text: `? ${item.question}` });
    });
  }
  return found;
}

const placeOf = (question: OpenQuestion): string => `${question.file}:${question.line}`;

/**
 * The open questions now, in the order the chat lists them: the open file's
 * `- ?` lines, the open feature's gaps as the status line has them (the
 * report of `keylang feature`, as of the last save), the new fails. A place
 * an earlier source names is not counted again: a question of a feature is
 * one of its gaps too, and a gap may be a fail. The feature's question gaps
 * give way to the lines themselves, which follow the buffer.
 */
export function openQuestions(state: Pick<State, "current" | "analysis" | "featureLine" | "clip">): OpenQuestion[] {
  const path = state.current;
  const lines = path === null || state.analysis === null ? [] : questionsIn(state.analysis, path);
  const feature = state.featureLine;
  const gaps = feature === null || feature.path !== path ? [] : feature.gaps.filter((gap) => gap.kind !== "question").map((gap) => ({ file: gap.file, line: gap.line, text: `${gap.kind} ${gap.id}: ${gap.reason}` }));
  const fails = state.clip.newFails.map((fail) => ({ file: fail.file, line: fail.line, text: `✗ ${fail.code ?? fail.criterion} ${fail.message}` }));
  const list: OpenQuestion[] = [];
  for (const source of [lines, gaps, fails]) {
    const named = new Set(list.map(placeOf));
    list.push(...source.filter((question) => !named.has(placeOf(question))));
  }
  return list;
}

/** One question as the chat and the model read it: `file:line` and its text. */
export function questionRow(question: OpenQuestion): string {
  return `${placeOf(question)} ${question.text}`;
}

/** What the clip says of the open questions: how many, and one row each; or that there are none. */
export function questionsAnswer(questions: readonly OpenQuestion[]): string {
  if (questions.length === 0) return "немає відкритих питань";
  return [`відкриті питання: ${questions.length}`, ...questions.map(questionRow)].join("\n");
}
