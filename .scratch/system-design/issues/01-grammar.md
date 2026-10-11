# 01: граматика `# system`

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/system-grammar.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р1–Р7

**What to build:** Секція `# system <name>` у `src/parser.ts` і `src/ir.ts`: позиції `system-top`, `zone`, `component`, `table`, `sequence`; нові види вузлів (`component`, `zone`, `code`, `relation`, `scale`, `table`, `column`, `index`, `sequence`, `message`, `requirement`, `nfr`, `estimate`, `tradeoff`; `?` — `question`). Ролі для hover, ключові слова для completion, K006 і K004 з місцем слова. `fmt` ідемпотентний. `docs/grammar.md` §2, §5, Додаток А з прикладами, які перевіряє тест документації.

- [x] компонент: вид, ім'я, технологія (`text`); невідомий вид на верху — K004 з переліком видів
- [x] зв'язок: дієслово, ціль (сегмент), підпис; без цілі — K005
- [x] `table` під компонентом не-сховищем — K005 з переліком видів
- [x] колонка: ім'я, тип, прапорці `pk`, `unique`, `null`, `fk <t>.<c>`; невідомий прапорець — K005
- [x] повідомлення sequence: `a → b текст`, `->`, `⇢`/`-->` (async)
- [x] `# system` без імені — K005; `fmt` двічі дає той самий текст

## Comments

### Notes

- 2026-10-11: `src/parser.ts`: позиції `system-top`, `zone`, `component`, `table`, `sequence`; `COMPONENT_KINDS`, `DATA_STORES`, `RELATION_VERBS`, `COLUMN_FLAGS`. Вид компонента зберігається в `label`, технологія — у `text`; повідомлення: `name` — відправник, `label` — отримувач, стрілка — у токенах.
- 2026-10-11: Припущення: повідомлення K005 для слів після `# rules`/`# map` змінено на «only `# flow`, `# migration` and `# system` take a name» (старе вже було неточним для `# migration`); оновлено `tests/core.test.ts` і фікстуру `spec-forms`.
- 2026-10-11: Тести: `tests/system-grammar.test.ts` (3), позиції EBNF у `tests/format-examples.test.ts`; приклад у `docs/grammar.md` §5 «Система».
