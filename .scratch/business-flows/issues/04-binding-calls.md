# 04: Граф: виклик через інтерфейс за прив'язкою з адаптера

**Status:** resolved

**Type:** code

**Blocked by:** 01, 32

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Загальний механізм для Magento preference, Laravel container, Symfony services, NestJS providers.

- `FileFacts`/граф отримують від адаптера `bindings: { from: TypeId, to: TypeId, scope?: string, via, file, line }`.
- Виклик `$this->dep->m()` / `this.dep.m()`, де тип `dep` відомий з type hint чи конструктора і є інтерфейсом із прив'язкою, стає ребром `call` на `to.m` з `via` і позицією конфігу (форма — за ADR 0022). Кілька прив'язок за областями → кілька ребер з `scope`; неоднозначність без області — дірка `ambiguous-binding`.
- Ланцюжок: preference на клас, у якого власний preference, — до фіксованої точки з захистом від циклу.
- Вердикт static називає ребро («through the preference `…` in `etc/di.xml:12`»), `--static=shape` за ADR.
- Карта: ребро видно в `calls` з позначкою `via`.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] юніт-фікстура: інтерфейс + preference → `static ok` кроку реалізації; без preference — `unverified … call through an interface`
- [x] дві області (frontend/adminhtml) → два ребра з `scope`; `deny` бачить обидва
- [x] цикл прив'язок не зависає (тест)
- [x] `docs/snapshot.md`, `docs/semantics.md` оновлено; `metamorphic.test.ts`: видалення конфігу переводить ok/fail лише в unverified

**Межі:** механізм графа; читання конкретних конфігів — 06, 30, 31.

## Comments

### Рев'ю плану (2026-10-07)

**Передумова, якої не було в плані.** Прив'язка спрацьовує лише коли граф знає тип отримувача (`$this->orderManagement` → `OrderManagementInterface`). PHP-екстрактор бере тип властивості лише з типізованої `property_declaration` або promoted-параметра (`src/extract/php.ts:59, :310-316`). У Magento властивості **нетипізовані**: `private $orderManagement;` + docblock `@var OrderManagement` + присвоєння в конструкторі з типізованого параметра. Тому 8535 викликів у вибірці — `call through a local value`, 4092 — `of a function value`: тип отримувача невідомий **ще до** будь-яких прив'язок. Без тікета 32 цей тікет на Magento майже нічого не змінить.

**Blocked by:** додати 32.

**Також:** інтерфейс у PHP — `type` без членів (`php.ts:301-303`), тож `findMember` на інтерфейсі дає `null`. Прив'язку застосовувати на цьому місці: тип отримувача → `bindings.get(iface)` (за областю) → `findMember(impl, m)`. Виклик методу, якого в реалізації немає (метод лише в інтерфейсі, реалізація непрозора) — дірка з причиною `bound to opaque …`, не `fail`.

### Реалізовано (2026-10-08)

- **Механізм** — `src/frameworks/bindings.ts` (`FrameworkBindings`), мовно-незалежний: адаптер дає прив'язки `TypeName → TypeName` (кваліфіковане ім'я PHP або `{ file, name }` — ім'я, оголошене у файлі, для TS/JS, Python, Rust), граф їх резолвить у вузли (`buildGraph(config, files, frameworks)`). На місці з рев'ю плану: тип отримувача (`typeNamed`, а для класу з власним preference — `classNamed`) → `bindings.callThroughType(type, m)` за областями → `findMember(impl, m)`. Кілька областей — кілька ребер зі `scope`; два класи в одній області — дірка `ambiguous-binding` (нерозв'язане ребро з причиною, `possibleRoute` іде кандидатами за назвою); клас поза знімком — `unresolved-call` «bound by … which no analysed file declares» і `unresolved-binding` на рядку конфігу; метод, якого немає в класі з непрочитаною базою, — `dynamic-call` «bound to opaque …», не `fail`. Ланцюжок preference — до класу без власного, повтор зупиняє (тест циклу `I → A → B → A`).
- **Ребро** — `call` з `via: "preference" | "argument" | "plugin:*"`, `site` (рядок конфігу), `scope`, `owner` (модуль-власник конфігу), `binding` (факт словами). `addCall` ранжує їх як інші `via` (2). `stats.callsResolved` рахує виклик, який розв'язала прив'язка.
- **Вердикт** — `describeConfig` у `src/flows.ts`: «called from X through the preference `I → C` in `etc/di.xml:12`»; `--static shape` — `unverified … (not followed in static mode shape …)`. `deny` (`src/rules.ts`) бачить ребро як залежність `owner`, K102 стоїть на рядку конфігу й називає `via` та файл (рев'ю 06). `keylang baseline` дописує рядок-коментар походження для залежності шарів, яку дає лише конфіг.
- **Карта** — ребро в `calls` з коментарем `<!-- via: … -->`; `draft flow --mode algo` — `<!-- keylang:algo via preference <site> -->`.
- **Метаморфічність.** Конфіг, який фреймворк виконує, а keylang не прочитав (`frameworks: []`, XML не розбирається), — `skipped-file` модуля з `text: "framework:<name>"`: правило над модулем — `unverified`, крок без шляху — `unverified` «the framework may call it». Без цього вимкнення адаптера переводило `fail` правила в `ok` (ловив новий тест `tests/metamorphic.test.ts`). Фізичне видалення `di.xml` — інша програма, не менше інформації: plugin, якого жоден конфіг не реєструє, справді не викликається; тест перевіряє «не прочитано» й «не розбирається».
- **Мови.** `tests/binding-calls.test.ts`: TS-фікстура з прив'язкою, написаною вручну через тестовий адаптер (`generateMap(config, { adapters })`): дві області → два ребра, `static ok` через preference, `unverified` у `shape`, K102 на рядку `di.admin.json`; без прив'язки — `unverified`. Для TS без прив'язки дірка лишається «unresolved call `this.repo.save`» (як було), а не «call through an interface»: TS-тип може бути не інтерфейсом, і змінювати це поза обсягом.
- `EXTRACTOR_VERSION` → `m1.15` (PHP-екстрактор дає `CallFact.param` і `DeclFact.implements`).

