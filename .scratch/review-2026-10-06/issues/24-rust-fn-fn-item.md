# 24: Rust: вкладена `fn` усередині fn не затіняє однойменний item модуля, тож keylang вигадує ребро

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `langs`, верифікація: confirmed.

**Місце:** `src/extract/rust.ts:308` (рецензент указав `src/extract/rust.ts:308`)

## Що не так

`boundNames` збирає параметри, `let`, `for`, `if let`/`while let`, `match` і параметри closure, але не імена вкладених `function_item` (і не параметри вкладених fn). У Rust item, оголошений у блоці fn, затіняє item модуля з тим самим ім'ям. keylang натомість резолвить виклик у функцію модуля і пише підтверджене ребро без `closure`.

## Сценарій збою

`src/main.rs`: `fn helper() {}  pub fn run() { fn helper() {} helper(); }`. `keylang map` пише `EDGE call app.main.run -> app.main.helper` (рядок 7), хоча `run` викликає свою вкладену `helper`. Потік зі `step app.main.helper` під `run` отримає хибний `static ok`, а `check --stale` і escapes бачать неіснуючий шлях. Так само `fn inner(helper: fn()) { helper(); }` усередині fn веде в module `helper`.

## Як відтворити

Фікстура scratchpad/review/langs/rs1, `keylang map` -> `EDGE call app.main.run -> app.main.helper 7`. Без однойменного item модуля вкладена `inner` дає лише dynamic-call.

Доказ верифікатора:

> I reproduced it at current HEAD with a fixture of my own. The fixture is scratchpad/verify/langs-4-0/rsnest, with HOME and XDG_* pointed at scratch.
> - `Cargo.toml`: package `app`.
> - `keylang.json`: `{"languages":["rust"],"layers":{"app":["src/**"]}}`.
> - `src/main.rs` (line 1) `fn helper() {}`.
> - (3-6) `pub fn run() { fn helper() {} helper(); }`.
> - (8-13) `pub fn run_param() { fn inner(helper: fn()) { helper(); } inner(other); }`.
> - (15) `fn other() {}`.
> - Control (17-20): `pub fn control() { let helper = other; helper(); }`.
> 
> Commands:
> - `node .../bin/keylang.js map`: the map shows `fn run … calls app.main.helper` and `fn run_param … calls app.main.helper`. The summary line is "calls 5 resolved, 0 external, 1 dynamic, 1 unresolved".
> - `keylang check --explain-edge app.main.run app.main.helper`: "call resolved syntactic src/main.rs:5:5-5:13 `helper` app.main.run → app.main.helper". This edge has no `closure`.
> - For `run_param`: "call resolved syntactic src/main.rs:10:9-10:17 `helper` app.main.run_param → app.main.helper" (`closure:true` in .keylang/index.json).
> - For `control` (control case): "unresolved src/main.rs:19:5 shadowed by local `helper`". The `let` shadowing works; the nested fn does not.
> - Flow `keylang/flows/f.md` (`- trigger app.main.run` / `  - step app.main.helper`): `keylang check` prints "static ok app.main.helper: called from app.main.run" (exit 0). This is a false ok. The same flow from `control` correctly gives "static unverified … shadowed by local `helper`".
> 
> Rust semantics confirmed with rustc: a file with a module `helper` that prints "module" and a nested `helper` in `run` that prints "nested" prints "nested", then "module". The block item shadows the module item.
> 
> Cause: `boundNames` (src/extract/rust.ts:308-336) collects the outer fn's parameters, let/for/let_condition/match and `closure_parameters`. It does not collect the names of nested `function_item`s or the `parameters` of nested `function_item`s. Calls go through `bodyCalls`, where `bound` = `boundNames(outer fn)`, so a bare identifier `helper` resolves to the module item. By contrast, `valueRefs` (rust.ts:485) does merge `boundNames` of a nested `function_item`, so the parameter case is handled there but not in the call path.
> 
> Contract: docs/snapshot.md:28 lists what shadows: parameter, let, for, if let/while let, match, closure parameter. Nested fn items are not mentioned. Calls in a nested fn only get `closure: true`. Nothing documents that a call to a nested fn should  …

## Що зробити

- У boundNames додавати ім'я кожного вкладеного function_item (як "local") і параметри вкладених fn (або в bodyCalls зливати boundNames(node) при вході у function_item, як у valueRefs:485), щоб виклик давав unresolved «shadowed», а не ребро в item модуля.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/extract/rust.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
