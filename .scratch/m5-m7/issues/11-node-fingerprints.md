# 11: Fingerprint тіла вузла в знімку

**Етап:** M7 · **Джерело:** design §4.4; батьківський 21 (частина без baseline спек)

**What to build:** Кожен `fn`/тип у знімку має fingerprint нормалізованого тіла й сигнатури (без пробілів і коментарів), а також транзитивний fingerprint із залежностями з обробкою циклів; невідома залежність позначає fingerprint неповним. Формат baseline для ручних спек (рішення людини в 21) тут не вирішується.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] зміна `>` на `>=` у тілі змінює fingerprint; зміна лише коментаря/форматування — ні
- [x] зміна в B змінює транзитивний fingerprint A, що викликає B; цикл A↔B не зациклює
- [x] `snapshotId` лишається детермінованим

## Answer

`fingerprint()` у `extract/treesitter.ts`: SHA-256 структури дерева (типи вузлів + тексти токенів) без коментарів і пробілів. Усі три frontends дають його для fn/типів; перевантаження TS об’єднуються. Знімок (схема **5**, екстрактор m1.7): `fingerprint` (сигнатура + синтаксис) і `closure {fingerprint, complete}` знизу вгору за SCC графа викликів (`scc.ts: components()`), неповнота від `dynamic-call`/`unresolved-call`. Тести `tests/fingerprint.test.ts`: `>`→`>=` змінює fn і closure викликача, коментар/форматування — ні; цикл один хеш і змінюється разом; `worker.run()` → `complete: false`. Baseline спек і `check --stale` (тікет 21 design-v0.2) не зачеплено.
