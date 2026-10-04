# 36: `keylang mcp`: інструменти `search`, `node`, `code`, `flows`, `check`, `explain`, `apply_diff`

**Етап:** M7 · **Джерело:** design §7.3 «Зовнішні агенти через MCP», §7.4

**What to build:** MCP-сервер поверх `analyze()`: граф за замовчуванням, `code` віддає фрагменти на вимогу, `check` повертає ті самі вердикти з доказами, `apply_diff` лише пропонує diff (запис — після підтвердження людиною в TUI/CLI). Пакети `@modelcontextprotocol/sdk` обґрунтовані; `npm ls --omit=dev` у ліміті.

**Blocked by:** 23

**Status:** needs-triage

- [ ] інтеграційний тест через stdio: `node application.purchase.buy` повертає сигнатуру, ребра, потоки, докази
- [ ] `apply_diff` не пише файли; повертає diff і статус «pending»
