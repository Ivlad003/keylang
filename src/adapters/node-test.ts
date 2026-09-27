// `node:test` reporter that writes a keylang test report (schema 1) bound to
// the current snapshot: `node --test --test-reporter=keylang/node-test-reporter`
// (in this repository: `--test-reporter=./src/adapters/node-test.ts`).
// It prints nothing; pair it with another reporter for the console.
// KEYLANG_TEST_REPORT names the output file (default `.keylang/reports/node-test.json`).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot } from "../analyze.ts";
import { loadConfig, toPosix } from "../config.ts";
import { generateMap } from "../map.ts";
import type { JsonReport, TestStatus } from "../test-report.ts";

interface TestEvent {
  type: string;
  data: { name: string; nesting: number; file?: string; skip?: boolean | string; todo?: boolean | string; details?: { type?: string } };
}

export default async function* keylangReporter(source: AsyncIterable<TestEvent>): AsyncGenerator<string> {
  const root = findRoot(process.cwd());
  const tests: JsonReport["tests"] = [];
  // Suites currently open in each file, by nesting level.
  const open = new Map<string, string[]>();
  for await (const event of source) {
    const { data } = event;
    const file = data.file ? toPosix(relative(root, data.file.startsWith("file:") ? fileURLToPath(data.file) : isAbsolute(data.file) ? data.file : join(root, data.file))) : "";
    if (event.type === "test:start") {
      const stack = open.get(file) ?? [];
      stack.length = data.nesting;
      stack.push(data.name);
      open.set(file, stack);
      continue;
    }
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    if (data.details?.type === "suite") continue;
    const suites = (open.get(file) ?? []).slice(0, data.nesting);
    const status: TestStatus = data.skip || data.todo ? "skip" : event.type === "test:pass" ? "pass" : "fail";
    tests.push({ file, ...(suites.length > 0 ? { suite: suites.join(" > ") } : {}), name: data.name, status });
  }
  // The snapshot of the code the tests ran against; tests do not change sources.
  const snapshotId = (await generateMap(loadConfig(root))).index.snapshotId;
  const report: JsonReport = { schemaVersion: 1, snapshotId, runId: process.env.KEYLANG_TRACE_RUN ?? `${Date.now().toString(36)}-${process.pid}`, tests };
  const out = process.env.KEYLANG_TEST_REPORT ?? join(root, ".keylang/reports/node-test.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
