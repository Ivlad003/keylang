# 24: Створювати чернетку правил у режимах algo, llm і hybrid

**What to build:** TUI пропонує правила з позначками походження/узгодженості та передає вибраний результат у MERGE.
**Blocked by:** [23 — спільний draft/LLM-протокол](23-model-flow-and-cancellation.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A12, A14, A22.

## З чого почати

Знайти `cmdDraftLayout`, `draftRules`, `draftRulesWithModel`, `withRules`, `stronglyConnected`, облік draft stats. Не використовувати алгоритм baseline замість draft rules.

## Кроки

1. Додати shared rules-draft operation й форму mode/into/output; defaults як CLI.
2. Algo використовує чинний граф модулів і no-cycles-аналіз. LLM/hybrid використовують чинну перевірку правил-кандидатів.
3. Результат показує текст, agree/conflict/llm-only і конфлікти окремо від вердикту workspace.
4. З'єднати candidate з existing rules через `withRules`; вручну написані сторонні розділи зберігаються.
5. Preview read-only; proposal має ті самі очікування target/proposal, freshness й скасування, що flow draft.
6. CLI rules-гілку переключити на спільну операцію, залишивши draft map окремою гілкою до 25.

## Перевірки

- Ациклічний і циклічний fixture дають той самий algo-text, що CLI.
- Mock model пропонує правило, яке код порушує: conflict видимий, не перетворений на workspace ok.
- Existing rules із прозою/іншими розділами збережені в candidate.
- Preview, fallback без agent, Cancel і concurrent proposal дають гарантії flow draft.

## Приймання

- [x] Усі три режими досяжні, параметри й target видимі.
- [x] Нічого не потрапляє в ручні правила до застосування MERGE.
- [x] Stats не змінюються від preview або скасованої роботи.

**Межі:** baseline-генерація лишається окремою дією 10.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Чернетка правил — спільна операція `draft-rules` в усіх трьох режимах: CLI `draft rules [--mode] [--into] [--print]` — принтер над нею (гілка `draft map` лишилась окремою до 25), у TUI — форма з палітри, preview/proposal у worker, F6-звіт і перехід у чинний MERGE.

- **`src/operations.ts`** — `DraftRulesRequest { kind: "draft-rules", root, into?, output: preview|proposal, mode?: algo|llm|hybrid (типово algo), pending?: refuse|replace (типово refuse) }`, `RulesCandidate { rules, target, problem, before, pending, text }`, `DraftRulesPayload { output, mode, candidate, cyclic, summary, model: RulesModelInfo | null, fallback, statsError, proposal, refused, error }`, `RulesModelInfo { agent, counts, conflicts }`; `rulesCandidate(...)` — ціль `into` або `<dir>/rules.md`, `proposalProblem` до читання, текст цілі й пропозиції, що чекає, `withRules`. `runDraftRules`: аналіз без `persistFacts` → немає знімка — 2 (`draft: no supported source files…`) → `sourceInputs` → граф модулів (без external) + `stronglyConnected` → `draftRules` → `modelSetup(…, "draft rules")` (llm без моделі — 2 `draft rules --mode llm: …`; hybrid — algo з `fallback`) → базис цілі → для proposal до моделі `proposalRefusal` (ціль 2, сховище 2, `refuse` + pending 1) → `draftRulesWithModel` з signal (Cancel → cancelled/null; помилка → 2) → preview 0 → `commitProposal` → stats лише для модельної пропозиції. Повідомлення-warning: fallback, `conflict: <правило> → <доказ>` (тексти CLI). Спільні з `runDraftFlow` частини винесено без зміни поведінки: `proposalRefusal`, `commitProposal` (`beforeCommit`/`CommitGate`, повторна перевірка цілі, пропозиції, `keylang.json` і джерел через `sourceInputProblems`, `writeProposal(…, expected)`), `countProposed`; `modelSetup` отримав назву команди для повідомлення llm.
- **`src/draft-llm.ts`** — `draftRulesWithModel(…, options: LlmCallOptions = {})` передає signal у `complete`.
- **`src/cli.ts`** — `draftRulesPrinter` (warnings → stderr `keylang: …`, errors після них, `pending: "replace"`); стара rules-гілка `cmdDraftLayout` та імпорти `draftRules`/`withRules`/`stronglyConnected` прибрано.
- **`src/tui/actions.ts`** — дія `draft-rules` «Draft rules: the rules the code keeps, or the model's (algo, hybrid, llm)», група Generate (aliases `draft rules`, `keylang draft rules`, `draft rules --mode hybrid|llm`, `rules draft`, `propose rules`); недоступна в MERGE, на стартовому екрані й під час операції. `matchActions`: одне слово запиту, що точно дорівнює імені файла (без розширення), ставить його «Open …» першим — інакше `:rules` відкривав би «Draft rules» замість `rules.md` (чинний тест палітри).
- **`src/tui/state.ts`** — `Prompt.kind "draft-rules"`, `RulesDraftForm { into, mode, output }`.
- **`src/tui/app.ts`** — форма: рядки `target` (типове `<dir>/rules.md` поруч), `mode` (`←→`; типово hybrid за `agent`, інакше algo), `output`, запуск; `details` — корінь і що бачить модель. `rulesDraftProblem`: llm без `agent` (поле mode), для proposal — `proposalProblem`, наявний запис у сховищі, dirty буфер цілі; відмова лишає форму. `requestOperation`: barrier лише для dirty `keylang.json`. `commitGate` і F6 Enter → MERGE працюють для обох чернеток; `afterDraft` → `afterRulesDraft` (те саме правило автовідкриття MERGE через `stillWhereDraftStarted`; повідомлення з кількістю конфліктів).
- **`src/tui/view.ts`** — мітки `draft rules[ --mode m][ --into t][ --print]`, `· <mode> · <output>[ · into]`, підсумок (`N rule(s), preview, nothing written` / `… proposed for <target>` / `refused…`), F6: заголовок `Draft rules · <mode>[ (hybrid without a model)] → <target>`, стан цілі (проза й інші розділи зберігаються), примітка algo (цикл модулів → без `no-cycles`), для моделі — пояснення статусів, «the statuses are the draft's, not the workspace's verdict…» і окремий блок `conflicts (N): the code breaks these rules now` з доказами; `── keylang draft rules … --print · stdout ──`, для preview — повний текст цілі.
- **`docs/tools.md`** — абзац «Чернетка правил (algo, llm, hybrid)».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md` і `map-explained/README.md`; ці файли = карта чистої копії HEAD + зміни 24 (перевірено генерацією в чистій копії), рядок extract у README — як у HEAD; WIP `extract.md` байтово ті самі (sha1 файлів і sha1 diff до/після), не закомічено.

Тести:
- `tests/tui.test.ts` (+3; хелпери `rulesForm`, `rulesRecord`, `cliRules`, фікстури `RULES_SPEC`, `CYCLIC_ORDER`): (1) algo: форма (рядки, типовий target, корінь, примітка про збереження прози), Esc нічого не пише; preview = CLI `--mode algo --print` у двійнику, дерево незмінне, кандидат зберігає прозу й `# flow`, наявне правило не повторено; proposal = CLI байт у байт, лише файл пропозиції (без stats), MERGE відкрився сам, до `w` rules.md той самий, F6 Enter → MERGE, `a…w` → ціль = кандидат; циклічна фікстура: preview = CLI (deny, без `no-cycles`/`layers`), `cyclic`, примітка F6. (2) hybrid з локальним mock: промпт має залежності шарів; preview `1 agree, 2 algo-only, 1 conflict`, конфлікт `- deny application domain → src/application/purchase.ts:N: K102 …` у payload і окремо в F6, вердикти поточного аналізу незмінні, нічого не записано; Cancel з палітри → cancelled/null, запит закрито, пізня відповідь нічого не змінює; чужа пропозиція під час відповіді → failed 1, збережена, лічильників немає; proposal → текст = кандидат, rules.md незмінний, stats `agree 1, algo-only 2, conflict 1`, MERGE; після злиття й F5 — K102 у діагностиках (конфлікт не став ok). (3) без моделі: форма стартує algo, примітка hybrid, llm — відмова форми (поле mode); hybrid preview = CLI `--mode hybrid --print` і той самий stderr fallback; F6 `algo (hybrid without a model)`; наявна пропозиція й dirty буфер цілі — відмова до запуску, байти ті самі.
- `tests/draft.test.ts` (+1): `runOperation` у процесі — Cancel під час завислої відповіді → cancelled/null, з'єднання закрито, `.keylang` не створено; pending + `refuse` → failed 1 без жодного запиту до моделі.
- Чинні CLI-тести `draft rules` (algo, hybrid з конфліктами, `# rules` перед хвостовим `# flow`) і тести `draft flow` проходять без змін.

Перевірки: `npm run typecheck` ✓; `npm test` 540 tests, 539 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive`) з локальним mock на 24 сценаріях (algo proposal/`--print`, ціль із прозою й `# flow`, hybrid/llm без ключа, hybrid з моделлю, llm `--print`, `--into` поза `keylang/`/у `map/`/тека, `--print` з поганим `--into`, pending замінюється, stats недоступний, HTTP 400, без джерел, зламаний `keylang.json`, підкаталог, циклічна фікстура print/proposal, CRLF, невідомий `--mode`, сховище-посилання назовні, `--into` на теку з і без `--print`) — stdout, stderr, код, дерево: 23 SAME; 1 навмисна різниця: для proposal з поганим `--into` модель більше не питають, тож рядків `conflict:` перед помилкою немає (помилка й код ті самі), як у 23 для потоку.

Коміт: `8ea0515` (Draft rules through a shared draft-rules operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 25: `draft map` лишилась у `cmdDraftLayout` (власний `model()` без signal); `modelSetup(mode, analyzed, command)` і `commitProposal` не підходять напряму (ціль — dirty-конфіг, не пропозиція), але `LlmCallOptions.signal` + `LlmCancelled` — той самий шаблон.
- 26/27/28/29: `proposalRefusal` + `commitProposal` + `countProposed` — готова послідовність «перевірка до моделі → модель → gate → свіжість → запис → stats» для будь-якої spec-пропозиції.
- 37: у палітрі точна назва файла одним словом має пріоритет над діями (`matchActions`).

Припущення й залишки:
- Пакет контексту F4 у промпт правил не йде: промпт CLI (шари й кількість ребер) не змінено; параметр `context` для правил не додано.
- Модельні правила перевіряються відносно збережених специфікацій (аналіз читає диск); незбережені чужі специфікації не враховуються, їх свіжість перед записом не перевіряється — лише ціль, пропозиція, `keylang.json` і джерела.
- `summary` для algo — `N rule(s)` (у CLI-виводі його немає; лише TUI/payload).
- Ціль, яку не можна прочитати (тека), для preview не є помилкою (`candidate.problem` = причина, `text` null), як `--print` у CLI; для proposal — failed 2 з тим самим повідомленням. У `draft-flow` (HEAD) `--print --into <тека>` дає код 2 — не змінював.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `8ea0515`; критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD.
