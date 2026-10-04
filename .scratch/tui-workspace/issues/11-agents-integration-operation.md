# 11: Налаштовувати й перевіряти інтеграції харнесів через TUI

**What to build:** дія agents дозволяє auto, конкретний набір харнесів або none, показує фактичні зміни керованих файлів.
**Blocked by:** [09 — протокол запису](09-map-write-and-commit-protocol.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A08, A11, A26.

## З чого почати

Знайти `cmdAgents`, `harnessPlan`, `applyHarness`, `detectHarnesses`, `parseAgents`, `planHarness`, `HARNESS_PATHS`, `skillFile`. Прочитати ADR 0005 і тести managed blocks/JSON/TOML.

## Кроки

1. Виділити планування/застосування інтеграцій у спільну операцію. Предметний harness-adapter перенести нижче CLI, щоб operations не імпортував верхній транспортний шар.
2. Параметри: selection auto / explicit list / none; mode write/check. Auto й none не є порожнім explicit list: зберегти чинну різницю.
3. До запуску показати вибір і категорії цільових файлів; version брати з пакета, як CLI. Не запускати жоден харнес.
4. Побудувати й перевірити повний план до першого запису: зіпсований managed marker, JSON/TOML — помилка з конкретним файлом.
5. Використати очікуваний текст для записів і видалень. Чужі поля/блоки та CRLF зберігати за чинним адаптером, а не конструювати файли з нуля.
6. Check повертає перелік stale і 1 без записів; write звітує лише про реально зроблене. Doctor може перейти до цієї форми.

## Перевірки

- Auto і explicit вибір на копіях repo дають ті самі файли й версію MCP-команди, що CLI agents.
- None має чинні обмеження записів; чужий текст навколо блоків byte-for-byte збережений.
- Повторний write і check ідемпотентні; malformed JSON/TOML блокує всі записи плану.
- Зовнішня зміна цілі або I/O-помилка дає конфлікт/частковий звіт, не тихе затирання.

## Приймання

- [x] CLI й TUI викликають одну операцію з явним root.
- [x] Налаштування не видається за перевірку працездатності зовнішнього клієнта.
- [x] Правила шарів не допускають operations → CLI або TUI → CLI.

**Межі:** не додавати запуск харнесів, credentials wizard чи нові види інтеграцій.
**Validation:** `npm run typecheck`, `npm test`, актуальна карта та перевірка шарів.

## Comments

- 2026-09-30 — реалізовано agents як спільну операцію write/check для CLI і TUI (A08 і A11 для agents, A26 — інтеграції). Закомічено `4ad4aa5`. Перевірки пройшли. Статус лишаю `ready-for-agent` до рішення людини щодо закриття.

## Result

Реалізовано `agents` (запис і перевірка) як спільну операцію з фазами план/commit; адаптер харнесів перенесено нижче CLI; форма вибору й режиму в TUI і звіт F6.

- **`src/adapters/harness.ts` → `src/harness.ts`** (шар `features`, `keylang.json`). Чисті адаптери (`planHarness`, `mergeMarked`, JSON/TOML, CRLF, `detectHarnesses`, `parseAgents`) без змін. Шлях skill — `../resources/…` (працює з `src` і `dist`). Нове: `HarnessChoice = "auto" | "none" | HarnessName[]`, `harnessChoice(flag)` (граматика `--agents`, помилки ті самі), `resolveChoice` (auto — блок `AGENTS.md` навіть без виявлених; none — `instructions: false`; порожній список — помилка, не none), `diskProbe`, `keylangVersion()` (з `package.json` пакета, як CLI), `harnessCategory` (`instructions`/`mcp`/`skill`/`settings`/`hooks`), `planAgents` (читає всі `HARNESS_PATHS`, будує повний план до запису; `keep`/`write`/`remove` з порівнянням CRLF→LF, як раніше), `agentsPlanProblems` (кожен шлях харнеса має ті самі байти, що бачив план; `writeProblem(…, { expect })` для цілей запису; для auto — той самий набір виявлених харнесів), `commitAgents` (кроки по одному, `writeAtomic` у `landing` зі збереженням CRLF, `rmSync` для видалень; перша помилка → `failed`, решта `not-attempted`; signal між кроками).
- **`src/operations.ts`** — `AgentsRequest { kind: "agents", root, harnesses, check }`, `AgentsPayload { check, choice, harnesses, version, files, error, refused, steps }`, `"agents"` у `WRITING_KINDS`. Коди: зламаний маркер/JSON/TOML — `failed` 2 з `файл: причина`, нічого не записано (включно з файлами до нього в плані); check — 0 / 1 зі `stale, run \`keylang agents\``, без `beforeCommit`; write без змін — 0 без `beforeCommit`; відмова після `beforeCommit` — `failed` 1; I/O посеред — `failed` 2 з переліком записаного/не спробуваного; скасування — null.
- **`src/cli.ts`** — `cmdAgents` / `printAgents` — принтер над операцією; `init` робить check-план до запису `keylang.json` (зламаний файл — 2, як раніше), `init --check` — check-режим. `harnessPlan`/`applyHarness`/`harnessPresent`/`listDir`/`packageVersion` прибрано.
- **`src/tui/actions.ts`, `state.ts`, `app.ts`, `view.ts`** — дія «Agents: set up or check integrations» (Project; aliases `agents`, `keylang agents`, `harness`, `harnesses`, `mcp config`) відкриває `Prompt.kind = "agents"`: поле вибору з граматикою `--agents` (порожнє = auto) і режими Write/Check. До запуску, з read-only плану: розгортання вибору (`auto: detected claude, codex`), кількість змін за категоріями, `MCP npx -y keylang@<версія> mcp`, «sets up files only; it does not test the clients»; пункт Write називає файли. Невідоме ім'я — повідомлення CLI, форма лишається. Кроку збереження немає (специфікацій і конфігу операція не читає; файли харнесів не є буферами TUI). Після запису check-записи agents — outdated. F6: вибір, версія, стан, кожен файл із категорією й станом (`current`/`stale`/`written`/`removed`/`failed`/`not written`), рядок «Files only: no client is started or tested.».
- **`docs/tools.md`** — абзац agents доповнено протоколом відмови/часткового запису; новий абзац «Agents у TUI».
- **Карта** — `keylang/map/{cli,features,operations,tui}.md`, `keylang/map-explained/{cli,features,operations,tui,README}.md` перегенеровано; WIP `extract.md` байтово ті самі до/після (не закомічено); ці файли збігаються з картою чистої копії HEAD + зміни 11, крім WIP-рядка extract і total у README (як у HEAD після 09/10).
- **Тести** (`tests/tui.test.ts`, 2 нові; 7 наявних CLI-тестів agents/init без змін і зелені):
  1. Repo з `.claude/settings.json`, `.codex/`, CRLF `AGENTS.md`: форма показує detected claude, codex, категорії, версію, «does not test»; невідоме ім'я лишає форму; check auto — 1, stdout = CLI twin, дерево незмінне; write auto у справжньому worker — дерево = CLI twin, stdout = CLI, версія = package.json, чужий CRLF-текст — байтовий префікс, чужі поля settings збережено, старий check outdated; повторний write/check — 0, без записів, CLI `--check` 0; `cursor` — те саме, що `--agents=cursor`; `none` — те саме, що `--agents=none`, блок прибрано, чужий текст лишився, `none --check` 0.
  2. Невалідний `.mcp.json`: TUI `failed` 2 з файлом, `AGENTS.md` теж не записано, CLI stderr той самий; зовнішня зміна `AGENTS.md` у паузі перед commit — `failed` 1, байти зовнішнього запису лишились; новий `.cursor/` у паузі (auto) — відмова; файл `.agents` на місці теки — кроки до skill completed, skill failed, решта not-attempted, код 2, F6 показує `not written`.

Коміт: `4ad4aa5` (Set up and check harness integrations through a shared operation in CLI and TUI); лише файли 11, сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 499 tests, 498 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 12 (init у сесії): операція `agents` з `harnesses` і `check` — крок init; `planAgents` дає прев'ю форми (категорії цілей); `init` у CLI уже використовує check-план як попередню перевірку.
- 35: `q` під час commit agents так само ще не чекає кроку.
- Doctor на цю форму не переведено (крок 6 тікета — опційний).

Припущення й залишки:
- Ціль через посилання за межі repo чи змінений файл тепер відмова з кодом 1 до першого запису (раніше `safeWrite` кидав посеред циклу — код 2 з частиною вже записаного).
- Вхід плану — байти всіх 11 `HARNESS_PATHS` і для auto — набір виявлених харнесів; зміна skill у пакеті під час роботи не перевіряється.
- Порожній явний список у запиті — помилка (2), не none; CLI до нього не доходить (`parseAgents`).
- F6 для none показує `current` і для відсутніх файлів, яким нічого не треба робити.
- Скасування посеред commit agents окремо не тестувалось: протокол 09 загальний.
- Ручну TTY-перевірку наживо не виконано.
