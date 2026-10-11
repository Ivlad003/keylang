# 04: Fn, передана як значення, — досяжна `via value`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** Р3: аргумент-ім'я, що резолвиться у fn (`createBasketAction(handler)`, `arr.map(fmt)`, `useEffect(load)`, `server.on('x', h)`), робить fn досяжною від fn, що робить виклик. Окремий вид у `coverage` (`via value`) і в `explain`; `check` не дає `ok` для кроку лише через нього (лишається `unverified`). Експорт `const action = factory(fn)` у React Router / Next — entry на `fn`, якщо фабрика — fn репо, що повертає функцію-обгортку, яка викликає аргумент (перевірено в тілі фабрики), інакше як зараз — модуль з note.

- [ ] storefront: 10 «no fn» дій кошика → flows
- [ ] 541 «read as a value» → переважно досяжні `via value`
- [ ] тест з фабрикою, що викликає / не викликає аргумент

## Comments
