# rules

Як шари keylang залежать один від одного. `cli` — вхід; ядро мови (`lang`,
`base`) не знає ні про карту, ні про tree-sitter.

- layers base < extract < lang < check < map < cli
- deny lang map
- deny lang extract
- deny check extract
- entry
  - cli.keylang
  - cli.index
- no-cycles
