# 71: Два тести падають лише під навантаженням машини

**Status:** ready-for-agent

**Type:** test

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/tui-session.test.ts tests/web.test.ts` · `npm run typecheck`

**Джерело:** повний `npm test` 2026-10-08 на master при load average 15–30 (паралельні агенти): 1148 тестів, 1134 pass, 6 fail. Чотири падіння — справжні розбіжності після злиттів (виправлено комітом `67d9055`). Два проходять при повторному запуску й поодинці:

- `tests/tui-session.test.ts` «tui: typing while an analysis runs keeps the result outdated» (313 мс);
- `tests/web.test.ts:660` «web: init → new feature → edit → read → map → feature over the real transport …» — `timed out waiting for reading` (20 с).

## Що зробити

- Знайти, на що спирається кожен тест у часі (фіксований таймаут, гонка між аналізом і вводом), і замінити очікування на подію/стан, а не на час; таймаут `waitFor` у web-тесті прив'язати до стану сесії.
- Перевірити під штучним навантаженням: `stress-ng --cpu 8` або паралельний `npm test` двічі; тест має проходити 10 разів поспіль.

## Критерії готовності

- [ ] обидва тести стабільні під навантаженням (10/10)
- [ ] жодних збільшених таймаутів як «виправлення»

## Comments
