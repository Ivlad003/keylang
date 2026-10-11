# 12: Пошук: MCP, LSP, TUI, web — одне ядро

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 09, 10

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [spec](../spec.md)

**What to build:** MCP `search` отримує `kinds`; `/api/search` (`src/tui/read-api.ts`) переходить на `search` (дубль прибрати); TUI `s` показує мітку виду й відкриває відповідний екран; web-сайдбар — загальний пошук. `searchNodes` лишає контракт (LSP workspaceSymbols, автокомпліт) — регресійний тест на ті самі топ-результати.

- [ ] `/api/search` і MCP повертають flows/briefs
- [ ] TUI-тест: пошук кроку відкриває flow

## Comments
