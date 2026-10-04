# 36: Зберігати операції й результати при web-reconnect

**What to build:** browser-сесія виконує ті самі прикладні операції, а перепідключення повертає поточну роботу й історію.
**Blocked by:** [06 — нова специфікація](06-new-specification-buffer.md), [12 — init](12-initialize-in-session.md), [35 — завершення/скасування](35-session-exit-and-concurrency.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A23, A24, A27, A28.

## З чого почати

Знайти `serveWeb`, створення App для web, sessionStore/reconnect, timeout/ownership сокета, shutdown і чинні web-тести. Прикладний runner належить App, не одному WebSocket.

## Кроки

1. Переконатися, що web-App отримує той самий action/operation adapter і worker, що terminal-App.
2. Розрив сокета не завершує operation або не стирає F6; reconnect до чинної сесії показує поточний стан і дозволяє Cancel.
3. Передача ownership іншій вкладці не дублює запуск/запис; ввід старої вкладки і далі відкидається за чинним правилом.
4. Expiry/закриття сесії використовує lifecycle 35: abort network, коректне завершення commit, очищення worker. Не лишати прихованих job після знищення App.
5. Зберегти token/origin/host/size-перевірки; додавання дій не додає HTTP endpoint для довільного виконання.
6. Code-open у web лишається вбудованим viewer; operations не намагаються запустити серверний EDITOR від browser-клавіші.

## Перевірки

- Реальний локальний web transport: init → new/read/edit → map → feature дають той самий предметний стан, що terminal.
- Від'єднати сокет під час затриманої операції й повернутися: один operation ID, один запис, збережені parameters/progress/result.
- Друга вкладка забирає сесію: старий input не запускає другу операцію.
- Закриття/expiry App після active batch звільняє jobs; завершені записи лишаються правдиво відображеними до закриття.

## Приймання

- [x] Не потрібні браузерна мережа назовні чи реальний LLM.
- [x] Немає окремої бізнес-логіки операцій для browser.
- [x] Transport security та reconnect-контракти проходять чинні тести.

**Межі:** не додавати запуск web-сервера з термінального TUI чи спільний live-buffer між процесами.
**Validation:** `npm run typecheck`, `npm test`; ручний reconnect із локальним сервером за потреби конкретного непокритого сумніву.

## Result

Окремого коду життєвого циклу для web не знадобилось. Операції вже належали `App` сесії, а не сокету. Задача додала шов для тестів, наскрізні перевірки через справжній сокет і опис поведінки.

- **`src/tui/web.ts`** — `WebOptions` (раніше inline-тип) з новим необов'язковим `operations?: OperationRunner`, який передається в кожен `App` сесії (лише для тестів; типово — власний `OperationWorker` сесії, як у терміналі). Коментар у заголовку: операції належать сесії, кінець сесії (`q`, expiry, `server.close()`) іде через `App.close()` з 35. HTTP-endpoint не додано.
- **`tests/web.test.ts`** (+4 тести, хелпери `Screen`, `palette`, `artifacts`, `heldRunner`, `recordLines`):
  1. Справжній `keylang web` (CLI, порт 0) і термінальний `App` проходять однаковий сценарій: init зі стартового екрана → код із карти (вбудований viewer, `$EDITOR`/`$VISUAL` з маркер-командою не запускаються) → нова feature → редагування → Ctrl+S → `v` → map write → feature. Списки F6 однакові (3 записи), дерева файлів байтово однакові (крім `generated`). `/run`, `/operations`, `/api/map`, `/ws/run` дають 404.
  2. Map write, утриманий перед commit; вкладку закрито; release → один запуск, signal не перервано, на диску рівно те, що записує CLI `map` у двійнику. Reconnect: повідомлення `map write: N written · code 0`, у F6 один запис з `6 written` і `written  keylang/map/application.md`. Другий map write утримано, сокет розірвано, reconnect показує `waiting to write`, у F6 `running`, `x` → `cancelled`; release → нічого не записано, у F6 `[completed, cancelled]`, запусків 2.
  3. Друга вкладка забирає сесію: map write зі старої вкладки після takeover не запускає нічого (0 запусків, код 4000); запуск власника — рівно один.
  4. `keepMs` 200: expiry з утриманим write скасовує його (signal aborted), після release нічого не записано; той самий ID сесії відкриває нову сесію без записів. `server.close()` з утриманим write: signal aborted, вкладку закрито, після release нічого не записано.
- **`docs/tools.md`** — абзац у «`keylang web`»: спільні операції й worker, reconnect із тим самим записом і Cancel, ввід старої вкладки, кінець сесії через lifecycle 35.
- **Карта** — `keylang/map/tui.md`, `keylang/map-explained/tui.md`, `map-explained/README.md` перегенеровано; WIP-файли `extract.md` до й після байтово однакові (sha1), не закомічені.

Перевірки: `npm run typecheck` ✓; `npm test` 571 тест: 570 pass, 0 fail, 1 skipped ✓; `tests/web.test.ts` 3 прогони поспіль 18/18 ✓; `node bin/keylang.js map --check` ✓ 0; `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓.

Коміт: `3b8ba29` (Keep web operations with the session across socket drops and takeovers).

Передано 38: сценарій A27 (terminal ≡ web: init → edit → map → feature) — тест 1. Сценарії reconnect, ownership і expiry — тести 2–4.

Припущення й залишки:
- Тестовий runner на потоці тесту не бере аналізатор сесії web (`SnapshotWorker.generate` не готує `.keylang/cache/facts.json`), а аналізує сам, як worker. Справжній web-шлях використовує worker сесії: це перевіряє тест 1.
- Тест 3 не гарантує, що кадри старої вкладки дійдуть до сервера після takeover. Вони або відкидаються сервером за `session.connection !== connection` (чинне правило), або не надсилаються взагалі. В обох випадках операція не стартує.
- Expiry під час commit дописує поточний файл старим worker-ом, а новий hello з тим самим ID одразу створює нову сесію. Теоретично нова сесія може почати запис, поки старий worker дописує один файл. Глобальний lock не вводився (як і в 35).
- Пропозиції/proposal у web-сценарії A27 не перевірялись: їх покрито спільними тестами App, а для 36 вистачило init/new/edit/map/feature за переліком тікета.

## Comments

- 2026-10-01: виконано, коміт `3b8ba29`; web-сесія використовує ті самі операції й worker, reconnect/takeover/expiry/server.close перевірено 4 наскрізними тестами через справжній сокет.
