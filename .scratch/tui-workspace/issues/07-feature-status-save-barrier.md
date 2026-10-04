# 07: Перевіряти готовність фічі після явного збереження dirty-входів

**What to build:** дія feature показує готово/прогалини/помилку та переходи до причин, за тим самим збереженим станом, що CLI.
**Blocked by:** [04 — результати й переходи](04-complete-findings-panel.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A10, A19, A28.

## З чого почати

Знайти `cmdFeature`, `featureStatus`, `analyze`, збереження dirty-буферів, `OperationRequest` і результати з 01–02. Не переписувати критерій готовності.

## Кроки й рішення

1. Додати shared feature operation; CLI викликає її з тим самим human/json-виводом. Payload — чинний FeatureStatus, не текст для повторного парсингу.
2. Форма slug: початкове значення з поточного feature-файла, інакше явний вибір або ввід. Показати ціль; валідація slug як у CLI.
3. Увести повторно використовуваний передопераційний крок: перелік усіх dirty spec/config буферів → Save and continue або Back. Doctor/довідка обходять його.
4. Save and continue зберігає буфери послідовно штатним шляхом, перевіряє помилки/конфлікти. Операція запускається лише після успіху всіх записів; уже записані буфери не відкочуються при помилці наступного.
5. Показати done/gaps, exitCode, snapshot/актуальність, окремі tests/trace. Enter на gap використовує переходи 04.
6. Після правки входів результат позначити outdated; `done` не лишається поточним лише тому, що збережено старий payload.

## Перевірки

- Фікстури done, незакритий planned, static gap, rule fail дають той самий JSON і код, що CLI.
- Невідомий slug — код 2; прогалини — 1; сесія продовжує приймати ввід після обох.
- Dirty spec + dirty config: Back не пише; Save and continue читає нові байти.
- Помилка/конфлікт другого save: feature не запускається; перший успішний save і другий dirty-текст видимі.

## Приймання

- [x] Немає нового алгоритму визначення «готово».
- [x] Передопераційний крок можна використати іншою дією без копіювання логіки.
- [x] Нормальний вихід TUI після коду операції 1/2 — 0.

**Межі:** шаблони коду й автоматичне виправлення gaps не входять.
**Validation:** `npm run typecheck`, `npm test`; карта/правила при виділенні модулів.

## Comments

- 2026-09-30 — реалізовано A19, частину A10 (крок збереження перед feature) і A28 для feature. Перевірки пройшли (результат нижче). Статус лишаю `ready-for-agent` до рішення людини щодо закриття.

## Result

Реалізовано спільну операцію `feature`, форму slug, повторно використовуваний крок збереження dirty-входів і звіт готовності у F6.

- **`src/operations.ts`** — `FeatureRequest { kind: "feature", root, slug }`; `runFeature` виконує ту саму послідовність, що раніше `cmdFeature`: slug (`FEATURE_SLUG`, експортований для TUI), `loadConfig`, наявність `<dir>/features/<slug>.md`, `analyze({ root })` без overlay, чинний `featureStatus` (не змінювався). Payload — `FeaturePayload { slug, file, snapshot, report }`, де `report` — незмінний об'єкт `featureStatus`. Відсутній файл, невалідний slug/конфіг, збій аналізу → `failed`, код 2, повідомлення CLI; прогалини → 1; готово → 0; нічого не пише. `OperationResult` став дискримінованим за `kind` (`OperationEnvelope<K>` + `OperationPayloads`), `runOperation` має overloads, тож payload doctor типізований без приведень. `OperationContext.analyze` — необов'язковий analyzer (TUI передає свій, зі snapshot у worker). `gapLine`/`featureSummary` — рядки CLI.
- **`src/cli.ts`** — `cmdFeature` — принтер над операцією: перевірки `slug`/`--format` лишились у CLI в тому ж порядку; stdout/stderr/коди незмінні (CLI-тест feature проходить без змін).
- **`src/tui/app.ts`**:
  - Дія `feature` → форма `feature slug:` з початковим slug поточного feature-файла, списком файлів фіч і ціллю/причиною біля запиту; невалідний slug лишає форму з текстом.
  - `withSavedInputs(action, run)` — повторно використовуваний крок: без dirty-буферів запускає одразу, інакше відкриває модальний `SaveBarrier` (`←→/Tab`, `Enter`, `Esc` = Back). `saveAndContinue` пише буфери по черзі через `persist` (той самий шлях, що `Ctrl+S`; `save()` перебудовано на `changedOnDisk` + `persist`); зміна на диску або помилка запису зупиняє крок з причиною, операція не стартує, уже записане не відкочується. `requestOperation` = відмова при активній операції + крок + `startOperation` (узагальнений `startDoctor`). Doctor йде в `startOperation` напряму, минаючи крок.
  - F6: Tab на записі фічі переводить стрілки на прогалини (повна причина — у рядку повідомлення), Enter відкриває gap через `openTarget` (виділений зі спільного з 04 `openFinding`), Esc/Ctrl+O повертають до звіту. Повтор запису фічі йде через крок збереження.
  - `inputsChanged` позначає записи фіч `outdated` після правки (`reanalyzeSoon`), збереження (`persist`), оновлення чистого буфера з диска; `adopt` — при іншому snapshotId.
- **`src/tui/state.ts`** — `OperationRecord.kind/params` = будь-який `OperationRequest`, `outdated`; `SaveBarrier`, `State.barrier`; `Prompt.kind "feature"`; `results.gap`.
- **`src/tui/actions.ts`** — `Feature readiness` (aliases `feature`, `readiness`, `done`, `gaps`); недоступна в MERGE і під час іншої операції.
- **`src/tui/view.ts`** — звіт фічі в F6 (Feature · slug · saved state, Done/N gap(s) · code · snapshot, рядки прогалин, інформаційні tests/trace, `outdated: … · Enter reruns`), `recordLabel` зі slug, `recordStatus` з `· outdated`, `recordSummary`, `operationLabel`, вікно `drawBarrier`, форма slug у `drawPrompt`.
- **`docs/tools.md`** — абзац «Готовність фічі (`feature`) і крок збереження» та згадка дії TUI у розділі фіч.
- **Карта** — `keylang/map/{cli,operations,tui}.md`, `keylang/map-explained/{cli,operations,tui,README}.md` перегенеровано штатним генератором. Diff WIP-файлів `extract.md` байтово той самий до й після. Карта `{cli,operations,tui}` байтово збігається з генерацією в чистому worktree HEAD + лише зміни 07 (без WIP). `map-explained/README.md` відрізняється там лише рядком `extract` і загальною сумою: це вплив WIP у `src/extract/ts.ts`, який уже був у HEAD. Закомічено версію з робочого дерева; змінено лише рядки cli/operations/tui/all.
- **`tests/tui.test.ts`** (5 нових):
  1. buy (done, 0), refund (planned+static, 1), skip (static, 1), DENY-правила (rule, 1): `deepEqual` payload.report з `keylang feature --format json` і той самий код. `nope` → failed, 2, stderr CLI дослівно. `../x` відхилено у формі. Сесія відповідає, `treeBytes` незмінний (крім записаних тестом правил), `q` → onQuit.
  2. `runTerminal`: feature з кодом 1, потім з кодом 2, `q` → повертає 0 (A28).
  3. Dirty `keylang.json` + dirty feature: форма з `buy` і ціллю; крок перелічує обидва; Esc і Back через `→ Enter` нічого не пишуть і не запускають; Save and continue → байти обох на диску = буфери, запис бачить новий planned (код 1, parity з CLI).
  4. Конфлікт другого save (rules.md змінено ззовні): feature не запущено, buy.md записано, rules.md на диску — чужий текст, буфер зберігає `Notes.`, крок лишається відкритим з причиною; повтор знову не перезаписує.
  5. Tab → повна причина в повідомленні, Enter на gap → рядок 3 / рядок 5 кол. 3, Esc повертає до звіту; правка → `outdated` у F6; Enter на записі → крок збереження.

Коміт: `98adfa9` (Check feature readiness in the TUI after an explicit save step); лише файли 07, сторонній WIP (`extract.md`, `src/extract/ts.ts`, docs/course тощо) не зачеплено. Файл тікета — у `.scratch/` (gitignored).

Перевірки: `npm run typecheck` ✓; `npm test` 475 tests, 474 pass / 0 fail / 1 skipped ✓ (перший прогін упав лише на застарілій карті — перегенеровано); `node bin/keylang.js map --check` ✓ (код 0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok, код 0 ✓.

Передано наступним задачам:
- 08, 09, 13–16 та інші операції над диском: `requestOperation(action, request)` — спільний вхід (крок збереження + одна операція); новий kind додається в `OperationRequest`, `OperationPayloads` і `runOperation` (overload + case). Read-only операції без специфікацій (як doctor) викликають `startOperation` напряму.
- 35: `SaveBarrier` — модальний стан; вихід/скасування під час кроку ще не опрацьовані окремо (`Ctrl+C` виходить як завжди, з перевіркою dirty).
- 28: для planned-gap дія генерації коду з тим самим ID ще не додана (design §2.7).

Припущення й залишки:
- Payload — обгортка `{ slug, file, snapshot, report }`, а не голий `FeatureReport`: `report` — дослівно CLI JSON, snapshot потрібен для показу й інвалідації.
- Конфлікт у кроці збереження не «озброює» `overwrite`: повторний Save and continue знову відмовляє. Перезапис — лише явним подвійним `Ctrl+S` у самому буфері.
- Порядок збереження — лексикографічний за шляхом (`compareText`), не порядок відкриття.
- `outdated` консервативний: будь-яка правка будь-якого буфера чи збереження позначає всі записи фіч, навіть якщо файл не впливає на результат.
- Поки завершення feature не відкриває F6 автоматично (фокус не викрадається, A23): повідомлення `feature <slug>: N gap(s) · code 1 · F6 shows the report`.
- Операція виконує `analyze` у тому самому процесі (snapshot — через worker сесії); окремого worker для всієї операції немає (тема 08).
- Ручну TTY-перевірку наживо не виконано.

