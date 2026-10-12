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
    - type [TestEvent](../../src/adapters/node-test.ts#L20) <!-- internal -->
      <a id="cli.node-test.TestEvent"></a><br>The subset of a `node:test` reporter event this reporter reads.
    - fn [keylangReporter](../../src/adapters/node-test.ts#L26) (source: AsyncIterable<TestEvent>) → AsyncGenerator<string>
      <a id="cli.node-test.keylangReporter"></a><br>Collects pass/fail/skip results from `node:test` events and writes them as a JSON report when the run ends.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.map.generateMap](map.md#map.map.generateMap), [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [cli.run-id.runId](cli.md#cli.run-id.runId)
  - module [run-id](../../src/adapters/run-id.ts#L1)
    <a id="cli.run-id"></a><br>One id for the reports and traces of a test run: KEYLANG_TRACE_RUN when the runner sets it, otherwise the time and the process. Shared by the test adapters (node-test reporter, trace hooks) so that a test report and the traces written during the same run can be matched by…
    - fn [runId](../../src/adapters/run-id.ts#L7) () → string
      <a id="cli.run-id.runId"></a><br>The id of the current test run: the runner's KEYLANG_TRACE_RUN, else a base-36 timestamp plus the pid.
  - module [trace-hooks](../../src/adapters/trace-hooks.ts#L1)
    <a id="cli.trace-hooks"></a><br>Module hooks for the trace adapter (they run on Node's hooks thread, with a module graph of their own). `initialize` builds the snapshot and finds the symbols of one flow, or reads them from a `keylang trace-plan` file, and plans a wrapper for each function body; `load` applies…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - json [base.json](base.md#base.json)
    - bodies [extract.bodies](extract.md#extract.bodies)
    - map [map.map](map.md#map.map)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - type [TraceHooksData](../../src/adapters/trace-hooks.ts#L23)
      <a id="cli.trace-hooks.TraceHooksData"></a><br>What the adapter passes to `initialize` when it registers these hooks.
    - type [TracePlanMessage](../../src/adapters/trace-hooks.ts#L42)
      <a id="cli.trace-hooks.TracePlanMessage"></a><br>Hooks → adapter. `plan` once from `initialize`: the flow's functions a wrapper was planned for, and the real path of each file that holds them. `loaded` from `load` for each file the plan was applied to (`commonjs` when Node compiles it as CommonJS); `skipped` for a planned…
    - type [FilePlan](../../src/adapters/trace-hooks.ts#L48) <!-- internal -->
      <a id="cli.trace-hooks.FilePlan"></a><br>The plan for one file: its expected hash, the instrumented source and the IDs wrapped in it.
    - fn [initialize](../../src/adapters/trace-hooks.ts#L62) (data: TraceHooksData) → Promise<void>
      <a id="cli.trace-hooks.initialize"></a><br>Build the wrapper plan for every planned file and post a `plan` message; never throws, errors go in the message.
      - calls [cli.trace-hooks.readPlan](cli.md#cli.trace-hooks.readPlan), [cli.trace-hooks.flowPlan](cli.md#cli.trace-hooks.flowPlan), [map.snapshot.sha256](map.md#map.snapshot.sha256), [extract.bodies.functionBodies](extract.md#extract.bodies.functionBodies), [cli.trace-hooks.wrap](cli.md#cli.trace-hooks.wrap), [cli.trace-hooks.applyEdits](cli.md#cli.trace-hooks.applyEdits), [extract.bodies.parsesCleanly](extract.md#extract.bodies.parsesCleanly)
    - type [PlannedSymbol](../../src/adapters/trace-hooks.ts#L140) <!-- internal -->
      <a id="cli.trace-hooks.PlannedSymbol"></a><br>A function to wrap and where the snapshot saw it.
    - fn [flowPlan](../../src/adapters/trace-hooks.ts#L150) (root: string, flow: string) → Promise<{ snapshotId: string; symbols: PlannedSymbol[] }> <!-- internal -->
      <a id="cli.trace-hooks.flowPlan"></a><br>The trigger and steps of `flow`, from the specs and a fresh snapshot.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.flowSymbols](map.md#map.trace-plan.flowSymbols)
    - type [TracePlanFile](../../src/adapters/trace-hooks.ts#L168) <!-- internal -->
      <a id="cli.trace-hooks.TracePlanFile"></a><br>A plan read from a `keylang trace-plan` file.
    - fn [readPlan](../../src/adapters/trace-hooks.ts#L175) (path: string) → TracePlanFile
      <a id="cli.trace-hooks.readPlan"></a><br>A `keylang trace-plan` file (schema 1): its snapshot, flow and symbols; anything else is an error naming the file.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - type [Edit](../../src/adapters/trace-hooks.ts#L206) <!-- internal -->
      <a id="cli.trace-hooks.Edit"></a><br>Text inserted at an offset of the original source.
    - fn [wrap](../../src/adapters/trace-hooks.ts#L212) (id: string, body: FunctionBody) → Edit[] <!-- internal -->
      <a id="cli.trace-hooks.wrap"></a><br>`{ BODY }` → `{ return __keylangTrace.run(id, () => { BODY }); }`; an arrow keeps `this` and `arguments`.
    - fn [applyEdits](../../src/adapters/trace-hooks.ts#L231) (src: string, edits: readonly Edit[]) → string <!-- internal -->
      <a id="cli.trace-hooks.applyEdits"></a><br>Insert every edit; edits at one offset keep the order they were made in.
    - type [ModuleSource](../../src/adapters/trace-hooks.ts#L243) = NonNullable<LoadFnOutput["source"]> <!-- internal -->
      <a id="cli.trace-hooks.ModuleSource"></a>
    - fn [isSourceText](../../src/adapters/trace-hooks.ts#L245) (source: ModuleSource) → source is string <!-- internal -->
      <a id="cli.trace-hooks.isSourceText"></a>
    - fn [load](../../src/adapters/trace-hooks.ts#L253) ( url: string, context: LoadHookContext, nextLoad: (url: string, context?: Partial<LoadHookContext>) => LoadFnOutput | Promise<LoadFnOutput>, ) → Promise<LoadFnOutput>
      <a id="cli.trace-hooks.load"></a><br>Node's load hook: serve the instrumented source for planned files whose content still matches the plan.
      - calls [cli.trace-hooks.isSourceText](cli.md#cli.trace-hooks.isSourceText), [map.snapshot.sha256](map.md#map.snapshot.sha256)
  - module [trace](../../src/adapters/trace.ts#L1)
    <a id="cli.trace"></a><br>Trace adapter for TS/JS: `node --import keylang/trace …` (in this repository: `--import ./src/adapters/trace.ts`). Environment: KEYLANG_TRACE JSONL file to append to; without it the adapter does nothing (a relative path, like the root and the plan, is resolved once against the…
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - run-id [cli.run-id](cli.md#cli.run-id)
    - trace-hooks [cli.trace-hooks](cli.md#cli.trace-hooks)
    - type [Scope](../../src/adapters/trace.ts#L40) <!-- internal -->
      <a id="cli.trace.Scope"></a><br>One run being recorded: the process's own, or one request's (`withFlow`).
    - type [Span](../../src/adapters/trace.ts#L51) <!-- internal -->
      <a id="cli.trace.Span"></a><br>One call of an instrumented function, and the run it belongs to.
    - type [Plan](../../src/adapters/trace.ts#L58) = Extract<TracePlanMessage, { kind: "plan" }> <!-- internal -->
      <a id="cli.trace.Plan"></a>
    - type [TraceApi](../../src/adapters/trace.ts#L61) <!-- internal -->
      <a id="cli.trace.TraceApi"></a><br>What the adapter puts on `globalThis`: the wrappers' entry and the request scopes.
    - type [TraceEvent](../../src/adapters/trace.ts#L76) <!-- internal -->
      <a id="cli.trace.TraceEvent"></a><br>Fields of one JSONL event after the common ones. An optional field set to `undefined` is left out of the line by `JSON.stringify`.
    - fn [api](../../src/adapters/trace.ts#L92) () → TraceApi | undefined <!-- internal -->
      <a id="cli.trace.api"></a>
    - fn [withFlow](../../src/adapters/trace.ts#L105) (flow: string | null | undefined, fn: () => T, testId?: string) → T
      <a id="cli.trace.withFlow"></a><br>Runs `fn` as a run of `flow`: the spans it makes, in its async continuations too, go to a run of their own (its own run id and clock; `testId`, else the process's test id), and its `run` record is written when `fn` returns or its promise settles. A request handler names the…
      - calls [cli.trace.api](cli.md#cli.trace.api)
    - fn [record](../../src/adapters/trace.ts#L118) (given: string) → void <!-- internal -->
      <a id="cli.trace.record"></a><br>Start recording into `given`: register the hooks, install the API on `globalThis`, and arrange the `run` record at exit.
      - calls [cli.trace.planFlow](cli.md#cli.trace.planFlow), [cli.run-id.runId](cli.md#cli.run-id.runId), [cli.trace.commandLine](cli.md#cli.trace.commandLine), [cli.trace.instrumented](cli.md#cli.trace.instrumented)
    - fn [planFlow](../../src/adapters/trace.ts#L359) (path: string) → string <!-- internal -->
      <a id="cli.trace.planFlow"></a><br>The flow a plan file names; a file that is no plan stops the process with its path.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [commandLine](../../src/adapters/trace.ts#L376) (root: string) → string <!-- internal -->
      <a id="cli.trace.commandLine"></a><br>The test id of a process without KEYLANG_TRACE_TEST: its command line, the script relative to the root.
    - type [Loads](../../src/adapters/trace.ts#L383) <!-- internal -->
      <a id="cli.trace.Loads"></a><br>What the hooks did with the planned files in this process.
    - type [Instrumented](../../src/adapters/trace.ts#L401) <!-- internal -->
      <a id="cli.trace.Instrumented"></a><br>The plan's functions this process would have recorded had it called them: every function a wrapper was planned for, whether or not the process loaded its file (code it never loaded never ran here). Left out: a file that loaded with other content than the snapshot saw, and a…
    - fn [instrumented](../../src/adapters/trace.ts#L407) (plan: Plan, loads: Loads) → Instrumented <!-- internal -->
      <a id="cli.trace.instrumented"></a>
  - module [cli](../../src/cli.ts#L1)
    <a id="cli.cli"></a><br>`keylang` command line: the TUI (no command), web, clone, init, map, check, parse, fmt.
    - node [external.node](external.md#external.node)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - harness [features.harness](features.md#features.harness)
    - clone [features.clone](features.md#features.clone)
    - changed [features.changed](features.md#features.changed)
    - weakening [features.weakening](features.md#features.weakening)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - analyze [map.analyze](map.md#map.analyze)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - check-format [features.check-format](features.md#features.check-format)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - explanations [map.explanations](map.md#map.explanations)
    - json [base.json](base.md#base.json)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - operations [operations.operations](operations.md#operations.operations)
    - terminal [tui.terminal](tui.md#tui.terminal)
    - lsp [cli.lsp](cli.md#cli.lsp)
    - mcp [cli.mcp](cli.md#cli.mcp)
    - hub [tui.hub](tui.md#tui.hub)
    - web-export [tui.web-export](tui.md#tui.web-export)
    - web [tui.web](tui.md#tui.web)
    - diagram-export [operations.diagram-export](operations.md#operations.diagram-export)
    - diagram-propose [operations.diagram-propose](operations.md#operations.diagram-propose)
    - proposals [features.proposals](features.md#features.proposals)
    - ts-projection [features.ts-projection](features.md#features.ts-projection)
    - git-hook [features.git-hook](features.md#features.git-hook)
    - new-spec [tui.new-spec](tui.md#tui.new-spec)
    - completions [cli.completions](cli.md#cli.completions)
    - migration-stack [features.migration-stack](features.md#features.migration-stack)
    - stale [features.stale](features.md#features.stale)
    - fn [main](../../src/cli.ts#L469) (argv: readonly string[]) → Promise<number>
      <a id="cli.cli.main"></a><br>Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error.
      - calls [cli.cli.run](cli.md#cli.cli.run)
    - fn [run](../../src/cli.ts#L479) (argv: readonly string[]) → Promise<number> <!-- internal -->
      <a id="cli.cli.run"></a><br>Parses CLI arguments, handles help/version, opens the terminal UI when no command is given, and dispatches each subcommand to its handler such as [`cli.cli.cmdCheck`](cli.md#cli.cli.cmdCheck) or [`cli.cli.cmdWeb`](cli.md#cli.cli.cmdWeb), returning an exit code. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [cli.cli.packageVersion](cli.md#cli.cli.packageVersion), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.cmdInit](cli.md#cli.cli.cmdInit), [cli.cli.cmdAgents](cli.md#cli.cli.cmdAgents), [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [cli.cli.cmdBaseline](cli.md#cli.cli.cmdBaseline), [cli.cli.cmdFeature](cli.md#cli.cli.cmdFeature), [cli.cli.cmdHook](cli.md#cli.cli.cmdHook), [cli.cli.cmdNew](cli.md#cli.cli.cmdNew), [cli.cli.cmdCompletions](cli.md#cli.cli.cmdCompletions), [cli.cli.cmdMap](cli.md#cli.cli.cmdMap), [cli.cli.cmdMigration](cli.md#cli.cli.cmdMigration), [cli.cli.cmdCheck](cli.md#cli.cli.cmdCheck), [cli.cli.cmdExplain](cli.md#cli.cli.cmdExplain), [cli.cli.cmdDoctor](cli.md#cli.cli.cmdDoctor), [cli.cli.cmdDraft](cli.md#cli.cli.cmdDraft), [cli.cli.cmdProposals](cli.md#cli.cli.cmdProposals), [cli.cli.cmdSpecToCode](cli.md#cli.cli.cmdSpecToCode), [cli.cli.cmdCodeToSpec](cli.md#cli.cli.cmdCodeToSpec), [cli.cli.cmdWire](cli.md#cli.cli.cmdWire), [cli.cli.cmdTypes](cli.md#cli.cli.cmdTypes), [cli.cli.cmdTracePlan](cli.md#cli.cli.cmdTracePlan), [cli.cli.cmdEntries](cli.md#cli.cli.cmdEntries), [cli.cli.cmdCoverage](cli.md#cli.cli.cmdCoverage), [cli.cli.cmdIntegrations](cli.md#cli.cli.cmdIntegrations), [cli.cli.cmdSystem](cli.md#cli.cli.cmdSystem), [cli.cli.cmdTour](cli.md#cli.cli.cmdTour), [cli.cli.cmdFlows](cli.md#cli.cli.cmdFlows), [cli.cli.cmdFlow](cli.md#cli.cli.cmdFlow), [cli.cli.cmdExport](cli.md#cli.cli.cmdExport), [cli.cli.cmdImport](cli.md#cli.cli.cmdImport), [cli.cli.cmdDiagram](cli.md#cli.cli.cmdDiagram), [cli.cli.prepareClone](cli.md#cli.cli.prepareClone), [cli.cli.cmdHub](cli.md#cli.cli.cmdHub), [cli.cli.cmdWebExport](cli.md#cli.cli.cmdWebExport), [cli.cli.cmdWebNew](cli.md#cli.cli.cmdWebNew), [cli.cli.cmdWeb](cli.md#cli.cli.cmdWeb), [cli.cli.needPaths](cli.md#cli.cli.needPaths), [cli.cli.cmdParse](cli.md#cli.cli.cmdParse), [cli.cli.cmdFmt](cli.md#cli.cli.cmdFmt)
    - fn [cmdWebNew](../../src/cli.ts#L667) (dirText: string, portText: string, host: string) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWebNew"></a><br>`web --new <dir>` (business-flows/29): a new project from a diagram. The directory is made when it is not there; one with keylang.json is a project already (2).
      - calls [cli.cli.isLink](cli.md#cli.cli.isLink), [cli.cli.cmdWeb](cli.md#cli.cli.cmdWeb)
    - fn [isLink](../../src/cli.ts#L680) (path: string) → boolean <!-- internal -->
      <a id="cli.cli.isLink"></a><br>Whether `path` is a symbolic link (dangling ones included).
    - fn [cmdHub](../../src/cli.ts#L689) (portText: string, host: string, readOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHub"></a><br>`web --hub`: the start page — clone a URL, reopen a clone, open a folder in the tab — and every repository opened from it under `/r/<id>/`, on one port.
    - fn [cmdWebExport](../../src/cli.ts#L713) (root: string, outText: string) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWebExport"></a><br>`web --export <dir> [url|path]`: the read-only diagram page of the repository as a static site in `<dir>`.
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdWeb](../../src/cli.ts#L737) (root: string, portText: string, host: string, greenfield = false, readOnly = false) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWeb"></a><br>`web [url]` and `web --read-only|--new`: serve one repository until SIGINT/SIGTERM, then close the server.
    - type [BriefsPlanRequest](../../src/cli.ts#L782) = Extract<ExplainPlanRequest, { list: "briefs" }> <!-- internal -->
      <a id="cli.cli.BriefsPlanRequest"></a><br>The brief batch's plan (`explain --missing|--stale` without `--llm`).
    - type [TraceSource](../../src/cli.ts#L785) = NonNullable<DraftFlowRequest["fromTrace"]> <!-- internal -->
      <a id="cli.cli.TraceSource"></a><br>`draft flow --from-trace <file> [--run <id>]`.
    - type [CodePosition](../../src/cli.ts#L788) = Extract<CodeToSpecSource, { file: string }> <!-- internal -->
      <a id="cli.cli.CodePosition"></a><br>`code-to-spec <path[:line]>`.
    - type [ExplainOptions](../../src/cli.ts#L791) <!-- internal -->
      <a id="cli.cli.ExplainOptions"></a><br>The `explain` flags, as parsed.
    - fn [cmdExplain](../../src/cli.ts#L807) (subject: string | undefined, opts: ExplainOptions) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExplain"></a><br>`explain <code|id> [--llm] [--full|--brief]`, and the batch and stale forms: validate the flag combination, then hand off to the batch, the stale list, the offline explanation or the model's.
      - calls [cli.cli.cmdExplainBatch](cli.md#cli.cli.cmdExplainBatch), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.explainPlanPrinter](cli.md#cli.cli.explainPlanPrinter), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdExplainBatch](../../src/cli.ts#L871) (root: string, batch: BriefBatch, opts: Pick<ExplainOptions, "llm" | "dryRun" | "limit" | "jobs">) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExplainBatch"></a><br>`explain --missing|--stale [--llm] [--dry-run] [--limit N] [--jobs N]`: briefs for the explained map, bottom-up. Without `--llm` it lists the nodes; `--dry-run` counts them and estimates tokens.
      - calls [cli.cli.positiveInteger](cli.md#cli.cli.positiveInteger), [cli.cli.explainPlanPrinter](cli.md#cli.cli.explainPlanPrinter), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [explainPlanPrinter](../../src/cli.ts#L912) (request: ExplainPlanRequest) → Promise<number> <!-- internal -->
      <a id="cli.cli.explainPlanPrinter"></a><br>`explain --stale`, and a brief plan without `--llm`: the note on stderr, the stdout of the shared operation; a failure is the CLI's error.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [prepareClone](../../src/cli.ts#L930) (sourceText: string | undefined, opts: { dir: string | undefined; explain: string | undefined; dryRun: boolean }) → Promise<{ code: number; root: string | null }> <!-- internal -->
      <a id="cli.cli.prepareClone"></a><br>`clone <source> [--dir D] [--explain MODE] [--dry-run]`, and the first half of `web <source>`: the clone, then the existing printers of init (`--agents=none`: a clone gets no harness files), the brief batch, the layers' full explanations and the map, each over the clone's root.…
      - calls [features.clone.isCloneExplain](features.md#features.clone.isCloneExplain), [features.clone.parseRepoSource](features.md#features.clone.parseRepoSource), [features.clone.cloneCacheRoot](features.md#features.clone.cloneCacheRoot), [features.clone.syncClone](features.md#features.clone.syncClone), [cli.cli.cmdInit](cli.md#cli.cli.cmdInit), [base.config.loadConfig](base.md#base.config.loadConfig), [cli.cli.cmdExplainBatch](cli.md#cli.cli.cmdExplainBatch), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.clone.enableExplainedMap](features.md#features.clone.enableExplainedMap), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.printMap](cli.md#cli.cli.printMap)
    - fn [positiveInteger](../../src/cli.ts#L1002) (flag: string, text: string) → number <!-- internal -->
      <a id="cli.cli.positiveInteger"></a><br>A flag value that must be a positive integer; anything else is a usage error.
      - calls [features.explain-inventory.positiveIntegerProblem](features.md#features.explain-inventory.positiveIntegerProblem)
    - fn [cmdDraft](../../src/cli.ts#L1011) (args: string[], opts: { mode: string; modeGiven: boolean; name: string | undefined; into: string | undefined; print: boolean; fromTrace: string | undefined; run: string | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDraft"></a><br>`draft flow|rules|map`: validate the subcommand and its flags, then hand off to its printer.
      - calls [cli.cli.cmdDraftLayout](cli.md#cli.cli.cmdDraftLayout), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.draftFlowPrinter](cli.md#cli.cli.draftFlowPrinter)
    - fn [draftFlowPrinter](../../src/cli.ts#L1052) (root: string, trigger: string, mode: "algo" | "llm" | "hybrid", opts: { name: string | undefined; into: string | undefined; print: boolean; fromTrace: TraceSource | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.draftFlowPrinter"></a><br>`draft flow <trigger> --mode algo|llm|hybrid` and `draft flow --from-trace <file> [--run <id>]`: a printer over the shared `draft-flow` operation. The proposal replaces one already waiting, as the CLI always did.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdSpecToCode](../../src/cli.ts#L1085) (id: string | undefined, opts: { into: string | undefined; apply: boolean; print: boolean; mode: string }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdSpecToCode"></a><br>`spec-to-code <id>`: validate, then preview/propose or apply.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.specToCodeApplyPrinter](cli.md#cli.cli.specToCodeApplyPrinter), [cli.cli.specToCodePrinter](cli.md#cli.cli.specToCodePrinter)
    - fn [specToCodeApplyPrinter](../../src/cli.ts#L1109) (root: string, id: string, into: string | undefined, mode: "algo" | "llm") → Promise<number> <!-- internal -->
      <a id="cli.cli.specToCodeApplyPrinter"></a><br>`spec-to-code <id> [--into] [--mode algo|llm] --apply`: the candidate is built as a preview (stdout and the test notes as `--print`), then the shared `apply-code` operation writes its files; a proposal waiting for one stays, as it always did. The operation's code is the CLI's…
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [specToCodePrinter](../../src/cli.ts#L1152) (root: string, id: string, into: string | undefined, print: boolean, mode: "algo" | "llm") → Promise<number> <!-- internal -->
      <a id="cli.cli.specToCodePrinter"></a><br>`spec-to-code <id> [--into] [--mode algo|llm] [--print]`: a printer over the shared `spec-to-code` operation. stdout is the candidate's files and findings, stderr the test notes and then what was (not) written. The proposals replace ones already waiting, as the CLI always did.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdCodeToSpec](../../src/cli.ts#L1179) (at: string | undefined, opts: { into: string | undefined; print: boolean; mode: string; since: string | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCodeToSpec"></a><br>`code-to-spec <path[:line]> | --since <ref>`: analyse once, then hand the source to the printer.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.analyze.analyze](map.md#map.analyze.analyze), [base.config.toPosix](base.md#base.config.toPosix), [cli.cli.codeToSpecPrinter](cli.md#cli.cli.codeToSpecPrinter)
    - fn [codeToSpecPrinter](../../src/cli.ts#L1214) (root: string, source: CodeToSpecSource, analysis: Analysis, opts: { into: string | undefined; print: boolean; mode: string }) → Promise<number> <!-- internal -->
      <a id="cli.cli.codeToSpecPrinter"></a><br>`code-to-spec <path[:line]> | --since <ref> [--mode] [--into] [--print]`: a printer over the shared `code-to-spec` operation, on the analysis already made. The path is relative to the working directory, `--into` to the root.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdDraftLayout](../../src/cli.ts#L1258) (what: "rules" | "map", opts: { mode: string; into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDraftLayout"></a><br>`draft rules|map`: check the mode, then the printer for each.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.draftMapPrinter](cli.md#cli.cli.draftMapPrinter), [cli.cli.draftRulesPrinter](cli.md#cli.cli.draftRulesPrinter)
    - fn [draftMapPrinter](../../src/cli.ts#L1271) (root: string, mode: "algo" | "llm" | "hybrid") → Promise<number> <!-- internal -->
      <a id="cli.cli.draftMapPrinter"></a><br>`draft map [--mode algo|llm|hybrid]`: a printer over the shared `draft-layout` operation. Stdout: the config with the drafted layers; on stderr the fallback of a hybrid without a model, then that nothing was written. keylang.json never changes.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [draftRulesPrinter](../../src/cli.ts#L1295) (root: string, mode: "algo" | "llm" | "hybrid", opts: { into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.draftRulesPrinter"></a><br>`draft rules [--mode algo|llm|hybrid] [--into] [--print]`: a printer over the shared `draft-rules` operation. The proposal replaces one already waiting, as the CLI always did.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdExport](../../src/cli.ts#L1328) (args: readonly string[], options: { format: string | undefined; level: string | undefined; layer: string | undefined; out: string | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExport"></a><br>`keylang export c4` (c4-zoom/12): the diagram on stdout, or written to `--out` with a note on stderr and nothing on stdout. Exit code 0 or 2. `export bpmn|drawio <view>` goes through the diagram-export operation.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdDiagram](../../src/cli.ts#L1373) (args: readonly string[], options: { from: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDiagram"></a><br>`keylang diagram propose <view> --from <model.json> [--print]` (business-flows/24): the editor's drawing as proposals, the operation `POST /api/diagram-proposal` runs. Stdout: the changes with `--print`; stderr: each proposal, the K108 warnings, keylang.json with new layers…
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [cmdImport](../../src/cli.ts#L1429) (args: readonly string[], options: { into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdImport"></a><br>`keylang import drawio <file>` (business-flows/28): one proposal for the flow the drawing draws; `--print` puts the change on stdout. Notes and refusals to stderr. 0 proposed or nothing to propose, 1 a proposal already waiting or a refused write, 2 a bad invocation, file or…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdProposals](../../src/cli.ts#L1458) (args: readonly string[]) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdProposals"></a><br>`proposals [show|accept|reject <target>]`: a person takes or drops a proposal without the TUI. A printer over `src/proposals.ts`: the list, a diff and what was written to stdout; notes and refusals to stderr. 0 done; 1 nothing pending for the target, or an accept refused…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [base.config.loadConfig](base.md#base.config.loadConfig)
    - fn [cmdWire](../../src/cli.ts#L1544) (out: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWire"></a><br>`keylang wire [--check]`: the CLI is a printer over the shared wire operation.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [cmdTypes](../../src/cli.ts#L1569) (names: readonly string[], out: string | undefined, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdTypes"></a><br>`keylang types [<flow|feature>…] [--out f] [--check]`: the planned declarations as TypeScript (`ts-projection.ts`). Without `--out` the text goes to stdout. `--out` writes `f` (relative to the root) unless a person wrote it (no generated header: 1, nothing written); with…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.analyze](map.md#map.analyze.analyze), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [cmdDoctor](../../src/cli.ts#L1635) () → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDoctor"></a><br>What is set up. A problem it finds (a key file others can read, a native module without its binary) is a line of the report, not a failure: cli.md, code 0.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [cmdTracePlan](../../src/cli.ts#L1655) (flow: string | undefined, entry: string | undefined, name: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdTracePlan"></a><br>A printer over the shared trace-plan operation: the plan's JSON to stdout and nothing else.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdEntries](../../src/cli.ts#L1673) (kind: string | undefined, json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdEntries"></a><br>`entries [--kind k] [--json]`: the table of the shared operation, or its payload as JSON; exit 0 with an empty list too.
      - calls [map.snapshot.isEntryKind](map.md#map.snapshot.isEntryKind), [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdCoverage](../../src/cli.ts#L1687) (json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCoverage"></a><br>`coverage [--json]`: the report of the shared operation, or its payload without the text as JSON; exit 0 with holes and orphans too.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [cmdMigration](../../src/cli.ts#L1698) (args: readonly string[], from: string | undefined, json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdMigration"></a><br>`migration status [--from <old>] [--json]`: the parity of the shared operation, or its payload without the text as JSON; exit 1 when a flow fails.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdSystem](../../src/cli.ts#L1717) (args: readonly string[], json: boolean, interview: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdSystem"></a><br>`system list|show|discover|new`: the shared operation's text, or its payload without the text as JSON.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdIntegrations](../../src/cli.ts#L1740) (json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdIntegrations"></a><br>`integrations [--json]`: the inventory of the shared operation, or its payload without the text as JSON; exit 0.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [cmdTour](../../src/cli.ts#L1751) (out: string | undefined, json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdTour"></a><br>`tour [--out f] [--json]`: the page on stdout, its data as JSON, or the page written to `f` (named on stderr).
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdFlows](../../src/cli.ts#L1773) ( args: readonly string[], opts: { kind: string | undefined; layer: string | undefined; limit: string | undefined; depth: string | undefined; into: string | undefined; print: boolean; check: boolean; names: boolean; mode: string | undefined; dryRun: boolean; jobs: string | undefined; stale: boolean }, ) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFlows"></a><br>`flows discover|adopt`: the shared operations. Discover prints the view (`--print`) or what it wrote, the skipped triggers and the summary on stderr; adopt names the proposal on stderr.
      - calls [cli.cli.wholeNumber](cli.md#cli.cli.wholeNumber), [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.snapshot.isEntryKind](map.md#map.snapshot.isEntryKind), [cli.cli.cmdFlowsNames](cli.md#cli.cli.cmdFlowsNames)
    - fn [cmdFlowsNames](../../src/cli.ts#L1837) (root: string, opts: { kind: string | undefined; layer: string | undefined; limit: string | undefined; print: boolean; check: boolean; mode: string | undefined; dryRun: boolean; jobs: string | undefined; stale: boolean }, depth: number | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFlowsNames"></a><br>`flows discover --names [--mode algo|llm|hybrid] [--stale] [--layer l] [--dry-run] [--limit N] [--jobs N]`: the view, then business processes from the model, one request per layer group. `--dry-run` prints the plan and writes nothing; `--limit` bounds the requests.
      - calls [features.discover-names.isNameMode](features.md#features.discover-names.isNameMode), [cli.cli.positiveInteger](cli.md#cli.cli.positiveInteger), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [cmdFlow](../../src/cli.ts#L1878) (args: readonly string[], opts: { withCallees: string | undefined; out: string | undefined; into: string | undefined; layerMap: string | undefined; mode: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFlow"></a><br>`flow export <name>… [--with-callees N] [--out f]` and `flow import <bundle.md> [--into] [--layer-map] [--mode] [--print]`: the shared operations. Export prints the bundle (or names the file written on stderr); import prints the proposed texts with `--print`, else names the…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.wholeNumber](cli.md#cli.cli.wholeNumber), [cli.cli.packageVersion](cli.md#cli.cli.packageVersion), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [wholeNumber](../../src/cli.ts#L1931) (flag: string, text: string, min: number) → number <!-- internal -->
      <a id="cli.cli.wholeNumber"></a><br>A whole number flag at least `min`; anything else is a usage error.
    - fn [needPaths](../../src/cli.ts#L1940) (cmd: string, paths: string[]) → void <!-- internal -->
      <a id="cli.cli.needPaths"></a><br>Throw a usage error when a command that needs paths got none.
    - fn [cmdInit](../../src/cli.ts#L1945) (dir: string, opts: { agents: string | undefined; check: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdInit"></a><br>`init [dir] [--agents=LIST] [--check]`: a printer over the shared init operation, stage by stage in the order the stages ran.
      - calls [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [operations.generate.initSources](operations.md#operations.generate.initSources), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [cli.cli.printAgents](cli.md#cli.cli.printAgents), [cli.cli.printBaseline](cli.md#cli.cli.printBaseline), [cli.cli.printGitignore](cli.md#cli.cli.printGitignore), [cli.cli.printMap](cli.md#cli.cli.printMap)
    - fn [printGitignore](../../src/cli.ts#L2020) (stage: GitignoreStage) → void <!-- internal -->
      <a id="cli.cli.printGitignore"></a><br>The `.gitignore` line of init: an I/O error to stderr; added, not listed, or a refusal's reason to stdout, as the file lines of the other stages.
      - calls [operations.generate.gitignoreMessage](operations.md#operations.generate.gitignoreMessage)
    - fn [cmdAgents](../../src/cli.ts#L2030) (root: string, harnesses: HarnessChoice, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdAgents"></a><br>`agents [--agents=LIST] [--check]`: a printer over the shared agents operation.
      - calls [cli.cli.printAgents](cli.md#cli.cli.printAgents), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [printAgents](../../src/cli.ts#L2035) (result: OperationEnvelope<"agents">) → number <!-- internal -->
      <a id="cli.cli.printAgents"></a><br>File lines to stdout (`stale`, `written`, `removed`, a refusal's reasons); failures to stderr.
    - fn [cmdBaseline](../../src/cli.ts#L2060) (root: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdBaseline"></a><br>`baseline [--check]`: a printer over the shared baseline operation. Lines for the file go to stdout; failures to stderr.
      - calls [cli.cli.printBaseline](cli.md#cli.cli.printBaseline), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [printBaseline](../../src/cli.ts#L2065) (result: OperationEnvelope<"baseline">) → number <!-- internal -->
      <a id="cli.cli.printBaseline"></a><br>The baseline's lines: file lines and a stale `--check` to stdout; a refusal's notes and failures to stderr.
    - fn [cmdFeature](../../src/cli.ts#L2084) (slug: string | undefined, format: string, since: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFeature"></a><br>Whether a feature is done, on the saved files. The CLI is a printer over the shared feature operation.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [operations.feature.gapLine](operations.md#operations.feature.gapLine), [operations.feature.hintLine](operations.md#operations.feature.hintLine), [operations.feature.featureSummary](operations.md#operations.feature.featureSummary)
    - fn [cmdHook](../../src/cli.ts#L2109) (args: readonly string[], checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHook"></a><br>`hook stop` and `hook install [--check]`. A missing or unknown subcommand and an extra argument are a bad invocation (2).
      - calls [cli.cli.cmdHookInstall](cli.md#cli.cli.cmdHookInstall), [cli.cli.cmdHookStop](cli.md#cli.cli.cmdHookStop)
    - fn [cmdHookStop](../../src/cli.ts#L2128) () → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHookStop"></a><br>`hook stop`: once the invocation is valid, exactly one JSON object on stdout and code 0. A harness reads code 2 of a Stop hook as a blocking error the agent cannot act on, so a failure — stdin that is not a JSON event, git missing or refused, a broken keylang.json, an analysis…
      - calls [cli.cli.stopDecision](cli.md#cli.cli.stopDecision), [cli.cli.readStdin](cli.md#cli.cli.readStdin), [features.changed.uncheckedTurn](features.md#features.changed.uncheckedTurn)
    - fn [stopDecision](../../src/cli.ts#L2145) (input: string, cwd: string) → Promise<string> <!-- internal -->
      <a id="cli.cli.stopDecision"></a><br>The Stop decision for the event on stdin: the fails of `check --changed` in `cwd`'s repository. Throws when the turn cannot be checked.
      - calls [features.changed.parseHookEvent](features.md#features.changed.parseHookEvent), [features.changed.hookDecision](features.md#features.changed.hookDecision), [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.analyze.analyze](map.md#map.analyze.analyze), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [features.git-changes.changedPathSet](features.md#features.git-changes.changedPathSet), [features.changed.filterChanged](features.md#features.changed.filterChanged), [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [features.weakening.readWeakenings](features.md#features.weakening.readWeakenings), [features.changed.hookFails](features.md#features.changed.hookFails)
    - fn [cmdHookInstall](../../src/cli.ts#L2174) (checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdHookInstall"></a><br>`hook install [--check]`: keylang's pre-commit hook in git's hooks directory. A hook without keylang's marker is someone else's: install refuses with 2 and names the line to add; --check counts it as not installed.
      - calls [cli.cli.packageVersion](cli.md#cli.cli.packageVersion), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [cmdNew](../../src/cli.ts#L2222) (args: readonly string[], layer: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdNew"></a><br>`new flow <name>`, `new module <name> --layer <layer>`: a skeleton spec, never over an existing file.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.loadConfig](base.md#base.config.loadConfig), [cli.cli.plannedModuleTemplate](cli.md#cli.cli.plannedModuleTemplate), [base.config.toPosix](base.md#base.config.toPosix), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [plannedModuleTemplate](../../src/cli.ts#L2279) (layer: string, name: string) → string <!-- internal -->
      <a id="cli.cli.plannedModuleTemplate"></a><br>A module that has no code yet is an intention: `planned module` at the top of a flow section (format §5), in a feature file named after it. The prose says why a module request gets a flow heading; it is not part of the grammar.
    - fn [cmdCompletions](../../src/cli.ts#L2288) (shell: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCompletions"></a><br>`completions <shell>`: commands from the help text, flags from the parser's table.
    - fn [packageVersion](../../src/cli.ts#L2300) () → string <!-- internal -->
      <a id="cli.cli.packageVersion"></a><br>keylang's own version, from its package.json.
    - fn [readStdin](../../src/cli.ts#L2306) () → Promise<string> <!-- internal -->
      <a id="cli.cli.readStdin"></a><br>All of stdin as UTF-8 text.
    - fn [cmdMap](../../src/cli.ts#L2315) (dir: string, checkOnly: boolean, exportIndex: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdMap"></a><br>`map [dir] [--check] [--export-index <file>]`: write the map, check it, or write it and export the index.
      - calls [cli.cli.printMap](cli.md#cli.cli.printMap), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [base.config.toPosix](base.md#base.config.toPosix), [operations.generate.mapCheckLines](operations.md#operations.generate.mapCheckLines)
    - fn [printMap](../../src/cli.ts#L2352) (result: OperationEnvelope<"map">, root: string) → number <!-- internal -->
      <a id="cli.cli.printMap"></a><br>The lines of a map write: paths relative to the working directory; failures and the summary to stderr.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [operations.generate.mapConflictLines](operations.md#operations.generate.mapConflictLines), [operations.generate.mapStepLines](operations.md#operations.generate.mapStepLines), [operations.generate.mapSummary](operations.md#operations.generate.mapSummary)
    - fn [cmdParse](../../src/cli.ts#L2401) (paths: string[], json: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdParse"></a><br>A printer over the shared parse operation: the tree or the JSON to stdout and nothing else; the notes on skipped explanations, each file it could not read (code 2) and the diagnostics to stderr.
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [cmdCheck](../../src/cli.ts#L2427) (paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string | undefined; changed: boolean; since: string | undefined; stale: boolean; accept: boolean; acceptWeakening?: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCheck"></a><br>`check [paths] [--format] [--strict] [--static] [--changed [--since]]`, and `--stale` and `--explain-edge`: validate the flag combination, then print the shared check operation's report (stdout) and summary (stderr).
      - calls [cli.cli.cmdCheckStale](cli.md#cli.cli.cmdCheckStale), [features.check-format.isCheckFormat](features.md#features.check-format.isCheckFormat), [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [operations.spec.checkSkipNote](operations.md#operations.spec.checkSkipNote), [features.check-format.checkReportText](features.md#features.check-format.checkReportText), [operations.spec.checkSummary](operations.md#operations.spec.checkSummary)
    - fn [cmdCheckStale](../../src/cli.ts#L2514) (paths: string[], accept: boolean, strict: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCheckStale"></a><br>`check --stale`: one line per statement to review on stdout (stale, new, or unchanged but incomplete) and per obsolete baseline entry, the counts on stderr. Stale is a warning: the code is 0 unless the invocation or I/O fails; with `strict`, any such line is 1, so CI can gate…
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [cmdFmt](../../src/cli.ts#L2540) (paths: string[], checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdFmt"></a><br>Each file is formatted on its own, so one that cannot be read or written does not stop the rest: every such failure is reported, and the code is 2; otherwise 1 for diagnostics or, with `--check`, an unformatted file. The CLI is a printer over the shared fmt operation: stdout…
      - calls [operations.operations.runOperation](operations.md#operations.operations.runOperation), [map.analyze.findRoot](map.md#map.analyze.findRoot), [operations.spec.fmtGeneratedNote](operations.md#operations.spec.fmtGeneratedNote)
  - module [completions](../../src/completions.ts#L1)
    <a id="cli.completions"></a><br>`keylang completions <shell>`: a completion script for bash, zsh or fish. The words come from the help text (commands and their subcommands) and the option table of the argument parser, so a new command or flag is completed as soon as `--help` and the parser know it.
    - type [Shell](../../src/completions.ts#L12) = (typeof SHELLS)[number]
      <a id="cli.completions.Shell"></a><br>One supported shell name.
    - fn [isShell](../../src/completions.ts#L15) (name: string) → name is Shell
      <a id="cli.completions.isShell"></a><br>Whether `name` is a supported shell.
    - type [CompletionWords](../../src/completions.ts#L20)
      <a id="cli.completions.CompletionWords"></a><br>What the script completes: commands in help order, each with its subcommands; long flags with an optional short one.
    - fn [helpCommands](../../src/completions.ts#L33) (usage: string) → Map<string, string[]>
      <a id="cli.completions.helpCommands"></a><br>Commands of the `Commands:` block of the help: a line indented by exactly two spaces starts with a command; a plain word after it (`hook stop`, `draft flow <trigger>`) is a subcommand. Placeholders and flags are not.
    - fn [completionScript](../../src/completions.ts#L65) (shell: Shell, words: CompletionWords) → string
      <a id="cli.completions.completionScript"></a><br>The completion script for `shell`, ending with a newline.
      - calls [cli.completions.bashScript](cli.md#cli.completions.bashScript), [cli.completions.zshScript](cli.md#cli.completions.zshScript), [cli.completions.fishScript](cli.md#cli.completions.fishScript)
    - fn [flagWords](../../src/completions.ts#L77) (words: CompletionWords) → string[] <!-- internal -->
      <a id="cli.completions.flagWords"></a><br>Every flag spelling: `--long` and, when there is one, `-s`.
    - fn [withSubcommands](../../src/completions.ts#L82) (words: CompletionWords) → [string, readonly string[]][] <!-- internal -->
      <a id="cli.completions.withSubcommands"></a><br>Commands that have subcommands, in help order.
    - fn [bashScript](../../src/completions.ts#L87) (words: CompletionWords) → string <!-- internal -->
      <a id="cli.completions.bashScript"></a><br>Bash: flags when the word starts with `-`, commands at position 1, subcommands at position 2, otherwise files.
      - calls [cli.completions.withSubcommands](cli.md#cli.completions.withSubcommands), [cli.completions.flagWords](cli.md#cli.completions.flagWords)
    - fn [zshScript](../../src/completions.ts#L111) (words: CompletionWords) → string <!-- internal -->
      <a id="cli.completions.zshScript"></a><br>Zsh: works both sourced and autoloaded from $fpath (`#compdef`); falls back to file completion after the subcommand.
      - calls [cli.completions.withSubcommands](cli.md#cli.completions.withSubcommands), [cli.completions.flagWords](cli.md#cli.completions.flagWords)
    - fn [fishScript](../../src/completions.ts#L139) (words: CompletionWords) → string <!-- internal -->
      <a id="cli.completions.fishScript"></a><br>Fish: commands until one is seen, then that command's subcommands; flags anywhere.
      - calls [cli.completions.withSubcommands](cli.md#cli.completions.withSubcommands)
  - module [index](../../src/index.ts#L1)
    <a id="cli.index"></a><br>keylang core: IR, Markdown parser, cross-file resolver, formatter. Public entry point of the npm package (`import ... from "keylang"`): it re-exports the language core only (Markdown → IR → resolve/check, plus `fmt`), never the code-analysis side (source → FileFacts → graph →…
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
    - json [base.json](base.md#base.json)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - explanations [map.explanations](map.md#map.explanations)
    - type [LspResult](../../src/lsp.ts#L29) <!-- internal -->
      <a id="cli.lsp.LspResult"></a><br>An answer to a request, as the features give it.
    - type [OutgoingParams](../../src/lsp.ts#L43) <!-- internal -->
      <a id="cli.lsp.OutgoingParams"></a><br>The params of what the server sends on its own: diagnostics, a message the editor shows, or none (a refresh request).
    - type [Outgoing](../../src/lsp.ts#L46) <!-- internal -->
      <a id="cli.lsp.Outgoing"></a><br>A message the server sends: a response, a notification or a request of its own.
    - type [TextDocumentParams](../../src/lsp.ts#L56) <!-- internal -->
      <a id="cli.lsp.TextDocumentParams"></a><br>The `textDocument` of a message, with the fields of the expected types.
    - fn [serveLsp](../../src/lsp.ts#L69) (read: NodeJS.ReadableStream = process.stdin, write: NodeJS.WritableStream = process.stdout) → Promise<number>
      <a id="cli.lsp.serveLsp"></a><br>Serves LSP over the two streams until `exit` or the end of input; returns the exit code (0 after `shutdown`, 1 without it, 2 on a broken stream).
      - calls [cli.lsp.Server](cli.md#cli.lsp.Server), [cli.lsp.Server.drain](cli.md#cli.lsp.Server.drain), [base.json.parseJson](base.md#base.json.parseJson), [cli.lsp.Server.reject](cli.md#cli.lsp.Server.reject), [base.json.isJsonObject](base.md#base.json.isJsonObject), [cli.lsp.Server.receive](cli.md#cli.lsp.Server.receive)
    - type [Finished](../../src/lsp.ts#L134) <!-- internal -->
      <a id="cli.lsp.Finished"></a><br>An analysis of the buffers as they were at `generation`, or why it failed.
    - module [Server](../../src/lsp.ts#L137) <!-- internal -->
      <a id="cli.lsp.Server"></a><br>The session: open buffers, the analysis state machine, and the request bookkeeping.
      - fn [constructor](../../src/lsp.ts#L164) (send: (message: Outgoing) => void)
        <a id="cli.lsp.Server.constructor"></a><br>Stores the injected callback for emitting outgoing JSON-RPC messages so the server can later push responses and notifications without owning the transport itself. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [reject](../../src/lsp.ts#L169) (id: number | string | null, code: number, message: string) → void
        <a id="cli.lsp.Server.reject"></a><br>Answers a message that cannot be served with a JSON-RPC error.
      - fn [receive](../../src/lsp.ts#L174) (message: JsonObject) → void
        <a id="cli.lsp.Server.receive"></a><br>Dispatches one parsed message: a response to the server's own request, a notification, or a request answered asynchronously.
        - calls [cli.lsp.isMessageId](cli.md#cli.lsp.isMessageId), [cli.lsp.Server.reject](cli.md#cli.lsp.Server.reject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.json.isJsonObject](base.md#base.json.isJsonObject), [cli.lsp.Server.notify](cli.md#cli.lsp.Server.notify), [cli.lsp.Server.request](cli.md#cli.lsp.Server.request)
      - fn [drain](../../src/lsp.ts#L239) () → Promise<void>
        <a id="cli.lsp.Server.drain"></a><br>Waits for every request in flight to be answered, then stops the settle timer.
      - fn [notify](../../src/lsp.ts#L246) (method: string, params: JsonObject) → void <!-- internal -->
        <a id="cli.lsp.Server.notify"></a><br>Handles a notification: buffer changes start a new generation; `exit` sets the exit code.
        - calls [cli.lsp.textDocumentOf](cli.md#cli.lsp.textDocumentOf), [cli.lsp.filePath](cli.md#cli.lsp.filePath), [cli.lsp.Server.changed](cli.md#cli.lsp.Server.changed), [cli.lsp.Server.edited](cli.md#cli.lsp.Server.edited), [base.json.isJsonNumber](base.md#base.json.isJsonNumber), [base.json.isJsonString](base.md#base.json.isJsonString)
      - fn [edited](../../src/lsp.ts#L307) (text: string | null, changes: JsonValue | undefined) → string | null <!-- internal -->
        <a id="cli.lsp.Server.edited"></a><br>The text of a buffer after a `didChange`. The server asks for the whole text (`change: 1`); a client that sends ranges anyway gets them applied in order to the text it has (an unopened buffer has none) and a note in stderr, once.
        - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [cli.lsp.isRange](cli.md#cli.lsp.isRange), [cli.lsp.replaceRange](cli.md#cli.lsp.replaceRange)
      - fn [changed](../../src/lsp.ts#L334) () → void <!-- internal -->
        <a id="cli.lsp.Server.changed"></a><br>A new generation: the analysis running now, if any, no longer covers the buffers.
        - calls [cli.lsp.Server.publish](cli.md#cli.lsp.Server.publish)
      - fn [analyse](../../src/lsp.ts#L345) () → Promise<void> <!-- internal -->
        <a id="cli.lsp.Server.analyse"></a><br>Starts an analysis of the buffers as they are now; one runs at a time.
        - calls [map.analyze.analyze](map.md#map.analyze.analyze), [cli.lsp.Server.report](cli.md#cli.lsp.Server.report)
      - fn [current](../../src/lsp.ts#L369) (needed: number, cancelled: () => boolean = () => false) → Promise<Workspace> <!-- internal -->
        <a id="cli.lsp.Server.current"></a><br>The newest finished analysis that includes generation `needed`. While another analysis runs, this waits for it and then starts one for all the changes so far; a request cancelled meanwhile starts none.
        - calls [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [cli.lsp.LspError](cli.md#cli.lsp.LspError), [cli.lsp.Server.analyse](cli.md#cli.lsp.Server.analyse)
      - fn [publish](../../src/lsp.ts#L394) () → Promise<void> <!-- internal -->
        <a id="cli.lsp.Server.publish"></a><br>Sends the diagnostics of the newest generation: a refresh request for a pulling client, else a push per open buffer.
        - calls [cli.lsp.Server.current](cli.md#cli.lsp.Server.current), [features.lsp-features.diagnosticsFor](features.md#features.lsp-features.diagnosticsFor), [cli.lsp.Server.relative](cli.md#cli.lsp.Server.relative)
      - fn [relative](../../src/lsp.ts#L430) (abs: string) → string <!-- internal -->
        <a id="cli.lsp.Server.relative"></a><br>A path as the analysis names it: relative to the root and POSIX when inside, else absolute.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.within](map.md#map.analyze.within)
      - fn [report](../../src/lsp.ts#L435) (message: string) → void <!-- internal -->
        <a id="cli.lsp.Server.report"></a><br>In stderr (the client's log) and as a message the editor shows, once while the same failure lasts.
      - fn [request](../../src/lsp.ts#L443) (method: string, params: JsonObject, cancelled: () => boolean) → Promise<LspResult> <!-- internal -->
        <a id="cli.lsp.Server.request"></a><br>Answers one request after the lifecycle checks, from an analysis that covers the current buffers.
        - calls [cli.lsp.LspError](cli.md#cli.lsp.LspError), [cli.lsp.Server.initialize](cli.md#cli.lsp.Server.initialize), [cli.lsp.textDocumentOf](cli.md#cli.lsp.textDocumentOf), [cli.lsp.filePath](cli.md#cli.lsp.filePath), [cli.lsp.Server.current](cli.md#cli.lsp.Server.current), [cli.lsp.Server.relative](cli.md#cli.lsp.Server.relative), [cli.lsp.positionOf](cli.md#cli.lsp.positionOf), [features.lsp-features.diagnosticsFor](features.md#features.lsp-features.diagnosticsFor), [features.lsp-features.hover](features.md#features.lsp-features.hover), [features.lsp-features.definition](features.md#features.lsp-features.definition), [features.lsp-features.references](features.md#features.lsp-features.references), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.lsp-features.documentSymbols](features.md#features.lsp-features.documentSymbols), [features.lsp-features.completions](features.md#features.lsp-features.completions), [features.lsp-features.signatureHelp](features.md#features.lsp-features.signatureHelp), [features.lsp-features.codeLenses](features.md#features.lsp-features.codeLenses), [features.lsp-features.workspaceSymbols](features.md#features.lsp-features.workspaceSymbols), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [base.json.isJsonString](base.md#base.json.isJsonString)
      - fn [initialize](../../src/lsp.ts#L510) (params: JsonObject) → ReturnType<typeof serverCapabilities> <!-- internal -->
        <a id="cli.lsp.Server.initialize"></a><br>The capabilities; the server's state changes only once everything else succeeded.
        - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [cli.lsp.filePath](cli.md#cli.lsp.filePath), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.lsp.serverCapabilities](cli.md#cli.lsp.serverCapabilities)
    - fn [serverCapabilities](../../src/lsp.ts#L543) () <!-- internal -->
      <a id="cli.lsp.serverCapabilities"></a><br>What `initialize` answers: the capabilities and the server's name.
    - module [LspError](../../src/lsp.ts#L563) <!-- internal -->
      <a id="cli.lsp.LspError"></a><br>A failure with the JSON-RPC error code it is answered with.
      - fn [constructor](../../src/lsp.ts#L565) (code: number, message: string)
        <a id="cli.lsp.LspError.constructor"></a><br>Builds a JSON-RPC style error by passing the message to the base `Error` constructor and storing the numeric code on the instance for callers to inspect. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [filePath](../../src/lsp.ts#L572) (uri: string) → string <!-- internal -->
      <a id="cli.lsp.filePath"></a><br>The absolute path of a URI: a `file:` URL decoded, anything else resolved as a path.
    - type [LspRange](../../src/lsp.ts#L577) <!-- internal -->
      <a id="cli.lsp.LspRange"></a><br>An LSP range: two positions, end exclusive.
    - fn [isRange](../../src/lsp.ts#L583) (value: JsonValue | undefined) → value is JsonObject & LspRange <!-- internal -->
      <a id="cli.lsp.isRange"></a><br>Whether a JSON value is a well-formed range.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [cli.lsp.isPosition](cli.md#cli.lsp.isPosition)
    - fn [isPosition](../../src/lsp.ts#L588) (value: JsonValue | undefined) → value is JsonObject & LspPosition <!-- internal -->
      <a id="cli.lsp.isPosition"></a><br>Whether a JSON value is a position with integer line and character.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [positionOf](../../src/lsp.ts#L593) (value: JsonValue | undefined) → LspPosition | undefined <!-- internal -->
      <a id="cli.lsp.positionOf"></a><br>A request's `position`; undefined when it has none of the right shape.
      - calls [cli.lsp.isPosition](cli.md#cli.lsp.isPosition)
    - fn [isMessageId](../../src/lsp.ts#L598) (value: JsonValue | undefined) → value is string | number | null | undefined <!-- internal -->
      <a id="cli.lsp.isMessageId"></a><br>JSON-RPC: an id is a string, a number or null (or absent, in a notification).
      - calls [base.json.isJsonString](base.md#base.json.isJsonString), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [textDocumentOf](../../src/lsp.ts#L603) (params: JsonObject) → TextDocumentParams | undefined <!-- internal -->
      <a id="cli.lsp.textDocumentOf"></a><br>A message's `textDocument`, with the fields that have the types LSP gives them.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [replaceRange](../../src/lsp.ts#L619) (text: string, range: LspRange, insert: string) → string <!-- internal -->
      <a id="cli.lsp.replaceRange"></a><br>`text` with `range` replaced by `insert`. Characters are UTF-16 code units, as JavaScript counts them.
      - calls [cli.lsp.offsetAt](cli.md#cli.lsp.offsetAt)
    - fn [offsetAt](../../src/lsp.ts#L626) (text: string, position: LspPosition) → number <!-- internal -->
      <a id="cli.lsp.offsetAt"></a><br>The offset of a position; past the end of its line is the line's end, past the last line the text's end.
      - calls [cli.lsp.lineBreak](cli.md#cli.lsp.lineBreak)
    - fn [lineBreak](../../src/lsp.ts#L644) (text: string, from: number) → { at: number; after: number } | null <!-- internal -->
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
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [ToolResult](../../src/mcp.ts#L41) <!-- internal -->
      <a id="cli.mcp.ToolResult"></a><br>What a tool returns: text content, flagged as an error when the call failed.
    - fn [json](../../src/mcp.ts#L44) (value: Payload) → ToolResult <!-- internal -->
      <a id="cli.mcp.json"></a><br>Wraps any value into an MCP tool result whose single content item is the value pretty-printed as 2-space-indented JSON text. Used by [`cli.mcp.mcpServer`](cli.md#cli.mcp.mcpServer) to format tool responses. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [failure](../../src/mcp.ts#L47) (message: string) → ToolResult <!-- internal -->
      <a id="cli.mcp.failure"></a><br>A tool error whose text is the message the agent reads.
    - fn [currentAnalysis](../../src/mcp.ts#L60) (root: string) → () => Promise<Analysis>
      <a id="cli.mcp.currentAnalysis"></a><br>The analysis of the current inputs, cheaper than a new `analyze()` per call. The snapshot is rebuilt every time: its id hashes all the graph depends on (sources, configuration, the files import resolution read).
      - calls [lang.files.existingText](lang.md#lang.files.existingText), [base.config.loadConfig](base.md#base.config.loadConfig), [map.map.generateMap](map.md#map.map.generateMap), [map.fact-cache.keepsFactCache](map.md#map.fact-cache.keepsFactCache), [map.fact-cache.saveFactCache](map.md#map.fact-cache.saveFactCache), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [map.analyze.analyze](map.md#map.analyze.analyze)
    - fn [explanationJson](../../src/mcp.ts#L93) (e: NodeExplanation | null) → ExplanationJson | null <!-- internal -->
      <a id="cli.mcp.explanationJson"></a><br>A node's explanation for an agent: its text, where it comes from, and for a model's brief the model, the date and whether the code changed since.
    - type [ExplanationJson](../../src/mcp.ts#L105) <!-- internal -->
      <a id="cli.mcp.ExplanationJson"></a><br>The JSON shape of an explanation in tool answers.
    - fn [diagnosticJson](../../src/mcp.ts#L114) (diag: Diagnostic) → DiagnosticJson <!-- internal -->
      <a id="cli.mcp.diagnosticJson"></a><br>A diagnostic for an agent: where it is and what it says; a K005's reason too.
    - type [DiagnosticJson](../../src/mcp.ts#L123) <!-- internal -->
      <a id="cli.mcp.DiagnosticJson"></a><br>The JSON shape of a diagnostic in tool answers.
    - fn [mcpServer](../../src/mcp.ts#L136) (root: string, version: string) → McpServer
      <a id="cli.mcp.mcpServer"></a><br>The MCP server with every keylang tool registered. Each call re-reads the current analysis, so answers never describe code that changed since.
      - calls [cli.mcp.currentAnalysis](cli.md#cli.mcp.currentAnalysis), [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [cli.mcp.json](cli.md#cli.mcp.json), [cli.mcp.explanationJson](cli.md#cli.mcp.explanationJson), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [cli.mcp.failure](cli.md#cli.mcp.failure), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.check-results.checkResults](features.md#features.check-results.checkResults), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [lang.files.existingText](lang.md#lang.files.existingText), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [features.proposals.lineDiff](features.md#features.proposals.lineDiff), [base.config.specPath](base.md#base.config.specPath), [features.agent-context.contextForIds](features.md#features.agent-context.contextForIds), [features.feature-status.idsIn](features.md#features.feature-status.idsIn), [map.analyze.within](map.md#map.analyze.within), [map.analyze.specPathProblem](map.md#map.analyze.specPathProblem), [base.config.loadConfig](base.md#base.config.loadConfig), [map.analyze.analyze](map.md#map.analyze.analyze), [cli.mcp.diagnosticJson](cli.md#cli.mcp.diagnosticJson), [features.spec-to-code.specToCode](features.md#features.spec-to-code.specToCode), [base.diag.errorText](base.md#base.diag.errorText), [operations.operations.runOperation](operations.md#operations.operations.runOperation)
    - fn [serveMcp](../../src/mcp.ts#L529) (root: string, version: string) → Promise<number>
      <a id="cli.mcp.serveMcp"></a><br>Serves the MCP tools over stdio until the client closes stdin; returns the exit code.
      - calls [cli.mcp.mcpServer](cli.md#cli.mcp.mcpServer)
