# 09: Пошук: ядро на Orama і `keylang search`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [spec](../spec.md)

**What to build:** `src/search.ts`: `SearchDoc {id, kind, title, text, file?, line?, layer?}`, `buildIndex(docs)`, `search(index, query, {kinds, limit})`; токенайзер ділить dotted ID і camelCase/kebab; boost title > id > text; точний збіг ID — перший (ADR 0004). Джерела цього тікета: вузли знімка, `planned`, пояснення (`explanationOf`, `loadBriefs`). CLI `keylang search <q> [--kind k,…] [--limit n] [--json] [--stats]`: 0 — є збіги, 1 — нема, 2 — помилка; `--json` — лише JSON у stdout. `--stats` — M4. ADR `docs/adr/00NN-search-orama.md`, `docs/cli.md`, `keylang.json` шар для `search.ts`.

- [ ] `place order` знаходить `domain.order.placeOrder`; `plcae` (одруківка) теж
- [ ] CLI-тест кодів виходу й чистого stdout

## Comments
