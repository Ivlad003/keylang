# 01: keylang diff і діаграма змін у web

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec.md

**What to build:** Усе з spec.md: знімок ревізії, `GraphDiff`, CLI `keylang diff` з форматами text/md/mermaid/json, `/api/graph-diff`, діаграма в режимі «Зміни», статичний експорт, документація. Тести: `tests/graph-diff.test.ts` на `branchRepo` (`tests/git-fixture.ts`): доданий/видалений модуль, нове ребро, нове порушення правила → код 1; `.git` і робоче дерево не змінені; `/api/graph-diff` у `tests/web-git.test.ts`.

## Comments

### 2026-10-12 — реалізація (агент)

Зроблено: `src/revision-tree.ts` (знімок ревізії: `ls-tree -r -z -l` + `cat-file --batch` зі stdin-файлом, symlink `node_modules`, тека прибирається у `finally`), `src/graph-diff.ts` (чиста модель `GraphDiff` + `diffSubgraph`), `src/graph-diff-format.ts` (text, md, mermaid, діаграма через `layout()`), `src/graph-diff-run.ts` (діапазон, обидва аналізи); `keylang diff` у `src/cli.ts`; `GET /api/graph-diff` у read-api (опція `graphDiff`, без неї — `{available: false, reason}`), статичний експорт, «Список / Діаграма» у «Змінах»; `factCacheRoot` в `analyze` / `cacheRoot` у `generateMap`. Тести: `tests/graph-diff.test.ts`, `tests/web-git.test.ts`, браузерний — `tests/web-e2e/changes.test.ts`. Документація: `docs/cli.md`, `docs/tui.md`, курс 07 (en, uk).

Припущення:
- `findings` — усі результати `check`, крім `ok` (fail, unverified, warning). Ключ у звіті — `code + criterion + area`, але збіг рахується ще й за вердиктом і повідомленням без позицій (`:12`, `line 12`) як мультимножина: інакше друге порушення `deny` з того самого модуля (та сама `area`) не було б «новим».
- Код 1 — новий `fail` або будь-який K108 (`weakenings`): K108 у `check --changed` теж fail.
- Обидва боки аналізуються без evidence і без міграції (`withoutEvidence`, `withoutMigration`), і робоче дерево теж, щоб звіти тестів, які є лише в робочому дереві, не давали «нових» знахідок; кеш фактів читається, не пишеться (і для робочого дерева).
- Рівень `module`: вузли — модулі (з класами й пакетами `external.*`), ребра — `deps` модуля (`kind: "dep"`); `fn` — ще функції й `calls` (`kind: "call"`). `body` модуля — хеш його `values` і fingerprint-ів/сигнатур членів, тож змінена функція видно й на рівні модулів.
- `flows[].steps[].key` — ключ `planItems` без назви потоку, частини через ` › `.
- `<base>..<head>`: порожня сторона — `HEAD`; `...` відхиляється (код 2). Unborn HEAD як база — порожнє дерево.
- Аналізи комітів кешуються в процесі (до 4) — для web.
- Лейн-порядок діаграми — ключі `config.layers` голови, потім бази.
