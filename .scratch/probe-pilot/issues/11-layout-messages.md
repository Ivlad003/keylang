# 11: Два неточні повідомлення розкладки: `new module` без `keylang.json`, колізія module ID

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** AI-пілот 2026-10-04: premature commitment (`new module` без шару в `keylang.json` відмовляє; 4 з 4 вписали шари вручну), сесія 4 (колізія module ID `core.__init__` з двох glob).

**What to build:**

1. **`new module` у теці без `keylang.json`.** Відтворення (master `c408f53`, порожня тимчасова тека): `node <keylang>/bin/keylang.js new module orders --layer domain` → `` keylang: new module: unknown layer `domain`; layers in keylang.json: `` і код 2. Список порожній, а файла `keylang.json` немає зовсім — повідомлення каже шукати шар у файлі, якого не існує. Після зміни: без `keylang.json` — `` new module: no keylang.json here; add "layers" to keylang.json (or run `keylang init` once there is code) ``; з `keylang.json` без шарів — `no layers in keylang.json`. Код 2 той самий. (`init` у порожній теці відмовляє `no supported source files found …`, код 2 — це документована поведінка, її не змінювати.)
2. **Колізія module ID.** Відтворення: Python-репо з пакетом `app/`, у `keylang.json` шар `"core": ["app/core/**", "app/db/**"]`; `node <keylang>/bin/keylang.js map` → `` warning: app/db/__init__.py: module ID collision: same module ID as `app/core/__init__.py` (`core.__init__`) from another path; the module is opaque until one of them is renamed `` (`src/graph.ts`). `__init__.py` перейменувати не можна; дія користувача — розвести glob. Після зміни, коли обидва файли належать одному шару через різні glob, повідомлення додає: `` …; or split layer `core` so `app/core/**` and `app/db/**` are separate layers ``. Інші колізії — старий текст.

- [x] тест CLI: `new module` без `keylang.json` і з `keylang.json` без шарів — нові тексти, код 2, нічого не записано
- [x] тест CLI: колізія з двох glob одного шару — підказка з назвою шару й обома glob; колізія в межах одного glob (`a.ts` і `a/index.ts`, якщо так буває) — без змін
- [x] `docs/tools.md` (`new`) узгоджено

Ключові файли: `src/cli.ts` (`new`), `src/graph.ts`, `docs/tools.md`, `tests/cli.test.ts`

## Comments

- **Зроблено (2026-10-04).** Обидва відтворено справжнім CLI до зміни. `new module` з невідомим шаром: без файла `keylang.json` (у корені, який знайшов `findRoot`) — `new module: no keylang.json here; add "layers" to keylang.json (or run \`keylang init\` once there is code)`; з файлом без `layers` — `new module: no layers in keylang.json`; код 2, нічого не записано. Відомий шар і `--layer` відсутній — без змін.
- **Припущення.** Без `keylang.json`, але з кодом, шари вгадуються; `new module --layer <вгаданий шар>` і далі працює, як до зміни, — нове повідомлення лише для невідомого шару.
- **Колізія.** `placeFile` тепер повертає й глоб, що розмістив файл (`glob`, `null` для `outside`). Коли обидва файли колізії розмістили різні глоби (одного шару — бо ID однаковий), повідомлення дописує `; or split layer \`core\` so \`app/core/**\` and \`app/db/**\` are separate layers`. Колізія в межах одного глоба (`web/foo.bar.ts` і `web/foo_bar.ts`) — старий текст. Той самий текст іде і в прогалину `unsupported` знімка.
- Тести: `tests/cli.test.ts` (два нові). Документація: `docs/tools.md` (`new`), `docs/format.md` §11 (колізія).
