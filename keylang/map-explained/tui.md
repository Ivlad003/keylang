<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [actions](#tui.actions) · [analysis-worker](#tui.analysis-worker) · [app](#tui.app) · [assist](#tui.assist) · [background](#tui.background) · [buffer](#tui.buffer) · [code-highlight](#tui.code-highlight) · [disk](#tui.disk) · [evidence](#tui.evidence) · [findings](#tui.findings) · [input](#tui.input) · [markdown](#tui.markdown) · [merge-session](#tui.merge-session) · [merge](#tui.merge) · [nav](#tui.nav) · [new-spec](#tui.new-spec) · [operation-worker](#tui.operation-worker) · [screen](#tui.screen) · [state](#tui.state) · [terminal](#tui.terminal) · [text-to-spec](#tui.text-to-spec) · [theme](#tui.theme) · [view](#tui.view) · [web](#tui.web) · [width](#tui.width)

# map

- tui
  <a id="tui"></a><br>The interactive editor: a session ([`tui.app`](tui.md#tui.app), [`tui.state`](tui.md#tui.state)) decodes input ([`tui.input`](tui.md#tui.input)), draws frames into a grid ([`tui.view`](tui.md#tui.view), [`tui.screen`](tui.md#tui.screen)), and runs analysis in workers ([`tui.background`](tui.md#tui.background)). The same session serves a terminal ([`tui.terminal`](tui.md#tui.terminal)) or a browser over WebSocket… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
  - module [actions](../../src/tui/actions.ts#L1)
    <a id="tui.actions"></a><br>The catalogue of TUI actions: one registry used by the palette (`:` / Ctrl+P) and by the help popup. An action has a stable id, a label, a group, search aliases, an optional key hint and an availability predicate with a reason; `App.runAction(id)` executes it.
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - state [tui.state](tui.md#tui.state)
    - type [ActionContext](../../src/tui/actions.ts#L13)
      <a id="tui.actions.ActionContext"></a><br>What availability predicates may look at. Derived from `State` only.
    - type [Action](../../src/tui/actions.ts#L40)
      <a id="tui.actions.Action"></a><br>Shape of a user-invokable TUI command: identity, menu label and group, searchable aliases, an optional hotkey, plus two context-driven hooks — `when` returning a reason the command is currently blocked (or null) and `note` returning a non-blocking setup hint. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ActionEntry](../../src/tui/actions.ts#L52)
      <a id="tui.actions.ActionEntry"></a><br>Pairs an `Action` with its availability status: `reason` holds the text explaining why it cannot run right now (null when runnable), and `note` carries an advisory message that does not block execution. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [mergeOnly](../../src/tui/actions.ts#L66) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.mergeOnly"></a><br>Returns the constant reason string when the context's `merge` flag is set, and `null` otherwise; used by TUI action gating to signal that an action is blocked or applies only in merge mode. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [editor](../../src/tui/actions.ts#L67) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.editor"></a><br>Returns a reason string explaining why the editor is unavailable: the merge reason when the context is in merge mode, else the start reason when it is starting, otherwise null. Used by [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) and [`tui.actions.snapshot`](tui.md#tui.actions.snapshot) to gate their actions. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [bufferOrMerge](../../src/tui/actions.ts#L68) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.bufferOrMerge"></a><br>Returns whatever blocking reason [`tui.actions.editor`](tui.md#tui.actions.editor) reports, otherwise falls back to "no file open" when no current file is set, or null when the action may proceed. Shared precondition check used by [`tui.actions.viewOnly`](tui.md#tui.actions.viewOnly) and [`tui.actions.writable`](tui.md#tui.actions.writable). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.editor](tui.md#tui.actions.editor)
    - fn [snapshot](../../src/tui/actions.ts#L69) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.snapshot"></a><br>Resolves the text to display for the current context by first asking [`tui.actions.editor`](tui.md#tui.actions.editor) for a value and, when that yields nothing, falling back to the context's `noSnapshot` field. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.editor](tui.md#tui.actions.editor)
    - fn [running](../../src/tui/actions.ts#L70) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.running"></a><br>Guard that checks whether `ctx.operation` is set and, if so, returns the message "an operation is already running" so an action can be blocked; otherwise yields null to allow it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [viewOnly](../../src/tui/actions.ts#L72) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.viewOnly"></a><br>Returns a message explaining why a view-only key is blocked: first whatever [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) reports, else a hint to press Esc when the mode is "edit" or "code", else null meaning the action is allowed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.bufferOrMerge](tui.md#tui.actions.bufferOrMerge)
    - fn [writable](../../src/tui/actions.ts#L74) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.writable"></a><br>Returns a reason string blocking a write action, deferring first to [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) and otherwise reporting read-only generated map files when `readOnly` is set. Yields null when writing is allowed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.bufferOrMerge](tui.md#tui.actions.bufferOrMerge)
    - fn [openAction](../../src/tui/actions.ts#L364) (path: string) → Action
      <a id="tui.actions.openAction"></a><br>The per-file "open" action of the palette.
    - fn [catalog](../../src/tui/actions.ts#L369) (state: State) → ActionEntry[]
      <a id="tui.actions.catalog"></a><br>The full catalogue for the current session: static actions plus one "open" entry per file.
      - calls [tui.actions.availabilityOf](tui.md#tui.actions.availabilityOf), [tui.actions.openAction](tui.md#tui.actions.openAction)
    - fn [availabilityOf](../../src/tui/actions.ts#L375) (state: State) → ActionContext
      <a id="tui.actions.availabilityOf"></a><br>The availability context of the current session state.
      - calls [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.actions.applyRecord](tui.md#tui.actions.applyRecord), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent)
    - fn [exportRecord](../../src/tui/actions.ts#L403) (state: Pick<State, "records" | "results">) → { record: OperationRecord } | { reason: string }
      <a id="tui.actions.exportRecord"></a><br>The report Export saves: the record selected in F6 while the panel is open, else the newest check, explain-edge, parse or trace-plan record — exactly that run, as it ran.
    - fn [applyRecord](../../src/tui/actions.ts#L418) (state: Pick<State, "records" | "results">) → { record: OperationRecord } | { reason: string }
      <a id="tui.actions.applyRecord"></a><br>The spec-to-code run whose candidate Apply writes: the record selected in F6 while the panel is open, else the newest spec-to-code record. The file checks (unsaved edits, an open MERGE, a waiting proposal) come when it runs.
    - fn [noSnapshotReason](../../src/tui/actions.ts#L429) (state: Pick<State, "analysis" | "config" | "error" | "updating">) → string | null
      <a id="tui.actions.noSnapshotReason"></a><br>Why the session has no code snapshot, or null when it has one. Also the status line's note.
    - fn [actionKey](../../src/tui/actions.ts#L444) (action: Action, mode: State["mode"]) → string | null
      <a id="tui.actions.actionKey"></a><br>The key of an action as the mode has it, or null. A plain key (a letter, `?`, `/`, Enter) is a key of the view: in editing it types text, and MERGE and the code viewer give letters their own meaning, so there it is not advertised — Ctrl+P runs the action instead.
    - fn [actionLabel](../../src/tui/actions.ts#L451) (action: Action, mode: State["mode"] = "view") → string
      <a id="tui.actions.actionLabel"></a><br>The palette item text of an action: its label, with the key hint when the mode has one.
      - calls [tui.actions.actionKey](tui.md#tui.actions.actionKey)
    - fn [matchActions](../../src/tui/actions.ts#L457) (entries: readonly ActionEntry[], query: string) → ActionEntry[]
      <a id="tui.actions.matchActions"></a><br>The catalogue entries matching `query`: every query word is a subsequence of some token of the label, key or aliases.
      - calls [tui.actions.searchText](tui.md#tui.actions.searchText), [tui.actions.subsequence](tui.md#tui.actions.subsequence), [tui.actions.fileName](tui.md#tui.actions.fileName)
    - fn [fileName](../../src/tui/actions.ts#L477) (id: string) → string <!-- internal -->
      <a id="tui.actions.fileName"></a><br>`rules` for `open:keylang/rules.md`: the base name without its extension, lower case.
    - fn [searchText](../../src/tui/actions.ts#L482) (action: Action) → string <!-- internal -->
      <a id="tui.actions.searchText"></a><br>Builds a single space-joined string from an action's label, optional key, and aliases, which [`tui.actions.matchActions`](tui.md#tui.actions.matchActions) uses as the haystack when filtering entries against a query. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [subsequence](../../src/tui/actions.ts#L486) (text: string, query: string) → boolean <!-- internal -->
      <a id="tui.actions.subsequence"></a><br>Checks whether every character of the query appears in order (not necessarily adjacently) within the text, advancing a cursor on each match and returning true only if the cursor consumes the whole query. Used by [`tui.actions.matchActions`](tui.md#tui.actions.matchActions) for fuzzy filtering of action entries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [analysis-worker](../../src/tui/analysis-worker.ts#L1)
    <a id="tui.analysis-worker"></a><br>Worker entry of `SnapshotWorker`: builds the map for a config and overlay.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - map [map.map](map.md#map.map)
  - module [app](../../src/tui/app.ts#L1)
    <a id="tui.app"></a><br>One TUI session: state, input handling, and the analysis behind it. A transport (terminal or WebSocket) attaches a `Surface`, feeds raw input and sizes, and gets ANSI frames back; the session does not know which one it is, except that only a terminal can hand the screen to…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - check-results [features.check-results](features.md#features.check-results)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - explain-edge [features.explain-edge](features.md#features.explain-edge)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - llm [features.llm](features.md#features.llm)
    - explain [features.explain](features.md#features.explain)
    - explanations [map.explanations](map.md#map.explanations)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - baseline [features.baseline](features.md#features.baseline)
    - harness [features.harness](features.md#features.harness)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - draft [features.draft](features.md#features.draft)
    - spec-to-code [features.spec-to-code](features.md#features.spec-to-code)
    - proposals [features.proposals](features.md#features.proposals)
    - operations [operations.operations](operations.md#operations.operations)
    - check-format [features.check-format](features.md#features.check-format)
    - diag [base.diag](base.md#base.diag)
    - parse-format [lang.parse-format](lang.md#lang.parse-format)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - span [base.span](base.md#base.span)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - actions [tui.actions](tui.md#tui.actions)
    - assist [tui.assist](tui.md#tui.assist)
    - background [tui.background](tui.md#tui.background)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - disk [tui.disk](tui.md#tui.disk)
    - new-spec [tui.new-spec](tui.md#tui.new-spec)
    - findings [tui.findings](tui.md#tui.findings)
    - input [tui.input](tui.md#tui.input)
    - merge-session [tui.merge-session](tui.md#tui.merge-session)
    - screen [tui.screen](tui.md#tui.screen)
    - state [tui.state](tui.md#tui.state)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - text-to-spec [tui.text-to-spec](tui.md#tui.text-to-spec)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - type [Surface](../../src/tui/app.ts#L71)
      <a id="tui.app.Surface"></a><br>Abstracts the output target the TUI renders to: a `kind` tag distinguishing terminal from web, a `write` sink that receives ANSI strings, and an optional terminal-only hook that opens a file at a line in `$EDITOR`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Analyzer](../../src/tui/app.ts#L78) = (request: AnalysisRequest) => Promise<Analysis>
      <a id="tui.app.Analyzer"></a><br>Function-type alias: takes an `AnalysisRequest` and resolves to an `Analysis`, letting the TUI receive its analysis backend by injection rather than importing the extractor or tree-sitter directly. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OperationRunner](../../src/tui/app.ts#L81)
      <a id="tui.app.OperationRunner"></a><br>Runs one explicit operation; the session's default is the shared `runOperation`. Tests inject a gated one.
    - type [AppOptions](../../src/tui/app.ts#L83)
      <a id="tui.app.AppOptions"></a><br>Configuration bundle for starting a TUI session: repository root, terminal size, an optional analyzer, quit callback, and microphone PCM source, plus injectable operation runner and worker so tests can gate or replace how feature and map-check jobs execute. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [App](../../src/tui/app.ts#L117)
      <a id="tui.app.App"></a><br>The terminal session: it owns the editor state, decodes keys into edits and commands, runs analyses and operations (dropping in-flight analyses around a file-writing commit), and draws frames onto an attached surface via [`tui.app.App.draw`](tui.md#tui.app.App.draw). Proposals, merges and model-backed… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [barrierInputs](../../src/tui/app.ts#L150) () <!-- internal -->
        <a id="tui.app.App.barrierInputs"></a><br>Which dirty buffers the open save step lists: the inputs its operation reads.
      - fn [constructor](../../src/tui/app.ts#L163) (options: AppOptions)
        <a id="tui.app.App.constructor"></a><br>Builds the editor's initial state, routes doctor requests to [`operations.operations.runOperation`](operations.md#operations.operations.runOperation) and the rest to [`tui.app.App.worker`](tui.md#tui.app.App.worker), and wires [`tui.merge-session.MergeSession`](tui.md#tui.merge-session.MergeSession) and [`tui.assist.Assist`](tui.md#tui.assist.Assist) through closures. It then lists files via [`tui.app.App.diskFiles`](tui.md#tui.app.App.diskFiles), opens… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.input.InputDecoder](tui.md#tui.input.InputDecoder), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [tui.app.App.worker](tui.md#tui.app.App.worker), [tui.merge-session.MergeSession](tui.md#tui.merge-session.MergeSession), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon), [tui.assist.Assist](tui.md#tui.assist.Assist), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.configState](tui.md#tui.app.configState), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [attach](../../src/tui/app.ts#L258) (surface: Surface, cols: number, rows: number) → void
        <a id="tui.app.App.attach"></a><br>Stores the given render surface on the app, clears the cached previous frame so the next draw repaints fully, and delegates to [`tui.app.App.resize`](tui.md#tui.app.App.resize) to apply the new dimensions. Invoked by [`tui.terminal.runTerminal`](tui.md#tui.terminal.runTerminal) when wiring the app to a terminal. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.resize](tui.md#tui.app.App.resize)
      - fn [detach](../../src/tui/app.ts#L265) () → void
        <a id="tui.app.App.detach"></a><br>No surface: the screen belongs to someone else (a reconnect, `$EDITOR`, a stop); nothing is drawn.
      - fn [resize](../../src/tui/app.ts#L269) (cols: number, rows: number) → void
        <a id="tui.app.App.resize"></a><br>Clamps the viewport size to a 20..MAX_COLS by 8..MAX_ROWS range, clears the hover target, then calls [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible) and [`tui.app.App.draw`](tui.md#tui.app.App.draw) to realign and repaint the screen. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [input](../../src/tui/app.ts#L277) (chunk: string) → void
        <a id="tui.app.App.input"></a><br>Decodes a raw terminal chunk into key events via [`tui.input.InputDecoder.feed`](tui.md#tui.input.InputDecoder.feed), collapsing long typed runs into a single paste outside prompts and results, and dispatches each through [`tui.app.App.safely`](tui.md#tui.app.App.safely). Pending escape or paste bytes are flushed on a timer with… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.input.InputDecoder.feed](tui.md#tui.input.InputDecoder.feed), [tui.app.typedRun](tui.md#tui.app.typedRun), [tui.app.App.safely](tui.md#tui.app.App.safely), [tui.input.InputDecoder.flush](tui.md#tui.input.InputDecoder.flush), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [safely](../../src/tui/app.ts#L313) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.safely"></a><br>One event; a failure (a file that cannot be written) is a message, never the end of the session and its unsaved buffers.
        - calls [tui.app.App.handle](tui.md#tui.app.App.handle), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.assist.Assist.cancelStaleGhost](tui.md#tui.assist.Assist.cancelStaleGhost)
      - fn [frame](../../src/tui/app.ts#L324) () → Grid
        <a id="tui.app.App.frame"></a><br>The current frame, as the transport would show it.
        - calls [tui.view.render](tui.md#tui.view.render)
      - fn [unsaved](../../src/tui/app.ts#L329) () → string[]
        <a id="tui.app.App.unsaved"></a><br>Files with unsaved changes.
      - fn [idle](../../src/tui/app.ts#L334) () → Promise<void>
        <a id="tui.app.App.idle"></a><br>Resolves when no analysis is running or waiting to start.
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [close](../../src/tui/app.ts#L339) () → void
        <a id="tui.app.App.close"></a><br>Marks the app closed, clears pending escape and settle timers, shuts the assistant via [`tui.assist.Assist.close`](tui.md#tui.assist.Assist.close), and drops the render surface. It then cancels any running operation and its worker before calling [`tui.app.App.wake`](tui.md#tui.app.App.wake) so waiters unblock. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.assist.Assist.close](tui.md#tui.assist.Assist.close), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [draw](../../src/tui/app.ts#L354) () → void <!-- internal -->
        <a id="tui.app.App.draw"></a><br>Renders the current state into a character grid via [`tui.view.render`](tui.md#tui.view.render), then writes only the changes from the last frame to the terminal surface using [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff), caching the grid for the next diff. Does nothing when no surface is attached. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.view.render](tui.md#tui.view.render), [tui.screen.renderDiff](tui.md#tui.screen.renderDiff)
      - fn [redraw](../../src/tui/app.ts#L362) () → void
        <a id="tui.app.App.redraw"></a><br>Full repaint.
        - calls [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [overlay](../../src/tui/app.ts#L369) () → Map<string, string> <!-- internal -->
        <a id="tui.app.App.overlay"></a><br>Builds a map from absolute file paths to the in-memory text of every editable buffer that [`tui.buffer.isDirty`](tui.md#tui.buffer.isDirty) reports as modified, skipping the `keylang.json` config file. [`tui.app.App.reanalyze`](tui.md#tui.app.App.reanalyze) passes this so analysis sees unsaved edits instead of the on-disk contents. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [reanalyze](../../src/tui/app.ts#L377) (explicit = true) → void
        <a id="tui.app.App.reanalyze"></a><br>`F5` or a save (`explicit`), or typing that settled: analyse now.
        - calls [tui.app.App.readConfig](tui.md#tui.app.App.readConfig), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.overlay](tui.md#tui.app.App.overlay), [tui.app.App.selectedFinding](tui.md#tui.app.App.selectedFinding), [tui.app.App.adoptResult](tui.md#tui.app.App.adoptResult), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [readConfig](../../src/tui/app.ts#L426) (explicit: boolean) → boolean <!-- internal -->
        <a id="tui.app.App.readConfig"></a><br>Reads `keylang.json` again before a run. False: it is invalid, and the analyzer is not run — it would only fail with the same error again.
        - calls [tui.app.configState](tui.md#tui.app.configState), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig)
      - fn [openConfig](../../src/tui/app.ts#L442) (reason: string, remember: boolean) → void <!-- internal -->
        <a id="tui.app.App.openConfig"></a><br>Opens `keylang.json` as text with the cursor on the field (or the JSON position) the reason names.
        - calls [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.configErrorCursor](tui.md#tui.app.configErrorCursor)
      - fn [browse](../../src/tui/app.ts#L448) () → void <!-- internal -->
        <a id="tui.app.App.browse"></a><br>The start screen's Browse: the current analysis with the guessed configuration; nothing is written.
        - calls [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [startKey](../../src/tui/app.ts#L454) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.startKey"></a><br>Keys of the start screen: choose an item; the palette, help, F6 and quitting work as elsewhere.
        - calls [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.browse](tui.md#tui.app.App.browse), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [adoptResult](../../src/tui/app.ts#L465) (analysis: Analysis, edits: number, selected: CheckResult | undefined) → void <!-- internal -->
        <a id="tui.app.App.adoptResult"></a><br>Clears the updating/error state, flags the marks as outdated when the edit count changed during the run, and installs the analysis via [`tui.app.App.adopt`](tui.md#tui.app.App.adopt). Then re-locates the previously selected finding in the new visible list with [`tui.findings.sameResult`](tui.md#tui.findings.sameResult) and clamps the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.adopt](tui.md#tui.app.App.adopt), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.sameResult](tui.md#tui.findings.sameResult), [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [reanalyzeSoon](../../src/tui/app.ts#L478) () → void <!-- internal -->
        <a id="tui.app.App.reanalyzeSoon"></a><br>Typing: mark results outdated now, analyse once the typing settles.
        - calls [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [track](../../src/tui/app.ts#L491) (work: Promise<void>) → void <!-- internal -->
        <a id="tui.app.App.track"></a><br>Async work of a helper (a model, a microphone): `idle()` waits for it, and the frame follows it.
        - calls [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [quiet](../../src/tui/app.ts#L500) () → boolean <!-- internal -->
        <a id="tui.app.App.quiet"></a><br>Reports whether the TUI is fully idle: no in-flight work counted, no pending settle timer, and the assistant not waiting on anything. [`tui.app.App.idle`](tui.md#tui.app.App.idle) and [`tui.app.App.wake`](tui.md#tui.app.App.wake) use it to decide whether to resolve or re-arm. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [wake](../../src/tui/app.ts#L504) () → void <!-- internal -->
        <a id="tui.app.App.wake"></a><br>Checks via [`tui.app.App.quiet`](tui.md#tui.app.App.quiet) whether no work is pending and, if so, drains the queued waiter callbacks, resetting the list and invoking each one to release anyone awaiting idleness. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [adopt](../../src/tui/app.ts#L512) (analysis: Analysis) → void <!-- internal -->
        <a id="tui.app.App.adopt"></a><br>Files and clean buffers follow the new analysis (a regenerated map, a change on disk).
        - calls [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [readOnlyReason](../../src/tui/app.ts#L554) (path: string) → string <!-- internal -->
        <a id="tui.app.App.readOnlyReason"></a><br>Why a generated buffer takes no edits, naming its generator.
        - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [specDir](../../src/tui/app.ts#L561) () → string <!-- internal -->
        <a id="tui.app.App.specDir"></a><br>The spec directory of the saved configuration (`keylang` when it cannot be read).
        - calls [base.config.loadConfig](base.md#base.config.loadConfig)
      - fn [diskFiles](../../src/tui/app.ts#L569) () → string[] <!-- internal -->
        <a id="tui.app.App.diskFiles"></a><br>Lists the editable spec files on disk: every `.md` under the spec directory from [`tui.app.App.specDir`](tui.md#tui.app.App.specDir) (via [`lang.files.collectMdFiles`](lang.md#lang.files.collectMdFiles)), excluding the `explain` store filtered with [`map.analyze.within`](map.md#map.analyze.within), as root-relative POSIX paths through [`base.config.toPosix`](base.md#base.config.toPosix). Appends the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [buffer](../../src/tui/app.ts#L582) () → Buffer | null <!-- internal -->
        <a id="tui.app.App.buffer"></a><br>Looks up the buffer for the currently active file key in the app state's buffer map, returning null when no file is current or the key has no entry. Nearly every editing and cursor method in [`tui.app.App`](tui.md#tui.app.App) goes through it to reach the open document. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [load](../../src/tui/app.ts#L586) (path: string) → Buffer <!-- internal -->
        <a id="tui.app.App.load"></a><br>Returns the cached editor buffer for a path, or builds one by reading the file via [`tui.disk.readText`](tui.md#tui.disk.readText), preferring the analysis-side text from [`features.lsp-features.workspace`](features.md#features.lsp-features.workspace) when present. The content is split by [`tui.disk.splitEol`](tui.md#tui.disk.splitEol), wrapped with [`tui.buffer.newBuffer`](tui.md#tui.buffer.newBuffer), and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.newBuffer](tui.md#tui.buffer.newBuffer)
      - fn [open](../../src/tui/app.ts#L598) (path: string, cursor: Cursor, remember = true) → void <!-- internal -->
        <a id="tui.app.App.open"></a><br>Switches the TUI to a file: clears the start screen, pushes the current location onto the back stack when asked, loads the buffer via [`tui.app.App.load`](tui.md#tui.app.App.load), and resets cursor, mode, selection, and hover. Then it clamps the cursor with [`tui.app.App.clampCursor`](tui.md#tui.app.App.clampCursor) and scrolls so it… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [lines](../../src/tui/app.ts#L615) () → readonly string[] <!-- internal -->
        <a id="tui.app.App.lines"></a><br>Returns the current buffer's text as lines by fetching it via [`tui.app.App.buffer`](tui.md#tui.app.App.buffer) and splitting with [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines), yielding an empty array when no buffer is open. Used by search, mouse, and key handlers to resolve cursor positions. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
      - fn [clampCursor](../../src/tui/app.ts#L620) () → void <!-- internal -->
        <a id="tui.app.App.clampCursor"></a><br>Clamps the editor cursor so its line stays within the lines returned by [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines) and its column within the cluster count from [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout). When [`tui.app.App.buffer`](tui.md#tui.app.App.buffer) yields no buffer, the cursor is reset to the origin. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [keepVisible](../../src/tui/app.ts#L633) () → void <!-- internal -->
        <a id="tui.app.App.keepVisible"></a><br>Scrolls so the cursor is on screen; the layout of its line answers in logarithmic time, however long the line.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.scrollToFit](tui.md#tui.width.scrollToFit)
      - fn [edit](../../src/tui/app.ts#L649) (change: (lines: string[], cursor: Cursor) => void, coalesce = false) → void <!-- internal -->
        <a id="tui.app.App.edit"></a><br>Applies a caller-supplied mutation to the current buffer's lines and cursor, refusing read-only buffers with a message and recording an undo snapshot (capped at 200, optionally coalesced with the previous one). Afterwards it writes the text via [`tui.buffer.setText`](tui.md#tui.buffer.setText), clamps and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.readOnlyReason](tui.md#tui.app.App.readOnlyReason), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [save](../../src/tui/app.ts#L670) () → void <!-- internal -->
        <a id="tui.app.App.save"></a><br>Writes the current buffer to disk via [`tui.app.App.persist`](tui.md#tui.app.App.persist) and then [`tui.app.App.reanalyze`](tui.md#tui.app.App.reanalyze), skipping read-only buffers, in-progress writes, and new files whose path is already occupied per [`tui.app.App.newFileProblem`](tui.md#tui.app.App.newFileProblem). If [`tui.app.App.changedOnDisk`](tui.md#tui.app.App.changedOnDisk) reports external changes… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.app.App.changedOnDisk](tui.md#tui.app.App.changedOnDisk), [tui.app.App.persist](tui.md#tui.app.App.persist), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [changedOnDisk](../../src/tui/app.ts#L691) (buffer: Buffer) → boolean <!-- internal -->
        <a id="tui.app.App.changedOnDisk"></a><br>Reads the file at the buffer's path under the workspace root via [`tui.disk.readText`](tui.md#tui.disk.readText) and reports whether its current contents differ from the snapshot the buffer last saw on disk. Used by [`tui.app.App.save`](tui.md#tui.app.App.save) and [`tui.app.App.saveAndContinue`](tui.md#tui.app.App.saveAndContinue) to detect external edits before… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.disk.readText](tui.md#tui.disk.readText)
      - fn [newFileProblem](../../src/tui/app.ts#L700) (buffer: Buffer) → string | null <!-- internal -->
        <a id="tui.app.App.newFileProblem"></a><br>Why the first save of a new specification may not happen, or null: the path rules again (the configuration or a link may have changed since the form), and the target must still not exist.
        - calls [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc)
      - fn [generatedDoc](../../src/tui/app.ts#L709) (path: string) → boolean <!-- internal -->
        <a id="tui.app.App.generatedDoc"></a><br>The analysis knows `path` as a generated document.
      - fn [persist](../../src/tui/app.ts#L714) (buffer: Buffer) → void <!-- internal -->
        <a id="tui.app.App.persist"></a><br>Writes the buffer's text with its line ending; the buffer is clean after. Throws when the write fails.
        - calls [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged)
      - fn [dirtyInputs](../../src/tui/app.ts#L731) () → string[] <!-- internal -->
        <a id="tui.app.App.dirtyInputs"></a><br>The unsaved spec and config buffers, in path order: what an operation on the disk would not see.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [withSavedInputs](../../src/tui/app.ts#L743) (action: string, run: () => void, options: { writes?: string[]; writesNote?: string; inputs?: (path: string) => boolean } = {}) → void <!-- internal -->
        <a id="tui.app.App.withSavedInputs"></a><br>Runs `run` on saved inputs (design §2.5). Without dirty buffers it runs at once; with them the save step opens: Save and continue or Back.
        - calls [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [barrierKey](../../src/tui/app.ts#L753) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.barrierKey"></a><br>The keys of the save step: ←→/Tab choose, Enter does it, Esc is Back.
        - calls [tui.app.App.leaveBarrier](tui.md#tui.app.App.leaveBarrier), [tui.app.App.saveAndContinue](tui.md#tui.app.App.saveAndContinue)
      - fn [leaveBarrier](../../src/tui/app.ts#L761) () → void <!-- internal -->
        <a id="tui.app.App.leaveBarrier"></a><br>Back: nothing is written and the operation does not start.
      - fn [saveAndContinue](../../src/tui/app.ts#L774) () → void <!-- internal -->
        <a id="tui.app.App.saveAndContinue"></a><br>Saves the listed buffers one by one through the ordinary save path. The first failure (a file changed on disk, a write error) stops: the step stays open with the reason, the operation does not start, and the files already saved stay saved — there is no rollback.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.app.App.changedOnDisk](tui.md#tui.app.App.changedOnDisk), [tui.app.App.persist](tui.md#tui.app.App.persist), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [live](../../src/tui/app.ts#L809) () → Workspace | null <!-- internal -->
        <a id="tui.app.App.live"></a><br>The workspace of the latest analysis, with this session's buffers as the documents.
        - calls [features.lsp-features.workspace](features.md#features.lsp-features.workspace)
      - fn [lspPosition](../../src/tui/app.ts#L818) (cursor: Cursor) → LspPosition <!-- internal -->
        <a id="tui.app.App.lspPosition"></a><br>Converts a cursor's grapheme-cluster column into an LSP character offset by looking up the line's layout via [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout), clamping the column to the cluster count; when [`tui.app.App.buffer`](tui.md#tui.app.App.buffer) is null it reports character 0 on the same line. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [cellAt](../../src/tui/app.ts#L826) (x: number, y: number) → Cursor | null <!-- internal -->
        <a id="tui.app.App.cellAt"></a><br>The editor line and column under a screen cell, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.width.clusterAtCell](tui.md#tui.width.clusterAtCell), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [offsetOf](../../src/tui/app.ts#L839) (at: Cursor) → number <!-- internal -->
        <a id="tui.app.App.offsetOf"></a><br>The UTF-16 offset of a cursor in the buffer.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [targetNear](../../src/tui/app.ts#L850) (cursor: Cursor) → Cursor | null <!-- internal -->
        <a id="tui.app.App.targetNear"></a><br>The id or link at the cursor; on an item line without one under the cursor, its first.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf), [tui.app.forNodes](tui.md#tui.app.forNodes), [tui.width.clusterAt](tui.md#tui.width.clusterAt), [tui.app.App.lines](tui.md#tui.app.App.lines)
      - fn [hoverAt](../../src/tui/app.ts#L864) (cursor: Cursor, x: number, y: number, source: Hover["source"]) → Hover | null <!-- internal -->
        <a id="tui.app.App.hoverAt"></a><br>Builds a hover popup for the cursor position: strips markdown from [`features.lsp-features.hover`](features.md#features.lsp-features.hover) output into typed lines, then appends a snippet of the definition target's file from [`features.lsp-features.definition`](features.md#features.lsp-features.definition) and a reference count from… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [features.lsp-features.hover](features.md#features.lsp-features.hover), [features.lsp-features.definition](features.md#features.lsp-features.definition), [features.lsp-features.references](features.md#features.lsp-features.references)
      - fn [cursorAnchor](../../src/tui/app.ts#L893) (col: number) → { x: number; y: number } <!-- internal -->
        <a id="tui.app.App.cursorAnchor"></a><br>Where a popup at the cursor line is anchored: the raw line in the editor, the rendered row in reading mode.
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.readCursorRow](tui.md#tui.view.readCursorRow), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth)
      - fn [goToCode](../../src/tui/app.ts#L904) () → void <!-- internal -->
        <a id="tui.app.App.goToCode"></a><br>Resolves the id or code link nearest the cursor via [`tui.app.App.targetNear`](tui.md#tui.app.App.targetNear) and [`features.lsp-features.definition`](features.md#features.lsp-features.definition), then moves the cursor and opens the target file at its line with [`tui.app.App.jump`](tui.md#tui.app.App.jump). Sets a status message instead when analysis is still running or no… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.live](tui.md#tui.app.App.live), [features.lsp-features.definition](features.md#features.lsp-features.definition), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.app.App.jump](tui.md#tui.app.App.jump)
      - fn [jump](../../src/tui/app.ts#L922) (abs: string, line: number) → void <!-- internal -->
        <a id="tui.app.App.jump"></a><br>Opens a file at a line: a spec in the editor, code in `$EDITOR` or the built-in viewer.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.showCode](tui.md#tui.app.App.showCode)
      - fn [showCode](../../src/tui/app.ts#L938) (rel: string, abs: string, line: number) → boolean <!-- internal -->
        <a id="tui.app.App.showCode"></a><br>The built-in read-only viewer at `line` of a code file; false (with a message) when it cannot be read.
        - calls [tui.view.layout](tui.md#tui.view.layout)
      - fn [nodeAtCursor](../../src/tui/app.ts#L955) () → string | null <!-- internal -->
        <a id="tui.app.App.nodeAtCursor"></a><br>The ID of the node whose item is at the cursor line or the nearest one above it (a description, `calls`).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [lineOfNode](../../src/tui/app.ts#L967) (path: string, id: string) → number | null <!-- internal -->
        <a id="tui.app.App.lineOfNode"></a><br>The 0-based line of the item that declares `id` in the file at `path`, or null.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [mapDirs](../../src/tui/app.ts#L975) (analysis: Analysis) → { map: string; explained: string } <!-- internal -->
        <a id="tui.app.App.mapDirs"></a><br>The map directory of each variant, relative to the root.
      - fn [toggleMap](../../src/tui/app.ts#L980) () → void <!-- internal -->
        <a id="tui.app.App.toggleMap"></a><br>`t`: the same layer file in the other map, the cursor on the same node.
        - calls [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.nodeAtCursor](tui.md#tui.app.App.nodeAtCursor), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.app.App.open](tui.md#tui.app.App.open)
      - fn [goToNode](../../src/tui/app.ts#L1007) (id: string) → void <!-- internal -->
        <a id="tui.app.App.goToNode"></a><br>The node's line in the map the reader is in: the explained map from one of its files, the map otherwise.
        - calls [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [goToSpec](../../src/tui/app.ts#L1020) (id: string | null) → void <!-- internal -->
        <a id="tui.app.App.goToSpec"></a><br>Looks up the given id in the loaded analysis index and, if it resolves to a declaration, jumps the editor to that declaration's file and position via [`tui.app.App.open`](tui.md#tui.app.App.open), converting the column with [`tui.width.clusterAt`](tui.md#tui.width.clusterAt). Sets a status message instead when there is no analysis… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.clusterAt](tui.md#tui.width.clusterAt)
      - fn [idAtCursor](../../src/tui/app.ts#L1035) () → string | null <!-- internal -->
        <a id="tui.app.App.idAtCursor"></a><br>Resolves the identifier under the editor cursor: it snaps the cursor to a nearby target via [`tui.app.App.targetNear`](tui.md#tui.app.App.targetNear), converts it to a byte offset with [`tui.app.App.offsetOf`](tui.md#tui.app.App.offsetOf), and asks [`features.lsp-features.targetAt`](features.md#features.lsp-features.targetAt) what sits there. Returns the id only when that target is an… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [goBack](../../src/tui/app.ts#L1043) () → void <!-- internal -->
        <a id="tui.app.App.goBack"></a><br>Pops the most recent entry from the back stack, reloads that file via [`tui.app.App.load`](tui.md#tui.app.App.load), restores its cursor and mode, then clamps and scrolls into view with [`tui.app.App.clampCursor`](tui.md#tui.app.App.clampCursor) and [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). With an empty stack it only drops any completion and falls… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [handle](../../src/tui/app.ts#L1061) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.handle"></a><br>Routes one input event to a handler by precedence: drops a pending ghost line via [`tui.assist.Assist.dropGhost`](tui.md#tui.assist.Assist.dropGhost), sends mouse/paste to [`tui.app.App.mouse`](tui.md#tui.app.App.mouse), [`tui.app.App.promptType`](tui.md#tui.app.App.promptType) or [`tui.app.App.insert`](tui.md#tui.app.App.insert), then checks modal states (quit, help, barrier, prompt, results, start)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.mouse](tui.md#tui.app.App.mouse), [tui.app.App.promptType](tui.md#tui.app.App.promptType), [tui.app.App.insert](tui.md#tui.app.App.insert), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.quitKey](tui.md#tui.app.App.quitKey), [tui.app.App.helpKey](tui.md#tui.app.App.helpKey), [tui.app.App.barrierKey](tui.md#tui.app.App.barrierKey), [tui.app.App.promptKey](tui.md#tui.app.App.promptKey), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.returnToFindings](tui.md#tui.app.App.returnToFindings), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.resultsKey](tui.md#tui.app.App.resultsKey), [tui.app.App.startKey](tui.md#tui.app.App.startKey), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.openResults](tui.md#tui.app.App.openResults), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.key](tui.md#tui.merge-session.MergeSession.key), [tui.app.App.codeKey](tui.md#tui.app.App.codeKey), [tui.app.App.editKey](tui.md#tui.app.App.editKey), [tui.app.App.contextKey](tui.md#tui.app.App.contextKey), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.viewKey](tui.md#tui.app.App.viewKey)
      - fn [helpKey](../../src/tui/app.ts#L1125) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.helpKey"></a><br>Scrolls the help overlay in response to a key event: up/k and down/j move by one line, pageup/pagedown by a page derived from [`tui.view.layout`](tui.md#tui.view.layout), clamped to [`tui.view.helpScrollMax`](tui.md#tui.view.helpScrollMax). Any other key closes the help overlay and resets its scroll offset. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.view.helpScrollMax](tui.md#tui.view.helpScrollMax)
      - fn [quit](../../src/tui/app.ts#L1141) () → void <!-- internal -->
        <a id="tui.app.App.quit"></a><br>`q` / Ctrl+C. While an operation runs, the quit step asks first (Stay or Cancel and exit; `q` again in it is Cancel and exit); then unsaved buffers ask once more; then the session ends.
        - calls [tui.app.App.cancelAndQuit](tui.md#tui.app.App.cancelAndQuit), [tui.app.App.activeLabel](tui.md#tui.app.App.activeLabel), [tui.app.App.quitIfSaved](tui.md#tui.app.App.quitIfSaved)
      - fn [quitIfSaved](../../src/tui/app.ts#L1159) (note?: string) → void <!-- internal -->
        <a id="tui.app.App.quitIfSaved"></a><br>The ordinary end of a session: unsaved buffers ask once (the second q quits), then it closes.
        - calls [tui.app.App.unsaved](tui.md#tui.app.App.unsaved), [tui.app.App.close](tui.md#tui.app.App.close)
      - fn [activeLabel](../../src/tui/app.ts#L1171) () → string <!-- internal -->
        <a id="tui.app.App.activeLabel"></a><br>How messages name the running operation.
        - calls [tui.view.operationLabel](tui.md#tui.view.operationLabel)
      - fn [quitKey](../../src/tui/app.ts#L1177) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.quitKey"></a><br>The keys of the quit step: ←→/Tab choose, Enter does it, Esc stays; while it waits only Esc (stay) counts.
        - calls [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.cancelAndQuit](tui.md#tui.app.App.cancelAndQuit)
      - fn [cancelAndQuit](../../src/tui/app.ts#L1195) () → void <!-- internal -->
        <a id="tui.app.App.cancelAndQuit"></a><br>Cancel and exit: the operation is cancelled — before a commit at once, during one after its current file step — and the session ends when it settles (`quitAfterSettle`), never in the middle of a file write.
      - fn [quitAfterSettle](../../src/tui/app.ts#L1208) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.quitAfterSettle"></a><br>An operation settled under the quit step. After Cancel and exit the unsaved buffers decide again, with what the operation wrote named; an operation that ended by itself while the step asked only closes the step.
        - calls [tui.view.recordSummary](tui.md#tui.view.recordSummary), [tui.app.App.quitIfSaved](tui.md#tui.app.App.quitIfSaved)
      - fn [move](../../src/tui/app.ts#L1223) (lines: number) → void <!-- internal -->
        <a id="tui.app.App.move"></a><br>Shifts the cursor by a relative line count, then clamps it via [`tui.app.App.clampCursor`](tui.md#tui.app.App.clampCursor) and scrolls it into view with [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). Any hover popup that was opened by keyboard is dismissed afterward. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [common](../../src/tui/app.ts#L1230) (event: KeyEvent) → boolean <!-- internal -->
        <a id="tui.app.App.common"></a><br>Handles the cursor-navigation keys shared by edit and view modes: arrows and page keys via [`tui.app.App.move`](tui.md#tui.app.App.move), horizontal/home/end by editing the column then [`tui.app.App.clampCursor`](tui.md#tui.app.App.clampCursor) and [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). In edit mode, shifted up/down starts a line selection; any… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [cycleFocus](../../src/tui/app.ts#L1271) () → void <!-- internal -->
        <a id="tui.app.App.cycleFocus"></a><br>Advances `state.focus` to the next pane in a ring built from "editor" plus whichever of "context" (if open), "nav", or "files" are currently shown, wrapping at the end. When focus lands on "nav" it calls [`tui.app.App.fixNavIndex`](tui.md#tui.app.App.fixNavIndex) to keep the nav selection valid. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex)
      - fn [hoverAtCursor](../../src/tui/app.ts#L1279) () → void <!-- internal -->
        <a id="tui.app.App.hoverAtCursor"></a><br>`K`: the hover of the id nearest the cursor, as the mouse would show it.
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt)
      - fn [viewKey](../../src/tui/app.ts#L1294) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.viewKey"></a><br>Dispatches keystrokes in view/read mode: after [`tui.app.App.common`](tui.md#tui.app.App.common) declines, it maps Ctrl/Alt chords to navigation like [`tui.app.App.goToSpec`](tui.md#tui.app.App.goToSpec) and [`tui.app.App.goBack`](tui.md#tui.app.App.goBack), and plain keys to cursor moves, mode switches, hover, merge, undo via [`tui.merge-session.MergeSession.undo`](tui.md#tui.merge-session.MergeSession.undo)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.draftAtCursor](tui.md#tui.app.App.draftAtCursor), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.hoverAtCursor](tui.md#tui.app.App.hoverAtCursor), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.readOnlyReason](tui.md#tui.app.App.readOnlyReason), [tui.app.App.mergeOrPick](tui.md#tui.app.App.mergeOrPick), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [editKey](../../src/tui/app.ts#L1373) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKey"></a><br>Routes a keystroke while a ghost suggestion is shown: Alt+] cycles its variants, Tab (with no completion open) hands it to [`tui.assist.Assist.acceptGhost`](tui.md#tui.assist.Assist.acceptGhost), anything else clears it via [`tui.assist.Assist.dropGhost`](tui.md#tui.assist.Assist.dropGhost). Otherwise it defers to [`tui.app.App.editKeyWithoutGhost`](tui.md#tui.app.App.editKeyWithoutGhost) and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.assist.Assist.acceptGhost](tui.md#tui.assist.Assist.acceptGhost), [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.editKeyWithoutGhost](tui.md#tui.app.App.editKeyWithoutGhost), [tui.assist.Assist.ghostSoon](tui.md#tui.assist.Assist.ghostSoon)
      - fn [editKeyWithoutGhost](../../src/tui/app.ts#L1391) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKeyWithoutGhost"></a><br>Dispatches a key press in edit mode when no ghost text is showing: it cycles or accepts/rejects the completion popup, maps ctrl shortcuts to [`tui.app.App.save`](tui.md#tui.app.App.save), [`tui.assist.Assist.voice`](tui.md#tui.assist.Assist.voice), [`tui.app.App.undoEdit`](tui.md#tui.app.App.undoEdit), [`tui.app.App.textToSpec`](tui.md#tui.app.App.textToSpec), [`tui.app.App.complete`](tui.md#tui.app.App.complete) and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.acceptCompletion](tui.md#tui.app.App.acceptCompletion), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.save](tui.md#tui.app.App.save), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.undoEdit](tui.md#tui.app.App.undoEdit), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.complete](tui.md#tui.app.App.complete), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.insert](tui.md#tui.app.App.insert)
      - fn [insert](../../src/tui/app.ts#L1465) (raw: string) → void <!-- internal -->
        <a id="tui.app.App.insert"></a><br>Inserts typed text at the cursor via [`tui.app.App.edit`](tui.md#tui.app.App.edit), splitting on newlines into multiple lines and placing the cursor by grapheme cluster count from [`tui.width.graphemes`](tui.md#tui.width.graphemes). Single non-space characters coalesce into one undo step, then [`tui.app.App.complete`](tui.md#tui.app.App.complete) refreshes… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.printable](tui.md#tui.app.printable), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.complete](tui.md#tui.app.App.complete)
      - fn [undoEdit](../../src/tui/app.ts#L1493) () → void <!-- internal -->
        <a id="tui.app.App.undoEdit"></a><br>Clears any pending completion, pops the latest snapshot from the buffer's undo stack, and if none exists sets a "nothing to undo" message. Otherwise restores the text via [`tui.buffer.setText`](tui.md#tui.buffer.setText), resets the cursor, then runs [`tui.app.App.clampCursor`](tui.md#tui.app.App.clampCursor), [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [complete](../../src/tui/app.ts#L1511) (explicit: boolean) → void <!-- internal -->
        <a id="tui.app.App.complete"></a><br>Opens or refreshes the completion list; `explicit` (Ctrl+Space) also opens it mid-word.
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [features.lsp-features.completions](features.md#features.lsp-features.completions), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [acceptCompletion](../../src/tui/app.ts#L1540) () → void <!-- internal -->
        <a id="tui.app.App.acceptCompletion"></a><br>Takes the highlighted item from the open completion list, records the acceptance via [`tui.assist.countSuggestion`](tui.md#tui.assist.countSuggestion), and closes the list. If the cursor is still at or past the word's start, it replaces that word's graphemes with the item label through [`tui.app.App.edit`](tui.md#tui.app.App.edit) and moves… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [fixNavIndex](../../src/tui/app.ts#L1558) (direction: 1 | -1) → void <!-- internal -->
        <a id="tui.app.App.fixNavIndex"></a><br>Clamps the navigation cursor into the range of entries from [`tui.view.navEntries`](tui.md#tui.view.navEntries), stepping past heading rows in the given direction. Then scrolls `navTop` using [`tui.view.layout`](tui.md#tui.view.layout) and [`tui.view.navListHeight`](tui.md#tui.view.navListHeight) so the selected row stays visible. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.layout](tui.md#tui.view.layout), [tui.view.navListHeight](tui.md#tui.view.navListHeight)
      - fn [toggleFiles](../../src/tui/app.ts#L1572) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleFiles"></a><br>Flips the files panel on or off, marking it as the last-used panel when shown and moving focus to it when `focusable`, or back to the editor if focus was there when hidden. It then calls [`tui.app.App.narrowNote`](tui.md#tui.app.App.narrowNote) and [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible) to re-fit the layout. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleNav](../../src/tui/app.ts#L1581) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleNav"></a><br>Flips the navigation panel's visibility flag, records it as the last-used panel when shown, and moves focus to the editor when hiding it while it had focus. Then re-lays out the note via [`tui.app.App.narrowNote`](tui.md#tui.app.App.narrowNote) and scrolls the cursor into view with [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleContext](../../src/tui/app.ts#L1589) (focus = true) → void <!-- internal -->
        <a id="tui.app.App.toggleContext"></a><br>Flips the context panel's open flag in app state, records "nav" as the last panel when opening, and shrinks the note via [`tui.app.App.narrowNote`](tui.md#tui.app.App.narrowNote). Moves focus to the context panel on open (if requested) or back to the editor on close, then calls [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [narrowNote](../../src/tui/app.ts#L1600) () → void <!-- internal -->
        <a id="tui.app.App.narrowNote"></a><br>A side panel needs 60 columns: below that a toggle says so instead of seeming to do nothing.
      - fn [contextPack](../../src/tui/app.ts#L1605) () → ContextPack | null
        <a id="tui.app.App.contextPack"></a><br>The pack for the current buffer and cursor line; null before the first analysis.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.agent-context.contextPack](features.md#features.agent-context.contextPack)
      - fn [contextKey](../../src/tui/app.ts#L1613) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.contextKey"></a><br>Dispatches keypresses in the context panel: up/down (or k/j) move the selection through the items from [`tui.app.App.contextPack`](tui.md#tui.app.App.contextPack), x marks the selected item as removed and sets a status message, @ opens a context prompt. Tab delegates to [`tui.app.App.cycleFocus`](tui.md#tui.app.App.cycleFocus) and escape to… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext)
      - fn [addToContext](../../src/tui/app.ts#L1647) (id: string) → void <!-- internal -->
        <a id="tui.app.App.addToContext"></a><br>Validates a node id against the current analysis via [`features.explain-node.summarizeNode`](features.md#features.explain-node.summarizeNode), setting a status message (with a suggestion) if unknown or analysis is pending. Otherwise it un-removes the node from the TUI context and appends it to the added list. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode)
      - fn [explainAtCursor](../../src/tui/app.ts#L1672) () → void <!-- internal -->
        <a id="tui.app.App.explainAtCursor"></a><br>`e`: offline, from the session's analysis as it is shown — the summary of the ID under the cursor with its saved answer and brief, each with its provenance, or the help of the line's diagnostic code. Never a model and never a file read behind the analysis' back, apart from the…
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.view.layout](tui.md#tui.view.layout), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [navKey](../../src/tui/app.ts#L1714) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.navKey"></a><br>Handles keyboard input while the navigation panel has focus: moves the selection through [`tui.view.navEntries`](tui.md#tui.view.navEntries) with [`tui.app.App.fixNavIndex`](tui.md#tui.app.App.fixNavIndex), toggles expansion of layers and entries, and on enter opens the item's spec or code via [`tui.app.App.open`](tui.md#tui.app.App.open) or [`tui.app.App.jump`](tui.md#tui.app.App.jump). Tab… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.jump](tui.md#tui.app.App.jump), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [filesKey](../../src/tui/app.ts#L1761) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.filesKey"></a><br>Handles keystrokes while the file list has focus: up/k and down/j move the selection, enter opens the chosen file via [`tui.app.App.open`](tui.md#tui.app.App.open) and returns focus to the editor, escape just refocuses the editor. Tab delegates to [`tui.app.App.cycleFocus`](tui.md#tui.app.App.cycleFocus) and q to [`tui.app.App.quit`](tui.md#tui.app.App.quit)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [codeKey](../../src/tui/app.ts#L1789) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.codeKey"></a><br>Scrolls the open code view by line or by page (sized from [`tui.view.layout`](tui.md#tui.view.layout)), clamping to the line range. Escape, `q`, or Ctrl+O leave via [`tui.app.App.goBack`](tui.md#tui.app.App.goBack); `?` opens the help overlay. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.goBack](tui.md#tui.app.App.goBack)
      - fn [inputsChanged](../../src/tui/app.ts#L1829) (reason: string) → void <!-- internal -->
        <a id="tui.app.App.inputsChanged"></a><br>Records that an input changed: a feature or check result computed before it is outdated from now on, and so is a spec-to-code preview (one still running too: a model's answer to the old bytes is not the current code).
        - calls [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode)
      - fn [requestOperation](../../src/tui/app.ts#L1843) (action: string, request: OperationRequest) → void <!-- internal -->
        <a id="tui.app.App.requestOperation"></a><br>Starts an operation that reads the saved files: after the save step when buffers are dirty (design §2.5), then as the session's one explicit operation. A second one is refused while one runs.
        - calls [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.app.App.withSavedInputs](tui.md#tui.app.App.withSavedInputs), [tui.view.operationLabel](tui.md#tui.view.operationLabel), [tui.app.App.initTargets](tui.md#tui.app.App.initTargets), [base.config.toPosix](base.md#base.config.toPosix), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [tui.app.App.draftTarget](tui.md#tui.app.App.draftTarget), [tui.app.App.codeDraftTarget](tui.md#tui.app.App.codeDraftTarget), [tui.app.App.codeDraftFormOf](tui.md#tui.app.App.codeDraftFormOf), [tui.app.App.specCodeTarget](tui.md#tui.app.App.specCodeTarget), [tui.app.App.rulesTarget](tui.md#tui.app.App.rulesTarget), [tui.app.App.mapTargets](tui.md#tui.app.App.mapTargets)
      - fn [mapTargets](../../src/tui/app.ts#L1975) () → string[] <!-- internal -->
        <a id="tui.app.App.mapTargets"></a><br>What `keylang map` may write, as the step before it shows.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [initTargets](../../src/tui/app.ts#L1981) () → string[] <!-- internal -->
        <a id="tui.app.App.initTargets"></a><br>The classes of files `keylang init` may write, as its form and its save step name them.
        - calls [tui.app.App.mapTargets](tui.md#tui.app.App.mapTargets), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [writingNow](../../src/tui/app.ts#L1987) () → boolean <!-- internal -->
        <a id="tui.app.App.writingNow"></a><br>True (with the reason shown) while an operation writes files: saves and merge writes wait for it.
      - fn [beginCommit](../../src/tui/app.ts#L1999) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.beginCommit"></a><br>A writing operation is about to touch files: an analysis in flight is dropped (it read the disk before the commit) and none starts until the commit ends. A record no longer running (cancelled) changes nothing: its aborted signal makes the operation stop with nothing written.
        - calls [tui.view.operationLabel](tui.md#tui.view.operationLabel)
      - fn [endCommit](../../src/tui/app.ts#L2019) (result: OperationResult) → string | null <!-- internal -->
        <a id="tui.app.App.endCommit"></a><br>After a writing operation — completed, cancelled part way or failed part way — the old analysis is superseded and a full one runs with the dirty buffers as overlays. Clean buffers follow the disk through it; a dirty buffer of a written file keeps its text and is named.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [startOperation](../../src/tui/app.ts#L2070) (action: string, request: OperationRequest) → void <!-- internal -->
        <a id="tui.app.App.startOperation"></a><br>Runs an operation as the session's one explicit operation and records it for F6. The UI never blocks: the record turns "running" and the result (or a failure) lands later; a second operation is refused while one runs.
        - calls [tui.view.operationLabel](tui.md#tui.view.operationLabel), [tui.app.App.layoutBasis](tui.md#tui.app.App.layoutBasis), [tui.assist.Assist.suspendGhost](tui.md#tui.assist.Assist.suspendGhost), [tui.app.App.endCommit](tui.md#tui.app.App.endCommit), [tui.view.recordSummary](tui.md#tui.view.recordSummary), [tui.app.App.afterDraft](tui.md#tui.app.App.afterDraft), [tui.app.App.afterCodeDraft](tui.md#tui.app.App.afterCodeDraft), [tui.app.App.afterSpecCode](tui.md#tui.app.App.afterSpecCode), [tui.app.App.afterApplyCode](tui.md#tui.app.App.afterApplyCode), [tui.app.App.afterLayoutDraft](tui.md#tui.app.App.afterLayoutDraft), [tui.app.App.quitAfterSettle](tui.md#tui.app.App.quitAfterSettle), [operations.operations.resultWithout](operations.md#operations.operations.resultWithout), [tui.app.App.beginCommit](tui.md#tui.app.App.beginCommit), [tui.app.App.commitGate](tui.md#tui.app.App.commitGate), [tui.app.App.track](tui.md#tui.app.App.track), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [commitGate](../../src/tui/app.ts#L2160) (request: OperationRequest, plan?: CommitPlan) → CommitGate <!-- internal -->
        <a id="tui.app.App.commitGate"></a><br>The session's answer before a commit: a draft's target edited in a buffer while the draft was prepared keeps its text and gets no proposal (the proposal would be judged against the disk under unsaved edits).
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.applyConflicts](tui.md#tui.app.App.applyConflicts), [tui.app.App.rulesTarget](tui.md#tui.app.App.rulesTarget), [tui.app.App.draftTarget](tui.md#tui.app.App.draftTarget)
      - fn [cancelOperation](../../src/tui/app.ts#L2184) () → void <!-- internal -->
        <a id="tui.app.App.cancelOperation"></a><br>Cancel (palette, `x` in F6): the running operation ends as cancelled with exit code null. Esc never does this.
      - fn [worker](../../src/tui/app.ts#L2193) () → OperationWorker <!-- internal -->
        <a id="tui.app.App.worker"></a><br>The session's operation worker, started on first use; after a failure the next request starts a new one.
        - calls [tui.background.OperationWorker](tui.md#tui.background.OperationWorker)
      - fn [openFeaturePrompt](../../src/tui/app.ts#L2199) () → void <!-- internal -->
        <a id="tui.app.App.openFeaturePrompt"></a><br>The feature form: the slug of the current feature file, else typed or chosen from the feature files.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.app.App.refreshFeaturePrompt](tui.md#tui.app.App.refreshFeaturePrompt)
      - fn [refreshFeaturePrompt](../../src/tui/app.ts#L2208) () → void <!-- internal -->
        <a id="tui.app.App.refreshFeaturePrompt"></a><br>The feature files matching the typed slug, and the target the form would check.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.app.App.featureNote](tui.md#tui.app.App.featureNote)
      - fn [featureSlug](../../src/tui/app.ts#L2223) () → string <!-- internal -->
        <a id="tui.app.App.featureSlug"></a><br>The slug Enter would check: the selected feature file, else the typed text.
      - fn [featureNote](../../src/tui/app.ts#L2228) () → void <!-- internal -->
        <a id="tui.app.App.featureNote"></a><br>Updates the active prompt's hint text based on the slug returned by [`tui.app.App.featureSlug`](tui.md#tui.app.App.featureSlug): a usage hint when empty, the expected on-disk path (via [`tui.app.App.specDir`](tui.md#tui.app.App.specDir)) when valid, or a validation error otherwise. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.featureSlug](tui.md#tui.app.App.featureSlug), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [submitFeature](../../src/tui/app.ts#L2240) () → void <!-- internal -->
        <a id="tui.app.App.submitFeature"></a><br>Enter in the feature form: the same slug rule as the CLI; an invalid one keeps the form and the text.
        - calls [tui.app.App.featureSlug](tui.md#tui.app.App.featureSlug), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openBaselinePrompt](../../src/tui/app.ts#L2253) () → void <!-- internal -->
        <a id="tui.app.App.openBaselinePrompt"></a><br>The baseline form: the mode (write or check) and the target from the saved config's spec directory.
        - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [submitBaseline](../../src/tui/app.ts#L2270) () → void <!-- internal -->
        <a id="tui.app.App.submitBaseline"></a><br>Enter in the baseline form: the chosen mode runs as the session's operation.
        - calls [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openAgentsPrompt](../../src/tui/app.ts#L2284) () → void <!-- internal -->
        <a id="tui.app.App.openAgentsPrompt"></a><br>The agents form: the typed selection (empty is auto, `none`, or names as in `--agents`) and the mode. It shows what the selection resolves to and which files it would change, read from the disk; nothing runs a harness.
        - calls [tui.app.App.refreshAgentsPrompt](tui.md#tui.app.App.refreshAgentsPrompt)
      - fn [agentsPreview](../../src/tui/app.ts#L2290) (choice: HarnessChoice) → { changed: string[]; note: string } <!-- internal -->
        <a id="tui.app.App.agentsPreview"></a><br>What a selection would do now: the read-only plan of the shared operation, or why it cannot be planned.
        - calls [features.harness.planAgents](features.md#features.harness.planAgents), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [agentsChoice](../../src/tui/app.ts#L2309) () → HarnessChoice | { error: string } <!-- internal -->
        <a id="tui.app.App.agentsChoice"></a><br>The typed selection as a choice, or why it is not one (the CLI's message for `--agents`).
        - calls [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [refreshAgentsPrompt](../../src/tui/app.ts#L2318) () → void <!-- internal -->
        <a id="tui.app.App.refreshAgentsPrompt"></a><br>Rewrites the open agents prompt's option labels and note from [`tui.app.App.agentsChoice`](tui.md#tui.app.App.agentsChoice): on an invalid choice it shows the error and accepted values, otherwise it summarizes how many files [`tui.app.App.agentsPreview`](tui.md#tui.app.App.agentsPreview) would change (naming up to three). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.agentsChoice](tui.md#tui.app.App.agentsChoice), [tui.app.App.agentsPreview](tui.md#tui.app.App.agentsPreview)
      - fn [submitAgents](../../src/tui/app.ts#L2334) () → void <!-- internal -->
        <a id="tui.app.App.submitAgents"></a><br>Enter in the agents form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form.
        - calls [tui.app.App.agentsChoice](tui.md#tui.app.App.agentsChoice), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openInitPrompt](../../src/tui/app.ts#L2355) () → void <!-- internal -->
        <a id="tui.app.App.openInitPrompt"></a><br>The init form: the harness selection as in the agents form (empty is auto), then write or check. Its notes name the root, the languages and layers it describes (the saved keylang.json when there is one: it is kept), what the selection resolves to, and which classes of files…
        - calls [tui.app.App.refreshInitPrompt](tui.md#tui.app.App.refreshInitPrompt)
      - fn [refreshInitPrompt](../../src/tui/app.ts#L2360) () → void <!-- internal -->
        <a id="tui.app.App.refreshInitPrompt"></a><br>Rebuilds the init prompt's details, items, and notes from the current root: config via [`operations.operations.initSources`](operations.md#operations.operations.initSources) (or layers guessed with [`base.config.guessLayout`](base.md#base.config.guessLayout)), harness note from [`tui.app.App.agentsChoice`](tui.md#tui.app.App.agentsChoice)/[`tui.app.App.agentsPreview`](tui.md#tui.app.App.agentsPreview), and the baseline path. Does… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [operations.operations.initSources](operations.md#operations.operations.initSources), [base.config.guessLayout](base.md#base.config.guessLayout), [tui.app.App.agentsChoice](tui.md#tui.app.App.agentsChoice), [tui.app.App.agentsPreview](tui.md#tui.app.App.agentsPreview), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [submitInit](../../src/tui/app.ts#L2389) () → void <!-- internal -->
        <a id="tui.app.App.submitInit"></a><br>Enter in the init form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form.
        - calls [tui.app.App.agentsChoice](tui.md#tui.app.App.agentsChoice), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openFmtPrompt](../../src/tui/app.ts#L2404) () → void <!-- internal -->
        <a id="tui.app.App.openFmtPrompt"></a><br>The fmt form: the current spec file by default — a directory only when typed — then the mode.
        - calls [tui.app.App.refreshFmtPrompt](tui.md#tui.app.App.refreshFmtPrompt)
      - fn [promptPaths](../../src/tui/app.ts#L2412) () → string[] | { error: string } <!-- internal -->
        <a id="tui.app.App.promptPaths"></a><br>The typed paths of the fmt or parse form, relative to the root, or why they cannot be used.
        - calls [map.analyze.within](map.md#map.analyze.within)
      - fn [refreshFmtPrompt](../../src/tui/app.ts#L2420) () → void <!-- internal -->
        <a id="tui.app.App.refreshFmtPrompt"></a><br>The form shows the real set the paths expand to, from the disk, and both modes.
        - calls [tui.app.App.promptPaths](tui.md#tui.app.App.promptPaths), [tui.app.App.markdownSelection](tui.md#tui.app.App.markdownSelection)
      - fn [markdownSelection](../../src/tui/app.ts#L2440) (paths: readonly string[]) → { files: string[]; note: string } | { error: string } <!-- internal -->
        <a id="tui.app.App.markdownSelection"></a><br>The Markdown files the paths expand to on disk, and a note naming them and how many are unsaved (saved first).
        - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [submitFmt](../../src/tui/app.ts#L2456) () → void <!-- internal -->
        <a id="tui.app.App.submitFmt"></a><br>Enter in the fmt form: the typed paths with the chosen mode run as the session's operation.
        - calls [tui.app.App.promptPaths](tui.md#tui.app.App.promptPaths), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openParsePrompt](../../src/tui/app.ts#L2471) () → void <!-- internal -->
        <a id="tui.app.App.openParsePrompt"></a><br>The parse form: the current spec file by default — a directory only when typed — then the view.
        - calls [tui.app.App.refreshParsePrompt](tui.md#tui.app.App.refreshParsePrompt)
      - fn [refreshParsePrompt](../../src/tui/app.ts#L2479) () → void <!-- internal -->
        <a id="tui.app.App.refreshParsePrompt"></a><br>The form shows the real set the paths expand to and both views; parsing needs no snapshot and writes nothing.
        - calls [tui.app.App.promptPaths](tui.md#tui.app.App.promptPaths), [tui.app.App.markdownSelection](tui.md#tui.app.App.markdownSelection)
      - fn [submitParse](../../src/tui/app.ts#L2490) () → void <!-- internal -->
        <a id="tui.app.App.submitParse"></a><br>Enter in the parse form: the typed paths in the chosen view run as the session's operation.
        - calls [tui.app.App.promptPaths](tui.md#tui.app.App.promptPaths), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openWirePrompt](../../src/tui/app.ts#L2505) () → void <!-- internal -->
        <a id="tui.app.App.openWirePrompt"></a><br>The wire form: the generated file (the CLI's default), then the mode.
        - calls [tui.app.App.refreshWirePrompt](tui.md#tui.app.App.refreshWirePrompt)
      - fn [wireOut](../../src/tui/app.ts#L2511) () → string | { error: string } <!-- internal -->
        <a id="tui.app.App.wireOut"></a><br>The typed output path (POSIX, relative to the root), or why it cannot be the generated file.
        - calls [operations.operations.wireOutProblem](operations.md#operations.operations.wireOutProblem)
      - fn [refreshWirePrompt](../../src/tui/app.ts#L2519) () → void <!-- internal -->
        <a id="tui.app.App.refreshWirePrompt"></a><br>The form shows the path problem as it is typed, and the state of the file on disk. Reading only.
        - calls [tui.app.App.wireOut](tui.md#tui.app.App.wireOut), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [submitWire](../../src/tui/app.ts#L2536) () → void <!-- internal -->
        <a id="tui.app.App.submitWire"></a><br>Enter in the wire form: the typed file with the chosen mode runs as the session's operation; an invalid path keeps the form.
        - calls [tui.app.App.wireOut](tui.md#tui.app.App.wireOut), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [wireTarget](../../src/tui/app.ts#L2549) () → { file: string; line: number; col: number } | null <!-- internal -->
        <a id="tui.app.App.wireTarget"></a><br>What Enter over the selected wire report opens: the first blocking error, else the generated file when it is on disk.
      - fn [openWireTarget](../../src/tui/app.ts#L2558) () → void <!-- internal -->
        <a id="tui.app.App.openWireTarget"></a><br>The generated code opens in the read-only viewer, not as a writable buffer; Esc / Ctrl+O come back to the report.
        - calls [tui.app.App.wireTarget](tui.md#tui.app.App.wireTarget), [tui.app.App.openTarget](tui.md#tui.app.App.openTarget)
      - fn [openCheckPrompt](../../src/tui/app.ts#L2566) () → void <!-- internal -->
        <a id="tui.app.App.openCheckPrompt"></a><br>The check form: the spec directory by default, not strict, the static mode of keylang.json.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.app.App.refreshCheckPrompt](tui.md#tui.app.App.refreshCheckPrompt)
      - fn [checkPaths](../../src/tui/app.ts#L2572) () → string[] | { error: string } <!-- internal -->
        <a id="tui.app.App.checkPaths"></a><br>The typed paths, relative to the root (none: the spec directory), or why they cannot be checked here.
        - calls [map.analyze.within](map.md#map.analyze.within)
      - fn [refreshCheckPrompt](../../src/tui/app.ts#L2579) () → void <!-- internal -->
        <a id="tui.app.App.refreshCheckPrompt"></a><br>The options as items, and the real set of spec files the paths expand to. Reading only.
        - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.resolveStatic](base.md#base.config.resolveStatic), [tui.app.App.checkPaths](tui.md#tui.app.App.checkPaths), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [tui.app.App.specDir](tui.md#tui.app.App.specDir), [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [changeCheckOption](../../src/tui/app.ts#L2615) (delta: 1 | -1) → void <!-- internal -->
        <a id="tui.app.App.changeCheckOption"></a><br>←→ on an option of the check form: strict flips; the static mode cycles config → behavior → shape.
        - calls [tui.app.App.refreshCheckPrompt](tui.md#tui.app.App.refreshCheckPrompt)
      - fn [submitCheck](../../src/tui/app.ts#L2629) () → void <!-- internal -->
        <a id="tui.app.App.submitCheck"></a><br>Enter in the check form, on any row: the typed paths with the chosen options run as the session's operation.
        - calls [tui.app.App.checkPaths](tui.md#tui.app.App.checkPaths), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openEdgePrompt](../../src/tui/app.ts#L2650) () → void <!-- internal -->
        <a id="tui.app.App.openEdgePrompt"></a><br>The edge form: the id under the cursor fills only the first field; the second is typed.
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.refreshEdgePrompt](tui.md#tui.app.App.refreshEdgePrompt)
      - fn [refreshEdgePrompt](../../src/tui/app.ts#L2657) () → void <!-- internal -->
        <a id="tui.app.App.refreshEdgePrompt"></a><br>The rows, and a note on the selected id against the session's current snapshot (the operation reads the saved code again).
        - calls [features.explain-edge.edgeIdKnown](features.md#features.explain-edge.edgeIdKnown)
      - fn [submitEdge](../../src/tui/app.ts#L2677) () → void <!-- internal -->
        <a id="tui.app.App.submitEdge"></a><br>Enter in the edge form, on any row: both ids run as the session's operation; an empty one keeps the form.
        - calls [tui.app.App.refreshEdgePrompt](tui.md#tui.app.App.refreshEdgePrompt), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openExplainPrompt](../../src/tui/app.ts#L2695) () → void <!-- internal -->
        <a id="tui.app.App.openExplainPrompt"></a><br>The explain form: the ID under the cursor, else the code of the line's diagnostic, is the visible default.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.refreshExplainPrompt](tui.md#tui.app.App.refreshExplainPrompt)
      - fn [refreshExplainPrompt](../../src/tui/app.ts#L2707) () → void <!-- internal -->
        <a id="tui.app.App.refreshExplainPrompt"></a><br>The codes or the IDs of the session's snapshot matching the typed text (the exact one first).
        - calls [tui.app.App.refreshExplainPlanPrompt](tui.md#tui.app.App.refreshExplainPlanPrompt), [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [tui.app.App.explainNote](tui.md#tui.app.App.explainNote)
      - fn [explainSubject](../../src/tui/app.ts#L2726) () → string <!-- internal -->
        <a id="tui.app.App.explainSubject"></a><br>The subject Enter explains: the selected entry of the list, else the typed text.
      - fn [explainNote](../../src/tui/app.ts#L2731) () → void <!-- internal -->
        <a id="tui.app.App.explainNote"></a><br>Sets the explain prompt's hint text based on what the user typed: delegates to [`tui.app.App.explainModelNote`](tui.md#tui.app.App.explainModelNote) or [`tui.app.App.refreshExplainPlanPrompt`](tui.md#tui.app.App.refreshExplainPlanPrompt) when those modes are active, otherwise describes whether the subject is a diagnostic code or a node id present in the current… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.explainModelNote](tui.md#tui.app.App.explainModelNote), [tui.app.App.refreshExplainPlanPrompt](tui.md#tui.app.App.refreshExplainPlanPrompt), [tui.app.App.explainSubject](tui.md#tui.app.App.explainSubject), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation)
      - fn [submitExplain](../../src/tui/app.ts#L2751) () → void <!-- internal -->
        <a id="tui.app.App.submitExplain"></a><br>Enter in the explain form: the subject runs as the session's operation; an empty one keeps the form.
        - calls [tui.app.App.submitExplainPlan](tui.md#tui.app.App.submitExplainPlan), [tui.app.App.explainSubject](tui.md#tui.app.App.explainSubject), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openExplainModelPrompt](../../src/tui/app.ts#L2775) () → void <!-- internal -->
        <a id="tui.app.App.openExplainModelPrompt"></a><br>The model's explanation form: the ID under the cursor and the detail of keylang.json by default.
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.refreshExplainPrompt](tui.md#tui.app.App.refreshExplainPrompt), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.explainNote](tui.md#tui.app.App.explainNote), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [changeExplainDetail](../../src/tui/app.ts#L2793) (step: number) → void <!-- internal -->
        <a id="tui.app.App.changeExplainDetail"></a><br>←→ in the model's form: short, full, brief.
        - calls [tui.app.App.explainNote](tui.md#tui.app.App.explainNote)
      - fn [explainModelNote](../../src/tui/app.ts#L2806) (detail: ExplanationDetail) → void <!-- internal -->
        <a id="tui.app.App.explainModelNote"></a><br>What Enter would do, by the session's analysis: read a fresh saved answer (no request), ask the model once and save, or — no model — show the summary and the saved answer; with the detail, the language and the agent.
        - calls [tui.app.App.explainSubject](tui.md#tui.app.App.explainSubject), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswerMiss](features.md#features.explain-offline.savedAnswerMiss), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
      - fn [openExplainPlanPrompt](../../src/tui/app.ts#L2847) (row: "list" | "batch" = "list") → void <!-- internal -->
        <a id="tui.app.App.openExplainPlanPrompt"></a><br>The inventory form: the stale saved explanations by default; limit and jobs empty (every candidate, 4).
        - calls [tui.app.App.refreshExplainPlanPrompt](tui.md#tui.app.App.refreshExplainPlanPrompt), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [explainPlanRequest](../../src/tui/app.ts#L2864) (form: ExplainPlanForm) → ExplainPlanRequest | { field: "limit" | "jobs"; text: string } <!-- internal -->
        <a id="tui.app.App.explainPlanRequest"></a><br>The request the form makes, or the field it refuses with the CLI's message.
        - calls [features.explain-inventory.positiveIntegerProblem](features.md#features.explain-inventory.positiveIntegerProblem)
      - fn [refreshExplainPlanPrompt](../../src/tui/app.ts#L2876) () → void <!-- internal -->
        <a id="tui.app.App.refreshExplainPlanPrompt"></a><br>The rows (the list; limit and jobs for a brief plan; run), what the selected list is and is not, and a note on the selected row.
        - calls [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.explainPlanRequest](tui.md#tui.app.App.explainPlanRequest), [tui.app.App.explainBatchRequest](tui.md#tui.app.App.explainBatchRequest), [tui.view.operationLabel](tui.md#tui.view.operationLabel), [tui.app.App.explainBatchAsk](tui.md#tui.app.App.explainBatchAsk), [map.explanations.explainDir](map.md#map.explanations.explainDir), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [changeExplainPlanList](../../src/tui/app.ts#L2917) (delta: -1 | 1) → void <!-- internal -->
        <a id="tui.app.App.changeExplainPlanList"></a><br>←→ on the list row.
        - calls [tui.app.App.refreshExplainPlanPrompt](tui.md#tui.app.App.refreshExplainPlanPrompt)
      - fn [submitExplainPlan](../../src/tui/app.ts#L2926) () → void <!-- internal -->
        <a id="tui.app.App.submitExplainPlan"></a><br>Enter: a refused limit or jobs keeps the form with the field selected, else the inventory runs as the session's operation.
        - calls [tui.app.App.explainPlanRequest](tui.md#tui.app.App.explainPlanRequest), [tui.app.App.refreshExplainPlanPrompt](tui.md#tui.app.App.refreshExplainPlanPrompt), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.app.App.explainBatchRequest](tui.md#tui.app.App.explainBatchRequest)
      - fn [explainBatchRequest](../../src/tui/app.ts#L2943) (plan: ExplainPlanRequest) → ExplainBatchRequest <!-- internal -->
        <a id="tui.app.App.explainBatchRequest"></a><br>The batch of a brief plan's form: the same list, limit and jobs, no estimate.
        - calls [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [tui.app.App.agentName](tui.md#tui.app.App.agentName)
      - fn [explainBatchAsk](../../src/tui/app.ts#L2950) () → string <!-- internal -->
        <a id="tui.app.App.explainBatchAsk"></a><br>Who the batch row would ask, by the session's configuration, or why no request can be made.
      - fn [openTracePlanPrompt](../../src/tui/app.ts#L2958) () → void <!-- internal -->
        <a id="tui.app.App.openTracePlanPrompt"></a><br>The trace-plan form: the flow under the cursor is the visible default; the list is the flows of the current documents.
        - calls [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor), [tui.app.App.refreshTracePlanPrompt](tui.md#tui.app.App.refreshTracePlanPrompt)
      - fn [flowAtCursor](../../src/tui/app.ts#L2965) () → string | null <!-- internal -->
        <a id="tui.app.App.flowAtCursor"></a><br>The `# flow <name>` section the cursor is in, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [refreshTracePlanPrompt](../../src/tui/app.ts#L2979) () → void <!-- internal -->
        <a id="tui.app.App.refreshTracePlanPrompt"></a><br>The declared flows matching the typed name (the exact one first), each with the file that declares it.
        - calls [base.span.compareText](base.md#base.span.compareText), [tui.app.App.tracePlanNote](tui.md#tui.app.App.tracePlanNote)
      - fn [tracePlanFlow](../../src/tui/app.ts#L2995) () → string <!-- internal -->
        <a id="tui.app.App.tracePlanFlow"></a><br>The flow Enter plans: the selected one of the list, else the typed name.
      - fn [tracePlanNote](../../src/tui/app.ts#L3000) () → void <!-- internal -->
        <a id="tui.app.App.tracePlanNote"></a><br>Sets the hint text on the active prompt based on the flow name read via [`tui.app.App.tracePlanFlow`](tui.md#tui.app.App.tracePlanFlow): asks for a name when empty, otherwise shows the name, flags it if absent from the loaded spec's flows, and notes that tracing is read-only. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.tracePlanFlow](tui.md#tui.app.App.tracePlanFlow)
      - fn [submitTracePlan](../../src/tui/app.ts#L3011) () → void <!-- internal -->
        <a id="tui.app.App.submitTracePlan"></a><br>Enter in the trace-plan form: the flow runs as the session's operation; an empty name keeps the form.
        - calls [tui.app.App.tracePlanFlow](tui.md#tui.app.App.tracePlanFlow), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openDraftPrompt](../../src/tui/app.ts#L3030) () → void <!-- internal -->
        <a id="tui.app.App.openDraftPrompt"></a><br>The draft-flow form (design §2.4): the fn under the cursor, else the trigger of the flow under the cursor, is the visible default; name and target stay empty for the CLI's defaults, shown next to them. The output is a proposal unless preview is chosen; the mode is the CLI's…
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.triggerAtCursor](tui.md#tui.app.App.triggerAtCursor), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.refreshDraftPrompt](tui.md#tui.app.App.refreshDraftPrompt)
      - fn [agentName](../../src/tui/app.ts#L3040) () → string | null <!-- internal -->
        <a id="tui.app.App.agentName"></a><br>The effective agent (`KEYLANG_AGENT`, agents.json, the saved keylang.json as the last analysis read it), or null. Credentials are checked by the operation.
        - calls [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent)
      - fn [draftAtCursor](../../src/tui/app.ts#L3053) () → void <!-- internal -->
        <a id="tui.app.App.draftAtCursor"></a><br>`Ctrl+Space` in the view: the agent drafts the flow under the cursor into this file — hybrid, with the context pack as F4 shows it now — as the session's draft-flow operation. It needs a model (never a silent algo draft).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor), [tui.app.App.triggerAtCursor](tui.md#tui.app.App.triggerAtCursor), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [features.agent-context.contextText](features.md#features.agent-context.contextText), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.track](tui.md#tui.app.App.track)
      - fn [triggerAtCursor](../../src/tui/app.ts#L3097) () → string | null <!-- internal -->
        <a id="tui.app.App.triggerAtCursor"></a><br>The `trigger` of the flow section under the cursor, or null.
        - calls [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor)
      - fn [draftTarget](../../src/tui/app.ts#L3104) (form: { trigger: string; name: string; into: string }) → { name: string; target: string } <!-- internal -->
        <a id="tui.app.App.draftTarget"></a><br>The name and target the draft would use: the typed ones, else the CLI's defaults.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir)
      - fn [triggerMatches](../../src/tui/app.ts#L3112) (typed: string) → string[] <!-- internal -->
        <a id="tui.app.App.triggerMatches"></a><br>The callable IDs of the current snapshot that contain the typed trigger, at most eight.
      - fn [draftProblem](../../src/tui/app.ts#L3123) (form: DraftForm) → { field: string; text: string } | null <!-- internal -->
        <a id="tui.app.App.draftProblem"></a><br>Why a draft may not start now, or null: the checks the CLI makes first, then a pending proposal and an unsaved target (a proposal only).
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.draftTarget](tui.md#tui.app.App.draftTarget), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [proposalWaiting](../../src/tui/app.ts#L3143) (path: string) → boolean <!-- internal -->
        <a id="tui.app.App.proposalWaiting"></a><br>Something is at `.keylang/proposals/<path>`: a proposal (or a link) the person has not resolved.
      - fn [refreshDraftPrompt](../../src/tui/app.ts#L3153) () → void <!-- internal -->
        <a id="tui.app.App.refreshDraftPrompt"></a><br>The rows, the root, and a note on the selected row; nothing is read but the snapshot and the target's state.
        - calls [tui.app.App.draftTarget](tui.md#tui.app.App.draftTarget), [tui.app.App.triggerMatches](tui.md#tui.app.App.triggerMatches), [tui.app.App.draftProblem](tui.md#tui.app.App.draftProblem), [tui.app.App.agentName](tui.md#tui.app.App.agentName)
      - fn [changeDraftChoice](../../src/tui/app.ts#L3206) (delta: -1 | 1) → void <!-- internal -->
        <a id="tui.app.App.changeDraftChoice"></a><br>←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview).
        - calls [tui.app.App.refreshDraftPrompt](tui.md#tui.app.App.refreshDraftPrompt)
      - fn [submitDraft](../../src/tui/app.ts#L3221) () → void <!-- internal -->
        <a id="tui.app.App.submitDraft"></a><br>Enter in the draft form. On a match it takes that trigger; elsewhere a problem keeps the form (the typed values stay) with the field selected, else the draft runs as the session's operation.
        - calls [tui.app.App.refreshDraftPrompt](tui.md#tui.app.App.refreshDraftPrompt), [tui.app.App.draftProblem](tui.md#tui.app.App.draftProblem), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [base.config.toPosix](base.md#base.config.toPosix), [features.agent-context.contextText](features.md#features.agent-context.contextText)
      - fn [afterDraft](../../src/tui/app.ts#L3265) (record: OperationRecord, origin: DraftOrigin) → void <!-- internal -->
        <a id="tui.app.App.afterDraft"></a><br>A finished draft: a proposal opens in MERGE only while the file, the mode and the text the operation started from are still current and nothing else is open; otherwise it waits, named in the message and the list.
        - calls [tui.app.App.afterRulesDraft](tui.md#tui.app.App.afterRulesDraft), [tui.app.App.stillWhereDraftStarted](tui.md#tui.app.App.stillWhereDraftStarted), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [stillWhereDraftStarted](../../src/tui/app.ts#L3286) (origin: DraftOrigin) → boolean <!-- internal -->
        <a id="tui.app.App.stillWhereDraftStarted"></a><br>The file, the mode and the text a draft started from are still current and nothing else is open: its proposal may open MERGE by itself.
      - fn [afterRulesDraft](../../src/tui/app.ts#L3292) (record: OperationRecord, origin: DraftOrigin) → void <!-- internal -->
        <a id="tui.app.App.afterRulesDraft"></a><br>A finished rules draft: the proposal opens MERGE under the same rule as a flow draft's; its conflicts are named, never taken for the workspace's verdict.
        - calls [tui.app.App.stillWhereDraftStarted](tui.md#tui.app.App.stillWhereDraftStarted), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [openRulesDraftPrompt](../../src/tui/app.ts#L3317) () → void <!-- internal -->
        <a id="tui.app.App.openRulesDraftPrompt"></a><br>The draft-rules form (design §2.4 `draft rules`): the target (empty: the CLI's `<dir>/rules.md`, shown next to it), the mode (hybrid with a model, else algo) and preview or proposal.
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.refreshRulesDraftPrompt](tui.md#tui.app.App.refreshRulesDraftPrompt)
      - fn [rulesTarget](../../src/tui/app.ts#L3324) (into: string) → string <!-- internal -->
        <a id="tui.app.App.rulesTarget"></a><br>The target a rules draft would use: the typed one, else the CLI's default.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir)
      - fn [rulesDraftProblem](../../src/tui/app.ts#L3329) (form: RulesDraftForm) → { field: string; text: string } | null <!-- internal -->
        <a id="tui.app.App.rulesDraftProblem"></a><br>Why a rules draft may not start now, or null: a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target.
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.rulesTarget](tui.md#tui.app.App.rulesTarget), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [refreshRulesDraftPrompt](../../src/tui/app.ts#L3342) () → void <!-- internal -->
        <a id="tui.app.App.refreshRulesDraftPrompt"></a><br>The rows, the root and what the model sees, and a note on the selected row.
        - calls [tui.app.App.rulesTarget](tui.md#tui.app.App.rulesTarget), [tui.app.App.rulesDraftProblem](tui.md#tui.app.App.rulesDraftProblem), [tui.app.App.agentName](tui.md#tui.app.App.agentName)
      - fn [changeRulesDraftChoice](../../src/tui/app.ts#L3380) (delta: -1 | 1) → void <!-- internal -->
        <a id="tui.app.App.changeRulesDraftChoice"></a><br>←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview).
        - calls [tui.app.App.refreshRulesDraftPrompt](tui.md#tui.app.App.refreshRulesDraftPrompt)
      - fn [submitRulesDraft](../../src/tui/app.ts#L3391) () → void <!-- internal -->
        <a id="tui.app.App.submitRulesDraft"></a><br>Enter in the rules form: a problem keeps the form with the field selected, else the draft runs as the session's operation.
        - calls [tui.app.App.rulesDraftProblem](tui.md#tui.app.App.rulesDraftProblem), [tui.app.App.refreshRulesDraftPrompt](tui.md#tui.app.App.refreshRulesDraftPrompt), [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [openCodeDraftPrompt](../../src/tui/app.ts#L3425) () → void <!-- internal -->
        <a id="tui.app.App.openCodeDraftPrompt"></a><br>The code-to-spec form (design §2.4 `code-to-spec`): the source is a file — the code viewer's file and line, else the file (and, for a fn, the line) of the ID under the cursor, else empty fields and a list of the source files — or the git changes since a ref (`HEAD`). An empty…
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.refreshCodeDraftPrompt](tui.md#tui.app.App.refreshCodeDraftPrompt)
      - fn [codePosition](../../src/tui/app.ts#L3448) (form: CodeDraftForm) → { name: string; triggers: string[] } | { error: string; field: "file" | "line" } | null <!-- internal -->
        <a id="tui.app.App.codePosition"></a><br>What the current snapshot says of the form's position: the fns it names and the spec's name, or why it names none (the CLI's message); null without a snapshot or a file, and for a git change (git decides when the draft runs). Reads the snapshot only.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [features.draft.codeToSpecTriggers](features.md#features.draft.codeToSpecTriggers), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [codeDraftTarget](../../src/tui/app.ts#L3462) (form: CodeDraftForm) → string <!-- internal -->
        <a id="tui.app.App.codeDraftTarget"></a><br>The target the draft would use: the typed one, else the CLI's default — `changes` for a git change, the position's name for a file (`<name>` while it names no fn).
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.codePosition](tui.md#tui.app.App.codePosition)
      - fn [sourceMatches](../../src/tui/app.ts#L3471) (typed: string) → string[] <!-- internal -->
        <a id="tui.app.App.sourceMatches"></a><br>The source files of the current snapshot that declare a fn and contain the typed text, at most eight.
      - fn [codeDraftProblem](../../src/tui/app.ts#L3481) (form: CodeDraftForm) → { field: string; text: string } | null <!-- internal -->
        <a id="tui.app.App.codeDraftProblem"></a><br>Why the draft may not start now, or null: the source's fields, a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target.
        - calls [tui.app.App.codePosition](tui.md#tui.app.App.codePosition), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.codeDraftTarget](tui.md#tui.app.App.codeDraftTarget), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [refreshCodeDraftPrompt](../../src/tui/app.ts#L3506) () → void <!-- internal -->
        <a id="tui.app.App.refreshCodeDraftPrompt"></a><br>The rows, the root, and a note on the selected row: what the source names, the mode, the target's state or why it cannot run.
        - calls [tui.app.App.codeDraftTarget](tui.md#tui.app.App.codeDraftTarget), [tui.app.App.sourceMatches](tui.md#tui.app.App.sourceMatches), [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.codeDraftProblem](tui.md#tui.app.App.codeDraftProblem), [tui.app.App.codePosition](tui.md#tui.app.App.codePosition), [tui.app.App.agentName](tui.md#tui.app.App.agentName)
      - fn [changeCodeDraftChoice](../../src/tui/app.ts#L3563) (delta: -1 | 1) → void <!-- internal -->
        <a id="tui.app.App.changeCodeDraftChoice"></a><br>←→ on the source row (a file or the git changes), the mode row (algo, hybrid, llm) or the output row (proposal or preview).
        - calls [tui.app.App.refreshCodeDraftPrompt](tui.md#tui.app.App.refreshCodeDraftPrompt)
      - fn [codeDraftRequest](../../src/tui/app.ts#L3576) (form: CodeDraftForm) → CodeToSpecRequest <!-- internal -->
        <a id="tui.app.App.codeDraftRequest"></a><br>The request of the form: only the chosen source's fields; the model's context as F4 shows it now.
        - calls [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [base.config.toPosix](base.md#base.config.toPosix), [features.agent-context.contextText](features.md#features.agent-context.contextText)
      - fn [codeDraftFormOf](../../src/tui/app.ts#L3594) (request: CodeToSpecRequest) → CodeDraftForm <!-- internal -->
        <a id="tui.app.App.codeDraftFormOf"></a><br>The form a request was made from, enough to name its default target.
      - fn [submitCodeDraft](../../src/tui/app.ts#L3611) () → void <!-- internal -->
        <a id="tui.app.App.submitCodeDraft"></a><br>Enter in the code-to-spec form. On a match it takes that file and moves to the line; elsewhere a problem keeps the form (the typed values stay) with the field selected, else the draft runs as the session's operation.
        - calls [tui.app.App.refreshCodeDraftPrompt](tui.md#tui.app.App.refreshCodeDraftPrompt), [tui.app.App.codeDraftProblem](tui.md#tui.app.App.codeDraftProblem), [tui.app.App.codeDraftRequest](tui.md#tui.app.App.codeDraftRequest), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [afterCodeDraft](../../src/tui/app.ts#L3639) (record: OperationRecord, origin: DraftOrigin) → void <!-- internal -->
        <a id="tui.app.App.afterCodeDraft"></a><br>A finished code-to-spec draft: the proposal opens MERGE under the same rule as a flow draft's, naming every flow it proposes and the model's notes.
        - calls [tui.app.App.stillWhereDraftStarted](tui.md#tui.app.App.stillWhereDraftStarted), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [plannedFns](../../src/tui/app.ts#L3663) () → string[] <!-- internal -->
        <a id="tui.app.App.plannedFns"></a><br>The planned fns of the current analysis that no code implements yet: the IDs spec-to-code builds.
      - fn [openSpecCodePrompt](../../src/tui/app.ts#L3677) (id?: string) → void <!-- internal -->
        <a id="tui.app.App.openSpecCodePrompt"></a><br>The spec-to-code form (design §2.4 `spec-to-code`): the planned fn — given (a feature's planned gap), else the one under the cursor, else typed or picked from the planned fns — the code file (empty: the module's, shown next to it), the mode (the offline template unless llm is…
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.plannedFns](tui.md#tui.app.App.plannedFns), [tui.app.App.refreshSpecCodePrompt](tui.md#tui.app.App.refreshSpecCodePrompt)
      - fn [specCodeTarget](../../src/tui/app.ts#L3688) (form: SpecCodeForm) → ReturnType<typeof plannedCodeTarget> | null <!-- internal -->
        <a id="tui.app.App.specCodeTarget"></a><br>Where the code would go, or why spec-to-code builds none: its own checks on the current analysis; null without one or without an ID.
        - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [plannedMatches](../../src/tui/app.ts#L3697) (typed: string) → string[] <!-- internal -->
        <a id="tui.app.App.plannedMatches"></a><br>The planned fns containing the typed text, at most eight; none once it is one.
        - calls [tui.app.App.plannedFns](tui.md#tui.app.App.plannedFns)
      - fn [specCodeProblem](../../src/tui/app.ts#L3705) (form: SpecCodeForm) → { field: string; text: string } | null <!-- internal -->
        <a id="tui.app.App.specCodeProblem"></a><br>Why spec-to-code may not start now, or null: an ID, spec-to-code's own checks, a model llm needs, then (a proposal only) a proposal waiting for the code file.
        - calls [tui.app.App.specCodeTarget](tui.md#tui.app.App.specCodeTarget), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting)
      - fn [refreshSpecCodePrompt](../../src/tui/app.ts#L3717) () → void <!-- internal -->
        <a id="tui.app.App.refreshSpecCodePrompt"></a><br>The rows, the root and what the template is, and a note on the selected row.
        - calls [tui.app.App.specCodeTarget](tui.md#tui.app.App.specCodeTarget), [tui.app.App.plannedMatches](tui.md#tui.app.App.plannedMatches), [tui.app.App.specCodeProblem](tui.md#tui.app.App.specCodeProblem), [tui.app.App.plannedFns](tui.md#tui.app.App.plannedFns), [tui.app.App.agentName](tui.md#tui.app.App.agentName)
      - fn [changeSpecCodeOutput](../../src/tui/app.ts#L3761) () → void <!-- internal -->
        <a id="tui.app.App.changeSpecCodeOutput"></a><br>←→ on the mode row (algo or llm) or the output row (proposal or preview).
        - calls [tui.app.App.refreshSpecCodePrompt](tui.md#tui.app.App.refreshSpecCodePrompt)
      - fn [submitSpecCode](../../src/tui/app.ts#L3772) () → void <!-- internal -->
        <a id="tui.app.App.submitSpecCode"></a><br>Enter in the form: a match takes that ID; elsewhere a problem keeps the form with the field selected, else spec-to-code runs as the session's operation.
        - calls [tui.app.App.refreshSpecCodePrompt](tui.md#tui.app.App.refreshSpecCodePrompt), [tui.app.App.specCodeProblem](tui.md#tui.app.App.specCodeProblem), [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [afterSpecCode](../../src/tui/app.ts#L3804) (record: OperationRecord, origin: DraftOrigin) → void <!-- internal -->
        <a id="tui.app.App.afterSpecCode"></a><br>Finished spec-to-code proposals: the code file opens MERGE under the same rule as a draft's, and the message names the tests waiting next; otherwise they all wait. A candidate is never the feature done.
        - calls [tui.app.App.stillWhereDraftStarted](tui.md#tui.app.App.stillWhereDraftStarted), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [applyCandidate](../../src/tui/app.ts#L3830) (record: OperationRecord | undefined) → void <!-- internal -->
        <a id="tui.app.App.applyCandidate"></a><br>`a` in F6 on a finished spec-to-code record: applies the entire candidate (`spec-to-code --apply`) after a step that names every file. Refused before that step: a run that did not finish, an outdated candidate (an input saved or its files written since), a file with unsaved…
        - calls [tui.app.App.applyConflicts](tui.md#tui.app.App.applyConflicts), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [applyConflicts](../../src/tui/app.ts#L3854) (files: readonly string[], proposals: boolean) → string[] <!-- internal -->
        <a id="tui.app.App.applyConflicts"></a><br>What in this session stops applying `files`: an open MERGE on one, unsaved edits, and (before the run) a waiting proposal.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [afterApplyCode](../../src/tui/app.ts#L3870) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.afterApplyCode"></a><br>After an apply: every spec-to-code candidate for a file it wrote is outdated (applying it again would overwrite newer code), and the message says what was written. `u` stays the undo of the last MERGE.
      - fn [openLayoutDraftPrompt](../../src/tui/app.ts#L3885) () → void <!-- internal -->
        <a id="tui.app.App.openLayoutDraftPrompt"></a><br>The draft-layout form (design §2.4 `draft map`): the mode (hybrid with a model, else algo), then run; nothing is written.
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.refreshLayoutDraftPrompt](tui.md#tui.app.App.refreshLayoutDraftPrompt)
      - fn [refreshLayoutDraftPrompt](../../src/tui/app.ts#L3891) () → void <!-- internal -->
        <a id="tui.app.App.refreshLayoutDraftPrompt"></a><br>Rebuilds the rows, details and note of the "draft-layout" prompt from the form's mode, keeping the current selection by id and checking whether the config file exists under the root. The note picks a message from the mode, [`tui.app.App.agentName`](tui.md#tui.app.App.agentName), and any problem from… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.layoutDraftProblem](tui.md#tui.app.App.layoutDraftProblem)
      - fn [layoutDraftProblem](../../src/tui/app.ts#L3922) (mode: "algo" | "hybrid" | "llm") → string | null <!-- internal -->
        <a id="tui.app.App.layoutDraftProblem"></a><br>Why a layout draft may not start: llm needs a model.
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName)
      - fn [changeLayoutDraftMode](../../src/tui/app.ts#L3926) (delta: -1 | 1) → void <!-- internal -->
        <a id="tui.app.App.changeLayoutDraftMode"></a><br>Cycles the layout draft's mode forward or backward through `DRAFT_MODES` with wraparound, but only when the active prompt is a draft-layout prompt whose selected field is "mode". Then redraws the prompt via [`tui.app.App.refreshLayoutDraftPrompt`](tui.md#tui.app.App.refreshLayoutDraftPrompt). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.refreshLayoutDraftPrompt](tui.md#tui.app.App.refreshLayoutDraftPrompt)
      - fn [submitLayoutDraft](../../src/tui/app.ts#L3933) () → void <!-- internal -->
        <a id="tui.app.App.submitLayoutDraft"></a><br>Validates the open draft-layout prompt via [`tui.app.App.layoutDraftProblem`](tui.md#tui.app.App.layoutDraftProblem), and on failure resets the cursor, redraws with [`tui.app.App.refreshLayoutDraftPrompt`](tui.md#tui.app.App.refreshLayoutDraftPrompt), and shows the error. Otherwise it closes the prompt and dispatches a draft-layout request for the current root… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.layoutDraftProblem](tui.md#tui.app.App.layoutDraftProblem), [tui.app.App.refreshLayoutDraftPrompt](tui.md#tui.app.App.refreshLayoutDraftPrompt), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [layoutBasis](../../src/tui/app.ts#L3950) () → LayoutBasis <!-- internal -->
        <a id="tui.app.App.layoutBasis"></a><br>keylang.json as the session has it now: its buffer's version, the file, the code snapshot.
        - calls [tui.disk.readText](tui.md#tui.disk.readText)
      - fn [layoutStale](../../src/tui/app.ts#L3955) (record: OperationRecord) → string | null <!-- internal -->
        <a id="tui.app.App.layoutStale"></a><br>Why the layers of a layout draft no longer fit the session, or null: keylang.json was edited, saved or changed on disk, or the code moved on.
        - calls [tui.app.App.layoutBasis](tui.md#tui.app.App.layoutBasis), [tui.disk.splitEol](tui.md#tui.disk.splitEol)
      - fn [afterLayoutDraft](../../src/tui/app.ts#L3969) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.afterLayoutDraft"></a><br>A finished layout draft: nothing moves by itself; an edit made meanwhile makes it outdated at once.
        - calls [tui.app.App.layoutStale](tui.md#tui.app.App.layoutStale)
      - fn [moveLayers](../../src/tui/app.ts#L3989) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.moveLayers"></a><br>Enter on a finished layout draft in F6: its layers replace only `layers` of keylang.json's buffer — every other field stays, unknown ones too — as one undoable edit; nothing is written until Ctrl+S. Without keylang.json a new buffer opens with the inferred config and these…
        - calls [tui.app.App.layoutStale](tui.md#tui.app.App.layoutStale), [tui.app.App.load](tui.md#tui.app.App.load), [tui.buffer.newFileBuffer](tui.md#tui.buffer.newFileBuffer), [base.config.withLayers](base.md#base.config.withLayers), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [base.config.parseConfig](base.md#base.config.parseConfig), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [openExportPrompt](../../src/tui/app.ts#L4053) () → void <!-- internal -->
        <a id="tui.app.App.openExportPrompt"></a><br>The export form of the report `exportRecord` picks (design §2.6): the format, the path (a default per format under `.keylang/export/`) and the target as it is now. Nothing is written before Save; Esc writes nothing.
        - calls [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.app.defaultExportPath](tui.md#tui.app.defaultExportPath), [tui.app.App.exportBytes](tui.md#tui.app.App.exportBytes), [tui.app.App.refreshExportPrompt](tui.md#tui.app.App.refreshExportPrompt)
      - fn [exportBytes](../../src/tui/app.ts#L4080) (record: OperationRecord, format: ExportFormat) → number <!-- internal -->
        <a id="tui.app.App.exportBytes"></a><br>The bytes of the report in a format: exactly what the CLI prints, from the record's payload.
        - calls [tui.app.exportSourceOf](tui.md#tui.app.exportSourceOf), [operations.operations.exportText](operations.md#operations.operations.exportText)
      - fn [exportProblem](../../src/tui/app.ts#L4086) (path: string) → string | null <!-- internal -->
        <a id="tui.app.App.exportProblem"></a><br>Why the typed target cannot receive the export now, or null. A dirty buffer of it is never written under.
        - calls [operations.operations.exportTargetProblem](operations.md#operations.operations.exportTargetProblem), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [refreshExportPrompt](../../src/tui/app.ts#L4100) () → void <!-- internal -->
        <a id="tui.app.App.refreshExportPrompt"></a><br>The rows of the form: the report (and whether it is outdated), the target as it is now, and what Save writes. Reading only.
        - calls [tui.app.App.exportProblem](tui.md#tui.app.App.exportProblem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.view.operationLabel](tui.md#tui.view.operationLabel), [tui.view.recordSummary](tui.md#tui.view.recordSummary)
      - fn [changeExportFormat](../../src/tui/app.ts#L4135) (delta: 1 | -1) → void <!-- internal -->
        <a id="tui.app.App.changeExportFormat"></a><br>←→ in the export form: the next format; an untouched default path follows it.
        - calls [tui.app.defaultExportPath](tui.md#tui.app.defaultExportPath), [tui.app.App.exportBytes](tui.md#tui.app.App.exportBytes), [tui.app.App.refreshExportPrompt](tui.md#tui.app.App.refreshExportPrompt)
      - fn [submitExport](../../src/tui/app.ts#L4151) () → void <!-- internal -->
        <a id="tui.app.App.submitExport"></a><br>Enter in the export form, on any row: the report as it ran goes to the shown target through the file protocol. A refusal keeps the form; the target is expected as the form last showed it.
        - calls [tui.app.exportSourceOf](tui.md#tui.app.exportSourceOf), [tui.app.App.exportProblem](tui.md#tui.app.App.exportProblem), [tui.app.App.refreshExportPrompt](tui.md#tui.app.App.refreshExportPrompt), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation)
      - fn [openNewSpec](../../src/tui/app.ts#L4177) () → void <!-- internal -->
        <a id="tui.app.App.openNewSpec"></a><br>The form of a new specification (design §2.8): kind, then path, then (for a flow) its name. Nothing exists until Ctrl+S.
        - calls [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec)
      - fn [refreshNewSpec](../../src/tui/app.ts#L4183) () → void <!-- internal -->
        <a id="tui.app.App.refreshNewSpec"></a><br>The items and the note of the field being typed. The root is always named: the path is relative to it.
        - calls [tui.new-spec.defaultSpecPath](tui.md#tui.new-spec.defaultSpecPath), [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.new-spec.flowNameProblem](tui.md#tui.new-spec.flowNameProblem)
      - fn [submitNewSpec](../../src/tui/app.ts#L4213) () → void <!-- internal -->
        <a id="tui.app.App.submitNewSpec"></a><br>Enter in the form: the next field, or the buffer. An invalid field keeps the form with its text and says why.
        - calls [tui.new-spec.defaultSpecPath](tui.md#tui.new-spec.defaultSpecPath), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.open](tui.md#tui.app.App.open), [tui.new-spec.suggestedFlowName](tui.md#tui.new-spec.suggestedFlowName), [tui.app.App.createSpec](tui.md#tui.app.App.createSpec), [tui.new-spec.flowNameProblem](tui.md#tui.new-spec.flowNameProblem)
      - fn [createSpec](../../src/tui/app.ts#L4256) (kind: NewSpecForm["kind"], path: string, name: string) → void <!-- internal -->
        <a id="tui.app.App.createSpec"></a><br>Opens the new, unsaved buffer in the editor at its end: listed in FILES and analysed as overlay, no file or directory until Ctrl+S.
        - calls [tui.buffer.newFileBuffer](tui.md#tui.buffer.newFileBuffer), [tui.new-spec.specTemplate](tui.md#tui.new-spec.specTemplate), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [mergeOrPick](../../src/tui/app.ts#L4275) () → void <!-- internal -->
        <a id="tui.app.App.mergeOrPick"></a><br>`m`: the proposal of the current file opens directly; otherwise the proposals list, so no target is chosen for the person. Without a mergeable proposal the message names the ignored ones and their reasons, as before.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals)
      - fn [openProposals](../../src/tui/app.ts#L4283) (prefer: readonly string[] = []) → void <!-- internal -->
        <a id="tui.app.App.openProposals"></a><br>The proposals list (design §2.9): every file under `.keylang/proposals/`, scanned now; viewing writes nothing.
        - calls [tui.merge-session.MergeSession.entries](tui.md#tui.merge-session.MergeSession.entries), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt)
      - fn [refreshProposalPrompt](../../src/tui/app.ts#L4296) (selected?: string) → void <!-- internal -->
        <a id="tui.app.App.refreshProposalPrompt"></a><br>The list entries whose path contains the typed text, in POSIX path order, each with its note.
        - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.padWidth](tui.md#tui.width.padWidth), [tui.app.proposalSummary](tui.md#tui.app.proposalSummary)
      - fn [submitProposal](../../src/tui/app.ts#L4315) () → void <!-- internal -->
        <a id="tui.app.App.submitProposal"></a><br>Enter in the list: the entry is scanned again first, so a proposal removed, rewritten or broken since the list was built is judged as it is now. A mergeable one opens in MERGE against the file on disk; any other keeps the list open with its reason, and nothing is written.
        - calls [tui.merge-session.MergeSession.entries](tui.md#tui.merge-session.MergeSession.entries), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [openResults](../../src/tui/app.ts#L4333) () → void <!-- internal -->
        <a id="tui.app.App.openResults"></a><br>F6 or the palette: the pinned current analysis and the history of operation records.
        - calls [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [closeResults](../../src/tui/app.ts#L4351) () → void <!-- internal -->
        <a id="tui.app.App.closeResults"></a><br>Esc closes the panel, not the running operation; the focus goes back where F6 was pressed.
      - fn [rerunRecord](../../src/tui/app.ts#L4360) () → void <!-- internal -->
        <a id="tui.app.App.rerunRecord"></a><br>Enter in the panel: reruns the selected record with its exact parameters.
        - calls [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals), [tui.app.App.moveLayers](tui.md#tui.app.App.moveLayers), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [resultsKey](../../src/tui/app.ts#L4390) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.resultsKey"></a><br>While the panel is open its keys stay with it; Tab switches between the entries and the content.
        - calls [tui.app.App.findingsKey](tui.md#tui.app.App.findingsKey), [tui.view.layout](tui.md#tui.view.layout), [tui.view.reportOverflow](tui.md#tui.view.reportOverflow), [tui.view.resultsReportRows](tui.md#tui.view.resultsReportRows), [tui.app.App.scrollReport](tui.md#tui.app.App.scrollReport), [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding), [tui.app.App.showGapReason](tui.md#tui.app.App.showGapReason), [tui.app.App.selectedGap](tui.md#tui.app.App.selectedGap), [tui.app.App.openGap](tui.md#tui.app.App.openGap), [tui.app.App.wireTarget](tui.md#tui.app.App.wireTarget), [tui.app.App.openWireTarget](tui.md#tui.app.App.openWireTarget), [tui.app.App.rerunRecord](tui.md#tui.app.App.rerunRecord), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.app.App.openExportPrompt](tui.md#tui.app.App.openExportPrompt), [tui.app.App.applyCandidate](tui.md#tui.app.App.applyCandidate), [tui.app.App.specCodeForGap](tui.md#tui.app.App.specCodeForGap), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [findingsKey](../../src/tui/app.ts#L4467) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.findingsKey"></a><br>The keys of the pinned "Current analysis" entry: the findings list with verdict filters.
        - calls [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.moveFinding](tui.md#tui.app.App.moveFinding), [tui.app.App.openFinding](tui.md#tui.app.App.openFinding), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [moveFinding](../../src/tui/app.ts#L4520) (delta: number) → void <!-- internal -->
        <a id="tui.app.App.moveFinding"></a><br>Moves the finding selection and keeps it in the visible part of the list.
        - calls [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [clampFinding](../../src/tui/app.ts#L4526) () → void <!-- internal -->
        <a id="tui.app.App.clampFinding"></a><br>The finding selection stays within the filtered list, and the list scrolls to keep it in view.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout)
      - fn [selectedFinding](../../src/tui/app.ts#L4536) () → CheckResult | undefined <!-- internal -->
        <a id="tui.app.App.selectedFinding"></a><br>The finding selected in the filtered list of the current analysis, if any.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf)
      - fn [openFinding](../../src/tui/app.ts#L4546) () → void <!-- internal -->
        <a id="tui.app.App.openFinding"></a><br>Enter on a finding: the panel hides while the target is shown — a spec position in the editor (the file need not be among the Markdown buffers) or the line in the read-only code viewer. Esc / Ctrl+O return to the list without losing the selection and put back the place it was…
        - calls [tui.app.App.selectedFinding](tui.md#tui.app.App.selectedFinding), [tui.app.App.openTarget](tui.md#tui.app.App.openTarget)
      - fn [openTarget](../../src/tui/app.ts#L4552) (file: string, targetLine: number, targetCol: number) → void <!-- internal -->
        <a id="tui.app.App.openTarget"></a><br>Shows a spec position (1-based line, code-point column) or a code line with the F6 panel hidden; the origin is kept for the way back.
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.width.clusterAt](tui.md#tui.width.clusterAt), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.showCode](tui.md#tui.app.App.showCode)
      - fn [returnToFindings](../../src/tui/app.ts#L4577) () → void <!-- internal -->
        <a id="tui.app.App.returnToFindings"></a><br>Back from a finding's target: the list with its selection, over the place the finding was opened from.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [scrollReport](../../src/tui/app.ts#L4598) (delta: number) → void <!-- internal -->
        <a id="tui.app.App.scrollReport"></a><br>Moves the results report by `delta`: on an analysis entry it defers to [`tui.app.App.moveFinding`](tui.md#tui.app.App.moveFinding), on a feature report it steps the selected gap (via [`tui.app.App.recordGaps`](tui.md#tui.app.App.recordGaps)) and scrolls to keep it visible, then calls [`tui.app.App.showGapReason`](tui.md#tui.app.App.showGapReason). Otherwise it scrolls the text… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.moveFinding](tui.md#tui.app.App.moveFinding), [tui.view.resultsReportRows](tui.md#tui.view.resultsReportRows), [tui.app.App.recordGaps](tui.md#tui.app.App.recordGaps), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.showGapReason](tui.md#tui.app.App.showGapReason)
      - fn [recordGaps](../../src/tui/app.ts#L4628) () → readonly { file: string; line: number; col: number; text: string }[] <!-- internal -->
        <a id="tui.app.App.recordGaps"></a><br>The items of the selected record the arrows select after Tab: the gaps of a feature record, every result of a check record, the evidence of an explain-edge record (an edge with no file has an empty one), the diagnostics of a parse record; none for the others. `text` is the…
        - calls [tui.view.edgeItems](tui.md#tui.view.edgeItems), [tui.view.batchState](tui.md#tui.view.batchState), [base.config.toPosix](base.md#base.config.toPosix), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
      - fn [selectedGap](../../src/tui/app.ts#L4650) () → { file: string; line: number; col: number; text: string } | undefined <!-- internal -->
        <a id="tui.app.App.selectedGap"></a><br>Returns the gap entry at the index stored in the results state's `gap` cursor, picking it from the list produced by [`tui.app.App.recordGaps`](tui.md#tui.app.App.recordGaps), or undefined when the index is out of range. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.recordGaps](tui.md#tui.app.App.recordGaps)
      - fn [showGapReason](../../src/tui/app.ts#L4655) () → void <!-- internal -->
        <a id="tui.app.App.showGapReason"></a><br>The report row cuts a long reason; the message line shows the selected item's whole reason.
        - calls [tui.app.App.selectedGap](tui.md#tui.app.App.selectedGap), [tui.app.App.plannedGap](tui.md#tui.app.App.plannedGap)
      - fn [plannedGap](../../src/tui/app.ts#L4661) () → string | null <!-- internal -->
        <a id="tui.app.App.plannedGap"></a><br>The ID of the selected gap of a feature report when it is a planned fn no code implements yet, else null.
        - calls [tui.app.App.plannedFns](tui.md#tui.app.App.plannedFns)
      - fn [specCodeForGap](../../src/tui/app.ts#L4669) () → void <!-- internal -->
        <a id="tui.app.App.specCodeForGap"></a><br>`g` on a planned gap: the spec-to-code form with its ID; the report stays in the history.
        - calls [tui.app.App.plannedGap](tui.md#tui.app.App.plannedGap), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.openSpecCodePrompt](tui.md#tui.app.App.openSpecCodePrompt)
      - fn [openGap](../../src/tui/app.ts#L4680) () → void <!-- internal -->
        <a id="tui.app.App.openGap"></a><br>Enter on a gap or a check result: its file and position, like a finding (Esc / Ctrl+O come back to the report).
        - calls [tui.app.App.selectedGap](tui.md#tui.app.App.selectedGap), [tui.app.App.openTarget](tui.md#tui.app.App.openTarget)
      - fn [mouse](../../src/tui/app.ts#L4687) (event: MouseEvent) → void <!-- internal -->
        <a id="tui.app.App.mouse"></a><br>Routes a mouse event to the panel under it via [`tui.view.layout`](tui.md#tui.view.layout): the wheel scrolls the report ([`tui.app.App.scrollReport`](tui.md#tui.app.App.scrollReport)), code, merge, context, nav or editor, and moves update hover through [`tui.app.App.hoverAt`](tui.md#tui.app.App.hoverAt). A left click selects a context/nav/files row and forwards an… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.scrollReport](tui.md#tui.app.App.scrollReport), [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.cellAt](tui.md#tui.app.App.cellAt), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt), [tui.view.contextTop](tui.md#tui.view.contextTop), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.view.filesTop](tui.md#tui.view.filesTop), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode)
      - fn [promptType](../../src/tui/app.ts#L4770) (text: string) → void <!-- internal -->
        <a id="tui.app.App.promptType"></a><br>Appends typed text to the active prompt's current field, routing it to the right form sub-field per prompt kind (e.g. digits only for the code-to-spec line) and ignoring choice-only forms. It then calls the matching refresh method, such as [`tui.app.App.refreshPalette`](tui.md#tui.app.App.refreshPalette) or… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.refreshFeaturePrompt](tui.md#tui.app.App.refreshFeaturePrompt), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.app.App.refreshAgentsPrompt](tui.md#tui.app.App.refreshAgentsPrompt), [tui.app.App.refreshInitPrompt](tui.md#tui.app.App.refreshInitPrompt), [tui.app.App.refreshFmtPrompt](tui.md#tui.app.App.refreshFmtPrompt), [tui.app.App.refreshParsePrompt](tui.md#tui.app.App.refreshParsePrompt), [tui.app.App.refreshTracePlanPrompt](tui.md#tui.app.App.refreshTracePlanPrompt), [tui.app.App.refreshExplainPrompt](tui.md#tui.app.App.refreshExplainPrompt), [tui.app.App.refreshWirePrompt](tui.md#tui.app.App.refreshWirePrompt), [tui.app.App.refreshCheckPrompt](tui.md#tui.app.App.refreshCheckPrompt), [tui.app.App.refreshEdgePrompt](tui.md#tui.app.App.refreshEdgePrompt), [tui.app.App.refreshExportPrompt](tui.md#tui.app.App.refreshExportPrompt), [tui.app.App.refreshDraftPrompt](tui.md#tui.app.App.refreshDraftPrompt), [tui.app.App.refreshRulesDraftPrompt](tui.md#tui.app.App.refreshRulesDraftPrompt), [tui.app.App.refreshCodeDraftPrompt](tui.md#tui.app.App.refreshCodeDraftPrompt), [tui.app.App.refreshSpecCodePrompt](tui.md#tui.app.App.refreshSpecCodePrompt)
      - fn [findNodes](../../src/tui/app.ts#L4820) () → void <!-- internal -->
        <a id="tui.app.App.findNodes"></a><br>The nodes matching the `s` prompt: names and IDs as a subsequence, then words of their explanations.
        - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes)
      - fn [promptKey](../../src/tui/app.ts#L4830) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.promptKey"></a><br>Routes a key event to the active prompt: escape closes it, backspace trims the focused field via [`tui.width.graphemes`](tui.md#tui.width.graphemes) and re-runs the matching refresh, arrows cycle options or list items, enter dispatches the per-kind submit (or [`tui.app.App.findNext`](tui.md#tui.app.App.findNext)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.refreshFeaturePrompt](tui.md#tui.app.App.refreshFeaturePrompt), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.app.App.refreshAgentsPrompt](tui.md#tui.app.App.refreshAgentsPrompt), [tui.app.App.refreshInitPrompt](tui.md#tui.app.App.refreshInitPrompt), [tui.app.App.refreshFmtPrompt](tui.md#tui.app.App.refreshFmtPrompt), [tui.app.App.refreshParsePrompt](tui.md#tui.app.App.refreshParsePrompt), [tui.app.App.refreshTracePlanPrompt](tui.md#tui.app.App.refreshTracePlanPrompt), [tui.app.App.refreshExplainPrompt](tui.md#tui.app.App.refreshExplainPrompt), [tui.app.App.refreshWirePrompt](tui.md#tui.app.App.refreshWirePrompt), [tui.app.App.refreshCheckPrompt](tui.md#tui.app.App.refreshCheckPrompt), [tui.app.App.refreshEdgePrompt](tui.md#tui.app.App.refreshEdgePrompt), [tui.app.App.refreshExportPrompt](tui.md#tui.app.App.refreshExportPrompt), [tui.app.App.refreshDraftPrompt](tui.md#tui.app.App.refreshDraftPrompt), [tui.app.App.refreshRulesDraftPrompt](tui.md#tui.app.App.refreshRulesDraftPrompt), [tui.app.App.refreshCodeDraftPrompt](tui.md#tui.app.App.refreshCodeDraftPrompt), [tui.app.App.refreshSpecCodePrompt](tui.md#tui.app.App.refreshSpecCodePrompt), [tui.app.App.changeSpecCodeOutput](tui.md#tui.app.App.changeSpecCodeOutput), [tui.app.App.changeExplainPlanList](tui.md#tui.app.App.changeExplainPlanList), [tui.app.App.changeExplainDetail](tui.md#tui.app.App.changeExplainDetail), [tui.app.App.changeCodeDraftChoice](tui.md#tui.app.App.changeCodeDraftChoice), [tui.app.App.changeDraftChoice](tui.md#tui.app.App.changeDraftChoice), [tui.app.App.changeRulesDraftChoice](tui.md#tui.app.App.changeRulesDraftChoice), [tui.app.App.changeLayoutDraftMode](tui.md#tui.app.App.changeLayoutDraftMode), [tui.app.App.changeCheckOption](tui.md#tui.app.App.changeCheckOption), [tui.app.App.changeExportFormat](tui.md#tui.app.App.changeExportFormat), [tui.app.App.featureNote](tui.md#tui.app.App.featureNote), [tui.app.App.tracePlanNote](tui.md#tui.app.App.tracePlanNote), [tui.app.App.explainNote](tui.md#tui.app.App.explainNote), [tui.app.App.refreshLayoutDraftPrompt](tui.md#tui.app.App.refreshLayoutDraftPrompt), [tui.app.App.submitFeature](tui.md#tui.app.App.submitFeature), [tui.app.App.submitBaseline](tui.md#tui.app.App.submitBaseline), [tui.app.App.submitAgents](tui.md#tui.app.App.submitAgents), [tui.app.App.submitInit](tui.md#tui.app.App.submitInit), [tui.app.App.submitFmt](tui.md#tui.app.App.submitFmt), [tui.app.App.submitParse](tui.md#tui.app.App.submitParse), [tui.app.App.submitTracePlan](tui.md#tui.app.App.submitTracePlan), [tui.app.App.submitExplain](tui.md#tui.app.App.submitExplain), [tui.app.App.submitWire](tui.md#tui.app.App.submitWire), [tui.app.App.submitCheck](tui.md#tui.app.App.submitCheck), [tui.app.App.submitEdge](tui.md#tui.app.App.submitEdge), [tui.app.App.submitExport](tui.md#tui.app.App.submitExport), [tui.app.App.submitDraft](tui.md#tui.app.App.submitDraft), [tui.app.App.submitRulesDraft](tui.md#tui.app.App.submitRulesDraft), [tui.app.App.submitLayoutDraft](tui.md#tui.app.App.submitLayoutDraft), [tui.app.App.submitCodeDraft](tui.md#tui.app.App.submitCodeDraft), [tui.app.App.submitSpecCode](tui.md#tui.app.App.submitSpecCode), [tui.app.App.submitProposal](tui.md#tui.app.App.submitProposal), [tui.app.App.submitNewSpec](tui.md#tui.app.App.submitNewSpec), [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.addToContext](tui.md#tui.app.App.addToContext), [tui.app.App.goToNode](tui.md#tui.app.App.goToNode), [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.promptType](tui.md#tui.app.App.promptType)
      - fn [openPalette](../../src/tui/app.ts#L4938) () → void <!-- internal -->
        <a id="tui.app.App.openPalette"></a><br>`:` in view/read, Ctrl+P anywhere: the full catalogue with fuzzy search.
        - calls [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette)
      - fn [refreshPalette](../../src/tui/app.ts#L4944) () → void <!-- internal -->
        <a id="tui.app.App.refreshPalette"></a><br>The catalogue entries matching the prompt text, as parallel item arrays.
        - calls [tui.actions.matchActions](tui.md#tui.actions.matchActions), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionLabel](tui.md#tui.actions.actionLabel)
      - fn [runAction](../../src/tui/app.ts#L4960) (id: string) → void <!-- internal -->
        <a id="tui.app.App.runAction"></a><br>Executes a palette action by its id. An unavailable action explains its reason; execution never synthesizes fake key events.
        - calls [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.app.App.browse](tui.md#tui.app.App.browse), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.app.App.openResults](tui.md#tui.app.App.openResults), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [tui.app.App.openFeaturePrompt](tui.md#tui.app.App.openFeaturePrompt), [tui.app.App.openCheckPrompt](tui.md#tui.app.App.openCheckPrompt), [tui.app.App.openEdgePrompt](tui.md#tui.app.App.openEdgePrompt), [tui.app.App.openExportPrompt](tui.md#tui.app.App.openExportPrompt), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.app.App.openBaselinePrompt](tui.md#tui.app.App.openBaselinePrompt), [tui.app.App.openAgentsPrompt](tui.md#tui.app.App.openAgentsPrompt), [tui.app.App.openInitPrompt](tui.md#tui.app.App.openInitPrompt), [tui.app.App.openFmtPrompt](tui.md#tui.app.App.openFmtPrompt), [tui.app.App.openParsePrompt](tui.md#tui.app.App.openParsePrompt), [tui.app.App.openTracePlanPrompt](tui.md#tui.app.App.openTracePlanPrompt), [tui.app.App.openExplainPrompt](tui.md#tui.app.App.openExplainPrompt), [tui.app.App.openExplainModelPrompt](tui.md#tui.app.App.openExplainModelPrompt), [tui.app.App.openExplainPlanPrompt](tui.md#tui.app.App.openExplainPlanPrompt), [tui.app.App.openDraftPrompt](tui.md#tui.app.App.openDraftPrompt), [tui.app.App.openRulesDraftPrompt](tui.md#tui.app.App.openRulesDraftPrompt), [tui.app.App.openLayoutDraftPrompt](tui.md#tui.app.App.openLayoutDraftPrompt), [tui.app.App.openCodeDraftPrompt](tui.md#tui.app.App.openCodeDraftPrompt), [tui.app.App.openSpecCodePrompt](tui.md#tui.app.App.openSpecCodePrompt), [tui.app.App.openWirePrompt](tui.md#tui.app.App.openWirePrompt), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.hoverAtCursor](tui.md#tui.app.App.hoverAtCursor), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.save](tui.md#tui.app.App.save), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.draftAtCursor](tui.md#tui.app.App.draftAtCursor), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.actions.applyRecord](tui.md#tui.actions.applyRecord), [tui.app.App.applyCandidate](tui.md#tui.app.App.applyCandidate), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.mergeOrPick](tui.md#tui.app.App.mergeOrPick), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals), [tui.app.App.openNewSpec](tui.md#tui.app.App.openNewSpec), [tui.app.packageVersion](tui.md#tui.app.packageVersion), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [findNext](../../src/tui/app.ts#L5099) () → void <!-- internal -->
        <a id="tui.app.App.findNext"></a><br>Scans forward from the cursor (wrapping around) for the next line containing the current search query, case-insensitively, and moves the cursor to the match using [`tui.width.graphemes`](tui.md#tui.width.graphemes) for the column before calling [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). If nothing matches, it sets a "not… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [textToSpec](../../src/tui/app.ts#L5117) () → void <!-- internal -->
        <a id="tui.app.App.textToSpec"></a><br>Takes the selected lines or the prose paragraph around the cursor in the buffer from [`tui.app.App.buffer`](tui.md#tui.app.App.buffer), converts it into spec list items via [`tui.text-to-spec.textToSpec`](tui.md#tui.text-to-spec.textToSpec) using known node ids plus [`tui.app.plannedIds`](tui.md#tui.app.plannedIds), and drops items already present below. Any remaining… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.plannedIds](tui.md#tui.app.plannedIds), [tui.text-to-spec.textToSpec](tui.md#tui.text-to-spec.textToSpec), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start)
    - fn [defaultExportPath](../../src/tui/app.ts#L5165) (kind: OperationRecord["kind"], format: ExportFormat) → string <!-- internal -->
      <a id="tui.app.defaultExportPath"></a><br>Where an export goes unless a path is typed: `.keylang/export/check.json`, `.keylang/export/edge.txt`, `.keylang/export/parse.txt`, `.keylang/export/trace-plan.json`.
    - fn [exportSourceOf](../../src/tui/app.ts#L5172) (record: OperationRecord, format: ExportFormat) → ExportSource | null <!-- internal -->
      <a id="tui.app.exportSourceOf"></a><br>The typed report of a finished record in a format, or null when it has none.
      - calls [features.check-format.isCheckFormat](features.md#features.check-format.isCheckFormat)
    - fn [forNodes](../../src/tui/app.ts#L5187) (doc: Document, visit: (node: Node) => void) → void <!-- internal -->
      <a id="tui.app.forNodes"></a><br>Iterates every section of a document, expands each with [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes), and recursively applies the callback to each node and its descendants via [`lang.ir.walk`](lang.md#lang.ir.walk). Used by [`tui.app.App.lineOfNode`](tui.md#tui.app.App.lineOfNode), [`tui.app.App.nodeAtCursor`](tui.md#tui.app.App.nodeAtCursor), [`tui.app.App.targetNear`](tui.md#tui.app.App.targetNear), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [plannedIds](../../src/tui/app.ts#L5191) (docs: readonly Document[]) → { id: string; kind: string }[] <!-- internal -->
      <a id="tui.app.plannedIds"></a><br>Walks every node of each document via [`tui.app.forNodes`](tui.md#tui.app.forNodes) and collects those with kind "planned" and a non-empty id. Returns their ids paired with the label text, defaulting to "fn" when no label is set. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.app.forNodes](tui.md#tui.app.forNodes)
    - fn [sortFiles](../../src/tui/app.ts#L5202) (files: string[], analysis: Analysis | null) → string[] <!-- internal -->
      <a id="tui.app.sortFiles"></a><br>Hand-written specs first (flows, rules), then generated map files, then `keylang.json`.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [typedRun](../../src/tui/app.ts#L5208) (events: readonly InputEvent[], from: number) → KeyEvent[] <!-- internal -->
      <a id="tui.app.typedRun"></a><br>The keys from `from` on that only type text (letters, Enter, Tab without modifiers).
    - fn [printable](../../src/tui/app.ts#L5222) (text: string) → string <!-- internal -->
      <a id="tui.app.printable"></a><br>Text that may go into a spec: escape sequences (colored output pasted from a terminal) and other control characters are removed; tabs and line breaks stay.
    - fn [configState](../../src/tui/app.ts#L5230) (root: string) → ConfigState <!-- internal -->
      <a id="tui.app.configState"></a><br>`keylang.json` as it is on disk now: missing (with the guessed layout), invalid (with the reason) or valid.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.guessLayout](base.md#base.config.guessLayout), [base.config.parseConfig](base.md#base.config.parseConfig), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
    - fn [configErrorCursor](../../src/tui/app.ts#L5251) (text: string, reason: string) → Cursor
      <a id="tui.app.configErrorCursor"></a><br>Where the config error is: the line and column of an invalid JSON message (`line 3 column 5`, else `position N`), or the key the first quoted field path names (`check.trace` → `"check"`, then `"trace"` after it); else the start.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [packageVersion](../../src/tui/app.ts#L5276) () → string <!-- internal -->
      <a id="tui.app.packageVersion"></a><br>The package version, for the "About keylang" palette action.
    - fn [proposalSummary](../../src/tui/app.ts#L5282) (entry: ProposalEntry) → string <!-- internal -->
      <a id="tui.app.proposalSummary"></a><br>The list text of a proposal after its path: kind, a new file, and the hunk count or that it is ignored.
    - type [LayoutBasis](../../src/tui/app.ts#L5304) <!-- internal -->
      <a id="tui.app.LayoutBasis"></a><br>What a layout draft was made against: keylang.json's buffer (null: none open), the file, the code snapshot.
    - type [DraftOrigin](../../src/tui/app.ts#L5310) <!-- internal -->
      <a id="tui.app.DraftOrigin"></a><br>Records where a draft came from: the file path (or none), the editor `Mode` it was captured in, and an optional version number so the draft can later be matched against the document it belongs to. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [assist](../../src/tui/assist.ts#L1)
    <a id="tui.assist"></a><br>What a model or a microphone adds to a session: ghost text and voice. Each finishes later than it was asked for, so each remembers where it was asked — the buffer, its text version and the mode — and lands only while that is still where the person is (review 2026-09-28): a…
    - analyze [map.analyze](map.md#map.analyze)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - config [base.config](base.md#base.config)
    - ghost [features.ghost](features.md#features.ghost)
    - stats [features.stats](features.md#features.stats)
    - voice [features.voice](features.md#features.voice)
    - merge-session [tui.merge-session](tui.md#tui.merge-session)
    - state [tui.state](tui.md#tui.state)
    - width [tui.width](tui.md#tui.width)
    - llm [features.llm](features.md#features.llm)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - type [Microphone](../../src/tui/assist.ts#L23)
      <a id="tui.assist.Microphone"></a><br>Describes a function that opens an audio capture session, resolving to an async stream of 16-bit PCM sample chunks plus a `stop` callback, or `null` when no microphone is available. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [AssistHost](../../src/tui/assist.ts#L26)
      <a id="tui.assist.AssistHost"></a><br>What the assists need from the session around them.
    - type [Spot](../../src/tui/assist.ts#L40) <!-- internal -->
      <a id="tui.assist.Spot"></a><br>Where async work was asked for; it lands only while the session is still there.
    - type [GhostFlight](../../src/tui/assist.ts#L47) <!-- internal -->
      <a id="tui.assist.GhostFlight"></a><br>The ghost request on its way: where it was asked, and how to abort it.
    - type [Recording](../../src/tui/assist.ts#L54) <!-- internal -->
      <a id="tui.assist.Recording"></a><br>A recording from its first `Ctrl+R`: the microphone may still be opening when the second one comes.
    - fn [countSuggestion](../../src/tui/assist.ts#L61) (root: string, source: "ghost" | "completion", field: "proposed" | "accepted" | "rejected", shown: number | null | undefined) → void
      <a id="tui.assist.countSuggestion"></a><br>Counts for design §7.3: ghost measured against the deterministic completion; an unwritable `.keylang/` only loses the count.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats)
    - module [Assist](../../src/tui/assist.ts#L73)
      <a id="tui.assist.Assist"></a><br>Drives the editor's agent-backed help: after a typing pause it asks the agent for one ghost line via [`tui.assist.Assist.ghostSoon`](tui.md#tui.assist.Assist.ghostSoon), showing it only if the buffer, mode and cursor line are unchanged, and lets `Tab` accept it. It also runs voice input through… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [constructor](../../src/tui/assist.ts#L82) (host: AssistHost, microphone: Microphone)
        <a id="tui.assist.Assist.constructor"></a><br>Stores the given host and microphone on the instance so later methods can use them; nothing else happens at construction time. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [state](../../src/tui/assist.ts#L87) () → State <!-- internal -->
        <a id="tui.assist.Assist.state"></a><br>Private getter that returns the current `State` object owned by the host, so the assist logic reads the host's state rather than keeping its own copy. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [waiting](../../src/tui/assist.ts#L92) () → boolean
        <a id="tui.assist.Assist.waiting"></a><br>A ghost request waits for its pause.
      - fn [recordingNow](../../src/tui/assist.ts#L96) () → boolean
        <a id="tui.assist.Assist.recordingNow"></a><br>Reports whether an audio capture is currently in progress by checking that the assistant's `recording` field holds a non-null value. It is a read-only accessor with no side effects. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [close](../../src/tui/assist.ts#L100) () → void
        <a id="tui.assist.Assist.close"></a><br>Tears down the assistant's live state by discarding any pending ghost suggestion via [`tui.assist.Assist.cancelGhost`](tui.md#tui.assist.Assist.cancelGhost) and stopping the active recording's microphone if one exists. Invoked from [`tui.app.App.close`](tui.md#tui.app.App.close) during application shutdown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [spot](../../src/tui/assist.ts#L105) (buffer: Buffer) → Spot <!-- internal -->
        <a id="tui.assist.Assist.spot"></a><br>Builds a lightweight snapshot pairing the buffer's path and version with the current editing mode, so [`tui.assist.Assist.ghostSoon`](tui.md#tui.assist.Assist.ghostSoon) and [`tui.assist.Assist.voice`](tui.md#tui.assist.Assist.voice) can later check whether a request still matches the state it was issued for. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [at](../../src/tui/assist.ts#L110) (spot: Spot) → boolean <!-- internal -->
        <a id="tui.assist.Assist.at"></a><br>The session is where `spot` was taken: the same buffer, its text unchanged, the same mode, no merge on top.
      - fn [stopGhostTimer](../../src/tui/assist.ts#L117) () → void <!-- internal -->
        <a id="tui.assist.Assist.stopGhostTimer"></a><br>Clears any pending ghost-suggestion timeout, nulls the handle, and notifies the host via `settled()` that no more work is in flight; does nothing if no timer is active. Used by [`tui.assist.Assist.cancelGhost`](tui.md#tui.assist.Assist.cancelGhost). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [cancelGhost](../../src/tui/assist.ts#L125) () → void
        <a id="tui.assist.Assist.cancelGhost"></a><br>No ghost request waits for its pause or runs: the one in flight is aborted.
        - calls [tui.assist.Assist.stopGhostTimer](tui.md#tui.assist.Assist.stopGhostTimer)
      - fn [cancelStaleGhost](../../src/tui/assist.ts#L132) () → void
        <a id="tui.assist.Assist.cancelStaleGhost"></a><br>After any input: a ghost request in flight for a place the session has left (buffer, text, mode, line) is aborted.
        - calls [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [suspendGhost](../../src/tui/assist.ts#L141) () → void
        <a id="tui.assist.Assist.suspendGhost"></a><br>An explicit operation starts: a ghost request waiting for its pause is not made, and one already asked is aborted and never shown.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [ghostSoon](../../src/tui/assist.ts#L147) () → void
        <a id="tui.assist.Assist.ghostSoon"></a><br>After a pause with the cursor on a new flow item, ask the agent for one next line; never while an operation runs.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.ghost.ghostSignal](features.md#features.ghost.ghostSignal), [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.ghost.ghostSuggestions](features.md#features.ghost.ghostSuggestions), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [base.config.isCliAgent](base.md#base.config.isCliAgent)
      - fn [acceptGhost](../../src/tui/assist.ts#L193) (ghost: NonNullable<State["ghost"]>) → void
        <a id="tui.assist.Assist.acceptGhost"></a><br>`Tab` on a ghost line: taken only into the text it was shown for.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [dropGhost](../../src/tui/assist.ts#L209) () → void
        <a id="tui.assist.Assist.dropGhost"></a><br>Anything but `Tab` and `Alt+]` drops a shown ghost line.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [voice](../../src/tui/assist.ts#L225) () → void
        <a id="tui.assist.Assist.voice"></a><br>`Ctrl+R`: record until `Ctrl+R` again (or the source ends), recognize, and insert: on a new list item a command («крок …», «коли … тоді …») becomes the item, anything else is free text at the cursor. The speech goes in only while the same buffer, with the same text, is still…
        - calls [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.voice.voiceEngine](features.md#features.voice.voiceEngine), [features.voice.glossary](features.md#features.voice.glossary), [features.voice.transcribeOpenRouter](features.md#features.voice.transcribeOpenRouter), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.insertSpeech](tui.md#tui.assist.Assist.insertSpeech), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [insertSpeech](../../src/tui/assist.ts#L292) (text: string, line: number, analysis: Analysis) → void <!-- internal -->
        <a id="tui.assist.Assist.insertSpeech"></a><br>Writes recognized voice text into the host buffer: on a blank or bare-dash line it replaces that line with spec lines built by [`features.voice.speechToSpec`](features.md#features.voice.speechToSpec) from the snapshot's fn node ids, otherwise it inserts the trimmed text at the cursor, measuring positions with… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [features.voice.speechToSpec](features.md#features.voice.speechToSpec), [tui.width.graphemes](tui.md#tui.width.graphemes)
  - module [background](../../src/tui/background.ts#L1)
    <a id="tui.background"></a><br>Snapshot generation off the UI thread. One long-lived worker builds the map (tree-sitter extraction, graph, render); the caller parses specs and assesses on its own thread, which is fast.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - map [map.map](map.md#map.map)
    - operations [operations.operations](operations.md#operations.operations)
    - operation-worker [tui.operation-worker](tui.md#tui.operation-worker)
    - analysis-worker [tui.analysis-worker](tui.md#tui.analysis-worker)
    - type [Reply](../../src/tui/background.ts#L18) <!-- internal -->
      <a id="tui.background.Reply"></a><br>Message shape sent back from the background worker to the TUI, carrying a request `id` plus either a `MapResult` payload or an `error` string so the caller can match the response to its pending request. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [SnapshotWorker](../../src/tui/background.ts#L24)
      <a id="tui.background.SnapshotWorker"></a><br>Runs map generation on a lazily spawned worker thread so the terminal and web UIs stay responsive, matching replies to pending promises by id and falling back to in-process `generateMap` if the worker cannot start. Errors or a non-zero exit reject all pending requests and mark… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [constructor](../../src/tui/background.ts#L28)
        <a id="tui.background.SnapshotWorker.constructor"></a><br>Initializes a per-request registry keyed by numeric id, holding the resolve and reject callbacks of pending promises so background map results can later be matched back to their awaiting callers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [generate](../../src/tui/background.ts#L31) (config: Config, options: { overlay: ReadonlyMap<string, string> }) → Promise<MapResult>
        <a id="tui.background.SnapshotWorker.generate"></a><br>`generateMap` for `analyze({ generate })`; the fact cache is only read.
        - calls [tui.background.SnapshotWorker.start](tui.md#tui.background.SnapshotWorker.start), [map.map.generateMap](map.md#map.map.generateMap)
      - fn [close](../../src/tui/background.ts#L42) () → void
        <a id="tui.background.SnapshotWorker.close"></a><br>Terminates the background worker thread if one exists and clears the reference, without waiting for shutdown. Called during teardown by [`tui.terminal.runTerminal`](tui.md#tui.terminal.runTerminal) and [`tui.web.serveWeb`](tui.md#tui.web.serveWeb). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [start](../../src/tui/background.ts#L47) () → Worker | null <!-- internal -->
        <a id="tui.background.SnapshotWorker.start"></a><br>Lazily spawns the analysis worker thread (choosing the .ts or .js module by runtime), wiring message replies to pending promises and routing errors or non-zero exits to [`tui.background.SnapshotWorker.fail`](tui.md#tui.background.SnapshotWorker.fail). Returns the cached worker, or null if construction throws, marking the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.background.SnapshotWorker.fail](tui.md#tui.background.SnapshotWorker.fail)
      - fn [fail](../../src/tui/background.ts#L75) (error: Error) → void <!-- internal -->
        <a id="tui.background.SnapshotWorker.fail"></a><br>Marks the snapshot worker as permanently failed and drops its reference, then rejects every pending request in the waiting map with the given error and empties it. Invoked from [`tui.background.SnapshotWorker.start`](tui.md#tui.background.SnapshotWorker.start) when the worker cannot be used. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Pending](../../src/tui/background.ts#L83) <!-- internal -->
      <a id="tui.background.Pending"></a><br>Per-request bookkeeping for a worker operation in flight: the resolver, progress and pre-commit callbacks, the abort signal, and a `committing` flag marking when file writes begin and the worker may no longer be terminated. `release` detaches the abort listener once the request… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [OperationWorker](../../src/tui/background.ts#L106)
      <a id="tui.background.OperationWorker"></a><br>Runs shared operations in a worker thread. Every request settles exactly once — with the worker's result, a failure (code 2) when the worker cannot start or dies, or `cancelled` (exit code null) on abort or `close()` — and a late message for a settled request is dropped.
      - fn [constructor](../../src/tui/background.ts#L115) (options: { entry?: URL; workerData?: unknown } = {})
        <a id="tui.background.OperationWorker.constructor"></a><br>`entry` and `workerData` replace the worker module (tests); default: `operation-worker`.
      - fn [run](../../src/tui/background.ts#L123) (request: OperationRequest, context: OperationContext = {}) → Promise<OperationResult>
        <a id="tui.background.OperationWorker.run"></a><br>An `OperationRunner`: the request goes to the worker as cloneable data; progress and the signal stay here.
        - calls [operations.operations.resultWithout](operations.md#operations.operations.resultWithout), [tui.background.OperationWorker.start](tui.md#tui.background.OperationWorker.start), [tui.background.messageOf](tui.md#tui.background.messageOf), [tui.background.OperationWorker.cancel](tui.md#tui.background.OperationWorker.cancel), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle)
      - fn [close](../../src/tui/background.ts#L162) () → void
        <a id="tui.background.OperationWorker.close"></a><br>Ends the worker and refuses new work. A request before its commit settles as cancelled at once.
        - calls [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop), [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.operations.resultWithout](operations.md#operations.operations.resultWithout)
      - fn [cancel](../../src/tui/background.ts#L178) (operationId: number) → void <!-- internal -->
        <a id="tui.background.OperationWorker.cancel"></a><br>Before a commit nothing is written: cancelling terminates the worker and a new one starts with the next request. During a commit the worker is never terminated: it is asked to stop between file steps, and its result — `cancelled` with the steps it did — settles the request.
        - calls [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.operations.resultWithout](operations.md#operations.operations.resultWithout), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop)
      - fn [commit](../../src/tui/background.ts#L194) (worker: Worker, operationId: number, plan: CommitPlan | undefined) → void <!-- internal -->
        <a id="tui.background.OperationWorker.commit"></a><br>The worker asks to start writing: the session is told first (`beforeCommit`), then the worker goes ahead — or is cancelled when the signal was aborted meanwhile, with nothing written.
        - calls [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post)
      - fn [post](../../src/tui/background.ts#L214) (call: OperationCall) → void <!-- internal -->
        <a id="tui.background.OperationWorker.post"></a><br>Sends an operation message to the current worker thread if one exists, swallowing any error from a worker that cannot accept it. Serves as the shared send path for [`tui.background.OperationWorker.cancel`](tui.md#tui.background.OperationWorker.cancel), [`tui.background.OperationWorker.close`](tui.md#tui.background.OperationWorker.close), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [start](../../src/tui/background.ts#L222) () → Worker <!-- internal -->
        <a id="tui.background.OperationWorker.start"></a><br>Lazily spawns the single unref'd worker thread (reusing it if alive) and wires its messages so progress goes to the pending request's callback, commits go to [`tui.background.OperationWorker.commit`](tui.md#tui.background.OperationWorker.commit), and results or errors go to [`tui.background.OperationWorker.settle`](tui.md#tui.background.OperationWorker.settle). On worker… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.background.OperationWorker.commit](tui.md#tui.background.OperationWorker.commit), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.operations.resultWithout](operations.md#operations.operations.resultWithout), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop)
      - fn [stop](../../src/tui/background.ts#L246) (outcome: (kind: OperationRequest["kind"]) => OperationResult) → void <!-- internal -->
        <a id="tui.background.OperationWorker.stop"></a><br>Terminates the worker and settles what is still pending with `outcome`.
        - calls [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle)
      - fn [settle](../../src/tui/background.ts#L253) (operationId: number, result: OperationResult) → void <!-- internal -->
        <a id="tui.background.OperationWorker.settle"></a><br>Removes a finished operation from the pending map, releases its slot, unrefs the worker once nothing is in flight, and terminates it if [`tui.background.OperationWorker.close`](tui.md#tui.background.OperationWorker.close) already ran. Finally resolves the caller's promise with the result. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [messageOf](../../src/tui/background.ts#L269) (error: unknown) → string <!-- internal -->
      <a id="tui.background.messageOf"></a><br>Extracts a human-readable message from a caught value: the `.message` of an `Error` instance, otherwise the value coerced to a string. Used by [`tui.background.OperationWorker.run`](tui.md#tui.background.OperationWorker.run) to report failures. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [buffer](../../src/tui/buffer.ts#L1)
    <a id="tui.buffer"></a><br>What a buffer's text gives: its parsed spec, its lines, and each line cut into clusters with their widths. `setText` is the one way a session changes a buffer's text: it bumps `version`, so work that finishes later (a ghost line, speech, a draft) can tell whether the text it…
    - node [external.node](external.md#external.node)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - state [tui.state](tui.md#tui.state)
    - width [tui.width](tui.md#tui.width)
    - fn [docOf](../../src/tui/buffer.ts#L15) (path: string, text: string) → Document | null
      <a id="tui.buffer.docOf"></a><br>The parsed spec of a buffer; `keylang.json` is plain text.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [newBuffer](../../src/tui/buffer.ts#L20) (path: string, text: string, eol: Buffer["eol"], disk: string | null) → Buffer
      <a id="tui.buffer.newBuffer"></a><br>A buffer for `path` with `text` (already `\n`-ended) as both its text and what is saved.
      - calls [tui.buffer.docOf](tui.md#tui.buffer.docOf)
    - fn [newFileBuffer](../../src/tui/buffer.ts#L26) (path: string, text: string) → Buffer
      <a id="tui.buffer.newFileBuffer"></a><br>A new specification with `text` and no file on disk: unsaved until its first save, even when `text` is empty.
      - calls [tui.buffer.newBuffer](tui.md#tui.buffer.newBuffer)
    - fn [isDirty](../../src/tui/buffer.ts#L31) (buffer: Buffer) → boolean
      <a id="tui.buffer.isDirty"></a><br>Unsaved: the text differs from the disk, or there is no file yet.
    - fn [setText](../../src/tui/buffer.ts#L35) (buffer: Buffer, text: string) → void
      <a id="tui.buffer.setText"></a><br>Replaces a buffer's contents with new text, rebuilding its parsed document via [`tui.buffer.docOf`](tui.md#tui.buffer.docOf) and bumping its version counter. All TUI edit, undo, and merge-write paths go through this single mutation point. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.buffer.docOf](tui.md#tui.buffer.docOf)
    - type [Cached](../../src/tui/buffer.ts#L41) <!-- internal -->
      <a id="tui.buffer.Cached"></a><br>Holds a snapshot of buffer text split into lines together with a map from line index to its computed layout, so wrapping and rendering results can be reused until the text changes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [cached](../../src/tui/buffer.ts#L49) (buffer: Buffer) → Cached <!-- internal -->
      <a id="tui.buffer.cached"></a><br>Looks up a per-buffer cache entry and returns it unchanged when the buffer text is identical by reference; otherwise splits the text into lines, pairs them with an empty layout map, and stores the fresh entry. Serves [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines) and [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [bufferLines](../../src/tui/buffer.ts#L58) (buffer: Buffer) → readonly string[]
      <a id="tui.buffer.bufferLines"></a><br>Returns the buffer's text split into lines, taking them from the per-buffer memoized result of [`tui.buffer.cached`](tui.md#tui.buffer.cached) so repeated callers don't re-split. Used by [`tui.app.App`](tui.md#tui.app.App) cursor and navigation methods and by [`tui.view.lineCount`](tui.md#tui.view.lineCount). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.buffer.cached](tui.md#tui.buffer.cached)
    - fn [lineLayout](../../src/tui/buffer.ts#L63) (buffer: Buffer, index: number) → LineLayout
      <a id="tui.buffer.lineLayout"></a><br>The layout of line `index` (0-based); a line past the end is empty.
      - calls [tui.buffer.cached](tui.md#tui.buffer.cached), [tui.width.layoutLine](tui.md#tui.width.layoutLine)
  - module [code-highlight](../../src/tui/code-highlight.ts#L1)
    <a id="tui.code-highlight"></a><br>Lexical highlight for the built-in code viewer: comments, strings, numbers, keywords. It is a reading aid only; facts come from the snapshot.
    - screen [tui.screen](tui.md#tui.screen)
    - theme [tui.theme](tui.md#tui.theme)
    - fn [highlightCode](../../src/tui/code-highlight.ts#L23) (lines: readonly string[]) → Run[][]
      <a id="tui.code-highlight.highlightCode"></a><br>Runs per line (0-based line index). Block comments and template strings spanning lines are followed across lines.
  - module [disk](../../src/tui/disk.ts#L1)
    <a id="tui.disk"></a><br>The files a session reads and writes: text with the line endings it came with, and writes that never land outside a boundary directory — not through a symbolic link either, including one whose target does not exist yet.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [Eol](../../src/tui/disk.ts#L10) = "\n" | "\r\n"
      <a id="tui.disk.Eol"></a><br>A string literal union that restricts a line-ending value to either the LF or CRLF sequence, so file read/write code can carry the detected terminator as a typed value instead of a free string. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readText](../../src/tui/disk.ts#L12) (abs: string) → string | null
      <a id="tui.disk.readText"></a><br>Reads a file at an absolute path as UTF‑8 and returns its contents, swallowing any filesystem error (missing file, permissions, etc.) by returning null instead of throwing. It serves as the TUI's safe file-read primitive, used by [`tui.app.App.load`](tui.md#tui.app.App.load) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [lf](../../src/tui/disk.ts#L20) (text: string) → string
      <a id="tui.disk.lf"></a><br>Converts every CRLF sequence in the given string to a bare LF and returns the result. [`tui.disk.splitEol`](tui.md#tui.disk.splitEol) uses it to normalize line endings, and [`tui.merge-session.MergeSession.entry`](tui.md#tui.merge-session.MergeSession.entry) and [`tui.merge-session.MergeSession.open`](tui.md#tui.merge-session.MergeSession.open) apply it to file contents. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [splitEol](../../src/tui/disk.ts#L29) (raw: string) → { text: string; eol: Eol }
      <a id="tui.disk.splitEol"></a><br>A file's text with `\n` line ends, and the ending a save restores. Only a file that uses CRLF throughout is converted; mixed endings stay as they are, so a save does not touch lines nobody edited.
      - calls [tui.disk.lf](tui.md#tui.disk.lf)
    - fn [withEol](../../src/tui/disk.ts#L35) (text: string, eol: Eol) → string
      <a id="tui.disk.withEol"></a><br>Converts every `\n` in the text to the requested line ending, returning the input unchanged when the target is already `\n`. Used by [`tui.app.App.persist`](tui.md#tui.app.App.persist) and [`tui.merge-session.MergeSession.write`](tui.md#tui.merge-session.MergeSession.write) before writing buffers to disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [landingPath](../../src/tui/disk.ts#L44) (abs: string) → string
      <a id="tui.disk.landingPath"></a><br>Where a write to `abs` lands: every symbolic link on the way followed, the last one too when its target does not exist yet (a write would create that target). The CLI's write protocol (`safe-write.ts`) decides it the same way.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing)
    - type [WriteOptions](../../src/tui/disk.ts#L55)
      <a id="tui.disk.WriteOptions"></a><br>`link: "follow"` (a spec or source file): a symlinked file is written at its target, so the link stays. `link: "replace"` (a file of keylang's own, such as a proposal): a link there is replaced, never written through.
    - fn [destination](../../src/tui/disk.ts#L60) (abs: string, options: WriteOptions) → string <!-- internal -->
      <a id="tui.disk.destination"></a><br>The file a write to `abs` changes.
      - calls [tui.disk.landingPath](tui.md#tui.disk.landingPath)
    - fn [leavesBoundary](../../src/tui/disk.ts#L65) (boundary: string, abs: string, options: WriteOptions = {}) → string | null
      <a id="tui.disk.leavesBoundary"></a><br>Why a write to `abs` may not happen — it lands outside `boundary` — or null when it stays inside.
      - calls [map.analyze.within](map.md#map.analyze.within), [tui.disk.destination](tui.md#tui.disk.destination), [tui.disk.landingPath](tui.md#tui.disk.landingPath)
    - fn [writeInside](../../src/tui/disk.ts#L75) (boundary: string, abs: string, text: string, options: WriteOptions = {}) → void
      <a id="tui.disk.writeInside"></a><br>Writes `text` to `abs` through a temporary file and a rename, so a crash never leaves half a file; a missing directory is created. A write that would land outside `boundary` throws before anything is touched.
      - calls [tui.disk.leavesBoundary](tui.md#tui.disk.leavesBoundary), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [tui.disk.destination](tui.md#tui.disk.destination)
    - fn [removeInside](../../src/tui/disk.ts#L83) (boundary: string, abs: string, options: WriteOptions = {}) → void
      <a id="tui.disk.removeInside"></a><br>Removes the file a write to `abs` would change, when it is inside `boundary`; a missing file is no error.
      - calls [tui.disk.leavesBoundary](tui.md#tui.disk.leavesBoundary), [tui.disk.destination](tui.md#tui.disk.destination)
  - module [evidence](../../src/tui/evidence.ts#L1)
    <a id="tui.evidence"></a><br>What the gutter shows for one spec line, from the shared analysis: the separate evidence channels and one mark over them. The mark is `ok` only when every reported criterion on the line is `ok`; `ID ✓` with a missing trace is `unverified`, never a plain ✓. `planned` is its own…
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - type [Mark](../../src/tui/evidence.ts#L10) = "ok" | "fail" | "unverified" | "planned" | "warning"
      <a id="tui.evidence.Mark"></a><br>Defines the closed set of five string literals the TUI uses to label the verification status of a piece of evidence, so status values are type-checked rather than free-form strings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LineEvidence](../../src/tui/evidence.ts#L15)
      <a id="tui.evidence.LineEvidence"></a><br>Bundles everything the TUI shows for one source line: its mark, per-criterion verdicts with messages in channel order, attached diagnostics, and whether the line is flagged `planned` rather than asserting a current fact. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [worse](../../src/tui/evidence.ts#L26) (a: Mark | null, b: Mark | null) → Mark | null
      <a id="tui.evidence.worse"></a><br>Picks the more severe of two optional marks by comparing their `RANK` values, returning whichever one is present when the other is null and favoring the first on ties. Used by [`tui.evidence.allEvidence`](tui.md#tui.evidence.allEvidence) and [`tui.nav.markOver`](tui.md#tui.nav.markOver) to fold per-line evidence into a single worst mark. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [plannedLines](../../src/tui/evidence.ts#L32) (doc: Document) → Set<number> <!-- internal -->
      <a id="tui.evidence.plannedLines"></a><br>Collects the set of start line numbers for every node of kind "planned" across all sections of a document, traversing each section's top-level nodes via [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes) and [`lang.ir.walk`](lang.md#lang.ir.walk). The result feeds [`tui.evidence.allEvidence`](tui.md#tui.evidence.allEvidence) to flag planned lines. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [pendingPlanned](../../src/tui/evidence.ts#L45) (analysis: Analysis) → Set<string> <!-- internal -->
      <a id="tui.evidence.pendingPlanned"></a><br>IDs declared `planned` that the snapshot does not have yet: evidence about them is missing by intention.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [allEvidence](../../src/tui/evidence.ts#L63) (analysis: Analysis) → Map<string, Map<number, LineEvidence>> <!-- internal -->
      <a id="tui.evidence.allEvidence"></a><br>Builds a per-file, per-line index of diagnostics, criterion verdicts, and planned markers from an analysis, then derives each line's worst mark via [`tui.evidence.worse`](tui.md#tui.evidence.worse), treating unverified verdicts on areas from [`tui.evidence.pendingPlanned`](tui.md#tui.evidence.pendingPlanned) as planned. Results are cached per… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.evidence.pendingPlanned](tui.md#tui.evidence.pendingPlanned), [tui.evidence.plannedLines](tui.md#tui.evidence.plannedLines), [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [evidenceOf](../../src/tui/evidence.ts#L111) (analysis: Analysis, path: string) → Map<number, LineEvidence>
      <a id="tui.evidence.evidenceOf"></a><br>Evidence by 1-based line of one document. Lines with nothing reported are absent.
      - calls [tui.evidence.allEvidence](tui.md#tui.evidence.allEvidence)
    - fn [totals](../../src/tui/evidence.ts#L118) (analysis: Analysis) → { fail: number; unverified: number; ok: number }
      <a id="tui.evidence.totals"></a><br>Totals for the status bar: failing, unverified and passing lines across all documents.
      - calls [tui.evidence.allEvidence](tui.md#tui.evidence.allEvidence)
  - module [findings](../../src/tui/findings.ts#L1)
    <a id="tui.findings"></a><br>The full findings list of the current editor analysis, for the F6 panel: the same conversion `keylang check --format json` uses (`checkResults`), so criteria, codes, order, deduplication, file/line/col and provenance match the CLI one-to-one. The gutter stays aggregated per…
    - analyze [map.analyze](map.md#map.analyze)
    - check-results [features.check-results](features.md#features.check-results)
    - type [FindingVerdict](../../src/tui/findings.ts#L10) = CheckResult["verdict"]
      <a id="tui.findings.FindingVerdict"></a><br>Aliases the `verdict` property type of a check result so TUI findings code can name a verdict value without importing the whole result shape. It carries no runtime behaviour; it is a type-only indirection. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [VerdictFilter](../../src/tui/findings.ts#L16) = Record<FindingVerdict, boolean>
      <a id="tui.findings.VerdictFilter"></a><br>Which verdicts the findings list shows; the report itself never changes.
    - fn [findingsOf](../../src/tui/findings.ts#L35) (analysis: Analysis | null) → readonly CheckResult[]
      <a id="tui.findings.findingsOf"></a><br>The current analysis as the CLI reports it in `check --format json`.
      - calls [features.check-results.checkResults](features.md#features.check-results.checkResults)
    - fn [visibleFindings](../../src/tui/findings.ts#L45) (findings: readonly CheckResult[], filter: VerdictFilter) → CheckResult[]
      <a id="tui.findings.visibleFindings"></a><br>Returns only the check results whose verdict is enabled in the given filter map, preserving order. Used by [`tui.app.App.selectedFinding`](tui.md#tui.app.App.selectedFinding), [`tui.app.App.clampFinding`](tui.md#tui.app.App.clampFinding), and [`tui.view.drawFindings`](tui.md#tui.view.drawFindings) to drive the list the user actually sees. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [findingCounts](../../src/tui/findings.ts#L50) (findings: readonly CheckResult[]) → Record<FindingVerdict, number>
      <a id="tui.findings.findingCounts"></a><br>The full counts of the report, independent of the filter: findings, not gutter lines.
    - fn [findingRow](../../src/tui/findings.ts#L57) (result: CheckResult) → string
      <a id="tui.findings.findingRow"></a><br>The list row of one finding after its verdict glyph: code or criterion, position, message.
    - fn [sameResult](../../src/tui/findings.ts#L62) (a: CheckResult, b: CheckResult) → boolean
      <a id="tui.findings.sameResult"></a><br>Whether two findings are the same one of successive analyses: the selection follows it across a rerun.
    - fn [findingDetailText](../../src/tui/findings.ts#L67) (result: CheckResult) → string
      <a id="tui.findings.findingDetailText"></a><br>The details of the selected finding: provenance, snapshot, a K005 reason, then criterion and area.
  - module [input](../../src/tui/input.ts#L1)
    <a id="tui.input"></a><br>Terminal input as events: keys (with Ctrl/Alt/Shift), SGR mouse reports, and bracketed paste. xterm.js sends the same sequences as a terminal, so one decoder serves both. A chunk may end inside a sequence; the rest waits for the next chunk, and a lone ESC becomes the Escape key…
    - width [tui.width](tui.md#tui.width)
    - type [KeyEvent](../../src/tui/input.ts#L8)
      <a id="tui.input.KeyEvent"></a><br>Describes a single keyboard event decoded from terminal input: a key name such as `enter` or `up`, the ctrl/alt/shift modifier flags, and the typed text for printable keys, tagged with a literal `"key"` discriminant. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MouseEvent](../../src/tui/input.ts#L19)
      <a id="tui.input.MouseEvent"></a><br>Describes a terminal mouse event: the action kind (press, release, move, drag, wheel), which button, the 0-based cell coordinates, and ctrl/alt/shift modifier flags. The literal `type: "mouse"` tag lets it be distinguished from other input events in a union. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [PasteEvent](../../src/tui/input.ts#L32)
      <a id="tui.input.PasteEvent"></a><br>Describes a terminal input event carrying the full text of a bracketed paste, tagged with a literal `"paste"` discriminator so handlers can distinguish it from keypresses in a union of input events. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [InputEvent](../../src/tui/input.ts#L37) = KeyEvent | MouseEvent | PasteEvent
      <a id="tui.input.InputEvent"></a><br>Union type covering every event the terminal input layer can emit: a keypress, a mouse action, or a bracketed paste. Consumers in the `tui` layer switch on it to dispatch handling by event kind. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [key](../../src/tui/input.ts#L42) (name: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}, text?: string) → KeyEvent <!-- internal -->
      <a id="tui.input.key"></a><br>Builds a `KeyEvent` object with `type: "key"`, the given name, and `ctrl`/`alt`/`shift` flags normalized to strict booleans (true only when explicitly set). Includes a `text` field only if one was supplied; used by `InputDecoder` methods to emit decoded key events. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [modifiers](../../src/tui/input.ts#L52) (param: string | undefined) → { ctrl: boolean; alt: boolean; shift: boolean } <!-- internal -->
      <a id="tui.input.modifiers"></a><br>Decodes the xterm modifier parameter of an escape sequence into shift, alt and ctrl flags by subtracting one from the numeric value and testing its low three bits, defaulting to no modifiers. Used by [`tui.input.InputDecoder.escape`](tui.md#tui.input.InputDecoder.escape) when parsing key events. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [partialSuffix](../../src/tui/input.ts#L58) (text: string, marker: string) → number <!-- internal -->
      <a id="tui.input.partialSuffix"></a><br>Length of the longest suffix of `text` that is a proper prefix of `marker`.
    - module [InputDecoder](../../src/tui/input.ts#L63)
      <a id="tui.input.InputDecoder"></a><br>Turns raw terminal input chunks into key, mouse and paste events via [`tui.input.InputDecoder.feed`](tui.md#tui.input.InputDecoder.feed), holding back incomplete escape sequences and bracketed-paste text until more arrives. [`tui.input.InputDecoder.flush`](tui.md#tui.input.InputDecoder.flush) resolves a lone ESC or an unterminated paste after a pause. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [feed](../../src/tui/input.ts#L68) (chunk: string) → InputEvent[]
        <a id="tui.input.InputDecoder.feed"></a><br>Events of a chunk; an incomplete sequence at the end waits for the next one.
        - calls [tui.input.partialSuffix](tui.md#tui.input.partialSuffix), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [flush](../../src/tui/input.ts#L99) () → InputEvent[]
        <a id="tui.input.InputDecoder.flush"></a><br>A lone ESC left after a pause is the Escape key. A paste whose end marker never came (a terminal that dropped it) ends here, so input is not swallowed for good.
        - calls [tui.input.key](tui.md#tui.input.key)
      - fn [waiting](../../src/tui/input.ts#L116) () → boolean
        <a id="tui.input.InputDecoder.waiting"></a><br>Whether a lone ESC waits for `flush()`.
      - fn [pasting](../../src/tui/input.ts#L121) () → boolean
        <a id="tui.input.InputDecoder.pasting"></a><br>Inside a bracketed paste, waiting for its end marker.
      - fn [next](../../src/tui/input.ts#L125) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.next"></a><br>Decodes the first key from a raw terminal chunk: escape sequences go to [`tui.input.InputDecoder.escape`](tui.md#tui.input.InputDecoder.escape), control bytes map to enter/tab/backspace/ctrl keys, and plain ASCII is one byte. Non-ASCII takes the first grapheme of a 64-char head via [`tui.width.graphemes`](tui.md#tui.width.graphemes), falling back… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.input.InputDecoder.escape](tui.md#tui.input.InputDecoder.escape), [tui.input.key](tui.md#tui.input.key), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [escape](../../src/tui/input.ts#L145) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.escape"></a><br>Parses an ESC-prefixed terminal sequence, recognizing bracketed-paste start, SGR mouse reports via [`tui.input.InputDecoder.mouse`](tui.md#tui.input.InputDecoder.mouse), CSI/SS3 key codes built with [`tui.input.key`](tui.md#tui.input.key) and [`tui.input.modifiers`](tui.md#tui.input.modifiers), or a bare escape. Otherwise it treats ESC plus the following input as… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.input.InputDecoder.mouse](tui.md#tui.input.InputDecoder.mouse), [tui.input.key](tui.md#tui.input.key), [tui.input.modifiers](tui.md#tui.input.modifiers), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [mouse](../../src/tui/input.ts#L177) (code: number, x: number, y: number, press: boolean) → MouseEvent <!-- internal -->
        <a id="tui.input.InputDecoder.mouse"></a><br>Decodes an SGR mouse-report button code into a `MouseEvent`, reading shift/alt/ctrl bits and classifying it as wheel, move, drag, or press/release with 0-based coordinates. Used by [`tui.input.InputDecoder.escape`](tui.md#tui.input.InputDecoder.escape) when parsing terminal escape sequences. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [markdown](../../src/tui/markdown.ts#L1)
    <a id="tui.markdown"></a><br>Reading mode (`v`): the spec rendered as text — headings, bullets, tables, code blocks, inline code, emphasis and links — wrapped to the width. Every row keeps its source line, so the gutter marks and `Enter` on an ID still work.
    - screen [tui.screen](tui.md#tui.screen)
    - theme [tui.theme](tui.md#tui.theme)
    - width [tui.width](tui.md#tui.width)
    - type [Segment](../../src/tui/markdown.ts#L11)
      <a id="tui.markdown.Segment"></a><br>Pairs a run of plain text with the `Style` that should be applied when rendering it, so markdown-to-terminal output can be built as a flat list of styled pieces. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ReadRow](../../src/tui/markdown.ts#L16)
      <a id="tui.markdown.ReadRow"></a><br>A rendered terminal line made of styled `Segment` pieces, paired with the 1-based line number in the markdown source it came from, so the TUI can map screen rows back to the original document. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [inline](../../src/tui/markdown.ts#L24) (written: string, base: Style) → Segment[]
      <a id="tui.markdown.inline"></a><br>Strips empty HTML anchors and `<br>` tags, decodes `&lt;`/`&gt;`/`&amp;`, then splits one line of markdown into styled `Segment`s via the `INLINE` regex: inline code gets fg 180, `**bold**`, `*italic*`, and links take `THEME.link` plus a clickable target when the URL is… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [wrap](../../src/tui/markdown.ts#L44) (segments: Segment[], width: number, hang: number, source: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.wrap"></a><br>Word-wraps segments to `width` cells; continuation rows start with `hang` spaces.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [tableRows](../../src/tui/markdown.ts#L65) (block: { text: string; line: number }[], width: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.tableRows"></a><br>Splits pipe-delimited markdown lines into cells, measures column widths via [`tui.width.stringWidth`](tui.md#tui.width.stringWidth), and caps each column to a per-width budget. Emits styled rows with box-drawing separators, a bold header, and ellipsis-truncated cells for [`tui.markdown.renderMarkdown`](tui.md#tui.markdown.renderMarkdown). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [renderMarkdown](../../src/tui/markdown.ts#L85) (text: string, width: number) → ReadRow[]
      <a id="tui.markdown.renderMarkdown"></a><br>Splits markdown text into lines and emits styled, width-wrapped rows for fenced code, pipe tables (via [`tui.markdown.tableRows`](tui.md#tui.markdown.tableRows)), headings, bullet items, blanks and prose, skipping HTML comments. Each row keeps its source line number; [`tui.markdown.inline`](tui.md#tui.markdown.inline) styles spans and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.markdown.tableRows](tui.md#tui.markdown.tableRows), [tui.markdown.wrap](tui.md#tui.markdown.wrap), [tui.markdown.inline](tui.md#tui.markdown.inline)
  - module [merge-session](../../src/tui/merge-session.ts#L1)
    <a id="tui.merge-session"></a><br>MERGE in a session: a proposal (`.keylang/proposals/<path>`, a spec or a source file) or a `Ctrl+G` result, compared with the file hunk by hunk and applied on `w`. A proposal has an identity — its text when `m` opened it — so a proposal an agent rewrote during the merge, or…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - proposals [features.proposals](features.md#features.proposals)
    - span [base.span](base.md#base.span)
    - stats [features.stats](features.md#features.stats)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - disk [tui.disk](tui.md#tui.disk)
    - input [tui.input](tui.md#tui.input)
    - merge [tui.merge](tui.md#tui.merge)
    - state [tui.state](tui.md#tui.state)
    - type [MergeHost](../../src/tui/merge-session.ts#L24)
      <a id="tui.merge-session.MergeHost"></a><br>What MERGE needs from the session around it.
    - type [ProposalEntry](../../src/tui/merge-session.ts#L39)
      <a id="tui.merge-session.ProposalEntry"></a><br>One pending target of the proposals list: its kind, how many hunks it has against the file on disk, and why it cannot be merged now (null: it can). Built from disk each time the list opens or Enter is pressed; building it writes nothing.
    - module [MergeSession](../../src/tui/merge-session.ts#L52)
      <a id="tui.merge-session.MergeSession"></a><br>Lists the files under `.keylang/proposals/`, checks each against the spec-directory and code limits via `problem`, and opens a chosen one as a hunk-by-hunk merge against the file on disk. Handles the merge keys, writes accepted hunks to disk or the buffer, drops the matching… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [constructor](../../src/tui/merge-session.ts#L55) (host: MergeHost)
        <a id="tui.merge-session.MergeSession.constructor"></a><br>Stores the given host object on the instance as the sole setup step, with no validation or other work performed. The session relies on that stored host for all subsequent interaction. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [state](../../src/tui/merge-session.ts#L59) () → State <!-- internal -->
        <a id="tui.merge-session.MergeSession.state"></a><br>Returns the current `State` object held by the host, so the merge session reads shared state without owning a copy. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [scan](../../src/tui/merge-session.ts#L66) () → string[]
        <a id="tui.merge-session.MergeSession.scan"></a><br>Proposals that may be merged; the rest are listed with the reason they are ignored.
        - calls [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem)
      - fn [files](../../src/tui/merge-session.ts#L70) () → string[] <!-- internal -->
        <a id="tui.merge-session.MergeSession.files"></a><br>Lists every regular file under the session root's proposals directory, recursively, as sorted POSIX-style paths relative to that directory via [`base.config.toPosix`](base.md#base.config.toPosix). Returns an empty list when the directory is missing or unreadable. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [entries](../../src/tui/merge-session.ts#L89) () → ProposalEntry[]
        <a id="tui.merge-session.MergeSession.entries"></a><br>Every file under `.keylang/proposals/`, sorted by POSIX path, with its kind, hunk count and the reason it cannot be merged. A link in the store is listed but never followed: a proposal is a plain file.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.proposalKind](tui.md#tui.merge-session.proposalKind), [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.entry](tui.md#tui.merge-session.MergeSession.entry), [base.span.compareText](base.md#base.span.compareText)
      - fn [entry](../../src/tui/merge-session.ts#L105) (path: string) → ProposalEntry <!-- internal -->
        <a id="tui.merge-session.MergeSession.entry"></a><br>The list entry of the proposal file `path`: read fresh, compared with the file on disk.
        - calls [tui.merge-session.proposalKind](tui.md#tui.merge-session.proposalKind), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge.diffLines](tui.md#tui.merge.diffLines), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.lf](tui.md#tui.disk.lf), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [specDir](../../src/tui/merge-session.ts#L120) () → string
        <a id="tui.merge-session.MergeSession.specDir"></a><br>The spec directory relative to the root, POSIX (`keylang`).
        - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [problem](../../src/tui/merge-session.ts#L136) (path: string) → string | null
        <a id="tui.merge-session.MergeSession.problem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A Markdown proposal replaces one hand-written spec: a file under the spec directory, not a generated map file, and not reached through a link that leads out.
        - calls [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [boundary](../../src/tui/merge-session.ts#L146) (code: boolean) → string <!-- internal -->
        <a id="tui.merge-session.MergeSession.boundary"></a><br>The directory a merge of `path` may write in: the spec directory for a spec, the repository for code.
        - calls [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir)
      - fn [proposalAbs](../../src/tui/merge-session.ts#L150) (path: string) → string <!-- internal -->
        <a id="tui.merge-session.MergeSession.proposalAbs"></a><br>Joins the session's root directory, the proposals directory constant, and a relative path into one absolute filesystem path. Used by [`tui.merge-session.MergeSession.open`](tui.md#tui.merge-session.MergeSession.open), [`tui.merge-session.MergeSession.write`](tui.md#tui.merge-session.MergeSession.write), [`tui.merge-session.MergeSession.entry`](tui.md#tui.merge-session.MergeSession.entry), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [open](../../src/tui/merge-session.ts#L161) (wanted?: string) → void
        <a id="tui.merge-session.MergeSession.open"></a><br>Opens the proposal of `wanted`, else of the current file, else the first one, as a MERGE diff against the file on disk. Proposals that break the format's limits are ignored with the reason.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.lf](tui.md#tui.disk.lf), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [start](../../src/tui/merge-session.ts#L203) (path: string, origin: MergeState["origin"], base: string[], proposed: string[], disk: string | null, proposal: string | null) → void
        <a id="tui.merge-session.MergeSession.start"></a><br>A merge of `proposed` into `base`; `proposal` is the proposal file's text (null for `Ctrl+G`).
        - calls [tui.merge.diffLines](tui.md#tui.merge.diffLines), [tui.merge-session.MergeSession.dropProposal](tui.md#tui.merge-session.MergeSession.dropProposal), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
      - fn [dropProposal](../../src/tui/merge-session.ts#L220) (path: string, text: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.dropProposal"></a><br>Removes the proposal of `path` while it is still `text`.
        - calls [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.removeInside](tui.md#tui.disk.removeInside)
      - fn [key](../../src/tui/merge-session.ts#L231) (event: KeyEvent) → void
        <a id="tui.merge-session.MergeSession.key"></a><br>Dispatches keystrokes on the active merge: `a`/`r` record a decision and jump to the next pending hunk, `u` undoes via history, navigation keys refocus and scroll the view. `w` hands off to [`tui.merge-session.MergeSession.write`](tui.md#tui.merge-session.MergeSession.write), while escape/`q` call… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.merge-session.MergeSession.write](tui.md#tui.merge-session.MergeSession.write), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave)
      - fn [leave](../../src/tui/merge-session.ts#L286) (merge: MergeState, message: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.leave"></a><br>Ends the active merge by clearing `MergeState` from the session state, refreshing the proposal list via [`tui.merge-session.MergeSession.scan`](tui.md#tui.merge-session.MergeSession.scan), and restoring the mode the merge was entered from. It then sets the given status message and asks the host to clamp the cursor to the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
      - fn [write](../../src/tui/merge-session.ts#L305) () → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.write"></a><br>Applies the decided hunks. A proposal file is the external change being confirmed, so the result goes to disk.
        - calls [tui.merge-session.MergeSession.writeBuffer](tui.md#tui.merge-session.MergeSession.writeBuffer), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [features.stats.statusesIn](features.md#features.stats.statusesIn)
      - fn [writeBuffer](../../src/tui/merge-session.ts#L374) (merge: MergeState) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.writeBuffer"></a><br>`Ctrl+G`: the accepted hunks go into the buffer, which `Ctrl+S` saves.
        - calls [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.buffer.setText](tui.md#tui.buffer.setText)
      - fn [undo](../../src/tui/merge-session.ts#L393) () → void
        <a id="tui.merge-session.MergeSession.undo"></a><br>`u` in the view: undoes the last merge while the file still holds its result, on disk too, and brings back the proposal as it was — unless a newer proposal was written since, which is kept.
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
    - fn [proposalKind](../../src/tui/merge-session.ts#L433) (path: string) → ProposalEntry["kind"] <!-- internal -->
      <a id="tui.merge-session.proposalKind"></a><br>A Markdown proposal replaces a spec; any other replaces a source file (or a test).
    - fn [errorText](../../src/tui/merge-session.ts#L437) (error: unknown) → string
      <a id="tui.merge-session.errorText"></a><br>Converts any thrown value into a display string, taking `message` from `Error` instances and stringifying everything else. Callers across [`tui.app`](tui.md#tui.app) and [`tui.assist`](tui.md#tui.assist) use it to turn caught failures into user-facing notes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [merge](../../src/tui/merge.ts#L1)
    <a id="tui.merge"></a><br>Line diff of a document and a proposed version, as hunks a person accepts or rejects one by one. The result keeps the base lines of every hunk that is not accepted, so nothing reaches the file without an explicit `a`.
    - type [Hunk](../../src/tui/merge.ts#L5)
      <a id="tui.merge.Hunk"></a><br>Describes one replacement block in a merge proposal: a zero-based start line and count of base lines to replace, plus the replacement lines. Used as the unit of change when applying or displaying merges in the TUI. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Decision](../../src/tui/merge.ts#L13) = "pending" | "accepted" | "rejected"
      <a id="tui.merge.Decision"></a><br>A string union with three literal values representing the review state of a single merge item: not yet decided, approved, or declined. Other code in `src/tui/merge.ts` tracks per-item state with it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [diffLines](../../src/tui/merge.ts#L16) (base: readonly string[], proposed: readonly string[]) → Hunk[]
      <a id="tui.merge.diffLines"></a><br>Longest-common-subsequence diff; specs are small enough for the quadratic table.
    - fn [applyHunks](../../src/tui/merge.ts#L64) (base: readonly string[], hunks: readonly Hunk[], decisions: readonly Decision[]) → string[]
      <a id="tui.merge.applyHunks"></a><br>The base with the accepted hunks applied; pending and rejected hunks keep the base lines.
    - type [MergeRow](../../src/tui/merge.ts#L78)
      <a id="tui.merge.MergeRow"></a><br>One row of the merge view: context, a removed base line, or an added line of hunk `hunk`.
    - fn [mergeRows](../../src/tui/merge.ts#L86) (base: readonly string[], hunks: readonly Hunk[]) → MergeRow[]
      <a id="tui.merge.mergeRows"></a><br>Walks the base lines in order and interleaves each `Hunk`'s removed range and added lines into a flat list of tagged rows, keeping untouched lines as "same" with their base line numbers. Rows carry the hunk index they belong to, which [`tui.view.drawMerge`](tui.md#tui.view.drawMerge) uses to render the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [nav](../../src/tui/nav.ts#L1)
    <a id="tui.nav"></a><br>The navigation panel: layers → modules → members from the snapshot, then flows and rules from the specs with their worst mark. Items point at the spec line that declares them and, for code entities, at the code.
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - type [Place](../../src/tui/nav.ts#L11)
      <a id="tui.nav.Place"></a><br>Describes a location in a source file as a file path paired with a 1-based line number, used by the terminal UI as the shape for jump and navigation targets. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [NavItem](../../src/tui/nav.ts#L17)
      <a id="tui.nav.NavItem"></a><br>Describes one row in the TUI's navigation tree: its indentation depth, display label, which kind of architecture entity it stands for, and optional links to its spec location and code location via `Place` plus a `Mark`. The `parent`/`expanded` flags record whether the row has… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Tree](../../src/tui/nav.ts#L31) <!-- internal -->
      <a id="tui.nav.Tree"></a><br>Holds the navigable shape of the architecture for the TUI: an ordered list of layers, a map from each module id (or layer name) to its direct child ids, and the flow and rule entries as [`tui.nav.NavItem`](tui.md#tui.nav.NavItem) lists. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [markOver](../../src/tui/nav.ts#L41) (evidence: Map<number, LineEvidence>, from: number, to: number) → Mark | null <!-- internal -->
      <a id="tui.nav.markOver"></a><br>Folds the marks of all evidence entries whose line falls within the inclusive range into a single worst-case mark via [`tui.evidence.worse`](tui.md#tui.evidence.worse), returning null when no entry is in range. Used by [`tui.nav.treeOf`](tui.md#tui.nav.treeOf) to label tree nodes spanning a line range. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [lastLine](../../src/tui/nav.ts#L47) (node: Node) → number <!-- internal -->
      <a id="tui.nav.lastLine"></a><br>Computes the furthest start line reached by a node or any of its descendants, traversing the subtree via [`lang.ir.walk`](lang.md#lang.ir.walk) and keeping the maximum. [`tui.nav.treeOf`](tui.md#tui.nav.treeOf) uses the result to know where each entry's span ends. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [heading](../../src/tui/nav.ts#L55) (key: string, label: string) → NavItem <!-- internal -->
      <a id="tui.nav.heading"></a><br>Builds a top-level section header entry for the navigation list, with depth zero, no linked id/spec/code, and marked expanded. Used by [`tui.nav.navItems`](tui.md#tui.nav.navItems) to separate groups of items. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [treeOf](../../src/tui/nav.ts#L59) (analysis: Analysis) → Tree <!-- internal -->
      <a id="tui.nav.treeOf"></a><br>Builds and caches a navigation tree from an analysis: parents module, fn, and type snapshot nodes under their enclosing module or layer, and collects flow and rules items from hand-written docs with marks via [`tui.nav.markOver`](tui.md#tui.nav.markOver). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.nav.markOver](tui.md#tui.nav.markOver), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [tui.nav.lastLine](tui.md#tui.nav.lastLine)
    - fn [navItems](../../src/tui/nav.ts#L102) (analysis: Analysis | null, expanded: ReadonlySet<string>) → NavItem[]
      <a id="tui.nav.navItems"></a><br>Visible items for the expanded keys. Layers start expanded unless `-<key>` collapses them.
      - calls [tui.nav.treeOf](tui.md#tui.nav.treeOf), [tui.nav.heading](tui.md#tui.nav.heading)
  - module [new-spec](../../src/tui/new-spec.ts#L1)
    <a id="tui.new-spec"></a><br>A new hand-written specification (design §2.8): its kinds, the default path and the first text of each, and where a new file may go. The rules are the proposal rules (a Markdown file under the spec directory, no generated map, no link out of it), plus the explained map and the…
    - node [external.node](external.md#external.node)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - proposals [features.proposals](features.md#features.proposals)
    - state [tui.state](tui.md#tui.state)
    - fn [defaultSpecPath](../../src/tui/new-spec.ts#L26) (kind: SpecKind, specDir: string) → string
      <a id="tui.new-spec.defaultSpecPath"></a><br>The path the form starts with: under the spec directory (`specDir`, relative and POSIX; "" is the root).
    - fn [suggestedFlowName](../../src/tui/new-spec.ts#L43) (path: string) → string
      <a id="tui.new-spec.suggestedFlowName"></a><br>The flow name a path suggests: its file name without `.md`, when that is a valid name; else "".
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [flowNameProblem](../../src/tui/new-spec.ts#L49) (name: string) → string | null
      <a id="tui.new-spec.flowNameProblem"></a><br>Why `name` cannot be a flow name, or null. The heading grammar takes one segment (format §Appendix A).
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [specTemplate](../../src/tui/new-spec.ts#L58) (kind: SpecKind, name: string) → string
      <a id="tui.new-spec.specTemplate"></a><br>The first text of a new file: only the heading its kind needs, no invented IDs or planned nodes. `name` is the flow name (flow) or the title (feature).
    - fn [newSpecProblem](../../src/tui/new-spec.ts#L79) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="tui.new-spec.newSpecProblem"></a><br>Why `path` (relative to `root`, POSIX) cannot hold a new or opened specification, or null. `specDir` is relative to the root and POSIX; `generated` says whether the analysis knows the path as a generated document. An existing file is no problem here: the form opens it.
      - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [base.safe-write.landing](base.md#base.safe-write.landing)
  - module [operation-worker](../../src/tui/operation-worker.ts#L1)
    <a id="tui.operation-worker"></a><br>Worker entry of `OperationWorker`: runs shared operations off the UI thread. Requests and replies are plain cloneable data; the callbacks and the AbortSignal stay on the session's side.
    - node [external.node](external.md#external.node)
    - operations [operations.operations](operations.md#operations.operations)
    - type [OperationCall](../../src/tui/operation-worker.ts#L14)
      <a id="tui.operation-worker.OperationCall"></a><br>A message to the worker: run a request, let its commit go ahead, or cancel it.
    - type [OperationReply](../../src/tui/operation-worker.ts#L17)
      <a id="tui.operation-worker.OperationReply"></a><br>A reply of the worker: any number of progress notes, at most one commit request, then one result or one error.
    - fn [post](../../src/tui/operation-worker.ts#L23) (reply: OperationReply) → void <!-- internal -->
      <a id="tui.operation-worker.post"></a><br>Sends an operation result message from the worker thread back to the parent thread via `parentPort`, silently doing nothing if no parent port exists (e.g. when not running as a worker). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [screen](../../src/tui/screen.ts#L1)
    <a id="tui.screen"></a><br>A frame of the terminal as a grid of cells, and the ANSI that turns one frame into the next. Views draw into a `Grid`; only changed rows are sent, so the same output works on a real terminal and on xterm.js in a browser.
    - width [tui.width](tui.md#tui.width)
    - type [Color](../../src/tui/screen.ts#L9) = number
      <a id="tui.screen.Color"></a><br>256-colour palette index.
    - type [Style](../../src/tui/screen.ts#L11)
      <a id="tui.screen.Style"></a><br>Describes how a terminal cell or text run should be rendered: optional foreground/background colors, boolean attributes like bold, dim, italic, underline, and inverse, plus an optional OSC 8 hyperlink target. All fields are optional, so an empty object means plain unstyled text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Cell](../../src/tui/screen.ts#L23) <!-- internal -->
      <a id="tui.screen.Cell"></a><br>One grid position in the terminal screen buffer: a single grapheme string paired with a `Style`. The grapheme is left empty for the trailing half of a double-width character. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [Grid](../../src/tui/screen.ts#L31)
      <a id="tui.screen.Grid"></a><br>An in-memory character matrix of styled cells, sized at least 1×1, that panels draw into via [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write), [`tui.screen.Grid.fill`](tui.md#tui.screen.Grid.fill), and [`tui.screen.Grid.restyle`](tui.md#tui.screen.Grid.restyle), with wide-glyph halves cleared on overwrite. Rows are read back by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) through… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [constructor](../../src/tui/screen.ts#L38) (cols: number, rows: number)
        <a id="tui.screen.Grid.constructor"></a><br>Clamps the requested width and height to at least 1 and allocates a rows-by-cols matrix of cells, each initialized to a space character with the `PLAIN` style. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [write](../../src/tui/screen.ts#L45) (x: number, y: number, text: string, style: Style = PLAIN, limit = this.cols - x) → number
        <a id="tui.screen.Grid.write"></a><br>Writes `text` from (x, y), clipped to `limit` cells; returns the cells used.
        - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [fill](../../src/tui/screen.ts#L66) (x: number, y: number, width: number, height: number, style: Style = PLAIN) → void
        <a id="tui.screen.Grid.fill"></a><br>Overwrites every cell in a rectangle, clipped to the grid bounds, with a space in the given style, first calling [`tui.screen.Grid.clearWide`](tui.md#tui.screen.Grid.clearWide) so partially covered wide characters are removed. Used by the [`tui.view`](tui.md#tui.view) draw functions to clear panel backgrounds before rendering… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [restyle](../../src/tui/screen.ts#L76) (x: number, y: number, width: number, patch: Style) → void
        <a id="tui.screen.Grid.restyle"></a><br>Restyles cells without changing their text (selection, highlight).
      - fn [clearWide](../../src/tui/screen.ts#L85) (col: number, row: number) → void <!-- internal -->
        <a id="tui.screen.Grid.clearWide"></a><br>A wide character split by an overwrite leaves no half behind.
      - fn [lines](../../src/tui/screen.ts#L92) () → string[]
        <a id="tui.screen.Grid.lines"></a><br>Plain text of each row, trailing spaces kept.
      - fn [styleAt](../../src/tui/screen.ts#L97) (x: number, y: number) → Style
        <a id="tui.screen.Grid.styleAt"></a><br>The style of one cell (tests check colours and emphasis this way).
      - fn [row](../../src/tui/screen.ts#L101) (y: number) → readonly Cell[]
        <a id="tui.screen.Grid.row"></a><br>Returns the array of cells stored at line index `y` of the grid, or an empty array when that line doesn't exist, so [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) can compare rows without bounds checks. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [sgr](../../src/tui/screen.ts#L108) (style: Style) → string <!-- internal -->
      <a id="tui.screen.sgr"></a><br>Builds an ANSI SGR escape sequence from a style record, always starting with a reset code and appending bold, dim, italic, underline, inverse, and 256-color foreground/background codes when set. Used by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) to emit terminal styling for changed cells. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [safeLink](../../src/tui/screen.ts#L125) (link: string | undefined) → string | undefined
      <a id="tui.screen.safeLink"></a><br>An OSC 8 target that is safe to send: a control character (ESC, BEL, C1) would end the sequence early and let the rest of a URL from a spec reach the terminal as its own escape sequence. Such a link is dropped.
    - fn [sameStyle](../../src/tui/screen.ts#L130) (a: Style, b: Style) → boolean <!-- internal -->
      <a id="tui.screen.sameStyle"></a><br>Compares two cell styles field by field — colors, link, and the boolean attributes coerced so missing and false match — so [`tui.screen.rowEqual`](tui.md#tui.screen.rowEqual) and [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) can skip unchanged cells. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [rowEqual](../../src/tui/screen.ts#L134) (a: readonly Cell[], b: readonly Cell[]) → boolean <!-- internal -->
      <a id="tui.screen.rowEqual"></a><br>Compares two rows of cells, returning false if lengths differ or any position has a different character or a style that [`tui.screen.sameStyle`](tui.md#tui.screen.sameStyle) rejects. Used by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) to skip unchanged rows when emitting terminal output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.screen.sameStyle](tui.md#tui.screen.sameStyle)
    - fn [renderDiff](../../src/tui/screen.ts#L141) (prev: Grid | null, next: Grid) → string
      <a id="tui.screen.renderDiff"></a><br>ANSI that turns `prev` into `next` on screen; a full repaint when there is no `prev` or the size changed.
      - calls [tui.screen.Grid.row](tui.md#tui.screen.Grid.row), [tui.screen.rowEqual](tui.md#tui.screen.rowEqual), [tui.screen.sameStyle](tui.md#tui.screen.sameStyle), [tui.screen.safeLink](tui.md#tui.screen.safeLink), [tui.screen.sgr](tui.md#tui.screen.sgr)
  - module [state](../../src/tui/state.ts#L1)
    <a id="tui.state"></a><br>The state of one TUI session. The same state drives the terminal and the browser: a transport only feeds input and shows the frames `view.ts` draws.
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - explanations [map.explanations](map.md#map.explanations)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - ir [lang.ir](lang.md#lang.ir)
    - operations [operations.operations](operations.md#operations.operations)
    - findings [tui.findings](tui.md#tui.findings)
    - merge [tui.merge](tui.md#tui.merge)
    - type [Mode](../../src/tui/state.ts#L13) = "view" | "edit" | "read" | "code" | "merge"
      <a id="tui.state.Mode"></a><br>A string union of the five interaction modes the terminal UI can be in; it is held in the TUI state and switches which key bindings and views are active. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Focus](../../src/tui/state.ts#L14) = "editor" | "nav" | "files" | "context" | "results"
      <a id="tui.state.Focus"></a><br>A string-literal union naming the five panes that can hold keyboard focus in the TUI: editor, nav, files, context, and results, so the state can track which one receives input. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Cursor](../../src/tui/state.ts#L16)
      <a id="tui.state.Cursor"></a><br>Holds a text position as a 0-based line index and a 0-based column counted in Unicode code points rather than UTF-16 units. Used by the TUI layer to track where editing or selection is happening. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Buffer](../../src/tui/state.ts#L23)
      <a id="tui.state.Buffer"></a><br>Holds one open file in the editor: its current text alongside the saved and on-disk copies to detect unsaved or externally changed state, plus line-ending, read-only and new-file flags. Also carries the parsed `Document`, an undo stack of text-and-cursor snapshots, and a… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Hover](../../src/tui/state.ts#L49)
      <a id="tui.state.Hover"></a><br>Describes a hover popup in the TUI: the screen cell it is anchored at, its typed lines (title, text, code, evidence, or rule), and whether it was triggered by the mouse or by pressing `K` at the cursor. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CodeView](../../src/tui/state.ts#L58)
      <a id="tui.state.CodeView"></a><br>Holds the data a code pane renders for a single node location: the file path, its 1-based target line, the loaded text lines, the current scroll offset, and a `vscode://file/…:line` URL emitted as an OSC 8 hyperlink. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MergeState](../../src/tui/state.ts#L68)
      <a id="tui.state.MergeState"></a><br>Holds everything an in-progress hunk-by-hunk merge needs: target path and origin, the mode to return to, base lines, the on-disk and proposal snapshots used to detect concurrent edits at `w`, plus hunks, decisions, undo history, and cursor/scroll position. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LastMerge](../../src/tui/state.ts#L93)
      <a id="tui.state.LastMerge"></a><br>Snapshot of the buffer, on-disk, and proposal-file text from before and after a merge so an `u` undo can revert it only when each target still matches its post-merge contents; a `code` flag marks source files checked on disk alone. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Prompt](../../src/tui/state.ts#L110)
      <a id="tui.state.Prompt"></a><br>Holds the state of the TUI's active input prompt: which command it belongs to (`kind`), the typed `text`, the matching `items` with their `ids` and `notes`, and the selected `index`. Optional per-kind sub-forms (`form`, `checkOptions`, `draft`, `exportForm`, etc.) carry the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExplainPlanForm](../../src/tui/state.ts#L177)
      <a id="tui.state.ExplainPlanForm"></a><br>The inventory form: the stale and gone saved explanations, or the plan of a brief batch (`missing` also plans stale briefs) with its estimate. The limit and the jobs are kept as typed and checked as the CLI checks them.
    - type [SpecCodeForm](../../src/tui/state.ts#L184)
      <a id="tui.state.SpecCodeForm"></a><br>The fields of `spec-to-code <id> [--into] [--mode]`, and whether it proposes or only previews.
    - type [CodeDraftForm](../../src/tui/state.ts#L200)
      <a id="tui.state.CodeDraftForm"></a><br>The fields of `code-to-spec <path[:line]> | --since <ref> [--into] [--mode]` and whether it proposes or only previews. `source` picks the fields the request takes: the other source's fields stay as typed but are never sent.
    - type [RulesDraftForm](../../src/tui/state.ts#L215)
      <a id="tui.state.RulesDraftForm"></a><br>The fields of `draft rules [--into] [--mode]` and whether it proposes or only previews.
    - type [DraftForm](../../src/tui/state.ts#L223)
      <a id="tui.state.DraftForm"></a><br>The fields of `draft flow <trigger> [--name] [--into] [--mode]` and whether it proposes or only previews.
    - type [ExportForm](../../src/tui/state.ts#L237)
      <a id="tui.state.ExportForm"></a><br>The export form of one finished report. `expect` is the target as the form last showed it (null: absent); Save sends it, so a file changed after that is a conflict, never overwritten. `problem` is why Save is refused now.
    - type [SpecKind](../../src/tui/state.ts#L251) = "flow" | "rules" | "wiring" | "feature" | "blank"
      <a id="tui.state.SpecKind"></a><br>The kinds of a new specification: its first text follows the kind (design §2.8).
    - type [NewSpecForm](../../src/tui/state.ts#L253)
      <a id="tui.state.NewSpecForm"></a><br>Holds the in-progress state of the dialog that creates a new spec: which of the three steps is active, the chosen `SpecKind`, and the relative path once the path step is done (empty until then). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OperationRecord](../../src/tui/state.ts#L262)
      <a id="tui.state.OperationRecord"></a><br>A run of one explicit operation in this session, kept in memory for F6 (design §2.6).
    - type [QuitStep](../../src/tui/state.ts#L292)
      <a id="tui.state.QuitStep"></a><br>`q` or Ctrl+C while an explicit operation runs (design §5): Stay, or Cancel and exit. `waiting`: Cancel and exit was chosen and the operation is finishing its current file step; once it settles, the usual question about unsaved buffers is asked again — the cancel is no leave to…
    - type [SaveBarrier](../../src/tui/state.ts#L305)
      <a id="tui.state.SaveBarrier"></a><br>The step before an operation that reads the disk (design §2.5): the dirty spec and config buffers it would not see, and what it would write. Save and continue writes them in order and starts the operation only when every write succeeded; Back writes nothing. `error` names the…
    - type [ConfigState](../../src/tui/state.ts#L326)
      <a id="tui.state.ConfigState"></a><br>How the session found `keylang.json` on disk. The analysis always reads the saved file; an unsaved config buffer never takes effect.
    - type [Place](../../src/tui/state.ts#L333)
      <a id="tui.state.Place"></a><br>Snapshot of a navigable location: a file path plus the cursor position and editing mode active there, so the TUI can record and return to a spot in a file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [State](../../src/tui/state.ts#L339)
      <a id="tui.state.State"></a><br>Holds the whole terminal UI's mutable state in one object: open files and buffers, cursor and scroll positions, mode and focus, side panels, the current analysis and its staleness flags, completion and ghost suggestions, merge and prompt steps, operation records, and the F6… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [terminal](../../src/tui/terminal.ts#L1)
    <a id="tui.terminal"></a><br>`keylang` in a terminal: raw stdin, the alternate screen, SGR mouse, and `$VISUAL` / `$EDITOR` for jumps into code. The screen is restored on every exit path, including a crash, and `runTerminal` then returns a contract exit code to `main` (0 for a quit or a signal, 2 for a…
    - node [external.node](external.md#external.node)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - analyze [map.analyze](map.md#map.analyze)
    - screen [tui.screen](tui.md#tui.screen)
    - fn [editorCommand](../../src/tui/terminal.ts#L18) (env: NodeJS.ProcessEnv, file: string, line: number) → { command: string; args: string[]; wait: boolean } | null
      <a id="tui.terminal.editorCommand"></a><br>How to open `file` at `line` with the configured editor, or null without one.
      - calls [tui.terminal.splitCommand](tui.md#tui.terminal.splitCommand)
    - fn [splitCommand](../../src/tui/terminal.ts#L35) (value: string, exists: (path: string) => boolean = existsSync) → string[]
      <a id="tui.terminal.splitCommand"></a><br>Words of a `$EDITOR` value the way a shell splits them: quotes and backslashes keep spaces (`"/opt/My Editor/bin/edit" -w`). An unquoted value that names an existing file is one word, so a path with spaces works as is.
    - type [TerminalInput](../../src/tui/terminal.ts#L60)
      <a id="tui.terminal.TerminalInput"></a><br>The terminal's input: a TTY in raw mode, or a stand-in in a test.
    - type [TerminalOutput](../../src/tui/terminal.ts#L70)
      <a id="tui.terminal.TerminalOutput"></a><br>Abstract sink for terminal rendering: exposes optional column/row dimensions, a method to write text, and subscription/unsubscription for resize events. It lets the TUI target a real stdout or a test double interchangeably. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TerminalSignal](../../src/tui/terminal.ts#L78)
      <a id="tui.terminal.TerminalSignal"></a><br>A string-literal union naming the six POSIX signals the terminal layer handles: termination, hangup, interrupt, quit, stop, and continue. It constrains signal-handler registration and cleanup code to those exact names. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TerminalHost](../../src/tui/terminal.ts#L81)
      <a id="tui.terminal.TerminalHost"></a><br>What the terminal session needs from its process; `processHost()` is the real one.
    - fn [processHost](../../src/tui/terminal.ts#L94) () → TerminalHost
      <a id="tui.terminal.processHost"></a><br>Builds the real-process adapter that [`tui.terminal.runTerminal`](tui.md#tui.terminal.runTerminal) uses by default, exposing stdin/stdout/stderr/env plus `suspend` via SIGSTOP. Its `listen` registers signal, uncaughtException and unhandledRejection handlers and returns a function that removes them. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [runTerminal](../../src/tui/terminal.ts#L115) (root: string, host: TerminalHost = processHost(), session: Pick<AppOptions, "operations" | "operationWorker"> = {}) → Promise<number>
      <a id="tui.terminal.runTerminal"></a><br>`session`: the operation runner or worker the session uses instead of its own (tests hold an operation with it).
      - calls [tui.terminal.processHost](tui.md#tui.terminal.processHost), [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [tui.app.App](tui.md#tui.app.App), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.input](tui.md#tui.app.App.input), [tui.app.App.resize](tui.md#tui.app.App.resize), [tui.app.App.detach](tui.md#tui.app.App.detach), [tui.terminal.editorCommand](tui.md#tui.terminal.editorCommand), [tui.app.App.attach](tui.md#tui.app.App.attach), [tui.app.App.close](tui.md#tui.app.App.close), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
  - module [text-to-spec](../../src/tui/text-to-spec.ts#L1)
    <a id="tui.text-to-spec"></a><br>`Ctrl+G`: free text → keylang items, deterministically (no LLM). Clauses that start with `when`/`if` become `when` (with a nested `then` for the `then` part), `emits x` becomes `emits`, an `invariant: …` becomes `invariant`, and a clause that names a known ID — or the last…
    - fn [clauses](../../src/tui/text-to-spec.ts#L17) (text: string) → string[] <!-- internal -->
      <a id="tui.text-to-spec.clauses"></a><br>Sentences of the text. A line break inside a paragraph is a wrapped line, not a clause boundary; a blank line is.
    - fn [idIn](../../src/tui/text-to-spec.ts#L26) (clause: string, known: readonly string[], callables: readonly string[]) → string | null <!-- internal -->
      <a id="tui.text-to-spec.idIn"></a><br>A known ID named in a clause: a dotted ID, else a word that is the last segment of exactly one callable.
    - fn [textToSpec](../../src/tui/text-to-spec.ts#L41) (text: string, indent: number, known: readonly string[], callables: readonly string[]) → string[]
      <a id="tui.text-to-spec.textToSpec"></a><br>Items for the text, indented under `indent` spaces. `known` are IDs of the snapshot and `planned` declarations; `callables` the functions among them.
      - calls [tui.text-to-spec.clauses](tui.md#tui.text-to-spec.clauses), [tui.text-to-spec.thenItems](tui.md#tui.text-to-spec.thenItems), [tui.text-to-spec.idIn](tui.md#tui.text-to-spec.idIn)
    - fn [thenItems](../../src/tui/text-to-spec.ts#L78) (text: string, pad: string, known: readonly string[], callables: readonly string[], underWhen: boolean) → string[] <!-- internal -->
      <a id="tui.text-to-spec.thenItems"></a><br>Converts one clause of a "then" block into spec lines: an `EMITS` match yields an emits line, an identifier found via [`tui.text-to-spec.idIn`](tui.md#tui.text-to-spec.idIn) yields a step line, otherwise a plain then line only when nested under a when, else nothing. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.text-to-spec.idIn](tui.md#tui.text-to-spec.idIn)
  - module [theme](../../src/tui/theme.ts#L1)
    <a id="tui.theme"></a><br>Colours of the TUI (256-colour palette) and the per-line highlight of raw keylang Markdown: keywords, declared names and references coloured by the layer their ID starts with, code links, comments, headings, code fences.
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - screen [tui.screen](tui.md#tui.screen)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - fn [idStyle](../../src/tui/theme.ts#L47) (id: string, layers: readonly string[]) → Style
      <a id="tui.theme.idStyle"></a><br>Colour of an ID by the layer it starts with, in the order of `keylang.json`.
    - type [Run](../../src/tui/theme.ts#L55)
      <a id="tui.theme.Run"></a><br>A styled run on one line: code-point columns `[start, end)`, 0-based.
    - fn [highlight](../../src/tui/theme.ts#L62) (doc: Document | null, text: string, layers: readonly string[]) → Map<number, Run[]>
      <a id="tui.theme.highlight"></a><br>Highlight runs by 1-based line; later runs win where they overlap.
      - calls [tui.theme.idStyle](tui.md#tui.theme.idStyle), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
  - module [view](../../src/tui/view.ts#L1)
    <a id="tui.view"></a><br>Drawing a TUI state into a `Grid`: pure, so a test reads the frame as text. Layout: title, [files] | editor with gutter | [navigation], a detail line and the status bar.
    - agent-context [features.agent-context](features.md#features.agent-context)
    - config [base.config](base.md#base.config)
    - explain [features.explain](features.md#features.explain)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - explanations [map.explanations](map.md#map.explanations)
    - actions [tui.actions](tui.md#tui.actions)
    - code-highlight [tui.code-highlight](tui.md#tui.code-highlight)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - findings [tui.findings](tui.md#tui.findings)
    - markdown [tui.markdown](tui.md#tui.markdown)
    - merge [tui.merge](tui.md#tui.merge)
    - nav [tui.nav](tui.md#tui.nav)
    - screen [tui.screen](tui.md#tui.screen)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - explain-edge [features.explain-edge](features.md#features.explain-edge)
    - operations [operations.operations](operations.md#operations.operations)
    - proposals [features.proposals](features.md#features.proposals)
    - diag [base.diag](base.md#base.diag)
    - state [tui.state](tui.md#tui.state)
    - theme [tui.theme](tui.md#tui.theme)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - width [tui.width](tui.md#tui.width)
    - type [Rect](../../src/tui/view.ts#L30)
      <a id="tui.view.Rect"></a><br>Describes a rectangular screen region by its top-left origin and size, all as plain numbers, giving terminal UI code a shared shape for layout boundaries. It carries no behavior, only the four fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Layout](../../src/tui/view.ts#L37)
      <a id="tui.view.Layout"></a><br>Holds the screen rectangles computed for each TUI region: files and nav may be absent, while editor, detail and status are always present. The `panel` rect is where help, forms and modal steps draw, covering the editor area on wide terminals or the whole body on narrow ones. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [layout](../../src/tui/view.ts#L60) (state: Pick<State, "cols" | "rows" | "showFiles" | "showNav"> & { context?: State["context"]; focus?: State["focus"]; lastPanel?: State["lastPanel"] }) → Layout
      <a id="tui.view.layout"></a><br>Computes screen rectangles for the files pane, editor, side nav/context panel, detail line and status bar from the terminal size and panel flags. On narrow terminals it keeps only one side panel (the focused or last-opened) and lets an open context panel replace the nav at a… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [EditorRow](../../src/tui/view.ts#L90)
      <a id="tui.view.EditorRow"></a><br>One editor row: a text line, or the expanded evidence row under the cursor line.
    - fn [lineCount](../../src/tui/view.ts#L92) (buffer: Buffer) → number
      <a id="tui.view.lineCount"></a><br>Returns how many lines a buffer contains by taking the length of the array produced by [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines). It feeds [`tui.view.editorRows`](tui.md#tui.view.editorRows) and [`tui.view.gutterWidth`](tui.md#tui.view.gutterWidth), which size the editor's visible rows and line-number column. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
    - fn [gutterWidth](../../src/tui/view.ts#L96) (buffer: Buffer) → number
      <a id="tui.view.gutterWidth"></a><br>Computes the column width reserved for the editor's line-number gutter: a 2-column lead, the digit count of [`tui.view.lineCount`](tui.md#tui.view.lineCount) padded to at least 3, plus a trailing separator. Used by [`tui.view.drawEditor`](tui.md#tui.view.drawEditor), [`tui.view.drawCompletion`](tui.md#tui.view.drawCompletion), and the [`tui.app.App`](tui.md#tui.app.App) cursor/hit-test… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount)
    - fn [editorRows](../../src/tui/view.ts#L101) (state: State, buffer: Buffer, height: number) → EditorRow[]
      <a id="tui.view.editorRows"></a><br>Rows shown from `top`: the cursor line gets an evidence row below it when it has evidence.
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf)
    - fn [drawRuns](../../src/tui/view.ts#L117) (grid: Grid, x: number, y: number, width: number, clusters: Iterable<{ cluster: string; point: number }>, runs: readonly Run[], base: Style) → void <!-- internal -->
      <a id="tui.view.drawRuns"></a><br>Draws clusters with their code-point positions until `width` cells are used; a cluster (a letter with its marks, a ZWJ emoji) takes the style of its first code point. Only what fits is visited, however long the line.
      - calls [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [fromLayout](../../src/tui/view.ts#L128) (line: LineLayout, from: number) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromLayout"></a><br>The clusters of a laid-out line from cluster `from` on.
    - fn [fromText](../../src/tui/view.ts#L133) (text: string) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromText"></a><br>The clusters of `text` from the start, segmented only as far as they are read.
      - calls [tui.width.clusters](tui.md#tui.width.clusters)
    - fn [cellsBetween](../../src/tui/view.ts#L142) (line: LineLayout, from: number, to: number) → number <!-- internal -->
      <a id="tui.view.cellsBetween"></a><br>Cells between clusters `from` and `to` of a laid-out line (0 when `to` is before `from`).
    - fn [markCell](../../src/tui/view.ts#L147) (item: LineEvidence | undefined, stale: boolean) → { glyph: string; style: Style } <!-- internal -->
      <a id="tui.view.markCell"></a><br>Maps a line's evidence mark to its gutter glyph and style via `MARK_GLYPH` and `MARK_STYLE`, returning a blank cell when there is no evidence. When stale, it dims the style and drops bold. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [detailText](../../src/tui/view.ts#L156) (item: LineEvidence, snapshotId: string | null) → { text: string; style: Style }[]
      <a id="tui.view.detailText"></a><br>`ID ✓ static ✓ tests — trace ◌ …`: the channels of a line, never merged into one mark.
    - fn [lineMessage](../../src/tui/view.ts#L180) (item: LineEvidence | undefined) → { text: string; style: Style } | null
      <a id="tui.view.lineMessage"></a><br>The message for the cursor line: the first failing or unverified finding, with a fix hint.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [drawBox](../../src/tui/view.ts#L193) (grid: Grid, rect: Rect, title: string, style: Style, titleStyle: Style) → void <!-- internal -->
      <a id="tui.view.drawBox"></a><br>Fills a rectangle with a background style via [`tui.screen.Grid.fill`](tui.md#tui.screen.Grid.fill), then writes a single-line box border and an optional padded title at the top edge via [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write). Shared frame routine for the popup overlays in [`tui.view`](tui.md#tui.view). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [runsOf](../../src/tui/view.ts#L207) (buffer: Buffer, layers: readonly string[]) → Map<number, Run[]> <!-- internal -->
      <a id="tui.view.runsOf"></a><br>Returns per-line highlight runs for a buffer, caching them in a module-level map keyed by the buffer's document (or the buffer itself) and the joined layer names. On a cache miss, or whenever the buffer has no document, it recomputes via [`tui.theme.highlight`](tui.md#tui.theme.highlight) and stores the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.theme.highlight](tui.md#tui.theme.highlight)
    - fn [drawEditor](../../src/tui/view.ts#L217) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawEditor"></a><br>Paints the visible rows of a buffer into `grid`: a gutter with per-line evidence marks and numbers, highlighted text runs via [`tui.view.drawRuns`](tui.md#tui.view.drawRuns), expandable detail rows, selection and cursor-line backgrounds. Also overlays a dimmed ghost completion suffix in edit mode and sets… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.runsOf](tui.md#tui.view.runsOf), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.detailText](tui.md#tui.view.detailText), [tui.view.markCell](tui.md#tui.view.markCell), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromLayout](tui.md#tui.view.fromLayout), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [readRows](../../src/tui/view.ts#L261) (state: State, buffer: Buffer, rect: Rect) → { rows: ReadRow[]; cursorRow: number; top: number } <!-- internal -->
      <a id="tui.view.readRows"></a><br>Reading mode: the rendered rows, the row of the cursor line, and the first row shown.
      - calls [tui.markdown.renderMarkdown](tui.md#tui.markdown.renderMarkdown)
    - fn [readCursorRow](../../src/tui/view.ts#L270) (state: State, buffer: Buffer, rect: Rect) → number
      <a id="tui.view.readCursorRow"></a><br>The screen row (from the editor's top) where reading mode shows the cursor line: popups anchor there.
      - calls [tui.view.readRows](tui.md#tui.view.readRows)
    - fn [drawRead](../../src/tui/view.ts#L275) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawRead"></a><br>Paints the visible slice of a buffer's wrapped lines from [`tui.view.readRows`](tui.md#tui.view.readRows) onto the grid, highlighting the cursor's line and prefixing each source line's first row with an evidence glyph from [`tui.view.markCell`](tui.md#tui.view.markCell). Evidence comes from [`tui.evidence.evidenceOf`](tui.md#tui.evidence.evidenceOf) and is drawn… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.readRows](tui.md#tui.view.readRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.markCell](tui.md#tui.view.markCell), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawCode](../../src/tui/view.ts#L295) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawCode"></a><br>Paints the read-only source panel: a title bar with the clickable `file:line` link and an Esc hint, then each visible line from `code.top` with a line number, a marker and highlight on the target line, and token colors from [`tui.code-highlight.highlightCode`](tui.md#tui.code-highlight.highlightCode) drawn via… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.code-highlight.highlightCode](tui.md#tui.code-highlight.highlightCode), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromText](tui.md#tui.view.fromText)
    - fn [drawMerge](../../src/tui/view.ts#L318) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawMerge"></a><br>Paints the merge panel: a title row with path, origin, hunk position and accept/reject/pending counts, then the visible rows from [`tui.merge.mergeRows`](tui.md#tui.merge.mergeRows) starting at the scroll offset. Each row shows a current-hunk marker, decision glyph, +/- sign and text, with rejected… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.merge.mergeRows](tui.md#tui.merge.mergeRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawPanelList](../../src/tui/view.ts#L343) (grid: Grid, rect: Rect, title: string, entries: { text: string; mark: { glyph: string; style: Style } | null; style?: Style }[], selected: number, focused: boolean, top: number) → void <!-- internal -->
      <a id="tui.view.drawPanelList"></a><br>Fills a rectangle with the panel theme, writes a title row, then renders the visible slice of entries from `top`, highlighting the selected row (dimmer when unfocused) and drawing each entry's optional mark glyph in the last two columns via [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [navEntries](../../src/tui/view.ts#L357) (state: State) → NavItem[]
      <a id="tui.view.navEntries"></a><br>Builds the current navigation list by passing the state's analysis and set of expanded node keys to [`tui.nav.navItems`](tui.md#tui.nav.navItems), so drawing, mouse, and key handlers all see the same ordered entries. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.nav.navItems](tui.md#tui.nav.navItems)
    - fn [navNote](../../src/tui/view.ts#L369) (state: State, width: number) → string[]
      <a id="tui.view.navNote"></a><br>The explanation of the node selected in the nav panel, wrapped to `width` cells with its origin (`code`, or `llm · model · date`, `stale`); none for a node without one or an item that is no node.
      - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.view.wrapWords](tui.md#tui.view.wrapWords)
    - fn [wrapWords](../../src/tui/view.ts#L381) (text: string, width: number) → string[] <!-- internal -->
      <a id="tui.view.wrapWords"></a><br>Words of `text` in rows of at most `width` cells; a longer word is cut.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [navListHeight](../../src/tui/view.ts#L397) (state: State, rect: Rect) → number
      <a id="tui.view.navListHeight"></a><br>Rows of the nav panel's list: what the explanation of the selected node leaves.
      - calls [tui.view.navNote](tui.md#tui.view.navNote)
    - fn [drawNav](../../src/tui/view.ts#L402) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawNav"></a><br>Renders the navigation panel: if [`tui.view.navNote`](tui.md#tui.view.navNote) yields text, it paints a separator and note rows below the list and shrinks the list area to [`tui.view.navListHeight`](tui.md#tui.view.navListHeight). It then maps [`tui.view.navEntries`](tui.md#tui.view.navEntries) to indented rows with expand arrows, heading styling and marks (dimmed… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.view.navNote](tui.md#tui.view.navNote), [tui.view.navListHeight](tui.md#tui.view.navListHeight), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList)
    - fn [drawContext](../../src/tui/view.ts#L425) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawContext"></a><br>What goes to the model: kind, label and tokens per item; `◇` planned, `?` incomplete data.
      - calls [features.agent-context.contextPack](features.md#features.agent-context.contextPack), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.contextTop](tui.md#tui.view.contextTop)
    - fn [contextTop](../../src/tui/view.ts#L436) (index: number, rect: Rect) → number
      <a id="tui.view.contextTop"></a><br>First item shown in the context panel: the list scrolls to keep the selected item in view. A click maps rows the same way.
    - fn [drawFiles](../../src/tui/view.ts#L440) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawFiles"></a><br>Renders the FILES panel by turning each open file into a list entry, appending " +" when [`tui.buffer.isDirty`](tui.md#tui.buffer.isDirty) reports unsaved changes and " ≈" when the file has a pending proposal, and bolding the current file. It then hands the entries to [`tui.view.drawPanelList`](tui.md#tui.view.drawPanelList) with the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.filesTop](tui.md#tui.view.filesTop)
    - fn [filesTop](../../src/tui/view.ts#L451) (state: Pick<State, "filesIndex">, rect: Rect) → number
      <a id="tui.view.filesTop"></a><br>First file shown in the panel: the list scrolls to keep the selected file in view. A click maps rows the same way.
    - fn [recordLabel](../../src/tui/view.ts#L458) (record: OperationRecord) → string <!-- internal -->
      <a id="tui.view.recordLabel"></a><br>The registry label of a record's action, with its parameter (the feature slug), or its id.
      - calls [tui.view.choiceText](tui.md#tui.view.choiceText), [tui.view.checkParams](tui.md#tui.view.checkParams), [tui.view.exportFormat](tui.md#tui.view.exportFormat), [tui.view.operationLabel](tui.md#tui.view.operationLabel)
    - fn [operationLabel](../../src/tui/view.ts#L484) (request: OperationRequest) → string
      <a id="tui.view.operationLabel"></a><br>How messages name an operation: `doctor`, `feature pay`.
      - calls [tui.view.exportFormat](tui.md#tui.view.exportFormat), [tui.view.explainPlanLabel](tui.md#tui.view.explainPlanLabel), [tui.view.explainBatchLabel](tui.md#tui.view.explainBatchLabel), [tui.view.codeSource](tui.md#tui.view.codeSource)
    - fn [codeSource](../../src/tui/view.ts#L509) (source: { file?: string | null | undefined; line?: number | null | undefined; since?: string | null | undefined }) → string <!-- internal -->
      <a id="tui.view.codeSource"></a><br>The source of a code-to-spec as the CLI names it: `src/a.ts:8` or `--since HEAD`.
    - fn [recordStatus](../../src/tui/view.ts#L515) (record: OperationRecord) → string
      <a id="tui.view.recordStatus"></a><br>The status of a record for the F6 list: `running…` or `completed · code 0`, and `outdated` once its inputs changed.
    - fn [recordSummary](../../src/tui/view.ts#L522) (record: OperationRecord) → string
      <a id="tui.view.recordSummary"></a><br>The status with the domain outcome when there is one: `done · code 0`, `2 gap(s) · code 1`.
      - calls [tui.view.mapCheckOutcome](tui.md#tui.view.mapCheckOutcome), [tui.view.mapOutcome](tui.md#tui.view.mapOutcome), [tui.view.baselineOutcome](tui.md#tui.view.baselineOutcome), [tui.view.agentsOutcome](tui.md#tui.view.agentsOutcome), [tui.view.initOutcome](tui.md#tui.view.initOutcome), [tui.view.fmtOutcome](tui.md#tui.view.fmtOutcome), [tui.view.checkOutcome](tui.md#tui.view.checkOutcome), [tui.view.edgeOutcome](tui.md#tui.view.edgeOutcome), [tui.view.wireOutcome](tui.md#tui.view.wireOutcome), [tui.view.exportOutcome](tui.md#tui.view.exportOutcome), [tui.view.parseOutcome](tui.md#tui.view.parseOutcome), [tui.view.tracePlanOutcome](tui.md#tui.view.tracePlanOutcome), [tui.view.explainOutcome](tui.md#tui.view.explainOutcome), [tui.view.explainPlanOutcome](tui.md#tui.view.explainPlanOutcome), [tui.view.explainLlmOutcome](tui.md#tui.view.explainLlmOutcome), [tui.view.explainBatchOutcome](tui.md#tui.view.explainBatchOutcome), [tui.view.draftOutcome](tui.md#tui.view.draftOutcome), [tui.view.specCodeOutcome](tui.md#tui.view.specCodeOutcome), [tui.view.applyOutcome](tui.md#tui.view.applyOutcome), [tui.view.recordStatus](tui.md#tui.view.recordStatus)
    - fn [checkParams](../../src/tui/view.ts#L554) (request: CheckRequest) → string <!-- internal -->
      <a id="tui.view.checkParams"></a><br>The requested check options as the F6 list names them: `keylang · strict · static shape`.
    - fn [checkOutcome](../../src/tui/view.ts#L564) (payload: CheckPayload) → string <!-- internal -->
      <a id="tui.view.checkOutcome"></a><br>`0 fail, 2 unverified, 5 ok`: the CLI's summary line.
    - fn [exportFormat](../../src/tui/view.ts#L569) (request: ExportRequest) → string <!-- internal -->
      <a id="tui.view.exportFormat"></a><br>The format an export request writes: an explained edge has only the human lines.
      - calls [operations.operations.exportFormatOf](operations.md#operations.operations.exportFormatOf)
    - fn [explainOutcome](../../src/tui/view.ts#L574) (payload: ExplainPayload) → string <!-- internal -->
      <a id="tui.view.explainOutcome"></a><br>`K001: offline help`, `fn a.b: saved answer fresh`, `module a: no saved answer`.
    - fn [explainLlmOutcome](../../src/tui/view.ts#L580) (payload: ExplainLlmPayload) → string <!-- internal -->
      <a id="tui.view.explainLlmOutcome"></a><br>`fn a.b: the fresh saved answer, no request`, `…: new short answer saved`, `…: no model, nothing asked`, `…: refused, nothing written`.
    - fn [explainPlanLabel](../../src/tui/view.ts#L590) (request: ExplainPlanRequest) → string <!-- internal -->
      <a id="tui.view.explainPlanLabel"></a><br>The CLI command of an inventory: `explain --stale`, `explain --missing --dry-run --limit 3 --jobs 2`.
    - fn [explainPlanOutcome](../../src/tui/view.ts#L596) (payload: ExplainPlanPayload) → string <!-- internal -->
      <a id="tui.view.explainPlanOutcome"></a><br>`2 stale, 1 gone of 5 saved explanation(s)`, `nothing to explain: zero work, no request`, `6 brief(s) planned, ~1200 in, ~480 out tokens (approximate)`.
    - fn [explainBatchLabel](../../src/tui/view.ts#L607) (request: ExplainBatchRequest) → string <!-- internal -->
      <a id="tui.view.explainBatchLabel"></a><br>The CLI command of a batch: `explain --missing --llm --limit 3 --jobs 2`.
    - fn [explainBatchOutcome](../../src/tui/view.ts#L612) (payload: ExplainBatchPayload) → string <!-- internal -->
      <a id="tui.view.explainBatchOutcome"></a><br>`6 of 6 brief(s) written`, `5 of 6 brief(s) written, 1 failed`, `cancelled: 1 of 6 written, 5 not started`, `outdated: …`.
    - fn [batchState](../../src/tui/view.ts#L622) (payload: ExplainBatchPayload, id: string) → string
      <a id="tui.view.batchState"></a><br>What became of one planned node of a batch: `written <file>`, `failed: <reason>`, `not started`.
    - fn [savedRows](../../src/tui/view.ts#L630) (rows: { text: string; style: Style }[], label: string, saved: SavedAnswer) → void <!-- internal -->
      <a id="tui.view.savedRows"></a><br>A saved answer or brief: its provenance on one row, then its text and the IDs it made up.
    - fn [tracePlanOutcome](../../src/tui/view.ts#L637) (payload: TracePlanPayload) → string <!-- internal -->
      <a id="tui.view.tracePlanOutcome"></a><br>`4 function(s) to instrument, 1 step id(s) left out`: the plan and what no adapter instruments.
    - fn [draftOutcome](../../src/tui/view.ts#L642) (status: OperationRecord["status"], payload: DraftFlowPayload | DraftRulesPayload | CodeToSpecPayload) → string <!-- internal -->
      <a id="tui.view.draftOutcome"></a><br>`3 step(s), preview, nothing written`, `3 step(s) proposed for <target>`, `refused, nothing written`, `write failed`.
    - fn [specCodeOutcome](../../src/tui/view.ts#L652) (status: OperationRecord["status"], payload: SpecToCodePayload) → string <!-- internal -->
      <a id="tui.view.specCodeOutcome"></a><br>What spec-to-code did with its candidate: previewed, proposed (all, or the ones before it stopped), refused.
    - fn [applyOutcome](../../src/tui/view.ts#L663) (status: OperationRecord["status"], payload: ApplyCodePayload) → string <!-- internal -->
      <a id="tui.view.applyOutcome"></a><br>`3 file(s) written`, `refused, nothing written`, `1 of 3 file(s) written, failed|cancelled`.
    - fn [parseOutcome](../../src/tui/view.ts#L672) (payload: ParsePayload) → string <!-- internal -->
      <a id="tui.view.parseOutcome"></a><br>`2 document(s), 1 error(s), 0 warning(s)`: what the parser found, the same counts as the CLI's stderr.
    - fn [exportOutcome](../../src/tui/view.ts#L678) (status: OperationRecord["status"], payload: ExportPayload) → string <!-- internal -->
      <a id="tui.view.exportOutcome"></a><br>`written`, `replaced`, `refused, nothing written`, `write failed`, `cancelled, nothing written`.
    - fn [edgeOutcome](../../src/tui/view.ts#L686) (payload: ExplainEdgePayload) → string <!-- internal -->
      <a id="tui.view.edgeOutcome"></a><br>`2 edge(s)`, `no edge, coverage complete`, `no confirmed edge, 1 unresolved`: what the snapshot says between the two ids.
    - fn [edgeItems](../../src/tui/view.ts#L696) (payload: ExplainEdgePayload) → { file: string | null; line: number; col: number; text: string }[]
      <a id="tui.view.edgeItems"></a><br>The evidence of an explain-edge report the arrows select after Tab: every edge (`→` from → to, `←` to → from), or every unresolved construct when there is none. `file` is null for an edge with no position in the code.
      - calls [features.explain-edge.edgeLine](features.md#features.explain-edge.edgeLine), [features.explain-edge.holeLine](features.md#features.explain-edge.holeLine)
    - fn [wireOutcome](../../src/tui/view.ts#L704) (status: OperationRecord["status"], payload: WirePayload, exitCode: 0 | 1 | 2 | null) → string <!-- internal -->
      <a id="tui.view.wireOutcome"></a><br>`written`, `up to date`, `stale`, `2 error(s) in wiring`, `manual file`, `inputs changed, nothing written`: what wire found and really did.
    - fn [fmtOutcome](../../src/tui/view.ts#L716) (status: OperationRecord["status"], payload: FmtPayload) → string <!-- internal -->
      <a id="tui.view.fmtOutcome"></a><br>`3 file(s) canonical`, `2 not formatted`, `1 formatted, 1 invalid`, `1 of 2 formatted, cancelled`: what fmt found and really did.
    - fn [choiceText](../../src/tui/view.ts#L731) (choice: AgentsRequest["harnesses"]) → string <!-- internal -->
      <a id="tui.view.choiceText"></a><br>`auto`, `none`, `claude, codex`: the selection as requested.
    - fn [agentsOutcome](../../src/tui/view.ts#L736) (status: OperationRecord["status"], payload: AgentsPayload) → string <!-- internal -->
      <a id="tui.view.agentsOutcome"></a><br>`up to date`, `2 stale`, `3 written, 1 removed`, `broken file, nothing written`, `2 of 4 step(s) done, failed`.
    - fn [initOutcome](../../src/tui/view.ts#L751) (status: OperationRecord["status"], payload: InitPayload) → string <!-- internal -->
      <a id="tui.view.initOutcome"></a><br>`set up`, `partial: map failed`, `keylang.json not written`, `cancelled after map`, or a check's two stages: never a success for a partial run.
      - calls [tui.view.agentsOutcome](tui.md#tui.view.agentsOutcome), [tui.view.baselineOutcome](tui.md#tui.view.baselineOutcome), [tui.view.initStages](tui.md#tui.view.initStages)
    - fn [initStages](../../src/tui/view.ts#L768) (payload: InitPayload) → { name: string; result: OperationResult | null }[] <!-- internal -->
      <a id="tui.view.initStages"></a><br>The stages of an init write, in the order they ran.
    - fn [mapOutcome](../../src/tui/view.ts#L777) (status: OperationRecord["status"], payload: MapPayload) → string <!-- internal -->
      <a id="tui.view.mapOutcome"></a><br>`3 written, 1 removed`, `1 conflict(s), nothing written`, `2 of 5 done, failed` — what a map write really did.
    - fn [baselineOutcome](../../src/tui/view.ts#L790) (status: OperationRecord["status"], payload: BaselinePayload) → string <!-- internal -->
      <a id="tui.view.baselineOutcome"></a><br>`up to date`, `stale`, `written`, `manual file, nothing written`, `inputs changed, nothing written`.
    - fn [mapCheckOutcome](../../src/tui/view.ts#L800) (payload: MapCheckPayload) → string <!-- internal -->
      <a id="tui.view.mapCheckOutcome"></a><br>`up to date`, `3 stale`, `1 conflict(s)` (conflicts first: they block `keylang map`).
    - fn [timeStr](../../src/tui/view.ts#L805) (ms: number) → string <!-- internal -->
      <a id="tui.view.timeStr"></a><br>Converts an epoch-millisecond timestamp into a local-time `HH:MM:SS` string by formatting it with `Date.toTimeString` and keeping the first eight characters. Used by [`tui.view.resultsReportRows`](tui.md#tui.view.resultsReportRows) to label report rows. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [resultsReportRows](../../src/tui/view.ts#L814) (state: State) → { text: string; style: Style; gap?: number }[]
      <a id="tui.view.resultsReportRows"></a><br>The report rows of the record selected in the F6 panel: its parameters, timings and the operation's messages. Presentation only — the payload in `record.result` carries the domain data.
      - calls [tui.view.timeStr](tui.md#tui.view.timeStr), [tui.view.recordStatus](tui.md#tui.view.recordStatus), [tui.view.infoSummary](tui.md#tui.view.infoSummary), [tui.view.mapCheckOutcome](tui.md#tui.view.mapCheckOutcome), [tui.view.mapOutcome](tui.md#tui.view.mapOutcome), [tui.view.baselineOutcome](tui.md#tui.view.baselineOutcome), [tui.view.agentsOutcome](tui.md#tui.view.agentsOutcome), [tui.view.initOutcome](tui.md#tui.view.initOutcome), [tui.view.initStages](tui.md#tui.view.initStages), [tui.view.checkOutcome](tui.md#tui.view.checkOutcome), [tui.findings.findingRow](tui.md#tui.findings.findingRow), [tui.view.edgeItems](tui.md#tui.view.edgeItems), [tui.view.exportOutcome](tui.md#tui.view.exportOutcome), [tui.view.wireOutcome](tui.md#tui.view.wireOutcome), [tui.view.parseOutcome](tui.md#tui.view.parseOutcome), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [base.diag.isError](base.md#base.diag.isError), [tui.view.explainOutcome](tui.md#tui.view.explainOutcome), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [tui.view.savedRows](tui.md#tui.view.savedRows), [tui.view.explainPlanOutcome](tui.md#tui.view.explainPlanOutcome), [features.explain-inventory.briefCounts](features.md#features.explain-inventory.briefCounts), [tui.view.explainBatchLabel](tui.md#tui.view.explainBatchLabel), [tui.view.explainBatchOutcome](tui.md#tui.view.explainBatchOutcome), [tui.view.batchState](tui.md#tui.view.batchState), [tui.view.explainLlmOutcome](tui.md#tui.view.explainLlmOutcome), [tui.view.tracePlanOutcome](tui.md#tui.view.tracePlanOutcome), [tui.view.draftOutcome](tui.md#tui.view.draftOutcome), [tui.view.codeSource](tui.md#tui.view.codeSource), [tui.view.specCodeOutcome](tui.md#tui.view.specCodeOutcome), [tui.view.applyOutcome](tui.md#tui.view.applyOutcome), [tui.view.recordSummary](tui.md#tui.view.recordSummary), [tui.view.fmtOutcome](tui.md#tui.view.fmtOutcome)
    - fn [infoSummary](../../src/tui/view.ts#L1358) (items: readonly FeatureInfo[]) → string <!-- internal -->
      <a id="tui.view.infoSummary"></a><br>`ok 2 · unverified 1`, or `—` when the feature has none.
    - fn [resultsSplit](../../src/tui/view.ts#L1366) (state: State, height: number) → { list: number; report: number }
      <a id="tui.view.resultsSplit"></a><br>How the F6 panel splits: the entries list on top, the content of the selected entry below.
    - fn [findingStateRow](../../src/tui/view.ts#L1376) (state: State) → string | null
      <a id="tui.view.findingStateRow"></a><br>Why the shown analysis is not a plain current check: a failed run, an update in flight, changes since the analysis, or unsaved buffers taken as overlay.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.view.configNote](tui.md#tui.view.configNote)
    - fn [findingDetailRows](../../src/tui/view.ts#L1399) (state: State, width: number) → string[]
      <a id="tui.view.findingDetailRows"></a><br>The details of the selected finding, wrapped to `width`: its full message (the list row cuts it) and then criterion, provenance, snapshot and reason; without a selection, why the list is empty. Always the same number of rows, so the list does not jump while the selection moves.
      - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.view.padRows](tui.md#tui.view.padRows), [tui.view.clipRows](tui.md#tui.view.clipRows), [tui.view.wrapCells](tui.md#tui.view.wrapCells), [tui.findings.findingDetailText](tui.md#tui.findings.findingDetailText)
    - fn [clipRows](../../src/tui/view.ts#L1410) (rows: string[], count: number, width: number) → string[] <!-- internal -->
      <a id="tui.view.clipRows"></a><br>The first `count` rows; a cut ends with `…`.
      - calls [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [padRows](../../src/tui/view.ts#L1414) (rows: string[]) → string[] <!-- internal -->
      <a id="tui.view.padRows"></a><br>Appends empty strings to the given rows until the array is at least `DETAIL_MESSAGE_ROWS + DETAIL_META_ROWS` long, never truncating. Used by [`tui.view.findingDetailRows`](tui.md#tui.view.findingDetailRows) so the finding detail panel keeps a fixed height. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [wrapCells](../../src/tui/view.ts#L1419) (text: string, width: number) → string[] <!-- internal -->
      <a id="tui.view.wrapCells"></a><br>`text` cut into rows of at most `width` cells, at spaces where it can.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth), [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [findingsListRows](../../src/tui/view.ts#L1435) (state: State, rect: Rect) → number
      <a id="tui.view.findingsListRows"></a><br>Rows the findings list takes inside the panel `rect`: the counts, the state and the details of the selected finding come first.
      - calls [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow)
    - fn [drawResults](../../src/tui/view.ts#L1442) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawResults"></a><br>The F6 panel over the editor area: the entries on top, the content of the selected entry below.
      - calls [tui.view.edgeItems](tui.md#tui.view.edgeItems), [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.view.reportOverflow](tui.md#tui.view.reportOverflow), [tui.view.resultsReportRows](tui.md#tui.view.resultsReportRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.view.recordLabel](tui.md#tui.view.recordLabel), [tui.view.recordStatus](tui.md#tui.view.recordStatus), [tui.view.drawFindings](tui.md#tui.view.drawFindings), [tui.width.sliceCells](tui.md#tui.width.sliceCells)
    - fn [reportOverflow](../../src/tui/view.ts#L1533) (rows: readonly { text: string }[], width: number) → number
      <a id="tui.view.reportOverflow"></a><br>Cells the widest report row exceeds `width` by: how far ←→ can scroll it.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawFindings](../../src/tui/view.ts#L1540) (grid: Grid, state: State, rect: Rect, dividerY: number) → void <!-- internal -->
      <a id="tui.view.drawFindings"></a><br>The full findings report of the current analysis: counts, filters, the selected finding's details, and the list.
      - calls [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.findings.findingRow](tui.md#tui.findings.findingRow)
    - fn [drawHover](../../src/tui/view.ts#L1584) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawHover"></a><br>Sizes and positions a hover popup inside the editor rectangle (preferring below the anchor, clamped to fit), draws its frame via [`tui.view.drawBox`](tui.md#tui.view.drawBox), then writes each line with [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write) using per-kind colors, rendering "rule" lines as a horizontal separator. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawCompletion](../../src/tui/view.ts#L1598) (grid: Grid, state: State, editor: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawCompletion"></a><br>Renders the autocomplete popup: picks a window of up to eight items around the selected index, sizes and anchors a box near the cursor column via [`tui.view.cellsBetween`](tui.md#tui.view.cellsBetween) and [`tui.view.gutterWidth`](tui.md#tui.view.gutterWidth), flipping above the row if it would overflow. Each row is written with… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [keyRows](../../src/tui/view.ts#L1680) (pairs: readonly [string, string][], width: number) → string[] <!-- internal -->
      <a id="tui.view.keyRows"></a><br>The key rows of a mode: two pairs a row where both fit in `width`, else one; a long pair takes its own row.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [helpRows](../../src/tui/view.ts#L1704) (state: State, width: number) → string[]
      <a id="tui.view.helpRows"></a><br>The rows of the help popup, wrapped to `width`: the keys of the mode, the offline help of the line's diagnostic, then the whole catalogue by group — the same registry the palette searches, with each key as the mode has it and the reason of each unavailable action.
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain.explainCode](features.md#features.explain.explainCode), [tui.view.keyRows](tui.md#tui.view.keyRows), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionKey](tui.md#tui.actions.actionKey), [tui.view.wrapCells](tui.md#tui.view.wrapCells)
    - fn [helpBox](../../src/tui/view.ts#L1737) (state: State) → { rect: Rect; rows: string[]; visible: number } <!-- internal -->
      <a id="tui.view.helpBox"></a><br>Where the help popup draws, its rows and how many of them show at once.
      - calls [tui.view.layout](tui.md#tui.view.layout), [tui.view.helpRows](tui.md#tui.view.helpRows)
    - fn [helpScrollMax](../../src/tui/view.ts#L1748) (state: State) → number
      <a id="tui.view.helpScrollMax"></a><br>The last first row the help can scroll to.
      - calls [tui.view.helpBox](tui.md#tui.view.helpBox)
    - fn [drawHelp](../../src/tui/view.ts#L1753) (grid: Grid, state: State) → void <!-- internal -->
      <a id="tui.view.drawHelp"></a><br>Renders the key-help popup: gets the rect and text rows from [`tui.view.helpBox`](tui.md#tui.view.helpBox), frames it with [`tui.view.drawBox`](tui.md#tui.view.drawBox), and writes the visible slice via [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write), clamping scroll to `state.helpTop`. When rows overflow, it adds a footer line showing the range and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.view.helpBox](tui.md#tui.view.helpBox), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawPrompt](../../src/tui/view.ts#L1761) (grid: Grid, state: State, rect: Rect, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawPrompt"></a><br>Paints the active prompt's status line with a per-kind label, the typed text or form summary, and a note, placing the cursor via [`tui.width.stringWidth`](tui.md#tui.width.stringWidth). For list prompts it then draws a scrolled popup through [`tui.view.drawBox`](tui.md#tui.view.drawBox), with detail rows above choices and the selected… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.newSpecLabel](tui.md#tui.view.newSpecLabel), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.wrapCells](tui.md#tui.view.wrapCells), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [newSpecLabel](../../src/tui/view.ts#L1797) (field: "kind" | "path" | "name" | undefined) → string <!-- internal -->
      <a id="tui.view.newSpecLabel"></a><br>The label of the field the new-spec form is on.
    - fn [footerHint](../../src/tui/view.ts#L1815) (mode: State["mode"], width: number) → string
      <a id="tui.view.footerHint"></a><br>The footer hint of the mode that fits in `width` cells: the leading keys that fit, and the tail.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [configNote](../../src/tui/view.ts#L1830) (state: State) → string | null
      <a id="tui.view.configNote"></a><br>Where the analysis takes its settings from, when that is not a plain saved `keylang.json`: a guess (no config), or the saved file while the buffer of `keylang.json` has unsaved edits that do not take effect.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
    - fn [drawBarrier](../../src/tui/view.ts#L1839) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawBarrier"></a><br>The save step before an operation that reads the disk (design §2.5), over the editor area.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawQuit](../../src/tui/view.ts#L1867) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawQuit"></a><br>The quit step while an operation runs (design §5), over the editor area.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawStart](../../src/tui/view.ts#L1892) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawStart"></a><br>The start screen of a repository without `keylang.json` (design §2.1): what was found and what can be done.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [render](../../src/tui/view.ts#L1912) (state: State) → Grid
      <a id="tui.view.render"></a><br>Builds the full terminal frame: title bar with file and mode, side panels via [`tui.view.drawFiles`](tui.md#tui.view.drawFiles)/[`tui.view.drawNav`](tui.md#tui.view.drawNav), the body chosen by mode ([`tui.view.drawEditor`](tui.md#tui.view.drawEditor), [`tui.view.drawCode`](tui.md#tui.view.drawCode), etc.), a detail line from [`tui.evidence.evidenceOf`](tui.md#tui.evidence.evidenceOf), and a status bar with… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.screen.Grid](tui.md#tui.screen.Grid), [tui.view.layout](tui.md#tui.view.layout), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.drawFiles](tui.md#tui.view.drawFiles), [tui.view.drawContext](tui.md#tui.view.drawContext), [tui.view.drawNav](tui.md#tui.view.drawNav), [tui.view.drawStart](tui.md#tui.view.drawStart), [tui.view.drawCode](tui.md#tui.view.drawCode), [tui.view.drawMerge](tui.md#tui.view.drawMerge), [tui.view.drawRead](tui.md#tui.view.drawRead), [tui.view.drawEditor](tui.md#tui.view.drawEditor), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.lineMessage](tui.md#tui.view.lineMessage), [tui.view.footerHint](tui.md#tui.view.footerHint), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.evidence.totals](tui.md#tui.evidence.totals), [tui.view.configNote](tui.md#tui.view.configNote), [tui.view.drawResults](tui.md#tui.view.drawResults), [tui.view.drawHover](tui.md#tui.view.drawHover), [tui.view.drawCompletion](tui.md#tui.view.drawCompletion), [tui.view.drawHelp](tui.md#tui.view.drawHelp), [tui.view.drawPrompt](tui.md#tui.view.drawPrompt), [tui.view.drawBarrier](tui.md#tui.view.drawBarrier), [tui.view.drawQuit](tui.md#tui.view.drawQuit)
  - module [web](../../src/tui/web.ts#L1)
    <a id="tui.web"></a><br>`keylang web`: the same TUI in a browser tab. `node:http` serves a page and the bundled xterm.js; a WebSocket (`ws`) carries ANSI frames to xterm.js and its keyboard, mouse, paste and resize events back to an `App` in this process. No PTY and no CDN.
    - node [external.node](external.md#external.node)
    - ws [external.ws](external.md#external.ws)
    - analyze [map.analyze](map.md#map.analyze)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - screen [tui.screen](tui.md#tui.screen)
    - type [AssetName](../../src/tui/web.ts#L50) = keyof typeof ASSETS <!-- internal -->
      <a id="tui.web.AssetName"></a><br>A string-literal union derived from the keys of `ASSETS`, so lookups into that asset table are restricted to names that actually exist. It gives web asset accessors compile-time checking instead of accepting arbitrary strings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [assetPath](../../src/tui/web.ts#L53) (name: AssetName) → string | null
      <a id="tui.web.assetPath"></a><br>The published package carries the assets in `dist/web/`; a checkout reads them from `node_modules`.
    - type [WebServer](../../src/tui/web.ts#L67)
      <a id="tui.web.WebServer"></a><br>Handle returned for a running local web UI, exposing its `url` and `port`, listing specs that still have unsaved edits across sessions via `unsaved()`, and shutting the server down with `close()`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Session](../../src/tui/web.ts#L79) <!-- internal -->
      <a id="tui.web.Session"></a><br>Holds the per-browser-tab state of the web TUI: the running `App`, the open WebSocket (or null when disconnected), a pending timer, and an `AudioQueue` that buffers PCM sent by the page while Ctrl+R recording is active. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [control](../../src/tui/web.ts#L88) (message: object) → string <!-- internal -->
      <a id="tui.web.control"></a><br>A control message for the page: a frame that starts with NUL, which no ANSI frame does.
    - module [AudioQueue](../../src/tui/web.ts#L96) <!-- internal -->
      <a id="tui.web.AudioQueue"></a><br>PCM chunks from the page, read by the session's recognizer as they arrive.
      - fn [push](../../src/tui/web.ts#L103) (chunk: Int16Array) → void
        <a id="tui.web.AudioQueue.push"></a><br>Appends a block of audio samples to the pending buffer, silently dropping it if the queue has ended or the total would exceed the sample cap. After enqueueing, it calls [`tui.web.AudioQueue.wake`](tui.md#tui.web.AudioQueue.wake) to resume playback. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [end](../../src/tui/web.ts#L110) (failure: Error | null = null) → void
        <a id="tui.web.AudioQueue.end"></a><br>Marks the queue as finished, records the given error only if none was stored earlier, and calls [`tui.web.AudioQueue.wake`](tui.md#tui.web.AudioQueue.wake) so any pending consumer notices the close. Used by [`tui.web.serveWeb`](tui.md#tui.web.serveWeb) to shut down audio streaming. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [wake](../../src/tui/web.ts#L116) () → void <!-- internal -->
        <a id="tui.web.AudioQueue.wake"></a><br>Clears the stored waiter callback and, if one was set, invokes it so a consumer blocked on the queue resumes. Called by [`tui.web.AudioQueue.push`](tui.md#tui.web.AudioQueue.push) and [`tui.web.AudioQueue.end`](tui.md#tui.web.AudioQueue.end) whenever new data or completion arrives. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [chunks](../../src/tui/web.ts#L123) () → AsyncGenerator<Int16Array>
        <a id="tui.web.AudioQueue.chunks"></a><br>The chunks as they come, until `end`.
    - fn [pcmOf](../../src/tui/web.ts#L138) (data: unknown) → Int16Array | null <!-- internal -->
      <a id="tui.web.pcmOf"></a><br>s16le PCM from base64; an odd byte count or bad base64 is dropped, not trusted.
    - fn [clampSize](../../src/tui/web.ts#L148) (value: unknown, fallback: number, max: number) → number
      <a id="tui.web.clampSize"></a><br>A size from the client: an integer within the grid limits, else the fallback.
    - fn [sameSecret](../../src/tui/web.ts#L153) (given: string | null | undefined, token: string) → boolean <!-- internal -->
      <a id="tui.web.sameSecret"></a><br>Checks whether a supplied credential matches the expected token using a constant-time byte comparison, returning false for non-string input or mismatched lengths. Used by [`tui.web.serveWeb`](tui.md#tui.web.serveWeb) to gate web requests. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [offeredToken](../../src/tui/web.ts#L161) (request: IncomingMessage) → string | null <!-- internal -->
      <a id="tui.web.offeredToken"></a><br>The token a socket offers among its subprotocols.
    - type [WebOptions](../../src/tui/web.ts#L169)
      <a id="tui.web.WebOptions"></a><br>Configuration for starting the browser-served TUI: the repository root, listening port and optional host, plus an optional analyzer, a shared operation runner for all sessions, and how long a detached session is kept alive awaiting reconnect. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [serveWeb](../../src/tui/web.ts#L180) (options: WebOptions) → Promise<WebServer>
      <a id="tui.web.serveWeb"></a><br>Starts an HTTP server that serves the static page and assets, then accepts token-guarded WebSocket upgrades on `/ws` where each tab drives a [`tui.app.App`](tui.md#tui.app.App) session resumable across reconnects. Browser PCM is relayed into an [`tui.web.AudioQueue`](tui.md#tui.web.AudioQueue) as the microphone, and the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.web.sameSecret](tui.md#tui.web.sameSecret), [tui.web.offeredToken](tui.md#tui.web.offeredToken), [tui.web.pathOf](tui.md#tui.web.pathOf), [tui.web.reply](tui.md#tui.web.reply), [tui.web.assetPath](tui.md#tui.web.assetPath), [tui.web.page](tui.md#tui.web.page), [tui.web.clampSize](tui.md#tui.web.clampSize), [tui.web.pcmOf](tui.md#tui.web.pcmOf), [tui.app.App](tui.md#tui.app.App), [tui.web.AudioQueue](tui.md#tui.web.AudioQueue), [tui.web.control](tui.md#tui.web.control), [tui.web.AudioQueue.chunks](tui.md#tui.web.AudioQueue.chunks), [tui.web.AudioQueue.end](tui.md#tui.web.AudioQueue.end), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
    - fn [pathOf](../../src/tui/web.ts#L395) (target: string | undefined) → string | null <!-- internal -->
      <a id="tui.web.pathOf"></a><br>The path of a request target, or null when it is not a URL at all.
    - fn [reply](../../src/tui/web.ts#L403) (response: ServerResponse, status: number, type: string, body: string | Buffer) → void <!-- internal -->
      <a id="tui.web.reply"></a><br>Writes a complete HTTP response for [`tui.web.serveWeb`](tui.md#tui.web.serveWeb): sets the given status and content type, adds `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` headers, then ends the response with the body. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [page](../../src/tui/web.ts#L409) () → string <!-- internal -->
      <a id="tui.web.page"></a><br>The page: xterm.js from `/assets/`, a WebSocket back to this server, reconnect with the same session.
  - module [width](../../src/tui/width.ts#L1)
    <a id="tui.width"></a><br>Terminal cell width of text: graphemes, not code units. A wide character (CJK, most emoji) takes two cells, combining marks and joiners none.
    - fn [graphemes](../../src/tui/width.ts#L9) (text: string) → string[]
      <a id="tui.width.graphemes"></a><br>Grapheme clusters of a string, in order.
    - fn [clusters](../../src/tui/width.ts#L16) (text: string) → Generator<string>
      <a id="tui.width.clusters"></a><br>The same clusters, segmented only as far as they are read: drawing a long line stops at the screen's edge.
    - fn [codePointWidth](../../src/tui/width.ts#L38) (cp: number) → 0 | 1 | 2 <!-- internal -->
      <a id="tui.width.codePointWidth"></a><br>Returns the terminal cell width of a single code point: zero for ZWJ, variation selectors and C0/C1 control codes, two for anything inside the `WIDE` ranges, otherwise one. It is the per-code-point building block used by [`tui.width.graphemeWidth`](tui.md#tui.width.graphemeWidth). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [graphemeWidth](../../src/tui/width.ts#L56) (cluster: string) → 0 | 1 | 2
      <a id="tui.width.graphemeWidth"></a><br>Cells one grapheme takes. An emoji cluster (a ZWJ sequence, a flag, a pictograph with VS16) is one wide cell pair; otherwise the width of its first visible code point.
      - calls [tui.width.codePointWidth](tui.md#tui.width.codePointWidth)
    - fn [stringWidth](../../src/tui/width.ts#L66) (text: string) → number
      <a id="tui.width.stringWidth"></a><br>Sums the terminal column width of a string by splitting it into grapheme clusters via [`tui.width.graphemes`](tui.md#tui.width.graphemes) and adding each cluster's 0/1/2 width from [`tui.width.graphemeWidth`](tui.md#tui.width.graphemeWidth). Layout code across [`tui.view`](tui.md#tui.view) and [`tui.markdown`](tui.md#tui.markdown) relies on it for wrapping, padding, and overflow… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [fitWidth](../../src/tui/width.ts#L73) (text: string, width: number) → string
      <a id="tui.width.fitWidth"></a><br>The longest prefix of `text` that fits in `width` cells.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [padWidth](../../src/tui/width.ts#L86) (text: string, width: number) → string
      <a id="tui.width.padWidth"></a><br>`text` cut or padded with spaces to exactly `width` cells; a cut ends with `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [sliceCells](../../src/tui/width.ts#L99) (text: string, left: number, width: number) → string
      <a id="tui.width.sliceCells"></a><br>The part of `text` seen through a window `width` cells wide scrolled `left` cells in: whole clusters only (a wide one cut by an edge becomes a blank), with `…` at an edge that hides more text.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [cellWidth](../../src/tui/width.ts#L129) (cluster: string) → number
      <a id="tui.width.cellWidth"></a><br>Cells a cluster takes in a `Grid`: a tab is drawn as one blank cell.
      - calls [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - type [LineLayout](../../src/tui/width.ts#L139)
      <a id="tui.width.LineLayout"></a><br>One line cut into clusters once, with prefix sums: the cells, code points and UTF-16 units before each cluster (index `clusters.length` is the whole line). Scrolling, drawing and hit-testing then take constant or logarithmic time per question instead of segmenting the line again.
    - fn [layoutLine](../../src/tui/width.ts#L146) (line: string) → LineLayout
      <a id="tui.width.layoutLine"></a><br>Splits a line into grapheme clusters via [`tui.width.graphemes`](tui.md#tui.width.graphemes) and builds three prefix-sum arrays mapping each cluster boundary to its terminal cell offset (via [`tui.width.cellWidth`](tui.md#tui.width.cellWidth)), code point offset, and UTF-16 unit offset. Used by [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout) to convert between… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.cellWidth](tui.md#tui.width.cellWidth)
    - fn [scrollToFit](../../src/tui/width.ts#L161) (layout: LineLayout, left: number, col: number, width: number) → number
      <a id="tui.width.scrollToFit"></a><br>The smallest first cluster from `left` on such that clusters `[first, col)` fit in `width` cells.
    - fn [clusterAtCell](../../src/tui/width.ts#L173) (layout: LineLayout, left: number, x: number) → number
      <a id="tui.width.clusterAtCell"></a><br>The cluster under cell `x` of a line drawn from cluster `left`; past the end, the end.
    - fn [clusterAt](../../src/tui/width.ts#L188) (line: string, codePoints: number) → number
      <a id="tui.width.clusterAt"></a><br>Grapheme index of a code-point column in `line` (a column inside a cluster maps to that cluster).
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [clusterOffset](../../src/tui/width.ts#L200) (line: string, clusters: number) → number
      <a id="tui.width.clusterOffset"></a><br>UTF-16 offset of the first `clusters` graphemes of `line`.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
