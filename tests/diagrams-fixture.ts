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

/** A diagram of `/api/diagram` as the editor's `currentModel()` gives it «з коду» (web/src/editor.ts): what `POST /api/diagram-proposal` and `keylang diagram propose` compare. */
export interface FixtureModel {
  view: string;
  mode: string;
  nodes: { key: string; id: string; kind: string; label: string; layer: string | null; tests: string[]; x: number; y: number; w: number; h: number; trigger?: string; signature?: string; role?: "split" | "join" }[];
  edges: { key: string; kind: string; from: string; to: string; label?: string }[];
  lanes: { key: string; id: string; label: string; x: number; y: number; w: number; h: number }[];
}

export function editorModelOf(
  view: string,
  diagram: { nodes: { id: string; kind: string; label: string; ref?: { id?: string }; group?: string; x: number; y: number; w: number; h: number }[]; edges: { from: string; to: string; kind: string; label?: string }[]; groups: { id: string; label: string; x: number; y: number; w: number; h: number }[] },
): FixtureModel {
  const seen = new Map<string, number>();
  return {
    view,
    mode: "code",
    nodes: diagram.nodes.map((n) => ({ key: n.id, id: n.ref?.id ?? (n.kind === "layer" ? n.label : ""), kind: n.kind, label: n.label, layer: n.group ?? null, tests: [], x: n.x, y: n.y, w: n.w, h: n.h })),
    edges: diagram.edges.map((e) => {
      const base = `edge:${e.from}->${e.to}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { key: n === 0 ? base : `${base}#${n}`, kind: e.kind, from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) };
    }),
    lanes: diagram.groups.map((g) => ({ key: `lane:${g.id}`, id: g.id, label: g.label, x: g.x, y: g.y, w: g.w, h: g.h })),
  };
}
