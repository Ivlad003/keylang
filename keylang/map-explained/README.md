<!-- keylang:generated — не редагувати, `keylang map` -->

## Explained map

The tree of the map with a brief under each node: the documentation comment from the code, or a brief a model wrote, marked _(llm · model · date)_ and _stale_ once the code under it changed. `keylang map` writes it from the code and `explain/brief/`; it never asks a model.

| Layer | Explanation | Code | LLM | LLM, stale | None |
|---|---|---|---|---|---|
| [base](base.md) |  | 47 | 0 | 0 | 32 |
| [check](check.md) |  | 89 | 0 | 0 | 81 |
| [cli](cli.md) |  | 46 | 0 | 0 | 88 |
| [external](external.md) |  | | | | |
| [extract](extract.md) |  | 110 | 0 | 0 | 64 |
| [features](features.md) |  | 137 | 0 | 0 | 95 |
| [lang](lang.md) |  | 42 | 0 | 0 | 87 |
| [map](map.md) |  | 105 | 0 | 0 | 130 |
| [operations](operations.md) |  | 9 | 0 | 0 | 7 |
| [tui](tui.md) |  | 204 | 0 | 0 | 188 |
| **all** | | 789 | 0 | 0 | 772 |

## Index

Modules and classes by name; the parent ID follows each one.

