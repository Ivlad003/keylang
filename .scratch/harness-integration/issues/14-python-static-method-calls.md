# 14: Python static — виклики методів через анотований параметр і локальну змінну з конструктора

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** тікет 11 (fastapi × Claude, fastapi × Codex).

**What to build:** На звичайному FastAPI-коді крок потоку до методу репозиторію не отримує static `ok`, навіть для наявного коду:

```
# flow fav
- trigger app.api.routes.articles.articles_common.mark_article_as_favorite
- step app.db.repositories.articles.ArticlesRepository.add_article_into_favorites
```

→ `static unverified …: no resolved path …; call through a local value \`articles_repo.add_article_into_favorites\` at app/api/routes/articles/articles_common.py:58:15 may reach it`. Параметр має анотацію `articles_repo: ArticlesRepository = Depends(get_repository(ArticlesRepository))`. Те саме для `sender: EmailSender` → `sender.send(...)` і для `bookmarks_repo = BookmarksRepository(conn)` → `bookmarks_repo.get_…()`. У TS аналогічний NestJS-код (параметр конструктора з типом класу) дає `ok`.

Наслідок: у Python-фічі з класами `feature_status` не стає `done`, і агент Codex викривив код — додав прохідні вільні функції-обгортки й переписав кроки потоків у файлі фічі під них, лише щоб отримати `ok`.

Треба (на рівні фактів екстрактора Python, без виконання коду): виклик `x.m(...)`, де `x` — параметр з анотацією класу репо (включно з `X = Depends(...)`, `Optional[X]`) або локальна змінна, єдине присвоєння якої — `X(...)`, розв'язується в `X.m` (з урахуванням наслідування, як для TS). Інші форми лишаються явними `unverified` з причиною.

Питання для тріажу: чи вважати анотацію доказом (`--static=shape` vs `behavior`), і чи `Depends(...)` — хук, який варто розпізнавати окремо.

- [x] мінімальна фікстура з трьома формами (анотований параметр, `Depends`, локальна з конструктора) — `static ok` з причиною «called from …»
- [x] переприсвоєна змінна чи анотація не-класу — лишається `unverified` з тією ж підказкою, що зараз
- [x] format.md §7 «Flows: докази кроку» описує нові форми

Ключові файли: `src/extract/python.ts`, `src/graph.ts`, `src/flows.ts`, `docs/format.md`

## Comments

- 2026-10-04 — рішення людини: анотацію вважати доказом так само, як у TS (не лише в `--static=shape`): параметр з анотацією класу (включно з `= Depends(...)`, `Optional[X]`) і локальна з єдиним присвоєнням `X(...)` розв'язують `x.m()` у `X.m` з урахуванням наслідування; інші форми — `unverified` з причиною.
- 2026-10-04 — виконано (гілка `done/harness-14`). `src/extract/python.ts`: `typedValues` дає клас параметра з анотацією (`X`, `"X"`, `X = Depends(…)`, `Optional[X]`, `X | None`, `Annotated[X, …]`) чи локальної з єдиним присвоєнням `x = X(…)` / `x: X = …`; `x.m()` отримує `receiver: X`, як у TS. Друге присвоєння імені будь-де у функції (зокрема у вкладеній), `X`, прив'язане у функції, чи інша анотація (`list[X]`, псевдонім-значення) — без `receiver`, тож лишається «call through a local value». `src/graph.ts` `receiverTarget` тепер шукає член і в прочитаних базових класах — це діє й для TS (раніше там наслідування не враховувалось). Тест: `tests/languages.test.ts` «python: `x.m()` through a parameter annotated with a class …»; два старі Python-тести (py-shop) очікували дірку для `order = Order(); order.total()` — тепер це ребро і `static ok`, твердження оновлено під новий контракт. `tests/fixtures/*expected*` не змінились. Документація: `docs/format.md` §«Flows: докази кроку», абзац «Виклик методу через значення з відомим класом». `EXTRACTOR_VERSION` не піднято (кеш фактів інвалідується хешем коду екстрактора, як у jsx-react/01–06). Припущення: `Depends` окремо не розпізнається — типове значення параметра не важить; поля `self.x: X` у Python поза обсягом.
