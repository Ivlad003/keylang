# 03: Skill `keylang-feature` і deny на правила

**Джерело:** spec Q8, Q15, Q17; ADR 0005 п. 5

**What to build:** `init`/`agents` пише `.agents/skills/keylang-feature/SKILL.md` (стандарт agentskills.io) і ідентичну копію в `.claude/skills/keylang-feature/SKILL.md` (копія, не symlink). Skill описує цикл: написати `keylang/features/<slug>.md` → `validate_spec` → `scaffold` → реалізувати → `feature_status`/`check` → прибрати `planned` за K202. Зміни `keylang/rules*.md` — лише через `apply_diff`. Текст skill — у пакеті як ресурс, а не рядок у коді. Для Claude у `.claude/settings.json` додається `permissions.deny` на `Edit`/`Write` для `keylang/rules.md` і `keylang/rules.baseline.md`; наявні поля зберігаються. Перевірити й задокументувати, чи мають Codex, Cursor, opencode аналог deny на рівні проєкту; де немає — лише інструкція.

**Blocked by:** 01, 06

**Status:** resolved

**Type:** docs

**Verify:** `npm run typecheck` · `npm test`

- [x] обидві копії skill байт у байт однакові; `agents --check` бачить розходження
- [x] наявний `.claude/settings.json` з власними дозволами й хуками — зберігається
- [x] skill проходить валідацію frontmatter agentskills.io (name, description)

Ключові файли: модуль адаптерів, ресурс skill у пакеті (`files` у `package.json`)

## Comments

- 2026-10-01 — аудит під shiftwork: частково реалізовано (88a9ac1; `resources/keylang-feature/SKILL.md`, `src/harness.ts`; tests/cli.test.ts «agents: MCP servers, skill copies, Claude deny and a stale --check…»): обидві копії skill, frontmatter `name`/`description`, `--check` бачить розходження копії, `permissions.deny` для Claude зі збереженням наявних дозволів і хуків. Лишилось: перевірити й задокументувати (у `docs/tools.md#agents` або `docs/design.md` §7.6), чи мають Codex, Cursor, opencode аналог deny на рівні проєкту; зараз ADR 0005 п. 5 каже лише загально «там, де харнес уміє deny», а для трьох харнесів є тільки інструкція в `AGENTS.md`.

### Notes

2026-10-02 — перевірено (офіційна документація) і задокументовано, чи мають Codex, Cursor, opencode аналог проєктного deny на `keylang/rules*.md`:

- **Claude Code** — `.claude/settings.json`, `permissions.deny` з `Edit`/`Write` для обох файлів; це єдиний харнес, куди `agents` уже пише такий deny.
- **Codex** — у `.codex/config.toml` є beta-профілі дозволів (`[permissions.<name>.filesystem]` зі значенням `read`/`write`/`deny`), але вибирає їх `default_permissions` і їх не можна поєднувати з `sandbox_mode`/`[sandbox_workspace_write]`; keylang їх не нав'язує.
- **Cursor** — проєктний `permissions.deny` з `Write(pathOrGlob)` існує лише в CLI (`<project>/.cursor/cli.json`), не в агенті IDE.
- **opencode** — `opencode.json` уміє шляхові `deny` у `permission.edit`, але keylang пише там лише власний ключ `mcp.keylang` і не чіпає спільний `permission`.
- Отже, для трьох харнесів захист — інструкція в `AGENTS.md` і skill `keylang-feature`.

Зміни (лише документація): новий абзац «Deny на `keylang/rules*.md`» у `docs/design.md` §7.6 (замінив загальну фразу про deny) і уточнення в розділі «Агенти, baseline і фічі» `docs/tools.md`.

Verify: `npm run typecheck` — ok; `npm test` — 585 pass, 0 fail, 1 skipped.

### Shift 1 — opencode opencode-go/deepseek-v4.1-flash (low)
- Ended: stop
- Usage: 2207660 in / 20451 out tokens, $0.0994, 33 turns
- Time: 17m 28s
- Verify: passed
- Outcome: verify passed; review before landing

### Review — grok grok-4.7 (high)
- Verdict: accept — Skill, Claude deny і задокументоване рішення лишити Codex, Cursor та opencode на інструкції відповідають критеріям тікета й коду.
- Time: 17m 5s
- Verify: passed
- Findings:

> Перегляну тікет, специфікацію та незмерджений diff, потім прожену verify-гейт.
> Диф лише в документації. Звірю його з кодом адаптерів, skill і критеріями тікета.
> Приймаю. Незмерджений коміт `b0e73c5` закриває залишок тікета: у `docs/design.md` §7.6 і в розділі агентів `docs/tools.md` записано, де є проєктний deny на `keylang/rules.md` і `keylang/rules.baseline.md`.
> 
> Критерії вже виконані в коді й підтверджені тестом `agents: MCP servers, skill copies, Claude deny and a stale --check that writes nothing`:
> 
> - Обидві копії `resources/keylang-feature/SKILL.md` пишуться одним текстом, не symlink; `agents --check` бачить розходження.
> - Frontmatter має `name: keylang-feature` і `description`. Цикл skill: файл фічі, `validate_spec`, `scaffold`, реалізація, `feature_status` / `check`, зняття `planned` за K202. Правила змінюються лише через `apply_diff`.
> - Для Claude `mergeDeny` додає `Edit`/`Write` на обидва файли правил і зберігає наявні `permissions` і `hooks`. Codex, Cursor і opencode цього запису не отримують: у конфігах keylang чіпає лише свій MCP-ключ. Захист там — інструкція в `AGENTS.md` і в skill. Документація збігається з `src/harness.ts`.
> 
> `npm run typecheck` пройшов. `npm test`: 586 тестів, 542 pass, 43 fail, 1 skipped. Усі 43 падіння — попередження Node `NO_COLOR` ігнорується через `FORCE_COLOR` у stderr цього середовища. Без цього рядка очікування збігаються з прогоном воркера (585 pass, 1 skip). Робоче дерево чисте.

- Landed: merge conflict in the target; branch shiftwork/harness-integration-03 kept (Command failed: git merge -q --no-ff --no-edit -m shiftwork: merge harness-integration/03 Skill `keylang-feature` і deny на правила shiftwork/harness-integration-03)

### Manual land — 2026-10-02
- Ревʼю: accept. Конфлікт злиття зник після очищення основного checkout. Landed: fast-forward `master` → `b0e73c5`.
