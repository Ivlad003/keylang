# 18: Мова: асинхронні тригери (route/cron/consumer/webhook), `continues`, таймери

**Status:** resolved

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

- [x] CLI-тести кожної форми й вердикту
- [x] приклад «оплата з вебхуком» у docs/grammar.md

**Межі:** —

## Comments

### Рішення автора (2026-10-07)

- `continues` замість `wait` (рішення в 02).

### Рев'ю плану (2026-10-07)

`- trigger route POST /V1/carts/{cartId}/order` — шлях містить `/`, `{}`, `:`; за `grammar.md` §4–5 аргумент тригера — ID або лінк. **Рішення:** другий аргумент — у зворотних лапках (`route POST \`/V1/carts/{cartId}/order\``) або посилання на точку входу за її стабільним ID з `entries` (`route quote.Api.CartManagementInterface.placeOrder`), а мітка маршруту — у вердикті. Рекомендую друге: ID стабільніший за шлях і працює для всіх видів точок входу однаково.

### Реалізація (2026-10-08)

- Зроблено за ADR 0023 пп. 3–5 і рішенням рев'ю плану: тригер посилається на ID fn точки входу з `entries`, не на шлях; мітка (`POST /orders`, розклад) — у вердикті. Усі слова контекстні лише в `# flow` (раніше K004), формат додавальний.
- `- trigger route|cron|consumer|webhook <id>`: вид у `Node.label`, `Trigger.entry` у SpecIR. Невідоме перше слово без крапки — K005 «unknown trigger kind». `static` з area `<вид> <id>`: `ok` з міткою точки входу (і фреймворком); fn — точка входу лише інших видів — **K205** (error) на слові виду; fn без точки входу або знімок без `entries` — `unverified`. `FlowInput.entries` / `SnapshotInput.entries` передає `assess`.
- `- continues <flow>` (верх потоку): потік, якого немає, — **K206** (resolve, з «did you mean»); інакше `ID ok` «flow `x` at file:line», з `check.trace` — `trace unverified` «crosses requests».
- `- after <тривалість>` (`30m`; ms, s, m, min, h, d, w) і `- every <розклад>` (тривалість, `@daily`…, 5–6 полів cron голих чи в лапках) під кроком чи на верху потоку; поганий аргумент — K005. Доводить лише вкладений `test` (`tests` з area `after 30m`); `every` має ще `static` проти cron-точки входу батька: розклад з мітки (уся мітка або останні 5–6 полів; макрос = поля) збігся — `ok`, інший тієї ж форми — `fail`, інакше `unverified`. Адаптера cron ще немає (10), тож `every`/`trigger cron|consumer` з `ok` перевірено через `evaluateFlows` напряму; формат мітки cron для 10 — «… <розклад>».
- `flows discover` пише `- trigger <вид> <id>` для точок входу видів route/cron/consumer/webhook (`draftFlow` з опцією `entry`).
- LSP: слова за позицією; після `trigger ` — види й fn, після `trigger <вид> ` — ID точок входу цього виду з міткою; після `continues ` — імена інших потоків. Hover-ролі.
- Тести: `tests/async-flows.test.ts` (K005/K205/K206/K009 з позиціями, `parse` без кодів check, `explain`, route `ok` на Express-літералі, K205 на TS і Python, `continues`, `after`/`every` з тестом і без, `every` проти cron, `fmt` ідемпотентний на всіх формах, `flows discover`), `tests/lsp.test.ts`, `tests/discover.test.ts`, `tests/format-examples.test.ts`.
- Документація: grammar.md (§5, Р17 з прикладом «оплата з вебхуком», Додаток А), semantics.md («Асинхронні форми», K205/K206), cheatsheet.md, llm.txt.
- K-коди: K204 лишено для 16 (невідома подія), щоб номери йшли за ADR; K009 — парсер/компіляція, K205–K206 — серія K20x.
