# 05: Літеральні `import()` / `require()` всередині функцій стають ребрами `import`

**Етап:** M1.1 · **Джерело:** design §3.3 «Які залежності бачать правила», review RV05 (A)

**What to build:** Екстрактор TS/JS збирає літеральні `import("…")` і `require("…")` з усього дерева файла, не лише з верхнього рівня та `const x = require()`. Такі ребра потрапляють у знімок як `import` із позицією виклику; `map` показує залежність модуля; `deny`/`layers`/`allow` їх бачать. Обчислюваний specifier зберігається як непідтримана конструкція в покритті з позицією.

**Blocked by:** 04 (знімок)

**Status:** resolved

- [x] відтворення RV05 A (`await import("../infrastructure/io.ts")` у доменній функції + `deny domain infrastructure`): `map`, `check` → K102, код 1
- [x] `import(\`./${name}.ts\`)` не створює ребра, а фіксується в покритті з причиною «computed specifier» і позицією
- [x] карта keylang після перегенерації: diff містить лише нові залежності, якщо такі є

## Answer

Літеральні `import()`/`require()` у функціях — ребра `import`; обчислюваний specifier — `coverage` `computed specifier`. Тести: `a literal import() inside a function is a denied dependency`, `a computed import specifier is coverage, not an edge`; проба бенчмарку `deny-dynamic`.
