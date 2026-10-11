# 3. Мова

[Курс](README.md) · [English](../03-the-language.md) · **Українською**

Файл keylang — це звичайний Markdown із невеликою граматикою зверху. GitHub показує в ньому заголовки, списки й абзаци, а парсер читає ті самі байти за суворішими правилами. Після `fmt` те, що ви бачите на GitHub, і те, що з файла розуміє `check`, збігаються.

Після цього уроку ви зможете написати карту, файл правил і потік. Разом вони становлять специфікацію, тобто ту частину, яку пишете ви. Функції пише агент. Повна таблиця ключових слів — у [`docs/grammar.md`](../../grammar.md), §5.

## Рядки

Для кожного рядка парсер перебирає ці випадки по черзі й бере перший, що підходить:

| Якщо рядок… | Він стає |
|---|---|
| Усередині огорожі коду | Блоком коду, як написано |
| Порожній | Кінцем абзацу, але не списку |
| Перший непорожній, HTML-коментар із `keylang:generated` | Позначкою «не редагувати» |
| Колонка 0, `#`, далі пробіл або кінець | Заголовком секції |
| Огорожа (` ``` ` або `~~~`) з відступом до 3, або з будь-яким відступом під відкритим списком | Блоком коду, і закриває список |
| `-`, `*` або `+` після відступу | Вузлом |
| Відступ щонайменше два пробіли під відкритим вузлом | Описом цього вузла |
| Усе інше | Прозою, і закриває список |

Заголовки `##`, таблиці, цитати й нумеровані списки вважаються прозою. `fmt` залишає їх на місці, але нічого вони не оголошують, тож пояснюйте ними що завгодно для читача.

Заголовок складається з `#`, пробілу й виду. Для потоку й таблиці міграції після виду йде ще ім'я:

```markdown
# map
# rules
# flow checkout
# wiring
# migration shop-v2
```

Невідомий заголовок на кшталт `# Shop` дає попередження K006, а секцію під ним парсер читає як карту. Зайві слова після `# rules`, `# map` чи `# wiring` — це K005, як і `# flow` чи `# migration` без імені. Два потоки з однаковим ім'ям — K002.

## Відступ і id

Глибина вкладення дорівнює відступу, поділеному на 2, а відступ складається лише з пробілів. Дочірній вузол стоїть рівно на один рівень глибше за батьківський. Непарний відступ, стрибок більше ніж на рівень, табуляція чи порожній пункт дають K003, і такий файл `fmt` форматувати не стане.

Id — це послідовність сегментів, з'єднаних `.`. Сегмент починається з літери, `_` або `$`, а далі можуть іти літери, діакритичні знаки, цифри, `_`, `$` або `-`. Тож `http-retry` і `$save` — обидва допустимі й різні id. У специфікаціях id завжди абсолютні, як-от `application.purchase.buy`. Виняток один — список `exports`: у ньому стоять публічні імена експорту модуля, а не id карти.

Ця карта оголошує `domain.orderAggregate`, `domain.orderAggregate.create` і псевдонім `application.purchase.order`:

```markdown
# map

- domain
  - module [orderAggregate](src/domain/order.ts#L1)
    - fn [create](src/domain/order.ts#L8) (items: Item[]) → Order
- application
  - module [purchase](src/app/purchase.ts#L1)
    - order domain.orderAggregate
```

Кожне посилання вказує на рядок вихідного коду. Ці посилання за вас пише `keylang map`, тож вручну їх набирати майже не доводиться. У потоці посилання теж можна записати, наприклад `step [buy](../map/application.md#application.purchase.buy)`. Перевірка враховує лише id у квадратних дужках.

Імена розв'язуються по всіх перевірених файлах `*.md`, крім прихованих тек, `node_modules` і `target`. Якщо id збігається точно, береться він, інакше — найдовший оголошений префікс. Далі все залежить від модуля, який цей префікс називає. Якщо членів модуля прочитано повністю, невідомий член дає K001. Якщо ж модуль непрозорий, тобто його вміст невідомий, член отримує `unverified`. Шар непрозорим не буває ніколи, тому `domain.aggregate` у крамниці дає K001, а не «можливо, десь усередині невідомого модуля».

## Слово залежить від батька

Перше слово рядка стає ключовим лише там, де позиція дозволяє саме це ключове слово. Деінде воно звичайне ім'я, а якщо ключове слово там обов'язкове, то K004.

| Де | Можна написати | Без ключового слова |
|---|---|---|
| Верх карти | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | Голе ім'я — шар, тому слайди теж розбираються |
| Верх правил | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004, бо правила шарів не оголошують |
| Верх потоку | `kind`, `trigger`, `continues`, `step`, `parallel`, `reads`, `emits`, `calls`, `invariant`, `when`, `after`, `every`, `test`, `planned`, `?` | K004 |
| Верх wiring | `wire` | K004 |
| Верх migration | `map`, `dropped` | K004 |
| Під шаром | `module` | Голе ім'я — модуль |
| Під модулем карти | `module`, `fn`, `type`, `event` | `<псевдонім> <id>`, залежність |
| Під функцією | `calls` | K004 |
| Під кроком або тригером | `step`, `parallel`, `reads`, `emits`, `calls`, `when`, `after`, `every`, `test`, `invariant`, `?` | K004 |
| Під `when` у потоці | `then`, `step`, `parallel`, `test`, `?` | K004 |
| Під `parallel` | `step` | K004 |
| Під `module <id>` у правилах | `exports`, `no-cycles` | K004 |

Отже, `test` під модулем — просто прізвисько залежності, бо `test` зарезервоване лише в потоках. А `fn`, `type`, `event` і `module` під модулем є ключовими словами, тож так залежність не назвеш.

Пробіли навколо ком значення не мають: `a,b` і `a , b` означають те саме, що `a, b`. HTML-коментар у кінці рядка зберігається, але ігнорується. Незакрита лапка — K005.

## Крамниця, записана цілком

Нижче скорочена версія `examples/shop-fixed`. Справжні файли містять ще й прозу зі слайдів.

```markdown
# map

- domain
  - module orderAggregate
    - fn create (items: Item[]) → Order
    - fn total (order: Order) → Money
- infrastructure
  - module products
    - fn find (id: ProductId) → Promise<Product>
  - module orderStore
    - fn save (order: Order) → Promise<void>
- application
  - module purchase
    - order domain.orderAggregate
    - catalog infrastructure.products
    - orders infrastructure.orderStore
    - fn buy (cart: Cart) → Promise<Order>
      - calls infrastructure.products.find, domain.orderAggregate.create, infrastructure.orderStore.save
    - type OutOfStock extends Error
- presentation
  - module terminal
    - checkout application.purchase
```

Правила — окреме твердження про той самий код, тому модулів удруге не оголошують:

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- allow infrastructure presentation
  The server is handed presentation.api, so infrastructure may see presentation.
- deny domain infrastructure
  The domain stays free of I/O. This line does not, by itself, prove that no I/O exists.
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

Рядок `layers domain < application < presentation` читається так: «domain нижче за application, а той нижче за presentation». Залежність може вказувати лише вниз: `application` може користуватися `domain`, а `domain` користуватися `application` не може (це K101). `infrastructure` вкладено під рядок `layers`, тобто він стоїть поза порядком. Залежати від нього можна, доки якийсь `deny` не заборонить, а от для залежності з нього в упорядкований шар потрібен `allow`. Рядок `allow` вище і дає такий дозвіл.

Опис — це текст із відступом під вузлом, без маркера списку. `fmt` вирівнює його безпосередньо під своїм вузлом, а `check` його ніяк не тлумачить: опис написано для людей.

Потік називає сценарій і розписує його кроки. Крок, вкладений під інший, — це виклик усередині батьківського, а сусідні кроки читаються як «спочатку це, потім те»:

```markdown
# flow checkout

Purchase from the terminal, through to a stored order.

- kind business
- trigger presentation.terminal.checkout
- step application.purchase.buy
  - reads infrastructure.products.find
  - step domain.orderAggregate.create
  - step infrastructure.orderStore.save
  - emits event order.created
- invariant total equals the sum of price times quantity
  - test tests/purchase.test.ts "computes total"
- when the item is out of stock
  - then application.purchase.OutOfStock
  - test tests/purchase.test.ts "rejects out of stock"
```

`kind` буває `business` або `technical`. `trigger` і `step` приймають рівно один id, а `reads` і `calls` — один або кілька; перед id тригера можна назвати вид точки входу (`route`, `cron`, `consumer`, `webhook`, `event`), як показує [урок 6](06-flows.md). `emits` приймає ім'я події. Необов'язкове слово `event` перед ним із картою не звіряється, а звичайне ім'я на кшталт `order.created` вважається прозою. Перевіряється лише ім'я з групи `events` карти (`events.order_placed`). `? <текст>` — відкрите питання, а не твердження: `check` його не оцінює, але фіча з відкритим питанням не готова. `invariant` і `when` приймають довільний текст. `then` є посиланням, коли його єдиний токен — id із крапкою, інакше це просто текст. `test` приймає шлях і, якщо треба, назву тесту в лапках.

`planned` оголошує намір, а не факт зі знімка:

```markdown
- planned fn application.purchase.refund (id: OrderId) → Promise<void>
```

Таке оголошення може стояти на верхньому рівні потоку або в `keylang/features/<slug>.md`. Посилання на запланований id не дає K001, але й ребра до графа таке оголошення не додає. Пакет, якого код поки не імпортує, записують як `planned module external.<pkg>`. Щойно власний модуль батьківського кроку імпортує цей пакет, оголошення дає K202 (його можна прибрати), а крок отримує static `ok`. Якщо пакет імпортує інший модуль, крок `ok` не стає.

## Коди, на які натрапите під час письма

| Код | Рівень | Ви написали |
|---|---|---|
| K001 | error | id, якого не оголошено |
| K002 | error | Той самий id двічі або те саме ім'я потоку двічі |
| K003 | error | Неправильний відступ, табуляцію або порожній пункт. `fmt` зупиняється |
| K004 | error | Ключове слово, якого ця позиція не дозволяє |
| K005 | error | Відоме ключове слово з хибними аргументами |
| K006 | warning | Заголовок, який не `map`, `rules`, `flow`, `wiring` і не `migration` |
| K009 | error | `parallel` без жодного `step` під ним (дає `check`, не `parse`) |

Коли серед оголошених є id, схожий на написаний, K001 додає `did you mean …`, а коли id схожий на намір, згадує `planned`. Попередження не валять `check`.

`keylang fmt --check` перевіряє в CI, що специфікація в канонічному вигляді, і нічого не записує. Хибний id форматуванню не заважає, а неправильний відступ заважає.

Далі: [карта](04-map.md).
