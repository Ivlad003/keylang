# 12: `keylang export c4`: шари як межі, модулі як компоненти

**Джерело:** spec §4.1 A7, Р10, §1b; research-c4-zoom-literature §4, §9 п. 14; research-c4-zoom-tools §2 (C4-PlantUML MIT, Mermaid C4 experimental); c4model.com/abstractions (контейнер — застосунок чи сховище)

**What to build:** `keylang export c4 [--format plantuml|mermaid] [--level container|component] [--layer <name>] [--out <file>]` — детерміноване представлення знімка й brief-ів, без моделі (Р10).

- **`component`** (типово): `Container_Boundary` на кожен шар із brief-ом шару; `Component` на кожен модуль верхнього рівня шару з brief-ом; `Rel` між модулями різних шарів, зведені з кількістю й видами ребер; пакети `external.*` — `System_Ext`. `--layer <x>`: лише компоненти шару `x`, а модулі інших шарів, яких вони торкаються, — `Component_Ext`.
- **`container`:** `System_Boundary` репозиторію з одним `Container` (назва з маніфесту, brief репозиторію з тікета 01, коли він є) і `System_Ext` на кожен зовнішній пакет, з яким є ребра. Шар не є контейнером: у C4 контейнер — застосунок чи сховище, що запускається окремо.
- **Формати:** PlantUML через `!include` C4-PlantUML (`C4_Container.puml`, `C4_Component.puml`); Mermaid — `C4Container`/`C4Component` з коментарем, що Mermaid C4 експериментальний.
- **Нерозв'язані ребра** не малюються; їхня кількість — у коментарі.
- **Запис:** без `--out` — stdout. `--out` пише файл, що починається маркером `' keylang:generated` (PlantUML) чи `%% keylang:generated` (Mermaid), і перезаписує лише файл із таким маркером. `isGeneratedText` (`src/safe-write.ts`) зараз розпізнає тільки `<!--` і `//`, тож його треба розширити. Файл без маркера — код 2 з причиною. safe-write записує атомарно й не пропускає запис без змін.
- **Палітра:** дія «Export C4 diagram» у групі «Дані та експорт».

**Blocked by:** None (can start immediately)

**Type:** code

**Model:** claude:claude-opus-5-5

**Status:** ready-for-agent

**Verify:** `node --test tests/export-c4.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] тести тікета — у новому файлі `tests/export-c4.test.ts`: Verify запускає його окремо, тож без нього тікет не закриється
- [ ] e2e: фікстура з трьома шарами → byte-exact PlantUML рівня `component`; повторний запуск ідентичний
- [ ] `--level container` → один контейнер і `System_Ext` зовнішніх пакетів; шари не стають контейнерами
- [ ] `--layer x` → лише компоненти `x` і `Component_Ext` інших шарів; невідомий шар → код 2 з переліком шарів
- [ ] Mermaid містить `C4Component` і коментар про експериментальність
- [ ] `--out` у файл із маркером перезаписує його; у файл без маркера → код 2, файл без змін; stdout порожній
- [ ] `--help`, tools.md і палітра описують команду

## Comments

- 2026-10-04 (рев'ю): колишній тікет 10. Шари — межі, а не контейнери (Р10); пункт про пропуск запису без змін прибрано, бо safe-write так не працює.
