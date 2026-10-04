# 09: Записувати карту з перевіркою входів і точним звітом про записи

**What to build:** дія «Оновити карту» записує ті самі артефакти, що CLI, обробляє конфлікти й оновлює чисті буфери.
**Blocked by:** [08 — worker і map-check](08-background-map-check.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A07, A22–A25.

## З чого почати

Знайти `writeMap`, `mapConflicts`, `targets`, `extraGenerated`, `safeWriteAll`, `writeAtomic`, `adoptResult`. Поточний safeWriteAll перевіряє всі цілі, але не дає транзакції при I/O-помилці.

## Зафіксоване рішення

Обчислення й commit — окремі фази однієї операції. Внутрішній план містить очікувані байти цілей, створення/видалення та ідентичність істотних входів. План не є новим форматом proposals. CLI й TUI використовують той самий commit-шлях.

## Кроки

1. Перенести оркестрацію map-write до shared module, зберігши маркери, індекс, explained map, прибирання зайвих generated і cache-політику.
2. До запису перевірити всі цілі/видалення й актуальність входів. Новий ручний файл або змінений source/config робить план непридатним; запропонувати повторне обчислення.
3. Для кожного успішного запису/видалення додати запис у результат; на I/O-помилці повернути код 2 із completed/failed/not-attempted. Не називати весь план виконаним.
4. Під час commit не terminate worker. Скасування перевіряти між файловими кроками; поточний атомарний запис завершується. Уже зроблене не відкочувати.
5. Перед commit повідомити сесію: відкласти публікацію аналізу й конфліктні save/MERGE. Після завершення або часткового збою інвалідувати старе покоління та запустити повний повтор з dirty-overlays.
6. Чисті буфери перечитати; dirty-буфер не замінити. Дати порівняння, явне reload або save-as із чинною валідацією шляху.

## Перевірки

- Дві однакові копії repo: CLI map і TUI map дають однакові артефакти, крім службового generated-time індексу.
- Контрольована пауза перед commit + зовнішня правка цілі/source: відмова, нові байти не затерті.
- Детермінований збій другого файлового кроку: перший listed completed, другий failed, решта не позначена записаною. Не покладатися на chmod під root.
- Аналіз, завершений під час commit, не стає поточним; після роботи новий звіт відповідає фактичному диску та буферам.

## Приймання

- [x] F5 і далі нічого не записує; Map write має явний запуск.
- [x] Read-only карта лишається read-only у редакторі.
- [x] Права/CRLF/межі symlink і ручні файли збережені за чинним контрактом.

**Межі:** не робити загальний rollback або нове сховище транзакцій. Факт-cache також врахувати в гарантіях read-only та обліку записів.
**Validation:** `npm run typecheck`, `npm test`, `node bin/keylang.js map --check`, `node bin/keylang.js check`.

## Comments

- 2026-09-30 — реалізовано запис карти як спільну операцію з фазами обчислення/commit для CLI і TUI (A07, A22 для карти, A23–A25 для map). Закомічено `9e95681`. Перевірки пройшли (результат нижче). Статус лишаю `ready-for-agent` до рішення людини щодо закриття.

## Result

Реалізовано `map` (запис) як спільну операцію у дві фази, протокол commit у worker операцій, дію «Map: write» у TUI з кроком, що показує цілі, і повний повторний аналіз після запису.

- **`src/map.ts`** — `writeMap` замінено на `planMap` / `mapPlanProblems` / `commitMap`. `MapPlan` (внутрішній, не формат proposals): кроки `write`/`remove` з очікуваними байтами (`expect`: вміст або null для відсутнього файла; для індексу й кешу не порівнюється), `emptyDirs` вимкненої карти з поясненнями, входи — текст `keylang.json`, manifest джерел (шлях + sha256), хеш briefs (коли `explain.map`). `mapPlanProblems` — `writeProblem(…, { generated: true, expect })` для кожної цілі + свіжість входів (змінений/доданий/видалений source, config, briefs) → рядки `шлях: причина`. `commitMap` (async) — кроки по одному через `writeAtomic(landing(abs), text, { exact: true })` або `rmSync`; між кроками один оберт event loop і перевірка signal; перша помилка → `failed`, решта `not-attempted`; відкату немає; порожні теки прибираються лише після повного успіху (не рахуються записом). `MapResult.factCache` — текст кешу за `persist`, генерація більше нічого не пише.
- **`src/fact-cache.ts`** — `save()` → `serialize()`, експорт `FACT_CACHE_FILE`.
- **`src/safe-write.ts`** — `writeAtomic(abs, text, { exact })`: без перетворення CRLF для згенерованих артефактів.
- **`src/operations.ts`** — `MapRequest { kind: "map", root, label? }`, `MapPayload { conflicts, refused, steps (CommittedStep з state/error), stats, warnings, snapshot, skipped, guessed }`, `WRITING_KINDS`, `OperationContext.beforeCommit`. `runMap`: аналіз з `persistFacts` → план → конфлікти (completed, 1, нічого не записано) → прогрес `waiting to write` → `beforeCommit` → signal → `mapPlanProblems` (failed, 1, «run the map again») → commit (прогрес `writing <path>` / `removing <path>`). Коди: 0; 1 конфлікт/відмова; 2 немає джерел/конфіг/аналіз/I/O частково; null cancelled. `written`/`removed` конверта — лише completed (разом з index і кешем). Принтери `mapConflictLines`, `mapStepLines`, `mapSummary`.
- **`src/cli.ts`** — `cmdMap` запису — принтер над операцією; stdout `…: written`/`…: removed`, stderr warnings і підсумок як раніше; відмова — рядки в stdout + `keylang: nothing was written…`, код 1; частковий збій — `keylang: <path>: <err>` / `keylang: <path>: not written` у stderr, код 2.
- **`src/tui/operation-worker.ts`** — `OperationCall` тепер `run | commit | cancel`; `OperationReply` + `commit`. `beforeCommit` у worker шле `commit` і чекає відповіді; `cancel` — abort signal worker-а.
- **`src/tui/background.ts`** — `READ_ONLY` прибрано: до commit скасування будь-якого kind завершує worker (нічого не записано, бо запис стартує лише після дозволу); на `commit` від worker-а викликається `beforeCommit` сесії, далі `commit` (або `cancel`, якщо signal уже aborted); `Pending.committing` → Cancel стає повідомленням, worker не термінується, результат із фактичними кроками закриває запит.
- **`src/tui/app.ts`** — дія `map` → `requestOperation` з кроком: `SaveBarrier.writes` = `<dir>/map/*.md`, `<dir>/map-explained/*.md`, `.keylang/index.json`, `.keylang/cache/facts.json`; крок відкривається й без dirty-буферів (`[Continue]`/`[Back]`); у ньому лише `keylang.json`, специфікації лишаються dirty (карта їх не читає). `beginCommit` (з `beforeCommit`): `committing = record.id`, покоління аналізу ++ (аналіз у польоті відкидається), новий аналіз відкладається. `writingNow()` відмовляє `Ctrl+S`, `w` у MERGE, `u`. Cancel під час commit — лише abort + «cancelling after the current file». `endCommit`: оновлює `disk` чистих буферів записаних файлів, dirty-буфер не замінює й називає в повідомленні, map-check-записи → outdated, `reanalyze(false)` з overlays.
- **`src/tui/view.ts`, `state.ts`, `actions.ts`** — «Map: write» (aliases `map`, `update map`, `write map`, `regenerate map`, `keylang map`); F6: `N written[, M removed]`, `N conflict(s), nothing written`, `inputs changed, nothing written`, `K of N step(s) done, failed|cancelled`; рядки кроків `written`/`removed`/`failed …: err`/`not attempted …`; `SaveBarrier.writes`.
- **`docs/tools.md`** — абзац «Запис карти (`map`) і commit».
- **Карта** — `keylang/map/{base,cli,map,operations,tui}.md`, `keylang/map-explained/{base,cli,map,operations,tui,README}.md` перегенеровано новим записувачем; WIP-файли `extract.md` байтово ті самі до/після; ці 11 файлів збігаються з картою чистої копії HEAD + зміни 09 (без WIP `src/extract/ts.ts`), крім WIP-рядка extract у README, який уже був у HEAD.
- **Тести** (`tests/tui.test.ts`, 7 нових):
  1. Дві копії repo: F5 і Back нічого не пишуть; крок показує цілі; TUI-запис (справжній worker) = CLI `map` байт-у-байт, крім `generated` індексу; `mapStepLines` = stdout CLI; `written` включає індекс і кеш; відкритий буфер карти read-only, `i` відмовляє, текст = диск; `map --check` після — 0.
  2. Пауза перед commit: ручний файл на місці відсутньої цілі → failed 1, `created on disk…`, на диску лише зовнішній запис; змінений source → failed 1; `Enter` у F6 → той самий крок → completed 0.
  3. Файл на місці теки `map-explained` (детерміновано, без chmod): 1-й крок completed, 2-й failed (ENOTDIR), решта not-attempted, індекс не змінено, код 2, сесія жива, повторний аналіз відбувся.
  4. Cancel під час commit (на прогресі кроку індексу): індекс дописано, кеш not-attempted, cancelled/null.
  5. F5, що завершився під час commit, не прийнято; поточний звіт — новий після commit, з dirty-буфером як overlay; snapshot = індекс на диску.
  6. CLI: права 0o640 збережено; CRLF → точні байти генератора, check чистий; symlink усередині repo — запис у ціль, лінк лишився; symlink назовні → код 1, нічого не записано; ручний файл → код 1, дерево незмінне (включно з кешем).
  7. `OperationWorker`: map скасовано до commit → worker зупинено, нічого не записано; наступний — `beforeCommit` рівно раз і артефакти як у CLI.

Коміт: `9e95681` (Write the map through a shared plan-and-commit operation in CLI and TUI); лише файли 09, сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 494 tests, 493 pass / 0 fail / 1 skipped ✓ (перший прогін до регенерації карти мав 1 fail «committed keylang map is stale» — усунуто регенерацією); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 10–14, 30: писальна операція додається в `WRITING_KINDS`, викликає `context.beforeCommit` перед першим файловим кроком і повертає кроки з `state`; сесія сама відкладе аналіз і перезапустить його (`endCommit`). Worker-протокол (`commit`/`cancel`) уже загальний. Крок із цілями — `withSavedInputs(…, { writes, inputs })`.
- 35: `OperationWorker.close()` під час commit термінує worker — кожен файл атомарний, але звіт про записане губиться; діалог виходу має чекати поточного кроку. `q` під час commit ще не питає.
- 12 (init): `cmdInit` викликає новий `cmdMap`; його поведінка стала частиною цієї операції.

Припущення й залишки:
- Відмова через змінені входи/цілі — `failed` з кодом 1 (не 2: це конфлікт стану, не I/O).
- Межа repo для цілей карти — нова для CLI: раніше `writeFileSync` ішов за будь-яким посиланням. CRLF-контракт карти — точні байти генератора (як і раніше `writeFileSync`), не збереження CRLF як у ручних файлів.
- Кеш фактів тепер не пишеться при конфлікті (раніше писався під час генерації).
- Входи плану: config, джерела, briefs; `tsconfig`/`package.json`-резолвери (`resolverInputs`) повторно не перевіряються.
- Видалення порожньої теки вимкненої карти з поясненнями не записується в кроки.
- «Порівняння / reload / save-as» для dirty-буфера записаного файла не реалізовано: цілі карти — read-only, dirty-буфер цілі можливий лише в рідкісному випадку; його текст зберігається, повідомлення пропонує чинні `Ctrl+S` двічі / `Ctrl+Z`.
- Скасування посеред commit у справжньому worker окремим тестом не перевірено (порядок повідомлень недетермінований); кооперативний шлях перевірено в потоці сесії, handshake — через worker.
- Ручну TTY-перевірку наживо не виконано.

