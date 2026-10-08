# 29: Python: два `from .x import *` з однаковим ім'ям дають хибний K104 absence у `__init__`

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-rule-flow-semantics`, верифікація: confirmed.

**Місце:** `src/exports.ts:196` (рецензент указав `src/exports.ts:188`)

## Що не так

`pickStar` застосовує правило ESM (дві різні декларації дають відсутнє ім'я) і до glob-реекспортів Python. У Python діє останнє зв'язування: `from shop.app import V` працює. Таблиця експортів `app.__init__` втрачає `V`, і правило `exports`, що його називає, дає підтверджений fail «does not export V» замість ok. Навіть консервативний варіант мав би бути unverified, а не absence.

## Сценарій збою

shop/app/a.py: `def V(): …; def f(): …`; shop/app/b.py: `def V(): …; def g(): …`; shop/app/__init__.py: `from .a import *` / `from .b import *`; rules: `- module app.__init__` / `  - exports V, f, g`. keylang: `K104 absence: app.__init__ does not export V`, код 1. Python: `from shop.app import V; print(V())` друкує 2.

## Як відтворити

scratchpad/review/rule-flow-semantics/f7: `node bin/keylang.js check` дає `keylang/rules.md:4:3: K104 absence: app.__init__ does not export V`, `1 fail`, exit 1. Дамп знімка: exports app.__init__ = [f, g]. `python3 use.py` (`from shop.app import V`) друкує `2`.

Доказ верифікатора:

> I reproduced this at HEAD 45cc74d with a fixture I built myself in scratchpad/verify/x-rule-flow-semantics-4-0. HOME and the XDG dirs pointed at the scratch dir.
> 
> Fixture:
> - keylang.json: {"format":2,"languages":["python"],"layers":{"app":"shop/app/**"}}
> - shop/app/a.py: `def V(): return 1` and `def f()`
> - shop/app/b.py: `def V(): return 2` and `def g()`
> - shop/app/__init__.py: `from .a import *` then `from .b import *`
> - keylang/rules.md: `- module app.__init__` / `  - exports V, f, g`
> 
> Run 1, `node /home/kosmodev/pet_project/keylang/bin/keylang.js check`:
> ```
> keylang/rules.md:4:3: K104 absence: `app.__init__` does not export `V`
> 1 fail, 0 unverified, 0 ok
> exit=1
> ```
> Running `python3 use.py` (`from shop.app import V; print(V())`) prints `2`, so V is exported and the last binding (b.V) wins.
> 
> Run 2, the opposite direction, gives a false ok. With the rule changed to `exports f, g`, check prints `0 fail, 0 unverified, 1 ok` and exits 0. That ok reads "convergence: the export table is exactly f, g", yet Python's `dir(shop.app)` contains V.
> 
> Run 3, `keylang map .` in the scratch fixture. In .keylang/index.json the app.__init__ export rows are only f (from app.a) and g (from app.b); V is missing. Both reexport edges are resolved.
> 
> Cause: `pickStar` (src/exports.ts:192-204) does `if (symbols.size > 1) return null;` at :196. That is the ESM rule, and its comment says "ESM exports neither". It is applied to every language, and ModuleExportsInput carries no language. src/rules.ts:458-464 then turns the missing row into a hard K104 absence, because the module is not opaque and has no `*` row. That breaks the semantics.md §4.2 contract ("fail is reliable; when in doubt, unverified").
> 
> Docs: snapshot.md (Python paragraph) says `from .x import *` in `__init__.py` gives `form: reexport` rows. It says nothing about collisions in the export table. The documented `ambiguous` applies only to call edges in the file that does the glob import, which is a conservative outcome. Dropping the name, so that it reads as absent, is documented nowhere. For TS (ESM) and Rust glob re-exports the current behaviour is correct, so only Python is wrong.
> 
> Not in docs/review-2026-10-05.md: item #8 there is a different issue (glob names not resolved at call sites). This is not a regression of that review.
> 
> Severity: I keep P2. It is the wrong result of one rule kind (`exports`), in both directions (false fail and false ok), and only in a narrow case: two glob re-exports with same-named but dif …

## Що зробити

- Передати в ModuleExportsInput мовну семантику star-імпорту і для Python у pickStar брати останнє за порядком stars джерело з цим ім'ям (останнє зв'язування); як мінімум, конфлікт для Python позначати рядком `*`/unverified, а не відкидати ім'я.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/exports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/languages.test.ts` «python: two `from .x import *` in `__init__.py` with one name export the last one…» — справжній CLI: `a.py` і `b.py` з `def V`, `__init__.py` = `from .a import *` / `from .b import *`; `exports V, f, g` → `1 ok` (було K104 absence «does not export `V`»), `exports f, g` → K104 «exports `V` (fn, re-exported from `app.b`)» (було хибне ok).
- 2026-10-08: Виправлення: `ModuleExportsInput.lastStarWins` (`src/exports.ts`) — для Python `pickStar` при різних походженнях бере останнє за порядком stars джерело, а не відкидає ім'я; ESM-правило лишається для TS/JS (і Rust). `src/graph.ts`: прапорець ставиться для модулів Python при побудові `exportInputs` (три рядки, лише там). Зовнішній glob (`from numpy import *`) і далі дає рядок `*`, тож правило — `unverified`, не `ok`.
- 2026-10-08: Контракт: `docs/semantics.md` (рядок про `exports`). Перевірки: `node --test tests/languages.test.ts tests/analyzer.test.ts tests/cli-rules.test.ts tests/metamorphic.test.ts` — 90/90, `npm run typecheck` — ок.
