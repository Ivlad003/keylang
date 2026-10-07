# 28: `export *` з двох модулів з однойменними значеннями: keylang вважає ім'я експортованим, ESM — ні

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-rule-flow-semantics`, верифікація: confirmed.

**Місце:** `src/exports.ts:195` (рецензент указав `src/exports.ts:187`)

## Що не так

`pickStar` перевіряє конфлікт лише за непорожніми `symbol`. Значення (`export const V`) мають symbol null, тож два різні оголошення `V` у двох джерелах `export *` не конфліктують, і береться перше. semantics.md (рядок про `exports`) і коментар самої функції кажуть, що ім'я, яке два джерела дають різними оголошеннями, ESM не експортує. Звідси хибний K104 «exports V», а якщо `V` у списку — хибне ok.

## Сценарій збою

src/app/a.ts: `export const V = 1; export function f(){}`; src/app/b.ts: `export const V = 2; export function g(){}`; src/app/index.ts: `export * from "./a.ts"; export * from "./b.ts";`; rules `- module app.index` / `  - exports f, g`. keylang: `K104 divergence: app.index exports V (value, re-exported from app.a)` і код 1. Node: `Object.keys(ns)` = [f, g], а `import { V }` дає SyntaxError «conflicting star exports for name 'V'».

## Як відтворити

scratchpad/review/rule-flow-semantics/f3: `node bin/keylang.js check` дає `keylang/rules.md:4:3: K104 divergence: app.index exports V (value, re-exported from app.a), which is not listed in exports`, exit 1. `node -e 'import("./src/app/index.ts").then(ns=>console.log(Object.keys(ns)))'` дає `[ 'f', 'g' ]`. `import { V } from './src/app/index.ts'` дає `SyntaxError: … contains conflicting star exports for name 'V'`.

Доказ верифікатора:

> I reproduced this myself with a separate fixture in scratchpad/verify/x-rule-flow-semantics-3-0, using HOME/XDG pointed at the scratch dir. The fixture is the one from the claim:
> - src/app/a.ts: `export const V = 1; export function f(){...}`
> - src/app/b.ts: `export const V = 2; export function g(){...}`
> - src/app/index.ts: `export * from "./a.ts"; export * from "./b.ts";`
> - keylang/rules.md: `- module app.index` / `  - exports f, g`
> 
> Results:
> 1. `node /home/kosmodev/pet_project/keylang/bin/keylang.js check` prints `keylang/rules.md:4:3: K104 divergence: \`app.index\` exports \`V\` (value, re-exported from \`app.a\`), which is not listed in \`exports\``, then `1 fail, 0 unverified, 0 ok`, and exits with 1. This is a false fail.
> 2. With `exports f, g, V` the same command prints `0 fail, 0 unverified, 1 ok` and exits with 0. This is a false ok.
> 3. Node v24.20.0 (package.json type=module): `Object.keys(ns)` gives `[ 'f', 'g' ]`, and `import { V } from "./src/app/index.ts"` gives `SyntaxError: The requested module './src/app/index.ts' contains conflicting star exports for name 'V'`.
> 4. Control case: I added `export function h(){}` to both a.ts and b.ts. keylang correctly leaves `h` out (no K104 for h), so only values leak through.
> 
> Cause: src/graph.ts:1168-1170 (exportInput) gives `export const` the target `{kind:"none"}`, so the entry has symbol null. In src/exports.ts:195-196, pickStar compares only non-null symbols (`filter(s => s !== null)`). Two null entries from different sources therefore never conflict, and line 197 takes `known[0]`, which is app.a.
> 
> Contract: docs/semantics.md:178 says that a name two `export *` sources give as different declarations is not exported by ESM. pickStar's own JSDoc says the same, so this is not intended behaviour.
> 
> docs/review-2026-10-05.md does not list it as an open item. Line 67 even lists `export * from` as checked with no remarks.
> 
> Severity stays P2. It is a wrong result of one rule kind (`exports`) and breaks a documented contract. The case is narrow: tsc would reject the same collision in TS with TS2308, but plain JS or a project without tsc can reach it.

## Що зробити

- У pickStar порівнювати походження імені, а не лише непорожні symbol: для записів із symbol null брати ключ «модуль-джерело + локальне ім'я» (кінець ланцюжка реекспортів). Якщо ключі різні, повертати null, як для двох різних symbol.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/exports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
