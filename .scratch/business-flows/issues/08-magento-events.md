# 08: Magento: `events.xml` і `dispatch()` → події та підписники

**Status:** resolved

**Type:** code

**Blocked by:** 01, 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

57 observers у п'яти модулях; `QuoteManagement` диспатчить `checkout_submit_before`, `checkout_submit_all_after` і ще три.

- Вузли подій `event.<name>` у знімку (вид `event` уже є в мові: `Member` — `fn`, `type`, `event`).
- `$this->eventManager->dispatch('literal', …)` → ребро від fn до події з `via: dispatch`; нелітеральна назва → дірка `dynamic-event`.
- `etc/events.xml` (з областями): `<event name="e"><observer name="o" instance="C" disabled?/>` → ребро від події до `C::execute` з `via: observer`; observer — також точка входу виду `observer` (09).
- Карта: розділ подій із видавцями й підписниками; `explain event.<name>`.
- Синтаксис флоу `emits event` перевіряє 16 (тут — лише факти).

## Критерії готовності

- [x] фікстура: dispatch + observer у двох областях + disabled; нелітеральний dispatch → дірка
- [x] бенч 03: обидві `checkout_submit_*` з підписниками у флоу `placeOrder`
- [x] документація

**Межі:** події інших фреймворків — 30/31.

## Comments

### Рев'ю плану (2026-10-07)

У знімку немає виду вузла `event`: `nodes[*].kind` — лише `layer | module | fn | type` (`src/snapshot.ts:123`); `event` є тільки в граматиці специфікацій (`spec-ir.ts:147`). Новий вид вузла торкає `emit.ts` (карта), схему `index.json`, `resolve.ts` (K001/«did you mean»), LSP-доповнення, zoom у TUI і `explain`. Це більше, ніж описано. **Рішення:** окремий підпункт у цьому тікеті «вид вузла `event` у знімку й карті» з власними тестами, виконувати першим; події розміщувати під модулем, чий код їх диспатчить (`<module>.events.<name>`) або в окремому згенерованому розділі карти `events.md` — обрати в ADR 0022.

### Реалізовано (2026-10-08)

- **Підпункт рев'ю «вид вузла `event` у знімку й карті» — зроблено першим.** `SnapshotNode.kind` має `event`; схема знімка 9, екстрактор `m1.19`. Розміщення (ADR 0022, нове «Уточнення реалізації … 08/10»): згенерована група — шар `events` (зарезервований, як `external`), ID `events.<назва>`, незалежний від того, хто диспатчить. Назва з недозволеними в сегменті символами кодується (`sales.order.place_after` → `events.sales-order-place_after`, літерал у `name`), правило — у `docs/semantics.md` §6. Граматика: `event` під `layer` і `calls` під `event` (`docs/grammar.md`). Карта — `keylang/map/events.md`: `- event <назва> <!-- dispatched by: … -->` і `- calls <observers> <!-- via: … observer <site> [область] -->`; fn-видавець має подію в своєму `calls`. Отже K001 і «did you mean» знають ID подій з карти без окремого коду (`resolve.ts` не змінювався); LSP доповнює події для `step` та інших ID; zoom у TUI має вид рядка `event`; `explain events.<назва>` друкує `dispatched by:` і `observers:` з рядками конфігу.
- `$x->dispatch('літерал', …)` через тип `Magento\Framework\Event\ManagerInterface`/`Manager`, клас, що його реалізує, або тип, прив'язаний preference до такого класу → ребро `via: "dispatch"`; нелітеральна назва → дірка `dynamic-event`. Екстрактор PHP пише `nameArg` (перший аргумент) лише для `dispatch`. `etc/events.xml` у всіх областях → ребра `via: "observer"` (`scope`, `owner`, `site`, `binding`); декларація області змінює глобальну, вимкнений в області глобальний observer — одне ребро `global` з `(disabled in frontend)` у `binding`. Observers — точки входу `observer`. `deny`/`baseline` бачать `observer` як залежність `owner`.
- Флоу: крок може назвати подію; у `behavior` `static ok` через `dispatch`, observer під подією — через `observer`; `--static shape` — `unverified`; `dynamic-event` у досяжному коді дає `unverified` замість `fail`. `draft flow --mode algo` пише подію кроком (`via dispatch`) і observers під нею. `/api/views` віддає події (`eventsOf`), `diagram {kind:"event"}` малює видавців → подію → підписників (за ID чи літералом); `callsOf` події — видавці як callers, observers як callees; `dynamic-event` — окремою діркою поруч із самим викликом.
- Тести: `tests/frameworks-magento.test.ts` (події, області, disabled, нелітеральний dispatch, карта, `explain`, флоу), `tests/explorer-events.test.ts` (`eventsOf`, `callsOf`, вид діаграми), `tests/web.test.ts` (`/api/views`, `/api/diagram?view=event`, `/api/calls`), `tests/diagram.test.ts`, `tests/bench-magento.test.ts`.
- Бенч (`bench/magento/results.md`): 83 вузли подій, 53 ребра `dispatch`, 36 ребер `observer`, 3 `dynamic-event`; у чернетці `placeOrder` обидві `events.checkout_submit_before` і `events.checkout_submit_all_after` — кроками з підписниками; `expect.json` тепер називає ID подій.
- **Обмеження:** диспатч через нетипізовану успадковану властивість (`$this->_eventManager` моделей Magento) ребра не дає — тип не вгадується з імені; більшість таких назв однаково нелітеральні (`_eventPrefix . '_save_after'`). Синтаксис `emits event`/`trigger event` — тікет 16.
