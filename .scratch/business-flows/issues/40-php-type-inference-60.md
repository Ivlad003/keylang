# 40: PHP: типи локальних значень і члени базових класів поза аналізом — до цілі ≥ 60 % розв'язаних викликів

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/php.test.ts tests/metamorphic.test.ts tests/frameworks-magento.test.ts` · `npm run typecheck` · `node bin/keylang.js map --check` · `node bin/keylang.js check` · `node bench/magento/run.mjs --repo ~/.cache/keylang/bench/magento2`

**Джерело:** spec §6 (ціль ≥ 60 % розв'язаних викликів на бенчі Magento); бенч 2026-10-08 після всіх тікетів фічі: **21,5 %** (5962/27703). Найбільші причини дірок: «call through a local value» 7625, «unresolved call» 5674, «call through an expression» 4066, «call through `X` of a function value» 950.

## What to build

Лише факти, записані в коді (без вгадування з імен); кожне нове ребро — з тим самим походженням, що й зараз, або `provenance: "docblock"`.

1. **Тип локальної змінної PHP** у межах fn: `$x = new Foo(...)`; `$x = $this->dep->m()` / `Foo::create()` коли в розв'язаного методу є оголошений тип результату (`: Foo`, `?Foo`, `static`/`self` → клас) або `@return Foo`; inline `/** @var Foo $x */`; параметри (є); `foreach ($items as $item)` коли тип колекції `Foo[]`/`array<Foo>`/`iterable<Foo>` з `@return`/`@var`/`@param`; `instanceof`-звуження в `if`; кілька різних присвоєнь → тип невідомий (дірка, як зараз).
2. **Ланцюжки** `$this->a()->b()->c()`: тип результату кожного кроку з оголошеного типу результату методу.
3. **Члени базових класів поза аналізом.** Файли `outside` (Framework у бенчі) читаються лише як декларації (класи, методи, їхні типи результату, `extends`/`implements`), без ребер і без вузлів карти; `findMember` іде в них, тож `$this->getData()` у моделі, що наслідує `AbstractModel`, розв'язується як «external-to-architecture» виклик (ребро в `outside`-вузол? — вирішити: виклик рахується resolved, ціль — вузол виду `outside` із K107-семантикою ADR 0011; без нових правил). Обмеження розміру: кеш декларацій за хешем файла.
4. Метрики: кожен крок вимірюється бенчем; результат і розбивка причин — у `bench/magento/results.md` і нотатках тікета. Якщо 60 % недосяжні без вгадування — записати чесно, що лишилось і чому.

## Критерії готовності

- [x] тести на кожне джерело типу (new, return type, @return, inline @var, foreach з Foo[], instanceof, ланцюжок, конфлікт присвоєнь → дірка), на member lookup у outside-базі
- [x] `tests/metamorphic.test.ts`: видалення docblock/outside-файла переводить ok/fail лише в unverified
- [x] бенч Magento: частка розв'язаних викликів ≥ 60 % або задокументований розрив з причинами — 72,1 % на широкому бенчі (`--wide`, `bench/magento/results-wide.md`); вузький — 47,0 %, розрив задокументовано
- [x] `docs/snapshot.md` (PHP), `docs/semantics.md`

**Межі:** лише PHP; аналоги для TS/Python — окремо, якщо знадобиться.

## Comments

### 2026-10-08 — вимір перед роботою (вибірка 200 дірок кожної провідної причини)

Бенч на `d9c05be`: **21,5 %** (5962/27703). Вибірка — кожна N-та дірка причини, конструкцію визначено за тілом fn і фактами екстрактора.

- **«call through a local value» (7625):** параметр без класу чи з класом, якого немає в знімку — 44/200; `$x = $this->m()` — 30; `$x = $this->dep->m()` — 26 (+12 з inline `@var`); `foreach` — 23 (+3 з `@var`); без присвоєння (`catch`, `use` closure) — 21; `$x = $y->m()` — 17; inline `@var` разом — 23; `new` — 4; ланцюжок — 4; кілька різних присвоєнь — ≈ 10.
- **«unresolved call» (5674):** `$this->m()` успадкований від бази, якої keylang не читав, — 196/300; отримувач типізовано класом поза знімком: інший модуль Magento — 30, Framework поза sparse-checkout — 28, Framework у `outside` — 24, згенерована фабрика — 15. Бази `$this->m()` (усі 3720): `AbstractExtensibleModel` 1566, `Template` 283, `Backend\App\Action` 180, `AbstractExtensibleObject` 176, `Backend\Block\Widget` 131, VersionControl `Collection` 111, `Reports\…\AbstractReport` 109, … — ≈ 2300 закінчуються в `outside`.
- **«call through an expression» (4066):** `$this->m()->x()` — 85/200, `$var->m()->x()` — 41, `$this->prop->m()->x()` — 44, `X::m()->x()` (переважно `ObjectManager::getInstance()->get()`) — 10, інше — 20.
- **«call through `this` of a function value» (950):** успадкована властивість бази — 180/200 (`_storeManager`, `_eventManager`, `_objectManager`), власна нетипізована — 20.

### 2026-10-08 — кроки (кожен — окремий коміт із числами)

| Крок | Що | Розв'язано |
|---|---|---:|
| 0 | базова лінія | 21,5 % (5962/27703) |
| 1 | тип локальної змінної: `new`, параметр і `@param` (зокрема `Foo[]`), inline `@var`, `catch`, `foreach` по масиву класу, тип результату виклику (оголошений, `@return`, `static`/`self`/`$this`, `{@inheritdoc}` з інтерфейсу чи бази), `instanceof` у гілці; конфлікт → дірка; ребра `indirect` | 27,0 % (7414/27479) |
| 2 | ланцюжки `$a->b()->c()` через тип результату; дірка ланцюжка називає член (`name`) | 29,9 % (8192/27361) |
| 3 | файли `outside` як декларації (кеш за хешем, у `snapshotId`): успадковані члени, `parent::__construct`, значення класу з `outside`, `new X`, їхні типи результату й `@var` властивостей | 41,4 % (11140/26934) |
| 4a | згенеровані фабрики Magento (`XFactory::create()` → `X`) — факт адаптера, ADR 0022 | 43,2 % (11617/26918) |
| 4b | `__call` ланцюжка, прочитаного цілком (Magento `DataObject`) | **46,2 %** (12116/26236) |

Знаменник зменшується: розв'язані виклики рахуються як ребра, а ребро одне на пару fn → ціль (+ член `outside`), тоді як кожна дірка — окремо. Подій-вузлів стало 110 (було 83): `$this->_eventManager` моделей і контролерів тепер типізує `@var` у базі `outside`. Чернетки: `placeOrder` 49 → 83 кроків, `submitQuote` 148 → 221; золотий список 6/6.

**Рішення про ціль виклику в `outside`.** Ребро `call` до модуля файла `outside` (вузол уже є в карті, `members: "opaque"`, нових вузлів немає) з полем `member` (`Magento\Framework\DataObject::getData`). Це залежність коду архітектури від `outside`, тож за ADR 0011 — K107 (одна на пару файлів), ніколи K101/K102: шар `outside` поза порядком. Імпорти класів `outside` лишаються нерозв'язаними, як і були. Ребра, тип отримувача яких записано в іншій декларації (результат виклику, властивість бази), мають `indirect: true`: флоу ними йдуть, правила — ні (інакше прибрання `@return` у чужому файлі перемикало б `deny` між `fail` і `ok`). На бенчі `check` тепер дає 985 `fail` K107 — наслідок того, що бенч ставить Framework у `outside`; записано в `bench/magento/README.md`.

**Тести.** `tests/php.test.ts`: кожне джерело типу й конфлікт (`a local value has the class its declarations give…`), `outside` як декларації з K107 і `snapshotId` (`a file outside the architecture is read as declarations only…`), `__call`. `tests/frameworks-magento.test.ts`: згенеровані фабрики, з адаптером і без. `tests/metamorphic.test.ts`: прибрати `@return` (змінна й ланцюжок), inline `@var`, файл `outside`, вимкнути адаптер Magento — лише в `unverified`. `tests/review-extras.test.ts`: `(new Cart())->total()->tax()` з `total(): self` тепер ребро.

### Розрив і причини (46,2 % замість ≥ 60 %)

Діагностика решти 11 325 дірок викликів PHP (тимчасова, у код не увійшла) за причиною, чому отримувач не типізовано:

| Причина | Дірок | Чи закривається без здогаду |
|---|---:|---|
| клас отримувача, його база чи тип результату — у коді, якого немає в sparse-checkout бенча: модулі `Backend`, `Customer`, `Catalog`, `Store`, `Reports`, `Rule`, `Eav`, `Directory`, `Tax`…; Framework поза `App/Event/Model/Api` (`View`, `DB`, `Data`, `Setup`, `Session`, `ObjectManager`, `Controller`, `Serialize`…); вендор (`Psr\Log`, `Zend_Pdf`) | ≈ 8 200 | ні: keylang не може прочитати декларацію, якої немає на диску; розширити checkout — мережа |
| значення без типу в коді: нетипізований параметр чи змінна без `@param`/`@var` (≈ 1 050), метод без оголошеного типу й `@return` (≈ 310), `foreach` по колекції-об'єкту (≈ 90), закриття, функції | ≈ 1 650 | ні: класу ніде не записано |
| виклик через інтерфейс без preference у прочитаних `di.xml` (`app/etc/di.xml` і модулі поза бенчем) | ≈ 570 | ні на цьому бенчі |
| виклик через вираз keylang не називає (`$this->$m()`, `$arr[$k]->m()`, `ObjectManager->get(X::class)` — тип з аргументу), фабрика інтерфейсу, `super` інших баз | ≈ 900 | частково — лише новими фактами фреймворку (`ObjectManager::get(X::class)` → `X`), не в цьому тікеті |

Навіть якби розв'язалось усе, крім першого рядка, частка була б ≈ 58 %: ціль ≥ 60 % на цьому бенчі недосяжна без коду, якого бенч не містить. Далі — або ширший sparse-checkout (`Framework/{View,Data,DB,Session,ObjectManager}`, `Backend`, `Store`, `Customer`, `Catalog` як `outside`; ціна — пам'ять, рев'ю плану п. 8), або факт `ObjectManager::get/create(X::class)` → `X` в адаптері Magento.

### 2026-10-08 — широкий бенч (`--wide`), ObjectManager і preferences модулів `outside`

**Бенч.** `node bench/magento/run.mjs --wide` (звіт — `bench/magento/results-wide.md`; вузький `results.md` лишається типовим): `git worktree` кешованого клону в `~/.cache/keylang/bench/magento2-wide` з non-cone sparse-checkout — увесь `app/code/Magento` і `lib/internal/Magento/Framework` без тек `Test` (тести п'яти модулів лишаються) і `app/etc/di.xml`; мережа — лише довантаження blobs у кешований клон (≈ 11 с). Ті самі п'ять модулів — шари, решта 217 модулів (glob на модуль) і Framework — `outside`. 13 485 файлів; `map` без кешу ≈ 54 с, maxRSS 1,0–1,3 ГБ (`--max-old-space-size=8192`), `check` 5,4 с, 0,7 ГБ — у межах (< 8 ГБ, < 10 хв), тож профілювання не знадобилось. Файли `outside` і далі проходять повний розбір tree-sitter, з якого `declarationsOnly` лишає декларації (кеш за хешем); легший прохід без тіл — можлива оптимізація, але не вузьке місце.

| Крок | Вузький | Широкий |
|---|---:|---:|
| після 4b (до цієї нотатки) | 46,2 % (12116/26236) | 64,5 % (16023/24848) — лише ширший checkout |
| 5: `di.xml` модулів `outside` (preferences) + ObjectManager `get/create(X::class)` → `X` | **47,0 %** (12317/26230) | **72,1 %** (17965/24918) |

Золотий список 6/6, чернетки `placeOrder` 83 і `submitQuote` 221 кроків — однаково в обох. Ребер `via: object-manager` на широкому — 400, `preference` — 2660 (зокрема через інтерфейси `outside`: `StoreManagerInterface`, `ScopeConfigInterface`, `LayoutInterface`, `RequestInterface`, `Event\ManagerInterface`…). `check` широкого: 2456 `fail` K107 — наслідок `outside`, як і у вузькому.

**Рішення.** (1) Адаптер може віддати конфіг компонента `outside` з `declarations: true` — Magento: `etc/di.xml` і `etc/<area>/di.xml` кожного `registration.php` серед файлів `outside`; граф бере з нього лише preferences (`FrameworkBindings.boundByName` — за кваліфікованим іменем інтерфейсу, якого граф не має). Виклик через такий інтерфейс — ребро `via: preference` до члена класу (графа чи `outside`), `indirect: true`. Plugins, observers, аргументи й точки входу модулів `outside` не читаються: це код поза аналізом. (2) `locators` у `FrameworkInput`: Magento ObjectManager (`ObjectManagerInterface`, `ObjectManager\ObjectManager`, `App\ObjectManager`; `get`, `create`) з літералом класу першим аргументом (`X::class` чи рядок з кваліфікованим ім'ям) — ребро `via: object-manager` до `X` (для інтерфейсу — до класу preference кожної області), результат має клас `X`; `indirect: true` (залежність уже записує літерал `X::class`). Аргумент, обчислений під час виконання, — дірка. ADR 0022, уточнення. Тести: `tests/frameworks-magento.test.ts` (ObjectManager і preference модуля `outside`, з адаптером і без), `tests/metamorphic.test.ts` (вимкнути адаптер — лише `unverified`), `tests/bench-magento.test.ts` (`--wide`: аргументи, `keylang.json`, заголовок звіту).

**Решта дірок на широкому бенчі** (4216 дірок викликів з 24 918; класифікація за конструкцією отримувача, тимчасовий скрипт, у код не увійшов):

| Причина | Дірок | Чи закривається без здогаду |
|---|---:|---|
| значення — результат виклику без оголошеного чи прочитаного типу результату: `$x = $a->m()` (865), ланцюжки `$var->m()->x()` (417), `$this->m()->x()` (309), `$this->prop->m()->x()` (69) — переважно магічні геттери `DataObject` у ланцюжку з базою, якої немає (vendor) чи без `@method`, і методи без `: T`/`@return` | ≈ 1660 | ні: класу ніде не записано |
| `foreach` по об'єкту-колекції (`foreach ($collection as $item)`) — тип елемента дає `getIterator()`/`_itemObjectClass` під час виконання | 483 | ні без факту фреймворку про колекції |
| інтерфейс без preference: `DB\Adapter\AdapterInterface` 483 (з'єднання дає `ResourceConnection::getConnection()`), `Setup\ModuleDataSetupInterface` 111, пули й virtualType (`Payment MethodInterface` 70, `IdentityInterface` 46, `InfoInterface` 36, gateway-інтерфейси), `RequestInterface` в областях без власного preference, `ObjectManager->get()` класу вендора (`Psr\Log\LoggerInterface`) | ≈ 980 | ні: класу немає в конфігу чи на диску |
| інтерфейс шару, прив'язаний preference до класу, член якого оголошено в базі `outside` чи через `__call` («bound to opaque … may be declared by a base keylang has not read») | 273 | **так** — `FrameworkBindings.place` дивиться лише в базах графа; наступний крок |
| параметр без класу (113), `catch (\Exception $e)` (99 — PHP-клас, мав би бути `external`), інші присвоєння, елемент масиву, `new` класу вендора | ≈ 410 | частково (`catch` вбудованого класу → `external`) |
| `unresolved call` `$this->logger->…` (`Psr\Log` вендора немає в checkout) і preference до класу, якого немає | ≈ 175 | ні на цьому checkout |
| вираз без імені (`$this->$m()`, `$arr[$k]->m()`, змінна назва члена), значення-функція | ≈ 235 | ні |

**Критерій ≥ 60 % досягнуто на широкому бенчі (72,1 %).** Вузький лишається 47,0 %: його розрив — код, якого немає на диску (див. «Розрив і причини» вище); широкий бенч цей розрив закриває, як і передбачала та нотатка. Тікет лишається `resolved`.
