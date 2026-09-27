# rules

Як шари keylang залежать один від одного. `cli` — вхід; ядро мови (`lang`,
`base`) і перевірка (`check`) не знають ні про карту, ні про tree-sitter —
ні через `extract`, ні напряму через пакет. Адаптери — окремі входи:
Node завантажує репортер через `--test-reporter`, trace — через `--import`,
а його hooks — через `module.register`.

- layers base < extract < lang < check < map < cli
- deny lang map
- deny lang extract
- deny check extract
- deny lang external.web-tree-sitter
- deny check external.web-tree-sitter
- deny base external.web-tree-sitter
- entry
  - cli.keylang
  - cli.index
  - cli.node-test
  - cli.trace
  - cli.trace-hooks
- no-cycles
