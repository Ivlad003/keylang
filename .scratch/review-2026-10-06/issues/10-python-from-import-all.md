# 10: Python `from m import *` не приносить імен, які m імпортує (модуль без `__all__`): дірка, а із зовнішнім glob — хибний static fail

**Status:** resolved

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

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/graph.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійний тест `tests/languages.test.ts` «python: `from m import *` of a module without `__all__` brings the names m imports…» — фікстура тікета через справжній CLI (`app/util.py`, `app/base.py` без `__all__` з `from .util import helper`, `app/main.py` з `from math import *` і `from .base import *`, потік `trigger app.main.run / step app.util.helper`). До виправлення: `map` — `calls 1 resolved, 2 external` (`helper` зараховано пакету), `check` — `static fail`. Очікується: `calls 2 resolved, 1 external, 0 dynamic`, ребро `app.main.run -> app.util.helper`, жодного ребра `reexport`, таблиця `app.base` = `helper` (symbol `app.util.helper`, from `app.util`, без form) і `own`; `check` — `static ok`, exit 0; без `from math import *` — те саме. Далі правило `exports own` для `app.base` → K104 «exports `helper` (fn, imported from `app.util`)», `exports own, helper` — чисто. Останній блок: `for flag in (1,)` на верхньому рівні `base.py` і виклик `mystery()` поруч із `sqrt(4)` → `calls 1 resolved, 0 external, 2 dynamic`, дірка «call through `mystery`, a name from a glob import keylang does not follow», рядок `*` таблиці `app.base` з причиною «a module-level `for` binds names keylang does not list», правило `exports` — `unverified` з цією причиною.
- 2026-10-07: Виправлення. `src/extract/python.ts`: для модуля без `__all__`, що не є `__init__.py`, публічні імена імпортів верхнього рівня (`import_statement`/`import_from_statement` серед `topLevel`, зокрема під `if`/`try`) додаються в таблицю експортів рядком `kind: value` без `reexport` — `exportInput` у graph.ts сам знаходить символ через імпорт і ставить `from`; ребро лишається `import` (той самий вигляд, що TS дає `import { a } from "./x"; export { a }`). Там само: `FileFacts.exportsIncomplete` (новий необов\'язковий рядок у `src/extract/facts.ts`) — причина, коли верхній рівень модуля без `__all__` прив\'язує імена, яких таблиця не перелічує (`for`, `while`, `with`, `match`, `except … as`, tuple-присвоєння); `src/graph.ts` перетворює його на джерело `*` з невідомим вмістом (`starFrom({ target: null, reason })`), тож `globOrigin()` каже `unknown`, а не `external`, через наявний механізм `UNKNOWN_EXPORT`. Наслідок, який прийнято: поруч із таким glob і `sqrt` з `from math import *` стає діркою, а не зовнішнім викликом — як поруч із нерозв\'язаним glob (`unknown` переважає `external`, graph.ts `globOrigin`). `src/rules.ts`: K104 для зайвого імені з `from` без форми пише «(fn, imported from `m`)», бо таке ім\'я — не оголошення модуля. Другий варіант з «Що зробити» (вважати glob будь-якого модуля без `__all__` unknown) не брав: він зробив би правило «glob stdlib → зовнішній виклик» майже мертвим для Python.
- 2026-10-07: Контракт: `docs/snapshot.md` (Python: `from m import *` без `__all__` приносить і імпортовані імена; модуль із неперелічуваними прив\'язками — рядок `*`, дірка замість зовнішнього виклику, `exports` unverified; імпортоване публічне ім\'я звичайного модуля в таблиці без `form: reexport` і без ребра), `docs/semantics.md` § `exports` (K104 «imported from»); `llm.txt` без змін (glob Python там не описано). `docs/review-2026-10-06.md` п. 8 позначено ✔. Карту перегенеровано (зсув рядків у graph.ts/rules.ts/python.ts). Перевірки: `node --test tests/languages.test.ts tests/analyzer.test.ts tests/cli-map.test.ts tests/review-config.test.ts tests/review-graph.test.ts tests/cli-rules.test.ts tests/php.test.ts` — усе зелене, крім «the snapshot records the real versions of the tree-sitter runtime and grammars», яка падає в цьому worktree через відсутній `node_modules/web-tree-sitter/package.json` (середовище, не код); `npm run typecheck` — ок; `node bin/keylang.js map --check`, `check` — ок.
