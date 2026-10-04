# 34: Виконувати пакетні LLM-пояснення з прогресом і частковим результатом

**What to build:** missing/stale batch створює brief-и у визначеному порядку, зберігає успішні й дозволяє продовжити після збою або Cancel.
**Blocked by:** [32 — одиночний LLM explain](32-single-model-explanation.md), [33 — batch-plan](33-explanation-inventory-estimate.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A17, A22–A25.

## З чого почати

Знайти `runBriefs`, `BatchResult`, `planBriefs`, `explanationRequest`, wave-логіку та `cmdExplainBatch`. Поточний batch зберігає кожний успішний brief відразу.

## Кроки й контракт

1. Додати shared batch operation missing/stale, limit, jobs, dryRun. На справжній запуск повторно побудувати актуальний план, не застосовувати давній preview мовчки.
2. Прокинути AbortSignal у запити та планувальник. Нові jobs не стартують після Cancel; вже активні abort; уже записані briefs залишаються.
3. Зберегти waves bottom-up: батьківські промпти бачать успішні briefs дітей, а jobs обмежує паралелізм усередині wave.
4. Перед записом кожного brief перевірити input/closure та expected stored answer. Якщо джерела batch змінилися, не починати наступні запити, показати outdated/partial із уже записаним.
5. Progress несе done/total/current ID; payload містить done, failed з причинами й skipped/not-started. Update історії не відкриває її примусово.
6. Зберегти CLI-коди: завершений batch з per-node failures — 1 (у чинному runBriefs сюди входить і помилка запису окремого brief); fatal setup/I/O до batch — 2. Cancel — окремий сесійний стан, не 0. Тип причини й фактичні записи видимі незалежно від коду.
7. Повторний запуск планує лише відсутні/застарілі briefs; successful fresh entries не запитуються знову.

## Перевірки

- Mock із трьома waves та jobs=2: максимум два активних запити в wave, батьківський prompt містить успішні дитячі briefs.
- Один вузол завершується provider/write error: решта виконується, completed/failed і код 1 як CLI.
- Cancel після першого запису: перший brief лишився, pending не записані, стан cancelled; повтор не питає fresh заново.
- Source/explanation змінено під час batch: нові байти не затерті, partial/outdated не позначено success.

## Приймання

- [x] Dry-run досі не пише й не звертається до мережі.
- [x] Немає завершення worker посеред атомарного файлового запису.
- [x] Частковий результат правдивий, Ctrl+S/Esc/resize не гублять буфери.

**Межі:** зберегти спеціальний чинний batch-код 1; A25 для загальних багатофайлових записів не є дозволом змінити публічний CLI-контракт batch.
**Validation:** `npm run typecheck`, `npm test`; усі requests через локальні mocks.

## Result

`keylang explain --missing|--stale --llm [--limit N] [--jobs N]` перенесено в спільну записувальну операцію `explain-batch` (у `WRITING_KINDS`); CLI — принтер над нею; у TUI — дія «Explain briefs with the model: the missing or stale batch, bottom-up» і рядок `batch` у формі «Explanations to do». `runBriefs`/`BatchResult`/`writeExplanation` видалено.

- **`src/operations.ts`** — `ExplainBatchRequest { kind: "explain-batch", root, batch, limit?, jobs? }`; `ExplainBatchPayload { batch, limit, jobs, agent, lang, plan, done[{id,file}], failed[{id,reason}], notStarted, stopped: null|cancelled|outdated|refused, refused, snapshotId, text }`; `OperationProgress { text, step?: BatchStep { done, total, id, failed } }` (тип `onProgress`). `runExplainBatch`: limit/jobs як CLI (2) → свіжий аналіз (`withoutEvidence`) → примітка сховища 0.1 — warning → без snapshot 2 з текстом CLI → план `briefPlan` (заново, не preview; порожній — completed 0 `nothing to explain`, модель не потрібна) → немає моделі — 2 з причиною → фіксація `sourceInputs`, `specHashes`, байтів кожного запланованого brief-файла → хвилі bottom-up, у хвилі ≤ `jobs` запитів, `briefs` у пам'яті поповнюються лише після запису (батько бачить успішні brief-и дітей) → `complete(…, { signal })` (signal = Cancel ∪ внутрішня зупинка) → порожня відповідь — помилка вузла → `beforeCommit({ targets: усі brief-файли })` один раз перед першим записом (відмова → stopped `refused`, 1) → перед кожним записом `writeProblem(expect: байти плану)` (змінений/створений brief — помилка лише цього вузла, новіші байти лишаються) + `sourceInputProblems`/`specProblems` (зміна → stopped `outdated`, активні запити закрито, нових немає, 1) → `writeAtomic` (I/O — помилка вузла). Коди: до кінця плану — 0 або 1 з per-node failures (виняток CLI batch, зокрема помилка запису окремого brief-а); outdated/refused — failed 1; Cancel — cancelled/null з payload (записане перелічено). `written` — фактично записані файли.
- **`src/explain-llm.ts`** — без `runBriefs`, `BatchResult`, `writeExplanation` (і їх імпортів); **`src/explain-inventory.ts`** — коментар модуля.
- **`src/cli.ts`** — гілка `--llm` у `cmdExplainBatch` → `runOperation({ kind: "explain-batch" })`; `onProgress.step` → stderr `[k/n] <id>[: failed: …]`; warnings → stderr; payload null → `keylang: <error>` 2; stopped → причини `keylang: …` у stderr; код 0/1. Прибрано `noteOldExplanations` і непотрібні імпорти.
- **`src/tui/operation-worker.ts`, `src/tui/background.ts`** — прогрес передає `step`.
- **`src/tui/actions.ts`** — дія `explain-batch` (aliases `explain --missing --llm`, `explain --stale --llm`, `brief batch`, …), недоступна в MERGE і під час операції.
- **`src/tui/app.ts`** — `openExplainPlanPrompt("batch")` відкриває форму на рядку `batch` зі списком missing і ленивим `llmSetup`; рядок `batch` для brief-планів (примітка: команда CLI, `asks <agent> once a brief` або причина, jobs, каталог); `explainBatchRequest`/`explainBatchAsk`; Enter на `batch` → `explain-batch`. `requestOperation`: save-barrier для `<dir>/` і `keylang.json` (крок називає `<dir>/explain/brief/<id>.md of each planned node`). `commitGate`: dirty буфер brief-а → refused. Outdated: `inputsChanged` і зміна snapshot. `recordGaps`: вузли плану з місцем і станом.
- **`src/tui/view.ts`** — `explainBatchLabel` (`explain --missing --llm --limit 2 --jobs 2`), `explainBatchOutcome` (`6 of 6 brief(s) written` / `partial: …, 1 failed` / `cancelled: …, N not started` / `outdated, stopped: …` / `refused: …`), експортований `batchState`; звіт F6: заголовок (команда, lang, agent, snapshot), підсумок, пояснення зупинки, причини, лічильники, вузли за рівнями зі станом `written <file>` / `failed: <reason>` / `not started`; Tab/Enter відкриває код. Рядок плану 33 тепер «the batch (the form's last row, or keylang explain --missing --llm) plans again…»; заголовок форми «explanations to do · only the batch row asks the model and writes».
- **`src/tui/state.ts`** — коментар рядків форми.
- **`docs/tools.md`** — CLI-абзац batch (перевірка перед записом, outdated, порожня відповідь, код 1 і для запису окремого brief-а); абзац «Пакетні пояснення в TUI»; виправлено «batch іде в CLI» в абзаці 33.
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md` і `map-explained/README.md`; WIP `extract.md` байтово ті самі (sha1 і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +2; хелпери `askedId`, `explainBatchForm`, `explainBatchRecord`, `cliExplainAsync`; модель — `heldModel`):
1. Форма з jobs 2: примітка; 0 запитів; dry run з тієї ж форми = CLI `--missing --dry-run --jobs 2`, дерево незмінне, 0 запитів. Batch на checkout-фікстурі (3 хвилі × 4 вузли): після двох запитів третій не стартує; у кожному раунді ≤ 2 активних (max = 2); порядок fn → module → layer; промпт `application.purchase` містить `Brief of application.purchase.buy.`, шар — brief модуля; невдалий brief у промпт батька не потрапляє. Brief checkout не записується (тека на місці файла): completed 1, `failed = [{checkout, "<file>: a directory"}]`, 11 записано, `written` = done, stdout = формат CLI, файл з provenance і closure; `state.briefs` бачить нові; поза `keylang/explain/` нічого не змінилось; прогрес `k/12 · id`; F6 сам не відкривається; звіт F6, Enter відкриває код. CLI на тому ж стані: 1, той самий рядок failed, `[1/1] …: failed: …` у stderr. Після звільнення шляху повтор у TUI питає лише checkout (0), CLI потім — `nothing to explain`.
2. jobs 1: після першого запису Ctrl+S у буфері spec — «is writing files … stays in the buffer», resize/Esc нічого не гублять; Cancel під час другого запиту → cancelled/null, `done = [buy]`, `notStarted` = 11 у порядку плану, з'єднання закрито, у теці лише перший brief, нових запитів немає; F6 і повідомлення `cancelled: 1 of 12 …`. Потім Ctrl+S зберігає. Повтор не питає buy, записує 11 (0). Через `runOperation`: зміна `src/domain/order.ts` під час запиту → failed 1, `outdated`, `refused = [src/domain/order.ts: changed on disk while the batch was computed]`, 0 записів, нового запиту немає, нові байти джерела лишились; brief, створений під час запиту (limit 1) → completed 1, вузол failed `created on disk while the change was prepared; nothing written`, файл не затерто.
Оновлено тест 33: рядки форми плану тепер `list, limit, jobs, run, batch`.

Перевірки: `npm run typecheck` ✓; `npm test` 562 tests, 561 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive`) з локальним mock-процесом на 8 сценаріях (missing jobs 1, повтор, limit 2, тека на місці brief-а, stale після зміни коду, без ключа, `--jobs 0`, сховище 0.1) — stdout, stderr, код і дерево: 7/8 SAME; у сценарії сховища 0.1 stdout/код/дерево ті самі, а примітка `keylang: note: …` у stderr тепер іде після рядків прогресу, не перед ними.

Коміт: `bdfe5c5` (Run brief batches through a shared explain-batch operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 35: batch — довга операція з `committing` від першого запису до кінця: збереження й аналіз сесії відкладені весь цей час (Ctrl+S каже повторити); Cancel під час commit — повідомлення worker-у, результат містить фактичні записи; quit під час batch має чекати результату так само, як для інших commit.
- 37: дія `explain-batch` у каталозі; довгі рядки F6/примітки обрізаються на вузькому екрані.

Припущення й залишки:
- Dry-run лишився `explain-plan` з `estimate` (той самий спільний шар), а не прапорцем `explain-batch`: payload плану й batch різні, CLI маршрутизує `--llm --dry-run` туди, як і раніше.
- Порожня відповідь моделі тепер помилка вузла (раніше записувався порожній brief); зміна вхідних файлів під час batch тепер зупиняє його з кодом 1 (раніше brief-и писались на старі входи). Звичайний вивід CLI не змінився.
- Вузол, чия відповідь прийшла після зупинки (Cancel/outdated), — `notStarted`, а не `failed`.
- `beforeCommit` питається один раз перед першим записом, а не перед кожним brief-ом: протокол worker-а має один commit на операцію; dirty буфер brief-а, відкритий уже після цього, зберігає текст і називається `endCommit`.
- Перевірка входів перед кожним записом хешує всі джерела: O(brief-и × джерела) для великих репозиторіїв.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `bdfe5c5`; критерії приймання перевірено тестами TUI з локальними mocks і порівнянням CLI з HEAD (7/8 SAME, різниця — лише порядок примітки сховища 0.1 у stderr).
