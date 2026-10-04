# 10: `keylang export c4`: PlantUML і Mermaid з карти

**Джерело:** spec §4.1 A5; research-c4-zoom-literature §4, §9 п. 14; research-c4-zoom-tools §2 (C4-PlantUML MIT, Mermaid C4 experimental)

**What to build:** `keylang export c4 [--format plantuml|mermaid] [--level container|component] [--layer <name>] [--out <file>]` — детермінований похідний артефакт зі знімка й brief-ів, без моделі. `container` (типово): система як `System_Boundary`, шари як `Container` з brief-ом шару (тікет 01) і ребра між шарами, зважені кількістю ребер модулів; `component` з `--layer` — модулі шару як `Component` з brief-ом і ребра до модулів інших шарів як зовнішніх контейнерів. `external.*` — `System_Ext`. PlantUML використовує `!include` C4-PlantUML (`C4_Container.puml` / `C4_Component.puml`); Mermaid — `C4Container` / `C4Component` з позначкою `%% experimental in Mermaid` у коментарі. Без `--out` — у stdout; `--out` пише файл через `safe-write`. Нерозв'язані ребра не малюються. Палітра TUI: «Export C4 diagram» у групі «Дані та експорт».

**Blocked by:** 01

**Type:** code

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test`

- [ ] e2e: фікстура з трьома шарами → byte-exact PlantUML; повторний запуск ідентичний
- [ ] `--level component --layer <x>` містить лише модулі шару й зовнішні контейнери; без `--layer` — код 2 з повідомленням
- [ ] Mermaid-вивід містить `C4Container` і коментар про experimental
- [ ] `--out` не перезаписує файл без змін (safe-write), stdout порожній
- [ ] `--help`, tools.md і палітра описують команду

## Comments
