// Snapshot generation off the UI thread. One long-lived worker builds the
// map (tree-sitter extraction, graph, render); the caller parses specs and
// assesses on its own thread, which is fast. The worker is referenced only
// while a request is pending, so an idle TUI does not keep the process up.
// If the worker cannot start, generation falls back to the calling thread.
//
// `OperationWorker` runs the session's explicit operations (feature,
// map-check, map) in a worker of their own, with no such fallback: a worker
// that cannot start or dies is a failed result with code 2, and the next
// request starts a new one.

import { Worker } from "node:worker_threads";
import type { Config } from "../config.ts";
import { generateMap, type MapResult } from "../map.ts";
import { resultWithout, type CommitGate, type OperationContext, type OperationRequest, type OperationResult } from "../operations.ts";
import type { OperationCall, OperationReply } from "./operation-worker.ts";

interface Reply {
  id: number;
  result?: MapResult;
  error?: string;
}

export class SnapshotWorker {
  private worker: Worker | null = null;
  private failed = false;
  private next = 0;
  private readonly waiting = new Map<number, { resolve: (result: MapResult) => void; reject: (error: Error) => void }>();

  /** `generateMap` for `analyze({ generate })`; the fact cache is only read. */
  readonly generate = (config: Config, options: { overlay: ReadonlyMap<string, string> }): Promise<MapResult> => {
    const worker = this.start();
    if (!worker) return generateMap(config, { overlay: options.overlay });
    const id = ++this.next;
    return new Promise<MapResult>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      worker.ref();
      worker.postMessage({ id, config, overlay: [...options.overlay] });
    });
  };

  close(): void {
    void this.worker?.terminate();
    this.worker = null;
  }

  private start(): Worker | null {
    if (this.worker || this.failed) return this.worker;
    // Development runs the TypeScript sources; the package runs dist/*.js. Both
    // names are literals, so the map has the edge to the worker module.
    const url = new URL(import.meta.url.endsWith(".ts") ? "./analysis-worker.ts" : "./analysis-worker.js", import.meta.url);
    try {
      const worker = new Worker(url);
      worker.unref();
      worker.on("message", (reply: Reply) => {
        const pending = this.waiting.get(reply.id);
        if (!pending) return;
        this.waiting.delete(reply.id);
        if (this.waiting.size === 0) worker.unref();
        if (reply.result) pending.resolve(reply.result);
        else pending.reject(new Error(reply.error ?? "snapshot worker failed"));
      });
      worker.on("error", (error) => this.fail(error));
      worker.on("exit", (code) => {
        if (this.worker === worker && code !== 0) this.fail(new Error(`snapshot worker exited with code ${code}`));
      });
      this.worker = worker;
      return worker;
    } catch {
      this.failed = true;
      return null;
    }
  }

  private fail(error: Error): void {
    this.failed = true;
    this.worker = null;
    for (const pending of this.waiting.values()) pending.reject(error);
    this.waiting.clear();
  }
}

interface Pending {
  kind: OperationRequest["kind"];
  resolve: (result: OperationResult) => void;
  onProgress: OperationContext["onProgress"];
  beforeCommit: OperationContext["beforeCommit"];
  signal: AbortSignal | undefined;
  /**
   * The worker was let through to its file steps. Until then nothing is
   * written and cancelling may terminate the worker; from then on it may
   * not — cancellation is a message, and the result lists what was written.
   */
  committing: boolean;
  /** Removes the abort listener: a settled request keeps no reference to its signal. */
  release: () => void;
}

/**
 * Runs shared operations in a worker thread. Every request settles exactly
 * once — with the worker's result, a failure (code 2) when the worker cannot
 * start or dies, or `cancelled` (exit code null) on abort or `close()` — and
 * a late message for a settled request is dropped. The worker is referenced
 * only while a request is pending.
 */
export class OperationWorker {
  private worker: Worker | null = null;
  private next = 0;
  private closed = false;
  private readonly pending = new Map<number, Pending>();
  private readonly entry: URL;
  private readonly workerData: unknown;

  /** `entry` and `workerData` replace the worker module (tests); default: `operation-worker`. */
  constructor(options: { entry?: URL; workerData?: unknown } = {}) {
    // Development runs the TypeScript sources; the package runs dist/*.js. Both
    // names are literals, so the map has the edge to the worker module.
    this.entry = options.entry ?? new URL(import.meta.url.endsWith(".ts") ? "./operation-worker.ts" : "./operation-worker.js", import.meta.url);
    this.workerData = options.workerData;
  }

