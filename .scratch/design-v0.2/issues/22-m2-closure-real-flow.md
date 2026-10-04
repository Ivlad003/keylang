# 22: Закриття M2: один реальний сценарій keylang проходить увесь цикл

**Етап:** M2 · **Джерело:** design §9 критерій M2, review критичний шлях п.2

**What to build:** Реальний потік самого keylang (наприклад, `keylang check`: CLI → завантаження документів → резолвінг → правила → вивід) описаний у `keylang/flows/check.md` з `trigger`, вкладеними `step`, `invariant`+`test` і e2e-тестом під `@flow`. Він проходить `ID`, `static`, `tests`, `trace` і показує окремі докази; сценарії видалення кроку, повтору, паралельності, неповного/застарілого trace, `planned` → реалізація та зміни тіла без зміни сигнатури відтворені на ньому або на бенчмарку. Результати в `bench/results.md`, статус M2 у `docs/design.md` §9.

**Blocked by:** 19, 20, 21

**Status:** resolved

- [x] `node bin/keylang.js check --strict` на репозиторії keylang проходить із flow `check`, або перелік `unverified` пояснений у документі потоку
- [x] `keylang/flows/*.md` збережені при `map`; `map --check` зелений
- [x] усі негативні сценарії M2 мають тест або запис у бенчмарку з результатом — крім «тіло змінилося, сигнатура ні» (тікет 21)
- [x] `docs/design.md` §9 рядок M2 позначено виконаним із датою

## Answer

`keylang/flows/check.md` описує реальний ланцюжок `check` (11 вузлів, 2 invariant+test). Після `npm test` `check --strict` на keylang — 0 (`0 fail, 0 unverified, 38 ok`). `map` не чіпає flows, `map --check` — 0. Негативні сценарії M2 — `tests/flows.test.ts`, таблиця — `bench/results.md` M2. `design.md` §9: M2 виконано 2026-09-27. **Лишається:** сценарій «зміна тіла без зміни сигнатури» — це тікет 21 (needs-triage: формат і місце baseline — рішення людини).
