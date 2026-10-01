// Worker entry of `OperationWorker`: runs shared operations off the UI
// thread. Requests and replies are plain cloneable data; the callbacks and
// the AbortSignal stay on the session's side. A read-only operation — and a
// writing one before its commit — is cancelled by terminating this worker. A
// writing operation asks before its first file step (`commit`) and waits for
// the answer: `commit` goes ahead (or carries the session's refusal),
// `cancel` ends it with nothing written;
// `cancel` during the commit stops it between two file steps.

import { parentPort } from "node:worker_threads";
import { runOperation, type BatchStep, type CommitGate, type CommitPlan, type OperationRequest, type OperationResult } from "../operations.ts";

/** A message to the worker: run a request, let its commit go ahead, or cancel it. */
export type OperationCall = { type: "run"; operationId: number; request: OperationRequest } | { type: "commit"; operationId: number; refused?: string[] } | { type: "cancel"; operationId: number };

/** A reply of the worker: any number of progress notes, at most one commit request, then one result or one error. */
export type OperationReply =
  | { operationId: number; type: "progress"; text: string; step?: BatchStep }
  | { operationId: number; type: "commit"; plan?: CommitPlan }
  | { operationId: number; type: "result"; result: OperationResult }
  | { operationId: number; type: "error"; error: string };

const post = (reply: OperationReply): void => parentPort?.postMessage(reply);

/** The operations running here: their signal, and the answer their commit waits for. */
const running = new Map<number, { controller: AbortController; proceed: ((gate: CommitGate) => void) | null }>();

parentPort?.on("message", (call: OperationCall) => {
  const { operationId } = call;
  if (call.type !== "run") {
    const entry = running.get(operationId);
    if (!entry) return;
    if (call.type === "cancel") entry.controller.abort();
    // The session's refusal travels with `commit`: the operation reports it, nothing is written.
    entry.proceed?.(call.type === "commit" && call.refused ? { refused: call.refused } : undefined);
    entry.proceed = null;
    return;
  }
  const entry = { controller: new AbortController(), proceed: null as ((gate: CommitGate) => void) | null };
  running.set(operationId, entry);
  const beforeCommit = (plan?: CommitPlan): Promise<CommitGate> =>
    new Promise<CommitGate>((proceed) => {
      entry.proceed = proceed;
      post({ operationId, type: "commit", ...(plan ? { plan } : {}) });
    });
  runOperation(call.request, { signal: entry.controller.signal, beforeCommit, onProgress: ({ text, step }) => post({ operationId, type: "progress", text, ...(step ? { step } : {}) }) })
    .then(
      (result) => post({ operationId, type: "result", result }),
      (error: unknown) => post({ operationId, type: "error", error: error instanceof Error ? error.message : String(error) }),
    )
    .finally(() => running.delete(operationId));
});
