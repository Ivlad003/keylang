# rules

Як шари keylang залежать один від одного. `cli` — вхід; ядро мови (`lang`,
`base`) не знає ні про карту, ні про tree-sitter. Адаптери — окремі входи:
Node завантажує репортер через `--test-reporter`, trace — через `--import`,
а його hooks — через `module.register`.

- layers base < extract < lang < check < map < cli
- deny lang map
- deny lang extract
- deny check extract
- entry
  - cli.keylang
  - cli.index
  - cli.node-test
  - cli.trace
  - cli.trace-hooks
- no-cycles
