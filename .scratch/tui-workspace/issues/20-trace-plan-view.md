# 20: Переглядати й експортувати план trace для потоку

**What to build:** людина обирає flow, бачить план інструментування й зберігає його JSON для зовнішнього адаптера.
**Blocked by:** [18 — export](18-export-operation-results.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A21.

## З чого почати

Знайти `cmdTracePlan`, `tracePlan`, опис схеми плану та тести Python/Rust adapter inputs. Список flow брати з поточних документів, а не з імен файлів.

## Кроки

1. Виділити shared trace-plan operation з flow name, root і read-only результатом чинного формату.
2. Форма: flow зі списку або явного вводу; значення під курсором — видимий default.
3. Використати save-barrier і свіжий snapshot у worker; повернути schemaVersion, snapshotId, flow, symbols із sha256.
4. У F6 показати summary й JSON; Enter на символі відкриває код. Export — через 18.
5. CLI друкує той самий JSON; не змінювати порядок символів або спосіб обчислення хешів.

## Перевірки

- Потік із trigger і вкладеними steps: symbols, positions і hashes збігаються з CLI.
- Невідомий flow: код 2, зрозуміла причина, нуль записів.
- Source змінено перед повтором: новий snapshot/hash, попередній звіт позначено outdated.
- Preview не створює trace-файлів; Export створює лише вибраний JSON.

## Приймання

- [x] План придатний для чинних адаптерів без перетворення.
- [x] Немає запуску тестів/інструментованої програми.
- [x] Відсутній або неповний доказ не стає підтвердженням виконання.

**Межі:** trace-runtime та assertion-граматика не входять.
**Validation:** `npm run typecheck`, `npm test`.

## Result

`keylang trace-plan` перенесено в спільну read-only операцію `trace-plan`; CLI — принтер над нею; у TUI — форма вибору потоку, звіт F6 із символами й JSON, export через 18.

- **`src/trace-plan.ts`** — `tracePlan` додатково повертає `omitted` (ID `trigger`/`step`, що не є fn знімка або не мають хеша файла); сам план, сортування за ID і хеші не змінені. Новий `tracePlanText(plan)` → stdout CLI (`JSON.stringify(plan, null, 2)` + `\n`), спільний для CLI, F6 і export.
- **`src/operations.ts`** — `TracePlanRequest { kind: "trace-plan", root, flow }`, `TracePlanPayload { plan, omitted, text }`; `runTracePlan`: порожня назва → failed 2 `trace-plan: a flow name is required`; `loadConfig(root)` + `tracePlan` (свіжий `generateMap` без `persist` — нічого не пише, навіть кешу фактів) у try → помилка (зокрема `no flow \`x\` under keylang/`, зламаний `keylang.json`) = failed 2 без payload; signal до/після → cancelled. Не в `WRITING_KINDS`. `ExportSource` += `{ kind: "trace-plan", plan }`, `exportText` рендерить записаний план (без повторного обчислення); новий `exportFormatOf(source)` (edge → human, trace-plan → json), ним користуються `runExport` і view.
- **`src/cli.ts`** — `cmdTracePlan` — принтер: `payload.text` → stdout, помилка — `keylang: <message>`, 2 (через чинний catch у `main`). Імпорт `tracePlan` прибрано. Байтову ідентичність stdout/stderr/кодів звірено зі збіркою HEAD (`git archive`): репозиторій (`check`, `tui`, невідомий `nope`, без назви), `examples/shop{,-fixed}` (немає потоку під `keylang/` → 2), `tests/fixtures/explained` (`checkout`), `tests/fixtures/spec-forms/valid` (`buy`), `keylang.json` з `format: 99` — усе SAME.
- **`src/tui/actions.ts`** — дія `trace-plan` «Trace plan: the functions of a flow to instrument» (група Check; aliases `trace-plan`, `trace plan`, `keylang trace-plan`, `instrument`, `trace adapter`, `flow trace`). `EXPORTABLE_KINDS` += `trace-plan`; причина `only a check, explain-edge, parse or trace-plan report is exported`.
- **`src/tui/state.ts`** — `Prompt.kind "trace-plan"`.
- **`src/tui/app.ts`** — форма: типове значення — потік секції під курсором (`flowAtCursor` за offset заголовків секцій); список — `analysis.spec.flows` поточних документів (з dirty-буферами), фільтр набраним текстом, точний збіг першим; Enter бере вибраний пункт, інакше набрану назву; примітка `<flow>[: not in the current documents] · a fresh snapshot of the saved code · writes nothing, runs nothing`. `requestOperation`: save-barrier для dirty-буферів під `<dir>/` і `keylang.json`. Outdated: `inputsChanged` і порівняння `plan.snapshotId` зі знімком нового аналізу. `recordGaps` — символи плану (Enter відкриває код, read-only viewer); у `scrollReport` ↑↓ вибирають символ, PgUp/PgDn прокручують JSON. Export: єдиний формат `json`, типовий шлях `.keylang/export/trace-plan.json`; `exportSourceOf` бере план із запису.
- **`src/tui/view.ts`** — мітка `… · <flow>`, `operationLabel` `trace-plan <flow>`, підсумок `N function(s) to instrument[, M id(s) left out] · code X`; звіт F6: `Trace plan · flow … · read-only, nothing written, nothing run · fresh snapshot <8> · schemaVersion 1`, примітка «a plan is no evidence…», рядок на символ `id  file:line:col  sha256 <12>`, `not in the plan (no function of the snapshot): …`, підказка, `── keylang trace-plan <flow> · stdout ──` і JSON; підказка заголовка `Tab symbols` / `Enter open symbol`; форма `trace-plan flow: `, `N flow(s): trace plan`.
- **`docs/tools.md`** — абзац «План trace у TUI»; у «Export звіту в TUI» — trace-plan серед звітів палітри.
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,map,operations,tui}.md`, `map-explained/README.md`; WIP `extract.md` байтово ті самі (sha1 і diff) до/після, не закомічено.
- **Тести** (`tests/tui.test.ts`, 2 нові; хелпери `tracePlanForm`, `tracePlanRecord`, `cliTracePlan`, `fileSha256`, фікстура `MIXED_FLOW`; оновлено текст причини в тесті export 18):
  1. Потік `checkout` (trigger + вкладені steps) і другий потік `mixed` з модулем і невідомим ID: форма показує `checkout` з-під курсора, список із файлом, примітку; порожній текст → обидва потоки; Esc — нуль записів. План: completed 0, written []; `payload.text` = stdout CLI байт у байт, `plan` = `JSON.parse(stdout)`, stderr CLI порожній, без ANSI; `snapshotId` = знімок сесії; 4 символи за ID, `domain.order.create` → `src/domain/order.ts:1`, кожен `sha256` = sha256 файла на диску; `treeBytes` незмінний (ні trace, ні кешу). `mixed`: у плані лише trigger, `omitted = [domain.order, domain.order.nope]`, F6 називає їх і «a plan is no evidence». F6 checkout: summary, рядок символу з col і хешем, JSON; Tab → повідомлення `… · Enter opens src/domain/order.ts:1`, Enter відкриває код на рядку 1. Export: `.keylang/export/trace-plan.json`, формати лише `["json"]`, файл = stdout CLI, новий файл рівно один, решта байтів незмінна, прихованого плану немає.
  2. Невідомий потік `zzz`: порожній список, примітка `not in the current documents`; failed 2, payload null, written []; CLI 2, порожній stdout, stderr = `keylang: <те саме повідомлення>` (`no flow \`zzz\` under keylang/`), нуль записів. Зміна `src/domain/order.ts` на диску + F5 → попередній запис `outdated: the code snapshot changed since this run`, F6 показує `· Enter reruns`; Enter → новий запис з іншим `snapshotId`, новим `sha256` і `line: 2`, = CLI. Dirty `checkout.md` → barrier `[checkout.md]`; Back нічого не пише й не стартує; Save and continue → план збереженого тексту = CLI; `.keylang/trace` не створено.

