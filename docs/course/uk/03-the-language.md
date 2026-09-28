# 3. Мова

[Курс](README.md) · [English](../03-the-language.md) · **Українською**

Файл keylang — це файл Markdown із невеликою додатковою граматикою. GitHub показує його як заголовки, списки й абзаци. Парсер читає ті самі байти суворішими правилами, тож після `fmt` те, що показує GitHub, і те, у що вірить `check`, збігаються.

Цього уроку досить, щоб написати три види файлів. Повна таблиця ключових слів, правила відновлення і схема знімка — у [`docs/format.md`](../../format.md), §§1–8 і §11.

## Рядки

Парсер класифікує кожен рядок по черзі:

| Якщо рядок… | Він стає |
|---|---|
| Усередині code fence | Блоком коду, дослівно |
| Порожній | Закриває абзац прози. Список не закриває |
| Перший непорожній, HTML-коментар із `keylang:generated` | Маркером згенерованого файла |
| Колонка 0, `#`, далі пробіл або кінець | Заголовком секції |
| Огорожа (` ``` ` або `~~~`) з будь-яким відступом | Блоком коду і закриває відкритий список |
| `-`, `*` або `+` після відступу | Вузлом |
| Відступ щонайменше два пробіли під відкритим вузлом | Описом цього вузла |
| Усе інше | Прозою і закриває список |

Заголовки `##`, таблиці, цитати й нумеровані списки — проза. Вони проходять через `fmt`. Вони нічого не оголошують.

Заголовок — це `#`, пробіл, вид і для потоку ім'я:

```markdown
# map
# rules
# flow checkout
# wiring
```

Невідомий заголовок першого рівня (`# Shop`) — попередження K006, і секція вважається картою. Зайві слова в `# rules` чи `# map` — K005. `# flow` без імені — K005. Два потоки з одним ім'ям — K002. Ім'я потоку не конфліктує з ID карти.

## Відступ і ID

Глибина — відступ, поділений на 2. Відступ — пробіли. Дитина рівно на один рівень глибша за батька. Непарний відступ, стрибок більш ніж на рівень, таб у цьому відступі або порожній елемент — K003. `fmt` відмовляє файл.

ID — сегменти через `.`:

```text
segment := (літера | "_" | "$") (літера | знак | цифра | "_" | "$" | "-")*
```

Літери — Unicode. `http-retry` і `$save` законні й різні. ID у специфікаціях абсолютні від кореня (`application.purchase.buy`), крім імен у списку `exports`: це публічні імена експорту того модуля.

ID оголошення — шлях предків: шар, модуль, далі `fn`, `type`, `event` або аліас залежності. Тож ця карта оголошує `domain.orderAggregate`, `domain.orderAggregate.create` і аліас `application.purchase.order`:

```markdown
# map

- domain
  - module [orderAggregate](src/domain/order.ts#L1)
    - fn [create](src/domain/order.ts#L8) (items: Item[]) → Order
- application
  - module [purchase](src/app/purchase.ts#L1)
    - order domain.orderAggregate
```

Посилання — прив'язка до рядка джерела. Згенеровані карти рахують його від файла карти і кодують символи, які зламали б Markdown-посилання, зокрема дужки групи маршрутів Next.js. Руками такі посилання пишуть рідко: це робить `keylang map`.

Резолвінг глобальний для кожного `*.md` під перевіреною директорією (приховані директорії, `node_modules` і `target` пропущені). Точний оголошений ID перемагає. Інакше береться найдовший оголошений префікс. Зі знімком модуль із членами `complete` дає K001 на невідомого члена, а модуль із членами `opaque` — `unverified`. Без знімка модуль, який не перелічує членів, непрозорий: тому слайдова форма `infrastructure.config.log` може бути законною ціллю аліаса. Шар непрозорим не буває, тож `domain.aggregate` у прикладі shop — це K001, а не невідомий член непрозорого модуля.

## Ключові слова залежать від батька

Перше слово — ключове, лише коли позиція його дозволяє. Всюди інде це звичайне ім'я або K004, якщо позиція вимагає ключового слова.

Позиції, які пишуть постійно:

| Де | Можна писати | Без ключового слова |
|---|---|---|
| Верх карти | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | Голе ім'я — шар, тож слайди розбираються |
| Верх правил | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004. Правила шарів не оголошують |
| Верх потоку | `kind`, `trigger`, `step`, `reads`, `emits`, `calls`, `invariant`, `when`, `test`, `planned` | K004 |
| Верх wiring | `wire` | K004 |
| Під шаром | `module` | Голе ім'я — модуль |
| Під модулем карти | `module`, `fn`, `type`, `event` | `<аліас> <id>` — залежність |
| Під функцією | `calls` | K004 |
| Під кроком або тригером потоку | `step`, `reads`, `emits`, `calls`, `when`, `test`, `invariant` | K004 |
| Під `module <id>` у правилах | `exports`, `no-cycles` | K004 |

`test` під модулем — аліас залежності, бо `test` зарезервовано лише в потоках. Залежність не можна назвати `fn`, `type`, `event` чи `module`. Генератор додає суфікс до аліаса, що збігся (`type` стає `type2`).

Кома — окремий токен. `a,b` і `a , b` означають `a, b`. Кінцевий HTML-коментар рядка зберігається і в семантиці не бере участі. Незакриті лапки — K005.

## Крамниця цілком

Це форма `examples/shop-fixed`, стиснута. Справжні файли тримають прозу слайдів.

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

Правила — окреме твердження. Модулів вони не оголошують знову:

```markdown
# rules

- layers domain < application < presentation
  - infrastructure
- allow infrastructure presentation
  Сервер отримує presentation.api, тож infrastructure може бачити presentation.
- deny domain infrastructure
  Домен без I/O. Цей рядок сам по собі не доводить, що жодного I/O немає.
- entry
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
```

`layers domain < application < presentation` читається як «domain нижче за application, той нижче за presentation». Залежність може йти вниз. `application` може користуватися `domain`. `domain` не може користуватися `application` (K101). `infrastructure` вкладений під рядок `layers`, тож він поза порядком: ребра в нього вільні, доки `deny` не заборонить, а ребра з нього в упорядкований шар потребують `allow`. `allow` вище — цей дозвіл для `infrastructure` → `presentation`.

Опис — текст із відступом під вузлом, без маркера. `fmt` переносить його одразу під вузол. `check` його не тлумачить.

Потік називає сценарій. Кроки під кроком — вкладені виклики. Сусідні кроки — послідовність:

```markdown
# flow checkout

Покупка з термінала аж до збереженого замовлення.

- kind business
- trigger presentation.terminal.checkout
- step application.purchase.buy
  - reads infrastructure.products.find
  - step domain.orderAggregate.create
  - step infrastructure.orderStore.save
  - emits event order.created
- invariant total дорівнює сумі price на quantity
  - test tests/purchase.test.ts "computes total"
- when товару немає на складі
  - then application.purchase.OutOfStock
  - test tests/purchase.test.ts "rejects out of stock"
```

`kind` — `business` або `technical`. `trigger` і `step` беруть один ID. `reads` і `calls` — один або більше ID. `emits` бере ім'я події; необов'язкове слово `event` з картою не звіряється. `invariant` і `when` — вільний текст. `then` — посилання, коли його єдиний токен є ID з крапкою, інакше вільний текст. `test` бере шлях і необов'язкову назву в лапках.

`planned` — намір, не факт знімка:

```markdown
- planned fn application.purchase.refund (id: OrderId) → Promise<void>
```

Він стоїть на верху потоку. Посилання на нього не є K001. Ребер він не додає.

## Діагностики під час написання

| Код | Рівень | Ви написали |
|---|---|---|
| K001 | error | ID, якого ніде не оголошено |
| K002 | error | Той самий ID двічі або те саме ім'я потоку двічі. Шар можна продовжувати в кількох файлах; майже все інше — ні |
| K003 | error | Відступ, таб або порожній елемент. `fmt` зупиняється |
| K004 | error | Ключове слово, якого ця позиція не дозволяє |
| K005 | error | Ключове слово відоме, а аргументи хибні, включно з поганим ID, посиланням чи лапками |
| K006 | warning | Заголовок, який не є `map`, `rules`, `flow` чи `wiring`. Перевірка все одно проходить |

K001 містить `did you mean …`, коли сусід близький, і підказує `planned`, якщо ID може бути наміром. Попередження не валять `check`.

`keylang fmt --check` тримає специфікацію канонічною в CI і нічого не пише. Семантичні помилки форматуванню не заважають. Структурні — заважають.

Далі: [як генерується карта](04-map.md), потім [правила](05-rules.md) і [потоки](06-flows.md) як перевірки, а не лише синтаксис.
