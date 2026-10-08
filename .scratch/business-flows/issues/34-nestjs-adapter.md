# 34: NestJS: providers, контролери, події, cron, мікросервіси

**Status:** ready-for-agent

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

- [ ] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [ ] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [ ] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments
