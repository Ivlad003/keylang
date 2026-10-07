# 27: Міграція: таблиця відповідності ID і перевірка паритету старого й нового стеку

**Status:** ready-for-agent

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

- [ ] фікстура «старий» + «новий» репо: один флоу з паритетом ok, один без пари → fail, один без тестів → unverified
- [ ] docs: розділ «Міграція між стеками» з прикладом Magento → SFCC

**Межі:** автоматичної генерації коду тут немає — це `spec-to-code`.

## Comments
