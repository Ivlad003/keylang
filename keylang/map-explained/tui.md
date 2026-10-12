<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [actions](#tui.actions) · [analysis-worker](#tui.analysis-worker) · [app](#tui.app) · [assist](#tui.assist) · [background](#tui.background) · [buffer](#tui.buffer) · [clip-chat](#tui.clip-chat) · [clip-memory](#tui.clip-memory) · [clip-questions](#tui.clip-questions) · [clip-view](#tui.clip-view) · [clip](#tui.clip) · [code-highlight](#tui.code-highlight) · [disk](#tui.disk) · [evidence](#tui.evidence) · [findings](#tui.findings) · [forms](#tui.forms) · [forms.draft](#tui.forms.draft) · [forms.explain](#tui.forms.explain) · [forms.export](#tui.forms.export) · [forms.host](#tui.forms.host) · [forms.run](#tui.forms.run) · [hub](#tui.hub) · [input](#tui.input) · [markdown](#tui.markdown) · [merge-session](#tui.merge-session) · [merge](#tui.merge) · [nav](#tui.nav) · [new-spec](#tui.new-spec) · [operation-worker](#tui.operation-worker) · [prompt-keys](#tui.prompt-keys) · [read-api](#tui.read-api) · [reports](#tui.reports) · [reports.chat](#tui.reports.chat) · [reports.check](#tui.reports.check) · [reports.coverage](#tui.reports.coverage) · [reports.discover](#tui.reports.discover) · [reports.draft](#tui.reports.draft) · [reports.explain](#tui.reports.explain) · [reports.records](#tui.reports.records) · [reports.rows](#tui.reports.rows) · [reports.setup](#tui.reports.setup) · [results-panel](#tui.results-panel) · [screen](#tui.screen) · [state](#tui.state) · [terminal](#tui.terminal) · [text-to-spec](#tui.text-to-spec) · [theme](#tui.theme) · [tree-stamp](#tui.tree-stamp) · [view](#tui.view) · [web-export](#tui.web-export) · [web](#tui.web) · [width](#tui.width) · [zoom-screen](#tui.zoom-screen) · [zoom](#tui.zoom)

# map

- tui
  <a id="tui"></a><br>The interactive spec editor for terminal and browser: sessions in [`tui.app`](tui.md#tui.app) render ANSI frames for a terminal or [`tui.web`](tui.md#tui.web), with evidence gutter, navigation, merge and clip chat. It may not depend on `extract` or [`external.web-tree-sitter`](external.md#external.web-tree-sitter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [actions](../../src/tui/actions.ts#L1)
    <a id="tui.actions"></a><br>The catalogue of TUI actions: one registry used by the palette (`:` / Ctrl+P) and by the help popup. An action has a stable id, a label, a group, search aliases, an optional key hint and an availability predicate with a reason; `App.runAction(id)` executes it.
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - operations [operations.operations](operations.md#operations.operations)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - state [tui.state](tui.md#tui.state)
    - type [ActionContext](../../src/tui/actions.ts#L19)
      <a id="tui.actions.ActionContext"></a><br>What availability predicates may look at. Derived from `State` only.
    - type [Action](../../src/tui/actions.ts#L49)
      <a id="tui.actions.Action"></a><br>One palette entry: identity, display, search aliases, key hint and availability.
    - type [ActionEntry](../../src/tui/actions.ts#L62)
      <a id="tui.actions.ActionEntry"></a><br>An action with its availability evaluated for the current state.
    - fn [mergeOnly](../../src/tui/actions.ts#L81) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.mergeOnly"></a><br>Returns the constant reason string when the context's `merge` flag is set, and `null` otherwise; used by TUI action gating to signal that an action is blocked or applies only in merge mode. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [editor](../../src/tui/actions.ts#L83) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.editor"></a><br>Returns a reason string explaining why the editor is unavailable: the merge reason when the context is in merge mode, else the start reason when it is starting, otherwise null. Used by [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) and [`tui.actions.snapshot`](tui.md#tui.actions.snapshot) to gate their actions. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [bufferOrMerge](../../src/tui/actions.ts#L85) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.bufferOrMerge"></a><br>Returns whatever blocking reason [`tui.actions.editor`](tui.md#tui.actions.editor) reports, otherwise falls back to "no file open" when no current file is set, or null when the action may proceed. Shared precondition check used by [`tui.actions.viewOnly`](tui.md#tui.actions.viewOnly) and [`tui.actions.writable`](tui.md#tui.actions.writable). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.actions.editor](tui.md#tui.actions.editor)
    - fn [snapshot](../../src/tui/actions.ts#L87) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.snapshot"></a><br>Resolves the text to display for the current context by first asking [`tui.actions.editor`](tui.md#tui.actions.editor) for a value and, when that yields nothing, falling back to the context's `noSnapshot` field. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.actions.editor](tui.md#tui.actions.editor)
    - fn [running](../../src/tui/actions.ts#L89) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.running"></a><br>Guard that checks whether `ctx.operation` is set and, if so, returns the message "an operation is already running" so an action can be blocked; otherwise yields null to allow it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [viewOnly](../../src/tui/actions.ts#L92) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.viewOnly"></a><br>Returns a message explaining why a view-only key is blocked: first whatever [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) reports, else a hint to press Esc when the mode is "edit" or "code", else null meaning the action is allowed. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.actions.bufferOrMerge](tui.md#tui.actions.bufferOrMerge)
    - fn [writable](../../src/tui/actions.ts#L95) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.writable"></a><br>Returns a reason string blocking a write action, deferring first to [`tui.actions.bufferOrMerge`](tui.md#tui.actions.bufferOrMerge) and otherwise reporting read-only generated map files when `readOnly` is set. Yields null when writing is allowed. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [tui.actions.bufferOrMerge](tui.md#tui.actions.bufferOrMerge)
    - fn [openAction](../../src/tui/actions.ts#L465) (path: string) → Action
      <a id="tui.actions.openAction"></a><br>The per-file "open" action of the palette.
    - fn [catalog](../../src/tui/actions.ts#L470) (state: State) → ActionEntry[]
      <a id="tui.actions.catalog"></a><br>The full catalogue for the current session: static actions plus one "open" entry per file.
      - calls [tui.actions.availabilityOf](tui.md#tui.actions.availabilityOf), [tui.actions.openAction](tui.md#tui.actions.openAction)
    - fn [availabilityOf](../../src/tui/actions.ts#L478) (state: State) → ActionContext
      <a id="tui.actions.availabilityOf"></a><br>The availability context of the current session state.
      - calls [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.actions.applyRecord](tui.md#tui.actions.applyRecord), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf)
    - fn [exportRecord](../../src/tui/actions.ts#L508) (state: Pick<State, "records" | "results">) → { record: OperationRecord } | { reason: string }
      <a id="tui.actions.exportRecord"></a><br>The report Export saves: the record selected in F6 while the panel is open, else the newest check, explain-edge, parse or trace-plan record — exactly that run, as it ran.
    - fn [applyRecord](../../src/tui/actions.ts#L529) (state: Pick<State, "records" | "results">) → { record: OperationRecord } | { reason: string }
      <a id="tui.actions.applyRecord"></a><br>The spec-to-code run whose candidate Apply writes: the record selected in F6 while the panel is open, else the newest spec-to-code record. The file checks (unsaved edits, an open MERGE, a waiting proposal) come when it runs.
    - fn [noSnapshotReason](../../src/tui/actions.ts#L546) (state: Pick<State, "analysis" | "config" | "error" | "updating">) → string | null
      <a id="tui.actions.noSnapshotReason"></a><br>Why the session has no code snapshot, or null when it has one. Also the status line's note.
    - fn [actionKey](../../src/tui/actions.ts#L568) (action: Action, mode: State["mode"]) → string | null
      <a id="tui.actions.actionKey"></a><br>The key of an action as the mode has it, or null. A plain key (a letter, `?`, `/`, Enter) is a key of the view: in editing it types text, and MERGE and the code viewer give letters their own meaning, so there it is not advertised — Ctrl+P runs the action instead.
    - fn [actionLabel](../../src/tui/actions.ts#L577) (action: Action, mode: State["mode"] = "view") → string
      <a id="tui.actions.actionLabel"></a><br>The palette item text of an action: its label, with the key hint when the mode has one.
      - calls [tui.actions.actionKey](tui.md#tui.actions.actionKey)
    - fn [matchActions](../../src/tui/actions.ts#L584) (entries: readonly ActionEntry[], query: string) → ActionEntry[]
      <a id="tui.actions.matchActions"></a><br>The catalogue entries matching `query`: every query word is a subsequence of some token of the label, key or aliases.
      - calls [tui.actions.searchText](tui.md#tui.actions.searchText), [tui.actions.subsequence](tui.md#tui.actions.subsequence), [tui.actions.fileName](tui.md#tui.actions.fileName)
    - fn [fileName](../../src/tui/actions.ts#L610) (id: string) → string <!-- internal -->
      <a id="tui.actions.fileName"></a><br>`rules` for `open:keylang/rules.md`: the base name without its extension, lower case.
    - fn [searchText](../../src/tui/actions.ts#L617) (action: Action) → string <!-- internal -->
      <a id="tui.actions.searchText"></a><br>The words a palette query is matched against.
    - fn [subsequence](../../src/tui/actions.ts#L622) (text: string, query: string) → boolean <!-- internal -->
      <a id="tui.actions.subsequence"></a><br>Every character of `query` appears in `text` in order, not necessarily adjacent (`dfl` in `draftflow`).
  - module [analysis-worker](../../src/tui/analysis-worker.ts#L1)
    <a id="tui.analysis-worker"></a><br>Worker entry of `SnapshotWorker`: builds the map for a config and overlay. It runs the source → FileFacts → graph → map pipeline off the TUI's main thread so the screen stays responsive during a rebuild.
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
    - type [Surface](../../src/tui/app.ts#L85)
      <a id="tui.app.Surface"></a><br>Where the session draws: a terminal or a WebSocket client.
    - type [Analyzer](../../src/tui/app.ts#L97) = (request: AnalysisRequest) => Promise<Analysis>
      <a id="tui.app.Analyzer"></a><br>Runs one analysis; the default is the shared `analyze()`, tests inject their own.
    - type [OperationRunner](../../src/tui/app.ts#L100)
      <a id="tui.app.OperationRunner"></a><br>Runs one explicit operation; the session's default is the shared `runOperation`. Tests inject a gated one.
    - type [AppOptions](../../src/tui/app.ts#L103)
      <a id="tui.app.AppOptions"></a><br>How a session is created: the repository, the screen size and the injectable collaborators.
    - type [MapDirs](../../src/tui/app.ts#L124) = { map: string; explained: string } <!-- internal -->
      <a id="tui.app.MapDirs"></a><br>The generated map directory and the explained-map directory, relative to the root.
    - type [SaveStep](../../src/tui/app.ts#L127) <!-- internal -->
      <a id="tui.app.SaveStep"></a><br>The save step of an operation, as `saveStep` names it.
    - module [App](../../src/tui/app.ts#L154)
      <a id="tui.app.App"></a><br>One TUI session: its state, its input dispatch, the background analysis and the one explicit operation.
      - fn [barrierInputs](../../src/tui/app.ts#L205) () <!-- internal -->
        <a id="tui.app.App.barrierInputs"></a><br>Which dirty buffers the open save step lists: the inputs its operation reads.
      - fn [constructor](../../src/tui/app.ts#L223) (options: AppOptions)
        <a id="tui.app.App.constructor"></a><br>Builds the state and the helpers, shows the first file from disk, then reads the config and analyses.
        - calls [tui.input.InputDecoder](tui.md#tui.input.InputDecoder), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [tui.app.App.worker](tui.md#tui.app.App.worker), [tui.clip.newClip](tui.md#tui.clip.newClip), [tui.merge-session.MergeSession](tui.md#tui.merge-session.MergeSession), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon), [tui.assist.Assist](tui.md#tui.assist.Assist), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor), [tui.app.App.triggerAtCursor](tui.md#tui.app.App.triggerAtCursor), [tui.app.App.plannedFns](tui.md#tui.app.App.plannedFns), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [tui.forms.draft.DraftForms](tui.md#tui.forms.draft.DraftForms), [tui.forms.explain.ExplainForms](tui.md#tui.forms.explain.ExplainForms), [tui.forms.run.RunForms](tui.md#tui.forms.run.RunForms), [tui.forms.export.ExportForms](tui.md#tui.forms.export.ExportForms), [tui.zoom-screen.ZoomScreen](tui.md#tui.zoom-screen.ZoomScreen), [tui.app.App.goToNode](tui.md#tui.app.App.goToNode), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.jump](tui.md#tui.app.App.jump), [tui.app.App.explainLines](tui.md#tui.app.App.explainLines), [tui.app.App.openNodeSearch](tui.md#tui.app.App.openNodeSearch), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.clip-chat.ClipChat](tui.md#tui.clip-chat.ClipChat), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.clip.Clip](tui.md#tui.clip.Clip), [tui.view.layout](tui.md#tui.view.layout), [tui.view.clipOnScreen](tui.md#tui.view.clipOnScreen), [tui.clip-chat.ClipChat.said](tui.md#tui.clip-chat.ClipChat.said), [tui.clip-chat.ClipChat.cancel](tui.md#tui.clip-chat.ClipChat.cancel), [tui.clip-chat.ClipChat.opened](tui.md#tui.clip-chat.ClipChat.opened), [tui.app.App.keepPlace](tui.md#tui.app.App.keepPlace), [tui.results-panel.ResultsPanel](tui.md#tui.results-panel.ResultsPanel), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals), [tui.app.App.moveLayers](tui.md#tui.app.App.moveLayers), [tui.app.App.applyCandidate](tui.md#tui.app.App.applyCandidate), [tui.app.App.askFeatureQuestions](tui.md#tui.app.App.askFeatureQuestions), [tui.forms.export.ExportForms.openExportPrompt](tui.md#tui.forms.export.ExportForms.openExportPrompt), [tui.forms.draft.DraftForms.openSpecCode](tui.md#tui.forms.draft.DraftForms.openSpecCode), [tui.app.App.showCode](tui.md#tui.app.App.showCode), [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.restorePlace](tui.md#tui.app.App.restorePlace), [tui.clip-chat.ClipChat.restore](tui.md#tui.clip-chat.ClipChat.restore), [tui.app.configState](tui.md#tui.app.configState), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [restorePlace](../../src/tui/app.ts#L405) () → void <!-- internal -->
        <a id="tui.app.App.restorePlace"></a><br>The clip's place from tui.json as the session starts; a file it cannot use is said once and left as it is until a drag.
        - calls [tui.clip-memory.readPlace](tui.md#tui.clip-memory.readPlace), [tui.clip-memory.placeClip](tui.md#tui.clip-memory.placeClip)
      - fn [keepPlace](../../src/tui/app.ts#L413) () → void <!-- internal -->
        <a id="tui.app.App.keepPlace"></a><br>A drag, a keyboard move or a resize of the clip or its window ended, or they were put back: tui.json keeps the place.
        - calls [tui.clip-memory.writePlace](tui.md#tui.clip-memory.writePlace), [tui.clip-memory.placeOf](tui.md#tui.clip-memory.placeOf), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [attach](../../src/tui/app.ts#L424) (surface: Surface, cols: number, rows: number) → void
        <a id="tui.app.App.attach"></a><br>A transport takes the screen: the next frame is drawn whole.
        - calls [tui.app.App.resize](tui.md#tui.app.App.resize)
      - fn [detach](../../src/tui/app.ts#L431) () → void
        <a id="tui.app.App.detach"></a><br>No surface: the screen belongs to someone else (a reconnect, `$EDITOR`, a stop); nothing is drawn.
      - fn [resize](../../src/tui/app.ts#L436) (cols: number, rows: number) → void
        <a id="tui.app.App.resize"></a><br>A new screen size, clamped to what the session draws.
        - calls [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [input](../../src/tui/app.ts#L455) (chunk: string, whole = false) → void
        <a id="tui.app.App.input"></a><br>Keys from the transport. `whole`: the chunk is complete — a browser tab sends each key (or paste) as one message — so a lone ESC at its end is the Escape key now. A terminal's byte stream may cut a sequence anywhere and waits `ESC_MS`; over a socket that pause raced the next…
        - calls [tui.input.InputDecoder.feed](tui.md#tui.input.InputDecoder.feed), [tui.input.InputDecoder.flush](tui.md#tui.input.InputDecoder.flush), [tui.app.typedRun](tui.md#tui.app.typedRun), [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.app.pastedRun](tui.md#tui.app.pastedRun), [tui.app.App.safely](tui.md#tui.app.App.safely), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [safely](../../src/tui/app.ts#L506) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.safely"></a><br>One event; a failure (a file that cannot be written) is a message, never the end of the session and its unsaved buffers.
        - calls [tui.app.App.handle](tui.md#tui.app.App.handle), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.assist.Assist.cancelStaleGhost](tui.md#tui.assist.Assist.cancelStaleGhost)
      - fn [frame](../../src/tui/app.ts#L518) () → Grid
        <a id="tui.app.App.frame"></a><br>The current frame, as the transport would show it.
        - calls [tui.app.App.paint](tui.md#tui.app.App.paint)
      - fn [unsaved](../../src/tui/app.ts#L523) () → string[]
        <a id="tui.app.App.unsaved"></a><br>Files with unsaved changes.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [idle](../../src/tui/app.ts#L528) () → Promise<void>
        <a id="tui.app.App.idle"></a><br>Resolves when no analysis is running or waiting to start.
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [close](../../src/tui/app.ts#L535) () → void
        <a id="tui.app.App.close"></a><br>Ends the session: timers, the assistant, the chat, the running operation and its worker.
        - calls [tui.assist.Assist.close](tui.md#tui.assist.Assist.close), [tui.clip-chat.ClipChat.close](tui.md#tui.clip-chat.ClipChat.close), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [draw](../../src/tui/app.ts#L554) () → void <!-- internal -->
        <a id="tui.app.App.draw"></a><br>Paints the state and sends only what changed since the last frame.
        - calls [tui.app.App.paint](tui.md#tui.app.App.paint), [tui.screen.renderDiff](tui.md#tui.screen.renderDiff)
      - fn [paint](../../src/tui/app.ts#L562) () → Grid <!-- internal -->
        <a id="tui.app.App.paint"></a><br>The frame of the state now. The clip's counter follows what it counts — the analysis, the open file, the chat — so it is counted here (spec §4.6).
        - calls [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions), [tui.view.render](tui.md#tui.view.render)
      - fn [overlay](../../src/tui/app.ts#L571) () → Map<string, string> <!-- internal -->
        <a id="tui.app.App.overlay"></a><br>Unsaved buffers by absolute path: the analysis reads them instead of the files on disk.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [reanalyze](../../src/tui/app.ts#L581) (explicit = true) → void
        <a id="tui.app.App.reanalyze"></a><br>`F5` or a save (`explicit`), or typing that settled: analyse now.
        - calls [tui.app.App.readConfig](tui.md#tui.app.App.readConfig), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.overlay](tui.md#tui.app.App.overlay), [tui.results-panel.ResultsPanel.selectedFinding](tui.md#tui.results-panel.ResultsPanel.selectedFinding), [tui.clip-questions.newFailsAfter](tui.md#tui.clip-questions.newFailsAfter), [tui.app.App.adoptResult](tui.md#tui.app.App.adoptResult), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [readConfig](../../src/tui/app.ts#L640) (explicit: boolean) → boolean <!-- internal -->
        <a id="tui.app.App.readConfig"></a><br>Reads `keylang.json` again before a run. False: it is invalid, and the analyzer is not run — it would only fail with the same error again.
        - calls [tui.app.configState](tui.md#tui.app.configState), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig)
      - fn [openConfig](../../src/tui/app.ts#L662) (reason: string, remember: boolean) → void <!-- internal -->
        <a id="tui.app.App.openConfig"></a><br>Opens `keylang.json` as text with the cursor on the field (or the JSON position) the reason names.
        - calls [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.configErrorCursor](tui.md#tui.app.configErrorCursor)
      - fn [browse](../../src/tui/app.ts#L668) () → void <!-- internal -->
        <a id="tui.app.App.browse"></a><br>The start screen's Browse: the current analysis with the guessed configuration; nothing is written.
        - calls [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [startKey](../../src/tui/app.ts#L674) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.startKey"></a><br>Keys of the start screen: choose an item; the palette, help, F6 and quitting work as elsewhere.
        - calls [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.browse](tui.md#tui.app.App.browse), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [adoptResult](../../src/tui/app.ts#L687) (analysis: Analysis, edits: number, selected: CheckResult | undefined) → void <!-- internal -->
        <a id="tui.app.App.adoptResult"></a><br>Takes a finished analysis as current, keeping the F6 selection on the same finding.
        - calls [tui.app.App.adopt](tui.md#tui.app.App.adopt), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.sameResult](tui.md#tui.findings.sameResult), [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [reanalyzeSoon](../../src/tui/app.ts#L701) () → void <!-- internal -->
        <a id="tui.app.App.reanalyzeSoon"></a><br>Typing: mark results outdated now, analyse once the typing settles.
        - calls [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [track](../../src/tui/app.ts#L720) (work: Promise<void>) → void <!-- internal -->
        <a id="tui.app.App.track"></a><br>Async work of a helper (a model, a microphone, an operation's result): `idle()` waits for it, and the frame follows it. Work that fails is a message, as a key that fails is (`safely`): never an unhandled rejection, which would end a terminal session and every session of…
        - calls [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [quiet](../../src/tui/app.ts#L734) () → boolean <!-- internal -->
        <a id="tui.app.App.quiet"></a><br>Nothing runs or waits to run: no analysis, no settle timer, no assistant request.
      - fn [wake](../../src/tui/app.ts#L739) () → void <!-- internal -->
        <a id="tui.app.App.wake"></a><br>Resolves the `idle()` waiters once the session is quiet.
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [adopt](../../src/tui/app.ts#L748) (analysis: Analysis) → void <!-- internal -->
        <a id="tui.app.App.adopt"></a><br>Files and clean buffers follow the new analysis (a regenerated map, a change on disk).
        - calls [base.config.specPath](base.md#base.config.specPath), [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.refreshFeatureLine](tui.md#tui.app.App.refreshFeatureLine)
      - fn [refreshFeatureLine](../../src/tui/app.ts#L810) () → void <!-- internal -->
        <a id="tui.app.App.refreshFeatureLine"></a><br>The status line's `feature <stage> · questions <n>` of the current file when it is a feature file (c4-zoom/11): its report on the session's analysis against the plan at its base (the merge-base with the main branch, else HEAD), as `keylang feature` computes it. It follows a…
        - calls [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.worker](tui.md#tui.app.App.worker), [operations.feature.featureReportOf](operations.md#operations.feature.featureReportOf)
      - fn [readOnlyReason](../../src/tui/app.ts#L844) (path: string) → string <!-- internal -->
        <a id="tui.app.App.readOnlyReason"></a><br>Why a generated buffer takes no edits, naming its generator.
        - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [specDir](../../src/tui/app.ts#L851) () → string <!-- internal -->
        <a id="tui.app.App.specDir"></a><br>The spec directory of the saved configuration (`keylang` when it cannot be read).
        - calls [base.config.loadConfig](base.md#base.config.loadConfig)
      - fn [diskFiles](../../src/tui/app.ts#L860) () → string[] <!-- internal -->
        <a id="tui.app.App.diskFiles"></a><br>The spec files and `keylang.json` on disk, sorted for the files panel; saved explanations left out.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [buffer](../../src/tui/app.ts#L876) () → Buffer | null <!-- internal -->
        <a id="tui.app.App.buffer"></a><br>The buffer of the current file, or null when none is open.
      - fn [load](../../src/tui/app.ts#L881) (path: string) → Buffer <!-- internal -->
        <a id="tui.app.App.load"></a><br>The buffer of `path`, loaded once: from the analysis's text of it (a generated view), else from disk.
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.newBuffer](tui.md#tui.buffer.newBuffer)
      - fn [open](../../src/tui/app.ts#L896) (path: string, cursor: Cursor, remember = true) → void <!-- internal -->
        <a id="tui.app.App.open"></a><br>Shows `path` in the editor at `cursor`; `remember` pushes the place left onto the Ctrl+O stack.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.refreshFeatureLine](tui.md#tui.app.App.refreshFeatureLine)
      - fn [lines](../../src/tui/app.ts#L922) () → readonly string[] <!-- internal -->
        <a id="tui.app.App.lines"></a><br>The current buffer's lines (none without a file).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
      - fn [clampCursor](../../src/tui/app.ts#L929) () → void <!-- internal -->
        <a id="tui.app.App.clampCursor"></a><br>Keeps the cursor on an existing line and grapheme cluster.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [keepVisible](../../src/tui/app.ts#L945) () → void <!-- internal -->
        <a id="tui.app.App.keepVisible"></a><br>Scrolls so the cursor is on screen; the layout of its line answers in logarithmic time, however long the line.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.scrollToFit](tui.md#tui.width.scrollToFit)
      - fn [edit](../../src/tui/app.ts#L972) (change: (lines: string[], cursor: Cursor) => void, coalesce = false) → void <!-- internal -->
        <a id="tui.app.App.edit"></a><br>Applies `change` to the current buffer's lines with an undo step (one per burst of typing when `coalesce`), then schedules an analysis.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.readOnlyReason](tui.md#tui.app.App.readOnlyReason), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [save](../../src/tui/app.ts#L1002) () → void <!-- internal -->
        <a id="tui.app.App.save"></a><br>Ctrl+S: writes the current buffer, unless an operation is writing or the file changed on disk meanwhile.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.app.App.changedOnDisk](tui.md#tui.app.App.changedOnDisk), [tui.app.App.persist](tui.md#tui.app.App.persist), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [changedOnDisk](../../src/tui/app.ts#L1031) (buffer: Buffer) → boolean <!-- internal -->
        <a id="tui.app.App.changedOnDisk"></a><br>The file on disk differs from what the buffer last read or wrote.
        - calls [tui.disk.readText](tui.md#tui.disk.readText)
      - fn [newFileProblem](../../src/tui/app.ts#L1040) (buffer: Buffer) → string | null <!-- internal -->
        <a id="tui.app.App.newFileProblem"></a><br>Why the first save of a new specification may not happen, or null: the path rules again (the configuration or a link may have changed since the form), and the target must still not exist.
        - calls [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc)
      - fn [generatedDoc](../../src/tui/app.ts#L1051) (path: string) → boolean <!-- internal -->
        <a id="tui.app.App.generatedDoc"></a><br>The analysis knows `path` as a generated document.
      - fn [persist](../../src/tui/app.ts#L1056) (buffer: Buffer) → void <!-- internal -->
        <a id="tui.app.App.persist"></a><br>Writes the buffer's text with its line ending; the buffer is clean after. Throws when the write fails.
        - calls [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged)
      - fn [dirtyInputs](../../src/tui/app.ts#L1076) () → string[] <!-- internal -->
        <a id="tui.app.App.dirtyInputs"></a><br>The unsaved spec and config buffers, in path order: what an operation on the disk would not see.
        - calls [base.span.compareText](base.md#base.span.compareText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [withSavedInputs](../../src/tui/app.ts#L1085) (action: string, run: () => void, options: { writes?: string[]; writesNote?: string; inputs?: (path: string) => boolean } = {}) → void <!-- internal -->
        <a id="tui.app.App.withSavedInputs"></a><br>Runs `run` on saved inputs (design §2.5). Without dirty buffers it runs at once; with them the save step opens: Save and continue or Back.
        - calls [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [barrierKey](../../src/tui/app.ts#L1096) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.barrierKey"></a><br>The keys of the save step: ←→/Tab choose, Enter does it, Esc is Back.
        - calls [tui.app.App.leaveBarrier](tui.md#tui.app.App.leaveBarrier), [tui.app.App.saveAndContinue](tui.md#tui.app.App.saveAndContinue)
      - fn [leaveBarrier](../../src/tui/app.ts#L1105) () → void <!-- internal -->
        <a id="tui.app.App.leaveBarrier"></a><br>Back: nothing is written and the operation does not start.
      - fn [saveAndContinue](../../src/tui/app.ts#L1118) () → void <!-- internal -->
        <a id="tui.app.App.saveAndContinue"></a><br>Saves the listed buffers one by one through the ordinary save path. The first failure (a file changed on disk, a write error) stops: the step stays open with the reason, the operation does not start, and the files already saved stay saved — there is no rollback.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.newFileProblem](tui.md#tui.app.App.newFileProblem), [tui.app.App.changedOnDisk](tui.md#tui.app.App.changedOnDisk), [tui.app.App.persist](tui.md#tui.app.App.persist), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.barrierInputs](tui.md#tui.app.App.barrierInputs), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [live](../../src/tui/app.ts#L1166) () → Workspace | null <!-- internal -->
        <a id="tui.app.App.live"></a><br>The workspace of the latest analysis, with this session's buffers as the documents. The pointer asks for it on every cell it crosses: the same analysis and the same buffers at the same versions give the one built last.
        - calls [features.lsp-features.workspace](features.md#features.lsp-features.workspace)
      - fn [lspPosition](../../src/tui/app.ts#L1187) (cursor: Cursor) → LspPosition <!-- internal -->
        <a id="tui.app.App.lspPosition"></a><br>The cursor as an LSP position: the column in UTF-16 units, as the LSP features count.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [cellAt](../../src/tui/app.ts#L1197) (x: number, y: number) → Cursor | null <!-- internal -->
        <a id="tui.app.App.cellAt"></a><br>The editor line and column under a screen cell, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.width.clusterAtCell](tui.md#tui.width.clusterAtCell), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [offsetOf](../../src/tui/app.ts#L1216) (at: Cursor) → number <!-- internal -->
        <a id="tui.app.App.offsetOf"></a><br>The UTF-16 offset of a cursor in the buffer.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [targetNear](../../src/tui/app.ts#L1230) (cursor: Cursor) → Cursor | null <!-- internal -->
        <a id="tui.app.App.targetNear"></a><br>The id or link at the cursor; on an item line without one under the cursor, its first.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf), [tui.app.forNodes](tui.md#tui.app.forNodes), [tui.width.clusterAt](tui.md#tui.width.clusterAt), [tui.app.App.lines](tui.md#tui.app.App.lines)
      - fn [hoverAt](../../src/tui/app.ts#L1253) (cursor: Cursor, x: number, y: number, source: Hover["source"]) → Hover | null <!-- internal -->
        <a id="tui.app.App.hoverAt"></a><br>The hover at a cursor, anchored at a cell. The rows are made once per target (an ID or a link) and workspace — wherever on the target the pointer is, they are the same — and once per position off any target.
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf), [tui.app.App.hoverRows](tui.md#tui.app.App.hoverRows), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition)
      - fn [hoverRows](../../src/tui/app.ts#L1270) (ws: Workspace, path: string, position: LspPosition) → Hover["lines"] | null <!-- internal -->
        <a id="tui.app.App.hoverRows"></a><br>The popup's rows of the hover at a position: the hover's parts as they are, the code at the declaration, the uses in specs.
        - calls [features.lsp-features.hoverContent](features.md#features.lsp-features.hoverContent), [features.lsp-features.runsText](features.md#features.lsp-features.runsText), [tui.disk.readText](tui.md#tui.disk.readText), [features.lsp-features.references](features.md#features.lsp-features.references)
      - fn [cursorAnchor](../../src/tui/app.ts#L1298) (col: number) → Cell <!-- internal -->
        <a id="tui.app.App.cursorAnchor"></a><br>Where a popup at the cursor line is anchored: the raw line in the editor, the rendered row in reading mode.
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.readCursorRow](tui.md#tui.view.readCursorRow), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth)
      - fn [goToCode](../../src/tui/app.ts#L1312) () → void <!-- internal -->
        <a id="tui.app.App.goToCode"></a><br>Enter: the code that the ID (or code link) on or near the cursor names.
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.live](tui.md#tui.app.App.live), [features.lsp-features.definition](features.md#features.lsp-features.definition), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.app.App.jump](tui.md#tui.app.App.jump)
      - fn [jump](../../src/tui/app.ts#L1336) (abs: string, line: number) → void <!-- internal -->
        <a id="tui.app.App.jump"></a><br>Opens a file at a line: a spec in the editor, code in `$EDITOR` or the built-in viewer.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.showCode](tui.md#tui.app.App.showCode)
      - fn [showCode](../../src/tui/app.ts#L1365) (rel: string, abs: string, line: number) → boolean <!-- internal -->
        <a id="tui.app.App.showCode"></a><br>The built-in read-only viewer at `line` of a code file; false (with a message) when it cannot be read.
        - calls [tui.view.layout](tui.md#tui.view.layout)
      - fn [nodeAtCursor](../../src/tui/app.ts#L1386) () → string | null <!-- internal -->
        <a id="tui.app.App.nodeAtCursor"></a><br>The ID of the node whose item is at the cursor line or the nearest one above it (a description, `calls`).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [lineOfNode](../../src/tui/app.ts#L1405) (path: string, id: string) → number | null <!-- internal -->
        <a id="tui.app.App.lineOfNode"></a><br>The 0-based line of the item that declares `id` in the file at `path`, or null.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [mapDirs](../../src/tui/app.ts#L1415) (analysis: Analysis) → MapDirs <!-- internal -->
        <a id="tui.app.App.mapDirs"></a><br>The map directory of each variant, relative to the root.
        - calls [base.config.specPath](base.md#base.config.specPath)
      - fn [toggleMap](../../src/tui/app.ts#L1420) () → void <!-- internal -->
        <a id="tui.app.App.toggleMap"></a><br>`t`: the same layer file in the other map, the cursor on the same node.
        - calls [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.nodeAtCursor](tui.md#tui.app.App.nodeAtCursor), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.app.App.open](tui.md#tui.app.App.open)
      - fn [goToNode](../../src/tui/app.ts#L1456) (id: string) → void <!-- internal -->
        <a id="tui.app.App.goToNode"></a><br>The node's line in the map the reader is in: the explained map from one of its files, the map otherwise.
        - calls [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [goToSpec](../../src/tui/app.ts#L1473) (id: string | null) → void <!-- internal -->
        <a id="tui.app.App.goToSpec"></a><br>Alt+Enter: the spec line that declares `id`.
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.clusterAt](tui.md#tui.width.clusterAt)
      - fn [idAtCursor](../../src/tui/app.ts#L1495) () → string | null <!-- internal -->
        <a id="tui.app.App.idAtCursor"></a><br>The ID reference on or near the cursor, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [goBack](../../src/tui/app.ts#L1506) () → void <!-- internal -->
        <a id="tui.app.App.goBack"></a><br>Ctrl+O: the place before the last jump.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [handle](../../src/tui/app.ts#L1533) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.handle"></a><br>Dispatches one input event. Order matters: modal layers first (the save step, the quit question, prompts, help, MERGE…), then the panel keys and the mode's own keys, so a key reaches only the topmost thing that takes it.
        - calls [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.mouse](tui.md#tui.app.App.mouse), [tui.app.App.promptType](tui.md#tui.app.App.promptType), [tui.clip.Clip.paste](tui.md#tui.clip.Clip.paste), [tui.app.printable](tui.md#tui.app.printable), [tui.app.App.insert](tui.md#tui.app.App.insert), [tui.app.pasteRefusal](tui.md#tui.app.pasteRefusal), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.quitKey](tui.md#tui.app.App.quitKey), [tui.app.App.helpKey](tui.md#tui.app.App.helpKey), [tui.app.App.barrierKey](tui.md#tui.app.App.barrierKey), [tui.app.App.promptKey](tui.md#tui.app.App.promptKey), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.save](tui.md#tui.app.App.save), [tui.clip.Clip.key](tui.md#tui.clip.Clip.key), [tui.results-panel.ResultsPanel.returnToFindings](tui.md#tui.results-panel.ResultsPanel.returnToFindings), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.results-panel.ResultsPanel.resultsKey](tui.md#tui.results-panel.ResultsPanel.resultsKey), [tui.app.App.startKey](tui.md#tui.app.App.startKey), [tui.clip.Clip.toggle](tui.md#tui.clip.Clip.toggle), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.results-panel.ResultsPanel.openResults](tui.md#tui.results-panel.ResultsPanel.openResults), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.key](tui.md#tui.merge-session.MergeSession.key), [tui.app.App.codeKey](tui.md#tui.app.App.codeKey), [tui.zoom-screen.ZoomScreen.zoomKey](tui.md#tui.zoom-screen.ZoomScreen.zoomKey), [tui.app.App.editKey](tui.md#tui.app.App.editKey), [tui.app.App.contextKey](tui.md#tui.app.App.contextKey), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.viewKey](tui.md#tui.app.App.viewKey)
      - fn [helpKey](../../src/tui/app.ts#L1650) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.helpKey"></a><br>Keys over the help: arrows and pages scroll it, any other key closes it.
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.view.helpScrollMax](tui.md#tui.view.helpScrollMax)
      - fn [quit](../../src/tui/app.ts#L1669) () → void <!-- internal -->
        <a id="tui.app.App.quit"></a><br>`q` / Ctrl+C. While an operation runs, the quit step asks first (Stay or Cancel and exit; `q` again in it is Cancel and exit); then unsaved buffers ask once more; then the session ends.
        - calls [tui.app.App.cancelAndQuit](tui.md#tui.app.App.cancelAndQuit), [tui.app.App.activeLabel](tui.md#tui.app.App.activeLabel), [tui.app.App.quitIfSaved](tui.md#tui.app.App.quitIfSaved)
      - fn [quitIfSaved](../../src/tui/app.ts#L1692) (note?: string) → void <!-- internal -->
        <a id="tui.app.App.quitIfSaved"></a><br>The ordinary end of a session: unsaved buffers ask once (the second q quits), then it closes.
        - calls [tui.app.App.unsaved](tui.md#tui.app.App.unsaved), [tui.app.App.close](tui.md#tui.app.App.close)
      - fn [activeLabel](../../src/tui/app.ts#L1707) () → string <!-- internal -->
        <a id="tui.app.App.activeLabel"></a><br>How messages name the running operation.
        - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel)
      - fn [quitKey](../../src/tui/app.ts#L1714) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.quitKey"></a><br>The keys of the quit step: ←→/Tab choose, Enter does it, Esc stays; while it waits only Esc (stay) counts.
        - calls [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.cancelAndQuit](tui.md#tui.app.App.cancelAndQuit)
      - fn [cancelAndQuit](../../src/tui/app.ts#L1737) () → void <!-- internal -->
        <a id="tui.app.App.cancelAndQuit"></a><br>Cancel and exit: the operation is cancelled — before a commit at once, during one after its current file step — and the session ends when it settles (`quitAfterSettle`), never in the middle of a file write.
      - fn [quitAfterSettle](../../src/tui/app.ts#L1751) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.quitAfterSettle"></a><br>An operation settled under the quit step. After Cancel and exit the unsaved buffers decide again, with what the operation wrote named; an operation that ended by itself while the step asked only closes the step.
        - calls [tui.reports.records.recordSummary](tui.md#tui.reports.records.recordSummary), [tui.app.App.quitIfSaved](tui.md#tui.app.App.quitIfSaved)
      - fn [move](../../src/tui/app.ts#L1771) (lines: number) → void <!-- internal -->
        <a id="tui.app.App.move"></a><br>Moves the cursor by `lines` (negative: up), clamped and kept on screen.
        - calls [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [common](../../src/tui/app.ts#L1780) (event: KeyEvent) → boolean <!-- internal -->
        <a id="tui.app.App.common"></a><br>The cursor keys the view and the editor share; true when the key was one of them.
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [cycleFocus](../../src/tui/app.ts#L1833) () → void <!-- internal -->
        <a id="tui.app.App.cycleFocus"></a><br>`Tab`: the editor, then each open side panel that is drawn once it has the focus.
        - calls [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex)
      - fn [drawable](../../src/tui/app.ts#L1847) (panel: SidePanel) → boolean <!-- internal -->
        <a id="tui.app.App.drawable"></a><br>Whether `panel` is drawn when it has the focus (below 100 columns the focused panel is the one shown). Below 60 columns none is: keys must not go to a list nobody sees.
        - calls [tui.view.layout](tui.md#tui.view.layout)
      - fn [hoverAtCursor](../../src/tui/app.ts#L1854) () → void <!-- internal -->
        <a id="tui.app.App.hoverAtCursor"></a><br>`K`: the hover of the id nearest the cursor, as the mouse would show it.
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt)
      - fn [viewKey](../../src/tui/app.ts#L1875) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.viewKey"></a><br>Keys of the view (and reading mode): navigation, jumps, and the single-letter commands.
        - calls [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.draftAtCursor](tui.md#tui.app.App.draftAtCursor), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.hoverAtCursor](tui.md#tui.app.App.hoverAtCursor), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.readOnlyReason](tui.md#tui.app.App.readOnlyReason), [tui.app.App.mergeOrPick](tui.md#tui.app.App.mergeOrPick), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.nodeAtCursor](tui.md#tui.app.App.nodeAtCursor), [tui.app.App.openNodeSearch](tui.md#tui.app.App.openNodeSearch), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [editKey](../../src/tui/app.ts#L1978) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKey"></a><br>Keys while editing: a ghost suggestion answers first (Tab takes it, Alt+] cycles), then the editor proper.
        - calls [tui.assist.Assist.acceptGhost](tui.md#tui.assist.Assist.acceptGhost), [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.editKeyWithoutGhost](tui.md#tui.app.App.editKeyWithoutGhost), [tui.assist.Assist.ghostSoon](tui.md#tui.assist.Assist.ghostSoon)
      - fn [editKeyWithoutGhost](../../src/tui/app.ts#L2005) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKeyWithoutGhost"></a><br>Editor keys with no ghost shown: an open completion list takes ↑↓/Tab/Enter/Esc, then editing keys.
        - calls [tui.app.App.acceptCompletion](tui.md#tui.app.App.acceptCompletion), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.save](tui.md#tui.app.App.save), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.undoEdit](tui.md#tui.app.App.undoEdit), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.complete](tui.md#tui.app.App.complete), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.insert](tui.md#tui.app.App.insert)
      - fn [insert](../../src/tui/app.ts#L2104) (raw: string) → void <!-- internal -->
        <a id="tui.app.App.insert"></a><br>Inserts typed or pasted text at the cursor; control characters and escape sequences are dropped first.
        - calls [tui.app.printable](tui.md#tui.app.printable), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.complete](tui.md#tui.app.App.complete)
      - fn [undoEdit](../../src/tui/app.ts#L2141) () → void <!-- internal -->
        <a id="tui.app.App.undoEdit"></a><br>Ctrl+Z in the editor: back to the last undo step's text and cursor.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [complete](../../src/tui/app.ts#L2162) (explicit: boolean) → void <!-- internal -->
        <a id="tui.app.App.complete"></a><br>Opens or refreshes the completion list; `explicit` (Ctrl+Space) also opens it mid-word.
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [features.lsp-features.completions](features.md#features.lsp-features.completions), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [acceptCompletion](../../src/tui/app.ts#L2200) () → void <!-- internal -->
        <a id="tui.app.App.acceptCompletion"></a><br>Replaces the word the completion list was opened on with the chosen item.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [fixNavIndex](../../src/tui/app.ts#L2221) (direction: 1 | -1) → void <!-- internal -->
        <a id="tui.app.App.fixNavIndex"></a><br>Moves the navigation selection off headings (in `direction`) and scrolls it into view.
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.layout](tui.md#tui.view.layout), [tui.view.navListHeight](tui.md#tui.view.navListHeight)
      - fn [toggleFiles](../../src/tui/app.ts#L2241) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleFiles"></a><br>F2: the files panel; it takes the focus only where keys go to panels (`focusable`).
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleNav](../../src/tui/app.ts#L2253) () → void <!-- internal -->
        <a id="tui.app.App.toggleNav"></a><br>F3: the navigation panel; hiding it gives the focus back to the editor.
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleContext](../../src/tui/app.ts#L2264) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleContext"></a><br>F4 and the palette: the context panel; it takes the focus only where keys go to panels (`focusable`).
        - calls [tui.app.App.narrowNote](tui.md#tui.app.App.narrowNote), [tui.app.App.drawable](tui.md#tui.app.App.drawable), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [narrowNote](../../src/tui/app.ts#L2277) () → void <!-- internal -->
        <a id="tui.app.App.narrowNote"></a><br>A side panel needs 60 columns: below that a toggle says so instead of seeming to do nothing.
      - fn [contextPack](../../src/tui/app.ts#L2282) () → ContextPack | null
        <a id="tui.app.App.contextPack"></a><br>The pack for the current buffer and cursor line; null before the first analysis.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.agent-context.contextPack](features.md#features.agent-context.contextPack)
      - fn [contextKey](../../src/tui/app.ts#L2293) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.contextKey"></a><br>Keys of the focused context panel: move, leave an item out (`x`), add a node (`@`).
        - calls [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext)
      - fn [addToContext](../../src/tui/app.ts#L2335) (id: string) → void <!-- internal -->
        <a id="tui.app.App.addToContext"></a><br>Adds the node `id` to the agent context, with a message for an unknown ID.
        - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode)
      - fn [explainAtCursor](../../src/tui/app.ts#L2367) () → void <!-- internal -->
        <a id="tui.app.App.explainAtCursor"></a><br>`e`: offline, from the session's analysis as it is shown — the summary of the ID under the cursor with its saved answer and brief, each with its provenance, or the help of the line's diagnostic code. Never a model and never a file read behind the analysis' back, apart from the…
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.view.layout](tui.md#tui.view.layout), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [tui.app.App.explainLines](tui.md#tui.app.App.explainLines)
      - fn [explainLines](../../src/tui/app.ts#L2407) (id: string, found: Exclude<ReturnType<typeof nodeExplanation>, { unknown: string }>) → Hover["lines"] <!-- internal -->
        <a id="tui.app.App.explainLines"></a><br>The explain hover of a known node: the summary, the session's analysis, and each saved explanation with its origin.
        - calls [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs)
      - fn [navKey](../../src/tui/app.ts#L2437) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.navKey"></a><br>Keys of the focused navigation panel: move, fold or unfold, open the item's code or spec, zoom.
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.jump](tui.md#tui.app.App.jump), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [filesKey](../../src/tui/app.ts#L2498) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.filesKey"></a><br>Keys of the focused files panel: move and open.
        - calls [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [codeKey](../../src/tui/app.ts#L2535) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.codeKey"></a><br>Keys of the read-only code viewer: scroll, and go back (Esc, `q`, Ctrl+O).
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.goBack](tui.md#tui.app.App.goBack)
      - fn [inputsChanged](../../src/tui/app.ts#L2583) (reason: string) → void <!-- internal -->
        <a id="tui.app.App.inputsChanged"></a><br>Records that an input changed: a feature or check result computed before it is outdated from now on, and so is a spec-to-code preview (one still running too: a model's answer to the old bytes is not the current code).
        - calls [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode)
      - fn [requestOperation](../../src/tui/app.ts#L2599) (action: string, request: OperationRequest, then?: (record: OperationRecord) => void) → void <!-- internal -->
        <a id="tui.app.App.requestOperation"></a><br>Starts an operation that reads the saved files: after the save step when buffers it reads are dirty or it names what it writes (design §2.5), then as the session's one explicit operation. A second one is refused while one runs. `then` hears the record when it ends (not when the…
        - calls [tui.app.App.saveStep](tui.md#tui.app.App.saveStep), [tui.app.App.startOperation](tui.md#tui.app.App.startOperation), [tui.app.App.withSavedInputs](tui.md#tui.app.App.withSavedInputs), [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel)
      - fn [saveStep](../../src/tui/app.ts#L2624) (request: OperationRequest) → SaveStep | null <!-- internal -->
        <a id="tui.app.App.saveStep"></a><br>The save step of an operation: which dirty buffers it reads (saved first; the rest stay dirty and are never read behind them) and what it writes, named before it starts — always for the map and an apply, else when the step opens for dirty inputs anyway (the form already named…
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir), [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.dirtyInputs](tui.md#tui.app.App.dirtyInputs), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.initTargets](tui.md#tui.app.App.initTargets), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget), [tui.forms.draft.codeDraftTarget](tui.md#tui.forms.draft.codeDraftTarget), [tui.forms.draft.codeDraftFormOf](tui.md#tui.forms.draft.codeDraftFormOf), [tui.forms.draft.specCodePlace](tui.md#tui.forms.draft.specCodePlace), [tui.app.App.mapTargets](tui.md#tui.app.App.mapTargets)
      - fn [mapTargets](../../src/tui/app.ts#L2744) () → string[] <!-- internal -->
        <a id="tui.app.App.mapTargets"></a><br>What `keylang map` may write, as the step before it shows.
        - calls [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [initTargets](../../src/tui/app.ts#L2751) () → string[] <!-- internal -->
        <a id="tui.app.App.initTargets"></a><br>The classes of files `keylang init` may write, as its form and its save step name them.
        - calls [tui.app.App.mapTargets](tui.md#tui.app.App.mapTargets), [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [tui.app.App.specDir](tui.md#tui.app.App.specDir)
      - fn [writingNow](../../src/tui/app.ts#L2758) () → boolean <!-- internal -->
        <a id="tui.app.App.writingNow"></a><br>True (with the reason shown) while an operation writes files: saves and merge writes wait for it.
      - fn [beginCommit](../../src/tui/app.ts#L2771) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.beginCommit"></a><br>A writing operation is about to touch files: an analysis in flight is dropped (it read the disk before the commit) and none starts until the commit ends. A record no longer running (cancelled) changes nothing: its aborted signal makes the operation stop with nothing written.
        - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel)
      - fn [endCommit](../../src/tui/app.ts#L2793) (result: OperationResult) → string | null <!-- internal -->
        <a id="tui.app.App.endCommit"></a><br>After a writing operation — completed, cancelled part way or failed part way — the old analysis is superseded and a full one runs with the dirty buffers as overlays. Clean buffers follow the disk through it; a dirty buffer of a written file keeps its text and is named.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.inputsChanged](tui.md#tui.app.App.inputsChanged), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [startOperation](../../src/tui/app.ts#L2865) (action: string, request: OperationRequest, then?: (record: OperationRecord) => void) → OperationRecord | null <!-- internal -->
        <a id="tui.app.App.startOperation"></a><br>Runs an operation as the session's one explicit operation and records it for F6. The UI never blocks: the record turns "running" and the result (or a failure) lands later; a second operation is refused while one runs.
        - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.app.App.layoutBasis](tui.md#tui.app.App.layoutBasis), [tui.assist.Assist.suspendGhost](tui.md#tui.assist.Assist.suspendGhost), [tui.app.App.endCommit](tui.md#tui.app.App.endCommit), [tui.reports.records.recordSummary](tui.md#tui.reports.records.recordSummary), [tui.app.App.afterProposed](tui.md#tui.app.App.afterProposed), [tui.app.App.afterApplyCode](tui.md#tui.app.App.afterApplyCode), [tui.app.App.afterLayoutDraft](tui.md#tui.app.App.afterLayoutDraft), [tui.app.App.quitAfterSettle](tui.md#tui.app.App.quitAfterSettle), [tui.app.App.beginCommit](tui.md#tui.app.App.beginCommit), [tui.app.App.commitGate](tui.md#tui.app.App.commitGate), [tui.app.App.track](tui.md#tui.app.App.track), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [commitGate](../../src/tui/app.ts#L2983) (request: OperationRequest, plan?: CommitPlan) → CommitGate <!-- internal -->
        <a id="tui.app.App.commitGate"></a><br>The session's answer before a commit: a target open with unsaved edits keeps its text and is not written under — an explanation or a feature file edited while the model answered, a diagram, a draft's target edited while the draft was prepared (the proposal would be judged…
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.applyConflicts](tui.md#tui.app.App.applyConflicts), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget)
      - fn [cancelOperation](../../src/tui/app.ts#L3025) () → void <!-- internal -->
        <a id="tui.app.App.cancelOperation"></a><br>Cancel (palette, `x` in F6): the running operation ends as cancelled with exit code null. Esc never does this.
      - fn [afterProposed](../../src/tui/app.ts#L3041) (record: OperationRecord, origin: DraftOrigin) → void <!-- internal -->
        <a id="tui.app.App.afterProposed"></a><br>A finished operation that proposed files: what MERGE opens by itself, or the message saying what waits. The answer's lines it left out and the model's notes are named either way; a preview or a run that proposed nothing only adds its notes to the message.
        - calls [tui.app.App.afterProposal](tui.md#tui.app.App.afterProposal)
      - fn [afterProposal](../../src/tui/app.ts#L3144) (origin: DraftOrigin, proposal: { target: string | null; report: boolean; opened: string; waits: string }) → void <!-- internal -->
        <a id="tui.app.App.afterProposal"></a><br>A finished operation proposed `target`: MERGE opens it by itself only while the person is still where the operation started (`report`: F6 may still show the report it started from, and closes); otherwise — or when MERGE cannot open it, or `target` is null — the proposal waits…
        - calls [tui.app.App.stillWhereStarted](tui.md#tui.app.App.stillWhereStarted), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [stillWhereStarted](../../src/tui/app.ts#L3168) (origin: DraftOrigin, report: boolean) → boolean <!-- internal -->
        <a id="tui.app.App.stillWhereStarted"></a><br>The file, mode and text an operation started from are current and nothing else is open; with `report`, F6 may show the report it started from, else it must be closed. The clip's chat with the focus counts as open: MERGE takes the focus from it, so the letters typed for a…
      - fn [worker](../../src/tui/app.ts#L3177) () → OperationWorker <!-- internal -->
        <a id="tui.app.App.worker"></a><br>The session's operation worker, started on first use; after a failure the next request starts a new one.
        - calls [tui.background.OperationWorker](tui.md#tui.background.OperationWorker)
      - fn [askFeatureQuestions](../../src/tui/app.ts#L3189) (slug: string) → void <!-- internal -->
        <a id="tui.app.App.askFeatureQuestions"></a><br>«Ask the model for questions» (c4-zoom/11): one request with the saved feature file and the context around its ids; the answer's `- ? …` lines are a proposal that MERGE accepts. Without an agent it says how to set one and changes nothing.
        - calls [tui.app.App.agentName](tui.md#tui.app.App.agentName), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [flowAtCursor](../../src/tui/app.ts#L3202) () → string | null <!-- internal -->
        <a id="tui.app.App.flowAtCursor"></a><br>The `# flow <name>` section the cursor is in, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [agentName](../../src/tui/app.ts#L3222) () → string | null <!-- internal -->
        <a id="tui.app.App.agentName"></a><br>The effective agent (`KEYLANG_AGENT`, agents.json, the saved keylang.json as the last analysis read it), or null. Credentials are checked by the operation.
        - calls [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent)
      - fn [draftAtCursor](../../src/tui/app.ts#L3236) () → void <!-- internal -->
        <a id="tui.app.App.draftAtCursor"></a><br>`Ctrl+Space` in the view: the agent drafts the flow under the cursor into this file — hybrid, with the context pack as F4 shows it now — as the session's draft-flow operation. It needs a model (never a silent algo draft).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.app.App.proposalWaiting](tui.md#tui.app.App.proposalWaiting), [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor), [tui.app.App.triggerAtCursor](tui.md#tui.app.App.triggerAtCursor), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [features.agent-context.contextText](features.md#features.agent-context.contextText), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.track](tui.md#tui.app.App.track)
      - fn [triggerAtCursor](../../src/tui/app.ts#L3299) () → string | null <!-- internal -->
        <a id="tui.app.App.triggerAtCursor"></a><br>The `trigger` of the flow section under the cursor, or null.
        - calls [tui.app.App.flowAtCursor](tui.md#tui.app.App.flowAtCursor)
      - fn [proposalWaiting](../../src/tui/app.ts#L3307) (path: string) → boolean <!-- internal -->
        <a id="tui.app.App.proposalWaiting"></a><br>Something is at `.keylang/proposals/<path>`: a proposal (or a link) the person has not resolved.
      - fn [plannedFns](../../src/tui/app.ts#L3320) () → string[] <!-- internal -->
        <a id="tui.app.App.plannedFns"></a><br>The planned fns of the current analysis that no code implements yet: the IDs spec-to-code builds.
        - calls [base.span.compareText](base.md#base.span.compareText)
      - fn [applyCandidate](../../src/tui/app.ts#L3337) (record: OperationRecord | undefined) → void <!-- internal -->
        <a id="tui.app.App.applyCandidate"></a><br>`a` in F6 on a finished spec-to-code record: applies the entire candidate (`spec-to-code --apply`) after a step that names every file. Refused before that step: a run that did not finish, an outdated candidate (an input saved or its files written since), a file with unsaved…
        - calls [tui.app.App.applyConflicts](tui.md#tui.app.App.applyConflicts), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation)
      - fn [applyConflicts](../../src/tui/app.ts#L3371) (files: readonly string[], proposals: boolean) → string[] <!-- internal -->
        <a id="tui.app.App.applyConflicts"></a><br>What in this session stops applying `files`: an open MERGE on one, unsaved edits, and (before the run) a waiting proposal.
        - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [afterApplyCode](../../src/tui/app.ts#L3390) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.afterApplyCode"></a><br>After an apply: every spec-to-code candidate for a file it wrote is outdated (applying it again would overwrite newer code), and the message says what was written. `u` stays the undo of the last MERGE.
      - fn [layoutBasis](../../src/tui/app.ts#L3408) () → LayoutBasis <!-- internal -->
        <a id="tui.app.App.layoutBasis"></a><br>keylang.json as the session has it now: its buffer's version, the file, the code snapshot.
        - calls [tui.disk.readText](tui.md#tui.disk.readText)
      - fn [layoutStale](../../src/tui/app.ts#L3413) (record: OperationRecord) → string | null <!-- internal -->
        <a id="tui.app.App.layoutStale"></a><br>Why the layers of a layout draft no longer fit the session, or null: keylang.json was edited, saved or changed on disk, or the code moved on.
        - calls [tui.app.App.layoutBasis](tui.md#tui.app.App.layoutBasis), [tui.disk.splitEol](tui.md#tui.disk.splitEol)
      - fn [afterLayoutDraft](../../src/tui/app.ts#L3432) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.afterLayoutDraft"></a><br>A finished layout draft: nothing moves by itself; an edit made meanwhile makes it outdated at once.
        - calls [tui.app.App.layoutStale](tui.md#tui.app.App.layoutStale)
      - fn [moveLayers](../../src/tui/app.ts#L3455) (record: OperationRecord) → void <!-- internal -->
        <a id="tui.app.App.moveLayers"></a><br>Enter on a finished layout draft in F6: its layers replace only `layers` of keylang.json's buffer — every other field stays, unknown ones too — as one undoable edit; nothing is written until Ctrl+S. Without keylang.json a new buffer opens with the inferred config and these…
        - calls [tui.app.App.layoutStale](tui.md#tui.app.App.layoutStale), [tui.app.App.load](tui.md#tui.app.App.load), [tui.buffer.newFileBuffer](tui.md#tui.buffer.newFileBuffer), [base.config.withLayers](base.md#base.config.withLayers), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.app.App.openConfig](tui.md#tui.app.App.openConfig), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [base.config.parseConfig](base.md#base.config.parseConfig), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [openNewSpec](../../src/tui/app.ts#L3532) () → void <!-- internal -->
        <a id="tui.app.App.openNewSpec"></a><br>The form of a new specification (design §2.8): kind, then path, then (for a flow) its name. Nothing exists until Ctrl+S.
        - calls [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec)
      - fn [refreshNewSpec](../../src/tui/app.ts#L3538) () → void <!-- internal -->
        <a id="tui.app.App.refreshNewSpec"></a><br>The items and the note of the field being typed. The root is always named: the path is relative to it.
        - calls [tui.new-spec.defaultSpecPath](tui.md#tui.new-spec.defaultSpecPath), [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.new-spec.flowNameProblem](tui.md#tui.new-spec.flowNameProblem)
      - fn [submitNewSpec](../../src/tui/app.ts#L3575) () → void <!-- internal -->
        <a id="tui.app.App.submitNewSpec"></a><br>Enter in the form: the next field, or the buffer. An invalid field keeps the form with its text and says why.
        - calls [tui.new-spec.defaultSpecPath](tui.md#tui.new-spec.defaultSpecPath), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.new-spec.newSpecProblem](tui.md#tui.new-spec.newSpecProblem), [tui.app.App.generatedDoc](tui.md#tui.app.App.generatedDoc), [tui.app.App.open](tui.md#tui.app.App.open), [tui.new-spec.suggestedFlowName](tui.md#tui.new-spec.suggestedFlowName), [tui.app.App.createSpec](tui.md#tui.app.App.createSpec), [tui.new-spec.flowNameProblem](tui.md#tui.new-spec.flowNameProblem)
      - fn [createSpec](../../src/tui/app.ts#L3634) (kind: NewSpecForm["kind"], path: string, name: string) → void <!-- internal -->
        <a id="tui.app.App.createSpec"></a><br>Opens the new, unsaved buffer in the editor at its end: listed in FILES and analysed as overlay, no file or directory until Ctrl+S.
        - calls [tui.buffer.newFileBuffer](tui.md#tui.buffer.newFileBuffer), [tui.new-spec.specTemplate](tui.md#tui.new-spec.specTemplate), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [mergeOrPick](../../src/tui/app.ts#L3653) () → void <!-- internal -->
        <a id="tui.app.App.mergeOrPick"></a><br>`m`: the proposal of the current file opens directly; otherwise the proposals list, so no target is chosen for the person. Without a mergeable proposal the message names the ignored ones and their reasons, as before.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals)
      - fn [openProposals](../../src/tui/app.ts#L3663) (prefer: readonly string[] = []) → void <!-- internal -->
        <a id="tui.app.App.openProposals"></a><br>The proposals list (design §2.9): every file under `.keylang/proposals/`, scanned now; viewing writes nothing.
        - calls [tui.merge-session.MergeSession.entries](tui.md#tui.merge-session.MergeSession.entries), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt)
      - fn [refreshProposalPrompt](../../src/tui/app.ts#L3679) (selected?: string) → void <!-- internal -->
        <a id="tui.app.App.refreshProposalPrompt"></a><br>The list entries whose path contains the typed text, in POSIX path order, each with its note.
        - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.padWidth](tui.md#tui.width.padWidth), [tui.app.proposalSummary](tui.md#tui.app.proposalSummary)
      - fn [submitProposal](../../src/tui/app.ts#L3699) () → void <!-- internal -->
        <a id="tui.app.App.submitProposal"></a><br>Enter in the list: the entry is scanned again first, so a proposal removed, rewritten or broken since the list was built is judged as it is now. A mergeable one opens in MERGE against the file on disk; any other keeps the list open with its reason, and nothing is written.
        - calls [tui.merge-session.MergeSession.entries](tui.md#tui.merge-session.MergeSession.entries), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open)
      - fn [mouse](../../src/tui/app.ts#L3723) (event: MouseEvent) → void <!-- internal -->
        <a id="tui.app.App.mouse"></a><br>Pointer events: the topmost thing under the pointer takes them (panel, clip, side panels, editor).
        - calls [tui.results-panel.ResultsPanel.scrollReport](tui.md#tui.results-panel.ResultsPanel.scrollReport), [tui.clip.Clip.mouse](tui.md#tui.clip.Clip.mouse), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom-screen.ZoomScreen.zoomMouse](tui.md#tui.zoom-screen.ZoomScreen.zoomMouse), [tui.merge.mergeRows](tui.md#tui.merge.mergeRows), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.cellAt](tui.md#tui.app.App.cellAt), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt), [tui.view.contextTop](tui.md#tui.view.contextTop), [tui.view.navListHeight](tui.md#tui.view.navListHeight), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.view.filesTop](tui.md#tui.view.filesTop), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode)
      - fn [promptType](../../src/tui/app.ts#L3848) (text: string) → void <!-- internal -->
        <a id="tui.app.App.promptType"></a><br>Text typed or pasted while a prompt is open: into the selected row's field.
        - calls [tui.prompt-keys.typeInto](tui.md#tui.prompt-keys.typeInto), [tui.app.App.keysFor](tui.md#tui.app.App.keysFor)
      - fn [keysFor](../../src/tui/app.ts#L3857) (prompt: Prompt) → PromptKeys <!-- internal -->
        <a id="tui.app.App.keysFor"></a><br>What the keys of each kind of prompt do: which text the selected row edits, what follows typing, a move and a change, and what Enter runs.
        - calls [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.addToContext](tui.md#tui.app.App.addToContext), [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette), [tui.prompt-keys.noteOfSelection](tui.md#tui.prompt-keys.noteOfSelection), [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.goToNode](tui.md#tui.app.App.goToNode), [tui.zoom-screen.ZoomScreen.findFlows](tui.md#tui.zoom-screen.ZoomScreen.findFlows), [tui.app.App.refreshProposalPrompt](tui.md#tui.app.App.refreshProposalPrompt), [tui.app.App.submitProposal](tui.md#tui.app.App.submitProposal), [tui.app.App.refreshNewSpec](tui.md#tui.app.App.refreshNewSpec), [tui.app.App.submitNewSpec](tui.md#tui.app.App.submitNewSpec), [tui.forms.explain.ExplainForms.keys](tui.md#tui.forms.explain.ExplainForms.keys), [tui.forms.run.RunForms.keys](tui.md#tui.forms.run.RunForms.keys), [tui.forms.draft.DraftForms.keys](tui.md#tui.forms.draft.DraftForms.keys), [tui.forms.export.ExportForms.keys](tui.md#tui.forms.export.ExportForms.keys)
      - fn [openNodeSearch](../../src/tui/app.ts#L3949) () → void <!-- internal -->
        <a id="tui.app.App.openNodeSearch"></a><br>`s` (the view, the zoom) and «Find a node»: the node search, its matches following the text typed.
        - calls [tui.app.App.findNodes](tui.md#tui.app.App.findNodes)
      - fn [findNodes](../../src/tui/app.ts#L3955) () → void <!-- internal -->
        <a id="tui.app.App.findNodes"></a><br>The nodes matching the `s` prompt: names and IDs as a subsequence, then words of their explanations.
        - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes)
      - fn [promptKey](../../src/tui/app.ts#L3967) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.promptKey"></a><br>Keys of the open prompt (a form, the palette, a search): Esc closes it, the rest go to its key table.
        - calls [tui.prompt-keys.promptKey](tui.md#tui.prompt-keys.promptKey), [tui.app.App.keysFor](tui.md#tui.app.App.keysFor)
      - fn [openPalette](../../src/tui/app.ts#L3980) () → void <!-- internal -->
        <a id="tui.app.App.openPalette"></a><br>`:` in view/read, Ctrl+P anywhere: the full catalogue with fuzzy search.
        - calls [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette)
      - fn [refreshPalette](../../src/tui/app.ts#L3986) () → void <!-- internal -->
        <a id="tui.app.App.refreshPalette"></a><br>The catalogue entries matching the prompt text, as parallel item arrays.
        - calls [tui.actions.matchActions](tui.md#tui.actions.matchActions), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionLabel](tui.md#tui.actions.actionLabel)
      - fn [runAction](../../src/tui/app.ts#L4003) (id: string) → void <!-- internal -->
        <a id="tui.app.App.runAction"></a><br>Executes a palette action by its id. An unavailable action explains its reason; execution never synthesizes fake key events.
        - calls [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.clip.chatTakesKeys](tui.md#tui.clip.chatTakesKeys), [tui.app.App.browse](tui.md#tui.app.App.browse), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.zoom-screen.ZoomScreen.openZoom](tui.md#tui.zoom-screen.ZoomScreen.openZoom), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.results-panel.ResultsPanel.openResults](tui.md#tui.results-panel.ResultsPanel.openResults), [tui.app.App.requestOperation](tui.md#tui.app.App.requestOperation), [tui.forms.run.RunForms.openFeaturePrompt](tui.md#tui.forms.run.RunForms.openFeaturePrompt), [tui.forms.export.ExportForms.openC4Prompt](tui.md#tui.forms.export.ExportForms.openC4Prompt), [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf), [tui.app.App.specDir](tui.md#tui.app.App.specDir), [tui.app.App.askFeatureQuestions](tui.md#tui.app.App.askFeatureQuestions), [tui.forms.run.RunForms.openCheckPrompt](tui.md#tui.forms.run.RunForms.openCheckPrompt), [tui.forms.run.RunForms.openEdgePrompt](tui.md#tui.forms.run.RunForms.openEdgePrompt), [tui.forms.export.ExportForms.openExportPrompt](tui.md#tui.forms.export.ExportForms.openExportPrompt), [tui.forms.run.RunForms.openBaselinePrompt](tui.md#tui.forms.run.RunForms.openBaselinePrompt), [tui.forms.run.RunForms.openAgentsPrompt](tui.md#tui.forms.run.RunForms.openAgentsPrompt), [tui.forms.run.RunForms.openInitPrompt](tui.md#tui.forms.run.RunForms.openInitPrompt), [tui.forms.run.RunForms.openFmtPrompt](tui.md#tui.forms.run.RunForms.openFmtPrompt), [tui.forms.run.RunForms.openParsePrompt](tui.md#tui.forms.run.RunForms.openParsePrompt), [tui.forms.run.RunForms.openTracePlanPrompt](tui.md#tui.forms.run.RunForms.openTracePlanPrompt), [tui.forms.explain.ExplainForms.open](tui.md#tui.forms.explain.ExplainForms.open), [tui.forms.explain.ExplainForms.openModel](tui.md#tui.forms.explain.ExplainForms.openModel), [tui.forms.explain.ExplainForms.openPlan](tui.md#tui.forms.explain.ExplainForms.openPlan), [tui.forms.draft.DraftForms.openFlow](tui.md#tui.forms.draft.DraftForms.openFlow), [tui.forms.draft.DraftForms.openRules](tui.md#tui.forms.draft.DraftForms.openRules), [tui.forms.draft.DraftForms.openLayout](tui.md#tui.forms.draft.DraftForms.openLayout), [tui.forms.draft.DraftForms.openCode](tui.md#tui.forms.draft.DraftForms.openCode), [tui.forms.draft.DraftForms.openSpecCode](tui.md#tui.forms.draft.DraftForms.openSpecCode), [tui.forms.run.RunForms.openWirePrompt](tui.md#tui.forms.run.RunForms.openWirePrompt), [tui.app.App.cancelOperation](tui.md#tui.app.App.cancelOperation), [tui.app.App.openNodeSearch](tui.md#tui.app.App.openNodeSearch), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.hoverAtCursor](tui.md#tui.app.App.hoverAtCursor), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.save](tui.md#tui.app.App.save), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.draftAtCursor](tui.md#tui.app.App.draftAtCursor), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.writingNow](tui.md#tui.app.App.writingNow), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.actions.applyRecord](tui.md#tui.actions.applyRecord), [tui.app.App.applyCandidate](tui.md#tui.app.App.applyCandidate), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.mergeOrPick](tui.md#tui.app.App.mergeOrPick), [tui.app.App.openProposals](tui.md#tui.app.App.openProposals), [tui.app.App.openNewSpec](tui.md#tui.app.App.openNewSpec), [tui.clip.Clip.reset](tui.md#tui.clip.Clip.reset), [tui.app.packageVersion](tui.md#tui.app.packageVersion), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [findNext](../../src/tui/app.ts#L4186) () → void <!-- internal -->
        <a id="tui.app.App.findNext"></a><br>`n`: the next line (wrapping) that contains the search text, case-insensitively.
        - calls [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [textToSpec](../../src/tui/app.ts#L4211) () → void <!-- internal -->
        <a id="tui.app.App.textToSpec"></a><br>Ctrl+G: free text (the selection, else the paragraph at the cursor) into spec items, proposed through MERGE.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.plannedIds](tui.md#tui.app.plannedIds), [tui.text-to-spec.textToSpec](tui.md#tui.text-to-spec.textToSpec), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start)
    - fn [forNodes](../../src/tui/app.ts#L4274) (doc: Document, visit: (node: Node) => void) → void <!-- internal -->
      <a id="tui.app.forNodes"></a><br>Visits every item of every section of `doc`, depth first.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [plannedIds](../../src/tui/app.ts#L4279) (docs: readonly Document[]) → { id: string; kind: string }[] <!-- internal -->
      <a id="tui.app.plannedIds"></a><br>Every `planned` ID in the documents with its declared kind (`fn` when none is written).
      - calls [tui.app.forNodes](tui.md#tui.app.forNodes)
    - fn [sortFiles](../../src/tui/app.ts#L4292) (files: string[], analysis: Analysis | null) → string[] <!-- internal -->
      <a id="tui.app.sortFiles"></a><br>Hand-written specs first (flows, rules), then generated map files, then `keylang.json`.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [typedRun](../../src/tui/app.ts#L4299) (events: readonly InputEvent[], from: number) → KeyEvent[] <!-- internal -->
      <a id="tui.app.typedRun"></a><br>The keys from `from` on that only type text (letters, Enter, Tab without modifiers).
    - fn [pasteRefusal](../../src/tui/app.ts#L4313) (state: State) → string <!-- internal -->
      <a id="tui.app.pasteRefusal"></a><br>Why pasted text went nowhere, and the way to where it would go: only the editor takes text.
    - fn [pastedRun](../../src/tui/app.ts#L4335) (run: readonly KeyEvent[], editing: boolean) → boolean <!-- internal -->
      <a id="tui.app.pastedRun"></a><br>Whether a run of typed keys from one chunk is text pasted by a terminal without bracketed paste rather than keys. In the editor every run is: one edit, not one per key.
    - fn [printable](../../src/tui/app.ts#L4352) (text: string) → string <!-- internal -->
      <a id="tui.app.printable"></a><br>Text that may go into a spec: escape sequences (colored output pasted from a terminal) and other control characters are removed; tabs and line breaks stay.
    - type [ConfigOnDisk](../../src/tui/app.ts#L4360) = { config: ConfigState; clip: boolean | null } <!-- internal -->
      <a id="tui.app.ConfigOnDisk"></a><br>The state of `keylang.json` on disk, and its `clip` setting when it can say.
    - fn [configState](../../src/tui/app.ts#L4367) (root: string) → ConfigOnDisk <!-- internal -->
      <a id="tui.app.configState"></a><br>`keylang.json` as it is on disk now: missing (with the guessed layout), invalid (with the reason) or valid; and whether it shows the clip — null when an invalid file cannot say, so the clip stays as it was.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.guessLayout](base.md#base.config.guessLayout), [base.config.parseConfig](base.md#base.config.parseConfig), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
    - fn [configErrorCursor](../../src/tui/app.ts#L4393) (text: string, reason: string) → Cursor
      <a id="tui.app.configErrorCursor"></a><br>Where the config error is: the line and column of an invalid JSON message (`line 3 column 5`, else `position N`), or the key the first quoted field path names (`check.trace` → `"check"`, then `"trace"` after it); else the start.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [packageVersion](../../src/tui/app.ts#L4428) () → string <!-- internal -->
      <a id="tui.app.packageVersion"></a><br>The package version, for the "About keylang" palette action.
    - fn [proposalSummary](../../src/tui/app.ts#L4434) (entry: ProposalEntry) → string <!-- internal -->
      <a id="tui.app.proposalSummary"></a><br>The list text of a proposal after its path: kind, a new file, and the hunk count or that it is ignored.
    - type [SidePanel](../../src/tui/app.ts#L4451) = "files" | "nav" | "context" <!-- internal -->
      <a id="tui.app.SidePanel"></a><br>A side panel that can take the focus: files (F2), navigation (F3) or the context in its place (F4).
    - type [LayoutBasis](../../src/tui/app.ts#L4454) <!-- internal -->
      <a id="tui.app.LayoutBasis"></a><br>What a layout draft was made against: keylang.json's buffer (null: none open), the file, the code snapshot.
    - type [DraftOrigin](../../src/tui/app.ts#L4461) <!-- internal -->
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
    - type [Microphone](../../src/tui/assist.ts#L27)
      <a id="tui.assist.Microphone"></a><br>Opens the microphone: 16-bit PCM chunks until `stop()`, or null when there is none.
    - type [AssistHost](../../src/tui/assist.ts#L30)
      <a id="tui.assist.AssistHost"></a><br>What the assists need from the session around them.
    - type [Spot](../../src/tui/assist.ts#L45) <!-- internal -->
      <a id="tui.assist.Spot"></a><br>Where async work was asked for; it lands only while the session is still there.
    - type [GhostFlight](../../src/tui/assist.ts#L52) <!-- internal -->
      <a id="tui.assist.GhostFlight"></a><br>The ghost request on its way: where it was asked, and how to abort it.
    - type [Recording](../../src/tui/assist.ts#L59) <!-- internal -->
      <a id="tui.assist.Recording"></a><br>A recording from its first `Ctrl+R`: the microphone may still be opening when the second one comes.
    - fn [countSuggestion](../../src/tui/assist.ts#L69) (state: Pick<State, "root" | "config">, source: "ghost" | "completion", field: "proposed" | "accepted" | "rejected", shown: number | null | undefined) → void
      <a id="tui.assist.countSuggestion"></a><br>Counts for design §7.3: ghost measured against the deterministic completion; an unwritable `.keylang/` only loses the count. Browse (no `keylang.json`) counts nothing: it writes no file, `.keylang/` included.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats)
    - module [Assist](../../src/tui/assist.ts#L85)
      <a id="tui.assist.Assist"></a><br>Ghost text and voice input for one session.
      - fn [constructor](../../src/tui/assist.ts#L94) (host: AssistHost, microphone: Microphone)
        <a id="tui.assist.Assist.constructor"></a><br>Stores the given host and microphone on the instance so later methods can use them; nothing else happens at construction time. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [state](../../src/tui/assist.ts#L99) () → State <!-- internal -->
        <a id="tui.assist.Assist.state"></a><br>Private getter that returns the current `State` object owned by the host, so the assist logic reads the host's state rather than keeping its own copy. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [waiting](../../src/tui/assist.ts#L104) () → boolean
        <a id="tui.assist.Assist.waiting"></a><br>A ghost request waits for its pause.
      - fn [recordingNow](../../src/tui/assist.ts#L109) () → boolean
        <a id="tui.assist.Assist.recordingNow"></a><br>A recording is starting, running or being recognized.
      - fn [close](../../src/tui/assist.ts#L114) () → void
        <a id="tui.assist.Assist.close"></a><br>Aborts a ghost request and stops a running microphone.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [spot](../../src/tui/assist.ts#L120) (buffer: Buffer) → Spot <!-- internal -->
        <a id="tui.assist.Assist.spot"></a><br>Where the session is now, for work that lands later.
      - fn [at](../../src/tui/assist.ts#L125) (spot: Spot) → boolean <!-- internal -->
        <a id="tui.assist.Assist.at"></a><br>The session is where `spot` was taken: the same buffer, its text unchanged, the same mode, no merge on top.
      - fn [stopGhostTimer](../../src/tui/assist.ts#L134) () → void <!-- internal -->
        <a id="tui.assist.Assist.stopGhostTimer"></a><br>Clears the pending ghost timer and tells the session nothing waits on it.
      - fn [cancelGhost](../../src/tui/assist.ts#L142) () → void
        <a id="tui.assist.Assist.cancelGhost"></a><br>No ghost request waits for its pause or runs: the one in flight is aborted.
        - calls [tui.assist.Assist.stopGhostTimer](tui.md#tui.assist.Assist.stopGhostTimer)
      - fn [cancelStaleGhost](../../src/tui/assist.ts#L149) () → void
        <a id="tui.assist.Assist.cancelStaleGhost"></a><br>After any input: a ghost request in flight for a place the session has left (buffer, text, mode, line) is aborted.
        - calls [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [suspendGhost](../../src/tui/assist.ts#L159) () → void
        <a id="tui.assist.Assist.suspendGhost"></a><br>An explicit operation starts: a ghost request waiting for its pause is not made, and one already asked is aborted and never shown.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost)
      - fn [ghostSoon](../../src/tui/assist.ts#L165) () → void
        <a id="tui.assist.Assist.ghostSoon"></a><br>After a pause with the cursor on a new flow item, ask the agent for one next line; never while an operation runs.
        - calls [tui.assist.Assist.cancelGhost](tui.md#tui.assist.Assist.cancelGhost), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.ghost.ghostSignal](features.md#features.ghost.ghostSignal), [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.ghost.ghostSuggestions](features.md#features.ghost.ghostSuggestions), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.state](tui.md#tui.assist.Assist.state), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [base.config.isCliAgent](base.md#base.config.isCliAgent)
      - fn [acceptGhost](../../src/tui/assist.ts#L224) (ghost: NonNullable<State["ghost"]>) → void
        <a id="tui.assist.Assist.acceptGhost"></a><br>`Tab` on a ghost line: taken only into the text it was shown for.
        - calls [tui.assist.Assist.state](tui.md#tui.assist.Assist.state), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [dropGhost](../../src/tui/assist.ts#L244) () → void
        <a id="tui.assist.Assist.dropGhost"></a><br>Anything but `Tab` and `Alt+]` drops a shown ghost line.
        - calls [tui.assist.Assist.state](tui.md#tui.assist.Assist.state), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [voice](../../src/tui/assist.ts#L261) () → void
        <a id="tui.assist.Assist.voice"></a><br>`Ctrl+R`: record until `Ctrl+R` again (or the source ends), recognize, and insert: on a new list item a command («крок …», «коли … тоді …») becomes the item, anything else is free text at the cursor. The speech goes in only while the same buffer, with the same text, is still…
        - calls [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.voice.voiceEngine](features.md#features.voice.voiceEngine), [features.voice.glossary](features.md#features.voice.glossary), [features.voice.transcribeOpenRouter](features.md#features.voice.transcribeOpenRouter), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.insertSpeech](tui.md#tui.assist.Assist.insertSpeech), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [insertSpeech](../../src/tui/assist.ts#L357) (text: string, line: number, analysis: Analysis) → void <!-- internal -->
        <a id="tui.assist.Assist.insertSpeech"></a><br>Puts recognized `text` into the buffer: as list items on an empty item line, else as text at the cursor.
        - calls [features.voice.speechToSpec](features.md#features.voice.speechToSpec), [tui.width.graphemes](tui.md#tui.width.graphemes)
  - module [background](../../src/tui/background.ts#L1)
    <a id="tui.background"></a><br>Snapshot generation off the UI thread. One long-lived worker builds the map (tree-sitter extraction, graph, render); the caller parses specs and assesses on its own thread, which is fast.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - map [map.map](map.md#map.map)
    - operations [operations.operations](operations.md#operations.operations)
    - analysis-worker [tui.analysis-worker](tui.md#tui.analysis-worker)
    - operation-worker [tui.operation-worker](tui.md#tui.operation-worker)
    - type [Reply](../../src/tui/background.ts#L25) <!-- internal -->
      <a id="tui.background.Reply"></a><br>One answer of the snapshot worker for request `id`: a map result or an error text.
    - module [SnapshotWorker](../../src/tui/background.ts#L32)
      <a id="tui.background.SnapshotWorker"></a><br>The long-lived worker that builds the snapshot and map for `analyze`.
      - fn [constructor](../../src/tui/background.ts#L36)
        <a id="tui.background.SnapshotWorker.constructor"></a><br>Initializes a per-request registry keyed by numeric id, holding the resolve and reject callbacks of pending promises so background map results can later be matched back to their awaiting callers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [generate](../../src/tui/background.ts#L39) (config: Config, options: { overlay: ReadonlyMap<string, string> }) → Promise<MapResult>
        <a id="tui.background.SnapshotWorker.generate"></a><br>`generateMap` for `analyze({ generate })`; the fact cache is only read.
        - calls [tui.background.SnapshotWorker.start](tui.md#tui.background.SnapshotWorker.start), [map.map.generateMap](map.md#map.map.generateMap)
      - fn [close](../../src/tui/background.ts#L55) () → void
        <a id="tui.background.SnapshotWorker.close"></a><br>Terminates the worker; the next `generate` starts a new one.
      - fn [start](../../src/tui/background.ts#L61) () → Worker | null <!-- internal -->
        <a id="tui.background.SnapshotWorker.start"></a><br>The worker, started on first use; null once it has failed, so generation stays on this thread.
        - calls [tui.background.SnapshotWorker.fail](tui.md#tui.background.SnapshotWorker.fail)
      - fn [fail](../../src/tui/background.ts#L98) (error: Error) → void <!-- internal -->
        <a id="tui.background.SnapshotWorker.fail"></a><br>Marks the worker as failed for good and rejects every waiting request.
    - type [Pending](../../src/tui/background.ts#L108) <!-- internal -->
      <a id="tui.background.Pending"></a><br>A request sent to the operation worker and not settled yet.
    - module [OperationWorker](../../src/tui/background.ts#L131)
      <a id="tui.background.OperationWorker"></a><br>Runs shared operations in a worker thread. Every request settles exactly once — with the worker's result, a failure (code 2) when the worker cannot start or dies, or `cancelled` (exit code null) on abort or `close()` — and a late message for a settled request is dropped.
      - fn [constructor](../../src/tui/background.ts#L143) (options: { entry?: URL; workerData?: unknown } = {})
        <a id="tui.background.OperationWorker.constructor"></a><br>`entry` and `workerData` replace the worker module (tests); default: `operation-worker`.
      - fn [run](../../src/tui/background.ts#L151) (request: OperationRequest, context: OperationContext = {}) → Promise<OperationResult>
        <a id="tui.background.OperationWorker.run"></a><br>An `OperationRunner`: the request goes to the worker as cloneable data; progress and the signal stay here.
        - calls [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.background.OperationWorker.start](tui.md#tui.background.OperationWorker.start), [base.diag.errorText](base.md#base.diag.errorText), [tui.background.OperationWorker.cancel](tui.md#tui.background.OperationWorker.cancel), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle)
      - fn [featureBase](../../src/tui/background.ts#L197) (root: string, path: string) → Promise<FeatureBase | null>
        <a id="tui.background.OperationWorker.featureBase"></a><br>`path` (relative to `root`) at the base `keylang feature` takes without `--since` (the merge-base with the main branch, else HEAD), read in the worker: the session's thread starts no git process. A worker that cannot start is a base that could not be read; one stopped before it…
        - calls [tui.background.OperationWorker.start](tui.md#tui.background.OperationWorker.start), [base.diag.errorText](base.md#base.diag.errorText), [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post)
      - fn [close](../../src/tui/background.ts#L223) () → void
        <a id="tui.background.OperationWorker.close"></a><br>Ends the worker and refuses new work. A request before its commit settles as cancelled at once.
        - calls [tui.background.OperationWorker.settleBase](tui.md#tui.background.OperationWorker.settleBase), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop), [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout)
      - fn [cancel](../../src/tui/background.ts#L246) (operationId: number) → void <!-- internal -->
        <a id="tui.background.OperationWorker.cancel"></a><br>Before a commit nothing is written: cancelling terminates the worker and a new one starts with the next request. During a commit the worker is never terminated: it is asked to stop between file steps, and its result — `cancelled` with the steps it did — settles the request.
        - calls [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop)
      - fn [commit](../../src/tui/background.ts#L267) (worker: Worker, operationId: number, plan: CommitPlan | undefined) → void <!-- internal -->
        <a id="tui.background.OperationWorker.commit"></a><br>The worker asks to start writing: the session is told first (`beforeCommit`), then the worker goes ahead — or is cancelled when the signal was aborted meanwhile, with nothing written.
        - calls [tui.background.OperationWorker.post](tui.md#tui.background.OperationWorker.post)
      - fn [post](../../src/tui/background.ts#L300) (call: OperationCall) → void <!-- internal -->
        <a id="tui.background.OperationWorker.post"></a><br>Posts a call to the current worker, if any.
      - fn [start](../../src/tui/background.ts#L309) () → Worker <!-- internal -->
        <a id="tui.background.OperationWorker.start"></a><br>The current worker, or a new one wired to settle requests; throws when it cannot start.
        - calls [tui.background.OperationWorker.settleBase](tui.md#tui.background.OperationWorker.settleBase), [tui.background.progressOf](tui.md#tui.background.progressOf), [tui.background.OperationWorker.commit](tui.md#tui.background.OperationWorker.commit), [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [operations.shared.resultWithout](operations.md#operations.shared.resultWithout), [tui.background.OperationWorker.stop](tui.md#tui.background.OperationWorker.stop)
      - fn [stop](../../src/tui/background.ts#L339) (outcome: (kind: OperationRequest["kind"]) => OperationResult) → void <!-- internal -->
        <a id="tui.background.OperationWorker.stop"></a><br>Terminates the worker and settles what is still pending with `outcome`; a base read in flight is unknown.
        - calls [tui.background.OperationWorker.settle](tui.md#tui.background.OperationWorker.settle), [tui.background.OperationWorker.settleBase](tui.md#tui.background.OperationWorker.settleBase)
      - fn [settleBase](../../src/tui/background.ts#L351) (baseId: number, base: FeatureBase | null) → void <!-- internal -->
        <a id="tui.background.OperationWorker.settleBase"></a><br>Resolves a base read once; unreferences the worker when nothing else waits.
      - fn [settle](../../src/tui/background.ts#L362) (operationId: number, result: OperationResult) → void <!-- internal -->
        <a id="tui.background.OperationWorker.settle"></a><br>Resolves a request once with `result`, releasing its signal; a second settle is a no-op.
    - fn [progressOf](../../src/tui/background.ts#L383) (reply: Extract<OperationReply, { type: "progress" }>) → OperationProgress <!-- internal -->
      <a id="tui.background.progressOf"></a><br>The progress a worker reports, as the operation's `onProgress` takes it.
  - module [buffer](../../src/tui/buffer.ts#L1)
    <a id="tui.buffer"></a><br>What a buffer's text gives: its parsed spec, its lines, and each line cut into clusters with their widths. `setText` is the one way a session changes a buffer's text: it bumps `version`, so work that finishes later (a ghost line, speech, a draft) can tell whether the text it…
    - node [external.node](external.md#external.node)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - state [tui.state](tui.md#tui.state)
    - width [tui.width](tui.md#tui.width)
    - fn [docOf](../../src/tui/buffer.ts#L18) (path: string, text: string) → Document | null
      <a id="tui.buffer.docOf"></a><br>The parsed spec of a buffer; `keylang.json` is plain text.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [newBuffer](../../src/tui/buffer.ts#L23) (path: string, text: string, eol: Buffer["eol"], disk: string | null) → Buffer
      <a id="tui.buffer.newBuffer"></a><br>A buffer for `path` with `text` (already `\n`-ended) as both its text and what is saved.
      - calls [tui.buffer.docOf](tui.md#tui.buffer.docOf)
    - fn [newFileBuffer](../../src/tui/buffer.ts#L30) (path: string, text: string) → Buffer
      <a id="tui.buffer.newFileBuffer"></a><br>A new specification with `text` and no file on disk: unsaved until its first save, even when `text` is empty.
      - calls [tui.buffer.newBuffer](tui.md#tui.buffer.newBuffer)
    - fn [isDirty](../../src/tui/buffer.ts#L35) (buffer: Buffer) → boolean
      <a id="tui.buffer.isDirty"></a><br>Unsaved: the text differs from the disk, or there is no file yet.
    - fn [setText](../../src/tui/buffer.ts#L40) (buffer: Buffer, text: string) → void
      <a id="tui.buffer.setText"></a><br>Replaces the buffer's text, reparses it and bumps `version` so late work can notice the change.
      - calls [tui.buffer.docOf](tui.md#tui.buffer.docOf)
    - type [Cached](../../src/tui/buffer.ts#L47) <!-- internal -->
      <a id="tui.buffer.Cached"></a><br>The split lines and per-line layouts of one buffer text.
    - fn [cached](../../src/tui/buffer.ts#L56) (buffer: Buffer) → Cached <!-- internal -->
      <a id="tui.buffer.cached"></a><br>Looks up a per-buffer cache entry and returns it unchanged when the buffer text is identical by reference; otherwise splits the text into lines, pairs them with an empty layout map, and stores the fresh entry. Serves [`tui.buffer.bufferLines`](tui.md#tui.buffer.bufferLines) and [`tui.buffer.lineLayout`](tui.md#tui.buffer.lineLayout). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [bufferLines](../../src/tui/buffer.ts#L68) (buffer: Buffer) → readonly string[]
      <a id="tui.buffer.bufferLines"></a><br>The buffer's text split on `\n`, cached until the text changes.
      - calls [tui.buffer.cached](tui.md#tui.buffer.cached)
    - fn [lineLayout](../../src/tui/buffer.ts#L73) (buffer: Buffer, index: number) → LineLayout
      <a id="tui.buffer.lineLayout"></a><br>The layout of line `index` (0-based); a line past the end is empty.
      - calls [tui.buffer.cached](tui.md#tui.buffer.cached), [tui.width.layoutLine](tui.md#tui.width.layoutLine)
  - module [clip-chat](../../src/tui/clip-chat.ts#L1)
    <a id="tui.clip-chat"></a><br>What the clip answers in its chat (ADR 0021, .scratch/tui-clip/03–04, 06). A message that starts with `/` is a command, answered from the session or a shared operation without the model.
    - node [external.node](external.md#external.node)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - config [base.config](base.md#base.config)
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
    - type [ChatHost](../../src/tui/clip-chat.ts#L38)
      <a id="tui.clip-chat.ChatHost"></a><br>What the chat needs from the session: what the person sees, and the session's one explicit operation.
    - type [ChatCommand](../../src/tui/clip-chat.ts#L65) <!-- internal -->
      <a id="tui.clip-chat.ChatCommand"></a><br>A command of the chat: answered without the model.
    - fn [noModelAnswer](../../src/tui/clip-chat.ts#L96) (reason: string | null) → string
      <a id="tui.clip-chat.noModelAnswer"></a><br>The answer to free text without a model (spec §4.3); `reason` says what is missing when an agent is set.
    - fn [commandRows](../../src/tui/clip-chat.ts#L104) () → string[] <!-- internal -->
      <a id="tui.clip-chat.commandRows"></a><br>The commands as `/help` and an unknown command list them.
    - fn [helpAnswer](../../src/tui/clip-chat.ts#L109) () → string
      <a id="tui.clip-chat.helpAnswer"></a><br>`/help`: the commands and the chat's keys.
      - calls [tui.clip-chat.commandRows](tui.md#tui.clip-chat.commandRows)
    - fn [checkAnswer](../../src/tui/clip-chat.ts#L114) (state: Pick<State, "analysis" | "updating" | "outdated" | "error">) → string
      <a id="tui.clip-chat.checkAnswer"></a><br>`/check`: the session's `✗ ◌ ✓` as the status line counts them, and its first fails with their positions.
      - calls [tui.evidence.totals](tui.md#tui.evidence.totals), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.findingRow](tui.md#tui.findings.findingRow)
    - fn [featureAnswer](../../src/tui/clip-chat.ts#L127) (report: FeatureReport) → string <!-- internal -->
      <a id="tui.clip-chat.featureAnswer"></a><br>`/feature`: what `keylang feature` prints — the gaps and hints, then its closing line.
      - calls [operations.feature.gapLine](operations.md#operations.feature.gapLine), [operations.feature.hintLine](operations.md#operations.feature.hintLine), [operations.feature.featureSummary](operations.md#operations.feature.featureSummary)
    - fn [cancelled](../../src/tui/clip-chat.ts#L132) (record: OperationRecord) → boolean <!-- internal -->
      <a id="tui.clip-chat.cancelled"></a><br>The operation was cancelled, or ended without a result: nothing was asked, and the log keeps nothing of it.
    - fn [outcomeAnswer](../../src/tui/clip-chat.ts#L137) (record: OperationRecord, text: (result: OperationResult) => string | null) → string <!-- internal -->
      <a id="tui.clip-chat.outcomeAnswer"></a><br>What an operation the chat started ended with: its text, `скасовано`, or the reasons it failed.
      - calls [tui.clip-chat.cancelled](tui.md#tui.clip-chat.cancelled), [tui.clip-chat.failure](tui.md#tui.clip-chat.failure)
    - fn [proposalWritten](../../src/tui/clip-chat.ts#L146) (path: string) → string <!-- internal -->
      <a id="tui.clip-chat.proposalWritten"></a><br>What the chat says of a proposal it wrote. The log keeps its path alone (`**пропозиція:**`): its MERGE may be over by the time the log is read.
    - fn [failure](../../src/tui/clip-chat.ts#L151) (result: OperationResult) → string <!-- internal -->
      <a id="tui.clip-chat.failure"></a><br>Why an operation failed, as its messages say.
    - type [Asked](../../src/tui/clip-chat.ts#L158) <!-- internal -->
      <a id="tui.clip-chat.Asked"></a><br>The model's request in flight: the agent it was sent with, and its record once it started.
    - type [Ending](../../src/tui/clip-chat.ts#L177) <!-- internal -->
      <a id="tui.clip-chat.Ending"></a><br>How an answer ends its exchange in the log: the person's message it answers (null: nothing goes into the log — a cancelled request, or no one asked), the model that answered, the proposal written from it.
    - module [ClipChat](../../src/tui/clip-chat.ts#L188)
      <a id="tui.clip-chat.ClipChat"></a><br>The chat's answers: a command, or the model's reply as the session's `assistant-reply` operation. The conversation is `state.clip.chat`; the eyes follow `state.clip.waiting`.
      - fn [constructor](../../src/tui/clip-chat.ts#L197) (host: ChatHost)
        <a id="tui.clip-chat.ClipChat.constructor"></a>
        - calls [tui.clip-memory.ChatLog](tui.md#tui.clip-memory.ChatLog)
      - fn [state](../../src/tui/clip-chat.ts#L202) () → State <!-- internal -->
        <a id="tui.clip-chat.ClipChat.state"></a>
      - fn [restore](../../src/tui/clip-chat.ts#L207) () → void
        <a id="tui.clip-chat.ClipChat.restore"></a><br>The session starts: the history goes on with today's last conversation in the log.
        - calls [tui.clip-memory.ChatLog.restore](tui.md#tui.clip-memory.ChatLog.restore)
      - fn [said](../../src/tui/clip-chat.ts#L212) (text: string) → void
        <a id="tui.clip-chat.ClipChat.said"></a><br>The person sent `text` (already in the history): a command runs, anything else goes to the model.
        - calls [tui.clip-chat.ClipChat.command](tui.md#tui.clip-chat.ClipChat.command), [tui.clip-chat.ClipChat.ask](tui.md#tui.clip-chat.ClipChat.ask)
      - fn [opened](../../src/tui/clip-chat.ts#L231) () → void
        <a id="tui.clip-chat.ClipChat.opened"></a><br>The person opened the chat or gave it the focus (a click on the clip, F7): with open questions the clip lists them, unless that list is its last message already, and asks the model nothing. The new fails are told then and count no more (spec §4.6).
        - calls [tui.clip-chat.ClipChat.state](tui.md#tui.clip-chat.ClipChat.state), [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions), [tui.clip-questions.questionsAnswer](tui.md#tui.clip-questions.questionsAnswer)
      - fn [cancel](../../src/tui/clip-chat.ts#L249) () → void
        <a id="tui.clip-chat.ClipChat.cancel"></a><br>Esc while the model answers: the request is cancelled, nothing is written, and the history says `скасовано`.
        - calls [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer)
      - fn [close](../../src/tui/clip-chat.ts#L266) () → void
        <a id="tui.clip-chat.ClipChat.close"></a><br>The session ends: a request still being looked up is never started.
        - calls [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting)
      - fn [command](../../src/tui/clip-chat.ts#L273) (line: string) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.command"></a><br>A `/command [arg]` line: the first word picks the command (case-insensitive), the rest is its argument.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.commandRows](tui.md#tui.clip-chat.commandRows)
      - fn [explain](../../src/tui/clip-chat.ts#L283) (arg: string) → void
        <a id="tui.clip-chat.ClipChat.explain"></a><br>`/explain <code|ID>`: the offline `explain` operation, its text as `keylang explain` prints it.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.ClipChat.operation](tui.md#tui.clip-chat.ClipChat.operation)
      - fn [feature](../../src/tui/clip-chat.ts#L291) (arg: string) → void
        <a id="tui.clip-chat.ClipChat.feature"></a><br>`/feature <slug>`: the `feature` operation, its gaps and stage as `keylang feature` prints them.
        - calls [operations.feature.featureSlugOf](operations.md#operations.feature.featureSlugOf), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [base.config.specPath](base.md#base.config.specPath), [tui.clip-chat.ClipChat.operation](tui.md#tui.clip-chat.ClipChat.operation), [tui.clip-chat.featureAnswer](tui.md#tui.clip-chat.featureAnswer)
      - fn [check](../../src/tui/clip-chat.ts#L300) () → void
        <a id="tui.clip-chat.ClipChat.check"></a><br>`/check`: the session's analysis as it is; nothing runs.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.ClipChat.state](tui.md#tui.clip-chat.ClipChat.state), [tui.clip-chat.checkAnswer](tui.md#tui.clip-chat.checkAnswer)
      - fn [questions](../../src/tui/clip-chat.ts#L305) () → void
        <a id="tui.clip-chat.ClipChat.questions"></a><br>`/questions`: the open questions with their places, the list the clip says when its chat opens.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-questions.questionsAnswer](tui.md#tui.clip-questions.questionsAnswer), [tui.clip-chat.ClipChat.state](tui.md#tui.clip-chat.ClipChat.state), [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions)
      - fn [restart](../../src/tui/clip-chat.ts#L310) () → void
        <a id="tui.clip-chat.ClipChat.restart"></a><br>`/new`: a new conversation; the old one is gone from the window, and the log starts a section.
        - calls [tui.clip-chat.ClipChat.note](tui.md#tui.clip-chat.ClipChat.note), [tui.clip-memory.ChatLog.restart](tui.md#tui.clip-memory.ChatLog.restart), [tui.clip-chat.ClipChat.browsing](tui.md#tui.clip-chat.ClipChat.browsing)
      - fn [help](../../src/tui/clip-chat.ts#L318) () → void
        <a id="tui.clip-chat.ClipChat.help"></a><br>`/help`: the commands and the keys.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.helpAnswer](tui.md#tui.clip-chat.helpAnswer)
      - fn [operation](../../src/tui/clip-chat.ts#L323) (action: string, request: OperationRequest, text: (result: OperationResult) => string | null) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.operation"></a><br>A command's shared operation, as the session runs any: one at a time, after the save step when it reads dirty buffers.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.outcomeAnswer](tui.md#tui.clip-chat.outcomeAnswer), [tui.clip-chat.cancelled](tui.md#tui.clip-chat.cancelled)
      - fn [ask](../../src/tui/clip-chat.ts#L337) () → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.ask"></a><br>Free text: the model's reply as the session's `assistant-reply` operation. Without an analysis, a model or a free slot for the operation it answers at once and asks nothing.
        - calls [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [tui.clip-chat.noModelAnswer](tui.md#tui.clip-chat.noModelAnswer), [tui.clip-chat.ClipChat.request](tui.md#tui.clip-chat.ClipChat.request), [lang.files.existingText](lang.md#lang.files.existingText), [tui.clip-chat.ClipChat.start](tui.md#tui.clip-chat.ClipChat.start)
      - fn [request](../../src/tui/clip-chat.ts#L361) () → AssistantReplyRequest <!-- internal -->
        <a id="tui.clip-chat.ClipChat.request"></a><br>What the model reads, frozen when the message is sent: the conversation, the open buffer with the cursor's line and the ID under it, the F4 pack without the buffer it already shows, the open feature's stage and gaps as the status line has them, and the open questions the clip…
        - calls [features.agent-context.contextText](features.md#features.agent-context.contextText), [operations.feature.gapLine](operations.md#operations.feature.gapLine), [tui.clip-questions.questionRows](tui.md#tui.clip-questions.questionRows), [tui.clip-questions.openQuestions](tui.md#tui.clip-questions.openQuestions)
      - fn [start](../../src/tui/clip-chat.ts#L379) (asked: Asked, request: AssistantReplyRequest) → Promise<void> <!-- internal -->
        <a id="tui.clip-chat.ClipChat.start"></a><br>The model's client is looked up off the key path (as `Ctrl+Space` does); then the operation starts, unless Esc came first.
        - calls [base.diag.errorText](base.md#base.diag.errorText), [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.noModelAnswer](tui.md#tui.clip-chat.noModelAnswer), [tui.clip-chat.ClipChat.replied](tui.md#tui.clip-chat.ClipChat.replied)
      - fn [replied](../../src/tui/clip-chat.ts#L413) (asked: Asked, record: OperationRecord) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.replied"></a><br>The operation ended: its reply, `скасовано`, or the model's error with its reason. Nothing was written.
        - calls [tui.clip-chat.ClipChat.stopWaiting](tui.md#tui.clip-chat.ClipChat.stopWaiting), [tui.clip-chat.cancelled](tui.md#tui.clip-chat.cancelled), [tui.clip-chat.ClipChat.answer](tui.md#tui.clip-chat.ClipChat.answer), [tui.clip-chat.failure](tui.md#tui.clip-chat.failure), [tui.clip-chat.ClipChat.propose](tui.md#tui.clip-chat.ClipChat.propose), [tui.clip-chat.proposalWritten](tui.md#tui.clip-chat.proposalWritten)
      - fn [propose](../../src/tui/clip-chat.ts#L443) ({ path, text }: NonNullable<AssistantReplyPayload["proposal"]>, basis: Asked["basis"]) → string <!-- internal -->
        <a id="tui.clip-chat.ClipChat.propose"></a><br>The model's block as a proposal, by the gate of MCP `apply_diff` (`proposalProblem` with the analysis's generated documents) and the refusals before it: Browse writes nothing, code is the harness's, a target with unsaved edits would come back as hunks reverting them, and a…
        - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [lang.files.existingText](lang.md#lang.files.existingText), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [base.diag.errorText](base.md#base.diag.errorText), [tui.clip-chat.proposalWritten](tui.md#tui.clip-chat.proposalWritten)
      - fn [stopWaiting](../../src/tui/clip-chat.ts#L477) () → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.stopWaiting"></a><br>No request is awaited any more: the eyes stop waiting.
      - fn [answer](../../src/tui/clip-chat.ts#L487) (text: string, ending: Ending = { said: this.sent }) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.answer"></a><br>The clip's message ends an exchange: it joins the history, and the history shows its end. The exchange goes into today's log; `ending` names the message it answers — by default the one `said` answers now.
        - calls [tui.clip-chat.proposalWritten](tui.md#tui.clip-chat.proposalWritten), [tui.clip-chat.ClipChat.note](tui.md#tui.clip-chat.ClipChat.note), [tui.clip-memory.ChatLog.exchange](tui.md#tui.clip-memory.ChatLog.exchange), [tui.clip-chat.ClipChat.browsing](tui.md#tui.clip-chat.ClipChat.browsing)
      - fn [note](../../src/tui/clip-chat.ts#L501) (why: string | null) → void <!-- internal -->
        <a id="tui.clip-chat.ClipChat.note"></a><br>Why the log is not written, said once a session: the clip's message after the answer, and no exchange itself.
      - fn [browsing](../../src/tui/clip-chat.ts#L509) () → boolean <!-- internal -->
        <a id="tui.clip-chat.ClipChat.browsing"></a><br>Browse writes nothing: not the log either.
  - module [clip-memory](../../src/tui/clip-memory.ts#L1)
    <a id="tui.clip-memory"></a><br>The clip's memory (ADR 0021 п. 6, .scratch/tui-clip/06). Where the person left the clip and its window is theirs, not the repository's: it lives in `~/.config/keylang/tui.json` beside `agents.json`, read when a session starts and written atomically when a drag, a keyboard move…
    - node [external.node](external.md#external.node)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - json [base.json](base.md#base.json)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - clip [tui.clip](tui.md#tui.clip)
    - fn [tuiFile](../../src/tui/clip-memory.ts#L29) (home: string) → string <!-- internal -->
      <a id="tui.clip-memory.tuiFile"></a><br>`~/.config/keylang/tui.json`: the TUI's settings of its user, beside `agents.json`.
    - type [ClipPlace](../../src/tui/clip-memory.ts#L34)
      <a id="tui.clip-memory.ClipPlace"></a><br>Where the person left the clip and its window, cells from 0; null: where it stands by default.
    - fn [placeOf](../../src/tui/clip-memory.ts#L43) (clip: ClipState) → ClipPlace
      <a id="tui.clip-memory.placeOf"></a><br>The place of the clip and its window as the session has them: as the person set them, whatever a smaller terminal shows.
    - fn [placeClip](../../src/tui/clip-memory.ts#L50) (clip: ClipState, place: ClipPlace) → void
      <a id="tui.clip-memory.placeClip"></a><br>A session starts with the clip and its window where they were left; the frame keeps them inside its terminal.
    - fn [parsePlace](../../src/tui/clip-memory.ts#L64) (file: string, value: JsonValue) → ClipPlace
      <a id="tui.clip-memory.parsePlace"></a><br>The place a parsed tui.json holds. No `assistant`, `clip` or `window`, or null: the default.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [tui.clip-memory.shown](tui.md#tui.clip-memory.shown), [tui.clip-memory.fieldsOf](tui.md#tui.clip-memory.fieldsOf), [tui.clip-memory.whole](tui.md#tui.clip-memory.whole)
    - fn [fieldsOf](../../src/tui/clip-memory.ts#L91) (file: string, field: string, value: JsonValue | undefined, keys: readonly string[]) → JsonObject | null <!-- internal -->
      <a id="tui.clip-memory.fieldsOf"></a><br>An object field with only `keys`, or null when it is left out.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [tui.clip-memory.shown](tui.md#tui.clip-memory.shown)
    - fn [whole](../../src/tui/clip-memory.ts#L104) (file: string, field: string, value: JsonValue | undefined, least: number) → number <!-- internal -->
      <a id="tui.clip-memory.whole"></a><br>An integer of at least `least`; a missing one is named as missing.
      - calls [base.json.isJsonNumber](base.md#base.json.isJsonNumber), [tui.clip-memory.shown](tui.md#tui.clip-memory.shown)
    - type [PlaceRead](../../src/tui/clip-memory.ts#L113) = { place: ClipPlace; problem: string | null } <!-- internal -->
      <a id="tui.clip-memory.PlaceRead"></a><br>The place read, and why the default was used instead (null when nothing went wrong).
    - fn [readPlace](../../src/tui/clip-memory.ts#L120) (home: string) → PlaceRead
      <a id="tui.clip-memory.readPlace"></a><br>The place tui.json holds as a session starts. No file: the default, and nothing to say.
      - calls [tui.clip-memory.tuiFile](tui.md#tui.clip-memory.tuiFile), [lang.files.existingText](lang.md#lang.files.existingText), [base.diag.errorText](base.md#base.diag.errorText), [base.json.parseJson](base.md#base.json.parseJson), [tui.clip-memory.parsePlace](tui.md#tui.clip-memory.parsePlace)
    - fn [withPlace](../../src/tui/clip-memory.ts#L152) (text: string | null, place: ClipPlace) → string
      <a id="tui.clip-memory.withPlace"></a><br>tui.json's text with the place: `assistant.clip` and `assistant.window` replaced (left out for the default), every other field as it was. Text that is no JSON object is replaced: the place is all it holds then.
      - calls [tui.clip-memory.parsedObject](tui.md#tui.clip-memory.parsedObject), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [parsedObject](../../src/tui/clip-memory.ts#L166) (text: string | null) → JsonObject <!-- internal -->
      <a id="tui.clip-memory.parsedObject"></a><br>The JSON object in `text`, or `{}` when there is none or it is not an object.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [writePlace](../../src/tui/clip-memory.ts#L179) (home: string, place: ClipPlace) → void
      <a id="tui.clip-memory.writePlace"></a><br>Writes the place into tui.json atomically, at the target of a link to it; throws, naming the file, when it cannot.
      - calls [tui.clip-memory.tuiFile](tui.md#tui.clip-memory.tuiFile), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [tui.clip-memory.withPlace](tui.md#tui.clip-memory.withPlace), [lang.files.existingText](lang.md#lang.files.existingText), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [two](../../src/tui/clip-memory.ts#L199) (n: number) → string <!-- internal -->
      <a id="tui.clip-memory.two"></a><br>A number with a leading zero to two digits.
    - fn [dayOf](../../src/tui/clip-memory.ts#L202) (date: Date) → string
      <a id="tui.clip-memory.dayOf"></a><br>A local date as the log names its file: `2026-10-06`.
      - calls [tui.clip-memory.two](tui.md#tui.clip-memory.two)
    - fn [timeOf](../../src/tui/clip-memory.ts#L207) (date: Date) → string <!-- internal -->
      <a id="tui.clip-memory.timeOf"></a><br>A local time as a section's heading names it: `14:05`.
      - calls [tui.clip-memory.two](tui.md#tui.clip-memory.two)
    - fn [chatLogPath](../../src/tui/clip-memory.ts#L212) (day: string) → string
      <a id="tui.clip-memory.chatLogPath"></a><br>The log of a day, relative to the root, POSIX.
    - type [ChatExchange](../../src/tui/clip-memory.ts#L217)
      <a id="tui.clip-memory.ChatExchange"></a><br>One exchange as the log keeps it.
    - fn [block](../../src/tui/clip-memory.ts#L244) (label: string, text: string) → string <!-- internal -->
      <a id="tui.clip-memory.block"></a><br>A message as a block: the label and its first line, its other lines indented, its empty lines empty.
    - fn [exchangeBlocks](../../src/tui/clip-memory.ts#L252) (exchange: ChatExchange) → string[] <!-- internal -->
      <a id="tui.clip-memory.exchangeBlocks"></a><br>The blocks of an exchange: the person's message, the clip's answer when it says anything, the proposal written.
      - calls [tui.clip-memory.block](tui.md#tui.clip-memory.block)
    - fn [isHeading](../../src/tui/clip-memory.ts#L261) (line: string) → boolean <!-- internal -->
      <a id="tui.clip-memory.isHeading"></a><br>A `## ` line: a section of the log.
    - fn [heading](../../src/tui/clip-memory.ts#L264) (time: string, agents: readonly string[]) → string <!-- internal -->
      <a id="tui.clip-memory.heading"></a><br>A section's heading: when its conversation started, and the models that answered in it.
    - fn [withAgent](../../src/tui/clip-memory.ts#L269) (text: string, agent: string) → string <!-- internal -->
      <a id="tui.clip-memory.withAgent"></a><br>The log's last section heading names `agent` too: a section started by `/new` or a command learns its model from its first answer.
      - calls [tui.clip-memory.isHeading](tui.md#tui.clip-memory.isHeading), [tui.clip-memory.heading](tui.md#tui.clip-memory.heading)
    - fn [appended](../../src/tui/clip-memory.ts#L285) (text: string, blocks: readonly string[]) → string <!-- internal -->
      <a id="tui.clip-memory.appended"></a><br>`text` and the blocks after it, a blank line between any two.
    - fn [withExchange](../../src/tui/clip-memory.ts#L297) (text: string | null, day: string, time: string, exchange: ChatExchange, going: boolean) → string
      <a id="tui.clip-memory.withExchange"></a><br>The log of `day` with an exchange after its last line. `going`: the conversation goes on in the last section, whose heading learns the model that answered; otherwise a section starts at `time` (and an empty log gets its title first).
      - calls [tui.clip-memory.isHeading](tui.md#tui.clip-memory.isHeading), [tui.clip-memory.withAgent](tui.md#tui.clip-memory.withAgent), [tui.clip-memory.heading](tui.md#tui.clip-memory.heading), [tui.clip-memory.appended](tui.md#tui.clip-memory.appended), [tui.clip-memory.exchangeBlocks](tui.md#tui.clip-memory.exchangeBlocks)
    - fn [withSection](../../src/tui/clip-memory.ts#L310) (text: string | null, day: string, time: string) → string
      <a id="tui.clip-memory.withSection"></a><br>The log of `day` with a new section at `time`: `/new`.
      - calls [tui.clip-memory.appended](tui.md#tui.clip-memory.appended), [tui.clip-memory.heading](tui.md#tui.clip-memory.heading)
    - fn [lastConversation](../../src/tui/clip-memory.ts#L321) (text: string) → ChatMessage[] | null
      <a id="tui.clip-memory.lastConversation"></a><br>The conversation of the log's last section, as the history shows it: the person's messages and the clip's, a proposal as the clip's line `пропозиція: <path>`. Null when the log has no section.
      - calls [tui.clip-memory.isHeading](tui.md#tui.clip-memory.isHeading)
    - fn [logBlocked](../../src/tui/clip-memory.ts#L375) (root: string, path: string) → string | null <!-- internal -->
      <a id="tui.clip-memory.logBlocked"></a><br>Why the log may not be written at `path` (relative to `root`): null when git ignores it (`git check-ignore -q`, an argument array, no shell) or when `root` is in no repository — with no `.git` above it, whether git runs or not. In a repository git must say so: anything else…
      - calls [tui.clip-memory.inRepository](tui.md#tui.clip-memory.inRepository)
    - fn [inRepository](../../src/tui/clip-memory.ts#L391) (dir: string) → boolean <!-- internal -->
      <a id="tui.clip-memory.inRepository"></a><br>A `.git` in `dir` or above it: a repository, or a worktree's link to one.
    - module [ChatLog](../../src/tui/clip-memory.ts#L407)
      <a id="tui.clip-memory.ChatLog"></a><br>Today's conversation of one session in `.keylang/chat/`. The exchanges of a conversation go into one section; `/new` and a new day start another.
      - fn [constructor](../../src/tui/clip-memory.ts#L415) (root: string, now: () => Date = () => new Date())
        <a id="tui.clip-memory.ChatLog.constructor"></a>
      - fn [restore](../../src/tui/clip-memory.ts#L421) () → ChatMessage[]
        <a id="tui.clip-memory.ChatLog.restore"></a><br>The conversation a session goes on with: the last section of today's log, or none. Reading writes nothing, in Browse too.
        - calls [tui.clip-memory.dayOf](tui.md#tui.clip-memory.dayOf), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [tui.clip-memory.chatLogPath](tui.md#tui.clip-memory.chatLogPath), [tui.clip-memory.lastConversation](tui.md#tui.clip-memory.lastConversation)
      - fn [exchange](../../src/tui/clip-memory.ts#L431) (exchange: ChatExchange, browsing: boolean) → string | null
        <a id="tui.clip-memory.ChatLog.exchange"></a><br>An exchange ended: it goes into the log. Returns what the chat says the first time the log cannot be written, else null.
        - calls [tui.clip-memory.ChatLog.write](tui.md#tui.clip-memory.ChatLog.write), [tui.clip-memory.withExchange](tui.md#tui.clip-memory.withExchange)
      - fn [restart](../../src/tui/clip-memory.ts#L436) (browsing: boolean) → string | null
        <a id="tui.clip-memory.ChatLog.restart"></a><br>`/new`: a new section, so the conversation before it is not the one a new session goes on with.
        - calls [tui.clip-memory.withSection](tui.md#tui.clip-memory.withSection), [tui.clip-memory.ChatLog.write](tui.md#tui.clip-memory.ChatLog.write)
      - fn [write](../../src/tui/clip-memory.ts#L443) (browsing: boolean, next: (text: string | null, day: string, time: string) => string) → string | null <!-- internal -->
        <a id="tui.clip-memory.ChatLog.write"></a><br>Writes `next` of today's log, unless Browse, git or the file system refuses; returns the one-time reason.
        - calls [tui.clip-memory.dayOf](tui.md#tui.clip-memory.dayOf), [tui.clip-memory.chatLogPath](tui.md#tui.clip-memory.chatLogPath), [tui.clip-memory.logBlocked](tui.md#tui.clip-memory.logBlocked), [tui.clip-memory.ChatLog.tell](tui.md#tui.clip-memory.ChatLog.tell), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [tui.clip-memory.timeOf](tui.md#tui.clip-memory.timeOf), [base.diag.errorText](base.md#base.diag.errorText)
      - fn [tell](../../src/tui/clip-memory.ts#L471) (why: string) → string | null <!-- internal -->
        <a id="tui.clip-memory.ChatLog.tell"></a><br>The reason, the first time only; later refusals stay silent.
    - fn [shown](../../src/tui/clip-memory.ts#L480) (value: JsonValue | undefined) → string <!-- internal -->
      <a id="tui.clip-memory.shown"></a><br>A JSON value as an error message shows it.
  - module [clip-questions](../../src/tui/clip-questions.ts#L1)
    <a id="tui.clip-questions"></a><br>The clip's open questions (ADR 0021 п. 2, .scratch/tui-clip/05): the `- ?` lines of the open file, the gaps of the open feature file, and the fails the session's analyses added since the chat was last opened. Lines and gaps are a state; a new fail is an event the opening of the…
    - analyze [map.analyze](map.md#map.analyze)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - state [tui.state](tui.md#tui.state)
    - type [OpenQuestion](../../src/tui/clip-questions.ts#L17)
      <a id="tui.clip-questions.OpenQuestion"></a><br>One open question: where it is, and what it says after the place.
    - fn [failKey](../../src/tui/clip-questions.ts#L24) (fail: Pick<Verdict, "file" | "line" | "message">) → string <!-- internal -->
      <a id="tui.clip-questions.failKey"></a><br>A fail is told from another by its place and its message.
    - fn [failsOf](../../src/tui/clip-questions.ts#L29) (analysis: Analysis) → Verdict[] <!-- internal -->
      <a id="tui.clip-questions.failsOf"></a><br>The failing verdicts of an analysis.
    - fn [newFailsAfter](../../src/tui/clip-questions.ts#L39) (counted: readonly Verdict[], previous: Analysis | null, next: Analysis) → Verdict[]
      <a id="tui.clip-questions.newFailsAfter"></a><br>The new fails once `next` replaced `previous`: those counted so far that `next` still reports, then those it reports that `previous` did not. A fail gone before anyone looked is no question; with no previous analysis (the session's first) every fail was there before the session.
      - calls [tui.clip-questions.failsOf](tui.md#tui.clip-questions.failsOf), [tui.clip-questions.failKey](tui.md#tui.clip-questions.failKey)
    - fn [questionsIn](../../src/tui/clip-questions.ts#L62) (analysis: Analysis, path: string) → OpenQuestion[] <!-- internal -->
      <a id="tui.clip-questions.questionsIn"></a><br>The `- ?` lines of `path` as the analysis read it, unsaved edits included, in the file's order.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [placeOf](../../src/tui/clip-questions.ts#L77) (question: OpenQuestion) → string <!-- internal -->
      <a id="tui.clip-questions.placeOf"></a><br>`file:line`, the key that merges the same place named by two sources.
    - fn [openQuestions](../../src/tui/clip-questions.ts#L87) (state: Pick<State, "current" | "analysis" | "featureLine" | "clip">) → OpenQuestion[]
      <a id="tui.clip-questions.openQuestions"></a><br>The open questions now, in the order the chat lists them: the open file's `- ?` lines, the open feature's gaps as the status line has them (the report of `keylang feature`, as of the last save), the new fails. A place an earlier source names is not counted again: a question of…
      - calls [tui.clip-questions.questionsIn](tui.md#tui.clip-questions.questionsIn), [tui.clip-questions.placeOf](tui.md#tui.clip-questions.placeOf)
    - fn [questionRow](../../src/tui/clip-questions.ts#L107) (question: OpenQuestion) → string
      <a id="tui.clip-questions.questionRow"></a><br>One question as the chat and the model read it: `file:line` and its text.
      - calls [tui.clip-questions.placeOf](tui.md#tui.clip-questions.placeOf)
    - fn [questionRows](../../src/tui/clip-questions.ts#L115) (questions: readonly OpenQuestion[], limit = QUESTION_ROWS) → string[]
      <a id="tui.clip-questions.questionRows"></a><br>The first `QUESTION_ROWS` questions as rows, and a last row saying how many more there are.
      - calls [tui.clip-questions.questionRow](tui.md#tui.clip-questions.questionRow)
    - fn [questionsAnswer](../../src/tui/clip-questions.ts#L122) (questions: readonly OpenQuestion[]) → string
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
    - fn [drawClip](../../src/tui/clip-view.ts#L33) (grid: Grid, rect: Rect, clip: ClipState) → void
      <a id="tui.clip-view.drawClip"></a><br>The clip, 5×3 cells over the editor, on the background of what is under it, and the counter of open questions right of its top row (left of it at the terminal's right edge).
      - calls [tui.clip.clipEyes](tui.md#tui.clip.clipEyes), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.clip.counterText](tui.md#tui.clip.counterText), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.clip-view.bgAt](tui.md#tui.clip-view.bgAt)
    - fn [bgAt](../../src/tui/clip-view.ts#L55) (grid: Grid, x: number, y: number) → Style <!-- internal -->
      <a id="tui.clip-view.bgAt"></a><br>The background of a cell, so the clip stands on the line under it.
      - calls [tui.screen.Grid.styleAt](tui.md#tui.screen.Grid.styleAt)
    - fn [drawChat](../../src/tui/clip-view.ts#L67) (grid: Grid, state: State, rect: Rect) → void
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
    - type [Cell](../../src/tui/clip.ts#L21)
      <a id="tui.clip.Cell"></a><br>A cell of the screen, 0-based.
    - type [ChatMessage](../../src/tui/clip.ts#L27)
      <a id="tui.clip.ChatMessage"></a><br>One message of the conversation: the person's or the clip's.
    - type [ChatState](../../src/tui/clip.ts#L33)
      <a id="tui.clip.ChatState"></a><br>The chat window of the clip: where it stands, whether it has the keys, and the conversation.
    - type [ClipState](../../src/tui/clip.ts#L50)
      <a id="tui.clip.ClipState"></a><br>The clip and its chat, as the session draws them.
    - fn [newClip](../../src/tui/clip.ts#L111) () → ClipState
      <a id="tui.clip.newClip"></a><br>The clip of a new session: shown, in its corner, the chat folded and empty.
    - fn [narrow](../../src/tui/clip.ts#L123) (size: Pick<State, "cols" | "rows">) → boolean <!-- internal -->
      <a id="tui.clip.narrow"></a><br>Whether the terminal is too small for the clip in its corner.
    - fn [assistantShown](../../src/tui/clip.ts#L128) (state: Pick<State, "start" | "results">) → boolean
      <a id="tui.clip.assistantShown"></a><br>The clip and its window take part in the frame: the start screen and the F6 panel cover them.
    - fn [chatTakesKeys](../../src/tui/clip.ts#L136) (state: State) → boolean
      <a id="tui.clip.chatTakesKeys"></a><br>The window takes the keys: open, focused, and nothing modal over it — a form, the help, a save or quit step, MERGE (which takes no clicks either).
      - calls [tui.clip.assistantShown](tui.md#tui.clip.assistantShown)
    - fn [clipEyes](../../src/tui/clip.ts#L143) (clip: Pick<ClipState, "waiting">) → string
      <a id="tui.clip.clipEyes"></a><br>`◕◕` waits; `◔◔` waits for the model's reply.
    - fn [counterText](../../src/tui/clip.ts#L148) (questions: number) → string
      <a id="tui.clip.counterText"></a><br>The counter of open questions next to the clip: nothing for none, `1`–`9`, then `9+`.
    - fn [badgeText](../../src/tui/clip.ts#L153) (clip: Pick<ClipState, "waiting" | "questions">) → string
      <a id="tui.clip.badgeText"></a><br>The badge that stands for the clip in the status line of a narrow terminal.
      - calls [tui.clip.counterText](tui.md#tui.clip.counterText), [tui.clip.clipEyes](tui.md#tui.clip.clipEyes)
    - fn [clipArea](../../src/tui/clip.ts#L160) (state: Pick<State, "cols" | "rows">) → Rect <!-- internal -->
      <a id="tui.clip.clipArea"></a><br>The cells the clip may stand on: the terminal without the title row and the status line.
    - fn [chatArea](../../src/tui/clip.ts#L165) (state: Pick<State, "cols" | "rows">) → Rect <!-- internal -->
      <a id="tui.clip.chatArea"></a><br>The cells the window may take: below the title row, above the detail line, whose messages stay readable.
    - fn [inside](../../src/tui/clip.ts#L170) (rect: Rect, area: Rect) → Rect <!-- internal -->
      <a id="tui.clip.inside"></a><br>`rect` moved as little as it takes to lie inside `area` (where it is wider, from the area's start).
    - fn [contains](../../src/tui/clip.ts#L179) (rect: Rect, cell: Cell) → boolean <!-- internal -->
      <a id="tui.clip.contains"></a><br>Whether `cell` lies in `rect`.
    - fn [overlaps](../../src/tui/clip.ts#L184) (a: Rect, b: Rect) → boolean <!-- internal -->
      <a id="tui.clip.overlaps"></a><br>Whether two rectangles share a cell.
    - fn [clamp](../../src/tui/clip.ts#L188) (value: number, low: number, high: number) → number <!-- internal -->
      <a id="tui.clip.clamp"></a>
    - fn [clipPlace](../../src/tui/clip.ts#L197) (state: Pick<State, "cols" | "rows" | "clip">, editor: Rect) → Rect <!-- internal -->
      <a id="tui.clip.clipPlace"></a><br>Where the clip stands, whether it is drawn or not: where it was dragged, else the editor's bottom-right corner one cell in; always inside the terminal, so a smaller terminal moves it in.
      - calls [tui.clip.inside](tui.md#tui.clip.inside), [tui.clip.clipArea](tui.md#tui.clip.clipArea)
    - fn [clipRect](../../src/tui/clip.ts#L204) (state: Pick<State, "cols" | "rows" | "clip">, editor: Rect) → Rect | null
      <a id="tui.clip.clipRect"></a><br>The clip in the editor's corner; null when it is off or the terminal is narrow (a badge stands for it).
      - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.clipPlace](tui.md#tui.clip.clipPlace)
    - fn [badgeRect](../../src/tui/clip.ts#L209) (state: Pick<State, "cols" | "rows" | "clip">) → Rect | null
      <a id="tui.clip.badgeRect"></a><br>The badge at the start of the status line of a narrow terminal; null when the clip is in its corner or off.
      - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.clip.badgeText](tui.md#tui.clip.badgeText)
    - fn [clipYields](../../src/tui/clip.ts#L219) (clip: Rect, cursor: Cell | null, popups: readonly Rect[]) → boolean
      <a id="tui.clip.clipYields"></a><br>The clip does not cover what the person works on: a frame with the editor's cursor under it, or a popup over it (the hover), draws no clip.
      - calls [tui.clip.contains](tui.md#tui.clip.contains), [tui.clip.overlaps](tui.md#tui.clip.overlaps)
    - fn [chatRect](../../src/tui/clip.ts#L229) (state: Pick<State, "cols" | "rows" | "clip">, editor: Rect) → Rect
      <a id="tui.clip.chatRect"></a><br>The chat window: where it was moved, else above the clip, its right edge at the clip's (below it when there is no room above); inside the terminal, above the detail line, and no bigger than that. On a narrow terminal it takes the whole width above the detail line.
      - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.chatArea](tui.md#tui.clip.chatArea), [tui.clip.inside](tui.md#tui.clip.inside), [tui.clip.clipPlace](tui.md#tui.clip.clipPlace)
    - type [ChatPart](../../src/tui/clip.ts#L250) = "close" | "move" | "resize" | "window" <!-- internal -->
      <a id="tui.clip.ChatPart"></a><br>What a cell of the window is to the pointer: `✕` folds it, the top edge moves it, the bottom-right corner resizes it, the rest focuses it.
    - fn [chatPart](../../src/tui/clip.ts#L253) (rect: Rect, cell: Cell) → ChatPart | null <!-- internal -->
      <a id="tui.clip.chatPart"></a><br>The part of the window under `cell`, or null outside it.
      - calls [tui.clip.contains](tui.md#tui.clip.contains)
    - type [ChatLayout](../../src/tui/clip.ts#L264) = { history: Rect; input: Rect } <!-- internal -->
      <a id="tui.clip.ChatLayout"></a><br>Where the history and the input line lie in a window.
    - fn [chatLayout](../../src/tui/clip.ts#L267) (rect: Rect) → ChatLayout
      <a id="tui.clip.chatLayout"></a><br>The rows of a window: the history over the input line, one cell in from the frame.
    - type [HistoryRow](../../src/tui/clip.ts#L277)
      <a id="tui.clip.HistoryRow"></a><br>A row of the history: a message's, or the thinking row while the model's reply is awaited.
    - fn [historyRows](../../src/tui/clip.ts#L287) (messages: readonly ChatMessage[], width: number, waiting = false) → HistoryRow[]
      <a id="tui.clip.historyRows"></a><br>The conversation as rows of `width` cells: each message after its speaker, its lines wrapped by the shared wrap and indented under its text; while `waiting`, the thinking row last.
      - calls [tui.clip.messageRows](tui.md#tui.clip.messageRows), [tui.clip.speakerRows](tui.md#tui.clip.speakerRows)
    - fn [messageRows](../../src/tui/clip.ts#L299) (message: ChatMessage, width: number) → readonly HistoryRow[] <!-- internal -->
      <a id="tui.clip.messageRows"></a><br>One message's rows; a message never changes once it is in the history.
      - calls [tui.clip.speakerRows](tui.md#tui.clip.speakerRows)
    - fn [speakerRows](../../src/tui/clip.ts#L310) (role: HistoryRow["role"], speaker: string, text: string, width: number) → HistoryRow[] <!-- internal -->
      <a id="tui.clip.speakerRows"></a><br>`text` wrapped into rows of `width` cells: `speaker` before the first row, indentation before the rest.
      - calls [tui.width.wrapCells](tui.md#tui.width.wrapCells)
    - fn [shownHistory](../../src/tui/clip.ts#L327) (rows: readonly T[], height: number, scroll: number) → T[]
      <a id="tui.clip.shownHistory"></a><br>The rows `height` rows of the history show, `scroll` rows back from its end; a short history starts at the top.
      - calls [tui.clip.clamp](tui.md#tui.clip.clamp)
    - fn [inputTail](../../src/tui/clip.ts#L335) (input: string, room: number) → string
      <a id="tui.clip.inputTail"></a><br>The end of the input line that fits `room` cells: a longer line scrolls, and `…` marks what it hides on the left.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.sliceCells](tui.md#tui.width.sliceCells)
    - fn [moved](../../src/tui/clip.ts#L342) (rect: Rect, dx: number, dy: number, area: Rect) → Cell <!-- internal -->
      <a id="tui.clip.moved"></a><br>`rect` shifted by the offset, then kept inside `area`: a drag and Alt+arrows move the window the same way.
      - calls [tui.clip.inside](tui.md#tui.clip.inside)
    - fn [resized](../../src/tui/clip.ts#L349) (rect: Rect, dx: number, dy: number, area: Rect) → ChatState["size"] <!-- internal -->
      <a id="tui.clip.resized"></a><br>`rect` grown by the offset from its top-left: at least 30×7, at most to the area's right and bottom edges.
      - calls [tui.clip.clamp](tui.md#tui.clip.clamp)
    - type [ClipHost](../../src/tui/clip.ts#L358)
      <a id="tui.clip.ClipHost"></a><br>What the session gives the clip: its state and where the editor and the drawn clip are now.
    - type [Target](../../src/tui/clip.ts#L375) = "clip" | "badge" | ChatPart <!-- internal -->
      <a id="tui.clip.Target"></a><br>What a press was on.
    - type [Press](../../src/tui/clip.ts#L378) <!-- internal -->
      <a id="tui.clip.Press"></a><br>A press of the left button on the clip, its badge or its window, until the release.
    - module [Clip](../../src/tui/clip.ts#L403)
      <a id="tui.clip.Clip"></a><br>The clip's pointer and keys: a click on it opens the chat, a drag moves it; the window moves by its top edge, resizes by its bottom-right corner, folds on `✕`, and while it has the focus its input line and history take the keys. Every pointer action has a key: F7, Alt+arrows…
      - fn [constructor](../../src/tui/clip.ts#L407) (host: ClipHost)
        <a id="tui.clip.Clip.constructor"></a>
      - fn [state](../../src/tui/clip.ts#L411) () → State <!-- internal -->
        <a id="tui.clip.Clip.state"></a>
      - fn [toggle](../../src/tui/clip.ts#L420) () → void
        <a id="tui.clip.Clip.toggle"></a><br>F7: a folded window opens with the focus, an open one gets the focus, a focused one folds. MERGE takes no clicks and so no F7: it would leave the decisions.
        - calls [tui.clip.Clip.fold](tui.md#tui.clip.Clip.fold), [tui.clip.Clip.open](tui.md#tui.clip.Clip.open)
      - fn [open](../../src/tui/clip.ts#L434) () → void
        <a id="tui.clip.Clip.open"></a><br>A click on the clip or its badge: the chat opens with the focus, and the clip lists the open questions.
        - calls [tui.clip.Clip.focus](tui.md#tui.clip.Clip.focus)
      - fn [focus](../../src/tui/clip.ts#L441) () → void <!-- internal -->
        <a id="tui.clip.Clip.focus"></a><br>The window takes the keys: the editor's completion, which waits for them, goes.
      - fn [fold](../../src/tui/clip.ts#L447) () → void
        <a id="tui.clip.Clip.fold"></a><br>Esc, `✕`, or F7 on the focused window: it folds; the conversation stays, and so does a reply awaited.
      - fn [send](../../src/tui/clip.ts#L459) () → void
        <a id="tui.clip.Clip.send"></a><br>Enter: the input line goes into the history as the person's message, the history shows its end, and the chat answers it. An empty line sends nothing; while the model's reply is awaited nothing is sent and the line stays: one request at a time.
      - fn [reset](../../src/tui/clip.ts#L478) () → void
        <a id="tui.clip.Clip.reset"></a><br>The palette's «Скрепка: повернути на місце»: the clip in its corner, the window above it at its default size.
      - fn [key](../../src/tui/clip.ts#L488) (event: KeyEvent) → void
        <a id="tui.clip.Clip.key"></a><br>A key while the window has the focus (`chatTakesKeys`): its input line, its history and its place.
        - calls [tui.clip.Clip.nudge](tui.md#tui.clip.Clip.nudge), [tui.clip.Clip.fold](tui.md#tui.clip.Clip.fold), [tui.clip.Clip.send](tui.md#tui.clip.Clip.send), [tui.clip.Clip.scrollBy](tui.md#tui.clip.Clip.scrollBy), [tui.clip.Clip.page](tui.md#tui.clip.Clip.page), [tui.prompt-keys.backspaced](tui.md#tui.prompt-keys.backspaced)
      - fn [paste](../../src/tui/clip.ts#L516) (text: string) → void
        <a id="tui.clip.Clip.paste"></a><br>Text pasted while the window has the focus: one line, its breaks and tabs as spaces.
      - fn [mouse](../../src/tui/clip.ts#L528) (event: MouseEvent) → boolean
        <a id="tui.clip.Clip.mouse"></a><br>A pointer event: true when it was the clip's, its badge's or its window's (they are over the editor and the panels); false leaves it to the session. A click is a press and a release in the same cell; a drag moves the clip or the window or resizes the window.
        - calls [tui.clip.Clip.state](tui.md#tui.clip.Clip.state), [tui.clip.assistantShown](tui.md#tui.clip.assistantShown), [tui.clip.Clip.dragTo](tui.md#tui.clip.Clip.dragTo), [tui.clip.Clip.click](tui.md#tui.clip.Clip.click), [tui.clip.Clip.places](tui.md#tui.clip.Clip.places), [tui.clip.Clip.targetAt](tui.md#tui.clip.Clip.targetAt), [tui.clip.Clip.scrollBy](tui.md#tui.clip.Clip.scrollBy), [tui.clip.Clip.rectOf](tui.md#tui.clip.Clip.rectOf)
      - fn [targetAt](../../src/tui/clip.ts#L592) (cell: Cell) → Target | null <!-- internal -->
        <a id="tui.clip.Clip.targetAt"></a><br>What is under a cell: the window is over the clip, the clip over the editor.
        - calls [tui.clip.chatPart](tui.md#tui.clip.chatPart), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.clip.contains](tui.md#tui.clip.contains), [tui.clip.badgeRect](tui.md#tui.clip.badgeRect)
      - fn [rectOf](../../src/tui/clip.ts#L608) (target: Target) → Rect <!-- internal -->
        <a id="tui.clip.Clip.rectOf"></a><br>The rectangle a press on `target` moves or resizes.
        - calls [tui.clip.Clip.state](tui.md#tui.clip.Clip.state), [tui.clip.clipPlace](tui.md#tui.clip.clipPlace), [tui.clip.badgeRect](tui.md#tui.clip.badgeRect), [tui.clip.chatRect](tui.md#tui.clip.chatRect)
      - fn [dragTo](../../src/tui/clip.ts#L617) (press: Press, cell: Cell) → void <!-- internal -->
        <a id="tui.clip.Clip.dragTo"></a><br>The pointer at `cell` with the button down: the clip or the window follows it, inside the terminal.
        - calls [tui.clip.moved](tui.md#tui.clip.moved), [tui.clip.clipArea](tui.md#tui.clip.clipArea), [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.chatArea](tui.md#tui.clip.chatArea), [tui.clip.resized](tui.md#tui.clip.resized)
      - fn [places](../../src/tui/clip.ts#L635) (target: Target) → boolean <!-- internal -->
        <a id="tui.clip.Clip.places"></a><br>A drag of this moves the clip or the window, or resizes the window; a narrow terminal's window neither moves nor resizes.
        - calls [tui.clip.Clip.state](tui.md#tui.clip.Clip.state), [tui.clip.narrow](tui.md#tui.clip.narrow)
      - fn [click](../../src/tui/clip.ts#L640) (target: Target) → void <!-- internal -->
        <a id="tui.clip.Clip.click"></a><br>A click: the clip or its badge opens the chat, `✕` folds it, anywhere else in the window focuses it.
        - calls [tui.clip.Clip.open](tui.md#tui.clip.Clip.open), [tui.clip.Clip.fold](tui.md#tui.clip.Clip.fold), [tui.clip.Clip.focus](tui.md#tui.clip.Clip.focus)
      - fn [nudge](../../src/tui/clip.ts#L648) (delta: Cell, resize: boolean) → void <!-- internal -->
        <a id="tui.clip.Clip.nudge"></a><br>Alt+arrows move the window a cell, Alt+Shift+arrows resize it: what a drag does.
        - calls [tui.clip.narrow](tui.md#tui.clip.narrow), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.clip.resized](tui.md#tui.clip.resized), [tui.clip.chatArea](tui.md#tui.clip.chatArea), [tui.clip.moved](tui.md#tui.clip.moved)
      - fn [page](../../src/tui/clip.ts#L668) () → number <!-- internal -->
        <a id="tui.clip.Clip.page"></a><br>Rows PgUp and PgDn scroll the history by: its height but one.
        - calls [tui.clip.chatLayout](tui.md#tui.clip.chatLayout), [tui.clip.Clip.state](tui.md#tui.clip.Clip.state), [tui.clip.chatRect](tui.md#tui.clip.chatRect)
      - fn [scrollBy](../../src/tui/clip.ts#L673) (rows: number) → void <!-- internal -->
        <a id="tui.clip.Clip.scrollBy"></a><br>The history `rows` rows back (negative: forward), between its start and its end.
        - calls [tui.clip.chatLayout](tui.md#tui.clip.chatLayout), [tui.clip.Clip.state](tui.md#tui.clip.Clip.state), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.clip.historyRows](tui.md#tui.clip.historyRows), [tui.clip.clamp](tui.md#tui.clip.clamp)
  - module [code-highlight](../../src/tui/code-highlight.ts#L1)
    <a id="tui.code-highlight"></a><br>Lexical highlight for the built-in code viewer: comments, strings, numbers, keywords. It is a reading aid only; facts come from the snapshot.
    - screen [tui.screen](tui.md#tui.screen)
    - theme [tui.theme](tui.md#tui.theme)
    - fn [highlightCode](../../src/tui/code-highlight.ts#L27) (lines: readonly string[]) → Run[][]
      <a id="tui.code-highlight.highlightCode"></a><br>Runs per line (0-based line index). Block comments and template strings spanning lines are followed across lines.
  - module [disk](../../src/tui/disk.ts#L1)
    <a id="tui.disk"></a><br>The files a session reads and writes: text with the line endings it came with, and writes that never land outside a boundary directory — not through a symbolic link either, including one whose target does not exist yet. Layer: TUI.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [Eol](../../src/tui/disk.ts#L13) = "\n" | "\r\n"
      <a id="tui.disk.Eol"></a><br>The line ending a buffer was read with and is saved with.
    - fn [readText](../../src/tui/disk.ts#L16) (abs: string) → string | null
      <a id="tui.disk.readText"></a><br>The file's UTF-8 text, or null when it cannot be read (missing, a directory, no access).
    - fn [lf](../../src/tui/disk.ts#L25) (text: string) → string
      <a id="tui.disk.lf"></a><br>The text with every CRLF turned into LF.
    - fn [splitEol](../../src/tui/disk.ts#L34) (raw: string) → { text: string; eol: Eol }
      <a id="tui.disk.splitEol"></a><br>A file's text with `\n` line ends, and the ending a save restores. Only a file that uses CRLF throughout is converted; mixed endings stay as they are, so a save does not touch lines nobody edited.
      - calls [tui.disk.lf](tui.md#tui.disk.lf)
    - fn [withEol](../../src/tui/disk.ts#L43) (text: string, eol: Eol) → string
      <a id="tui.disk.withEol"></a><br>The text with its `\n` line ends turned back into `eol` for a save.
    - fn [landingPath](../../src/tui/disk.ts#L52) (abs: string) → string
      <a id="tui.disk.landingPath"></a><br>Where a write to `abs` lands: every symbolic link on the way followed, the last one too when its target does not exist yet (a write would create that target). The CLI's write protocol (`safe-write.ts`) decides it the same way.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing)
    - type [WriteOptions](../../src/tui/disk.ts#L65)
      <a id="tui.disk.WriteOptions"></a><br>`link: "follow"` (a spec or source file): a symlinked file is written at its target, so the link stays. `link: "replace"` (a file of keylang's own, such as a proposal): a link there is replaced, never written through.
    - fn [destination](../../src/tui/disk.ts#L70) (abs: string, options: WriteOptions) → string <!-- internal -->
      <a id="tui.disk.destination"></a><br>The file a write to `abs` changes.
      - calls [tui.disk.landingPath](tui.md#tui.disk.landingPath)
    - fn [leavesBoundary](../../src/tui/disk.ts#L76) (boundary: string, abs: string, options: WriteOptions = {}) → string | null
      <a id="tui.disk.leavesBoundary"></a><br>Why a write to `abs` may not happen — it lands outside `boundary` — or null when it stays inside.
      - calls [map.analyze.within](map.md#map.analyze.within), [tui.disk.destination](tui.md#tui.disk.destination), [tui.disk.landingPath](tui.md#tui.disk.landingPath)
    - fn [writeInside](../../src/tui/disk.ts#L87) (boundary: string, abs: string, text: string, options: WriteOptions = {}) → void
      <a id="tui.disk.writeInside"></a><br>Writes `text` to `abs` through a temporary file and a rename, so a crash never leaves half a file; a missing directory is created. A write that would land outside `boundary` throws before anything is touched.
      - calls [tui.disk.leavesBoundary](tui.md#tui.disk.leavesBoundary), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [tui.disk.destination](tui.md#tui.disk.destination)
    - fn [removeInside](../../src/tui/disk.ts#L96) (boundary: string, abs: string, options: WriteOptions = {}) → void
      <a id="tui.disk.removeInside"></a><br>Removes the file a write to `abs` would change, when it is inside `boundary`; a missing file is no error.
      - calls [tui.disk.leavesBoundary](tui.md#tui.disk.leavesBoundary), [tui.disk.destination](tui.md#tui.disk.destination)
  - module [evidence](../../src/tui/evidence.ts#L1)
    <a id="tui.evidence"></a><br>What the gutter shows for one spec line, from the shared analysis: the separate evidence channels and one mark over them. The mark is `ok` only when every reported criterion on the line is `ok`; `ID ✓` with a missing trace is `unverified`, never a plain ✓. `planned` is its own…
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - type [Mark](../../src/tui/evidence.ts#L14)
      <a id="tui.evidence.Mark"></a><br>`question`: an open question of a flow (`- ? …`, c4-zoom/11), a mark of its own and no verdict.
    - type [LineEvidence](../../src/tui/evidence.ts#L20)
      <a id="tui.evidence.LineEvidence"></a><br>Everything reported on one spec line, and the one mark the gutter shows for it.
    - fn [worse](../../src/tui/evidence.ts#L37) (a: Mark | null, b: Mark | null) → Mark | null
      <a id="tui.evidence.worse"></a><br>The more severe of two marks; null means "nothing yet".
    - fn [linesOf](../../src/tui/evidence.ts#L46) (doc: Document, kind: "planned" | "question") → Set<number> <!-- internal -->
      <a id="tui.evidence.linesOf"></a><br>The lines (1-based) of the nodes of one kind, at any depth.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [pendingPlanned](../../src/tui/evidence.ts#L61) (analysis: Analysis) → Set<string> <!-- internal -->
      <a id="tui.evidence.pendingPlanned"></a><br>IDs declared `planned` that the snapshot does not have yet: evidence about them is missing by intention.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [allEvidence](../../src/tui/evidence.ts#L81) (analysis: Analysis) → Map<string, Map<number, LineEvidence>> <!-- internal -->
      <a id="tui.evidence.allEvidence"></a><br>Builds a cached per-file, per-line map merging diagnostics, criterion verdicts and planned/question doc lines, then assigns each line its worst mark via [`tui.evidence.worse`](tui.md#tui.evidence.worse), treating unverified verdicts in [`tui.evidence.pendingPlanned`](tui.md#tui.evidence.pendingPlanned) areas as planned. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [tui.evidence.pendingPlanned](tui.md#tui.evidence.pendingPlanned), [tui.evidence.linesOf](tui.md#tui.evidence.linesOf), [tui.evidence.worse](tui.md#tui.evidence.worse), [tui.evidence.groupMarks](tui.md#tui.evidence.groupMarks)
    - fn [groupMarks](../../src/tui/evidence.ts#L157) (analysis: Analysis, byPath: Map<string, Map<number, LineEvidence>>) → void <!-- internal -->
      <a id="tui.evidence.groupMarks"></a><br>A `parallel` group (ADR 0023) shows the worst mark of the lines under it, so the gutter reads the group at a glance.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [evidenceOf](../../src/tui/evidence.ts#L189) (analysis: Analysis, path: string) → Map<number, LineEvidence>
      <a id="tui.evidence.evidenceOf"></a><br>Evidence by 1-based line of one document. Lines with nothing reported are absent.
      - calls [tui.evidence.allEvidence](tui.md#tui.evidence.allEvidence)
    - type [EvidenceTotals](../../src/tui/evidence.ts#L196) = { fail: number; unverified: number; ok: number } <!-- internal -->
      <a id="tui.evidence.EvidenceTotals"></a>
    - fn [totals](../../src/tui/evidence.ts#L199) (analysis: Analysis) → EvidenceTotals
      <a id="tui.evidence.totals"></a><br>Totals for the status bar: failing, unverified and passing lines across all documents.
      - calls [tui.evidence.allEvidence](tui.md#tui.evidence.allEvidence)
  - module [findings](../../src/tui/findings.ts#L1)
    <a id="tui.findings"></a><br>The full findings list of the current editor analysis, for the F6 panel: the same conversion `keylang check --format json` uses (`checkResults`), so criteria, codes, order, deduplication, file/line/col and provenance match the CLI one-to-one. The gutter stays aggregated per…
    - analyze [map.analyze](map.md#map.analyze)
    - check-results [features.check-results](features.md#features.check-results)
    - type [FindingVerdict](../../src/tui/findings.ts#L14) = CheckResult["verdict"]
      <a id="tui.findings.FindingVerdict"></a><br>The verdict of one finding, as `check --format json` reports it.
    - type [VerdictFilter](../../src/tui/findings.ts#L20) = Record<FindingVerdict, boolean>
      <a id="tui.findings.VerdictFilter"></a><br>Which verdicts the findings list shows; the report itself never changes.
    - fn [findingsOf](../../src/tui/findings.ts#L40) (analysis: Analysis | null) → readonly CheckResult[]
      <a id="tui.findings.findingsOf"></a><br>The current analysis as the CLI reports it in `check --format json`.
      - calls [features.check-results.checkResults](features.md#features.check-results.checkResults)
    - fn [visibleFindings](../../src/tui/findings.ts#L53) (findings: readonly CheckResult[], filter: VerdictFilter) → CheckResult[]
      <a id="tui.findings.visibleFindings"></a><br>The findings the filter lets through, in report order.
    - fn [findingCounts](../../src/tui/findings.ts#L58) (findings: readonly CheckResult[]) → Record<FindingVerdict, number>
      <a id="tui.findings.findingCounts"></a><br>The full counts of the report, independent of the filter: findings, not gutter lines.
    - fn [findingRow](../../src/tui/findings.ts#L67) (result: CheckResult) → string
      <a id="tui.findings.findingRow"></a><br>The list row of one finding after its verdict glyph: code or criterion, position, message.
    - fn [sameResult](../../src/tui/findings.ts#L72) (a: CheckResult, b: CheckResult) → boolean
      <a id="tui.findings.sameResult"></a><br>Whether two findings are the same one of successive analyses: the selection follows it across a rerun.
    - fn [findingDetailText](../../src/tui/findings.ts#L77) (result: CheckResult) → string
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
      - type [Mode](../../src/tui/forms/draft.ts#L31) = "algo" | "hybrid" | "llm" <!-- internal -->
        <a id="tui.forms.draft.Mode"></a><br>How a draft is made: from the snapshot alone, snapshot plus model, or by the model.
      - type [Output](../../src/tui/forms/draft.ts#L34) = "proposal" | "preview" <!-- internal -->
        <a id="tui.forms.draft.Output"></a><br>Where a draft goes: a proposal file for MERGE, or a preview in F6 that writes nothing.
      - type [Problem](../../src/tui/forms/draft.ts#L37) <!-- internal -->
        <a id="tui.forms.draft.Problem"></a><br>Why a form cannot run now: the row to select and the reason.
      - fn [modeRow](../../src/tui/forms/draft.ts#L49) (mode: Mode) → FormRow <!-- internal -->
        <a id="tui.forms.draft.modeRow"></a><br>The mode row of a draft: algo, hybrid, llm.
        - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle)
      - fn [outputRow](../../src/tui/forms/draft.ts#L54) (output: Output) → FormRow <!-- internal -->
        <a id="tui.forms.draft.outputRow"></a><br>The output row: a proposal for MERGE, or a preview in F6.
        - calls [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput)
      - fn [otherOutput](../../src/tui/forms/draft.ts#L59) (output: Output) → Output <!-- internal -->
        <a id="tui.forms.draft.otherOutput"></a><br>The output ←→ switches to.
      - fn [runRow](../../src/tui/forms/draft.ts#L64) (output: Output, target: string, preview: string) → FormRow <!-- internal -->
        <a id="tui.forms.draft.runRow"></a><br>The run row of a draft into one target: the proposal it creates, or a preview.
      - fn [modeNote](../../src/tui/forms/draft.ts#L69) (mode: Mode, agent: string | null, problem: string | undefined, says: { algo: string; fallback?: string; model: (agent: string, mode: Mode) => string }) → string <!-- internal -->
        <a id="tui.forms.draft.modeNote"></a><br>The note of a mode row: what algo does, what the model does, and without one what hybrid falls back to or why llm cannot run.
      - fn [problemOn](../../src/tui/forms/draft.ts#L79) (problem: Problem | null, row: string) → string | null <!-- internal -->
        <a id="tui.forms.draft.problemOn"></a><br>The problem as the note of the selected row, when it is the row's own, the run row's or the output row's.
      - type [FlowDraftTarget](../../src/tui/forms/draft.ts#L84) = { name: string; target: string } <!-- internal -->
        <a id="tui.forms.draft.FlowDraftTarget"></a><br>The flow name and target file a flow draft would use.
      - fn [flowDraftTarget](../../src/tui/forms/draft.ts#L87) (specDir: string, form: { trigger: string; name: string; into: string }) → FlowDraftTarget
        <a id="tui.forms.draft.flowDraftTarget"></a><br>The name and target a flow draft would use: the typed ones, else the CLI's defaults. `specDir` is relative to the root, POSIX.
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [rulesDraftTarget](../../src/tui/forms/draft.ts#L97) (specDir: string, into: string) → string
        <a id="tui.forms.draft.rulesDraftTarget"></a><br>The target a rules draft would use: the typed one, else the CLI's default.
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [codePosition](../../src/tui/forms/draft.ts#L107) (snapshot: Analysis["snapshot"] | null, form: CodeDraftForm) → { name: string; triggers: string[] } | { error: string; field: "file" | "line" } | null <!-- internal -->
        <a id="tui.forms.draft.codePosition"></a><br>What the snapshot says of a code-to-spec position: the fns it names and the spec's name, or why it names none (the CLI's message); null without a snapshot or a file, and for a git change (git decides when the draft runs). Reads the snapshot only.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [features.draft.codeToSpecTriggers](features.md#features.draft.codeToSpecTriggers), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [codeDraftTarget](../../src/tui/forms/draft.ts#L125) (specDir: string, snapshot: Analysis["snapshot"] | null, form: CodeDraftForm) → string
        <a id="tui.forms.draft.codeDraftTarget"></a><br>The target a code-to-spec draft would use: the typed one, else the CLI's default — `changes` for a git change, the position's name for a file (`<name>` while it names no fn).
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.forms.draft.codePosition](tui.md#tui.forms.draft.codePosition)
      - fn [codeDraftFormOf](../../src/tui/forms/draft.ts#L137) (request: CodeToSpecRequest) → CodeDraftForm
        <a id="tui.forms.draft.codeDraftFormOf"></a><br>The form a code-to-spec request was made from, enough to name its default target.
      - fn [specCodePlace](../../src/tui/forms/draft.ts#L150) (analysis: Analysis | null, form: SpecCodeForm) → ReturnType<typeof plannedCodeTarget> | null
        <a id="tui.forms.draft.specCodePlace"></a><br>Where spec-to-code would put the code, or why it builds none: its own checks on the analysis; null without one or without an ID.
        - calls [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [base.config.toPosix](base.md#base.config.toPosix)
      - module [DraftForms](../../src/tui/forms/draft.ts#L160)
        <a id="tui.forms.draft.DraftForms"></a><br>The draft forms of a session, reaching it only through its `FormHost`.
        - fn [constructor](../../src/tui/forms/draft.ts#L163) (host: FormHost)
          <a id="tui.forms.draft.DraftForms.constructor"></a>
        - fn [state](../../src/tui/forms/draft.ts#L167) () → State <!-- internal -->
          <a id="tui.forms.draft.DraftForms.state"></a>
        - fn [keys](../../src/tui/forms/draft.ts#L172) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.draft.DraftForms.keys"></a><br>The keys of the draft forms.
          - calls [tui.prompt-keys.fieldOf](tui.md#tui.prompt-keys.fieldOf), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow), [tui.forms.draft.DraftForms.changeFlow](tui.md#tui.forms.draft.DraftForms.changeFlow), [tui.forms.draft.DraftForms.submitFlow](tui.md#tui.forms.draft.DraftForms.submitFlow), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules), [tui.forms.draft.DraftForms.changeRules](tui.md#tui.forms.draft.DraftForms.changeRules), [tui.forms.draft.DraftForms.submitRules](tui.md#tui.forms.draft.DraftForms.submitRules), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout), [tui.forms.draft.DraftForms.changeLayout](tui.md#tui.forms.draft.DraftForms.changeLayout), [tui.forms.draft.DraftForms.submitLayout](tui.md#tui.forms.draft.DraftForms.submitLayout), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode), [tui.forms.draft.DraftForms.changeCode](tui.md#tui.forms.draft.DraftForms.changeCode), [tui.forms.draft.DraftForms.submitCode](tui.md#tui.forms.draft.DraftForms.submitCode), [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode), [tui.forms.draft.DraftForms.changeSpecCode](tui.md#tui.forms.draft.DraftForms.changeSpecCode), [tui.forms.draft.DraftForms.submitSpecCode](tui.md#tui.forms.draft.DraftForms.submitSpecCode)
        - fn [firstMode](../../src/tui/forms/draft.ts#L234) () → Mode <!-- internal -->
          <a id="tui.forms.draft.DraftForms.firstMode"></a><br>The mode a draft starts in: the CLI's default (hybrid) with a model, else algo.
        - fn [targetProblem](../../src/tui/forms/draft.ts#L239) (target: string, field: string) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.targetProblem"></a><br>Why a draft may not propose into `target` now: the proposal rules, a proposal waiting there, unsaved edits of it.
          - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
        - fn [refuse](../../src/tui/forms/draft.ts#L255) (prompt: Prompt, problem: Problem, label: string, refresh: () => void) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refuse"></a><br>A form that may not run keeps its values: the row of the problem is selected, the reason is the message.
          - calls [tui.prompt-keys.selectProblem](tui.md#tui.prompt-keys.selectProblem)
        - fn [openFlow](../../src/tui/forms/draft.ts#L269) () → void
          <a id="tui.forms.draft.DraftForms.openFlow"></a><br>The draft-flow form (design §2.4): the fn under the cursor, else the trigger of the flow under the cursor, is the visible default; name and target stay empty for the CLI's defaults, shown next to them. The output is a proposal unless preview is chosen; the mode is the CLI's…
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow)
        - fn [triggerMatches](../../src/tui/forms/draft.ts#L279) (typed: string) → string[] <!-- internal -->
          <a id="tui.forms.draft.DraftForms.triggerMatches"></a><br>The callable IDs of the current snapshot that contain the typed trigger, at most eight.
          - calls [base.span.compareText](base.md#base.span.compareText)
        - fn [flowProblem](../../src/tui/forms/draft.ts#L294) (form: DraftForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.flowProblem"></a><br>Why a draft may not start now, or null: the checks the CLI makes first, then a pending proposal and an unsaved target (a proposal only).
          - calls [tui.forms.draft.DraftForms.targetProblem](tui.md#tui.forms.draft.DraftForms.targetProblem), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget)
        - fn [refreshFlow](../../src/tui/forms/draft.ts#L316) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshFlow"></a><br>The rows, the root, and a note on the selected row; nothing is read but the snapshot and the target's state.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.flowDraftTarget](tui.md#tui.forms.draft.flowDraftTarget), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.DraftForms.triggerMatches](tui.md#tui.forms.draft.DraftForms.triggerMatches), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.runRow](tui.md#tui.forms.draft.runRow), [tui.forms.draft.DraftForms.flowProblem](tui.md#tui.forms.draft.DraftForms.flowProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeFlow](../../src/tui/forms/draft.ts#L365) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeFlow"></a><br>←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview).
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow)
        - fn [submitFlow](../../src/tui/forms/draft.ts#L382) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitFlow"></a><br>Enter in the draft form. On a match it takes that trigger; elsewhere a problem keeps the form (the typed values stay) with the field selected, else the draft runs as the session's operation.
          - calls [tui.prompt-keys.selectRow](tui.md#tui.prompt-keys.selectRow), [tui.forms.draft.DraftForms.refreshFlow](tui.md#tui.forms.draft.DraftForms.refreshFlow), [tui.forms.draft.DraftForms.flowProblem](tui.md#tui.forms.draft.DraftForms.flowProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [base.config.toPosix](base.md#base.config.toPosix), [features.agent-context.contextText](features.md#features.agent-context.contextText)
        - fn [openRules](../../src/tui/forms/draft.ts#L424) () → void
          <a id="tui.forms.draft.DraftForms.openRules"></a><br>The draft-rules form (design §2.4 `draft rules`): the target (empty: the CLI's `<dir>/rules.md`, shown next to it), the mode (hybrid with a model, else algo) and preview or proposal.
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules)
        - fn [rulesProblem](../../src/tui/forms/draft.ts#L430) (form: RulesDraftForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.rulesProblem"></a><br>Why a rules draft may not start now, or null: a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target.
          - calls [tui.forms.draft.DraftForms.targetProblem](tui.md#tui.forms.draft.DraftForms.targetProblem), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget)
        - fn [refreshRules](../../src/tui/forms/draft.ts#L439) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshRules"></a><br>The rows, the root and what the model sees, and a note on the selected row.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.forms.draft.rulesDraftTarget](tui.md#tui.forms.draft.rulesDraftTarget), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.runRow](tui.md#tui.forms.draft.runRow), [tui.forms.draft.DraftForms.rulesProblem](tui.md#tui.forms.draft.DraftForms.rulesProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeRules](../../src/tui/forms/draft.ts#L473) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeRules"></a><br>←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview).
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules)
        - fn [submitRules](../../src/tui/forms/draft.ts#L486) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitRules"></a><br>Enter in the rules form: a problem keeps the form with the field selected, else the draft runs as the session's operation.
          - calls [tui.forms.draft.DraftForms.rulesProblem](tui.md#tui.forms.draft.DraftForms.rulesProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [tui.forms.draft.DraftForms.refreshRules](tui.md#tui.forms.draft.DraftForms.refreshRules), [base.config.toPosix](base.md#base.config.toPosix)
        - fn [openCode](../../src/tui/forms/draft.ts#L516) () → void
          <a id="tui.forms.draft.DraftForms.openCode"></a><br>The code-to-spec form (design §2.4 `code-to-spec`): the source is a file — the code viewer's file and line, else the file (and, for a fn, the line) of the ID under the cursor, else empty fields and a list of the source files — or the git changes since a ref (`HEAD`). An empty…
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode)
        - fn [sourceMatches](../../src/tui/forms/draft.ts#L537) (typed: string) → string[] <!-- internal -->
          <a id="tui.forms.draft.DraftForms.sourceMatches"></a><br>The source files of the current snapshot that declare a fn and contain the typed text, at most eight.
          - calls [base.span.compareText](base.md#base.span.compareText)
        - fn [codeProblem](../../src/tui/forms/draft.ts#L552) (form: CodeDraftForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.codeProblem"></a><br>Why the draft may not start now, or null: the source's fields, a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target.
          - calls [tui.forms.draft.codePosition](tui.md#tui.forms.draft.codePosition), [tui.forms.draft.DraftForms.targetProblem](tui.md#tui.forms.draft.DraftForms.targetProblem), [tui.forms.draft.codeDraftTarget](tui.md#tui.forms.draft.codeDraftTarget)
        - fn [refreshCode](../../src/tui/forms/draft.ts#L580) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshCode"></a><br>The rows, the root, and a note on the selected row: what the source names, the mode, the target's state or why it cannot run.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.codeDraftTarget](tui.md#tui.forms.draft.codeDraftTarget), [tui.forms.draft.DraftForms.sourceMatches](tui.md#tui.forms.draft.DraftForms.sourceMatches), [base.config.toPosix](base.md#base.config.toPosix), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.runRow](tui.md#tui.forms.draft.runRow), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.DraftForms.codeProblem](tui.md#tui.forms.draft.DraftForms.codeProblem), [tui.forms.draft.codePosition](tui.md#tui.forms.draft.codePosition), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeCode](../../src/tui/forms/draft.ts#L648) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeCode"></a><br>←→ on the source row (a file or the git changes), the mode row (algo, hybrid, llm) or the output row (proposal or preview).
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode)
        - fn [codeRequest](../../src/tui/forms/draft.ts#L663) (form: CodeDraftForm) → CodeToSpecRequest <!-- internal -->
          <a id="tui.forms.draft.DraftForms.codeRequest"></a><br>The request of the form: only the chosen source's fields; the model's context as F4 shows it now.
          - calls [base.config.toPosix](base.md#base.config.toPosix), [features.agent-context.contextText](features.md#features.agent-context.contextText)
        - fn [submitCode](../../src/tui/forms/draft.ts#L685) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitCode"></a><br>Enter in the code-to-spec form. On a match it takes that file and moves to the line; elsewhere a problem keeps the form (the typed values stay) with the field selected, else the draft runs as the session's operation.
          - calls [tui.prompt-keys.selectRow](tui.md#tui.prompt-keys.selectRow), [tui.forms.draft.DraftForms.refreshCode](tui.md#tui.forms.draft.DraftForms.refreshCode), [tui.forms.draft.DraftForms.codeProblem](tui.md#tui.forms.draft.DraftForms.codeProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [tui.forms.draft.DraftForms.codeRequest](tui.md#tui.forms.draft.DraftForms.codeRequest)
        - fn [openSpecCode](../../src/tui/forms/draft.ts#L717) (id?: string) → void
          <a id="tui.forms.draft.DraftForms.openSpecCode"></a><br>The spec-to-code form (design §2.4 `spec-to-code`): the planned fn — given (a feature's planned gap), else the one under the cursor, else typed or picked from the planned fns — the code file (empty: the module's, shown next to it), the mode (the offline template unless llm is…
          - calls [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode)
        - fn [plannedMatches](../../src/tui/forms/draft.ts#L732) (typed: string) → string[] <!-- internal -->
          <a id="tui.forms.draft.DraftForms.plannedMatches"></a><br>The planned fns containing the typed text, at most eight; none once it is one.
        - fn [specCodeProblem](../../src/tui/forms/draft.ts#L743) (form: SpecCodeForm) → Problem | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.specCodeProblem"></a><br>Why spec-to-code may not start now, or null: an ID, spec-to-code's own checks, a model llm needs, then (a proposal only) a proposal waiting for the code file.
          - calls [tui.forms.draft.specCodePlace](tui.md#tui.forms.draft.specCodePlace)
        - fn [refreshSpecCode](../../src/tui/forms/draft.ts#L761) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshSpecCode"></a><br>The rows, the root and what the template is, and a note on the selected row.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.forms.draft.specCodePlace](tui.md#tui.forms.draft.specCodePlace), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.DraftForms.plannedMatches](tui.md#tui.forms.draft.DraftForms.plannedMatches), [tui.forms.draft.outputRow](tui.md#tui.forms.draft.outputRow), [tui.forms.draft.DraftForms.specCodeProblem](tui.md#tui.forms.draft.DraftForms.specCodeProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote), [tui.forms.draft.problemOn](tui.md#tui.forms.draft.problemOn)
        - fn [changeSpecCode](../../src/tui/forms/draft.ts#L819) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeSpecCode"></a><br>←→ on the mode row (algo or llm) or the output row (proposal or preview).
          - calls [tui.forms.draft.otherOutput](tui.md#tui.forms.draft.otherOutput), [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode)
        - fn [submitSpecCode](../../src/tui/forms/draft.ts#L832) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitSpecCode"></a><br>Enter in the form: a match takes that ID; elsewhere a problem keeps the form with the field selected, else spec-to-code runs as the session's operation.
          - calls [tui.prompt-keys.selectRow](tui.md#tui.prompt-keys.selectRow), [tui.forms.draft.DraftForms.refreshSpecCode](tui.md#tui.forms.draft.DraftForms.refreshSpecCode), [tui.forms.draft.DraftForms.specCodeProblem](tui.md#tui.forms.draft.DraftForms.specCodeProblem), [tui.forms.draft.DraftForms.refuse](tui.md#tui.forms.draft.DraftForms.refuse), [base.config.toPosix](base.md#base.config.toPosix)
        - fn [openLayout](../../src/tui/forms/draft.ts#L862) () → void
          <a id="tui.forms.draft.DraftForms.openLayout"></a><br>The draft-layout form (design §2.4 `draft map`): the mode (hybrid with a model, else algo), then run; nothing is written.
          - calls [tui.forms.draft.DraftForms.firstMode](tui.md#tui.forms.draft.DraftForms.firstMode), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout)
        - fn [layoutProblem](../../src/tui/forms/draft.ts#L868) (mode: Mode) → string | null <!-- internal -->
          <a id="tui.forms.draft.DraftForms.layoutProblem"></a><br>Why a layout draft may not start: llm needs a model.
        - fn [refreshLayout](../../src/tui/forms/draft.ts#L873) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.refreshLayout"></a><br>The layout form's rows, details and note; reading only.
          - calls [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.draft.modeRow](tui.md#tui.forms.draft.modeRow), [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.forms.draft.DraftForms.layoutProblem](tui.md#tui.forms.draft.DraftForms.layoutProblem), [tui.forms.draft.modeNote](tui.md#tui.forms.draft.modeNote)
        - fn [changeLayout](../../src/tui/forms/draft.ts#L895) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.changeLayout"></a><br>←→ on the mode row only.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.draft.DraftForms.refreshLayout](tui.md#tui.forms.draft.DraftForms.refreshLayout)
        - fn [submitLayout](../../src/tui/forms/draft.ts#L904) () → void <!-- internal -->
          <a id="tui.forms.draft.DraftForms.submitLayout"></a><br>Enter: a missing model keeps the form; else the layout draft runs and its result shows in F6.
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
      - module [ExplainForms](../../src/tui/forms/explain.ts#L35)
        <a id="tui.forms.explain.ExplainForms"></a><br>The explain forms of a session, reaching it only through its `FormHost`.
        - fn [constructor](../../src/tui/forms/explain.ts#L40) (host: FormHost)
          <a id="tui.forms.explain.ExplainForms.constructor"></a>
        - fn [state](../../src/tui/forms/explain.ts#L44) () → State <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.state"></a>
        - fn [keys](../../src/tui/forms/explain.ts#L49) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.explain.ExplainForms.keys"></a><br>The keys of the explain forms.
          - calls [tui.prompt-keys.promptText](tui.md#tui.prompt-keys.promptText), [tui.prompt-keys.fieldOf](tui.md#tui.prompt-keys.fieldOf), [tui.forms.explain.ExplainForms.refresh](tui.md#tui.forms.explain.ExplainForms.refresh), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note), [tui.forms.explain.ExplainForms.changePlanList](tui.md#tui.forms.explain.ExplainForms.changePlanList), [tui.forms.explain.ExplainForms.changeDetail](tui.md#tui.forms.explain.ExplainForms.changeDetail), [tui.forms.explain.ExplainForms.submit](tui.md#tui.forms.explain.ExplainForms.submit)
        - fn [open](../../src/tui/forms/explain.ts#L73) () → void
          <a id="tui.forms.explain.ExplainForms.open"></a><br>The explain form: the ID under the cursor, else the code of the line's diagnostic, is the visible default.
          - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.forms.explain.ExplainForms.refresh](tui.md#tui.forms.explain.ExplainForms.refresh)
        - fn [refresh](../../src/tui/forms/explain.ts#L88) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.refresh"></a><br>The codes or the IDs of the session's snapshot matching the typed text (the exact one first).
          - calls [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [base.span.compareText](base.md#base.span.compareText), [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note)
        - fn [subject](../../src/tui/forms/explain.ts#L113) () → string <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.subject"></a><br>The subject Enter explains: the selected entry of the list, else the typed text.
        - fn [note](../../src/tui/forms/explain.ts#L120) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.note"></a><br>The note under the form: what Enter would do with the current subject.
          - calls [tui.forms.explain.ExplainForms.modelNote](tui.md#tui.forms.explain.ExplainForms.modelNote), [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [tui.forms.explain.ExplainForms.subject](tui.md#tui.forms.explain.ExplainForms.subject), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation)
        - fn [submit](../../src/tui/forms/explain.ts#L149) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.submit"></a><br>Enter in the explain form: the subject runs as the session's operation; an empty one keeps the form.
          - calls [tui.forms.explain.ExplainForms.submitPlan](tui.md#tui.forms.explain.ExplainForms.submitPlan), [tui.forms.explain.ExplainForms.subject](tui.md#tui.forms.explain.ExplainForms.subject), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode)
        - fn [loadModel](../../src/tui/forms/explain.ts#L180) (stillOpen: () => boolean, again: () => void) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.loadModel"></a><br>Loads the model client off the key path, then shows the form's note again with what it says.
        - fn [openModel](../../src/tui/forms/explain.ts#L199) () → void
          <a id="tui.forms.explain.ExplainForms.openModel"></a><br>The model's explanation form: the ID under the cursor and the detail of keylang.json by default.
          - calls [tui.forms.explain.ExplainForms.refresh](tui.md#tui.forms.explain.ExplainForms.refresh), [tui.forms.explain.ExplainForms.loadModel](tui.md#tui.forms.explain.ExplainForms.loadModel), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note)
        - fn [changeDetail](../../src/tui/forms/explain.ts#L211) (step: number) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.changeDetail"></a><br>←→ in the model's form: short, full, brief.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.explain.ExplainForms.note](tui.md#tui.forms.explain.ExplainForms.note)
        - fn [modelNote](../../src/tui/forms/explain.ts#L224) (detail: ExplanationDetail) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.modelNote"></a><br>What Enter would do, by the session's analysis: read a fresh saved answer (no request), ask the model once and save, or — no model — show the summary and the saved answer; with the detail, the language and the agent.
          - calls [tui.forms.explain.ExplainForms.subject](tui.md#tui.forms.explain.ExplainForms.subject), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswerMiss](features.md#features.explain-offline.savedAnswerMiss), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
        - fn [openPlan](../../src/tui/forms/explain.ts#L281) (row: "list" | "batch" = "list") → void
          <a id="tui.forms.explain.ExplainForms.openPlan"></a><br>The inventory form: the stale saved explanations by default; limit and jobs empty (every candidate, 4).
          - calls [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [tui.forms.explain.ExplainForms.loadModel](tui.md#tui.forms.explain.ExplainForms.loadModel)
        - fn [planRequest](../../src/tui/forms/explain.ts#L294) (form: ExplainPlanForm) → ExplainPlanRequest | { field: "limit" | "jobs"; text: string } <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.planRequest"></a><br>The request the form makes, or the field it refuses with the CLI's message.
          - calls [features.explain-inventory.positiveIntegerProblem](features.md#features.explain-inventory.positiveIntegerProblem)
        - fn [refreshPlan](../../src/tui/forms/explain.ts#L318) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.refreshPlan"></a><br>The rows (the list; limit and jobs for a brief plan; run), what the selected list is and is not, and a note on the selected row.
          - calls [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [tui.prompt-keys.showRows](tui.md#tui.prompt-keys.showRows), [tui.forms.explain.ExplainForms.planRequest](tui.md#tui.forms.explain.ExplainForms.planRequest), [tui.forms.explain.ExplainForms.batchRequest](tui.md#tui.forms.explain.ExplainForms.batchRequest), [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.forms.explain.ExplainForms.batchAsk](tui.md#tui.forms.explain.ExplainForms.batchAsk), [map.explanations.explainDir](map.md#map.explanations.explainDir)
        - fn [changePlanList](../../src/tui/forms/explain.ts#L366) (delta: -1 | 1) → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.changePlanList"></a><br>←→ on the list row.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan)
        - fn [submitPlan](../../src/tui/forms/explain.ts#L376) () → void <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.submitPlan"></a><br>Enter: a refused limit or jobs keeps the form with the field selected, else the inventory runs as the session's operation.
          - calls [tui.forms.explain.ExplainForms.planRequest](tui.md#tui.forms.explain.ExplainForms.planRequest), [tui.prompt-keys.selectProblem](tui.md#tui.prompt-keys.selectProblem), [tui.forms.explain.ExplainForms.refreshPlan](tui.md#tui.forms.explain.ExplainForms.refreshPlan), [tui.forms.explain.ExplainForms.batchRequest](tui.md#tui.forms.explain.ExplainForms.batchRequest)
        - fn [batchRequest](../../src/tui/forms/explain.ts#L398) (plan: ExplainPlanRequest) → ExplainBatchRequest <!-- internal -->
          <a id="tui.forms.explain.ExplainForms.batchRequest"></a><br>The batch of a brief plan's form: the same list, limit and jobs, no estimate.
          - calls [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs)
        - fn [batchAsk](../../src/tui/forms/explain.ts#L412) () → string <!-- internal -->
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
      - fn [defaultExportPath](../../src/tui/forms/export.ts#L28) (kind: OperationRecord["kind"], format: ExportFormat) → string <!-- internal -->
        <a id="tui.forms.export.defaultExportPath"></a><br>Where an export goes unless a path is typed: `.keylang/export/check.json`, `.keylang/export/edge.txt`, `.keylang/export/parse.txt`, `.keylang/export/trace-plan.json`.
      - fn [exportSourceOf](../../src/tui/forms/export.ts#L37) (record: OperationRecord, format: ExportFormat) → ExportSource | null <!-- internal -->
        <a id="tui.forms.export.exportSourceOf"></a><br>The typed report of a finished record in a format, or null when it has none.
        - calls [features.check-format.isCheckFormat](features.md#features.check-format.isCheckFormat)
      - module [ExportForms](../../src/tui/forms/export.ts#L60)
        <a id="tui.forms.export.ExportForms"></a><br>The two export forms of a session, reaching it only through its `FormHost`.
        - fn [constructor](../../src/tui/forms/export.ts#L63) (host: FormHost)
          <a id="tui.forms.export.ExportForms.constructor"></a>
        - fn [state](../../src/tui/forms/export.ts#L67) () → State <!-- internal -->
          <a id="tui.forms.export.ExportForms.state"></a>
        - fn [keys](../../src/tui/forms/export.ts#L72) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.export.ExportForms.keys"></a><br>The keys of the export forms.
          - calls [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt), [tui.forms.export.ExportForms.changeExportFormat](tui.md#tui.forms.export.ExportForms.changeExportFormat), [tui.forms.export.ExportForms.submitExport](tui.md#tui.forms.export.ExportForms.submitExport), [tui.forms.export.ExportForms.refreshC4Prompt](tui.md#tui.forms.export.ExportForms.refreshC4Prompt), [tui.forms.export.ExportForms.changeC4Choice](tui.md#tui.forms.export.ExportForms.changeC4Choice), [tui.forms.export.ExportForms.submitC4](tui.md#tui.forms.export.ExportForms.submitC4)
        - fn [openExportPrompt](../../src/tui/forms/export.ts#L99) () → void
          <a id="tui.forms.export.ExportForms.openExportPrompt"></a><br>The export form of the report `exportRecord` picks (design §2.6): the format, the path (a default per format under `.keylang/export/`) and the target as it is now. Nothing is written before Save; Esc writes nothing.
          - calls [tui.forms.export.ExportForms.state](tui.md#tui.forms.export.ExportForms.state), [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.forms.export.defaultExportPath](tui.md#tui.forms.export.defaultExportPath), [tui.forms.export.ExportForms.exportBytes](tui.md#tui.forms.export.ExportForms.exportBytes), [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt)
        - fn [exportBytes](../../src/tui/forms/export.ts#L133) (record: OperationRecord, format: ExportFormat) → number <!-- internal -->
          <a id="tui.forms.export.ExportForms.exportBytes"></a><br>The bytes of the report in a format: exactly what the CLI prints, from the record's payload.
          - calls [tui.forms.export.exportSourceOf](tui.md#tui.forms.export.exportSourceOf), [operations.export.exportText](operations.md#operations.export.exportText)
        - fn [exportProblem](../../src/tui/forms/export.ts#L140) (path: string) → string | null <!-- internal -->
          <a id="tui.forms.export.ExportForms.exportProblem"></a><br>Why the typed target cannot receive the export now, or null. A dirty buffer of it is never written under.
          - calls [operations.export.exportTargetProblem](operations.md#operations.export.exportTargetProblem), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
        - fn [refreshExportPrompt](../../src/tui/forms/export.ts#L159) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.refreshExportPrompt"></a><br>The rows of the form: the report (and whether it is outdated), the target as it is now, and what Save writes. Reading only.
          - calls [tui.forms.export.ExportForms.exportProblem](tui.md#tui.forms.export.ExportForms.exportProblem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.reports.records.recordSummary](tui.md#tui.reports.records.recordSummary)
        - fn [changeExportFormat](../../src/tui/forms/export.ts#L200) (delta: 1 | -1) → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.changeExportFormat"></a><br>←→ in the export form: the next format; an untouched default path follows it.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.export.defaultExportPath](tui.md#tui.forms.export.defaultExportPath), [tui.forms.export.ExportForms.exportBytes](tui.md#tui.forms.export.ExportForms.exportBytes), [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt)
        - fn [submitExport](../../src/tui/forms/export.ts#L219) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.submitExport"></a><br>Enter in the export form, on any row: the report as it ran goes to the shown target through the file protocol. A refusal keeps the form; the target is expected as the form last showed it.
          - calls [tui.forms.export.exportSourceOf](tui.md#tui.forms.export.exportSourceOf), [tui.forms.export.ExportForms.exportProblem](tui.md#tui.forms.export.ExportForms.exportProblem), [tui.forms.export.ExportForms.refreshExportPrompt](tui.md#tui.forms.export.ExportForms.refreshExportPrompt)
        - fn [openC4Prompt](../../src/tui/forms/export.ts#L258) () → void
          <a id="tui.forms.export.ExportForms.openC4Prompt"></a><br>The C4 form (c4-zoom/12): the format, the level, one layer or all, and the file to write. Without a file the diagram shows in F6 and nothing is written.
          - calls [tui.forms.export.ExportForms.refreshC4Prompt](tui.md#tui.forms.export.ExportForms.refreshC4Prompt)
        - fn [c4Request](../../src/tui/forms/export.ts#L265) (form: C4Form, out: string) → ExportC4Request <!-- internal -->
          <a id="tui.forms.export.ExportForms.c4Request"></a><br>The request the form would run: the CLI's flags, a layer only at the component level.
          - calls [base.config.toPosix](base.md#base.config.toPosix)
        - fn [refreshC4Prompt](../../src/tui/forms/export.ts#L277) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.refreshC4Prompt"></a><br>The rows of the form, and what Enter would do with the file as it is now. Reading only.
          - calls [tui.reports.records.operationLabel](tui.md#tui.reports.records.operationLabel), [tui.forms.export.ExportForms.c4Request](tui.md#tui.forms.export.ExportForms.c4Request), [operations.export.c4OutProblem](operations.md#operations.export.c4OutProblem), [base.config.toPosix](base.md#base.config.toPosix), [tui.disk.readText](tui.md#tui.disk.readText), [map.c4-export.isC4Diagram](map.md#map.c4-export.isC4Diagram)
        - fn [changeC4Choice](../../src/tui/forms/export.ts#L318) (delta: 1 | -1) → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.changeC4Choice"></a><br>←→ on the format, the level or the layer row: the next choice.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.export.ExportForms.refreshC4Prompt](tui.md#tui.forms.export.ExportForms.refreshC4Prompt)
        - fn [submitC4](../../src/tui/forms/export.ts#L334) () → void <!-- internal -->
          <a id="tui.forms.export.ExportForms.submitC4"></a><br>Enter on any row: the export as the form shows it; the operation checks the file again before it writes.
          - calls [tui.forms.export.ExportForms.c4Request](tui.md#tui.forms.export.ExportForms.c4Request)
    - module [host](../../src/tui/forms/host.ts#L1)
      <a id="tui.forms.host"></a><br>What the forms of operations need from the session: its state, where the cursor is, the configuration and model it runs with, and the way to start an operation. The forms reach the session only through this, so their module depends on no editor, panel or transport.
      - agent-context [features.agent-context](features.md#features.agent-context)
      - operations [operations.operations](operations.md#operations.operations)
      - state [tui.state](tui.md#tui.state)
      - type [FormHost](../../src/tui/forms/host.ts#L15)
        <a id="tui.forms.host.FormHost"></a><br>The session as the operation forms see it: read-only queries about the open buffer and cursor, plus the two ways to start an operation.
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
      - type [Refusal](../../src/tui/forms/run.ts#L33) = { error: string } <!-- internal -->
        <a id="tui.forms.run.Refusal"></a><br>Why a typed selection or path is not one, in the CLI's words.
      - fn [isRefusal](../../src/tui/forms/run.ts#L36) (value: T | Refusal) → value is Refusal <!-- internal -->
        <a id="tui.forms.run.isRefusal"></a><br>Whether a parsed value is a refusal rather than the value itself.
      - type [AgentsPreview](../../src/tui/forms/run.ts#L41) = { changed: string[]; note: string } <!-- internal -->
        <a id="tui.forms.run.AgentsPreview"></a><br>What an agents selection would write now, and the form's note about it.
      - module [RunForms](../../src/tui/forms/run.ts#L44)
        <a id="tui.forms.run.RunForms"></a><br>The run forms of a session, reaching it only through its `FormHost`.
        - fn [constructor](../../src/tui/forms/run.ts#L47) (host: FormHost)
          <a id="tui.forms.run.RunForms.constructor"></a>
        - fn [state](../../src/tui/forms/run.ts#L51) () → State <!-- internal -->
          <a id="tui.forms.run.RunForms.state"></a>
        - fn [keys](../../src/tui/forms/run.ts#L57) (prompt: Prompt) → PromptKeys | null
          <a id="tui.forms.run.RunForms.keys"></a><br>The keys of these forms.
          - calls [tui.forms.run.RunForms.refreshFeaturePrompt](tui.md#tui.forms.run.RunForms.refreshFeaturePrompt), [tui.forms.run.RunForms.featureNote](tui.md#tui.forms.run.RunForms.featureNote), [tui.forms.run.RunForms.submitFeature](tui.md#tui.forms.run.RunForms.submitFeature), [tui.prompt-keys.noteOfSelection](tui.md#tui.prompt-keys.noteOfSelection), [tui.forms.run.RunForms.submitBaseline](tui.md#tui.forms.run.RunForms.submitBaseline), [tui.forms.run.RunForms.refreshAgentsPrompt](tui.md#tui.forms.run.RunForms.refreshAgentsPrompt), [tui.forms.run.RunForms.submitAgents](tui.md#tui.forms.run.RunForms.submitAgents), [tui.forms.run.RunForms.refreshInitPrompt](tui.md#tui.forms.run.RunForms.refreshInitPrompt), [tui.forms.run.RunForms.submitInit](tui.md#tui.forms.run.RunForms.submitInit), [tui.forms.run.RunForms.refreshFmtPrompt](tui.md#tui.forms.run.RunForms.refreshFmtPrompt), [tui.forms.run.RunForms.submitFmt](tui.md#tui.forms.run.RunForms.submitFmt), [tui.forms.run.RunForms.refreshParsePrompt](tui.md#tui.forms.run.RunForms.refreshParsePrompt), [tui.forms.run.RunForms.submitParse](tui.md#tui.forms.run.RunForms.submitParse), [tui.forms.run.RunForms.refreshWirePrompt](tui.md#tui.forms.run.RunForms.refreshWirePrompt), [tui.forms.run.RunForms.submitWire](tui.md#tui.forms.run.RunForms.submitWire), [tui.forms.run.RunForms.refreshTracePlanPrompt](tui.md#tui.forms.run.RunForms.refreshTracePlanPrompt), [tui.forms.run.RunForms.tracePlanNote](tui.md#tui.forms.run.RunForms.tracePlanNote), [tui.forms.run.RunForms.submitTracePlan](tui.md#tui.forms.run.RunForms.submitTracePlan), [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.prompt-keys.fieldOf](tui.md#tui.prompt-keys.fieldOf), [tui.prompt-keys.promptText](tui.md#tui.prompt-keys.promptText), [tui.forms.run.RunForms.refreshCheckPrompt](tui.md#tui.forms.run.RunForms.refreshCheckPrompt), [tui.forms.run.RunForms.changeCheckOption](tui.md#tui.forms.run.RunForms.changeCheckOption), [tui.forms.run.RunForms.submitCheck](tui.md#tui.forms.run.RunForms.submitCheck), [tui.forms.run.RunForms.refreshEdgePrompt](tui.md#tui.forms.run.RunForms.refreshEdgePrompt), [tui.forms.run.RunForms.submitEdge](tui.md#tui.forms.run.RunForms.submitEdge)
        - fn [openFeaturePrompt](../../src/tui/forms/run.ts#L104) () → void
          <a id="tui.forms.run.RunForms.openFeaturePrompt"></a><br>The feature form: the slug of the current feature file, else typed or chosen from the feature files.
          - calls [tui.forms.run.RunForms.refreshFeaturePrompt](tui.md#tui.forms.run.RunForms.refreshFeaturePrompt)
        - fn [refreshFeaturePrompt](../../src/tui/forms/run.ts#L114) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshFeaturePrompt"></a><br>The feature files matching the typed slug, and the target the form would check.
          - calls [tui.forms.run.RunForms.featureNote](tui.md#tui.forms.run.RunForms.featureNote)
        - fn [featureSlug](../../src/tui/forms/run.ts#L131) () → string <!-- internal -->
          <a id="tui.forms.run.RunForms.featureSlug"></a><br>The slug Enter would check: the selected feature file, else the typed text.
        - fn [featureNote](../../src/tui/forms/run.ts#L138) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.featureNote"></a><br>The note under the feature form: what Enter would check, or why the slug is refused.
          - calls [tui.forms.run.RunForms.featureSlug](tui.md#tui.forms.run.RunForms.featureSlug)
        - fn [submitFeature](../../src/tui/forms/run.ts#L150) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitFeature"></a><br>Enter in the feature form: the same slug rule as the CLI; an invalid one keeps the form and the text.
          - calls [tui.forms.run.RunForms.featureSlug](tui.md#tui.forms.run.RunForms.featureSlug)
        - fn [openBaselinePrompt](../../src/tui/forms/run.ts#L166) () → void
          <a id="tui.forms.run.RunForms.openBaselinePrompt"></a><br>The baseline form: the mode (write or check) and the target from the saved config's spec directory.
          - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath)
        - fn [submitBaseline](../../src/tui/forms/run.ts#L183) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitBaseline"></a><br>Enter in the baseline form: the chosen mode runs as the session's operation.
        - fn [openAgentsPrompt](../../src/tui/forms/run.ts#L197) () → void
          <a id="tui.forms.run.RunForms.openAgentsPrompt"></a><br>The agents form: the typed selection (empty is auto, `none`, or names as in `--agents`) and the mode. It shows what the selection resolves to and which files it would change, read from the disk; nothing runs a harness.
          - calls [tui.forms.run.RunForms.refreshAgentsPrompt](tui.md#tui.forms.run.RunForms.refreshAgentsPrompt)
        - fn [agentsPreview](../../src/tui/forms/run.ts#L203) (choice: HarnessChoice) → AgentsPreview <!-- internal -->
          <a id="tui.forms.run.RunForms.agentsPreview"></a><br>What a selection would do now: the read-only plan of the shared operation, or why it cannot be planned.
          - calls [features.harness.planAgents](features.md#features.harness.planAgents), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
        - fn [agentsChoice](../../src/tui/forms/run.ts#L229) () → HarnessChoice | Refusal <!-- internal -->
          <a id="tui.forms.run.RunForms.agentsChoice"></a><br>The typed selection as a choice, or why it is not one (the CLI's message for `--agents`).
          - calls [features.harness.harnessChoice](features.md#features.harness.harnessChoice), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
        - fn [refreshAgentsPrompt](../../src/tui/forms/run.ts#L241) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshAgentsPrompt"></a><br>The agents form's rows and note: the files the typed selection would write, or why it is refused.
          - calls [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice), [tui.forms.run.isRefusal](tui.md#tui.forms.run.isRefusal), [tui.forms.run.RunForms.agentsPreview](tui.md#tui.forms.run.RunForms.agentsPreview)
        - fn [submitAgents](../../src/tui/forms/run.ts#L262) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitAgents"></a><br>Enter in the agents form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form.
          - calls [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice), [tui.forms.run.isRefusal](tui.md#tui.forms.run.isRefusal)
        - fn [openInitPrompt](../../src/tui/forms/run.ts#L286) () → void
          <a id="tui.forms.run.RunForms.openInitPrompt"></a><br>The init form: the harness selection as in the agents form (empty is auto), then write or check. Its notes name the root, the languages and layers it describes (the saved keylang.json when there is one: it is kept), what the selection resolves to, and which classes of files…
          - calls [tui.forms.run.RunForms.refreshInitPrompt](tui.md#tui.forms.run.RunForms.refreshInitPrompt)
        - fn [refreshInitPrompt](../../src/tui/forms/run.ts#L292) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshInitPrompt"></a><br>The init form's details: what was found, what is kept, and what each mode writes.
          - calls [operations.generate.initSources](operations.md#operations.generate.initSources), [base.config.guessLayout](base.md#base.config.guessLayout), [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice), [tui.forms.run.isRefusal](tui.md#tui.forms.run.isRefusal), [tui.forms.run.RunForms.agentsPreview](tui.md#tui.forms.run.RunForms.agentsPreview), [features.baseline.baselinePath](features.md#features.baseline.baselinePath)
        - fn [submitInit](../../src/tui/forms/run.ts#L326) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitInit"></a><br>Enter in the init form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form.
          - calls [tui.forms.run.RunForms.agentsChoice](tui.md#tui.forms.run.RunForms.agentsChoice), [tui.forms.run.isRefusal](tui.md#tui.forms.run.isRefusal)
        - fn [openFmtPrompt](../../src/tui/forms/run.ts#L344) () → void
          <a id="tui.forms.run.RunForms.openFmtPrompt"></a><br>The fmt form: the current spec file by default — a directory only when typed — then the mode.
          - calls [tui.forms.run.RunForms.refreshFmtPrompt](tui.md#tui.forms.run.RunForms.refreshFmtPrompt)
        - fn [promptPaths](../../src/tui/forms/run.ts#L352) () → string[] | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.promptPaths"></a><br>The typed paths of the fmt or parse form, relative to the root, or why they cannot be used.
          - calls [map.analyze.within](map.md#map.analyze.within)
        - fn [refreshFmtPrompt](../../src/tui/forms/run.ts#L363) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshFmtPrompt"></a><br>The form shows the real set the paths expand to, from the disk, and both modes.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths), [tui.forms.run.RunForms.markdownSelection](tui.md#tui.forms.run.RunForms.markdownSelection)
        - fn [markdownSelection](../../src/tui/forms/run.ts#L391) (paths: readonly string[]) → { files: string[]; note: string } | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.markdownSelection"></a><br>The Markdown files the paths expand to on disk, and a note naming them and how many are unsaved (saved first).
          - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
        - fn [submitFmt](../../src/tui/forms/run.ts#L414) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitFmt"></a><br>Enter in the fmt form: the typed paths with the chosen mode run as the session's operation.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths)
        - fn [openParsePrompt](../../src/tui/forms/run.ts#L432) () → void
          <a id="tui.forms.run.RunForms.openParsePrompt"></a><br>The parse form: the current spec file by default — a directory only when typed — then the view.
          - calls [tui.forms.run.RunForms.refreshParsePrompt](tui.md#tui.forms.run.RunForms.refreshParsePrompt)
        - fn [refreshParsePrompt](../../src/tui/forms/run.ts#L440) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshParsePrompt"></a><br>The form shows the real set the paths expand to and both views; parsing needs no snapshot and writes nothing.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths), [tui.forms.run.RunForms.markdownSelection](tui.md#tui.forms.run.RunForms.markdownSelection)
        - fn [submitParse](../../src/tui/forms/run.ts#L452) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitParse"></a><br>Enter in the parse form: the typed paths in the chosen view run as the session's operation.
          - calls [tui.forms.run.RunForms.promptPaths](tui.md#tui.forms.run.RunForms.promptPaths)
        - fn [openWirePrompt](../../src/tui/forms/run.ts#L471) () → void
          <a id="tui.forms.run.RunForms.openWirePrompt"></a><br>The wire form: the generated file (the CLI's default), then the mode.
          - calls [tui.forms.run.RunForms.refreshWirePrompt](tui.md#tui.forms.run.RunForms.refreshWirePrompt)
        - fn [wireOut](../../src/tui/forms/run.ts#L477) () → string | Refusal <!-- internal -->
          <a id="tui.forms.run.RunForms.wireOut"></a><br>The typed output path (POSIX, relative to the root), or why it cannot be the generated file.
          - calls [operations.generate.wireOutProblem](operations.md#operations.generate.wireOutProblem)
        - fn [refreshWirePrompt](../../src/tui/forms/run.ts#L488) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshWirePrompt"></a><br>The form shows the path problem as it is typed, and the state of the file on disk. Reading only.
          - calls [tui.forms.run.RunForms.wireOut](tui.md#tui.forms.run.RunForms.wireOut), [tui.forms.run.isRefusal](tui.md#tui.forms.run.isRefusal), [tui.disk.readText](tui.md#tui.disk.readText)
        - fn [submitWire](../../src/tui/forms/run.ts#L510) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitWire"></a><br>Enter in the wire form: the typed file with the chosen mode runs as the session's operation; an invalid path keeps the form.
          - calls [tui.forms.run.RunForms.wireOut](tui.md#tui.forms.run.RunForms.wireOut), [tui.forms.run.isRefusal](tui.md#tui.forms.run.isRefusal)
        - fn [openCheckPrompt](../../src/tui/forms/run.ts#L528) () → void
          <a id="tui.forms.run.RunForms.openCheckPrompt"></a><br>The check form: the spec directory by default, not strict, the static mode of keylang.json.
          - calls [tui.forms.run.RunForms.refreshCheckPrompt](tui.md#tui.forms.run.RunForms.refreshCheckPrompt)
        - fn [checkPaths](../../src/tui/forms/run.ts#L534) () → string[] | { error: string } <!-- internal -->
          <a id="tui.forms.run.RunForms.checkPaths"></a><br>The typed paths, relative to the root (none: the spec directory), or why they cannot be checked here.
          - calls [map.analyze.within](map.md#map.analyze.within)
        - fn [refreshCheckPrompt](../../src/tui/forms/run.ts#L542) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshCheckPrompt"></a><br>The options as items, and the real set of spec files the paths expand to. Reading only.
          - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.resolveStatic](base.md#base.config.resolveStatic), [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [tui.prompt-keys.selectedRow](tui.md#tui.prompt-keys.selectedRow), [tui.forms.run.RunForms.checkPaths](tui.md#tui.forms.run.RunForms.checkPaths), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
        - fn [changeCheckOption](../../src/tui/forms/run.ts#L589) (delta: 1 | -1) → void <!-- internal -->
          <a id="tui.forms.run.RunForms.changeCheckOption"></a><br>←→ on an option of the check form: strict flips; the static mode cycles config → behavior → shape.
          - calls [tui.prompt-keys.cycle](tui.md#tui.prompt-keys.cycle), [tui.forms.run.RunForms.refreshCheckPrompt](tui.md#tui.forms.run.RunForms.refreshCheckPrompt)
        - fn [submitCheck](../../src/tui/forms/run.ts#L609) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitCheck"></a><br>Enter in the check form, on any row: the typed paths with the chosen options run as the session's operation.
          - calls [tui.forms.run.RunForms.checkPaths](tui.md#tui.forms.run.RunForms.checkPaths)
        - fn [openEdgePrompt](../../src/tui/forms/run.ts#L645) () → void
          <a id="tui.forms.run.RunForms.openEdgePrompt"></a><br>The edge form: the id under the cursor fills only the first field; the second is typed.
          - calls [tui.forms.run.RunForms.refreshEdgePrompt](tui.md#tui.forms.run.RunForms.refreshEdgePrompt)
        - fn [refreshEdgePrompt](../../src/tui/forms/run.ts#L653) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshEdgePrompt"></a><br>The rows, and a note on the selected id against the session's current snapshot (the operation reads the saved code again).
          - calls [tui.prompt-keys.caretAt](tui.md#tui.prompt-keys.caretAt), [features.explain-edge.edgeIdKnown](features.md#features.explain-edge.edgeIdKnown)
        - fn [submitEdge](../../src/tui/forms/run.ts#L676) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitEdge"></a><br>Enter in the edge form, on any row: both ids run as the session's operation; an empty one keeps the form.
          - calls [tui.forms.run.RunForms.refreshEdgePrompt](tui.md#tui.forms.run.RunForms.refreshEdgePrompt)
        - fn [openTracePlanPrompt](../../src/tui/forms/run.ts#L699) () → void
          <a id="tui.forms.run.RunForms.openTracePlanPrompt"></a><br>The trace-plan form: the flow under the cursor is the visible default; the list is the flows of the current documents.
          - calls [tui.forms.run.RunForms.refreshTracePlanPrompt](tui.md#tui.forms.run.RunForms.refreshTracePlanPrompt)
        - fn [refreshTracePlanPrompt](../../src/tui/forms/run.ts#L706) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.refreshTracePlanPrompt"></a><br>The declared flows matching the typed name (the exact one first), each with the file that declares it.
          - calls [base.span.compareText](base.md#base.span.compareText), [tui.forms.run.RunForms.tracePlanNote](tui.md#tui.forms.run.RunForms.tracePlanNote)
        - fn [tracePlanFlow](../../src/tui/forms/run.ts#L726) () → string <!-- internal -->
          <a id="tui.forms.run.RunForms.tracePlanFlow"></a><br>The flow Enter plans: the selected one of the list, else the typed name.
        - fn [tracePlanNote](../../src/tui/forms/run.ts#L733) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.tracePlanNote"></a><br>The note under the trace-plan form: the flow and whether the current documents declare it.
          - calls [tui.forms.run.RunForms.tracePlanFlow](tui.md#tui.forms.run.RunForms.tracePlanFlow)
        - fn [submitTracePlan](../../src/tui/forms/run.ts#L744) () → void <!-- internal -->
          <a id="tui.forms.run.RunForms.submitTracePlan"></a><br>Enter in the trace-plan form: the flow runs as the session's operation; an empty name keeps the form.
          - calls [tui.forms.run.RunForms.tracePlanFlow](tui.md#tui.forms.run.RunForms.tracePlanFlow)
  - module [hub](../../src/tui/hub.ts#L1)
    <a id="tui.hub"></a><br>`keylang web --hub`: one port for many repositories. `/` is the start page: a repository URL to clone (into the clone cache, then `init`, as `keylang clone` does), the repositories cloned before, the folder the hub runs in, and «Відкрити теку з ПК» — app.html, which analyses a…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - clone [features.clone](features.md#features.clone)
    - config [base.config](base.md#base.config)
    - json [base.json](base.md#base.json)
    - operations [operations.operations](operations.md#operations.operations)
    - web [tui.web](tui.md#tui.web)
    - type [HubOptions](../../src/tui/hub.ts#L32)
      <a id="tui.hub.HubOptions"></a><br>How `serveHub` listens and where it finds repositories.
    - type [HubServer](../../src/tui/hub.ts#L44)
      <a id="tui.hub.HubServer"></a><br>A running hub: its URL with the token in the fragment, its port, and how to stop it.
    - type [Mounted](../../src/tui/hub.ts#L51) <!-- internal -->
      <a id="tui.hub.Mounted"></a><br>A repository opened in this hub: its root and its own web app.
    - fn [idOf](../../src/tui/hub.ts#L60) (cacheRoot: string, dir: string) → string <!-- internal -->
      <a id="tui.hub.idOf"></a><br>A repository's place in the URL: its directory under the cache (`github.com~owner~repo`), or `here` for the hub's own folder.
    - fn [reply](../../src/tui/hub.ts#L67) (response: ServerResponse, status: number, type: string, body: string | Buffer) → void <!-- internal -->
      <a id="tui.hub.reply"></a><br>Sends a whole response with headers that forbid caching and MIME sniffing.
    - fn [readBody](../../src/tui/hub.ts#L73) (request: IncomingMessage) → Promise<string | null> <!-- internal -->
      <a id="tui.hub.readBody"></a><br>The request body as text, or null when it is larger than `MAX_BODY` (the rest is read and dropped).
    - fn [serveHub](../../src/tui/hub.ts#L88) (options: HubOptions) → Promise<HubServer>
      <a id="tui.hub.serveHub"></a><br>Starts the hub on `options.port` (0 picks a free one) and resolves once it listens.
      - calls [features.clone.cloneCacheRoot](features.md#features.clone.cloneCacheRoot), [map.analyze.findRoot](map.md#map.analyze.findRoot), [tui.web.createWebApp](tui.md#tui.web.createWebApp), [features.clone.listClones](features.md#features.clone.listClones), [tui.hub.idOf](tui.md#tui.hub.idOf), [features.clone.parseRepoSource](features.md#features.clone.parseRepoSource), [features.clone.syncClone](features.md#features.clone.syncClone), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [tui.hub.readBody](tui.md#tui.hub.readBody), [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [tui.web.ensureClient](tui.md#tui.web.ensureClient), [tui.web.diagramsPage](tui.md#tui.web.diagramsPage), [tui.hub.hubPage](tui.md#tui.hub.hubPage), [tui.hub.reply](tui.md#tui.hub.reply), [tui.web.logUnhandled](tui.md#tui.web.logUnhandled), [tui.web.shownHost](tui.md#tui.web.shownHost)
    - fn [hubPage](../../src/tui/hub.ts#L347) () → string <!-- internal -->
      <a id="tui.hub.hubPage"></a><br>The start page: static markup and a small script over `/hub/api/`; the token comes in the fragment once.
  - module [input](../../src/tui/input.ts#L1)
    <a id="tui.input"></a><br>Terminal input as events: keys (with Ctrl/Alt/Shift), SGR mouse reports, and bracketed paste. xterm.js sends the same sequences as a terminal, so one decoder serves both. A chunk may end inside a sequence or a grapheme cluster; the rest waits for the next chunk, and on…
    - width [tui.width](tui.md#tui.width)
    - type [KeyEvent](../../src/tui/input.ts#L13)
      <a id="tui.input.KeyEvent"></a><br>A key press: its name, modifiers, and the text it types when printable.
    - type [MouseEvent](../../src/tui/input.ts#L25)
      <a id="tui.input.MouseEvent"></a><br>An SGR mouse report: button, action and the 0-based cell.
    - type [PasteEvent](../../src/tui/input.ts#L39)
      <a id="tui.input.PasteEvent"></a><br>The text of one bracketed paste, line ends normalised to `\n`.
    - type [InputEvent](../../src/tui/input.ts#L45) = KeyEvent | MouseEvent | PasteEvent
      <a id="tui.input.InputEvent"></a><br>Every event the decoder emits.
    - type [Modifiers](../../src/tui/input.ts#L63) = Pick<KeyEvent, "ctrl" | "alt" | "shift"> <!-- internal -->
      <a id="tui.input.Modifiers"></a><br>The modifier flags of a key.
    - fn [key](../../src/tui/input.ts#L66) (name: string, mods: Partial<Modifiers> = {}, text?: string) → KeyEvent <!-- internal -->
      <a id="tui.input.key"></a><br>A key event; `text` only for printable keys.
    - fn [typed](../../src/tui/input.ts#L75) (cluster: string) → KeyEvent <!-- internal -->
      <a id="tui.input.typed"></a><br>The key that types one grapheme cluster: named by it, `space` for a blank.
      - calls [tui.input.key](tui.md#tui.input.key)
    - fn [modifiers](../../src/tui/input.ts#L89) (param: string | undefined) → Modifiers <!-- internal -->
      <a id="tui.input.modifiers"></a><br>xterm modifier parameter: value − 1 is a bit set of Shift (1), Alt (2) and Ctrl (4); absent means none.
    - fn [partialSuffix](../../src/tui/input.ts#L96) (text: string, marker: string) → number <!-- internal -->
      <a id="tui.input.partialSuffix"></a><br>Length of the longest suffix of `text` that is a proper prefix of `marker`.
    - module [InputDecoder](../../src/tui/input.ts#L103)
      <a id="tui.input.InputDecoder"></a><br>Turns raw terminal input into events, keeping incomplete sequences between chunks.
      - fn [feed](../../src/tui/input.ts#L108) (chunk: string) → InputEvent[]
        <a id="tui.input.InputDecoder.feed"></a><br>Events of a chunk; an incomplete sequence at the end waits for the next one.
        - calls [tui.input.partialSuffix](tui.md#tui.input.partialSuffix), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [flush](../../src/tui/input.ts#L148) () → InputEvent[]
        <a id="tui.input.InputDecoder.flush"></a><br>A lone ESC left after a pause is the Escape key, and a cluster that waited for more is one key. A paste whose end marker never came (a terminal that dropped it) ends here, so input is not swallowed for good.
        - calls [tui.input.key](tui.md#tui.input.key), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.input.typed](tui.md#tui.input.typed)
      - fn [waiting](../../src/tui/input.ts#L172) () → boolean
        <a id="tui.input.InputDecoder.waiting"></a><br>Whether a lone ESC or a cluster that may go on waits for `flush()`.
      - fn [pasting](../../src/tui/input.ts#L177) () → boolean
        <a id="tui.input.InputDecoder.pasting"></a><br>Inside a bracketed paste, waiting for its end marker.
      - fn [next](../../src/tui/input.ts#L182) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.next"></a><br>One event decoded from the start of `text` and how many UTF-16 units it took; null when more input is needed.
        - calls [tui.input.InputDecoder.escape](tui.md#tui.input.InputDecoder.escape), [tui.input.key](tui.md#tui.input.key), [tui.input.typed](tui.md#tui.input.typed), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [escape](../../src/tui/input.ts#L218) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.escape"></a><br>A sequence led by ESC: paste start, CSI (keys, mouse, reports), SS3 (`ESC O`), or Alt + a key.
        - calls [tui.input.InputDecoder.mouse](tui.md#tui.input.InputDecoder.mouse), [tui.input.key](tui.md#tui.input.key), [tui.input.modifiers](tui.md#tui.input.modifiers), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [mouse](../../src/tui/input.ts#L275) (code: number, x: number, y: number, press: boolean) → MouseEvent <!-- internal -->
        <a id="tui.input.InputDecoder.mouse"></a><br>Decodes an SGR mouse code: bits 2–4 are Shift/Alt/Ctrl, bit 6 the wheel, bit 5 motion, bits 0–1 the button.
  - module [markdown](../../src/tui/markdown.ts#L1)
    <a id="tui.markdown"></a><br>Reading mode (`v`): the spec rendered as text — headings, bullets, tables, code blocks, inline code, emphasis and links — wrapped to the width. Every row keeps its source line, so the gutter marks and `Enter` on an ID still work.
    - screen [tui.screen](tui.md#tui.screen)
    - theme [tui.theme](tui.md#tui.theme)
    - width [tui.width](tui.md#tui.width)
    - type [Segment](../../src/tui/markdown.ts#L14)
      <a id="tui.markdown.Segment"></a><br>A run of text with one style.
    - type [ReadRow](../../src/tui/markdown.ts#L20)
      <a id="tui.markdown.ReadRow"></a><br>One screen row of the rendered spec and the source line it came from.
    - fn [inline](../../src/tui/markdown.ts#L33) (written: string, base: Style) → Segment[]
      <a id="tui.markdown.inline"></a><br>Inline Markdown of one line as styled segments; `base` is the style of plain text.
    - fn [wrap](../../src/tui/markdown.ts#L65) (segments: Segment[], width: number, hang: number, source: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.wrap"></a><br>Word-wraps segments to `width` cells (`wrapRuns`); continuation rows start with `hang` spaces.
      - calls [tui.width.wrapRuns](tui.md#tui.width.wrapRuns)
    - fn [tableRows](../../src/tui/markdown.ts#L70) (block: { text: string; line: number }[], width: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.tableRows"></a><br>A Markdown table block as aligned rows; columns are capped at an even share of the width and cut with `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [renderMarkdown](../../src/tui/markdown.ts#L98) (text: string, width: number) → ReadRow[]
      <a id="tui.markdown.renderMarkdown"></a><br>The spec as reading-mode rows wrapped to `width`, each tagged with its 1-based source line.
      - calls [tui.markdown.tableRows](tui.md#tui.markdown.tableRows), [tui.markdown.wrap](tui.md#tui.markdown.wrap), [tui.markdown.inline](tui.md#tui.markdown.inline)
  - module [merge-session](../../src/tui/merge-session.ts#L1)
    <a id="tui.merge-session"></a><br>MERGE in a session: a proposal (`.keylang/proposals/<path>`, a spec or a source file) or a `Ctrl+G` result, compared with the file hunk by hunk and applied on `w`. A proposal has an identity — its text when `m` opened it — so a proposal an agent rewrote during the merge, or…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - proposals [features.proposals](features.md#features.proposals)
    - span [base.span](base.md#base.span)
    - stats [features.stats](features.md#features.stats)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - disk [tui.disk](tui.md#tui.disk)
    - input [tui.input](tui.md#tui.input)
    - merge [tui.merge](tui.md#tui.merge)
    - state [tui.state](tui.md#tui.state)
    - type [MergeHost](../../src/tui/merge-session.ts#L28)
      <a id="tui.merge-session.MergeHost"></a><br>What MERGE needs from the session around it.
    - type [ProposalEntry](../../src/tui/merge-session.ts#L43)
      <a id="tui.merge-session.ProposalEntry"></a><br>One pending target of the proposals list: its kind, how many hunks it has against the file on disk, and why it cannot be merged now (null: it can). Built from disk each time the list opens or Enter is pressed; building it writes nothing.
    - module [MergeSession](../../src/tui/merge-session.ts#L57)
      <a id="tui.merge-session.MergeSession"></a><br>MERGE of one proposal or `Ctrl+G` result: listing, opening, the keys, writing and undo.
      - fn [constructor](../../src/tui/merge-session.ts#L60) (host: MergeHost)
        <a id="tui.merge-session.MergeSession.constructor"></a><br>Stores the given host object on the instance as the sole setup step, with no validation or other work performed. The session relies on that stored host for all subsequent interaction. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [state](../../src/tui/merge-session.ts#L64) () → State <!-- internal -->
        <a id="tui.merge-session.MergeSession.state"></a><br>Returns the current `State` object held by the host, so the merge session reads shared state without owning a copy. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [scan](../../src/tui/merge-session.ts#L71) () → string[]
        <a id="tui.merge-session.MergeSession.scan"></a><br>Proposals that may be merged; the rest are listed with the reason they are ignored.
        - calls [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem)
      - fn [files](../../src/tui/merge-session.ts#L76) () → string[] <!-- internal -->
        <a id="tui.merge-session.MergeSession.files"></a><br>Every regular file under the proposals store, relative and POSIX, sorted so the list is stable.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [base.span.compareText](base.md#base.span.compareText)
      - fn [entries](../../src/tui/merge-session.ts#L97) () → ProposalEntry[]
        <a id="tui.merge-session.MergeSession.entries"></a><br>Every file under `.keylang/proposals/`, sorted by POSIX path, with its kind, hunk count and the reason it cannot be merged. A link in the store is listed but never followed: a proposal is a plain file.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.merge-session.proposalKind](tui.md#tui.merge-session.proposalKind), [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.entry](tui.md#tui.merge-session.MergeSession.entry), [base.span.compareText](base.md#base.span.compareText)
      - fn [entry](../../src/tui/merge-session.ts#L118) (path: string) → ProposalEntry <!-- internal -->
        <a id="tui.merge-session.MergeSession.entry"></a><br>The list entry of the proposal file `path`: read fresh, compared with the file on disk.
        - calls [tui.merge-session.proposalKind](tui.md#tui.merge-session.proposalKind), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [base.line-diff.diffLines](base.md#base.line-diff.diffLines), [tui.disk.lf](tui.md#tui.disk.lf), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [specDir](../../src/tui/merge-session.ts#L137) () → string
        <a id="tui.merge-session.MergeSession.specDir"></a><br>The spec directory relative to the root, POSIX (`keylang`).
        - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [problem](../../src/tui/merge-session.ts#L155) (path: string) → string | null
        <a id="tui.merge-session.MergeSession.problem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A Markdown proposal replaces one hand-written spec: a file under the spec directory, not a generated map file, and not reached through a link that leads out.
        - calls [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [boundary](../../src/tui/merge-session.ts#L167) (code: boolean) → string <!-- internal -->
        <a id="tui.merge-session.MergeSession.boundary"></a><br>The directory a merge of `path` may write in: the spec directory for a spec, the repository for code.
        - calls [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir)
      - fn [proposalAbs](../../src/tui/merge-session.ts#L172) (path: string) → string <!-- internal -->
        <a id="tui.merge-session.MergeSession.proposalAbs"></a><br>The proposal file of `path` in the store.
      - fn [open](../../src/tui/merge-session.ts#L183) (wanted?: string) → void
        <a id="tui.merge-session.MergeSession.open"></a><br>Opens the proposal of `wanted`, else of the current file, else the first one, as a MERGE diff against the file on disk. Proposals that break the format's limits are ignored with the reason.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start), [tui.disk.lf](tui.md#tui.disk.lf), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
      - fn [start](../../src/tui/merge-session.ts#L242) (path: string, origin: MergeState["origin"], base: string[], proposed: string[], disk: string | null, proposal: string | null) → void
        <a id="tui.merge-session.MergeSession.start"></a><br>A merge of `proposed` into `base`; `proposal` is the proposal file's text (null for `Ctrl+G`).
        - calls [base.line-diff.diffLines](base.md#base.line-diff.diffLines), [tui.merge-session.MergeSession.dropProposal](tui.md#tui.merge-session.MergeSession.dropProposal), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
      - fn [dropProposal](../../src/tui/merge-session.ts#L267) (path: string, text: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.dropProposal"></a><br>Removes the proposal of `path` while it is still `text`.
        - calls [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.removeInside](tui.md#tui.disk.removeInside)
      - fn [key](../../src/tui/merge-session.ts#L280) (event: KeyEvent) → void
        <a id="tui.merge-session.MergeSession.key"></a><br>The keys of MERGE: decide (a/r), undo a decision (u), move between hunks, write (w), leave.
        - calls [tui.merge-session.MergeSession.write](tui.md#tui.merge-session.MergeSession.write), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave)
      - fn [leave](../../src/tui/merge-session.ts#L350) (merge: MergeState, message: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.leave"></a><br>Leaves MERGE with a message, back to the mode it was opened from.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
      - fn [write](../../src/tui/merge-session.ts#L369) () → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.write"></a><br>Applies the decided hunks. A proposal file is the external change being confirmed, so the result goes to disk.
        - calls [tui.merge-session.MergeSession.writeBuffer](tui.md#tui.merge-session.MergeSession.writeBuffer), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.withEol](tui.md#tui.disk.withEol), [base.safe-write.keepLineEndings](base.md#base.safe-write.keepLineEndings), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [features.stats.statusesIn](features.md#features.stats.statusesIn)
      - fn [writeBuffer](../../src/tui/merge-session.ts#L459) (merge: MergeState) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.writeBuffer"></a><br>`Ctrl+G`: the accepted hunks go into the buffer, which `Ctrl+S` saves.
        - calls [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.buffer.setText](tui.md#tui.buffer.setText)
      - fn [undo](../../src/tui/merge-session.ts#L481) () → void
        <a id="tui.merge-session.MergeSession.undo"></a><br>`u` in the view: undoes the last merge while the file still holds its result, on disk too, and brings back the proposal as it was — unless a newer proposal was written since, which is kept.
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
    - fn [proposalKind](../../src/tui/merge-session.ts#L535) (path: string) → ProposalEntry["kind"] <!-- internal -->
      <a id="tui.merge-session.proposalKind"></a><br>A Markdown proposal replaces a spec; any other replaces a source file (or a test).
    - fn [errorText](../../src/tui/merge-session.ts#L540) (cause: unknown) → string
      <a id="tui.merge-session.errorText"></a><br>The message of a thrown value.
  - module [merge](../../src/tui/merge.ts#L1)
    <a id="tui.merge"></a><br>Line diff of a document and a proposed version, as hunks a person accepts or rejects one by one. The result keeps the base lines of every hunk that is not accepted, so nothing reaches the file without an explicit `a`.
    - line-diff [base.line-diff](base.md#base.line-diff)
    - type [Decision](../../src/tui/merge.ts#L12) = "pending" | "accepted" | "rejected"
      <a id="tui.merge.Decision"></a><br>What the person decided about one hunk; only `accepted` changes the file.
    - fn [applyHunks](../../src/tui/merge.ts#L15) (base: readonly string[], hunks: readonly Hunk[], decisions: readonly Decision[]) → string[]
      <a id="tui.merge.applyHunks"></a><br>The base with the accepted hunks applied; pending and rejected hunks keep the base lines.
    - type [MergeRow](../../src/tui/merge.ts#L33)
      <a id="tui.merge.MergeRow"></a><br>One row of the merge view: context, a removed base line, or an added line of hunk `hunk`.
    - fn [mergeRows](../../src/tui/merge.ts#L42) (base: readonly string[], hunks: readonly Hunk[]) → MergeRow[]
      <a id="tui.merge.mergeRows"></a><br>The rows the merge view draws: every base line, with each hunk's removed lines followed by its added lines.
  - module [nav](../../src/tui/nav.ts#L1)
    <a id="tui.nav"></a><br>The navigation panel: layers → modules → members from the snapshot, then flows and rules from the specs with their worst mark. Items point at the spec line that declares them and, for code entities, at the code.
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - type [Place](../../src/tui/nav.ts#L16)
      <a id="tui.nav.Place"></a><br>A place in a file: the spec line or the code line an item opens.
    - type [NavItem](../../src/tui/nav.ts#L23)
      <a id="tui.nav.NavItem"></a><br>One row of the panel: a heading, a code entity, a flow or a rule, with its places and mark.
    - type [Tree](../../src/tui/nav.ts#L38) <!-- internal -->
      <a id="tui.nav.Tree"></a><br>The panel's index of one analysis: layers, the code tree, and the flow and rule rows.
    - type [CodeTree](../../src/tui/nav.ts#L47)
      <a id="tui.nav.CodeTree"></a><br>The code part of `Tree`, read-only for its readers.
    - fn [markOver](../../src/tui/nav.ts#L56) (evidence: Map<number, LineEvidence>, from: number, to: number) → Mark | null <!-- internal -->
      <a id="tui.nav.markOver"></a><br>The worst evidence mark on the spec lines `[from, to]`, both inclusive.
      - calls [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [lastLine](../../src/tui/nav.ts#L65) (node: Node) → number <!-- internal -->
      <a id="tui.nav.lastLine"></a><br>The last line a node or any of its nested items starts on.
      - calls [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [heading](../../src/tui/nav.ts#L75) (key: string, label: string) → NavItem <!-- internal -->
      <a id="tui.nav.heading"></a><br>A section heading row (LAYERS, FLOWS, RULES); always expanded, never selectable as an entity.
    - fn [treeOf](../../src/tui/nav.ts#L80) (analysis: Analysis) → Tree <!-- internal -->
      <a id="tui.nav.treeOf"></a><br>The panel's index for `analysis`, built once and cached.
      - calls [base.span.compareText](base.md#base.span.compareText), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.nav.markOver](tui.md#tui.nav.markOver), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [tui.nav.lastLine](tui.md#tui.nav.lastLine)
    - fn [codeTree](../../src/tui/nav.ts#L143) (analysis: Analysis) → CodeTree
      <a id="tui.nav.codeTree"></a><br>Layers in the map's order and the direct children of every layer, module and class (top modules of a layer; nested modules and members of a module): one index for this panel and the zoom screen (`zoom.ts`).
      - calls [tui.nav.treeOf](tui.md#tui.nav.treeOf)
    - fn [navItems](../../src/tui/nav.ts#L150) (analysis: Analysis | null, expanded: ReadonlySet<string>) → NavItem[]
      <a id="tui.nav.navItems"></a><br>Visible items for the expanded keys. Layers start expanded unless `-<key>` collapses them.
      - calls [tui.nav.treeOf](tui.md#tui.nav.treeOf), [tui.nav.heading](tui.md#tui.nav.heading)
  - module [new-spec](../../src/tui/new-spec.ts#L1)
    <a id="tui.new-spec"></a><br>A new hand-written specification (design §2.8): its kinds, the default path and the first text of each, and where a new file may go. The rules are the proposal rules: a Markdown file under the spec directory, not the generated map, the explained map or the store of saved…
    - node [external.node](external.md#external.node)
    - parser [lang.parser](lang.md#lang.parser)
    - proposals [features.proposals](features.md#features.proposals)
    - state [tui.state](tui.md#tui.state)
    - fn [defaultSpecPath](../../src/tui/new-spec.ts#L25) (kind: SpecKind, specDir: string) → string
      <a id="tui.new-spec.defaultSpecPath"></a><br>The path the form starts with: under the spec directory (`specDir`, relative and POSIX; "" is the root).
    - fn [suggestedFlowName](../../src/tui/new-spec.ts#L45) (path: string) → string
      <a id="tui.new-spec.suggestedFlowName"></a><br>The flow name a path suggests: its file name without `.md`, when that is a valid name; else "".
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [flowNameProblem](../../src/tui/new-spec.ts#L52) (name: string) → string | null
      <a id="tui.new-spec.flowNameProblem"></a><br>Why `name` cannot be a flow name, or null. The heading grammar takes one segment (format §Appendix A).
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [specTemplate](../../src/tui/new-spec.ts#L62) (kind: SpecKind, name: string) → string
      <a id="tui.new-spec.specTemplate"></a><br>The first text of a new file: only the heading its kind needs, no invented IDs or planned nodes. `name` is the flow name (flow) or the title (feature).
    - fn [newSpecProblem](../../src/tui/new-spec.ts#L83) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="tui.new-spec.newSpecProblem"></a><br>Why `path` (relative to `root`, POSIX) cannot hold a new or opened specification, or null. `specDir` is relative to the root and POSIX; `generated` says whether the analysis knows the path as a generated document. An existing file is no problem here: the form opens it.
      - calls [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem)
  - module [operation-worker](../../src/tui/operation-worker.ts#L1)
    <a id="tui.operation-worker"></a><br>Worker entry of `OperationWorker`: runs shared operations off the UI thread. Requests and replies are plain cloneable data; the callbacks and the AbortSignal stay on the session's side.
    - node [external.node](external.md#external.node)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - operations [operations.operations](operations.md#operations.operations)
    - type [OperationCall](../../src/tui/operation-worker.ts#L22)
      <a id="tui.operation-worker.OperationCall"></a><br>A message to the worker: run a request, let its commit go ahead, cancel it, or read a feature file at its base.
    - type [OperationReply](../../src/tui/operation-worker.ts#L29)
      <a id="tui.operation-worker.OperationReply"></a><br>A reply of the worker: any number of progress notes, at most one commit request, then one result or one error; or the base asked for.
    - fn [post](../../src/tui/operation-worker.ts#L37) (reply: OperationReply) → void <!-- internal -->
      <a id="tui.operation-worker.post"></a><br>Sends one reply to the session thread; a no-op outside a worker.
    - type [RunningOperation](../../src/tui/operation-worker.ts#L40) <!-- internal -->
      <a id="tui.operation-worker.RunningOperation"></a><br>An operation running here: its signal, and the answer its commit waits for.
    - fn [progressReply](../../src/tui/operation-worker.ts#L49) (operationId: number, text: string, step: BatchStep | undefined) → OperationReply <!-- internal -->
      <a id="tui.operation-worker.progressReply"></a><br>A progress reply; `step` is set only when the operation reported one.
    - fn [failureText](../../src/tui/operation-worker.ts#L58) (cause: unknown) → string <!-- internal -->
      <a id="tui.operation-worker.failureText"></a><br>The text of a thrown value, for an `error` reply.
  - module [prompt-keys](../../src/tui/prompt-keys.ts#L1)
    <a id="tui.prompt-keys"></a><br>The keys of a prompt — the palette, a search, a picker, the form of an operation. Every kind answers the same keys: typing and Backspace edit the text of the selected row, ↑↓ move the selection, ←→ change a choice, Enter runs it.
    - input [tui.input](tui.md#tui.input)
    - state [tui.state](tui.md#tui.state)
    - width [tui.width](tui.md#tui.width)
    - type [TextField](../../src/tui/prompt-keys.ts#L18)
      <a id="tui.prompt-keys.TextField"></a><br>A text the selected row of a prompt edits.
    - type [PromptKeys](../../src/tui/prompt-keys.ts#L26)
      <a id="tui.prompt-keys.PromptKeys"></a><br>What the keys of a prompt do for one kind of it.
    - fn [promptText](../../src/tui/prompt-keys.ts#L40) (prompt: Prompt) → TextField
      <a id="tui.prompt-keys.promptText"></a><br>The prompt's own text as a field: the query, the paths, the target.
    - fn [fieldOf](../../src/tui/prompt-keys.ts#L50) (form: Record<K, string>, key: K, digits = false) → TextField
      <a id="tui.prompt-keys.fieldOf"></a><br>A text of a form object as a field.
    - fn [fieldIn](../../src/tui/prompt-keys.ts#L64) (prompt: Prompt, keys: PromptKeys) → TextField | null <!-- internal -->
      <a id="tui.prompt-keys.fieldIn"></a><br>The field the selected row edits: the kind's own choice, else the prompt's text.
      - calls [tui.prompt-keys.promptText](tui.md#tui.prompt-keys.promptText)
    - fn [backspaced](../../src/tui/prompt-keys.ts#L69) (text: string) → string
      <a id="tui.prompt-keys.backspaced"></a><br>A typed line after Backspace: its last grapheme cluster gone. The prompts and the clip's input line edit this way.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [typeInto](../../src/tui/prompt-keys.ts#L74) (prompt: Prompt, keys: PromptKeys, text: string) → void
      <a id="tui.prompt-keys.typeInto"></a><br>Text typed or pasted into the prompt: into the selected row's field, then the prompt follows it.
      - calls [tui.prompt-keys.fieldIn](tui.md#tui.prompt-keys.fieldIn)
    - fn [promptKey](../../src/tui/prompt-keys.ts#L86) (prompt: Prompt, keys: PromptKeys, event: KeyEvent) → void
      <a id="tui.prompt-keys.promptKey"></a><br>Every key of a prompt but Esc (the caller closes it): Backspace, ←→ when the kind has choices, ↑↓ over a list that has items, Enter, and text.
      - calls [tui.prompt-keys.fieldIn](tui.md#tui.prompt-keys.fieldIn), [tui.prompt-keys.backspaced](tui.md#tui.prompt-keys.backspaced), [tui.prompt-keys.typeInto](tui.md#tui.prompt-keys.typeInto)
    - fn [noteOfSelection](../../src/tui/prompt-keys.ts#L113) (prompt: Prompt) → void
      <a id="tui.prompt-keys.noteOfSelection"></a><br>The note of the selected item, where each item has its own (`notes`).
    - type [FormRow](../../src/tui/prompt-keys.ts#L118)
      <a id="tui.prompt-keys.FormRow"></a><br>One row of a form: its id, which the selection keeps across a refresh, and its text.
    - fn [showRows](../../src/tui/prompt-keys.ts#L124) (prompt: Prompt, rows: readonly FormRow[], selected: string) → void
      <a id="tui.prompt-keys.showRows"></a><br>The rows of a form, the row `selected` selected (the first when it is gone).
    - fn [selectedRow](../../src/tui/prompt-keys.ts#L131) (prompt: Prompt, fallback: string) → string
      <a id="tui.prompt-keys.selectedRow"></a><br>The id of the selected row, or `fallback` before the rows are built.
    - fn [caretAt](../../src/tui/prompt-keys.ts#L136) (selected: string) → (row: string) => string
      <a id="tui.prompt-keys.caretAt"></a><br>The caret after the text of a field's row while it is the `selected` one: `caretAt(selected)("into")`.
    - fn [cycle](../../src/tui/prompt-keys.ts#L141) (list: readonly T[], value: T, delta: number) → T
      <a id="tui.prompt-keys.cycle"></a><br>The value `delta` steps from `value` in `list`, around the ends.
    - fn [selectRow](../../src/tui/prompt-keys.ts#L146) (prompt: Prompt, row: string, refresh: () => void) → void
      <a id="tui.prompt-keys.selectRow"></a><br>Selects `row` among rows that depend on the values just changed: built once to find it, once to show it selected.
    - fn [selectProblem](../../src/tui/prompt-keys.ts#L157) (prompt: Prompt, field: string, refresh: () => void) → void
      <a id="tui.prompt-keys.selectProblem"></a><br>A form that may not run keeps its values: the row the problem is about is selected again.
  - module [read-api](../../src/tui/read-api.ts#L1)
    <a id="tui.read-api"></a><br>The read half of the diagram API (`GET /api/…`): one function answers a path and its query from an analysis, for every transport the diagram page has — `keylang web` over HTTP, the static export (`web --export`, the answers computed once and written as files) and the analysis…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - diagram [map.diagram](map.md#map.diagram)
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - schema-discover [map.schema-discover](map.md#map.schema-discover)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - explorer [features.explorer](features.md#features.explorer)
    - clone [features.clone](features.md#features.clone)
    - files [lang.files](lang.md#lang.files)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - map [map.map](map.md#map.map)
    - coverage [operations.coverage](operations.md#operations.coverage)
    - spec [operations.spec](operations.md#operations.spec)
    - diagram-export [operations.diagram-export](operations.md#operations.diagram-export)
    - diagram-propose [operations.diagram-propose](operations.md#operations.diagram-propose)
    - shared [operations.shared](operations.md#operations.shared)
    - parser [lang.parser](lang.md#lang.parser)
    - proposals [features.proposals](features.md#features.proposals)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - tour [features.tour](features.md#features.tour)
    - graph-diff [features.graph-diff](features.md#features.graph-diff)
    - graph-diff-format [features.graph-diff-format](features.md#features.graph-diff-format)
    - graph-diff-run [features.graph-diff-run](features.md#features.graph-diff-run)
    - fn [withSchemas](../../src/tui/read-api.ts#L41) (schemas: SchemaRead | undefined) → { schemas?: SchemaRead } <!-- internal -->
      <a id="tui.read-api.withSchemas"></a><br>The schemas of the code as a diagram's input, once they are read (a keyed diagram does not wait for them).
    - type [ReadAnswer](../../src/tui/read-api.ts#L44)
      <a id="tui.read-api.ReadAnswer"></a><br>One answer: a status, a media type, the body; `file` names an attachment.
    - type [ReadApiOptions](../../src/tui/read-api.ts#L52)
      <a id="tui.read-api.ReadApiOptions"></a><br>What the read API answers from: the root, the shared analysis, and the analyzer for its own fresh runs.
    - fn [requestKey](../../src/tui/read-api.ts#L81) (path: string, query: URLSearchParams) → string
      <a id="tui.read-api.requestKey"></a><br>A request as one string, the query in one order: a static export files its answers by it, and the page (`web/src/api.ts`, `requestKey`) spells it alike.
    - fn [keyShard](../../src/tui/read-api.ts#L90) (key: string, shards: number) → number
      <a id="tui.read-api.keyShard"></a><br>FNV-1a over the UTF-16 code units of a key: which data shard of a static export holds it (`web/src/api.ts`, `keyShard`).
    - type [DocEntry](../../src/tui/read-api.ts#L105)
      <a id="tui.read-api.DocEntry"></a><br>A spec Markdown file the «Карта» tab lists, with the group it is shown under.
    - type [SpecDocs](../../src/tui/read-api.ts#L111)
      <a id="tui.read-api.SpecDocs"></a><br>The spec Markdown files of a repository: the rendered map and explained map among them.
    - type [DiscoveredListing](../../src/tui/read-api.ts#L119) = Omit<FlowListing, "ids"> & { kind?: string; label?: string } <!-- internal -->
      <a id="tui.read-api.DiscoveredListing"></a><br>A discovered flow in the views listing: its trigger's kind and label when the snapshot has that entry.
    - fn [isRefusal](../../src/tui/read-api.ts#L122) (answer: Parsed | string) → answer is string
      <a id="tui.read-api.isRefusal"></a><br>A parser's answer: the parsed value, or the text of what is wrong with the input.
    - type [ReadApi](../../src/tui/read-api.ts#L127)
      <a id="tui.read-api.ReadApi"></a><br>The read API of one repository.
    - fn [createReadApi](../../src/tui/read-api.ts#L138) (options: ReadApiOptions) → ReadApi
      <a id="tui.read-api.createReadApi"></a><br>Builds the read API over `options`; its caches live as long as the returned object.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [base.config.toPosix](base.md#base.config.toPosix), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [features.discover-names.processViews](features.md#features.discover-names.processViews), [features.discover-names.readProcesses](features.md#features.discover-names.readProcesses), [map.diagram.viewOfKey](map.md#map.diagram.viewOfKey), [map.diagram.diagramOf](map.md#map.diagram.diagramOf), [tui.read-api.withSchemas](tui.md#tui.read-api.withSchemas), [map.schema-discover.readCodeSchemas](map.md#map.schema-discover.readCodeSchemas), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.map.explainedMapOf](map.md#map.map.explainedMapOf), [base.span.compareText](base.md#base.span.compareText), [features.tour.buildTour](features.md#features.tour.buildTour), [features.tour.tourMarkdown](features.md#features.tour.tourMarkdown), [features.git-changes.gitSummary](features.md#features.git-changes.gitSummary), [features.git-changes.featureBaseOrigin](features.md#features.git-changes.featureBaseOrigin), [features.clone.redactUrl](features.md#features.clone.redactUrl), [tui.read-api.isRefusal](tui.md#tui.read-api.isRefusal), [map.diagram-layout.readLayout](map.md#map.diagram-layout.readLayout), [features.proposals.pendingTargets](features.md#features.proposals.pendingTargets), [map.diagram-layout.layoutFromFile](map.md#map.diagram-layout.layoutFromFile), [map.diagram.usagesOf](map.md#map.diagram.usagesOf), [features.explorer.callsOf](features.md#features.explorer.callsOf), [operations.diagram-export.exportViewOfQuery](operations.md#operations.diagram-export.exportViewOfQuery), [operations.diagram-export.diagramExportText](operations.md#operations.diagram-export.diagramExportText), [operations.diagram-export.exportSourcesOf](operations.md#operations.diagram-export.exportSourcesOf), [operations.coverage.runCoverage](operations.md#operations.coverage.runCoverage), [map.diagram.parseView](map.md#map.diagram.parseView), [features.explorer.eventsOf](features.md#features.explorer.eventsOf), [map.diagram.viewsOf](map.md#map.diagram.viewsOf), [map.schema-discover.codeSchemas](map.md#map.schema-discover.codeSchemas), [map.diagram.flowListing](map.md#map.diagram.flowListing), [operations.diagram-propose.specHash](operations.md#operations.diagram-propose.specHash), [features.check-results.checkResults](features.md#features.check-results.checkResults), [tui.read-api.withResults](tui.md#tui.read-api.withResults), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [operations.spec.runCheck](operations.md#operations.spec.runCheck), [features.graph-diff-format.diffDiagram](features.md#features.graph-diff-format.diffDiagram)
    - type [NodeResult](../../src/tui/read-api.ts#L591) = { verdict: string; criterion: string; message: string } <!-- internal -->
      <a id="tui.read-api.NodeResult"></a>
    - fn [withResults](../../src/tui/read-api.ts#L598) (diagram: Diagram, results: readonly CheckResult[]) → Omit<Diagram, "nodes"> & { nodes: (DiagramNode & { results?: NodeResult[] })[] } <!-- internal -->
      <a id="tui.read-api.withResults"></a><br>Each shape with the check results behind its verdict, for the side panel of the diagram page: those on its spec line, or, for a shape of code alone (an entry's call tree), those about its ID.
  - module reports
    <a id="tui.reports"></a>
    - module [chat](../../src/tui/reports/chat.ts#L1)
      <a id="tui.reports.chat"></a><br>The report of the clip's reply (ADR 0021): what the model answered, the block it gave, and what it read — the system prompt and the prompt, as the operation built them from the request — so a reply can be checked against its question after the fact, as F4 shows the pack before…
      - node [external.node](external.md#external.node)
      - config [base.config](base.md#base.config)
      - operations [operations.operations](operations.md#operations.operations)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
    - module [check](../../src/tui/reports/check.ts#L1)
      <a id="tui.reports.check"></a><br>Reports of the operations that read the specs against the code: feature readiness, check, an explained edge, parse, a trace plan, the C4 diagram, and the export of a finished report. Also the list of entry points (`keylang entries`).
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
      - type [CheckKind](../../src/tui/reports/check.ts#L21) <!-- internal -->
        <a id="tui.reports.check.CheckKind"></a><br>The operation kinds `CHECK_REPORTS` describes.
      - type [FeatureItem](../../src/tui/reports/check.ts#L24)
        <a id="tui.reports.check.FeatureItem"></a><br>One gap or hint of a feature report, as the readiness screen lists it.
      - fn [featureItems](../../src/tui/reports/check.ts#L31) (report: FeatureReport) → FeatureItem[]
        <a id="tui.reports.check.featureItems"></a><br>The gaps and hints of a feature report up the ladder, a stage's gaps before its hints: the rows Tab and the arrows select.
      - fn [stageLadder](../../src/tui/reports/check.ts#L40) (stage: FeatureReport["stage"]) → string <!-- internal -->
        <a id="tui.reports.check.stageLadder"></a><br>`idea › behavior › [structure] › ready › done`: the ladder with the current stage in brackets.
      - fn [infoSummary](../../src/tui/reports/check.ts#L45) (items: readonly FeatureInfo[]) → string <!-- internal -->
        <a id="tui.reports.check.infoSummary"></a><br>`ok 2 · unverified 1`, or `—` when the feature has none.
      - fn [checkParams](../../src/tui/reports/check.ts#L56) (request: CheckRequest) → string <!-- internal -->
        <a id="tui.reports.check.checkParams"></a><br>The requested check options as the F6 list names them: `keylang · strict · static shape`.
      - fn [edgeItems](../../src/tui/reports/check.ts#L70) (payload: ExplainEdgePayload) → { file: string; line: number; col: number; text: string }[] <!-- internal -->
        <a id="tui.reports.check.edgeItems"></a><br>The evidence of an explain-edge report the arrows select after Tab: every edge (`→` from → to, `←` to → from), or every unresolved construct when there is none. `file` is "" for an edge with no position in the code.
        - calls [features.explain-edge.edgeLine](features.md#features.explain-edge.edgeLine), [features.explain-edge.holeLine](features.md#features.explain-edge.holeLine)
      - fn [c4Label](../../src/tui/reports/check.ts#L80) (request: ExportC4Request) → string <!-- internal -->
        <a id="tui.reports.check.c4Label"></a><br>How messages name a C4 export: the CLI's command with the flags it got.
    - module [coverage](../../src/tui/reports/coverage.ts#L1)
      <a id="tui.reports.coverage"></a><br>Reports of the views over the snapshot that say where to look by hand: «Blind spots» (`keylang coverage`), «Integrations» (`keylang integrations`) and «Migration status» (`keylang migration status`). Each place a report names — an orphan fn, a module with holes, an entry point…
      - operations [operations.operations](operations.md#operations.operations)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [CoverageKind](../../src/tui/reports/coverage.ts#L19) = "coverage" <!-- internal -->
        <a id="tui.reports.coverage.CoverageKind"></a><br>The operation kinds of `COVERAGE_REPORTS`.
      - fn [coveragePlaces](../../src/tui/reports/coverage.ts#L22) (payload: CoveragePayload) → ReportItem[]
        <a id="tui.reports.coverage.coveragePlaces"></a><br>The places of the report, in its order: orphans, modules with holes, entry points without a flow, logic in data.
      - fn [integrationPlaces](../../src/tui/reports/coverage.ts#L57) (payload: IntegrationsPayload) → ReportItem[]
        <a id="tui.reports.coverage.integrationPlaces"></a><br>The places of the inventory: each call site, then each webhook.
      - fn [tourPlaces](../../src/tui/reports/coverage.ts#L104) (payload: TourPayload) → ReportItem[]
        <a id="tui.reports.coverage.tourPlaces"></a><br>The places of the tour: the fns to read first, then the modules with most holes.
      - fn [migrationPlaces](../../src/tui/reports/coverage.ts#L136) (payload: MigrationStatusPayload) → ReportItem[]
        <a id="tui.reports.coverage.migrationPlaces"></a><br>The places of the parity: each counterpart flow of this repository (its spec), then each dropped row of the table.
    - module [discover](../../src/tui/reports/discover.ts#L1)
      <a id="tui.reports.discover"></a><br>Reports of discovered flows: the generated view `flows discover` writes (each flow opens at its heading in the view), and the one flow `flows adopt` proposed as a spec; and the portable bundle of `flow export` and `flow import` (business-flows/26), which the CLI runs. Layer…
      - operations [operations.operations](operations.md#operations.operations)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [DiscoverKind](../../src/tui/reports/discover.ts#L13) <!-- internal -->
        <a id="tui.reports.discover.DiscoverKind"></a><br>The operation kinds this module reports.
      - fn [flowPlaces](../../src/tui/reports/discover.ts#L16) (payload: FlowsDiscoverPayload) → ReportItem[] <!-- internal -->
        <a id="tui.reports.discover.flowPlaces"></a><br>Each discovered flow at its `# flow` heading in the view's file.
    - module [draft](../../src/tui/reports/draft.ts#L1)
      <a id="tui.reports.draft"></a><br>Reports of the drafts: a flow, rules or layers drafted from the code, flows from code, code from a planned fn and its applied candidate, and the model's open questions for a feature. A proposal is written only through MERGE; a preview writes nothing.
      - proposals [features.proposals](features.md#features.proposals)
      - operations [operations.operations](operations.md#operations.operations)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [DraftKind](../../src/tui/reports/draft.ts#L16) <!-- internal -->
        <a id="tui.reports.draft.DraftKind"></a><br>The operation kinds `DRAFT_REPORTS` describes.
      - fn [modeFlag](../../src/tui/reports/draft.ts#L19) (mode: string | undefined) → string <!-- internal -->
        <a id="tui.reports.draft.modeFlag"></a><br>` --mode hybrid`; nothing for algo, the CLI's default.
      - fn [codeSource](../../src/tui/reports/draft.ts#L24) (source: { file?: string | null | undefined; line?: number | null | undefined; since?: string | null | undefined }) → string <!-- internal -->
        <a id="tui.reports.draft.codeSource"></a><br>The source of a code-to-spec as the CLI names it: `src/a.ts:8` or `--since HEAD`.
      - fn [draftOutcome](../../src/tui/reports/draft.ts#L31) (status: OperationRecord["status"], payload: DraftFlowPayload | DraftRulesPayload | CodeToSpecPayload) → string <!-- internal -->
        <a id="tui.reports.draft.draftOutcome"></a><br>`3 step(s), preview, nothing written`, `3 step(s) proposed for <target>`, `refused, nothing written`, `write failed`.
      - fn [specCodeOutcome](../../src/tui/reports/draft.ts#L48) (status: OperationRecord["status"], payload: SpecToCodePayload) → string <!-- internal -->
        <a id="tui.reports.draft.specCodeOutcome"></a><br>What spec-to-code did with its candidate: previewed, proposed (all, or the ones before it stopped), refused.
      - fn [questionsOutcome](../../src/tui/reports/draft.ts#L66) (payload: FeatureQuestionsPayload) → string <!-- internal -->
        <a id="tui.reports.draft.questionsOutcome"></a><br>`3 question(s) proposed`, with the answer's lines left out when there were any.
      - fn [draftHint](../../src/tui/reports/draft.ts#L73) (rows: ReportRow[], payload: { proposal: string | null; output: "proposal" | "preview" }, target: string) → void <!-- internal -->
        <a id="tui.reports.draft.draftHint"></a><br>What Enter does on a drafted report: MERGE of the proposal, or a draft again after a preview.
      - fn [proposedRows](../../src/tui/reports/draft.ts#L79) (rows: ReportRow[], payload: { output: "proposal" | "preview" }, candidate: { target: string; text: string | null }, drafted: string) → void <!-- internal -->
        <a id="tui.reports.draft.proposedRows"></a><br>A preview's whole proposed target, when it is more than the drafted part.
        - calls [tui.reports.rows.textRows](tui.md#tui.reports.rows.textRows)
      - fn [fallback](../../src/tui/reports/draft.ts#L84) (payload: { fallback: unknown }) → string <!-- internal -->
        <a id="tui.reports.draft.fallback"></a><br>`(hybrid without a model)` after the mode of a draft that had to fall back.
    - module [explain](../../src/tui/reports/explain.ts#L1)
      <a id="tui.reports.explain"></a><br>Reports of the explanations: offline help and summaries, the model's answer for one node, the inventory of what needs explaining and the batch of briefs.
      - explain-node [features.explain-node](features.md#features.explain-node)
      - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
      - explain-offline [features.explain-offline](features.md#features.explain-offline)
      - operations [operations.operations](operations.md#operations.operations)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [ExplainKind](../../src/tui/reports/explain.ts#L17) = "explain" | "explain-llm" | "explain-plan" | "explain-batch" <!-- internal -->
        <a id="tui.reports.explain.ExplainKind"></a><br>The operation kinds `EXPLAIN_REPORTS` describes.
      - fn [explainPlanLabel](../../src/tui/reports/explain.ts#L20) (request: ExplainPlanRequest) → string <!-- internal -->
        <a id="tui.reports.explain.explainPlanLabel"></a><br>The CLI command of an inventory: `explain --stale`, `explain --missing --dry-run --limit 3 --jobs 2`.
      - fn [explainBatchLabel](../../src/tui/reports/explain.ts#L28) (request: ExplainBatchRequest) → string <!-- internal -->
        <a id="tui.reports.explain.explainBatchLabel"></a><br>The CLI command of a batch: `explain --missing --llm --limit 3 --jobs 2`.
      - fn [explainPlanOutcome](../../src/tui/reports/explain.ts#L33) (payload: ExplainPlanPayload) → string <!-- internal -->
        <a id="tui.reports.explain.explainPlanOutcome"></a><br>`2 stale, 1 gone of 5 saved explanation(s)`, `nothing to explain: zero work, no request`, `6 brief(s) planned, ~1200 in, ~480 out tokens (approximate)`.
      - fn [explainBatchOutcome](../../src/tui/reports/explain.ts#L49) (payload: ExplainBatchPayload) → string <!-- internal -->
        <a id="tui.reports.explain.explainBatchOutcome"></a><br>`6 of 6 brief(s) written`, `5 of 6 brief(s) written, 1 failed`, `cancelled: 1 of 6 written, 5 not started`, `outdated: …`.
      - fn [batchState](../../src/tui/reports/explain.ts#L64) (payload: ExplainBatchPayload, id: string) → string <!-- internal -->
        <a id="tui.reports.explain.batchState"></a><br>What became of one planned node of a batch: `written <file>`, `failed: <reason>`, `not started`.
      - fn [savedRows](../../src/tui/reports/explain.ts#L74) (rows: ReportRow[], label: string, saved: SavedAnswer) → void <!-- internal -->
        <a id="tui.reports.explain.savedRows"></a><br>A saved answer or brief: its provenance on one row, then its text and the IDs it made up.
      - fn [linkRows](../../src/tui/reports/explain.ts#L87) (rows: ReportRow[], links: readonly { file: string | null; text: string }[], selected: number) → void <!-- internal -->
        <a id="tui.reports.explain.linkRows"></a><br>The places an explanation links to, each an item Tab selects.
      - fn [linkItems](../../src/tui/reports/explain.ts#L97) (links: readonly { file: string | null; line: number; col: number; text: string }[]) → ReportItem[] <!-- internal -->
        <a id="tui.reports.explain.linkItems"></a><br>A place an explanation names: the node, a related ID the snapshot or a planned declares, a flow, a rule line.
    - module [records](../../src/tui/reports/records.ts#L1)
      <a id="tui.reports.records"></a><br>The records of the F6 panel through the reports of their kinds: how a record is named in the list and the messages, its outcome, its report rows and the items Tab selects. Each kind is one entry of one table, so a new kind of operation is one more entry, not one more branch in…
      - operations [operations.operations](operations.md#operations.operations)
      - actions [tui.actions](tui.md#tui.actions)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - chat [tui.reports.chat](tui.md#tui.reports.chat)
      - check [tui.reports.check](tui.md#tui.reports.check)
      - coverage [tui.reports.coverage](tui.md#tui.reports.coverage)
      - discover [tui.reports.discover](tui.md#tui.reports.discover)
      - draft [tui.reports.draft](tui.md#tui.reports.draft)
      - explain [tui.reports.explain](tui.md#tui.reports.explain)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - setup [tui.reports.setup](tui.md#tui.reports.setup)
      - fn [reportOf](../../src/tui/reports/records.ts#L25) (kind: K) → Report<K> <!-- internal -->
        <a id="tui.reports.records.reportOf"></a><br>The report of one kind; the table is checked against this shape, but indexing it with a generic kind loses the pairing.
      - fn [isDone](../../src/tui/reports/records.ts#L34) (result: OperationResult) → result is Done<Kind> <!-- internal -->
        <a id="tui.reports.records.isDone"></a><br>A result that has its payload: the report of its kind can show it.
      - fn [operationLabel](../../src/tui/reports/records.ts#L39) (request: RequestOf<K>) → string
        <a id="tui.reports.records.operationLabel"></a><br>How messages name an operation: `doctor`, `feature pay`, `map write`.
        - calls [tui.reports.records.reportOf](tui.md#tui.reports.records.reportOf)
      - fn [paramsOf](../../src/tui/reports/records.ts#L44) (request: RequestOf<K>) → string | null <!-- internal -->
        <a id="tui.reports.records.paramsOf"></a><br>The F6 params text of a request, or null when its kind shows none.
        - calls [tui.reports.records.reportOf](tui.md#tui.reports.records.reportOf)
      - fn [recordLabel](../../src/tui/reports/records.ts#L49) (record: OperationRecord) → string
        <a id="tui.reports.records.recordLabel"></a><br>The registry label of a record's action, with its parameters (`Feature readiness · pay`), or its id.
        - calls [tui.reports.records.paramsOf](tui.md#tui.reports.records.paramsOf)
      - fn [recordStatus](../../src/tui/reports/records.ts#L57) (record: OperationRecord) → string
        <a id="tui.reports.records.recordStatus"></a><br>The status of a record for the F6 list: `running…` or `completed · code 0`, and `outdated` once its inputs changed.
      - fn [summaryOf](../../src/tui/reports/records.ts#L65) (record: OperationRecord, result: Done<K>) → string <!-- internal -->
        <a id="tui.reports.records.summaryOf"></a><br>The kind's own summary, falling back to the generic status.
        - calls [tui.reports.records.reportOf](tui.md#tui.reports.records.reportOf), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus)
      - fn [recordSummary](../../src/tui/reports/records.ts#L70) (record: OperationRecord) → string
        <a id="tui.reports.records.recordSummary"></a><br>The status with the domain outcome when there is one: `done · code 0`, `2 gap(s) · code 1`.
        - calls [tui.reports.records.isDone](tui.md#tui.reports.records.isDone), [tui.reports.records.summaryOf](tui.md#tui.reports.records.summaryOf), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus)
      - fn [rowsOf](../../src/tui/reports/records.ts#L77) (state: State, record: OperationRecord, result: Done<K>) → ReportRow[] <!-- internal -->
        <a id="tui.reports.records.rowsOf"></a><br>The kind's rows for a finished result, with the selected item highlighted only while Tab is in the report.
        - calls [tui.reports.records.summaryOf](tui.md#tui.reports.records.summaryOf), [tui.reports.records.reportOf](tui.md#tui.reports.records.reportOf)
      - fn [timeStr](../../src/tui/reports/records.ts#L84) (ms: number) → string <!-- internal -->
        <a id="tui.reports.records.timeStr"></a><br>`HH:MM:SS` in local time.
      - fn [resultsReportRows](../../src/tui/reports/records.ts#L93) (state: State) → ReportRow[]
        <a id="tui.reports.records.resultsReportRows"></a><br>The report rows of the record selected in the F6 panel: its parameters, timings and what its kind shows of the result. Presentation only — the payload in `record.result` carries the domain data.
        - calls [tui.reports.records.timeStr](tui.md#tui.reports.records.timeStr), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus), [tui.reports.records.isDone](tui.md#tui.reports.records.isDone), [tui.reports.records.rowsOf](tui.md#tui.reports.records.rowsOf), [tui.reports.rows.messageRow](tui.md#tui.reports.rows.messageRow)
      - fn [itemsOf](../../src/tui/reports/records.ts#L114) (state: State, result: Done<K>) → ReportItem[] <!-- internal -->
        <a id="tui.reports.records.itemsOf"></a><br>The kind's selectable items, or none.
        - calls [tui.reports.records.reportOf](tui.md#tui.reports.records.reportOf)
      - fn [reportItems](../../src/tui/reports/records.ts#L125) (state: State) → ReportItem[]
        <a id="tui.reports.records.reportItems"></a><br>The items of the selected record the arrows select after Tab: the gaps of a feature record, every result of a check record, the evidence of an explained edge, the places of an explanation, the nodes of an inventory or a batch, the diagnostics of a parse, the symbols of a trace…
        - calls [tui.reports.records.isDone](tui.md#tui.reports.records.isDone), [tui.reports.records.itemsOf](tui.md#tui.reports.records.itemsOf)
      - fn [itemNoun](../../src/tui/reports/records.ts#L132) (kind: OperationRequest["kind"]) → string
        <a id="tui.reports.records.itemNoun"></a><br>What the panel's keys call the items of a kind: `evidence`, `diagnostic`, `node`; `finding` by default.
        - calls [tui.reports.records.reportOf](tui.md#tui.reports.records.reportOf)
    - module [rows](../../src/tui/reports/rows.ts#L1)
      <a id="tui.reports.rows"></a><br>What every report in F6 is made of: rows of text with a style, the kind of operation they show, and the few row shapes most reports share. One module per group of kinds (setup, check, explain, draft, chat) describes its kinds; `records.ts` puts them in one table.
      - operations [operations.operations](operations.md#operations.operations)
      - screen [tui.screen](tui.md#tui.screen)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - type [Kind](../../src/tui/reports/rows.ts#L13) = OperationRequest["kind"]
        <a id="tui.reports.rows.Kind"></a><br>Every operation kind a report can describe.
      - type [RequestOf](../../src/tui/reports/rows.ts#L16) = { [P in K]: Extract<OperationRequest, { kind: P }> }[K]
        <a id="tui.reports.rows.RequestOf"></a><br>The request of one kind.
      - type [Done](../../src/tui/reports/rows.ts#L19)
        <a id="tui.reports.rows.Done"></a><br>A result of one kind that has its payload: what a report shows.
      - type [ReportRow](../../src/tui/reports/rows.ts#L22)
        <a id="tui.reports.rows.ReportRow"></a><br>One row of a report; `gap` is the index of the item Tab and the arrows select on it.
      - type [ReportItem](../../src/tui/reports/rows.ts#L29)
        <a id="tui.reports.rows.ReportItem"></a><br>A place an item of a report opens; `file` is "" for an item with no place in the code. `text` is its whole reason.
      - type [Report](../../src/tui/reports/rows.ts#L40)
        <a id="tui.reports.rows.Report"></a><br>How F6 and the messages show one kind of operation. Presentation only: the payload of `record.result` carries the domain data.
      - type [ReportView](../../src/tui/reports/rows.ts#L54)
        <a id="tui.reports.rows.ReportView"></a><br>What the panel hands every report: the item Tab selected (-1 for none) and the record's summary for the outcome row.
      - fn [outcomeRow](../../src/tui/reports/rows.ts#L72) (text: string, ok: boolean) → ReportRow
        <a id="tui.reports.rows.outcomeRow"></a><br>The outcome row under a report's title: green when the operation did what was asked, red otherwise.
      - fn [codeOf](../../src/tui/reports/rows.ts#L77) (exitCode: 0 | 1 | 2 | null) → string
        <a id="tui.reports.rows.codeOf"></a><br>` · code 1`; nothing for a run with no code (cancelled).
      - fn [messageRow](../../src/tui/reports/rows.ts#L82) (message: OperationMessage) → ReportRow
        <a id="tui.reports.rows.messageRow"></a><br>A message as a report row: an error in red, the rest as written.
      - fn [noticeRow](../../src/tui/reports/rows.ts#L87) (message: OperationMessage) → ReportRow
        <a id="tui.reports.rows.noticeRow"></a><br>A message as a report row with warnings in amber too.
      - fn [textRows](../../src/tui/reports/rows.ts#L92) (title: string, text: string) → ReportRow[]
        <a id="tui.reports.rows.textRows"></a><br>Text as the CLI prints it, under a rule naming where it comes from (`keylang parse · stdout`); the final newline makes no row.
      - fn [shortId](../../src/tui/reports/rows.ts#L101) (id: string | null) → string
        <a id="tui.reports.rows.shortId"></a><br>`abcd1234`, or `none` for a run without a snapshot.
    - module [setup](../../src/tui/reports/setup.ts#L1)
      <a id="tui.reports.setup"></a><br>Reports of the operations that set a repository up and keep its generated files: doctor, map check, map, baseline, agents, init, fmt and wire. Every outcome text says what really happened on disk: a partial write is named as partial and nothing is rolled back.
      - operations [operations.operations](operations.md#operations.operations)
      - state [tui.state](tui.md#tui.state)
      - theme [tui.theme](tui.md#tui.theme)
      - rows [tui.reports.rows](tui.md#tui.reports.rows)
      - type [SetupKind](../../src/tui/reports/setup.ts#L15) <!-- internal -->
        <a id="tui.reports.setup.SetupKind"></a><br>The operation kinds `SETUP_REPORTS` describes.
      - fn [mode](../../src/tui/reports/setup.ts#L18) (check: boolean) → string <!-- internal -->
        <a id="tui.reports.setup.mode"></a><br>`write`, `check`: the mode a setup form ran in.
      - fn [choiceText](../../src/tui/reports/setup.ts#L23) (choice: AgentsRequest["harnesses"]) → string <!-- internal -->
        <a id="tui.reports.setup.choiceText"></a><br>`auto`, `none`, `claude, codex`: the selection as requested.
      - fn [mapTail](../../src/tui/reports/setup.ts#L28) (rows: ReportRow[], payload: MapCheckPayload | MapPayload) → void <!-- internal -->
        <a id="tui.reports.setup.mapTail"></a><br>The map's warnings and its counts, under a map check or a map write.
      - fn [initRows](../../src/tui/reports/setup.ts#L229) (_state: State, record: OperationRecord, result: Done<"init">, view: ReportView) → ReportRow[] <!-- internal -->
        <a id="tui.reports.setup.initRows"></a><br>Init stage by stage, each with what it really did; a partial init is named as partial and nothing is rolled back.
        - calls [tui.reports.rows.outcomeRow](tui.md#tui.reports.rows.outcomeRow), [tui.reports.setup.gitignoreOutcome](tui.md#tui.reports.setup.gitignoreOutcome), [tui.reports.setup.gitignoreFailed](tui.md#tui.reports.setup.gitignoreFailed), [tui.reports.rows.codeOf](tui.md#tui.reports.rows.codeOf), [tui.reports.setup.initStages](tui.md#tui.reports.setup.initStages), [tui.reports.setup.mapOutcome](tui.md#tui.reports.setup.mapOutcome), [tui.reports.setup.baselineOutcome](tui.md#tui.reports.setup.baselineOutcome), [tui.reports.setup.agentsOutcome](tui.md#tui.reports.setup.agentsOutcome)
      - fn [wireOutcome](../../src/tui/reports/setup.ts#L318) (status: OperationRecord["status"], payload: WirePayload, exitCode: 0 | 1 | 2 | null) → string <!-- internal -->
        <a id="tui.reports.setup.wireOutcome"></a><br>`written`, `up to date`, `stale`, `2 error(s) in wiring`, `manual file`, `inputs changed, nothing written`: what wire found and really did.
      - fn [fmtOutcome](../../src/tui/reports/setup.ts#L338) (status: OperationRecord["status"], payload: FmtPayload) → string <!-- internal -->
        <a id="tui.reports.setup.fmtOutcome"></a><br>`3 file(s) canonical`, `2 not formatted`, `1 formatted, 1 invalid`, `1 of 2 formatted, cancelled`: what fmt found and really did.
      - fn [agentsOutcome](../../src/tui/reports/setup.ts#L361) (status: OperationRecord["status"], payload: AgentsPayload) → string <!-- internal -->
        <a id="tui.reports.setup.agentsOutcome"></a><br>`up to date`, `2 stale`, `3 written, 1 removed`, `broken file, nothing written`, `2 of 4 step(s) done, failed`.
      - fn [initOutcome](../../src/tui/reports/setup.ts#L388) (status: OperationRecord["status"], payload: InitPayload) → string <!-- internal -->
        <a id="tui.reports.setup.initOutcome"></a><br>`set up`, `partial: map failed`, `keylang.json not written`, `cancelled after map`, or a check's three stages: never a success for a partial run. A completed write names the stages with their own reports; `.gitignore` is named once it failed or did not run.
        - calls [tui.reports.setup.agentsOutcome](tui.md#tui.reports.setup.agentsOutcome), [tui.reports.setup.baselineOutcome](tui.md#tui.reports.setup.baselineOutcome), [tui.reports.setup.gitignoreOutcome](tui.md#tui.reports.setup.gitignoreOutcome), [tui.reports.setup.initStages](tui.md#tui.reports.setup.initStages), [tui.reports.setup.gitignoreFailed](tui.md#tui.reports.setup.gitignoreFailed)
      - fn [gitignoreOutcome](../../src/tui/reports/setup.ts#L416) (stage: GitignoreStage, check: boolean) → string <!-- internal -->
        <a id="tui.reports.setup.gitignoreOutcome"></a><br>What init's `.gitignore` stage found or did: `lists .keylang/`, `.keylang/ added`, `does not list .keylang/`, a refusal or an I/O error.
      - fn [gitignoreFailed](../../src/tui/reports/setup.ts#L427) (stage: GitignoreStage) → boolean <!-- internal -->
        <a id="tui.reports.setup.gitignoreFailed"></a><br>The stage keeps init from code 0: an I/O error, a refusal, or no `.keylang/` line (a check).
      - fn [initStages](../../src/tui/reports/setup.ts#L432) (payload: InitPayload) → { name: string; result: OperationResult | null }[] <!-- internal -->
        <a id="tui.reports.setup.initStages"></a><br>The stages of an init write, in the order they ran.
      - fn [mapOutcome](../../src/tui/reports/setup.ts#L441) (status: OperationRecord["status"], payload: MapPayload) → string <!-- internal -->
        <a id="tui.reports.setup.mapOutcome"></a><br>`3 written, 1 removed`, `1 conflict(s), nothing written`, `2 of 5 done, failed` — what a map write really did.
      - fn [baselineOutcome](../../src/tui/reports/setup.ts#L459) (status: OperationRecord["status"], payload: BaselinePayload) → string <!-- internal -->
        <a id="tui.reports.setup.baselineOutcome"></a><br>`up to date`, `stale`, `written`, `manual file, nothing written`, `inputs changed, nothing written`.
      - fn [mapCheckOutcome](../../src/tui/reports/setup.ts#L474) (payload: MapCheckPayload) → string <!-- internal -->
        <a id="tui.reports.setup.mapCheckOutcome"></a><br>`up to date`, `3 stale`, `1 conflict(s)` (conflicts first: they block `keylang map`).
  - module [results-panel](../../src/tui/results-panel.ts#L1)
    <a id="tui.results-panel"></a><br>The F6 panel's keys: the pinned current analysis with its findings and filters, and the history of operation records — their reports, the items Tab selects in them, a rerun, an export, a proposal opened in MERGE. A finding's or an item's place is shown with the panel hidden…
    - node [external.node](external.md#external.node)
    - check-results [features.check-results](features.md#features.check-results)
    - operations [operations.operations](operations.md#operations.operations)
    - proposals [features.proposals](features.md#features.proposals)
    - actions [tui.actions](tui.md#tui.actions)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - findings [tui.findings](tui.md#tui.findings)
    - input [tui.input](tui.md#tui.input)
    - check [tui.reports.check](tui.md#tui.reports.check)
    - records [tui.reports.records](tui.md#tui.reports.records)
    - rows [tui.reports.rows](tui.md#tui.reports.rows)
    - state [tui.state](tui.md#tui.state)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - type [ResultsHost](../../src/tui/results-panel.ts#L31)
      <a id="tui.results-panel.ResultsHost"></a><br>What the F6 panel needs from the session: the operations its keys run, and the editor and viewer that show a place.
    - module [ResultsPanel](../../src/tui/results-panel.ts#L58)
      <a id="tui.results-panel.ResultsPanel"></a><br>The key handling of the F6 panel over the session state.
      - fn [constructor](../../src/tui/results-panel.ts#L61) (host: ResultsHost)
        <a id="tui.results-panel.ResultsPanel.constructor"></a>
      - fn [state](../../src/tui/results-panel.ts#L65) () → State <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.state"></a>
      - fn [openResults](../../src/tui/results-panel.ts#L70) () → void
        <a id="tui.results-panel.ResultsPanel.openResults"></a><br>F6 or the palette: the pinned current analysis and the history of operation records.
        - calls [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [closeResults](../../src/tui/results-panel.ts#L89) () → void
        <a id="tui.results-panel.ResultsPanel.closeResults"></a><br>Esc closes the panel, not the running operation; the focus goes back where F6 was pressed.
      - fn [rerunRecord](../../src/tui/results-panel.ts#L98) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.rerunRecord"></a><br>Enter in the panel: reruns the selected record with its exact parameters.
        - calls [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults)
      - fn [resultsKey](../../src/tui/results-panel.ts#L161) (event: KeyEvent) → void
        <a id="tui.results-panel.ResultsPanel.resultsKey"></a><br>While the panel is open its keys stay with it; Tab switches between the entries and the content.
        - calls [tui.results-panel.ResultsPanel.findingsKey](tui.md#tui.results-panel.ResultsPanel.findingsKey), [tui.results-panel.ResultsPanel.state](tui.md#tui.results-panel.ResultsPanel.state), [tui.view.layout](tui.md#tui.view.layout), [tui.view.reportOverflow](tui.md#tui.view.reportOverflow), [tui.reports.records.resultsReportRows](tui.md#tui.reports.records.resultsReportRows), [tui.results-panel.ResultsPanel.scrollReport](tui.md#tui.results-panel.ResultsPanel.scrollReport), [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding), [tui.results-panel.ResultsPanel.showGapReason](tui.md#tui.results-panel.ResultsPanel.showGapReason), [tui.results-panel.ResultsPanel.selectedGap](tui.md#tui.results-panel.ResultsPanel.selectedGap), [tui.results-panel.ResultsPanel.openGap](tui.md#tui.results-panel.ResultsPanel.openGap), [tui.results-panel.ResultsPanel.wireTarget](tui.md#tui.results-panel.ResultsPanel.wireTarget), [tui.results-panel.ResultsPanel.openWireTarget](tui.md#tui.results-panel.ResultsPanel.openWireTarget), [tui.results-panel.ResultsPanel.rerunRecord](tui.md#tui.results-panel.ResultsPanel.rerunRecord), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.results-panel.ResultsPanel.specCodeForGap](tui.md#tui.results-panel.ResultsPanel.specCodeForGap)
      - fn [findingsKey](../../src/tui/results-panel.ts#L264) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.findingsKey"></a><br>The keys of the pinned "Current analysis" entry: the findings list with verdict filters.
        - calls [tui.results-panel.ResultsPanel.state](tui.md#tui.results-panel.ResultsPanel.state), [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout), [tui.results-panel.ResultsPanel.moveFinding](tui.md#tui.results-panel.ResultsPanel.moveFinding), [tui.results-panel.ResultsPanel.openFinding](tui.md#tui.results-panel.ResultsPanel.openFinding), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults), [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [moveFinding](../../src/tui/results-panel.ts#L327) (delta: number) → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.moveFinding"></a><br>Moves the finding selection and keeps it in the visible part of the list.
        - calls [tui.results-panel.ResultsPanel.clampFinding](tui.md#tui.results-panel.ResultsPanel.clampFinding)
      - fn [clampFinding](../../src/tui/results-panel.ts#L333) () → void
        <a id="tui.results-panel.ResultsPanel.clampFinding"></a><br>The finding selection stays within the filtered list, and the list scrolls to keep it in view.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.results-panel.ResultsPanel.state](tui.md#tui.results-panel.ResultsPanel.state), [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout)
      - fn [selectedFinding](../../src/tui/results-panel.ts#L346) () → CheckResult | undefined
        <a id="tui.results-panel.ResultsPanel.selectedFinding"></a><br>The finding selected in the filtered list of the current analysis, if any.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf)
      - fn [openFinding](../../src/tui/results-panel.ts#L356) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openFinding"></a><br>Enter on a finding: the panel hides while the target is shown — a spec position in the editor (the file need not be among the Markdown buffers) or the line in the read-only code viewer. Esc / Ctrl+O return to the list without losing the selection and put back the place it was…
        - calls [tui.results-panel.ResultsPanel.selectedFinding](tui.md#tui.results-panel.ResultsPanel.selectedFinding), [tui.results-panel.ResultsPanel.openTarget](tui.md#tui.results-panel.ResultsPanel.openTarget)
      - fn [openTarget](../../src/tui/results-panel.ts#L363) (file: string, targetLine: number, targetCol: number) → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openTarget"></a><br>Shows a spec position (1-based line, code-point column) or a code line with the F6 panel hidden; the origin is kept for the way back.
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.width.clusterAt](tui.md#tui.width.clusterAt)
      - fn [returnToFindings](../../src/tui/results-panel.ts#L394) () → void
        <a id="tui.results-panel.ResultsPanel.returnToFindings"></a><br>Back from a finding's target: the list with its selection, over the place the finding was opened from.
      - fn [scrollReport](../../src/tui/results-panel.ts#L420) (delta: number) → void
        <a id="tui.results-panel.ResultsPanel.scrollReport"></a><br>↑↓ or a page over the selected report: moves the selected item when the report has items, else scrolls its text.
        - calls [tui.results-panel.ResultsPanel.moveFinding](tui.md#tui.results-panel.ResultsPanel.moveFinding), [tui.results-panel.ResultsPanel.state](tui.md#tui.results-panel.ResultsPanel.state), [tui.reports.records.resultsReportRows](tui.md#tui.reports.records.resultsReportRows), [tui.reports.records.reportItems](tui.md#tui.reports.records.reportItems), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.layout](tui.md#tui.view.layout), [tui.results-panel.ResultsPanel.showGapReason](tui.md#tui.results-panel.ResultsPanel.showGapReason)
      - fn [selectedGap](../../src/tui/results-panel.ts#L449) () → ReportItem | undefined <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.selectedGap"></a><br>The item of the selected report under the Tab selection, if any.
        - calls [tui.results-panel.ResultsPanel.state](tui.md#tui.results-panel.ResultsPanel.state), [tui.reports.records.reportItems](tui.md#tui.reports.records.reportItems)
      - fn [showGapReason](../../src/tui/results-panel.ts#L454) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.showGapReason"></a><br>The report row cuts a long reason; the message line shows the selected item's whole reason.
        - calls [tui.results-panel.ResultsPanel.selectedGap](tui.md#tui.results-panel.ResultsPanel.selectedGap), [tui.results-panel.ResultsPanel.plannedGap](tui.md#tui.results-panel.ResultsPanel.plannedGap)
      - fn [plannedGap](../../src/tui/results-panel.ts#L461) () → string | null <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.plannedGap"></a><br>The ID of the selected gap of a feature report when it is a planned fn no code implements yet, else null.
        - calls [tui.reports.check.featureItems](tui.md#tui.reports.check.featureItems)
      - fn [specCodeForGap](../../src/tui/results-panel.ts#L471) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.specCodeForGap"></a><br>`g` on a planned gap: the spec-to-code form with its ID; the report stays in the history.
        - calls [tui.results-panel.ResultsPanel.plannedGap](tui.md#tui.results-panel.ResultsPanel.plannedGap), [tui.results-panel.ResultsPanel.closeResults](tui.md#tui.results-panel.ResultsPanel.closeResults)
      - fn [openGap](../../src/tui/results-panel.ts#L485) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openGap"></a><br>Enter on a gap or a check result: its file and position, like a finding (Esc / Ctrl+O come back to the report).
        - calls [tui.results-panel.ResultsPanel.selectedGap](tui.md#tui.results-panel.ResultsPanel.selectedGap), [tui.results-panel.ResultsPanel.openTarget](tui.md#tui.results-panel.ResultsPanel.openTarget)
      - fn [wireTarget](../../src/tui/results-panel.ts#L492) () → { file: string; line: number; col: number } | null <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.wireTarget"></a><br>What Enter over the selected wire report opens: the first blocking error, else the generated file when it is on disk.
      - fn [openWireTarget](../../src/tui/results-panel.ts#L504) () → void <!-- internal -->
        <a id="tui.results-panel.ResultsPanel.openWireTarget"></a><br>The generated code opens in the read-only viewer, not as a writable buffer; Esc / Ctrl+O come back to the report.
        - calls [tui.results-panel.ResultsPanel.wireTarget](tui.md#tui.results-panel.ResultsPanel.wireTarget), [tui.results-panel.ResultsPanel.openTarget](tui.md#tui.results-panel.ResultsPanel.openTarget)
  - module [screen](../../src/tui/screen.ts#L1)
    <a id="tui.screen"></a><br>A frame of the terminal as a grid of cells, and the ANSI that turns one frame into the next. Views draw into a `Grid`; only changed rows are sent, so the same output works on a real terminal and on xterm.js in a browser.
    - width [tui.width](tui.md#tui.width)
    - type [Color](../../src/tui/screen.ts#L12) = number
      <a id="tui.screen.Color"></a><br>256-colour palette index.
    - type [Style](../../src/tui/screen.ts#L15)
      <a id="tui.screen.Style"></a><br>How one cell is drawn: 256-colour indices, emphasis and an optional hyperlink.
    - type [Cell](../../src/tui/screen.ts#L27) <!-- internal -->
      <a id="tui.screen.Cell"></a><br>One grid position in the terminal screen buffer: a single grapheme string paired with a `Style`. The grapheme is left empty for the trailing half of a double-width character. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [Grid](../../src/tui/screen.ts#L36)
      <a id="tui.screen.Grid"></a><br>The cells of one frame; writes clip to its bounds and keep wide characters whole.
      - fn [constructor](../../src/tui/screen.ts#L43) (cols: number, rows: number)
        <a id="tui.screen.Grid.constructor"></a><br>Clamps the requested width and height to at least 1 and allocates a rows-by-cols matrix of cells, each initialized to a space character with the `PLAIN` style. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [write](../../src/tui/screen.ts#L50) (x: number, y: number, text: string, style: Style = PLAIN, limit = this.cols - x) → number
        <a id="tui.screen.Grid.write"></a><br>Writes `text` from (x, y), clipped to `limit` cells; returns the cells used.
        - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [fill](../../src/tui/screen.ts#L83) (x: number, y: number, width: number, height: number, style: Style = PLAIN) → void
        <a id="tui.screen.Grid.fill"></a><br>Fills a rectangle with spaces in `style`, clipped to the grid.
        - calls [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [clearWide](../../src/tui/screen.ts#L93) (col: number, row: number) → void <!-- internal -->
        <a id="tui.screen.Grid.clearWide"></a><br>A wide character split by an overwrite leaves no half behind.
      - fn [lines](../../src/tui/screen.ts#L102) () → string[]
        <a id="tui.screen.Grid.lines"></a><br>Plain text of each row, trailing spaces kept.
      - fn [styleAt](../../src/tui/screen.ts#L107) (x: number, y: number) → Style
        <a id="tui.screen.Grid.styleAt"></a><br>The style of one cell (tests check colours and emphasis this way).
      - fn [row](../../src/tui/screen.ts#L112) (y: number) → readonly Cell[]
        <a id="tui.screen.Grid.row"></a><br>The cells of row `y`; an empty row past the grid.
    - fn [drawBox](../../src/tui/screen.ts#L121) (grid: Grid, rect: { x: number; y: number; width: number; height: number }, title: string, style: Style, titleStyle: Style, round = false) → void
      <a id="tui.screen.drawBox"></a><br>A box over the grid: filled with `style`, framed, its title on the top edge. `round` corners (`╭╮╰╯`) are the clip's window; the popups are square.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [sgr](../../src/tui/screen.ts#L141) (style: Style) → string <!-- internal -->
      <a id="tui.screen.sgr"></a><br>The SGR sequence for a style; it starts from reset (`0`), so no attribute leaks from the previous cell.
    - fn [safeLink](../../src/tui/screen.ts#L169) (link: string | undefined) → string | undefined
      <a id="tui.screen.safeLink"></a><br>An OSC 8 target that is safe to send: a control character (ESC, BEL, C1) would end the sequence early and let the rest of a URL from a spec reach the terminal as its own escape sequence. Such a link is dropped.
    - fn [sameStyle](../../src/tui/screen.ts#L176) (a: Style, b: Style) → boolean <!-- internal -->
      <a id="tui.screen.sameStyle"></a><br>Equal styles draw the same; an absent flag and `false` are the same.
    - fn [rowEqual](../../src/tui/screen.ts#L181) (a: readonly Cell[], b: readonly Cell[]) → boolean <!-- internal -->
      <a id="tui.screen.rowEqual"></a><br>Rows with the same characters and styles; such a row is not sent again.
      - calls [tui.screen.sameStyle](tui.md#tui.screen.sameStyle)
    - fn [renderDiff](../../src/tui/screen.ts#L190) (prev: Grid | null, next: Grid) → string
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
    - type [Mode](../../src/tui/state.ts#L21) = "view" | "edit" | "read" | "code" | "merge" | "zoom"
      <a id="tui.state.Mode"></a><br>What the editor area shows: the spec (view/edit), reading mode, code, a merge, or the zoom screen.
    - type [Focus](../../src/tui/state.ts#L24) = "editor" | "nav" | "files" | "context" | "results"
      <a id="tui.state.Focus"></a><br>Which part of the screen takes the keys.
    - type [Cursor](../../src/tui/state.ts#L27)
      <a id="tui.state.Cursor"></a><br>A position in a buffer.
    - type [Buffer](../../src/tui/state.ts#L35)
      <a id="tui.state.Buffer"></a><br>One open file: its text, what is saved, and the state of saving and undo.
    - type [Hover](../../src/tui/state.ts#L62)
      <a id="tui.state.Hover"></a><br>The hover popup: where it is anchored and its lines.
    - type [CodeView](../../src/tui/state.ts#L72)
      <a id="tui.state.CodeView"></a><br>The built-in code viewer on one source file.
    - type [MergeState](../../src/tui/state.ts#L83)
      <a id="tui.state.MergeState"></a><br>A merge in progress: the base, the hunks of the proposed version, and the decision on each.
    - type [LastMerge](../../src/tui/state.ts#L109)
      <a id="tui.state.LastMerge"></a><br>What the last merge changed, so `u` in the view can undo it while nothing changed since.
    - type [Prompt](../../src/tui/state.ts#L127)
      <a id="tui.state.Prompt"></a><br>The open prompt: the palette, a search, a picker, or an operation form; its kind decides which fields are set.
    - type [C4Form](../../src/tui/state.ts#L193)
      <a id="tui.state.C4Form"></a><br>The choices of `export c4 [--format] [--level] [--layer]` (c4-zoom/12).
    - type [ExplainPlanForm](../../src/tui/state.ts#L207)
      <a id="tui.state.ExplainPlanForm"></a><br>The inventory form: the stale and gone saved explanations, or the plan of a brief batch (`missing` also plans stale briefs) with its estimate. The limit and the jobs are kept as typed and checked as the CLI checks them.
    - type [SpecCodeForm](../../src/tui/state.ts#L214)
      <a id="tui.state.SpecCodeForm"></a><br>The fields of `spec-to-code <id> [--into] [--mode]`, and whether it proposes or only previews.
    - type [CodeDraftForm](../../src/tui/state.ts#L230)
      <a id="tui.state.CodeDraftForm"></a><br>The fields of `code-to-spec <path[:line]> | --since <ref> [--into] [--mode]` and whether it proposes or only previews. `source` picks the fields the request takes: the other source's fields stay as typed but are never sent.
    - type [RulesDraftForm](../../src/tui/state.ts#L245)
      <a id="tui.state.RulesDraftForm"></a><br>The fields of `draft rules [--into] [--mode]` and whether it proposes or only previews.
    - type [DraftForm](../../src/tui/state.ts#L253)
      <a id="tui.state.DraftForm"></a><br>The fields of `draft flow <trigger> [--name] [--into] [--mode]` and whether it proposes or only previews.
    - type [ExportForm](../../src/tui/state.ts#L267)
      <a id="tui.state.ExportForm"></a><br>The export form of one finished report. `expect` is the target as the form last showed it (null: absent); Save sends it, so a file changed after that is a conflict, never overwritten. `problem` is why Save is refused now.
    - type [SpecKind](../../src/tui/state.ts#L281) = "flow" | "rules" | "wiring" | "feature" | "blank"
      <a id="tui.state.SpecKind"></a><br>The kinds of a new specification: its first text follows the kind (design §2.8).
    - type [NewSpecForm](../../src/tui/state.ts#L284)
      <a id="tui.state.NewSpecForm"></a><br>The new-spec form while it is open.
    - type [OperationRecord](../../src/tui/state.ts#L293)
      <a id="tui.state.OperationRecord"></a><br>A run of one explicit operation in this session, kept in memory for F6 (design §2.6).
    - type [QuitStep](../../src/tui/state.ts#L323)
      <a id="tui.state.QuitStep"></a><br>`q` or Ctrl+C while an explicit operation runs (design §5): Stay, or Cancel and exit. `waiting`: Cancel and exit was chosen and the operation is finishing its current file step; once it settles, the usual question about unsaved buffers is asked again — the cancel is no leave to…
    - type [SaveBarrier](../../src/tui/state.ts#L336)
      <a id="tui.state.SaveBarrier"></a><br>The step before an operation that reads the disk (design §2.5): the dirty spec and config buffers it would not see, and what it would write. Save and continue writes them in order and starts the operation only when every write succeeded; Back writes nothing. `error` names the…
    - type [ConfigState](../../src/tui/state.ts#L357)
      <a id="tui.state.ConfigState"></a><br>How the session found `keylang.json` on disk. The analysis always reads the saved file; an unsaved config buffer never takes effect.
    - type [Place](../../src/tui/state.ts#L365)
      <a id="tui.state.Place"></a><br>A place to jump back to: a file, a cursor and a mode.
    - type [ZoomState](../../src/tui/state.ts#L375)
      <a id="tui.state.ZoomState"></a><br>The zoom screen (c4-zoom/07): the map one level at a time. Lives only in the session; leaving it drops nothing on disk.
    - type [State](../../src/tui/state.ts#L393)
      <a id="tui.state.State"></a><br>Everything one session shows and edits.
    - type [FeatureLine](../../src/tui/state.ts#L502)
      <a id="tui.state.FeatureLine"></a><br>Where a feature file stands, for the status line and what the clip's model reads.
  - module [terminal](../../src/tui/terminal.ts#L1)
    <a id="tui.terminal"></a><br>`keylang` in a terminal: raw stdin, the alternate screen, SGR mouse, and `$VISUAL` / `$EDITOR` for jumps into code. The screen is restored on every exit path, including a crash, and `runTerminal` then returns a contract exit code to `main` (0 for a quit or a signal, 2 for a…
    - node [external.node](external.md#external.node)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - screen [tui.screen](tui.md#tui.screen)
    - fn [editorCommand](../../src/tui/terminal.ts#L22) (env: NodeJS.ProcessEnv, file: string, line: number) → { command: string; args: string[]; wait: boolean } | null
      <a id="tui.terminal.editorCommand"></a><br>How to open `file` at `line` with the configured editor, or null without one.
      - calls [tui.terminal.splitCommand](tui.md#tui.terminal.splitCommand)
    - fn [splitCommand](../../src/tui/terminal.ts#L45) (value: string, exists: (path: string) => boolean = existsSync) → string[]
      <a id="tui.terminal.splitCommand"></a><br>Words of a `$EDITOR` value the way a shell splits them: quotes and backslashes keep spaces (`"/opt/My Editor/bin/edit" -w`). An unquoted value that names an existing file is one word, so a path with spaces works as is.
    - type [TerminalInput](../../src/tui/terminal.ts#L77)
      <a id="tui.terminal.TerminalInput"></a><br>The terminal's input: a TTY in raw mode, or a stand-in in a test.
    - type [TerminalOutput](../../src/tui/terminal.ts#L88)
      <a id="tui.terminal.TerminalOutput"></a><br>The terminal's output: its size, writes, and resize events.
    - type [TerminalSignal](../../src/tui/terminal.ts#L97)
      <a id="tui.terminal.TerminalSignal"></a><br>The signals the session reacts to.
    - type [TerminalHost](../../src/tui/terminal.ts#L100)
      <a id="tui.terminal.TerminalHost"></a><br>What the terminal session needs from its process; `processHost()` is the real one.
    - fn [processHost](../../src/tui/terminal.ts#L118) () → TerminalHost
      <a id="tui.terminal.processHost"></a><br>The real process as a `TerminalHost`.
    - fn [runTerminal](../../src/tui/terminal.ts#L142) (root: string, host: TerminalHost = processHost(), session: Pick<AppOptions, "operations" | "operationWorker"> = {}) → Promise<number>
      <a id="tui.terminal.runTerminal"></a><br>`session`: the operation runner or worker the session uses instead of its own (tests hold an operation with it).
      - calls [tui.terminal.processHost](tui.md#tui.terminal.processHost), [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [tui.app.App](tui.md#tui.app.App), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.input](tui.md#tui.app.App.input), [tui.app.App.resize](tui.md#tui.app.App.resize), [tui.app.App.detach](tui.md#tui.app.App.detach), [base.config.toPosix](base.md#base.config.toPosix), [tui.terminal.editorCommand](tui.md#tui.terminal.editorCommand), [tui.app.App.attach](tui.md#tui.app.App.attach), [tui.app.App.close](tui.md#tui.app.App.close), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
  - module [text-to-spec](../../src/tui/text-to-spec.ts#L1)
    <a id="tui.text-to-spec"></a><br>`Ctrl+G`: free text → keylang items, deterministically (no LLM). Clauses that start with `when`/`if` become `when` (with a nested `then` for the `then` part), `emits x` becomes `emits`, an `invariant: …` becomes `invariant`, and a clause that names a known ID — or the last…
    - fn [clauses](../../src/tui/text-to-spec.ts#L31) (text: string) → string[] <!-- internal -->
      <a id="tui.text-to-spec.clauses"></a><br>Sentences of the text. A line break inside a paragraph is a wrapped line, not a clause boundary; a blank line is.
    - fn [idIn](../../src/tui/text-to-spec.ts#L42) (clause: string, known: readonly string[], callables: readonly string[]) → string | null <!-- internal -->
      <a id="tui.text-to-spec.idIn"></a><br>A known ID named in a clause: a dotted ID, else a word that is the last segment of exactly one callable.
    - fn [textToSpec](../../src/tui/text-to-spec.ts#L63) (text: string, indent: number, known: readonly string[], callables: readonly string[]) → string[]
      <a id="tui.text-to-spec.textToSpec"></a><br>Items for the text, indented under `indent` spaces. `known` are IDs of the snapshot and `planned` declarations; `callables` the functions among them.
      - calls [tui.text-to-spec.clauses](tui.md#tui.text-to-spec.clauses), [tui.text-to-spec.thenItems](tui.md#tui.text-to-spec.thenItems), [tui.text-to-spec.idIn](tui.md#tui.text-to-spec.idIn)
    - fn [thenItems](../../src/tui/text-to-spec.ts#L118) (text: string, pad: string, known: readonly string[], callables: readonly string[], underWhen: boolean) → string[] <!-- internal -->
      <a id="tui.text-to-spec.thenItems"></a><br>The items for a `then` part: an event, else a step, else (only under a `when`) the text itself as `then`.
      - calls [tui.text-to-spec.idIn](tui.md#tui.text-to-spec.idIn)
  - module [theme](../../src/tui/theme.ts#L1)
    <a id="tui.theme"></a><br>Colours of the TUI (256-colour palette) and the per-line highlight of raw keylang Markdown: keywords, declared names and references coloured by the layer their ID starts with, code links, comments, headings, code fences. Layer: TUI drawing. `view.ts` applies `highlight` to the…
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - screen [tui.screen](tui.md#tui.screen)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - fn [idStyle](../../src/tui/theme.ts#L53) (id: string, layers: readonly string[]) → Style
      <a id="tui.theme.idStyle"></a><br>Colour of an ID by the layer it starts with, in the order of `keylang.json`.
    - type [Run](../../src/tui/theme.ts#L64)
      <a id="tui.theme.Run"></a><br>A styled run on one line: code-point columns `[start, end)`, 0-based.
    - fn [highlight](../../src/tui/theme.ts#L71) (doc: Document | null, text: string, layers: readonly string[]) → Map<number, Run[]>
      <a id="tui.theme.highlight"></a><br>Highlight runs by 1-based line; later runs win where they overlap.
      - calls [tui.theme.idStyle](tui.md#tui.theme.idStyle), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
  - module [tree-stamp](../../src/tui/tree-stamp.ts#L1)
    <a id="tui.tree-stamp"></a><br>The state of what an analysis read, as one string: the size and modification time of each file it read (sources, specs, keylang.json, the manifests, test reports and traces) and of each directory they lie in — a file added or removed changes its directory's time. Equal stamps…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - schema-discover [map.schema-discover](map.md#map.schema-discover)
    - fn [inputsOf](../../src/tui/tree-stamp.ts#L22) (done: Analysis) → string[]
      <a id="tui.tree-stamp.inputsOf"></a><br>The files an analysis read, relative to the root, and their directories.
      - calls [map.schema-discover.schemaFiles](map.md#map.schema-discover.schemaFiles), [base.config.evidenceFiles](base.md#base.config.evidenceFiles)
    - fn [stampOf](../../src/tui/tree-stamp.ts#L65) (root: string, inputs: readonly string[]) → string
      <a id="tui.tree-stamp.stampOf"></a><br>A sha256 over the size and mtime of each input under `root`; a missing path hashes as `-`, so its appearance changes the stamp too.
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
    - type [Rect](../../src/tui/view.ts#L35)
      <a id="tui.view.Rect"></a><br>A rectangle of cells on the grid, 0-based.
    - type [Layout](../../src/tui/view.ts#L43)
      <a id="tui.view.Layout"></a><br>Where each part of the frame goes for the current size and panel toggles.
    - fn [layout](../../src/tui/view.ts#L73) (state: Pick<State, "cols" | "rows" | "showFiles" | "showNav"> & { context?: State["context"]; focus?: State["focus"]; lastPanel?: State["lastPanel"] }) → Layout
      <a id="tui.view.layout"></a><br>The frame's layout: the body sits between the title row and the detail and status rows.
    - type [EditorRow](../../src/tui/view.ts#L107)
      <a id="tui.view.EditorRow"></a><br>One editor row: a text line, or the expanded evidence row under the cursor line.
    - fn [lineCount](../../src/tui/view.ts#L110) (buffer: Buffer) → number
      <a id="tui.view.lineCount"></a><br>Number of lines in the buffer.
      - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
    - fn [gutterWidth](../../src/tui/view.ts#L115) (buffer: Buffer) → number
      <a id="tui.view.gutterWidth"></a><br>Gutter cells: the mark and a space, the line number (at least 3 digits), then a space.
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount)
    - fn [editorRows](../../src/tui/view.ts#L120) (state: State, buffer: Buffer, height: number) → EditorRow[]
      <a id="tui.view.editorRows"></a><br>Rows shown from `top`: the cursor line gets an evidence row below it when it has evidence.
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf)
    - fn [drawRuns](../../src/tui/view.ts#L140) (grid: Grid, x: number, y: number, width: number, clusters: Iterable<{ cluster: string; point: number }>, runs: readonly Run[], base: Style) → void <!-- internal -->
      <a id="tui.view.drawRuns"></a><br>Draws clusters with their code-point positions until `width` cells are used; a cluster (a letter with its marks, a ZWJ emoji) takes the style of its first code point. Only what fits is visited, however long the line.
      - calls [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [fromLayout](../../src/tui/view.ts#L155) (line: LineLayout, from: number) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromLayout"></a><br>The clusters of a laid-out line from cluster `from` on.
    - fn [fromText](../../src/tui/view.ts#L160) (text: string) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromText"></a><br>The clusters of `text` from the start, segmented only as far as they are read.
      - calls [tui.width.clusters](tui.md#tui.width.clusters)
    - fn [cellsBetween](../../src/tui/view.ts#L170) (line: LineLayout, from: number, to: number) → number <!-- internal -->
      <a id="tui.view.cellsBetween"></a><br>Cells between clusters `from` and `to` of a laid-out line (0 when `to` is before `from`).
    - type [StyledGlyph](../../src/tui/view.ts#L177) <!-- internal -->
      <a id="tui.view.StyledGlyph"></a><br>A glyph in the gutter or a panel row, with its style.
    - type [PanelEntry](../../src/tui/view.ts#L183) <!-- internal -->
      <a id="tui.view.PanelEntry"></a><br>A row of a side panel: its text, its mark at the right edge, and its own style over the panel's.
    - fn [dimmedIf](../../src/tui/view.ts#L190) (style: Style, dim: boolean) → Style <!-- internal -->
      <a id="tui.view.dimmedIf"></a><br>A style dimmed for evidence that is stale.
    - fn [markCell](../../src/tui/view.ts#L195) (item: LineEvidence | undefined, stale: boolean) → StyledGlyph <!-- internal -->
      <a id="tui.view.markCell"></a><br>The gutter glyph of a line's evidence; stale evidence is dimmed and not bold.
    - fn [isChannel](../../src/tui/view.ts#L203) (criterion: string) → criterion is (typeof CHANNELS)[number] <!-- internal -->
      <a id="tui.view.isChannel"></a><br>One of the evidence channels a flow step reports separately.
    - fn [detailText](../../src/tui/view.ts#L211) (item: LineEvidence, snapshotId: string | null) → { text: string; style: Style }[]
      <a id="tui.view.detailText"></a><br>`ID ✓ static ✓ tests — trace ◌ …`: the channels of a line, never merged into one mark.
      - calls [tui.view.isChannel](tui.md#tui.view.isChannel)
    - fn [lineMessage](../../src/tui/view.ts#L240) (item: LineEvidence | undefined) → { text: string; style: Style } | null
      <a id="tui.view.lineMessage"></a><br>The message for the cursor line: the first failing or unverified finding, with a fix hint.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [runsOf](../../src/tui/view.ts#L265) (buffer: Buffer, layers: readonly string[]) → Map<number, Run[]> <!-- internal -->
      <a id="tui.view.runsOf"></a><br>Highlight runs of a buffer, cached by its parsed document and the layers.
      - calls [tui.theme.highlight](tui.md#tui.theme.highlight)
    - fn [drawEditor](../../src/tui/view.ts#L280) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawEditor"></a><br>Draws the buffer in the editor rect: gutter, highlighted text, the detail row, ghost text and the cursor.
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.runsOf](tui.md#tui.view.runsOf), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.detailText](tui.md#tui.view.detailText), [tui.view.dimmedIf](tui.md#tui.view.dimmedIf), [tui.view.markCell](tui.md#tui.view.markCell), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromLayout](tui.md#tui.view.fromLayout), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - type [ReadLayout](../../src/tui/view.ts#L338) <!-- internal -->
      <a id="tui.view.ReadLayout"></a><br>The rendered rows of a buffer per text and width, and the first row of each source line: a frame asks for them more than once.
    - fn [readLayout](../../src/tui/view.ts#L347) (buffer: Buffer, width: number) → ReadLayout <!-- internal -->
      <a id="tui.view.readLayout"></a><br>The reading-mode layout of a buffer at `width`, cached.
      - calls [tui.markdown.renderMarkdown](tui.md#tui.markdown.renderMarkdown)
    - fn [readRows](../../src/tui/view.ts#L364) (state: State, buffer: Buffer, rect: Rect) → ReadLayout & { cursorRow: number; top: number } <!-- internal -->
      <a id="tui.view.readRows"></a><br>Reading mode: the rendered rows, the first row of each source line, the row of the cursor line, and the first row shown.
      - calls [tui.view.readLayout](tui.md#tui.view.readLayout)
    - fn [readCursorRow](../../src/tui/view.ts#L376) (state: State, buffer: Buffer, rect: Rect) → number
      <a id="tui.view.readCursorRow"></a><br>The screen row (from the editor's top) where reading mode shows the cursor line: popups anchor there.
      - calls [tui.view.readRows](tui.md#tui.view.readRows)
    - fn [drawRead](../../src/tui/view.ts#L383) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawRead"></a><br>Draws reading mode: rendered Markdown with gutter marks on each source line's first row.
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.readRows](tui.md#tui.view.readRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.markCell](tui.md#tui.view.markCell), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawCode](../../src/tui/view.ts#L408) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawCode"></a><br>Draws the read-only code viewer: a title row with the file link, then highlighted lines with the target marked `▶`.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.code-highlight.highlightCode](tui.md#tui.code-highlight.highlightCode), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromText](tui.md#tui.view.fromText)
    - fn [zoomListHeight](../../src/tui/view.ts#L435) (state: Pick<State, "rows">, rect: Rect) → number
      <a id="tui.view.zoomListHeight"></a><br>Rows the list of the zoom screen has in `rect`.
    - fn [originText](../../src/tui/view.ts#L446) (e: NodeExplanation) → string <!-- internal -->
      <a id="tui.view.originText"></a><br>Where an explanation's words come from, as the nav panel says it.
      - calls [map.explanations.modelName](map.md#map.explanations.modelName)
    - fn [fitCrumbs](../../src/tui/view.ts#L453) (labels: readonly string[], width: number) → string
      <a id="tui.view.fitCrumbs"></a><br>Crumbs that fit `width`: the nearest levels kept, the farthest cut first behind `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - type [ZoomRowText](../../src/tui/view.ts#L464)
      <a id="tui.view.ZoomRowText"></a><br>A row of the zoom screen: its text, and what stands at its right edge.
    - fn [zoomRowText](../../src/tui/view.ts#L470) (state: State, row: ZoomRow, width: number, overlay: FlowOverlay | null = null) → ZoomRowText
      <a id="tui.view.zoomRowText"></a><br>The text of a zoom row: zoom mark, kind, name, distance, and the brief when there is room.
      - calls [tui.zoom.circled](tui.md#tui.zoom.circled), [tui.view.stepsMark](tui.md#tui.view.stepsMark), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [endLabel](../../src/tui/view.ts#L493) (focus: string, id: string) → string <!-- internal -->
      <a id="tui.view.endLabel"></a><br>An end of an edge row as the level names it: a child by its name under the focus, anything else by its ID.
    - fn [zoomEdgeText](../../src/tui/view.ts#L498) (focus: string, edge: ZoomEdge, walked = false) → ZoomRowText
      <a id="tui.view.zoomEdgeText"></a><br>The text of an edges-view row: group, `from → to`, the kinds with counts, and the count.
      - calls [tui.view.endLabel](tui.md#tui.view.endLabel)
    - fn [stepsMark](../../src/tui/view.ts#L512) (overlay: FlowOverlay, steps: readonly number[]) → Mark | null <!-- internal -->
      <a id="tui.view.stepsMark"></a><br>The worst gutter mark of the steps a row stands for: the same marks the flow's lines have.
      - calls [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [flowSequence](../../src/tui/view.ts#L521) (overlay: FlowOverlay) → string
      <a id="tui.view.flowSequence"></a><br>The layers a flow walks, in the order its steps are written: `cli ① → map ②–④`.
      - calls [tui.zoom.circled](tui.md#tui.zoom.circled)
    - type [ZoomButton](../../src/tui/view.ts#L526)
      <a id="tui.view.ZoomButton"></a><br>A clickable part of the zoom screen's header row (c4-zoom/10): what it does and where it is.
    - type [ZoomButtonRow](../../src/tui/view.ts#L534)
      <a id="tui.view.ZoomButtonRow"></a><br>The zoom screen's header row and the buttons on it.
    - fn [zoomButtons](../../src/tui/view.ts#L545) (zoom: { depth: number; view: "nodes" | "edges"; flow: string | null }, width: number) → ZoomButtonRow
      <a id="tui.view.zoomButtons"></a><br>The header's buttons, right-aligned, and their text: `[−] [+] [depth N ▾▴] [c edges] [f flow ▾]`. Each does what its key does; the crumbs get what is left of the row, so on a narrow terminal the crumbs are cut, never a button. `▾` and `▴` are buttons of their own inside the…
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawZoom](../../src/tui/view.ts#L582) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawZoom"></a><br>The zoom screen (c4-zoom/07): crumbs and depth, what the focus is with where the words come from, then the level's rows — children, then the neighbors with their distance — the selected one highlighted.
      - calls [tui.zoom.zoomLevel](tui.md#tui.zoom.zoomLevel), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.zoom.flowOverlay](tui.md#tui.zoom.flowOverlay), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.zoomButtons](tui.md#tui.view.zoomButtons), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.fitCrumbs](tui.md#tui.view.fitCrumbs), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.view.wordRows](tui.md#tui.view.wordRows), [tui.view.originText](tui.md#tui.view.originText), [tui.view.flowSequence](tui.md#tui.view.flowSequence), [tui.view.zoomListHeight](tui.md#tui.view.zoomListHeight), [tui.zoom.zoomEdges](tui.md#tui.zoom.zoomEdges), [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey), [tui.view.zoomEdgeText](tui.md#tui.view.zoomEdgeText), [tui.view.zoomRowText](tui.md#tui.view.zoomRowText), [tui.view.stepsMark](tui.md#tui.view.stepsMark)
    - fn [drawMerge](../../src/tui/view.ts#L663) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawMerge"></a><br>The merge view: a title with the decision counts, then the diff rows with the current hunk marked `▌`.
      - calls [tui.merge.mergeRows](tui.md#tui.merge.mergeRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawPanelList](../../src/tui/view.ts#L695) (grid: Grid, rect: Rect, title: string, entries: PanelEntry[], selected: number, focused: boolean, top: number) → void <!-- internal -->
      <a id="tui.view.drawPanelList"></a><br>A side panel: a title row, then entries from `top` with the selection highlighted (brighter when focused) and marks at the right edge.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [navEntries](../../src/tui/view.ts#L718) (state: State) → NavItem[]
      <a id="tui.view.navEntries"></a><br>The navigation panel's items as the analysis and the expanded keys give them.
      - calls [tui.nav.navItems](tui.md#tui.nav.navItems)
    - fn [navNote](../../src/tui/view.ts#L730) (state: State, width: number) → string[]
      <a id="tui.view.navNote"></a><br>The explanation of the node selected in the nav panel, wrapped to `width` cells with its origin (`code`, or `llm · model · date`, `stale`); none for a node without one or an item that is no node.
      - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.view.wordRows](tui.md#tui.view.wordRows)
    - fn [wordRows](../../src/tui/view.ts#L747) (text: string, width: number) → string[] <!-- internal -->
      <a id="tui.view.wordRows"></a><br>An explanation as rows of `width` cells: its whitespace, line breaks included, one space between words; no words, no rows.
      - calls [tui.width.wrapCells](tui.md#tui.width.wrapCells)
    - fn [navListHeight](../../src/tui/view.ts#L754) (state: State, rect: Rect) → number
      <a id="tui.view.navListHeight"></a><br>Rows of the nav panel's list: what the explanation of the selected node leaves.
      - calls [tui.view.navNote](tui.md#tui.view.navNote)
    - fn [drawNav](../../src/tui/view.ts#L761) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawNav"></a><br>The navigation panel: the tree rows, and the explanation of the selected node under a rule at the bottom.
      - calls [tui.view.navNote](tui.md#tui.view.navNote), [tui.view.navListHeight](tui.md#tui.view.navListHeight), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList)
    - fn [drawContext](../../src/tui/view.ts#L794) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawContext"></a><br>What goes to the model: kind, label and tokens per item; `◇` planned, `?` incomplete data.
      - calls [features.agent-context.contextPack](features.md#features.agent-context.contextPack), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.contextTop](tui.md#tui.view.contextTop)
    - fn [contextTop](../../src/tui/view.ts#L808) (index: number, rect: Rect) → number
      <a id="tui.view.contextTop"></a><br>First item shown in the context panel: the list scrolls to keep the selected item in view. A click maps rows the same way.
    - fn [drawFiles](../../src/tui/view.ts#L813) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawFiles"></a><br>The file panel: each file with `+` when unsaved and `≈` when a proposal waits for it; the open one bold.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.filesTop](tui.md#tui.view.filesTop)
    - fn [filesTop](../../src/tui/view.ts#L830) (state: Pick<State, "filesIndex">, rect: Rect) → number
      <a id="tui.view.filesTop"></a><br>First file shown in the panel: the list scrolls to keep the selected file in view. A click maps rows the same way.
    - type [ResultsSplit](../../src/tui/view.ts#L837)
      <a id="tui.view.ResultsSplit"></a><br>Rows of the F6 panel: the entries list and the report under it.
    - fn [resultsSplit](../../src/tui/view.ts#L843) (state: State, height: number) → ResultsSplit
      <a id="tui.view.resultsSplit"></a><br>How the F6 panel splits: the entries list on top, the content of the selected entry below.
    - fn [findingStateRow](../../src/tui/view.ts#L855) (state: State) → string | null
      <a id="tui.view.findingStateRow"></a><br>Why the shown analysis is not a plain current check: a failed run, an update in flight, changes since the analysis, or unsaved buffers taken as overlay.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.view.configNote](tui.md#tui.view.configNote)
    - fn [findingDetailRows](../../src/tui/view.ts#L887) (state: State, width: number) → string[]
      <a id="tui.view.findingDetailRows"></a><br>The details of the selected finding, wrapped to `width`: its full message (the list row cuts it) and then criterion, provenance, snapshot and reason; without a selection, why the list is empty. Always the same number of rows, so the list does not jump while the selection moves.
      - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.view.padRows](tui.md#tui.view.padRows), [tui.view.clipRows](tui.md#tui.view.clipRows), [tui.width.wrapCells](tui.md#tui.width.wrapCells), [tui.findings.findingDetailText](tui.md#tui.findings.findingDetailText)
    - fn [clipRows](../../src/tui/view.ts#L902) (rows: string[], count: number, width: number) → string[] <!-- internal -->
      <a id="tui.view.clipRows"></a><br>The first `count` rows; a cut ends with `…`.
      - calls [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [padRows](../../src/tui/view.ts#L907) (rows: string[]) → string[] <!-- internal -->
      <a id="tui.view.padRows"></a><br>Rows padded with empty ones to the fixed detail height.
    - fn [findingsListRows](../../src/tui/view.ts#L912) (state: State, rect: Rect) → number
      <a id="tui.view.findingsListRows"></a><br>Rows the findings list takes inside the panel `rect`: the counts, the state and the details of the selected finding come first.
      - calls [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow)
    - fn [drawResults](../../src/tui/view.ts#L920) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawResults"></a><br>The F6 panel over the editor area: the entries on top, the content of the selected entry below.
      - calls [tui.reports.records.reportItems](tui.md#tui.reports.records.reportItems), [tui.reports.records.itemNoun](tui.md#tui.reports.records.itemNoun), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [tui.actions.exportRecord](tui.md#tui.actions.exportRecord), [tui.view.reportOverflow](tui.md#tui.view.reportOverflow), [tui.reports.records.resultsReportRows](tui.md#tui.reports.records.resultsReportRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.reports.records.recordLabel](tui.md#tui.reports.records.recordLabel), [tui.reports.records.recordStatus](tui.md#tui.reports.records.recordStatus), [tui.view.drawFindings](tui.md#tui.view.drawFindings), [tui.width.sliceCells](tui.md#tui.width.sliceCells)
    - fn [reportOverflow](../../src/tui/view.ts#L1026) (rows: readonly { text: string }[], width: number) → number
      <a id="tui.view.reportOverflow"></a><br>How far ←→ can scroll the report: until the widest row ends in view. A scrolled row starts with `…` in a cell of its own (`sliceCells`), so that is one cell more than the row exceeds `width` by; 0 when every row fits.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawFindings](../../src/tui/view.ts#L1035) (grid: Grid, state: State, rect: Rect, dividerY: number) → void <!-- internal -->
      <a id="tui.view.drawFindings"></a><br>The full findings report of the current analysis: counts, filters, the selected finding's details, and the list.
      - calls [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.findings.findingRow](tui.md#tui.findings.findingRow)
    - fn [hoverRect](../../src/tui/view.ts#L1092) (hover: NonNullable<State["hover"]>, editor: Rect) → Rect <!-- internal -->
      <a id="tui.view.hoverRect"></a><br>The hover's box: below its anchor where it fits, else above; inside the editor.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [drawHover](../../src/tui/view.ts#L1104) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawHover"></a><br>The hover popup: a frame and the lines styled by their kind (title, code, evidence, rule).
      - calls [tui.view.hoverRect](tui.md#tui.view.hoverRect), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - type [CompletionBox](../../src/tui/view.ts#L1116) <!-- internal -->
      <a id="tui.view.CompletionBox"></a><br>The completion's box and the items it shows: under the cursor line where it fits, else above.
    - fn [completionBox](../../src/tui/view.ts#L1123) (state: State, editor: Rect, buffer: Buffer) → CompletionBox <!-- internal -->
      <a id="tui.view.completionBox"></a><br>Where the completion popup goes: eight items around the selection, at the column where completion started.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
    - fn [drawCompletion](../../src/tui/view.ts#L1138) (grid: Grid, state: State, editor: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawCompletion"></a><br>The completion popup: the visible items with their detail, the selected one highlighted.
      - calls [tui.view.completionBox](tui.md#tui.view.completionBox), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [keyRows](../../src/tui/view.ts#L1244) (pairs: readonly [string, string][], width: number) → string[] <!-- internal -->
      <a id="tui.view.keyRows"></a><br>The key rows of a mode: two pairs a row where both fit in `width`, else one; a long pair takes its own row.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [helpRows](../../src/tui/view.ts#L1272) (state: State, width: number) → string[]
      <a id="tui.view.helpRows"></a><br>The rows of the help popup, wrapped to `width`: the keys of the mode, the offline help of the line's diagnostic, then the whole catalogue by group — the same registry the palette searches, with each key as the mode has it and the reason of each unavailable action.
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain.explainCode](features.md#features.explain.explainCode), [tui.view.keyRows](tui.md#tui.view.keyRows), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionKey](tui.md#tui.actions.actionKey), [tui.width.wrapCells](tui.md#tui.width.wrapCells)
    - type [HelpBox](../../src/tui/view.ts#L1314) <!-- internal -->
      <a id="tui.view.HelpBox"></a><br>Where the help popup draws, its rows and how many of them show at once.
    - fn [helpBox](../../src/tui/view.ts#L1321) (state: State) → HelpBox <!-- internal -->
      <a id="tui.view.helpBox"></a><br>The help popup's box: centred in the panel area, at most 96 cells wide, as tall as its rows allow.
      - calls [tui.view.layout](tui.md#tui.view.layout), [tui.view.helpRows](tui.md#tui.view.helpRows)
    - fn [helpScrollMax](../../src/tui/view.ts#L1333) (state: State) → number
      <a id="tui.view.helpScrollMax"></a><br>The last first row the help can scroll to.
      - calls [tui.view.helpBox](tui.md#tui.view.helpBox)
    - fn [drawHelp](../../src/tui/view.ts#L1340) (grid: Grid, state: State) → void <!-- internal -->
      <a id="tui.view.drawHelp"></a><br>The help popup: its visible rows from `helpTop`, and a position line when it scrolls.
      - calls [tui.view.helpBox](tui.md#tui.view.helpBox), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - type [PromptLook](../../src/tui/view.ts#L1357) <!-- internal -->
      <a id="tui.view.PromptLook"></a><br>How the prompt line and the box over the editor show each kind of prompt: the label before the typed text; what stands as typed when a form types into its rows (the prompt's text otherwise); the box's title; and whether the selected item's note follows on the line (a search, a…
    - fn [isFixedLabel](../../src/tui/view.ts#L1411) (label: PromptLook["label"]) → label is string <!-- internal -->
      <a id="tui.view.isFixedLabel"></a><br>A label that does not depend on the prompt's state.
    - fn [drawPrompt](../../src/tui/view.ts#L1419) (grid: Grid, state: State, rect: Rect, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawPrompt"></a><br>The prompt line (in the detail row) with the typed text and the note, and for every kind but search and context a box of its items over the panel.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.isFixedLabel](tui.md#tui.view.isFixedLabel), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.wrapCells](tui.md#tui.width.wrapCells), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [newSpecLabel](../../src/tui/view.ts#L1459) (field: "kind" | "path" | "name" | undefined) → string <!-- internal -->
      <a id="tui.view.newSpecLabel"></a><br>The label of the field the new-spec form is on.
    - type [FooterHint](../../src/tui/view.ts#L1464) <!-- internal -->
      <a id="tui.view.FooterHint"></a><br>The footer keys of one mode, and the tail that always shows.
    - fn [footerHint](../../src/tui/view.ts#L1484) (mode: State["mode"], width: number) → string
      <a id="tui.view.footerHint"></a><br>The footer hint of the mode that fits in `width` cells: the leading keys that fit, and the tail.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [configNote](../../src/tui/view.ts#L1502) (state: State) → string | null
      <a id="tui.view.configNote"></a><br>Where the analysis takes its settings from, when that is not a plain saved `keylang.json`: a guess (no config), or the saved file while the buffer of `keylang.json` has unsaved edits that do not take effect.
      - calls [tui.buffer.isDirty](tui.md#tui.buffer.isDirty)
    - fn [drawBarrier](../../src/tui/view.ts#L1514) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawBarrier"></a><br>The save step before an operation that reads the disk (design §2.5), over the editor area.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawQuit](../../src/tui/view.ts#L1547) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawQuit"></a><br>The quit step while an operation runs (design §5), over the editor area.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.screen.drawBox](tui.md#tui.screen.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawStart](../../src/tui/view.ts#L1579) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawStart"></a><br>The start screen of a repository without `keylang.json` (design §2.1): what was found and what can be done.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [hoverShown](../../src/tui/view.ts#L1603) (state: State) → boolean <!-- internal -->
      <a id="tui.view.hoverShown"></a><br>The hover is drawn: over the raw or the read text, or the zoom screen.
    - fn [editorCursorCell](../../src/tui/view.ts#L1608) (state: State, editor: Rect, buffer: Buffer | null) → Cell | null <!-- internal -->
      <a id="tui.view.editorCursorCell"></a><br>The cell of the editor's cursor while the raw text is shown (view, edit), whether the terminal shows it or not.
      - calls [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
    - fn [clipOnScreen](../../src/tui/view.ts#L1622) (state: State, area: Layout = layout(state)) → Rect | null
      <a id="tui.view.clipOnScreen"></a><br>The clip as this frame draws it, or null: off, a badge on a narrow terminal, covered by the start screen or F6, or yielding to the editor's cursor or a popup under it. A click goes to the clip only where it is drawn.
      - calls [tui.view.layout](tui.md#tui.view.layout), [tui.clip.assistantShown](tui.md#tui.clip.assistantShown), [tui.clip.clipRect](tui.md#tui.clip.clipRect), [tui.view.hoverShown](tui.md#tui.view.hoverShown), [tui.view.hoverRect](tui.md#tui.view.hoverRect), [tui.view.completionBox](tui.md#tui.view.completionBox), [tui.clip.clipYields](tui.md#tui.clip.clipYields), [tui.view.editorCursorCell](tui.md#tui.view.editorCursorCell)
    - fn [render](../../src/tui/view.ts#L1641) (state: State) → Grid
      <a id="tui.view.render"></a><br>The whole frame for `state`: title, side panels, the body of the mode, detail line and status bar, then the popups in their stacking order.
      - calls [tui.screen.Grid](tui.md#tui.screen.Grid), [tui.view.layout](tui.md#tui.view.layout), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.buffer.isDirty](tui.md#tui.buffer.isDirty), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.drawFiles](tui.md#tui.view.drawFiles), [tui.view.drawContext](tui.md#tui.view.drawContext), [tui.view.drawNav](tui.md#tui.view.drawNav), [tui.view.drawStart](tui.md#tui.view.drawStart), [tui.view.drawCode](tui.md#tui.view.drawCode), [tui.view.drawZoom](tui.md#tui.view.drawZoom), [tui.view.drawMerge](tui.md#tui.view.drawMerge), [tui.view.drawRead](tui.md#tui.view.drawRead), [tui.view.drawEditor](tui.md#tui.view.drawEditor), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.lineMessage](tui.md#tui.view.lineMessage), [tui.view.footerHint](tui.md#tui.view.footerHint), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.clip.assistantShown](tui.md#tui.clip.assistantShown), [tui.clip.badgeRect](tui.md#tui.clip.badgeRect), [tui.clip.badgeText](tui.md#tui.clip.badgeText), [tui.evidence.totals](tui.md#tui.evidence.totals), [tui.view.dimmedIf](tui.md#tui.view.dimmedIf), [tui.view.configNote](tui.md#tui.view.configNote), [tui.view.drawResults](tui.md#tui.view.drawResults), [tui.view.clipOnScreen](tui.md#tui.view.clipOnScreen), [tui.clip-view.drawClip](tui.md#tui.clip-view.drawClip), [tui.view.hoverShown](tui.md#tui.view.hoverShown), [tui.view.drawHover](tui.md#tui.view.drawHover), [tui.view.drawCompletion](tui.md#tui.view.drawCompletion), [tui.clip-view.drawChat](tui.md#tui.clip-view.drawChat), [tui.clip.chatRect](tui.md#tui.clip.chatRect), [tui.view.drawHelp](tui.md#tui.view.drawHelp), [tui.view.drawPrompt](tui.md#tui.view.drawPrompt), [tui.view.drawBarrier](tui.md#tui.view.drawBarrier), [tui.view.drawQuit](tui.md#tui.view.drawQuit)
  - module [web-export](../../src/tui/web-export.ts#L1)
    <a id="tui.web-export"></a><br>`keylang web --export <dir>`: the diagram page of one repository as a static site. Every answer the read-only page can ask for — the views, each diagram and its BPMN/draw.io file, the calls and usages of each ID, the coverage, the tour, the map and the explained map — is…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - harness [features.harness](features.md#features.harness)
    - json [base.json](base.md#base.json)
    - graph-diff-run [features.graph-diff-run](features.md#features.graph-diff-run)
    - span [base.span](base.md#base.span)
    - read-api [tui.read-api](tui.md#tui.read-api)
    - web [tui.web](tui.md#tui.web)
    - type [ExportResult](../../src/tui/web-export.ts#L33)
      <a id="tui.web-export.ExportResult"></a><br>What an export wrote: the directory, the number of answers, data shards and files.
    - fn [exportTargetProblem](../../src/tui/web-export.ts#L41) (root: string, out: string) → string | null
      <a id="tui.web-export.exportTargetProblem"></a><br>Why `out` may not take an export of `root`, or null.
    - fn [requests](../../src/tui/web-export.ts#L64) (done: Analysis, answer: (path: string, query: URLSearchParams) => Promise<ReadAnswer>) → Promise<{ key: string; answer: ReadAnswer }[]> <!-- internal -->
      <a id="tui.web-export.requests"></a><br>Every request the read-only page makes, in a stable order: the views, coverage, tour, git, the changes since the base of a feature and HEAD and the architecture diff since that base, docs; each doc; each diagram with its two export files; the calls and usages of every ID of the…
      - calls [tui.read-api.requestKey](tui.md#tui.read-api.requestKey), [base.span.compareText](base.md#base.span.compareText)
    - fn [shardTexts](../../src/tui/web-export.ts#L145) (answers: readonly { key: string; answer: ReadAnswer }[]) → string[] <!-- internal -->
      <a id="tui.web-export.shardTexts"></a><br>The answers in shards of about `SHARD_BYTES`, each a script that hands its answers to the page.
      - calls [tui.read-api.keyShard](tui.md#tui.read-api.keyShard)
    - fn [siteAssets](../../src/tui/web-export.ts#L158) () → string[] <!-- internal -->
      <a id="tui.web-export.siteAssets"></a><br>The built files of the page and of `app.html`, as `scripts/build-web.mjs` lists them.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [exportSite](../../src/tui/web-export.ts#L177) (options: { root: string; out: string; analysis: Analysis }) → Promise<ExportResult>
      <a id="tui.web-export.exportSite"></a><br>Writes the site of `root` into `out` from one analysis. `out` is made, or is an earlier export (its marker), whose files are replaced; nothing is written into the repository.
      - calls [tui.web-export.exportTargetProblem](tui.md#tui.web-export.exportTargetProblem), [tui.web.ensureClient](tui.md#tui.web.ensureClient), [tui.web-export.siteAssets](tui.md#tui.web-export.siteAssets), [tui.read-api.createReadApi](tui.md#tui.read-api.createReadApi), [features.graph-diff-run.runGraphDiff](features.md#features.graph-diff-run.runGraphDiff), [tui.web-export.requests](tui.md#tui.web-export.requests), [tui.web-export.shardTexts](tui.md#tui.web-export.shardTexts), [tui.web.diagramsPage](tui.md#tui.web.diagramsPage), [features.harness.keylangVersion](features.md#features.harness.keylangVersion)
  - module [web](../../src/tui/web.ts#L1)
    <a id="tui.web"></a><br>`keylang web`: the same TUI in a browser tab. `node:http` serves a page and the bundled xterm.js; a WebSocket (`ws`) carries ANSI frames to xterm.js and its keyboard, mouse, paste and resize events back to an `App` in this process. No PTY and no CDN.
    - node [external.node](external.md#external.node)
    - ws [external.ws](external.md#external.ws)
    - analyze [map.analyze](map.md#map.analyze)
    - diagram [map.diagram](map.md#map.diagram)
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - explorer [features.explorer](features.md#features.explorer)
    - graph-diff-run [features.graph-diff-run](features.md#features.graph-diff-run)
    - map [map.map](map.md#map.map)
    - diagram-propose [operations.diagram-propose](operations.md#operations.diagram-propose)
    - greenfield [operations.greenfield](operations.md#operations.greenfield)
    - greenfield2 [features.greenfield](features.md#features.greenfield)
    - flow-bundle [operations.flow-bundle](operations.md#operations.flow-bundle)
    - diagram-clip [features.diagram-clip](features.md#features.diagram-clip)
    - flow-bundle2 [features.flow-bundle](features.md#features.flow-bundle)
    - harness [features.harness](features.md#features.harness)
    - json [base.json](base.md#base.json)
    - draft [operations.draft](operations.md#operations.draft)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - read-api [tui.read-api](tui.md#tui.read-api)
    - tree-stamp [tui.tree-stamp](tui.md#tui.tree-stamp)
    - screen [tui.screen](tui.md#tui.screen)
    - fn [withoutControls](../../src/tui/web.ts#L67) (text: string) → string <!-- internal -->
      <a id="tui.web.withoutControls"></a><br>The text with C0 controls and DEL as spaces: an error's text shown in the terminal must not move the cursor or start a sequence.
    - type [AssetName](../../src/tui/web.ts#L93) = keyof typeof ASSETS <!-- internal -->
      <a id="tui.web.AssetName"></a><br>The name of an xterm.js asset under `/assets/`.
    - type [BuiltName](../../src/tui/web.ts#L102) = keyof typeof BUILT <!-- internal -->
      <a id="tui.web.BuiltName"></a><br>The name of a built diagram-client file under `/assets/`.
    - fn [isBuiltName](../../src/tui/web.ts#L105) (name: string) → name is BuiltName <!-- internal -->
      <a id="tui.web.isBuiltName"></a><br>Whether `/assets/<name>` is a built diagram-client file.
    - fn [isAssetName](../../src/tui/web.ts#L110) (name: string) → name is AssetName <!-- internal -->
      <a id="tui.web.isAssetName"></a><br>Whether `/assets/<name>` is an xterm.js file.
    - fn [newestUnder](../../src/tui/web.ts#L124) (dir: string) → number <!-- internal -->
      <a id="tui.web.newestUnder"></a><br>The newest modification time under a directory, in ms.
    - fn [clientStale](../../src/tui/web.ts#L136) () → boolean <!-- internal -->
      <a id="tui.web.clientStale"></a><br>Whether a built file is missing or older than the client's sources (the page's, the worker's and the keylang modules the worker bundles) or its build script.
      - calls [tui.web.newestUnder](tui.md#tui.web.newestUnder)
    - fn [ensureClient](../../src/tui/web.ts#L154) () → Promise<void>
      <a id="tui.web.ensureClient"></a><br>In a checkout, builds the diagram client when it is missing or stale (esbuild takes about a second); concurrent requests share one build.
      - calls [tui.web.clientStale](tui.md#tui.web.clientStale)
    - fn [assetPath](../../src/tui/web.ts#L169) (name: AssetName) → string | null
      <a id="tui.web.assetPath"></a><br>The published package carries the assets in `dist/web/`; a checkout reads them from `node_modules`.
    - type [WebServer](../../src/tui/web.ts#L188)
      <a id="tui.web.WebServer"></a><br>A running `keylang web` server: its printed URL and port, unsaved specs, and shutdown.
    - type [Session](../../src/tui/web.ts#L203) <!-- internal -->
      <a id="tui.web.Session"></a><br>One TUI session: its `App`, the socket driving it (null while detached), and the expiry timer.
    - type [ControlMessage](../../src/tui/web.ts#L212) <!-- internal -->
      <a id="tui.web.ControlMessage"></a><br>What the page is told besides ANSI: the microphone goes on or off.
    - fn [control](../../src/tui/web.ts#L218) (message: ControlMessage) → string <!-- internal -->
      <a id="tui.web.control"></a><br>A control message for the page: a frame that starts with NUL, which no ANSI frame does.
    - module [AudioQueue](../../src/tui/web.ts#L226) <!-- internal -->
      <a id="tui.web.AudioQueue"></a><br>PCM chunks from the page, read by the session's recognizer as they arrive.
      - fn [push](../../src/tui/web.ts#L234) (chunk: Int16Array) → void
        <a id="tui.web.AudioQueue.push"></a><br>Adds a chunk; chunks after `end` or past `MAX_SAMPLES` are dropped.
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [end](../../src/tui/web.ts#L242) (failure: Error | null = null) → void
        <a id="tui.web.AudioQueue.end"></a><br>Ends the stream; a failure is thrown to the reader once the queued chunks are read.
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [wake](../../src/tui/web.ts#L249) () → void <!-- internal -->
        <a id="tui.web.AudioQueue.wake"></a><br>Resolves the reader waiting for a chunk, if any.
      - fn [chunks](../../src/tui/web.ts#L256) () → AsyncGenerator<Int16Array>
        <a id="tui.web.AudioQueue.chunks"></a><br>The chunks as they come, until `end`.
    - fn [pcmOf](../../src/tui/web.ts#L275) (data: JsonValue | undefined) → Int16Array | null <!-- internal -->
      <a id="tui.web.pcmOf"></a><br>s16le PCM from base64; an odd byte count or bad base64 is dropped, not trusted.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [clampSize](../../src/tui/web.ts#L289) (value: JsonValue | undefined, fallback: number, max: number) → number
      <a id="tui.web.clampSize"></a><br>A size from the client: an integer within the grid limits, else the fallback.
      - calls [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [sameSecret](../../src/tui/web.ts#L296) (given: string | null | undefined, token: string) → boolean <!-- internal -->
      <a id="tui.web.sameSecret"></a><br>Whether `given` equals the token, compared in constant time so timing tells nothing about it.
    - fn [offeredToken](../../src/tui/web.ts#L305) (request: IncomingMessage) → string | null <!-- internal -->
      <a id="tui.web.offeredToken"></a><br>The token a socket offers among its subprotocols.
    - type [WebOptions](../../src/tui/web.ts#L317)
      <a id="tui.web.WebOptions"></a><br>How `createWebApp` and `serveWeb` run one repository.
    - type [WebApp](../../src/tui/web.ts#L340)
      <a id="tui.web.WebApp"></a><br>One repository's `keylang web` without a server of its own: the handlers of its requests and socket upgrades, for `serveWeb` and for the hub (`web --hub`), which mounts each repository under `/r/<id>/` of one port and passes requests on with the prefix taken off.
    - type [CachedAnalysis](../../src/tui/web.ts#L352) <!-- internal -->
      <a id="tui.web.CachedAnalysis"></a><br>One analysis of the tree and the stamp of its inputs, kept while no input changes.
    - fn [flowNamesOf](../../src/tui/web.ts#L360) (value: JsonValue | undefined) → string[] | undefined | null <!-- internal -->
      <a id="tui.web.flowNamesOf"></a><br>A request's `flows`: flow names, absent, or null when it is no array of names.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [createWebApp](../../src/tui/web.ts#L374) (options: WebOptions) → WebApp
      <a id="tui.web.createWebApp"></a><br>The page, API and socket handlers of one repository's `keylang web`, with its token, sessions and shared analysis; `serveWeb` and the hub put it on a port.
      - calls [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.web.sameSecret](tui.md#tui.web.sameSecret), [tui.web.offeredToken](tui.md#tui.web.offeredToken), [tui.tree-stamp.stampOf](tui.md#tui.tree-stamp.stampOf), [tui.tree-stamp.inputsOf](tui.md#tui.tree-stamp.inputsOf), [tui.read-api.createReadApi](tui.md#tui.read-api.createReadApi), [features.graph-diff-run.runGraphDiff](features.md#features.graph-diff-run.runGraphDiff), [tui.web.reply](tui.md#tui.web.reply), [tui.web.jsonBody](tui.md#tui.web.jsonBody), [features.explorer.parseExplorerFlow](features.md#features.explorer.parseExplorerFlow), [tui.read-api.isRefusal](tui.md#tui.read-api.isRefusal), [features.explorer.explorerFlow](features.md#features.explorer.explorerFlow), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [operations.draft.flowCandidate](operations.md#operations.draft.flowCandidate), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal), [map.map.sourceInputs](map.md#map.map.sourceInputs), [tui.web.send](tui.md#tui.web.send), [map.diagram-layout.readLayout](map.md#map.diagram-layout.readLayout), [tui.web.parseClientLayout](tui.md#tui.web.parseClientLayout), [map.diagram-layout.layoutToFile](map.md#map.diagram-layout.layoutToFile), [map.diagram-layout.layoutText](map.md#map.diagram-layout.layoutText), [map.diagram-layout.writeLayout](map.md#map.diagram-layout.writeLayout), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [operations.diagram-propose.runDiagramPropose](operations.md#operations.diagram-propose.runDiagramPropose), [operations.greenfield.greenfieldAvailability](operations.md#operations.greenfield.greenfieldAvailability), [operations.greenfield.runGreenfield](operations.md#operations.greenfield.runGreenfield), [tui.web.flowNamesOf](tui.md#tui.web.flowNamesOf), [base.json.isJsonNumber](base.md#base.json.isJsonNumber), [features.diagram-clip.parseClipSelection](features.md#features.diagram-clip.parseClipSelection), [map.diagram.viewOfKey](map.md#map.diagram.viewOfKey), [operations.flow-bundle.exportFlows](operations.md#operations.flow-bundle.exportFlows), [features.diagram-clip.fragmentName](features.md#features.diagram-clip.fragmentName), [features.diagram-clip.fragmentFlow](features.md#features.diagram-clip.fragmentFlow), [features.diagram-clip.clipLayoutText](features.md#features.diagram-clip.clipLayoutText), [features.diagram-clip.clipLayout](features.md#features.diagram-clip.clipLayout), [operations.flow-bundle.exportBundle](operations.md#operations.flow-bundle.exportBundle), [features.harness.keylangVersion](features.md#features.harness.keylangVersion), [features.flow-bundle.parseBundle](features.md#features.flow-bundle.parseBundle), [operations.flow-bundle.gitOf](operations.md#operations.flow-bundle.gitOf), [features.diagram-clip.pastedShapes](features.md#features.diagram-clip.pastedShapes), [operations.flow-bundle.runFlowImport](operations.md#operations.flow-bundle.runFlowImport), [features.flow-bundle.usedLayers](features.md#features.flow-bundle.usedLayers), [tui.web.bearerToken](tui.md#tui.web.bearerToken), [tui.web.pathOf](tui.md#tui.web.pathOf), [tui.web.isBuiltName](tui.md#tui.web.isBuiltName), [tui.web.ensureClient](tui.md#tui.web.ensureClient), [tui.web.isAssetName](tui.md#tui.web.isAssetName), [tui.web.assetPath](tui.md#tui.web.assetPath), [tui.web.diagramsPage](tui.md#tui.web.diagramsPage), [tui.web.page](tui.md#tui.web.page), [base.json.parseJson](base.md#base.json.parseJson), [tui.web.clampSize](tui.md#tui.web.clampSize), [tui.web.withoutControls](tui.md#tui.web.withoutControls), [tui.web.pcmOf](tui.md#tui.web.pcmOf), [tui.web.AudioQueue](tui.md#tui.web.AudioQueue), [tui.web.control](tui.md#tui.web.control), [tui.web.AudioQueue.chunks](tui.md#tui.web.AudioQueue.chunks), [tui.web.AudioQueue.end](tui.md#tui.web.AudioQueue.end), [tui.app.App](tui.md#tui.app.App), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
    - fn [logUnhandled](../../src/tui/web.ts#L1067) () → () => void
      <a id="tui.web.logUnhandled"></a><br>A rejection no session handled (a helper it did not track) would end the process, and every session's unsaved buffers with it: it is logged instead.
    - fn [shownHost](../../src/tui/web.ts#L1078) (host: string) → string
      <a id="tui.web.shownHost"></a><br>The address in a printed URL: `localhost` for loopback, a bracketed IPv6 address.
    - fn [serveWeb](../../src/tui/web.ts#L1083) (options: WebOptions) → Promise<WebServer>
      <a id="tui.web.serveWeb"></a><br>Starts `keylang web` for one repository on `options.port` (0: any free port); the URL carries the token in its fragment.
      - calls [tui.web.createWebApp](tui.md#tui.web.createWebApp), [tui.web.logUnhandled](tui.md#tui.web.logUnhandled), [tui.web.shownHost](tui.md#tui.web.shownHost)
    - fn [jsonBody](../../src/tui/web.ts#L1133) (request: IncomingMessage, response: ServerResponse, name: string, method: string, max: number) → Promise<JsonValue | typeof NO_BODY> <!-- internal -->
      <a id="tui.web.jsonBody"></a><br>The JSON body of a write, or `NO_BODY` once the refusal is sent: another method is 405, a content type that is not `application/json` 415 (an HTML form cannot send it), a body over `max` 413, no JSON 400.
      - calls [tui.web.reply](tui.md#tui.web.reply), [tui.web.readBody](tui.md#tui.web.readBody), [base.json.parseJson](base.md#base.json.parseJson)
    - fn [parseClientLayout](../../src/tui/web.ts#L1160) (body: JsonValue) → ClientLayout | string <!-- internal -->
      <a id="tui.web.parseClientLayout"></a><br>The editor's layout from a `PUT /api/layout` body (`{layout: {key: {x, y, …}}}`), or what is wrong with it.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonNumber](base.md#base.json.isJsonNumber), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [readBody](../../src/tui/web.ts#L1203) (request: IncomingMessage, max: number) → Promise<string | null> <!-- internal -->
      <a id="tui.web.readBody"></a><br>A request's body as text, or null when it is larger than `max` bytes (the rest is not read).
    - fn [bearerToken](../../src/tui/web.ts#L1230) (request: IncomingMessage) → string | null <!-- internal -->
      <a id="tui.web.bearerToken"></a><br>The token of an `Authorization: Bearer <token>` header.
    - fn [pathOf](../../src/tui/web.ts#L1237) (target: string | undefined) → string | null <!-- internal -->
      <a id="tui.web.pathOf"></a><br>The path of a request target, or null when it is not a URL at all.
    - fn [send](../../src/tui/web.ts#L1246) (response: ServerResponse, answer: ReadAnswer) → void <!-- internal -->
      <a id="tui.web.send"></a><br>A read answer as the HTTP reply, an attachment with its file name.
      - calls [tui.web.reply](tui.md#tui.web.reply)
    - fn [reply](../../src/tui/web.ts#L1252) (response: ServerResponse, status: number, type: string, body: string | Buffer) → void <!-- internal -->
      <a id="tui.web.reply"></a><br>Writes a whole reply: no caching, and no MIME sniffing of the body.
    - fn [diagramsPage](../../src/tui/web.ts#L1264) (options: { readOnly?: boolean; source?: "server" | "static" | "local"; assets?: string; title?: string; shards?: number } = {}) → string
      <a id="tui.web.diagramsPage"></a><br>The diagram page: markup only; `diagrams.js` fills it. Over HTTP it takes the token from the fragment and reads `/api/`; `source` names another transport: `static` reads the answers a static export wrote under `data/`, `local` analyses a folder the person opens in the tab…
    - fn [page](../../src/tui/web.ts#L1315) () → string <!-- internal -->
      <a id="tui.web.page"></a><br>The page: xterm.js from `/assets/`, a WebSocket back to this server, reconnect with the same session.
  - module [width](../../src/tui/width.ts#L1)
    <a id="tui.width"></a><br>Terminal cell width of text: graphemes, not code units. A wide character (CJK, most emoji, a keycap) takes two cells; combining marks, joiners, the other invisible format characters (Default_Ignorable_Code_Point: ZWSP, soft hyphen, word joiner) and Hangul vowels and finals…
    - fn [graphemes](../../src/tui/width.ts#L18) (text: string) → string[]
      <a id="tui.width.graphemes"></a><br>Grapheme clusters of a string, in order.
    - fn [clusters](../../src/tui/width.ts#L27) (text: string) → Generator<string>
      <a id="tui.width.clusters"></a><br>The same clusters, segmented only as far as they are read: drawing a long line stops at the screen's edge.
    - fn [codePointWidth](../../src/tui/width.ts#L53) (cp: number) → 0 | 1 | 2 <!-- internal -->
      <a id="tui.width.codePointWidth"></a><br>Gives a code point's terminal column width: 0 for control characters, Hangul vowel/final jamo and ignorable characters, 2 for wide-range characters, otherwise 1; used by [`tui.width.graphemeWidth`](tui.md#tui.width.graphemeWidth). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [graphemeWidth](../../src/tui/width.ts#L88) (cluster: string) → 0 | 1 | 2
      <a id="tui.width.graphemeWidth"></a><br>Cells one grapheme takes. An emoji cluster (a ZWJ sequence, a flag, a keycap, a pictograph with VS16) is one wide cell pair; otherwise the width of its first visible code point.
      - calls [tui.width.codePointWidth](tui.md#tui.width.codePointWidth)
    - fn [stringWidth](../../src/tui/width.ts#L104) (text: string) → number
      <a id="tui.width.stringWidth"></a><br>Total terminal cells of `text`, summed over its grapheme clusters.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [fitWidth](../../src/tui/width.ts#L113) (text: string, width: number) → string
      <a id="tui.width.fitWidth"></a><br>The longest prefix of `text` that fits in `width` cells.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [padWidth](../../src/tui/width.ts#L130) (text: string, width: number) → string
      <a id="tui.width.padWidth"></a><br>`text` cut or padded with spaces to exactly `width` cells; a cut ends with `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [sliceCells](../../src/tui/width.ts#L150) (text: string, left: number, width: number) → string
      <a id="tui.width.sliceCells"></a><br>The part of `text` seen through a window `width` cells wide scrolled `left` cells in: whole clusters only, with `…` at an edge that hides more text. On the left `…` never covers a cluster in view: it takes the visible half of a wide cluster the edge cuts, else a cell of its own…
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - type [StyledText](../../src/tui/width.ts#L193)
      <a id="tui.width.StyledText"></a><br>A piece of text in one style: what `wrapRuns` breaks into rows.
    - fn [wrapRuns](../../src/tui/width.ts#L206) (runs: readonly StyledText<S>[], width: number, hang: number, blank: S) → StyledText<S>[][]
      <a id="tui.width.wrapRuns"></a><br>Word-wraps runs of styled text into rows of `width` cells. A run splits after each space; a word goes to the next row when it does not fit — measured without the spaces after it, which stay at the end of its row — and a word wider than a whole row is cut between clusters and…
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth), [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [wrapCells](../../src/tui/width.ts#L245) (text: string, width: number) → string[]
      <a id="tui.width.wrapCells"></a><br>`text` word-wrapped to rows of at most `width` cells (`wrapRuns`); the spaces at a break are left out.
      - calls [tui.width.wrapRuns](tui.md#tui.width.wrapRuns)
    - fn [cellWidth](../../src/tui/width.ts#L254) (cluster: string) → number
      <a id="tui.width.cellWidth"></a><br>Cells a cluster takes in a `Grid`: a tab is drawn as one blank cell.
      - calls [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - type [LineLayout](../../src/tui/width.ts#L264)
      <a id="tui.width.LineLayout"></a><br>One line cut into clusters once, with prefix sums: the cells, code points and UTF-16 units before each cluster (index `clusters.length` is the whole line). Scrolling, drawing and hit-testing then take constant or logarithmic time per question instead of segmenting the line again.
    - fn [layoutLine](../../src/tui/width.ts#L272) (line: string) → LineLayout
      <a id="tui.width.layoutLine"></a><br>Segments `line` once and builds the `LineLayout` prefix sums for it.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.cellWidth](tui.md#tui.width.cellWidth)
    - fn [scrollToFit](../../src/tui/width.ts#L289) (layout: LineLayout, left: number, col: number, width: number) → number
      <a id="tui.width.scrollToFit"></a><br>The smallest first cluster from `left` on such that clusters `[first, col)` fit in `width` cells.
    - fn [clusterAtCell](../../src/tui/width.ts#L306) (layout: LineLayout, left: number, x: number) → number
      <a id="tui.width.clusterAtCell"></a><br>The cluster under cell `x` of a line drawn from cluster `left`; past the end, the end.
    - fn [clusterAt](../../src/tui/width.ts#L324) (line: string, codePoints: number) → number
      <a id="tui.width.clusterAt"></a><br>Grapheme index of a code-point column in `line` (a column inside a cluster maps to that cluster).
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [clusterOffset](../../src/tui/width.ts#L340) (line: string, clusters: number) → number
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
    - type [ZoomHost](../../src/tui/zoom-screen.ts#L23)
      <a id="tui.zoom-screen.ZoomHost"></a><br>What the zoom screen needs from the session: where its keys lead out of it.
    - module [ZoomScreen](../../src/tui/zoom-screen.ts#L40)
      <a id="tui.zoom-screen.ZoomScreen"></a><br>The zoom screen's controller: turns keys and clicks into changes of `state.zoom` and calls out through its host.
      - fn [constructor](../../src/tui/zoom-screen.ts#L43) (host: ZoomHost)
        <a id="tui.zoom-screen.ZoomScreen.constructor"></a>
      - fn [state](../../src/tui/zoom-screen.ts#L47) () → State <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.state"></a>
      - fn [openZoom](../../src/tui/zoom-screen.ts#L56) (id: string | null) → void
        <a id="tui.zoom-screen.ZoomScreen.openZoom"></a><br>`z`: the zoom screen at `id` (its own level, or the level it is a row of, that row selected), else at the repository. The view underneath stays as it is; `q` comes back to it at the node selected last.
        - calls [tui.zoom-screen.ZoomScreen.state](tui.md#tui.zoom-screen.ZoomScreen.state), [tui.actions.noSnapshotReason](tui.md#tui.actions.noSnapshotReason), [tui.zoom.zoomTarget](tui.md#tui.zoom.zoomTarget), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo)
      - fn [zoomTo](../../src/tui/zoom-screen.ts#L78) (focus: string, select: string | null) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomTo"></a><br>The level of `focus`, `select` (or the row selected there before) under the cursor.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible)
      - fn [zoomEdgeRows](../../src/tui/zoom-screen.ts#L95) () → ZoomEdge[] <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomEdgeRows"></a><br>The edges view of the level shown (`c`): its rows.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom.zoomEdges](tui.md#tui.zoom.zoomEdges)
      - fn [zoomCount](../../src/tui/zoom-screen.ts#L108) () → number <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomCount"></a><br>How many rows the shown view of the level has.
        - calls [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows)
      - fn [zoomRows](../../src/tui/zoom-screen.ts#L113) () → ZoomRow[] <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomRows"></a><br>The rows of the level shown; the repository's when the focus left the snapshot with a new analysis.
        - calls [tui.zoom.zoomLevel](tui.md#tui.zoom.zoomLevel)
      - fn [zoomIndex](../../src/tui/zoom-screen.ts#L129) (rows: readonly unknown[]) → number <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomIndex"></a><br>The selected row of the shown view, clamped to `rows`.
        - calls [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey)
      - fn [keepZoomVisible](../../src/tui/zoom-screen.ts#L136) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.keepZoomVisible"></a><br>Keeps the selected row inside the shown rows of the zoom screen.
        - calls [tui.zoom-screen.ZoomScreen.state](tui.md#tui.zoom-screen.ZoomScreen.state), [tui.view.zoomListHeight](tui.md#tui.view.zoomListHeight), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows)
      - fn [zoomUp](../../src/tui/zoom-screen.ts#L153) (close: boolean) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomUp"></a><br>One level up, the cursor on the node it came from. At the repository Esc closes the screen and leaves the view where it was; `q` is the one that goes to the selected node.
        - calls [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent), [tui.zoom-screen.ZoomScreen.closeZoom](tui.md#tui.zoom-screen.ZoomScreen.closeZoom), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo)
      - fn [zoomDepth](../../src/tui/zoom-screen.ts#L169) (delta: number) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomDepth"></a><br>`>` and `<`: neighbors one edge farther or nearer, from none up to `MAX_DEPTH`.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible)
      - fn [closeZoom](../../src/tui/zoom-screen.ts#L197) (follow = true) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.closeZoom"></a><br>`q`: back to the view, at the node selected on the level (in the map of its layer), or at the focus.
        - calls [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex)
      - fn [zoomCode](../../src/tui/zoom-screen.ts#L213) (id: string) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomCode"></a><br>Enter on a fn or type: its code in the viewer; Esc there comes back to this level.
      - fn [zoomMouse](../../src/tui/zoom-screen.ts#L226) (event: MouseEvent, editor: { x: number; y: number; width: number; height: number }) → void
        <a id="tui.zoom-screen.ZoomScreen.zoomMouse"></a><br>The wheel scrolls the rows of the zoom screen; a click on a row selects it and opens nothing.
        - calls [tui.zoom-screen.ZoomScreen.zoomCount](tui.md#tui.zoom-screen.ZoomScreen.zoomCount), [tui.view.zoomButtons](tui.md#tui.view.zoomButtons), [tui.zoom-screen.ZoomScreen.zoomButton](tui.md#tui.zoom-screen.ZoomScreen.zoomButton), [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey)
      - fn [zoomButton](../../src/tui/zoom-screen.ts#L259) (action: ZoomButton["action"]) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomButton"></a><br>A header button of the zoom screen: the same as its key.
        - calls [tui.zoom-screen.ZoomScreen.zoomKey](tui.md#tui.zoom-screen.ZoomScreen.zoomKey)
      - fn [zoomExplain](../../src/tui/zoom-screen.ts#L265) (row: ZoomRow | undefined) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomExplain"></a><br>`e` and `K`: the explain hover of the selected node, as `e` shows it in the view.
        - calls [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage), [tui.zoom-screen.ZoomScreen.state](tui.md#tui.zoom-screen.ZoomScreen.state), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows)
      - fn [zoomFlowKey](../../src/tui/zoom-screen.ts#L286) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomFlowKey"></a><br>`f`: the flow picker, the flows through this level first; with a flow laid over the levels, `f` takes it off.
        - calls [tui.zoom-screen.ZoomScreen.findFlows](tui.md#tui.zoom-screen.ZoomScreen.findFlows)
      - fn [findFlows](../../src/tui/zoom-screen.ts#L301) () → void
        <a id="tui.zoom-screen.ZoomScreen.findFlows"></a><br>The flow picker's list: every flow whose name has the typed text, those through the level first.
        - calls [tui.zoom.flowsThrough](tui.md#tui.zoom.flowsThrough)
      - fn [zoomNextFlow](../../src/tui/zoom-screen.ts#L317) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomNextFlow"></a><br>`F`: the next flow through the level, after the one laid over it.
        - calls [tui.zoom.flowsThrough](tui.md#tui.zoom.flowsThrough)
      - fn [zoomOverlay](../../src/tui/zoom-screen.ts#L334) () → FlowOverlay | null <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomOverlay"></a><br>The flow laid over the shown level, numbered on its units.
        - calls [tui.zoom.flowOverlay](tui.md#tui.zoom.flowOverlay), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf)
      - fn [zoomToggleView](../../src/tui/zoom-screen.ts#L344) () → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomToggleView"></a><br>`c`: the level's edges as rows, or back to its nodes.
        - calls [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible)
      - fn [zoomAlongEdge](../../src/tui/zoom-screen.ts#L353) (edge: ZoomEdge) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomAlongEdge"></a><br>Enter on an edge: the level of its other end, in the edges view; a fn or type, the level it is a row of.
        - calls [tui.zoom.zoomContainer](tui.md#tui.zoom.zoomContainer), [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo)
      - fn [zoomExplainEdge](../../src/tui/zoom-screen.ts#L368) (row: ZoomRow | undefined, edge: ZoomEdge | undefined) → void <!-- internal -->
        <a id="tui.zoom-screen.ZoomScreen.zoomExplainEdge"></a><br>`x`: in the edges view the edges of the selected row; on nodes, the first `x` marks the from end, the second explains from it to the selected node.
      - fn [zoomKey](../../src/tui/zoom-screen.ts#L398) (event: KeyEvent) → void
        <a id="tui.zoom-screen.ZoomScreen.zoomKey"></a><br>Handles one key on the zoom screen: movement, zooming in and out, depth, views, flows and explain.
        - calls [tui.zoom-screen.ZoomScreen.zoomEdgeRows](tui.md#tui.zoom-screen.ZoomScreen.zoomEdgeRows), [tui.zoom-screen.ZoomScreen.zoomRows](tui.md#tui.zoom-screen.ZoomScreen.zoomRows), [tui.zoom-screen.ZoomScreen.zoomIndex](tui.md#tui.zoom-screen.ZoomScreen.zoomIndex), [tui.zoom-screen.ZoomScreen.state](tui.md#tui.zoom-screen.ZoomScreen.state), [tui.view.zoomListHeight](tui.md#tui.view.zoomListHeight), [tui.view.layout](tui.md#tui.view.layout), [tui.zoom.zoomSelectKey](tui.md#tui.zoom.zoomSelectKey), [tui.zoom-screen.ZoomScreen.keepZoomVisible](tui.md#tui.zoom-screen.ZoomScreen.keepZoomVisible), [tui.zoom-screen.ZoomScreen.zoomOverlay](tui.md#tui.zoom-screen.ZoomScreen.zoomOverlay), [tui.zoom-screen.ZoomScreen.closeZoom](tui.md#tui.zoom-screen.ZoomScreen.closeZoom), [tui.zoom-screen.ZoomScreen.zoomAlongEdge](tui.md#tui.zoom-screen.ZoomScreen.zoomAlongEdge), [tui.zoom-screen.ZoomScreen.zoomDepth](tui.md#tui.zoom-screen.ZoomScreen.zoomDepth), [tui.zoom-screen.ZoomScreen.zoomTo](tui.md#tui.zoom-screen.ZoomScreen.zoomTo), [tui.zoom-screen.ZoomScreen.zoomCode](tui.md#tui.zoom-screen.ZoomScreen.zoomCode), [tui.zoom-screen.ZoomScreen.zoomUp](tui.md#tui.zoom-screen.ZoomScreen.zoomUp), [tui.zoom-screen.ZoomScreen.zoomExplain](tui.md#tui.zoom-screen.ZoomScreen.zoomExplain), [tui.zoom-screen.ZoomScreen.zoomToggleView](tui.md#tui.zoom-screen.ZoomScreen.zoomToggleView), [tui.zoom-screen.ZoomScreen.zoomFlowKey](tui.md#tui.zoom-screen.ZoomScreen.zoomFlowKey), [tui.zoom-screen.ZoomScreen.zoomNextFlow](tui.md#tui.zoom-screen.ZoomScreen.zoomNextFlow), [tui.zoom-screen.ZoomScreen.zoomExplainEdge](tui.md#tui.zoom-screen.ZoomScreen.zoomExplainEdge)
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
    - type [ZoomRow](../../src/tui/zoom.ts#L28)
      <a id="tui.zoom.ZoomRow"></a><br>One line of a level's nodes view: a child of the focus, a neighbor, or the `more` summary.
    - type [ZoomLevel](../../src/tui/zoom.ts#L46)
      <a id="tui.zoom.ZoomLevel"></a><br>Everything the nodes view draws for one focus: breadcrumbs and rows.
    - type [ZoomIndex](../../src/tui/zoom.ts#L55) <!-- internal -->
      <a id="tui.zoom.ZoomIndex"></a><br>Per-analysis lookups the levels share, built once by `indexOf`.
    - fn [indexOf](../../src/tui/zoom.ts#L71) (analysis: Analysis) → ZoomIndex <!-- internal -->
      <a id="tui.zoom.indexOf"></a><br>The `ZoomIndex` of an analysis, built on first use and cached.
      - calls [tui.nav.codeTree](tui.md#tui.nav.codeTree), [base.span.compareText](base.md#base.span.compareText), [tui.zoom.degrees](tui.md#tui.zoom.degrees), [tui.zoom.markIndex](tui.md#tui.zoom.markIndex)
    - fn [prefixes](../../src/tui/zoom.ts#L101) (id: string) → string[] <!-- internal -->
      <a id="tui.zoom.prefixes"></a><br>The ancestors of an ID, itself included: `a.b.c` → `a`, `a.b`, `a.b.c`.
    - fn [degrees](../../src/tui/zoom.ts#L108) (snapshot: AnalysisSnapshot) → Map<string, number> <!-- internal -->
      <a id="tui.zoom.degrees"></a><br>For every node, the edges with one end inside it and the other outside.
      - calls [tui.zoom.prefixes](tui.md#tui.zoom.prefixes)
    - fn [markIndex](../../src/tui/zoom.ts#L128) (analysis: Analysis) → Map<string, Mark> <!-- internal -->
      <a id="tui.zoom.markIndex"></a><br>The worst verdict for each node, rolled up from the verdict's area to every ancestor ID.
      - calls [tui.zoom.prefixes](tui.md#tui.zoom.prefixes), [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [inside](../../src/tui/zoom.ts#L141) (id: string, scope: string) → boolean <!-- internal -->
      <a id="tui.zoom.inside"></a><br>Whether `id` is `scope` or lies under it by ID; everything is inside the repository.
    - fn [zoomParent](../../src/tui/zoom.ts#L146) (analysis: Analysis, id: string) → string | null
      <a id="tui.zoom.zoomParent"></a><br>The node the zoom screen shows a level of above `id`: its module, its layer, or the repository.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf)
    - fn [zoomContainer](../../src/tui/zoom.ts#L153) (analysis: Analysis, id: string) → boolean
      <a id="tui.zoom.zoomContainer"></a><br>Whether `id` has a level of its own: the repository, a layer, or a module or class with children.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf)
    - fn [zoomTarget](../../src/tui/zoom.ts#L164) (analysis: Analysis, id: string) → { focus: string; select: string | null } | null
      <a id="tui.zoom.zoomTarget"></a><br>Where `z` on `id` opens the screen: the level of the node itself when it has one, else the level it is a row of, with that row selected. Null for an ID the snapshot does not have.
      - calls [tui.zoom.zoomContainer](tui.md#tui.zoom.zoomContainer), [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent)
    - fn [crumbLabel](../../src/tui/zoom.ts#L175) (analysis: Analysis, id: string) → string
      <a id="tui.zoom.crumbLabel"></a><br>The name a reader knows a node by on a level: the repository's manifest name, else `system`, and IDs below it.
      - calls [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent)
    - fn [rowKind](../../src/tui/zoom.ts#L185) (analysis: Analysis, id: string) → ZoomRow["kind"] <!-- internal -->
      <a id="tui.zoom.rowKind"></a><br>The kind a row shows: a module splits into class, package (an external one) or plain module.
    - fn [unitOf](../../src/tui/zoom.ts#L200) (index: ZoomIndex, focusIsLayer: boolean, id: string) → string <!-- internal -->
      <a id="tui.zoom.unitOf"></a><br>The unit a node outside the focus is shown as on this level: on a layer's level, the top module of its own layer (a package is one); on a module's level, the node itself.
    - fn [zoomLevel](../../src/tui/zoom.ts#L216) (analysis: Analysis, focus: string, depth: number) → ZoomLevel
      <a id="tui.zoom.zoomLevel"></a><br>One level of the zoom screen: the children of `focus` and the nodes outside it at most `depth` edges away from anything inside it. Neighbors are grouped as the children are: by top module on a layer's level, by node on a module's level.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf), [tui.zoom.rowKind](tui.md#tui.zoom.rowKind), [tui.zoom.zoomContainer](tui.md#tui.zoom.zoomContainer), [tui.zoom.zoomParent](tui.md#tui.zoom.zoomParent), [tui.zoom.crumbLabel](tui.md#tui.zoom.crumbLabel), [tui.zoom.inside](tui.md#tui.zoom.inside), [tui.zoom.unitOf](tui.md#tui.zoom.unitOf), [base.span.compareText](base.md#base.span.compareText)
    - type [ZoomEdge](../../src/tui/zoom.ts#L299)
      <a id="tui.zoom.ZoomEdge"></a><br>One row of the edges view (c4-zoom/08): the edges of the snapshot between two ends at the level's granularity — a child of the focus, or a unit outside it grouped as the neighbors are — with their kinds and count.
    - fn [zoomEdges](../../src/tui/zoom.ts#L322) (analysis: Analysis, focus: string) → ZoomEdge[]
      <a id="tui.zoom.zoomEdges"></a><br>The edges view of a level: incoming from outside, outgoing to the code and to packages, between the children, and what inside it keylang could not resolve. Only edges the snapshot has: no row is drawn from a guess.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf), [tui.zoom.unitOf](tui.md#tui.zoom.unitOf), [base.span.compareText](base.md#base.span.compareText), [tui.zoom.inside](tui.md#tui.zoom.inside), [map.snapshot.leavesUnresolved](map.md#map.snapshot.leavesUnresolved)
    - fn [zoomSelectKey](../../src/tui/zoom.ts#L381) (zoom: { focus: string; view: "nodes" | "edges" }) → string
      <a id="tui.zoom.zoomSelectKey"></a><br>The key a level's selected row is kept under: one per focus and view.
    - type [FlowOverlay](../../src/tui/zoom.ts#L391)
      <a id="tui.zoom.FlowOverlay"></a><br>A flow over one zoom level (c4-zoom/09): its `trigger`, `step` and `calls` numbered in the order they are written (a walk in depth, not the order they run: only a trace confirms that), placed on the level's units, each number with the gutter mark of its line.
    - fn [flowsThrough](../../src/tui/zoom.ts#L405) (analysis: Analysis, id: string) → string[]
      <a id="tui.zoom.flowsThrough"></a><br>Flows that name `id` or something inside it, by name; all flows for the repository.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [tui.zoom.inside](tui.md#tui.zoom.inside), [base.span.compareText](base.md#base.span.compareText)
    - fn [flowOverlay](../../src/tui/zoom.ts#L428) (analysis: Analysis, name: string, focus: string, lineMark: (file: string, line: number) => Mark | null) → FlowOverlay | null
      <a id="tui.zoom.flowOverlay"></a><br>The flow named `name` laid over the level of `focus`, or null when there is no such flow or no snapshot. `lineMark` gives the gutter mark of a spec line.
      - calls [tui.zoom.indexOf](tui.md#tui.zoom.indexOf), [tui.zoom.inside](tui.md#tui.zoom.inside), [tui.zoom.unitOf](tui.md#tui.zoom.unitOf)
    - fn [circled](../../src/tui/zoom.ts#L480) (n: number) → string
      <a id="tui.zoom.circled"></a><br>`①` for 1 up to `⑳` for 20, then the number in parentheses.
