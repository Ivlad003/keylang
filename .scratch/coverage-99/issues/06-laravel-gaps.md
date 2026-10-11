# 06: Laravel: що викликає фреймворк поза маршрутами

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** Класифікувати 2160 orphans koel (`coverage --json`, `escapes`) і закрити найбільші категорії адаптером `laravel`: auto-discovered listeners, policies (`Gate`), service providers `register/boot`, middleware `handle`, form requests `rules/authorize`, Eloquent accessors/scopes/observers, jobs `handle`, notifications `via/toMail`, `__invoke` контролерів. Кожна категорія — тест на фікстурі `tests/fixtures/laravel-*`.

- [ ] koel: M3 ≥ 99 % живого коду
- [ ] категорії й лічильники до/після — у Comments

## Comments
