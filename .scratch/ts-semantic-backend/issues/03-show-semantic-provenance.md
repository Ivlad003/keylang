# 03: Походження `semantic` у `check`, explain, MCP, карті й TUI

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 02 <!-- 02 — ребра semantic у знімку -->

**Verify:** `node --test tests/ts-semantic-provenance.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

**Джерело:** spec §4.3, П2; [ADR 0020](../../../docs/adr/0020-typescript-semantic-backend.md) п. 3; ADR 0014 (представлення не є фактом)

**What to build:** Людина й агент бачать, що доказ дав checker TypeScript, а не синтаксичний прохід. Формат карти при цьому не змінюється.

- **`check`.** Людський вивід називає semantic-доказ у повідомленні кроку й `deny`, наприклад `static ok infra.db.OrderRepo.save: called from app.orders.place (semantic: typescript 5.9.3)`; точний текст задає tools.md. JSON, SARIF і GitHub-формат мають `provenance: "semantic"`.
- **`--explain-edge`** друкує `semantic` і версію `typescript`.
- **MCP `node`** віддає `provenance` для кожного ребра (`src/mcp.ts`).
- **Підсумок `keylang map`** — `calls N resolved (S semantic), …`. Рядки `- calls` карти без змін (П2).
- **TUI** (розгорнутий рядок жолоба, hover) і **LSP hover** показують походження доказу кроку.

- [ ] тести тікета — у новому файлі `tests/ts-semantic-provenance.test.ts`: Verify запускає його окремо
- [ ] CLI на фікстурі з ADR 0020: людський рядок кроку називає `semantic` і версію, а `--format json`, `sarif` і `github` мають `provenance: "semantic"`. Без пакета вивід дослівно той, що до тікета 02
- [ ] `fail` правила `deny` через semantic-ребро називає походження в людському й JSON-виводі
- [ ] `--explain-edge app.orders.place infra.db.OrderRepo.save` друкує ребро з `semantic`
- [ ] MCP-клієнт (як у `tests/mcp.test.ts`): `node app.orders.place` повертає ребро з `provenance: "semantic"`, а синтаксичні ребра мають `provenance: "syntactic"`
- [ ] `keylang map` друкує кількість semantic-ребер у підсумку. Байти `keylang/map/*.md` фікстури з пакетом і без нього відрізняються лише рядками `- calls` з новими цілями
- [ ] TUI (`session`): розгорнутий рядок під курсором на кроці показує `semantic`. LSP hover на кроці — теж
- [ ] tools.md: формати `check`, `--explain-edge`, MCP `node`, підсумок `map`, жолоб і hover

## Comments
