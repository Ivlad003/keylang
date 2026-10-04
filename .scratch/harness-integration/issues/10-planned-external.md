# 10: Інтеграція через `planned module external.<pkg>`

**Джерело:** spec Q22

**What to build:** Перевірено: `planned module external.stripe` і крок потоку до нього вже приймаються. Треба підтвердити й закріпити тестом решту контракту: коли пакет з'являється в імпортах, `planned` дає K202, а крок `app.pay.charge` → `external.stripe` отримує static `ok` лише за наявності ребра від модуля кроку-батька до пакета; без ребра — прогалина `static` у `feature_status`. Якщо static для кроку-модуля зараз поводиться інакше — виправити в `src/flows.ts` без нової граматики й описати у format.md.

**Blocked by:** 06

**Status:** resolved

- [x] фікстура: до встановлення пакета — `unverified planned`
- [x] після імпорту пакета — K202 і static `ok`
- [x] імпорт з іншого модуля, ніж крок-батько, — static не `ok`

Ключові файли: `src/flows.ts`, `src/resolve.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1; `src/flows.ts`; tests/cli.test.ts «planned module external.<pkg> is static ok only from the importing parent module».
