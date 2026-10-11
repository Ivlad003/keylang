# 13: Пошук: кеш індексу

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 09

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [spec](../spec.md)

**What to build:** Серіалізований індекс у `.keylang/search.json` з ключем `snapshotId` + хеш спек; diff і код не кешуються. Битий кеш — перебудова, не помилка.

- [ ] другий запуск не перебудовує (лічильник у stderr з `--stats`)
- [ ] зміна спеки — перебудова

## Comments
