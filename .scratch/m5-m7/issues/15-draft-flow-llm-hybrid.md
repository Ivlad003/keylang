# 15: `draft flow --mode llm|hybrid`: кандидати, одне коло «did you mean», звіряння

**Етап:** M7 · **Джерело:** design §5.1–§5.2; батьківський 35

**What to build:** llm отримує компактну карту, граматику й 2–3 схожі потоки з репозиторію; невідомий ID → одне повторне коло з найближчими ID, далі K001 або вимога `planned`. hybrid звіряє кроки: `agree`/`algo-only`/`llm-only`/`conflict`; походження — коментар `keylang:llm model=… status=…`; статистика прийняття в `.keylang/stats.json` (MERGE у TUI записує рішення).

**Blocked by:** 13, 14

**Status:** resolved

- [x] з мок-провайдером: невідомий ID → рівно одне повторне коло
- [x] прийнятий `llm-only` крок лишається `unverified` у `check`
- [x] коментар походження зберігається після `fmt`

## Answer

`src/draft-llm.ts` + `src/stats.ts`; `draft flow` за замовчуванням `hybrid` (без моделі — `algo` з приміткою; `--mode llm` без моделі — код 2). Одне коло «did you mean» для невідомих ID, звіряння `agree/llm-only/algo-only/conflict`, коментар походження на кожному кроці, `.keylang/stats.json`: `proposed` з draft, `accepted/rejected` з MERGE у TUI. Тести: `tests/draft.test.ts` (мок-модель: рівно 2 запити, точний текст пропозиції, статистика; прийнятий `llm-only` — `static fail absence`, тобто не ok — граф його спростовує), `tests/tui.test.ts` (рішення MERGE у stats).
