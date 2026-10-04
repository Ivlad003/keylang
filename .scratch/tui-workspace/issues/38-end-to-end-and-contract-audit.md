# 38: Замкнути наскрізний цикл і перевірити збереження CLI-контрактів

**What to build:** один демонстрований сценарій доводить, що робота від init до готовності фічі виконується в TUI; усі A01–A31 мають поведінкове покриття.
**Blocked by:** [36 — web lifecycle](36-web-operation-lifecycle.md), [37 — повний каталог](37-catalog-help-narrow-screen.md). Їхні транзитивні блокери охоплюють решту задач.
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A01–A31.

## З чого почати

Прочитати результати попередніх задач і матрицю покриття в [індексі](../tickets.md). Знайти чинні CLI/TUI/web fixtures, virtual terminal та локальні provider mocks. Не переписувати всі тести в одну монолітну перевірку.

## Кроки

1. Створити мінімальний наскрізний fixture: підтримуваний source без конфіга → init → нова feature-spec з planned → save/check → algo spec-to-code → proposal chooser/MERGE → map → feature gaps.
2. Зробити fixture конкретним: існуюча `app.order.checkout`, запланована `app.order.refund`, flow з checkout як trigger і refund як step. Після прийняття шаблону refund перевірити, що непідтверджений зв'язок лишився gap. Далі подати детерміновану повнотекстову code-proposal, що додає виклик refund із checkout, і прийняти її через MERGE. Це тестова імітація зовнішнього автора, не запуск харнеса й не вимога до stub самостійно реалізувати бізнес-логіку. Використати void-сигнатури й дозволену залежність усередині одного модуля, щоб rule/contract-помилки не змішувалися з перевірюваним static-gap.
3. Повторний feature показує done лише за чинною функцією готовності. Tests/trace показати окремо. Увесь keylang-цикл не викликає вкладені CLI-процеси.
4. Порівняти ключові кроки з CLI на незалежній копії fixture: bytes, findings, stdout/stderr, codes. Нормалізувати лише явно змінні службові поля.
5. Зіставити кожний A-критерій зі справжнім тестом. Додати лише відсутні інтеграційні сценарії; не дублювати всі приватні гілки.
6. Перевірити, що всі перенесені CLI handlers використовують спільні операції, а старі копії оркестрації видалені. Протокольні LSP/MCP/hook/web-входи лишаються чинними.
7. Оновити карту генератором, переглянути diff, перевірити шари, документацію й посилання. У підсумку назвати непокриті/заблоковані сценарії, якщо є.

## Обов'язкові негативні сценарії

- Невалідний конфіг → виправлення в сесії; невдалий F5 не повертає старе «зелене».
- Dirty-input barrier; зовнішня правка під час LLM; pending proposal; частковий I/O; Cancel після одного запису.
- No-TTY usage/2; нормальний вихід після operation 1/2 → 0; read-only inventory незмінний.
- Browser reconnect із active job; вузький terminal з доступними Run/Back/Cancel.

## Приймання

- [x] A01–A31 мають конкретне посилання на виконаний тест або явно позначений залишковий блокер.
- [x] `npm run typecheck`, `npm test`, `node bin/keylang.js map --check`, `node bin/keylang.js check` пройшли.
- [x] Проведено короткий ручний TTY smoke: init/палітра/довга дія/resize/вихід і відновлення термінала.
- [x] Заявлена документацією матриця відповідає коду; відсутні дублікати оркестрації й імпорти CLI з TUI.

**Межі:** не розширювати scope новими командами або реальними зовнішніми провайдерами для зеленого acceptance.

## Result

Наскрізний цикл init → готова фіча проходить в одній TUI-сесії й через справжній `keylang web`. На кожному кроці його звірено з CLI на незалежній копії. Нових команд, дій і змін `src/` немає: задача додала тести, виправила одну застарілу згенеровану карту й оновила документацію дизайну.

### Що зроблено

