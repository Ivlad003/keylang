# 16: `draft map|rules`: пропозиції шарів і правил без мовчазного призначення

**Етап:** M7 · **Джерело:** design §5.1 п.4; батьківський 35

**What to build:** `draft map` пропонує розкладку шарів як diff `keylang.json`, `draft rules` — правила з наявних ребер (algo) або з LLM (llm/hybrid). Нічого не застосовується без підтвердження.

**Blocked by:** 15

**Status:** resolved

- [x] `draft map --mode algo` не змінює `keylang.json`, лише друкує/пише пропозицію
- [x] `draft rules --mode algo` дає `allow`, що проходять `check` на поточному коді

## Answer

`draft rules --mode algo` (`draftRules` у `src/draft.ts`): `layers` у топологічному порядку фактичних залежностей шарів (за циклу між шарами — `deny` для односпрямованих пар) і `no-cycles`, якщо циклів модулів немає; пропозиція для `<dir>/rules.md`. Відхилення від критерію: замість `allow` — `layers`, бо `allow` у мові лише знімає K101 і сам нічого не стверджує. `draft map` друкує вгаданий `keylang.json` і нічого не пише. Тести `tests/draft.test.ts`. Режими llm/hybrid для map/rules винесено в тікет 29.
