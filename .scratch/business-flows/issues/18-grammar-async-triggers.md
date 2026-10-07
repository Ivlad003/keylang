# 18: Мова: асинхронні тригери (route/cron/consumer/webhook), `continues`, таймери

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 02, 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Реалізація пунктів 3–4 ADR 0023.

- `- trigger route POST /V1/...`, `- trigger cron <id>`, `- trigger consumer <id>`, `- trigger webhook <id>` перевіряються проти `entries` (09): існує, вид збігається.
- `- continues <flow>`: обидва флоу існують; trace між ними — `unverified (crosses requests)`.
- `- after <тривалість>` / `- every <розклад>`: перевіряє лише вкладений `test`; static — для `every` розклад cron-точки входу збігається.
- `flows discover` (11) переходить на ці форми.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [ ] CLI-тести кожної форми й вердикту
- [ ] приклад «оплата з вебхуком» у docs/grammar.md

**Межі:** —

## Comments

### Рішення автора (2026-10-07)

- `continues` замість `wait` (рішення в 02).

### Рев'ю плану (2026-10-07)

`- trigger route POST /V1/carts/{cartId}/order` — шлях містить `/`, `{}`, `:`; за `grammar.md` §4–5 аргумент тригера — ID або лінк. **Рішення:** другий аргумент — у зворотних лапках (`route POST \`/V1/carts/{cartId}/order\``) або посилання на точку входу за її стабільним ID з `entries` (`route quote.Api.CartManagementInterface.placeOrder`), а мітка маршруту — у вердикті. Рекомендую друге: ID стабільніший за шлях і працює для всіх видів точок входу однаково.
