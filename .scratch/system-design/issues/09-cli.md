# 09: `system list|show|new`, шаблон інтерв'ю, документація

**Status:** resolved

**Type:** code

**Blocked by:** 02, 06

**Verify:** `node --test tests/cli-system.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р13

**What to build:** `keylang system list` (імена й файли), `system show <name>` (дерево зон і компонентів зі зв'язками й вердиктами, таблиці, sequence), `system new <name> [--interview]` (каркас; з `--interview` — розділи вимог, оцінок, компонентів, схеми, sequence, компромісів; наявний файл — код 2). Приклад `docs/examples/system/url-shortener.md`. `docs/cli.md`, `docs/tui.md`, README.

- [x] `system new` пише файл, що проходить `check`; вдруге — код 2, файл не змінено
- [x] `system show` друкує вердикти; невідома система — код 2
- [x] `--help` перелічує підкоманди

## Comments

### Notes

- 2026-10-11: Операція `system` (`src/operations/system.ts`) — для CLI і TUI (звіт F6). Приклад — `examples/system-interview/url-shortener.md` (замість `docs/examples/…`: приклади репозиторію лежать у `examples/`). Документація: `docs/cli.md#system`, `docs/tui.md`, README, `CONTEXT.md` (термін «System»), `docs/cheatsheet.md`.
- 2026-10-11: Тести: `tests/cli-system.test.ts` (3).
