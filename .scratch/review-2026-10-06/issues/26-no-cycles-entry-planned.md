# 26: `no-cycles` і `entry` під planned-підмодулем застосовуються до батьківського модуля

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-rule-flow-semantics`, верифікація: confirmed.

**Місце:** `src/rules.ts:484` (рецензент указав `src/rules.ts:484`)

## Що не так

`scopeOf(rule.under)` і `scopeOf(id)` для `entry` піднімаються вгору ID до найближчого модуля знімка. Тому ID без коду (наприклад `planned module app.x.fresh`) розширюється до свого батька `app.x`. За semantics.md K105 буває лише для компоненти, що містить модуль правила чи його підмодуль, а `entry` сіє лише модуль або префікс units. Насправді `no-cycles` дає хибний K105 за чужий цикл, а `entry` — хибне ok досяжності. Для `deny` і `exports` над planned-модулем є гілка «planned → unverified», а для цих двох правил її немає.

## Сценарій збою

src/app/x.ts і src/app/z.ts імпортують одне одного. Фіча оголошує `- planned module app.x.fresh`, rules: `- module app.x.fresh` / `  - no-cycles`. Результат: `K105 divergence: dependency cycle app.x → app.z → app.x` і код 1 (хибний fail для модуля, якого ще немає). З `- entry` / `  - app.x.fresh`: `ok entry … every module is reachable from entry`, хоча жоден модуль не досяжний із реальної точки входу; очікувано K103 для app.x і app.z.

## Як відтворити

scratchpad/review/rule-flow-semantics/f2: `node bin/keylang.js check` дає `keylang/rules.md:4:3: K105 divergence: dependency cycle app.x → app.z → app.x`, `1 fail`, exit 1. Після заміни правила на `- entry\n  - app.x.fresh`: `ok entry app.x.fresh convergence: every module is reachable from entry`, `0 fail, 0 unverified, 1 ok`.

Доказ верифікатора:

> Я відтворив обидва випадки на власній фікстурі в scratchpad/verify/x-rule-flow-semantics-1-0. Усі команди запускав як `node /home/kosmodev/pet_project/keylang/bin/keylang.js check`, з HOME і XDG_* у scratch.
> 
> Фікстура a: keylang.json `{"layers":{"app":["src/app/**"]}}`, src/app/x.ts і src/app/z.ts імпортують одне одного. keylang/flows/feat.md містить `- planned module app.x.fresh`, keylang/rules.md — `- module app.x.fresh` / `  - no-cycles`.
> Вивід: `keylang/rules.md:4:3: K105 divergence: dependency cycle app.x → app.z → app.x`, `1 fail, 0 unverified, 0 ok`, exit=1. У `--format json`: `{"criterion":"no-cycles","area":"app.x.fresh","verdict":"fail","code":"K105"}`.
> Контроль у тій самій фікстурі: planned `app.fresh` прямо під шаром дає `0 fail, 0 unverified, 1 ok`, exit=0. Отже, хибний fail виникає лише тоді, коли батько planned-ID є файловим модулем.
> 
> Фікстура b: x.ts імпортує z.ts, є ще main.ts, і жодного циклу немає.
> - `entry` / `app.x.fresh`: лише `K103 … app.main`. Результат такий самий, як для контрольного `entry app.x`, тож planned-ID сіє app.x.
> - `entry` / `app.main` (контроль): K103 для app.x і app.z.
> - `entry` / `app.main` + `app.x.fresh`: `0 fail, 0 unverified, 1 ok`. Це хибне ok, бо app.x і app.z досяжні лише через ще не існуючий модуль.
> 
> Причина в коді. `scopeOf` (src/rules.ts:162) піднімається вгору ID до найближчого вузла `kind:"module"`. Для no-cycles на :484 і для entry на :377 перевірки на planned немає. `deny` (:360) і `exports` (:436) таку гілку «planned → unverified» мають.
> 
> Що суперечить контракту в docs/semantics.md, розділ «Семантика правил»:
> - `k105(R, C) :- одна на кожну таку C, що містить модуль правила чи його підмодуль`. app.x.fresh в SCC {app.x, app.z} не входить.
> - `reach(U)`: «шар або префікс, який сам не модуль, сіє кожен unit під ним». Під app.x.fresh немає жодного unit, тож відкривати батька app.x правило не мало б.
> - За тим самим документом `purchase.ts` і `purchase/buy.ts` — окремі модулі, отже app.x.fresh не є частиною app.x.
> 
> Тестів, що закріплюють таку поведінку, немає: grep по tests/ не знаходить planned разом із no-cycles чи entry. У docs/review-2026-10-05.md цього пункту теж немає.
> 
> Severity лишаю P2. Хибний K105 справді валить check (exit 1), але спрацьовує лише у вузькому випадку: правило стоїть на planned-підмодулі файлового модуля, який сам у циклі. Хибне ok для entry стосується лише попередження K103.

## Що зробити

- Для `no-cycles` під модулем і для пунктів `entry` не піднімати planned-ID (і будь-який ID, що не є модулем знімка, крім fn чи класу) до батьківського модуля. Його слід трактувати як префікс, або давати `unverified` «planned: no code yet», як це вже роблять `deny` і `exports`.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/rules.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/rules-area.test.ts` «no-cycles and entry under a planned submodule of a file module do not stand for the parent module» — справжній CLI: `app.x`↔`app.z` у циклі, `planned module app.x.fresh`, `- module app.x.fresh` / `  - no-cycles` → exit 0, без K105, `unverified … \`app.x.fresh\` is planned: no code yet` (було K105, exit 1); `entry` з `app.main` і `app.x.fresh` → K103 для `app.x` і `app.z` (було хибне «every module is reachable»).
- 2026-10-08: Виправлення в `src/rules.ts` (`evaluateOnSnapshot`): `no-cycles` під planned-ID, що не є модулем знімка, дає `unverified` «planned: no code yet», як `deny` і `exports`; пункт `entry` з таким ID не піднімається через `scopeOf` до батька, а сіє лише units під ним (префікс). Зміни локальні — два місця, повідомлення K102 не чіпав.
- 2026-10-08: Контракт: `docs/semantics.md` (абзац про цикли). Перевірки: `node --test tests/rules-area.test.ts tests/cli-rules.test.ts` — 35/35, `npm run typecheck` — ок.
