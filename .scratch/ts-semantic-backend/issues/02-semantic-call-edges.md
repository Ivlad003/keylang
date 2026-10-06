# 02: Резолвінг отримувачів через checker: ребра `semantic`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 01 <!-- 01 — завантаження typescript, поле manifest -->

**Verify:** `node --test tests/ts-semantic-calls.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

**Джерело:** spec §4.2, §6; [ADR 0020](../../../docs/adr/0020-typescript-semantic-backend.md) п. 2, 3, 5 і відкриті питання 6–7; design §4.2

**What to build:** Коли backend увімкнено (тікет 01), прохід після синтаксичного графа (`src/graph.ts`) розв'язує дірки викликів у файлах TS/JS знімка. Таблиця spec §4.2 каже, що з кожною стає.

- **Корені Program** — файли TS/JS знімка, опції — з тікета 01. CompilerHost читає ті самі тексти, що й екстрактор: диск або overlay буфера в LSP і TUI.
- **Шари.** Адаптер у `extract` повертає прості дані: позицію виклику та позицію й вид оголошення. Зіставлення з ID вузлів (за файлом і позицією імені, UTF-16 → кодові точки) і заміна дірок живуть у `graph`/`snapshot`.
- **Знімок.** `Provenance` стає `"syntactic" | "semantic"`, а `evidence.provenance` вердикту — ще й `"semantic"`, коли крок чи `deny` доведено через semantic-ребро. `EXTRACTOR_VERSION` зростає.
- **Лічильники.** `stats` отримує окремі лічильники для semantic-ребер і для викликів власних замикань.

- [ ] тести тікета — у новому файлі `tests/ts-semantic-calls.test.ts`: Verify запускає його окремо
- [ ] приклад з ADR 0020 (`openRepo()`, `repo.save()`, потік `ui.cli.main → app.orders.place → infra.db.OrderRepo.save`). З `typescript` крок дає `static ok`, а в `check --format json` — `provenance: "semantic"`. Без пакета рядок дослівно той, що зараз: ``static unverified … call through a local value `repo.save` …``
- [ ] `deny app infra`, коли виклик іде лише через виведений тип: з пакетом — `fail` з `provenance: "semantic"`, без пакета — `unverified` від дірки, як зараз
- [ ] виклик методу бібліотеки через виведене значення (`text.split(",").map(f)`) — не дірка, а зовнішній виклик. Коли клас репозиторію розширює тип бібліотеки (`class Bag extends Map`) і виклик іде через тип бібліотеки, дірка лишається
- [ ] виклик через параметр типу функції та через член інтерфейсу репозиторію лишається діркою, а причина називає тип
- [ ] виклик замикання тієї самої fn не дає ні ребра, ні запису в `coverage`, і рахується в `stats`. Виклик замикання іншої fn — дірка
- [ ] розв'язані синтаксичні ребра з пакетом і без пакета однакові: множина ребер `provenance: "syntactic"` не змінилася. Ребро `ambiguous` стає `semantic`, лише коли оголошення checker-а є серед `candidates`
- [ ] позиції: виклик після не-ASCII символів у тому самому рядку зіставляється правильно
- [ ] overlay: незбережена правка в LSP (`tests/lsp.test.ts`-подібний тест) дає semantic-ребро за текстом буфера, а не диска
- [ ] детермінізм: два `map` поспіль дають `.keylang/index.json`, однаковий з точністю до `generated`
- [ ] format.md §11: рядок `edges` (значення `provenance`, нові лічильники `stats`) і правила backend-а. Карту keylang перегенеровано, diff переглянуто, `check --strict` дає 0. Якщо semantic-ребра відкрили порушення власних правил keylang, рішення (код чи правила) записано в Notes

## Comments

### Notes

- 2026-10-06 (тікет написано): прототип-вимір (spec §3) каже, що на keylang дірок має лишитися близько 570 із 7 393, а нових ребер — до 256. Різкий відхил від цих чисел варто пояснити в Notes. Союзи й члени інтерфейсів з відомими реалізаціями лишаються дірками (відкрите питання 6), а ребра `closure` нічого не доводять (відкрите питання 7).
