// Worker entry of `SnapshotWorker`: builds the map for a config and overlay.

import { parentPort } from "node:worker_threads";
import type { Config } from "../config.ts";
import { generateMap } from "../map.ts";

parentPort?.on("message", (message: { id: number; config: Config; overlay: [string, string][] }) => {
  generateMap(message.config, { overlay: new Map(message.overlay) }).then(
    (result) => parentPort?.postMessage({ id: message.id, result }),
    (error: unknown) => parentPort?.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }),
  );
});
