# 06: Структурований `full` для `explain <id> --llm --full`

**Джерело:** spec §4.1 A2, §1b; research-c4-zoom-literature §5 (NL Outlines), §9 п. 3

**What to build:** Рівень `full` уже просить мету, кроки й гілки, крайні випадки (`explanationRequest`, `src/explain-llm.ts`). Тепер промпт `full` просить п'ять розділів із заголовками `##` мовою `explain.lang`: призначення; кроки; гілки й крайні випадки; виклики; потоки й правила. Промпт додає `holes` зведення вузла, тобто конструкції, які keylang не перетворив на ребра, щоб розділ про виклики називав нерозв'язане, а не вигадував ребра. Потоки й правила вже є у зведенні.

Невідомі ID у відповіді, як і зараз, зберігаються й позначаються рядком `unknown ids`; відповідь не відкидається. TUI показує заголовки `##` збереженого `full` як заголовки в поясненні (hover і низ панелі навігації). `explain <id> --full` друкує текст як є. Промпти `short` і `brief` не змінюються.

**Blocked by:** None (can start immediately)

**Type:** code

**Model:** claude:claude-opus-5-5

**Status:** resolved

**Verify:** `node --test tests/explain-full.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] тести тікета — у новому файлі `tests/explain-full.test.ts`: Verify запускає його окремо, тож без нього тікет не закриється
- [x] e2e з мок-провайдером: промпт `full` просить п'ять розділів і містить `holes` вузла з нерозв'язаним викликом; промпти `short` і `brief` без змін
- [x] відповідь мока з `##`-заголовками зберігається; TUI-тест показує їх як заголовки
- [x] відповідь із невідомим ID зберігається й показує `unknown ids`, як зараз
- [x] tools.md описує структуру `full`

## Comments

- 2026-10-04 (Claude Code, сесія keylang-c9): зроблено без shiftwork. Розділи `full` — `FULL_SECTIONS` у `src/explain-llm.ts`; перелік нерозв'язаних конструкцій вузла (файл, рядок, фрагмент, причина) з покриття знімка — лише для `full`, бо кількість їх уже є у зведенні вузла. TUI: заголовки `##` — `title` у підказці `e` (`src/tui/app.ts`) і жирний рядок у звіті пояснення (`src/tui/view.ts`). Тести — `tests/explain-full.test.ts` і тест TUI «a saved full answer reads in sections».