- **`tests/cycle-fixture.ts`** (новий) — fixture і сценарій `refundCycle(screen, at)`, що працює лише через клавіші й екран, тому однаково йде через `App` і через сокет web. Репозиторій: `src/app/order.ts` з `app.order.checkout`, без `keylang.json`. Етапи:
  1. init зі стартового екрана;
  2. `check.tests` у `keylang.json` через дію `config` і Ctrl+S;
  3. нова feature `keylang/features/refund.md` з `planned fn app.order.refund () → void` і потоком: trigger checkout, step refund, тест (лише буфер до Ctrl+S);
  4. повний check;
  5. feature: 2 gap(s), код 1;
  6. F6 → planned-прогалина → `g` → spec-to-code (шаблон, proposals);
  7. MERGE коду, потім тесту через список пропозицій;
  8. feature: 1 gap(s), static, код 1 — непідтверджений зв'язок лишився прогалиною;
  9. детермінована повнотекстова пропозиція зовнішнього автора (checkout викликає refund) через MERGE;
  10. Map: write;
  11. feature: done, код 0.
  Етапи `CycleStage` дають викликачу місце для звірки з CLI.
- **`tests/tui.test.ts`**, +2 тести:
  1. «one session goes from a repository without keylang.json to a done feature…» — сесія зі справжнім worker-ом операцій і CLI-двійник `twin`. На кожному етапі тест звіряє:
     - init: `stdout` і `artifacts` = CLI `init`; configured без перезапуску;
     - config: байти Ctrl+S;
     - unsaved: файла немає, overlay-аналіз бачить буфер;
     - saved: байти й знахідки = `check --format json` (A06);
     - check: JSON, human `lines` = stdout, коди; planned не зелений;
     - gaps / gap / done: `report` = `feature --format json` на двійнику, коди 1/1/0, склад прогалин;
     - proposed: обидві пропозиції байт у байт = CLI `spec-to-code`, `written` порожній, код ще не змінено;
     - template / merged: `specTree` = двійник після прийняття всіх шматків;
     - перед map: `map --check` = 1 в обох (F5 карту не пише);
     - map: `mapStepLines` = stdout CLI `map`, усе дерево = двійник, крім `generated`;
     - done: `info.tests` = `unverified test …`, окремо від готовності; F6 `Info (not blocking)`; `check` і `map --check` = 0 в обох.
     Spy на всі функції `node:child_process` (через `syncBuiltinESMExports`; він бачить і виклики CLI-двійника, тест це перевіряє) не фіксує жодного процесу з потоку сесії під час циклу. Історія записів: `init, full-check, feature 1, spec-to-code, feature 1, map, feature 0`.
  2. «on a 50-column terminal …»: утримана операція → `x cancel` у F6 → cancelled; крок виходу показує `[Stay]` і `[Cancel and exit]`, Stay лишає операцію; крок збереження показує `[Save and continue]` і `[Back]`, Back нічого не пише й не запускає; ширина рядків ≤ 50.
- **`tests/web.test.ts`**, +1 тест: «the whole cycle … over the real transport». Той самий `refundCycle` іде в терміналі (`App`) і через справжній `keylang web` (дочірній процес, справжній worker). 7 записів F6 збігаються, файли обох репозиторіїв байтово однакові (крім `generated`). Цей тест закриває A27 разом із пропозицією й MERGE; тест 1 з 36 пропозицій не мав.
- **`docs/tui-workspace.md`** — статус «дизайн реалізовано» замість «ще не реалізовано»; у §5 точне формулювання про CLI (граматика й коди збережено, крім суворіших відмов запису з кодом 1); у §6 — де лежать наскрізні тести.
- **Карта: окремий коміт `4f6842e`.** На чистій копії HEAD (`git worktree add` + symlink `node_modules`, офлайн) `map --check` давав 1: `keylang/map-explained/README.md` містив лічильник `extract` 110 і `all` 1253. Ці числа дає WIP користувача в `src/extract/ts.ts`, а закомічений екстрактор дає 109 і 1252. Карту перегенеровано в чистому worktree; у master закомічено лише індекс (`git update-index --cacheinfo` з blob чистої копії), робоче дерево не чіпалось. Тепер README у master показано зміненим: це WIP-рядок, як і `extract.md`. Інші закомічені карти, зокрема `keylang/map/extract.md`, на чистому HEAD актуальні. Перевірки на чистій копії: `map --check` 0, `check` 0 fail / 0 unverified / 71 ok, `tsc` 0, `npm test` 575 tests / 574 pass / 0 fail / 1 skipped. Worktree видалено.

