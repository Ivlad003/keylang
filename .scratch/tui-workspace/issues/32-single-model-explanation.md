# 32: Створювати short/full/brief пояснення одного вузла

**What to build:** користувач явно просить пояснення моделі або отримує свіжий кеш, бачить походження та збережений результат.
**Blocked by:** [23 — abortable LLM](23-model-flow-and-cancellation.md), [31 — explain-звіти](31-offline-explanations.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A16, A22–A24.

## З чого почати

Знайти LLM-гілку `cmdExplain`, `explanationRequest`, `currentBaseline`, `briefText`, `writeExplanation`, `unknownIds`. Зберегти пріоритет і параметри чинного кешу.

## Кроки

1. Форма: ID, detail short/full/brief; defaults із config.explain. Language та agent видимі, змінюються через конфіг, не новий непогоджений формат.
2. Після save-barrier зчитати snapshot та збережене пояснення. Якщо fresh із тими самими detail/lang — повернути кеш без запиту й запису.
3. Якщо агент недоступний, зберегти чинний CLI-контракт одиночного explain: офлайн-зведення/наявний кеш із явним повідомленням, а не вигадане пояснення. В UI до запуску показати причину недоступності нового запиту.
4. Для нового запиту зафіксувати input identity й closure; після відповіді повторно перевірити джерела й expected saved explanation перед commit.
5. Brief скоротити чинним `briefText`; зберегти model/date/lang/detail/closure. Unknown IDs позначити, не створювати вузли.
6. Після запису оновити readings пояснення та in-memory explained map. Markdown-карту не записувати автоматично — це окрема Map-дія.

## Перевірки

- Fresh cache → нуль HTTP-запитів; stale/detail/lang mismatch → один mock-запит.
- Timeout, empty answer, SSE-error, Cancel → попереднє збережене пояснення незмінне.
- Source або stored answer змінився під час очікування → old candidate не затирає нове.
- Кожний detail відповідає CLI, пояснення не змінює check findings.

## Приймання

- [x] Мережевий запит тільки через явну дію, офлайн `e` не змінено.
- [x] Статус кешу й походження видимі.
- [x] Карта й baseline не перезаписуються разом із поясненням.

**Межі:** немає масової обробки чи автоматичного виклику LLM з F5.
**Validation:** `npm run typecheck`, `npm test`; локальні provider mocks.

## Result

`keylang explain <id> --llm [--full|--brief]` перенесено в спільну операцію `explain-llm` (у `WRITING_KINDS`); CLI — принтер над нею; у TUI — форма «Explain with the model» у палітрі, звіт F6 із походженням і місцями.

- **`src/operations.ts`** — `ExplainLlmRequest { kind: "explain-llm", root, id, detail? }` (lang і agent — лише з `keylang.json`); `ExplainLlmPayload { id, summary, detail, lang, agent, source: cache|model|offline, reason: missing|stale|lang|detail|null, unavailable, previous, answer, written, refused, error, links, snapshotId, text }`. `runExplainLlm`: аналіз збережених файлів (`withoutEvidence`) → невідомий ID 2 з повідомленням CLI (примітка сховища 0.1 — warning перед ним; код діагностики — 2, його довідка офлайн) → свіжа відповідь того самого detail/lang — completed 0 без запиту й запису → немає моделі/ключа — completed 0, warning `<missing>; showing what the snapshot says`, stdout = зведення + збережена відповідь → фіксація `sourceInputs` (keylang.json + джерела), `specHashes`, байтів збереженого файла → `complete(…, { signal })` (Cancel/`LlmCancelled` → cancelled/null; помилка/тайм-аут/SSE → 2 з payload, `previous` незмінний; порожній текст після `briefText`/trim → 2) → `beforeCommit({ targets: [file] })` (відмова → 1) → `writeProblem(…, { under: <dir>/explain, expect: байти })` + `sourceInputProblems` + `specProblems` (будь-яка зміна → 1, нічого не записано, `… keeps the saved answer`) → `writeAtomic` (I/O → 2). `specProblems` отримав параметр subject.
- **`src/explain-offline.ts`** — `AnswerMiss`, `savedAnswerMiss(analysis, id, saved, lang, detail)`: спільне правило «кеш підходить» для операції й примітки форми.
- **`src/explanations.ts`** — `explainDir`/`explanationPath` приймають `Pick<Config, "dir">` (TUI називає ціль до аналізу).
- **`src/cli.ts`** — LLM-гілка `cmdExplain` → `runOperation({ kind: "explain-llm" })`: warnings → stderr `keylang: …`, payload.text → stdout; failed 2 → `keylang: <error>`, 2; відмова 1 → причини в stderr, 1. `--stale`, `--missing`, batch не чіпав (33/34). Прибрано непотрібні імпорти.
- **`src/tui/actions.ts`** — дія `explain-llm` «Explain with the model: one id, short, full or brief» (Check; aliases `explain --llm`, `ask the model`, `explain brief`, `explain --full` …); недоступна в MERGE і під час операції.
- **`src/tui/state.ts`** — `Prompt.explainModel?: { detail }` (форма `explain` з моделлю; не новий kind prompt).
- **`src/tui/app.ts`** — `openExplainModelPrompt`: ID під курсором, detail з `explain.detail`, `←→` short/full/brief; список — лише ID знімка; `llmClient` вантажиться лениво (`track`), до того примітка `checking the model…`. `explainModelNote` за аналізом сесії: `the saved short answer (agent · date) is fresh: read, no request, nothing written` / `no saved answer|the saved answer is stale|… is in uk|… is short · asks <agent> once, then saves <file>` / `no request can be made: <missing>; Enter shows the summary and the saved answer`, плюс `<detail> (←→) · lang · agent · keylang.json sets lang and agent`. Код діагностики у формі — відмова з підказкою на офлайн Explain. `requestOperation`: save-barrier для dirty буферів під `<dir>/` і `keylang.json` (крок називає файл пояснення). `commitGate`: dirty буфер цільового файла → refused. Outdated: `inputsChanged` і зміна snapshot. Places (`recordGaps`) з `links`. Після запису `endCommit` → `reanalyze`: `state.briefs` (навігація, пошук, explained map в пам'яті) і `e` бачать нове пояснення; Markdown-карта не пишеться. Підказка `e` без відповіді тепер називає і палітру, і CLI.
- **`src/tui/view.ts`** — мітки (`… · <detail> · <id>`, `explain <id> --llm[ --full|--brief]`), `explainLlmOutcome` (`the fresh saved short answer, no request` / `new short answer saved to <file>` / `no model, nothing asked; saved answer stale` / `refused, nothing written` / `the model failed, nothing written`), звіт F6: заголовок із detail/lang/agent/snapshot, причина запиту, warnings/errors, зведення, `new answer, saved` / `the model's answer, not written` + `saved answer, kept` / `saved answer, read`, unknown ids, places; заголовок форми `explain with the model · <detail>`.
- **`docs/tools.md`** — абзац «Пояснення моделлю в TUI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,map,operations,tui}.md`; WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +2; хелпери `explainModelForm`, `explainLlmRecord`, `outsideExplain`; моделі — `heldModel` і локальний SSE-сервер OpenRouter):
1. Форма: ID під курсором, примітка `no saved answer · asks … once, then saves keylang/explain/domain.order.create.md · short (←→) · lang en · agent …`, форма не робить запиту. Enter → один запит, completed 0, файл = заголовок (agent, сьогоднішня дата, поточний closure, lang, detail) + текст; `unknownIds = [domain.order.ghost]`, вузла не створено; F6 з походженням; `e` одразу показує нову відповідь `fresh`. Повтор → примітка `fresh: read, no request`, `source: cache`, 0 запитів, дерево незмінне; CLI `--llm` — той самий stdout і 0 запитів. brief (`→→`) → свій файл, текст обрізано `briefText`, `state.briefs` має його. full → `reason: detail`, один запит, CLI `--full` читає новий. Усього 3 запити; усе поза `keylang/explain/` (карта, baseline, специфікації, код, кеші) байтово незмінне; stdout `keylang check` той самий. Dirty spec → barrier `[checkout.md]`, Back нічого не пише й не питає.
2. Stale збережена відповідь: примітка `the saved answer is stale · asks …`; Cancel з палітри → cancelled/null, з'єднання закрито, пізня відповідь нічого не змінює; Cancel через signal у `runOperation` → cancelled; порожня відповідь → 2, `previous` = стара; тайм-аут 200 мс → 2 з повідомленням провайдера; SSE-помилка OpenRouter → 2 `openrouter: overloaded`; дерево незмінне. Зміна `src/domain/order.ts` під час відповіді → 1, `refused = [src/domain/order.ts: changed on disk while the explanation was computed]`, `… keeps the saved answer`; зміна самого файла пояснення під час відповіді → 1, новіший текст лишився. Невідомий ID → 2 з `did you mean`, без запиту. Без ключа — нова сесія: примітка з причиною до запуску; Enter → completed 0, `source: offline`, stdout = CLI, stderr CLI = warning операції, F6 `no model, nothing asked; saved answer stale`; запитів 0.

Перевірки: `npm run typecheck` ✓; `npm test` 559 tests, 558 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive`) з локальним mock на 13 сценаріях (missing, `--full` при short, fresh кеш, `--brief`, кеш brief, інша lang, stale, без ключа зі збереженою/без, HTTP 500, порожня відповідь, невідомий ID, `k104 --llm`) — stdout, stderr, код, кількість запитів і дерево: 13/13 SAME.

