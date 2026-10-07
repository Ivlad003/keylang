# 33: Веб-клієнт діаграм: збірка (esbuild), каркас SPA, автентифікація API

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 20

**Verify:** `npm run typecheck` · `node --test tests/web.test.ts` · `npm pack --dry-run`

**Джерело:** рев'ю плану 2026-10-07 (тікет 20)

## What to build

- `esbuild` у devDependencies; `scripts/build-web.mjs` збирає `web/src/*.ts` → `dist/web/app.js` (+ CSS), викликається в `prepack` поруч із `copy-web.mjs`; у розробці `node bin/keylang.js web` збирає за потреби (або `npm run web:build`). Опублікований пакет несе лише зібрані файли (як xterm), залежність у дерево користувача не потрапляє (ADR 0002).
- Сторінка `/diagrams` (той самий сервер, той самий токен у фрагменті URL → `sessionStorage`), `fetch('/api/…', {headers: {Authorization: 'Bearer …'}})`; відмова без токена — 403; `allowedHost`/Origin-перевірки ті самі, що для WebSocket (`src/tui/web.ts:188-233`).
- Каркас без фреймворку (vanilla TS) або з мінімальним; рішення зафіксувати в ADR 0024 разом із maxGraph.
- Ліцензії зібраних пакетів копіюються в `dist/web/*.LICENSE`, як для xterm.

## Критерії готовності

- [ ] `npm pack --dry-run` показує `dist/web/app.js`, розмір пакета зафіксовано в `docs/review`/results
- [ ] `tests/web.test.ts`: `/diagrams` і `/api/diagram` відповідають лише з токеном; без — 403; чужий Host — 421
- [ ] docs/tui.md «keylang web» оновлено

**Межі:** без самих діаграм (21) і редактора (23).

## Comments
