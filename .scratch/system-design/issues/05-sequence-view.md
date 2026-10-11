# 05: sequence-представлення

**Status:** resolved

**Type:** code

**Blocked by:** 02

**Verify:** `node --test tests/system-view.test.ts` · `npm run test:web` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р6, Р11

**What to build:** `view=sequence&name=&seq=`: учасники рядком угорі, лінії життя, повідомлення зверху вниз у порядку запису з номером і текстом, async — пунктир; власне розташування (не `layout`). Список sequence системи на сторінці.

- [x] учасники в порядку першої появи, повідомлення з номерами
- [x] e2e: sequence видно й можна вибрати

## Comments

### Notes

- 2026-10-11: Учасники в порядку першої появи, якорі на лініях життя, повідомлення з номером; самоповідомлення сходить своєю лінією. У статусі якорі й лінії життя не рахуються.
- 2026-10-11: Тести: `tests/system-view.test.ts`, `tests/web-e2e/system.test.ts`.
