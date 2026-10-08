// Business-flows 04: a call through an interface goes where a framework's
// binding says, the same for every language. TypeScript here, with a binding
// fact written by hand through a test-only adapter (`di.json`); the Magento
// adapter and PHP are in `frameworks-magento.test.ts`.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { analyze } from "../src/analyze.ts";
import type { StaticMode } from "../src/config.ts";
import type { ConfigFacts, FrameworkAdapter } from "../src/frameworks/adapter.ts";
import { generateMap } from "../src/map.ts";
import { writeTree } from "./cli-helpers.ts";

/** `di.json` and `di.admin.json`: `[{ from: [file, name], to: [file, name], line }]`, the second one in the area `admin`. */
const adapter: FrameworkAdapter = {
  name: "test-di",
  version: "1",
  detect: (context) => context.read("di.json") !== null,
  files: (context) => ["di.admin.json", "di.json"].filter((path) => context.read(path) !== null).map((path) => ({ path, owner: "src/wiring" })),
  parse(path, text): ConfigFacts {
    const rows = JSON.parse(text) as { from: [string, string]; to: [string, string]; line: number }[];
    return {
      path,
      scope: path === "di.admin.json" ? "admin" : "global",
      bindings: rows.map((row) => ({ from: { file: row.from[0], name: row.from[1] }, to: { file: row.to[0], name: row.to[1] }, line: row.line, col: 3 })),
      arguments: [],
      aliases: [],
      intercepts: [],
      observers: [],
      entries: [],
      routes: [],
      error: null,
    };
  },
};

const FILES: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], core: ["src/core/**"], wiring: ["src/wiring/**"] } }),
  "src/core/repo.ts": "export interface Repo {\n  save(x: number): void;\n}\n",
  "src/core/sql.ts": 'import type { Repo } from "./repo";\n\nexport class SqlRepo implements Repo {\n  save(x: number): void {\n    this.flush(x);\n  }\n\n  flush(x: number): void {\n    console.log(x);\n  }\n}\n',
  "src/core/memory.ts": "export class MemoryRepo {\n  save(x: number): void {\n    console.log(x);\n  }\n}\n",
  "src/app/checkout.ts": 'import type { Repo } from "../core/repo";\n\nexport class Checkout {\n  constructor(private readonly repo: Repo) {}\n\n  buy(): void {\n    this.repo.save(1);\n  }\n}\n',
  "src/wiring/index.ts": "export const wired = true;\n",
  "keylang/flows.md": "# flow buy\n\n- trigger app.checkout.Checkout.buy\n  - step core.sql.SqlRepo.save\n",
  "keylang/rules.md": "# rules\n\n- deny wiring core.memory\n",
};

const GLOBAL = JSON.stringify([{ from: ["src/core/repo.ts", "Repo"], to: ["src/core/sql.ts", "SqlRepo"], line: 2 }]);
const ADMIN = JSON.stringify([{ from: ["src/core/repo.ts", "Repo"], to: ["src/core/memory.ts", "MemoryRepo"], line: 7 }]);

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-bindings-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeTree(dir, files);
  return dir;
}

async function check(root: string, mode: StaticMode = "behavior") {
  return analyze({ root, static: mode, generate: (config, options) => generateMap(config, { ...options, adapters: [adapter] }) });
}

test("bindings (TypeScript): a call through an interface follows the binding; per area, an edge each; deny sees them at the config line", async (t) => {
  const dir = repo(t, { ...FILES, "di.json": GLOBAL, "di.admin.json": ADMIN });
  const analysis = await check(dir);
  const edges = analysis.snapshot!.edges.filter((e) => e.source === "app.checkout.Checkout.buy" && e.kind === "call" && e.resolution === "resolved");
  assert.deepEqual(
    edges.map((e) => [e.target, e.via, e.scope, e.site, e.owner]),
    [
      ["core.sql.SqlRepo.save", "preference", "global", "di.json:2:3", "wiring"],
      ["core.memory.MemoryRepo.save", "preference", "admin", "di.admin.json:7:3", "wiring"],
    ],
  );
  const step = analysis.verdicts.find((v) => v.criterion === "static" && v.area === "core.sql.SqlRepo.save");
  assert.equal(step?.verdict, "ok", JSON.stringify(analysis.verdicts));
  assert.match(step?.message ?? "", /through the preference `Repo → SqlRepo` in `di\.json:2`/);
  const denied = analysis.diagnostics.filter((d) => d.code === "K102");
  assert.equal(denied.length, 1, JSON.stringify(denied));
  assert.equal(denied[0]?.file, "di.admin.json");
  assert.match(denied[0]?.message ?? "", /`wiring` depends on `core\.memory\.MemoryRepo` through the preference `Repo → MemoryRepo` \(di\.admin\.json:7, scope admin\)/);

  const shape = await check(dir, "shape");
  assert.equal(shape.verdicts.find((v) => v.criterion === "static" && v.area === "core.sql.SqlRepo.save")?.verdict, "unverified");
});

test("bindings (TypeScript): without the binding the step is unverified, never ok or fail", async (t) => {
  const dir = repo(t, FILES);
  const analysis = await check(dir);
  const step = analysis.verdicts.find((v) => v.criterion === "static" && v.area === "core.sql.SqlRepo.save");
  assert.equal(step?.verdict, "unverified", JSON.stringify(analysis.verdicts));
  assert.equal(analysis.snapshot!.manifest.frameworks, undefined);
});
