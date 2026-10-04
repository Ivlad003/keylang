# 16: Codex: MCP-інструменти keylang потребують апруву; `check --changed` у пісочниці

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** тікет 11 (nest × Codex, fastapi × Codex), codex-cli 0.155.1.

**What to build:**

1. **Апрув MCP.** У `codex exec` (approval policy `never`) кожен виклик MCP keylang відхиляється: «MCP tool call requires approval, but approval policy is never» — `validate_spec`, `scaffold` ×6, `apply_diff` (nest × Codex). Codex у fastapi MCP взагалі не викликав, а жив на CLI. Перевірено вручну: рядок `default_tools_approval_mode = "approve"` у `[mcp_servers.keylang]` проєктного `.codex/config.toml` робить `feature_status` доступним у `codex exec` (транскрипт `codexprobe-approve.jsonl`, див. 11). Через `-c mcp_servers.keylang.…` з командного рядка не працює («invalid transport»). `agents` має писати цей ключ (інструменти лише читають, а `apply_diff` пише тільки пропозицію; якщо для `apply_diff` потрібен окремий режим — перевірити ключ на рівні інструмента), `agents --check` — вимагати його.
2. **`check --changed` у пісочниці `workspace-write`:** `keylang: check --changed: git is not available (spawnSync git EPERM)`, хоча `git` у shell того ж агента працює. Відтворити (Codex sandbox, Linux), з'ясувати причину (`spawnSync` з оточенням/шляхом, що блокує landlock/seccomp?) і або виправити, або дати зрозуміле повідомлення з обхідним шляхом. Хук Stop поза пісочницею працював.

- [x] `init --agents=codex` пише `default_tools_approval_mode = "approve"` у `[mcp_servers.keylang]`; наявні ключі зберігаються; `agents --check` ловить відсутність
- [x] `docs/tools.md` (Codex) описує ключ і чому він потрібен у `codex exec`
- [x] причина EPERM записана в Comments; виправлення або повідомлення з порадою

Ключові файли: `src/harness.ts`, `src/git-changes.ts`, `docs/tools.md`

## Comments

- 2026-10-04 — зроблено. `mergeCodexToml` (`src/harness.ts`) пише в `[mcp_servers.keylang]` `command`, `args` і `default_tools_approval_mode = "approve"`; інші ключі цієї таблиці (`startup_timeout_sec`, `tools.<name>.approval_mode`) і решта файла лишаються. Очікуваний текст містить ключ, тож `agents --check` дає 1 (`.codex/config.toml: stale`), коли його немає. Ключ і значення `approve` звірено з рядками бінарника `codex-cli 0.155.1` (`default_tools_approval_mode`, `approval_mode`, `approve`) і dogfood-транскриптом 11. Окремого режиму для `apply_diff` не ставлю: він пише лише пропозицію в `.keylang/proposals/`. Тест: `tests/cli.test.ts` «agents: Codex MCP tools run in `codex exec` without a prompt…».
- Припущення: свої ключі людини в `[mcp_servers.keylang]` тепер зберігаються (раніше таблицю замінювали цілком); змінене людиною значення `default_tools_approval_mode` keylang повертає до `approve`, бо ключ — частина керованого запису. Для JSON-харнесів ключ `keylang` і далі замінюється цілком.
- Причина EPERM (перевірено, Linux, codex-cli 0.155.1): `codex sandbox -c sandbox_mode=workspace-write -- node bin/keylang.js check --changed` відтворює збій. `strace` у пісочниці: libuv робить stdio-канал stdin для `spawnSync` через `socketpair(AF_UNIX)`, а потім закриває його `shutdown(fd, SHUT_WR)` = `-1 EPERM` — seccomp-фільтр пісочниці забороняє `shutdown`. Тому `spawnSync` повертає `error: EPERM`, хоча git відпрацював (статус 0, stdout повний), а git, що читає stdin (`hash-object --stdin` у репозиторії без комітів), не отримує EOF і висить. У shell git працює, бо оболонка не закриває stdin через `shutdown`. Виправлення: `src/git-changes.ts` і `src/git-hook.ts` запускають git з `stdio: ["ignore", "pipe", "pipe"]` (stdin — нульовий пристрій; порожнє дерево для unborn `HEAD` — `hash-object -t tree --stdin` з нульового пристрою, тож працює й для SHA-256-репозиторіїв). У пісочниці після зміни `check --changed` дає K102 і код 1; до зміни — `git is not available (spawnSync git EPERM)` (код 2), а без комітів — зависання. Якщо пісочниця все ж забороняє запуск git (`EPERM`/`EACCES`), повідомлення додає пораду: запустити поза пісочницею або повний `keylang check`. Регресійний тест без Codex: `tests/cli.test.ts` «check --changed never hands git a piped stdin…» — `git`-обгортка першою в `PATH` відмовляє, коли stdin — канал чи сокет.
