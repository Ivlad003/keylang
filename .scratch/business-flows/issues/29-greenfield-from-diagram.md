# 29: Проєкт з нуля з діаграми: від ідеї до фічі для агентів

**Status:** resolved

**Type:** code

**Blocked by:** 24, 25

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

- `keylang web --new <dir>` (або «Новий проєкт» у web): порожнє полотно-шаблон (presentation / application / domain / infrastructure або власні доріжки).
- Людина малює шари, модулі, процеси, події, інтеграції → «Створити специфікацію»: `keylang.json` (шари з тек-заготовок), `rules.md` (з ліній між доріжками), `features/<процес>.md` з `planned` і флоу, опис ідеї в `keylang/README.md`.
- Далі: `keylang agents` встановлює інтеграцію харнеса, `feature <slug>` веде агента; діаграма показує прогрес (planned → реалізовано, вердикти).

## Критерії готовності

- [x] e2e: намалювати 2 шари й процес з 3 кроками → файли-пропозиції → accept → `feature` показує 3 planned
- [x] курс `docs/course/from-scratch/`: урок «З діаграми»

**Межі:** —

## Comments

**2026-10-08 — зроблено.** `keylang web --new <тека>` (`src/cli.ts`): створює теку, відмовляє (2), коли в ній є `keylang.json`, друкує адресу `/diagrams#t=…&new=1`. Клієнт `web/src/greenfield.ts` (+ `greenfield.css`, один рядок у `diagrams.ts`): кнопка «Новий проєкт», коли в корені немає `keylang.json` (`GET /api/greenfield`), редактор на порожньому полотні в «чернетці», шаблони доріжок «4 шари» / «hexagonal» / «порожньо», мови, ідея, «Створити специфікацію» → `POST /api/greenfield` (ті самі захисти, що в `diagram-proposal`), під панеллю — записані файли, planned кожної фічі й наступні команди. Сервер: `src/operations/greenfield.ts` (`runGreenfield`) і чисті тексти `src/greenfield.ts` (`greenfieldPlan`, через `diagramChanges` тікета 24): `keylang.json` (шар на доріжку, `src/<шар>/**`, мови), `rules.md` (`layers` у порядку доріжок, `allow`/`deny`, `dependency` як `allow`), `features/<процес>.md` на кожен процес з `planned` (зовнішня система — planned fn своєї доріжки), `features/structure.md` для модулів/типів поза процесами, `README.md` з ідеєю цитатою (каталог специфікацій читається `check`: заголовок чи список там дали б K006/K005), `diagrams/flow--<процес>.layout.json` і `layers.layout.json`, `src/<шар>/.gitkeep`. Лише в проєкт без `keylang.json`, лише файли, яких немає (lstat: посилання, навіть бите, — ціль на місці), усе через `safeWriteAll` з `expect: null` після перевірки всіх цілей → інакше 409 і нічого не записано.

**2026-10-08 — поправка поруч.** `flowFromDrawio` (`src/drawio.ts`): новий крок після кроку, під яким є лише рядки `test`, ставав вкладеним у нього; тепер — наступний сусід (рядок `test` — не вкладений крок). Це торкалося й «Запропонувати зміни» тікета 24 (крок з тестами в середині ланцюжка).

**2026-10-08 — про «3 planned».** Процес — тригер і кроки; тригер — теж fn, якої ще немає, тож `feature placeOrder` для тригера й 3 кроків дає 4 прогалини `planned` (3 кроки + fn тригера). Тести перевіряють, що три кроки — planned, і окремо — що planned і fn тригера.

Тести: `tests/greenfield.test.ts` (5: файли й тексти, `check` → 0 з unverified, `feature` → planned; 409 на `keylang.json`, наявну ціль, посилання-ціль і посилання поза проєкт; 400 на недомальоване; API з захистами; `web --new`), `tests/web-e2e/greenfield.test.ts` (1: шаблон, 2 доріжки й процес з 3 кроків з палітри, файли, `feature`, флоу в списку діаграм). Документація: `docs/cli.md#web-new`, `docs/tui.md` («Новий проєкт», `GET/POST /api/greenfield`), курс `docs/course/from-scratch/05-from-diagram.md` (+ uk), `llm.txt`.
