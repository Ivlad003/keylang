# 09: Знімок: точки входу як факти й команда `keylang entries`

**Status:** resolved

**Type:** code

**Blocked by:** 01

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Щоб «знайти всі бізнес-флоу», треба знати, звідки вони починаються.

- `AnalysisSnapshot.entries: { kind: 'route'|'rest'|'graphql'|'cron'|'consumer'|'cli'|'observer'|'webhook'|'controller'|'main', id: <fn id>, label: string, framework: string, file, line, source: <конфіг або код> }`, детермінований порядок, у `.keylang/index.json`.
- Без фреймворку — мовні евристики, лише записані в коді: `main`/`if __name__ == "__main__"`, `bin` з `package.json`, експортовані обробники в `app/**/route.ts` (Next), `app.get('/x', h)` з літеральним шляхом (Express) — кожна як окремий маленький модуль з тестом.
- `keylang entries [--kind k] [--json]`: таблиця вид · мітка · ID · файл:рядок; код 0; без точок входу — порожньо й примітка.
- MCP-інструмент `list_entries`; TUI: дія каталогу «Entry points».


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] фікстури: TS (bin, Express-літерал), Python main; Magento-частина — у 10-magento-entries
- [x] `entries --json` стабільний (ідемпотентність, сортування)
- [x] `docs/cli.md`, `docs/snapshot.md`, `docs/mcp-lsp.md`, `--help`

**Межі:** Magento-маршрути — 10.

## Comments

- 2026-10-07 — зроблено. `AnalysisSnapshot.entries: EntryPoint[]` (`kind`, `id`, `label`, `framework`, `file`, `line`, `source`), порядок вид → мітка → ID, у `.keylang/index.json`; схема знімка 8, `EXTRACTOR_VERSION` m1.14 (новий вид факту `FileFacts.entries`), маніфести `package.json`/`pyproject.toml`/`Cargo.toml` входять до `snapshotId`. Колектори — `src/entries.ts`, кожен чиста функція фактів, графа й тексту маніфесту: `bin` package.json і `[project.scripts]` → `cli`; `fn main` bin-крейта, `if __name__ == "__main__"` (TS/Python-екстрактори записують лише `EntryFact`, додатково до наявних фактів), PHP-скрипт `bin/*.php` / `public/index.php` → `main`; Next `app/**/route.ts` і `app.get('/x', h)` з літеральним шляхом і обробником-ім'ям → `route`. Обчислений шлях, inline-обробник, нерезолвлене ім'я і `execute()` класу — не точки входу. Операція `entries` (`src/operations/entries.ts`) спільна для `keylang entries [--kind k] [--json]`, MCP `list_entries {kind?}` і дії палітри «Entry points» (звіт F6 з переходом у код). Тести: `tests/entries.test.ts` (TS bin + Express + Next; Python main + scripts + Rust main + PHP скрипт в одному репо; порожній репо; стабільний `--json`; чисті колектори; TUI), `tests/mcp.test.ts`. Документація: cli.md (таблиця, розділ entries), snapshot.md §11 (`entries`, що є і що не є точкою входу), mcp-lsp.md, tui.md, `--help`, llm.txt.