### A01–A31 → тести

Тести з `tests/tui.test.ts`, якщо не вказано інше; назви скорочено до впізнаваного префікса.

| ID | Тест(и) |
|---|---|
| A01 | «init from the start screen writes what the CLI writes in a twin…»; 38 «one session goes from a repository without keylang.json…» (етап init); web «the whole cycle…» |
| A02 | «invalid JSON in keylang.json opens its text at the error…», «an invalid field names the field; breaking the config later keeps the old report outdated…», «a valid config without supported sources…», «a broken harness file or no supported source stops init…» |
| A03 | «every CLI alias of the design's matrix finds its action; unavailable ones say why…» (38 aliases), «palette and search» |
| A04 | «a new flow and a new feature exist only as buffers until Ctrl+S…»; 38 (етапи unsaved/saved) |
| A05 | «a new spec outside the spec directory, in a generated or explanations directory, or through a link out is refused…», «a target created on disk before the first save is kept…» |
| A06 | «findings of a dirty buffer equal `check --format json` once it is saved», «the findings list equals `check --format json`…»; 38 (етап saved) |
| A07 | «Map: write names its targets first and writes what the CLI writes…»; 38 (map --check 1 до дії Map, потім байти = CLI `map`) |
| A08 | «map check in the worker reports what the CLI reports…», «init … init --check keeps the CLI's codes and the whole tree», «agents auto … write and check are idempotent», «baseline write and check in the worker…», «wire write and check … check writes nothing, not even a directory» |
| A09 | «fmt of the current spec writes the CLI's bytes and is idempotent…», «fmt over a directory with valid, invalid, unreadable…» |
| A10 | «dirty spec and config — Back writes nothing; Save and continue…», «a conflict on the second save stops the feature…», «the check saves the chosen dirty spec first…», «fmt saves the chosen dirty buffer first…»; новий «on a 50-column terminal…» (Back) |
| A11 | «baseline write and check…», «a manual baseline, an outside edit…», «agents auto, an explicit list and none…», «invalid JSON blocks every write of the plan…» |
| A12 | draft flow «(algo) … the preview is the CLI's --print…», «without a model the form drafts hybrid as algo…»; draft rules «(algo) on an acyclic and a cyclic repository…», «without a model the rules form…»; draft map «(algo) is the CLI's layout…», «a model layout is the validated answer…»; code-to-spec «of a file with two exports…», «from the git changes is the CLI's --since…», «a hybrid code-to-spec from the git changes…» |
| A13 | «spec-to-code proposes the CLI's code and each test as separate code proposals…», «spec-to-code with the model shows the CLI's llm candidate…», «a spec-to-code candidate is applied only by a in F6…»; 38 |
| A14 | «MERGE of two hunks: accept one, reject the other…», «Esc cancels a merge and writes nothing», «u after a merge never reverts edits made after it», «a rejected hunk stays rejected…», «a proposal rewritten during MERGE is neither applied nor removed unseen…» |
| A15 | «Ctrl+G turns free text into items through MERGE, keeping the text», «Ctrl+G from the palette over a dirty paragraph keeps the prose…» |
| A16 | «explain of an id is the CLI's summary…», «explain with the model asks once for a missing answer…», «explain with the model keeps the saved answer on Cancel, a timeout…» |
| A17 | «explanations to do — the stale saved list and the missing/stale brief plans…», «the brief batch plans again and asks jobs at a time…», «Cancel after the first brief keeps it…» |
| A18 | «wire write and check give the CLI's bytes…», «a wiring error, a manual file, a path out of the repository…», «a spec or the target changed between the computation and the write…» |
| A19 | «feature gives the same object and code as the CLI for done, planned, static and rule gaps; 2 for an unknown slug», «Enter on a feature gap opens its line…»; 38 (1 → 1 → 0) |
| A20 | «full check and strict give the CLI's codes…», «static behavior and shape match the CLI…», «changed check is the CLI's --changed slice…», «changed check without a repository or with an unknown ref…», «explain-edge fills the first id…», «explain-edge without an edge…» |
| A21 | «parse of the current spec with Unicode…», «parse of a syntax error…», «trace-plan of a flow with a trigger…», «trace-plan of an unknown flow…», «export saves the selected check report in each format byte for byte…», «export refuses a target changed after the form…» |
| A22 | «a model draft whose target, waiting proposal or buffer changed while the model answered writes nothing…», «spec-to-code llm — … a spec changed during the answer refuses the proposal…», «explain with the model keeps the saved answer … when a source or the saved file changes…», «applying a candidate checks every file and input first…» |
| A23 | «a delayed map check in a real worker leaves keys and resize live…», «a hybrid draft from the form … a late answer lands as the first target's proposal without taking the focus», «a slow doctor does not block the UI…» |
| A24 | «a delayed map check … x cancels with nothing written», «Cancel while the model answers ends the draft as cancelled…», «Cancel during the commit lets the current file finish…», «Cancel after the first brief keeps it…», «Cancel and exit before the commit quits with nothing written…» |
| A25 | «an I/O failure on the second step names the first as written…», «an I/O failure after keylang.json names what init wrote…», «applying a candidate … a file in place of a directory…», «fmt over a directory…» (код 2); batch — виняток коду 1, «the brief batch plans again…» |
| A26 | `tests/operations.test.ts` doctor (5 тестів, зокрема «a missing key … key values never reach the result»), «the palette runs doctor by id; F6 … matches the CLI», «agents auto…», «every CLI alias…» (причини й переходи до config/doctor) |
| A27 | `tests/web.test.ts`: новий «the whole cycle … gives the terminal's records and files over the real transport», «init → new feature → edit → read → map → feature…», reconnect/takeover/expiry (36) |
| A28 | «terminal: quitting after a feature with code 1 and one with code 2 returns 0», «terminal: quitting after a strict check with code 1 and a failed check with code 2 returns 0», «a failed operation is a visible record, and quitting is still code 0», «cli: keylang without a command and without a TTY prints usage with code 2…», «terminal: a signal restores the screen and the session returns 0; a crash returns 2…», «terminal: q during a held read-only operation asks first…» |
| A29 | «F6 lists a K102 on a source line…», «findings on one line stay separate…» |
| A30 | «a failed F5 keeps the old report outdated with a persistent reason», «a successful F5 after a failure clears the reason…», «a late failure of a superseded generation…», «a failed first analysis leaves no phantom success…» |
| A31 | «the proposals list reaches any spec, code or test target while the first stays undecided» |

