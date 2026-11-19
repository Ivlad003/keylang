# 04: Запускний приклад з кодом `examples/fence`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §3 рядок 8; `docs/usability-probe.md:30` (LSP порожній на `shop-fixed`); AI-пілот 2026-10-04, виправлення протоколу 1.

**What to build:** `examples/shop` і `examples/shop-fixed` — лише специфікації, без коду й `keylang.json`. Тому правила там `unverified` («no snapshot»), а доповнення й hover у LSP порожні. Приклад, на якому новачок за хвилину бачить і `ok`, і K102, відсутній.

Створити `examples/fence/` — найменший реалістичний TS-проєкт, де `keylang check` має що перевіряти. Основа — `tests/fixtures/repo` (шари `domain < app`, бічний `infra`, `deny domain infra`), але як окремий приклад з поясненням:

- `src/domain/order.ts`, `src/app/checkout.ts`, `src/infra/db.ts` — кілька функцій, жодної залежності поза `node:`;
- `keylang.json` з трьома шарами;
- `keylang/rules.md` — `layers`, два `deny` (`deny domain infra`, `deny domain external`) з реченням «чому» над кожним;
- `keylang/flows/checkout.md` — один потік `trigger app.checkout.checkout` → `step domain.order.createOrder`;
- `keylang/map/` — згенерована карта (`node bin/keylang.js map` з кореня прикладу);
- `README.md` прикладу англійською, до ~30 рядків:
  - три команди з кореня прикладу: `npx keylang check`, `npx keylang map --check`, `npx keylang`;
  - який рядок додати в `src/domain/order.ts` (`import { save } from "../infra/db.ts";`), щоб побачити K102;
  - очікуваний вивід текстом.

`examples/shop*` не чіпати: на них спираються курс, скриншоти й `docs/usability-probe.md`.

- [ ] з кореня `examples/fence` (через `node <keylang>/bin/keylang.js`): `check` → 0 fail, код 0; `map --check` → код 0
- [ ] CLI-тест на тимчасовій копії прикладу: чистий стан — код 0; з доданим забороненим імпортом — K102 на рядку імпорту і код 1
- [ ] `lsp` на прикладі повертає непорожнє доповнення після `- step ` у потоці (тест або ручна перевірка з нотаткою)
- [ ] кореневі `node bin/keylang.js map --check` і `check` не бачать прикладу (він поза шарами keylang)
- [ ] `docs/README.md` і `docs/course/02-install-and-check.md` згадують приклад одним рядком

Ключові файли: `examples/fence/**`, `tests/cli-check.test.ts` (або новий `tests/examples.test.ts`), `docs/README.md`, `docs/course/02-install-and-check.md`

## Comments
