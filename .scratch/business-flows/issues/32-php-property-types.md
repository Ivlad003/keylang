# 32: PHP: тип властивості з присвоєння в конструкторі та з docblock `@var`

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/php.test.ts` · `npm run typecheck` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md) §3a, рев'ю плану 2026-10-07 (тікет 04); перевірка на Magento: `QuoteManagement.php:58-93`

## What to build

У коді під PHP 7.x (увесь Magento, старий Laravel/Symfony) властивості не типізовані. Тип видно з двох місць, і обидва — факти, записані в коді:

1. **Присвоєння в конструкторі.** `public function __construct(OrderManagementInterface $orderManagement, …) { $this->orderManagement = $orderManagement; }` — тип параметра стає типом властивості. Лише пряме присвоєння параметра (не виразу); кілька присвоєнь різних типів — тип невідомий (дірка `ambiguous property type`).
2. **Docblock `@var`** над властивістю (`/** @var OrderManagement */`) — коли (1) немає. Ім'я резолвиться через `use`/namespace файла так само, як type hint. Це теж записано в коді й виконується статичними аналізаторами PHP (phpstan), але PHP його не перевіряє, тож ребро отримує `provenance: "docblock"` (нове значення поруч із `syntactic`), і вердикт це називає («typed by a docblock at …»). `--static=shape` таким ребрам довіряє так само, як типам (вони не хуки).

Також: `@param` для нетипізованих параметрів конструктора — за тим самим правилом; `@method` і `@property` — ні (магія, дірка).

- Місце: `src/extract/php.ts` (`fields`), документація `docs/snapshot.md` «PHP».
- Метрика: на бенчі Magento (03) частка `call through a local value`/`function value` падає, а резолвлені виклики до інтерфейсних методів стають діркою нового виду `call through an interface` (яку далі закриває 04).

## Критерії готовності

- [x] фікстура: нетипізована властивість + ctor-присвоєння → `$this->x->m()` резолвиться в метод класу `X`; з інтерфейсом — дірка `call through an interface \`X\``
- [x] фікстура: лише `@var` → ребро з `provenance: docblock`, у вердикті видно; суперечливі `@var` і ctor → дірка
- [x] `metamorphic.test.ts`: видалення docblock переводить ok/fail лише в unverified
- [ ] бенч 03: нові числа в `results.md` — потребує клону Magento (мережа); знімається прогоном тікета 03 після цього

**Межі:** лише PHP; TS/Python аналог (JSDoc `@type`, Python-анотації в `__init__`) — окремо, якщо бенч покаже потребу.

## Comments

**2026-10-07 — реалізовано.**

- `src/extract/php.ts`: `fields` класу тепер `prop → {cls, docblock?}`. Джерела типу нетипізованої властивості, за порядком: (1) присвоєння `$this->x = $x` у `__construct`, де `$x` — параметр з одним класом у type hint (syntactic) або, без type hint, у `@param X $x` (docblock); лише пряме присвоєння параметра, вираз — «немає класу». Два різні класи або клас плюс вираз → дірка `unsupported` «ambiguous property type `$x`: assigned `A` and `B` in the constructor» з `symbol` = клас, типу немає. (2) Без присвоєння — `@var X` (`?X`, `X|null`; масиви, об'єднання, вбудовані — ні), ім'я резолвиться `canonicalClass` як type hint. `@var`, що суперечить конструктору, → дірка «ambiguous property type `$x`: `@var A`, assigned `B` in the constructor». Коли конструктор дає клас і хоч одне джерело syntactic — ребро syntactic.
- Ім'я, записане лише в docblock, стає optional-імпортом з `docblock: true`; ім'я, яке код називає, витісняє його (`Collector.implicit`, і ще раз у `graph.ts` для різних написань одного модуля).
- `SnapshotEdge.provenance` — `"syntactic" | "docblock"`, нове поле `docblock: "file:line:col"` (позиція тега `@var`/`@param`). `EXTRACTOR_VERSION` → m1.13.
- Вердикти: `flows.ts` `routeMessage` — «called from X, typed by a docblock at …» (для довгого маршруту — у дужках поруч із нотатками про хуки); `rules.ts` K101/K102/K107 — «depends on `Y` (typed by a docblock at …)»; `explain` друкує те саме. `--static=shape` довіряє docblock-ребрам (без `via`, тож `proves()` їх уже приймав).
- Виклик через отримувач з типом-інтерфейсом (тип без членів) — `dynamic-call` «call through an interface `X`»; увімкнено лише для PHP (`LANGUAGES.php.interfaceTypes`), щоб тексти TS-вердиктів не змінились. Існуючий тест `unresolved call \`this.repo.find\`` переписано на нову причину.
- Тести: `tests/php.test.ts` — два нові тести (ctor-присвоєння, `@var` FQN без `use`, `@param`, інтерфейс, два конфлікти, `@method`/`@property`; вердикти потоку, K102, `--static shape`), `tests/metamorphic.test.ts` — PHP-пара «з `@var` / без»: лише `domain.Mailer.Mailer.send ok → unverified`. Прогін: `node --test tests/php.test.ts tests/metamorphic.test.ts` — 18 тестів, 15 pass, 3 skipped (php/phpunit не встановлені); `npm run typecheck`, `node bin/keylang.js map --check`, `node bin/keylang.js check` — чисто (карти `keylang/map*` перегенеровано через зсув рядків).
- Документація: `docs/snapshot.md` (таблиця `edges`, абзац PHP, примітка про `provenance`), `docs/semantics.md` (рядок `static`).
- Поза обсягом цієї зміни: бенч 03 (потрібен клон Magento, мережі немає); `@param` для `$x->m()` усередині самого конструктора (тип лише для властивостей); TS/Python-аналоги.
