# 17: Доказ `tests`: звіт тест-раннера прив'язується до `test` у flow

**Етап:** M2 · **Джерело:** design §4.2 доказ `tests`, §8 `check.tests`

**What to build:** `keylang.json` отримує `check.tests` — шлях/глоб до JUnit XML або JSON-звіту. `test <file> "<name>"` у flow зіставляється з результатом за ідентичністю (файл, suite, назва); неоднозначний, відсутній або застарілий (інший `snapshotId`/`runId`, якщо адаптер їх пише) результат — `unverified` з причиною. Успішний однозначний тест дає `ok` для `invariant`/`when`/`then`, до якого прив'язаний; провалений — `fail`. Мінімальний адаптер для `node:test` (репортер), який додає `snapshotId` у звіт, поставляється разом.

**Blocked by:** 16

**Status:** resolved

- [x] фікстура з `invariant … test tests/x.test.ts "computes total"` і звітом, де тест пройшов → `ok`; де провалився → `fail`; без звіту → `unverified` «no report»
- [x] дві однакові назви в різних suite → `unverified` «ambiguous» з переліком кандидатів
- [x] звіт з іншим `snapshotId` → `unverified` «stale report»
- [x] конфіг валідується: неіснуючий шлях у `check.tests` — зрозуміла помилка з назвою поля, код 2
- [x] `docs/format.md` та `docs/design.md` §8 описують формат звіту й адаптер

## Answer

`src/test-report.ts` + репортер `src/adapters/node-test.ts` (`keylang/node-test-reporter`), що пише JSON схеми 1 зі `snapshotId`. `check.tests` — шлях (має існувати, код 2) або глоб; JUnit XML з `keylang.snapshotId`. `fail` — вердикт `tests fail` на твердженні (код 1), не K001; `skip`, неоднозначність, стейл і звіт без `snapshotId` — `unverified`. `npm test` пише `.keylang/reports/node-test.json`.