Коміт: `c918cb8` (Plan a flow's trace through a shared trace-plan operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 528 tests, 527 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓ (до прогону тестів — 24 unverified через застарілий `.keylang/reports/node-test.json`, після — 0).

Приймання:
- План придатний для адаптерів без перетворення: export і F6 — байти `tracePlanText`, тобто stdout CLI, який читають адаптери Python/Rust (`tests/languages.test.ts` зелені в тому самому прогоні).
- Жодного запуску тестів чи програми: операція лише читає специфікації й будує знімок; `treeBytes` незмінний, `.keylang/trace` не виникає.
- Неповний доказ не стає підтвердженням: ID, що не є fn знімка, названо окремо як «not in the plan», а звіт прямо каже, що план — не доказ; вердикти trace не змінюються.

Передано наступним задачам:
- 37: дія `trace-plan` у каталозі; довгі рядки JSON на вузькому екрані обрізаються.
- 38: CLI `trace-plan` тепер — принтер над операцією; контракт звірено з HEAD.

Припущення й залишки:
- `omitted` — нове поле лише payload операції; CLI його не друкує (stdout незмінний).
- Список потоків — з поточного аналізу сесії (з dirty-оверлеями), а план — зі збережених файлів після barrier; без аналізу список порожній, а назву можна набрати.
- Barrier охоплює всі dirty-буфери під `<dir>/` (flowSymbols читає всі `.md` під ним), а не лише файл потоку.
- Набрана назва, що є підрядком іншого потоку, вибирає перший збіг зі списку (як у формі feature); точний збіг завжди перший.
- Запис стає outdated за грубим правилом `inputsChanged` (будь-яка зміна входів сесії) і за зміною `snapshotId`.
- Cancel окремим тестом не перевірено (той самий шлях, що в інших read-only kinds). Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `c918cb8`.
