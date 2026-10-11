# 02: перевірка системи: K401–K403, вердикти `system`

**Status:** resolved

**Type:** code

**Blocked by:** 01

**Verify:** `node --test tests/system-check.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р8, Р9, §4

**What to build:** `src/system.ts` — компіляція секцій у `SystemSpec` (компоненти зі шляхом зон, зв'язки, таблиці, sequence, інтерв'ю) і перевірка `systemCheck(docs, snapshot)`, підключена в `assess`. `src/system-catalog.ts` — каталог технологій. Коди K401–K403 у `src/diag.ts` і `docs/semantics.md`; дублікати — K002; `code <id>` резолвиться звичайним резолвером (K001).

- [x] K401 на цілі зв'язку й учаснику sequence, з «did you mean»
- [x] K402 на `fk` до невідомої таблиці чи колонки
- [x] вердикт `ok`: сервіс з `code app` `reads db` (postgres), `app` імпортує модуль, що імпортує `pg`; `unverified` без імпорту; немає вердикту без `code`
- [x] сервіс → сервіс: `ok` за імпортом, `unverified` без нього
- [x] K403: код імпортує `ioredis`, у компонента немає зв'язку з кешем redis
- [x] `check --format json` має вердикти з критерієм `system <name>`

## Comments

### Notes

- 2026-10-11: `src/system.ts`: `systemsOf` (K002/K401/K402), `systemCheck` (вердикти `system <name>`, K403), граф модулів `moduleGraph`/`reach`; `Assessment.systems`. `src/system-catalog.ts`: 40+ технологій, загальні SQL-клієнти, `boto3` — неоднозначний пакет (без K403).
- 2026-10-11: Рішення Р9 як у spec: `fail` система не дає. Повідомлення вердикту — `<area>: <доказ>` (human-вивід додає `ok`/`unverified` сам).
- 2026-10-11: Тести: `tests/system-check.test.ts` (2); `docs/semantics.md` §7 «Система», коди в таблиці, `src/explain.ts` K401–K403.
