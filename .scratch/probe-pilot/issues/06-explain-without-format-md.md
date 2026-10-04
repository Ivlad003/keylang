# 06: `explain K005` відсилає до `format.md`, якого немає в пакеті

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** AI-пілот 2026-10-04: кандидат 1 («`explain K005` відсилає до `format.md`, якого учасник не має»), K-коди «до → після explain» K005 2→2 і 3→3 — `explain` оцінку не підняв.

**What to build:** `keylang explain K005` закінчується рядком `fix: Match the form in format.md for that keyword.` (`src/explain.ts`). У npm-пакеті `docs/` немає (`package.json` `files`: `adapters`, `bin`, `dist`, `dist/wasm`, `resources`), тож користувач пакета цей файл не бачить, а `explain` має бути самодостатнім і офлайн.

Відтворення (master `c408f53`): `node bin/keylang.js explain K005` → `fix: Match the form in format.md for that keyword.`; `node -e 'console.log(require("./package.json").files)'` → без `docs`. Серед `explain K001…K008` інших посилань на `format.md` немає (`grep -n format.md src/explain.ts` — один рядок).

Після зміни `fix` K005 не згадує файлів поза пакетом і сам каже, що робити: «Write the keyword in one of its forms:» і по одному короткому зразку для кожного `reason`, що вже перелічені в `reasons:` (`arguments` — `# flow <name>`, `deny <layer> <layer>`; `id` — ID з літери; `link` — `[a.b](path)`; `quote` — закрита лапка; `layer` — `layers a < b`; `scope` — модуль, а не fn). Додатково — рядок про `planned` як окрему декларацію (див. 05). Якщо зразки довші за кілька рядків, допустима форма `keylang explain K005 <reason>`, але це нове CLI-API: тоді оновити `--help` і `docs/tools.md`.

- [ ] `explain K005` не містить `format.md`; кожен `reason` має зразок правильної форми
- [ ] тест через CLI: жоден `explain <код>` для кодів із `src/diag.ts` не друкує `format.md` чи `docs/`
- [ ] `docs/tools.md` (опис `explain`) узгоджено з новим текстом

Ключові файли: `src/explain.ts`, `docs/tools.md`, `tests/cli.test.ts`

## Comments
