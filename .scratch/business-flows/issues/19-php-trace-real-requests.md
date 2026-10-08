# 19: Trace на реальних запитах і інтеграційних тестах (PHP/Magento, TS, Python, Rust)

**Status:** resolved

**Type:** code

**Blocked by:** 09; поза фічею — review-2026-10-06/16, 17 (буфер до exit, fork)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Статика на Magento завжди матиме дірки; trace показує, що справді виконалось.

Передумова поза цією фічею: тікети `review-2026-10-06` 16 і 17 (буфер до exit, fork).

- `trace-plan` для точки входу (`keylang trace-plan --entry <id>`): що інструментувати.
- Для кожного trace-адаптера (`src/adapters/trace.ts`, `adapters/python`, `adapters/rust`, `adapters/php`) — спосіб прив'язати запит до флоу (заголовок/кука `X-Keylang-Flow` або змінна середовища). Адаптер `adapters/php` для Magento integration tests (`dev/tests/integration`) і для запитів на локальному стенді (`auto_prepend_file` + заголовок/кука `X-Keylang-Flow: <flow>`, щоб span-и потрапили в потрібний run).
- `draft flow --from-trace <run>`: чернетка флоу зі спостережених викликів (кроки, яких static не бачив, позначені `via trace`).
- Документація: рецепт «записати флоу оформлення замовлення з браузера».


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] фікстура PHP з DI-подібним викликом: static — дірка, trace — `ok`
- [x] draft з trace дає крок, якого немає в static
- [x] docs/semantics.md, adapters/php/README

**Межі:** продакшн-трасування з семплюванням — окремо.

## Comments

### 2026-10-08 — реалізовано

- `keylang trace-plan --entry <id> [--name <flow>]` (`src/trace-plan.ts`, `entryTracePlan`/`reachableFrom`): той самий JSON схеми 1 для fn, досяжних з точки входу. Де досяжна fn має нерозв'язаний виклик, план розширюється: fn з тим самим іменем, що й викликане, і fn, прочитані як значення (`escapes`) у файлах досяжних fn чи їхніх імпортів. Припущення: надмірне наближення краще за пропущений доказ (саме нерозв'язані виклики trace і має показати).
- Запуски на запит (JSONL схема 1 без нових полів): запит — окремий `runId` (`<run>.r<N>`, у PHP `<run>.r<hex>`), власний `clockId` і власний запис `run`; процес, усі span-и якого належали запитам, свого `run` не пише. TS: `withFlow(name, fn, testId?)` з `keylang/trace` (AsyncLocalStorage), адаптер TS тепер читає й `KEYLANG_TRACE_PLAN`; Python: `keylang_trace.flow(name, test=None)` (contextvars; під обгорткою модуль доступний як `keylang_trace`); Rust: `keylang_trace::flow(name, || …)` і `keylang_trace::in_flow(name, future)`; PHP: `X-Keylang-Flow` із `$_SERVER['HTTP_X_KEYLANG_FLOW']`, інакше `$_COOKIE`, інакше `KEYLANG_FLOW`, ID тесту `<METHOD> <шлях>`; веб-запит без назви потоку нічого не пише. `KEYLANG_FLOW` — потік запуску процесу в усіх адаптерах.
- Зміна контракту: `KEYLANG_TRACE_TEST` у TS/JS, Python і Rust тепер необов'язковий (типово — командний рядок); у PHP його заміняє `KEYLANG_FLOW` або назва потоку запиту. Повідомлення про відсутній `KEYLANG_TRACE_FLOW` у TS згадує `KEYLANG_TRACE_PLAN`.
- `keylang draft flow --from-trace <file.jsonl> [--run <runId>] [--name] [--into] [--print]` (`draftFlowFromTrace` у `src/draft.ts`, `fromTrace` у `DraftFlowRequest`): тригер — перший кореневий span, вкладення — дерево span-ів, порядок — старт; крок без шляху розв'язаних викликів від батька позначено `<!-- keylang:trace via observed -->`; без `--run` і кількох запусків — код 2 з переліком.
- Документація: `docs/cli.md` (план `--entry`, розділ «Запити, сценарії й чернетка з trace» з рецептом для Magento з браузера, Express/Next, FastAPI/Django, axum), `docs/semantics.md` (запуск запиту), `adapters/{php,python,rust}/README.md`.
- Тести: `tests/trace-requests.test.ts` — `trace-plan --entry`; TS-сервер з двома одночасними запитами двох потоків → два запуски без змішування, `check` — `trace ok`; `draft flow --from-trace` на записаному TS-запуску з викликом через значення → крок із позначкою, `check` — `static unverified`, `trace ok`; Python `flow()` на двох потоках і `KEYLANG_FLOW`; Rust `flow()` на двох потоках і `in_flow`; PHP DI-фікстура (план, trace у форматі адаптера, чернетка, `check`: static — дірка, trace — ok) без php; справжній `php -S` з `auto_prepend_file`, заголовком і кукою — пропускається без php (у цьому середовищі php немає, тож цей тест тут не виконувався).
