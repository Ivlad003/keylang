# 28: Пропонувати шаблон коду й тестів для planned fn

**What to build:** автор обирає planned fn та отримує окремі code/test candidates, їхні diff і результати перевірки кандидата.
**Blocked by:** [22 — proposals і saved-operation flow](22-algorithmic-flow-draft.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A13, A14, A22.

## З чого почати

Знайти `cmdSpecToCode`, `specToCode`, `codeProposalProblem`, `safeWriteAll`, code/test proposal-тести. Не трактувати наявність stub як реалізовану фічу.

## Кроки

1. Виділити shared algo scaffold operation з planned ID, into?, output preview/proposal; предметний candidate зберігає before/after кожної цілі, tests, verdicts, diagnostics і notes.
2. Форма пропонує тільки придатні planned fn; existing implemented ID відхиляється з місцем реалізації.
3. Викликати існуючий `specToCode`, показати список code/test цілей і diff окремо для кожної.
4. Позначити оцінку кандидата як preview, не поточний workspace verdict і не feature done.
5. Preview не пише. Proposal-mode валідує весь набір цілей перед першим записом, зберігає окремі повні proposals. Частковий I/O-збій звітує записані proposals.
6. Наявні/пізні proposals не перезаписуються непомітно; користувач може відкрити будь-яку через 21. Підтримати порожні нові батьківські каталоги лише при реальному записі.

## Перевірки

- Planned fn із сигнатурою і test bindings: ті самі code/test texts і notes, що CLI algo.
- Implemented ID та непридатне розширення/target → помилка без записів.
- Кілька tests: список має кожну ціль; їх можна зливати незалежно.
- До MERGE source/test targets не змінені; preview не створює proposals/stats.

## Приймання

- [x] Немає самостійного переписування scaffold-алгоритму в TUI.
- [x] Код і тест показані як code-proposals, не Markdown-буфери.
- [x] Фіча не отримує готовність від самого створення кандидата.

**Межі:** модельна реалізація — 29, apply-all — 30; чинний CLI --apply до міграції лишається працездатним.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Шаблон коду й тестів для planned fn — спільна операція `spec-to-code` (id, into, output preview|proposal, pending); CLI `spec-to-code <id> [--into] [--print]` без `--apply`/`--mode llm` — принтер над нею; у TUI — форма з палітри та `g` на planned-прогалині звіту фічі, preview/proposal у worker, F6-звіт з окремими цілями, чинний MERGE для кожної code-пропозиції.

- **`src/spec-to-code.ts`** — `plannedCodeTarget(analysis, id, into?)` → `{ file, name, signature } | { error, field: "id" | "into" }`: перевірки `specToCode` до читання файла (не planned з `did you mean`, не fn, implemented з `file:line`, `deny` потоку → id; файл не того модуля, шар без одного кореня, `codeProposalProblem` → into); `specToCode` тепер над нею (ті самі повідомлення). `specToCodeText(candidate)` — stdout `--print`; `fileDiffText(file)`.
- **`src/operations.ts`** — `SpecToCodeRequest { kind: "spec-to-code", root, id, into?, output, pending?: refuse|replace }` (типово refuse), `CodeProposalTarget { role: code|test, file, before, after, pending, diff }`, `SpecToCodeCandidate { id, targets, testNotes, verdicts, diagnostics, print }`, `SpecToCodePayload { output, mode: "algo", candidate, summary, proposals, refused, error }`. `runSpecToCode`: аналіз без persist → немає знімка 2 → `specToCode` (помилка 2, payload null) → preview 0 (нічого не пише) → proposal: увесь набір до першого запису (`codeProposalProblem` 2, сховище 2, будь-яка pending під refuse → 1 з назвою кожної) → `beforeCommit({ targets })` → свіжість кожної цілі й пропозиції (`proposalWriteProblem`), `keylang.json`, джерел (`sourceInputProblems`) і рукописних специфікацій → по черзі `writeProposal(…, basis)`; Cancel/I/O посередині — cancelled/failed 2 з `proposals` = вже записані й `proposed before it stopped: …`. Stats не оновлюються. `spec-to-code` у `WRITING_KINDS`.
- **`src/cli.ts`** — `specToCodePrinter` (pending replace); старий шлях лишився для `--apply` і `--mode llm`, stdout через `specToCodeText`.
- **`src/tui/actions.ts`** — дія «Spec to code: a stub and failing tests for a planned fn (template)», група Generate; `matchActions`: дія, чия назва/alias містить запит дослівно, іде перед дією лише зі збігом слів (`spec to code` vs «Code to spec»).
- **`src/tui/state.ts`, `app.ts`** — `Prompt.kind "spec-to-code"`, `SpecCodeForm { id, into, output }`; рядки id (+ до 8 `planned:<id>` — лише planned fn без коду), target (типовий файл модуля поруч), output, run; prefill з planned ID під курсором; `specCodeProblem` через `plannedCodeTarget` + pending для code-файла; barrier — dirty `keylang.json` і специфікації; `commitGate` за планом цілей; `afterSpecCode` — MERGE на файлі коду за `stillWhereDraftStarted`, повідомлення про тести, що чекають; F6 Enter → список пропозицій (`openProposals(prefer)`); `g` на planned-прогалині feature-запису відкриває форму з ID (підказка `· g: spec-to-code`).
- **`src/tui/view.ts`** — мітки `spec-to-code <id>[ --into][ --print]`, підсумок, F6: кожна ціль (`code`/`test`, new file/append, стан пропозиції), «a preview of check; not the workspace's verdict, and not the feature done», stdout `--print`; підказка `Enter pick a proposal`.
- **`docs/tools.md`** — абзац «Код із planned fn у TUI (spec-to-code, шаблон)».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; у чистій копії HEAD ці файли ті самі (рядок extract README — як у попередньому HEAD); WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +2; хелпери `specRow`, `specForm`, `specRecord`, `cliSpec`, `specRowOf`, фікстура `REFUND_PLAN` — planned fn нового модуля, два TS-тести й один Python):
1. Справжній worker: форма зі списком planned, Enter → id і рядок target з типовим файлом; Esc нічого не пише. Preview = CLI `--print` у двійнику байт у байт, примітки = stderr CLI, 3 цілі (code + 2 tests), дерево незмінне, вердикт `ID` workspace лишився `unverified`; F6. Proposal: 3 окремі пропозиції = CLI байт у байт, лише вони нові; MERGE на коді; до MERGE ні коду, ні тестів; F6 Enter → список на коді → злиття одного тесту не чіпає інших цілей, їх пропозиції чекають.
2. Операція в потоці сесії з хуком: implemented ID — відмова форми з місцем (= stderr CLI), файл іншого модуля і `.txt` — поле target (= CLI); pending для коду — відмова форми; pending для тесту — failed 1, нічого не записано, CLI замінює; тестовий файл, створений під час роботи — failed 1; нечитабельне сховище тестів — failed 2, записано лише код, названо; `g` на planned-прогалині фічі → форма → пропозиція; фіча лишається не done (код 1).
- Оновлено очікування чинного тесту «Enter on a feature gap…» (додано підказку `· g: spec-to-code`).

Перевірки: `npm run typecheck` ✓; `npm test` 551 tests, 550 pass / 0 fail / 1 skipped ✓ (перший прогін — 1 fail через нову підказку, виправлено очікування); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою попереднього HEAD (`git archive` + WIP `src/extract/ts.ts`) на 25 сценаріях (proposal, `--print`, доповнення наявного модуля, implemented, typo, невідомий, planned module, без id, `--print --apply`, поганий mode, llm без ключа, `--into` інший модуль / `.txt` / добрий / `../`, `--apply`, pending замінюється, CRLF, deny, зламаний конфіг, без джерел, підкаталог, сховище-посилання назовні, згенерована ціль) — stdout, stderr, код, дерево: 25/25 SAME.

Коміт: `0eb0886` (Propose a planned fn's code and tests through a shared spec-to-code operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 29: `SpecToCodeRequest` — точка для `mode`; `specToCode(…, model)` уже приймає клієнта, потрібні signal і cancel, як `modelFlows`; CLI `--mode llm` ще стара гілка без basis.
- 30: `SpecToCodeCandidate.targets` з `before`/`after` — готовий вхід для явного apply всього набору з expected-text; CLI `--apply` ще стара гілка (`safeWriteAll`).
- 37: ранжування палітри за дослівним збігом фрази.

Припущення й залишки:
- Свіжість специфікацій перевіряється за текстами рукописних документів аналізу, прочитаними після аналізу; нова специфікація, додана під час роботи, не є причиною відмови.
- Форма перевіряє pending лише для файла коду; pending тестів відхиляє операція (1), бо цілі тестів відомі лише після побудови кандидата.
- Після запису MERGE відкривається на коді; тести — через `m`/Proposals/F6 Enter.
- CLI при частковому збої не друкує список записаних (як і раніше); TUI показує.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `0eb0886`; критерії приймання перевірено тестами й порівнянням CLI з HEAD (25/25).
