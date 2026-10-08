# 16: Мова: `trigger event`, перевірка `emits event` проти фактів

**Status:** resolved

**Type:** code

**Blocked by:** 02, 08

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Реалізація пункту 1 ADR 0023.

- Парсер/SpecIR: `- trigger event <name>`; `emits event <name>` під кроком тепер має ID події.
- Перевірка: `emits` — `static ok`, якщо в піддереві кроку є dispatch літерала; `fail` — повністю прочитана область без dispatch; `unverified` — dynamic-event або дірка. `trigger event` — ID події існує, підписники перелічені у вердикті.
- LSP-доповнення назв подій; gutter у TUI.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] CLI-тести на кожен вердикт; K-коди за ADR
- [x] fmt ідемпотентний; grammar.md/semantics.md

**Межі:** події поза фактами адаптерів — unverified.

## Comments

- 2026-10-08 — зроблено за ADR 0023 п. 1 і уточненням ADR 0022 про ID подій (`events.<назва>`, закодовані сегменти, `keylang/map/events.md`). Формат додавальний, нової редакції немає.
  - **Парсер/SpecIR.** `- trigger event <id>`: `label` — `event`, ID — посилання; у `Trigger` нове поле `event` (span слова). `emits [event] <name>`: ім'я, що є ID з першим сегментом `events` (голе чи лінком), — ще й посилання (`ClaimItem.target`), будь-яке інше — проза, як раніше (без вердикту й K-коду). Невідомий вид тригера — K005 зі списком `route, cron, consumer, webhook, event`.
  - **K-коди** (`check`, не `parse`; `src/resolve.ts`): **K204** «unknown event» з `did you mean` серед подій індексу замість K001; **K205** розширено: `trigger event` на fn, тип чи модуль. `keylang explain K204` / `K205`.
  - **Static** (`src/flows.ts`): `emits` — досяжність від батька (крок; на верху — тригер) до вузла події тими самими правилами, що й крок до події: `ok` з місцем `dispatch`; `fail` «absence: no dispatch of … in the code … reaches»; `unverified` для дірки `dynamic-event` чи іншої дірки на шляху, а в `--static shape` — бо `dispatch` сам є ребром конфігу (як у наявному `step events.x`). `trigger event` — `static` з area `event <id>`: `ok` перелічує підписників (fn і рядок конфігу, область не `global`), без підписників — `unverified`. Кроки просто під ним перевіряються від підписників: сам підписник — `ok` «a subscriber of …», інакше перший підписник з доведеним шляхом названо у вердикті; `fail` — коли кожен дає absence.
  - **Django/Celery** (`src/python-web-entries.ts`): сигнали тепер теж вузли подій (`events.order_placed`, `events.post_save`): `send()` — ребро `dispatch` до події, receiver — ребро `observer` від події з місцем реєстрації. Прямі ребра відправник → receiver лишились (на них стоять `deny`/K102 і наявні кроки), ребра події власника не мають, тож нових K102 немає. Карта друкує сигнали в `events.md`; чернетка потоку відправника має ще `step events.<signal>` (тест python-web: `steps=5`).
  - **discover:** точка входу `observer`, чиє ребро від події стоїть на її рядку конфігу, пишеться як `- trigger event events.<назва>` з fn підписника першим кроком (Magento й Django); інакше лишається `trigger <fn>`. Записаний потік `trigger event` з підписником першим кроком рахується як specified.
  - **LSP:** після `emits event ` / `emits ` / `trigger event ` — ID подій знімка (детально: літерал і підписники), далі події карти й `planned event`; після `trigger ` — ще й слово `event`. Hover-ролі `trigger`/`emits` оновлено. **Gutter** — звичайні позначки рядків з вердиктів; прозовий `emits` без позначки. **Діаграма:** вузол `emits` з ID посилається на подію; у BPMN `trigger event` — стартова подія-сигнал з `signalRef` на сигнал події.
  - **Тести:** `tests/flows-events.test.ts` (Magento: emits ok / fail / unverified dynamic-event / shape, trigger event з підписниками й кроками ok/fail, K204 з did-you-mean, K205, `parse` без них, проза без змін, fmt, discover + adopt, gutter, діаграма/BPMN; Django: emits ok / fail / shape, trigger event з receiver, карта), `tests/lsp.test.ts` (доповнення), `tests/frameworks-python-web.test.ts` (нові ребра подій, `steps=5`, `trigger event` у discover), `tests/async-flows.test.ts` (повідомлення K005). Документація: grammar.md (§5, Р11, Р17 з прикладом K204/K205, Додаток А), semantics.md (§6, §7, «Асинхронні форми» → «Події»), cheatsheet.md, llm.txt.
  - **Межі:** Python динамічних назв сигналів (`dynamic-event`) не дає — нерезолвлений `send()` лишається звичайною діркою виклику. NestJS, Laravel і Symfony (злиті з master під час роботи) дають ті самі вузли подій, тож форми працюють і для них без окремого коду; `flows discover` для NestJS-listener тепер пише `trigger event events.order-created` (тест `frameworks-nestjs` оновлено).
