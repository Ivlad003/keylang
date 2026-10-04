# 12: `keylang explain <id>`: офлайн algo-зведення вузла

**Етап:** M7 · **Джерело:** design §5.4; батьківський 35

**What to build:** `keylang explain <id>` для вузла (шар, модуль, fn, потік, правило) друкує детерміноване зведення без мережі: вид, сигнатура, файл:рядок, залежності, хто використовує, потоки й правила, де згаданий, `planned`-статус. `explain <code>` для діагностик працює як раніше. Невідомий ID → код 2 з «did you mean».

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `explain application.purchase.buy` друкує сигнатуру, deps, callers, потоки
- [x] `explain K001` без змін
- [x] невідомий ID → код 2 і найближчі ID

## Answer

`src/explain-node.ts` (шар features): `summarizeNode(analysis, id)` — чисте зведення (вид, сигнатура, місце, calls/callers/deps/dependents, потоки, правила, діри, fingerprint) і `formatSummary`. CLI: `explain <arg>` — `K\d+` → код, інакше ID; невідомий ID → код 2 з «did you mean». Тести `tests/explain.test.ts`. Спостереження: `closure.complete` майже завжди `false`, бо виклики методів значень (`sql.split()`) — діри; це чесно для стейлнесу, але може бути шумно в UI.
