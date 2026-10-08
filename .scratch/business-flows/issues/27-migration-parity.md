# 27: Міграція: таблиця відповідності ID і перевірка паритету старого й нового стеку

**Status:** resolved

**Type:** code

**Blocked by:** 26

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Кейс Magento → Salesforce Commerce.

- `keylang/migration.md` (рукописний, з допомогою `flow import`): `# migration <name>` → рядки `- map magento.quote.QuoteManagement.placeOrder → storefront.checkout.placeOrder` або `→ planned …`, `- dropped <id> <причина>`.
- `keylang migration status [--from <path-to-old-snapshot.json>]`: для кожного флоу старого стеку — є пара в новому? кроки змаплені? тести з тими самими назвами є й проходять в обох звітах (`check.tests` двох репо)? → вердикт паритету `ok`/`fail`/`unverified` за загальними правилами агрегації.
- Звіт: що ще не перенесено (флоу, події, cron, інтеграції з 14), що перенесено без тестів.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] фікстура «старий» + «новий» репо: один флоу з паритетом ok, один без пари → fail, один без тестів → unverified
- [x] docs: розділ «Міграція між стеками» з прикладом Magento → SFCC

**Межі:** автоматичної генерації коду тут немає — це `spec-to-code`.

## Comments

- 2026-10-08 — зроблено. `check` судить рядки `# migration`: новий бік `map … → [planned] <нове>` — посилання цього репозиторію (K001, якщо немає ні коду, ні `planned`); старий бік (`map`, `dropped`) — вердикт критерію `migration` проти старого знімка `migration.from` у `keylang.json` (шлях до `index.json` — експорт `keylang map --export-index <файл>` чи звичайний `.keylang/index.json` — або до checkout старого репозиторію, який аналізується лише на читання): `ok` / K001 «in the old stack» / `unverified` (непрозорий модуль, немає старого знімка, не читається); `dropped` без причини — K005 (уже з парсера). `keylang migration status [--from …] [--json]` (`src/migration.ts`, `src/migration-stack.ts`, `src/operations/migration.ts`): для кожного флоу старого стеку (написані + знайдені) — пара (за `keylang:import`, змапленим тригером або найбільшим перетином змаплених кроків), кроки (є / непрозорий / немає, `planned` — «not implemented yet»), тести з тією ж назвою в обох звітах `check.tests` → `ok`/`fail`/`unverified`; списки «not migrated yet» (флоу, точки входу cron/consumer/observer/webhook, інтеграції й вебхуки), «migrated without shared tests», `dropped`, примітки; код 1 при `fail`. MCP `migration_status {from?}`, дія TUI «Migration status» зі звітом F6. Панель «Міграція» в `/diagrams` не робив (необов'язкова). Мови: реалізація мовно-незалежна; `tests/migration.test.ts` — старий репозиторій на PHP (Magento-подібний), новий на TypeScript. Docs: cli.md «Міграція між стеками» (Magento → SFCC), grammar.md «Рядки migration», semantics.md «Міграція», mcp-lsp.md, llm.txt.
