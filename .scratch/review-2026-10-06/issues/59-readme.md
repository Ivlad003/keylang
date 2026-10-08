# 59: Шар `README` затирається стартовою сторінкою карти з поясненнями

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `emit`, верифікація: confirmed.

**Місце:** `src/emit.ts:56` (рецензент указав `src/emit.ts:56`)

## Що не так

`renderExplainedMap` спершу кладе файли шарів як `<layer>.md`, а потім безумовно робить `out.set("README.md", …)`. Для шару з іменем `README`, яке конфіг приймає, файл шару в `map-explained/` пропадає: його вузли, якорі й пояснення зникають. Лінки `calls` і залежностей з інших шарів (`README.md#README.r`) ведуть на стартову сторінку без таких якорів. На регістронезалежній ФС (macOS, Windows) те саме буває з шаром `readme`, і там `map --check` ніколи не стає чистим.

## Сценарій збою

`keylang.json`: `"layers": {"app": ["src/app/**"], "README": ["src/docs/**"]}, "explain": {"map": true}`. Після `keylang map` у `keylang/map-explained/` лежать лише `app.md` і `README.md`, а `README.md` — стартова сторінка («## Repository …»). Дерево шару README з поясненням `Reads docs.` втрачено, а `app.md` містить битий лінк `[README.r](README.md#README.r)`.

## Як відтворити

scratchpad/review/emit/readme: `keylang map` → `keylang/map-explained/README.md: written`, `app.md: written` (окремого файла шару немає); `head keylang/map-explained/README.md` → `## Repository`; `grep README keylang/map-explained/app.md` → `- r [README.r](README.md#README.r)`, `- calls [README.r.r](README.md#README.r.r)`.

Доказ верифікатора:

> I reproduced this at HEAD in a scratch fixture: scratchpad/verify/emit-4-0/
> 
> Fixture:
> - keylang.json: {"layers":{"app":["src/app/**"],"README":["src/docs/**"]},"explain":{"map":true}}
> - src/docs/r.ts has `/** Reads docs. */ export function r()`.
> - src/app/a.ts imports and calls r.
> - HOME and the XDG dirs point into scratch.
> 
> `node /home/kosmodev/pet_project/keylang/bin/keylang.js map` exits 0 and writes four files: keylang/map/README.md, keylang/map/app.md, keylang/map-explained/README.md and keylang/map-explained/app.md.
> 
> What I saw:
> - `head keylang/map-explained/README.md` shows the start page (`## Repository`, `## Explained map`, then the layer table). The README layer's tree and its `<a id="README.r">` anchors are not there.
> - `grep -rn "Reads docs" keylang/map-explained/` finds nothing, so the layer's node explanations are lost.
> - app.md has links to anchors that do not exist: line 11 `- r [README.r](README.md#README.r)` and line 14 `- calls [README.r.r](README.md#README.r.r)`. The README.md index has the same broken link: `**R** · [r](README.md#README.r) (README)`.
> - The canonical keylang/map/README.md is correct and has the layer tree, because renderMap does not add a start page.
> - `map --check` exits 0, so the loss is silent.
> 
> Why it happens:
> - src/emit.ts:55-56: renderLayers puts `${layerId}.md` for each layer, then renderExplainedMap always calls `out.set("README.md", renderReadme(...))`, which overwrites the layer's file.
> - src/config.ts:121: RESERVED_LAYER_NAMES contains only the synthetic layers and the grammar keywords. `README` passes both layerName() and the reserved check (config.ts:267-268). guessLayers could also produce this name from a `src/README/` directory.
> 
> Contract:
> - docs/cli.md:160/164 says that `<layer>.md` has the same tree as the canonical map, that every node has an anchor, and that `calls` link to `[id](<шар>.md#<якір>)`. All three are broken for this layer.
> - No doc reserves `README` as a layer name.
> - docs/review-2026-10-05.md does not list this. Its only README mentions concern the repo's own README and the course.
> 
> Not reproduced: the case-insensitive filesystem variant (a layer named `readme` on macOS or Windows). This machine is Linux, so that part is only plausible from the code: `readme.md` and `README.md` would be written to the same file.
> 
> Severity: this needs an unusual layer name and only damages generated output, so it is a minor edge case. P3 stays.

## Що зробити

- Зарезервувати ім'я шару `README` (порівнюючи без урахування регістру) у RESERVED_LAYER_NAMES або перейменувати стартову сторінку `map-explained/` чи файли шарів, щоб вони не збігалися, з помилкою конфігу замість тихого перезапису.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/emit.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** Виправлено через конфіг, а не emit: ім'я шару `README` у будь-якому регістрі тепер зарезервоване (`isReservedLayerName` у src/config.ts). `keylang.json` з таким шаром — помилка конфігурації з кодом 2 (`keylang.json: \`layers.README\`: \`README\` is reserved: \`README.md\` is the start page of the explained map; rename the layer, e.g. \`README_\``), тож тихого перезапису в `map-explained/` більше немає; вгадана тека `src/README/` стає шаром `README_` з приміткою, як `external_`. Регістронезалежне порівняння закриває і варіант `readme` на macOS/Windows. Припущення: несумісність для наявних конфігів із шаром `README` прийнятна — тікет прямо пропонує помилку конфігу. Документовано в docs/semantics.md («Імена шарів») і llm.txt.

Тест (tests/core.test.ts, справжній CLI): `README`, `readme`, `ReadMe` → `map` 2 з повідомленням і без `map-explained/` (до виправлення — 0 і затертий файл шару); `init` на `src/README/` дає `README_`. `node --test tests/core.test.ts` — 36/36, `npm run typecheck` — 0.
