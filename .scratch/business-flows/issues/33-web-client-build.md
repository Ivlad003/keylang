# 33: Веб-клієнт діаграм: збірка (esbuild), каркас SPA, автентифікація API

**Status:** resolved

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

- [x] `npm pack --dry-run` показує `dist/web/app.js`, розмір пакета зафіксовано в `docs/review`/results
- [x] `tests/web.test.ts`: `/diagrams` і `/api/diagram` відповідають лише з токеном; без — 403; чужий Host — 421
- [x] docs/tui.md «keylang web» оновлено

**Межі:** без самих діаграм (21) і редактора (23).

## Comments

### Реалізація (2026-10-08)

- `esbuild` (^0.28.2) і `@maxgraph/core` (^0.25.0) — devDependencies; `npm ls --omit=dev` не змінився (ADR 0002). Рішення — [ADR 0024](../../../docs/adr/0024-diagram-editor.md): maxGraph + vanilla TS + esbuild; xyflow і вбудований draw.io відкинуто там же.
- Клієнт: `web/src/diagrams.ts`, `web/src/api.ts`, `web/src/diagrams.css`, власний `web/tsconfig.json` (DOM, `moduleResolution: bundler`); `npm run typecheck` тепер `tsc --noEmit && tsc --noEmit -p web/tsconfig.json`. `web/**` додано в `outside` у `keylang.json` (як `scripts/**`): браузерний клієнт не є шаром CLI.
- `scripts/build-web.mjs` (`npm run web:build`, `--outdir <dir>`): esbuild → один IIFE `dist/web/diagrams.js` + `diagrams.css`, мініфіковано, запис через тимчасовий файл і rename; ліцензії пакетів, що потрапили в бандл (за metafile), — `dist/web/<пакет>.LICENSE` (зараз лише `maxgraph-core.LICENSE`). Викликається в `prepack` після `copy-web.mjs`.
- **Відступ від постановки:** файл зветься `dist/web/diagrams.js`, не `app.js` (за брифом; назва описує сторінку). `/diagrams` — статична сторінка без даних, як `/`: браузер не шле фрагмент, тож сторінку не можна закрити токеном; 403 без токена — у `/api/views` і `/api/diagram`, 421 для чужого Host — і для `/diagrams`. CSP сторінки — `script-src 'self'` без inline-скрипта.
- У чекауті `keylang web` збирає клієнт сам на запиті `/assets/diagrams.js|.css`, якщо бандла немає або він старший за `web/src/**` чи `scripts/build-web.mjs` (≈ 1 с; паралельні запити чекають одну збірку). В опублікованому пакеті `web/src` немає — нічого не збирається.
- Сторінка терміналу має посилання «Діаграми» (правий верхній кут) на `/diagrams#t=<token>` у новій вкладці; на сторінці діаграм — «термінал» назад на `/`.
- Каркас: список із `/api/views` (флоу, точки входу, вид шарів) з пошуком; клік → `/api/diagram` → maxGraph лише для читання (`setEnabled(false)`): вершина на `x/y/w/h`, ребро, `swimlane` на групу, колір за вердиктом. Ручна перевірка в браузері на самому keylang (флоу `check`: 13 фігур, 12 ребер, 6 доріжок, без помилок у консолі й CSP).
- Розміри: `diagrams.js` 406 349 Б (≈ 397 КіБ, ≈ 110 КіБ gzip), `diagrams.css` 1,1 КБ. `npm pack --dry-run`: package size 1.5 MB, unpacked 9.3 MB, 176 файлів; `dist/web/diagrams.js` у списку.
- Тести (`tests/web.test.ts`): сторінка `/diagrams` (200, HTML, CSP без inline, без CDN і токена), посилання з терміналу, `/assets/diagrams.js` і `.css` (200, `text/javascript`/`text/css`, збірка на вимогу), API 403 без токена, 421 для чужого Host; збірка в тимчасову теку — рівно `diagrams.js`, `diagrams.css`, `maxgraph-core.LICENSE`, без `import`/`from` з `http(s)://`, IIFE.
- Перевірки: `node --test tests/web.test.ts` — 28/28; `npm run typecheck` — чисто; `npm pack --dry-run` — ок; `node bin/keylang.js map --check` — актуальна (карту перегенеровано: `outside`, `tui`); `node bin/keylang.js check` — 0 fail. Повний `npm test` не запускався (review-зміна).
- Лишилось: браузерні e2e (`npm run test:web`, Playwright) — тікети 21/23; можлива оптимізація бандла через `BaseGraph` + вибрані плагіни. Попутно в `docs/tui.md` виправлено надрукований URL: `/#t=<token>`, не `/?t=<token>`.
