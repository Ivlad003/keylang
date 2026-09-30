// Worker entry of `OperationWorker`: runs shared operations off the UI
// thread. Requests and replies are plain cloneable data; the callbacks and
// the AbortSignal stay on the session's side. Cancelling a read-only
// operation terminates this worker, so no cancel message is needed here.

import { parentPort } from "node:worker_threads";
import { runOperation, type OperationRequest, type OperationResult } from "../operations.ts";

/** One request to the worker. */
export interface OperationCall {
  operationId: number;
  request: OperationRequest;
}

/** A reply of the worker: any number of progress notes, then one result or one error. */
export type OperationReply =
  | { operationId: number; type: "progress"; text: string }
  | { operationId: number; type: "result"; result: OperationResult }
  | { operationId: number; type: "error"; error: string };

const post = (reply: OperationReply): void => parentPort?.postMessage(reply);

parentPort?.on("message", ({ operationId, request }: OperationCall) => {
  runOperation(request, { onProgress: ({ text }) => post({ operationId, type: "progress", text }) }).then(
    (result) => post({ operationId, type: "result", result }),
    (error: unknown) => post({ operationId, type: "error", error: error instanceof Error ? error.message : String(error) }),
  );
});
