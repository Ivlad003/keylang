# 06: система з коду: компоненти, зв'язки, sequence

**Status:** resolved

**Type:** code

**Blocked by:** 02, 05

**Verify:** `node --test tests/system-discover.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р10, §5

**What to build:** `src/system-discover.ts` — чиста функція знімка → `# system` Markdown (компоненти за точками входу й шарами, сховища й зовнішні сервіси з каталогу, зв'язки за досяжністю імпортів, sequence з дерева викликів). `keylang system discover [--json]`. Ім'я `@code` у представленнях: система, sequence. Вивід розбирається без діагностик і проходить `check`.

- [x] фікстура: route-шар імпортує `pg` через репозиторний модуль, cron-шар — `ioredis`; виводяться `service`, `worker`, `db postgres`, `cache redis` і зв'язки
- [x] sequence точки входу: `client → api`, `api → postgres`
- [x] вивід — валідний keylang (parse без діагностик, `check` без K4xx)
- [x] `view=system&name=@code` на сторінці, коли рукописних систем немає

## Comments

### Notes

- 2026-10-11: `src/system-discover.ts`: `discoverSystem` (кеш на знімок), `systemMarkdown`, `adoptedName`. Виклики через значення (`pool.query`) у знімку нерозв'язані — повідомлення сховищу ставиться за модулем, що імпортує один драйвер (евристика, задокументовано в `docs/cli.md#system`).
- 2026-10-11: Відхилення: фронтенд як окремий клієнт не розпізнається — замість нього `client client HTTP` для HTTP-точок входу (записано в spec §5).
- 2026-10-11: Тести: `tests/cli-system.test.ts` (discover → check без знахідок), `tests/system-view.test.ts` (`@code`).
