<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [agent-cli](#features.agent-cli) · [agent-context](#features.agent-context) · [baseline](#features.baseline) · [changed](#features.changed) · [check-format](#features.check-format) · [check-results](#features.check-results) · [draft-llm](#features.draft-llm) · [draft](#features.draft) · [explain-edge](#features.explain-edge) · [explain-inventory](#features.explain-inventory) · [explain-llm](#features.explain-llm) · [explain-node](#features.explain-node) · [explain-offline](#features.explain-offline) · [explain](#features.explain) · [feature-status](#features.feature-status) · [ghost](#features.ghost) · [git-changes](#features.git-changes) · [git-hook](#features.git-hook) · [harness](#features.harness) · [keys](#features.keys) · [llm](#features.llm) · [lsp-features](#features.lsp-features) · [node-search](#features.node-search) · [proposals](#features.proposals) · [spec-to-code](#features.spec-to-code) · [stale](#features.stale) · [stats](#features.stats) · [voice-local](#features.voice-local) · [voice](#features.voice)

# map

- features
  <a id="features"></a>
  - module [agent-cli](../../src/agent-cli.ts#L1)
    <a id="features.agent-cli"></a><br>An agent CLI as a text model (ADR 0009): `cli:claude`, `cli:codex`, `cli:opencode`, `cli:cursor` or a command defined in `~/.config/keylang/agents.json`. One request is one run of the CLI in "answer only" form: no project hooks, MCP servers or instructions where the CLI can…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - type [Env](../../src/agent-cli.ts#L19) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.agent-cli.Env"></a>
    - type [Preset](../../src/agent-cli.ts#L20) = (typeof AGENT_CLI_PRESETS)[number] <!-- internal -->
      <a id="features.agent-cli.Preset"></a>
    - type [CliDefinition](../../src/agent-cli.ts#L23) = { command: string[] } | { bin: string }
      <a id="features.agent-cli.CliDefinition"></a><br>A user's own CLI: `command[0]` is the binary; `{prompt_file}` and `{model}` are placeholders. A preset name takes only `bin`.
    - type [AgentSettings](../../src/agent-cli.ts#L26)
      <a id="features.agent-cli.AgentSettings"></a><br>`~/.config/keylang/agents.json`, validated.
    - type [AgentSource](../../src/agent-cli.ts#L32) = "KEYLANG_AGENT" | "agents.json" | "keylang.json"
      <a id="features.agent-cli.AgentSource"></a><br>Where the effective agent came from.
    - type [CliRequest](../../src/agent-cli.ts#L34)
      <a id="features.agent-cli.CliRequest"></a>
    - type [CliCallOptions](../../src/agent-cli.ts#L40)
      <a id="features.agent-cli.CliCallOptions"></a><br>`ms`: the call's bound; `fromVariable`: the bound is `KEYLANG_LLM_TIMEOUT_MS`, which the timeout message then names.
    - type [CliClient](../../src/agent-cli.ts#L46)
      <a id="features.agent-cli.CliClient"></a>
    - module [CliCancelled](../../src/agent-cli.ts#L57)
      <a id="features.agent-cli.CliCancelled"></a><br>The caller cancelled the run; `llm.ts` turns it into `LlmCancelled`.
      - fn [constructor](../../src/agent-cli.ts#L58) (agent: string)
        <a id="features.agent-cli.CliCancelled.constructor"></a>
    - fn [agentsFile](../../src/agent-cli.ts#L73) (home: string) → string
      <a id="features.agent-cli.agentsFile"></a>
    - fn [readAgentSettings](../../src/agent-cli.ts#L78) (home: string) → AgentSettings
      <a id="features.agent-cli.readAgentSettings"></a><br>agents.json, validated; an absent file is empty settings. Errors name the file and the field.
      - calls [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.parseAgentSettings](features.md#features.agent-cli.parseAgentSettings)
    - fn [parseAgentSettings](../../src/agent-cli.ts#L91) (file: string, value: unknown) → AgentSettings
      <a id="features.agent-cli.parseAgentSettings"></a><br>The settings of an agents.json already parsed as JSON.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject), [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.cliDefinition](features.md#features.agent-cli.cliDefinition)
    - fn [cliDefinition](../../src/agent-cli.ts#L107) (file: string, name: string, def: unknown) → CliDefinition <!-- internal -->
      <a id="features.agent-cli.cliDefinition"></a>
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [resolveAgent](../../src/agent-cli.ts#L142) (configAgent: string | null, env: Env, home: string) → { agent: string | null; source: AgentSource | null }
      <a id="features.agent-cli.resolveAgent"></a><br>The agent in effect and where it came from: `KEYLANG_AGENT` (an empty variable is unset), else agents.json "use", else keylang.json `agent`. An invalid variable or agents.json throws, naming it.
      - calls [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings)
    - fn [selectedAgent](../../src/agent-cli.ts#L157) (configAgent: string | null, env: Env = process.env, home: string = homedir()) → string | null
      <a id="features.agent-cli.selectedAgent"></a><br>The effective agent for deciding whether to ask at all (ghost, forms): a broken setting counts as an agent, so the request that follows reports it.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent)
    - fn [parseCliAgent](../../src/agent-cli.ts#L166) (agent: string) → { name: string; model: string }
      <a id="features.agent-cli.parseCliAgent"></a><br>`cli:opencode:anthropic/claude-sonnet-5` → name and model (the model keeps its colons).
    - type [Runner](../../src/agent-cli.ts#L173) = { preset: Preset; bin: string } | { command: string[] } <!-- internal -->
      <a id="features.agent-cli.Runner"></a><br>What `cliClient` runs: a preset with its binary, or a user's command.
    - fn [cliClient](../../src/agent-cli.ts#L180) (agent: string, options: { root: string; env: Env; home: string }) → { client: CliClient } | { missing: string }
      <a id="features.agent-cli.cliClient"></a><br>A client for a `cli:` agent, or why there is none (a missing binary, a Grok `agent` where Cursor's was expected): only a PATH scan and, for an `agent` binary, one memoized `--version`. Invalid agents.json throws.
      - calls [features.agent-cli.parseCliAgent](features.md#features.agent-cli.parseCliAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.completeWith](features.md#features.agent-cli.completeWith)
    - fn [presetBinary](../../src/agent-cli.ts#L215) (preset: Preset, bin: string | null, env: Env, home: string) → { bin: string } | { missing: string } <!-- internal -->
      <a id="features.agent-cli.presetBinary"></a><br>The binary of a preset: `bin` from agents.json, else its name on PATH; Cursor's is `cursor-agent`, or `agent` when its version is Cursor's.
      - calls [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.binaryVersion](features.md#features.agent-cli.binaryVersion)
    - fn [binaryVersion](../../src/agent-cli.ts#L236) (bin: string, env: Env) → string | null <!-- internal -->
      <a id="features.agent-cli.binaryVersion"></a><br>The first line of `<bin> --version`, at most 5 s, memoized per process; null when it gives none.
    - fn [shortVersion](../../src/agent-cli.ts#L246) (line: string) → string
      <a id="features.agent-cli.shortVersion"></a><br>`2.1.289 (Claude Code)` → `2.1.289`; `codex-cli 0.155.1` → `0.155.1`; a Cursor build keeps its hash.
    - fn [cliVersion](../../src/agent-cli.ts#L251) (bin: string, env: Env = process.env) → Promise<string | null>
      <a id="features.agent-cli.cliVersion"></a><br>The version of a binary for doctor, asynchronously (5 s cap, never a login or status command).
      - calls [features.agent-cli.shortVersion](features.md#features.agent-cli.shortVersion)
    - type [AgentCliProbe](../../src/agent-cli.ts#L270)
      <a id="features.agent-cli.AgentCliProbe"></a><br>A preset as doctor sees it: its binary (null: none usable) and that binary's version (null: it gave none).
    - fn [probeAgentClis](../../src/agent-cli.ts#L277) (env: Env = process.env, home: string = homedir()) → Promise<AgentCliProbe[]>
      <a id="features.agent-cli.probeAgentClis"></a><br>Every preset, probed in parallel with `--version` only: offline, never a login or status command.
      - calls [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.cliVersion](features.md#features.agent-cli.cliVersion)
    - fn [findBinary](../../src/agent-cli.ts#L295) (name: string, env: Env) → string | null
      <a id="features.agent-cli.findBinary"></a><br>A name on PATH or a path, if it is an executable file.
      - calls [features.agent-cli.executable](features.md#features.agent-cli.executable)
    - fn [executable](../../src/agent-cli.ts#L305) (path: string) → boolean <!-- internal -->
      <a id="features.agent-cli.executable"></a>
    - type [AnswerKind](../../src/agent-cli.ts#L318) = "result-json" | "file" | "opencode-events" | "stdout"
      <a id="features.agent-cli.AnswerKind"></a><br>How the answer is read: a `type:"result"` JSON line, Codex's `-o` file, opencode's NDJSON events, or stdout.
    - type [Invocation](../../src/agent-cli.ts#L320)
      <a id="features.agent-cli.Invocation"></a>
    - fn [invocation](../../src/agent-cli.ts#L335) (runner: Runner, model: string, request: CliRequest, root: string, env: Env, tmp: string) → Invocation
      <a id="features.agent-cli.invocation"></a><br>The process to run for one request; `tmp` is a private directory outside the repository.
      - calls [features.agent-cli.wellFormed](features.md#features.agent-cli.wellFormed), [features.agent-cli.opencodeConfig](features.md#features.agent-cli.opencodeConfig)
    - fn [opencodeConfig](../../src/agent-cli.ts#L416) (existing: string | undefined, system: string) → string <!-- internal -->
      <a id="features.agent-cli.opencodeConfig"></a><br>The user's `OPENCODE_CONFIG_CONTENT` with keylang's agent on top: every permission denied.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [wellFormed](../../src/agent-cli.ts#L430) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.wellFormed"></a>
    - fn [parseResultLine](../../src/agent-cli.ts#L435) (line: string) → { text: string } | { error: string } | null
      <a id="features.agent-cli.parseResultLine"></a><br>A `{"type":"result"}` line of Claude Code or Cursor: the answer, an error, or null for any other line.
      - calls [features.agent-cli.parseJson](features.md#features.agent-cli.parseJson), [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [parseOpencodeEvents](../../src/agent-cli.ts#L444) (output: string) → { text: string } | { error: string }
      <a id="features.agent-cli.parseOpencodeEvents"></a><br>opencode's NDJSON: the text parts after the last step start, or the first error.
      - calls [features.agent-cli.parseJson](features.md#features.agent-cli.parseJson), [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [completeWith](../../src/agent-cli.ts#L463) (agent: string, runner: Runner, model: string, request: CliRequest, options: { root: string; env: Env }, call: CliCallOptions) → Promise<string> <!-- internal -->
      <a id="features.agent-cli.completeWith"></a>
      - calls [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.invocation](features.md#features.agent-cli.invocation), [features.agent-cli.runInvocation](features.md#features.agent-cli.runInvocation), [features.agent-cli.readAnswer](features.md#features.agent-cli.readAnswer)
    - type [RunResult](../../src/agent-cli.ts#L482) <!-- internal -->
      <a id="features.agent-cli.RunResult"></a>
    - fn [readAnswer](../../src/agent-cli.ts#L488) (agent: string, inv: Invocation, run: RunResult) → string <!-- internal -->
      <a id="features.agent-cli.readAnswer"></a>
      - calls [features.agent-cli.lastResult](features.md#features.agent-cli.lastResult), [features.agent-cli.parseOpencodeEvents](features.md#features.agent-cli.parseOpencodeEvents)
    - fn [lastResult](../../src/agent-cli.ts#L508) (stdout: string) → { text: string } | { error: string } | null <!-- internal -->
      <a id="features.agent-cli.lastResult"></a>
      - calls [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine)
    - fn [killGroup](../../src/agent-cli.ts#L518) (pid: number, signal: NodeJS.Signals) → void <!-- internal -->
      <a id="features.agent-cli.killGroup"></a>
    - fn [hookExit](../../src/agent-cli.ts#L527) () → void <!-- internal -->
      <a id="features.agent-cli.hookExit"></a><br>Once: keylang's exit kills every live group; a fatal signal with no handler of its own kills them first and is raised again.
      - calls [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup)
    - fn [runInvocation](../../src/agent-cli.ts#L546) (agent: string, inv: Invocation, root: string, call: CliCallOptions) → Promise<RunResult> <!-- internal -->
      <a id="features.agent-cli.runInvocation"></a>
      - calls [features.agent-cli.hookExit](features.md#features.agent-cli.hookExit), [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup), [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine), [features.agent-cli.stripAnsi](features.md#features.agent-cli.stripAnsi)
    - fn [stripAnsi](../../src/agent-cli.ts#L644) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.stripAnsi"></a>
    - fn [parseJson](../../src/agent-cli.ts#L649) (text: string) → unknown <!-- internal -->
      <a id="features.agent-cli.parseJson"></a>
    - fn [isObject](../../src/agent-cli.ts#L658) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.agent-cli.isObject"></a>
  - module [agent-context](../../src/agent-context.ts#L1)
    <a id="features.agent-context"></a><br>What goes to the model (design §7.3 «Контекст»): the buffer, the nodes on the cursor line and their neighbours, the flows and rules naming them, their code and the tests of those flows — each item with a token estimate, so the person sees and trims what the agent reads. `@id`…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - type [ContextKind](../../src/agent-context.ts#L19)
      <a id="features.agent-context.ContextKind"></a>
    - type [ContextItem](../../src/agent-context.ts#L21)
      <a id="features.agent-context.ContextItem"></a>
    - type [ContextPack](../../src/agent-context.ts#L34)
      <a id="features.agent-context.ContextPack"></a>
    - type [ContextInput](../../src/agent-context.ts#L41)
      <a id="features.agent-context.ContextInput"></a>
    - fn [estimateTokens](../../src/agent-context.ts#L51) (text: string) → number
      <a id="features.agent-context.estimateTokens"></a><br>Roughly four characters a token: an estimate for the person, not a bill.
    - fn [contextForIds](../../src/agent-context.ts#L61) (analysis: Analysis, ids: readonly string[]) → ContextPack
      <a id="features.agent-context.contextForIds"></a><br>The bundle for a list of ids: each node and its neighbors, the flows and rules that name it, its code, and the e2e tests of those flows. A planned id that is not implemented is marked planned and incomplete.
      - calls [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems), [features.agent-context.packOf](features.md#features.agent-context.packOf)
    - fn [contextPack](../../src/agent-context.ts#L73) (analysis: Analysis, input: ContextInput) → ContextPack
      <a id="features.agent-context.contextPack"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.specDigest](features.md#features.agent-context.specDigest), [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems)
    - fn [packOf](../../src/agent-context.ts#L112) (items: ContextItem[], keySource: string) → ContextPack <!-- internal -->
      <a id="features.agent-context.packOf"></a>
    - fn [addIdItems](../../src/agent-context.ts#L117) (analysis: Analysis, ids: readonly string[], removed: ReadonlySet<string>, items: ContextItem[]) → void <!-- internal -->
      <a id="features.agent-context.addIdItems"></a><br>Nodes, neighbors, code, flows, rules and tests for `ids`. `add` is the TUI pack's adder; a fresh list is built when `items` is empty and `removed` is empty.
      - calls [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.sectionText](features.md#features.agent-context.sectionText)
    - fn [sectionText](../../src/agent-context.ts#L162) (doc: Document, section: Section) → string <!-- internal -->
      <a id="features.agent-context.sectionText"></a><br>A section as the analysis read it (an unsaved buffer included), in canonical form.
      - calls [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [specDigest](../../src/agent-context.ts#L167) (analysis: Analysis) → string <!-- internal -->
      <a id="features.agent-context.specDigest"></a><br>What every hand-written spec of the analysis says: part of the pack key, so a changed rule or flow elsewhere is a new pack.
      - calls [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [snapshotSource](../../src/agent-context.ts#L179) (analysis: Analysis, file: string) → string | null
      <a id="features.agent-context.snapshotSource"></a><br>The text of a source file when it still has the bytes the snapshot hashed; null otherwise.
    - fn [contextText](../../src/agent-context.ts#L188) (pack: ContextPack) → string
      <a id="features.agent-context.contextText"></a><br>The pack as the prompt text a model gets.
  - module [baseline](../../src/baseline.ts#L1)
    <a id="features.baseline"></a><br>`keylang/rules.baseline.md`: deny rules for the dependencies the current graph does not have, so a new edge between layers or a new package is K102. The grammar is the ordinary `deny` / `allow`.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - fn [baselineText](../../src/baseline.ts#L25) (snapshot: AnalysisSnapshot) → string
      <a id="features.baseline.baselineText"></a><br>Baseline rules for one snapshot. Layers come from `keylang.json`, in code-unit order; `unassigned` is a source only when a module is in it.
      - calls [features.baseline.externalModule](features.md#features.baseline.externalModule)
    - fn [externalModule](../../src/baseline.ts#L62) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="features.baseline.externalModule"></a><br>The external module an id belongs to (`external.stripe` for a symbol under it).
    - fn [baselinePath](../../src/baseline.ts#L74) (config: Pick<Config, "dir">) → string
      <a id="features.baseline.baselinePath"></a><br>Where the baseline lives: `<dir>/rules.baseline.md`, relative to the root, POSIX.
    - type [BaselinePlan](../../src/baseline.ts#L82)
      <a id="features.baseline.BaselinePlan"></a><br>What `keylang baseline` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planBaseline](../../src/baseline.ts#L103) (config: Config, snapshot: AnalysisSnapshot) → BaselinePlan
      <a id="features.baseline.planBaseline"></a><br>Plans the baseline of `snapshot` against the file on disk. Reads, writes nothing.
      - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [features.baseline.baselineText](features.md#features.baseline.baselineText), [features.baseline.readOrNull](features.md#features.baseline.readOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.baseline.ruleLines](features.md#features.baseline.ruleLines), [map.map.sourceInputs](map.md#map.map.sourceInputs)
    - fn [baselinePlanProblems](../../src/baseline.ts#L128) (plan: BaselinePlan) → string[]
      <a id="features.baseline.baselinePlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): the target must pass the repository's write rules and still hold the bytes the plan saw, and `keylang.json` and the sources must be the ones the baseline was computed from.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems)
    - fn [commitBaseline](../../src/baseline.ts#L137) (plan: BaselinePlan) → void
      <a id="features.baseline.commitBaseline"></a><br>Writes the planned text atomically at the target (a link inside the repository is followed; CRLF of the old file kept). Throws on an I/O error.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [ruleLines](../../src/baseline.ts#L144) (text: string) → string[] <!-- internal -->
      <a id="features.baseline.ruleLines"></a><br>The `- deny` / `- allow` lines of a rules text, in order.
    - fn [readOrNull](../../src/baseline.ts#L148) (abs: string) → string | null <!-- internal -->
      <a id="features.baseline.readOrNull"></a>
  - module [changed](../../src/changed.ts#L1)
    <a id="features.changed"></a><br>`check --changed` keeps the full analysis and drops findings that do not touch the changed files: a changed spec (every finding in that file), a rule whose scope contains a changed module, and a flow with a step whose code is in a changed file. `hook stop` maps the fails that…
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - type [ChangedInput](../../src/changed.ts#L13)
      <a id="features.changed.ChangedInput"></a>
    - type [HookFail](../../src/changed.ts#L21)
      <a id="features.changed.HookFail"></a>
    - type [RuleHit](../../src/changed.ts#L27) <!-- internal -->
      <a id="features.changed.RuleHit"></a>
    - fn [filterChanged](../../src/changed.ts#L41) (input: ChangedInput, changed: ReadonlySet<string>, deleted: readonly string[] = []) → { diagnostics: Diagnostic[]; verdicts: Verdict[] }
      <a id="features.changed.filterChanged"></a><br>Diagnostics and verdicts that touch `changed` (paths as check prints them). `deleted` are module ids whose file git removed: the node is gone, so a flow step that named it is still in the report. Order is preserved.
      - calls [features.changed.ruleHits](features.md#features.changed.ruleHits), [features.changed.covers](features.md#features.changed.covers), [features.changed.flowLinesTouching](features.md#features.changed.flowLinesTouching), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookFails](../../src/changed.ts#L60) (report: { diagnostics: readonly Diagnostic[]; verdicts: readonly Verdict[] }) → HookFail[]
      <a id="features.changed.hookFails"></a><br>Error diagnostics, then fail verdicts that are not the same finding.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookDecision](../../src/changed.ts#L71) (event: { stop_hook_active?: boolean }, fails: readonly HookFail[]) → string
      <a id="features.changed.hookDecision"></a><br>Stdin event plus the fails of one changed check. `stop_hook_active` never blocks. The same inputs return the same JSON.
    - fn [parseHookEvent](../../src/changed.ts#L78) (text: string) → { stop_hook_active?: boolean }
      <a id="features.changed.parseHookEvent"></a><br>The object on stdin. Empty stdin is an event with no `stop_hook_active`.
    - fn [covers](../../src/changed.ts#L93) (scope: readonly string[], moduleId: string, layer: string) → boolean <!-- internal -->
      <a id="features.changed.covers"></a>
    - fn [ruleHits](../../src/changed.ts#L99) (spec: SpecIR) → RuleHit[] <!-- internal -->
      <a id="features.changed.ruleHits"></a><br>Scope and the verdict criterion `--changed` already matches. `no-cycles` stays the literal criterion, not the hashed `no-cycles <module|*>`.
    - fn [flowLinesTouching](../../src/changed.ts#L116) (input: ChangedInput, changed: ReadonlySet<string>, gone: (id: string) => boolean) → Set<string> <!-- internal -->
      <a id="features.changed.flowLinesTouching"></a><br>`file:line` of every verdict in a flow that names a symbol whose file changed or was deleted.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
  - module [check-format](../../src/check-format.ts#L1)
    <a id="features.check-format"></a><br>The text of one check report in each `--format`: exactly what `keylang check` prints on stdout. The CLI writes it; the TUI exports the same bytes to a file.
    - check-results [features.check-results](features.md#features.check-results)
    - explain [features.explain](features.md#features.explain)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [CheckFormat](../../src/check-format.ts#L11) = (typeof CHECK_FORMATS)[number]
      <a id="features.check-format.CheckFormat"></a>
    - type [CheckReportData](../../src/check-format.ts#L14)
      <a id="features.check-format.CheckReportData"></a><br>What a format shows: the `--format json` data and the human lines of the same report.
    - fn [isCheckFormat](../../src/check-format.ts#L21) (name: string) → name is CheckFormat
      <a id="features.check-format.isCheckFormat"></a>
    - fn [checkReportText](../../src/check-format.ts#L26) (format: CheckFormat, report: CheckReportData) → string
      <a id="features.check-format.checkReportText"></a><br>The stdout of `keylang check --format <format>` for `report`, every line ending with `\n`.
      - calls [features.check-format.githubText](features.md#features.check-format.githubText), [features.check-format.sarifLog](features.md#features.check-format.sarifLog)
    - fn [githubText](../../src/check-format.ts#L33) (results: readonly CheckResult[]) → string <!-- internal -->
      <a id="features.check-format.githubText"></a>
      - calls [features.check-format.githubProperty](features.md#features.check-format.githubProperty), [features.check-format.ruleOf](features.md#features.check-format.ruleOf), [features.check-format.githubData](features.md#features.check-format.githubData)
    - fn [sarifLog](../../src/check-format.ts#L43) (report: CheckReportData) → unknown <!-- internal -->
      <a id="features.check-format.sarifLog"></a>
      - calls [features.check-format.ruleText](features.md#features.check-format.ruleText), [features.check-format.ruleOf](features.md#features.check-format.ruleOf)
    - fn [ruleOf](../../src/check-format.ts#L78) (result: CheckResult) → string <!-- internal -->
      <a id="features.check-format.ruleOf"></a><br>The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind.
    - fn [ruleText](../../src/check-format.ts#L90) (id: string) → string <!-- internal -->
      <a id="features.check-format.ruleText"></a>
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [githubData](../../src/check-format.ts#L96) (text: string) → string <!-- internal -->
      <a id="features.check-format.githubData"></a>
    - fn [githubProperty](../../src/check-format.ts#L100) (text: string) → string <!-- internal -->
      <a id="features.check-format.githubProperty"></a>
      - calls [features.check-format.githubData](features.md#features.check-format.githubData)
  - module [check-results](../../src/check-results.ts#L1)
    <a id="features.check-results"></a><br>The results of `keylang check --format json`: diagnostics and verdicts in one list, a diagnostic joined with the verdict it explains. Shared by the CLI, the MCP server and the TUI (the check operation and the findings panel), so an agent sees exactly what CI sees.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Provenance](../../src/check-results.ts#L11) = NonNullable<Verdict["evidence"]>["provenance"] <!-- internal -->
      <a id="features.check-results.Provenance"></a>
    - type [CheckResult](../../src/check-results.ts#L13)
      <a id="features.check-results.CheckResult"></a>
    - fn [checkResults](../../src/check-results.ts#L35) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckResult[]
      <a id="features.check-results.checkResults"></a><br>Diagnostics and verdicts as one list; a verdict that repeats a diagnostic lends it its criterion, hash, and provenance.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [base.diag.isError](base.md#base.diag.isError)
    - type [CheckReport](../../src/check-results.ts#L72)
      <a id="features.check-results.CheckReport"></a><br>What `keylang check` reports, whatever the format: the verdicts decide it, the format only shows it.
    - fn [checkReport](../../src/check-results.ts#L84) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckReport
      <a id="features.check-results.checkReport"></a>
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.check-results.checkResults](features.md#features.check-results.checkResults)
    - fn [checkExitCode](../../src/check-results.ts#L98) (counts: CheckReport["counts"], strict: boolean) → 0 | 1
      <a id="features.check-results.checkExitCode"></a><br>The exit code of `keylang check`: 1 for a failure, or with `strict` for an unverified verdict; else 0 — an unverified one stays visible.
  - module [draft-llm](../../src/draft-llm.ts#L1)
    <a id="features.draft-llm"></a><br>`draft flow --mode llm|hybrid` (design §5.1): the model proposes a flow from a compact map, the flow grammar and flows of this repository; an ID that is neither in the snapshot nor declared `planned` sends the draft back once with the nearest real IDs. The answer is reconciled…
    - analyze [map.analyze](map.md#map.analyze)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - draft [features.draft](features.md#features.draft)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [DraftStatus](../../src/draft-llm.ts#L20) = "agree" | "llm-only" | "algo-only" | "conflict"
      <a id="features.draft-llm.DraftStatus"></a>
    - type [ModelDraft](../../src/draft-llm.ts#L22)
      <a id="features.draft-llm.ModelDraft"></a>
    - fn [draftFlowWithModel](../../src/draft-llm.ts#L47) (analysis: Analysis, trigger: string, client: LlmClient, mode: "llm" | "hybrid", name?: string, context?: string, options: LlmCallOptions = {}) → Promise<ModelDraft>
      <a id="features.draft-llm.draftFlowWithModel"></a><br>`context`: the pack from the TUI context panel, sent as it is shown; `options.signal` cancels the model's rounds.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft-llm.compactMap](features.md#features.draft-llm.compactMap), [features.draft-llm.similarFlows](features.md#features.draft-llm.similarFlows), [features.draft-llm.flowText](features.md#features.draft-llm.flowText), [features.draft-llm.unknownIn](features.md#features.draft-llm.unknownIn), [features.draft-llm.reconcile](features.md#features.draft-llm.reconcile)
    - fn [reconcile](../../src/draft-llm.ts#L88) (analysis: Analysis, text: string, algo: { text: string; steps: readonly string[] }, trigger: string, mode: "llm" | "hybrid", agent: string) → { text: string; counts: Record<DraftStatus, number>; dropped: string[] } <!-- internal -->
      <a id="features.draft-llm.reconcile"></a><br>The model's flow judged on its IR. An item with a parse error other than indentation (a step under an `invariant`, an unknown keyword) is dropped; the requested trigger is added when the answer lacks it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft-llm.reachability](features.md#features.draft-llm.reachability), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [features.draft-llm.algoItem](features.md#features.draft-llm.algoItem), [features.draft-llm.algoCallers](features.md#features.draft-llm.algoCallers), [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [algoItem](../../src/draft-llm.ts#L148) (kind: "trigger" | "step", id: string) → Node <!-- internal -->
      <a id="features.draft-llm.algoItem"></a><br>One provenance-marked item of the algo projection, as the parser reads it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [algoCallers](../../src/draft-llm.ts#L154) (text: string) → [string, string[]][] <!-- internal -->
      <a id="features.draft-llm.algoCallers"></a><br>Each step of the algo draft (preorder) with its callers there, nearest first.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [reachability](../../src/draft-llm.ts#L168) (nodes: NonNullable<Analysis["snapshot"]>["nodes"]) → (from: string, to: string) => boolean <!-- internal -->
      <a id="features.draft-llm.reachability"></a><br>Whether `from` reaches `to` through resolved calls of the snapshot, as a static step proof would.
    - fn [flowText](../../src/draft-llm.ts#L192) (answer: string, name: string) → string <!-- internal -->
      <a id="features.draft-llm.flowText"></a><br>The flow section of an answer: the first fenced block (or the whole answer), under the requested heading. An ID written as code in an item (`` - step `a.b` ``, which the prompt's own examples invite) is the ID.
      - calls [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [unknownIn](../../src/draft-llm.ts#L205) (analysis: Analysis, text: string) → string[] <!-- internal -->
      <a id="features.draft-llm.unknownIn"></a><br>Referenced IDs that are neither snapshot nodes nor `planned` in the draft or the specs.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [compactMap](../../src/draft-llm.ts#L223) (analysis: Analysis, steps: readonly string[]) → string <!-- internal -->
      <a id="features.draft-llm.compactMap"></a><br>The fns the draft can reach, then the rest of their modules; at most 300 lines, which the prompt says.
    - fn [similarFlows](../../src/draft-llm.ts#L233) (docs: readonly Document[], steps: readonly string[]) → string[] <!-- internal -->
      <a id="features.draft-llm.similarFlows"></a><br>Up to three hand-written flows, those sharing most IDs with the draft first.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.draft-llm.lineTree](features.md#features.draft-llm.lineTree)
    - fn [lineTree](../../src/draft-llm.ts#L253) (node: { tokens: { text: string }[]; children: unknown[] }, level: number) → string[] <!-- internal -->
      <a id="features.draft-llm.lineTree"></a>
    - type [RulesDraft](../../src/draft-llm.ts#L259)
      <a id="features.draft-llm.RulesDraft"></a>
    - fn [draftRulesWithModel](../../src/draft-llm.ts#L273) (analysis: Analysis, client: LlmClient, mode: "llm" | "hybrid", algoText: string, target: string, options: LlmCallOptions = {}) → Promise<RulesDraft>
      <a id="features.draft-llm.draftRulesWithModel"></a><br>`draft rules --mode llm|hybrid`: the model proposes rules from the layer dependencies; each is checked at once against the current snapshot, alone, as `check` would: `agree` when it holds, `conflict` when the code breaks it (with the edge), `llm-only` when the evidence is not…
      - calls [features.draft-llm.judgeRule](features.md#features.draft-llm.judgeRule)
    - fn [judgeRule](../../src/draft-llm.ts#L317) (analysis: Analysis, others: readonly Document[], target: string, rule: string, conflicts: string[]) → DraftStatus <!-- internal -->
      <a id="features.draft-llm.judgeRule"></a><br>One rule, checked alone against the snapshot: what it adds to a check without it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [base.config.resolveStatic](base.md#base.config.resolveStatic), [check.assess.assess](check.md#check.assess.assess)
    - fn [draftLayoutWithModel](../../src/draft-llm.ts#L352) (analysis: Analysis, client: LlmClient, files: readonly string[], options: LlmCallOptions = {}) → Promise<Record<string, string[]>>
      <a id="features.draft-llm.draftLayoutWithModel"></a><br>`draft map --mode llm|hybrid`: the model proposes layers (name → globs), validated as `keylang.json` would be. Never written: layers are never assigned without a person (design §5.1 p.4) — the CLI prints them, the TUI moves them into the config buffer on an explicit action.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig)
  - module [draft](../../src/draft.ts#L1)
    <a id="features.draft"></a><br>`keylang draft flow <trigger> --mode algo`: the deterministic projection of a flow from the snapshot's call edges (design §5, §5.3). Each resolved call to a function of the repository becomes a nested `step`, in the order the code writes them; a function already listed is not…
    - config [base.config](base.md#base.config)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [FlowDraft](../../src/draft.ts#L14)
      <a id="features.draft.FlowDraft"></a>
    - fn [draftFlow](../../src/draft.ts#L22) (snapshot: AnalysisSnapshot, trigger: string, options: { name?: string; depth?: number } = {}) → FlowDraft
      <a id="features.draft.draftFlow"></a>
    - fn [withFlow](../../src/draft.ts#L60) (existing: string | null, draft: Pick<FlowDraft, "name" | "text">) → string
      <a id="features.draft.withFlow"></a><br>A spec with the draft added: the section of the same flow is replaced, whatever follows the name on its heading line, otherwise the draft is appended. Sections come from the parser, so a `# ` line in a code block is not a heading.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [withRules](../../src/draft.ts#L84) (existing: string | null, draftText: string) → string
      <a id="features.draft.withRules"></a><br>`draft rules` into an existing spec: the drafted rules go at the end of its last `# rules` section, or into a new `# rules` section at the end, never under a trailing `# flow`. A rule the file already has (comments aside) is not repeated.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [nextHeading](../../src/draft.ts#L114) (sections: readonly { heading: { span: { start: { line: number } } } | null }[], index: number) → number | null <!-- internal -->
      <a id="features.draft.nextHeading"></a><br>0-based line index of the heading after `sections[index]`, or null at the end of the file.
    - fn [distinctNames](../../src/draft.ts#L124) (drafts: readonly FlowDraft[]) → FlowDraft[]
      <a id="features.draft.distinctNames"></a><br>Flow names that keep drafts apart in one spec: two `save` triggers (`A.save`, `B.save`) become `A-save` and `B-save`, taking as many trailing ID segments as it needs.
    - fn [draftRules](../../src/draft.ts#L154) (snapshot: AnalysisSnapshot, cyclic: boolean) → string
      <a id="features.draft.draftRules"></a><br>`draft rules --mode algo`: rules the current code already keeps, so each passes `check` as written. Layers in an order where every observed dependency points down (`a < b`: `b` may use `a`), when the layers form no cycle; otherwise a `deny` for each pair used in one direction…
      - calls [features.draft.layerOrder](features.md#features.draft.layerOrder)
    - fn [layerOrder](../../src/draft.ts#L179) (layers: readonly string[], uses: ReadonlyMap<string, ReadonlySet<string>>) → string[] | null <!-- internal -->
      <a id="features.draft.layerOrder"></a><br>Layers with those used first (Kahn, ties by name); null for a cycle.
    - fn [codeToSpecTriggers](../../src/draft.ts#L198) (snapshot: AnalysisSnapshot, file: string, line: number | null) → { name: string; triggers: string[] }
      <a id="features.draft.codeToSpecTriggers"></a><br>`code-to-spec <path[:line]>`: the functions the code position names — the innermost fn whose range holds the line, or every exported fn of the file in declaration order without a line — and the spec's name: the fn's, or the file's module's. Reads the snapshot only; a position…
    - fn [codeToSpec](../../src/draft.ts#L221) (snapshot: AnalysisSnapshot, file: string, line: number | null) → { name: string; drafts: FlowDraft[] }
      <a id="features.draft.codeToSpec"></a><br>`code-to-spec <path[:line]>`: each fn `codeToSpecTriggers` names as a flow draft; same-named fns get distinct flow names.
      - calls [features.draft.codeToSpecTriggers](features.md#features.draft.codeToSpecTriggers), [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
    - type [ChangedLines](../../src/draft.ts#L228)
      <a id="features.draft.ChangedLines"></a><br>Changed lines per file, 1-based and inclusive; `all` for a file git does not track yet.
    - fn [diffHunks](../../src/draft.ts#L234) (diff: string) → Map<string, [number, number][]>
      <a id="features.draft.diffHunks"></a><br>The new-side line ranges of `git diff --unified=0`. A deletion is the line it happened after, so the fn around it counts as changed.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [deletedDiffPaths](../../src/draft.ts#L257) (diff: string) → string[]
      <a id="features.draft.deletedDiffPaths"></a><br>Paths removed in `git diff` (`--- a/file` then `+++ /dev/null`). `diffHunks` follows the new side, so a deletion has no hunk to land on.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [gitPath](../../src/draft.ts#L271) (text: string) → string <!-- internal -->
      <a id="features.draft.gitPath"></a><br>A path as `git diff` prints it: C-quoted (`"b/\303\251.ts"`, `"b/a\"b.ts"`) when it holds a quote, a backslash or a control byte.
    - fn [changedFlows](../../src/draft.ts#L299) (snapshot: AnalysisSnapshot, changed: ChangedLines, named: ReadonlySet<string>) → { drafts: FlowDraft[]; named: string[] }
      <a id="features.draft.changedFlows"></a><br>`code-to-spec --since <ref>`: a flow draft for each fn the change touches. A fn some hand-written spec already names is reported, not drafted again — its flow is the place to look.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
  - module [explain-edge](../../src/explain-edge.ts#L1)
    <a id="features.explain-edge"></a><br>The evidence between two ids of one snapshot (`keylang check --explain-edge <a> <b>`): the edges from `a` (or a node under it) to `b`, then back, or — with no edge — whether that absence is proven. Only the snapshot's own edges and coverage count; nothing is inferred from the…
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [EdgeEvidence](../../src/explain-edge.ts#L10)
      <a id="features.explain-edge.EdgeEvidence"></a><br>One edge between the two ids: `forward` is `from → to`, `backward` is `to → from`.
    - type [EdgeConclusion](../../src/explain-edge.ts#L20) = "edges" | "complete" | "unresolved"
      <a id="features.explain-edge.EdgeConclusion"></a><br>`edges`: at least one edge; `complete`: no edge and nothing unresolved in `from` that could form one — the absence is proven; `unresolved`: no confirmed edge, but constructs of `from` were not resolved, so it is not.
    - type [EdgeExplanation](../../src/explain-edge.ts#L22)
      <a id="features.explain-edge.EdgeExplanation"></a>
    - fn [edgeIdKnown](../../src/explain-edge.ts#L33) (snapshot: AnalysisSnapshot, id: string) → boolean
      <a id="features.explain-edge.edgeIdKnown"></a><br>An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail under a known module.
    - fn [under](../../src/explain-edge.ts#L37) (id: string, scope: string) → boolean <!-- internal -->
      <a id="features.explain-edge.under"></a>
    - fn [explainEdge](../../src/explain-edge.ts#L40) (snapshot: AnalysisSnapshot, from: string, to: string) → EdgeExplanation
      <a id="features.explain-edge.explainEdge"></a><br>The edges and the coverage between two known ids (see `edgeIdKnown`).
      - calls [features.explain-edge.under](features.md#features.explain-edge.under), [base.span.compareText](base.md#base.span.compareText)
    - fn [edgeLine](../../src/explain-edge.ts#L59) (edge: SnapshotEdge) → string
      <a id="features.explain-edge.edgeLine"></a><br>One edge as the CLI prints it: kind, resolution, provenance, range, fragment, `source → target`, candidates, hook, reason.
    - fn [holeLine](../../src/explain-edge.ts#L67) (hole: CoverageItem) → string
      <a id="features.explain-edge.holeLine"></a><br>One unresolved construct as the CLI prints it.
    - fn [edgeExplanationLines](../../src/explain-edge.ts#L72) (explanation: EdgeExplanation) → string[]
      <a id="features.explain-edge.edgeExplanationLines"></a><br>The CLI's stdout of `check --explain-edge`, line by line.
      - calls [features.explain-edge.edgeLine](features.md#features.explain-edge.edgeLine)
  - module [explain-inventory](../../src/explain-inventory.ts#L1)
    <a id="features.explain-inventory"></a><br>Which explanations need work, without asking a model or writing a file: the stale and gone saved explanations (`explain --stale`), and the plan of a brief batch (`explain --missing|--stale` without `--llm`) with its dry-run size. One result for the CLI and the TUI; the batch…
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - fn [defaultBriefJobs](../../src/explain-inventory.ts#L18) (agent: string | null) → number
      <a id="features.explain-inventory.defaultBriefJobs"></a><br>The default `--jobs` for an agent: 2 for an agent CLI (each request is a whole CLI process on this machine), else 4.
      - calls [base.config.isCliAgent](base.md#base.config.isCliAgent)
    - fn [positiveIntegerProblem](../../src/explain-inventory.ts#L23) (flag: string, text: string) → string | null
      <a id="features.explain-inventory.positiveIntegerProblem"></a><br>The CLI's complaint about `--limit`/`--jobs` text that is not a whole number of at least 1, or null when it is one.
    - type [NodePlace](../../src/explain-inventory.ts#L29)
      <a id="features.explain-inventory.NodePlace"></a><br>Where a node is declared: its code, or the `planned` line of a spec; null for a node with no file (a layer).
    - type [StaleExplanation](../../src/explain-inventory.ts#L38)
      <a id="features.explain-inventory.StaleExplanation"></a><br>A saved explanation that no longer matches the code: `stale` (the closure changed) or `gone` (the ID is in no snapshot and no `planned`).
    - type [StaleInventory](../../src/explain-inventory.ts#L54)
      <a id="features.explain-inventory.StaleInventory"></a><br>`explain --stale`: every saved answer, then every saved brief, that is stale or gone.
    - type [PlannedBriefEntry](../../src/explain-inventory.ts#L61) extends PlannedBrief
      <a id="features.explain-inventory.PlannedBriefEntry"></a><br>One node of a brief plan, with why it is planned.
    - type [BriefPlan](../../src/explain-inventory.ts#L72)
      <a id="features.explain-inventory.BriefPlan"></a><br>A brief batch as it would run, computed before any request: the nodes bottom-up (`wave`), counts by level and, when asked, an approximate size in tokens. A preview: a batch plans again on its own analysis.
    - fn [nodePlace](../../src/explain-inventory.ts#L93) (analysis: Analysis, id: string) → NodePlace | null <!-- internal -->
      <a id="features.explain-inventory.nodePlace"></a>
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [staleInventory](../../src/explain-inventory.ts#L102) (analysis: Analysis) → StaleInventory
      <a id="features.explain-inventory.staleInventory"></a><br>The saved answers and briefs that are stale or gone, in the CLI's order.
      - calls [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [features.explain-inventory.nodePlace](features.md#features.explain-inventory.nodePlace)
    - fn [staleInventoryText](../../src/explain-inventory.ts#L119) (inventory: StaleInventory) → string
      <a id="features.explain-inventory.staleInventoryText"></a><br>`explain --stale` on stdout, byte for byte.
    - fn [briefPlan](../../src/explain-inventory.ts#L129) (analysis: Analysis, options: { batch: BriefBatch; limit: number | null; jobs: number; estimate: boolean }) → BriefPlan
      <a id="features.explain-inventory.briefPlan"></a><br>The plan of a brief batch on `analysis` (which must have a snapshot), cut to `limit` before the estimate.
      - calls [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.explain-llm.planBriefs](features.md#features.explain-llm.planBriefs), [features.explain-inventory.nodePlace](features.md#features.explain-inventory.nodePlace), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.estimateTokens](features.md#features.explain-llm.estimateTokens)
    - fn [briefPlanText](../../src/explain-inventory.ts#L167) (plan: BriefPlan) → string
      <a id="features.explain-inventory.briefPlanText"></a><br>The CLI's stdout of a plan: the dry-run counts and estimate, or the nodes one per line.
  - module [explain-llm](../../src/explain-llm.ts#L1)
    <a id="features.explain-llm"></a><br>The plain-language explanation of a node (design §5.4, ADR 0004): what goes to the model, how the answer is kept, and when it is stale. An explanation lives in `<dir>/explain/<id>.md` (a brief for the explained map in `<dir>/explain/brief/<id>.md`) beside its baseline — the…
    - node [external.node](external.md#external.node)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - analyze [map.analyze](map.md#map.analyze)
    - brief [base.brief](base.md#base.brief)
    - config [base.config](base.md#base.config)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - llm [features.llm](features.md#features.llm)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - span [base.span](base.md#base.span)
    - type [Explanation](../../src/explain-llm.ts#L20) = StoredExplanation
      <a id="features.explain-llm.Explanation"></a>
    - fn [readExplanation](../../src/explain-llm.ts#L23) (config: Config, id: string, detail: ExplanationDetail = "short") → Explanation | null
      <a id="features.explain-llm.readExplanation"></a><br>The saved explanation of `id` at this detail: `short` and `full` share `<id>.md`, a brief has its own file.
      - calls [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
    - fn [explainedIds](../../src/explain-llm.ts#L29) (config: Config, kind: "answers" | "briefs") → string[]
      <a id="features.explain-llm.explainedIds"></a><br>IDs of every saved explanation (`answers`) or brief, sorted.
      - calls [map.explanations.storedIds](map.md#map.explanations.storedIds), [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [oldExplanations](../../src/explain-llm.ts#L34) (root: string) → number
      <a id="features.explain-llm.oldExplanations"></a><br>Explanation files in the store of keylang 0.1, which is not read any more.
    - fn [moveHint](../../src/explain-llm.ts#L40) (config: Config, count: number) → string
      <a id="features.explain-llm.moveHint"></a><br>How to move the store of keylang 0.1 to where explanations live now.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [currentBaseline](../../src/explain-llm.ts#L48) (analysis: Analysis, id: string) → string | null
      <a id="features.explain-llm.currentBaseline"></a><br>The baseline an explanation of `id` is compared with now (`snapshotBaseline`): "" for a planned node, which has no code yet; null when the id is gone.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [isStale](../../src/explain-llm.ts#L53) (analysis: Analysis, id: string, e: Explanation) → boolean
      <a id="features.explain-llm.isStale"></a>
      - calls [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline)
    - fn [briefText](../../src/explain-llm.ts#L58) (answer: string) → string
      <a id="features.explain-llm.briefText"></a><br>A model's brief as saved: one or two sentences in one paragraph, cut by the rule doc comments follow.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [unknownIds](../../src/explain-llm.ts#L66) (analysis: Analysis, text: string) → string[]
      <a id="features.explain-llm.unknownIds"></a><br>`` `a.b.c` `` in the answer that are neither snapshot IDs nor declared `planned`. Only a path that starts with a layer is an ID at all: `` `process.env` `` is code.
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [explanationRequest](../../src/explain-llm.ts#L81) (analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: ExplanationDetail; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.explanationRequest"></a><br>The request: the node's summary, its code, the signatures around it, and the words of the specs that mention it (layer, flows, rules). Not the repository.
      - calls [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-llm.sourceLines](features.md#features.explain-llm.sourceLines), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.members](features.md#features.explain-llm.members)
    - fn [members](../../src/explain-llm.ts#L121) (analysis: Analysis, id: string, briefs: ReadonlyMap<string, StoredExplanation>) → string[] <!-- internal -->
      <a id="features.explain-llm.members"></a><br>The members right under a module, class or layer with their explanations (doc comments, briefs): a layer is explained through its modules, a module through its functions and types.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [sourceLines](../../src/explain-llm.ts#L137) (text: string, from: number, to: number) → string <!-- internal -->
      <a id="features.explain-llm.sourceLines"></a>
    - type [BriefBatch](../../src/explain-llm.ts#L144) = "missing" | "stale"
      <a id="features.explain-llm.BriefBatch"></a><br>Which briefs a batch writes: nodes with no explanation or a stale brief (`missing`), or only stale briefs (`stale`).
    - type [BriefLevel](../../src/explain-llm.ts#L147) = "fn/type" | "class/module" | "layer"
      <a id="features.explain-llm.BriefLevel"></a><br>Levels of the explained map, explained bottom-up: a parent's prompt carries its members' briefs.
    - type [PlannedBrief](../../src/explain-llm.ts#L149)
      <a id="features.explain-llm.PlannedBrief"></a>
    - fn [planBriefs](../../src/explain-llm.ts#L162) (analysis: Analysis, batch: BriefBatch, briefs: ReadonlyMap<string, StoredExplanation>) → PlannedBrief[]
      <a id="features.explain-llm.planBriefs"></a><br>The nodes a batch explains, in the order it asks: fn and types, then classes and modules from the deepest up, then layers. A node with a doc comment is never asked about: the code already says what it does.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [base.span.compareText](base.md#base.span.compareText)
    - fn [estimateTokens](../../src/explain-llm.ts#L180) (analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>) → { input: number; output: number }
      <a id="features.explain-llm.estimateTokens"></a><br>A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out.
      - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest)
  - module [explain-node](../../src/explain-node.ts#L1)
    <a id="features.explain-node"></a><br>`keylang explain <id>` without a model: what the snapshot and the specs say about one node. Deterministic and offline; the LLM explanation (§5.4) builds on it and falls back to it.
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - type [NodeSummary](../../src/explain-node.ts#L9)
      <a id="features.explain-node.NodeSummary"></a>
    - type [ExplainResult](../../src/explain-node.ts#L32)
      <a id="features.explain-node.ExplainResult"></a>
    - fn [summarizeNode](../../src/explain-node.ts#L34) (analysis: Analysis, id: string) → ExplainResult
      <a id="features.explain-node.summarizeNode"></a>
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl), [features.explain-node.nodeHolding](features.md#features.explain-node.nodeHolding), [features.lsp-features.flowsUsing](features.md#features.lsp-features.flowsUsing)
    - fn [nodeHolding](../../src/explain-node.ts#L95) (root: Node, ref: Ref) → Node | null <!-- internal -->
      <a id="features.explain-node.nodeHolding"></a><br>The allow, deny, entry item, nested layer, or module line that holds `ref`.
    - fn [formatSummary](../../src/explain-node.ts#L105) (s: NodeSummary) → string
      <a id="features.explain-node.formatSummary"></a><br>The summary as text: one line per fact, empty facts left out.
  - module [explain-offline](../../src/explain-offline.ts#L1)
    <a id="features.explain-offline"></a><br>`keylang explain <code|id>` without a model: the help of a diagnostic code, or what the snapshot and the specs say about a node with the explanations saved for it. One result for the CLI, the TUI palette and `e`: the doc comment of the code (in the summary), the saved…
    - analyze [map.analyze](map.md#map.analyze)
    - explain [features.explain](features.md#features.explain)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - fn [isDiagnosticCode](../../src/explain-offline.ts#L15) (subject: string) → boolean
      <a id="features.explain-offline.isDiagnosticCode"></a><br>`K001`, `k104`: a diagnostic code, whatever its case, as the CLI tells it from an ID.
    - type [SavedAnswer](../../src/explain-offline.ts#L20)
      <a id="features.explain-offline.SavedAnswer"></a><br>An explanation a model wrote, as saved, judged against the current analysis.
    - type [ExplainLink](../../src/explain-offline.ts#L36)
      <a id="features.explain-offline.ExplainLink"></a><br>A position the summary names: the node itself, a related ID, a flow or a rule line. Only known places; an ID without one has `file: null`.
    - type [CodeExplanation](../../src/explain-offline.ts#L49)
      <a id="features.explain-offline.CodeExplanation"></a>
    - type [NodeExplanation](../../src/explain-offline.ts#L57)
      <a id="features.explain-offline.NodeExplanation"></a>
    - type [OfflineExplanation](../../src/explain-offline.ts#L69) = CodeExplanation | NodeExplanation
      <a id="features.explain-offline.OfflineExplanation"></a>
    - fn [codeExplanation](../../src/explain-offline.ts#L72) (code: string) → CodeExplanation | null
      <a id="features.explain-offline.codeExplanation"></a><br>The help of a diagnostic code, or null for a code keylang does not have.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [unknownIdMessage](../../src/explain-offline.ts#L78) (id: string, suggestion: string | null) → string
      <a id="features.explain-offline.unknownIdMessage"></a><br>The CLI's error for an ID that is neither in the snapshot nor declared `planned`.
    - fn [nodeExplanation](../../src/explain-offline.ts#L83) (analysis: Analysis, id: string, detail: ExplanationDetail) → NodeExplanation | { unknown: string; suggestion: string | null }
      <a id="features.explain-offline.nodeExplanation"></a><br>The offline explanation of `id` on `analysis`, or why there is none.
      - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswer](features.md#features.explain-offline.savedAnswer), [features.explain-offline.summaryLinks](features.md#features.explain-offline.summaryLinks)
    - fn [savedAnswer](../../src/explain-offline.ts#L99) (analysis: Analysis, id: string, e: Explanation) → SavedAnswer
      <a id="features.explain-offline.savedAnswer"></a>
      - calls [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [features.explain-llm.unknownIds](features.md#features.explain-llm.unknownIds), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
    - type [AnswerMiss](../../src/explain-offline.ts#L104) = "missing" | "stale" | "lang" | "detail"
      <a id="features.explain-offline.AnswerMiss"></a><br>Why a saved explanation does not answer `explain <id> --llm`: none, stale, another language or another detail.
    - fn [savedAnswerMiss](../../src/explain-offline.ts#L107) (analysis: Analysis, id: string, saved: Explanation | null, lang: string, detail: ExplanationDetail) → AnswerMiss | null
      <a id="features.explain-offline.savedAnswerMiss"></a><br>Why `saved` does not answer a request of `lang` and `detail`, or null when it does: a fresh one is read, never asked for again.
      - calls [features.explain-llm.isStale](features.md#features.explain-llm.isStale)
    - fn [savedAnswerText](../../src/explain-offline.ts#L115) (saved: SavedAnswer) → string
      <a id="features.explain-offline.savedAnswerText"></a><br>A saved answer as the CLI prints it: the text, a blank line, `agent · date · fresh|stale`, and the made-up IDs.
    - fn [offlineExplanationText](../../src/explain-offline.ts#L121) (explanation: OfflineExplanation) → string
      <a id="features.explain-offline.offlineExplanationText"></a><br>The CLI's stdout for an offline explanation, byte for byte.
      - calls [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-offline.savedAnswerText](features.md#features.explain-offline.savedAnswerText)
    - fn [summaryLinks](../../src/explain-offline.ts#L128) (analysis: Analysis, summary: NodeSummary) → ExplainLink[] <!-- internal -->
      <a id="features.explain-offline.summaryLinks"></a><br>The places the summary names, in its order; a related ID is a place only where the snapshot or a `planned` declares it.
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
  - module [explain](../../src/explain.ts#L1)
    <a id="features.explain"></a><br>Short explanations for diagnostic codes. Every code in `diag.ts` has an entry.
    - diag [base.diag](base.md#base.diag)
    - fn [explainCode](../../src/explain.ts#L109) (code: string) → string | null
      <a id="features.explain.explainCode"></a>
  - module [feature-status](../../src/feature-status.ts#L1)
    <a id="features.feature-status"></a><br>Whether a feature file is done: every `planned` in it is implemented (K202, not K201), every flow step in it is static ok, no rule fail exists in any spec, and the plan was not weakened since the base commit. Tests and trace are reported and do not block.
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - flows [check.flows](check.md#check.flows)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Gap](../../src/feature-status.ts#L15)
      <a id="features.feature-status.Gap"></a>
    - type [FeatureInfo](../../src/feature-status.ts#L24)
      <a id="features.feature-status.FeatureInfo"></a>
    - type [FeatureBase](../../src/feature-status.ts#L38)
      <a id="features.feature-status.FeatureBase"></a><br>The feature file at its base commit (`HEAD` or `--since`). `compared`: the file is there; `absent`: it is not (a new feature, or no commit yet); `unavailable`: the history could not be read, so the plan is not compared.
    - type [FeatureBaseInfo](../../src/feature-status.ts#L44)
      <a id="features.feature-status.FeatureBaseInfo"></a><br>`FeatureBase` as the report shows it.
    - type [FeatureReport](../../src/feature-status.ts#L46)
      <a id="features.feature-status.FeatureReport"></a>
    - type [FeatureInput](../../src/feature-status.ts#L52)
      <a id="features.feature-status.FeatureInput"></a>
    - fn [idsIn](../../src/feature-status.ts#L69) (doc: Document) → string[]
      <a id="features.feature-status.idsIn"></a><br>Ids declared or named in one spec, in first-seen order.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [featureStatus](../../src/feature-status.ts#L86) (input: FeatureInput, slug: string) → FeatureReport | null
      <a id="features.feature-status.featureStatus"></a><br>The feature report, or null when `keylang/<dir>/features/<slug>.md` is not one of the specs. Gaps are ordered by kind, then file, line, column, id.
      - calls [features.feature-status.finding](features.md#features.feature-status.finding), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.feature-status.planGaps](features.md#features.feature-status.planGaps), [base.span.compareText](base.md#base.span.compareText)
    - fn [planGaps](../../src/feature-status.ts#L154) (input: FeatureInput, path: string, ref: string, baseDoc: Document) → Gap[] <!-- internal -->
      <a id="features.feature-status.planGaps"></a><br>Where the feature file weakened its plan since `ref`: a `planned` removed while the code does not implement it (no K202), and a `trigger` or `step` that is no longer there under the same flow and parents. Added items and order among siblings are not compared.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.flows.plannedMismatch](check.md#check.flows.plannedMismatch), [features.feature-status.planItems](features.md#features.feature-status.planItems)
    - type [PlanItem](../../src/feature-status.ts#L182) = Trigger | FlowStep <!-- internal -->
      <a id="features.feature-status.PlanItem"></a>
    - fn [planItems](../../src/feature-status.ts#L185) (flow: Flow) → { key: string; item: PlanItem }[] <!-- internal -->
      <a id="features.feature-status.planItems"></a><br>Every `trigger` and `step` of a flow with a key: the flow, its parents, and itself.
    - fn [finding](../../src/feature-status.ts#L198) (diagnostics: readonly Diagnostic[], file: string, line: number, code: string) → Diagnostic | undefined <!-- internal -->
      <a id="features.feature-status.finding"></a>
  - module [ghost](../../src/ghost.ts#L1)
    <a id="features.ghost"></a><br>Ghost text (design §7.3): one next line of a flow from the agent, shown grey after a pause and only on a cheap signal — the cursor on a new `- ` item of a flow that has a trigger. A suggestion is checked where it would stand, in the buffer: one that does not parse there (a step…
    - analyze [map.analyze](map.md#map.analyze)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - ir [lang.ir](lang.md#lang.ir)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [ghostSignal](../../src/ghost.ts#L16) (path: string, text: string, line: number, col: number) → boolean
      <a id="features.ghost.ghostSignal"></a><br>The cursor line starts a new list item (`- ` and nothing after it) inside a `# flow` with a trigger.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [ghostSuggestions](../../src/ghost.ts#L36) (analysis: Analysis, client: LlmClient, path: string, text: string, line: number, pack: ContextPack | null, signal?: AbortSignal) → Promise<string[]>
      <a id="features.ghost.ghostSuggestions"></a><br>Up to three one-line continuations; each keeps the indentation of the cursor line and names only known IDs. `signal` cancels the request (`LlmCancelled`) once the line it was asked for is gone.
      - calls [features.agent-context.contextText](features.md#features.agent-context.contextText), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.parser.parse](lang.md#lang.parser.parse)
  - module [git-changes](../../src/git-changes.ts#L1)
    <a id="features.git-changes"></a><br>What git says changed in the working tree since a ref: the inputs of `check --changed`, `hook stop` and `code-to-spec --since`, and the feature file at its base commit for `feature`. Git runs as an argument array in the given root, never through a shell; a ref that looks like…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - draft [features.draft](features.md#features.draft)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - graph [map.graph](map.md#map.graph)
    - parser [lang.parser](lang.md#lang.parser)
    - type [ChangedFiles](../../src/git-changes.ts#L18)
      <a id="features.git-changes.ChangedFiles"></a><br>Files changed since a ref. Paths are POSIX, relative to the root.
    - fn [gitIn](../../src/git-changes.ts#L28) (root: string, label: string) → { run: (args: string[], input?: string) => SpawnSyncReturns<string>; git: (args: string[], input?: string) => string } <!-- internal -->
      <a id="features.git-changes.gitIn"></a><br>A git runner for `root`; `label` names the caller in its errors (`check --changed`).
    - fn [assertRef](../../src/git-changes.ts#L41) (ref: string, label: string) → void <!-- internal -->
      <a id="features.git-changes.assertRef"></a><br>A ref git would read as an option (`--output=…`) is refused: it is never passed on.
    - fn [diffArgs](../../src/git-changes.ts#L47) (base: string) → string[] <!-- internal -->
      <a id="features.git-changes.diffArgs"></a>
    - fn [untracked](../../src/git-changes.ts#L49) (git: (args: string[]) => string) → string[] <!-- internal -->
      <a id="features.git-changes.untracked"></a>
    - fn [gitChangedFiles](../../src/git-changes.ts#L55) (root: string, ref: string, label = "check --changed") → ChangedFiles
      <a id="features.git-changes.gitChangedFiles"></a><br>Files changed since `ref` in the working tree, plus files git does not track yet.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.draft.deletedDiffPaths](features.md#features.draft.deletedDiffPaths), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.untracked](features.md#features.git-changes.untracked)
    - fn [gitChangedLines](../../src/git-changes.ts#L69) (root: string, ref: string, label = "code-to-spec --since") → ChangedLines
      <a id="features.git-changes.gitChangedLines"></a><br>The lines changed since `ref` in the working tree, and the files git does not track yet (`all`), relative to `root`.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.git-changes.untracked](features.md#features.git-changes.untracked)
    - fn [changedPathSet](../../src/git-changes.ts#L78) (root: string, files: Iterable<string>, base: string) → Set<string>
      <a id="features.git-changes.changedPathSet"></a><br>Git paths are relative to `root`; check reports spec paths relative to `base`. Both forms match.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [gitFileAt](../../src/git-changes.ts#L92) (root: string, ref: string, path: string, label: string) → string | null
      <a id="features.git-changes.gitFileAt"></a><br>The text of `path` (POSIX, relative to `root`) at `ref`, or null when the file is not in that commit or `HEAD` has no commit yet. An unknown ref, no git, or no repository is an error naming the caller.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [readFeatureBase](../../src/git-changes.ts#L111) (root: string, path: string, since: string | undefined, label: string) → FeatureBase
      <a id="features.git-changes.readFeatureBase"></a><br>The feature file at its base commit (`since`, else `HEAD`). Without an explicit `since`, a failure to read git is an informational state, not an error; with it, the error is thrown.
      - calls [features.git-changes.gitFileAt](features.md#features.git-changes.gitFileAt), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [deletedModuleIds](../../src/git-changes.ts#L125) (config: Config, files: readonly string[]) → string[]
      <a id="features.git-changes.deletedModuleIds"></a><br>Module id a deleted source file had, so a flow step that named it is still "changed".
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
  - module [git-hook](../../src/git-hook.ts#L1)
    <a id="features.git-hook"></a><br>`keylang hook install`: the git pre-commit hook that runs `check --changed`. The hook file is keylang's as a whole, found by its marker; a hook without the marker belongs to someone else and is never rewritten.
    - node [external.node](external.md#external.node)
    - fn [preCommitCommand](../../src/git-hook.ts#L11) (version: string) → string
      <a id="features.git-hook.preCommitCommand"></a><br>What the hook runs: the published CLI of this version, as the harness hooks do.
    - fn [preCommitText](../../src/git-hook.ts#L16) (version: string) → string
      <a id="features.git-hook.preCommitText"></a><br>The whole hook file.
      - calls [features.git-hook.preCommitCommand](features.md#features.git-hook.preCommitCommand)
    - type [PreCommitState](../../src/git-hook.ts#L27) = "missing" | "foreign" | "stale" | "current"
      <a id="features.git-hook.PreCommitState"></a><br>`missing`: no file; `foreign`: a hook without keylang's marker; `stale`: keylang's, but other text or not executable.
    - fn [preCommitState](../../src/git-hook.ts#L29) (current: string | null, executable: boolean, version: string) → PreCommitState
      <a id="features.git-hook.preCommitState"></a>
      - calls [features.git-hook.preCommitText](features.md#features.git-hook.preCommitText)
    - fn [gitHooksDir](../../src/git-hook.ts#L41) (cwd: string) → string
      <a id="features.git-hook.gitHooksDir"></a><br>The hooks directory git uses for the repository around `cwd`, absolute: `git rev-parse --git-path hooks` honours `core.hooksPath` and linked worktrees. It is asked from the top level, where a relative `core.hooksPath` is resolved.
      - calls [features.git-hook.git](features.md#features.git-hook.git)
    - fn [git](../../src/git-hook.ts#L46) (cwd: string, args: string[]) → string <!-- internal -->
      <a id="features.git-hook.git"></a>
  - module [harness](../../src/harness.ts#L1)
    <a id="features.harness"></a><br>Harness adapters: one pure merge from the files on disk and the selected harnesses to the next text. Markdown keeps a marked block; JSON and TOML replace only the `keylang` key.
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - fn [skillFile](../../src/harness.ts#L30) () → string
      <a id="features.harness.skillFile"></a><br>The skill shipped in the package. The same relative path works from `src` and from `dist`.
    - type [HarnessName](../../src/harness.ts#L35) = (typeof HARNESS_NAMES)[number]
      <a id="features.harness.HarnessName"></a>
    - type [HarnessSelection](../../src/harness.ts#L48)
      <a id="features.harness.HarnessSelection"></a>
    - type [HarnessFile](../../src/harness.ts#L54)
      <a id="features.harness.HarnessFile"></a>
    - type [HarnessPlan](../../src/harness.ts#L60)
      <a id="features.harness.HarnessPlan"></a>
    - fn [parseAgents](../../src/harness.ts#L66) (value: string) → HarnessSelection
      <a id="features.harness.parseAgents"></a><br>`--agents=<list>`. `none` is the empty selection. An unknown name throws and lists the allowed names.
    - type [HarnessProbe](../../src/harness.ts#L80)
      <a id="features.harness.HarnessProbe"></a><br>What is on disk for harness detection. `list` returns child names, or null when the path is not a directory.
    - fn [detectHarnesses](../../src/harness.ts#L90) (probe: HarnessProbe) → HarnessName[]
      <a id="features.harness.detectHarnesses"></a><br>Directories and files that mean a harness is already in use. Order matches `HARNESS_NAMES`. `.claude/skills/keylang-feature` is the copy `agents` writes for every harness, so that tree alone is not Claude.
      - calls [features.harness.claudePresent](features.md#features.harness.claudePresent)
    - fn [claudePresent](../../src/harness.ts#L101) (probe: HarnessProbe) → boolean <!-- internal -->
      <a id="features.harness.claudePresent"></a>
      - calls [features.harness.claudeHasUserFile](features.md#features.harness.claudeHasUserFile)
    - fn [claudeHasUserFile](../../src/harness.ts#L109) (probe: HarnessProbe, dir: string) → boolean <!-- internal -->
      <a id="features.harness.claudeHasUserFile"></a><br>A file under `.claude` that is not the keylang skill copy.
    - fn [agentsBody](../../src/harness.ts#L123) () → string
      <a id="features.harness.agentsBody"></a><br>The instruction body between the markers, without a trailing newline.
    - fn [mcpCommand](../../src/harness.ts#L145) (version: string) → { command: string; args: string[] }
      <a id="features.harness.mcpCommand"></a><br>`npx -y keylang@<version> mcp`, split the way MCP configs store a command.
    - fn [hookCommand](../../src/harness.ts#L150) (version: string) → string
      <a id="features.harness.hookCommand"></a><br>What the Stop hook runs.
    - fn [planHarness](../../src/harness.ts#L159) (input: { selection: HarnessSelection; version: string; skill: string; files: ReadonlyMap<string, string | null> }) → HarnessPlan
      <a id="features.harness.planHarness"></a><br>Desired text of every harness file this selection owns. `files` holds the current text, null when the file is absent. The first broken marker or invalid JSON/TOML is `error` and `files` is empty: the caller writes nothing.
      - calls [features.harness.agentsBody](features.md#features.harness.agentsBody), [features.harness.mergeMarked](features.md#features.harness.mergeMarked), [features.harness.mergeClaude](features.md#features.harness.mergeClaude), [features.harness.mergeMcpJson](features.md#features.harness.mergeMcpJson), [features.harness.mergeCodexToml](features.md#features.harness.mergeCodexToml), [features.harness.opencodeFile](features.md#features.harness.opencodeFile), [features.harness.mergeOpencode](features.md#features.harness.mergeOpencode), [features.harness.mergeSettings](features.md#features.harness.mergeSettings), [features.harness.mergeHooksFile](features.md#features.harness.mergeHooksFile)
    - fn [mergeMarked](../../src/harness.ts#L242) (existing: string | null, body: string | null) → { text: string | null } | { error: string }
      <a id="features.harness.mergeMarked"></a><br>Splice `body` between the markers. Text outside them is copied byte for byte. `body` null removes the block.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [features.harness.marked](features.md#features.harness.marked)
    - fn [marked](../../src/harness.ts#L267) (body: string, nl: "\n" | "\r\n") → string <!-- internal -->
      <a id="features.harness.marked"></a>
    - fn [mergeClaude](../../src/harness.ts#L276) (existing: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeClaude"></a><br>`@AGENTS.md` lives in the managed block. A file that already says it outside the block is left without a second copy (the block is removed).
      - calls [features.harness.outsideMarkers](features.md#features.harness.outsideMarkers), [features.harness.mergeMarked](features.md#features.harness.mergeMarked)
    - fn [outsideMarkers](../../src/harness.ts#L283) (existing: string | null) → string | { error: string } <!-- internal -->
      <a id="features.harness.outsideMarkers"></a>
    - fn [mergeMcpJson](../../src/harness.ts#L293) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeMcpJson"></a>
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [mergeOpencode](../../src/harness.ts#L297) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeOpencode"></a>
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey)
    - fn [mergeCodexToml](../../src/harness.ts#L302) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeCodexToml"></a>
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [mergeSettings](../../src/harness.ts#L323) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeSettings"></a>
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.mergeDeny](features.md#features.harness.mergeDeny), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeHooksFile](../../src/harness.ts#L338) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksFile"></a>
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeDeny](../../src/harness.ts#L348) (permissions: unknown, install: boolean) → { value: unknown } | { error: string } <!-- internal -->
      <a id="features.harness.mergeDeny"></a>
      - calls [features.harness.isRecord](features.md#features.harness.isRecord)
    - fn [mergeHooksValue](../../src/harness.ts#L362) (hooks: unknown, version: string | null) → { value: unknown } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksValue"></a>
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.rewriteGroup](features.md#features.harness.rewriteGroup), [features.harness.hookCommand](features.md#features.harness.hookCommand), [features.harness.emptyGroup](features.md#features.harness.emptyGroup)
    - fn [rewriteGroup](../../src/harness.ts#L381) (group: unknown, version: string | null) → Record<string, unknown> | { error: string } <!-- internal -->
      <a id="features.harness.rewriteGroup"></a>
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.isOurHook](features.md#features.harness.isOurHook), [features.harness.hookCommand](features.md#features.harness.hookCommand)
    - fn [emptyGroup](../../src/harness.ts#L397) (group: Record<string, unknown>) → boolean <!-- internal -->
      <a id="features.harness.emptyGroup"></a>
    - fn [isOurHook](../../src/harness.ts#L401) (command: string) → boolean <!-- internal -->
      <a id="features.harness.isOurHook"></a>
    - fn [mergeJsonKey](../../src/harness.ts#L405) (existing: string | null, path: readonly string[], server: unknown) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeJsonKey"></a>
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [parseObject](../../src/harness.ts#L419) (existing: string | null) → { value: Record<string, unknown> } | { error: string } <!-- internal -->
      <a id="features.harness.parseObject"></a>
      - calls [features.harness.isRecord](features.md#features.harness.isRecord)
    - fn [finishJson](../../src/harness.ts#L430) (data: Record<string, unknown>) → { text: string | null } <!-- internal -->
      <a id="features.harness.finishJson"></a>
    - fn [opencodeFile](../../src/harness.ts#L435) (files: ReadonlyMap<string, string | null>) → string <!-- internal -->
      <a id="features.harness.opencodeFile"></a>
    - fn [isRecord](../../src/harness.ts#L441) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.harness.isRecord"></a>
    - type [HarnessChoice](../../src/harness.ts#L448) = "auto" | "none" | readonly HarnessName[]
      <a id="features.harness.HarnessChoice"></a><br>Which harnesses: detected from the disk, none (strip keylang's files), or a named, non-empty list.
    - fn [harnessChoice](../../src/harness.ts#L451) (flag: string | undefined) → HarnessChoice
      <a id="features.harness.harnessChoice"></a><br>`--agents=<list>` as a choice; left out, the harnesses are detected. Throws as `parseAgents` does.
      - calls [features.harness.parseAgents](features.md#features.harness.parseAgents)
    - fn [keylangVersion](../../src/harness.ts#L458) () → string
      <a id="features.harness.keylangVersion"></a><br>The version the MCP command and the Stop hook pin: the running keylang's `package.json`, from `src` and from `dist`.
    - type [HarnessCategory](../../src/harness.ts#L463) = "instructions" | "mcp" | "skill" | "settings" | "hooks"
      <a id="features.harness.HarnessCategory"></a><br>What a harness file is for, as a step before the write names it.
    - fn [harnessCategory](../../src/harness.ts#L465) (path: string) → HarnessCategory
      <a id="features.harness.harnessCategory"></a>
    - fn [diskProbe](../../src/harness.ts#L474) (root: string) → HarnessProbe
      <a id="features.harness.diskProbe"></a><br>The probe of the real disk: `.claude` and the other harness directories are directories; opencode is a file.
    - fn [resolveChoice](../../src/harness.ts#L495) (choice: HarnessChoice, probe: HarnessProbe) → HarnessSelection
      <a id="features.harness.resolveChoice"></a><br>The selection a choice resolves to on this disk: `auto` keeps the instruction block even when nothing is detected; `none` has none.
      - calls [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses)
    - type [HarnessTarget](../../src/harness.ts#L505)
      <a id="features.harness.HarnessTarget"></a><br>One file of the plan: the text it should hold (null: absent) against what is there now.
    - type [AgentsPlan](../../src/harness.ts#L517)
      <a id="features.harness.AgentsPlan"></a><br>What `keylang agents` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planAgents](../../src/harness.ts#L531) (root: string, choice: HarnessChoice) → AgentsPlan
      <a id="features.harness.planAgents"></a><br>Plans the harness files of `choice` against the disk under `root`. Reads, writes nothing; throws on a read error.
      - calls [features.harness.resolveChoice](features.md#features.harness.resolveChoice), [features.harness.diskProbe](features.md#features.harness.diskProbe), [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.skillFile](features.md#features.harness.skillFile), [features.harness.keylangVersion](features.md#features.harness.keylangVersion), [features.harness.planHarness](features.md#features.harness.planHarness), [features.harness.harnessCategory](features.md#features.harness.harnessCategory)
    - fn [readInputs](../../src/harness.ts#L546) (root: string) → Map<string, string | null> <!-- internal -->
      <a id="features.harness.readInputs"></a>
    - fn [agentsPlanProblems](../../src/harness.ts#L556) (plan: AgentsPlan) → string[]
      <a id="features.harness.agentsPlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): every harness path must still hold the bytes the plan read, a target must pass the repository's write rules, and `auto` must still detect the same harnesses.
      - calls [features.harness.readInputs](features.md#features.harness.readInputs), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses), [features.harness.diskProbe](features.md#features.harness.diskProbe)
    - type [HarnessStep](../../src/harness.ts#L581)
      <a id="features.harness.HarnessStep"></a><br>One file step of a commit, with what became of it.
    - fn [commitAgents](../../src/harness.ts#L596) ( plan: AgentsPlan, options: { signal?: AbortSignal; onStep?: (step: { path: string; action: "write" | "remove" }) => void } = {}, ) → Promise<{ steps: HarnessStep[]; outcome: "completed" | "failed" | "cancelled" }>
      <a id="features.harness.commitAgents"></a><br>Writes and removes the changed targets one by one, in plan order. A write is atomic at the target (a link inside the repository is followed; CRLF of the old file kept); a removal removes the entry itself.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
  - module [keys](../../src/keys.ts#L1)
    <a id="features.keys"></a><br>API keys kept outside the environment: `~/.config/keylang/<name>.key`, mode 0600. Shared by the model adapter and voice, without loading either.
    - node [external.node](external.md#external.node)
    - fn [readKey](../../src/keys.ts#L8) (home: string, name: string) → string | undefined
      <a id="features.keys.readKey"></a><br>The key in `~/.config/keylang/<name>.key`; a file others can read is refused, not used.
  - module [llm](../../src/llm.ts#L1)
    <a id="features.llm"></a><br>One text completion from the configured model (`KEYLANG_AGENT`, else `~/.config/keylang/agents.json` "use", else `keylang.json` `agent`): `anthropic:<model>` through the official SDK, `openrouter:<model>` through its chat completions endpoint with SSE, `cli:<name>[:<model>]`…
    - Anthropic [external.anthropic-ai-sdk](external.md#external.anthropic-ai-sdk)
    - eventsource-parser [external.eventsource-parser](external.md#external.eventsource-parser)
    - node [external.node](external.md#external.node)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - config [base.config](base.md#base.config)
    - keys [features.keys](features.md#features.keys)
    - type [LlmRequest](../../src/llm.ts#L27)
      <a id="features.llm.LlmRequest"></a>
    - type [LlmCallOptions](../../src/llm.ts#L34)
      <a id="features.llm.LlmCallOptions"></a><br>Per call: `signal` cancels the request (and its stream); `timeoutMs` bounds it tighter than `KEYLANG_LLM_TIMEOUT_MS`. Without options a call ends by its answer or the timeout.
    - type [LlmClientOptions](../../src/llm.ts#L43)
      <a id="features.llm.LlmClientOptions"></a><br>Where a client runs: `root` is the repository (the working directory of an agent CLI); `env` and `home` default to the process's own.
    - type [LlmClient](../../src/llm.ts#L49)
      <a id="features.llm.LlmClient"></a>
    - module [LlmCancelled](../../src/llm.ts#L59)
      <a id="features.llm.LlmCancelled"></a><br>The caller cancelled the request: not a timeout, not a provider error, and no partial answer.
      - fn [constructor](../../src/llm.ts#L60) (provider: string)
        <a id="features.llm.LlmCancelled.constructor"></a>
    - fn [isCancelled](../../src/llm.ts#L67) (error: unknown) → error is LlmCancelled
      <a id="features.llm.isCancelled"></a><br>The error of a request its caller cancelled.
    - type [LlmSetup](../../src/llm.ts#L71) = { client: LlmClient } | { missing: string }
      <a id="features.llm.LlmSetup"></a>
    - type [Env](../../src/llm.ts#L73) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.llm.Env"></a>
    - fn [llmClient](../../src/llm.ts#L85) (configAgent: string | null, options: LlmClientOptions) → LlmSetup
      <a id="features.llm.llmClient"></a><br>The client of the effective agent: `configAgent` is keylang.json's, which `KEYLANG_AGENT` and agents.json "use" override. An invalid variable or agents.json throws, naming it; a missing key or binary is `missing`.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent), [features.llm.timeoutMs](features.md#features.llm.timeoutMs), [base.config.isCliAgent](base.md#base.config.isCliAgent), [features.agent-cli.cliClient](features.md#features.agent-cli.cliClient), [features.llm.deadline](features.md#features.llm.deadline), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.keys.readKey](features.md#features.keys.readKey), [features.llm.anthropicComplete](features.md#features.llm.anthropicComplete), [features.llm.openrouterComplete](features.md#features.llm.openrouterComplete)
    - fn [timeoutMs](../../src/llm.ts#L131) (env: Env) → number | string <!-- internal -->
      <a id="features.llm.timeoutMs"></a><br>`KEYLANG_LLM_TIMEOUT_MS`, a positive whole number of milliseconds; the reason when it is not one.
    - type [Deadline](../../src/llm.ts#L138) <!-- internal -->
      <a id="features.llm.Deadline"></a><br>A call's bound: the variable's, or the call's own when that is tighter; `fromVariable` decides whether the timeout message cites the variable.
    - fn [deadline](../../src/llm.ts#L143) (variable: number, own: number | undefined) → Deadline <!-- internal -->
      <a id="features.llm.deadline"></a>
    - fn [timeoutMessage](../../src/llm.ts#L147) (provider: string, bound: Deadline) → string <!-- internal -->
      <a id="features.llm.timeoutMessage"></a>
    - fn [callSignal](../../src/llm.ts#L156) (timeout: number, outer: AbortSignal | undefined) → { signal: AbortSignal; timedOut: () => boolean; cancelled: () => boolean; dispose: () => void } <!-- internal -->
      <a id="features.llm.callSignal"></a><br>One signal for a whole call: aborted by the deadline or by the caller's signal, whichever comes first; `dispose` clears the timer and the listener on the caller's signal, so a long-lived signal does not collect them.
    - fn [anthropicComplete](../../src/llm.ts#L180) (client: Anthropic, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.anthropicComplete"></a>
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage)
    - fn [openrouterComplete](../../src/llm.ts#L214) (base: string, key: string, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.openrouterComplete"></a>
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.parseJson](features.md#features.llm.parseJson), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage)
    - fn [parseJson](../../src/llm.ts#L273) (text: string) → unknown <!-- internal -->
      <a id="features.llm.parseJson"></a>
  - module [lsp-features](../../src/lsp-features.ts#L1)
    <a id="features.lsp-features"></a><br>Language features over one analysis: pure functions from an `Analysis`, a document, and a position to LSP results. Positions are LSP's: 0-based line, UTF-16 character.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - emit [map.emit](map.md#map.emit)
    - brief [base.brief](base.md#base.brief)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - parser [lang.parser](lang.md#lang.parser)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - verdict [check.verdict](check.md#check.verdict)
    - type [LspPosition](../../src/lsp-features.ts#L24)
      <a id="features.lsp-features.LspPosition"></a>
    - type [LspRange](../../src/lsp-features.ts#L29)
      <a id="features.lsp-features.LspRange"></a>
    - type [Location](../../src/lsp-features.ts#L34)
      <a id="features.lsp-features.Location"></a>
    - type [Workspace](../../src/lsp-features.ts#L40)
      <a id="features.lsp-features.Workspace"></a><br>What features read: the analysis, the root, and the text of any document.
    - fn [workspace](../../src/lsp-features.ts#L47) (root: string, analysis: Analysis, buffers: ReadonlyMap<string, string>) → Workspace
      <a id="features.lsp-features.workspace"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.lsp-features.readOrNull](features.md#features.lsp-features.readOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [lineStarts](../../src/lsp-features.ts#L86) (text: string) → number[] <!-- internal -->
      <a id="features.lsp-features.lineStarts"></a>
    - fn [lspPoint](../../src/lsp-features.ts#L96) (text: string | null, line: number, col: number) → LspPosition <!-- internal -->
      <a id="features.lsp-features.lspPoint"></a><br>A 1-based line and column in code points — the unit of IR spans and of snapshot positions in code alike — as an LSP position (UTF-16).
    - fn [fromPos](../../src/lsp-features.ts#L102) (text: string | null, pos: Pos) → LspPosition <!-- internal -->
      <a id="features.lsp-features.fromPos"></a>
      - calls [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - fn [fromSpan](../../src/lsp-features.ts#L106) (text: string | null, span: Span) → LspRange <!-- internal -->
      <a id="features.lsp-features.fromSpan"></a>
      - calls [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos)
    - fn [lineRange](../../src/lsp-features.ts#L111) (text: string | null, line: number, col: number) → LspRange <!-- internal -->
      <a id="features.lsp-features.lineRange"></a><br>A 1-based line and a column in code points, to the end of that line.
    - fn [toOffset](../../src/lsp-features.ts#L117) (text: string, position: LspPosition) → number <!-- internal -->
      <a id="features.lsp-features.toOffset"></a>
      - calls [features.lsp-features.lineStarts](features.md#features.lsp-features.lineStarts)
    - fn [uriOf](../../src/lsp-features.ts#L121) (root: string, path: string) → string <!-- internal -->
      <a id="features.lsp-features.uriOf"></a>
    - type [Target](../../src/lsp-features.ts#L127) <!-- internal -->
      <a id="features.lsp-features.Target"></a>
    - fn [nodesOf](../../src/lsp-features.ts#L129) (doc: Document) → { node: Node; section: Section; parent: Node | null }[] <!-- internal -->
      <a id="features.lsp-features.nodesOf"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [targetAt](../../src/lsp-features.ts#L142) (doc: Document, offset: number) → Target | null
      <a id="features.lsp-features.targetAt"></a><br>The id, reference, or code link at an offset of a document. Spans are half-open: the offset after an id is not in it.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [base.span.spanContains](base.md#base.span.spanContains)
    - fn [docOf](../../src/lsp-features.ts#L157) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.docOf"></a>
      - calls [features.lsp-features.readingDoc](features.md#features.lsp-features.readingDoc)
    - fn [readOrNull](../../src/lsp-features.ts#L161) (abs: string) → string | null <!-- internal -->
      <a id="features.lsp-features.readOrNull"></a>
    - fn [readingDoc](../../src/lsp-features.ts#L177) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.readingDoc"></a><br>A file of the explained map. The analysis does not check it (it is no spec), but its IDs and code links lead where the map's do: hover, definition and Enter in the TUI work there too.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [at](../../src/lsp-features.ts#L188) (ws: Workspace, path: string, position: LspPosition) → Target | null <!-- internal -->
      <a id="features.lsp-features.at"></a>
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [features.lsp-features.toOffset](features.md#features.lsp-features.toOffset)
    - type [LspDiagnostic](../../src/lsp-features.ts#L197)
      <a id="features.lsp-features.LspDiagnostic"></a>
    - fn [diagnosticsFor](../../src/lsp-features.ts#L207) (ws: Workspace, path: string) → LspDiagnostic[]
      <a id="features.lsp-features.diagnosticsFor"></a><br>Diagnostics and verdicts of one document, as `check --format json` reports them.
      - calls [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange)
    - type [Described](../../src/lsp-features.ts#L232) <!-- internal -->
      <a id="features.lsp-features.Described"></a>
    - fn [describe](../../src/lsp-features.ts#L242) (ws: Workspace, id: string) → Described | null <!-- internal -->
      <a id="features.lsp-features.describe"></a>
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [plannedDecl](../../src/lsp-features.ts#L256) (docs: readonly Document[], id: string) → { kind: string; signature: string | null; file: string; line: number; col: number } | null
      <a id="features.lsp-features.plannedDecl"></a>
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [flowsUsing](../../src/lsp-features.ts#L265) (spec: SpecIR, id: string) → string[]
      <a id="features.lsp-features.flowsUsing"></a>
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [hover](../../src/lsp-features.ts#L275) (ws: Workspace, path: string, position: LspPosition) → { contents: { kind: "markdown"; value: string }; range: LspRange } | null
      <a id="features.lsp-features.hover"></a>
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.flowsUsing](features.md#features.lsp-features.flowsUsing), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - fn [definition](../../src/lsp-features.ts#L296) (ws: Workspace, path: string, position: LspPosition) → Location | null
      <a id="features.lsp-features.definition"></a>
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf)
    - fn [signatureHelp](../../src/lsp-features.ts#L310) (ws: Workspace, path: string, position: LspPosition) → { signatures: { label: string; documentation?: string }[]; activeSignature: 0; activeParameter: 0 } | null
      <a id="features.lsp-features.signatureHelp"></a>
      - calls [features.lsp-features.describe](features.md#features.lsp-features.describe)
    - fn [references](../../src/lsp-features.ts#L324) (ws: Workspace, path: string, position: LspPosition, includeDeclaration = true) → Location[]
      <a id="features.lsp-features.references"></a><br>Declarations and uses of the id under the cursor; `includeDeclaration: false` (LSP's `context`) leaves out the declarations.
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [SymbolInformation](../../src/lsp-features.ts#L340)
      <a id="features.lsp-features.SymbolInformation"></a>
    - fn [workspaceSymbols](../../src/lsp-features.ts#L360) (ws: Workspace, briefs: ReadonlyMap<string, StoredExplanation>, query: string) → SymbolInformation[]
      <a id="features.lsp-features.workspaceSymbols"></a><br>Nodes of the snapshot and planned intentions matching `query` (`searchNodes`, fuzzy): by name and ID first, then by the text of their explanation. Each points at its code, a planned one at its declaration in the spec, a layer at its line in `keylang.json`; `containerName` is…
      - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [features.lsp-features.symbolLocation](features.md#features.lsp-features.symbolLocation), [base.brief.capText](base.md#base.brief.capText), [features.lsp-features.symbolKind](features.md#features.lsp-features.symbolKind)
    - fn [symbolKind](../../src/lsp-features.ts#L376) (kind: string) → number <!-- internal -->
      <a id="features.lsp-features.symbolKind"></a>
    - fn [symbolLocation](../../src/lsp-features.ts#L385) (ws: Workspace, hit: NodeHit) → Location | null <!-- internal -->
      <a id="features.lsp-features.symbolLocation"></a>
      - calls [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange), [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - type [DocumentSymbol](../../src/lsp-features.ts#L405)
      <a id="features.lsp-features.DocumentSymbol"></a>
    - fn [statusOf](../../src/lsp-features.ts#L418) (verdicts: readonly Verdict[], diagnostics: readonly Diagnostic[], path: string, line: number) → string | undefined <!-- internal -->
      <a id="features.lsp-features.statusOf"></a><br>Worst verdict on a line of this document: `fail` > `unverified` > `ok`.
    - fn [flowPhrases](../../src/lsp-features.ts#L428) (spec: SpecIR) → Map<Node, string> <!-- internal -->
      <a id="features.lsp-features.flowPhrases"></a><br>Written phrase of a trigger, step, when, or then, keyed by its text-IR node.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.lsp-features.itemPhrase](features.md#features.lsp-features.itemPhrase)
    - fn [itemPhrase](../../src/lsp-features.ts#L439) (item: Trigger | FlowItem) → string | null <!-- internal -->
      <a id="features.lsp-features.itemPhrase"></a>
    - fn [documentSymbols](../../src/lsp-features.ts#L446) (ws: Workspace, path: string) → DocumentSymbol[]
      <a id="features.lsp-features.documentSymbols"></a>
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.flowPhrases](features.md#features.lsp-features.flowPhrases), [lang.ir.walk](lang.md#lang.ir.walk), [features.lsp-features.statusOf](features.md#features.lsp-features.statusOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [CompletionItem](../../src/lsp-features.ts#L533)
      <a id="features.lsp-features.CompletionItem"></a>
    - fn [completions](../../src/lsp-features.ts#L560) (ws: Workspace, path: string, position: LspPosition) → CompletionItem[]
      <a id="features.lsp-features.completions"></a><br>Keywords by position at the start of an item; after `step`/`trigger` only functions and planned functions; after other reference keywords, ids that the enclosing module may depend on (`deny` removes the rest).
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.enclosing](features.md#features.lsp-features.enclosing), [features.lsp-features.sectionAt](features.md#features.lsp-features.sectionAt), [lang.parser.keywordsAt](lang.md#lang.parser.keywordsAt), [features.lsp-features.moduleAround](features.md#features.lsp-features.moduleAround), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.blocksDependency](check.md#check.rules.blocksDependency)
    - fn [sectionAt](../../src/lsp-features.ts#L608) (doc: Document, line: number) → Section | undefined <!-- internal -->
      <a id="features.lsp-features.sectionAt"></a>
    - fn [enclosing](../../src/lsp-features.ts#L618) (doc: Document, line: number, col: number) → Node | undefined <!-- internal -->
      <a id="features.lsp-features.enclosing"></a><br>The nearest item above `line` that starts left of `col`: the parent of a new item there.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [ancestors](../../src/lsp-features.ts#L627) (doc: Document, node: Node) → Node[] <!-- internal -->
      <a id="features.lsp-features.ancestors"></a>
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [moduleAround](../../src/lsp-features.ts#L640) (ws: Workspace, doc: Document, parent: Node | undefined) → string | null <!-- internal -->
      <a id="features.lsp-features.moduleAround"></a><br>The module a completion is written in: the nearest enclosing module or fn declaration.
      - calls [features.lsp-features.ancestors](features.md#features.lsp-features.ancestors)
    - type [CodeLens](../../src/lsp-features.ts#L655) <!-- internal -->
      <a id="features.lsp-features.CodeLens"></a>
    - fn [codeLenses](../../src/lsp-features.ts#L661) (ws: Workspace, path: string) → CodeLens[]
      <a id="features.lsp-features.codeLenses"></a><br>`flows: checkout, pay` above each function of a source file that a flow names. The command `keylang.flows` (registered by the editor client) gets the flow names.
      - calls [features.lsp-features.flowsUsing](features.md#features.lsp-features.flowsUsing), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
  - module [node-search](../../src/node-search.ts#L1)
    <a id="features.node-search"></a><br>Finding nodes by name, ID or what their explanation says (ADR 0004): the TUI's node search, MCP `search` and LSP workspace symbols share one ranking.
    - analyze [map.analyze](map.md#map.analyze)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - type [NodeHit](../../src/node-search.ts#L9)
      <a id="features.node-search.NodeHit"></a>
    - type [NodeQuery](../../src/node-search.ts#L22)
      <a id="features.node-search.NodeQuery"></a>
    - fn [searchNodes](../../src/node-search.ts#L40) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>, q: NodeQuery) → NodeHit[]
      <a id="features.node-search.searchNodes"></a><br>Nodes of the snapshot and `planned` intentions of the specs matching the query, case-insensitive: first those whose ID or name matches (for `fuzzy`, the exact name, then a name prefix, a name part, an ID part, then a subsequence of the name and of the ID; shorter IDs first…
      - calls [features.node-search.candidates](features.md#features.node-search.candidates), [features.node-search.idRank](features.md#features.node-search.idRank), [base.span.compareText](base.md#base.span.compareText)
    - fn [candidates](../../src/node-search.ts#L55) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>) → NodeHit[] <!-- internal -->
      <a id="features.node-search.candidates"></a>
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [idRank](../../src/node-search.ts#L77) (query: string, id: string, fuzzy: boolean) → number | null <!-- internal -->
      <a id="features.node-search.idRank"></a><br>How well the ID or its last segment matches, lower is better; null when it does not.
      - calls [features.node-search.subsequence](features.md#features.node-search.subsequence)
    - fn [subsequence](../../src/node-search.ts#L91) (query: string, text: string) → boolean <!-- internal -->
      <a id="features.node-search.subsequence"></a><br>Every code point of `query` appears in `text` in order.
  - module [proposals](../../src/proposals.ts#L1)
    <a id="features.proposals"></a><br>Proposals (CONTEXT.md): the full proposed text of one hand-written spec or source file, kept in `.keylang/proposals/<path>` until a person merges it hunk by hunk. `draft`, `code-to-spec` and MCP `apply_diff` propose specs, `spec-to-code` proposes code and its tests; only the…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - languages [base.languages](base.md#base.languages)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - fn [proposalProblem](../../src/proposals.ts#L24) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="features.proposals.proposalProblem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A proposal replaces one hand-written spec: a Markdown file under the spec directory, not a generated map file, and not reached through a link that leads out. `specDir` is relative to the root, POSIX; `generated` says…
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [codeProposalProblem](../../src/proposals.ts#L48) (root: string, path: string) → string | null
      <a id="features.proposals.codeProposalProblem"></a><br>Why a proposal for the source file `path` may not be merged, or null: a file of a language keylang reads, inside the repository (links included), outside the directories sources are not read from, and not one keylang generates (`keylang wire`).
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within)
    - type [ProposalBasis](../../src/proposals.ts#L64)
      <a id="features.proposals.ProposalBasis"></a><br>What a proposal was built from: the target on disk and the proposal already waiting for it (null: no file). A write that carries it lands only while both are still so.
    - fn [proposalWriteProblem](../../src/proposals.ts#L74) (root: string, path: string, basis: ProposalBasis) → string | null
      <a id="features.proposals.proposalWriteProblem"></a><br>Why the proposal of `path` built from `basis` may not be written now, or null: the target or the waiting proposal changed, appeared or went away since, or the store breaks the write policy. Each reason names its file.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - fn [writeProposal](../../src/proposals.ts#L90) (root: string, path: string, text: string, basis?: ProposalBasis) → string
      <a id="features.proposals.writeProposal"></a><br>Writes the proposal for `path` (relative, POSIX) atomically and returns its file; `.keylang/proposals/` is keylang's own store, so a link there that leads elsewhere is refused like any other. With `basis` nothing is written unless the target and the waiting proposal are still…
      - calls [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [lineDiff](../../src/proposals.ts#L99) (before: string, after: string) → string
      <a id="features.proposals.lineDiff"></a><br>`-`/`+` lines between a common prefix and suffix: enough to see what a proposal changes.
  - module [spec-to-code](../../src/spec-to-code.ts#L1)
    <a id="features.spec-to-code"></a><br>`keylang spec-to-code <id>` (design §5.5), algo: a stub for a `planned` fn in the file its ID names, with the declared signature, analyzed as a new snapshot before anything is written; and for each `test` its flows name in a file that does not exist yet, a TS/JS e2e test that…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - glob [base.glob](base.md#base.glob)
    - graph [map.graph](map.md#map.graph)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - proposals [features.proposals](features.md#features.proposals)
    - assess [check.assess](check.md#check.assess)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - llm [features.llm](features.md#features.llm)
    - verdict [check.verdict](check.md#check.verdict)
    - type [FileCandidate](../../src/spec-to-code.ts#L25)
      <a id="features.spec-to-code.FileCandidate"></a>
    - type [CodeCandidate](../../src/spec-to-code.ts#L33) extends FileCandidate
      <a id="features.spec-to-code.CodeCandidate"></a>
    - fn [specToCode](../../src/spec-to-code.ts#L53) (analysis: Analysis, id: string, into?: string, model?: LlmClient, options: LlmCallOptions = {}) → Promise<CodeCandidate>
      <a id="features.spec-to-code.specToCode"></a><br>`model`: the body comes from the model instead of the stub — the whole function with the declared signature, in one fenced block — and is analyzed the same way before anything is written. `options.signal` cancels the model's requests (`LlmCancelled`); the file is read before…
      - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [features.spec-to-code.modelBody](features.md#features.spec-to-code.modelBody), [features.spec-to-code.stubFor](features.md#features.spec-to-code.stubFor), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [map.analyze.analyze](map.md#map.analyze.analyze), [features.spec-to-code.introduced](features.md#features.spec-to-code.introduced), [features.spec-to-code.testCandidates](features.md#features.spec-to-code.testCandidates)
    - fn [plannedCodeTarget](../../src/spec-to-code.ts#L80) (analysis: Analysis, id: string, into?: string) → { file: string; name: string; signature: string | null } | { error: string; field: "id" | "into" }
      <a id="features.spec-to-code.plannedCodeTarget"></a><br>Where the code of the planned fn `id` goes, or why spec-to-code builds none — the checks it makes before any file is read: not planned (with a suggestion), not a fn, already implemented (with the place), a `deny` its flow would break (`field: "id"`); a file not of its module, a…
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl), [features.spec-to-code.callersInFlows](features.md#features.spec-to-code.callersInFlows), [check.rules.blocksDependency](check.md#check.rules.blocksDependency), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [features.spec-to-code.newModuleFile](features.md#features.spec-to-code.newModuleFile), [map.graph.placeFile](map.md#map.graph.placeFile), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem)
    - fn [specToCodeText](../../src/spec-to-code.ts#L119) (candidate: CodeCandidate) → string
      <a id="features.spec-to-code.specToCodeText"></a><br>What `spec-to-code <id> --print` writes on stdout: each file with its `-`/`+` lines, and between the code and the tests every finding the candidate adds (one the diagnostics already name, once, as in `check`).
      - calls [features.spec-to-code.fileDiffText](features.md#features.spec-to-code.fileDiffText), [check.assess.sameFinding](check.md#check.assess.sameFinding), [check.verdict.formatVerdict](check.md#check.verdict.formatVerdict), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [fileDiffText](../../src/spec-to-code.ts#L128) (file: FileCandidate) → string
      <a id="features.spec-to-code.fileDiffText"></a><br>`src/a.ts (new file)` and its `-`/`+` lines against the file it was built from.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - fn [introduced](../../src/spec-to-code.ts#L133) (base: Analysis, next: Analysis) → { verdicts: Verdict[]; diagnostics: Diagnostic[] } <!-- internal -->
      <a id="features.spec-to-code.introduced"></a><br>Findings `next` has that `base` does not: what a candidate would change, wherever it lands (a K102 in the new file too).
    - fn [flowTests](../../src/spec-to-code.ts#L144) (analysis: Analysis, id: string) → { flow: string; file: string; name: string }[] <!-- internal -->
      <a id="features.spec-to-code.flowTests"></a><br>The `test` entries of the flows that name `id`: flow name, test file and test name.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowsMentioning](../../src/spec-to-code.ts#L157) (analysis: Analysis, id: string) → Flow[] <!-- internal -->
      <a id="features.spec-to-code.flowsMentioning"></a><br>Hand-written flows whose trigger, step, claim, `then`, or `planned` names `id`.
      - calls [features.spec-to-code.flowMentions](features.md#features.spec-to-code.flowMentions)
    - fn [flowMentions](../../src/spec-to-code.ts#L162) (spec: SpecIR, flow: Flow, id: string) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowMentions"></a>
      - calls [features.spec-to-code.flowOwns](features.md#features.spec-to-code.flowOwns), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowOwns](../../src/spec-to-code.ts#L175) (spec: SpecIR, flow: Flow, line: number) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowOwns"></a><br>`line` sits in this flow: after its heading and before the next flow of the same file.
    - fn [testCandidates](../../src/spec-to-code.ts#L185) (analysis: Analysis, id: string, codeFile: string, code: string, model: LlmClient | undefined, options: LlmCallOptions) → Promise<{ tests: FileCandidate[]; notes: string[] }> <!-- internal -->
      <a id="features.spec-to-code.testCandidates"></a><br>One new file per test path the flows name and the disk lacks. A test in an existing file, or in a language without a `node:test` shape, is a note: editing someone's test file is theirs to do.
      - calls [features.spec-to-code.flowTests](features.md#features.spec-to-code.flowTests), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [base.config.toPosix](base.md#base.config.toPosix), [features.spec-to-code.modelTest](features.md#features.spec-to-code.modelTest), [features.spec-to-code.testStub](features.md#features.spec-to-code.testStub)
    - fn [testStub](../../src/spec-to-code.ts#L220) (from: string, name: string, entries: readonly { flow: string; name: string }[]) → string <!-- internal -->
      <a id="features.spec-to-code.testStub"></a>
    - fn [modelTest](../../src/spec-to-code.ts#L228) (model: LlmClient, file: string, from: string, name: string, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelTest"></a><br>The e2e test file from the model; each declared test name must be in it verbatim.
    - fn [callersInFlows](../../src/spec-to-code.ts#L245) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.spec-to-code.callersInFlows"></a><br>IDs directly above `id` in flows: the trigger or step each of its steps is nested under.
    - fn [newModuleFile](../../src/spec-to-code.ts#L258) (config: Config, moduleId: string) → string <!-- internal -->
      <a id="features.spec-to-code.newModuleFile"></a><br>`<layer glob prefix>/<segments>.<ext>`; one prefix per layer, or the path is ambiguous.
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix)
    - fn [stubFor](../../src/spec-to-code.ts#L273) (file: string, name: string, id: string, signature: string | null, newFile: boolean) → string <!-- internal -->
      <a id="features.spec-to-code.stubFor"></a><br>`(order: Order) → Promise<Refund>` → a function of that signature that fails until written; the declared parameters and result are kept as written, so the stub's own signature matches the plan (no K201).
    - fn [modelBody](../../src/spec-to-code.ts#L289) (analysis: Analysis, model: LlmClient, file: string, name: string, id: string, signature: string | null, before: string | null, options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelBody"></a><br>The function from the model, with its declared name; the rest of its answer is dropped.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning)
  - module [stale](../../src/stale.ts#L1)
    <a id="features.stale"></a><br>Staleness of prose in specs (design §4.4): every node description and every flow `when` / `then` / `invariant` gets the fingerprint of the code it talks about — the closure fingerprints of the snapshot, so a change in a callee, a cycle included, reaches it. The accepted…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [StaleBaseline](../../src/stale.ts#L21) = ReadonlyMap<string, ReadonlyMap<string, string>>
      <a id="features.stale.StaleBaseline"></a><br>Accepted fingerprints: spec file (relative to the root, POSIX) → statement key → fingerprint.
    - type [Statement](../../src/stale.ts#L24)
      <a id="features.stale.Statement"></a><br>One piece of prose bound to code.
    - type [StaleFinding](../../src/stale.ts#L41) extends Statement
      <a id="features.stale.StaleFinding"></a>
    - type [StaleReport](../../src/stale.ts#L53)
      <a id="features.stale.StaleReport"></a>
    - fn [staleBaselinePath](../../src/stale.ts#L61) (config: Pick<Config, "dir">) → string
      <a id="features.stale.staleBaselinePath"></a><br>Where the accepted fingerprints live, relative to the root, POSIX.
    - fn [specStatements](../../src/stale.ts#L70) (docs: readonly Document[]) → Statement[]
      <a id="features.stale.specStatements"></a><br>The statements of hand-written specs: descriptions of nodes in map and flow sections, and every flow `when`, `then` and `invariant`. Generated map files are skipped: their text is the code's own.
      - calls [features.stale.sectionRefs](features.md#features.stale.sectionRefs), [features.stale.subtreeRefs](features.md#features.stale.subtreeRefs), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [subtreeRefs](../../src/stale.ts#L105) (node: Node) → string[] <!-- internal -->
      <a id="features.stale.subtreeRefs"></a>
    - fn [sectionRefs](../../src/stale.ts#L109) (section: Section) → string[] <!-- internal -->
      <a id="features.stale.sectionRefs"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [statementPrint](../../src/stale.ts#L118) (snapshot: AnalysisSnapshot, subjects: readonly string[]) → { fingerprint: string; incomplete: string[] }
      <a id="features.stale.statementPrint"></a><br>The fingerprint of a statement's subjects in the snapshot, and what makes it incomplete. A subject the snapshot lacks hashes as `?`, so it turning up later is a change too.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.stale.closureComplete](features.md#features.stale.closureComplete)
    - fn [closureComplete](../../src/stale.ts#L131) (snapshot: AnalysisSnapshot, id: string) → boolean <!-- internal -->
      <a id="features.stale.closureComplete"></a><br>A fn or type: its closure; a module or layer: every fn and type under it.
    - fn [staleReport](../../src/stale.ts#L148) (docs: readonly Document[], snapshot: AnalysisSnapshot, baseline: StaleBaseline, whole = false) → StaleReport
      <a id="features.stale.staleReport"></a><br>The statements of `docs` against the snapshot and the accepted baseline. Entries of the checked (hand-written) files can be obsolete; with `whole` (every spec of the repository was read) so can those of a file that is gone.
      - calls [features.stale.specStatements](features.md#features.stale.specStatements), [features.stale.statementPrint](features.md#features.stale.statementPrint), [base.span.compareText](base.md#base.span.compareText)
    - fn [acceptBaseline](../../src/stale.ts#L170) (baseline: StaleBaseline, report: StaleReport, checked: readonly string[]) → StaleBaseline
      <a id="features.stale.acceptBaseline"></a><br>The baseline after accepting `report`: the checked files' entries are replaced by the current fingerprints (a file with no statement left is dropped); other files keep theirs.
    - fn [baselineJson](../../src/stale.ts#L183) (baseline: StaleBaseline) → string
      <a id="features.stale.baselineJson"></a><br>The baseline as committed: files, then keys in code-unit order; two-space JSON with a final newline.
    - fn [parseBaseline](../../src/stale.ts#L198) (text: string, path: string) → StaleBaseline
      <a id="features.stale.parseBaseline"></a><br>Reads a committed baseline; throws `path: problem` naming the field when it is not one.
      - calls [features.stale.isRecord](features.md#features.stale.isRecord)
    - fn [isRecord](../../src/stale.ts#L219) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.stale.isRecord"></a>
    - fn [staleLine](../../src/stale.ts#L224) (f: StaleFinding) → string
      <a id="features.stale.staleLine"></a><br>One report line: `file:line:col: stale invariant `…`: …`.
    - fn [staleSummary](../../src/stale.ts#L237) (report: StaleReport) → string
      <a id="features.stale.staleSummary"></a><br>The stderr summary: counts by state, incomplete and obsolete.
    - type [StaleCheck](../../src/stale.ts#L245)
      <a id="features.stale.StaleCheck"></a>
    - fn [runStaleCheck](../../src/stale.ts#L259) (request: { root: string; base: string; paths: readonly string[]; accept: boolean }) → Promise<StaleCheck>
      <a id="features.stale.runStaleCheck"></a><br>`check --stale [paths…] [--accept]`: analyses the repository (nothing of it is written), compares its specs with the committed baseline, and with `accept` writes the current fingerprints of the checked files. Throws on a usage or I/O problem, naming the file.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.within](map.md#map.analyze.within), [features.stale.staleBaselinePath](features.md#features.stale.staleBaselinePath), [features.stale.parseBaseline](features.md#features.stale.parseBaseline), [map.analyze.analyze](map.md#map.analyze.analyze), [features.stale.staleReport](features.md#features.stale.staleReport), [features.stale.acceptBaseline](features.md#features.stale.acceptBaseline), [features.stale.baselineJson](features.md#features.stale.baselineJson), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
  - module [stats](../../src/stats.ts#L1)
    <a id="features.stats"></a><br>`.keylang/stats.json`: how often people accept what a model proposed (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines, and per kind of suggestion; local, never a verdict.
    - node [external.node](external.md#external.node)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [Tally](../../src/stats.ts#L9)
      <a id="features.stats.Tally"></a>
    - type [Stats](../../src/stats.ts#L15)
      <a id="features.stats.Stats"></a>
    - fn [readStats](../../src/stats.ts#L25) (root: string) → Stats
      <a id="features.stats.readStats"></a>
    - fn [updateStats](../../src/stats.ts#L38) (root: string, change: (stats: Stats) => void) → void
      <a id="features.stats.updateStats"></a>
      - calls [features.stats.readStats](features.md#features.stats.readStats), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [statusesIn](../../src/stats.ts#L45) (lines: readonly string[]) → Record<string, number>
      <a id="features.stats.statusesIn"></a><br>`status=` of every `keylang:llm` / `keylang:algo` provenance comment in the lines.
    - fn [addDrafts](../../src/stats.ts#L54) (stats: Stats, counts: Record<string, number>, field: keyof Tally) → void
      <a id="features.stats.addDrafts"></a>
  - module [voice-local](../../src/voice-local.ts#L1)
    <a id="features.voice-local"></a><br>The optional native parts of voice (design §7.4): `decibri` for the microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition. Both ship prebuilt binaries and are loaded only when present; without them voice uses the browser's microphone (`keylang web`) and…
    - node [external.node](external.md#external.node)
    - voice [features.voice](features.md#features.voice)
    - fugood-whisper_node [external.fugood-whisper_node](external.md#external.fugood-whisper_node)
    - decibri [external.decibri](external.md#external.decibri)
    - type [Microphone](../../src/voice-local.ts#L17) = { chunks: AsyncIterable<Int16Array>; stop: () => void } <!-- internal -->
      <a id="features.voice-local.Microphone"></a>
    - type [ModuleStatus](../../src/voice-local.ts#L20)
      <a id="features.voice-local.ModuleStatus"></a><br>Whether an optional package can be used here: `missing` when it is not installed, `unavailable` with the reason when it is there but does not load.
    - type [WhisperContext](../../src/voice-local.ts#L22) <!-- internal -->
      <a id="features.voice-local.WhisperContext"></a>
    - type [Whisper](../../src/voice-local.ts#L27) <!-- internal -->
      <a id="features.voice-local.Whisper"></a>
    - type [MicrophoneClass](../../src/voice-local.ts#L32) <!-- internal -->
      <a id="features.voice-local.MicrophoneClass"></a>
    - fn [loadWhisper](../../src/voice-local.ts#L39) () → Promise<{ module: Whisper } | Exclude<ModuleStatus, { status: "ok" }>> <!-- internal -->
      <a id="features.voice-local.loadWhisper"></a><br>`@fugood/whisper.node` with its platform binary: the package itself loads the binary only on first use, so the check loads it, and a package without a working binary is not reported as installed.
      - calls [features.voice-local.optional](features.md#features.voice-local.optional), [features.voice-local.quietly](features.md#features.voice-local.quietly)
    - fn [localStatus](../../src/voice-local.ts#L56) () → Promise<ModuleStatus>
      <a id="features.voice-local.localStatus"></a><br>What `@fugood/whisper.node` can do on this machine.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper)
    - fn [localAvailable](../../src/voice-local.ts#L62) () → Promise<boolean>
      <a id="features.voice-local.localAvailable"></a><br>Whether `@fugood/whisper.node` and its binary load on this machine.
      - calls [features.voice-local.localStatus](features.md#features.voice-local.localStatus)
    - fn [loadDecibri](../../src/voice-local.ts#L66) () → { module: { Microphone: MicrophoneClass } } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.loadDecibri"></a>
      - calls [features.voice-local.optional](features.md#features.voice-local.optional)
    - fn [microphoneStatus](../../src/voice-local.ts#L75) () → Promise<ModuleStatus>
      <a id="features.voice-local.microphoneStatus"></a><br>What `decibri` can do on this machine.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [microphoneAvailable](../../src/voice-local.ts#L81) () → Promise<boolean>
      <a id="features.voice-local.microphoneAvailable"></a><br>Whether `decibri` loads on this machine.
      - calls [features.voice-local.microphoneStatus](features.md#features.voice-local.microphoneStatus)
    - fn [defaultMicrophone](../../src/voice-local.ts#L86) () → Promise<Microphone | null>
      <a id="features.voice-local.defaultMicrophone"></a><br>The system microphone through `decibri` (16 kHz, mono, s16le); null when it is not installed.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [transcribeLocal](../../src/voice-local.ts#L108) (modelFile: string, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice-local.transcribeLocal"></a><br>whisper.cpp on this machine, window by window, with the glossary as the initial prompt.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper), [features.voice-local.quietly](features.md#features.voice-local.quietly), [features.voice.windows](features.md#features.voice.windows), [features.voice.joinWindows](features.md#features.voice.joinWindows)
    - fn [optional](../../src/voice-local.ts#L133) (name: string, load: () => unknown) → { module: unknown } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.optional"></a><br>A package that may be absent or fail to load (a native binding without a prebuilt binary for this platform throws on `require`). Literal specifiers, so the map sees which packages voice may load.
    - fn [quietly](../../src/voice-local.ts#L153) (load: () => Promise<T>) → Promise<({ value: T } | { error: string }) & { warnings: string[] }> <!-- internal -->
      <a id="features.voice-local.quietly"></a><br>Runs `load` with `console.warn` captured: whisper.node warns while it looks for a platform binary, which would draw over the TUI. The warnings become part of a failure's reason.
  - module [voice](../../src/voice.ts#L1)
    <a id="features.voice"></a><br>Voice input (design §7.3 «Голосовий ввід»): PCM (16 kHz, mono, s16le) → text, by a local whisper.cpp model or OpenRouter's audio input. Speech goes into free text by default; a tiny command grammar («крок …», «коли … тоді …», «емітить …») turns into list items with IDs matched…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - keys [features.keys](features.md#features.keys)
    - parser [lang.parser](lang.md#lang.parser)
    - type [Env](../../src/voice.ts#L23) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.voice.Env"></a>
    - type [VoiceConfig](../../src/voice.ts#L25)
      <a id="features.voice.VoiceConfig"></a>
    - type [VoiceEngine](../../src/voice.ts#L30)
      <a id="features.voice.VoiceEngine"></a>
    - fn [modelsDir](../../src/voice.ts#L35) (home: string = homedir()) → string
      <a id="features.voice.modelsDir"></a>
    - fn [localModel](../../src/voice.ts#L40) (home: string = homedir()) → string | null
      <a id="features.voice.localModel"></a><br>The first downloaded whisper model, or null.
      - calls [features.voice.modelsDir](features.md#features.voice.modelsDir)
    - fn [voiceEngine](../../src/voice.ts#L50) (config: VoiceConfig, localAvailable: boolean, env: Env = process.env, home: string = homedir()) → VoiceEngine
      <a id="features.voice.voiceEngine"></a><br>`local`: a downloaded model and the optional `@fugood/whisper.node`; `openrouter`: a key; `auto`: local when its model is there, else OpenRouter with a key. Otherwise what to set up, in one sentence.
      - calls [features.keys.readKey](features.md#features.keys.readKey), [features.voice.localModel](features.md#features.voice.localModel), [features.voice.modelsDir](features.md#features.voice.modelsDir)
    - fn [wav](../../src/voice.ts#L66) (pcm: Int16Array, rate: number = SAMPLE_RATE) → Buffer
      <a id="features.voice.wav"></a><br>A RIFF/WAVE file around 16-bit mono PCM.
    - fn [windows](../../src/voice.ts#L86) (pcm: Int16Array, rate: number = SAMPLE_RATE) → Int16Array[]
      <a id="features.voice.windows"></a><br>Windows of `WINDOW_SECONDS` that overlap by `OVERLAP_SECONDS`; a short recording is one window, an empty one none.
    - fn [seamWord](../../src/voice.ts#L103) (word: string) → string <!-- internal -->
      <a id="features.voice.seamWord"></a><br>A word as the overlap repeats it: case and punctuation differ between windows (`card,` / `Card`).
    - fn [joinWindows](../../src/voice.ts#L108) (texts: readonly string[]) → string
      <a id="features.voice.joinWindows"></a><br>Joins window texts, dropping the words the overlap repeated at a seam: the longest run that ends one window and starts the next.
    - fn [glossary](../../src/voice.ts#L135) (analysis: Analysis, path: string, text: string, line: number) → string[]
      <a id="features.voice.glossary"></a><br>At most 30 IDs near the cursor: those of the current flow, the neighbours of the IDs on the cursor line, and those IDs last — the end of a prompt weighs most.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [spoken](../../src/voice.ts#L159) (id: string) → string <!-- internal -->
      <a id="features.voice.spoken"></a><br>The words people say for an ID: its last segments split at case and separators.
    - fn [matchId](../../src/voice.ts#L175) (words: string, ids: readonly string[]) → string | null
      <a id="features.voice.matchId"></a><br>The ID whose spoken form holds every word (the fuzzy match of completion). Several such IDs are ambiguous unless exactly one is said in full («order total» for `domain.order.total` beside `domain.order.totalTax`); then null, and the words stay as said.
      - calls [features.voice.spoken](features.md#features.voice.spoken)
    - fn [speechToSpec](../../src/voice.ts#L192) (text: string, ids: readonly string[], indent = "") → string
      <a id="features.voice.speechToSpec"></a><br>«крок X» → `- step <id>`, «коли A тоді B» → `- when A` + ` - then B`, «емітить X» → `- emits X` (also `step`, `when … then …`, `emits`); anything else stays free text. A step whose ID does not match stays as said.
      - calls [features.voice.matchId](features.md#features.voice.matchId)
    - fn [transcriptOf](../../src/voice.ts#L204) (reply: string) → string <!-- internal -->
      <a id="features.voice.transcriptOf"></a><br>The text of an OpenRouter chat completion; anything else (not JSON, an error with status 200) is an error that says so.
    - fn [transcribeOpenRouter](../../src/voice.ts#L219) (engine: Extract<VoiceEngine, { kind: "openrouter" }>, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice.transcribeOpenRouter"></a><br>One OpenRouter chat completion per window, with the glossary as the prompt; an empty recording sends nothing.
      - calls [features.voice.windows](features.md#features.voice.windows), [features.voice.wav](features.md#features.voice.wav), [features.voice.transcriptOf](features.md#features.voice.transcriptOf), [features.voice.joinWindows](features.md#features.voice.joinWindows)
