# 29: Проєкт з нуля з діаграми: від ідеї до фічі для агентів

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 24, 25

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

- `keylang web --new <dir>` (або «Новий проєкт» у web): порожнє полотно-шаблон (presentation / application / domain / infrastructure або власні доріжки).
- Людина малює шари, модулі, процеси, події, інтеграції → «Створити специфікацію»: `keylang.json` (шари з тек-заготовок), `rules.md` (з ліній між доріжками), `features/<процес>.md` з `planned` і флоу, опис ідеї в `keylang/README.md`.
- Далі: `keylang agents` встановлює інтеграцію харнеса, `feature <slug>` веде агента; діаграма показує прогрес (planned → реалізовано, вердикти).

## Критерії готовності

- [ ] e2e: намалювати 2 шари й процес з 3 кроками → файли-пропозиції → accept → `feature` показує 3 planned
- [ ] курс `docs/course/from-scratch/`: урок «З діаграми»

**Межі:** —

## Comments
