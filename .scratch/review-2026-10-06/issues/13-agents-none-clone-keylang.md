# 13: `--agents=none` (і кожен `clone`) переписує й видаляє файли харнеса, де немає нічого від keylang; коментарі `.codex/config.toml` губляться

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `cli`, верифікація: confirmed.

**Місце:** `src/harness.ts:243` (рецензент указав `src/harness.ts:243`)

## Що не так

Для `--agents=none` `want()` бере кожен наявний файл харнеса, і merge серіалізує його заново. mergeCodexToml (рядок 381) робить parse→stringify усього TOML, тому всі коментарі пропадають. Якщо після цього об'єкт порожній, файл видаляється. Це суперечить cli.md: «`--agents=none` не пише файлів харнеса поза каталогом специфікацій» і «інші сервери й поля лишаються». Коментарі губляться і в звичайному `init`/`agents` (auto), коли є `.codex/`.

## Сценарій збою

У репо користувача `.codex/config.toml` містить лише закоментовані налаштування, а `.claude/settings.json` — `{}`. `keylang init --agents=none` або `keylang agents --agents=none` видаляє обидва файли. TOML з даними й коментарями переписується без коментарів, JSON — з іншим форматуванням. Звичайний `keylang init` у репо з `.codex/` теж викидає з config.toml усі коментарі користувача.

## Як відтворити

t5: `.codex/config.toml` = три рядки `# …`. `node bin/keylang.js init --agents=none` дає `.codex/config.toml: removed`, exit=0, `ls .codex` порожній. t6: `.claude/settings.json`=`{}`, `.cursor/mcp.json`=`{"mcpServers":{}}`. `agents --agents=none` дає `.cursor/mcp.json: removed`, `.claude/settings.json: removed`. t3: config.toml `# keep me\nmodel = "gpt-5" # note` після `init --agents=none` стає `model = "gpt-5"`, а settings.json з 4 пробілами переформатовано. t1: звичайний `init` (auto, є .codex/) прибрав обидва коментарі з config.toml.

Доказ верифікатора:

> Code at current HEAD: src/harness.ts:243 `want()` returns true for `--agents=none` whenever the file merely exists (`input.files.get(path) != null`). The file then goes through mergeMcpJson/mergeSettings/mergeHooksFile, which do JSON.parse→JSON.stringify(…,2) and return `{text:null}` (delete) when the object is empty (finishJson), or through mergeCodexToml (lines 368-388), which does smol-toml parse→stringify of the whole file and returns null when `data` is empty. planAgents (line ~601) compares the new text with the original bytes, so any difference becomes action write/remove, and commitAgents calls rmSync or writeAtomic. Nothing checks whether a `keylang` key was there to begin with.
> 
> Reproduced with HOME/XDG_* pointed at scratch, in .../scratchpad/verify/cli-1-0:
> - t5: `.codex/config.toml` = 3 lines `# …`, `node bin/keylang.js init --agents=none` printed `.codex/config.toml: removed`, exit=0, and `ls .codex` was empty.
> - t6: after init, `.claude/settings.json`=`{}` and `.cursor/mcp.json`=`{"mcpServers":{}}`. `agents --agents=none` printed `.cursor/mcp.json: removed` and `.claude/settings.json: removed`, exit=0, and both dirs ended up empty.
> - t3: config.toml `# keep me\nmodel = "gpt-5" # note` and settings.json indented with 4 spaces. `init --agents=none` printed `.codex/config.toml: written` and `.claude/settings.json: written`. config.toml became just `model = "gpt-5"` with both comments gone, and settings.json was reindented to 2 spaces.
> - t1: plain `init` (auto, `.codex/` exists) on `# my codex settings\nmodel = "gpt-5" # pinned model` gave `model = "gpt-5"` + `[mcp_servers.keylang]…`, with all comments gone.
> - clone: `node bin/keylang.js clone <local git repo with .codex/config.toml containing only a comment>` printed `.codex/config.toml: removed` inside the cache clone. Lower impact there, because only the cache's working tree is touched, not the source repo.
> 
> Contract: llm.txt:46 says "`--agents=none` writes no harness files". docs/cli.md:141 says "`--agents=none` не пише файлів харнеса поза каталогом специфікацій". cli.md:145 says only the `keylang` key is replaced and "інші сервери й поля лишаються". The course docs say `--agents=none` "removes that install". So stripping keylang's own entries is intended (tests/review-harness.test.ts:178 checks only that). Deleting or rewriting files that contain no keylang entry is not intended. The issue is not listed in docs/review-2026-10-05.md, and it is not a regression of it.
> 
> Severity: P1 (data loss) …

## Що зробити

- Для `--agents=none` чіпати файл лише тоді, коли в ньому справді є ключ/хук/deny keylang (інакше — keep з оригінальними байтами). Видаляти файл лише тоді, коли в ньому не лишилося нічого, крім записів keylang. Для `.codex/config.toml` редагувати тільки таблицю `[mcp_servers.keylang]` текстово, не робити parse→stringify всього файлу, щоб коментарі й форматування лишалися.
- Для --agents=none чіпати файл лише коли в ньому є запис keylang і не видаляти файли, яких keylang не створював; у .codex/config.toml правити тільки таблицю [mcp_servers.keylang] текстовим сплайсом, а решту лишати байт у байт.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/harness.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійний тест `tests/cli-harness.test.ts` «agents: --agents=none leaves a harness file without a keylang entry byte for byte…»: `.codex/config.toml` із самих коментарів, `.claude/settings.json` = `{}`, `.cursor/mcp.json` = `{"mcpServers":{}}`, `.mcp.json` і `.codex/hooks.json` із чужими даними й 4-пробільним відступом, `opencode.json` без завершального переводу рядка, порожній `AGENTS.md` — `init --agents=none` і `agents --agents=none` мають лишити кожен байт у байт і не називати файл кроком; другий блок — `init --agents=claude,codex,cursor` на `config.toml` з коментарями і чужою `[mcp_servers.other]`, далі `agents --agents=none` повертає файл до початкових байтів, а `.mcp.json`, `.cursor/mcp.json`, `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`, skill (де було лише keylang'ове) зникають. На поточному коді падав одразу: `.codex/config.toml` з коментарів було видалено (ENOENT).
- 2026-10-07: Виправлення в `src/harness.ts`. Знімання (`version === null`) тепер ні-оп для файла без запису keylang: `mergeJsonKey` — немає `<key>.keylang`; `mergeSettings` — `holdsKeylangSettings` (deny-правило для `dir` чи типового `keylang/`, або наш хук Stop); `mergeHooksFile` — `holdsOurHook`; `mergeMarked(existing, null)` без маркерів повертає `existing` (порожній `AGENTS.md` більше не видаляється). `mergeCodexToml` переписано на текстовий сплайс: файл розбирається smol-toml (невалідний TOML — помилка, як і було; власні ключі запису беруться з розбору), але замінюються/прибираються/дописуються лише рядки `[mcp_servers.keylang]` до наступного заголовка (підтаблиці `[mcp_servers.keylang.*]` входять), результат перевіряється зворотним розбором (`codexEntryIs`); запис, записаний інакше (inline/dotted), або сплайс, що не розбирається, — fallback на повну серіалізацію, як раніше. Видалення файла — лише коли після зняття лишився порожній текст.
- 2026-10-07: Припущення: файл із самих коментарів після зняття таблиці keylang лишається (коментарі — «щось», файл не видаляється); `.codex/config.toml` із записом keylang у формі inline-таблиці й далі втрачає коментарі (задокументовано як виняток). Контракт: `docs/cli.md` (§ агенти: що саме прибирає `--agents=none`, коли файл видаляється, текстовий сплайс TOML), `llm.txt:46`. `docs/review-2026-10-06.md` п. 12 позначено ✔ (тікет 13 відповідає п. 12 рев'ю). Перевірки: `node --test tests/cli-harness.test.ts tests/review-harness.test.ts tests/clone.test.ts tests/operations.test.ts` — 28/28, `npm run typecheck` — ок, `node bin/keylang.js check` — 0 fail.
