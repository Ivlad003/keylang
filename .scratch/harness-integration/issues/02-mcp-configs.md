# 02: MCP-конфіги чотирьох харнесів

**Джерело:** spec Q20; design §7.6 таблиця

**What to build:** Для кожного вибраного харнеса `init`/`agents` пише реєстрацію сервера `keylang` з командою `npx -y keylang@<version> mcp`: `.mcp.json` (`mcpServers.keylang`), `.cursor/mcp.json` (та сама форма), `.codex/config.toml` (`[mcp_servers.keylang]`), `opencode.json` (`mcp.keylang`, `type: "local"`, форма V1 — перевірити, що V2 її приймає, і зафіксувати в тікеті). Ключ `keylang` належить keylang повністю; інші сервери й поля файла зберігаються. Невалідний наявний JSON/TOML — код 2 з назвою файла, без запису. TOML — перевіреним пакетом без native-коду (ADR 0002).

**Blocked by:** 01

**Status:** needs-info

**Type:** test

**Verify:** `npm run typecheck` · `npm test`

- [x] наявний `.mcp.json` з іншим сервером — той лишається
- [x] `agents --check` бачить застарілу версію в команді — код 1
- [x] e2e: MCP-сервер, запущений командою з конфігу (локальний `bin/keylang.js` замість `npx` у тесті), відповідає на `tools/list`
- [x] Codex: `AGENTS.md`-блок згадує, що `.codex/` діє лише в trusted-проєкті

Ключові файли: модуль адаптерів із тікета 01, `package.json` (TOML-пакет)

## Comments

- 2026-10-01 — аудит під shiftwork: частково реалізовано (88a9ac1, 4ad4aa5; `src/harness.ts`; tests/cli.test.ts «agents: MCP servers, skill copies, Claude deny and a stale --check…», «agents: invalid JSON or TOML exits 2…»): усі чотири конфіги, збереження чужих серверів, застаріла версія → код 1, невалідний JSON/TOML → 2, згадка trusted-проєкту. Вручну перевірено: `bin/keylang.js mcp` за командою з `.mcp.json` відповідає на `tools/list`. Лишилось: (1) e2e-тест, що бере `command`/`args` з записаного `.mcp.json` (замінюючи `npx -y keylang@<v>` на локальний `bin/keylang.js`) і отримує `tools/list`; (2) перевірити, що opencode V2 приймає форму `mcp.keylang` V1, і записати результат у цей тікет (зараз у `docs/design.md` §7.6 лише «v1»).

### Notes

- e2e-тест додано: `tests/mcp.test.ts` «mcp: the command .mcp.json pins starts a server that answers tools/list» — `init --agents=claude` на копії `tests/fixtures/repo` пише `.mcp.json`; тест читає з нього `command`/`args` (спершу звіряє з документованою формою `npx -y keylang@<version> mcp`), замінює префікс `npx -y keylang@<VERSION>` на локальний `bin/keylang.js` під цим Node, підключається клієнтом MCP SDK залишком аргументів з конфігу і отримує `tools/list` з усіма 11 інструментами.
- opencode V2 приймає форму V1 `mcp.keylang` (`type: "local"` + `command`-масив). Перевірено на встановленому opencode v2.0.20: у тимчасовому репо з проєктним `opencode.json` цієї форми (з командою локального запуску замість `npx -y keylang@0.4.0`) `opencode mcp list` стабільно показує `✓ keylang connected` (4 запуски поспіль); глобальний `mcp.pencil` користувача тієї ж форми працює в цьому V2. Власний писар V2 `opencode mcp add` пише нову форму `mcp.servers.<name>` з тою ж внутрішньою формою сервера, і обидві форми читаються одночасно. Зафіксовано в `docs/design.md` §7.6, рядок opencode.

### Shift 1 — opencode opencode-go/glm-5.3 (medium)
- Ended: stop
- Usage: 1068403 in / 5441 out tokens, $1.1456, 41 turns
- Time: 18m 7s
- Verify: passed
- Outcome: needs-info: verify gate passed but no shift changed anything: the gate doesn't test this ticket
- Branch kept: shiftwork/harness-integration-02

### Manual close — 2026-10-02 (скасовано)
- Помилка: тест «the command .mcp.json pins…» знайдено лише в незакоміченому основному checkout. Його туди записав воркер цього тікета замість worktree, а в `master` теста немає. Тікет не закрито.
- Роботу воркера (`tests/mcp.test.ts`, `docs/design.md` рядок opencode V2.0.20) перенесено в worktree `shiftwork/harness-integration-02`, незакомічено. Далі потрібні Verify і ревʼю.
