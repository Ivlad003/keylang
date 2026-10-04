# 10: Оновлювати та перевіряти baseline в TUI

**What to build:** людина явно генерує базові правила або лише перевіряє їхню актуальність і бачить результат без виходу із сесії.
**Blocked by:** [09 — файлові операції](09-map-write-and-commit-protocol.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A08, A11.

## З чого почати

Знайти `cmdBaseline`, `baselineText`, `safeWrite`, `loadConfig`, контракт baseline й ADR 0005. Брати чинний алгоритм правил, не виводити власну whitelist-політику.

## Кроки

1. Виділити shared baseline request із mode write/check; CLI baseline викликає його, зберігаючи stdout і код.
2. Додати форму з режимом і цільовим файлом, виведеним із config.dir. Перед write пояснити, що поточні залежності стануть основою базових правил; додаткового generic-підтвердження не вводити.
3. Використати saved-input barrier, worker, freshness/expected-target перевірку й облік фактичних записів.
4. Check порівнює нормалізовані CRLF як CLI, код 1 означає stale, без жодних записів.
5. Після write оновити чистий буфер baseline і повторити аналіз. Не відкрити generated baseline як звичайний writable buffer.

## Перевірки

- Repo з двома шарами та external-пакетом: байти й точкові allow/deny збігаються з CLI baseline.
- Два послідовні write і check: ідемпотентність; check повертає 0.
- Нове ребро: check повертає 1 без зміни inventory; write оновлює baseline.
- Ручна ціль без generated marker або зовнішня правка перед commit не перезаписується.

## Приймання

- [x] Генерація baseline доступна через alias `baseline` і людську назву.
- [x] Недоступний snapshot дає предметну причину, не порожні «успішні» правила.
- [x] Немає автоматичного оновлення baseline від F5 або звичайного check.

**Межі:** не змінювати критерій готовності фічі чи політику дозволів.
**Validation:** `npm run typecheck`, `npm test`; перевірити карту/шари після перенесення оркестрації.

## Comments

- 2026-09-30 — реалізовано baseline як спільну операцію write/check для CLI і TUI (A08 для baseline, A11 для baseline). Закомічено `90dc272`. Перевірки пройшли (результат нижче). Статус лишаю `ready-for-agent` до рішення людини щодо закриття.

## Result

Реалізовано `baseline` (запис і перевірка) як спільну операцію з фазами обчислення/commit, форму режиму в TUI і повторний аналіз після запису.

- **`src/baseline.ts`** — алгоритм `baselineText` не змінено. Нові `baselinePath`, `planBaseline` / `baselinePlanProblems` / `commitBaseline`. `BaselinePlan` (внутрішній, не формат proposals): ціль `<dir>/rules.baseline.md`, новий текст, поточні байти (`current` або null), стан `current` (збіг після CRLF→LF) / `stale` / `manual` (немає маркера `keylang:generated`), рядки правил `- deny`/`- allow`, які новий текст додає/прибирає, і входи (`keylang.json` + manifest джерел). Перевірка перед записом — `writeProblem(…, { generated: true, expect: current })` + свіжість входів. Запис — `writeAtomic` у `landing` (CRLF старого файла зберігається, як і раніше через `safeWrite`).
- **`src/map.ts`** — перевірку свіжості config/джерел плану карти винесено в експортовані `SourceInputs`, `sourceInputs`, `sourceInputProblems(config, inputs, subject)`; `mapPlanProblems` викликає її (тексти для карти ті самі).
- **`src/operations.ts`** — `BaselineRequest { kind: "baseline", root, check }`, `BaselinePayload { file, check, state, written, refused, error, added, removed, snapshot }`, `"baseline"` у `WRITING_KINDS`. `runBaseline`: аналіз коду й збереженого конфігу без specs і без запису кешу фактів → план. Коди: check — 0 current, 1 stale/missing/manual, нічого не пише й не кличе `beforeCommit`; write — 0 без запису, якщо current; 1 manual (нічого не записано, commit не запитано); після `beforeCommit` — відмова через змінені ціль/входи `failed` 1; I/O-помилка `failed` 2; інакше 0 і `written: [file]`. Немає snapshot (немає мов/джерел), зламаний конфіг, збій аналізу — `failed` 2 з причиною (`baseline: no supported source files; run \`keylang init\``), payload null — ніяких «порожніх» правил. Скасування — null.
- **`src/cli.ts`** — `cmdBaseline` — принтер над операцією (також для `init` і `init --check`): `…: written` / `…: stale, run \`keylang baseline\`` / `…: manual file…` у stdout; відмова — рядки в stdout і `keylang: nothing was written…` у stderr; збої — `keylang: <msg>` у stderr, код 2.
- **`src/tui/actions.ts`, `state.ts`, `app.ts`, `view.ts`** — дія «Baseline: write or check» (group Rules; aliases `baseline`, `update baseline`, `check baseline`, `keylang baseline`, `allowed dependencies`) відкриває форму `Prompt.kind = "baseline"`: `Write <dir>/rules.baseline.md` / `Check … (writes nothing)`, ціль із `specDir()`, note пояснює, що поточні залежності стануть дозволеними (нове ребро/пакет — K102). Окремого підтвердження немає: крок збереження відкривається лише для dirty `keylang.json` (для write — з назвою цілі в `writes`); специфікації лишаються dirty. Commit-протокол 09 без змін (`beginCommit`/`endCommit`); повідомлення «… is writing files» тепер називають операцію. Після запису baseline-check-записи — outdated («the baseline was written since this run»), check-результат також outdated при зміні snapshot. Буфер baseline — read-only з поясненням `generated by \`keylang baseline\``. F6: `up to date` / `stale` / `written` / `manual file[, nothing written]` / `inputs changed, nothing written` / `write failed…` з кодом, повідомлення і рядки `+`/`-` зміни дозволених залежностей; запис — `Baseline: write or check · write|check`.
- **`docs/tools.md`** — абзац baseline доповнено (CRLF, ручний файл, відмова, код 2 без джерел) і новий абзац «Baseline у TUI».
- **Карта** — `keylang/map/{cli,features,map,operations,tui}.md`, `keylang/map-explained/{cli,features,map,operations,tui,README}.md` перегенеровано; WIP-файли `extract.md` байтово ті самі до/після (не закомічено); ці 11 файлів збігаються з картою чистої копії HEAD + зміни 10, крім WIP-рядка extract і total у README (так само, як у HEAD після 09).
- **Тести** (`tests/tui.test.ts`, 3 нові):
  1. Repo з двома шарами й `stripe`: F5 нічого не пише; людська назва знаходить дію, форма показує режими й ціль; check на відсутньому файлі — 1 і stdout як у CLI, дерево незмінне; write у справжньому worker без додаткового кроку — байти = CLI twin, `deny app external` + `allow app external.stripe`, записано лише baseline; повторний write/check — 0 і без записів; буфер baseline read-only; нове ребро (domain → stripe) — check 1 без змін дерева, F5 теж; write оновлює файл = CLI, чистий буфер слідує диску, старий check outdated, CLI `--check` 0, F6 показує `+ - allow domain external.stripe`.
  2. Ручний baseline: write і check — 1 `manual file…`, CLI — 1 з тим самим рядком, дерево незмінне, commit не запитано; зовнішній запис цілі в паузі перед commit — `failed` 1, байти зовнішнього запису лишились; змінене джерело — `failed` 1; dirty `keylang.json` — крок із `writes: [target]`, Back нічого не пише; Save and continue — конфіг збережено, baseline записано, CLI `--check` 0.
  3. Без підтримуваних джерел: TUI `failed` 2 з причиною, payload null; CLI — 2 і той самий stderr; нічого не записано. CRLF-копія baseline: `--check` 0, `baseline` нічого не пише й байти ті самі.

Коміт: `90dc272` (Write and check the baseline through a shared operation in CLI and TUI); лише файли 10, сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 497 tests, 496 pass / 0 fail / 1 skipped ✓ (перший прогін мав 1 fail «tui: palette and search» — «rules» у назві дії перехоплювало пошук `rules.md`; назву змінено на «Baseline: write or check»); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 12 (init): `cmdInit` викликає `cmdBaseline` → операцію `baseline`; init у сесії може запускати її як крок (check-режим для `init --check`). Ручний baseline тепер дає 1 і в init.
- 11, 13, 14: `sourceInputProblems` — готова перевірка свіжості config/джерел для плану іншої писальної операції; шаблон «план → `beforeCommit` → problems → `writeAtomic`» для одного файла — `runBaseline`.
- 35: `q` під час commit baseline так само ще не чекає кроку.

Припущення й залишки:
- Ручний `rules.baseline.md` (без маркера) більше не перезаписується CLI — зміна контракту, узгоджена з `map`/`wire` і вимогою тікета; `--check` для нього друкує `manual file…` замість `stale`.
- Відмова через змінені входи/ціль — код 1 (як у 09); ціль через посилання за межі repo раніше давала 2 (виняток `safeWrite`), тепер 1.
- Входи плану: `keylang.json` і джерела; `tsconfig`/`package.json` (резолвери пакетів) повторно не перевіряються — як і в 09.
- Пояснення «зміни дозволеної архітектури» — множинний diff рядків правил, не семантичне порівняння.
- Скасування під час запису одного файла не тестувалось окремо: крок один, протокол 09 загальний.
- Ручну TTY-перевірку наживо не виконано.
