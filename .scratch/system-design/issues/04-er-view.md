# 04: ER-представлення

**Status:** resolved

**Type:** code

**Blocked by:** 02

**Verify:** `node --test tests/system-view.test.ts` · `npm run test:web` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р5, Р11

**What to build:** `view=er&name=`: таблиця — фігура з рядками колонок (PK, FK, типи), зв'язки FK з кардинальністю (`N:1`, `1:1` для `unique`), доріжка на кожну БД. Кнопка «ER» на сторінці для системи з таблицями.

- [x] таблиці з колонками й позначками PK/FK; ребро FK з кардинальністю
- [x] e2e: перемикач «Схема/ER/Sequence» показує ER

## Comments

### Notes

- 2026-10-11: ER розміщує сам (`placed: true`): доріжка на сховище, до 4 таблиць у ряду, висота — за колонками; FK `N:1`, `1:1` для `unique`/`pk`.
- 2026-10-11: Тести: `tests/system-view.test.ts`, `tests/web-e2e/system.test.ts`.
