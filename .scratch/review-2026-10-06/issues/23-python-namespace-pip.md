# 23: Python: тека в корені вирішує, чи ім'я внутрішнє: namespace-пакет стає нерозв'язаним, а тека з конфігами затуляє пакет pip

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `langs`, верифікація: confirmed.

**Місце:** `src/python-imports.ts:54` (рецензент указав `src/python-imports.ts:54`)

## Що не так

Пошук кореня приймає будь-яку теку з ім'ям першого сегмента (`isDir(head)`), а модулем вважає лише `p.py` чи `p/__init__.py`. Через це (а) `import nsp.inner.mod` для пакета простору імен PEP 420 (тека без `__init__.py`) дає дірку `unresolved import nsp` для прив'язки голови. Дірка рівня залежностей робить `unverified` кожне правило над шаром файла, хоча Python імпортує такий модуль. (б) Тека без Python-коду з ім'ям пакета (`redis/` з Dockerfile і redis.conf) перетворює `import redis` на нерозв'язаний імпорт замість `external.redis`: виклики `redis.Redis()` стають діркою, а порушення `deny` ховається.

## Сценарій збою

(а) `app/cache.py: import nsp.inner.mod` (у `nsp/` немає `__init__.py`), у rules.md `- deny app other`, app нічого з other не імпортує. `keylang check`: `unverified unresolved import nsp (app/cache.py:1:1)` замість ok. (б) У корені тека `redis/` з Dockerfile, у `app/cache.py` рядок `import redis`, у rules.md `- deny app external.redis`. Маємо `K001 dangling reference external.redis` і `unverified unresolved import redis`. Без теки `redis/` той самий код дає правильний `K102 divergence … denied by deny app external.redis`.

## Як відтворити

Фікстури scratchpad/review/langs/py2 і py3. py2 `keylang map`: `COV unresolved-import app/cache.py 1 … unresolved import redis`, `COV unresolved-import app/cache.py 2 … unresolved import nsp`, `COV dynamic-call … redis.Redis`. `keylang check` -> `K001 dangling reference external.redis` + `unverified`; після `rm -rf redis` -> `K102 divergence`. py3 -> `keylang/rules.md:3:1: unverified unresolved import nsp`. `python3 -c 'import nsp.inner.mod'` працює.

Доказ верифікатора:

> The bug is at src/python-imports.ts:54: `if (!this.moduleFile(head) && !this.isDir(head)) continue;`. Any directory whose name matches the first segment ends the root search. `longest()` then accepts only `p.py` or `p/__init__.py`, so `{kind:"unresolved"}` comes back, and the search never reaches `src/` or the stdlib/external fallback.
> 
> I built new fixtures in scratchpad/verify/langs-3-0. Every command ran as `node /home/kosmodev/pet_project/keylang/bin/keylang.js check`, with HOME and XDG_* pointed at the scratch dir.
> 
> (b) A `redis/` directory holding only a Dockerfile and redis.conf, `app/cache.py: import redis` plus `redis.Redis()`, and rules `- deny app external.redis`:
> ```
> keylang/rules.md:3:12: K001 dangling reference `external.redis`; declare `planned` if this is an intention
> keylang/rules.md:3:1: unverified unresolved import `redis` (app/cache.py:1:1)
> 1 fail, 1 unverified, 0 ok
> ```
> The same code without `redis/` gives `K102 divergence: app.cache depends on external.redis, which is denied by deny app external.redis`.
> 
> (c) I found one more case that is worse. A root `config/` directory holds only settings.yaml, `src/config/__init__.py` and `src/config/settings.py` exist, and `src/app/main.py` has `from config import settings`. Rules are `- deny app config`. The result is `unverified unresolved import config.settings` with `0 fail, 1 unverified, 0 ok` and exit 0. Without the root `config/` directory the result is `K102 divergence ... denied by deny app config` with exit 1. So a non-Python directory in the root also hides a package in `src/`, and a real violation drops from fail to unverified.
> 
> (a) Namespace package: `nsp/inner/mod.py` with no `__init__.py`, `app/cache.py: import nsp.inner.mod`, rules `- deny app other`. Output: `unverified unresolved import nsp (app/cache.py:1:1)` and `0 fail, 1 unverified`. With `__init__.py` files added: `1 ok`. In Python, `import nsp.inner.mod` works: `_NamespacePath` was printed.
> 
> The documented contract is docs/snapshot.md:30. It says an absolute path is looked up in the repository root, then in `src/`. A module is `p.py` or `p/__init__.py`. A top-level name that is in no root is stdlib or an external package, and only a repository module with the same name takes priority. A directory with no Python code is not a module under that definition, so (b) and (c) break the documented behaviour. Python agrees: PathFinder treats a directory without `__init__` only as a namespace candidate and prefers a regular package or …

## Що зробити

- Вважати теку кореня збігом лише тоді, коли в ній є Python-модуль: `p.py`, `p/__init__.py` або `.py`-файли нижче, тобто namespace-пакет. Інакше переходити до наступного кореня (`src/`), а далі до stdlib чи external. Голову namespace-пакета прив'язувати без ребра й без дірки.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/python-imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/languages.test.ts` «python: a root directory without Python code does not hide a pip package or a package under src/…» — справжній CLI, три фікстури: (б) `redis/` лише з Dockerfile і redis.conf, `import redis`, `deny app external.redis` → K102 (було K001 + `unverified unresolved import redis`); (в) кореневий `config/settings.yaml` і `src/config/` → `deny app cfg` дає K102 (було `unverified`); (а) PEP 420 `nsp/inner/mod.py` без `__init__.py` → `0 fail, 0 unverified, 1 ok`, без `unresolved-import` у coverage, ребро `app.cache → nsp.inner.mod`.
- 2026-10-08: Виправлення в `src/python-imports.ts`: корінь бере перший сегмент лише тоді, коли це модуль (`p.py`, `p/__init__.py`) або тека з `.py` у ній чи нижче (`hasPython`: теки `.py`-джерел аналізу, інакше обмежений обхід диска — для виключених пакетів); інакше пошук іде до `src/`, далі stdlib/external. Голова пакета простору імен (`import nsp` з `import nsp.inner.mod`) повертає `{kind: "generated"}` — той самий вид, яким PHP-резолвер позначає простір імен: без ребра й без дірки.
- 2026-10-08: Припущення: результат обходу диска для теки без джерел не входить у `snapshotId` (як і `isDir` до того) — поява `.py` у виключеній теці без інших змін джерел той самий id не змінить; це вужче за тікет 20 і окремо не виправлялось. Контракт: `docs/snapshot.md`, абзац Python. Перевірки: `node --test tests/languages.test.ts tests/exact-path.test.ts tests/analyzer.test.ts` — 67/67, `npm run typecheck` — ок.
