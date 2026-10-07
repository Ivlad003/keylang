# 06: Magento: `di.xml` (preference, type arguments, virtualType) → прив'язки

**Status:** ready-for-agent

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

- [ ] фікстура з трьома областями й virtualType; ребра з `via` і `scope`
- [ ] бенч 03: частка розв'язаних викликів суттєво зростає, у `submitQuote` з'являються `OrderManagement::place`, `SubmitQuoteValidator::validateQuote`, `quoteRepository->save`
- [ ] `docs/` (новий розділ «Magento» у snapshot.md), `llm.txt`: як увімкнути

**Межі:** plugins — 07, events — 08, точки входу — 09.

## Comments

### Рев'ю плану (2026-10-07)

За рішенням автора `deny` бачить DI-ребра. На brownfield-Magento кожен модуль оголошує preference на інтерфейси інших, тож після цього тікета `check` на бенчі дасть сотні нових K102 на старих правилах. Це очікувано, але треба: (1) `keylang baseline` має вміти записати їх (перевірити, що baseline розрізняє `via`-ребра — інакше розширити формат рядком-коментарем походження); (2) у звіті K102 завжди називати `via` і файл конфігу, щоб людина бачила, що порушення — в `di.xml`, а не в PHP.
