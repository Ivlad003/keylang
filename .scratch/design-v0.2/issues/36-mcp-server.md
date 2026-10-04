# 36: `keylang mcp`: інструменти `search`, `node`, `code`, `flows`, `check`, `explain`, `apply_diff`

**Етап:** M7 · **Джерело:** design §7.3 «Зовнішні агенти через MCP», §7.4

**What to build:** MCP-сервер поверх `analyze()`: граф за замовчуванням, `code` віддає фрагменти на вимогу, `check` повертає ті самі вердикти з доказами, `apply_diff` лише пропонує diff (запис — після підтвердження людиною в TUI/CLI). Пакети `@modelcontextprotocol/sdk` обґрунтовані; `npm ls --omit=dev` у ліміті.

**Blocked by:** 23

**Status:** resolved

- [x] інтеграційний тест через stdio: `node application.purchase.buy` повертає сигнатуру, ребра, потоки, докази
- [x] `apply_diff` не пише файли; повертає diff і статус «pending»

## Comments

- 2026-10-04 — тріаж (рішення 3А з HANDOFF-2026-10-02): усі критерії виконано тікетами m5-m7/17–18: stdio-інтеграційний тест `tests/mcp.test.ts` (signature, ребра, flows, докази; фікстура `app.checkout.checkout` замість `application.purchase.buy`); «mcp: apply_diff only writes a pending proposal…». Ліміт залежностей скасовано (ADR 0002).
