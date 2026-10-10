# 01: `/api/git` і `/api/changes` у read-API

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/web-git.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec §2, §3

**What to build:** Дві нові GET-відповіді в `src/tui/read-api.ts` поверх наявних функцій keylang.

- `src/git-changes.ts`: `gitSummary(root, label)` → `{commit, branch, origin, branches}` (`rev-parse`, `symbolic-ref --short`, `remote get-url`, `for-each-ref`). Без git чи репозиторію кидає помилку, як інші функції модуля.
- `/api/git`: `gitSummary` + `featureBaseOrigin`; origin без облікових даних (`redactUrl`).
- `/api/changes`: `gitChangedFiles` від бази (типово — `featureBaseOrigin`), модулі файлів зі знімка, модулі видалених (`deletedModuleIds`), `runCheck({changed: true, since})` з аналізатором read-API (у `--read-only` без кешу фактів).
- `web-export.ts`: обидві відповіді, для бази за замовчуванням і для `HEAD`.
- `docs/tui.md`: розділ API.

- [x] CLI-тест (`tests/web-git.test.ts`): репозиторій із комітом на `main` і гілкою з власним комітом, зміненим, видаленим і новим файлом; `/api/git` дає гілку, коротке ID і базу `merge-base … with main`; `/api/changes` дає ті самі файли й знахідки, що `keylang check --changed --since <база> --format json`
- [x] невідомий `since` → 400; тека без git → `/api/git` `{available: false}`, `/api/changes` 409
- [x] `web --read-only` після запитів не змінив дерево (`treeBytes`), включно з `.git`
- [x] статичний експорт містить обидві відповіді для бази й `HEAD`, байт у байт як сервер

## Comments

### Notes

- 2026-10-09 (реалізація): `gitSummary` у `src/git-changes.ts` (гілки — через повні імена `for-each-ref`: коротке ім'я `refs/remotes/origin/HEAD` — просто `origin`). `/api/git` і `/api/changes` — у `src/tui/read-api.ts`; `redactUrl` з `src/clone.ts`.
- 2026-10-09 (припущення): 400 чи 409 для `/api/changes` визначається за текстом помилки git (`bad revision`, `unknown revision`, `not a commit`, `not a git ref`): інших сигналів функції `git-changes.ts` не дають.
- 2026-10-09 (припущення): `kind: "spec"` — це `.md` під текою специфікацій, `code` — файл модуля знімка, решта — `other`.
- Тести: `tests/web-git.test.ts` (3), фікстура — `tests/git-fixture.ts`.
