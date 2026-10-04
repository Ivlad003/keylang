# JSX як звичайний виклик — чи ламає це Express і Nest

2026-09-29

Ідея: тег JSX, який називає компонент, стає ребром `call`, без окремої моделі компонентів. Для бекенду на `.ts` це безпечно, якщо нове ребро народжується лише з вузла, який граматика TSX/JSX уже розібрала як JSX. Граматика TypeScript для `.ts` таких вузлів не дає: кутові дужки там лишаються type assertion або type arguments. Небезпека не в самому JSX, а в спеціальних випадках за голим ім’ям `forwardRef`, `memo`, `lazy`, `createElement`. Nest теж експортує `forwardRef`. Граматика `tsx` уже підключена; чого бракує, щоб файл `.tsx` отримав ребра, — у розділі «Що потрібно, щоб підтримати TSX».

Це дослідницька нотатка, не зміна специфікації. Пункти 1–3 і 5 пропозиції реалізовано (див. [format.md](format.md)); `"use client"` / `"use server"` і `component={X}` як читання значення досі відкладено.

## Пропозиція

1. У витяганні TS/JS `<Cart />` і `<Cart></Cart>` — виклик від оточуючої функції до `Cart`, коли ім’я резолвиться в fn або class. `<Cart.Item />` — як `Cart.Item()`. `<div>`, `<button>` і фрагмент без імені — не ребра. Динамічний тег — дірка покриття, як computed call. JSX усередині `.map(() => …)` лишається викликом у замиканні: карта його бачить, static не підтверджує, доки колбек не викликано.
2. Той самий факт береться з `createElement(Cart)`, `jsx(Cart)`, `jsxs(Cart)` лише коли callee імпортовано з `react` або `react/jsx-runtime` (і `jsxDEV` з dev-рантайму). Нового виду ребра немає. Текст ребра може бути `<Cart />`. Граматика мови й правила не змінюються. `snapshotId` ребер не хешує: без підйому `EXTRACTOR_VERSION` він не зрушить ні в `.tsx`, ні в Nest. Підйом зрушить id у всіх репозиторіях, тож для незмінного id бекенду версію не чіпати.
3. `const Cart = memo(() => …)`, так само `forwardRef` і `lazy`: сьогодні ініціалізатор — виклик, тому ім’я не fn. Розгортати в fn лише `const`, чий callee резолвиться в імпорт саме з `react`. Голого тексту імені недостатньо: Nest теж має `forwardRef(() => Module)` з `@nestjs/common`. Будь-яка інша обгортка лишається value.
4. Анонімний `export default function ()` уже називається `default`. Іменований `export default function main` лишається `main`. Повторно це не реалізовувати.
5. Сегменти маршруту: `(shop)` і `[id]` зараз санітизуються в ID, який може зіткнутися з іншим сегментом. Дужки кодувати оборотно в один сегмент ID лише коли сире ім’я ще не є валідним сегментом. Ребро layout→page з файлової системи не вигадувати. Пізніше, окремо: `"use client"` / `"use server"` як факт модуля.
6. Props, state, context і правила хуків не додавати. Storybook і далі відсікає типовий glob.

## Що перевірено

### Express не пише JSX

