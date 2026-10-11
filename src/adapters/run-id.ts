// One id for the reports and traces of a test run: KEYLANG_TRACE_RUN when the
// runner sets it, otherwise the time and the process. Shared by the test
// adapters (node-test reporter, trace hooks) so that a test report and the
// traces written during the same run can be matched by `runId`.

/** The id of the current test run: the runner's KEYLANG_TRACE_RUN, else a base-36 timestamp plus the pid. */
export function runId(): string {
  return process.env.KEYLANG_TRACE_RUN ?? `${Date.now().toString(36)}-${process.pid}`;
}