**A** · [actions](tui.md#tui.actions) (tui) · [agent-context](features.md#features.agent-context) (features) · [analysis-worker](tui.md#tui.analysis-worker) (tui) · [analyze](map.md#map.analyze) (map) · [app](tui.md#tui.app) (tui) · [App](tui.md#tui.app.App) (tui.app) · [assess](check.md#check.assess) (check) · [assist](tui.md#tui.assist) (tui) · [Assist](tui.md#tui.assist.Assist) (tui.assist) · [AudioQueue](tui.md#tui.web.AudioQueue) (tui.web)

**B** · [background](tui.md#tui.background) (tui) · [baseline](features.md#features.baseline) (features) · [bodies](extract.md#extract.bodies) (extract) · [brief](base.md#base.brief) (base) · [buffer](tui.md#tui.buffer) (tui)

**C** · [changed](features.md#features.changed) (features) · [check-results](features.md#features.check-results) (features) · [cli](cli.md#cli.cli) (cli) · [code-highlight](tui.md#tui.code-highlight) (tui) · [config](base.md#base.config) (base)

**D** · [declared-packages](map.md#map.declared-packages) (map) · [diag](base.md#base.diag) (base) · [disk](tui.md#tui.disk) (tui) · [doc-comments](extract.md#extract.doc-comments) (extract) · [draft](features.md#features.draft) (features) · [draft-llm](features.md#features.draft-llm) (features)

**E** · [emit](map.md#map.emit) (map) · [evidence](tui.md#tui.evidence) (tui) · [explain](features.md#features.explain) (features) · [explain-llm](features.md#features.explain-llm) (features) · [explain-node](features.md#features.explain-node) (features) · [explanations](map.md#map.explanations) (map) · [exports](map.md#map.exports) (map)

**F** · [fact-cache](map.md#map.fact-cache) (map) · [FactCache](map.md#map.fact-cache.FactCache) (map.fact-cache) · [facts](extract.md#extract.facts) (extract) · [feature-status](features.md#features.feature-status) (features) · [files](lang.md#lang.files) (lang) · [findings](tui.md#tui.findings) (tui) · [flows](check.md#check.flows) (check) · [fmt](lang.md#lang.fmt) (lang) · [frontends](map.md#map.frontends) (map)

**G** · [ghost](features.md#features.ghost) (features) · [glob](base.md#base.glob) (base) · [grammars](extract.md#extract.grammars) (extract) · [graph](map.md#map.graph) (map) · [Grid](tui.md#tui.screen.Grid) (tui.screen)

**H** · [harness](cli.md#cli.harness) (cli)

**I** · [ImportResolver](map.md#map.imports.ImportResolver) (map.imports) · [imports](map.md#map.imports) (map) · [Index](check.md#check.resolve.Index) (check.resolve) · [index](cli.md#cli.index) (cli) · [input](tui.md#tui.input) (tui) · [InputDecoder](tui.md#tui.input.InputDecoder) (tui.input) · [ir](lang.md#lang.ir) (lang)

**K** · [keylang](cli.md#cli.keylang) (cli) · [keys](features.md#features.keys) (features)

**L** · [languages](base.md#base.languages) (base) · [Line](lang.md#lang.parser.Line) (lang.parser) · [llm](features.md#features.llm) (features) · [lsp](cli.md#cli.lsp) (cli) · [lsp-features](features.md#features.lsp-features) (features) · [LspError](cli.md#cli.lsp.LspError) (cli.lsp)

**M** · [map](map.md#map.map) (map) · [markdown](tui.md#tui.markdown) (tui) · [Matcher](check.md#check.trace-evidence.Matcher) (check.trace-evidence) · [mcp](cli.md#cli.mcp) (cli) · [merge](tui.md#tui.merge) (tui) · [merge-session](tui.md#tui.merge-session) (tui) · [MergeSession](tui.md#tui.merge-session.MergeSession) (tui.merge-session)

**N** · [nav](tui.md#tui.nav) (tui) · [node-search](features.md#features.node-search) (features) · [node-test](cli.md#cli.node-test) (cli)

**O** · [operations](operations.md#operations.operations) (operations) · [OverBudget](check.md#check.trace-evidence.OverBudget) (check.trace-evidence)

**P** · [parser](lang.md#lang.parser) (lang) · [Parser](lang.md#lang.parser.Parser) (lang.parser) · [proposals](features.md#features.proposals) (features) · [python](extract.md#extract.python) (extract) · [python-imports](map.md#map.python-imports) (map) · [PythonResolver](map.md#map.python-imports.PythonResolver) (map.python-imports)

**R** · [resolve](check.md#check.resolve) (check) · [rules](check.md#check.rules) (check) · [run-id](cli.md#cli.run-id) (cli) · [rust](extract.md#extract.rust) (extract) · [rust-imports](map.md#map.rust-imports) (map) · [RustResolver](map.md#map.rust-imports.RustResolver) (map.rust-imports)

**S** · [safe-write](base.md#base.safe-write) (base) · [scc](check.md#check.scc) (check) · [screen](tui.md#tui.screen) (tui) · [Server](cli.md#cli.lsp.Server) (cli.lsp) · [snapshot](map.md#map.snapshot) (map) · [SnapshotWorker](tui.md#tui.background.SnapshotWorker) (tui.background) · [span](base.md#base.span) (base) · [spec-ir](lang.md#lang.spec-ir) (lang) · [spec-to-code](features.md#features.spec-to-code) (features) · [state](tui.md#tui.state) (tui) · [stats](features.md#features.stats) (features)

**T** · [terminal](tui.md#tui.terminal) (tui) · [test-report](check.md#check.test-report) (check) · [text-to-spec](tui.md#tui.text-to-spec) (tui) · [theme](tui.md#tui.theme) (tui) · [trace](cli.md#cli.trace) (cli) · [trace-evidence](check.md#check.trace-evidence) (check) · [trace-hooks](cli.md#cli.trace-hooks) (cli) · [trace-plan](map.md#map.trace-plan) (map) · [treesitter](extract.md#extract.treesitter) (extract) · [ts](extract.md#extract.ts) (extract)

**V** · [verdict](check.md#check.verdict) (check) · [view](tui.md#tui.view) (tui) · [voice](features.md#features.voice) (features) · [voice-local](features.md#features.voice-local) (features)

**W** · [web](tui.md#tui.web) (tui) · [width](tui.md#tui.width) (tui) · [wire-gen](map.md#map.wire-gen) (map) · [wiring](check.md#check.wiring) (check)
