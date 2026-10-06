# 4. Що читати

[Підготовчий курс](README.md) · [English](../04-reading.md) · **Українською**

Це маршрут читання, який починається без жодних архітектурних слів і закінчується проєктом, що його можна пояснити й перевірити. Кожен пункт маршруту прив'язаний до слова з [частини 2](02-the-words.md) або до принципу з [частини 3](03-principles.md).

Посилання на GitHub наведено лише там, де роботу виклав сам автор або видавець, а номери сторінок платних книжок ми не вказуємо. Читати все не обов'язково: зупиніться, щойно крамниця в `examples/shop` здасться очевидною, і поверніться, коли справжній репозиторій почне боліти так само.

## Три сенси слова «надійний»

| Сенс | Питання | Що перевіряє keylang | Де |
|---|---|---|---|
| Проєкт лишається зрозумілим | Чи можна змінити правило ціни, не читаючи базу й екран? | `layers`, `deny`, `no-cycles`, id | Цей курс, потім шлях нижче |
| Сценарій досі відбувається | Чи оформлення досі кличе `buy`, потім створення, потім збереження? | `# flow`, пізніше тест і trace | [Урок 6](../../uk/06-flows.md) |
| Запущена система тримається | Що буде, коли впаде диск або запит ворожий? | Нічого: keylang не бачить продакшену | Книжки Google в кінці, коли структура вже нудна |

Починайте з першого рядка, а до двох інших дійдете згодом.

## Шлях

### 1. Крамниця, потім одна стаття

Прочитайте [частину 1](01-the-shop.md), а потім статтю Martin Fowler [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) (26 серпня 2015). Він ділить програму на подання, логіку предметної області й доступ до даних, щоб над предметною областю можна було працювати, не зважаючи на екран. Це принципи 1 і 3, тільки його словами.

Його раніша нотатка [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html) (9 жовтня 2003) пояснює, чому такий поділ окупається: предметну область легше тестувати, другому екрану не доводиться копіювати правило, а веб-API — це просто ще одне подання. Зверніть увагу, що поділ логічний, а не «розкладіть шари по різних машинах».

