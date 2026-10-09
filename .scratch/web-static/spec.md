# web без сервера: статичний експорт, аналіз у браузері, `web --read-only`

**Status:** resolved

**Джерело:** запит автора 2026-10-09: «веб-версія, що працює в браузері без сервера: перетягнув репозиторій і бачиш map, пояснену карту, діаграми»; варіант C (спершу статичний експорт, потім аналіз у браузері), далі `web --read-only` і Docker-образ `ivlad003/keylang` (amd64 + arm64, 0.8.0).

## 1. Мета

Людина бачить карту, пояснену карту й діаграми репозиторію без запису в нього і, за бажанням, без сервера:

- **`keylang web --read-only`** — той самий сервер, але лише для читання: сторінка діаграм із вкладкою «Карта», без TUI-сесій і без жодного запису.
- **`keylang web --export <dir>`** — статичний сайт одного репозиторію: відповіді read-API, пораховані заздалегідь. Відкривається з `file://` і з будь-якого статичного хостингу.
- **`app.html`** у тому ж каталозі — аналіз у браузері: людина перетягує теку репозиторію (або обирає її), а `analyze` виконується у вкладці на файловій системі в пам'яті. Потрібен `http(s)://`, бо WASM і Worker не вантажаться з `file://`.

## 2. Інваріанти

- **Один код відповідей.** GET-відповіді сервера, статичного експорту й браузерного аналізу будує одна функція (`src/tui/read-api.ts`). Сторінка знає лише транспорт: HTTP, статичні файли або Worker.
- **Read-only нічого не пише в репозиторій.** Ні `.keylang/`, ні `keylang/`, ні layout. Сервер у цьому режимі відмовляє будь-якому методу, крім GET, і не відкриває WebSocket TUI.
- **Аналіз у браузері — той самий конвеєр.** Збірка підміняє `node:fs` на `memfs`, `node:path` — на posix-реалізацію, `createHash("sha256")` — на синхронний JS-хеш. Ядро мови й правила не змінюються: tree-sitter уже працює через WASM.
- **Чого немає без сервера:** git (`changed`, `stale`), моделі (пояснення через LLM), записи (редактор, пропозиції, layout). Інтерфейс ці дії ховає, а не ламає.

## 3. Контракт

- Нові read-шляхи: `GET /api/docs` — Markdown специфікацій `{dir, files: [{path, group}]}`, де `group` — це `map`, `map-explained`, `explain`, `flows`, `flows-discovered` або `spec`; `GET /api/doc?path=…` — `{path, text}`. Карта й пояснена карта беруться з рендеру аналізу, а не з диска: їх видно й без `keylang map`. Пояснена карта показується навіть тоді, коли `explain.map` вимкнено.
- `web --read-only` — сумісний із `[url|path]`, `--port`, `--host`, але не з `--new`.
- `web --export <dir> [url|path]` — пише `index.html`, `app.html`, `assets/`, `data/`. Не пише в репозиторій; у непорожній `<dir>` без маркера експорту відмовляє.

## 4. Перевірки

`npm run typecheck`, `npm test` (CLI: `--read-only` відмовляє запису й нічого не пише; `--export` дає файли й відповіді, однакові з сервером), `npm run test:web` (сторінка з `file://`, `app.html` на фікстурі), `node bin/keylang.js map --check`, `node bin/keylang.js check`.

## 5. Що зроблено (2026-10-09)

- `src/tui/read-api.ts` — спільні GET-відповіді (`createReadApi`), сервер переведено на них; нові `/api/docs`, `/api/doc`; `explainedMapOf` у `src/map.ts`.
- `web --read-only` (`src/tui/web.ts`, `src/cli.ts`), `web --export` (`src/tui/web-export.ts`).
- Клієнт: транспорт (`web/src/api.ts`), `static.ts`, `local.ts`, вкладка «Карта» (`docs.ts`).
- Worker: `web/worker/analysis.ts` і shim-и `web/worker/shims/`, збирає `scripts/build-web.mjs`. Відповіді браузера на дереві keylang байт у байт збігаються з Node, разом зі `snapshotId`.
- Docker: `--platform=$BUILDPLATFORM` для стадії пакування, `scripts/docker-publish.mjs`, образ `ivlad003/keylang` (0.8.0, latest; amd64 і arm64).
- Перевірки: `npm run typecheck`; `npm test` (1240 pass; єдиний fail — застаріла карта, після `keylang map` проходить); `npm run test:web` 14/14; `map --check`; `check` — 0 fail.

Припущення: shim `node:fs` — власний (≈200 рядків, лише читання), а не memfs, бо memfs тягне поліфіли `stream`/`events`/`util`, а записи тут мають падати. `app.html` потребує http(s).
