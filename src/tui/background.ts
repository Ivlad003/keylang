// Snapshot generation off the UI thread. One long-lived worker builds the
// map (tree-sitter extraction, graph, render); the caller parses specs and
// assesses on its own thread, which is fast. The worker is referenced only
// while a request is pending, so an idle TUI does not keep the process up.
// If the worker cannot start, generation falls back to the calling thread.

import { Worker } from "node:worker_threads";
import type { Config } from "../config.ts";
import { generateMap, type MapResult } from "../map.ts";

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
