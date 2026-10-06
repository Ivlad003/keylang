# 39: K008: `then` з одного слова без крапки, що збігається з оголошеним ID

**Джерело:** research-pl §5 Р-9; знахідка 6; рішення Q20 (spec)

**What to build:** Автор пише `- then OutOfStock`, а має на увазі `application.purchase.OutOfStock`. За Р10 (format.md:198; src/parser.ts:497-506) посиланням стає лише рівно один токен-ID з крапкою. Тож такий рядок мовчки стає текстом і не перевіряється, навіть із `--strict`. Форма лінка від цього не рятує: `then [createOrder](../map/domain.md)` без крапки теж стає текстом. Для порівняння, `then infra.db.sav` дає K001 з `did you mean` (src/resolve.ts:213).

Відтворення: копія `tests/fixtures/repo` після `map`, потік з `- when …` / `- then save`, у знімку є `infra.db.save`. `check --strict` дає `0 fail, 0 unverified` і код 0 без жодної діагностики.

Після зміни `keylang check` друкує на цьому слові K008 (warning): `` `then save` is read as text, not a reference (did you mean `then infra.db.save`?) ``.

Правила:
- K008 спрацьовує на `then` з рівно одного токена без крапки: слова або лінка, чий текст без крапки;
- кандидат — ID з індексу резолвера, чий останній сегмент точно, з урахуванням регістру, дорівнює слову. Це оголошення карти (fn, type, event, module) і `planned`. У репо з `keylang.json` карту друкує знімок, тож кандидати тут — вузли знімка;
- шари не кандидати: ID з одного сегмента в `then` посиланням стати не може;
- кандидатів перелічено всіх, у стабільному сортованому порядку;
- span — слово, а для лінка — ID усередині `[…]`, як в інших посилань-лінків (grammar.md §4);
- K008 не дають: багатослівний `then`, `then` з крапковим ID (голим чи лінком), слово без кандидата. Схожі імена (`then sav`) теж мовчать: нечіткого пошуку немає.

K008 має рівень warning (`severityOf`, src/diag.ts:42-44). Вона:
- не валить `check` (src/cli.ts:1103);
- не впливає на `--strict` (:1112), `feature_status` і Stop-хук (src/feature-status.ts:99, src/cli.ts:742);
- у `--format json` має `verdict: "warning"` (src/check-results.ts:38), у SARIF — `level: warning`, у GitHub — `::warning` (src/cli.ts:1160, :1182);
- у LSP і TUI з'являється через спільний вивід діагностик, окремої роботи не треба.

Перевірку робить резолвер (src/resolve.ts), бо їй потрібен глобальний індекс `decls` і `planned`. Тож K008 повертає й публічна `check()` з src/index.ts.

Що не змінюється:
- семантика Р10: `parse --json`, `fmt` і `specHash` ті самі;
- `fmt` нічого не виправляє автоматично, бо заміна тексту посиланням змінила б семантику;
- K007 лишається зарезервованим (docs/design.md:179);
- рівень warning. Підняти його до error можна лише з новою версією формату (35) і за даними проби.

Документація:
- `keylang explain K008` (зараз `unknown code`, код 2) дає причину, приклад і два виправлення: написати повний ID, голий чи лінком, або переписати текст кількома словами;
- grammar.md §5 (Р10) і §7 (рядок `| K008 | warning |`);
- якщо 32 злито, приклад записано як виконуваний.

Бажано злити K008 до сесій проби design-v0.2/28: це м'який блокер проби (43).

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** новий код діагностики K008 рівня warning. Він з'являється в stdout `check`, у JSON, SARIF, GitHub, LSP і MCP. Розширюється публічний union `Code` (src/diag.ts, експортує src/index.ts), і публічна `check()` повертає нову діагностику. Це зміна API пакета: вичерпний `switch` за `Code` у TS-споживачів перестане компілюватися. Коди виходу, IR і `parse --json` не змінюються.

- [x] Відтворення вище. stdout `check` містить `` K008 … (did you mean `then infra.db.save`?) ``. Підсумок у stderr не рахує K008 як fail. Код 0, `--strict` теж дає 0.
- [ ] `- then [save](../map/infra.md)` дає K008 з колонкою ID усередині `[…]`. Коли додано `planned fn app.cart.save () → void`, перелічено обидва кандидати в сортованому порядку. `then Save` K008 не дає.
- [ ] `then retry ≤ 3, backoff`, `then infra.db.save`, `then [infra.db.save](x.md)` і `then nothing` K008 не дають. `tests/fixtures/diagnostics.expected` не змінюється.
- [ ] `--format json` дає `code: "K008", verdict: "warning"`, SARIF — `ruleId: K008, level: warning`, GitHub — `::warning …title=K008::`. Той самий тест одним кроком викликає `check([parse(file, text)])` з src/index.ts: результат містить K008 з `severity: "warning"`.
- [ ] `keylang explain K008` дає код 0. `parse --json` того самого файла K008 не друкує, `fmt --check` проходить. grammar.md §5 і §7 описують K008.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail і жодної K008.

Ключові файли: `src/resolve.ts`, `src/diag.ts`, `src/explain.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; src/resolve.ts K008, tests/cli.test.ts «K008 warns when one undotted then word matches a declared id», semantics.md §7 K008, `explain K008`.
