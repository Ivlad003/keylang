# 13: Звіт покриття: сліпі зони, сироти, «логіка в даних»

**Status:** resolved

**Type:** code

**Blocked by:** 09, 11

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Людина має знати, де keylang не бачить, а не отримати хибне враження повноти.

- `keylang coverage [--json]`: (1) частка fn, досяжних хоч з однієї точки входу; (2) fn-сироти (недосяжні — мертвий код або невідомий вхід); (3) top-модулі за дірками з причинами (`call through an interface without binding`, `dynamic-event`, `closure in a value`…); (4) точки входу без флоу в специфікаціях; (5) сигнали «логіки в даних»: виклики репозиторіїв налаштувань (`ScopeConfigInterface::getValue`, `config()`), правила цін/знижок як класи-моделі, EAV — окремим розділом «перевірити вручну».
- TUI/web: панель «Сліпі зони» з переходом до коду.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] фікстура з сиротою, діркою й точкою входу без флоу → кожна в своєму розділі (TS + Python + PHP в одному репо, `tests/coverage-report.test.ts`; плюс «логіка в даних»: Magento `ScopeConfigInterface::getValue`, Django `settings`, `os.getenv`, `process.env`)
- [ ] на бенчі Magento звіт генерується < 10 с — не досягнуто в цій зміні: на п'яти модулях (1645 файлів PHP) сам аналіз (`keylang entries`) іде ≈ 10 с, `coverage` — ≈ 14 с теплим кешем фактів, під load average ≈ 34 від паралельних змін; звіт поверх аналізу додає ≈ 3 с (факти з кешу, зіставлення з `data-logic.json`). Переміряти разом із тікетом 10 (точки входу Magento) на спокійній машині, див. коментар
- [x] docs/cli.md (і `--help`, `mcp-lsp.md`, `tui.md`, `semantics.md`, `CONTEXT.md`, `llm.txt`)

**Межі:** без оцінок «якості» коду.

## Comments

### Реалізація (2026-10-08)

- `keylang coverage [--json]` — представлення над свіжим знімком (ADR 0014), `check` його не читає; код 0 і з дірками/сиротами, 2 — зламаний `keylang.json` або без мов; пише лише кеш фактів. Розділи в сталому порядку: `reach` (fn поза тестами, досяжні з точок входу по розв'язаних `call`-ребрах, разом із `via`), `orphans` (без fn точок входу й файлів тестів; кількість недосяжних викликачів і `escapes`), `holes` (дірки знімка за модулем-файлом, причини з `` `X` `` замість імен, лічильники за видом і причиною; текст — топ-10), `unflowed` (точки входу, чий ID не є тригером жодного написаного потоку, зі знайденим потоком `flows discover` і чи він уже в `flows-discovered/`), `dataLogic` («перевірити вручну»).
- «Логіка в даних» — дані, не код: `resources/data-logic.json` (Magento scope config / deployment config / SalesRule й CatalogRule / EAV, Laravel `config()`/`env()`, параметри Symfony, `getenv`/`$_ENV`, Django `settings`, `os.getenv`/`os.environ`, pydantic-settings тощо, `process.env`/`import.meta.env`, `@nestjs/config`, Rust `std::env::var`/`env!`, crates `config`/`figment`). Матчер: `callees` (regex над викликом), `imports` (+`methods`), `receivers`, `text`, `languages`.
- Знімок тримає ребра лише до коду репозиторію, тож виклики в пакети й вбудовані функції беруться з фактів екстракторів (`src/call-sites.ts`: кеш фактів за хешем, інакше файл розбирається знову; екстрактори не змінювались). Одне місце, що збіглося з кількома сигналами, — під першим.
- Операція `coverage` (`src/operations/coverage.ts`, ядро `src/coverage-report.ts`), MCP `coverage_report` (лише читання), дія TUI «Blind spots» зі звітом у F6 (`src/tui/reports/coverage.ts`), Enter відкриває місце в коді.
- Web-панель «Сліпі зони» з переходом до коду — не в цій зміні (веб-гілка 21/22 ще без SPA, тікет 33); операція й JSON готові для неї.
- Бенч Magento (сьогодні, 5 модулів, `mage`-копія клону): 7099 fn, 0 точок входу (тікет 10), 22 618 дірок у 1245 модулях; топ — `sales.Model.AdminOrder.Create` (517). Час: див. критерій вище.

### Web-панель «Сліпі зони» (2026-10-08)

- Зроблено разом із тікетом 22: режим «Сліпі зони» сторінки `/diagrams` (`web/src/blind.ts`) над `GET /api/coverage`, який віддає той самий JSON, що `keylang coverage --json` (операція `coverage` над аналізатором сервера, той самий Bearer-токен). П'ять розділів — досяжність, сироти, дірки (причини й модулі), точки входу без флоу (зі знайденим флоу — клік відкриває його діаграму), «логіка в даних — перевірити вручну»; кожне місце — посилання `vscode://`, fn — кнопка «дослідити» в дослідник точок входу. Тести: `tests/web.test.ts` («/api/coverage answers the payload of `keylang coverage --json`»), `tests/web-e2e/explorer.test.ts` (панель і перехід у дослідник). Документація — `docs/tui.md`, «Дослідник точок входу й «Сліпі зони»».