Непокритих або заблокованих A-критеріїв немає.

Обов'язкові негативні сценарії тікета:
- невалідний конфіг → виправлення в сесії: A02;
- dirty barrier: A10;
- зовнішня правка під час LLM: A22;
- pending proposal: «draft flow refuses … a waiting or just-created proposal…», «spec-to-code refuses … a waiting proposal…», «without a model the rules form … a waiting proposal…»;
- частковий I/O: A25;
- Cancel після одного запису: «Cancel after the first brief keeps it…», «Cancel during the commit…»;
- no-TTY usage і код 2, вихід 0 після операції з кодом 1/2: A28;
- read-only inventory незмінний: «explanations to do…» (`treeBytes` незмінний);
- browser reconnect з активним job: web «a dropped socket leaves a running map write…»;
- вузький термінал з Run/Back/Cancel: новий тест на 50 колонках, «on 80×24 search → … Run → F6 → Esc», «on 60×18…».

### Аудит контрактів (крок 6)

- Усі прикладні команди `src/cli.ts` — `init`, `agents`, `baseline`, `feature`, `map` і `map --check`, `check` (повний, `--changed`, `--explain-edge`), `explain` (код, id, `--llm`, `--stale`, план, batch), `draft flow|rules|map`, `spec-to-code` (зокрема `--apply`), `code-to-spec`, `wire`, `trace-plan`, `parse`, `fmt`, `doctor` — викликають `runOperation`.
- Старі копії оркестрації видалено в тікетах 01–34; у `cli.ts` лишились лише розбір argv і принтери.
- Поза операціями лишились:
  - `analyze` у `cmdCodeToSpec`: аналіз для резолвінгу шляху, переданий в операцію через `context.analyze` (тікет 26);
  - `hook stop`: протокольний вхід;
  - `lsp`, `mcp` і `web`: транспорти.
