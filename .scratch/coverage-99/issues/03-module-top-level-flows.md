# 03: Модуль, чий верхній рівень виконується, — корінь flow

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** Р2: `flows discover` і `draft flow --mode algo` для entry з `id` модуля беруть виклики верхнього рівня модуля (`FileFacts` уже має їх як «called from module-level code») кроками. Досяжність (`coverage`) рахує їх від такого entry. Зараз це «no fn to draft from».

- [ ] kosmo-tui, reslop: flow з `bin`, M2 = 100 %
- [ ] досяжність від модуля-entry > 0
- [ ] тест: `bin/cli.js` без `main` → flow з кроками викликів верхнього рівня

## Comments
