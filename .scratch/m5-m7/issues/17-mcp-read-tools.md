# 17: `keylang mcp`: інструменти `search`, `node`, `code`, `flows`, `check`

**Етап:** M7 · **Джерело:** design §7.3 MCP; батьківський 36

**What to build:** MCP-сервер через stdio поверх `analyze()` на `@modelcontextprotocol/sdk`: `search` за ID/назвою, `node` — сигнатура, ребра, потоки, докази; `code` — фрагмент на вимогу; `flows`; `check` — ті самі вердикти з доказами, що CLI.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] інтеграційний тест через stdio: `node application.purchase.buy` повертає сигнатуру, ребра, потоки, докази
- [x] `check` через MCP збігається з `check --format json`
- [x] stdout сервера містить лише протокол

## Answer

`src/mcp.ts` на `@modelcontextprotocol/sdk` 1.30 + `zod` (SDK вантажиться лише для `keylang mcp`). `search`, `node` (сигнатура, ребра, потоки, докази), `code`, `flows`, `check`; `checkResults` винесено в `src/check-results.ts`, тож MCP і `check --format json` дають однакові `results` (тест порівнює). Тести `tests/mcp.test.ts` через клієнт SDK по stdio. Ціна: `npm ls --omit=dev --all` виріс до ~180 рядків (express та ін. у дереві MCP SDK), без native-коду.
