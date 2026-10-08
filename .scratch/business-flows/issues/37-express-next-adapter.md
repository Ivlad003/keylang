# 37: Express/Fastify/Next.js: маршрути, middleware, server actions

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (TS) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- Розширює мовні евристики тікета 09: роутери з префіксом (`app.use('/api', router)` + `router.get('/x', h)` → `GET /api/x`), Fastify `fastify.route({ method, url, handler })` і `fastify.get`, Next.js Pages API (`pages/api/**`), App Router `route.ts` (уже є) + server actions (`'use server'` функції → `route` з міткою `action <name>`), middleware (`middleware.ts` → `route` з міткою `middleware`).
- Обробники, передані як посилання на fn — кроки (через `callable-arg` з тікета 05); inline — точка входу з модулем і приміткою.

## Критерії готовності

- [ ] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [ ] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [ ] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments
