<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [actions](#tui.actions) · [analysis-worker](#tui.analysis-worker) · [app](#tui.app) · [assist](#tui.assist) · [background](#tui.background) · [buffer](#tui.buffer) · [clip-chat](#tui.clip-chat) · [clip-memory](#tui.clip-memory) · [clip-questions](#tui.clip-questions) · [clip-view](#tui.clip-view) · [clip](#tui.clip) · [code-highlight](#tui.code-highlight) · [disk](#tui.disk) · [evidence](#tui.evidence) · [findings](#tui.findings) · [forms](#tui.forms) · [forms.draft](#tui.forms.draft) · [forms.explain](#tui.forms.explain) · [forms.export](#tui.forms.export) · [forms.host](#tui.forms.host) · [forms.run](#tui.forms.run) · [input](#tui.input) · [markdown](#tui.markdown) · [merge-session](#tui.merge-session) · [merge](#tui.merge) · [nav](#tui.nav) · [new-spec](#tui.new-spec) · [operation-worker](#tui.operation-worker) · [prompt-keys](#tui.prompt-keys) · [reports](#tui.reports) · [reports.chat](#tui.reports.chat) · [reports.check](#tui.reports.check) · [reports.draft](#tui.reports.draft) · [reports.explain](#tui.reports.explain) · [reports.records](#tui.reports.records) · [reports.rows](#tui.reports.rows) · [reports.setup](#tui.reports.setup) · [results-panel](#tui.results-panel) · [screen](#tui.screen) · [state](#tui.state) · [terminal](#tui.terminal) · [text-to-spec](#tui.text-to-spec) · [theme](#tui.theme) · [view](#tui.view) · [web](#tui.web) · [width](#tui.width) · [zoom-screen](#tui.zoom-screen) · [zoom](#tui.zoom)

# map

- tui
  <a id="tui"></a><br>The interactive spec editor for terminal and browser: sessions in [`tui.app`](tui.md#tui.app) render ANSI frames for a terminal or [`tui.web`](tui.md#tui.web), with evidence gutter, navigation, merge and clip chat. It may not depend on `extract` or [`external.web-tree-sitter`](external.md#external.web-tree-sitter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [actions](../../src/tui/actions.ts#L1)
    <a id="tui.actions"></a><br>The catalogue of TUI actions: one registry used by the palette (`:` / Ctrl+P) and by the help popup. An action has a stable id, a label, a group, search aliases, an optional key hint and an availability predicate with a reason; `App.runAction(id)` executes it.
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - operations [operations.operations](operations.md#operations.operations)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - state [tui.state](tui.md#tui.state)
    - type [ActionContext](../../src/tui/actions.ts#L14)
      <a id="tui.actions.ActionContext"></a><br>What availability predicates may look at. Derived from `State` only.
    - type [Action](../../src/tui/actions.ts#L43)
      <a id="tui.actions.Action"></a><br>Shape of a user-invokable TUI command: identity, menu label and group, searchable aliases, an optional hotkey, plus two context-driven hooks — `when` returning a reason the command is currently blocked (or null) and `note` returning a non-blocking setup hint. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ActionEntry](../../src/tui/actions.ts#L55)
      <a id="tui.actions.ActionEntry"></a><br>Pairs an `Action` with its availability status: `reason` holds the text explaining why it cannot run right now (null when runnable), and `note` carries an advisory message that does not block execution. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [mergeOnly](../../src/tui/actions.ts#L72) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.mergeOnly"></a><br>Returns the constant reason string when the context's `merge` flag is set, and `null` otherwise; used by TUI action gating to signal that an action is blocked or applies only in merge mode. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [editor](../../src/tui/actions.ts#L73) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.editor"></a><br>Returns a reason string explaining why the editor is unavailable: the merge reason when the context is in merge mode, else the start reason when it is starting, otherwise null. Used by [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) and [`tui.actions.snapshot`](tui.md#tui.actions.snapshot) to gate their actions. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [bufferOrMerge](../../src/tui/actions.ts#L74) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.bufferOrMerge"></a><br>Returns whatever blocking reason [`tui.actions.editor`](tui.md#tui.actions.editor) reports, otherwise falls back to "no file open" when no current file is set, or null when the action may proceed. Shared precondition check used by [`tui.actions.viewOnly`](tui.md#tui.actions.viewOnly) and [`tui.actions.writable`](tui.md#tui.actions.writable). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.editor](tui.md#tui.actions.editor)
    - fn [snapshot](../../src/tui/actions.ts#L75) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.snapshot"></a><br>Resolves the text to display for the current context by first asking [`tui.actions.editor`](tui.md#tui.actions.editor) for a value and, when that yields nothing, falling back to the context's `noSnapshot` field. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.editor](tui.md#tui.actions.editor)
    - fn [running](../../src/tui/actions.ts#L76) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.running"></a><br>Guard that checks whether `ctx.operation` is set and, if so, returns the message "an operation is already running" so an action can be blocked; otherwise yields null to allow it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [viewOnly](../../src/tui/actions.ts#L78) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.viewOnly"></a><br>Returns a message explaining why a view-only key is blocked: first whatever [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) reports, else a hint to press Esc when the mode is "edit" or "code", else null meaning the action is allowed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.bufferOrMerge](tui.md#tui.actions.bufferOrMerge)
    - fn [writable](../../src/tui/actions.ts#L80) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.writable"></a><br>Returns a reason string blocking a write action, deferring first to [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) and otherwise reporting read-only generated map files when `readOnly` is set. Yields null when writing is allowed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.actions.bufferOrMerge](tui.md#tui.actions.bufferOrMerge)
    - fn [openAction](../../src/tui/actions.ts#L396) (path: string) → Action
      <a id="tui.actions.openAction"></a><br>The per-file "open" action of the palette.
    - fn [catalog](../../src/tui/actions.ts#L401) (state: State) → ActionEntry[]
      <a id="tui.actions.catalog"></a><br>The full catalogue for the current session: static actions plus one "open" entry per file.
      - calls [tui.actions.availabilityOf](tui.md#tui.actions.availabilityOf), [tui.actions.openAction](tui.md#tui.actions.openAction)
    - fn [availabilityOf](../../src/tui/actions.ts#L407) (state: State) → ActionContext
      <a id="tui.actions.availabilityOf"></a><br>The availability context of the current session state.
      - calls [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.actions.applyRecord](tui.md#tui.actions.applyRecord), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf)
    - fn [exportRecord](../../src/tui/actions.ts#L436) (state: Pick<State, "records" | "results">) → { record: OperationRecord } | { reason: string }
      <a id="tui.actions.exportRecord"></a><br>The report Export saves: the record selected in F6 while the panel is open, else the newest check, explain-edge, parse or trace-plan record — exactly that run, as it ran.
    - fn [applyRecord](../../src/tui/actions.ts#L451) (state: Pick<State, "records" | "results">) → { record: OperationRecord } | { reason: string }
      <a id="tui.actions.applyRecord"></a><br>The spec-to-code run whose candidate Apply writes: the record selected in F6 while the panel is open, else the newest spec-to-code record. The file checks (unsaved edits, an open MERGE, a waiting proposal) come when it runs.
    - fn [noSnapshotReason](../../src/tui/actions.ts#L462) (state: Pick<State, "analysis" | "config" | "error" | "updating">) → string | null
      <a id="tui.actions.noSnapshotReason"></a><br>Why the session has no code snapshot, or null when it has one. Also the status line's note.
    - fn [actionKey](../../src/tui/actions.ts#L477) (action: Action, mode: State["mode"]) → string | null
      <a id="tui.actions.actionKey"></a><br>The key of an action as the mode has it, or null. A plain key (a letter, `?`, `/`, Enter) is a key of the view: in editing it types text, and MERGE and the code viewer give letters their own meaning, so there it is not advertised — Ctrl+P runs the action instead.
    - fn [actionLabel](../../src/tui/actions.ts#L484) (action: Action, mode: State["mode"] = "view") → string
      <a id="tui.actions.actionLabel"></a><br>The palette item text of an action: its label, with the key hint when the mode has one.
      - calls [tui.actions.actionKey](tui.md#tui.actions.actionKey)
    - fn [matchActions](../../src/tui/actions.ts#L490) (entries: readonly ActionEntry[], query: string) → ActionEntry[]
      <a id="tui.actions.matchActions"></a><br>The catalogue entries matching `query`: every query word is a subsequence of some token of the label, key or aliases.
      - calls [tui.actions.searchText](tui.md#tui.actions.searchText), [tui.actions.subsequence](tui.md#tui.actions.subsequence), [tui.actions.fileName](tui.md#tui.actions.fileName)
    - fn [fileName](../../src/tui/actions.ts#L510) (id: string) → string <!-- internal -->
      <a id="tui.actions.fileName"></a><br>`rules` for `open:keylang/rules.md`: the base name without its extension, lower case.
    - fn [searchText](../../src/tui/actions.ts#L515) (action: Action) → string <!-- internal -->
      <a id="tui.actions.searchText"></a><br>Builds a single space-joined string from an action's label, optional key, and aliases, which [`tui.actions.matchActions`](tui.md#tui.actions.matchActions) uses as the haystack when filtering entries against a query. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [subsequence](../../src/tui/actions.ts#L519) (text: string, query: string) → boolean <!-- internal -->
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
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - explanations [map.explanations](map.md#map.explanations)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - baseline [features.baseline](features.md#features.baseline)
    - harness [features.harness](features.md#features.harness)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - proposals [features.proposals](features.md#features.proposals)
    - operations [operations.operations](operations.md#operations.operations)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - span [base.span](base.md#base.span)
    - actions [tui.actions](tui.md#tui.actions)
    - assist [tui.assist](tui.md#tui.assist)
    - background [tui.background](tui.md#tui.background)
    - clip [tui.clip](tui.md#tui.clip)
    - clip-chat [tui.clip-chat](tui.md#tui.clip-chat)
    - clip-questions [tui.clip-questions](tui.md#tui.clip-questions)
    - clip-memory [tui.clip-memory](tui.md#tui.clip-memory)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - disk [tui.disk](tui.md#tui.disk)
    - new-spec [tui.new-spec](tui.md#tui.new-spec)
    - findings [tui.findings](tui.md#tui.findings)
    - input [tui.input](tui.md#tui.input)
    - merge [tui.merge](tui.md#tui.merge)
    - merge-session [tui.merge-session](tui.md#tui.merge-session)
    - draft [tui.forms.draft](tui.md#tui.forms.draft)
    - explain [tui.forms.explain](tui.md#tui.forms.explain)
    - export [tui.forms.export](tui.md#tui.forms.export)
    - host [tui.forms.host](tui.md#tui.forms.host)
    - run [tui.forms.run](tui.md#tui.forms.run)
    - results-panel [tui.results-panel](tui.md#tui.results-panel)
    - zoom-screen [tui.zoom-screen](tui.md#tui.zoom-screen)
    - prompt-keys [tui.prompt-keys](tui.md#tui.prompt-keys)
    - screen [tui.screen](tui.md#tui.screen)
    - state [tui.state](tui.md#tui.state)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - text-to-spec [tui.text-to-spec](tui.md#tui.text-to-spec)
    - records [tui.reports.records](tui.md#tui.reports.records)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - llm [features.llm](features.md#features.llm)
    - type [Surface](../../src/tui/app.ts#L79)
      <a id="tui.app.Surface"></a><br>Output target the TUI renders into: it takes ANSI strings and, in a terminal only, can open a file at a line in `$EDITOR` (returning status-line text) or suspend the process like Ctrl+Z. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [Analyzer](../../src/tui/app.ts#L90) = (request: AnalysisRequest) => Promise<Analysis>
      <a id="tui.app.Analyzer"></a><br>Function-type alias: takes an `AnalysisRequest` and resolves to an `Analysis`, letting the TUI receive its analysis backend by injection rather than importing the extractor or tree-sitter directly. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OperationRunner](../../src/tui/app.ts#L93)
      <a id="tui.app.OperationRunner"></a><br>Runs one explicit operation; the session's default is the shared `runOperation`. Tests inject a gated one.
    - type [AppOptions](../../src/tui/app.ts#L95)
      <a id="tui.app.AppOptions"></a><br>Configuration for starting the terminal app: project root, terminal size, and optional injected analyzer, operation runner or worker, microphone source, quit callback, and home directory for saved settings. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
    - module [App](../../src/tui/app.ts#L131)
      <a id="tui.app.App"></a><br>The terminal editor session: it holds the editor state, routes input through [`tui.app.App.handle`](tui.md#tui.app.App.handle) and draws frames via [`tui.app.App.draw`](tui.md#tui.app.App.draw). It also re-analyses buffers and runs operations, merges and commits via helpers like [`tui.merge-session.MergeSession`](tui.md#tui.merge-session.MergeSession). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - fn [barrierInputs](../../src/tui/app.ts#L182) () <!-- internal -->
        <a id="tui.app.App.barrierInputs"></a><br>Which dirty buffers the open save step lists: the inputs its operation reads.
      - fn [constructor](../../src/tui/app.ts#L199) (options: AppOptions)
        <a id="tui.app.App.constructor"></a><br>Builds the editor's initial state and wires helpers like [`tui.merge-session.MergeSession`](tui.md#tui.merge-session.MergeSession), [`tui.assist.Assist`](tui.md#tui.assist.Assist), [`tui.clip-chat.ClipChat`](tui.md#tui.clip-chat.ClipChat) and [`tui.results-panel.ResultsPanel`](tui.md#tui.results-panel.ResultsPanel), opens a first file from disk, then shows the start screen, config or [`tui.app.App.reanalyze`](tui.md#tui.app.App.reanalyze). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.input.InputDecoder](tui.md#tui.input.InputDecoder), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [tui.app.App.worker](tui.md#tui.app.App.worker), [tui.clip.newClip](tui.md#tui.clip.newClip), [tui.merge-session.MergeSession](tui.md#tui.merge-session.MergeSession), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon), [tui.assist.Assist](tui.md#tui.assist.Assist), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor), [tui.app.App.triggerAtCursor](tui.md#tui.app.App.triggerAtCursor), [tui.app.App.plannedFns](tui.md#tui.app.App.plannedFns), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [tui.forms.draft.DraftForms](tui.md#tui.forms.draft.DraftForms), [tui.forms.explain.ExplainForms](tui.md#tui.forms.explain.ExplainForms), [tui.forms.run.RunForms](tui.md#tui.forms.run.RunForms), [tui.forms.export.ExportForms](tui.md#tui.forms.export.ExportForms), [tui.zoom-screen.ZoomScreen](tui.md#tui.zoom-screen.ZoomScreen), [tui.app.App.goToNode](tui.md#tui.app.App.goToNode), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.jump](tui.md#tui.app.App.jump), [tui.app.App.explainLines](tui.md#tui.app.App.explainLines), [tui.app.App.openNodeSearch](tui.md#tui.app.App.openNodeSearch), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.clip-chat.ClipChat](tui.md#tui.clip-chat.ClipChat), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.clip.Clip](tui.md#tui.clip.Clip), [tui.view.layout](tui.md#tui.view.layout), [tui.view.clipOnScreen](tui.md#tui.view.clipOnScreen), [tui.clip-chat.ClipChat.said](tui.md#tui.clip-chat.ClipChat.said), [tui.clip-chat.ClipChat.cancel](tui.md#tui.clip-chat.ClipChat.cancel), [tui.clip-chat.ClipChat.opened](tui.md#tui.clip-chat.ClipChat.opened), [tui.app.App.keepPlace](tui.md#tui.app.App.keepPlace), [tui.results-panel.ResultsPanel](tui.md#tui.results-panel.ResultsPanel), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals), [tui.app.App.moveLayers](tui.md#tui.app.App.moveLayers), [tui.app.App.applyCandidate](tui.md#tui.app.App.applyCandidate), [tui.app.App.askFeatureQuestions](tui.md#tui.app.App.askFeatureQuestions), [tui.forms.export.ExportForms.openExportPrompt](tui.md#tui.forms.export.ExportForms.openExportPrompt), [tui.forms.draft.DraftForms.openSpecCode](tui.md#tui.forms.draft.DraftForms.openSpecCode), [tui.app.App.showCode](tui.md#tui.app.App.showCode), [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.restorePlace](tui.md#tui.app.App.restorePlace), [tui.clip-chat.ClipChat.restore](tui.md#tui.clip-chat.ClipChat.restore), [tui.app.configState](tui.md#tui.app.configState), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [restorePlace](../../src/tui/app.ts#L379) () → void <!-- internal -->
        <a id="tui.app.App.restorePlace"></a><br>The clip's place from tui.json as the session starts; a file it cannot use is said once and left as it is until a drag.
        - calls [tui.clip-memory.readPlace](tui.md#tui.clip-memory.readPlace), [tui.clip-memory.placeClip](tui.md#tui.clip-memory.placeClip)
      - fn [keepPlace](../../src/tui/app.ts#L386) () → void <!-- internal -->
        <a id="tui.app.App.keepPlace"></a><br>A drag, a keyboard move or a resize of the clip or its window ended, or they were put back: tui.json keeps the place.
        - calls [tui.clip-memory.writePlace](tui.md#tui.clip-memory.writePlace), [tui.clip-memory.placeOf](tui.md#tui.clip-memory.placeOf), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [attach](../../src/tui/app.ts#L396) (surface: Surface, cols: number, rows: number) → void
        <a id="tui.app.App.attach"></a><br>Binds the app to a new drawing surface, clears the previously rendered frame so the next draw starts fresh, and sizes the layout to the given columns and rows via [`tui.app.App.resize`](tui.md#tui.app.App.resize). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.app.App.resize](tui.md#tui.app.App.resize)
      - fn [detach](../../src/tui/app.ts#L403) () → void
        <a id="tui.app.App.detach"></a><br>No surface: the screen belongs to someone else (a reconnect, `$EDITOR`, a stop); nothing is drawn.
      - fn [resize](../../src/tui/app.ts#L407) (cols: number, rows: number) → void
        <a id="tui.app.App.resize"></a><br>Clamps the new terminal size to at least 20 columns and 8 rows and to fixed maximums, then clears hover. It then calls [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible) to keep the view in range and [`tui.app.App.draw`](tui.md#tui.app.App.draw) to repaint. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [input](../../src/tui/app.ts#L415) (chunk: string) → void
        <a id="tui.app.App.input"></a><br>Decodes raw terminal input via [`tui.input.InputDecoder.feed`](tui.md#tui.input.InputDecoder.feed), sending multi-key runs judged pasted by [`tui.app.pastedRun`](tui.md#tui.app.pastedRun) as one paste event and other keys singly through [`tui.app.App.safely`](tui.md#tui.app.App.safely), then redraws. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.input.InputDecoder.feed](tui.md#tui.input.InputDecoder.feed), [tui.app.typedRun](tui.md#tui.app.typedRun), [tui.app.pastedRun](tui.md#tui.app.pastedRun), [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.app.App.safely](tui.md#tui.app.App.safely), [tui.input.InputDecoder.flush](tui.md#tui.input.InputDecoder.flush), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [safely](../../src/tui/app.ts#L447) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.safely"></a><br>One event; a failure (a file that cannot be written) is a message, never the end of the session and its unsaved buffers.
        - calls [tui.app.App.handle](tui.md#tui.app.App.handle), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.assist.Assist.cancelStaleGhost](tui.md#tui.assist.Assist.cancelStaleGhost)
      - fn [frame](../../src/tui/app.ts#L458) () → Grid
        <a id="tui.app.App.frame"></a><br>The current frame, as the transport would show it.
        - calls [tui.app.App.paint](tui.md#tui.app.App.paint)
      - fn [unsaved](../../src/tui/app.ts#L463) () → string[]
        <a id="tui.app.App.unsaved"></a><br>Files with unsaved changes.
      - fn [idle](../../src/tui/app.ts#L468) () → Promise<void>
        <a id="tui.app.App.idle"></a><br>Resolves when no analysis is running or waiting to start.
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [close](../../src/tui/app.ts#L473) () → void
        <a id="tui.app.App.close"></a><br>Shuts the app down: clears pending timers, closes [`tui.assist.Assist.close`](tui.md#tui.assist.Assist.close) and [`tui.clip-chat.ClipChat.close`](tui.md#tui.clip-chat.ClipChat.close), drops the surface and pending quit, cancels any running operation and ends its worker, then calls [`tui.app.App.wake`](tui.md#tui.app.App.wake). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.assist.Assist.close](tui.md#tui.assist.Assist.close), [tui.clip-chat.ClipChat.close](tui.md#tui.clip-chat.ClipChat.close), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [draw](../../src/tui/app.ts#L489) () → void <!-- internal -->
        <a id="tui.app.App.draw"></a><br>Renders the current frame via [`tui.app.App.paint`](tui.md#tui.app.App.paint) and writes only the changes since the previous frame, computed by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff), to the terminal surface. It does nothing when no surface is attached. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.app.App.paint](tui.md#tui.app.App.paint), [tui.screen.renderDiff](tui.md#tui.screen.renderDiff)
      - fn [paint](../../src/tui/app.ts#L497) () → Grid <!-- internal -->
        <a id="tui.app.App.paint"></a><br>The frame of the state now. The clip's counter follows what it counts — the analysis, the open file, the chat — so it is counted here (spec §4.6).
        - calls [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions), [tui.view.render](tui.md#tui.view.render)
      - fn [overlay](../../src/tui/app.ts#L504) () → Map<string, string> <!-- internal -->
        <a id="tui.app.App.overlay"></a><br>Builds a map from absolute file paths to the in-memory text of every editable buffer that [`tui.buffer.isDirty`](tui.md#tui.buffer.isDirty) reports as modified, skipping the `keylang.json` config file. [`tui.app.App.reanalyze`](tui.md#tui.app.App.reanalyze) passes this so analysis sees unsaved edits instead of the on-disk contents. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [reanalyze](../../src/tui/app.ts#L512) (explicit = true) → void
        <a id="tui.app.App.reanalyze"></a><br>`F5` or a save (`explicit`), or typing that settled: analyse now.
        - calls [tui.app.App.readConfig](tui.md#tui.app.App.readConfig), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.overlay](tui.md#tui.app.App.overlay), [tui.results-panel.ResultsPanel.selectedFinding](tui.md#tui.results-panel.ResultsPanel.selectedFinding), [tui.clip-questions.newFailsAfter](tui.md#tui.clip-questions.newFailsAfter), [tui.app.App.adoptResult](tui.md#tui.app.App.adoptResult), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [readConfig](../../src/tui/app.ts#L564) (explicit: boolean) → boolean <!-- internal -->
        <a id="tui.app.App.readConfig"></a><br>Reads `keylang.json` again before a run. False: it is invalid, and the analyzer is not run — it would only fail with the same error again.
        - calls [tui.app.configState](tui.md#tui.app.configState), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig)
      - fn [openConfig](../../src/tui/app.ts#L581) (reason: string, remember: boolean) → void <!-- internal -->
        <a id="tui.app.App.openConfig"></a><br>Opens `keylang.json` as text with the cursor on the field (or the JSON position) the reason names.
        - calls [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.configErrorCursor](tui.md#tui.app.configErrorCursor)
      - fn [browse](../../src/tui/app.ts#L587) () → void <!-- internal -->
        <a id="tui.app.App.browse"></a><br>The start screen's Browse: the current analysis with the guessed configuration; nothing is written.
        - calls [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [startKey](../../src/tui/app.ts#L593) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.startKey"></a><br>Keys of the start screen: choose an item; the palette, help, F6 and quitting work as elsewhere.
        - calls [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.browse](tui.md#tui.app.App.browse), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [adoptResult](../../src/tui/app.ts#L604) (analysis: Analysis, edits: number, selected: CheckResult | undefined) → void <!-- internal -->
        <a id="tui.app.App.adoptResult"></a><br>Installs a finished analysis via [`tui.app.App.adopt`](tui.md#tui.app.App.adopt), clearing the updating and error state and marking results outdated if edits happened meanwhile. It then keeps the previously selected finding selected if still reported, and clamps the selection. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.adopt](tui.md#tui.app.App.adopt), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.sameResult](tui.md#tui.findings.sameResult), [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [reanalyzeSoon](../../src/tui/app.ts#L617) () → void <!-- internal -->
        <a id="tui.app.App.reanalyzeSoon"></a><br>Typing: mark results outdated now, analyse once the typing settles.
        - calls [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [track](../../src/tui/app.ts#L635) (work: Promise<void>) → void <!-- internal -->
        <a id="tui.app.App.track"></a><br>Async work of a helper (a model, a microphone, an operation's result): `idle()` waits for it, and the frame follows it. Work that fails is a message, as a key that fails is (`safely`): never an unhandled rejection, which would end a terminal session and every session of…
        - calls [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [quiet](../../src/tui/app.ts#L648) () → boolean <!-- internal -->
        <a id="tui.app.App.quiet"></a><br>Reports whether the TUI is fully idle: no in-flight work counted, no pending settle timer, and the assistant not waiting on anything. [`tui.app.App.idle`](tui.md#tui.app.App.idle) and [`tui.app.App.wake`](tui.md#tui.app.App.wake) use it to decide whether to resolve or re-arm. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [wake](../../src/tui/app.ts#L652) () → void <!-- internal -->
        <a id="tui.app.App.wake"></a><br>Checks via [`tui.app.App.quiet`](tui.md#tui.app.App.quiet) whether no work is pending and, if so, drains the queued waiter callbacks, resetting the list and invoking each one to release anyone awaiting idleness. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [adopt](../../src/tui/app.ts#L660) (analysis: Analysis) → void <!-- internal -->
        <a id="tui.app.App.adopt"></a><br>Files and clean buffers follow the new analysis (a regenerated map, a change on disk).
        - calls [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.refreshFeatureLine](tui.md#tui.app.App.refreshFeatureLine)
      - fn [refreshFeatureLine](../../src/tui/app.ts#L710) () → void <!-- internal -->
        <a id="tui.app.App.refreshFeatureLine"></a><br>The status line's `feature <stage> · questions <n>` of the current file when it is a feature file (c4-zoom/11): its report on the session's analysis against the plan at its base (the merge-base with the main branch, else HEAD), as `keylang feature` computes it. It follows a…
        - calls [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.worker](tui.md#tui.app.App.worker), [operations.feature.featureReportOf](operations.md#operations.feature.featureReportOf)
      - fn [readOnlyReason](../../src/tui/app.ts#L738) (path: string) → string <!-- internal -->
        <a id="tui.app.App.readOnlyReason"></a><br>Why a generated buffer takes no edits, naming its generator.
        - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [specDir](../../src/tui/app.ts#L745) () → string <!-- internal -->
        <a id="tui.app.App.specDir"></a><br>The spec directory of the saved configuration (`keylang` when it cannot be read).
        - calls [base.config.loadConfig](base.md#base.config.loadConfig)
      - fn [diskFiles](../../src/tui/app.ts#L753) () → string[] <!-- internal -->
        <a id="tui.app.App.diskFiles"></a><br>Lists the editable files on disk: Markdown specs under the [`tui.app.App.specDir`](tui.md#tui.app.App.specDir) folder, skipping the saved `explain` store, plus `keylang.json` if it exists, as sorted root-relative POSIX paths via [`tui.app.sortFiles`](tui.md#tui.app.sortFiles). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [buffer](../../src/tui/app.ts#L766) () → Buffer | null <!-- internal -->
        <a id="tui.app.App.buffer"></a><br>Looks up the buffer for the currently active file key in the app state's buffer map, returning null when no file is current or the key has no entry. Nearly every editing and cursor method in [`tui.app.App`](tui.md#tui.app.App) goes through it to reach the open document. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [load](../../src/tui/app.ts#L770) (path: string) → Buffer <!-- internal -->
        <a id="tui.app.App.load"></a><br>Returns a cached editor buffer for a file, or builds one from the analysis workspace text (via [`features.lsp-features.workspace`](features.md#features.lsp-features.workspace)) falling back to disk, splitting line endings and caching the result. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.newBuffer](tui.md#tui.buffer.newBuffer)
      - fn [open](../../src/tui/app.ts#L782) (path: string, cursor: Cursor, remember = true) → void <!-- internal -->
        <a id="tui.app.App.open"></a><br>Switches the editor to a file at a given cursor, optionally pushing the current place onto the back stack, loading it via [`tui.app.App.load`](tui.md#tui.app.App.load), closing overlay modes and clearing selection, completion and hover. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.refreshFeatureLine](tui.md#tui.app.App.refreshFeatureLine)
      - fn [lines](../../src/tui/app.ts#L802) () → readonly string[] <!-- internal -->
        <a id="tui.app.App.lines"></a><br>Returns the current buffer's text as lines by fetching it via [`tui.app.App.buffer`](tui.md#tui.app.App.buffer) and splitting with [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines), yielding an empty array when no buffer is open. Used by search, mouse, and key handlers to resolve cursor positions. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
      - fn [clampCursor](../../src/tui/app.ts#L807) () → void <!-- internal -->
        <a id="tui.app.App.clampCursor"></a><br>Keeps the editor cursor inside the current buffer: line is clamped to the existing lines from [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines), column to the line's cluster count from [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout). With no buffer, it resets to 0,0. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [keepVisible](../../src/tui/app.ts#L820) () → void <!-- internal -->
        <a id="tui.app.App.keepVisible"></a><br>Scrolls so the cursor is on screen; the layout of its line answers in logarithmic time, however long the line.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.scrollToFit](tui.md#tui.width.scrollToFit)
      - fn [edit](../../src/tui/app.ts#L839) (change: (lines: string[], cursor: Cursor) => void, coalesce = false) → void <!-- internal -->
        <a id="tui.app.App.edit"></a><br>Applies a line-level mutation to the active buffer, blocking read-only files via [`tui.app.App.readOnlyReason`](tui.md#tui.app.App.readOnlyReason), recording capped (optionally coalesced) undo history, then saving through [`tui.buffer.setText`](tui.md#tui.buffer.setText) and scheduling [`tui.app.App.reanalyzeSoon`](tui.md#tui.app.App.reanalyzeSoon). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.readOnlyReason](tui.md#tui.app.App.readOnlyReason), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [save](../../src/tui/app.ts#L860) () → void <!-- internal -->
        <a id="tui.app.App.save"></a><br>Writes the active editable buffer via [`tui.app.App.persist`](tui.md#tui.app.App.persist), then runs [`tui.app.App.reanalyze`](tui.md#tui.app.App.reanalyze). It refuses a new file whose target now exists, and it warns once before overwriting a file changed on disk. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.app.App.changedOnDisk](tui.md#tui.app.App.changedOnDisk), [tui.app.App.persist](tui.md#tui.app.App.persist), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [changedOnDisk](../../src/tui/app.ts#L881) (buffer: Buffer) → boolean <!-- internal -->
        <a id="tui.app.App.changedOnDisk"></a><br>Reads the file at the buffer's path under the workspace root via [`tui.disk.readText`](tui.md#tui.disk.readText) and reports whether its current contents differ from the snapshot the buffer last saw on disk. Used by [`tui.app.App.save`](tui.md#tui.app.App.save) and [`tui.app.App.saveAndContinue`](tui.md#tui.app.App.saveAndContinue) to detect external edits before… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.disk.readText](tui.md#tui.disk.readText)
      - fn [newFileProblem](../../src/tui/app.ts#L890) (buffer: Buffer) → string | null <!-- internal -->
        <a id="tui.app.App.newFileProblem"></a><br>Why the first save of a new specification may not happen, or null: the path rules again (the configuration or a link may have changed since the form), and the target must still not exist.
        - calls [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc)
      - fn [generatedDoc](../../src/tui/app.ts#L899) (path: string) → boolean <!-- internal -->
        <a id="tui.app.App.generatedDoc"></a><br>The analysis knows `path` as a generated document.
      - fn [persist](../../src/tui/app.ts#L904) (buffer: Buffer) → void <!-- internal -->
        <a id="tui.app.App.persist"></a><br>Writes the buffer's text with its line ending; the buffer is clean after. Throws when the write fails.
        - calls [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged)
      - fn [dirtyInputs](../../src/tui/app.ts#L921) () → string[] <!-- internal -->
        <a id="tui.app.App.dirtyInputs"></a><br>The unsaved spec and config buffers, in path order: what an operation on the disk would not see.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [withSavedInputs](../../src/tui/app.ts#L933) (action: string, run: () => void, options: { writes?: string[]; writesNote?: string; inputs?: (path: string) => boolean } = {}) → void <!-- internal -->
        <a id="tui.app.App.withSavedInputs"></a><br>Runs `run` on saved inputs (design §2.5). Without dirty buffers it runs at once; with them the save step opens: Save and continue or Back.
        - calls [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [barrierKey](../../src/tui/app.ts#L943) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.barrierKey"></a><br>The keys of the save step: ←→/Tab choose, Enter does it, Esc is Back.
        - calls [tui.app.App.leaveBarrier](tui.md#tui.app.App.leaveBarrier), [tui.app.App.saveAndContinue](tui.md#tui.app.App.saveAndContinue)
      - fn [leaveBarrier](../../src/tui/app.ts#L951) () → void <!-- internal -->
        <a id="tui.app.App.leaveBarrier"></a><br>Back: nothing is written and the operation does not start.
      - fn [saveAndContinue](../../src/tui/app.ts#L964) () → void <!-- internal -->
        <a id="tui.app.App.saveAndContinue"></a><br>Saves the listed buffers one by one through the ordinary save path. The first failure (a file changed on disk, a write error) stops: the step stays open with the reason, the operation does not start, and the files already saved stay saved — there is no rollback.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.app.App.changedOnDisk](tui.md#tui.app.App.changedOnDisk), [tui.app.App.persist](tui.md#tui.app.App.persist), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [live](../../src/tui/app.ts#L1003) () → Workspace | null <!-- internal -->
        <a id="tui.app.App.live"></a><br>The workspace of the latest analysis, with this session's buffers as the documents. The pointer asks for it on every cell it crosses: the same analysis and the same buffers at the same versions give the one built last.
        - calls [features.lsp-features.workspace](features.md#features.lsp-features.workspace)
      - fn [lspPosition](../../src/tui/app.ts#L1017) (cursor: Cursor) → LspPosition <!-- internal -->
        <a id="tui.app.App.lspPosition"></a><br>Converts an editor cursor's grapheme-cluster column into an LSP line/character position using the offsets from [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout), clamping past line end. Without an open buffer, it returns character 0. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [cellAt](../../src/tui/app.ts#L1025) (x: number, y: number) → Cursor | null <!-- internal -->
        <a id="tui.app.App.cellAt"></a><br>The editor line and column under a screen cell, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.width.clusterAtCell](tui.md#tui.width.clusterAtCell), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [offsetOf](../../src/tui/app.ts#L1038) (at: Cursor) → number <!-- internal -->
        <a id="tui.app.App.offsetOf"></a><br>The UTF-16 offset of a cursor in the buffer.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [targetNear](../../src/tui/app.ts#L1049) (cursor: Cursor) → Cursor | null <!-- internal -->
        <a id="tui.app.App.targetNear"></a><br>The id or link at the cursor; on an item line without one under the cursor, its first.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf), [tui.app.forNodes](tui.md#tui.app.forNodes), [tui.width.clusterAt](tui.md#tui.width.clusterAt), [tui.app.App.lines](tui.md#tui.app.App.lines)
      - fn [hoverAt](../../src/tui/app.ts#L1068) (cursor: Cursor, x: number, y: number, source: Hover["source"]) → Hover | null <!-- internal -->
        <a id="tui.app.App.hoverAt"></a><br>The hover at a cursor, anchored at a cell. The rows are made once per target (an ID or a link) and workspace — wherever on the target the pointer is, they are the same — and once per position off any target.
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf), [tui.app.App.hoverRows](tui.md#tui.app.App.hoverRows), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition)
      - fn [hoverRows](../../src/tui/app.ts#L1082) (ws: Workspace, path: string, position: LspPosition) → Hover["lines"] | null <!-- internal -->
        <a id="tui.app.App.hoverRows"></a><br>The popup's rows of the hover at a position: the hover's parts as they are, the code at the declaration, the uses in specs.
        - calls [features.lsp-features.hoverContent](features.md#features.lsp-features.hoverContent), [features.lsp-features.runsText](features.md#features.lsp-features.runsText), [tui.disk.readText](tui.md#tui.disk.readText), [features.lsp-features.references](features.md#features.lsp-features.references)
      - fn [cursorAnchor](../../src/tui/app.ts#L1101) (col: number) → { x: number; y: number } <!-- internal -->
        <a id="tui.app.App.cursorAnchor"></a><br>Where a popup at the cursor line is anchored: the raw line in the editor, the rendered row in reading mode.
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.readCursorRow](tui.md#tui.view.readCursorRow), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth)
      - fn [goToCode](../../src/tui/app.ts#L1112) () → void <!-- internal -->
        <a id="tui.app.App.goToCode"></a><br>Resolves the id or code link near the cursor via [`features.lsp-features.definition`](features.md#features.lsp-features.definition) and opens the source file at that line with [`tui.app.App.jump`](tui.md#tui.app.App.jump), otherwise showing a status message (analysis still running, or no code found). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.live](tui.md#tui.app.App.live), [features.lsp-features.definition](features.md#features.lsp-features.definition), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.app.App.jump](tui.md#tui.app.App.jump)
      - fn [jump](../../src/tui/app.ts#L1130) (abs: string, line: number) → void <!-- internal -->
        <a id="tui.app.App.jump"></a><br>Opens a file at a line: a spec in the editor, code in `$EDITOR` or the built-in viewer.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.showCode](tui.md#tui.app.App.showCode)
      - fn [showCode](../../src/tui/app.ts#L1151) (rel: string, abs: string, line: number) → boolean <!-- internal -->
        <a id="tui.app.App.showCode"></a><br>The built-in read-only viewer at `line` of a code file; false (with a message) when it cannot be read.
        - calls [tui.view.layout](tui.md#tui.view.layout)
      - fn [nodeAtCursor](../../src/tui/app.ts#L1168) () → string | null <!-- internal -->
        <a id="tui.app.App.nodeAtCursor"></a><br>The ID of the node whose item is at the cursor line or the nearest one above it (a description, `calls`).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [lineOfNode](../../src/tui/app.ts#L1180) (path: string, id: string) → number | null <!-- internal -->
        <a id="tui.app.App.lineOfNode"></a><br>The 0-based line of the item that declares `id` in the file at `path`, or null.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [mapDirs](../../src/tui/app.ts#L1188) (analysis: Analysis) → { map: string; explained: string } <!-- internal -->
        <a id="tui.app.App.mapDirs"></a><br>The map directory of each variant, relative to the root.
      - fn [toggleMap](../../src/tui/app.ts#L1193) () → void <!-- internal -->
        <a id="tui.app.App.toggleMap"></a><br>`t`: the same layer file in the other map, the cursor on the same node.
        - calls [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.nodeAtCursor](tui.md#tui.app.App.nodeAtCursor), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.app.App.open](tui.md#tui.app.App.open)
      - fn [goToNode](../../src/tui/app.ts#L1220) (id: string) → void <!-- internal -->
        <a id="tui.app.App.goToNode"></a><br>The node's line in the map the reader is in: the explained map from one of its files, the map otherwise.
        - calls [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [goToSpec](../../src/tui/app.ts#L1233) (id: string | null) → void <!-- internal -->
        <a id="tui.app.App.goToSpec"></a><br>Jumps the editor to where a spec ID is declared, loading the file via [`tui.app.App.load`](tui.md#tui.app.App.load) and opening it with [`tui.app.App.open`](tui.md#tui.app.App.open) at the declaration's line and grapheme column; sets a status message if no ID or undeclared. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.clusterAt](tui.md#tui.width.clusterAt)
      - fn [idAtCursor](../../src/tui/app.ts#L1248) () → string | null <!-- internal -->
        <a id="tui.app.App.idAtCursor"></a><br>Resolves the identifier under or near the editor cursor in the current buffer's document via [`features.lsp-features.targetAt`](features.md#features.lsp-features.targetAt), returning its ID or null when no document, nearby target, or ID-kind target exists. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [goBack](../../src/tui/app.ts#L1256) () → void <!-- internal -->
        <a id="tui.app.App.goBack"></a><br>Pops the last place off the back history, reloads it via [`tui.app.App.load`](tui.md#tui.app.App.load), restores path, cursor and mode, then re-clamps the cursor. With empty history it just switches code mode to view. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [handle](../../src/tui/app.ts#L1274) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.handle"></a><br>Routes each terminal input event to the right handler by modal state (quit, help, barrier, prompt, results, start screen, clip chat), global F-keys and Ctrl+P, then the current mode's key handler, e.g. [`tui.app.App.editKey`](tui.md#tui.app.App.editKey). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.mouse](tui.md#tui.app.App.mouse), [tui.app.App.promptType](tui.md#tui.app.App.promptType), [tui.clip.Clip.paste](tui.md#tui.clip.Clip.paste), [tui.app.printable](tui.md#tui.app.printable), [tui.app.App.insert](tui.md#tui.app.App.insert), [tui.app.pasteRefusal](tui.md#tui.app.pasteRefusal), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.quitKey](tui.md#tui.app.App.quitKey), [tui.app.App.helpKey](tui.md#tui.app.App.helpKey), [tui.app.App.barrierKey](tui.md#tui.app.App.barrierKey), [tui.app.App.promptKey](tui.md#tui.app.App.promptKey), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.save](tui.md#tui.app.App.save), [tui.clip.Clip.key](tui.md#tui.clip.Clip.key), [tui.results-panel.ResultsPanel.returnToFindings](tui.md#tui.results-panel.ResultsPanel.returnToFindings), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.results-panel.ResultsPanel.resultsKey](tui.md#tui.results-panel.ResultsPanel.resultsKey), [tui.app.App.startKey](tui.md#tui.app.App.startKey), [tui.clip.Clip.toggle](tui.md#tui.clip.Clip.toggle), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.results-panel.ResultsPanel.openResults](tui.md#tui.results-panel.ResultsPanel.openResults), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.key](tui.md#tui.merge-session.MergeSession.key), [tui.app.App.codeKey](tui.md#tui.app.App.codeKey), [tui.zoom-screen.ZoomScreen.zoomKey](tui.md#tui.zoom-screen.ZoomScreen.zoomKey), [tui.app.App.editKey](tui.md#tui.app.App.editKey), [tui.app.App.contextKey](tui.md#tui.app.App.contextKey), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.viewKey](tui.md#tui.app.App.viewKey)
      - fn [helpKey](../../src/tui/app.ts#L1354) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.helpKey"></a><br>Scrolls the help overlay by one line on up/down or k/j, or by a panel-height page (from [`tui.view.layout`](tui.md#tui.view.layout)), clamped to [`tui.view.helpScrollMax`](tui.md#tui.view.helpScrollMax); any other key closes help and resets its scroll. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.view.helpScrollMax](tui.md#tui.view.helpScrollMax)
      - fn [quit](../../src/tui/app.ts#L1370) () → void <!-- internal -->
        <a id="tui.app.App.quit"></a><br>`q` / Ctrl+C. While an operation runs, the quit step asks first (Stay or Cancel and exit; `q` again in it is Cancel and exit); then unsaved buffers ask once more; then the session ends.
        - calls [tui.app.App.cancelAndQuit](tui.md#tui.app.App.cancelAndQuit), [tui.app.App.activeLabel](tui.md#tui.app.App.activeLabel), [tui.app.App.quitIfSaved](tui.md#tui.app.App.quitIfSaved)
      - fn [quitIfSaved](../../src/tui/app.ts#L1388) (note?: string) → void <!-- internal -->
        <a id="tui.app.App.quitIfSaved"></a><br>The ordinary end of a session: unsaved buffers ask once (the second q quits), then it closes.
        - calls [tui.app.App.unsaved](tui.md#tui.app.App.unsaved), [tui.app.App.close](tui.md#tui.app.App.close)
      - fn [activeLabel](../../src/tui/app.ts#L1400) () → string <!-- internal -->
        <a id="tui.app.App.activeLabel"></a><br>How messages name the running operation.
        - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel)
      - fn [quitKey](../../src/tui/app.ts#L1406) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.quitKey"></a><br>The keys of the quit step: ←→/Tab choose, Enter does it, Esc stays; while it waits only Esc (stay) counts.
        - calls [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.cancelAndQuit](tui.md#tui.app.App.cancelAndQuit)
      - fn [cancelAndQuit](../../src/tui/app.ts#L1424) () → void <!-- internal -->
        <a id="tui.app.App.cancelAndQuit"></a><br>Cancel and exit: the operation is cancelled — before a commit at once, during one after its current file step — and the session ends when it settles (`quitAfterSettle`), never in the middle of a file write.
      - fn [quitAfterSettle](../../src/tui/app.ts#L1437) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.quitAfterSettle"></a><br>An operation settled under the quit step. After Cancel and exit the unsaved buffers decide again, with what the operation wrote named; an operation that ended by itself while the step asked only closes the step.
        - calls [tui.reports.records.recordSummary](tui.md#tui.reports.records.recordSummary), [tui.app.App.quitIfSaved](tui.md#tui.app.App.quitIfSaved)
      - fn [move](../../src/tui/app.ts#L1452) (lines: number) → void <!-- internal -->
        <a id="tui.app.App.move"></a><br>Shifts the cursor line by the given offset, clamps it via [`tui.app.App.clampCursor`](tui.md#tui.app.App.clampCursor) and scrolls via [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). Clears any hover state that was triggered by the keyboard. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [common](../../src/tui/app.ts#L1459) (event: KeyEvent) → boolean <!-- internal -->
        <a id="tui.app.App.common"></a><br>Handles arrow, page, home and end keys, moving the cursor via [`tui.app.App.move`](tui.md#tui.app.App.move) and returning false for other keys. Shift+up/down in edit mode starts a line selection; other navigation clears it. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [cycleFocus](../../src/tui/app.ts#L1501) () → void <!-- internal -->
        <a id="tui.app.App.cycleFocus"></a><br>`Tab`: the editor, then each open side panel that is drawn once it has the focus.
        - calls [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex)
      - fn [drawable](../../src/tui/app.ts#L1514) (panel: SidePanel) → boolean <!-- internal -->
        <a id="tui.app.App.drawable"></a><br>Whether `panel` is drawn when it has the focus (below 100 columns the focused panel is the one shown). Below 60 columns none is: keys must not go to a list nobody sees.
        - calls [tui.view.layout](tui.md#tui.view.layout)
      - fn [hoverAtCursor](../../src/tui/app.ts#L1520) () → void <!-- internal -->
        <a id="tui.app.App.hoverAtCursor"></a><br>`K`: the hover of the id nearest the cursor, as the mouse would show it.
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt)
      - fn [viewKey](../../src/tui/app.ts#L1535) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.viewKey"></a><br>Dispatches view-mode keystrokes after [`tui.app.App.common`](tui.md#tui.app.App.common): vim-style cursor movement, toggling read/edit modes, jumping between spec and code, and opening search, palette, zoom or map. It also triggers merges and undo, explanations, voice stop and quit. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.draftAtCursor](tui.md#tui.app.App.draftAtCursor), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.hoverAtCursor](tui.md#tui.app.App.hoverAtCursor), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.readOnlyReason](tui.md#tui.app.App.readOnlyReason), [tui.app.App.mergeOrPick](tui.md#tui.app.App.mergeOrPick), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.nodeAtCursor](tui.md#tui.app.App.nodeAtCursor), [tui.app.App.openNodeSearch](tui.md#tui.app.App.openNodeSearch), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [editKey](../../src/tui/app.ts#L1615) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKey"></a><br>Handles edit-mode keys while a ghost suggestion is shown: Alt+] cycles variants, Tab accepts via [`tui.assist.Assist.acceptGhost`](tui.md#tui.assist.Assist.acceptGhost), other keys drop it and fall through to [`tui.app.App.editKeyWithoutGhost`](tui.md#tui.app.App.editKeyWithoutGhost). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.assist.Assist.acceptGhost](tui.md#tui.assist.Assist.acceptGhost), [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.editKeyWithoutGhost](tui.md#tui.app.App.editKeyWithoutGhost), [tui.assist.Assist.ghostSoon](tui.md#tui.assist.Assist.ghostSoon)
      - fn [editKeyWithoutGhost](../../src/tui/app.ts#L1633) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKeyWithoutGhost"></a><br>Handles edit-mode keys when no ghost suggestion shows: navigates, accepts or rejects the completion popup, maps Ctrl shortcuts to [`tui.app.App.save`](tui.md#tui.app.App.save), [`tui.assist.Assist.voice`](tui.md#tui.assist.Assist.voice) and undo, and applies grapheme-aware newline, backspace, delete and text insertion. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.acceptCompletion](tui.md#tui.app.App.acceptCompletion), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.save](tui.md#tui.app.App.save), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.undoEdit](tui.md#tui.app.App.undoEdit), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.complete](tui.md#tui.app.App.complete), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.insert](tui.md#tui.app.App.insert)
      - fn [insert](../../src/tui/app.ts#L1707) (raw: string) → void <!-- internal -->
        <a id="tui.app.App.insert"></a><br>Splices filtered input text into the active buffer at the cursor via [`tui.app.App.edit`](tui.md#tui.app.App.edit), splitting multi-line pastes into new lines and placing the cursor by grapheme clusters, then refreshes completion via [`tui.app.App.complete`](tui.md#tui.app.App.complete). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.printable](tui.md#tui.app.printable), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.complete](tui.md#tui.app.App.complete)
      - fn [undoEdit](../../src/tui/app.ts#L1735) () → void <!-- internal -->
        <a id="tui.app.App.undoEdit"></a><br>Clears any completion, pops the last snapshot from the active buffer's undo stack and restores its text via [`tui.buffer.setText`](tui.md#tui.buffer.setText) and cursor, or reports "nothing to undo". Then clamps and scrolls the cursor and schedules reanalysis. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [complete](../../src/tui/app.ts#L1753) (explicit: boolean) → void <!-- internal -->
        <a id="tui.app.App.complete"></a><br>Opens or refreshes the completion list; `explicit` (Ctrl+Space) also opens it mid-word.
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [features.lsp-features.completions](features.md#features.lsp-features.completions), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [acceptCompletion](../../src/tui/app.ts#L1782) () → void <!-- internal -->
        <a id="tui.app.App.acceptCompletion"></a><br>Applies the selected completion item, closing the list and recording acceptance via [`tui.assist.countSuggestion`](tui.md#tui.assist.countSuggestion), then, unless the cursor moved before the word start, replaces that word with the item label through [`tui.app.App.edit`](tui.md#tui.app.App.edit). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [fixNavIndex](../../src/tui/app.ts#L1800) (direction: 1 | -1) → void <!-- internal -->
        <a id="tui.app.App.fixNavIndex"></a><br>Clamps the navigation cursor into range and steps past heading rows in the given direction, then scrolls the nav list so the cursor stays visible, using [`tui.view.layout`](tui.md#tui.view.layout) and [`tui.view.navListHeight`](tui.md#tui.view.navListHeight). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.layout](tui.md#tui.view.layout), [tui.view.navListHeight](tui.md#tui.view.navListHeight)
      - fn [toggleFiles](../../src/tui/app.ts#L1814) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleFiles"></a><br>Flips the files panel's visibility, moving focus to it when shown, focusable and [`tui.app.App.drawable`](tui.md#tui.app.App.drawable) allows, or back to the editor when hidden, then refreshes via [`tui.app.App.narrowNote`](tui.md#tui.app.App.narrowNote) and [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleNav](../../src/tui/app.ts#L1823) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleNav"></a><br>Flips the navigation panel's visibility, recording it as the last panel when shown and moving focus to the editor if it was on the hidden panel, then refreshes via [`tui.app.App.narrowNote`](tui.md#tui.app.App.narrowNote) and [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleContext](../../src/tui/app.ts#L1832) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleContext"></a><br>F4 and the palette: the context panel; it takes the focus only where keys go to panels (`focusable`).
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [narrowNote](../../src/tui/app.ts#L1843) () → void <!-- internal -->
        <a id="tui.app.App.narrowNote"></a><br>A side panel needs 60 columns: below that a toggle says so instead of seeming to do nothing.
      - fn [contextPack](../../src/tui/app.ts#L1848) () → ContextPack | null
        <a id="tui.app.App.contextPack"></a><br>The pack for the current buffer and cursor line; null before the first analysis.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.agent-context.contextPack](features.md#features.agent-context.contextPack)
      - fn [contextKey](../../src/tui/app.ts#L1856) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.contextKey"></a><br>Handles keys in the context panel: up/down or j/k move the selection, x drops the selected item from the pack from [`tui.app.App.contextPack`](tui.md#tui.app.App.contextPack), and @ opens a prompt to add context. Tab calls [`tui.app.App.cycleFocus`](tui.md#tui.app.App.cycleFocus) and escape calls [`tui.app.App.toggleContext`](tui.md#tui.app.App.toggleContext). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext)
      - fn [addToContext](../../src/tui/app.ts#L1890) (id: string) → void <!-- internal -->
        <a id="tui.app.App.addToContext"></a><br>Validates a node ID via [`features.explain-node.summarizeNode`](features.md#features.explain-node.summarizeNode) and adds it to the TUI's context list, clearing any prior removal; reports a status message for pending analysis or unknown IDs with suggestions. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode)
      - fn [explainAtCursor](../../src/tui/app.ts#L1915) () → void <!-- internal -->
        <a id="tui.app.App.explainAtCursor"></a><br>`e`: offline, from the session's analysis as it is shown — the summary of the ID under the cursor with its saved answer and brief, each with its provenance, or the help of the line's diagnostic code. Never a model and never a file read behind the analysis' back, apart from the…
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.view.layout](tui.md#tui.view.layout), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [tui.app.App.explainLines](tui.md#tui.app.App.explainLines)
      - fn [explainLines](../../src/tui/app.ts#L1945) (id: string, found: Exclude<ReturnType<typeof nodeExplanation>, { unknown: string }>) → Hover["lines"] <!-- internal -->
        <a id="tui.app.App.explainLines"></a><br>The explain hover of a known node: the summary, the session's analysis, and each saved explanation with its origin.
        - calls [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [navKey](../../src/tui/app.ts#L1966) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.navKey"></a><br>Handles keys in the nav tree: j/k move via [`tui.app.App.fixNavIndex`](tui.md#tui.app.App.fixNavIndex), left/right collapse or expand, enter jumps to code or spec, plus tab focus cycling, z zoom via [`tui.zoom-screen.ZoomScreen.openZoom`](tui.md#tui.zoom-screen.ZoomScreen.openZoom), help and quit. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.jump](tui.md#tui.app.App.jump), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [filesKey](../../src/tui/app.ts#L2015) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.filesKey"></a><br>Handles keys in the file list: up/k and down/j move the selection, enter opens the chosen file via [`tui.app.App.open`](tui.md#tui.app.App.open) and focuses the editor, escape returns to the editor, tab calls [`tui.app.App.cycleFocus`](tui.md#tui.app.App.cycleFocus), q calls [`tui.app.App.quit`](tui.md#tui.app.App.quit). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [codeKey](../../src/tui/app.ts#L2045) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.codeKey"></a><br>Handles keys in the code viewer: scrolls by line (arrows, j/k) or by page sized from [`tui.view.layout`](tui.md#tui.view.layout), returns via [`tui.app.App.goBack`](tui.md#tui.app.App.goBack) on Escape, q or Ctrl+O, and opens help on "?". _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.goBack](tui.md#tui.app.App.goBack)
      - fn [inputsChanged](../../src/tui/app.ts#L2085) (reason: string) → void <!-- internal -->
        <a id="tui.app.App.inputsChanged"></a><br>Records that an input changed: a feature or check result computed before it is outdated from now on, and so is a spec-to-code preview (one still running too: a model's answer to the old bytes is not the current code).
        - calls [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode)
      - fn [requestOperation](../../src/tui/app.ts#L2100) (action: string, request: OperationRequest, then?: (record: OperationRecord) => void) → void <!-- internal -->
        <a id="tui.app.App.requestOperation"></a><br>Starts an operation that reads the saved files: after the save step when buffers it reads are dirty or it names what it writes (design §2.5), then as the session's one explicit operation. A second one is refused while one runs. `then` hears the record when it ends (not when the…
        - calls [tui.app.App.saveStep](tui.md#tui.app.App.saveStep), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [tui.app.App.withSavedInputs](tui.md#tui.app.App.withSavedInputs), [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel)
      - fn [saveStep](../../src/tui/app.ts#L2120) (request: OperationRequest) → { inputs?: (path: string) => boolean; writes?: string[]; writesNote?: string } | null <!-- internal -->
        <a id="tui.app.App.saveStep"></a><br>The save step of an operation: which dirty buffers it reads (saved first; the rest stay dirty and are never read behind them) and what it writes, named before it starts — always for the map and an apply, else when the step opens for dirty inputs anyway (the form already named…
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.initTargets](tui.md#tui.app.App.initTargets), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget), [tui.forms.draft.codeDraftTarget](tui.md#tui.forms.draft.codeDraftTarget), [tui.forms.draft.codeDraftFormOf](tui.md#tui.forms.draft.codeDraftFormOf), [tui.forms.draft.specCodePlace](tui.md#tui.forms.draft.specCodePlace), [tui.app.App.mapTargets](tui.md#tui.app.App.mapTargets)
      - fn [mapTargets](../../src/tui/app.ts#L2208) () → string[] <!-- internal -->
        <a id="tui.app.App.mapTargets"></a><br>What `keylang map` may write, as the step before it shows.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [initTargets](../../src/tui/app.ts#L2214) () → string[] <!-- internal -->
        <a id="tui.app.App.initTargets"></a><br>The classes of files `keylang init` may write, as its form and its save step name them.
        - calls [tui.app.App.mapTargets](tui.md#tui.app.App.mapTargets), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [writingNow](../../src/tui/app.ts#L2220) () → boolean <!-- internal -->
        <a id="tui.app.App.writingNow"></a><br>True (with the reason shown) while an operation writes files: saves and merge writes wait for it.
      - fn [beginCommit](../../src/tui/app.ts#L2232) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.beginCommit"></a><br>A writing operation is about to touch files: an analysis in flight is dropped (it read the disk before the commit) and none starts until the commit ends. A record no longer running (cancelled) changes nothing: its aborted signal makes the operation stop with nothing written.
        - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel)
      - fn [endCommit](../../src/tui/app.ts#L2252) (result: OperationResult) → string | null <!-- internal -->
        <a id="tui.app.App.endCommit"></a><br>After a writing operation — completed, cancelled part way or failed part way — the old analysis is superseded and a full one runs with the dirty buffers as overlays. Clean buffers follow the disk through it; a dirty buffer of a written file keeps its text and is named.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [startOperation](../../src/tui/app.ts#L2305) (action: string, request: OperationRequest, then?: (record: OperationRecord) => void) → OperationRecord | null <!-- internal -->
        <a id="tui.app.App.startOperation"></a><br>Runs an operation as the session's one explicit operation and records it for F6. The UI never blocks: the record turns "running" and the result (or a failure) lands later; a second operation is refused while one runs.
        - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.app.App.layoutBasis](tui.md#tui.app.App.layoutBasis), [tui.assist.Assist.suspendGhost](tui.md#tui.assist.Assist.suspendGhost), [tui.app.App.endCommit](tui.md#tui.app.App.endCommit), [tui.reports.records.recordSummary](tui.md#tui.reports.records.recordSummary), [tui.app.App.afterProposed](tui.md#tui.app.App.afterProposed), [tui.app.App.afterApplyCode](tui.md#tui.app.App.afterApplyCode), [tui.app.App.afterLayoutDraft](tui.md#tui.app.App.afterLayoutDraft), [tui.app.App.quitAfterSettle](tui.md#tui.app.App.quitAfterSettle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.app.App.beginCommit](tui.md#tui.app.App.beginCommit), [tui.app.App.commitGate](tui.md#tui.app.App.commitGate), [tui.app.App.track](tui.md#tui.app.App.track), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [commitGate](../../src/tui/app.ts#L2397) (request: OperationRequest, plan?: CommitPlan) → CommitGate <!-- internal -->
        <a id="tui.app.App.commitGate"></a><br>The session's answer before a commit: a target open with unsaved edits keeps its text and is not written under — an explanation or a feature file edited while the model answered, a diagram, a draft's target edited while the draft was prepared (the proposal would be judged…
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.applyConflicts](tui.md#tui.app.App.applyConflicts), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget)
      - fn [cancelOperation](../../src/tui/app.ts#L2431) () → void <!-- internal -->
        <a id="tui.app.App.cancelOperation"></a><br>Cancel (palette, `x` in F6): the running operation ends as cancelled with exit code null. Esc never does this.
      - fn [afterProposed](../../src/tui/app.ts#L2445) (record: OperationRecord, origin: DraftOrigin) → void <!-- internal -->
        <a id="tui.app.App.afterProposed"></a><br>A finished operation that proposed files: what MERGE opens by itself, or the message saying what waits. The answer's lines it left out and the model's notes are named either way; a preview or a run that proposed nothing only adds its notes to the message.
        - calls [tui.app.App.afterProposal](tui.md#tui.app.App.afterProposal)
      - fn [afterProposal](../../src/tui/app.ts#L2529) (origin: DraftOrigin, proposal: { target: string | null; report: boolean; opened: string; waits: string }) → void <!-- internal -->
        <a id="tui.app.App.afterProposal"></a><br>A finished operation proposed `target`: MERGE opens it by itself only while the person is still where the operation started (`report`: F6 may still show the report it started from, and closes); otherwise — or when MERGE cannot open it, or `target` is null — the proposal waits…
        - calls [tui.app.App.stillWhereStarted](tui.md#tui.app.App.stillWhereStarted), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [stillWhereStarted](../../src/tui/app.ts#L2547) (origin: DraftOrigin, report: boolean) → boolean <!-- internal -->
        <a id="tui.app.App.stillWhereStarted"></a><br>The file, mode and text an operation started from are current and nothing else is open; with `report`, F6 may show the report it started from, else it must be closed.
      - fn [worker](../../src/tui/app.ts#L2555) () → OperationWorker <!-- internal -->
        <a id="tui.app.App.worker"></a><br>The session's operation worker, started on first use; after a failure the next request starts a new one.
        - calls [tui.background.OperationWorker](tui.md#tui.background.OperationWorker)
      - fn [askFeatureQuestions](../../src/tui/app.ts#L2566) (slug: string) → void <!-- internal -->
        <a id="tui.app.App.askFeatureQuestions"></a><br>«Ask the model for questions» (c4-zoom/11): one request with the saved feature file and the context around its ids; the answer's `- ? …` lines are a proposal that MERGE accepts. Without an agent it says how to set one and changes nothing.
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [flowAtCursor](../../src/tui/app.ts#L2577) () → string | null <!-- internal -->
        <a id="tui.app.App.flowAtCursor"></a><br>The `# flow <name>` section the cursor is in, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [agentName](../../src/tui/app.ts#L2593) () → string | null <!-- internal -->
        <a id="tui.app.App.agentName"></a><br>The effective agent (`KEYLANG_AGENT`, agents.json, the saved keylang.json as the last analysis read it), or null. Credentials are checked by the operation.
        - calls [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent)
      - fn [draftAtCursor](../../src/tui/app.ts#L2606) () → void <!-- internal -->
        <a id="tui.app.App.draftAtCursor"></a><br>`Ctrl+Space` in the view: the agent drafts the flow under the cursor into this file — hybrid, with the context pack as F4 shows it now — as the session's draft-flow operation. It needs a model (never a silent algo draft).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor), [tui.app.App.triggerAtCursor](tui.md#tui.app.App.triggerAtCursor), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [features.agent-context.contextText](features.md#features.agent-context.contextText), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.track](tui.md#tui.app.App.track)
      - fn [triggerAtCursor](../../src/tui/app.ts#L2650) () → string | null <!-- internal -->
        <a id="tui.app.App.triggerAtCursor"></a><br>The `trigger` of the flow section under the cursor, or null.
        - calls [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor)
      - fn [proposalWaiting](../../src/tui/app.ts#L2657) (path: string) → boolean <!-- internal -->
        <a id="tui.app.App.proposalWaiting"></a><br>Something is at `.keylang/proposals/<path>`: a proposal (or a link) the person has not resolved.
      - fn [plannedFns](../../src/tui/app.ts#L2669) () → string[] <!-- internal -->
        <a id="tui.app.App.plannedFns"></a><br>The planned fns of the current analysis that no code implements yet: the IDs spec-to-code builds.
      - fn [applyCandidate](../../src/tui/app.ts#L2684) (record: OperationRecord | undefined) → void <!-- internal -->
        <a id="tui.app.App.applyCandidate"></a><br>`a` in F6 on a finished spec-to-code record: applies the entire candidate (`spec-to-code --apply`) after a step that names every file. Refused before that step: a run that did not finish, an outdated candidate (an input saved or its files written since), a file with unsaved…
        - calls [tui.app.App.applyConflicts](tui.md#tui.app.App.applyConflicts), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [applyConflicts](../../src/tui/app.ts#L2708) (files: readonly string[], proposals: boolean) → string[] <!-- internal -->
        <a id="tui.app.App.applyConflicts"></a><br>What in this session stops applying `files`: an open MERGE on one, unsaved edits, and (before the run) a waiting proposal.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [afterApplyCode](../../src/tui/app.ts#L2724) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.afterApplyCode"></a><br>After an apply: every spec-to-code candidate for a file it wrote is outdated (applying it again would overwrite newer code), and the message says what was written. `u` stays the undo of the last MERGE.
      - fn [layoutBasis](../../src/tui/app.ts#L2739) () → LayoutBasis <!-- internal -->
        <a id="tui.app.App.layoutBasis"></a><br>keylang.json as the session has it now: its buffer's version, the file, the code snapshot.
        - calls [tui.disk.readText](tui.md#tui.disk.readText)
      - fn [layoutStale](../../src/tui/app.ts#L2744) (record: OperationRecord) → string | null <!-- internal -->
        <a id="tui.app.App.layoutStale"></a><br>Why the layers of a layout draft no longer fit the session, or null: keylang.json was edited, saved or changed on disk, or the code moved on.
        - calls [tui.app.App.layoutBasis](tui.md#tui.app.App.layoutBasis), [tui.disk.splitEol](tui.md#tui.disk.splitEol)
      - fn [afterLayoutDraft](../../src/tui/app.ts#L2758) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.afterLayoutDraft"></a><br>A finished layout draft: nothing moves by itself; an edit made meanwhile makes it outdated at once.
        - calls [tui.app.App.layoutStale](tui.md#tui.app.App.layoutStale)
      - fn [moveLayers](../../src/tui/app.ts#L2778) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.moveLayers"></a><br>Enter on a finished layout draft in F6: its layers replace only `layers` of keylang.json's buffer — every other field stays, unknown ones too — as one undoable edit; nothing is written until Ctrl+S. Without keylang.json a new buffer opens with the inferred config and these…
        - calls [tui.app.App.layoutStale](tui.md#tui.app.App.layoutStale), [tui.app.App.load](tui.md#tui.app.App.load), [tui.buffer.newFileBuffer](tui.md#tui.buffer.newFileBuffer), [base.config.withLayers](base.md#base.config.withLayers), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [base.config.parseConfig](base.md#base.config.parseConfig), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [openNewSpec](../../src/tui/app.ts#L2838) () → void <!-- internal -->
        <a id="tui.app.App.openNewSpec"></a><br>The form of a new specification (design §2.8): kind, then path, then (for a flow) its name. Nothing exists until Ctrl+S.
        - calls [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec)
      - fn [refreshNewSpec](../../src/tui/app.ts#L2844) () → void <!-- internal -->
        <a id="tui.app.App.refreshNewSpec"></a><br>The items and the note of the field being typed. The root is always named: the path is relative to it.
        - calls [tui.new-spec.defaultSpecPath](tui.md#tui.new-spec.defaultSpecPath), [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.new-spec.flowNameProblem](tui.md#tui.new-spec.flowNameProblem)
      - fn [submitNewSpec](../../src/tui/app.ts#L2874) () → void <!-- internal -->
        <a id="tui.app.App.submitNewSpec"></a><br>Enter in the form: the next field, or the buffer. An invalid field keeps the form with its text and says why.
        - calls [tui.new-spec.defaultSpecPath](tui.md#tui.new-spec.defaultSpecPath), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.open](tui.md#tui.app.App.open), [tui.new-spec.suggestedFlowName](tui.md#tui.new-spec.suggestedFlowName), [tui.app.App.createSpec](tui.md#tui.app.App.createSpec), [tui.new-spec.flowNameProblem](tui.md#tui.new-spec.flowNameProblem)
      - fn [createSpec](../../src/tui/app.ts#L2917) (kind: NewSpecForm["kind"], path: string, name: string) → void <!-- internal -->
        <a id="tui.app.App.createSpec"></a><br>Opens the new, unsaved buffer in the editor at its end: listed in FILES and analysed as overlay, no file or directory until Ctrl+S.
        - calls [tui.buffer.newFileBuffer](tui.md#tui.buffer.newFileBuffer), [tui.new-spec.specTemplate](tui.md#tui.new-spec.specTemplate), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [mergeOrPick](../../src/tui/app.ts#L2936) () → void <!-- internal -->
        <a id="tui.app.App.mergeOrPick"></a><br>`m`: the proposal of the current file opens directly; otherwise the proposals list, so no target is chosen for the person. Without a mergeable proposal the message names the ignored ones and their reasons, as before.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals)
      - fn [openProposals](../../src/tui/app.ts#L2944) (prefer: readonly string[] = []) → void <!-- internal -->
        <a id="tui.app.App.openProposals"></a><br>The proposals list (design §2.9): every file under `.keylang/proposals/`, scanned now; viewing writes nothing.
        - calls [tui.merge-session.MergeSession.entries](tui.md#tui.merge-session.MergeSession.entries), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt)
      - fn [refreshProposalPrompt](../../src/tui/app.ts#L2957) (selected?: string) → void <!-- internal -->
        <a id="tui.app.App.refreshProposalPrompt"></a><br>The list entries whose path contains the typed text, in POSIX path order, each with its note.
        - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.padWidth](tui.md#tui.width.padWidth), [tui.app.proposalSummary](tui.md#tui.app.proposalSummary)
      - fn [submitProposal](../../src/tui/app.ts#L2976) () → void <!-- internal -->
        <a id="tui.app.App.submitProposal"></a><br>Enter in the list: the entry is scanned again first, so a proposal removed, rewritten or broken since the list was built is judged as it is now. A mergeable one opens in MERGE against the file on disk; any other keeps the list open with its reason, and nothing is written.
        - calls [tui.merge-session.MergeSession.entries](tui.md#tui.merge-session.MergeSession.entries), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [mouse](../../src/tui/app.ts#L2995) (event: MouseEvent) → void <!-- internal -->
        <a id="tui.app.App.mouse"></a><br>Routes mouse input by screen region: the wheel scrolls the report, code, merge, context, nav or editor, and moves update hover. Clicks select nav, file or context items or place the editor cursor; Ctrl+click calls [`tui.app.App.goToCode`](tui.md#tui.app.App.goToCode). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.results-panel.ResultsPanel.scrollReport](tui.md#tui.results-panel.ResultsPanel.scrollReport), [tui.clip.Clip.mouse](tui.md#tui.clip.Clip.mouse), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom-screen.ZoomScreen.zoomMouse](tui.md#tui.zoom-screen.ZoomScreen.zoomMouse), [tui.merge.mergeRows](tui.md#tui.merge.mergeRows), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.cellAt](tui.md#tui.app.App.cellAt), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt), [tui.view.contextTop](tui.md#tui.view.contextTop), [tui.view.navListHeight](tui.md#tui.view.navListHeight), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.view.filesTop](tui.md#tui.view.filesTop), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode)
      - fn [promptType](../../src/tui/app.ts#L3087) (text: string) → void <!-- internal -->
        <a id="tui.app.App.promptType"></a><br>Text typed or pasted while a prompt is open: into the selected row's field.
        - calls [tui.prompt-keys.typeInto](tui.md#tui.prompt-keys.typeInto), [tui.app.App.keysFor](tui.md#tui.app.App.keysFor)
      - fn [keysFor](../../src/tui/app.ts#L3096) (prompt: Prompt) → PromptKeys <!-- internal -->
        <a id="tui.app.App.keysFor"></a><br>What the keys of each kind of prompt do: which text the selected row edits, what follows typing, a move and a change, and what Enter runs.
        - calls [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.addToContext](tui.md#tui.app.App.addToContext), [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette), [tui.prompt-keys.noteOfSelection](tui.md#tui.prompt-keys.noteOfSelection), [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.goToNode](tui.md#tui.app.App.goToNode), [tui.zoom-screen.ZoomScreen.findFlows](tui.md#tui.zoom-screen.ZoomScreen.findFlows), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.app.App.submitProposal](tui.md#tui.app.App.submitProposal), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.app.App.submitNewSpec](tui.md#tui.app.App.submitNewSpec), [tui.forms.explain.ExplainForms.keys](tui.md#tui.forms.explain.ExplainForms.keys), [tui.forms.run.RunForms.keys](tui.md#tui.forms.run.RunForms.keys), [tui.forms.draft.DraftForms.keys](tui.md#tui.forms.draft.DraftForms.keys), [tui.forms.export.ExportForms.keys](tui.md#tui.forms.export.ExportForms.keys)
      - fn [openNodeSearch](../../src/tui/app.ts#L3181) () → void <!-- internal -->
        <a id="tui.app.App.openNodeSearch"></a><br>`s` (the view, the zoom) and «Find a node»: the node search, its matches following the text typed.
        - calls [tui.app.App.findNodes](tui.md#tui.app.App.findNodes)
      - fn [findNodes](../../src/tui/app.ts#L3187) () → void <!-- internal -->
        <a id="tui.app.App.findNodes"></a><br>The nodes matching the `s` prompt: names and IDs as a subsequence, then words of their explanations.
        - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes)
      - fn [promptKey](../../src/tui/app.ts#L3197) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.promptKey"></a><br>Routes a keypress while a prompt is open: Escape clears the prompt from state, and any other key goes to [`tui.prompt-keys.promptKey`](tui.md#tui.prompt-keys.promptKey) with the bindings returned by [`tui.app.App.keysFor`](tui.md#tui.app.App.keysFor). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [tui.prompt-keys.promptKey](tui.md#tui.prompt-keys.promptKey), [tui.app.App.keysFor](tui.md#tui.app.App.keysFor)
      - fn [openPalette](../../src/tui/app.ts#L3207) () → void <!-- internal -->
        <a id="tui.app.App.openPalette"></a><br>`:` in view/read, Ctrl+P anywhere: the full catalogue with fuzzy search.
        - calls [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette)
      - fn [refreshPalette](../../src/tui/app.ts#L3213) () → void <!-- internal -->
        <a id="tui.app.App.refreshPalette"></a><br>The catalogue entries matching the prompt text, as parallel item arrays.
        - calls [tui.actions.matchActions](tui.md#tui.actions.matchActions), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionLabel](tui.md#tui.actions.actionLabel)
      - fn [runAction](../../src/tui/app.ts#L3229) (id: string) → void <!-- internal -->
        <a id="tui.app.App.runAction"></a><br>Executes a palette action by its id. An unavailable action explains its reason; execution never synthesizes fake key events.
        - calls [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.app.App.browse](tui.md#tui.app.App.browse), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.results-panel.ResultsPanel.openResults](tui.md#tui.results-panel.ResultsPanel.openResults), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.forms.run.RunForms.openFeaturePrompt](tui.md#tui.forms.run.RunForms.openFeaturePrompt), [tui.forms.export.ExportForms.openC4Prompt](tui.md#tui.forms.export.ExportForms.openC4Prompt), [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf), [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.app.App.askFeatureQuestions](tui.md#tui.app.App.askFeatureQuestions), [tui.forms.run.RunForms.openCheckPrompt](tui.md#tui.forms.run.RunForms.openCheckPrompt), [tui.forms.run.RunForms.openEdgePrompt](tui.md#tui.forms.run.RunForms.openEdgePrompt), [tui.forms.export.ExportForms.openExportPrompt](tui.md#tui.forms.export.ExportForms.openExportPrompt), [tui.forms.run.RunForms.openBaselinePrompt](tui.md#tui.forms.run.RunForms.openBaselinePrompt), [tui.forms.run.RunForms.openAgentsPrompt](tui.md#tui.forms.run.RunForms.openAgentsPrompt), [tui.forms.run.RunForms.openInitPrompt](tui.md#tui.forms.run.RunForms.openInitPrompt), [tui.forms.run.RunForms.openFmtPrompt](tui.md#tui.forms.run.RunForms.openFmtPrompt), [tui.forms.run.RunForms.openParsePrompt](tui.md#tui.forms.run.RunForms.openParsePrompt), [tui.forms.run.RunForms.openTracePlanPrompt](tui.md#tui.forms.run.RunForms.openTracePlanPrompt), [tui.forms.explain.ExplainForms.open](tui.md#tui.forms.explain.ExplainForms.open), [tui.forms.explain.ExplainForms.openModel](tui.md#tui.forms.explain.ExplainForms.openModel), [tui.forms.explain.ExplainForms.openPlan](tui.md#tui.forms.explain.ExplainForms.openPlan), [tui.forms.draft.DraftForms.openFlow](tui.md#tui.forms.draft.DraftForms.openFlow), [tui.forms.draft.DraftForms.openRules](tui.md#tui.forms.draft.DraftForms.openRules), [tui.forms.draft.DraftForms.openLayout](tui.md#tui.forms.draft.DraftForms.openLayout), [tui.forms.draft.DraftForms.openCode](tui.md#tui.forms.draft.DraftForms.openCode), [tui.forms.draft.DraftForms.openSpecCode](tui.md#tui.forms.draft.DraftForms.openSpecCode), [tui.forms.run.RunForms.openWirePrompt](tui.md#tui.forms.run.RunForms.openWirePrompt), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.app.App.openNodeSearch](tui.md#tui.app.App.openNodeSearch), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.hoverAtCursor](tui.md#tui.app.App.hoverAtCursor), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.save](tui.md#tui.app.App.save), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.draftAtCursor](tui.md#tui.app.App.draftAtCursor), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.actions.applyRecord](tui.md#tui.actions.applyRecord), [tui.app.App.applyCandidate](tui.md#tui.app.App.applyCandidate), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.mergeOrPick](tui.md#tui.app.App.mergeOrPick), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals), [tui.app.App.openNewSpec](tui.md#tui.app.App.openNewSpec), [tui.clip.Clip.reset](tui.md#tui.clip.Clip.reset), [tui.app.packageVersion](tui.md#tui.app.packageVersion), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [findNext](../../src/tui/app.ts#L3378) () → void <!-- internal -->
        <a id="tui.app.App.findNext"></a><br>Moves the cursor to the next case-insensitive match of the current search query, wrapping around the [`tui.app.App.lines`](tui.md#tui.app.App.lines), then scrolls via [`tui.app.App.keepVisible`](tui.md#tui.app.App.keepVisible); if nothing matches, sets a "not found" message. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [textToSpec](../../src/tui/app.ts#L3396) () → void <!-- internal -->
        <a id="tui.app.App.textToSpec"></a><br>Converts the selected lines or the prose paragraph at the cursor into spec items via [`tui.text-to-spec.textToSpec`](tui.md#tui.text-to-spec.textToSpec), using known and planned IDs. Items not already listed after the text are proposed through [`tui.merge-session.MergeSession.start`](tui.md#tui.merge-session.MergeSession.start). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.plannedIds](tui.md#tui.app.plannedIds), [tui.text-to-spec.textToSpec](tui.md#tui.text-to-spec.textToSpec), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start)
    - fn [forNodes](../../src/tui/app.ts#L3443) (doc: Document, visit: (node: Node) => void) → void <!-- internal -->
      <a id="tui.app.forNodes"></a><br>Iterates every section of a document, expands each with [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes), and recursively applies the callback to each node and its descendants via [`lang.ir.walk`](lang.md#lang.ir.walk). Used by [`tui.app.App.lineOfNode`](tui.md#tui.app.App.lineOfNode), [`tui.app.App.nodeAtCursor`](tui.md#tui.app.App.nodeAtCursor), [`tui.app.App.targetNear`](tui.md#tui.app.App.targetNear), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [plannedIds](../../src/tui/app.ts#L3447) (docs: readonly Document[]) → { id: string; kind: string }[] <!-- internal -->
      <a id="tui.app.plannedIds"></a><br>Walks every node of each document via [`tui.app.forNodes`](tui.md#tui.app.forNodes) and collects those with kind "planned" and a non-empty id. Returns their ids paired with the label text, defaulting to "fn" when no label is set. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.app.forNodes](tui.md#tui.app.forNodes)
    - fn [sortFiles](../../src/tui/app.ts#L3458) (files: string[], analysis: Analysis | null) → string[] <!-- internal -->
      <a id="tui.app.sortFiles"></a><br>Hand-written specs first (flows, rules), then generated map files, then `keylang.json`.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [typedRun](../../src/tui/app.ts#L3464) (events: readonly InputEvent[], from: number) → KeyEvent[] <!-- internal -->
      <a id="tui.app.typedRun"></a><br>The keys from `from` on that only type text (letters, Enter, Tab without modifiers).
    - fn [pasteRefusal](../../src/tui/app.ts#L3475) (state: State) → string <!-- internal -->
      <a id="tui.app.pasteRefusal"></a><br>Why pasted text went nowhere, and the way to where it would go: only the editor takes text.
    - fn [pastedRun](../../src/tui/app.ts#L3492) (run: readonly KeyEvent[], editing: boolean) → boolean <!-- internal -->
      <a id="tui.app.pastedRun"></a><br>Whether a run of typed keys from one chunk is text pasted by a terminal without bracketed paste rather than keys. In the editor every run is: one edit, not one per key.
    - fn [printable](../../src/tui/app.ts#L3502) (text: string) → string <!-- internal -->
      <a id="tui.app.printable"></a><br>Text that may go into a spec: escape sequences (colored output pasted from a terminal) and other control characters are removed; tabs and line breaks stay.
    - fn [configState](../../src/tui/app.ts#L3514) (root: string) → { config: ConfigState; clip: boolean | null } <!-- internal -->
      <a id="tui.app.configState"></a><br>`keylang.json` as it is on disk now: missing (with the guessed layout), invalid (with the reason) or valid; and whether it shows the clip — null when an invalid file cannot say, so the clip stays as it was.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.guessLayout](base.md#base.config.guessLayout), [base.config.parseConfig](base.md#base.config.parseConfig), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
    - fn [configErrorCursor](../../src/tui/app.ts#L3535) (text: string, reason: string) → Cursor
      <a id="tui.app.configErrorCursor"></a><br>Where the config error is: the line and column of an invalid JSON message (`line 3 column 5`, else `position N`), or the key the first quoted field path names (`check.trace` → `"check"`, then `"trace"` after it); else the start.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [packageVersion](../../src/tui/app.ts#L3560) () → string <!-- internal -->
      <a id="tui.app.packageVersion"></a><br>The package version, for the "About keylang" palette action.
    - fn [proposalSummary](../../src/tui/app.ts#L3565) (entry: ProposalEntry) → string <!-- internal -->
      <a id="tui.app.proposalSummary"></a><br>The list text of a proposal after its path: kind, a new file, and the hunk count or that it is ignored.
    - type [SidePanel](../../src/tui/app.ts#L3578) = "files" | "nav" | "context" <!-- internal -->
      <a id="tui.app.SidePanel"></a><br>A side panel that can take the focus: files (F2), navigation (F3) or the context in its place (F4).
    - type [LayoutBasis](../../src/tui/app.ts#L3581) <!-- internal -->
      <a id="tui.app.LayoutBasis"></a><br>What a layout draft was made against: keylang.json's buffer (null: none open), the file, the code snapshot.
    - type [DraftOrigin](../../src/tui/app.ts#L3588) <!-- internal -->
      <a id="tui.app.DraftOrigin"></a><br>Where the session was when a draft started: a proposal opens by itself only while this is still so.
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
    - fn [countSuggestion](../../src/tui/assist.ts#L64) (state: Pick<State, "root" | "config">, source: "ghost" | "completion", field: "proposed" | "accepted" | "rejected", shown: number | null | undefined) → void
      <a id="tui.assist.countSuggestion"></a><br>Counts for design §7.3: ghost measured against the deterministic completion; an unwritable `.keylang/` only loses the count. Browse (no `keylang.json`) counts nothing: it writes no file, `.keylang/` included.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats)
    - module [Assist](../../src/tui/assist.ts#L77)
      <a id="tui.assist.Assist"></a><br>Drives the editor's AI assists: after a typing pause it asks the agent for one ghost next line, discarding stale results, and [`tui.assist.Assist.voice`](tui.md#tui.assist.Assist.voice) records, recognizes and inserts speech into the buffer. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - fn [constructor](../../src/tui/assist.ts#L86) (host: AssistHost, microphone: Microphone)
        <a id="tui.assist.Assist.constructor"></a><br>Stores the given host and microphone on the instance so later methods can use them; nothing else happens at construction time. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [state](../../src/tui/assist.ts#L91) () → State <!-- internal -->
        <a id="tui.assist.Assist.state"></a><br>Private getter that returns the current `State` object owned by the host, so the assist logic reads the host's state rather than keeping its own copy. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [waiting](../../src/tui/assist.ts#L96) () → boolean
        <a id="tui.assist.Assist.waiting"></a><br>A ghost request waits for its pause.
      - fn [recordingNow](../../src/tui/assist.ts#L100) () → boolean
        <a id="tui.assist.Assist.recordingNow"></a><br>Reports whether an audio capture is currently in progress by checking that the assistant's `recording` field holds a non-null value. It is a read-only accessor with no side effects. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [close](../../src/tui/assist.ts#L104) () → void
        <a id="tui.assist.Assist.close"></a><br>Tears down the assistant's live state by discarding any pending ghost suggestion via [`tui.assist.Assist.cancelGhost`](tui.md#tui.assist.Assist.cancelGhost) and stopping the active recording's microphone if one exists. Invoked from [`tui.app.App.close`](tui.md#tui.app.App.close) during application shutdown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [spot](../../src/tui/assist.ts#L109) (buffer: Buffer) → Spot <!-- internal -->
        <a id="tui.assist.Assist.spot"></a><br>Builds a lightweight snapshot pairing the buffer's path and version with the current editing mode, so [`tui.assist.Assist.ghostSoon`](tui.md#tui.assist.Assist.ghostSoon) and [`tui.assist.Assist.voice`](tui.md#tui.assist.Assist.voice) can later check whether a request still matches the state it was issued for. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [at](../../src/tui/assist.ts#L114) (spot: Spot) → boolean <!-- internal -->
        <a id="tui.assist.Assist.at"></a><br>The session is where `spot` was taken: the same buffer, its text unchanged, the same mode, no merge on top.
      - fn [stopGhostTimer](../../src/tui/assist.ts#L121) () → void <!-- internal -->
        <a id="tui.assist.Assist.stopGhostTimer"></a><br>Clears any pending ghost-suggestion timeout, nulls the handle, and notifies the host via `settled()` that no more work is in flight; does nothing if no timer is active. Used by [`tui.assist.Assist.cancelGhost`](tui.md#tui.assist.Assist.cancelGhost). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [cancelGhost](../../src/tui/assist.ts#L129) () → void
        <a id="tui.assist.Assist.cancelGhost"></a><br>No ghost request waits for its pause or runs: the one in flight is aborted.
        - calls [tui.assist.Assist.stopGhostTimer](tui.md#tui.assist.Assist.stopGhostTimer)
      - fn [cancelStaleGhost](../../src/tui/assist.ts#L136) () → void
        <a id="tui.assist.Assist.cancelStaleGhost"></a><br>After any input: a ghost request in flight for a place the session has left (buffer, text, mode, line) is aborted.
        - calls [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [suspendGhost](../../src/tui/assist.ts#L145) () → void
        <a id="tui.assist.Assist.suspendGhost"></a><br>An explicit operation starts: a ghost request waiting for its pause is not made, and one already asked is aborted and never shown.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [ghostSoon](../../src/tui/assist.ts#L151) () → void
        <a id="tui.assist.Assist.ghostSoon"></a><br>After a pause with the cursor on a new flow item, ask the agent for one next line; never while an operation runs.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.ghost.ghostSignal](features.md#features.ghost.ghostSignal), [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.ghost.ghostSuggestions](features.md#features.ghost.ghostSuggestions), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [base.config.isCliAgent](base.md#base.config.isCliAgent)
      - fn [acceptGhost](../../src/tui/assist.ts#L197) (ghost: NonNullable<State["ghost"]>) → void
        <a id="tui.assist.Assist.acceptGhost"></a><br>`Tab` on a ghost line: taken only into the text it was shown for.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [dropGhost](../../src/tui/assist.ts#L213) () → void
        <a id="tui.assist.Assist.dropGhost"></a><br>Anything but `Tab` and `Alt+]` drops a shown ghost line.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [voice](../../src/tui/assist.ts#L229) () → void
        <a id="tui.assist.Assist.voice"></a><br>`Ctrl+R`: record until `Ctrl+R` again (or the source ends), recognize, and insert: on a new list item a command («крок …», «коли … тоді …») becomes the item, anything else is free text at the cursor. The speech goes in only while the same buffer, with the same text, is still…
        - calls [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.voice.voiceEngine](features.md#features.voice.voiceEngine), [features.voice.glossary](features.md#features.voice.glossary), [features.voice.transcribeOpenRouter](features.md#features.voice.transcribeOpenRouter), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.insertSpeech](tui.md#tui.assist.Assist.insertSpeech), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [insertSpeech](../../src/tui/assist.ts#L296) (text: string, line: number, analysis: Analysis) → void <!-- internal -->
        <a id="tui.assist.Assist.insertSpeech"></a><br>Writes recognized voice text into the host buffer: on a blank or bare-dash line it replaces that line with spec lines built by [`features.voice.speechToSpec`](features.md#features.voice.speechToSpec) from the snapshot's fn node ids, otherwise it inserts the trimmed text at the cursor, measuring positions with… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [features.voice.speechToSpec](features.md#features.voice.speechToSpec), [tui.width.graphemes](tui.md#tui.width.graphemes)
  - module [background](../../src/tui/background.ts#L1)
    <a id="tui.background"></a><br>Snapshot generation off the UI thread. One long-lived worker builds the map (tree-sitter extraction, graph, render); the caller parses specs and assesses on its own thread, which is fast.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - map [map.map](map.md#map.map)
    - operations [operations.operations](operations.md#operations.operations)
    - analysis-worker [tui.analysis-worker](tui.md#tui.analysis-worker)
    - operation-worker [tui.operation-worker](tui.md#tui.operation-worker)
    - type [Reply](../../src/tui/background.ts#L19) <!-- internal -->
      <a id="tui.background.Reply"></a><br>Message shape sent back from the background worker to the TUI, carrying a request `id` plus either a `MapResult` payload or an `error` string so the caller can match the response to its pending request. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [SnapshotWorker](../../src/tui/background.ts#L25)
      <a id="tui.background.SnapshotWorker"></a><br>Runs map generation on a lazily started worker thread, matching replies to pending promises by request id, and falls back to in-process `generateMap` once the worker fails. Can be terminated during teardown. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - fn [constructor](../../src/tui/background.ts#L29)
        <a id="tui.background.SnapshotWorker.constructor"></a><br>Initializes a per-request registry keyed by numeric id, holding the resolve and reject callbacks of pending promises so background map results can later be matched back to their awaiting callers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [generate](../../src/tui/background.ts#L32) (config: Config, options: { overlay: ReadonlyMap<string, string> }) → Promise<MapResult>
        <a id="tui.background.SnapshotWorker.generate"></a><br>`generateMap` for `analyze({ generate })`; the fact cache is only read.
        - calls [tui.background.SnapshotWorker.start](tui.md#tui.background.SnapshotWorker.start), [map.map.generateMap](map.md#map.map.generateMap)
      - fn [close](../../src/tui/background.ts#L43) () → void
        <a id="tui.background.SnapshotWorker.close"></a><br>Terminates the background worker thread if one exists and clears the reference, without waiting for shutdown. Called during teardown by [`tui.terminal.runTerminal`](tui.md#tui.terminal.runTerminal) and [`tui.web.serveWeb`](tui.md#tui.web.serveWeb). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [start](../../src/tui/background.ts#L48) () → Worker | null <!-- internal -->
        <a id="tui.background.SnapshotWorker.start"></a><br>Lazily spawns the analysis worker thread (choosing the .ts or .js module by runtime), wiring message replies to pending promises and routing errors or non-zero exits to [`tui.background.SnapshotWorker.fail`](tui.md#tui.background.SnapshotWorker.fail). Returns the cached worker, or null if construction throws, marking the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.background.SnapshotWorker.fail](tui.md#tui.background.SnapshotWorker.fail)
      - fn [fail](../../src/tui/background.ts#L76) (error: Error) → void <!-- internal -->
        <a id="tui.background.SnapshotWorker.fail"></a><br>Marks the snapshot worker as permanently failed and drops its reference, then rejects every pending request in the waiting map with the given error and empties it. Invoked from [`tui.background.SnapshotWorker.start`](tui.md#tui.background.SnapshotWorker.start) when the worker cannot be used. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Pending](../../src/tui/background.ts#L84) <!-- internal -->
      <a id="tui.background.Pending"></a><br>Per-request bookkeeping for a worker operation in flight: the resolver, progress and pre-commit callbacks, the abort signal, and a `committing` flag marking when file writes begin and the worker may no longer be terminated. `release` detaches the abort listener once the request… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [OperationWorker](../../src/tui/background.ts#L107)
      <a id="tui.background.OperationWorker"></a><br>Runs shared operations in a worker thread. Every request settles exactly once — with the worker's result, a failure (code 2) when the worker cannot start or dies, or `cancelled` (exit code null) on abort or `close()` — and a late message for a settled request is dropped.
      - fn [constructor](../../src/tui/background.ts#L119) (options: { entry?: URL; workerData?: unknown } = {})
        <a id="tui.background.OperationWorker.constructor"></a><br>`entry` and `workerData` replace the worker module (tests); default: `operation-worker`.
      - fn [run](../../src/tui/background.ts#L127) (request: OperationRequest, context: OperationContext = {}) → Promise<OperationResult>
        <a id="tui.background.OperationWorker.run"></a><br>An `OperationRunner`: the request goes to the worker as cloneable data; progress and the signal stay here.
        - calls [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.background.OperationWorker.start](tui.md#tui.background.OperationWorker.start), [tui.background.messageOf](tui.md#tui.background.messageOf), [tui.background.OperationWorker.cancel](tui.md#tui.background.OperationWorker.cancel), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle)
      - fn [featureBase](../../src/tui/background.ts#L166) (root: string, path: string) → Promise<FeatureBase | null>
        <a id="tui.background.OperationWorker.featureBase"></a><br>`path` (relative to `root`) at the base `keylang feature` takes without `--since` (the merge-base with the main branch, else HEAD), read in the worker: the session's thread starts no git process. A worker that cannot start is a base that could not be read; one stopped before it…
        - calls [tui.background.OperationWorker.start](tui.md#tui.background.OperationWorker.start), [tui.background.messageOf](tui.md#tui.background.messageOf), [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post)
      - fn [close](../../src/tui/background.ts#L189) () → void
        <a id="tui.background.OperationWorker.close"></a><br>Ends the worker and refuses new work. A request before its commit settles as cancelled at once.
        - calls [tui.background.OperationWorker.settleBase](tui.md#tui.background.OperationWorker.settleBase), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop), [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout)
      - fn [cancel](../../src/tui/background.ts#L207) (operationId: number) → void <!-- internal -->
        <a id="tui.background.OperationWorker.cancel"></a><br>Before a commit nothing is written: cancelling terminates the worker and a new one starts with the next request. During a commit the worker is never terminated: it is asked to stop between file steps, and its result — `cancelled` with the steps it did — settles the request.
        - calls [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop)
      - fn [commit](../../src/tui/background.ts#L223) (worker: Worker, operationId: number, plan: CommitPlan | undefined) → void <!-- internal -->
        <a id="tui.background.OperationWorker.commit"></a><br>The worker asks to start writing: the session is told first (`beforeCommit`), then the worker goes ahead — or is cancelled when the signal was aborted meanwhile, with nothing written.
        - calls [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post)
      - fn [post](../../src/tui/background.ts#L243) (call: OperationCall) → void <!-- internal -->
        <a id="tui.background.OperationWorker.post"></a><br>Sends an operation message to the current worker thread if one exists, swallowing any error from a worker that cannot accept it. Serves as the shared send path for [`tui.background.OperationWorker.cancel`](tui.md#tui.background.OperationWorker.cancel), [`tui.background.OperationWorker.close`](tui.md#tui.background.OperationWorker.close), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [start](../../src/tui/background.ts#L251) () → Worker <!-- internal -->
        <a id="tui.background.OperationWorker.start"></a><br>Lazily spawns and caches an unref'd worker thread, routing its replies to [`tui.background.OperationWorker.settleBase`](tui.md#tui.background.OperationWorker.settleBase), [`tui.background.OperationWorker.commit`](tui.md#tui.background.OperationWorker.commit) or [`tui.background.OperationWorker.settle`](tui.md#tui.background.OperationWorker.settle) and ignoring stale ones. Worker errors or exits fail all pending operations… _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.background.OperationWorker.settleBase](tui.md#tui.background.OperationWorker.settleBase), [tui.background.OperationWorker.commit](tui.md#tui.background.OperationWorker.commit), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop)
      - fn [stop](../../src/tui/background.ts#L276) (outcome: (kind: OperationRequest["kind"]) => OperationResult) → void <!-- internal -->
        <a id="tui.background.OperationWorker.stop"></a><br>Terminates the worker and settles what is still pending with `outcome`; a base read in flight is unknown.
        - calls [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [tui.background.OperationWorker.settleBase](tui.md#tui.background.OperationWorker.settleBase)
      - fn [settleBase](../../src/tui/background.ts#L284) (baseId: number, base: FeatureBase | null) → void <!-- internal -->
        <a id="tui.background.OperationWorker.settleBase"></a>
      - fn [settle](../../src/tui/background.ts#L292) (operationId: number, result: OperationResult) → void <!-- internal -->
        <a id="tui.background.OperationWorker.settle"></a><br>Completes a pending background operation: removes and releases it, unrefs the idle worker, terminates the worker if closed with nothing pending, then resolves the caller's promise with the result. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [messageOf](../../src/tui/background.ts#L308) (error: unknown) → string <!-- internal -->
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
      <a id="tui.buffer.setText"></a><br>Replaces a buffer's text, reparses its document via [`tui.buffer.docOf`](tui.md#tui.buffer.docOf), and bumps its version counter. Used by app edits, undo, commits, and merge-session writes to keep buffer content and parse state in sync. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
  - module [clip-chat](../../src/tui/clip-chat.ts#L1)
    <a id="tui.clip-chat"></a><br>What the clip answers in its chat (ADR 0021, .scratch/tui-clip/03–04, 06). A message that starts with `/` is a command, answered from the session or a shared operation without the model.
    - node [external.node](external.md#external.node)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - diag [base.diag](base.md#base.diag)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - files [lang.files](lang.md#lang.files)
    - operations [operations.operations](operations.md#operations.operations)
    - proposals [features.proposals](features.md#features.proposals)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - clip-questions [tui.clip-questions](tui.md#tui.clip-questions)
    - clip-memory [tui.clip-memory](tui.md#tui.clip-memory)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - findings [tui.findings](tui.md#tui.findings)
    - state [tui.state](tui.md#tui.state)
    - llm [features.llm](features.md#features.llm)
    - type [ChatHost](../../src/tui/clip-chat.ts#L34)
      <a id="tui.clip-chat.ChatHost"></a><br>What the chat needs from the session: what the person sees, and the session's one explicit operation.
    - type [ChatCommand](../../src/tui/clip-chat.ts#L61) <!-- internal -->
      <a id="tui.clip-chat.ChatCommand"></a><br>A command of the chat: answered without the model.
    - fn [noModelAnswer](../../src/tui/clip-chat.ts#L90) (reason: string | null) → string
      <a id="tui.clip-chat.noModelAnswer"></a><br>The answer to free text without a model (spec §4.3); `reason` says what is missing when an agent is set.
    - fn [commandRows](../../src/tui/clip-chat.ts#L96) () → string[] <!-- internal -->
      <a id="tui.clip-chat.commandRows"></a><br>The commands as `/help` and an unknown command list them.
    - fn [helpAnswer](../../src/tui/clip-chat.ts#L101) () → string
      <a id="tui.clip-chat.helpAnswer"></a><br>`/help`: the commands and the chat's keys.
      - calls [tui.clip-chat.commandRows](tui.md#tui.clip-chat.commandRows)
    - fn [checkAnswer](../../src/tui/clip-chat.ts#L106) (state: Pick<State, "analysis" | "updating" | "outdated" | "error">) → string
      <a id="tui.clip-chat.checkAnswer"></a><br>`/check`: the session's `✗ ◌ ✓` as the status line counts them, and its first fails with their positions.
      - calls [tui.evidence.totals](tui.md#tui.evidence.totals), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.findingRow](tui.md#tui.findings.findingRow)
    - fn [featureAnswer](../../src/tui/clip-chat.ts#L117) (report: FeatureReport) → string <!-- internal -->
      <a id="tui.clip-chat.featureAnswer"></a><br>`/feature`: what `keylang feature` prints — the gaps and hints, then its closing line.
      - calls [operations.feature.featureSummary](operations.md#operations.feature.featureSummary)
    - fn [cancelled](../../src/tui/clip-chat.ts#L122) (record: OperationRecord) → boolean <!-- internal -->
      <a id="tui.clip-chat.cancelled"></a><br>The operation was cancelled, or ended without a result: nothing was asked, and the log keeps nothing of it.
    - fn [outcomeAnswer](../../src/tui/clip-chat.ts#L127) (record: OperationRecord, text: (result: OperationResult) => string | null) → string <!-- internal -->
      <a id="tui.clip-chat.outcomeAnswer"></a><br>What an operation the chat started ended with: its text, `скасовано`, or the reasons it failed.
      - calls [tui.clip-chat.cancelled](tui.md#tui.clip-chat.cancelled), [tui.clip-chat.failure](tui.md#tui.clip-chat.failure)
    - fn [proposalWritten](../../src/tui/clip-chat.ts#L134) (path: string) → string <!-- internal -->
      <a id="tui.clip-chat.proposalWritten"></a><br>What the chat says of a proposal it wrote. The log keeps its path alone (`**пропозиція:**`): its MERGE may be over by the time the log is read.
    - fn [failure](../../src/tui/clip-chat.ts#L139) (result: OperationResult) → string <!-- internal -->
      <a id="tui.clip-chat.failure"></a><br>Why an operation failed, as its messages say.
    - type [Asked](../../src/tui/clip-chat.ts#L145) <!-- internal -->
      <a id="tui.clip-chat.Asked"></a><br>The model's request in flight: the agent it was sent with, and its record once it started.
    - type [Ending](../../src/tui/clip-chat.ts#L157) <!-- internal -->
      <a id="tui.clip-chat.Ending"></a><br>How an answer ends its exchange in the log: the person's message it answers (null: nothing goes into the log — a cancelled request, or no one asked), the model that answered, the proposal written from it.
    - module [ClipChat](../../src/tui/clip-chat.ts#L168)
      <a id="tui.clip-chat.ClipChat"></a><br>The chat's answers: a command, or the model's reply as the session's `assistant-reply` operation. The conversation is `state.clip.chat`; the eyes follow `state.clip.waiting`.
      - fn [constructor](../../src/tui/clip-chat.ts#L177) (host: ChatHost)
        <a id="tui.clip-chat.ClipChat.constructor"></a>
        - calls [tui.clip-memory.ChatLog](tui.md#tui.clip-memory.ChatLog)
      - fn [state](../../src/tui/clip-chat.ts#L182) () → State <!-- internal -->
        <a id="tui.clip-chat.ClipChat.state"></a>
      - fn [restore](../../src/tui/clip-chat.ts#L187) () → void
        <a id="tui.clip-chat.ClipChat.restore"></a><br>The session starts: the history goes on with today's last conversation in the log.
        - calls [tui.clip-memory.ChatLog.restore](tui.md#tui.clip-memory.ChatLog.restore)
      - fn [said](../../src/tui/clip-chat.ts#L192) (text: string) → void
        <a id="tui.clip-chat.ClipChat.said"></a><br>The person sent `text` (already in the history): a command runs, anything else goes to the model.
        - calls [tui.clip-chat.ClipChat.command](tui.md#tui.clip-chat.ClipChat.command), [tui.clip-chat.ClipChat.ask](tui.md#tui.clip-chat.ClipChat.ask)
      - fn [opened](../../src/tui/clip-chat.ts#L208) () → void
        <a id="tui.clip-chat.ClipChat.opened"></a><br>The person opened the chat or gave it the focus (a click on the clip, F7): with open questions the clip lists them, unless that list is its last message already, and asks the model nothing. The new fails are told then and count no more (spec §4.6).
        - calls [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions), [tui.clip-questions.questionsAnswer](tui.md#tui.clip-questions.questionsAnswer)
      - fn [cancel](../../src/tui/clip-chat.ts#L222) () → void
        <a id="tui.clip-chat.ClipChat.cancel"></a><br>Esc while the model answers: the request is cancelled, nothing is written, and the history says `скасовано`.
        - calls [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer)
      - fn [close](../../src/tui/clip-chat.ts#L235) () → void
        <a id="tui.clip-chat.ClipChat.close"></a><br>The session ends: a request still being looked up is never started.
        - calls [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting)
      - fn [command](../../src/tui/clip-chat.ts#L241) (line: string) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.command"></a>
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.commandRows](tui.md#tui.clip-chat.commandRows)
      - fn [explain](../../src/tui/clip-chat.ts#L250) (arg: string) → void
        <a id="tui.clip-chat.ClipChat.explain"></a><br>`/explain <code|ID>`: the offline `explain` operation, its text as `keylang explain` prints it.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.ClipChat.operation](tui.md#tui.clip-chat.ClipChat.operation)
      - fn [feature](../../src/tui/clip-chat.ts#L257) (arg: string) → void
        <a id="tui.clip-chat.ClipChat.feature"></a><br>`/feature <slug>`: the `feature` operation, its gaps and stage as `keylang feature` prints them.
        - calls [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.ClipChat.operation](tui.md#tui.clip-chat.ClipChat.operation), [tui.clip-chat.featureAnswer](tui.md#tui.clip-chat.featureAnswer)
      - fn [check](../../src/tui/clip-chat.ts#L265) () → void
        <a id="tui.clip-chat.ClipChat.check"></a><br>`/check`: the session's analysis as it is; nothing runs.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.checkAnswer](tui.md#tui.clip-chat.checkAnswer)
      - fn [questions](../../src/tui/clip-chat.ts#L270) () → void
        <a id="tui.clip-chat.ClipChat.questions"></a><br>`/questions`: the open questions with their places, the list the clip says when its chat opens.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-questions.questionsAnswer](tui.md#tui.clip-questions.questionsAnswer), [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions)
      - fn [restart](../../src/tui/clip-chat.ts#L275) () → void
        <a id="tui.clip-chat.ClipChat.restart"></a><br>`/new`: a new conversation; the old one is gone from the window, and the log starts a section.
        - calls [tui.clip-chat.ClipChat.note](tui.md#tui.clip-chat.ClipChat.note), [tui.clip-memory.ChatLog.restart](tui.md#tui.clip-memory.ChatLog.restart), [tui.clip-chat.ClipChat.browsing](tui.md#tui.clip-chat.ClipChat.browsing)
      - fn [help](../../src/tui/clip-chat.ts#L283) () → void
        <a id="tui.clip-chat.ClipChat.help"></a><br>`/help`: the commands and the keys.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.helpAnswer](tui.md#tui.clip-chat.helpAnswer)
      - fn [operation](../../src/tui/clip-chat.ts#L288) (action: string, request: OperationRequest, text: (result: OperationResult) => string | null) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.operation"></a><br>A command's shared operation, as the session runs any: one at a time, after the save step when it reads dirty buffers.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.outcomeAnswer](tui.md#tui.clip-chat.outcomeAnswer), [tui.clip-chat.cancelled](tui.md#tui.clip-chat.cancelled)
      - fn [ask](../../src/tui/clip-chat.ts#L301) () → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.ask"></a><br>Free text: the model's reply as the session's `assistant-reply` operation. Without an analysis, a model or a free slot for the operation it answers at once and asks nothing.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [tui.clip-chat.noModelAnswer](tui.md#tui.clip-chat.noModelAnswer), [tui.clip-chat.ClipChat.start](tui.md#tui.clip-chat.ClipChat.start), [tui.clip-chat.ClipChat.request](tui.md#tui.clip-chat.ClipChat.request)
      - fn [request](../../src/tui/clip-chat.ts#L318) () → AssistantReplyRequest <!-- internal -->
        <a id="tui.clip-chat.ClipChat.request"></a><br>What the model reads, frozen when the message is sent: the conversation, the open buffer with the cursor's line and the ID under it, the F4 pack without the buffer it already shows, the open feature's stage and gaps as the status line has them, and the open questions the clip…
        - calls [features.agent-context.contextText](features.md#features.agent-context.contextText), [tui.clip-questions.questionRows](tui.md#tui.clip-questions.questionRows), [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions)
      - fn [start](../../src/tui/clip-chat.ts#L335) (asked: Asked, request: AssistantReplyRequest) → Promise<void> <!-- internal -->
        <a id="tui.clip-chat.ClipChat.start"></a><br>The model's client is looked up off the key path (as `Ctrl+Space` does); then the operation starts, unless Esc came first.
        - calls [base.diag.errorText](base.md#base.diag.errorText), [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.noModelAnswer](tui.md#tui.clip-chat.noModelAnswer), [tui.clip-chat.ClipChat.replied](tui.md#tui.clip-chat.ClipChat.replied)
      - fn [replied](../../src/tui/clip-chat.ts#L358) (asked: Asked, record: OperationRecord) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.replied"></a><br>The operation ended: its reply, `скасовано`, or the model's error with its reason. Nothing was written.
        - calls [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting), [tui.clip-chat.cancelled](tui.md#tui.clip-chat.cancelled), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.failure](tui.md#tui.clip-chat.failure), [tui.clip-chat.ClipChat.propose](tui.md#tui.clip-chat.ClipChat.propose), [tui.clip-chat.proposalWritten](tui.md#tui.clip-chat.proposalWritten)
      - fn [propose](../../src/tui/clip-chat.ts#L379) ({ path, text }: NonNullable<AssistantReplyPayload["proposal"]>) → string <!-- internal -->
        <a id="tui.clip-chat.ClipChat.propose"></a><br>The model's block as a proposal, by the gate of MCP `apply_diff` (`proposalProblem` with the analysis's generated documents) and the refusals before it: Browse writes nothing, code is the harness's, a target with unsaved edits would come back as hunks reverting them, and a…
        - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [lang.files.existingText](lang.md#lang.files.existingText), [base.diag.errorText](base.md#base.diag.errorText), [tui.clip-chat.proposalWritten](tui.md#tui.clip-chat.proposalWritten)
      - fn [stopWaiting](../../src/tui/clip-chat.ts#L400) () → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.stopWaiting"></a>
      - fn [answer](../../src/tui/clip-chat.ts#L410) (text: string, ending: Ending = { said: this.sent }) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.answer"></a><br>The clip's message ends an exchange: it joins the history, and the history shows its end. The exchange goes into today's log; `ending` names the message it answers — by default the one `said` answers now.
        - calls [tui.clip-chat.proposalWritten](tui.md#tui.clip-chat.proposalWritten), [tui.clip-chat.ClipChat.note](tui.md#tui.clip-chat.ClipChat.note), [tui.clip-memory.ChatLog.exchange](tui.md#tui.clip-memory.ChatLog.exchange), [tui.clip-chat.ClipChat.browsing](tui.md#tui.clip-chat.ClipChat.browsing)
      - fn [note](../../src/tui/clip-chat.ts#L422) (why: string | null) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.note"></a><br>Why the log is not written, said once a session: the clip's message after the answer, and no exchange itself.
      - fn [browsing](../../src/tui/clip-chat.ts#L430) () → boolean <!-- internal -->
        <a id="tui.clip-chat.ClipChat.browsing"></a><br>Browse writes nothing: not the log either.
  - module [clip-memory](../../src/tui/clip-memory.ts#L1)
    <a id="tui.clip-memory"></a><br>The clip's memory (ADR 0021 п. 6, .scratch/tui-clip/06). Where the person left the clip and its window is theirs, not the repository's: it lives in `~/.config/keylang/tui.json` beside `agents.json`, read when a session starts and written atomically when a drag, a keyboard move…
    - node [external.node](external.md#external.node)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - clip [tui.clip](tui.md#tui.clip)
    - fn [tuiFile](../../src/tui/clip-memory.ts#L24) (home: string) → string <!-- internal -->
      <a id="tui.clip-memory.tuiFile"></a><br>`~/.config/keylang/tui.json`: the TUI's settings of its user, beside `agents.json`.
    - type [ClipPlace](../../src/tui/clip-memory.ts#L29)
      <a id="tui.clip-memory.ClipPlace"></a><br>Where the person left the clip and its window, cells from 0; null: where it stands by default.
    - fn [placeOf](../../src/tui/clip-memory.ts#L37) (clip: ClipState) → ClipPlace
      <a id="tui.clip-memory.placeOf"></a><br>The place of the clip and its window as the session has them: as the person set them, whatever a smaller terminal shows.
    - fn [placeClip](../../src/tui/clip-memory.ts#L43) (clip: ClipState, place: ClipPlace) → void
      <a id="tui.clip-memory.placeClip"></a><br>A session starts with the clip and its window where they were left; the frame keeps them inside its terminal.
    - fn [parsePlace](../../src/tui/clip-memory.ts#L56) (file: string, value: unknown) → ClipPlace
      <a id="tui.clip-memory.parsePlace"></a><br>The place a parsed tui.json holds. No `assistant`, `clip` or `window`, or null: the default.
      - calls [tui.clip-memory.isObject](tui.md#tui.clip-memory.isObject), [tui.clip-memory.shown](tui.md#tui.clip-memory.shown), [tui.clip-memory.fieldsOf](tui.md#tui.clip-memory.fieldsOf), [tui.clip-memory.whole](tui.md#tui.clip-memory.whole)
    - fn [fieldsOf](../../src/tui/clip-memory.ts#L78) (file: string, field: string, value: unknown, keys: readonly string[]) → Record<string, unknown> | null <!-- internal -->
      <a id="tui.clip-memory.fieldsOf"></a><br>An object field with only `keys`, or null when it is left out.
      - calls [tui.clip-memory.isObject](tui.md#tui.clip-memory.isObject), [tui.clip-memory.shown](tui.md#tui.clip-memory.shown)
    - fn [whole](../../src/tui/clip-memory.ts#L87) (file: string, field: string, value: unknown, least: number) → number <!-- internal -->
      <a id="tui.clip-memory.whole"></a><br>An integer of at least `least`; a missing one is named as missing.
      - calls [tui.clip-memory.shown](tui.md#tui.clip-memory.shown)
    - fn [readPlace](../../src/tui/clip-memory.ts#L98) (home: string) → { place: ClipPlace; problem: string | null }
      <a id="tui.clip-memory.readPlace"></a><br>The place tui.json holds as a session starts. No file: the default, and nothing to say.
      - calls [tui.clip-memory.tuiFile](tui.md#tui.clip-memory.tuiFile), [lang.files.existingText](lang.md#lang.files.existingText), [base.diag.errorText](base.md#base.diag.errorText), [tui.clip-memory.parsePlace](tui.md#tui.clip-memory.parsePlace)
    - fn [withPlace](../../src/tui/clip-memory.ts#L125) (text: string | null, place: ClipPlace) → string
      <a id="tui.clip-memory.withPlace"></a><br>tui.json's text with the place: `assistant.clip` and `assistant.window` replaced (left out for the default), every other field as it was. Text that is no JSON object is replaced: the place is all it holds then.
      - calls [tui.clip-memory.parsedObject](tui.md#tui.clip-memory.parsedObject), [tui.clip-memory.isObject](tui.md#tui.clip-memory.isObject)
    - fn [parsedObject](../../src/tui/clip-memory.ts#L133) (text: string | null) → Record<string, unknown> <!-- internal -->
      <a id="tui.clip-memory.parsedObject"></a>
      - calls [tui.clip-memory.isObject](tui.md#tui.clip-memory.isObject)
    - fn [writePlace](../../src/tui/clip-memory.ts#L144) (home: string, place: ClipPlace) → void
      <a id="tui.clip-memory.writePlace"></a><br>Writes the place into tui.json atomically, at the target of a link to it; throws, naming the file, when it cannot.
      - calls [tui.clip-memory.tuiFile](tui.md#tui.clip-memory.tuiFile), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [tui.clip-memory.withPlace](tui.md#tui.clip-memory.withPlace), [lang.files.existingText](lang.md#lang.files.existingText), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [two](../../src/tui/clip-memory.ts#L160) (n: number) → string <!-- internal -->
      <a id="tui.clip-memory.two"></a>
    - fn [dayOf](../../src/tui/clip-memory.ts#L163) (date: Date) → string
      <a id="tui.clip-memory.dayOf"></a><br>A local date as the log names its file: `2026-10-06`.
      - calls [tui.clip-memory.two](tui.md#tui.clip-memory.two)
    - fn [timeOf](../../src/tui/clip-memory.ts#L168) (date: Date) → string <!-- internal -->
      <a id="tui.clip-memory.timeOf"></a><br>A local time as a section's heading names it: `14:05`.
      - calls [tui.clip-memory.two](tui.md#tui.clip-memory.two)
    - fn [chatLogPath](../../src/tui/clip-memory.ts#L173) (day: string) → string
      <a id="tui.clip-memory.chatLogPath"></a><br>The log of a day, relative to the root, POSIX.
    - type [ChatExchange](../../src/tui/clip-memory.ts#L178)
      <a id="tui.clip-memory.ChatExchange"></a><br>One exchange as the log keeps it.
    - fn [block](../../src/tui/clip-memory.ts#L199) (label: string, text: string) → string <!-- internal -->
      <a id="tui.clip-memory.block"></a><br>A message as a block: the label and its first line, its other lines indented, its empty lines empty.
    - fn [exchangeBlocks](../../src/tui/clip-memory.ts#L205) (exchange: ChatExchange) → string[] <!-- internal -->
      <a id="tui.clip-memory.exchangeBlocks"></a><br>The blocks of an exchange: the person's message, the clip's answer when it says anything, the proposal written.
      - calls [tui.clip-memory.block](tui.md#tui.clip-memory.block)
    - fn [isHeading](../../src/tui/clip-memory.ts#L213) (line: string) → boolean <!-- internal -->
      <a id="tui.clip-memory.isHeading"></a>
    - fn [heading](../../src/tui/clip-memory.ts#L216) (time: string, agents: readonly string[]) → string <!-- internal -->
      <a id="tui.clip-memory.heading"></a><br>A section's heading: when its conversation started, and the models that answered in it.
    - fn [withAgent](../../src/tui/clip-memory.ts#L221) (text: string, agent: string) → string <!-- internal -->
      <a id="tui.clip-memory.withAgent"></a><br>The log's last section heading names `agent` too: a section started by `/new` or a command learns its model from its first answer.
      - calls [tui.clip-memory.heading](tui.md#tui.clip-memory.heading)
    - fn [appended](../../src/tui/clip-memory.ts#L233) (text: string, blocks: readonly string[]) → string <!-- internal -->
      <a id="tui.clip-memory.appended"></a><br>`text` and the blocks after it, a blank line between any two.
    - fn [withExchange](../../src/tui/clip-memory.ts#L244) (text: string | null, day: string, time: string, exchange: ChatExchange, going: boolean) → string
      <a id="tui.clip-memory.withExchange"></a><br>The log of `day` with an exchange after its last line. `going`: the conversation goes on in the last section, whose heading learns the model that answered; otherwise a section starts at `time` (and an empty log gets its title first).
      - calls [tui.clip-memory.withAgent](tui.md#tui.clip-memory.withAgent), [tui.clip-memory.heading](tui.md#tui.clip-memory.heading), [tui.clip-memory.appended](tui.md#tui.clip-memory.appended), [tui.clip-memory.exchangeBlocks](tui.md#tui.clip-memory.exchangeBlocks)
    - fn [withSection](../../src/tui/clip-memory.ts#L254) (text: string | null, day: string, time: string) → string
      <a id="tui.clip-memory.withSection"></a><br>The log of `day` with a new section at `time`: `/new`.
      - calls [tui.clip-memory.appended](tui.md#tui.clip-memory.appended), [tui.clip-memory.heading](tui.md#tui.clip-memory.heading)
    - fn [lastConversation](../../src/tui/clip-memory.ts#L264) (text: string) → ChatMessage[] | null
      <a id="tui.clip-memory.lastConversation"></a><br>The conversation of the log's last section, as the history shows it: the person's messages and the clip's, a proposal as the clip's line `пропозиція: <path>`. Null when the log has no section.
    - fn [logBlocked](../../src/tui/clip-memory.ts#L307) (root: string, path: string) → string | null <!-- internal -->
      <a id="tui.clip-memory.logBlocked"></a><br>Why the log may not be written at `path` (relative to `root`): null when git ignores it (`git check-ignore -q`, an argument array, no shell) or when `root` is in no repository — with no `.git` above it, whether git runs or not. In a repository git must say so: anything else…
      - calls [tui.clip-memory.inRepository](tui.md#tui.clip-memory.inRepository)
    - fn [inRepository](../../src/tui/clip-memory.ts#L318) (dir: string) → boolean <!-- internal -->
      <a id="tui.clip-memory.inRepository"></a><br>A `.git` in `dir` or above it: a repository, or a worktree's link to one.
    - module [ChatLog](../../src/tui/clip-memory.ts#L332)
      <a id="tui.clip-memory.ChatLog"></a><br>Today's conversation of one session in `.keylang/chat/`. The exchanges of a conversation go into one section; `/new` and a new day start another.
      - fn [constructor](../../src/tui/clip-memory.ts#L340) (root: string, now: () => Date = () => new Date())
        <a id="tui.clip-memory.ChatLog.constructor"></a>
      - fn [restore](../../src/tui/clip-memory.ts#L346) () → ChatMessage[]
        <a id="tui.clip-memory.ChatLog.restore"></a><br>The conversation a session goes on with: the last section of today's log, or none. Reading writes nothing, in Browse too.
        - calls [tui.clip-memory.dayOf](tui.md#tui.clip-memory.dayOf), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [tui.clip-memory.chatLogPath](tui.md#tui.clip-memory.chatLogPath), [tui.clip-memory.lastConversation](tui.md#tui.clip-memory.lastConversation)
      - fn [exchange](../../src/tui/clip-memory.ts#L355) (exchange: ChatExchange, browsing: boolean) → string | null
        <a id="tui.clip-memory.ChatLog.exchange"></a><br>An exchange ended: it goes into the log. Returns what the chat says the first time the log cannot be written, else null.
        - calls [tui.clip-memory.ChatLog.write](tui.md#tui.clip-memory.ChatLog.write), [tui.clip-memory.withExchange](tui.md#tui.clip-memory.withExchange)
      - fn [restart](../../src/tui/clip-memory.ts#L360) (browsing: boolean) → string | null
        <a id="tui.clip-memory.ChatLog.restart"></a><br>`/new`: a new section, so the conversation before it is not the one a new session goes on with.
        - calls [tui.clip-memory.ChatLog.write](tui.md#tui.clip-memory.ChatLog.write)
      - fn [write](../../src/tui/clip-memory.ts#L365) (browsing: boolean, next: (text: string | null, day: string, time: string) => string) → string | null <!-- internal -->
        <a id="tui.clip-memory.ChatLog.write"></a>
        - calls [tui.clip-memory.dayOf](tui.md#tui.clip-memory.dayOf), [tui.clip-memory.chatLogPath](tui.md#tui.clip-memory.chatLogPath), [tui.clip-memory.logBlocked](tui.md#tui.clip-memory.logBlocked), [tui.clip-memory.ChatLog.tell](tui.md#tui.clip-memory.ChatLog.tell), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [tui.clip-memory.timeOf](tui.md#tui.clip-memory.timeOf), [base.diag.errorText](base.md#base.diag.errorText)
      - fn [tell](../../src/tui/clip-memory.ts#L385) (why: string) → string | null <!-- internal -->
        <a id="tui.clip-memory.ChatLog.tell"></a>
    - fn [isObject](../../src/tui/clip-memory.ts#L392) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="tui.clip-memory.isObject"></a>
    - fn [shown](../../src/tui/clip-memory.ts#L396) (value: unknown) → string <!-- internal -->
      <a id="tui.clip-memory.shown"></a>
  - module [clip-questions](../../src/tui/clip-questions.ts#L1)
    <a id="tui.clip-questions"></a><br>The clip's open questions (ADR 0021 п. 2, .scratch/tui-clip/05): the `- ?` lines of the open file, the gaps of the open feature file, and the fails the session's analyses added since the chat was last opened. Lines and gaps are a state; a new fail is an event the opening of the…
    - analyze [map.analyze](map.md#map.analyze)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - state [tui.state](tui.md#tui.state)
    - type [OpenQuestion](../../src/tui/clip-questions.ts#L15)
      <a id="tui.clip-questions.OpenQuestion"></a><br>One open question: where it is, and what it says after the place.
    - fn [failKey](../../src/tui/clip-questions.ts#L22) (fail: Pick<Verdict, "file" | "line" | "message">) → string <!-- internal -->
      <a id="tui.clip-questions.failKey"></a><br>A fail is told from another by its place and its message.
    - fn [failsOf](../../src/tui/clip-questions.ts#L26) (analysis: Analysis) → Verdict[] <!-- internal -->
      <a id="tui.clip-questions.failsOf"></a>
    - fn [newFailsAfter](../../src/tui/clip-questions.ts#L36) (counted: readonly Verdict[], previous: Analysis | null, next: Analysis) → Verdict[]
      <a id="tui.clip-questions.newFailsAfter"></a><br>The new fails once `next` replaced `previous`: those counted so far that `next` still reports, then those it reports that `previous` did not. A fail gone before anyone looked is no question; with no previous analysis (the session's first) every fail was there before the session.
      - calls [tui.clip-questions.failsOf](tui.md#tui.clip-questions.failsOf), [tui.clip-questions.failKey](tui.md#tui.clip-questions.failKey)
    - fn [questionsIn](../../src/tui/clip-questions.ts#L52) (analysis: Analysis, path: string) → OpenQuestion[] <!-- internal -->
      <a id="tui.clip-questions.questionsIn"></a><br>The `- ?` lines of `path` as the analysis read it, unsaved edits included, in the file's order.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [placeOf](../../src/tui/clip-questions.ts#L63) (question: OpenQuestion) → string <!-- internal -->
      <a id="tui.clip-questions.placeOf"></a>
    - fn [openQuestions](../../src/tui/clip-questions.ts#L73) (state: Pick<State, "current" | "analysis" | "featureLine" | "clip">) → OpenQuestion[]
      <a id="tui.clip-questions.openQuestions"></a><br>The open questions now, in the order the chat lists them: the open file's `- ?` lines, the open feature's gaps as the status line has them (the report of `keylang feature`, as of the last save), the new fails. A place an earlier source names is not counted again: a question of…
      - calls [tui.clip-questions.questionsIn](tui.md#tui.clip-questions.questionsIn), [tui.clip-questions.placeOf](tui.md#tui.clip-questions.placeOf)
    - fn [questionRow](../../src/tui/clip-questions.ts#L88) (question: OpenQuestion) → string
      <a id="tui.clip-questions.questionRow"></a><br>One question as the chat and the model read it: `file:line` and its text.
      - calls [tui.clip-questions.placeOf](tui.md#tui.clip-questions.placeOf)
    - fn [questionRows](../../src/tui/clip-questions.ts#L96) (questions: readonly OpenQuestion[], limit = QUESTION_ROWS) → string[]
      <a id="tui.clip-questions.questionRows"></a><br>The first `QUESTION_ROWS` questions as rows, and a last row saying how many more there are.
    - fn [questionsAnswer](../../src/tui/clip-questions.ts#L102) (questions: readonly OpenQuestion[]) → string
      <a id="tui.clip-questions.questionsAnswer"></a><br>What the clip says of the open questions: how many, and one row each up to `QUESTION_ROWS`; or that there are none.
      - calls [tui.clip-questions.questionRows](tui.md#tui.clip-questions.questionRows)
  - module [clip-view](../../src/tui/clip-view.ts#L1)
    <a id="tui.clip-view"></a><br>Drawing the clip (ADR 0021): the figure in the editor's corner and the window of its chat. Where they stand and what the window holds come from `clip.ts`; `view.ts` calls these in its order of layers.
    - clip [tui.clip](tui.md#tui.clip)
    - screen [tui.screen](tui.md#tui.screen)
    - state [tui.state](tui.md#tui.state)
    - theme [tui.theme](tui.md#tui.theme)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - fn [drawClip](../../src/tui/clip-view.ts#L29) (grid: Grid, rect: Rect, clip: ClipState) → void
      <a id="tui.clip-view.drawClip"></a><br>The clip, 5×3 cells over the editor, on the background of what is under it, and the counter of open questions right of its top row (left of it at the terminal's right edge).
      - calls [tui.clip.clipEyes](tui.md#tui.clip.clipEyes), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.clip.counterText](tui.md#tui.clip.counterText), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.clip-view.bgAt](tui.md#tui.clip-view.bgAt)
    - fn [bgAt](../../src/tui/clip-view.ts#L47) (grid: Grid, x: number, y: number) → Style <!-- internal -->
      <a id="tui.clip-view.bgAt"></a><br>The background of a cell, so the clip stands on the line under it.
      - calls [tui.screen.Grid.styleAt](tui.md#tui.screen.Grid.styleAt)
    - fn [drawChat](../../src/tui/clip-view.ts#L58) (grid: Grid, state: State, rect: Rect) → void
      <a id="tui.clip-view.drawChat"></a><br>The chat window: a rounded frame titled with the clip's eyes, `✕` at its right and the keys in its bottom edge; the end of the history (or where it is scrolled to) over the input line. While it takes the keys its frame is lit and the terminal's cursor stands at the end of the…
      - calls [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.clip.clipEyes](tui.md#tui.clip.clipEyes), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.clip.chatLayout](tui.md#tui.clip.chatLayout), [tui.clip.shownHistory](tui.md#tui.clip.shownHistory), [tui.clip.historyRows](tui.md#tui.clip.historyRows), [tui.clip.inputTail](tui.md#tui.clip.inputTail), [tui.width.stringWidth](tui.md#tui.width.stringWidth)
  - module [clip](../../src/tui/clip.ts#L1)
    <a id="tui.clip"></a><br>The clip (ADR 0021): the built-in agent's face in the corner of the editor and the window of its chat. This module keeps where they stand, what lies under a cell of the pointer, what a press, a drag and the keys do to them, and the conversation; `clip-view.ts` draws them and…
    - verdict [check.verdict](check.md#check.verdict)
    - actions [tui.actions](tui.md#tui.actions)
    - input [tui.input](tui.md#tui.input)
    - prompt-keys [tui.prompt-keys](tui.md#tui.prompt-keys)
    - state [tui.state](tui.md#tui.state)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - type [Cell](../../src/tui/clip.ts#L17)
      <a id="tui.clip.Cell"></a><br>A cell of the screen, 0-based.
    - type [ChatMessage](../../src/tui/clip.ts#L23)
      <a id="tui.clip.ChatMessage"></a><br>One message of the conversation: the person's or the clip's.
    - type [ChatState](../../src/tui/clip.ts#L29)
      <a id="tui.clip.ChatState"></a><br>The chat window of the clip: where it stands, whether it has the keys, and the conversation.
    - type [ClipState](../../src/tui/clip.ts#L46)
      <a id="tui.clip.ClipState"></a><br>The clip and its chat, as the session draws them.
    - fn [newClip](../../src/tui/clip.ts#L90) () → ClipState
      <a id="tui.clip.newClip"></a>
    - fn [narrow](../../src/tui/clip.ts#L102) (size: Pick<State, "cols" | "rows">) → boolean <!-- internal -->
      <a id="tui.clip.narrow"></a><br>Whether the terminal is too small for the clip in its corner.
    - fn [assistantShown](../../src/tui/clip.ts#L107) (state: Pick<State, "start" | "results">) → boolean
      <a id="tui.clip.assistantShown"></a><br>The clip and its window take part in the frame: the start screen and the F6 panel cover them.
    - fn [chatTakesKeys](../../src/tui/clip.ts#L115) (state: State) → boolean
      <a id="tui.clip.chatTakesKeys"></a><br>The window takes the keys: open, focused, and nothing modal over it — a form, the help, a save or quit step, MERGE (which takes no clicks either).
      - calls [tui.clip.assistantShown](tui.md#tui.clip.assistantShown)
    - fn [clipEyes](../../src/tui/clip.ts#L121) (clip: Pick<ClipState, "waiting">) → string
      <a id="tui.clip.clipEyes"></a><br>`◕◕` waits; `◔◔` waits for the model's reply.
    - fn [counterText](../../src/tui/clip.ts#L126) (questions: number) → string
      <a id="tui.clip.counterText"></a><br>The counter of open questions next to the clip: nothing for none, `1`–`9`, then `9+`.
    - fn [badgeText](../../src/tui/clip.ts#L131) (clip: Pick<ClipState, "waiting" | "questions">) → string
      <a id="tui.clip.badgeText"></a><br>The badge that stands for the clip in the status line of a narrow terminal.
      - calls [tui.clip.counterText](tui.md#tui.clip.counterText), [tui.clip.clipEyes](tui.md#tui.clip.clipEyes)
    - fn [clipArea](../../src/tui/clip.ts#L137) (state: Pick<State, "cols" | "rows">) → Rect <!-- internal -->
      <a id="tui.clip.clipArea"></a><br>The cells the clip may stand on: the terminal without the title row and the status line.
    - fn [chatArea](../../src/tui/clip.ts#L142) (state: Pick<State, "cols" | "rows">) → Rect <!-- internal -->
      <a id="tui.clip.chatArea"></a><br>The cells the window may take: below the title row, above the detail line, whose messages stay readable.
    - fn [inside](../../src/tui/clip.ts#L147) (rect: Rect, area: Rect) → Rect <!-- internal -->
      <a id="tui.clip.inside"></a><br>`rect` moved as little as it takes to lie inside `area` (where it is wider, from the area's start).
    - fn [contains](../../src/tui/clip.ts#L155) (rect: Rect, cell: Cell) → boolean <!-- internal -->
      <a id="tui.clip.contains"></a>
    - fn [overlaps](../../src/tui/clip.ts#L159) (a: Rect, b: Rect) → boolean <!-- internal -->
      <a id="tui.clip.overlaps"></a>
    - fn [clamp](../../src/tui/clip.ts#L163) (value: number, low: number, high: number) → number <!-- internal -->
      <a id="tui.clip.clamp"></a>
    - fn [clipPlace](../../src/tui/clip.ts#L172) (state: Pick<State, "cols" | "rows" | "clip">, editor: Rect) → Rect <!-- internal -->
      <a id="tui.clip.clipPlace"></a><br>Where the clip stands, whether it is drawn or not: where it was dragged, else the editor's bottom-right corner one cell in; always inside the terminal, so a smaller terminal moves it in.
      - calls [tui.clip.inside](tui.md#tui.clip.inside), [tui.clip.clipArea](tui.md#tui.clip.clipArea)
    - fn [clipRect](../../src/tui/clip.ts#L178) (state: Pick<State, "cols" | "rows" | "clip">, editor: Rect) → Rect | null
      <a id="tui.clip.clipRect"></a><br>The clip in the editor's corner; null when it is off or the terminal is narrow (a badge stands for it).
      - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.clipPlace](tui.md#tui.clip.clipPlace)
    - fn [badgeRect](../../src/tui/clip.ts#L183) (state: Pick<State, "cols" | "rows" | "clip">) → Rect | null
      <a id="tui.clip.badgeRect"></a><br>The badge at the start of the status line of a narrow terminal; null when the clip is in its corner or off.
      - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.clip.badgeText](tui.md#tui.clip.badgeText)
    - fn [clipYields](../../src/tui/clip.ts#L192) (clip: Rect, cursor: Cell | null, popups: readonly Rect[]) → boolean
      <a id="tui.clip.clipYields"></a><br>The clip does not cover what the person works on: a frame with the editor's cursor under it, or a popup over it (the hover), draws no clip.
      - calls [tui.clip.contains](tui.md#tui.clip.contains), [tui.clip.overlaps](tui.md#tui.clip.overlaps)
    - fn [chatRect](../../src/tui/clip.ts#L202) (state: Pick<State, "cols" | "rows" | "clip">, editor: Rect) → Rect
      <a id="tui.clip.chatRect"></a><br>The chat window: where it was moved, else above the clip, its right edge at the clip's (below it when there is no room above); inside the terminal, above the detail line, and no bigger than that. On a narrow terminal it takes the whole width above the detail line.
      - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.chatArea](tui.md#tui.clip.chatArea), [tui.clip.inside](tui.md#tui.clip.inside), [tui.clip.clipPlace](tui.md#tui.clip.clipPlace)
    - type [ChatPart](../../src/tui/clip.ts#L218) = "close" | "move" | "resize" | "window" <!-- internal -->
      <a id="tui.clip.ChatPart"></a><br>What a cell of the window is to the pointer: `✕` folds it, the top edge moves it, the bottom-right corner resizes it, the rest focuses it.
    - fn [chatPart](../../src/tui/clip.ts#L220) (rect: Rect, cell: Cell) → ChatPart | null <!-- internal -->
      <a id="tui.clip.chatPart"></a>
      - calls [tui.clip.contains](tui.md#tui.clip.contains)
    - fn [chatLayout](../../src/tui/clip.ts#L228) (rect: Rect) → { history: Rect; input: Rect }
      <a id="tui.clip.chatLayout"></a><br>The rows of a window: the history over the input line, one cell in from the frame.
    - type [HistoryRow](../../src/tui/clip.ts#L237)
      <a id="tui.clip.HistoryRow"></a><br>A row of the history: a message's, or the thinking row while the model's reply is awaited.
    - fn [historyRows](../../src/tui/clip.ts#L247) (messages: readonly ChatMessage[], width: number, waiting = false) → HistoryRow[]
      <a id="tui.clip.historyRows"></a><br>The conversation as rows of `width` cells: each message after its speaker, its lines wrapped by the shared wrap and indented under its text; while `waiting`, the thinking row last.
      - calls [tui.clip.messageRows](tui.md#tui.clip.messageRows), [tui.clip.speakerRows](tui.md#tui.clip.speakerRows)
    - fn [messageRows](../../src/tui/clip.ts#L257) (message: ChatMessage, width: number) → readonly HistoryRow[] <!-- internal -->
      <a id="tui.clip.messageRows"></a><br>One message's rows; a message never changes once it is in the history.
      - calls [tui.clip.speakerRows](tui.md#tui.clip.speakerRows)
    - fn [speakerRows](../../src/tui/clip.ts#L265) (role: HistoryRow["role"], speaker: string, text: string, width: number) → HistoryRow[] <!-- internal -->
      <a id="tui.clip.speakerRows"></a>
      - calls [tui.width.wrapCells](tui.md#tui.width.wrapCells)
    - fn [shownHistory](../../src/tui/clip.ts#L279) (rows: readonly T[], height: number, scroll: number) → T[]
      <a id="tui.clip.shownHistory"></a><br>The rows `height` rows of the history show, `scroll` rows back from its end; a short history starts at the top.
      - calls [tui.clip.clamp](tui.md#tui.clip.clamp)
    - fn [inputTail](../../src/tui/clip.ts#L285) (input: string, room: number) → string
      <a id="tui.clip.inputTail"></a><br>The end of the input line that fits `room` cells: a longer line scrolls, and `…` marks what it hides on the left.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.sliceCells](tui.md#tui.width.sliceCells)
    - fn [moved](../../src/tui/clip.ts#L291) (rect: Rect, dx: number, dy: number, area: Rect) → Cell <!-- internal -->
      <a id="tui.clip.moved"></a><br>`rect` shifted by the offset, then kept inside `area`: a drag and Alt+arrows move the window the same way.
      - calls [tui.clip.inside](tui.md#tui.clip.inside)
    - fn [resized](../../src/tui/clip.ts#L297) (rect: Rect, dx: number, dy: number, area: Rect) → ChatState["size"] <!-- internal -->
      <a id="tui.clip.resized"></a><br>`rect` grown by the offset from its top-left: at least 30×7, at most to the area's right and bottom edges.
      - calls [tui.clip.clamp](tui.md#tui.clip.clamp)
    - type [ClipHost](../../src/tui/clip.ts#L304)
      <a id="tui.clip.ClipHost"></a><br>What the session gives the clip: its state and where the editor and the drawn clip are now.
    - type [Target](../../src/tui/clip.ts#L321) = "clip" | "badge" | ChatPart <!-- internal -->
      <a id="tui.clip.Target"></a><br>What a press was on.
    - type [Press](../../src/tui/clip.ts#L324) <!-- internal -->
      <a id="tui.clip.Press"></a><br>A press of the left button on the clip, its badge or its window, until the release.
    - module [Clip](../../src/tui/clip.ts#L343)
      <a id="tui.clip.Clip"></a><br>The clip's pointer and keys: a click on it opens the chat, a drag moves it; the window moves by its top edge, resizes by its bottom-right corner, folds on `✕`, and while it has the focus its input line and history take the keys. Every pointer action has a key: F7, Alt+arrows…
      - fn [constructor](../../src/tui/clip.ts#L347) (host: ClipHost)
        <a id="tui.clip.Clip.constructor"></a>
      - fn [state](../../src/tui/clip.ts#L351) () → State <!-- internal -->
        <a id="tui.clip.Clip.state"></a>
      - fn [toggle](../../src/tui/clip.ts#L360) () → void
        <a id="tui.clip.Clip.toggle"></a><br>F7: a folded window opens with the focus, an open one gets the focus, a focused one folds. MERGE takes no clicks and so no F7: it would leave the decisions.
        - calls [tui.clip.Clip.fold](tui.md#tui.clip.Clip.fold), [tui.clip.Clip.open](tui.md#tui.clip.Clip.open)
      - fn [open](../../src/tui/clip.ts#L371) () → void
        <a id="tui.clip.Clip.open"></a><br>A click on the clip or its badge: the chat opens with the focus, and the clip lists the open questions.
        - calls [tui.clip.Clip.focus](tui.md#tui.clip.Clip.focus)
      - fn [focus](../../src/tui/clip.ts#L378) () → void <!-- internal -->
        <a id="tui.clip.Clip.focus"></a><br>The window takes the keys: the editor's completion, which waits for them, goes.
      - fn [fold](../../src/tui/clip.ts#L384) () → void
        <a id="tui.clip.Clip.fold"></a><br>Esc, `✕`, or F7 on the focused window: it folds; the conversation stays, and so does a reply awaited.
      - fn [send](../../src/tui/clip.ts#L396) () → void
        <a id="tui.clip.Clip.send"></a><br>Enter: the input line goes into the history as the person's message, the history shows its end, and the chat answers it. An empty line sends nothing; while the model's reply is awaited nothing is sent and the line stays: one request at a time.
      - fn [reset](../../src/tui/clip.ts#L411) () → void
        <a id="tui.clip.Clip.reset"></a><br>The palette's «Скрепка: повернути на місце»: the clip in its corner, the window above it at its default size.
      - fn [key](../../src/tui/clip.ts#L421) (event: KeyEvent) → void
        <a id="tui.clip.Clip.key"></a><br>A key while the window has the focus (`chatTakesKeys`): its input line, its history and its place.
        - calls [tui.clip.Clip.nudge](tui.md#tui.clip.Clip.nudge), [tui.clip.Clip.fold](tui.md#tui.clip.Clip.fold), [tui.clip.Clip.send](tui.md#tui.clip.Clip.send), [tui.clip.Clip.scrollBy](tui.md#tui.clip.Clip.scrollBy), [tui.clip.Clip.page](tui.md#tui.clip.Clip.page), [tui.prompt-keys.backspaced](tui.md#tui.prompt-keys.backspaced)
      - fn [paste](../../src/tui/clip.ts#L443) (text: string) → void
        <a id="tui.clip.Clip.paste"></a><br>Text pasted while the window has the focus: one line, its breaks and tabs as spaces.
      - fn [mouse](../../src/tui/clip.ts#L455) (event: MouseEvent) → boolean
        <a id="tui.clip.Clip.mouse"></a><br>A pointer event: true when it was the clip's, its badge's or its window's (they are over the editor and the panels); false leaves it to the session. A click is a press and a release in the same cell; a drag moves the clip or the window or resizes the window.
        - calls [tui.clip.assistantShown](tui.md#tui.clip.assistantShown), [tui.clip.Clip.dragTo](tui.md#tui.clip.Clip.dragTo), [tui.clip.Clip.click](tui.md#tui.clip.Clip.click), [tui.clip.Clip.places](tui.md#tui.clip.Clip.places), [tui.clip.Clip.targetAt](tui.md#tui.clip.Clip.targetAt), [tui.clip.Clip.scrollBy](tui.md#tui.clip.Clip.scrollBy), [tui.clip.Clip.rectOf](tui.md#tui.clip.Clip.rectOf)
      - fn [targetAt](../../src/tui/clip.ts#L497) (cell: Cell) → Target | null <!-- internal -->
        <a id="tui.clip.Clip.targetAt"></a><br>What is under a cell: the window is over the clip, the clip over the editor.
        - calls [tui.clip.chatPart](tui.md#tui.clip.chatPart), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.clip.contains](tui.md#tui.clip.contains), [tui.clip.badgeRect](tui.md#tui.clip.badgeRect)
      - fn [rectOf](../../src/tui/clip.ts#L508) (target: Target) → Rect <!-- internal -->
        <a id="tui.clip.Clip.rectOf"></a>
        - calls [tui.clip.clipPlace](tui.md#tui.clip.clipPlace), [tui.clip.badgeRect](tui.md#tui.clip.badgeRect), [tui.clip.chatRect](tui.md#tui.clip.chatRect)
      - fn [dragTo](../../src/tui/clip.ts#L515) (press: Press, cell: Cell) → void <!-- internal -->
        <a id="tui.clip.Clip.dragTo"></a><br>The pointer at `cell` with the button down: the clip or the window follows it, inside the terminal.
        - calls [tui.clip.moved](tui.md#tui.clip.moved), [tui.clip.clipArea](tui.md#tui.clip.clipArea), [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.chatArea](tui.md#tui.clip.chatArea), [tui.clip.resized](tui.md#tui.clip.resized)
      - fn [places](../../src/tui/clip.ts#L531) (target: Target) → boolean <!-- internal -->
        <a id="tui.clip.Clip.places"></a><br>A drag of this moves the clip or the window, or resizes the window; a narrow terminal's window neither moves nor resizes.
        - calls [tui.clip.narrow](tui.md#tui.clip.narrow)
      - fn [click](../../src/tui/clip.ts#L535) (target: Target) → void <!-- internal -->
        <a id="tui.clip.Clip.click"></a>
        - calls [tui.clip.Clip.open](tui.md#tui.clip.Clip.open), [tui.clip.Clip.fold](tui.md#tui.clip.Clip.fold), [tui.clip.Clip.focus](tui.md#tui.clip.Clip.focus)
      - fn [nudge](../../src/tui/clip.ts#L542) (delta: Cell, resize: boolean) → void <!-- internal -->
        <a id="tui.clip.Clip.nudge"></a><br>Alt+arrows move the window a cell, Alt+Shift+arrows resize it: what a drag does.
        - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.clip.resized](tui.md#tui.clip.resized), [tui.clip.chatArea](tui.md#tui.clip.chatArea), [tui.clip.moved](tui.md#tui.clip.moved)
      - fn [page](../../src/tui/clip.ts#L558) () → number <!-- internal -->
        <a id="tui.clip.Clip.page"></a><br>Rows PgUp and PgDn scroll the history by: its height but one.
        - calls [tui.clip.chatLayout](tui.md#tui.clip.chatLayout), [tui.clip.chatRect](tui.md#tui.clip.chatRect)
      - fn [scrollBy](../../src/tui/clip.ts#L563) (rows: number) → void <!-- internal -->
        <a id="tui.clip.Clip.scrollBy"></a><br>The history `rows` rows back (negative: forward), between its start and its end.
        - calls [tui.clip.chatLayout](tui.md#tui.clip.chatLayout), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.clip.historyRows](tui.md#tui.clip.historyRows), [tui.clip.clamp](tui.md#tui.clip.clamp)
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
    - type [Mark](../../src/tui/evidence.ts#L11)
      <a id="tui.evidence.Mark"></a><br>`question`: an open question of a flow (`- ? …`, c4-zoom/11), a mark of its own and no verdict.
    - type [LineEvidence](../../src/tui/evidence.ts#L16)
      <a id="tui.evidence.LineEvidence"></a><br>Per-line evidence shown in the TUI: a mark, ordered criterion verdicts (ok/fail/unverified) with messages, diagnostics, and flags for planned lines and open questions awaiting a human answer. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [worse](../../src/tui/evidence.ts#L29) (a: Mark | null, b: Mark | null) → Mark | null
      <a id="tui.evidence.worse"></a><br>Picks the more severe of two optional marks by comparing their `RANK` values, returning whichever one is present when the other is null and favoring the first on ties. Used by [`tui.evidence.allEvidence`](tui.md#tui.evidence.allEvidence) and [`tui.nav.markOver`](tui.md#tui.nav.markOver) to fold per-line evidence into a single worst mark. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [linesOf](../../src/tui/evidence.ts#L35) (doc: Document, kind: "planned" | "question") → Set<number> <!-- internal -->
      <a id="tui.evidence.linesOf"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [pendingPlanned](../../src/tui/evidence.ts#L48) (analysis: Analysis) → Set<string> <!-- internal -->
      <a id="tui.evidence.pendingPlanned"></a><br>IDs declared `planned` that the snapshot does not have yet: evidence about them is missing by intention.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [allEvidence](../../src/tui/evidence.ts#L66) (analysis: Analysis) → Map<string, Map<number, LineEvidence>> <!-- internal -->
      <a id="tui.evidence.allEvidence"></a><br>Builds a cached per-file, per-line map merging diagnostics, criterion verdicts and planned/question doc lines, then assigns each line its worst mark via [`tui.evidence.worse`](tui.md#tui.evidence.worse), treating unverified verdicts in [`tui.evidence.pendingPlanned`](tui.md#tui.evidence.pendingPlanned) areas as planned. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.evidence.pendingPlanned](tui.md#tui.evidence.pendingPlanned), [tui.evidence.linesOf](tui.md#tui.evidence.linesOf), [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [evidenceOf](../../src/tui/evidence.ts#L118) (analysis: Analysis, path: string) → Map<number, LineEvidence>
      <a id="tui.evidence.evidenceOf"></a><br>Evidence by 1-based line of one document. Lines with nothing reported are absent.
      - calls [tui.evidence.allEvidence](tui.md#tui.evidence.allEvidence)
    - fn [totals](../../src/tui/evidence.ts#L125) (analysis: Analysis) → { fail: number; unverified: number; ok: number }
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
      <a id="tui.findings.visibleFindings"></a><br>Returns only the check results whose verdict is enabled in the given filter map, preserving order. Used by `tui.app.App.selectedFinding`, `tui.app.App.clampFinding`, and [`tui.view.drawFindings`](tui.md#tui.view.drawFindings) to drive the list the user actually sees. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [findingCounts](../../src/tui/findings.ts#L50) (findings: readonly CheckResult[]) → Record<FindingVerdict, number>
      <a id="tui.findings.findingCounts"></a><br>The full counts of the report, independent of the filter: findings, not gutter lines.
    - fn [findingRow](../../src/tui/findings.ts#L57) (result: CheckResult) → string
      <a id="tui.findings.findingRow"></a><br>The list row of one finding after its verdict glyph: code or criterion, position, message.
    - fn [sameResult](../../src/tui/findings.ts#L62) (a: CheckResult, b: CheckResult) → boolean
      <a id="tui.findings.sameResult"></a><br>Whether two findings are the same one of successive analyses: the selection follows it across a rerun.
    - fn [findingDetailText](../../src/tui/findings.ts#L67) (result: CheckResult) → string
      <a id="tui.findings.findingDetailText"></a><br>The details of the selected finding: provenance, snapshot, a K005 reason, then criterion and area.
  - module forms
    <a id="tui.forms"></a>
    - module [draft](../../src/tui/forms/draft.ts#L1)
      <a id="tui.forms.draft"></a><br>The draft forms (design §2.4): a flow, rules or the layers drafted from the code, flows drafted from code (`code-to-spec`), and code from a planned fn (`spec-to-code`). Each shows its fields as rows with the CLI's defaults next to them and, on the selected row, what it means or…
      - node [external.node](external.md#external.node)
      - agent-context [features.agent-context](features.md#features.agent-context)
      - analyze [map.analyze](map.md#map.analyze)
      - config [base.config](base.md#base.config)
      - draft [features.draft](features.md#features.draft)
      - operations [operations.operations](operations.md#operations.operations)
      - proposals [features.proposals](features.md#features.proposals)
      - spec-to-code [features.spec-to-code](features.md#features.spec-to-code)
      - span [base.span](base.md#base.span)
      - buffer [tui.buffer](tui.md#tui.buffer)
      - merge-session [tui.merge-session](tui.md#tui.merge-session)
      - prompt-keys [tui.prompt-keys](tui.md#tui.prompt-keys)
      - state [tui.state](tui.md#tui.state)
      - host [tui.forms.host](tui.md#tui.forms.host)
      - type [Mode](../../src/tui/forms/draft.ts#L24) = "algo" | "hybrid" | "llm" <!-- internal -->
        <a id="tui.forms.draft.Mode"></a>
      - type [Output](../../src/tui/forms/draft.ts#L25) = "proposal" | "preview" <!-- internal -->
        <a id="tui.forms.draft.Output"></a>
      - type [Problem](../../src/tui/forms/draft.ts#L28) <!-- internal -->
        <a id="tui.forms.draft.Problem"></a><br>Why a form cannot run now: the row to select and the reason.
      - fn [modeRow](../../src/tui/forms/draft.ts#L40) (mode: Mode) → FormRow <!-- internal -->
        <a id="tui.forms.draft.modeRow"></a><br>The mode row of a draft: algo, hybrid, llm.
        - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle)
      - fn [outputRow](../../src/tui/forms/draft.ts#L45) (output: Output) → FormRow <!-- internal -->
        <a id="tui.forms.draft.outputRow"></a><br>The output row: a proposal for MERGE, or a preview in F6.
        - calls [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput)
      - fn [otherOutput](../../src/tui/forms/draft.ts#L49) (output: Output) → Output <!-- internal -->
        <a id="tui.forms.draft.otherOutput"></a>
      - fn [runRow](../../src/tui/forms/draft.ts#L54) (output: Output, target: string, preview: string) → FormRow <!-- internal -->
        <a id="tui.forms.draft.runRow"></a><br>The run row of a draft into one target: the proposal it creates, or a preview.
      - fn [modeNote](../../src/tui/forms/draft.ts#L59) (mode: Mode, agent: string | null, problem: string | undefined, says: { algo: string; fallback?: string; model: (agent: string, mode: Mode) => string }) → string <!-- internal -->
        <a id="tui.forms.draft.modeNote"></a><br>The note of a mode row: what algo does, what the model does, and without one what hybrid falls back to or why llm cannot run.
      - fn [problemOn](../../src/tui/forms/draft.ts#L66) (problem: Problem | null, row: string) → string | null <!-- internal -->
        <a id="tui.forms.draft.problemOn"></a><br>The problem as the note of the selected row, when it is the row's own, the run row's or the output row's.
      - fn [flowDraftTarget](../../src/tui/forms/draft.ts#L71) (specDir: string, form: { trigger: string; name: string; into: string }) → { name: string; target: string }
        <a id="tui.forms.draft.flowDraftTarget"></a><br>The name and target a flow draft would use: the typed ones, else the CLI's defaults. `specDir` is relative to the root, POSIX.
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [rulesDraftTarget](../../src/tui/forms/draft.ts#L79) (specDir: string, into: string) → string
        <a id="tui.forms.draft.rulesDraftTarget"></a><br>The target a rules draft would use: the typed one, else the CLI's default.
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [codePosition](../../src/tui/forms/draft.ts#L89) (snapshot: Analysis["snapshot"] | null, form: CodeDraftForm) → { name: string; triggers: string[] } | { error: string; field: "file" | "line" } | null <!-- internal -->
        <a id="tui.forms.draft.codePosition"></a><br>What the snapshot says of a code-to-spec position: the fns it names and the spec's name, or why it names none (the CLI's message); null without a snapshot or a file, and for a git change (git decides when the draft runs). Reads the snapshot only.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [features.draft.codeToSpecTriggers](features.md#features.draft.codeToSpecTriggers), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [codeDraftTarget](../../src/tui/forms/draft.ts#L102) (specDir: string, snapshot: Analysis["snapshot"] | null, form: CodeDraftForm) → string
        <a id="tui.forms.draft.codeDraftTarget"></a><br>The target a code-to-spec draft would use: the typed one, else the CLI's default — `changes` for a git change, the position's name for a file (`<name>` while it names no fn).
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.forms.draft.codePosition](tui.md#tui.forms.draft.codePosition)
      - fn [codeDraftFormOf](../../src/tui/forms/draft.ts#L111) (request: CodeToSpecRequest) → CodeDraftForm
        <a id="tui.forms.draft.codeDraftFormOf"></a><br>The form a code-to-spec request was made from, enough to name its default target.
      - fn [specCodePlace](../../src/tui/forms/draft.ts#L124) (analysis: Analysis | null, form: SpecCodeForm) → ReturnType<typeof plannedCodeTarget> | null
        <a id="tui.forms.draft.specCodePlace"></a><br>Where spec-to-code would put the code, or why it builds none: its own checks on the analysis; null without one or without an ID.
        - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [base.config.toPosix](base.md#base.config.toPosix)
      - module [DraftForms](../../src/tui/forms/draft.ts#L131)
        <a id="tui.forms.draft.DraftForms"></a>
        - fn [constructor](../../src/tui/forms/draft.ts#L134) (host: FormHost)
          <a id="tui.forms.draft.DraftForms.constructor"></a>
        - fn [state](../../src/tui/forms/draft.ts#L138) () → State <!-- internal -->
          <a id="tui.forms.draft.DraftForms.state"></a>
        - fn [keys](../../src/tui/forms/draft.ts#L143) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.draft.DraftForms.keys"></a><br>The keys of the draft forms.
          - calls [tui.prompt-keys.fieldOf](tui.md#tui.prompt-keys.fieldOf), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow), [tui.forms.draft.DraftForms.changeFlow](tui.md#tui.forms.draft.DraftForms.changeFlow), [tui.forms.draft.DraftForms.submitFlow](tui.md#tui.forms.draft.DraftForms.submitFlow), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules), [tui.forms.draft.DraftForms.changeRules](tui.md#tui.forms.draft.DraftForms.changeRules), [tui.forms.draft.DraftForms.submitRules](tui.md#tui.forms.draft.DraftForms.submitRules), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout), [tui.forms.draft.DraftForms.changeLayout](tui.md#tui.forms.draft.DraftForms.changeLayout), [tui.forms.draft.DraftForms.submitLayout](tui.md#tui.forms.draft.DraftForms.submitLayout), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode), [tui.forms.draft.DraftForms.changeCode](tui.md#tui.forms.draft.DraftForms.changeCode), [tui.forms.draft.DraftForms.submitCode](tui.md#tui.forms.draft.DraftForms.submitCode), [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode), [tui.forms.draft.DraftForms.changeSpecCode](tui.md#tui.forms.draft.DraftForms.changeSpecCode), [tui.forms.draft.DraftForms.submitSpecCode](tui.md#tui.forms.draft.DraftForms.submitSpecCode)
        - fn [firstMode](../../src/tui/forms/draft.ts#L199) () → Mode <!-- internal -->
          <a id="tui.forms.draft.DraftForms.firstMode"></a><br>The mode a draft starts in: the CLI's default (hybrid) with a model, else algo.
        - fn [targetProblem](../../src/tui/forms/draft.ts#L204) (target: string, field: string) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.targetProblem"></a><br>Why a draft may not propose into `target` now: the proposal rules, a proposal waiting there, unsaved edits of it.
          - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
        - fn [refuse](../../src/tui/forms/draft.ts#L214) (prompt: Prompt, problem: Problem, label: string, refresh: () => void) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refuse"></a><br>A form that may not run keeps its values: the row of the problem is selected, the reason is the message.
          - calls [tui.prompt-keys.selectProblem](tui.md#tui.prompt-keys.selectProblem)
        - fn [openFlow](../../src/tui/forms/draft.ts#L228) () → void
          <a id="tui.forms.draft.DraftForms.openFlow"></a><br>The draft-flow form (design §2.4): the fn under the cursor, else the trigger of the flow under the cursor, is the visible default; name and target stay empty for the CLI's defaults, shown next to them. The output is a proposal unless preview is chosen; the mode is the CLI's…
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow)
        - fn [triggerMatches](../../src/tui/forms/draft.ts#L237) (typed: string) → string[] <!-- internal -->
          <a id="tui.forms.draft.DraftForms.triggerMatches"></a><br>The callable IDs of the current snapshot that contain the typed trigger, at most eight.
        - fn [flowProblem](../../src/tui/forms/draft.ts#L248) (form: DraftForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.flowProblem"></a><br>Why a draft may not start now, or null: the checks the CLI makes first, then a pending proposal and an unsaved target (a proposal only).
          - calls [tui.forms.draft.DraftForms.targetProblem](tui.md#tui.forms.draft.DraftForms.targetProblem), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget)
        - fn [refreshFlow](../../src/tui/forms/draft.ts#L262) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshFlow"></a><br>The rows, the root, and a note on the selected row; nothing is read but the snapshot and the target's state.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.DraftForms.triggerMatches](tui.md#tui.forms.draft.DraftForms.triggerMatches), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.runRow](tui.md#tui.forms.draft.runRow), [tui.forms.draft.DraftForms.flowProblem](tui.md#tui.forms.draft.DraftForms.flowProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeFlow](../../src/tui/forms/draft.ts#L307) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeFlow"></a><br>←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview).
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow)
        - fn [submitFlow](../../src/tui/forms/draft.ts#L322) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitFlow"></a><br>Enter in the draft form. On a match it takes that trigger; elsewhere a problem keeps the form (the typed values stay) with the field selected, else the draft runs as the session's operation.
          - calls [tui.prompt-keys.selectRow](tui.md#tui.prompt-keys.selectRow), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow), [tui.forms.draft.DraftForms.flowProblem](tui.md#tui.forms.draft.DraftForms.flowProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [base.config.toPosix](base.md#base.config.toPosix), [features.agent-context.contextText](features.md#features.agent-context.contextText)
        - fn [openRules](../../src/tui/forms/draft.ts#L358) () → void
          <a id="tui.forms.draft.DraftForms.openRules"></a><br>The draft-rules form (design §2.4 `draft rules`): the target (empty: the CLI's `<dir>/rules.md`, shown next to it), the mode (hybrid with a model, else algo) and preview or proposal.
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules)
        - fn [rulesProblem](../../src/tui/forms/draft.ts#L364) (form: RulesDraftForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.rulesProblem"></a><br>Why a rules draft may not start now, or null: a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target.
          - calls [tui.forms.draft.DraftForms.targetProblem](tui.md#tui.forms.draft.DraftForms.targetProblem), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget)
        - fn [refreshRules](../../src/tui/forms/draft.ts#L371) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshRules"></a><br>The rows, the root and what the model sees, and a note on the selected row.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.runRow](tui.md#tui.forms.draft.runRow), [tui.forms.draft.DraftForms.rulesProblem](tui.md#tui.forms.draft.DraftForms.rulesProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeRules](../../src/tui/forms/draft.ts#L402) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeRules"></a><br>←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview).
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules)
        - fn [submitRules](../../src/tui/forms/draft.ts#L413) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitRules"></a><br>Enter in the rules form: a problem keeps the form with the field selected, else the draft runs as the session's operation.
          - calls [tui.forms.draft.DraftForms.rulesProblem](tui.md#tui.forms.draft.DraftForms.rulesProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules), [base.config.toPosix](base.md#base.config.toPosix)
        - fn [openCode](../../src/tui/forms/draft.ts#L442) () → void
          <a id="tui.forms.draft.DraftForms.openCode"></a><br>The code-to-spec form (design §2.4 `code-to-spec`): the source is a file — the code viewer's file and line, else the file (and, for a fn, the line) of the ID under the cursor, else empty fields and a list of the source files — or the git changes since a ref (`HEAD`). An empty…
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode)
        - fn [sourceMatches](../../src/tui/forms/draft.ts#L459) (typed: string) → string[] <!-- internal -->
          <a id="tui.forms.draft.DraftForms.sourceMatches"></a><br>The source files of the current snapshot that declare a fn and contain the typed text, at most eight.
        - fn [codeProblem](../../src/tui/forms/draft.ts#L469) (form: CodeDraftForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.codeProblem"></a><br>Why the draft may not start now, or null: the source's fields, a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target.
          - calls [tui.forms.draft.codePosition](tui.md#tui.forms.draft.codePosition), [tui.forms.draft.DraftForms.targetProblem](tui.md#tui.forms.draft.DraftForms.targetProblem), [tui.forms.draft.codeDraftTarget](tui.md#tui.forms.draft.codeDraftTarget)
        - fn [refreshCode](../../src/tui/forms/draft.ts#L488) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshCode"></a><br>The rows, the root, and a note on the selected row: what the source names, the mode, the target's state or why it cannot run.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.codeDraftTarget](tui.md#tui.forms.draft.codeDraftTarget), [tui.forms.draft.DraftForms.sourceMatches](tui.md#tui.forms.draft.DraftForms.sourceMatches), [base.config.toPosix](base.md#base.config.toPosix), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.runRow](tui.md#tui.forms.draft.runRow), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.DraftForms.codeProblem](tui.md#tui.forms.draft.DraftForms.codeProblem), [tui.forms.draft.codePosition](tui.md#tui.forms.draft.codePosition), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeCode](../../src/tui/forms/draft.ts#L549) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeCode"></a><br>←→ on the source row (a file or the git changes), the mode row (algo, hybrid, llm) or the output row (proposal or preview).
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode)
        - fn [codeRequest](../../src/tui/forms/draft.ts#L562) (form: CodeDraftForm) → CodeToSpecRequest <!-- internal -->
          <a id="tui.forms.draft.DraftForms.codeRequest"></a><br>The request of the form: only the chosen source's fields; the model's context as F4 shows it now.
          - calls [base.config.toPosix](base.md#base.config.toPosix), [features.agent-context.contextText](features.md#features.agent-context.contextText)
        - fn [submitCode](../../src/tui/forms/draft.ts#L584) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitCode"></a><br>Enter in the code-to-spec form. On a match it takes that file and moves to the line; elsewhere a problem keeps the form (the typed values stay) with the field selected, else the draft runs as the session's operation.
          - calls [tui.prompt-keys.selectRow](tui.md#tui.prompt-keys.selectRow), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode), [tui.forms.draft.DraftForms.codeProblem](tui.md#tui.forms.draft.DraftForms.codeProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [tui.forms.draft.DraftForms.codeRequest](tui.md#tui.forms.draft.DraftForms.codeRequest)
        - fn [openSpecCode](../../src/tui/forms/draft.ts#L610) (id?: string) → void
          <a id="tui.forms.draft.DraftForms.openSpecCode"></a><br>The spec-to-code form (design §2.4 `spec-to-code`): the planned fn — given (a feature's planned gap), else the one under the cursor, else typed or picked from the planned fns — the code file (empty: the module's, shown next to it), the mode (the offline template unless llm is…
          - calls [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode)
        - fn [plannedMatches](../../src/tui/forms/draft.ts#L621) (typed: string) → string[] <!-- internal -->
          <a id="tui.forms.draft.DraftForms.plannedMatches"></a><br>The planned fns containing the typed text, at most eight; none once it is one.
        - fn [specCodeProblem](../../src/tui/forms/draft.ts#L629) (form: SpecCodeForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.specCodeProblem"></a><br>Why spec-to-code may not start now, or null: an ID, spec-to-code's own checks, a model llm needs, then (a proposal only) a proposal waiting for the code file.
          - calls [tui.forms.draft.specCodePlace](tui.md#tui.forms.draft.specCodePlace)
        - fn [refreshSpecCode](../../src/tui/forms/draft.ts#L641) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshSpecCode"></a><br>The rows, the root and what the template is, and a note on the selected row.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.specCodePlace](tui.md#tui.forms.draft.specCodePlace), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.DraftForms.plannedMatches](tui.md#tui.forms.draft.DraftForms.plannedMatches), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.DraftForms.specCodeProblem](tui.md#tui.forms.draft.DraftForms.specCodeProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeSpecCode](../../src/tui/forms/draft.ts#L694) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeSpecCode"></a><br>←→ on the mode row (algo or llm) or the output row (proposal or preview).
          - calls [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode)
        - fn [submitSpecCode](../../src/tui/forms/draft.ts#L705) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitSpecCode"></a><br>Enter in the form: a match takes that ID; elsewhere a problem keeps the form with the field selected, else spec-to-code runs as the session's operation.
          - calls [tui.prompt-keys.selectRow](tui.md#tui.prompt-keys.selectRow), [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode), [tui.forms.draft.DraftForms.specCodeProblem](tui.md#tui.forms.draft.DraftForms.specCodeProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [base.config.toPosix](base.md#base.config.toPosix)
        - fn [openLayout](../../src/tui/forms/draft.ts#L725) () → void
          <a id="tui.forms.draft.DraftForms.openLayout"></a><br>The draft-layout form (design §2.4 `draft map`): the mode (hybrid with a model, else algo), then run; nothing is written.
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout)
        - fn [layoutProblem](../../src/tui/forms/draft.ts#L731) (mode: Mode) → string | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.layoutProblem"></a><br>Why a layout draft may not start: llm needs a model.
        - fn [refreshLayout](../../src/tui/forms/draft.ts#L735) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshLayout"></a>
          - calls [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.forms.draft.DraftForms.layoutProblem](tui.md#tui.forms.draft.DraftForms.layoutProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote)
        - fn [changeLayout](../../src/tui/forms/draft.ts#L754) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeLayout"></a>
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout)
        - fn [submitLayout](../../src/tui/forms/draft.ts#L761) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitLayout"></a>
          - calls [tui.forms.draft.DraftForms.layoutProblem](tui.md#tui.forms.draft.DraftForms.layoutProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout)
    - module [explain](../../src/tui/forms/explain.ts#L1)
      <a id="tui.forms.explain"></a><br>The explain forms: offline help of a diagnostic code or a node's summary (`explain`), the model's explanation of one ID (`explain <id> --llm`), and the inventory of what needs explaining with the batch of briefs (`explain --stale`, `explain --missing|--stale [--llm]`). They…
      - agent-cli [features.agent-cli](features.md#features.agent-cli)
      - explain [features.explain](features.md#features.explain)
      - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
      - explain-llm [features.explain-llm](features.md#features.explain-llm)
      - explain-offline [features.explain-offline](features.md#features.explain-offline)
      - explanations [map.explanations](map.md#map.explanations)
      - node-search [features.node-search](features.md#features.node-search)
      - operations [operations.operations](operations.md#operations.operations)
      - span [base.span](base.md#base.span)
      - evidence [tui.evidence](tui.md#tui.evidence)
      - prompt-keys [tui.prompt-keys](tui.md#tui.prompt-keys)
      - records [tui.reports.records](tui.md#tui.reports.records)
      - state [tui.state](tui.md#tui.state)
      - host [tui.forms.host](tui.md#tui.forms.host)
      - llm [features.llm](features.md#features.llm)
      - module [ExplainForms](../../src/tui/forms/explain.ts#L29)
        <a id="tui.forms.explain.ExplainForms"></a>
        - fn [constructor](../../src/tui/forms/explain.ts#L34) (host: FormHost)
          <a id="tui.forms.explain.ExplainForms.constructor"></a>
        - fn [state](../../src/tui/forms/explain.ts#L38) () → State <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.state"></a>
        - fn [keys](../../src/tui/forms/explain.ts#L43) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.explain.ExplainForms.keys"></a><br>The keys of the explain forms.
          - calls [tui.prompt-keys.promptText](tui.md#tui.prompt-keys.promptText), [tui.prompt-keys.fieldOf](tui.md#tui.prompt-keys.fieldOf), [tui.forms.explain.ExplainForms.refresh](tui.md#tui.forms.explain.ExplainForms.refresh), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note), [tui.forms.explain.ExplainForms.changePlanList](tui.md#tui.forms.explain.ExplainForms.changePlanList), [tui.forms.explain.ExplainForms.changeDetail](tui.md#tui.forms.explain.ExplainForms.changeDetail), [tui.forms.explain.ExplainForms.submit](tui.md#tui.forms.explain.ExplainForms.submit)
        - fn [open](../../src/tui/forms/explain.ts#L65) () → void
          <a id="tui.forms.explain.ExplainForms.open"></a><br>The explain form: the ID under the cursor, else the code of the line's diagnostic, is the visible default.
          - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.forms.explain.ExplainForms.refresh](tui.md#tui.forms.explain.ExplainForms.refresh)
        - fn [refresh](../../src/tui/forms/explain.ts#L77) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.refresh"></a><br>The codes or the IDs of the session's snapshot matching the typed text (the exact one first).
          - calls [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note)
        - fn [subject](../../src/tui/forms/explain.ts#L96) () → string <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.subject"></a><br>The subject Enter explains: the selected entry of the list, else the typed text.
        - fn [note](../../src/tui/forms/explain.ts#L101) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.note"></a>
          - calls [tui.forms.explain.ExplainForms.modelNote](tui.md#tui.forms.explain.ExplainForms.modelNote), [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [tui.forms.explain.ExplainForms.subject](tui.md#tui.forms.explain.ExplainForms.subject), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation)
        - fn [submit](../../src/tui/forms/explain.ts#L121) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.submit"></a><br>Enter in the explain form: the subject runs as the session's operation; an empty one keeps the form.
          - calls [tui.forms.explain.ExplainForms.submitPlan](tui.md#tui.forms.explain.ExplainForms.submitPlan), [tui.forms.explain.ExplainForms.subject](tui.md#tui.forms.explain.ExplainForms.subject), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode)
        - fn [loadModel](../../src/tui/forms/explain.ts#L143) (stillOpen: () => boolean, again: () => void) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.loadModel"></a><br>Loads the model client off the key path, then shows the form's note again with what it says.
        - fn [openModel](../../src/tui/forms/explain.ts#L159) () → void
          <a id="tui.forms.explain.ExplainForms.openModel"></a><br>The model's explanation form: the ID under the cursor and the detail of keylang.json by default.
          - calls [tui.forms.explain.ExplainForms.refresh](tui.md#tui.forms.explain.ExplainForms.refresh), [tui.forms.explain.ExplainForms.loadModel](tui.md#tui.forms.explain.ExplainForms.loadModel), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note)
        - fn [changeDetail](../../src/tui/forms/explain.ts#L171) (step: number) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.changeDetail"></a><br>←→ in the model's form: short, full, brief.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note)
        - fn [modelNote](../../src/tui/forms/explain.ts#L183) (detail: ExplanationDetail) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.modelNote"></a><br>What Enter would do, by the session's analysis: read a fresh saved answer (no request), ask the model once and save, or — no model — show the summary and the saved answer; with the detail, the language and the agent.
          - calls [tui.forms.explain.ExplainForms.subject](tui.md#tui.forms.explain.ExplainForms.subject), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswerMiss](features.md#features.explain-offline.savedAnswerMiss), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
        - fn [openPlan](../../src/tui/forms/explain.ts#L224) (row: "list" | "batch" = "list") → void
          <a id="tui.forms.explain.ExplainForms.openPlan"></a><br>The inventory form: the stale saved explanations by default; limit and jobs empty (every candidate, 4).
          - calls [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [tui.forms.explain.ExplainForms.loadModel](tui.md#tui.forms.explain.ExplainForms.loadModel)
        - fn [planRequest](../../src/tui/forms/explain.ts#L236) (form: ExplainPlanForm) → ExplainPlanRequest | { field: "limit" | "jobs"; text: string } <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.planRequest"></a><br>The request the form makes, or the field it refuses with the CLI's message.
          - calls [features.explain-inventory.positiveIntegerProblem](features.md#features.explain-inventory.positiveIntegerProblem)
        - fn [refreshPlan](../../src/tui/forms/explain.ts#L248) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.refreshPlan"></a><br>The rows (the list; limit and jobs for a brief plan; run), what the selected list is and is not, and a note on the selected row.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.explain.ExplainForms.planRequest](tui.md#tui.forms.explain.ExplainForms.planRequest), [tui.forms.explain.ExplainForms.batchRequest](tui.md#tui.forms.explain.ExplainForms.batchRequest), [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.forms.explain.ExplainForms.batchAsk](tui.md#tui.forms.explain.ExplainForms.batchAsk), [map.explanations.explainDir](map.md#map.explanations.explainDir)
        - fn [changePlanList](../../src/tui/forms/explain.ts#L286) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.changePlanList"></a><br>←→ on the list row.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan)
        - fn [submitPlan](../../src/tui/forms/explain.ts#L295) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.submitPlan"></a><br>Enter: a refused limit or jobs keeps the form with the field selected, else the inventory runs as the session's operation.
          - calls [tui.forms.explain.ExplainForms.planRequest](tui.md#tui.forms.explain.ExplainForms.planRequest), [tui.prompt-keys.selectProblem](tui.md#tui.prompt-keys.selectProblem), [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [tui.forms.explain.ExplainForms.batchRequest](tui.md#tui.forms.explain.ExplainForms.batchRequest)
        - fn [batchRequest](../../src/tui/forms/explain.ts#L311) (plan: ExplainPlanRequest) → ExplainBatchRequest <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.batchRequest"></a><br>The batch of a brief plan's form: the same list, limit and jobs, no estimate.
          - calls [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs)
        - fn [batchAsk](../../src/tui/forms/explain.ts#L318) () → string <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.batchAsk"></a><br>Who the batch row would ask, by the session's configuration, or why no request can be made.
    - module [export](../../src/tui/forms/export.ts#L1)
      <a id="tui.forms.export"></a><br>The export forms: a finished report saved to a file (`export`), and the C4 diagram of the map (`export c4`). Each shows the target as it is now — refused by the write policy before it is read — and writes nothing before Enter; Esc writes nothing.
      - node [external.node](external.md#external.node)
      - c4-export [map.c4-export](map.md#map.c4-export)
      - check-format [features.check-format](features.md#features.check-format)
      - config [base.config](base.md#base.config)
      - operations [operations.operations](operations.md#operations.operations)
      - parse-format [lang.parse-format](lang.md#lang.parse-format)
      - actions [tui.actions](tui.md#tui.actions)
      - buffer [tui.buffer](tui.md#tui.buffer)
      - disk [tui.disk](tui.md#tui.disk)
      - merge-session [tui.merge-session](tui.md#tui.merge-session)
      - prompt-keys [tui.prompt-keys](tui.md#tui.prompt-keys)
      - records [tui.reports.records](tui.md#tui.reports.records)
      - state [tui.state](tui.md#tui.state)
      - host [tui.forms.host](tui.md#tui.forms.host)
      - fn [defaultExportPath](../../src/tui/forms/export.ts#L23) (kind: OperationRecord["kind"], format: ExportFormat) → string <!-- internal -->
        <a id="tui.forms.export.defaultExportPath"></a><br>Where an export goes unless a path is typed: `.keylang/export/check.json`, `.keylang/export/edge.txt`, `.keylang/export/parse.txt`, `.keylang/export/trace-plan.json`.
      - fn [exportSourceOf](../../src/tui/forms/export.ts#L30) (record: OperationRecord, format: ExportFormat) → ExportSource | null <!-- internal -->
        <a id="tui.forms.export.exportSourceOf"></a><br>The typed report of a finished record in a format, or null when it has none.
        - calls [features.check-format.isCheckFormat](features.md#features.check-format.isCheckFormat)
      - module [ExportForms](../../src/tui/forms/export.ts#L45)
        <a id="tui.forms.export.ExportForms"></a>
        - fn [constructor](../../src/tui/forms/export.ts#L48) (host: FormHost)
          <a id="tui.forms.export.ExportForms.constructor"></a>
        - fn [state](../../src/tui/forms/export.ts#L52) () → State <!-- internal -->
          <a id="tui.forms.export.ExportForms.state"></a>
        - fn [keys](../../src/tui/forms/export.ts#L57) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.export.ExportForms.keys"></a><br>The keys of the export forms.
          - calls [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt), [tui.forms.export.ExportForms.changeExportFormat](tui.md#tui.forms.export.ExportForms.changeExportFormat), [tui.forms.export.ExportForms.submitExport](tui.md#tui.forms.export.ExportForms.submitExport), [tui.forms.export.ExportForms.refreshC4Prompt](tui.md#tui.forms.export.ExportForms.refreshC4Prompt), [tui.forms.export.ExportForms.changeC4Choice](tui.md#tui.forms.export.ExportForms.changeC4Choice), [tui.forms.export.ExportForms.submitC4](tui.md#tui.forms.export.ExportForms.submitC4)
        - fn [openExportPrompt](../../src/tui/forms/export.ts#L84) () → void
          <a id="tui.forms.export.ExportForms.openExportPrompt"></a><br>The export form of the report `exportRecord` picks (design §2.6): the format, the path (a default per format under `.keylang/export/`) and the target as it is now. Nothing is written before Save; Esc writes nothing.
          - calls [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.forms.export.defaultExportPath](tui.md#tui.forms.export.defaultExportPath), [tui.forms.export.ExportForms.exportBytes](tui.md#tui.forms.export.ExportForms.exportBytes), [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt)
        - fn [exportBytes](../../src/tui/forms/export.ts#L111) (record: OperationRecord, format: ExportFormat) → number <!-- internal -->
          <a id="tui.forms.export.ExportForms.exportBytes"></a><br>The bytes of the report in a format: exactly what the CLI prints, from the record's payload.
          - calls [tui.forms.export.exportSourceOf](tui.md#tui.forms.export.exportSourceOf), [operations.export.exportText](operations.md#operations.export.exportText)
        - fn [exportProblem](../../src/tui/forms/export.ts#L117) (path: string) → string | null <!-- internal -->
          <a id="tui.forms.export.ExportForms.exportProblem"></a><br>Why the typed target cannot receive the export now, or null. A dirty buffer of it is never written under.
          - calls [operations.export.exportTargetProblem](operations.md#operations.export.exportTargetProblem), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
        - fn [refreshExportPrompt](../../src/tui/forms/export.ts#L131) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.refreshExportPrompt"></a><br>The rows of the form: the report (and whether it is outdated), the target as it is now, and what Save writes. Reading only.
          - calls [tui.forms.export.ExportForms.exportProblem](tui.md#tui.forms.export.ExportForms.exportProblem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.reports.records.recordSummary](tui.md#tui.reports.records.recordSummary)
        - fn [changeExportFormat](../../src/tui/forms/export.ts#L166) (delta: 1 | -1) → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.changeExportFormat"></a><br>←→ in the export form: the next format; an untouched default path follows it.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.export.defaultExportPath](tui.md#tui.forms.export.defaultExportPath), [tui.forms.export.ExportForms.exportBytes](tui.md#tui.forms.export.ExportForms.exportBytes), [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt)
        - fn [submitExport](../../src/tui/forms/export.ts#L182) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.submitExport"></a><br>Enter in the export form, on any row: the report as it ran goes to the shown target through the file protocol. A refusal keeps the form; the target is expected as the form last showed it.
          - calls [tui.forms.export.exportSourceOf](tui.md#tui.forms.export.exportSourceOf), [tui.forms.export.ExportForms.exportProblem](tui.md#tui.forms.export.ExportForms.exportProblem), [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt)
        - fn [openC4Prompt](../../src/tui/forms/export.ts#L212) () → void
          <a id="tui.forms.export.ExportForms.openC4Prompt"></a><br>The C4 form (c4-zoom/12): the format, the level, one layer or all, and the file to write. Without a file the diagram shows in F6 and nothing is written.
          - calls [tui.forms.export.ExportForms.refreshC4Prompt](tui.md#tui.forms.export.ExportForms.refreshC4Prompt)
        - fn [c4Request](../../src/tui/forms/export.ts#L219) (form: C4Form, out: string) → ExportC4Request <!-- internal -->
          <a id="tui.forms.export.ExportForms.c4Request"></a><br>The request the form would run: the CLI's flags, a layer only at the component level.
          - calls [base.config.toPosix](base.md#base.config.toPosix)
        - fn [refreshC4Prompt](../../src/tui/forms/export.ts#L231) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.refreshC4Prompt"></a><br>The rows of the form, and what Enter would do with the file as it is now. Reading only.
          - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.forms.export.ExportForms.c4Request](tui.md#tui.forms.export.ExportForms.c4Request), [operations.export.c4OutProblem](operations.md#operations.export.c4OutProblem), [base.config.toPosix](base.md#base.config.toPosix), [tui.disk.readText](tui.md#tui.disk.readText), [map.c4-export.isC4Diagram](map.md#map.c4-export.isC4Diagram)
        - fn [changeC4Choice](../../src/tui/forms/export.ts#L263) (delta: 1 | -1) → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.changeC4Choice"></a><br>←→ on the format, the level or the layer row: the next choice.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.export.ExportForms.refreshC4Prompt](tui.md#tui.forms.export.ExportForms.refreshC4Prompt)
        - fn [submitC4](../../src/tui/forms/export.ts#L276) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.submitC4"></a><br>Enter on any row: the export as the form shows it; the operation checks the file again before it writes.
          - calls [tui.forms.export.ExportForms.c4Request](tui.md#tui.forms.export.ExportForms.c4Request)
    - module [host](../../src/tui/forms/host.ts#L1)
      <a id="tui.forms.host"></a><br>What the forms of operations need from the session: its state, where the cursor is, the configuration and model it runs with, and the way to start an operation. The forms reach the session only through this, so their module depends on no editor, panel or transport.
      - agent-context [features.agent-context](features.md#features.agent-context)
      - operations [operations.operations](operations.md#operations.operations)
      - state [tui.state](tui.md#tui.state)
      - type [FormHost](../../src/tui/forms/host.ts#L10)
        <a id="tui.forms.host.FormHost"></a>
    - module [run](../../src/tui/forms/run.ts#L1)
      <a id="tui.forms.run"></a><br>The forms of the operations that read the repository as it is saved: feature readiness, baseline, agents, init, fmt, parse, wire, check, an explained edge and a trace plan. Each shows what it would run on and what it would write before anything runs; Enter starts the session's…
      - node [external.node](external.md#external.node)
      - analyze [map.analyze](map.md#map.analyze)
      - baseline [features.baseline](features.md#features.baseline)
      - config [base.config](base.md#base.config)
      - explain-edge [features.explain-edge](features.md#features.explain-edge)
      - files [lang.files](lang.md#lang.files)
      - harness [features.harness](features.md#features.harness)
      - operations [operations.operations](operations.md#operations.operations)
      - parse-format [lang.parse-format](lang.md#lang.parse-format)
      - span [base.span](base.md#base.span)
      - wire-gen [map.wire-gen](map.md#map.wire-gen)
      - buffer [tui.buffer](tui.md#tui.buffer)
      - disk [tui.disk](tui.md#tui.disk)
      - merge-session [tui.merge-session](tui.md#tui.merge-session)
      - prompt-keys [tui.prompt-keys](tui.md#tui.prompt-keys)
      - state [tui.state](tui.md#tui.state)
      - host [tui.forms.host](tui.md#tui.forms.host)
      - module [RunForms](../../src/tui/forms/run.ts#L26)
        <a id="tui.forms.run.RunForms"></a>
        - fn [constructor](../../src/tui/forms/run.ts#L29) (host: FormHost)
          <a id="tui.forms.run.RunForms.constructor"></a>
        - fn [state](../../src/tui/forms/run.ts#L33) () → State <!-- internal -->
          <a id="tui.forms.run.RunForms.state"></a>
        - fn [keys](../../src/tui/forms/run.ts#L38) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.run.RunForms.keys"></a><br>The keys of these forms.
          - calls [tui.forms.run.RunForms.refreshFeaturePrompt](tui.md#tui.forms.run.RunForms.refreshFeaturePrompt), [tui.forms.run.RunForms.featureNote](tui.md#tui.forms.run.RunForms.featureNote), [tui.forms.run.RunForms.submitFeature](tui.md#tui.forms.run.RunForms.submitFeature), [tui.prompt-keys.noteOfSelection](tui.md#tui.prompt-keys.noteOfSelection), [tui.forms.run.RunForms.submitBaseline](tui.md#tui.forms.run.RunForms.submitBaseline), [tui.forms.run.RunForms.refreshAgentsPrompt](tui.md#tui.forms.run.RunForms.refreshAgentsPrompt), [tui.forms.run.RunForms.submitAgents](tui.md#tui.forms.run.RunForms.submitAgents), [tui.forms.run.RunForms.refreshInitPrompt](tui.md#tui.forms.run.RunForms.refreshInitPrompt), [tui.forms.run.RunForms.submitInit](tui.md#tui.forms.run.RunForms.submitInit), [tui.forms.run.RunForms.refreshFmtPrompt](tui.md#tui.forms.run.RunForms.refreshFmtPrompt), [tui.forms.run.RunForms.submitFmt](tui.md#tui.forms.run.RunForms.submitFmt), [tui.forms.run.RunForms.refreshParsePrompt](tui.md#tui.forms.run.RunForms.refreshParsePrompt), [tui.forms.run.RunForms.submitParse](tui.md#tui.forms.run.RunForms.submitParse), [tui.forms.run.RunForms.refreshWirePrompt](tui.md#tui.forms.run.RunForms.refreshWirePrompt), [tui.forms.run.RunForms.submitWire](tui.md#tui.forms.run.RunForms.submitWire), [tui.forms.run.RunForms.refreshTracePlanPrompt](tui.md#tui.forms.run.RunForms.refreshTracePlanPrompt), [tui.forms.run.RunForms.tracePlanNote](tui.md#tui.forms.run.RunForms.tracePlanNote), [tui.forms.run.RunForms.submitTracePlan](tui.md#tui.forms.run.RunForms.submitTracePlan), [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.fieldOf](tui.md#tui.prompt-keys.fieldOf), [tui.prompt-keys.promptText](tui.md#tui.prompt-keys.promptText), [tui.forms.run.RunForms.refreshCheckPrompt](tui.md#tui.forms.run.RunForms.refreshCheckPrompt), [tui.forms.run.RunForms.changeCheckOption](tui.md#tui.forms.run.RunForms.changeCheckOption), [tui.forms.run.RunForms.submitCheck](tui.md#tui.forms.run.RunForms.submitCheck), [tui.forms.run.RunForms.refreshEdgePrompt](tui.md#tui.forms.run.RunForms.refreshEdgePrompt), [tui.forms.run.RunForms.submitEdge](tui.md#tui.forms.run.RunForms.submitEdge)
        - fn [openFeaturePrompt](../../src/tui/forms/run.ts#L84) () → void
          <a id="tui.forms.run.RunForms.openFeaturePrompt"></a><br>The feature form: the slug of the current feature file, else typed or chosen from the feature files.
          - calls [tui.forms.run.RunForms.refreshFeaturePrompt](tui.md#tui.forms.run.RunForms.refreshFeaturePrompt)
        - fn [refreshFeaturePrompt](../../src/tui/forms/run.ts#L93) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshFeaturePrompt"></a><br>The feature files matching the typed slug, and the target the form would check.
          - calls [tui.forms.run.RunForms.featureNote](tui.md#tui.forms.run.RunForms.featureNote)
        - fn [featureSlug](../../src/tui/forms/run.ts#L108) () → string <!-- internal -->
          <a id="tui.forms.run.RunForms.featureSlug"></a><br>The slug Enter would check: the selected feature file, else the typed text.
        - fn [featureNote](../../src/tui/forms/run.ts#L113) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.featureNote"></a>
          - calls [tui.forms.run.RunForms.featureSlug](tui.md#tui.forms.run.RunForms.featureSlug)
        - fn [submitFeature](../../src/tui/forms/run.ts#L125) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitFeature"></a><br>Enter in the feature form: the same slug rule as the CLI; an invalid one keeps the form and the text.
          - calls [tui.forms.run.RunForms.featureSlug](tui.md#tui.forms.run.RunForms.featureSlug)
        - fn [openBaselinePrompt](../../src/tui/forms/run.ts#L138) () → void
          <a id="tui.forms.run.RunForms.openBaselinePrompt"></a><br>The baseline form: the mode (write or check) and the target from the saved config's spec directory.
          - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath)
        - fn [submitBaseline](../../src/tui/forms/run.ts#L155) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitBaseline"></a><br>Enter in the baseline form: the chosen mode runs as the session's operation.
        - fn [openAgentsPrompt](../../src/tui/forms/run.ts#L169) () → void
          <a id="tui.forms.run.RunForms.openAgentsPrompt"></a><br>The agents form: the typed selection (empty is auto, `none`, or names as in `--agents`) and the mode. It shows what the selection resolves to and which files it would change, read from the disk; nothing runs a harness.
          - calls [tui.forms.run.RunForms.refreshAgentsPrompt](tui.md#tui.forms.run.RunForms.refreshAgentsPrompt)
        - fn [agentsPreview](../../src/tui/forms/run.ts#L175) (choice: HarnessChoice) → { changed: string[]; note: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.agentsPreview"></a><br>What a selection would do now: the read-only plan of the shared operation, or why it cannot be planned.
          - calls [features.harness.planAgents](features.md#features.harness.planAgents), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
        - fn [agentsChoice](../../src/tui/forms/run.ts#L194) () → HarnessChoice | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.agentsChoice"></a><br>The typed selection as a choice, or why it is not one (the CLI's message for `--agents`).
          - calls [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
        - fn [refreshAgentsPrompt](../../src/tui/forms/run.ts#L203) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshAgentsPrompt"></a>
          - calls [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice), [tui.forms.run.RunForms.agentsPreview](tui.md#tui.forms.run.RunForms.agentsPreview)
        - fn [submitAgents](../../src/tui/forms/run.ts#L219) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitAgents"></a><br>Enter in the agents form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form.
          - calls [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice)
        - fn [openInitPrompt](../../src/tui/forms/run.ts#L240) () → void
          <a id="tui.forms.run.RunForms.openInitPrompt"></a><br>The init form: the harness selection as in the agents form (empty is auto), then write or check. Its notes name the root, the languages and layers it describes (the saved keylang.json when there is one: it is kept), what the selection resolves to, and which classes of files…
          - calls [tui.forms.run.RunForms.refreshInitPrompt](tui.md#tui.forms.run.RunForms.refreshInitPrompt)
        - fn [refreshInitPrompt](../../src/tui/forms/run.ts#L245) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshInitPrompt"></a>
          - calls [operations.generate.initSources](operations.md#operations.generate.initSources), [base.config.guessLayout](base.md#base.config.guessLayout), [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice), [tui.forms.run.RunForms.agentsPreview](tui.md#tui.forms.run.RunForms.agentsPreview), [features.baseline.baselinePath](features.md#features.baseline.baselinePath)
        - fn [submitInit](../../src/tui/forms/run.ts#L274) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitInit"></a><br>Enter in the init form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form.
          - calls [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice)
        - fn [openFmtPrompt](../../src/tui/forms/run.ts#L289) () → void
          <a id="tui.forms.run.RunForms.openFmtPrompt"></a><br>The fmt form: the current spec file by default — a directory only when typed — then the mode.
          - calls [tui.forms.run.RunForms.refreshFmtPrompt](tui.md#tui.forms.run.RunForms.refreshFmtPrompt)
        - fn [promptPaths](../../src/tui/forms/run.ts#L297) () → string[] | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.promptPaths"></a><br>The typed paths of the fmt or parse form, relative to the root, or why they cannot be used.
          - calls [map.analyze.within](map.md#map.analyze.within)
        - fn [refreshFmtPrompt](../../src/tui/forms/run.ts#L305) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshFmtPrompt"></a><br>The form shows the real set the paths expand to, from the disk, and both modes.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths), [tui.forms.run.RunForms.markdownSelection](tui.md#tui.forms.run.RunForms.markdownSelection)
        - fn [markdownSelection](../../src/tui/forms/run.ts#L325) (paths: readonly string[]) → { files: string[]; note: string } | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.markdownSelection"></a><br>The Markdown files the paths expand to on disk, and a note naming them and how many are unsaved (saved first).
          - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
        - fn [submitFmt](../../src/tui/forms/run.ts#L341) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitFmt"></a><br>Enter in the fmt form: the typed paths with the chosen mode run as the session's operation.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths)
        - fn [openParsePrompt](../../src/tui/forms/run.ts#L356) () → void
          <a id="tui.forms.run.RunForms.openParsePrompt"></a><br>The parse form: the current spec file by default — a directory only when typed — then the view.
          - calls [tui.forms.run.RunForms.refreshParsePrompt](tui.md#tui.forms.run.RunForms.refreshParsePrompt)
        - fn [refreshParsePrompt](../../src/tui/forms/run.ts#L364) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshParsePrompt"></a><br>The form shows the real set the paths expand to and both views; parsing needs no snapshot and writes nothing.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths), [tui.forms.run.RunForms.markdownSelection](tui.md#tui.forms.run.RunForms.markdownSelection)
        - fn [submitParse](../../src/tui/forms/run.ts#L375) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitParse"></a><br>Enter in the parse form: the typed paths in the chosen view run as the session's operation.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths)
        - fn [openWirePrompt](../../src/tui/forms/run.ts#L390) () → void
          <a id="tui.forms.run.RunForms.openWirePrompt"></a><br>The wire form: the generated file (the CLI's default), then the mode.
          - calls [tui.forms.run.RunForms.refreshWirePrompt](tui.md#tui.forms.run.RunForms.refreshWirePrompt)
        - fn [wireOut](../../src/tui/forms/run.ts#L396) () → string | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.wireOut"></a><br>The typed output path (POSIX, relative to the root), or why it cannot be the generated file.
          - calls [operations.generate.wireOutProblem](operations.md#operations.generate.wireOutProblem)
        - fn [refreshWirePrompt](../../src/tui/forms/run.ts#L404) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshWirePrompt"></a><br>The form shows the path problem as it is typed, and the state of the file on disk. Reading only.
          - calls [tui.forms.run.RunForms.wireOut](tui.md#tui.forms.run.RunForms.wireOut), [tui.disk.readText](tui.md#tui.disk.readText)
        - fn [submitWire](../../src/tui/forms/run.ts#L421) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitWire"></a><br>Enter in the wire form: the typed file with the chosen mode runs as the session's operation; an invalid path keeps the form.
          - calls [tui.forms.run.RunForms.wireOut](tui.md#tui.forms.run.RunForms.wireOut)
        - fn [openCheckPrompt](../../src/tui/forms/run.ts#L436) () → void
          <a id="tui.forms.run.RunForms.openCheckPrompt"></a><br>The check form: the spec directory by default, not strict, the static mode of keylang.json.
          - calls [tui.forms.run.RunForms.refreshCheckPrompt](tui.md#tui.forms.run.RunForms.refreshCheckPrompt)
        - fn [checkPaths](../../src/tui/forms/run.ts#L442) () → string[] | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.checkPaths"></a><br>The typed paths, relative to the root (none: the spec directory), or why they cannot be checked here.
          - calls [map.analyze.within](map.md#map.analyze.within)
        - fn [refreshCheckPrompt](../../src/tui/forms/run.ts#L449) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshCheckPrompt"></a><br>The options as items, and the real set of spec files the paths expand to. Reading only.
          - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.resolveStatic](base.md#base.config.resolveStatic), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.forms.run.RunForms.checkPaths](tui.md#tui.forms.run.RunForms.checkPaths), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
        - fn [changeCheckOption](../../src/tui/forms/run.ts#L485) (delta: 1 | -1) → void <!-- internal -->
          <a id="tui.forms.run.RunForms.changeCheckOption"></a><br>←→ on an option of the check form: strict flips; the static mode cycles config → behavior → shape.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.run.RunForms.refreshCheckPrompt](tui.md#tui.forms.run.RunForms.refreshCheckPrompt)
        - fn [submitCheck](../../src/tui/forms/run.ts#L499) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitCheck"></a><br>Enter in the check form, on any row: the typed paths with the chosen options run as the session's operation.
          - calls [tui.forms.run.RunForms.checkPaths](tui.md#tui.forms.run.RunForms.checkPaths)
        - fn [openEdgePrompt](../../src/tui/forms/run.ts#L520) () → void
          <a id="tui.forms.run.RunForms.openEdgePrompt"></a><br>The edge form: the id under the cursor fills only the first field; the second is typed.
          - calls [tui.forms.run.RunForms.refreshEdgePrompt](tui.md#tui.forms.run.RunForms.refreshEdgePrompt)
        - fn [refreshEdgePrompt](../../src/tui/forms/run.ts#L527) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshEdgePrompt"></a><br>The rows, and a note on the selected id against the session's current snapshot (the operation reads the saved code again).
          - calls [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [features.explain-edge.edgeIdKnown](features.md#features.explain-edge.edgeIdKnown)
        - fn [submitEdge](../../src/tui/forms/run.ts#L547) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitEdge"></a><br>Enter in the edge form, on any row: both ids run as the session's operation; an empty one keeps the form.
          - calls [tui.forms.run.RunForms.refreshEdgePrompt](tui.md#tui.forms.run.RunForms.refreshEdgePrompt)
        - fn [openTracePlanPrompt](../../src/tui/forms/run.ts#L565) () → void
          <a id="tui.forms.run.RunForms.openTracePlanPrompt"></a><br>The trace-plan form: the flow under the cursor is the visible default; the list is the flows of the current documents.
          - calls [tui.forms.run.RunForms.refreshTracePlanPrompt](tui.md#tui.forms.run.RunForms.refreshTracePlanPrompt)
        - fn [refreshTracePlanPrompt](../../src/tui/forms/run.ts#L572) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshTracePlanPrompt"></a><br>The declared flows matching the typed name (the exact one first), each with the file that declares it.
          - calls [base.span.compareText](base.md#base.span.compareText), [tui.forms.run.RunForms.tracePlanNote](tui.md#tui.forms.run.RunForms.tracePlanNote)
        - fn [tracePlanFlow](../../src/tui/forms/run.ts#L588) () → string <!-- internal -->
          <a id="tui.forms.run.RunForms.tracePlanFlow"></a><br>The flow Enter plans: the selected one of the list, else the typed name.
        - fn [tracePlanNote](../../src/tui/forms/run.ts#L593) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.tracePlanNote"></a>
          - calls [tui.forms.run.RunForms.tracePlanFlow](tui.md#tui.forms.run.RunForms.tracePlanFlow)
        - fn [submitTracePlan](../../src/tui/forms/run.ts#L604) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitTracePlan"></a><br>Enter in the trace-plan form: the flow runs as the session's operation; an empty name keeps the form.
          - calls [tui.forms.run.RunForms.tracePlanFlow](tui.md#tui.forms.run.RunForms.tracePlanFlow)
  - module [input](../../src/tui/input.ts#L1)
    <a id="tui.input"></a><br>Terminal input as events: keys (with Ctrl/Alt/Shift), SGR mouse reports, and bracketed paste. xterm.js sends the same sequences as a terminal, so one decoder serves both. A chunk may end inside a sequence or a grapheme cluster; the rest waits for the next chunk, and on…
    - width [tui.width](tui.md#tui.width)
    - type [KeyEvent](../../src/tui/input.ts#L9)
      <a id="tui.input.KeyEvent"></a><br>Describes a single keyboard event decoded from terminal input: a key name such as `enter` or `up`, the ctrl/alt/shift modifier flags, and the typed text for printable keys, tagged with a literal `"key"` discriminant. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MouseEvent](../../src/tui/input.ts#L20)
      <a id="tui.input.MouseEvent"></a><br>Describes a terminal mouse event: the action kind (press, release, move, drag, wheel), which button, the 0-based cell coordinates, and ctrl/alt/shift modifier flags. The literal `type: "mouse"` tag lets it be distinguished from other input events in a union. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [PasteEvent](../../src/tui/input.ts#L33)
      <a id="tui.input.PasteEvent"></a><br>Describes a terminal input event carrying the full text of a bracketed paste, tagged with a literal `"paste"` discriminator so handlers can distinguish it from keypresses in a union of input events. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [InputEvent](../../src/tui/input.ts#L38) = KeyEvent | MouseEvent | PasteEvent
      <a id="tui.input.InputEvent"></a><br>Union type covering every event the terminal input layer can emit: a keypress, a mouse action, or a bracketed paste. Consumers in the `tui` layer switch on it to dispatch handling by event kind. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [key](../../src/tui/input.ts#L43) (name: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}, text?: string) → KeyEvent <!-- internal -->
      <a id="tui.input.key"></a><br>Builds a `KeyEvent` object with `type: "key"`, the given name, and `ctrl`/`alt`/`shift` flags normalized to strict booleans (true only when explicitly set). Includes a `text` field only if one was supplied; used by `InputDecoder` methods to emit decoded key events. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [typed](../../src/tui/input.ts#L48) (cluster: string) → KeyEvent <!-- internal -->
      <a id="tui.input.typed"></a><br>The key that types one grapheme cluster: named by it, `space` for a blank.
      - calls [tui.input.key](tui.md#tui.input.key)
    - fn [modifiers](../../src/tui/input.ts#L58) (param: string | undefined) → { ctrl: boolean; alt: boolean; shift: boolean } <!-- internal -->
      <a id="tui.input.modifiers"></a><br>Decodes the xterm modifier parameter of an escape sequence into shift, alt and ctrl flags by subtracting one from the numeric value and testing its low three bits, defaulting to no modifiers. Used by [`tui.input.InputDecoder.escape`](tui.md#tui.input.InputDecoder.escape) when parsing key events. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [partialSuffix](../../src/tui/input.ts#L64) (text: string, marker: string) → number <!-- internal -->
      <a id="tui.input.partialSuffix"></a><br>Length of the longest suffix of `text` that is a proper prefix of `marker`.
    - module [InputDecoder](../../src/tui/input.ts#L69)
      <a id="tui.input.InputDecoder"></a><br>Stateful decoder turning raw terminal input chunks into key, mouse and bracketed-paste events, buffering split sequences and grapheme clusters across chunks until [`tui.input.InputDecoder.flush`](tui.md#tui.input.InputDecoder.flush) resolves them. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - fn [feed](../../src/tui/input.ts#L74) (chunk: string) → InputEvent[]
        <a id="tui.input.InputDecoder.feed"></a><br>Events of a chunk; an incomplete sequence at the end waits for the next one.
        - calls [tui.input.partialSuffix](tui.md#tui.input.partialSuffix), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [flush](../../src/tui/input.ts#L105) () → InputEvent[]
        <a id="tui.input.InputDecoder.flush"></a><br>A lone ESC left after a pause is the Escape key, and a cluster that waited for more is one key. A paste whose end marker never came (a terminal that dropped it) ends here, so input is not swallowed for good.
        - calls [tui.input.key](tui.md#tui.input.key), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.input.typed](tui.md#tui.input.typed)
      - fn [waiting](../../src/tui/input.ts#L124) () → boolean
        <a id="tui.input.InputDecoder.waiting"></a><br>Whether a lone ESC or a cluster that may go on waits for `flush()`.
      - fn [pasting](../../src/tui/input.ts#L129) () → boolean
        <a id="tui.input.InputDecoder.pasting"></a><br>Inside a bracketed paste, waiting for its end marker.
      - fn [next](../../src/tui/input.ts#L133) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.next"></a><br>Decodes the first input event from buffered terminal text, delegating escapes to [`tui.input.InputDecoder.escape`](tui.md#tui.input.InputDecoder.escape) and mapping control bytes to keys via [`tui.input.key`](tui.md#tui.input.key). Typed text becomes grapheme clusters via [`tui.width.graphemes`](tui.md#tui.width.graphemes), returning null while a trailing… _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.input.InputDecoder.escape](tui.md#tui.input.InputDecoder.escape), [tui.input.key](tui.md#tui.input.key), [tui.input.typed](tui.md#tui.input.typed), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [escape](../../src/tui/input.ts#L157) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.escape"></a><br>Decodes an ESC-prefixed terminal sequence into a key or mouse event via [`tui.input.InputDecoder.mouse`](tui.md#tui.input.InputDecoder.mouse), [`tui.input.key`](tui.md#tui.input.key) and [`tui.input.modifiers`](tui.md#tui.input.modifiers), starting bracketed paste and swallowing terminal reports. Otherwise it treats ESC plus the next input as Alt+key via… _(llm · claude:claude-opus-5-5 · 2026-10-05)_
        - calls [tui.input.InputDecoder.mouse](tui.md#tui.input.InputDecoder.mouse), [tui.input.key](tui.md#tui.input.key), [tui.input.modifiers](tui.md#tui.input.modifiers), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [mouse](../../src/tui/input.ts#L192) (code: number, x: number, y: number, press: boolean) → MouseEvent <!-- internal -->
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
      <a id="tui.markdown.wrap"></a><br>Word-wraps segments to `width` cells (`wrapRuns`); continuation rows start with `hang` spaces.
      - calls [tui.width.wrapRuns](tui.md#tui.width.wrapRuns)
    - fn [tableRows](../../src/tui/markdown.ts#L48) (block: { text: string; line: number }[], width: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.tableRows"></a><br>Renders markdown pipe-table lines as styled rows with column widths from [`tui.width.stringWidth`](tui.md#tui.width.stringWidth), truncating cells with an ellipsis to fit the width, bolding the header and drawing separators as box-drawing rules. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [renderMarkdown](../../src/tui/markdown.ts#L68) (text: string, width: number) → ReadRow[]
      <a id="tui.markdown.renderMarkdown"></a><br>Converts markdown text into styled, width-wrapped display rows tagged with source line numbers, handling code fences, headings, bullets and blank lines, delegating tables to [`tui.markdown.tableRows`](tui.md#tui.markdown.tableRows) and dropping HTML comments. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
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
      <a id="tui.merge-session.MergeSession"></a><br>Drives the TUI review of files under the proposals store: lists and validates proposals, opens each as a hunk-by-hunk diff against disk, takes accept/reject keys, then writes, undoes or cancels via [`tui.merge-session.MergeSession.write`](tui.md#tui.merge-session.MergeSession.write). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
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
      - fn [dropProposal](../../src/tui/merge-session.ts#L222) (path: string, text: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.dropProposal"></a><br>Removes the proposal of `path` while it is still `text`.
        - calls [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.removeInside](tui.md#tui.disk.removeInside)
      - fn [key](../../src/tui/merge-session.ts#L233) (event: KeyEvent) → void
        <a id="tui.merge-session.MergeSession.key"></a><br>Handles merge-review keystrokes: accepts/rejects the focused hunk and jumps to the next pending one, undoes decisions, moves between hunks, opens help, writes via [`tui.merge-session.MergeSession.write`](tui.md#tui.merge-session.MergeSession.write) or cancels via [`tui.merge-session.MergeSession.leave`](tui.md#tui.merge-session.MergeSession.leave). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.merge-session.MergeSession.write](tui.md#tui.merge-session.MergeSession.write), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave)
      - fn [leave](../../src/tui/merge-session.ts#L288) (merge: MergeState, message: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.leave"></a><br>Ends a merge: clears merge state, refreshes the proposal list via [`tui.merge-session.MergeSession.scan`](tui.md#tui.merge-session.MergeSession.scan) (agents may have changed it), restores the prior mode, sets a status message, and clamps the cursor. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
      - fn [write](../../src/tui/merge-session.ts#L307) () → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.write"></a><br>Applies the decided hunks. A proposal file is the external change being confirmed, so the result goes to disk.
        - calls [tui.merge-session.MergeSession.writeBuffer](tui.md#tui.merge-session.MergeSession.writeBuffer), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [features.stats.statusesIn](features.md#features.stats.statusesIn)
      - fn [writeBuffer](../../src/tui/merge-session.ts#L377) (merge: MergeState) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.writeBuffer"></a><br>`Ctrl+G`: the accepted hunks go into the buffer, which `Ctrl+S` saves.
        - calls [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.buffer.setText](tui.md#tui.buffer.setText)
      - fn [undo](../../src/tui/merge-session.ts#L396) () → void
        <a id="tui.merge-session.MergeSession.undo"></a><br>`u` in the view: undoes the last merge while the file still holds its result, on disk too, and brings back the proposal as it was — unless a newer proposal was written since, which is kept.
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
    - fn [proposalKind](../../src/tui/merge-session.ts#L436) (path: string) → ProposalEntry["kind"] <!-- internal -->
      <a id="tui.merge-session.proposalKind"></a><br>A Markdown proposal replaces a spec; any other replaces a source file (or a test).
    - fn [errorText](../../src/tui/merge-session.ts#L440) (error: unknown) → string
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
      <a id="tui.nav.treeOf"></a><br>Builds and caches per analysis the navigation tree: module/fn/type children grouped under modules or layers, plus flow and rule items from hand-written docs marked with evidence via [`tui.nav.markOver`](tui.md#tui.nav.markOver). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.nav.markOver](tui.md#tui.nav.markOver), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [tui.nav.lastLine](tui.md#tui.nav.lastLine)
    - fn [codeTree](../../src/tui/nav.ts#L106) (analysis: Analysis) → { layers: readonly string[]; children: ReadonlyMap<string, readonly string[]> }
      <a id="tui.nav.codeTree"></a><br>Layers in the map's order and the direct children of every layer, module and class (top modules of a layer; nested modules and members of a module): one index for this panel and the zoom screen (`zoom.ts`).
      - calls [tui.nav.treeOf](tui.md#tui.nav.treeOf)
    - fn [navItems](../../src/tui/nav.ts#L112) (analysis: Analysis | null, expanded: ReadonlySet<string>) → NavItem[]
      <a id="tui.nav.navItems"></a><br>Visible items for the expanded keys. Layers start expanded unless `-<key>` collapses them.
      - calls [tui.nav.treeOf](tui.md#tui.nav.treeOf), [tui.nav.heading](tui.md#tui.nav.heading)
  - module [new-spec](../../src/tui/new-spec.ts#L1)
    <a id="tui.new-spec"></a><br>A new hand-written specification (design §2.8): its kinds, the default path and the first text of each, and where a new file may go. The rules are the proposal rules: a Markdown file under the spec directory, not the generated map, the explained map or the store of saved…
    - node [external.node](external.md#external.node)
    - parser [lang.parser](lang.md#lang.parser)
    - proposals [features.proposals](features.md#features.proposals)
    - state [tui.state](tui.md#tui.state)
    - fn [defaultSpecPath](../../src/tui/new-spec.ts#L23) (kind: SpecKind, specDir: string) → string
      <a id="tui.new-spec.defaultSpecPath"></a><br>The path the form starts with: under the spec directory (`specDir`, relative and POSIX; "" is the root).
    - fn [suggestedFlowName](../../src/tui/new-spec.ts#L40) (path: string) → string
      <a id="tui.new-spec.suggestedFlowName"></a><br>The flow name a path suggests: its file name without `.md`, when that is a valid name; else "".
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [flowNameProblem](../../src/tui/new-spec.ts#L46) (name: string) → string | null
      <a id="tui.new-spec.flowNameProblem"></a><br>Why `name` cannot be a flow name, or null. The heading grammar takes one segment (format §Appendix A).
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [specTemplate](../../src/tui/new-spec.ts#L55) (kind: SpecKind, name: string) → string
      <a id="tui.new-spec.specTemplate"></a><br>The first text of a new file: only the heading its kind needs, no invented IDs or planned nodes. `name` is the flow name (flow) or the title (feature).
    - fn [newSpecProblem](../../src/tui/new-spec.ts#L76) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="tui.new-spec.newSpecProblem"></a><br>Why `path` (relative to `root`, POSIX) cannot hold a new or opened specification, or null. `specDir` is relative to the root and POSIX; `generated` says whether the analysis knows the path as a generated document. An existing file is no problem here: the form opens it.
      - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem)
  - module [operation-worker](../../src/tui/operation-worker.ts#L1)
    <a id="tui.operation-worker"></a><br>Worker entry of `OperationWorker`: runs shared operations off the UI thread. Requests and replies are plain cloneable data; the callbacks and the AbortSignal stay on the session's side.
    - node [external.node](external.md#external.node)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - operations [operations.operations](operations.md#operations.operations)
    - type [OperationCall](../../src/tui/operation-worker.ts#L20)
      <a id="tui.operation-worker.OperationCall"></a><br>A message to the worker: run a request, let its commit go ahead, cancel it, or read a feature file at its base.
    - type [OperationReply](../../src/tui/operation-worker.ts#L27)
      <a id="tui.operation-worker.OperationReply"></a><br>A reply of the worker: any number of progress notes, at most one commit request, then one result or one error; or the base asked for.
    - fn [post](../../src/tui/operation-worker.ts#L34) (reply: OperationReply) → void <!-- internal -->
      <a id="tui.operation-worker.post"></a><br>Sends an operation result message from the worker thread back to the parent thread via `parentPort`, silently doing nothing if no parent port exists (e.g. when not running as a worker). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [prompt-keys](../../src/tui/prompt-keys.ts#L1)
    <a id="tui.prompt-keys"></a><br>The keys of a prompt — the palette, a search, a picker, the form of an operation. Every kind answers the same keys: typing and Backspace edit the text of the selected row, ↑↓ move the selection, ←→ change a choice, Enter runs it.
    - input [tui.input](tui.md#tui.input)
    - state [tui.state](tui.md#tui.state)
    - width [tui.width](tui.md#tui.width)
    - type [TextField](../../src/tui/prompt-keys.ts#L16)
      <a id="tui.prompt-keys.TextField"></a><br>A text the selected row of a prompt edits.
    - type [PromptKeys](../../src/tui/prompt-keys.ts#L24)
      <a id="tui.prompt-keys.PromptKeys"></a><br>What the keys of a prompt do for one kind of it.
    - fn [promptText](../../src/tui/prompt-keys.ts#L38) (prompt: Prompt) → TextField
      <a id="tui.prompt-keys.promptText"></a><br>The prompt's own text as a field: the query, the paths, the target.
    - fn [fieldOf](../../src/tui/prompt-keys.ts#L48) (form: Record<K, string>, key: K, digits = false) → TextField
      <a id="tui.prompt-keys.fieldOf"></a><br>A text of a form object as a field.
    - fn [fieldIn](../../src/tui/prompt-keys.ts#L58) (prompt: Prompt, keys: PromptKeys) → TextField | null <!-- internal -->
      <a id="tui.prompt-keys.fieldIn"></a>
      - calls [tui.prompt-keys.promptText](tui.md#tui.prompt-keys.promptText)
    - fn [backspaced](../../src/tui/prompt-keys.ts#L63) (text: string) → string
      <a id="tui.prompt-keys.backspaced"></a><br>A typed line after Backspace: its last grapheme cluster gone. The prompts and the clip's input line edit this way.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [typeInto](../../src/tui/prompt-keys.ts#L68) (prompt: Prompt, keys: PromptKeys, text: string) → void
      <a id="tui.prompt-keys.typeInto"></a><br>Text typed or pasted into the prompt: into the selected row's field, then the prompt follows it.
      - calls [tui.prompt-keys.fieldIn](tui.md#tui.prompt-keys.fieldIn)
    - fn [promptKey](../../src/tui/prompt-keys.ts#L78) (prompt: Prompt, keys: PromptKeys, event: KeyEvent) → void
      <a id="tui.prompt-keys.promptKey"></a><br>Every key of a prompt but Esc (the caller closes it): Backspace, ←→ when the kind has choices, ↑↓ over a list that has items, Enter, and text.
      - calls [tui.prompt-keys.fieldIn](tui.md#tui.prompt-keys.fieldIn), [tui.prompt-keys.backspaced](tui.md#tui.prompt-keys.backspaced), [tui.prompt-keys.typeInto](tui.md#tui.prompt-keys.typeInto)
    - fn [noteOfSelection](../../src/tui/prompt-keys.ts#L96) (prompt: Prompt) → void
      <a id="tui.prompt-keys.noteOfSelection"></a><br>The note of the selected item, where each item has its own (`notes`).
    - type [FormRow](../../src/tui/prompt-keys.ts#L101)
      <a id="tui.prompt-keys.FormRow"></a><br>One row of a form: its id, which the selection keeps across a refresh, and its text.
    - fn [showRows](../../src/tui/prompt-keys.ts#L107) (prompt: Prompt, rows: readonly FormRow[], selected: string) → void
      <a id="tui.prompt-keys.showRows"></a><br>The rows of a form, the row `selected` selected (the first when it is gone).
    - fn [selectedRow](../../src/tui/prompt-keys.ts#L114) (prompt: Prompt, fallback: string) → string
      <a id="tui.prompt-keys.selectedRow"></a><br>The id of the selected row, or `fallback` before the rows are built.
    - fn [caretAt](../../src/tui/prompt-keys.ts#L119) (selected: string) → (row: string) => string
      <a id="tui.prompt-keys.caretAt"></a><br>The caret after the text of a field's row while it is the `selected` one: `caretAt(selected)("into")`.
    - fn [cycle](../../src/tui/prompt-keys.ts#L124) (list: readonly T[], value: T, delta: number) → T
      <a id="tui.prompt-keys.cycle"></a><br>The value `delta` steps from `value` in `list`, around the ends.
    - fn [selectRow](../../src/tui/prompt-keys.ts#L129) (prompt: Prompt, row: string, refresh: () => void) → void
      <a id="tui.prompt-keys.selectRow"></a><br>Selects `row` among rows that depend on the values just changed: built once to find it, once to show it selected.
    - fn [selectProblem](../../src/tui/prompt-keys.ts#L138) (prompt: Prompt, field: string, refresh: () => void) → void
      <a id="tui.prompt-keys.selectProblem"></a><br>A form that may not run keeps its values: the row the problem is about is selected again.
  - module reports
    <a id="tui.reports"></a>
    - module [chat](../../src/tui/reports/chat.ts#L1)
      <a id="tui.reports.chat"></a><br>The report of the clip's reply (ADR 0021): what the model answered, the block it gave, and what it read — the system prompt and the prompt, as the operation built them from the request — so a reply can be checked against its question after the fact, as F4 shows the pack before…
      - node [external.node](external.md#external.node)
      - config [base.config](base.md#base.config)
      - operations [operations.operations](operations.md#operations.operations)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
    - module [check](../../src/tui/reports/check.ts#L1)
      <a id="tui.reports.check"></a><br>Reports of the operations that read the specs against the code: feature readiness, check, an explained edge, parse, a trace plan, the C4 diagram, and the export of a finished report.
      - node [external.node](external.md#external.node)
      - config [base.config](base.md#base.config)
      - diag [base.diag](base.md#base.diag)
      - explain-edge [features.explain-edge](features.md#features.explain-edge)
      - feature-status [features.feature-status](features.md#features.feature-status)
      - operations [operations.operations](operations.md#operations.operations)
      - snapshot [map.snapshot](map.md#map.snapshot)
      - findings [tui.findings](tui.md#tui.findings)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [CheckKind](../../src/tui/reports/check.ts#L16) <!-- internal -->
        <a id="tui.reports.check.CheckKind"></a>
      - type [FeatureItem](../../src/tui/reports/check.ts#L19)
        <a id="tui.reports.check.FeatureItem"></a><br>One gap or hint of a feature report, as the readiness screen lists it.
      - fn [featureItems](../../src/tui/reports/check.ts#L26) (report: FeatureReport) → FeatureItem[]
        <a id="tui.reports.check.featureItems"></a><br>The gaps and hints of a feature report up the ladder, a stage's gaps before its hints: the rows Tab and the arrows select.
      - fn [stageLadder](../../src/tui/reports/check.ts#L34) (stage: FeatureReport["stage"]) → string <!-- internal -->
        <a id="tui.reports.check.stageLadder"></a><br>`idea › behavior › [structure] › ready › done`: the ladder with the current stage in brackets.
      - fn [infoSummary](../../src/tui/reports/check.ts#L39) (items: readonly FeatureInfo[]) → string <!-- internal -->
        <a id="tui.reports.check.infoSummary"></a><br>`ok 2 · unverified 1`, or `—` when the feature has none.
      - fn [checkParams](../../src/tui/reports/check.ts#L47) (request: CheckRequest) → string <!-- internal -->
        <a id="tui.reports.check.checkParams"></a><br>The requested check options as the F6 list names them: `keylang · strict · static shape`.
      - fn [edgeItems](../../src/tui/reports/check.ts#L61) (payload: ExplainEdgePayload) → { file: string; line: number; col: number; text: string }[] <!-- internal -->
        <a id="tui.reports.check.edgeItems"></a><br>The evidence of an explain-edge report the arrows select after Tab: every edge (`→` from → to, `←` to → from), or every unresolved construct when there is none. `file` is "" for an edge with no position in the code.
        - calls [features.explain-edge.edgeLine](features.md#features.explain-edge.edgeLine), [features.explain-edge.holeLine](features.md#features.explain-edge.holeLine)
      - fn [c4Label](../../src/tui/reports/check.ts#L69) (request: ExportC4Request) → string <!-- internal -->
        <a id="tui.reports.check.c4Label"></a><br>How messages name a C4 export: the CLI's command with the flags it got.
    - module [draft](../../src/tui/reports/draft.ts#L1)
      <a id="tui.reports.draft"></a><br>Reports of the drafts: a flow, rules or layers drafted from the code, flows from code, code from a planned fn and its applied candidate, and the model's open questions for a feature. A proposal is written only through MERGE; a preview writes nothing.
      - proposals [features.proposals](features.md#features.proposals)
      - operations [operations.operations](operations.md#operations.operations)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [DraftKind](../../src/tui/reports/draft.ts#L12) <!-- internal -->
        <a id="tui.reports.draft.DraftKind"></a>
      - fn [modeFlag](../../src/tui/reports/draft.ts#L15) (mode: string | undefined) → string <!-- internal -->
        <a id="tui.reports.draft.modeFlag"></a><br>` --mode hybrid`; nothing for algo, the CLI's default.
      - fn [codeSource](../../src/tui/reports/draft.ts#L20) (source: { file?: string | null | undefined; line?: number | null | undefined; since?: string | null | undefined }) → string <!-- internal -->
        <a id="tui.reports.draft.codeSource"></a><br>The source of a code-to-spec as the CLI names it: `src/a.ts:8` or `--since HEAD`.
      - fn [draftOutcome](../../src/tui/reports/draft.ts#L26) (status: OperationRecord["status"], payload: DraftFlowPayload | DraftRulesPayload | CodeToSpecPayload) → string <!-- internal -->
        <a id="tui.reports.draft.draftOutcome"></a><br>`3 step(s), preview, nothing written`, `3 step(s) proposed for <target>`, `refused, nothing written`, `write failed`.
      - fn [specCodeOutcome](../../src/tui/reports/draft.ts#L36) (status: OperationRecord["status"], payload: SpecToCodePayload) → string <!-- internal -->
        <a id="tui.reports.draft.specCodeOutcome"></a><br>What spec-to-code did with its candidate: previewed, proposed (all, or the ones before it stopped), refused.
      - fn [questionsOutcome](../../src/tui/reports/draft.ts#L47) (payload: FeatureQuestionsPayload) → string <!-- internal -->
        <a id="tui.reports.draft.questionsOutcome"></a><br>`3 question(s) proposed`, with the answer's lines left out when there were any.
      - fn [draftHint](../../src/tui/reports/draft.ts#L53) (rows: ReportRow[], payload: { proposal: string | null; output: "proposal" | "preview" }, target: string) → void <!-- internal -->
        <a id="tui.reports.draft.draftHint"></a><br>What Enter does on a drafted report: MERGE of the proposal, or a draft again after a preview.
      - fn [proposedRows](../../src/tui/reports/draft.ts#L59) (rows: ReportRow[], payload: { output: "proposal" | "preview" }, candidate: { target: string; text: string | null }, drafted: string) → void <!-- internal -->
        <a id="tui.reports.draft.proposedRows"></a><br>A preview's whole proposed target, when it is more than the drafted part.
        - calls [tui.reports.rows.textRows](tui.md#tui.reports.rows.textRows)
      - fn [fallback](../../src/tui/reports/draft.ts#L64) (payload: { fallback: unknown }) → string <!-- internal -->
        <a id="tui.reports.draft.fallback"></a><br>`(hybrid without a model)` after the mode of a draft that had to fall back.
    - module [explain](../../src/tui/reports/explain.ts#L1)
      <a id="tui.reports.explain"></a><br>Reports of the explanations: offline help and summaries, the model's answer for one node, the inventory of what needs explaining and the batch of briefs.
      - explain-node [features.explain-node](features.md#features.explain-node)
      - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
      - explain-offline [features.explain-offline](features.md#features.explain-offline)
      - operations [operations.operations](operations.md#operations.operations)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [ExplainKind](../../src/tui/reports/explain.ts#L12) = "explain" | "explain-llm" | "explain-plan" | "explain-batch" <!-- internal -->
        <a id="tui.reports.explain.ExplainKind"></a>
      - fn [explainPlanLabel](../../src/tui/reports/explain.ts#L15) (request: ExplainPlanRequest) → string <!-- internal -->
        <a id="tui.reports.explain.explainPlanLabel"></a><br>The CLI command of an inventory: `explain --stale`, `explain --missing --dry-run --limit 3 --jobs 2`.
      - fn [explainBatchLabel](../../src/tui/reports/explain.ts#L21) (request: ExplainBatchRequest) → string <!-- internal -->
        <a id="tui.reports.explain.explainBatchLabel"></a><br>The CLI command of a batch: `explain --missing --llm --limit 3 --jobs 2`.
      - fn [explainPlanOutcome](../../src/tui/reports/explain.ts#L26) (payload: ExplainPlanPayload) → string <!-- internal -->
        <a id="tui.reports.explain.explainPlanOutcome"></a><br>`2 stale, 1 gone of 5 saved explanation(s)`, `nothing to explain: zero work, no request`, `6 brief(s) planned, ~1200 in, ~480 out tokens (approximate)`.
      - fn [explainBatchOutcome](../../src/tui/reports/explain.ts#L37) (payload: ExplainBatchPayload) → string <!-- internal -->
        <a id="tui.reports.explain.explainBatchOutcome"></a><br>`6 of 6 brief(s) written`, `5 of 6 brief(s) written, 1 failed`, `cancelled: 1 of 6 written, 5 not started`, `outdated: …`.
      - fn [batchState](../../src/tui/reports/explain.ts#L47) (payload: ExplainBatchPayload, id: string) → string <!-- internal -->
        <a id="tui.reports.explain.batchState"></a><br>What became of one planned node of a batch: `written <file>`, `failed: <reason>`, `not started`.
      - fn [savedRows](../../src/tui/reports/explain.ts#L55) (rows: ReportRow[], label: string, saved: SavedAnswer) → void <!-- internal -->
        <a id="tui.reports.explain.savedRows"></a><br>A saved answer or brief: its provenance on one row, then its text and the IDs it made up.
      - fn [linkRows](../../src/tui/reports/explain.ts#L66) (rows: ReportRow[], links: readonly { file: string | null; text: string }[], selected: number) → void <!-- internal -->
        <a id="tui.reports.explain.linkRows"></a><br>The places an explanation links to, each an item Tab selects.
      - fn [linkItems](../../src/tui/reports/explain.ts#L75) (links: readonly { file: string | null; line: number; col: number; text: string }[]) → ReportItem[] <!-- internal -->
        <a id="tui.reports.explain.linkItems"></a><br>A place an explanation names: the node, a related ID the snapshot or a planned declares, a flow, a rule line.
    - module [records](../../src/tui/reports/records.ts#L1)
      <a id="tui.reports.records"></a><br>The records of the F6 panel through the reports of their kinds: how a record is named in the list and the messages, its outcome, its report rows and the items Tab selects. Each kind is one entry of one table, so a new kind of operation is one more entry, not one more branch in…
      - operations [operations.operations](operations.md#operations.operations)
      - actions [tui.actions](tui.md#tui.actions)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - chat [tui.reports.chat](tui.md#tui.reports.chat)
      - check [tui.reports.check](tui.md#tui.reports.check)
      - draft [tui.reports.draft](tui.md#tui.reports.draft)
      - explain [tui.reports.explain](tui.md#tui.reports.explain)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - setup [tui.reports.setup](tui.md#tui.reports.setup)
      - fn [isDone](../../src/tui/reports/records.ts#L23) (result: OperationResult) → result is Done<Kind> <!-- internal -->
        <a id="tui.reports.records.isDone"></a><br>A result that has its payload: the report of its kind can show it.
      - fn [operationLabel](../../src/tui/reports/records.ts#L28) (request: RequestOf<K>) → string
        <a id="tui.reports.records.operationLabel"></a><br>How messages name an operation: `doctor`, `feature pay`, `map write`.
      - fn [paramsOf](../../src/tui/reports/records.ts#L32) (request: RequestOf<K>) → string | null <!-- internal -->
        <a id="tui.reports.records.paramsOf"></a>
      - fn [recordLabel](../../src/tui/reports/records.ts#L37) (record: OperationRecord) → string
        <a id="tui.reports.records.recordLabel"></a><br>The registry label of a record's action, with its parameters (`Feature readiness · pay`), or its id.
        - calls [tui.reports.records.paramsOf](tui.md#tui.reports.records.paramsOf)
      - fn [recordStatus](../../src/tui/reports/records.ts#L44) (record: OperationRecord) → string
        <a id="tui.reports.records.recordStatus"></a><br>The status of a record for the F6 list: `running…` or `completed · code 0`, and `outdated` once its inputs changed.
      - fn [summaryOf](../../src/tui/reports/records.ts#L50) (record: OperationRecord, result: Done<K>) → string <!-- internal -->
        <a id="tui.reports.records.summaryOf"></a>
        - calls [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus)
      - fn [recordSummary](../../src/tui/reports/records.ts#L55) (record: OperationRecord) → string
        <a id="tui.reports.records.recordSummary"></a><br>The status with the domain outcome when there is one: `done · code 0`, `2 gap(s) · code 1`.
        - calls [tui.reports.records.isDone](tui.md#tui.reports.records.isDone), [tui.reports.records.summaryOf](tui.md#tui.reports.records.summaryOf), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus)
      - fn [rowsOf](../../src/tui/reports/records.ts#L60) (state: State, record: OperationRecord, result: Done<K>) → ReportRow[] <!-- internal -->
        <a id="tui.reports.records.rowsOf"></a>
        - calls [tui.reports.records.summaryOf](tui.md#tui.reports.records.summaryOf)
      - fn [timeStr](../../src/tui/reports/records.ts#L65) (ms: number) → string <!-- internal -->
        <a id="tui.reports.records.timeStr"></a>
      - fn [resultsReportRows](../../src/tui/reports/records.ts#L74) (state: State) → ReportRow[]
        <a id="tui.reports.records.resultsReportRows"></a><br>The report rows of the record selected in the F6 panel: its parameters, timings and what its kind shows of the result. Presentation only — the payload in `record.result` carries the domain data.
        - calls [tui.reports.records.timeStr](tui.md#tui.reports.records.timeStr), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus), [tui.reports.records.isDone](tui.md#tui.reports.records.isDone), [tui.reports.records.rowsOf](tui.md#tui.reports.records.rowsOf)
      - fn [itemsOf](../../src/tui/reports/records.ts#L87) (state: State, result: Done<K>) → ReportItem[] <!-- internal -->
        <a id="tui.reports.records.itemsOf"></a>
      - fn [reportItems](../../src/tui/reports/records.ts#L98) (state: State) → ReportItem[]
        <a id="tui.reports.records.reportItems"></a><br>The items of the selected record the arrows select after Tab: the gaps of a feature record, every result of a check record, the evidence of an explained edge, the places of an explanation, the nodes of an inventory or a batch, the diagnostics of a parse, the symbols of a trace…
        - calls [tui.reports.records.isDone](tui.md#tui.reports.records.isDone), [tui.reports.records.itemsOf](tui.md#tui.reports.records.itemsOf)
      - fn [itemNoun](../../src/tui/reports/records.ts#L104) (kind: OperationRequest["kind"]) → string
        <a id="tui.reports.records.itemNoun"></a><br>What the panel's keys call the items of a kind: `evidence`, `diagnostic`, `node`; `finding` by default.
    - module [rows](../../src/tui/reports/rows.ts#L1)
      <a id="tui.reports.rows"></a><br>What every report in F6 is made of: rows of text with a style, the kind of operation they show, and the few row shapes most reports share. One module per group of kinds (setup, check, explain, draft, chat) describes its kinds; `records.ts` puts them in one table.
      - operations [operations.operations](operations.md#operations.operations)
      - screen [tui.screen](tui.md#tui.screen)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - type [Kind](../../src/tui/reports/rows.ts#L11) = OperationRequest["kind"]
        <a id="tui.reports.rows.Kind"></a>
      - type [RequestOf](../../src/tui/reports/rows.ts#L14) = { [P in K]: Extract<OperationRequest, { kind: P }> }[K]
        <a id="tui.reports.rows.RequestOf"></a><br>The request of one kind.
      - type [Done](../../src/tui/reports/rows.ts#L17)
        <a id="tui.reports.rows.Done"></a><br>A result of one kind that has its payload: what a report shows.
      - type [ReportRow](../../src/tui/reports/rows.ts#L20)
        <a id="tui.reports.rows.ReportRow"></a><br>One row of a report; `gap` is the index of the item Tab and the arrows select on it.
      - type [ReportItem](../../src/tui/reports/rows.ts#L27)
        <a id="tui.reports.rows.ReportItem"></a><br>A place an item of a report opens; `file` is "" for an item with no place in the code. `text` is its whole reason.
      - type [Report](../../src/tui/reports/rows.ts#L38)
        <a id="tui.reports.rows.Report"></a><br>How F6 and the messages show one kind of operation. Presentation only: the payload of `record.result` carries the domain data.
      - type [ReportView](../../src/tui/reports/rows.ts#L52)
        <a id="tui.reports.rows.ReportView"></a><br>What the panel hands every report: the item Tab selected (-1 for none) and the record's summary for the outcome row.
      - fn [outcomeRow](../../src/tui/reports/rows.ts#L63) (text: string, ok: boolean) → ReportRow
        <a id="tui.reports.rows.outcomeRow"></a><br>The outcome row under a report's title: green when the operation did what was asked, red otherwise.
      - fn [codeOf](../../src/tui/reports/rows.ts#L68) (exitCode: 0 | 1 | 2 | null) → string
        <a id="tui.reports.rows.codeOf"></a><br>` · code 1`; nothing for a run with no code (cancelled).
      - fn [messageRow](../../src/tui/reports/rows.ts#L73) (message: OperationMessage) → ReportRow
        <a id="tui.reports.rows.messageRow"></a><br>A message as a report row: an error in red, the rest as written.
      - fn [noticeRow](../../src/tui/reports/rows.ts#L78) (message: OperationMessage) → ReportRow
        <a id="tui.reports.rows.noticeRow"></a><br>A message as a report row with warnings in amber too.
      - fn [textRows](../../src/tui/reports/rows.ts#L83) (title: string, text: string) → ReportRow[]
        <a id="tui.reports.rows.textRows"></a><br>Text as the CLI prints it, under a rule naming where it comes from (`keylang parse · stdout`); the final newline makes no row.
      - fn [shortId](../../src/tui/reports/rows.ts#L90) (id: string | null) → string
        <a id="tui.reports.rows.shortId"></a><br>`abcd1234`, or `none` for a run without a snapshot.
    - module [setup](../../src/tui/reports/setup.ts#L1)
      <a id="tui.reports.setup"></a><br>Reports of the operations that set a repository up and keep its generated files: doctor, map check, map, baseline, agents, init, fmt and wire.
      - operations [operations.operations](operations.md#operations.operations)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [SetupKind](../../src/tui/reports/setup.ts#L9) <!-- internal -->
        <a id="tui.reports.setup.SetupKind"></a>
      - fn [mode](../../src/tui/reports/setup.ts#L12) (check: boolean) → string <!-- internal -->
        <a id="tui.reports.setup.mode"></a><br>`write`, `check`: the mode a setup form ran in.
      - fn [choiceText](../../src/tui/reports/setup.ts#L17) (choice: AgentsRequest["harnesses"]) → string <!-- internal -->
        <a id="tui.reports.setup.choiceText"></a><br>`auto`, `none`, `claude, codex`: the selection as requested.
      - fn [mapTail](../../src/tui/reports/setup.ts#L22) (rows: ReportRow[], payload: MapCheckPayload | MapPayload) → void <!-- internal -->
        <a id="tui.reports.setup.mapTail"></a><br>The map's warnings and its counts, under a map check or a map write.
      - fn [initRows](../../src/tui/reports/setup.ts#L184) (_state: unknown, record: OperationRecord, result: Done<"init">, view: ReportView) → ReportRow[] <!-- internal -->
        <a id="tui.reports.setup.initRows"></a><br>Init stage by stage, each with what it really did; a partial init is named as partial and nothing is rolled back.
        - calls [tui.reports.rows.outcomeRow](tui.md#tui.reports.rows.outcomeRow), [tui.reports.setup.gitignoreOutcome](tui.md#tui.reports.setup.gitignoreOutcome), [tui.reports.setup.gitignoreFailed](tui.md#tui.reports.setup.gitignoreFailed), [tui.reports.rows.codeOf](tui.md#tui.reports.rows.codeOf), [tui.reports.setup.initStages](tui.md#tui.reports.setup.initStages), [tui.reports.setup.mapOutcome](tui.md#tui.reports.setup.mapOutcome), [tui.reports.setup.baselineOutcome](tui.md#tui.reports.setup.baselineOutcome), [tui.reports.setup.agentsOutcome](tui.md#tui.reports.setup.agentsOutcome)
      - fn [wireOutcome](../../src/tui/reports/setup.ts#L248) (status: OperationRecord["status"], payload: WirePayload, exitCode: 0 | 1 | 2 | null) → string <!-- internal -->
        <a id="tui.reports.setup.wireOutcome"></a><br>`written`, `up to date`, `stale`, `2 error(s) in wiring`, `manual file`, `inputs changed, nothing written`: what wire found and really did.
      - fn [fmtOutcome](../../src/tui/reports/setup.ts#L260) (status: OperationRecord["status"], payload: FmtPayload) → string <!-- internal -->
        <a id="tui.reports.setup.fmtOutcome"></a><br>`3 file(s) canonical`, `2 not formatted`, `1 formatted, 1 invalid`, `1 of 2 formatted, cancelled`: what fmt found and really did.
      - fn [agentsOutcome](../../src/tui/reports/setup.ts#L275) (status: OperationRecord["status"], payload: AgentsPayload) → string <!-- internal -->
        <a id="tui.reports.setup.agentsOutcome"></a><br>`up to date`, `2 stale`, `3 written, 1 removed`, `broken file, nothing written`, `2 of 4 step(s) done, failed`.
      - fn [initOutcome](../../src/tui/reports/setup.ts#L295) (status: OperationRecord["status"], payload: InitPayload) → string <!-- internal -->
        <a id="tui.reports.setup.initOutcome"></a><br>`set up`, `partial: map failed`, `keylang.json not written`, `cancelled after map`, or a check's three stages: never a success for a partial run. A completed write names the stages with their own reports; `.gitignore` is named once it failed or did not run.
        - calls [tui.reports.setup.agentsOutcome](tui.md#tui.reports.setup.agentsOutcome), [tui.reports.setup.baselineOutcome](tui.md#tui.reports.setup.baselineOutcome), [tui.reports.setup.gitignoreOutcome](tui.md#tui.reports.setup.gitignoreOutcome), [tui.reports.setup.initStages](tui.md#tui.reports.setup.initStages), [tui.reports.setup.gitignoreFailed](tui.md#tui.reports.setup.gitignoreFailed)
      - fn [gitignoreOutcome](../../src/tui/reports/setup.ts#L314) (stage: GitignoreStage, check: boolean) → string <!-- internal -->
        <a id="tui.reports.setup.gitignoreOutcome"></a><br>What init's `.gitignore` stage found or did: `lists .keylang/`, `.keylang/ added`, `does not list .keylang/`, a refusal or an I/O error.
      - fn [gitignoreFailed](../../src/tui/reports/setup.ts#L322) (stage: GitignoreStage) → boolean <!-- internal -->
        <a id="tui.reports.setup.gitignoreFailed"></a><br>The stage keeps init from code 0: an I/O error, a refusal, or no `.keylang/` line (a check).
      - fn [initStages](../../src/tui/reports/setup.ts#L327) (payload: InitPayload) → { name: string; result: OperationResult | null }[] <!-- internal -->
        <a id="tui.reports.setup.initStages"></a><br>The stages of an init write, in the order they ran.
      - fn [mapOutcome](../../src/tui/reports/setup.ts#L336) (status: OperationRecord["status"], payload: MapPayload) → string <!-- internal -->
        <a id="tui.reports.setup.mapOutcome"></a><br>`3 written, 1 removed`, `1 conflict(s), nothing written`, `2 of 5 done, failed` — what a map write really did.
      - fn [baselineOutcome](../../src/tui/reports/setup.ts#L349) (status: OperationRecord["status"], payload: BaselinePayload) → string <!-- internal -->
        <a id="tui.reports.setup.baselineOutcome"></a><br>`up to date`, `stale`, `written`, `manual file, nothing written`, `inputs changed, nothing written`.
      - fn [mapCheckOutcome](../../src/tui/reports/setup.ts#L359) (payload: MapCheckPayload) → string <!-- internal -->
        <a id="tui.reports.setup.mapCheckOutcome"></a><br>`up to date`, `3 stale`, `1 conflict(s)` (conflicts first: they block `keylang map`).
  - module [results-panel](../../src/tui/results-panel.ts#L1)
    <a id="tui.results-panel"></a><br>The F6 panel's keys: the pinned current analysis with its findings and filters, and the history of operation records — their reports, the items Tab selects in them, a rerun, an export, a proposal opened in MERGE. A finding's or an item's place is shown with the panel hidden…
    - node [external.node](external.md#external.node)
    - check-results [features.check-results](features.md#features.check-results)
    - operations [operations.operations](operations.md#operations.operations)
    - proposals [features.proposals](features.md#features.proposals)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - findings [tui.findings](tui.md#tui.findings)
    - input [tui.input](tui.md#tui.input)
    - check [tui.reports.check](tui.md#tui.reports.check)
    - records [tui.reports.records](tui.md#tui.reports.records)
    - rows [tui.reports.rows](tui.md#tui.reports.rows)
    - state [tui.state](tui.md#tui.state)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - type [ResultsHost](../../src/tui/results-panel.ts#L27)
      <a id="tui.results-panel.ResultsHost"></a><br>What the F6 panel needs from the session: the operations its keys run, and the editor and viewer that show a place.
    - module [ResultsPanel](../../src/tui/results-panel.ts#L53)
      <a id="tui.results-panel.ResultsPanel"></a>
      - fn [constructor](../../src/tui/results-panel.ts#L56) (host: ResultsHost)
        <a id="tui.results-panel.ResultsPanel.constructor"></a>
      - fn [state](../../src/tui/results-panel.ts#L60) () → State <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.state"></a>
      - fn [openResults](../../src/tui/results-panel.ts#L65) () → void
        <a id="tui.results-panel.ResultsPanel.openResults"></a><br>F6 or the palette: the pinned current analysis and the history of operation records.
        - calls [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [closeResults](../../src/tui/results-panel.ts#L83) () → void
        <a id="tui.results-panel.ResultsPanel.closeResults"></a><br>Esc closes the panel, not the running operation; the focus goes back where F6 was pressed.
      - fn [rerunRecord](../../src/tui/results-panel.ts#L92) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.rerunRecord"></a><br>Enter in the panel: reruns the selected record with its exact parameters.
        - calls [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults)
      - fn [resultsKey](../../src/tui/results-panel.ts#L131) (event: KeyEvent) → void
        <a id="tui.results-panel.ResultsPanel.resultsKey"></a><br>While the panel is open its keys stay with it; Tab switches between the entries and the content.
        - calls [tui.results-panel.ResultsPanel.findingsKey](tui.md#tui.results-panel.ResultsPanel.findingsKey), [tui.view.layout](tui.md#tui.view.layout), [tui.view.reportOverflow](tui.md#tui.view.reportOverflow), [tui.reports.records.resultsReportRows](tui.md#tui.reports.records.resultsReportRows), [tui.results-panel.ResultsPanel.scrollReport](tui.md#tui.results-panel.ResultsPanel.scrollReport), [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding), [tui.results-panel.ResultsPanel.showGapReason](tui.md#tui.results-panel.ResultsPanel.showGapReason), [tui.results-panel.ResultsPanel.selectedGap](tui.md#tui.results-panel.ResultsPanel.selectedGap), [tui.results-panel.ResultsPanel.openGap](tui.md#tui.results-panel.ResultsPanel.openGap), [tui.results-panel.ResultsPanel.wireTarget](tui.md#tui.results-panel.ResultsPanel.wireTarget), [tui.results-panel.ResultsPanel.openWireTarget](tui.md#tui.results-panel.ResultsPanel.openWireTarget), [tui.results-panel.ResultsPanel.rerunRecord](tui.md#tui.results-panel.ResultsPanel.rerunRecord), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.results-panel.ResultsPanel.specCodeForGap](tui.md#tui.results-panel.ResultsPanel.specCodeForGap)
      - fn [findingsKey](../../src/tui/results-panel.ts#L214) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.findingsKey"></a><br>The keys of the pinned "Current analysis" entry: the findings list with verdict filters.
        - calls [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout), [tui.results-panel.ResultsPanel.moveFinding](tui.md#tui.results-panel.ResultsPanel.moveFinding), [tui.results-panel.ResultsPanel.openFinding](tui.md#tui.results-panel.ResultsPanel.openFinding), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [moveFinding](../../src/tui/results-panel.ts#L267) (delta: number) → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.moveFinding"></a><br>Moves the finding selection and keeps it in the visible part of the list.
        - calls [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [clampFinding](../../src/tui/results-panel.ts#L273) () → void
        <a id="tui.results-panel.ResultsPanel.clampFinding"></a><br>The finding selection stays within the filtered list, and the list scrolls to keep it in view.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout)
      - fn [selectedFinding](../../src/tui/results-panel.ts#L283) () → CheckResult | undefined
        <a id="tui.results-panel.ResultsPanel.selectedFinding"></a><br>The finding selected in the filtered list of the current analysis, if any.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf)
      - fn [openFinding](../../src/tui/results-panel.ts#L293) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openFinding"></a><br>Enter on a finding: the panel hides while the target is shown — a spec position in the editor (the file need not be among the Markdown buffers) or the line in the read-only code viewer. Esc / Ctrl+O return to the list without losing the selection and put back the place it was…
        - calls [tui.results-panel.ResultsPanel.selectedFinding](tui.md#tui.results-panel.ResultsPanel.selectedFinding), [tui.results-panel.ResultsPanel.openTarget](tui.md#tui.results-panel.ResultsPanel.openTarget)
      - fn [openTarget](../../src/tui/results-panel.ts#L299) (file: string, targetLine: number, targetCol: number) → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openTarget"></a><br>Shows a spec position (1-based line, code-point column) or a code line with the F6 panel hidden; the origin is kept for the way back.
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.width.clusterAt](tui.md#tui.width.clusterAt)
      - fn [returnToFindings](../../src/tui/results-panel.ts#L324) () → void
        <a id="tui.results-panel.ResultsPanel.returnToFindings"></a><br>Back from a finding's target: the list with its selection, over the place the finding was opened from.
      - fn [scrollReport](../../src/tui/results-panel.ts#L345) (delta: number) → void
        <a id="tui.results-panel.ResultsPanel.scrollReport"></a>
        - calls [tui.results-panel.ResultsPanel.moveFinding](tui.md#tui.results-panel.ResultsPanel.moveFinding), [tui.reports.records.resultsReportRows](tui.md#tui.reports.records.resultsReportRows), [tui.reports.records.reportItems](tui.md#tui.reports.records.reportItems), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.layout](tui.md#tui.view.layout), [tui.results-panel.ResultsPanel.showGapReason](tui.md#tui.results-panel.ResultsPanel.showGapReason)
      - fn [selectedGap](../../src/tui/results-panel.ts#L368) () → ReportItem | undefined <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.selectedGap"></a>
        - calls [tui.reports.records.reportItems](tui.md#tui.reports.records.reportItems)
      - fn [showGapReason](../../src/tui/results-panel.ts#L373) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.showGapReason"></a><br>The report row cuts a long reason; the message line shows the selected item's whole reason.
        - calls [tui.results-panel.ResultsPanel.selectedGap](tui.md#tui.results-panel.ResultsPanel.selectedGap), [tui.results-panel.ResultsPanel.plannedGap](tui.md#tui.results-panel.ResultsPanel.plannedGap)
      - fn [plannedGap](../../src/tui/results-panel.ts#L379) () → string | null <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.plannedGap"></a><br>The ID of the selected gap of a feature report when it is a planned fn no code implements yet, else null.
        - calls [tui.reports.check.featureItems](tui.md#tui.reports.check.featureItems)
      - fn [specCodeForGap](../../src/tui/results-panel.ts#L387) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.specCodeForGap"></a><br>`g` on a planned gap: the spec-to-code form with its ID; the report stays in the history.
        - calls [tui.results-panel.ResultsPanel.plannedGap](tui.md#tui.results-panel.ResultsPanel.plannedGap), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults)
      - fn [openGap](../../src/tui/results-panel.ts#L398) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openGap"></a><br>Enter on a gap or a check result: its file and position, like a finding (Esc / Ctrl+O come back to the report).
        - calls [tui.results-panel.ResultsPanel.selectedGap](tui.md#tui.results-panel.ResultsPanel.selectedGap), [tui.results-panel.ResultsPanel.openTarget](tui.md#tui.results-panel.ResultsPanel.openTarget)
      - fn [wireTarget](../../src/tui/results-panel.ts#L404) () → { file: string; line: number; col: number } | null <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.wireTarget"></a><br>What Enter over the selected wire report opens: the first blocking error, else the generated file when it is on disk.
      - fn [openWireTarget](../../src/tui/results-panel.ts#L413) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openWireTarget"></a><br>The generated code opens in the read-only viewer, not as a writable buffer; Esc / Ctrl+O come back to the report.
        - calls [tui.results-panel.ResultsPanel.wireTarget](tui.md#tui.results-panel.ResultsPanel.wireTarget), [tui.results-panel.ResultsPanel.openTarget](tui.md#tui.results-panel.ResultsPanel.openTarget)
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
      <a id="tui.screen.Grid"></a><br>An off-screen character matrix where each cell holds a grapheme and style, with clipped text writing that handles double-width characters, rectangle filling, and row access used by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - fn [constructor](../../src/tui/screen.ts#L38) (cols: number, rows: number)
        <a id="tui.screen.Grid.constructor"></a><br>Clamps the requested width and height to at least 1 and allocates a rows-by-cols matrix of cells, each initialized to a space character with the `PLAIN` style. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [write](../../src/tui/screen.ts#L45) (x: number, y: number, text: string, style: Style = PLAIN, limit = this.cols - x) → number
        <a id="tui.screen.Grid.write"></a><br>Writes `text` from (x, y), clipped to `limit` cells; returns the cells used.
        - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [fill](../../src/tui/screen.ts#L66) (x: number, y: number, width: number, height: number, style: Style = PLAIN) → void
        <a id="tui.screen.Grid.fill"></a><br>Overwrites every cell in a rectangle, clipped to the grid bounds, with a space in the given style, first calling [`tui.screen.Grid.clearWide`](tui.md#tui.screen.Grid.clearWide) so partially covered wide characters are removed. Used by the [`tui.view`](tui.md#tui.view) draw functions to clear panel backgrounds before rendering… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [clearWide](../../src/tui/screen.ts#L76) (col: number, row: number) → void <!-- internal -->
        <a id="tui.screen.Grid.clearWide"></a><br>A wide character split by an overwrite leaves no half behind.
      - fn [lines](../../src/tui/screen.ts#L83) () → string[]
        <a id="tui.screen.Grid.lines"></a><br>Plain text of each row, trailing spaces kept.
      - fn [styleAt](../../src/tui/screen.ts#L88) (x: number, y: number) → Style
        <a id="tui.screen.Grid.styleAt"></a><br>The style of one cell (tests check colours and emphasis this way).
      - fn [row](../../src/tui/screen.ts#L92) (y: number) → readonly Cell[]
        <a id="tui.screen.Grid.row"></a><br>Returns the array of cells stored at line index `y` of the grid, or an empty array when that line doesn't exist, so [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) can compare rows without bounds checks. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [drawBox](../../src/tui/screen.ts#L101) (grid: Grid, rect: { x: number; y: number; width: number; height: number }, title: string, style: Style, titleStyle: Style, round = false) → void
      <a id="tui.screen.drawBox"></a><br>A box over the grid: filled with `style`, framed, its title on the top edge. `round` corners (`╭╮╰╯`) are the clip's window; the popups are square.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [sgr](../../src/tui/screen.ts#L115) (style: Style) → string <!-- internal -->
      <a id="tui.screen.sgr"></a><br>Builds an ANSI SGR escape sequence from a style record, always starting with a reset code and appending bold, dim, italic, underline, inverse, and 256-color foreground/background codes when set. Used by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) to emit terminal styling for changed cells. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [safeLink](../../src/tui/screen.ts#L132) (link: string | undefined) → string | undefined
      <a id="tui.screen.safeLink"></a><br>An OSC 8 target that is safe to send: a control character (ESC, BEL, C1) would end the sequence early and let the rest of a URL from a spec reach the terminal as its own escape sequence. Such a link is dropped.
    - fn [sameStyle](../../src/tui/screen.ts#L137) (a: Style, b: Style) → boolean <!-- internal -->
      <a id="tui.screen.sameStyle"></a><br>Compares two cell styles field by field — colors, link, and the boolean attributes coerced so missing and false match — so [`tui.screen.rowEqual`](tui.md#tui.screen.rowEqual) and [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) can skip unchanged cells. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [rowEqual](../../src/tui/screen.ts#L141) (a: readonly Cell[], b: readonly Cell[]) → boolean <!-- internal -->
      <a id="tui.screen.rowEqual"></a><br>Compares two rows of cells, returning false if lengths differ or any position has a different character or a style that [`tui.screen.sameStyle`](tui.md#tui.screen.sameStyle) rejects. Used by [`tui.screen.renderDiff`](tui.md#tui.screen.renderDiff) to skip unchanged rows when emitting terminal output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.screen.sameStyle](tui.md#tui.screen.sameStyle)
    - fn [renderDiff](../../src/tui/screen.ts#L148) (prev: Grid | null, next: Grid) → string
      <a id="tui.screen.renderDiff"></a><br>ANSI that turns `prev` into `next` on screen; a full repaint when there is no `prev` or the size changed.
      - calls [tui.screen.Grid.row](tui.md#tui.screen.Grid.row), [tui.screen.rowEqual](tui.md#tui.screen.rowEqual), [tui.screen.sameStyle](tui.md#tui.screen.sameStyle), [tui.screen.safeLink](tui.md#tui.screen.safeLink), [tui.screen.sgr](tui.md#tui.screen.sgr)
  - module [state](../../src/tui/state.ts#L1)
    <a id="tui.state"></a><br>The state of one TUI session. The same state drives the terminal and the browser: a transport only feeds input and shows the frames `view.ts` draws.
    - analyze [map.analyze](map.md#map.analyze)
    - c4-export [map.c4-export](map.md#map.c4-export)
    - config [base.config](base.md#base.config)
    - explanations [map.explanations](map.md#map.explanations)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - ir [lang.ir](lang.md#lang.ir)
    - operations [operations.operations](operations.md#operations.operations)
    - clip [tui.clip](tui.md#tui.clip)
    - findings [tui.findings](tui.md#tui.findings)
    - merge [tui.merge](tui.md#tui.merge)
    - type [Mode](../../src/tui/state.ts#L16) = "view" | "edit" | "read" | "code" | "merge" | "zoom"
      <a id="tui.state.Mode"></a><br>Union of the six interaction modes the terminal UI can be in: viewing, editing, reading, code, merging and zooming. It restricts the mode value held in UI state to exactly these string literals. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [Focus](../../src/tui/state.ts#L17) = "editor" | "nav" | "files" | "context" | "results"
      <a id="tui.state.Focus"></a><br>A string-literal union naming the five panes that can hold keyboard focus in the TUI: editor, nav, files, context, and results, so the state can track which one receives input. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Cursor](../../src/tui/state.ts#L19)
      <a id="tui.state.Cursor"></a><br>Holds a text position as a 0-based line index and a 0-based column counted in Unicode code points rather than UTF-16 units. Used by the TUI layer to track where editing or selection is happening. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Buffer](../../src/tui/state.ts#L26)
      <a id="tui.state.Buffer"></a><br>Holds one open file in the editor: its current text alongside the saved and on-disk copies to detect unsaved or externally changed state, plus line-ending, read-only and new-file flags. Also carries the parsed `Document`, an undo stack of text-and-cursor snapshots, and a… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Hover](../../src/tui/state.ts#L52)
      <a id="tui.state.Hover"></a><br>Describes a hover popup in the TUI: the screen cell it is anchored at, its typed lines (title, text, code, evidence, or rule), and whether it was triggered by the mouse or by pressing `K` at the cursor. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CodeView](../../src/tui/state.ts#L61)
      <a id="tui.state.CodeView"></a><br>Holds the data a code pane renders for a single node location: the file path, its 1-based target line, the loaded text lines, the current scroll offset, and a `vscode://file/…:line` URL emitted as an OSC 8 hyperlink. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MergeState](../../src/tui/state.ts#L71)
      <a id="tui.state.MergeState"></a><br>Holds everything an in-progress hunk-by-hunk merge needs: target path and origin, the mode to return to, base lines, the on-disk and proposal snapshots used to detect concurrent edits at `w`, plus hunks, decisions, undo history, and cursor/scroll position. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LastMerge](../../src/tui/state.ts#L96)
      <a id="tui.state.LastMerge"></a><br>Snapshot of the buffer, on-disk, and proposal-file text from before and after a merge so an `u` undo can revert it only when each target still matches its post-merge contents; a `code` flag marks source files checked on disk alone. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Prompt](../../src/tui/state.ts#L113)
      <a id="tui.state.Prompt"></a><br>State of the TUI's active input prompt: which command form or picker is open, the typed text, matching items with ids and notes, the selected index, and optional per-command form fields for checks, drafts, exports and explanations. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [C4Form](../../src/tui/state.ts#L179)
      <a id="tui.state.C4Form"></a><br>The choices of `export c4 [--format] [--level] [--layer]` (c4-zoom/12).
    - type [ExplainPlanForm](../../src/tui/state.ts#L193)
      <a id="tui.state.ExplainPlanForm"></a><br>The inventory form: the stale and gone saved explanations, or the plan of a brief batch (`missing` also plans stale briefs) with its estimate. The limit and the jobs are kept as typed and checked as the CLI checks them.
    - type [SpecCodeForm](../../src/tui/state.ts#L200)
      <a id="tui.state.SpecCodeForm"></a><br>The fields of `spec-to-code <id> [--into] [--mode]`, and whether it proposes or only previews.
    - type [CodeDraftForm](../../src/tui/state.ts#L216)
      <a id="tui.state.CodeDraftForm"></a><br>The fields of `code-to-spec <path[:line]> | --since <ref> [--into] [--mode]` and whether it proposes or only previews. `source` picks the fields the request takes: the other source's fields stay as typed but are never sent.
    - type [RulesDraftForm](../../src/tui/state.ts#L231)
      <a id="tui.state.RulesDraftForm"></a><br>The fields of `draft rules [--into] [--mode]` and whether it proposes or only previews.
    - type [DraftForm](../../src/tui/state.ts#L239)
      <a id="tui.state.DraftForm"></a><br>The fields of `draft flow <trigger> [--name] [--into] [--mode]` and whether it proposes or only previews.
    - type [ExportForm](../../src/tui/state.ts#L253)
      <a id="tui.state.ExportForm"></a><br>The export form of one finished report. `expect` is the target as the form last showed it (null: absent); Save sends it, so a file changed after that is a conflict, never overwritten. `problem` is why Save is refused now.
    - type [SpecKind](../../src/tui/state.ts#L267) = "flow" | "rules" | "wiring" | "feature" | "blank"
      <a id="tui.state.SpecKind"></a><br>The kinds of a new specification: its first text follows the kind (design §2.8).
    - type [NewSpecForm](../../src/tui/state.ts#L269)
      <a id="tui.state.NewSpecForm"></a><br>Holds the in-progress state of the dialog that creates a new spec: which of the three steps is active, the chosen `SpecKind`, and the relative path once the path step is done (empty until then). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OperationRecord](../../src/tui/state.ts#L278)
      <a id="tui.state.OperationRecord"></a><br>A run of one explicit operation in this session, kept in memory for F6 (design §2.6).
    - type [QuitStep](../../src/tui/state.ts#L308)
      <a id="tui.state.QuitStep"></a><br>`q` or Ctrl+C while an explicit operation runs (design §5): Stay, or Cancel and exit. `waiting`: Cancel and exit was chosen and the operation is finishing its current file step; once it settles, the usual question about unsaved buffers is asked again — the cancel is no leave to…
    - type [SaveBarrier](../../src/tui/state.ts#L321)
      <a id="tui.state.SaveBarrier"></a><br>The step before an operation that reads the disk (design §2.5): the dirty spec and config buffers it would not see, and what it would write. Save and continue writes them in order and starts the operation only when every write succeeded; Back writes nothing. `error` names the…
    - type [ConfigState](../../src/tui/state.ts#L342)
      <a id="tui.state.ConfigState"></a><br>How the session found `keylang.json` on disk. The analysis always reads the saved file; an unsaved config buffer never takes effect.
    - type [Place](../../src/tui/state.ts#L349)
      <a id="tui.state.Place"></a><br>Snapshot of a navigable location: a file path plus the cursor position and editing mode active there, so the TUI can record and return to a spot in a file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ZoomState](../../src/tui/state.ts#L359)
      <a id="tui.state.ZoomState"></a><br>The zoom screen (c4-zoom/07): the map one level at a time. Lives only in the session; leaving it drops nothing on disk.
    - type [State](../../src/tui/state.ts#L376)
      <a id="tui.state.State"></a><br>The whole terminal UI's mutable session state: open buffers, cursor and viewport, panels and focus, the latest analysis with its staleness and error flags, modal steps, operation records, completions, ghost lines and the clip chat. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
    - type [FeatureLine](../../src/tui/state.ts#L485)
      <a id="tui.state.FeatureLine"></a><br>Where a feature file stands, for the status line and what the clip's model reads.
  - module [terminal](../../src/tui/terminal.ts#L1)
    <a id="tui.terminal"></a><br>`keylang` in a terminal: raw stdin, the alternate screen, SGR mouse, and `$VISUAL` / `$EDITOR` for jumps into code. The screen is restored on every exit path, including a crash, and `runTerminal` then returns a contract exit code to `main` (0 for a quit or a signal, 2 for a…
    - node [external.node](external.md#external.node)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - screen [tui.screen](tui.md#tui.screen)
    - fn [editorCommand](../../src/tui/terminal.ts#L19) (env: NodeJS.ProcessEnv, file: string, line: number) → { command: string; args: string[]; wait: boolean } | null
      <a id="tui.terminal.editorCommand"></a><br>How to open `file` at `line` with the configured editor, or null without one.
      - calls [tui.terminal.splitCommand](tui.md#tui.terminal.splitCommand)
    - fn [splitCommand](../../src/tui/terminal.ts#L36) (value: string, exists: (path: string) => boolean = existsSync) → string[]
      <a id="tui.terminal.splitCommand"></a><br>Words of a `$EDITOR` value the way a shell splits them: quotes and backslashes keep spaces (`"/opt/My Editor/bin/edit" -w`). An unquoted value that names an existing file is one word, so a path with spaces works as is.
    - type [TerminalInput](../../src/tui/terminal.ts#L61)
      <a id="tui.terminal.TerminalInput"></a><br>The terminal's input: a TTY in raw mode, or a stand-in in a test.
    - type [TerminalOutput](../../src/tui/terminal.ts#L71)
      <a id="tui.terminal.TerminalOutput"></a><br>Abstract sink for terminal rendering: exposes optional column/row dimensions, a method to write text, and subscription/unsubscription for resize events. It lets the TUI target a real stdout or a test double interchangeably. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TerminalSignal](../../src/tui/terminal.ts#L79)
      <a id="tui.terminal.TerminalSignal"></a><br>A string-literal union naming the six POSIX signals the terminal layer handles: termination, hangup, interrupt, quit, stop, and continue. It constrains signal-handler registration and cleanup code to those exact names. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TerminalHost](../../src/tui/terminal.ts#L82)
      <a id="tui.terminal.TerminalHost"></a><br>What the terminal session needs from its process; `processHost()` is the real one.
    - fn [processHost](../../src/tui/terminal.ts#L98) () → TerminalHost
      <a id="tui.terminal.processHost"></a><br>Builds the real-process terminal host for [`tui.terminal.runTerminal`](tui.md#tui.terminal.runTerminal): wires stdio and env, registers and removes signal and crash handlers, and suspends by sending SIGSTOP to the whole process group. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [runTerminal](../../src/tui/terminal.ts#L121) (root: string, host: TerminalHost = processHost(), session: Pick<AppOptions, "operations" | "operationWorker"> = {}) → Promise<number>
      <a id="tui.terminal.runTerminal"></a><br>`session`: the operation runner or worker the session uses instead of its own (tests hold an operation with it).
      - calls [tui.terminal.processHost](tui.md#tui.terminal.processHost), [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [tui.app.App](tui.md#tui.app.App), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.input](tui.md#tui.app.App.input), [tui.app.App.resize](tui.md#tui.app.App.resize), [tui.app.App.detach](tui.md#tui.app.App.detach), [base.config.toPosix](base.md#base.config.toPosix), [tui.terminal.editorCommand](tui.md#tui.terminal.editorCommand), [tui.app.App.attach](tui.md#tui.app.App.attach), [tui.app.App.close](tui.md#tui.app.App.close), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
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
    - fn [idStyle](../../src/tui/theme.ts#L48) (id: string, layers: readonly string[]) → Style
      <a id="tui.theme.idStyle"></a><br>Colour of an ID by the layer it starts with, in the order of `keylang.json`.
    - type [Run](../../src/tui/theme.ts#L56)
      <a id="tui.theme.Run"></a><br>A styled run on one line: code-point columns `[start, end)`, 0-based.
    - fn [highlight](../../src/tui/theme.ts#L63) (doc: Document | null, text: string, layers: readonly string[]) → Map<number, Run[]>
      <a id="tui.theme.highlight"></a><br>Highlight runs by 1-based line; later runs win where they overlap.
      - calls [tui.theme.idStyle](tui.md#tui.theme.idStyle), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
  - module [view](../../src/tui/view.ts#L1)
    <a id="tui.view"></a><br>Drawing a TUI state into a `Grid`: pure, so a test reads the frame as text. Layout: title, [files] | editor with gutter | [navigation], a detail line and the status bar.
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - config [base.config](base.md#base.config)
    - explain [features.explain](features.md#features.explain)
    - explanations [map.explanations](map.md#map.explanations)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - actions [tui.actions](tui.md#tui.actions)
    - clip [tui.clip](tui.md#tui.clip)
    - clip-view [tui.clip-view](tui.md#tui.clip-view)
    - code-highlight [tui.code-highlight](tui.md#tui.code-highlight)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - findings [tui.findings](tui.md#tui.findings)
    - markdown [tui.markdown](tui.md#tui.markdown)
    - merge [tui.merge](tui.md#tui.merge)
    - nav [tui.nav](tui.md#tui.nav)
    - records [tui.reports.records](tui.md#tui.reports.records)
    - zoom [tui.zoom](tui.md#tui.zoom)
    - screen [tui.screen](tui.md#tui.screen)
    - state [tui.state](tui.md#tui.state)
    - theme [tui.theme](tui.md#tui.theme)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - width [tui.width](tui.md#tui.width)
    - type [Rect](../../src/tui/view.ts#L28)
      <a id="tui.view.Rect"></a><br>Describes a rectangular screen region by its top-left origin and size, all as plain numbers, giving terminal UI code a shared shape for layout boundaries. It carries no behavior, only the four fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Layout](../../src/tui/view.ts#L35)
      <a id="tui.view.Layout"></a><br>Holds the screen rectangles computed for each TUI region: files and nav may be absent, while editor, detail and status are always present. The `panel` rect is where help, forms and modal steps draw, covering the editor area on wide terminals or the whole body on narrow ones. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [layout](../../src/tui/view.ts#L58) (state: Pick<State, "cols" | "rows" | "showFiles" | "showNav"> & { context?: State["context"]; focus?: State["focus"]; lastPanel?: State["lastPanel"] }) → Layout
      <a id="tui.view.layout"></a><br>Computes screen rectangles for the files pane, editor, side nav/context panel, detail line and status bar from the terminal size and panel flags. On narrow terminals it keeps only one side panel (the focused or last-opened) and lets an open context panel replace the nav at a… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [EditorRow](../../src/tui/view.ts#L88)
      <a id="tui.view.EditorRow"></a><br>One editor row: a text line, or the expanded evidence row under the cursor line.
    - fn [lineCount](../../src/tui/view.ts#L90) (buffer: Buffer) → number
      <a id="tui.view.lineCount"></a><br>Returns how many lines a buffer contains by taking the length of the array produced by [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines). It feeds [`tui.view.editorRows`](tui.md#tui.view.editorRows) and [`tui.view.gutterWidth`](tui.md#tui.view.gutterWidth), which size the editor's visible rows and line-number column. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
    - fn [gutterWidth](../../src/tui/view.ts#L94) (buffer: Buffer) → number
      <a id="tui.view.gutterWidth"></a><br>Computes the column width reserved for the editor's line-number gutter: a 2-column lead, the digit count of [`tui.view.lineCount`](tui.md#tui.view.lineCount) padded to at least 3, plus a trailing separator. Used by [`tui.view.drawEditor`](tui.md#tui.view.drawEditor), [`tui.view.drawCompletion`](tui.md#tui.view.drawCompletion), and the [`tui.app.App`](tui.md#tui.app.App) cursor/hit-test… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount)
    - fn [editorRows](../../src/tui/view.ts#L99) (state: State, buffer: Buffer, height: number) → EditorRow[]
      <a id="tui.view.editorRows"></a><br>Rows shown from `top`: the cursor line gets an evidence row below it when it has evidence.
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf)
    - fn [drawRuns](../../src/tui/view.ts#L115) (grid: Grid, x: number, y: number, width: number, clusters: Iterable<{ cluster: string; point: number }>, runs: readonly Run[], base: Style) → void <!-- internal -->
      <a id="tui.view.drawRuns"></a><br>Draws clusters with their code-point positions until `width` cells are used; a cluster (a letter with its marks, a ZWJ emoji) takes the style of its first code point. Only what fits is visited, however long the line.
      - calls [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [fromLayout](../../src/tui/view.ts#L126) (line: LineLayout, from: number) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromLayout"></a><br>The clusters of a laid-out line from cluster `from` on.
    - fn [fromText](../../src/tui/view.ts#L131) (text: string) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromText"></a><br>The clusters of `text` from the start, segmented only as far as they are read.
      - calls [tui.width.clusters](tui.md#tui.width.clusters)
    - fn [cellsBetween](../../src/tui/view.ts#L140) (line: LineLayout, from: number, to: number) → number <!-- internal -->
      <a id="tui.view.cellsBetween"></a><br>Cells between clusters `from` and `to` of a laid-out line (0 when `to` is before `from`).
    - fn [markCell](../../src/tui/view.ts#L145) (item: LineEvidence | undefined, stale: boolean) → { glyph: string; style: Style } <!-- internal -->
      <a id="tui.view.markCell"></a><br>Maps a line's evidence mark to its gutter glyph and style via `MARK_GLYPH` and `MARK_STYLE`, returning a blank cell when there is no evidence. When stale, it dims the style and drops bold. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [detailText](../../src/tui/view.ts#L154) (item: LineEvidence, snapshotId: string | null) → { text: string; style: Style }[]
      <a id="tui.view.detailText"></a><br>`ID ✓ static ✓ tests — trace ◌ …`: the channels of a line, never merged into one mark.
    - fn [lineMessage](../../src/tui/view.ts#L176) (item: LineEvidence | undefined) → { text: string; style: Style } | null
      <a id="tui.view.lineMessage"></a><br>The message for the cursor line: the first failing or unverified finding, with a fix hint.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [runsOf](../../src/tui/view.ts#L192) (buffer: Buffer, layers: readonly string[]) → Map<number, Run[]> <!-- internal -->
      <a id="tui.view.runsOf"></a><br>Returns per-line highlight runs for a buffer, caching them in a module-level map keyed by the buffer's document (or the buffer itself) and the joined layer names. On a cache miss, or whenever the buffer has no document, it recomputes via [`tui.theme.highlight`](tui.md#tui.theme.highlight) and stores the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [tui.theme.highlight](tui.md#tui.theme.highlight)
    - fn [drawEditor](../../src/tui/view.ts#L202) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawEditor"></a><br>Paints the editor pane: per-line evidence marks, line numbers, syntax runs from [`tui.view.runsOf`](tui.md#tui.view.runsOf), selection and cursor-line highlighting, and expanded detail rows. In edit mode it also overlays ghost-completion text and positions the cursor. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.runsOf](tui.md#tui.view.runsOf), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.detailText](tui.md#tui.view.detailText), [tui.view.markCell](tui.md#tui.view.markCell), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromLayout](tui.md#tui.view.fromLayout), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [readLayout](../../src/tui/view.ts#L248) (buffer: Buffer, width: number) → { rows: ReadRow[]; firstRow: Map<number, number> } <!-- internal -->
      <a id="tui.view.readLayout"></a>
      - calls [tui.markdown.renderMarkdown](tui.md#tui.markdown.renderMarkdown)
    - fn [readRows](../../src/tui/view.ts#L262) (state: State, buffer: Buffer, rect: Rect) → { rows: ReadRow[]; firstRow: Map<number, number>; cursorRow: number; top: number } <!-- internal -->
      <a id="tui.view.readRows"></a><br>Reading mode: the rendered rows, the first row of each source line, the row of the cursor line, and the first row shown.
      - calls [tui.view.readLayout](tui.md#tui.view.readLayout)
    - fn [readCursorRow](../../src/tui/view.ts#L271) (state: State, buffer: Buffer, rect: Rect) → number
      <a id="tui.view.readCursorRow"></a><br>The screen row (from the editor's top) where reading mode shows the cursor line: popups anchor there.
      - calls [tui.view.readRows](tui.md#tui.view.readRows)
    - fn [drawRead](../../src/tui/view.ts#L276) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawRead"></a><br>Renders the visible rows of a source buffer into the grid via [`tui.view.readRows`](tui.md#tui.view.readRows), highlighting the cursor line and placing an evidence gutter mark from [`tui.view.markCell`](tui.md#tui.view.markCell) on each line's first row. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.readRows](tui.md#tui.view.readRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.markCell](tui.md#tui.view.markCell), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawCode](../../src/tui/view.ts#L296) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawCode"></a><br>Renders the read-only source panel: a title bar with a file:line link and an Esc hint, then line-numbered rows from the scroll offset, marking the target line and painting [`tui.code-highlight.highlightCode`](tui.md#tui.code-highlight.highlightCode) runs via [`tui.view.drawRuns`](tui.md#tui.view.drawRuns). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.code-highlight.highlightCode](tui.md#tui.code-highlight.highlightCode), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromText](tui.md#tui.view.fromText)
    - fn [zoomListHeight](../../src/tui/view.ts#L321) (state: Pick<State, "rows">, rect: Rect) → number
      <a id="tui.view.zoomListHeight"></a><br>Rows the list of the zoom screen has in `rect`.
    - fn [originText](../../src/tui/view.ts#L331) (e: NodeExplanation) → string <!-- internal -->
      <a id="tui.view.originText"></a><br>Where an explanation's words come from, as the nav panel says it.
      - calls [map.explanations.modelName](map.md#map.explanations.modelName)
    - fn [fitCrumbs](../../src/tui/view.ts#L337) (labels: readonly string[], width: number) → string
      <a id="tui.view.fitCrumbs"></a><br>Crumbs that fit `width`: the nearest levels kept, the farthest cut first behind `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [zoomRowText](../../src/tui/view.ts#L346) (state: State, row: ZoomRow, width: number, overlay: FlowOverlay | null = null) → { text: string; right: string }
      <a id="tui.view.zoomRowText"></a><br>The text of a zoom row: zoom mark, kind, name, distance, and the brief when there is room.
      - calls [tui.view.stepsMark](tui.md#tui.view.stepsMark), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [endLabel](../../src/tui/view.ts#L363) (focus: string, id: string) → string <!-- internal -->
      <a id="tui.view.endLabel"></a><br>An end of an edge row as the level names it: a child by its name under the focus, anything else by its ID.
    - fn [zoomEdgeText](../../src/tui/view.ts#L368) (focus: string, edge: ZoomEdge, walked = false) → { text: string; right: string }
      <a id="tui.view.zoomEdgeText"></a><br>The text of an edges-view row: group, `from → to`, the kinds with counts, and the count.
      - calls [tui.view.endLabel](tui.md#tui.view.endLabel)
    - fn [stepsMark](../../src/tui/view.ts#L378) (overlay: FlowOverlay, steps: readonly number[]) → Mark | null <!-- internal -->
      <a id="tui.view.stepsMark"></a><br>The worst gutter mark of the steps a row stands for: the same marks the flow's lines have.
      - calls [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [flowSequence](../../src/tui/view.ts#L385) (overlay: FlowOverlay) → string
      <a id="tui.view.flowSequence"></a><br>The layers a flow walks, in the order its steps are written: `cli ① → map ②–④`.
      - calls [tui.zoom.circled](tui.md#tui.zoom.circled)
    - type [ZoomButton](../../src/tui/view.ts#L390)
      <a id="tui.view.ZoomButton"></a><br>A clickable part of the zoom screen's header row (c4-zoom/10): what it does and where it is.
    - fn [zoomButtons](../../src/tui/view.ts#L403) (zoom: { depth: number; view: "nodes" | "edges"; flow: string | null }, width: number) → { text: string; buttons: ZoomButton[] }
      <a id="tui.view.zoomButtons"></a><br>The header's buttons, right-aligned, and their text: `[−] [+] [depth N ▾▴] [c edges] [f flow ▾]`. Each does what its key does; the crumbs get what is left of the row, so on a narrow terminal the crumbs are cut, never a button. `▾` and `▴` are buttons of their own inside the…
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawZoom](../../src/tui/view.ts#L435) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawZoom"></a><br>The zoom screen (c4-zoom/07): crumbs and depth, what the focus is with where the words come from, then the level's rows — children, then the neighbors with their distance — the selected one highlighted.
      - calls [tui.zoom.zoomLevel](tui.md#tui.zoom.zoomLevel), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.zoom.flowOverlay](tui.md#tui.zoom.flowOverlay), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.zoomButtons](tui.md#tui.view.zoomButtons), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.fitCrumbs](tui.md#tui.view.fitCrumbs), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.view.wordRows](tui.md#tui.view.wordRows), [tui.view.originText](tui.md#tui.view.originText), [tui.view.flowSequence](tui.md#tui.view.flowSequence), [tui.view.zoomListHeight](tui.md#tui.view.zoomListHeight), [tui.zoom.zoomEdges](tui.md#tui.zoom.zoomEdges), [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey), [tui.view.zoomEdgeText](tui.md#tui.view.zoomEdgeText), [tui.view.zoomRowText](tui.md#tui.view.zoomRowText), [tui.view.stepsMark](tui.md#tui.view.stepsMark)
    - fn [drawMerge](../../src/tui/view.ts#L495) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawMerge"></a><br>Renders the merge-review panel: a title with file, origin, current hunk and accept/reject/pending counts, then scrolled [`tui.merge.mergeRows`](tui.md#tui.merge.mergeRows) lines with hunk marker, decision glyph, diff sign, and dimmed discarded changes. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.merge.mergeRows](tui.md#tui.merge.mergeRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawPanelList](../../src/tui/view.ts#L520) (grid: Grid, rect: Rect, title: string, entries: { text: string; mark: { glyph: string; style: Style } | null; style?: Style }[], selected: number, focused: boolean, top: number) → void <!-- internal -->
      <a id="tui.view.drawPanelList"></a><br>Renders a titled, scrollable panel list starting at a top offset, highlighting the selected row differently when focused and drawing optional right-aligned marker glyphs via [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [navEntries](../../src/tui/view.ts#L534) (state: State) → NavItem[]
      <a id="tui.view.navEntries"></a><br>Builds the visible navigation list from the state's analysis and expanded-node set by delegating to [`tui.nav.navItems`](tui.md#tui.nav.navItems), giving rendering and input handlers like [`tui.view.drawNav`](tui.md#tui.view.drawNav) and [`tui.app.App.navKey`](tui.md#tui.app.App.navKey) one shared source. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.nav.navItems](tui.md#tui.nav.navItems)
    - fn [navNote](../../src/tui/view.ts#L546) (state: State, width: number) → string[]
      <a id="tui.view.navNote"></a><br>The explanation of the node selected in the nav panel, wrapped to `width` cells with its origin (`code`, or `llm · model · date`, `stale`); none for a node without one or an item that is no node.
      - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.view.wordRows](tui.md#tui.view.wordRows)
    - fn [wordRows](../../src/tui/view.ts#L558) (text: string, width: number) → string[] <!-- internal -->
      <a id="tui.view.wordRows"></a><br>An explanation as rows of `width` cells: its whitespace, line breaks included, one space between words; no words, no rows.
      - calls [tui.width.wrapCells](tui.md#tui.width.wrapCells)
    - fn [navListHeight](../../src/tui/view.ts#L564) (state: State, rect: Rect) → number
      <a id="tui.view.navListHeight"></a><br>Rows of the nav panel's list: what the explanation of the selected node leaves.
      - calls [tui.view.navNote](tui.md#tui.view.navNote)
    - fn [drawNav](../../src/tui/view.ts#L569) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawNav"></a><br>Renders the navigation panel via [`tui.view.drawPanelList`](tui.md#tui.view.drawPanelList) as an indented tree with expand arrows and status marks (dimmed while updating or outdated), reserving a bottom area for any [`tui.view.navNote`](tui.md#tui.view.navNote) text. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.view.navNote](tui.md#tui.view.navNote), [tui.view.navListHeight](tui.md#tui.view.navListHeight), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList)
    - fn [drawContext](../../src/tui/view.ts#L592) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawContext"></a><br>What goes to the model: kind, label and tokens per item; `◇` planned, `?` incomplete data.
      - calls [features.agent-context.contextPack](features.md#features.agent-context.contextPack), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.contextTop](tui.md#tui.view.contextTop)
    - fn [contextTop](../../src/tui/view.ts#L603) (index: number, rect: Rect) → number
      <a id="tui.view.contextTop"></a><br>First item shown in the context panel: the list scrolls to keep the selected item in view. A click maps rows the same way.
    - fn [drawFiles](../../src/tui/view.ts#L607) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawFiles"></a><br>Renders the FILES panel listing open files, appending " +" for dirty buffers ([`tui.buffer.isDirty`](tui.md#tui.buffer.isDirty)) and " ≈" for pending proposals, highlighting the current file via [`tui.view.drawPanelList`](tui.md#tui.view.drawPanelList) scrolled by [`tui.view.filesTop`](tui.md#tui.view.filesTop). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.filesTop](tui.md#tui.view.filesTop)
    - fn [filesTop](../../src/tui/view.ts#L618) (state: Pick<State, "filesIndex">, rect: Rect) → number
      <a id="tui.view.filesTop"></a><br>First file shown in the panel: the list scrolls to keep the selected file in view. A click maps rows the same way.
    - fn [resultsSplit](../../src/tui/view.ts#L625) (state: State, height: number) → { list: number; report: number }
      <a id="tui.view.resultsSplit"></a><br>How the F6 panel splits: the entries list on top, the content of the selected entry below.
    - fn [findingStateRow](../../src/tui/view.ts#L635) (state: State) → string | null
      <a id="tui.view.findingStateRow"></a><br>Why the shown analysis is not a plain current check: a failed run, an update in flight, changes since the analysis, or unsaved buffers taken as overlay.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.view.configNote](tui.md#tui.view.configNote)
    - fn [findingDetailRows](../../src/tui/view.ts#L658) (state: State, width: number) → string[]
      <a id="tui.view.findingDetailRows"></a><br>The details of the selected finding, wrapped to `width`: its full message (the list row cuts it) and then criterion, provenance, snapshot and reason; without a selection, why the list is empty. Always the same number of rows, so the list does not jump while the selection moves.
      - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.view.padRows](tui.md#tui.view.padRows), [tui.view.clipRows](tui.md#tui.view.clipRows), [tui.width.wrapCells](tui.md#tui.width.wrapCells), [tui.findings.findingDetailText](tui.md#tui.findings.findingDetailText)
    - fn [clipRows](../../src/tui/view.ts#L669) (rows: string[], count: number, width: number) → string[] <!-- internal -->
      <a id="tui.view.clipRows"></a><br>The first `count` rows; a cut ends with `…`.
      - calls [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [padRows](../../src/tui/view.ts#L673) (rows: string[]) → string[] <!-- internal -->
      <a id="tui.view.padRows"></a><br>Appends empty strings to the given rows until the array is at least `DETAIL_MESSAGE_ROWS + DETAIL_META_ROWS` long, never truncating. Used by [`tui.view.findingDetailRows`](tui.md#tui.view.findingDetailRows) so the finding detail panel keeps a fixed height. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [findingsListRows](../../src/tui/view.ts#L678) (state: State, rect: Rect) → number
      <a id="tui.view.findingsListRows"></a><br>Rows the findings list takes inside the panel `rect`: the counts, the state and the details of the selected finding come first.
      - calls [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow)
    - fn [drawResults](../../src/tui/view.ts#L685) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawResults"></a><br>The F6 panel over the editor area: the entries on top, the content of the selected entry below.
      - calls [tui.reports.records.reportItems](tui.md#tui.reports.records.reportItems), [tui.reports.records.itemNoun](tui.md#tui.reports.records.itemNoun), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.view.reportOverflow](tui.md#tui.view.reportOverflow), [tui.reports.records.resultsReportRows](tui.md#tui.reports.records.resultsReportRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.reports.records.recordLabel](tui.md#tui.reports.records.recordLabel), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus), [tui.view.drawFindings](tui.md#tui.view.drawFindings), [tui.width.sliceCells](tui.md#tui.width.sliceCells)
    - fn [reportOverflow](../../src/tui/view.ts#L777) (rows: readonly { text: string }[], width: number) → number
      <a id="tui.view.reportOverflow"></a><br>How far ←→ can scroll the report: until the widest row ends in view. A scrolled row starts with `…` in a cell of its own (`sliceCells`), so that is one cell more than the row exceeds `width` by; 0 when every row fits.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawFindings](../../src/tui/view.ts#L784) (grid: Grid, state: State, rect: Rect, dividerY: number) → void <!-- internal -->
      <a id="tui.view.drawFindings"></a><br>The full findings report of the current analysis: counts, filters, the selected finding's details, and the list.
      - calls [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.findings.findingRow](tui.md#tui.findings.findingRow)
    - fn [hoverRect](../../src/tui/view.ts#L829) (hover: NonNullable<State["hover"]>, editor: Rect) → Rect <!-- internal -->
      <a id="tui.view.hoverRect"></a><br>The hover's box: below its anchor where it fits, else above; inside the editor.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawHover](../../src/tui/view.ts#L838) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawHover"></a><br>Renders the hover popup as a bordered box positioned by [`tui.view.hoverRect`](tui.md#tui.view.hoverRect), writing its lines clipped to the box height. Each line is styled by kind (title, code, evidence), and rule lines draw as a horizontal divider. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - calls [tui.view.hoverRect](tui.md#tui.view.hoverRect), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [completionBox](../../src/tui/view.ts#L850) (state: State, editor: Rect, buffer: Buffer) → { rect: Rect; visible: CompletionItem[]; offset: number } <!-- internal -->
      <a id="tui.view.completionBox"></a><br>The completion's box and the items it shows: under the cursor line where it fits, else above.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
    - fn [drawCompletion](../../src/tui/view.ts#L862) (grid: Grid, state: State, editor: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawCompletion"></a><br>Renders the completion popup during [`tui.view.render`](tui.md#tui.view.render): draws a box titled with the item count via [`tui.screen.drawBox`](tui.md#tui.screen.drawBox), then writes each visible item's label and detail, highlighting the selected one and prefixing "planned" items. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - calls [tui.view.completionBox](tui.md#tui.view.completionBox), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [keyRows](../../src/tui/view.ts#L968) (pairs: readonly [string, string][], width: number) → string[] <!-- internal -->
      <a id="tui.view.keyRows"></a><br>The key rows of a mode: two pairs a row where both fit in `width`, else one; a long pair takes its own row.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [helpRows](../../src/tui/view.ts#L992) (state: State, width: number) → string[]
      <a id="tui.view.helpRows"></a><br>The rows of the help popup, wrapped to `width`: the keys of the mode, the offline help of the line's diagnostic, then the whole catalogue by group — the same registry the palette searches, with each key as the mode has it and the reason of each unavailable action.
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain.explainCode](features.md#features.explain.explainCode), [tui.view.keyRows](tui.md#tui.view.keyRows), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionKey](tui.md#tui.actions.actionKey), [tui.width.wrapCells](tui.md#tui.width.wrapCells)
    - fn [helpBox](../../src/tui/view.ts#L1025) (state: State) → { rect: Rect; rows: string[]; visible: number } <!-- internal -->
      <a id="tui.view.helpBox"></a><br>Where the help popup draws, its rows and how many of them show at once.
      - calls [tui.view.layout](tui.md#tui.view.layout), [tui.view.helpRows](tui.md#tui.view.helpRows)
    - fn [helpScrollMax](../../src/tui/view.ts#L1036) (state: State) → number
      <a id="tui.view.helpScrollMax"></a><br>The last first row the help can scroll to.
      - calls [tui.view.helpBox](tui.md#tui.view.helpBox)
    - fn [drawHelp](../../src/tui/view.ts#L1041) (grid: Grid, state: State) → void <!-- internal -->
      <a id="tui.view.drawHelp"></a><br>Draws the key-help popup for the current mode, using [`tui.view.helpBox`](tui.md#tui.view.helpBox) for size and rows and showing a scrolled window of lines via [`tui.screen.Grid.write`](tui.md#tui.screen.Grid.write). If rows overflow, it adds a position and scroll-hint footer. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - calls [tui.view.helpBox](tui.md#tui.view.helpBox), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - type [PromptLook](../../src/tui/view.ts#L1056) <!-- internal -->
      <a id="tui.view.PromptLook"></a><br>How the prompt line and the box over the editor show each kind of prompt: the label before the typed text; what stands as typed when a form types into its rows (the prompt's text otherwise); the box's title; and whether the selected item's note follows on the line (a search, a…
    - fn [drawPrompt](../../src/tui/view.ts#L1106) (grid: Grid, state: State, rect: Rect, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawPrompt"></a><br>Paints the active prompt's status line with label, typed text, cursor and a message or note, then for list prompts draws a scrolling boxed popup of details and choices above the editor via [`tui.screen.drawBox`](tui.md#tui.screen.drawBox). _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.wrapCells](tui.md#tui.width.wrapCells), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [newSpecLabel](../../src/tui/view.ts#L1141) (field: "kind" | "path" | "name" | undefined) → string <!-- internal -->
      <a id="tui.view.newSpecLabel"></a><br>The label of the field the new-spec form is on.
    - fn [footerHint](../../src/tui/view.ts#L1160) (mode: State["mode"], width: number) → string
      <a id="tui.view.footerHint"></a><br>The footer hint of the mode that fits in `width` cells: the leading keys that fit, and the tail.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [configNote](../../src/tui/view.ts#L1175) (state: State) → string | null
      <a id="tui.view.configNote"></a><br>Where the analysis takes its settings from, when that is not a plain saved `keylang.json`: a guess (no config), or the saved file while the buffer of `keylang.json` has unsaved edits that do not take effect.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
    - fn [drawBarrier](../../src/tui/view.ts#L1184) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawBarrier"></a><br>The save step before an operation that reads the disk (design §2.5), over the editor area.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawQuit](../../src/tui/view.ts#L1212) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawQuit"></a><br>The quit step while an operation runs (design §5), over the editor area.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawStart](../../src/tui/view.ts#L1237) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawStart"></a><br>The start screen of a repository without `keylang.json` (design §2.1): what was found and what can be done.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [hoverShown](../../src/tui/view.ts#L1258) (state: State) → boolean <!-- internal -->
      <a id="tui.view.hoverShown"></a><br>The hover is drawn: over the raw or the read text, or the zoom screen.
    - fn [editorCursorCell](../../src/tui/view.ts#L1263) (state: State, editor: Rect, buffer: Buffer | null) → Cell | null <!-- internal -->
      <a id="tui.view.editorCursorCell"></a><br>The cell of the editor's cursor while the raw text is shown (view, edit), whether the terminal shows it or not.
      - calls [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
    - fn [clipOnScreen](../../src/tui/view.ts#L1275) (state: State, area: Layout = layout(state)) → Rect | null
      <a id="tui.view.clipOnScreen"></a><br>The clip as this frame draws it, or null: off, a badge on a narrow terminal, covered by the start screen or F6, or yielding to the editor's cursor or a popup under it. A click goes to the clip only where it is drawn.
      - calls [tui.view.layout](tui.md#tui.view.layout), [tui.clip.assistantShown](tui.md#tui.clip.assistantShown), [tui.clip.clipRect](tui.md#tui.clip.clipRect), [tui.view.hoverShown](tui.md#tui.view.hoverShown), [tui.view.hoverRect](tui.md#tui.view.hoverRect), [tui.view.completionBox](tui.md#tui.view.completionBox), [tui.clip.clipYields](tui.md#tui.clip.clipYields), [tui.view.editorCursorCell](tui.md#tui.view.editorCursorCell)
    - fn [render](../../src/tui/view.ts#L1285) (state: State) → Grid
      <a id="tui.view.render"></a><br>Builds the full terminal frame from app state: title and mode label, side panels, the mode-specific body ([`tui.view.drawEditor`](tui.md#tui.view.drawEditor), [`tui.view.drawMerge`](tui.md#tui.view.drawMerge)…), analysis status bar with totals, then popups and modal overlays. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - calls [tui.screen.Grid](tui.md#tui.screen.Grid), [tui.view.layout](tui.md#tui.view.layout), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.drawFiles](tui.md#tui.view.drawFiles), [tui.view.drawContext](tui.md#tui.view.drawContext), [tui.view.drawNav](tui.md#tui.view.drawNav), [tui.view.drawStart](tui.md#tui.view.drawStart), [tui.view.drawCode](tui.md#tui.view.drawCode), [tui.view.drawZoom](tui.md#tui.view.drawZoom), [tui.view.drawMerge](tui.md#tui.view.drawMerge), [tui.view.drawRead](tui.md#tui.view.drawRead), [tui.view.drawEditor](tui.md#tui.view.drawEditor), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.lineMessage](tui.md#tui.view.lineMessage), [tui.view.footerHint](tui.md#tui.view.footerHint), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.clip.assistantShown](tui.md#tui.clip.assistantShown), [tui.clip.badgeRect](tui.md#tui.clip.badgeRect), [tui.clip.badgeText](tui.md#tui.clip.badgeText), [tui.evidence.totals](tui.md#tui.evidence.totals), [tui.view.configNote](tui.md#tui.view.configNote), [tui.view.drawResults](tui.md#tui.view.drawResults), [tui.view.clipOnScreen](tui.md#tui.view.clipOnScreen), [tui.clip-view.drawClip](tui.md#tui.clip-view.drawClip), [tui.view.hoverShown](tui.md#tui.view.hoverShown), [tui.view.drawHover](tui.md#tui.view.drawHover), [tui.view.drawCompletion](tui.md#tui.view.drawCompletion), [tui.clip-view.drawChat](tui.md#tui.clip-view.drawChat), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.view.drawHelp](tui.md#tui.view.drawHelp), [tui.view.drawPrompt](tui.md#tui.view.drawPrompt), [tui.view.drawBarrier](tui.md#tui.view.drawBarrier), [tui.view.drawQuit](tui.md#tui.view.drawQuit)
  - module [web](../../src/tui/web.ts#L1)
    <a id="tui.web"></a><br>`keylang web`: the same TUI in a browser tab. `node:http` serves a page and the bundled xterm.js; a WebSocket (`ws`) carries ANSI frames to xterm.js and its keyboard, mouse, paste and resize events back to an `App` in this process. No PTY and no CDN.
    - node [external.node](external.md#external.node)
    - ws [external.ws](external.md#external.ws)
    - analyze [map.analyze](map.md#map.analyze)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - screen [tui.screen](tui.md#tui.screen)
    - type [AssetName](../../src/tui/web.ts#L47) = keyof typeof ASSETS <!-- internal -->
      <a id="tui.web.AssetName"></a><br>A string-literal union derived from the keys of `ASSETS`, so lookups into that asset table are restricted to names that actually exist. It gives web asset accessors compile-time checking instead of accepting arbitrary strings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [assetPath](../../src/tui/web.ts#L50) (name: AssetName) → string | null
      <a id="tui.web.assetPath"></a><br>The published package carries the assets in `dist/web/`; a checkout reads them from `node_modules`.
    - type [WebServer](../../src/tui/web.ts#L64)
      <a id="tui.web.WebServer"></a><br>Handle returned for a running local web UI, exposing its `url` and `port`, listing specs that still have unsaved edits across sessions via `unsaved()`, and shutting the server down with `close()`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Session](../../src/tui/web.ts#L76) <!-- internal -->
      <a id="tui.web.Session"></a><br>Holds the per-browser-tab state of the web TUI: the running `App`, the open WebSocket (or null when disconnected), a pending timer, and an `AudioQueue` that buffers PCM sent by the page while Ctrl+R recording is active. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [control](../../src/tui/web.ts#L85) (message: object) → string <!-- internal -->
      <a id="tui.web.control"></a><br>A control message for the page: a frame that starts with NUL, which no ANSI frame does.
    - module [AudioQueue](../../src/tui/web.ts#L93) <!-- internal -->
      <a id="tui.web.AudioQueue"></a><br>PCM chunks from the page, read by the session's recognizer as they arrive.
      - fn [push](../../src/tui/web.ts#L100) (chunk: Int16Array) → void
        <a id="tui.web.AudioQueue.push"></a><br>Appends a block of audio samples to the pending buffer, silently dropping it if the queue has ended or the total would exceed the sample cap. After enqueueing, it calls [`tui.web.AudioQueue.wake`](tui.md#tui.web.AudioQueue.wake) to resume playback. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [end](../../src/tui/web.ts#L107) (failure: Error | null = null) → void
        <a id="tui.web.AudioQueue.end"></a><br>Marks the queue as finished, records the given error only if none was stored earlier, and calls [`tui.web.AudioQueue.wake`](tui.md#tui.web.AudioQueue.wake) so any pending consumer notices the close. Used by [`tui.web.serveWeb`](tui.md#tui.web.serveWeb) to shut down audio streaming. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [wake](../../src/tui/web.ts#L113) () → void <!-- internal -->
        <a id="tui.web.AudioQueue.wake"></a><br>Clears the stored waiter callback and, if one was set, invokes it so a consumer blocked on the queue resumes. Called by [`tui.web.AudioQueue.push`](tui.md#tui.web.AudioQueue.push) and [`tui.web.AudioQueue.end`](tui.md#tui.web.AudioQueue.end) whenever new data or completion arrives. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [chunks](../../src/tui/web.ts#L120) () → AsyncGenerator<Int16Array>
        <a id="tui.web.AudioQueue.chunks"></a><br>The chunks as they come, until `end`.
    - fn [pcmOf](../../src/tui/web.ts#L135) (data: unknown) → Int16Array | null <!-- internal -->
      <a id="tui.web.pcmOf"></a><br>s16le PCM from base64; an odd byte count or bad base64 is dropped, not trusted.
    - fn [clampSize](../../src/tui/web.ts#L145) (value: unknown, fallback: number, max: number) → number
      <a id="tui.web.clampSize"></a><br>A size from the client: an integer within the grid limits, else the fallback.
    - fn [sameSecret](../../src/tui/web.ts#L150) (given: string | null | undefined, token: string) → boolean <!-- internal -->
      <a id="tui.web.sameSecret"></a><br>Checks whether a supplied credential matches the expected token using a constant-time byte comparison, returning false for non-string input or mismatched lengths. Used by [`tui.web.serveWeb`](tui.md#tui.web.serveWeb) to gate web requests. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [offeredToken](../../src/tui/web.ts#L158) (request: IncomingMessage) → string | null <!-- internal -->
      <a id="tui.web.offeredToken"></a><br>The token a socket offers among its subprotocols.
    - type [WebOptions](../../src/tui/web.ts#L166)
      <a id="tui.web.WebOptions"></a><br>Configuration for starting the browser-served TUI: the repository root, listening port and optional host, plus an optional analyzer, a shared operation runner for all sessions, and how long a detached session is kept alive awaiting reconnect. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [serveWeb](../../src/tui/web.ts#L177) (options: WebOptions) → Promise<WebServer>
      <a id="tui.web.serveWeb"></a><br>Starts a token-guarded HTTP and WebSocket server that serves the static page and assets, and runs one [`tui.app.App`](tui.md#tui.app.App) session per tab, relaying keystrokes, resizes and microphone PCM through an [`tui.web.AudioQueue`](tui.md#tui.web.AudioQueue). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.web.sameSecret](tui.md#tui.web.sameSecret), [tui.web.offeredToken](tui.md#tui.web.offeredToken), [tui.web.pathOf](tui.md#tui.web.pathOf), [tui.web.reply](tui.md#tui.web.reply), [tui.web.assetPath](tui.md#tui.web.assetPath), [tui.web.page](tui.md#tui.web.page), [tui.web.clampSize](tui.md#tui.web.clampSize), [tui.web.pcmOf](tui.md#tui.web.pcmOf), [tui.app.App](tui.md#tui.app.App), [tui.web.AudioQueue](tui.md#tui.web.AudioQueue), [tui.web.control](tui.md#tui.web.control), [tui.web.AudioQueue.chunks](tui.md#tui.web.AudioQueue.chunks), [tui.web.AudioQueue.end](tui.md#tui.web.AudioQueue.end), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
    - fn [pathOf](../../src/tui/web.ts#L399) (target: string | undefined) → string | null <!-- internal -->
      <a id="tui.web.pathOf"></a><br>The path of a request target, or null when it is not a URL at all.
    - fn [reply](../../src/tui/web.ts#L407) (response: ServerResponse, status: number, type: string, body: string | Buffer) → void <!-- internal -->
      <a id="tui.web.reply"></a><br>Writes a complete HTTP response for [`tui.web.serveWeb`](tui.md#tui.web.serveWeb): sets the given status and content type, adds `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` headers, then ends the response with the body. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [page](../../src/tui/web.ts#L413) () → string <!-- internal -->
      <a id="tui.web.page"></a><br>The page: xterm.js from `/assets/`, a WebSocket back to this server, reconnect with the same session.
  - module [width](../../src/tui/width.ts#L1)
    <a id="tui.width"></a><br>Terminal cell width of text: graphemes, not code units. A wide character (CJK, most emoji, a keycap) takes two cells; combining marks, joiners, the other invisible format characters (Default_Ignorable_Code_Point: ZWSP, soft hyphen, word joiner) and Hangul vowels and finals…
    - fn [graphemes](../../src/tui/width.ts#L13) (text: string) → string[]
      <a id="tui.width.graphemes"></a><br>Grapheme clusters of a string, in order.
    - fn [clusters](../../src/tui/width.ts#L20) (text: string) → Generator<string>
      <a id="tui.width.clusters"></a><br>The same clusters, segmented only as far as they are read: drawing a long line stops at the screen's edge.
    - fn [codePointWidth](../../src/tui/width.ts#L45) (cp: number) → 0 | 1 | 2 <!-- internal -->
      <a id="tui.width.codePointWidth"></a><br>Gives a code point's terminal column width: 0 for control characters, Hangul vowel/final jamo and ignorable characters, 2 for wide-range characters, otherwise 1; used by [`tui.width.graphemeWidth`](tui.md#tui.width.graphemeWidth). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [graphemeWidth](../../src/tui/width.ts#L67) (cluster: string) → 0 | 1 | 2
      <a id="tui.width.graphemeWidth"></a><br>Cells one grapheme takes. An emoji cluster (a ZWJ sequence, a flag, a keycap, a pictograph with VS16) is one wide cell pair; otherwise the width of its first visible code point.
      - calls [tui.width.codePointWidth](tui.md#tui.width.codePointWidth)
    - fn [stringWidth](../../src/tui/width.ts#L77) (text: string) → number
      <a id="tui.width.stringWidth"></a><br>Computes a string's terminal display width by splitting it with [`tui.width.graphemes`](tui.md#tui.width.graphemes) and summing each cluster's 0/1/2-column width from [`tui.width.graphemeWidth`](tui.md#tui.width.graphemeWidth); used throughout layout, padding and wrapping. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [fitWidth](../../src/tui/width.ts#L84) (text: string, width: number) → string
      <a id="tui.width.fitWidth"></a><br>The longest prefix of `text` that fits in `width` cells.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [padWidth](../../src/tui/width.ts#L97) (text: string, width: number) → string
      <a id="tui.width.padWidth"></a><br>`text` cut or padded with spaces to exactly `width` cells; a cut ends with `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [sliceCells](../../src/tui/width.ts#L113) (text: string, left: number, width: number) → string
      <a id="tui.width.sliceCells"></a><br>The part of `text` seen through a window `width` cells wide scrolled `left` cells in: whole clusters only, with `…` at an edge that hides more text. On the left `…` never covers a cluster in view: it takes the visible half of a wide cluster the edge cuts, else a cell of its own…
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - type [StyledText](../../src/tui/width.ts#L144)
      <a id="tui.width.StyledText"></a><br>A piece of text in one style: what `wrapRuns` breaks into rows.
    - fn [wrapRuns](../../src/tui/width.ts#L157) (runs: readonly StyledText<S>[], width: number, hang: number, blank: S) → StyledText<S>[][]
      <a id="tui.width.wrapRuns"></a><br>Word-wraps runs of styled text into rows of `width` cells. A run splits after each space; a word goes to the next row when it does not fit — measured without the spaces after it, which stay at the end of its row — and a word wider than a whole row is cut between clusters and…
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth), [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [wrapCells](../../src/tui/width.ts#L186) (text: string, width: number) → string[]
      <a id="tui.width.wrapCells"></a><br>`text` word-wrapped to rows of at most `width` cells (`wrapRuns`); the spaces at a break are left out.
      - calls [tui.width.wrapRuns](tui.md#tui.width.wrapRuns)
    - fn [cellWidth](../../src/tui/width.ts#L193) (cluster: string) → number
      <a id="tui.width.cellWidth"></a><br>Cells a cluster takes in a `Grid`: a tab is drawn as one blank cell.
      - calls [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - type [LineLayout](../../src/tui/width.ts#L203)
      <a id="tui.width.LineLayout"></a><br>One line cut into clusters once, with prefix sums: the cells, code points and UTF-16 units before each cluster (index `clusters.length` is the whole line). Scrolling, drawing and hit-testing then take constant or logarithmic time per question instead of segmenting the line again.
    - fn [layoutLine](../../src/tui/width.ts#L210) (line: string) → LineLayout
      <a id="tui.width.layoutLine"></a><br>Splits a line into grapheme clusters via [`tui.width.graphemes`](tui.md#tui.width.graphemes) and builds prefix-sum arrays of terminal cell widths (from [`tui.width.cellWidth`](tui.md#tui.width.cellWidth)), code points, and UTF-16 units for each cluster boundary. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.cellWidth](tui.md#tui.width.cellWidth)
    - fn [scrollToFit](../../src/tui/width.ts#L225) (layout: LineLayout, left: number, col: number, width: number) → number
      <a id="tui.width.scrollToFit"></a><br>The smallest first cluster from `left` on such that clusters `[first, col)` fit in `width` cells.
    - fn [clusterAtCell](../../src/tui/width.ts#L237) (layout: LineLayout, left: number, x: number) → number
      <a id="tui.width.clusterAtCell"></a><br>The cluster under cell `x` of a line drawn from cluster `left`; past the end, the end.
    - fn [clusterAt](../../src/tui/width.ts#L252) (line: string, codePoints: number) → number
      <a id="tui.width.clusterAt"></a><br>Grapheme index of a code-point column in `line` (a column inside a cluster maps to that cluster).
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [clusterOffset](../../src/tui/width.ts#L264) (line: string, clusters: number) → number
      <a id="tui.width.clusterOffset"></a><br>UTF-16 offset of the first `clusters` graphemes of `line`.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
  - module [zoom-screen](../../src/tui/zoom-screen.ts#L1)
    <a id="tui.zoom-screen"></a><br>The zoom screen's keys and pointer (c4-zoom/07–09): the map one level at a time — its nodes or its edges, a flow laid over it — into a container and back up to its parent. zoom.ts computes the levels and view.ts draws them; this keeps where the screen is and what its keys do.
    - node [external.node](external.md#external.node)
    - operations [operations.operations](operations.md#operations.operations)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - actions [tui.actions](tui.md#tui.actions)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - input [tui.input](tui.md#tui.input)
    - state [tui.state](tui.md#tui.state)
    - view [tui.view](tui.md#tui.view)
    - zoom [tui.zoom](tui.md#tui.zoom)
    - type [ZoomHost](../../src/tui/zoom-screen.ts#L17)
      <a id="tui.zoom-screen.ZoomHost"></a><br>What the zoom screen needs from the session: where its keys lead out of it.
    - module [ZoomScreen](../../src/tui/zoom-screen.ts#L33)
      <a id="tui.zoom-screen.ZoomScreen"></a>
      - fn [constructor](../../src/tui/zoom-screen.ts#L36) (host: ZoomHost)
        <a id="tui.zoom-screen.ZoomScreen.constructor"></a>
      - fn [state](../../src/tui/zoom-screen.ts#L40) () → State <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.state"></a>
      - fn [openZoom](../../src/tui/zoom-screen.ts#L49) (id: string | null) → void
        <a id="tui.zoom-screen.ZoomScreen.openZoom"></a><br>`z`: the zoom screen at `id` (its own level, or the level it is a row of, that row selected), else at the repository. The view underneath stays as it is; `q` comes back to it at the node selected last.
        - calls [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.zoom.zoomTarget](tui.md#tui.zoom.zoomTarget), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo)
      - fn [zoomTo](../../src/tui/zoom-screen.ts#L66) (focus: string, select: string | null) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomTo"></a><br>The level of `focus`, `select` (or the row selected there before) under the cursor.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible)
      - fn [zoomEdgeRows](../../src/tui/zoom-screen.ts#L79) () → ZoomEdge[] <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomEdgeRows"></a><br>The edges view of the level shown (`c`): its rows.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom.zoomEdges](tui.md#tui.zoom.zoomEdges)
      - fn [zoomCount](../../src/tui/zoom-screen.ts#L88) () → number <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomCount"></a><br>How many rows the shown view of the level has.
        - calls [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows)
      - fn [zoomRows](../../src/tui/zoom-screen.ts#L93) () → ZoomRow[] <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomRows"></a><br>The rows of the level shown; the repository's when the focus left the snapshot with a new analysis.
        - calls [tui.zoom.zoomLevel](tui.md#tui.zoom.zoomLevel)
      - fn [zoomIndex](../../src/tui/zoom-screen.ts#L105) (rows: readonly unknown[]) → number <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomIndex"></a><br>The selected row of the shown view, clamped to `rows`.
        - calls [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey)
      - fn [keepZoomVisible](../../src/tui/zoom-screen.ts#L111) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.keepZoomVisible"></a><br>Keeps the selected row inside the shown rows of the zoom screen.
        - calls [tui.view.zoomListHeight](tui.md#tui.view.zoomListHeight), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows)
      - fn [zoomUp](../../src/tui/zoom-screen.ts#L125) (close: boolean) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomUp"></a><br>One level up, the cursor on the node it came from. At the repository Esc closes the screen and leaves the view where it was; `q` is the one that goes to the selected node.
        - calls [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent), [tui.zoom-screen.ZoomScreen.closeZoom](tui.md#tui.zoom-screen.ZoomScreen.closeZoom), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo)
      - fn [zoomDepth](../../src/tui/zoom-screen.ts#L138) (delta: number) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomDepth"></a><br>`>` and `<`: neighbors one edge farther or nearer, from none up to `MAX_DEPTH`.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible)
      - fn [closeZoom](../../src/tui/zoom-screen.ts#L159) (follow = true) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.closeZoom"></a><br>`q`: back to the view, at the node selected on the level (in the map of its layer), or at the focus.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex)
      - fn [zoomCode](../../src/tui/zoom-screen.ts#L171) (id: string) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomCode"></a><br>Enter on a fn or type: its code in the viewer; Esc there comes back to this level.
      - fn [zoomMouse](../../src/tui/zoom-screen.ts#L181) (event: MouseEvent, editor: { x: number; y: number; width: number; height: number }) → void
        <a id="tui.zoom-screen.ZoomScreen.zoomMouse"></a><br>The wheel scrolls the rows of the zoom screen; a click on a row selects it and opens nothing.
        - calls [tui.zoom-screen.ZoomScreen.zoomCount](tui.md#tui.zoom-screen.ZoomScreen.zoomCount), [tui.view.zoomButtons](tui.md#tui.view.zoomButtons), [tui.zoom-screen.ZoomScreen.zoomButton](tui.md#tui.zoom-screen.ZoomScreen.zoomButton), [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey)
      - fn [zoomButton](../../src/tui/zoom-screen.ts#L203) (action: ZoomButton["action"]) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomButton"></a><br>A header button of the zoom screen: the same as its key.
        - calls [tui.zoom-screen.ZoomScreen.zoomKey](tui.md#tui.zoom-screen.ZoomScreen.zoomKey)
      - fn [zoomExplain](../../src/tui/zoom-screen.ts#L209) (row: ZoomRow | undefined) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomExplain"></a><br>`e` and `K`: the explain hover of the selected node, as `e` shows it in the view.
        - calls [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows)
      - fn [zoomFlowKey](../../src/tui/zoom-screen.ts#L225) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomFlowKey"></a><br>`f`: the flow picker, the flows through this level first; with a flow laid over the levels, `f` takes it off.
        - calls [tui.zoom-screen.ZoomScreen.findFlows](tui.md#tui.zoom-screen.ZoomScreen.findFlows)
      - fn [findFlows](../../src/tui/zoom-screen.ts#L237) () → void
        <a id="tui.zoom-screen.ZoomScreen.findFlows"></a><br>The flow picker's list: every flow whose name has the typed text, those through the level first.
        - calls [tui.zoom.flowsThrough](tui.md#tui.zoom.flowsThrough)
      - fn [zoomNextFlow](../../src/tui/zoom-screen.ts#L251) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomNextFlow"></a><br>`F`: the next flow through the level, after the one laid over it.
        - calls [tui.zoom.flowsThrough](tui.md#tui.zoom.flowsThrough)
      - fn [zoomOverlay](../../src/tui/zoom-screen.ts#L264) () → FlowOverlay | null <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomOverlay"></a><br>The flow laid over the shown level, numbered on its units.
        - calls [tui.zoom.flowOverlay](tui.md#tui.zoom.flowOverlay), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf)
      - fn [zoomToggleView](../../src/tui/zoom-screen.ts#L272) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomToggleView"></a><br>`c`: the level's edges as rows, or back to its nodes.
        - calls [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible)
      - fn [zoomAlongEdge](../../src/tui/zoom-screen.ts#L281) (edge: ZoomEdge) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomAlongEdge"></a><br>Enter on an edge: the level of its other end, in the edges view; a fn or type, the level it is a row of.
        - calls [tui.zoom.zoomContainer](tui.md#tui.zoom.zoomContainer), [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo)
      - fn [zoomExplainEdge](../../src/tui/zoom-screen.ts#L292) (row: ZoomRow | undefined, edge: ZoomEdge | undefined) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomExplainEdge"></a><br>`x`: in the edges view the edges of the selected row; on nodes, the first `x` marks the from end, the second explains from it to the selected node.
      - fn [zoomKey](../../src/tui/zoom-screen.ts#L314) (event: KeyEvent) → void
        <a id="tui.zoom-screen.ZoomScreen.zoomKey"></a>
        - calls [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.view.zoomListHeight](tui.md#tui.view.zoomListHeight), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey), [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible), [tui.zoom-screen.ZoomScreen.zoomOverlay](tui.md#tui.zoom-screen.ZoomScreen.zoomOverlay), [tui.zoom-screen.ZoomScreen.closeZoom](tui.md#tui.zoom-screen.ZoomScreen.closeZoom), [tui.zoom-screen.ZoomScreen.zoomAlongEdge](tui.md#tui.zoom-screen.ZoomScreen.zoomAlongEdge), [tui.zoom-screen.ZoomScreen.zoomDepth](tui.md#tui.zoom-screen.ZoomScreen.zoomDepth), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo), [tui.zoom-screen.ZoomScreen.zoomCode](tui.md#tui.zoom-screen.ZoomScreen.zoomCode), [tui.zoom-screen.ZoomScreen.zoomUp](tui.md#tui.zoom-screen.ZoomScreen.zoomUp), [tui.zoom-screen.ZoomScreen.zoomExplain](tui.md#tui.zoom-screen.ZoomScreen.zoomExplain), [tui.zoom-screen.ZoomScreen.zoomToggleView](tui.md#tui.zoom-screen.ZoomScreen.zoomToggleView), [tui.zoom-screen.ZoomScreen.zoomFlowKey](tui.md#tui.zoom-screen.ZoomScreen.zoomFlowKey), [tui.zoom-screen.ZoomScreen.zoomNextFlow](tui.md#tui.zoom-screen.ZoomScreen.zoomNextFlow), [tui.zoom-screen.ZoomScreen.zoomExplainEdge](tui.md#tui.zoom-screen.ZoomScreen.zoomExplainEdge)
  - module [zoom](../../src/tui/zoom.ts#L1)
    <a id="tui.zoom"></a><br>The zoom screen (.scratch/c4-zoom/issues/07): the map one level at a time, from the repository down to the members of a module, as C4 zooms from the system to the code. A level is a focus, its children, and the nodes outside it that the focus has edges with, as far as `depth`…
    - analyze [map.analyze](map.md#map.analyze)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - nav [tui.nav](tui.md#tui.nav)
    - type [ZoomRow](../../src/tui/zoom.ts#L22)
      <a id="tui.zoom.ZoomRow"></a>
    - type [ZoomLevel](../../src/tui/zoom.ts#L39)
      <a id="tui.zoom.ZoomLevel"></a>
    - type [ZoomIndex](../../src/tui/zoom.ts#L47) <!-- internal -->
      <a id="tui.zoom.ZoomIndex"></a>
    - fn [indexOf](../../src/tui/zoom.ts#L60) (analysis: Analysis) → ZoomIndex <!-- internal -->
      <a id="tui.zoom.indexOf"></a>
      - calls [tui.nav.codeTree](tui.md#tui.nav.codeTree), [base.span.compareText](base.md#base.span.compareText), [tui.zoom.degrees](tui.md#tui.zoom.degrees), [tui.zoom.markIndex](tui.md#tui.zoom.markIndex)
    - fn [prefixes](../../src/tui/zoom.ts#L80) (id: string) → string[] <!-- internal -->
      <a id="tui.zoom.prefixes"></a><br>The ancestors of an ID, itself included: `a.b.c` → `a`, `a.b`, `a.b.c`.
    - fn [degrees](../../src/tui/zoom.ts#L86) (snapshot: AnalysisSnapshot) → Map<string, number> <!-- internal -->
      <a id="tui.zoom.degrees"></a><br>For every node, the edges with one end inside it and the other outside.
      - calls [tui.zoom.prefixes](tui.md#tui.zoom.prefixes)
    - fn [markIndex](../../src/tui/zoom.ts#L99) (analysis: Analysis) → Map<string, Mark> <!-- internal -->
      <a id="tui.zoom.markIndex"></a>
      - calls [tui.zoom.prefixes](tui.md#tui.zoom.prefixes), [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [inside](../../src/tui/zoom.ts#L108) (id: string, scope: string) → boolean <!-- internal -->
      <a id="tui.zoom.inside"></a>
    - fn [zoomParent](../../src/tui/zoom.ts#L113) (analysis: Analysis, id: string) → string | null
      <a id="tui.zoom.zoomParent"></a><br>The node the zoom screen shows a level of above `id`: its module, its layer, or the repository.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf)
    - fn [zoomContainer](../../src/tui/zoom.ts#L119) (analysis: Analysis, id: string) → boolean
      <a id="tui.zoom.zoomContainer"></a><br>Whether `id` has a level of its own: the repository, a layer, or a module or class with children.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf)
    - fn [zoomTarget](../../src/tui/zoom.ts#L129) (analysis: Analysis, id: string) → { focus: string; select: string | null } | null
      <a id="tui.zoom.zoomTarget"></a><br>Where `z` on `id` opens the screen: the level of the node itself when it has one, else the level it is a row of, with that row selected. Null for an ID the snapshot does not have.
      - calls [tui.zoom.zoomContainer](tui.md#tui.zoom.zoomContainer), [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent)
    - fn [crumbLabel](../../src/tui/zoom.ts#L137) (analysis: Analysis, id: string) → string
      <a id="tui.zoom.crumbLabel"></a><br>The name a reader knows a node by on a level: the repository's manifest name, else `system`, and IDs below it.
      - calls [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent)
    - fn [rowKind](../../src/tui/zoom.ts#L143) (analysis: Analysis, id: string) → ZoomRow["kind"] <!-- internal -->
      <a id="tui.zoom.rowKind"></a>
    - fn [unitOf](../../src/tui/zoom.ts#L155) (index: ZoomIndex, focusIsLayer: boolean, id: string) → string <!-- internal -->
      <a id="tui.zoom.unitOf"></a><br>The unit a node outside the focus is shown as on this level: on a layer's level, the top module of its own layer (a package is one); on a module's level, the node itself.
    - fn [zoomLevel](../../src/tui/zoom.ts#L168) (analysis: Analysis, focus: string, depth: number) → ZoomLevel
      <a id="tui.zoom.zoomLevel"></a><br>One level of the zoom screen: the children of `focus` and the nodes outside it at most `depth` edges away from anything inside it. Neighbors are grouped as the children are: by top module on a layer's level, by node on a module's level.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf), [tui.zoom.rowKind](tui.md#tui.zoom.rowKind), [tui.zoom.zoomContainer](tui.md#tui.zoom.zoomContainer), [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent), [tui.zoom.crumbLabel](tui.md#tui.zoom.crumbLabel), [tui.zoom.inside](tui.md#tui.zoom.inside), [tui.zoom.unitOf](tui.md#tui.zoom.unitOf), [base.span.compareText](base.md#base.span.compareText)
    - type [ZoomEdge](../../src/tui/zoom.ts#L230)
      <a id="tui.zoom.ZoomEdge"></a><br>One row of the edges view (c4-zoom/08): the edges of the snapshot between two ends at the level's granularity — a child of the focus, or a unit outside it grouped as the neighbors are — with their kinds and count.
    - fn [zoomEdges](../../src/tui/zoom.ts#L253) (analysis: Analysis, focus: string) → ZoomEdge[]
      <a id="tui.zoom.zoomEdges"></a><br>The edges view of a level: incoming from outside, outgoing to the code and to packages, between the children, and what inside it keylang could not resolve. Only edges the snapshot has: no row is drawn from a guess.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf), [tui.zoom.unitOf](tui.md#tui.zoom.unitOf), [base.span.compareText](base.md#base.span.compareText), [tui.zoom.inside](tui.md#tui.zoom.inside), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [zoomSelectKey](../../src/tui/zoom.ts#L294) (zoom: { focus: string; view: "nodes" | "edges" }) → string
      <a id="tui.zoom.zoomSelectKey"></a><br>The key a level's selected row is kept under: one per focus and view.
    - type [FlowOverlay](../../src/tui/zoom.ts#L304)
      <a id="tui.zoom.FlowOverlay"></a><br>A flow over one zoom level (c4-zoom/09): its `trigger`, `step` and `calls` numbered in the order they are written (a walk in depth, not the order they run: only a trace confirms that), placed on the level's units, each number with the gutter mark of its line.
    - fn [flowsThrough](../../src/tui/zoom.ts#L318) (analysis: Analysis, id: string) → string[]
      <a id="tui.zoom.flowsThrough"></a><br>Flows that name `id` or something inside it, by name; all flows for the repository.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [tui.zoom.inside](tui.md#tui.zoom.inside)
    - fn [flowOverlay](../../src/tui/zoom.ts#L332) (analysis: Analysis, name: string, focus: string, lineMark: (file: string, line: number) => Mark | null) → FlowOverlay | null
      <a id="tui.zoom.flowOverlay"></a>
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf), [tui.zoom.inside](tui.md#tui.zoom.inside), [tui.zoom.unitOf](tui.md#tui.zoom.unitOf)
    - fn [circled](../../src/tui/zoom.ts#L367) (n: number) → string
      <a id="tui.zoom.circled"></a><br>`①` for 1 up to `⑳` for 20, then the number in parentheses.
