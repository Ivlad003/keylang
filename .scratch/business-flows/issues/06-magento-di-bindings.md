# 06: Magento: `di.xml` (preference, type arguments, virtualType) → прив'язки

**Status:** resolved

**Type:** code

**Blocked by:** 04

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Перший адаптер за ADR 0022.

- Виявлення Magento: `registration.php` з `ComponentRegistrar::register(ComponentRegistrar::MODULE, …)` або `app/etc/di.xml`.
- Читання `etc/di.xml`, `etc/frontend/di.xml`, `etc/adminhtml/di.xml`, `etc/webapi_rest/di.xml`… (область = тека): `<preference for="I" type="C"/>` → binding; `<type name="X"><arguments><argument xsi:type="object">Y</argument>` → binding для конкретного параметра конструктора X; `<virtualType name="V" type="C">` → V як аліас C з власними аргументами.
- XML — перевіреним пакетом (ADR 0002), не регулярками; позиції рядків зберігаються.
- Імена класів у XML з `\` чи без — нормалізація як у PHP-резолвері (`src/php-imports.ts`).
- Нерозібраний XML → дірка `skipped-file` з причиною, решта модуля працює.

## Критерії готовності

- [x] фікстура з трьома областями й virtualType; ребра з `via` і `scope`
- [x] бенч 03: частка розв'язаних викликів суттєво зростає, у `submitQuote` з'являються `OrderManagement::place`, `SubmitQuoteValidator::validateQuote`, `quoteRepository->save`
- [x] `docs/` (новий розділ «Magento» у snapshot.md), `llm.txt`: як увімкнути

**Межі:** plugins — 07, events — 08, точки входу — 09.

## Comments

### Рев'ю плану (2026-10-07)

За рішенням автора `deny` бачить DI-ребра. На brownfield-Magento кожен модуль оголошує preference на інтерфейси інших, тож після цього тікета `check` на бенчі дасть сотні нових K102 на старих правилах. Це очікувано, але треба: (1) `keylang baseline` має вміти записати їх (перевірити, що baseline розрізняє `via`-ребра — інакше розширити формат рядком-коментарем походження); (2) у звіті K102 завжди називати `via` і файл конфігу, щоб людина бачила, що порушення — в `di.xml`, а не в PHP.

### Реалізовано (2026-10-08)

- **Адаптер** — `src/frameworks/adapter.ts` (інтерфейс `detect/files/parse`, реєстр, `activeAdapters`, поле `frameworks` у `keylang.json`, `src/config.ts`) і `src/frameworks/magento.ts`. Виявлення: проаналізований `registration.php` з `ComponentRegistrar::MODULE` або `app/etc/di.xml`; `frameworks: []` вимикає, `["magento"]` вмикає без виявлення (тоді читаються конфіги кожного зареєстрованого компонента). Файли: `etc/di.xml` (`global`) і `etc/<area>/di.xml` кожного модуля, `app/etc/di.xml`; `exclude`/`outside` діють і на них.
- **XML** — `saxes` (ADR 0002, `dependencies` у `package.json`), позиції — парсера. `<preference>` → прив'язка; `<type><arguments><argument xsi:type="object">` → значення параметра конструктора (граф застосовує його до виклику через властивість, яку конструктор заповнює цим параметром: `$this->x = $p` чи promoted, `CallFact.param`, навіть коли тип властивості невідомий); `<virtualType>` → аліас класу (ланцюжок, з областю); `\` на початку й суфікс `\Proxy` нормалізуються. Нерозібраний XML → `skipped-file` з причиною й власником-модулем, решта працює.
- **Факт знімка** (ADR 0022 п. 1): `manifest.frameworks` (`name`, `version`, `{path, sha256}`), `snapshotId`, кеш фактів за вмістом (`configs` у `.keylang/cache/facts.json`, ключ — адаптер, версія і SHA-256). Змінений `di.xml` — новий `snapshotId`, `map --check` не проходить, запис кешу оновлюється (тест).
- **Рев'ю плану.** K102 завжди називає `via`, `binding` і `di.xml:рядок` (і область, коли не global) і стоїть на рядку конфігу; `baseline` не губить залежність лише з конфігу — пише рядок-коментар `<!-- keylang:baseline A → B only through the framework config: <via> <site> -->`.
- **Тести** — `tests/frameworks-magento.test.ts` (7 тестів через CLI на `tests/fixtures/magento-shop`: три модулі, global/frontend/adminhtml, конфліктний preference, клас поза знімком, virtualType-аргумент, plugins), `tests/metamorphic.test.ts` (`frameworks: []` і нерозібраний XML переводять ok/fail лише в unverified).
- **Бенч** (`bench/magento/results.md`): розв'язано 17,7 % → **21,5 %** (4892 → 5962 з 27 703); дірок «call through an interface» 1323 → 82 (решта — `bound to opaque` до класів з базою з Framework поза аналізом, 22 `unresolved-binding`, 4 `ambiguous-binding`); золотий список `placeOrder` 4/5 → **6/6** (з plugin, тікет 07). У чернетці `submitQuote`/`placeOrder` є `OrderService::place` (через preference `Sales/etc/di.xml:66`), `validateQuote`, `validateOrder`, `QuoteRepository::save` (preference `Quote/etc/di.xml:20`). Мета spec §6 (≥ 60 %) прив'язками не досягається: головні дірки — `call through a local value` (7625) і `unresolved call` (5674), не DI.

