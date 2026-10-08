# 24: Редактор → специфікація: зміни діаграми як пропозиції, файл розкладки

**Status:** resolved

**Type:** code

**Blocked by:** 23

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

- **Розкладка:** `keylang/diagrams/<view>.layout.json` (комітиться, щоб команда бачила ту саму діаграму): позиції, розміри, згини ліній, кольори, нотатки; ключ — ID/шлях у специфікації, не порядковий номер; детермінований JSON, стабільний diff.
- **Зміст:** кнопка «Запропонувати зміни» обчислює diff діаграми проти поточної моделі й пише пропозиції: нові/змінені `# flow`, `planned`-вузли, правила (`allow`/`deny`/`layers` з доріжок і стилів ліній), шари в `keylang.json` (через наявний механізм `draft map`). Злиття — MERGE/`proposals accept`; відхилені шматки лишаються на діаграмі позначеними «не прийнято».
- Конфлікт: якщо специфікація змінилась після відкриття діаграми — повідомлення й перерахунок, як у пропозицій моделі.
- Проза під вузлами зберігається байт-у-байт.

## Критерії готовності

- [x] e2e: додати крок на діаграмі → пропозиція з одним шматком → accept → `check` бачить крок
- [x] відхилений шматок не губить розкладку
- [x] docs

**Межі:** —

## Comments

### Рішення автора (2026-10-07)

- **Розкладка — `keylang/diagrams/<view>.layout.json` у git**, детермінований JSON зі стабільним diff.

### Нотатки виконання (2026-10-08)

- **Розкладка.** `src/diagram-layout.ts`: `keylang/diagrams/<view>.layout.json` (`flow:checkout` → `flow--checkout.layout.json`), ключі — те, що фігура каже в специфікації (`step:<ID>` без `planned:`, `trigger:<fn>`, `when:<умова>`, `emits:<подія>`, `timer:…`, `parallel:` — за кроками гілок, `hole:` — за кроком після неї, `lane:<шар>`, `edge:<кінець>-><кінець>`, `note:<ключ>`; двійники — `#2`). Детермінований JSON: `format`, `view`, `shapes`, `edges`, ключі відсортовані, числа до сотих. `GET`/`PUT /api/layout?view=…` (той самий токен; PUT — ті самі JSON/origin-ворота, що `flow-proposal`, тепер спільний `jsonBody`), запис через `safeWrite` з `under: <dir>/diagrams` (посилання назовні й маркер generated — 409). `diagramOf({…, saved})` → `layout(diagram, savedPositions(…))`, тож і сторінка перегляду бачить розкладку. `readingAid` має `diagrams/` (check і `map --check` не читають), `GENERATED_SPEC_DIRS` відмовляє пропозиції туди, `map` теку не пише. Клієнт: `FileLayoutStore` через `useLayoutStore()`; `layout()` редактора несе ID/вид/мітку намальованих фігур, текст приміток, колір (нове поле «колір» на панелі, і в «з коду»), кінці ліній.
- **Пропозиції.** `src/diagram-proposal.ts` (чиста) + `src/operations/diagram-propose.ts` (`runDiagramPropose`, спільна для `POST /api/diagram-proposal` і `keylang diagram propose <view> --from <model.json> [--print]`). Флоу редагується через наявний `flowFromDrawio` з `import drawio` (рядки фігур з коду лишаються — проза байт-у-байт); розширено: нові `parallel` (кроки вкладені, після злиття — сусід групи), вид тригера (`keylang_trigger`, лише коли малюнок каже інше, ніж специфікація чи точка входу), `test`-рядки нової фігури, код-`parallel` як рядок. Новий тригер — новий флоу `<dir>/flows/<name>.md`; `continues` → `- continues <флоу>` у флоу цілі. `planned fn|module|type <id> [signature]` — наприкінці списку флоу (тож крок у кінці + оголошення = один шматок). `allow`/`deny` між доріжками → `withRules` у `rules.md`.
- **Припущення: `layers` для нової доріжки** — не переписую наявний рядок `layers` (це дало б хибний K108 «layers … was removed»), а додаю рядок `- layers <вище> < <нова> < <наступний>`, що погоджується з порядком (граматика дозволяє кілька узгоджених рядків). Позиція — найближча доріжка над новою, що є в порядку.
- **Припущення: keylang.json.** Наявний шлях `draft map` лише друкує, а пропозиція не може мати ціллю keylang.json (`proposalProblem`: лише `.md` у `<dir>/`). Тому нові шари — `withLayers` (glob як у сусідів, `src/<шар>/**`) у відповіді як `config` з diff і приміткою «printed only», нічого не пишеться.
- **K108:** `specWeakenings` над специфікаціями на диску проти запропонованих текстів; у відповіді `weakenings` (новий `allow`, прибраний крок).
- **Конфлікт:** `/api/diagram` віддає `specHash` (SHA-256 від шляхів і хешів рукописних специфікацій і keylang.json); інший при пропозиції — 409 `conflict`, сторінка показує причину й малює вид наново (`EditorHost.reload`).
- **«не прийнято»:** після запису операція позначає намальовані фігури в файлі розкладки (`proposed: <ціль>`); `GET /api/layout` повертає ті, яких діаграма коду не має, зі `status` `pending` (пропозиція чекає) чи `rejected`; редактор малює їх пунктиром «⧗ очікує злиття» / «✗ не прийнято» на тому самому місці, поза `currentModel()`. Після пропозиції чернетку вкладки забуто.
- `diffLines`/`Hunk` перенесено з `src/tui/merge.ts` у `src/line-diff.ts` (шар `base`), щоб операція рахувала шматки як MERGE; `tui/merge.ts` їх реекспортує.
- **Не зроблено (поза обсягом):** прибрані лінії між фігурами з коду, порядок наявних кроків, `calls` і видалення правил малюнком не пропонуються — про них `notes` у відповіді. Ребра відхилених фігур у файлі розкладки не зберігаються (лише фігури).
- **Перевірки:** `node --test tests/web.test.ts tests/diagram.test.ts tests/diagram-propose.test.ts tests/bpmn-export.test.ts tests/tui-session.test.ts tests/cli-help.test.ts`, `npm run test:web` (10/10, Chrome), `npm run typecheck`, `node bin/keylang.js map --check`, `node bin/keylang.js check`.