Коміт: `4bd42c7` (Explain one id with the model through a shared explain-llm operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 33: `--stale`/`--missing` (без `--llm`) лишилися в CLI; `savedAnswerMiss` — правило свіжості для списків.
- 34: batch (`runBriefs`) ще пише через `writeExplanation` без signal і без перевірки очікуваного вмісту; шаблон — `runExplainLlm` (фіксація входів, `beforeCommit`, `writeProblem` з `expect`, `writeAtomic`), `explainLlmOutcome`/F6-рядки.
- 35: Cancel під час commit одного файла не має проміжного стану (запис один); ghost призупинено загальним `startOperation`.
- 37: дія `explain-llm` у каталозі; довга примітка форми на вузькому екрані обрізається.

Припущення й залишки:
- Нова поведінка CLI: якщо під час очікування відповіді змінились `keylang.json`, джерела, специфікації чи сам файл пояснення — код 1, причини в stderr, нічого не записано (раніше перезаписувалось). У звичайних сценаріях вивід не змінився.
- Специфікації входять у перевірку свіжості (prompt бере потоки/правила з них), хоча closure від них не залежить.
- Примітка форми рахує кеш за аналізом сесії; операція вирішує за свіжим аналізом збережених файлів — після F5/збереження вони можуть розійтися, рішення операції головне.
- Доступність моделі у формі перевіряється в UI-потоці (`llmClient` з env процесу й `~/.config/keylang`), а запит робить worker зі своєю копією env: зміна env після старту worker не відображається.
- Detail у TUI завжди передається явно; CLI без прапорця бере `explain.detail`.
- Наново згенерована карта побудована поточним екстрактором робочого дерева (у `src/extract/ts.ts` є WIP користувача); `map --check` у робочому дереві проходить.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `4bd42c7`; критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD.
