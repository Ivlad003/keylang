# 22: Створювати алгоритмічну чернетку потоку через форму

**What to build:** користувач обирає trigger/name/target, переглядає чернетку або створює proposal та відкриває MERGE.
**Blocked by:** [09 — запис](09-map-write-and-commit-protocol.md), [21 — вибір proposal](21-proposal-picker.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A12, A14, A22.

## З чого почати

Знайти `cmdDraft`, `draftFlow`, `withFlow`, `writeProposal`, `proposalProblem`, `Assist.agentDraft`. Ця задача додає algo через палітру, не змінює зміст Ctrl+Space.

## Кроки й контракт

1. Виділити спільне обчислення algo-кандидата з поточного snapshot. Параметри: trigger, name?, into?, output preview/proposal.
2. Форма з пошуком callable ID, видимими name/target і root; trigger обов'язково fn, unknown має suggestion.
3. Saved-input barrier → worker → `draftFlow` → `withFlow` з цільовим дисковим текстом. Не замінювати весь файл лише новим flow, якщо він містить інші розділи.
4. Preview показує текст і summary, не пише proposal/stats/ціль. Proposal записує повний запропонований текст, а не патч.
5. Перед запуском TUI відхиляє наявну proposal для target і dirty-target. Shared writer приймає очікуваний стан proposal й target; поява/зміна під час роботи не перезаписується. Чинну поведінку CLI щодо вже наявної proposal не змінювати випадково: його очікуваний стан визначається на старті CLI-дії.
6. Після створення дати Open merge; автоматичне відкриття дозволене лише якщо початковий файл/режим/версія ще поточні. Інакше лише повідомлення й запис у списку.

## Перевірки

- Callable з двома досяжними викликами: algo-text і combined target як у CLI.
- Existing target з іншим flow збережений у candidate; до w target byte-for-byte незмінний.
- Preview: inventory усього repo однаковий, включно зі stats.
- Existing або щойно створена proposal, changed target, невідомий trigger: жодної втрати тексту.

## Приймання

- [x] Кандидат типізований і містить первісну ціль/expected text для подальшого запису.
- [x] MERGE використовує існуючий механізм, не другий diff-editor.
- [x] CLI algo викликає спільне обчислення, його нормальний вивід збережений.

**Межі:** LLM/hybrid і Ctrl+Space інтегрує 23.
**Validation:** `npm run typecheck`, `npm test`; карта/правила після виділення оркестрації.

## Result

Алгоритмічна чернетка потоку — спільна операція `draft-flow`; CLI `draft flow --mode algo` (і `hybrid` без моделі) — принтер над нею; у TUI — форма з палітри, preview/proposal у worker, F6-звіт і перехід у чинний MERGE.

- **`src/proposals.ts`** — `ProposalBasis { target, proposal }` (стан цілі й пропозиції, з яких побудовано кандидата), `proposalWriteProblem(root, path, basis)` (ціль created/changed/removed; пропозиція created/changed через `writeProblem(… expect)`; кожна причина з назвою файла), `writeProposal(root, path, text, basis?)` — з `basis` пише лише поки обидва стани ті самі (`safeWrite` з `expect`). Без `basis` — чинна поведінка (MCP, spec-to-code, code-to-spec, LLM-шлях `draft`).
- **`src/operations.ts`** — `DraftFlowRequest { kind: "draft-flow", root, trigger, name?, into?, output: preview|proposal, pending?: refuse|replace }` (типово `refuse`), `FlowCandidate { trigger, name, steps, flow, target, problem, before, pending, text }`, `DraftFlowPayload { output, candidate, summary, proposal, refused, error }`; `flowCandidate(...)` — ціль за CLI-правилом, `proposalProblem` до читання, текст цілі (тека/нечитабельне — помилка, не null), пропозиція, що чекає (лише якщо сховище проходить `writeProblem`), `withFlow`. `runDraftFlow`: аналіз без `persistFacts` → немає знімка / не fn (з `did you mean`) — failed 2 з CLI-повідомленням; preview — completed 0, нічого не пише; proposal: проблема цілі — 2 (`draft: <target>: …`), сховище-посилання назовні — 2 (`.keylang/proposals/…: …`), `refuse` + наявна пропозиція — failed 1; `beforeCommit` → signal → повторно `proposalProblem` + `proposalWriteProblem` (failed 1, нічого не записано) → `writeProposal(…, basis)` (2 при I/O). `proposals` конверта = `[.keylang/proposals/<target>]`, `written` порожній (ціль не пишеться). `draft-flow` у `WRITING_KINDS`.
- **`src/cli.ts`** — `draftFlowAlgo` (принтер, `pending: "replace"`; для hybrid-fallback передає вже готовий аналіз через `context.analyze`); LLM-шлях `cmdDraft` лишився як був, лише без мертвої algo-гілки. Байтова ідентичність зі збіркою HEAD (`git archive`) на 16 сценаріях — stdout, stderr, код і все дерево: algo proposal, `--print`, `--print` з поганим `--into`, невідомий trigger (з hint), без trigger, `--into` поза `keylang/`, у `map/`, у наявний файл з іншим/тим самим потоком, hybrid без моделі (примітка + algo), `--mode llm` без моделі, наявна пропозиція (замінюється, як і раніше), `.keylang/proposals` — посилання назовні, зламаний `keylang.json`, запуск із підкаталогу, CRLF-ціль — усе SAME.
- **`src/tui/actions.ts`** — дія `draft-flow` «Draft flow: from the code's calls (algo)», група Generate (aliases `draft flow`, `keylang draft flow`, `draft --mode algo`, `flow draft`, `propose flow`, `algo`); недоступна в MERGE, на стартовому екрані й під час операції.
- **`src/tui/state.ts`** — `Prompt.kind "draft-flow"`, `DraftForm { trigger, name, into, output }`.
- **`src/tui/app.ts`** — форма: рядки `trigger` (типово fn під курсором або `trigger` потоку під курсором), до 8 callable ID із підрядком (`fn:<id>`, Enter бере й переходить до name), `name`/`target` з типовими значеннями CLI поруч (`<name>` до вибору trigger), `output` (`←→`), рядок запуску; `details` — корінь. Примітка: fn/не fn із suggestion, `exists: its other sections are kept` / `is a new file`, причина відмови. `draftProblem` до запуску: порожній або не-fn trigger (при наявному знімку), для proposal — `proposalProblem`, наявний запис у `.keylang/proposals/<target>` (lstat, тож і посилання), dirty буфер цілі; відмова лишає форму з набраними значеннями й виділяє поле. `requestOperation`: barrier лише для dirty `keylang.json`. `afterDraft`: MERGE відкривається сам лише якщо файл/режим/`version` буфера з моменту старту операції ті самі й не відкрито MERGE/форму/barrier/F6/help; інакше повідомлення `… waits: m, Proposals or Enter in F6 opens MERGE`. F6 Enter на записі зі створеною пропозицією — `merges.open(target)` (чинний MERGE, пропозиція перевіряється заново).
- **`src/tui/view.ts`** — мітка запису `… · proposal|preview · <trigger>`, `operationLabel` `draft flow <trigger>[ --print]`, підсумок (`N step(s), preview, nothing written` / `N step(s) proposed for <target>` / `refused, nothing written` / `write failed`), звіт F6: заголовок, повідомлення, стан цілі, примітка про нерозв'язані виклики, підказка Enter → MERGE, `── keylang draft flow <trigger> --print · stdout ──` і для preview — повний запропонований текст цілі; підказка заголовка F6 `Enter open MERGE`; форма `draft flow: `, `draft flow · algo`.
- **`docs/tools.md`** — абзац «Чернетка потоку в TUI (algo)».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; ці файли = карта чистої копії HEAD + зміни 22, крім WIP-рядка extract у README (уже був у HEAD, як у 09); WIP `extract.md` байтово ті самі (sha1 і sha1 diff) до/після, не закомічено.
- **Тести** (`tests/tui.test.ts`, 2 нові; хелпери `draftRow`, `draftField`, `draftForm`, `draftRecord`, `cliDraft`, фікстура `BUYING_SPEC`):
  1. Справжній worker. Форма: без потоку під курсором trigger порожній; `target (default keylang/flows/<name>.md)`, корінь у `details`; `purchase.b` → один збіг `fn:application.purchase.buy`, примітка з причиною; Enter на збігу → trigger і рядок name, `(default buy)`, `keylang/flows/buy.md is a new file`; Esc нічого не пише. Preview у `buying.md` (проза + інший потік): completed 0, `candidate.flow` = stdout CLI `--print` у двійнику, steps — trigger + 2 виклики, `before` = диск, текст починається з наявного файла й закінчується потоком; `treeBytes` незмінний (ні пропозиції, ні stats). F6 — заголовок, підсумок, обидва блоки тексту. Proposal: completed 0, `proposals` = сховище, stdout CLI у двійнику як раніше, пропозиція = CLI байт у байт = `candidate.text`, ціль байтово та сама, новий файл — лише пропозиція; MERGE відкрився сам на цілі; Esc → ціль незмінна; F6 `Enter open MERGE` → той самий MERGE; `a`… `w` → ціль = кандидат, пропозиція прибрана.
  2. Операція в потоці сесії з хуком перед commit. Типовий trigger — потоку під курсором; невідомий `application.purchase.buyy` → форма лишається з текстом, поле trigger, `did you mean application.purchase.buy`, жодного запису; наявна пропозиція → відмова до запуску, байти пропозиції ті самі; CLI у тому самому repo замінює її, як і раніше (код 0, текст = `--print`); dirty ціль → відмова, текст буфера збережено; пропозиція, що з'явилася під час роботи → failed 1, `created on disk while the proposal was prepared`, чужа пропозиція ціла; ціль, що з'явилася під час роботи → failed 1, новий текст цілі цілий, сховища немає; відкритий під час роботи F6 → пропозиція створена, MERGE не відкрито, повідомлення `waits`; повторна чернетка в ту саму ціль (щойно створена пропозиція) → відмова, пропозиція й ціль байтово ті самі.

Коміт: `3352e60` (Draft a flow algorithmically through a shared draft-flow operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 530 tests, 529 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; `tests/draft.test.ts` (25) окремо ✓; порівняння CLI з HEAD — 16/16 SAME.

Передано наступним задачам:
- 23: `DraftFlowRequest`/`FlowCandidate`/`writeProposal(…, basis)` — точка для LLM/hybrid: модельний draft замінює `draftFlow` у тій самій операції, `counts` → stats лише для proposal; LLM-шлях `cmdDraft` і `Assist.agentDraft` (Ctrl+Space) ще окремі й пишуть без `basis`. `afterDraft` — правило автовідкриття MERGE для модельного результату.
- 24/26/28: політика `pending: refuse|replace` і `ProposalBasis` придатні для rules/code-to-spec/spec-to-code proposals; перевірку «pending proposal блокує ціль» у TUI (`proposalWaiting`, `draftProblem`) варто винести, коли з'явиться другий caller.
- 35: відкладений commit draft-flow — один файл, `Cancel` після `beforeCommit` нічого не зупиняє посеред запису (атомарний).

Припущення й залишки:
- Preview у TUI дозволено й за dirty цілі чи наявної пропозиції (нічого не пише; кандидат — відносно диска); обидві відмови діють лише для proposal.
- Barrier відкривається лише для dirty `keylang.json`: чернетка не читає інших специфікацій, крім знання, що ціль згенерована; dirty ціль відхиляється, а не зберігається.
- Невідомий trigger відхиляє форма лише коли є поточний знімок; без знімка вирішує операція (failed 2 з CLI-повідомленням).
- Для CLI очікуваний стан — прочитаний на старті дії (`replace`), тож зміна між читанням і записом у CLI тепер failed 1 (раніше перезапис); у звичайному запуску вікно — мілісекунди, на 16 сценаріях вивід не змінився.
- `withFlow` і CRLF — чинна поведінка; пропозиція пишеться через `safeWrite` (CRLF наявного файла пропозиції зберігається, як і раніше).
- Запис preview не стає outdated за зміною знімка (лише rerun). Cancel окремим тестом не перевірено. Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `3352e60`; критерії приймання перевірено тестами й порівнянням CLI з HEAD.
