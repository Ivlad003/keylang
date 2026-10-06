# 38: Режим `static` у `keylang.json` (`check.static`), прапорець `--static` лише перевизначає

**Джерело:** research-pl §5 Р-11; знахідка 8; рішення Q19 (spec)

**What to build:** Зараз режим доказу `static` задає лише прапорець `check --static`: опцію оголошено в src/cli.ts:191, значення перевіряють на :1070-1071. Типове `"behavior"` зашито двічі, у src/cli.ts:238 і src/flows.ts:388.

Інші поверхні викликають `analyze()` без режиму, тобто завжди працюють у behavior:
- LSP (src/lsp.ts:195);
- MCP (src/mcp.ts:57, :237);
- TUI (src/tui/terminal.ts:130);
- web (src/tui/web.ts:170);
- `feature` (src/cli.ts:863);
- `hook stop` (src/cli.ts:880).

Тож коли CI запускає `check --static=shape`, та сама специфікація на тому самому коді дає в редакторі й у Stop-хуку інші вердикти. Задати режим у конфігу не можна: `"check": {"static": …}` дає `` unknown field `check.static` `` і код 2 (src/config.ts:188).

Після зміни репозиторій задає режим один раз: `"check": { "static": "shape" }`. За ним однаково судять усі поверхні: `check` (зокрема `--changed`), `feature`, `hook stop`, LSP, MCP, TUI і `keylang web`.

Поведінка:
- пріоритет такий: прапорець, потім конфіг, потім `behavior`. Без поля наявні репозиторії вердиктів не змінюють;
- `check --static=<mode>` перевизначає конфіг на один запуск;
- невалідне значення дає код 2 для кожної команди, що читає конфіг, з назвою файла й поля: `` keylang.json: `check.static` must be "behavior" or "shape", got "runtime" ``;
- `keylang lsp` при цьому не завершується, а, як і зараз, показує помилку конфігу клієнту (src/lsp.ts:96, :197; tests/lsp.test.ts:217);
- evidence хука називає режим і його джерело. Зараз `(not followed with --static=shape)` (src/flows.ts:345) згадує прапорець, навіть коли режим прийшов із конфігу. Новий текст — `(not followed in static mode shape, set by --static)` або `(not followed in static mode shape, set by keylang.json check.static)`;
- типове значення можна змінити лише з новою версією формату (35). У format.md це записано одним реченням.

Реалізація:
- режим і його джерело визначаються в одному місці, в `analyze()`: `request.static ?? config.check.static ?? "behavior"`. src/cli.ts:238 більше не підставляє `"behavior"`, а src/flows.ts:388 не має власного типового значення;
- `StaticMode` і `STATIC_MODES` переїжджають із src/flows.ts (шар `check`) у src/config.ts (шар `base`), бо конфіг не може імпортувати з `check`;
- `init` і `draft map` поле не пишуть;
- LSP уже перечитує конфіг у кожному `analyze()` після `workspace/didChangeWatchedFiles` (src/lsp.ts:163), а кеш MCP уже ключується сирим `keylang.json` (src/mcp.ts:44-58). Треба лише перевірити, що зміна `check.static` підхоплюється без перезапуску.

У документації до поля пишемо «хук типового значення», бо слово «хук» уже означає й `keylang hook stop`.

Поза тікетом:
- показ чинного режиму в `check --format json` і SARIF;
- мовчазне ігнорування `feature --static`.

35 править той самий білий список полів (src/config.ts:147), але конфлікт лише злиттєвий.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** конфіг: нове необов'язкове поле `check.static`. Раніше воно давало `unknown field` і код 2.
- LSP, MCP, TUI, web, `feature` і `hook stop` починають враховувати поле. З `shape` їхні вердикти збігаються з `check`.
- Змінюється текст evidence хука в режимі `shape`: у stdout, у `--format json` і в SARIF. Рядка `(not followed with --static=shape)` більше немає.
- Змінюється `--help`.

Без поля семантика не змінюється.

- [ ] Фікстура HOOKS у tests/flows.test.ts (:247-287; хелпер `repo()` на :47 уже приймає `check`) з `check: { static: "shape" }`:
  - `check --format json` без прапорця дає ті самі `(criterion, verdict, file, line)`, що `check --static=shape` без поля;
  - evidence називає `keylang.json check.static` проти `--static`;
  - `check --strict` дає 1;
  - очікування `(not followed with --static=shape)` на :304-305 оновлено свідомо.
- [ ] З `check.static: "shape"` запуск `check --static=behavior` дає той самий stdout і код 0, що й запуск без поля й без прапорця.
- [x] `{ "static": "runtime" }` і `{ "static": 1 }` дають код 2 для `check` і `map`. stderr називає `keylang.json` і містить `` `check.static` must be "behavior" or "shape", got … ``. `--static=runtime` дає код 2 з нинішнім `unknown --static`.
- [ ] З `check.static: "shape"` `keylang feature <slug>` видає прогалину `static` і код 1. У tests/lsp.test.ts одна перевірка: pull-діагностики LSP мають `data.verdict: "unverified"` на кроці через хук.
- [x] `keylang --help` у рядку `--static` називає `check.static` і пріоритет «прапорець > конфіг > behavior». semantics.md §7 (:277, :283) і design §4.2 (:213, :228) описують поле й правило про типове значення. Тести `init` не змінилися.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено; `StaticMode` переїжджає в `base`), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/config.ts`, `src/analyze.ts`, `src/cli.ts`, `src/flows.ts`, `tests/flows.test.ts`, `tests/lsp.test.ts`, `docs/format.md`, `docs/design.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78, 3e2e444 (MCP/TUI/web/hook stop); src/config.ts `check.static`, `--help` називає пріоритет, format.md і design §4.2 описують поле; `check.static: "runtime"` — код 2 з `` `check.static` must be "behavior" or "shape"``.
