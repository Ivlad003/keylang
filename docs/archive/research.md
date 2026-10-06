# keylang — дослідження: наукові статті, обмеження, вибір стеку

Дата: 2026-09-27. Доповнює [design.md](../design.md) (v0.1). Джерела перевірено пошуком/фетчем; неперевірене позначено «(неперевірено)».

Структура:

1. Що каже наука про архітектурні мови й перевірку відповідності
2. Що каже наука про LLM, spec↔code і співавторство
3. Порівняння стеків: Rust · C++ · Zig · OCaml · Erlang/BEAM · JavaScript
4. Рекомендація і список змін до design.md

---

## 1. Архітектурні мови, перевірка відповідності, відновлення архітектури

### 1.1 ADL і чому їх не прийняли

| Джерело | Ідея | Урок для keylang |
|---|---|---|
| Medvidovic & Taylor, *A classification and comparison framework for software ADLs*, TSE 2000 — https://dl.acm.org/doi/10.1109/32.825767 | ADL = компоненти + конектори + конфігурації; Wright, Darwin, xADL, AADL. | keylang-map — це **модульно-залежнісний** вигляд, не component-connector. Так і назвати; не обіцяти семантику конекторів. |
| Malavolta et al., *What industry needs from architectural languages*, TSE 2013 — http://www.ivanomalavolta.com/files/papers/TSE_2013.pdf | 48 практиків: домінують box-and-line та UML; хочуть (1) комунікацію, (2) легкість, (3) аналіз, що повертає цінність, (4) вбудованість у життєвий цикл. | Прийняття залежить від «цінності в потоці роботи» — CI-перевірка, hover, клікабельні посилання, а не багатство нотації. |
| Ozkaya, *Analysis of architectural languages for the needs of practitioners*, SPE 2018 | 124 ADL: майже жодна не має прив'язки до коду, round-trip і зрілих інструментів. | Прив'язка до коду (ID + шлях#рядок) — саме те, чого ADL не закрили. Це головний меседж keylang, а не «ще одна ADL». |
| C4 / Structurizr DSL / LikeC4 — https://docs.structurizr.com/dsl | Текст, git-friendly, нуль семантики; рецензованих оцінок немає. | Вони описують **задуману** архітектуру без перевірки коду. Відмінність keylang — саме conformance. |

**Обмеження:** розширювані «за схемою» мови (xADL) породжують розповзання формату. Тримати фіксований набір ключових слів; не додавати механізм плагінів у саму мову.

### 1.2 Перевірка відповідності та ерозія

| Джерело | Ідея | Урок |
|---|---|---|
| Murphy, Notkin, Sullivan, *Software reflexion models*, TSE 2001 (FSE 1995) — https://www.cs.ubc.ca/~murphy/papers/rm/fse95.html | Високорівнева модель + мапа сутностей коду → обчислюються **convergence / divergence / absence**. | `rules` + глоби в `keylang.toml` = reflexion model. Звітувати обидва напрямки: *divergence* (є в коді, заборонено) і *absence* (заявлено у flow, немає в коді). |
| Knodel & Popescu, *A comparison of static architecture compliance checking approaches*, WICSA 2007 — https://ieeexplore.ieee.org/document/4077029/ | Reflexion models масштабуються, але грубі; relation rules (allow/deny) точні, але багатослівні. | keylang мішає обидва — добре. Головна засторога: мапа код→модуль має бути дешевою в підтримці (глоби каталогів, а не per-class). |
| Passos et al., *Static architecture-conformance checking: an illustrative overview*, IEEE Software 2010 | DSM vs. мови запитів (CodeQL-подібні) vs. reflexion — кожен ловить своє. | Декларативна DSL правил (ArchUnit-стиль) виграє в прийнятті у мов запитів. П'яти видів правил вистачить для M1. |
| Pruijt et al., *Architecture compliance checking of semantically rich modular architectures*, ICSM 2013 | Інструменти сильно різняться в тому, **які типи залежностей** бачать (наслідування, анотації, непрямий доступ). | Явно задокументувати, які види залежностей покриває `deny`: import, call, type-ref, re-export. Непомічені види = класичне хибне «ok». |
| Maffort et al., *Mining architectural violations from version history* (ArchLint), EMSE 2016 | Без специфікації точність 47–89 %, recall 96 %. | Евристики (co-change, «усі в шарі роблять X») годяться як **підказки** для `keylang draft rules`, не як правила. |
| Li, Liang, Soliman, Avgeriou, *Understanding software architecture erosion: a systematic mapping study*, JSEP 2022 — https://onlinelibrary.wiley.com/doi/10.1002/smr.2423; ICPC 2021 — https://arxiv.org/abs/2103.11392 | Причини ерозії: випаровування знань, брак документації, тиск часу, неявні правила; практики покладаються на code review, бо інструменти шумлять. | Ерозія — проблема **знань**, тому текст-пояснення біля `deny` і `keylang explain` важать не менше за перевірку. Звітувати на етапі review (SARIF / GitHub annotations), а не лише exit code. |
| de Silva & Balasubramaniam, *Controlling software architecture erosion*, JSS 2012 | Таксономія: minimise / prevent / repair. | `rules` = minimise, `map` = repair, `wiring` = prevent (DI зі спеки робить порушення невиразимими — сильніше за перевірку). |
| Landman, Serebrenik, Vinju, *Challenges for static analysis of Java reflection*, ICSE 2017 | Рефлексія повсюдна і статично нерозв'язна. | DI-контейнери, декоратори, event bus невидимі структурно → за замовчуванням `unverified`; істина — trace або згенерований `wiring`. |

### 1.3 Відновлення архітектури з коду

| Джерело | Ідея | Урок |
|---|---|---|
| Bunch (Mancoridis, ICSM 1999); ACDC (Tzerpos & Holt, WCRE 2000); ARC (Garcia et al., ASE 2011) | Кластеризація як оптимізація; ACDC — патерни, обмежений розмір, **іменовані** кластери; Bunch приймає часткові кластери від людини. | Шарування keylang глобами = «ACDC з людськими патернами». Часткові кластери Bunch — предок hybrid-режиму. |
| Garcia, Ivkovic, Medvidovic, *A comparative analysis of software architecture recovery techniques*, ASE 2013 — https://dl.acm.org/doi/10.1109/ASE.2013.6693106 | 6 технік проти 8 еталонів: точність низька й нестабільна (MoJoFM часто < 50 %). Еталони вимагали тижнів експертної праці. | Повністю автоматичне шарування ненадійне. Генерувати **факти** (модулі, fn, ребра), а шари **пропонувати** як чернетку на прийняття — рівно `agree / llm-only / conflict` з §5.1. |
| Lutellier et al., *Comparing software architecture recovery techniques using accurate dependencies*, ICSE SEIP 2015 | Точність залежностей впливає на результат сильніше за вибір алгоритму. | Прапорець `precision: syntactic | semantic` на ребрі виправданий; цикли й пропозиції шарів рахувати на SCIP-ребрах, синтаксичні — маркувати. |
| LLM-refinement архітектурних кластерів, arXiv 2025–26 — https://arxiv.org/abs/2607.23774 | LLM корисний як **уточнювач** алгоритмічних кластерів, не як заміна. | Підтверджує hybrid за замовчуванням. |

### 1.4 Трасування spec↔code і «жива документація»

| Джерело | Ідея | Урок |
|---|---|---|
| Antoniol et al., *Recovering traceability links between code and documentation*, TSE 2002; Marcus & Maletic, ICSE 2003 | IR-відновлення посилань: хороший recall тільки при низькій precision. | 20 років TLR показують: виведені посилання шумні. keylang робить посилання **явними й перевірюваними**; IR/LLM — лише для пропозицій. |
| Keim et al., *Recovering trace links between software documentation and code* (TransArC/ArDoCo), ICSE 2024 — https://ardoco.github.io/c/icse24/ | Транзитивні посилання doc → **проміжна архітектурна модель** → code значно точніші за прямі doc→code. | Пряме підтвердження шаруватості keylang: flows/rules посилаються на ID мапи, мапа — на код. Ніколи не лінкувати прозу прямо на рядки. |
| Aghajani et al., *Software documentation issues unveiled*, ICSE 2019; Wen et al., *A large-scale empirical study on code-comment inconsistencies*, ICPC 2019 | Домінують проблеми **змісту** (застаріле, невірне); коментарі відстають від коду на багато комітів. | Застарілість — норма. K001, регенерація рядків і hash-`stale` для explain — правильно, але **вільний текст під вузлами** не має захисту → хешувати сигнатуру описаного вузла і теж позначати `stale`. |
| Theunissen et al., *Documentation in Continuous Software Development*, IST 2022 | Виживає лише документація, що виконувана, генерована або лежить поруч із кодом. | Усе в репо, diff-reviewable, у CI. |
| Ricca et al., *Are Fit tables really talking?*, ICSE 2008; Binamungu et al., *Maintaining BDD specifications*, SANER 2018 | Виконувані специфікації допомагають, але Gherkin-набори дублюються і їх важко знайти по фічі. | Flow = 1–кілька e2e-сценаріїв, прив'язаних до ID графа, + CodeLens «flows: checkout» = відсутній індекс. Попереджати про перекриття flow. |
| Knuth, *Literate programming*, 1984 | Програма як есе; на практиці — тертя tangle/weave, один наратив проти багатьох підтримувачів. | keylang правильно тримає код і прозу в **окремих** файлах, зв'язаних ID. |

### 1.5 Легка перевірка поведінки (flows)

| Джерело | Ідея | Урок |
|---|---|---|
| Meyer, *Applying design by contract*, 1992 | Pre/post/invariant як виконувані перевірки. | `invariant` у keylang — проза + вказівник на тест. Дозволити посилатися на ID runtime-assertion, щоб trace підтверджував спрацювання. |
| Daikon (Ernst et al., SCP 2007); Ammons et al., *Mining specifications*, POPL 2002 | Майнінг інваріантів/FSM з трейсів; результат overfit до покриття тестами. | `keylang draft flow` з трейсів можливий, але майновані flows — тільки `draft`/`unverified`. |
| Briand, Labiche, Leduc, *Reverse engineering of UML sequence diagrams*, TSE 2006 | Інструментування → трейс → діаграма; проблеми: обсяг трейсу, цикли, потоки. | Трейсити лише тести з `@flow`; порівнювати `step` як **підпослідовність з вкладенням**, не точну рівність. |
| Leucker & Schallhart, *A brief account of runtime verification*, JLAP 2009 | Тризначні вердикти true/false/inconclusive. | `ok/fail/unverified` = RV-вердикт. Ніколи не схлопувати `unverified` в `ok`. |
| Typestate (Strom & Yemini 1986; DeLine & Fähndrich 2004) | Статична перевірка порядку викликів потребує дисципліни aliasing/ownership. | Порядок `step` між модулями статично нерозв'язний загалом; «шлях у графі викликів» — це **reachability**, не порядок. Так і документувати. |
| PyCG (Salis et al., ICSE 2021) — https://arxiv.org/abs/2103.00587; Antal et al., JS call graphs, SCAM 2018; Sui et al., *On the recall of static call graph construction*, ICSE 2020; Livshits et al., *In defense of soundiness*, CACM 2015 | Практичні графи викликів «soundy»: precision ~99 %, recall ~70 % (Python); JS-інструменти сильно розходяться; навіть Java-аналізатори пропускають рефлексію, лямбди, serialization. | Пропущені ребра — норма. (a) немає статичного шляху = `unverified`, не `fail`; (b) `llm-only` — підказка, де аналіз сліпий; (c) трейси підтверджують і записують `precision: dynamic`. |

### 1.6 Багатомовний синтаксичний аналіз (tree-sitter)

| Джерело | Ідея | Урок |
|---|---|---|
| Néron et al., *A theory of name resolution* (scope graphs), ESOP 2015; Creager & van Antwerpen, *Stack graphs: name resolution at scale*, EVCS 2023 — https://arxiv.org/abs/2211.01224 | Language-independent name binding як пошук шляху; stack graphs будуються по-файлово з tree-sitter-запитів без збірки. Обмеження: type-dependent lookup (метод на виведеному типі, generics, duck typing) поза межами. | Архітектура keylang (`.scm` + інкрементальний per-file індекс) доведена в масштабі GitHub; але `obj.method()` без типів не розв'язати → SCIP як точний шлях, ребра маркувати. |
| SCIP (Sourcegraph 2022) — https://sourcegraph.com/blog/announcing-scip | Protobuf-індекс із людиночитаними символами від type-aware індексаторів. | Зберігати SCIP-символ поряд з ID вузла як «семантичного близнюка». Обмеження: потрібен toolchain на мову → не дефолт для zero-config бінарника. |
| Semgrep — https://docs.semgrep.dev/writing-rules/data-flow/data-flow-overview | Синтаксичний матчинг над tree-sitter; interprocedural — дорого. | `calls`-екстракція міжфайлова → кешувати per-file summaries. |
| van Tonder & Le Goues, Comby, PLDI 2019 | Language-agnostic «дірки» (збалансовані дужки, рядки, коментарі) закривають 90 % випадків. | Дешевий fallback для мов без `.scm`. |

---

## 2. LLM, spec↔code, пояснення, співавторство, голос, DSL

### 2.1 LLM-відновлення архітектури й документації з репозиторію

| Джерело | Ідея | Урок |
|---|---|---|
| RepoAgent (Luo et al., EMNLP 2024) — https://arxiv.org/abs/2402.16667 | AST → документація по вузлах у порядку залежностей, синхронізація git-хуками; перемагає в blind preference. | Пайплайн «спочатку парсинг, потім LLM пише прозу по вузлу» = hybrid keylang. Але метрика — вподобання, не факти → тримати `check`-факти окремо від прози. |
| DocAgent (Yang et al., Meta, ACL 2025) — https://arxiv.org/abs/2504.08725 | Reader/Searcher/Writer/**Verifier**; топологічний порядок. | Окремий крок верифікації — стандарт. K001 — дешевий варіант; перевіряти також заявлені **ребра**, не лише ID. |
| Sun et al., *Source code summarization in the era of LLMs*, ICSE 2025 — https://arxiv.org/abs/2407.07959 | LLM-as-judge корелює з людьми; BLEU — ні; 7B-моделі можуть бити GPT-4 на деталях. | Для `explain short` можуть вистачити малі/локальні моделі. |
| ExpSum (Li et al., 2026) — https://arxiv.org/abs/2602.03400 | В індустрії **57 % SOTA-summary відхилено**: невірна доменна термінологія, зайві деталі. | Інжектити в промпт explain словник спеки (`layer`, бізнес-імена, `rules`). |
| Schmid et al., *Software Architecture Meets LLMs: SLR*, 2025 — https://arxiv.org/abs/2505.16697 | Conformance checking і code-from-architecture майже не досліджені. | keylang сидить у дослідницькій прогалині — бенчмарків немає, будувати власну e2e-оцінку. |
| ArchAgent (2026) — https://arxiv.org/abs/2601.13007; Hatahet et al. 2025 — https://arxiv.org/abs/2511.05165 | Статичні залежності + LLM-абстракція; ablation: саме контекст залежностей робить вихід точним. | «Компактний граф на вхід, проза на вихід» краще за «сирий код на вхід». |
| Repository Intelligence Graph (2026) — https://arxiv.org/abs/2601.10112; Codebase-Memory (tree-sitter-граф через MCP) — https://arxiv.org/abs/2603.27277 | Детермінований граф через MCP: 83 % якості проти 92 % у агента, що читає файли, при 10× менше токенів. | Граф через MCP — валідований патерн, але без інструменту `code` (фрагменти на вимогу) втрачається ~10 п. |
| Saleh et al., *Illusion of agentic complexity*, 2026 — https://arxiv.org/abs/2606.30524 | Один агент з RAG = мультиагент при −86 % токенів; людський план кращий за обидва. | Не переускладнювати пайплайн; скелет спеки від людини — найсильніший важіль. |

### 2.2 Spec-driven development

| Джерело | Ідея | Урок |
|---|---|---|
| SpecGen (Ma et al., ICSE 2025) — https://arxiv.org/abs/2401.08807; AutoSpec (Wen et al. 2024) | Генерація специфікацій з верифікатором у циклі: 279/385 програм. | Помилки `check` (K001/K003) віддавати агенту автоматично **до** показу людині. |
| Clover (Sun et al., SAIV 2024) — https://arxiv.org/abs/2310.17807 | Тристороння перевірка code ↔ docstring ↔ формальна анотація; 0 хибних прийнять. | Найближчий формальний аналог reconciliation; кожен артефакт перевіряється проти двох інших. |
| Lemur (Wu et al., ICLR 2024) — https://arxiv.org/abs/2310.04870 | LLM пропонує інваріанти, символьний верифікатор вирішує. | LLM — пропонувальник, алгоритм — оракул; LLM ніколи не змінює результат `check` (вже в §5.4). |
| CURRANTE (SANER 2026 registered report) — https://arxiv.org/abs/2601.03878; SDD for Agentic SE 2026 — https://arxiv.org/abs/2609.00252; Spec Kit Agents — https://arxiv.org/abs/2604.05278; Tufano et al., SpecOps'26 — https://arxiv.org/abs/2608.17177 | Рецензовані докази щодо SDD ще «в дизайні»; grounding-хуки дають +1.7 % SWE-bench Lite; покриття спекою корелює з виявленням багів. | Цінність специфікацій — у **заземленні кожної фази в докази з репо** (індекс keylang); очікуваний виграш помірний, не революційний. Твердження keylang формулювати як гіпотези. |
| Verifiable Literate Programming (Yuan et al., 2026) — https://arxiv.org/abs/2607.02333 | Однозначний NL-документ як читаний проміжний шар: pass@1 з 28–73 % до 65–93 %. | Читаний, перевірюваний проміжний шар (flows) реально допомагає людям валідувати LLM-код. |
| Індустрія: GitHub Spec Kit, AWS Kiro (EARS-вимоги; **не описує** re-sync spec↔code), Tessl/OpenSpec (скрипти перевірки посилань), критика Scott Logic «Reinvented Waterfall?» — https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html | Скарги: over-specification, waterfall-відчуття, дрейф спеки після реалізації, агенти мовчки ігнорують обмеження. | Відмінність keylang — спека **прив'язана до індексу і переперевіряється**. Ризик: якщо flows мусять бути повними до коду — той самий waterfall. Дозволяти неповні flows. |

### 2.3 Нейросимвольна генерація і reconciliation

| Джерело | Ідея | Урок |
|---|---|---|
| RepoCoder (EMNLP 2023) — https://arxiv.org/abs/2303.12570; CodePlan (Bairi et al., FSE 2024) — https://arxiv.org/abs/2309.12499 | Інкрементальний аналіз залежностей планує багатофайлові зміни; LLM заповнює лише листя. | spec-to-code між файлами планує **граф** (які вузли/шари), LLM — тіла. Збігається з «algo-скелет + llm-тіло». |
| GraphCoder (ASE 2024) — https://arxiv.org/abs/2406.07003; RepoFuse — https://arxiv.org/abs/2402.14323 | Пошук по графу контексту; «rationale + analogy» під бюджет токенів. | Панель «Контекст»: сусіди по графу (rationale) + схожі flows (analogy), обрізання за рангом. |
| De-Hallucinator (Eghbali & Pradel, 2024) — https://arxiv.org/abs/2401.01701 | Перший (галюцинований) вихід → retrieval реальних API → re-prompt. | K001-невідомий ID = запит на пошук; один re-prompt з найближчими реальними ID до показу людині. |
| Таксономії галюцинацій: Zhang et al., ISSTA 2025 — https://arxiv.org/abs/2409.20550; CodeHalu — https://arxiv.org/abs/2405.00253 | На рівні репо домінують помилки контексту/API і суперечливі залежності; RAG стабільно зменшує. | `llm-only` ребра — переважно вигадані API/залежності; логувати відсоток прийняття для калібрування. |
| IRIS (ICLR 2025) — https://arxiv.org/abs/2405.17238; LLift (OOPSLA 2024) — https://dl.acm.org/doi/10.1145/3649828 | LLM генерує специфікації для статичного аналізу і відсіює його хибні спрацювання. | Зворотний напрямок: LLM **розв'язує невизначені** алгоритмом факти (dynamic dispatch, DI) — маркувати `precision: syntactic`, дати LLM голос. |
| *When Retrieval Hurts* (2026) — https://arxiv.org/abs/2605.14478 | Застарілі фрагменти → 76–88 % completions із застарілими посиланнями. | Застарілий `.keylang/index.json` гірший за відсутній; перебудовувати індекс перед draft/ghost-text. |

### 2.4 Пояснення коду для людей

| Джерело | Ідея | Урок |
|---|---|---|
| MacNeil et al., SIGCSE 2023 — https://dl.acm.org/doi/10.1145/3545945.3569785; Leinonen et al., ITiCSE 2023 — https://arxiv.org/abs/2304.03938 | Найкорисніші — високорівневі summary; line-by-line рідко потрібне. | `short` (рівень призначення) — дефолт. |
| Nam et al., GILT, ICSE 2024 — https://arxiv.org/abs/2307.08177 | Кнопки пояснень без промпта в IDE підвищують виконання; ефект залежить від досвіду. | Клавіша `e` з фіксованими типами запиту — правильна форма; новачки схильні до надмірної довіри. |
| Kabir et al., CHI 2024 — https://arxiv.org/abs/2308.02312 | 52 % відповідей ChatGPT хибні, 77 % багатослівні; користувачі пропускають 39 % помилок через полірований стиль. | Plausible-but-wrong — головний ризик. Мітигації: пояснення не впливають на `check`, клікабельні перевірені ID, видимий `stale`, **provenance + назва моделі** в панелі. |

### 2.5 Співавторство людина↔агент у редакторі

| Джерело | Ідея | Урок |
|---|---|---|
| Barke et al., *Grounded Copilot*, OOPSLA 2023 — https://dl.acm.org/doi/10.1145/3586030 | Два режими: **acceleration** (знає наступний крок, хоче коротко) і **exploration** (не впевнений, хоче варіанти). | Ghost-text — для acceleration; `Alt+]` варіанти і `Ctrl+Space` повні чернетки — для exploration. Не змішувати, ghost лишається коротким. |
| Mozannar et al., CUPS, CHI 2024 — https://arxiv.org/abs/2210.14306; *When to show a suggestion*, AAAI 2024 — https://arxiv.org/abs/2306.04930 | ~половина сесії — перевірка/очікування підказок; приховування низькоймовірних підказок зменшує латентність і час верифікації. | Не показувати ghost на кожне натискання: gating за дешевими сигналами (курсор у `flow`, рядок починається з `- `, впевненість кандидата індексу) + debounce. |
| Vaithilingam et al., CHI EA 2022; Liang et al., ICSE 2024 (410 розробників) — https://arxiv.org/abs/2303.17125 | Виграшу в часі немає, але подобається як стартова точка; відхиляють через невідповідність вимогам і брак контролю. | Детерміноване автодоповнення з індексу (ID, ключові слова, сигнатури) може дати більшість цінності без LLM — **виміряти до** додавання агентних доповнень. |
| Prather et al., TOCHI 2024 — https://arxiv.org/abs/2304.02491 | Новачків «зносить» підказками, втрачають метакогнітивний контроль. | Hunk-level MERGE (`a`/`r`) — правильний дефолт для всього довшого за рядок. |

### 2.6 Застарілість документації і синхронізація в CI

| Джерело | Ідея | Урок |
|---|---|---|
| Panthaplackel et al., AAAI 2021 — https://arxiv.org/abs/2010.01625; HatCUP, ICPC 2022 — https://arxiv.org/abs/2205.00600; LLMCup 2025 — https://arxiv.org/abs/2507.08671; CASCADE 2026 — https://arxiv.org/abs/2604.19400 | Зрілий патерн: виявлення по diff → LLM пропонує оновлення → ранжування → review. | Поширити hash-стейлнес з explain на **кроки flow**: `check --stale` у CI; `spec-to-code` / `code-to-spec` = ранжована пропозиція ремонту. |

### 2.7 Голосове програмування

| Джерело | Ідея | Урок |
|---|---|---|
| CB-Whisper (LREC-COLING 2024) — https://aclanthology.org/2024.lrec-main.262/; Contextual biasing w/o fine-tuning — https://arxiv.org/abs/2410.18363; Context biasing vs speech LLMs 2026 — https://arxiv.org/abs/2608.05759 | Promt/trie-biasing допомагає рідким словам, але **деградує з довгими списками**. | Глосарій ID у промпт Whisper — лише **малий релевантний піднабір** (ID біля курсора / поточного flow), не весь індекс; найцінніші терміни — в кінець промпта. |
| *Say What?* ITiCSE 2026, N=919 — https://arxiv.org/abs/2607.05808 | Текстові промпти успішніші за голосові з першого разу. | Голос — для вільного тексту в описи вузлів, не для структурних рядків з ID. |
| LipCoder 2026 — https://arxiv.org/abs/2608.30793; Talon, Serenade — https://spectrum.ieee.org/programming-by-voice-may-be-the-next-frontier-in-software-development | Успішні інструменти: **командна граматика** для структури + вільна диктовка для тексту. | Мапити «step … when … then» на крихітну граматику; решта — диктовка. |

### 2.8 Зручність DSL, Markdown-як-DSL, LLM-дружність синтаксису

| Джерело | Ідея | Урок |
|---|---|---|
| Grammar Prompting (NeurIPS 2023) — https://arxiv.org/abs/2305.19234; Synchromesh (ICLR 2022) — https://arxiv.org/abs/2201.11227 | Мінімальний BNF у промпті; constrained decoding + retrieval схожих прикладів прибирає синтаксичні/скоупові помилки. | У кожен draft-промпт — граматика keylang + 2–3 **схожі flows з цього репо**; при self-hosted моделі — constrained decoding по ID індексу. |
| Joel et al., LLMs for low-resource/DSL code, 2024 — https://arxiv.org/abs/2410.03981; BMW multi-file DSL 2026 — https://arxiv.org/abs/2604.24678 | Zero-shot генерація нової DSL слабка; one-shot допомагає помірно; fine-tuning дає структурну точність 1.00. | Нову DSL LLM спочатку генеруватиме з помилками. Синтаксис тримати мінімальним, Markdown-нативним, близьким до відомого (списки, `when/then`). |
| Alloy (Jackson, CACM 2019); FormaliSE 2023 novice study — https://eskang.github.io/assets/papers/formalise23-Alloy.pdf; https://arxiv.org/abs/2402.06624 | Легкі формальні методи працюють, але ~1/3 моделей новачків не компілюється; аналізатор рідко використовують для ітерацій. | Миттєва діагностика в редакторі (K001/K003 під час набору) важить більше за виразність. |
| DSL usability SLR (Barišić et al.) — https://www.researchgate.net/publication/317173940 | Більшість DSL ніколи не оцінюють на зручність. | Провести маленьке task-based дослідження (написати flow для відомого репо, 5–8 розробників) **до** заморожування синтаксису. |

---

## 3. Порівняння стеків

Жорсткі вимоги (з design.md §7.4–7.5): один статичний бінарник без зовнішніх програм; tree-sitter з граматиками вкомпільовано; TUI, що також працює в браузері через in-process ANSI→WS→xterm.js; LSP + MCP (JSON-RPC/stdio); Markdown у терміналі; редактор із ghost-text; whisper.cpp + мікрофон; HTTPS-стрімінг до LLM API; git без CLI; холодний старт < 200 мс; Linux/macOS/Windows; мало тестів, здебільшого e2e. Версії перевірено 2026-09-27.

### 3.1 Зведена таблиця (1 — погано, 5 — відмінно)

| Критерій | **Rust** | C++ | Zig | OCaml | Elixir/Erlang | Gleam | JS: Bun | JS: Node | JS: Deno |
|---|---|---|---|---|---|---|---|---|---|
| Один статичний бінарник | 5 musl | 3 CMake/vcpkg-матриця | **5** один toolchain | 2 Linux ok, Win/mac cross нішеві | 2 self-extracting (Burrito) | 1 потрібен Erlang або queso | 3 ~100 МБ, addons розпаковуються | 2 SEA без cross-compile | 3 без musl |
| Холодний старт < 200 мс | 5 | 5 | 5 | 5 | 2 150–400 мс + розпакування | 3 | 4 < 15 мс | 3 60–120 мс | 4 40–60 мс |
| tree-sitter + граматики | 5 crate на граматику, highlight crate | 4 native C, highlight DIY | 4 офіційні bindings, glue DIY | 2 bindings 0.1.0, 2 граматики | 2 молодий NIF-pack | 1 | 4 WASM або .node | 4 | 3 тільки WASM |
| TUI | 5 ratatui 0.30 | 4 FTXUI 7 | 3 libvaxis, без редактора | 2 Nottui, без редактора | 2 ex_ratatui 0.16 (6 міс.) | 2 shore/etui | 5 OpenTUI 0.5 (OpenCode) | 4 OpenTUI + `--experimental-ffi` | 2 лише Ink |
| TUI в браузері | 4 custom Backend + Ratzilla | 4 Emscripten (input semi-internal) | 2 немає web-бекенду | 2 render-to-string, без DOM | 2 бекенд треба писати в NIF | 2 | 5 WS задокументовано + Gridland | 4 | 3 |
| HTTP/WS сервер + HTTPS клієнт | 5 axum/rustls | 4 cpp-httplib 0.58 (обидва) | 2 std TLS ламається на Cloudflare; libs «experimental» | 3 tls 2.1.3 добрий; WS-libs 2 роки тиші | 5 Bandit/Req | 3 | 5 вбудовано | 5 | 5 |
| whisper.cpp + мікрофон | 4 whisper-rs (Codeberg) + cpal | **5** native + miniaudio | 4 build.zig DIY, zaudio | 2 ctypes + зовнішня C++ збірка | 2 новий NIF, portaudio | 1 | 3 whisper.node + decibri (без mac x64) | 3 | 2 |
| Markdown / LSP / MCP | 5 tui-markdown, tower-lsp-server, rmcp | 3 md4c, lsp-framework, community MCP | 3 zigmark, lsp-kit, mcp.zig (39★) | 4 cmarkit, lsp+linol, MCP руками | 4 MDEx, gen_lsp, anubis/ex_mcp | 1 | **5** канонічні SDK | 5 | 5 |
| git без CLI | 5 gix 0.88 | 4 libgit2 (CVE-каденс) | 3 libgit2 zig-pkg без macOS | 1 ocaml-git без diff/status/blame | 3 egit 0.3 | 1 | 4 es-git | 4 | 3 |
| Cross-compile 3 ОС | 4 | 3 | **5** | 2 | 3 хост тільки Unix | 2 | 4 | 2 | 4 |
| Час компіляції / ітерація | 2 хвилини clean | 3 | 5 | 5 dune | 4 | 4 | 5 tsgo | 4 | 4 |
| Стабільність мови/екосистеми | 5 | 4 | 1 pre-1.0, 0.16 переписав I/O, 0.17 на підході | 4 | 3 | 2 | 2 Bun 1.4 Rust-rewrite, регресії ffi/compile | 4 | 3 |
| Модель конкурентності для watcher/agent/WS | 4 tokio | 3 | 3 | 3 eio/lwt/miou розкол | **5** OTP | 4 | 3 | 3 | 3 |
| **Сума / 65** | **58** | 49 | 45 | 37 | 39 | 27 | 52 | 47 | 44 |

### 3.2 Що б змінилося в дизайні для кожного стеку

**Rust (лишити).** Структурно нічого. Оновити §7.3/§7.4: whisper-rs переїхав на Codeberg (GitHub архівовано) — дзеркалити/вендорити; LSP = `tower-lsp-server` 0.24 (форк, оригінал мертвий з 2023) або `lsp-server` з rust-analyzer; MCP = офіційний `rmcp` 3.4; на Linux повністю статичний musl-бінарник з ALSA неможливий (cpal лінкує libasound динамічно) — якщо це критично, miniaudio-стиль dlopen. Використати Zig **як інструмент**: `cargo-zigbuild` для musl/aarch64/cross-збірки whisper.cpp і граматик з одного Linux-CI.

**C++.** FTXUI замість ratatui; браузер — або Emscripten-збірка того ж UI, або ANSI через cpp-httplib WS; `tree-sitter-highlight` — власний highlighter на `ts_query_*` (~300 рядків); git = libgit2 зі стеженням за CVE; збірка per-OS у CI з vcpkg-маніфестами. +25–30 % часу на build-plumbing, окрема нотатка про memory-safety (локальний web-сервер, парсинг чужих репо). Головна перевага — whisper.cpp/ggml/tree-sitter/libgit2/miniaudio/md4c нативні, нуль bindings.

**Zig.** Один `build.zig` збирає ggml/whisper, tree-sitter + граматики, libgit2, mbedTLS, miniaudio і крос-компілює три ОС з одного Linux — §7.4 спрощується. Але: §7.2 втрачає WASM/Ratzilla (libvaxis без web-бекенду, headless-режим неперевірений); HTTPS-клієнт треба писати на mbedTLS (std TLS 1.3-only, відомі збої `TlsInitializationFailed` проти Cloudflare — Anthropic/OpenRouter саме за ним); у §9 — «pin Zig 0.16.x, бюджет одна міграція на реліз» (0.16 переписав `std.Io`, Ghostty мігрував тижнями). Усі периферійні бібліотеки одноавторні і «0.16 experimental» — стаєш їхнім підтримувачем.

**OCaml.** Ядро (`parse`, `check`, IR, форматер, LSP) було б **кращим**: Menhir/sedlex для діалекту, варіанти + pattern matching для IR, cmarkit з позиціями, `lsp`+`linol` від команди ocaml-lsp. Але все в §7.2–7.4, що торкається C, — через ctypes (tree-sitter runtime + N граматик, libgit2, whisper, portaudio 2022); ocaml-git **не має** diff/status/blame; Nottui без редактора, без браузерного бекенду; Windows — «тільки native build». Реалістично — гібрид OCaml-ядро + C-шим, тобто два toolchain.

**Elixir/Erlang.** §7.4 → «Burrito self-extracting archive, ~50–80 МБ після першого запуску»; §7.5 холодний старт → ~500 мс; tree-sitter, whisper, libgit2, comrak — усе Rustler-NIF (тобто Rust усе одно пишеш), один segfault у NIF кладе VM — «відмовостійке» ядро працює переважно в unsafe native-коді; ex_ratatui 0.16 (6 місяців, один автор) без web-бекенду; Windows-збірка тільки з Unix-хоста. Сильні сторони BEAM (supervision, hot reload) не окупаються в однокористувацькому локальному CLI — tokio-таски + канали дають ту саму ізоляцію за 1/10 старту. Gleam: жодних бібліотек під LSP/MCP/tree-sitter/whisper/git.

**JavaScript/TypeScript (Bun).** Єдина серйозна альтернатива. §7.4 → «`bun build --compile --bytecode`, ~100–120 МБ, вбудовані `.node`/`.so` розпаковуються в кеш»; граматики як WASM (web-tree-sitter, 2–5× повільніше); TUI = OpenTUI (Zig-ядро, React/Solid, живить OpenCode) зі stdout, замінений на WS-стрім — шлях ANSI-over-WS задокументований 1:1, плюс Gridland (canvas) як другий браузерний шлях; whisper через `@fugood/whisper.node` (N-API, prebuilts, Metal/Vulkan/CUDA), мікрофон через `decibri` (30★, без macOS x64, Bun/Deno не задокументовано); git через `es-git` (napi над libgit2); LSP/MCP/Anthropic — офіційні SDK; VS Code-розширення ділить код із сервером. Ризики: Bun 1.4 (Rust-rewrite, 19+ регресій, зокрема `bun:ffi` у скомпільованих бінарниках), дерево із сотень пакетів (supply chain), один вендор. Node SEA: без cross-compile, addons через temp-файли, Stability 1.1. Deno: без musl, без OpenTUI, бінарники роздуваються без `--bundle`.

Перевага TS у LSP/MCP кількісно: обидва протоколи — JSON-RPC/stdio, потрібна поверхня (hover, definition, references, documentSymbol, diagnostics, completion, codeLens; 7 MCP-інструментів) — ~1 500 рядків будь-де; TS економить супровід типів і отримує оновлення спеки на тижні раніше. Оцінка різниці: 1–2 тижні на весь проєкт, не структурна.

### 3.3 Топ-ризики обраного стеку (Rust)

1. Час компіляції гальмує e2e-цикл — workspace-split, `cargo nextest`, sccache, тонкий crate `keylang-core` без tokio.
2. Редактор-віджет (автодоповнення, ghost, merge-view) — bespoke-робота в ratatui; це єдине місце, де OpenTUI/React були б помітно швидшими. Точка перегляду: якщо M2-редактор виявиться занадто повільним у розробці.
3. Churn у async/LSP-крейтах (tower-lsp → tower-lsp-server) — періодичні міграції.
4. whisper-rs на Codeberg — вендорити.

### 3.4 Гібриди

- **Zig для голосового модуля як мовна межа** — ні: whisper-rs + cpal уже покривають, а другий toolchain у release-матриці руйнує single-binary DX. Zig — як C/C++ крос-компілятор (`cargo-zigbuild`), не як мова.
- **Rust-ядро + TS LSP/MCP** — ні: повертає другий runtime або два бінарники. Розумний гібрид уже в дизайні: VS Code-розширення = тонкий TS-клієнт LSP, xterm.js = вбудований JS. Дешево взяти з JS-сторони: (a) npm/npx-обгортка, що завантажує Rust-бінарник (discoverability); (b) якщо LSP/MCP переросте rmcp/tower-lsp-server — експортувати ядро як `napi-rs`-бібліотеку для TS-`keylang-lsp` без дублювання парсера.
- **OCaml лише як еталонний checker-бібліотека** — можливо пізніше, якщо парсер/типізація важитимуть, а периферія — ні.

---

## 4. Рекомендація і зміни до design.md

**Рішення автора (2026-09-27): Node.js + TypeScript, дистрибуція npm/npx — стек ближчий і зрозуміліший; вимогу single-binary знято.** Нижче — початкова рекомендація дослідження, збережена для історії.

**Стек за формальними критеріями: Rust.** Єдиний стек, де кожен рядок §7.4 має зрілу бібліотеку з релізом у 2026: ratatui 0.30, Ratzilla 0.3, gix 0.88, rmcp 3.4, tower-lsp-server 0.24-rc, tree-sitter 0.27, cpal 0.18, tui-markdown 0.3.10, rustls, whisper-rs 0.16; in-process ANSI-бекенд — першокласний `Backend` impl; M0 уже написано; dogfooding-ціль (keylang сам, voice-transcriber як тестовий репо) — Rust. Єдина реальна ціна — час компіляції, це проблема workflow, не архітектури.

**Зміни до design.md, які випливають із досліджень** (внесено 2026-09-27; п. 15 реалізовано як коментар `<!-- scip: … -->` у map, а не в §8):

| # | Розділ | Зміна | Джерело |
|---|---|---|---|
| 1 | §2/§3 | Назвати map «модульно-залежнісним виглядом», не ADL; явно перелічити види залежностей, що покриває `deny`: import, call, type-ref, re-export. | Medvidovic 2000; Pruijt 2013 |
| 2 | §4 | Прийняти словник reflexion models: `check` звітує **divergence** (є в коді, заборонено) і **absence** (є у flow, немає в коді). | Murphy 2001; Knodel 2007 |
| 3 | §4 | Зафіксувати: відсутність статичного шляху = `unverified`, ніколи не `fail`; `step`-перевірка — це reachability, не порядок; `unverified` не схлопується в `ok`. | Sui 2020; Livshits 2015; Leucker 2009 |
| 4 | §4 | Трейсити лише тести з `@flow`; порівняння як підпослідовність із вкладенням; підтверджені трейсом ребра писати назад як `precision: dynamic`. | Briand 2006 |
| 5 | §4 / §5.4 | Hash-стейлнес поширити з explain на описи вузлів і кроки flow: `check --stale`. | Wen 2019; Aghajani 2019; LLMCup 2025 |
| 6 | §4 | `invariant` може посилатися на ID runtime-assertion; попередження про перекриття flows. | Meyer 1992; Binamungu 2018 |
| 7 | §5.1 | Шари ніколи не призначаються автоматично мовчки: факти генеруються, структура пропонується як draft. LLM може «голосувати» лише за ребра з `precision: syntactic`. | Garcia 2013; LLift/IRIS |
| 8 | §5.1 / §5.5 | Цикл перевірки до людини: помилки K001/K003 автоматично повертаються агенту, один re-prompt з найближчими реальними ID (De-Hallucinator); логувати відсоток прийняття `llm-only`. | SpecGen; De-Hallucinator |
| 9 | §5.4 | `explain short` — дефолт; у промпт — словник спеки (layer, бізнес-імена); в панелі — provenance + модель + `stale`. | ExpSum 2026; Kabir 2024; MacNeil 2023 |
| 10 | §5 | Перебудова індексу перед будь-яким draft/ghost-text викликом; у draft-промпт — граматика keylang + 2–3 схожі flows з репо. | When Retrieval Hurts 2026; Grammar Prompting; Synchromesh |
| 11 | §7.3 | Ghost-text лише в acceleration-режимі, з gating і debounce; спочатку виміряти цінність детермінованого автодоповнення без LLM; hunk-MERGE — дефолт для всього довшого за рядок. | Barke 2023; Mozannar 2024; Prather 2024 |
| 12 | §7.3 | Голос: глосарій Whisper — тільки ID біля курсора/у поточному flow; голос — у вільний текст описів; крихітна командна граматика для `step/when/then`. | CB-Whisper; Say What? 2026; Talon/Serenade |
| 13 | §7.3 | MCP: інструмент `code` (фрагменти на вимогу) обов'язковий поряд із `node`/`search`. | Codebase-Memory 2026 |
| 14 | §7.4 | whisper-rs → Codeberg (вендорити); LSP = tower-lsp-server або lsp-server; MCP = rmcp; примітка про ALSA і musl; `cargo-zigbuild` для cross. | звіт по стеку |
| 15 | §8 | Зберігати SCIP-символ поряд з ID вузла (`scip:` поле) для детермінованих join з іншими інструментами. | SCIP 2022 |
| 16 | §9 | Додати в M1/M2 власну e2e-оцінку conformance (бенчмарків немає) і маленьке usability-дослідження синтаксису (5–8 розробників) до заморожування. | Schmid 2025; Barišić |
| 17 | §10 | Нове відкрите питання: як уникнути waterfall-дрейфу — flows дозволено бути неповними; спека не є передумовою коду. | Scott Logic 2025; CURRANTE |

**Відкриті ризики (зведено):**

- Обсяг трейсів і час CI у `trace`-режимі.
- Низький recall синтаксичного розв'язання методів у TS/Python → «втома від `unverified`».
- Підтримка мапи (глоби → шари) — історична точка смерті conformance-інструментів при реорганізації каталогів.
- `wiring` прив'язує до одного DI-стилю; працює лише при повному прийнятті в репо.
- Рецензованих доказів SDD мало; заявлені виграші помірні (~1–2 % на бенчмарках).
- Whisper-biasing деградує з довгими списками — великий індекс може шкодити.
- Нову DSL LLM генерує з помилками zero-shot — прийняття залежить від близькості до plain Markdown.
- Довіра до полірованих пояснень (Kabir) тихо переносить хибні ментальні моделі у flows.
- Rust: компіляція, bespoke редактор-віджет, churn у LSP-крейтах.
