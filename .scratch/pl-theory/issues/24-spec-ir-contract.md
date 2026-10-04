# 24: Р-1 contract: K005 форми тверджень переходять у `compileSpec`, стару форму прибрано

**Джерело:** research-pl §5 Р-1; знахідка 4

**What to build:** `compileSpec` видає K005 форми тверджень, які зараз живуть у check:
- рядок `layers`: вкладений `x.y` (rules.ts:469), не шар у порядку (530), шар двічі (533);
- частковий порядок через кілька файлів: шар і впорядкований, і вкладений (518), суперечність порядків (563). `compileSpec` бачить усі документи разом, тож порядок рядків за документами той самий;
- умова wiring (wiring.ts:75).

Кожна K005 переходить разом зі своїм `reason` з 25: `layer` або `arguments`. Позиції, повідомлення й порядок не змінюються.

Після цього SpecIR містить лише валідні `LayerOrder` замість сирих `LayersLine` з 18 і розібрані умови wiring (`env`, `value`). Невалідний рядок не компілюється, тож неможливий стан виключено типом. Так само `compileSpec` не створює `DependencyRule` без цілі: тип `to: readonly [Ref, ...Ref[]]` з 18 це виключає.

Де що лишається:
- K005 для fn/type/event в `allow`/`deny` (rules.ts:486) лишається в check, бо їй потрібен `kindOf` зі знімка.
- K005 парсера лишаються в парсері. `parse` і редактор бачать їх без `compileSpec`, а перенесення змінило б `parse --json` і код виходу `parse`.
- Діагностики `compileSpec` не пишуться в `Document.diagnostics`. `assess` додає їх до решти й сортує `compareDiagnostics` (assess.ts:57-61). Тому `parse` і `parse --json`, як і раніше, не показують K005 рівня check.

Прибираємо стару форму:
- `Collected`;
- сигнатури `denyingRule`, `blocksDependency` і `collectWiring` над `docs` — після цього лишається одна сигнатура `denyingRule`;
- `plannedKind`;
- ре-експорт `Wire` з wiring.ts: wire-gen.ts імпортує його зі spec-ir.ts.

Документація:
- format.md §9 пояснює, де живе статична семантика: парсер перевіряє форму рядка, `compileSpec` — форму тверджень, check — те, що потребує знімка;
- оновлено design §2 і §7;
- `docs/research-pl.md` не редагуємо, зокрема таблицю §3: це знімок на дату.

Краще злити після 25. Тоді K005 переходять разом із `reason`, а еталон 17 доводить, що причини не загубилися. Жорсткого блокування немає: якщо 24 злито першим, 25 додає `reason` уже в `compileSpec`.

**Blocked by:** 20, 21, 22, 23 <!-- 20 (migrate flows); 21 (migrate wiring); 22 (LSP, --changed, feature, TUI); 23 (draft-llm, spec-to-code) -->

**Status:** resolved

**Контракт:** немає. Це внутрішній рефакторинг: вивід `check`, `parse` і `parse --json` не змінюється.

- [ ] Еталон 17 дає той самий JSON і human-вивід: порядок діагностик, позиції, повідомлення, `specHash` і `reason` (якщо 25 злито).
- [x] `parse` на файлі з `- layers a < d.y` дає код 0 без K005, як до зміни. `check` дає K005 на тій самій позиції й код 1.
- [x] Юніт-тест `compileSpec` на фікстурі `spec-forms/invalid`: рядки з K005 форми (невалідний `layers`, `deny` без цілі, зламана умова wiring) не дають тверджень. K005 рядків `layers` і умови wiring є серед `diagnostics` `compileSpec`; K005 парсера (`deny` без цілі) там немає.
- [x] Поза parser.ts і spec-ir.ts немає читання `refs` за індексом (`refs[0]`, `[a, ...b] = node.refs`). Єдиний виняток — tui/app.ts:559, з коментарем про навігацію курсором. Читати `refs` ітерацією, щоб показати написане чи навігувати, дозволено: так роблять `targetAt` (lsp-features.ts:144) і tui/nav.ts:90. Критерій стосується лише читання за індексом.
- [ ] `Collected`, сигнатури над `docs`, `plannedKind` і ре-експорт `Wire` прибрано. `check --format json` на репозиторії дає ті самі результати, якщо не зважати на `snapshotId`.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/spec-ir.ts`, `src/rules.ts`, `src/wiring.ts`, `src/wire-gen.ts`, `src/assess.ts`, `docs/format.md`, `docs/design.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; K005 layers і умови wiring видає compileSpec (src/spec-ir.ts:270–323, 509), RejectedLayers/LayerOrder; Collected, plannedKind і ре-експорт Wire прибрано; єдине читання refs за індексом поза parser/spec-ir — src/tui/app.ts:855 з коментарем; tests/core.test.ts:611 і :377 зелені; parse на `- layers a < d.y` дає 0. Залишок без впливу на поведінку: rules.ts combineOrders повторно обходить уже валідні порядки з відкинутими діагностиками, dependencyKindOf ще приймає Document[]. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
