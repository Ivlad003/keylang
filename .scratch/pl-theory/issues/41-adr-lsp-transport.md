# 41: ADR 0006: власний транспорт `keylang lsp` — записаний виняток з ADR 0002

**Джерело:** research-pl §5 Р-7; знахідка 10; рішення Q21 (spec)

**What to build:** ADR 0006 записує, що `keylang lsp` лишається на власному транспорті як виняток з ADR 0002. Нормативні місця, що досі спираються на скасований бюджет залежностей, узгоджуються з ним.

Причини в ADR. Їх перевірено на `vscode-jsonrpc` 8.2.0 з editors/vscode/node_modules (файли в `lib/common/`):
- **Контракт транспорту keylang суворіший за типову поведінку бібліотеки.** На невалідний JSON бібліотека лише викликає `onError` без відповіді (messageReader.js:162-169), а keylang відповідає -32700 з `id: null` і не розриває сесію (tests/core.test.ts:187). На кадр без Content-Length бібліотека теж лише викликає `onError` і читає далі (:139-141), а keylang завершується з кодом 2 і причиною в stderr (tests/lsp.test.ts:376). Для запиту, що вже виконується, бібліотека лише скасовує токен (connection.js:389-392), а keylang одразу відповідає -32800 без другої відповіді (tests/lsp.test.ts:394).
- **Відомі транспортні баги вже виправлено.** Їх чотири, усі закріплено e2e-тестами: review-2026-09-28-m0-m4 №2, 8, 10 і review-2026-09-28-full №11.
- **Бібліотека нічого не додає до можливостей.** `positionEncoding: "utf-16"` (src/lsp.ts:311) уже відповідає специфікації, а `lsp-features.ts` від бібліотеки не зменшиться.

Тригери перегляду:
- новий транспортний баг P1/P2;
- потреба в частині протоколу, яку дорожче писати, ніж взяти: динамічна реєстрація (зокрема `workspace/didChangeWatchedFiles`), `$/progress`, інкрементальна синхронізація, семантичні токени;
- другий транспорт.

Тригер повертає тікет 42 у needs-triage.

Шапка ADR: «Уточнює: 0002; рядок „Прецедент“ у 0001». ADR 0001 не редагується: його рядок :11 посилається на «ту саму причину», тобто на скасований бюджет, і ADR 0006 це уточнює.

Прибрати суперечності в нормативних файлах:
- design §7.4: рядок LSP у таблиці (docs/design.md:526) суперечить абзацу «Правило залежностей» (:538). Рядок таблиці має посилатися на ADR 0006 як на записаний виняток;
- обґрунтування у format.md §9 (docs/format.md:389, «потрібна підмножина протоколу мала…») замінюється посиланням на ADR 0006. Якщо 30 уже злито, розділ `keylang lsp` лежить у docs/tools.md;
- шапка src/lsp.ts:7-8 («would add a dependency for a few messages») називає причину з ADR і посилається на нього;
- AGENTS.md, «Стиль коду»: до речення про ADR 0002 додається «записаний виняток — ADR 0006 (транспорт LSP)», щоб агент не мігрував транспорт за загальним правилом.

Рядок «Markdown — власний рендерер» у design §7.4 (:522) — поза цим тікетом. Історичні документи (research-pl.md, review-*.md, .scratch/design-v0.2/issues/25-lsp-core.md) не редагуються.

Якщо 40 уже злито, перелік контрактів у ADR включає -32002 до `initialize` і код 0 на кінці stdin.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** немає: ADR, документація й коментар у src/lsp.ts. Runtime-поведінка не змінюється.

- [x] `docs/adr/0006-lsp-transport.md` оформлено як 0002/0005. Шапка: Дата, Статус «прийнято», «Уточнює: 0002; рядок „Прецедент“ у 0001», Джерело: research-pl §4.2 №10, Р-7. Контекст наводить історію транспортних багів і контракти транспорту з посиланнями на тести (tests/core.test.ts:173, tests/lsp.test.ts:363, :376, :389).
- [ ] Рішення має один варіант (власний транспорт) з наслідками й тригерами перегляду вище. Тригер прямо повертає тікет 42.
- [ ] design §7.4 внутрішньо узгоджено й посилається на ADR 0006. format.md §9 (або docs/tools.md) і шапка src/lsp.ts кажуть те саме, що ADR. AGENTS.md згадує виняток одним реченням.
- [x] `grep -n 'vscode-languageserver' docs/design.md docs/format.md AGENTS.md src/lsp.ts` (і docs/tools.md, якщо файл є): кожна згадка узгоджена з ADR 0006, відносні посилання на ADR ведуть на наявні файли. Історичні документи поза перевіркою.
- [ ] Runtime-поведінка не змінилася: `npm run typecheck` і `npm test` зелені. Правка шапки src/lsp.ts може зсунути якорі рядків карти (`fn [serveLsp](../../src/lsp.ts#L31)`), тому `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `docs/adr/0006-lsp-transport.md`, `docs/adr/0002-dependencies-by-value-ws.md`, `docs/design.md`, `docs/format.md`, `src/lsp.ts`, `AGENTS.md`

## Comments

- 2026-09-29 — ADR 0006 записано. Рядки тестів у тікеті застаріли; в ADR стоять поточні: `tests/core.test.ts:178` (невалідний JSON, `-32700`), `tests/lsp.test.ts:517` (немає `Content-Length`, код 2), `tests/lsp.test.ts:530` (`-32800`), `tests/lsp.test.ts:168` (`-32002` до `initialize`), `tests/lsp.test.ts:200` (EOF — код 0, `exit` до `initialize` — код 1). Бібліотеку звірено з `vscode-jsonrpc@8.2.0`: `messageReader.js:139-141` і `:168-169`, `connection.js:389-394`. ADR 0001 не змінювався. Рядок Markdown-рендерера в design §7.4 і абзац «Правило залежностей» лишилися. `grep vscode-languageserver` у design.md, tools.md і `src/lsp.ts` посилається на ADR 0006; у format.md і AGENTS.md згадки пакета немає (виняток в AGENTS.md названо реченням про ADR 0006). Шапка `src/lsp.ts` лишилась на двох рядках. `map --check` = 0, `check` — `0 fail`.
- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; docs/adr/0006-lsp-transport.md, посилання в docs/design.md, docs/tools.md, шапці src/lsp.ts і AGENTS.md.