  /** An `OperationRunner`: the request goes to the worker as cloneable data; progress and the signal stay here. */
  readonly run = (request: OperationRequest, context: OperationContext = {}): Promise<OperationResult> => {
    if (this.closed) return Promise.resolve(resultWithout(request.kind, "failed", 2, "the session is closed"));
    if (context.signal?.aborted) return Promise.resolve(resultWithout(request.kind, "cancelled", null));
    let worker: Worker;
    try {
      worker = this.start();
    } catch (error) {
      return Promise.resolve(resultWithout(request.kind, "failed", 2, `the operation worker did not start: ${messageOf(error)}`));
    }
    const operationId = ++this.next;
    return new Promise<OperationResult>((resolve) => {
      const signal = context.signal;
      const onAbort = (): void => this.cancel(operationId);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(operationId, {
        kind: request.kind,
        resolve,
        onProgress: context.onProgress,
        beforeCommit: context.beforeCommit,
        signal,
        committing: false,
        release: () => signal?.removeEventListener("abort", onAbort),
      });
      worker.ref();
      try {
        worker.postMessage({ type: "run", operationId, request } satisfies OperationCall);
      } catch (error) {
        this.settle(operationId, resultWithout(request.kind, "failed", 2, `the operation could not be sent to the worker: ${messageOf(error)}`));
      }
    });
  };

  /**
   * Ends the worker; every pending request settles as cancelled. A commit
   * under way is cut short too: each file step is atomic, but the report of
   * what landed is lost (waiting for it is the quit dialog's job).
   */
  close(): void {
    this.closed = true;
    this.stop((kind) => resultWithout(kind, "cancelled", null));
  }

  /**
   * Before a commit nothing is written: cancelling terminates the worker and a
   * new one starts with the next request. During a commit the worker is never
   * terminated: it is asked to stop between file steps, and its result —
   * `cancelled` with the steps it did — settles the request.
   */
  private cancel(operationId: number): void {
    const pending = this.pending.get(operationId);
    if (!pending) return;
    if (pending.committing) {
      this.post({ type: "cancel", operationId });
      return;
    }
    this.settle(operationId, resultWithout(pending.kind, "cancelled", null));
    this.stop((kind) => resultWithout(kind, "failed", 2, "the operation worker was stopped to cancel another operation"));
  }

  /**
   * The worker asks to start writing: the session is told first
   * (`beforeCommit`), then the worker goes ahead — or is cancelled when the
   * signal was aborted meanwhile, with nothing written.
   */
  private commit(worker: Worker, operationId: number): void {
    const pending = this.pending.get(operationId);
    if (!pending) return;
    const answer = (gate: CommitGate): void => {
      // Settled meanwhile (cancelled before the commit, worker replaced): that worker is gone.
      if (this.pending.get(operationId) !== pending || this.worker !== worker) return;
      if (pending.signal?.aborted) return this.post({ type: "cancel", operationId });
      pending.committing = true;
      this.post({ type: "commit", operationId, ...(gate && gate.refused.length > 0 ? { refused: gate.refused } : {}) });
    };
    let told: Promise<CommitGate> | CommitGate;
    try {
      told = pending.beforeCommit?.();
    } catch {
      return this.post({ type: "cancel", operationId });
    }
    if (told instanceof Promise) told.then(answer, () => this.post({ type: "cancel", operationId }));
    else answer(told);
  }

  private post(call: OperationCall): void {
    try {
      this.worker?.postMessage(call);
    } catch {
      // A worker that cannot take the message fails through its `error`/`exit` events.
    }
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.entry, this.workerData === undefined ? {} : { workerData: this.workerData });
    worker.unref();
    worker.on("message", (reply: OperationReply) => {
      const pending = this.pending.get(reply.operationId);
      // A reply for a settled request (cancelled, or its worker replaced) changes nothing.
      if (!pending || this.worker !== worker) return;
      if (reply.type === "progress") pending.onProgress?.({ text: reply.text });
      else if (reply.type === "commit") this.commit(worker, reply.operationId);
      else if (reply.type === "result") this.settle(reply.operationId, reply.result);
      else this.settle(reply.operationId, resultWithout(pending.kind, "failed", 2, reply.error));
    });
    worker.on("error", (error) => {
      if (this.worker === worker) this.stop((kind) => resultWithout(kind, "failed", 2, `the operation worker failed: ${error.message}`));
    });
    worker.on("exit", (code) => {
      if (this.worker === worker) this.stop((kind) => resultWithout(kind, "failed", 2, `the operation worker exited with code ${code}`));
    });
    this.worker = worker;
    return worker;
  }

  /** Terminates the worker and settles what is still pending with `outcome`. */
  private stop(outcome: (kind: OperationRequest["kind"]) => OperationResult): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.terminate();
    for (const [operationId, pending] of [...this.pending]) this.settle(operationId, outcome(pending.kind));
  }

  private settle(operationId: number, result: OperationResult): void {
    const pending = this.pending.get(operationId);
    if (!pending) return;
    this.pending.delete(operationId);
    pending.release();
    if (this.pending.size === 0) this.worker?.unref();
    pending.resolve(result);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
