# 06: `paths` вкладеного tsconfig ігноруються, і аліас резолвиться через кореневий tsconfig у чужий файл

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `ts`, верифікація: confirmed.

**Місце:** `src/imports.ts:121` (рецензент указав `src/imports.ts:121`)

## Що не так

`baseUrl`/`paths` читаються лише з кореневого `tsconfig.json` (і з тих, на які він посилається через `references`). `verbatimModuleSyntax` при цьому береться з найближчого tsconfig файла. Тому файл під `apps/web/`, яким керує `apps/web/tsconfig.json` з `"@/*": ["./src/*"]`, резолвиться за кореневими `paths`. Якщо корінь має такий самий аліас, ребро веде в інший файл. Якщо не має, кожен `@/…`-імпорт стає діркою.

## Сценарій збою

Кореневий tsconfig має `paths {"@/*":["src/*"]}` і файл `src/data/db.ts`. `apps/web/tsconfig.json` має `paths {"@/*":["./src/*"]}`, шари `ui: apps/web/src/ui/**`, `data: apps/web/src/data/**`, правило `- deny ui data`. Файл `apps/web/src/ui/page.ts` імпортує `@/data/db` (для tsc це `apps/web/src/data/db.ts`). keylang будує ребро `ui.page -> lib.data.db`, і `check` видає `0 fail, 1 ok`, тобто хибний ok. Без кореневого аліаса той самий імпорт — `unresolved import`, і кожне правило по Next/Vite-застосунку в `apps/*` стає `unverified` (`--strict` — fail).

## Як відтворити

fx/t1b: `EDGE import ui.page -> lib.data.db [resolved]`, `CHECK 0  0 fail, 0 unverified, 1 ok`; fx/t1c (no root tsconfig): `COV unresolved-import ... unresolved import \`@/data/db\``, `0 fail, 1 unverified, 0 ok`

Доказ верифікатора:

> Code at HEAD: the ImportResolver constructor (src/imports.ts:120-123) runs `loadTsconfig(read, configFile)` once, and configFile is always the root `tsconfig.json`/`jsconfig.json`. The result goes into the global `this.paths`/`this.baseUrl`, and `resolveUncached` (:335, :342) and `wouldName` (:453, :455) use those for every importing file. The governing-config lookup (`governingConfig`, nearest tsconfig) feeds only `verbatimModuleSyntax`. `loadTsconfig` (:602) also merges the `paths` of every referenced config into one flat list, with nothing tying a rule to the files it covers. Docs: snapshot.md says imports resolve "через `tsconfig.json` ... і для solution-конфігу з `references` ... `paths` конфігів, на які він посилається". The same doc says a file is governed by the nearest tsconfig. No doc limits `paths` to the root config. ADR-0020 open question 2 covers only the semantic-backend Program, not import resolution. docs/review-2026-10-05.md does not list this, and in fact lists "`tsconfig` `paths`/`baseUrl`" as checked without remarks. So this is not a known item.
> 
> Repro (scratch dir .../verify/ts-1-0, with HOME/XDG pointed at scratch):
> - b/: root tsconfig `{"baseUrl":".","paths":{"@/*":["src/*"]}}` with src/data/db.ts. apps/web/tsconfig.json has `{"baseUrl":".","paths":{"@/*":["./src/*"]}}`. apps/web/src/ui/page.ts does `import { db } from "@/data/db"`. Layers: ui=apps/web/src/ui/**, data=apps/web/src/data/**, lib=src/**. rules.md: `- deny ui data`.
>   `node .../bin/keylang.js check` -> `0 fail, 0 unverified, 1 ok`, exit=0.
>   `keylang map` then index.json edges -> `import ui.page -> lib.data.db resolved`.
>   Real tsc 5.9.3 (`tsc -p apps/web --noEmit --traceResolution`) -> `Module name '@/data/db' was successfully resolved to '.../b/apps/web/src/data/db.ts'`.
> - d/ (same as b, but the import is the relative `../data/db`) -> `K102 divergence: ui.page depends on data.db, which is denied by deny ui data` and `1 fail`. So the correct graph gives fail, and b is a false ok.
> - c/ (no root tsconfig) -> `unverified unresolved import @/data/db (apps/web/src/ui/page.ts:1:1)`, `0 fail, 1 unverified, 0 ok`, and `--strict` gives exit=1.
> - Extra variant e/: the documented solution config at the root (`{"files":[],"references":[{"path":"apps/admin"},{"path":"apps/web"}]}`), where both apps have `@/*:["./src/*"]` -> `import ui.page -> unassigned.apps.admin.src.data.db resolved`, `0 fail, 0 unverified, 1 ok`. This is a false ok even in the documented Vite/monorepo references …

## Що зробити

- Резолвити `paths`/`baseUrl` за tsconfig, що керує файлом (`governingConfig(dirname(fromFile))` + його `extends`/`references`). Кешувати правила для кожного конфіга, а не тримати один глобальний список для всього кореня. `references` solution-конфіга прив'язувати до файлів, які покриває кожен проєкт.
- Резолвити `paths`/`baseUrl` за tsconfig, що керує файлом (`governingConfig`, а для solution-конфігу — referenced-проєкт, чия тека містить файл), з кешем правил на конфіг, замість одного глобального `this.paths`, у якому `references` злито докупи.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔ — файл не в worktree агента (untracked у головному checkout), позначку має поставити той, хто мерджить

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07 — виправлено (гілка `worktree-agent-abfc4b05784ac7a0a`). Регресійний тест `tests/analyzer.test.ts` «imports: `paths`/`baseUrl` come from the tsconfig that governs the importing file, not the root's; a solution config lends each referenced project's `paths` to the files under it» на HEAD давав `0 fail, 0 unverified, 1 ok` (ребро в `lib.*`). Три варіанти фікстури: кореневий і вкладений tsconfig з однойменним `@/*`; лише вкладені tsconfig без кореневого; solution-конфіг у корені з `references` на `apps/admin/tsconfig.app.json` і `apps/web/tsconfig.app.json` — кожен застосунок резолвиться у свій `data/db.ts`. Зміни в `src/imports.ts`: глобальні `this.paths`/`this.baseUrl` прибрано; `optionsFor(fromFile)` бере `governingConfig(dirname(file))` (той самий, що й `verbatimModuleSyntax`), завантажує його через `loadTsconfig` з кешем на конфіг (`tsconfigs`) і кешем на теку (`options`); `loadTsconfig` повертає власні опції та `references` з текою кожного проєкту, і для конфігу без власних `paths` застосовуються лише ті referenced-проєкти, чия тека містить файл (конфіг у корені — усім). `resolveUncached` і `wouldName` користуються `optionsFor`. Кореневий конфіг і далі читається в конструкторі, щоб лишатися входом `snapshotId`. Контракт: `docs/snapshot.md` (абзац «Імпорти резолвляться через…»). Перевірено: `npm run typecheck`, `node --test tests/analyzer.test.ts tests/core.test.ts tests/external-ids.test.ts tests/rules-area.test.ts tests/review-graph.test.ts tests/cli-check.test.ts tests/stale.test.ts tests/fingerprint.test.ts` (133/133), `node bin/keylang.js check` (0 fail), `node bin/keylang.js map --check` (карту перегенеровано). Повний `npm test` не запускався за інструкцією.
