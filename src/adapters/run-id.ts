// One id for the reports and traces of a test run: KEYLANG_TRACE_RUN when the
// runner sets it, otherwise the time and the process.

export function runId(): string {
  return process.env.KEYLANG_TRACE_RUN ?? `${Date.now().toString(36)}-${process.pid}`;
}
