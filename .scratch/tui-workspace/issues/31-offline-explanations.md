# 31: Показувати офлайн-пояснення діагностики й вузла

**What to build:** палітра та `e` відкривають зведення вузла/збережене пояснення, а діагностика — довідку свого коду без мережі.
**Blocked by:** [08 — виконання дискових read-only дій](08-background-map-check.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A16, A26.

## З чого почати

Знайти `cmdExplain`, `explainCode`, `summarizeNode`, `formatSummary`, `readExplanation`, `isStale`, `App.explain`/обробник `e`. Не змішувати doc-comment, brief і short/full answer.

## Кроки

1. Виділити офлайн-гілки explain у shared module: subject diagnostic-code або node-ID; результат типізований за видом.
2. Diagnostic-code не потребує snapshot/save-barrier; регістр K-коду обробляється як CLI.
3. Палітра для ID запускає свіжий дисковий запит після save-barrier. Швидкий `e` може зберігати чинний перегляд поточного analysis, але позначає overlay/outdated; предметне зведення будується тими самими функціями.
4. Вузол: kind/ID/signature, location, calls/dependencies, flows/rules, unresolved, saved answer з agent/date/detail/fresh|stale.
5. Немає збереженого answer — показати офлайн-зведення й доступну дію запиту пояснення, коли її додасть 32. Не викликати модель від `e`.
6. Unknown subject повертає чинну причину/suggestion; CLI human-вивід і код збережені.

## Перевірки

- K001 у різному регістрі, невідомий K-код: тексти/коди як CLI, жодної мережі.
- Відомий ID із doc-comment і saved answer: правильні походження й поля.
- Зміна коду робить answer stale; відсутній answer не є provider error.
- Локальний mock з лічильником запитів: офлайн-дiї завжди залишають його нульовим.

## Приймання

- [x] `e` не змінює свій офлайн-зміст.
- [x] Навігація за посиланнями веде до відомих ID/коду; невідомі ID не вигадуються.
- [x] Read-only звіти не пишуть explain/cache/stats.

**Межі:** індивідуальний LLM — 32, batch — 33–34.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Офлайн-гілки `keylang explain <code|id>` (без `--llm`) перенесено в спільну read-only операцію `explain`; CLI — принтер над нею; у TUI — форма в палітрі, звіт F6 з місцями для переходу, а `e` будує те саме предметне зведення з аналізу сесії.

- **`src/explain-offline.ts`** (новий, шар `features` у `keylang.json`) — `isDiagnosticCode` (регістр як у CLI: `/^k\d+$/i`), `codeExplanation` (код у верхньому регістрі + рядки `explainCode`), `nodeExplanation(analysis, id, detail)` → `NodeExplanation { summary, detail, saved, brief, links }` або `{ unknown, suggestion }`; `SavedAnswer { agent, date, lang, detail, text, fresh, unknownIds, file }` — збережена відповідь вибраного detail і окремо brief (не змішуються з doc-comment, який лишається в `summary.doc`); `ExplainLink` — розташування вузла, пов'язані ID лише там, де їх оголошує знімок чи `planned` (інакше `file: null`), потоки (`flow.span`), рядки правил. `offlineExplanationText` / `savedAnswerText` — stdout CLI байт у байт; `unknownIdMessage` — текст помилки CLI з `did you mean`.
- **`src/operations.ts`** — `ExplainRequest { kind: "explain", root, subject, detail? }`, `ExplainPayload = OfflineExplanation & { snapshotId, text }`; `runExplain`: код — без аналізу й конфігу (невідомий — failed 2 `unknown code \`x\``, як набрано); ID — `analyze({ withoutEvidence: true })` (без `persistFacts`), примітка про сховище 0.1 — `warning`, невідомий ID — failed 2 з повідомленням CLI; відсутня відповідь — completed 0. Не в `WRITING_KINDS` (Cancel зупиняє worker).
- **`src/cli.ts`** — `cmdExplain`: код (і з `--llm`) та ID без `--llm` — принтер над операцією (warning → stderr `keylang: note: …`, payload.text → stdout, помилка → `keylang: …`, 2). Гілки `--llm`, `--stale`, batch не переносилися (32–34); `show` у LLM-гілці тепер `savedAnswerText(savedAnswer(...))`. Байтову ідентичність stdout/stderr/кодів звірено зі збіркою HEAD (`git archive`) на 25 викликах: репозиторій (K001, k005, K999, `k104 --llm`, без аргументу, відомі/невідомі ID, шари), копія `tests/fixtures/repo` зі збереженою відповіддю, brief-ом, вигаданим ID і старим сховищем `.keylang/explain/` (без прапорців, `--brief`, `--full`, `--full --brief`, `--llm` без облікових даних, `--llm --brief`, `--stale`), `tests/fixtures/explained`, `keylang.json` з `format: 99`, тека без конфігу — усе SAME.
- **`src/tui/actions.ts`** — дія `explain` «Explain: a diagnostic code or an id, offline» (група Check; aliases `explain`, `keylang explain`, `explain code`, `explain id`, `diagnostic help`, `node summary`, `saved explanation`, `why`); недоступна в MERGE і під час іншої операції. Клавішу не вказано: `e` — швидкий перегляд, не ця форма.
- **`src/tui/state.ts`** — `Prompt.kind "explain"`.
- **`src/tui/app.ts`** — форма: типове значення — ID під курсором, інакше код діагностики рядка; список — коди `EXPLANATIONS` за префіксом або ID знімка сесії (`searchNodes`, точний збіг першим); примітка `K001: offline help of the code · reads nothing, saves nothing first` / `<id>: in the current snapshot|not in the current snapshot (did you mean …) · a fresh analysis of the saved code and specs · offline: no model, writes nothing`. `requestOperation`: код — одразу, без кроку збереження; ID — save-barrier для dirty-буферів під `<dir>/` і `keylang.json`. `recordGaps` — місця (`links`), Enter відкриває код/специфікацію. Outdated: зміна snapshot (`snapshotId`) і `inputsChanged` для ID (не для коду). `e` (`explainAtCursor`) — `nodeExplanation` над аналізом сесії: зведення, рядок походження `the session's analysis[ · with unsaved buffers (overlay)][ · outdated] · Ctrl+P Explain reads the saved files`, `saved <detail> answer · agent · date · fresh|stale`, `saved brief · …`, `unknown ids`; без відповіді — `no saved answer · offline: e asks no model …`; без відомого ID на рядку з діагностикою — довідка її коду (для невідомого ID — плюс `unknown id … (did you mean …)`).
- **`src/tui/view.ts`** — мітка `… · <subject>`, `operationLabel` `explain <subject>`, підсумок `K001: offline help` / `<kind> <id>: saved answer fresh|stale` / `no saved answer` · code; звіт F6: заголовок (`offline, no model, nothing written · saved code and specs · snapshot`), зведення під `── the snapshot and the specs (doc: is the code's documentation comment) ──`, `── saved answer · detail · agent · date · fresh|stale: the code changed since · file ──`, `── saved brief (the explained map) · … ──`, вигадані ID окремо, «places» (Tab/↑↓/Enter). Підказка заголовка F6 показує `e export` лише для експортованих записів.
- **`docs/tools.md`** — абзац «Explain у TUI»; оновлено опис `e`.
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; WIP `extract.md` байтово ті самі (sha1 і diff) до/після, не закомічено.
- **Тести** (`tests/tui.test.ts`, 2 нові; хелпери `explainForm`, `explainRecord`, `cliExplain`, `explainRepo` — `agent` у `keylang.json` + локальний mock Messages API з лічильником запитів, `storedExplanation`):
  1. Код: `e` на рядку з K001 (невідомий ID) — довідка = stdout CLI `explain K001` + `unknown id …`; dirty spec: форма з `k001` → `K001`, кроку збереження немає, буфер лишається dirty; payload.text = stdout CLI для `K001` і `k001`, `runOperation` з `k001` — те саме; F6; `K999`/`k999` — failed 2, CLI 2, порожній stdout, stderr = `keylang: <те саме повідомлення>`; `treeBytes` незмінний; запитів до моделі 0.
  2. ID `domain.order.create` з doc-comment, збереженою short-відповіддю (closure = поточний baseline) і brief-ом: `e` — зведення, `doc: Creates an order.`, обидва походження `fresh`, `unknown ids: domain.order.ghost`; палітра — типовий ID під курсором, payload.text = stdout CLI; поля saved/brief (agent, date, detail, fresh, file), відповідь не містить ні brief, ні doc-comment, CLI не друкує brief; links = `at src/domain/order.ts:2`, `called by application.purchase.buy  src/application/purchase.ts:3`, `flow checkout  keylang/flows/checkout.md:1`; F6 і Enter на місці відкриває `src/application/purchase.ts:3`; нічого не записано. Зміна коду + F5 → outdated, Enter → `fresh: false` для відповіді й brief-а, = CLI; `e` теж `stale`. Видалена відповідь → completed 0, без error, = CLI, F6 підказує `--llm`. `domain.order.creat` — failed 2 із CLI-повідомленням і `did you mean`; `qqq.zzz` у TUI — те саме повідомлення, що stderr CLI. Dirty spec → barrier `[checkout.md]`, Back нічого не пише й не запускає. Нових файлів немає; запитів до моделі 0.

Перевірки: `npm run typecheck` ✓; `npm test` 557 tests, 556 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓ (до прогону тестів — 24 unverified через застарілий `.keylang/reports/node-test.json`).

Коміт: `937fb8c` (Explain a code or an id offline through a shared explain operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 32: LLM-гілка `cmdExplain` ще в CLI; брати `nodeExplanation`/`savedAnswer`/`savedAnswerText` і додати окремий kind (запис у `<dir>/explain/` → `WRITING_KINDS`). У F6/`e` підказка `keylang explain <id> --llm` — місце для дії запиту.
- 33: `--stale`/`--missing` лишилися в CLI.
- 37: дія `explain` у каталозі; довгі рядки зведення/відповіді на вузькому екрані обрізаються.

Припущення й залишки:
- `detail` — поле запиту (CLI `--full`/`--brief`); TUI передає типовий (`explain.detail` конфігу), а brief показує окремо — CLI свого stdout не змінює.
- Підсумок у payload і stdout CLI — зі свіжого аналізу збережених файлів; `e` свідомо лишається на аналізі сесії (з overlay) і позначає це.
- Для невідомого ID на рядку з діагностикою `e` показує довідку коду діагностики, а не лише повідомлення.
- Експорт для explain не додано (тікет не вимагає); `e` у F6 над таким записом пояснює, що експортуються лише check/explain-edge/parse/trace-plan.
- Cancel окремим тестом не перевірено (той самий шлях read-only kinds у worker). Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `937fb8c`.
