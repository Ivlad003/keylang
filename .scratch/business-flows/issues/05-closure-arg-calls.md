# 05: Граф і draft: callable-посилання й closure, передані аргументом (`cartMutex->execute(\Closure::fromCallable([$this, 'placeOrderRun']))`)

**Status:** resolved

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

- [x] `draft flow …placeOrder --mode algo --print` на фікстурі-копії Magento-патерну містить `placeOrderRun` → `submitQuote`
- [x] тести для PHP, TS, Python: closure-аргумент → ребро; closure у змінній → дірка
- [x] семантика в `docs/semantics.md` (розділ «Хуки й режим static») і `docs/snapshot.md`
- [ ] бенч 03 показує непорожній `placeOrder` (перевіряє тікет 03 на справжньому Magento; тут — фікстура-копія патерну)

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

### Реалізовано (2026-10-07)

За постановкою рев'ю (callable-посилання першими, closure — другим):

- **Факти.** `PassFact` (`src/extract/facts.ts`) тепер несе текст і позицію аргумента (і `docblock`, коли клас отримувача — лише з `@var`); `CallFact.closureArg` — позиція найзовнішньої closure, коли кожна closure між викликом і тілом fn — аргумент виклику. Екстрактори: PHP (`passesOf`/`callableOf`: `[$this, 'm']`, `[self::class|static::class, 'm']`, `[$obj, 'm']` і `[$this->prop, 'm']` з відомим класом, `[Order::class, 'm']`, `'Order::m'`, `\Closure::fromCallable(…)`, first-class callable `$this->m(...)` / `Order::m(...)` / `f(...)`, рядок `'f'` в аргументах `call_user_func`/`array_map`/`usort`/…; ім'я в рядку — повне), TS (`passesOf` + `this.m.bind(this)`; `markClosure` замість `insideClosure`), Python (`self.m`, `Cls.m`, `obj.m`, `callback=self.m`, `functools.partial(self.m, …)`; lambda), Rust (`Self::m`, `m`, шлях; `|x| …`).
- **Граф.** `Call.via` / `SnapshotEdge.via`: `"default" | "injected" | "callable-arg" | "closure-arg"` (тип `Via` у `graph.ts`). `passCallables` додає ребро `callable-arg` на позиції аргумента для кожного pass із `path: ""`, що розв'язується в fn (клас — ні, його конструктор «тікає», як і раніше), незалежно від того, чи розв'язався сам виклик (`$this->cartMutex->execute` через інтерфейс лишається діркою). `push` дає виклику з `closureArg` `via: closure-arg` і `site`. `addCall.covers` — за рангом: прямий виклик (3) > хук/callable/closure-аргумент (2, один перекриває інший) > виклик у збереженій closure (1, різні `via` співіснують). `callsResolved` ребра `callable-arg` не рахує (документовано в `docs/snapshot.md`, рядок `stats`).
- **Flows.** `provesIn(behavior)`: у `behavior` доводять ребра поза closure і ребра `closure-arg`; у `shape` — лише звичайні виклики поза closure. `closureOnly` відрізняє збережену closure від переданої. Повідомлення: «called from X through the callable `[$this, 'placeOrderRun']` passed at file:line:col», «through the closure passed at file:line:col»; у `shape` — «the callable `…` passed as an argument (not followed in static mode shape, set by --static) at … may reach it». `calls`-рядок — так само. `explain`: `(a callable passed as an argument)` / `(in a closure passed as an argument at …)`.
- **Draft.** `draftFlow` ставить `<!-- keylang:algo via callable -->` / `<!-- keylang:algo via closure -->` на крок за таким ребром.
- **Тести.** `tests/php.test.ts` (фікстура за `QuoteManagement::placeOrder`: draft, behavior, shape, знімок, `callsResolved`), `tests/analyzer.test.ts` (TS; плюс оновлені очікування для `forEach`/`.map`-closure і JSX-фабрик — `Cart`, передане звичайному виклику, тепер `callable-arg`), `tests/languages.test.ts` (Python, Rust), `tests/flows.test.ts` (колбек у `behavior` — ok через callable; формати — на `shape`), `tests/metamorphic.test.ts` (`--static shape` лише послаблює).
- **Поза обсягом / помічено.** Rust-шлях `crate::a::b::f` аргументом не розв'язується так само, як і прямий виклик `crate::a::b::f()` (імпорт `crate::a::b::f` нерозв'язаний — наявне обмеження резолвера, не цього тікета). Пункт «бенч 03 показує непорожній `placeOrder`» перевіряє тікет 03 на справжньому Magento.

### Доведено (2026-10-08)

- PHP: callable-масив з властивістю як отримувачем (`$cb = [$this->store, 'later']`), збережений у змінну, тепер теж «читання значення» (`valueRef`) — крок `later` лишається `unverified` у `shape` і `behavior`, а не `fail` (ловив `tests/metamorphic.test.ts`).
- Тести: виправлено очікування — позиція `[$this, 'placeOrderRun']` (13:74), формулювання для збереженого callable («no call path … in the static graph; `later` is read as a value …»), і кількість дірок у TS-фікстурі (виклик `this.bound.bind` — сам нерозв'язаний виклик `Function.prototype.bind`, лишається діркою).
- Злито `master`, карту перегенеровано. Прогін: `tests/{php,analyzer,languages,flows,metamorphic}.test.ts` — 134 тести, 131 pass, 0 fail, 3 skipped; `npm run typecheck`, `keylang map --check`, `keylang check` (0 fail) — чисто. Повний `npm test` — на review-зміні.
