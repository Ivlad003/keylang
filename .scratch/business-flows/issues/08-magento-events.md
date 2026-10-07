# 08: Magento: `events.xml` і `dispatch()` → події та підписники

**Status:** ready-for-agent

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

- [ ] фікстура: dispatch + observer у двох областях + disabled; нелітеральний dispatch → дірка
- [ ] бенч 03: обидві `checkout_submit_*` з підписниками у флоу `placeOrder`
- [ ] документація

**Межі:** події інших фреймворків — 30/31.

## Comments

### Рев'ю плану (2026-10-07)

У знімку немає виду вузла `event`: `nodes[*].kind` — лише `layer | module | fn | type` (`src/snapshot.ts:123`); `event` є тільки в граматиці специфікацій (`spec-ir.ts:147`). Новий вид вузла торкає `emit.ts` (карта), схему `index.json`, `resolve.ts` (K001/«did you mean»), LSP-доповнення, zoom у TUI і `explain`. Це більше, ніж описано. **Рішення:** окремий підпункт у цьому тікеті «вид вузла `event` у знімку й карті» з власними тестами, виконувати першим; події розміщувати під модулем, чий код їх диспатчить (`<module>.events.<name>`) або в окремому згенерованому розділі карти `events.md` — обрати в ADR 0022.
