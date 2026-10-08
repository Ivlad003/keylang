# 21: `import("./a").T` і `typeof import("./a")` у типах дають runtime-ребро, і no-cycles бачить хибний цикл

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `ts`, верифікація: confirmed.

**Місце:** `src/extract/ts.ts:1049` (рецензент указав `src/extract/ts.ts:1040`)

## Що не так

`collectDynamicImports` бере кожен `call_expression` з `import`, зокрема в позиції типу: в анотації, `type X = import("./a").A`, `typeof import("./a")`. Такий запис стає звичайним ImportFact без `typeOnly`. За semantics.md залежність лише від типів не утворює циклу, бо модуль її не завантажує. Цей вид type-only залежності `no-cycles` рахує як runtime-імпорт.

## Сценарій збою

`src/a.ts` містить `import { fb } from "./b"`, `export type A = number`, а `fa()` викликає `fb()`. `src/b.ts` містить `export function fb(x: import("./a").A): void {}`. Правило `- no-cycles`: `keylang check` видає `K105 divergence: dependency cycle app.a → app.b → app.a` (1 fail), хоча tsc стирає цей імпорт, і під час виконання циклу немає. Те саме дають `export type B = import("./a").A` і `let x: typeof import("./a")`. JSDoc-форма в коментарі не спрацьовує.

## Як відтворити

fx/t9b variants: `EDGE import app.b -> app.a [resolved] :: import("./a")` (no typeOnly), `CHECK 1 ... K105 divergence: dependency cycle app.a → app.b → app.a`, `1 fail` for all three TS type-position forms

Доказ верифікатора:

> I reproduced this with the real CLI. Fixtures are in scratchpad/verify/ts-3-0/{base,v1,v2,v3}.
> 
> Setup, the same in every variant:
> - keylang.json: `{"languages":["typescript"],"layers":{"app":"src/app/**"}}`
> - keylang/rules.md: `# rules\n\n- no-cycles`
> - src/app/a.ts: `import { fb } from "./b"; export type A = number; export function fa(){ fb(1); }`
> 
> Only src/app/b.ts changes:
> - base: `import type { A } from "./a"; export function fb(x: A): void {}`
> - v1: `export function fb(x: import("./a").A): void {}`
> - v2: `export type B = import("./a").A; export function fb(x: B): void {}`
> - v3: `let x: typeof import("./a"); export function fb(x2: number): void {}`
> 
> Command, run in each fixture dir: `node /home/kosmodev/pet_project/keylang/bin/keylang.js check` (HOME and XDG_* pointed at the scratch dir).
> 
> Observed:
> - base: `0 fail, 0 unverified, 1 ok`, exit 0.
> - v1, v2, v3: `keylang/rules.md:3:1: K105 divergence: dependency cycle app.a → app.b → app.a` / `1 fail, 0 unverified, 0 ok`, exit 1.
> 
> After `keylang map` in the scratch fixtures, .keylang/index.json shows:
> - base: `{"k":"import","s":"app.b","t":"app.a","text":"import type { A } from \"./a\";","typeOnly":true}`
> - v1, v2, v3: `{"k":"import","s":"app.b","t":"app.a","r":"resolved","text":"import(\"./a\")"}`, with no typeOnly.
> 
> AST check with src/extract/treesitter.ts withTree: each form parses as a `call_expression` inside a type context:
> - `required_parameter > type_annotation > member_expression > call_expression`
> - `type_alias_declaration > member_expression > call_expression`
> - `type_annotation > type_query > call_expression`
> 
> collectDynamicImports (src/extract/ts.ts:1024-1055; `isImport` at :1040, `add(node, spec, false)` at :1049) treats every such call as a runtime import and never sets typeOnly.
> 
> Contract: docs/semantics.md:179 says a dependency that is only on types "під час виконання модуль її не завантажує, тож циклу вона не утворює". The listed forms (import type, export type … from, inline type) are examples. tsc erases import-type expressions just like `import type`, so this breaks the documented contract of one rule. That makes it a false K105 fail, not intended behaviour.
> 
> docs/review-2026-10-05.md does not list this. Item 14 there covers only the `import type` statement forms, so this is not a known open item.
> 
> Severity: I keep P2. It is a false fail of one rule, it only happens with the TS import-type expression form, and the error is in the conservative direction (a fail, not a false ok).

## Що зробити

- У collectDynamicImports ставити fact.typeOnly = true, коли `import(...)` має предка-тип (type_annotation, type_query, значення type_alias_declaration, type_arguments тощо), щоб no-cycles його пропускав, а allow/deny/layers бачили як звичайну залежність.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/extract/ts.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/analyzer.test.ts` «no-cycles: `import("./a").A` and `typeof import("./a")` in a type are type-only dependencies…» — справжній CLI, `- no-cycles`, `a.ts` імпортує `./b`; чотири варіанти `b.ts` (параметр `import("./a").A`, `type B = import("./a").A`, `let x: typeof import("./a")`, `Array<import(...)>`/тип повернення/`as import(...)` у тілі): `0 fail, 0 unverified, 1 ok`, ребро `app.b → app.a` має `typeOnly: true`. Контроль: runtime `await import("./a")` і далі дає K105. До виправлення — K105 для всіх варіантів.
- 2026-10-08: Виправлення в `src/extract/ts.ts`: `collectDynamicImports` позначає `import(…)` `typeOnly`, коли `inTypePosition` (предок — `type_annotation`, `type_query`, `type_arguments`, `type_alias_declaration`, `interface_declaration`, `implements_clause` тощо, або тип-операнд `as`/`satisfies`; пошук зупиняється на блоці інструкцій). Runtime `import()` у тому самому рядку знімає `typeOnly` з уже доданого факту. `EXTRACTOR_VERSION` m1.14 → m1.15.
- 2026-10-08: Контракт: `docs/semantics.md` (абзац про цикли) і `docs/snapshot.md` (TypeScript, `typeOnly`) — `import("./a")` у позиції типу. Перевірки: `node --test tests/analyzer.test.ts tests/languages.test.ts tests/cli-rules.test.ts` — 75/75, `npm run typecheck` — ок.
