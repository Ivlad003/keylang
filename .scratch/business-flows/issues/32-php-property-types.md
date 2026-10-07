# 32: PHP: тип властивості з присвоєння в конструкторі та з docblock `@var`

**Status:** ready-for-agent

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

- [ ] фікстура: нетипізована властивість + ctor-присвоєння → `$this->x->m()` резолвиться в метод класу `X`; з інтерфейсом — дірка `call through an interface \`X\``
- [ ] фікстура: лише `@var` → ребро з `provenance: docblock`, у вердикті видно; суперечливі `@var` і ctor → дірка
- [ ] `metamorphic.test.ts`: видалення docblock переводить ok/fail лише в unverified
- [ ] бенч 03: нові числа в `results.md`

**Межі:** лише PHP; TS/Python аналог (JSDoc `@type`, Python-анотації в `__init__`) — окремо, якщо бенч покаже потребу.

## Comments
