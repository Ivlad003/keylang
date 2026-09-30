// A test entry for `OperationWorker`: optionally dies on start (while the
// shared counter is positive), optionally blocks on a shared gate, then serves
// requests as the real operation worker. Messages sent meanwhile wait in the
// port's queue; a terminate ends the worker even while it waits.

import { workerData } from "node:worker_threads";

const { gate, crashes } = (workerData ?? {}) as { gate?: SharedArrayBuffer; crashes?: SharedArrayBuffer };
if (crashes && Atomics.sub(new Int32Array(crashes), 0, 1) > 0) process.exit(3);
if (gate) Atomics.wait(new Int32Array(gate), 0, 0);
await import("../src/tui/operation-worker.ts");
