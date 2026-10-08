# 37: Express/Fastify/Next.js: маршрути, middleware, server actions

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (TS) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- Розширює мовні евристики тікета 09: роутери з префіксом (`app.use('/api', router)` + `router.get('/x', h)` → `GET /api/x`), Fastify `fastify.route({ method, url, handler })` і `fastify.get`, Next.js Pages API (`pages/api/**`), App Router `route.ts` (уже є) + server actions (`'use server'` функції → `route` з міткою `action <name>`), middleware (`middleware.ts` → `route` з міткою `middleware`).
- Обробники, передані як посилання на fn — кроки (через `callable-arg` з тікета 05); inline — точка входу з модулем і приміткою.

## Критерії готовності

- [x] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [x] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [x] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments

### 2026-10-08 — реалізація

- Адаптери `express`, `fastify`, `next` — `src/frameworks/web.ts` (шар `base`, без імпорту `extract`): виявлення з `package.json` (Express/Fastify — ще імпорт пакета у файлі, Next — `next.config.*`), конфіги — джерела, що реєструють; `parse` фактів не дає. Розміщення на графі — `src/framework-code/web-entries.ts` (шар `map`), викликається з `src/framework-entries.ts`.
- TS-екстрактор записує `FileFacts.web`: виклики `get|post|…|use|register|route` на іменованому отримувачі з аргументами (`DecoratorArg`), ланцюг `route('/x').get(h)`, `within` — функція, перший параметр якої є отримувачем (плагін Fastify), значення верхнього рівня, створені викликом, `'use server'` (файл/функція), експортований `config`.
- Рішення щодо middleware: синтетичних вузлів немає. Точка входу — обробник; middleware ланцюга й Fastify-хуки (`onRequest`, `preParsing`, `preValidation`, `preHandler`) перелічено в `note` з ID; `app.use(fn)` — окрема точка входу `USE /prefix`. Обробник на місці — модуль, що реєструє, з `note`.
- Взаємодія з евристикою тікета 09: з увімкненим адаптером мовна точка входу того самого виклику (`source` = `file:line`) поступається адаптерній (з префіксом), `src/map.ts`; з `frameworks: []` лишається лише евристика 09 (без префіксів), конфіги адаптерів — `skipped-file`.
- Ребер конфігу (`preference`/`argument`) адаптери не дають; `deny` бачить лише ребра коду. Обробник, переданий посиланням з fn, — `callable-arg` (тікет 05): `behavior ok` / `shape unverified` — у тесті.
- Тести: `tests/frameworks-express.test.ts` (8, через CLI): роутер між файлами з префіксом, вкладений `use` CommonJS-роутера, `route()`-ланцюг, middleware-нотатка, обробник на місці, незмонтований роутер з `note`, Fastify `register` з префіксом + вкладений плагін на місці + `route({…})` з двома методами + `preHandler`, Next Pages API, server actions, middleware matcher, `flows discover` + `coverage`, `frameworks: []` metamorphic.
- Не читаються (записано в `docs/snapshot.md`): `fastify-plugin` (`fp(...)`), `@fastify/autoload`, роутер з фабрики, `this.app`, Koa/Hono окремо.
- Попередня проблема master (не цього тікета): `tests/metamorphic.test.ts` «a framework's config left unread …» падає й без цих адаптерів (`rule:deny promo sales ok → unverified` відсутнє).
