# 43: wire не впізнає module node18/node20 і пише імпорти без розширення

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `emit`, верифікація: confirmed.

**Місце:** `src/wire-gen.ts:198` (рецензент указав `src/wire-gen.ts:199`)

## Що не так

`importExtension` вважає розв'язання Node-подібним, лише коли `moduleResolution ?? module` дорівнює `node16` або `nodenext`. Але `"module": "node18"` чи `"node20"` (TypeScript 5.8/5.9) неявно задають `moduleResolution: node16`. Для таких проєктів згенерований `keylang.gen.ts` має відносні імпорти без розширення: `tsc` проєкту їх відкидає (TS2835), а Node ESM не може завантажити файл. Тобто наміру контракту «для node16/nodenext — розширення часу виконання» не виконано, і wire видає непридатний файл.

## Сценарій збою

tsconfig `{"compilerOptions":{"module":"node20",…}}` і `package.json` з `"type":"module"`. `keylang wire` пише `import { createPurchase as app_purchase_createPurchase } from "./src/app/purchase";` (код 0). `tsc -p .` дає `TS2835: Relative import paths need explicit file extensions … Did you mean './src/app/purchase.js'?` на кожен імпорт. `import('./keylang.gen.ts')` падає з `ERR_MODULE_NOT_FOUND …/src/app/purchase`. З `nodenext` той самий проєкт дає `.js`, і `wire --check` позначає файл як stale.

## Як відтворити

Копія tests/fixtures/wiring-shop у scratchpad/review/emit/wire20, tsconfig з module node20 і package.json type:module. `keylang wire` → `keylang.gen.ts: written`, імпорти `"./src/app/purchase"` без розширення; `node_modules/typescript/bin/tsc -p .` (TS 5.9.3) → 5× TS2835 на keylang.gen.ts; `node -e "import('./keylang.gen.ts').then(m=>m.wire())"` → `ERR ERR_MODULE_NOT_FOUND`; після заміни на nodenext `keylang wire --check` → `stale`, код 1.

Доказ верифікатора:

> I reproduced this myself at the current code. In src/wire-gen.ts:198-199, `importExtension` computes `String(options.moduleResolution ?? options.module ?? "").toLowerCase()` and only accepts "node16" or "nodenext". For `module: "node20"` or `"node18"` with no explicit moduleResolution, the value is "node20" or "node18". The function then returns "none", so `specifier` drops the `.ts` extension. TS 5.9.3 (the repo's own node_modules) derives moduleResolution "node16" for both: `tsc --showConfig` prints `"module": "node20"` and `"moduleResolution": "node16"`.
> 
> Fixture: scratchpad/verify/emit-2-0/wire20. It is a copy of tests/fixtures/wiring-shop with:
> - src imports changed to `.js`;
> - tsconfig set to `{module:"node20", strict, noEmit, types:[]}`, without allowImportingTsExtensions or moduleResolution;
> - package.json `{"type":"module"}`.
> 
> HOME and XDG were pointed at the scratch dir.
> 
> 1) `node .../keylang/bin/keylang.js wire` printed `keylang.gen.ts: written` and exit=0. The output contains `import { createPurchase as app_purchase_createPurchase } from "./src/app/purchase";` (no extension), and likewise for store, db, logged and memory-db.
> 2) `node .../node_modules/typescript/bin/tsc -p .` gave 5x `keylang.gen.ts(3,63): error TS2835: Relative import paths need explicit file extensions ... when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './src/app/purchase.js'?` and exit=2.
> 3) `node -e "import('./keylang.gen.ts')..."` gave `ERR ERR_MODULE_NOT_FOUND Cannot find module '.../wire20/src/app/purchase'`.
> 4) After changing to `module: "nodenext"`, `keylang wire --check` printed `keylang.gen.ts: stale, run \`keylang wire\`` with exit=1. A fresh wire on a copy produced `"./src/app/purchase.js"`, and tsc exited 0.
> 5) With `module: "node18"`, tsc again reported moduleResolution node16 and 5x TS2835.
> 
> Contract: docs/cli.md:84 says that for `node16`/`nodenext` imports carry the runtime extension, and that `tsc` of the project checks the types. node18 and node20 resolve as node16, so the generated file breaking this contract is a real bug and not intended behaviour. It is not listed in docs/review-2026-10-05.md: grep for node18, node20, importExtension, nodenext and node16 found nothing there. The archive review 2026-09-28 only covered `.js.js` and `.mts` under nodenext and `extends`, so this is not a known open item.
> 
> Severity: P2. One command (`wire`) produces a file that does not compile for a valid, documented-stable TS setting. It is not P1, because ` …

## Що зробити

- Якщо moduleResolution не задано, виводити його з module так само, як tsc: node16/node18/node20 → node16, nodenext → nodenext. Тоді для них повертати "js" (або перевіряти /^node(16|18|20|next)$/). Додати тест wire з module node20.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/wire-gen.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