- Жоден модуль `src/` не імпортує `cli.ts`. Шари `operations < tui < cli` перевіряє `keylang check` (0 fail).
- `node:child_process` імпортують лише `src/git-changes.ts` (git) і `src/tui/terminal.ts` (`$EDITOR`). Вкладеного keylang-процесу в коді немає; у циклі 38 spy це підтверджує для потоку сесії.
- Матриця `docs/tui-workspace.md` §3 = реєстр дій (тест A03, 38 aliases; протокольні lsp/mcp/web/hook — не дії).

### Зведений список змін CLI-контрактів за 05–37 (для перегляду користувачем)

Граматика argv, назви команд і прапорців не змінювались. Нижче — усі зафіксовані в Result тікетів відмінності stdout/stderr/кодів/запису. Звичайні сценарії в порівняннях з HEAD (`git archive`) дали SAME.

| Тікет | Команда | Зміна |
|---|---|---|
| 09 | `map` | Ціль через symlink за межі repo тепер відмова: код 1, нічого не записано (раніше `writeFileSync` ішов за посиланням). Змінені за час роботи входи чи цілі — код 1 і `keylang: nothing was written…`. Частковий I/O-збій — stderr `keylang: <path>: <err>` / `<path>: not written`, код 2. Кеш фактів при конфлікті більше не пишеться. |
| 10 | `baseline`, `init` | Ручний `rules.baseline.md` без маркера більше не перезаписується: код 1 `manual file…`; `--check` друкує `manual file…` замість `stale`. Ціль через посилання назовні — код 1 (раніше 2). Без джерел — код 2 з причиною. |
| 11 | `agents`, `init` | Ціль через посилання назовні чи змінений файл — відмова з кодом 1 до першого запису. Раніше — виняток посеред циклу, код 2 і частково записані файли. |
| 12 | `init` | `keylang.json` пишеться атомарно. I/O-помилка — `keylang: keylang.json: <причина>` (раніше сирий текст винятку). |
| 13 | `fmt` | Атомарний запис (temp + rename): жорсткі посилання розриваються. EACCES тепер з абсолютним шляхом. Файл, змінений між читанням і записом, — помилка цього файла, код 2. |
| 14 | `wire` | У рідкісній гонці — відмова з кодом 1 і рядками `path: reason` у stderr. I/O-помилка — `keylang: <out>: <message>`. |
| 15–16 | `check` | Повний check і `--changed` більше не пишуть кеш фактів. При збої git нотатки `notSpecs` не друкуються перед помилкою. Ref, що починається з `-`, відхиляється (також `code-to-spec --since`). |
| 22–23 | `draft flow` | Зміна цілі чи пропозиції між читанням і записом — failed 1 (раніше перезапис). Свіжість джерел перевіряється й для algo. `--into` поза `keylang/` більше не питає модель (вивід той самий). |
| 24 | `draft rules` | Для proposal з поганим `--into` модель не питається, тож рядків `conflict:` перед помилкою немає (помилка й код ті самі). |
| 27 | `code-to-spec` | Ціль і пропозиція перевіряються до моделі: при `--into` поза `keylang/` з моделлю приміток моделі немає (помилка й код ті самі). |
| 30 | `spec-to-code --apply` | Після часткового збою додано рядки `keylang: <file>: written` / `not written`. Специфікація чи джерело, змінені під час відповіді моделі, тепер відмовляють запис. При кількох конфліктах друкується кожен. Будь-який незаписаний файл, як і раніше, дає код 2. |
| 32 | `explain <id> --llm` | Зміна `keylang.json`, джерел, специфікацій чи самого файла пояснення під час очікування — код 1, причини в stderr, нічого не записано (раніше перезапис). |
| 34 | `explain --missing/--stale --llm` | Порожня відповідь моделі — помилка вузла (раніше порожній brief). Зміна входів під час batch зупиняє його з кодом 1 (outdated). Для сховища 0.1 примітка `note` іде в stderr після рядків прогресу. Виняток коду 1 для per-node failures збережено. |
| 01–08, 17–20, 25–26, 28–29, 31, 33, 35–37 | doctor, feature, map --check, explain-edge, export, parse, trace-plan, draft map, code-to-spec (file), spec-to-code, explain offline, explain plan | Байтово ті самі stdout, stderr і коди в порівняннях з HEAD. Explain-edge дає підказку `did you mean` лише в TUI. |

