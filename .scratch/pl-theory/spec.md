# Мова крізь теорію мов програмування: виправлення з research-pl

**Джерело:** [docs/research-pl.md](../../docs/research-pl.md) (2026-09-29), перевірка кластерами й рецензентом 2026-09-29, рішення агента Q1–Q24 за дорученням користувача 2026-09-29. Терміни — `CONTEXT.md` («Text IR», «SpecIR», «Specification», «Snapshot», «Planned», «Baseline», «Feature»).

## Мета

Після фічі:
- Специфікацію після `fmt` GitHub і `check` читають однаково: жоден рядок не зникає й не з'являється мовчки через огорожу коду чи HTML-блок. Це стереже тест розбіжності з CommonMark (01–04).
- Вердикти монотонні й надійні. Менше інформації переводить `ok`/`fail` лише в `unverified`, `fail` ставиться тільки на надійно спостереженому, у кожного правила одна ідентичність `specHash`, а непорівнюване перекриття allow/deny не вирішується мовчки (05–09, 11–16, 36, 37).
- Семантика правил і потоків має незалежну модель: Datalog-модель правил, яку property-тест звіряє з CLI, і названа семантика flows (впорядковане ін'єктивне включення) з CLI-тестами граничних випадків (10, 27–29).
- SpecIR — одне місце тверджень. rules, flows, wiring, LSP, `feature`, TUI, trace-plan і авторські інструменти читають типізовані твердження, а не вгадують роль `refs[i]`. Неможливі стани виключено типами, причина K005 є в машинному виводі (17–26).
- Значення тексту не залежить від прапорця CLI чи версії пакета, а специфікація мови виконувана. Поля `format` і `check.static` у keylang.json прибирають діалекти (35, 38). format.md містить лише мову з виконуваними прикладами й EBNF, довідка інструментів — у docs/tools.md (30–34).

Поруч — менші зрізи: K008 для неоднозначного `then` (39), життєвий цикл LSP (40), ADR 0006 про власний транспорт (41), протокол usability-проби (43). Властивості потоків Р-13 (44–47) — після v1.

## Рішення (агент, 2026-09-29)

Користувач доручив агенту відповісти на всі питання, на які можна відповісти самостійно. Рішення, що змінюють значення наявних текстів, перелічено в «Несумісних змінах».

| # | Рішення | Тікети |
|---|---|---|
| Q1 | 49 тікетів в одній фічі. Р-13 — needs-triage до v1, команда міграції й Р-14 — wontfix з умовою повернення | усі |
| Q2 | Семантичні виправлення `rules.ts` (06, 07, 14, 15, 16) і `flows.ts` (10–13) — до міграції на SpecIR; 09 — до SpecIR expand. Міграція стає чистим рефакторингом проти еталону 17 | 18, 19, 20 |
| Q3 | Огорожа за CommonMark: закривна — той самий символ, довжина ≥ відкривної, далі лише пробіли; info-рядок бектик-огорожі з бектиком — проза; відступ ≥ 4 поза відкритим списком — проза. Рішення **Р15** у format.md | 02 |
| Q4 | `fmt` знімає відступ огорожі й вмісту під елементом. Значення не змінюється, `fmt --check` на таких файлах дає 1 | 03 |
| Q5 | Рядки багаторядкових HTML-блоків типів 1–5 CommonMark — проза в наявному Item `prose`; форма `parse --json` та сама | 04 |
| Q6 | Норма у format.md §7: менше інформації (exclude, нерозв'язаний імпорт, `--static shape`) переводить `ok`/`fail` лише в `unverified`. K103 — остаточний вердикт нарівні з ok/fail. Область `no-cycles` під модулем — модуль, підмодулі й досяжні з них import/re-export-ребрами модулі. Область `layers` — увесь зв'язний частковий порядок і шари поза ним (вкладені, `unassigned`) | 05, 06, 07 |
| Q7 | Пакет `external.<pkg>` відомий із маніфесту, який keylang уже читає, лише для резолвінгу K001, без нового вузла у знімку. `planned module external.<pkg>` дає K202, лише коли пакет з'являється в імпортах | 08 |
| Q8 | Один `specHash` на рядок правила для всіх його результатів. K101 — хеш канонічного тексту всіх рядків `layers` зв'язного порядку. Хешування `message` (assess.ts:69) і `"no snapshot"` (rules.ts:87) прибрати | 09 |
| Q9 | Кожен найспецифічніший `deny` дає власну K102 і `fail`. `deny`, перебитий строго специфічнішим, лишається `ok` «decided by more specific rules» | 14 |
| Q10 | Рядок `layers` без вердикту, коли залежність угору вирішив `deny` (як при K101); на ребро одна K102. Для `allow` — `ok` з evidence «…or is allowed by `allow …`» | 15 |
| Q11 | Правило з K005 (`deny <fn>`) не діє ніде: його не застосовують wiring, LSP-completion і spec-to-code | 16 |
| Q12 | Поточна поведінка flows стає нормою: впорядковане ін'єктивне включення, кроки гілки `when` не впорядковані з сусідами, з максимальних часткових включень обирається те, що має більше `ok`, потім менше `fail`, потім раніші spans. Відхилення закривають тікети: інше дерево — 11, кілька тригерів і діти planned — 12, вкладений сусід — 13 | 10 |
| Q13 | Крок лише в корені іншого дерева викликів — `unverified … observed outside <parent> in another call tree`, якщо span не почався раніше за образ батька на тому самому годиннику. `fail … missing step` — коли span-а символу немає ніде, усі spans у тому самому дереві поза батьком або почалися раніше. Визначення `fail` з тікета 10 оновлює 11 | 11 |
| Q14 | Другий і наступні тригери — `trace unverified … a flow is matched from its first trigger only`. Діти planned-кроку — `trace unverified … parent step <id> is planned`, static — `parent <id> is planned, not implemented`. `check --strict` на таких потоках: 0 → 1 | 12 |
| Q15 | Образ кроку, вкладений в образ попереднього сусіда, у завершеному запуску — `fail … nested in <prev>, not after it` | 13 |
| Q16 | `reason` K005 — шість значень: `arguments`, `id`, `link`, `quote`, `layer`, `scope` (fn/type/event в allow/deny, залежить від знімка). Опційне поле публічного типу `Diagnostic`. parser.ts:512 змішує три причини: невалідний ID дає `id`, решта — `arguments` | 25, 26 |
| Q17 | Поле `"format"` (ціле) у keylang.json; відсутнє = 1. Невідоме чи новіше — код 2 з назвою файла й поля для всіх команд, що читають конфіг, зокрема `fmt` і `parse`; `keylang lsp` показує помилку клієнту й не завершується. Без keylang.json діє поточний формат. `init` і `draft map` пишуть поточний. Формат 1 підтримується до мажорної версії пакета, `fmt` мовчки не мігрує. ADR **0007**; речення format.md §11 про `snapshotId` виправити | 35 |
| Q18 | Крок 1: K106 (warning) на пару непорівнюваних правил, що перекриваються (одне вужче за джерелом, інше — за ціллю), коли `allow` перемагає лише сумою глибин і правила на перетині немає, тобто саме там, де формат 2 вирішить інакше. Так K106 не шумить на парах baseline, де при рівній сумі й так перемагає `deny`. Переможець той самий, друга позиція — у тексті повідомлення; evidence не називає таку пару «more specific». Крок 2: лише у `format: 2` — **deny-overrides**; формат 2 не чекає на заморожування v1, `init` після 37 пише `format: 2` | 36, 37 |
| Q19 | Поле `check.static`: `"behavior"` \| `"shape"`. Пріоритет: прапорець > конфіг > `behavior`. LSP, MCP, TUI, web, `feature` і `hook stop` читають конфіг. Невалідне значення — код 2 з полем `check.static` (крім `lsp`, див. Q17). Evidence називає режим і джерело. Типове значення змінюється лише з новою версією формату; `--help` згадує поле | 38 |
| Q20 | Код **K008** (warning; K007 зарезервовано design.md:179). Спрацьовує, коли `then` з одного токена без крапки (зокрема форма лінка) точно, з урахуванням регістру, збігається з останнім сегментом ID вузла знімка чи `planned`. Підказка `did you mean then <повний ID>` з усіма кандидатами, стабільно відсортованими. Код виходу `check` не змінюється; K008 повертає й публічний `check()`, union `Code` розширюється | 39 |
| Q21 | Власний транспорт LSP — записаний виняток з ADR 0002 (ADR **0006**) з тригерами перегляду: `workspace/didChangeWatchedFiles`-реєстрація, прогрес, семантичні токени чи інша частина протоколу, яку дорожче писати, ніж взяти. Міграція — wontfix з цією умовою повернення | 41, 42 |
| Q22 | format.md — мова §1–§11 (модель файлу, граматика, статична семантика, семантика перевірки, таблиця K-кодів, вердикти, схеми звіту тестів і trace JSONL, поля keylang.json, що змінюють значення, канонічна форма, IR і позиції); номери зберігаються, §12 стає вказівником. docs/tools.md — команди CLI, формати виводу, адаптери, MCP, LSP, TUI, web, харнеси. AGENTS.md — один рядок про tools.md | 30, 31 |
| Q23 | Р-13 — після v1, додатковою граматикою: ці рядки зараз дають K004, тож наявні тексти значення не змінюють. ADR **0008** знімає суперечність з design §4.3 і §10.9. Синтаксис `never <id>`, `at-most <N> <id>`, `never <b> before <a>`; ключові слова — один токен, контекстні (лише в потоках). Статус — needs-triage до заморожування v1 | 44–47 |
| Q24 | 43 пише протокол і розділяє design-v0.2/28 на пробу (28) і новий design-v0.2/40 «Заморожування формату v1». Заморожування блокують результати проби, 25, 32, 34, 35, 36 і 38; 39 — м'який блокер проби; 37 заморожування не блокує | 43 |

**Рішення без питання:**
- Номери ADR закріплено заздалегідь, щоб паралельні тікети не взяли той самий: 0006 — транспорт LSP (41), 0007 — версії формату (35), 0008 — LTLf (44).
- `docs/research-pl.md` — знімок на дату, його не редагуємо, і таблицю §3 тікети не оновлюють. Виправлення записано нижче, у «Виправленнях дослідження».
- Р-12 (25) не чекає на SpecIR: `reason` додається в наявні місця K005. Тікет 24 переносить K005 рівня check у `compileSpec` разом із `reason`, тож 25 ⇢ 24 — порядок злиття, а 24 має критерій «`reason` збережено».
- Вартість тестів і вибір фікстур — у «Тестових швах».
- Кожен тікет, що змінює `src/`, має спільний критерій: `npm run typecheck`, `npm test`, `node bin/keylang.js map` (diff переглянуто; якщо увімкнено explain.map — і карта з поясненнями), `map --check` = 0, `check` на репозиторії — 0 fail.

## Перевірені факти (2026-09-29)

- HEAD 2774f85 на master, правки format.md закомічено (88a9ac1, 98a8e81). `check` на репозиторії дає 65 ok і 0 fail, `map --check` — 0. Власний потік `keylang/flows/check.md` називає `check.assess.assess`, `check.rules.evaluateRules` і `check.flows.evaluateFlows`, тож рефакторинг, що їх перейменовує, має оновити й цей потік.
- `Node` у Text IR — одна форма з nullable-полями (`src/ir.ts:99-124`) на 29 видів `NodeKind` (`src/ir.ts:40-79`). Типу SpecIR у `src/` і `tests/` немає; термін є в CONTEXT.md:25 і design.md:27, 33 (17, 18).
- Роль `refs[i]` поза parser.ts вгадують 19 місць у 10 файлах: rules.ts, flows.ts, lsp-features.ts, draft-llm.ts:110/122/155, spec-to-code.ts:191, changed.ts:109/120, feature-status.ts:83, wiring.ts:61/65/69, tui/assist.ts:303, tui/app.ts:559. Приватні типізовані форми вже є: `Rule`/`LayerOrder`/`Collected` (rules.ts:23, 32, 425-441), `Wire`/`WireDep` (wiring.ts:12-29), `ShapeNode` (тип — trace-evidence.ts:142, будується у flows.ts:113-127). Потоки з Text IR читають ще `flowSymbols` (trace-plan.ts:41-60), lsp-features.ts:264, tui/nav.ts:90, explain-node.ts:46 і spec-to-code.ts:111, 242 (19–23).
- K005 видають 33 місця виклику: parser.ts — 26 (рядки 336-697), rules.ts — 6 (469, 486, 518, 530, 533, 563), wiring.ts:75. parser.ts:512 змішує три причини, rules.ts:469 тестом не покрито. `parse` на `- layers a < d.y` дає код 0, а `check` — K005 і код 1 (24, 25).
- `CheckResult` (check-results.ts:12-29) не має поля причини K005, `explain K005` друкує лише cause, example і fix. `Diagnostic` уже має опційні `target`, `criterion`, `area` (diag.ts:52-59) і експортується з src/index.ts:8. `parse --json` серіалізує `Document.diagnostics` напряму (cli.ts:1057), MCP перелічує поля явно (mcp.ts:238-239, 268) (25, 26).
- `deny app.checkout.checkout infra` дає K005 у rules (rules.ts:484-488), але `denyingRule` (rules.ts:70-74, `kindOf = () => undefined`) правило застосовує: wiring дає K102, spec-to-code.ts:64 його враховує. LSP-completion (lsp-features.ts:569, 578) застосовує лише fn на боці цілі (`deny app infra.db.save`), бо джерело — модуль довкола курсора (16).
- Огорожа закривається лише рядком, що точно дорівнює маркеру (parser.ts:260). Рядок прози, що починається з трьох бектиків, робить решту файла кодом: `- deny a b` після нього дає `0 fail, 0 unverified, 0 ok` і код 0 — хибний зелений `check`. Багаторядковий `<!-- … -->` з `- deny a b` дає вузол, який перевіряється (K001). `fmt` лишає огорожу з відступом під елементом (02–04).
- mdast, micromark і commonmark немає в package.json, package-lock.json, `src/` і `tests/` (лише коментар parser.ts:4). Корпус — 42 `.md`-файли, K003 має лише tests/fixtures/diagnostics/indent.md, решта 41 не розходяться з CommonMark ні до `fmt`, ні після (прототип), тож баги ловлять лише цільові фікстури (01).
- format.md:245 — один абзац на 21 343 байти. Довідка інструментів займає ~97 КБ із 199 КБ. EBNF є лише в §2 (:27-32) і §4 (:90-110), два приклади ```markdown (:79, :126) не перевіряються. tests/cli.test.ts:1232-1248 читає таблицю K-кодів із format.md, тож вона лишається там (30–34).
- `specific()` (rules.ts:405-423): score — сума глибин джерела й цілі, окремо для кожної цілі; заміна лише за строго більшого score, при рівності deny перемагає allow. З двох однаково специфічних `deny` K102 дає перший за порядком файлів (файли впорядковано за назвою, files.ts:44, тож baseline іде раніше за rules.md), другий отримує `ok` (14, 36, 37).
- `layers domain < app` + `deny domain app` з ребром угору дають K102 і хибний `ok` «points down» рядка `layers` (rules.ts:201-211), хоча format.md:261 такого `ok` не допускає (15).
- Правила враховують лише resolved-ребра, пропускають `via: injected` (rules.ts:125) і відкидають ребра всередині файла (rules.ts:131-134). allow/deny зіставляються з найближчим модулем (класи включно), layers, entry і no-cycles — з файлом-модулем (27–29).
- Метаморфні контрприклади під `exclude` одного файла: `no-cycles` під модулем — K105 → ok, бо прогалини шукаються лише під модулем (rules.ts:366); `layers` — K101 → ok, бо область відкидає `rules.unordered` із синтетичними шарами (rules.ts:53, 227-231); `allow infra external.pg` дає новий K001, хоча `pg` є в package.json. Пара `--static shape` проти `behavior` на репозиторії дає лише 3 переходи ok → unverified (05–08).
- Один рядок правила має різні `specHash`: no-cycles ok проти K105/unverified, entry ok проти unverified окремого модуля. K101 хешує текст «layers infra app», якого ніхто не писав. Уточнений ID-вердикт `unverified` хешує повідомлення (assess.ts:69), результат «no snapshot» — рядок `"no snapshot"` (rules.ts:87). У `src/` specHash ніхто не читає (09).
- `--static` перевіряється в cli.ts:1070-1071, типове значення задано двічі (cli.ts:238, flows.ts:388). LSP (lsp.ts:195), MCP (mcp.ts:57, 237), TUI (tui/terminal.ts:130), web (tui/web.ts:170), `feature` (cli.ts:863) і `hook stop` (cli.ts:880) викликають `analyze()` без static. `"check": {"static": …}` дає `unknown field` і код 2 (config.ts:188). Evidence згадує прапорець навіть без нього (flows.ts:345) (38).
- Trace: Matcher з `MATCH_BUDGET = 200_000` (trace-evidence.ts:198); кроки `when` не впорядковані з сусідами (trace-evidence.ts:412-424); зіставляється лише перший `trigger` (flows.ts:109, 127); planned-вузол відкидає дітей (flows.ts:122); однакові сусідні кроки вже покрито тестом (tests/flows.test.ts:540-543) (10, 12).
- Проби на тимчасових репо показали чотири відхилення від впорядкованого включення. Кореневий span кроку в іншому дереві викликів дає хибний `trace fail … missing step` (S11, S11c). Синхронний сусід усередині попереднього дає `unverified (parallel)` (S1), async-сусід з links — `ok` (S2). Другий тригер і діти planned-кроку не мають trace-рядка, `--strict` дає 0 (S8, S10). Rust і Python мають один clockId на процес (adapters/rust/keylang_trace.rs:276, adapters/python/keylang_trace.py:79), тож інший потік від іншого дерева не відрізнити (11–13).
- Union `Code` містить K001–K006, K101–K105, K201–K202, K301–K302 (diag.ts:5-38). K007 зарезервовано під дублювання потоків (design.md:179), K008 і K106 вільні. `EXPLANATIONS: Record<Code, …>` (explain.ts:5) змушує typecheck вимагати пояснення для кожного коду. Попередження — K006, K103, K202 (diag.ts:43) (36, 39).
- Baseline пише маркер (baseline.ts:42) і пари `deny <шар> external` + `allow <шар> external.<pkg>` (baseline.ts:47-50). Вони навхрест перетинаються з рукописним `deny app.x external`: на тимчасовому репо — 2×K102 (36, 37).
- Білий список полів keylang.json (config.ts:147) не має поля версії: `"format": 1` дає `unknown field` і код 2. `configToJson` — config.ts:234-244, `init` наявний файл не переписує (cli.ts:815-823). `snapshotId` бере з конфігу лише dir, languages, module, layers, exclude і guessed (snapshot.ts:173-180), хоча format.md §11 каже, що його змінює будь-яка зміна keylang.json. Машинні JSON уже версіоновано: `schemaVersion` 1 у звіті, trace і плані, `schema: 7` у знімку (snapshot.ts:14), `schema: 1` у кеші фактів (35).
- `then` вгадує форму (parser.ts:497-506): рівно один крапковий ID стає посиланням, усе інше — текстом. `then OutOfStock`, `then save` і `then [createOrder](…)` мовчки стають текстом, код 0 навіть із `--strict`. Голе `then application.purchase.OutOfStock` є в examples/shop*/flows/checkout.md:15 (39).
- LSP-транспорт написано вручну (lsp.ts:31-76), `positionEncoding` завжди utf-16 (lsp.ts:311), як вимагає специфікація. Запит до `initialize` отримує результат замість -32002 (lsp.ts:253), кінець stdin без `exit` дає код 0. Контракти транспорту закріплено в tests/lsp.test.ts:363/376/389 і tests/core.test.ts:173. Ручний транспорт уже дав 4 баги, усі виправлено (docs/review-2026-09-28-m0-m4.md:32, 38, 40; docs/review-2026-09-28-full.md:146) (40, 41).
- vscode-jsonrpc 8.2.0 не відповідає -32700 на невалідний JSON (messageReader.js:162-169), читає далі після кадру без Content-Length (:139-141) і на `$/cancelRequest` лише скасовує токен (connection.js:389-392). design §7.4 суперечить сам собі: рядок LSP (design.md:526) проти правила залежностей (design.md:538), а format.md:389 спирається на §7.4 (41).
- Рядки `never …`, `at most …` і `never … before …` сьогодні дають K004 у всіх позиціях. Евристика `quantitative()` — flows.ts:208-211, `flowSymbols` інструментує лише trigger і step (trace-plan.ts:41-60) (44–47).
- fast-check немає в package.json. `check --format json` на крихітному репо займає ≈ 0,34 с, з них ~0,27 с — старт Node; in-process `analyze()` — ≈ 4 мс на випадок. docs/adr/ містить 0001–0005. design-v0.2/28 має статус ready-for-human, його блокер 26 уже resolved (27, 43).

## Виправлення дослідження

research-pl.md не редагуємо (знімок на дату); його поправки — тут.

- **Р-1.** Споживачів, що вгадують роль `refs[i]`, 10, а не 5: дослідження пропускає changed.ts (дубль `collectRules`/`addRule`), feature-status.ts, wiring.ts, tui/assist.ts і tui/app.ts, а також читачів потоків trace-plan.ts, explain-node.ts і tui/nav.ts. Реалістична оцінка — M–L (6–9 днів на 17–24), а не M.
- **Р-1.** У шарі check K005 є ще в rules.ts:530, 533, 563 і wiring.ts:75. 26 K005 парсера лишаються в парсері, інакше зміняться `parse --json` і код виходу `parse`. rules.ts:486 потребує знімка й лишається в check (24).
- **Р-1.** Критерій «ті самі результати на репо» перевірний лише без `snapshotId`, бо рефакторинг `src/` змінює знімок. Строгий еталон можливий тільки на фікстурах (17).
- **Р-2.** Після `fmt` розбіжність лишається для трьох класів: огорожа з відступом під елементом (Р9, 03); довша закривна огорожа або рядок прози з трьох бектиків (02); багаторядкові HTML-блоки типів 1–5 (04). Речення курсу docs/course/03-the-language.md:5 («aligned after `fmt`») поки хибне; його повертають 02–04, коли allowlist «після fmt» порожній.
- **Р-2.** Корпус із 41 файла вже не розходиться з CommonMark, тож баги ловлять лише цільові фікстури (01).
- **Р-3.** Ескіз Datalog не описує поточної поведінки: у ньому немає K101 і його взаємодії з переможним allow/deny (15); рівність двох однаково специфічних правил з одним ефектом код вирішує порядком файлів, а не «обидва переможці» (14); ескіз не враховує, що беруться лише resolved-ребра, без `via: injected` і ребер усередині файла, і що allow/deny зіставляються з модулем, а layers/entry/no-cycles — з файлом. Реальний обсяг — 25–40 рядків Datalog і ~150 рядків моделі (27–29).
- **Р-3.** 500 випадків через CLI тривають ≈ 3 хв, а не секунди. Тому в `npm test` N=20, а 500 — через env (27).
- **Р-4.** Пари на названих фікстурах не порожні, але їх замало. Правила має лише tests/fixtures/repo: `keylang/rules.md` містить `layers domain < app` з вкладеним `infra` (вкладений шар поза порядком — контрприклад 07), `deny`, `entry` і `no-cycles`. wiring-shop має `keylang/wiring.md`, py-shop і rust-shop специфікацій не мають, потоків немає в жодній. Тому 05 доповнює rules.md фікстури repo, а не затирає його, і додає потоки в тимчасових копіях. Ключ `(критерій, область, файл, рядок)` для правил нестабільний, а `specHash` не є ідентичністю правила (09).
- **Р-4.** Гіпотеза «переходу ok ↔ fail бути не може» хибна: є три контрприклади — no-cycles під модулем (06), область layers (07), `external.<pkg>` (08).
- **Р-5.** Ін'єктивність описано лише в design §4.3 і format.md:309, у §3.4 її немає. Тест однакових сусідів уже є (tests/flows.test.ts:540). Код відходить від впорядкованого включення в чотирьох місцях: сусід у піддереві попереднього (13), корінь іншого дерева (11), другий тригер і діти planned-кроку (12).
- **Р-5.** Алгоритми Kilpeläinen–Mannila дають булеве включення, а keylang потрібне максимальне часткове включення з вердиктом для кожного кроку. Підстав міняти наявний Matcher без вимірювання немає (10).
- **Р-6.** Твердження про незакомічені правки у format.md застаріло. EBNF є лише в §2 і §4, а не в §2–§5. Таблиця K-кодів лишається у format.md, бо її читає тест. Перенос ламав би посилання на номери розділів у design.md, курсі й коментарях `src/`, тож номери §1–§11 зберігаються (30).
- **Р-7.** Бібліотека не узгоджує `positionEncoding`: режим обирає сервер, utf-16 обов'язкове, і keylang уже відповідає специфікації. vscode-jsonrpc без адаптерів не дає трьох закріплених контрактів: -32700, код 2 без Content-Length і негайної -32800. Частину контракту транспорту закріплено в tests/core.test.ts:173, а не лише в tests/lsp.test.ts (41).
- **Р-8.** format.md:262, курс 05-rules.md:38 і tests/core.test.ts:403 називають перехресну пару «рівною», а в частковому порядку вона непорівнювана. У `Diagnostic` один span, тож другу позицію можна дати лише в тексті повідомлення. K106 на кожну непорівнювану пару шуміла б на кожен пакет baseline (36).
- **Р-8.** Автор не лишається зовсім без інформації: JSON evidence називає переможця, але хибно називає його «more specific» (36).
- **Р-9.** Форма лінка `then [x](…)` без крапки теж стає текстом. Вкладеність має не 6–7, а щонайменше 10 значень. K007 зарезервовано в design.md:179, тож новий код — K008 (39).
- **Р-10.** Знімок версіонується полем `schema: 7`, кеш фактів — `schema: 1`, а не лише `schemaVersion`. Пропозиція «відсутнє поле = поточна версія» суперечить власній політиці editions, тож обрано «відсутнє = 1». JSON Schema для keylang.json (design.md:609) не існує (35).
- **Р-11.** Розбіжність між поверхнями виникає лише тоді, коли CI запускає `--static=shape`: LSP, MCP, TUI, web, `feature` і `hook stop` завжди працюють у behavior. `feature --static=shape` мовчки ігнорує прапорець (38).
- **Р-12.** K005 має 33 місця виклику й 35 повідомлень. П'яти причин не вистачає: fn/type/event в `allow`/`deny` залежить від знімка й потребує окремої причини `scope`. parser.ts:512 змішує три причини. Поле з'явиться й у `parse --json`, LSP, MCP і SARIF. `explain K005` зараз причин не перелічує (25, 26).
- **Р-13.** design §4.3 і §10.9 (design.md:642) ставлять граматику властивостей до заморожування v1, а дослідження — після. Суперечність знімає ADR 0008 на користь «після v1» (44, Q23); §10.9 охоплює й інші пункти (planned, assertions, паралельні групи, baseline), їх ADR не зачіпає. Адаптери інструментують лише символи trigger і step, тож `never` бере символи зі `spec.flows` (45).
- **Р-14.** Starlark і Dhall мають абстракцію (`def`/`lambda`, `let`/`λ`), вони лише обмежують рекурсію. Правила Datalog мають логічні змінні, тож буквально суперечать формулюванню §6 «не додавати змінні». Soufflé як runtime порушує ADR 0002, бо потребує native-збірки (49).
- **Р-15.** Premature commitment виявляється лише частково: `init` вгадує шари з наявних тек (43).

## Тестові шви

Один шов — справжній CLI. Сюїти `node:test` у `tests/*.test.ts` запускають `bin/keylang.js` на тимчасових копіях фікстур (mkdtemp, прибирання після тесту) і перевіряють stdout, stderr, коди виходу 0/1/2, spans і відсутність запису в `--check`.
- Юніт-рівень — лише три місця. Еталонна модель правил (27–29) — чиста функція над фактами без імпортів із `src/`, яку property-тест звіряє з CLI. Порівняння з CommonMark (01) — `mdast-util-from-markdown` проти `parse --json`. Чиста `compileSpec` (18, 24) — юніт-тест на фікстурах еталона 17.
- Метаморфні пари (05) — лише на фікстурах у тимчасових копіях, ніколи на самому репозиторії: його keylang.json читає локальні `.keylang/reports` і `.keylang/trace`, які перезаписує `npm test`. Фікстуру tests/fixtures/repo доповнюють, а не затирають її `keylang/rules.md`.
- Еталон 17 — дві фікстури: `spec-forms/valid` (вердикти й specHash) і `spec-forms/invalid` (K005). `snapshotId` нормалізується, перевіряється лише формат `^[0-9a-f]{64}$`.
- Виконувані приклади format.md (32–34) живуть у `tests/format-examples.test.ts`, який створює 32. Приклад іде в CLI як `keylang/example.md` або з явним шляхом.
- Бюджет (рішення агента): нові сюїти разом ≤ ~20 с у `npm test` (`--test-concurrency=1`), частки — 01 ≤ 3 с, 05 ≤ 4 с (одна пара `exclude` на фікстуру), 17 ≤ 2 с, 27–29 ≤ 7 с (N=20), 32–34 ≤ 4 с. Корпус CommonMark — один процес `parse --json <теки>` на теку і один `fmt` на тимчасову копію всього корпусу. Property-тест — N=20 з фіксованим seed (`KEYLANG_MODEL_SEED`). Важкі прогони — лише через env: 500 випадків моделі — `KEYLANG_MODEL_RUNS=500` (27–29, 36, 37), `exclude` по кожному файлу — `KEYLANG_METAMORPHIC=all` (05).
- Жодної мережі й локальних даних користувача. devDependency (`mdast-util-from-markdown`, `fast-check`) встановлюються один раз, далі тести офлайн; кількість транзитивних пакетів і ліцензії перевіряє `npm ls --all` при встановленні.

## Несумісні зміни

- **02:** рядки після прози, що починається з трьох бектиків (зокрема info-рядка з бектиком), після огорожі з відступом ≥ 4 поза списком і після довшої закривної огорожі знову стають вузлами. Вони можуть дати нові діагностики й код 1.
- **03:** `fmt --check` на наявних файлах з огорожею з відступом під елементом дає 1. `fmt` знімає відступ, значення не змінюється.
- **04:** елементи всередині багаторядкових HTML-блоків (`<!-- -->`, `<pre>` тощо) перестають бути вузлами й не перевіряються. Форма `parse --json` та сама.
- **06, 07:** частина `ok` для `no-cycles` під модулем і рядків `layers` стає `unverified`, тож `check --strict` на таких репо дає 1. Норму монотонності записує 05.
- **08:** K001 для `external.<pkg>` зникає, коли пакет оголошено в `package.json` чи `Cargo.toml`, навіть якщо його єдиний імпортер виключено або імпорту немає; код `check` у таких випадках 1 → 0. Знімок не змінюється: нового вузла немає, `planned module external.<pkg>` дає K202, лише коли пакет з'являється в імпортах.
- **09:** змінюються значення `specHash` для no-cycles, entry, K101, уточненого ID-вердикту й «no snapshot» у `check --format json` і SARIF. Форма та сама.
- **11:** крок, спостережений лише в іншому дереві викликів, змінює вердикт з `fail` на `unverified`.
- **12:** нові trace-рядки для другого й наступних тригерів і дітей planned-кроку, новий static-рядок для дітей planned. `check --strict` на таких потоках дає 1 замість 0.
- **13:** async-сусід у піддереві попереднього змінює вердикт з `ok` на `fail`, синхронне вкладення — з `unverified` на `fail`.
- **14:** другий однаково специфічний `deny` змінює вердикт з `ok` на `fail`, з'являються додаткові рядки K102. Код виходу вже 1 через першу K102.
- **15:** зникає хибний `ok` рядка `layers`, коли ребро вирішив `deny`; змінюється evidence для `allow`.
- **16:** `allow`/`deny` над fn/type/event (K005) перестають діяти у wiring (немає K102), LSP-completion і spec-to-code.
- **19:** два граничні випадки: `exports` без імен більше не дає K104 поруч із K005 парсера, `entry` без вкладених елементів не отримує власного `ok`. Коди виходу ті самі.
- **25:** нове опційне поле `reason` у публічному типі `Diagnostic`, `check --format json` і `parse --json`; змінюється текст `explain K005`.
- **26:** те саме поле в LSP `data.reason`, діагностиках MCP і SARIF `properties.reason`.
- **30, 31:** довідка CLI, MCP, LSP, TUI і web переїжджає з docs/format.md у docs/tools.md, абзац format.md:245 стає таблицею команд. Номери §1–§11 зберігаються, §12 стає вказівником.
- **35:** нове поле `format` у keylang.json; `init` і `draft map` його пишуть. Невідома чи новіша версія дає код 2 у всіх командах, що читають конфіг, зокрема `fmt` і `parse`. Відсутнє поле = 1, значення старих конфігів не змінюється.
- **36:** новий код K106 (warning); публічний union `Code` розширюється. Доповнено тексти K102 і evidence `ok` для deny: непорівнювана пара більше не «more specific». Вердикти й коди виходу ті самі.
- **37:** у `format: 2` змінюється переможець непорівнюваних allow/deny (deny-overrides); `init` пише `format: 2`, тож змінюються очікування init-тестів. Конфіги формату 1 значення не змінюють.
- **38:** нове необов'язкове поле `check.static`, яке раніше давало `unknown field` і код 2. LSP, MCP, TUI, web, `feature` і `hook stop` починають його враховувати; evidence замість «with --static=shape» називає режим і джерело.
- **39:** новий код K008 (warning) у stdout `check`, JSON, SARIF, GitHub і публічному `check()`; union `Code` розширюється. Коди виходу, IR і `parse --json` ті самі.
- **40:** `keylang lsp` відповідає -32002 на запит до `initialize`.
- **45–47 (після v1, needs-triage):** нові контекстні ключові слова потоків `never`, `at-most` і `never … before …` та нові `area` у JSON. Ці рядки зараз дають K004, тож наявні тексти значення не змінюють.

Більше не є зміною: нових runtime-залежностей LSP немає, бо міграцію транспорту (42) закрито як wontfix (Q21).

## Поза обсягом

- Те, чого радить не робити research-pl §6: генератор парсерів чи Langium; змінні, макроси, умови й цикли в специфікаціях; імпорти й відносні імена (крім `exports`); локалізація ключових слів; підтримка всього CommonMark; інкрементальний рушій на кшталт Salsa без вимірювань.
- Інші багатозначності вкладеності (`module` під шаром — оголошення, а в rules — посилання; `when` у flow — текст, а у wiring — `умова → id`; вкладеність має щонайменше 10 значень). Це прийнята ціна Markdown: її компенсує LSP-hover, а вимірює проба 43 (role-expressiveness).
- Обов'язкова форма лінка для `then`: відкинуто, бо ламає наявні тексти. Замість неї — попередження K008 (39).
- Автовиправлення `then` у `fmt`: заміна тексту посиланням змінює семантику.
- Проведення сесій usability-проби й тріаж знахідок — робота design-v0.2/28. Тікет 43 лише готує протокол і розділяє 28 на пробу й design-v0.2/40.
- Оновлення таблиці research-pl §3 і самого дослідження.
- Рядок design §7.4 «Markdown — власний рендерер» (41 його не зачіпає).
- «Мертве allow»: `allow` з тією самою областю, що й `deny` у baseline, ніколи не діє, і автор про це не дізнається. Кандидат на окремий follow-up.
- Поле `severity` у діагностиках MCP `validate_spec`; `reason` для інших кодів (K003) і у виводі `--format github`.
- Мовчазне ігнорування непридатних прапорців CLI (`feature --static`, `map --strict --format sarif`) — окремий DX-тікет.
- Показ чинного режиму `static` і версії `format` у `check --format json` і SARIF.
- Приклади для кожного K-коду: `explain` уже покриває кожен код.
- JSON Schema для keylang.json (design.md:609).
- Явні паралельні групи в потоках, assertions, дедлайни, загальні формули LTLf і static-доказ відсутності (`never`).
- Зміна типового `static` на `shape` без нової версії формату.

## Граф блокувань

```
01–10, 14–17, 30, 35, 38–41, 43   (без блокерів — можна починати одразу)

10 → 11, 12, 13               (семантика flows → інше дерево викликів, trace-вердикт для кожного кроку, вкладений сусід)
17, 09 → 18                   (еталон spec-forms; specHash до того, як канонічний текст ляже в SpecIR → SpecIR expand)
18, 06, 07, 14, 15, 16 → 19   (SpecIR + семантичні виправлення rules.ts → migrate rules, Q2)
18, 10, 11, 12, 13 → 20       (SpecIR + семантичні виправлення flows → migrate flows, Q2)
19 → 21, 22, 23               (rules над SpecIR → wiring; LSP/changed/feature/TUI/trace-plan; draft-llm/spec-to-code/explain)
20, 21, 22, 23 → 24           (усі міграції → SpecIR contract)
17 → 25 → 26                  (еталон → reason K005 у JSON → LSP/MCP/SARIF)
14 → 27 → 28 → 29             (рівні deny → модель allow/deny → layers/entry/cycles → прогалини)
15 → 28                       (layers поруч із deny → модель layers)
06, 07, 08 → 29               (області прогалин → модель прогалин)
30 → 31                       (перенос у docs/tools.md → таблиця команд)
01 → 32 → 33, 34              (devDependency mdast → виконувані приклади → EBNF; приклади рішень Рn)
19, 27 → 36                   (K106 над SpecIR і моделлю allow/deny)
24, 35, 36 → 37               (одна сигнатура denyingRule + поле format + K106 → формат 2)
40, 41 → 42                   (wontfix: транспорт на vscode-jsonrpc)
35 → 44 → 45 → 46             (needs-triage: версія формату → ADR LTLf → never → at-most)
11, 20, 33 → 45               (never: правило кореневих spans, символи зі spec.flows, EBNF)
45, 13 → 47                   (never-before: never + вкладений сусід)
37 → 48                       (wontfix: команда міграції)
29, 35, 36 → 49               (wontfix: запити Datalog)

Порядок злиття, не блокери (⇢):
02 ⇢ 03                       (обидва правлять огорожі)
01 ⇢ 02, 03, 04               (запис allowlist знімається, якщо 01 злито)
05 ⇢ 06, 07, 08               (todo-підтести знімаються, якщо 05 злито)
25 ⇢ 24                       (24 переносить K005 у compileSpec разом із reason)
30 ⇢ 32                       (приклади лежать у мовній частині format.md)
22 ⇢ 45                       (45 розширює `flowSymbols`, який 22 переводить на spec.flows)
06 ⇄ 07, 14 ⇄ 15              (правлять той самий `evaluateOnSnapshot`: зливати по черзі, порядок довільний)

Зовнішнє:
43 → design-v0.2/28 (проба) + design-v0.2/40 (заморожування формату v1)
проба, 25, 32, 34, 35, 36, 38 → design-v0.2/40    (37 заморожування не блокує)
39 ⇢ design-v0.2/28           (K008 — м'який блокер проби)
```

Критичний шлях: 09, 17 → 18 → 19 → 21/22/23 → 24 → 37. Семантичні виправлення rules.ts (06, 07, 14–16) і flows.ts (10–13) зливаються до 19 і 20 відповідно (Q2).

## Тікети

| # | Тікет | Статус |
|---|---|---|
| 01 | [Тест розбіжності з CommonMark: корпус і allowlist відомих класів](issues/01-commonmark-differential-test.md) | ready-for-agent |
| 02 | [Огорожа коду за правилами CommonMark (Р15): жоден рядок специфікації не зникає мовчки](issues/02-fence-recognition-commonmark.md) | ready-for-agent |
| 03 | [`fmt` пише огорожу коду з колонки 0 (Р9)](issues/03-fmt-fence-column-zero.md) | ready-for-agent |
| 04 | [Сирі HTML-блоки типів 1–5 — проза: закоментований рядок специфікації не перевіряється](issues/04-html-blocks-as-prose.md) | ready-for-agent |
| 05 | [Метаморфний тест: менше інформації не перемикає `ok` ↔ `fail`](issues/05-metamorphic-verdict-monotonicity.md) | ready-for-agent |
| 06 | [`no-cycles` під модулем: прогалина в досяжному модулі дає `unverified`, а не `ok`](issues/06-no-cycles-hole-beyond-module.md) | ready-for-agent |
| 07 | [Область `layers`: увесь зв'язний порядок і шари поза порядком](issues/07-layers-area-whole-order.md) | ready-for-agent |
| 08 | [`external.<pkg>` з маніфесту: `exclude` єдиного імпортера не дає K001](issues/08-external-package-k001-under-exclude.md) | ready-for-agent |
| 09 | [`specHash` — одна ідентичність рядка правила для всіх його результатів](issues/09-spec-hash-rule-identity.md) | ready-for-agent |
| 10 | [Семантика flows — впорядковане ін'єктивне включення і граничні випадки в CLI-тестах](issues/10-flow-semantics-definition.md) | ready-for-agent |
| 11 | [Крок, спостережений лише в іншому дереві викликів, — `unverified`, а не `missing step`](issues/11-step-in-foreign-call-tree.md) | ready-for-agent |
| 12 | [Кожен тригер і крок отримує trace-вердикт, коли задано `check.trace`](issues/12-trace-verdict-every-step.md) | ready-for-agent |
| 13 | [Сусідній крок у піддереві попереднього сусіда не підтверджує порядок](issues/13-sibling-nested-in-previous.md) | ready-for-agent |
| 14 | [Однаково специфічні `deny` на одному ребрі: кожне дає власну K102](issues/14-deny-tie-equal-specificity.md) | ready-for-agent |
| 15 | [Рядок `layers` без `ok`, коли залежність угору вирішив `deny`; для `allow` evidence називає виняток](issues/15-layers-ok-hidden-by-deny.md) | ready-for-agent |
| 16 | [`allow`/`deny` над fn, type чи event (K005) не діють ніде](issues/16-deny-member-rule-consistency.md) | ready-for-agent |
| 17 | [Еталон `check` для всіх форм тверджень (сітка безпеки Р-1)](issues/17-spec-forms-golden.md) | ready-for-agent |
| 18 | [Р-1 expand: SpecIR і `compileSpec` у шарі `lang` поруч із Text IR](issues/18-spec-ir-expand.md) | ready-for-agent |
| 19 | [Р-1 migrate: `rules.ts` читає SpecIR замість обходу Text IR](issues/19-spec-ir-migrate-rules.md) | ready-for-agent |
| 20 | [Р-1 migrate: `flows.ts` і дерево trace будуються з SpecIR](issues/20-spec-ir-migrate-flows.md) | ready-for-agent |
| 21 | [Р-1 migrate: wiring із SpecIR, типи `Wire` у шарі `lang`](issues/21-spec-ir-migrate-wiring.md) | ready-for-agent |
| 22 | [Р-1 migrate: LSP, `check --changed`, `feature`, TUI і trace-plan читають SpecIR](issues/22-spec-ir-migrate-features.md) | ready-for-agent |
| 23 | [Р-1 migrate: `draft-llm`, `spec-to-code` і `explain <id>` читають SpecIR](issues/23-spec-ir-migrate-authoring.md) | ready-for-agent |
| 24 | [Р-1 contract: K005 форми тверджень переходять у `compileSpec`, стару форму прибрано](issues/24-spec-ir-contract.md) | ready-for-agent |
| 25 | [Причина K005 (`reason`) у `check --format json`, `parse --json` і `explain K005`](issues/25-k005-reason.md) | ready-for-agent |
| 26 | [`reason` K005 у LSP, MCP і SARIF](issues/26-k005-reason-lsp-mcp-sarif.md) | ready-for-agent |
| 27 | [Еталонна модель allow/deny у Datalog і property-тест через CLI](issues/27-rules-model-allow-deny.md) | ready-for-agent |
| 28 | [Модель: layers/K101, entry/K103, no-cycles/K105 та їхні `ok`](issues/28-rules-model-layers-entry-cycles.md) | ready-for-agent |
| 29 | [Модель: прогалини залежностей і `unverified` правил](issues/29-rules-model-dependency-holes.md) | ready-for-agent |
| 30 | [Довідка інструментів переїжджає в docs/tools.md](issues/30-tools-reference-split.md) | ready-for-agent |
| 31 | [Таблиця команд у docs/tools.md, звірена з `--help`](issues/31-commands-table.md) | ready-for-agent |
| 32 | [Виконувані приклади у format.md: `keylang` + `diagnostics`](issues/32-format-executable-examples.md) | ready-for-agent |
| 33 | [Повна граматика одним блоком EBNF, звірена з парсером](issues/33-format-grammar-ebnf.md) | ready-for-agent |
| 34 | [Кожне рішення Р1…Рn має виконуваний приклад](issues/34-decisions-have-examples.md) | ready-for-agent |
| 35 | [Поле `format` у `keylang.json`: версія мови, розділ «Версії формату» і ADR 0007](issues/35-config-format-version.md) | ready-for-agent |
| 36 | [K106: попередження про непорівнювані `allow`/`deny`, переможець той самий (крок 1)](issues/36-rules-incomparable-k106-warning.md) | ready-for-agent |
| 37 | [Формат 2: непорівнювані `allow`/`deny` вирішує deny-overrides (крок 2)](issues/37-rules-incomparable-format-2.md) | ready-for-agent |
| 38 | [Режим `static` у `keylang.json` (`check.static`), прапорець `--static` лише перевизначає](issues/38-config-check-static.md) | ready-for-agent |
| 39 | [K008: `then` з одного слова без крапки, що збігається з оголошеним ID](issues/39-then-bare-word-warning.md) | ready-for-agent |
| 40 | [LSP: запит до `initialize` дає -32002; кінець stdin описано й закріплено](issues/40-lsp-lifecycle-before-initialize.md) | ready-for-agent |
| 41 | [ADR 0006: власний транспорт `keylang lsp` — записаний виняток з ADR 0002](issues/41-adr-lsp-transport.md) | ready-for-agent |
| 42 | [Транспорт `keylang lsp` на `vscode-jsonrpc` — не зараз](issues/42-lsp-transport-vscode-jsonrpc.md) | wontfix |
| 43 | [Протокол usability-проби за Cognitive Dimensions і поділ design-v0.2/28 на пробу й заморожування](issues/43-usability-probe-protocol.md) | ready-for-agent |
| 44 | [ADR 0008: кількісні й заперечні властивості потоків — підмножина LTLf після v1](issues/44-flow-properties-adr.md) | needs-triage |
| 45 | [`never <id>`: виклик, якого не має бути в межах тригера чи кроку](issues/45-flow-property-never.md) | needs-triage |
| 46 | [`at-most <N> <id>`: верхня межа кількості викликів](issues/46-flow-property-at-most.md) | needs-triage |
| 47 | [`never <b> before <a>`: виклик лише після передумови](issues/47-flow-property-never-before.md) | needs-triage |
| 48 | [Команда міграції між версіями формату — не зараз](issues/48-format-migrate-command.md) | wontfix |
| 49 | [Запити в стилі Datalog для правил користувача — не зараз](issues/49-user-rule-queries.md) | wontfix |

<!-- shiftwork:tickets:start -->
| NN | title | status | last route |
| -- | ----- | ------ | ---------- |
| 01 | Тест розбіжності з CommonMark: корпус і allowlist відомих класів | resolved |  |
| 02 | Огорожа коду за правилами CommonMark (Р15): жоден рядок специфікації не зникає мовчки | resolved |  |
| 03 | `fmt` пише огорожу коду з колонки 0 (Р9) | resolved |  |
| 04 | Сирі HTML-блоки типів 1–5 — проза: закоментований рядок специфікації не перевіряється | resolved |  |
| 05 | Метаморфний тест: менше інформації не перемикає `ok` ↔ `fail` | needs-info | opencode-go/glm-5.3 |
| 06 | `no-cycles` під модулем: прогалина в досяжному модулі дає `unverified`, а не `ok` | resolved |  |
| 07 | Область `layers`: увесь зв'язний порядок і шари поза порядком | needs-info | opencode-go/space-bunny-free |
| 08 | `external.<pkg>` з маніфесту: `exclude` єдиного імпортера не дає K001 | resolved |  |
| 09 | `specHash` — одна ідентичність рядка правила для всіх його результатів | resolved |  |
| 10 | Семантика flows — впорядковане ін'єктивне включення і граничні випадки в CLI-тестах | resolved |  |
| 11 | Крок, спостережений лише в іншому дереві викликів, — `unverified`, а не `missing step` | resolved |  |
| 12 | Кожен тригер і крок отримує trace-вердикт, коли задано `check.trace` | resolved |  |
| 13 | Сусідній крок у піддереві попереднього сусіда не підтверджує порядок | resolved |  |
| 14 | Однаково специфічні `deny` на одному ребрі: кожне дає власну K102 | resolved |  |
| 15 | Рядок `layers` без `ok`, коли залежність угору вирішив `deny`; для `allow` evidence називає виняток | resolved |  |
| 16 | `allow`/`deny` над fn, type чи event (K005) не діють ніде | resolved |  |
| 17 | Еталон `check` для всіх форм тверджень (сітка безпеки Р-1) | resolved |  |
| 18 | Р-1 expand: SpecIR і `compileSpec` у шарі `lang` поруч із Text IR | resolved |  |
| 19 | Р-1 migrate: `rules.ts` читає SpecIR замість обходу Text IR | resolved |  |
| 20 | Р-1 migrate: `flows.ts` і дерево trace будуються з SpecIR | resolved |  |
| 21 | Р-1 migrate: wiring із SpecIR, типи `Wire` у шарі `lang` | resolved |  |
| 22 | Р-1 migrate: LSP, `check --changed`, `feature`, TUI і trace-plan читають SpecIR | resolved |  |
| 23 | Р-1 migrate: `draft-llm`, `spec-to-code` і `explain <id>` читають SpecIR | resolved |  |
| 24 | Р-1 contract: K005 форми тверджень переходять у `compileSpec`, стару форму прибрано | resolved |  |
| 25 | Причина K005 (`reason`) у `check --format json`, `parse --json` і `explain K005` | resolved |  |
| 26 | `reason` K005 у LSP, MCP і SARIF | resolved |  |
| 27 | Еталонна модель allow/deny у Datalog і property-тест через CLI | resolved |  |
| 28 | Модель: layers/K101, entry/K103, no-cycles/K105 та їхні `ok` | resolved |  |
| 29 | Модель: прогалини залежностей і `unverified` правил | resolved |  |
| 30 | Довідка інструментів переїжджає в docs/tools.md | resolved |  |
| 31 | Таблиця команд у docs/tools.md, звірена з `--help` | resolved |  |
| 32 | Виконувані приклади у format.md: `keylang` + `diagnostics` | resolved |  |
| 33 | Повна граматика одним блоком EBNF, звірена з парсером | resolved |  |
| 34 | Кожне рішення Р1…Рn має виконуваний приклад | resolved |  |
| 35 | Поле `format` у `keylang.json`: версія мови, розділ «Версії формату» і ADR 0007 | resolved |  |
| 36 | K106: попередження про непорівнювані `allow`/`deny`, переможець той самий (крок 1) | resolved |  |
| 37 | Формат 2: непорівнювані `allow`/`deny` вирішує deny-overrides (крок 2) | resolved |  |
| 38 | Режим `static` у `keylang.json` (`check.static`), прапорець `--static` лише перевизначає | resolved |  |
| 39 | K008: `then` з одного слова без крапки, що збігається з оголошеним ID | resolved |  |
| 40 | LSP: запит до `initialize` дає -32002; кінець stdin описано й закріплено | resolved |  |
| 41 | ADR 0006: власний транспорт `keylang lsp` — записаний виняток з ADR 0002 | resolved |  |
| 42 | Транспорт `keylang lsp` на `vscode-jsonrpc` — не зараз | wontfix |  |
| 43 | Протокол usability-проби за Cognitive Dimensions і поділ design-v0.2/28 на пробу й заморожування | resolved |  |
| 44 | ADR 0008: кількісні й заперечні властивості потоків — підмножина LTLf після v1 | needs-triage |  |
| 45 | `never <id>`: виклик, якого не має бути в межах тригера чи кроку | needs-triage |  |
| 46 | `at-most <N> <id>`: верхня межа кількості викликів | needs-triage |  |
| 47 | `never <b> before <a>`: виклик лише після передумови | needs-triage |  |
| 48 | Команда міграції між версіями формату — не зараз | wontfix |  |
| 49 | Запити в стилі Datalog для правил користувача — не зараз | wontfix |  |
<!-- shiftwork:tickets:end -->
