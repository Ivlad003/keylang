# 14: Ворота: ≥ 99 % M1–M4 на всіх репо еталону

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 10

**Verify:** `npm run typecheck` · `npm test` · `node bench/coverage.ts --min 0.99`

**Джерело:** [spec](../spec.md)

**What to build:** Прогнати `bench/coverage.ts` на всіх репо, записати таблицю до/після в `bench/results.md`. Кожен репо нижче 99 % — новий тікет з категорією прогалин, а не зниження цілі.

- [ ] таблиця в `bench/results.md` з датою й комітами репо
- [ ] для кожної метрики < 99 % — тікет-нащадок

## Comments