### Перевірки

- `npm run typecheck` ✓.
- `npm test`: 581 tests, 580 pass / 0 fail / 1 skipped ✓. Перед повним прогоном нові тести окремо: 38-цикл ✓, 50 колонок ✓, web-цикл ✓.
- `node bin/keylang.js map --check` ✓ (0): нових модулів у `src/` немає, карта не змінювалась.
- `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓.
- Чиста копія HEAD: див. «Карта» вище; на фінальному `fbc8812` у чистому worktree також `map --check` 0, `check` 0 fail / 71 ok, `tsc` 0, три нові тести ✓.
- Ручний TTY smoke (python `pty`, справжній `node bin/keylang.js`, копія `src/` keylang ≈100 файлів, 120×30): стартовий екран → init у сесії → палітра «map write» → крок цілей → Continue. Під час запису resize до 80×24 (SIGWINCH): прогрес малюється після resize, запис завершився. Палітра → help. `q` → код 0, alt-screen покинуто (`\x1b[?1049l`), termios слейва байтово ті самі, що до запуску.

### Залишкові ризики й припущення

- Spy процесів охоплює потік сесії, але не worker операцій. Для worker-а доказ статичний: у `src/` лише git і `$EDITOR` запускають процеси.
- Реальний вузький TTY (50–60 колонок) перевірено лише віртуальним терміналом; ручний smoke — 120→80.
- `keylang/map-explained/README.md` у робочому дереві лишається зміненим (рядок `extract` від WIP `src/extract/ts.ts`). Його треба закомітити разом із цим WIP або перегенерувати після нього.
- Відомі залишки з попередніх Result, не закриті тут (свідомо поза scope):
  - входи `tsconfig`/`package.json` резолверів не перевіряються перед commit (09/10);
  - немає глобального lock: гонка при expiry web-сесії під час commit (35/36);
  - `outdated` консервативний (будь-яка правка);
  - шляхи з пробілами у формах fmt/parse/check не підтримуються;
  - перевірка входів batch — O(brief-и × джерела);
  - Cancel посеред commit окремо перевірено для map, batch і `close()` worker-а, для export/wire/baseline/draft — ні (той самий протокол);
  - dirty-буфер цілі apply-code у TUI недосяжний (лише захист);
  - ambiguous-ребро explain-edge без окремої TUI-фікстури.

Коміти: `4f6842e` (карта на чистому HEAD), `fbc8812` (цей тікет).

## Comments

- 2026-10-01: виконано, коміти `4f6842e` (карта, чистий HEAD) і `fbc8812` (наскрізні тести, аудит); typecheck, npm test 581/580/0/1 skipped, map --check, check — зелені; ручний PTY smoke виконано.
