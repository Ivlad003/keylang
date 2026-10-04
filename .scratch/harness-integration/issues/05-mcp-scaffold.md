# 05: MCP `scaffold`

**Джерело:** spec Q19; ADR 0005 п. 4

**What to build:** `scaffold {id, into?}` повертає те, що `spec-to-code <id> --print` у режимі шаблону: шлях цільового файла, текст заготовки й тестів, що падають, і що кандидат додає до `check`. Без LLM і без запису; ті самі коди помилок, що в CLI, стають помилкою інструмента з причиною.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] результат для `planned fn` збігається з `spec-to-code --print`
- [x] після виклику на диску нічого не змінилося
- [x] ID, що вже реалізовано, — помилка з місцем реалізації

Ключові файли: `src/mcp.ts`, `src/spec-to-code.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1; `src/mcp.ts`, `src/spec-to-code.ts`; tests/mcp.test.ts «mcp: context, validate_spec, scaffold and feature_status» (diff збігається зі `spec-to-code --print`, диск незмінний, `already implemented (src/domain/order.ts:N)`).
