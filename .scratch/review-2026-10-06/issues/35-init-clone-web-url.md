# 35: `init`, `clone` і `web <url>` падають з кодом 2 на `opencode.jsonc` з коментарями

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `cli`, верифікація: confirmed.

**Місце:** `src/harness.ts:492` (рецензент указав `src/harness.ts:492`)

## Що не так

opencode.jsonc є серед HARNESS_PATHS і в detectHarnesses, але parseObject читає його через `JSON.parse`. Коментар чи кінцева кома (валідний JSONC) дають `invalid JSON`, і весь план відмовляє. У режимі `--agents=none`, з яким працює `clone`, план розбирає кожен чужий файл харнеса. Тому `clone`/`web <url>` не можуть відкрити такий репозиторій: init повертає 2, карта не будується, web не стартує.

## Сценарій збою

У репо є `opencode.jsonc` з рядком `// opencode config`. Звичайний `keylang init` (auto) дає `keylang: opencode.jsonc: invalid JSON (…)`, exit 2, не записано нічого, навіть keylang.json. `keylang clone <url цього репо>` клонує, але після цього так само завершується з кодом 2 без карти.

## Як відтворити

t2: opencode.jsonc з коментарем і кінцевою комою. `keylang init` друкує `keylang: opencode.jsonc: invalid JSON (Expected property name or '}' in JSON at position 4 (line 2 column 3))`, exit=2, ls показує лише .git, opencode.jsonc, src. Після коміту `keylang clone ./t2` друкує `…/local/t2-0cb1690a: cloned from …`, потім ту саму помилку, exit=2.

Доказ верифікатора:

> Я відтворив це сам на поточному HEAD. Фікстура лежить у scratchpad/verify/cli-4-0, а HOME, XDG_CACHE_HOME і XDG_CONFIG_HOME вказують на scratch.
> 
> 1) Підготовка t2: `git init`, файл `opencode.jsonc` = `{\n  // opencode config\n  "$schema": "https://opencode.ai/config.json",\n  "model": "x",\n}\n`, `src/index.ts`, коміт. Команда: `node …/bin/keylang.js init`. Результат: `keylang: opencode.jsonc: invalid JSON (Expected property name or '}' in JSON at position 4 (line 2 column 3))`, exit=2. `ls -A` показує лише `.git opencode.jsonc src`: не записано нічого, навіть keylang.json.
> 
> 2) Команда: `node …/bin/keylang.js clone ./t2`. Результат: `…/home/.cache/keylang/repos/local/t2-867dfdb1: cloned from …/t2`, потім та сама помилка `opencode.jsonc: invalid JSON (…)`, exit=2. У клоні є лише `.git .keylang opencode.jsonc src`, карти й keylang.json немає.
> 
> 3) У t3 файл містить тільки коментар, без кінцевої коми. `init --agents=none` падає з exit=2 і тим самим повідомленням. Контрольний `init --agents=claude` на тому ж дереві дає exit=0, бо opencode не вибрано і файл не розбирається.
> 
> Шлях у коді такий. `src/harness.ts:23` і `:115` визнають `opencode.jsonc` харнесом. `opencodeFile` (`:505-508`) вибирає його. У `planHarness` (`:265-269`) його розбирають і для вибраного opencode, і для `--agents=none` (`!instructions && files.get(path) != null`). Далі `mergeOpencode` → `mergeJsonKey` → `parseObject` (`:489-498`), а там стоїть звичайний `JSON.parse`. Помилка йде як `plan.error`, `runAgents` (`operations/generate.ts:287`) повертає 2, і init зупиняється на preflight (`cli.ts:925`). `prepareClone` (`cli.ts:518`) викликає `cmdInit(dir, {agents:"none"})` і при коді, відмінному від 0, повертає `root:null`. Тому `web <url>` (`cli.ts:377-378`) теж не стартує, а `clone` закінчується з кодом 2.
> 
> Чому це не задокументована поведінка. `docs/cli.md:141` і `llm.txt:40` прямо називають `opencode.jsonc` підтримуваним файлом харнеса. Рядок «невалідний JSON/TOML — код 2» стосується зіпсованого файла, а коментар і кінцева кома — це валідний JSONC. До того ж у кодовій базі вже є `parseJsoncStrict` (`src/imports.ts:552`), який використовується для `package.json`. Тестів на `opencode.jsonc` немає. У `docs/review-2026-10-05.md` цього пункту немає, тобто це новий дефект, а не відомий відкритий пункт.
> 
> Окремо, поруч і важливо для виправлення. У t4 файл `opencode.json` з відступом у 4 пробіли без ключа keylang після `init --agents=none` (так працює clone) переписано з відступом у 2 пробіли. Режим non …

## Що зробити

- Розбирати opencode.jsonc через parseJsoncStrict (коментарі й кінцеві коми), а в режимі --agents=none не переписувати файл, у якому немає ключа mcp.keylang, щоб не втратити коментарі й форматування.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/harness.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійний тест `tests/cli-harness.test.ts` («init on a repository with opencode.jsonc…»): `opencode.jsonc` з коментарем і кінцевою комою — `init --agents=none` (шлях `clone`/`web <url>`) має дати 0 і лишити файл байт у байт, `init` (auto) — дописати `mcp.keylang`; на старому коді exit 2 `invalid JSON`. Виправлення: `parseObject(existing, jsonc)` розбирає через `parseJsoncStrict` (вже є в `src/imports.ts`), `mergeJsonKey`/`mergeOpencode` передають прапорець, `planHarness` ставить його для `opencode.jsonc`. Файл без запису keylang у `--agents=none` і раніше не переписувався (`mergeJsonKey` повертає `existing`); перезапис із ключем — JSON без коментарів, задокументовано в `docs/cli.md`. Зіпсований JSONC — і далі код 2, нічого не записано (теж у тесті). `node --test tests/cli-harness.test.ts`: 12/12; typecheck чистий; `keylang check` 0 fail.
