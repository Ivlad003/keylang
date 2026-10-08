# 40: PHP: типи локальних значень і члени базових класів поза аналізом — до цілі ≥ 60 % розв'язаних викликів

**Status:** ready-for-agent

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

- [ ] тести на кожне джерело типу (new, return type, @return, inline @var, foreach з Foo[], instanceof, ланцюжок, конфлікт присвоєнь → дірка), на member lookup у outside-базі
- [ ] `tests/metamorphic.test.ts`: видалення docblock/outside-файла переводить ok/fail лише в unverified
- [ ] бенч Magento: частка розв'язаних викликів ≥ 60 % або задокументований розрив з причинами
- [ ] `docs/snapshot.md` (PHP), `docs/semantics.md`

**Межі:** лише PHP; аналоги для TS/Python — окремо, якщо знадобиться.

## Comments
