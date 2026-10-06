# 36: K106: попередження про непорівнювані `allow`/`deny`, переможець той самий (крок 1)

**Джерело:** research-pl §5 Р-8 (крок 1); знахідка 1; рішення Q18 (spec)

**What to build:** Між `allow` і `deny` зараз перемагає правило з більшою сумою глибин областей у сегментах, а при рівності — `deny` (`specific()`, src/rules.ts:397-423). Коли одне правило вужче за джерелом, а інше за ціллю, це арифметика, а не специфічність. `allow app.x.y domain` (3 + 1) мовчки перемагає `deny app domain.storefront` (1 + 2), і `check` дає `1 ok`. Evidence `deny` при цьому каже «decided by more specific rules (`allow app.x.y domain`)» (rules.ts:253), хоча в частковому порядку ці правила непорівнювані. format.md:262, курс 05-rules (en і uk, :38) і тест tests/core.test.ts:403 називають перехресну пару з рівною сумою «рівною» (tie).

Частковий порядок. R1 специфічніше за R2, коли жодна з двох областей R1 не ширша за відповідну область R2 (сегментний префікс, `within`, rules.ts:71, :103), а хоча б одна вужча. Пара непорівнювана, коли одне правило вужче за джерелом, а інше — за ціллю. Такі правила завжди перетинаються на `<вужче джерело> <вужча ціль>`.

Після зміни `keylang check` дає K106 (warning) на пару рядків `allow` і `deny`, коли виконано всі три умови:
- правила непорівнювані хоча б для однієї пари їхніх цілей;
- `allow` має більшу суму глибин, тобто перемагає лише арифметикою. Саме цей випадок формат 2 вирішує інакше (37);
- правила з областю перетину (`allow|deny <вужче джерело> <вужча ціль>`) немає.

Де й як з'являється K106:
- K106 виводиться статично з `spec.rules` (SpecIR, 19). Він не залежить від знімка й кількості ребер: одна K106 на пару рядків правил;
- K106 стоїть на рядку `allow`. Як і K103, діагностика несе `criterion` — текст цього правила. `specHash` — хеш рядка `allow`, як в інших результатів правила (09);
- у `Diagnostic` один span (src/diag.ts:46-60), тому друге правило названо в тексті з `файл:рядок`, як це вже робить K102 (rules.ts:208). Приклад: `` `allow app.x.y domain` and `deny app domain.storefront` (keylang/rules.md:4) are incomparable; allow wins on depth sum (4 > 3); add `allow app.x.y domain.storefront` or `deny app.x.y domain.storefront` ``.

Згенерований baseline (src/baseline.ts:47-50) шуму не додає. Рукописне `deny app.x external` непорівнюване з кожним `allow app external.<pkg>` із baseline, але суми рівні, тож перемагає `deny`, і K106 немає. Переможець, вердикти й коди виходу не змінюються.

Поруч змінюються тексти:
- K102 на ребрі, де `deny` переміг непорівнюване `allow` рівністю чи сумою, називає й це `allow` з `файл:рядок`. Зараз вона називає лише `deny`;
- evidence `ok` для `deny`, чиї ребра вирішило непорівнюване `allow`, більше не каже «more specific». Воно називає `allow` і причину — суму глибин. Коли `deny` перебило порівнюване, вужче правило, «more specific rules» лишається.

K106 — warning (`severityOf`, src/diag.ts:42-44), тож не валить `check` і не впливає на `--strict`, `feature_status` чи Stop-хук (фільтр `isError`, src/feature-status.ts:99). LSP і MCP отримують її через спільний `assess`.

Документація:
- semantics.md §7: рядок `| K106 | warning |` у таблиці, яку читає tests/cli.test.ts:1232;
- абзац allow/deny (format.md:262) описує частковий порядок, тобто порівнювані, рівні й непорівнювані правила, і те, що у форматі 1 сума глибин вирішує лише непорівнювані пари;
- курс 05-rules (en і uk) і tests/core.test.ts:403 більше не називають перехресну пару «рівною»;
- `keylang explain K106` дає причину, приклад і виправлення. Без цього не пройде typecheck: `EXPLANATIONS: Record<Code, …>` (src/explain.ts:5).

