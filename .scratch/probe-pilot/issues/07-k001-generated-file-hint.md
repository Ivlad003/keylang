# 07: K001 у згенерованому baseline не каже «перегенеруй»

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: кандидат 7, сесія 4 (23 K001 від застарілого baseline після зміни шарів; виправлено лише після `baseline --check`), §10.6 («ручна перегенерація `baseline` і `map`»). Близьке, але інше: harness-integration/17 п. 3 (текст `apply_diff` про згенерований baseline).

**What to build:** Після зміни шарів у `keylang.json` `keylang/rules.baseline.md` називає старі шари. `check` дає на них K001 з підказкою для ручних специфікацій — `declare \`planned\` if this is an intention`, а іноді й `did you mean` з новим шаром. Обидві підказки шкідливі для файла з маркером `keylang:generated`: його не редагують, його перегенеровують. Правильну дію знає лише `baseline --check` (`stale, run \`keylang baseline\``).

Відтворення (master `c408f53`):

1. Тимчасовий TS-репо (`src/db`, `src/users`, `src/main.ts`), `init --agents=none` → шари `db`, `users`, `main` і baseline з `deny db …`, `deny main db, …`.
2. У `keylang.json` перейменувати шар `db` на `storage`.
3. `check` → `keylang/rules.baseline.md:5:8: K001 dangling reference \`db\`; declare \`planned\` if this is an intention` (і `:6:13`), код 1; `baseline --check` → `keylang/rules.baseline.md: stale, run \`keylang baseline\``.

На Python-репо, де шар `app` розбито на `api`, `core`, `services`, `main`: `K001 dangling reference \`app\` (did you mean \`api\`?); declare \`planned\` …` у baseline.

Після зміни K001 у файлі, перший рядок якого — маркер `keylang:generated` (див. format.md «Маркер генерації»), замість `did you mean` і `planned` каже команду, що його пише: `` K001 dangling reference `db` in a generated file; run `keylang baseline` `` (для `keylang/map/*.md` — `keylang map`). Команду брати з маркера, щоб не дублювати відповідність файл → команда. Код, рівень і позиція K001 ті самі.

- [ ] фікстура: застарілий baseline після перейменування шару — новий текст K001 з `keylang baseline`; K001 у ручному `rules.md` — старий текст із `planned`
- [ ] `check --format json` (`evidence`), LSP і MCP `check` несуть той самий текст
- [ ] format.md §7 (K001) і `explain K001` згадують згенеровані файли

Ключові файли: `src/resolve.ts`, `src/explain.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments
