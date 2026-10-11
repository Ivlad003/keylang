// Worker entry of `SnapshotWorker`: builds the map for a config and overlay.
// It runs the source → FileFacts → graph → map pipeline off the TUI's main
// thread so the screen stays responsive during a rebuild. Protocol: each request
// carries an `id`, and the reply echoes it with either `result` or `error`.

import { parentPort } from "node:worker_threads";
import type { Config } from "../config.ts";
import { generateMap } from "../map.ts";

parentPort?.on("message", (message: { id: number; config: Config; overlay: [string, string][] }) => {
  // The overlay (path → unsaved buffer text) arrives as entries and is rebuilt
  // into a Map; a failure is reported as its message text, never thrown.
  generateMap(message.config, { overlay: new Map(message.overlay) }).then(
    (result) => parentPort?.postMessage({ id: message.id, result }),
    (error) => parentPort?.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }),
  );
});
