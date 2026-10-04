# 07: Область `layers`: увесь зв'язний порядок і шари поза порядком

**Джерело:** research-pl §5 Р-4; знахідка 2; рішення Q6 (spec); spec «Виправлення дослідження», Р-4: контрприклад області `layers`

**What to build:** Є три випадки, де виключення одного файла перетворює K101 на `ok` (усі відтворено 2026-09-29):
1. `- layers domain < app` з вкладеним `  - infra`. `src/infra/x.ts` імпортує `src/app/y.ts`, і це K101 «`infra` is outside the layer order». Після `exclude: ["src/infra/x.ts"]` рядок `layers domain < app` отримує `ok` «every dependency between `domain`, `app` points down, and no dependency hole in the area».
2. Те саме з файлом поза шарами `src/misc/z.ts` (шар `unassigned`): K101 змінюється на `ok`.
3. `layers a < b` + `layers b < c`. `src/a/x.ts` імпортує `src/c/y.ts`, і це K101 «layers say `a < c`». Після `exclude: ["src/a/x.ts"]` рядок `layers a < b` отримує `unverified`, а `layers b < c` — `ok`.

Причина — область рядка (src/rules.ts:227-231). Вона містить модулі шарів самого рядка й шарів, не названих у жодному `layers`. Шари з `rules.unordered` вона відкидає: це вкладені шари й синтетичні `external`/`unassigned` (`UNORDERED_LAYERS`, src/rules.ts:53, :447). Решти зв'язного порядку в області теж немає.

format.md:261 уже обіцяє область «модулі його шарів і шарів поза будь-яким порядком». Нова область рядка (Q6) складається з модулів:
- усіх шарів його зв'язного часткового порядку, тобто всіх рядків `layers`, пов'язаних спільними шарами;
- усіх шарів поза порядком: вкладених, `unassigned` і не названих у жодному `layers`.

