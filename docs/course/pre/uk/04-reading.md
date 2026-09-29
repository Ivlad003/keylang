# 4. Що читати

[Підготовчий курс](README.md) · [English](../04-reading.md) · **Українською**

Шлях від відсутності архітектурних слів до проєкту, який можна пояснити і перевірити. Кожен пункт прив'язаний до слова з [частини 2](02-the-words.md) або принципу з [частини 3](03-principles.md).

Посилання на GitHub є лише там, де роботу поклав автор або видавець. Номери сторінок платних книжок не наводимо. Зупиніться, коли крамниця в `examples/shop` стала очевидною. Поверніться, коли справжній репозиторій болить саме так.

## Три сенси слова «надійний»

| Сенс | Питання | Що перевіряє keylang | Де |
|---|---|---|---|
| Проєкт лишається зрозумілим | Чи можна змінити правило ціни, не читаючи базу й екран? | `layers`, `deny`, `no-cycles`, id | Цей курс, потім шлях нижче |
| Сценарій досі відбувається | Чи оформлення досі кличе `buy`, потім створення, потім збереження? | `# flow`, пізніше тест і trace | [Урок 6](../../uk/06-flows.md) |
| Запущена система тримається | Що буде, коли впаде диск або запит ворожий? | Нічого. keylang продакшен не бачить | Книжки Google в кінці, коли структура вже нудна |

Починайте з першого рядка.

## Шлях

### 1. Крамниця, потім одна стаття

Прочитайте [частину 1](01-the-shop.md). Потім Martin Fowler, [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) (26 серпня 2015). Він ділить програму на подання, логіку області і доступ до даних, щоб роботу над областю можна було вести без екрана. Це принципи 1 і 3.

Раніша нотатка [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html) (9 жовтня 2003) каже, навіщо розріз: область легше тестувати, другий екран не копіює правило, веб-API — інше подання. Розріз логічний. Це не «покласти шари на різні машини».

> Don't make the mistake that this is a client/server physical separation. Even if all your code is running on the same machine, it's well worth making this logical separation.
>
> — Martin Fowler, [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html), 9 жовтня 2003

Переклад: не плутайте це з фізичним поділом клієнт/сервер. Навіть якщо весь код на одній машині, логічний поділ вартий того.

Слова keylang: `presentation`, `domain`, `infrastructure` (його доступ до даних). Домен не називає подання.

### 2. Які гасла пережили голосування

Fowler, [Layering Principles](https://martinfowler.com/bliki/LayeringPrinciples.html) (7 січня 2005). Воркшоп голосував. Рахунок — за/проти.

| Принцип | Рахунок | У keylang |
|---|---|---|
| Слабкий зв'язок між шарами, сильна згуртованість усередині | 10/0 | Одне речення на шар |
| Розділення відповідальностей | 11/0 | Та сама ідея |
| В інтерфейсі немає бізнес-логіки | 10/0 | Напрям пишете ви. Інструмент тримає напрям, не мудрість |
| Бізнес-шар не посилається на модулі інтерфейсу | 8/0 | `deny domain presentation`, або домен нижче за подання |
| Немає кільцевих посилань між шарами | 8/0 | `no-cycles` |
| Бізнес-шар користується абстракціями технічних служб | 14/0 | Домен кличе псевдонім на кшталт `orders`, не драйвер бази |
| Шари тестуються по одному | 12/0 | Крок потоку називає одну функцію. Названий тест — доказ `tests` |
| Шари логічні, це не діаграма розгортання | 11/0 | `keylang.json` групує файли. Процесів не запускає |
| Нижній шар не залежить від верхнього | 6/0 | `layers a < b`. Потреба вказує вниз |

Не беріть це за типовий вибір:

| Гасло | Рахунок | Чому |
|---|---|---|
| Типів шарів завжди щонайменше три | 3/9 | Чотири роботи, з `application` між екраном і паперовим правилом, дозволені |
| Команди за шарами | 1/22 | Тека — не оргсхема |
| Процес на шар | 0/18 | Те саме: логічне — не розгортання |
| Перекидати винятки на кожній межі шару | 0/15 | Не справа keylang |

«Шари говорять лише з сусідами» розділило кімнату (4/4). Відповідь keylang — записаний виняток: `allow` і речення. Сервер крамниці — той виняток.

### 3. Потреби вказують усередину

Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (13 серпня 2012). Джерело допису — [у репозиторії його сайту](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md).

Під заголовком **The Dependency Rule** потреби у вихідному коді вказують усередину. Внутрішнє коло не згадує імені із зовнішнього. Правила «кіл має бути рівно чотири» немає. Виклик під час роботи може йти назовні. Потреба у коді все одно вказує всередину.

> There's no rule that says you must always have just these four. However, The Dependency Rule always applies. Source code dependencies always point inwards. As you move inwards the level of abstraction increases. The outermost circle is low level concrete detail.
>
> — Robert C. Martin, той самий допис, [джерело на GitHub](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md)

Переклад: немає правила, що кіл завжди рівно чотири. Правило залежностей діє завжди. Залежності вихідного коду завжди вказують усередину. Що далі всередину, то вищий рівень абстракції. Зовнішнє коло — низькорівнева конкретна деталь.

`deny domain infrastructure` — те правило. `entry` — де стартує керування, ззовні.

Книжка *Clean Architecture* (Prentice Hall, 2017) додає: без циклів, і залежність у бік того, що змінюється рідше. Спершу допис 2012 року. Довший аргумент купуйте у видавця.

Простою мовою: річ, якої потребують багато інших, має змінюватись рідко. Сума замовлення — той центр. Верстка чека — ні. Домен не імпортує чек.

### 4. База сидить ззовні, поруч з екраном

Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) (2005). Він намалював базу зовні застосунку, симетрично до екрана, щоб люди перестали вважати сховище низом стека. У шестикутника немає верху і низу. Сторони — порти. Адаптер говорить портом мовою справжнього пристрою: HTTP, база, тест.

