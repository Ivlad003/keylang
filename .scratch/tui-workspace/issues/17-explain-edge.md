# 17: Пояснювати ребра та невизначеність між двома ID

**What to build:** людина обирає два ID й бачить конкретні докази залежності або причину відсутності підтвердження.
**Blocked by:** [15 — check operation і звіти](15-full-check-options.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A20.

## З чого почати

Знайти `explainEdge`, snapshot edges/unresolved, lookup/suggest ID та переходи до кодових spans. Зберегти обидва напрямки пошуку й порядок CLI.

## Кроки

1. Виділити предметний результат explain-edge зі CLI-обробника: edges, unresolved, coverage conclusion, unknown-ID error.
2. Додати форму двох ID з явним вибором; ID під курсором заповнює лише перше поле.
3. Виконувати над свіжим збереженим analysis у worker після save-barrier.
4. Показати direction, kind, resolution/provenance, file/span, snippet і ambiguous candidates. Enter відкриває evidence в коді.
5. Для відсутніх ребер відрізняти complete coverage від unresolved; не показувати доведене «немає залежності», якщо покриття неповне.
6. CLI використовує цей самий предметний результат і чинний текстовий formatter.

## Перевірки

- Ребра A→B і B→A: обидва напрямки й стабільний порядок як CLI.
- Ребер немає, покриття повне: відповідний висновок без вигаданих записів.
- Нерозв'язаний виклик усередині A: причина видима, не порожній complete.
- Невідомий хвіст під відомим модулем: код 2 і suggestion за чинним контрактом.

## Приймання

- [x] Звіт читається й навігується без shell.
- [x] Немає власного графа TUI або виведення ребер із тексту карти.
- [x] Операція нічого не записує.

**Межі:** не додавати LLM-пояснення ребер.
**Validation:** `npm run typecheck`, `npm test`.

## Result

`check --explain-edge` перенесено зі `cmdCheck` у спільну read-only операцію `explain-edge`; CLI — принтер над нею; у TUI — форма двох ID у палітрі та звіт у F6 із переходами в код.

- **`src/explain-edge.ts`** (новий, шар `features` у `keylang.json`) — чисті `edgeIdKnown(snapshot, id)` (вузол або предок вузлів; невідомий хвіст під відомим модулем — ні), `explainEdge(snapshot, from, to)` → `{ from, to, edges: { direction: forward|backward, edge }[], holes, conclusion: edges|complete|unresolved }` (сортування й фільтр дослівно з CLI: спершу `a → b`, далі вид, файл, рядок, колонка, source; holes лише без ребер), `edgeLine`, `holeLine`, `edgeExplanationLines` — рядки stdout CLI.
- **`src/operations.ts`** — `ExplainEdgeRequest { kind: "explain-edge", root, from, to }`, `ExplainEdgePayload = EdgeExplanation & { snapshotId, lines }`; `runExplainEdge`: `analyze({ root, specs: [] })` (без кешу фактів), далі `no snapshot…` / `unknown id \`x\`` — failed 2; для невідомого ID друге повідомлення `info` `did you mean \`y\`?` (з `analysis.index.suggest`), CLI його не друкує. Успіх — код 0 для всіх трьох висновків. `runCheck` тепер викликає `analyzeSaved = context.analyze ?? analyze` (іменований hook default — інакше статичний доказ flow `check` не доходив до `analyze`, бо `cmdCheck` більше не викликає його напряму).
- **`src/cli.ts`** — гілка `--explain-edge`: попередні перевірки без змін (`--format`, `--static`, `--since`, `--changed`), кількість ID — у CLI; при неправильній кількості спершу `loadConfig`, щоб зламаний `keylang.json` звітувався першим, як раніше; далі операція, `payload.lines` у stdout, помилка — `keylang: <messages[0]>`, 2. Стара `explainEdge` видалена.
- **`src/tui/actions.ts`** — дія `explain-edge` «Check: explain the edge between two ids» (група Check; aliases `explain edge`, `check --explain-edge`, `edge`, `dependency evidence`, `why depends`, `between ids`); недоступна в MERGE і під час іншої операції.
- **`src/tui/state.ts`** — `Prompt.kind "explain-edge"`, `Prompt.edge { from, to }`.
- **`src/tui/app.ts`** — форма: рядки from / to / run; ID під курсором (`idAtCursor`) заповнює лише from і вибирає to; набір і Backspace редагують вибраний рядок (курсор `▏`); примітка — чи є ID у поточному знімку сесії й `did you mean` (лише підказка: операція читає диск заново); Enter з будь-якого рядка, порожній ID — відмова у формі з переходом на нього. `requestOperation`: крок збереження лише для dirty `keylang.json`, specs не зберігаються. Операція йде у worker (не-doctor kind). `recordGaps` → `edgeItems` (ребра або holes), Tab/стрілки/Enter відкривають позицію в read-only viewer; ребро без файла — «no position in the code». Запис стає outdated при іншому snapshot (`adopt`).
- **`src/tui/view.ts`** — `operationLabel` `check --explain-edge a b`, мітка `… · a ↔ b`, підсумок `N edge(s)` / `no edge, coverage complete` / `no confirmed edge, N unresolved` · code; звіт F6: `Explain edge · read-only, nothing written · saved code · snapshot`, порядок напрямків, `→`/`←` рядки CLI, `ambiguous: one of …` окремим рядком, для complete — `absence proven: no edge either way, nothing unresolved in a`, для unresolved — `not proven absent: N unresolved construct(s) in a could form one` + конструкції; failed — повідомлення (включно з підказкою); рядок статусу форми `explain edge: a ↔ b`, заголовок `edge between two ids`.
- **`keylang/flows/check.md`** — крок `operations.operations.runCheck` між `cmdCheck` і `analyze`; «twelve steps … 15 in all».
- **`docs/tools.md`** — абзац «Explain-edge у TUI»; прибрано «`--explain-edge` поки лише в CLI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; diff WIP `extract.md` байтово той самий до/після (sha1), не закомічено.
- **Тести** (`tests/tui.test.ts`, 3 нові; хелпери `cliEdge`, `edgeForm`, `edgePayload`):
  1. checkout + зворотний виклик `domain.order.again → buy`: курсор на кроці `application.purchase.buy` заповнює лише from, вибрано to; примітка `domain.ordr … did you mean domain.order?`, потім `in the current snapshot`; обидва напрямки, forward перед backward; `payload.lines` = stdout CLI, код 0, stderr порожній, повтор CLI стабільний; `treeBytes` незмінний; F6 — мітка, заголовок, `→ call … create`, `← call … src/domain/order.ts:4`; Tab → зворотне ребро → Enter відкриває `src/domain/order.ts:4` у viewer, Esc повертає.
  2. `main.a`/`main.b`: complete = CLI `no edge, coverage complete`, F6 `absence proven`; після запису `later(cb)` на диск (сесійний знімок старий) — unresolved, hole `src/a.ts:2:47` = CLI дослівно, F6 `not proven absent`, без `absence proven`; Enter відкриває `src/a.ts:2`; нічого не записано.
  3. Невідомий хвіст `presentation.terminal.checkot`: failed 2, messages = [error `unknown id …`, info `did you mean \`presentation.terminal.checkout\`?`]; CLI — 2, stdout порожній, stderr лише `keylang: unknown id …`; другий ID (`domain.order.nope`) — те саме через `runOperation` і CLI; dirty spec не відкриває крок збереження й лишається dirty; F6 показує помилку й підказку; порожній from — відмова у формі; диск незмінний.
  - CLI байтова ідентичність звірена вручну зі збіркою HEAD (`git archive`) на fixtures/repo, малому репо, без sources, без конфігу, зі зламаним конфігом і на самому keylang (`cli operations`, `operations tui`, `tui.app operations`, `features map`): stdout, stderr і коди однакові в усіх випадках, включно з неправильною кількістю ID.

Перевірки: `npm run typecheck` ✓; `npm test` 521 tests, 520 pass / 0 fail / 1 skipped ✓ (перший прогін — 1 fail: in-repo flow `check`, static `map.analyze.analyze` unverified, бо `cmdCheck` більше не викликає `analyze`; виправлено кроком `runCheck` у flow та іменованим hook default, повторний прогін зелений); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓.

Коміт: `54eb4f4` (Explain an edge through a shared explain-edge operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 18: `ExplainEdgePayload` (`edges`, `holes`, `conclusion`, `lines`) готовий до експорту; окремого JSON-формату для `--explain-edge` у CLI немає й не додавався.
- 37: дія `explain-edge` у каталозі; форма й F6 на вузькому екрані обрізають довгі рядки ребер (повний текст — у рядку повідомлення при виборі).

Припущення й залишки:
- «Suggestion за чинним контрактом»: чинний CLI для `--explain-edge` підказки не друкує; щоб не змінювати stderr, підказка — окреме `info`-повідомлення операції, видиме в TUI (F6 і примітка форми), але не в CLI.
- Висновок complete, як у CLI, враховує лише нерозв'язані конструкції в `from`; TUI формулює це саме так («nothing unresolved in a»), не як глобальне «залежності немає».
- Кількість ID перевіряє CLI (у типізованому запиті її немає); зламаний конфіг і далі звітується першим.
- Ambiguous-кандидати показано окремим рядком, але окремої фікстури з ambiguous-ребром у тестах TUI немає (рядок CLI з `[…]` покривається тим самим `edgeLine`).
- Крок збереження для dirty `keylang.json` окремим тестом не покрито (той самий шлях `withSavedInputs`, що в baseline).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `54eb4f4`.
