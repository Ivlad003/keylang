# 23: Додати LLM/hybrid до чернетки потоку та інтегрувати Ctrl+Space

**What to build:** модель створює чернетку з видимим контекстом, яку можна скасувати; пізня відповідь не змінює інший файл.
**Blocked by:** [22 — algo draft і proposals](22-algorithmic-flow-draft.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A12, A22–A24.

## З чого почати

Знайти `LlmClient.complete`, `anthropicComplete`, `openrouterComplete`, `draftFlowWithModel`, `Assist.agentDraft`, `contextPack`, `ghostSoon`. Нині complete має timeout, але не caller AbortSignal.

## Кроки й рішення

1. Розширити complete необов'язковими options із signal; старі callers без options працюють. Об'єднати зовнішній abort і timeout через підтримуваний мінімальним Node API, прибираючи listener-и.
2. Явне скасування відрізняти від timeout/provider error. Прокинути його в Anthropic SDK і OpenRouter fetch/SSE; cancelled не називати timeout і не зберігати уривок відповіді.
3. Додати llm/hybrid до flow operation через чинний `draftFlowWithModel`; зберегти agree/conflict/llm-only та unknown/dropped notes.
4. Без агента hybrid має видимий algo-fallback, llm — помилку. `Ctrl+Space` у view/read зберігає вимогу агента та поточного flow із trigger; edit лишається completion.
5. Для TUI передати frozen context pack F4 і первісну ціль. Не включати випадково відкритий пізніше файл у промпт/результат.
6. Під час явної операції не запускати нові ghost-запити; чинні ghost suggestions застосовуються лише за збігу spot/version.
7. Перед proposal-write перевірити target/proposal/input freshness, canceled state та версію буфера; при зміні лише фокуса можна зберегти proposal без відкриття MERGE.

## Перевірки

- Локальні mocks обох провайдерів: success, завислий stream, timeout і явний Cancel дають різні правильні стани.
- Затримана відповідь + інший файл → proposal для первісної цілі, фокус не викрадено.
- Зміна target або поява чужої proposal → нічого не перезаписано; canceled не пише навіть stats.
- Ctrl+Space view vs edit; hybrid без agent; F4 exclusions потрапляють у frozen context.

## Приймання

- [x] UI реагує під час запиту; ресурси abort/stream очищаються.
- [x] Existing CLI/model callers без signal не зламано.
- [x] Модель не створює підтверджених ребер або нового «зеленого» вердикту.

**Межі:** не міняти протокол providers чи запускати зовнішній харнес.
**Validation:** `npm run typecheck`, `npm test`; тільки локальні mocks, без реальних ключів.

## Result

LLM/hybrid чернетка потоку — та сама операція `draft-flow`, що й algo з 22: CLI `draft flow --mode llm|hybrid` — принтер над нею, у TUI — рядок `mode` форми та `Ctrl+Space` у перегляді; справжній Cancel доходить до провайдера.

- **`src/llm.ts`** — `LlmCallOptions { signal? }`, `complete(request, options?)`; `callSignal(timeout, outer)` — один `AbortController` для дедлайну й сигналу викликача, що фіксує першу причину; `dispose` прибирає таймер і listener у `finally`. `LlmCancelled` (`<provider>: cancelled`) — не тайм-аут і не помилка провайдера; для OpenRouter уривок SSE після abort відкидається. Виклики без options — як раніше.
- **`src/draft-llm.ts`** — `draftFlowWithModel(…, context?, options = {})` передає signal в обидва раунди.
- **`src/operations.ts`** — `DraftFlowRequest.mode?: algo|llm|hybrid` (типово algo), `context?: string`; `DraftFlowPayload` + `mode`, `model: DraftModelInfo | null` (`agent`, `counts`, `unknown`, `rounds`, `dropped`), `fallback`, `statsError`; `CommitGate = void | { refused }` — відповідь `beforeCommit`. `runDraftFlow`: аналіз → trigger → `sourceInputs` → algo → `modelSetup` (llm без моделі — 2 `draft --mode llm: …`; hybrid — algo з `fallback`) → **до моделі** базис цілі/пропозиції (`flowCandidate` від algo) і для proposal: проблема цілі 2, сховище 2, `refuse` + pending 1 → `modelDraft` (Cancel → cancelled/null; помилка → 2) → кандидат `withFlow(basis.before, draft)` → preview 0 → `beforeCommit` (відмова → 1) → повторна перевірка цілі, пропозиції, `keylang.json` і джерел знімка (`sourceInputProblems`, 1) → `writeProposal(…, expected)` → stats лише для модельної пропозиції (помилка stats — попередження). Примітки (fallback, unknown, dropped) — `warning`-повідомлення з текстами CLI.
- **`src/cli.ts`** — `draftFlowPrinter` для всіх режимів (warnings → stderr `keylang: …`); старий LLM-шлях `cmdDraft` прибрано.
- **`src/tui/background.ts`, `operation-worker.ts`** — `commit` несе `refused`; синхронна чи Promise-відповідь `beforeCommit`.
- **`src/tui/app.ts`** — форма: рядок `mode` (`←→` algo/hybrid/llm; типово hybrid за `agent`, інакше algo), примітки режиму, llm без `agent` — відмова форми (поле mode); для модельного режиму — `contextText` пакета F4 на момент Enter. `draftAtCursor` (Ctrl+Space у view замість `Assist.agentDraft`): ті самі попередні перевірки й повідомлення, `llmClient` (нема моделі — `agent: …`, без запуску), запит hybrid/proposal/refuse з `into` = файл і замороженим контекстом, дія запису `agent-draft`. `commitGate`: буфер цілі з незбереженими правками → `refused`. `afterDraft`: примітки моделі; повідомлення `agent: …` для Ctrl+Space (як раніше). `startOperation` → `assist.suspendGhost()`.
- **`src/tui/assist.ts`** — `agentDraft` і запис пропозицій прибрано; `suspendGhost()`, `ghostSoon`/таймер/відповідь не діють під час операції.
- **`src/tui/view.ts`, `actions.ts`, `state.ts`** — `DraftForm.mode`; мітки `draft flow <t> --mode <m>`, `· <mode> ·` у списку F6, «Ctrl+Space: the agent's flow draft»; звіт F6: `Draft flow · <mode>[ (hybrid without a model)]`, `drafted by <agent> in N round(s)…`, «statuses are provenance, not evidence»; назва дії «Draft flow: from the code's calls or the model (algo, hybrid, llm)», aliases `draft --mode hybrid|llm`.
- **`docs/tools.md`** — Ctrl+Space через операцію, ghost під час операції, абзац «Чернетка потоку з моделлю (llm, hybrid)».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md` і `map-explained/README.md`; WIP `extract.md` байтово ті самі (sha1 файлів і sha1 diff до/після), не закомічено.

Тести:
- `tests/draft.test.ts` (+2): (1) `llmClient` з локальними mocks обох провайдерів: success без options; завислий запит/стрім + abort → `LlmCancelled`, сервер бачить закрите з'єднання; abort до виклику → `LlmCancelled`; дедлайн 300 мс → тайм-аут, не cancelled. (2) `runOperation` у процесі: Cancel під час відповіді → cancelled/null, ні пропозиції, ні stats, з'єднання закрито; hybrid → `3 agree, 1 algo-only`, steps, контекст у промпті, пропозиція = `candidate.text`, stats; preview не пише stats; змінене джерело під час відповіді → failed 1 з `src/domain/order.ts: changed on disk while the draft was computed`.
- `tests/tui.test.ts` (+4, хелпери `heldModel`, `draftCounts`; `draftForm` отримав `mode`): (1) форма hybrid: виключений у F4 буфер не йде в промпт, вузол іде; під час запиту редагування й новий елемент потоку не роблять ghost-запиту; відкрито інший файл → пропозиція для первісної цілі, фокус лишився, MERGE не відкрито, `waits`, stats 3 agree, F6 з режимом/моделлю. (2) Cancel з палітри під час запиту → cancelled/null, запит закрито, пізня відповідь нічого не змінює, дерево байтово те саме; Ctrl+Space в edit — не чернетка й не запит. (3) під час запиту: ціль з'явилася / чужа пропозиція / (Ctrl+Space) буфер цілі відредаговано → failed 1, нічого не перезаписано, лічильників немає. (4) без моделі: форма стартує algo, hybrid — примітка, llm — відмова до запуску; hybrid preview = CLI `--mode hybrid --print` і той самий stderr fallback; F6 `algo (hybrid without a model)`.
- Чинні Ctrl+Space/ghost тести (контекст у промпті, dropped, без моделі, чужа пропозиція, чернетка під час іншого MERGE) проходять без змін.

Перевірки: `npm run typecheck` ✓; `npm test` 536 tests, 535 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive`) з локальним mock на 15 сценаріях (hybrid/llm proposal і `--print`, unknown+dropped, `--name/--into`, HTTP 400, тайм-аут, pending замінюється, stats недоступний для запису, наявна ціль, невідомий trigger, llm/hybrid без ключа, hybrid без agent) — stdout, stderr, код, дерево: 14 SAME; 1 навмисна різниця: `--into` поза `keylang/` більше не робить запиту до моделі (вивід той самий).

Коміт: `9d7c88e` (Draft a flow with a model through the shared draft-flow operation, with a real Cancel); сторонній WIP не зачеплено.

Передано наступним задачам:
- 24/25/27/29/32/34: `LlmCallOptions.signal` + `LlmCancelled` — шаблон для модельних операцій (Cancel → cancelled/null, без stats); `modelSetup`-логіка llm/hybrid-fallback; `CommitGate` для сесійної відмови перед записом; `sourceInputProblems` як перевірка свіжості входів.
- 27: `draftFlowWithModel` з options/context; code-to-spec у CLI ще має власний LLM-цикл без signal.
- 35: `suspendGhost` — точка для політики ghost під час операцій/виходу.

Припущення й залишки:
- Ctrl+Space перевіряє облікові дані `llmClient` у сесії перед запуском; якщо ключ зникне між перевіркою й worker, hybrid тихо стане algo з приміткою у F6 (вікно — мілісекунди).
- У TUI Cancel зупиняє worker (запит закривається з ним); шлях через `signal` у `complete` перевірено для операції в процесі. Прогрес `asking <agent>` окремо не перевірено.
- Рядок `mode` форми типово hybrid лише за `agent` в останньому аналізі; без нього — algo (ефект як hybrid-fallback, але без примітки).
- Stats модельної чернетки не входять у `written` (метрики, як лічильники ghost).
- Перевірка свіжості джерел діє і для algo-пропозицій (у 22 не було).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `9d7c88e`; критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD.

