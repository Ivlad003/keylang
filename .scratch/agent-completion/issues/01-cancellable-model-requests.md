# 01: Скасування запитів до моделі; ghost перериває застарілі

**Джерело:** plan.md крок 1; design/design-agent-cli.md §3 (скасування), review-agent-cli.md M8

**What to build:** Жоден запит до моделі не працює «в порожнечу». Коли користувач у TUI друкує далі, натискає `Esc`, перемикає буфер, відкриває MERGE або `Ctrl+Space`, поточний ghost-запит переривається, а не лише відкидається після відповіді. Те саме для чернетки агента (`agentDraft`) і при закритті TUI. Seam клієнта моделі отримує `signal` і `timeoutMs` у запиті та об'єкт опцій замість позиційних `env, home` — це підготовка до дочірніх CLI-процесів у 02. Переривання не звітується як таймаут і не показує повідомлення.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] `LlmRequest` приймає `signal` і `timeoutMs`; Anthropic та OpenRouter поєднують їх зі своїм таймаутом; перерваний запит кидає `AbortError`, який розпізнає експортований хелпер
- [x] усі виклики клієнта (CLI-команди, ghost, чернетка агента) переведені на об'єкт опцій з `root`
- [x] TUI: `Esc`, друк, зміна режиму/буфера, MERGE, `Ctrl+Space`, `close()` скасовують ghost і чернетку в польоті
- [x] e2e у `tests/tui.test.ts`: мок-модель із затримкою 2 с і лічильником перерваних з'єднань; після `Esc` рівно 1 перерваний запит, повідомлення порожнє, ghost не показано; наявний тест «два ghost-запити» лишається зеленим
- [x] `docs/tools.md` (абзац ghost у TUI) описує скасування
- [x] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/llm.ts`, `src/ghost.ts`, `src/tui/assist.ts`, `src/tui/app.ts`, `src/cli.ts` (місця виклику клієнта)

## Comments

- 2026-10-01 — аудит під shiftwork: частково реалізовано (9d7c88e та ін.). Є: `LlmClient.complete(request, { signal })` (`LlmCallOptions` у `src/llm.ts`), `callSignal` поєднує сигнал викликача з таймаутом для Anthropic і OpenRouter, скасування кидає `LlmCancelled` (не таймаут); сигнал прокинуто в операції explain-llm, explain-batch, draft-flow (Cancel у TUI, `AbortController` у `src/tui/app.ts`), spec-to-code llm. Лишилось: `timeoutMs` на запит; `llmClient(agent, env, home)` → об'єкт опцій з `root` в усіх місцях виклику (`src/operations.ts`, `src/tui/app.ts`, `src/tui/assist.ts`); ghost (`ghostSuggestions` у `src/ghost.ts`, `ghostSoon` у `src/tui/assist.ts`) досі не має сигналу — `Esc`/друк/зміна буфера/MERGE/`Ctrl+Space`/`close()` лише відкидають відповідь; e2e з лічильником перерваних з'єднань; абзац у `docs/tools.md`. Хелпер розпізнавання може бути `instanceof LlmCancelled` замість нового `AbortError` — не дублювати.

### Shift 1 — opencode opencode-go/glm-5.3 (medium)
- Ended: budget
- Usage: 1997857 in / 13919 out tokens, $1.5238, 33 turns
- Time: 9m 46s
- Verify: passed
- Outcome: new attempt
### Handoff — shift 1, opencode:opencode-go/glm-5.3 → opencode:opencode-go/deepseek-v4.1-flash, reason: budget.maxCostUsd ($1.5238 / $1.5)
- Last output:

```
Чернеток агента немає в `assist.ts` — я знайду, де відбувається чернетка на основі моделі в `app.ts`.
Тепер я подивлюся на місця виклику `draft-llm` та `spec-to-code` і на те, як операції викликають клієнта моделі.
Дозвольте мені переглянути `insert`, `complete`, `mouse` та відповідні частини `llmSetup`, а також `state.ts` для режимів.
```

### Shift 2 — opencode opencode-go/deepseek-v4.1-flash (low)
- Ended: budget
- Usage: 3733289 in / 29170 out tokens, $0.0999, 40 turns
- Time: 4m 52s (ticket total 14m 38s)
- Verify: failed at `npm run typecheck` (exit 2)

```

> keylang@0.4.0 typecheck
> tsc --noEmit

src/operations.ts(2462,17): error TS2554: Expected 2 arguments, but got 1.
src/operations.ts(2639,17): error TS2554: Expected 2 arguments, but got 1.
src/operations.ts(3896,17): error TS2554: Expected 2 arguments, but got 1.
src/operations.ts(4041,36): error TS2345: Argument of type '(agent: string | null, options: LlmClientOptions) => LlmSetup' is not assignable to parameter of type '(agent: string | null) => LlmSetup'.
  Target signature provides too few arguments. Expected 2 or more, but got 1.
src/tui/app.ts(2777,36): error TS2554: Expected 2 arguments, but got 1.
src/tui/app.ts(2848,36): error TS2554: Expected 2 arguments, but got 1.
src/tui/app.ts(3077,21): error TS2554: Expected 2 arguments, but got 1.
tests/draft.test.ts(677,71): error TS2554: Expected 2 arguments, but got 3.
```

- Outcome: new attempt
### Handoff — shift 2, opencode:opencode-go/deepseek-v4.1-flash → opencode:opencode-go/glm-5.3, reason: budget.maxTurns (40 / 40)
- Last output:

```
I'm in the main repo, but this ticket has its own worktree. Let me confirm the intended workspace and move the session there.
Now in the ticket worktree. Let me map the remaining work: call sites, ghost, draft, and tests.
Now I have a clear picture. Let me implement, starting with the `llm.ts` seam.
```

- Diff stat:

```
M src/ghost.ts
 M src/llm.ts
 M src/tui/assist.ts
