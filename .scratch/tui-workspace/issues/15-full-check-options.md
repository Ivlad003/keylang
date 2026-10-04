# 15: Запускати повний check із paths, strict та static-режимом

**What to build:** користувач задає область і політику перевірки та читає окремий дисковий звіт, не змінюючи аналіз редактора.
**Blocked by:** [08 — worker і дисковий запуск](08-background-map-check.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A06, A20, A28.

## З чого почати

Знайти `cmdCheck`, `checkResults`, `writeCheck`, `sameFinding`, `STATIC_MODES`, параметри `analyze`. Приклад позицій і criteria взяти з чинного CLI JSON.

## Кроки

1. Виділити shared check operation з paths, strict, необов'язковим staticOverride. Поле format належить представленню/експорту, не семантичному аналізу.
2. Форма показує paths (типово налаштований каталог), strict off, static «із конфігурації» або behavior/shape. Зберегти precedence override → config → default.
3. Використати save-barrier, worker і чинне усунення дублікатів. Повернути results, coverage, snapshotId, effective options і код.
4. CLI human/json/sarif/github форматери читають той самий предметний результат. Не змінювати stdout/stderr або severity.
5. F6 відкриває окремий report із параметрами та переходами 04; pinned overlay analysis лишається окремим.
6. Помилка конфігурації/читання — код 2, порушення/strict-unverified — 1, звичайний unverified може мати код 0 з видимою неповнотою.

## Перевірки

- Один fixture з ID ok та trace unverified: normal і strict мають різні коди, але однакові докази.
- Фікстура з типовим hook/fallback: behavior/shape збігаються з CLI і явно підписані.
- Обраний файл/тека обмежують звіт як CLI; явні excluded explanations обробляються так само.
- Збережені входи → CLI JSON і TUI payload мають однакові публічні поля; жодних записів.

## Приймання

- [x] Format не змінює вердикт, CLI-коди та вихід сесії незалежні.
- [x] Кожна діагностика доступна через F6, включно з кодом.
- [x] Передопераційне збереження — окрема явна дія, а check сам read-only.

**Межі:** changed/since — 16, export — 18.
**Validation:** `npm run typecheck`, `npm test`; актуальна карта/правила при перенесенні.

## Result

Реалізовано повний `check` (paths, strict, static) як спільну read-only операцію; CLI без `--changed` — принтер над нею; форма в палітрі TUI і окремий звіт у F6.

- **`src/check-results.ts`** — `checkReport(verdicts, snapshotId, diags)` → `{ results, lines, counts }` (JSON-результати, human-рядки та лічильники підсумку — те, що раніше рахував `cmdCheck`), `checkExitCode(counts, strict)` (1 — fail або strict+unverified, інакше 0).
- **`src/operations.ts`** — `CheckRequest { kind: "check", root, paths, base?, strict, static? }` (формат у запит не входить); `CheckPayload { results, snapshotId, coverage, lines, counts, options: { paths, strict, static, staticFrom: request|config|default, withoutCode }, notSpecs }`; `runCheck`: `loadConfig` → відсутній каталог/шлях (повідомлення CLI відносно `base`) → `analyze` з `display` від `base`, override static, `withoutCode` для specs поза каталогом; `persistFacts` вимкнено. Невалідний конфіг, відсутній шлях, збій аналізу — failed, 2; порушення/strict-unverified — 1; unverified без strict — 0. `checkSkipNote`, `checkSummary` — рядки CLI.
- **`src/cli.ts`** — `cmdCheck` без `--changed` викликає операцію (`base = cwd`); помилка → `keylang: …`, 2, як раніше. Гілка `--changed`/`--since` лишилась у CLI (тікет 16), але рендерить через той самий `checkReport`. `writeCheck(format, report)` — human/json/sarif/github з одного предметного результату; stdout/stderr/коди незмінні (усі CLI-, flows-, metamorphic-тести без змін зелені).
- **`src/tui/actions.ts`** — дія `full-check` «Check: paths, strict, static» (група Check; aliases `keylang check`, `full check`, `check paths`, `check --strict`, `check --static`, `strict`, `static mode`, `check report`); недоступна в MERGE і під час іншої операції.
- **`src/tui/state.ts`** — `Prompt.kind "full-check"`, `Prompt.checkOptions { strict, static | null }`; `results.gap` тепер — вибраний елемент запису (gap або результат check).
- **`src/tui/app.ts`** — форма: поле шляхів (типово каталог специфікацій), рядки strict / static / run (вибрано run), `←→` змінюють опцію (static: з конфігу → behavior → shape), примітка — кількість spec-файлів і незбережених; шлях поза коренем — відмова у формі. `requestOperation("check")` — крок збереження лише для dirty-буферів під вибраними шляхами та `keylang.json`. Операція йде у worker (не-doctor kind). `recordGaps` узагальнено: для check — кожен результат; `Tab` → стрілки по результатах, повна причина в рядку повідомлення, `Enter` відкриває позицію через `openTarget` (spec у редакторі, код — у read-only viewer). Записи check стають outdated після правки/збереження (`inputsChanged`) і при іншому snapshot (`adopt`). Закріплений «Current analysis» не змінюється.
- **`src/tui/view.ts`** — мітка запису (`paths · strict/not strict · static …`), `operationLabel` (`check`/`check --strict`), підсумок `N fail, N unverified, N ok · code X`; звіт F6: read-only/saved files/paths, `strict on|off · static <mode> (override|keylang.json check.static|default) · snapshot`, outcome, `incomplete: N unverified, not proven · strict would make it code 1`, specs без коду, пропущені шляхи пояснень, усі результати CLI JSON (включно з `ok`), кількість coverage; підказки `Tab findings` / `Enter open finding`.
- **`docs/tools.md`** — абзац «Повний check у TUI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; diff WIP `extract.md` байтово той самий до/після (`cmp`), не закомічені.
- **Тести** (`tests/tui.test.ts`, 5 нових):
  1. checkout (ID ok, trace unverified): normal — 0, strict — 1, однакові `results/snapshotId/coverage`; `deepEqual` з CLI `--format json`, human stdout = `payload.lines`, stderr = повідомлення; sarif/github — ті самі коди; `treeBytes` незмінний; `state.analysis` і його findings ті самі; F6 — параметри, `incomplete: …`; Tab → trace-результат → Enter відкриває рядок flow, Esc повертає; `q` → onQuit.
  2. `runTerminal`: strict check з кодом 1, потім failed з кодом 2 → вихід 0 (A28).
  3. Hooks fixture: config/default, override behavior, override shape — JSON = CLI з `--static=…`; `staticFrom` default/request; shape дає unverified «set by --static»; F6 `static shape (override)`; репо з `check.static: shape` — форма показує `from keylang.json check.static`, override перемикається й повертається, запис `(keylang.json check.static)`, JSON = CLI.
  4. Файл звужує звіт як CLI; вся тека — 1 через інший flow; `keylang/explain` — `notSpecs` і та сама нотатка в stderr CLI; відсутній шлях і зламаний `keylang.json` — failed 2 з повідомленням CLI; шлях поза репозиторієм — відмова у формі; нічого не записано.
  5. Dirty flow під шляхом + dirty інший spec: крок збереження лише для flow; Back нічого не пише й не запускає; Save and continue — flow збережено, інший лишився dirty, результат = CLI JSON на збережених байтах (fail для `domain.order.nope`).

Коміт: `90086cd` (Run the full check through a shared check operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 510 tests, 509 pass / 0 fail / 1 skipped ✓ (перший прогін мав 1 fail — тест актуальності карти, бо я змінив коментар `check-results.ts` під час прогону; після регенерації окремий тест і повний повторний прогін зелені); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 16: `--changed`/`--since` ще в `cmdCheck`; перенести в операцію (напр. поле `changed?: { since }` у `CheckRequest`), фільтр — `filterChanged` між `analyze` і `checkReport`; рендер уже спільний.
- 17: `--explain-edge` лишився в CLI.
- 18: export — з `CheckPayload` (`results/snapshotId/coverage` = JSON; `lines` = human); SARIF/GitHub-рендер поки в `writeCheck` у `cli.ts` — винести в чистий модуль.

Припущення й залишки:
- Звіт check у F6 показує всі результати (включно з `ok`), фільтр `f/u/w/o` панелі знахідок на нього не діє.
- Шляхи в TUI — відносно кореня, через пробіл (пробіли в шляхах не підтримані), лише всередині репозиторію; CLI як і раніше приймає будь-які шляхи.
- Override у TUI позначається в evidence як `set by --static` — дослівно як CLI (той самий аналіз).
- `outdated` консервативний, як для feature: будь-яка правка/збереження.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-09-30: виконано, коміт `90086cd`.
