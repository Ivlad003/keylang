// What more than one operation module takes: the envelope without a payload,
// paths relative to the root and the generated documents of an analysis, the
// hashes of the specs a result was computed from, and the steps of a model
// draft that ends in a proposal.

import { relative, resolve } from "node:path";
import { toPosix, type Config } from "../config.ts";
import { errorText } from "../diag.ts";
import { readTextOrNull } from "../files.ts";
import type { Document } from "../ir.ts";
import { PROPOSALS_DIR, proposalProblem, proposalWriteProblem, writeProposal, type ProposalBasis } from "../proposals.ts";
import type { LlmClient } from "../llm.ts";
import { sourceInputProblems, type SourceInputs } from "../map.ts";
import { writeProblem } from "../safe-write.ts";
import { sha256 } from "../snapshot.ts";
import type { CandidateBasis, CommitGate, OperationContext, OperationEnvelope, OperationRequest, OperationResult, OperationStatus } from "./types.ts";

/**
 * A result without a payload, for a failure outside the operation (a
 * transport that could not run it) or a cancellation.
 */
export function resultWithout(kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationResult {
  return empty(kind, status, exitCode, error);
}

/** Each kind's envelope: indexed with a union of kinds, the union of their envelopes (as `OperationResult`). */
type EnvelopeOf = { [K in OperationRequest["kind"]]: OperationEnvelope<K> };

/**
 * The envelope of `kind` without a payload and with nothing written; `error`
 * becomes its one message. TypeScript cannot carry a kind that is a union
 * into `OperationEnvelope<K>` per member, so the generic signature states it
 * and the implementation builds the one shape every kind shares.
 */
export function empty<K extends OperationRequest["kind"]>(kind: K, status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): EnvelopeOf[K];
export function empty(kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<OperationRequest["kind"]> {
  return { kind, status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** `path` as the caller typed it (relative to the root, or absolute): relative to the root, POSIX. */
export function rootRelative(root: string, path: string): string {
  return toPosix(relative(root, resolve(root, path)));
}

/** Whether the analysis knows a spec path as a generated document (the map): what `proposalProblem` asks. */
export function generatedIn(docs: readonly Document[]): (path: string) => boolean {
  return (path) => docs.some((doc) => doc.path === path && doc.generated !== null);
}

/** The hand-written specs the candidate was built from, as they are on disk now: a planned signature or a flow's `test` changed meanwhile makes it unfit. */
export function specHashes(root: string, docs: readonly Document[]): CandidateBasis["specs"] {
  return docs.filter((doc) => doc.generated === null).map((doc) => ({ path: doc.path, sha256: hashOrNull(readTextOrNull(resolve(root, doc.path))) }));
}

function hashOrNull(text: string | null): string | null {
  return text === null ? null : sha256(text);
}

/** `path: changed on disk while the candidate was computed` for each spec of the basis that is not the same now. */
export function specProblems(root: string, specs: CandidateBasis["specs"], subject = "the candidate"): string[] {
  return specs.filter((spec) => hashOrNull(readTextOrNull(resolve(root, spec.path))) !== spec.sha256).map((spec) => `${spec.path}: changed on disk while ${subject} was computed`);
}

/**
 * The model client of a model mode, read before anything is asked: none
 * configured, and `llm` fails as the CLI does (`<command> --mode llm: …`)
 * while `hybrid` drafts as algo, saying why. Algo: no client.
 */
export async function modelSetup(mode: "algo" | "llm" | "hybrid", config: Pick<Config, "agent" | "root">, command = "draft"): Promise<{ client: LlmClient | null; fallback: string | null } | { error: string }> {
  if (mode === "algo") return { client: null, fallback: null };
  const { llmClient } = await import("../llm.ts");
  const setup = llmClient(config.agent, { root: config.root });
  if (!("missing" in setup)) return { client: setup.client, fallback: null };
  if (mode === "llm") return { error: `${command} --mode llm: ${setup.missing}` };
  return { client: null, fallback: `${setup.missing}; drafting from the snapshot only (--mode algo)` };
}

/**
 * Why a proposal for the candidate's target may not even be drafted, or null
 * — checked before a model is asked: a target a proposal may not change (2,
 * as in the CLI), a store that breaks the write policy (2), a proposal
 * already waiting under `pending: refuse` (1, named in `refused`).
 */
export function proposalRefusal(root: string, candidate: { target: string; problem: string | null; pending: string | null }, pending: "refuse" | "replace" | undefined, command = "draft"): { exitCode: 1 | 2; error: string; refused: string[] } | null {
  const store = `${PROPOSALS_DIR}/${candidate.target}`;
  if (candidate.problem !== null) return { exitCode: 2, error: `${command}: ${candidate.target}: ${candidate.problem}`, refused: [] };
  const storeProblem = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true });
  if (storeProblem !== null) return { exitCode: 2, error: `${store}: ${storeProblem}`, refused: [] };
  if ((pending ?? "refuse") === "refuse" && candidate.pending !== null) {
    const waiting = `${store}: a proposal for ${candidate.target} is waiting; merge it (m) or remove it before a new draft`;
    return { exitCode: 1, error: waiting, refused: [waiting] };
  }
  return null;
}

/** What a drafted proposal is written from and against. */
interface ProposalCommit {
  root: string;
  specDir: string;
  generated: (path: string) => boolean;
  target: string;
  text: string;
  /** The target and the waiting proposal the text was built from. */
  expected: ProposalBasis;
  config: Config;
  /** keylang.json and the sources the draft was computed from. */
  inputs: SourceInputs;
}

/**
 * The commit of a drafted proposal: after `beforeCommit` (which may refuse)
 * the target, the waiting proposal, keylang.json and the sources must still
 * be the ones read, else it is refused and nothing is written; then the full
 * text is written atomically. `failed` with `writing` is an error of the
 * write itself.
 */
export async function commitProposal(commit: ProposalCommit, context: OperationContext): Promise<{ proposal: string } | { refused: string[] } | { failed: string; writing: boolean } | { cancelled: true }> {
  const { root, target, expected } = commit;
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: [target] });
  } catch (error) {
    return { failed: errorText(error), writing: false };
  }
  if (context.signal?.aborted) return { cancelled: true };
  if (gate && gate.refused.length > 0) return { refused: gate.refused };
  let problems: string[];
  try {
    const problem = proposalProblem(root, commit.specDir, target, commit.generated);
    const written = problem !== null ? `${target}: ${problem}` : proposalWriteProblem(root, target, expected);
    problems = [...(written === null ? [] : [written]), ...sourceInputProblems(commit.config, commit.inputs, "the draft")];
  } catch (error) {
    return { failed: errorText(error), writing: false };
  }
  if (problems.length > 0) return { refused: problems };
  const store = `${PROPOSALS_DIR}/${target}`;
  context.onProgress?.({ text: `writing ${store}` });
  try {
    writeProposal(root, target, commit.text, expected);
  } catch (error) {
    return { failed: errorText(error), writing: true };
  }
  return { proposal: store };
}
