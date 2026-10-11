// `node:test` reporter that writes a keylang test report (schema 1) bound to
// the current snapshot: `node --test --test-reporter=keylang/node-test-reporter`
// (in this repository: `--test-reporter=./src/adapters/node-test.ts`).
// It prints nothing; pair it with another reporter for the console.
// KEYLANG_TEST_REPORT names the output file, relative to the repository root
// (default `.keylang/reports/node-test.json`).
// Pipeline: test runner events → JsonReport → `keylang check`, which reads the
// report as test evidence for flow claims (see test-report.ts).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot } from "../analyze.ts";
import { loadConfig, toPosix } from "../config.ts";
import { generateMap } from "../map.ts";
import { REPORT_SCHEMA, type JsonReport, type TestStatus } from "../test-report.ts";
import { runId } from "./run-id.ts";

/** The subset of a `node:test` reporter event this reporter reads. */
interface TestEvent {
  type: string;
  data: { name: string; nesting: number; file?: string; skip?: boolean | string; todo?: boolean | string; details?: { type?: string } };
}

/** Collects pass/fail/skip results from `node:test` events and writes them as a JSON report when the run ends. */
export default async function* keylangReporter(source: AsyncIterable<TestEvent>): AsyncGenerator<string> {
  const root = findRoot(process.cwd());
  const snapshotOf = async (): Promise<string> => (await generateMap(loadConfig(root))).index.snapshotId;
  // Taken when the run starts and again when it ends: code changed in between binds the results to no snapshot.
  const before = snapshotOf();
  const tests: JsonReport["tests"] = [];
  // Suites currently open in each file, by nesting level.
  const open = new Map<string, string[]>();

  for await (const event of source) {
    const { data } = event;
    // node:test reports a file as a file: URL, an absolute path or a path relative
    // to the cwd; normalise all three to a repository-relative POSIX path.
    const file = data.file ? toPosix(relative(root, data.file.startsWith("file:") ? fileURLToPath(data.file) : isAbsolute(data.file) ? data.file : join(root, data.file))) : "";

    // A test:start at nesting N closes every deeper suite in that file and opens
    // this one, so the stack always holds the suites enclosing the next result.
    if (event.type === "test:start") {
      const stack = open.get(file) ?? [];
      stack.length = data.nesting;
      stack.push(data.name);
      open.set(file, stack);
      continue;
    }

    if (event.type !== "test:pass" && event.type !== "test:fail") continue;

    // Suites report their own pass/fail; only leaf tests become report entries,
    // with their enclosing suites joined into one `suite` path.
    if (data.details?.type === "suite") continue;
    const suites = (open.get(file) ?? []).slice(0, data.nesting);
    const status: TestStatus = data.skip || data.todo ? "skip" : event.type === "test:pass" ? "pass" : "fail";
    const name = data.name;
    tests.push(suites.length > 0 ? { file, suite: suites.join(" > "), name, status } : { file, name, status });
  }

  // Bind the report to a snapshot only if the code did not change during the run.
  const first = await before;
  const snapshotId = first === (await snapshotOf()) ? first : null;
  const report: JsonReport = { schemaVersion: REPORT_SCHEMA, snapshotId, runId: runId(), tests };
  const out = resolve(root, process.env.KEYLANG_TEST_REPORT ?? ".keylang/reports/node-test.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  // node:test consumes a reporter as a generator of console chunks; this one emits none.
  yield* [];
}
