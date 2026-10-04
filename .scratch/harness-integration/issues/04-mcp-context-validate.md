# 04: MCP `context` і `validate_spec`

**Джерело:** spec Q10; design §7.6 «Цикл»

**What to build:** `context {id | feature}` повертає пакет контексту, який будує панель F4 (`src/agent-context.ts`): вузли й сусіди, потоки й правила, фрагменти коду, e2e-тести, з оцінкою токенів; для `feature` — усі ID файла фічі. Логіку збирання пакета винести з TUI у спільну функцію без залежності від TUI. `validate_spec {path, text}` розбирає текст як специфікацію за вказаним шляхом поверх поточного знімка й специфікацій (цей файл замінено текстом) і повертає діагностики та вердикти `check` лише для цього файла. Нічого не пише.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `validate_spec` з K001 повертає код і позицію (line/col за контрактом span)
- [x] `validate_spec` не створює файлів і не змінює `.keylang/`
- [x] `context` для planned ID явно позначає planned і неповноту
- [x] TUI F4 показує той самий пакет, що й MCP (спільна функція)

Ключові файли: `src/mcp.ts`, `src/agent-context.ts`, `tests/cli.test.ts` (MCP через stdio)

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1; `src/agent-context.ts` (`contextForIds` і `contextPack` через спільний `addIdItems`), `src/mcp.ts`; tests/mcp.test.ts «mcp: context, validate_spec, scaffold and feature_status», tests/tui.test.ts «tui: the context panel (F4)…planned is marked».
