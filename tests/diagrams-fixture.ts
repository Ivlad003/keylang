// A repository for the diagram page of `keylang web` (business-flows/21): the
// checkout fixture of the TUI with two Express-style routes, so the snapshot
// has entry points, and the discovered view `keylang/flows-discovered/` that
// `keylang flows discover` writes for the route no flow names yet.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkoutRepo } from "./tui-fixture.ts";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin/keylang.js");

export const DIAGRAM_FILES: Record<string, string> = {
  "src/presentation/orders.ts": 'import { create } from "../domain/order.ts";\nexport function listOrders(): void {\n  create();\n}\n',
  "src/presentation/server.ts": [
    'import { checkout } from "./terminal.ts";',
    'import { listOrders } from "./orders.ts";',
    "const app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };",
    'app.post("/checkout", checkout);',
    'app.get("/orders", listOrders);',
    "",
  ].join("\n"),
};

/** The checkout repository with routes and its discovered flows written. */
export function diagramsRepo(t: { after: (f: () => void) => void }): string {
  const dir = checkoutRepo(t, DIAGRAM_FILES);
  const run = spawnSync(process.execPath, [bin, "flows", "discover"], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return dir;
}
