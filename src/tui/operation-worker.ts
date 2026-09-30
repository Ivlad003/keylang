// Worker entry of `OperationWorker`: runs shared operations off the UI
// thread. Requests and replies are plain cloneable data; the callbacks and
// the AbortSignal stay on the session's side. A read-only operation — and a
// writing one before its commit — is cancelled by terminating this worker. A
// writing operation asks before its first file step (`commit`) and waits for
// the answer: `commit` goes ahead, `cancel` ends it with nothing written;
// `cancel` during the commit stops it between two file steps.

import { parentPort } from "node:worker_threads";
import { runOperation, type OperationRequest, type OperationResult } from "../operations.ts";

/** A message to the worker: run a request, let its commit go ahead, or cancel it. */
export type OperationCall = { type: "run"; operationId: number; request: OperationRequest } | { type: "commit"; operationId: number } | { type: "cancel"; operationId: number };

/** A reply of the worker: any number of progress notes, at most one commit request, then one result or one error. */
export type OperationReply =
  | { operationId: number; type: "progress"; text: string }
  | { operationId: number; type: "commit" }
  | { operationId: number; type: "result"; result: OperationResult }
  | { operationId: number; type: "error"; error: string };

const post = (reply: OperationReply): void => parentPort?.postMessage(reply);

/** The operations running here: their signal, and the answer their commit waits for. */
const running = new Map<number, { controller: AbortController; proceed: (() => void) | null }>();

parentPort?.on("message", (call: OperationCall) => {
  const { operationId } = call;
  if (call.type !== "run") {
    const entry = running.get(operationId);
    if (!entry) return;
    if (call.type === "cancel") entry.controller.abort();
    entry.proceed?.();
    entry.proceed = null;
    return;
  }
  const entry = { controller: new AbortController(), proceed: null as (() => void) | null };
  running.set(operationId, entry);
  const beforeCommit = (): Promise<void> =>
    new Promise<void>((proceed) => {
      entry.proceed = proceed;
      post({ operationId, type: "commit" });
    });
  runOperation(call.request, { signal: entry.controller.signal, beforeCommit, onProgress: ({ text }) => post({ operationId, type: "progress", text }) })
    .then(
      (result) => post({ operationId, type: "result", result }),
      (error: unknown) => post({ operationId, type: "error", error: error instanceof Error ? error.message : String(error) }),
    )
    .finally(() => running.delete(operationId));
});
