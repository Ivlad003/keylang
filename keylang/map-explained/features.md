<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [agent-cli](#features.agent-cli) · [agent-context](#features.agent-context) · [baseline](#features.baseline) · [call-sites](#features.call-sites) · [changed](#features.changed) · [check-format](#features.check-format) · [check-results](#features.check-results) · [clone](#features.clone) · [coverage-report](#features.coverage-report) · [diagram-clip](#features.diagram-clip) · [diagram-proposal](#features.diagram-proposal) · [discover-names](#features.discover-names) · [discover](#features.discover) · [draft-llm](#features.draft-llm) · [draft](#features.draft) · [explain-edge](#features.explain-edge) · [explain-inventory](#features.explain-inventory) · [explain-llm](#features.explain-llm) · [explain-node](#features.explain-node) · [explain-offline](#features.explain-offline) · [explain](#features.explain) · [explorer](#features.explorer) · [feature-status](#features.feature-status) · [flow-bundle](#features.flow-bundle) · [ghost](#features.ghost) · [git-changes](#features.git-changes) · [git-hook](#features.git-hook) · [graph-diff-format](#features.graph-diff-format) · [graph-diff-run](#features.graph-diff-run) · [graph-diff](#features.graph-diff) · [greenfield](#features.greenfield) · [harness](#features.harness) · [integrations](#features.integrations) · [keys](#features.keys) · [llm](#features.llm) · [lsp-features](#features.lsp-features) · [migration-stack](#features.migration-stack) · [node-search](#features.node-search) · [proposals](#features.proposals) · [revision-tree](#features.revision-tree) · [spec-to-code](#features.spec-to-code) · [stale](#features.stale) · [stats](#features.stats) · [system-proposal](#features.system-proposal) · [tour](#features.tour) · [ts-projection](#features.ts-projection) · [voice-local](#features.voice-local) · [voice](#features.voice) · [weakening](#features.weakening)

# map

- features
  <a id="features"></a><br>The layer holds keylang's user-facing capabilities: checking and reports ([`features.check-results`](features.md#features.check-results), [`features.changed`](features.md#features.changed)), model-backed drafting and explanations ([`features.llm`](features.md#features.llm), [`features.draft-llm`](features.md#features.draft-llm)), and editor, git and voice support ([`features.lsp-features`](features.md#features.lsp-features)… _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [agent-cli](../../src/agent-cli.ts#L1)
    <a id="features.agent-cli"></a><br>An agent CLI as a text model (ADR 0009): `cli:claude`, `cli:codex`, `cli:opencode`, `cli:cursor` or a command defined in `~/.config/keylang/agents.json`. One request is one run of the CLI in "answer only" form: no project hooks, MCP servers or instructions where the CLI can…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - json [base.json](base.md#base.json)
    - type [Env](../../src/agent-cli.ts#L28) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.agent-cli.Env"></a><br>A read-only map of environment variable names to their string values, where missing variables appear as `undefined`. It is the shape the agent CLI uses when reading process environment settings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Preset](../../src/agent-cli.ts#L30) = (typeof AGENT_CLI_PRESETS)[number] <!-- internal -->
      <a id="features.agent-cli.Preset"></a><br>Derives a string-literal union type from the elements of the `AGENT_CLI_PRESETS` array, so a value can only be one of the preset names listed there. Used to type-check preset selection in the agent CLI module. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isPreset](../../src/agent-cli.ts#L33) (name: string) → name is Preset <!-- internal -->
      <a id="features.agent-cli.isPreset"></a><br>Whether `name` is one of the built-in agent CLI presets.
    - type [CliDefinition](../../src/agent-cli.ts#L38) = { command: string[] } | { bin: string }
      <a id="features.agent-cli.CliDefinition"></a><br>A user's own CLI: `command[0]` is the binary; `{prompt_file}` and `{model}` are placeholders. A preset name takes only `bin`.
    - type [AgentSettings](../../src/agent-cli.ts#L41)
      <a id="features.agent-cli.AgentSettings"></a><br>`~/.config/keylang/agents.json`, validated.
    - type [AgentSource](../../src/agent-cli.ts#L47) = "KEYLANG_AGENT" | "agents.json" | "keylang.json"
      <a id="features.agent-cli.AgentSource"></a><br>Where the effective agent came from.
    - type [EffectiveAgent](../../src/agent-cli.ts#L50)
      <a id="features.agent-cli.EffectiveAgent"></a><br>The agent in effect, or null, and where it came from.
    - type [CliRequest](../../src/agent-cli.ts#L56)
      <a id="features.agent-cli.CliRequest"></a><br>One request to the model: the system text and the user prompt.
    - type [CliCallOptions](../../src/agent-cli.ts#L62)
      <a id="features.agent-cli.CliCallOptions"></a><br>`ms`: the call's bound; `fromVariable`: the bound is `KEYLANG_LLM_TIMEOUT_MS`, which the timeout message then names.
    - type [CliClient](../../src/agent-cli.ts#L71)
      <a id="features.agent-cli.CliClient"></a><br>A ready-to-call agent CLI: its name, model and binary, and the call itself.
    - module [CliCancelled](../../src/agent-cli.ts#L82)
      <a id="features.agent-cli.CliCancelled"></a><br>The caller cancelled the run; `llm.ts` turns it into `LlmCancelled`.
      - fn [constructor](../../src/agent-cli.ts#L83) (agent: string)
        <a id="features.agent-cli.CliCancelled.constructor"></a><br>Builds an error whose message prefixes "cancelled" with the given agent label and sets the instance name to "CliCancelled" so callers can distinguish it from other failures. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [agentsFile](../../src/agent-cli.ts#L108) (home: string) → string
      <a id="features.agent-cli.agentsFile"></a><br>The path of the user's agents.json under `home`.
    - fn [readAgentSettings](../../src/agent-cli.ts#L113) (home: string) → AgentSettings
      <a id="features.agent-cli.readAgentSettings"></a><br>agents.json, validated; an absent file is empty settings. Errors name the file and the field.
      - calls [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [base.json.parseJson](base.md#base.json.parseJson), [features.agent-cli.parseAgentSettings](features.md#features.agent-cli.parseAgentSettings)
    - fn [parseAgentSettings](../../src/agent-cli.ts#L129) (file: string, value: JsonValue) → AgentSettings
      <a id="features.agent-cli.parseAgentSettings"></a><br>The settings of an agents.json already parsed as JSON.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.agent-cli.shown](features.md#features.agent-cli.shown), [base.json.isJsonString](base.md#base.json.isJsonString), [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.cliDefinition](features.md#features.agent-cli.cliDefinition)
    - fn [shown](../../src/agent-cli.ts#L149) (value: JsonValue | undefined) → string <!-- internal -->
      <a id="features.agent-cli.shown"></a><br>A JSON value as an error message shows it.
    - fn [cliDefinition](../../src/agent-cli.ts#L154) (file: string, name: string, def: JsonValue) → CliDefinition <!-- internal -->
      <a id="features.agent-cli.cliDefinition"></a><br>One `clis.<name>` entry, validated: a `bin` override for a preset, or a full `command` for a user CLI.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.agent-cli.shown](features.md#features.agent-cli.shown), [features.agent-cli.isPreset](features.md#features.agent-cli.isPreset), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [resolveAgent](../../src/agent-cli.ts#L201) (configAgent: string | null, env: Env, home: string) → EffectiveAgent
      <a id="features.agent-cli.resolveAgent"></a><br>The agent in effect and where it came from: `KEYLANG_AGENT` (an empty variable is unset), else agents.json "use", else keylang.json `agent`. An invalid variable or agents.json throws, naming it.
      - calls [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings)
    - fn [selectedAgent](../../src/agent-cli.ts#L221) (configAgent: string | null, env: Env = process.env, home: string = homedir()) → string | null
      <a id="features.agent-cli.selectedAgent"></a><br>The effective agent for deciding whether to ask at all (ghost, forms): a broken setting counts as an agent, so the request that follows reports it.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent)
    - fn [parseCliAgent](../../src/agent-cli.ts#L230) (agent: string) → { name: string; model: string }
      <a id="features.agent-cli.parseCliAgent"></a><br>`cli:opencode:anthropic/claude-sonnet-5` → name and model (the model keeps its colons).
    - type [Runner](../../src/agent-cli.ts#L238) = { preset: Preset; bin: string } | { command: string[] } <!-- internal -->
      <a id="features.agent-cli.Runner"></a><br>What `cliClient` runs: a preset with its binary, or a user's command.
    - fn [cliClient](../../src/agent-cli.ts#L245) (agent: string, options: { root: string; env: Env; home: string }) → { client: CliClient } | { missing: string }
      <a id="features.agent-cli.cliClient"></a><br>A client for a `cli:` agent, or why there is none (a missing binary, a Grok `agent` where Cursor's was expected): only a PATH scan and, for an `agent` binary, one memoized `--version`. Invalid agents.json throws.
      - calls [features.agent-cli.parseCliAgent](features.md#features.agent-cli.parseCliAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.isPreset](features.md#features.agent-cli.isPreset), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.completeWith](features.md#features.agent-cli.completeWith)
    - fn [presetBinary](../../src/agent-cli.ts#L287) (preset: Preset, bin: string | null, env: Env, home: string) → { bin: string } | { missing: string } <!-- internal -->
      <a id="features.agent-cli.presetBinary"></a><br>The binary of a preset: `bin` from agents.json, else its name on PATH; Cursor's is `cursor-agent`, or `agent` when its version is Cursor's.
      - calls [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.binaryVersion](features.md#features.agent-cli.binaryVersion)
    - fn [binaryVersion](../../src/agent-cli.ts#L318) (bin: string, env: Env) → string | null <!-- internal -->
      <a id="features.agent-cli.binaryVersion"></a><br>The first line of `<bin> --version`, at most 5 s, memoized per process; null when it gives none.
    - fn [shortVersion](../../src/agent-cli.ts#L329) (line: string) → string
      <a id="features.agent-cli.shortVersion"></a><br>`2.1.289 (Claude Code)` → `2.1.289`; `codex-cli 0.155.1` → `0.155.1`; a Cursor build keeps its hash.
    - fn [cliVersion](../../src/agent-cli.ts#L334) (bin: string, env: Env = process.env) → Promise<string | null>
      <a id="features.agent-cli.cliVersion"></a><br>The version of a binary for doctor, asynchronously (5 s cap, never a login or status command).
      - calls [features.agent-cli.shortVersion](features.md#features.agent-cli.shortVersion)
    - type [AgentCliProbe](../../src/agent-cli.ts#L356)
      <a id="features.agent-cli.AgentCliProbe"></a><br>A preset as doctor sees it: its binary (null: none usable) and that binary's version (null: it gave none).
    - fn [probeAgentClis](../../src/agent-cli.ts#L363) (env: Env = process.env, home: string = homedir()) → Promise<AgentCliProbe[]>
      <a id="features.agent-cli.probeAgentClis"></a><br>Every preset, probed in parallel with `--version` only: offline, never a login or status command.
      - calls [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.cliVersion](features.md#features.agent-cli.cliVersion)
    - fn [findBinary](../../src/agent-cli.ts#L385) (name: string, env: Env) → string | null
      <a id="features.agent-cli.findBinary"></a><br>A name on PATH or a path, if it is an executable file.
      - calls [features.agent-cli.executable](features.md#features.agent-cli.executable)
    - fn [executable](../../src/agent-cli.ts#L400) (path: string) → boolean <!-- internal -->
      <a id="features.agent-cli.executable"></a><br>Whether `path` is a regular file the process may execute.
    - type [AnswerKind](../../src/agent-cli.ts#L414) = "result-json" | "file" | "opencode-events" | "stdout"
      <a id="features.agent-cli.AnswerKind"></a><br>How the answer is read: a `type:"result"` JSON line, Codex's `-o` file, opencode's NDJSON events, or stdout.
    - type [Invocation](../../src/agent-cli.ts#L417)
      <a id="features.agent-cli.Invocation"></a><br>Everything needed to run one request: argv, stdin, env, extra files and how to read the answer.
    - fn [invocation](../../src/agent-cli.ts#L433) (runner: Runner, model: string, request: CliRequest, root: string, env: Env, tmp: string) → Invocation
      <a id="features.agent-cli.invocation"></a><br>The process to run for one request; `tmp` is a private directory outside the repository.
      - calls [features.agent-cli.wellFormed](features.md#features.agent-cli.wellFormed), [features.agent-cli.opencodeConfig](features.md#features.agent-cli.opencodeConfig)
    - fn [opencodeConfig](../../src/agent-cli.ts#L524) (existing: string | undefined, system: string) → string <!-- internal -->
      <a id="features.agent-cli.opencodeConfig"></a><br>The user's `OPENCODE_CONFIG_CONTENT` with keylang's agent on top: every permission denied.
      - calls [features.agent-cli.parseJsonOrNothing](features.md#features.agent-cli.parseJsonOrNothing), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [wellFormed](../../src/agent-cli.ts#L540) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.wellFormed"></a><br>`text` with lone UTF-16 surrogates replaced by U+FFFD, so it can be encoded as UTF-8 / TOML.
    - type [Answer](../../src/agent-cli.ts#L545) <!-- internal -->
      <a id="features.agent-cli.Answer"></a><br>An agent's answer, with the model that wrote it when the CLI's output names it.
    - type [ResultLine](../../src/agent-cli.ts#L551) = Answer | { error: string } <!-- internal -->
      <a id="features.agent-cli.ResultLine"></a><br>Discriminated union for one line of CLI result output: either a successful response carrying `text` and the `model` that produced it (or null), or a failure carrying only an `error` message. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [parseResultLine](../../src/agent-cli.ts#L554) (line: string) → ResultLine | null
      <a id="features.agent-cli.parseResultLine"></a><br>A `{"type":"result"}` line of Claude Code or Cursor: the answer with the model that wrote it, an error, or null for any other line.
      - calls [features.agent-cli.parseJsonOrNothing](features.md#features.agent-cli.parseJsonOrNothing), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.agent-cli.answeringModel](features.md#features.agent-cli.answeringModel)
    - fn [answeringModel](../../src/agent-cli.ts#L571) (usage: JsonValue | undefined) → string | null <!-- internal -->
      <a id="features.agent-cli.answeringModel"></a><br>The model of Claude Code's `modelUsage` (`{"<model>": {"outputTokens": n, …}}`) that wrote the most output: the CLI may also use a small model on the side. Null when the line has none (Cursor) or its shape is not that.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [parseOpencodeEvents](../../src/agent-cli.ts#L590) (output: string) → { text: string } | { error: string }
      <a id="features.agent-cli.parseOpencodeEvents"></a><br>opencode's NDJSON: the text parts after the last step start, or the first error.
      - calls [features.agent-cli.parseJsonOrNothing](features.md#features.agent-cli.parseJsonOrNothing), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [completeWith](../../src/agent-cli.ts#L618) (agent: string, runner: Runner, model: string, request: CliRequest, options: { root: string; env: Env }, call: CliCallOptions) → Promise<string> <!-- internal -->
      <a id="features.agent-cli.completeWith"></a><br>One request end to end: a private temp dir, the run, the answer read, and cleanup whatever happens.
      - calls [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.invocation](features.md#features.agent-cli.invocation), [features.agent-cli.runInvocation](features.md#features.agent-cli.runInvocation), [features.agent-cli.readAnswer](features.md#features.agent-cli.readAnswer)
    - type [RunResult](../../src/agent-cli.ts#L646) <!-- internal -->
      <a id="features.agent-cli.RunResult"></a><br>What a run produced: its stdout and, when the result line arrived early, that line parsed.
    - fn [readAnswer](../../src/agent-cli.ts#L653) (agent: string, inv: Invocation, run: RunResult) → Answer <!-- internal -->
      <a id="features.agent-cli.readAnswer"></a><br>The answer, with the model that wrote it when the CLI's output names it.
      - calls [features.agent-cli.lastResult](features.md#features.agent-cli.lastResult), [features.agent-cli.parseOpencodeEvents](features.md#features.agent-cli.parseOpencodeEvents)
    - fn [lastResult](../../src/agent-cli.ts#L681) (stdout: string) → ResultLine | null <!-- internal -->
      <a id="features.agent-cli.lastResult"></a><br>The last result line of the whole stdout, or null.
      - calls [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine)
    - fn [killGroup](../../src/agent-cli.ts#L696) (pid: number, signal: NodeJS.Signals) → void <!-- internal -->
      <a id="features.agent-cli.killGroup"></a><br>Signal a whole process group (negative pid); on Windows, just the process.
    - fn [hookExit](../../src/agent-cli.ts#L705) () → void <!-- internal -->
      <a id="features.agent-cli.hookExit"></a><br>Once: keylang's exit kills every live group; a fatal signal with no handler of its own kills them first and is raised again.
      - calls [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup)
    - fn [runInvocation](../../src/agent-cli.ts#L732) (agent: string, inv: Invocation, root: string, call: CliCallOptions) → Promise<RunResult> <!-- internal -->
      <a id="features.agent-cli.runInvocation"></a><br>Run one invocation in its own process group and resolve with its output. Settles exactly once: on the result line, exit, error, timeout, cancel or an output overflow; every early end stops the group.
      - calls [features.agent-cli.hookExit](features.md#features.agent-cli.hookExit), [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine), [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup), [features.agent-cli.stripAnsi](features.md#features.agent-cli.stripAnsi)
    - fn [stripAnsi](../../src/agent-cli.ts#L865) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.stripAnsi"></a><br>`text` without ANSI CSI escape sequences (colours, cursor moves).
    - fn [parseJsonOrNothing](../../src/agent-cli.ts#L871) (text: string) → JsonValue | undefined <!-- internal -->
      <a id="features.agent-cli.parseJsonOrNothing"></a><br>A line of a CLI's output as JSON; undefined when it is empty or not JSON.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
  - module [agent-context](../../src/agent-context.ts#L1)
    <a id="features.agent-context"></a><br>What goes to the model (design §7.3 «Контекст»): the buffer, the nodes on the cursor line and their neighbours, the flows and rules naming them, their code and the tests of those flows — each item with a token estimate, so the person sees and trims what the agent reads. `@id`…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - type [ContextKind](../../src/agent-context.ts#L23)
      <a id="features.agent-context.ContextKind"></a><br>What an item of a context pack holds.
    - type [ContextItem](../../src/agent-context.ts#L26)
      <a id="features.agent-context.ContextItem"></a><br>One entry of a context pack, with its text and token estimate.
    - type [ContextPack](../../src/agent-context.ts#L40)
      <a id="features.agent-context.ContextPack"></a><br>The items an agent is given, their token total and the key the pack is cached by.
    - type [ContextInput](../../src/agent-context.ts#L48)
      <a id="features.agent-context.ContextInput"></a><br>The editor state a pack is built for: the buffer, the cursor line and the person's additions and removals.
    - fn [estimateTokens](../../src/agent-context.ts#L58) (text: string) → number
      <a id="features.agent-context.estimateTokens"></a><br>Roughly four characters a token: an estimate for the person, not a bill.
    - fn [contextForIds](../../src/agent-context.ts#L68) (analysis: Analysis, ids: readonly string[]) → ContextPack
      <a id="features.agent-context.contextForIds"></a><br>The bundle for a list of ids: each node and its neighbors, the flows and rules that name it, its code, and the e2e tests of those flows. A planned id that is not implemented is marked planned and incomplete.
      - calls [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems), [features.agent-context.packOf](features.md#features.agent-context.packOf)
    - fn [contextPack](../../src/agent-context.ts#L85) (analysis: Analysis, input: ContextInput) → ContextPack
      <a id="features.agent-context.contextPack"></a><br>The context pack for the cursor line of a buffer, cached per analysis and buffer state.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.specDigest](features.md#features.agent-context.specDigest), [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems)
    - fn [packOf](../../src/agent-context.ts#L142) (items: ContextItem[], keySource: string) → ContextPack <!-- internal -->
      <a id="features.agent-context.packOf"></a><br>A pack of `items`, keyed by a hash of `keySource`.
    - fn [addIdItems](../../src/agent-context.ts#L147) (analysis: Analysis, ids: readonly string[], removed: ReadonlySet<string>, items: ContextItem[]) → void <!-- internal -->
      <a id="features.agent-context.addIdItems"></a><br>Nodes, neighbors, code, flows, rules and tests for `ids`. `add` is the TUI pack's adder; appends to `items`, skipping keys already there or in `removed`.
      - calls [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.sectionText](features.md#features.agent-context.sectionText)
    - fn [sectionText](../../src/agent-context.ts#L212) (doc: Document, section: Section) → string <!-- internal -->
      <a id="features.agent-context.sectionText"></a><br>A section as the analysis read it (an unsaved buffer included), in canonical form.
      - calls [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [specDigest](../../src/agent-context.ts#L217) (analysis: Analysis) → string <!-- internal -->
      <a id="features.agent-context.specDigest"></a><br>What every hand-written spec of the analysis says: part of the pack key, so a changed rule or flow elsewhere is a new pack.
      - calls [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [snapshotSource](../../src/agent-context.ts#L232) (analysis: Analysis, file: string) → string | null
      <a id="features.agent-context.snapshotSource"></a><br>The text of a source file when it still has the bytes the snapshot hashed; null otherwise.
    - fn [contextText](../../src/agent-context.ts#L244) (pack: ContextPack) → string
      <a id="features.agent-context.contextText"></a><br>The pack as the prompt text a model gets.
  - module [baseline](../../src/baseline.ts#L1)
    <a id="features.baseline"></a><br>`keylang/rules.baseline.md`: deny rules for the dependencies the current graph does not have, so a new edge between layers or a new package is K102. The grammar is the ordinary `deny` / `allow`.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - files [lang.files](lang.md#lang.files)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - fn [baselineText](../../src/baseline.ts#L32) (snapshot: AnalysisSnapshot) → string
      <a id="features.baseline.baselineText"></a><br>Baseline rules for one snapshot. Layers come from `keylang.json`, in code-unit order; `unassigned` is a source only when a module is in it.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.baseline.externalModule](features.md#features.baseline.externalModule)
    - fn [externalModule](../../src/baseline.ts#L103) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="features.baseline.externalModule"></a><br>The external module an id belongs to (`external.stripe` for a symbol under it).
    - fn [baselinePath](../../src/baseline.ts#L119) (config: Pick<Config, "dir">) → string
      <a id="features.baseline.baselinePath"></a><br>Where the baseline lives: `<dir>/rules.baseline.md`, relative to the root, POSIX.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - type [BaselinePlan](../../src/baseline.ts#L127)
      <a id="features.baseline.BaselinePlan"></a><br>What `keylang baseline` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planBaseline](../../src/baseline.ts#L148) (config: Config, snapshot: AnalysisSnapshot) → BaselinePlan
      <a id="features.baseline.planBaseline"></a><br>Plans the baseline of `snapshot` against the file on disk. Reads, writes nothing.
      - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [features.baseline.baselineText](features.md#features.baseline.baselineText), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.baseline.ruleLines](features.md#features.baseline.ruleLines), [map.map.sourceInputs](map.md#map.map.sourceInputs)
    - fn [baselinePlanProblems](../../src/baseline.ts#L176) (plan: BaselinePlan) → string[]
      <a id="features.baseline.baselinePlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): the target must pass the repository's write rules and still hold the bytes the plan saw, and `keylang.json` and the sources must be the ones the baseline was computed from.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems)
    - fn [commitBaseline](../../src/baseline.ts#L187) (plan: BaselinePlan) → void
      <a id="features.baseline.commitBaseline"></a><br>Writes the planned text atomically at the target (a link inside the repository is followed; CRLF of the old file kept). Throws on an I/O error.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [ruleLines](../../src/baseline.ts#L195) (text: string) → string[] <!-- internal -->
      <a id="features.baseline.ruleLines"></a><br>The `- deny` / `- allow` lines of a rules text, in order.
  - module [call-sites](../../src/call-sites.ts#L1)
    <a id="features.call-sites"></a><br>What the coverage report and the integrations inventory read beside the snapshot (business-flows/13, 14): every call written in the analysed files with the node that encloses it, matched against lists kept as data (`resources/*.json`), and reachability from entry points over…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - facts [extract.facts](extract.md#extract.facts)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - frontends [map.frontends](map.md#map.frontends)
    - json [base.json](base.md#base.json)
    - languages [base.languages](base.md#base.languages)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - fn [resourcePath](../../src/call-sites.ts#L30) (name: string) → string
      <a id="features.call-sites.resourcePath"></a><br>A data file of `resources/`, beside `src/` and `dist/` alike.
    - type [Matcher](../../src/call-sites.ts#L41)
      <a id="features.call-sites.Matcher"></a><br>How a data list names what it looks for. A call matches when any of `callees`, `imports` or `receivers` matches; `methods` narrows `imports` and `receivers` to calls whose last name is listed. `text` matches source lines (a read such as `process.env.X`, which is no call)…
    - type [CallSite](../../src/call-sites.ts#L61)
      <a id="features.call-sites.CallSite"></a><br>A call written in an analysed file.
    - type [ReadSite](../../src/call-sites.ts#L75)
      <a id="features.call-sites.ReadSite"></a><br>A read of a name keylang has no call for (`settings.X`), or a source line a `text` pattern matched.
    - type [FileCalls](../../src/call-sites.ts#L84)
      <a id="features.call-sites.FileCalls"></a><br>The facts of one analysed file with what a matcher needs: the imports by the local name they bind.
    - fn [snapshotFacts](../../src/call-sites.ts#L101) (config: Config, snapshot: AnalysisSnapshot) → Promise<FileFacts[]>
      <a id="features.call-sites.snapshotFacts"></a><br>The facts of every analysed file of the snapshot, in path order: the fact cache's entry when its hash is the manifest's (an analysis that saves the cache has just written it), else the file extracted again. A file that cannot be read or parsed gives none.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.config.isAnalysed](base.md#base.config.isAnalysed), [features.call-sites.isFacts](features.md#features.call-sites.isFacts), [map.frontends.frontendFor](map.md#map.frontends.frontendFor)
    - fn [isFacts](../../src/call-sites.ts#L140) (value: JsonValue | undefined) → value is JsonObject & FileFacts <!-- internal -->
      <a id="features.call-sites.isFacts"></a><br>A cache entry that has the shape of FileFacts (checked shallowly: the cache is keylang's own file).
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - type [Span](../../src/call-sites.ts#L145) <!-- internal -->
      <a id="features.call-sites.Span"></a><br>Spans of the nodes declared in each file: what places a call in a fn.
    - type [FileSpans](../../src/call-sites.ts#L148) <!-- internal -->
      <a id="features.call-sites.FileSpans"></a><br>Node spans by file, and the module id of each file.
    - fn [spansByFile](../../src/call-sites.ts#L154) (snapshot: AnalysisSnapshot) → FileSpans <!-- internal -->
      <a id="features.call-sites.spansByFile"></a><br>Every fn and class span per file, and each file's module (the shortest module ID with that file).
      - calls [features.call-sites.hasSpan](features.md#features.call-sites.hasSpan)
    - fn [hasSpan](../../src/call-sites.ts#L177) (node: SnapshotNode) → boolean <!-- internal -->
      <a id="features.call-sites.hasSpan"></a><br>Whether the node has a full start and end position.
    - fn [before](../../src/call-sites.ts#L182) (aLine: number, aCol: number, bLine: number, bCol: number) → boolean <!-- internal -->
      <a id="features.call-sites.before"></a>
    - fn [enclosing](../../src/call-sites.ts#L185) (spans: readonly Span[] | undefined, module: string | undefined, line: number, col: number) → string | null <!-- internal -->
      <a id="features.call-sites.enclosing"></a><br>The innermost fn holding the position, else the innermost class, else the file's module.
      - calls [features.call-sites.before](features.md#features.call-sites.before)
    - fn [callsOf](../../src/call-sites.ts#L199) (snapshot: AnalysisSnapshot, facts: readonly FileFacts[]) → FileCalls[]
      <a id="features.call-sites.callsOf"></a><br>Calls, reads and imports of each file, each placed in the node that holds it. Sorted by file, then position.
      - calls [features.call-sites.spansByFile](features.md#features.call-sites.spansByFile), [base.span.compareText](base.md#base.span.compareText), [features.call-sites.enclosing](features.md#features.call-sites.enclosing), [base.languages.languageOf](base.md#base.languages.languageOf)
    - type [CompiledMatcher](../../src/call-sites.ts#L248)
      <a id="features.call-sites.CompiledMatcher"></a><br>A matcher with its regular expressions compiled once.
    - fn [compileMatcher](../../src/call-sites.ts#L258) (matcher: Matcher) → CompiledMatcher
      <a id="features.call-sites.compileMatcher"></a><br>Compile a matcher's patterns once; `imports` and `receivers` lose a leading PHP `\`.
      - calls [features.call-sites.withoutRoot](features.md#features.call-sites.withoutRoot)
    - fn [withoutRoot](../../src/call-sites.ts#L270) (name: string) → string <!-- internal -->
      <a id="features.call-sites.withoutRoot"></a><br>A PHP name written fully qualified (`\Foo\Bar`) is the name without the leading `\`.
    - fn [importMatches](../../src/call-sites.ts#L275) (source: string, pattern: string) → boolean
      <a id="features.call-sites.importMatches"></a><br>Whether an import's source is one the pattern names: exact, under a separator-ended prefix, or under a `*` prefix.
      - calls [features.call-sites.withoutRoot](features.md#features.call-sites.withoutRoot)
    - fn [segmentsOf](../../src/call-sites.ts#L292) (site: CallSite) → string[] <!-- internal -->
      <a id="features.call-sites.segmentsOf"></a><br>The segments of a call's callee, split once.
      - calls [features.call-sites.segments](features.md#features.call-sites.segments)
    - fn [segments](../../src/call-sites.ts#L304) (callee: string) → string[] <!-- internal -->
      <a id="features.call-sites.segments"></a><br>Segments of a callee: `this.config.getValue` → this, config, getValue; `reqwest::get` → reqwest, get.
    - fn [lastName](../../src/call-sites.ts#L309) (name: string) → string <!-- internal -->
      <a id="features.call-sites.lastName"></a><br>The last segment of a class name: `Magento\Framework\HTTP\Client\Curl` → `Curl`.
    - fn [appliesTo](../../src/call-sites.ts#L314) (matcher: CompiledMatcher, language: Language | undefined) → boolean
      <a id="features.call-sites.appliesTo"></a><br>Whether the matcher applies to files of this language.
    - fn [callMatches](../../src/call-sites.ts#L322) (matcher: CompiledMatcher, site: CallSite, file: FileCalls, internal: boolean) → boolean
      <a id="features.call-sites.callMatches"></a><br>Whether the call matches. `internal`: the call resolved to the repository's own code (a local `fetch`), which no `callees` pattern may claim.
      - calls [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo), [features.call-sites.segmentsOf](features.md#features.call-sites.segmentsOf), [features.call-sites.importMatches](features.md#features.call-sites.importMatches), [features.call-sites.withoutRoot](features.md#features.call-sites.withoutRoot), [features.call-sites.lastName](features.md#features.call-sites.lastName)
    - fn [readMatches](../../src/call-sites.ts#L369) (matcher: CompiledMatcher, read: ReadSite, file: FileCalls) → boolean
      <a id="features.call-sites.readMatches"></a><br>Whether a read (`settings.PAYMENT_URL`) goes through a name an import the matcher lists binds.
      - calls [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo), [features.call-sites.segments](features.md#features.call-sites.segments), [features.call-sites.importMatches](features.md#features.call-sites.importMatches)
    - fn [textMatches](../../src/call-sites.ts#L387) (matcher: CompiledMatcher, file: FileCalls, source: string, place: (line: number, col: number) => string | null) → ReadSite[]
      <a id="features.call-sites.textMatches"></a><br>Source lines the matcher's `text` patterns match, each placed in its node: 1-based line, column of the match.
      - calls [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo)
    - fn [placer](../../src/call-sites.ts#L407) (snapshot: AnalysisSnapshot) → (file: string, line: number, col: number) => string | null
      <a id="features.call-sites.placer"></a><br>A placer of positions of one file in its nodes, for matches the facts do not place.
      - calls [features.call-sites.spansByFile](features.md#features.call-sites.spansByFile), [features.call-sites.enclosing](features.md#features.call-sites.enclosing)
    - fn [internalCallPositions](../../src/call-sites.ts#L414) (snapshot: AnalysisSnapshot) → Set<string>
      <a id="features.call-sites.internalCallPositions"></a><br>`file:line:col` of every call edge that resolved into the repository: no built-in or package is called there.
    - type [CallGraph](../../src/call-sites.ts#L424)
      <a id="features.call-sites.CallGraph"></a><br>Adjacency of resolved calls in both directions.
    - fn [callGraph](../../src/call-sites.ts#L430) (snapshot: AnalysisSnapshot) → CallGraph
      <a id="features.call-sites.callGraph"></a><br>The resolved call edges as adjacency: source → targets, and target → sources. Hook (`via`) edges included.
    - fn [reachable](../../src/call-sites.ts#L449) (adjacency: ReadonlyMap<string, ReadonlySet<string>>, starts: Iterable<string>) → Set<string>
      <a id="features.call-sites.reachable"></a><br>Every node reachable from the starts over the adjacency, the starts included.
    - fn [isTestFile](../../src/call-sites.ts#L467) (path: string) → boolean
      <a id="features.call-sites.isTestFile"></a><br>A file of tests: its fns are not expected to be reached from an entry point.
    - fn [lineStarts](../../src/call-sites.ts#L473) (text: string) → number[]
      <a id="features.call-sites.lineStarts"></a><br>Lines of a source text, for reading a call's arguments.
    - type [CallUrl](../../src/call-sites.ts#L482)
      <a id="features.call-sites.CallUrl"></a><br>How a call names its URL, and the host of a literal one.
    - fn [urlOf](../../src/call-sites.ts#L494) (text: string, starts: readonly number[], line: number, col: number, callee: string) → CallUrl
      <a id="features.call-sites.urlOf"></a><br>The URL a call names: the host of a literal absolute URL among its first two arguments (a literal prefix counts: `"https://api.x.com/" + id`), `dynamic` when an argument there is an expression, `n/a` when the call has no arguments, only literals that are no URL, or no argument…
      - calls [features.call-sites.firstArguments](features.md#features.call-sites.firstArguments)
    - fn [literalArgument](../../src/call-sites.ts#L524) (text: string, starts: readonly number[], line: number, col: number, callee: string) → string | null
      <a id="features.call-sites.literalArgument"></a><br>The first argument of the call when it is a plain string literal (a queue's topic), else null.
      - calls [features.call-sites.firstArguments](features.md#features.call-sites.firstArguments)
    - fn [firstArguments](../../src/call-sites.ts#L535) (text: string, starts: readonly number[], line: number, col: number, callee: string, max: number) → string[] | null <!-- internal -->
      <a id="features.call-sites.firstArguments"></a><br>The first `max` arguments of the call at the position, as written: after the callee's last name; null when no argument list follows it.
      - calls [features.call-sites.segments](features.md#features.call-sites.segments)
    - fn [sourceReader](../../src/call-sites.ts#L600) (root: string) → (file: string) => { text: string; starts: number[] } | null
      <a id="features.call-sites.sourceReader"></a><br>A text read once per file.
      - calls [features.call-sites.lineStarts](features.md#features.call-sites.lineStarts)
  - module [changed](../../src/changed.ts#L1)
    <a id="features.changed"></a><br>`check --changed` keeps the full analysis and drops findings that do not touch the changed files: a changed spec (every finding in that file), a rule whose scope contains a changed module, and a flow with a step whose code is in a changed file. `hook stop` maps the fails that…
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - json [base.json](base.md#base.json)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - type [ChangedInput](../../src/changed.ts#L18)
      <a id="features.changed.ChangedInput"></a><br>One full assessment plus the snapshot nodes (and edges) needed to tie findings to files.
    - type [ChangedEdge](../../src/changed.ts#L29)
      <a id="features.changed.ChangedEdge"></a><br>The part of a snapshot edge the `--changed` slice reads; a `call` or `type` edge, an unresolved or a types-only import is not a dependency a cycle runs through.
    - type [HookFail](../../src/changed.ts#L38)
      <a id="features.changed.HookFail"></a><br>One failure the stop hook reports: where, and the text a person reads.
    - type [RuleHit](../../src/changed.ts#L45) <!-- internal -->
      <a id="features.changed.RuleHit"></a><br>A rule line and the modules or layers it is about.
    - fn [filterChanged](../../src/changed.ts#L59) (input: ChangedInput, changed: ReadonlySet<string>, deleted: readonly string[] = []) → ChangedReport
      <a id="features.changed.filterChanged"></a><br>Diagnostics and verdicts that touch `changed` (paths as check prints them). `deleted` are module ids whose file git removed: the node is gone, so a flow step that named it is still in the report. Order is preserved.
      - calls [features.changed.ruleHits](features.md#features.changed.ruleHits), [features.changed.covers](features.md#features.changed.covers), [features.changed.flowLinesTouching](features.md#features.changed.flowLinesTouching), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - type [ChangedReport](../../src/changed.ts#L90)
      <a id="features.changed.ChangedReport"></a><br>The diagnostics and verdicts a change touches.
    - fn [hookFails](../../src/changed.ts#L96) (report: { diagnostics: readonly Diagnostic[]; verdicts: readonly Verdict[] }) → HookFail[]
      <a id="features.changed.hookFails"></a><br>Error diagnostics, then fail verdicts that are not the same finding.
      - calls [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookDecision](../../src/changed.ts#L109) (event: HookEvent, fails: readonly HookFail[]) → string
      <a id="features.changed.hookDecision"></a><br>Stdin event plus the fails of one changed check. `stop_hook_active` never blocks. The same inputs return the same JSON.
    - type [UncheckedTurn](../../src/changed.ts#L118)
      <a id="features.changed.UncheckedTurn"></a><br>A turn the hook could not check: the line a person reads and the hook's JSON.
    - type [HookEvent](../../src/changed.ts#L124)
      <a id="features.changed.HookEvent"></a><br>The stop hook's stdin event, as far as keylang reads it.
    - fn [uncheckedTurn](../../src/changed.ts#L136) (error: string) → UncheckedTurn
      <a id="features.changed.uncheckedTurn"></a><br>A turn the hook could not check — stdin that is no event, no git, a broken keylang.json, a failed analysis — as the line a person reads and the JSON that carries it: a `systemMessage`, which Claude Code and Codex show the person as a warning without blocking the agent (stderr…
    - fn [parseHookEvent](../../src/changed.ts#L145) (text: string) → HookEvent
      <a id="features.changed.parseHookEvent"></a><br>The object on stdin. Empty stdin is an event with no `stop_hook_active`.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean)
    - fn [covers](../../src/changed.ts#L167) (scope: readonly string[], moduleId: string, layer: string) → boolean <!-- internal -->
      <a id="features.changed.covers"></a><br>Whether a rule scope covers a module: empty scope covers all; otherwise its layer, itself or an ancestor ID.
    - fn [ruleHits](../../src/changed.ts#L174) (input: ChangedInput) → RuleHit[] <!-- internal -->
      <a id="features.changed.ruleHits"></a><br>Scope and the verdict criterion `--changed` already matches. `no-cycles` stays the literal criterion, not the hashed `no-cycles <module|*>`.
      - calls [features.changed.noCyclesArea](features.md#features.changed.noCyclesArea)
    - fn [noCyclesArea](../../src/changed.ts#L207) (input: ChangedInput, under: string) → string[] <!-- internal -->
      <a id="features.changed.noCyclesArea"></a><br>`under`, its submodules, and every module they reach by a resolved `import` or `reexport` that is not types-only: the area `rules.ts` judges the rule over. Edges are between symbols; their module is the nearest `module` node up the id (a class is one too, and lies under its…
    - fn [flowLinesTouching](../../src/changed.ts#L256) (input: ChangedInput, changed: ReadonlySet<string>, gone: (id: string) => boolean) → Set<string> <!-- internal -->
      <a id="features.changed.flowLinesTouching"></a><br>`file:line` of every verdict in a flow that names a symbol whose file changed or was deleted.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
  - module [check-format](../../src/check-format.ts#L1)
    <a id="features.check-format"></a><br>The text of one check report in each `--format`: exactly what `keylang check` prints on stdout. The CLI writes it; the TUI exports the same bytes to a file.
    - check-results [features.check-results](features.md#features.check-results)
    - explain [features.explain](features.md#features.explain)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [CheckFormat](../../src/check-format.ts#L17) = (typeof CHECK_FORMATS)[number]
      <a id="features.check-format.CheckFormat"></a><br>One `--format` value.
    - type [CheckReportData](../../src/check-format.ts#L20)
      <a id="features.check-format.CheckReportData"></a><br>What a format shows: the `--format json` data and the human lines of the same report.
    - fn [isCheckFormat](../../src/check-format.ts#L28) (name: string) → name is CheckFormat
      <a id="features.check-format.isCheckFormat"></a><br>Whether `name` is a supported `--format` value.
    - fn [checkReportText](../../src/check-format.ts#L33) (format: CheckFormat, report: CheckReportData) → string
      <a id="features.check-format.checkReportText"></a><br>The stdout of `keylang check --format <format>` for `report`, every line ending with `\n`.
      - calls [features.check-format.githubText](features.md#features.check-format.githubText), [features.check-format.sarifLog](features.md#features.check-format.sarifLog)
    - fn [githubText](../../src/check-format.ts#L44) (results: readonly CheckResult[]) → string <!-- internal -->
      <a id="features.check-format.githubText"></a><br>One `::error`/`::warning`/`::notice` workflow command per non-ok result; ok results print nothing.
      - calls [features.check-format.githubProperty](features.md#features.check-format.githubProperty), [features.check-format.ruleOf](features.md#features.check-format.ruleOf), [features.check-format.githubData](features.md#features.check-format.githubData)
    - fn [sarifLog](../../src/check-format.ts#L58) (report: CheckReportData) <!-- internal -->
      <a id="features.check-format.sarifLog"></a><br>A SARIF 2.1.0 log with one run: every non-ok result, and one rule per distinct rule id.
      - calls [features.check-format.ruleOf](features.md#features.check-format.ruleOf), [features.check-format.ruleText](features.md#features.check-format.ruleText), [features.check-format.sarifProperties](features.md#features.check-format.sarifProperties)
    - type [SarifProperties](../../src/check-format.ts#L87) <!-- internal -->
      <a id="features.check-format.SarifProperties"></a><br>What SARIF keeps of a result beside its location and message.
    - fn [sarifProperties](../../src/check-format.ts#L89) (result: CheckResult) → SarifProperties <!-- internal -->
      <a id="features.check-format.sarifProperties"></a>
    - fn [ruleOf](../../src/check-format.ts#L105) (result: CheckResult) → string <!-- internal -->
      <a id="features.check-format.ruleOf"></a><br>The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind.
    - fn [ruleText](../../src/check-format.ts#L118) (id: string) → string <!-- internal -->
      <a id="features.check-format.ruleText"></a><br>The short description of a SARIF rule: the first line of a K-code's explanation, or a flow evidence kind's text.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [githubData](../../src/check-format.ts#L126) (text: string) → string <!-- internal -->
      <a id="features.check-format.githubData"></a><br>Percent-encodes `%`, carriage returns, and newlines in a string so it is safe as a GitHub Actions workflow command payload. Used by [`features.check-format.githubProperty`](features.md#features.check-format.githubProperty) and [`features.check-format.githubText`](features.md#features.check-format.githubText) to escape annotation messages. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [githubProperty](../../src/check-format.ts#L131) (text: string) → string <!-- internal -->
      <a id="features.check-format.githubProperty"></a><br>Escape a property value (`file=`, `title=`), which additionally must not contain `:` or `,`.
      - calls [features.check-format.githubData](features.md#features.check-format.githubData)
  - module [check-results](../../src/check-results.ts#L1)
    <a id="features.check-results"></a><br>The results of `keylang check --format json`: diagnostics and verdicts in one list, a diagnostic joined with the verdict it explains. Shared by the CLI, the MCP server and the TUI (the check operation and the findings panel), so an agent sees exactly what CI sees.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Provenance](../../src/check-results.ts#L15) = NonNullable<Verdict["evidence"]>["provenance"] <!-- internal -->
      <a id="features.check-results.Provenance"></a><br>Extracts the type of the `provenance` field from a verdict's evidence object, after stripping null and undefined from the evidence type. It lets check-result code reference that nested shape without redeclaring it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CheckResult](../../src/check-results.ts#L18)
      <a id="features.check-results.CheckResult"></a><br>One row of `check --format json`: a diagnostic or a verdict, located in the spec and bound to a snapshot.
    - fn [checkResults](../../src/check-results.ts#L42) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckResult[]
      <a id="features.check-results.checkResults"></a><br>Diagnostics and verdicts as one list; a verdict that repeats a diagnostic lends it its criterion, hash, and provenance.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [base.diag.isError](base.md#base.diag.isError)
    - type [CheckReport](../../src/check-results.ts#L96)
      <a id="features.check-results.CheckReport"></a><br>What `keylang check` reports, whatever the format: the verdicts decide it, the format only shows it.
    - type [CheckCounts](../../src/check-results.ts#L105)
      <a id="features.check-results.CheckCounts"></a><br>The summary on stderr: errors and failed verdicts, unverified and ok verdicts.
    - fn [checkReport](../../src/check-results.ts#L120) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckReport
      <a id="features.check-results.checkReport"></a><br>The results, human lines and summary counts of one check run.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [base.diag.isError](base.md#base.diag.isError), [features.check-results.checkResults](features.md#features.check-results.checkResults), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [check.verdict.formatVerdict](check.md#check.verdict.formatVerdict)
    - fn [checkExitCode](../../src/check-results.ts#L146) (counts: CheckCounts, strict: boolean) → 0 | 1
      <a id="features.check-results.checkExitCode"></a><br>The exit code of `keylang check`: 1 for a failure, or with `strict` for an unverified verdict; else 0 — an unverified one stays visible.
  - module [clone](../../src/clone.ts#L1)
    <a id="features.clone"></a><br>`keylang clone <source>`: a repository someone names by URL (or a local path) becomes a blob-less partial clone in keylang's cache, which `init`, `map` and `explain` then work on like any checkout. Git runs as an argument array, never through a shell, with its credential prompt…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - json [base.json](base.md#base.json)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [RepoSource](../../src/clone.ts#L19)
      <a id="features.clone.RepoSource"></a><br>What to clone and where it sits under the cache root.
    - type [CloneExplain](../../src/clone.ts#L29) = "map-only" | "map-and-ai" | "all"
      <a id="features.clone.CloneExplain"></a><br>How far `clone --explain` goes past the map.
    - fn [isCloneExplain](../../src/clone.ts#L35) (text: string) → text is CloneExplain
      <a id="features.clone.isCloneExplain"></a><br>Whether `text` is a valid `--explain` mode.
    - fn [redactUrl](../../src/clone.ts#L47) (text: string) → string
      <a id="features.clone.redactUrl"></a><br>A URL with its userinfo (`user:token@`) cut, as git does in its own messages; anything else is returned as is. A token passed in the URL goes to git and nowhere else: not to stdout (a CI log), stderr or the marker.
    - fn [parseRepoSource](../../src/clone.ts#L62) (text: string, cwd: string) → RepoSource | { error: string }
      <a id="features.clone.parseRepoSource"></a><br>Reads a clone source: an `http(s)://`, `ssh://`, `git://` or `file://` URL, the scp form `git@host:owner/repo.git`, or a path to a local repository. The key never holds credentials, `..` or characters a file name cannot carry.
      - calls [features.clone.redactUrl](features.md#features.clone.redactUrl), [features.clone.fromUrl](features.md#features.clone.fromUrl), [features.clone.placeable](features.md#features.clone.placeable), [features.clone.keyed](features.md#features.clone.keyed)
    - fn [fromUrl](../../src/clone.ts#L90) (source: string) → RepoSource | { error: string } <!-- internal -->
      <a id="features.clone.fromUrl"></a><br>A source from a URL: `file://` becomes a local path; other schemes are keyed by host (and port) and path.
      - calls [features.clone.redactUrl](features.md#features.clone.redactUrl), [features.clone.parseRepoSource](features.md#features.clone.parseRepoSource), [features.clone.keyed](features.md#features.clone.keyed)
    - fn [keyed](../../src/clone.ts#L110) (url: string, host: string, path: string) → RepoSource | { error: string } <!-- internal -->
      <a id="features.clone.keyed"></a><br>The cache key `host/…/name` of a remote repository, with a trailing `.git` dropped; every segment must be placeable.
      - calls [features.clone.redactUrl](features.md#features.clone.redactUrl), [features.clone.placeable](features.md#features.clone.placeable)
    - fn [placeable](../../src/clone.ts#L125) (segment: string) → string | undefined <!-- internal -->
      <a id="features.clone.placeable"></a><br>The segment when it is a safe directory name (not `.` or `..`), else undefined.
    - fn [cloneCacheRoot](../../src/clone.ts#L130) (env: Readonly<Record<string, string | undefined>>, home: string) → string
      <a id="features.clone.cloneCacheRoot"></a><br>`$XDG_CACHE_HOME/keylang/repos`, else `~/.cache/keylang/repos`.
    - type [CloneSync](../../src/clone.ts#L137)
      <a id="features.clone.CloneSync"></a><br>What `syncClone` did, and where.
    - fn [syncClone](../../src/clone.ts#L150) (source: RepoSource, dir: string) → CloneSync
      <a id="features.clone.syncClone"></a><br>Clones `source` into `dir`, or brings a clone keylang made there up to the remote's default branch. A directory keylang did not clone is never touched: the reset would drop its work.
      - calls [features.clone.git](features.md#features.clone.git), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [features.clone.readMarker](features.md#features.clone.readMarker), [features.clone.redactUrl](features.md#features.clone.redactUrl)
    - fn [listClones](../../src/clone.ts#L194) (cacheRoot: string, depth = 6) → { dir: string; url: string; key: string[] }[]
      <a id="features.clone.listClones"></a><br>The clones keylang made under the cache root, by their marker: their directory, the URL they were cloned from (as shown, without credentials) and their key; sorted by key. A directory with a marker is not descended into further; links are not followed.
      - calls [features.clone.readMarker](features.md#features.clone.readMarker), [features.clone.redactUrl](features.md#features.clone.redactUrl)
    - fn [readMarker](../../src/clone.ts#L226) (dir: string) → { url: string; key: string[] } | undefined <!-- internal -->
      <a id="features.clone.readMarker"></a><br>The marker of `dir`, or undefined: absent, unreadable, or behind a link out of the directory — a file elsewhere is no proof keylang cloned `dir`.
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [git](../../src/clone.ts#L250) (cwd: string, args: string[]) → void <!-- internal -->
      <a id="features.clone.git"></a><br>Run git with an argument array and no prompts; throws with git's last stderr line on failure.
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [enableExplainedMap](../../src/clone.ts#L271) (root: string) → string | null
      <a id="features.clone.enableExplainedMap"></a><br>Turns on the explained map (`"explain": {"map": true}`) in the clone's keylang.json; the rest of the file stays. Returns an error to name, or null.
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
  - module [coverage-report](../../src/coverage-report.ts#L1)
    <a id="features.coverage-report"></a><br>`keylang coverage` (business-flows/13): where keylang does not see, so a person does not take the map for the whole program. A view over the snapshot (ADR 0014), never a verdict: (1) the share of fns reachable from at least one entry point over resolved call edges, (2) fns no…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - call-sites [features.call-sites](features.md#features.call-sites)
    - discover [features.discover](features.md#features.discover)
    - json [base.json](base.md#base.json)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [DataLogicSignal](../../src/coverage-report.ts#L25) extends Matcher
      <a id="features.coverage-report.DataLogicSignal"></a><br>One kind of «logic in data» the data file names.
    - type [DataLogicSite](../../src/coverage-report.ts#L31)
      <a id="features.coverage-report.DataLogicSite"></a><br>A call or read of a configuration reader: the program's behaviour is decided by data keylang does not read.
    - type [HoleReason](../../src/coverage-report.ts#L43)
      <a id="features.coverage-report.HoleReason"></a><br>A hole reason with the names in backticks replaced by `X`, and how often it occurs.
    - type [CoverageReport](../../src/coverage-report.ts#L50)
      <a id="features.coverage-report.CoverageReport"></a><br>Everything `keylang coverage` reports, as `--json` prints it.
    - fn [loadDataLogic](../../src/coverage-report.ts#L84) (path = resourcePath("data-logic.json")) → DataLogicSignal[]
      <a id="features.coverage-report.loadDataLogic"></a><br>`resources/data-logic.json`: the configuration readers whose calls are «logic in data».
      - calls [features.call-sites.resourcePath](features.md#features.call-sites.resourcePath), [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.coverage-report.isDataLogicSignal](features.md#features.coverage-report.isDataLogicSignal)
    - fn [isDataLogicSignal](../../src/coverage-report.ts#L99) (value: JsonValue) → value is JsonObject & DataLogicSignal <!-- internal -->
      <a id="features.coverage-report.isDataLogicSignal"></a><br>The names are checked; the matcher fields come from keylang's own resource file as written.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [findDataLogic](../../src/coverage-report.ts#L104) (config: Config, snapshot: AnalysisSnapshot, signals: readonly DataLogicSignal[]) → Promise<DataLogicSite[]>
      <a id="features.coverage-report.findDataLogic"></a><br>Calls and reads of the snapshot's files that the signals match, in signal order, then file and position.
      - calls [features.call-sites.callsOf](features.md#features.call-sites.callsOf), [features.call-sites.snapshotFacts](features.md#features.call-sites.snapshotFacts), [features.call-sites.internalCallPositions](features.md#features.call-sites.internalCallPositions), [features.call-sites.placer](features.md#features.call-sites.placer), [features.call-sites.sourceReader](features.md#features.call-sites.sourceReader), [features.call-sites.compileMatcher](features.md#features.call-sites.compileMatcher), [features.call-sites.callMatches](features.md#features.call-sites.callMatches), [features.call-sites.readMatches](features.md#features.call-sites.readMatches), [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo), [features.call-sites.textMatches](features.md#features.call-sites.textMatches), [base.span.compareText](base.md#base.span.compareText)
    - fn [normaliseReason](../../src/coverage-report.ts#L147) (reason: string) → string
      <a id="features.coverage-report.normaliseReason"></a><br>A reason with every backticked name as `X`: `call through a local value \`X\``.
    - fn [holeModule](../../src/coverage-report.ts#L152) (snapshot: AnalysisSnapshot, source: string | null) → string | null <!-- internal -->
      <a id="features.coverage-report.holeModule"></a><br>The module a hole counts under: the file module of its fn or class, else its file.
    - fn [reasonList](../../src/coverage-report.ts#L168) (counts: ReadonlyMap<string, HoleReason>) → HoleReason[] <!-- internal -->
      <a id="features.coverage-report.reasonList"></a><br>Reasons by count, most first; ties by kind and text, so the order is stable.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [coverageReport](../../src/coverage-report.ts#L177) ( snapshot: AnalysisSnapshot, specified: ReadonlyMap<string, { file: string; flow: string }>, signals: readonly DataLogicSignal[], dataLogic: readonly DataLogicSite[], viewText: (file: string) => string | null, ) → CoverageReport
      <a id="features.coverage-report.coverageReport"></a><br>The report over a snapshot. `specified`: triggers the hand-written flows name; `viewText`: the text of a file of the discovered view, by its name (`<layer>.md`), or null; `dataLogic`: the sites `findDataLogic` found.
      - calls [features.call-sites.callGraph](features.md#features.call-sites.callGraph), [features.call-sites.reachable](features.md#features.call-sites.reachable), [features.call-sites.isTestFile](features.md#features.call-sites.isTestFile), [base.span.compareText](base.md#base.span.compareText), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved), [features.coverage-report.holeModule](features.md#features.coverage-report.holeModule), [features.coverage-report.normaliseReason](features.md#features.coverage-report.normaliseReason), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.coverage-report.reasonList](features.md#features.coverage-report.reasonList)
    - fn [percent](../../src/coverage-report.ts#L269) (share: number) → string <!-- internal -->
      <a id="features.coverage-report.percent"></a>
    - fn [coverageText](../../src/coverage-report.ts#L272) (report: CoverageReport, specDir = "keylang") → string
      <a id="features.coverage-report.coverageText"></a><br>What `keylang coverage` prints: the five sections, each with what to do about it.
      - calls [features.coverage-report.percent](features.md#features.coverage-report.percent)
  - module [diagram-clip](../../src/diagram-clip.ts#L1)
    <a id="features.diagram-clip"></a><br>A fragment of a diagram carried between tabs and repositories (business-flows/25). The clipboard holds one `text/plain`: the portable bundle of business-flows/26 whose ```keylang-layout``` block holds the copied shapes — no custom MIME type, which browsers do not carry between…
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - flow-bundle [features.flow-bundle](features.md#features.flow-bundle)
    - json [base.json](base.md#base.json)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - type [ClipShape](../../src/diagram-clip.ts#L31)
      <a id="features.diagram-clip.ClipShape"></a><br>One copied shape as the editor (or the viewer) sends it: a key of its canvas and a box in model coordinates.
    - type [ClipEdge](../../src/diagram-clip.ts#L52)
      <a id="features.diagram-clip.ClipEdge"></a><br>One copied line: the canvas keys of its ends.
    - type [ClipLayoutEdge](../../src/diagram-clip.ts#L61)
      <a id="features.diagram-clip.ClipLayoutEdge"></a><br>One line of the layout block, keyed by the stable keys of its ends.
    - type [ClipLayout](../../src/diagram-clip.ts#L68)
      <a id="features.diagram-clip.ClipLayout"></a><br>The layout block: shapes by stable key, edges by the stable keys of their ends.
    - type [PastedShape](../../src/diagram-clip.ts#L77) = ClipShape
      <a id="features.diagram-clip.PastedShape"></a><br>A shape as the paste answers it: its stable key (what the edges name) and the rest.
    - type [PastedEdge](../../src/diagram-clip.ts#L80)
      <a id="features.diagram-clip.PastedEdge"></a><br>A line a paste draws, between the stable keys of two pasted shapes.
    - type [PastedFragment](../../src/diagram-clip.ts#L89)
      <a id="features.diagram-clip.PastedFragment"></a><br>What a paste draws: its shapes and lines, and whether they were laid out here (the bundle had no layout block).
    - fn [round](../../src/diagram-clip.ts#L108) (value: number) → number <!-- internal -->
      <a id="features.diagram-clip.round"></a>
    - fn [finite](../../src/diagram-clip.ts#L111) (value: JsonValue | undefined) → value is number <!-- internal -->
      <a id="features.diagram-clip.finite"></a>
    - fn [short](../../src/diagram-clip.ts#L114) (value: JsonValue | undefined) → string | undefined <!-- internal -->
      <a id="features.diagram-clip.short"></a>
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [cleanId](../../src/diagram-clip.ts#L117) (value: JsonValue | undefined) → string <!-- internal -->
      <a id="features.diagram-clip.cleanId"></a><br>An ID as a shape may carry it: a dotted ID, optionally `planned:`; anything else is none.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString), [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [cleanShape](../../src/diagram-clip.ts#L125) (raw: JsonValue, key: string) → ClipShape | null <!-- internal -->
      <a id="features.diagram-clip.cleanShape"></a><br>One shape from untrusted JSON, or null: a known kind, finite numbers, short strings.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.diagram-clip.finite](features.md#features.diagram-clip.finite), [base.json.isJsonString](base.md#base.json.isJsonString), [features.diagram-clip.cleanId](features.md#features.diagram-clip.cleanId), [features.diagram-clip.short](features.md#features.diagram-clip.short), [lang.parser.isId](lang.md#lang.parser.isId), [features.diagram-clip.round](features.md#features.diagram-clip.round)
    - fn [cleanPoints](../../src/diagram-clip.ts#L168) (raw: JsonValue | undefined) → { x: number; y: number }[] | undefined <!-- internal -->
      <a id="features.diagram-clip.cleanPoints"></a><br>Edge waypoints from untrusted JSON: finite numbers only, at most 100.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.diagram-clip.finite](features.md#features.diagram-clip.finite), [features.diagram-clip.round](features.md#features.diagram-clip.round)
    - fn [parseClipSelection](../../src/diagram-clip.ts#L176) (shapesRaw: JsonValue | undefined, edgesRaw: JsonValue | undefined) → { shapes: ClipShape[]; edges: ClipEdge[] } | string
      <a id="features.diagram-clip.parseClipSelection"></a><br>The shapes and edges of a request body (`{shapes, edges}`), or what is wrong with them.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.diagram-clip.cleanShape](features.md#features.diagram-clip.cleanShape), [features.diagram-clip.short](features.md#features.diagram-clip.short), [features.diagram-clip.cleanPoints](features.md#features.diagram-clip.cleanPoints)
    - fn [baseKey](../../src/diagram-clip.ts#L216) (shape: ClipShape) → string <!-- internal -->
      <a id="features.diagram-clip.baseKey"></a><br>The stable key of a copied shape, as a layout file keys it: a note by its own key, the rest by what it says.
      - calls [map.diagram-layout.shapeBase](map.md#map.diagram-layout.shapeBase)
    - fn [clipLayout](../../src/diagram-clip.ts#L227) (view: string, shapes: readonly ClipShape[], edges: readonly ClipEdge[]) → ClipLayout
      <a id="features.diagram-clip.clipLayout"></a><br>The layout block of a selection: shapes by stable key, places relative to the fragment's top-left, edges between copied shapes only, by the stable keys of their ends. Deterministic: the same selection gives the same text.
      - calls [base.span.compareText](base.md#base.span.compareText), [map.diagram-layout.twinsApart](map.md#map.diagram-layout.twinsApart), [features.diagram-clip.baseKey](features.md#features.diagram-clip.baseKey), [features.diagram-clip.round](features.md#features.diagram-clip.round)
    - fn [sorted](../../src/diagram-clip.ts#L270) (value: JsonValue) → JsonValue <!-- internal -->
      <a id="features.diagram-clip.sorted"></a><br>A JSON value with every object's keys sorted, recursively: stable text for the same layout.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.span.compareText](base.md#base.span.compareText)
    - fn [clipLayoutText](../../src/diagram-clip.ts#L279) (layout: ClipLayout) → string
      <a id="features.diagram-clip.clipLayoutText"></a><br>The block's text: JSON with sorted keys, two-space indent, no fence it could close (`` ` `` never stays raw).
      - calls [features.diagram-clip.sorted](features.md#features.diagram-clip.sorted), [base.json.parseJson](base.md#base.json.parseJson)
    - fn [parseClipLayout](../../src/diagram-clip.ts#L288) (text: string) → ClipLayout | null
      <a id="features.diagram-clip.parseClipLayout"></a><br>The layout block of a bundle read leniently: null when it is empty or no layout; a shape or an edge of the wrong form is left out.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.diagram-clip.finite](features.md#features.diagram-clip.finite), [base.json.isJsonString](base.md#base.json.isJsonString), [features.diagram-clip.cleanShape](features.md#features.diagram-clip.cleanShape), [features.diagram-clip.edgeEnds](features.md#features.diagram-clip.edgeEnds), [features.diagram-clip.short](features.md#features.diagram-clip.short), [features.diagram-clip.cleanPoints](features.md#features.diagram-clip.cleanPoints)
    - fn [edgeEnds](../../src/diagram-clip.ts#L328) (key: string, shapes: ClipLayout["shapes"]) → [string, string] | null <!-- internal -->
      <a id="features.diagram-clip.edgeEnds"></a><br>The two ends of a layout edge key.
    - fn [fragmentFlow](../../src/diagram-clip.ts#L348) (name: string, shapes: readonly ClipShape[]) → string | null
      <a id="features.diagram-clip.fragmentFlow"></a><br>The flow of a selection that is no flow view: `# flow <name>` with the selection's trigger (a start shape) and its named shapes as steps, left to right; a drawn shape is declared `planned` with its kind and signature.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [fragmentName](../../src/diagram-clip.ts#L379) (shapes: readonly ClipShape[]) → string
      <a id="features.diagram-clip.fragmentName"></a><br>A flow name from a selection: the first named shape's last segment and `-fragment`.
    - fn [pastedShapes](../../src/diagram-clip.ts#L394) (bundle: Bundle, ids: readonly { from: string; to: string; planned: boolean }[], choices: readonly LayerChoice[]) → PastedFragment
      <a id="features.diagram-clip.pastedShapes"></a><br>The shapes a paste draws, with IDs re-homed: an ID the import mapped takes its target (`planned:` when the target lacks it); any other ID takes the mapped layer as its first segment and is planned. `ids` and `choices` empty: the IDs as they are (a paste into the same repository…
      - calls [features.diagram-clip.parseClipLayout](features.md#features.diagram-clip.parseClipLayout), [features.diagram-clip.edgeEnds](features.md#features.diagram-clip.edgeEnds), [features.diagram-clip.flowOrder](features.md#features.diagram-clip.flowOrder)
    - fn [flowOrder](../../src/diagram-clip.ts#L505) (bundle: Bundle, flow: string, text: string) → string[] <!-- internal -->
      <a id="features.diagram-clip.flowOrder"></a><br>The IDs a flow names, in order (`flowIds` of the bundle module would parse again; the nodes table keeps the order of first mention).
      - calls [lang.parser.isId](lang.md#lang.parser.isId)
  - module [diagram-proposal](../../src/diagram-proposal.ts#L1)
    <a id="features.diagram-proposal"></a><br>What a drawing in the editor of `keylang web` asks of the specs (business-flows/24): the canvas (`window.keylangEditor.currentModel()`) compared with the diagram of the same view, as the text each spec would have. Pure: the files come in through `read`, the result is the full…
    - config [base.config](base.md#base.config)
    - drawio [map.drawio](map.md#map.drawio)
    - draft [features.draft](features.md#features.draft)
    - json [base.json](base.md#base.json)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [EditorNode](../../src/diagram-proposal.ts#L41)
      <a id="features.diagram-proposal.EditorNode"></a><br>One shape of the editor's canvas, as `currentModel()` gives it (web/src/editor.ts).
    - type [EditorEdge](../../src/diagram-proposal.ts#L62)
      <a id="features.diagram-proposal.EditorEdge"></a><br>One connection of the canvas, between two shape keys.
    - type [EditorLane](../../src/diagram-proposal.ts#L72)
      <a id="features.diagram-proposal.EditorLane"></a><br>One lane of the canvas: a layer (or a drawn `planned:` one) and its box.
    - type [EditorModel](../../src/diagram-proposal.ts#L83)
      <a id="features.diagram-proposal.EditorModel"></a><br>The whole canvas of one view.
    - fn [finite](../../src/diagram-proposal.ts#L95) (value: JsonValue | undefined) → value is number <!-- internal -->
      <a id="features.diagram-proposal.finite"></a>
      - calls [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - type [Box](../../src/diagram-proposal.ts#L97) = Pick<EditorNode, "x" | "y" | "w" | "h"> <!-- internal -->
      <a id="features.diagram-proposal.Box"></a>
    - fn [boxOf](../../src/diagram-proposal.ts#L100) (item: JsonObject) → Box | null <!-- internal -->
      <a id="features.diagram-proposal.boxOf"></a><br>x, y, w and h of a shape or lane, when all four are finite numbers.
      - calls [features.diagram-proposal.finite](features.md#features.diagram-proposal.finite)
    - fn [parseEditorModel](../../src/diagram-proposal.ts#L107) (value: JsonValue | undefined) → EditorModel | string
      <a id="features.diagram-proposal.parseEditorModel"></a><br>The editor's model from JSON, or what is wrong with it.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.diagram-proposal.boxOf](features.md#features.diagram-proposal.boxOf)
    - type [BaseDiagram](../../src/diagram-proposal.ts#L163)
      <a id="features.diagram-proposal.BaseDiagram"></a><br>The diagram of the view as `diagramOf` drew it: what the canvas is compared with.
    - type [ChangeInput](../../src/diagram-proposal.ts#L169)
      <a id="features.diagram-proposal.ChangeInput"></a><br>Everything `diagramChanges` compares and reads: the canvas, the drawn diagram, the specs and a file reader.
    - type [ChangedTarget](../../src/diagram-proposal.ts#L186)
      <a id="features.diagram-proposal.ChangedTarget"></a><br>The full new text of one spec, and the shapes of the canvas it came from.
    - type [DiagramChanges](../../src/diagram-proposal.ts#L195)
      <a id="features.diagram-proposal.DiagramChanges"></a><br>The proposal: the changed spec texts, a keylang.json to print, and notes on what could not be written.
    - fn [strip](../../src/diagram-proposal.ts#L203) (id: string) → string <!-- internal -->
      <a id="features.diagram-proposal.strip"></a>
    - fn [flowNameOf](../../src/diagram-proposal.ts#L220) (id: string) → string <!-- internal -->
      <a id="features.diagram-proposal.flowNameOf"></a><br>A flow name from a trigger's ID: its last segment, what a name cannot hold as `-`.
    - module [Targets](../../src/diagram-proposal.ts#L227) <!-- internal -->
      <a id="features.diagram-proposal.Targets"></a><br>Collects edits per target: each starts from the file on disk and takes edits in turn.
      - fn [constructor](../../src/diagram-proposal.ts#L230) (read: (path: string) => string | null)
        <a id="features.diagram-proposal.Targets.constructor"></a>
      - fn [current](../../src/diagram-proposal.ts#L234) (target: string) → string | null
        <a id="features.diagram-proposal.Targets.current"></a>
      - fn [set](../../src/diagram-proposal.ts#L245) (target: string, text: string, shapes: Iterable<string> = []) → void
        <a id="features.diagram-proposal.Targets.set"></a>
        - calls [features.diagram-proposal.Targets.current](features.md#features.diagram-proposal.Targets.current)
      - fn [changed](../../src/diagram-proposal.ts#L253) () → ChangedTarget[]
        <a id="features.diagram-proposal.Targets.changed"></a>
        - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [replaceSection](../../src/diagram-proposal.ts#L262) (own: string, section: { text: string; firstLine: number }, edited: string) → string <!-- internal -->
      <a id="features.diagram-proposal.replaceSection"></a><br>The section of a flow in the text of its file replaced, the rest byte for byte (CRLF kept).
    - fn [appendToList](../../src/diagram-proposal.ts#L272) (section: string, added: readonly string[]) → string <!-- internal -->
      <a id="features.diagram-proposal.appendToList"></a><br>Lines added at the end of a flow section's list (after its last list line), as more of the list.
    - fn [withContinues](../../src/diagram-proposal.ts#L296) (section: string, from: string) → string <!-- internal -->
      <a id="features.diagram-proposal.withContinues"></a><br>`- continues <flow>` as the first list line of a section (once).
      - calls [features.diagram-proposal.appendToList](features.md#features.diagram-proposal.appendToList)
    - fn [diagramChanges](../../src/diagram-proposal.ts#L312) (input: ChangeInput) → DiagramChanges
      <a id="features.diagram-proposal.diagramChanges"></a><br>The texts the drawing asks for. `model` is the canvas, `diagram` the view as the code and the specs draw it now; nothing is read but through `read`.
      - calls [features.diagram-proposal.Targets](features.md#features.diagram-proposal.Targets), [features.diagram-proposal.strip](features.md#features.diagram-proposal.strip), [features.diagram-proposal.flowNameOf](features.md#features.diagram-proposal.flowNameOf), [features.diagram-proposal.Targets.current](features.md#features.diagram-proposal.Targets.current), [map.drawio.flowSection](map.md#map.drawio.flowSection), [map.drawio.flowFromDrawio](map.md#map.drawio.flowFromDrawio), [features.diagram-proposal.appendToList](features.md#features.diagram-proposal.appendToList), [features.diagram-proposal.Targets.set](features.md#features.diagram-proposal.Targets.set), [features.diagram-proposal.replaceSection](features.md#features.diagram-proposal.replaceSection), [features.draft.withFlow](features.md#features.draft.withFlow), [features.diagram-proposal.withContinues](features.md#features.diagram-proposal.withContinues), [base.span.compareText](base.md#base.span.compareText), [features.draft.withRules](features.md#features.draft.withRules), [features.diagram-proposal.globFor](features.md#features.diagram-proposal.globFor), [base.config.withLayers](base.md#base.config.withLayers), [features.diagram-proposal.Targets.changed](features.md#features.diagram-proposal.Targets.changed)
    - fn [globFor](../../src/diagram-proposal.ts#L617) (layer: string, layers: Readonly<Record<string, readonly string[]>>) → string <!-- internal -->
      <a id="features.diagram-proposal.globFor"></a><br>A glob for a new layer like the others' (`src/<layer>/**` when they are `src/<their name>/**`), else `src/<layer>/**`.
  - module [discover-names](../../src/discover-names.ts#L1)
    <a id="features.discover-names"></a><br>Business names of discovered flows (business-flows/12): a model groups the flows of one layer into business processes — name, a few sentences, a domain, the entities in and out, the flows that belong to it — in one request per layer group, never per flow. Offline first: each…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diagram [map.diagram](map.md#map.diagram)
    - discover [features.discover](features.md#features.discover)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - json [base.json](base.md#base.json)
    - llm [features.llm](features.md#features.llm)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - type [NameMode](../../src/discover-names.ts#L37) = (typeof NAME_MODES)[number]
      <a id="features.discover-names.NameMode"></a><br>One `--names` mode.
    - fn [isNameMode](../../src/discover-names.ts#L40) (value: string) → value is NameMode
      <a id="features.discover-names.isNameMode"></a><br>Whether `value` is a valid `--names` mode.
    - type [BusinessProcess](../../src/discover-names.ts#L54)
      <a id="features.discover-names.BusinessProcess"></a><br>One business process as saved in the README.
    - type [NameGroup](../../src/discover-names.ts#L72)
      <a id="features.discover-names.NameGroup"></a><br>The flows of one layer: one request.
    - fn [nameGroups](../../src/discover-names.ts#L78) (flows: readonly DiscoveredFlow[]) → NameGroup[]
      <a id="features.discover-names.nameGroups"></a><br>The flows of the discovery by the layer of their trigger, layers and flows sorted.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [processBaseline](../../src/discover-names.ts#L92) (snapshot: AnalysisSnapshot, flows: readonly Pick<DiscoveredFlow, "name" | "steps">[]) → string
      <a id="features.discover-names.processBaseline"></a><br>The baseline of a process: a hash of every step of its flows with the baseline of an explanation of that step (`snapshotBaseline`, the closure fingerprint of a fn). A step's code changing, a step added or gone, makes it differ.
      - calls [base.span.compareText](base.md#base.span.compareText), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline)
    - fn [isStaleProcess](../../src/discover-names.ts#L102) (snapshot: AnalysisSnapshot, byName: ReadonlyMap<string, DiscoveredFlow>, process: BusinessProcess) → boolean
      <a id="features.discover-names.isStaleProcess"></a><br>A saved process whose flows are gone or whose baseline changed.
      - calls [features.discover-names.processBaseline](features.md#features.discover-names.processBaseline)
    - type [NamesPlan](../../src/discover-names.ts#L116)
      <a id="features.discover-names.NamesPlan"></a><br>What a `--names` run asks: the groups, and the saved processes that are stale.
    - fn [planNames](../../src/discover-names.ts#L126) (snapshot: AnalysisSnapshot, flows: readonly DiscoveredFlow[], saved: readonly BusinessProcess[], options: { stale: boolean; layer?: string; limit?: number }) → NamesPlan
      <a id="features.discover-names.planNames"></a><br>The groups to ask for: with `stale`, only the layers of stale processes; otherwise also every layer with a flow no fresh process has. `layer` narrows to one layer, `limit` keeps the first groups.
      - calls [features.discover-names.isStaleProcess](features.md#features.discover-names.isStaleProcess), [features.discover-names.nameGroups](features.md#features.discover-names.nameGroups)
    - fn [namesRequest](../../src/discover-names.ts#L149) (snapshot: AnalysisSnapshot, group: NameGroup, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.discover-names.namesRequest"></a><br>The request for one layer group: each flow with its entry point, trigger, offline description and its steps with what the explained map says about them (doc comments, briefs). The answer is JSON.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - type [NameTokenEstimate](../../src/discover-names.ts#L187)
      <a id="features.discover-names.NameTokenEstimate"></a><br>Tokens the requests are expected to send and receive.
    - fn [estimateNameTokens](../../src/discover-names.ts#L193) (requests: readonly LlmRequest[]) → NameTokenEstimate
      <a id="features.discover-names.estimateNameTokens"></a><br>A rough size of the requests for `--dry-run`: about four characters a token, about 300 tokens out per process group.
    - type [AnsweredProcess](../../src/discover-names.ts#L200)
      <a id="features.discover-names.AnsweredProcess"></a><br>One process of an answer, checked: what is saved without the provenance.
    - fn [parseNamesAnswer](../../src/discover-names.ts#L209) (snapshot: AnalysisSnapshot, group: NameGroup, answer: string) → { processes: AnsweredProcess[]; dropped: string[]; unknownIds: string[] } | { error: string }
      <a id="features.discover-names.parseNamesAnswer"></a><br>The model's answer for `group`, checked: flow names the group does not have are dropped (`dropped`), a flow named twice stays with its first process, a process left without flows is dropped; `unknownIds` are the IDs in backticks it mentions that the snapshot does not have. Not…
      - calls [features.discover-names.jsonOf](features.md#features.discover-names.jsonOf), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.discover-names.oneLine](features.md#features.discover-names.oneLine), [base.json.isJsonString](base.md#base.json.isJsonString), [features.discover-names.entities](features.md#features.discover-names.entities), [base.span.compareText](base.md#base.span.compareText), [features.discover-names.unknownIdsIn](features.md#features.discover-names.unknownIdsIn)
    - fn [unknownIdsIn](../../src/discover-names.ts#L262) (snapshot: AnalysisSnapshot, text: string) → string[] <!-- internal -->
      <a id="features.discover-names.unknownIdsIn"></a><br>`` `a.b.c` `` in `text` whose first segment is a layer of the snapshot and which the snapshot does not have.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [jsonOf](../../src/discover-names.ts#L277) (answer: string) → JsonValue | undefined <!-- internal -->
      <a id="features.discover-names.jsonOf"></a><br>The JSON in a model answer: strip a code fence, then parse from the first `{`/`[` to the last `}`/`]`; undefined when none parses.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
    - fn [oneLine](../../src/discover-names.ts#L292) (value: JsonValue | undefined) → string <!-- internal -->
      <a id="features.discover-names.oneLine"></a><br>A string of the answer on one line, without a comment it could open.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [entities](../../src/discover-names.ts#L297) (value: JsonValue | undefined) → string[] <!-- internal -->
      <a id="features.discover-names.entities"></a><br>Entities as the README lists them: one line each, no `, ` inside (the list's separator).
      - calls [features.discover-names.oneLine](features.md#features.discover-names.oneLine)
    - fn [flowAnchor](../../src/discover-names.ts#L304) (name: string) → string
      <a id="features.discover-names.flowAnchor"></a><br>GitHub's anchor of a `# flow <name>` heading.
    - fn [domainOrder](../../src/discover-names.ts#L315) (a: string, b: string) → number <!-- internal -->
      <a id="features.discover-names.domainOrder"></a><br>Domains in the README's order: the known ones, then others by name, `Інше` last.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [renderProcesses](../../src/discover-names.ts#L327) (processes: readonly BusinessProcess[], fileOf: (flow: string) => string | null) → string
      <a id="features.discover-names.renderProcesses"></a><br>The README of the view: domain → process → flows, each process under its provenance, with its description, entities and links to its flows in the layer files. The same processes give the same bytes.
      - calls [features.discover-names.domainOrder](features.md#features.discover-names.domainOrder), [base.span.compareText](base.md#base.span.compareText), [features.discover.proseLine](features.md#features.discover.proseLine), [features.discover-names.flowAnchor](features.md#features.discover-names.flowAnchor)
    - fn [parseProcesses](../../src/discover-names.ts#L357) (text: string) → BusinessProcess[]
      <a id="features.discover-names.parseProcesses"></a><br>The processes of a README `renderProcesses` wrote; a file without the generated marker has none.
      - calls [features.discover.unproseLine](features.md#features.discover.unproseLine)
    - fn [processesPath](../../src/discover-names.ts#L397) (specDir: string) → string
      <a id="features.discover-names.processesPath"></a><br>The README's path relative to the root.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [readProcesses](../../src/discover-names.ts#L402) (root: string, specDir: string) → BusinessProcess[]
      <a id="features.discover-names.readProcesses"></a><br>The processes saved under `<dir>/flows-discovered/README.md` of `root`; none without the file.
      - calls [features.discover-names.processesPath](features.md#features.discover-names.processesPath), [features.discover-names.parseProcesses](features.md#features.discover-names.parseProcesses)
    - fn [processViews](../../src/discover-names.ts#L413) (snapshot: AnalysisSnapshot, spec: SpecIR, processes: readonly BusinessProcess[]) → DiagramProcess[]
      <a id="features.discover-names.processViews"></a><br>The saved processes as the diagram draws them: each flow found again in a fresh discovery, with its trigger and the steps right under it; a flow no longer discovered is left out, and a process left without flows too.
      - calls [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers), [features.discover.firstLevelSteps](features.md#features.discover.firstLevelSteps)
  - module [discover](../../src/discover.ts#L1)
    <a id="features.discover"></a><br>`keylang flows discover` and `keylang flows adopt` (business-flows/11): a flow draft for every entry point of the snapshot, `draftFlow` from the entry's fn, as a generated view `<dir>/flows-discovered/<layer>.md` (ADR 0014: a view, not a spec — `check` does not read it). A…
    - brief [base.brief](base.md#base.brief)
    - draft [features.draft](features.md#features.draft)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [DiscoverOptions](../../src/discover.ts#L27)
      <a id="features.discover.DiscoverOptions"></a><br>Filters and limits of `flows discover`.
    - type [DiscoveredFlow](../../src/discover.ts#L39)
      <a id="features.discover.DiscoveredFlow"></a><br>One discovered flow: the draft of one entry point's fn.
    - type [Discovery](../../src/discover.ts#L58)
      <a id="features.discover.Discovery"></a><br>The result of one discovery: the drafted flows, what was skipped and why, and the view's files.
    - fn [specifiedTriggers](../../src/discover.ts#L73) (flows: readonly Flow[]) → Map<string, { file: string; flow: string }>
      <a id="features.discover.specifiedTriggers"></a><br>Each trigger the hand-written flows name, with the first flow (by file, then name) that names it. A `trigger event <id>` flow also names the subscribers it starts from: the steps right under it (ADR 0023 п. 1).
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [observedEvent](../../src/discover.ts#L101) (snapshot: AnalysisSnapshot, entry: EntryPoint) → string | null <!-- internal -->
      <a id="features.discover.observedEvent"></a><br>The event an `observer` entry point subscribes its fn to: the event node whose observer edge targets the fn at the entry's config line. Null when the snapshot has no such edge (an adapter that gives no event nodes).
    - fn [discoverFlows](../../src/discover.ts#L120) (snapshot: AnalysisSnapshot, specified: ReadonlyMap<string, { file: string; flow: string }>, options: DiscoverOptions = {}) → Discovery
      <a id="features.discover.discoverFlows"></a><br>The flows of the view: one draft per fn an entry point names (the first entry of a fn, in the snapshot's order, labels it), names kept apart as `code-to-spec` keeps them, grouped by the trigger's layer, flows of a file by name. The same snapshot and specs give the same bytes.
      - calls [features.draft.distinctNames](features.md#features.draft.distinctNames), [features.discover.observedEvent](features.md#features.discover.observedEvent), [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.discover.holesBySource](features.md#features.discover.holesBySource), [features.discover.offlineDescription](features.md#features.discover.offlineDescription), [features.discover.firstLevelSteps](features.md#features.discover.firstLevelSteps), [features.discover.withComment](features.md#features.discover.withComment), [features.discover.quoted](features.md#features.discover.quoted), [base.span.compareText](base.md#base.span.compareText)
    - fn [adoptedFlow](../../src/discover.ts#L206) (flow: DiscoveredFlow, specDir: string) → FlowDraft
      <a id="features.discover.adoptedFlow"></a><br>The draft `flows adopt` proposes: the discovered flow with its comment turned into provenance — `adopted`, and the view's file it came from.
    - fn [discoverySummary](../../src/discover.ts#L215) (discovery: Pick<Discovery, "flows" | "specified">) → string
      <a id="features.discover.discoverySummary"></a><br>`discovered N flows (M already specified), K with blind spots`.
    - fn [holesBySource](../../src/discover.ts#L222) (snapshot: AnalysisSnapshot) → Map<string, number> <!-- internal -->
      <a id="features.discover.holesBySource"></a><br>The unresolved and dynamic calls of each fn: what `draftFlow` writes as an `unresolved` comment.
    - fn [withComment](../../src/discover.ts#L235) (text: string, comment: string, described: { text: string; ids: string[] } | null = null) → string <!-- internal -->
      <a id="features.discover.withComment"></a><br>The draft with an HTML comment as its own paragraph under the heading, then the description with its provenance.
      - calls [features.discover.proseLine](features.md#features.discover.proseLine)
    - fn [firstLevelSteps](../../src/discover.ts#L247) (draftText: string) → string[]
      <a id="features.discover.firstLevelSteps"></a><br>IDs of the steps right under the trigger of a draft (` - step <id>`), in order; under `trigger event`, the steps of its subscriber, which is the one step under the trigger (` - step <id>`).
    - fn [offlineDescription](../../src/discover.ts#L265) (snapshot: AnalysisSnapshot, trigger: string, steps: readonly string[]) → { text: string; ids: string[] } | null
      <a id="features.discover.offlineDescription"></a><br>What a discovered flow does, in the words of the code (business-flows/12, offline first): the trigger's doc comment (a JSDoc, docblock, Python docstring or Rust doc comment, as the snapshot keeps it in `doc`), then the first sentence of the doc of each step right under it.…
      - calls [base.brief.firstSentence](base.md#base.brief.firstSentence)
    - fn [proseLine](../../src/discover.ts#L295) (text: string) → string
      <a id="features.discover.proseLine"></a><br>One line of prose that opens no block and hides nothing: `<` outside code is `&lt;`, `-->` is `--&gt;`, a start that would be a list item, heading, quote or fence is escaped with a backslash.
    - fn [unproseLine](../../src/discover.ts#L312) (line: string) → string
      <a id="features.discover.unproseLine"></a><br>The text of `proseLine` back: the escape and the entities undone.
    - fn [quoted](../../src/discover.ts#L323) (label: string) → string <!-- internal -->
      <a id="features.discover.quoted"></a><br>A label inside `"…"` of a comment: no double quote, no `-->`.
  - module [draft-llm](../../src/draft-llm.ts#L1)
    <a id="features.draft-llm"></a><br>`draft flow --mode llm|hybrid` (design §5.1): the model proposes a flow from a compact map, the flow grammar and flows of this repository; an ID that is neither in the snapshot nor declared `planned` sends the draft back once with the nearest real IDs. The answer is reconciled…
    - analyze [map.analyze](map.md#map.analyze)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - draft [features.draft](features.md#features.draft)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - json [base.json](base.md#base.json)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [DraftStatus](../../src/draft-llm.ts#L27) = "agree" | "llm-only" | "algo-only" | "conflict"
      <a id="features.draft-llm.DraftStatus"></a><br>How a drafted item relates to the algo projection: both have it, only one has it, or the snapshot contradicts it.
    - type [ModelDraft](../../src/draft-llm.ts#L30)
      <a id="features.draft-llm.ModelDraft"></a><br>A model-drafted flow after reconciliation, with per-status counts and what was dropped or left unknown.
    - fn [draftFlowWithModel](../../src/draft-llm.ts#L56) (analysis: Analysis, trigger: string, client: LlmClient, mode: "llm" | "hybrid", name?: string, context?: string, options: LlmCallOptions = {}) → Promise<ModelDraft>
      <a id="features.draft-llm.draftFlowWithModel"></a><br>`context`: the pack from the TUI context panel, sent as it is shown; `options.signal` cancels the model's rounds.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft-llm.compactMap](features.md#features.draft-llm.compactMap), [features.draft-llm.similarFlows](features.md#features.draft-llm.similarFlows), [features.draft-llm.flowText](features.md#features.draft-llm.flowText), [features.draft-llm.unknownIn](features.md#features.draft-llm.unknownIn), [features.draft-llm.reconcile](features.md#features.draft-llm.reconcile)
    - type [ReconciledDraft](../../src/draft-llm.ts#L99) <!-- internal -->
      <a id="features.draft-llm.ReconciledDraft"></a><br>The model's draft merged with the algo projection: its text, the items by status, and the answer's lines left out.
    - fn [reconcile](../../src/draft-llm.ts#L114) (analysis: Analysis, text: string, algo: { text: string; steps: readonly string[] }, trigger: string, mode: "llm" | "hybrid", agent: string) → ReconciledDraft <!-- internal -->
      <a id="features.draft-llm.reconcile"></a><br>The model's flow judged on its IR. An item with a parse error other than indentation (a step under an `invariant`, an unknown keyword) is dropped; the requested trigger is added when the answer lacks it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft-llm.reachability](features.md#features.draft-llm.reachability), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [features.draft-llm.algoItem](features.md#features.draft-llm.algoItem), [features.draft-llm.algoCallers](features.md#features.draft-llm.algoCallers), [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [algoItem](../../src/draft-llm.ts#L196) (kind: "trigger" | "step", id: string) → Node <!-- internal -->
      <a id="features.draft-llm.algoItem"></a><br>One provenance-marked item of the algo projection, as the parser reads it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [algoCallers](../../src/draft-llm.ts#L203) (text: string) → [string, string[]][] <!-- internal -->
      <a id="features.draft-llm.algoCallers"></a><br>Each step of the algo draft (preorder) with its callers there, nearest first.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [reachability](../../src/draft-llm.ts#L223) (nodes: NonNullable<Analysis["snapshot"]>["nodes"]) → (from: string, to: string) => boolean <!-- internal -->
      <a id="features.draft-llm.reachability"></a><br>Whether `from` reaches `to` through resolved calls of the snapshot, as a static step proof would.
    - fn [flowText](../../src/draft-llm.ts#L254) (answer: string, name: string) → string <!-- internal -->
      <a id="features.draft-llm.flowText"></a><br>The flow section of an answer: the first fenced block (or the whole answer), under the requested heading. An ID written as code in an item (`` - step `a.b` ``, which the prompt's own examples invite) is the ID.
      - calls [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [unknownIn](../../src/draft-llm.ts#L272) (analysis: Analysis, text: string) → string[] <!-- internal -->
      <a id="features.draft-llm.unknownIn"></a><br>Referenced IDs that are neither snapshot nodes nor `planned` in the draft or the specs.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [compactMap](../../src/draft-llm.ts#L294) (analysis: Analysis, steps: readonly string[]) → string <!-- internal -->
      <a id="features.draft-llm.compactMap"></a><br>The fns the draft can reach, then the rest of their modules; at most 300 lines, which the prompt says.
    - fn [similarFlows](../../src/draft-llm.ts#L307) (docs: readonly Document[], steps: readonly string[]) → string[] <!-- internal -->
      <a id="features.draft-llm.similarFlows"></a><br>Up to three hand-written flows, those sharing most IDs with the draft first.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.draft-llm.lineTree](features.md#features.draft-llm.lineTree)
    - fn [lineTree](../../src/draft-llm.ts#L335) (node: Pick<Node, "tokens" | "children">, level: number) → string[] <!-- internal -->
      <a id="features.draft-llm.lineTree"></a><br>A node and its children as indented list lines, two spaces per level.
    - type [RulesDraft](../../src/draft-llm.ts#L344)
      <a id="features.draft-llm.RulesDraft"></a><br>A model-drafted rules section, with per-status counts and the evidence of each conflict.
    - fn [draftRulesWithModel](../../src/draft-llm.ts#L358) (analysis: Analysis, client: LlmClient, mode: "llm" | "hybrid", algoText: string, target: string, options: LlmCallOptions = {}) → Promise<RulesDraft>
      <a id="features.draft-llm.draftRulesWithModel"></a><br>`draft rules --mode llm|hybrid`: the model proposes rules from the layer dependencies; each is checked at once against the current snapshot, alone, as `check` would: `agree` when it holds, `conflict` when the code breaks it (with the edge), `llm-only` when the evidence is not…
      - calls [features.draft-llm.judgeRule](features.md#features.draft-llm.judgeRule)
    - fn [judgeRule](../../src/draft-llm.ts#L416) (analysis: Analysis, others: readonly Document[], target: string, rule: string, conflicts: string[]) → DraftStatus <!-- internal -->
      <a id="features.draft-llm.judgeRule"></a><br>One rule, checked alone against the snapshot: what it adds to a check without it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [base.config.resolveStatic](base.md#base.config.resolveStatic), [check.assess.assess](check.md#check.assess.assess)
    - fn [draftLayoutWithModel](../../src/draft-llm.ts#L466) (analysis: Analysis, client: LlmClient, files: readonly string[], options: LlmCallOptions = {}) → Promise<Record<string, string[]>>
      <a id="features.draft-llm.draftLayoutWithModel"></a><br>`draft map --mode llm|hybrid`: the model proposes layers (name → globs), validated as `keylang.json` would be. Never written: layers are never assigned without a person (design §5.1 p.4) — the CLI prints them, the TUI moves them into the config buffer on an explicit action.
      - calls [features.draft-llm.answerObject](features.md#features.draft-llm.answerObject), [base.config.parseConfig](base.md#base.config.parseConfig)
    - fn [answerObject](../../src/draft-llm.ts#L488) (answer: string) → JsonObject | null
      <a id="features.draft-llm.answerObject"></a><br>The JSON object a model answered with: the first ```json block that holds one, else the first balanced `{…}` of the answer that parses as one (a brace in a JSON string does not count); null when there is none. Prose around it and a second object after it are left out.
      - calls [features.draft-llm.jsonObject](features.md#features.draft-llm.jsonObject), [features.draft-llm.balancedEnd](features.md#features.draft-llm.balancedEnd)
    - fn [jsonObject](../../src/draft-llm.ts#L508) (text: string) → JsonObject | null <!-- internal -->
      <a id="features.draft-llm.jsonObject"></a><br>`text` as a JSON object, or null: not JSON, or JSON of another shape.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [balancedEnd](../../src/draft-llm.ts#L521) (text: string, start: number) → number | null <!-- internal -->
      <a id="features.draft-llm.balancedEnd"></a><br>Where the `{` at `start` closes (the index after its `}`), skipping JSON strings; null when it never does.
  - module [draft](../../src/draft.ts#L1)
    <a id="features.draft"></a><br>`keylang draft flow <trigger> --mode algo`: the deterministic projection of a flow from the snapshot's call edges (design §5, §5.3). Each resolved call to a function of the repository becomes a nested `step`, in the order the code writes them; a function already listed is not…
    - config [base.config](base.md#base.config)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - type [FlowDraft](../../src/draft.ts#L20)
      <a id="features.draft.FlowDraft"></a><br>One drafted flow: its name, its Markdown section and its step IDs.
    - type [DraftFlowOptions](../../src/draft.ts#L29)
      <a id="features.draft.DraftFlowOptions"></a><br>How `draftFlow` names and bounds a draft.
    - fn [draftFlow](../../src/draft.ts#L41) (snapshot: AnalysisSnapshot, trigger: string, options: DraftFlowOptions = {}) → FlowDraft
      <a id="features.draft.draftFlow"></a><br>`entry`: the kind of entry point the trigger is (`trigger route <id>`). `event`: the event whose subscriber the trigger is (ADR 0023 п. 1): the draft starts with `trigger event <event>` and the fn is its first step.
    - fn [draftFlowFromTrace](../../src/draft.ts#L119) (snapshot: AnalysisSnapshot, run: TraceRun, options: { name?: string } = {}) → FlowDraft & { rest: string[] }
      <a id="features.draft.draftFlowFromTrace"></a><br>`draft flow --from-trace`: a flow from what one trace run observed. The first root span (in start order) is the trigger; nesting is the span tree, order among siblings is start order (`seq` on one clock, else `ts`).
      - calls [features.draft.reachesByCalls](features.md#features.draft.reachesByCalls)
    - fn [reachesByCalls](../../src/draft.ts#L159) (snapshot: AnalysisSnapshot, from: string, to: string) → boolean <!-- internal -->
      <a id="features.draft.reachesByCalls"></a><br>A path of resolved calls (the snapshot's `calls`) from `from` to `to`.
    - fn [withFlow](../../src/draft.ts#L184) (existing: string | null, draft: Pick<FlowDraft, "name" | "text">) → string
      <a id="features.draft.withFlow"></a><br>A spec with the draft added: the section of the same flow is replaced, whatever follows the name on its heading line, otherwise the draft is appended. Sections come from the parser, so a `# ` line in a code block is not a heading.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings)
    - fn [withRules](../../src/draft.ts#L212) (existing: string | null, draftText: string) → string
      <a id="features.draft.withRules"></a><br>`draft rules` into an existing spec: the drafted rules go at the end of its last `# rules` section, or into a new `# rules` section at the end, never under a trailing `# flow`. A rule the file already has (comments aside) is not repeated.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings)
    - fn [nextHeading](../../src/draft.ts#L253) (sections: readonly { heading: { span: { start: { line: number } } } | null }[], index: number) → number | null <!-- internal -->
      <a id="features.draft.nextHeading"></a><br>0-based line index of the heading after `sections[index]`, or null at the end of the file.
    - fn [distinctNames](../../src/draft.ts#L264) (drafts: readonly FlowDraft[]) → FlowDraft[]
      <a id="features.draft.distinctNames"></a><br>Flow names that keep drafts apart in one spec: two `save` triggers (`A.save`, `B.save`) become `A-save` and `B-save`, taking as many trailing ID segments as it needs.
    - fn [draftRules](../../src/draft.ts#L301) (snapshot: AnalysisSnapshot, cyclic: boolean) → string
      <a id="features.draft.draftRules"></a><br>`draft rules --mode algo`: rules the current code already keeps, so each passes `check` as written. Layers in an order where every observed dependency points down (`a < b`: `b` may use `a`), when the layers form no cycle; otherwise a `deny` for each pair used in one direction…
      - calls [features.draft.layerOrder](features.md#features.draft.layerOrder)
    - fn [layerOrder](../../src/draft.ts#L336) (layers: readonly string[], uses: ReadonlyMap<string, ReadonlySet<string>>) → string[] | null <!-- internal -->
      <a id="features.draft.layerOrder"></a><br>Layers with those used first (Kahn, ties by name); null for a cycle.
    - type [CodeToSpecTriggers](../../src/draft.ts#L353)
      <a id="features.draft.CodeToSpecTriggers"></a><br>The functions a `code-to-spec` call drafts, and the name of the spec they go in.
    - fn [codeToSpecTriggers](../../src/draft.ts#L365) (snapshot: AnalysisSnapshot, file: string, line: number | null) → CodeToSpecTriggers
      <a id="features.draft.codeToSpecTriggers"></a><br>`code-to-spec <path[:line]>`: the functions the code position names — the innermost fn whose range holds the line, or every exported fn of the file in declaration order without a line — and the spec's name: the fn's, or the file's module's. Reads the snapshot only; a position…
    - type [CodeToSpecDraft](../../src/draft.ts#L399)
      <a id="features.draft.CodeToSpecDraft"></a><br>The spec `code-to-spec` drafts: its name and a flow draft per function.
    - fn [codeToSpec](../../src/draft.ts#L405) (snapshot: AnalysisSnapshot, file: string, line: number | null) → CodeToSpecDraft
      <a id="features.draft.codeToSpec"></a><br>`code-to-spec <path[:line]>`: each fn `codeToSpecTriggers` names as a flow draft; same-named fns get distinct flow names.
      - calls [features.draft.codeToSpecTriggers](features.md#features.draft.codeToSpecTriggers), [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
    - type [ChangedLines](../../src/draft.ts#L413)
      <a id="features.draft.ChangedLines"></a><br>Changed lines per file, 1-based and inclusive; `all` for a file git does not track yet.
    - fn [diffHunks](../../src/draft.ts#L419) (diff: string) → Map<string, [number, number][]>
      <a id="features.draft.diffHunks"></a><br>The new-side line ranges of `git diff --unified=0`. A deletion is the line it happened after, so the fn around it counts as changed.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [deletedDiffPaths](../../src/draft.ts#L449) (diff: string) → string[]
      <a id="features.draft.deletedDiffPaths"></a><br>Paths removed in `git diff` (`--- a/file` then `+++ /dev/null`). `diffHunks` follows the new side, so a deletion has no hunk to land on.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [gitPath](../../src/draft.ts#L469) (text: string) → string <!-- internal -->
      <a id="features.draft.gitPath"></a><br>A path as `git diff` prints it: C-quoted (`"b/\303\251.ts"`, `"b/a\"b.ts"`) when it holds a quote, a backslash or a control byte.
    - type [ChangedFlowDrafts](../../src/draft.ts#L510)
      <a id="features.draft.ChangedFlowDrafts"></a><br>Flow drafts for changed code, and the changed functions some flow already names.
    - fn [changedFlows](../../src/draft.ts#L521) (snapshot: AnalysisSnapshot, changed: ChangedLines, named: ReadonlySet<string>) → ChangedFlowDrafts
      <a id="features.draft.changedFlows"></a><br>`code-to-spec --since <ref>`: a flow draft for each fn the change touches. A fn some hand-written spec already names is reported, not drafted again — its flow is the place to look.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
  - module [explain-edge](../../src/explain-edge.ts#L1)
    <a id="features.explain-edge"></a><br>The evidence between two ids of one snapshot (`keylang check --explain-edge <a> <b>`): the edges from `a` (or a node under it) to `b`, then back, or — with no edge — whether that absence is proven. Only the snapshot's own edges and coverage count; nothing is inferred from the…
    - snapshot [map.snapshot](map.md#map.snapshot)
    - flows [check.flows](check.md#check.flows)
    - span [base.span](base.md#base.span)
    - type [EdgeEvidence](../../src/explain-edge.ts#L11)
      <a id="features.explain-edge.EdgeEvidence"></a><br>One edge between the two ids: `forward` is `from → to`, `backward` is `to → from`.
    - type [EdgeConclusion](../../src/explain-edge.ts#L21) = "edges" | "complete" | "unresolved"
      <a id="features.explain-edge.EdgeConclusion"></a><br>`edges`: at least one edge; `complete`: no edge and nothing unresolved in `from` that could form one — the absence is proven; `unresolved`: no confirmed edge, but constructs of `from` were not resolved, so it is not.
    - type [EdgeExplanation](../../src/explain-edge.ts#L24)
      <a id="features.explain-edge.EdgeExplanation"></a><br>The answer to `--explain-edge`: the two ids, the evidence and the verdict.
    - fn [edgeIdKnown](../../src/explain-edge.ts#L35) (snapshot: AnalysisSnapshot, id: string) → boolean
      <a id="features.explain-edge.edgeIdKnown"></a><br>An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail under a known module.
    - fn [under](../../src/explain-edge.ts#L40) (id: string, scope: string) → boolean <!-- internal -->
      <a id="features.explain-edge.under"></a><br>Whether `id` is `scope` or a node below it.
    - fn [explainEdge](../../src/explain-edge.ts#L43) (snapshot: AnalysisSnapshot, from: string, to: string) → EdgeExplanation
      <a id="features.explain-edge.explainEdge"></a><br>The edges and the coverage between two known ids (see `edgeIdKnown`).
      - calls [base.span.compareText](base.md#base.span.compareText), [features.explain-edge.under](features.md#features.explain-edge.under), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [edgeLine](../../src/explain-edge.ts#L73) (edge: SnapshotEdge) → string
      <a id="features.explain-edge.edgeLine"></a><br>One edge as the CLI prints it: kind, resolution, provenance, range, fragment, `source → target`, candidates, hook, reason.
      - calls [check.flows.describeConfig](check.md#check.flows.describeConfig)
    - fn [holeLine](../../src/explain-edge.ts#L93) (hole: CoverageItem) → string
      <a id="features.explain-edge.holeLine"></a><br>One unresolved construct as the CLI prints it.
    - fn [edgeExplanationLines](../../src/explain-edge.ts#L98) (explanation: EdgeExplanation) → string[]
      <a id="features.explain-edge.edgeExplanationLines"></a><br>The CLI's stdout of `check --explain-edge`, line by line.
      - calls [features.explain-edge.edgeLine](features.md#features.explain-edge.edgeLine), [features.explain-edge.holeLine](features.md#features.explain-edge.holeLine)
  - module [explain-inventory](../../src/explain-inventory.ts#L1)
    <a id="features.explain-inventory"></a><br>Which explanations need work, without asking a model or writing a file: the stale and gone saved explanations (`explain --stale`), and the plan of a brief batch (`explain --missing|--stale` without `--llm`) with its dry-run size. One result for the CLI and the TUI; the batch…
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - fn [defaultBriefJobs](../../src/explain-inventory.ts#L21) (agent: string | null) → number
      <a id="features.explain-inventory.defaultBriefJobs"></a><br>The default `--jobs` for an agent: 2 for an agent CLI (each request is a whole CLI process on this machine), else 4.
      - calls [base.config.isCliAgent](base.md#base.config.isCliAgent)
    - fn [positiveIntegerProblem](../../src/explain-inventory.ts#L26) (flag: string, text: string) → string | null
      <a id="features.explain-inventory.positiveIntegerProblem"></a><br>The CLI's complaint about `--limit`/`--jobs` text that is not a whole number of at least 1, or null when it is one.
    - type [NodePlace](../../src/explain-inventory.ts#L33)
      <a id="features.explain-inventory.NodePlace"></a><br>Where a node is declared: its code, or the `planned` line of a spec; null for a node with no file (a layer).
    - type [StaleExplanation](../../src/explain-inventory.ts#L42)
      <a id="features.explain-inventory.StaleExplanation"></a><br>A saved explanation that no longer matches the code: `stale` (the closure changed) or `gone` (the ID is in no snapshot and no `planned`).
    - type [StaleInventory](../../src/explain-inventory.ts#L58)
      <a id="features.explain-inventory.StaleInventory"></a><br>`explain --stale`: every saved answer, then every saved brief, that is stale or gone.
    - type [PlannedBriefEntry](../../src/explain-inventory.ts#L65) extends PlannedBrief
      <a id="features.explain-inventory.PlannedBriefEntry"></a><br>One node of a brief plan, with why it is planned.
    - type [BriefPlan](../../src/explain-inventory.ts#L76)
      <a id="features.explain-inventory.BriefPlan"></a><br>A brief batch as it would run, computed before any request: the nodes bottom-up (`wave`), counts by level and, when asked, an approximate size in tokens. A preview: a batch plans again on its own analysis.
    - fn [nodePlace](../../src/explain-inventory.ts#L98) (analysis: Analysis, id: string) → NodePlace | null <!-- internal -->
      <a id="features.explain-inventory.nodePlace"></a><br>Where `id` is declared: its file in the snapshot, else its `planned` line; null for a node without a file.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [staleInventory](../../src/explain-inventory.ts#L112) (analysis: Analysis) → StaleInventory
      <a id="features.explain-inventory.staleInventory"></a><br>The saved answers and briefs that are stale or gone, in the CLI's order.
      - calls [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [features.explain-inventory.againCommand](features.md#features.explain-inventory.againCommand), [features.explain-inventory.nodePlace](features.md#features.explain-inventory.nodePlace)
    - fn [againCommand](../../src/explain-inventory.ts#L136) (id: string, kind: "answer" | "brief") → string <!-- internal -->
      <a id="features.explain-inventory.againCommand"></a><br>The command that asks again: the repository's brief has no id to name, so its batch asks for it.
    - fn [staleInventoryText](../../src/explain-inventory.ts#L143) (inventory: StaleInventory) → string
      <a id="features.explain-inventory.staleInventoryText"></a><br>`explain --stale` on stdout, byte for byte.
    - fn [briefPlan](../../src/explain-inventory.ts#L154) (analysis: Analysis, options: { batch: BriefBatch; limit: number | null; jobs: number; estimate: boolean }) → BriefPlan
      <a id="features.explain-inventory.briefPlan"></a><br>The plan of a brief batch on `analysis` (which must have a snapshot), cut to `limit` before the estimate.
      - calls [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.explain-llm.planBriefs](features.md#features.explain-llm.planBriefs), [features.explain-inventory.nodePlace](features.md#features.explain-inventory.nodePlace), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.estimateTokens](features.md#features.explain-llm.estimateTokens)
    - fn [briefPlanText](../../src/explain-inventory.ts#L205) (plan: BriefPlan) → string
      <a id="features.explain-inventory.briefPlanText"></a><br>The CLI's stdout of a plan: the dry-run counts and estimate, or the nodes one per line.
      - calls [features.explain-inventory.briefCounts](features.md#features.explain-inventory.briefCounts)
    - fn [briefCounts](../../src/explain-inventory.ts#L214) (counts: Record<BriefLevel, number>) → string
      <a id="features.explain-inventory.briefCounts"></a><br>Counts of a plan by level; the repository's own brief is named only when it is planned.
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
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [Explanation](../../src/explain-llm.ts#L25) = StoredExplanation
      <a id="features.explain-llm.Explanation"></a><br>A saved explanation as read from the store.
    - fn [readExplanation](../../src/explain-llm.ts#L28) (config: Config, id: string, detail: ExplanationDetail = "short") → Explanation | null
      <a id="features.explain-llm.readExplanation"></a><br>The saved explanation of `id` at this detail: `short` and `full` share `<id>.md`, a brief has its own file.
      - calls [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
    - fn [explainedIds](../../src/explain-llm.ts#L37) (config: Config, kind: "answers" | "briefs") → string[]
      <a id="features.explain-llm.explainedIds"></a><br>IDs of every saved explanation (`answers`) or brief, sorted.
      - calls [map.explanations.storedIds](map.md#map.explanations.storedIds), [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [oldExplanations](../../src/explain-llm.ts#L42) (root: string) → number
      <a id="features.explain-llm.oldExplanations"></a><br>Explanation files in the store of keylang 0.1, which is not read any more.
    - fn [moveHint](../../src/explain-llm.ts#L49) (config: Config, count: number) → string
      <a id="features.explain-llm.moveHint"></a><br>How to move the store of keylang 0.1 to where explanations live now.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [currentBaseline](../../src/explain-llm.ts#L57) (analysis: Analysis, id: string) → string | null
      <a id="features.explain-llm.currentBaseline"></a><br>The baseline an explanation of `id` is compared with now (`snapshotBaseline`): "" for a planned node, which has no code yet; null when the id is gone.
      - calls [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [isStale](../../src/explain-llm.ts#L68) (analysis: Analysis, id: string, e: Explanation) → boolean
      <a id="features.explain-llm.isStale"></a><br>Whether the saved explanation was written against another baseline than the current one (a gone ID is stale too).
      - calls [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline)
    - fn [briefText](../../src/explain-llm.ts#L73) (answer: string) → string
      <a id="features.explain-llm.briefText"></a><br>A model's brief as saved: one or two sentences in one paragraph of `answerText`, cut by the rule doc comments follow.
      - calls [features.explain-llm.answerText](features.md#features.explain-llm.answerText), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [answerText](../../src/explain-llm.ts#L88) (answer: string) → string
      <a id="features.explain-llm.answerText"></a><br>A model's explanation as saved (`short`, `full`, and the text a brief is cut from): without the wrappers a chatty answer puts around it — a leading remark paragraph that ends with `:` or has fewer than four words («Sure, here is the brief:», «Certainly!») while more follows…
      - calls [features.explain-llm.unfenced](features.md#features.explain-llm.unfenced), [features.explain-llm.withoutRemark](features.md#features.explain-llm.withoutRemark)
    - fn [unfenced](../../src/explain-llm.ts#L94) (text: string) → string <!-- internal -->
      <a id="features.explain-llm.unfenced"></a><br>The inside of one fenced block of Markdown or plain text that is the whole of `text`; `text` itself otherwise.
    - fn [withoutRemark](../../src/explain-llm.ts#L112) (text: string) → string <!-- internal -->
      <a id="features.explain-llm.withoutRemark"></a><br>`text` without its first paragraph when that is a remark before the answer and another paragraph follows.
    - fn [unknownIds](../../src/explain-llm.ts#L132) (analysis: Analysis, text: string) → string[]
      <a id="features.explain-llm.unknownIds"></a><br>`` `a.b.c` `` in the answer that are neither snapshot IDs nor declared `planned`. Only a path that starts with a layer is an ID at all: `` `process.env` `` is code.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [explanationRequest](../../src/explain-llm.ts#L154) (analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: ExplanationDetail; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.explanationRequest"></a><br>The request: the node's summary, its code, the signatures around it, and the words of the specs that mention it (layer, flows, rules). Not the repository.
      - calls [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-llm.sourceLines](features.md#features.explain-llm.sourceLines), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.members](features.md#features.explain-llm.members), [features.explain-llm.unresolved](features.md#features.explain-llm.unresolved)
    - fn [unresolved](../../src/explain-llm.ts#L216) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-llm.unresolved"></a><br>The constructs inside the node keylang did not turn into edges, with their line and code, for the calls section of `full`. An import of a file `assume` names is no such construct: the architecture leaves it unread.
      - calls [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [members](../../src/explain-llm.ts#L239) (analysis: Analysis, id: string, briefs: ReadonlyMap<string, StoredExplanation>) → string[] <!-- internal -->
      <a id="features.explain-llm.members"></a><br>The members right under a module, class or layer with their explanations (doc comments, briefs): a layer is explained through its modules, a module through its functions and types.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [sourceLines](../../src/explain-llm.ts#L264) (text: string, from: number, to: number) → string <!-- internal -->
      <a id="features.explain-llm.sourceLines"></a><br>Lines `from`..`to` (1-based, inclusive) of `text`, cut after 200 lines.
    - type [BriefBatch](../../src/explain-llm.ts#L272) = "missing" | "stale"
      <a id="features.explain-llm.BriefBatch"></a><br>Which briefs a batch writes: nodes with no explanation or a stale brief (`missing`), or only stale briefs (`stale`).
    - type [BriefLevel](../../src/explain-llm.ts#L275) = "fn/type" | "class/module" | "layer" | "system"
      <a id="features.explain-llm.BriefLevel"></a><br>Levels of the explained map, explained bottom-up: a parent's prompt carries its members' briefs.
    - type [PlannedBrief](../../src/explain-llm.ts#L278)
      <a id="features.explain-llm.PlannedBrief"></a><br>One node a brief batch would ask about, with its level and wave.
    - fn [planBriefs](../../src/explain-llm.ts#L292) (analysis: Analysis, batch: BriefBatch, briefs: ReadonlyMap<string, StoredExplanation>) → PlannedBrief[]
      <a id="features.explain-llm.planBriefs"></a><br>The nodes a batch explains, in the order it asks: fn and types, then classes and modules from the deepest up, then layers, then the repository itself (`SYSTEM_ID`). A node with a doc comment is never asked about: the code already says what it does; nor is the repository when…
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [base.span.compareText](base.md#base.span.compareText)
    - fn [systemRequest](../../src/explain-llm.ts#L336) (analysis: Analysis, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.systemRequest"></a><br>The request for the repository's brief: its name, its layers with what the explained map says about them, its flows and the packages it uses. The README and manifests had nothing to say, or no model is asked at all.
      - calls [map.explanations.ownLayers](map.md#map.explanations.ownLayers), [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - type [TokenEstimate](../../src/explain-llm.ts#L369)
      <a id="features.explain-llm.TokenEstimate"></a><br>Tokens a batch is expected to send and receive.
    - fn [estimateTokens](../../src/explain-llm.ts#L375) (analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>) → TokenEstimate
      <a id="features.explain-llm.estimateTokens"></a><br>A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out.
      - calls [features.explain-llm.briefRequest](features.md#features.explain-llm.briefRequest)
    - fn [briefRequest](../../src/explain-llm.ts#L390) (analysis: Analysis, id: string, lang: string, briefs: ReadonlyMap<string, StoredExplanation>) → LlmRequest | null
      <a id="features.explain-llm.briefRequest"></a><br>The request for the brief of `id`: the repository's or a node's; null when the id is gone from the snapshot.
      - calls [features.explain-llm.systemRequest](features.md#features.explain-llm.systemRequest), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest)
  - module [explain-node](../../src/explain-node.ts#L1)
    <a id="features.explain-node"></a><br>`keylang explain <id>` without a model: what the snapshot and the specs say about one node. Deterministic and offline; the LLM explanation (§5.4) builds on it and falls back to it. `nodeFacts` is also what hover says a node is (`lsp-features.ts`): one source for kind…
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [NodeFacts](../../src/explain-node.ts#L14)
      <a id="features.explain-node.NodeFacts"></a><br>What a node is by the snapshot and the specs, before any view of it shows it.
    - fn [nodeFacts](../../src/explain-node.ts#L36) (analysis: Analysis, id: string) → NodeFacts | null
      <a id="features.explain-node.nodeFacts"></a><br>The facts of `id`: from the snapshot, else from its `planned` line, else from the spec line that declares it; null when nothing does.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - type [NodeSummary](../../src/explain-node.ts#L56)
      <a id="features.explain-node.NodeSummary"></a><br>Everything `explain <id>` reports about a node: what it is, its neighbours, flows, rules, holes and fingerprint.
    - type [ExplainResult](../../src/explain-node.ts#L86)
      <a id="features.explain-node.ExplainResult"></a><br>A summary, or the unknown ID with the nearest declared ID as a suggestion.
    - fn [summarizeNode](../../src/explain-node.ts#L89) (analysis: Analysis, id: string) → ExplainResult
      <a id="features.explain-node.summarizeNode"></a><br>The offline summary of `id`: from the snapshot when the code has it, else from its `planned` line.
      - calls [features.explain-node.nodeFacts](features.md#features.explain-node.nodeFacts), [features.explain-node.rulesNaming](features.md#features.explain-node.rulesNaming), [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved), [features.explain-node.observersOf](features.md#features.explain-node.observersOf), [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [observersOf](../../src/explain-node.ts#L143) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-node.observersOf"></a><br>The observers of an event, in config order: the fn, the observer's name, its config line and area.
    - fn [rulesNaming](../../src/explain-node.ts#L152) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-node.rulesNaming"></a><br>`file:line: rule text` of the rule and module lines that name `id` or a scope around it, sorted; the generated map's are left out.
      - calls [features.explain-node.nodeHolding](features.md#features.explain-node.nodeHolding)
    - fn [nodeHolding](../../src/explain-node.ts#L193) (root: Node, ref: Ref) → Node | null <!-- internal -->
      <a id="features.explain-node.nodeHolding"></a><br>The allow, deny, entry item, nested layer, or module line that holds `ref`.
    - fn [formatSummary](../../src/explain-node.ts#L207) (s: NodeSummary) → string
      <a id="features.explain-node.formatSummary"></a><br>The summary as text: one line per fact, empty facts left out.
  - module [explain-offline](../../src/explain-offline.ts#L1)
    <a id="features.explain-offline"></a><br>`keylang explain <code|id>` without a model: the help of a diagnostic code, or what the snapshot and the specs say about a node with the explanations saved for it. One result for the CLI, the TUI palette and `e`: the doc comment of the code (in the summary), the saved…
    - analyze [map.analyze](map.md#map.analyze)
    - explain [features.explain](features.md#features.explain)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - fn [isDiagnosticCode](../../src/explain-offline.ts#L16) (subject: string) → boolean
      <a id="features.explain-offline.isDiagnosticCode"></a><br>`K001`, `k104`: a diagnostic code, whatever its case, as the CLI tells it from an ID.
    - type [SavedAnswer](../../src/explain-offline.ts#L21)
      <a id="features.explain-offline.SavedAnswer"></a><br>An explanation a model wrote, as saved, judged against the current analysis.
    - type [ExplainLink](../../src/explain-offline.ts#L37)
      <a id="features.explain-offline.ExplainLink"></a><br>A position the summary names: the node itself, a related ID, a flow or a rule line. Only known places; an ID without one has `file: null`.
    - type [CodeExplanation](../../src/explain-offline.ts#L51)
      <a id="features.explain-offline.CodeExplanation"></a><br>The help of one diagnostic code.
    - type [NodeExplanation](../../src/explain-offline.ts#L60)
      <a id="features.explain-offline.NodeExplanation"></a><br>What keylang knows about one node: the summary, the saved answers and the places they name.
    - type [OfflineExplanation](../../src/explain-offline.ts#L73) = CodeExplanation | NodeExplanation
      <a id="features.explain-offline.OfflineExplanation"></a><br>The result of `explain <code|id>` without a model.
    - fn [codeExplanation](../../src/explain-offline.ts#L76) (code: string) → CodeExplanation | null
      <a id="features.explain-offline.codeExplanation"></a><br>The help of a diagnostic code, or null for a code keylang does not have.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [unknownIdMessage](../../src/explain-offline.ts#L83) (id: string, suggestion: string | null) → string
      <a id="features.explain-offline.unknownIdMessage"></a><br>The CLI's error for an ID that is neither in the snapshot nor declared `planned`.
    - fn [nodeExplanation](../../src/explain-offline.ts#L88) (analysis: Analysis, id: string, detail: ExplanationDetail) → NodeExplanation | { unknown: string; suggestion: string | null }
      <a id="features.explain-offline.nodeExplanation"></a><br>The offline explanation of `id` on `analysis`, or why there is none.
      - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswer](features.md#features.explain-offline.savedAnswer), [features.explain-offline.summaryLinks](features.md#features.explain-offline.summaryLinks)
    - fn [savedAnswer](../../src/explain-offline.ts#L107) (analysis: Analysis, id: string, e: Explanation) → SavedAnswer
      <a id="features.explain-offline.savedAnswer"></a><br>A saved explanation with its freshness, unknown IDs and file, judged against `analysis`.
      - calls [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [features.explain-llm.unknownIds](features.md#features.explain-llm.unknownIds), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
    - type [AnswerMiss](../../src/explain-offline.ts#L112) = "missing" | "stale" | "lang" | "detail"
      <a id="features.explain-offline.AnswerMiss"></a><br>Why a saved explanation does not answer `explain <id> --llm`: none, stale, another language or another detail.
    - fn [savedAnswerMiss](../../src/explain-offline.ts#L115) (analysis: Analysis, id: string, saved: Explanation | null, lang: string, detail: ExplanationDetail) → AnswerMiss | null
      <a id="features.explain-offline.savedAnswerMiss"></a><br>Why `saved` does not answer a request of `lang` and `detail`, or null when it does: a fresh one is read, never asked for again.
      - calls [features.explain-llm.isStale](features.md#features.explain-llm.isStale)
    - fn [savedAnswerText](../../src/explain-offline.ts#L127) (saved: SavedAnswer) → string
      <a id="features.explain-offline.savedAnswerText"></a><br>A saved answer as the CLI prints it: the text, a blank line, `agent · date · fresh|stale`, and the made-up IDs.
    - fn [offlineExplanationText](../../src/explain-offline.ts#L134) (explanation: OfflineExplanation) → string
      <a id="features.explain-offline.offlineExplanationText"></a><br>The CLI's stdout for an offline explanation, byte for byte.
      - calls [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-offline.savedAnswerText](features.md#features.explain-offline.savedAnswerText)
    - fn [summaryLinks](../../src/explain-offline.ts#L142) (analysis: Analysis, summary: NodeSummary) → ExplainLink[] <!-- internal -->
      <a id="features.explain-offline.summaryLinks"></a><br>The places the summary names, in its order; a related ID is a place only where the snapshot or a `planned` declares it.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
  - module [explain](../../src/explain.ts#L1)
    <a id="features.explain"></a><br>Short explanations for diagnostic codes, printed by `keylang explain <code>` (CLI). Every code in `diag.ts` has an entry: the `Record<Code, …>` type makes a missing one a type error.
    - diag [base.diag](base.md#base.diag)
    - fn [isCode](../../src/explain.ts#L160) (text: string) → text is Code <!-- internal -->
      <a id="features.explain.isCode"></a><br>Whether `text` is a known diagnostic code; own keys only, so `constructor` is not one.
    - fn [explainCode](../../src/explain.ts#L165) (code: string) → string | null
      <a id="features.explain.explainCode"></a><br>The explanation of a code as printed lines (case-insensitive code), or null for an unknown code.
      - calls [features.explain.isCode](features.md#features.explain.isCode)
  - module [explorer](../../src/explorer.ts#L1)
    <a id="features.explorer"></a><br>The entry explorer of `keylang web` (business-flows/22): one level of the call graph around an ID at a time, for a person reading old code before any flow is written. `callsOf` gives the direct callees of a fn (with the edge's `via` and `site`), the calls keylang did not…
    - external-ids [base.external-ids](base.md#base.external-ids)
    - draft [features.draft](features.md#features.draft)
    - json [base.json](base.md#base.json)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [CallSite](../../src/explorer.ts#L21)
      <a id="features.explorer.CallSite"></a><br>Where a call is written.
    - type [CallRef](../../src/explorer.ts#L28)
      <a id="features.explorer.CallRef"></a><br>A callee or a caller: the other end of a resolved edge, with how the edge goes.
    - type [CallHole](../../src/explorer.ts#L61)
      <a id="features.explorer.CallHole"></a><br>A call keylang did not resolve: «тут keylang сліпий».
    - type [Calls](../../src/explorer.ts#L71)
      <a id="features.explorer.Calls"></a><br>The answer for one opened row of the explorer: the node, its callees, holes, callers and entry points above it.
    - fn [follows](../../src/explorer.ts#L95) (edge: SnapshotEdge) → boolean <!-- internal -->
      <a id="features.explorer.follows"></a><br>The resolved edges a call tree follows: calls, and whatever an adapter adds between a fn and an event.
    - type [Index](../../src/explorer.ts#L100) <!-- internal -->
      <a id="features.explorer.Index"></a><br>Indexes of the snapshot's call edges, built once per snapshot.
    - fn [indexOf](../../src/explorer.ts#L111) (snapshot: AnalysisSnapshot) → Index <!-- internal -->
      <a id="features.explorer.indexOf"></a><br>The snapshot's call index, built on first use and cached: every opened row asks again.
      - calls [features.explorer.follows](features.md#features.explorer.follows)
    - fn [byPosition](../../src/explorer.ts#L158) (a: CallSite, b: CallSite) → number <!-- internal -->
      <a id="features.explorer.byPosition"></a><br>Order by file, line, column: the order the code writes things in.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [callsOf](../../src/explorer.ts#L164) (snapshot: AnalysisSnapshot, id: string) → Calls
      <a id="features.explorer.callsOf"></a><br>One level around `id`: its callees and holes, its callers, and the entry points above it. An unknown ID gives empty lists and a `reason`.
      - calls [features.explorer.indexOf](features.md#features.explorer.indexOf), [features.explorer.byPosition](features.md#features.explorer.byPosition), [base.span.compareText](base.md#base.span.compareText), [features.explorer.holesOf](features.md#features.explorer.holesOf), [features.explorer.reachedFrom](features.md#features.explorer.reachedFrom)
    - fn [holesOf](../../src/explorer.ts#L234) (index: Index, id: string) → CallHole[] <!-- internal -->
      <a id="features.explorer.holesOf"></a><br>The unresolved and ambiguous calls of `id`, and the coverage items of the snapshot about it at other places (a `dynamic-event`), by position.
      - calls [features.explorer.byPosition](features.md#features.explorer.byPosition)
    - fn [reachedFrom](../../src/explorer.ts#L265) (snapshot: AnalysisSnapshot, index: Index, id: string) → Calls["reachedFrom"] <!-- internal -->
      <a id="features.explorer.reachedFrom"></a><br>Breadth first up the resolved edges: the entry points that reach `id`, nearest first, then by kind and label.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - type [EventListing](../../src/explorer.ts#L298)
      <a id="features.explorer.EventListing"></a><br>An event of the snapshot (business-flows/08): who publishes it and who subscribes.
    - type [EventListings](../../src/explorer.ts#L307)
      <a id="features.explorer.EventListings"></a><br>The event nodes of a snapshot; `reason` says why there are none.
    - fn [eventsOf](../../src/explorer.ts#L313) (snapshot: AnalysisSnapshot | null) → EventListings
      <a id="features.explorer.eventsOf"></a><br>The event nodes of the snapshot by ID, or why there are none.
      - calls [features.explorer.indexOf](features.md#features.explorer.indexOf), [base.span.compareText](base.md#base.span.compareText)
    - type [ExplorerStep](../../src/explorer.ts#L330)
      <a id="features.explorer.ExplorerStep"></a><br>A branch a person ticked: a step and the steps under it.
    - type [ExplorerFlowRequest](../../src/explorer.ts#L336)
      <a id="features.explorer.ExplorerFlowRequest"></a><br>A validated flow proposal from the explorer: the flow name, its trigger and the ticked steps.
    - fn [parseExplorerFlow](../../src/explorer.ts#L358) (body: JsonValue) → ExplorerFlowRequest | string
      <a id="features.explorer.parseExplorerFlow"></a><br>The request body of `POST /api/flow-proposal` as a request, or why not: `{name, trigger, steps}`, where a step is an ID or `{id, steps?}`.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [explorerFlow](../../src/explorer.ts#L420) (snapshot: AnalysisSnapshot, request: ExplorerFlowRequest) → FlowDraft | string
      <a id="features.explorer.explorerFlow"></a><br>The flow a person ticked in the explorer, as a draft: `trigger`, then each step nested under the step that calls it, in the order given. Every step must be a fn of the repository the step above it (the trigger at the top) calls by a resolved edge: the draft claims only what the…
      - calls [features.explorer.indexOf](features.md#features.explorer.indexOf), [features.explorer.byPosition](features.md#features.explorer.byPosition), [features.explorer.holesOf](features.md#features.explorer.holesOf), [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind)
  - module [feature-status](../../src/feature-status.ts#L1)
    <a id="features.feature-status"></a><br>Whether a feature file is done: it declares something to check, keylang reads it without errors, every `planned` in it is implemented (K202, not K201), every flow step and `calls` in it is static ok, no rule fail of this change remains (ADR 0005 §2: no new violations), and the…
    - assess [check.assess](check.md#check.assess)
    - changed [features.changed](features.md#features.changed)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - flows [check.flows](check.md#check.flows)
    - resolve [check.resolve](check.md#check.resolve)
    - rules [check.rules](check.md#check.rules)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - weakening [features.weakening](features.md#features.weakening)
    - type [Stage](../../src/feature-status.ts#L40) = "idea" | "behavior" | "structure" | "ready" | "done"
      <a id="features.feature-status.Stage"></a><br>How far a feature file got, the first that holds: `done` (no gaps), `idea` (no `# flow` yet), `behavior` (a flow without a trigger or steps), `structure` (the spec itself has gaps: errors, open questions, a predicted deny, a planned id outside the layers, a planned fn without a…
    - type [Gap](../../src/feature-status.ts#L46)
      <a id="features.feature-status.Gap"></a><br>What keeps a feature from done. Every gap blocks it; `stage` is where it is fixed.
    - type [Hint](../../src/feature-status.ts#L60)
      <a id="features.feature-status.Hint"></a><br>What does not keep the feature from done: the next step of a stage the spec still lacks, or a rule fail elsewhere that is not this change's (`rule`).
    - type [FeatureInfo](../../src/feature-status.ts#L71)
      <a id="features.feature-status.FeatureInfo"></a><br>A reported, non-blocking finding: a tests or trace verdict, or an inherited rule fail.
    - type [BaseChanges](../../src/feature-status.ts#L85)
      <a id="features.feature-status.BaseChanges"></a><br>What git reports changed in the working tree since the base ref, as `check --changed` reads it: changed, added, deleted and untracked files, and the deleted ones. POSIX, relative to the root, sorted.
    - type [BaseSource](../../src/feature-status.ts#L95) = "since" | "merge-base" | "HEAD"
      <a id="features.feature-status.BaseSource"></a><br>How the base commit was chosen: `since` — given (`--since`, MCP `since`); `merge-base` — where HEAD left the main branch, so the branch's own commits are the change; `HEAD` — no main branch, no merge-base, or HEAD itself.
    - type [BaseOrigin](../../src/feature-status.ts#L98)
      <a id="features.feature-status.BaseOrigin"></a><br>The commit a feature is judged against, and how a sentence names it.
    - type [FeatureBase](../../src/feature-status.ts#L119)
      <a id="features.feature-status.FeatureBase"></a><br>The feature file at its base commit and what changed since. `compared`: the file is there; `absent`: it is not (a new feature, or no commit yet: then every file is changed); `unavailable`: the history could not be read, so the plan is not compared and every rule fail blocks.…
    - type [FeatureBaseInfo](../../src/feature-status.ts#L127)
      <a id="features.feature-status.FeatureBaseInfo"></a><br>`FeatureBase` as the report shows it: the commit, its state, and how it was chosen.
    - type [FeatureReport](../../src/feature-status.ts#L130)
      <a id="features.feature-status.FeatureReport"></a><br>The whole answer for one feature file: done or not, its stage, gaps, hints and info.
    - type [FeatureInput](../../src/feature-status.ts#L149)
      <a id="features.feature-status.FeatureInput"></a><br>Everything `featureStatus` reads: the parsed specs, the check's results, the snapshot's nodes and edges, and the base.
    - fn [idsIn](../../src/feature-status.ts#L193) (doc: Document) → string[]
      <a id="features.feature-status.idsIn"></a><br>Ids declared or named in one spec, in first-seen order.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [featureStatus](../../src/feature-status.ts#L214) (input: FeatureInput, slug: string) → FeatureReport | null
      <a id="features.feature-status.featureStatus"></a><br>The feature report, or null when `keylang/<dir>/features/<slug>.md` is not one of the specs. Gaps are ordered by kind, then file, line, column, id.
      - calls [base.config.specPath](base.md#base.config.specPath), [base.diag.isError](base.md#base.diag.isError), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.feature-status.denyGaps](features.md#features.feature-status.denyGaps), [features.feature-status.finding](features.md#features.feature-status.finding), [features.feature-status.claimsOf](features.md#features.feature-status.claimsOf), [features.feature-status.thisChange](features.md#features.feature-status.thisChange), [features.feature-status.idsIn](features.md#features.feature-status.idsIn), [features.feature-status.ruleFails](features.md#features.feature-status.ruleFails), [features.feature-status.weakenedPlan](features.md#features.feature-status.weakenedPlan), [base.span.compareText](base.md#base.span.compareText), [features.feature-status.stageOf](features.md#features.feature-status.stageOf), [features.feature-status.baseInfo](features.md#features.feature-status.baseInfo)
    - fn [baseInfo](../../src/feature-status.ts#L359) (base: FeatureBase) → FeatureBaseInfo <!-- internal -->
      <a id="features.feature-status.baseInfo"></a><br>The base as the report names it: the commit and its state first, as they always came, then how it was chosen.
    - type [RuleFail](../../src/feature-status.ts#L368) <!-- internal -->
      <a id="features.feature-status.RuleFail"></a><br>A rule fail: an error diagnostic of a rule (K101, K102, K104, K105, K107), or a failed rule verdict that repeats none.
    - fn [ruleFails](../../src/feature-status.ts#L379) (input: FeatureInput) → RuleFail[] <!-- internal -->
      <a id="features.feature-status.ruleFails"></a><br>Every rule fail of the analysis, in the order of its diagnostics, then its verdicts.
      - calls [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [thisChange](../../src/feature-status.ts#L407) (input: FeatureInput, path: string, named: readonly string[]) → (fail: RuleFail) => boolean <!-- internal -->
      <a id="features.feature-status.thisChange"></a><br>Whether a rule fail is this change's. Without what changed since the base, every one is.
      - calls [features.changed.filterChanged](features.md#features.changed.filterChanged)
    - fn [stageOf](../../src/feature-status.ts#L445) (hasFlow: boolean, gaps: readonly Gap[], hints: readonly Hint[]) → Stage <!-- internal -->
      <a id="features.feature-status.stageOf"></a><br>The first stage that holds, from `done` down: see `Stage`.
    - fn [denyGaps](../../src/feature-status.ts#L471) (input: FeatureInput, path: string, flows: readonly Flow[]) → Gap[] <!-- internal -->
      <a id="features.feature-status.denyGaps"></a><br>Edges a flow of the feature asks for that a rule would deny once they are code: a `step` or `calls` target under its parent `trigger` or `step` (a top-level one under the first trigger), while one end is still `planned` and not implemented. Once both ends are code, `check`…
      - calls [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [claimsOf](../../src/feature-status.ts#L530) (flow: Flow) → { id: string; span: Span }[] <!-- internal -->
      <a id="features.feature-status.claimsOf"></a><br>The static claims of a flow, in order: every `step`, and every target of a `calls` line.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [weakenedPlan](../../src/feature-status.ts#L546) (input: FeatureInput, path: string, base: Extract<FeatureBase, { state: "compared" | "absent" }>) → Gap[] <!-- internal -->
      <a id="features.feature-status.weakenedPlan"></a><br>Where the plan was weakened: against the base, then — with a merge-base — against HEAD as well, so a file new on the branch keeps its committed plan. A removal both find is the base's gap alone.
      - calls [features.feature-status.planGaps](features.md#features.feature-status.planGaps)
    - fn [planGaps](../../src/feature-status.ts#L565) (input: FeatureInput, path: string, at: string, baseDoc: Document) → { key: string; gap: Gap }[] <!-- internal -->
      <a id="features.feature-status.planGaps"></a><br>Where the feature file weakened its plan since `at` (how a sentence names the commit): a `planned` removed while the code does not implement it (no K202), and a `trigger`, `step` or open question that is no longer there under the same flow and parents: a question is answered in…
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.flows.plannedMismatch](check.md#check.flows.plannedMismatch), [features.feature-status.planItems](features.md#features.feature-status.planItems)
    - type [PlanItem](../../src/feature-status.ts#L616) = Trigger | FlowStep | QuestionItem
      <a id="features.feature-status.PlanItem"></a><br>A flow item whose removal weakens a plan.
    - fn [planItems](../../src/feature-status.ts#L619) (flow: Flow) → { key: string; item: PlanItem }[]
      <a id="features.feature-status.planItems"></a><br>Every `trigger`, `step` and open question of a flow with a key: the flow, its parents, and itself.
    - fn [finding](../../src/feature-status.ts#L643) (diagnostics: readonly Diagnostic[], file: string, line: number, code: string) → Diagnostic | undefined <!-- internal -->
      <a id="features.feature-status.finding"></a><br>The diagnostic with `code` on `line` of `file`, if any.
  - module [flow-bundle](../../src/flow-bundle.ts#L1)
    <a id="features.flow-bundle"></a><br>`keylang flow export|import` (business-flows/26): the portable bundle of business flows. Export writes one self-contained Markdown file — a header comment with its provenance, tables of the layers, nodes, tests, events and integrations the flows reach, the flows themselves, and…
    - brief [base.brief](base.md#base.brief)
    - glob [base.glob](base.md#base.glob)
    - ir [lang.ir](lang.md#lang.ir)
    - json [base.json](base.md#base.json)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [BundleHeader](../../src/flow-bundle.ts#L45)
      <a id="features.flow-bundle.BundleHeader"></a><br>Where a bundle came from.
    - type [BundleLayer](../../src/flow-bundle.ts#L59)
      <a id="features.flow-bundle.BundleLayer"></a><br>A layer of the source repository as the bundle describes it.
    - type [BundleNode](../../src/flow-bundle.ts#L68)
      <a id="features.flow-bundle.BundleNode"></a><br>One row of the nodes table: a node the flows name or reach, with its source details.
    - type [BundleTest](../../src/flow-bundle.ts#L85)
      <a id="features.flow-bundle.BundleTest"></a><br>A `test` line of a flow.
    - type [BundleReach](../../src/flow-bundle.ts#L92)
      <a id="features.flow-bundle.BundleReach"></a><br>An event a flow emits, or an integration one of its nodes calls.
    - type [BundleFlow](../../src/flow-bundle.ts#L102)
      <a id="features.flow-bundle.BundleFlow"></a><br>One flow of a bundle: its `# flow` section as written, with the bundle's comment under the heading.
    - type [Bundle](../../src/flow-bundle.ts#L113)
      <a id="features.flow-bundle.Bundle"></a><br>A bundle as parsed back from its Markdown file.
    - type [ExportFlow](../../src/flow-bundle.ts#L125)
      <a id="features.flow-bundle.ExportFlow"></a><br>A flow the export reads: its section text and the business words known about it.
    - fn [flowIds](../../src/flow-bundle.ts#L138) (text: string) → string[]
      <a id="features.flow-bundle.flowIds"></a><br>Every ID a flow section names (triggers, steps, calls, reads, `then`, planned), in order of first mention.
      - calls [features.flow-bundle.idSpots](features.md#features.flow-bundle.idSpots)
    - fn [flowTests](../../src/flow-bundle.ts#L148) (flow: string, text: string) → BundleTest[]
      <a id="features.flow-bundle.flowTests"></a><br>The `test` lines of a flow section.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [flowEvents](../../src/flow-bundle.ts#L159) (flow: string, text: string) → BundleReach[]
      <a id="features.flow-bundle.flowEvents"></a><br>The `emits` lines of a flow section, as reached events.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [bundleNodes](../../src/flow-bundle.ts#L175) (snapshot: AnalysisSnapshot, flows: readonly ExportFlow[], withCallees: number) → BundleNode[]
      <a id="features.flow-bundle.bundleNodes"></a><br>The nodes of the bundle: every ID the flows name, then (`withCallees` > 0) what they call, to that depth, over resolved calls to fns of the repository. A node keeps the flows that name or reach it.
      - calls [features.flow-bundle.describe](features.md#features.flow-bundle.describe), [features.flow-bundle.plannedIn](features.md#features.flow-bundle.plannedIn), [features.flow-bundle.flowIds](features.md#features.flow-bundle.flowIds)
    - fn [describe](../../src/flow-bundle.ts#L234) (snapshot: AnalysisSnapshot, id: string) → Omit<BundleNode, "role" | "flows"> <!-- internal -->
      <a id="features.flow-bundle.describe"></a><br>A node's row fields from the snapshot; an unknown ID gets kind `?` and its first segment as layer.
      - calls [base.brief.firstSentence](base.md#base.brief.firstSentence)
    - fn [bundleText](../../src/flow-bundle.ts#L250) (input: { header: BundleHeader; layers: readonly BundleLayer[]; nodes: readonly BundleNode[]; tests: readonly BundleTest[]; reached: readonly BundleReach[]; flows: readonly ExportFlow[]; layout?: string }) → string
      <a id="features.flow-bundle.bundleText"></a><br>The bundle as one Markdown file. The same input gives the same bytes.
      - calls [features.flow-bundle.word](features.md#features.flow-bundle.word), [features.flow-bundle.cell](features.md#features.flow-bundle.cell), [features.flow-bundle.row](features.md#features.flow-bundle.row), [features.flow-bundle.code](features.md#features.flow-bundle.code), [features.flow-bundle.text](features.md#features.flow-bundle.text), [features.flow-bundle.withBundleComment](features.md#features.flow-bundle.withBundleComment)
    - fn [withBundleComment](../../src/flow-bundle.ts#L296) (flow: ExportFlow) → string <!-- internal -->
      <a id="features.flow-bundle.withBundleComment"></a><br>The flow's section with the bundle's comment (origin and source) under the heading, then its business process as a quote.
      - calls [features.flow-bundle.quoteLine](features.md#features.flow-bundle.quoteLine), [features.flow-bundle.word](features.md#features.flow-bundle.word)
    - fn [quoteLine](../../src/flow-bundle.ts#L307) (text: string) → string <!-- internal -->
      <a id="features.flow-bundle.quoteLine"></a><br>One line of a quote: no comment it could open, no `<` read as HTML.
    - fn [word](../../src/flow-bundle.ts#L312) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.word"></a><br>A header value: one word, no `-->`.
    - fn [code](../../src/flow-bundle.ts#L317) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.code"></a><br>A table cell as inline code; a value that already holds a backtick is left as plain text.
      - calls [features.flow-bundle.cell](features.md#features.flow-bundle.cell)
    - fn [text](../../src/flow-bundle.ts#L324) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.text"></a><br>A table cell of prose, with `<` escaped so it opens no HTML.
      - calls [features.flow-bundle.cell](features.md#features.flow-bundle.cell)
    - fn [cell](../../src/flow-bundle.ts#L329) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.cell"></a><br>A table cell: one line, `|` escaped.
    - fn [row](../../src/flow-bundle.ts#L334) (cells: readonly string[]) → string <!-- internal -->
      <a id="features.flow-bundle.row"></a><br>One Markdown table row.
    - fn [parseBundle](../../src/flow-bundle.ts#L341) (source: string) → Bundle | { error: string }
      <a id="features.flow-bundle.parseBundle"></a><br>The bundle a file holds, or why it is none.
      - calls [features.flow-bundle.cells](features.md#features.flow-bundle.cells), [features.flow-bundle.plain](features.md#features.flow-bundle.plain), [features.flow-bundle.unescapeText](features.md#features.flow-bundle.unescapeText), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [cells](../../src/flow-bundle.ts#L430) (line: string) → string[] <!-- internal -->
      <a id="features.flow-bundle.cells"></a><br>The cells of a table row, `\|` kept inside a cell.
    - fn [plain](../../src/flow-bundle.ts#L454) (value: string | undefined) → string <!-- internal -->
      <a id="features.flow-bundle.plain"></a><br>A cell without the backticks around it.
    - fn [unescapeText](../../src/flow-bundle.ts#L461) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.unescapeText"></a><br>Undo `text`'s escaping of `<`.
    - type [LayerPlacement](../../src/flow-bundle.ts#L468)
      <a id="features.flow-bundle.LayerPlacement"></a><br>Source layers placed onto target layers, with what the person should know about each placement.
    - type [TargetLayer](../../src/flow-bundle.ts#L474)
      <a id="features.flow-bundle.TargetLayer"></a><br>The layers of the repository a bundle is imported into.
    - type [LayerChoice](../../src/flow-bundle.ts#L481)
      <a id="features.flow-bundle.LayerChoice"></a><br>How each source layer lands: the target layer and how that was decided.
    - fn [parseLayerMap](../../src/flow-bundle.ts#L489) (text: string) → Map<string, string> | { error: string }
      <a id="features.flow-bundle.parseLayerMap"></a><br>`old=new,old2=new2`, or why it is not one.
    - fn [usedLayers](../../src/flow-bundle.ts#L507) (bundle: Bundle) → string[]
      <a id="features.flow-bundle.usedLayers"></a><br>The source layers an import must place: the first segment of every ID of its flows and nodes, and the layers of the test paths.
      - calls [features.flow-bundle.flowIds](features.md#features.flow-bundle.flowIds), [features.flow-bundle.layerOfPath](features.md#features.flow-bundle.layerOfPath), [base.span.compareText](base.md#base.span.compareText)
    - fn [algoLayers](../../src/flow-bundle.ts#L530) (layers: readonly string[], target: readonly TargetLayer[], taken: ReadonlyMap<string, LayerChoice> = new Map()) → LayerPlacement
      <a id="features.flow-bundle.algoLayers"></a><br>The algorithm's choice for the layers the flag and the model left: the layer of the same name, else the first layer of the target (noted).
    - fn [layerMapRequest](../../src/flow-bundle.ts#L550) (bundle: Bundle, layers: readonly string[], target: readonly TargetLayer[]) → LlmRequest
      <a id="features.flow-bundle.layerMapRequest"></a><br>The model's request: which target layer each source layer's code belongs in, by names, roots and descriptions.
      - calls [features.flow-bundle.untrusted](features.md#features.flow-bundle.untrusted)
    - fn [untrusted](../../src/flow-bundle.ts#L584) (text: string) → string
      <a id="features.flow-bundle.untrusted"></a><br>Text of a bundle inside the `<untrusted-bundle>` fence: no tag of the fence (or any other) it could open or close.
    - fn [parseLayerMapAnswer](../../src/flow-bundle.ts#L589) (answer: string, layers: readonly string[], target: readonly TargetLayer[]) → LayerPlacement
      <a id="features.flow-bundle.parseLayerMapAnswer"></a><br>The model's answer checked: each value a target layer, each key a layer asked for; anything else is noted and left to the algorithm.
      - calls [features.flow-bundle.jsonOf](features.md#features.flow-bundle.jsonOf), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [jsonOf](../../src/flow-bundle.ts#L610) (answer: string) → JsonValue | undefined <!-- internal -->
      <a id="features.flow-bundle.jsonOf"></a><br>The JSON object in a model's answer: a code fence stripped, then the text from the first `{` to the last `}`.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
    - fn [layerOfPath](../../src/flow-bundle.ts#L625) (layers: readonly { name: string; globs: string[] }[], path: string) → { name: string; root: string } | null <!-- internal -->
      <a id="features.flow-bundle.layerOfPath"></a><br>The layer whose root holds `path` (the longest root wins), with that root; null when none does.
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix)
    - type [ImportPlan](../../src/flow-bundle.ts#L641)
      <a id="features.flow-bundle.ImportPlan"></a><br>What an import proposes: the feature spec and the migration section, and what the person should know.
    - type [ImportTarget](../../src/flow-bundle.ts#L652)
      <a id="features.flow-bundle.ImportTarget"></a><br>What the import needs to know of the target repository.
    - fn [importPlan](../../src/flow-bundle.ts#L667) (bundle: Bundle, choices: readonly LayerChoice[], target: ImportTarget, options: { name: string; bundleFile: string; mode: string }) → ImportPlan
      <a id="features.flow-bundle.importPlan"></a><br>The import: each flow of the bundle with every ID re-homed (its layer by `choices`, the rest of the ID kept), `planned` declared for each ID the target lacks (with the kind and signature of the bundle's nodes, each ID once in the file), test paths re-homed by layer root, and a…
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [features.flow-bundle.layerOfPath](features.md#features.flow-bundle.layerOfPath), [features.flow-bundle.word](features.md#features.flow-bundle.word), [features.flow-bundle.flowIds](features.md#features.flow-bundle.flowIds), [features.flow-bundle.plannedIn](features.md#features.flow-bundle.plannedIn), [features.flow-bundle.plannedLine](features.md#features.flow-bundle.plannedLine), [features.flow-bundle.rehomedFlow](features.md#features.flow-bundle.rehomedFlow)
    - fn [plannedLine](../../src/flow-bundle.ts#L755) (kind: string | undefined, id: string, signature: string | null, notes: string[]) → string <!-- internal -->
      <a id="features.flow-bundle.plannedLine"></a><br>`- planned <kind> <id> <signature>`; a signature the grammar would not read as one line of words is left out (noted).
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [rehomedFlow](../../src/flow-bundle.ts#L775) (text: string, rehome: (id: string) => string, rehomePath: (path: string) => string, provenance: string, planned: readonly string[]) → string <!-- internal -->
      <a id="features.flow-bundle.rehomedFlow"></a><br>The flow's text with IDs and test paths replaced, the bundle's comment turned into the import's provenance, and the planned lines before the first item.
      - calls [features.flow-bundle.idSpots](features.md#features.flow-bundle.idSpots), [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [withMigration](../../src/flow-bundle.ts#L810) (existing: string | null, name: string, section: string) → string
      <a id="features.flow-bundle.withMigration"></a><br>The text with the `# migration <name>` section replaced (or appended); a file without one starts with it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - type [IdSpot](../../src/flow-bundle.ts#L831) <!-- internal -->
      <a id="features.flow-bundle.IdSpot"></a><br>Where a flow section names an ID: a reference (a link as a whole) or the ID of a `planned`. Offsets into `text`.
    - fn [flowNodes](../../src/flow-bundle.ts#L838) (text: string) → Node[] <!-- internal -->
      <a id="features.flow-bundle.flowNodes"></a><br>The top-level list nodes of every `# flow` section of `text`.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [idSpots](../../src/flow-bundle.ts#L845) (text: string) → IdSpot[] <!-- internal -->
      <a id="features.flow-bundle.idSpots"></a><br>Every place `text` names an ID, sorted by offset.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [plannedIn](../../src/flow-bundle.ts#L866) (text: string) → Map<string, { kind: string; signature: string | null }> <!-- internal -->
      <a id="features.flow-bundle.plannedIn"></a><br>The `planned` items of a flow section: ID → kind and signature.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
  - module [ghost](../../src/ghost.ts#L1)
    <a id="features.ghost"></a><br>Ghost text (design §7.3): one next line of a flow from the agent, shown grey after a pause and only on a cheap signal — the cursor on a new `- ` item of a flow that has a trigger. A suggestion is checked where it would stand, in the buffer: one that does not parse there (a step…
    - analyze [map.analyze](map.md#map.analyze)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - ir [lang.ir](lang.md#lang.ir)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [ghostSignal](../../src/ghost.ts#L20) (path: string, text: string, line: number, col: number) → boolean
      <a id="features.ghost.ghostSignal"></a><br>The cursor line starts a new list item (`- ` and nothing after it) inside a `# flow` with a trigger.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [ghostSuggestions](../../src/ghost.ts#L46) (analysis: Analysis, client: LlmClient, path: string, text: string, line: number, pack: ContextPack | null, signal?: AbortSignal) → Promise<string[]>
      <a id="features.ghost.ghostSuggestions"></a><br>Up to three one-line continuations; each keeps the indentation of the cursor line and names only known IDs. `signal` cancels the request (`LlmCancelled`) once the line it was asked for is gone.
      - calls [features.agent-context.contextText](features.md#features.agent-context.contextText), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.parser.parse](lang.md#lang.parser.parse)
  - module [git-changes](../../src/git-changes.ts#L1)
    <a id="features.git-changes"></a><br>What git says changed in the working tree since a ref: the inputs of `check --changed`, `hook stop` and `code-to-spec --since`, and for `feature` its base commit (the merge-base with the main branch unless `--since` names one), the feature file there with the files changed…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - draft [features.draft](features.md#features.draft)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - graph [map.graph](map.md#map.graph)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - type [ChangedFiles](../../src/git-changes.ts#L30)
      <a id="features.git-changes.ChangedFiles"></a><br>Files changed since a ref. Paths are POSIX, relative to the root.
    - type [GitRunner](../../src/git-changes.ts#L40)
      <a id="features.git-changes.GitRunner"></a><br>Git in one root: `run` returns what git did, `git` its stdout or throws.
    - fn [gitIn](../../src/git-changes.ts#L46) (root: string, label: string) → GitRunner
      <a id="features.git-changes.gitIn"></a><br>A git runner for `root`; `label` names the caller in its errors (`check --changed`).
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [gitUnavailable](../../src/git-changes.ts#L67) (label: string, error: Error & { code?: string }) → string
      <a id="features.git-changes.gitUnavailable"></a><br>Why git did not run; a refusal (EPERM, EACCES) is most likely a sandbox, and says what still works.
    - fn [assertRef](../../src/git-changes.ts#L75) (ref: string, label: string) → void
      <a id="features.git-changes.assertRef"></a><br>A ref git would read as an option (`--output=…`) is refused: it is never passed on.
    - fn [diffArgs](../../src/git-changes.ts#L81) (base: string) → string[] <!-- internal -->
      <a id="features.git-changes.diffArgs"></a><br>Builds the fixed argument list for a `git diff` against a base ref: relative paths, no renames, zero context lines, no color or external diff, and `a/`/`b/` prefixes. Shared by [`features.git-changes.gitChangedFiles`](features.md#features.git-changes.gitChangedFiles) and [`features.git-changes.gitChangedLines`](features.md#features.git-changes.gitChangedLines) so both parse… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [untracked](../../src/git-changes.ts#L84) (git: (args: string[]) => string) → string[] <!-- internal -->
      <a id="features.git-changes.untracked"></a><br>Files git does not track and does not ignore, as NUL-separated paths so any file name survives.
    - fn [ownState](../../src/git-changes.ts#L94) (path: string) → boolean <!-- internal -->
      <a id="features.git-changes.ownState"></a><br>keylang's own local state under `.keylang/` — the index, the fact cache an analysis saves, proposals, reports — is never a source or a spec, so it is never a change, tracked or not, gitignored or not.
    - fn [gitChangedFiles](../../src/git-changes.ts#L97) (root: string, ref: string, label = "check --changed") → ChangedFiles
      <a id="features.git-changes.gitChangedFiles"></a><br>Files changed since `ref` in the working tree, plus files git does not track yet; keylang's own `.keylang/` left out.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.draft.deletedDiffPaths](features.md#features.draft.deletedDiffPaths), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.untracked](features.md#features.git-changes.untracked), [features.git-changes.ownState](features.md#features.git-changes.ownState), [features.git-changes.diskCaseResolver](features.md#features.git-changes.diskCaseResolver)
    - fn [diskCaseResolver](../../src/git-changes.ts#L129) (root: string) → (path: string) => string | null
      <a id="features.git-changes.diskCaseResolver"></a><br>Paths (POSIX, relative to `root`) as the disk spells them: each segment is matched against its directory's entries, exactly first, then without regard to case (and Unicode normalization, as macOS compares names); null when no file is there. Directories are read once per call.
    - fn [gitChangedLines](../../src/git-changes.ts#L168) (root: string, ref: string, label = "code-to-spec --since") → ChangedLines
      <a id="features.git-changes.gitChangedLines"></a><br>The lines changed since `ref` in the working tree, and the files git does not track yet (`all`), relative to `root`.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.git-changes.untracked](features.md#features.git-changes.untracked)
    - fn [changedPathSet](../../src/git-changes.ts#L180) (root: string, files: Iterable<string>, base: string) → Set<string>
      <a id="features.git-changes.changedPathSet"></a><br>Git paths are relative to `root`; check reports spec paths relative to `base`. Both forms match.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [gitFileAt](../../src/git-changes.ts#L196) (root: string, ref: string, path: string, label: string) → string | null
      <a id="features.git-changes.gitFileAt"></a><br>The text of `path` (POSIX, relative to `root`) at `ref`, or null when the file is not in that commit or `HEAD` has no commit yet. An unknown ref, no git, or no repository is an error naming the caller.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [gitSpecFilesAt](../../src/git-changes.ts#L221) (root: string, ref: string, dir: string, label: string, skip: (path: string) => boolean = () => false) → Map<string, string>
      <a id="features.git-changes.gitSpecFilesAt"></a><br>The `.md` files under `dir` (POSIX, relative to `root`) at `ref` and their text; empty when `HEAD` has no commit yet. An unknown ref, no git, or no repository is an error naming the caller. `skip` leaves a path out before it is read (the generated map, reading aids).
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [base.span.compareText](base.md#base.span.compareText)
    - fn [readFeatureBase](../../src/git-changes.ts#L253) (root: string, path: string, since: string | undefined, label: string) → FeatureBase
      <a id="features.git-changes.readFeatureBase"></a><br>The feature file at its base commit, and the files changed since that commit as `check --changed --since <base>` reads them: a rule fail of this change is one that touches them. The base is `since`, else `featureBaseOrigin`.
      - calls [features.git-changes.featureBaseOrigin](features.md#features.git-changes.featureBaseOrigin), [features.git-changes.gitFileAt](features.md#features.git-changes.gitFileAt), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [base.span.compareText](base.md#base.span.compareText), [lang.parser.parse](lang.md#lang.parser.parse)
    - type [GitSummary](../../src/git-changes.ts#L282)
      <a id="features.git-changes.GitSummary"></a><br>Where the working tree stands, for a page that shows the changes (`GET /api/git`).
    - fn [gitSummary](../../src/git-changes.ts#L294) (root: string, label: string) → GitSummary
      <a id="features.git-changes.gitSummary"></a><br>HEAD, its branch, the origin and the branches of the repository around `root`. No git, or no repository, is an error naming the caller.
      - calls [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [base.span.compareText](base.md#base.span.compareText)
    - fn [featureBaseOrigin](../../src/git-changes.ts#L335) (root: string, label: string) → BaseOrigin
      <a id="features.git-changes.featureBaseOrigin"></a><br>The base `feature` judges a change against when no `since` is given: the merge-base of HEAD with the main branch, so a fail committed on a feature branch is still the change's own. The main branch is the one `refs/remotes/origin/HEAD` points at, else a local `main`, `master`…
      - calls [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [deletedModuleIds](../../src/git-changes.ts#L366) (config: Config, files: readonly string[]) → string[]
      <a id="features.git-changes.deletedModuleIds"></a><br>Module id a deleted source file had, so a flow step that named it is still "changed".
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
  - module [git-hook](../../src/git-hook.ts#L1)
    <a id="features.git-hook"></a><br>`keylang hook install`: the git pre-commit hook that runs `check --changed`. The hook file is keylang's as a whole, found by its marker; a hook without the marker belongs to someone else and is never rewritten.
    - node [external.node](external.md#external.node)
    - fn [preCommitCommand](../../src/git-hook.ts#L16) (version: string) → string
      <a id="features.git-hook.preCommitCommand"></a><br>What the hook runs: the published CLI of this version, as the harness hooks do.
    - fn [preCommitText](../../src/git-hook.ts#L25) (version: string, subdir = "") → string
      <a id="features.git-hook.preCommitText"></a><br>The whole hook file. `subdir` is the keylang root relative to the top of the work tree, POSIX, "" when they are the same: the hook enters it before `check --changed`, since git starts every hook at the top level.
      - calls [features.git-hook.preCommitCommand](features.md#features.git-hook.preCommitCommand)
    - type [PreCommitState](../../src/git-hook.ts#L37) = "missing" | "foreign" | "stale" | "current"
      <a id="features.git-hook.PreCommitState"></a><br>`missing`: no file; `foreign`: a hook without keylang's marker; `stale`: keylang's, but other text or not executable.
    - fn [preCommitState](../../src/git-hook.ts#L40) (current: string | null, executable: boolean, version: string, subdir = "") → PreCommitState
      <a id="features.git-hook.preCommitState"></a><br>Classify the existing hook file (`null` when absent) against the text this version would write.
      - calls [features.git-hook.preCommitText](features.md#features.git-hook.preCommitText)
    - fn [gitHooksDir](../../src/git-hook.ts#L54) (cwd: string) → string
      <a id="features.git-hook.gitHooksDir"></a><br>The hooks directory git uses for the repository around `cwd`, absolute: `git rev-parse --git-path hooks` honours `core.hooksPath` and linked worktrees. It is asked from the top level, where a relative `core.hooksPath` is resolved.
      - calls [features.git-hook.gitTopLevel](features.md#features.git-hook.gitTopLevel), [features.git-hook.git](features.md#features.git-hook.git)
    - fn [gitTopLevel](../../src/git-hook.ts#L61) (cwd: string) → string
      <a id="features.git-hook.gitTopLevel"></a><br>The top of the work tree around `cwd`, absolute. Throws outside a git work tree.
      - calls [features.git-hook.git](features.md#features.git-hook.git)
    - fn [git](../../src/git-hook.ts#L66) (cwd: string, args: string[]) → string <!-- internal -->
      <a id="features.git-hook.git"></a><br>Run git in `cwd` and return its trimmed stdout; any failure becomes an error naming the command.
  - module [graph-diff-format](../../src/graph-diff-format.ts#L1)
    <a id="features.graph-diff-format"></a><br>How a `GraphDiff` is shown: a short text report (the terminal), Markdown for a PR comment (summary, tables, a mermaid block), a mermaid flowchart alone, and the diagram the web page draws on its canvas. Pure: the same diff gives the same bytes.
    - diagram [map.diagram](map.md#map.diagram)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - graph-diff [features.graph-diff](features.md#features.graph-diff)
    - span [base.span](base.md#base.span)
    - type [DiffFormat](../../src/graph-diff-format.ts#L23) = (typeof DIFF_FORMATS)[number]
      <a id="features.graph-diff-format.DiffFormat"></a>
    - fn [isDiffFormat](../../src/graph-diff-format.ts#L26) (text: string) → text is DiffFormat
      <a id="features.graph-diff-format.isDiffFormat"></a><br>Whether `text` names an output format of `keylang diff`.
    - fn [diffSummary](../../src/graph-diff-format.ts#L34) (diff: GraphDiff) → string
      <a id="features.graph-diff-format.diffSummary"></a><br>One line: what changed, counted by kind.
    - fn [heading](../../src/graph-diff-format.ts#L49) (diff: GraphDiff) → string <!-- internal -->
      <a id="features.graph-diff-format.heading"></a><br>The heading both reports start with: from where to where, at which level.
    - fn [diffText](../../src/graph-diff-format.ts#L56) (diff: GraphDiff) → string
      <a id="features.graph-diff-format.diffText"></a><br>The `keylang diff` report for a terminal: a heading, the summary, then each kind of change.
      - calls [features.graph-diff-format.heading](features.md#features.graph-diff-format.heading), [features.graph-diff-format.diffSummary](features.md#features.graph-diff-format.diffSummary)
    - fn [cell](../../src/graph-diff-format.ts#L91) (text: string) → string <!-- internal -->
      <a id="features.graph-diff-format.cell"></a><br>A Markdown table cell: pipes escaped, line breaks flattened.
    - fn [code](../../src/graph-diff-format.ts#L96) (text: string) → string <!-- internal -->
      <a id="features.graph-diff-format.code"></a><br>Inline code in a table cell, safe for backticks in the text.
      - calls [features.graph-diff-format.cell](features.md#features.graph-diff-format.cell)
    - fn [diffMarkdown](../../src/graph-diff-format.ts#L101) (diff: GraphDiff, subgraph: DiffSubgraph) → string
      <a id="features.graph-diff-format.diffMarkdown"></a><br>The report for a PR comment: the heading, the summary, a table per kind of change and the mermaid picture.
      - calls [features.graph-diff-format.cell](features.md#features.graph-diff-format.cell), [features.graph-diff-format.heading](features.md#features.graph-diff-format.heading), [features.graph-diff-format.diffSummary](features.md#features.graph-diff-format.diffSummary), [features.graph-diff-format.code](features.md#features.graph-diff-format.code), [features.graph-diff-format.diffMermaid](features.md#features.graph-diff-format.diffMermaid)
    - fn [mermaidLabel](../../src/graph-diff-format.ts#L148) (text: string) → string <!-- internal -->
      <a id="features.graph-diff-format.mermaidLabel"></a><br>A label inside `["…"]`: quotes and the characters mermaid reads as markup as entities.
    - fn [diffMermaid](../../src/graph-diff-format.ts#L157) (subgraph: DiffSubgraph) → string
      <a id="features.graph-diff-format.diffMermaid"></a><br>The picture as a mermaid `flowchart LR`. A node's mermaid ID is its index (`n0`, `n1`…): an ID of the code may hold any character, so it only ever appears as an escaped label.
      - calls [features.graph-diff-format.mermaidLabel](features.md#features.graph-diff-format.mermaidLabel)
    - fn [diffDiagram](../../src/graph-diff-format.ts#L187) (subgraph: DiffSubgraph, layerOrder: readonly string[]) → Diagram
      <a id="features.graph-diff-format.diffDiagram"></a><br>The picture as a diagram of the web page, laid out by `layout`: a lane per layer in `layerOrder` (then any other, by name), module and fn shapes with `diff`, edges as dependencies or calls labelled `+`/`−`.
      - calls [base.span.compareText](base.md#base.span.compareText), [map.diagram.layout](map.md#map.diagram.layout)
  - module [graph-diff-run](../../src/graph-diff-run.ts#L1)
    <a id="features.graph-diff-run"></a><br>`keylang diff` and `GET /api/graph-diff` up to the model: which two revisions a range names, both analysed (a commit in a temporary directory, the working tree in place), and their `GraphDiff` with the picture of it. Reads git and files; writes nothing in the repository (the…
    - analyze [map.analyze](map.md#map.analyze)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - graph-diff [features.graph-diff](features.md#features.graph-diff)
    - revision-tree [features.revision-tree](features.md#features.revision-tree)
    - type [DiffRange](../../src/graph-diff-run.ts#L17)
      <a id="features.graph-diff-run.DiffRange"></a><br>The two sides a range names: a ref, or null for the default (the base of a feature; the working tree).
    - fn [parseRange](../../src/graph-diff-run.ts#L26) (text: string | undefined, label: string) → DiffRange
      <a id="features.graph-diff-run.parseRange"></a><br>`<base>`, `<base>..<head>` or nothing. An empty side of `..` is `HEAD`, as git reads it; `...` (a symmetric range) is refused, never guessed at.
    - type [DiffRequest](../../src/graph-diff-run.ts#L38)
      <a id="features.graph-diff-run.DiffRequest"></a><br>What one diff asks for.
    - type [DiffRun](../../src/graph-diff-run.ts#L47)
      <a id="features.graph-diff-run.DiffRun"></a><br>The diff, the picture of it, and the two analyses it came from.
    - fn [analysisOf](../../src/graph-diff-run.ts#L66) (root: string, revision: Revision, label: string) → Promise<Analysis> <!-- internal -->
      <a id="features.graph-diff-run.analysisOf"></a><br>The analysis of `revision`: the working tree in place, a commit in a temporary directory (cached by its id). Both sides leave test reports, traces and the migration's old stack out, so evidence only one side has makes no finding new; the working tree's fact cache is read, not…
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [features.revision-tree.analyzeRevision](features.md#features.revision-tree.analyzeRevision)
    - fn [runGraphDiff](../../src/graph-diff-run.ts#L84) (request: DiffRequest) → Promise<DiffRun>
      <a id="features.graph-diff-run.runGraphDiff"></a><br>Resolves the range, analyses both sides and diffs them. A bad ref, no git or no repository is an error naming `label`.
      - calls [features.git-changes.featureBaseOrigin](features.md#features.git-changes.featureBaseOrigin), [features.revision-tree.resolveRevision](features.md#features.revision-tree.resolveRevision), [features.revision-tree.workingTree](features.md#features.revision-tree.workingTree), [features.graph-diff-run.analysisOf](features.md#features.graph-diff-run.analysisOf), [features.graph-diff.graphDiff](features.md#features.graph-diff.graphDiff), [features.graph-diff.diffSubgraph](features.md#features.graph-diff.diffSubgraph)
  - module [graph-diff](../../src/graph-diff.ts#L1)
    <a id="features.graph-diff"></a><br>The difference between two analyses of one repository (`keylang diff`, `GET /api/graph-diff`): which modules (and with `fn`, functions) were added, removed or changed, which dependency edges (and calls) appeared or went, which flow steps changed, which findings are new or…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - check-results [features.check-results](features.md#features.check-results)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - ir [lang.ir](lang.md#lang.ir)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - revision-tree [features.revision-tree](features.md#features.revision-tree)
    - weakening [features.weakening](features.md#features.weakening)
    - type [DiffLevel](../../src/graph-diff.ts#L28) = "module" | "fn"
      <a id="features.graph-diff.DiffLevel"></a><br>How deep the diff goes: modules and their dependencies, or also functions and their calls.
    - fn [isDiffLevel](../../src/graph-diff.ts#L33) (text: string) → text is DiffLevel
      <a id="features.graph-diff.isDiffLevel"></a><br>Whether `text` names a diff level.
    - type [NodeChange](../../src/graph-diff.ts#L38) = "signature" | "body" | "deps" | "layer" | "file"
      <a id="features.graph-diff.NodeChange"></a><br>What changed in a node that is in both analyses.
    - type [DiffNode](../../src/graph-diff.ts#L41)
      <a id="features.graph-diff.DiffNode"></a><br>A node added, removed or changed.
    - type [DiffEdge](../../src/graph-diff.ts#L54)
      <a id="features.graph-diff.DiffEdge"></a><br>A dependency between modules (`dep`) or a call between functions (`call`) that appeared or went.
    - type [DiffFlow](../../src/graph-diff.ts#L62)
      <a id="features.graph-diff.DiffFlow"></a><br>A flow added, removed, or with steps that appeared or went (keys of `planItems`, parents joined by ` › `).
    - type [DiffFinding](../../src/graph-diff.ts#L69)
      <a id="features.graph-diff.DiffFinding"></a><br>A finding (a check result that is not ok) the head has and the base has not (`new`), or the other way (`fixed`).
    - type [DiffSide](../../src/graph-diff.ts#L82)
      <a id="features.graph-diff.DiffSide"></a><br>One side of the diff as the reports name it.
    - type [GraphDiff](../../src/graph-diff.ts#L91)
      <a id="features.graph-diff.GraphDiff"></a><br>The whole difference, every list sorted by ID or key.
    - fn [graphDiff](../../src/graph-diff.ts#L104) (input: { base: Analysis; head: Analysis; baseRevision: Revision; headRevision: Revision; level: DiffLevel }) → GraphDiff
      <a id="features.graph-diff.graphDiff"></a><br>The difference between the `base` and `head` analyses at `level`. Pure.
      - calls [features.graph-diff.graphOf](features.md#features.graph-diff.graphOf), [features.graph-diff.sideOf](features.md#features.graph-diff.sideOf), [features.graph-diff.nodeDiff](features.md#features.graph-diff.nodeDiff), [features.graph-diff.edgeDiff](features.md#features.graph-diff.edgeDiff), [features.graph-diff.flowDiff](features.md#features.graph-diff.flowDiff), [features.graph-diff.findingDiff](features.md#features.graph-diff.findingDiff), [features.weakening.specWeakenings](features.md#features.weakening.specWeakenings), [features.graph-diff.ownSpecs](features.md#features.graph-diff.ownSpecs)
    - fn [newFails](../../src/graph-diff.ts#L122) (diff: GraphDiff) → number
      <a id="features.graph-diff.newFails"></a><br>Whether the diff brings a new failure: a new `fail` finding or a weakened spec (K108).
    - fn [sideOf](../../src/graph-diff.ts#L126) (revision: Revision) → DiffSide <!-- internal -->
      <a id="features.graph-diff.sideOf"></a>
    - type [NodeFacts](../../src/graph-diff.ts#L131) <!-- internal -->
      <a id="features.graph-diff.NodeFacts"></a><br>What a node is, for comparing: everything a change is read from, lines left out.
    - type [LevelGraph](../../src/graph-diff.ts#L143) <!-- internal -->
      <a id="features.graph-diff.LevelGraph"></a><br>The nodes and edges of one snapshot at a level.
    - fn [graphOf](../../src/graph-diff.ts#L155) (snapshot: AnalysisSnapshot | null, level: DiffLevel) → LevelGraph <!-- internal -->
      <a id="features.graph-diff.graphOf"></a><br>The module (and fn) nodes of a snapshot and their edges: a module's dependencies (`deps`), and at `fn` a fn's calls. A module's body digest covers its values and every fn and type it holds, so a changed function shows on its module at the module level too.
      - calls [features.graph-diff.moduleOf](features.md#features.graph-diff.moduleOf), [base.span.compareText](base.md#base.span.compareText), [features.graph-diff.digest](features.md#features.graph-diff.digest), [features.graph-diff.factsOf](features.md#features.graph-diff.factsOf)
    - fn [factsOf](../../src/graph-diff.ts#L193) (kind: NodeFacts["kind"], node: SnapshotNode, body: string, deps: string[]) → NodeFacts <!-- internal -->
      <a id="features.graph-diff.factsOf"></a>
    - fn [moduleOf](../../src/graph-diff.ts#L198) (nodes: AnalysisSnapshot["nodes"], id: string) → string | null <!-- internal -->
      <a id="features.graph-diff.moduleOf"></a><br>The module `id` lies in: itself or its longest prefix that is a module node; null when none is.
    - fn [digest](../../src/graph-diff.ts#L212) (parts: readonly string[]) → string <!-- internal -->
      <a id="features.graph-diff.digest"></a>
    - fn [nodeDiff](../../src/graph-diff.ts#L217) (base: LevelGraph, head: LevelGraph) → DiffNode[] <!-- internal -->
      <a id="features.graph-diff.nodeDiff"></a><br>Added, removed and changed nodes, sorted by ID.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [edgeDiff](../../src/graph-diff.ts#L249) (base: ReadonlySet<string>, head: ReadonlySet<string>) → DiffEdge[] <!-- internal -->
      <a id="features.graph-diff.edgeDiff"></a><br>Edges only one side has, sorted by `source→target:kind`.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.graph-diff.edgeKey](features.md#features.graph-diff.edgeKey)
    - fn [edgeKey](../../src/graph-diff.ts#L263) (edge: Pick<DiffEdge, "source" | "target" | "kind">) → string
      <a id="features.graph-diff.edgeKey"></a><br>The key an edge is known by: `source→target:kind`.
    - fn [flowDiff](../../src/graph-diff.ts#L268) (base: Analysis, head: Analysis) → DiffFlow[] <!-- internal -->
      <a id="features.graph-diff.flowDiff"></a><br>Flows of hand-written specs whose plan items differ, by name.
      - calls [features.feature-status.planItems](features.md#features.feature-status.planItems), [base.span.compareText](base.md#base.span.compareText), [features.graph-diff.multisetMinus](features.md#features.graph-diff.multisetMinus)
    - fn [multisetMinus](../../src/graph-diff.ts#L297) (from: readonly string[], take: readonly string[]) → string[] <!-- internal -->
      <a id="features.graph-diff.multisetMinus"></a><br>The items of `from` left after taking out one occurrence per item of `take`.
    - fn [findingDiff](../../src/graph-diff.ts#L318) (base: Analysis, head: Analysis) → DiffFinding[] <!-- internal -->
      <a id="features.graph-diff.findingDiff"></a><br>Findings (every check result but `ok`) only one side has. Two findings are the same when code, criterion, area and verdict match and their messages match with positions (`:12`, `line 12`) taken out, as a multiset: a rule broken again from the same module is a new finding, one…
      - calls [features.check-results.checkReport](features.md#features.check-results.checkReport), [features.graph-diff.withoutPositions](features.md#features.graph-diff.withoutPositions), [base.span.compareText](base.md#base.span.compareText)
    - fn [withoutPositions](../../src/graph-diff.ts#L349) (message: string) → string <!-- internal -->
      <a id="features.graph-diff.withoutPositions"></a><br>A message with its positions taken out: `file.md:12:3` → `file.md:#`, `line 12` → `line #`.
    - type [SubgraphNode](../../src/graph-diff.ts#L354)
      <a id="features.graph-diff.SubgraphNode"></a><br>A node of the picture of a diff: a changed one or a neighbour of one, with what the snapshots know of it.
    - type [SubgraphEdge](../../src/graph-diff.ts#L365)
      <a id="features.graph-diff.SubgraphEdge"></a><br>An edge between two nodes of the picture; `diff` null when both sides have it.
    - type [DiffSubgraph](../../src/graph-diff.ts#L373)
      <a id="features.graph-diff.DiffSubgraph"></a><br>The picture of a diff: what is drawn, and how many nodes did not fit.
    - fn [diffSubgraph](../../src/graph-diff.ts#L388) (diff: GraphDiff, base: Analysis, head: Analysis, limit: number = SUBGRAPH_LIMIT) → DiffSubgraph
      <a id="features.graph-diff.diffSubgraph"></a><br>The changed nodes and their neighbours one edge away (over the edges of either side), changed ones first, each group by ID, at most `limit`; the edges of either side between the nodes kept. Pure.
      - calls [features.graph-diff.graphOf](features.md#features.graph-diff.graphOf), [base.span.compareText](base.md#base.span.compareText), [features.graph-diff.edgeKey](features.md#features.graph-diff.edgeKey)
    - fn [ownSpecs](../../src/graph-diff.ts#L434) (analysis: Analysis) → Document[] <!-- internal -->
      <a id="features.graph-diff.ownSpecs"></a><br>The documents a person wrote: the rendered map and other generated files left out.
  - module [greenfield](../../src/greenfield.ts#L1)
    <a id="features.greenfield"></a><br>A project from a diagram (business-flows/29): what «Створити специфікацію» of `keylang web --new` writes into an empty project, as texts. Pure: the drawing comes in, the files come out, and the operation (`operations/greenfield.ts`) writes them — only into a project with no…
    - config [base.config](base.md#base.config)
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - diagram-proposal [features.diagram-proposal](features.md#features.diagram-proposal)
    - languages [base.languages](base.md#base.languages)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [LanguageChoices](../../src/greenfield.ts#L40) <!-- internal -->
      <a id="features.greenfield.LanguageChoices"></a><br>A choice of the dialog, by what it shows: the languages it stands for.
    - type [GreenfieldInput](../../src/greenfield.ts#L53)
      <a id="features.greenfield.GreenfieldInput"></a><br>What the `web --new` dialog sends: the drawing, chosen languages, the idea and where specs go.
    - type [GreenfieldFile](../../src/greenfield.ts#L64)
      <a id="features.greenfield.GreenfieldFile"></a><br>One file the operation will create.
    - type [GreenfieldPlan](../../src/greenfield.ts#L71)
      <a id="features.greenfield.GreenfieldPlan"></a><br>Every file of the new project, plus what the dialog reports back (layers, features, notes).
    - fn [strip](../../src/greenfield.ts#L95) (id: string) → string <!-- internal -->
      <a id="features.greenfield.strip"></a><br>The bare ID of a shape, without the editor's `planned:` prefix.
    - fn [prose](../../src/greenfield.ts#L98) (text: string) → string <!-- internal -->
      <a id="features.greenfield.prose"></a><br>A line of prose that no parser reads as a list item, a heading or a quote.
    - fn [greenfieldPlan](../../src/greenfield.ts#L106) (input: GreenfieldInput) → GreenfieldPlan | string
      <a id="features.greenfield.greenfieldPlan"></a><br>The files of a new project drawn on the canvas, or what keeps it from being one.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.greenfield.strip](features.md#features.greenfield.strip), [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName), [features.diagram-proposal.diagramChanges](features.md#features.diagram-proposal.diagramChanges), [features.greenfield.prose](features.md#features.greenfield.prose), [map.diagram-layout.shapeBase](map.md#map.diagram-layout.shapeBase), [map.diagram-layout.layoutPath](map.md#map.diagram-layout.layoutPath), [map.diagram-layout.layoutText](map.md#map.diagram-layout.layoutText)
  - module [harness](../../src/harness.ts#L1)
    <a id="features.harness"></a><br>Harness adapters: one pure merge from the files on disk and the selected harnesses to the next text. Markdown keeps a marked block; JSON replaces only the `keylang` key; TOML splices only the `[mcp_servers.keylang]` table, so comments and layout around it stay. `--agents=none`…
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - config [base.config](base.md#base.config)
    - imports [map.imports](map.md#map.imports)
    - json [base.json](base.md#base.json)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - fn [skillFile](../../src/harness.ts#L43) () → string
      <a id="features.harness.skillFile"></a><br>The skill shipped in the package. The same relative path works from `src` and from `dist`.
    - type [HarnessName](../../src/harness.ts#L51) = (typeof HARNESS_NAMES)[number]
      <a id="features.harness.HarnessName"></a><br>One harness name.
    - type [MergedText](../../src/harness.ts#L54) <!-- internal -->
      <a id="features.harness.MergedText"></a><br>A harness file after a merge: its text, null when the file goes away.
    - type [MergeResult](../../src/harness.ts#L59) = MergedText | { error: string } <!-- internal -->
      <a id="features.harness.MergeResult"></a><br>A merge, or why the file cannot be merged.
    - fn [denyRules](../../src/harness.ts#L86) (dir: string) → string[] <!-- internal -->
      <a id="features.harness.denyRules"></a><br>Claude's deny entries that keep an agent from editing the rules of the spec directory `dir` (every `rules*.md`), `keylang.json` — its `exclude`, `assume`, `outside`, `layers` and `frameworks` decide what the rules see (ticket 49) — or deciding a proposal. `hook stop` blocks a…
    - fn [specDir](../../src/harness.ts#L101) (root: string) → string <!-- internal -->
      <a id="features.harness.specDir"></a><br>The spec directory of `keylang.json` under `root` (`dir`, normalized), or `keylang` without the file. A broken file throws, naming the file and the field.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig)
    - type [HarnessSelection](../../src/harness.ts#L115)
      <a id="features.harness.HarnessSelection"></a><br>Which harnesses to configure, and whether keylang's instructions are installed at all.
    - type [HarnessFile](../../src/harness.ts#L122)
      <a id="features.harness.HarnessFile"></a><br>One harness file's desired text.
    - type [HarnessPlan](../../src/harness.ts#L129)
      <a id="features.harness.HarnessPlan"></a><br>The desired files, or the first file that cannot be merged (then nothing may be written).
    - fn [parseAgents](../../src/harness.ts#L135) (value: string) → HarnessSelection
      <a id="features.harness.parseAgents"></a><br>`--agents=<list>`. `none` is the empty selection. An unknown name throws and lists the allowed names.
      - calls [features.harness.isHarnessName](features.md#features.harness.isHarnessName)
    - type [HarnessProbe](../../src/harness.ts#L157)
      <a id="features.harness.HarnessProbe"></a><br>What is on disk for harness detection. `list` returns child names, or null when the path is not a directory.
    - fn [detectHarnesses](../../src/harness.ts#L167) (probe: HarnessProbe) → HarnessName[]
      <a id="features.harness.detectHarnesses"></a><br>Directories and files that mean a harness is already in use. Order matches `HARNESS_NAMES`. `.claude/skills/keylang-feature` is the copy `agents` writes for every harness, so that tree alone is not Claude.
      - calls [features.harness.claudePresent](features.md#features.harness.claudePresent)
    - fn [claudePresent](../../src/harness.ts#L185) (probe: HarnessProbe) → boolean <!-- internal -->
      <a id="features.harness.claudePresent"></a><br>Claude is in use when `.claude` exists and is empty, or holds anything besides keylang's skill copy.
      - calls [features.harness.claudeHasUserFile](features.md#features.harness.claudeHasUserFile)
    - fn [claudeHasUserFile](../../src/harness.ts#L196) (probe: HarnessProbe, dir: string) → boolean <!-- internal -->
      <a id="features.harness.claudeHasUserFile"></a><br>A file under `.claude` that is not the keylang skill copy.
    - fn [agentsBody](../../src/harness.ts#L217) (version: string, dir: string) → string
      <a id="features.harness.agentsBody"></a><br>The instruction body between the markers, without a trailing newline. The CLI fallback pins `version`; paths are under the spec directory `dir`.
      - calls [features.harness.cliCommand](features.md#features.harness.cliCommand)
    - type [McpCommand](../../src/harness.ts#L254) = { command: string; args: string[] }
      <a id="features.harness.McpCommand"></a><br>An MCP server's command line, split the way MCP configs store it.
    - fn [mcpCommand](../../src/harness.ts#L257) (version: string) → McpCommand
      <a id="features.harness.mcpCommand"></a><br>`npx -y keylang@<version> mcp`, split the way MCP configs store a command.
    - fn [cliCommand](../../src/harness.ts#L262) (version: string) → string
      <a id="features.harness.cliCommand"></a><br>The pinned CLI the fallback names: the same package and version as the MCP server, so it needs no global `keylang`.
    - fn [pinSkill](../../src/harness.ts#L271) (skill: string, version: string, dir: string) → string
      <a id="features.harness.pinSkill"></a><br>The skill resource names the CLI as `npx -y keylang@<version>` and the spec directory as `<dir>/`; the copy a harness gets pins the running version and the repository's `dir`.
    - fn [hookCommand](../../src/harness.ts#L276) (version: string) → string
      <a id="features.harness.hookCommand"></a><br>What the Stop hook runs.
      - calls [features.harness.cliCommand](features.md#features.harness.cliCommand)
    - fn [planHarness](../../src/harness.ts#L286) (input: { selection: HarnessSelection; version: string; dir: string; skill: string; files: ReadonlyMap<string, string | null> }) → HarnessPlan
      <a id="features.harness.planHarness"></a><br>Desired text of every harness file this selection owns. `files` holds the current text, null when the file is absent; `dir` is the spec directory the instructions, the skill and the deny rules name. The first broken marker or invalid JSON/TOML is `error` and `files` is empty…
      - calls [features.harness.agentsBody](features.md#features.harness.agentsBody), [features.harness.mergeMarked](features.md#features.harness.mergeMarked), [features.harness.mergeClaude](features.md#features.harness.mergeClaude), [features.harness.mergeMcpJson](features.md#features.harness.mergeMcpJson), [features.harness.mergeCodexToml](features.md#features.harness.mergeCodexToml), [features.harness.opencodeFile](features.md#features.harness.opencodeFile), [features.harness.mergeOpencode](features.md#features.harness.mergeOpencode), [features.harness.pinSkill](features.md#features.harness.pinSkill), [features.harness.mergeSettings](features.md#features.harness.mergeSettings), [features.harness.mergeHooksFile](features.md#features.harness.mergeHooksFile)
    - fn [mergeMarked](../../src/harness.ts#L392) (existing: string | null, body: string | null) → MergeResult
      <a id="features.harness.mergeMarked"></a><br>Splice `body` between the markers. Text outside them is copied byte for byte. `body` null removes the block.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [features.harness.marked](features.md#features.harness.marked)
    - fn [marked](../../src/harness.ts#L432) (body: string, nl: "\n" | "\r\n") → string <!-- internal -->
      <a id="features.harness.marked"></a><br>The block with its markers, in the file's newline style.
    - fn [mergeClaude](../../src/harness.ts#L442) (existing: string | null) → MergeResult <!-- internal -->
      <a id="features.harness.mergeClaude"></a><br>`@AGENTS.md` lives in the managed block. A file that already says it outside the block is left without a second copy (the block is removed).
      - calls [features.harness.outsideMarkers](features.md#features.harness.outsideMarkers), [features.harness.isMarkersError](features.md#features.harness.isMarkersError), [features.harness.mergeMarked](features.md#features.harness.mergeMarked)
    - fn [isMarkersError](../../src/harness.ts#L453) (outside: string | { error: string }) → outside is { error: string } <!-- internal -->
      <a id="features.harness.isMarkersError"></a><br>Narrows `outsideMarkers`' result to its error.
    - fn [outsideMarkers](../../src/harness.ts#L458) (existing: string | null) → string | { error: string } <!-- internal -->
      <a id="features.harness.outsideMarkers"></a><br>The text of a file without keylang's block (empty for no file), or the marker error.
    - fn [mergeMcpJson](../../src/harness.ts#L473) (existing: string | null, version: string | null) → MergeResult <!-- internal -->
      <a id="features.harness.mergeMcpJson"></a><br>`.mcp.json` / `.cursor/mcp.json`: the `mcpServers.keylang` entry (null version: remove it).
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [mergeOpencode](../../src/harness.ts#L478) (existing: string | null, version: string | null, jsonc: boolean) → MergeResult <!-- internal -->
      <a id="features.harness.mergeOpencode"></a><br>`jsonc`: the file is `opencode.jsonc`, so comments and trailing commas parse; a rewrite is still plain JSON.
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey)
    - fn [mergeCodexToml](../../src/harness.ts#L507) (existing: string | null, version: string | null) → MergeResult <!-- internal -->
      <a id="features.harness.mergeCodexToml"></a><br>The whole file is parsed (invalid TOML is an error, and the entry's own keys come from the parse), but only the lines of the `[mcp_servers.keylang]` table — header to the next header, its sub-tables included — are replaced, removed or appended, so the person's comments and…
      - calls [features.harness.isTomlTable](features.md#features.harness.isTomlTable), [features.harness.codexTableRegion](features.md#features.harness.codexTableRegion), [features.harness.rewriteCodexToml](features.md#features.harness.rewriteCodexToml), [features.harness.withoutLines](features.md#features.harness.withoutLines), [features.harness.codexEntryIs](features.md#features.harness.codexEntryIs), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [codexTableRegion](../../src/harness.ts#L559) (lines: readonly string[]) → { start: number; end: number } | null <!-- internal -->
      <a id="features.harness.codexTableRegion"></a><br>Lines `[start, end)` of the `[mcp_servers.keylang]` table and its sub-tables, or null without the header.
    - fn [withoutLines](../../src/harness.ts#L572) (lines: readonly string[], region: { start: number; end: number }) → string[] <!-- internal -->
      <a id="features.harness.withoutLines"></a><br>The lines without `[start, end)`; a blank line the removal left doubled (or last) goes with them.
    - fn [codexEntryIs](../../src/harness.ts#L586) (text: string, entry: TomlTable | undefined) → boolean <!-- internal -->
      <a id="features.harness.codexEntryIs"></a><br>Whether `text` parses and its `mcp_servers.keylang` is exactly `entry` (undefined: absent).
      - calls [features.harness.isTomlTable](features.md#features.harness.isTomlTable)
    - fn [rewriteCodexToml](../../src/harness.ts#L598) (data: TomlTable, entry: TomlTable | null) → MergedText <!-- internal -->
      <a id="features.harness.rewriteCodexToml"></a><br>The whole file re-serialized with `entry` as the keylang server (null: without one); empty data is no file.
      - calls [features.harness.isTomlTable](features.md#features.harness.isTomlTable)
    - fn [mergeSettings](../../src/harness.ts#L616) (existing: string | null, version: string | null, dir: string) → MergeResult <!-- internal -->
      <a id="features.harness.mergeSettings"></a><br>`.claude/settings.json`: keylang's deny rules and its Stop hook, added or removed; a file without them is left as is on removal.
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.holdsKeylangSettings](features.md#features.harness.holdsKeylangSettings), [features.harness.mergeDeny](features.md#features.harness.mergeDeny), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeHooksFile](../../src/harness.ts#L640) (existing: string | null, version: string | null) → MergeResult <!-- internal -->
      <a id="features.harness.mergeHooksFile"></a><br>`.codex/hooks.json`: keylang's Stop hook, added or removed.
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.holdsOurHook](features.md#features.harness.holdsOurHook), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeDeny](../../src/harness.ts#L662) (permissions: JsonValue | undefined, install: boolean, dir: string) → { value: JsonObject | undefined } | { error: string } <!-- internal -->
      <a id="features.harness.mergeDeny"></a><br>keylang's deny entries for the spec directory `dir` are added (`install`) or removed. Its entries for the default directory are keylang's too: they go once `dir` is another one, so a changed `dir` leaves no stale entry behind.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.harness.denyRules](features.md#features.harness.denyRules)
    - fn [mergeHooksValue](../../src/harness.ts#L686) (hooks: JsonValue | undefined, version: string | null) → { value: JsonObject | undefined } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksValue"></a><br>The `hooks` object with keylang's Stop hook re-pinned, added or removed; other hooks and groups stay.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.harness.rewriteGroup](features.md#features.harness.rewriteGroup), [features.harness.hookCommand](features.md#features.harness.hookCommand), [features.harness.emptyGroup](features.md#features.harness.emptyGroup)
    - fn [rewriteGroup](../../src/harness.ts#L718) (group: JsonValue, version: string | null) → { value: JsonObject } | { error: string } <!-- internal -->
      <a id="features.harness.rewriteGroup"></a><br>One `hooks.Stop` group with keylang's hook command re-pinned to `version`, or dropped when `version` is null.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.harness.isOurHook](features.md#features.harness.isOurHook), [features.harness.hookCommand](features.md#features.harness.hookCommand)
    - fn [emptyGroup](../../src/harness.ts#L740) (group: JsonObject) → boolean <!-- internal -->
      <a id="features.harness.emptyGroup"></a><br>A Stop group with no hooks and nothing else of the person's in it.
    - fn [isOurHook](../../src/harness.ts#L745) (command: string) → boolean <!-- internal -->
      <a id="features.harness.isOurHook"></a><br>A hook command that runs keylang's `hook stop`, any version.
    - fn [holdsKeylangSettings](../../src/harness.ts#L750) (data: JsonObject, dir: string) → boolean <!-- internal -->
      <a id="features.harness.holdsKeylangSettings"></a><br>Whether Claude's settings hold anything of keylang's: a deny rule of the spec directory `dir` (or of the default one), or the Stop hook.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.harness.denyRules](features.md#features.harness.denyRules), [base.json.isJsonString](base.md#base.json.isJsonString), [features.harness.holdsOurHook](features.md#features.harness.holdsOurHook)
    - fn [holdsOurHook](../../src/harness.ts#L760) (hooks: JsonValue | undefined) → boolean <!-- internal -->
      <a id="features.harness.holdsOurHook"></a><br>Whether a `hooks` object has keylang's Stop hook in any group.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.harness.isOurHook](features.md#features.harness.isOurHook)
    - fn [mergeJsonKey](../../src/harness.ts#L767) (existing: string | null, path: readonly string[], server: JsonValue, jsonc = false) → MergeResult <!-- internal -->
      <a id="features.harness.mergeJsonKey"></a><br>Set or remove `keylang` under the top-level key `path[0]` of a JSON file; the rest is re-serialized as is.
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [parseObject](../../src/harness.ts#L790) (existing: string | null, jsonc = false) → { value: JsonObject } | { error: string } <!-- internal -->
      <a id="features.harness.parseObject"></a><br>The object in a JSON file; with `jsonc`, comments and trailing commas are allowed (`opencode.jsonc`).
      - calls [map.imports.parseJsoncStrict](map.md#map.imports.parseJsoncStrict), [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [finishJson](../../src/harness.ts#L805) (data: JsonObject) → MergedText <!-- internal -->
      <a id="features.harness.finishJson"></a><br>Pretty JSON with a final newline; an empty object means the file goes.
    - fn [opencodeFile](../../src/harness.ts#L812) (files: ReadonlyMap<string, string | null>) → string <!-- internal -->
      <a id="features.harness.opencodeFile"></a><br>The opencode config to edit: an existing `opencode.json`, else an existing `.jsonc`, else a new `opencode.json`.
    - fn [isHarnessName](../../src/harness.ts#L821) (name: string) → name is HarnessName <!-- internal -->
      <a id="features.harness.isHarnessName"></a><br>Narrows a string to a known harness name.
    - fn [isTomlTable](../../src/harness.ts#L826) (value: TomlValue | undefined) → value is TomlTable <!-- internal -->
      <a id="features.harness.isTomlTable"></a><br>A TOML table; a date is an object too, but no table.
    - type [HarnessChoice](../../src/harness.ts#L833) = "auto" | "none" | readonly HarnessName[]
      <a id="features.harness.HarnessChoice"></a><br>Which harnesses: detected from the disk, none (strip keylang's files), or a named, non-empty list.
    - fn [harnessChoice](../../src/harness.ts#L836) (flag: string | undefined) → HarnessChoice
      <a id="features.harness.harnessChoice"></a><br>`--agents=<list>` as a choice; left out, the harnesses are detected. Throws as `parseAgents` does.
      - calls [features.harness.parseAgents](features.md#features.harness.parseAgents)
    - fn [keylangVersion](../../src/harness.ts#L844) () → string
      <a id="features.harness.keylangVersion"></a><br>The version the MCP command and the Stop hook pin: the running keylang's `package.json`, from `src` and from `dist`.
    - type [HarnessCategory](../../src/harness.ts#L850) = "instructions" | "mcp" | "skill" | "settings" | "hooks"
      <a id="features.harness.HarnessCategory"></a><br>What a harness file is for, as a step before the write names it.
    - fn [harnessCategory](../../src/harness.ts#L853) (path: string) → HarnessCategory
      <a id="features.harness.harnessCategory"></a><br>The category of a harness path, for step names and reports.
    - fn [diskProbe](../../src/harness.ts#L866) (root: string) → HarnessProbe
      <a id="features.harness.diskProbe"></a><br>The probe of the real disk: `.claude` and the other harness directories are directories; opencode is a file.
    - fn [resolveChoice](../../src/harness.ts#L888) (choice: HarnessChoice, probe: HarnessProbe) → HarnessSelection
      <a id="features.harness.resolveChoice"></a><br>The selection a choice resolves to on this disk: `auto` keeps the instruction block even when nothing is detected; `none` has none.
      - calls [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses)
    - type [HarnessTarget](../../src/harness.ts#L902)
      <a id="features.harness.HarnessTarget"></a><br>One file of the plan: the text it should hold (null: absent) against what is there now.
    - type [AgentsPlan](../../src/harness.ts#L914)
      <a id="features.harness.AgentsPlan"></a><br>What `keylang agents` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planAgents](../../src/harness.ts#L930) (root: string, choice: HarnessChoice) → AgentsPlan
      <a id="features.harness.planAgents"></a><br>Plans the harness files of `choice` against the disk under `root`. Reads, writes nothing; throws on a read error or a broken keylang.json.
      - calls [features.harness.resolveChoice](features.md#features.harness.resolveChoice), [features.harness.diskProbe](features.md#features.harness.diskProbe), [features.harness.specDir](features.md#features.harness.specDir), [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.skillFile](features.md#features.harness.skillFile), [features.harness.keylangVersion](features.md#features.harness.keylangVersion), [features.harness.planHarness](features.md#features.harness.planHarness), [features.harness.harnessCategory](features.md#features.harness.harnessCategory)
    - fn [readInputs](../../src/harness.ts#L950) (root: string) → Map<string, string | null> <!-- internal -->
      <a id="features.harness.readInputs"></a><br>The current text of every harness path under `root` (null: absent).
    - fn [agentsPlanProblems](../../src/harness.ts#L962) (plan: AgentsPlan) → string[]
      <a id="features.harness.agentsPlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): every harness path must still hold the bytes the plan read, keylang.json must still name the same spec directory, a target must pass the repository's write rules (a removal too: the entry must be…
      - calls [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.specDir](features.md#features.harness.specDir), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses), [features.harness.diskProbe](features.md#features.harness.diskProbe)
    - type [HarnessStep](../../src/harness.ts#L1001)
      <a id="features.harness.HarnessStep"></a><br>One file step of a commit, with what became of it.
    - fn [commitAgents](../../src/harness.ts#L1018) ( plan: AgentsPlan, options: { signal?: AbortSignal; onStep?: (step: { path: string; action: "write" | "remove" }) => void } = {}, ) → Promise<{ steps: HarnessStep[]; outcome: "completed" | "failed" | "cancelled" }>
      <a id="features.harness.commitAgents"></a><br>Writes and removes the changed targets one by one, in plan order. A write is atomic at the target (a link inside the repository is followed; CRLF of the old file kept); a removal removes the entry itself, and only when the entry is inside the repository with links followed — a…
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
  - module [integrations](../../src/integrations.ts#L1)
    <a id="features.integrations"></a><br>`keylang integrations` (business-flows/14): what the repository talks to, the first thing to know before a migration. A view over the snapshot (ADR 0014), no verdict and no network: outgoing calls into the HTTP, SOAP, SDK and queue clients `resources/integrations.json` lists…
    - node [external.node](external.md#external.node)
    - call-sites [features.call-sites](features.md#features.call-sites)
    - config [base.config](base.md#base.config)
    - discover [features.discover](features.md#features.discover)
    - glob [base.glob](base.md#base.glob)
    - json [base.json](base.md#base.json)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [IntegrationKind](../../src/integrations.ts#L26) = "http" | "soap" | "sdk" | "payment" | "queue"
      <a id="features.integrations.IntegrationKind"></a><br>What kind of external system a client talks to.
    - type [IntegrationClient](../../src/integrations.ts#L29) extends Matcher
      <a id="features.integrations.IntegrationClient"></a><br>One client the data file names.
    - type [Reach](../../src/integrations.ts#L36)
      <a id="features.integrations.Reach"></a><br>An entry point that reaches a call site, with the flow that starts from it.
    - type [IntegrationSite](../../src/integrations.ts#L45)
      <a id="features.integrations.IntegrationSite"></a><br>One call of a client in the code, with where it points and which entry points reach it.
    - type [Integration](../../src/integrations.ts#L60)
      <a id="features.integrations.Integration"></a><br>One client the repository uses: its call sites and the imports of it.
    - type [Webhook](../../src/integrations.ts#L71)
      <a id="features.integrations.Webhook"></a><br>An incoming entry point treated as a webhook, with why it counts as one.
    - type [IntegrationsReport](../../src/integrations.ts#L84)
      <a id="features.integrations.IntegrationsReport"></a><br>The whole `keylang integrations` report (also its JSON form).
    - fn [loadIntegrations](../../src/integrations.ts#L101) (path = resourcePath("integrations.json")) → IntegrationClient[]
      <a id="features.integrations.loadIntegrations"></a><br>`resources/integrations.json`.
      - calls [features.call-sites.resourcePath](features.md#features.call-sites.resourcePath), [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.integrations.isIntegrationClient](features.md#features.integrations.isIntegrationClient)
    - fn [isIntegrationClient](../../src/integrations.ts#L118) (item: JsonValue) → item is JsonObject & IntegrationClient <!-- internal -->
      <a id="features.integrations.isIntegrationClient"></a><br>A client of the data file: its `id`, `label` and `kind` are checked; the matcher fields are trusted as the data file (ours, in `resources/`) writes them.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [routePath](../../src/integrations.ts#L129) (label: string) → string <!-- internal -->
      <a id="features.integrations.routePath"></a><br>The path of a route label (`POST /stripe/webhook` → `/stripe/webhook`).
    - fn [findWebhooks](../../src/integrations.ts#L134) (snapshot: AnalysisSnapshot, globs: readonly string[]) → Webhook[]
      <a id="features.integrations.findWebhooks"></a><br>Incoming webhooks: entries of kind webhook, routes whose path names one, and what `integrations.webhooks` names.
      - calls [base.glob.firstMatchingGlob](base.md#base.glob.firstMatchingGlob), [features.integrations.routePath](features.md#features.integrations.routePath), [base.span.compareText](base.md#base.span.compareText)
    - fn [findIntegrations](../../src/integrations.ts#L172) (config: Config, snapshot: AnalysisSnapshot, clients: readonly IntegrationClient[], specified: ReadonlyMap<string, { file: string; flow: string }>) → Promise<IntegrationsReport>
      <a id="features.integrations.findIntegrations"></a><br>The report. `specified`: the triggers of hand-written flows, by trigger, with the flow's name. Reads the analysed files' facts and, at each matched call, the source text for its first arguments.
      - calls [features.call-sites.callsOf](features.md#features.call-sites.callsOf), [features.call-sites.snapshotFacts](features.md#features.call-sites.snapshotFacts), [features.call-sites.internalCallPositions](features.md#features.call-sites.internalCallPositions), [features.call-sites.sourceReader](features.md#features.call-sites.sourceReader), [features.call-sites.callGraph](features.md#features.call-sites.callGraph), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.call-sites.compileMatcher](features.md#features.call-sites.compileMatcher), [features.call-sites.importMatches](features.md#features.call-sites.importMatches), [features.call-sites.callMatches](features.md#features.call-sites.callMatches), [features.call-sites.urlOf](features.md#features.call-sites.urlOf), [features.call-sites.literalArgument](features.md#features.call-sites.literalArgument), [base.span.compareText](base.md#base.span.compareText), [features.integrations.findWebhooks](features.md#features.integrations.findWebhooks)
    - fn [integrationsText](../../src/integrations.ts#L276) (report: IntegrationsReport) → string
      <a id="features.integrations.integrationsText"></a><br>What `keylang integrations` prints.
  - module [keys](../../src/keys.ts#L1)
    <a id="features.keys"></a><br>API keys kept outside the environment: `~/.config/keylang/<name>.key`, mode 0600. Shared by the model adapter and voice, without loading either.
    - node [external.node](external.md#external.node)
    - fn [readKey](../../src/keys.ts#L11) (home: string, name: string) → string | undefined
      <a id="features.keys.readKey"></a><br>The key in `~/.config/keylang/<name>.key`; a file others can read is refused, not used.
  - module [llm](../../src/llm.ts#L1)
    <a id="features.llm"></a><br>One text completion from the configured model (`KEYLANG_AGENT`, else `~/.config/keylang/agents.json` "use", else `keylang.json` `agent`): `anthropic:<model>` through the official SDK, `openrouter:<model>` through its chat completions endpoint with SSE, `cli:<name>[:<model>]`…
    - Anthropic [external.anthropic-ai-sdk](external.md#external.anthropic-ai-sdk)
    - eventsource-parser [external.eventsource-parser](external.md#external.eventsource-parser)
    - node [external.node](external.md#external.node)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - config [base.config](base.md#base.config)
    - json [base.json](base.md#base.json)
    - keys [features.keys](features.md#features.keys)
    - type [LlmRequest](../../src/llm.ts#L34)
      <a id="features.llm.LlmRequest"></a><br>One completion request: system prompt, user prompt and the answer's token budget.
    - type [LlmCallOptions](../../src/llm.ts#L41)
      <a id="features.llm.LlmCallOptions"></a><br>Per call: `signal` cancels the request (and its stream); `timeoutMs` bounds it tighter than `KEYLANG_LLM_TIMEOUT_MS`. Without options a call ends by its answer or the timeout.
    - type [LlmClientOptions](../../src/llm.ts#L52)
      <a id="features.llm.LlmClientOptions"></a><br>Where a client runs: `root` is the repository (the working directory of an agent CLI); `env` and `home` default to the process's own.
    - type [LlmClient](../../src/llm.ts#L59)
      <a id="features.llm.LlmClient"></a><br>A configured model that answers one completion at a time.
    - module [LlmCancelled](../../src/llm.ts#L69)
      <a id="features.llm.LlmCancelled"></a><br>The caller cancelled the request: not a timeout, not a provider error, and no partial answer.
      - fn [constructor](../../src/llm.ts#L70) (provider: string)
        <a id="features.llm.LlmCancelled.constructor"></a><br>Builds the error message as the provider name followed by ": cancelled", passes it to the parent `Error`, and sets the error's `name` to "LlmCancelled" so callers can identify a cancelled LLM request. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isCancelled](../../src/llm.ts#L77) (error: unknown) → error is LlmCancelled
      <a id="features.llm.isCancelled"></a><br>The error of a request its caller cancelled.
    - type [LlmSetup](../../src/llm.ts#L82) = { client: LlmClient } | { missing: string }
      <a id="features.llm.LlmSetup"></a><br>The client, or why none can be made (no agent, key or binary); the reason is shown to the user.
    - type [Env](../../src/llm.ts#L84) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.llm.Env"></a><br>A read-only map of string keys to optional string values, shaped like `process.env`, used by the LLM configuration code to look up settings such as API keys and model names without mutating the real environment. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [llmClient](../../src/llm.ts#L96) (configAgent: string | null, options: LlmClientOptions) → LlmSetup
      <a id="features.llm.llmClient"></a><br>The client of the effective agent: `configAgent` is keylang.json's, which `KEYLANG_AGENT` and agents.json "use" override. An invalid variable or agents.json throws, naming it; a missing key or binary is `missing`.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent), [features.llm.timeoutMs](features.md#features.llm.timeoutMs), [features.llm.isTimeoutProblem](features.md#features.llm.isTimeoutProblem), [base.config.isCliAgent](base.md#base.config.isCliAgent), [features.agent-cli.cliClient](features.md#features.agent-cli.cliClient), [features.llm.deadline](features.md#features.llm.deadline), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.keys.readKey](features.md#features.keys.readKey), [features.llm.anthropicComplete](features.md#features.llm.anthropicComplete), [features.llm.openrouterComplete](features.md#features.llm.openrouterComplete)
    - fn [answeringAgent](../../src/llm.ts#L172) (client: LlmClient, reported: string | null) → string
      <a id="features.llm.answeringAgent"></a><br>The agent an answer is signed with: `cli:claude` becomes `cli:claude:<model>` when the CLI reported the model; an agent that names its model stays as configured.
    - fn [isTimeoutProblem](../../src/llm.ts#L180) (timeout: number | string) → timeout is string <!-- internal -->
      <a id="features.llm.isTimeoutProblem"></a><br>`timeoutMs` gave why the variable is wrong instead of a bound.
    - fn [timeoutMs](../../src/llm.ts#L185) (env: Env) → number | string <!-- internal -->
      <a id="features.llm.timeoutMs"></a><br>`KEYLANG_LLM_TIMEOUT_MS`, a positive whole number of milliseconds a timer can hold; the reason when it is not one.
    - type [Deadline](../../src/llm.ts#L197) <!-- internal -->
      <a id="features.llm.Deadline"></a><br>A call's bound: the variable's, or the call's own when that is tighter; `fromVariable` decides whether the timeout message cites the variable.
    - fn [deadline](../../src/llm.ts#L203) (variable: number, own: number | undefined) → Deadline <!-- internal -->
      <a id="features.llm.deadline"></a><br>The bound of one call: its own `timeoutMs` when tighter than the variable, else the variable's.
    - fn [timeoutMessage](../../src/llm.ts#L208) (provider: string, bound: Deadline) → string <!-- internal -->
      <a id="features.llm.timeoutMessage"></a><br>The error text of a timed-out call; it cites the variable only when the variable was the bound.
    - fn [truncatedMessage](../../src/llm.ts#L213) (model: string, reason: "max_tokens" | "length") → string <!-- internal -->
      <a id="features.llm.truncatedMessage"></a><br>The provider stopped the answer at the token limit (`stop_reason: max_tokens`, `finish_reason: length`): what came is not an answer.
    - type [CallSignal](../../src/llm.ts#L222) <!-- internal -->
      <a id="features.llm.CallSignal"></a><br>One signal for a whole call: aborted by the deadline or by the caller's signal, whichever comes first; `dispose` clears the timer and the listener on the caller's signal, so a long-lived signal does not collect them.
    - fn [callSignal](../../src/llm.ts#L229) (timeout: number, outer: AbortSignal | undefined) → CallSignal <!-- internal -->
      <a id="features.llm.callSignal"></a>
    - fn [anthropicComplete](../../src/llm.ts#L258) (client: Anthropic, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.anthropicComplete"></a><br>One non-streaming Messages API call; a refusal, a cut answer or no text is an error.
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage), [features.llm.truncatedMessage](features.md#features.llm.truncatedMessage)
    - fn [openrouterComplete](../../src/llm.ts#L306) (base: string, key: string, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.openrouterComplete"></a><br>One streamed chat completion from OpenRouter (or a JSON answer when the server does not stream).
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.tryParseJson](features.md#features.llm.tryParseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.llm.errorMessage](features.md#features.llm.errorMessage), [features.llm.firstChoice](features.md#features.llm.firstChoice), [features.llm.truncatedMessage](features.md#features.llm.truncatedMessage), [base.json.isJsonString](base.md#base.json.isJsonString), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage)
    - fn [tryParseJson](../../src/llm.ts#L398) (text: string) → JsonValue | undefined <!-- internal -->
      <a id="features.llm.tryParseJson"></a><br>OpenRouter's JSON; undefined when it does not parse.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
    - fn [firstChoice](../../src/llm.ts#L407) (value: JsonValue | undefined) → JsonObject | undefined <!-- internal -->
      <a id="features.llm.firstChoice"></a><br>`choices[0]` of an OpenRouter answer or stream chunk.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [errorMessage](../../src/llm.ts#L414) (error: JsonValue) → string | undefined <!-- internal -->
      <a id="features.llm.errorMessage"></a><br>`error.message` of an OpenRouter error.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
  - module [lsp-features](../../src/lsp-features.ts#L1)
    <a id="features.lsp-features"></a><br>Language features over one analysis: pure functions from an `Analysis`, a document, and a position to LSP results. Positions are LSP's: 0-based line, UTF-16 character.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - emit [map.emit](map.md#map.emit)
    - brief [base.brief](base.md#base.brief)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - parser [lang.parser](lang.md#lang.parser)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - verdict [check.verdict](check.md#check.verdict)
    - type [LspPosition](../../src/lsp-features.ts#L34)
      <a id="features.lsp-features.LspPosition"></a><br>A position as LSP sends it: 0-based line, UTF-16 character.
    - type [LspRange](../../src/lsp-features.ts#L40)
      <a id="features.lsp-features.LspRange"></a><br>A range of two LSP positions, end exclusive.
    - type [Location](../../src/lsp-features.ts#L46)
      <a id="features.lsp-features.Location"></a><br>A place in a file, by URI.
    - type [Workspace](../../src/lsp-features.ts#L52)
      <a id="features.lsp-features.Workspace"></a><br>What features read: the analysis, the root, and the text of any document.
    - fn [workspace](../../src/lsp-features.ts#L60) (root: string, analysis: Analysis, buffers: ReadonlyMap<string, string>) → Workspace
      <a id="features.lsp-features.workspace"></a><br>The workspace of one analysis: the docs as the editor shows them (open map buffers reparsed) and a text lookup that prefers open buffers.
      - calls [base.config.specPath](base.md#base.config.specPath), [lang.parser.parse](lang.md#lang.parser.parse), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [lineStarts](../../src/lsp-features.ts#L107) (text: string) → number[] <!-- internal -->
      <a id="features.lsp-features.lineStarts"></a><br>The offset of the start of each line (after each `\n`).
    - fn [lspPoint](../../src/lsp-features.ts#L119) (text: string | null, line: number, col: number) → LspPosition <!-- internal -->
      <a id="features.lsp-features.lspPoint"></a><br>A 1-based line and column in code points — the unit of IR spans and of snapshot positions in code alike — as an LSP position (UTF-16).
    - fn [fromPos](../../src/lsp-features.ts#L130) (text: string | null, pos: Pos) → LspPosition <!-- internal -->
      <a id="features.lsp-features.fromPos"></a><br>An IR position as an LSP position.
      - calls [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - fn [fromSpan](../../src/lsp-features.ts#L135) (text: string | null, span: Span) → LspRange <!-- internal -->
      <a id="features.lsp-features.fromSpan"></a><br>An IR span as an LSP range.
      - calls [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos)
    - fn [lineRange](../../src/lsp-features.ts#L140) (text: string | null, line: number, col: number) → LspRange <!-- internal -->
      <a id="features.lsp-features.lineRange"></a><br>A 1-based line and a column in code points, to the end of that line.
    - fn [toOffset](../../src/lsp-features.ts#L148) (text: string, position: LspPosition) → number <!-- internal -->
      <a id="features.lsp-features.toOffset"></a><br>The UTF-16 offset of an LSP position (a line past the end clamps to the text's end).
      - calls [features.lsp-features.lineStarts](features.md#features.lsp-features.lineStarts)
    - fn [uriOf](../../src/lsp-features.ts#L153) (root: string, path: string) → string <!-- internal -->
      <a id="features.lsp-features.uriOf"></a><br>The `file:` URI of a root-relative path.
    - type [Target](../../src/lsp-features.ts#L160) <!-- internal -->
      <a id="features.lsp-features.Target"></a><br>What the cursor can be on: an ID (a reference or a declared name) or a code link with its line.
    - fn [nodesOf](../../src/lsp-features.ts#L163) (doc: Document) → { node: Node; section: Section; parent: Node | null }[] <!-- internal -->
      <a id="features.lsp-features.nodesOf"></a><br>Every node of a document, depth-first, with its section and parent.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [targetAt](../../src/lsp-features.ts#L180) (doc: Document, offset: number) → Target | null
      <a id="features.lsp-features.targetAt"></a><br>The id, reference, or code link at an offset of a document. Spans are half-open: the offset after an id is not in it.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [base.span.spanContains](base.md#base.span.spanContains)
    - fn [docOf](../../src/lsp-features.ts#L204) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.docOf"></a><br>The document at a path: one the analysis read, else a file of the explained map.
      - calls [features.lsp-features.readingDoc](features.md#features.lsp-features.readingDoc)
    - fn [readingDoc](../../src/lsp-features.ts#L216) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.readingDoc"></a><br>A file of the explained map. The analysis does not check it (it is no spec), but its IDs and code links lead where the map's do: hover, definition and Enter in the TUI work there too.
      - calls [base.config.specPath](base.md#base.config.specPath), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [at](../../src/lsp-features.ts#L232) (ws: Workspace, path: string, position: LspPosition) → Target | null <!-- internal -->
      <a id="features.lsp-features.at"></a><br>The target at an LSP position of a document, or null.
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [features.lsp-features.toOffset](features.md#features.lsp-features.toOffset)
    - type [LspDiagnostic](../../src/lsp-features.ts#L244)
      <a id="features.lsp-features.LspDiagnostic"></a><br>A diagnostic as LSP takes it, with keylang's verdict (and a K005 reason) in `data`.
    - fn [diagnosticsFor](../../src/lsp-features.ts#L254) (ws: Workspace, path: string) → LspDiagnostic[]
      <a id="features.lsp-features.diagnosticsFor"></a><br>Diagnostics and verdicts of one document, as `check --format json` reports them.
      - calls [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange)
    - fn [describe](../../src/lsp-features.ts#L292) (ws: Workspace, id: string) → (NodeFacts & { state: string[] }) | null <!-- internal -->
      <a id="features.lsp-features.describe"></a><br>The facts of an ID (`explain-node.ts`) with the state hover names: opaque, and a plan with or without code.
      - calls [features.explain-node.nodeFacts](features.md#features.explain-node.nodeFacts)
    - type [HoverRun](../../src/lsp-features.ts#L302)
      <a id="features.lsp-features.HoverRun"></a><br>A piece of hover text: code (an ID, a keyword, a signature, a message's code span) is in backticks in Markdown, `strong` in bold.
    - type [HoverContent](../../src/lsp-features.ts#L312)
      <a id="features.lsp-features.HoverContent"></a><br>A hover before it is Markdown: `hover()` renders it for an LSP client, and the TUI draws its parts as they are, so neither parses the other's text.
    - type [HoverResult](../../src/lsp-features.ts#L330) <!-- internal -->
      <a id="features.lsp-features.HoverResult"></a><br>A hover answer: Markdown contents and the range it is about.
    - fn [hover](../../src/lsp-features.ts#L333) (ws: Workspace, path: string, position: LspPosition) → HoverResult | null
      <a id="features.lsp-features.hover"></a><br>Hover at a position as LSP Markdown, or null when there is nothing to say.
      - calls [features.lsp-features.hoverContent](features.md#features.lsp-features.hoverContent), [features.lsp-features.hoverMarkdown](features.md#features.lsp-features.hoverMarkdown)
    - fn [hoverMarkdown](../../src/lsp-features.ts#L340) (content: HoverContent) → string
      <a id="features.lsp-features.hoverMarkdown"></a><br>The hover as LSP Markdown: title, place, a `- ` line per evidence, the flows; a blank line between them.
      - calls [features.lsp-features.runsMarkdown](features.md#features.lsp-features.runsMarkdown)
    - fn [runsMarkdown](../../src/lsp-features.ts#L347) (runs: readonly HoverRun[]) → string <!-- internal -->
      <a id="features.lsp-features.runsMarkdown"></a><br>Runs as Markdown: code in backticks, strong in `**`.
    - fn [runsText](../../src/lsp-features.ts#L358) (runs: readonly HoverRun[]) → string
      <a id="features.lsp-features.runsText"></a><br>The text of runs without the Markdown: what a terminal shows.
    - fn [inlineRuns](../../src/lsp-features.ts#L366) (text: string) → HoverRun[] <!-- internal -->
      <a id="features.lsp-features.inlineRuns"></a><br>Text as keylang writes roles and messages — `code spans` in backticks — as runs; an unpaired backtick stays text. Rendered back, it is the same text.
    - fn [evidenceLine](../../src/lsp-features.ts#L383) (label: string, message: string) → HoverRun[] <!-- internal -->
      <a id="features.lsp-features.evidenceLine"></a><br>An evidence line: the criterion (or the diagnostic's code), then the message.
      - calls [features.lsp-features.inlineRuns](features.md#features.lsp-features.inlineRuns)
    - fn [hoverContent](../../src/lsp-features.ts#L388) (ws: Workspace, path: string, position: LspPosition) → HoverContent | null
      <a id="features.lsp-features.hoverContent"></a><br>What hover says at a position: the ID under it (kind, signature, place, evidence, flows), else the role of the line.
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.roleHover](features.md#features.lsp-features.roleHover), [features.lsp-features.describe](features.md#features.lsp-features.describe), [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration), [features.lsp-features.evidenceLine](features.md#features.lsp-features.evidenceLine), [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - fn [roleHover](../../src/lsp-features.ts#L425) (ws: Workspace, path: string, position: LspPosition) → HoverContent | null <!-- internal -->
      <a id="features.lsp-features.roleHover"></a><br>Hover on a keyword, or on a line without an ID: what the line does under its parent (grammar.md §5), then the diagnostics and verdicts of that line.
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.toOffset](features.md#features.lsp-features.toOffset), [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [base.span.spanContains](base.md#base.span.spanContains), [lang.parser.roleAt](lang.md#lang.parser.roleAt), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [features.lsp-features.inlineRuns](features.md#features.lsp-features.inlineRuns), [features.lsp-features.evidenceLine](features.md#features.lsp-features.evidenceLine), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - fn [definition](../../src/lsp-features.ts#L467) (ws: Workspace, path: string, position: LspPosition) → Location | null
      <a id="features.lsp-features.definition"></a><br>Go to definition: a code link opens its file at its line; an ID opens its declaration (code, or a spec for a planned one).
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf)
    - type [SignatureInformation](../../src/lsp-features.ts#L489)
      <a id="features.lsp-features.SignatureInformation"></a><br>One signature in a signature-help answer.
    - type [SignatureHelp](../../src/lsp-features.ts#L495)
      <a id="features.lsp-features.SignatureHelp"></a><br>A signature-help answer: always one signature, nothing active to track.
    - fn [signatureHelp](../../src/lsp-features.ts#L502) (ws: Workspace, path: string, position: LspPosition) → SignatureHelp | null
      <a id="features.lsp-features.signatureHelp"></a><br>The signature of the last dotted ID before the cursor on its line, with its place.
      - calls [features.lsp-features.describe](features.md#features.lsp-features.describe)
    - fn [references](../../src/lsp-features.ts#L525) (ws: Workspace, path: string, position: LspPosition, includeDeclaration = true) → Location[]
      <a id="features.lsp-features.references"></a><br>Declarations and uses of the id under the cursor; `includeDeclaration: false` (LSP's `context`) leaves out the declarations.
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [SymbolInformation](../../src/lsp-features.ts#L548)
      <a id="features.lsp-features.SymbolInformation"></a><br>A symbol in a `workspace/symbol` answer.
    - fn [workspaceSymbols](../../src/lsp-features.ts#L568) (ws: Workspace, briefs: ReadonlyMap<string, StoredExplanation>, query: string) → SymbolInformation[]
      <a id="features.lsp-features.workspaceSymbols"></a><br>Nodes of the snapshot and planned intentions matching `query` (`searchNodes`, fuzzy): by name and ID first, then by the text of their explanation. Each points at its code, a planned one at its declaration in the spec, a layer at its line in `keylang.json`; `containerName` is…
      - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [features.lsp-features.symbolLocation](features.md#features.lsp-features.symbolLocation), [base.brief.capText](base.md#base.brief.capText), [features.lsp-features.symbolKind](features.md#features.lsp-features.symbolKind)
    - fn [symbolKind](../../src/lsp-features.ts#L591) (kind: string) → number <!-- internal -->
      <a id="features.lsp-features.symbolKind"></a><br>The LSP SymbolKind of a node kind (`planned` ignored).
    - fn [symbolLocation](../../src/lsp-features.ts#L606) (ws: Workspace, hit: NodeHit) → Location | null <!-- internal -->
      <a id="features.lsp-features.symbolLocation"></a><br>Where a symbol points: a layer at its key in keylang.json, any other node at its code or spec line; null when it has no place.
      - calls [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange), [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - type [DocumentSymbol](../../src/lsp-features.ts#L631)
      <a id="features.lsp-features.DocumentSymbol"></a><br>An outline entry for `textDocument/documentSymbol`, with its children.
    - fn [statusOf](../../src/lsp-features.ts#L644) (verdicts: readonly Verdict[], diagnostics: readonly Diagnostic[], path: string, line: number) → string | undefined <!-- internal -->
      <a id="features.lsp-features.statusOf"></a><br>Worst verdict on a line of this document: `fail` > `unverified` > `ok`.
    - fn [flowPhrases](../../src/lsp-features.ts#L658) (spec: SpecIR) → Map<Node, string> <!-- internal -->
      <a id="features.lsp-features.flowPhrases"></a><br>Written phrase of a trigger, step, when, or then, keyed by its text-IR node.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.lsp-features.itemPhrase](features.md#features.lsp-features.itemPhrase)
    - fn [itemPhrase](../../src/lsp-features.ts#L675) (item: Trigger | FlowItem) → string | null <!-- internal -->
      <a id="features.lsp-features.itemPhrase"></a><br>The phrase an outline shows for a flow item: its target, condition or prose; null for other items.
    - fn [documentSymbols](../../src/lsp-features.ts#L686) (ws: Workspace, path: string) → DocumentSymbol[]
      <a id="features.lsp-features.documentSymbols"></a><br>The outline of a document: flows and rules as groups, every other node at the top; each entry with the worst status of its lines.
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.flowPhrases](features.md#features.lsp-features.flowPhrases), [lang.ir.walk](lang.md#lang.ir.walk), [features.lsp-features.statusOf](features.md#features.lsp-features.statusOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [CompletionItem](../../src/lsp-features.ts#L793)
      <a id="features.lsp-features.CompletionItem"></a><br>A completion item as LSP takes it; the label replaces the whole typed word.
    - fn [completions](../../src/lsp-features.ts#L821) (ws: Workspace, path: string, position: LspPosition) → CompletionItem[]
      <a id="features.lsp-features.completions"></a><br>Keywords by position at the start of an item; after `step`/`trigger` only functions and planned functions; after other reference keywords, ids that the enclosing module may depend on (`deny` removes the rest).
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.enclosing](features.md#features.lsp-features.enclosing), [features.lsp-features.sectionAt](features.md#features.lsp-features.sectionAt), [lang.parser.keywordsAt](lang.md#lang.parser.keywordsAt), [features.lsp-features.eventCompletions](features.md#features.lsp-features.eventCompletions), [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [features.lsp-features.moduleAround](features.md#features.lsp-features.moduleAround), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.blocksDependency](check.md#check.rules.blocksDependency)
    - fn [eventCompletions](../../src/lsp-features.ts#L940) (ws: Workspace, replacing: (label: string) => Pick<CompletionItem, "filterText" | "textEdit">) → CompletionItem[] <!-- internal -->
      <a id="features.lsp-features.eventCompletions"></a><br>The events of the snapshot, then events the map or `planned` declares, as completions of an event ID.
    - fn [sectionAt](../../src/lsp-features.ts#L965) (doc: Document, line: number) → Section | undefined <!-- internal -->
      <a id="features.lsp-features.sectionAt"></a><br>The section a 1-based line belongs to: the last one whose heading is at or above it.
    - fn [enclosing](../../src/lsp-features.ts#L978) (doc: Document, line: number, col: number) → Node | undefined <!-- internal -->
      <a id="features.lsp-features.enclosing"></a><br>The nearest item above `line` that starts left of `col`: the parent of a new item there.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [ancestors](../../src/lsp-features.ts#L991) (doc: Document, node: Node) → Node[] <!-- internal -->
      <a id="features.lsp-features.ancestors"></a><br>The node and its ancestors, innermost first.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [moduleAround](../../src/lsp-features.ts#L1006) (ws: Workspace, doc: Document, parent: Node | undefined) → string | null <!-- internal -->
      <a id="features.lsp-features.moduleAround"></a><br>The module a completion is written in: the nearest enclosing module or fn declaration.
      - calls [features.lsp-features.ancestors](features.md#features.lsp-features.ancestors)
    - type [CodeLens](../../src/lsp-features.ts#L1027) <!-- internal -->
      <a id="features.lsp-features.CodeLens"></a><br>A code lens: where it sits and the editor command it runs.
    - fn [codeLenses](../../src/lsp-features.ts#L1033) (ws: Workspace, path: string) → CodeLens[]
      <a id="features.lsp-features.codeLenses"></a><br>`flows: checkout, pay` above each function of a source file that a flow names. The command `keylang.flows` (registered by the editor client) gets the flow names.
      - calls [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
  - module [migration-stack](../../src/migration-stack.ts#L1)
    <a id="features.migration-stack"></a><br>The two stacks of a migration (business-flows/27), as `migration.ts` reads them: this repository's analysis, the old repository's checkout (analysed read-only: nothing is written there, not even the fact cache), or an index file — a plain `.keylang/index.json` of the old…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - discover [features.discover](features.md#features.discover)
    - integrations [features.integrations](features.md#features.integrations)
    - ir [lang.ir](lang.md#lang.ir)
    - json [base.json](base.md#base.json)
    - migration [check.migration](check.md#check.migration)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - test-report [check.test-report](check.md#check.test-report)
    - type [MigrationExport](../../src/migration-stack.ts#L32)
      <a id="features.migration-stack.MigrationExport"></a><br>The `migration` block of an export: what a plain index.json lacks (hand-written flows, test results, integrations).
    - type [LoadedStack](../../src/migration-stack.ts#L40)
      <a id="features.migration-stack.LoadedStack"></a><br>A stack and what the report should say about how it was read.
    - fn [stackFlows](../../src/migration-stack.ts#L46) (analysis: Pick<Analysis, "spec" | "docs" | "config">, snapshot: AnalysisSnapshot) → StackFlow[]
      <a id="features.migration-stack.stackFlows"></a><br>The flows of an analysis: the hand-written ones (with `flow import` provenance marked), then the discovered drafts of entry points no hand-written flow starts from.
      - calls [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers), [features.migration-stack.specFlow](features.md#features.migration-stack.specFlow), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [base.span.compareText](base.md#base.span.compareText)
    - fn [specFlow](../../src/migration-stack.ts#L68) (flow: Flow, docs: readonly Document[]) → StackFlow <!-- internal -->
      <a id="features.migration-stack.specFlow"></a><br>A hand-written flow as a stack flow: its trigger and steps (each once), its tests, and whether `flow import` brought it in.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [stackTests](../../src/migration-stack.ts#L91) (analysis: Pick<Analysis, "config">) → TestCase[] | null
      <a id="features.migration-stack.stackTests"></a><br>The test results `check.tests` names; null when it names none.
      - calls [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [check.test-report.loadReports](check.md#check.test-report.loadReports)
    - fn [stackIntegrations](../../src/migration-stack.ts#L98) (analysis: Pick<Analysis, "spec" | "config">, snapshot: AnalysisSnapshot) → Promise<NonNullable<Stack["integrations"]>>
      <a id="features.migration-stack.stackIntegrations"></a><br>Outgoing integrations (with the fns of their call sites) and incoming webhooks of the snapshot.
      - calls [features.integrations.findIntegrations](features.md#features.integrations.findIntegrations), [features.integrations.loadIntegrations](features.md#features.integrations.loadIntegrations), [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers), [base.span.compareText](base.md#base.span.compareText)
    - fn [stackOf](../../src/migration-stack.ts#L108) (analysis: Analysis) → Promise<Stack>
      <a id="features.migration-stack.stackOf"></a><br>The stack of an analysis with a snapshot: everything parity reads.
      - calls [features.migration-stack.stackFlows](features.md#features.migration-stack.stackFlows), [features.migration-stack.stackTests](features.md#features.migration-stack.stackTests), [features.migration-stack.stackIntegrations](features.md#features.migration-stack.stackIntegrations)
    - fn [analyzeOld](../../src/migration-stack.ts#L124) (dir: string, withoutEvidence: boolean) → Promise<Analysis> <!-- internal -->
      <a id="features.migration-stack.analyzeOld"></a><br>The old repository's checkout, analysed read-only: no fact cache, no `migration.from` of its own.
      - calls [map.analyze.analyze](map.md#map.analyze.analyze)
    - fn [resolveFrom](../../src/migration-stack.ts#L129) (base: string, from: string) → string
      <a id="features.migration-stack.resolveFrom"></a><br>`from` as written, resolved against `base` (the root for keylang.json, the working directory for `--from`).
    - fn [fromLabel](../../src/migration-stack.ts#L134) (root: string, abs: string) → string
      <a id="features.migration-stack.fromLabel"></a><br>How a path is shown in a report: relative to the root, POSIX.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [loadOldStack](../../src/migration-stack.ts#L141) (abs: string) → Promise<LoadedStack>
      <a id="features.migration-stack.loadOldStack"></a><br>The old stack from a directory (its checkout) or a file (an index or an export).
      - calls [features.migration-stack.analyzeOld](features.md#features.migration-stack.analyzeOld), [features.migration-stack.stackOf](features.md#features.migration-stack.stackOf), [check.migration.readOldIndex](check.md#check.migration.readOldIndex), [features.migration-stack.isCurrentSnapshot](features.md#features.migration-stack.isCurrentSnapshot), [features.discover.discoverFlows](features.md#features.discover.discoverFlows)
    - fn [isCurrentSnapshot](../../src/migration-stack.ts#L178) (raw: JsonObject) → raw is JsonObject & AnalysisSnapshot <!-- internal -->
      <a id="features.migration-stack.isCurrentSnapshot"></a><br>An index file of this keylang's snapshot schema is an index.json as `keylang map` writes it.
    - fn [migrationExport](../../src/migration-stack.ts#L183) (root: string) → Promise<string>
      <a id="features.migration-stack.migrationExport"></a><br>`keylang map --export-index <file>`: the snapshot of this repository with the `migration` block, as JSON text.
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [features.migration-stack.stackOf](features.md#features.migration-stack.stackOf)
    - fn [writeMigrationExport](../../src/migration-stack.ts#L195) (root: string, out: string) → Promise<string>
      <a id="features.migration-stack.writeMigrationExport"></a><br>Writes the export to `out` (relative to the working directory).
      - calls [features.migration-stack.migrationExport](features.md#features.migration-stack.migrationExport)
  - module [node-search](../../src/node-search.ts#L1)
    <a id="features.node-search"></a><br>Finding nodes by name, ID or what their explanation says (ADR 0004): the TUI's node search, MCP `search` and LSP workspace symbols share one ranking.
    - analyze [map.analyze](map.md#map.analyze)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - type [NodeHit](../../src/node-search.ts#L14)
      <a id="features.node-search.NodeHit"></a><br>One search result: a node or a planned intention, with where it lives and what matched.
    - type [NodeQuery](../../src/node-search.ts#L28)
      <a id="features.node-search.NodeQuery"></a><br>A search: the text, how many hits at most, and whether names match fuzzily.
    - fn [searchNodes](../../src/node-search.ts#L46) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>, q: NodeQuery) → NodeHit[]
      <a id="features.node-search.searchNodes"></a><br>Nodes of the snapshot and `planned` intentions of the specs matching the query, case-insensitive: first those whose ID or name matches (for `fuzzy`, the exact name, then a name prefix, a name part, an ID part, then a subsequence of the name and of the ID; shorter IDs first…
      - calls [features.node-search.candidates](features.md#features.node-search.candidates), [features.node-search.idRank](features.md#features.node-search.idRank), [base.span.compareText](base.md#base.span.compareText)
    - fn [candidates](../../src/node-search.ts#L67) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>) → NodeHit[] <!-- internal -->
      <a id="features.node-search.candidates"></a><br>Builds the full search pool for [`features.node-search.searchNodes`](features.md#features.node-search.searchNodes): every snapshot node with its explanation via [`map.explanations.explanationOf`](map.md#map.explanations.explanationOf), plus `planned` spec declarations not yet in code, found by [`lang.ir.walk`](lang.md#lang.ir.walk). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [idRank](../../src/node-search.ts#L94) (query: string, id: string, fuzzy: boolean) → number | null <!-- internal -->
      <a id="features.node-search.idRank"></a><br>How well the ID or its last segment matches, lower is better; null when it does not.
      - calls [features.node-search.subsequence](features.md#features.node-search.subsequence)
    - fn [subsequence](../../src/node-search.ts#L118) (query: string, text: string) → boolean <!-- internal -->
      <a id="features.node-search.subsequence"></a><br>Every code point of `query` appears in `text` in order.
  - module [proposals](../../src/proposals.ts#L1)
    <a id="features.proposals"></a><br>Proposals (CONTEXT.md): the full proposed text of one hand-written spec or source file, kept in `.keylang/proposals/<path>` until a person takes it: hunk by hunk in the TUI's MERGE, or whole with `keylang proposals accept`. `draft`, `code-to-spec` and MCP `apply_diff` propose…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - languages [base.languages](base.md#base.languages)
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - stats [features.stats](features.md#features.stats)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - fn [notPlain](../../src/proposals.ts#L36) (path: string) → boolean <!-- internal -->
      <a id="features.proposals.notPlain"></a><br>The write protocol's first test (`writeProblem`): a plain relative POSIX path, before anything on disk is looked at.
    - fn [unreadDirectory](../../src/proposals.ts#L41) (dirs: readonly string[]) → boolean <!-- internal -->
      <a id="features.proposals.unreadDirectory"></a><br>A directory below the spec directory, or the root for code, that `check` and the map do not read: hidden, `node_modules`, `target`.
      - calls [features.proposals.unreadName](features.md#features.proposals.unreadName)
    - fn [unreadName](../../src/proposals.ts#L46) (name: string) → boolean <!-- internal -->
      <a id="features.proposals.unreadName"></a><br>Case does not tell the directories apart: on a case-insensitive file system `Node_Modules` is `node_modules`.
    - fn [statOrNull](../../src/proposals.ts#L53) (abs: string) → Stats | null <!-- internal -->
      <a id="features.proposals.statOrNull"></a><br>`statSync` that follows links, or null when the entry is missing or unreadable.
    - fn [sameEntry](../../src/proposals.ts#L62) (a: Stats, b: Stats | null) → boolean <!-- internal -->
      <a id="features.proposals.sameEntry"></a><br>The same directory on disk: by device and inode, which a link or another letter case of the name does not change.
    - fn [landsIn](../../src/proposals.ts#L74) (abs: string, dir: string) → boolean
      <a id="features.proposals.landsIn"></a><br>Whether a write to `abs` lands inside the directory `dir` on disk: `dir` itself or one of the existing ancestors of `abs` is `dir` by device and inode. Links are followed, so `notes/brief/x.md` with `notes -> explain` lands in `explain/`, and on a case-insensitive file system…
      - calls [features.proposals.statOrNull](features.md#features.proposals.statOrNull), [features.proposals.sameEntry](features.md#features.proposals.sameEntry)
    - fn [landsUnread](../../src/proposals.ts#L97) (root: string, lands: string) → boolean <!-- internal -->
      <a id="features.proposals.landsUnread"></a><br>Whether the landing place `lands` (below `root`, links resolved) is in a directory `check` does not read: an ancestor below `root` whose name is hidden, `node_modules` or `target` (the segments not on disk yet by their text), or whose entry on disk is the `node_modules` or…
      - calls [features.proposals.statOrNull](features.md#features.proposals.statOrNull), [map.analyze.within](map.md#map.analyze.within), [features.proposals.sameEntry](features.md#features.proposals.sameEntry), [features.proposals.unreadName](features.md#features.proposals.unreadName)
    - fn [reservedSpecText](../../src/proposals.ts#L125) (inside: string) → string | null <!-- internal -->
      <a id="features.proposals.reservedSpecText"></a><br>Why the spec path `inside` the spec directory is in a reserved directory by its text alone (case aside), or null: the fast path.
      - calls [features.proposals.unreadDirectory](features.md#features.proposals.unreadDirectory)
    - fn [reservedSpecLanding](../../src/proposals.ts#L136) (specRoot: string, lands: string) → string | null <!-- internal -->
      <a id="features.proposals.reservedSpecLanding"></a><br>Why the landing place `lands` of a spec is in a reserved directory of `specRoot` (the spec directory on disk), or null.
      - calls [features.proposals.landsUnread](features.md#features.proposals.landsUnread), [features.proposals.landsIn](features.md#features.proposals.landsIn)
    - fn [proposalProblem](../../src/proposals.ts#L151) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="features.proposals.proposalProblem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A proposal replaces one hand-written spec: a Markdown file under the spec directory, not one keylang generates (the map, the explained map, a saved model explanation, a file with the generated marker), and not reached…
      - calls [features.proposals.notPlain](features.md#features.proposals.notPlain), [features.proposals.reservedSpecText](features.md#features.proposals.reservedSpecText), [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.proposals.reservedSpecLanding](features.md#features.proposals.reservedSpecLanding), [lang.files.existingText](lang.md#lang.files.existingText), [lang.parser.parse](lang.md#lang.parser.parse), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.proposals.generatedSpecProblem](features.md#features.proposals.generatedSpecProblem)
    - fn [generatedSpecProblem](../../src/proposals.ts#L200) (marker: string | null, specDir: string) → string <!-- internal -->
      <a id="features.proposals.generatedSpecProblem"></a><br>The refusal for a generated spec, naming the command its marker names (`keylang baseline` for the baseline; `keylang map` otherwise).
    - fn [codeProposalProblem](../../src/proposals.ts#L216) (root: string, path: string) → string | null
      <a id="features.proposals.codeProposalProblem"></a><br>Why a proposal for the source file `path` may not be merged, or null: a file of a language keylang reads, a plain relative path inside the repository (links included, one whose target does not exist yet too), outside the directories sources are not read from, and not one…
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [features.proposals.notPlain](features.md#features.proposals.notPlain), [features.proposals.unreadDirectory](features.md#features.proposals.unreadDirectory), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.landsUnread](features.md#features.proposals.landsUnread), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText)
    - fn [targetProblem](../../src/proposals.ts#L241) (root: string, specDir: string, path: string, generated?: (path: string) => boolean) → string | null
      <a id="features.proposals.targetProblem"></a><br>The gate of a proposal's target: a Markdown file is a spec, any other a source file.
      - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem)
    - type [ProposalBasis](../../src/proposals.ts#L250)
      <a id="features.proposals.ProposalBasis"></a><br>What a proposal was built from: the target on disk and the proposal already waiting for it (null: no file). A write that carries it lands only while both are still so.
    - fn [proposalWriteProblem](../../src/proposals.ts#L260) (root: string, path: string, basis: ProposalBasis) → string | null
      <a id="features.proposals.proposalWriteProblem"></a><br>Why the proposal of `path` built from `basis` may not be written now, or null: the target or the waiting proposal changed, appeared or went away since, or the store breaks the write policy. Each reason names its file.
      - calls [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - fn [writeProposal](../../src/proposals.ts#L280) (root: string, path: string, text: string, basis?: ProposalBasis) → string
      <a id="features.proposals.writeProposal"></a><br>Writes the proposal for `path` (relative, POSIX) atomically and returns its file; `.keylang/proposals/` is keylang's own store, so a link there that leads elsewhere is refused like any other. With `basis` nothing is written unless the target and the waiting proposal are still…
      - calls [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [lineDiff](../../src/proposals.ts#L302) (before: string, after: string) → string
      <a id="features.proposals.lineDiff"></a><br>`-`/`+` lines between a common prefix and suffix: enough to see what a proposal changes. Line endings are compared as MERGE compares them: a target that is CRLF throughout is read as LF (mixed endings stay), and the proposal (an agent writes LF) is read as LF, so a CRLF file…
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - type [PendingProposal](../../src/proposals.ts#L324)
      <a id="features.proposals.PendingProposal"></a><br>One pending proposal as `keylang proposals` lists it.
    - fn [proposalTarget](../../src/proposals.ts#L341) (name: string) → string | null
      <a id="features.proposals.proposalTarget"></a><br>The target of a proposal as a person names it: as `keylang proposals` lists it, or as its store path `.keylang/proposals/<target>`; POSIX. Null when it is no plain relative path.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.notPlain](features.md#features.proposals.notPlain)
    - fn [pendingTargets](../../src/proposals.ts#L353) (root: string) → string[]
      <a id="features.proposals.pendingTargets"></a><br>Every target with a file or a link under `.keylang/proposals/`, sorted. The store is listed only while it stays inside the repository; a link in it is listed, never followed.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix), [base.span.compareText](base.md#base.span.compareText)
    - fn [storeEntry](../../src/proposals.ts#L371) (root: string, target: string) → { abs: string; link: boolean } | { problem: string } | null <!-- internal -->
      <a id="features.proposals.storeEntry"></a><br>The store entry of `target` where its directory lands: null when there is none, else the entry and whether it is a link. A store whose directory leads out of the repository is a problem, and nothing there is looked at.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within)
    - type [ReadProposal](../../src/proposals.ts#L389) <!-- internal -->
      <a id="features.proposals.ReadProposal"></a><br>A proposal that may be accepted: its text and the target's (null: no file).
    - fn [readProposal](../../src/proposals.ts#L399) (root: string, specDir: string, target: string) → ReadProposal | { problem: string } | null <!-- internal -->
      <a id="features.proposals.readProposal"></a><br>The proposal of `target` read after both gates — a plain file in the store, a target a proposal may change — or why it cannot be accepted; null when none is pending.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [features.proposals.targetProblem](features.md#features.proposals.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [lang.files.existingText](lang.md#lang.files.existingText)
    - type [LineCounts](../../src/proposals.ts#L413) = { added: number; removed: number } <!-- internal -->
      <a id="features.proposals.LineCounts"></a>
    - fn [lineCounts](../../src/proposals.ts#L416) (before: string, after: string) → LineCounts <!-- internal -->
      <a id="features.proposals.lineCounts"></a><br>`+` and `-` lines `lineDiff` prints.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - fn [listProposals](../../src/proposals.ts#L423) (root: string, specDir: string) → PendingProposal[]
      <a id="features.proposals.listProposals"></a><br>Every pending proposal with its target, line counts and why it cannot be accepted. Reads only.
      - calls [features.proposals.pendingTargets](features.md#features.proposals.pendingTargets), [features.proposals.readProposal](features.md#features.proposals.readProposal), [features.proposals.lineCounts](features.md#features.proposals.lineCounts)
    - type [ProposalDiff](../../src/proposals.ts#L434)
      <a id="features.proposals.ProposalDiff"></a><br>What `keylang proposals show <target>` prints, or why not. Reads only.
    - fn [proposalDiff](../../src/proposals.ts#L437) (root: string, specDir: string, target: string) → ProposalDiff
      <a id="features.proposals.proposalDiff"></a><br>The diff of the proposal for `target` against the file on disk, through the same gates as `accept`.
      - calls [features.proposals.readProposal](features.md#features.proposals.readProposal), [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - type [AcceptResult](../../src/proposals.ts#L448)
      <a id="features.proposals.AcceptResult"></a><br>What `acceptProposal` did.
    - fn [acceptProposal](../../src/proposals.ts#L466) (root: string, specDir: string, target: string) → AcceptResult
      <a id="features.proposals.acceptProposal"></a><br>`keylang proposals accept <target>`: the proposal's full text replaces the target, as MERGE does with every hunk accepted. The same gates as MERGE (the target's, a plain file in the store), a target that is not writable (a person's `chmod a-w`) is refused, and the write follows…
      - calls [features.proposals.readProposal](features.md#features.proposals.readProposal), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.dropProposal](features.md#features.proposals.dropProposal), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [features.proposals.countDecision](features.md#features.proposals.countDecision), [features.proposals.lineCounts](features.md#features.proposals.lineCounts)
    - type [RejectResult](../../src/proposals.ts#L504)
      <a id="features.proposals.RejectResult"></a><br>What `rejectProposal` did.
    - fn [rejectProposal](../../src/proposals.ts#L511) (root: string, specDir: string, target: string) → RejectResult
      <a id="features.proposals.rejectProposal"></a><br>`keylang proposals reject <target>`: the proposal is removed and the target stays as it is. A proposal no gate admits is still the person's to drop; a link in the store is removed itself, never followed.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [features.proposals.targetProblem](features.md#features.proposals.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.countDecision](features.md#features.proposals.countDecision), [lang.files.existingText](lang.md#lang.files.existingText)
    - fn [dropProposal](../../src/proposals.ts#L531) (root: string, target: string, text: string) → string | null <!-- internal -->
      <a id="features.proposals.dropProposal"></a><br>Removes the proposal while it still holds `text`: null, or why it stays.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [countDecision](../../src/proposals.ts#L545) (root: string, before: string, after: string, decision: "accepted" | "rejected") → void <!-- internal -->
      <a id="features.proposals.countDecision"></a><br>The model lines a decision took or dropped, as MERGE counts them (design §5.1 p.7); a count that cannot be written is lost, never the decision.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff), [features.stats.statusesIn](features.md#features.stats.statusesIn), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts)
  - module [revision-tree](../../src/revision-tree.ts#L1)
    <a id="features.revision-tree"></a><br>A revision of the repository as an analysis (`keylang diff`, `GET /api/graph-diff`): the tree of a commit is written into a temporary directory from `git ls-tree -r -z -l` and `git cat-file --batch` — no `worktree add`, so `.git` is never written, and no `tar` — analysed there…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - type [Revision](../../src/revision-tree.ts#L23)
      <a id="features.revision-tree.Revision"></a><br>One side of a diff: a commit, or the working tree (`commit` null, `ref` `WORKING_TREE`).
    - fn [resolveRevision](../../src/revision-tree.ts#L47) (root: string, ref: string, label: string, sentence: string = ref) → Revision
      <a id="features.revision-tree.resolveRevision"></a><br>The commit `ref` names, its abbreviation and subject. `HEAD` before the first commit is the empty tree (commit null); any other ref that is not a commit, no git, or no repository is an error naming `label`.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [workingTree](../../src/revision-tree.ts#L67) (root: string, label: string) → Revision
      <a id="features.revision-tree.workingTree"></a><br>The working tree as a side of a diff, with HEAD's abbreviation when there is a commit.
      - calls [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - type [TreeEntry](../../src/revision-tree.ts#L76) <!-- internal -->
      <a id="features.revision-tree.TreeEntry"></a><br>What `ls-tree -r -l` lists: the mode, type, object id and size of a path.
    - fn [treeEntries](../../src/revision-tree.ts#L85) (root: string, commit: string, label: string) → TreeEntry[] <!-- internal -->
      <a id="features.revision-tree.treeEntries"></a><br>The entries of the tree of `commit` under `root` (paths relative to it, as git prints them from there).
      - calls [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [readBlobs](../../src/revision-tree.ts#L105) (root: string, entries: readonly TreeEntry[], scratch: string, label: string, write: (entry: TreeEntry, bytes: Buffer) => void) → void <!-- internal -->
      <a id="features.revision-tree.readBlobs"></a><br>The blobs of `entries` by object id, read with `cat-file --batch` in chunks of about `BATCH_BYTES`. Stdin is a file, never a pipe: a sandbox that forbids closing a piped stdin (git-changes.ts, `gitIn`) still runs it.
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [writeTree](../../src/revision-tree.ts#L148) (root: string, commit: string, dir: string, scratch: string, label: string) → void <!-- internal -->
      <a id="features.revision-tree.writeTree"></a><br>Writes the tree of `commit` (paths relative to `root`) into `dir`; a submodule is an empty directory, a link a link.
      - calls [features.revision-tree.treeEntries](features.md#features.revision-tree.treeEntries), [features.revision-tree.readBlobs](features.md#features.revision-tree.readBlobs)
    - fn [analyzeRevision](../../src/revision-tree.ts#L194) (root: string, revision: Revision, label: string) → Promise<Analysis>
      <a id="features.revision-tree.analyzeRevision"></a><br>The analysis of `revision` (a commit, or the empty tree of an unborn HEAD): its tree in a temporary directory, analysed without evidence or migration, with the repository's fact cache read and none written. The directory is removed when the analysis ends or fails.
      - calls [features.revision-tree.writeTree](features.md#features.revision-tree.writeTree), [map.analyze.analyze](map.md#map.analyze.analyze)
  - module [spec-to-code](../../src/spec-to-code.ts#L1)
    <a id="features.spec-to-code"></a><br>`keylang spec-to-code <id>` (design §5.5), algo: a stub for a `planned` fn in the file its ID names, with the declared signature, analyzed as a new snapshot before anything is written; and for each `test` its flows name in a file that does not exist yet, a test that fails until…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - glob [base.glob](base.md#base.glob)
    - json [base.json](base.md#base.json)
    - languages [base.languages](base.md#base.languages)
    - graph [map.graph](map.md#map.graph)
    - proposals [features.proposals](features.md#features.proposals)
    - assess [check.assess](check.md#check.assess)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - llm [features.llm](features.md#features.llm)
    - verdict [check.verdict](check.md#check.verdict)
    - type [FileCandidate](../../src/spec-to-code.ts#L34)
      <a id="features.spec-to-code.FileCandidate"></a><br>One proposed file: its text before (null when new) and after.
    - type [CodeCandidate](../../src/spec-to-code.ts#L43) extends FileCandidate
      <a id="features.spec-to-code.CodeCandidate"></a><br>The code file for a planned fn, its new test files and what the change does to `check`.
    - fn [specToCode](../../src/spec-to-code.ts#L70) (analysis: Analysis, id: string, into?: string, model?: LlmClient, options: LlmCallOptions = {}) → Promise<CodeCandidate>
      <a id="features.spec-to-code.specToCode"></a><br>`model`: the body comes from the model instead of the stub — the whole function with the declared signature, in one fenced block — and is analyzed the same way before anything is written. `options.signal` cancels the model's requests (`LlmCancelled`); the file is read before…
      - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [lang.files.existingText](lang.md#lang.files.existingText), [features.spec-to-code.modelBody](features.md#features.spec-to-code.modelBody), [features.spec-to-code.stubFor](features.md#features.spec-to-code.stubFor), [features.spec-to-code.placeStub](features.md#features.spec-to-code.placeStub), [features.spec-to-code.phpFileHead](features.md#features.spec-to-code.phpFileHead), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings), [map.analyze.analyze](map.md#map.analyze.analyze), [features.spec-to-code.introduced](features.md#features.spec-to-code.introduced), [features.spec-to-code.testCandidates](features.md#features.spec-to-code.testCandidates)
    - type [CodeTarget](../../src/spec-to-code.ts#L92)
      <a id="features.spec-to-code.CodeTarget"></a><br>Where the code of a planned fn goes: the file, and the class it is a method of.
    - fn [plannedCodeTarget](../../src/spec-to-code.ts#L116) (analysis: Analysis, id: string, into?: string) → CodeTarget | { error: string; field: "id" | "into" }
      <a id="features.spec-to-code.plannedCodeTarget"></a><br>Where the code of the planned fn `id` goes, or why spec-to-code builds none — the checks it makes before any file is read: not planned (with a suggestion), not a fn, already implemented (with the place), a `deny` its flow would break (`field: "id"`); a file not of its module, a…
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration), [features.spec-to-code.callersInFlows](features.md#features.spec-to-code.callersInFlows), [check.rules.blocksDependency](check.md#check.rules.blocksDependency), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [features.spec-to-code.placeCode](features.md#features.spec-to-code.placeCode), [features.spec-to-code.parentId](features.md#features.spec-to-code.parentId), [base.diag.errorText](base.md#base.diag.errorText), [map.graph.placeFile](map.md#map.graph.placeFile), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem)
    - type [Placement](../../src/spec-to-code.ts#L169) <!-- internal -->
      <a id="features.spec-to-code.Placement"></a><br>The file and owner of a planned fn under `ownerId`; `moduleId`: the module the file must be (null: the code says where the class is).
    - fn [parentId](../../src/spec-to-code.ts#L176) (id: string) → string <!-- internal -->
      <a id="features.spec-to-code.parentId"></a><br>`id` without its last segment.
    - fn [placeCode](../../src/spec-to-code.ts#L181) (analysis: Analysis, ownerId: string, into: string | undefined) → Placement <!-- internal -->
      <a id="features.spec-to-code.placeCode"></a><br>The file (and class, if any) the fn goes into: an existing class, a new class, or a module function. Throws a user-facing reason.
      - calls [features.spec-to-code.parentId](features.md#features.spec-to-code.parentId), [features.spec-to-code.placedModule](features.md#features.spec-to-code.placedModule), [features.spec-to-code.newModuleFile](features.md#features.spec-to-code.newModuleFile)
    - fn [placedModule](../../src/spec-to-code.ts#L219) (config: Config, file: string) → string | null <!-- internal -->
      <a id="features.spec-to-code.placedModule"></a><br>The module ID a file maps to under the configured layers, or null when no layer holds it.
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
    - fn [specToCodeText](../../src/spec-to-code.ts#L230) (candidate: CodeCandidate) → string
      <a id="features.spec-to-code.specToCodeText"></a><br>What `spec-to-code <id> --print` writes on stdout: each file with its `-`/`+` lines, and between the code and the tests every finding the candidate adds (one the diagnostics already name, once, as in `check`).
      - calls [features.spec-to-code.fileDiffText](features.md#features.spec-to-code.fileDiffText), [check.assess.sameFinding](check.md#check.assess.sameFinding), [check.verdict.formatVerdict](check.md#check.verdict.formatVerdict), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [fileDiffText](../../src/spec-to-code.ts#L244) (file: FileCandidate) → string
      <a id="features.spec-to-code.fileDiffText"></a><br>`src/a.ts (new file)` and its `-`/`+` lines against the file it was built from.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - type [Introduced](../../src/spec-to-code.ts#L248) = { verdicts: Verdict[]; diagnostics: Diagnostic[] } <!-- internal -->
      <a id="features.spec-to-code.Introduced"></a>
    - fn [introduced](../../src/spec-to-code.ts#L251) (base: Analysis, next: Analysis) → Introduced <!-- internal -->
      <a id="features.spec-to-code.introduced"></a><br>Findings `next` has that `base` does not: what a candidate would change, wherever it lands (a K102 in the new file too).
    - fn [flowTests](../../src/spec-to-code.ts#L265) (analysis: Analysis, id: string) → { flow: string; file: string; name: string }[] <!-- internal -->
      <a id="features.spec-to-code.flowTests"></a><br>The `test` entries of the flows that name `id`: flow name, test file and test name.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowsMentioning](../../src/spec-to-code.ts#L282) (analysis: Analysis, id: string) → Flow[] <!-- internal -->
      <a id="features.spec-to-code.flowsMentioning"></a><br>Hand-written flows whose trigger, step, claim, `then`, or `planned` names `id`.
      - calls [features.spec-to-code.flowMentions](features.md#features.spec-to-code.flowMentions)
    - fn [flowMentions](../../src/spec-to-code.ts#L289) (spec: SpecIR, flow: Flow, id: string) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowMentions"></a><br>The flow declares `id` as `planned`, or one of its triggers, steps or claims names it.
      - calls [features.spec-to-code.flowOwns](features.md#features.spec-to-code.flowOwns), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowOwns](../../src/spec-to-code.ts#L305) (spec: SpecIR, flow: Flow, line: number) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowOwns"></a><br>`line` sits in this flow: after its heading and before the next flow of the same file.
    - fn [testCandidates](../../src/spec-to-code.ts#L316) (analysis: Analysis, id: string, target: CodeTarget, code: string, model: LlmClient | undefined, options: LlmCallOptions) → Promise<{ tests: FileCandidate[]; notes: string[] }> <!-- internal -->
      <a id="features.spec-to-code.testCandidates"></a><br>One new file per test path the flows name and the disk lacks. A test in an existing file, or in a language without a `node:test` shape, is a note: editing someone's test file is theirs to do.
      - calls [features.spec-to-code.flowTests](features.md#features.spec-to-code.flowTests), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.spec-to-code.phpSubject](features.md#features.spec-to-code.phpSubject), [features.spec-to-code.phpFileHead](features.md#features.spec-to-code.phpFileHead), [features.spec-to-code.modelPhpTest](features.md#features.spec-to-code.modelPhpTest), [features.spec-to-code.phpTestStub](features.md#features.spec-to-code.phpTestStub), [base.config.toPosix](base.md#base.config.toPosix), [features.spec-to-code.modelTest](features.md#features.spec-to-code.modelTest), [features.spec-to-code.testStub](features.md#features.spec-to-code.testStub)
    - type [PhpSubject](../../src/spec-to-code.ts#L390) <!-- internal -->
      <a id="features.spec-to-code.PhpSubject"></a><br>What a PHPUnit test of the planned fn reaches: its class (qualified) and method, or its function.
    - fn [phpSubject](../../src/spec-to-code.ts#L398) (target: CodeTarget, code: string) → PhpSubject <!-- internal -->
      <a id="features.spec-to-code.phpSubject"></a><br>The PHPUnit subject of the target, qualified with the namespace the code file declares.
      - calls [features.spec-to-code.phpNamespaceIn](features.md#features.spec-to-code.phpNamespaceIn)
    - fn [phpString](../../src/spec-to-code.ts#L406) (text: string) → string <!-- internal -->
      <a id="features.spec-to-code.phpString"></a><br>A string literal of PHP: single quotes, `\\` and `'` escaped.
    - fn [phpNamespaceIn](../../src/spec-to-code.ts#L411) (text: string) → string | null <!-- internal -->
      <a id="features.spec-to-code.phpNamespaceIn"></a><br>The namespace a PHP file declares first; null without one.
    - fn [phpFileHead](../../src/spec-to-code.ts#L422) (analysis: Analysis, file: string) → string <!-- internal -->
      <a id="features.spec-to-code.phpFileHead"></a><br>The head of a new PHP file at `file`: `<?php`, `declare(strict_types=1);` when the files beside it have it, and the namespace they declare — else the one the root `composer.json` maps the directory to (`autoload` and `autoload-dev`, PSR-4) — so the class is autoloaded and its…
      - calls [features.spec-to-code.phpNamespaceIn](features.md#features.spec-to-code.phpNamespaceIn), [features.spec-to-code.composerNamespace](features.md#features.spec-to-code.composerNamespace)
    - fn [composerNamespace](../../src/spec-to-code.ts#L450) (root: string, dir: string) → string | null <!-- internal -->
      <a id="features.spec-to-code.composerNamespace"></a><br>The PSR-4 namespace of `dir` by the root `composer.json` (`autoload`, then `autoload-dev`); null when no prefix maps it.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [phpTestStub](../../src/spec-to-code.ts#L487) (file: string, head: string, subject: PhpSubject, entries: readonly { flow: string; name: string }[]) → string <!-- internal -->
      <a id="features.spec-to-code.phpTestStub"></a><br>A PHPUnit test class that fails until it is written: one test method per declared name.
      - calls [features.spec-to-code.lastName](features.md#features.spec-to-code.lastName), [features.spec-to-code.phpString](features.md#features.spec-to-code.phpString)
    - fn [lastName](../../src/spec-to-code.ts#L506) (qualified: string) → string <!-- internal -->
      <a id="features.spec-to-code.lastName"></a><br>The last segment of a qualified PHP name (`A\B\C` → `C`).
    - fn [modelPhpTest](../../src/spec-to-code.ts#L511) (model: LlmClient, file: string, head: string, subject: PhpSubject, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelPhpTest"></a><br>The PHPUnit test class from the model; each declared test method must be in it.
    - type [TestSubject](../../src/spec-to-code.ts#L537) <!-- internal -->
      <a id="features.spec-to-code.TestSubject"></a><br>`imported`: the name the test imports; `value`: the function it reaches through it (`X.prototype.m` for a method).
    - fn [testStub](../../src/spec-to-code.ts#L543) (from: string, subject: TestSubject, entries: readonly { flow: string; name: string }[]) → string <!-- internal -->
      <a id="features.spec-to-code.testStub"></a><br>A `node:test` file that fails until written: one test per declared name, each checking the subject exists.
    - fn [modelTest](../../src/spec-to-code.ts#L552) (model: LlmClient, file: string, from: string, subject: TestSubject, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelTest"></a><br>The e2e test file from the model; each declared test name must be in it verbatim.
    - fn [callersInFlows](../../src/spec-to-code.ts#L575) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.spec-to-code.callersInFlows"></a><br>IDs directly above `id` in flows: the trigger or step each of its steps is nested under.
    - fn [newModuleFile](../../src/spec-to-code.ts#L601) (analysis: Analysis, moduleId: string) → string <!-- internal -->
      <a id="features.spec-to-code.newModuleFile"></a><br>`<layer glob prefix>/<segments>.<ext>` for a module the code lacks; one prefix per layer, or the path is ambiguous. The extension is the language most files of the layer are written in (then of the repository, then the first of `languages`); the file name follows the layer's…
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.languages.languageOf](base.md#base.languages.languageOf), [map.graph.placeFile](map.md#map.graph.placeFile), [features.spec-to-code.mostWritten](features.md#features.spec-to-code.mostWritten), [features.spec-to-code.fileStem](features.md#features.spec-to-code.fileStem)
    - fn [mostWritten](../../src/spec-to-code.ts#L625) (files: readonly string[], languages: readonly string[]) → string | null <!-- internal -->
      <a id="features.spec-to-code.mostWritten"></a><br>The language most of `files` are written in; a tie goes to the one `languages` lists first.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [fileStem](../../src/spec-to-code.ts#L647) (segment: string, scopes: readonly (readonly string[])[], ambiguous: (dotted: string, plain: string) => string) → string <!-- internal -->
      <a id="features.spec-to-code.fileStem"></a><br>The file name (without extension) of the module segment `segment`. An ID segment has `_` where the file had `.` (`bookmark.service` → `bookmark_service`), so the nearest scope whose files end in `.service` or `_service` decides; a scope with both is ambiguous.
    - fn [stubFor](../../src/spec-to-code.ts#L679) (target: CodeTarget, id: string) → string <!-- internal -->
      <a id="features.spec-to-code.stubFor"></a><br>`(order: Order) → Promise<Refund>` → a function of that signature that fails until written; the declared parameters and result are kept as written, so the stub's own signature matches the plan (no K201). A method comes without indentation and without its class: `placeStub` puts…
      - calls [features.spec-to-code.declared](features.md#features.spec-to-code.declared), [features.spec-to-code.phpString](features.md#features.spec-to-code.phpString)
    - type [DeclaredSignature](../../src/spec-to-code.ts#L700) = { params: string; result: string | null } <!-- internal -->
      <a id="features.spec-to-code.DeclaredSignature"></a>
    - fn [declared](../../src/spec-to-code.ts#L703) (signature: string | null) → DeclaredSignature <!-- internal -->
      <a id="features.spec-to-code.declared"></a><br>The parameters and result of a declared signature, as written.
    - fn [placeStub](../../src/spec-to-code.ts#L719) (before: string | null, target: CodeTarget, code: string, phpHead = "") → string <!-- internal -->
      <a id="features.spec-to-code.placeStub"></a><br>The file's text with `code` in place: appended to the module, wrapped in a new class appended to it, or inside the body of the class the code has. A new Python file gets postponed annotations: they name types it does not import, and are not evaluated when it loads.
      - calls [features.spec-to-code.intoClass](features.md#features.spec-to-code.intoClass), [features.spec-to-code.indent](features.md#features.spec-to-code.indent), [features.spec-to-code.declared](features.md#features.spec-to-code.declared)
    - fn [intoClass](../../src/spec-to-code.ts#L754) (text: string, span: { line: number; endLine: number; endCol: number | null }, code: string, python: boolean) → string <!-- internal -->
      <a id="features.spec-to-code.intoClass"></a><br>`code` as the last member of the class whose lines `span` gives, indented as its other members are.
      - calls [features.spec-to-code.leadingSpace](features.md#features.spec-to-code.leadingSpace), [features.spec-to-code.indent](features.md#features.spec-to-code.indent)
    - fn [leadingSpace](../../src/spec-to-code.ts#L789) (line: string) → string <!-- internal -->
      <a id="features.spec-to-code.leadingSpace"></a><br>The spaces and tabs a line starts with.
    - fn [indent](../../src/spec-to-code.ts#L794) (code: string, prefix: string) → string <!-- internal -->
      <a id="features.spec-to-code.indent"></a><br>Each non-blank line of `code` with `prefix` before it.
    - fn [dedent](../../src/spec-to-code.ts#L799) (code: string) → string <!-- internal -->
      <a id="features.spec-to-code.dedent"></a><br>`code` without the indentation all its non-blank lines share.
      - calls [features.spec-to-code.leadingSpace](features.md#features.spec-to-code.leadingSpace)
    - fn [fileExcerpt](../../src/spec-to-code.ts#L820) (text: string, owner: CodeTarget["owner"], firstDeclaration: number | null) → string <!-- internal -->
      <a id="features.spec-to-code.fileExcerpt"></a><br>What the model is shown of the file the code goes into, never more than about `HEAD_LINES + EXCERPT_LINES` lines: a file of up to `EXCERPT_LINES` lines whole; a longer one as its head up to the first declaration (the imports, at most `HEAD_LINES` lines), then the class the…
    - fn [firstDeclarationLine](../../src/spec-to-code.ts#L839) (analysis: Analysis, file: string) → number | null <!-- internal -->
      <a id="features.spec-to-code.firstDeclarationLine"></a><br>The first line of a declaration in `file` the snapshot knows: a fn, a type or a class; null without one.
    - fn [modelBody](../../src/spec-to-code.ts#L852) (analysis: Analysis, model: LlmClient, target: CodeTarget, id: string, before: string | null, options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelBody"></a><br>The function (or method, without its class) from the model, with its declared name; the rest of its answer is dropped.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning), [features.spec-to-code.fileExcerpt](features.md#features.spec-to-code.fileExcerpt), [features.spec-to-code.firstDeclarationLine](features.md#features.spec-to-code.firstDeclarationLine), [features.spec-to-code.dedent](features.md#features.spec-to-code.dedent)
  - module [stale](../../src/stale.ts#L1)
    <a id="features.stale"></a><br>Staleness of prose in specs (design §4.4): every node description and every flow `when` / `then` / `invariant` gets the fingerprint of the code it talks about — the closure fingerprints of the snapshot, so a change in a callee, a cycle included, reaches it. The accepted…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - json [base.json](base.md#base.json)
    - ir [lang.ir](lang.md#lang.ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [StaleBaseline](../../src/stale.ts#L29) = ReadonlyMap<string, ReadonlyMap<string, string>>
      <a id="features.stale.StaleBaseline"></a><br>Accepted fingerprints: spec file (relative to the root, POSIX) → statement key → fingerprint.
    - type [Statement](../../src/stale.ts#L32)
      <a id="features.stale.Statement"></a><br>One piece of prose bound to code.
    - type [StaleFinding](../../src/stale.ts#L50) extends Statement
      <a id="features.stale.StaleFinding"></a><br>A statement with its current fingerprint and how it compares with the accepted one.
    - type [StaleReport](../../src/stale.ts#L63)
      <a id="features.stale.StaleReport"></a><br>The outcome of comparing the specs with the baseline.
    - fn [staleBaselinePath](../../src/stale.ts#L71) (config: Pick<Config, "dir">) → string
      <a id="features.stale.staleBaselinePath"></a><br>Where the accepted fingerprints live, relative to the root, POSIX.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [specStatements](../../src/stale.ts#L80) (docs: readonly Document[]) → Statement[]
      <a id="features.stale.specStatements"></a><br>The statements of hand-written specs: descriptions of nodes in map and flow sections, and every flow `when`, `then` and `invariant`. Generated map files are skipped: their text is the code's own.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.stale.sectionRefs](features.md#features.stale.sectionRefs), [features.stale.subtreeRefs](features.md#features.stale.subtreeRefs), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [subtreeRefs](../../src/stale.ts#L133) (node: Node) → string[] <!-- internal -->
      <a id="features.stale.subtreeRefs"></a><br>Every reference target in `node` and its descendants, in document order.
    - fn [sectionRefs](../../src/stale.ts#L138) (section: Section) → string[] <!-- internal -->
      <a id="features.stale.sectionRefs"></a><br>Every reference target of a section's items.
      - calls [features.stale.subtreeRefs](features.md#features.stale.subtreeRefs), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - type [StatementPrint](../../src/stale.ts#L142) = { fingerprint: string; incomplete: string[] } <!-- internal -->
      <a id="features.stale.StatementPrint"></a>
    - fn [statementPrint](../../src/stale.ts#L149) (snapshot: AnalysisSnapshot, subjects: readonly string[]) → StatementPrint
      <a id="features.stale.statementPrint"></a><br>The fingerprint of a statement's subjects in the snapshot, and what makes it incomplete. A subject the snapshot lacks hashes as `?`, so it turning up later is a change too.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.stale.closureComplete](features.md#features.stale.closureComplete)
    - fn [closureComplete](../../src/stale.ts#L167) (snapshot: AnalysisSnapshot, id: string) → boolean <!-- internal -->
      <a id="features.stale.closureComplete"></a><br>A fn or type: its closure; a module or layer: every fn and type under it.
    - fn [staleReport](../../src/stale.ts#L191) (docs: readonly Document[], snapshot: AnalysisSnapshot, baseline: StaleBaseline, whole = false) → StaleReport
      <a id="features.stale.staleReport"></a><br>The statements of `docs` against the snapshot and the accepted baseline. Entries of the checked (hand-written) files can be obsolete; with `whole` (every spec of the repository was read) so can those of a file that is gone.
      - calls [features.stale.specStatements](features.md#features.stale.specStatements), [features.stale.statementPrint](features.md#features.stale.statementPrint), [base.span.compareText](base.md#base.span.compareText)
    - fn [acceptBaseline](../../src/stale.ts#L220) (baseline: StaleBaseline, report: StaleReport, checked: readonly string[]) → StaleBaseline
      <a id="features.stale.acceptBaseline"></a><br>The baseline after accepting `report`: the checked files' entries are replaced by the current fingerprints (a file with no statement left is dropped); other files keep theirs.
    - fn [baselineJson](../../src/stale.ts#L238) (baseline: StaleBaseline) → string
      <a id="features.stale.baselineJson"></a><br>The baseline as committed: files, then keys in code-unit order; two-space JSON with a final newline.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [parseBaseline](../../src/stale.ts#L258) (text: string, path: string) → StaleBaseline
      <a id="features.stale.parseBaseline"></a><br>Reads a committed baseline; throws `path: problem` naming the field when it is not one.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.diag.errorText](base.md#base.diag.errorText), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [staleLine](../../src/stale.ts#L287) (f: StaleFinding) → string
      <a id="features.stale.staleLine"></a><br>One report line: `file:line:col: stale invariant `…`: …`.
    - fn [staleSummary](../../src/stale.ts#L303) (report: StaleReport) → string
      <a id="features.stale.staleSummary"></a><br>The stderr summary: counts by state, incomplete and obsolete.
    - type [StaleCheck](../../src/stale.ts#L314)
      <a id="features.stale.StaleCheck"></a><br>The result of `runStaleCheck`.
    - fn [runStaleCheck](../../src/stale.ts#L328) (request: { root: string; base: string; paths: readonly string[]; accept: boolean }) → Promise<StaleCheck>
      <a id="features.stale.runStaleCheck"></a><br>`check --stale [paths…] [--accept]`: analyses the repository (nothing of it is written), compares its specs with the committed baseline, and with `accept` writes the current fingerprints of the checked files. Throws on a usage or I/O problem, naming the file.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.within](map.md#map.analyze.within), [features.stale.staleBaselinePath](features.md#features.stale.staleBaselinePath), [lang.files.existingText](lang.md#lang.files.existingText), [features.stale.parseBaseline](features.md#features.stale.parseBaseline), [map.analyze.analyze](map.md#map.analyze.analyze), [features.stale.staleReport](features.md#features.stale.staleReport), [features.stale.acceptBaseline](features.md#features.stale.acceptBaseline), [features.stale.baselineJson](features.md#features.stale.baselineJson), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
  - module [stats](../../src/stats.ts#L1)
    <a id="features.stats"></a><br>`.keylang/stats.json`: how often people accept what a model proposed (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines, and per kind of suggestion; local, never a verdict.
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [Tally](../../src/stats.ts#L14)
      <a id="features.stats.Tally"></a><br>How many items were proposed, and how many of them people accepted or rejected.
    - type [Stats](../../src/stats.ts#L21)
      <a id="features.stats.Stats"></a><br>The whole stats file, schema 1.
    - fn [readStats](../../src/stats.ts#L33) (root: string) → Stats
      <a id="features.stats.readStats"></a><br>The counts on disk; empty counts when the file is missing or damaged.
      - calls [features.stats.readStatsFile](features.md#features.stats.readStatsFile)
    - type [StatsFile](../../src/stats.ts#L37) = { text: string | null; stats: Stats } <!-- internal -->
      <a id="features.stats.StatsFile"></a>
    - fn [tallyOf](../../src/stats.ts#L40) (value: JsonValue | undefined) → Tally | null <!-- internal -->
      <a id="features.stats.tallyOf"></a><br>A tally as the file holds it; null when it is not one.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [suggestionTallyOf](../../src/stats.ts#L48) (value: JsonValue | undefined) → (Tally & { ms: number }) | null <!-- internal -->
      <a id="features.stats.suggestionTallyOf"></a><br>A suggestion's tally, with its `ms`; null when it is not one.
      - calls [features.stats.tallyOf](features.md#features.stats.tallyOf), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [tableOf](../../src/stats.ts#L56) (value: JsonValue | undefined, read: (entry: JsonValue) => T | null) → Record<string, T> | null <!-- internal -->
      <a id="features.stats.tableOf"></a><br>Every entry of a table of tallies read by `read`; null when the table or one entry is damaged. A missing table (`null`) is empty.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [readStatsFile](../../src/stats.ts#L75) (root: string) → StatsFile <!-- internal -->
      <a id="features.stats.readStatsFile"></a><br>The file as read — its text, null when there is none (or it cannot be read) — and the counts it holds.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [features.stats.tallyOf](features.md#features.stats.tallyOf), [features.stats.tableOf](features.md#features.stats.tableOf), [features.stats.suggestionTallyOf](features.md#features.stats.suggestionTallyOf)
    - fn [updateStats](../../src/stats.ts#L109) (root: string, change: (stats: Stats) => void) → void
      <a id="features.stats.updateStats"></a><br>Applies `change` to the counts on disk. Another writer (`keylang draft` in a shell beside a MERGE in the TUI) may write between the read and the write: the write lands only over the text it read, and a lost race reads again and applies `change` once more, so neither update is…
      - calls [features.stats.readStatsFile](features.md#features.stats.readStatsFile), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [statusesIn](../../src/stats.ts#L127) (lines: readonly string[]) → Map<string, number>
      <a id="features.stats.statusesIn"></a><br>`status=` of every `keylang:llm` / `keylang:algo` provenance comment in the lines.
    - fn [addDrafts](../../src/stats.ts#L142) (stats: Stats, counts: Iterable<readonly [string, number]>, field: keyof Tally) → void
      <a id="features.stats.addDrafts"></a><br>Adds per-status `counts` to the `field` (proposed, accepted or rejected) of the draft tallies, creating missing tallies.
  - module [system-proposal](../../src/system-proposal.ts#L1)
    <a id="features.system-proposal"></a><br>«Запропонувати зміни» on a system's view (system-design/08): the editor's canvas as the `# system` section it draws. Components and zones come from the canvas — a component's kind, name and technology from its shape, its zone from the lane it sits in, its relations from the…
    - diagram-proposal [features.diagram-proposal](features.md#features.diagram-proposal)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - system [check.system](check.md#check.system)
    - system-discover [map.system-discover](map.md#map.system-discover)
    - type [SystemChangeInput](../../src/system-proposal.ts#L25)
      <a id="features.system-proposal.SystemChangeInput"></a><br>What `systemChanges` needs: the edited canvas, the system it shows and a way to read spec files.
    - fn [lastLine](../../src/system-proposal.ts#L36) (node: Node) → number <!-- internal -->
      <a id="features.system-proposal.lastLine"></a><br>The last line of an item: its own, its description's and its children's.
    - fn [block](../../src/system-proposal.ts#L41) (lines: readonly string[], node: Node, indent: string) → string[] <!-- internal -->
      <a id="features.system-proposal.block"></a><br>The lines of an item and everything under it, re-indented to `indent`.
      - calls [features.system-proposal.lastLine](features.md#features.system-proposal.lastLine)
    - type [SystemChanges](../../src/system-proposal.ts#L49) = { targets: ChangedTarget[]; notes: string[] } <!-- internal -->
      <a id="features.system-proposal.SystemChanges"></a>
    - fn [systemChanges](../../src/system-proposal.ts#L52) (input: SystemChangeInput) → SystemChanges
      <a id="features.system-proposal.systemChanges"></a><br>The section's text with its components and zones as the canvas draws them; no target when the canvas says nothing new.
      - calls [lang.parser.isComponentKind](lang.md#lang.parser.isComponentKind), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.isRelationVerb](lang.md#lang.parser.isRelationVerb), [map.system-discover.systemMarkdown](map.md#map.system-discover.systemMarkdown), [lang.parser.parse](lang.md#lang.parser.parse), [features.system-proposal.lastLine](features.md#features.system-proposal.lastLine), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [features.system-proposal.block](features.md#features.system-proposal.block), [base.span.compareText](base.md#base.span.compareText)
  - module [tour](../../src/tour.ts#L1)
    <a id="features.tour"></a><br>`keylang tour` (business-flows/15): one page for a newcomer and for an agent — what the system is, its layers and modules, the business processes with their diagrams, entry points and events, integrations, blind spots and «logic in data», and where to start reading. A view over…
    - node [external.node](external.md#external.node)
    - call-sites [features.call-sites](features.md#features.call-sites)
    - config [base.config](base.md#base.config)
    - coverage-report [features.coverage-report](features.md#features.coverage-report)
    - diagram [map.diagram](map.md#map.diagram)
    - discover [features.discover](features.md#features.discover)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - integrations [features.integrations](features.md#features.integrations)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - type [TourFlow](../../src/tour.ts#L52)
      <a id="features.tour.TourFlow"></a><br>One discovered flow as the tour lists it, with a link to its diagram.
    - type [TourProcess](../../src/tour.ts#L70)
      <a id="features.tour.TourProcess"></a><br>A business process: a named group of discovered flows.
    - type [Tour](../../src/tour.ts#L79)
      <a id="features.tour.Tour"></a><br>Everything the tour shows, section by section, before rendering.
    - type [TourInputs](../../src/tour.ts#L136)
      <a id="features.tour.TourInputs"></a><br>What the tour reads besides the snapshot: the config, the hand-written specs.
    - fn [diagramLink](../../src/tour.ts#L143) (view: "flow" | "discovered", name: string) → string <!-- internal -->
      <a id="features.tour.diagramLink"></a><br>The diagram of a view on the `keylang web` page.
    - fn [readOrNull](../../src/tour.ts#L148) (abs: string) → string | null <!-- internal -->
      <a id="features.tour.readOrNull"></a><br>The file's text, or null when it cannot be read.
    - fn [moduleOf](../../src/tour.ts#L157) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="features.tour.moduleOf"></a><br>The file module a node counts under: itself or its nearest ancestor that is a module and no class.
    - fn [layerOrder](../../src/tour.ts#L172) (snapshot: AnalysisSnapshot) → string[] <!-- internal -->
      <a id="features.tour.layerOrder"></a><br>The repository's layers in `keylang.json` order, then the others by name; packages left out.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [layersOf](../../src/tour.ts#L184) (snapshot: AnalysisSnapshot) → Tour["layers"] <!-- internal -->
      <a id="features.tour.layersOf"></a><br>Per-layer counts (files, fns, modules, imports across layers) and the modules to read first.
      - calls [features.tour.layerOrder](features.md#features.tour.layerOrder), [features.tour.moduleOf](features.md#features.tour.moduleOf), [base.span.compareText](base.md#base.span.compareText)
    - fn [processesOf](../../src/tour.ts#L240) (inputs: TourInputs, flows: readonly DiscoveredFlow[], specDir: string) → Tour["processes"] <!-- internal -->
      <a id="features.tour.processesOf"></a><br>The business processes: from the saved process README when there is one, else the discovered flows by layer; plus the hand-written flows.
      - calls [features.tour.readOrNull](features.md#features.tour.readOrNull), [base.config.specPath](base.md#base.config.specPath), [features.tour.diagramLink](features.md#features.tour.diagramLink), [base.span.compareText](base.md#base.span.compareText), [features.discover-names.readProcesses](features.md#features.discover-names.readProcesses)
    - fn [entriesOf](../../src/tour.ts#L332) (snapshot: AnalysisSnapshot) → Tour["entries"] <!-- internal -->
      <a id="features.tour.entriesOf"></a><br>Entry points counted by kind, in first-seen order, with up to five distinct labels each.
    - fn [isEventKind](../../src/tour.ts#L352) (kind: string) → boolean <!-- internal -->
      <a id="features.tour.isEventKind"></a><br>A node kind of a framework adapter's events, which the snapshot's kinds do not name yet.
    - fn [eventsOf](../../src/tour.ts#L357) (snapshot: AnalysisSnapshot) → Tour["events"] <!-- internal -->
      <a id="features.tour.eventsOf"></a><br>Event nodes, should the snapshot hold them (a framework adapter's events): who dispatches each, and who listens.
      - calls [features.tour.isEventKind](features.md#features.tour.isEventKind), [base.span.compareText](base.md#base.span.compareText)
    - fn [integrationsOf](../../src/tour.ts#L367) (report: IntegrationsReport) → Tour["integrations"] <!-- internal -->
      <a id="features.tour.integrationsOf"></a><br>The integrations report reduced to counts, distinct hosts and topics (sorted).
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [blindSpotsOf](../../src/tour.ts#L389) (report: CoverageReport) → Tour["blindSpots"] <!-- internal -->
      <a id="features.tour.blindSpotsOf"></a><br>The coverage report reduced to its headline numbers, the top holes and the top data-logic signals.
    - fn [startHereOf](../../src/tour.ts#L417) (snapshot: AnalysisSnapshot, spec: SpecIR, flows: readonly DiscoveredFlow[]) → Tour["startHere"] <!-- internal -->
      <a id="features.tour.startHereOf"></a><br>The fns to read first: by the flows (hand-written and discovered) that name them, then by their callers, then by ID; packages and test files left out.
      - calls [map.diagram.flowIds](map.md#map.diagram.flowIds), [features.call-sites.isTestFile](features.md#features.call-sites.isTestFile), [base.span.compareText](base.md#base.span.compareText)
    - fn [buildTour](../../src/tour.ts#L444) (inputs: TourInputs) → Promise<Tour>
      <a id="features.tour.buildTour"></a><br>The tour over a snapshot, the hand-written specs and the saved files beside them (the discovered view and its names README). Reads the analysed files' facts, as `coverage` and `integrations` do; writes nothing.
      - calls [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.coverage-report.loadDataLogic](features.md#features.coverage-report.loadDataLogic), [features.coverage-report.findDataLogic](features.md#features.coverage-report.findDataLogic), [features.coverage-report.coverageReport](features.md#features.coverage-report.coverageReport), [features.tour.readOrNull](features.md#features.tour.readOrNull), [features.integrations.findIntegrations](features.md#features.integrations.findIntegrations), [features.integrations.loadIntegrations](features.md#features.integrations.loadIntegrations), [features.tour.layersOf](features.md#features.tour.layersOf), [features.tour.processesOf](features.md#features.tour.processesOf), [features.tour.entriesOf](features.md#features.tour.entriesOf), [features.tour.eventsOf](features.md#features.tour.eventsOf), [features.tour.integrationsOf](features.md#features.tour.integrationsOf), [features.tour.blindSpotsOf](features.md#features.tour.blindSpotsOf), [features.tour.startHereOf](features.md#features.tour.startHereOf)
    - fn [percent](../../src/tour.ts#L479) (share: number) → string <!-- internal -->
      <a id="features.tour.percent"></a>
    - fn [code](../../src/tour.ts#L482) (text: string) → string <!-- internal -->
      <a id="features.tour.code"></a><br>Inline code; a backtick inside would end the span, so it becomes `'`.
    - fn [cell](../../src/tour.ts#L485) (text: string) → string <!-- internal -->
      <a id="features.tour.cell"></a><br>One table cell: no pipe or line break.
    - fn [tourMarkdown](../../src/tour.ts#L488) (tour: Tour) → string
      <a id="features.tour.tourMarkdown"></a><br>The tour as one Markdown page, the seven sections in order. Ends with a newline.
      - calls [features.discover.proseLine](features.md#features.discover.proseLine), [features.tour.code](features.md#features.tour.code), [features.tour.cell](features.md#features.tour.cell), [features.tour.percent](features.md#features.tour.percent)
  - module [ts-projection](../../src/ts-projection.ts#L1)
    <a id="features.ts-projection"></a><br>TypeScript projection of the planned declarations (`keylang types`, .scratch/type-fields §6): how the intentions of the specs read as TypeScript interfaces before any of them is written.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [ProjectionInput](../../src/ts-projection.ts#L24)
      <a id="features.ts-projection.ProjectionInput"></a><br>What to project: the specs, the code (null without one), which IDs and where the text will live.
    - type [ProjectedItem](../../src/ts-projection.ts#L34)
      <a id="features.ts-projection.ProjectedItem"></a><br>One declaration of the projection, in output order.
    - type [Projection](../../src/ts-projection.ts#L49)
      <a id="features.ts-projection.Projection"></a><br>The whole projection: the file text and its items.
    - type [PlannedSelection](../../src/ts-projection.ts#L55)
      <a id="features.ts-projection.PlannedSelection"></a><br>The planned IDs of named flows or features, and the names that are neither.
    - fn [projectTypes](../../src/ts-projection.ts#L70) (input: ProjectionInput) → Projection
      <a id="features.ts-projection.projectTypes"></a><br>The projection of the selected planned declarations, imports first, then declarations by ID.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.ts-projection.importItem](features.md#features.ts-projection.importItem), [features.ts-projection.typeItem](features.md#features.ts-projection.typeItem), [features.ts-projection.addToGroup](features.md#features.ts-projection.addToGroup), [features.ts-projection.parentOf](features.md#features.ts-projection.parentOf), [features.ts-projection.moduleItem](features.md#features.ts-projection.moduleItem), [features.ts-projection.projectionText](features.md#features.ts-projection.projectionText)
    - fn [plannedIdsOf](../../src/ts-projection.ts#L121) (spec: Pick<SpecIR, "planned" | "flows">, names: readonly string[], specDir: string) → PlannedSelection
      <a id="features.ts-projection.plannedIdsOf"></a><br>The planned IDs of named flows or features, in spec order: a flow's are the `planned` lines of its section, a feature's those of `<dir>/features/<name>.md`. `unknown` lists the names that are neither.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [addToGroup](../../src/ts-projection.ts#L141) (groups: Map<string, Planned[]>, module: string, fn: Planned | null) → void <!-- internal -->
      <a id="features.ts-projection.addToGroup"></a><br>Adds a planned fn (or only the group, for a planned module) to the group of `module`.
    - fn [importItem](../../src/ts-projection.ts#L149) (id: string, code: AnalysisSnapshot["nodes"][string], outDir: string) → { item: ProjectedItem; path: string } | null <!-- internal -->
      <a id="features.ts-projection.importItem"></a><br>`import type { X } from "<path>"` for a code type or class in a TypeScript file, with that path; null for any other node.
      - calls [features.ts-projection.lastSegment](features.md#features.ts-projection.lastSegment)
    - fn [typeItem](../../src/ts-projection.ts#L161) (item: Planned) → ProjectedItem <!-- internal -->
      <a id="features.ts-projection.typeItem"></a><br>A planned type: an interface with its fields (and `extends`), an alias for `= X`, or `unknown` with a TODO.
      - calls [features.ts-projection.pascalCase](features.md#features.ts-projection.pascalCase), [features.ts-projection.lastSegment](features.md#features.ts-projection.lastSegment), [features.ts-projection.docComment](features.md#features.ts-projection.docComment), [features.ts-projection.withoutSemicolon](features.md#features.ts-projection.withoutSemicolon), [features.ts-projection.memberName](features.md#features.ts-projection.memberName)
    - fn [moduleItem](../../src/ts-projection.ts#L187) (id: string, module: Planned | null, fns: readonly Planned[]) → ProjectedItem <!-- internal -->
      <a id="features.ts-projection.moduleItem"></a><br>The interface of a module: its planned fns as methods, by ID; placed at the planned module, else at its first fn.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.ts-projection.pascalCase](features.md#features.ts-projection.pascalCase), [features.ts-projection.lastSegment](features.md#features.ts-projection.lastSegment), [features.ts-projection.method](features.md#features.ts-projection.method), [features.ts-projection.docComment](features.md#features.ts-projection.docComment)
    - fn [method](../../src/ts-projection.ts#L202) (fn: Planned) → string <!-- internal -->
      <a id="features.ts-projection.method"></a><br>A planned fn as a method: `(x: T) → R` is `f(x: T): R;`, a parameter list alone returns `unknown`, no signature takes any arguments. A signature of another shape is kept as a comment beside the open form.
      - calls [features.ts-projection.memberName](features.md#features.ts-projection.memberName), [features.ts-projection.lastSegment](features.md#features.ts-projection.lastSegment), [features.ts-projection.closingParen](features.md#features.ts-projection.closingParen), [features.ts-projection.withoutSemicolon](features.md#features.ts-projection.withoutSemicolon)
    - fn [closingParen](../../src/ts-projection.ts#L224) (text: string) → number | null <!-- internal -->
      <a id="features.ts-projection.closingParen"></a><br>The index of the `)` that closes the `(` at index 0, or null when it does not close.
    - fn [projectionText](../../src/ts-projection.ts#L236) (imports: readonly { item: ProjectedItem; path: string }[], declarations: readonly ProjectedItem[]) → string <!-- internal -->
      <a id="features.ts-projection.projectionText"></a><br>The file: the header, the imports, then the declarations, blank lines between, one final newline.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [docComment](../../src/ts-projection.ts#L251) (id: string, file: string, line: number) → string <!-- internal -->
      <a id="features.ts-projection.docComment"></a><br>`/** <id> — <spec file>:<line> *\/` above a declaration.
    - fn [memberName](../../src/ts-projection.ts#L256) (name: string) → string <!-- internal -->
      <a id="features.ts-projection.memberName"></a><br>A member name as TypeScript accepts it: bare when an identifier, else quoted.
    - fn [pascalCase](../../src/ts-projection.ts#L261) (segment: string) → string <!-- internal -->
      <a id="features.ts-projection.pascalCase"></a><br>`order-line` → `OrderLine`, `orders` → `Orders`; a leading digit gets `_`.
    - fn [withoutSemicolon](../../src/ts-projection.ts#L272) (type: string) → string <!-- internal -->
      <a id="features.ts-projection.withoutSemicolon"></a><br>A type without the `;` a plan may end it with.
    - fn [lastSegment](../../src/ts-projection.ts#L277) (id: string) → string <!-- internal -->
      <a id="features.ts-projection.lastSegment"></a><br>The last dotted segment of an ID.
    - fn [parentOf](../../src/ts-projection.ts#L282) (id: string) → string <!-- internal -->
      <a id="features.ts-projection.parentOf"></a><br>The ID without its last segment.
  - module [voice-local](../../src/voice-local.ts#L1)
    <a id="features.voice-local"></a><br>The optional native parts of voice (design §7.4): `decibri` for the microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition. Both ship prebuilt binaries and are optional peer dependencies: npm installs them only when the user adds them next to keylang, and…
    - node [external.node](external.md#external.node)
    - voice [features.voice](features.md#features.voice)
    - fugood-whisper_node [external.fugood-whisper_node](external.md#external.fugood-whisper_node)
    - decibri [external.decibri](external.md#external.decibri)
    - type [Microphone](../../src/voice-local.ts#L24) = { chunks: AsyncIterable<Int16Array>; stop: () => void } <!-- internal -->
      <a id="features.voice-local.Microphone"></a><br>A started microphone: PCM chunks as they are recorded, and how to stop it.
    - type [ModuleStatus](../../src/voice-local.ts#L27)
      <a id="features.voice-local.ModuleStatus"></a><br>Whether an optional package can be used here: `missing` when it is not installed, `unavailable` with the reason when it is there but does not load.
    - type [WhisperContext](../../src/voice-local.ts#L30) <!-- internal -->
      <a id="features.voice-local.WhisperContext"></a><br>A loaded whisper model, as `@fugood/whisper.node` returns it; `release` frees the native memory.
    - type [WhisperBinding](../../src/voice-local.ts#L36) <!-- internal -->
      <a id="features.voice-local.WhisperBinding"></a><br>The native binding `loadWhisperModule` resolves to; only its `WhisperContext` class is checked.
    - type [Whisper](../../src/voice-local.ts#L41) <!-- internal -->
      <a id="features.voice-local.Whisper"></a><br>The two exports of `@fugood/whisper.node` this module uses.
    - type [MicrophoneStream](../../src/voice-local.ts#L47) = AsyncIterable<Buffer> & { stop: () => void } <!-- internal -->
      <a id="features.voice-local.MicrophoneStream"></a><br>A `decibri` microphone: 16-bit PCM chunks until `stop()`.
    - type [MicrophoneClass](../../src/voice-local.ts#L50) <!-- internal -->
      <a id="features.voice-local.MicrophoneClass"></a><br>Describes a constructor shape taking `sampleRate` and `channels` and returning an opaque instance, so the voice feature can hold a dynamically loaded microphone library without a hard type dependency on it. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [Decibri](../../src/voice-local.ts#L53) <!-- internal -->
      <a id="features.voice-local.Decibri"></a><br>The one export of `decibri` this module uses.
    - fn [isWhisper](../../src/voice-local.ts#L58) (exports: Partial<Whisper> | null) → exports is Whisper <!-- internal -->
      <a id="features.voice-local.isWhisper"></a><br>The README's shape of `@fugood/whisper.node`: both entry points are functions.
    - fn [isWhisperBinding](../../src/voice-local.ts#L63) (binding: Partial<WhisperBinding> | null) → binding is WhisperBinding <!-- internal -->
      <a id="features.voice-local.isWhisperBinding"></a><br>The loaded native binding exposes a `WhisperContext` constructor.
    - fn [isDecibri](../../src/voice-local.ts#L68) (exports: Partial<Decibri> | null) → exports is Decibri <!-- internal -->
      <a id="features.voice-local.isDecibri"></a><br>`decibri` exports a `Microphone` constructor.
    - fn [isMicrophoneStream](../../src/voice-local.ts#L73) (mic: Partial<MicrophoneStream> | null) → mic is MicrophoneStream <!-- internal -->
      <a id="features.voice-local.isMicrophoneStream"></a><br>A microphone instance that can be iterated asynchronously and stopped.
    - fn [loadWhisper](../../src/voice-local.ts#L82) () → Promise<{ module: Whisper } | Exclude<ModuleStatus, { status: "ok" }>> <!-- internal -->
      <a id="features.voice-local.loadWhisper"></a><br>`@fugood/whisper.node` with its platform binary: the package itself loads the binary only on first use, so the check loads it, and a package without a working binary is not reported as installed.
      - calls [features.voice-local.optional](features.md#features.voice-local.optional), [features.voice-local.isWhisper](features.md#features.voice-local.isWhisper), [features.voice-local.quietly](features.md#features.voice-local.quietly), [features.voice-local.isWhisperBinding](features.md#features.voice-local.isWhisperBinding)
    - fn [localStatus](../../src/voice-local.ts#L102) () → Promise<ModuleStatus>
      <a id="features.voice-local.localStatus"></a><br>What `@fugood/whisper.node` can do on this machine.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper)
    - fn [localAvailable](../../src/voice-local.ts#L109) () → Promise<boolean>
      <a id="features.voice-local.localAvailable"></a><br>Whether `@fugood/whisper.node` and its binary load on this machine.
      - calls [features.voice-local.localStatus](features.md#features.voice-local.localStatus)
    - fn [loadDecibri](../../src/voice-local.ts#L114) () → { module: Decibri } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.loadDecibri"></a><br>`decibri`, when installed and of the expected shape, or why not.
      - calls [features.voice-local.optional](features.md#features.voice-local.optional), [features.voice-local.isDecibri](features.md#features.voice-local.isDecibri)
    - fn [microphoneStatus](../../src/voice-local.ts#L126) () → Promise<ModuleStatus>
      <a id="features.voice-local.microphoneStatus"></a><br>What `decibri` can do on this machine.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [microphoneAvailable](../../src/voice-local.ts#L133) () → Promise<boolean>
      <a id="features.voice-local.microphoneAvailable"></a><br>Whether `decibri` loads on this machine.
      - calls [features.voice-local.microphoneStatus](features.md#features.voice-local.microphoneStatus)
    - fn [defaultMicrophone](../../src/voice-local.ts#L138) () → Promise<Microphone | null>
      <a id="features.voice-local.defaultMicrophone"></a><br>The system microphone through `decibri` (16 kHz, mono, s16le); null when it is not installed.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri), [features.voice-local.isMicrophoneStream](features.md#features.voice-local.isMicrophoneStream)
    - fn [transcribeLocal](../../src/voice-local.ts#L167) (modelFile: string, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice-local.transcribeLocal"></a><br>whisper.cpp on this machine, window by window, with the glossary as the initial prompt.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper), [features.voice-local.quietly](features.md#features.voice-local.quietly), [features.voice.windows](features.md#features.voice.windows), [features.voice.joinWindows](features.md#features.voice.joinWindows)
    - fn [optional](../../src/voice-local.ts#L201) (name: string, load: () => T) → { module: T } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.optional"></a><br>A package that may be absent or fail to load (a native binding without a prebuilt binary for this platform throws on `require`). Literal specifiers, so the map sees which packages voice may load.
    - fn [quietly](../../src/voice-local.ts#L225) (load: () => Promise<T>) → Promise<({ value: T } | { error: string }) & { warnings: string[] }> <!-- internal -->
      <a id="features.voice-local.quietly"></a><br>Runs `load` with `console.warn` captured: whisper.node warns while it looks for a platform binary, which would draw over the TUI. The warnings become part of a failure's reason.
  - module [voice](../../src/voice.ts#L1)
    <a id="features.voice"></a><br>Voice input (design §7.3 «Голосовий ввід»): PCM (16 kHz, mono, s16le) → text, by a local whisper.cpp model or OpenRouter's audio input. Speech goes into free text by default; a tiny command grammar («крок …», «коли … тоді …», «емітить …») turns into list items with IDs matched…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - json [base.json](base.md#base.json)
    - keys [features.keys](features.md#features.keys)
    - parser [lang.parser](lang.md#lang.parser)
    - type [Env](../../src/voice.ts#L38) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.voice.Env"></a><br>A read-only string-keyed map whose values may be undefined, shaped like `process.env`, used by the voice feature to look up configuration such as API keys without mutating the source object. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [VoiceConfig](../../src/voice.ts#L41)
      <a id="features.voice.VoiceConfig"></a><br>The `voice` section of the configuration.
    - type [VoiceEngine](../../src/voice.ts#L47)
      <a id="features.voice.VoiceEngine"></a><br>The engine chosen for this machine, or `missing` with a sentence saying what to set up.
    - fn [modelsDir](../../src/voice.ts#L53) (home: string = homedir()) → string
      <a id="features.voice.modelsDir"></a><br>Where downloaded whisper models are looked for: a cache under the user's home.
    - fn [localModel](../../src/voice.ts#L58) (home: string = homedir()) → string | null
      <a id="features.voice.localModel"></a><br>The first downloaded whisper model, or null.
      - calls [features.voice.modelsDir](features.md#features.voice.modelsDir)
    - fn [voiceEngine](../../src/voice.ts#L69) (config: VoiceConfig, localAvailable: boolean, env: Env = process.env, home: string = homedir()) → VoiceEngine
      <a id="features.voice.voiceEngine"></a><br>`local`: a downloaded model and the optional `@fugood/whisper.node`; `openrouter`: a key; `auto`: local when its model is there, else OpenRouter with a key. Otherwise what to set up, in one sentence.
      - calls [features.keys.readKey](features.md#features.keys.readKey), [features.voice.localModel](features.md#features.voice.localModel), [features.voice.modelsDir](features.md#features.voice.modelsDir)
    - fn [wav](../../src/voice.ts#L90) (pcm: Int16Array, rate: number = SAMPLE_RATE) → Buffer
      <a id="features.voice.wav"></a><br>A RIFF/WAVE file around 16-bit mono PCM.
    - fn [windows](../../src/voice.ts#L113) (pcm: Int16Array, rate: number = SAMPLE_RATE) → Int16Array[]
      <a id="features.voice.windows"></a><br>Windows of `WINDOW_SECONDS` that overlap by `OVERLAP_SECONDS`; a short recording is one window, an empty one none.
    - fn [seamWord](../../src/voice.ts#L137) (word: string) → string <!-- internal -->
      <a id="features.voice.seamWord"></a><br>A word as the overlap repeats it: case and punctuation differ between windows (`card,` / `Card`).
    - fn [joinWindows](../../src/voice.ts#L142) (texts: readonly string[]) → string
      <a id="features.voice.joinWindows"></a><br>Joins window texts, dropping the words the overlap repeated at a seam: the longest run that ends one window and starts the next.
      - calls [features.voice.seamWord](features.md#features.voice.seamWord)
    - fn [glossary](../../src/voice.ts#L183) (analysis: Analysis, path: string, text: string, line: number) → string[]
      <a id="features.voice.glossary"></a><br>At most 30 IDs near the cursor: those of the current flow, the neighbours of the IDs on the cursor line, and those IDs last — the end of a prompt weighs most.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [spoken](../../src/voice.ts#L214) (id: string) → string <!-- internal -->
      <a id="features.voice.spoken"></a><br>The words people say for an ID: its last segments split at case and separators.
    - fn [matchId](../../src/voice.ts#L230) (words: string, ids: readonly string[]) → string | null
      <a id="features.voice.matchId"></a><br>The ID whose spoken form holds every word (the fuzzy match of completion). Several such IDs are ambiguous unless exactly one is said in full («order total» for `domain.order.total` beside `domain.order.totalTax`); then null, and the words stay as said.
      - calls [features.voice.spoken](features.md#features.voice.spoken)
    - fn [speechToSpec](../../src/voice.ts#L255) (text: string, ids: readonly string[], indent = "") → string
      <a id="features.voice.speechToSpec"></a><br>«крок X» → `- step <id>`, «коли A тоді B» → `- when A` + ` - then B`, «емітить X» → `- emits X` (also `step`, `when … then …`, `emits`); anything else stays free text. A step whose ID does not match stays as said.
      - calls [features.voice.matchId](features.md#features.voice.matchId)
    - fn [transcriptOf](../../src/voice.ts#L276) (reply: string) → string <!-- internal -->
      <a id="features.voice.transcriptOf"></a><br>The text of an OpenRouter chat completion; anything else (not JSON, an error with status 200) is an error that says so.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [transcribeOpenRouter](../../src/voice.ts#L306) (engine: Extract<VoiceEngine, { kind: "openrouter" }>, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice.transcribeOpenRouter"></a><br>One OpenRouter chat completion per window, with the glossary as the prompt; an empty recording sends nothing.
      - calls [features.voice.windows](features.md#features.voice.windows), [features.voice.wav](features.md#features.voice.wav), [features.voice.transcriptOf](features.md#features.voice.transcriptOf), [features.voice.joinWindows](features.md#features.voice.joinWindows)
  - module [weakening](../../src/weakening.ts#L1)
    <a id="features.weakening"></a><br>Weakening of the spec since a base commit (K108, ticket 49): what an agent could change to switch a rule off without touching the code. In keylang.json: a file a rule reaches that `exclude`, `assume` or `outside` now leave unread, a `layers` glob that moves such a file out of…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - files [lang.files](lang.md#lang.files)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - json [base.json](base.md#base.json)
    - graph [map.graph](map.md#map.graph)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [Weakening](../../src/weakening.ts#L33)
      <a id="features.weakening.Weakening"></a><br>One way the spec got weaker. `file` is POSIX, relative to the root; the line is the current file's, or the base's for a removed line.
    - type [WeakeningReport](../../src/weakening.ts#L43)
      <a id="features.weakening.WeakeningReport"></a><br>The weakenings since a base, or why they were not compared (no git, no keylang.json at the base).
    - type [ScopeFields](../../src/weakening.ts#L49) <!-- internal -->
      <a id="features.weakening.ScopeFields"></a><br>The fields of keylang.json that decide what the rules see, read leniently: a field of the wrong shape is absent.
    - type [ClassField](../../src/weakening.ts#L61) = "exclude" | "outside" | "assume" <!-- internal -->
      <a id="features.weakening.ClassField"></a><br>The config fields that can stop keylang reading a file.
    - fn [strings](../../src/weakening.ts#L64) (value: JsonValue | undefined) → string[] | undefined <!-- internal -->
      <a id="features.weakening.strings"></a><br>A JSON array of strings; anything else (a mixed array included) is undefined.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [configObject](../../src/weakening.ts#L72) (text: string) → JsonObject <!-- internal -->
      <a id="features.weakening.configObject"></a><br>The top-level object of a `keylang.json` text; an unreadable or non-object one reads as empty.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [scopeFields](../../src/weakening.ts#L83) (text: string) → ScopeFields <!-- internal -->
      <a id="features.weakening.scopeFields"></a><br>The `ScopeFields` of a keylang.json text; a missing or malformed field takes its default.
      - calls [features.weakening.configObject](features.md#features.weakening.configObject), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [features.weakening.strings](features.md#features.weakening.strings)
    - fn [fieldLine](../../src/weakening.ts#L118) (text: string, field: string) → number <!-- internal -->
      <a id="features.weakening.fieldLine"></a><br>The 1-based line of `"field"` in the JSON text, else 1.
    - fn [listText](../../src/weakening.ts#L125) (list: readonly string[] | undefined) → string <!-- internal -->
      <a id="features.weakening.listText"></a><br>A list field for a message; an absent one reads as `(detected)`.
    - fn [someFiles](../../src/weakening.ts#L128) (files: readonly string[]) → string <!-- internal -->
      <a id="features.weakening.someFiles"></a><br>Up to three file names, then how many more: messages stay one readable line.
    - fn [configWeakenings](../../src/weakening.ts#L140) (input: { base: string; now: string; files?: readonly string[]; place?: (file: string, fields: ScopeFields) => string; reached: (layer: string) => string | null; }) → Weakening[]
      <a id="features.weakening.configWeakenings"></a><br>keylang.json weakened from `base` to `now`. `files` are the source files of the configured languages (POSIX, relative to the root), `place` the layer a file is in under given fields (`outside`, or `unassigned` for none), and `reached` the text of a rule whose scope holds a…
      - calls [features.weakening.scopeFields](features.md#features.weakening.scopeFields), [features.weakening.fieldLine](features.md#features.weakening.fieldLine), [base.config.sourceClass](base.md#base.config.sourceClass), [features.weakening.listText](features.md#features.weakening.listText), [features.weakening.someFiles](features.md#features.weakening.someFiles)
    - type [Atom](../../src/weakening.ts#L206) <!-- internal -->
      <a id="features.weakening.Atom"></a><br>A rule line as the comparison counts it: a dependency rule once per target, so a baseline line that lost one target lost a deny.
    - fn [atoms](../../src/weakening.ts#L215) (spec: SpecIR) → Atom[] <!-- internal -->
      <a id="features.weakening.atoms"></a><br>The atoms of every rule in a spec: dependency rules split per target, other rules kept whole by their text.
    - fn [counts](../../src/weakening.ts#L229) (items: readonly T[], key: (item: T) => string) → Map<string, number> <!-- internal -->
      <a id="features.weakening.counts"></a><br>A multiset: how many items have each key. Duplicated lines count separately.
    - fn [ruleLayers](../../src/weakening.ts#L238) (rule: RuleAssertion) → string[] <!-- internal -->
      <a id="features.weakening.ruleLayers"></a><br>Each layer a rule's scope holds, with the rule's text; `*` for a rule over every module (`no-cycles *`).
    - fn [reachingRule](../../src/weakening.ts#L253) (specs: readonly SpecIR[]) → (layer: string) => string | null
      <a id="features.weakening.reachingRule"></a><br>The text of the first rule whose scope holds `layer`, over the specs given.
      - calls [features.weakening.ruleLayers](features.md#features.weakening.ruleLayers)
    - fn [specWeakenings](../../src/weakening.ts#L263) (baseDocs: readonly Document[], nowDocs: readonly Document[], dir: string, at: string) → Weakening[]
      <a id="features.weakening.specWeakenings"></a><br>The specs weakened from `baseDocs` to `nowDocs` (both POSIX, relative to the root; `dir` is the spec directory, `at` how a sentence names the base).
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [base.config.specPath](base.md#base.config.specPath), [features.weakening.atoms](features.md#features.weakening.atoms), [features.weakening.counts](features.md#features.weakening.counts), [features.feature-status.planItems](features.md#features.feature-status.planItems), [base.span.compareText](base.md#base.span.compareText)
    - fn [weakeningDiagnostic](../../src/weakening.ts#L334) (weakening: Weakening, display: (path: string) => string = (path) => path) → Diagnostic
      <a id="features.weakening.weakeningDiagnostic"></a><br>K108 at a weakening's position, `display` turning its root-relative path into the report's.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [readWeakenings](../../src/weakening.ts#L348) (config: Config, ref: string, label: string, at: string = ref) → WeakeningReport
      <a id="features.weakening.readWeakenings"></a><br>The spec at `ref` against the working tree: keylang.json and the `.md` files of the spec directory (the generated map and reading aids left out). Without git, or without keylang.json at `ref` (a first commit, an unborn HEAD), nothing is compared and `note` says why: that is not…
      - calls [base.config.specPath](base.md#base.config.specPath), [map.analyze.readingAid](map.md#map.analyze.readingAid), [features.git-changes.gitFileAt](features.md#features.git-changes.gitFileAt), [features.weakening.scopeFields](features.md#features.weakening.scopeFields), [features.git-changes.gitSpecFilesAt](features.md#features.git-changes.gitSpecFilesAt), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [base.span.compareText](base.md#base.span.compareText), [lang.parser.parse](lang.md#lang.parser.parse), [features.weakening.reachingRule](features.md#features.weakening.reachingRule), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [base.config.guessLayers](base.md#base.config.guessLayers), [map.graph.placeFile](map.md#map.graph.placeFile), [base.config.classifySources](base.md#base.config.classifySources), [features.weakening.configWeakenings](features.md#features.weakening.configWeakenings), [features.weakening.specWeakenings](features.md#features.weakening.specWeakenings)
