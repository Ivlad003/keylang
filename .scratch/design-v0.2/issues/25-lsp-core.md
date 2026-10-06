# 25: `keylang lsp`: діагностики, hover, definition, documentSymbol

**Етап:** M3 · **Джерело:** design §7.1 таблиця LSP, §9 M3

**What to build:** Сервер LSP поверх `analyze()`: діагностики збігаються з CLI (коди, позиції, вердикти з доказами), hover на ID показує сигнатуру, файл:рядок, стан (`planned`, `opaque`, `stale`), definition веде в код або в оголошення в карті, documentSymbol дає дерево шарів/модулів/fn і окремо потоки та правила зі статусами. Зміни у відкритому буфері перевіряються без запису на диск; стан «переіндексація» не показує застарілі результати як актуальні.

**Blocked by:** 23, 24

**Status:** resolved

- [x] інтеграційний тест через stdio: відкрити `keylang/rules.md` фікстури → діагностики ідентичні виводу `check --format json`
- [x] hover на ID кроку flow показує сигнатуру й окремі докази; на planned — «заплановано»
- [x] definition із карти в код відкриває правильний файл і рядок після URL-декодування
- [x] `keylang lsp` у `--help`; залежність `vscode-languageserver` обґрунтована в PR; `npm ls --omit=dev` у межах ліміту дизайну

## Answer

`src/lsp.ts` (сервер) + `src/lsp-features.ts` (чисті функції). Тести `tests/lsp.test.ts`: діагностики відкритого `rules.md` = `check --format json` (push і pull), буфери без запису й заміна покоління, hover із доказами й planned, definition з карти в декодований файл і колонку коду, дерево documentSymbol зі статусами, життєвий цикл, скасування. `vscode-languageserver` не додано — обґрунтування в шапці `src/lsp.ts` і `grammar.md` §9; `npm ls --omit=dev` — 2 пакети. Стан `stale` у hover чекає тікета 21.
