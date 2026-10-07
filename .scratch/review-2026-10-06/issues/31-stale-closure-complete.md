# 31: Зміна константи модуля, поля класу чи об'єктної таблиці не робить прозу stale, а closure лишається `complete`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-stale-manifests-external-ids`, верифікація: confirmed.

**Місце:** `src/snapshot.ts:462` (рецензент указав `src/snapshot.ts:462`)

## Що не так

Closure fn хешує лише її тіло і closure-и тих, кого вона викликає. Значення, які fn читає (`export const LIMIT`, `limit = 100` у класі, `const rates = {...}`), вузлів не мають і в хеш не потрапляють. Хеш модуля чи класу в `snapshotBaseline` теж бере лише fn і type під ним. Через це `complete: true`, хоча snapshot.md каже, що за неповного хешу «незмінний хеш не означає незмінної поведінки». Виходить хибний `fresh` без позначки `incomplete`.

## Сценарій збою

Опис кроку `main.config.cap` каже «Caps at 100», а модуля `main.config` — «at most 100 items». У коді `LIMIT = 100` стає `LIMIT = 5`, `limit = 100` у класі стає `3`, `rates.eu` змінюється з 0.2 на 0.5. `check --stale --strict` дає `0 stale, 0 new, 3 fresh, 0 incomplete` і exit 0: CI-gate пропускає прозу, яка вже бреше. Так само не застарівають збережені пояснення цих вузлів.

## Як відтворити

scratchpad/…/const1: TS `export const LIMIT=100` + `cap()` і Python `MAX = 100` + `cap()`. Після `check --stale --accept` значення 100 змінено на 5, і `check --stale --strict` дає `0 stale, 0 new, 3 fresh, 0 incomplete`, exit 0. scratchpad/…/const2: поле класу `limit = 100` → 3 і `const rates = { eu: 0.2 }` → 0.5 дають `0 stale … 3 fresh`, exit 0.

Доказ верифікатора:

> I reproduced this at HEAD 45cc74d through the real CLI. Fixture: scratchpad/verify/x-stale-manifests-external-ids-2-0/c1. Config: keylang.json {"languages":["typescript"],"layers":{"main":["src/**"]}}. The file src/config.ts has `export const LIMIT = 100`, `const rates = { eu: 0.2 }`, `cap(n){return Math.min(n, LIMIT)}`, `tax(x){return x*rates.eu}` and `class Box { limit = 100; fits(n){return n <= this.limit} }`. Specs: keylang/flows/cfg.md is a flow with descriptions on cap, tax and Box.fits. keylang/flows/mod.md is a `# map` with prose on `module config` ("Holds at most 100 items.") and `module Box`.
> 
> Commands (HOME/XDG pointed at the scratch dir):
>   node .../bin/keylang.js check --stale --accept  -> accepted 5 fingerprints
>   node .../bin/keylang.js check --stale --strict  -> "0 stale, 0 new, 5 fresh, 0 incomplete", exit=0
>   sed: LIMIT = 100 -> 5, limit = 100 -> 3, eu: 0.2 -> 0.5
>   node .../bin/keylang.js check --stale --strict  -> "0 stale, 0 new, 5 fresh, 0 incomplete", exit=0 (baseline.json unchanged)
> 
> Contrast: putting the literal inline (`Math.min(n, LIMIT)` -> `Math.min(n, 7)`) gives "2 stale ... exit=1" for cap and for module config. So the same change in behaviour is caught when it is a literal in the body and missed when it is a named constant.
> 
> Python: scratchpad/.../py has `MAX = 100` and `def cap(n): return min(n, MAX)`. After accept, changing MAX to 5 still gives "0 stale, 0 new, 1 fresh, 0 incomplete", exit=0.
> 
> Code path:
> - src/snapshot.ts:435-472 `closures()`: the closure is built only from members' own fingerprints plus the closures of call targets (`adj` = node.calls). `complete` is false only for unresolved or dynamic calls, holes or a missing fingerprint. A read of a module-level or class value is not a node or an edge, so it never enters the hash and never marks the closure incomplete.
> - src/explanations.ts:96 `snapshotBaseline()`: a module or class hashes only `deps` plus the closures/fingerprints of the fn/type nodes under it, so top-level non-fn code of a module is invisible. Its own docstring says "so a change inside makes its explanation stale", and this case contradicts it.
> - src/stale.ts:133 `closureComplete` reports nothing.
> 
> Contract: docs/design.md §4.4 requires the fingerprint to cover "релевантних залежностей" and says "невідома залежність позначає неповноту цієї перевірки". docs/snapshot.md says an unchanged hash does not mean unchanged behaviour only when complete:false, which implies complete:true does cover behaviour.  …

## Що зробити

- Додати до fingerprint/closure fn нормалізований текст значень верхнього рівня та полів класу, які вона читає за іменем, а в базовий хеш модуля/класу — його код поза fn/type; якщо ціль читання не розв'язана, ставити complete:false, щоб твердження ставало incomplete.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/snapshot.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
