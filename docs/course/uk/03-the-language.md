# 3. Мова

[Курс](README.md) · [English](../03-the-language.md) · **Українською**

Файл keylang — це Markdown із невеликою додатковою граматикою. GitHub показує його як заголовки, списки й абзаци. Парсер читає ті самі байти суворіше, тож після `fmt` те, що показує GitHub, і те, у що вірить `check`, збігаються.

Цього уроку досить, щоб написати карту, файл правил і потік. Це специфікація. Функції пише агент. Ви — ні. Повна таблиця слів — у [`docs/format.md`](../../format.md).

## Рядки

Парсер дивиться на кожен рядок у такому порядку:

| Якщо рядок… | Він стає |
|---|---|
| Усередині огорожі коду | Блоком коду, як написано |
| Порожній | Закриває абзац. Список не закриває |
| Перший непорожній, HTML-коментар із `keylang:generated` | Позначкою «не редагувати» |
| Колонка 0, `#`, далі пробіл або кінець | Заголовком секції |
| Огорожа (` ``` ` або `~~~`) з відступом до 3, або з будь-яким відступом під відкритим списком | Блоком коду, і закриває список |
| `-`, `*` або `+` після відступу | Вузлом |
| Відступ щонайменше два пробіли під відкритим вузлом | Описом цього вузла |
| Усе інше | Прозою, і закриває список |

Заголовки `##`, таблиці, цитати і нумеровані списки — проза. `fmt` їх зберігає. Вони нічого не оголошують.

Заголовок — це `#`, пробіл, вид, а для потоку ще ім'я:

```markdown
# map
# rules
# flow checkout
# wiring
```

Невідомий заголовок (`# Shop`) — попередження K006, і секцію читають як карту. Зайві слова на `# rules` або `# map` — K005. `# flow` без імені — K005. Два потоки з тим самим ім'ям — K002.

## Відступ і id

Глибина — відступ, поділений на 2. Пробіли. Дитина рівно на один рівень глибша за батька. Непарний відступ, стрибок більше ніж на рівень, таб або порожній пункт — K003. `fmt` відмовляє файлу.

Id — сегменти через `.`. Сегмент починається з літери, `_` або `$`, далі літери, знаки, цифри, `_`, `$` або `-`. `http-retry` і `$save` законні й різні. Id у специфікаціях абсолютні (`application.purchase.buy`). Імена в списку `exports` — публічні імена експорту модуля, не id карти.

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

Лінк вказує на рядок джерела. Їх пише `keylang map`. Руками їх пишуть рідко. У потоці можна написати `step [buy](../map/application.md#application.purchase.buy)`. Перевірка бере id у дужках.

Імена розв'язуються по всіх `*.md`, які ви перевірили (приховані теки, `node_modules` і `target` пропускаються). Точний id перемагає. Інакше береться найдовший оголошений префікс. Якщо членів модуля прочитано повністю, невідомий член — K001. Якщо модуль непрозорий, член — `unverified`. Шар ніколи не непрозорий, тож `domain.aggregate` у крамниці — K001, а не «може, всередині невідомого модуля».

## Слово залежить від батька

Перше слово — ключове лише там, де позиція його дозволяє. Інакше це звичайне ім'я, або K004, якщо ключове слово було обов'язкове.

| Де | Можна написати | Без ключового слова |
|---|---|---|
| Верх карти | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | Голе ім'я — шар, тому слайди розбираються |
| Верх правил | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004. Правила шарів не оголошують |
| Верх потоку | `kind`, `trigger`, `step`, `reads`, `emits`, `calls`, `invariant`, `when`, `test`, `planned` | K004 |
| Верх wiring | `wire` | K004 |
| Під шаром | `module` | Голе ім'я — модуль |
| Під модулем карти | `module`, `fn`, `type`, `event` | `<псевдонім> <id>`, залежність |
| Під функцією | `calls` | K004 |
| Під кроком або тригером | `step`, `reads`, `emits`, `calls`, `when`, `test`, `invariant` | K004 |
| Під `module <id>` у правилах | `exports`, `no-cycles` | K004 |

`test` під модулем — прізвисько залежності, бо `test` зарезервовано лише в потоках. Залежність не можна назвати `fn`, `type`, `event` або `module`.

`a,b` і `a , b` обидва означають `a, b`. Хвостовий HTML-коментар зберігається і ігнорується. Незакрита лапка — K005.

## Крамниця, записана цілком

Це скорочений `examples/shop-fixed`. Справжні файли зберігають прозу слайдів.

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

Правила — окреме твердження. Модулі вони не оголошують знову:

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

Читайте `layers domain < application < presentation` як «domain нижче за application, той нижче за presentation». Потреба може вказувати вниз. `application` може користуватись `domain`. `domain` не може користуватись `application` (K101). `infrastructure` сидить під рядком `layers`, поза порядком. Потреби в нього вільні, доки `deny` не скаже інакше. Потреби з нього в упорядкований шар потребують `allow`. `allow` вище — той дозвіл.

Опис — текст з відступом під вузлом, без кулі. `fmt` ставить його безпосередньо під вузол. `check` його не тлумачить.

Потік називає сценарій. Крок під кроком — виклик усередині батька. Сусідні кроки — «спочатку це, потім те»:

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

`kind` — `business` або `technical`. `trigger` і `step` беруть один id. `reads` і `calls` — один або кілька. `emits` бере ім'я події. Необов'язкове слово `event` з картою не звіряється. `invariant` і `when` — вільний текст. `then` — посилання, коли єдиний токен — id з крапкою, інакше текст. `test` бере шлях і необов'язкове ім'я в лапках.

`planned` — намір, не факт знімка:

```markdown
- planned fn application.purchase.refund (id: OrderId) → Promise<void>
```

Він живе на верху потоку або в `keylang/features/<slug>.md`. Посилання на нього — не K001. Ребра не додає. Пакет, якого код ще не імпортує, — `planned module external.<pkg>`. Коли власний модуль батьківського кроку імпортує цей пакет, оголошення — K202, а крок — static `ok`. Імпорт з іншого модуля цей крок `ok` не робить.

## Коди, на які натрапите під час письма

| Код | Рівень | Ви написали |
|---|---|---|
| K001 | error | id, якого не оголошено |
| K002 | error | Той самий id двічі або те саме ім'я потоку двічі |
| K003 | error | Відступ, таб або порожній пункт. `fmt` зупиняється |
| K004 | error | Ключове слово, якого ця позиція не дозволяє |
| K005 | error | Слово відоме, а аргументи хибні |
| K006 | warning | Заголовок, який не `map`, `rules`, `flow` і не `wiring` |

K001 додає `did you mean …`, коли сусід близько, і згадує `planned`, коли id може бути наміром. Попередження `check` не валять.

`keylang fmt --check` тримає специфікацію канонічною в CI, нічого не записуючи. Хибний id форматування не блокує. Поганий відступ блокує.

Далі: [карта](04-map.md).
