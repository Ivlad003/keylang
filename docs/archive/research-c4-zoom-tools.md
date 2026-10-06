# Рівні деталізації «як у C4»: огляд наявних інструментів

Дата: 2026-10-04. Доповнює [research.md](research.md) (архітектурні мови, перевірка відповідності) і [research-pl.md](research-pl.md) (keylang як мова). Тут — огляд готових інструментів під два запити користувача, змодельовані на зумі C4 (context → container → component → code):

- **(A) Читання репозиторію згори донизу**: ідея → модулі → функції → виклики → деталі; на кожному рівні — коротке пояснення звичайною мовою з походженням до коду.
- **(B) Поступове написання фічі**: ідея простими словами → структурована спека → детальний опис, готовий для агента; з асистентом у стилі Clippy, допомога якого росте з глибиною.

Словник keylang нижче — за [CONTEXT.md](../../CONTEXT.md): знімок, карта, карта з поясненнями (explained map), специфікація, `planned`, файл фічі, харнес, MCP; цільова поведінка — [design.md](../design.md) §5.4 (пояснення вузла), §7.3 (редактор і співавторство), §7.6 (харнеси).

**Як перевірено.** Репозиторії GitHub звірено 2026-10-04 через `gh api repos/<owner>/<repo>`: зірки, дата останнього пушу (у будь-яку гілку, не реліз), прапорець `archived`, SPDX-ліцензія; «NOASSERTION» означає нестандартний текст ліцензії в репозиторії. Твердження про продукти звірено з офіційними сторінками документації через WebFetch того ж дня; де сторінка не відкрилась (404/редирект) або факт відомий лише з вторинних джерел, стоїть позначка **неперевірене**. Комерційні SaaS без публічного коду (IcePanel, Understand, Swimm, Cursor, Windsurf, Linear) описано лише за їхніми сайтами. Твердження про keylang — за `docs/design.md`, `CONTEXT.md` і `docs/tools.md` на 2026-10-04.

