# 26: Пропонувати потоки з файла або позиції вихідного коду

**What to build:** людина вибирає source-path і необов'язковий рядок та отримує algo-потоки як preview або proposal.
**Blocked by:** [22 — draft/proposal-шлях](22-algorithmic-flow-draft.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A12, A22.

## З чого почати

Знайти `cmdCodeToSpec`, `codeToSpec`, `withFlow`, функції snapshot lookup і code-view location. Перша версія цієї дії — file/line + algo, без since/model.

## Кроки

1. Виділити shared операцію з file, optional line, into?, output. У TUI line — окреме валідоване числове поле; не змушувати користувача набирати CLI-синтаксис.
2. Prefill із code-view або ID під курсором; за відсутності однозначного source — порожнє поле з вибором.
3. Викликати чинний `codeToSpec`: з line — відповідна функція, без line — набір експортованих функцій за чинним контрактом.
4. Поєднати кілька draft-потоків у target через той самий `withFlow`, зберігши existing text.
5. Preview read-only; proposal й concurrent-write policy повторно використовують 22. Результат називає всі запропоновані flow.
6. Перевести відповідну CLI-гілку на shared implementation; інші режими лишаються працездатними до 27.

## Перевірки

- Файл із двома експортами й однією приватною функцією: результати як CLI file-mode.
- Line усередині конкретної fn обирає ту саму ціль; невалідний рядок/не source дає пояснену помилку.
- Existing target із потоком і прозою не втрачає їх.
- Preview не пише; proposal створюється для показаного target і не змінює source.

## Приймання

- [x] Той самий algo-result для однакових входів CLI/TUI.
- [x] Параметри залишаються у формі після помилки.
- [x] Немає репозиторного пошуку коду або вигаданого call graph.

**Межі:** git diff та LLM/hybrid — 27.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Потоки з позиції коду — спільна операція `code-to-spec` (file, optional line, into, output preview|proposal, pending); CLI `code-to-spec <path[:line]>` в algo (і hybrid без моделі) — принтер над нею; у TUI — форма з палітри, preview/proposal у worker, F6-звіт і чинний MERGE.

- **`src/draft.ts`** — `codeToSpecTriggers(snapshot, file, line)` → `{ name, triggers }` (пошук позиції без чернеток, ті самі повідомлення CLI); `codeToSpec` тепер над нею (поведінка та сама).
- **`src/operations.ts`** — `CodeToSpecRequest { kind: "code-to-spec", root, file, line?, into?, output, pending? }` (типово `refuse`), `CodeFlow`, `CodeToSpecCandidate { file, line, name, flows, print, target, problem, before, pending, text }`, `CodeToSpecPayload { output, mode: "algo", candidate, summary: "N flow(s), M step(s)", proposal, refused, error }`; `codeToSpecCandidate` (ціль, `proposalProblem`, текст цілі й пропозиції, `withFlow` для кожного потоку по черзі). `runCodeToSpec`: аналіз без persist → немає знімка 2 → `codeToSpec` (рядок поза fn / не джерело / без експортів — 2 з повідомленням CLI, payload null) → preview 0 (ціль не потрібна; нечитабельна ціль — `problem`) → proposal: нечитабельна ціль — 2 з помилкою читання (payload є), `proposalRefusal(…, "code-to-spec")` → `commitProposal`. `proposalRefusal` отримав префікс команди. `code-to-spec` у `WRITING_KINDS`. Новий `CommitPlan { targets }`: `beforeCommit(plan?)`, `commitProposal` передає ціль.
- **`src/tui/operation-worker.ts`, `src/tui/background.ts`** — план commit передається з worker у `beforeCommit` сесії.
- **`src/cli.ts`** — `codeToSpecPrinter` (path відносно cwd, `--into` відносно кореня, `pending: "replace"`, аналіз передається через `context.analyze`; примітка fallback hybrid лише коли позиція назвала fn — як раніше). `--since`, llm, hybrid з моделлю, невідомий `--mode` — стара гілка до 27.
- **`src/tui/actions.ts`** — дія `code-to-spec` «Code to spec: flows from a source file or a line of it (algo)», група Generate (aliases `code-to-spec`, `code to spec`, `flows from code`, `propose flows`, …); недоступна в MERGE, на стартовому екрані й під час операції.
- **`src/tui/state.ts`** — `Prompt.kind "code-to-spec"`, `CodeDraftForm { file, line, into, output }`.
- **`src/tui/app.ts`** — форма: prefill із переглядача коду (`state.code.file/line`), інакше з ID під курсором (файл; для fn ще й рядок), інакше порожньо; рядки `file` (+ до 8 `src:<path>` файлів знімка з fn, Enter бере й переходить до line), `line` (лише цифри; порожній — усі експортовані fn), `target` (типове `<dir>/flows/<name>.md` поруч), `output` (←→), run. Примітка: `line N is in <fn>` / `K exported fn(s): …`. `codeDraftProblem`: порожній файл, рядок не від 1, помилка `codeToSpecTriggers` на знімку (поле file або line), для proposal — `proposalProblem`, наявна пропозиція, dirty ціль; відмова лишає форму з набраним і виділяє поле. `requestOperation`: barrier лише для dirty `keylang.json`. `commitGate(request, plan)` — dirty-буфер цілі з плану операції (для draft-flow/rules без плану — як раніше). `afterCodeDraft` — MERGE за правилом `stillWhereDraftStarted`, повідомлення називає всі потоки. F6 Enter на proposal → MERGE.
- **`src/tui/view.ts`** — мітки `code-to-spec <file>[:line] --mode algo[ --into][ --print]`, підсумок, F6: заголовок, режим позиції, кожен потік (`flow <name> · trigger … · N step(s)`), стан цілі, stdout `--print`, для preview — повний текст цілі; підказка `Enter open MERGE`.
- **`docs/tools.md`** — абзац «Потоки з коду в TUI (code-to-spec, algo)».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md` (рядок extract як у HEAD); WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +2; хелпери `codeRow`, `codeField`, `codeForm`, `codeRecord`, `cliCode`, фікстури `PURCHASE_TWO` — два експорти й приватна fn, `PURCHASE_SPEC` — проза, `# flow buy`, `# flow manual`):
1. Справжній worker: порожня форма, список файлів, вибір → рядок line, примітка про 2 експорти й типова ціль; цифри only, line 8 → `application.purchase.audit` і `keylang/flows/audit.md`; Esc нічого не пише. Preview файла = CLI `--mode algo --print` у двійнику байт у байт, потоки buy (4 кроки, з приватною audit) і refund, приватна fn не тригер; текст: проза, `buy` замінено на місці, `manual` збережено, refund дописано; дерево незмінне; F6. Line 8 = CLI `:8 --print`. Proposal = CLI байт у байт (stdout CLI `proposed \`buy\`, \`refund\``), ціль і джерело незмінні, лише файл пропозиції; MERGE відкрився сам; F6 Enter → MERGE; `a…w` → ціль = кандидат.
2. Операція в потоці сесії з хуком перед commit: prefill з ID під курсором і з переглядача коду (`src/application/purchase.ts`, `3`); line 1 → повідомлення CLI, форма з набраним, поле line; line 0 → відмова форми; `keylang.json` → `no function of the snapshot is declared here`, поле file; жодного запису; наявна пропозиція → відмова, байти ті самі; CLI замінює (= `--print`); dirty ціль → відмова, текст буфера цілий; ціль, змінена в сесії під час роботи → failed 1 з причиною від gate за планом операції, без пропозиції, файл цілі незмінний.

Перевірки: `npm run typecheck` ✓; `npm test` 546 tests, 545 pass / 0 fail / 1 skipped ✓ (перший прогін до перегенерації карти — 1 fail «generated maps of the repo», очікувано); `tests/draft.test.ts` (28) ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive` + WIP `src/extract/ts.ts`) на 30 сценаріях (файл/рядок, hybrid без моделі, algo, `--print`, рядок поза fn / 0 / 999, не джерело, неіснуючий файл, без експортів, `--into` поза `keylang/`, у `map/`, у наявний файл, тека з/без `--print`, CRLF-ціль, однойменні методи, невідомий `--mode`, llm без моделі, без аргументів, шлях + `--since`, наявна пропозиція, сховище-посилання назовні, зламаний `keylang.json`, підкаталог, agent без ключа) — stdout, stderr, код, дерево: 30/30 SAME.

Коміт: `c5a33ff` (Draft flows from a source file or line through a shared code-to-spec operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 27: `CodeToSpecRequest` — точка для `since` і `mode`; модельний шлях можна вбудувати як у `runDraftFlow` (`modelSetup(…, "code-to-spec")`, `draftFlowWithModel` з signal на кожну чернетку, `countProposed` після запису). Стара гілка `cmdCodeToSpec` (since, llm/hybrid з моделлю, невідомий mode) ще пише без `basis`.
- 28+/35: `CommitPlan { targets }` у `beforeCommit` — сесія бачить фактичні цілі commit; інші операції план поки не передають.

Припущення й залишки:
- TUI-форма лише algo, без рядка mode (межа тікета); CLI типовий hybrid без моделі йде через операцію з тією самою приміткою.
- Line у формі — від 1; операція, як CLI, приймає 0 (`no function holds this line`).
- Без знімка типова ціль у формі невідома (`<name>`): перевірки цілі робить операція, dirty-ціль ловить gate за планом.
- Prefill з ID під курсором для fn бере рядок її оголошення; для модуля — лише файл.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `c5a33ff`; критерії приймання перевірено тестами й порівнянням CLI з HEAD (30/30).
