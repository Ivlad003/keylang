# 16: Codex: MCP-інструменти keylang потребують апруву; `check --changed` у пісочниці

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** тікет 11 (nest × Codex, fastapi × Codex), codex-cli 0.155.1.

**What to build:**

1. **Апрув MCP.** У `codex exec` (approval policy `never`) кожен виклик MCP keylang відхиляється: «MCP tool call requires approval, but approval policy is never» — `validate_spec`, `scaffold` ×6, `apply_diff` (nest × Codex). Codex у fastapi MCP взагалі не викликав, а жив на CLI. Перевірено вручну: рядок `default_tools_approval_mode = "approve"` у `[mcp_servers.keylang]` проєктного `.codex/config.toml` робить `feature_status` доступним у `codex exec` (транскрипт `codexprobe-approve.jsonl`, див. 11). Через `-c mcp_servers.keylang.…` з командного рядка не працює («invalid transport»). `agents` має писати цей ключ (інструменти лише читають, а `apply_diff` пише тільки пропозицію; якщо для `apply_diff` потрібен окремий режим — перевірити ключ на рівні інструмента), `agents --check` — вимагати його.
2. **`check --changed` у пісочниці `workspace-write`:** `keylang: check --changed: git is not available (spawnSync git EPERM)`, хоча `git` у shell того ж агента працює. Відтворити (Codex sandbox, Linux), з'ясувати причину (`spawnSync` з оточенням/шляхом, що блокує landlock/seccomp?) і або виправити, або дати зрозуміле повідомлення з обхідним шляхом. Хук Stop поза пісочницею працював.

- [ ] `init --agents=codex` пише `default_tools_approval_mode = "approve"` у `[mcp_servers.keylang]`; наявні ключі зберігаються; `agents --check` ловить відсутність
- [ ] `docs/tools.md` (Codex) описує ключ і чому він потрібен у `codex exec`
- [ ] причина EPERM записана в Comments; виправлення або повідомлення з порадою

Ключові файли: `src/harness.ts`, `src/git-changes.ts`, `docs/tools.md`
