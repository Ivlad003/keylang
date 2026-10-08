# 36: Symfony: services.yaml, маршрути, підписники, Messenger, команди

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (PHP) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- **Прив'язки:** `config/services.yaml` (`_defaults.autowire`, `App\:` resource, аліаси `I: '@C'`, `bind:`), атрибут `#[AsAlias]`; XML/PHP-конфіги — дірка з причиною, якщо не прочитано.
- **Точки входу:** `#[Route('/x', methods: ['POST'])]` на методах і класах (префікс), `config/routes.yaml` → `route`; `EventSubscriberInterface::getSubscribedEvents` і `#[AsEventListener]` → `observer` + `$dispatcher->dispatch(new X)` → подія за класом; `#[AsMessageHandler]` → `consumer`; `#[AsCommand]` → `cli`; `#[AsCronTask]`/Scheduler → `cron`.

## Критерії готовності

- [x] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [x] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [x] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments

### Реалізовано (2026-10-08)

- **Адаптер** `src/frameworks/symfony.ts` (+ атрибути в `src/framework-code/symfony.ts`): `detect` — `symfony/framework-bundle` (чи `symfony/symfony`) у `composer.json` або `config/bundles.php`; `files` — `config/services{,_dev,_test,_prod}`, `config/routes`, `config/routes/{attributes,annotations}` з розширенням `yaml|yml|xml|php`. YAML читає парсер `yaml` (нова залежність у `dependencies`), рядки й колонки — його; XML/PHP — помилка файла, тобто дірка `skipped-file` «Symfony config keylang does not read».
- **`services.yaml`:** `I: '@C'`, `alias:`, `class:` → прив'язка (`via: "preference"`); `arguments`/`bind` `$p: '@C'` → аргумент конструктора (`via: "argument"`); `_defaults: bind:` → аргумент кожного класу (`ArgumentFact` з типом `*`, `EVERY_CLASS`; власний аргумент класу має перевагу, `src/frameworks/bindings.ts`). Позиційні `arguments`, `factory`, `@=вираз` — дірки. `#[AsAlias]` → прив'язка.
- **Атрибути** (факти екстрактора, тікет 35): `#[Route]` на класі (префікс) і методах + префікс імпорту каталогу з `routes.yaml`; маршрути `routes.yaml` з `path`/`controller`; `#[AsEventListener]` і літеральний `getSubscribedEvents()` → `observer`; `#[AsMessageHandler]` → `consumer`; `#[AsCommand]`/`$defaultName` → `cli`; `#[AsCronTask]`/`#[AsPeriodicTask]` → `cron`.
- **Події й Messenger:** після злиття master з подіями Magento — вузли `events.<клас>`: `#[AsEventListener]`, підписники й `#[AsMessageHandler]` — `ObserverFact` (обробник — з `entry: false`, точка входу — `consumer`), `$dispatcher->dispatch(new E)` і `$bus->dispatch(new M)` — ребро fn → подія `via: "dispatch"`. Залежності сервісу від обробника `deny` тепер не бачить (між ними подія, як у Magento); до злиття тест перевіряв K102 через пряме ребро `dispatch`.
- **Тести:** `tests/frameworks-symfony.test.ts` (5) — точки входу кожного виду з префіксом `routes.yaml`, ребра аліасу, `alias:`, `arguments`, `_defaults: bind`, observers подій (subscriber, listener, handler) з `site` і `binding`, флоу `ok` (через подію)/`unverified`, K102 на рядках `services.yaml`, `flows discover`, XML-конфіг — дірка, metamorphic `frameworks: []`.
- **Не зроблено:** автоматичний аліас інтерфейсу з однією реалізацією (`singly implemented`), `_instanceof`, теги й `!tagged_iterator`, маршрути за локалями, `config/packages/messenger.yaml` (routing транспортів).
