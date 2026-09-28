<!-- keylang:generated — не редагувати, `keylang map` -->

## Explained map

The tree of the map with a brief under each node: the documentation comment from the code, or a brief a model wrote, marked _(llm · model · date)_ and _stale_ once the code under it changed. `keylang map` writes it from the code and `explain/brief/`; it never asks a model.

| Layer | Explanation | Code | LLM | LLM, stale | None |
|---|---|---|---|---|---|
| [base](base.md) |  | 40 | 0 | 0 | 32 |
| [check](check.md) |  | 76 | 0 | 0 | 78 |
| [cli](cli.md) |  | 28 | 0 | 0 | 57 |
| [external](external.md) |  | | | | |
| [extract](extract.md) |  | 108 | 0 | 0 | 65 |
| [features](features.md) |  | 118 | 0 | 0 | 84 |
| [lang](lang.md) |  | 27 | 0 | 0 | 43 |
| [map](map.md) |  | 99 | 0 | 0 | 128 |
| [tui](tui.md) |  | 151 | 0 | 0 | 176 |
| **all** | | 647 | 0 | 0 | 663 |

## Index

Modules and classes by name; the parent ID follows each one.

**A** · [agent-context](features.md#features.agent-context) (features) · [analysis-worker](tui.md#tui.analysis-worker) (tui) · [analyze](map.md#map.analyze) (map) · [app](tui.md#tui.app) (tui) · [App](tui.md#tui.app.App) (tui.app) · [assess](check.md#check.assess) (check) · [assist](tui.md#tui.assist) (tui) · [Assist](tui.md#tui.assist.Assist) (tui.assist) · [AudioQueue](tui.md#tui.web.AudioQueue) (tui.web)

**B** · [background](tui.md#tui.background) (tui) · [bodies](extract.md#extract.bodies) (extract) · [brief](base.md#base.brief) (base) · [buffer](tui.md#tui.buffer) (tui)

**C** · [check-results](features.md#features.check-results) (features) · [cli](cli.md#cli.cli) (cli) · [code-highlight](tui.md#tui.code-highlight) (tui) · [config](base.md#base.config) (base)

**D** · [diag](base.md#base.diag) (base) · [disk](tui.md#tui.disk) (tui) · [doc-comments](extract.md#extract.doc-comments) (extract) · [draft](features.md#features.draft) (features) · [draft-llm](features.md#features.draft-llm) (features)

**E** · [emit](map.md#map.emit) (map) · [evidence](tui.md#tui.evidence) (tui) · [explain](features.md#features.explain) (features) · [explain-llm](features.md#features.explain-llm) (features) · [explain-node](features.md#features.explain-node) (features) · [explanations](map.md#map.explanations) (map) · [exports](map.md#map.exports) (map)

**F** · [fact-cache](map.md#map.fact-cache) (map) · [FactCache](map.md#map.fact-cache.FactCache) (map.fact-cache) · [facts](extract.md#extract.facts) (extract) · [files](lang.md#lang.files) (lang) · [flows](check.md#check.flows) (check) · [fmt](lang.md#lang.fmt) (lang) · [frontends](map.md#map.frontends) (map)

**G** · [ghost](features.md#features.ghost) (features) · [glob](base.md#base.glob) (base) · [grammars](extract.md#extract.grammars) (extract) · [graph](map.md#map.graph) (map) · [Grid](tui.md#tui.screen.Grid) (tui.screen)

**I** · [ImportResolver](map.md#map.imports.ImportResolver) (map.imports) · [imports](map.md#map.imports) (map) · [Index](check.md#check.resolve.Index) (check.resolve) · [index](cli.md#cli.index) (cli) · [input](tui.md#tui.input) (tui) · [InputDecoder](tui.md#tui.input.InputDecoder) (tui.input) · [ir](lang.md#lang.ir) (lang)

**K** · [keylang](cli.md#cli.keylang) (cli) · [keys](features.md#features.keys) (features)

**L** · [languages](base.md#base.languages) (base) · [Line](lang.md#lang.parser.Line) (lang.parser) · [llm](features.md#features.llm) (features) · [lsp](cli.md#cli.lsp) (cli) · [lsp-features](features.md#features.lsp-features) (features) · [LspError](cli.md#cli.lsp.LspError) (cli.lsp)

**M** · [map](map.md#map.map) (map) · [markdown](tui.md#tui.markdown) (tui) · [Matcher](check.md#check.trace-evidence.Matcher) (check.trace-evidence) · [mcp](cli.md#cli.mcp) (cli) · [merge](tui.md#tui.merge) (tui) · [merge-session](tui.md#tui.merge-session) (tui) · [MergeSession](tui.md#tui.merge-session.MergeSession) (tui.merge-session)

**N** · [nav](tui.md#tui.nav) (tui) · [node-search](features.md#features.node-search) (features) · [node-test](cli.md#cli.node-test) (cli)

**O** · [OverBudget](check.md#check.trace-evidence.OverBudget) (check.trace-evidence)

**P** · [parser](lang.md#lang.parser) (lang) · [Parser](lang.md#lang.parser.Parser) (lang.parser) · [proposals](features.md#features.proposals) (features) · [python](extract.md#extract.python) (extract) · [python-imports](map.md#map.python-imports) (map) · [PythonResolver](map.md#map.python-imports.PythonResolver) (map.python-imports)

**R** · [resolve](check.md#check.resolve) (check) · [rules](check.md#check.rules) (check) · [run-id](cli.md#cli.run-id) (cli) · [rust](extract.md#extract.rust) (extract) · [rust-imports](map.md#map.rust-imports) (map) · [RustResolver](map.md#map.rust-imports.RustResolver) (map.rust-imports)

**S** · [safe-write](base.md#base.safe-write) (base) · [scc](check.md#check.scc) (check) · [screen](tui.md#tui.screen) (tui) · [Server](cli.md#cli.lsp.Server) (cli.lsp) · [snapshot](map.md#map.snapshot) (map) · [SnapshotWorker](tui.md#tui.background.SnapshotWorker) (tui.background) · [span](base.md#base.span) (base) · [spec-to-code](features.md#features.spec-to-code) (features) · [state](tui.md#tui.state) (tui) · [stats](features.md#features.stats) (features)

**T** · [terminal](tui.md#tui.terminal) (tui) · [test-report](check.md#check.test-report) (check) · [text-to-spec](tui.md#tui.text-to-spec) (tui) · [theme](tui.md#tui.theme) (tui) · [trace](cli.md#cli.trace) (cli) · [trace-evidence](check.md#check.trace-evidence) (check) · [trace-hooks](cli.md#cli.trace-hooks) (cli) · [trace-plan](map.md#map.trace-plan) (map) · [treesitter](extract.md#extract.treesitter) (extract) · [ts](extract.md#extract.ts) (extract)

**V** · [verdict](check.md#check.verdict) (check) · [view](tui.md#tui.view) (tui) · [voice](features.md#features.voice) (features) · [voice-local](features.md#features.voice-local) (features)

**W** · [web](tui.md#tui.web) (tui) · [width](tui.md#tui.width) (tui) · [wire-gen](map.md#map.wire-gen) (map) · [wiring](check.md#check.wiring) (check)
