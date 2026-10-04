# 04: Рядок із K003 отримує `ok`

**Status:** ready-for-agent

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: кандидат 4 (сесія 3, ведучий відтворив).

**What to build:** На рядку з непарним відступом `check` друкує K003 (error) і на тому самому рядку `ID ok` та `static ok`. Парсер відновлює структуру за format.md §3 (таблиця відновлення: «непарний відступ — глибина = відступ / 2 з округленням вниз»), і вердикти рахуються на відновленому дереві. Код виходу 1 правильний, але читач бачить і «помилка структури», і «перевірено» на одному рядку, а підсумок рахує обидва (`1 fail, … 5 ok`). `fmt` на цьому файлі відмовляє (Р4), тож структура, на якій стоїть `ok`, — та, яку `fmt` записати не погодився б.

Відтворення (master `c408f53`): копія `tests/fixtures/repo`, потік зі [спільного відтворення](../spec.md#спільне-відтворення), рядок 7 `   - step domain.order.total` (3 пробіли):

```
keylang/flows/pilot.md:7:4: K003 indentation must be a multiple of 2 spaces, found 3
keylang/flows/pilot.md:7:4: ID ok domain.order.total: exact
keylang/flows/pilot.md:7:4: static ok domain.order.total: called from domain.order.createOrder
```

`fmt --check` того самого файла — лише K003, код 1.

## Що має вирішити людина

1. **`unverified` замість `ok`.** На рядку з K003 і в його піддереві `ok` стає `unverified` «structure recovered after K003 at 7:4». `fail` лишається `fail`. Підсумок перестає показувати `ok` для рядка, якого `fmt` не прийняв.
2. **Не друкувати вердикти** на рядку з K003 і його нащадках, як `static` не друкується після K001. Чистіше, але рядок зникає з підсумку.
3. **Лишити як є** і описати в format.md §3, що вердикти рахуються на відновленій структурі.

**Рекомендація:** 1 — зберігає рядок у звіті й не дає `ok` на структурі, якої немає у файлі.

- [ ] рішення записане у format.md §3 (таблиця відновлення) і «Flows: докази кроку»
- [ ] фікстура: 3 пробіли перед `step` — вердикти за рішенням; парні відступи без змін
- [ ] те саме для правил (`rules.md`) і стрибка більш ніж на рівень, якщо рішення їх стосується

Ключові файли: `src/parser.ts`, `src/flows.ts`, `src/rules.ts`, `src/check-results.ts`, `docs/format.md`

## Comments

- 2026-10-04 — рішення людини: варіант 1 — на рядку з K003 і в його піддереві `ok` стає `unverified` з причиною «structure recovered after K003 at L:C»; `fail` лишається `fail`.