Модель 27 доповнено: вона передбачає K106.

**Blocked by:** 19 (`rules.ts` на SpecIR), 27 (модель allow/deny)

**Status:** resolved

**Контракт:**
- новий код діагностики K106 (warning). Розширюється публічний union `Code` (src/diag.ts, експортує src/index.ts), тож вичерпний `switch` за `Code` у TS-споживачів перестане компілюватися. Публічна `check()` з src/index.ts (резолвер) K106 не повертає;
- нові рядки з'являються в stdout `check`, у `--format json` (`verdict: "warning"`), у SARIF (`warning`), у GitHub (`::warning`), а також у LSP і MCP;
- змінюються тексти K102 і evidence `ok` для `deny`.

Вердикти й коди виходу не змінюються.

- [ ] Тимчасовий репо, як у tests/core.test.ts:396: `src/app/x/y.ts` імпортує `src/domain/storefront.ts`, правила `allow app.x.y domain` і `deny app domain.storefront`. `check` дає код 0 і `0 fail`. У stdout K106 стоїть на рядку `allow`, названо `deny app domain.storefront (keylang/rules.md:<рядок>)` і `app.x.y domain.storefront`. У `--format json` є `code: "K106"`, `verdict: "warning"`, а `deny` має `ok` з evidence без «more specific», що називає `allow`.
- [ ] Правило на перетині прибирає K106. З `deny app.x.y domain.storefront` з'являються K102 і код 1, з `allow app.x.y domain.storefront` — код 0.
- [ ] Три випадки без K106 стають новими кроками тесту tests/core.test.ts:396; очікування перехресних випадків змінено свідомо:
  - порівнювані правила: `deny app domain` + `allow app.x domain.storefront` — перемагає `allow`, код 0;
  - рівні області: `allow app domain` + `deny app domain` — K102, код 1;
  - перехресна пара з рівною сумою: `deny app.x domain` + `allow app domain.storefront` — K102, код 1, і K102 називає `allow` з рядком.
- [ ] K106 не залежить від ребер. Без імпорту K106 той самий. Якщо замість `y.ts` є два файли під `src/app/x/y/`, які обидва імпортують `domain.storefront`, K106 одна. Без знімка теж: у теці без `keylang.json` з копією `keylang/` тимчасового репо (після `map`; шари й модулі оголошує карта) `check` дає той самий K106 на тому самому рядку.
- [x] Репо після `init`, де `src/app/x/…` імпортує два пакети, а в `keylang/rules.md` є `deny app.x external`: жодного K106. Кожна K102 на імпорті пакета називає відповідне `allow app external.<pkg>` із `keylang/rules.baseline.md` з рядком.
- [ ] Модель 27 передбачає K106. `KEYLANG_MODEL_RUNS=500 node --test tests/rules-model.test.ts` проходить без розбіжностей; час і результат записано в коментар тікета.
- [x] `keylang explain K106` дає код 0, у format.md є `| K106 | warning |`. `check` на репозиторії не дає K106: `keylang/rules.md` містить лише `deny`.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено, вона цитує doc-коментар `specific()`), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `src/diag.ts`, `src/explain.ts`, `docs/format.md`, `docs/course/05-rules.md`, `docs/course/uk/05-rules.md`, `tests/core.test.ts`, `tests/rules-model.test.ts`

## Comments

- 2026-09-29 — Після K106 `KEYLANG_MODEL_RUNS=500 node --test tests/rules-model.test.ts`: 1 pass, 0 fail, property 634062.566493 ms, duration_ms 634259.987924, EXIT 0 (`t36-500.log`). Seed за замовчуванням у тесті — `20260929`. Модель передбачає K106 в обох редакціях.
- 2026-09-29 — `node bin/keylang.js check` на цьому репозиторії: `0 fail`, K106 немає (`keylang/rules.md` містить лише `deny`). `map --check` = 0. Карта з поясненнями увімкнена (`explain.map`).
- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 (K106 у src/diag.ts, src/rules.ts), format.md `| K106 | warning |`, `explain K106` — код 0; tests/format-rules.test.ts, tests/rules-model.test.ts (K106 у моделі), tests/core.test.ts; `check` репозиторію — 0 fail.
