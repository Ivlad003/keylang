# 26: `keylang flow export|import`: переносний пакет бізнес-флоу

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 12

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

CLI-основа для 25 і 27.

- `flow export <name>… [--with-callees N] [--out file.md]`: самодостатній Markdown — флоу, для кожного ID вид/сигнатура/brief/файл:рядок у джерелі, бізнес-опис (12), тести, події й інтеграції флоу, коментар походження (`repo`, `commit`, `snapshotId`).
- `flow import <file> [--into features/<slug>.md] [--layer-map old=new,…] [--mode algo|llm]`: у цільовому репо — пропозиція фічі: кроки на `planned`-вузлах у шарах нового проєкту (відповідність шарів — прапорець або модель з валідацією), тести як `test` під кроками, вихідні ID — у таблицю відповідності (27).
- Потім звичайний цикл: `spec-to-code` агентом → `feature <slug>` показує готовність.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [ ] round-trip: export з фікстури A → import у фікстуру B → `feature` бачить усі planned
- [ ] пакет читається людиною й `parse` без помилок
- [ ] docs/cli.md, курс from-scratch/existing

**Межі:** —

## Comments
