# 22: Відносний імпорт модуля з `.d.ts` стає діркою, і deny цього модуля переходить в unverified

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `ts`, верифікація: confirmed.

**Місце:** `src/imports.ts:470` (рецензент указав `src/imports.ts:470`)

## Що не так

`probeCandidates` перебирає `EXTS` (`.ts`, `.tsx`, …, `.cjs`) та index-файли, але не `.d.ts`/`.d.mts`/`.d.cts`. tsc резолвить `./types` у `types.d.ts`. keylang дає `unresolved import`, хоча знайдений `.d.ts` `notIndexed` пропустив би мовчки як навмисно виключений файл оголошень. Через це кожне правило `deny`/`layers` для модуля, що імпортує власний чи згенерований `.d.ts` (`./env`, codegen `./graphql`), стає `unverified`, а під `--strict` — fail.

## Сценарій збою

`src/types.d.ts` містить `export interface Order {…}`, а `src/a.ts` — `import type { Order } from "./types"`. Правило `- deny app external` дає `unverified unresolved import \`./types\``, map — `warning: src/a.ts:1: unresolved import \`./types\``, і з'являється unresolved type-ребро `Order`.

## Як відтворити

fx/t8: `COV unresolved-import src/a.ts:1 app.a :: unresolved import \`./types\``, `CHECK 0 keylang/rules.md:3:1: unverified unresolved import \`./types\` (src/a.ts:1:1)  0 fail, 1 unverified, 0 ok`

Доказ верифікатора:

> I reproduced this at the current HEAD.
> 
> The fixture is under scratchpad/verify/ts-4-0/fx and contains:
> - keylang.json: {"layers":{"app":["src/**"]}}
> - src/types.d.ts: `export interface Order { id: string }`
> - src/a.ts: `import type { Order } from "./types"; export function total(o: Order)...`
> - keylang/rules.md: `- deny app external`
> 
> Commands (HOME and XDG_* pointed at scratch), with K="node /home/kosmodev/pet_project/keylang/bin/keylang.js":
> - `$K map` printed:
>   `warning: src/a.ts:1: unresolved import \`./types\``
>   `... 1 unresolved import(s)`
> - `$K check --strict` printed:
>   `keylang/rules.md:3:1: unverified unresolved import \`./types\` (src/a.ts:1:1)`
>   `0 fail, 1 unverified, 0 ok`
>   It exited with code 1.
> 
> tsc compiles the same fixture cleanly (`tsc -p .`, exit 0). `--traceResolution` shows tsc trying `types.ts` and `types.tsx`, then: "File '.../src/types.d.ts' exists - use it as a name resolution result."
> 
> Control (ctl2): I renamed the target to another file on the built-in exclude list, src/types.spec.ts, and imported it as "./types.spec". The result was silent: `0 fail, 0 unverified, 1 ok`. So the same built-in exclude list gives a silent ok for a test file but a hole for a declaration file.
> 
> Root cause: in src/imports.ts:465-471, `probeCandidates` tries the path as written, then the NodeNext swaps, then `c + EXTS` and `index + EXTS`. EXTS (line 72) has no `.d.ts`, `.d.mts` or `.d.cts`, so `./types` (and also `./types.js` under NodeNext) never reaches `types.d.ts`. The import comes back unresolved and graph.ts:400-404 records it as a hole.
> 
> If `src/types.d.ts` were found, graph.ts:432-438 would look it up with `notIndexed`. `isExcluded` matches DEFAULT_EXCLUDE (`**/*.d.ts`, config.ts:127,589), so `notIndexed` returns null and the import is skipped silently ("Left out on purpose: tests, declaration files…").
> 
> This breaks a documented contract. docs/snapshot.md says declaration files ("тести, файли оголошень, `exclude`… залишаються поза графом мовчки") stay out of the graph silently. Treating `.d.ts` as "не джерело" (not a source) is documented only for workspace package entries; that is what `packageEntry` at imports.ts:309-311 does on purpose, and it does not cover relative imports.
> 
> This is not listed in docs/review-2026-10-05.md, so it is a new finding.

## Що зробити

- У probeCandidates після EXTS додати кандидати `.d.ts`/`.d.mts`/`.d.cts` (і `index.d.ts`), щоб notIndexed мовчки пропускав файл оголошень; packageEntry і далі пропускає `.d.ts`; до DEFAULT_EXCLUDE додати `**/*.d.mts` і `**/*.d.cts`.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
