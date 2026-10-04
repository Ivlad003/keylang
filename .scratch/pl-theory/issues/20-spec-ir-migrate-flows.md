# 20: Р-1 migrate: `flows.ts` і дерево trace будуються з SpecIR

**Джерело:** research-pl §5 Р-1; знахідка 4; рішення Q2 (spec)

**What to build:** `evaluateFlows` обходить `spec.flows`. Дерево `trigger`/`step`/`when`/claims з `target: Ref` замінює `refOf(node)` і `claimArea(node)` (flows.ts:195-202). `ShapeNode` (trace-evidence.ts:142) для `traceFlow` будується в flows.ts із SpecIR. trace-evidence.ts уже працює над `ShapeNode` і Text IR не читає, тож змін у ньому не очікується. `specHash` рахується з `text` елемента, тобто з того самого `renderMeaning`, і не змінюється.

`collectPlanned` (flows.ts:632) і `plannedIds` (assess.ts:94) беруть дані зі `spec.planned`.

Семантику потоків за Q2 закріплено до міграції:
- норма впорядкованого ін'єктивного включення — 10 (Q12);
- крок в іншому дереві викликів — 11 (Q13);
- trace-вердикт для другого тригера й дітей planned — 12 (Q14);
- сусід, вкладений у попереднього, — 13 (Q15).

Міграція зберігає цю семантику. Тести 10–13 і еталон 17 не змінюються.

Без змін лишаються:
- K201 і K202;
- вердикти ID, static, tests і trace;
- ім'я `evaluateFlows`, яке називає `keylang/flows/check.md`.

**Blocked by:** 18, 10, 11, 12, 13 <!-- 18 (SpecIR expand); 10 (семантика flows); 11 (крок в іншому дереві викликів); 12 (кілька trigger і діти planned); 13 (сусід, вкладений у попереднього) -->

**Status:** resolved

**Контракт:** немає

- [ ] tests/flows.test.ts, зокрема тести 10–13, і еталон 17 без змін. `specHash` вердиктів потоків ті самі.
- [ ] Після `npm test` команда `check` на репозиторії дає для `keylang/flows/check.md` і `keylang/flows/tui.md` ті самі вердикти trace і static.
- [x] `src/flows.ts` не читає `node.refs`. `assess.ts` не обходить Text IR, щоб знайти `planned`.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/flows.ts`, `src/assess.ts`, `src/spec-ir.ts`, `src/trace-evidence.ts` (лише читання)

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; evaluateFlows(spec, …) і collectPlanned над SpecIR (src/flows.ts), assess.ts бере planned зі spec.planned; flows.ts не читає node.refs. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
