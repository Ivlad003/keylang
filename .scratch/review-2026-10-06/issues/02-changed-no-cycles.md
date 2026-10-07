# 02: `--changed` бере для `no-cycles` під модулем лише сам модуль, а не його область

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `checker`, верифікація: confirmed.

**Місце:** `src/changed.ts:120` (рецензент указав `src/changed.ts:120`)

## Що не так

Для `module M / no-cycles` зріз `--changed` має scope `[M]`. За semantics.md область такого правила — M, його підмодулі і все, що вони досягають import/re-export. Цикл, який створила зміна файла поза M, дає K105 у повному `check`, а `check --changed` і `hook stop` його відкидають.

## Сценарій збою

`src/app/a.ts` імпортує `../domain/b.ts`, у `rules.md` стоїть `- module app` / `  - no-cycles`. Агент змінює лише `src/domain/b.ts` і додає `import { a } from "../app/a.ts"`. Повний `check` дає `K105 divergence: dependency cycle app.a → domain.b → app.a` (exit 1). `check --changed` дає `0 fail, 0 unverified, 0 ok` (exit 0), `hook stop` повертає `{}`, тож хід з новим циклом проходить. `feature` теж вважає цей K105 успадкованим: `fail.id` = `app`, а ID фічі лежать під ним.

## Як відтворити

Фікстура scratchpad/review/checker/cyc (git, коміт з `module app / no-cycles`, потім зміна лише src/domain/b.ts). `check` дає `keylang/rules.md:4:3: K105 … 1 fail` (exit 1). `check --changed` дає `0 fail, 0 unverified, 0 ok` (exit 0). `echo '{}' | keylang hook stop` повертає `{}`.

Доказ верифікатора:

> Code: src/changed.ts:120 gives `module M / no-cycles` the scope `[rule.under.target]`. `covers()` (line 107) keeps the rule only when a changed module is M, a submodule of M or in M's layer. ChangedInput (lines 13-19) carries only nodes, no import edges, so the reachable part of the area can never be taken into account. Contract: semantics.md:179 and :240 say `area(no-cycles під M, U) :- U є M, підмодуль M, або досяжний з них import / re-export без typeOnly`. cli.md:147 says `--changed` keeps "правила, чия область містить змінений модуль". So domain.b, which app.a reaches, is in the area and the rule should stay in the report. This is not in docs/review-2026-10-05.md (it lists only the feature/--changed narrowing P2 #1 ✔ and the hook exit-code item), so it is a new finding and not a regression.
> 
> My own repro is in scratchpad/verify/checker-1-0/cyc. It uses keylang.json layers app=src/app/**, domain=src/domain/**. src/app/a.ts imports ../domain/b.ts. keylang/rules.md is `# rules` / `- module app` / `  - no-cycles`. I committed with git, then changed only src/domain/b.ts so it adds `import { a } from "../app/a.ts"`. HOME and XDG_* point at the scratch dir.
> - `node .../bin/keylang.js check` → `keylang/rules.md:4:3: K105 divergence: dependency cycle app.a → domain.b → app.a` / `1 fail, 0 unverified, 0 ok`, exit=1
> - `node .../bin/keylang.js check --changed` → `0 fail, 0 unverified, 0 ok`, exit=0
> - `echo '{}' | node .../bin/keylang.js hook stop` → `{}`, exit=0
> - I added keylang/features/pay.md (`# flow pay` / `- trigger app.a.a` / `- step domain.b.b`) and ran `feature pay` → `hint: keylang/rules.md:4:3: rule app: inherited (no file changed since HEAD, no id of this feature): divergence: dependency cycle app.a → domain.b → app.a` and `done`. JSON: done=true, rule gaps=[], info.rules has the K105. thisChange in src/feature-status.ts:348 checks `end.startsWith(named+".")`, and fail.id="app" is not under app.a.a or domain.b.b, so the fail counts as inherited.
> 
> The result is a false ok in check --changed, hook stop and feature for a cycle that this change created. That is P1 by the given scale.

## Що зробити

- Передати в filterChanged ребра import/re-export (без typeOnly) і для `no-cycles` під M брати область як M, його підмодулі й усе, що з них досяжне (як area() у semantics.md), або просто лишати K105 цього правила, коли SCC містить змінений модуль.
- Для `no-cycles` під M брати в `--changed` всю область M (M, підмодулі й усе, що з них досяжне import/re-export без typeOnly), або залишати K105, якщо будь-який модуль його SCC лежить у зміненому файлі; для цього передати в ChangedInput ребра графа чи членів циклу.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/changed.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