> Don't make the mistake that this is a client/server physical separation. Even if all your code is running on the same machine, it's well worth making this logical separation.
>
> — Martin Fowler, [Presentation Domain Separation](https://martinfowler.com/bliki/PresentationDomainSeparation.html), 9 жовтня 2003

Переклад: не помиляйтеся, вважаючи це фізичним поділом на клієнт і сервер. Навіть якщо весь ваш код працює на одній машині, такий логічний поділ цілком вартий зусиль.

Словами keylang це `presentation`, `domain` і `infrastructure` (його «доступ до даних»), причому домен ніколи не називає подання.

### 2. Які гасла пережили голосування

У нотатці Fowler [Layering Principles](https://martinfowler.com/bliki/LayeringPrinciples.html) (7 січня 2005) записано, як учасники воркшопу голосували за принципи поділу на шари. Рахунок нижче — це голоси за/проти.

| Принцип | Рахунок | У keylang |
|---|---|---|
| Слабкий зв'язок між шарами, сильна згуртованість усередині | 10/0 | Одне речення на шар |
| Розділення відповідальностей | 11/0 | Та сама ідея |
| В інтерфейсі немає бізнес-логіки | 10/0 | Напрям пишете ви; інструмент стежить за напрямом, а не за мудрістю |
| Бізнес-шар не посилається на модулі інтерфейсу | 8/0 | `deny domain presentation`, або домен нижче за подання |
| Немає кільцевих посилань між шарами | 8/0 | `no-cycles` |
| Бізнес-шар користується абстракціями технічних служб | 14/0 | Домен викликає псевдонім на кшталт `orders`, а не драйвер бази |
| Шари тестуються по одному | 12/0 | Крок потоку називає одну функцію, а названий тест — це доказ `tests` |
| Шари логічні, це не діаграма розгортання | 11/0 | `keylang.json` групує файли, але процесів не запускає |
| Нижній шар не залежить від верхнього | 6/0 | `layers a < b`: потреба вказує вниз |

Наступні гасла кімната відхилила, тож не беріть їх за типовий вибір:

| Гасло | Рахунок | Чому |
|---|---|---|
| Основних типів шарів щонайменше три | 3/9 | Чотири роботи, де `application` стоїть між екраном і паперовим правилом, цілком дозволені |
| Команди за шарами | 1/22 | Тека — не організаційна схема |
| Процес на шар | 0/18 | Те саме застереження: логічний поділ — не розгортання |
| Перекидати винятки на кожній межі шару | 0/15 | Не справа keylang |

Теза «шари говорять лише із сусідами» розділила кімнату навпіл (4/4). Відповідь keylang на неї — записаний виняток: `allow` разом із реченням, яке його пояснює. Сервер крамниці — саме такий виняток.

### 3. Потреби вказують усередину

Далі — допис Robert C. Martin [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (13 серпня 2012); його вихідний текст лежить [у репозиторії його сайту](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md).

Розділ **The Dependency Rule** каже, що потреби у вихідному коді вказують усередину: внутрішнє коло ніколи не згадує імен із зовнішнього. Правила «кіл має бути рівно чотири» немає. Під час роботи виклик цілком може йти назовні, але потреба в коді все одно вказує всередину.

> There's no rule that says you must always have just these four. However, The Dependency Rule always applies. Source code dependencies always point inwards. As you move inwards the level of abstraction increases. The outermost circle is low level concrete detail.
>
> — Robert C. Martin, той самий допис, [джерело на GitHub](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md)

Переклад: немає правила, що кіл завжди має бути саме чотири. Проте правило залежностей діє завжди: залежності вихідного коду завжди вказують усередину. Що глибше всередину, то вищий рівень абстракції, а зовнішнє коло — це низькорівневі конкретні деталі.

У keylang це правило записує `deny domain infrastructure`, а `entry` позначає місце, звідки стартує керування, — ззовні.

Його книжка *Clean Architecture* (Prentice Hall, 2017) додає ще дві ідеї: жодних циклів і залежність у бік того, що змінюється рідше. Спершу прочитайте допис 2012 року, а книжку купуйте у видавця, коли захочете розгорнутішої аргументації.

Простою мовою: те, чого потребує багато інших частин, має змінюватися рідко. Сума замовлення — такий центр, а верстка чека — ні, тому домен і не імпортує чек.

### 4. База сидить ззовні, поруч з екраном

У статті [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) (2005) Alistair Cockburn намалював базу поза застосунком, симетрично до екрана, щоб люди перестали вважати сховище дном стека. У шестикутника немає ні верху, ні низу, а його сторони — це порти. Адаптер говорить через порт мовою справжнього пристрою, наприклад HTTP, бази чи тесту.

> Many applications have only two ports: the user-side dialog and the database-side dialog. This gives them an asymmetric appearance, which makes it seem natural to build the application in a one-dimensional, three-, four-, or five-layer stacked architecture. […] The hexagonal, or ports and adapters, architecture solves these problems by noting the symmetry in the situation: there is an application on the inside communicating over some number of ports with things on the outside.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), 2005

Переклад: у багатьох застосунків лише два порти — діалог із користувачем і діалог із базою. Через це вони виглядають асиметрично, і здається природним будувати застосунок як одновимірний стек із трьох, чотирьох чи п'яти шарів. Шестикутна архітектура, або порти й адаптери, розв'язує ці проблеми, помічаючи симетрію: усередині є застосунок, який через кілька портів спілкується з тим, що ззовні.

Словами keylang: `domain` і `application` — усередині, а `presentation` і `infrastructure` — ззовні. `allow` від infrastructure до presentation означає, що одному адаптерові передали інший, тож запишіть це. Малювати шестикутник у специфікації не потрібно.

### 5. Одна безкоштовна книжка, чотири розділи, і досить

Книжку *Architecture Patterns with Python* (O'Reilly, 2020) написали Harry Percival і Bob Gregory, і її можна прочитати на [cosmicpython.com](https://www.cosmicpython.com/book/preface.html). Рукопис лежить на [github.com/cosmicpython/book](https://github.com/cosmicpython/book), а код прикладу — на [github.com/cosmicpython/code](https://github.com/cosmicpython/code), по гілці на кожен розділ. І онлайн-книжка, і код поширюються за CC BY-NC-ND: їх можна читати й поширювати некомерційно із зазначенням авторства, але публікувати переписану копію не можна.

> Don't be put off if you're not working with (or interested in) microservices. The vast majority of the patterns we discuss, including much of the event-driven architecture material, is absolutely applicable in a monolithic architecture.
>
> — Harry Percival і Bob Gregory, [передмова](https://www.cosmicpython.com/book/preface.html)

Переклад: не відступайте, якщо ви не працюєте з мікросервісами або вони вас не цікавлять. Переважна більшість патернів, про які ми говоримо, зокрема й багато матеріалу про подієву архітектуру, цілком застосовна до моноліту.

Читайте лише ці розділи й саме в такому порядку:

| Розділ | Навіщо |
|---|---|
| [1. Domain Modeling](https://www.cosmicpython.com/book/chapter_01_domain_model.html) | Модель без веб-фреймворка і без бази, як `domain` у крамниці |
| [3. On Coupling and Abstractions](https://www.cosmicpython.com/book/chapter_03_abstractions.html) | Що ховає модуль: принцип 1, але з кодом |
| [4. Service Layer](https://www.cosmicpython.com/book/chapter_04_service_layer.html) | Сценарій використання як точка входу: `application` у крамниці й причина, чому в потоку є тригер |
| [7. Aggregates and Consistency Boundaries](https://www.cosmicpython.com/book/chapter_07_aggregate.html) | Чому `orderAggregate` — один модуль; назва в крамниці походить саме від цього слова |

Розділ 2 (repository) варто прочитати, коли SQL почне просочуватися в домен. Розділ 13 (впровадження залежностей) пояснює ідею, на якій тримається `# wiring`, — до неї курс дійде пізніше. Друга частина книжки, про події й мікросервіси, може зачекати, доки вам не стане зрозумілою одна програма. І не діліть крамницю на сервіси першим же кроком.

### 6. Словник, не другий підручник

Книжка Eric Evans *Domain-Driven Design* (Addison-Wesley, 2004) — платна: [InformIT, ISBN 978-0-13-305296-1](https://www.informit.com/title/0133052966).

Зате безкоштовно можна прочитати його [DDD Reference](https://www.domainlanguage.com/ddd/reference/) — PDF за ліцензією Creative Commons Attribution. Є й спільнотна верстка того самого тексту на [github.com/ul/ddd-reference](https://github.com/ul/ddd-reference), але першоджерелом лишається PDF автора. Сам Evans пише, що довідник не навчає ідей, а лише дає їм визначення для того, хто з ними вже знайомий.

> This document is meant as a convenient reference for those who know the principles of Domain-Driven Design (DDD). It does not contain full explanations of DDD or even of the terms and patterns covered.
>
> — Eric Evans, [DDD Reference](https://www.domainlanguage.com/ddd/reference/)

Переклад: цей документ задуманий як зручний довідник для тих, хто вже знає принципи предметно-орієнтованого проєктування (DDD). Повних пояснень DDD тут немає, як немає їх навіть для описаних термінів і патернів.

Тому беріться за нього після розділів 1 і 7, згаданих вище.

| Назва в довіднику | Крамниця |
|---|---|
| Layered Architecture | Чотири роботи; «три шари» не обов'язкові |
| Entity, Value Object | З чого складається замовлення; оголошену форму даних keylang називає `type` |
| Aggregate | `orderAggregate`: група об'єктів, яку завантажують і зберігають разом |
| Repository | Модуль infrastructure, який зберігає і шукає замовлення |
| Service | Завдання, яке не є річчю; `purchase.buy` ближче до цього, ніж до сутності |

Якщо абзац ніяк не пов'язаний із крамницею, пропустіть його. Карти контекстів, наприклад, потрібні, коли працюють кілька команд, тож відкладіть їх на пізніше, ніж перший місяць.

### 7. Одна справжня програма, одне питання

Збірка *The Architecture of Open Source Applications* за редакцією Amy Brown і Greg Wilson доступна на [aosabook.org](https://aosabook.org/en/index.html) і [github.com/aosabook/aosabook](https://github.com/aosabook/aosabook) за ліцензією CC BY 3.0. Кожен розділ описує одну справжню систему, і пишуть його ті, хто цю систему збудував.

*500 Lines or Less* лежить на [github.com/aosabook/500lines](https://github.com/aosabook/500lines). Ця книжка розбирає маленькі програми й питає, чому їхні модулі розрізано саме так.

> Architects look at thousands of buildings during their training, and study critiques of those buildings written by masters. In contrast, most software developers only ever get to know a handful of large programs well—usually programs they wrote themselves—and never study the great programs of history.
>
> — Amy Brown і Greg Wilson, [The Architecture of Open Source Applications](https://aosabook.org/en/index.html)

Переклад: під час навчання архітектори розглядають тисячі будівель і читають їхні розбори, написані майстрами. Натомість більшість розробників добре знають лише жменьку великих програм — зазвичай тих, які написали самі, — і ніколи не вивчають видатних програм історії.

Прочитайте один розділ і запишіть на полях, хто кого потребує, яку потребу ви заборонили б через `deny` і де був би `entry`.

### 8. Малюнки, які не є файлом keylang

**C4** від Simon Brown описано на [c4model.com](https://c4model.com/), а її джерела — на [github.com/simonbrowndotje/c4model](https://github.com/simonbrowndotje/c4model). Ця модель має чотири масштаби: система у світі, контейнери, які ви розгортаєте, компоненти всередині одного контейнера і код. Карта keylang найближча до рівнів компонентів і коду *одного* репозиторію; це не малюнок усієї компанії й не діаграма розгортання.

**arc42** від Gernot Starke і Peter Hruschka живе на [arc42.org](https://arc42.org/) за ліцензією CC BY-SA 4.0 ([arc42.org/license](https://arc42.org/license/)). Його подання будівельних блоків — родич карти, а подання виконання — родич потоку. Твердження на кшталт «оформлення відповідає за такий-то час» має жити в прозі або в ADR, бо рядком `deny` його не висловиш.

## Коли структура вже нудна

- *Site Reliability Engineering* і *The Site Reliability Workbook* від Google безкоштовні на [sre.google/books](https://sre.google/books/). Вони про експлуатацію сервісу й виходять із того, що система вже має форму.
- *Building Secure and Reliable Systems* (2020) безкоштовна на [sre.google/books](https://sre.google/books/) і [google.github.io/building-secure-and-reliable-systems](https://google.github.io/building-secure-and-reliable-systems/). Привілеїв keylang не бачить, тож вирішувати їх однаково вам.
- Каталог Fowler [*Patterns of Enterprise Application Architecture*](https://martinfowler.com/eaaCatalog/) (Addison-Wesley, 2002; статті на його сайті) — це словник для repository і шару служб, до якого варто братися після cosmicpython.
- *Designing Data-Intensive Applications* (Kleppmann), [dataintensive.net](https://dataintensive.net/), — про реплікацію та узгодженість, а не про теки, тож не починайте з неї.
- *Release It!* (Nygard) — про таймаути й повторні спроби. Порада та сама: не з неї починати.

## Не в перший місяць

- Не збирайте PDF, яких автор не публікував.
- Не починайте з мікросервісів, event sourcing чи CQRS.
- Не вигадуйте шар лише тому, що в книжці був прямокутник із такою назвою. Заводьте шар тоді, коли можете назвати його роботу, а потім напишіть `deny`.
- Не чекайте, що keylang перевірить, чи працює запущена крамниця без збоїв. Він перевіряє, хто кого може знати, і кроки сценарію, який ви назвали.
- Не пишіть функції — пишіть специфікацію, а код нехай генерує агент. Пам'ятайте, що сам keylang агента не запускає.

Коли хибний id крамниці, `deny` і один потік оформлення стануть для вас нудними, переходьте до [уроку 1](../../uk/01-what-it-is.md).
