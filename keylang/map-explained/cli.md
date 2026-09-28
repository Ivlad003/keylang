<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [keylang](#cli.keylang) · [node-test](#cli.node-test) · [run-id](#cli.run-id) · [trace-hooks](#cli.trace-hooks) · [trace](#cli.trace) · [cli](#cli.cli) · [index](#cli.index) · [lsp](#cli.lsp) · [mcp](#cli.mcp)

# map

- cli
  <a id="cli"></a>
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
      <a id="cli.node-test.TestEvent"></a>
    - fn [keylangReporter](../../src/adapters/node-test.ts#L22) (source: AsyncIterable<TestEvent>) → AsyncGenerator<string>
      <a id="cli.node-test.keylangReporter"></a>
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.map.generateMap](map.md#map.map.generateMap), [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [cli.run-id.runId](cli.md#cli.run-id.runId)
  - module [run-id](../../src/adapters/run-id.ts#L1)
    <a id="cli.run-id"></a><br>One id for the reports and traces of a test run: KEYLANG_TRACE_RUN when the runner sets it, otherwise the time and the process.
    - fn [runId](../../src/adapters/run-id.ts#L4) () → string
      <a id="cli.run-id.runId"></a>
  - module [trace-hooks](../../src/adapters/trace-hooks.ts#L1)
    <a id="cli.trace-hooks"></a><br>Module hooks for the trace adapter (they run on Node's hooks thread, with a module graph of their own). `initialize` builds the snapshot, finds the symbols of one flow, and plans a wrapper for each function body; `load` applies the plan to the source of those files only.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - bodies [extract.bodies](extract.md#extract.bodies)
    - map [map.map](map.md#map.map)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - type [TraceHooksData](../../src/adapters/trace-hooks.ts#L16)
      <a id="cli.trace-hooks.TraceHooksData"></a>
    - type [TracePlanMessage](../../src/adapters/trace-hooks.ts#L28)
      <a id="cli.trace-hooks.TracePlanMessage"></a><br>Hooks → adapter. `plan` once from `initialize`: the flow's functions a wrapper was planned for. `loaded` from `load` for each file the plan was actually applied to: only those symbols are instrumented, so a file that loaded under another URL or with other content never counts…
    - type [FilePlan](../../src/adapters/trace-hooks.ts#L32) <!-- internal -->
      <a id="cli.trace-hooks.FilePlan"></a>
    - fn [initialize](../../src/adapters/trace-hooks.ts#L42) (data: TraceHooksData) → Promise<void>
      <a id="cli.trace-hooks.initialize"></a>
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.flowSymbols](map.md#map.trace-plan.flowSymbols), [extract.bodies.functionBodies](extract.md#extract.bodies.functionBodies), [cli.trace-hooks.wrap](cli.md#cli.trace-hooks.wrap), [cli.trace-hooks.applyEdits](cli.md#cli.trace-hooks.applyEdits), [extract.bodies.parsesCleanly](extract.md#extract.bodies.parsesCleanly), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - type [Edit](../../src/adapters/trace-hooks.ts#L82) <!-- internal -->
      <a id="cli.trace-hooks.Edit"></a><br>Text inserted at an offset of the original source.
    - fn [wrap](../../src/adapters/trace-hooks.ts#L88) (id: string, body: FunctionBody) → Edit[] <!-- internal -->
      <a id="cli.trace-hooks.wrap"></a><br>`{ BODY }` → `{ return __keylangTrace.run(id, () => { BODY }); }`; an arrow keeps `this` and `arguments`.
    - fn [applyEdits](../../src/adapters/trace-hooks.ts#L104) (src: string, edits: readonly Edit[]) → string <!-- internal -->
      <a id="cli.trace-hooks.applyEdits"></a><br>Insert every edit; edits at one offset keep the order they were made in.
    - type [LoadResult](../../src/adapters/trace-hooks.ts#L111) <!-- internal -->
      <a id="cli.trace-hooks.LoadResult"></a>
    - fn [load](../../src/adapters/trace-hooks.ts#L113) (url: string, context: unknown, nextLoad: (url: string, context: unknown) => Promise<LoadResult>) → Promise<LoadResult>
      <a id="cli.trace-hooks.load"></a>
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256)
  - module [trace](../../src/adapters/trace.ts#L1)
    <a id="cli.trace"></a><br>Trace adapter for TS/JS `@flow` tests: `node --import keylang/trace …` (in this repository: `--import ./src/adapters/trace.ts`). Environment: KEYLANG_TRACE JSONL file to append to (required) KEYLANG_TRACE_FLOW flow name whose trigger and steps are instrumented (required)…
    - node [external.node](external.md#external.node)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - run-id [cli.run-id](cli.md#cli.run-id)
    - trace-hooks [cli.trace-hooks](cli.md#cli.trace-hooks)
    - type [Span](../../src/adapters/trace.ts#L22) <!-- internal -->
      <a id="cli.trace.Span"></a>
    - fn [planned](../../src/adapters/trace.ts#L40) () → typeof plan <!-- internal -->
      <a id="cli.trace.planned"></a><br>Reads what the hooks thread sent so far: the plan, then the files it was applied to.
    - fn [write](../../src/adapters/trace.ts#L59) (event: Record<string, unknown>) → void <!-- internal -->
      <a id="cli.trace.write"></a>
      - calls [cli.trace.planned](cli.md#cli.trace.planned)
    - fn [start](../../src/adapters/trace.ts#L63) (symbolId: string) → Span <!-- internal -->
      <a id="cli.trace.start"></a>
      - calls [cli.trace.write](cli.md#cli.trace.write)
    - fn [finish](../../src/adapters/trace.ts#L71) (span: Span, outcome: "ok" | "error") → void <!-- internal -->
      <a id="cli.trace.finish"></a>
      - calls [cli.trace.write](cli.md#cli.trace.write)
  - module [cli](../../src/cli.ts#L1)
    <a id="cli.cli"></a><br>`keylang` command line: the TUI (no command), web, init, map, check, parse, fmt.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - analyze [map.analyze](map.md#map.analyze)
    - map [map.map](map.md#map.map)
    - explain [features.explain](features.md#features.explain)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - check-results [features.check-results](features.md#features.check-results)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - flows [check.flows](check.md#check.flows)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - draft [features.draft](features.md#features.draft)
    - scc [check.scc](check.md#check.scc)
    - proposals [features.proposals](features.md#features.proposals)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - spec-to-code [features.spec-to-code](features.md#features.spec-to-code)
    - stats [features.stats](features.md#features.stats)
    - wiring [check.wiring](check.md#check.wiring)
    - lsp [cli.lsp](cli.md#cli.lsp)
    - terminal [tui.terminal](tui.md#tui.terminal)
    - web [tui.web](tui.md#tui.web)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - verdict [check.verdict](check.md#check.verdict)
    - span [base.span](base.md#base.span)
    - mcp [cli.mcp](cli.md#cli.mcp)
    - llm [features.llm](features.md#features.llm)
    - draft-llm [features.draft-llm](features.md#features.draft-llm)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - fn [main](../../src/cli.ts#L128) (argv: readonly string[]) → Promise<number>
      <a id="cli.cli.main"></a><br>Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error.
      - calls [cli.cli.run](cli.md#cli.cli.run)
    - fn [run](../../src/cli.ts#L137) (argv: readonly string[]) → Promise<number> <!-- internal -->
      <a id="cli.cli.run"></a>
      - calls [tui.terminal.runTerminal](tui.md#tui.terminal.runTerminal), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.cmdInit](cli.md#cli.cli.cmdInit), [cli.cli.cmdMap](cli.md#cli.cli.cmdMap), [cli.cli.cmdCheck](cli.md#cli.cli.cmdCheck), [cli.cli.cmdExplain](cli.md#cli.cli.cmdExplain), [cli.lsp.serveLsp](cli.md#cli.lsp.serveLsp), [cli.cli.cmdDoctor](cli.md#cli.cli.cmdDoctor), [cli.cli.cmdDraft](cli.md#cli.cli.cmdDraft), [cli.cli.cmdSpecToCode](cli.md#cli.cli.cmdSpecToCode), [cli.cli.cmdCodeToSpec](cli.md#cli.cli.cmdCodeToSpec), [cli.cli.cmdWire](cli.md#cli.cli.cmdWire), [cli.cli.cmdTracePlan](cli.md#cli.cli.cmdTracePlan), [cli.cli.cmdWeb](cli.md#cli.cli.cmdWeb), [cli.cli.needPaths](cli.md#cli.cli.needPaths), [cli.cli.cmdParse](cli.md#cli.cli.cmdParse), [cli.cli.cmdFmt](cli.md#cli.cli.cmdFmt)
    - fn [cmdWeb](../../src/cli.ts#L241) (portText: string, host: string) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWeb"></a>
      - calls [tui.web.serveWeb](tui.md#tui.web.serveWeb), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - type [ExplainOptions](../../src/cli.ts#L271) <!-- internal -->
      <a id="cli.cli.ExplainOptions"></a>
    - fn [cmdExplain](../../src/cli.ts#L282) (subject: string | undefined, opts: ExplainOptions) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExplain"></a>
      - calls [cli.cli.cmdExplainBatch](cli.md#cli.cli.cmdExplainBatch), [map.analyze.analyze](map.md#map.analyze.analyze), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.noteOldExplanations](cli.md#cli.cli.noteOldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [features.explain.explainCode](features.md#features.explain.explainCode), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.unknownIds](features.md#features.explain-llm.unknownIds), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest), [features.explain-llm.briefText](features.md#features.explain-llm.briefText), [features.explain-llm.writeExplanation](features.md#features.explain-llm.writeExplanation)
    - fn [cmdExplainBatch](../../src/cli.ts#L363) (batch: BriefBatch, opts: ExplainOptions) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdExplainBatch"></a><br>`explain --missing|--stale [--llm] [--dry-run] [--limit N] [--jobs N]`: briefs for the explained map, bottom-up. Without `--llm` it lists the nodes; `--dry-run` counts them and estimates tokens.
      - calls [cli.cli.positiveInteger](cli.md#cli.cli.positiveInteger), [map.analyze.analyze](map.md#map.analyze.analyze), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.noteOldExplanations](cli.md#cli.cli.noteOldExplanations), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.explain-llm.planBriefs](features.md#features.explain-llm.planBriefs), [features.explain-llm.estimateTokens](features.md#features.explain-llm.estimateTokens), [features.explain-llm.runBriefs](features.md#features.explain-llm.runBriefs)
    - fn [positiveInteger](../../src/cli.ts#L403) (flag: string, text: string) → number <!-- internal -->
      <a id="cli.cli.positiveInteger"></a>
    - fn [noteOldExplanations](../../src/cli.ts#L410) (config: Config) → void <!-- internal -->
      <a id="cli.cli.noteOldExplanations"></a><br>One note per command while the store of keylang 0.1 still holds files.
      - calls [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint)
    - fn [cmdDraft](../../src/cli.ts#L415) (args: string[], opts: { mode: string; name: string | undefined; into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDraft"></a>
      - calls [cli.cli.cmdDraftLayout](cli.md#cli.cli.cmdDraftLayout), [map.analyze.analyze](map.md#map.analyze.analyze), [map.analyze.findRoot](map.md#map.analyze.findRoot), [features.draft.draftFlow](features.md#features.draft.draftFlow), [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.draft.withFlow](features.md#features.draft.withFlow), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [cli.cli.countProposed](cli.md#cli.cli.countProposed)
    - fn [cmdSpecToCode](../../src/cli.ts#L463) (id: string | undefined, opts: { into: string | undefined; apply: boolean; print: boolean; mode: string }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdSpecToCode"></a>
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [map.analyze.findRoot](map.md#map.analyze.findRoot), [features.spec-to-code.specToCode](features.md#features.spec-to-code.specToCode), [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.lineDiff](features.md#features.proposals.lineDiff), [check.assess.sameFinding](check.md#check.assess.sameFinding), [check.verdict.formatVerdict](check.md#check.verdict.formatVerdict), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [base.safe-write.safeWriteAll](base.md#base.safe-write.safeWriteAll)
    - fn [cmdCodeToSpec](../../src/cli.ts#L506) (at: string | undefined, opts: { into: string | undefined; print: boolean; mode: string; since: string | undefined }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCodeToSpec"></a>
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.analyze.analyze](map.md#map.analyze.analyze), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.draft.changedFlows](features.md#features.draft.changedFlows), [cli.cli.gitChanges](cli.md#cli.cli.gitChanges), [base.config.toPosix](base.md#base.config.toPosix), [features.draft.codeToSpec](features.md#features.draft.codeToSpec), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.draft.withFlow](features.md#features.draft.withFlow), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [cli.cli.countProposed](cli.md#cli.cli.countProposed)
    - fn [countProposed](../../src/cli.ts#L577) (root: string, counts: Record<string, number>) → void <!-- internal -->
      <a id="cli.cli.countProposed"></a><br>The drafted lines count as proposed once the proposal exists; a count that cannot be written never fails the command.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts)
    - fn [cmdDraftLayout](../../src/cli.ts#L585) (what: "rules" | "map", opts: { mode: string; into: string | undefined; print: boolean }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDraftLayout"></a>
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [map.analyze.analyze](map.md#map.analyze.analyze), [base.config.configToJson](base.md#base.config.configToJson), [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.guessLayers](base.md#base.config.guessLayers), [features.draft.draftRules](features.md#features.draft.draftRules), [check.scc.stronglyConnected](check.md#check.scc.stronglyConnected), [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.draft.withRules](features.md#features.draft.withRules), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [cli.cli.countProposed](cli.md#cli.cli.countProposed)
    - fn [cmdWire](../../src/cli.ts#L649) (out: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdWire"></a>
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.toPosix](base.md#base.config.toPosix), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.analyze.analyze](map.md#map.analyze.analyze), [cli.cli.wiringErrors](cli.md#cli.cli.wiringErrors), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [check.wiring.collectWiring](check.md#check.wiring.collectWiring), [map.wire-gen.generateWire](map.md#map.wire-gen.generateWire), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [wiringErrors](../../src/cli.ts#L688) (analysis: Analysis) → Diagnostic[] <!-- internal -->
      <a id="cli.cli.wiringErrors"></a><br>Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated.
      - calls [base.diag.isError](base.md#base.diag.isError)
    - fn [cmdDoctor](../../src/cli.ts#L701) () → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdDoctor"></a><br>What is set up. A problem it finds (a key file others can read, a native module without its binary) is a line of the report, not a failure: §12, code 0.
      - calls [map.analyze.findRoot](map.md#map.analyze.findRoot), [base.config.loadConfig](base.md#base.config.loadConfig), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint)
    - fn [cmdTracePlan](../../src/cli.ts#L743) (flow: string | undefined) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdTracePlan"></a>
      - calls [map.trace-plan.tracePlan](map.md#map.trace-plan.tracePlan), [base.config.loadConfig](base.md#base.config.loadConfig), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - fn [needPaths](../../src/cli.ts#L750) (cmd: string, paths: string[]) → void <!-- internal -->
      <a id="cli.cli.needPaths"></a>
    - fn [cmdInit](../../src/cli.ts#L754) (dir: string) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdInit"></a>
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.guessLayout](base.md#base.config.guessLayout), [base.config.configToJson](base.md#base.config.configToJson), [cli.cli.cmdMap](cli.md#cli.cli.cmdMap)
    - fn [cmdMap](../../src/cli.ts#L775) (dir: string, checkOnly: boolean) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdMap"></a>
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [map.map.diffMap](map.md#map.map.diffMap), [base.config.toPosix](base.md#base.config.toPosix), [map.map.writeMap](map.md#map.map.writeMap)
    - fn [cmdParse](../../src/cli.ts#L814) (paths: string[], json: boolean) → number <!-- internal -->
      <a id="cli.cli.cmdParse"></a>
      - calls [lang.files.load](lang.md#lang.files.load), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [cli.cli.printTree](cli.md#cli.cli.printTree), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [cmdCheck](../../src/cli.ts#L825) (paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string }) → Promise<number> <!-- internal -->
      <a id="cli.cli.cmdCheck"></a>
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [map.analyze.findRoot](map.md#map.analyze.findRoot), [cli.cli.explainEdge](cli.md#cli.cli.explainEdge), [base.config.loadConfig](base.md#base.config.loadConfig), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix), [check.assess.sameFinding](check.md#check.assess.sameFinding), [cli.cli.writeCheck](cli.md#cli.cli.writeCheck)
    - fn [explainEdge](../../src/cli.ts#L869) (ids: string[], snapshot: AnalysisSnapshot | null) → number <!-- internal -->
      <a id="cli.cli.explainEdge"></a>
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [writeCheck](../../src/cli.ts#L903) (format: string, lines: string[], verdicts: Verdict[], snapshot: AnalysisSnapshot | null, diags: Diagnostic[]) → void <!-- internal -->
      <a id="cli.cli.writeCheck"></a>
      - calls [features.check-results.checkResults](features.md#features.check-results.checkResults), [cli.cli.githubProperty](cli.md#cli.cli.githubProperty), [cli.cli.ruleOf](cli.md#cli.cli.ruleOf), [cli.cli.githubData](cli.md#cli.cli.githubData), [cli.cli.ruleText](cli.md#cli.cli.ruleText)
    - fn [ruleOf](../../src/cli.ts#L948) (result: CheckResult) → string <!-- internal -->
      <a id="cli.cli.ruleOf"></a><br>The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind.
    - fn [ruleText](../../src/cli.ts#L960) (id: string) → string <!-- internal -->
      <a id="cli.cli.ruleText"></a>
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [githubData](../../src/cli.ts#L966) (text: string) → string <!-- internal -->
      <a id="cli.cli.githubData"></a>
    - fn [githubProperty](../../src/cli.ts#L970) (text: string) → string <!-- internal -->
      <a id="cli.cli.githubProperty"></a>
      - calls [cli.cli.githubData](cli.md#cli.cli.githubData)
    - fn [cmdFmt](../../src/cli.ts#L979) (paths: string[], checkOnly: boolean) → number <!-- internal -->
      <a id="cli.cli.cmdFmt"></a><br>Each file is formatted on its own, so one that cannot be read or written does not stop the rest: every such failure is reported, and the code is 2; otherwise 1 for diagnostics or, with `--check`, an unformatted file.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [lang.fmt.formatSource](lang.md#lang.fmt.formatSource), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [printTree](../../src/cli.ts#L1015) (doc: Document) → void <!-- internal -->
      <a id="cli.cli.printTree"></a>
      - calls [cli.cli.printNode](cli.md#cli.cli.printNode)
    - fn [printNode](../../src/cli.ts#L1023) (n: Node, depth: number) → void <!-- internal -->
      <a id="cli.cli.printNode"></a>
      - calls [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
    - fn [gitChanges](../../src/cli.ts#L1036) (root: string, ref: string) → ChangedLines <!-- internal -->
      <a id="cli.cli.gitChanges"></a><br>The lines changed since `ref` in the working tree, and the files git does not track yet, relative to `root`.
      - calls [features.draft.diffHunks](features.md#features.draft.diffHunks)
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
    <a id="cli.lsp"></a><br>Stdio language server. It keeps the open buffers, runs one analysis per generation of changes (the same `analyze()` as `keylang check`, with the buffers as an overlay; nothing is written), and answers from the latest generation only: a request waits while a reanalysis is…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - type [Rpc](../../src/lsp.ts#L17) <!-- internal -->
      <a id="cli.lsp.Rpc"></a>
    - fn [serveLsp](../../src/lsp.ts#L30) (read: NodeJS.ReadableStream = process.stdin, write: NodeJS.WritableStream = process.stdout) → Promise<number>
      <a id="cli.lsp.serveLsp"></a>
      - calls [cli.lsp.Server](cli.md#cli.lsp.Server), [cli.lsp.Server.drain](cli.md#cli.lsp.Server.drain), [cli.lsp.Server.reject](cli.md#cli.lsp.Server.reject), [cli.lsp.Server.receive](cli.md#cli.lsp.Server.receive)
    - module [Server](../../src/lsp.ts#L77) <!-- internal -->
      <a id="cli.lsp.Server"></a>
      - fn [constructor](../../src/lsp.ts#L98) (send: (message: Rpc) => void)
        <a id="cli.lsp.Server.constructor"></a>
      - fn [reject](../../src/lsp.ts#L102) (id: number | string | null, code: number, message: string) → void
        <a id="cli.lsp.Server.reject"></a>
      - fn [receive](../../src/lsp.ts#L106) (message: Rpc) → void
        <a id="cli.lsp.Server.receive"></a>
        - calls [cli.lsp.Server.notify](cli.md#cli.lsp.Server.notify), [cli.lsp.Server.request](cli.md#cli.lsp.Server.request)
      - fn [drain](../../src/lsp.ts#L137) () → Promise<void>
        <a id="cli.lsp.Server.drain"></a>
      - fn [notify](../../src/lsp.ts#L142) (method: string, params: Record<string, unknown>) → void <!-- internal -->
        <a id="cli.lsp.Server.notify"></a>
        - calls [cli.lsp.filePath](cli.md#cli.lsp.filePath), [cli.lsp.Server.changed](cli.md#cli.lsp.Server.changed)
      - fn [changed](../../src/lsp.ts#L182) () → void <!-- internal -->
        <a id="cli.lsp.Server.changed"></a><br>A new generation: the running analysis, if any, is superseded.
        - calls [cli.lsp.Server.publish](cli.md#cli.lsp.Server.publish)
      - fn [analysis](../../src/lsp.ts#L191) () → Promise<Analysis> <!-- internal -->
        <a id="cli.lsp.Server.analysis"></a>
        - calls [map.analyze.analyze](map.md#map.analyze.analyze), [cli.lsp.Server.report](cli.md#cli.lsp.Server.report)
      - fn [current](../../src/lsp.ts#L207) () → Promise<Workspace> <!-- internal -->
        <a id="cli.lsp.Server.current"></a><br>The analysis of the current buffers; waits again when they change meanwhile.
        - calls [cli.lsp.Server.analysis](cli.md#cli.lsp.Server.analysis), [features.lsp-features.workspace](features.md#features.lsp-features.workspace)
      - fn [publish](../../src/lsp.ts#L215) () → Promise<void> <!-- internal -->
        <a id="cli.lsp.Server.publish"></a>
        - calls [cli.lsp.Server.current](cli.md#cli.lsp.Server.current), [features.lsp-features.diagnosticsFor](features.md#features.lsp-features.diagnosticsFor), [cli.lsp.Server.relative](cli.md#cli.lsp.Server.relative)
      - fn [relative](../../src/lsp.ts#L239) (abs: string) → string <!-- internal -->
        <a id="cli.lsp.Server.relative"></a>
        - calls [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.within](map.md#map.analyze.within)
      - fn [report](../../src/lsp.ts#L244) (message: string) → void <!-- internal -->
        <a id="cli.lsp.Server.report"></a><br>In stderr (the client's log) and as a message the editor shows, once while the same failure lasts.
      - fn [request](../../src/lsp.ts#L251) (method: string, params: Record<string, unknown>) → Promise<unknown> <!-- internal -->
        <a id="cli.lsp.Server.request"></a>
        - calls [cli.lsp.Server.initialize](cli.md#cli.lsp.Server.initialize), [cli.lsp.LspError](cli.md#cli.lsp.LspError), [cli.lsp.filePath](cli.md#cli.lsp.filePath), [cli.lsp.Server.relative](cli.md#cli.lsp.Server.relative), [features.lsp-features.diagnosticsFor](features.md#features.lsp-features.diagnosticsFor), [cli.lsp.Server.current](cli.md#cli.lsp.Server.current), [features.lsp-features.hover](features.md#features.lsp-features.hover), [features.lsp-features.definition](features.md#features.lsp-features.definition), [features.lsp-features.references](features.md#features.lsp-features.references), [features.lsp-features.documentSymbols](features.md#features.lsp-features.documentSymbols), [features.lsp-features.completions](features.md#features.lsp-features.completions), [features.lsp-features.signatureHelp](features.md#features.lsp-features.signatureHelp), [features.lsp-features.codeLenses](features.md#features.lsp-features.codeLenses), [features.lsp-features.workspaceSymbols](features.md#features.lsp-features.workspaceSymbols)
      - fn [initialize](../../src/lsp.ts#L294) (params: Record<string, unknown>) → unknown <!-- internal -->
        <a id="cli.lsp.Server.initialize"></a>
        - calls [cli.lsp.filePath](cli.md#cli.lsp.filePath), [map.analyze.findRoot](map.md#map.analyze.findRoot)
    - module [LspError](../../src/lsp.ts#L326) <!-- internal -->
      <a id="cli.lsp.LspError"></a>
      - fn [constructor](../../src/lsp.ts#L328) (code: number, message: string)
        <a id="cli.lsp.LspError.constructor"></a>
    - fn [filePath](../../src/lsp.ts#L334) (uri: string) → string <!-- internal -->
      <a id="cli.lsp.filePath"></a>
  - module [mcp](../../src/mcp.ts#L1)
    <a id="cli.mcp"></a><br>`keylang mcp`: the analysis for external agents over MCP (stdio), design §7.3. The graph by default, code on request: `search`, `node`, `code`, `flows`, `check` (the same results as `check --format json`), `explain` (a saved explanation or the offline summary) and `apply_diff`…
    - modelcontextprotocol-sdk [external.modelcontextprotocol-sdk](external.md#external.modelcontextprotocol-sdk)
    - node [external.node](external.md#external.node)
    - zod [external.zod](external.md#external.zod)
    - analyze [map.analyze](map.md#map.analyze)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - proposals [features.proposals](features.md#features.proposals)
    - type [ToolResult](../../src/mcp.ts#L27) <!-- internal -->
      <a id="cli.mcp.ToolResult"></a>
    - fn [json](../../src/mcp.ts#L29) (value: unknown) → ToolResult <!-- internal -->
      <a id="cli.mcp.json"></a>
    - fn [failure](../../src/mcp.ts#L30) (message: string) → ToolResult <!-- internal -->
      <a id="cli.mcp.failure"></a>
    - fn [currentAnalysis](../../src/mcp.ts#L41) (root: string) → () => Promise<Analysis>
      <a id="cli.mcp.currentAnalysis"></a><br>The analysis of the current inputs, cheaper than a new `analyze()` per call. The snapshot is rebuilt every time: its id hashes all the graph depends on (sources, configuration, the files import resolution read).
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [map.map.generateMap](map.md#map.map.generateMap), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [map.analyze.analyze](map.md#map.analyze.analyze)
    - fn [explanationJson](../../src/mcp.ts#L61) (e: NodeExplanation | null) → { text: string; origin: "doc" | "llm"; stale: boolean; agent?: string; date?: string } | null <!-- internal -->
      <a id="cli.mcp.explanationJson"></a><br>A node's explanation for an agent: its text, where it comes from, and for a model's brief the model, the date and whether the code changed since.
    - fn [mcpServer](../../src/mcp.ts#L66) (root: string, version: string) → McpServer
      <a id="cli.mcp.mcpServer"></a>
      - calls [cli.mcp.currentAnalysis](cli.md#cli.mcp.currentAnalysis), [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [cli.mcp.json](cli.md#cli.mcp.json), [cli.mcp.explanationJson](cli.md#cli.mcp.explanationJson), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [cli.mcp.failure](cli.md#cli.mcp.failure), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.check-results.checkResults](features.md#features.check-results.checkResults), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - fn [serveMcp](../../src/mcp.ts#L204) (root: string, version: string) → Promise<number>
      <a id="cli.mcp.serveMcp"></a>
      - calls [cli.mcp.mcpServer](cli.md#cli.mcp.mcpServer)
