# rules

Як шари keylang залежать один від одного. `cli` — вхід; ядро мови (`lang`,
`base`) і перевірка (`check`) не знають ні про карту, ні про tree-sitter —
ні через `extract`, ні напряму через пакет. `features` — запити до однієї
аналізи (hover, definition, completion, explain), спільні для LSP і TUI;
`tui` — термінал і браузер над тими самими запитами. Входи — усе, що Node
запускає сам: CLI, пакет, репортер (`--test-reporter`), trace (`--import`),
його hooks (`module.register`) і worker знімка TUI (`new Worker(new URL(…))`).
Hooks і worker виконуються в окремому потоці, тому вони тут, хоч карта й має
ребро до них від `register(…)` і `new URL(…, import.meta.url)`: видалений
worker — K001 у цьому списку.

- layers base < extract < lang < check < map < features < tui < cli
- deny lang map
- deny lang extract
- deny check extract
- deny lang external.web-tree-sitter
- deny check external.web-tree-sitter
- deny base external.web-tree-sitter
- deny tui extract
- deny tui external.web-tree-sitter
- entry
  - cli.keylang
  - cli.index
  - cli.node-test
  - cli.trace
  - cli.trace-hooks
  - tui.analysis-worker
- no-cycles
