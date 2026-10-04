# 13: Стандартна бібліотека Python — не `external.<pkg>`

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** тікет 11 (fastapi × Claude). Для Node вбудовані модулі вже окремі (`isNodeBuiltin` → `{kind: "builtin"}` у `src/imports.ts`); для Python такого немає: `src/python-imports.ts` вважає пакетом усе, чого немає в репо.

**What to build:** На `fastapi-realworld-example-app` baseline після `init` має 21 `allow app external.*`, з них 8 — stdlib (`datetime`, `enum`, `functools`, `logging`, `pathlib`, `sys`, `types`, `typing`); карта `external.md` їх теж показує. Новий імпорт stdlib (`asyncio`, `email`) у фічі — K102 від `deny app external`, хук блокує, агент мусить пропонувати `allow app external.asyncio`. Агент Codex у тому ж репо зібрав email вручну рядком замість модуля `email`, обходячи це.

Python-імпорт модуля стандартної бібліотеки має розв'язуватись як `builtin` (як у Node): не вузол `external`, не ребро в карті/baseline, не K102. Список модулів — вбудований статичний перелік (`sys.stdlib_module_names` Python 3.10+, зафіксований у репо; запуск Python заборонений — аналіз офлайн і без інтерпретатора). Локальний модуль репо з іменем stdlib має пріоритет (як зараз).

- [x] фікстура: `import asyncio`, `from email.message import EmailMessage`, `import typing` — немає `external.*` у карті, baseline і `check`
- [x] пакет поза stdlib (`aiosmtplib`) — як і раніше `external.aiosmtplib`
- [x] модуль репо `app/logging.py` проти stdlib `logging` — резолвиться в репо
- [x] format.md §6 (рядок про маніфести Python) і `docs/tools.md` (baseline) описують, що stdlib не external; карта keylang самого репо не змінюється

Ключові файли: `src/python-imports.ts`, `src/imports.ts`, `docs/format.md`

- **Зроблено (2026-10-04).** Відтворено до зміни: `import asyncio`, `import typing`, `from email.message import EmailMessage` давали `external.asyncio`, `external.email`, `external.typing` у карті й `allow app external.*` у baseline. Після: `PythonResolver` повертає нову `Resolution` `{kind: "stdlib"}` для першого сегмента зі stdlib (лише після пошуку в коренях репо, тож модуль репо має пріоритет). `buildGraph` прив'язує такі імена до синтетичного external-модуля поза графом: ні вузла, ні `dep`, ні ребра, ні K102, а виклик `asyncio.run()` лишається `callsExternal`, не дірою покриття.
- **Джерело переліку.** npm-пакета з переліком stdlib Python немає (`npm search` — лише Node-аналоги на кшталт `builtin-modules`), тож за ADR 0002 залежності брати нема з чого. Перелік — об'єднання `Python/stdlib_module_names.h` (з нього будується `sys.stdlib_module_names`) гілок CPython 3.10–3.14, 329 імен, зафіксовано в `src/python-stdlib.ts` (шар `map`). Перевірено: перелік 3.12 збігається з `sys.stdlib_module_names` локального Python 3.12. Об'єднання, а не перетин: модуль, вилучений пізніше (`distutils`, `cgi`), — stdlib для коду, що цілиться в стару версію. Нову версію CPython треба дописувати вручну.
- **Розбіжність із тікетом.** Тікет каже «як у Node», але вбудовані модулі Node — це один вузол `external.node` (ребро, `allow … external.node` у baseline). Зроблено як просить тікет (жодного `external.*`), Node не змінено; різницю записано в format.md §6.
- **Припущення.** «Модуль репо `app/logging.py` проти stdlib `logging`» перевірено як `from .logging import setup` у `app/mail.py` (резолвиться в `app.logging`). Абсолютний `import logging` з `app/` і далі шукає лише в корені репо й `src/` (як було), тож за відсутності `logging.py` там — stdlib.
- **Знімок.** Резолвінг змінює ребра, які покриває `snapshotId`: `EXTRACTOR_VERSION` m1.9 → m1.10 (одноразова інвалідація кешу/знімка). Кеш фактів (`FileFacts`) не змінюється — резолвінг поза ним. Карта keylang самого репо змінилась лише новим модулем `map.python-stdlib`.
- Тести: `tests/languages.test.ts` (новий тест; у тесті `py-shop` `import json` тепер не ребро).
