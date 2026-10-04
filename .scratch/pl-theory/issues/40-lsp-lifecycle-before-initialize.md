# 40: LSP: запит до `initialize` дає -32002; кінець stdin описано й закріплено

**Джерело:** research-pl §5 Р-7; знахідка 10. Розбіжність із протоколом LSP, знайдена під час перевірки кластера

**What to build:** Клієнт, що надіслав запит раніше за `initialize`, отримує помилку `-32002` (ServerNotInitialized), як вимагає LSP. Зараз `request` (src/lsp.ts:252) приймає будь-який метод без перевірки ініціалізації, а корінь до `initialize` — `process.cwd()` (src/lsp.ts:80). У пробі `textDocument/documentSymbol` до `initialize` повернув дерево символів.

Поведінка до `initialize` після зміни:
- будь-який запит, зокрема `shutdown`, дає `-32002`;
- сповіщення, крім `exit`, сервер відкидає, тож `didOpen` до ініціалізації не потрапляє в overlay;
- `exit` завершує сервер з кодом 1, як і зараз `exit` без `shutdown` (src/lsp.ts:174-175);
- невалідний JSON і не-об'єкт і далі дають -32700 / -32600 з `id: null`. У них немає методу, тож це помилки кадру, а не запити.

Кінець stdin без `exit` дає код 0 і після `shutdown`, і без нього (src/lsp.ts:74-75). Так і лишається: код 1 належить явному `exit` без `shutdown`, а кінець потоку не є повідомленням протоколу. Цю поведінку описано в пункті «Життєвий цикл» (format.md:396; якщо 30 уже злито — у docs/tools.md) і закріплено тестом.

Наявний тест tests/core.test.ts:173 («a malformed message is an error reply, not the end of the server») не надсилає `initialize`. Після зміни його `shutdown` отримав би -32002, запит після нього — теж -32002 замість -32600, а `exit` дав би код 1 замість 0. Тест отримує `initialize` першим повідомленням. Решта його очікувань не змінюється, і він і далі перевіряє `didOpen` з не-локальним URI (review-2026-09-28-m0-m4 №2).

ADR 0006 (41) лишає транспорт власним, тож життєвий цикл за протоколом — відповідальність keylang. Тести цього тікета фіксують поведінку, яку мала б зберегти й можлива міграція (42).

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** семантика `keylang lsp`. Запит до `initialize` отримує -32002, сповіщення до `initialize`, крім `exit`, ігноруються. Несумісно лише для клієнтів, що порушують протокол і надсилають запити до `initialize`. Коди виходу не змінюються, кінець stdin лише задокументовано.

- [x] tests/lsp.test.ts: `textDocument/documentSymbol` до `initialize` дає `error.code === -32002`, а той самий запит після `initialize` повертає дерево символів. `shutdown` до `initialize` теж дає -32002.
- [ ] `didOpen` до `initialize` ігнорується: після `initialize` pull-діагностики (`textDocument/diagnostic`) файла відповідають вмісту на диску, а не тексту з `didOpen`.
- [ ] `exit` до `initialize` дає код 1. Кінець stdin після `shutdown` дає 0, без `shutdown` — теж 0. Обидва випадки закріплено тестом і описано в «Життєвому циклі».
- [ ] tests/core.test.ts:173 має `initialize` першим повідомленням, решта його очікувань (-32700, -32600 «a message must be a JSON object», -32600 на запит після `shutdown`, код 0) без змін. Інші LSP-тести (tests/lsp.test.ts:363, :376, :389 тощо) проходять без зміни очікувань.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/lsp.ts`, `tests/lsp.test.ts`, `tests/core.test.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; src/lsp.ts `notInitialized: -32002`, tests/lsp.test.ts «a request before initialize is -32002…», docs/tools.md «Життєвий цикл» (кінець stdin, `exit` до initialize).
