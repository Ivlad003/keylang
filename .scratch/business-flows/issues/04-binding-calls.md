# 04: Граф: виклик через інтерфейс за прив'язкою з адаптера

**Status:** ready-for-agent

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

- [ ] юніт-фікстура: інтерфейс + preference → `static ok` кроку реалізації; без preference — `unverified … call through an interface`
- [ ] дві області (frontend/adminhtml) → два ребра з `scope`; `deny` бачить обидва
- [ ] цикл прив'язок не зависає (тест)
- [ ] `docs/snapshot.md`, `docs/semantics.md` оновлено; `metamorphic.test.ts`: видалення конфігу переводить ok/fail лише в unverified

**Межі:** механізм графа; читання конкретних конфігів — 06, 30, 31.

## Comments

### Рев'ю плану (2026-10-07)

**Передумова, якої не було в плані.** Прив'язка спрацьовує лише коли граф знає тип отримувача (`$this->orderManagement` → `OrderManagementInterface`). PHP-екстрактор бере тип властивості лише з типізованої `property_declaration` або promoted-параметра (`src/extract/php.ts:59, :310-316`). У Magento властивості **нетипізовані**: `private $orderManagement;` + docblock `@var OrderManagement` + присвоєння в конструкторі з типізованого параметра. Тому 8535 викликів у вибірці — `call through a local value`, 4092 — `of a function value`: тип отримувача невідомий **ще до** будь-яких прив'язок. Без тікета 32 цей тікет на Magento майже нічого не змінить.

**Blocked by:** додати 32.

**Також:** інтерфейс у PHP — `type` без членів (`php.ts:301-303`), тож `findMember` на інтерфейсі дає `null`. Прив'язку застосовувати на цьому місці: тип отримувача → `bindings.get(iface)` (за областю) → `findMember(impl, m)`. Виклик методу, якого в реалізації немає (метод лише в інтерфейсі, реалізація непрозора) — дірка з причиною `bound to opaque …`, не `fail`.
