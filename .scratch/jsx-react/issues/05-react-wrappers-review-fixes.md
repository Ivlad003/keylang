# 05: Доробки після ревʼю тікета 02 (обгортки React)

**Джерело:** code review `9cdaefa..270da84` (тікет 02), осі Standards і Spec, 2026-10-01.

**What to build:** Поведінка обгорток з тікета 02 лишається тією ж. Ми прибираємо дублі в тестах, спрощуємо код збору прив'язок `react` у `src/extract/ts.ts` і документуємо межі розпізнавання. Ребра, декларації та знімки фікстур не змінюються. Виняток — `import type`, якщо перевірка покаже, що він відкриває обгортку: тоді це баг, і його треба виправити.

- `tests/analyzer.test.ts`: два майже однакові тести `memo` / `forwardRef` / `lazy` з `react` злити в один. Збережіть усі кейси обох тестів: `memo`, `forwardRef`, `lazy`, `React.memo` через default і namespace, `forwardRef as ref`, `let` → value, локальна `memo`, `observer`, `styled`, Nest `forwardRef`. Де це можна, перевіряйте публічний результат (`snapshot`: `exports.kind`, вузли, ребра), а не `.keylang/cache/facts.json`.
- `src/extract/ts.ts`:
  - дати ім'я типу `{ names: Set<string>; objects: Set<string> }`;
  - винести збір прив'язок `react` у чисту функцію від кореня файлу поруч із `extractIndexed`, замість лінивого замикання з мутабельним `let`;
  - `childForFieldName("object")` викликати один раз, без `!`;
  - прибрати коментар-посилання на «JSX ticket».
- Перевірити `import type React from "react"` і `import { type memo } from "react"`. Якщо такий імпорт відкриває обгортку — виправити, щоб лишалась value, і додати кейс у тест.
- `docs/format.md`, біля рядка про обгортки за імпортом: явно назвати межі. Не розгортаються:
  - `memo(CartImpl)`, коли аргумент — ідентифікатор, а не функція;
  - вкладене `memo(forwardRef(...))`;
  - `require("react")`.

  Обгортки впізнаються лише за імпортом з `react`, бо `react/jsx-runtime` їх не експортує.

**Blocked by:** 02, 03 <!-- 03 править той самий `src/extract/ts.ts` і предикат «callee з react»; уникаємо конфлікту злиття -->

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] Один тест обгорток замість двох, усі кейси обох збережено
- [ ] Іменований тип прив'язок `react`; збір прив'язок — окрема чиста функція; без `!` на `childForFieldName("object")`; коментар про тікет прибрано
- [ ] `import type` / `type memo` з `react` — value (тест)
- [ ] `docs/format.md` називає межі: `memo(Ident)`, вкладені обгортки, `require("react")`, лише `react`
- [ ] `tests/fixtures/repo.expected` не змінився; `EXTRACTOR_VERSION` не піднято; карта перегенерована через `node bin/keylang.js map`
- [ ] `npm run typecheck`, `npm test` зелені

## Comments

### Shift 1 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 3004235 in / 74785 out tokens, $0.0000, 34 turns
- Time: 16m 12s
- Verify: passed
- Outcome: resolved
- Landed: merged shiftwork/jsx-react-05 into master
