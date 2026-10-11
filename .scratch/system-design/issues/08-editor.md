# 08: палітра редактора системи і пропозиція `# system`

**Status:** resolved

**Type:** code

**Blocked by:** 03

**Verify:** `node --test tests/system-editor.test.ts` · `npm run test:web` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р12

**What to build:** На представленні системи палітра редактора — види компонентів, зона, примітка; з'єднання — дієслова зв'язків. `diagramChanges` для `view=system` пише секцію `# system <name>` (нові компоненти, зони, зв'язки; прибрані — прибирає; описи й таблиці наявних — зберігає) у `<dir>/system/<name>.md` як пропозицію.

- [x] новий компонент і зв'язок у моделі редактора → рядки в пропозиції
- [x] прибраний зв'язок прибирає рядок; таблиці й описи лишаються
- [x] e2e: палітра має компоненти системи

## Comments

### Notes

- 2026-10-11: Редактор: `ShapeKind` `component`, `LinkKind` `relation`, `SYSTEM_PALETTE`, панель — вид і технологія компонента, мітка зв'язку з перевіркою дієслова. Сервер: `src/system-proposal.ts` (`systemChanges`), гілка `system:` у `src/operations/diagram-propose.ts`; `system:@code` пропонує новий файл.
- 2026-10-11: Межа: вкладені зони полотно не малює — після пропозиції зони пласкі (підпис зберігається).
- 2026-10-11: Тести: `tests/system-editor.test.ts` (2), `tests/web-e2e/system.test.ts` (палітра й пропозиція).
