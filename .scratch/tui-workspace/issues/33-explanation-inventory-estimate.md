# 33: Показувати missing/stale пояснення та dry-run оцінку

**What to build:** людина бачить, яким вузлам потрібні brief-и, і отримує оцінку обсягу майбутнього batch без запиту моделі.
**Blocked by:** [31 — офлайн explain](31-offline-explanations.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A17.

## З чого почати

Знайти `planBriefs`, `estimateTokens`, `explainedIds`, `readExplanation`, stale/list і batch-гілки `cmdExplain`. `--stale` список saved answers і `--stale --llm` план brief-ів — не один набір.

## Кроки

1. Додати shared read-only варіанти: список missing-brief candidates, список stale/gone explanations, batch-plan missing/stale з dry-run.
2. Форма явно показує вид списку/плану, optional limit і jobs; whole-positive validation як CLI, jobs default 4 для майбутнього batch.
3. Missing-plan включає outdated briefs за чинним алгоритмом, але виключає вузли з достатнім doc-comment/fresh brief.
4. Зберегти bottom-up waves для плану; показати counts fn/type, class/module, layer й приблизні input/output tokens.
5. Відсутні в snapshot saved IDs показати gone у відповідному stale-list, не намагатися генерувати для них.
6. F6-result має переходи до відомих вузлів; кнопка batch стане доступною після 34. Plan — immutable preview, не автоматичний дозвіл записати старі дані пізніше.

## Перевірки

- Fixture з doc-comment, fresh brief, stale brief, missing і gone: склади списків як CLI.
- Limit обмежує план до оцінки токенів; 0/дробове/не число відхиляються.
- Dry-run не робить HTTP, не створює stats/proposals/explain/cache.
- Порожній план показує zero-work, не помилку й не request до моделі.

## Приймання

- [x] Різниця stale inventory і stale brief-plan видима в UI.
- [x] Оцінка названа приблизною, не точною вартістю API.
- [x] CLI й TUI використовують той самий планувальник.

**Межі:** справжні batch-запити й записи — 34.
**Validation:** `npm run typecheck`, `npm test`.

## Result

`keylang explain --stale` і план `explain --missing|--stale [--limit] [--jobs] [--dry-run]` без `--llm` перенесено в спільну read-only операцію `explain-plan`; CLI — принтер над нею; у TUI — форма «Explanations to do» у палітрі та звіт F6 з переходами до вузлів. Batch `--llm` лишився в CLI (34).

- **`src/explain-inventory.ts`** (новий, шар `features` у `keylang.json`) — `DEFAULT_BRIEF_JOBS` (4), `positiveIntegerProblem(flag, text)` (текст помилки CLI для 0/дробового/не числа); `staleInventory(analysis)` → `{ entries: StaleExplanation[] { id, kind: answer|brief, state: stale|gone, date, file, again, place }, saved }` у порядку CLI; `staleInventoryText` — stdout `--stale` байт у байт; `briefPlan(analysis, { batch, limit, jobs, estimate })` над тим самим `planBriefs`/`estimateTokens` → `BriefPlan { batch, limit, jobs, candidates, plan[{ id, level, wave, reason: missing|stale, place }], counts, waves[{ level, ids }], estimate | null, skipped: { documented, fresh }, gone }` (limit ріже план до оцінки); `briefPlanText` — stdout списку або `--dry-run`.
- **`src/operations.ts`** — `ExplainPlanRequest` (`list: "stale-saved"` або `list: "briefs", batch, limit?, jobs?, estimate?`), `ExplainPlanPayload = (StaleInventory | BriefPlan) & { list, snapshotId, text }`; `runExplainPlan`: перевірка limit/jobs (failed 2 з повідомленням CLI) → `analyze({ withoutEvidence: true })` → примітка сховища 0.1 — warning → без snapshot для плану — failed 2 `no snapshot: explain --missing needs a repository with sources` (як CLI) → completed 0; порожній план — completed 0 `nothing to explain`. Не в `WRITING_KINDS`.
- **`src/cli.ts`** — `--stale` і план без `--llm` (також `--llm --dry-run`) → `explainPlanPrinter` над операцією; `positiveInteger` використовує `positiveIntegerProblem`, перевірка аргументів до аналізу, як раніше. Гілка `--llm` (runBriefs) без змін, крім `limit ?? Infinity`.
- **`src/tui/actions.ts`** — дія `explain-plan` «Explanations to do: stale saved answers, or a brief plan with a dry-run estimate» (Check; aliases `explain --stale`, `explain --missing`, `explain --dry-run`, `missing briefs`, `stale explanations`, `brief plan`, `dry run`, `estimate tokens`); недоступна в MERGE і під час операції.
- **`src/tui/state.ts`** — `Prompt.explainPlan?: ExplainPlanForm { list: stale-saved|missing|stale, limit, jobs }` (форма `explain`, як `explainModel` у 32).
- **`src/tui/app.ts`** — `openExplainPlanPrompt`/`refreshExplainPlanPrompt`/`changeExplainPlanList`/`submitExplainPlan`: рядки `list` (←→), для плану `limit` і `jobs` (текст як набрано, порожні — усі кандидати / 4), `run`; details пояснюють, чим stale-список відрізняється від stale brief-plan; примітка на `run` — команда CLI (`explain --missing --dry-run --limit 2 --jobs 2`). TUI завжди просить estimate для плану. Невалідні limit/jobs — форма лишається на полі, повідомлення `explain: <текст CLI>`, запуску немає. Save-barrier для dirty буферів під `<dir>/` і `keylang.json`. Outdated: snapshot і `inputsChanged`. `recordGaps` — вузли (код або planned-рядок), gone — без місця.
- **`src/tui/view.ts`** — мітки (`… · explain --stale`), `explainPlanLabel`, `explainPlanOutcome` (`2 stale, 2 gone of 5 saved explanation(s)` / `6 brief(s) planned, ~N in, ~M out tokens (approximate)` / `nothing to explain: zero work, no request`); звіт F6: для списку — заголовок `stale saved answers and briefs (keylang explain --stale)`, рядок «not the brief plan», записи stale з командою й місцем, gone з файлом і `not in the snapshot, not planned`; для плану — команда CLI, лічильники fn/type, class/module, layer, кількість хвиль, jobs, limit, `approximate tokens … not the API's count or cost`, пропущені (doc-comment, fresh brief), gone, «a preview, not a permission: the batch runs in the CLI … plans again», хвилі `── wave N · level · n ──` з `stale brief`/`no brief`; zero-work рядок. Tab/Enter відкриває код.
- **`docs/tools.md`** — абзац «Що пояснити в TUI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md` і `map-explained/README.md` (його diff у робочому дереві був лише застарілими лічильниками генератора після 32 — без WIP користувача; тепер закомічено). WIP `extract.md` байтово ті самі (sha1 і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +1; хелпери `explainPlanForm`, `explainPlanRecord`): fixture з doc-comment (`domain.order.create`), свіжим brief (`infrastructure.store.save`), stale brief і stale відповіддю (`application.purchase.buy`), missing (`presentation.terminal.checkout`), gone brief і gone відповіддю. Stale-список = stdout CLI `--stale`, 4 записи з kind/state/place, F6, Enter відкриває `src/application/purchase.ts:3`, gone — `no position in the code`. Missing-план = CLI `--missing --dry-run` і `--missing --llm --dry-run`; склад = CLI `--missing`; doc-comment/fresh/gone виключені; buy `stale`, checkout `missing`; хвилі fn/type → class/module → layer; jobs 4, skipped `{1,1}`, gone; F6 з приблизною оцінкою. Limit 2 / jobs 2 = CLI, план 2 з N, output 160, input менший. `0`, `1.5`, `abc` для limit і `0` для jobs — повідомлення = stderr CLI (код 2), форма на полі, записів немає; операція — failed 2. Stale brief-plan = лише buy, = CLI `--stale --dry-run` і `--stale --limit 5`, відрізняється від stale-списку. Порожній план — completed 0, `{0,0}`, = CLI, F6 zero work. Dirty spec → barrier, Back нічого не пише. Дерево байтово незмінне, нових файлів немає, запитів до моделі 0.

Перевірки: `npm run typecheck` ✓; `npm test` 560 tests, 559 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓ (до прогону тестів — 24 unverified через застарілий звіт тестів); порівняння CLI зі збіркою HEAD (`git archive`): 18 викликів (`--stale`, `--missing`, `--limit`, `--dry-run`, `--llm --dry-run`, `--stale --dry-run|--limit|--jobs`, невалідні limit/jobs, `--missing --stale`, `--missing x`, `--dry-run` без batch, `--stale x`, `--llm --jobs -1`) × 6 репозиторіїв (fixture explained, він же зі stale/gone відповідями й brief-ами і старим сховищем 0.1, tests/fixtures/repo, без джерел, `format: 99`, порожня тека) — stdout, stderr, код і дерево: 108/108 SAME.

Коміт: `c1de157` (List stale explanations and plan brief batches through a shared explain-plan operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 34: `briefPlan`/`BriefPlan` (waves, jobs, limit, reason) — вхід для batch; гілка `--llm` у `cmdExplainBatch` ще планує сама (`planBriefs`) і пише через `runBriefs`/`writeExplanation` без signal і expected-text. У F6 плану рядок «the batch runs in the CLI» — місце для кнопки batch. План — лише preview: batch має планувати заново на своєму аналізі.
- 37: дія `explain-plan` у каталозі; довгі рядки звіту F6 і details форми на вузькому екрані обрізаються.

Припущення й залишки:
- Один kind `explain-plan` з двома варіантами `list` замість трьох kinds: missing-список і missing-plan — одні дані (CLI без `--dry-run` друкує той самий план без оцінки).
- TUI для плану завжди рахує оцінку (`estimate: true`); payload.text тоді = stdout `--dry-run`, а склад плану видно в рядках F6.
- `skipped.fresh` рахує вузли без doc-comment зі свіжим brief-ом; `gone` у плані — brief-и, чий ID не в snapshot і не `planned` (`currentBaseline === null`), CLI їх не друкує.
- Cancel окремим тестом не перевірено (той самий шлях read-only kinds). Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `c1de157`; критерії приймання перевірено тестом TUI і порівнянням CLI з HEAD (108/108).
