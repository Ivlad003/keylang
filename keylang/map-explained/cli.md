<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [keylang](#cli.keylang) · [node-test](#cli.node-test) · [run-id](#cli.run-id) · [trace-hooks](#cli.trace-hooks) · [trace](#cli.trace) · [cli](#cli.cli) · [completions](#cli.completions) · [index](#cli.index) · [lsp](#cli.lsp) · [mcp](#cli.mcp)

# map

- cli
  <a id="cli"></a><br>The entry points: [`cli.cli`](cli.md#cli.cli) and [`cli.completions`](cli.md#cli.completions) give the command line and shell completion, [`cli.lsp`](cli.md#cli.lsp) and [`cli.mcp`](cli.md#cli.mcp) serve analysis to editors and agents, and [`cli.trace`](cli.md#cli.trace) with [`cli.node-test`](cli.md#cli.node-test) record test traces and reports. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [keylang](../../bin/keylang.js#L1)
    <a id="cli.keylang"></a><br>Checkout entry. `npm pack` rewrites this file to import ../dist/cli.js and restores this copy afterwards (scripts/pack-entry.mjs).
    - cli [cli.cli](cli.md#cli.cli)
  - module [node-test](../../src/adapters/node-test.ts#L1)
    <a id="cli.node-test"></a><br>`node:test` reporter that writes a keylang test report (schema 1) bound to the current snapshot: `node --test --test-reporter=keylang/node-test-reporter` (in this repository: `--test-reporter=./src/adapters/node-test.ts`). It prints nothing; pair it with another reporter for…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - map [map.map](map.md#map.map)
    - test-report [check.test-report](check.md#check.test-report)
    - run-id [cli.run-id](cli.md#cli.run-id)
    - type [TestEvent](../../src/adapters/node-test.ts#L17) <!-- internal -->
      <a id="cli.node-test.TestEvent"></a><br>Shape of a single event emitted by Node's test runner stream, carrying the event kind plus the test's name, nesting depth, optional file path, skip/todo markers and detail type. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [keylangReporter](../../src/adapters/node-test.ts#L22) (source: AsyncIterable<TestEvent>) → AsyncGenerator<string>
      <a id="cli.node-test.keylangReporter"></a><br>Node test-runner reporter that collects pass/fail/skip results with suite paths and writes them as a JSON report. It binds results to the [`map.map.generateMap`](map.md#map.map.generateMap) snapshot only if code was unchanged during the run. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.map.generateMap](map.md#map.map.generateMap), [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [cli.run-id.runId](cli.md#cli.run-id.runId)
  - module [run-id](../../src/adapters/run-id.ts#L1)
    <a id="cli.run-id"></a><br>One id for the reports and traces of a test run: KEYLANG_TRACE_RUN when the runner sets it, otherwise the time and the process.
    - fn [runId](../../src/adapters/run-id.ts#L4) () → string
      <a id="cli.run-id.runId"></a><br>Returns an identifier for the current run: the `KEYLANG_TRACE_RUN` environment variable if set, otherwise a fresh string combining the base-36 current timestamp and the process PID; used by [`cli.node-test.keylangReporter`](cli.md#cli.node-test.keylangReporter). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [trace-hooks](../../src/adapters/trace-hooks.ts#L1)
    <a id="cli.trace-hooks"></a><br>Module hooks for the trace adapter (they run on Node's hooks thread, with a module graph of their own). `initialize` builds the snapshot, finds the symbols of one flow, and plans a wrapper for each function body; `load` applies the plan to the source of those files only.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - bodies [extract.bodies](extract.md#extract.bodies)
    - map [map.map](map.md#map.map)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - type [TraceHooksData](../../src/adapters/trace-hooks.ts#L16)
      <a id="cli.trace-hooks.TraceHooksData"></a><br>Describes the payload handed to the trace-hooks worker thread: the repository root path, the flow identifier being traced, and a `MessagePort` over which the worker reports hook events back to the parent. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TracePlanMessage](../../src/adapters/trace-hooks.ts#L29)
      <a id="cli.trace-hooks.TracePlanMessage"></a><br>Hooks → adapter. `plan` once from `initialize`: the flow's functions a wrapper was planned for, and the real path of each file that holds them. `loaded` from `load` for each file the plan was applied to (`commonjs` when Node compiles it as CommonJS); `skipped` for a planned…
    - type [FilePlan](../../src/adapters/trace-hooks.ts#L34) <!-- internal -->
      <a id="cli.trace-hooks.FilePlan"></a><br>Holds the per-file record used when wrapping a source file for tracing: the `sha256` of the file as the snapshot saw it, the `source` text with wrappers inserted, and the `ids` of the nodes instrumented in it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [initialize](../../src/adapters/trace-hooks.ts#L44) (data: TraceHooksData) → Promise<void>
      <a id="cli.trace-hooks.initialize"></a><br>Builds the map, picks the flow's functions via [`map.trace-plan.flowSymbols`](map.md#map.trace-plan.flowSymbols), and wraps each with [`cli.trace-hooks.wrap`](cli.md#cli.trace-hooks.wrap), skipping files that no longer parse cleanly. It stores instrumented sources by file URL and posts the plan or error to the port. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.flowSymbols](map.md#map.trace-plan.flowSymbols), [extract.bodies.functionBodies](extract.md#extract.bodies.functionBodies), [cli.trace-hooks.wrap](cli.md#cli.trace-hooks.wrap), [cli.trace-hooks.applyEdits](cli.md#cli.trace-hooks.applyEdits), [extract.bodies.parsesCleanly](extract.md#extract.bodies.parsesCleanly), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - type [Edit](../../src/adapters/trace-hooks.ts#L87) <!-- internal -->
      <a id="cli.trace-hooks.Edit"></a><br>Text inserted at an offset of the original source.
    - fn [wrap](../../src/adapters/trace-hooks.ts#L93) (id: string, body: FunctionBody) → Edit[] <!-- internal -->
      <a id="cli.trace-hooks.wrap"></a><br>`{ BODY }` → `{ return __keylangTrace.run(id, () => { BODY }); }`; an arrow keeps `this` and `arguments`.
    - fn [applyEdits](../../src/adapters/trace-hooks.ts#L109) (src: string, edits: readonly Edit[]) → string <!-- internal -->
      <a id="cli.trace-hooks.applyEdits"></a><br>Insert every edit; edits at one offset keep the order they were made in.
    - type [LoadResult](../../src/adapters/trace-hooks.ts#L116) <!-- internal -->
      <a id="cli.trace-hooks.LoadResult"></a><br>Shape of the value a module-load hook returns: an optional module `format`, the loaded `source` as string or binary buffer, and a `shortCircuit` flag telling the loader chain to stop at this result. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [load](../../src/adapters/trace-hooks.ts#L118) (url: string, context: unknown, nextLoad: (url: string, context: unknown) => Promise<LoadResult>) → Promise<LoadResult>
      <a id="cli.trace-hooks.load"></a><br>Node module loader hook that swaps in instrumented trace source for planned files whose [`map.snapshot.sha256`](map.md#map.snapshot.sha256) hash matches the snapshot, reporting loaded or skipped, and tags CommonJS modules for the adapter. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256)
  - module [trace](../../src/adapters/trace.ts#L1)
    <a id="cli.trace"></a><br>Trace adapter for TS/JS `@flow` tests: `node --import keylang/trace …` (in this repository: `--import ./src/adapters/trace.ts`). Environment: KEYLANG_TRACE JSONL file to append to; without it the adapter does nothing KEYLANG_TRACE_FLOW flow name whose trigger and steps are…
    - node [external.node](external.md#external.node)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - run-id [cli.run-id](cli.md#cli.run-id)
    - trace-hooks [cli.trace-hooks](cli.md#cli.trace-hooks)
    - type [Span](../../src/adapters/trace.ts#L26) <!-- internal -->
      <a id="cli.trace.Span"></a><br>Describes the shape of a tracing span record held by [`cli.trace`](cli.md#cli.trace): a string identifier for the span plus a boolean flag marking whether the span has already been closed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Plan](../../src/adapters/trace.ts#L31) = Extract<TracePlanMessage, { kind: "plan" }> <!-- internal -->
      <a id="cli.trace.Plan"></a>
    - fn [record](../../src/adapters/trace.ts#L37) (file: string) → void <!-- internal -->
      <a id="cli.trace.record"></a>
      - calls [cli.run-id.runId](cli.md#cli.run-id.runId), [cli.trace.instrumented](cli.md#cli.trace.instrumented)
    - type [Loads](../../src/adapters/trace.ts#L183) <!-- internal -->
      <a id="cli.trace.Loads"></a><br>What the hooks did with the planned files in this process.
    - fn [instrumented](../../src/adapters/trace.ts#L201) (plan: Plan, loads: Loads) → string[] <!-- internal -->
      <a id="cli.trace.instrumented"></a><br>The plan's functions this process would have recorded had it called them: every function a wrapper was planned for, whether or not the process loaded its file (code it never loaded never ran here). Left out: a file that loaded with other content than the snapshot saw, and a…
  - module [cli](../../src/cli.ts#L1)
    <a id="cli.cli"></a><br>`keylang` command line: the TUI (no command), web, clone, init, map, check, parse, fmt.
    - node [external.node](external.md#external.node)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - harness [features.harness](features.md#features.harness)
    - clone [features.clone](features.md#features.clone)
    - changed [features.changed](features.md#features.changed)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - analyze [map.analyze](map.md#map.analyze)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - check-format [features.check-format](features.md#features.check-format)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - explanations [map.explanations](map.md#map.explanations)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - operations [operations.operations](operations.md#operations.operations)
    - terminal [tui.terminal](tui.md#tui.terminal)
    - lsp [cli.lsp](cli.md#cli.lsp)
    - mcp [cli.mcp](cli.md#cli.mcp)
    - web [tui.web](tui.md#tui.web)
    - proposals [features.proposals](features.md#features.proposals)
    - git-hook [features.git-hook](features.md#features.git-hook)
    - new-spec [tui.new-spec](tui.md#tui.new-spec)
    - completions [cli.completions](cli.md#cli.completions)
    - stale [features.stale](features.md#features.stale)
    - fn [main](../../src/cli.ts#L273) (argv: readonly string[]) → Promise<number>
      <a id="cli.cli.main"></a><br>Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error.
      - calls [cli.cli.run](cli.md#cli.cli.run)
    - fn [run](../../src/cli.ts#L282) (argv: readonly string[]) → Promise<number> <!-- internal -->
      <a id="cli.cli.run"></a><br>Parses CLI arguments, handles help/version, opens the terminal UI when no command is given, and dispatches each subcommand to its handler such as [`cli.cli.cmdCheck`](cli.md#cli.cli.cmdCheck) or [`cli.cli.cmdWeb`](cli.md#cli.cli.cmdWeb), returning an exit code. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.cmdInit](cli.md#cli.cli.cmdInit), [cli.cli.cmdAgents](cli.md#cli.cli.cmdAgents), [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [cli.cli.cmdBaseline](cli.md#cli.cli.cmdBaseline), [cli.cli.cmdFeature](cli.md#cli.cli.cmdFeature), [cli.cli.cmdHook](cli.md#cli.cli.cmdHook), [cli.cli.cmdNew](cli.md#cli.cli.cmdNew), [cli.cli.cmdCompletions](cli.md#cli.cli.cmdCompletions), [cli.cli.cmdMap](cli.md#cli.cli.cmdMap), [cli.cli.cmdCheck](cli.md#cli.cli.cmdCheck), [cli.cli.cmdExplain](cli.md#cli.cli.cmdExplain), [cli.cli.cmdDoctor](cli.md#cli.cli.cmdDoctor), [cli.cli.cmdDraft](cli.md#cli.cli.cmdDraft), [cli.cli.cmdProposals](cli.md#cli.cli.cmdProposals), [cli.cli.cmdSpecToCode](cli.md#cli.cli.cmdSpecToCode), [cli.cli.cmdCodeToSpec](cli.md#cli.cli.cmdCodeToSpec), [cli.cli.cmdWire](cli.md#cli.cli.cmdWire), [cli.cli.cmdTracePlan](cli.md#cli.cli.cmdTracePlan), [cli.cli.cmdExport](cli.md#cli.cli.cmdExport), [cli.cli.prepareClone](cli.md#cli.cli.prepareClone), [cli.cli.cmdWeb](cli.md#cli.cli.cmdWeb), [cli.cli.needPaths](cli.md#cli.cli.needPaths), [cli.cli.cmdParse](cli.md#cli.cli.cmdParse), [cli.cli.cmdFmt](cli.md#cli.cli.cmdFmt)
    - fn [cmdWeb](../../src/cli.ts#L392) (root: string, portText: string, host: string) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWeb"></a><br>Validates the port, starts the browser UI server, prints its URL, and waits for SIGINT/SIGTERM, requiring a second Ctrl+C when sessions hold unsaved buffers, then closes the server; invoked from [`cli.cli.run`](cli.md#cli.cli.run). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
    - type [ExplainOptions](../../src/cli.ts#L423) <!-- internal -->
      <a id="cli.cli.ExplainOptions"></a><br>Shape of the parsed flags for the explain command: booleans toggling LLM use, full/brief output, stale/missing filtering and dry-run, plus optional raw string values for a result limit and parallel job count. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [cmdExplain](../../src/cli.ts#L434) (subject: string | undefined, opts: ExplainOptions) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExplain"></a><br>Validates explain flags, then routes to batch explanation via [`cli.cli.cmdExplainBatch`](cli.md#cli.cli.cmdExplainBatch), a stale-plan listing via [`cli.cli.explainPlanPrinter`](cli.md#cli.cli.explainPlanPrinter), or an offline or model-backed [`operations.operations.runOperation`](operations.md#operations.operations.runOperation). It prints the resulting text and returns an exit code. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.cli.cmdExplainBatch](cli.md#cli.cli.cmdExplainBatch), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.explainPlanPrinter](cli.md#cli.cli.explainPlanPrinter), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdExplainBatch](../../src/cli.ts#L473) (root: string, batch: BriefBatch, opts: Pick<ExplainOptions, "llm" | "dryRun" | "limit" | "jobs">) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExplainBatch"></a><br>`explain --missing|--stale [--llm] [--dry-run] [--limit N] [--jobs N]`: briefs for the explained map, bottom-up. Without `--llm` it lists the nodes; `--dry-run` counts them and estimates tokens.
      - calls [cli.cli.positiveInteger](cli.md#cli.cli.positiveInteger), [cli.cli.explainPlanPrinter](cli.md#cli.cli.explainPlanPrinter), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [explainPlanPrinter](../../src/cli.ts#L493) (request: ExplainPlanRequest) → Promise<number> <!-- internal -->
      <a id="cli.cli.explainPlanPrinter"></a><br>`explain --stale`, and a brief plan without `--llm`: the note on stderr, the stdout of the shared operation; a failure is the CLI's error.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [prepareClone](../../src/cli.ts#L508) (sourceText: string | undefined, opts: { dir: string | undefined; explain: string | undefined; dryRun: boolean }) → Promise<{ code: number; root: string | null }> <!-- internal -->
      <a id="cli.cli.prepareClone"></a><br>`clone <source> [--dir D] [--explain MODE] [--dry-run]`, and the first half of `web <source>`: the clone, then the existing printers of init (`--agents=none`: a clone gets no harness files), the brief batch, the layers' full explanations and the map, each over the clone's root.…
      - calls [features.clone.isCloneExplain](features.md#features.clone.isCloneExplain), [features.clone.parseRepoSource](features.md#features.clone.parseRepoSource), [features.clone.cloneCacheRoot](features.md#features.clone.cloneCacheRoot), [features.clone.syncClone](features.md#features.clone.syncClone), [cli.cli.cmdInit](cli.md#cli.cli.cmdInit), [base.config.loadConfig](base.md#base.config.loadConfig), [cli.cli.cmdExplainBatch](cli.md#cli.cli.cmdExplainBatch), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.clone.enableExplainedMap](features.md#features.clone.enableExplainedMap), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.printMap](cli.md#cli.cli.printMap)
    - fn [positiveInteger](../../src/cli.ts#L553) (flag: string, text: string) → number <!-- internal -->
      <a id="cli.cli.positiveInteger"></a><br>Validates a CLI flag's text via [`features.explain-inventory.positiveIntegerProblem`](features.md#features.explain-inventory.positiveIntegerProblem), throwing an Error with the returned message when it fails. Otherwise converts the text to a number for [`cli.cli.cmdExplainBatch`](cli.md#cli.cli.cmdExplainBatch). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.explain-inventory.positiveIntegerProblem](features.md#features.explain-inventory.positiveIntegerProblem)
    - fn [cmdDraft](../../src/cli.ts#L559) (args: string[], opts: { mode: string; name: string | undefined; into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDraft"></a><br>Dispatches the draft subcommand: `rules`/`map` go to [`cli.cli.cmdDraftLayout`](cli.md#cli.cli.cmdDraftLayout), while `flow <trigger>` validates the trigger and algo/llm/hybrid mode, then calls [`cli.cli.draftFlowPrinter`](cli.md#cli.cli.draftFlowPrinter) at the root from [`map.analyze.findRoot`](map.md#map.analyze.findRoot). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.cli.cmdDraftLayout](cli.md#cli.cli.cmdDraftLayout), [cli.cli.draftFlowPrinter](cli.md#cli.cli.draftFlowPrinter), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [draftFlowPrinter](../../src/cli.ts#L574) (root: string, trigger: string, mode: "algo" | "llm" | "hybrid", opts: { name: string | undefined; into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.draftFlowPrinter"></a><br>`draft flow <trigger> --mode algo|llm|hybrid`: a printer over the shared `draft-flow` operation. The proposal replaces one already waiting, as the CLI always did.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdSpecToCode](../../src/cli.ts#L599) (id: string | undefined, opts: { into: string | undefined; apply: boolean; print: boolean; mode: string }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdSpecToCode"></a><br>Validates CLI options (requires a planned id, rejects `--apply` with `--print`, mode must be algo or llm) and locates the repo root via [`map.analyze.findRoot`](map.md#map.analyze.findRoot). Dispatches to [`cli.cli.specToCodeApplyPrinter`](cli.md#cli.cli.specToCodeApplyPrinter) or [`cli.cli.specToCodePrinter`](cli.md#cli.cli.specToCodePrinter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.specToCodeApplyPrinter](cli.md#cli.cli.specToCodeApplyPrinter), [cli.cli.specToCodePrinter](cli.md#cli.cli.specToCodePrinter)
    - fn [specToCodeApplyPrinter](../../src/cli.ts#L619) (root: string, id: string, into: string | undefined, mode: "algo" | "llm") → Promise<number> <!-- internal -->
      <a id="cli.cli.specToCodeApplyPrinter"></a><br>`spec-to-code <id> [--into] [--mode algo|llm] --apply`: the candidate is built as a preview (stdout and the test notes as `--print`), then the shared `apply-code` operation writes its files; a proposal waiting for one stays, as it always did. The operation's code is the CLI's…
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [specToCodePrinter](../../src/cli.ts#L647) (root: string, id: string, into: string | undefined, print: boolean, mode: "algo" | "llm") → Promise<number> <!-- internal -->
      <a id="cli.cli.specToCodePrinter"></a><br>`spec-to-code <id> [--into] [--mode algo|llm] [--print]`: a printer over the shared `spec-to-code` operation. stdout is the candidate's files and findings, stderr the test notes and then what was (not) written. The proposals replace ones already waiting, as the CLI always did.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdCodeToSpec](../../src/cli.ts#L661) (at: string | undefined, opts: { into: string | undefined; print: boolean; mode: string; since: string | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCodeToSpec"></a><br>Validates that exactly one of a `file[:line]` target or a `--since` git ref is given, runs [`map.analyze.analyze`](map.md#map.analyze.analyze) from the [`map.analyze.findRoot`](map.md#map.analyze.findRoot) root, and passes the resolved source to [`cli.cli.codeToSpecPrinter`](cli.md#cli.cli.codeToSpecPrinter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.analyze.analyze](map.md#map.analyze.analyze), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.codeToSpecPrinter](cli.md#cli.cli.codeToSpecPrinter)
    - fn [codeToSpecPrinter](../../src/cli.ts#L688) (root: string, source: CodeToSpecSource, analysis: Analysis, opts: { into: string | undefined; print: boolean; mode: string }) → Promise<number> <!-- internal -->
      <a id="cli.cli.codeToSpecPrinter"></a><br>`code-to-spec <path[:line]> | --since <ref> [--mode] [--into] [--print]`: a printer over the shared `code-to-spec` operation, on the analysis already made. The path is relative to the working directory, `--into` to the root.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdDraftLayout](../../src/cli.ts#L722) (what: "rules" | "map", opts: { mode: string; into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDraftLayout"></a><br>Validates that the draft mode is algo, llm or hybrid, locates the project root via [`map.analyze.findRoot`](map.md#map.analyze.findRoot), then dispatches to [`cli.cli.draftMapPrinter`](cli.md#cli.cli.draftMapPrinter) or [`cli.cli.draftRulesPrinter`](cli.md#cli.cli.draftRulesPrinter) depending on the requested target. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.draftMapPrinter](cli.md#cli.cli.draftMapPrinter), [cli.cli.draftRulesPrinter](cli.md#cli.cli.draftRulesPrinter)
    - fn [draftMapPrinter](../../src/cli.ts#L734) (root: string, mode: "algo" | "llm" | "hybrid") → Promise<number> <!-- internal -->
      <a id="cli.cli.draftMapPrinter"></a><br>`draft map [--mode algo|llm|hybrid]`: a printer over the shared `draft-layout` operation. Stdout: the config with the drafted layers; on stderr the fallback of a hybrid without a model, then that nothing was written. keylang.json never changes.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [draftRulesPrinter](../../src/cli.ts#L752) (root: string, mode: "algo" | "llm" | "hybrid", opts: { into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.draftRulesPrinter"></a><br>`draft rules [--mode algo|llm|hybrid] [--into] [--print]`: a printer over the shared `draft-rules` operation. The proposal replaces one already waiting, as the CLI always did.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdExport](../../src/cli.ts#L780) (args: readonly string[], options: { format: string | undefined; level: string | undefined; layer: string | undefined; out: string | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExport"></a><br>`keylang export c4` (c4-zoom/12): the diagram on stdout, or written to `--out` with a note on stderr and nothing on stdout. Exit code 0 or 2.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdProposals](../../src/cli.ts#L804) (args: readonly string[]) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdProposals"></a><br>`proposals [show|accept|reject <target>]`: a person takes or drops a proposal without the TUI. A printer over `src/proposals.ts`: the list, a diff and what was written to stdout; notes and refusals to stderr. 0 done; 1 nothing pending for the target, or an accept refused…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [base.config.loadConfig](base.md#base.config.loadConfig)
    - fn [cmdWire](../../src/cli.ts#L858) (out: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWire"></a>
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdDoctor](../../src/cli.ts#L872) () → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDoctor"></a><br>What is set up. A problem it finds (a key file others can read, a native module without its binary) is a line of the report, not a failure: cli.md, code 0.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [cmdTracePlan](../../src/cli.ts#L887) (flow: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdTracePlan"></a><br>A printer over the shared trace-plan operation: the plan's JSON to stdout and nothing else.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [needPaths](../../src/cli.ts#L895) (cmd: string, paths: string[]) → void <!-- internal -->
      <a id="cli.cli.needPaths"></a><br>Guard that throws an `Error` naming the offending command when the argument list is empty, so [`cli.cli.run`](cli.md#cli.cli.run) can reject subcommands invoked without any path operands before doing any work. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [cmdInit](../../src/cli.ts#L900) (dir: string, opts: { agents: string | undefined; check: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdInit"></a><br>`init [dir] [--agents=LIST] [--check]`: a printer over the shared init operation, stage by stage in the order the stages ran.
      - calls [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [operations.generate.initSources](operations.md#operations.generate.initSources), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [cli.cli.printAgents](cli.md#cli.cli.printAgents), [cli.cli.printBaseline](cli.md#cli.cli.printBaseline), [cli.cli.printGitignore](cli.md#cli.cli.printGitignore), [cli.cli.printMap](cli.md#cli.cli.printMap)
    - fn [printGitignore](../../src/cli.ts#L952) (stage: GitignoreStage) → void <!-- internal -->
      <a id="cli.cli.printGitignore"></a><br>The `.gitignore` line of init: an I/O error to stderr; added, not listed, or a refusal's reason to stdout, as the file lines of the other stages.
      - calls [operations.generate.gitignoreMessage](operations.md#operations.generate.gitignoreMessage)
    - fn [cmdAgents](../../src/cli.ts#L960) (root: string, harnesses: HarnessChoice, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdAgents"></a><br>`agents [--agents=LIST] [--check]`: a printer over the shared agents operation.
      - calls [cli.cli.printAgents](cli.md#cli.cli.printAgents), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [printAgents](../../src/cli.ts#L965) (result: OperationEnvelope<"agents">) → number <!-- internal -->
      <a id="cli.cli.printAgents"></a><br>File lines to stdout (`stale`, `written`, `removed`, a refusal's reasons); failures to stderr.
    - fn [cmdBaseline](../../src/cli.ts#L984) (root: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdBaseline"></a><br>`baseline [--check]`: a printer over the shared baseline operation. Lines for the file go to stdout; failures to stderr.
      - calls [cli.cli.printBaseline](cli.md#cli.cli.printBaseline), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [printBaseline](../../src/cli.ts#L988) (result: OperationEnvelope<"baseline">) → number <!-- internal -->
      <a id="cli.cli.printBaseline"></a><br>Writes the messages of a baseline operation envelope to stdout or stderr, routing them to stderr with a `keylang:` prefix when the payload is missing, errored, or lists refused entries, then returns the envelope's exit code (defaulting to 2). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [cmdFeature](../../src/cli.ts#L1003) (slug: string | undefined, format: string, since: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFeature"></a><br>Whether a feature is done, on the saved files. The CLI is a printer over the shared feature operation.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.feature.featureSummary](operations.md#operations.feature.featureSummary)
    - fn [cmdHook](../../src/cli.ts#L1019) (args: readonly string[], checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHook"></a><br>`hook stop` and `hook install [--check]`. A missing or unknown subcommand and an extra argument are a bad invocation (2).
      - calls [cli.cli.cmdHookInstall](cli.md#cli.cli.cmdHookInstall), [cli.cli.cmdHookStop](cli.md#cli.cli.cmdHookStop)
    - fn [cmdHookStop](../../src/cli.ts#L1034) () → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHookStop"></a><br>`hook stop`: once the invocation is valid, exactly one JSON object on stdout and code 0. A harness reads code 2 of a Stop hook as a blocking error the agent cannot act on, so a failure — stdin that is not a JSON event, git missing or refused, a broken keylang.json, an analysis…
      - calls [cli.cli.stopDecision](cli.md#cli.cli.stopDecision), [cli.cli.readStdin](cli.md#cli.cli.readStdin), [features.changed.uncheckedTurn](features.md#features.changed.uncheckedTurn)
    - fn [stopDecision](../../src/cli.ts#L1048) (input: string, cwd: string) → Promise<string> <!-- internal -->
      <a id="cli.cli.stopDecision"></a><br>The Stop decision for the event on stdin: the fails of `check --changed` in `cwd`'s repository. Throws when the turn cannot be checked.
      - calls [features.changed.parseHookEvent](features.md#features.changed.parseHookEvent), [features.changed.hookDecision](features.md#features.changed.hookDecision), [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.analyze.analyze](map.md#map.analyze.analyze), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [features.git-changes.changedPathSet](features.md#features.git-changes.changedPathSet), [features.changed.filterChanged](features.md#features.changed.filterChanged), [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [features.changed.hookFails](features.md#features.changed.hookFails)
    - fn [cmdHookInstall](../../src/cli.ts#L1069) (checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHookInstall"></a><br>`hook install [--check]`: keylang's pre-commit hook in git's hooks directory. A hook without keylang's marker is someone else's: install refuses with 2 and names the line to add; --check counts it as not installed.
      - calls [cli.cli.packageVersion](cli.md#cli.cli.packageVersion), [base.config.toPosix](base.md#base.config.toPosix), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [cmdNew](../../src/cli.ts#L1098) (args: readonly string[], layer: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdNew"></a><br>`new flow <name>`, `new module <name> --layer <layer>`: a skeleton spec, never over an existing file.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.loadConfig](base.md#base.config.loadConfig), [cli.cli.plannedModuleTemplate](cli.md#cli.cli.plannedModuleTemplate), [base.config.toPosix](base.md#base.config.toPosix), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [plannedModuleTemplate](../../src/cli.ts#L1140) (layer: string, name: string) → string <!-- internal -->
      <a id="cli.cli.plannedModuleTemplate"></a><br>A module that has no code yet is an intention: `planned module` at the top of a flow section (format §5), in a feature file named after it. The prose says why a module request gets a flow heading; it is not part of the grammar.
    - fn [cmdCompletions](../../src/cli.ts#L1148) (shell: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCompletions"></a><br>`completions <shell>`: commands from the help text, flags from the parser's table.
    - fn [packageVersion](../../src/cli.ts#L1156) () → string <!-- internal -->
      <a id="cli.cli.packageVersion"></a><br>Reads the repository's `package.json` via a CommonJS `require` built from the module URL and returns its `version` field. Used by [`cli.cli.cmdHookInstall`](cli.md#cli.cli.cmdHookInstall) to stamp the installed hook with the current version. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readStdin](../../src/cli.ts#L1160) () → Promise<string> <!-- internal -->
      <a id="cli.cli.readStdin"></a><br>Drains `process.stdin` to completion, buffering each chunk and decoding the concatenated bytes as UTF-8 into a single string. Used by [`cli.cli.cmdHook`](cli.md#cli.cli.cmdHook) to receive the hook payload piped in by the caller. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [cmdMap](../../src/cli.ts#L1166) (dir: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdMap"></a><br>Resolves the target directory and runs the shared map operation via [`operations.operations.runOperation`](operations.md#operations.operations.runOperation), printing results with [`cli.cli.printMap`](cli.md#cli.cli.printMap). In check mode it prints conflicts and stale files via [`operations.generate.mapCheckLines`](operations.md#operations.generate.mapCheckLines) and returns the exit code. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [operations.generate.mapCheckLines](operations.md#operations.generate.mapCheckLines), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.printMap](cli.md#cli.cli.printMap)
    - fn [printMap](../../src/cli.ts#L1184) (result: OperationEnvelope<"map">, root: string) → number <!-- internal -->
      <a id="cli.cli.printMap"></a><br>The lines of a map write: paths relative to the working directory; failures and the summary to stderr.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [operations.generate.mapConflictLines](operations.md#operations.generate.mapConflictLines), [operations.generate.mapStepLines](operations.md#operations.generate.mapStepLines), [operations.generate.mapSummary](operations.md#operations.generate.mapSummary)
    - fn [cmdParse](../../src/cli.ts#L1215) (paths: string[], json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdParse"></a><br>A printer over the shared parse operation: the tree or the JSON to stdout and nothing else; the notes on skipped explanations and the diagnostics to stderr.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [cmdCheck](../../src/cli.ts#L1226) (paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string | undefined; changed: boolean; since: string | undefined; stale: boolean; accept: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCheck"></a><br>Validates check flag combinations, delegating `--stale` to [`cli.cli.cmdCheckStale`](cli.md#cli.cli.cmdCheckStale), and runs either an explain-edge or check operation via [`operations.operations.runOperation`](operations.md#operations.operations.runOperation), printing the formatted report and summary, returning the exit code. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.cli.cmdCheckStale](cli.md#cli.cli.cmdCheckStale), [features.check-format.isCheckFormat](features.md#features.check-format.isCheckFormat), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [operations.spec.checkSkipNote](operations.md#operations.spec.checkSkipNote), [features.check-format.checkReportText](features.md#features.check-format.checkReportText), [operations.spec.checkSummary](operations.md#operations.spec.checkSummary)
    - fn [cmdCheckStale](../../src/cli.ts#L1283) (paths: string[], accept: boolean, strict: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCheckStale"></a><br>`check --stale`: one line per statement to review on stdout (stale, new, or unchanged but incomplete) and per obsolete baseline entry, the counts on stderr. Stale is a warning: the code is 0 unless the invocation or I/O fails; with `strict`, any such line is 1, so CI can gate…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [cmdFmt](../../src/cli.ts#L1304) (paths: string[], checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFmt"></a><br>Each file is formatted on its own, so one that cannot be read or written does not stop the rest: every such failure is reported, and the code is 2; otherwise 1 for diagnostics or, with `--check`, an unformatted file. The CLI is a printer over the shared fmt operation: stdout…
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.spec.fmtGeneratedNote](operations.md#operations.spec.fmtGeneratedNote)
  - module [completions](../../src/completions.ts#L1)
    <a id="cli.completions"></a><br>`keylang completions <shell>`: a completion script for bash, zsh or fish. The words come from the help text (commands and their subcommands) and the option table of the argument parser, so a new command or flag is completed as soon as `--help` and the parser know it.
    - type [Shell](../../src/completions.ts#L7) = (typeof SHELLS)[number]
      <a id="cli.completions.Shell"></a><br>Union type of the shell names listed in the `SHELLS` array, derived by indexing its element type so the two can't drift apart. Used to constrain which shell a completion script is generated for. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isShell](../../src/completions.ts#L9) (name: string) → name is Shell
      <a id="cli.completions.isShell"></a><br>Type guard that checks whether a string is one of the names in the `SHELLS` list, narrowing it to `Shell` when it matches. Used by [`cli.cli.cmdCompletions`](cli.md#cli.cli.cmdCompletions) to validate the user-supplied shell argument. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CompletionWords](../../src/completions.ts#L14)
      <a id="cli.completions.CompletionWords"></a><br>What the script completes: commands in help order, each with its subcommands; long flags with an optional short one.
    - fn [helpCommands](../../src/completions.ts#L27) (usage: string) → Map<string, string[]>
      <a id="cli.completions.helpCommands"></a><br>Commands of the `Commands:` block of the help: a line indented by exactly two spaces starts with a command; a plain word after it (`hook stop`, `draft flow <trigger>`) is a subcommand. Placeholders and flags are not.
    - fn [completionScript](../../src/completions.ts#L48) (shell: Shell, words: CompletionWords) → string
      <a id="cli.completions.completionScript"></a><br>Dispatches on the shell name to [`cli.completions.bashScript`](cli.md#cli.completions.bashScript), [`cli.completions.zshScript`](cli.md#cli.completions.zshScript), or [`cli.completions.fishScript`](cli.md#cli.completions.fishScript), returning the generated completion script text. Used by [`cli.cli.cmdCompletions`](cli.md#cli.cli.cmdCompletions) to emit the script for the user's shell. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [cli.completions.bashScript](cli.md#cli.completions.bashScript), [cli.completions.zshScript](cli.md#cli.completions.zshScript), [cli.completions.fishScript](cli.md#cli.completions.fishScript)
    - fn [flagWords](../../src/completions.ts#L59) (words: CompletionWords) → string[] <!-- internal -->
      <a id="cli.completions.flagWords"></a><br>Expands the flag definitions in the input into literal shell tokens, emitting `--long` for every flag plus `-x` when a short form is present. Feeds the word lists that [`cli.completions.bashScript`](cli.md#cli.completions.bashScript) and [`cli.completions.zshScript`](cli.md#cli.completions.zshScript) embed in their generated completion scripts. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [withSubcommands](../../src/completions.ts#L63) (words: CompletionWords) → [string, readonly string[]][] <!-- internal -->
      <a id="cli.completions.withSubcommands"></a><br>Filters the command table in `words.commands` down to the entries whose subcommand list is non-empty, returning them as name/subcommands pairs. Shared by [`cli.completions.bashScript`](cli.md#cli.completions.bashScript), [`cli.completions.fishScript`](cli.md#cli.completions.fishScript) and [`cli.completions.zshScript`](cli.md#cli.completions.zshScript) to emit nested completion rules. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [bashScript](../../src/completions.ts#L67) (words: CompletionWords) → string <!-- internal -->
      <a id="cli.completions.bashScript"></a><br>Builds the text of a bash completion function that offers flag names from [`cli.completions.flagWords`](cli.md#cli.completions.flagWords) when the current word starts with `-`, top-level command names at position 1, and per-command subcommands from [`cli.completions.withSubcommands`](cli.md#cli.completions.withSubcommands) at position 2. Registers it… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [cli.completions.withSubcommands](cli.md#cli.completions.withSubcommands), [cli.completions.flagWords](cli.md#cli.completions.flagWords)
    - fn [zshScript](../../src/completions.ts#L89) (words: CompletionWords) → string <!-- internal -->
      <a id="cli.completions.zshScript"></a><br>Builds the zsh completion script text: a `_keylang` function that offers flags from [`cli.completions.flagWords`](cli.md#cli.completions.flagWords) for dash-prefixed words, top-level commands at position 2, and per-command subcommands from [`cli.completions.withSubcommands`](cli.md#cli.completions.withSubcommands) at position 3, then falls back to file… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [cli.completions.withSubcommands](cli.md#cli.completions.withSubcommands), [cli.completions.flagWords](cli.md#cli.completions.flagWords)
    - fn [fishScript](../../src/completions.ts#L115) (words: CompletionWords) → string <!-- internal -->
      <a id="cli.completions.fishScript"></a><br>Builds the fish shell completion script text: one `complete` line offering top-level commands, one per command listing its subcommands via [`cli.completions.withSubcommands`](cli.md#cli.completions.withSubcommands), and one per flag with its long and optional short name. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [cli.completions.withSubcommands](cli.md#cli.completions.withSubcommands)
  - module [index](../../src/index.ts#L1)
    <a id="cli.index"></a><br>keylang core: IR, Markdown parser, cross-file resolver, formatter.
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - resolve [check.resolve](check.md#check.resolve)
    - span [base.span](base.md#base.span)
  - module [lsp](../../src/lsp.ts#L1)
    <a id="cli.lsp"></a><br>Stdio language server. It keeps the open buffers and analyses them (the same `analyze()` as `keylang check`, with the buffers as an overlay; nothing is written).
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - explanations [map.explanations](map.md#map.explanations)
    - type [Rpc](../../src/lsp.ts#L20) <!-- internal -->
      <a id="cli.lsp.Rpc"></a><br>Describes the shape of a single JSON-RPC message with all fields optional, so one type covers requests, notifications, and success or error responses exchanged over the language server channel. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [serveLsp](../../src/lsp.ts#L33) (read: NodeJS.ReadableStream = process.stdin, write: NodeJS.WritableStream = process.stdout) → Promise<number>
      <a id="cli.lsp.serveLsp"></a><br>Runs a language server over stdio, framing Content-Length messages and passing parsed JSON objects to [`cli.lsp.Server.receive`](cli.md#cli.lsp.Server.receive), rejecting malformed ones via [`cli.lsp.Server.reject`](cli.md#cli.lsp.Server.reject). Resolves to the server's exit code, or 2 on a missing header. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.lsp.Server](cli.md#cli.lsp.Server), [cli.lsp.Server.drain](cli.md#cli.lsp.Server.drain), [cli.lsp.Server.reject](cli.md#cli.lsp.Server.reject), [cli.lsp.Server.receive](cli.md#cli.lsp.Server.receive)
    - type [Finished](../../src/lsp.ts#L81) <!-- internal -->
      <a id="cli.lsp.Finished"></a><br>An analysis of the buffers as they were at `generation`, or why it failed.
    - module [Server](../../src/lsp.ts#L83) <!-- internal -->
      <a id="cli.lsp.Server"></a><br>Language server session state that keeps open-document buffers, answers or cancels JSON-RPC requests via [`cli.lsp.Server.receive`](cli.md#cli.lsp.Server.receive), and debounces re-analysis through [`cli.lsp.Server.changed`](cli.md#cli.lsp.Server.changed) to publish diagnostics. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - fn [constructor](../../src/lsp.ts#L110) (send: (message: Rpc) => void)
        <a id="cli.lsp.Server.constructor"></a><br>Stores the injected callback for emitting outgoing JSON-RPC messages so the server can later push responses and notifications without owning the transport itself. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [reject](../../src/lsp.ts#L114) (id: number | string | null, code: number, message: string) → void
        <a id="cli.lsp.Server.reject"></a><br>Builds a JSON-RPC 2.0 error response with the given id, error code and message, and sends it to the client. [`cli.lsp.serveLsp`](cli.md#cli.lsp.serveLsp) uses it, with a null id, to answer a message it cannot parse or that is not a JSON object; a failed request is answered elsewhere. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [receive](../../src/lsp.ts#L118) (message: Rpc) → void
        <a id="cli.lsp.Server.receive"></a><br>Dispatches one incoming JSON-RPC message: invalid ids or methods go to [`cli.lsp.Server.reject`](cli.md#cli.lsp.Server.reject), and notifications go to [`cli.lsp.Server.notify`](cli.md#cli.lsp.Server.notify), with failures logged to stderr. Requests go to [`cli.lsp.Server.request`](cli.md#cli.lsp.Server.request); each reply is sent unless the request was cancelled. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [cli.lsp.Server.reject](cli.md#cli.lsp.Server.reject), [cli.lsp.Server.notify](cli.md#cli.lsp.Server.notify), [cli.lsp.Server.request](cli.md#cli.lsp.Server.request)
      - fn [drain](../../src/lsp.ts#L162) () → Promise<void>
        <a id="cli.lsp.Server.drain"></a><br>Repeatedly awaits every in-flight request promise until the pending set is empty, then cancels any scheduled timer so the server can shut down cleanly; [`cli.lsp.serveLsp`](cli.md#cli.lsp.serveLsp) calls it at the end of a session. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [notify](../../src/lsp.ts#L167) (method: string, params: Record<string, unknown>) → void <!-- internal -->
        <a id="cli.lsp.Server.notify"></a><br>Handles LSP notifications: sets the exit code, drops anything before initialization, syncs open-document buffers via [`cli.lsp.Server.edited`](cli.md#cli.lsp.Server.edited) and calls [`cli.lsp.Server.changed`](cli.md#cli.lsp.Server.changed), and errors out cancelled pending requests. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [cli.lsp.filePath](cli.md#cli.lsp.filePath), [cli.lsp.Server.changed](cli.md#cli.lsp.Server.changed), [cli.lsp.Server.edited](cli.md#cli.lsp.Server.edited)
      - fn [edited](../../src/lsp.ts#L215) (text: string | null, changes: unknown) → string | null <!-- internal -->
        <a id="cli.lsp.Server.edited"></a><br>The text of a buffer after a `didChange`. The server asks for the whole text (`change: 1`); a client that sends ranges anyway gets them applied in order to the text it has (an unopened buffer has none) and a note in stderr, once.
        - calls [cli.lsp.isRange](cli.md#cli.lsp.isRange), [cli.lsp.replaceRange](cli.md#cli.lsp.replaceRange)
      - fn [changed](../../src/lsp.ts#L233) () → void <!-- internal -->
        <a id="cli.lsp.Server.changed"></a><br>A new generation: the analysis running now, if any, no longer covers the buffers.
        - calls [cli.lsp.Server.publish](cli.md#cli.lsp.Server.publish)
      - fn [analyse](../../src/lsp.ts#L243) () → Promise<void> <!-- internal -->
        <a id="cli.lsp.Server.analyse"></a><br>Starts an analysis of the buffers as they are now; one runs at a time.
        - calls [map.analyze.analyze](map.md#map.analyze.analyze), [cli.lsp.Server.report](cli.md#cli.lsp.Server.report)
      - fn [current](../../src/lsp.ts#L264) (needed: number, cancelled: () => boolean = () => false) → Promise<Workspace> <!-- internal -->
        <a id="cli.lsp.Server.current"></a><br>The newest finished analysis that includes generation `needed`. While another analysis runs, this waits for it and then starts one for all the changes so far; a request cancelled meanwhile starts none.
        - calls [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [cli.lsp.LspError](cli.md#cli.lsp.LspError), [cli.lsp.Server.analyse](cli.md#cli.lsp.Server.analyse)
      - fn [publish](../../src/lsp.ts#L282) () → Promise<void> <!-- internal -->
        <a id="cli.lsp.Server.publish"></a><br>Once the latest workspace is built via [`cli.lsp.Server.current`](cli.md#cli.lsp.Server.current) (stale generations are dropped), asks pull-mode clients to refresh diagnostics. Otherwise it pushes [`features.lsp-features.diagnosticsFor`](features.md#features.lsp-features.diagnosticsFor) results per open buffer and clears closed files. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [cli.lsp.Server.current](cli.md#cli.lsp.Server.current), [features.lsp-features.diagnosticsFor](features.md#features.lsp-features.diagnosticsFor), [cli.lsp.Server.relative](cli.md#cli.lsp.Server.relative)
      - fn [relative](../../src/lsp.ts#L307) (abs: string) → string <!-- internal -->
        <a id="cli.lsp.Server.relative"></a><br>Converts an absolute file path into a POSIX-style path relative to the server root when [`map.analyze.within`](map.md#map.analyze.within) confirms it lies under that root, otherwise returns the path unchanged through [`base.config.toPosix`](base.md#base.config.toPosix). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.within](map.md#map.analyze.within)
      - fn [report](../../src/lsp.ts#L312) (message: string) → void <!-- internal -->
        <a id="cli.lsp.Server.report"></a><br>In stderr (the client's log) and as a message the editor shows, once while the same failure lasts.
      - fn [request](../../src/lsp.ts#L319) (method: string, params: Record<string, unknown>, cancelled: () => boolean) → Promise<unknown> <!-- internal -->
        <a id="cli.lsp.Server.request"></a><br>Dispatches LSP requests after enforcing initialize/shutdown ordering, syncing inline buffer text, then awaits a current workspace via [`cli.lsp.Server.current`](cli.md#cli.lsp.Server.current) and routes to [`features.lsp-features.hover`](features.md#features.lsp-features.hover) and sibling handlers. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [cli.lsp.LspError](cli.md#cli.lsp.LspError), [cli.lsp.Server.initialize](cli.md#cli.lsp.Server.initialize), [cli.lsp.filePath](cli.md#cli.lsp.filePath), [cli.lsp.Server.current](cli.md#cli.lsp.Server.current), [cli.lsp.Server.relative](cli.md#cli.lsp.Server.relative), [features.lsp-features.diagnosticsFor](features.md#features.lsp-features.diagnosticsFor), [features.lsp-features.hover](features.md#features.lsp-features.hover), [features.lsp-features.definition](features.md#features.lsp-features.definition), [features.lsp-features.references](features.md#features.lsp-features.references), [features.lsp-features.documentSymbols](features.md#features.lsp-features.documentSymbols), [features.lsp-features.completions](features.md#features.lsp-features.completions), [features.lsp-features.signatureHelp](features.md#features.lsp-features.signatureHelp), [features.lsp-features.codeLenses](features.md#features.lsp-features.codeLenses), [features.lsp-features.workspaceSymbols](features.md#features.lsp-features.workspaceSymbols), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs)
      - fn [initialize](../../src/lsp.ts#L375) (params: Record<string, unknown>) → unknown <!-- internal -->
        <a id="cli.lsp.Server.initialize"></a><br>The capabilities; the server's state changes only once everything else succeeded.
        - calls [cli.lsp.filePath](cli.md#cli.lsp.filePath), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - module [LspError](../../src/lsp.ts#L409) <!-- internal -->
      <a id="cli.lsp.LspError"></a><br>Error subclass carrying a numeric JSON-RPC-style code alongside the message, so callers catching failures from the language server can branch on the code rather than parsing text. Construction via [`cli.lsp.LspError.constructor`](cli.md#cli.lsp.LspError.constructor) just forwards the message and stores the code. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [constructor](../../src/lsp.ts#L411) (code: number, message: string)
        <a id="cli.lsp.LspError.constructor"></a><br>Builds a JSON-RPC style error by passing the message to the base `Error` constructor and storing the numeric code on the instance for callers to inspect. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [filePath](../../src/lsp.ts#L417) (uri: string) → string <!-- internal -->
      <a id="cli.lsp.filePath"></a><br>Converts an LSP document URI into an absolute filesystem path: `file:` URIs are decoded via `fileURLToPath`, anything else is resolved relative to the current working directory. Used by [`cli.lsp.Server.initialize`](cli.md#cli.lsp.Server.initialize), [`cli.lsp.Server.notify`](cli.md#cli.lsp.Server.notify), and [`cli.lsp.Server.request`](cli.md#cli.lsp.Server.request) to map… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LspRange](../../src/lsp.ts#L421) <!-- internal -->
      <a id="cli.lsp.LspRange"></a>
    - fn [isRange](../../src/lsp.ts#L426) (value: unknown) → value is LspRange <!-- internal -->
      <a id="cli.lsp.isRange"></a>
    - fn [replaceRange](../../src/lsp.ts#L432) (text: string, range: LspRange, insert: string) → string <!-- internal -->
      <a id="cli.lsp.replaceRange"></a><br>`text` with `range` replaced by `insert`. Characters are UTF-16 code units, as JavaScript counts them.
      - calls [cli.lsp.offsetAt](cli.md#cli.lsp.offsetAt)
    - fn [offsetAt](../../src/lsp.ts#L438) (text: string, position: LspPosition) → number <!-- internal -->
      <a id="cli.lsp.offsetAt"></a><br>The offset of a position; past the end of its line is the line's end, past the last line the text's end.
      - calls [cli.lsp.lineBreak](cli.md#cli.lsp.lineBreak)
    - fn [lineBreak](../../src/lsp.ts#L450) (text: string, from: number) → { at: number; after: number } | null <!-- internal -->
      <a id="cli.lsp.lineBreak"></a><br>The first line break at or after `from`: `\r\n`, `\n` or `\r`, as LSP counts lines.
  - module [mcp](../../src/mcp.ts#L1)
    <a id="cli.mcp"></a><br>`keylang mcp`: the analysis for external agents over MCP (stdio), design §7.3. The graph by default, code on request: `search`, `node`, `code`, `flows`, `check` (the same results as `check --format json`), `explain` (a saved explanation or the offline summary) and `apply_diff`…
    - modelcontextprotocol-sdk [external.modelcontextprotocol-sdk](external.md#external.modelcontextprotocol-sdk)
    - node [external.node](external.md#external.node)
    - zod [external.zod](external.md#external.zod)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - analyze [map.analyze](map.md#map.analyze)
    - check-results [features.check-results](features.md#features.check-results)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - operations [operations.operations](operations.md#operations.operations)
    - spec-to-code [features.spec-to-code](features.md#features.spec-to-code)
    - config [base.config](base.md#base.config)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explanations [map.explanations](map.md#map.explanations)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - proposals [features.proposals](features.md#features.proposals)
    - type [ToolResult](../../src/mcp.ts#L34) <!-- internal -->
      <a id="cli.mcp.ToolResult"></a><br>Shape of the value an MCP tool handler returns: a list of text-only content blocks plus an optional flag marking the response as an error. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [json](../../src/mcp.ts#L36) (value: unknown) → ToolResult <!-- internal -->
      <a id="cli.mcp.json"></a><br>Wraps any value into an MCP tool result whose single content item is the value pretty-printed as 2-space-indented JSON text. Used by [`cli.mcp.mcpServer`](cli.md#cli.mcp.mcpServer) to format tool responses. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [failure](../../src/mcp.ts#L37) (message: string) → ToolResult <!-- internal -->
      <a id="cli.mcp.failure"></a><br>Wraps an error message into a `ToolResult` with a single text content block and `isError` set to true, giving [`cli.mcp.mcpServer`](cli.md#cli.mcp.mcpServer) a uniform way to report tool failures to MCP clients. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [currentAnalysis](../../src/mcp.ts#L50) (root: string) → () => Promise<Analysis>
      <a id="cli.mcp.currentAnalysis"></a><br>The analysis of the current inputs, cheaper than a new `analyze()` per call. The snapshot is rebuilt every time: its id hashes all the graph depends on (sources, configuration, the files import resolution read).
      - calls [lang.files.existingText](lang.md#lang.files.existingText), [base.config.loadConfig](base.md#base.config.loadConfig), [map.map.generateMap](map.md#map.map.generateMap), [map.fact-cache.keepsFactCache](map.md#map.fact-cache.keepsFactCache), [map.fact-cache.saveFactCache](map.md#map.fact-cache.saveFactCache), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [map.analyze.analyze](map.md#map.analyze.analyze)
    - fn [explanationJson](../../src/mcp.ts#L71) (e: NodeExplanation | null) → { text: string; origin: "doc" | "llm"; stale: boolean; agent?: string; date?: string } | null <!-- internal -->
      <a id="cli.mcp.explanationJson"></a><br>A node's explanation for an agent: its text, where it comes from, and for a model's brief the model, the date and whether the code changed since.
    - fn [mcpServer](../../src/mcp.ts#L76) (root: string, version: string) → McpServer
      <a id="cli.mcp.mcpServer"></a><br>Builds the keylang MCP server, registering tools for search, node details, source code, flows, checks, explanations, context bundles, spec validation, scaffolding via [`features.spec-to-code.specToCode`](features.md#features.spec-to-code.specToCode) and spec proposals via [`features.proposals.writeProposal`](features.md#features.proposals.writeProposal). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.mcp.currentAnalysis](cli.md#cli.mcp.currentAnalysis), [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [cli.mcp.json](cli.md#cli.mcp.json), [cli.mcp.explanationJson](cli.md#cli.mcp.explanationJson), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [cli.mcp.failure](cli.md#cli.mcp.failure), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.check-results.checkResults](features.md#features.check-results.checkResults), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [lang.files.existingText](lang.md#lang.files.existingText), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [features.proposals.lineDiff](features.md#features.proposals.lineDiff), [base.config.specPath](base.md#base.config.specPath), [features.agent-context.contextForIds](features.md#features.agent-context.contextForIds), [features.feature-status.idsIn](features.md#features.feature-status.idsIn), [map.analyze.within](map.md#map.analyze.within), [map.analyze.analyze](map.md#map.analyze.analyze), [features.spec-to-code.specToCode](features.md#features.spec-to-code.specToCode), [base.diag.errorText](base.md#base.diag.errorText), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [serveMcp](../../src/mcp.ts#L309) (root: string, version: string) → Promise<number>
      <a id="cli.mcp.serveMcp"></a><br>Builds the MCP server via [`cli.mcp.mcpServer`](cli.md#cli.mcp.mcpServer), connects it to a stdio transport, and blocks until the client closes stdin. Then it resolves with exit code 0, so it acts as the CLI's long-running MCP entry point. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.mcp.mcpServer](cli.md#cli.mcp.mcpServer)
