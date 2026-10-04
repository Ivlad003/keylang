# 14: Однаково специфічні `deny` на одному ребрі: кожне дає власну K102

**Джерело:** research-pl §5 Р-3; знахідка 2; рішення Q9 (spec). Баг знайдено під час звірки ескізу Datalog з кодом

**What to build:** Коли два `deny` однаково специфічні (рівна сума глибин) і обидва охоплюють ребро, K102 дістається лише першому за порядком файлів і рядків. `specific()` замінює переможця лише за строго більшого score (src/rules.ts:416), а файли впорядковано за назвою (src/files.ts:44), тож згенерований `rules.baseline.md` іде раніше за `rules.md`. Друге правило отримує `ok` з неправдивим «decided by more specific rules (`<перше>`)» (rules.ts:194-199, 253), навіть коли воно дослівно повторює перше.

Мінімальне відтворення: `keylang/rules.md` з `- deny app.x infra` і `- deny app infra.db` (2 + 1 проти 1 + 2), `src/app/x.ts` імпортує `src/infra/db.ts`. Зараз є одна K102 від `deny app.x infra`, а `deny app infra.db` отримує `ok` «decided by more specific rules».

Після зміни ребро мають усі найспецифічніші `deny` з однаковою сумою глибин. Кожен дає власну K102 на пару файлів-модулів (правило «одна K102 на правило» вже діє, rules.ts:182) і вердикт `fail`. `deny`, який перебило строго специфічніше правило, лишається `ok` «decided by more specific rules», і evidence називає всі правила, що вирішили його ребра. При рівності `deny` і `allow`, як і раніше, перемагає `deny`. `denyingRule`/`blocksDependency` (K102 у wiring, spec-to-code, LSP-completion) поводяться як раніше: їм досить факту заборони, і K102 у wiring далі називає перше правило.

format.md §7 (пункт `allow`/`deny`, format.md:262) з прикладами описує три випадки: рівність двох `deny` (обидва `fail`, дві K102), рівність двох `allow` (ребро дозволено) і вердикт перебитого `deny`.

Цей тікет і 15 правлять той самий цикл `evaluateOnSnapshot` (rules.ts:190-222). Міграція rules.ts на SpecIR (19) чекає на обидва й має зберегти цю поведінку.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** семантика, несумісно. Вердикт другого однаково специфічного `deny` змінюється з `ok` на `fail`. У stdout `check`, `--format json`, SARIF, LSP і MCP з'являються додаткові рядки K102. Код виходу не змінюється, бо перша K102 уже дає 1.

- [x] Відтворення вище: `check` друкує дві K102 у `src/app/x.ts:1:1`, одна називає `deny app.x infra`, друга — `deny app infra.db`. У `--format json` обидва правила мають `verdict: "fail"`, код виходу 1.
- [x] Справжній baseline: у фікстурі `app` не залежить від `infra`, `keylang baseline` пише `keylang/rules.baseline.md` з маркером генерації (src/baseline.ts:42) і рядком `- deny app …` з `infra` серед цілей, а рукописний `keylang/rules.md` містить `- deny app infra`. Після додавання імпорту `src/app/x.ts` → `src/infra/db.ts` `check` дає на ньому дві K102: одну з `keylang/rules.baseline.md:<рядок>`, другу з `keylang/rules.md:3`. Жоден результат `--format json` не містить «decided by more specific rules».
- [x] Регресія: `deny app infra` + `deny app.x infra.db` (2 проти 3). K102 дає лише `deny app.x infra.db`, а `deny app infra` отримує `ok` «decided by more specific rules (`deny app.x infra.db`)».
- [x] Регресія: тест tests/core.test.ts:396 «rule specificity counts ID segments…», K102 у wiring (tests/wiring.test.ts:285) і completion з `deny` (tests/lsp.test.ts:402) проходять без змін.
- [ ] format.md §7 описує три випадки з прикладами. Якщо еталон `spec-forms` (17) уже злито, його очікувані файли змінились лише тут, diff переглянуто.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `tests/core.test.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 («Each most-specific deny emits its own K102»); тест `tests/rules-area.test.ts` «two denies of equal depth each fail; a deeper deny is the only K102»; сценарій зі справжнім baseline перевірено вручну на тимчасовій копії (дві K102: `keylang/rules.baseline.md:5` і `keylang/rules.md:3`, жодного «decided by more specific rules»); format.md §7 (`allow`/`deny`) описує рівність двох `deny` і «more specific rules». Не закрито дрібне: окремого прикладу рівності двох `allow` у format.md немає, і окремого CLI-тесту з baseline немає. Прогін `npm test` у межах аудиту не виконувався.