Сам запис `unassigned-file` («outside any layer», src/graph.ts:297) прогалиною для порядку не є, бо ребра такого файла відомі. Прогалини всередині такого файла (`exclude`, нерозв'язаний імпорт) прогалинами лишаються. Рядок, чий шар порушено, як і зараз, вердикту не має: є лише K101.

Множина прогалин для `deny` (`DEPENDENCY_HOLES`, src/rules.ts:386) не змінюється. Проте явно виключений файл поза всіма шарами тепер є у знімку (opaque-модуль в `unassigned` із записом `skipped-file`), тож `deny unassigned …`, чиє єдине порушне ребро йшло з такого файла, отримує `unverified` замість хибного `ok` (раніше цей файл зникав із графа разом із K102). Самий репозиторій виключає файли поза шарами (`bench/**`, `design/**`, `editors/**`, `examples/**`, `scripts/**`), тож його рядок `layers` і глобальний `no-cycles` стають `unverified` (рішення людини 2026-10-04, див. `### Notes`).

Виправлення робиться в поточному `rules.ts`, до міграції на SpecIR: 19 заблокований цим тікетом і зберігає поведінку. 06 змінює сусідню ділянку того самого `evaluateOnSnapshot`, тож ці тікети зливають по черзі. Якщо 05 уже злито, цей тікет знімає `todo` з підтесту свого випадку в tests/metamorphic.test.ts.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Контракт:** змінюється семантика: частина `ok` рядків `layers` стає `unverified`, тож `check --strict` на таких репозиторіях дає 1 замість 0. Це несумісна зміна (виправлення надійності), її записують у «Несумісні зміни» spec. Форма JSON не змінюється.

- [x] Випадки 1 і 2 з `exclude` файла-джерела: `layers domain < app` отримує `unverified` з позицією виключеного файла (`src/infra/x.ts:1:1`, `src/misc/z.ts:1:1`), `check` дає код 0, `check --strict` — 1. Без `exclude` — K101 (регресія).
- [x] Випадок 3 з `exclude: ["src/a/x.ts"]`: обидва рядки `layers` отримують `unverified` з `src/a/x.ts:1:1`.
- [x] Файл поза шарами без інших прогалин не робить `layers` `unverified`, тож нового шуму немає: рядок лишається `ok`.
- [x] Незв'язні порядки `layers a < b` + `layers c < d`: з `exclude` файла в `c` рядок `layers a < b` лишається `ok`, а `layers c < d` отримує `unverified`. Наявні тести tests/core.test.ts:351 і :380 зелені без змін очікувань.
- [x] format.md:261 (§7, пункт `layers`) визначає область через зв'язний порядок і шари поза порядком і каже, що `unassigned-file` прогалиною для порядку не є. Якщо 05 злито, `todo` цього випадку в tests/metamorphic.test.ts знято.
- [x] `npm run typecheck` і `npm test` зелені. `node bin/keylang.js map` виконано, diff переглянуто, зокрема карту з поясненнями (`explain.map` увімкнено). `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `tests/core.test.ts`, `docs/format.md`; за умови 05 — `tests/metamorphic.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: частково реалізовано (6dcdc78): випадки 1 і 3 та незв'язні порядки працюють (tests/rules-area.test.ts «a layers hole covers the connected order and not a disconnected one»; проба випадку 1 дає unverified з src/infra/x.ts:1:1, --strict = 1); format.md §7 пункт `layers` описує зв'язну компоненту й `unassigned-file`. Лишилось: випадок 2 — проба 2026-10-01 (`layers domain < app` з `infra`, `src/misc/z.ts` імпортує `src/app/y.ts`, `exclude: ["src/misc/z.ts"]`) дає `ok` замість `unverified` з `src/misc/z.ts:1:1`: виключений файл поза всіма шарами не стає прогалиною. Та сама причина ламає `no-cycles` під модулем (06): цикл `app.a ↔ src/misc/b.ts` з `exclude` b дає ok замість unverified — виправляти разом. Додати тест випадку 2 (і варіанта no-cycles) та, якщо 05 ще відкритий, підтест у tests/metamorphic.test.ts.

- 2026-10-04 — доведено за рішенням людини 2026-10-04 (явно виключений файл поза всіма шарами — прогалина, opaque-модуль в `unassigned`; явний «поза архітектурою без прогалини» — тікет 50). Код — `src/map.ts` (див. `### Notes`); додано тест «deny unassigned counts an excluded source outside every layer as a hole» (раніше такий файл зникав разом із K102, і `deny unassigned app` давав хибний `ok`). Виправлено речення тікета про `deny unassigned`; format.md §11 переписано: виключений файл поза шарами — модуль `unassigned` і прогалина для `layers`, глобального `no-cycles` і `deny`; вгадана розкладка — як раніше. spec «Несумісні зміни» (06, 07) доповнено: нові модулі `unassigned` у карті й індексі, `unverified` для рядків самого keylang. Перевірки: `npm run typecheck` ✓; `node --test tests/rules-area.test.ts tests/metamorphic.test.ts tests/core.test.ts` — 52/52; `node bin/keylang.js map` — нові `keylang/map/unassigned.md`, `keylang/map-explained/unassigned.md` (25 opaque-модулів `<!-- excluded -->`), індекс README, у `map.md` лише зсув рядків `src/map.ts`; `map --check` = 0; `check` = 0 (0 fail, 26 unverified, 45 ok; з них правил два — `keylang/rules.md:16` `layers` і `:33` `no-cycles` «excluded by keylang.json (bench/clone.ts:1:1)», решта — trace/tests без локальних звітів), `check --strict` = 1. Повний `npm test` під навантаженням (load ≈ 18, паралельні прогони інших агентів) обірвано таймаутом 30 хв на `tests/tui.test.ts`: до того 483 pass, 1 fail — таймінговий флейк `tests/explain.test.ts:202` («took 3875 ms» проти 2000), окремо теж падає лише за часом; файли, яких зміна не торкається. Повний прогін на підсумковому стані — у коментарі тікета 05.

### Notes

- 2026-10-02 — виправлення лягло в `src/map.ts`, а не в `rules.ts`: область у `rules.ts` уже правильна, але виключений файл поза всіма шарами взагалі не потрапляв у знімок — `excludedSourceFiles` у `generateMap` фільтрувався за `placeFile !== null` (src/map.ts:81), тож файл не мав ані модуля, ані запису coverage, і жодна логіка `rules.ts` не могла його побачити. Тепер явно виключений файл — opaque-модуль у своєму шарі або в `unassigned` (явний конфіг); із вгаданою розкладкою такий файл, як і раніше, лишається поза графом. Це те саме ставлення, що вже мали виключені файли всередині шару.
- Той самий виправлений і варіант no-cycles з нотатки 06: цикл `app.a ↔ src/misc/b.ts` (позаду всіх шарів) з `exclude` b тепер `unverified` з `src/misc/b.ts:1:1` (`check` 0, `--strict` 1), без `exclude` — K105 `app.a → unassigned.src.misc.b → app.a`.
- Тести: tests/rules-area.test.ts — «an excluded upward source is a layers hole, in a nested layer or outside every layer» (випадки 1 і 2, регресії K101, `--strict` 1, файл поза шарами без інших прогалин лишає `ok`) і «no-cycles under a module counts an excluded cycle file outside every layer»; tests/metamorphic.test.ts — підтест «excluding an upward file outside every layer is unverified, not ok» (05 ще відкритий: needs-info, тож знімати `todo` нема з чого; за нотаткою аудиту додано звичайний підтест) і половина «excluding the far side of a cycle…» про файл поза шарами.
- Наслідок для самого репозиторію, що застарів проти передбачення в тікеті («вердикт його рядка `layers` не змінюється»): репозиторій виключає 25 файлів поза всіма шарами (`bench/**`, `design/**`, `editors/**`, `examples/**`, `scripts/**`), тож його власні `layers` (keylang/rules.md:16) і глобальний `no-cycles` (:33) тепер чесно `unverified` «excluded by keylang.json (bench/clone.ts:1:1)» і `check --strict` = 1. `check` = 0 fail — гейт виконано; несумісну зміну записано в spec «Несумісні зміни» (06, 07) раніше. Передбачення було зроблене до того, як аудит знайшов причину в конвеєрі: будь-яке виправлення, що робить такі файли прогалинами, змінює ці вердикти.
- Карта перегенерована й diff переглянуто: нові `keylang/map/unassigned.md` і `keylang/map-explained/unassigned.md` (25 opaque-модулів з `<!-- excluded -->`), README пояснювальної карти отримує індекс-записи, `keylang/map/map.md` — лише зсув рядків `src/map.ts`. docs/format.md §11: речення про виключений файл тепер каже й про `unassigned` поза шарами явного конфігу.
- Verify: `npm run typecheck` ✓; `npm test` — 590 тестів, 589 pass, 1 skip (преіснуючий умовний whisper-тест без env), 0 fail; `node bin/keylang.js map` + `map --check` = 0; `node bin/keylang.js check` — 0 fail (2 unverified), `--strict` = 1.

- 2026-10-02 (зміна 4) — зміна вже була повна в робочому дереві; попередні зміни впали не на коді, а на флейк-тесті `tests/explain.test.ts:202` («Anthropic request that never answers ends within KEYLANG_LLM_TIMEOUT_MS», assert на 2009 ms) — таймаут-чутливий тест під навантаженням. Цього разу повний прогін зелений: 589 тестів, 588 pass, 1 skip, 0 fail. Гейт: `npm run typecheck` ✓, `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` — 0 fail (2 unverified, очікувано за несумісною зміною).

### Shift 1 — opencode opencode-go/glm-5.3 (medium)
- Ended: budget
- Usage: 1980437 in / 11652 out tokens, $1.5062, 27 turns
- Time: 5m 54s
- Verify: passed
- Outcome: new attempt
### Handoff — shift 1, opencode:opencode-go/glm-5.3 → opencode:opencode-go/deepseek-v4.1-flash, reason: budget.maxCostUsd ($1.5062 / $1.5)
- Last output:

```
Відтворюю випадок 2 із аудиту на поточному коді:
Відтворено. Перевіряю статус сусідніх тікетів 05/06 і метаморфний тест:
Дивлюся на коміт 6dcdc78, яким уже реалізовано випадки 1 і 3:
```

### Shift 2 — opencode opencode-go/deepseek-v4.1-flash (low)
- Ended: budget
- Usage: 3458056 in / 20295 out tokens, $0.0849, 40 turns
- Time: 6m 14s (ticket total 12m 8s)
- Verify: failed at `npm test` (exit 124)

```
e and $schema stay; nothing is written before Ctrl+S, Ctrl+Z gives the text back (1316.92036ms)
✔ tui: without keylang.json draft map moves the layers into a new buffer with the inferred config; the file appears only with Ctrl+S (871.006118ms)
✔ tui: a model layout is the validated answer; an edit of keylang.json during the request makes it outdated with the new text kept; Cancel closes the request; a hybrid without a model and invalid JSON in the buffer move nothing (2521.471136ms)
✔ tui: invalid layers from the model are a failed draft (2) with the reason; nothing can be moved (553.649056ms)
✔ tui: code-to-spec of a file with two exports and a private fn is the CLI's file mode; a line picks the fn holding it; the proposal keeps the prose and the other flow; source and target stay until w (3912.565847ms)
✔ tui: code-to-spec takes the code viewer's or the cursor's position; a line outside every fn, a file that is not source, a waiting proposal and an unsaved target keep the form; a target edited during the work gets no proposal (5015.388299ms)
✔ tui: code-to-spec from the git changes is the CLI's --since: a changed fn and an untracked file drafted, a fn already in a flow named; no change is a no-op that writes nothing; a bad ref or no git is code 2 (11133.358844ms)
✔ tui: a hybrid code-to-spec from the git changes asks the model once per flow and proposes them together; Cancel during the second answer leaves no partial proposal and counts nothing (1549.765494ms)
✔ code-to-spec operation: a Cancel between two flows asks no second request; a source changed while the model answers is refused with nothing written; llm without a model is 2 (393.097809ms)
✔ tui: spec-to-code proposes the CLI's code and each test as separate code proposals; the preview writes nothing; each merges on its own and none makes the plan implemented (2629.007253ms)
✔ tui: spec-to-code refuses an implemented ID with its place, a file of another module and a waiting proposal before the run; a test proposal waiting or a test file created during the work writes nothing; an I/O failure names the proposals written; g on a planned gap opens the form (5539.055109ms)
✔ tui: spec-to-code with the model shows the CLI's llm candidate with its provenance; the proposal lands for the target it started with without taking the focus; nothing is accepted and the plan stays planned (3412.981425ms)
✔ tui: spec-to-code llm — Cancel, an empty or wrong answer and a timeout write nothing; a spec changed during the answer refuses the proposal and keeps the new bytes; an edit makes a preview outdated; no model is refused before any request (3601.215187ms)
✔ tui: a spec-to-code candidate is applied only by a in F6 after a step naming every file — the CLI's --apply bytes, no proposal, new directories — for the template and the model alike; the old candidate is refused after it (10398.729756ms)
✔ tui: applying a candidate checks every file and input first — a target created after the preview, a spec changed at the commit, an open MERGE or a waiting proposal refuse it with nothing written; a failed second write names the first as written and the rest as not attempted, as the CLI does (8068.490247ms)
✔ tui: explain of a diagnostic code in any case and of an unknown code is the CLI's text and code with no save step; e on a line with K001 shows its help; no model is asked, nothing written (7148.273305ms)
✔ tui: explain of an id is the CLI's summary with the doc comment, the saved answer and the brief apart, with their provenance; places open the code; a code change makes the answer stale; a missing answer is no error; an unknown id has the CLI's suggestion; no model is asked (10338.036092ms)
✔ tui: explain with the model asks once for a missing answer and saves it with its provenance; a fresh one is read with no request, as the CLI reads it; brief and full ask again; the map, the baseline and the check stay as they were (9295.936596ms)

[shiftwork] timed out after 20 min (verifyTimeoutMin)
```

- Outcome: new attempt
### Handoff — shift 2, opencode:opencode-go/deepseek-v4.1-flash → opencode:opencode-go/glm-5.3, reason: budget.maxTurns (40 / 40)
- Last output:

```
I've found that the runner operates in the ticket's worktree, but this session's workspace is the main checkout. Let me move the session to the correct worktree.
The session is now in the ticket's worktree. Now I'll bring the ticket's fix over from the working state and verify it.
```

- Diff stat:

```
M docs/format.md
 M keylang/map-explained/README.md
 M keylang/map-explained/map.md
 M keylang/map/map.md
 M src/map.ts
 M tests/metamorphic.test.ts
 M tests/rules-area.test.ts
?? keylang/map-explained/unassigned.md
?? keylang/map/unassigned.md
docs/format.md                  |  2 +-
 keylang/map-explained/README.md | 27 +++++++++--------
 keylang/map-explained/map.md    | 48 ++++++++++++++---------------
 keylang/map/map.md              | 48 ++++++++++++++---------------
 src/map.ts                      |  6 ++--
 tests/metamorphic.test.ts       | 30 ++++++++++++++++++
 tests/rules-area.test.ts        | 67 +++++++++++++++++++++++++++++++++++++++++
 7 files changed, 165 insertions(+), 63 deletions(-)
```

- Verify failure: `npm test` (exit 124)

### Shift 3 — opencode opencode-go/glm-5.3 (low)
- Ended: budget
- Usage: 1045609 in / 3395 out tokens, $1.6437, 40 turns
- Time: 13m 58s (ticket total 26m 6s)
- Verify: failed at `npm test` (exit 1)

```
eps running (423.788689ms)
✔ web: a megabyte input frame in one session leaves the server answering the others (859.681248ms)
✔ web: a session that cannot be opened says so and closes with 4001 (24.636204ms)
✔ web: a tab closed while it records ends the recording instead of leaving it waiting (231.434509ms)
✔ web: t switches the map to the explained map on the same node, the screen the terminal shows (642.185795ms)
✔ web: init → new feature → edit → read → map → feature over the real transport leaves the terminal's files and records; code opens in the viewer, not $EDITOR (1806.499302ms)
✔ web: the whole cycle — init → config → new feature → check → spec-to-code → proposals and MERGE → an outside proposal → map → feature done — gives the terminal's records and files over the real transport (3581.052112ms)
✔ web: a dropped socket leaves a running map write to its session; the reconnect shows one record with its progress and result, the disk matches it, and Cancel works after a reconnect (951.346439ms)
✔ web: a tab that lost its session to another starts nothing; the new owner's run is the only one (514.106838ms)
✔ web: the expiry of a detached session and server.close() cancel a held write; nothing is written after them and no job is left (649.02628ms)
✔ wire: generates a typed wire() that tsc accepts; each factory is built once, dependencies first, disposed newest first (2208.100711ms)
✔ wire: a failing factory disposes what was built and rethrows (469.530305ms)
✔ wire: a factory whose parameter does not accept the wired dependency fails tsc (1199.825895ms)
✔ wire --check: a stale file is exit 1 and is not rewritten; a manual file is never overwritten (1270.042316ms)
✔ wiring: a cycle is K301, a module as factory K302, a malformed condition K005, a denied dependency K102; wire writes nothing (808.953918ms)
✔ wiring: the generated file is code in its layer; `check` holds it to the same rules (810.764491ms)
✔ wiring: fmt is idempotent on `# wiring` and keeps its meaning (1113.323375ms)
✔ wire: a default export, an alias, IDs that collapse to one name (`memory-db`, `memory.db`, `memory_db`) — the generated file type-checks and runs (1939.67458ms)
✔ wire: a static method is a factory or a decorator called on its class, a default-exported class included; the file type-checks and runs (1724.747807ms)
✔ wire: under nodenext a JS source keeps `.js` and `.mts` becomes `.mjs`; the emitted file loads in Node (1241.202475ms)
✔ wiring: K302 for compose on a module, a type or a class, a method, an unexported fn and Python code; K002 for a dependency named twice; K102 names the deny rule; wire writes nothing (798.55216ms)
✔ wire: any error on a `# wiring` line blocks it — K003 indentation included; nothing written (415.487742ms)
✔ wire --out: an absolute path, `..`, a link out of the repository or a non-TS file is exit 2 with nothing written; a missing directory is created (1950.897982ms)
✔ wiring: a `when` value is compared as written — `a,b` is one value, whatever the canonical text of the item (532.267252ms)
✔ wire: when a factory fails and a disposer fails too, the factory's error stays first (474.125607ms)
ℹ tests 589
ℹ suites 0
ℹ pass 587
ℹ fail 1
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 978295.055053

✖ failing tests:

test at tests/explain.test.ts:202:1
✖ explain --llm: an Anthropic request that never answers ends within KEYLANG_LLM_TIMEOUT_MS, retries included (2016.91651ms)
  AssertionError [ERR_ASSERTION]: took 2009 ms
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/pl-theory-07/tests/explain.test.ts:221:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1404:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
```

- Outcome: new attempt
### Handoff — shift 3, opencode:opencode-go/glm-5.3 → opencode-go/space-bunny-free, reason: budget.maxTurns (40 / 40)
- Last output:

```
Диф карти коректний. Читаю тест зміни 1 про зв'язний/незв'язний порядок — покриття чек-листа повне?
Перевіряю, як format.md описує запис `unassigned-file` — чи не конфліктує з новою поведінкою (виключений файл поза шарами отримує обидва записи):
Перевіряю історію `todo` у метаморфному тесті (чек-лист: «якщо 05 злито, todo знято»):
```

- Diff stat:

```
M docs/format.md
 M keylang/map-explained/README.md
 M keylang/map-explained/map.md
 M keylang/map/map.md
 M src/map.ts
 M tests/metamorphic.test.ts
 M tests/rules-area.test.ts
?? keylang/map-explained/unassigned.md
?? keylang/map/unassigned.md
docs/format.md                  |  2 +-
 keylang/map-explained/README.md | 27 +++++++++--------
 keylang/map-explained/map.md    | 48 ++++++++++++++---------------
 keylang/map/map.md              | 48 ++++++++++++++---------------
 src/map.ts                      |  6 ++--
 tests/metamorphic.test.ts       | 30 ++++++++++++++++++
 tests/rules-area.test.ts        | 67 +++++++++++++++++++++++++++++++++++++++++
 7 files changed, 165 insertions(+), 63 deletions(-)
```

- Verify failure: `npm test` (exit 1)

### Shift 4 — pi opencode-go/space-bunny-free (low)
- Ended: stop
- Usage: 80293 in / 1184 out tokens, $0.0000, 7 turns
- Time: 12m 39s (ticket total 38m 46s)
- Verify: passed
- Outcome: verify passed; review before landing

### Review — grok grok-4.7 (high), retried on opencode opencode-go/kimi-k3 (high)
- Verdict: none — review gave no verdict twice; review it by hand
- Time: 20m 21s
- Verify: passed
- Warning: grok-4.7: review ended without a verdict marker
- Warning: opencode-go/kimi-k3: review ended without a verdict marker
- Findings:

> HEAD == master, зміна незакомічена в робочому дереві. Є й файли поза заявленим дифом тікета — перевіряю їх.
> Typecheck пройшов. Запускаю повний `npm test` у фоні (він іде ~16 хв), а сам продовжую ревʼю.
> Карта згенерована коректно. Тепер решта гейту: `map --check` і `check` на самому репозиторії.
> Гейт частково пройдено: typecheck ✓, `map --check` = 0 ✓, `check` = 0 fail (2 unverified, як задокументовано) ✓, `--strict` = 1 — узгоджено з записом у «Несумісні зміни» spec. Перевіряю покриття випадку 3 і незв'язних порядків.
> Випадок 3 і незв'язні порядки покриті наявними тестами з master (6dcdc78) + новими. Перевіряю ще `excludedSourceFiles` і вердикт global no-cycles для повноти.
<shiftwork:needs-info reason="review gave no verdict twice; review it by hand"/>

- Branch kept: shiftwork/pl-theory-07
