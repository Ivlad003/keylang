<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [agent-cli](#features.agent-cli) · [agent-context](#features.agent-context) · [baseline](#features.baseline) · [changed](#features.changed) · [check-format](#features.check-format) · [check-results](#features.check-results) · [clone](#features.clone) · [draft-llm](#features.draft-llm) · [draft](#features.draft) · [explain-edge](#features.explain-edge) · [explain-inventory](#features.explain-inventory) · [explain-llm](#features.explain-llm) · [explain-node](#features.explain-node) · [explain-offline](#features.explain-offline) · [explain](#features.explain) · [feature-status](#features.feature-status) · [ghost](#features.ghost) · [git-changes](#features.git-changes) · [git-hook](#features.git-hook) · [harness](#features.harness) · [keys](#features.keys) · [llm](#features.llm) · [lsp-features](#features.lsp-features) · [node-search](#features.node-search) · [proposals](#features.proposals) · [spec-to-code](#features.spec-to-code) · [stale](#features.stale) · [stats](#features.stats) · [voice-local](#features.voice-local) · [voice](#features.voice)

# map

- features
  <a id="features"></a><br>The layer holds keylang's user-facing capabilities: checking and reports ([`features.check-results`](features.md#features.check-results), [`features.changed`](features.md#features.changed)), model-backed drafting and explanations ([`features.llm`](features.md#features.llm), [`features.draft-llm`](features.md#features.draft-llm)), and editor, git and voice support ([`features.lsp-features`](features.md#features.lsp-features)… _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [agent-cli](../../src/agent-cli.ts#L1)
    <a id="features.agent-cli"></a><br>An agent CLI as a text model (ADR 0009): `cli:claude`, `cli:codex`, `cli:opencode`, `cli:cursor` or a command defined in `~/.config/keylang/agents.json`. One request is one run of the CLI in "answer only" form: no project hooks, MCP servers or instructions where the CLI can…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - type [Env](../../src/agent-cli.ts#L19) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.agent-cli.Env"></a><br>A read-only map of environment variable names to their string values, where missing variables appear as `undefined`. It is the shape the agent CLI uses when reading process environment settings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Preset](../../src/agent-cli.ts#L20) = (typeof AGENT_CLI_PRESETS)[number] <!-- internal -->
      <a id="features.agent-cli.Preset"></a><br>Derives a string-literal union type from the elements of the `AGENT_CLI_PRESETS` array, so a value can only be one of the preset names listed there. Used to type-check preset selection in the agent CLI module. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CliDefinition](../../src/agent-cli.ts#L23) = { command: string[] } | { bin: string }
      <a id="features.agent-cli.CliDefinition"></a><br>A user's own CLI: `command[0]` is the binary; `{prompt_file}` and `{model}` are placeholders. A preset name takes only `bin`.
    - type [AgentSettings](../../src/agent-cli.ts#L26)
      <a id="features.agent-cli.AgentSettings"></a><br>`~/.config/keylang/agents.json`, validated.
    - type [AgentSource](../../src/agent-cli.ts#L32) = "KEYLANG_AGENT" | "agents.json" | "keylang.json"
      <a id="features.agent-cli.AgentSource"></a><br>Where the effective agent came from.
    - type [CliRequest](../../src/agent-cli.ts#L34)
      <a id="features.agent-cli.CliRequest"></a><br>Defines the shape of a single request handed to the CLI agent layer: a `system` string carrying instructions and a `prompt` string carrying the user-facing text to be answered. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CliCallOptions](../../src/agent-cli.ts#L40)
      <a id="features.agent-cli.CliCallOptions"></a><br>`ms`: the call's bound; `fromVariable`: the bound is `KEYLANG_LLM_TIMEOUT_MS`, which the timeout message then names.
    - type [CliClient](../../src/agent-cli.ts#L48)
      <a id="features.agent-cli.CliClient"></a><br>Contract for a handle onto an external agent CLI binary: it exposes the agent identifier, the chosen model (empty for the CLI default) and the executable path. Its single method sends a `CliRequest` with `CliCallOptions` and resolves to the CLI's text output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [CliCancelled](../../src/agent-cli.ts#L59)
      <a id="features.agent-cli.CliCancelled"></a><br>The caller cancelled the run; `llm.ts` turns it into `LlmCancelled`.
      - fn [constructor](../../src/agent-cli.ts#L60) (agent: string)
        <a id="features.agent-cli.CliCancelled.constructor"></a><br>Builds an error whose message prefixes "cancelled" with the given agent label and sets the instance name to "CliCancelled" so callers can distinguish it from other failures. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [agentsFile](../../src/agent-cli.ts#L75) (home: string) → string
      <a id="features.agent-cli.agentsFile"></a><br>Builds the path to the per-user agent settings file by joining the given home directory with `.config/keylang/agents.json`. Used by [`features.agent-cli.readAgentSettings`](features.md#features.agent-cli.readAgentSettings), [`features.agent-cli.cliClient`](features.md#features.agent-cli.cliClient), and [`features.agent-cli.presetBinary`](features.md#features.agent-cli.presetBinary) to locate that file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readAgentSettings](../../src/agent-cli.ts#L80) (home: string) → AgentSettings
      <a id="features.agent-cli.readAgentSettings"></a><br>agents.json, validated; an absent file is empty settings. Errors name the file and the field.
      - calls [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.parseAgentSettings](features.md#features.agent-cli.parseAgentSettings)
    - fn [parseAgentSettings](../../src/agent-cli.ts#L93) (file: string, value: unknown) → AgentSettings
      <a id="features.agent-cli.parseAgentSettings"></a><br>The settings of an agents.json already parsed as JSON.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject), [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.cliDefinition](features.md#features.agent-cli.cliDefinition)
    - fn [cliDefinition](../../src/agent-cli.ts#L109) (file: string, name: string, def: unknown) → CliDefinition <!-- internal -->
      <a id="features.agent-cli.cliDefinition"></a><br>Validates one `clis.<name>` entry from a settings file, checking the name format, allowed fields, and either a non-empty `bin` string or a `command` array whose placeholders are known, throwing descriptive errors on any violation. Preset names may only override `bin`; it uses… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [resolveAgent](../../src/agent-cli.ts#L144) (configAgent: string | null, env: Env, home: string) → { agent: string | null; source: AgentSource | null }
      <a id="features.agent-cli.resolveAgent"></a><br>The agent in effect and where it came from: `KEYLANG_AGENT` (an empty variable is unset), else agents.json "use", else keylang.json `agent`. An invalid variable or agents.json throws, naming it.
      - calls [base.config.isAgent](base.md#base.config.isAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings)
    - fn [selectedAgent](../../src/agent-cli.ts#L159) (configAgent: string | null, env: Env = process.env, home: string = homedir()) → string | null
      <a id="features.agent-cli.selectedAgent"></a><br>The effective agent for deciding whether to ask at all (ghost, forms): a broken setting counts as an agent, so the request that follows reports it.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent)
    - fn [parseCliAgent](../../src/agent-cli.ts#L168) (agent: string) → { name: string; model: string }
      <a id="features.agent-cli.parseCliAgent"></a><br>`cli:opencode:anthropic/claude-sonnet-5` → name and model (the model keeps its colons).
    - type [Runner](../../src/agent-cli.ts#L175) = { preset: Preset; bin: string } | { command: string[] } <!-- internal -->
      <a id="features.agent-cli.Runner"></a><br>What `cliClient` runs: a preset with its binary, or a user's command.
    - fn [cliClient](../../src/agent-cli.ts#L182) (agent: string, options: { root: string; env: Env; home: string }) → { client: CliClient } | { missing: string }
      <a id="features.agent-cli.cliClient"></a><br>A client for a `cli:` agent, or why there is none (a missing binary, a Grok `agent` where Cursor's was expected): only a PATH scan and, for an `agent` binary, one memoized `--version`. Invalid agents.json throws.
      - calls [features.agent-cli.parseCliAgent](features.md#features.agent-cli.parseCliAgent), [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.completeWith](features.md#features.agent-cli.completeWith)
    - fn [presetBinary](../../src/agent-cli.ts#L217) (preset: Preset, bin: string | null, env: Env, home: string) → { bin: string } | { missing: string } <!-- internal -->
      <a id="features.agent-cli.presetBinary"></a><br>The binary of a preset: `bin` from agents.json, else its name on PATH; Cursor's is `cursor-agent`, or `agent` when its version is Cursor's.
      - calls [features.agent-cli.findBinary](features.md#features.agent-cli.findBinary), [features.agent-cli.agentsFile](features.md#features.agent-cli.agentsFile), [features.agent-cli.binaryVersion](features.md#features.agent-cli.binaryVersion)
    - fn [binaryVersion](../../src/agent-cli.ts#L238) (bin: string, env: Env) → string | null <!-- internal -->
      <a id="features.agent-cli.binaryVersion"></a><br>The first line of `<bin> --version`, at most 5 s, memoized per process; null when it gives none.
    - fn [shortVersion](../../src/agent-cli.ts#L248) (line: string) → string
      <a id="features.agent-cli.shortVersion"></a><br>`2.1.289 (Claude Code)` → `2.1.289`; `codex-cli 0.155.1` → `0.155.1`; a Cursor build keeps its hash.
    - fn [cliVersion](../../src/agent-cli.ts#L253) (bin: string, env: Env = process.env) → Promise<string | null>
      <a id="features.agent-cli.cliVersion"></a><br>The version of a binary for doctor, asynchronously (5 s cap, never a login or status command).
      - calls [features.agent-cli.shortVersion](features.md#features.agent-cli.shortVersion)
    - type [AgentCliProbe](../../src/agent-cli.ts#L272)
      <a id="features.agent-cli.AgentCliProbe"></a><br>A preset as doctor sees it: its binary (null: none usable) and that binary's version (null: it gave none).
    - fn [probeAgentClis](../../src/agent-cli.ts#L279) (env: Env = process.env, home: string = homedir()) → Promise<AgentCliProbe[]>
      <a id="features.agent-cli.probeAgentClis"></a><br>Every preset, probed in parallel with `--version` only: offline, never a login or status command.
      - calls [features.agent-cli.readAgentSettings](features.md#features.agent-cli.readAgentSettings), [features.agent-cli.presetBinary](features.md#features.agent-cli.presetBinary), [features.agent-cli.cliVersion](features.md#features.agent-cli.cliVersion)
    - fn [findBinary](../../src/agent-cli.ts#L297) (name: string, env: Env) → string | null
      <a id="features.agent-cli.findBinary"></a><br>A name on PATH or a path, if it is an executable file.
      - calls [features.agent-cli.executable](features.md#features.agent-cli.executable)
    - fn [executable](../../src/agent-cli.ts#L307) (path: string) → boolean <!-- internal -->
      <a id="features.agent-cli.executable"></a><br>Checks whether a filesystem path points to a regular file that the current process may execute, returning false on any stat or access error. Used by [`features.agent-cli.findBinary`](features.md#features.agent-cli.findBinary) to validate candidate binaries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [AnswerKind](../../src/agent-cli.ts#L320) = "result-json" | "file" | "opencode-events" | "stdout"
      <a id="features.agent-cli.AnswerKind"></a><br>How the answer is read: a `type:"result"` JSON line, Codex's `-o` file, opencode's NDJSON events, or stdout.
    - type [Invocation](../../src/agent-cli.ts#L322)
      <a id="features.agent-cli.Invocation"></a><br>Describes a fully prepared external agent CLI run: the binary and arguments, optional stdin text, environment, how the answer is retrieved (`AnswerKind`), and any files to write (mode 0600) beforehand, including an answer file path when the answer is read from disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [invocation](../../src/agent-cli.ts#L337) (runner: Runner, model: string, request: CliRequest, root: string, env: Env, tmp: string) → Invocation
      <a id="features.agent-cli.invocation"></a><br>The process to run for one request; `tmp` is a private directory outside the repository.
      - calls [features.agent-cli.wellFormed](features.md#features.agent-cli.wellFormed), [features.agent-cli.opencodeConfig](features.md#features.agent-cli.opencodeConfig)
    - fn [opencodeConfig](../../src/agent-cli.ts#L418) (existing: string | undefined, system: string) → string <!-- internal -->
      <a id="features.agent-cli.opencodeConfig"></a><br>The user's `OPENCODE_CONFIG_CONTENT` with keylang's agent on top: every permission denied.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [wellFormed](../../src/agent-cli.ts#L432) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.wellFormed"></a><br>Replaces any lone UTF-16 surrogate halves in the string with the U+FFFD replacement character so the result is valid Unicode. Used by [`features.agent-cli.invocation`](features.md#features.agent-cli.invocation) to sanitize text before passing it on. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ResultLine](../../src/agent-cli.ts#L436) = { text: string; model: string | null } | { error: string } <!-- internal -->
      <a id="features.agent-cli.ResultLine"></a><br>Discriminated union for one line of CLI result output: either a successful response carrying `text` and the `model` that produced it (or null), or a failure carrying only an `error` message. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseResultLine](../../src/agent-cli.ts#L439) (line: string) → ResultLine | null
      <a id="features.agent-cli.parseResultLine"></a><br>A `{"type":"result"}` line of Claude Code or Cursor: the answer with the model that wrote it, an error, or null for any other line.
      - calls [features.agent-cli.parseJson](features.md#features.agent-cli.parseJson), [features.agent-cli.isObject](features.md#features.agent-cli.isObject), [features.agent-cli.answeringModel](features.md#features.agent-cli.answeringModel)
    - fn [answeringModel](../../src/agent-cli.ts#L452) (usage: unknown) → string | null <!-- internal -->
      <a id="features.agent-cli.answeringModel"></a><br>The model of Claude Code's `modelUsage` (`{"<model>": {"outputTokens": n, …}}`) that wrote the most output: the CLI may also use a small model on the side. Null when the line has none (Cursor) or its shape is not that.
      - calls [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [parseOpencodeEvents](../../src/agent-cli.ts#L466) (output: string) → { text: string } | { error: string }
      <a id="features.agent-cli.parseOpencodeEvents"></a><br>opencode's NDJSON: the text parts after the last step start, or the first error.
      - calls [features.agent-cli.parseJson](features.md#features.agent-cli.parseJson), [features.agent-cli.isObject](features.md#features.agent-cli.isObject)
    - fn [completeWith](../../src/agent-cli.ts#L485) (agent: string, runner: Runner, model: string, request: CliRequest, options: { root: string; env: Env }, call: CliCallOptions) → Promise<string> <!-- internal -->
      <a id="features.agent-cli.completeWith"></a><br>Runs one agent-CLI call in a throwaway temp dir: builds the command via [`features.agent-cli.invocation`](features.md#features.agent-cli.invocation), writes its files, executes with [`features.agent-cli.runInvocation`](features.md#features.agent-cli.runInvocation), and parses output through [`features.agent-cli.readAnswer`](features.md#features.agent-cli.readAnswer). Throws [`features.agent-cli.CliCancelled`](features.md#features.agent-cli.CliCancelled) if… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.invocation](features.md#features.agent-cli.invocation), [features.agent-cli.runInvocation](features.md#features.agent-cli.runInvocation), [features.agent-cli.readAnswer](features.md#features.agent-cli.readAnswer)
    - type [RunResult](../../src/agent-cli.ts#L505) <!-- internal -->
      <a id="features.agent-cli.RunResult"></a><br>Bundles what a CLI subprocess run produced: the full captured stdout text plus an optional already-parsed `ResultLine` taken from an early `type:"result"` line, or null when none was found. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readAnswer](../../src/agent-cli.ts#L512) (agent: string, inv: Invocation, run: RunResult) → { text: string; model: string | null } <!-- internal -->
      <a id="features.agent-cli.readAnswer"></a><br>The answer, with the model that wrote it when the CLI's output names it.
      - calls [features.agent-cli.lastResult](features.md#features.agent-cli.lastResult), [features.agent-cli.parseOpencodeEvents](features.md#features.agent-cli.parseOpencodeEvents)
    - fn [lastResult](../../src/agent-cli.ts#L532) (stdout: string) → ResultLine | null <!-- internal -->
      <a id="features.agent-cli.lastResult"></a><br>Scans every line of captured stdout through [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) and keeps the last one that parses, returning null if none did. Used by [`features.agent-cli.readAnswer`](features.md#features.agent-cli.readAnswer) to pick the final result record from an agent's streamed output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine)
    - fn [killGroup](../../src/agent-cli.ts#L542) (pid: number, signal: NodeJS.Signals) → void <!-- internal -->
      <a id="features.agent-cli.killGroup"></a><br>Sends a signal to a spawned child's whole process group (negating the pid on POSIX, using it directly on Windows) and silently swallows errors when the group has already exited; used by [`features.agent-cli.hookExit`](features.md#features.agent-cli.hookExit) and [`features.agent-cli.runInvocation`](features.md#features.agent-cli.runInvocation) to tear down… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [hookExit](../../src/agent-cli.ts#L551) () → void <!-- internal -->
      <a id="features.agent-cli.hookExit"></a><br>Once: keylang's exit kills every live group; a fatal signal with no handler of its own kills them first and is raised again.
      - calls [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup)
    - fn [runInvocation](../../src/agent-cli.ts#L570) (agent: string, inv: Invocation, root: string, call: CliCallOptions) → Promise<RunResult> <!-- internal -->
      <a id="features.agent-cli.runInvocation"></a><br>Spawns the CLI in its own process group, feeds it stdin, and resolves with the collected output or the first [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) hit, killing the group via [`features.agent-cli.killGroup`](features.md#features.agent-cli.killGroup). Rejects on timeout, abort ([`features.agent-cli.CliCancelled`](features.md#features.agent-cli.CliCancelled)), oversized… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.agent-cli.hookExit](features.md#features.agent-cli.hookExit), [features.agent-cli.killGroup](features.md#features.agent-cli.killGroup), [features.agent-cli.CliCancelled](features.md#features.agent-cli.CliCancelled), [features.agent-cli.parseResultLine](features.md#features.agent-cli.parseResultLine), [features.agent-cli.stripAnsi](features.md#features.agent-cli.stripAnsi)
    - fn [stripAnsi](../../src/agent-cli.ts#L668) (text: string) → string <!-- internal -->
      <a id="features.agent-cli.stripAnsi"></a><br>Removes ANSI escape sequences (ESC-bracket codes ending in a letter) from a string via a global regex replace, returning plain text. [`features.agent-cli.runInvocation`](features.md#features.agent-cli.runInvocation) uses it to clean captured CLI output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseJson](../../src/agent-cli.ts#L673) (text: string) → unknown <!-- internal -->
      <a id="features.agent-cli.parseJson"></a><br>Lenient JSON parser that returns `undefined` for empty input or invalid JSON instead of throwing, so callers can skip bad lines. Used by [`features.agent-cli.parseOpencodeEvents`](features.md#features.agent-cli.parseOpencodeEvents) and [`features.agent-cli.parseResultLine`](features.md#features.agent-cli.parseResultLine) to decode CLI output lines. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isObject](../../src/agent-cli.ts#L682) (value: unknown) → value is Record<string, unknown> <!-- internal -->
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
      <a id="features.agent-context.contextPack"></a><br>Builds an agent context pack from the buffer plus IDs referenced on the cursor line (via [`lang.parser.parse`](lang.md#lang.parser.parse), `addIdItems`), with token estimates, cached per analysis in a bounded LRU keyed by a content hash. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [features.baseline.baselineText](features.md#features.baseline.baselineText), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.baseline.ruleLines](features.md#features.baseline.ruleLines), [map.map.sourceInputs](map.md#map.map.sourceInputs)
    - fn [baselinePlanProblems](../../src/baseline.ts#L128) (plan: BaselinePlan) → string[]
      <a id="features.baseline.baselinePlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): the target must pass the repository's write rules and still hold the bytes the plan saw, and `keylang.json` and the sources must be the ones the baseline was computed from.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems)
    - fn [commitBaseline](../../src/baseline.ts#L137) (plan: BaselinePlan) → void
      <a id="features.baseline.commitBaseline"></a><br>Writes the planned text atomically at the target (a link inside the repository is followed; CRLF of the old file kept). Throws on an I/O error.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [ruleLines](../../src/baseline.ts#L144) (text: string) → string[] <!-- internal -->
      <a id="features.baseline.ruleLines"></a><br>The `- deny` / `- allow` lines of a rules text, in order.
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
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding)
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
      <a id="features.check-format.CheckFormat"></a><br>A string literal union derived from the entries of `CHECK_FORMATS`, so the set of accepted output formats is defined once in the runtime array and the type follows it automatically. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CheckReportData](../../src/check-format.ts#L14)
      <a id="features.check-format.CheckReportData"></a><br>What a format shows: the `--format json` data and the human lines of the same report.
    - fn [isCheckFormat](../../src/check-format.ts#L21) (name: string) → name is CheckFormat
      <a id="features.check-format.isCheckFormat"></a><br>Type guard that returns true when the given string is one of the names listed in the `CHECK_FORMATS` constant. Used by [`cli.cli.cmdCheck`](cli.md#cli.cli.cmdCheck) and `tui.app.exportSourceOf` to validate user-supplied format options before narrowing them. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [checkReportText](../../src/check-format.ts#L26) (format: CheckFormat, report: CheckReportData) → string
      <a id="features.check-format.checkReportText"></a><br>The stdout of `keylang check --format <format>` for `report`, every line ending with `\n`.
      - calls [features.check-format.githubText](features.md#features.check-format.githubText), [features.check-format.sarifLog](features.md#features.check-format.sarifLog)
    - fn [githubText](../../src/check-format.ts#L33) (results: readonly CheckResult[]) → string <!-- internal -->
      <a id="features.check-format.githubText"></a><br>Renders non-ok check results as GitHub Actions workflow commands, mapping fail/warning/other verdicts to error/warning/notice lines with file, line, col and title properties. Property values and message data are escaped via [`features.check-format.githubProperty`](features.md#features.check-format.githubProperty) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.check-format.githubProperty](features.md#features.check-format.githubProperty), [features.check-format.ruleOf](features.md#features.check-format.ruleOf), [features.check-format.githubData](features.md#features.check-format.githubData)
    - fn [sarifLog](../../src/check-format.ts#L43) (report: CheckReportData) → unknown <!-- internal -->
      <a id="features.check-format.sarifLog"></a><br>Builds a SARIF 2.1 log object from a check report, keeping only non-"ok" results and mapping each to a result with rule id, level, message, file/line/column location and verdict metadata. Rule ids come from [`features.check-format.ruleOf`](features.md#features.check-format.ruleOf), their descriptions from… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.check-format.ruleText](features.md#features.check-format.ruleText), [features.check-format.ruleOf](features.md#features.check-format.ruleOf)
    - fn [ruleOf](../../src/check-format.ts#L78) (result: CheckResult) → string <!-- internal -->
      <a id="features.check-format.ruleOf"></a><br>The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind.
    - fn [ruleText](../../src/check-format.ts#L90) (id: string) → string <!-- internal -->
      <a id="features.check-format.ruleText"></a><br>Maps a diagnostic rule ID to a one-line human-readable description for the SARIF output built by [`features.check-format.sarifLog`](features.md#features.check-format.sarifLog). It special-cases "unverified", then looks up the evidence-rule table, falls back to the first line of [`features.explain.explainCode`](features.md#features.explain.explainCode), and finally… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      <a id="features.check-results.checkReport"></a><br>Builds the check report: structured results via [`features.check-results.checkResults`](features.md#features.check-results.checkResults), printable lines for diagnostics and non-duplicate verdicts (deduped with [`check.assess.sameFinding`](check.md#check.assess.sameFinding)), plus fail/unverified/ok counts and distinct holes. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.check-results.checkResults](features.md#features.check-results.checkResults)
    - fn [checkExitCode](../../src/check-results.ts#L116) (counts: CheckCounts, strict: boolean) → 0 | 1
      <a id="features.check-results.checkExitCode"></a><br>The exit code of `keylang check`: 1 for a failure, or with `strict` for an unverified verdict; else 0 — an unverified one stays visible.
  - module [clone](../../src/clone.ts#L1)
    <a id="features.clone"></a><br>`keylang clone <source>`: a repository someone names by URL (or a local path) becomes a shallow clone in keylang's cache, which `init`, `map` and `explain` then work on like any checkout. Git runs as an argument array, never through a shell, with its credential prompt off so a…
    - node [external.node](external.md#external.node)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [RepoSource](../../src/clone.ts#L15)
      <a id="features.clone.RepoSource"></a><br>What to clone and where it sits under the cache root.
    - type [CloneExplain](../../src/clone.ts#L23) = "map-only" | "map-and-ai" | "all"
      <a id="features.clone.CloneExplain"></a><br>How far `clone --explain` goes past the map.
    - fn [isCloneExplain](../../src/clone.ts#L27) (text: string) → text is CloneExplain
      <a id="features.clone.isCloneExplain"></a>
    - fn [parseRepoSource](../../src/clone.ts#L42) (text: string, cwd: string) → RepoSource | { error: string }
      <a id="features.clone.parseRepoSource"></a><br>Reads a clone source: an `http(s)://`, `ssh://`, `git://` or `file://` URL, the scp form `git@host:owner/repo.git`, or a path to a local repository. The key never holds credentials, `..` or characters a file name cannot carry.
      - calls [features.clone.fromUrl](features.md#features.clone.fromUrl), [features.clone.placeable](features.md#features.clone.placeable), [features.clone.keyed](features.md#features.clone.keyed)
    - fn [fromUrl](../../src/clone.ts#L58) (source: string) → RepoSource | { error: string } <!-- internal -->
      <a id="features.clone.fromUrl"></a>
      - calls [features.clone.parseRepoSource](features.md#features.clone.parseRepoSource), [features.clone.keyed](features.md#features.clone.keyed)
    - fn [keyed](../../src/clone.ts#L72) (url: string, host: string, path: string) → RepoSource | { error: string } <!-- internal -->
      <a id="features.clone.keyed"></a>
      - calls [features.clone.placeable](features.md#features.clone.placeable)
    - fn [placeable](../../src/clone.ts#L82) (segment: string) → string | undefined <!-- internal -->
      <a id="features.clone.placeable"></a>
    - fn [cloneCacheRoot](../../src/clone.ts#L87) (env: Readonly<Record<string, string | undefined>>, home: string) → string
      <a id="features.clone.cloneCacheRoot"></a><br>`$XDG_CACHE_HOME/keylang/repos`, else `~/.cache/keylang/repos`.
    - type [CloneSync](../../src/clone.ts#L92)
      <a id="features.clone.CloneSync"></a>
    - fn [syncClone](../../src/clone.ts#L102) (source: RepoSource, dir: string) → CloneSync
      <a id="features.clone.syncClone"></a><br>Clones `source` into `dir`, or brings a clone keylang made there up to the remote's default branch. A directory keylang did not clone is never touched: the reset would drop its work.
      - calls [features.clone.git](features.md#features.clone.git), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [features.clone.readMarker](features.md#features.clone.readMarker)
    - fn [readMarker](../../src/clone.ts#L118) (dir: string) → { url: string; key: string[] } | undefined <!-- internal -->
      <a id="features.clone.readMarker"></a>
    - fn [git](../../src/clone.ts#L132) (cwd: string, args: string[]) → void <!-- internal -->
      <a id="features.clone.git"></a>
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [enableExplainedMap](../../src/clone.ts#L148) (root: string) → string | null
      <a id="features.clone.enableExplainedMap"></a><br>Turns on the explained map (`"explain": {"map": true}`) in the clone's keylang.json; the rest of the file stays. Returns an error to name, or null.
      - calls [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
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
    - type [FlowDraft](../../src/draft.ts#L14)
      <a id="features.draft.FlowDraft"></a><br>Plain data shape for a flow being built: its name, the raw `# flow` section text (newline-terminated), and the ordered list of step IDs with the trigger first. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [draftFlow](../../src/draft.ts#L22) (snapshot: AnalysisSnapshot, trigger: string, options: { name?: string; depth?: number } = {}) → FlowDraft
      <a id="features.draft.draftFlow"></a><br>Walks the call graph from a fn in an `AnalysisSnapshot` to a bounded depth, skipping non-fn and external callees, and emits a Markdown flow with `trigger`/`step` lines. Unresolved or dynamic calls per step are appended as HTML comments, and the ordered step IDs are returned… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      <a id="features.explain-edge.EdgeExplanation"></a><br>Result record describing why two nodes are or are not connected: the ordered `EdgeEvidence` entries in both directions, `CoverageItem` gaps in the source node when no edge exists, and an `EdgeConclusion` verdict. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [edgeIdKnown](../../src/explain-edge.ts#L33) (snapshot: AnalysisSnapshot, id: string) → boolean
      <a id="features.explain-edge.edgeIdKnown"></a><br>An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail under a known module.
    - fn [under](../../src/explain-edge.ts#L37) (id: string, scope: string) → boolean <!-- internal -->
      <a id="features.explain-edge.under"></a><br>Checks whether a dotted node ID is the given scope itself or nested beneath it by testing for an exact match or a `scope.` prefix. Used by [`features.explain-edge.explainEdge`](features.md#features.explain-edge.explainEdge) to decide which side of an edge a node belongs to. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [explainEdge](../../src/explain-edge.ts#L40) (snapshot: AnalysisSnapshot, from: string, to: string) → EdgeExplanation
      <a id="features.explain-edge.explainEdge"></a><br>The edges and the coverage between two known ids (see `edgeIdKnown`).
      - calls [features.explain-edge.under](features.md#features.explain-edge.under), [base.span.compareText](base.md#base.span.compareText), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
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
      <a id="features.explain-llm.isStale"></a><br>Reports whether a saved explanation is outdated by comparing its stored closure hash against the node's current baseline from [`features.explain-llm.currentBaseline`](features.md#features.explain-llm.currentBaseline); any mismatch, including a missing baseline, counts as stale. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline)
    - fn [briefText](../../src/explain-llm.ts#L60) (answer: string) → string
      <a id="features.explain-llm.briefText"></a><br>A model's brief as saved: one or two sentences in one paragraph of `answerText`, cut by the rule doc comments follow.
      - calls [features.explain-llm.answerText](features.md#features.explain-llm.answerText), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [answerText](../../src/explain-llm.ts#L74) (answer: string) → string
      <a id="features.explain-llm.answerText"></a><br>A model's explanation as saved (`short`, `full`, and the text a brief is cut from): without the wrappers a chatty answer puts around it — a leading remark paragraph that ends with `:` or has fewer than four words («Sure, here is the brief:», «Certainly!») while more follows…
      - calls [features.explain-llm.withoutRemark](features.md#features.explain-llm.withoutRemark), [features.explain-llm.unfenced](features.md#features.explain-llm.unfenced)
    - fn [unfenced](../../src/explain-llm.ts#L84) (text: string) → string <!-- internal -->
      <a id="features.explain-llm.unfenced"></a><br>The inside of one fenced block of Markdown or plain text that is the whole of `text`; `text` itself otherwise.
    - fn [withoutRemark](../../src/explain-llm.ts#L96) (text: string) → string <!-- internal -->
      <a id="features.explain-llm.withoutRemark"></a><br>`text` without its first paragraph when that is a remark before the answer and another paragraph follows.
    - fn [unknownIds](../../src/explain-llm.ts#L110) (analysis: Analysis, text: string) → string[]
      <a id="features.explain-llm.unknownIds"></a><br>`` `a.b.c` `` in the answer that are neither snapshot IDs nor declared `planned`. Only a path that starts with a layer is an ID at all: `` `process.env` `` is code.
      - calls [lang.spec-ir.plannedDeclaration](lang.md#lang.spec-ir.plannedDeclaration)
    - fn [explanationRequest](../../src/explain-llm.ts#L125) (analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: ExplanationDetail; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.explanationRequest"></a><br>The request: the node's summary, its code, the signatures around it, and the words of the specs that mention it (layer, flows, rules). Not the repository.
      - calls [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-llm.sourceLines](features.md#features.explain-llm.sourceLines), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.members](features.md#features.explain-llm.members), [features.explain-llm.unresolved](features.md#features.explain-llm.unresolved)
    - fn [unresolved](../../src/explain-llm.ts#L179) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-llm.unresolved"></a><br>The constructs inside the node keylang did not turn into edges, with their line and code, for the calls section of `full`. An import of a file `assume` names is no such construct: the architecture leaves it unread.
      - calls [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [members](../../src/explain-llm.ts#L198) (analysis: Analysis, id: string, briefs: ReadonlyMap<string, StoredExplanation>) → string[] <!-- internal -->
      <a id="features.explain-llm.members"></a><br>The members right under a module, class or layer with their explanations (doc comments, briefs): a layer is explained through its modules, a module through its functions and types.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [sourceLines](../../src/explain-llm.ts#L214) (text: string, from: number, to: number) → string <!-- internal -->
      <a id="features.explain-llm.sourceLines"></a><br>Extracts the 1-based inclusive line range `from`–`to` from `text` and returns it joined with newlines. If the slice exceeds 200 lines, only the first 200 are kept, followed by a note stating how many lines were omitted; used by [`features.explain-llm.explanationRequest`](features.md#features.explain-llm.explanationRequest) to embed… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [BriefBatch](../../src/explain-llm.ts#L221) = "missing" | "stale"
      <a id="features.explain-llm.BriefBatch"></a><br>Which briefs a batch writes: nodes with no explanation or a stale brief (`missing`), or only stale briefs (`stale`).
    - type [BriefLevel](../../src/explain-llm.ts#L224) = "fn/type" | "class/module" | "layer" | "system"
      <a id="features.explain-llm.BriefLevel"></a><br>Levels of the explained map, explained bottom-up: a parent's prompt carries its members' briefs.
    - type [PlannedBrief](../../src/explain-llm.ts#L226)
      <a id="features.explain-llm.PlannedBrief"></a><br>Records a single brief-generation task: a node id, its `BriefLevel`, and a wave index that orders generation so each node only depends on briefs produced in earlier waves (functions and types first, then modules deepest-first, then layers). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [planBriefs](../../src/explain-llm.ts#L240) (analysis: Analysis, batch: BriefBatch, briefs: ReadonlyMap<string, StoredExplanation>) → PlannedBrief[]
      <a id="features.explain-llm.planBriefs"></a><br>The nodes a batch explains, in the order it asks: fn and types, then classes and modules from the deepest up, then layers, then the repository itself (`SYSTEM_ID`). A node with a doc comment is never asked about: the code already says what it does; nor is the repository when…
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [base.span.compareText](base.md#base.span.compareText)
    - fn [systemRequest](../../src/explain-llm.ts#L270) (analysis: Analysis, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.systemRequest"></a><br>The request for the repository's brief: its name, its layers with what the explained map says about them, its flows and the packages it uses. The README and manifests had nothing to say, or no model is asked at all.
      - calls [map.explanations.ownLayers](map.md#map.explanations.ownLayers), [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [estimateTokens](../../src/explain-llm.ts#L295) (analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>) → { input: number; output: number }
      <a id="features.explain-llm.estimateTokens"></a><br>A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out.
      - calls [features.explain-llm.briefRequest](features.md#features.explain-llm.briefRequest)
    - fn [briefRequest](../../src/explain-llm.ts#L305) (analysis: Analysis, id: string, lang: string, briefs: ReadonlyMap<string, StoredExplanation>) → LlmRequest | null
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
      <a id="features.explain-node.NodeSummary"></a><br>Data shape bundling everything gathered about one graph node for explanation: its kind, signature, doc brief, location, export status, call/dependency/flow neighbours, matching rules, and fingerprints. Also counts unresolved constructs per kind in `holes` and flags… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExplainResult](../../src/explain-node.ts#L70)
      <a id="features.explain-node.ExplainResult"></a><br>Union returned when explaining a node: either a successful `summary` holding a `NodeSummary`, or a failure carrying the `unknown` identifier that was not found plus an optional `suggestion` for a close match. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [summarizeNode](../../src/explain-node.ts#L72) (analysis: Analysis, id: string) → ExplainResult
      <a id="features.explain-node.summarizeNode"></a><br>Builds a node's structured summary from [`features.explain-node.nodeFacts`](features.md#features.explain-node.nodeFacts), rules, flows, graph links, unresolved-coverage counts and fingerprints; plan-only nodes get a bare summary, while unknown or spec-only IDs get a suggestion instead. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.explain-node.nodeFacts](features.md#features.explain-node.nodeFacts), [features.explain-node.rulesNaming](features.md#features.explain-node.rulesNaming), [lang.spec-ir.flowsUsing](lang.md#lang.spec-ir.flowsUsing), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [rulesNaming](../../src/explain-node.ts#L109) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.explain-node.rulesNaming"></a><br>`file:line: rule text` of the rule and module lines that name `id` or a scope around it, sorted; the generated map's are left out.
      - calls [features.explain-node.nodeHolding](features.md#features.explain-node.nodeHolding)
    - fn [nodeHolding](../../src/explain-node.ts#L138) (root: Node, ref: Ref) → Node | null <!-- internal -->
      <a id="features.explain-node.nodeHolding"></a><br>The allow, deny, entry item, nested layer, or module line that holds `ref`.
    - fn [formatSummary](../../src/explain-node.ts#L148) (s: NodeSummary) → string
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
      <a id="features.explain-offline.savedAnswer"></a><br>Converts a stored explanation into a reply record, marking freshness via [`features.explain-llm.isStale`](features.md#features.explain-llm.isStale), listing unrecognized IDs via [`features.explain-llm.unknownIds`](features.md#features.explain-llm.unknownIds), and attaching its file path from [`map.explanations.explanationPath`](map.md#map.explanations.explanationPath). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
    - fn [explainCode](../../src/explain.ts#L115) (code: string) → string | null
      <a id="features.explain.explainCode"></a><br>Looks up a diagnostic code (case-insensitively) in the `EXPLANATIONS` table and formats its cause, example, and fix as a multi-line string, returning null for unknown codes. For `K005` it appends extra reason lines from `K005_REASON_LINES`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      - calls [base.diag.isError](base.md#base.diag.isError), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.feature-status.denyGaps](features.md#features.feature-status.denyGaps), [features.feature-status.finding](features.md#features.feature-status.finding), [features.feature-status.claimsOf](features.md#features.feature-status.claimsOf), [features.feature-status.thisChange](features.md#features.feature-status.thisChange), [features.feature-status.idsIn](features.md#features.feature-status.idsIn), [features.feature-status.ruleFails](features.md#features.feature-status.ruleFails), [features.feature-status.weakenedPlan](features.md#features.feature-status.weakenedPlan), [base.span.compareText](base.md#base.span.compareText), [features.feature-status.stageOf](features.md#features.feature-status.stageOf), [features.feature-status.baseInfo](features.md#features.feature-status.baseInfo)
    - fn [baseInfo](../../src/feature-status.ts#L301) (base: FeatureBase) → FeatureBaseInfo <!-- internal -->
      <a id="features.feature-status.baseInfo"></a><br>The base as the report names it: the commit and its state first, as they always came, then how it was chosen.
    - type [RuleFail](../../src/feature-status.ts#L307) <!-- internal -->
      <a id="features.feature-status.RuleFail"></a><br>A rule fail: an error diagnostic of a rule (K101, K102, K104, K105, K107), or a failed rule verdict that repeats none.
    - fn [ruleFails](../../src/feature-status.ts#L318) (input: FeatureInput) → RuleFail[] <!-- internal -->
      <a id="features.feature-status.ruleFails"></a><br>Every rule fail of the analysis, in the order of its diagnostics, then its verdicts.
      - calls [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [thisChange](../../src/feature-status.ts#L339) (input: FeatureInput, path: string, named: readonly string[]) → (fail: RuleFail) => boolean <!-- internal -->
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
    - type [ChangedFiles](../../src/git-changes.ts#L20)
      <a id="features.git-changes.ChangedFiles"></a><br>Files changed since a ref. Paths are POSIX, relative to the root.
    - fn [gitIn](../../src/git-changes.ts#L30) (root: string, label: string) → { run: (args: string[]) => SpawnSyncReturns<string>; git: (args: string[]) => string } <!-- internal -->
      <a id="features.git-changes.gitIn"></a><br>A git runner for `root`; `label` names the caller in its errors (`check --changed`).
      - calls [features.git-changes.gitUnavailable](features.md#features.git-changes.gitUnavailable)
    - fn [gitUnavailable](../../src/git-changes.ts#L46) (label: string, error: Error & { code?: string }) → string
      <a id="features.git-changes.gitUnavailable"></a><br>Why git did not run; a refusal (EPERM, EACCES) is most likely a sandbox, and says what still works.
    - fn [assertRef](../../src/git-changes.ts#L53) (ref: string, label: string) → void <!-- internal -->
      <a id="features.git-changes.assertRef"></a><br>A ref git would read as an option (`--output=…`) is refused: it is never passed on.
    - fn [diffArgs](../../src/git-changes.ts#L59) (base: string) → string[] <!-- internal -->
      <a id="features.git-changes.diffArgs"></a><br>Builds the fixed argument list for a `git diff` against a base ref: relative paths, no renames, zero context lines, no color or external diff, and `a/`/`b/` prefixes. Shared by [`features.git-changes.gitChangedFiles`](features.md#features.git-changes.gitChangedFiles) and [`features.git-changes.gitChangedLines`](features.md#features.git-changes.gitChangedLines) so both parse… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [untracked](../../src/git-changes.ts#L61) (git: (args: string[]) => string) → string[] <!-- internal -->
      <a id="features.git-changes.untracked"></a><br>Lists files in the working tree that git does not track and that are not ignored, by running `ls-files` with NUL-separated output and splitting it into a path array. Both [`features.git-changes.gitChangedFiles`](features.md#features.git-changes.gitChangedFiles) and [`features.git-changes.gitChangedLines`](features.md#features.git-changes.gitChangedLines) fold these into their… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [ownState](../../src/git-changes.ts#L71) (path: string) → boolean <!-- internal -->
      <a id="features.git-changes.ownState"></a><br>keylang's own local state under `.keylang/` — the index, the fact cache an analysis saves, proposals, reports — is never a source or a spec, so it is never a change, tracked or not, gitignored or not.
    - fn [gitChangedFiles](../../src/git-changes.ts#L74) (root: string, ref: string, label = "check --changed") → ChangedFiles
      <a id="features.git-changes.gitChangedFiles"></a><br>Files changed since `ref` in the working tree, plus files git does not track yet; keylang's own `.keylang/` left out.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.draft.deletedDiffPaths](features.md#features.draft.deletedDiffPaths), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.untracked](features.md#features.git-changes.untracked), [features.git-changes.ownState](features.md#features.git-changes.ownState)
    - fn [gitChangedLines](../../src/git-changes.ts#L89) (root: string, ref: string, label = "code-to-spec --since") → ChangedLines
      <a id="features.git-changes.gitChangedLines"></a><br>The lines changed since `ref` in the working tree, and the files git does not track yet (`all`), relative to `root`.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn), [features.draft.diffHunks](features.md#features.draft.diffHunks), [features.git-changes.diffArgs](features.md#features.git-changes.diffArgs), [features.git-changes.untracked](features.md#features.git-changes.untracked)
    - fn [changedPathSet](../../src/git-changes.ts#L98) (root: string, files: Iterable<string>, base: string) → Set<string>
      <a id="features.git-changes.changedPathSet"></a><br>Git paths are relative to `root`; check reports spec paths relative to `base`. Both forms match.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [gitFileAt](../../src/git-changes.ts#L112) (root: string, ref: string, path: string, label: string) → string | null
      <a id="features.git-changes.gitFileAt"></a><br>The text of `path` (POSIX, relative to `root`) at `ref`, or null when the file is not in that commit or `HEAD` has no commit yet. An unknown ref, no git, or no repository is an error naming the caller.
      - calls [features.git-changes.assertRef](features.md#features.git-changes.assertRef), [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [readFeatureBase](../../src/git-changes.ts#L134) (root: string, path: string, since: string | undefined, label: string) → FeatureBase
      <a id="features.git-changes.readFeatureBase"></a><br>The feature file at its base commit, and the files changed since that commit as `check --changed --since <base>` reads them: a rule fail of this change is one that touches them. The base is `since`, else `featureBaseOrigin`.
      - calls [features.git-changes.featureBaseOrigin](features.md#features.git-changes.featureBaseOrigin), [features.git-changes.gitFileAt](features.md#features.git-changes.gitFileAt), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [featureBaseOrigin](../../src/git-changes.ts#L173) (root: string, label: string) → BaseOrigin
      <a id="features.git-changes.featureBaseOrigin"></a><br>The base `feature` judges a change against when no `since` is given: the merge-base of HEAD with the main branch, so a fail committed on a feature branch is still the change's own. The main branch is the one `refs/remotes/origin/HEAD` points at, else a local `main`, `master`…
      - calls [features.git-changes.gitIn](features.md#features.git-changes.gitIn)
    - fn [deletedModuleIds](../../src/git-changes.ts#L196) (config: Config, files: readonly string[]) → string[]
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
      <a id="features.git-hook.preCommitState"></a><br>Classifies an existing pre-commit hook as "missing" when absent, "foreign" when it lacks the keylang marker, "current" when it matches the output of [`features.git-hook.preCommitText`](features.md#features.git-hook.preCommitText) for the given version and is executable, otherwise "stale". _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.git-hook.preCommitText](features.md#features.git-hook.preCommitText)
    - fn [gitHooksDir](../../src/git-hook.ts#L41) (cwd: string) → string
      <a id="features.git-hook.gitHooksDir"></a><br>The hooks directory git uses for the repository around `cwd`, absolute: `git rev-parse --git-path hooks` honours `core.hooksPath` and linked worktrees. It is asked from the top level, where a relative `core.hooksPath` is resolved.
      - calls [features.git-hook.git](features.md#features.git-hook.git)
    - fn [git](../../src/git-hook.ts#L46) (cwd: string, args: string[]) → string <!-- internal -->
      <a id="features.git-hook.git"></a><br>Runs a git command synchronously in the given directory and returns its trimmed stdout, throwing a hook-install error if git can't launch or exits non-zero; used by [`features.git-hook.gitHooksDir`](features.md#features.git-hook.gitHooksDir). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
  - module [harness](../../src/harness.ts#L1)
    <a id="features.harness"></a><br>Harness adapters: one pure merge from the files on disk and the selected harnesses to the next text. Markdown keeps a marked block; JSON and TOML replace only the `keylang` key.
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - config [base.config](base.md#base.config)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - fn [skillFile](../../src/harness.ts#L31) () → string
      <a id="features.harness.skillFile"></a><br>The skill shipped in the package. The same relative path works from `src` and from `dist`.
    - type [HarnessName](../../src/harness.ts#L36) = (typeof HARNESS_NAMES)[number]
      <a id="features.harness.HarnessName"></a><br>A string union type derived from the entries of the `HARNESS_NAMES` array, so values are constrained to the harness identifiers listed there. Used to type-check which harness a feature refers to without duplicating the list. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [denyRules](../../src/harness.ts#L55) (dir: string) → string[] <!-- internal -->
      <a id="features.harness.denyRules"></a><br>Claude's deny entries that keep an agent from editing the rules of the spec directory `dir`, or deciding a proposal.
    - fn [specDir](../../src/harness.ts#L60) (root: string) → string <!-- internal -->
      <a id="features.harness.specDir"></a><br>The spec directory of `keylang.json` under `root` (`dir`, normalized), or `keylang` without the file. A broken file throws, naming the file and the field.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig)
    - type [HarnessSelection](../../src/harness.ts#L69)
      <a id="features.harness.HarnessSelection"></a><br>Carries the resolved set of agent harnesses chosen by the user as `HarnessName` values, plus a flag that disables the instruction block and adapter file emission when `--agents=none` is given. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [HarnessFile](../../src/harness.ts#L75)
      <a id="features.harness.HarnessFile"></a><br>Describes one file in a test harness as a path plus its full contents, where a null `text` marks a file that must not exist. Used to declare or verify the expected state of files on disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [HarnessPlan](../../src/harness.ts#L81)
      <a id="features.harness.HarnessPlan"></a><br>Describes the outcome of assembling a harness: the list of `HarnessFile` entries to write, plus either `null` or a single failure record naming the offending file and the reason it could not be prepared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseAgents](../../src/harness.ts#L87) (value: string) → HarnessSelection
      <a id="features.harness.parseAgents"></a><br>`--agents=<list>`. `none` is the empty selection. An unknown name throws and lists the allowed names.
    - type [HarnessProbe](../../src/harness.ts#L101)
      <a id="features.harness.HarnessProbe"></a><br>What is on disk for harness detection. `list` returns child names, or null when the path is not a directory.
    - fn [detectHarnesses](../../src/harness.ts#L111) (probe: HarnessProbe) → HarnessName[]
      <a id="features.harness.detectHarnesses"></a><br>Directories and files that mean a harness is already in use. Order matches `HARNESS_NAMES`. `.claude/skills/keylang-feature` is the copy `agents` writes for every harness, so that tree alone is not Claude.
      - calls [features.harness.claudePresent](features.md#features.harness.claudePresent)
    - fn [claudePresent](../../src/harness.ts#L122) (probe: HarnessProbe) → boolean <!-- internal -->
      <a id="features.harness.claudePresent"></a><br>Decides whether the Claude harness is in use by listing the `.claude` directory via the probe: missing means no, empty means yes, otherwise it defers to [`features.harness.claudeHasUserFile`](features.md#features.harness.claudeHasUserFile) to check for user-authored files. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.harness.claudeHasUserFile](features.md#features.harness.claudeHasUserFile)
    - fn [claudeHasUserFile](../../src/harness.ts#L130) (probe: HarnessProbe, dir: string) → boolean <!-- internal -->
      <a id="features.harness.claudeHasUserFile"></a><br>A file under `.claude` that is not the keylang skill copy.
    - fn [agentsBody](../../src/harness.ts#L144) (version: string, dir: string) → string
      <a id="features.harness.agentsBody"></a><br>The instruction body between the markers, without a trailing newline. The CLI fallback pins `version`; paths are under the spec directory `dir`.
      - calls [features.harness.cliCommand](features.md#features.harness.cliCommand)
    - fn [mcpCommand](../../src/harness.ts#L180) (version: string) → { command: string; args: string[] }
      <a id="features.harness.mcpCommand"></a><br>`npx -y keylang@<version> mcp`, split the way MCP configs store a command.
    - fn [cliCommand](../../src/harness.ts#L185) (version: string) → string
      <a id="features.harness.cliCommand"></a><br>The pinned CLI the fallback names: the same package and version as the MCP server, so it needs no global `keylang`.
    - fn [pinSkill](../../src/harness.ts#L194) (skill: string, version: string, dir: string) → string
      <a id="features.harness.pinSkill"></a><br>The skill resource names the CLI as `npx -y keylang@<version>` and the spec directory as `<dir>/`; the copy a harness gets pins the running version and the repository's `dir`.
    - fn [hookCommand](../../src/harness.ts#L199) (version: string) → string
      <a id="features.harness.hookCommand"></a><br>What the Stop hook runs.
      - calls [features.harness.cliCommand](features.md#features.harness.cliCommand)
    - fn [planHarness](../../src/harness.ts#L209) (input: { selection: HarnessSelection; version: string; dir: string; skill: string; files: ReadonlyMap<string, string | null> }) → HarnessPlan
      <a id="features.harness.planHarness"></a><br>Desired text of every harness file this selection owns. `files` holds the current text, null when the file is absent; `dir` is the spec directory the instructions, the skill and the deny rules name. The first broken marker or invalid JSON/TOML is `error` and `files` is empty…
      - calls [features.harness.agentsBody](features.md#features.harness.agentsBody), [features.harness.mergeMarked](features.md#features.harness.mergeMarked), [features.harness.mergeClaude](features.md#features.harness.mergeClaude), [features.harness.mergeMcpJson](features.md#features.harness.mergeMcpJson), [features.harness.mergeCodexToml](features.md#features.harness.mergeCodexToml), [features.harness.opencodeFile](features.md#features.harness.opencodeFile), [features.harness.mergeOpencode](features.md#features.harness.mergeOpencode), [features.harness.pinSkill](features.md#features.harness.pinSkill), [features.harness.mergeSettings](features.md#features.harness.mergeSettings), [features.harness.mergeHooksFile](features.md#features.harness.mergeHooksFile)
    - fn [mergeMarked](../../src/harness.ts#L293) (existing: string | null, body: string | null) → { text: string | null } | { error: string }
      <a id="features.harness.mergeMarked"></a><br>Splice `body` between the markers. Text outside them is copied byte for byte. `body` null removes the block.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [features.harness.marked](features.md#features.harness.marked)
    - fn [marked](../../src/harness.ts#L318) (body: string, nl: "\n" | "\r\n") → string <!-- internal -->
      <a id="features.harness.marked"></a><br>Normalizes every line break in the body to the requested newline style, then wraps the result between the begin and end marker constants on their own lines, so [`features.harness.mergeMarked`](features.md#features.harness.mergeMarked) can splice a consistently delimited block into existing text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [mergeClaude](../../src/harness.ts#L327) (existing: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeClaude"></a><br>`@AGENTS.md` lives in the managed block. A file that already says it outside the block is left without a second copy (the block is removed).
      - calls [features.harness.outsideMarkers](features.md#features.harness.outsideMarkers), [features.harness.mergeMarked](features.md#features.harness.mergeMarked)
    - fn [outsideMarkers](../../src/harness.ts#L334) (existing: string | null) → string | { error: string } <!-- internal -->
      <a id="features.harness.outsideMarkers"></a><br>Strips the block between the begin/end marker constants out of an existing file's text, returning the surrounding content (or an empty string for null input). Reports an error object when only one marker is present or the end precedes the begin, so… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [mergeMcpJson](../../src/harness.ts#L344) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeMcpJson"></a><br>Rewrites an `.mcp.json` document so its `mcpServers` key holds the launch entry built by [`features.harness.mcpCommand`](features.md#features.harness.mcpCommand) for the given version, or removes it when the version is null, via [`features.harness.mergeJsonKey`](features.md#features.harness.mergeJsonKey). Returns the updated text or a parse error for… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [mergeOpencode](../../src/harness.ts#L348) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeOpencode"></a><br>Builds a local MCP server entry that runs `npx -y keylang@<version> mcp` (or null when no version is given) and delegates to [`features.harness.mergeJsonKey`](features.md#features.harness.mergeJsonKey) to write it under the `mcp` key of an opencode JSON config, returning the merged text or an error. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.harness.mergeJsonKey](features.md#features.harness.mergeJsonKey)
    - fn [mergeCodexToml](../../src/harness.ts#L360) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeCodexToml"></a><br>Parses Codex TOML config and upserts or removes the keylang entry under `mcp_servers`, keeping user keys while setting the command from [`features.harness.mcpCommand`](features.md#features.harness.mcpCommand) and approval mode; returns null text if empty, or an error. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.mcpCommand](features.md#features.harness.mcpCommand)
    - fn [mergeSettings](../../src/harness.ts#L385) (existing: string | null, version: string | null, dir: string) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeSettings"></a><br>Parses an existing settings JSON via [`features.harness.parseObject`](features.md#features.harness.parseObject), updates its permission deny list ([`features.harness.mergeDeny`](features.md#features.harness.mergeDeny)) and hooks ([`features.harness.mergeHooksValue`](features.md#features.harness.mergeHooksValue)), dropping emptied keys, and serializes via [`features.harness.finishJson`](features.md#features.harness.finishJson); any error short-circuits. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.mergeDeny](features.md#features.harness.mergeDeny), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeHooksFile](../../src/harness.ts#L400) (existing: string | null, version: string | null) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksFile"></a><br>Parses existing JSON text via [`features.harness.parseObject`](features.md#features.harness.parseObject), merges its `hooks` key using [`features.harness.mergeHooksValue`](features.md#features.harness.mergeHooksValue) (removing it when undefined), and serializes via [`features.harness.finishJson`](features.md#features.harness.finishJson), passing errors through. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.mergeHooksValue](features.md#features.harness.mergeHooksValue), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [mergeDeny](../../src/harness.ts#L416) (permissions: unknown, install: boolean, dir: string) → { value: unknown } | { error: string } <!-- internal -->
      <a id="features.harness.mergeDeny"></a><br>keylang's deny entries for the spec directory `dir` are added (`install`) or removed. Its entries for the default directory are keylang's too: they go once `dir` is another one, so a changed `dir` leaves no stale entry behind.
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.denyRules](features.md#features.harness.denyRules)
    - fn [mergeHooksValue](../../src/harness.ts#L432) (hooks: unknown, version: string | null) → { value: unknown } | { error: string } <!-- internal -->
      <a id="features.harness.mergeHooksValue"></a><br>Validates a hooks object and rewrites its Stop groups via [`features.harness.rewriteGroup`](features.md#features.harness.rewriteGroup), appending the versioned [`features.harness.hookCommand`](features.md#features.harness.hookCommand) if missing and pruning empty groups, returning undefined when nothing remains. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.rewriteGroup](features.md#features.harness.rewriteGroup), [features.harness.hookCommand](features.md#features.harness.hookCommand), [features.harness.emptyGroup](features.md#features.harness.emptyGroup)
    - fn [rewriteGroup](../../src/harness.ts#L451) (group: unknown, version: string | null) → Record<string, unknown> | { error: string } <!-- internal -->
      <a id="features.harness.rewriteGroup"></a><br>Validates one hooks.Stop group and rebuilds its hook list, replacing commands matched by [`features.harness.isOurHook`](features.md#features.harness.isOurHook) with [`features.harness.hookCommand`](features.md#features.harness.hookCommand) output, or dropping them when version is null. Returns an error object for malformed entries. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.isOurHook](features.md#features.harness.isOurHook), [features.harness.hookCommand](features.md#features.harness.hookCommand)
    - fn [emptyGroup](../../src/harness.ts#L467) (group: Record<string, unknown>) → boolean <!-- internal -->
      <a id="features.harness.emptyGroup"></a><br>Returns true when the object's `hooks` is an empty array and it has no keys besides `hooks` and `matcher`. [`features.harness.mergeHooksValue`](features.md#features.harness.mergeHooksValue) uses it to detect hook groups that carry no handlers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isOurHook](../../src/harness.ts#L471) (command: string) → boolean <!-- internal -->
      <a id="features.harness.isOurHook"></a><br>Tests a hook command string against a regex matching `keylang hook stop` with an optional `@version` suffix, returning whether it is one of our own stop hooks; [`features.harness.rewriteGroup`](features.md#features.harness.rewriteGroup) uses it to filter hook entries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [mergeJsonKey](../../src/harness.ts#L475) (existing: string | null, path: readonly string[], server: unknown) → { text: string | null } | { error: string } <!-- internal -->
      <a id="features.harness.mergeJsonKey"></a><br>Parses the config text via [`features.harness.parseObject`](features.md#features.harness.parseObject), then sets or removes the `keylang` entry inside the nested object at the first path key, dropping that key when it becomes empty. Rejects a non-object value there and re-serializes with [`features.harness.finishJson`](features.md#features.harness.finishJson). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.harness.parseObject](features.md#features.harness.parseObject), [features.harness.isRecord](features.md#features.harness.isRecord), [features.harness.finishJson](features.md#features.harness.finishJson)
    - fn [parseObject](../../src/harness.ts#L489) (existing: string | null) → { value: Record<string, unknown> } | { error: string } <!-- internal -->
      <a id="features.harness.parseObject"></a><br>Turns a possibly missing config file body into a shallow-copied object: null or blank input yields `{}`, otherwise it `JSON.parse`s and checks the result with [`features.harness.isRecord`](features.md#features.harness.isRecord). Non-object values or parse failures come back as an error string instead of throwing, so… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.harness.isRecord](features.md#features.harness.isRecord)
    - fn [finishJson](../../src/harness.ts#L500) (data: Record<string, unknown>) → { text: string | null } <!-- internal -->
      <a id="features.harness.finishJson"></a><br>Serializes a merged config object into pretty-printed JSON with a trailing newline, or yields `null` when the object is empty so callers like [`features.harness.mergeSettings`](features.md#features.harness.mergeSettings) can skip writing the file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [opencodeFile](../../src/harness.ts#L505) (files: ReadonlyMap<string, string | null>) → string <!-- internal -->
      <a id="features.harness.opencodeFile"></a><br>Picks which OpenCode config filename to target: returns `opencode.json` if that entry exists with non-null content in the map, else `opencode.jsonc` if that one does, otherwise defaults to `opencode.json`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isRecord](../../src/harness.ts#L511) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="features.harness.isRecord"></a><br>Type guard that returns true only for non-null objects that are not arrays, narrowing the value to a string-keyed record. Used by [`features.harness.parseObject`](features.md#features.harness.parseObject), [`features.harness.mergeDeny`](features.md#features.harness.mergeDeny) and the other merge helpers to validate parsed config shapes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [HarnessChoice](../../src/harness.ts#L518) = "auto" | "none" | readonly HarnessName[]
      <a id="features.harness.HarnessChoice"></a><br>Which harnesses: detected from the disk, none (strip keylang's files), or a named, non-empty list.
    - fn [harnessChoice](../../src/harness.ts#L521) (flag: string | undefined) → HarnessChoice
      <a id="features.harness.harnessChoice"></a><br>`--agents=<list>` as a choice; left out, the harnesses are detected. Throws as `parseAgents` does.
      - calls [features.harness.parseAgents](features.md#features.harness.parseAgents)
    - fn [keylangVersion](../../src/harness.ts#L528) () → string
      <a id="features.harness.keylangVersion"></a><br>The version the MCP command and the Stop hook pin: the running keylang's `package.json`, from `src` and from `dist`.
    - type [HarnessCategory](../../src/harness.ts#L533) = "instructions" | "mcp" | "skill" | "settings" | "hooks"
      <a id="features.harness.HarnessCategory"></a><br>What a harness file is for, as a step before the write names it.
    - fn [harnessCategory](../../src/harness.ts#L535) (path: string) → HarnessCategory
      <a id="features.harness.harnessCategory"></a><br>Maps a harness file path to its category: root `AGENTS.md`/`CLAUDE.md` become instructions, the skill constants map to skill, specific `.claude`/`.codex` files map to settings or hooks, and anything else falls back to mcp. Used by [`features.harness.planAgents`](features.md#features.harness.planAgents) to group planned… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [diskProbe](../../src/harness.ts#L544) (root: string) → HarnessProbe
      <a id="features.harness.diskProbe"></a><br>The probe of the real disk: `.claude` and the other harness directories are directories; opencode is a file.
    - fn [resolveChoice](../../src/harness.ts#L565) (choice: HarnessChoice, probe: HarnessProbe) → HarnessSelection
      <a id="features.harness.resolveChoice"></a><br>The selection a choice resolves to on this disk: `auto` keeps the instruction block even when nothing is detected; `none` has none.
      - calls [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses)
    - type [HarnessTarget](../../src/harness.ts#L575)
      <a id="features.harness.HarnessTarget"></a><br>One file of the plan: the text it should hold (null: absent) against what is there now.
    - type [AgentsPlan](../../src/harness.ts#L587)
      <a id="features.harness.AgentsPlan"></a><br>What `keylang agents` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planAgents](../../src/harness.ts#L603) (root: string, choice: HarnessChoice) → AgentsPlan
      <a id="features.harness.planAgents"></a><br>Plans the harness files of `choice` against the disk under `root`. Reads, writes nothing; throws on a read error or a broken keylang.json.
      - calls [features.harness.resolveChoice](features.md#features.harness.resolveChoice), [features.harness.diskProbe](features.md#features.harness.diskProbe), [features.harness.specDir](features.md#features.harness.specDir), [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.skillFile](features.md#features.harness.skillFile), [features.harness.keylangVersion](features.md#features.harness.keylangVersion), [features.harness.planHarness](features.md#features.harness.planHarness), [features.harness.harnessCategory](features.md#features.harness.harnessCategory)
    - fn [readInputs](../../src/harness.ts#L619) (root: string) → Map<string, string | null> <!-- internal -->
      <a id="features.harness.readInputs"></a><br>Reads every file listed in `HARNESS_PATHS` relative to the given root, mapping each path to its UTF-8 contents or null when the file is absent. Used by [`features.harness.planAgents`](features.md#features.harness.planAgents) and [`features.harness.agentsPlanProblems`](features.md#features.harness.agentsPlanProblems) to inspect existing harness files. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [agentsPlanProblems](../../src/harness.ts#L630) (plan: AgentsPlan) → string[]
      <a id="features.harness.agentsPlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): every harness path must still hold the bytes the plan read, keylang.json must still name the same spec directory, a target must pass the repository's write rules, and `auto` must still detect the…
      - calls [features.harness.readInputs](features.md#features.harness.readInputs), [features.harness.specDir](features.md#features.harness.specDir), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.harness.detectHarnesses](features.md#features.harness.detectHarnesses), [features.harness.diskProbe](features.md#features.harness.diskProbe)
    - type [HarnessStep](../../src/harness.ts#L657)
      <a id="features.harness.HarnessStep"></a><br>One file step of a commit, with what became of it.
    - fn [commitAgents](../../src/harness.ts#L672) ( plan: AgentsPlan, options: { signal?: AbortSignal; onStep?: (step: { path: string; action: "write" | "remove" }) => void } = {}, ) → Promise<{ steps: HarnessStep[]; outcome: "completed" | "failed" | "cancelled" }>
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
    - fn [timeoutMs](../../src/llm.ts#L141) (env: Env) → number | string <!-- internal -->
      <a id="features.llm.timeoutMs"></a><br>`KEYLANG_LLM_TIMEOUT_MS`, a positive whole number of milliseconds; the reason when it is not one.
    - type [Deadline](../../src/llm.ts#L148) <!-- internal -->
      <a id="features.llm.Deadline"></a><br>A call's bound: the variable's, or the call's own when that is tighter; `fromVariable` decides whether the timeout message cites the variable.
    - fn [deadline](../../src/llm.ts#L153) (variable: number, own: number | undefined) → Deadline <!-- internal -->
      <a id="features.llm.deadline"></a><br>Picks the effective timeout by returning the caller-specific value when it is set and smaller than the environment-derived one, otherwise the environment value, tagging which source won. Used by [`features.llm.llmClient`](features.md#features.llm.llmClient) to build the request deadline. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [timeoutMessage](../../src/llm.ts#L157) (provider: string, bound: Deadline) → string <!-- internal -->
      <a id="features.llm.timeoutMessage"></a><br>Builds the error text used when an LLM call exceeds its deadline, naming the provider and the millisecond limit from `bound`. Appends a note that the limit came from the `KEYLANG_LLM_TIMEOUT_MS` environment variable when `bound.fromVariable` is set. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [callSignal](../../src/llm.ts#L166) (timeout: number, outer: AbortSignal | undefined) → { signal: AbortSignal; timedOut: () => boolean; cancelled: () => boolean; dispose: () => void } <!-- internal -->
      <a id="features.llm.callSignal"></a><br>One signal for a whole call: aborted by the deadline or by the caller's signal, whichever comes first; `dispose` clears the timer and the listener on the caller's signal, so a long-lived signal does not collect them.
    - fn [anthropicComplete](../../src/llm.ts#L190) (client: Anthropic, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.anthropicComplete"></a><br>Sends one user prompt to the Anthropic messages API under a deadline built by [`features.llm.callSignal`](features.md#features.llm.callSignal), enabling server-side fallbacks for matching models, and raises [`features.llm.LlmCancelled`](features.md#features.llm.LlmCancelled) or a timeout from [`features.llm.timeoutMessage`](features.md#features.llm.timeoutMessage) on abort. It then returns the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage)
    - fn [openrouterComplete](../../src/llm.ts#L224) (base: string, key: string, model: string, request: LlmRequest, bound: Deadline, outer?: AbortSignal) → Promise<string> <!-- internal -->
      <a id="features.llm.openrouterComplete"></a><br>Streams a chat completion from an OpenRouter-compatible endpoint under one deadline from [`features.llm.callSignal`](features.md#features.llm.callSignal), accumulating SSE deltas or reading a plain JSON reply via [`features.llm.parseJson`](features.md#features.llm.parseJson). Empty or erroring answers become errors; cancellation raises… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.llm.callSignal](features.md#features.llm.callSignal), [features.llm.parseJson](features.md#features.llm.parseJson), [features.llm.LlmCancelled](features.md#features.llm.LlmCancelled), [features.llm.timeoutMessage](features.md#features.llm.timeoutMessage)
    - fn [parseJson](../../src/llm.ts#L283) (text: string) → unknown <!-- internal -->
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
      <a id="features.lsp-features.workspace"></a><br>Builds an editor view of an analysis, reparsing generated map docs with [`lang.parser.parse`](lang.md#lang.parser.parse) when an open buffer differs from the fresh render. Its text lookup prefers open buffers, then rendered map content, then disk. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
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
      <a id="features.lsp-features.docOf"></a><br>Looks up the analyzed document matching a file path in the workspace, falling back to [`features.lsp-features.readingDoc`](features.md#features.lsp-features.readingDoc) when none is found; shared by LSP handlers like [`features.lsp-features.completions`](features.md#features.lsp-features.completions). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.lsp-features.readingDoc](features.md#features.lsp-features.readingDoc)
    - fn [readingDoc](../../src/lsp-features.ts#L166) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.readingDoc"></a><br>A file of the explained map. The analysis does not check it (it is no spec), but its IDs and code links lead where the map's do: hover, definition and Enter in the TUI work there too.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [at](../../src/lsp-features.ts#L177) (ws: Workspace, path: string, position: LspPosition) → Target | null <!-- internal -->
      <a id="features.lsp-features.at"></a><br>Resolves the symbol target under an LSP cursor position by converting it to a text offset via [`features.lsp-features.toOffset`](features.md#features.lsp-features.toOffset) and querying [`features.lsp-features.targetAt`](features.md#features.lsp-features.targetAt), returning null if the document or text is unavailable. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      <a id="features.lsp-features.hover"></a><br>Builds the LSP hover response for a position: gets hover data via [`features.lsp-features.hoverContent`](features.md#features.lsp-features.hoverContent), renders it as markdown with [`features.lsp-features.hoverMarkdown`](features.md#features.lsp-features.hoverMarkdown), and keeps its range, returning null when nothing is found. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      <a id="features.lsp-features.definition"></a><br>Resolves the target under the cursor via [`features.lsp-features.at`](features.md#features.lsp-features.at) into a go-to location: links open the referenced file at their line, and nodes jump to their source position from [`features.lsp-features.describe`](features.md#features.lsp-features.describe), otherwise null. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      <a id="features.lsp-features.symbolKind"></a><br>Maps a keylang node kind string (after stripping a leading "planned " prefix) to an LSP SymbolKind number: class, fn, type, and event get their own codes, anything else falls back to module. Used by [`features.lsp-features.workspaceSymbols`](features.md#features.lsp-features.workspaceSymbols) to tag workspace symbol results. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [symbolLocation](../../src/lsp-features.ts#L450) (ws: Workspace, hit: NodeHit) → Location | null <!-- internal -->
      <a id="features.lsp-features.symbolLocation"></a><br>Builds an LSP location for a workspace symbol: layers point to their key line in the config file via [`features.lsp-features.lineRange`](features.md#features.lsp-features.lineRange), other nodes to their file, line and column via [`features.lsp-features.lspPoint`](features.md#features.lsp-features.lspPoint). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      <a id="features.lsp-features.documentSymbols"></a><br>Builds the LSP outline tree for a document, grouping flow and rules sections and tagging each symbol with its worst verification status from [`features.lsp-features.statusOf`](features.md#features.lsp-features.statusOf); served via [`cli.lsp.Server.request`](cli.md#cli.lsp.Server.request). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.flowPhrases](features.md#features.lsp-features.flowPhrases), [lang.ir.walk](lang.md#lang.ir.walk), [features.lsp-features.statusOf](features.md#features.lsp-features.statusOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [CompletionItem](../../src/lsp-features.ts#L598)
      <a id="features.lsp-features.CompletionItem"></a><br>Shape of one entry the completion provider returns: a label with an LSP kind code, optional detail, description, sort key, and a `filterText`/`textEdit` pair that lets the dotted label replace the whole typed path rather than just the last segment after a dot. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [completions](../../src/lsp-features.ts#L625) (ws: Workspace, path: string, position: LspPosition) → CompletionItem[]
      <a id="features.lsp-features.completions"></a><br>Keywords by position at the start of an item; after `step`/`trigger` only functions and planned functions; after other reference keywords, ids that the enclosing module may depend on (`deny` removes the rest).
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.enclosing](features.md#features.lsp-features.enclosing), [features.lsp-features.sectionAt](features.md#features.lsp-features.sectionAt), [lang.parser.keywordsAt](lang.md#lang.parser.keywordsAt), [features.lsp-features.moduleAround](features.md#features.lsp-features.moduleAround), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.blocksDependency](check.md#check.rules.blocksDependency)
    - fn [sectionAt](../../src/lsp-features.ts#L673) (doc: Document, line: number) → Section | undefined <!-- internal -->
      <a id="features.lsp-features.sectionAt"></a><br>Walks the document's sections in order and returns the last one whose heading starts on or before the given line, defaulting to the first section (headingless sections count as starting at line 1). Used by [`features.lsp-features.completions`](features.md#features.lsp-features.completions) to know which section the cursor is… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [enclosing](../../src/lsp-features.ts#L683) (doc: Document, line: number, col: number) → Node | undefined <!-- internal -->
      <a id="features.lsp-features.enclosing"></a><br>The nearest item above `line` that starts left of `col`: the parent of a new item there.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [ancestors](../../src/lsp-features.ts#L692) (doc: Document, node: Node) → Node[] <!-- internal -->
      <a id="features.lsp-features.ancestors"></a><br>Walks up the parent links from [`features.lsp-features.nodesOf`](features.md#features.lsp-features.nodesOf) to return the given node followed by each enclosing node out to the root. Each step is a linear scan of the flattened node list, so the chain costs O(depth × nodes). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [moduleAround](../../src/lsp-features.ts#L705) (ws: Workspace, doc: Document, parent: Node | undefined) → string | null <!-- internal -->
      <a id="features.lsp-features.moduleAround"></a><br>The module a completion is written in: the nearest enclosing module or fn declaration.
      - calls [features.lsp-features.ancestors](features.md#features.lsp-features.ancestors)
    - type [CodeLens](../../src/lsp-features.ts#L720) <!-- internal -->
      <a id="features.lsp-features.CodeLens"></a><br>Shape of a single code lens entry returned to the LSP client: a document range plus the command to run when clicked, carrying a title, command identifier, and a list of string-array arguments. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [codeLenses](../../src/lsp-features.ts#L726) (ws: Workspace, path: string) → CodeLens[]
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
      <a id="features.node-search.candidates"></a><br>Builds the full search pool for [`features.node-search.searchNodes`](features.md#features.node-search.searchNodes): every snapshot node with its explanation via [`map.explanations.explanationOf`](map.md#map.explanations.explanationOf), plus `planned` spec declarations not yet in code, found by [`lang.ir.walk`](lang.md#lang.ir.walk). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
    - fn [proposalProblem](../../src/proposals.ts#L46) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="features.proposals.proposalProblem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A proposal replaces one hand-written spec: a Markdown file under the spec directory, not one keylang generates (the map, the explained map, a saved model explanation, a file with the generated marker), and not reached…
      - calls [features.proposals.notPlain](features.md#features.proposals.notPlain), [features.proposals.unreadDirectory](features.md#features.proposals.unreadDirectory), [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [lang.files.existingText](lang.md#lang.files.existingText), [lang.parser.parse](lang.md#lang.parser.parse), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.proposals.generatedSpecProblem](features.md#features.proposals.generatedSpecProblem)
    - fn [generatedSpecProblem](../../src/proposals.ts#L74) (marker: string | null, specDir: string) → string <!-- internal -->
      <a id="features.proposals.generatedSpecProblem"></a><br>The refusal for a generated spec, naming the command its marker names (`keylang baseline` for the baseline; `keylang map` otherwise).
    - fn [codeProposalProblem](../../src/proposals.ts#L88) (root: string, path: string) → string | null
      <a id="features.proposals.codeProposalProblem"></a><br>Why a proposal for the source file `path` may not be merged, or null: a file of a language keylang reads, a plain relative path inside the repository (links included, one whose target does not exist yet too), outside the directories sources are not read from, and not one…
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [features.proposals.notPlain](features.md#features.proposals.notPlain), [features.proposals.unreadDirectory](features.md#features.proposals.unreadDirectory), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText)
    - fn [targetProblem](../../src/proposals.ts#L102) (root: string, specDir: string, path: string, generated?: (path: string) => boolean) → string | null
      <a id="features.proposals.targetProblem"></a><br>The gate of a proposal's target: a Markdown file is a spec, any other a source file.
      - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem)
    - type [ProposalBasis](../../src/proposals.ts#L111)
      <a id="features.proposals.ProposalBasis"></a><br>What a proposal was built from: the target on disk and the proposal already waiting for it (null: no file). A write that carries it lands only while both are still so.
    - fn [proposalWriteProblem](../../src/proposals.ts#L121) (root: string, path: string, basis: ProposalBasis) → string | null
      <a id="features.proposals.proposalWriteProblem"></a><br>Why the proposal of `path` built from `basis` may not be written now, or null: the target or the waiting proposal changed, appeared or went away since, or the store breaks the write policy. Each reason names its file.
      - calls [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - fn [writeProposal](../../src/proposals.ts#L137) (root: string, path: string, text: string, basis?: ProposalBasis) → string
      <a id="features.proposals.writeProposal"></a><br>Writes the proposal for `path` (relative, POSIX) atomically and returns its file; `.keylang/proposals/` is keylang's own store, so a link there that leads elsewhere is refused like any other. With `basis` nothing is written unless the target and the waiting proposal are still…
      - calls [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [lineDiff](../../src/proposals.ts#L146) (before: string, after: string) → string
      <a id="features.proposals.lineDiff"></a><br>`-`/`+` lines between a common prefix and suffix: enough to see what a proposal changes.
    - type [PendingProposal](../../src/proposals.ts#L163)
      <a id="features.proposals.PendingProposal"></a><br>One pending proposal as `keylang proposals` lists it.
    - fn [proposalTarget](../../src/proposals.ts#L180) (name: string) → string | null
      <a id="features.proposals.proposalTarget"></a><br>The target of a proposal as a person names it: as `keylang proposals` lists it, or as its store path `.keylang/proposals/<target>`; POSIX. Null when it is no plain relative path.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.notPlain](features.md#features.proposals.notPlain)
    - fn [pendingTargets](../../src/proposals.ts#L191) (root: string) → string[]
      <a id="features.proposals.pendingTargets"></a><br>Every target with a file or a link under `.keylang/proposals/`, sorted. The store is listed only while it stays inside the repository; a link in it is listed, never followed.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [storeEntry](../../src/proposals.ts#L206) (root: string, target: string) → { abs: string; link: boolean } | { problem: string } | null <!-- internal -->
      <a id="features.proposals.storeEntry"></a><br>The store entry of `target` where its directory lands: null when there is none, else the entry and whether it is a link. A store whose directory leads out of the repository is a problem, and nothing there is looked at.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within)
    - type [ReadProposal](../../src/proposals.ts#L220) <!-- internal -->
      <a id="features.proposals.ReadProposal"></a><br>A proposal that may be accepted: its text and the target's (null: no file).
    - fn [readProposal](../../src/proposals.ts#L230) (root: string, specDir: string, target: string) → ReadProposal | { problem: string } | null <!-- internal -->
      <a id="features.proposals.readProposal"></a><br>The proposal of `target` read after both gates — a plain file in the store, a target a proposal may change — or why it cannot be accepted; null when none is pending.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [features.proposals.targetProblem](features.md#features.proposals.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [lang.files.existingText](lang.md#lang.files.existingText)
    - fn [lineCounts](../../src/proposals.ts#L241) (before: string, after: string) → { added: number; removed: number } <!-- internal -->
      <a id="features.proposals.lineCounts"></a><br>`+` and `-` lines `lineDiff` prints.
      - calls [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - fn [listProposals](../../src/proposals.ts#L247) (root: string, specDir: string) → PendingProposal[]
      <a id="features.proposals.listProposals"></a><br>Every pending proposal with its target, line counts and why it cannot be accepted. Reads only.
      - calls [features.proposals.pendingTargets](features.md#features.proposals.pendingTargets), [features.proposals.readProposal](features.md#features.proposals.readProposal), [features.proposals.lineCounts](features.md#features.proposals.lineCounts)
    - type [ProposalDiff](../../src/proposals.ts#L256)
      <a id="features.proposals.ProposalDiff"></a><br>What `keylang proposals show <target>` prints, or why not. Reads only.
    - fn [proposalDiff](../../src/proposals.ts#L258) (root: string, specDir: string, target: string) → ProposalDiff
      <a id="features.proposals.proposalDiff"></a>
      - calls [features.proposals.readProposal](features.md#features.proposals.readProposal), [features.proposals.lineDiff](features.md#features.proposals.lineDiff)
    - type [AcceptResult](../../src/proposals.ts#L265)
      <a id="features.proposals.AcceptResult"></a>
    - fn [acceptProposal](../../src/proposals.ts#L283) (root: string, specDir: string, target: string) → AcceptResult
      <a id="features.proposals.acceptProposal"></a><br>`keylang proposals accept <target>`: the proposal's full text replaces the target, as MERGE does with every hunk accepted. The same gates as MERGE (the target's, a plain file in the store), a target that is not writable (a person's `chmod a-w`) is refused, and the write follows…
      - calls [features.proposals.readProposal](features.md#features.proposals.readProposal), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.dropProposal](features.md#features.proposals.dropProposal), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [features.proposals.countDecision](features.md#features.proposals.countDecision), [features.proposals.lineCounts](features.md#features.proposals.lineCounts)
    - type [RejectResult](../../src/proposals.ts#L306)
      <a id="features.proposals.RejectResult"></a>
    - fn [rejectProposal](../../src/proposals.ts#L313) (root: string, specDir: string, target: string) → RejectResult
      <a id="features.proposals.rejectProposal"></a><br>`keylang proposals reject <target>`: the proposal is removed and the target stays as it is. A proposal no gate admits is still the person's to drop; a link in the store is removed itself, never followed.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [features.proposals.targetProblem](features.md#features.proposals.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [features.proposals.countDecision](features.md#features.proposals.countDecision), [lang.files.existingText](lang.md#lang.files.existingText)
    - fn [dropProposal](../../src/proposals.ts#L326) (root: string, target: string, text: string) → string | null <!-- internal -->
      <a id="features.proposals.dropProposal"></a><br>Removes the proposal while it still holds `text`: null, or why it stays.
      - calls [features.proposals.storeEntry](features.md#features.proposals.storeEntry), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [countDecision](../../src/proposals.ts#L338) (root: string, before: string, after: string, decision: "accepted" | "rejected") → void <!-- internal -->
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
      - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [lang.files.existingText](lang.md#lang.files.existingText), [features.spec-to-code.modelBody](features.md#features.spec-to-code.modelBody), [features.spec-to-code.stubFor](features.md#features.spec-to-code.stubFor), [features.spec-to-code.placeStub](features.md#features.spec-to-code.placeStub), [features.spec-to-code.phpFileHead](features.md#features.spec-to-code.phpFileHead), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [map.analyze.analyze](map.md#map.analyze.analyze), [features.spec-to-code.introduced](features.md#features.spec-to-code.introduced), [features.spec-to-code.testCandidates](features.md#features.spec-to-code.testCandidates)
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
    - fn [specStatements](../../src/stale.ts#L72) (docs: readonly Document[]) → Statement[]
      <a id="features.stale.specStatements"></a><br>The statements of hand-written specs: descriptions of nodes in map and flow sections, and every flow `when`, `then` and `invariant`. Generated map files are skipped: their text is the code's own.
      - calls [features.stale.sectionRefs](features.md#features.stale.sectionRefs), [features.stale.subtreeRefs](features.md#features.stale.subtreeRefs), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [subtreeRefs](../../src/stale.ts#L107) (node: Node) → string[] <!-- internal -->
      <a id="features.stale.subtreeRefs"></a><br>Collects the target strings of every ref on a node and, recursively, on all of its descendants, returning them as one flat list; [`features.stale.specStatements`](features.md#features.stale.specStatements) uses it to gather the references a document subtree points at. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [sectionRefs](../../src/stale.ts#L111) (section: Section) → string[] <!-- internal -->
      <a id="features.stale.sectionRefs"></a><br>Collects every reference ID found anywhere in a document section by expanding its nodes via [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes) and flattening each node's subtree references into one list. Used by [`features.stale.specStatements`](features.md#features.stale.specStatements) to tie spec statements to the code they mention. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
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
      <a id="features.stats.readStats"></a><br>Returns the parsed stats for a repository root by delegating to [`features.stats.readStatsFile`](features.md#features.stats.readStatsFile) and discarding the raw file text it also yields. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      <a id="features.voice-local.loadDecibri"></a><br>Loads the `decibri` package through [`features.voice-local.optional`](features.md#features.voice-local.optional) and checks that it exports a `Microphone` function. Returns the typed module on success, otherwise the load failure or an "unavailable" status. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
