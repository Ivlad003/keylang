# 18: Р-1 expand: SpecIR і `compileSpec` у шарі `lang` поруч із Text IR

**Джерело:** research-pl §5 Р-1; знахідка 4; рішення Q2 (spec)

**What to build:** Новий `src/spec-ir.ts` у шарі `lang`: його треба дописати в `keylang.json` → `layers.lang`. Модуль імпортує лише `lang` і `base`: `ir.ts`, `renderMeaning` з `parser.ts`, `span.ts`, `diag.ts` і `SYNTHETIC_LAYERS` з `config.ts`.

Твердження описано як discriminated union:
- `LayersLine {order: readonly Ref[], nested: readonly Ref[]}` — кожен рядок `layers` разом із вкладеними шарами, як його записано, без перевірки. До 24 його перевіряє check (`layerChain` і `combineOrders` у rules.ts) і видає K005, як зараз. Тікет 24 замінить його валідним `LayerOrder`. Окремий сирий варіант потрібен, щоб до 24 check мав звідки видавати K005 рядка `layers`, не читаючи `node.refs`.
- `DependencyRule {effect: "allow" | "deny", from: Ref, to: readonly [Ref, ...Ref[]]}`.
- `Entry {entries: readonly [Ref, ...Ref[]]}`.
- `NoCycles {under: Ref | null}`.
- `ExportsRule {module: Ref, names: readonly [Ref, ...Ref[]]}`.
- `Flow {name, kind, triggers: Trigger[], items}` з деревом кроків:
  - `step` з `target: Ref`;
  - `when` з текстом;
  - `then` як `Ref` або текст;
  - claims `invariant`/`reads`/`emits`;
  - докази `test`.
- `Planned {kind, id, signature}`.
- `Wire`/`WireDep` — форми з wiring.ts. Умова `when` несе сирий текст і span, щоб до 24 wiring.ts:75 видавав K005, не читаючи `node.refs`.

Непорожні кортежі виключають типом неможливий стан «правило без цілі». У твердження не компілюються:
- рядок, якому бракує цілі (`deny app` — вже K005 парсера «needs at least 2 ID(s)»);
- `exports` без імен (K005, parser.ts:442);
- `entry` без вкладених елементів.

У цьому тікеті SpecIR ще ніхто не читає. Видимі наслідки з'являться, коли rules.ts перейде на SpecIR, і їх фіксує 19.

`triggers` — список, бо граматика дозволяє кілька `trigger` (tests/flows.test.ts:236). Як оцінювати другий і наступні, визначає 12 (Q14).

Кожне твердження й кожен елемент дерева потоку несе:
- `file` і `span`;
- канонічний `text`, з якого рахується `specHash`. Для правил це канонічний текст рядка за 09: `deny …`/`allow …` (як rules.ts:489), `layers …`, `entry <цілі>`, `no-cycles <модуль|*>`, `exports <модуль>: <імена>`. Для елементів потоку — `renderMeaning`;
- readonly `source` — посилання на вузол Text IR.

`source` призначений для редакторів. draft-llm і TUI пишуть у Text IR (`node.comment`), але семантику читають лише з полів SpecIR — так влаштовано rowan і typed AST у rust-analyzer. Правила з секцій `# map` теж компілюються (rules.ts:460).

09 зливається раніше, бо змінює той самий канонічний текст, з якого рахується `specHash` для `no-cycles`, `entry` і K101. Інакше 09 довелося б переробляти в spec-ir.ts.

Чиста функція `compileSpec(docs): {spec, diagnostics}` поки повертає порожні `diagnostics`. `assess` викликає її один раз і кладе `spec` в `Assessment`, а отже і в `Analysis` (analyze.ts:41). Це спільний вхід `check`, LSP і `draft-llm`.

Жоден споживач ще не переходить на SpecIR. Text IR, `parse --json` і `src/index.ts` не змінюються, SpecIR не експортується. Expand повний, а не нарізаний за родинами тверджень: частина типів уже існує (`Wire`, `ShapeNode`, `Rule`/`LayerOrder`).

Інші зміни:
- Власний потік `keylang/flows/check.md` отримує `- step lang.spec-ir.compileSpec` під `check.assess.assess`. Лічильники в прозі потоку треба оновити: «ten steps» → «eleven», «13 in all» → «14».
- grammar.md §9 отримує абзац: SpecIR — внутрішня форма, скомпільована з Text IR; у JSON-виводі її немає.
- design §2 отримує примітку про стан: design.md:27 описує компіляцію як таку, що вже відбувається.

**Blocked by:** 17, 09 <!-- 17 (еталон spec-forms); 09 (specHash — одна ідентичність правила) -->

**Status:** resolved

**Контракт:** немає. Тип внутрішній: SpecIR не експортується з `src/index.ts`, `parse --json` не змінюється. У `keylang.json` репозиторію змінюється лише розкладка шарів, а `keylang/flows/check.md` отримує один крок.

- [x] Юніт-тест чистої `compileSpec` на `tests/fixtures/spec-forms/valid` і `invalid` (tests/core.test.ts) перевіряє:
  - spans `Ref` тверджень збігаються зі spans `parse --json` для тих самих рядків;
  - `specHash` кожного результату в еталоні `valid`, що належить одному рядку правила чи елементу потоку, дорівнює SHA-256 від `text` цього твердження чи елемента. Результати з кількох рядків (K101, `unverified` окремого модуля для `entry`) хешують `text` цих рядків через `\n`, за правилом 09;
  - рядок із K005 парсера, якому бракує цілі, не дає твердження.
- [ ] Еталон 17 і всі `.expected` без змін. `src/index.ts` не експортує SpecIR, `parse --json` на фікстурах той самий.
- [x] `spec-ir.ts` не імпортує check, map чи extract. Такий імпорт дав би на репозиторії помилку: з check — K101 (порядок `layers` у `keylang/rules.md`), з map чи extract — K102 (`deny lang map`, `deny lang extract`).
- [x] Після `npm test` у `keylang/flows/check.md` новий крок `lang.spec-ir.compileSpec` має static `ok`, а проза потоку називає правильну кількість рядків.
- [ ] `npm run typecheck`, `npm test` зелені.
- [x] `node bin/keylang.js map` додає модуль `lang.spec-ir` у `keylang/map/lang.md` і `keylang/map-explained/lang.md` (diff переглянуто).
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/spec-ir.ts`, `src/assess.ts`, `src/analyze.ts`, `keylang.json`, `keylang/flows/check.md`, `keylang/map/lang.md`, `docs/format.md`, `docs/design.md`, `tests/core.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; src/spec-ir.ts (compileSpec, шар lang у keylang.json), assess.ts кладе spec в Assessment, крок lang.spec-ir.compileSpec у keylang/flows/check.md, grammar.md §9 і design.md:27; юніт-тест compileSpec у tests/core.test.ts:611 зелений; map --check = 0, check — 0 fail. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