> Many applications have only two ports: the user-side dialog and the database-side dialog. This gives them an asymmetric appearance, which makes it seem natural to build the application in a one-dimensional, three-, four-, or five-layer stacked architecture. […] The hexagonal, or ports and adapters, architecture solves these problems by noting the symmetry in the situation: there is an application on the inside communicating over some number of ports with things on the outside.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), 2005

Переклад: у багатьох застосунків лише два порти: діалог із людиною і діалог із базою. Вигляд асиметричний, і здається природним будувати стек із трьох, чотирьох чи п'яти шарів. Шестикутник, або порти й адаптери, розв'язує це симетрією: всередині застосунок, який через кілька портів говорить із речами ззовні.

Слова keylang: `domain` і `application` — всередині. `presentation` і `infrastructure` — зовні. `allow` від infrastructure до presentation — один адаптер, якому дали інший. Запишіть це. Шестикутник у специфікації не потрібен.

### 5. Одна безкоштовна книжка, чотири розділи, і досить

Harry Percival і Bob Gregory, *Architecture Patterns with Python* (O'Reilly, 2020). Текст: [cosmicpython.com](https://www.cosmicpython.com/book/preface.html). Рукопис: [github.com/cosmicpython/book](https://github.com/cosmicpython/book). Приклад: [github.com/cosmicpython/code](https://github.com/cosmicpython/code), гілка на розділ. Онлайн-книжка і код — CC BY-NC-ND: можна читати і ділитися некомерційно, з зазначенням авторства. Переписану копію публікувати не можна.

> Don't be put off if you're not working with (or interested in) microservices. The vast majority of the patterns we discuss, including much of the event-driven architecture material, is absolutely applicable in a monolithic architecture.
>
> — Harry Percival і Bob Gregory, [передмова](https://www.cosmicpython.com/book/preface.html)

Переклад: не відступайте, якщо не працюєте з мікросервісами і вони вас не цікавлять. Більшість патернів, включно з подіями, цілком пасує моноліту.

Читайте лише це, по порядку:

| Розділ | Навіщо |
|---|---|
| [1. Domain Modeling](https://www.cosmicpython.com/book/chapter_01_domain_model.html) | Модель без веб-фреймворка і без бази. `domain` крамниці |
| [3. On Coupling and Abstractions](https://www.cosmicpython.com/book/chapter_03_abstractions.html) | Що модуль ховає. Принцип 1, з кодом |
| [4. Service Layer](https://www.cosmicpython.com/book/chapter_04_service_layer.html) | Сценарій використання як вхід. `application` крамниці, і чому в потоку є тригер |
| [7. Aggregates and Consistency Boundaries](https://www.cosmicpython.com/book/chapter_07_aggregate.html) | Чому `orderAggregate` — один модуль. Назва в крамниці — це слово |

Розділ 2 (repository) вартий того, коли SQL починає текти в домен. Розділ 13 (впровадження залежностей) — ідея `# wiring`, пізніше. Їхня частина 2, події і мікросервіси, чекає, доки одна програма ясна. Не діліть крамницю на сервіси першим кроком.

### 6. Словник, не другий підручник

Eric Evans, *Domain-Driven Design* (Addison-Wesley, 2004) — комерційна: [InformIT, ISBN 978-0-13-305296-1](https://www.informit.com/title/0133052966).

Сьогодні можна прочитати його [DDD Reference](https://www.domainlanguage.com/ddd/reference/), безкоштовний PDF, Creative Commons Attribution. Громадський набір того самого тексту — [github.com/ul/ddd-reference](https://github.com/ul/ddd-reference). Джерело — PDF автора. Він пише, що довідник ідей не вчить. Він визначає їх для того, хто їх уже зустрів.

> This document is meant as a convenient reference for those who know the principles of Domain-Driven Design (DDD). It does not contain full explanations of DDD or even of the terms and patterns covered.
>
> — Eric Evans, [DDD Reference](https://www.domainlanguage.com/ddd/reference/)

Переклад: це зручний довідник для тих, хто вже знає принципи предметно-орієнтованого проєктування. Повних пояснень тут немає, навіть для термінів і патернів.

Користуйтесь після розділів 1 і 7 вище.

| Назва в довіднику | Крамниця |
|---|---|
| Layered Architecture | Чотири роботи. «Три шари» не обов'язкові |
| Entity, Value Object | З чого складається замовлення. Оголошену форму keylang зве `type` |
| Aggregate | `orderAggregate`: купа, яку завантажують і зберігають разом |
| Repository | Модуль infrastructure, який зберігає і шукає замовлення |
| Service | Завдання, яке не є річчю. `purchase.buy` ближче до цього, ніж до сутності |

Якщо абзац не стикується з крамницею, пропустіть. Карти контекстів — для кількох команд. Не перший місяць.

### 7. Одна справжня програма, одне питання

*The Architecture of Open Source Applications*, редактори Amy Brown і Greg Wilson: [aosabook.org](https://aosabook.org/en/index.html) і [github.com/aosabook/aosabook](https://github.com/aosabook/aosabook), CC BY 3.0. Кожен розділ — одна існуюча система, написана тими, хто її збудував.

*500 Lines or Less* — [github.com/aosabook/500lines](https://github.com/aosabook/500lines). Там маленькі програми і питання, чому модулі розрізані саме так.

> Architects look at thousands of buildings during their training, and study critiques of those buildings written by masters. In contrast, most software developers only ever get to know a handful of large programs well—usually programs they wrote themselves—and never study the great programs of history.
>
> — Amy Brown і Greg Wilson, [The Architecture of Open Source Applications](https://aosabook.org/en/index.html)

Переклад: архітектори за навчання дивляться на тисячі будівель і читають розбори майстрів. Більшість розробників добре знають лише жменю великих програм, зазвичай своїх, і не вивчають видатні програми історії.

Прочитайте один розділ. На полях запишіть, хто кого потребує, яку потребу ви б заборонили `deny`, і де був би `entry`.

### 8. Малюнки, які не є файлом keylang

**C4**, Simon Brown, [c4model.com](https://c4model.com/). Джерело: [github.com/simonbrowndotje/c4model](https://github.com/simonbrowndotje/c4model). Чотири масштаби: система у світі, контейнери, які ви розгортаєте, компоненти в одному контейнері, код. Карта keylang найближча до компонентів і коду *одного* репозиторію. Це не малюнок компанії і не діаграма розгортання.

**arc42**, Gernot Starke і Peter Hruschka, [arc42.org](https://arc42.org/). Ліцензія: [arc42.org/license](https://arc42.org/license/), CC BY-SA 4.0. Вид будівельних блоків — родич карти. Вид виконання — родич потоку. «Оформлення відповідає за такий час» живе в прозі або в ADR. Рядок `deny` цього не каже.

## Коли структура вже нудна

- *Site Reliability Engineering* і *The Site Reliability Workbook* від Google безкоштовні на [sre.google/books](https://sre.google/books/). Це про експлуатацію сервісу. Вони припускають, що форма вже є.
- *Building Secure and Reliable Systems* (2020) безкоштовна на [sre.google/books](https://sre.google/books/) і [google.github.io/building-secure-and-reliable-systems](https://google.github.io/building-secure-and-reliable-systems/). Привілей keylang не побачить. Вирішуєте його ви.
- Каталог Fowler [*Patterns of Enterprise Application Architecture*](https://martinfowler.com/eaaCatalog/) (Addison-Wesley, 2002; статті на його сайті) — словник для repository і шару служб, після cosmicpython.
- *Designing Data-Intensive Applications* (Kleppmann), [dataintensive.net](https://dataintensive.net/), — про реплікацію і узгодженість, не про теки. Не починайте звідти.
- *Release It!* (Nygard) — про таймаути і повтори. Та сама порада: не спочатку.

## Не в перший місяць

- Не збирайте PDF, яких автор не публікував.
- Не починайте з мікросервісів, event sourcing чи CQRS.
- Не вигадуйте шар, бо в книжці був прямокутник із такою назвою. Вигадуйте шар, коли можете сказати його роботу, і тоді напишіть `deny`.
- Не чекайте, що keylang перевірить, чи запущена крамниця тримається. Він перевіряє, хто кого може знати, і кроки сценарію, який ви назвали.

Коли хибний id крамниці, `deny` і один потік оформлення стануть нудними, ідіть до [уроку 1](../../uk/01-what-it-is.md).