src/ghost.ts      |  6 ++++--
 src/llm.ts        | 43 +++++++++++++++++++++++++++++++++----------
 src/tui/assist.ts | 42 ++++++++++++++++++++++++++++++++----------
 3 files changed, 69 insertions(+), 22 deletions(-)
```

- Verify failure: `npm run typecheck` (exit 2)

### Shift 3 — opencode opencode-go/glm-5.3 (low)
- Ended: budget
- Usage: 308890 in / 919 out tokens, $0.9413, 40 turns
- Time: 12m 40s (ticket total 27m 18s)
- Verify: passed
- Outcome: verify passed; review before landing

### Review — grok grok-4.7 (high), retried on opencode opencode-go/kimi-k3 (high)
- Verdict: none — review gave no verdict twice; review it by hand
- Time: 15m 16s
- Verify: passed
- Warning: grok-4.7: review ended without a verdict marker
- Warning: opencode-go/kimi-k3: review ended without a verdict marker
- Findings:

> Подивлюся, як обробляється скасування чернетки агента (Ctrl+Space draft) та чи всі виклики `llmClient` переведені.
> Перевірю, як draft-flow прокидає сигнал у запит моделі, і запущу verify gate.
> Логіка скасування на місці. Тепер запущу решту verify gate.
> Тести перевищили 10 хв — можливе зависання. Запущу окремо tui.test.ts, щоб локалізувати.
> `map --check` і `check` — зелені. Поки йде tui.test.ts, перегляну зміни карти.
> Фоновий процес зник без виводу — можливо, це були осиротілі процеси попереднього таймаута. Запущу повний `npm test` у фоні з явним редіректом.
> Поки йде тест, перевірю механіку скасування у worker (background.ts) — чи сигнал справді досягає операції.
> Механіка скасування повна. Перевірю прогрес тестів.
> Тести йдуть. Перевірю чистоту worktree та решту дрібниць.
> Усе, крім `npm test`, перевірено. Чекаю на завершення фонового прогону тестів.
> 
> **Проміжний стан рев'ю:**
> - ✅ `LlmRequest.signal`/`timeoutMs`, комбінування з таймаутом провайдера, `LlmCancelled` + експортований `isAborted`
> - ✅ усі виклики `llmClient` переведені на `{ root, env?, home? }` (operations, app, assist, draft.test)
> - ✅ ghost: `Esc`/друк/зміна буфера (`open`, `goBack`)/MERGE (`MergeSession.start`)/`Ctrl+Space` (через `editKey`→`ghostSoon`/`suspendGhost`)/`close()` — усі скасовують запит у польоті
> - ✅ чернетка агента: сигнал існував (Ctrl+X), тепер `close()` додатково абортить контролери через `OperationContext.controller` → `OperationWorker.close()`
> - ✅ e2e-тест з мок-моделлю 2 с і лічильником `aborted` додано; старий тест «два ghost-запити» залишено
> - ✅ `docs/tools.md` описує переривання; карта перегенерована
> - ✅ `npm run typecheck`, `map --check`, `check` — зелені
> - ⏳ `npm test` — у фоні

- Branch kept: shiftwork/agent-completion-01

### Resolved — 2026-10-04 (вручну, гілка `done/agent-completion-01`)
- Основа — `origin/wip/agent-completion-01` (переписано з нуля), перебазовано на `master`; `ad382d2` (shiftwork, поверх старого `c3ef9b7`) відкинуто: там `signal`/`timeoutMs` дублювалися в `LlmRequest` і `LlmCallOptions`, `isAborted` додатково ловив будь-який `AbortError`, зайве `OperationContext.controller`, а тест `Esc` читав лічильник без очікування (флейк 4/6).
- Відхилення від тексту критерію 1 (за аудитом 2026-10-01): `signal` і `timeoutMs` — в опціях виклику `complete(request, { signal, timeoutMs })`, не в `LlmRequest`; скасування — `LlmCancelled`, хелпер — `isCancelled`, без окремого `AbortError`.
- Знахідки ревʼю: тест `Esc` чекає `waitUntil(() => model.aborted === 1)`; повідомлення тайм-ауту називає `KEYLANG_LLM_TIMEOUT_MS` лише коли межею була змінна (ghost: `anthropic: no answer within 60000 ms`); у `docs/tools.md` записано, що `Esc` і друк чернетку агента не скасовують (лише Cancel операції і закриття сесії; `close()` зупиняє worker, тест «close() aborts the agent's flow draft in flight»).
- Перевірки: `npm run typecheck` 0; `npm test` 593 pass / 0 fail / 1 skip (whisper.cpp), ~22 хв під навантаженням; `map --check` 0 після `map` (diff — зсуви рядків і нові символи `llm.ts`/`assist.ts`); `check` 0 fail. Тести з таймінгом (`tests/tui.test.ts` ghost/Ctrl+Space/close/Cancel — 29, `tests/draft.test.ts` llm/Cancel — 4) — 5 прогонів поспіль, усі зелені.
