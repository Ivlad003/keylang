# 27: `exports` на непрозорому модулі (помилка розбору) дає ok «the export table is exactly …»

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-rule-flow-semantics`, верифікація: confirmed.

**Місце:** `src/rules.ts:456` (рецензент указав `src/rules.ts:456`)

## Що не так

Для `members: opaque` код дає unverified лише тоді, коли бракує заявленого імені. Якщо часткова таблиця збігається зі списком, вердикт — `ok` «the export table is exactly a». Але експорти після синтаксичної помилки, яку tree-sitter не розібрав, keylang не бачить. Повна інформація дала б K104 за зайвий експорт, тож менше інформації перевело fail в ok, а це заборонено (semantics.md, «Вердикти»).

## Сценарій збою

src/app/m.ts: `export function a() {}` / рядок, який граматика не розбирає / `export function hidden() {}`; rules: `- module app.m` / `  - exports a`. Знімок: app.m `members: opaque`, у coverage parse-error, таблиця exports лише `a`. check: `ok exports app.m: convergence: the export table is exactly a`, код 0, і з --strict теж. Очікувано unverified (модуль непрозорий), бо `hidden` — незаявлений експорт. Найімовірніше на синтаксисі, якого не знає tree-sitter, але знає компілятор.

## Як відтворити

scratchpad/review/rule-flow-semantics/f6: `node bin/keylang.js check --format json` дає `ok exports app.m app.m convergence: the export table is exactly a`, `0 fail, 0 unverified, 1 ok`. Дамп знімка (dump.ts): app.m members=opaque, coverage parse-error src/app/m.ts:2:1, exports=[a].

Доказ верифікатора:

> I reproduced it with the real CLI at HEAD 45cc74d. The fixture is in scratchpad/verify/x-rule-flow-semantics-2-0/r1, run with HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed at the scratch dir.
> - keylang.json: {"format":2,"languages":["typescript"],"layers":{"app":"src/app/**"}}
> - keylang/rules.md: `- module app.m` / `  - exports a`
> - src/app/m.ts: `export function a() { return 1; }` / `const x = ;;; )))) {{{` / `export function hidden() { return 3; }`
> 
> Commands and output:
> - `node /home/kosmodev/pet_project/keylang/bin/keylang.js check` prints `0 fail, 0 unverified, 1 ok` and exits 0. `check --strict` gives the same result, also exit 0. Text mode does not mention the parse error at all.
> - `check --format json` gives the result `"verdict": "ok", "evidence": "convergence: the export table is exactly a"`. The parse error appears only in the separate `coverage` list (`kind: parse-error`, src/app/m.ts:2:1, source app.m). The result has no `hole` field.
> - The snapshot after `map`, written in the scratch fixture, has `nodes["app.m"].members = "opaque"` and `exports = [{module:"app.m",name:"a",...}]`, so `hidden` is not in the table.
> 
> Control run: the same fixture with line 2 replaced by `const x = 1;` gives `K104 divergence: app.m exports hidden (fn), which is not listed in exports`, `1 fail`, exit 1. So with less information (a parse error) the verdict goes from fail to ok.
> 
> Code path, src/rules.ts:455-468:
> - `opaque` is true. The early `unverified` (line 456) only fires when `missing.length > 0`.
> - The absence loop is skipped because `!opaque` is false.
> - `failed` is false and `unknown` is undefined, so line 468 calls `pushOk`.
> 
> Contract:
> - docs/semantics.md:162, «Вердикти»: «Менше інформації … переводить ok або fail лише в unverified, ніколи між ok і fail». It also says convergence is a confirmed match, and «невизначеність ніколи не перейменовується на ok».
> - docs/semantics.md:178 only says that a declared missing name in an opaque module is unverified. Nothing documents ok for an opaque module, so this is not intended behaviour.
> - docs/review-2026-10-05.md does not list it (the only related item, #6 about `export type *`, is closed). It is new, not a regression.
> 
> How likely it is in production: modern syntax parses cleanly, so the trigger needs a real parse error, such as code in progress or a grammar gap. TS `using`, `await using`, `accessor`, `<const T>`, `satisfies` and Python PEP 695 / `type X =` / `match` all parsed without parse-error and gave the cor …

## Що зробити

- Для opaque-модуля без K104 завжди повертати unverified (і коли бракує імен, і коли часткова таблиця збігається, з причиною «може експортувати більше, ніж показує таблиця»), а pushOk лишити лише для members: complete.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/rules.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/rules-area.test.ts` «exports on an opaque module (a parse error) whose partial table matches the list is unverified, not ok» — справжній CLI: `src/app/m.ts` з `export function a`, рядком, який граматика не розбирає, і `export function hidden`; `- module app.m` / `  - exports a`. `check` і `check --strict` — `0 fail, 1 unverified, 0 ok`, JSON-вердикт `unverified` з «opaque module `app.m` may export more than its table shows». Перевірено, що на коді до виправлення тест падає (`0 fail, 0 unverified, 1 ok`).
- 2026-10-08: Виправлення в `src/rules.ts` (правило `exports`): для `members: opaque` без K104 вердикт `unverified` і тоді, коли таблиця збігається зі списком; `pushOk` лише для `complete`. Зайве ім'я в таблиці непрозорого модуля й далі K104 (fail певний).
- 2026-10-08: Контракт: `docs/semantics.md` (рядок про `exports`). Перевірки: `node --test tests/rules-area.test.ts tests/cli-rules.test.ts tests/analyzer.test.ts` — 69/69, `npm run typecheck` — ок.