Маршрути — це `app.get` / `app.post` і `express.Router` з колбеками, не теги ([routing](https://expressjs.com/en/guide/routing.html)). `app.render(view, locals, callback)` бере ім’я view рядком; рушій шаблонів читає файл і повертає HTML ([application](https://expressjs.com/en/5x/api/application/), [template engines](https://expressjs.com/en/advanced/developing-template-engines.html)). У цих сторінках немає JSX у вихідниках застосунку. `res.render` — теж рядок view, не тег.

Прогін поточної граматики `javascript` (нею keylang читає `.js`) на типовому `app.get` / `a < b && c > d` не дав жодного вузла `jsx_*`. Порівняння лишилось `binary_expression`. Тобто звичайний Express на `.js` чи `.ts` нових ребер від цієї ідеї не отримає. Окремо: та сама граматика `javascript` JSX уміє. Файл `page.js` із літеральним `<Cart />` розбирається як `jsx_self_closing_element` без помилки. Офіційні приклади Express такого тексту не містять; якщо хтось вставить тег у `.js`, ребро з’явиться навмисно.

### Nest — декоратори й інший `forwardRef`

Модуль, контролер і провайдер — класи з `@Module`, `@Controller`, `@Injectable`, `@Get` ([modules](https://docs.nestjs.com/modules), [controllers](https://docs.nestjs.com/controllers), [providers](https://docs.nestjs.com/providers)). Циклічну залежність знімає `forwardRef(() => Token)` з `@nestjs/common`: і в конструкторі через `@Inject(forwardRef(() => CommonService))`, і в модулі як `imports: [forwardRef(() => CatsModule)]` ([circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)). Сигнатура в репозиторії Nest: `export const forwardRef = (fn: () => any): ForwardReference => ({ forwardRef: fn })` ([forward-ref.util.ts](https://github.com/nestjs/nest/blob/master/packages/common/utils/forward-ref.util.ts)). Це не React-компонент: фабрика повертає клас модуля або токен, а не функцію рендера.

У React `forwardRef(render)` теж приймає функцію першим аргументом і теж імпортується як ім’я `forwardRef` ([react.dev/reference/react/forwardRef](https://react.dev/reference/react/forwardRef)). `memo(Component)` і `lazy(load)` — з того самого пакета `react` ([memo](https://react.dev/reference/react/memo), [lazy](https://react.dev/reference/react/lazy)). Спеціальний випадок «будь-який callee з таким текстом» перетворить Nest-фабрику на fn.

Ліниве завантаження Nest — це `LazyModuleLoader.load(() => LazyModule)`, не функція `lazy` ([lazy-loading modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules)). У публічному баррелі `@nestjs/common` (`packages/common/index.ts` реекспортує `./utils`, а `utils/index.ts` реекспортує лише `forward-ref.util` і `strip-proto-keys.util`) функції `memo` чи `lazy` немає. Повного обходу кожного файла `packages/common` не було.

GraphQL code first — декоратори `@ObjectType`, `@Resolver`, `@Query`, не JSX ([resolvers](https://docs.nestjs.com/graphql/resolvers), [interfaces](https://docs.nestjs.com/graphql/interfaces)). Мікросервіси — `NestFactory.createMicroservice` і `@MessagePattern` ([basics](https://docs.nestjs.com/microservices/basics)). На переглянутих сторінках мікросервісів JSX немає.

Прогін `extractTs` на зразку Nest (`.ts`): `@Controller`, `@Get`, `@Injectable`, `@Module` і обидва `forwardRef(...)` уже є звичайними `call` до цих імен. `@Inject(forwardRef(() => …))` потрапляє у виклики `constructor`. Окремого виду ребра для декоратора немає. `const Common = forwardRef(() => CommonModule)` сьогодні не є fn: у деклараціях лишається клас модуля, а `forwardRef` — виклик модуля. Саме цей `const` пропозиція 3 перейменувала б у fn, якби дивилась лише на текст callee.

### Дві граматики TypeScript

Щоб писати JSX, файл має зватися `.tsx`, і кутову type assertion у `.tsx` заборонено: лишається `as` ([handbook JSX](https://www.typescriptlang.org/docs/handbook/jsx.html)). У `.ts` обидві форми assertion законні, і з JSX дозволена лише `as` ([basic types](https://www.typescriptlang.org/docs/handbook/basic-types.html)). tree-sitter розвів це на дві граматики: TypeScript лишає `type_assertion` і викидає JSX, TSX — навпаки ([PR #68](https://github.com/tree-sitter/tree-sitter-typescript/pull/68)).

keylang обирає граматику за суфіксом (`src/extract/treesitter.ts`, `grammarFor`): `.tsx` → `tsx`; `.ts` / `.mts` / `.cts` → `typescript`; решта JS, включно з `.jsx`, → `javascript`. Граматика `javascript` теж містить `jsx_element` і `jsx_self_closing_element` ([tree-sitter-javascript grammar.js](https://github.com/tree-sitter/tree-sitter-javascript/blob/master/grammar.js)).

Прогін wasm, який вантажить цей репозиторій:

| Файл | Граматика | Що вийшло |
| --- | --- | --- |
| `.ts`: `const foo = <Foo>bar`, `const f = <T>(x: T) => x` | typescript | `type_assertion`, `type_arguments`. Жодного `jsx_*`. Файл complete. `f` — fn без викликів. |
| `.ts`: `return <Cart />` | typescript | Помилка розбору, файл opaque. Вузла JSX немає, ребра до `Cart` немає. |
| `.tsx`: `<Cart />`, `<Cart></Cart>`, `<Cart.Item />`, `<div><button /></div>` | tsx | `jsx_self_closing_element`, `jsx_element`, `jsx_opening_element`. Ім’я члена — `member_expression`. |
| `.tsx`: `a < b && c > d` | tsx | `binary_expression`, не JSX. |
| `.tsx`: `<Foo>bar` | tsx | `jsx_opening_element` і помилка, файл opaque. Так уже сьогодні, до будь-якої нової логіки. |
| `.tsx`: `const f = <T>(x: T) => x` | tsx | Ця збірка розібрала стрілку як `arrow_function` з `type_parameters`, без помилки. Компілятор TypeScript історично бачить тут JSX ([issue #15713](https://github.com/microsoft/TypeScript/issues/15713) і дублікати). Розходяться. Брама keylang — вузол tree-sitter, не думка `tsc`. |
| `.tsx`: `<>…</>` | tsx | `jsx_opening_element` без поля імені. `<React.Fragment />` — член, як `<Cart.Item />`. |
| `.tsx`: `<components[name] />` | tsx | Помилка розбору цілого файла, не акуратна дірка поруч із іншими фактами. |
| `.tsx`: `const Tag = components[name]; return <Tag />` і `function B({ Comp }) { return <Comp />; }` | tsx | Файл complete. Тег — звичайний identifier. |

Запит викликів сьогодні не бачить JSX. `CALLS_QUERY` у `src/extract/ts.ts` — лише `call_expression` і `new_expression`. Тому `<Cart />` зараз не дає виклику взагалі: у прогоні `Page` має порожній список calls.

`createElement(Cart)`, `jsx(Cart)`, `jsxs(Cart)` уже записують `passes` з аргументом 0 = `Cart` (`passesOf` у тому ж файлі: identifier або member в аргументі). Граф кладе `passes` у ін’єкцію хука, не в ребро `call` до аргумента (`src/graph.ts`, цикл по `c.passes`). Окремого ребра «сторінка рендерить Cart» немає ні для тега, ні для фабрики. Новий JSX-transform кличе `jsx` / `jsxs` з `react/jsx-runtime`, а не `React.createElement` ([новий JSX transform](https://react.dev/blog/2020/09/22/introducing-the-new-jsx-transform); режими `react-jsx` і `react-jsxdev` у [TypeScript 4.1](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html)). Велика літера тега — компонент (`createElement(MyComponent)`), мала — рядок (`createElement("div")`) ([createElement](https://react.dev/reference/react/createElement), той самий поділ у handbook JSX).

`const X = memo(...)` не стає fn: fn з `const` береться лише коли значення після `as` / `satisfies` — `arrow_function`, `function_expression` чи `class` (`visitDecl` у `src/extract/ts.ts`). Виклик `memo` лишається викликом модуля.

Анонімний `export default function () {}` tree-sitter кладе як `export_statement` → `function_expression` без імені, і екстрактор уже називає fn `default` (гілка `export default <expression>`). Те саме для анонімної стрілки й анонімного класу. Іменований `export default function main` лишається fn `main`; публічне ім’я експорту — `default`, `local` — `main`. Пункт 4 уже виконано. Повторна реалізація, яка перейменує ще й `main` на `default`, якраз змінить знімки Nest і Express.

Сегмент шляху проходить через `layerName` (`src/config.ts`): усе, що не літера, цифра, `_`, `$` чи `-`, стає `_`; якщо сегмент не починається з літери, `_` або `$`, спереду додається `_`. `placeFile` (`src/graph.ts`) санітизує кожен сегмент стема. Фактично `(shop)` → `_shop_`, не `_shop`; `[id]` → `_id_`, не `_id`; `[...slug]` → `____slug_`. Зіткнення: `(shop)`, `[shop]` і каталог, який уже зветься `_shop_`, дають один сегмент `_shop_`. `(id)` і `[id]` обидва `_id_`. Звичайні `src/cats/cats.controller.ts` дужок не мають; крапка в імені файла й далі стане `_` (`cats_controller`), і пропозиція про дужки цього не чіпає.

Storybook уже поза картою: `**/*.stories.*` і `**/stories/**` у `DEFAULT_EXCLUDE`, і `isExcluded` додає цей список до `exclude` з `keylang.json` завжди.

### `snapshotId` не хешує ребра

`buildSnapshot` (`src/snapshot.ts`) рахує `snapshotId` з схеми, `EXTRACTOR_VERSION` (зараз `m1.8`), версій пакетів граматик, конфіга, хешів файлів і входів резолвера. Списку ребер у хеші немає. Коментар поруч каже піднімати версію екстрактора, коли змінюються факти, які id покриває.

Наслідок: самі по собі нові JSX-ребра id не зрушать. Глобальний підйом `EXTRACTOR_VERSION` зрушить id у кожного репозиторію, включно з Nest без жодного `.tsx`, навіть якщо ребра ті самі. Поточною формулою не можна зрушити id лише там, де є `.tsx`.

### Монорепо

`apps/api` на `.ts` читається граматикою `typescript`. Успішне дерево не містить `jsx_*`, тож ребра й імена fn не змінюються, якщо спеціальні випадки не чіпають голі імена. `apps/web` і спільний `packages/ui` на `.tsx` — саме там мають з’явитися ребра `<Cart />`. Це навмисно. Файл Express, перейменований на `.tsx`, уже сьогодні стає opaque на `<Foo>value` (assertion більше не assertion). Порівняння `a < b` у `.tsx` лишаються порівняннями. Реальні теги в такому файлі після зміни дадуть ребра.

## Зіткнення

| Патерн | Де він є | Що зламається, якщо зробити наївно | Правило, яке це обходить |
| --- | --- | --- | --- |
| `<Foo>value`, `<T>(x: T) => x` | Будь-який `.ts`, зокрема Express і Nest | Якби JSX вгадували з тексту `<`, assertion стала б викликом, а файл міг би стати opaque | Ребро лише з вузла `jsx_element` / `jsx_self_closing_element` / `jsx_opening_element`. Граматика `typescript` їх не ставить. |
| `@Get()`, `@Controller()`, `@Injectable()`, `@Inject(forwardRef(() => …))` | Nest, файл `.ts` | Перепис усіх `call_expression` або «кожен `forwardRef` — обгортка компонента» змінить уже наявні ребра декораторів | Декоратор не чіпати. Нові факти додавати лише з JSX-вузлів. `forwardRef` у декораторі не є `const Ім’я = …`. |
| `forwardRef(() => CatsModule)` і `const X = forwardRef(() => Mod)` | `@nestjs/common`, не `react` | Пункт 3 за текстом імені зробить `X` fn і збере виклики з фабрики модуля. Офіційний виклик у `imports:` не `const`, але форма `const` — валідний TS і збігається з предикатом пропозиції | Обгортку розгортати лише коли callee резолвиться в `memo` / `forwardRef` / `lazy`, імпортовані з `react`. Імпорт з `@nestjs/common` лишається value. Голого тексту імені недостатньо. |
| `createElement(Cart)`, `jsx(Cart)`, `jsxs(Cart)` як звичайні функції | Будь-який `.ts`, якщо хтось так назвав хелпер | Окреме ребро до першого аргумента з’явиться там, де JSX немає. Сьогодні є лише `passes` для хука | Фабрику зводити до виклику компонента лише для прив’язки з `react` або `react/jsx-runtime` (і `jsxDEV` з dev-рантайму). Або не синтезувати це ребро в граматиці `typescript` взагалі. |
| `<div>`, `<button>`, `<>` | `.tsx` / `.jsx` | Мала літера теж вузол JSX. Ребро до fn `div`, якби така була, суперечить React: мала літера — рядок | Немає імені (фрагмент) — немає ребра. Identifier з малої літери — intrinsic, не виклик, навіть якщо fn з таким ім’ям існує. Велика літера або member (`Cart.Item`, `motion.div`) — виклик, коли ціль fn або class. |
| `<React.Fragment />` | `.tsx` | Це member, як `Cart.Item`. Пропозиція каже, що фрагмент — не ребро; порожнє `<>` вже без імені | Порожній тег відсікається відсутністю імені. `Fragment` / `React.Fragment` окремо не відсікати за текстом: інакше зникне користувацький компонент `Fragment`. Це розходження з формулою «фрагменти не ребра», якщо хтось пише довге ім’я. |
| `<components[name] />` | `.tsx` | Не дірка покриття, а помилка дерева: файл opaque, і сусідні факти зникають уже зараз | Не обіцяти «як computed call» для цього написання. Дірка, яка реально парситься, — `<Tag />`, де `Tag` — параметр або локальне значення (`bound`), той самий шлях, що й виклик параметра. |
| JSX у `.map(() => <Cart />)` | `.tsx` | Якщо забути `closure`, static підтвердить рендер, якого колбек може не виконати | Той самий `insideClosure`, що вже стоїть на вкладеній функції. Нових правил flow не треба. |
| `export default function main` | Nest, Express, будь-який `.ts` | Перейменування fn на `default` змінить id. Анонімна форма вже `default` | Пункт 4 не реалізовувати вдруге. Не чіпати ім’я декларації, коли воно є. |
| `(shop)`, `[id]`, `[...slug]` | Каталоги Next, не типовий Nest | Інше кодування змінить id модуля. Сьогодні `(shop)` і `[shop]` уже один сегмент `_shop_` | Міняти кодування лише для сегмента, який не є валідним ID, і лише дужки. Шляхи без дужок, зокрема `cats.controller.ts`, не перейменовувати. Ребро layout→page з диска не додавати. |
| Підйом `EXTRACTOR_VERSION` | Усі репозиторії | `snapshotId` зрушить у Nest без `.tsx`, хоч ребра ті самі. Без підйому id не зрушить і в `.tsx`, бо ребра в хеш не входять | Для незмінного id бекенду не змінювати схему, версію екстрактора й пакети граматик. Щоб id `.tsx` усе ж зрушив, формула id має залежати від фактів (або від мітки, яка не змінюється, коли факти ті самі). Зараз так не є. |

## Що має бути правдою в реалізації

Щоб знімок Express/Nest на `.ts` не змінилось — жодних нових ребер, жодних перейменованих fn, той самий `snapshotId`, коли серед індексованих файлів немає `.tsx` / `.jsx` і жоден `.js` не містить тега:

- Нове ребро `call` додається тільки з вузла, який граматика вже назвала JSX. Успішне дерево `.ts` / `.mts` / `.cts` таких вузлів не містить, тому факти цих файлів стоять на місці. Помилковий `<Cart />` у `.ts` і далі робить файл opaque, як зараз, і не стає ребром.
- `CALLS_QUERY` і розбір декораторів не переписуються. `@Get()` лишається викликом `Get`.
- `memo` / `forwardRef` / `lazy` розгортаються в fn лише за резолвом імпорту з `react`, і лише для `const`. Виклик `forwardRef` з `@nestjs/common` лишається value, включно з `const X = forwardRef(() => Mod)`.
- `createElement` / `jsx` / `jsxs` дають ребро до компонента лише для прив’язки з `react` чи `react/jsx-runtime`, не для будь-якої функції з таким ім’ям у `.ts`.
- Імена fn не змінюються: анонімний default уже `default`, іменований default лишається своїм ім’ям.
- `layerName` для сегментів без дужок не змінюється.
- `EXTRACTOR_VERSION`, `SNAPSHOT_SCHEMA` і версії wasm не змінюються, якщо потрібен той самий `snapshotId`. Інакше id зрушить навіть при тотожних ребрах. Це обмеження поточної формули, не наслідок JSX.

Граматика мови, правила залежностей і вид ребра `call` при цьому не змінюються. Файл `.tsx` у `packages/ui` отримує ребра. Це очікувано.

## Що потрібно, щоб підтримати TSX

Окремої мови й окремого wasm не треба. `.tsx` уже входить у мову `typescript` (`src/languages.ts`, розширення поруч із `.ts`). `grammarFor` віддає для нього граматику `tsx`, і цей wasm є в `GRAMMARS` (`src/extract/grammars.ts`), тож його копіює `prepack`. Імпорт `./x.tsx` і `./x.jsx` резолвер уже вміє. `extractTs` на цій граматиці вже бачить функції, класи й імпорти. `<Cart />` не видно лише тому, що `CALLS_QUERY` питає `call_expression` і `new_expression`.

Підтримка TSX — це добрати тег до тих самих фактів. Кроки, без яких ребро або не з’явиться, або впаде аналіз `.ts`:

1. Окремий запит JSX, не рядок у `CALLS_QUERY`. Запит із вузлом `jsx_self_closing_element` компілюється на граматиках `tsx` і `javascript` цього чекауту (`@vscode/tree-sitter-wasm`, `web-tree-sitter`) і падає на граматиці `typescript` з `Bad node name 'jsx_self_closing_element'`. `query()` у `src/extract/treesitter.ts` компілює запит при першому файлі цієї граматики. Спільний запит на всі три граматики зупинить `check` на першому `.ts` Nest або Express, ще до будь-якого ребра. Запит JSX збирати лише для `tsx` і `javascript`. Для `typescript` його не створювати.

2. Ім’я тега зводити тим самим резолвом, що й callee виклику (`calleeFact` / `bindingOf`), а не окремим обходом. На граматиці `tsx` цього wasm форма така:
   - `<Cart />` — `jsx_self_closing_element`, ім’я `identifier`.
   - `<Cart></Cart>` — `jsx_opening_element` з тим самим ім’ям. Закриваючий тег другим ребром не стає.
   - `<Cart.Item />` — ім’я `member_expression`, як `Cart.Item()`.
   - `<Cart<Props> a={1} />` — те саме ім’я `Cart`, плюс дочірній `type_arguments`. Аргументи типу до callee не входять.
   - `<>…</>` — `jsx_opening_element` без імені. Ребра немає.
   - `<div />` — identifier з малої літери. Ребра немає, навіть якщо fn `div` існує.
   - `<svg:path />` — `jsx_namespace_name`. Це не member і не компонент; ребра немає.
   - `<Comp />`, де `Comp` — параметр, парситься. Ціль не вгадувати: той самий `bound`, що й виклик параметра, тобто дірка, не `ok`.
   - `<components[name] />` на цій граматиці — `ERROR` на все `return`, файл стає opaque вже сьогодні. Окремої дірки «computed tag» для цього написання немає. Не обіцяти її в першій версії.
   - Вираз у дужках атрибута, `{format(x)}`, уже є `call_expression`. Його підхоплює чинний запит викликів. Окремо збирати треба лише тег.
   - `<Route component={Cart} />` лишає `Cart` читанням значення, не викликом. У першу версію це не входить.

3. Виклик вішати на ту функцію, у чиєму тілі стоїть тег, з тим самим `insideClosure`, що вже стоїть на вкладеній стрілці. `<Cart />` всередині `items.map(() => …)` — виклик у замиканні. Тег на верхньому рівні модуля — виклик модуля, як інший модульний виклик.

4. Обгортки й фабрики — за імпортом, не за текстом, як у таблиці зіткнень. `const Cart = memo(() => …)` стає fn лише коли `memo` імпортовано з `react`. `forwardRef` з `@nestjs/common` лишається value. `createElement` / `jsx` / `jsxs` / `jsxDEV` дають ребро на компонент лише з `react` або `react/jsx-runtime`. Інакше `.ts` отримає нові fn там, де JSX немає.

5. Поріг «мала літера — intrinsic» брати з першого символу identifier, не з таблиці HTML. `<motion.div />` — member, не intrinsic. `<my-button />` на цій граматиці — звичайний `identifier` з текстом `my-button`, файл без помилки. Перша літера мала, тож це intrinsic, як `<div />`, і ребра немає. Окремого випадку для дефіса не треба.

Чого не міняти, щоб з’явився TSX:

- `keylang.json` не отримує мови `tsx`. Достатньо вже наявного `typescript`.
- `tsconfig` `jsx` (`react`, `react-jsx`) екстрактор не читає. Рішення приймає вузол граматики `tsx`, не режим компілятора.
- Граматику keylang, коди діагностик, вид ребра й `SNAPSHOT_SCHEMA` не розширювати.
- `EXTRACTOR_VERSION` не піднімати, якщо id Nest без `.tsx` має лишитись. Самі ребра в `snapshotId` не входять (`src/snapshot.ts`). Наслідок: trace файлів `.tsx` теж не протухне від нових ребер, доки формула id не почне залежати від фактів.

Перевірка, без якої зміну не вважати готовою:

- Запит JSX не компілюється на граматиці `typescript` і компілюється на `tsx` та `javascript`. Падіння запиту на `.ts` — регресія бекенду, не дірка покриття.
- Фікстура Nest/Express на `.ts` (`@Get`, `@Injectable`, `<Foo>value`, `forwardRef(() => Token)` з `@nestjs/common`) дає той самий список декларацій і викликів, що й до зміни.
- Фікстура `.tsx`: `Page` викликає `Cart` і `Cart.Item`, не викликає `div` і фрагмент, `<Cart<Props> />` цілить у `Cart`, тег у колбеку `.map` має `closure`.
- `const Cart = memo(() => …)` з імпорту `react` є fn; `const X = forwardRef(() => Mod)` з `@nestjs/common` — ні.
- Файл `.jsx` іде тією самою гілкою, що й `.tsx`: його граматика — `javascript`, і вона JSX-вузли вже має. Окремої граматики `jsx` не додавати.

## Не перевірено

- Повний перелік експортів `@nestjs/common` поза баррелем і `utils/index.ts`. У прочитаних файлах `memo` і `lazy` немає; що їх немає в жодному внутрішньому модулі, не встановлено.
- Чи колись офіційна документація Nest показує `const X = forwardRef(...)`. Показані форми — аргумент `@Inject` / `@Dependencies` і елемент `imports`.
- `jsxDEV` як третя фабрика dev-рантайму. TypeScript 4.1 її називає окремим режимом `react-jsxdev`. Пропозиція згадує лише `jsx` і `jsxs`. Без `jsxDEV` dev-збірка не збігатиметься з prod за текстом callee, хоч обидві — той самий тег.
- Поточна поведінка саме `tsc` 5.9 на `const f = <T>(x: T) => x` у `.tsx`. tree-sitter у цій збірці приймає це як стрілку; старі issues компілятора кажуть протилежне. Для брами keylang це не блокує: рішення приймає вузол граматики, якою парсить екстрактор.
- Директиви `"use client"` / `"use server"` як факт модуля. Навмисно відкладено.
- Чи є в Express десь JSX у неофіційних прикладах поза guide і API reference. У процитованих офіційних сторінках його немає.
