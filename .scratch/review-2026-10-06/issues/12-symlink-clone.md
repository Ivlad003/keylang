# 12: Видалення файлів харнеса йде за symlink-текою за межі репозиторію (через clone чужого репо)

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `cli`, верифікація: confirmed.

**Місце:** `src/harness.ts:643` (рецензент указав `src/harness.ts:686`)

## Що не так

commitAgents видаляє цілі `remove` через `rmSync(join(root, path))` без `writeProblem`/`landing`: agentsPlanProblems (рядок 643) перевіряє лише дії `write`. Якщо `.cursor`, `.claude`, `.codex` чи `.agents` у репозиторії — symlink на теку поза ним, keylang видаляє файли в цій зовнішній теці. `clone` завжди запускає `init --agents=none`, тож репозиторій зі свого коміту вирішує, що видалити в домашній теці користувача.

## Сценарій збою

Зловмисний репозиторій комітить `.cursor -> ../../../../../../.cursor`. Клон лягає в `~/.cache/keylang/repos/github.com/o/r`, тож посилання веде в `~/.cursor`. Так само `.claude -> …/.claude`. `keylang clone https://github.com/o/r` видаляє `~/.cursor/mcp.json`, якщо там лише сервер keylang (або `{"mcpServers":{}}`), і `~/.claude/skills/keylang-feature/SKILL.md`. Те саме дає `init/agents --agents=none` у будь-якому репо, де ці теки — посилання на спільні dotfiles. Документований контракт, що ціль через посилання за межі репозиторію — відмова, тут не працює.

## Як відтворити

scratchpad/review/cli/evil: git-репо з src/a.ts і закоміченими symlink `.cursor -> $S/outside/cur`, `.claude -> $S/outside/claude`. У outside/cur/mcp.json — `{"mcpServers":{"keylang":{...}}}`, також є outside/claude/skills/keylang-feature/SKILL.md. Запуск: `HOME=$S/home XDG_CACHE_HOME=$S/cache node bin/keylang.js clone ./evil`. Вивід: `.cursor/mcp.json: removed`, `.claude/skills/keylang-feature/SKILL.md: removed`, exit=1. Після цього `find outside -type f` показує, що обидва зовнішні файли зникли. Запис `.keylang/index.json` у тому самому запуску відмовлено як `leads out of the repository through a link`, тобто для записів захист є, а для видалень — ні.

Доказ верифікатора:

> I reproduced this at current HEAD with no network and with HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed at the scratch dir.
> 
> **Code path**
> - `src/cli.ts:518` `prepareClone` always runs `cmdInit(dir, { agents: "none" })`.
> - `src/harness.ts:242-273` (`planHarness` for `--agents=none`) plans `text: null` (remove) for `.cursor/mcp.json` when it holds only the keylang server or an empty `mcpServers`. It does the same for any existing `.agents/` or `.claude/skills/keylang-feature/SKILL.md`, whatever its content.
> - `src/harness.ts:643` `agentsPlanProblems` skips every target whose action is not `write`, so `writeProblem` (the "leads out of the repository through a link" check) never sees a removal.
> - `src/harness.ts:686` `commitAgents` then runs `rmSync(join(plan.root, target.path), { force: true })`. Path resolution follows the symlinked parent directory, so the file outside the repository is unlinked.
> 
> **Fixture 1 (absolute links)** in `scratchpad/verify/cli-0-0`:
> - Repo `evil` has a committed `src/a.ts`, plus `.cursor -> $S/outside/cur` and `.claude -> $S/outside/claude`.
> - `outside/cur/mcp.json` is `{"mcpServers":{"keylang":{...}}}`.
> - `outside/claude/skills/keylang-feature/SKILL.md` is user text ("USER DATA").
> 
> Command: `HOME=$S/home XDG_CACHE_HOME=$S/cache XDG_CONFIG_HOME=$S/config node /home/kosmodev/pet_project/keylang/bin/keylang.js clone ./evil`
> 
> Output:
> ```
> .../keylang.json: written ...
> .cursor/mcp.json: removed
> .claude/skills/keylang-feature/SKILL.md: removed
> exit=0
> ```
> Afterwards, `find outside -type f` shows only `outside/claude/keep.txt`. Both outside files are gone.
> 
> **Fixture 2 (the realistic attack)**
> - Repo `evil2` commits relative links `.cursor -> ../../../../../home/.cursor` and `.claude -> ../../../../../home/.claude`. These are resolved from the clone location `$S/cache/keylang/repos/local/evil2-<hash>`.
> - `$HOME/.cursor/mcp.json` is `{"mcpServers":{}}` and `$HOME/.claude/skills/keylang-feature/SKILL.md` is "my global skill".
> 
> Running `keylang clone ./evil2` printed the same two `removed` lines with `exit=0`. Afterwards `find home -type f` is empty: the user's global Cursor MCP config and global Claude skill were deleted.
> 
> **Corrections to the claim**
> - The exit code was 0 in both runs, not 1. No `.keylang/index.json` refusal appeared in my runs. The deletion itself reproduces exactly as described.
> 
> **Contract**
> - `docs/cli.md:145` (agents/init): "ціль через посилання за межі репозиторію — теж відмова до першого запису". `src/safe-writ …

## Що зробити

- В agentsPlanProblems перевіряти й дії `remove`: landing(join(root, path)) має лишатися в realpath(root), інакше `leads out of the repository through a link`. У commitAgents видаляти лише перевірену ціль, щоб `clone`/`init --agents=none` ніколи не видаляли файли за symlink-текою.
- У agentsPlanProblems перевіряти й дії `remove`: landing(dirname(join(root, path))) має лишатися в межах realpath(root) (відмова «leads out of the repository through a link» до першого кроку), а в commitAgents видаляти лише за перевіреним шляхом.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/harness.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійний тест `tests/cli-harness.test.ts` «agents: a removal through a harness directory linked out of the repository is refused…»: `.cursor` і `.claude` — абсолютні symlink на теку поза репозиторієм (`mcp.json` лише з сервером keylang, `skills/keylang-feature/SKILL.md` з текстом користувача); `init --agents=none`, `agents --agents=none` і `clone file://<локальний git-репо з закоміченими посиланнями>`. На поточному коді падав: stdout містив `.cursor/mcp.json: removed`, `.claude/skills/keylang-feature/SKILL.md: removed`, і файли за посиланнями зникали.
- 2026-10-07: Виправлення. У `src/safe-write.ts` виділено `targetProblem(root, path, {under})` — перевірка місця (плоский відносний шлях, петля посилань, landing у межах `realpath(root)` / `under`), спільна для запису й видалення; `writeProblem` її викликає. `agentsPlanProblems` тепер перевіряє і цілі `remove` через `targetProblem` (відмова `leads out of the repository through a link` до першого кроку, код 1, як для записів), а `commitAgents` робить ту саму перевірку перед `rmSync` — видаляється лише перевірений запис. Код виходу `clone` у цьому сценарії — 1 (init дійшов до стадії agents, яка відмовила), а не 0.
- 2026-10-07: Контракт: `docs/cli.md` (§ агенти) — речення про відмову через посилання тепер явно охоплює й видалення; `llm.txt` не змінено (протокол запису там не описаний). `docs/review-2026-10-06.md` п. 11 позначено ✔ (тікет 12 відповідає п. 11 рев'ю). Перевірки: `node --test tests/cli-harness.test.ts tests/safe-write.test.ts tests/review-harness.test.ts` — 22/22, `npm run typecheck` — ок, `node bin/keylang.js check` — 0 fail.
