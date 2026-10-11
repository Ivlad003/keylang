# 01: вимірювання M1–M4 на bench

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node --test tests/bench-coverage.test.ts`

**Джерело:** [spec](../spec.md)

**What to build:** `bench/coverage.ts [--work dir] [--repo name] [--json]`: копія кожного репо (як `bench/run.ts`), `map`, `coverage --json`, `flows discover --print`, і M1–M4 зі spec §1. M1 читає `bench/truth/<repo>.md` (рядок на точку входу: `kind label`). `bench/clone.ts` додає `koel/koel` (PHP). Чиста функція `coverageMetrics(index, coverage, discoverStderr, truth)` у `bench/metrics.ts` з юніт-тестом на мінімальних даних.

- [ ] M1–M4 на кожен репо однією таблицею, вихід 1, якщо `--min 0.99` не досягнуто
- [ ] мертві fn (M3) — окремий список з причиною, не в знаменнику
- [ ] `bench/truth/*.md` для всіх 8 репо, звірені вручну (джерело кожного рядка — файл:рядок)
- [ ] без мережі тест проходить на фікстурі

## Comments
