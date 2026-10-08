# 34: NestJS: providers, контролери, події, cron, мікросервіси

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (TS) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- **Прив'язки:** `providers: [{ provide: I, useClass: C }]`, `useExisting`, `useFactory` (дірка з причиною), токени-рядки/Symbol з `@Inject('TOKEN')`; конструкторна ін'єкція `constructor(private readonly x: XService)` — тип параметра вже дає виклик, інтерфейс + provide — через `bindings`.
- **Точки входу:** `@Controller('orders')` + `@Get(':id')`/`@Post()`… → `route` з міткою `GET /orders/:id` (глобальний префікс з `app.setGlobalPrefix('api')` у `main.ts`, якщо літерал); `@Cron('0 * * * *')`/`@Interval` → `cron` (мітка закінчується cron-виразом); `@OnEvent('order.created')` → `observer` + ребро подія → обробник (`via: "observer"`), `eventEmitter.emit('order.created')` → `dispatch`; `@MessagePattern`/`@EventPattern` → `consumer`; `@Resolver` + `@Query`/`@Mutation` → `graphql`.
- Рев'ю 2026-10-06 §3: зараз `@OnEvent` дає хибний `static fail` з порадою «add a call» — після тікета крок під подією має бути `ok` через `via: "observer"`.

## Критерії готовності

- [x] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [x] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [x] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments

### Реалізовано (2026-10-08)

- **Факти коду.** TS-екстрактор записує декоратори класу, методу й параметра конструктора (`DeclFact.decorators`, тип `CodeDecorator` у `src/frameworks/adapter.ts` — шар `base`, окремо від Python-го `DecoratorFact`: назва, аргументи як значення — рядок, число, ім'я, об'єкт, масив, функція; для параметра — позиція, ім'я, тип), `CallFact.literal` — перший рядковий аргумент `setGlobalPrefix`, і `CallFact.param` для `this.x.m()`, де `x` заповнює параметр конструктора (TS, як уже в PHP). `EXTRACTOR_VERSION` → `m1.22` після злиттів.
- **Адаптер** `nestjs` (`src/frameworks/nestjs.ts`): виявлення — `@nestjs/core`/`@nestjs/common` у кореневому `package.json` або `nest-cli.json`; конфіги — проаналізовані файли, що імпортують `@nestjs/…`. Інтерфейс адаптера дістав необов'язковий `code(path, fileFacts)`: конфіг, записаний у коді, читається з фактів екстрактора (кеш — разом із кодом), `src/map.ts` викликає його замість `parse`. `ConfigFacts` — нові необов'язкові `providers`, `injections`.
- **Прив'язки** (`src/frameworks/bindings.ts`): токен (рядок або ім'я, зіставлене через імпорти й реекспорти — `BindingDeps.token` у `src/graph.ts`) → класи провайдерів (`useClass`, провайдер-клас, `useExisting` ланцюжком) → аргумент конструктора: `this.repo.save()` — `via: "argument"` з `site` провайдера; `useFactory`/`useValue` — `unresolved-binding` з причиною; клас як токен — ще й preference. `resolve` у графі тепер іде й через імпорти файла (`useClass: SqlOrderRepo`, імпортований у файл модуля).
- **Події** — механізм тікета 08 (злився в master під час роботи; спершу тут було пряме ребро емітер → слухач, при злитті переведено): `@OnEvent('e')` → `ConfigFacts.observers` (як `<observer>` Magento), адаптер оголошує диспетчером `@nestjs/event-emitter\EventEmitter2` (`dispatchers`; `qualifiedIn` у графі кваліфікує TS-ім'я як `<пакет>\<експорт>`), а TS-екстрактор пише `nameArg` для `emit`/`emitAsync`. Тож `this.events.emit('order.created')` — ребро `dispatch` до вузла `events.order-created`, а від нього — `observer` до методу (`owner` — модуль слухача; `deny` емітера на слухача K102 не дає); нелітеральна назва — `dynamic-event`; точка входу `observer` — `order.created (NotifyListener.onCreated)`. `dispatch` NestJS — залежність викликача (як у Magento), `observer` — ребро конфігу модуля слухача.
- **Точки входу** (`src/framework-entries.ts`): `@Controller` + `@Get`/`@Post`/… → `route` з глобальним префіксом (літерал `setGlobalPrefix`; нелітеральний — `note`), `@Cron`/`@Interval`/`@Timeout` → `cron`, `@MessagePattern`/`@EventPattern` → `consumer`, `@Resolver` + `@Query`/`@Mutation`/`@Subscription` → `graphql`.
- **Тести:** `tests/frameworks-nestjs.test.ts` (7, через CLI): `@Inject(ORDER_REPO)` з інтерфейсним параметром, `useExisting`, `useFactory`-дірка, `emit` → `@OnEvent`, нелітеральні подія й префікс, усі види точок входу, крок під `@OnEvent` — `static ok` у `behavior` / `unverified` у `shape` (рев'ю §3), `deny` на рядку провайдера, `frameworks: []` metamorphic (ok/fail → лише unverified; крок під `@OnEvent` — `unverified`, не `fail`), `flows discover` і `coverage`.
- **Docs:** `docs/snapshot.md` «Фреймворки: NestJS», `docs/semantics.md` (`observer`), `llm.txt` рядок.
