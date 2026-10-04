# 06: Посилання як Markdown-лінк у граматиці

**Джерело:** рішення користувача 2026-09-28 (п. 4 spec); ADR 0004 п. 5; format.md §4 «Прив'язка до коду», §5 «Аргументи»

**What to build:** У будь-якій позиції, де граматика чекає посилання на ID (`calls`, `reads`, ціль залежності `<alias> <id>`, `trigger`, `step`, `then <id>`, `layers`, `allow`/`deny`, діти `entry`, `module <id>` у rules, `wire`, `compose`, `when … → <id>`), посилання можна записати як `[id](href)`. Резолвер бере ID з тексту лінка, а `href` зберігається в IR без перевірки, як для лінка оголошення. Span посилання вказує на ID усередині `[…]`. `fmt` зберігає форму: лінк лишається лінком, голе ID — голим. Порожній текст лінка, текст не-ID чи незакритий лінк дає K005 з позицією. LSP-функції (hover, definition, references, completion, rename, якщо є) працюють з курсором на ID в лінку. Канонічна карта не змінюється.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `parse --json`: spans ID у лінку в `calls a, [b.c](x.md#b.c)` — UTF-16 offset, col у code points, для не-ASCII ID теж
- [x] `check`: невідоме ID у лінку → K001 на тексті лінка; відоме — резолвиться, вердикти потоків ті самі, що для голого ID
- [x] `fmt` ідемпотентний на суміші лінків і голих ID; `specHash` вердиктів не змінюється
- [x] K005 на `[](x)`, `[не id](x)`, `[a.b](x`
- [x] LSP definition і references з позиції всередині `[…]` (tests/lsp.test.ts)
- [x] format.md §4–5 з прикладами; регресія: фікстури `diagnostics.expected` без змін

## Comments

- 2026-09-28 (агент): зроблено в `3ca1816`. Реалізовано окремим агентом у worktree, злито в 6e33827. `Ref.link?: Link`; `renderMeaning` для `specHash`.
