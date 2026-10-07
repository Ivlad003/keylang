# 10: Python `from m import *` не приносить імен, які m імпортує (модуль без `__all__`): дірка, а із зовнішнім glob — хибний static fail

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `langs`, верифікація: confirmed. Регресія виправлення з ✔ у [рев'ю 2026-10-05](../../../docs/review-2026-10-05.md).

**Місце:** `src/graph.ts:684` (рецензент указав `src/extract/python.ts:39`)

## Що не так

Без `__all__` Python імпортує через `*` усі імена простору модуля без `_`, зокрема ті, що модуль сам імпортував (`from .util import helper`). Таблиця експортів звичайного (не `__init__`) модуля keylang імпортів не містить (`reexported` дає false поза пакетом), тож `globbed('helper')` порожній. Без інших glob виклик стає діркою «call through a local value», і це рівно симптом ✔-пункту №8 рев'ю. Якщо у файлі є ще й glob стандартної бібліотеки чи пакета (`from math import *`), `globOrigin()` повертає `external`: виклик мовчки рахується зовнішнім, і потік отримує хибний `static fail`.

## Сценарій збою

`app/util.py: def helper()`, `app/base.py: from .util import helper; def own()`, `app/main.py: from math import *; from .base import *; def run(): return helper() + own() + sqrt(4)`. Потік `trigger app.main.run / step app.util.helper`. `keylang check`: `static fail app.util.helper: absence: no call path from app.main.run …`, exit 1, хоча Python виконує `helper` (запуск друкує 5.0). Без рядка `from math import *` вердикт — `static unverified … call through a local value helper`.

## Як відтворити

Фікстура scratchpad/review/langs/py4. `keylang map`: ребро лише `app.main.run -> app.base.own`, у статистиці `2 external`; `keylang check` -> `1 fail`. Після видалення `from math import *`: `COV dynamic-call … call through a local value helper`, `static unverified`. `python3 -c 'from app.main import run; print(run())'` -> 5.0.

Доказ верифікатора:

> I reproduced this with my own fixture in scratchpad/verify/langs-2-0/. HOME and the XDG dirs pointed at scratch.
> 
> Files:
> - keylang.json: {"languages":["python"],"layers":{"app":["app/**"]}}
> - keylang/flows.md: `# flow run` / `- trigger app.main.run` / `  - step app.util.helper`
> - app/__init__.py: empty
> - app/util.py: `def helper(): return 1`
> - app/base.py: `from .util import helper` + `def own(): return 2` (no `__all__`)
> - app/main.py: `from math import *` / `from .base import *` / `def run(): return helper() + own() + sqrt(4)`
> 
> Results:
> - withmath: `node .../bin/keylang.js map` reports `calls 1 resolved, 2 external, 0 dynamic`. The helper call is counted as external. `keylang check` gives `static fail app.util.helper: absence: no call path from app.main.run; ... add a call to app.util.helper ...`, then `1 fail, 0 unverified, 2 ok`, exit=1. Python itself (`python3 -c 'from app.main import run; print(run())'`) prints 5.0, so helper does run.
> - nomath (no math glob): map gives `1 dynamic`, and check gives `static unverified ... call through a local value helper at app/main.py:5:12`, exit 0. This is the old hole from review item 8.
> - Control with `__all__ = ["helper","own"]` in base.py: `static ok app.util.helper: called from app.main.run`. So the bug is limited to modules without `__all__`.
> - Related, safe case: an explicit `from .base import helper` gives `unresolved call helper` and is unverified, not a false fail.
> 
> Mechanism:
> - src/extract/python.ts:39. The `reexported` callback for a plain module (not `__init__.py`) without `__all__` returns false for imported names (`pkg && isPublic(local)`). So helper is missing from base's export table.
> - src/graph.ts:670-679. `globbed('helper')` finds nothing in that table.
> - src/graph.ts:684-687, used at :919-920. `globOrigin()` then sees the stdlib glob of math and returns "external", so the call is silently counted as external and gets no edge. The flow check then reports absence as a static fail.
> 
> Python semantics (no `__all__`, so `*` imports every public name in the namespace, imported ones included) are confirmed by the run.
> 
> Docs: docs/snapshot.md:30 says `from m import *` binds "the public names of m (its exports table: `__all__` or names without `_`)". It also says a stdlib or package glob makes such a call external, and it defines a reexport for a module without `__all__` only inside `__init__.py`. So the exclusion of imported names follows only indirectly from "its exports table". Nothing documents that a …

## Що зробити

- Для звичайного Python-модуля без `__all__` додавати публічні імпортовані імена до таблиці експортів, яку бачить glob (без ребра reexport). Або в globOrigin() вважати такий репо-джерело glob 'unknown', щоб stdlib/пакетний glob не перетворював виклик на external і не давав хибного fail.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/graph.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
