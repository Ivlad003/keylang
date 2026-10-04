# 04: Вердикти для членів оголошених і `planned` пакетів; K202 для external

**Джерело:** plan.md крок 4 і §1 C11, C12; design/design-deps-completion.md §3; decisions.md (Q5 семантика: непрозорий член, не K001)

**What to build:** Користувач пише `- step external.pg.Pool`, коли `pg` є в `package.json`, але код його ще не імпортує — і замість `ID fail`/K001 отримує `unverified` з причиною «opaque module `external.pg` (declared, not imported)». Те саме для членів пакета, оголошеного через `planned module external.<pkg>` (причина «planned»). `external.<pkg>` сам по собі (оголошений, не імпортований) — `unverified "declared, not imported"`. Члени внутрішніх `planned module` лишаються K001. Коли код почав імпортувати пакет, K202 для `planned module external.<pkg>` називає першого імпортера з файлом і позицією та радить прибрати оголошення. Вердикти потоків отримують ті самі правила через `knownExternal`.

**Blocked by:** 03 <!-- 03 — оголошені пакети -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] резолвер: після точного збігу з `knownExternal` — гілка «власний префікс = відомий або planned external-пакет → unverified з причиною»; коментар-контракт модуля оновлено
- [ ] потоки: вхід отримує `knownExternal`; `idVerdict` має нові гілки за таблицею design §3.2; K202 для external називає імпортера (сортування за файлом, рядком, колонкою)
- [ ] e2e через `check --format json`: таблиця вердиктів — лише неоголошений пакет `fail`, код 1; імпорт `pg` у коді → без K202; потім `planned module external.pg` → новий текст K202
- [ ] наявні перевірки тексту K202 у `tests/cli.test.ts` уточнено до нового тексту
- [ ] `docs/format.md`: Р13, рядок `ID` у таблиці вердиктів, абзац про `planned module external`
- [ ] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/resolve.ts`, `src/flows.ts`, `src/assess.ts`, `tests/rules-area.test.ts`, `tests/cli.test.ts`