1. [Коротко](#1-коротко)
2. [Інструменти C4](#2-інструменти-c4)
3. [Код → документація та розуміння репозиторію](#3-код--документація-та-розуміння-репозиторію)
4. [Spec-driven авторство фіч для агентів](#4-spec-driven-авторство-фіч-для-агентів)
5. [Асистенти й проактивна допомога](#5-асистенти-й-проактивна-допомога)
6. [Markdown-вікі та свіжість документації](#6-markdown-вікі-та-свіжість-документації)
7. [Порівняльна таблиця](#7-порівняльна-таблиця)
8. [Що запозичити keylang](#8-що-запозичити-keylang)
9. [Джерела](#9-джерела)
10. [Неперевірене й відкинуте](#10-неперевірене-й-відкинуте)

## 1. Коротко

- **Жоден інструмент не закриває A і B разом.** C4-інструменти (Structurizr, LikeC4, IcePanel) дають зум по рівнях, але модель пишеться руками й до коду прив'язана щонайбільше посиланням `link`/`url`; code-to-docs інструменти (DeepWiki, CodeBoarding, RepoAgent) генерують пояснення з коду, але без перевірюваної моделі й без власної мови. Spec-driven набори (Spec Kit, Kiro, OpenSpec, BMAD) ведуть від ідеї до задач, але не звіряють результат із кодом автоматично. Поєднання «згенерована карта + ручна специфікація + перевірка» лишається нішею keylang.
- **Зум C4 на практиці — це навігація за вкладеністю, а не чотири окремі малюнки.** LikeC4 робить клік по елементу переходом у його view за замовчуванням; IcePanel — подвійний клік «context → container → component»; CodeBoarding — вкладені component-діаграми з переходом у код. Mermaid C4 і C4-PlantUML зум не підтримують: кожна діаграма окрема, drill-down у Mermaid позначено як невиконаний пункт.
- **Рівень «code» у C4 всі лишають інструментам.** Structurizr має `!components` (component finder для Java) і `structurizr-component`; решта рисують рівень компонентів і на тому зупиняються. Функції й виклики показують лише статичні аналізатори (Doxygen, Joern, Understand, Sourcetrail†) і agent-мапи (aider repo-map, Repomix `--compress`). keylang вже має ці два нижні рівні у знімку.
- **Походження до коду зберігають ті, хто генерує з коду.** DeepWiki — «source links», CodeBoarding — `analysis.json` з «source references», gitdiagram — клік по вузлу відкриває файл/теку, Nx — клік по ребру показує файл, що створив залежність. Структурні C4-моделі походження не мають взагалі. У keylang походження — це `snapshotId` + spans + розділ 5.2 design.
- **Стейлнес прози** вирішують двояко: Swimm (патентований Auto-sync Smart Tokens/Snippets, перевірка в CI, продукт зараз перепозиціонований на модернізацію legacy) і Mintlify (агент, що відкриває PR у документацію після merge). Детерміновану перевірку «текст застарів відносно коду» як команду CLI має лише keylang (`check --stale`).
- **Spec-driven для агентів зійшлося на трьох документах** — requirements/spec → design/plan → tasks — і на двох прийомах: явний маркер невизначеності (`[NEEDS CLARIFICATION]` у Spec Kit) і зв'язок задачі з вимогою (Kiro, OpenSpec delta `ADDED/MODIFIED/REMOVED`). Фаулерівська класифікація Бьокелер: spec-first (усі три), spec-anchored (OpenSpec, частково Kiro), spec-as-source (Tessl, бета). keylang за цією шкалою — spec-anchored з перевіркою: файл фічі лишається після реалізації, `planned` прибирається за K202.
- **Clippy** став анти-патерном не через ідею, а через нав'язливість: Microsoft 11.04.2001 оголосила, що Office Assistant вимкнено за замовчуванням в Office XP, і прибрала його в Office 2007 (офіційний прес-реліз у вільному доступі не знайдено — **неперевірене**, див. §10). Сучасні асистенти (Copilot, JetBrains AI, Zed, Cursor) працюють **на вимогу**: `/explain`, `#codebase`, `@`-згадки, Plan Mode з явним підтвердженням. Це збігається з design §7.3: ghost-текст лише в режимі прискорення, після паузи та дешевого сигналу.

## 2. Інструменти C4

Усі рівні — за [c4model.com/abstractions](https://c4model.com/abstractions): System Context → Container → Component → Code, плюс додаткові System Landscape, Dynamic і Deployment.

### Structurizr (DSL, Lite, on-premises)

- **URL/репо:** https://structurizr.com, https://docs.structurizr.com/dsl; код **зведено в монорепо** [structurizr/structurizr](https://github.com/structurizr/structurizr) (430★, пуш 2026-10-02, Apache-2.0, не archived). Колишні репозиторії **archived** 2026-01/03: `structurizr/java` (1.1k★, README: «code has been moved to structurizr/structurizr»), `structurizr/lite` (383★), `structurizr/cli` (566★), `structurizr/onpremises` (222★), `structurizr/ui` (64★). Модулі монорепо: `structurizr-dsl`, `structurizr-component`, `structurizr-inspection`, `structurizr-export`, `structurizr-mcp` та ін. Для локальної роботи README рекомендує `Structurizr local` (Docker) і playground.
- **Що робить.** «Models as code»: одна модель `softwareSystem { container { component } }`, кілька view (`systemLandscape`, `systemContext`, `container`, `component`, `deployment`, `dynamic`, `filtered`). Еталонна реалізація C4 від автора моделі.
- **Зум і зв'язок із кодом.** View — це проєкція однієї моделі, тож рівні узгоджені за побудовою. `!components` — обгортка component finder для Java-коду (автовиявлення компонентів у кодовій базі); `!docs` і `!adrs` підвішують Markdown/AsciiDoc і ADR до системи чи контейнера; `url` — довільне посилання на елемент. Автоматичного виявлення змін або перевірки відповідності коду немає.
- **A/B, рівні:** A (читання) на рівнях Context–Component; код — лише через component finder (Java). B — ні.
- **Походження/стейлнес:** немає; модель ручна.
- **keylang:** узяти ідею «одна модель — багато view з `include`/`exclude`» для TUI-фільтрів карти; `!docs`/`!adrs` — аналог підвішування `docs/adr` до шару. Відрізняється тим, що в keylang модель рівнів Component/Code *генерується зі знімка*, а не пишеться.

### C4-PlantUML

- **Репо:** [plantuml-stdlib/C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) — 7.4k★, пуш 2026-08-26, MIT.
- **Що робить.** Макроси PlantUML по одному include на рівень: `C4_Context.puml`, `C4_Container.puml`, `C4_Component.puml`, `C4_Dynamic.puml`, `C4_Deployment.puml`. Елементи приймають `$link` (клікабельне посилання) і `$tags`.
- **Зум:** відсутній; кожна діаграма — окремий файл, зв'язок між рівнями підтримується вручну. README зауважує, що GitHub не відтворює посилання в SVG у README.
- **A/B, рівні:** A на Context–Component як статичні малюнки. **keylang:** нічого структурного; показує, що текстовий формат без моделі швидко розходиться між рівнями.

### Mermaid C4

- **Репо:** [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) — 90.5k★, пуш 2026-10-03, MIT. Докс: https://mermaid.js.org/syntax/c4.html.
- **Що робить.** `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`; синтаксис сумісний з C4-PlantUML. Документація прямо каже: «experimental diagram… syntax and properties can change», а drill-down у списку можливостей позначено невиконаним.
- **A/B:** A, лише як ілюстрація. **keylang:** Mermaid доречний як *експорт* рендереру explained map (GitHub рендерить його в Markdown), а не як модель.

### IcePanel

- **URL:** https://icepanel.io/c4-model. Комерційний SaaS, публічного репозиторію немає.
- **Що робить.** Моделювання C4 з drill-down «Zoom in from context to container to component for different audiences», flows замість UML sequence, метадані (статус, власники, технології, теги), «Model as code» через API/SDK для синхронізації моделі.
- **A/B:** A на Context–Component; B — частково (flows як сценарії). Походження до коду — лише через API; стейлнес — не заявлено. **keylang:** взяти метадані вузла (owner, status) як кандидати на `description`; у keylang flows прив'язані до тестів і trace, в IcePanel — лише малюнок.

### LikeC4

- **Репо:** [likec4/likec4](https://github.com/likec4/likec4) — 5.8k★, пуш 2026-10-04, MIT; останній реліз v1.59.4 (2026-09-21). Докс: https://likec4.dev.
- **Що робить.** Власна DSL (`.c4`-файли), VS Code-розширення, статичний сайт. Елементи вкладаються без обмеження глибини (`service1.backend.api`), мають `description`, `technology`, `tags`, `metadata` (ключ-значення, JSON/YAML) і `links` — у т.ч. **відносні шляхи до файлів вихідного коду**. Views — проєкції моделі; «scoped view» стає view за замовчуванням для елемента, тож клік по елементу відкриває його внутрішній view. Є dynamic і deployment views, `extends` для views.
- **A/B, рівні:** A, Context–Component; код — через `link`. **Походження:** лише посилання; **стейлнес:** ні.
- **keylang:** найближчий за духом ФОРМАТ (вкладеність як простір імен, ID = шлях предків, link на файл). Відрізняється: у LikeC4 модель ручна і без перевірки, у keylang нижні рівні генеруються, а правила перевіряються. Варто запозичити поведінку «клік по вузлу = його scoped view» для TUI.

### Archi / ArchiMate

- **Репо:** [archimatetool/archi](https://github.com/archimatetool/archi) — 1.3k★, пуш 2026-10-04, MIT. Сторінка features не відкрилась (404) — деталі **неперевірені**, окрім того, що Archi — настільний редактор ArchiMate 3.x з коллабораційним плагіном coArchi і скриптингом jArchi (за загальновідомою документацією проєкту).
- **A/B:** A на рівні підприємства (Business/Application/Technology), вище за C4 Context. Зв'язку з кодом немає. **keylang:** не релевантно, окрім поняття viewpoint — фіксованого підмножини елементів для аудиторії.

### Інші «architecture as code»

- [d2lang/d2](https://github.com/d2lang/d2) (25.6k★, пуш 2026-10-02, MPL-2.0) — мова діаграм із шарами (`layers`/`scenarios`/`steps`), які є саме механізмом зуму в d2; моделі коду немає.
- [mingrammer/diagrams](https://github.com/mingrammer/diagrams) (42.7k★, пуш 2026-10-04, MIT) — Python-DSL для хмарних схем, без рівнів і без коду.

## 3. Код → документація та розуміння репозиторію

### DeepWiki / Devin Wiki (Cognition)

- **URL:** https://deepwiki.com (безкоштовно для публічних репо), https://docs.devin.ai/work-with-devin/deepwiki. Закритий продукт.
- **Що робить.** Індексує репозиторій і генерує вікі з «architecture diagrams, documentation, and source links for every repo». Файл `.devin/wiki.json` задає, які сторінки генерувати. «Ask Devin» відповідає на питання з опорою на вікі та code search. Приватні репо — за рівнями зусиль (Low безкоштовно, Medium/High за ACU).
- **Рівні:** огляд → підсистеми → файли/класи; кожна сторінка з посиланнями на джерела. **LLM**, провенанс — посилання на файли. **Стейлнес:** періодичність оновлення в документації не вказана — **неперевірене**.
- **keylang:** узяти `wiki.json`-подібне «що пояснювати» (keylang має це як `explain.map` + список вузлів) і обов'язкові «source links» під кожним абзацем. Відрізняється: DeepWiki — проза без моделі, її не можна перевірити; keylang явно відокремлює explained map від специфікації (ADR 0004).

### DeepWiki-Open

- **Репо:** [AsyncFuncAI/deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open) — 18.1k★, пуш 2026-09-03, MIT. README тепер веде на «Deepwiki-Open 2.0 (Grok Wiki)» на grok-wiki.com.
- **Що робить.** Самохостний клон DeepWiki для GitHub/GitLab/Bitbucket: аналіз структури, генерація сторінок і діаграм, «codemaps for guided code tours». Деталі RAG/провайдерів у README не розкрито — **неперевірене**.
- **keylang:** приклад того, що ринок хоче «вікі з коду за одну команду»; keylang може дати це як `explain.map` із гарантією детермінованості карти.

### CodeBoarding

- **Репо:** [CodeBoarding/CodeBoarding](https://github.com/CodeBoarding/CodeBoarding) — 2.5k★, пуш 2026-10-02, MIT; реліз v0.14.2 (2026-09-16).
- **Що робить.** Статичний аналіз → групування в компоненти → LLM описує відповідальність компонента. Виводить Markdown+Mermaid, HTML, MDX, reST. Вкладені компонентні діаграми з drill-down; `analysis.json` тримає «relationships and source references»; показує «що PR робить із системою» поряд із diff. Мови: Python, TS, JS, Java, Go, PHP, Rust, C#.
- **A/B, рівні:** A, Container–Component з переходом у код. **Гібрид** статика+LLM, походження є. Стейлнес — через перегенерацію на PR.
- **keylang:** найближчий конкурент для (A). Відрізняється тим, що keylang має мову специфікацій і перевірку; запозичити «архітектурний diff PR» як режим `check --changed` з описом змінених вузлів.

### gitdiagram

- **Репо:** [ahmedkhaleel2004/gitdiagram](https://github.com/ahmedkhaleel2004/gitdiagram) — 17.8k★, пуш 2026-10-03, MIT.
- **Що робить.** Дерево файлів + README → LLM → Mermaid-діаграма; клік по вузлу відкриває файл чи теку; є MCP-сервер і «explainer video». Рівень — один (Container-ish). **LLM** без статики, тож ребра не є підтвердженими. **keylang:** приклад того, чого уникати (вигадані ребра) — див. AGENTS.md: синтаксичний аналіз не дає підстав вигадувати ребра.

### RepoAgent (OpenBMB)

- **Репо:** [OpenBMB/RepoAgent](https://github.com/OpenBMB/RepoAgent) — 1.1k★, пуш 2024-12-23 (неактивний), Apache-2.0.
- **Що робить.** AST + двосторонні зв'язки викликів → LLM пише документ на кожен об'єкт; ієрархія в `.project_doc_record` (JSON), `Markdown_Docs/`; інкрементальне оновлення через pre-commit hook; тільки Python. «Chat with Repo».
- **Рівні:** Component–Code. **Гібрид.** Походження — через ієрархію об'єктів. **keylang:** ідея закоміченого JSON-запису ієрархії + per-object Markdown збігається з `<dir>/explain/<id>.md`; інкремент через hook — аналог `check --changed`.

### Sourcegraph / Cody

- **Репо:** [sourcegraph/sourcegraph-public-snapshot](https://github.com/sourcegraph/sourcegraph-public-snapshot) — 10.3k★, archived, пуш 2024-09-02, ліцензія NOASSERTION; [sourcegraph/cody-public-snapshot](https://github.com/sourcegraph/cody-public-snapshot) — 3.8k★, archived, Apache-2.0. Cody Free/Pro закрито 23.07.2025 (блог Sourcegraph); Cody лишився лише Enterprise, індивідуальним розробникам пропонують Amp (з 12.2025 — окрема компанія; **неперевірене** за первинним джерелом).
- **Що робить.** Code search + code navigation (SCIP-індекси) + чат із контекстом репозиторію. Рівні: Code (символи, посилання). **keylang:** SCIP як рекомендований дефолт для точного резолвінгу — уже в design §10 п. 7.

### CodeSee

- Продукт codebase maps («Codebase Maps», «Review Maps»); компанію поглинув GitKraken у 2024 і standalone-продукт закрито (вторинні джерела: Koalr, OpenVisio; **неперевірене** за первинним оголошенням). Репозиторію з кодом немає. **keylang:** CodeSee робила автогенеровану карту залежностей файлів з «tours» — коментованими маршрутами по коду; ідея tour = flow з описами кроків.

### Swimm

- **URL:** https://swimm.io, комерційний. Репозиторію коду немає.
- **Що робить.** Історично — документація, прив'язана до коду через **Smart Tokens** і **Smart Snippets**, із патентованим **Auto-sync**: при зміні коду документ або автоматично оновлюється, або перевірка (у CI) падає й просить перегляд (блог Swimm, Smashing Magazine 2023). Сторінка docs.swimm.io/features/auto-sync — 404; головна сторінка 2026 позиціонує Swimm як «agentic modernization platform» для COBOL/JCL/PL/I з етапами Assessment → Specification → Modernization. Отже оригінальний продукт документації відходить на другий план — **частково неперевірене**.
- **keylang:** Smart Token = посилання з прози на ID/рядок коду з детектором дрейфу. У keylang це `check --stale` і прив'язка прози до ID знімка; відрізняється тим, що keylang не править прозу сам.

### Mintlify

- **URL:** https://www.mintlify.com. Комерційний хостинг документації; репозиторій `mintlify/mintlify` не існує (404).
- **Що робить.** «Agent»/«Autopilot»: спостерігає за репозиторієм продукту, після merge в main клонує репо, пише чернетку змін документації й відкриває PR або пушить напряму; тригери — cron, webhook, вручну (блог «Docs on autopilot», docs/agent/use-cases). **LLM**, стейлнес вирішується генерацією PR, не перевіркою.
- **keylang:** аналог для brief-ів: `explain --llm --brief` можна запускати як PR-бота після зміни `snapshotId`, лишаючи людині рев'ю diff.

### GitHub Copilot (github.com і VS Code)

- **Докс:** https://docs.github.com/en/copilot/tutorials/explore-a-codebase; https://code.visualstudio.com/docs/copilot/chat/copilot-chat. [microsoft/vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat) (10.0k★, MIT) **archived** 2026-05 — код перенесено в `microsoft/vscode`.
- **Що робить.** Відповіді на «Give me an overview of this repository…» з опорою на «repository's actual files and symbols»; у VS Code — `#codebase`, `#file`, `#folder`, `#`-згадки символів, слеш-команди (`/explain` в актуальній документації прямо не перелічено — **неперевірене**). Усе на вимогу.
- **keylang:** збігається з тезою «агент бере контекст сам»: MCP `search`/`node`/`code`/`context` — це keylang-варіант `#codebase`.

### aider repo-map

- **Репо:** [Aider-AI/aider](https://github.com/Aider-AI/aider) — 49.4k★, пуш 2026-05-22, Apache-2.0. Докс: https://aider.chat/docs/repomap.html.
- **Що робить.** Теги tree-sitter (визначення/посилання) → граф файлів → ранжування типу PageRank → мапа з сигнатур найважливіших символів у бюджеті `--map-tokens` (1k за замовчуванням), яка адаптується до файлів у чаті.
- **Рівні:** Component–Code як текст для LLM. **Статика.** Походження — ім'я файлу й рядок. **keylang:** ранжування вузлів за вхідними посиланнями для «що показати спершу» в карті/контекст-панелі (F4) з бюджетом токенів — пряме запозичення.

### Repomix / gitingest

- [yamadashy/repomix](https://github.com/yamadashy/repomix) — 28.7k★, пуш 2026-10-03, MIT. Пакує репо в XML/Markdown/JSON/plain; `--compress` через tree-sitter лишає сигнатури; `--token-count-tree`, `--token-budget` (ненульовий код виходу при перевищенні), Secretlint, `--mcp` (інструменти `pack_codebase`, `grep_repomix_output`), генерація Claude Agent Skills.
- [coderamp-labs/gitingest](https://github.com/coderamp-labs/gitingest) — 15.8k★, пуш 2026-10-04, MIT. Той самий «repo → один текст».
- **keylang:** `--token-budget` з кодом виходу та дерево токенів — готовий патерн для панелі «Контекст» (design §7.3 показує токени на елемент).

### Cursor, Continue.dev

- **Cursor** (SaaS; https://cursor.com/docs/context/codebase-indexing): документація 2026 каже, що Cursor **не завантажує** шляхи й код для індексу та **не зберігає ембеддинги**; пошук — локальний «Instant Grep» плюс Explore-субагент. Це зміна відносно раніших ембеддинг-індексів — **неперевірене** щодо історії.
- **Continue** — [continuedev/continue](https://github.com/continuedev/continue), 36.1k★, пуш 2026-10-04, Apache-2.0. Сторінка `@Codebase` не відкрилась (404) — деталі індексу **неперевірені**.

### Статичні аналізатори й графи

| Інструмент | Репо (★ / пуш / ліцензія / archived) | Рівні | Примітка |
|---|---|---|---|
| Doxygen | [doxygen/doxygen](https://github.com/doxygen/doxygen) 6.6k / 2026-09-30 / GPL-2.0 | Code (класи, include, `CALL_GRAPH`/`CALLER_GRAPH`, `DIRECTORY_GRAPH`) | потрібен Graphviz (`HAVE_DOT`); ліміти `DOT_GRAPH_MAX_NODES`, `MAX_DOT_GRAPH_DEPTH` |
| Sourcetrail | [CoatiSoftware/Sourcetrail](https://github.com/CoatiSoftware/Sourcetrail) 16.5k / 2021-12-13 / GPL-3.0 / **archived** | Code | інтерактивний провідник; авторами закрито наприкінці 2021 |
| CodeQL | [github/codeql](https://github.com/github/codeql) 10.2k / 2026-10-04 / MIT (бібліотеки) | Code | Datalog-подібні запити над БД коду; CLI — власна ліцензія GitHub |
| Joern | [joernio/joern](https://github.com/joernio/joern) 3.5k / 2026-10-04 / Apache-2.0 | Code | Code Property Graph = AST + CFG + PDG + call graph; Scala-DSL; 8 фронтендів |
| Understand (SciTools) | комерційний, https://scitools.com | Component–Code | dependency/butterfly графи, «architectures» (ручне групування), метрики, сертифікації ISO 26262 |
| Emerge | [glato/emerge](https://github.com/glato/emerge) 1.2k / 2026-08-07 / MIT | Container–Component (файли, сутності для Java/Swift/Kotlin/Groovy) | D3-граф, fan-in/out, Louvain-кластери, TF-IDF; без LLM |
| dependency-cruiser | [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 7.2k / 2026-10-01 / MIT | Container–Component (модулі JS/TS) | правила заборон у JSON/JS — найближчий аналог `rules.md` |
| madge | [pahen/madge](https://github.com/pahen/madge) 10.2k / 2026-01-21 / MIT | Component (модулі) | граф + цикли; без правил |
| ts-morph | [dsherret/ts-morph](https://github.com/dsherret/ts-morph) 6.2k / 2026-09-29 / MIT | Code | обгортка TS Compiler API, основа для власних екстракторів |
| Nx graph | [nrwl/nx](https://github.com/nrwl/nx) 29.4k / 2026-10-03 / MIT | Container (проєкти монорепо) | `nx graph --focus`, trace Start→End, клік по ребру показує файл-джерело залежності |

**keylang:** Understand-«architectures» і dependency-cruiser-правила — ті самі шари й `deny`; Nx-trace Start→End — готовий UX для `flow`-пояснення шляху в графі; Joern показує, що рівень «виклики» потребує CFG/PDG, тобто keylang правильно позначає міжпроцедурні ребра `unverified`, коли їх не підтверджено.

## 4. Spec-driven авторство фіч для агентів

### GitHub Spec Kit

- **Репо:** [github/spec-kit](https://github.com/github/spec-kit) — 140.1k★, пуш 2026-10-03, MIT; реліз v1.1.0 (2026-10-02). Опис процесу: `spec-driven.md`; шаблони: `constitution-template.md`, `spec-template.md`, `plan-template.md`, `tasks-template.md`, `checklist-template.md`.
- **Стадії → артефакти.** `constitution` → `memory/constitution.md` (незмінні принципи); `/speckit.specify` → `specs/<branch>/spec.md` (user stories, acceptance criteria, маркери `[NEEDS CLARIFICATION]`), нова гілка на фічу; `/speckit.clarify` — проходження маркерів; `/speckit.plan` → `plan.md`, `data-model.md`, `contracts/`, `research.md`, `quickstart.md`; `/speckit.tasks` → `tasks.md` з `[P]` для паралельних задач; `/speckit.analyze` — перевірка відповідності конституції; `/speckit.implement`.
- **B:** так, усі три рівні (ідея → спека → задачі). Зв'язок із кодом — лише через гілку; перевірки відповідності реалізації спеці немає.
- **keylang:** маркер `[NEEDS CLARIFICATION]` ≈ `<shiftwork:needs-info>` у тікетах; `[P]` — паралельність задач. Конституція ≈ `rules.md` + `AGENTS.md`. Відрізняється: у keylang готовність фічі — вердикт `feature_status` зі знімка, не чекліст.

### AWS Kiro specs

- **URL:** https://kiro.dev/docs/specs/ ; репозиторій [kirodotdev/Kiro](https://github.com/kirodotdev/Kiro) — 4.3k★, пуш 2026-09-15, без ліцензії (лише issue-трекер; IDE закрита). Amazon Q Developer CLI перейменовано на Kiro CLI (11.2025), підтримку Q Developer IDE-плагінів завершують 30.04.2027 (Kiro migration guide; дати з вторинних джерел — **частково неперевірене**).
- **Стадії → артефакти.** `requirements.md` (або `bugfix.md`) → `design.md` → `tasks.md`; задачі посилаються на вимоги, виконуються «хвилями» паралельно; «Sync Files» перегенерує задачі після зміни вимог; підтримується і design-first порядок. EARS-шаблони у вимогах («WHEN [condition] THEN the system SHALL…»; підтверджено на сторінці best practices). «Steering» — файли сталого контексту.
- **B:** так. **keylang:** EARS-форма «WHEN … THEN the system SHALL» лягає один в один на `when`/`then` у flows; двонапрямний sync requirements↔design↔tasks — аналог `code-to-spec`/`spec-to-code`.

### OpenSpec

- **Репо:** [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — 71.0k★, пуш 2026-10-02, MIT; реліз v1.14.0 (2026-09-30).
- **Стадії → артефакти.** `openspec/specs/` — чинні вимоги зі сценаріями; `openspec/changes/<name>/` — `proposal.md`, `design.md`, `tasks.md`, `specs/` з дельтами `## ADDED/MODIFIED/REMOVED Requirements` і сценаріями WHEN/THEN; `/opsx:propose` → `/opsx:apply` → `/opsx:archive` переносить зміну в `changes/archive/` і зливає дельти в `specs/`. Також `explore`, `verify`, `ff`. 30+ агентських інструментів.
- **B:** так, і єдиний із трьох, що тримає «чинну спеку» окремо від «зміни» (spec-anchored). **keylang:** дельта-спека ≈ файл фічі з `planned`; archive ≈ прибирання `planned` за K202 і злиття правил у `rules.md`. Запозичити явний стан «proposal / applied / archived» для `features/<slug>.md`.

### BMAD-Method

- **Репо:** [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) — 53.8k★, пуш 2026-10-04, NOASSERTION. Докс: https://docs.bmad-method.org.
- **Стадії.** Три «шляхи» за розміром: one-session (Intent → Build → Result), epic-sized (Spec → Stories → Build по сторі → Integrate → Retrospect), project-sized (додає спільні product/UX/tech контракти). Артефакти: product brief, PRD з validation reports, `DESIGN.md`/`EXPERIENCE.md`, tech spec, architecture decisions, `tickets.toml`, епіки/сторі. Рольові агенти (Analyst, PM, Architect, SM, Dev) є в репозиторії, але на сторінці планування явно не перелічені — **частково неперевірене**.
- **keylang:** ідея «глибина планування масштабується з розміром роботи» — прямий аргумент за те, щоб асистент у (B) не вимагав усіх рівнів для дрібної фічі.

### Tessl

- **URL:** https://tessl.io, https://docs.tessl.io (огляд: Registry, Governance, Evals, Observability, Tessl Agent). Репозиторій `tessl-io/tessl` не існує; є [tesslio/spec-driven-development-tile](https://github.com/tesslio/spec-driven-development-tile). Формат спек (`.spec.md` з YAML frontmatter, `@generate`, `@test`, код з позначкою «GENERATED FROM SPEC — DO NOT EDIT») відомий зі статей Бьокелер/Fowler і блогу Tessl — **частково неперевірене**, продукт у беті.
- **keylang:** єдиний «spec-as-source». keylang свідомо не йде туди (design §5.5: `spec-to-code` — заготовка, не джерело істини).

### Інші

- **ai-dev-tasks** — [snarktank/ai-dev-tasks](https://github.com/snarktank/ai-dev-tasks) 7.8k★, пуш 2025-11-05, Apache-2.0: три промпти `create-prd.md` → `generate-tasks.md` → `process-task-list.md`; PRD через уточнювальні питання, виконання по одній підзадачі з підтвердженням.
- **Task Master** — [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) 28.1k★, пуш 2026-04-28, MIT + Commons Clause: `parse-prd` → `tasks.json`, `expand_task`, аналіз складності, MCP для Cursor/Windsurf/Claude Code.
- **AGENTS.md** — [agentsmd/agents.md](https://github.com/agentsmd/agents.md) 24.8k★, MIT: відкритий формат інструкцій агенту, nearest-file precedence у монорепо, підтримка Codex, Jules, Cursor, Amp, Aider, Copilot; [openai/codex](https://github.com/openai/codex) 127.8k★, Apache-2.0. keylang уже пише блок у `AGENTS.md` (design §7.6).
- **Aider architect mode** — architect-модель пропонує рішення, editor-модель застосовує правки (`--editor-model`); режими `code`/`ask`/`architect`/`help`.
- **Devin Interactive Planning** — перед кодом Devin показує знайдені файли й план; користувач редагує/перевпорядковує кроки й схвалює; режим «Agency» пропускає схвалення (вторинні джерела + release notes; **частково неперевірене**).
- **Cursor Plan Mode** — уточнювальні питання → дослідження коду → план як Markdown (за замовчуванням у домашній теці, можна зберегти у воркспейс) → «Build».
- **Claude Code Plan Mode** — `--permission-mode plan` або `Shift+Tab`; читає, пропонує, не редагує до схвалення; рецепт «overview → architecture → data models → trace the login» для розуміння коду.
- **EARS** — Mavin, Wilkinson, Harwood, Novak, *Easy Approach to Requirements Syntax*, RE 2009, с. 317–322, https://doi.org/10.1109/RE.2009.9: п'ять шаблонів (ubiquitous, event-driven WHEN, state-driven WHILE, unwanted IF…THEN, optional WHERE).
- **Gherkin/BDD** — [cucumber/gherkin](https://github.com/cucumber/gherkin) 411★, MIT: Given/When/Then, прив'язка сценарію до кроків-тестів — предок `flow` з `test`.
- **ADR** — [architecture-decision-record/architecture-decision-record](https://github.com/architecture-decision-record/architecture-decision-record) 17.1k★; [adr/madr](https://github.com/adr/madr) 2.5k★ (шаблон MADR 4). keylang уже веде `docs/adr/`.
- **Shape Up pitch** — п'ять складників: Problem, Appetite, Solution, Rabbit holes, No-gos; breadboards і fat-marker sketches як свідомо низька деталізація (basecamp.com/shapeup, гл. 6).
- **Linear AI** — changelog 2026: «Write with Agent» для оновлень проєкту, редагування тексту агентами з підсвіткою змін і історією версій, генерація issue з PR; окремої «write with AI» для опису issue в changelog не знайдено — **неперевірене**.
- **GitHub issue forms** — YAML у `.github/ISSUE_TEMPLATE`: `markdown`, `input`, `textarea`, `dropdown`, `checkboxes`, `validations.required`; відповіді конвертуються в Markdown тіла issue.

## 5. Асистенти й проактивна допомога

- **Clippy / Office Assistant.** Вторинні джерела (Wikipedia, Seattle Met) узгоджено: 11.04.2001 Microsoft оголосила, що Office Assistant в Office XP вимкнено за замовчуванням; рекламна кампанія «Clippy out of a job» (officeclippy.com); остаточно прибрано в Office 2007. Урок, який цитують усі: допомога, що з'являється без запиту й перериває роботу, відторгається навіть за корисного змісту. Офіційний прес-реліз на news.microsoft.com знайти не вдалося — **неперевірене**.
- **Copilot Chat (VS Code)** — на вимогу: `#codebase`, `#file`, `#`-символи, слеш-команди як шорткати промптів; інлайн-підказки — єдиний проактивний канал, і той обмежений кодом.
- **JetBrains AI Assistant** — чат «on-demand»: вкладення файлів/символів, «review and apply»; агенти — для багатокрокових змін. Проактивних пояснень немає.
- **Zed Agent Panel** — `@`-згадки (files, directories, symbols, threads, diagnostics, branch diffs), «Review Changes» з прийняттям по hunk, профілі інструментів; окремого plan mode у документації не описано.
- **Windsurf Cascade** — тепер під брендом Devin Desktop (Cognition): режими Code/Chat, «planning agent» підтримує довгий план і Todo-список у розмові; Memories & Rules.
- **CLI-харнеси** — [anthropics/claude-code](https://github.com/anthropics/claude-code) 149.4k★ (без ліцензії в репо), [anomalyco/opencode](https://github.com/anomalyco/opencode) 211.7k★, MIT (колишній `sst/opencode`), [earendil-works/pi](https://github.com/earendil-works/pi) 112.4k★, MIT (колишній `badlogic/pi-mono`; «minimal, extensible agent harness», розширення/skills/пакети через npm), [cline/cline](https://github.com/cline/cline) 69.8k★, Apache-2.0; [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) 24.3k★ — **archived** 2026-05. Спільна модель: явний plan/ask-режим, diff-рев'ю перед записом, AGENTS.md як пам'ять.
- **Висновок для (B).** Жоден інструмент не має «Clippy, що росте з глибиною». Є два робочі замінники: *сходинки з явним переходом* (Spec Kit/Kiro команди по стадіях; Plan Mode → Build) і *маркери прогалин у самому документі* (`[NEEDS CLARIFICATION]`, обов'язкові поля issue forms). Обидва не перебивають людину.

## 6. Markdown-вікі та свіжість документації

| Інструмент | Репо (★ / пуш / ліцензія) | Зв'язок | Що дає для keylang |
|---|---|---|---|
| Obsidian Graph view | закритий; [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 22.0k★ (лише релізи) | `[[wikilink]]` → граф; **local graph з повзунком depth**: кожен рівень показує сусідів попереднього; фільтри, групи за кольором | «локальний граф із глибиною N» — найкращий UX для зуму від вузла в TUI |
| Foam | [foambubble/foam](https://github.com/foambubble/foam) 17.4k★ / 2026-09-30 / MIT («alpha-grade» за README) | wikilinks, backlinks, граф, шаблони у VS Code | backlinks для «де згаданий вузол» у hover |
| Dendron | [dendronhq/dendron](https://github.com/dendronhq/dendron) 7.5k★ / 2025-11-13 / Apache-2.0 — **maintenance only** за README | ієрархічні імена `a.b.c` як шлях нотатки | підтвердження, що крапкові ієрархічні ID читаються людьми |
| Log4brains | [thomvaill/log4brains](https://github.com/thomvaill/log4brains) 1.6k★ / 2024-12-17 / Apache-2.0 (неактивний) | ADR як незмінні Markdown, статус змінюється, сайт із таймлайном з git | таймлайн рішень із git-метаданих для `docs/adr` |
| Docusaurus | [facebook/docusaurus](https://github.com/facebook/docusaurus) 66.4k★ / 2026-10-02 / MIT | сайт документації; версіонування доків | експорт explained map у статичний сайт |
| mdBook | [rust-lang/mdBook](https://github.com/rust-lang/mdBook) 22.2k★ / 2026-10-04 / MPL-2.0 | книга з Markdown; `{{#include file:10:20}}` — вставка діапазону рядків коду | включення діапазону рядків — простий механізм провенансу; дрейф видно у diff |
| Swimm | комерційний (§3) | Smart Tokens/Snippets + Auto-sync + перевірка в CI | єдиний продукт із «doc drift» як перевіркою |
| Mintlify | комерційний (§3) | агент відкриває PR у доки після merge | свіжість через PR-бота |

**Стейлнес у keylang** (design §4.4, `check --stale`) — третій шлях між Swimm (патентований авто-ремонт) і Mintlify (LLM-PR): детермінована діагностика з ID і span, без правки тексту.

## 7. Порівняльна таблиця

Позначення: A — читання згори донизу, B — поступове авторство; рівні C4: Ctx, Cont, Comp, Code (+Dyn — потоки); «Пров.» — чи є посилання з пояснення на код; «Стейл.» — чи виявляє застарілість.

| Інструмент | A | B | Рівні | Пров. | Стейл. | LLM/статика | Статус 2026-10 |
|---|---|---|---|---|---|---|---|
| Structurizr | ✓ | – | Ctx–Comp (+Dyn, Code для Java) | url/!components | – | ручна модель | активний монорепо; старі репо archived |
| C4-PlantUML | ✓ | – | Ctx–Comp (+Dyn) | `$link` | – | ручна | активний |
| Mermaid C4 | ✓ | – | Ctx–Comp (+Dyn) | – | – | ручна | experimental, без drill-down |
| IcePanel | ✓ | ~ | Ctx–Comp (+flows) | API | – | ручна | SaaS |
| LikeC4 | ✓ | – | Ctx–Comp (+Dyn) | `link` на файл | – | ручна | активний |
| Archi | ✓ | – | вище Ctx | – | – | ручна | активний |
| DeepWiki | ✓ | – | Ctx–Code (проза) | source links | ? | LLM | SaaS |
| DeepWiki-Open | ✓ | – | Ctx–Code | посилання | – | LLM | активний |
| CodeBoarding | ✓ | – | Cont–Code | source refs | PR-diff | гібрид | активний |
| gitdiagram | ✓ | – | Cont | клік у файл | – | LLM | активний |
| RepoAgent | ✓ | – | Comp–Code | ієрархія JSON | pre-commit | гібрид | неактивний |
| Sourcegraph/Cody | ✓ | – | Code | символи | – | статика+LLM | Cody enterprise-only; репо archived |
| CodeSee | ✓ | – | Cont–Comp | файли | – | статика | закрито (GitKraken) |
| Swimm | ~ | – | текст↔код | Smart Tokens | ✓ CI | статика(+AI) | перепозиціонований |
| Mintlify agent | – | – | текст | – | PR | LLM | SaaS |
| Copilot Chat | ✓ | ~ | Code | файли/символи | – | LLM | активний |
| aider repo-map | ✓ | – | Comp–Code | файл:рядок | – | статика | активний |
| Repomix/gitingest | ✓ | – | Code | шлях | – | статика | активний |
| Doxygen | ✓ | – | Code | лістинги | – | статика | активний |
| Sourcetrail | ✓ | – | Code | ✓ | – | статика | archived 2021 |
| CodeQL/Joern | ✓ | – | Code | ✓ | – | статика | активний |
| Understand | ✓ | – | Comp–Code | ✓ | – | статика | комерційний |
| Emerge | ✓ | – | Cont–Comp | файли | – | статика | активний |
| dependency-cruiser/madge | ✓ | – | Comp | файли | – | статика | активний |
| Nx graph | ✓ | – | Cont | файл ребра | – | статика | активний |
| Spec Kit | – | ✓ | ідея→спека→план→задачі | гілка | – | LLM-промпти | активний |
| Kiro specs | – | ✓ | requirements→design→tasks | – | Sync Files | LLM | закрита IDE |
| OpenSpec | – | ✓ | proposal→delta→tasks→archive | – | archive | LLM-промпти | активний |
| BMAD | – | ✓ | 3 шляхи за розміром | – | – | LLM-агенти | активний |
| Tessl | – | ✓ | spec-as-source | код згенеровано | build | LLM | бета |
| ai-dev-tasks / Task Master | – | ✓ | PRD→tasks | – | – | LLM | активні |
| Plan Mode (Claude Code/Cursor/Devin) | ~ | ✓ | план→код | – | – | LLM | активні |
| Obsidian/Foam/Dendron | ~ | – | нотатки | wikilinks | – | – | активні/maintenance |
| mdBook `#include` | – | – | текст↔рядки | діапазон рядків | diff | – | активний |
| **keylang (ціль)** | ✓ | ✓ | Cont–Code (+Dyn=flows) | snapshotId+spans | `check --stale` | детерм.+LLM окремо | — |

## 8. Що запозичити keylang

1. **«Клік = scoped view» (LikeC4, IcePanel).** У TUI вхід у вузол має відкривати його внутрішній рівень тієї ж карти з тим самим фільтром, а не окремий файл. Рівні C4 відображаються на keylang так: Context ≈ `keylang.json` + `external.*`, Container ≈ шар, Component ≈ модуль, Code ≈ `fn`/`type`/`event`, Dynamic ≈ `flow`.
2. **Local graph з повзунком глибини (Obsidian).** Для режиму читання: «сусіди вузла на відстані N» зі знімка; кандидат у TUI поряд з hover.
3. **Ранжування вузлів із бюджетом токенів (aider, Repomix).** PageRank по графу знімка визначає, які вузли показувати в brief-ах рівня «огляд» і що класти в панель «Контекст»; `--token-budget` з кодом виходу — для MCP `context`.
4. **Обов'язкові «source links» під кожним абзацем (DeepWiki, CodeBoarding).** Explained map уже вимагає посилань лише на ID знімка; варто додати рендер `id → file:line` і перевірку, що кожен brief має ≥1 посилання на ID.
5. **Архітектурний diff PR (CodeBoarding, Nx).** `check --changed` доповнити списком змінених вузлів із коротким brief-ом і файлом, що створив нове ребро, як робить Nx при кліку на залежність.
6. **Маркер невизначеності в документі (Spec Kit `[NEEDS CLARIFICATION]`).** Для файлу фічі — явний рядок-маркер, який `validate_spec` рахує і `feature_status` показує як прогалину; це і є «Clippy, що не перебиває».
7. **Стани зміни proposal → applied → archived (OpenSpec).** Файл фічі має явний статус; `archive` = усі `planned` реалізовані (K202), правила злиті в `rules.md`. Зберігати архів, а не видаляти.
8. **EARS-шаблони як підказки для `when`/`then` (Kiro).** Детерміновані сніпети «WHEN … THEN …», «WHILE …», «IF … THEN …» у LSP-автодоповненні під `flow`; EARS — п'ять шаблонів, keylang має два; відсутні — кандидати після заморожування v1 (ADR 0009).
9. **Глибина за розміром роботи (BMAD, Shape Up).** Асистент (B) не вимагає всіх рівнів: для дрібної фічі — лише `planned` + один `flow`; для великої — ще pitch-подібний опис (problem, appetite, no-gos) у вільному тексті вузла. Appetite і no-gos — чисто проза, не семантика.
10. **Plan Mode як межа (Claude Code, Cursor, Devin).** Текст → spec (`Ctrl+G`) має бути read-only кроком з явним «прийняти», як MERGE по шматках; це вже збігається з design §7.3 і підтверджується всіма харнесами.
11. **Doc drift як перевірка, не ремонт (Swimm vs Mintlify).** Лишити `check --stale` детермінованим; LLM-оновлення brief-ів — окремий опційний PR-бот, як Mintlify agent, з видимою моделлю й датою (вже в ADR 0004).
12. **Виклики — чесно `unverified` (Joern, Sourcetrail).** Рівень Code у C4 потребує CFG/call graph; поки резолвер синтаксичний, пояснення рівня «виклики» має показувати ◌ і причину, а не вигадувати ребра, як gitdiagram.
13. **Експорт у Mermaid для GitHub-рендеру.** Карту рівнів Container/Component можна проєктувати в `C4Container`/`C4Component` або `flowchart` для README — без втрати детермінованості, бо це похідний артефакт.
14. **Чого не робити.** Не йти в spec-as-source (Tessl): код пише харнес, keylang звіряє. Не вводити проактивні спливаючі підказки без сигналу — досвід Clippy і одностайний UX усіх сучасних асистентів.

## 9. Джерела

### 9.1 C4 та architecture-as-code

- C4 model, abstractions: https://c4model.com/abstractions
- Structurizr DSL language reference: https://docs.structurizr.com/dsl/language ; монорепо: https://github.com/structurizr/structurizr ; archived `structurizr/java` README з посиланням на монорепо.
- C4-PlantUML README: https://github.com/plantuml-stdlib/C4-PlantUML
- Mermaid C4: https://mermaid.js.org/syntax/c4.html
- LikeC4 docs: https://likec4.dev/dsl/model/ , https://likec4.dev/dsl/views/ ; репо https://github.com/likec4/likec4
- IcePanel: https://icepanel.io/c4-model
- Archi: https://github.com/archimatetool/archi
- d2: https://github.com/d2lang/d2 ; diagrams: https://github.com/mingrammer/diagrams

### 9.2 Код → документація

- DeepWiki: https://docs.devin.ai/work-with-devin/deepwiki , https://deepwiki.com
- DeepWiki-Open: https://github.com/AsyncFuncAI/deepwiki-open
- CodeBoarding: https://github.com/CodeBoarding/CodeBoarding
- gitdiagram: https://github.com/ahmedkhaleel2004/gitdiagram
- RepoAgent: https://github.com/OpenBMB/RepoAgent
- Sourcegraph: https://github.com/sourcegraph/sourcegraph-public-snapshot ; Cody plan changes: https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans
- CodeSee (вторинні): https://koalr.com/blog/codesee-alternatives , https://openvisio.io/compare/codesee-alternative
- Swimm: https://swimm.io ; Smashing Magazine, *Code Documentation, Streamlined* (2023): https://www.smashingmagazine.com/2023/01/swimm-code-documentation-streamlined/
- Mintlify: https://www.mintlify.com/blog/autopilot , https://www.mintlify.com/docs/agent/use-cases
- GitHub Copilot explore a codebase: https://docs.github.com/en/copilot/tutorials/explore-a-codebase ; VS Code Copilot Chat: https://code.visualstudio.com/docs/copilot/chat/copilot-chat ; archived https://github.com/microsoft/vscode-copilot-chat
- aider repo-map: https://aider.chat/docs/repomap.html ; modes: https://aider.chat/docs/usage/modes.html
- Repomix: https://github.com/yamadashy/repomix ; gitingest: https://github.com/coderamp-labs/gitingest
- Cursor indexing: https://cursor.com/docs/context/codebase-indexing ; Continue: https://github.com/continuedev/continue
- Doxygen diagrams: https://www.doxygen.nl/manual/diagrams.html
- Sourcetrail (archived): https://github.com/CoatiSoftware/Sourcetrail
- CodeQL: https://github.com/github/codeql ; Joern CPG: https://docs.joern.io/code-property-graph/
- Understand: https://scitools.com/features
- Emerge: https://github.com/glato/emerge ; dependency-cruiser: https://github.com/sverweij/dependency-cruiser ; madge: https://github.com/pahen/madge ; ts-morph: https://github.com/dsherret/ts-morph
- Nx graph: https://nx.dev/docs/features/explore-graph

### 9.3 Spec-driven

- Spec Kit: https://github.com/github/spec-kit , `spec-driven.md`, `templates/`
- Kiro specs: https://kiro.dev/docs/specs/ , best practices (EARS): https://kiro.dev/docs/specs/best-practices/ ; міграція з Q: https://kiro.dev/docs/upgrade-guides/migrating-from-q/
- OpenSpec: https://github.com/Fission-AI/OpenSpec
- BMAD: https://github.com/bmad-code-org/BMAD-METHOD , https://docs.bmad-method.org/plan/choose-a-planning-path/
- Tessl: https://docs.tessl.io , https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry , https://github.com/tesslio/spec-driven-development-tile
- Böckeler (martinfowler.com), *Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl*: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- ai-dev-tasks: https://github.com/snarktank/ai-dev-tasks ; Task Master: https://github.com/eyaltoledano/claude-task-master
- AGENTS.md: https://agents.md , https://github.com/agentsmd/agents.md ; Codex: https://github.com/openai/codex
- Cursor Plan Mode: https://cursor.com/docs/agent/planning ; Claude Code common workflows: https://code.claude.com/docs/en/common-workflows ; Devin release notes: https://docs.devin.ai/release-notes/2024
- Mavin et al., *Easy Approach to Requirements Syntax (EARS)*, RE 2009: https://doi.org/10.1109/RE.2009.9
- Gherkin: https://github.com/cucumber/gherkin ; ADR: https://github.com/architecture-decision-record/architecture-decision-record , MADR: https://github.com/adr/madr
- Shape Up, ch. 6 *Write the Pitch*: https://basecamp.com/shapeup/1.5-chapter-06
- GitHub issue forms syntax: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
- Linear changelog: https://linear.app/changelog

### 9.4 Асистенти

- Office Assistant (Wikipedia, із посиланням на анонс 11.04.2001): https://en.wikipedia.org/wiki/Office_Assistant ; Seattle Met, *The Twisted Life of Clippy* (2022): https://www.seattlemet.com/news-and-city-life/2022/08/origin-story-of-clippy-the-microsoft-office-assistant
- JetBrains AI chat: https://www.jetbrains.com/help/ai-assistant/ai-chat.html
- Zed Agent Panel: https://zed.dev/docs/ai/agent-panel
- Windsurf Cascade (Devin Desktop): https://docs.devin.ai/desktop/cascade/cascade
- Claude Code: https://github.com/anthropics/claude-code ; opencode: https://github.com/anomalyco/opencode ; pi: https://github.com/earendil-works/pi ; cline: https://github.com/cline/cline ; Roo Code (archived): https://github.com/RooCodeInc/Roo-Code

### 9.5 Markdown-вікі

- Obsidian Graph view: https://obsidian.md/help/plugins/graph
- Foam: https://github.com/foambubble/foam ; Dendron (maintenance): https://github.com/dendronhq/dendron ; Log4brains: https://github.com/thomvaill/log4brains
- Docusaurus: https://github.com/facebook/docusaurus ; mdBook: https://github.com/rust-lang/mdBook

## 10. Неперевірене й відкинуте

**Неперевірене (позначено в тексті):**

- Офіційний прес-реліз Microsoft від 11.04.2001 про вимкнення Office Assistant за замовчуванням — знайдено лише у вторинних джерелах (Wikipedia, Seattle Met, TV Tropes); на news.microsoft.com сторінку не знайдено.
- Періодичність оновлення DeepWiki після нових комітів; технічні деталі RAG у DeepWiki-Open (README 2.0 їх не містить).
- Swimm Auto-sync: сторінка документації `features/auto-sync` — 404; опис — за блогом Swimm і Smashing Magazine 2023. Поточний стан документаційного продукту після перепозиціонування на модернізацію невідомий.
- CodeSee: факт поглинання GitKraken і закриття standalone-продукту — лише вторинні джерела; репозиторій `Codesee-io/codesee` не існує.
- Sourcegraph Amp як окрема компанія з 12.2025 — вторинне джерело.
- Дати завершення підтримки Amazon Q Developer (15.05.2026 / 30.04.2027) — вторинні джерела; офіційна сторінка AWS віддала лише заголовок.
- Tessl: формат `.spec.md`, `@generate`/`@test` — за статтею Бьокелер і блогом Tessl; docs.tessl.io у поточному вигляді описує Registry/Governance/Evals, не формат спеки.
- Cursor: твердження «не зберігає ембеддинги» — з поточної документації; чи це зміна відносно раніших версій, не підтверджено.
- Continue `@Codebase` і Archi features — сторінки 404; Copilot `/explain` — не знайдено в актуальній документації VS Code.
- BMAD: назви рольових агентів є в репозиторії, але на процитованій сторінці планування явно не перелічені.
- Linear: окремої функції «write with AI» для тексту issue в changelog не знайдено; є «Write with Agent» для project updates.
- Структура `.devin/wiki.json` відома лише з документації Devin; схему не перевіряли.

**Відкинуте як нерелевантне:**

- Archi/ArchiMate — рівень підприємства, вище за C4 Context, без зв'язку з кодом.
- diagrams (mingrammer), d2 — мови малюнків без моделі коду; d2 згадано лише за механізм `layers`.
- Notion AI, JetBrains «generate documentation», Copilot inline completions — не стосуються ні карт, ні специфікацій; підтверджують лише принцип «на вимогу».
- Sourcetrail, RepoAgent, Log4brains, Dendron — архівовані або без розвитку; залишено як джерела ідей, не як залежності.
- gitdiagram — LLM-діаграма без статики; залишено як антиприклад вигаданих ребер.

† — archived.
