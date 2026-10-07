# 09: Знімок: точки входу як факти й команда `keylang entries`

**Status:** ready-for-agent

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

- [ ] фікстури: TS (bin, Express-літерал), Python main; Magento-частина — у 10-magento-entries
- [ ] `entries --json` стабільний (ідемпотентність, сортування)
- [ ] `docs/cli.md`, `docs/snapshot.md`, `docs/mcp-lsp.md`, `--help`

**Межі:** Magento-маршрути — 10.

## Comments
