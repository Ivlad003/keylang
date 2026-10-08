# 11: `keylang flows discover`: чернетка флоу для кожної точки входу

**Status:** resolved

**Type:** code

**Blocked by:** 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

- Для кожної точки входу — `draft flow <id> --mode algo` з тригером відповідного виду (форма за ADR 0023, до його реалізації — звичайний `trigger <id>` і коментар виду).
- ~~Пропозиції в `.keylang/proposals/…`~~ → згенероване представлення `keylang/flows-discovered/<group>.md` + `flows adopt` (див. рев'ю плану нижче).
- Для кожного флоу коментар покриття: `<!-- keylang:discover steps=N holes=K via=… -->`; дірки на маршруті — рядками `unresolved`.
- Прапорці: `--kind`, `--layer`, `--limit`, `--depth` (типово 4), `--print`; детермінований порядок; повторний запуск не дублює вже написані вручну флоу з тим самим тригером (лише звіт).
- Підсумок: `discovered N flows (M already specified), K with blind spots`.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [x] фікстура з трьома точками входу → три пропозиції; повтор — ідемпотентний (за рев'ю плану: чотири точки входу двох видів у TS і Python → чотири потоки в представленні `flows-discovered/`, повтор дає ті самі байти; `flows adopt` → одна пропозиція)
- [ ] на бенчі Magento: discover відпрацьовує < 60 с і дає флоу для всіх webapi-маршрутів checkout — не виміряно в цій зміні: webapi-точок входу Magento ще немає (тікет 10); discover лінійний за кількістю точок входу поверх одного аналізу, див. коментар
- [x] `docs/cli.md`, `--help`, TUI-дія каталогу

**Межі:** бізнес-назви — 12.

## Comments

### Рев'ю плану (2026-10-07)

**Проблема DX.** `proposals accept <target>` приймає одну ціль, а `tools.md` каже «для людини, не для агента»; MERGE — по шматку в TUI. На Magento `discover` дасть сотні флоу: сотні пропозицій ніхто не зіллє. А якщо писати їх прямо в `keylang/flows/`, `check` читатиме їх як твердження, і «N ok» роздується (ризик №6 рев'ю §3) — хоча це не твердження людини, а зріз графа.

**Рішення:** discovered-флоу — **представлення** (ADR 0014), не специфікація: `keylang/flows-discovered/<group>.md` з маркером `keylang:generated`, яке `check` не читає, а карта/TUI/web показують поруч із флоу. Людина або агент «усиновлює» потрібний флоу командою `keylang flows adopt <name> [--into flows/<file>.md]` — ось це вже пропозиція (одна, з коментарями походження), яку зливають. `fmt`/`map --check` ставляться до цього файла як до карти (застарілість, детермінізм). Так жоден автоматичний флоу не впливає на вердикт.

### Реалізація (2026-10-08)

- `src/discover.ts`: `discoverFlows` — для кожної fn точки входу `draftFlow` (тригер — fn, звичайний `- trigger <id>`, бо форми ADR 0023 ще немає), назви розводить `distinctNames` як у `code-to-spec`, файл представлення — шар fn, потоки у файлі за назвою; під заголовком `<!-- keylang:discover entry=<вид> label="…" steps=N holes=K -->`, дірки лишаються коментарями `keylang:algo unresolved`. Тригер, який має рукописний потік, пропускається (`already specified: …` у stderr). `via=` з початкового плану не пишеться: у draft-а немає `via`, він з'явиться з адаптерами (04–08).
- Представлення `keylang/flows-discovered/<шар>.md` з маркером `keylang:generated`: `analyze` не читає теку (як `map-explained/`, `explain/`), `proposalProblem` відмовляє їй (`draft --into`, `flows adopt --into`, MCP `apply_diff`, `proposals`). Запис — лише змінені файли, лише поверх маркера; зайві згенеровані файли видаляються лише без фільтрів. `--check` нічого не пише, 1 коли застаріле; `--print` — stdout.
- `keylang flows adopt <name> [--into <spec.md>] [--depth d]` → одна пропозиція через `flowCandidate`/`withFlow`/`commitProposal` з коментарем `<!-- keylang:discover adopted … from=<dir>/flows-discovered/<шар>.md -->`.
- Операції `flows-discover`/`flows-adopt` (`src/operations/discover.ts`), MCP `discover_flows` (лише читання), дія TUI «Discover flows» зі звітом у F6.
- `fmt`: згенерований файл він і так лишає за маркером. `map --check` представлення не перевіряє — для цього `flows discover --check` (окрема команда, бо фільтри й глибина належать їй).
- Magento-критерій: точки входу webapi дає тікет 10; поки його немає, на бенчі нема що знаходити. Вимірювання < 60 с — разом із 10/03.
