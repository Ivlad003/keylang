// analyze(): the one entry for the CLI and the language server.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";

test("changing an export in B re-resolves the call in A, with A's facts reused", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-analyze-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["typescript"], layers: { main: "src/**" } }));
  writeFileSync(join(dir, "src/a.ts"), 'import { f } from "./b.ts";\nexport function a(): void { f(); }\n');
  writeFileSync(join(dir, "src/b.ts"), "export function f(): void {}\n");
  const call = (edges: { kind: string; source: string; target: string | null; resolution: string }[]) => edges.find((edge) => edge.kind === "call" && edge.source === "main.a.a");
  const first = await analyze({ root: dir, specs: [] });
  assert.equal(call(first.snapshot!.edges)?.target, "main.b.f");
  assert.equal(call(first.snapshot!.edges)?.resolution, "resolved");
  writeFileSync(join(dir, "src/b.ts"), "export function g(): void {}\n");
  const second = await analyze({ root: dir, specs: [] });
  assert.deepEqual(second.map?.facts, { reused: 1, extracted: 1 });
  const again = call(second.snapshot!.edges);
  assert.notEqual(again?.resolution, "resolved");
  assert.equal(again?.target ?? null, null);
  assert.notEqual(second.snapshot!.snapshotId, first.snapshot!.snapshotId);
});
