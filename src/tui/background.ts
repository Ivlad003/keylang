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
import type { FeatureBase } from "../feature-status.ts";
import { generateMap, type MapResult } from "../map.ts";
import { resultWithout, type CommitGate, type CommitPlan, type OperationContext, type OperationRequest, type OperationResult } from "../operations.ts";
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
  /** Feature files read at `HEAD` for the status line: null when the worker stopped first. */
  private readonly bases = new Map<number, (base: FeatureBase | null) => void>();
  private nextBase = 0;
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
   * `path` (relative to `root`) at `HEAD`, read in the worker: the session's
   * thread starts no git process. A worker that cannot start is a base that
   * could not be read; one stopped before it answered gives null (unknown).
   */
  featureBase(root: string, path: string): Promise<FeatureBase | null> {
    if (this.closed) return Promise.resolve(null);
    let worker: Worker;
    try {
      worker = this.start();
    } catch (error) {
      return Promise.resolve({ ref: "HEAD", state: "unavailable", reason: `the operation worker did not start: ${messageOf(error)}` });
    }
    const baseId = ++this.nextBase;
    return new Promise((resolve) => {
      this.bases.set(baseId, resolve);
      worker.ref();
      this.post({ type: "base", baseId, root, path });
    });
  }

  /**
   * Ends the worker and refuses new work. A request before its commit settles
   * as cancelled at once. One in its commit is asked to stop between file
   * steps and keeps the worker until its result (`cancelled` with the steps
   * it did) settles it: a file write is never cut short, and the worker stays
   * referenced, so the process does not exit under it.
   */
  close(): void {
    this.closed = true;
    // A closed session shows no status line: a base read in flight is dropped.
    for (const baseId of [...this.bases.keys()]) this.settleBase(baseId, null);
    const committing = [...this.pending].filter(([, pending]) => pending.committing);
    if (committing.length === 0) return this.stop((kind) => resultWithout(kind, "cancelled", null));
    for (const [operationId, pending] of [...this.pending]) {
      if (pending.committing) this.post({ type: "cancel", operationId });
      else this.settle(operationId, resultWithout(pending.kind, "cancelled", null));
    }
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
  private commit(worker: Worker, operationId: number, plan: CommitPlan | undefined): void {
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
      told = pending.beforeCommit?.(plan);
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
      if (reply.type === "base") return this.settleBase(reply.baseId, this.worker === worker ? reply.base : null);
      const pending = this.pending.get(reply.operationId);
      // A reply for a settled request (cancelled, or its worker replaced) changes nothing.
      if (!pending || this.worker !== worker) return;
      if (reply.type === "progress") pending.onProgress?.({ text: reply.text, ...(reply.step ? { step: reply.step } : {}) });
      else if (reply.type === "commit") this.commit(worker, reply.operationId, reply.plan);
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

  /** Terminates the worker and settles what is still pending with `outcome`; a base read in flight is unknown. */
  private stop(outcome: (kind: OperationRequest["kind"]) => OperationResult): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.terminate();
    for (const [operationId, pending] of [...this.pending]) this.settle(operationId, outcome(pending.kind));
    for (const baseId of [...this.bases.keys()]) this.settleBase(baseId, null);
  }

  private settleBase(baseId: number, base: FeatureBase | null): void {
    const resolve = this.bases.get(baseId);
    if (!resolve) return;
    this.bases.delete(baseId);
    if (this.pending.size === 0 && this.bases.size === 0) this.worker?.unref();
    resolve(base);
  }

  private settle(operationId: number, result: OperationResult): void {
    const pending = this.pending.get(operationId);
    if (!pending) return;
    this.pending.delete(operationId);
    pending.release();
    if (this.pending.size === 0 && this.bases.size === 0) this.worker?.unref();
    // Closed while a commit finished: the worker ends with its last result.
    if (this.closed && this.pending.size === 0 && this.worker) {
      const worker = this.worker;
      this.worker = null;
      void worker.terminate();
    }
    pending.resolve(result);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
