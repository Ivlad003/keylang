# 05: Граф і draft: callable-посилання й closure, передані аргументом (`cartMutex->execute(\Closure::fromCallable([$this, 'placeOrderRun']))`)

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 01

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

`QuoteManagement::placeOrder` робить усю роботу в `$this->cartMutex->execute($cartId, fn() => $this->placeOrderRun(...))`, і `draft flow` дає порожній флоу. Екстрактор уже позначає такі виклики `closure: true` (`src/extract/php.ts:480-505`), але граф і `draft flow --mode algo` їх не використовують як кроки.

- Closure-літерал, переданий **аргументом виклику** (не збережений у змінну/поле), — ребро `call` від обгортаючої fn з `via: closure-arg` і позицією; так само для TS/JS (arrow/function expression), Python (lambda), Rust (closure). Closure, збережена у значення, лишається діркою.
- `--static=behavior` іде цими ребрами (як хуками), `shape` — ні; вердикт це називає.
- `draft flow` розгортає такі виклики як кроки з коментарем `<!-- keylang:algo via closure -->`.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [ ] `draft flow …placeOrder --mode algo --print` на фікстурі-копії Magento-патерну містить `placeOrderRun` → `submitQuote`
- [ ] тести для PHP, TS, Python: closure-аргумент → ребро; closure у змінній → дірка
- [ ] семантика в `docs/semantics.md` (розділ «Хуки й режим static») і `docs/snapshot.md`
- [ ] бенч 03 показує непорожній `placeOrder`

**Межі:** без читання конфігів фреймворку.

## Comments

### Рев'ю плану (2026-10-07)

**Помилка в постановці.** У Magento `placeOrder` — не closure. Код (`QuoteManagement.php:444`): `$this->cartMutex->execute((int)$cartId, \Closure::fromCallable([$this, 'placeOrderRun']), [...])`. Це **callable-масив**, і PHP-екстрактор його не бачить узагалі: у `index.json` вузол `placeOrder` має `calls: []`, а єдиний запис — дірка `this.cartMutex.execute`. Сам по собі «closure-аргумент» `placeOrder` не відкриє.

**Що зробити замість / додатково:**
1. **Callable-посилання як `valueRef`** (у `FileFacts.valueRefs` уже є саме це поняття — «ім'я, прочитане як значення»): PHP `[$this, 'm']`, `[self::class, 'm']`, `[$obj, 'm']` з відомим типом `$obj`, `'Cls::m'`, `\Closure::fromCallable(<те саме>)`, first-class callable `$this->m(...)` (PHP 8.1), `callable`-рядки у `array_map`/`usort`/`call_user_func`. TS: `this.m.bind(this)`, `obj.m`, `() => this.m()`; Python: `self.m` як аргумент, `functools.partial(self.m)`; Rust: `Self::m` як аргумент, `|x| self.m(x)`.
2. Коли таке посилання стоїть **аргументом виклику** (не збережене в поле/змінну) — ребро `call` від обгортаючої fn до `m` з `via: "callable-arg"` і позицією; `--static=behavior` іде ним, `shape` — ні. Збережене в змінну/поле — escape, як зараз.
3. Closure-літерал аргументом — те саме з `via: "closure-arg"` (початкова постановка тікета лишається, але другою).
4. `draft flow` показує такі кроки з коментарем `<!-- keylang:algo via callable -->`.

**Тип `Call.via`** (`src/graph.ts:166`) сьогодні `"default" | "injected"` — розширити об'єднанням і оновити `covers()` (`graph.ts:1212`) та `flows.ts:435/496` (`proves`), де `via` зараз означає лише хуки.
