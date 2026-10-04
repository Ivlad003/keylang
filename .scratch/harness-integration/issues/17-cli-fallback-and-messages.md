# 17: CLI-запас без глобального `keylang` і три неточні повідомлення

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** тікет 11.

**What to build:**

1. **CLI-запас.** Керований блок `AGENTS.md` і skill кажуть «CLI when MCP is off: `keylang feature <slug> --format json` …». На чужому репо `keylang` немає в `PATH`; Codex (nest) спробував `npx keylang feature …` — без версії, у пісочниці без мережі: `npm error code EAI_AGAIN`, потім завис до переривання. Запас має називати ту саму закріплену команду, що MCP і хук: `npx -y keylang@<версія> feature <slug> --format json` (і для `check`, `spec-to-code`, `baseline`), а текст skill — лишатися ресурсом пакета (версія підставляється при записі або згадується один раз).
2. **K202 для `planned module external.<pkg>`** друкує місце `(?:1)`: `K202 planned module \`external.nodemailer\` is implemented (?:1); remove the declaration`. Для пакета показати імпортера (`imported by src/mail/mail.service.ts:2`) або не друкувати місце.
3. **`apply_diff` на `keylang/rules.baseline.md`**: «a generated file: it is written by `keylang map` only». Baseline пише `keylang baseline`; повідомлення має це казати (і що зміна правил іде в `rules.md`). Те саме для інших згенерованих файлів — назва команди, яка їх пише.

- [ ] `agents` пише в `AGENTS.md` і skill закріплену команду запасу; `agents --check` ловить застарілу версію в ній
- [ ] фікстура: K202 для external без `?:1`
- [ ] `apply_diff` на baseline — повідомлення з `keylang baseline`; на `map/*.md` — з `keylang map`
- [ ] `docs/tools.md` оновлено

Ключові файли: `src/harness.ts`, `resources/keylang-feature/SKILL.md`, `src/flows.ts`, `src/proposals.ts`, `docs/tools.md`
