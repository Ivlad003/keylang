<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [agent-cli](#features.agent-cli) · [agent-context](#features.agent-context) · [baseline](#features.baseline) · [call-sites](#features.call-sites) · [changed](#features.changed) · [check-format](#features.check-format) · [check-results](#features.check-results) · [clone](#features.clone) · [coverage-report](#features.coverage-report) · [discover-names](#features.discover-names) · [discover](#features.discover) · [draft-llm](#features.draft-llm) · [draft](#features.draft) · [explain-edge](#features.explain-edge) · [explain-inventory](#features.explain-inventory) · [explain-llm](#features.explain-llm) · [explain-node](#features.explain-node) · [explain-offline](#features.explain-offline) · [explain](#features.explain) · [explorer](#features.explorer) · [feature-status](#features.feature-status) · [flow-bundle](#features.flow-bundle) · [ghost](#features.ghost) · [git-changes](#features.git-changes) · [git-hook](#features.git-hook) · [harness](#features.harness) · [integrations](#features.integrations) · [keys](#features.keys) · [llm](#features.llm) · [lsp-features](#features.lsp-features) · [node-search](#features.node-search) · [proposals](#features.proposals) · [spec-to-code](#features.spec-to-code) · [stale](#features.stale) · [stats](#features.stats) · [voice-local](#features.voice-local) · [voice](#features.voice)

# map

- features
  <a id="features"></a><br>The layer holds keylang's user-facing capabilities: checking and reports ([`features.check-results`](features.md#features.check-results), [`features.changed`](features.md#features.changed)), model-backed drafting and explanations ([`features.llm`](features.md#features.llm), [`features.draft-llm`](features.md#features.draft-llm)), and editor, git and voice support ([`features.lsp-features`](features.md#features.lsp-features)… _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [agent-cli](../../src/agent-cli.ts#L1)
    <a id="features.agent-cli"></a><br>An agent CLI as a text model (ADR 0009): `cli:claude`, `cli:codex`, `cli:opencode`, `cli:cursor` or a command defined in `~/.config/keylang/agents.json`. One request is one run of the CLI in "answer only" form: no project hooks, MCP servers or instructions where the CLI can…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - type [Env](../../src/agent-cli.ts#L20) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.agent-cli.Env"></a><br>A read-only map of environment variable names to their string values, where missing variables appear as `undefined`. It is the shape the agent CLI uses when reading process environment settings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Preset](../../src/agent-cli.ts#L21) = (typeof AGENT_CLI_PRESETS)[number] <!-- internal -->
      <a id="features.agent-cli.Preset"></a><br>Derives a string-literal union type from the elements of the `AGENT_CLI_PRESETS` array, so a value can only be one of the preset names listed there. Used to type-check preset selection in the agent CLI module. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CliDefinition](../../src/agent-cli.ts#L24) = { command: string[] } | { bin: string }
      <a id="features.agent-cli.CliDefinition"></a><br>A user's own CLI: `command[0]` is the binary; `{prompt_file}` and `{model}` are placeholders. A preset name takes only `bin`.
    - type [AgentSettings](../../src/agent-cli.ts#L27)
      <a id="features.agent-cli.AgentSettings"></a><br>`~/.config/keylang/agents.json`, validated.
    - type [AgentSource](../../src/agent-cli.ts#L33) = "KEYLANG_AGENT" | "agents.json" | "keylang.json"
      <a id="features.agent-cli.AgentSource"></a><br>Where the effective agent came from.
    - type [CliRequest](../../src/agent-cli.ts#L35)
      <a id="features.agent-cli.CliRequest"></a><br>Defines the shape of a single request handed to the CLI agent layer: a `system` string carrying instructions and a `prompt` string carrying the user-facing text to be answered. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CliCallOptions](../../src/agent-cli.ts#L41)
      <a id="features.agent-cli.CliCallOptions"></a><br>`ms`: the call's bound; `fromVariable`: the bound is `KEYLANG_LLM_TIMEOUT_MS`, which the timeout message then names.
    - type [CliClient](../../src/agent-cli.ts#L49)
      <a id="features.agent-cli.CliClient"></a><br>Contract for a handle onto an external agent CLI binary: it exposes the agent identifier, the chosen model (empty for the CLI default) and the executable path. Its single method sends a `CliRequest` with `CliCallOptions` and resolves to the CLI's text output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [CliCancelled](../../src/agent-cli.ts#L60)
      <a id="features.agent-cli.CliCancelled"></a><br>The caller cancelled the run; `llm.ts` turns it into `LlmCancelled`.
      - fn [constructor](../../src/agent-cli.ts#L61) (agent: string)
        <a id="features.agent-cli.CliCancelled.constructor"></a><br>Builds an error whose message prefixes "cancelled" with the given agent label and sets the instance name to "CliCancelled" so callers can distinguish it from other failures. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [agentsFile](../../src/agent-cli.ts#L76) (home: string) → string
      <a id="features.agent-cli.agentsFile"></a><br>Builds the path to the per-user agent settings file by joining the given home directory with `.config/keylang/agents.json`. Used by [`features.agent-cli.readAgentSettings`](features.md#features.agent-cli.readAgentSettings), [`features.agent-cli.cliClient`](features.md#features.agent-cli.cliClient), and [`features.agent-cli.presetBinary`](features.md#features.agent-cli.presetBinary) to locate that file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readAgentSettings](../../src/agent-cli.ts#L81) (home: string) → AgentSettings
      <a id="features.agent-cli.readAgentSettings"></a><br>agents.json, validated; an absent file is empty settings. Errors name the file and the field.
      - calls [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.parseAgentSettings](features.md#features.agent-cli.parseAgentSettings)
    - fn [parseAgentSettings](../../src/agent-cli.ts#L94) (file: string, value: unknown) → AgentSettings
      <a id="features.agent-cli.parseAgentSettings"></a><br>The settings of an agents.json already parsed as JSON.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject), [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.cliDefinition](features.md#features.agent-cli.cliDefinition)
    - fn [cliDefinition](../../src/agent-cli.ts#L110) (file: string, name: string, def: unknown) → CliDefinition <!-- internal -->
      <a id="features.agent-cli.cliDefinition"></a><br>Validates one `clis.<name>` entry from a settings file, checking the name format, allowed fields, and either a non-empty `bin` string or a `command` array whose placeholders are known, throwing descriptive errors on any violation. Preset names may only override `bin`; it uses… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [resolveAgent](../../src/agent-cli.ts#L145) (configAgent: string | null, env: Env, home: string) → { agent: string | null; source: AgentSource | null }
      <a id="features.agent-cli.resolveAgent"></a><br>The agent in effect and where it came from: `KEYLANG_AGENT` (an empty variable is unset), else agents.json "use", else keylang.json `agent`. An invalid variable or agents.json throws, naming it.
      - calls [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings)
    - fn [selectedAgent](../../src/agent-cli.ts#L160) (configAgent: string | null, env: Env = process.env, home: string = homedir()) → string | null
      <a id="features.agent-cli.selectedAgent"></a><br>The effective agent for deciding whether to ask at all (ghost, forms): a broken setting counts as an agent, so the request that follows reports it.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent)
    - fn [parseCliAgent](../../src/agent-cli.ts#L169) (agent: string) → { name: string; model: string }
      <a id="features.agent-cli.parseCliAgent"></a><br>`cli:opencode:anthropic/claude-sonnet-5` → name and model (the model keeps its colons).
    - type [Runner](../../src/agent-cli.ts#L176) = { preset: Preset; bin: string } | { command: string[] } <!-- internal -->
      <a id="features.agent-cli.Runner"></a><br>What `cliClient` runs: a preset with its binary, or a user's command.
    - fn [cliClient](../../src/agent-cli.ts#L183) (agent: string, options: { root: string; env: Env; home: string }) → { client: CliClient } | { missing: string }
      <a id="features.agent-cli.cliClient"></a><br>A client for a `cli:` agent, or why there is none (a missing binary, a Grok `agent` where Cursor's was expected): only a PATH scan and, for an `agent` binary, one memoized `--version`. Invalid agents.json throws.
      - calls [features.agent-cli.parseCliAgent](features.md#features.agent-cli.parseCliAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.completeWith](features.md#features.agent-cli.completeWith)
    - fn [presetBinary](../../src/agent-cli.ts#L218) (preset: Preset, bin: string | null, env: Env, home: string) → { bin: string } | { missing: string } <!-- internal -->
      <a id="features.agent-cli.presetBinary"></a><br>The binary of a preset: `bin` from agents.json, else its name on PATH; Cursor's is `cursor-agent`, or `agent` when its version is Cursor's.
      - calls [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.binaryVersion](features.md#features.agent-cli.binaryVersion)
    - fn [binaryVersion](../../src/agent-cli.ts#L239) (bin: string, env: Env) → string | null <!-- internal -->
      <a id="features.agent-cli.binaryVersion"></a><br>The first line of `<bin> --version`, at most 5 s, memoized per process; null when it gives none.
    - fn [shortVersion](../../src/agent-cli.ts#L249) (line: string) → string
      <a id="features.agent-cli.shortVersion"></a><br>`2.1.289 (Claude Code)` → `2.1.289`; `codex-cli 0.155.1` → `0.155.1`; a Cursor build keeps its hash.
    - fn [cliVersion](../../src/agent-cli.ts#L254) (bin: string, env: Env = process.env) → Promise<string | null>
      <a id="features.agent-cli.cliVersion"></a><br>The version of a binary for doctor, asynchronously (5 s cap, never a login or status command).
      - calls [features.agent-cli.shortVersion](features.md#features.agent-cli.shortVersion)
    - type [AgentCliProbe](../../src/agent-cli.ts#L276)
      <a id="features.agent-cli.AgentCliProbe"></a><br>A preset as doctor sees it: its binary (null: none usable) and that binary's version (null: it gave none).
    - fn [probeAgentClis](../../src/agent-cli.ts#L283) (env: Env = process.env, home: string = homedir()) → Promise<AgentCliProbe[]>
      <a id="features.agent-cli.probeAgentClis"></a><br>Every preset, probed in parallel with `--version` only: offline, never a login or status command.
      - calls [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.cliVersion](features.md#features.agent-cli.cliVersion)
    - fn [findBinary](../../src/agent-cli.ts#L301) (name: string, env: Env) → string | null
      <a id="features.agent-cli.findBinary"></a><br>A name on PATH or a path, if it is an executable file.
      - calls [features.agent-cli.executable](features.md#features.agent-cli.executable)
    - fn [executable](../../src/agent-cli.ts#L311) (path: string) → boolean <!-- internal -->
      <a id="features.agent-cli.executable"></a><br>Checks whether a filesystem path points to a regular file that the current process may execute, returning false on any stat or access error. Used by [`features.agent-cli.findBinary`](features.md#features.agent-cli.findBinary) to validate candidate binaries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [AnswerKind](../../src/agent-cli.ts#L324) = "result-json" | "file" | "opencode-events" | "stdout"
      <a id="features.agent-cli.AnswerKind"></a><br>How the answer is read: a `type:"result"` JSON line, Codex's `-o` file, opencode's NDJSON events, or stdout.
    - type [Invocation](../../src/agent-cli.ts#L326)
      <a id="features.agent-cli.Invocation"></a><br>Describes a fully prepared external agent CLI run: the binary and arguments, optional stdin text, environment, how the answer is retrieved (`AnswerKind`), and any files to write (mode 0600) beforehand, including an answer file path when the answer is read from disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [invocation](../../src/agent-cli.ts#L341) (runner: Runner, model: string, request: CliRequest, root: string, env: Env, tmp: string) → Invocation
      <a id="features.agent-cli.invocation"></a><br>The process to run for one request; `tmp` is a private directory outside the repository.
      - calls [features.agent-cli.wellFormed](features.md#features.agent-cli.wellFormed), [features.agent-cli.opencodeConfig](features.md#features.agent-cli.opencodeConfig)
    - fn [opencodeConfig](../../src/agent-cli.ts#L422) (existing: string | undefined, system: string) → string <!-- internal -->
      <a id="features.agent-cli.opencodeConfig"></a><br>The user's `OPENCODE_CONFIG_CONTENT` with keylang's agent on top: every permission denied.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [wellFormed](../../src/agent-cli.ts#L436) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.wellFormed"></a><br>Replaces any lone UTF-16 surrogate halves in the string with the U+FFFD replacement character so the result is valid Unicode. Used by [`features.agent-cli.invocation`](features.md#features.agent-cli.invocation) to sanitize text before passing it on. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ResultLine](../../src/agent-cli.ts#L440) = { text: string; model: string | null } | { error: string } <!-- internal -->
      <a id="features.agent-cli.ResultLine"></a><br>Discriminated union for one line of CLI result output: either a successful response carrying `text` and the `model` that produced it (or null), or a failure carrying only an `error` message. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseResultLine](../../src/agent-cli.ts#L443) (line: string) → ResultLine | null
      <a id="features.agent-cli.parseResultLine"></a><br>A `{"type":"result"}` line of Claude Code or Cursor: the answer with the model that wrote it, an error, or null for any other line.
      - calls [features.agent-cli.parseJson](features.md#features.agent-cli.parseJson), [features.agent-cli.isObject](features.md#features.agent-cli.isObject), [features.agent-cli.answeringModel](features.md#features.agent-cli.answeringModel)
    - fn [answeringModel](../../src/agent-cli.ts#L456) (usage: unknown) → string | null <!-- internal -->
      <a id="features.agent-cli.answeringModel"></a><br>The model of Claude Code's `modelUsage` (`{"<model>": {"outputTokens": n, …}}`) that wrote the most output: the CLI may also use a small model on the side. Null when the line has none (Cursor) or its shape is not that.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [parseOpencodeEvents](../../src/agent-cli.ts#L470) (output: string) → { text: string } | { error: string }
      <a id="features.agent-cli.parseOpencodeEvents"></a><br>opencode's NDJSON: the text parts after the last step start, or the first error.
      - calls [features.agent-cli.parseJson](features.md#features.agent-cli.parseJson), [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [completeWith](../../src/agent-cli.ts#L489) (agent: string, runner: Runner, model: string, request: CliRequest, options: { root: string; env: Env }, call: CliCallOptions) → Promise<string> <!-- internal -->
      <a id="features.agent-cli.completeWith"></a><br>Runs one agent-CLI call in a throwaway temp dir: builds the command via [`features.agent-cli.invocation`](features.md#features.agent-cli.invocation), writes its files, executes with [`features.agent-cli.runInvocation`](features.md#features.agent-cli.runInvocation), and parses output through [`features.agent-cli.readAnswer`](features.md#features.agent-cli.readAnswer). Throws [`features.agent-cli.CliCancelled`](features.md#features.agent-cli.CliCancelled) if… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.invocation](features.md#features.agent-cli.invocation), [features.agent-cli.runInvocation](features.md#features.agent-cli.runInvocation), [features.agent-cli.readAnswer](features.md#features.agent-cli.readAnswer)
    - type [RunResult](../../src/agent-cli.ts#L509) <!-- internal -->
      <a id="features.agent-cli.RunResult"></a><br>Bundles what a CLI subprocess run produced: the full captured stdout text plus an optional already-parsed `ResultLine` taken from an early `type:"result"` line, or null when none was found. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readAnswer](../../src/agent-cli.ts#L516) (agent: string, inv: Invocation, run: RunResult) → { text: string; model: string | null } <!-- internal -->
      <a id="features.agent-cli.readAnswer"></a><br>The answer, with the model that wrote it when the CLI's output names it.
      - calls [features.agent-cli.lastResult](features.md#features.agent-cli.lastResult), [features.agent-cli.parseOpencodeEvents](features.md#features.agent-cli.parseOpencodeEvents)
    - fn [lastResult](../../src/agent-cli.ts#L536) (stdout: string) → ResultLine | null <!-- internal -->
      <a id="features.agent-cli.lastResult"></a><br>Scans every line of captured stdout through [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) and keeps the last one that parses, returning null if none did. Used by [`features.agent-cli.readAnswer`](features.md#features.agent-cli.readAnswer) to pick the final result record from an agent's streamed output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine)
    - fn [killGroup](../../src/agent-cli.ts#L546) (pid: number, signal: NodeJS.Signals) → void <!-- internal -->
      <a id="features.agent-cli.killGroup"></a><br>Sends a signal to a spawned child's whole process group (negating the pid on POSIX, using it directly on Windows) and silently swallows errors when the group has already exited; used by [`features.agent-cli.hookExit`](features.md#features.agent-cli.hookExit) and [`features.agent-cli.runInvocation`](features.md#features.agent-cli.runInvocation) to tear down… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [hookExit](../../src/agent-cli.ts#L555) () → void <!-- internal -->
      <a id="features.agent-cli.hookExit"></a><br>Once: keylang's exit kills every live group; a fatal signal with no handler of its own kills them first and is raised again.
      - calls [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup)
    - fn [runInvocation](../../src/agent-cli.ts#L574) (agent: string, inv: Invocation, root: string, call: CliCallOptions) → Promise<RunResult> <!-- internal -->
      <a id="features.agent-cli.runInvocation"></a><br>Spawns the CLI in its own process group, feeds it stdin, and resolves with the collected output or the first [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) hit, killing the group via [`features.agent-cli.killGroup`](features.md#features.agent-cli.killGroup). Rejects on timeout, abort ([`features.agent-cli.CliCancelled`](features.md#features.agent-cli.CliCancelled)), oversized… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.agent-cli.hookExit](features.md#features.agent-cli.hookExit), [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine), [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup), [features.agent-cli.stripAnsi](features.md#features.agent-cli.stripAnsi)
    - fn [stripAnsi](../../src/agent-cli.ts#L677) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.stripAnsi"></a><br>Removes ANSI escape sequences (ESC-bracket codes ending in a letter) from a string via a global regex replace, returning plain text. [`features.agent-cli.runInvocation`](features.md#features.agent-cli.runInvocation) uses it to clean captured CLI output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseJson](../../src/agent-cli.ts#L682) (text: string) → unknown <!-- internal -->
      <a id="features.agent-cli.parseJson"></a><br>Lenient JSON parser that returns `undefined` for empty input or invalid JSON instead of throwing, so callers can skip bad lines. Used by [`features.agent-cli.parseOpencodeEvents`](features.md#features.agent-cli.parseOpencodeEvents) and [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) to decode CLI output lines. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isObject](../../src/agent-cli.ts#L691) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.agent-cli.isObject"></a><br>Type guard that narrows an unknown value to a plain string-keyed record, rejecting null and arrays. Used by parsers such as [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) and [`features.agent-cli.parseAgentSettings`](features.md#features.agent-cli.parseAgentSettings) to validate decoded JSON before reading fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [agent-context](../../src/agent-context.ts#L1)
    <a id="features.agent-context"></a><br>What goes to the model (design §7.3 «Контекст»): the buffer, the nodes on the cursor line and their neighbours, the flows and rules naming them, their code and the tests of those flows — each item with a token estimate, so the person sees and trims what the agent reads. `@id`…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - type [ContextKind](../../src/agent-context.ts#L19)
      <a id="features.agent-context.ContextKind"></a><br>A string union naming the seven categories of material that can be assembled into an agent's context: buffer, node, neighbor, flow, rule, code, and test. Used to tag and filter the pieces that [`features.agent-context`](features.md#features.agent-context) gathers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ContextItem](../../src/agent-context.ts#L21)
      <a id="features.agent-context.ContextItem"></a><br>Shape of one entry in an agent context pack: a `key` used for removal, a `ContextKind`, display label, the text itself and its token count. Optional flags mark it as a plan rather than code, or as covering less than what actually runs. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ContextPack](../../src/agent-context.ts#L34)
      <a id="features.agent-context.ContextPack"></a><br>Bundles a list of context items with their total token count and a string cache key derived from snapshot, specs, buffer, cursor ids, additions and removals. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ContextInput](../../src/agent-context.ts#L41)
      <a id="features.agent-context.ContextInput"></a><br>Bundles what the context builder needs about one file: its path, full text, a 0-based cursor line, plus the list of newly added lines and a set of removed ones. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [estimateTokens](../../src/agent-context.ts#L51) (text: string) → number
      <a id="features.agent-context.estimateTokens"></a><br>Roughly four characters a token: an estimate for the person, not a bill.
    - fn [contextForIds](../../src/agent-context.ts#L61) (analysis: Analysis, ids: readonly string[]) → ContextPack
      <a id="features.agent-context.contextForIds"></a><br>The bundle for a list of ids: each node and its neighbors, the flows and rules that name it, its code, and the e2e tests of those flows. A planned id that is not implemented is marked planned and incomplete.
      - calls [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems), [features.agent-context.packOf](features.md#features.agent-context.packOf)
    - fn [contextPack](../../src/agent-context.ts#L73) (analysis: Analysis, input: ContextInput) → ContextPack
      <a id="features.agent-context.contextPack"></a><br>Builds an agent context pack from the buffer plus IDs referenced on the cursor line (via [`lang.parser.parse`](lang.md#lang.parser.parse), `addIdItems`), with token estimates, cached per analysis in a bounded LRU keyed by a content hash. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.specDigest](features.md#features.agent-context.specDigest), [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems)
    - fn [packOf](../../src/agent-context.ts#L112) (items: ContextItem[], keySource: string) → ContextPack <!-- internal -->
      <a id="features.agent-context.packOf"></a><br>Bundles a list of context items into a pack, summing their token counts and tagging it with a SHA-256 hex digest of the given key source. Used by [`features.agent-context.contextForIds`](features.md#features.agent-context.contextForIds) to assemble its result. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
    - files [lang.files](lang.md#lang.files)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - fn [baselineText](../../src/baseline.ts#L27) (snapshot: AnalysisSnapshot) → string
      <a id="features.baseline.baselineText"></a><br>Baseline rules for one snapshot. Layers come from `keylang.json`, in code-unit order; `unassigned` is a source only when a module is in it.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.baseline.externalModule](features.md#features.baseline.externalModule)
    - fn [externalModule](../../src/baseline.ts#L74) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="features.baseline.externalModule"></a><br>The external module an id belongs to (`external.stripe` for a symbol under it).
    - fn [baselinePath](../../src/baseline.ts#L86) (config: Pick<Config, "dir">) → string
      <a id="features.baseline.baselinePath"></a><br>Where the baseline lives: `<dir>/rules.baseline.md`, relative to the root, POSIX.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - type [BaselinePlan](../../src/baseline.ts#L94)
      <a id="features.baseline.BaselinePlan"></a><br>What `keylang baseline` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planBaseline](../../src/baseline.ts#L115) (config: Config, snapshot: AnalysisSnapshot) → BaselinePlan
      <a id="features.baseline.planBaseline"></a><br>Plans the baseline of `snapshot` against the file on disk. Reads, writes nothing.
      - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [features.baseline.baselineText](features.md#features.baseline.baselineText), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.baseline.ruleLines](features.md#features.baseline.ruleLines), [map.map.sourceInputs](map.md#map.map.sourceInputs)
    - fn [baselinePlanProblems](../../src/baseline.ts#L140) (plan: BaselinePlan) → string[]
      <a id="features.baseline.baselinePlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): the target must pass the repository's write rules and still hold the bytes the plan saw, and `keylang.json` and the sources must be the ones the baseline was computed from.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems)
    - fn [commitBaseline](../../src/baseline.ts#L149) (plan: BaselinePlan) → void
      <a id="features.baseline.commitBaseline"></a><br>Writes the planned text atomically at the target (a link inside the repository is followed; CRLF of the old file kept). Throws on an I/O error.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [ruleLines](../../src/baseline.ts#L156) (text: string) → string[] <!-- internal -->
      <a id="features.baseline.ruleLines"></a><br>The `- deny` / `- allow` lines of a rules text, in order.
  - module [call-sites](../../src/call-sites.ts#L1)
    <a id="features.call-sites"></a><br>What the coverage report and the integrations inventory read beside the snapshot (business-flows/13, 14): every call written in the analysed files with the node that encloses it, matched against lists kept as data (`resources/*.json`), and reachability from entry points over…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - facts [extract.facts](extract.md#extract.facts)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - frontends [map.frontends](map.md#map.frontends)
    - languages [base.languages](base.md#base.languages)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - fn [resourcePath](../../src/call-sites.ts#L24) (name: string) → string
      <a id="features.call-sites.resourcePath"></a><br>A data file of `resources/`, beside `src/` and `dist/` alike.
    - type [Matcher](../../src/call-sites.ts#L35)
      <a id="features.call-sites.Matcher"></a><br>How a data list names what it looks for. A call matches when any of `callees`, `imports` or `receivers` matches; `methods` narrows `imports` and `receivers` to calls whose last name is listed. `text` matches source lines (a read such as `process.env.X`, which is no call)…
    - type [CallSite](../../src/call-sites.ts#L55)
      <a id="features.call-sites.CallSite"></a><br>A call written in an analysed file.
    - type [ReadSite](../../src/call-sites.ts#L69)
      <a id="features.call-sites.ReadSite"></a><br>A read of a name keylang has no call for (`settings.X`), or a source line a `text` pattern matched.
    - type [FileCalls](../../src/call-sites.ts#L78)
      <a id="features.call-sites.FileCalls"></a><br>The facts of one analysed file with what a matcher needs: the imports by the local name they bind.
    - type [Stored](../../src/call-sites.ts#L89) <!-- internal -->
      <a id="features.call-sites.Stored"></a>
    - fn [snapshotFacts](../../src/call-sites.ts#L97) (config: Config, snapshot: AnalysisSnapshot) → Promise<FileFacts[]>
      <a id="features.call-sites.snapshotFacts"></a><br>The facts of every analysed file of the snapshot, in path order: the fact cache's entry when its hash is the manifest's (an analysis that saves the cache has just written it), else the file extracted again. A file that cannot be read or parsed gives none.
      - calls [base.config.isAnalysed](base.md#base.config.isAnalysed), [features.call-sites.isFacts](features.md#features.call-sites.isFacts), [map.frontends.frontendFor](map.md#map.frontends.frontendFor)
    - fn [isFacts](../../src/call-sites.ts#L124) (value: unknown) → value is FileFacts <!-- internal -->
      <a id="features.call-sites.isFacts"></a>
    - type [Span](../../src/call-sites.ts#L131) <!-- internal -->
      <a id="features.call-sites.Span"></a><br>Spans of the nodes declared in each file: what places a call in a fn.
    - fn [spansByFile](../../src/call-sites.ts#L133) (snapshot: AnalysisSnapshot) → { spans: Map<string, Span[]>; modules: Map<string, string> } <!-- internal -->
      <a id="features.call-sites.spansByFile"></a>
      - calls [features.call-sites.hasSpan](features.md#features.call-sites.hasSpan)
    - fn [hasSpan](../../src/call-sites.ts#L150) (node: SnapshotNode) → boolean <!-- internal -->
      <a id="features.call-sites.hasSpan"></a>
    - fn [before](../../src/call-sites.ts#L154) (aLine: number, aCol: number, bLine: number, bCol: number) → boolean <!-- internal -->
      <a id="features.call-sites.before"></a>
    - fn [enclosing](../../src/call-sites.ts#L157) (spans: readonly Span[] | undefined, module: string | undefined, line: number, col: number) → string | null <!-- internal -->
      <a id="features.call-sites.enclosing"></a><br>The innermost fn holding the position, else the innermost class, else the file's module.
      - calls [features.call-sites.before](features.md#features.call-sites.before)
    - fn [callsOf](../../src/call-sites.ts#L167) (snapshot: AnalysisSnapshot, facts: readonly FileFacts[]) → FileCalls[]
      <a id="features.call-sites.callsOf"></a><br>Calls, reads and imports of each file, each placed in the node that holds it. Sorted by file, then position.
      - calls [features.call-sites.spansByFile](features.md#features.call-sites.spansByFile), [base.span.compareText](base.md#base.span.compareText), [features.call-sites.enclosing](features.md#features.call-sites.enclosing), [base.languages.languageOf](base.md#base.languages.languageOf)
    - type [CompiledMatcher](../../src/call-sites.ts#L200)
      <a id="features.call-sites.CompiledMatcher"></a><br>A matcher with its regular expressions compiled once.
    - fn [compileMatcher](../../src/call-sites.ts#L209) (matcher: Matcher) → CompiledMatcher
      <a id="features.call-sites.compileMatcher"></a>
      - calls [features.call-sites.withoutRoot](features.md#features.call-sites.withoutRoot)
    - fn [withoutRoot](../../src/call-sites.ts#L221) (name: string) → string <!-- internal -->
      <a id="features.call-sites.withoutRoot"></a><br>A PHP name written fully qualified (`\Foo\Bar`) is the name without the leading `\`.
    - fn [importMatches](../../src/call-sites.ts#L226) (source: string, pattern: string) → boolean
      <a id="features.call-sites.importMatches"></a><br>Whether an import's source is one the pattern names: exact, under a separator-ended prefix, or under a `*` prefix.
      - calls [features.call-sites.withoutRoot](features.md#features.call-sites.withoutRoot)
    - fn [segmentsOf](../../src/call-sites.ts#L237) (site: CallSite) → string[] <!-- internal -->
      <a id="features.call-sites.segmentsOf"></a><br>The segments of a call's callee, split once.
      - calls [features.call-sites.segments](features.md#features.call-sites.segments)
    - fn [segments](../../src/call-sites.ts#L247) (callee: string) → string[] <!-- internal -->
      <a id="features.call-sites.segments"></a><br>Segments of a callee: `this.config.getValue` → this, config, getValue; `reqwest::get` → reqwest, get.
    - fn [lastName](../../src/call-sites.ts#L252) (name: string) → string <!-- internal -->
      <a id="features.call-sites.lastName"></a><br>The last segment of a class name: `Magento\Framework\HTTP\Client\Curl` → `Curl`.
    - fn [appliesTo](../../src/call-sites.ts#L257) (matcher: CompiledMatcher, language: Language | undefined) → boolean
      <a id="features.call-sites.appliesTo"></a><br>Whether the matcher applies to files of this language.
    - fn [callMatches](../../src/call-sites.ts#L265) (matcher: CompiledMatcher, site: CallSite, file: FileCalls, internal: boolean) → boolean
      <a id="features.call-sites.callMatches"></a><br>Whether the call matches. `internal`: the call resolved to the repository's own code (a local `fetch`), which no `callees` pattern may claim.
      - calls [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo), [features.call-sites.segmentsOf](features.md#features.call-sites.segmentsOf), [features.call-sites.importMatches](features.md#features.call-sites.importMatches), [features.call-sites.withoutRoot](features.md#features.call-sites.withoutRoot), [features.call-sites.lastName](features.md#features.call-sites.lastName)
    - fn [readMatches](../../src/call-sites.ts#L295) (matcher: CompiledMatcher, read: ReadSite, file: FileCalls) → boolean
      <a id="features.call-sites.readMatches"></a><br>Whether a read (`settings.PAYMENT_URL`) goes through a name an import the matcher lists binds.
      - calls [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo), [features.call-sites.segments](features.md#features.call-sites.segments), [features.call-sites.importMatches](features.md#features.call-sites.importMatches)
    - fn [textMatches](../../src/call-sites.ts#L308) (matcher: CompiledMatcher, file: FileCalls, source: string, place: (line: number, col: number) => string | null) → ReadSite[]
      <a id="features.call-sites.textMatches"></a><br>Source lines the matcher's `text` patterns match, each placed in its node: 1-based line, column of the match.
      - calls [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo)
    - fn [placer](../../src/call-sites.ts#L324) (snapshot: AnalysisSnapshot) → (file: string, line: number, col: number) => string | null
      <a id="features.call-sites.placer"></a><br>A placer of positions of one file in its nodes, for matches the facts do not place.
      - calls [features.call-sites.spansByFile](features.md#features.call-sites.spansByFile), [features.call-sites.enclosing](features.md#features.call-sites.enclosing)
    - fn [internalCallPositions](../../src/call-sites.ts#L330) (snapshot: AnalysisSnapshot) → Set<string>
      <a id="features.call-sites.internalCallPositions"></a><br>`file:line:col` of every call edge that resolved into the repository: no built-in or package is called there.
    - fn [callGraph](../../src/call-sites.ts#L337) (snapshot: AnalysisSnapshot) → { out: Map<string, Set<string>>; in: Map<string, Set<string>> }
      <a id="features.call-sites.callGraph"></a><br>The resolved call edges as adjacency: source → targets, and target → sources. Hook (`via`) edges included.
    - fn [reachable](../../src/call-sites.ts#L351) (adjacency: ReadonlyMap<string, ReadonlySet<string>>, starts: Iterable<string>) → Set<string>
      <a id="features.call-sites.reachable"></a><br>Every node reachable from the starts over the adjacency, the starts included.
    - fn [isTestFile](../../src/call-sites.ts#L364) (path: string) → boolean
      <a id="features.call-sites.isTestFile"></a><br>A file of tests: its fns are not expected to be reached from an entry point.
    - fn [lineStarts](../../src/call-sites.ts#L369) (text: string) → number[]
      <a id="features.call-sites.lineStarts"></a><br>Lines of a source text, for reading a call's arguments.
    - fn [urlOf](../../src/call-sites.ts#L382) (text: string, starts: readonly number[], line: number, col: number, callee: string) → { url: "literal" | "dynamic" | "n/a"; host: string | null }
      <a id="features.call-sites.urlOf"></a><br>The URL a call names: the host of a literal absolute URL among its first two arguments (a literal prefix counts: `"https://api.x.com/" + id`), `dynamic` when an argument there is an expression, `n/a` when the call has no arguments, only literals that are no URL, or no argument…
      - calls [features.call-sites.firstArguments](features.md#features.call-sites.firstArguments)
    - fn [literalArgument](../../src/call-sites.ts#L404) (text: string, starts: readonly number[], line: number, col: number, callee: string) → string | null
      <a id="features.call-sites.literalArgument"></a><br>The first argument of the call when it is a plain string literal (a queue's topic), else null.
      - calls [features.call-sites.firstArguments](features.md#features.call-sites.firstArguments)
    - fn [firstArguments](../../src/call-sites.ts#L412) (text: string, starts: readonly number[], line: number, col: number, callee: string, max: number) → string[] | null <!-- internal -->
      <a id="features.call-sites.firstArguments"></a><br>The first `max` arguments of the call at the position, as written: after the callee's last name; null when no argument list follows it.
      - calls [features.call-sites.segments](features.md#features.call-sites.segments)
    - fn [sourceReader](../../src/call-sites.ts#L459) (root: string) → (file: string) => { text: string; starts: number[] } | null
      <a id="features.call-sites.sourceReader"></a><br>A text read once per file.
      - calls [features.call-sites.lineStarts](features.md#features.call-sites.lineStarts)
  - module [changed](../../src/changed.ts#L1)
    <a id="features.changed"></a><br>`check --changed` keeps the full analysis and drops findings that do not touch the changed files: a changed spec (every finding in that file), a rule whose scope contains a changed module, and a flow with a step whose code is in a changed file. `hook stop` maps the fails that…
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - type [ChangedInput](../../src/changed.ts#L13)
      <a id="features.changed.ChangedInput"></a><br>Bundles everything the change-detection step needs: the parsed documents, the spec IR, prior diagnostics and verdicts, plus a map of graph nodes to their kind, source file, and optional layer. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [ChangedEdge](../../src/changed.ts#L24)
      <a id="features.changed.ChangedEdge"></a><br>The part of a snapshot edge the `--changed` slice reads; a `call` or `type` edge, an unresolved or a types-only import is not a dependency a cycle runs through.
    - type [HookFail](../../src/changed.ts#L32)
      <a id="features.changed.HookFail"></a><br>Describes a single failure reported by a hook: the file path, the line number, and the message text associated with that failure. It is a plain data shape with no behavior, used to carry per-location hook results. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [RuleHit](../../src/changed.ts#L38) <!-- internal -->
      <a id="features.changed.RuleHit"></a><br>Record of one dependency rule that fired on a changed file: the file path and line it hit, the verdict criterion to report when that line fails, and the module scope the rule applies to (empty when it covers all modules). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [filterChanged](../../src/changed.ts#L52) (input: ChangedInput, changed: ReadonlySet<string>, deleted: readonly string[] = []) → { diagnostics: Diagnostic[]; verdicts: Verdict[] }
      <a id="features.changed.filterChanged"></a><br>Diagnostics and verdicts that touch `changed` (paths as check prints them). `deleted` are module ids whose file git removed: the node is gone, so a flow step that named it is still in the report. Order is preserved.
      - calls [features.changed.ruleHits](features.md#features.changed.ruleHits), [features.changed.covers](features.md#features.changed.covers), [features.changed.flowLinesTouching](features.md#features.changed.flowLinesTouching), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookFails](../../src/changed.ts#L71) (report: { diagnostics: readonly Diagnostic[]; verdicts: readonly Verdict[] }) → HookFail[]
      <a id="features.changed.hookFails"></a><br>Error diagnostics, then fail verdicts that are not the same finding.
      - calls [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookDecision](../../src/changed.ts#L82) (event: { stop_hook_active?: boolean }, fails: readonly HookFail[]) → string
      <a id="features.changed.hookDecision"></a><br>Stdin event plus the fails of one changed check. `stop_hook_active` never blocks. The same inputs return the same JSON.
    - fn [uncheckedTurn](../../src/changed.ts#L96) (error: string) → { line: string; decision: string }
      <a id="features.changed.uncheckedTurn"></a><br>A turn the hook could not check — stdin that is no event, no git, a broken keylang.json, a failed analysis — as the line a person reads and the JSON that carries it: a `systemMessage`, which Claude Code and Codex show the person as a warning without blocking the agent (stderr…
    - fn [parseHookEvent](../../src/changed.ts#L103) (text: string) → { stop_hook_active?: boolean }
      <a id="features.changed.parseHookEvent"></a><br>The object on stdin. Empty stdin is an event with no `stop_hook_active`.
    - fn [covers](../../src/changed.ts#L118) (scope: readonly string[], moduleId: string, layer: string) → boolean <!-- internal -->
      <a id="features.changed.covers"></a><br>Decides whether a module falls inside a scope: an empty scope matches everything, otherwise any scope entry must equal the layer name, equal the module ID, or be a dotted prefix of it. Used by [`features.changed.filterChanged`](features.md#features.changed.filterChanged) to limit which modules are considered. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [ruleHits](../../src/changed.ts#L124) (input: ChangedInput) → RuleHit[] <!-- internal -->
      <a id="features.changed.ruleHits"></a><br>Scope and the verdict criterion `--changed` already matches. `no-cycles` stays the literal criterion, not the hashed `no-cycles <module|*>`.
      - calls [features.changed.noCyclesArea](features.md#features.changed.noCyclesArea)
    - fn [noCyclesArea](../../src/changed.ts#L151) (input: ChangedInput, under: string) → string[] <!-- internal -->
      <a id="features.changed.noCyclesArea"></a><br>`under`, its submodules, and every module they reach by a resolved `import` or `reexport` that is not types-only: the area `rules.ts` judges the rule over. Edges are between symbols; their module is the nearest `module` node up the id (a class is one too, and lies under its…
    - fn [flowLinesTouching](../../src/changed.ts#L184) (input: ChangedInput, changed: ReadonlySet<string>, gone: (id: string) => boolean) → Set<string> <!-- internal -->
      <a id="features.changed.flowLinesTouching"></a><br>`file:line` of every verdict in a flow that names a symbol whose file changed or was deleted.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
  - module [check-format](../../src/check-format.ts#L1)
    <a id="features.check-format"></a><br>The text of one check report in each `--format`: exactly what `keylang check` prints on stdout. The CLI writes it; the TUI exports the same bytes to a file.
    - check-results [features.check-results](features.md#features.check-results)
    - explain [features.explain](features.md#features.explain)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [CheckFormat](../../src/check-format.ts#L11) = (typeof CHECK_FORMATS)[number]
      <a id="features.check-format.CheckFormat"></a><br>A string literal union derived from the entries of `CHECK_FORMATS`, so the set of accepted output formats is defined once in the runtime array and the type follows it automatically. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [CheckReportData](../../src/check-format.ts#L14)
      <a id="features.check-format.CheckReportData"></a><br>What a format shows: the `--format json` data and the human lines of the same report.
    - fn [isCheckFormat](../../src/check-format.ts#L21) (name: string) → name is CheckFormat
      <a id="features.check-format.isCheckFormat"></a><br>Type guard that returns true when the given string is one of the names listed in the `CHECK_FORMATS` constant. Used by [`cli.cli.cmdCheck`](cli.md#cli.cli.cmdCheck) and `tui.app.exportSourceOf` to validate user-supplied format options before narrowing them. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [checkReportText](../../src/check-format.ts#L26) (format: CheckFormat, report: CheckReportData) → string
      <a id="features.check-format.checkReportText"></a><br>The stdout of `keylang check --format <format>` for `report`, every line ending with `\n`.
      - calls [features.check-format.githubText](features.md#features.check-format.githubText), [features.check-format.sarifLog](features.md#features.check-format.sarifLog)
    - fn [githubText](../../src/check-format.ts#L33) (results: readonly CheckResult[]) → string <!-- internal -->
      <a id="features.check-format.githubText"></a><br>Renders non-ok check results as GitHub Actions workflow commands, mapping fail/warning/other verdicts to error/warning/notice lines with file, line, col and title properties. Property values and message data are escaped via [`features.check-format.githubProperty`](features.md#features.check-format.githubProperty) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.check-format.githubProperty](features.md#features.check-format.githubProperty), [features.check-format.ruleOf](features.md#features.check-format.ruleOf), [features.check-format.githubData](features.md#features.check-format.githubData)
    - fn [sarifLog](../../src/check-format.ts#L43) (report: CheckReportData) → unknown <!-- internal -->
      <a id="features.check-format.sarifLog"></a><br>Builds a SARIF 2.1 log object from a check report, keeping only non-"ok" results and mapping each to a result with rule id, level, message, file/line/column location and verdict metadata. Rule ids come from [`features.check-format.ruleOf`](features.md#features.check-format.ruleOf), their descriptions from… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.check-format.ruleOf](features.md#features.check-format.ruleOf), [features.check-format.ruleText](features.md#features.check-format.ruleText)
    - fn [ruleOf](../../src/check-format.ts#L78) (result: CheckResult) → string <!-- internal -->
      <a id="features.check-format.ruleOf"></a><br>The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind.
    - fn [ruleText](../../src/check-format.ts#L90) (id: string) → string <!-- internal -->
      <a id="features.check-format.ruleText"></a><br>Maps a diagnostic rule ID to a one-line human-readable description for the SARIF output built by [`features.check-format.sarifLog`](features.md#features.check-format.sarifLog). It special-cases "unverified", then looks up the evidence-rule table, falls back to the first line of [`features.explain.explainCode`](features.md#features.explain.explainCode), and finally… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [githubData](../../src/check-format.ts#L96) (text: string) → string <!-- internal -->
      <a id="features.check-format.githubData"></a><br>Percent-encodes `%`, carriage returns, and newlines in a string so it is safe as a GitHub Actions workflow command payload. Used by [`features.check-format.githubProperty`](features.md#features.check-format.githubProperty) and [`features.check-format.githubText`](features.md#features.check-format.githubText) to escape annotation messages. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [githubProperty](../../src/check-format.ts#L100) (text: string) → string <!-- internal -->
      <a id="features.check-format.githubProperty"></a><br>Escapes a string for use as a property value in a GitHub Actions workflow command: runs it through [`features.check-format.githubData`](features.md#features.check-format.githubData), then percent-encodes colons and commas. Used by [`features.check-format.githubText`](features.md#features.check-format.githubText) when emitting annotations. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.check-format.githubData](features.md#features.check-format.githubData)
  - module [check-results](../../src/check-results.ts#L1)
    <a id="features.check-results"></a><br>The results of `keylang check --format json`: diagnostics and verdicts in one list, a diagnostic joined with the verdict it explains. Shared by the CLI, the MCP server and the TUI (the check operation and the findings panel), so an agent sees exactly what CI sees.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Provenance](../../src/check-results.ts#L11) = NonNullable<Verdict["evidence"]>["provenance"] <!-- internal -->
      <a id="features.check-results.Provenance"></a><br>Extracts the type of the `provenance` field from a verdict's evidence object, after stripping null and undefined from the evidence type. It lets check-result code reference that nested shape without redeclaring it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CheckResult](../../src/check-results.ts#L13)
      <a id="features.check-results.CheckResult"></a><br>Shape of one check outcome: a criterion's verdict (ok, fail, unverified, or non-failing warning) with evidence, source location, spec hash and provenance. Optional fields carry test/run IDs, a K005 reason, or the coverage hole. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [checkResults](../../src/check-results.ts#L37) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckResult[]
      <a id="features.check-results.checkResults"></a><br>Diagnostics and verdicts as one list; a verdict that repeats a diagnostic lends it its criterion, hash, and provenance.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [base.diag.isError](base.md#base.diag.isError)
    - type [CheckReport](../../src/check-results.ts#L75)
      <a id="features.check-results.CheckReport"></a><br>What `keylang check` reports, whatever the format: the verdicts decide it, the format only shows it.
    - type [CheckCounts](../../src/check-results.ts#L84)
      <a id="features.check-results.CheckCounts"></a><br>The summary on stderr: errors and failed verdicts, unverified and ok verdicts.
    - fn [checkReport](../../src/check-results.ts#L98) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckReport
      <a id="features.check-results.checkReport"></a><br>Builds the check report: structured results via [`features.check-results.checkResults`](features.md#features.check-results.checkResults), printable lines for diagnostics and non-duplicate verdicts (deduped with [`check.assess.sameFinding`](check.md#check.assess.sameFinding)), plus fail/unverified/ok counts and distinct holes. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.check-results.checkResults](features.md#features.check-results.checkResults), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [check.verdict.formatVerdict](check.md#check.verdict.formatVerdict), [base.diag.isError](base.md#base.diag.isError)
    - fn [checkExitCode](../../src/check-results.ts#L116) (counts: CheckCounts, strict: boolean) → 0 | 1
      <a id="features.check-results.checkExitCode"></a><br>The exit code of `keylang check`: 1 for a failure, or with `strict` for an unverified verdict; else 0 — an unverified one stays visible.
  - module [clone](../../src/clone.ts#L1)
    <a id="features.clone"></a><br>`keylang clone <source>`: a repository someone names by URL (or a local path) becomes a shallow clone in keylang's cache, which `init`, `map` and `explain` then work on like any checkout. Git runs as an argument array, never through a shell, with its credential prompt off so a…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [RepoSource](../../src/clone.ts#L16)
      <a id="features.clone.RepoSource"></a><br>What to clone and where it sits under the cache root.
    - type [CloneExplain](../../src/clone.ts#L26) = "map-only" | "map-and-ai" | "all"
      <a id="features.clone.CloneExplain"></a><br>How far `clone --explain` goes past the map.
    - fn [isCloneExplain](../../src/clone.ts#L30) (text: string) → text is CloneExplain
      <a id="features.clone.isCloneExplain"></a>
    - fn [redactUrl](../../src/clone.ts#L42) (text: string) → string
      <a id="features.clone.redactUrl"></a><br>A URL with its userinfo (`user:token@`) cut, as git does in its own messages; anything else is returned as is. A token passed in the URL goes to git and nowhere else: not to stdout (a CI log), stderr or the marker.
    - fn [parseRepoSource](../../src/clone.ts#L54) (text: string, cwd: string) → RepoSource | { error: string }
      <a id="features.clone.parseRepoSource"></a><br>Reads a clone source: an `http(s)://`, `ssh://`, `git://` or `file://` URL, the scp form `git@host:owner/repo.git`, or a path to a local repository. The key never holds credentials, `..` or characters a file name cannot carry.
      - calls [features.clone.redactUrl](features.md#features.clone.redactUrl), [features.clone.fromUrl](features.md#features.clone.fromUrl), [features.clone.placeable](features.md#features.clone.placeable), [features.clone.keyed](features.md#features.clone.keyed)
    - fn [fromUrl](../../src/clone.ts#L70) (source: string) → RepoSource | { error: string } <!-- internal -->
      <a id="features.clone.fromUrl"></a>
      - calls [features.clone.redactUrl](features.md#features.clone.redactUrl), [features.clone.parseRepoSource](features.md#features.clone.parseRepoSource), [features.clone.keyed](features.md#features.clone.keyed)
    - fn [keyed](../../src/clone.ts#L84) (url: string, host: string, path: string) → RepoSource | { error: string } <!-- internal -->
      <a id="features.clone.keyed"></a>
      - calls [features.clone.redactUrl](features.md#features.clone.redactUrl), [features.clone.placeable](features.md#features.clone.placeable)
    - fn [placeable](../../src/clone.ts#L95) (segment: string) → string | undefined <!-- internal -->
      <a id="features.clone.placeable"></a>
    - fn [cloneCacheRoot](../../src/clone.ts#L100) (env: Readonly<Record<string, string | undefined>>, home: string) → string
      <a id="features.clone.cloneCacheRoot"></a><br>`$XDG_CACHE_HOME/keylang/repos`, else `~/.cache/keylang/repos`.
    - type [CloneSync](../../src/clone.ts#L105)
      <a id="features.clone.CloneSync"></a>
    - fn [syncClone](../../src/clone.ts#L118) (source: RepoSource, dir: string) → CloneSync
      <a id="features.clone.syncClone"></a><br>Clones `source` into `dir`, or brings a clone keylang made there up to the remote's default branch. A directory keylang did not clone is never touched: the reset would drop its work.
      - calls [features.clone.git](features.md#features.clone.git), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [features.clone.readMarker](features.md#features.clone.readMarker), [features.clone.redactUrl](features.md#features.clone.redactUrl)
    - fn [readMarker](../../src/clone.ts#L143) (dir: string) → { url: string; key: string[] } | undefined <!-- internal -->
      <a id="features.clone.readMarker"></a><br>The marker of `dir`, or undefined: absent, unreadable, or behind a link out of the directory — a file elsewhere is no proof keylang cloned `dir`.
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.config.withoutBom](base.md#base.config.withoutBom)
    - fn [git](../../src/clone.ts#L158) (cwd: string, args: string[]) → void <!-- internal -->
      <a id="features.clone.git"></a>
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [enableExplainedMap](../../src/clone.ts#L177) (root: string) → string | null
      <a id="features.clone.enableExplainedMap"></a><br>Turns on the explained map (`"explain": {"map": true}`) in the clone's keylang.json; the rest of the file stays. Returns an error to name, or null.
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.config.withoutBom](base.md#base.config.withoutBom), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
  - module [coverage-report](../../src/coverage-report.ts#L1)
    <a id="features.coverage-report"></a><br>`keylang coverage` (business-flows/13): where keylang does not see, so a person does not take the map for the whole program. A view over the snapshot (ADR 0014), never a verdict: (1) the share of fns reachable from at least one entry point over resolved call edges, (2) fns no…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - call-sites [features.call-sites](features.md#features.call-sites)
    - discover [features.discover](features.md#features.discover)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [DataLogicSignal](../../src/coverage-report.ts#L20) extends Matcher
      <a id="features.coverage-report.DataLogicSignal"></a><br>One kind of «logic in data» the data file names.
    - type [DataLogicSite](../../src/coverage-report.ts#L26)
      <a id="features.coverage-report.DataLogicSite"></a><br>A call or read of a configuration reader: the program's behaviour is decided by data keylang does not read.
    - type [HoleReason](../../src/coverage-report.ts#L38)
      <a id="features.coverage-report.HoleReason"></a><br>A hole reason with the names in backticks replaced by `X`, and how often it occurs.
    - type [CoverageReport](../../src/coverage-report.ts#L44)
      <a id="features.coverage-report.CoverageReport"></a>
    - fn [loadDataLogic](../../src/coverage-report.ts#L78) (path = resourcePath("data-logic.json")) → DataLogicSignal[]
      <a id="features.coverage-report.loadDataLogic"></a><br>`resources/data-logic.json`: the configuration readers whose calls are «logic in data».
      - calls [features.call-sites.resourcePath](features.md#features.call-sites.resourcePath)
    - fn [findDataLogic](../../src/coverage-report.ts#L88) (config: Config, snapshot: AnalysisSnapshot, signals: readonly DataLogicSignal[]) → Promise<DataLogicSite[]>
      <a id="features.coverage-report.findDataLogic"></a><br>Calls and reads of the snapshot's files that the signals match, in signal order, then file and position.
      - calls [features.call-sites.callsOf](features.md#features.call-sites.callsOf), [features.call-sites.snapshotFacts](features.md#features.call-sites.snapshotFacts), [features.call-sites.internalCallPositions](features.md#features.call-sites.internalCallPositions), [features.call-sites.placer](features.md#features.call-sites.placer), [features.call-sites.sourceReader](features.md#features.call-sites.sourceReader), [features.call-sites.compileMatcher](features.md#features.call-sites.compileMatcher), [features.call-sites.callMatches](features.md#features.call-sites.callMatches), [features.call-sites.readMatches](features.md#features.call-sites.readMatches), [features.call-sites.appliesTo](features.md#features.call-sites.appliesTo), [features.call-sites.textMatches](features.md#features.call-sites.textMatches), [base.span.compareText](base.md#base.span.compareText)
    - fn [normaliseReason](../../src/coverage-report.ts#L119) (reason: string) → string
      <a id="features.coverage-report.normaliseReason"></a><br>A reason with every backticked name as `X`: `call through a local value \`X\``.
    - fn [holeModule](../../src/coverage-report.ts#L124) (snapshot: AnalysisSnapshot, source: string | null) → string | null <!-- internal -->
      <a id="features.coverage-report.holeModule"></a><br>The module a hole counts under: the file module of its fn or class, else its file.
    - fn [reasonList](../../src/coverage-report.ts#L135) (counts: ReadonlyMap<string, HoleReason>) → HoleReason[] <!-- internal -->
      <a id="features.coverage-report.reasonList"></a>
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [coverageReport](../../src/coverage-report.ts#L144) ( snapshot: AnalysisSnapshot, specified: ReadonlyMap<string, { file: string; flow: string }>, signals: readonly DataLogicSignal[], dataLogic: readonly DataLogicSite[], viewText: (file: string) => string | null, ) → CoverageReport
      <a id="features.coverage-report.coverageReport"></a><br>The report over a snapshot. `specified`: triggers the hand-written flows name; `viewText`: the text of a file of the discovered view, by its name (`<layer>.md`), or null; `dataLogic`: the sites `findDataLogic` found.
      - calls [features.call-sites.callGraph](features.md#features.call-sites.callGraph), [features.call-sites.reachable](features.md#features.call-sites.reachable), [features.call-sites.isTestFile](features.md#features.call-sites.isTestFile), [base.span.compareText](base.md#base.span.compareText), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved), [features.coverage-report.holeModule](features.md#features.coverage-report.holeModule), [features.coverage-report.normaliseReason](features.md#features.coverage-report.normaliseReason), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.coverage-report.reasonList](features.md#features.coverage-report.reasonList)
    - fn [percent](../../src/coverage-report.ts#L215) (share: number) → string <!-- internal -->
      <a id="features.coverage-report.percent"></a>
    - fn [coverageText](../../src/coverage-report.ts#L218) (report: CoverageReport, specDir = "keylang") → string
      <a id="features.coverage-report.coverageText"></a><br>What `keylang coverage` prints: the five sections, each with what to do about it.
      - calls [features.coverage-report.percent](features.md#features.coverage-report.percent)
  - module [discover-names](../../src/discover-names.ts#L1)
    <a id="features.discover-names"></a><br>Business names of discovered flows (business-flows/12): a model groups the flows of one layer into business processes — name, a few sentences, a domain, the entities in and out, the flows that belong to it — in one request per layer group, never per flow. Offline first: each…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diagram [map.diagram](map.md#map.diagram)
    - discover [features.discover](features.md#features.discover)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - llm [features.llm](features.md#features.llm)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - type [NameMode](../../src/discover-names.ts#L30) = (typeof NAME_MODES)[number]
      <a id="features.discover-names.NameMode"></a>
    - fn [isNameMode](../../src/discover-names.ts#L32) (value: string) → value is NameMode
      <a id="features.discover-names.isNameMode"></a>
    - type [BusinessProcess](../../src/discover-names.ts#L44)
      <a id="features.discover-names.BusinessProcess"></a><br>One business process as saved in the README.
    - type [NameGroup](../../src/discover-names.ts#L62)
      <a id="features.discover-names.NameGroup"></a><br>The flows of one layer: one request.
    - fn [nameGroups](../../src/discover-names.ts#L68) (flows: readonly DiscoveredFlow[]) → NameGroup[]
      <a id="features.discover-names.nameGroups"></a><br>The flows of the discovery by the layer of their trigger, layers and flows sorted.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [processBaseline](../../src/discover-names.ts#L80) (snapshot: AnalysisSnapshot, flows: readonly Pick<DiscoveredFlow, "name" | "steps">[]) → string
      <a id="features.discover-names.processBaseline"></a><br>The baseline of a process: a hash of every step of its flows with the baseline of an explanation of that step (`snapshotBaseline`, the closure fingerprint of a fn). A step's code changing, a step added or gone, makes it differ.
      - calls [base.span.compareText](base.md#base.span.compareText), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline)
    - fn [isStaleProcess](../../src/discover-names.ts#L87) (snapshot: AnalysisSnapshot, byName: ReadonlyMap<string, DiscoveredFlow>, process: BusinessProcess) → boolean
      <a id="features.discover-names.isStaleProcess"></a><br>A saved process whose flows are gone or whose baseline changed.
      - calls [features.discover-names.processBaseline](features.md#features.discover-names.processBaseline)
    - type [NamesPlan](../../src/discover-names.ts#L94)
      <a id="features.discover-names.NamesPlan"></a><br>What a `--names` run asks: the groups, and the saved processes that are stale.
    - fn [planNames](../../src/discover-names.ts#L104) (snapshot: AnalysisSnapshot, flows: readonly DiscoveredFlow[], saved: readonly BusinessProcess[], options: { stale: boolean; layer?: string; limit?: number }) → NamesPlan
      <a id="features.discover-names.planNames"></a><br>The groups to ask for: with `stale`, only the layers of stale processes; otherwise also every layer with a flow no fresh process has. `layer` narrows to one layer, `limit` keeps the first groups.
      - calls [features.discover-names.isStaleProcess](features.md#features.discover-names.isStaleProcess), [features.discover-names.nameGroups](features.md#features.discover-names.nameGroups)
    - fn [namesRequest](../../src/discover-names.ts#L123) (snapshot: AnalysisSnapshot, group: NameGroup, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.discover-names.namesRequest"></a><br>The request for one layer group: each flow with its entry point, trigger, offline description and its steps with what the explained map says about them (doc comments, briefs). The answer is JSON.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [estimateNameTokens](../../src/discover-names.ts#L153) (requests: readonly LlmRequest[]) → { input: number; output: number }
      <a id="features.discover-names.estimateNameTokens"></a><br>A rough size of the requests for `--dry-run`: about four characters a token, about 300 tokens out per process group.
    - type [AnsweredProcess](../../src/discover-names.ts#L159)
      <a id="features.discover-names.AnsweredProcess"></a><br>One process of an answer, checked: what is saved without the provenance.
    - fn [parseNamesAnswer](../../src/discover-names.ts#L168) (snapshot: AnalysisSnapshot, group: NameGroup, answer: string) → { processes: AnsweredProcess[]; dropped: string[]; unknownIds: string[] } | { error: string }
      <a id="features.discover-names.parseNamesAnswer"></a><br>The model's answer for `group`, checked: flow names the group does not have are dropped (`dropped`), a flow named twice stays with its first process, a process left without flows is dropped; `unknownIds` are the IDs in backticks it mentions that the snapshot does not have. Not…
      - calls [features.discover-names.jsonOf](features.md#features.discover-names.jsonOf), [features.discover-names.isRecord](features.md#features.discover-names.isRecord), [features.discover-names.oneLine](features.md#features.discover-names.oneLine), [features.discover-names.entities](features.md#features.discover-names.entities), [base.span.compareText](base.md#base.span.compareText), [features.discover-names.unknownIdsIn](features.md#features.discover-names.unknownIdsIn)
    - fn [unknownIdsIn](../../src/discover-names.ts#L207) (snapshot: AnalysisSnapshot, text: string) → string[] <!-- internal -->
      <a id="features.discover-names.unknownIdsIn"></a><br>`` `a.b.c` `` in `text` whose first segment is a layer of the snapshot and which the snapshot does not have.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [jsonOf](../../src/discover-names.ts#L217) (answer: string) → unknown <!-- internal -->
      <a id="features.discover-names.jsonOf"></a>
    - fn [isRecord](../../src/discover-names.ts#L229) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.discover-names.isRecord"></a>
    - fn [oneLine](../../src/discover-names.ts#L234) (value: unknown) → string <!-- internal -->
      <a id="features.discover-names.oneLine"></a><br>A string of the answer on one line, without a comment it could open.
    - fn [entities](../../src/discover-names.ts#L239) (value: unknown) → string[] <!-- internal -->
      <a id="features.discover-names.entities"></a><br>Entities as the README lists them: one line each, no `, ` inside (the list's separator).
      - calls [features.discover-names.oneLine](features.md#features.discover-names.oneLine)
    - fn [flowAnchor](../../src/discover-names.ts#L246) (name: string) → string
      <a id="features.discover-names.flowAnchor"></a><br>GitHub's anchor of a `# flow <name>` heading.
    - fn [domainOrder](../../src/discover-names.ts#L256) (a: string, b: string) → number <!-- internal -->
      <a id="features.discover-names.domainOrder"></a><br>Domains in the README's order: the known ones, then others by name, `Інше` last.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [renderProcesses](../../src/discover-names.ts#L266) (processes: readonly BusinessProcess[], fileOf: (flow: string) => string | null) → string
      <a id="features.discover-names.renderProcesses"></a><br>The README of the view: domain → process → flows, each process under its provenance, with its description, entities and links to its flows in the layer files. The same processes give the same bytes.
      - calls [features.discover-names.domainOrder](features.md#features.discover-names.domainOrder), [base.span.compareText](base.md#base.span.compareText), [features.discover.proseLine](features.md#features.discover.proseLine), [features.discover-names.flowAnchor](features.md#features.discover-names.flowAnchor)
    - fn [parseProcesses](../../src/discover-names.ts#L287) (text: string) → BusinessProcess[]
      <a id="features.discover-names.parseProcesses"></a><br>The processes of a README `renderProcesses` wrote; a file without the generated marker has none.
      - calls [features.discover.unproseLine](features.md#features.discover.unproseLine)
    - fn [processesPath](../../src/discover-names.ts#L318) (specDir: string) → string
      <a id="features.discover-names.processesPath"></a><br>The README's path relative to the root.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [readProcesses](../../src/discover-names.ts#L323) (root: string, specDir: string) → BusinessProcess[]
      <a id="features.discover-names.readProcesses"></a><br>The processes saved under `<dir>/flows-discovered/README.md` of `root`; none without the file.
      - calls [features.discover-names.processesPath](features.md#features.discover-names.processesPath), [features.discover-names.parseProcesses](features.md#features.discover-names.parseProcesses)
    - fn [processViews](../../src/discover-names.ts#L333) (snapshot: AnalysisSnapshot, spec: SpecIR, processes: readonly BusinessProcess[]) → DiagramProcess[]
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
    - type [DiscoverOptions](../../src/discover.ts#L23)
      <a id="features.discover.DiscoverOptions"></a>
    - type [DiscoveredFlow](../../src/discover.ts#L35)
      <a id="features.discover.DiscoveredFlow"></a><br>One discovered flow: the draft of one entry point's fn.
    - type [Discovery](../../src/discover.ts#L53)
      <a id="features.discover.Discovery"></a>
    - fn [specifiedTriggers](../../src/discover.ts#L64) (flows: readonly Flow[]) → Map<string, { file: string; flow: string }>
      <a id="features.discover.specifiedTriggers"></a><br>Each trigger the hand-written flows name, with the first flow (by file, then name) that names it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [discoverFlows](../../src/discover.ts#L77) (snapshot: AnalysisSnapshot, specified: ReadonlyMap<string, { file: string; flow: string }>, options: DiscoverOptions = {}) → Discovery
      <a id="features.discover.discoverFlows"></a><br>The flows of the view: one draft per fn an entry point names (the first entry of a fn, in the snapshot's order, labels it), names kept apart as `code-to-spec` keeps them, grouped by the trigger's layer, flows of a file by name. The same snapshot and specs give the same bytes.
      - calls [features.draft.distinctNames](features.md#features.draft.distinctNames), [features.draft.draftFlow](features.md#features.draft.draftFlow), [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [features.discover.holesBySource](features.md#features.discover.holesBySource), [features.discover.offlineDescription](features.md#features.discover.offlineDescription), [features.discover.firstLevelSteps](features.md#features.discover.firstLevelSteps), [features.discover.withComment](features.md#features.discover.withComment), [features.discover.quoted](features.md#features.discover.quoted), [base.span.compareText](base.md#base.span.compareText)
    - fn [adoptedFlow](../../src/discover.ts#L126) (flow: DiscoveredFlow, specDir: string) → FlowDraft
      <a id="features.discover.adoptedFlow"></a><br>The draft `flows adopt` proposes: the discovered flow with its comment turned into provenance — `adopted`, and the view's file it came from.
    - fn [discoverySummary](../../src/discover.ts#L133) (discovery: Pick<Discovery, "flows" | "specified">) → string
      <a id="features.discover.discoverySummary"></a><br>`discovered N flows (M already specified), K with blind spots`.
    - fn [holesBySource](../../src/discover.ts#L139) (snapshot: AnalysisSnapshot) → Map<string, number> <!-- internal -->
      <a id="features.discover.holesBySource"></a><br>The unresolved and dynamic calls of each fn: what `draftFlow` writes as an `unresolved` comment.
    - fn [withComment](../../src/discover.ts#L149) (text: string, comment: string, described: { text: string; ids: string[] } | null = null) → string <!-- internal -->
      <a id="features.discover.withComment"></a><br>The draft with an HTML comment as its own paragraph under the heading, then the description with its provenance.
      - calls [features.discover.proseLine](features.md#features.discover.proseLine)
    - fn [firstLevelSteps](../../src/discover.ts#L156) (draftText: string) → string[]
      <a id="features.discover.firstLevelSteps"></a><br>IDs of the steps right under the trigger of a draft (` - step <id>`), in order.
    - fn [offlineDescription](../../src/discover.ts#L170) (snapshot: AnalysisSnapshot, trigger: string, steps: readonly string[]) → { text: string; ids: string[] } | null
      <a id="features.discover.offlineDescription"></a><br>What a discovered flow does, in the words of the code (business-flows/12, offline first): the trigger's doc comment (a JSDoc, docblock, Python docstring or Rust doc comment, as the snapshot keeps it in `doc`), then the first sentence of the doc of each step right under it.…
      - calls [base.brief.firstSentence](base.md#base.brief.firstSentence)
    - fn [proseLine](../../src/discover.ts#L195) (text: string) → string
      <a id="features.discover.proseLine"></a><br>One line of prose that opens no block and hides nothing: `<` outside code is `&lt;`, `-->` is `--&gt;`, a start that would be a list item, heading, quote or fence is escaped with a backslash.
    - fn [unproseLine](../../src/discover.ts#L208) (line: string) → string
      <a id="features.discover.unproseLine"></a><br>The text of `proseLine` back: the escape and the entities undone.
    - fn [quoted](../../src/discover.ts#L218) (label: string) → string <!-- internal -->
      <a id="features.discover.quoted"></a><br>A label inside `"…"` of a comment: no double quote, no `-->`.
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
      <a id="features.draft-llm.DraftStatus"></a><br>A string-literal union naming the four possible outcomes when an LLM-produced draft is compared against an algorithmic one: both agree, only one side produced a result, or they disagree. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ModelDraft](../../src/draft-llm.ts#L22)
      <a id="features.draft-llm.ModelDraft"></a><br>A flow drafted with a model: the flow name, the flow text after reconciling with the algorithmic draft, counts by status, the IDs still unknown, how many rounds ran (1 or 2), and answer lines dropped because they did not parse. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      <a id="features.draft-llm.lineTree"></a><br>Recursively flattens a token tree into indented markdown bullet lines, joining each node's token texts with spaces and indenting children by two spaces per depth. Used by [`features.draft-llm.similarFlows`](features.md#features.draft-llm.similarFlows) to render flow outlines. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [RulesDraft](../../src/draft-llm.ts#L259)
      <a id="features.draft-llm.RulesDraft"></a><br>Shape of the result produced when drafting a rules file from LLM output: the assembled text, a tally of lines per `DraftStatus`, and the lines flagged as conflicting, each paired with the finding that refutes it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [draftRulesWithModel](../../src/draft-llm.ts#L273) (analysis: Analysis, client: LlmClient, mode: "llm" | "hybrid", algoText: string, target: string, options: LlmCallOptions = {}) → Promise<RulesDraft>
      <a id="features.draft-llm.draftRulesWithModel"></a><br>`draft rules --mode llm|hybrid`: the model proposes rules from the layer dependencies; each is checked at once against the current snapshot, alone, as `check` would: `agree` when it holds, `conflict` when the code breaks it (with the edge), `llm-only` when the evidence is not…
      - calls [features.draft-llm.judgeRule](features.md#features.draft-llm.judgeRule)
    - fn [judgeRule](../../src/draft-llm.ts#L317) (analysis: Analysis, others: readonly Document[], target: string, rule: string, conflicts: string[]) → DraftStatus <!-- internal -->
      <a id="features.draft-llm.judgeRule"></a><br>One rule, checked alone against the snapshot: what it adds to a check without it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [base.config.resolveStatic](base.md#base.config.resolveStatic), [check.assess.assess](check.md#check.assess.assess)
    - fn [draftLayoutWithModel](../../src/draft-llm.ts#L353) (analysis: Analysis, client: LlmClient, files: readonly string[], options: LlmCallOptions = {}) → Promise<Record<string, string[]>>
      <a id="features.draft-llm.draftLayoutWithModel"></a><br>`draft map --mode llm|hybrid`: the model proposes layers (name → globs), validated as `keylang.json` would be. Never written: layers are never assigned without a person (design §5.1 p.4) — the CLI prints them, the TUI moves them into the config buffer on an explicit action.
      - calls [features.draft-llm.answerObject](features.md#features.draft-llm.answerObject), [base.config.parseConfig](base.md#base.config.parseConfig)
    - fn [answerObject](../../src/draft-llm.ts#L372) (answer: string) → Record<string, unknown> | null
      <a id="features.draft-llm.answerObject"></a><br>The JSON object a model answered with: the first ```json block that holds one, else the first balanced `{…}` of the answer that parses as one (a brace in a JSON string does not count); null when there is none. Prose around it and a second object after it are left out.
      - calls [features.draft-llm.jsonObject](features.md#features.draft-llm.jsonObject), [features.draft-llm.balancedEnd](features.md#features.draft-llm.balancedEnd)
    - fn [jsonObject](../../src/draft-llm.ts#L386) (text: string) → Record<string, unknown> | null <!-- internal -->
      <a id="features.draft-llm.jsonObject"></a><br>`text` as a JSON object, or null: not JSON, or JSON of another shape.
    - fn [balancedEnd](../../src/draft-llm.ts#L397) (text: string, start: number) → number | null <!-- internal -->
      <a id="features.draft-llm.balancedEnd"></a><br>Where the `{` at `start` closes (the index after its `}`), skipping JSON strings; null when it never does.
  - module [draft](../../src/draft.ts#L1)
    <a id="features.draft"></a><br>`keylang draft flow <trigger> --mode algo`: the deterministic projection of a flow from the snapshot's call edges (design §5, §5.3). Each resolved call to a function of the repository becomes a nested `step`, in the order the code writes them; a function already listed is not…
    - config [base.config](base.md#base.config)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - type [FlowDraft](../../src/draft.ts#L15)
      <a id="features.draft.FlowDraft"></a><br>Plain data shape for a flow being built: its name, the raw `# flow` section text (newline-terminated), and the ordered list of step IDs with the trigger first. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [draftFlow](../../src/draft.ts#L23) (snapshot: AnalysisSnapshot, trigger: string, options: { name?: string; depth?: number; entry?: string } = {}) → FlowDraft
      <a id="features.draft.draftFlow"></a><br>Walks the call graph from a fn in an `AnalysisSnapshot` to a bounded depth, skipping non-fn and external callees, and emits a Markdown flow with `trigger`/`step` lines. Unresolved or dynamic calls per step are appended as HTML comments, and the ordered step IDs are returned… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [draftFlowFromTrace](../../src/draft.ts#L77) (snapshot: AnalysisSnapshot, run: TraceRun, options: { name?: string } = {}) → FlowDraft & { rest: string[] }
      <a id="features.draft.draftFlowFromTrace"></a><br>`draft flow --from-trace`: a flow from what one trace run observed. The first root span (in start order) is the trigger; nesting is the span tree, order among siblings is start order (`seq` on one clock, else `ts`).
      - calls [features.draft.reachesByCalls](features.md#features.draft.reachesByCalls)
    - fn [reachesByCalls](../../src/draft.ts#L106) (snapshot: AnalysisSnapshot, from: string, to: string) → boolean <!-- internal -->
      <a id="features.draft.reachesByCalls"></a><br>A path of resolved calls (the snapshot's `calls`) from `from` to `to`.
    - fn [withFlow](../../src/draft.ts#L127) (existing: string | null, draft: Pick<FlowDraft, "name" | "text">) → string
      <a id="features.draft.withFlow"></a><br>A spec with the draft added: the section of the same flow is replaced, whatever follows the name on its heading line, otherwise the draft is appended. Sections come from the parser, so a `# ` line in a code block is not a heading.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings)
    - fn [withRules](../../src/draft.ts#L151) (existing: string | null, draftText: string) → string
      <a id="features.draft.withRules"></a><br>`draft rules` into an existing spec: the drafted rules go at the end of its last `# rules` section, or into a new `# rules` section at the end, never under a trailing `# flow`. A rule the file already has (comments aside) is not repeated.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings)
    - fn [nextHeading](../../src/draft.ts#L181) (sections: readonly { heading: { span: { start: { line: number } } } | null }[], index: number) → number | null <!-- internal -->
      <a id="features.draft.nextHeading"></a><br>0-based line index of the heading after `sections[index]`, or null at the end of the file.
    - fn [distinctNames](../../src/draft.ts#L191) (drafts: readonly FlowDraft[]) → FlowDraft[]
      <a id="features.draft.distinctNames"></a><br>Flow names that keep drafts apart in one spec: two `save` triggers (`A.save`, `B.save`) become `A-save` and `B-save`, taking as many trailing ID segments as it needs.
    - fn [draftRules](../../src/draft.ts#L221) (snapshot: AnalysisSnapshot, cyclic: boolean) → string
      <a id="features.draft.draftRules"></a><br>`draft rules --mode algo`: rules the current code already keeps, so each passes `check` as written. Layers in an order where every observed dependency points down (`a < b`: `b` may use `a`), when the layers form no cycle; otherwise a `deny` for each pair used in one direction…
      - calls [features.draft.layerOrder](features.md#features.draft.layerOrder)
    - fn [layerOrder](../../src/draft.ts#L246) (layers: readonly string[], uses: ReadonlyMap<string, ReadonlySet<string>>) → string[] | null <!-- internal -->
      <a id="features.draft.layerOrder"></a><br>Layers with those used first (Kahn, ties by name); null for a cycle.
    - fn [codeToSpecTriggers](../../src/draft.ts#L265) (snapshot: AnalysisSnapshot, file: string, line: number | null) → { name: string; triggers: string[] }
      <a id="features.draft.codeToSpecTriggers"></a><br>`code-to-spec <path[:line]>`: the functions the code position names — the innermost fn whose range holds the line, or every exported fn of the file in declaration order without a line — and the spec's name: the fn's, or the file's module's. Reads the snapshot only; a position…
    - fn [codeToSpec](../../src/draft.ts#L288) (snapshot: AnalysisSnapshot, file: string, line: number | null) → { name: string; drafts: FlowDraft[] }
      <a id="features.draft.codeToSpec"></a><br>`code-to-spec <path[:line]>`: each fn `codeToSpecTriggers` names as a flow draft; same-named fns get distinct flow names.
      - calls [features.draft.codeToSpecTriggers](features.md#features.draft.codeToSpecTriggers), [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
    - type [ChangedLines](../../src/draft.ts#L295)
      <a id="features.draft.ChangedLines"></a><br>Changed lines per file, 1-based and inclusive; `all` for a file git does not track yet.
    - fn [diffHunks](../../src/draft.ts#L301) (diff: string) → Map<string, [number, number][]>
      <a id="features.draft.diffHunks"></a><br>The new-side line ranges of `git diff --unified=0`. A deletion is the line it happened after, so the fn around it counts as changed.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [deletedDiffPaths](../../src/draft.ts#L324) (diff: string) → string[]
      <a id="features.draft.deletedDiffPaths"></a><br>Paths removed in `git diff` (`--- a/file` then `+++ /dev/null`). `diffHunks` follows the new side, so a deletion has no hunk to land on.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [gitPath](../../src/draft.ts#L338) (text: string) → string <!-- internal -->
      <a id="features.draft.gitPath"></a><br>A path as `git diff` prints it: C-quoted (`"b/\303\251.ts"`, `"b/a\"b.ts"`) when it holds a quote, a backslash or a control byte.
    - fn [changedFlows](../../src/draft.ts#L366) (snapshot: AnalysisSnapshot, changed: ChangedLines, named: ReadonlySet<string>) → { drafts: FlowDraft[]; named: string[] }
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
    - type [EdgeExplanation](../../src/explain-edge.ts#L23)
      <a id="features.explain-edge.EdgeExplanation"></a><br>Result record describing why two nodes are or are not connected: the ordered `EdgeEvidence` entries in both directions, `CoverageItem` gaps in the source node when no edge exists, and an `EdgeConclusion` verdict. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [edgeIdKnown](../../src/explain-edge.ts#L34) (snapshot: AnalysisSnapshot, id: string) → boolean
      <a id="features.explain-edge.edgeIdKnown"></a><br>An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail under a known module.
    - fn [under](../../src/explain-edge.ts#L38) (id: string, scope: string) → boolean <!-- internal -->
      <a id="features.explain-edge.under"></a><br>Checks whether a dotted node ID is the given scope itself or nested beneath it by testing for an exact match or a `scope.` prefix. Used by [`features.explain-edge.explainEdge`](features.md#features.explain-edge.explainEdge) to decide which side of an edge a node belongs to. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [explainEdge](../../src/explain-edge.ts#L41) (snapshot: AnalysisSnapshot, from: string, to: string) → EdgeExplanation
      <a id="features.explain-edge.explainEdge"></a><br>The edges and the coverage between two known ids (see `edgeIdKnown`).
      - calls [base.span.compareText](base.md#base.span.compareText), [features.explain-edge.under](features.md#features.explain-edge.under), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [edgeLine](../../src/explain-edge.ts#L60) (edge: SnapshotEdge) → string
      <a id="features.explain-edge.edgeLine"></a><br>One edge as the CLI prints it: kind, resolution, provenance, range, fragment, `source → target`, candidates, hook, reason.
      - calls [check.flows.describeConfig](check.md#check.flows.describeConfig)
    - fn [holeLine](../../src/explain-edge.ts#L75) (hole: CoverageItem) → string
      <a id="features.explain-edge.holeLine"></a><br>One unresolved construct as the CLI prints it.
    - fn [edgeExplanationLines](../../src/explain-edge.ts#L80) (explanation: EdgeExplanation) → string[]
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
      <a id="features.explain-inventory.nodePlace"></a><br>Resolves a node ID to a source location from the analysis snapshot, defaulting line/col to 1, or null if it lacks a file. Unknown IDs fall back to [`lang.spec-ir.plannedDeclaration`](lang.md#lang.spec-ir.plannedDeclaration) in the docs. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [staleInventory](../../src/explain-inventory.ts#L102) (analysis: Analysis) → StaleInventory
      <a id="features.explain-inventory.staleInventory"></a><br>The saved answers and briefs that are stale or gone, in the CLI's order.
      - calls [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [features.explain-inventory.againCommand](features.md#features.explain-inventory.againCommand), [features.explain-inventory.nodePlace](features.md#features.explain-inventory.nodePlace)
    - fn [againCommand](../../src/explain-inventory.ts#L119) (id: string, kind: "answer" | "brief") → string <!-- internal -->
      <a id="features.explain-inventory.againCommand"></a><br>The command that asks again: the repository's brief has no id to name, so its batch asks for it.
    - fn [staleInventoryText](../../src/explain-inventory.ts#L125) (inventory: StaleInventory) → string
      <a id="features.explain-inventory.staleInventoryText"></a><br>`explain --stale` on stdout, byte for byte.
    - fn [briefPlan](../../src/explain-inventory.ts#L135) (analysis: Analysis, options: { batch: BriefBatch; limit: number | null; jobs: number; estimate: boolean }) → BriefPlan
      <a id="features.explain-inventory.briefPlan"></a><br>The plan of a brief batch on `analysis` (which must have a snapshot), cut to `limit` before the estimate.
      - calls [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.explain-llm.planBriefs](features.md#features.explain-llm.planBriefs), [features.explain-inventory.nodePlace](features.md#features.explain-inventory.nodePlace), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.estimateTokens](features.md#features.explain-llm.estimateTokens)
    - fn [briefPlanText](../../src/explain-inventory.ts#L173) (plan: BriefPlan) → string
      <a id="features.explain-inventory.briefPlanText"></a><br>The CLI's stdout of a plan: the dry-run counts and estimate, or the nodes one per line.
      - calls [features.explain-inventory.briefCounts](features.md#features.explain-inventory.briefCounts)
    - fn [briefCounts](../../src/explain-inventory.ts#L180) (counts: Record<BriefLevel, number>) → string
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
    - type [Explanation](../../src/explain-llm.ts#L21) = StoredExplanation
      <a id="features.explain-llm.Explanation"></a><br>A type alias that re-exports the stored explanation record shape under a feature-level name, so callers of the explain feature depend on this alias rather than the persistence type directly. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readExplanation](../../src/explain-llm.ts#L24) (config: Config, id: string, detail: ExplanationDetail = "short") → Explanation | null
      <a id="features.explain-llm.readExplanation"></a><br>The saved explanation of `id` at this detail: `short` and `full` share `<id>.md`, a brief has its own file.
      - calls [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
    - fn [explainedIds](../../src/explain-llm.ts#L30) (config: Config, kind: "answers" | "briefs") → string[]
      <a id="features.explain-llm.explainedIds"></a><br>IDs of every saved explanation (`answers`) or brief, sorted.
      - calls [map.explanations.storedIds](map.md#map.explanations.storedIds), [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [oldExplanations](../../src/explain-llm.ts#L35) (root: string) → number
      <a id="features.explain-llm.oldExplanations"></a><br>Explanation files in the store of keylang 0.1, which is not read any more.
    - fn [moveHint](../../src/explain-llm.ts#L41) (config: Config, count: number) → string
      <a id="features.explain-llm.moveHint"></a><br>How to move the store of keylang 0.1 to where explanations live now.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [currentBaseline](../../src/explain-llm.ts#L49) (analysis: Analysis, id: string) → string | null
      <a id="features.explain-llm.currentBaseline"></a><br>The baseline an explanation of `id` is compared with now (`snapshotBaseline`): "" for a planned node, which has no code yet; null when the id is gone.
      - calls [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [isStale](../../src/explain-llm.ts#L55) (analysis: Analysis, id: string, e: Explanation) → boolean
      <a id="features.explain-llm.isStale"></a><br>Reports whether a saved explanation is outdated by comparing its stored closure hash against the node's current baseline from [`features.explain-llm.currentBaseline`](features.md#features.explain-llm.currentBaseline); any mismatch, including a missing baseline, counts as stale. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline)
    - fn [briefText](../../src/explain-llm.ts#L60) (answer: string) → string
      <a id="features.explain-llm.briefText"></a><br>A model's brief as saved: one or two sentences in one paragraph of `answerText`, cut by the rule doc comments follow.
      - calls [features.explain-llm.answerText](features.md#features.explain-llm.answerText), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [answerText](../../src/explain-llm.ts#L74) (answer: string) → string
      <a id="features.explain-llm.answerText"></a><br>A model's explanation as saved (`short`, `full`, and the text a brief is cut from): without the wrappers a chatty answer puts around it — a leading remark paragraph that ends with `:` or has fewer than four words («Sure, here is the brief:», «Certainly!») while more follows…
      - calls [features.explain-llm.unfenced](features.md#features.explain-llm.unfenced), [features.explain-llm.withoutRemark](features.md#features.explain-llm.withoutRemark)
    - fn [unfenced](../../src/explain-llm.ts#L80) (text: string) → string <!-- internal -->
      <a id="features.explain-llm.unfenced"></a><br>The inside of one fenced block of Markdown or plain text that is the whole of `text`; `text` itself otherwise.
    - fn [withoutRemark](../../src/explain-llm.ts#L92) (text: string) → string <!-- internal -->
      <a id="features.explain-llm.withoutRemark"></a><br>`text` without its first paragraph when that is a remark before the answer and another paragraph follows.
    - fn [unknownIds](../../src/explain-llm.ts#L106) (analysis: Analysis, text: string) → string[]
      <a id="features.explain-llm.unknownIds"></a><br>`` `a.b.c` `` in the answer that are neither snapshot IDs nor declared `planned`. Only a path that starts with a layer is an ID at all: `` `process.env` `` is code.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [explanationRequest](../../src/explain-llm.ts#L121) (analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: ExplanationDetail; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.explanationRequest"></a><br>The request: the node's summary, its code, the signatures around it, and the words of the specs that mention it (layer, flows, rules). Not the repository.
      - calls [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-llm.sourceLines](features.md#features.explain-llm.sourceLines), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.members](features.md#features.explain-llm.members), [features.explain-llm.unresolved](features.md#features.explain-llm.unresolved)
    - fn [unresolved](../../src/explain-llm.ts#L175) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-llm.unresolved"></a><br>The constructs inside the node keylang did not turn into edges, with their line and code, for the calls section of `full`. An import of a file `assume` names is no such construct: the architecture leaves it unread.
      - calls [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [members](../../src/explain-llm.ts#L194) (analysis: Analysis, id: string, briefs: ReadonlyMap<string, StoredExplanation>) → string[] <!-- internal -->
      <a id="features.explain-llm.members"></a><br>The members right under a module, class or layer with their explanations (doc comments, briefs): a layer is explained through its modules, a module through its functions and types.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [sourceLines](../../src/explain-llm.ts#L210) (text: string, from: number, to: number) → string <!-- internal -->
      <a id="features.explain-llm.sourceLines"></a><br>Extracts the 1-based inclusive line range `from`–`to` from `text` and returns it joined with newlines. If the slice exceeds 200 lines, only the first 200 are kept, followed by a note stating how many lines were omitted; used by [`features.explain-llm.explanationRequest`](features.md#features.explain-llm.explanationRequest) to embed… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [BriefBatch](../../src/explain-llm.ts#L217) = "missing" | "stale"
      <a id="features.explain-llm.BriefBatch"></a><br>Which briefs a batch writes: nodes with no explanation or a stale brief (`missing`), or only stale briefs (`stale`).
    - type [BriefLevel](../../src/explain-llm.ts#L220) = "fn/type" | "class/module" | "layer" | "system"
      <a id="features.explain-llm.BriefLevel"></a><br>Levels of the explained map, explained bottom-up: a parent's prompt carries its members' briefs.
    - type [PlannedBrief](../../src/explain-llm.ts#L222)
      <a id="features.explain-llm.PlannedBrief"></a><br>Records a single brief-generation task: a node id, its `BriefLevel`, and a wave index that orders generation so each node only depends on briefs produced in earlier waves (functions and types first, then modules deepest-first, then layers). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [planBriefs](../../src/explain-llm.ts#L236) (analysis: Analysis, batch: BriefBatch, briefs: ReadonlyMap<string, StoredExplanation>) → PlannedBrief[]
      <a id="features.explain-llm.planBriefs"></a><br>The nodes a batch explains, in the order it asks: fn and types, then classes and modules from the deepest up, then layers, then the repository itself (`SYSTEM_ID`). A node with a doc comment is never asked about: the code already says what it does; nor is the repository when…
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [base.span.compareText](base.md#base.span.compareText)
    - fn [systemRequest](../../src/explain-llm.ts#L266) (analysis: Analysis, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.systemRequest"></a><br>The request for the repository's brief: its name, its layers with what the explained map says about them, its flows and the packages it uses. The README and manifests had nothing to say, or no model is asked at all.
      - calls [map.explanations.ownLayers](map.md#map.explanations.ownLayers), [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [estimateTokens](../../src/explain-llm.ts#L291) (analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>) → { input: number; output: number }
      <a id="features.explain-llm.estimateTokens"></a><br>A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out.
      - calls [features.explain-llm.briefRequest](features.md#features.explain-llm.briefRequest)
    - fn [briefRequest](../../src/explain-llm.ts#L301) (analysis: Analysis, id: string, lang: string, briefs: ReadonlyMap<string, StoredExplanation>) → LlmRequest | null
      <a id="features.explain-llm.briefRequest"></a><br>The request for the brief of `id`: the repository's or a node's; null when the id is gone from the snapshot.
      - calls [features.explain-llm.systemRequest](features.md#features.explain-llm.systemRequest), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest)
  - module [explain-node](../../src/explain-node.ts#L1)
    <a id="features.explain-node"></a><br>`keylang explain <id>` without a model: what the snapshot and the specs say about one node. Deterministic and offline; the LLM explanation (§5.4) builds on it and falls back to it. `nodeFacts` is also what hover says a node is (`lsp-features.ts`): one source for kind…
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [NodeFacts](../../src/explain-node.ts#L12)
      <a id="features.explain-node.NodeFacts"></a><br>What a node is by the snapshot and the specs, before any view of it shows it.
    - fn [nodeFacts](../../src/explain-node.ts#L34) (analysis: Analysis, id: string) → NodeFacts | null
      <a id="features.explain-node.nodeFacts"></a><br>The facts of `id`: from the snapshot, else from its `planned` line, else from the spec line that declares it; null when nothing does.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - type [NodeSummary](../../src/explain-node.ts#L47)
      <a id="features.explain-node.NodeSummary"></a><br>Data shape bundling everything gathered about one graph node for explanation: its kind, signature, doc brief, location, export status, call/dependency/flow neighbours, matching rules, and fingerprints. Also counts unresolved constructs per kind in `holes` and flags… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [ExplainResult](../../src/explain-node.ts#L72)
      <a id="features.explain-node.ExplainResult"></a><br>Union returned when explaining a node: either a successful `summary` holding a `NodeSummary`, or a failure carrying the `unknown` identifier that was not found plus an optional `suggestion` for a close match. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [summarizeNode](../../src/explain-node.ts#L74) (analysis: Analysis, id: string) → ExplainResult
      <a id="features.explain-node.summarizeNode"></a><br>Builds a node's structured summary from [`features.explain-node.nodeFacts`](features.md#features.explain-node.nodeFacts), rules, flows, graph links, unresolved-coverage counts and fingerprints; plan-only nodes get a bare summary, while unknown or spec-only IDs get a suggestion instead. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.explain-node.nodeFacts](features.md#features.explain-node.nodeFacts), [features.explain-node.rulesNaming](features.md#features.explain-node.rulesNaming), [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [rulesNaming](../../src/explain-node.ts#L112) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-node.rulesNaming"></a><br>`file:line: rule text` of the rule and module lines that name `id` or a scope around it, sorted; the generated map's are left out.
      - calls [features.explain-node.nodeHolding](features.md#features.explain-node.nodeHolding)
    - fn [nodeHolding](../../src/explain-node.ts#L141) (root: Node, ref: Ref) → Node | null <!-- internal -->
      <a id="features.explain-node.nodeHolding"></a><br>The allow, deny, entry item, nested layer, or module line that holds `ref`.
    - fn [formatSummary](../../src/explain-node.ts#L151) (s: NodeSummary) → string
      <a id="features.explain-node.formatSummary"></a><br>The summary as text: one line per fact, empty facts left out.
  - module [explain-offline](../../src/explain-offline.ts#L1)
    <a id="features.explain-offline"></a><br>`keylang explain <code|id>` without a model: the help of a diagnostic code, or what the snapshot and the specs say about a node with the explanations saved for it. One result for the CLI, the TUI palette and `e`: the doc comment of the code (in the summary), the saved…
    - analyze [map.analyze](map.md#map.analyze)
    - explain [features.explain](features.md#features.explain)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - fn [isDiagnosticCode](../../src/explain-offline.ts#L15) (subject: string) → boolean
      <a id="features.explain-offline.isDiagnosticCode"></a><br>`K001`, `k104`: a diagnostic code, whatever its case, as the CLI tells it from an ID.
    - type [SavedAnswer](../../src/explain-offline.ts#L20)
      <a id="features.explain-offline.SavedAnswer"></a><br>An explanation a model wrote, as saved, judged against the current analysis.
    - type [ExplainLink](../../src/explain-offline.ts#L36)
      <a id="features.explain-offline.ExplainLink"></a><br>A position the summary names: the node itself, a related ID, a flow or a rule line. Only known places; an ID without one has `file: null`.
    - type [CodeExplanation](../../src/explain-offline.ts#L49)
      <a id="features.explain-offline.CodeExplanation"></a><br>Shape of an offline explanation for a single error code: a fixed `"code"` discriminator, the code string as printed in upper case, and the CLI's prose giving cause, example and fix. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [NodeExplanation](../../src/explain-offline.ts#L57)
      <a id="features.explain-offline.NodeExplanation"></a><br>Describes the offline explanation of a single code node: its `NodeSummary`, the requested `ExplanationDetail`, the stored `SavedAnswer` for that detail plus the map's brief, and related `ExplainLink` entries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OfflineExplanation](../../src/explain-offline.ts#L69) = CodeExplanation | NodeExplanation
      <a id="features.explain-offline.OfflineExplanation"></a><br>Union type covering the two shapes an offline explanation can take: either a free-form code explanation or a per-node explanation. Lets callers handle both result kinds through one type. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [codeExplanation](../../src/explain-offline.ts#L72) (code: string) → CodeExplanation | null
      <a id="features.explain-offline.codeExplanation"></a><br>The help of a diagnostic code, or null for a code keylang does not have.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [unknownIdMessage](../../src/explain-offline.ts#L78) (id: string, suggestion: string | null) → string
      <a id="features.explain-offline.unknownIdMessage"></a><br>The CLI's error for an ID that is neither in the snapshot nor declared `planned`.
    - fn [nodeExplanation](../../src/explain-offline.ts#L83) (analysis: Analysis, id: string, detail: ExplanationDetail) → NodeExplanation | { unknown: string; suggestion: string | null }
      <a id="features.explain-offline.nodeExplanation"></a><br>The offline explanation of `id` on `analysis`, or why there is none.
      - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswer](features.md#features.explain-offline.savedAnswer), [features.explain-offline.summaryLinks](features.md#features.explain-offline.summaryLinks)
    - fn [savedAnswer](../../src/explain-offline.ts#L99) (analysis: Analysis, id: string, e: Explanation) → SavedAnswer
      <a id="features.explain-offline.savedAnswer"></a><br>Converts a stored explanation into a reply record, marking freshness via [`features.explain-llm.isStale`](features.md#features.explain-llm.isStale), listing unrecognized IDs via [`features.explain-llm.unknownIds`](features.md#features.explain-llm.unknownIds), and attaching its file path from [`map.explanations.explanationPath`](map.md#map.explanations.explanationPath). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
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
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
  - module [explain](../../src/explain.ts#L1)
    <a id="features.explain"></a><br>Short explanations for diagnostic codes. Every code in `diag.ts` has an entry.
    - diag [base.diag](base.md#base.diag)
    - fn [explainCode](../../src/explain.ts#L130) (code: string) → string | null
      <a id="features.explain.explainCode"></a><br>Looks up a diagnostic code (case-insensitively) in the `EXPLANATIONS` table and formats its cause, example, and fix as a multi-line string, returning null for unknown codes. For `K005` it appends extra reason lines from `K005_REASON_LINES`. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
  - module [explorer](../../src/explorer.ts#L1)
    <a id="features.explorer"></a><br>The entry explorer of `keylang web` (business-flows/22): one level of the call graph around an ID at a time, for a person reading old code before any flow is written. `callsOf` gives the direct callees of a fn (with the edge's `via` and `site`), the calls keylang did not…
    - external-ids [base.external-ids](base.md#base.external-ids)
    - draft [features.draft](features.md#features.draft)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [CallSite](../../src/explorer.ts#L20)
      <a id="features.explorer.CallSite"></a><br>Where a call is written.
    - type [CallRef](../../src/explorer.ts#L27)
      <a id="features.explorer.CallRef"></a><br>A callee or a caller: the other end of a resolved edge, with how the edge goes.
    - type [CallHole](../../src/explorer.ts#L60)
      <a id="features.explorer.CallHole"></a><br>A call keylang did not resolve: «тут keylang сліпий».
    - type [Calls](../../src/explorer.ts#L69)
      <a id="features.explorer.Calls"></a>
    - fn [follows](../../src/explorer.ts#L92) (edge: SnapshotEdge) → boolean <!-- internal -->
      <a id="features.explorer.follows"></a><br>The resolved edges a call tree follows: calls, and whatever an adapter adds between a fn and an event.
    - type [Index](../../src/explorer.ts#L97) <!-- internal -->
      <a id="features.explorer.Index"></a><br>Indexes of the snapshot's call edges, built once per snapshot.
    - fn [indexOf](../../src/explorer.ts#L107) (snapshot: AnalysisSnapshot) → Index <!-- internal -->
      <a id="features.explorer.indexOf"></a>
      - calls [features.explorer.follows](features.md#features.explorer.follows)
    - fn [byPosition](../../src/explorer.ts#L138) (a: CallSite, b: CallSite) → number <!-- internal -->
      <a id="features.explorer.byPosition"></a>
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [callsOf](../../src/explorer.ts#L144) (snapshot: AnalysisSnapshot, id: string) → Calls
      <a id="features.explorer.callsOf"></a><br>One level around `id`: its callees and holes, its callers, and the entry points above it. An unknown ID gives empty lists and a `reason`.
      - calls [features.explorer.indexOf](features.md#features.explorer.indexOf), [features.explorer.byPosition](features.md#features.explorer.byPosition), [base.span.compareText](base.md#base.span.compareText), [features.explorer.holesOf](features.md#features.explorer.holesOf), [features.explorer.reachedFrom](features.md#features.explorer.reachedFrom)
    - fn [holesOf](../../src/explorer.ts#L193) (index: Index, id: string) → CallHole[] <!-- internal -->
      <a id="features.explorer.holesOf"></a><br>The unresolved and ambiguous calls of `id`, and the coverage items of the snapshot about it at other places (a `dynamic-event`), by position.
      - calls [features.explorer.byPosition](features.md#features.explorer.byPosition)
    - fn [reachedFrom](../../src/explorer.ts#L213) (snapshot: AnalysisSnapshot, index: Index, id: string) → Calls["reachedFrom"] <!-- internal -->
      <a id="features.explorer.reachedFrom"></a><br>Breadth first up the resolved edges: the entry points that reach `id`, nearest first, then by kind and label.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - type [EventListing](../../src/explorer.ts#L236)
      <a id="features.explorer.EventListing"></a><br>An event of the snapshot (business-flows/08): who publishes it and who subscribes.
    - fn [eventsOf](../../src/explorer.ts#L245) (snapshot: AnalysisSnapshot | null) → { events: EventListing[]; reason?: string }
      <a id="features.explorer.eventsOf"></a><br>The event nodes of the snapshot by ID, or why there are none.
      - calls [features.explorer.indexOf](features.md#features.explorer.indexOf), [base.span.compareText](base.md#base.span.compareText)
    - type [ExplorerStep](../../src/explorer.ts#L259)
      <a id="features.explorer.ExplorerStep"></a><br>A branch a person ticked: a step and the steps under it.
    - type [ExplorerFlowRequest](../../src/explorer.ts#L264)
      <a id="features.explorer.ExplorerFlowRequest"></a>
    - fn [parseExplorerFlow](../../src/explorer.ts#L283) (body: unknown) → ExplorerFlowRequest | string
      <a id="features.explorer.parseExplorerFlow"></a><br>The request body of `POST /api/flow-proposal` as a request, or why not: `{name, trigger, steps}`, where a step is an ID or `{id, steps?}`.
    - fn [explorerFlow](../../src/explorer.ts#L323) (snapshot: AnalysisSnapshot, request: ExplorerFlowRequest) → FlowDraft | string
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
    - type [Stage](../../src/feature-status.ts#L34) = "idea" | "behavior" | "structure" | "ready" | "done"
      <a id="features.feature-status.Stage"></a><br>How far a feature file got, the first that holds: `done` (no gaps), `idea` (no `# flow` yet), `behavior` (a flow without a trigger or steps), `structure` (the spec itself has gaps: errors, open questions, a predicted deny, a planned id outside the layers, a planned fn without a…
    - type [Gap](../../src/feature-status.ts#L40)
      <a id="features.feature-status.Gap"></a><br>What keeps a feature from done. Every gap blocks it; `stage` is where it is fixed.
    - type [Hint](../../src/feature-status.ts#L54)
      <a id="features.feature-status.Hint"></a><br>What does not keep the feature from done: the next step of a stage the spec still lacks, or a rule fail elsewhere that is not this change's (`rule`).
    - type [FeatureInfo](../../src/feature-status.ts#L64)
      <a id="features.feature-status.FeatureInfo"></a><br>A record describing a single feature's status entry: an identifier, the source location (file, line, column) where it is declared, and a verdict string paired with a free-text reason explaining it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [BaseChanges](../../src/feature-status.ts#L78)
      <a id="features.feature-status.BaseChanges"></a><br>What git reports changed in the working tree since the base ref, as `check --changed` reads it: changed, added, deleted and untracked files, and the deleted ones. POSIX, relative to the root, sorted.
    - type [BaseSource](../../src/feature-status.ts#L88) = "since" | "merge-base" | "HEAD"
      <a id="features.feature-status.BaseSource"></a><br>How the base commit was chosen: `since` — given (`--since`, MCP `since`); `merge-base` — where HEAD left the main branch, so the branch's own commits are the change; `HEAD` — no main branch, no merge-base, or HEAD itself.
    - type [BaseOrigin](../../src/feature-status.ts#L91)
      <a id="features.feature-status.BaseOrigin"></a><br>The commit a feature is judged against, and how a sentence names it.
    - type [FeatureBase](../../src/feature-status.ts#L112)
      <a id="features.feature-status.FeatureBase"></a><br>The feature file at its base commit and what changed since. `compared`: the file is there; `absent`: it is not (a new feature, or no commit yet: then every file is changed); `unavailable`: the history could not be read, so the plan is not compared and every rule fail blocks.…
    - type [FeatureBaseInfo](../../src/feature-status.ts#L120)
      <a id="features.feature-status.FeatureBaseInfo"></a><br>`FeatureBase` as the report shows it: the commit, its state, and how it was chosen.
    - type [FeatureReport](../../src/feature-status.ts#L122)
      <a id="features.feature-status.FeatureReport"></a><br>Result of checking a feature: whether it is done, its current stage, blocking gaps and hints, plus test, trace and base details and inherited rule failures that do not block (null without git, making every rule failure a gap). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [FeatureInput](../../src/feature-status.ts#L140)
      <a id="features.feature-status.FeatureInput"></a><br>Input bundle for computing a feature's status: parsed docs, spec, diagnostics and verdicts, plus optional snapshot nodes/edges, base plan, changed files, resolver index and layers that refine planned-edge and rule-fail checks. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [idsIn](../../src/feature-status.ts#L174) (doc: Document) → string[]
      <a id="features.feature-status.idsIn"></a><br>Ids declared or named in one spec, in first-seen order.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [featureStatus](../../src/feature-status.ts#L191) (input: FeatureInput, slug: string) → FeatureReport | null
      <a id="features.feature-status.featureStatus"></a><br>The feature report, or null when `keylang/<dir>/features/<slug>.md` is not one of the specs. Gaps are ordered by kind, then file, line, column, id.
      - calls [base.config.specPath](base.md#base.config.specPath), [base.diag.isError](base.md#base.diag.isError), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.feature-status.denyGaps](features.md#features.feature-status.denyGaps), [features.feature-status.finding](features.md#features.feature-status.finding), [features.feature-status.claimsOf](features.md#features.feature-status.claimsOf), [features.feature-status.thisChange](features.md#features.feature-status.thisChange), [features.feature-status.idsIn](features.md#features.feature-status.idsIn), [features.feature-status.ruleFails](features.md#features.feature-status.ruleFails), [features.feature-status.weakenedPlan](features.md#features.feature-status.weakenedPlan), [base.span.compareText](base.md#base.span.compareText), [features.feature-status.stageOf](features.md#features.feature-status.stageOf), [features.feature-status.baseInfo](features.md#features.feature-status.baseInfo)
    - fn [baseInfo](../../src/feature-status.ts#L301) (base: FeatureBase) → FeatureBaseInfo <!-- internal -->
      <a id="features.feature-status.baseInfo"></a><br>The base as the report names it: the commit and its state first, as they always came, then how it was chosen.
    - type [RuleFail](../../src/feature-status.ts#L307) <!-- internal -->
      <a id="features.feature-status.RuleFail"></a><br>A rule fail: an error diagnostic of a rule (K101, K102, K104, K105, K107), or a failed rule verdict that repeats none.
    - fn [ruleFails](../../src/feature-status.ts#L318) (input: FeatureInput) → RuleFail[] <!-- internal -->
      <a id="features.feature-status.ruleFails"></a><br>Every rule fail of the analysis, in the order of its diagnostics, then its verdicts.
      - calls [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [thisChange](../../src/feature-status.ts#L340) (input: FeatureInput, path: string, named: readonly string[]) → (fail: RuleFail) => boolean <!-- internal -->
      <a id="features.feature-status.thisChange"></a><br>Whether a rule fail is this change's. Without what changed since the base, every one is.
      - calls [features.changed.filterChanged](features.md#features.changed.filterChanged)
    - fn [stageOf](../../src/feature-status.ts#L368) (hasFlow: boolean, gaps: readonly Gap[], hints: readonly Hint[]) → Stage <!-- internal -->
      <a id="features.feature-status.stageOf"></a><br>The first stage that holds, from `done` down: see `Stage`.
    - fn [denyGaps](../../src/feature-status.ts#L388) (input: FeatureInput, path: string, flows: readonly Flow[]) → Gap[] <!-- internal -->
      <a id="features.feature-status.denyGaps"></a><br>Edges a flow of the feature asks for that a rule would deny once they are code: a `step` or `calls` target under its parent `trigger` or `step` (a top-level one under the first trigger), while one end is still `planned` and not implemented. Once both ends are code, `check`…
      - calls [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [claimsOf](../../src/feature-status.ts#L430) (flow: Flow) → { id: string; span: Span }[] <!-- internal -->
      <a id="features.feature-status.claimsOf"></a><br>The static claims of a flow, in order: every `step`, and every target of a `calls` line.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [weakenedPlan](../../src/feature-status.ts#L445) (input: FeatureInput, path: string, base: Extract<FeatureBase, { state: "compared" | "absent" }>) → Gap[] <!-- internal -->
      <a id="features.feature-status.weakenedPlan"></a><br>Where the plan was weakened: against the base, then — with a merge-base — against HEAD as well, so a file new on the branch keeps its committed plan. A removal both find is the base's gap alone.
      - calls [features.feature-status.planGaps](features.md#features.feature-status.planGaps)
    - fn [planGaps](../../src/feature-status.ts#L462) (input: FeatureInput, path: string, at: string, baseDoc: Document) → { key: string; gap: Gap }[] <!-- internal -->
      <a id="features.feature-status.planGaps"></a><br>Where the feature file weakened its plan since `at` (how a sentence names the commit): a `planned` removed while the code does not implement it (no K202), and a `trigger`, `step` or open question that is no longer there under the same flow and parents: a question is answered in…
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.flows.plannedMismatch](check.md#check.flows.plannedMismatch), [features.feature-status.planItems](features.md#features.feature-status.planItems)
    - type [PlanItem](../../src/feature-status.ts#L498) = Trigger | FlowStep | QuestionItem <!-- internal -->
      <a id="features.feature-status.PlanItem"></a><br>Internal union type for a single feature-plan entry, which can be a trigger, a flow step, or a question item, so code in feature status handling can treat all three kinds of plan entry uniformly. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [planItems](../../src/feature-status.ts#L501) (flow: Flow) → { key: string; item: PlanItem }[] <!-- internal -->
      <a id="features.feature-status.planItems"></a><br>Every `trigger`, `step` and open question of a flow with a key: the flow, its parents, and itself.
    - fn [finding](../../src/feature-status.ts#L515) (diagnostics: readonly Diagnostic[], file: string, line: number, code: string) → Diagnostic | undefined <!-- internal -->
      <a id="features.feature-status.finding"></a><br>Returns the first diagnostic whose file, starting line, and code all match the given values, or undefined when none does. Used by [`features.feature-status.featureStatus`](features.md#features.feature-status.featureStatus) to look up a specific expected finding. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [flow-bundle](../../src/flow-bundle.ts#L1)
    <a id="features.flow-bundle"></a><br>`keylang flow export|import` (business-flows/26): the portable bundle of business flows. Export writes one self-contained Markdown file — a header comment with its provenance, tables of the layers, nodes, tests, events and integrations the flows reach, the flows themselves, and…
    - brief [base.brief](base.md#base.brief)
    - glob [base.glob](base.md#base.glob)
    - ir [lang.ir](lang.md#lang.ir)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [BundleHeader](../../src/flow-bundle.ts#L37)
      <a id="features.flow-bundle.BundleHeader"></a><br>Where a bundle came from.
    - type [BundleLayer](../../src/flow-bundle.ts#L50)
      <a id="features.flow-bundle.BundleLayer"></a>
    - type [BundleNode](../../src/flow-bundle.ts#L58)
      <a id="features.flow-bundle.BundleNode"></a>
    - type [BundleTest](../../src/flow-bundle.ts#L74)
      <a id="features.flow-bundle.BundleTest"></a>
    - type [BundleReach](../../src/flow-bundle.ts#L81)
      <a id="features.flow-bundle.BundleReach"></a><br>An event a flow emits, or an integration one of its nodes calls.
    - type [BundleFlow](../../src/flow-bundle.ts#L91)
      <a id="features.flow-bundle.BundleFlow"></a><br>One flow of a bundle: its `# flow` section as written, with the bundle's comment under the heading.
    - type [Bundle](../../src/flow-bundle.ts#L101)
      <a id="features.flow-bundle.Bundle"></a>
    - type [ExportFlow](../../src/flow-bundle.ts#L113)
      <a id="features.flow-bundle.ExportFlow"></a><br>A flow the export reads: its section text and the business words known about it.
    - fn [flowIds](../../src/flow-bundle.ts#L126) (text: string) → string[]
      <a id="features.flow-bundle.flowIds"></a><br>Every ID a flow section names (triggers, steps, calls, reads, `then`, planned), in order of first mention.
      - calls [features.flow-bundle.idSpots](features.md#features.flow-bundle.idSpots)
    - fn [flowTests](../../src/flow-bundle.ts#L133) (flow: string, text: string) → BundleTest[]
      <a id="features.flow-bundle.flowTests"></a><br>The `test` lines of a flow section.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [flowEvents](../../src/flow-bundle.ts#L142) (flow: string, text: string) → BundleReach[]
      <a id="features.flow-bundle.flowEvents"></a><br>The `emits` lines of a flow section, as reached events.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [bundleNodes](../../src/flow-bundle.ts#L156) (snapshot: AnalysisSnapshot, flows: readonly ExportFlow[], withCallees: number) → BundleNode[]
      <a id="features.flow-bundle.bundleNodes"></a><br>The nodes of the bundle: every ID the flows name, then (`withCallees` > 0) what they call, to that depth, over resolved calls to fns of the repository. A node keeps the flows that name or reach it.
      - calls [features.flow-bundle.describe](features.md#features.flow-bundle.describe), [features.flow-bundle.plannedIn](features.md#features.flow-bundle.plannedIn), [features.flow-bundle.flowIds](features.md#features.flow-bundle.flowIds)
    - fn [describe](../../src/flow-bundle.ts#L195) (snapshot: AnalysisSnapshot, id: string) → Omit<BundleNode, "role" | "flows"> <!-- internal -->
      <a id="features.flow-bundle.describe"></a>
      - calls [base.brief.firstSentence](base.md#base.brief.firstSentence)
    - fn [bundleText](../../src/flow-bundle.ts#L209) (input: { header: BundleHeader; layers: readonly BundleLayer[]; nodes: readonly BundleNode[]; tests: readonly BundleTest[]; reached: readonly BundleReach[]; flows: readonly ExportFlow[] }) → string
      <a id="features.flow-bundle.bundleText"></a><br>The bundle as one Markdown file. The same input gives the same bytes.
      - calls [features.flow-bundle.word](features.md#features.flow-bundle.word), [features.flow-bundle.cell](features.md#features.flow-bundle.cell), [features.flow-bundle.row](features.md#features.flow-bundle.row), [features.flow-bundle.code](features.md#features.flow-bundle.code), [features.flow-bundle.text](features.md#features.flow-bundle.text), [features.flow-bundle.withBundleComment](features.md#features.flow-bundle.withBundleComment)
    - fn [withBundleComment](../../src/flow-bundle.ts#L247) (flow: ExportFlow) → string <!-- internal -->
      <a id="features.flow-bundle.withBundleComment"></a><br>The flow's section with the bundle's comment (origin and source) under the heading, then its business process as a quote.
      - calls [features.flow-bundle.quoteLine](features.md#features.flow-bundle.quoteLine), [features.flow-bundle.word](features.md#features.flow-bundle.word)
    - fn [quoteLine](../../src/flow-bundle.ts#L256) (text: string) → string <!-- internal -->
      <a id="features.flow-bundle.quoteLine"></a><br>One line of a quote: no comment it could open, no `<` read as HTML.
    - fn [word](../../src/flow-bundle.ts#L261) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.word"></a><br>A header value: one word, no `-->`.
    - fn [code](../../src/flow-bundle.ts#L265) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.code"></a>
      - calls [features.flow-bundle.cell](features.md#features.flow-bundle.cell)
    - fn [text](../../src/flow-bundle.ts#L270) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.text"></a>
      - calls [features.flow-bundle.cell](features.md#features.flow-bundle.cell)
    - fn [cell](../../src/flow-bundle.ts#L275) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.cell"></a><br>A table cell: one line, `|` escaped.
    - fn [row](../../src/flow-bundle.ts#L279) (cells: readonly string[]) → string <!-- internal -->
      <a id="features.flow-bundle.row"></a>
    - fn [parseBundle](../../src/flow-bundle.ts#L286) (source: string) → Bundle | { error: string }
      <a id="features.flow-bundle.parseBundle"></a><br>The bundle a file holds, or why it is none.
      - calls [features.flow-bundle.cells](features.md#features.flow-bundle.cells), [features.flow-bundle.plain](features.md#features.flow-bundle.plain), [features.flow-bundle.unescapeText](features.md#features.flow-bundle.unescapeText), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [cells](../../src/flow-bundle.ts#L352) (line: string) → string[] <!-- internal -->
      <a id="features.flow-bundle.cells"></a><br>The cells of a table row, `\|` kept inside a cell.
    - fn [plain](../../src/flow-bundle.ts#L371) (value: string | undefined) → string <!-- internal -->
      <a id="features.flow-bundle.plain"></a><br>A cell without the backticks around it.
    - fn [unescapeText](../../src/flow-bundle.ts#L376) (value: string) → string <!-- internal -->
      <a id="features.flow-bundle.unescapeText"></a>
    - type [TargetLayer](../../src/flow-bundle.ts#L383)
      <a id="features.flow-bundle.TargetLayer"></a><br>The layers of the repository a bundle is imported into.
    - type [LayerChoice](../../src/flow-bundle.ts#L390)
      <a id="features.flow-bundle.LayerChoice"></a><br>How each source layer lands: the target layer and how that was decided.
    - fn [parseLayerMap](../../src/flow-bundle.ts#L398) (text: string) → Map<string, string> | { error: string }
      <a id="features.flow-bundle.parseLayerMap"></a><br>`old=new,old2=new2`, or why it is not one.
    - fn [usedLayers](../../src/flow-bundle.ts#L410) (bundle: Bundle) → string[]
      <a id="features.flow-bundle.usedLayers"></a><br>The source layers an import must place: the first segment of every ID of its flows and nodes, and the layers of the test paths.
      - calls [features.flow-bundle.flowIds](features.md#features.flow-bundle.flowIds), [features.flow-bundle.layerOfPath](features.md#features.flow-bundle.layerOfPath), [base.span.compareText](base.md#base.span.compareText)
    - fn [algoLayers](../../src/flow-bundle.ts#L426) (layers: readonly string[], target: readonly TargetLayer[], taken: ReadonlyMap<string, LayerChoice> = new Map()) → { choices: LayerChoice[]; notes: string[] }
      <a id="features.flow-bundle.algoLayers"></a><br>The algorithm's choice for the layers the flag and the model left: the layer of the same name, else the first layer of the target (noted).
    - fn [layerMapRequest](../../src/flow-bundle.ts#L442) (bundle: Bundle, layers: readonly string[], target: readonly TargetLayer[]) → LlmRequest
      <a id="features.flow-bundle.layerMapRequest"></a><br>The model's request: which target layer each source layer's code belongs in, by names, roots and descriptions.
    - fn [parseLayerMapAnswer](../../src/flow-bundle.ts#L468) (answer: string, layers: readonly string[], target: readonly TargetLayer[]) → { choices: LayerChoice[]; notes: string[] }
      <a id="features.flow-bundle.parseLayerMapAnswer"></a><br>The model's answer checked: each value a target layer, each key a layer asked for; anything else is noted and left to the algorithm.
      - calls [features.flow-bundle.jsonOf](features.md#features.flow-bundle.jsonOf), [features.flow-bundle.isRecord](features.md#features.flow-bundle.isRecord)
    - fn [jsonOf](../../src/flow-bundle.ts#L483) (answer: string) → unknown <!-- internal -->
      <a id="features.flow-bundle.jsonOf"></a>
    - fn [isRecord](../../src/flow-bundle.ts#L495) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.flow-bundle.isRecord"></a>
    - fn [layerOfPath](../../src/flow-bundle.ts#L500) (layers: readonly { name: string; globs: string[] }[], path: string) → { name: string; root: string } | null <!-- internal -->
      <a id="features.flow-bundle.layerOfPath"></a><br>The layer whose root holds `path` (the longest root wins), with that root; null when none does.
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix)
    - type [ImportPlan](../../src/flow-bundle.ts#L513)
      <a id="features.flow-bundle.ImportPlan"></a><br>What an import proposes: the feature spec and the migration section, and what the person should know.
    - type [ImportTarget](../../src/flow-bundle.ts#L523)
      <a id="features.flow-bundle.ImportTarget"></a>
    - fn [importPlan](../../src/flow-bundle.ts#L538) (bundle: Bundle, choices: readonly LayerChoice[], target: ImportTarget, options: { name: string; bundleFile: string; mode: string }) → ImportPlan
      <a id="features.flow-bundle.importPlan"></a><br>The import: each flow of the bundle with every ID re-homed (its layer by `choices`, the rest of the ID kept), `planned` declared for each ID the target lacks (with the kind and signature of the bundle's nodes, each ID once in the file), test paths re-homed by layer root, and a…
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [features.flow-bundle.layerOfPath](features.md#features.flow-bundle.layerOfPath), [features.flow-bundle.word](features.md#features.flow-bundle.word), [features.flow-bundle.flowIds](features.md#features.flow-bundle.flowIds), [features.flow-bundle.plannedIn](features.md#features.flow-bundle.plannedIn), [features.flow-bundle.plannedLine](features.md#features.flow-bundle.plannedLine), [features.flow-bundle.rehomedFlow](features.md#features.flow-bundle.rehomedFlow)
    - fn [plannedLine](../../src/flow-bundle.ts#L599) (kind: string | undefined, id: string, signature: string | null, notes: string[]) → string <!-- internal -->
      <a id="features.flow-bundle.plannedLine"></a><br>`- planned <kind> <id> <signature>`; a signature the grammar would not read as one line of words is left out (noted).
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [rehomedFlow](../../src/flow-bundle.ts#L613) (text: string, rehome: (id: string) => string, rehomePath: (path: string) => string, provenance: string, planned: readonly string[]) → string <!-- internal -->
      <a id="features.flow-bundle.rehomedFlow"></a><br>The flow's text with IDs and test paths replaced, the bundle's comment turned into the import's provenance, and the planned lines before the first item.
      - calls [features.flow-bundle.idSpots](features.md#features.flow-bundle.idSpots), [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [withMigration](../../src/flow-bundle.ts#L637) (existing: string | null, name: string, section: string) → string
      <a id="features.flow-bundle.withMigration"></a><br>The text with the `# migration <name>` section replaced (or appended); a file without one starts with it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - type [IdSpot](../../src/flow-bundle.ts#L654) <!-- internal -->
      <a id="features.flow-bundle.IdSpot"></a><br>Where a flow section names an ID: a reference (a link as a whole) or the ID of a `planned`. Offsets into `text`.
    - fn [flowNodes](../../src/flow-bundle.ts#L660) (text: string) → Node[] <!-- internal -->
      <a id="features.flow-bundle.flowNodes"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [idSpots](../../src/flow-bundle.ts#L665) (text: string) → IdSpot[] <!-- internal -->
      <a id="features.flow-bundle.idSpots"></a>
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [plannedIn](../../src/flow-bundle.ts#L681) (text: string) → Map<string, { kind: string; signature: string | null }> <!-- internal -->
      <a id="features.flow-bundle.plannedIn"></a><br>The `planned` items of a flow section: ID → kind and signature.
      - calls [features.flow-bundle.flowNodes](features.md#features.flow-bundle.flowNodes), [lang.ir.walk](lang.md#lang.ir.walk)
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
    <a id="features.git-changes"></a><br>What git says changed in the working tree since a ref: the inputs of `check --changed`, `hook stop` and `code-to-spec --since`, and for `feature` its base commit (the merge-base with the main branch unless `--since` names one), the feature file there with the files changed…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - draft [features.draft](features.md#features.draft)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - graph [map.graph](map.md#map.graph)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - type [ChangedFiles](../../src/git-changes.ts#L24)
      <a id="features.git-changes.ChangedFiles"></a><br>Files changed since a ref. Paths are POSIX, relative to the root.
    - fn [gitIn](../../src/git-changes.ts#L34) (root: string, label: string) → { run: (args: string[]) => SpawnSyncReturns<string>; git: (args: string[]) => string } <!-- internal -->
      <a id="features.git-changes.gitIn"></a><br>A git runner for `root`; `label` names the caller in its errors (`check --changed`).
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [gitUnavailable](../../src/git-changes.ts#L50) (label: string, error: Error & { code?: string }) → string
      <a id="features.git-changes.gitUnavailable"></a><br>Why git did not run; a refusal (EPERM, EACCES) is most likely a sandbox, and says what still works.
    - fn [assertRef](../../src/git-changes.ts#L57) (ref: string, label: string) → void <!-- internal -->
      <a id="features.git-changes.assertRef"></a><br>A ref git would read as an option (`--output=…`) is refused: it is never passed on.
    - fn [diffArgs](../../src/git-changes.ts#L63) (base: string) → string[] <!-- internal -->
      <a id="features.git-changes.diffArgs"></a><br>Builds the fixed argument list for a `git diff` against a base ref: relative paths, no renames, zero context lines, no color or external diff, and `a/`/`b/` prefixes. Shared by [`features.git-changes.gitChangedFiles`](features.md#features.git-changes.gitChangedFiles) and [`features.git-changes.gitChangedLines`](features.md#features.git-changes.gitChangedLines) so both parse… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [untracked](../../src/git-changes.ts#L65) (git: (args: string[]) => string) → string[] <!-- internal -->
      <a id="features.git-changes.untracked"></a><br>Lists files in the working tree that git does not track and that are not ignored, by running `ls-files` with NUL-separated output and splitting it into a path array. Both [`features.git-changes.gitChangedFiles`](features.md#features.git-changes.gitChangedFiles) and [`features.git-changes.gitChangedLines`](features.md#features.git-changes.gitChangedLines) fold these into their… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [ownState](../../src/git-changes.ts#L75) (path: string) → boolean <!-- internal -->
      <a id="features.git-changes.ownState"></a><br>keylang's own local state under `.keylang/` — the index, the fact cache an analysis saves, proposals, reports — is never a source or a spec, so it is never a change, tracked or not, gitignored or not.
    - fn [gitChangedFiles](../../src/git-changes.ts#L78) (root: string, ref: string, label = "check --changed") → ChangedFiles
      <a id="features.git-changes.gitChangedFiles"></a><br>Files changed since `ref` in the working tree, plus files git does not track yet; keylang's own `.keylang/` left out.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.draft.deletedDiffPaths](features.md#features.draft.deletedDiffPaths), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.untracked](features.md#features.git-changes.untracked), [features.git-changes.ownState](features.md#features.git-changes.ownState), [features.git-changes.diskCaseResolver](features.md#features.git-changes.diskCaseResolver)
    - fn [diskCaseResolver](../../src/git-changes.ts#L105) (root: string) → (path: string) => string | null
      <a id="features.git-changes.diskCaseResolver"></a><br>Paths (POSIX, relative to `root`) as the disk spells them: each segment is matched against its directory's entries, exactly first, then without regard to case (and Unicode normalization, as macOS compares names); null when no file is there. Directories are read once per call.
    - fn [gitChangedLines](../../src/git-changes.ts#L134) (root: string, ref: string, label = "code-to-spec --since") → ChangedLines
      <a id="features.git-changes.gitChangedLines"></a><br>The lines changed since `ref` in the working tree, and the files git does not track yet (`all`), relative to `root`.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.git-changes.untracked](features.md#features.git-changes.untracked)
    - fn [changedPathSet](../../src/git-changes.ts#L143) (root: string, files: Iterable<string>, base: string) → Set<string>
      <a id="features.git-changes.changedPathSet"></a><br>Git paths are relative to `root`; check reports spec paths relative to `base`. Both forms match.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [gitFileAt](../../src/git-changes.ts#L157) (root: string, ref: string, path: string, label: string) → string | null
      <a id="features.git-changes.gitFileAt"></a><br>The text of `path` (POSIX, relative to `root`) at `ref`, or null when the file is not in that commit or `HEAD` has no commit yet. An unknown ref, no git, or no repository is an error naming the caller.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [readFeatureBase](../../src/git-changes.ts#L179) (root: string, path: string, since: string | undefined, label: string) → FeatureBase
      <a id="features.git-changes.readFeatureBase"></a><br>The feature file at its base commit, and the files changed since that commit as `check --changed --since <base>` reads them: a rule fail of this change is one that touches them. The base is `since`, else `featureBaseOrigin`.
      - calls [features.git-changes.featureBaseOrigin](features.md#features.git-changes.featureBaseOrigin), [features.git-changes.gitFileAt](features.md#features.git-changes.gitFileAt), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [base.span.compareText](base.md#base.span.compareText), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [featureBaseOrigin](../../src/git-changes.ts#L218) (root: string, label: string) → BaseOrigin
      <a id="features.git-changes.featureBaseOrigin"></a><br>The base `feature` judges a change against when no `since` is given: the merge-base of HEAD with the main branch, so a fail committed on a feature branch is still the change's own. The main branch is the one `refs/remotes/origin/HEAD` points at, else a local `main`, `master`…
      - calls [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [deletedModuleIds](../../src/git-changes.ts#L241) (config: Config, files: readonly string[]) → string[]
      <a id="features.git-changes.deletedModuleIds"></a><br>Module id a deleted source file had, so a flow step that named it is still "changed".
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
  - module [git-hook](../../src/git-hook.ts#L1)
    <a id="features.git-hook"></a><br>`keylang hook install`: the git pre-commit hook that runs `check --changed`. The hook file is keylang's as a whole, found by its marker; a hook without the marker belongs to someone else and is never rewritten.
    - node [external.node](external.md#external.node)
    - fn [preCommitCommand](../../src/git-hook.ts#L13) (version: string) → string
      <a id="features.git-hook.preCommitCommand"></a><br>What the hook runs: the published CLI of this version, as the harness hooks do.
    - fn [preCommitText](../../src/git-hook.ts#L22) (version: string, subdir = "") → string
      <a id="features.git-hook.preCommitText"></a><br>The whole hook file. `subdir` is the keylang root relative to the top of the work tree, POSIX, "" when they are the same: the hook enters it before `check --changed`, since git starts every hook at the top level.
      - calls [features.git-hook.preCommitCommand](features.md#features.git-hook.preCommitCommand)
    - type [PreCommitState](../../src/git-hook.ts#L34) = "missing" | "foreign" | "stale" | "current"
      <a id="features.git-hook.PreCommitState"></a><br>`missing`: no file; `foreign`: a hook without keylang's marker; `stale`: keylang's, but other text or not executable.
    - fn [preCommitState](../../src/git-hook.ts#L36) (current: string | null, executable: boolean, version: string, subdir = "") → PreCommitState
      <a id="features.git-hook.preCommitState"></a><br>Classifies an existing pre-commit hook as "missing" when absent, "foreign" when it lacks the keylang marker, "current" when it matches the output of [`features.git-hook.preCommitText`](features.md#features.git-hook.preCommitText) for the given version and is executable, otherwise "stale". _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.git-hook.preCommitText](features.md#features.git-hook.preCommitText)
    - fn [gitHooksDir](../../src/git-hook.ts#L48) (cwd: string) → string
      <a id="features.git-hook.gitHooksDir"></a><br>The hooks directory git uses for the repository around `cwd`, absolute: `git rev-parse --git-path hooks` honours `core.hooksPath` and linked worktrees. It is asked from the top level, where a relative `core.hooksPath` is resolved.
      - calls [features.git-hook.gitTopLevel](features.md#features.git-hook.gitTopLevel), [features.git-hook.git](features.md#features.git-hook.git)
    - fn [gitTopLevel](../../src/git-hook.ts#L54) (cwd: string) → string
      <a id="features.git-hook.gitTopLevel"></a><br>The top of the work tree around `cwd`, absolute. Throws outside a git work tree.
      - calls [features.git-hook.git](features.md#features.git-hook.git)
    - fn [git](../../src/git-hook.ts#L58) (cwd: string, args: string[]) → string <!-- internal -->
      <a id="features.git-hook.git"></a><br>Runs a git command synchronously in the given directory and returns its trimmed stdout, throwing a hook-install error if git can't launch or exits non-zero; used by [`features.git-hook.gitHooksDir`](features.md#features.git-hook.gitHooksDir). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
  - module [harness](../../src/harness.ts#L1)
    <a id="features.harness"></a><br>Harness adapters: one pure merge from the files on disk and the selected harnesses to the next text. Markdown keeps a marked block; JSON replaces only the `keylang` key; TOML splices only the `[mcp_servers.keylang]` table, so comments and layout around it stay. `--agents=none`…
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - config [base.config](base.md#base.config)
    - imports [map.imports](map.md#map.imports)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - fn [skillFile](../../src/harness.ts#L36) () → string
      <a id="features.harness.skillFile"></a><br>The skill shipped in the package. The same relative path works from `src` and from `dist`.
    - type [HarnessName](../../src/harness.ts#L41) = (typeof HARNESS_NAMES)[number]
      <a id="features.harness.HarnessName"></a><br>A string union type derived from the entries of the `HARNESS_NAMES` array, so values are constrained to the harness identifiers listed there. Used to type-check which harness a feature refers to without duplicating the list. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [denyRules](../../src/harness.ts#L60) (dir: string) → string[] <!-- internal -->
      <a id="features.harness.denyRules"></a><br>Claude's deny entries that keep an agent from editing the rules of the spec directory `dir`, or deciding a proposal.
    - fn [specDir](../../src/harness.ts#L65) (root: string) → string <!-- internal -->
      <a id="features.harness.specDir"></a><br>The spec directory of `keylang.json` under `root` (`dir`, normalized), or `keylang` without the file. A broken file throws, naming the file and the field.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig)
    - type [HarnessSelection](../../src/harness.ts#L74)
      <a id="features.harness.HarnessSelection"></a><br>Carries the resolved set of agent harnesses chosen by the user as `HarnessName` values, plus a flag that disables the instruction block and adapter file emission when `--agents=none` is given. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [HarnessFile](../../src/harness.ts#L80)
      <a id="features.harness.HarnessFile"></a><br>Describes one file in a test harness as a path plus its full contents, where a null `text` marks a file that must not exist. Used to declare or verify the expected state of files on disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [HarnessPlan](../../src/harness.ts#L86)
      <a id="features.harness.HarnessPlan"></a><br>Describes the outcome of assembling a harness: the list of `HarnessFile` entries to write, plus either `null` or a single failure record naming the offending file and the reason it could not be prepared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseAgents](../../src/harness.ts#L92) (value: string) → HarnessSelection
      <a id="features.harness.parseAgents"></a><br>`--agents=<list>`. `none` is the empty selection. An unknown name throws and lists the allowed names.
    - type [HarnessProbe](../../src/harness.ts#L106)
      <a id="features.harness.HarnessProbe"></a><br>What is on disk for harness detection. `list` returns child names, or null when the path is not a directory.
    - fn [detectHarnesses](../../src/harness.ts#L116) (probe: HarnessProbe) → HarnessName[]
      <a id="features.harness.detectHarnesses"></a><br>Directories and files that mean a harness is already in use. Order matches `HARNESS_NAMES`. `.claude/skills/keylang-feature` is the copy `agents` writes for every harness, so that tree alone is not Claude.
      - calls [features.harness.claudePresent](features.md#features.harness.claudePresent)
    - fn [claudePresent](../../src/harness.ts#L127) (probe: HarnessProbe) → boolean <!-- internal -->
      <a id="features.harness.claudePresent"></a><br>Decides whether the Claude harness is in use by listing the `.claude` directory via the probe: missing means no, empty means yes, otherwise it defers to [`features.harness.claudeHasUserFile`](features.md#features.harness.claudeHasUserFile) to check for user-authored files. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.harness.claudeHasUserFile](features.md#features.harness.claudeHasUserFile)
    - fn [claudeHasUserFile](../../src/harness.ts#L135) (probe: HarnessProbe, dir: string) → boolean <!-- internal -->
      <a id="features.harness.claudeHasUserFile"></a><br>A file under `.claude` that is not the keylang skill copy.
    - fn [agentsBody](../../src/harness.ts#L149) (version: string, dir: string) → string
      <a id="features.harness.agentsBody"></a><br>The instruction body between the markers, without a trailing newline. The CLI fallback pins `version`; paths are under the spec directory `dir`.
      - calls [features.harness.cliCommand](features.md#features.harness.cliCommand)
    - fn [mcpCommand](../../src/harness.ts#L185) (version: string) → { command: string; args: string[] }
      <a id="features.harness.mcpCommand"></a><br>`npx -y keylang@<version> mcp`, split the way MCP configs store a command.
    - fn [cliCommand](../../src/harness.ts#L190) (version: string) → string
      <a id="features.harness.cliCommand"></a><br>The pinned CLI the fallback names: the same package and version as the MCP server, so it needs no global `keylang`.
    - fn [pinSkill](../../src/harness.ts#L199) (skill: string, version: string, dir: string) → string
      <a id="features.harness.pinSkill"></a><br>The skill resource names the CLI as `npx -y keylang@<version>` and the spec directory as `<dir>/`; the copy a harness gets pins the running version and the repository's `dir`.
    - fn [hookCommand](../../src/harness.ts#L204) (version: string) → string
      <a id="features.harness.hookCommand"></a><br>What the Stop hook runs.
      - calls [features.harness.cliCommand](features.md#features.harness.cliCommand)
    - fn [planHarness](../../src/harness.ts#L214) (input: { selection: HarnessSelection; version: string; dir: string; skill: string; files: ReadonlyMap<string, string | null> }) → HarnessPlan
      <a id="features.harness.planHarness"></a><br>Desired text of every harness file this selection owns. `files` holds the current text, null when the file is absent; `dir` is the spec directory the instructions, the skill and the deny rules name. The first broken marker or invalid JSON/TOML is `error` and `files` is empty…
      - calls [features.harness.agentsBody](features.md#features.harness.agentsBody), [features.harness.mergeMarked](features.md#features.harness.mergeMarked), [features.harness.mergeClaude](features.md#features.harness.mergeClaude), [features.harness.mergeMcpJson](features.md#features.harness.mergeMcpJson), [features.harness.mergeCodexToml](features.md#features.harness.mergeCodexToml), [features.harness.opencodeFile](features.md#features.harness.opencodeFile), [features.harness.mergeOpencode](features.md#features.harness.mergeOpencode), [features.harness.pinSkill](features.md#features.harness.pinSkill), [features.harness.mergeSettings](features.md#features.harness.mergeSettings), [features.harness.mergeHooksFile](features.md#features.harness.mergeHooksFile)
    - fn [mergeMarked](../../src/harness.ts#L298) (existing: string | null, body: string | null) → { text: string | null } | { error: string }
      <a id="features.harness.mergeMarked"></a><br>Splice `body` between the markers. Text outside them is copied byte for byte. `body` null removes the block.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [features.harness.marked](features.md#features.harness.marked)
    - fn [marked](../../src/harness.ts#L324) (body: string, nl: "\n" | "\r\n") → string <!-- internal -->
      <a id="features.harness.marked"></a><br>Normalizes every line break in the body to the requested newline style, then wraps the result between the begin and end marker constants on their own lines, so [`features.harness.mergeMarked`](features.md#features.harness.mergeMarked) can splice a consistently delimited block into existing text. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [mergeClaude](../../src/harness.ts#L333) (existing: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeClaude"></a><br>`@AGENTS.md` lives in the managed block. A file that already says it outside the block is left without a second copy (the block is removed).
      - calls [features.harness.outsideMarkers](features.md#features.harness.outsideMarkers), [features.harness.mergeMarked](features.md#features.harness.mergeMarked)
    - fn [outsideMarkers](../../src/harness.ts#L340) (existing: string | null) → string | { error: string } <!-- internal -->
      <a id="features.harness.outsideMarkers"></a><br>Strips the block between the begin/end marker constants out of an existing file's text, returning the surrounding content (or an empty string for null input). Reports an error object when only one marker is present or the end precedes the begin, so… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [mergeMcpJson](../../src/harness.ts#L350) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeMcpJson"></a><br>Rewrites an `.mcp.json` document so its `mcpServers` key holds the launch entry built by [`features.harness.mcpCommand`](features.md#features.harness.mcpCommand) for the given version, or removes it when the version is null, via [`features.harness.mergeJsonKey`](features.md#features.harness.mergeJsonKey). Returns the updated text or a parse error for… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [mergeOpencode](../../src/harness.ts#L355) (existing: string | null, version: string | null, jsonc: boolean) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeOpencode"></a><br>`jsonc`: the file is `opencode.jsonc`, so comments and trailing commas parse; a rewrite is still plain JSON.
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey)
    - fn [mergeCodexToml](../../src/harness.ts#L381) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeCodexToml"></a><br>The whole file is parsed (invalid TOML is an error, and the entry's own keys come from the parse), but only the lines of the `[mcp_servers.keylang]` table — header to the next header, its sub-tables included — are replaced, removed or appended, so the person's comments and…
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.codexTableRegion](features.md#features.harness.codexTableRegion), [features.harness.rewriteCodexToml](features.md#features.harness.rewriteCodexToml), [features.harness.withoutLines](features.md#features.harness.withoutLines), [features.harness.codexEntryIs](features.md#features.harness.codexEntryIs), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [codexTableRegion](../../src/harness.ts#L419) (lines: readonly string[]) → { start: number; end: number } | null <!-- internal -->
      <a id="features.harness.codexTableRegion"></a><br>Lines `[start, end)` of the `[mcp_servers.keylang]` table and its sub-tables, or null without the header.
    - fn [withoutLines](../../src/harness.ts#L428) (lines: readonly string[], region: { start: number; end: number }) → string[] <!-- internal -->
      <a id="features.harness.withoutLines"></a><br>The lines without `[start, end)`; a blank line the removal left doubled (or last) goes with them.
    - fn [codexEntryIs](../../src/harness.ts#L439) (text: string, entry: Record<string, unknown> | undefined) → boolean <!-- internal -->
      <a id="features.harness.codexEntryIs"></a><br>Whether `text` parses and its `mcp_servers.keylang` is exactly `entry` (undefined: absent).
      - calls [features.harness.isRecord](features.md#features.harness.isRecord)
    - fn [rewriteCodexToml](../../src/harness.ts#L451) (data: Record<string, unknown>, entry: Record<string, unknown> | null) → { text: string | null } <!-- internal -->
      <a id="features.harness.rewriteCodexToml"></a><br>The whole file re-serialized with `entry` as the keylang server (null: without one); empty data is no file.
    - fn [mergeSettings](../../src/harness.ts#L462) (existing: string | null, version: string | null, dir: string) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeSettings"></a><br>Parses an existing settings JSON via [`features.harness.parseObject`](features.md#features.harness.parseObject), updates its permission deny list ([`features.harness.mergeDeny`](features.md#features.harness.mergeDeny)) and hooks ([`features.harness.mergeHooksValue`](features.md#features.harness.mergeHooksValue)), dropping emptied keys, and serializes via [`features.harness.finishJson`](features.md#features.harness.finishJson); any error short-circuits. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.holdsKeylangSettings](features.md#features.harness.holdsKeylangSettings), [features.harness.mergeDeny](features.md#features.harness.mergeDeny), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeHooksFile](../../src/harness.ts#L478) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksFile"></a><br>Parses existing JSON text via [`features.harness.parseObject`](features.md#features.harness.parseObject), merges its `hooks` key using [`features.harness.mergeHooksValue`](features.md#features.harness.mergeHooksValue) (removing it when undefined), and serializes via [`features.harness.finishJson`](features.md#features.harness.finishJson), passing errors through. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.holdsOurHook](features.md#features.harness.holdsOurHook), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeDeny](../../src/harness.ts#L495) (permissions: unknown, install: boolean, dir: string) → { value: unknown } | { error: string } <!-- internal -->
      <a id="features.harness.mergeDeny"></a><br>keylang's deny entries for the spec directory `dir` are added (`install`) or removed. Its entries for the default directory are keylang's too: they go once `dir` is another one, so a changed `dir` leaves no stale entry behind.
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.denyRules](features.md#features.harness.denyRules)
    - fn [mergeHooksValue](../../src/harness.ts#L511) (hooks: unknown, version: string | null) → { value: unknown } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksValue"></a><br>Validates a hooks object and rewrites its Stop groups via [`features.harness.rewriteGroup`](features.md#features.harness.rewriteGroup), appending the versioned [`features.harness.hookCommand`](features.md#features.harness.hookCommand) if missing and pruning empty groups, returning undefined when nothing remains. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.rewriteGroup](features.md#features.harness.rewriteGroup), [features.harness.hookCommand](features.md#features.harness.hookCommand), [features.harness.emptyGroup](features.md#features.harness.emptyGroup)
    - fn [rewriteGroup](../../src/harness.ts#L530) (group: unknown, version: string | null) → Record<string, unknown> | { error: string } <!-- internal -->
      <a id="features.harness.rewriteGroup"></a><br>Validates one hooks.Stop group and rebuilds its hook list, replacing commands matched by [`features.harness.isOurHook`](features.md#features.harness.isOurHook) with [`features.harness.hookCommand`](features.md#features.harness.hookCommand) output, or dropping them when version is null. Returns an error object for malformed entries. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.isOurHook](features.md#features.harness.isOurHook), [features.harness.hookCommand](features.md#features.harness.hookCommand)
    - fn [emptyGroup](../../src/harness.ts#L546) (group: Record<string, unknown>) → boolean <!-- internal -->
      <a id="features.harness.emptyGroup"></a><br>Returns true when the object's `hooks` is an empty array and it has no keys besides `hooks` and `matcher`. [`features.harness.mergeHooksValue`](features.md#features.harness.mergeHooksValue) uses it to detect hook groups that carry no handlers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isOurHook](../../src/harness.ts#L550) (command: string) → boolean <!-- internal -->
      <a id="features.harness.isOurHook"></a><br>Tests a hook command string against a regex matching `keylang hook stop` with an optional `@version` suffix, returning whether it is one of our own stop hooks; [`features.harness.rewriteGroup`](features.md#features.harness.rewriteGroup) uses it to filter hook entries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [holdsKeylangSettings](../../src/harness.ts#L555) (data: Record<string, unknown>, dir: string) → boolean <!-- internal -->
      <a id="features.harness.holdsKeylangSettings"></a><br>Whether Claude's settings hold anything of keylang's: a deny rule of the spec directory `dir` (or of the default one), or the Stop hook.
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.denyRules](features.md#features.harness.denyRules), [features.harness.holdsOurHook](features.md#features.harness.holdsOurHook)
    - fn [holdsOurHook](../../src/harness.ts#L562) (hooks: unknown) → boolean <!-- internal -->
      <a id="features.harness.holdsOurHook"></a>
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.isOurHook](features.md#features.harness.isOurHook)
    - fn [mergeJsonKey](../../src/harness.ts#L567) (existing: string | null, path: readonly string[], server: unknown, jsonc = false) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeJsonKey"></a><br>Parses the config text via [`features.harness.parseObject`](features.md#features.harness.parseObject), then sets or removes the `keylang` entry inside the nested object at the first path key, dropping that key when it becomes empty. Rejects a non-object value there and re-serializes with [`features.harness.finishJson`](features.md#features.harness.finishJson). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [parseObject](../../src/harness.ts#L584) (existing: string | null, jsonc = false) → { value: Record<string, unknown> } | { error: string } <!-- internal -->
      <a id="features.harness.parseObject"></a><br>The object in a JSON file; with `jsonc`, comments and trailing commas are allowed (`opencode.jsonc`).
      - calls [map.imports.parseJsoncStrict](map.md#map.imports.parseJsoncStrict), [features.harness.isRecord](features.md#features.harness.isRecord)
    - fn [finishJson](../../src/harness.ts#L595) (data: Record<string, unknown>) → { text: string | null } <!-- internal -->
      <a id="features.harness.finishJson"></a><br>Serializes a merged config object into pretty-printed JSON with a trailing newline, or yields `null` when the object is empty so callers like [`features.harness.mergeSettings`](features.md#features.harness.mergeSettings) can skip writing the file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [opencodeFile](../../src/harness.ts#L600) (files: ReadonlyMap<string, string | null>) → string <!-- internal -->
      <a id="features.harness.opencodeFile"></a><br>Picks which OpenCode config filename to target: returns `opencode.json` if that entry exists with non-null content in the map, else `opencode.jsonc` if that one does, otherwise defaults to `opencode.json`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isRecord](../../src/harness.ts#L606) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.harness.isRecord"></a><br>Type guard that returns true only for non-null objects that are not arrays, narrowing the value to a string-keyed record. Used by [`features.harness.parseObject`](features.md#features.harness.parseObject), [`features.harness.mergeDeny`](features.md#features.harness.mergeDeny) and the other merge helpers to validate parsed config shapes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [HarnessChoice](../../src/harness.ts#L613) = "auto" | "none" | readonly HarnessName[]
      <a id="features.harness.HarnessChoice"></a><br>Which harnesses: detected from the disk, none (strip keylang's files), or a named, non-empty list.
    - fn [harnessChoice](../../src/harness.ts#L616) (flag: string | undefined) → HarnessChoice
      <a id="features.harness.harnessChoice"></a><br>`--agents=<list>` as a choice; left out, the harnesses are detected. Throws as `parseAgents` does.
      - calls [features.harness.parseAgents](features.md#features.harness.parseAgents)
    - fn [keylangVersion](../../src/harness.ts#L623) () → string
      <a id="features.harness.keylangVersion"></a><br>The version the MCP command and the Stop hook pin: the running keylang's `package.json`, from `src` and from `dist`.
    - type [HarnessCategory](../../src/harness.ts#L628) = "instructions" | "mcp" | "skill" | "settings" | "hooks"
      <a id="features.harness.HarnessCategory"></a><br>What a harness file is for, as a step before the write names it.
    - fn [harnessCategory](../../src/harness.ts#L630) (path: string) → HarnessCategory
      <a id="features.harness.harnessCategory"></a><br>Maps a harness file path to its category: root `AGENTS.md`/`CLAUDE.md` become instructions, the skill constants map to skill, specific `.claude`/`.codex` files map to settings or hooks, and anything else falls back to mcp. Used by [`features.harness.planAgents`](features.md#features.harness.planAgents) to group planned… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [diskProbe](../../src/harness.ts#L639) (root: string) → HarnessProbe
      <a id="features.harness.diskProbe"></a><br>The probe of the real disk: `.claude` and the other harness directories are directories; opencode is a file.
    - fn [resolveChoice](../../src/harness.ts#L660) (choice: HarnessChoice, probe: HarnessProbe) → HarnessSelection
      <a id="features.harness.resolveChoice"></a><br>The selection a choice resolves to on this disk: `auto` keeps the instruction block even when nothing is detected; `none` has none.
      - calls [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses)
    - type [HarnessTarget](../../src/harness.ts#L670)
      <a id="features.harness.HarnessTarget"></a><br>One file of the plan: the text it should hold (null: absent) against what is there now.
    - type [AgentsPlan](../../src/harness.ts#L682)
      <a id="features.harness.AgentsPlan"></a><br>What `keylang agents` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planAgents](../../src/harness.ts#L698) (root: string, choice: HarnessChoice) → AgentsPlan
      <a id="features.harness.planAgents"></a><br>Plans the harness files of `choice` against the disk under `root`. Reads, writes nothing; throws on a read error or a broken keylang.json.
      - calls [features.harness.resolveChoice](features.md#features.harness.resolveChoice), [features.harness.diskProbe](features.md#features.harness.diskProbe), [features.harness.specDir](features.md#features.harness.specDir), [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.skillFile](features.md#features.harness.skillFile), [features.harness.keylangVersion](features.md#features.harness.keylangVersion), [features.harness.planHarness](features.md#features.harness.planHarness), [features.harness.harnessCategory](features.md#features.harness.harnessCategory)
    - fn [readInputs](../../src/harness.ts#L714) (root: string) → Map<string, string | null> <!-- internal -->
      <a id="features.harness.readInputs"></a><br>Reads every file listed in `HARNESS_PATHS` relative to the given root, mapping each path to its UTF-8 contents or null when the file is absent. Used by [`features.harness.planAgents`](features.md#features.harness.planAgents) and [`features.harness.agentsPlanProblems`](features.md#features.harness.agentsPlanProblems) to inspect existing harness files. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [agentsPlanProblems](../../src/harness.ts#L726) (plan: AgentsPlan) → string[]
      <a id="features.harness.agentsPlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): every harness path must still hold the bytes the plan read, keylang.json must still name the same spec directory, a target must pass the repository's write rules (a removal too: the entry must be…
      - calls [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.specDir](features.md#features.harness.specDir), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses), [features.harness.diskProbe](features.md#features.harness.diskProbe)
    - type [HarnessStep](../../src/harness.ts#L753)
      <a id="features.harness.HarnessStep"></a><br>One file step of a commit, with what became of it.
    - fn [commitAgents](../../src/harness.ts#L770) ( plan: AgentsPlan, options: { signal?: AbortSignal; onStep?: (step: { path: string; action: "write" | "remove" }) => void } = {}, ) → Promise<{ steps: HarnessStep[]; outcome: "completed" | "failed" | "cancelled" }>
      <a id="features.harness.commitAgents"></a><br>Writes and removes the changed targets one by one, in plan order. A write is atomic at the target (a link inside the repository is followed; CRLF of the old file kept); a removal removes the entry itself, and only when the entry is inside the repository with links followed — a…
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
  - module [integrations](../../src/integrations.ts#L1)
    <a id="features.integrations"></a><br>`keylang integrations` (business-flows/14): what the repository talks to, the first thing to know before a migration. A view over the snapshot (ADR 0014), no verdict and no network: outgoing calls into the HTTP, SOAP, SDK and queue clients `resources/integrations.json` lists…
    - node [external.node](external.md#external.node)
    - call-sites [features.call-sites](features.md#features.call-sites)
    - config [base.config](base.md#base.config)
    - discover [features.discover](features.md#features.discover)
    - glob [base.glob](base.md#base.glob)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [IntegrationKind](../../src/integrations.ts#L19) = "http" | "soap" | "sdk" | "payment" | "queue"
      <a id="features.integrations.IntegrationKind"></a>
    - type [IntegrationClient](../../src/integrations.ts#L22) extends Matcher
      <a id="features.integrations.IntegrationClient"></a><br>One client the data file names.
    - type [Reach](../../src/integrations.ts#L29)
      <a id="features.integrations.Reach"></a><br>An entry point that reaches a call site, with the flow that starts from it.
    - type [IntegrationSite](../../src/integrations.ts#L37)
      <a id="features.integrations.IntegrationSite"></a>
    - type [Integration](../../src/integrations.ts#L51)
      <a id="features.integrations.Integration"></a>
    - type [Webhook](../../src/integrations.ts#L61)
      <a id="features.integrations.Webhook"></a>
    - type [IntegrationsReport](../../src/integrations.ts#L73)
      <a id="features.integrations.IntegrationsReport"></a>
    - fn [loadIntegrations](../../src/integrations.ts#L90) (path = resourcePath("integrations.json")) → IntegrationClient[]
      <a id="features.integrations.loadIntegrations"></a><br>`resources/integrations.json`.
      - calls [features.call-sites.resourcePath](features.md#features.call-sites.resourcePath)
    - fn [routePath](../../src/integrations.ts#L105) (label: string) → string <!-- internal -->
      <a id="features.integrations.routePath"></a><br>The path of a route label (`POST /stripe/webhook` → `/stripe/webhook`).
    - fn [findWebhooks](../../src/integrations.ts#L110) (snapshot: AnalysisSnapshot, globs: readonly string[]) → Webhook[]
      <a id="features.integrations.findWebhooks"></a><br>Incoming webhooks: entries of kind webhook, routes whose path names one, and what `integrations.webhooks` names.
      - calls [base.glob.firstMatchingGlob](base.md#base.glob.firstMatchingGlob), [features.integrations.routePath](features.md#features.integrations.routePath), [base.span.compareText](base.md#base.span.compareText)
    - fn [findIntegrations](../../src/integrations.ts#L137) (config: Config, snapshot: AnalysisSnapshot, clients: readonly IntegrationClient[], specified: ReadonlyMap<string, { file: string; flow: string }>) → Promise<IntegrationsReport>
      <a id="features.integrations.findIntegrations"></a><br>The report. `specified`: the triggers of hand-written flows, by trigger, with the flow's name. Reads the analysed files' facts and, at each matched call, the source text for its first arguments.
      - calls [features.call-sites.callsOf](features.md#features.call-sites.callsOf), [features.call-sites.snapshotFacts](features.md#features.call-sites.snapshotFacts), [features.call-sites.internalCallPositions](features.md#features.call-sites.internalCallPositions), [features.call-sites.sourceReader](features.md#features.call-sites.sourceReader), [features.call-sites.callGraph](features.md#features.call-sites.callGraph), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.call-sites.compileMatcher](features.md#features.call-sites.compileMatcher), [features.call-sites.importMatches](features.md#features.call-sites.importMatches), [features.call-sites.callMatches](features.md#features.call-sites.callMatches), [features.call-sites.urlOf](features.md#features.call-sites.urlOf), [features.call-sites.literalArgument](features.md#features.call-sites.literalArgument), [base.span.compareText](base.md#base.span.compareText), [features.integrations.findWebhooks](features.md#features.integrations.findWebhooks)
    - fn [integrationsText](../../src/integrations.ts#L213) (report: IntegrationsReport) → string
      <a id="features.integrations.integrationsText"></a><br>What `keylang integrations` prints.
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
      <a id="features.llm.LlmRequest"></a><br>Shape of a single call to a language model: a system instruction, the user prompt text, and an upper bound on tokens in the reply. It carries data only, with no behaviour of its own. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LlmCallOptions](../../src/llm.ts#L34)
      <a id="features.llm.LlmCallOptions"></a><br>Per call: `signal` cancels the request (and its stream); `timeoutMs` bounds it tighter than `KEYLANG_LLM_TIMEOUT_MS`. Without options a call ends by its answer or the timeout.
    - type [LlmClientOptions](../../src/llm.ts#L45)
      <a id="features.llm.LlmClientOptions"></a><br>Where a client runs: `root` is the repository (the working directory of an agent CLI); `env` and `home` default to the process's own.
    - type [LlmClient](../../src/llm.ts#L51)
      <a id="features.llm.LlmClient"></a><br>Contract for a configured language-model backend: it exposes the agent and model identifiers, an optional CLI binary path, and a method that sends an `LlmRequest` with optional `LlmCallOptions` and resolves to the completion text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [LlmCancelled](../../src/llm.ts#L61)
      <a id="features.llm.LlmCancelled"></a><br>The caller cancelled the request: not a timeout, not a provider error, and no partial answer.
      - fn [constructor](../../src/llm.ts#L62) (provider: string)
        <a id="features.llm.LlmCancelled.constructor"></a><br>Builds the error message as the provider name followed by ": cancelled", passes it to the parent `Error`, and sets the error's `name` to "LlmCancelled" so callers can identify a cancelled LLM request. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isCancelled](../../src/llm.ts#L69) (error: unknown) → error is LlmCancelled
      <a id="features.llm.isCancelled"></a><br>The error of a request its caller cancelled.
    - type [LlmSetup](../../src/llm.ts#L73) = { client: LlmClient } | { missing: string }
      <a id="features.llm.LlmSetup"></a><br>Discriminated union for the outcome of configuring the LLM: either a ready-to-use client, or a string naming what configuration is missing. Callers narrow on which key is present to decide whether LLM features are available. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Env](../../src/llm.ts#L75) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.llm.Env"></a><br>A read-only map of string keys to optional string values, shaped like `process.env`, used by the LLM configuration code to look up settings such as API keys and model names without mutating the real environment. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [llmClient](../../src/llm.ts#L87) (configAgent: string | null, options: LlmClientOptions) → LlmSetup
      <a id="features.llm.llmClient"></a><br>The client of the effective agent: `configAgent` is keylang.json's, which `KEYLANG_AGENT` and agents.json "use" override. An invalid variable or agents.json throws, naming it; a missing key or binary is `missing`.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent), [features.llm.timeoutMs](features.md#features.llm.timeoutMs), [base.config.isCliAgent](base.md#base.config.isCliAgent), [features.agent-cli.cliClient](features.md#features.agent-cli.cliClient), [features.llm.deadline](features.md#features.llm.deadline), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.keys.readKey](features.md#features.keys.readKey), [features.llm.anthropicComplete](features.md#features.llm.anthropicComplete), [features.llm.openrouterComplete](features.md#features.llm.openrouterComplete)
    - fn [answeringAgent](../../src/llm.ts#L136) (client: LlmClient, reported: string | null) → string
      <a id="features.llm.answeringAgent"></a><br>The agent an answer is signed with: `cli:claude` becomes `cli:claude:<model>` when the CLI reported the model; an agent that names its model stays as configured.
    - fn [timeoutMs](../../src/llm.ts#L144) (env: Env) → number | string <!-- internal -->
      <a id="features.llm.timeoutMs"></a><br>`KEYLANG_LLM_TIMEOUT_MS`, a positive whole number of milliseconds a timer can hold; the reason when it is not one.
    - type [Deadline](../../src/llm.ts#L153) <!-- internal -->
      <a id="features.llm.Deadline"></a><br>A call's bound: the variable's, or the call's own when that is tighter; `fromVariable` decides whether the timeout message cites the variable.
    - fn [deadline](../../src/llm.ts#L158) (variable: number, own: number | undefined) → Deadline <!-- internal -->
      <a id="features.llm.deadline"></a><br>Picks the effective timeout by returning the caller-specific value when it is set and smaller than the environment-derived one, otherwise the environment value, tagging which source won. Used by [`features.llm.llmClient`](features.md#features.llm.llmClient) to build the request deadline. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [timeoutMessage](../../src/llm.ts#L162) (provider: string, bound: Deadline) → string <!-- internal -->
      <a id="features.llm.timeoutMessage"></a><br>Builds the error text used when an LLM call exceeds its deadline, naming the provider and the millisecond limit from `bound`. Appends a note that the limit came from the `KEYLANG_LLM_TIMEOUT_MS` environment variable when `bound.fromVariable` is set. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [truncatedMessage](../../src/llm.ts#L167) (model: string, reason: "max_tokens" | "length") → string <!-- internal -->
      <a id="features.llm.truncatedMessage"></a><br>The provider stopped the answer at the token limit (`stop_reason: max_tokens`, `finish_reason: length`): what came is not an answer.
    - fn [callSignal](../../src/llm.ts#L176) (timeout: number, outer: AbortSignal | undefined) → { signal: AbortSignal; timedOut: () => boolean; cancelled: () => boolean; dispose: () => void } <!-- internal -->
      <a id="features.llm.callSignal"></a><br>One signal for a whole call: aborted by the deadline or by the caller's signal, whichever comes first; `dispose` clears the timer and the listener on the caller's signal, so a long-lived signal does not collect them.
    - fn [anthropicComplete](../../src/llm.ts#L200) (client: Anthropic, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.anthropicComplete"></a><br>Sends one user prompt to the Anthropic messages API under a deadline built by [`features.llm.callSignal`](features.md#features.llm.callSignal), enabling server-side fallbacks for matching models, and raises [`features.llm.LlmCancelled`](features.md#features.llm.LlmCancelled) or a timeout from [`features.llm.timeoutMessage`](features.md#features.llm.timeoutMessage) on abort. It then returns the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage), [features.llm.truncatedMessage](features.md#features.llm.truncatedMessage)
    - fn [openrouterComplete](../../src/llm.ts#L236) (base: string, key: string, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.openrouterComplete"></a><br>Streams a chat completion from an OpenRouter-compatible endpoint under one deadline from [`features.llm.callSignal`](features.md#features.llm.callSignal), accumulating SSE deltas or reading a plain JSON reply via [`features.llm.parseJson`](features.md#features.llm.parseJson). Empty or erroring answers become errors; cancellation raises… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.parseJson](features.md#features.llm.parseJson), [features.llm.truncatedMessage](features.md#features.llm.truncatedMessage), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage)
    - fn [parseJson](../../src/llm.ts#L298) (text: string) → unknown <!-- internal -->
      <a id="features.llm.parseJson"></a><br>Wraps `JSON.parse` so malformed input yields `undefined` instead of throwing, letting [`features.llm.openrouterComplete`](features.md#features.llm.openrouterComplete) safely probe OpenRouter response bodies for JSON. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
    - type [LspPosition](../../src/lsp-features.ts#L25)
      <a id="features.lsp-features.LspPosition"></a><br>Describes a location in a text document as a zero-based line index paired with a character offset within that line, mirroring the position shape used in LSP requests and responses. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LspRange](../../src/lsp-features.ts#L30)
      <a id="features.lsp-features.LspRange"></a><br>Describes a span of text in a document as a pair of positions, each holding a line and character offset, marking where the span begins and ends. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Location](../../src/lsp-features.ts#L35)
      <a id="features.lsp-features.Location"></a><br>Pairs a document `uri` string with an `LspRange` to pinpoint a span of text in a specific file, used as the result shape for navigation features like go-to-definition and find-references. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Workspace](../../src/lsp-features.ts#L41)
      <a id="features.lsp-features.Workspace"></a><br>What features read: the analysis, the root, and the text of any document.
    - fn [workspace](../../src/lsp-features.ts#L48) (root: string, analysis: Analysis, buffers: ReadonlyMap<string, string>) → Workspace
      <a id="features.lsp-features.workspace"></a><br>Builds an editor view of an analysis, reparsing generated map docs with [`lang.parser.parse`](lang.md#lang.parser.parse) when an open buffer differs from the fresh render. Its text lookup prefers open buffers, then rendered map content, then disk. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.config.specPath](base.md#base.config.specPath), [lang.parser.parse](lang.md#lang.parser.parse), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [lineStarts](../../src/lsp-features.ts#L83) (text: string) → number[] <!-- internal -->
      <a id="features.lsp-features.lineStarts"></a><br>Scans the text once and returns the character offsets at which each line begins, treating only `\n` (code 10) as a line break and always including offset 0. [`features.lsp-features.toOffset`](features.md#features.lsp-features.toOffset) uses this table to convert an LSP line/character position into a flat string index. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [lspPoint](../../src/lsp-features.ts#L93) (text: string | null, line: number, col: number) → LspPosition <!-- internal -->
      <a id="features.lsp-features.lspPoint"></a><br>A 1-based line and column in code points — the unit of IR spans and of snapshot positions in code alike — as an LSP position (UTF-16).
    - fn [fromPos](../../src/lsp-features.ts#L99) (text: string | null, pos: Pos) → LspPosition <!-- internal -->
      <a id="features.lsp-features.fromPos"></a><br>Converts a keylang position (1-based line, column in code points) into a 0-based LSP position by delegating to [`features.lsp-features.lspPoint`](features.md#features.lsp-features.lspPoint), which turns the column into UTF-16 units using the line's text when the document text is known. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - fn [fromSpan](../../src/lsp-features.ts#L103) (text: string | null, span: Span) → LspRange <!-- internal -->
      <a id="features.lsp-features.fromSpan"></a><br>Converts a source span into an LSP range by mapping its start and end offsets through [`features.lsp-features.fromPos`](features.md#features.lsp-features.fromPos), using the document text for line/column resolution. Shared by diagnostics, symbols, hover, and references. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos)
    - fn [lineRange](../../src/lsp-features.ts#L108) (text: string | null, line: number, col: number) → LspRange <!-- internal -->
      <a id="features.lsp-features.lineRange"></a><br>A 1-based line and a column in code points, to the end of that line.
    - fn [toOffset](../../src/lsp-features.ts#L114) (text: string, position: LspPosition) → number <!-- internal -->
      <a id="features.lsp-features.toOffset"></a><br>Converts an LSP line/character position into an absolute character offset by looking up the line's start in [`features.lsp-features.lineStarts`](features.md#features.lsp-features.lineStarts) and adding the character index; a line past the end falls back to the text length. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.lsp-features.lineStarts](features.md#features.lsp-features.lineStarts)
    - fn [uriOf](../../src/lsp-features.ts#L118) (root: string, path: string) → string <!-- internal -->
      <a id="features.lsp-features.uriOf"></a><br>Resolves a workspace-relative path against the root directory and converts the absolute result into a `file://` URL string. Used by [`features.lsp-features.definition`](features.md#features.lsp-features.definition), [`features.lsp-features.references`](features.md#features.lsp-features.references), and [`features.lsp-features.symbolLocation`](features.md#features.lsp-features.symbolLocation) to build LSP location URIs. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Target](../../src/lsp-features.ts#L124) <!-- internal -->
      <a id="features.lsp-features.Target"></a><br>Discriminated union naming what sits under the cursor: either a symbol reference carrying an identifier string, or a file link carrying a path and line number, each with the source `Span` it occupies. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [nodesOf](../../src/lsp-features.ts#L126) (doc: Document) → { node: Node; section: Section; parent: Node | null }[] <!-- internal -->
      <a id="features.lsp-features.nodesOf"></a><br>Flattens a document into a pre-order list of every node across all sections, pairing each with its section and immediate parent, with top-level nodes obtained via [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes). Shared traversal backing [`features.lsp-features.ancestors`](features.md#features.lsp-features.ancestors)… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [targetAt](../../src/lsp-features.ts#L139) (doc: Document, offset: number) → Target | null
      <a id="features.lsp-features.targetAt"></a><br>The id, reference, or code link at an offset of a document. Spans are half-open: the offset after an id is not in it.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [base.span.spanContains](base.md#base.span.spanContains)
    - fn [docOf](../../src/lsp-features.ts#L154) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.docOf"></a><br>Looks up the analyzed document matching a file path in the workspace, falling back to [`features.lsp-features.readingDoc`](features.md#features.lsp-features.readingDoc) when none is found; shared by LSP handlers like [`features.lsp-features.completions`](features.md#features.lsp-features.completions). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.lsp-features.readingDoc](features.md#features.lsp-features.readingDoc)
    - fn [readingDoc](../../src/lsp-features.ts#L166) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.readingDoc"></a><br>A file of the explained map. The analysis does not check it (it is no spec), but its IDs and code links lead where the map's do: hover, definition and Enter in the TUI work there too.
      - calls [base.config.specPath](base.md#base.config.specPath), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [at](../../src/lsp-features.ts#L177) (ws: Workspace, path: string, position: LspPosition) → Target | null <!-- internal -->
      <a id="features.lsp-features.at"></a><br>Resolves the symbol target under an LSP cursor position by converting it to a text offset via [`features.lsp-features.toOffset`](features.md#features.lsp-features.toOffset) and querying [`features.lsp-features.targetAt`](features.md#features.lsp-features.targetAt), returning null if the document or text is unavailable. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [features.lsp-features.toOffset](features.md#features.lsp-features.toOffset)
    - type [LspDiagnostic](../../src/lsp-features.ts#L186)
      <a id="features.lsp-features.LspDiagnostic"></a><br>Shape of a single diagnostic emitted to the editor: a source `LspRange`, numeric severity 1–4, message, optional code, fixed source "keylang", and a `data` payload carrying the verdict plus an optional reason. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [diagnosticsFor](../../src/lsp-features.ts#L196) (ws: Workspace, path: string) → LspDiagnostic[]
      <a id="features.lsp-features.diagnosticsFor"></a><br>Diagnostics and verdicts of one document, as `check --format json` reports them.
      - calls [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange)
    - fn [describe](../../src/lsp-features.ts#L222) (ws: Workspace, id: string) → (NodeFacts & { state: string[] }) | null <!-- internal -->
      <a id="features.lsp-features.describe"></a><br>The facts of an ID (`explain-node.ts`) with the state hover names: opaque, and a plan with or without code.
      - calls [features.explain-node.nodeFacts](features.md#features.explain-node.nodeFacts)
    - type [HoverRun](../../src/lsp-features.ts#L230)
      <a id="features.lsp-features.HoverRun"></a><br>A piece of hover text: code (an ID, a keyword, a signature, a message's code span) is in backticks in Markdown, `strong` in bold.
    - type [HoverContent](../../src/lsp-features.ts#L240)
      <a id="features.lsp-features.HoverContent"></a><br>A hover before it is Markdown: `hover()` renders it for an LSP client, and the TUI draws its parts as they are, so neither parses the other's text.
    - type [HoverResult](../../src/lsp-features.ts#L257) <!-- internal -->
      <a id="features.lsp-features.HoverResult"></a>
    - fn [hover](../../src/lsp-features.ts#L259) (ws: Workspace, path: string, position: LspPosition) → HoverResult | null
      <a id="features.lsp-features.hover"></a><br>Builds the LSP hover response for a position: gets hover data via [`features.lsp-features.hoverContent`](features.md#features.lsp-features.hoverContent), renders it as markdown with [`features.lsp-features.hoverMarkdown`](features.md#features.lsp-features.hoverMarkdown), and keeps its range, returning null when nothing is found. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.lsp-features.hoverContent](features.md#features.lsp-features.hoverContent), [features.lsp-features.hoverMarkdown](features.md#features.lsp-features.hoverMarkdown)
    - fn [hoverMarkdown](../../src/lsp-features.ts#L265) (content: HoverContent) → string
      <a id="features.lsp-features.hoverMarkdown"></a><br>The hover as LSP Markdown: title, place, a `- ` line per evidence, the flows; a blank line between them.
      - calls [features.lsp-features.runsMarkdown](features.md#features.lsp-features.runsMarkdown)
    - fn [runsMarkdown](../../src/lsp-features.ts#L270) (runs: readonly HoverRun[]) → string <!-- internal -->
      <a id="features.lsp-features.runsMarkdown"></a>
    - fn [runsText](../../src/lsp-features.ts#L280) (runs: readonly HoverRun[]) → string
      <a id="features.lsp-features.runsText"></a><br>The text of runs without the Markdown: what a terminal shows.
    - fn [inlineRuns](../../src/lsp-features.ts#L288) (text: string) → HoverRun[] <!-- internal -->
      <a id="features.lsp-features.inlineRuns"></a><br>Text as keylang writes roles and messages — `code spans` in backticks — as runs; an unpaired backtick stays text. Rendered back, it is the same text.
    - fn [evidenceLine](../../src/lsp-features.ts#L301) (label: string, message: string) → HoverRun[] <!-- internal -->
      <a id="features.lsp-features.evidenceLine"></a><br>An evidence line: the criterion (or the diagnostic's code), then the message.
      - calls [features.lsp-features.inlineRuns](features.md#features.lsp-features.inlineRuns)
    - fn [hoverContent](../../src/lsp-features.ts#L306) (ws: Workspace, path: string, position: LspPosition) → HoverContent | null
      <a id="features.lsp-features.hoverContent"></a><br>What hover says at a position: the ID under it (kind, signature, place, evidence, flows), else the role of the line.
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.roleHover](features.md#features.lsp-features.roleHover), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.evidenceLine](features.md#features.lsp-features.evidenceLine), [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - fn [roleHover](../../src/lsp-features.ts#L331) (ws: Workspace, path: string, position: LspPosition) → HoverContent | null <!-- internal -->
      <a id="features.lsp-features.roleHover"></a><br>Hover on a keyword, or on a line without an ID: what the line does under its parent (grammar.md §5), then the diagnostics and verdicts of that line.
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.toOffset](features.md#features.lsp-features.toOffset), [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [base.span.spanContains](base.md#base.span.spanContains), [lang.parser.roleAt](lang.md#lang.parser.roleAt), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [features.lsp-features.inlineRuns](features.md#features.lsp-features.inlineRuns), [features.lsp-features.evidenceLine](features.md#features.lsp-features.evidenceLine), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - fn [definition](../../src/lsp-features.ts#L361) (ws: Workspace, path: string, position: LspPosition) → Location | null
      <a id="features.lsp-features.definition"></a><br>Resolves the target under the cursor via [`features.lsp-features.at`](features.md#features.lsp-features.at) into a go-to location: links open the referenced file at their line, and nodes jump to their source position from [`features.lsp-features.describe`](features.md#features.lsp-features.describe), otherwise null. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf)
    - fn [signatureHelp](../../src/lsp-features.ts#L375) (ws: Workspace, path: string, position: LspPosition) → { signatures: { label: string; documentation?: string }[]; activeSignature: 0; activeParameter: 0 } | null
      <a id="features.lsp-features.signatureHelp"></a><br>Finds the last dotted identifier before the cursor on the current line, looks it up via [`features.lsp-features.describe`](features.md#features.lsp-features.describe), and returns its signature as the label with its file:line as documentation, or null. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.lsp-features.describe](features.md#features.lsp-features.describe)
    - fn [references](../../src/lsp-features.ts#L389) (ws: Workspace, path: string, position: LspPosition, includeDeclaration = true) → Location[]
      <a id="features.lsp-features.references"></a><br>Declarations and uses of the id under the cursor; `includeDeclaration: false` (LSP's `context`) leaves out the declarations.
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [SymbolInformation](../../src/lsp-features.ts#L405)
      <a id="features.lsp-features.SymbolInformation"></a><br>Shape of a workspace/document symbol result sent to LSP clients: a display name, a numeric symbol-kind code, the `Location` where it is defined, and an optional enclosing container name. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [workspaceSymbols](../../src/lsp-features.ts#L425) (ws: Workspace, briefs: ReadonlyMap<string, StoredExplanation>, query: string) → SymbolInformation[]
      <a id="features.lsp-features.workspaceSymbols"></a><br>Nodes of the snapshot and planned intentions matching `query` (`searchNodes`, fuzzy): by name and ID first, then by the text of their explanation. Each points at its code, a planned one at its declaration in the spec, a layer at its line in `keylang.json`; `containerName` is…
      - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [features.lsp-features.symbolLocation](features.md#features.lsp-features.symbolLocation), [base.brief.capText](base.md#base.brief.capText), [features.lsp-features.symbolKind](features.md#features.lsp-features.symbolKind)
    - fn [symbolKind](../../src/lsp-features.ts#L441) (kind: string) → number <!-- internal -->
      <a id="features.lsp-features.symbolKind"></a><br>Maps a keylang node kind string (after stripping a leading "planned " prefix) to an LSP SymbolKind number: class, fn, type, and event get their own codes, anything else falls back to module. Used by [`features.lsp-features.workspaceSymbols`](features.md#features.lsp-features.workspaceSymbols) to tag workspace symbol results. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [symbolLocation](../../src/lsp-features.ts#L450) (ws: Workspace, hit: NodeHit) → Location | null <!-- internal -->
      <a id="features.lsp-features.symbolLocation"></a><br>Builds an LSP location for a workspace symbol: layers point to their key line in the config file via [`features.lsp-features.lineRange`](features.md#features.lsp-features.lineRange), other nodes to their file, line and column via [`features.lsp-features.lspPoint`](features.md#features.lsp-features.lspPoint). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange), [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - type [DocumentSymbol](../../src/lsp-features.ts#L470)
      <a id="features.lsp-features.DocumentSymbol"></a><br>Describes a hierarchical outline entry in the LSP document-symbol shape: a name, optional detail, numeric kind, full and selection `LspRange`s, and nested children of the same shape. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [statusOf](../../src/lsp-features.ts#L483) (verdicts: readonly Verdict[], diagnostics: readonly Diagnostic[], path: string, line: number) → string | undefined <!-- internal -->
      <a id="features.lsp-features.statusOf"></a><br>Worst verdict on a line of this document: `fail` > `unverified` > `ok`.
    - fn [flowPhrases](../../src/lsp-features.ts#L493) (spec: SpecIR) → Map<Node, string> <!-- internal -->
      <a id="features.lsp-features.flowPhrases"></a><br>Written phrase of a trigger, step, when, or then, keyed by its text-IR node.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.lsp-features.itemPhrase](features.md#features.lsp-features.itemPhrase)
    - fn [itemPhrase](../../src/lsp-features.ts#L504) (item: Trigger | FlowItem) → string | null <!-- internal -->
      <a id="features.lsp-features.itemPhrase"></a><br>Extracts the human-readable text from a flow element by kind: the target string for triggers, steps, and ref-form `then` items, the condition for `when`, and the prose for non-ref `then`. Returns null for any other kind, which [`features.lsp-features.flowPhrases`](features.md#features.lsp-features.flowPhrases) uses to skip… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [documentSymbols](../../src/lsp-features.ts#L511) (ws: Workspace, path: string) → DocumentSymbol[]
      <a id="features.lsp-features.documentSymbols"></a><br>Builds the LSP outline tree for a document, grouping flow and rules sections and tagging each symbol with its worst verification status from [`features.lsp-features.statusOf`](features.md#features.lsp-features.statusOf); served via [`cli.lsp.Server.request`](cli.md#cli.lsp.Server.request). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.flowPhrases](features.md#features.lsp-features.flowPhrases), [lang.ir.walk](lang.md#lang.ir.walk), [features.lsp-features.statusOf](features.md#features.lsp-features.statusOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [CompletionItem](../../src/lsp-features.ts#L598)
      <a id="features.lsp-features.CompletionItem"></a><br>Shape of one entry the completion provider returns: a label with an LSP kind code, optional detail, description, sort key, and a `filterText`/`textEdit` pair that lets the dotted label replace the whole typed path rather than just the last segment after a dot. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [completions](../../src/lsp-features.ts#L625) (ws: Workspace, path: string, position: LspPosition) → CompletionItem[]
      <a id="features.lsp-features.completions"></a><br>Keywords by position at the start of an item; after `step`/`trigger` only functions and planned functions; after other reference keywords, ids that the enclosing module may depend on (`deny` removes the rest).
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.enclosing](features.md#features.lsp-features.enclosing), [features.lsp-features.sectionAt](features.md#features.lsp-features.sectionAt), [lang.parser.keywordsAt](lang.md#lang.parser.keywordsAt), [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [features.lsp-features.moduleAround](features.md#features.lsp-features.moduleAround), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.blocksDependency](check.md#check.rules.blocksDependency)
    - fn [sectionAt](../../src/lsp-features.ts#L695) (doc: Document, line: number) → Section | undefined <!-- internal -->
      <a id="features.lsp-features.sectionAt"></a><br>Walks the document's sections in order and returns the last one whose heading starts on or before the given line, defaulting to the first section (headingless sections count as starting at line 1). Used by [`features.lsp-features.completions`](features.md#features.lsp-features.completions) to know which section the cursor is… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [enclosing](../../src/lsp-features.ts#L705) (doc: Document, line: number, col: number) → Node | undefined <!-- internal -->
      <a id="features.lsp-features.enclosing"></a><br>The nearest item above `line` that starts left of `col`: the parent of a new item there.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [ancestors](../../src/lsp-features.ts#L714) (doc: Document, node: Node) → Node[] <!-- internal -->
      <a id="features.lsp-features.ancestors"></a><br>Walks up the parent links from [`features.lsp-features.nodesOf`](features.md#features.lsp-features.nodesOf) to return the given node followed by each enclosing node out to the root. Each step is a linear scan of the flattened node list, so the chain costs O(depth × nodes). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [moduleAround](../../src/lsp-features.ts#L727) (ws: Workspace, doc: Document, parent: Node | undefined) → string | null <!-- internal -->
      <a id="features.lsp-features.moduleAround"></a><br>The module a completion is written in: the nearest enclosing module or fn declaration.
      - calls [features.lsp-features.ancestors](features.md#features.lsp-features.ancestors)
    - type [CodeLens](../../src/lsp-features.ts#L742) <!-- internal -->
      <a id="features.lsp-features.CodeLens"></a><br>Shape of a single code lens entry returned to the LSP client: a document range plus the command to run when clicked, carrying a title, command identifier, and a list of string-array arguments. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [codeLenses](../../src/lsp-features.ts#L748) (ws: Workspace, path: string) → CodeLens[]
      <a id="features.lsp-features.codeLenses"></a><br>`flows: checkout, pay` above each function of a source file that a flow names. The command `keylang.flows` (registered by the editor client) gets the flow names.
      - calls [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
  - module [node-search](../../src/node-search.ts#L1)
    <a id="features.node-search"></a><br>Finding nodes by name, ID or what their explanation says (ADR 0004): the TUI's node search, MCP `search` and LSP workspace symbols share one ranking.
    - analyze [map.analyze](map.md#map.analyze)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - type [NodeHit](../../src/node-search.ts#L9)
      <a id="features.node-search.NodeHit"></a><br>Shape of one search result: a node's ID, kind, signature, file and line, its `NodeExplanation` if any, and whether the match came from the ID/name or only from the explanation text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [NodeQuery](../../src/node-search.ts#L22)
      <a id="features.node-search.NodeQuery"></a><br>Request shape for a node lookup: the search text, a result cap, and a `fuzzy` flag that switches between subsequence matching on name and ID (ranked best first) and plain substring containment on the ID. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [searchNodes](../../src/node-search.ts#L40) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>, q: NodeQuery) → NodeHit[]
      <a id="features.node-search.searchNodes"></a><br>Nodes of the snapshot and `planned` intentions of the specs matching the query, case-insensitive: first those whose ID or name matches (for `fuzzy`, the exact name, then a name prefix, a name part, an ID part, then a subsequence of the name and of the ID; shorter IDs first…
      - calls [features.node-search.candidates](features.md#features.node-search.candidates), [features.node-search.idRank](features.md#features.node-search.idRank), [base.span.compareText](base.md#base.span.compareText)
    - fn [candidates](../../src/node-search.ts#L55) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>) → NodeHit[] <!-- internal -->
      <a id="features.node-search.candidates"></a><br>Builds the full search pool for [`features.node-search.searchNodes`](features.md#features.node-search.searchNodes): every snapshot node with its explanation via [`map.explanations.explanationOf`](map.md#map.explanations.explanationOf), plus `planned` spec declarations not yet in code, found by [`lang.ir.walk`](lang.md#lang.ir.walk). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [idRank](../../src/node-search.ts#L77) (query: string, id: string, fuzzy: boolean) → number | null <!-- internal -->
      <a id="features.node-search.idRank"></a><br>How well the ID or its last segment matches, lower is better; null when it does not.
      - calls [features.node-search.subsequence](features.md#features.node-search.subsequence)
    - fn [subsequence](../../src/node-search.ts#L91) (query: string, text: string) → boolean <!-- internal -->
      <a id="features.node-search.subsequence"></a><br>Every code point of `query` appears in `text` in order.
  - module [proposals](../../src/proposals.ts#L1)
    <a id="features.proposals"></a><br>Proposals (CONTEXT.md): the full proposed text of one hand-written spec or source file, kept in `.keylang/proposals/<path>` until a person takes it: hunk by hunk in the TUI's MERGE, or whole with `keylang proposals accept`. `draft`, `code-to-spec` and MCP `apply_diff` propose…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - languages [base.languages](base.md#base.languages)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - stats [features.stats](features.md#features.stats)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - fn [notPlain](../../src/proposals.ts#L28) (path: string) → boolean <!-- internal -->
      <a id="features.proposals.notPlain"></a><br>The write protocol's first test (`writeProblem`): a plain relative POSIX path, before anything on disk is looked at.
    - fn [unreadDirectory](../../src/proposals.ts#L33) (dirs: readonly string[]) → boolean <!-- internal -->
      <a id="features.proposals.unreadDirectory"></a><br>A directory below the spec directory, or the root for code, that `check` and the map do not read: hidden, `node_modules`, `target`.
      - calls [features.proposals.unreadName](features.md#features.proposals.unreadName)
    - fn [unreadName](../../src/proposals.ts#L38) (name: string) → boolean <!-- internal -->
      <a id="features.proposals.unreadName"></a><br>Case does not tell the directories apart: on a case-insensitive file system `Node_Modules` is `node_modules`.
    - fn [statOrNull](../../src/proposals.ts#L43) (abs: string) → Stats | null <!-- internal -->
      <a id="features.proposals.statOrNull"></a>
    - fn [sameEntry](../../src/proposals.ts#L52) (a: Stats, b: Stats | null) → boolean <!-- internal -->
      <a id="features.proposals.sameEntry"></a><br>The same directory on disk: by device and inode, which a link or another letter case of the name does not change.
    - fn [landsIn](../../src/proposals.ts#L64) (abs: string, dir: string) → boolean
      <a id="features.proposals.landsIn"></a><br>Whether a write to `abs` lands inside the directory `dir` on disk: `dir` itself or one of the existing ancestors of `abs` is `dir` by device and inode. Links are followed, so `notes/brief/x.md` with `notes -> explain` lands in `explain/`, and on a case-insensitive file system…
      - calls [features.proposals.statOrNull](features.md#features.proposals.statOrNull), [features.proposals.sameEntry](features.md#features.proposals.sameEntry)
    - fn [landsUnread](../../src/proposals.ts#L81) (root: string, lands: string) → boolean <!-- internal -->
      <a id="features.proposals.landsUnread"></a><br>Whether the landing place `lands` (below `root`, links resolved) is in a directory `check` does not read: an ancestor below `root` whose name is hidden, `node_modules` or `target` (the segments not on disk yet by their text), or whose entry on disk is the `node_modules` or…
      - calls [features.proposals.statOrNull](features.md#features.proposals.statOrNull), [map.analyze.within](map.md#map.analyze.within), [features.proposals.sameEntry](features.md#features.proposals.sameEntry), [features.proposals.unreadName](features.md#features.proposals.unreadName)
    - fn [reservedSpecText](../../src/proposals.ts#L101) (inside: string) → string | null <!-- internal -->
      <a id="features.proposals.reservedSpecText"></a><br>Why the spec path `inside` the spec directory is in a reserved directory by its text alone (case aside), or null: the fast path.
      - calls [features.proposals.unreadDirectory](features.md#features.proposals.unreadDirectory)
    - fn [reservedSpecLanding](../../src/proposals.ts#L109) (specRoot: string, lands: string) → string | null <!-- internal -->
      <a id="features.proposals.reservedSpecLanding"></a><br>Why the landing place `lands` of a spec is in a reserved directory of `specRoot` (the spec directory on disk), or null.
      - calls [features.proposals.landsUnread](features.md#features.proposals.landsUnread), [features.proposals.landsIn](features.md#features.proposals.landsIn)
    - fn [proposalProblem](../../src/proposals.ts#L123) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="features.proposals.proposalProblem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A proposal replaces one hand-written spec: a Markdown file under the spec directory, not one keylang generates (the map, the explained map, a saved model explanation, a file with the generated marker), and not reached…
      - calls [features.proposals.notPlain](features.md#features.proposals.notPlain), [features.proposals.reservedSpecText](features.md#features.proposals.reservedSpecText), [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.proposals.reservedSpecLanding](features.md#features.proposals.reservedSpecLanding), [lang.files.existingText](lang.md#lang.files.existingText), [lang.parser.parse](lang.md#lang.parser.parse), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.proposals.generatedSpecProblem](features.md#features.proposals.generatedSpecProblem)
    - fn [generatedSpecProblem](../../src/proposals.ts#L153) (marker: string | null, specDir: string) → string <!-- internal -->
      <a id="features.proposals.generatedSpecProblem"></a><br>The refusal for a generated spec, naming the command its marker names (`keylang baseline` for the baseline; `keylang map` otherwise).
    - fn [codeProposalProblem](../../src/proposals.ts#L167) (root: string, path: string) → string | null
      <a id="features.proposals.codeProposalProblem"></a><br>Why a proposal for the source file `path` may not be merged, or null: a file of a language keylang reads, a plain relative path inside the repository (links included, one whose target does not exist yet too), outside the directories sources are not read from, and not one…
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [features.proposals.notPlain](features.md#features.proposals.notPlain), [features.proposals.unreadDirectory](features.md#features.proposals.unreadDirectory), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.landsUnread](features.md#features.proposals.landsUnread), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText)
    - fn [targetProblem](../../src/proposals.ts#L183) (root: string, specDir: string, path: string, generated?: (path: string) => boolean) → string | null
      <a id="features.proposals.targetProblem"></a><br>The gate of a proposal's target: a Markdown file is a spec, any other a source file.
      - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem)
    - type [ProposalBasis](../../src/proposals.ts#L192)
      <a id="features.proposals.ProposalBasis"></a><br>What a proposal was built from: the target on disk and the proposal already waiting for it (null: no file). A write that carries it lands only while both are still so.
    - fn [proposalWriteProblem](../../src/proposals.ts#L202) (root: string, path: string, basis: ProposalBasis) → string | null
      <a id="features.proposals.proposalWriteProblem"></a><br>Why the proposal of `path` built from `basis` may not be written now, or null: the target or the waiting proposal changed, appeared or went away since, or the store breaks the write policy. Each reason names its file.
      - calls [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - fn [writeProposal](../../src/proposals.ts#L218) (root: string, path: string, text: string, basis?: ProposalBasis) → string
      <a id="features.proposals.writeProposal"></a><br>Writes the proposal for `path` (relative, POSIX) atomically and returns its file; `.keylang/proposals/` is keylang's own store, so a link there that leads elsewhere is refused like any other. With `basis` nothing is written unless the target and the waiting proposal are still…
      - calls [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [lineDiff](../../src/proposals.ts#L234) (before: string, after: string) → string
      <a id="features.proposals.lineDiff"></a><br>`-`/`+` lines between a common prefix and suffix: enough to see what a proposal changes. Line endings are compared as MERGE compares them: a target that is CRLF throughout is read as LF (mixed endings stay), and the proposal (an agent writes LF) is read as LF, so a CRLF file…
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - type [PendingProposal](../../src/proposals.ts#L251)
      <a id="features.proposals.PendingProposal"></a><br>One pending proposal as `keylang proposals` lists it.
    - fn [proposalTarget](../../src/proposals.ts#L268) (name: string) → string | null
      <a id="features.proposals.proposalTarget"></a><br>The target of a proposal as a person names it: as `keylang proposals` lists it, or as its store path `.keylang/proposals/<target>`; POSIX. Null when it is no plain relative path.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.notPlain](features.md#features.proposals.notPlain)
    - fn [pendingTargets](../../src/proposals.ts#L279) (root: string) → string[]
      <a id="features.proposals.pendingTargets"></a><br>Every target with a file or a link under `.keylang/proposals/`, sorted. The store is listed only while it stays inside the repository; a link in it is listed, never followed.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix), [base.span.compareText](base.md#base.span.compareText)
    - fn [storeEntry](../../src/proposals.ts#L294) (root: string, target: string) → { abs: string; link: boolean } | { problem: string } | null <!-- internal -->
      <a id="features.proposals.storeEntry"></a><br>The store entry of `target` where its directory lands: null when there is none, else the entry and whether it is a link. A store whose directory leads out of the repository is a problem, and nothing there is looked at.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within)
    - type [ReadProposal](../../src/proposals.ts#L308) <!-- internal -->
      <a id="features.proposals.ReadProposal"></a><br>A proposal that may be accepted: its text and the target's (null: no file).
    - fn [readProposal](../../src/proposals.ts#L318) (root: string, specDir: string, target: string) → ReadProposal | { problem: string } | null <!-- internal -->
      <a id="features.proposals.readProposal"></a><br>The proposal of `target` read after both gates — a plain file in the store, a target a proposal may change — or why it cannot be accepted; null when none is pending.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [features.proposals.targetProblem](features.md#features.proposals.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [lang.files.existingText](lang.md#lang.files.existingText)
    - fn [lineCounts](../../src/proposals.ts#L329) (before: string, after: string) → { added: number; removed: number } <!-- internal -->
      <a id="features.proposals.lineCounts"></a><br>`+` and `-` lines `lineDiff` prints.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - fn [listProposals](../../src/proposals.ts#L335) (root: string, specDir: string) → PendingProposal[]
      <a id="features.proposals.listProposals"></a><br>Every pending proposal with its target, line counts and why it cannot be accepted. Reads only.
      - calls [features.proposals.pendingTargets](features.md#features.proposals.pendingTargets), [features.proposals.readProposal](features.md#features.proposals.readProposal), [features.proposals.lineCounts](features.md#features.proposals.lineCounts)
    - type [ProposalDiff](../../src/proposals.ts#L344)
      <a id="features.proposals.ProposalDiff"></a><br>What `keylang proposals show <target>` prints, or why not. Reads only.
    - fn [proposalDiff](../../src/proposals.ts#L346) (root: string, specDir: string, target: string) → ProposalDiff
      <a id="features.proposals.proposalDiff"></a>
      - calls [features.proposals.readProposal](features.md#features.proposals.readProposal), [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - type [AcceptResult](../../src/proposals.ts#L353)
      <a id="features.proposals.AcceptResult"></a>
    - fn [acceptProposal](../../src/proposals.ts#L371) (root: string, specDir: string, target: string) → AcceptResult
      <a id="features.proposals.acceptProposal"></a><br>`keylang proposals accept <target>`: the proposal's full text replaces the target, as MERGE does with every hunk accepted. The same gates as MERGE (the target's, a plain file in the store), a target that is not writable (a person's `chmod a-w`) is refused, and the write follows…
      - calls [features.proposals.readProposal](features.md#features.proposals.readProposal), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.dropProposal](features.md#features.proposals.dropProposal), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [features.proposals.countDecision](features.md#features.proposals.countDecision), [features.proposals.lineCounts](features.md#features.proposals.lineCounts)
    - type [RejectResult](../../src/proposals.ts#L394)
      <a id="features.proposals.RejectResult"></a>
    - fn [rejectProposal](../../src/proposals.ts#L401) (root: string, specDir: string, target: string) → RejectResult
      <a id="features.proposals.rejectProposal"></a><br>`keylang proposals reject <target>`: the proposal is removed and the target stays as it is. A proposal no gate admits is still the person's to drop; a link in the store is removed itself, never followed.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [features.proposals.targetProblem](features.md#features.proposals.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.countDecision](features.md#features.proposals.countDecision), [lang.files.existingText](lang.md#lang.files.existingText)
    - fn [dropProposal](../../src/proposals.ts#L414) (root: string, target: string, text: string) → string | null <!-- internal -->
      <a id="features.proposals.dropProposal"></a><br>Removes the proposal while it still holds `text`: null, or why it stays.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [countDecision](../../src/proposals.ts#L426) (root: string, before: string, after: string, decision: "accepted" | "rejected") → void <!-- internal -->
      <a id="features.proposals.countDecision"></a><br>The model lines a decision took or dropped, as MERGE counts them (design §5.1 p.7); a count that cannot be written is lost, never the decision.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff), [features.stats.statusesIn](features.md#features.stats.statusesIn), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts)
  - module [spec-to-code](../../src/spec-to-code.ts#L1)
    <a id="features.spec-to-code"></a><br>`keylang spec-to-code <id>` (design §5.5), algo: a stub for a `planned` fn in the file its ID names, with the declared signature, analyzed as a new snapshot before anything is written; and for each `test` its flows name in a file that does not exist yet, a test that fails until…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - glob [base.glob](base.md#base.glob)
    - languages [base.languages](base.md#base.languages)
    - graph [map.graph](map.md#map.graph)
    - proposals [features.proposals](features.md#features.proposals)
    - assess [check.assess](check.md#check.assess)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - llm [features.llm](features.md#features.llm)
    - verdict [check.verdict](check.md#check.verdict)
    - type [FileCandidate](../../src/spec-to-code.ts#L27)
      <a id="features.spec-to-code.FileCandidate"></a><br>Describes one proposed file change: a root-relative POSIX path, the full new contents, and the exact prior contents (or null for a new file) that must still match on disk for the write to proceed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CodeCandidate](../../src/spec-to-code.ts#L35) extends FileCandidate
      <a id="features.spec-to-code.CodeCandidate"></a><br>A generated source file for one feature ID, bundled with the e2e test files it adds, the `test` entries it couldn't automate (with reasons), and the `check` verdicts and diagnostics it introduces versus the codebase without it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [specToCode](../../src/spec-to-code.ts#L55) (analysis: Analysis, id: string, into?: string, model?: LlmClient, options: LlmCallOptions = {}) → Promise<CodeCandidate>
      <a id="features.spec-to-code.specToCode"></a><br>`model`: the body comes from the model instead of the stub — the whole function with the declared signature, in one fenced block — and is analyzed the same way before anything is written. `options.signal` cancels the model's requests (`LlmCancelled`); the file is read before…
      - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [lang.files.existingText](lang.md#lang.files.existingText), [features.spec-to-code.modelBody](features.md#features.spec-to-code.modelBody), [features.spec-to-code.stubFor](features.md#features.spec-to-code.stubFor), [features.spec-to-code.placeStub](features.md#features.spec-to-code.placeStub), [features.spec-to-code.phpFileHead](features.md#features.spec-to-code.phpFileHead), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings), [map.analyze.analyze](map.md#map.analyze.analyze), [features.spec-to-code.introduced](features.md#features.spec-to-code.introduced), [features.spec-to-code.testCandidates](features.md#features.spec-to-code.testCandidates)
    - type [CodeTarget](../../src/spec-to-code.ts#L74)
      <a id="features.spec-to-code.CodeTarget"></a><br>Where the code of a planned fn goes: the file, and the class it is a method of.
    - fn [plannedCodeTarget](../../src/spec-to-code.ts#L98) (analysis: Analysis, id: string, into?: string) → CodeTarget | { error: string; field: "id" | "into" }
      <a id="features.spec-to-code.plannedCodeTarget"></a><br>Where the code of the planned fn `id` goes, or why spec-to-code builds none — the checks it makes before any file is read: not planned (with a suggestion), not a fn, already implemented (with the place), a `deny` its flow would break (`field: "id"`); a file not of its module, a…
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration), [features.spec-to-code.callersInFlows](features.md#features.spec-to-code.callersInFlows), [check.rules.blocksDependency](check.md#check.rules.blocksDependency), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [features.spec-to-code.placeCode](features.md#features.spec-to-code.placeCode), [features.spec-to-code.parentId](features.md#features.spec-to-code.parentId), [base.diag.errorText](base.md#base.diag.errorText), [map.graph.placeFile](map.md#map.graph.placeFile), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem)
    - type [Placement](../../src/spec-to-code.ts#L134) <!-- internal -->
      <a id="features.spec-to-code.Placement"></a><br>The file and owner of a planned fn under `ownerId`; `moduleId`: the module the file must be (null: the code says where the class is).
    - fn [parentId](../../src/spec-to-code.ts#L140) (id: string) → string <!-- internal -->
      <a id="features.spec-to-code.parentId"></a>
    - fn [placeCode](../../src/spec-to-code.ts#L144) (analysis: Analysis, ownerId: string, into: string | undefined) → Placement <!-- internal -->
      <a id="features.spec-to-code.placeCode"></a>
      - calls [features.spec-to-code.parentId](features.md#features.spec-to-code.parentId), [features.spec-to-code.placedModule](features.md#features.spec-to-code.placedModule), [features.spec-to-code.newModuleFile](features.md#features.spec-to-code.newModuleFile)
    - fn [placedModule](../../src/spec-to-code.ts#L169) (config: Config, file: string) → string | null <!-- internal -->
      <a id="features.spec-to-code.placedModule"></a>
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
    - fn [specToCodeText](../../src/spec-to-code.ts#L179) (candidate: CodeCandidate) → string
      <a id="features.spec-to-code.specToCodeText"></a><br>What `spec-to-code <id> --print` writes on stdout: each file with its `-`/`+` lines, and between the code and the tests every finding the candidate adds (one the diagnostics already name, once, as in `check`).
      - calls [features.spec-to-code.fileDiffText](features.md#features.spec-to-code.fileDiffText), [check.assess.sameFinding](check.md#check.assess.sameFinding), [check.verdict.formatVerdict](check.md#check.verdict.formatVerdict), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [fileDiffText](../../src/spec-to-code.ts#L188) (file: FileCandidate) → string
      <a id="features.spec-to-code.fileDiffText"></a><br>`src/a.ts (new file)` and its `-`/`+` lines against the file it was built from.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - fn [introduced](../../src/spec-to-code.ts#L193) (base: Analysis, next: Analysis) → { verdicts: Verdict[]; diagnostics: Diagnostic[] } <!-- internal -->
      <a id="features.spec-to-code.introduced"></a><br>Findings `next` has that `base` does not: what a candidate would change, wherever it lands (a K102 in the new file too).
    - fn [flowTests](../../src/spec-to-code.ts#L204) (analysis: Analysis, id: string) → { flow: string; file: string; name: string }[] <!-- internal -->
      <a id="features.spec-to-code.flowTests"></a><br>The `test` entries of the flows that name `id`: flow name, test file and test name.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowsMentioning](../../src/spec-to-code.ts#L217) (analysis: Analysis, id: string) → Flow[] <!-- internal -->
      <a id="features.spec-to-code.flowsMentioning"></a><br>Hand-written flows whose trigger, step, claim, `then`, or `planned` names `id`.
      - calls [features.spec-to-code.flowMentions](features.md#features.spec-to-code.flowMentions)
    - fn [flowMentions](../../src/spec-to-code.ts#L222) (spec: SpecIR, flow: Flow, id: string) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowMentions"></a><br>Returns true if a planned item with the given id sits inside the flow's file at a line the flow owns per [`features.spec-to-code.flowOwns`](features.md#features.spec-to-code.flowOwns), or if any trigger, step, ref-then, reads, emits, or invariant visited by [`lang.spec-ir.walkFlow`](lang.md#lang.spec-ir.walkFlow) targets that id. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.spec-to-code.flowOwns](features.md#features.spec-to-code.flowOwns), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowOwns](../../src/spec-to-code.ts#L235) (spec: SpecIR, flow: Flow, line: number) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowOwns"></a><br>`line` sits in this flow: after its heading and before the next flow of the same file.
    - fn [testCandidates](../../src/spec-to-code.ts#L245) (analysis: Analysis, id: string, target: CodeTarget, code: string, model: LlmClient | undefined, options: LlmCallOptions) → Promise<{ tests: FileCandidate[]; notes: string[] }> <!-- internal -->
      <a id="features.spec-to-code.testCandidates"></a><br>One new file per test path the flows name and the disk lacks. A test in an existing file, or in a language without a `node:test` shape, is a note: editing someone's test file is theirs to do.
      - calls [features.spec-to-code.flowTests](features.md#features.spec-to-code.flowTests), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.spec-to-code.phpSubject](features.md#features.spec-to-code.phpSubject), [features.spec-to-code.phpFileHead](features.md#features.spec-to-code.phpFileHead), [features.spec-to-code.modelPhpTest](features.md#features.spec-to-code.modelPhpTest), [features.spec-to-code.phpTestStub](features.md#features.spec-to-code.phpTestStub), [base.config.toPosix](base.md#base.config.toPosix), [features.spec-to-code.modelTest](features.md#features.spec-to-code.modelTest), [features.spec-to-code.testStub](features.md#features.spec-to-code.testStub)
    - type [PhpSubject](../../src/spec-to-code.ts#L301) <!-- internal -->
      <a id="features.spec-to-code.PhpSubject"></a><br>What a PHPUnit test of the planned fn reaches: its class (qualified) and method, or its function.
    - fn [phpSubject](../../src/spec-to-code.ts#L308) (target: CodeTarget, code: string) → PhpSubject <!-- internal -->
      <a id="features.spec-to-code.phpSubject"></a>
      - calls [features.spec-to-code.phpNamespaceIn](features.md#features.spec-to-code.phpNamespaceIn)
    - fn [phpString](../../src/spec-to-code.ts#L315) (text: string) → string <!-- internal -->
      <a id="features.spec-to-code.phpString"></a><br>A string literal of PHP: single quotes, `\\` and `'` escaped.
    - fn [phpNamespaceIn](../../src/spec-to-code.ts#L320) (text: string) → string | null <!-- internal -->
      <a id="features.spec-to-code.phpNamespaceIn"></a><br>The namespace a PHP file declares first; null without one.
    - fn [phpFileHead](../../src/spec-to-code.ts#L330) (analysis: Analysis, file: string) → string <!-- internal -->
      <a id="features.spec-to-code.phpFileHead"></a><br>The head of a new PHP file at `file`: `<?php`, `declare(strict_types=1);` when the files beside it have it, and the namespace they declare — else the one the root `composer.json` maps the directory to (`autoload` and `autoload-dev`, PSR-4) — so the class is autoloaded and its…
      - calls [features.spec-to-code.phpNamespaceIn](features.md#features.spec-to-code.phpNamespaceIn), [features.spec-to-code.composerNamespace](features.md#features.spec-to-code.composerNamespace)
    - fn [composerNamespace](../../src/spec-to-code.ts#L351) (root: string, dir: string) → string | null <!-- internal -->
      <a id="features.spec-to-code.composerNamespace"></a><br>The PSR-4 namespace of `dir` by the root `composer.json` (`autoload`, then `autoload-dev`); null when no prefix maps it.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [phpTestStub](../../src/spec-to-code.ts#L378) (file: string, head: string, subject: PhpSubject, entries: readonly { flow: string; name: string }[]) → string <!-- internal -->
      <a id="features.spec-to-code.phpTestStub"></a><br>A PHPUnit test class that fails until it is written: one test method per declared name.
      - calls [features.spec-to-code.lastName](features.md#features.spec-to-code.lastName), [features.spec-to-code.phpString](features.md#features.spec-to-code.phpString)
    - fn [lastName](../../src/spec-to-code.ts#L392) (qualified: string) → string <!-- internal -->
      <a id="features.spec-to-code.lastName"></a>
    - fn [modelPhpTest](../../src/spec-to-code.ts#L397) (model: LlmClient, file: string, head: string, subject: PhpSubject, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelPhpTest"></a><br>The PHPUnit test class from the model; each declared test method must be in it.
    - type [TestSubject](../../src/spec-to-code.ts#L417) <!-- internal -->
      <a id="features.spec-to-code.TestSubject"></a><br>`imported`: the name the test imports; `value`: the function it reaches through it (`X.prototype.m` for a method).
    - fn [testStub](../../src/spec-to-code.ts#L422) (from: string, subject: TestSubject, entries: readonly { flow: string; name: string }[]) → string <!-- internal -->
      <a id="features.spec-to-code.testStub"></a><br>Builds a node:test file source that imports the subject and, per flow entry, emits a test checking it is a function then failing with a "not written" placeholder; used by [`features.spec-to-code.testCandidates`](features.md#features.spec-to-code.testCandidates). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [modelTest](../../src/spec-to-code.ts#L430) (model: LlmClient, file: string, from: string, subject: TestSubject, id: string, code: string, entries: readonly { flow: string; name: string }[], options: LlmCallOptions) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelTest"></a><br>The e2e test file from the model; each declared test name must be in it verbatim.
    - fn [callersInFlows](../../src/spec-to-code.ts#L448) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.spec-to-code.callersInFlows"></a><br>IDs directly above `id` in flows: the trigger or step each of its steps is nested under.
    - fn [newModuleFile](../../src/spec-to-code.ts#L467) (analysis: Analysis, moduleId: string) → string <!-- internal -->
      <a id="features.spec-to-code.newModuleFile"></a><br>`<layer glob prefix>/<segments>.<ext>` for a module the code lacks; one prefix per layer, or the path is ambiguous. The extension is the language most files of the layer are written in (then of the repository, then the first of `languages`); the file name follows the layer's…
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.languages.languageOf](base.md#base.languages.languageOf), [map.graph.placeFile](map.md#map.graph.placeFile), [features.spec-to-code.mostWritten](features.md#features.spec-to-code.mostWritten), [features.spec-to-code.fileStem](features.md#features.spec-to-code.fileStem)
    - fn [mostWritten](../../src/spec-to-code.ts#L486) (files: readonly string[], languages: readonly string[]) → string | null <!-- internal -->
      <a id="features.spec-to-code.mostWritten"></a><br>The language most of `files` are written in; a tie goes to the one `languages` lists first.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [fileStem](../../src/spec-to-code.ts#L503) (segment: string, scopes: readonly (readonly string[])[], ambiguous: (dotted: string, plain: string) => string) → string <!-- internal -->
      <a id="features.spec-to-code.fileStem"></a><br>The file name (without extension) of the module segment `segment`. An ID segment has `_` where the file had `.` (`bookmark.service` → `bookmark_service`), so the nearest scope whose files end in `.service` or `_service` decides; a scope with both is ambiguous.
    - fn [stubFor](../../src/spec-to-code.ts#L527) (target: CodeTarget, id: string) → string <!-- internal -->
      <a id="features.spec-to-code.stubFor"></a><br>`(order: Order) → Promise<Refund>` → a function of that signature that fails until written; the declared parameters and result are kept as written, so the stub's own signature matches the plan (no K201). A method comes without indentation and without its class: `placeStub` puts…
      - calls [features.spec-to-code.declared](features.md#features.spec-to-code.declared), [features.spec-to-code.phpString](features.md#features.spec-to-code.phpString)
    - fn [declared](../../src/spec-to-code.ts#L542) (signature: string | null) → { params: string; result: string | null } <!-- internal -->
      <a id="features.spec-to-code.declared"></a><br>The parameters and result of a declared signature, as written.
    - fn [placeStub](../../src/spec-to-code.ts#L555) (before: string | null, target: CodeTarget, code: string, phpHead = "") → string <!-- internal -->
      <a id="features.spec-to-code.placeStub"></a><br>The file's text with `code` in place: appended to the module, wrapped in a new class appended to it, or inside the body of the class the code has. A new Python file gets postponed annotations: they name types it does not import, and are not evaluated when it loads.
      - calls [features.spec-to-code.intoClass](features.md#features.spec-to-code.intoClass), [features.spec-to-code.indent](features.md#features.spec-to-code.indent), [features.spec-to-code.declared](features.md#features.spec-to-code.declared)
    - fn [intoClass](../../src/spec-to-code.ts#L580) (text: string, span: { line: number; endLine: number; endCol: number | null }, code: string, python: boolean) → string <!-- internal -->
      <a id="features.spec-to-code.intoClass"></a><br>`code` as the last member of the class whose lines `span` gives, indented as its other members are.
      - calls [features.spec-to-code.leadingSpace](features.md#features.spec-to-code.leadingSpace), [features.spec-to-code.indent](features.md#features.spec-to-code.indent)
    - fn [leadingSpace](../../src/spec-to-code.ts#L606) (line: string) → string <!-- internal -->
      <a id="features.spec-to-code.leadingSpace"></a>
    - fn [indent](../../src/spec-to-code.ts#L611) (code: string, prefix: string) → string <!-- internal -->
      <a id="features.spec-to-code.indent"></a><br>Each non-blank line of `code` with `prefix` before it.
    - fn [dedent](../../src/spec-to-code.ts#L616) (code: string) → string <!-- internal -->
      <a id="features.spec-to-code.dedent"></a><br>`code` without the indentation all its non-blank lines share.
      - calls [features.spec-to-code.leadingSpace](features.md#features.spec-to-code.leadingSpace)
    - fn [fileExcerpt](../../src/spec-to-code.ts#L635) (text: string, owner: CodeTarget["owner"], firstDeclaration: number | null) → string <!-- internal -->
      <a id="features.spec-to-code.fileExcerpt"></a><br>What the model is shown of the file the code goes into, never more than about `HEAD_LINES + EXCERPT_LINES` lines: a file of up to `EXCERPT_LINES` lines whole; a longer one as its head up to the first declaration (the imports, at most `HEAD_LINES` lines), then the class the…
    - fn [firstDeclarationLine](../../src/spec-to-code.ts#L649) (analysis: Analysis, file: string) → number | null <!-- internal -->
      <a id="features.spec-to-code.firstDeclarationLine"></a><br>The first line of a declaration in `file` the snapshot knows: a fn, a type or a class; null without one.
    - fn [modelBody](../../src/spec-to-code.ts#L659) (analysis: Analysis, model: LlmClient, target: CodeTarget, id: string, before: string | null, options: LlmCallOptions) → Promise<string> <!-- internal -->
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
    - ir [lang.ir](lang.md#lang.ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [StaleBaseline](../../src/stale.ts#L23) = ReadonlyMap<string, ReadonlyMap<string, string>>
      <a id="features.stale.StaleBaseline"></a><br>Accepted fingerprints: spec file (relative to the root, POSIX) → statement key → fingerprint.
    - type [Statement](../../src/stale.ts#L26)
      <a id="features.stale.Statement"></a><br>One piece of prose bound to code.
    - type [StaleFinding](../../src/stale.ts#L43) extends Statement
      <a id="features.stale.StaleFinding"></a><br>Represents one architecture statement's freshness result: whether its code fingerprint is new, still accepted, or changed since acceptance. Also lists any subjects or unresolved references that could make that check incomplete. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [StaleReport](../../src/stale.ts#L55)
      <a id="features.stale.StaleReport"></a><br>Groups the output of a staleness check: a list of findings sorted by file then position, plus baseline entries whose statement no longer exists in the checked files because its text changed or was removed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [staleBaselinePath](../../src/stale.ts#L63) (config: Pick<Config, "dir">) → string
      <a id="features.stale.staleBaselinePath"></a><br>Where the accepted fingerprints live, relative to the root, POSIX.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [specStatements](../../src/stale.ts#L72) (docs: readonly Document[]) → Statement[]
      <a id="features.stale.specStatements"></a><br>The statements of hand-written specs: descriptions of nodes in map and flow sections, and every flow `when`, `then` and `invariant`. Generated map files are skipped: their text is the code's own.
      - calls [base.span.compareText](base.md#base.span.compareText), [features.stale.sectionRefs](features.md#features.stale.sectionRefs), [features.stale.subtreeRefs](features.md#features.stale.subtreeRefs), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [subtreeRefs](../../src/stale.ts#L107) (node: Node) → string[] <!-- internal -->
      <a id="features.stale.subtreeRefs"></a><br>Collects the target strings of every ref on a node and, recursively, on all of its descendants, returning them as one flat list; [`features.stale.specStatements`](features.md#features.stale.specStatements) uses it to gather the references a document subtree points at. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [sectionRefs](../../src/stale.ts#L111) (section: Section) → string[] <!-- internal -->
      <a id="features.stale.sectionRefs"></a><br>Collects every reference ID found anywhere in a document section by expanding its nodes via [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes) and flattening each node's subtree references into one list. Used by [`features.stale.specStatements`](features.md#features.stale.specStatements) to tie spec statements to the code they mention. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.stale.subtreeRefs](features.md#features.stale.subtreeRefs), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [statementPrint](../../src/stale.ts#L120) (snapshot: AnalysisSnapshot, subjects: readonly string[]) → { fingerprint: string; incomplete: string[] }
      <a id="features.stale.statementPrint"></a><br>The fingerprint of a statement's subjects in the snapshot, and what makes it incomplete. A subject the snapshot lacks hashes as `?`, so it turning up later is a change too.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.stale.closureComplete](features.md#features.stale.closureComplete)
    - fn [closureComplete](../../src/stale.ts#L133) (snapshot: AnalysisSnapshot, id: string) → boolean <!-- internal -->
      <a id="features.stale.closureComplete"></a><br>A fn or type: its closure; a module or layer: every fn and type under it.
    - fn [staleReport](../../src/stale.ts#L150) (docs: readonly Document[], snapshot: AnalysisSnapshot, baseline: StaleBaseline, whole = false) → StaleReport
      <a id="features.stale.staleReport"></a><br>The statements of `docs` against the snapshot and the accepted baseline. Entries of the checked (hand-written) files can be obsolete; with `whole` (every spec of the repository was read) so can those of a file that is gone.
      - calls [features.stale.specStatements](features.md#features.stale.specStatements), [features.stale.statementPrint](features.md#features.stale.statementPrint), [base.span.compareText](base.md#base.span.compareText)
    - fn [acceptBaseline](../../src/stale.ts#L172) (baseline: StaleBaseline, report: StaleReport, checked: readonly string[]) → StaleBaseline
      <a id="features.stale.acceptBaseline"></a><br>The baseline after accepting `report`: the checked files' entries are replaced by the current fingerprints (a file with no statement left is dropped); other files keep theirs.
    - fn [baselineJson](../../src/stale.ts#L185) (baseline: StaleBaseline) → string
      <a id="features.stale.baselineJson"></a><br>The baseline as committed: files, then keys in code-unit order; two-space JSON with a final newline.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [parseBaseline](../../src/stale.ts#L200) (text: string, path: string) → StaleBaseline
      <a id="features.stale.parseBaseline"></a><br>Reads a committed baseline; throws `path: problem` naming the field when it is not one.
      - calls [base.diag.errorText](base.md#base.diag.errorText), [features.stale.isRecord](features.md#features.stale.isRecord)
    - fn [isRecord](../../src/stale.ts#L221) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.stale.isRecord"></a><br>Type guard that narrows an unknown value to a plain object by checking it is a non-null `object` and not an array. Used by [`features.stale.parseBaseline`](features.md#features.stale.parseBaseline) to validate the shape of parsed baseline JSON before reading its fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [staleLine](../../src/stale.ts#L226) (f: StaleFinding) → string
      <a id="features.stale.staleLine"></a><br>One report line: `file:line:col: stale invariant `…`: …`.
    - fn [staleSummary](../../src/stale.ts#L239) (report: StaleReport) → string
      <a id="features.stale.staleSummary"></a><br>The stderr summary: counts by state, incomplete and obsolete.
    - type [StaleCheck](../../src/stale.ts#L247)
      <a id="features.stale.StaleCheck"></a><br>Bundles the outcome of a staleness check: the comparison result, the baseline file location, and how many fingerprints were persisted when accepting, or null if the baseline was left untouched. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [runStaleCheck](../../src/stale.ts#L261) (request: { root: string; base: string; paths: readonly string[]; accept: boolean }) → Promise<StaleCheck>
      <a id="features.stale.runStaleCheck"></a><br>`check --stale [paths…] [--accept]`: analyses the repository (nothing of it is written), compares its specs with the committed baseline, and with `accept` writes the current fingerprints of the checked files. Throws on a usage or I/O problem, naming the file.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.within](map.md#map.analyze.within), [features.stale.staleBaselinePath](features.md#features.stale.staleBaselinePath), [lang.files.existingText](lang.md#lang.files.existingText), [features.stale.parseBaseline](features.md#features.stale.parseBaseline), [map.analyze.analyze](map.md#map.analyze.analyze), [features.stale.staleReport](features.md#features.stale.staleReport), [features.stale.acceptBaseline](features.md#features.stale.acceptBaseline), [features.stale.baselineJson](features.md#features.stale.baselineJson), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
  - module [stats](../../src/stats.ts#L1)
    <a id="features.stats"></a><br>`.keylang/stats.json`: how often people accept what a model proposed (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines, and per kind of suggestion; local, never a verdict.
    - node [external.node](external.md#external.node)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [Tally](../../src/stats.ts#L9)
      <a id="features.stats.Tally"></a><br>Shape for a three-field count record: how many items were proposed, how many were accepted, and how many were rejected. It carries no behaviour; code in the stats module fills and reads these numbers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Stats](../../src/stats.ts#L15)
      <a id="features.stats.Stats"></a><br>Shape of the persisted usage counters: tallies of draft lines keyed by agreement status between LLM and algorithm, plus tallies of editor suggestions keyed by source with accumulated decision latency in ms. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readStats](../../src/stats.ts#L25) (root: string) → Stats
      <a id="features.stats.readStats"></a><br>Returns the parsed stats for a repository root by delegating to [`features.stats.readStatsFile`](features.md#features.stats.readStatsFile) and discarding the raw file text it also yields. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [features.stats.readStatsFile](features.md#features.stats.readStatsFile)
    - fn [readStatsFile](../../src/stats.ts#L30) (root: string) → { text: string | null; stats: Stats } <!-- internal -->
      <a id="features.stats.readStatsFile"></a><br>The file as read — its text, null when there is none (or it cannot be read) — and the counts it holds.
    - fn [updateStats](../../src/stats.ts#L53) (root: string, change: (stats: Stats) => void) → void
      <a id="features.stats.updateStats"></a><br>Applies `change` to the counts on disk. Another writer (`keylang draft` in a shell beside a MERGE in the TUI) may write between the read and the write: the write lands only over the text it read, and a lost race reads again and applies `change` once more, so neither update is…
      - calls [features.stats.readStatsFile](features.md#features.stats.readStatsFile), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [statusesIn](../../src/stats.ts#L68) (lines: readonly string[]) → Record<string, number>
      <a id="features.stats.statusesIn"></a><br>`status=` of every `keylang:llm` / `keylang:algo` provenance comment in the lines.
    - fn [addDrafts](../../src/stats.ts#L77) (stats: Stats, counts: Record<string, number>, field: keyof Tally) → void
      <a id="features.stats.addDrafts"></a><br>Adds each per-status count into the matching tally of `stats.drafts`, creating a zeroed tally for statuses not yet present and incrementing only the given field. Used by `operations.operations.countProposed` and [`tui.merge-session.MergeSession.write`](tui.md#tui.merge-session.MergeSession.write) to accumulate draft totals. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [voice-local](../../src/voice-local.ts#L1)
    <a id="features.voice-local"></a><br>The optional native parts of voice (design §7.4): `decibri` for the microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition. Both ship prebuilt binaries and are optional peer dependencies: npm installs them only when the user adds them next to keylang, and…
    - node [external.node](external.md#external.node)
    - voice [features.voice](features.md#features.voice)
    - fugood-whisper_node [external.fugood-whisper_node](external.md#external.fugood-whisper_node)
    - decibri [external.decibri](external.md#external.decibri)
    - type [Microphone](../../src/voice-local.ts#L19) = { chunks: AsyncIterable<Int16Array>; stop: () => void } <!-- internal -->
      <a id="features.voice-local.Microphone"></a><br>Shapes an open audio capture as an async stream of 16-bit PCM sample buffers plus a callback that ends the capture. Local voice code in [`features.voice-local`](features.md#features.voice-local) consumes the stream and invokes the callback to release the device. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ModuleStatus](../../src/voice-local.ts#L22)
      <a id="features.voice-local.ModuleStatus"></a><br>Whether an optional package can be used here: `missing` when it is not installed, `unavailable` with the reason when it is there but does not load.
    - type [WhisperContext](../../src/voice-local.ts#L24) <!-- internal -->
      <a id="features.voice-local.WhisperContext"></a><br>Describes the contract a local Whisper engine instance must satisfy: start transcription of raw audio bytes with an optional prompt, returning a cancellable handle and a promise for the text, plus a method to free the model. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Whisper](../../src/voice-local.ts#L29) <!-- internal -->
      <a id="features.voice-local.Whisper"></a><br>Describes the shape of the local speech-recognition backend: a function that creates a `WhisperContext` from a model file path with an optional GPU flag, and a loader that asynchronously initializes the underlying Whisper module. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MicrophoneClass](../../src/voice-local.ts#L34) <!-- internal -->
      <a id="features.voice-local.MicrophoneClass"></a><br>Describes a constructor shape taking `sampleRate` and `channels` and returning an opaque instance, so the voice feature can hold a dynamically loaded microphone library without a hard type dependency on it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [loadWhisper](../../src/voice-local.ts#L41) () → Promise<{ module: Whisper } | Exclude<ModuleStatus, { status: "ok" }>> <!-- internal -->
      <a id="features.voice-local.loadWhisper"></a><br>`@fugood/whisper.node` with its platform binary: the package itself loads the binary only on first use, so the check loads it, and a package without a working binary is not reported as installed.
      - calls [features.voice-local.optional](features.md#features.voice-local.optional), [features.voice-local.quietly](features.md#features.voice-local.quietly)
    - fn [localStatus](../../src/voice-local.ts#L58) () → Promise<ModuleStatus>
      <a id="features.voice-local.localStatus"></a><br>What `@fugood/whisper.node` can do on this machine.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper)
    - fn [localAvailable](../../src/voice-local.ts#L64) () → Promise<boolean>
      <a id="features.voice-local.localAvailable"></a><br>Whether `@fugood/whisper.node` and its binary load on this machine.
      - calls [features.voice-local.localStatus](features.md#features.voice-local.localStatus)
    - fn [loadDecibri](../../src/voice-local.ts#L68) () → { module: { Microphone: MicrophoneClass } } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.loadDecibri"></a><br>Loads the `decibri` package through [`features.voice-local.optional`](features.md#features.voice-local.optional) and checks that it exports a `Microphone` function. Returns the typed module on success, otherwise the load failure or an "unavailable" status. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [features.voice-local.optional](features.md#features.voice-local.optional)
    - fn [microphoneStatus](../../src/voice-local.ts#L77) () → Promise<ModuleStatus>
      <a id="features.voice-local.microphoneStatus"></a><br>What `decibri` can do on this machine.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [microphoneAvailable](../../src/voice-local.ts#L83) () → Promise<boolean>
      <a id="features.voice-local.microphoneAvailable"></a><br>Whether `decibri` loads on this machine.
      - calls [features.voice-local.microphoneStatus](features.md#features.voice-local.microphoneStatus)
    - fn [defaultMicrophone](../../src/voice-local.ts#L88) () → Promise<Microphone | null>
      <a id="features.voice-local.defaultMicrophone"></a><br>The system microphone through `decibri` (16 kHz, mono, s16le); null when it is not installed.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [transcribeLocal](../../src/voice-local.ts#L110) (modelFile: string, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice-local.transcribeLocal"></a><br>whisper.cpp on this machine, window by window, with the glossary as the initial prompt.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper), [features.voice-local.quietly](features.md#features.voice-local.quietly), [features.voice.windows](features.md#features.voice.windows), [features.voice.joinWindows](features.md#features.voice.joinWindows)
    - fn [optional](../../src/voice-local.ts#L135) (name: string, load: () => unknown) → { module: unknown } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.optional"></a><br>A package that may be absent or fail to load (a native binding without a prebuilt binary for this platform throws on `require`). Literal specifiers, so the map sees which packages voice may load.
    - fn [quietly](../../src/voice-local.ts#L155) (load: () => Promise<T>) → Promise<({ value: T } | { error: string }) & { warnings: string[] }> <!-- internal -->
      <a id="features.voice-local.quietly"></a><br>Runs `load` with `console.warn` captured: whisper.node warns while it looks for a platform binary, which would draw over the TUI. The warnings become part of a failure's reason.
  - module [voice](../../src/voice.ts#L1)
    <a id="features.voice"></a><br>Voice input (design §7.3 «Голосовий ввід»): PCM (16 kHz, mono, s16le) → text, by a local whisper.cpp model or OpenRouter's audio input. Speech goes into free text by default; a tiny command grammar («крок …», «коли … тоді …», «емітить …») turns into list items with IDs matched…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - keys [features.keys](features.md#features.keys)
    - parser [lang.parser](lang.md#lang.parser)
    - type [Env](../../src/voice.ts#L23) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.voice.Env"></a><br>A read-only string-keyed map whose values may be undefined, shaped like `process.env`, used by the voice feature to look up configuration such as API keys without mutating the source object. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [VoiceConfig](../../src/voice.ts#L25)
      <a id="features.voice.VoiceConfig"></a><br>Declares the shape of voice transcription settings: which engine to use (local, OpenRouter, or automatic selection) and an optional model name that may be null. It is a plain type with no runtime behavior. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [VoiceEngine](../../src/voice.ts#L30)
      <a id="features.voice.VoiceEngine"></a><br>Discriminated union describing how speech transcription is backed: an OpenRouter endpoint with key, base URL and model, a local model file, or a `missing` variant carrying the reason no engine is available. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [modelsDir](../../src/voice.ts#L35) (home: string = homedir()) → string
      <a id="features.voice.modelsDir"></a><br>Returns the path `<home>/.cache/keylang/models`, defaulting `home` to the user's home directory. Used by [`features.voice.localModel`](features.md#features.voice.localModel) and [`features.voice.voiceEngine`](features.md#features.voice.voiceEngine) to locate downloaded voice models. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      - calls [features.voice.seamWord](features.md#features.voice.seamWord)
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
