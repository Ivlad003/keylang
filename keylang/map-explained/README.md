<!-- keylang:generated — не редагувати, `keylang map` -->

## Explained map

The tree of the map with a brief under each node: the documentation comment from the code, or a brief a model wrote, marked _(llm · model · date)_ and _stale_ once the code under it changed. `keylang map` writes it from the code and `explain/brief/`; it never asks a model.

| Layer | Explanation | Code | LLM | LLM, stale | None |
|---|---|---|---|---|---|
| [base](base.md) |  | 59 | 29 | 3 | 1 |
| [check](check.md) |  | 94 | 8 | 2 | 72 |
| [cli](cli.md) |  | 47 | 5 | 0 | 53 |
| [external](external.md) |  | | | | |
| [extract](extract.md) |  | 121 | 4 | 0 | 61 |
| [features](features.md) | The shared operations every entry point builds on: check reporting and `--changed` filtering ([`features.check-results`](features.md#features.check-results), [`features.changed`](features.md#features.changed)), drafting and explaining through a model or offline ([`features.draft`](features.md#features.draft), [`features.explain-llm`](features.md#features.explain-llm)), proposals, staleness, git and voice. Each… _(llm · claude:claude-fable-5-1 · 2026-10-04)_ | 279 | 5 | 0 | 160 |
| [lang](lang.md) | Reads keylang Markdown files into an IR via [`lang.files`](lang.md#lang.files) and [`lang.parser`](lang.md#lang.parser), then renders it back as canonical text ([`lang.fmt`](lang.md#lang.fmt), [`lang.parse-format`](lang.md#lang.parse-format)) or compiles it into typed assertions ([`lang.spec-ir`](lang.md#lang.spec-ir)). It has no dependency on `map`, `extract`, or web-tree-sitter. _(llm · claude:claude-fable-5-1 · 2026-10-04)_ | 46 | 5 | 0 | 84 |
| [map](map.md) | Turns source files into facts, a graph and a versioned snapshot ([`map.frontends`](map.md#map.frontends), [`map.graph`](map.md#map.graph), [`map.snapshot`](map.md#map.snapshot)), then renders generated map files with explanations ([`map.emit`](map.md#map.emit), [`map.explanations`](map.md#map.explanations)). Also derives wiring code and trace plans from that snapshot ([`map.wire-gen`](map.md#map.wire-gen)… _(llm · claude:claude-fable-5-1 · 2026-10-04)_ | 128 | 8 | 0 | 126 |
| [operations](operations.md) | Holds the transport-independent orchestration of application actions in [`operations.operations`](operations.md#operations.operations), taking typed requests with an explicit absolute root and returning typed domain results. Both the CLI and the TUI drive the same interface rather than duplicating logic. _(llm · claude:claude-fable-5-1 · 2026-10-04)_ | 146 | 3 | 0 | 30 |
| [outside](outside.md) |  | 0 | 0 | 0 | 34 |
| [tui](tui.md) | The interactive editor: a session ([`tui.app`](tui.md#tui.app), [`tui.state`](tui.md#tui.state)) decodes input ([`tui.input`](tui.md#tui.input)), draws frames into a grid ([`tui.view`](tui.md#tui.view), [`tui.screen`](tui.md#tui.screen)), and runs analysis in workers ([`tui.background`](tui.md#tui.background)). The same session serves a terminal ([`tui.terminal`](tui.md#tui.terminal)) or a browser over WebSocket… _(llm · claude:claude-fable-5-1 · 2026-10-04)_ | 440 | 8 | 0 | 201 |
| **all** | | 1360 | 75 | 5 | 822 |

## Index

Modules and classes by name; the parent ID follows each one.

**_** · [_60_archive](outside.md#outside.design.scripts._60_archive) (outside.design.scripts) · [_61_tui](outside.md#outside.design.scripts._61_tui) (outside.design.scripts) · [_62_flow](outside.md#outside.design.scripts._62_flow) (outside.design.scripts) · [_63_merge](outside.md#outside.design.scripts._63_merge) (outside.design.scripts) · [_64_explain](outside.md#outside.design.scripts._64_explain) (outside.design.scripts) · [_65_windows](outside.md#outside.design.scripts._65_windows) (outside.design.scripts) · [_66_export](outside.md#outside.design.scripts._66_export) (outside.design.scripts) · [_70_cleanup](outside.md#outside.design.scripts._70_cleanup) (outside.design.scripts) · [_71_editor](outside.md#outside.design.scripts._71_editor) (outside.design.scripts) · [_72_fix](outside.md#outside.design.scripts._72_fix) (outside.design.scripts) · [_73_fix](outside.md#outside.design.scripts._73_fix) (outside.design.scripts) · [_74_agent](outside.md#outside.design.scripts._74_agent) (outside.design.scripts) · [_75_read_s2c](outside.md#outside.design.scripts._75_read_s2c) (outside.design.scripts) · [_76_fix_export](outside.md#outside.design.scripts._76_fix_export) (outside.design.scripts) · [_77_tbl](outside.md#outside.design.scripts._77_tbl) (outside.design.scripts)

**A** · [actions](tui.md#tui.actions) (tui) · [agent-cli](features.md#features.agent-cli) (features) · [agent-context](features.md#features.agent-context) (features) · [analysis-worker](tui.md#tui.analysis-worker) (tui) · [analyze](map.md#map.analyze) (map) · [app](tui.md#tui.app) (tui) · [App](tui.md#tui.app.App) (tui.app) · [assess](check.md#check.assess) (check) · [assist](tui.md#tui.assist) (tui) · [Assist](tui.md#tui.assist.Assist) (tui.assist) · [AudioQueue](tui.md#tui.web.AudioQueue) (tui.web)

**B** · [background](tui.md#tui.background) (tui) · [baseline](features.md#features.baseline) (features) · [bench](outside.md#outside.bench) (outside) · [bodies](extract.md#extract.bodies) (extract) · [brief](base.md#base.brief) (base) · [buffer](tui.md#tui.buffer) (tui)

**C** · [changed](features.md#features.changed) (features) · [check-format](features.md#features.check-format) (features) · [check-results](features.md#features.check-results) (features) · [cli](cli.md#cli.cli) (cli) · [CliCancelled](features.md#features.agent-cli.CliCancelled) (features.agent-cli) · [clone](outside.md#outside.bench.clone) (outside.bench) · [code-highlight](tui.md#tui.code-highlight) (tui) · [completions](cli.md#cli.completions) (cli) · [config](base.md#base.config) (base) · [copy-wasm](outside.md#outside.scripts.copy-wasm) (outside.scripts) · [copy-web](outside.md#outside.scripts.copy-web) (outside.scripts)

**D** · [declared-packages](map.md#map.declared-packages) (map) · [demo](outside.md#outside.examples.wiring-lifecycle.demo) (outside.examples.wiring-lifecycle) · [design](outside.md#outside.design) (outside) · [diag](base.md#base.diag) (base) · [disk](tui.md#tui.disk) (tui) · [doc-comments](extract.md#extract.doc-comments) (extract) · [draft](features.md#features.draft) (features) · [draft-llm](features.md#features.draft-llm) (features)

**E** · [editors](outside.md#outside.editors) (outside) · [emit](map.md#map.emit) (map) · [evidence](tui.md#tui.evidence) (tui) · [examples](outside.md#outside.examples) (outside) · [explain](features.md#features.explain) (features) · [explain-edge](features.md#features.explain-edge) (features) · [explain-inventory](features.md#features.explain-inventory) (features) · [explain-llm](features.md#features.explain-llm) (features) · [explain-node](features.md#features.explain-node) (features) · [explain-offline](features.md#features.explain-offline) (features) · [explanations](map.md#map.explanations) (map) · [exports](map.md#map.exports) (map) · [extension](outside.md#outside.editors.vscode.extension) (outside.editors.vscode) · [external-ids](base.md#base.external-ids) (base)

**F** · [fact-cache](map.md#map.fact-cache) (map) · [FactCache](map.md#map.fact-cache.FactCache) (map.fact-cache) · [facts](extract.md#extract.facts) (extract) · [feature-status](features.md#features.feature-status) (features) · [files](lang.md#lang.files) (lang) · [findings](tui.md#tui.findings) (tui) · [flows](check.md#check.flows) (check) · [fmt](lang.md#lang.fmt) (lang) · [frontends](map.md#map.frontends) (map)

**G** · [ghost](features.md#features.ghost) (features) · [git-changes](features.md#features.git-changes) (features) · [git-hook](features.md#features.git-hook) (features) · [glob](base.md#base.glob) (base) · [grammars](extract.md#extract.grammars) (extract) · [graph](map.md#map.graph) (map) · [Grid](tui.md#tui.screen.Grid) (tui.screen)

**H** · [harness](features.md#features.harness) (features)

**I** · [ImportResolver](map.md#map.imports.ImportResolver) (map.imports) · [imports](map.md#map.imports) (map) · [Index](check.md#check.resolve.Index) (check.resolve) · [index](cli.md#cli.index) (cli) · [inject](outside.md#outside.bench.inject) (outside.bench) · [input](tui.md#tui.input) (tui) · [InputDecoder](tui.md#tui.input.InputDecoder) (tui.input) · [ir](lang.md#lang.ir) (lang)

**K** · [keylang](cli.md#cli.keylang) (cli) · [keys](features.md#features.keys) (features)

**L** · [languages](base.md#base.languages) (base) · [lib](outside.md#outside.design.scripts.lib) (outside.design.scripts) · [Line](lang.md#lang.parser.Line) (lang.parser) · [llm](features.md#features.llm) (features) · [LlmCancelled](features.md#features.llm.LlmCancelled) (features.llm) · [lsp](cli.md#cli.lsp) (cli) · [lsp-features](features.md#features.lsp-features) (features) · [LspError](cli.md#cli.lsp.LspError) (cli.lsp)

**M** · [map](map.md#map.map) (map) · [markdown](tui.md#tui.markdown) (tui) · [Matcher](check.md#check.trace-evidence.Matcher) (check.trace-evidence) · [mcp](cli.md#cli.mcp) (cli) · [merge](tui.md#tui.merge) (tui) · [merge-session](tui.md#tui.merge-session) (tui) · [MergeSession](tui.md#tui.merge-session.MergeSession) (tui.merge-session)

**N** · [nav](tui.md#tui.nav) (tui) · [new-spec](tui.md#tui.new-spec) (tui) · [node-search](features.md#features.node-search) (features) · [node-test](cli.md#cli.node-test) (cli)

**O** · [operation-worker](tui.md#tui.operation-worker) (tui) · [operations](operations.md#operations.operations) (operations) · [OperationWorker](tui.md#tui.background.OperationWorker) (tui.background) · [OverBudget](check.md#check.trace-evidence.OverBudget) (check.trace-evidence)

**P** · [pack-entry](outside.md#outside.scripts.pack-entry) (outside.scripts) · [parse-format](lang.md#lang.parse-format) (lang) · [parser](lang.md#lang.parser) (lang) · [Parser](lang.md#lang.parser.Parser) (lang.parser) · [plan](outside.md#outside.examples.wiring-lifecycle.plan) (outside.examples.wiring-lifecycle) · [proposals](features.md#features.proposals) (features) · [python](extract.md#extract.python) (extract) · [python-imports](map.md#map.python-imports) (map) · [PythonResolver](map.md#map.python-imports.PythonResolver) (map.python-imports)

**R** · [resolve](check.md#check.resolve) (check) · [rules](check.md#check.rules) (check) · [run](outside.md#outside.bench.run) (outside.bench) · [run-id](cli.md#cli.run-id) (cli) · [rust](extract.md#extract.rust) (extract) · [rust-imports](map.md#map.rust-imports) (map) · [RustResolver](map.md#map.rust-imports.RustResolver) (map.rust-imports)

**S** · [safe-write](base.md#base.safe-write) (base) · [scc](check.md#check.scc) (check) · [screen](tui.md#tui.screen) (tui) · [scripts](outside.md#outside.design.scripts) (outside.design) · [scripts](outside.md#outside.scripts) (outside) · [Server](cli.md#cli.lsp.Server) (cli.lsp) · [snapshot](map.md#map.snapshot) (map) · [SnapshotWorker](tui.md#tui.background.SnapshotWorker) (tui.background) · [span](base.md#base.span) (base) · [spec-ir](lang.md#lang.spec-ir) (lang) · [spec-to-code](features.md#features.spec-to-code) (features) · [stale](features.md#features.stale) (features) · [state](tui.md#tui.state) (tui) · [stats](features.md#features.stats) (features)

**T** · [terminal](tui.md#tui.terminal) (tui) · [test-report](check.md#check.test-report) (check) · [text-to-spec](tui.md#tui.text-to-spec) (tui) · [theme](tui.md#tui.theme) (tui) · [trace](cli.md#cli.trace) (cli) · [trace-evidence](check.md#check.trace-evidence) (check) · [trace-hooks](cli.md#cli.trace-hooks) (cli) · [trace-plan](map.md#map.trace-plan) (map) · [treesitter](extract.md#extract.treesitter) (extract) · [ts](extract.md#extract.ts) (extract)

**V** · [verdict](check.md#check.verdict) (check) · [view](tui.md#tui.view) (tui) · [voice](features.md#features.voice) (features) · [voice-local](features.md#features.voice-local) (features) · [vscode](outside.md#outside.editors.vscode) (outside.editors)

**W** · [web](tui.md#tui.web) (tui) · [width](tui.md#tui.width) (tui) · [wire-gen](map.md#map.wire-gen) (map) · [wiring](check.md#check.wiring) (check) · [wiring-lifecycle](outside.md#outside.examples.wiring-lifecycle) (outside.examples)
