# Поля типів і проєкція в TypeScript

Рішення 2026-10-12 (власник): варіант «б» — структурована сигнатура типу як частина мови, а не вільний текст і не генерація агентом.

## 1. Навіщо

Намір `planned type` зараз має лише вільний підпис. З ним не можна ні перевірити реалізацію поле за полем, ні показати, як діаграма стає TypeScript-інтерфейсами («Студія», `.scratch/studio`). Поля роблять тип даних першокласним наміром: людина чи агент описує форму, `check` звіряє її з кодом, `keylang types` друкує інтерфейси.

## 2. Синтаксис

Поля — дочірні рядки `planned type`, як колонки під `table` (`docs/grammar.md`, `# system`):

```markdown
# flow checkout
- planned type orders.Order
  - id: string
  - total: Money
  - note?: string
  - items: OrderLine[]
- planned type orders.Money = { amount: number; currency: string }
- planned type orders.PaidOrder extends Order
  - paidAt: Date
```

- Рядок поля: `<name>[?]: <type…>`. `name` — ідентифікатор `[A-Za-z_$][A-Za-z0-9_$]*`; `?` одразу після імені — необов'язкове поле; `type` — решта рядка, не порожня, як вільний текст (як `text` сигнатури, через `renderTokens`).
- Вид вузла IR — `field`: `name` (ім'я), `label` `"?"` або `null`, `text` (тип).
- Поля дозволені лише під `planned type`. Під іншим `planned` вид і під будь-яким іншим вузлом рядок `x: T` лишається тим, чим був (K004 чи проза — як сьогодні).
- `planned type` з підписом, що починається з `=`, і з полями — K005 `arguments` («a type alias has no fields»). `extends …` з полями — дозволено.
- Некоректний рядок поля (немає `:`, порожній тип, ім'я не ідентифікатор) — K005 з новою причиною `field`.
- Повтор імені поля в одному типі — K002.
- `fmt`: канонічний рядок `- name?: type` (тип через `renderTokens`); ідемпотентно.
- Поле не є ID, не індексується й не резолвиться: як колонки, імена локальні.

## 3. SpecIR

`Planned` отримує `fields: PlannedField[] | null` (`null` — полів немає), де `PlannedField = { name, optional, type, line, col }`. `plannedDeclaration` (hover, explain) повертає поля теж. LSP hover показує поля.

## 4. Код: поля в знімку

- `DeclFact` (`src/extract/facts.ts`) отримує `fields?: TypeFieldFact[]`, `TypeFieldFact = { name, optional, type }`. Наявне PHP-поле `fields` (property → class) має інше значення — нове поле назви так, щоб не конфліктувати (наприклад `members`… уже зайняте; візьми `shape`).
- TS-екстрактор записує форму для: `interface` (property signatures; method signatures як `(params) => ret`), `type X = { … }` (object type literal), класів (публічні поля без значення-функції). Тип — зібраний текст анотації без зайвих пробілів; без анотації — поле не записується. Index signatures пропускаються.
- Python/Rust/PHP — поза обсягом (форма невідома = `undefined`).
- `SnapshotNode` для `type` отримує `shape?` з тим самим змістом. `EXTRACTOR_VERSION` підвищується. Карта (`keylang/map/*.md`) поля **не** пише — розмір карти не змінюється.
- `docs/snapshot.md` описує нове поле.

## 5. Перевірка

Коли `planned type` уже реалізовано (у знімку є тип з цим ID):
- поля плану порівнюються з `shape` коду: кожне поле плану має бути в коді з тим самим `optional` і тим самим типом за `normalizeSignature`. Зайві поля коду дозволені (код росте);
- збіг → K202, як сьогодні; розбіжність → K201 з першими відмінностями в повідомленні (`missing field note`, `field total: Money ≠ number`, `field note is optional in the plan`);
- форма коду невідома (`shape` немає) → порівнюється лише вид, а K202 каже, що поля не перевірено.

`docs/semantics.md` (розділ `planned`, K201/K202) і `src/explain.ts` описують нові правила.

## 6. Проєкція в TypeScript

Чиста функція `src/ts-projection.ts`: `projectTypes({spec, snapshot, ids?})` → `{text, items}`; `ids` обмежує вибір (інакше — усі `planned` специфікацій).

- `planned type` з полями → `export interface Order { id: string; … }` (по полю в рядку), `extends X` переходить у `interface Order extends X`.
- `planned type` з `= X` → `export type Order = X;`.
- `planned type` без підпису й полів → `export type Order = unknown;` з коментарем `// TODO: fields`.
- `planned fn a.b.f (x: T) → R` групуються в інтерфейс модуля-батька: `export interface B { f(x: T): R; }`. `→`/`->` — тип повернення; підпис лише з параметрів → `: unknown`; без підпису → `f(...args: unknown[]): unknown`.
- `planned module` → `export interface <Name> {}` з його planned fn.
- ID, що вже є в коді й мають TS-файл, → `import type { X } from "<відносний шлях>";` угорі (лише якщо їх називає `ids`).
- Ім'я інтерфейсу — останній сегмент ID у PascalCase. Над кожним — `/** <id> — <spec file>:<line> */`.
- Порядок — за ID; вивід байт-стабільний.

CLI: `keylang types [<flow|feature>…] [--out <file>] [--check]`. Без аргументів — усі `planned`; з іменами — `planned` тих потоків/фіч. `--out` пише файл, `--check` порівнює з файлом і нічого не пише (код 1 при відмінності). Коди: 0/1/2 за контрактом. `docs/cli.md`, `--help`, completions.

## 7. Поза обсягом

Перевірка полів не-`planned` типів карти; Python/Rust/PHP форма; генерація інтерфейсів для вже реалізованих типів (лише `import type`).
