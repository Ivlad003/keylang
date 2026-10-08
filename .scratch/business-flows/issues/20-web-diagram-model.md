# 20: Web: API моделі діаграм (флоу, точки входу, події, шари) з розкладкою

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Основа для всіх графічних тікетів (21–25, 28–29). `keylang web` зараз — термінал у браузері (xterm); потрібен окремий графічний клієнт.

- Чиста функція `diagramOf(snapshot, spec, view) → { nodes, edges, groups, verdicts }` для видів: `flow <name>`, `entry <id>` (дерево викликів на глибину N), `event <name>`, `layers`, `process <domain>`.
- Відображення: шар → доріжка (lane); `trigger` → стартова подія; `step` → задача; `when` → шлюз; `parallel` → паралельний шлюз; `emits/trigger event` → подія; таймер → таймерна подія; зовнішній пакет/інтеграція → зовнішній учасник; дірка → вузол «?» з причиною.
- Автоматична розкладка elkjs (layered), детермінована; ручні позиції з файлу розкладки (24) мають пріоритет.
- HTTP: `GET /api/diagram?view=…` у `src/tui/web.ts` з тими самими перевірками Host/токена, що й WebSocket.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] юніт-тести `diagramOf` для кожного виду; детермінізм
- [x] API за токеном; без токена — 403
- [x] docs/tui.md: розділ «Діаграми»

**Межі:** рендеринг — 21.

## Comments

### Рев'ю плану (2026-10-07)

`keylang web` сьогодні — одна inline-HTML-сторінка з xterm.js (`src/tui/web.ts:209, :430`), без бандлера: `scripts/copy-web.mjs` лише копіює готові файли з devDependencies у `dist/web/`. Графічний клієнт — це окремий SPA з власними модулями й залежністю (maxGraph — ESM на багато файлів), тобто потрібен крок збірки. **Рішення:** окремий тікет 33 (esbuild як devDependency, `scripts/build-web.mjs` у `prepack`, `dist/web/app.js`; у розробці — збірка за запитом або `npm run web:dev`); API `/api/diagram` з тим самим токеном через заголовок `Authorization: Bearer` (токен уже в `sessionStorage`), CSP без змін (`script-src 'self'`). Цей тікет (20) — лише чиста функція `diagramOf` + ендпоінт; клієнт — після 33.

### Реалізація (2026-10-08)

- `src/diagram.ts` (шар `map`, як `c4-export.ts`): `diagramOf({snapshot, spec, results, view})`, `layout(diagram, positions?)`, `parseView(query)`, `viewsOf(snapshot, spec)`. Види `flow`, `entry` (з `depth`, типово 3, до 10), `layers`; `event` і `process` — порожня діаграма з `reason` (вузлів подій і процесів ще немає: 08/16, 12). `results` — `CheckResult` або `Verdict`; вердикт вузла — найгірший на його рядку специфікації, `planned` — для нереалізованого `planned`.
- Дірка у флоу — крок, чий `static` вердикт `unverified`: перед ним вузол `hole` «?» з повідомленням `check`. У `entry` — нерозв'язаний/неоднозначний виклик розкритої fn. Питання `?`, `invariant`, `reads`, `test` форми не мають.
- **Відступ від постановки:** розкладка не elkjs, а власна детермінована на TS (ранг — найдовший шлях, порядок — рядок специфікації, фіксовані розміри; `positions` має пріоритет) — без нової залежності, за рев'ю плану. elkjs можна підставити в клієнті (33/21), модель не зміниться.
- Скрипт-точка входу (модуль) показує імпорти як `dependency`: викликів верхнього рівня модуля знімок не записує (вони не є ребрами `call`).
- `src/tui/web.ts`: `GET /api/views`, `GET /api/diagram?view=…` — JSON, токен через `Authorization: Bearer`, ті самі Host (421) і Origin (403) перевірки; без токена — 403, невідомий вид — 400. Інші шляхи `/api/…` — 404, як і будь-який невідомий шлях (тест «Actions add no HTTP endpoint»). Свіжий `analyze()` на запит, одночасні ділять один; незбережені буфери сесій не враховуються.
- Тести: `tests/diagram.test.ts` (TS і Python), ендпоінти — у `tests/web.test.ts`. Документація — `docs/tui.md`, «Діаграми (API)».
