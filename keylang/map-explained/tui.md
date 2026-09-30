<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [actions](#tui.actions) · [analysis-worker](#tui.analysis-worker) · [app](#tui.app) · [assist](#tui.assist) · [background](#tui.background) · [buffer](#tui.buffer) · [code-highlight](#tui.code-highlight) · [disk](#tui.disk) · [evidence](#tui.evidence) · [findings](#tui.findings) · [input](#tui.input) · [markdown](#tui.markdown) · [merge-session](#tui.merge-session) · [merge](#tui.merge) · [nav](#tui.nav) · [screen](#tui.screen) · [state](#tui.state) · [terminal](#tui.terminal) · [text-to-spec](#tui.text-to-spec) · [theme](#tui.theme) · [view](#tui.view) · [web](#tui.web) · [width](#tui.width)

# map

- tui
  <a id="tui"></a>
  - module [actions](../../src/tui/actions.ts#L1)
    <a id="tui.actions"></a><br>The catalogue of TUI actions: one registry used by the palette (`:` / Ctrl+P) and by the help popup. An action has a stable id, a label, a group, search aliases, an optional key hint and an availability predicate with a reason; `App.runAction(id)` executes it.
    - state [tui.state](tui.md#tui.state)
    - type [ActionContext](../../src/tui/actions.ts#L11)
      <a id="tui.actions.ActionContext"></a><br>What availability predicates may look at. Derived from `State` only.
    - type [Action](../../src/tui/actions.ts#L24)
      <a id="tui.actions.Action"></a>
    - type [ActionEntry](../../src/tui/actions.ts#L34)
      <a id="tui.actions.ActionEntry"></a>
    - fn [mergeOnly](../../src/tui/actions.ts#L43) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.mergeOnly"></a>
    - fn [bufferOrMerge](../../src/tui/actions.ts#L44) (ctx: ActionContext) → string | null <!-- internal -->
      <a id="tui.actions.bufferOrMerge"></a>
    - fn [openAction](../../src/tui/actions.ts#L78) (path: string) → Action
      <a id="tui.actions.openAction"></a><br>The per-file "open" action of the palette.
    - fn [catalog](../../src/tui/actions.ts#L83) (state: State) → ActionEntry[]
      <a id="tui.actions.catalog"></a><br>The full catalogue for the current session: static actions plus one "open" entry per file.
      - calls [tui.actions.availabilityOf](tui.md#tui.actions.availabilityOf), [tui.actions.openAction](tui.md#tui.actions.openAction)
    - fn [availabilityOf](../../src/tui/actions.ts#L89) (state: State) → ActionContext
      <a id="tui.actions.availabilityOf"></a><br>The availability context of the current session state.
    - fn [actionLabel](../../src/tui/actions.ts#L102) (action: Action) → string
      <a id="tui.actions.actionLabel"></a><br>The palette item text of an action: its label, with the key hint when it has one.
    - fn [matchActions](../../src/tui/actions.ts#L107) (entries: readonly ActionEntry[], query: string) → ActionEntry[]
      <a id="tui.actions.matchActions"></a><br>The catalogue entries matching `query`: every query word is a subsequence of some token of the label, key or aliases.
      - calls [tui.actions.searchText](tui.md#tui.actions.searchText), [tui.actions.subsequence](tui.md#tui.actions.subsequence)
    - fn [searchText](../../src/tui/actions.ts#L118) (action: Action) → string <!-- internal -->
      <a id="tui.actions.searchText"></a>
    - fn [subsequence](../../src/tui/actions.ts#L122) (text: string, query: string) → boolean <!-- internal -->
      <a id="tui.actions.subsequence"></a>
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
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - operations [operations.operations](operations.md#operations.operations)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - span [base.span](base.md#base.span)
    - actions [tui.actions](tui.md#tui.actions)
    - assist [tui.assist](tui.md#tui.assist)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - disk [tui.disk](tui.md#tui.disk)
    - findings [tui.findings](tui.md#tui.findings)
    - input [tui.input](tui.md#tui.input)
    - merge-session [tui.merge-session](tui.md#tui.merge-session)
    - screen [tui.screen](tui.md#tui.screen)
    - state [tui.state](tui.md#tui.state)
    - text-to-spec [tui.text-to-spec](tui.md#tui.text-to-spec)
    - view [tui.view](tui.md#tui.view)
    - width [tui.width](tui.md#tui.width)
    - type [Surface](../../src/tui/app.ts#L47)
      <a id="tui.app.Surface"></a>
    - type [Analyzer](../../src/tui/app.ts#L54) = (request: AnalysisRequest) => Promise<Analysis>
      <a id="tui.app.Analyzer"></a>
    - type [OperationRunner](../../src/tui/app.ts#L57)
      <a id="tui.app.OperationRunner"></a><br>Runs one explicit operation; the session's default is the shared `runOperation`. Tests inject a gated one.
    - type [AppOptions](../../src/tui/app.ts#L59)
      <a id="tui.app.AppOptions"></a>
    - module [App](../../src/tui/app.ts#L90)
      <a id="tui.app.App"></a>
      - fn [constructor](../../src/tui/app.ts#L111) (options: AppOptions)
        <a id="tui.app.App.constructor"></a>
        - calls [tui.input.InputDecoder](tui.md#tui.input.InputDecoder), [tui.merge-session.MergeSession](tui.md#tui.merge-session.MergeSession), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon), [tui.assist.Assist](tui.md#tui.assist.Assist), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.App.track](tui.md#tui.app.App.track), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [attach](../../src/tui/app.ts#L193) (surface: Surface, cols: number, rows: number) → void
        <a id="tui.app.App.attach"></a>
        - calls [tui.app.App.resize](tui.md#tui.app.App.resize)
      - fn [detach](../../src/tui/app.ts#L200) () → void
        <a id="tui.app.App.detach"></a><br>No surface: the screen belongs to someone else (a reconnect, `$EDITOR`, a stop); nothing is drawn.
      - fn [resize](../../src/tui/app.ts#L204) (cols: number, rows: number) → void
        <a id="tui.app.App.resize"></a>
        - calls [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [input](../../src/tui/app.ts#L212) (chunk: string) → void
        <a id="tui.app.App.input"></a>
        - calls [tui.input.InputDecoder.feed](tui.md#tui.input.InputDecoder.feed), [tui.app.typedRun](tui.md#tui.app.typedRun), [tui.app.App.safely](tui.md#tui.app.App.safely), [tui.input.InputDecoder.flush](tui.md#tui.input.InputDecoder.flush), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [safely](../../src/tui/app.ts#L246) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.safely"></a><br>One event; a failure (a file that cannot be written) is a message, never the end of the session and its unsaved buffers.
        - calls [tui.app.App.handle](tui.md#tui.app.App.handle), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [frame](../../src/tui/app.ts#L255) () → Grid
        <a id="tui.app.App.frame"></a><br>The current frame, as the transport would show it.
        - calls [tui.view.render](tui.md#tui.view.render)
      - fn [unsaved](../../src/tui/app.ts#L260) () → string[]
        <a id="tui.app.App.unsaved"></a><br>Files with unsaved changes.
      - fn [idle](../../src/tui/app.ts#L265) () → Promise<void>
        <a id="tui.app.App.idle"></a><br>Resolves when no analysis is running or waiting to start.
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [close](../../src/tui/app.ts#L270) () → void
        <a id="tui.app.App.close"></a>
        - calls [tui.assist.Assist.close](tui.md#tui.assist.Assist.close), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [draw](../../src/tui/app.ts#L280) () → void <!-- internal -->
        <a id="tui.app.App.draw"></a>
        - calls [tui.view.render](tui.md#tui.view.render), [tui.screen.renderDiff](tui.md#tui.screen.renderDiff)
      - fn [redraw](../../src/tui/app.ts#L288) () → void
        <a id="tui.app.App.redraw"></a><br>Full repaint.
        - calls [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [overlay](../../src/tui/app.ts#L295) () → Map<string, string> <!-- internal -->
        <a id="tui.app.App.overlay"></a>
      - fn [reanalyze](../../src/tui/app.ts#L302) () → void
        <a id="tui.app.App.reanalyze"></a><br>`F5` or a save: analyse now.
        - calls [map.analyze.analyze](map.md#map.analyze.analyze), [tui.app.App.overlay](tui.md#tui.app.App.overlay), [tui.app.App.selectedFinding](tui.md#tui.app.App.selectedFinding), [tui.app.App.adoptResult](tui.md#tui.app.App.adoptResult), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.app.App.wake](tui.md#tui.app.App.wake), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [adoptResult](../../src/tui/app.ts#L340) (analysis: Analysis, edits: number, selected: CheckResult | undefined) → void <!-- internal -->
        <a id="tui.app.App.adoptResult"></a>
        - calls [tui.app.App.adopt](tui.md#tui.app.App.adopt), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.sameResult](tui.md#tui.findings.sameResult), [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [reanalyzeSoon](../../src/tui/app.ts#L353) () → void <!-- internal -->
        <a id="tui.app.App.reanalyzeSoon"></a><br>Typing: mark results outdated now, analyse once the typing settles.
        - calls [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [track](../../src/tui/app.ts#L364) (work: Promise<void>) → void <!-- internal -->
        <a id="tui.app.App.track"></a><br>Async work of a helper (a model, a microphone): `idle()` waits for it, and the frame follows it.
        - calls [tui.app.App.draw](tui.md#tui.app.App.draw), [tui.app.App.wake](tui.md#tui.app.App.wake)
      - fn [quiet](../../src/tui/app.ts#L373) () → boolean <!-- internal -->
        <a id="tui.app.App.quiet"></a>
      - fn [wake](../../src/tui/app.ts#L377) () → void <!-- internal -->
        <a id="tui.app.App.wake"></a>
        - calls [tui.app.App.quiet](tui.md#tui.app.App.quiet)
      - fn [adopt](../../src/tui/app.ts#L385) (analysis: Analysis) → void <!-- internal -->
        <a id="tui.app.App.adopt"></a><br>Files and clean buffers follow the new analysis (a regenerated map, a change on disk).
        - calls [tui.app.App.diskFiles](tui.md#tui.app.App.diskFiles), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.readText](tui.md#tui.disk.readText), [tui.app.App.open](tui.md#tui.app.App.open), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [diskFiles](../../src/tui/app.ts#L409) () → string[] <!-- internal -->
        <a id="tui.app.App.diskFiles"></a>
        - calls [base.config.loadConfig](base.md#base.config.loadConfig), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [tui.app.sortFiles](tui.md#tui.app.sortFiles), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [buffer](../../src/tui/app.ts#L427) () → Buffer | null <!-- internal -->
        <a id="tui.app.App.buffer"></a>
      - fn [load](../../src/tui/app.ts#L431) (path: string) → Buffer <!-- internal -->
        <a id="tui.app.App.load"></a>
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [features.lsp-features.workspace](features.md#features.lsp-features.workspace), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.buffer.newBuffer](tui.md#tui.buffer.newBuffer)
      - fn [open](../../src/tui/app.ts#L443) (path: string, cursor: Cursor, remember = true) → void <!-- internal -->
        <a id="tui.app.App.open"></a>
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [lines](../../src/tui/app.ts#L458) () → readonly string[] <!-- internal -->
        <a id="tui.app.App.lines"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
      - fn [clampCursor](../../src/tui/app.ts#L463) () → void <!-- internal -->
        <a id="tui.app.App.clampCursor"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [keepVisible](../../src/tui/app.ts#L476) () → void <!-- internal -->
        <a id="tui.app.App.keepVisible"></a><br>Scrolls so the cursor is on screen; the layout of its line answers in logarithmic time, however long the line.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.scrollToFit](tui.md#tui.width.scrollToFit)
      - fn [edit](../../src/tui/app.ts#L492) (change: (lines: string[], cursor: Cursor) => void, coalesce = false) → void <!-- internal -->
        <a id="tui.app.App.edit"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [save](../../src/tui/app.ts#L513) () → void <!-- internal -->
        <a id="tui.app.App.save"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze)
      - fn [live](../../src/tui/app.ts#L536) () → Workspace | null <!-- internal -->
        <a id="tui.app.App.live"></a><br>The workspace of the latest analysis, with this session's buffers as the documents.
        - calls [features.lsp-features.workspace](features.md#features.lsp-features.workspace)
      - fn [lspPosition](../../src/tui/app.ts#L545) (cursor: Cursor) → LspPosition <!-- internal -->
        <a id="tui.app.App.lspPosition"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [cellAt](../../src/tui/app.ts#L553) (x: number, y: number) → Cursor | null <!-- internal -->
        <a id="tui.app.App.cellAt"></a><br>The editor line and column under a screen cell, or null.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.layout](tui.md#tui.view.layout), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.width.clusterAtCell](tui.md#tui.width.clusterAtCell), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [offsetOf](../../src/tui/app.ts#L566) (at: Cursor) → number <!-- internal -->
        <a id="tui.app.App.offsetOf"></a><br>The UTF-16 offset of a cursor in the buffer.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout)
      - fn [targetNear](../../src/tui/app.ts#L577) (cursor: Cursor) → Cursor | null <!-- internal -->
        <a id="tui.app.App.targetNear"></a><br>The id or link at the cursor; on an item line without one under the cursor, its first.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf), [tui.app.forNodes](tui.md#tui.app.forNodes), [tui.width.clusterAt](tui.md#tui.width.clusterAt), [tui.app.App.lines](tui.md#tui.app.App.lines)
      - fn [hoverAt](../../src/tui/app.ts#L591) (cursor: Cursor, x: number, y: number, source: Hover["source"]) → Hover | null <!-- internal -->
        <a id="tui.app.App.hoverAt"></a>
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [features.lsp-features.hover](features.md#features.lsp-features.hover), [features.lsp-features.definition](features.md#features.lsp-features.definition), [features.lsp-features.references](features.md#features.lsp-features.references)
      - fn [cursorAnchor](../../src/tui/app.ts#L620) (col: number) → { x: number; y: number } <!-- internal -->
        <a id="tui.app.App.cursorAnchor"></a><br>Where a popup at the cursor line is anchored: the raw line in the editor, the rendered row in reading mode.
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.view.readCursorRow](tui.md#tui.view.readCursorRow), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth)
      - fn [goToCode](../../src/tui/app.ts#L631) () → void <!-- internal -->
        <a id="tui.app.App.goToCode"></a>
        - calls [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.live](tui.md#tui.app.App.live), [features.lsp-features.definition](features.md#features.lsp-features.definition), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.app.App.jump](tui.md#tui.app.App.jump)
      - fn [jump](../../src/tui/app.ts#L649) (abs: string, line: number) → void <!-- internal -->
        <a id="tui.app.App.jump"></a><br>Opens a file at a line: a spec in the editor, code in `$EDITOR` or the built-in viewer.
        - calls [base.config.toPosix](base.md#base.config.toPosix), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.showCode](tui.md#tui.app.App.showCode)
      - fn [showCode](../../src/tui/app.ts#L665) (rel: string, abs: string, line: number) → boolean <!-- internal -->
        <a id="tui.app.App.showCode"></a><br>The built-in read-only viewer at `line` of a code file; false (with a message) when it cannot be read.
        - calls [tui.view.layout](tui.md#tui.view.layout)
      - fn [nodeAtCursor](../../src/tui/app.ts#L682) () → string | null <!-- internal -->
        <a id="tui.app.App.nodeAtCursor"></a><br>The ID of the node whose item is at the cursor line or the nearest one above it (a description, `calls`).
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [lineOfNode](../../src/tui/app.ts#L694) (path: string, id: string) → number | null <!-- internal -->
        <a id="tui.app.App.lineOfNode"></a><br>The 0-based line of the item that declares `id` in the file at `path`, or null.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.forNodes](tui.md#tui.app.forNodes)
      - fn [mapDirs](../../src/tui/app.ts#L702) (analysis: Analysis) → { map: string; explained: string } <!-- internal -->
        <a id="tui.app.App.mapDirs"></a><br>The map directory of each variant, relative to the root.
      - fn [toggleMap](../../src/tui/app.ts#L707) () → void <!-- internal -->
        <a id="tui.app.App.toggleMap"></a><br>`t`: the same layer file in the other map, the cursor on the same node.
        - calls [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.nodeAtCursor](tui.md#tui.app.App.nodeAtCursor), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.app.App.open](tui.md#tui.app.App.open)
      - fn [goToNode](../../src/tui/app.ts#L734) (id: string) → void <!-- internal -->
        <a id="tui.app.App.goToNode"></a><br>The node's line in the map the reader is in: the explained map from one of its files, the map otherwise.
        - calls [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.mapDirs](tui.md#tui.app.App.mapDirs), [tui.app.App.lineOfNode](tui.md#tui.app.App.lineOfNode), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [goToSpec](../../src/tui/app.ts#L747) (id: string | null) → void <!-- internal -->
        <a id="tui.app.App.goToSpec"></a>
        - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.open](tui.md#tui.app.App.open), [tui.width.clusterAt](tui.md#tui.width.clusterAt)
      - fn [idAtCursor](../../src/tui/app.ts#L762) () → string | null <!-- internal -->
        <a id="tui.app.App.idAtCursor"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [tui.app.App.offsetOf](tui.md#tui.app.App.offsetOf)
      - fn [goBack](../../src/tui/app.ts#L770) () → void <!-- internal -->
        <a id="tui.app.App.goBack"></a>
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [handle](../../src/tui/app.ts#L788) (event: InputEvent) → void <!-- internal -->
        <a id="tui.app.App.handle"></a>
        - calls [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.mouse](tui.md#tui.app.App.mouse), [tui.app.App.promptType](tui.md#tui.app.App.promptType), [tui.app.App.insert](tui.md#tui.app.App.insert), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.promptKey](tui.md#tui.app.App.promptKey), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.returnToFindings](tui.md#tui.app.App.returnToFindings), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.resultsKey](tui.md#tui.app.App.resultsKey), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.openResults](tui.md#tui.app.App.openResults), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.merge-session.MergeSession.key](tui.md#tui.merge-session.MergeSession.key), [tui.app.App.codeKey](tui.md#tui.app.App.codeKey), [tui.app.App.editKey](tui.md#tui.app.App.editKey), [tui.app.App.contextKey](tui.md#tui.app.App.contextKey), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.viewKey](tui.md#tui.app.App.viewKey)
      - fn [quit](../../src/tui/app.ts#L848) () → void <!-- internal -->
        <a id="tui.app.App.quit"></a>
        - calls [tui.app.App.unsaved](tui.md#tui.app.App.unsaved), [tui.app.App.close](tui.md#tui.app.App.close)
      - fn [move](../../src/tui/app.ts#L859) (lines: number) → void <!-- internal -->
        <a id="tui.app.App.move"></a>
        - calls [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [common](../../src/tui/app.ts#L866) (event: KeyEvent) → boolean <!-- internal -->
        <a id="tui.app.App.common"></a>
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [cycleFocus](../../src/tui/app.ts#L907) () → void <!-- internal -->
        <a id="tui.app.App.cycleFocus"></a>
        - calls [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex)
      - fn [viewKey](../../src/tui/app.ts#L914) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.viewKey"></a>
        - calls [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.goToSpec](tui.md#tui.app.App.goToSpec), [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.assist.Assist.agentDraft](tui.md#tui.assist.Assist.agentDraft), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.move](tui.md#tui.app.App.move), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.targetNear](tui.md#tui.app.App.targetNear), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.merge-session.MergeSession.undo](tui.md#tui.merge-session.MergeSession.undo), [tui.app.App.explainAtCursor](tui.md#tui.app.App.explainAtCursor), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.openPalette](tui.md#tui.app.App.openPalette), [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [editKey](../../src/tui/app.ts#L1002) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKey"></a>
        - calls [tui.assist.Assist.acceptGhost](tui.md#tui.assist.Assist.acceptGhost), [tui.assist.Assist.dropGhost](tui.md#tui.assist.Assist.dropGhost), [tui.app.App.editKeyWithoutGhost](tui.md#tui.app.App.editKeyWithoutGhost), [tui.assist.Assist.ghostSoon](tui.md#tui.assist.Assist.ghostSoon)
      - fn [editKeyWithoutGhost](../../src/tui/app.ts#L1020) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.editKeyWithoutGhost"></a>
        - calls [tui.app.App.acceptCompletion](tui.md#tui.app.App.acceptCompletion), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.save](tui.md#tui.app.App.save), [tui.assist.Assist.voice](tui.md#tui.assist.Assist.voice), [tui.app.App.undoEdit](tui.md#tui.app.App.undoEdit), [tui.app.App.textToSpec](tui.md#tui.app.App.textToSpec), [tui.app.App.complete](tui.md#tui.app.App.complete), [tui.app.App.goBack](tui.md#tui.app.App.goBack), [tui.app.App.common](tui.md#tui.app.App.common), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.insert](tui.md#tui.app.App.insert)
      - fn [insert](../../src/tui/app.ts#L1094) (raw: string) → void <!-- internal -->
        <a id="tui.app.App.insert"></a>
        - calls [tui.app.printable](tui.md#tui.app.printable), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.complete](tui.md#tui.app.App.complete)
      - fn [undoEdit](../../src/tui/app.ts#L1122) () → void <!-- internal -->
        <a id="tui.app.App.undoEdit"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.reanalyzeSoon](tui.md#tui.app.App.reanalyzeSoon)
      - fn [complete](../../src/tui/app.ts#L1140) (explicit: boolean) → void <!-- internal -->
        <a id="tui.app.App.complete"></a><br>Opens or refreshes the completion list; `explicit` (Ctrl+Space) also opens it mid-word.
        - calls [tui.app.App.live](tui.md#tui.app.App.live), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [features.lsp-features.completions](features.md#features.lsp-features.completions), [tui.app.App.lspPosition](tui.md#tui.app.App.lspPosition), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [acceptCompletion](../../src/tui/app.ts#L1169) () → void <!-- internal -->
        <a id="tui.app.App.acceptCompletion"></a>
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.app.App.edit](tui.md#tui.app.App.edit), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [fixNavIndex](../../src/tui/app.ts#L1187) (direction: 1 | -1) → void <!-- internal -->
        <a id="tui.app.App.fixNavIndex"></a>
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.layout](tui.md#tui.view.layout), [tui.view.navListHeight](tui.md#tui.view.navListHeight)
      - fn [toggleFiles](../../src/tui/app.ts#L1201) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleFiles"></a>
        - calls [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleNav](../../src/tui/app.ts#L1208) (focusable: boolean) → void <!-- internal -->
        <a id="tui.app.App.toggleNav"></a>
        - calls [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [toggleContext](../../src/tui/app.ts#L1214) (focus = true) → void <!-- internal -->
        <a id="tui.app.App.toggleContext"></a>
        - calls [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [contextPack](../../src/tui/app.ts#L1223) () → ContextPack | null
        <a id="tui.app.App.contextPack"></a><br>The pack for the current buffer and cursor line; null before the first analysis.
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [features.agent-context.contextPack](features.md#features.agent-context.contextPack)
      - fn [contextKey](../../src/tui/app.ts#L1231) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.contextKey"></a>
        - calls [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext)
      - fn [addToContext](../../src/tui/app.ts#L1265) (id: string) → void <!-- internal -->
        <a id="tui.app.App.addToContext"></a>
        - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode)
      - fn [explainAtCursor](../../src/tui/app.ts#L1283) () → void <!-- internal -->
        <a id="tui.app.App.explainAtCursor"></a><br>`e`: the offline summary of the id under the cursor, with its saved explanation (model, date, stale?).
        - calls [tui.app.App.idAtCursor](tui.md#tui.app.App.idAtCursor), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.isStale](features.md#features.explain-llm.isStale), [tui.app.App.cursorAnchor](tui.md#tui.app.App.cursorAnchor), [tui.view.layout](tui.md#tui.view.layout)
      - fn [navKey](../../src/tui/app.ts#L1308) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.navKey"></a>
        - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.jump](tui.md#tui.app.App.jump), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [filesKey](../../src/tui/app.ts#L1355) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.filesKey"></a>
        - calls [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.cycleFocus](tui.md#tui.app.App.cycleFocus), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [codeKey](../../src/tui/app.ts#L1383) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.codeKey"></a>
        - calls [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.goBack](tui.md#tui.app.App.goBack)
      - fn [startDoctor](../../src/tui/app.ts#L1424) () → void <!-- internal -->
        <a id="tui.app.App.startDoctor"></a><br>Runs doctor as the session's one explicit operation and records it for F6. The UI never blocks: the record turns "running" and the result (or a failure) lands later; a second operation is refused while one runs.
        - calls [tui.app.App.track](tui.md#tui.app.App.track), [operations.operations.runOperation](operations.md#operations.operations.runOperation), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.view.recordStatus](tui.md#tui.view.recordStatus), [tui.app.App.draw](tui.md#tui.app.App.draw)
      - fn [openResults](../../src/tui/app.ts#L1472) () → void <!-- internal -->
        <a id="tui.app.App.openResults"></a><br>F6 or the palette: the pinned current analysis and the history of operation records.
        - calls [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [closeResults](../../src/tui/app.ts#L1489) () → void <!-- internal -->
        <a id="tui.app.App.closeResults"></a><br>Esc closes the panel, not the running operation; the focus goes back where F6 was pressed.
      - fn [rerunRecord](../../src/tui/app.ts#L1498) () → void <!-- internal -->
        <a id="tui.app.App.rerunRecord"></a><br>Enter in the panel: reruns the selected record with its exact parameters.
        - calls [tui.app.App.startDoctor](tui.md#tui.app.App.startDoctor)
      - fn [resultsKey](../../src/tui/app.ts#L1512) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.resultsKey"></a><br>While the panel is open its keys stay with it; Tab switches between the entries and the content.
        - calls [tui.app.App.findingsKey](tui.md#tui.app.App.findingsKey), [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.scrollReport](tui.md#tui.app.App.scrollReport), [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding), [tui.app.App.rerunRecord](tui.md#tui.app.App.rerunRecord), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.quit](tui.md#tui.app.App.quit)
      - fn [findingsKey](../../src/tui/app.ts#L1564) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.findingsKey"></a><br>The keys of the pinned "Current analysis" entry: the findings list with verdict filters.
        - calls [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.moveFinding](tui.md#tui.app.App.moveFinding), [tui.app.App.openFinding](tui.md#tui.app.App.openFinding), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.closeResults](tui.md#tui.app.App.closeResults), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [moveFinding](../../src/tui/app.ts#L1615) (delta: number) → void <!-- internal -->
        <a id="tui.app.App.moveFinding"></a><br>Moves the finding selection and keeps it in the visible part of the list.
        - calls [tui.app.App.clampFinding](tui.md#tui.app.App.clampFinding)
      - fn [clampFinding](../../src/tui/app.ts#L1621) () → void <!-- internal -->
        <a id="tui.app.App.clampFinding"></a><br>The finding selection stays within the filtered list, and the list scrolls to keep it in view.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.view.findingsListRows](tui.md#tui.view.findingsListRows), [tui.view.layout](tui.md#tui.view.layout)
      - fn [selectedFinding](../../src/tui/app.ts#L1631) () → CheckResult | undefined <!-- internal -->
        <a id="tui.app.App.selectedFinding"></a><br>The finding selected in the filtered list of the current analysis, if any.
        - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf)
      - fn [openFinding](../../src/tui/app.ts#L1641) () → void <!-- internal -->
        <a id="tui.app.App.openFinding"></a><br>Enter on a finding: the panel hides while the target is shown — a spec position in the editor (the file need not be among the Markdown buffers) or the line in the read-only code viewer. Esc / Ctrl+O return to the list without losing the selection and put back the place it was…
        - calls [tui.app.App.selectedFinding](tui.md#tui.app.App.selectedFinding), [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines), [tui.app.App.load](tui.md#tui.app.App.load), [tui.width.clusterAt](tui.md#tui.width.clusterAt), [tui.app.App.open](tui.md#tui.app.App.open), [tui.app.App.showCode](tui.md#tui.app.App.showCode)
      - fn [returnToFindings](../../src/tui/app.ts#L1668) () → void <!-- internal -->
        <a id="tui.app.App.returnToFindings"></a><br>Back from a finding's target: the list with its selection, over the place the finding was opened from.
        - calls [tui.app.App.load](tui.md#tui.app.App.load), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor)
      - fn [scrollReport](../../src/tui/app.ts#L1689) (delta: number) → void <!-- internal -->
        <a id="tui.app.App.scrollReport"></a>
        - calls [tui.app.App.moveFinding](tui.md#tui.app.App.moveFinding), [tui.view.resultsReportRows](tui.md#tui.view.resultsReportRows)
      - fn [mouse](../../src/tui/app.ts#L1698) (event: MouseEvent) → void <!-- internal -->
        <a id="tui.app.App.mouse"></a>
        - calls [tui.app.App.scrollReport](tui.md#tui.app.App.scrollReport), [tui.view.layout](tui.md#tui.view.layout), [tui.app.App.contextPack](tui.md#tui.app.App.contextPack), [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.app.App.clampCursor](tui.md#tui.app.App.clampCursor), [tui.app.App.cellAt](tui.md#tui.app.App.cellAt), [tui.app.App.hoverAt](tui.md#tui.app.App.hoverAt), [tui.view.contextTop](tui.md#tui.view.contextTop), [tui.app.App.fixNavIndex](tui.md#tui.app.App.fixNavIndex), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.app.App.navKey](tui.md#tui.app.App.navKey), [tui.view.filesTop](tui.md#tui.view.filesTop), [tui.app.App.filesKey](tui.md#tui.app.App.filesKey), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible), [tui.app.App.goToCode](tui.md#tui.app.App.goToCode)
      - fn [promptType](../../src/tui/app.ts#L1779) (text: string) → void <!-- internal -->
        <a id="tui.app.App.promptType"></a>
        - calls [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes)
      - fn [findNodes](../../src/tui/app.ts#L1787) () → void <!-- internal -->
        <a id="tui.app.App.findNodes"></a><br>The nodes matching the `s` prompt: names and IDs as a subsequence, then words of their explanations.
        - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes)
      - fn [promptKey](../../src/tui/app.ts#L1797) (event: KeyEvent) → void <!-- internal -->
        <a id="tui.app.App.promptKey"></a>
        - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.findNext](tui.md#tui.app.App.findNext), [tui.app.App.addToContext](tui.md#tui.app.App.addToContext), [tui.app.App.goToNode](tui.md#tui.app.App.goToNode), [tui.app.App.runAction](tui.md#tui.app.App.runAction), [tui.app.App.promptType](tui.md#tui.app.App.promptType)
      - fn [openPalette](../../src/tui/app.ts#L1834) () → void <!-- internal -->
        <a id="tui.app.App.openPalette"></a><br>`:` in view/read, Ctrl+P anywhere: the full catalogue with fuzzy search.
        - calls [tui.app.App.refreshPalette](tui.md#tui.app.App.refreshPalette)
      - fn [refreshPalette](../../src/tui/app.ts#L1840) () → void <!-- internal -->
        <a id="tui.app.App.refreshPalette"></a><br>The catalogue entries matching the prompt text, as parallel item arrays.
        - calls [tui.actions.matchActions](tui.md#tui.actions.matchActions), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.actions.actionLabel](tui.md#tui.actions.actionLabel)
      - fn [runAction](../../src/tui/app.ts#L1856) (id: string) → void <!-- internal -->
        <a id="tui.app.App.runAction"></a><br>Executes a palette action by its id. An unavailable action explains its reason; execution never synthesizes fake key events.
        - calls [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.app.App.reanalyze](tui.md#tui.app.App.reanalyze), [tui.app.App.toggleFiles](tui.md#tui.app.App.toggleFiles), [tui.app.App.toggleNav](tui.md#tui.app.App.toggleNav), [tui.app.App.toggleContext](tui.md#tui.app.App.toggleContext), [tui.app.App.openResults](tui.md#tui.app.App.openResults), [tui.app.App.startDoctor](tui.md#tui.app.App.startDoctor), [tui.app.App.findNodes](tui.md#tui.app.App.findNodes), [tui.app.App.toggleMap](tui.md#tui.app.App.toggleMap), [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.merge-session.MergeSession.open](tui.md#tui.merge-session.MergeSession.open), [tui.app.packageVersion](tui.md#tui.app.packageVersion), [tui.app.App.quit](tui.md#tui.app.App.quit), [tui.app.App.open](tui.md#tui.app.App.open)
      - fn [findNext](../../src/tui/app.ts#L1910) () → void <!-- internal -->
        <a id="tui.app.App.findNext"></a>
        - calls [tui.app.App.lines](tui.md#tui.app.App.lines), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.app.App.keepVisible](tui.md#tui.app.App.keepVisible)
      - fn [textToSpec](../../src/tui/app.ts#L1928) () → void <!-- internal -->
        <a id="tui.app.App.textToSpec"></a>
        - calls [tui.app.App.buffer](tui.md#tui.app.App.buffer), [tui.app.plannedIds](tui.md#tui.app.plannedIds), [tui.text-to-spec.textToSpec](tui.md#tui.text-to-spec.textToSpec), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start)
    - fn [forNodes](../../src/tui/app.ts#L1975) (doc: Document, visit: (node: Node) => void) → void <!-- internal -->
      <a id="tui.app.forNodes"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [plannedIds](../../src/tui/app.ts#L1979) (docs: readonly Document[]) → { id: string; kind: string }[] <!-- internal -->
      <a id="tui.app.plannedIds"></a>
      - calls [tui.app.forNodes](tui.md#tui.app.forNodes)
    - fn [sortFiles](../../src/tui/app.ts#L1990) (files: string[], analysis: Analysis | null) → string[] <!-- internal -->
      <a id="tui.app.sortFiles"></a><br>Hand-written specs first (flows, rules), then generated map files, then `keylang.json`.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [typedRun](../../src/tui/app.ts#L1996) (events: readonly InputEvent[], from: number) → KeyEvent[] <!-- internal -->
      <a id="tui.app.typedRun"></a><br>The keys from `from` on that only type text (letters, Enter, Tab without modifiers).
    - fn [printable](../../src/tui/app.ts#L2010) (text: string) → string <!-- internal -->
      <a id="tui.app.printable"></a><br>Text that may go into a spec: escape sequences (colored output pasted from a terminal) and other control characters are removed; tabs and line breaks stay.
    - fn [packageVersion](../../src/tui/app.ts#L2018) () → string <!-- internal -->
      <a id="tui.app.packageVersion"></a><br>The package version, for the "About keylang" palette action.
  - module [assist](../../src/tui/assist.ts#L1)
    <a id="tui.assist"></a><br>What a model or a microphone adds to a session: ghost text, voice, and the agent's draft of a flow (`Ctrl+Space` in the view). Each finishes later than it was asked for, so each remembers where it was asked — the buffer, its text version and the mode — and lands only while that…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - draft [features.draft](features.md#features.draft)
    - ghost [features.ghost](features.md#features.ghost)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - proposals [features.proposals](features.md#features.proposals)
    - stats [features.stats](features.md#features.stats)
    - voice [features.voice](features.md#features.voice)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - merge-session [tui.merge-session](tui.md#tui.merge-session)
    - state [tui.state](tui.md#tui.state)
    - width [tui.width](tui.md#tui.width)
    - llm [features.llm](features.md#features.llm)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - draft-llm [features.draft-llm](features.md#features.draft-llm)
    - type [Microphone](../../src/tui/assist.ts#L25)
      <a id="tui.assist.Microphone"></a>
    - type [AssistHost](../../src/tui/assist.ts#L28)
      <a id="tui.assist.AssistHost"></a><br>What the assists need from the session around them.
    - type [Spot](../../src/tui/assist.ts#L44) <!-- internal -->
      <a id="tui.assist.Spot"></a><br>Where async work was asked for; it lands only while the session is still there.
    - type [Recording](../../src/tui/assist.ts#L51) <!-- internal -->
      <a id="tui.assist.Recording"></a><br>A recording from its first `Ctrl+R`: the microphone may still be opening when the second one comes.
    - fn [countSuggestion](../../src/tui/assist.ts#L58) (root: string, source: "ghost" | "completion", field: "proposed" | "accepted" | "rejected", shown: number | null | undefined) → void
      <a id="tui.assist.countSuggestion"></a><br>Counts for design §7.3: ghost measured against the deterministic completion; an unwritable `.keylang/` only loses the count.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats)
    - module [Assist](../../src/tui/assist.ts#L70)
      <a id="tui.assist.Assist"></a>
      - fn [constructor](../../src/tui/assist.ts#L78) (host: AssistHost, microphone: Microphone)
        <a id="tui.assist.Assist.constructor"></a>
      - fn [state](../../src/tui/assist.ts#L83) () → State <!-- internal -->
        <a id="tui.assist.Assist.state"></a>
      - fn [waiting](../../src/tui/assist.ts#L88) () → boolean
        <a id="tui.assist.Assist.waiting"></a><br>A ghost request waits for its pause.
      - fn [recordingNow](../../src/tui/assist.ts#L92) () → boolean
        <a id="tui.assist.Assist.recordingNow"></a>
      - fn [close](../../src/tui/assist.ts#L96) () → void
        <a id="tui.assist.Assist.close"></a>
        - calls [tui.assist.Assist.stopGhostTimer](tui.md#tui.assist.Assist.stopGhostTimer)
      - fn [spot](../../src/tui/assist.ts#L101) (buffer: Buffer) → Spot <!-- internal -->
        <a id="tui.assist.Assist.spot"></a>
      - fn [at](../../src/tui/assist.ts#L106) (spot: Spot) → boolean <!-- internal -->
        <a id="tui.assist.Assist.at"></a><br>The session is where `spot` was taken: the same buffer, its text unchanged, the same mode, no merge on top.
      - fn [stopGhostTimer](../../src/tui/assist.ts#L113) () → void <!-- internal -->
        <a id="tui.assist.Assist.stopGhostTimer"></a>
      - fn [ghostSoon](../../src/tui/assist.ts#L121) () → void
        <a id="tui.assist.Assist.ghostSoon"></a><br>After a pause with the cursor on a new flow item, ask the agent for one next line.
        - calls [tui.assist.Assist.stopGhostTimer](tui.md#tui.assist.Assist.stopGhostTimer), [features.ghost.ghostSignal](features.md#features.ghost.ghostSignal), [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.ghost.ghostSuggestions](features.md#features.ghost.ghostSuggestions), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [acceptGhost](../../src/tui/assist.ts#L150) (ghost: NonNullable<State["ghost"]>) → void
        <a id="tui.assist.Assist.acceptGhost"></a><br>`Tab` on a ghost line: taken only into the text it was shown for.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [dropGhost](../../src/tui/assist.ts#L166) () → void
        <a id="tui.assist.Assist.dropGhost"></a><br>Anything but `Tab` and `Alt+]` drops a shown ghost line.
        - calls [tui.assist.countSuggestion](tui.md#tui.assist.countSuggestion)
      - fn [voice](../../src/tui/assist.ts#L182) () → void
        <a id="tui.assist.Assist.voice"></a><br>`Ctrl+R`: record until `Ctrl+R` again (or the source ends), recognize, and insert: on a new list item a command («крок …», «коли … тоді …») becomes the item, anything else is free text at the cursor. The speech goes in only while the same buffer, with the same text, is still…
        - calls [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.voice.voiceEngine](features.md#features.voice.voiceEngine), [features.voice.glossary](features.md#features.voice.glossary), [features.voice.transcribeOpenRouter](features.md#features.voice.transcribeOpenRouter), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.assist.Assist.insertSpeech](tui.md#tui.assist.Assist.insertSpeech), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [insertSpeech](../../src/tui/assist.ts#L249) (text: string, line: number, analysis: Analysis) → void <!-- internal -->
        <a id="tui.assist.Assist.insertSpeech"></a>
        - calls [features.voice.speechToSpec](features.md#features.voice.speechToSpec), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [agentDraft](../../src/tui/assist.ts#L280) () → void
        <a id="tui.assist.Assist.agentDraft"></a><br>`Ctrl+Space` in the view: the agent drafts the flow under the cursor (hybrid, with the context panel's pack), the draft becomes the file's proposal and opens as MERGE. Nothing is written before `a` and `w`, and an existing proposal of the file is never overwritten.
        - calls [tui.buffer.docOf](tui.md#tui.buffer.docOf), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [tui.assist.Assist.spot](tui.md#tui.assist.Assist.spot), [features.agent-context.contextText](features.md#features.agent-context.contextText), [features.proposals.writeProposal](features.md#features.proposals.writeProposal), [features.draft.withFlow](features.md#features.draft.withFlow), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [tui.assist.Assist.at](tui.md#tui.assist.Assist.at), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
  - module [background](../../src/tui/background.ts#L1)
    <a id="tui.background"></a><br>Snapshot generation off the UI thread. One long-lived worker builds the map (tree-sitter extraction, graph, render); the caller parses specs and assesses on its own thread, which is fast.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - map [map.map](map.md#map.map)
    - analysis-worker [tui.analysis-worker](tui.md#tui.analysis-worker)
    - type [Reply](../../src/tui/background.ts#L11) <!-- internal -->
      <a id="tui.background.Reply"></a>
    - module [SnapshotWorker](../../src/tui/background.ts#L17)
      <a id="tui.background.SnapshotWorker"></a>
      - fn [constructor](../../src/tui/background.ts#L21)
        <a id="tui.background.SnapshotWorker.constructor"></a>
      - fn [generate](../../src/tui/background.ts#L24) (config: Config, options: { overlay: ReadonlyMap<string, string> }) → Promise<MapResult>
        <a id="tui.background.SnapshotWorker.generate"></a><br>`generateMap` for `analyze({ generate })`; the fact cache is only read.
        - calls [tui.background.SnapshotWorker.start](tui.md#tui.background.SnapshotWorker.start), [map.map.generateMap](map.md#map.map.generateMap)
      - fn [close](../../src/tui/background.ts#L35) () → void
        <a id="tui.background.SnapshotWorker.close"></a>
      - fn [start](../../src/tui/background.ts#L40) () → Worker | null <!-- internal -->
        <a id="tui.background.SnapshotWorker.start"></a>
        - calls [tui.background.SnapshotWorker.fail](tui.md#tui.background.SnapshotWorker.fail)
      - fn [fail](../../src/tui/background.ts#L68) (error: Error) → void <!-- internal -->
        <a id="tui.background.SnapshotWorker.fail"></a>
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
    - fn [setText](../../src/tui/buffer.ts#L25) (buffer: Buffer, text: string) → void
      <a id="tui.buffer.setText"></a>
      - calls [tui.buffer.docOf](tui.md#tui.buffer.docOf)
    - type [Cached](../../src/tui/buffer.ts#L31) <!-- internal -->
      <a id="tui.buffer.Cached"></a>
    - fn [cached](../../src/tui/buffer.ts#L39) (buffer: Buffer) → Cached <!-- internal -->
      <a id="tui.buffer.cached"></a>
    - fn [bufferLines](../../src/tui/buffer.ts#L48) (buffer: Buffer) → readonly string[]
      <a id="tui.buffer.bufferLines"></a>
      - calls [tui.buffer.cached](tui.md#tui.buffer.cached)
    - fn [lineLayout](../../src/tui/buffer.ts#L53) (buffer: Buffer, index: number) → LineLayout
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
      <a id="tui.disk.Eol"></a>
    - fn [readText](../../src/tui/disk.ts#L12) (abs: string) → string | null
      <a id="tui.disk.readText"></a>
    - fn [lf](../../src/tui/disk.ts#L20) (text: string) → string
      <a id="tui.disk.lf"></a>
    - fn [splitEol](../../src/tui/disk.ts#L29) (raw: string) → { text: string; eol: Eol }
      <a id="tui.disk.splitEol"></a><br>A file's text with `\n` line ends, and the ending a save restores. Only a file that uses CRLF throughout is converted; mixed endings stay as they are, so a save does not touch lines nobody edited.
      - calls [tui.disk.lf](tui.md#tui.disk.lf)
    - fn [withEol](../../src/tui/disk.ts#L35) (text: string, eol: Eol) → string
      <a id="tui.disk.withEol"></a>
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
      <a id="tui.evidence.Mark"></a>
    - type [LineEvidence](../../src/tui/evidence.ts#L15)
      <a id="tui.evidence.LineEvidence"></a>
    - fn [worse](../../src/tui/evidence.ts#L26) (a: Mark | null, b: Mark | null) → Mark | null
      <a id="tui.evidence.worse"></a>
    - fn [plannedLines](../../src/tui/evidence.ts#L32) (doc: Document) → Set<number> <!-- internal -->
      <a id="tui.evidence.plannedLines"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [pendingPlanned](../../src/tui/evidence.ts#L45) (analysis: Analysis) → Set<string> <!-- internal -->
      <a id="tui.evidence.pendingPlanned"></a><br>IDs declared `planned` that the snapshot does not have yet: evidence about them is missing by intention.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [allEvidence](../../src/tui/evidence.ts#L63) (analysis: Analysis) → Map<string, Map<number, LineEvidence>> <!-- internal -->
      <a id="tui.evidence.allEvidence"></a>
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
      <a id="tui.findings.FindingVerdict"></a>
    - type [VerdictFilter](../../src/tui/findings.ts#L16) = Record<FindingVerdict, boolean>
      <a id="tui.findings.VerdictFilter"></a><br>Which verdicts the findings list shows; the report itself never changes.
    - fn [findingsOf](../../src/tui/findings.ts#L35) (analysis: Analysis | null) → readonly CheckResult[]
      <a id="tui.findings.findingsOf"></a><br>The current analysis as the CLI reports it in `check --format json`.
      - calls [features.check-results.checkResults](features.md#features.check-results.checkResults)
    - fn [visibleFindings](../../src/tui/findings.ts#L45) (findings: readonly CheckResult[], filter: VerdictFilter) → CheckResult[]
      <a id="tui.findings.visibleFindings"></a>
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
      <a id="tui.input.KeyEvent"></a>
    - type [MouseEvent](../../src/tui/input.ts#L19)
      <a id="tui.input.MouseEvent"></a>
    - type [PasteEvent](../../src/tui/input.ts#L32)
      <a id="tui.input.PasteEvent"></a>
    - type [InputEvent](../../src/tui/input.ts#L37) = KeyEvent | MouseEvent | PasteEvent
      <a id="tui.input.InputEvent"></a>
    - fn [key](../../src/tui/input.ts#L42) (name: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}, text?: string) → KeyEvent <!-- internal -->
      <a id="tui.input.key"></a>
    - fn [modifiers](../../src/tui/input.ts#L52) (param: string | undefined) → { ctrl: boolean; alt: boolean; shift: boolean } <!-- internal -->
      <a id="tui.input.modifiers"></a>
    - fn [partialSuffix](../../src/tui/input.ts#L58) (text: string, marker: string) → number <!-- internal -->
      <a id="tui.input.partialSuffix"></a><br>Length of the longest suffix of `text` that is a proper prefix of `marker`.
    - module [InputDecoder](../../src/tui/input.ts#L63)
      <a id="tui.input.InputDecoder"></a>
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
        <a id="tui.input.InputDecoder.next"></a>
        - calls [tui.input.InputDecoder.escape](tui.md#tui.input.InputDecoder.escape), [tui.input.key](tui.md#tui.input.key), [tui.width.graphemes](tui.md#tui.width.graphemes)
      - fn [escape](../../src/tui/input.ts#L145) (text: string) → { length: number; event: InputEvent | null } | null <!-- internal -->
        <a id="tui.input.InputDecoder.escape"></a>
        - calls [tui.input.InputDecoder.mouse](tui.md#tui.input.InputDecoder.mouse), [tui.input.key](tui.md#tui.input.key), [tui.input.modifiers](tui.md#tui.input.modifiers), [tui.input.InputDecoder.next](tui.md#tui.input.InputDecoder.next)
      - fn [mouse](../../src/tui/input.ts#L177) (code: number, x: number, y: number, press: boolean) → MouseEvent <!-- internal -->
        <a id="tui.input.InputDecoder.mouse"></a>
  - module [markdown](../../src/tui/markdown.ts#L1)
    <a id="tui.markdown"></a><br>Reading mode (`v`): the spec rendered as text — headings, bullets, tables, code blocks, inline code, emphasis and links — wrapped to the width. Every row keeps its source line, so the gutter marks and `Enter` on an ID still work.
    - screen [tui.screen](tui.md#tui.screen)
    - theme [tui.theme](tui.md#tui.theme)
    - width [tui.width](tui.md#tui.width)
    - type [Segment](../../src/tui/markdown.ts#L11)
      <a id="tui.markdown.Segment"></a>
    - type [ReadRow](../../src/tui/markdown.ts#L16)
      <a id="tui.markdown.ReadRow"></a>
    - fn [inline](../../src/tui/markdown.ts#L24) (written: string, base: Style) → Segment[]
      <a id="tui.markdown.inline"></a>
    - fn [wrap](../../src/tui/markdown.ts#L44) (segments: Segment[], width: number, hang: number, source: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.wrap"></a><br>Word-wraps segments to `width` cells; continuation rows start with `hang` spaces.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [tableRows](../../src/tui/markdown.ts#L65) (block: { text: string; line: number }[], width: number) → ReadRow[] <!-- internal -->
      <a id="tui.markdown.tableRows"></a>
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth)
    - fn [renderMarkdown](../../src/tui/markdown.ts#L85) (text: string, width: number) → ReadRow[]
      <a id="tui.markdown.renderMarkdown"></a>
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
    - module [MergeSession](../../src/tui/merge-session.ts#L36)
      <a id="tui.merge-session.MergeSession"></a>
      - fn [constructor](../../src/tui/merge-session.ts#L39) (host: MergeHost)
        <a id="tui.merge-session.MergeSession.constructor"></a>
      - fn [state](../../src/tui/merge-session.ts#L43) () → State <!-- internal -->
        <a id="tui.merge-session.MergeSession.state"></a>
      - fn [scan](../../src/tui/merge-session.ts#L50) () → string[]
        <a id="tui.merge-session.MergeSession.scan"></a><br>Proposals that may be merged; the rest are listed with the reason they are ignored.
        - calls [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem)
      - fn [files](../../src/tui/merge-session.ts#L54) () → string[] <!-- internal -->
        <a id="tui.merge-session.MergeSession.files"></a>
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [specDir](../../src/tui/merge-session.ts#L69) () → string
        <a id="tui.merge-session.MergeSession.specDir"></a><br>The spec directory relative to the root, POSIX (`keylang`).
        - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [problem](../../src/tui/merge-session.ts#L85) (path: string) → string | null
        <a id="tui.merge-session.MergeSession.problem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A Markdown proposal replaces one hand-written spec: a file under the spec directory, not a generated map file, and not reached through a link that leads out.
        - calls [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText)
      - fn [boundary](../../src/tui/merge-session.ts#L95) (code: boolean) → string <!-- internal -->
        <a id="tui.merge-session.MergeSession.boundary"></a><br>The directory a merge of `path` may write in: the spec directory for a spec, the repository for code.
        - calls [tui.merge-session.MergeSession.specDir](tui.md#tui.merge-session.MergeSession.specDir)
      - fn [proposalAbs](../../src/tui/merge-session.ts#L99) (path: string) → string <!-- internal -->
        <a id="tui.merge-session.MergeSession.proposalAbs"></a>
      - fn [open](../../src/tui/merge-session.ts#L110) (wanted?: string) → void
        <a id="tui.merge-session.MergeSession.open"></a><br>Opens the proposal of `wanted`, else of the current file, else the first one, as a MERGE diff against the file on disk. Proposals that break the format's limits are ignored with the reason.
        - calls [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [tui.merge-session.MergeSession.files](tui.md#tui.merge-session.MergeSession.files), [tui.merge-session.MergeSession.problem](tui.md#tui.merge-session.MergeSession.problem), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge-session.MergeSession.start](tui.md#tui.merge-session.MergeSession.start), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.lf](tui.md#tui.disk.lf)
      - fn [start](../../src/tui/merge-session.ts#L146) (path: string, origin: MergeState["origin"], base: string[], proposed: string[], disk: string | null, proposal: string | null) → void
        <a id="tui.merge-session.MergeSession.start"></a><br>A merge of `proposed` into `base`; `proposal` is the proposal file's text (null for `Ctrl+G`).
        - calls [tui.merge.diffLines](tui.md#tui.merge.diffLines), [tui.merge-session.MergeSession.dropProposal](tui.md#tui.merge-session.MergeSession.dropProposal), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
      - fn [dropProposal](../../src/tui/merge-session.ts#L163) (path: string, text: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.dropProposal"></a><br>Removes the proposal of `path` while it is still `text`.
        - calls [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.disk.readText](tui.md#tui.disk.readText), [tui.disk.removeInside](tui.md#tui.disk.removeInside)
      - fn [key](../../src/tui/merge-session.ts#L174) (event: KeyEvent) → void
        <a id="tui.merge-session.MergeSession.key"></a>
        - calls [tui.merge-session.MergeSession.write](tui.md#tui.merge-session.MergeSession.write), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave)
      - fn [leave](../../src/tui/merge-session.ts#L229) (merge: MergeState, message: string) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.leave"></a>
      - fn [write](../../src/tui/merge-session.ts#L246) () → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.write"></a><br>Applies the decided hunks. A proposal file is the external change being confirmed, so the result goes to disk.
        - calls [tui.merge-session.MergeSession.writeBuffer](tui.md#tui.merge-session.MergeSession.writeBuffer), [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.merge-session.MergeSession.proposalAbs](tui.md#tui.merge-session.MergeSession.proposalAbs), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.disk.splitEol](tui.md#tui.disk.splitEol), [tui.disk.withEol](tui.md#tui.disk.withEol), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.merge-session.errorText](tui.md#tui.merge-session.errorText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan), [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [features.stats.statusesIn](features.md#features.stats.statusesIn)
      - fn [writeBuffer](../../src/tui/merge-session.ts#L315) (merge: MergeState) → void <!-- internal -->
        <a id="tui.merge-session.MergeSession.writeBuffer"></a><br>`Ctrl+G`: the accepted hunks go into the buffer, which `Ctrl+S` saves.
        - calls [tui.merge-session.MergeSession.leave](tui.md#tui.merge-session.MergeSession.leave), [tui.merge.applyHunks](tui.md#tui.merge.applyHunks), [tui.buffer.setText](tui.md#tui.buffer.setText)
      - fn [undo](../../src/tui/merge-session.ts#L334) () → void
        <a id="tui.merge-session.MergeSession.undo"></a><br>`u` in the view: undoes the last merge while the file still holds its result, on disk too, and brings back the proposal as it was — unless a newer proposal was written since, which is kept.
        - calls [tui.disk.readText](tui.md#tui.disk.readText), [tui.merge-session.MergeSession.boundary](tui.md#tui.merge-session.MergeSession.boundary), [tui.disk.removeInside](tui.md#tui.disk.removeInside), [tui.disk.writeInside](tui.md#tui.disk.writeInside), [tui.buffer.setText](tui.md#tui.buffer.setText), [tui.merge-session.MergeSession.scan](tui.md#tui.merge-session.MergeSession.scan)
    - fn [errorText](../../src/tui/merge-session.ts#L373) (error: unknown) → string
      <a id="tui.merge-session.errorText"></a>
  - module [merge](../../src/tui/merge.ts#L1)
    <a id="tui.merge"></a><br>Line diff of a document and a proposed version, as hunks a person accepts or rejects one by one. The result keeps the base lines of every hunk that is not accepted, so nothing reaches the file without an explicit `a`.
    - type [Hunk](../../src/tui/merge.ts#L5)
      <a id="tui.merge.Hunk"></a>
    - type [Decision](../../src/tui/merge.ts#L13) = "pending" | "accepted" | "rejected"
      <a id="tui.merge.Decision"></a>
    - fn [diffLines](../../src/tui/merge.ts#L16) (base: readonly string[], proposed: readonly string[]) → Hunk[]
      <a id="tui.merge.diffLines"></a><br>Longest-common-subsequence diff; specs are small enough for the quadratic table.
    - fn [applyHunks](../../src/tui/merge.ts#L64) (base: readonly string[], hunks: readonly Hunk[], decisions: readonly Decision[]) → string[]
      <a id="tui.merge.applyHunks"></a><br>The base with the accepted hunks applied; pending and rejected hunks keep the base lines.
    - type [MergeRow](../../src/tui/merge.ts#L78)
      <a id="tui.merge.MergeRow"></a><br>One row of the merge view: context, a removed base line, or an added line of hunk `hunk`.
    - fn [mergeRows](../../src/tui/merge.ts#L86) (base: readonly string[], hunks: readonly Hunk[]) → MergeRow[]
      <a id="tui.merge.mergeRows"></a>
  - module [nav](../../src/tui/nav.ts#L1)
    <a id="tui.nav"></a><br>The navigation panel: layers → modules → members from the snapshot, then flows and rules from the specs with their worst mark. Items point at the spec line that declares them and, for code entities, at the code.
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - type [Place](../../src/tui/nav.ts#L11)
      <a id="tui.nav.Place"></a>
    - type [NavItem](../../src/tui/nav.ts#L17)
      <a id="tui.nav.NavItem"></a>
    - type [Tree](../../src/tui/nav.ts#L31) <!-- internal -->
      <a id="tui.nav.Tree"></a>
    - fn [markOver](../../src/tui/nav.ts#L41) (evidence: Map<number, LineEvidence>, from: number, to: number) → Mark | null <!-- internal -->
      <a id="tui.nav.markOver"></a>
      - calls [tui.evidence.worse](tui.md#tui.evidence.worse)
    - fn [lastLine](../../src/tui/nav.ts#L47) (node: Node) → number <!-- internal -->
      <a id="tui.nav.lastLine"></a>
      - calls [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [heading](../../src/tui/nav.ts#L55) (key: string, label: string) → NavItem <!-- internal -->
      <a id="tui.nav.heading"></a>
    - fn [treeOf](../../src/tui/nav.ts#L59) (analysis: Analysis) → Tree <!-- internal -->
      <a id="tui.nav.treeOf"></a>
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.nav.markOver](tui.md#tui.nav.markOver), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [tui.nav.lastLine](tui.md#tui.nav.lastLine)
    - fn [navItems](../../src/tui/nav.ts#L102) (analysis: Analysis | null, expanded: ReadonlySet<string>) → NavItem[]
      <a id="tui.nav.navItems"></a><br>Visible items for the expanded keys. Layers start expanded unless `-<key>` collapses them.
      - calls [tui.nav.treeOf](tui.md#tui.nav.treeOf), [tui.nav.heading](tui.md#tui.nav.heading)
  - module [screen](../../src/tui/screen.ts#L1)
    <a id="tui.screen"></a><br>A frame of the terminal as a grid of cells, and the ANSI that turns one frame into the next. Views draw into a `Grid`; only changed rows are sent, so the same output works on a real terminal and on xterm.js in a browser.
    - width [tui.width](tui.md#tui.width)
    - type [Color](../../src/tui/screen.ts#L9) = number
      <a id="tui.screen.Color"></a><br>256-colour palette index.
    - type [Style](../../src/tui/screen.ts#L11)
      <a id="tui.screen.Style"></a>
    - type [Cell](../../src/tui/screen.ts#L23) <!-- internal -->
      <a id="tui.screen.Cell"></a>
    - module [Grid](../../src/tui/screen.ts#L31)
      <a id="tui.screen.Grid"></a>
      - fn [constructor](../../src/tui/screen.ts#L38) (cols: number, rows: number)
        <a id="tui.screen.Grid.constructor"></a>
      - fn [write](../../src/tui/screen.ts#L45) (x: number, y: number, text: string, style: Style = PLAIN, limit = this.cols - x) → number
        <a id="tui.screen.Grid.write"></a><br>Writes `text` from (x, y), clipped to `limit` cells; returns the cells used.
        - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth), [tui.screen.Grid.clearWide](tui.md#tui.screen.Grid.clearWide)
      - fn [fill](../../src/tui/screen.ts#L66) (x: number, y: number, width: number, height: number, style: Style = PLAIN) → void
        <a id="tui.screen.Grid.fill"></a>
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
        <a id="tui.screen.Grid.row"></a>
    - fn [sgr](../../src/tui/screen.ts#L108) (style: Style) → string <!-- internal -->
      <a id="tui.screen.sgr"></a>
    - fn [safeLink](../../src/tui/screen.ts#L125) (link: string | undefined) → string | undefined
      <a id="tui.screen.safeLink"></a><br>An OSC 8 target that is safe to send: a control character (ESC, BEL, C1) would end the sequence early and let the rest of a URL from a spec reach the terminal as its own escape sequence. Such a link is dropped.
    - fn [sameStyle](../../src/tui/screen.ts#L130) (a: Style, b: Style) → boolean <!-- internal -->
      <a id="tui.screen.sameStyle"></a>
    - fn [rowEqual](../../src/tui/screen.ts#L134) (a: readonly Cell[], b: readonly Cell[]) → boolean <!-- internal -->
      <a id="tui.screen.rowEqual"></a>
      - calls [tui.screen.sameStyle](tui.md#tui.screen.sameStyle)
    - fn [renderDiff](../../src/tui/screen.ts#L141) (prev: Grid | null, next: Grid) → string
      <a id="tui.screen.renderDiff"></a><br>ANSI that turns `prev` into `next` on screen; a full repaint when there is no `prev` or the size changed.
      - calls [tui.screen.Grid.row](tui.md#tui.screen.Grid.row), [tui.screen.rowEqual](tui.md#tui.screen.rowEqual), [tui.screen.sameStyle](tui.md#tui.screen.sameStyle), [tui.screen.safeLink](tui.md#tui.screen.safeLink), [tui.screen.sgr](tui.md#tui.screen.sgr)
  - module [state](../../src/tui/state.ts#L1)
    <a id="tui.state"></a><br>The state of one TUI session. The same state drives the terminal and the browser: a transport only feeds input and shows the frames `view.ts` draws.
    - analyze [map.analyze](map.md#map.analyze)
    - explanations [map.explanations](map.md#map.explanations)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - ir [lang.ir](lang.md#lang.ir)
    - operations [operations.operations](operations.md#operations.operations)
    - findings [tui.findings](tui.md#tui.findings)
    - merge [tui.merge](tui.md#tui.merge)
    - type [Mode](../../src/tui/state.ts#L12) = "view" | "edit" | "read" | "code" | "merge"
      <a id="tui.state.Mode"></a>
    - type [Focus](../../src/tui/state.ts#L13) = "editor" | "nav" | "files" | "context" | "results"
      <a id="tui.state.Focus"></a>
    - type [Cursor](../../src/tui/state.ts#L15)
      <a id="tui.state.Cursor"></a>
    - type [Buffer](../../src/tui/state.ts#L22)
      <a id="tui.state.Buffer"></a>
    - type [Hover](../../src/tui/state.ts#L42)
      <a id="tui.state.Hover"></a>
    - type [CodeView](../../src/tui/state.ts#L51)
      <a id="tui.state.CodeView"></a>
    - type [MergeState](../../src/tui/state.ts#L61)
      <a id="tui.state.MergeState"></a>
    - type [LastMerge](../../src/tui/state.ts#L86)
      <a id="tui.state.LastMerge"></a>
    - type [Prompt](../../src/tui/state.ts#L103)
      <a id="tui.state.Prompt"></a>
    - type [OperationRecord](../../src/tui/state.ts#L119)
      <a id="tui.state.OperationRecord"></a><br>A run of one explicit operation in this session, kept in memory for F6 (design §2.6).
    - type [Place](../../src/tui/state.ts#L135)
      <a id="tui.state.Place"></a>
    - type [State](../../src/tui/state.ts#L141)
      <a id="tui.state.State"></a>
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
      <a id="tui.terminal.TerminalOutput"></a>
    - type [TerminalSignal](../../src/tui/terminal.ts#L78)
      <a id="tui.terminal.TerminalSignal"></a>
    - type [TerminalHost](../../src/tui/terminal.ts#L81)
      <a id="tui.terminal.TerminalHost"></a><br>What the terminal session needs from its process; `processHost()` is the real one.
    - fn [processHost](../../src/tui/terminal.ts#L94) () → TerminalHost
      <a id="tui.terminal.processHost"></a>
    - fn [runTerminal](../../src/tui/terminal.ts#L114) (root: string, host: TerminalHost = processHost()) → Promise<number>
      <a id="tui.terminal.runTerminal"></a>
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
      <a id="tui.text-to-spec.thenItems"></a>
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
    - explain [features.explain](features.md#features.explain)
    - explanations [map.explanations](map.md#map.explanations)
    - actions [tui.actions](tui.md#tui.actions)
    - code-highlight [tui.code-highlight](tui.md#tui.code-highlight)
    - evidence [tui.evidence](tui.md#tui.evidence)
    - findings [tui.findings](tui.md#tui.findings)
    - markdown [tui.markdown](tui.md#tui.markdown)
    - merge [tui.merge](tui.md#tui.merge)
    - nav [tui.nav](tui.md#tui.nav)
    - screen [tui.screen](tui.md#tui.screen)
    - state [tui.state](tui.md#tui.state)
    - theme [tui.theme](tui.md#tui.theme)
    - buffer [tui.buffer](tui.md#tui.buffer)
    - width [tui.width](tui.md#tui.width)
    - type [Rect](../../src/tui/view.ts#L21)
      <a id="tui.view.Rect"></a>
    - type [Layout](../../src/tui/view.ts#L28)
      <a id="tui.view.Layout"></a>
    - fn [layout](../../src/tui/view.ts#L40) (state: Pick<State, "cols" | "rows" | "showFiles" | "showNav"> & { context?: State["context"] }) → Layout
      <a id="tui.view.layout"></a>
    - type [EditorRow](../../src/tui/view.ts#L59)
      <a id="tui.view.EditorRow"></a><br>One editor row: a text line, or the expanded evidence row under the cursor line.
    - fn [lineCount](../../src/tui/view.ts#L61) (buffer: Buffer) → number
      <a id="tui.view.lineCount"></a>
      - calls [tui.buffer.bufferLines](tui.md#tui.buffer.bufferLines)
    - fn [gutterWidth](../../src/tui/view.ts#L65) (buffer: Buffer) → number
      <a id="tui.view.gutterWidth"></a>
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount)
    - fn [editorRows](../../src/tui/view.ts#L70) (state: State, buffer: Buffer, height: number) → EditorRow[]
      <a id="tui.view.editorRows"></a><br>Rows shown from `top`: the cursor line gets an evidence row below it when it has evidence.
      - calls [tui.view.lineCount](tui.md#tui.view.lineCount), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf)
    - fn [drawRuns](../../src/tui/view.ts#L86) (grid: Grid, x: number, y: number, width: number, clusters: Iterable<{ cluster: string; point: number }>, runs: readonly Run[], base: Style) → void <!-- internal -->
      <a id="tui.view.drawRuns"></a><br>Draws clusters with their code-point positions until `width` cells are used; a cluster (a letter with its marks, a ZWJ emoji) takes the style of its first code point. Only what fits is visited, however long the line.
      - calls [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [fromLayout](../../src/tui/view.ts#L97) (line: LineLayout, from: number) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromLayout"></a><br>The clusters of a laid-out line from cluster `from` on.
    - fn [fromText](../../src/tui/view.ts#L102) (text: string) → Generator<{ cluster: string; point: number }> <!-- internal -->
      <a id="tui.view.fromText"></a><br>The clusters of `text` from the start, segmented only as far as they are read.
      - calls [tui.width.clusters](tui.md#tui.width.clusters)
    - fn [cellsBetween](../../src/tui/view.ts#L111) (line: LineLayout, from: number, to: number) → number <!-- internal -->
      <a id="tui.view.cellsBetween"></a><br>Cells between clusters `from` and `to` of a laid-out line (0 when `to` is before `from`).
    - fn [markCell](../../src/tui/view.ts#L116) (item: LineEvidence | undefined, stale: boolean) → { glyph: string; style: Style } <!-- internal -->
      <a id="tui.view.markCell"></a>
    - fn [detailText](../../src/tui/view.ts#L125) (item: LineEvidence, snapshotId: string | null) → { text: string; style: Style }[]
      <a id="tui.view.detailText"></a><br>`ID ✓ static ✓ tests — trace ◌ …`: the channels of a line, never merged into one mark.
    - fn [lineMessage](../../src/tui/view.ts#L149) (item: LineEvidence | undefined) → { text: string; style: Style } | null
      <a id="tui.view.lineMessage"></a><br>The message for the cursor line: the first failing or unverified finding, with a fix hint.
      - calls [features.explain.explainCode](features.md#features.explain.explainCode)
    - fn [drawBox](../../src/tui/view.ts#L162) (grid: Grid, rect: Rect, title: string, style: Style, titleStyle: Style) → void <!-- internal -->
      <a id="tui.view.drawBox"></a>
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [runsOf](../../src/tui/view.ts#L176) (buffer: Buffer, layers: readonly string[]) → Map<number, Run[]> <!-- internal -->
      <a id="tui.view.runsOf"></a>
      - calls [tui.theme.highlight](tui.md#tui.theme.highlight)
    - fn [drawEditor](../../src/tui/view.ts#L186) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawEditor"></a>
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.runsOf](tui.md#tui.view.runsOf), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.editorRows](tui.md#tui.view.editorRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.detailText](tui.md#tui.view.detailText), [tui.view.markCell](tui.md#tui.view.markCell), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromLayout](tui.md#tui.view.fromLayout), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [readRows](../../src/tui/view.ts#L230) (state: State, buffer: Buffer, rect: Rect) → { rows: ReadRow[]; cursorRow: number; top: number } <!-- internal -->
      <a id="tui.view.readRows"></a><br>Reading mode: the rendered rows, the row of the cursor line, and the first row shown.
      - calls [tui.markdown.renderMarkdown](tui.md#tui.markdown.renderMarkdown)
    - fn [readCursorRow](../../src/tui/view.ts#L239) (state: State, buffer: Buffer, rect: Rect) → number
      <a id="tui.view.readCursorRow"></a><br>The screen row (from the editor's top) where reading mode shows the cursor line: popups anchor there.
      - calls [tui.view.readRows](tui.md#tui.view.readRows)
    - fn [drawRead](../../src/tui/view.ts#L244) (grid: Grid, state: State, rect: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawRead"></a>
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.readRows](tui.md#tui.view.readRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.view.markCell](tui.md#tui.view.markCell), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawCode](../../src/tui/view.ts#L264) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawCode"></a>
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.code-highlight.highlightCode](tui.md#tui.code-highlight.highlightCode), [tui.view.drawRuns](tui.md#tui.view.drawRuns), [tui.view.fromText](tui.md#tui.view.fromText)
    - fn [drawMerge](../../src/tui/view.ts#L287) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawMerge"></a>
      - calls [tui.merge.mergeRows](tui.md#tui.merge.mergeRows), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawPanelList](../../src/tui/view.ts#L312) (grid: Grid, rect: Rect, title: string, entries: { text: string; mark: { glyph: string; style: Style } | null; style?: Style }[], selected: number, focused: boolean, top: number) → void <!-- internal -->
      <a id="tui.view.drawPanelList"></a>
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [navEntries](../../src/tui/view.ts#L326) (state: State) → NavItem[]
      <a id="tui.view.navEntries"></a>
      - calls [tui.nav.navItems](tui.md#tui.nav.navItems)
    - fn [navNote](../../src/tui/view.ts#L338) (state: State, width: number) → string[]
      <a id="tui.view.navNote"></a><br>The explanation of the node selected in the nav panel, wrapped to `width` cells with its origin (`code`, or `llm · model · date`, `stale`); none for a node without one or an item that is no node.
      - calls [tui.view.navEntries](tui.md#tui.view.navEntries), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [tui.view.wrapWords](tui.md#tui.view.wrapWords)
    - fn [wrapWords](../../src/tui/view.ts#L350) (text: string, width: number) → string[] <!-- internal -->
      <a id="tui.view.wrapWords"></a><br>Words of `text` in rows of at most `width` cells; a longer word is cut.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [navListHeight](../../src/tui/view.ts#L366) (state: State, rect: Rect) → number
      <a id="tui.view.navListHeight"></a><br>Rows of the nav panel's list: what the explanation of the selected node leaves.
      - calls [tui.view.navNote](tui.md#tui.view.navNote)
    - fn [drawNav](../../src/tui/view.ts#L371) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawNav"></a>
      - calls [tui.view.navNote](tui.md#tui.view.navNote), [tui.view.navListHeight](tui.md#tui.view.navListHeight), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.navEntries](tui.md#tui.view.navEntries), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList)
    - fn [drawContext](../../src/tui/view.ts#L394) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawContext"></a><br>What goes to the model: kind, label and tokens per item; `◇` planned, `?` incomplete data.
      - calls [features.agent-context.contextPack](features.md#features.agent-context.contextPack), [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.contextTop](tui.md#tui.view.contextTop)
    - fn [contextTop](../../src/tui/view.ts#L405) (index: number, rect: Rect) → number
      <a id="tui.view.contextTop"></a><br>First item shown in the context panel: the list scrolls to keep the selected item in view. A click maps rows the same way.
    - fn [drawFiles](../../src/tui/view.ts#L409) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawFiles"></a>
      - calls [tui.view.drawPanelList](tui.md#tui.view.drawPanelList), [tui.view.filesTop](tui.md#tui.view.filesTop)
    - fn [filesTop](../../src/tui/view.ts#L420) (state: Pick<State, "filesIndex">, rect: Rect) → number
      <a id="tui.view.filesTop"></a><br>First file shown in the panel: the list scrolls to keep the selected file in view. A click maps rows the same way.
    - fn [recordLabel](../../src/tui/view.ts#L427) (record: OperationRecord) → string <!-- internal -->
      <a id="tui.view.recordLabel"></a><br>The registry label of a record's action (only `doctor` so far), or its id.
    - fn [recordStatus](../../src/tui/view.ts#L432) (record: OperationRecord) → string
      <a id="tui.view.recordStatus"></a><br>The status of a record for the F6 list and messages: `running…` or `completed · code 0`.
    - fn [timeStr](../../src/tui/view.ts#L438) (ms: number) → string <!-- internal -->
      <a id="tui.view.timeStr"></a>
    - fn [resultsReportRows](../../src/tui/view.ts#L447) (state: State) → { text: string; style: Style }[]
      <a id="tui.view.resultsReportRows"></a><br>The report rows of the record selected in the F6 panel: its parameters, timings and the operation's messages. Presentation only — the payload in `record.result` carries the domain data.
      - calls [tui.view.timeStr](tui.md#tui.view.timeStr), [tui.view.recordStatus](tui.md#tui.view.recordStatus)
    - fn [resultsSplit](../../src/tui/view.ts#L465) (state: State, height: number) → { list: number; report: number }
      <a id="tui.view.resultsSplit"></a><br>How the F6 panel splits: the entries list on top, the content of the selected entry below.
    - fn [findingStateRow](../../src/tui/view.ts#L475) (state: State) → string | null
      <a id="tui.view.findingStateRow"></a><br>Why the shown analysis is not a plain current check: a failed run, an update in flight, changes since the analysis, or unsaved buffers taken as overlay.
    - fn [findingDetailRows](../../src/tui/view.ts#L495) (state: State, width: number) → string[]
      <a id="tui.view.findingDetailRows"></a><br>The details of the selected finding, wrapped to `width`: its full message (the list row cuts it) and then criterion, provenance, snapshot and reason; without a selection, why the list is empty. Always the same number of rows, so the list does not jump while the selection moves.
      - calls [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.view.padRows](tui.md#tui.view.padRows), [tui.view.clipRows](tui.md#tui.view.clipRows), [tui.view.wrapCells](tui.md#tui.view.wrapCells), [tui.findings.findingDetailText](tui.md#tui.findings.findingDetailText)
    - fn [clipRows](../../src/tui/view.ts#L506) (rows: string[], count: number, width: number) → string[] <!-- internal -->
      <a id="tui.view.clipRows"></a><br>The first `count` rows; a cut ends with `…`.
      - calls [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [padRows](../../src/tui/view.ts#L510) (rows: string[]) → string[] <!-- internal -->
      <a id="tui.view.padRows"></a>
    - fn [wrapCells](../../src/tui/view.ts#L515) (text: string, width: number) → string[] <!-- internal -->
      <a id="tui.view.wrapCells"></a><br>`text` cut into rows of at most `width` cells, at spaces where it can.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth), [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [findingsListRows](../../src/tui/view.ts#L531) (state: State, rect: Rect) → number
      <a id="tui.view.findingsListRows"></a><br>Rows the findings list takes inside the panel `rect`: the counts, the state and the details of the selected finding come first.
      - calls [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow)
    - fn [drawResults](../../src/tui/view.ts#L538) (grid: Grid, state: State, rect: Rect) → void <!-- internal -->
      <a id="tui.view.drawResults"></a><br>The F6 panel over the editor area: the entries on top, the content of the selected entry below.
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.resultsSplit](tui.md#tui.view.resultsSplit), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.view.recordLabel](tui.md#tui.view.recordLabel), [tui.view.recordStatus](tui.md#tui.view.recordStatus), [tui.view.drawFindings](tui.md#tui.view.drawFindings), [tui.view.resultsReportRows](tui.md#tui.view.resultsReportRows)
    - fn [drawFindings](../../src/tui/view.ts#L581) (grid: Grid, state: State, rect: Rect, dividerY: number) → void <!-- internal -->
      <a id="tui.view.drawFindings"></a><br>The full findings report of the current analysis: counts, filters, the selected finding's details, and the list.
      - calls [tui.findings.findingsOf](tui.md#tui.findings.findingsOf), [tui.findings.visibleFindings](tui.md#tui.findings.visibleFindings), [tui.findings.findingCounts](tui.md#tui.findings.findingCounts), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.findingStateRow](tui.md#tui.view.findingStateRow), [tui.view.findingDetailRows](tui.md#tui.view.findingDetailRows), [tui.findings.findingRow](tui.md#tui.findings.findingRow)
    - fn [drawHover](../../src/tui/view.ts#L625) (grid: Grid, state: State, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawHover"></a>
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawCompletion](../../src/tui/view.ts#L639) (grid: Grid, state: State, editor: Rect, buffer: Buffer) → void <!-- internal -->
      <a id="tui.view.drawCompletion"></a>
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.gutterWidth](tui.md#tui.view.gutterWidth), [tui.view.cellsBetween](tui.md#tui.view.cellsBetween), [tui.buffer.lineLayout](tui.md#tui.buffer.lineLayout), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [drawHelp](../../src/tui/view.ts#L689) (grid: Grid, state: State, editor: Rect, buffer: Buffer | null) → void <!-- internal -->
      <a id="tui.view.drawHelp"></a>
      - calls [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [features.explain.explainCode](features.md#features.explain.explainCode), [tui.actions.catalog](tui.md#tui.actions.catalog), [tui.view.wrapWords](tui.md#tui.view.wrapWords), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write)
    - fn [drawPrompt](../../src/tui/view.ts#L708) (grid: Grid, state: State, rect: Rect, editor: Rect) → void <!-- internal -->
      <a id="tui.view.drawPrompt"></a>
      - calls [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawBox](tui.md#tui.view.drawBox), [tui.width.padWidth](tui.md#tui.width.padWidth)
    - fn [render](../../src/tui/view.ts#L738) (state: State) → Grid
      <a id="tui.view.render"></a>
      - calls [tui.screen.Grid](tui.md#tui.screen.Grid), [tui.view.layout](tui.md#tui.view.layout), [tui.screen.Grid.fill](tui.md#tui.screen.Grid.fill), [tui.screen.Grid.write](tui.md#tui.screen.Grid.write), [tui.view.drawFiles](tui.md#tui.view.drawFiles), [tui.view.drawContext](tui.md#tui.view.drawContext), [tui.view.drawNav](tui.md#tui.view.drawNav), [tui.view.drawCode](tui.md#tui.view.drawCode), [tui.view.drawMerge](tui.md#tui.view.drawMerge), [tui.view.drawRead](tui.md#tui.view.drawRead), [tui.view.drawEditor](tui.md#tui.view.drawEditor), [tui.evidence.evidenceOf](tui.md#tui.evidence.evidenceOf), [tui.view.lineMessage](tui.md#tui.view.lineMessage), [tui.evidence.totals](tui.md#tui.evidence.totals), [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.view.drawResults](tui.md#tui.view.drawResults), [tui.view.drawHover](tui.md#tui.view.drawHover), [tui.view.drawCompletion](tui.md#tui.view.drawCompletion), [tui.view.drawHelp](tui.md#tui.view.drawHelp), [tui.view.drawPrompt](tui.md#tui.view.drawPrompt)
  - module [web](../../src/tui/web.ts#L1)
    <a id="tui.web"></a><br>`keylang web`: the same TUI in a browser tab. `node:http` serves a page and the bundled xterm.js; a WebSocket (`ws`) carries ANSI frames to xterm.js and its keyboard, mouse, paste and resize events back to an `App` in this process. No PTY and no CDN.
    - node [external.node](external.md#external.node)
    - ws [external.ws](external.md#external.ws)
    - analyze [map.analyze](map.md#map.analyze)
    - app [tui.app](tui.md#tui.app)
    - background [tui.background](tui.md#tui.background)
    - screen [tui.screen](tui.md#tui.screen)
    - type [AssetName](../../src/tui/web.ts#L47) = keyof typeof ASSETS <!-- internal -->
      <a id="tui.web.AssetName"></a>
    - fn [assetPath](../../src/tui/web.ts#L50) (name: AssetName) → string | null
      <a id="tui.web.assetPath"></a><br>The published package carries the assets in `dist/web/`; a checkout reads them from `node_modules`.
    - type [WebServer](../../src/tui/web.ts#L64)
      <a id="tui.web.WebServer"></a>
    - type [Session](../../src/tui/web.ts#L76) <!-- internal -->
      <a id="tui.web.Session"></a>
    - fn [control](../../src/tui/web.ts#L85) (message: object) → string <!-- internal -->
      <a id="tui.web.control"></a><br>A control message for the page: a frame that starts with NUL, which no ANSI frame does.
    - module [AudioQueue](../../src/tui/web.ts#L93) <!-- internal -->
      <a id="tui.web.AudioQueue"></a><br>PCM chunks from the page, read by the session's recognizer as they arrive.
      - fn [push](../../src/tui/web.ts#L100) (chunk: Int16Array) → void
        <a id="tui.web.AudioQueue.push"></a>
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [end](../../src/tui/web.ts#L107) (failure: Error | null = null) → void
        <a id="tui.web.AudioQueue.end"></a>
        - calls [tui.web.AudioQueue.wake](tui.md#tui.web.AudioQueue.wake)
      - fn [wake](../../src/tui/web.ts#L113) () → void <!-- internal -->
        <a id="tui.web.AudioQueue.wake"></a>
      - fn [chunks](../../src/tui/web.ts#L120) () → AsyncGenerator<Int16Array>
        <a id="tui.web.AudioQueue.chunks"></a><br>The chunks as they come, until `end`.
    - fn [pcmOf](../../src/tui/web.ts#L135) (data: unknown) → Int16Array | null <!-- internal -->
      <a id="tui.web.pcmOf"></a><br>s16le PCM from base64; an odd byte count or bad base64 is dropped, not trusted.
    - fn [clampSize](../../src/tui/web.ts#L145) (value: unknown, fallback: number, max: number) → number
      <a id="tui.web.clampSize"></a><br>A size from the client: an integer within the grid limits, else the fallback.
    - fn [sameSecret](../../src/tui/web.ts#L150) (given: string | null | undefined, token: string) → boolean <!-- internal -->
      <a id="tui.web.sameSecret"></a>
    - fn [offeredToken](../../src/tui/web.ts#L158) (request: IncomingMessage) → string | null <!-- internal -->
      <a id="tui.web.offeredToken"></a><br>The token a socket offers among its subprotocols.
    - fn [serveWeb](../../src/tui/web.ts#L166) (options: { root: string; port: number; host?: string; analyzer?: Analyzer; /** How long a detached session waits for a reconnect. */ keepMs?: number }) → Promise<WebServer>
      <a id="tui.web.serveWeb"></a>
      - calls [tui.background.SnapshotWorker](tui.md#tui.background.SnapshotWorker), [map.analyze.analyze](map.md#map.analyze.analyze), [tui.web.sameSecret](tui.md#tui.web.sameSecret), [tui.web.offeredToken](tui.md#tui.web.offeredToken), [tui.web.pathOf](tui.md#tui.web.pathOf), [tui.web.reply](tui.md#tui.web.reply), [tui.web.assetPath](tui.md#tui.web.assetPath), [tui.web.page](tui.md#tui.web.page), [tui.web.clampSize](tui.md#tui.web.clampSize), [tui.web.pcmOf](tui.md#tui.web.pcmOf), [tui.app.App](tui.md#tui.app.App), [tui.web.AudioQueue](tui.md#tui.web.AudioQueue), [tui.web.control](tui.md#tui.web.control), [tui.web.AudioQueue.chunks](tui.md#tui.web.AudioQueue.chunks), [tui.web.AudioQueue.end](tui.md#tui.web.AudioQueue.end), [tui.background.SnapshotWorker.close](tui.md#tui.background.SnapshotWorker.close)
    - fn [pathOf](../../src/tui/web.ts#L378) (target: string | undefined) → string | null <!-- internal -->
      <a id="tui.web.pathOf"></a><br>The path of a request target, or null when it is not a URL at all.
    - fn [reply](../../src/tui/web.ts#L386) (response: ServerResponse, status: number, type: string, body: string | Buffer) → void <!-- internal -->
      <a id="tui.web.reply"></a>
    - fn [page](../../src/tui/web.ts#L392) () → string <!-- internal -->
      <a id="tui.web.page"></a><br>The page: xterm.js from `/assets/`, a WebSocket back to this server, reconnect with the same session.
  - module [width](../../src/tui/width.ts#L1)
    <a id="tui.width"></a><br>Terminal cell width of text: graphemes, not code units. A wide character (CJK, most emoji) takes two cells, combining marks and joiners none.
    - fn [graphemes](../../src/tui/width.ts#L9) (text: string) → string[]
      <a id="tui.width.graphemes"></a><br>Grapheme clusters of a string, in order.
    - fn [clusters](../../src/tui/width.ts#L16) (text: string) → Generator<string>
      <a id="tui.width.clusters"></a><br>The same clusters, segmented only as far as they are read: drawing a long line stops at the screen's edge.
    - fn [codePointWidth](../../src/tui/width.ts#L38) (cp: number) → 0 | 1 | 2 <!-- internal -->
      <a id="tui.width.codePointWidth"></a>
    - fn [graphemeWidth](../../src/tui/width.ts#L56) (cluster: string) → 0 | 1 | 2
      <a id="tui.width.graphemeWidth"></a><br>Cells one grapheme takes. An emoji cluster (a ZWJ sequence, a flag, a pictograph with VS16) is one wide cell pair; otherwise the width of its first visible code point.
      - calls [tui.width.codePointWidth](tui.md#tui.width.codePointWidth)
    - fn [stringWidth](../../src/tui/width.ts#L66) (text: string) → number
      <a id="tui.width.stringWidth"></a>
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [fitWidth](../../src/tui/width.ts#L73) (text: string, width: number) → string
      <a id="tui.width.fitWidth"></a><br>The longest prefix of `text` that fits in `width` cells.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - fn [padWidth](../../src/tui/width.ts#L86) (text: string, width: number) → string
      <a id="tui.width.padWidth"></a><br>`text` cut or padded with spaces to exactly `width` cells; a cut ends with `…`.
      - calls [tui.width.stringWidth](tui.md#tui.width.stringWidth), [tui.width.fitWidth](tui.md#tui.width.fitWidth)
    - fn [cellWidth](../../src/tui/width.ts#L95) (cluster: string) → number
      <a id="tui.width.cellWidth"></a><br>Cells a cluster takes in a `Grid`: a tab is drawn as one blank cell.
      - calls [tui.width.graphemeWidth](tui.md#tui.width.graphemeWidth)
    - type [LineLayout](../../src/tui/width.ts#L105)
      <a id="tui.width.LineLayout"></a><br>One line cut into clusters once, with prefix sums: the cells, code points and UTF-16 units before each cluster (index `clusters.length` is the whole line). Scrolling, drawing and hit-testing then take constant or logarithmic time per question instead of segmenting the line again.
    - fn [layoutLine](../../src/tui/width.ts#L112) (line: string) → LineLayout
      <a id="tui.width.layoutLine"></a>
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes), [tui.width.cellWidth](tui.md#tui.width.cellWidth)
    - fn [scrollToFit](../../src/tui/width.ts#L127) (layout: LineLayout, left: number, col: number, width: number) → number
      <a id="tui.width.scrollToFit"></a><br>The smallest first cluster from `left` on such that clusters `[first, col)` fit in `width` cells.
    - fn [clusterAtCell](../../src/tui/width.ts#L139) (layout: LineLayout, left: number, x: number) → number
      <a id="tui.width.clusterAtCell"></a><br>The cluster under cell `x` of a line drawn from cluster `left`; past the end, the end.
    - fn [clusterAt](../../src/tui/width.ts#L154) (line: string, codePoints: number) → number
      <a id="tui.width.clusterAt"></a><br>Grapheme index of a code-point column in `line` (a column inside a cluster maps to that cluster).
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
    - fn [clusterOffset](../../src/tui/width.ts#L166) (line: string, clusters: number) → number
      <a id="tui.width.clusterOffset"></a><br>UTF-16 offset of the first `clusters` graphemes of `line`.
      - calls [tui.width.graphemes](tui.md#tui.width.graphemes)
