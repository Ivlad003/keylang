# 13: Стандартна бібліотека Python — не `external.<pkg>`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** тікет 11 (fastapi × Claude). Для Node вбудовані модулі вже окремі (`isNodeBuiltin` → `{kind: "builtin"}` у `src/imports.ts`); для Python такого немає: `src/python-imports.ts` вважає пакетом усе, чого немає в репо.

**What to build:** На `fastapi-realworld-example-app` baseline після `init` має 21 `allow app external.*`, з них 8 — stdlib (`datetime`, `enum`, `functools`, `logging`, `pathlib`, `sys`, `types`, `typing`); карта `external.md` їх теж показує. Новий імпорт stdlib (`asyncio`, `email`) у фічі — K102 від `deny app external`, хук блокує, агент мусить пропонувати `allow app external.asyncio`. Агент Codex у тому ж репо зібрав email вручну рядком замість модуля `email`, обходячи це.

Python-імпорт модуля стандартної бібліотеки має розв'язуватись як `builtin` (як у Node): не вузол `external`, не ребро в карті/baseline, не K102. Список модулів — вбудований статичний перелік (`sys.stdlib_module_names` Python 3.10+, зафіксований у репо; запуск Python заборонений — аналіз офлайн і без інтерпретатора). Локальний модуль репо з іменем stdlib має пріоритет (як зараз).

- [ ] фікстура: `import asyncio`, `from email.message import EmailMessage`, `import typing` — немає `external.*` у карті, baseline і `check`
- [ ] пакет поза stdlib (`aiosmtplib`) — як і раніше `external.aiosmtplib`
- [ ] модуль репо `app/logging.py` проти stdlib `logging` — резолвиться в репо
- [ ] format.md §6 (рядок про маніфести Python) і `docs/tools.md` (baseline) описують, що stdlib не external; карта keylang самого репо не змінюється

Ключові файли: `src/python-imports.ts`, `src/imports.ts`, `docs/format.md`
