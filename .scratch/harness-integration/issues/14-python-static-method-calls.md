# 14: Python static — виклики методів через анотований параметр і локальну змінну з конструктора

**Status:** ready-for-agent

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

- [ ] мінімальна фікстура з трьома формами (анотований параметр, `Depends`, локальна з конструктора) — `static ok` з причиною «called from …»
- [ ] переприсвоєна змінна чи анотація не-класу — лишається `unverified` з тією ж підказкою, що зараз
- [ ] format.md §7 «Flows: докази кроку» описує нові форми

Ключові файли: `src/extract/python.ts`, `src/graph.ts`, `src/flows.ts`, `docs/format.md`

## Comments

- 2026-10-04 — рішення людини: анотацію вважати доказом так само, як у TS (не лише в `--static=shape`): параметр з анотацією класу (включно з `= Depends(...)`, `Optional[X]`) і локальна з єдиним присвоєнням `X(...)` розв'язують `x.m()` у `X.m` з урахуванням наслідування; інші форми — `unverified` з причиною.
