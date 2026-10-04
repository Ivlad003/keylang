# 21: Р-1 migrate: wiring із SpecIR, типи `Wire` у шарі `lang`

**Джерело:** research-pl §5 Р-1; знахідка 4

**What to build:** `Wire` і `WireDep` переїжджають у spec-ir.ts. До 24 wiring.ts ре-експортує їх для wire-gen.ts (wire-gen.ts:13) і cli.ts.

`collectWiring` бере дані зі `spec.wires`:
- K005 умови wiring (wiring.ts:75) рахується із сирої умови `when`, яку SpecIR несе з 18. Перевірку забирає `compileSpec` у 24.
- K102 wiring (wiring.ts:213) рахується через `denyingRule` над SpecIR із 19. Отже, правило з K005 над fn, type чи event тут теж не діє (16, Q11).

`keylang wire [--check] [--out]` поводиться як раніше:
- коди 0/1/2, маркер `keylang:generated` і повідомлення ті самі;
- з `--check` команда нічого не пише.

**Blocked by:** 19 <!-- 19 (migrate rules) -->

**Status:** resolved

**Контракт:** немає

- [x] tests/wiring.test.ts зелені.
- [ ] Новий код визнає актуальним `keylang.gen.ts`, який згенерував на тимчасовій копії фікстури wiring-shop код до зміни: `wire --check` дає 0 і не переписує файл, а повторний `wire` дає порожній stdout і той самий вміст байт у байт.
- [x] K005 з wiring.ts:75 і K102 wiring в еталоні 17 не змінилися.
- [x] `src/wiring.ts` не читає `node.refs`.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/wiring.ts`, `src/wire-gen.ts`, `src/cli.ts`, `src/spec-ir.ts`, `tests/wiring.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; Wire/WireDep у src/spec-ir.ts, checkWiring(spec, …) у src/wiring.ts, wire-gen.ts імпортує Wire зі spec-ir.ts; tests/wiring.test.ts і еталон spec-forms зелені. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
