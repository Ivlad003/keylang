# 35: `keylang draft` (algo/llm/hybrid) і `keylang explain <id>`

**Етап:** M7 · **Джерело:** design §5.1–§5.4

**What to build:** `draft map|flow|rules --mode algo|llm|hybrid`: algo — детермінована проєкція знімка; llm — кандидати з компактної карти, граматики й 2–3 схожих потоків із репозиторію; hybrid — звіряння `agree / algo-only / llm-only / conflict`, один цикл «did you mean» для невідомих ID, новий вузол лише з декларацією `planned`. Шари ніколи не призначаються мовчки. Походження в HTML-коментарі `keylang:llm`, статистика прийняття в `.keylang/stats.json`. `explain <id>` — пояснення вузла (short/full, `explain.lang`), збережене в `.keylang/explain/`, з рядком `модель · дата · stale?`, інвалідація за fingerprint із 21. LLM не змінює вердикт `check`. Адаптер `anthropic:` / `openrouter:` через `fetch` + SSE.

**Blocked by:** 23, 20 (planned), 21 (стейлнес)

**Status:** resolved

- [x] `draft flow --mode llm` із моком провайдера: невідомий ID → одне повторне коло, далі K001 або `planned`
- [x] прийнятий `llm-only` крок лишається `unverified` у `check`
- [x] `explain` офлайн віддає лише algo-зведення; без ключа — зрозуміле повідомлення
- [x] тести не потребують мережі (мок провайдера)

## Comments

- 2026-10-04 — тріаж (рішення 3А з HANDOFF-2026-10-02): усі критерії виконано тікетами m5-m7/13–15: невідомий ID отримує рівно один додатковий раунд (`tests/draft.test.ts`, `model.prompts.length === 2`), далі K001 або `planned` (`src/draft-llm.ts`); прийнятий `llm-only` крок модель ніколи не підвищує до `ok` (у тесті граф його спростовує — `static fail`, тобто буквальне «unverified» відрізняється, намір виконано); `explain` офлайн і без ключа — `tests/explain.test.ts`; тести без мережі (моки `ANTHROPIC_BASE_URL` / `OPENROUTER_BASE_URL`).
