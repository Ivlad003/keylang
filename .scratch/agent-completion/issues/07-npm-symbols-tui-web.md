# 07: Символи npm у TUI та web

**Джерело:** plan.md крок 7 і §1 C16; design/design-npm-symbols.md §5; review-npm-symbols.md L6

**What to build:** Той самий popup символів працює в `keylang` і `keylang web`: у TUI `step external.fake-lib.ma` показує список, Tab вставляє повний ID. Індекс пакетів будується у фоні після побудови карти (фоновий воркер отримує вид повідомлення `map | packages`), один екземпляр індексу спільний для всіх вкладок web, з `persist: true` — кеш `.keylang/cache/packages.json` записується лише коли байти змінилися; друга сесія лишає його байт у байт; зміна `.d.ts` пакета дає нові символи в новій сесії. `close()` зупиняє індекс.

**Blocked by:** 05, 06 <!-- 05 — доповнення залежностей у TUI; 06 — індекс символів -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] фоновий воркер і його протокол розрізняють побудову карти й пакетів; пакети йдуть після карти
- [ ] `AppOptions` приймає індекс; термінал створює його, web ділить між вкладками; `adopt()`/`live()`/`complete()`/`close()` підключені
- [ ] TUI e2e: після `idle()` popup для `external.fake-lib.ma`, Tab вставляє повний ID; кеш існує і після другої сесії байт-ідентичний; змінений `util.d.mts` пропонує `ns.added` у новій сесії
- [ ] `docs/tools.md` (TUI): файл кешу та його інвалідація
- [ ] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/tui/analysis-worker.ts`, `src/tui/background.ts`, `src/tui/app.ts`, `src/tui/terminal.ts`, `src/tui/web.ts`
