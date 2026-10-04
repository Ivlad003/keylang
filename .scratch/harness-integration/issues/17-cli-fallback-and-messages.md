# 17: CLI-запас без глобального `keylang` і три неточні повідомлення

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** тікет 11.

**What to build:**

1. **CLI-запас.** Керований блок `AGENTS.md` і skill кажуть «CLI when MCP is off: `keylang feature <slug> --format json` …». На чужому репо `keylang` немає в `PATH`; Codex (nest) спробував `npx keylang feature …` — без версії, у пісочниці без мережі: `npm error code EAI_AGAIN`, потім завис до переривання. Запас має називати ту саму закріплену команду, що MCP і хук: `npx -y keylang@<версія> feature <slug> --format json` (і для `check`, `spec-to-code`, `baseline`), а текст skill — лишатися ресурсом пакета (версія підставляється при записі або згадується один раз).
2. **K202 для `planned module external.<pkg>`** друкує місце `(?:1)`: `K202 planned module \`external.nodemailer\` is implemented (?:1); remove the declaration`. Для пакета показати імпортера (`imported by src/mail/mail.service.ts:2`) або не друкувати місце.
3. **`apply_diff` на `keylang/rules.baseline.md`**: «a generated file: it is written by `keylang map` only». Baseline пише `keylang baseline`; повідомлення має це казати (і що зміна правил іде в `rules.md`). Те саме для інших згенерованих файлів — назва команди, яка їх пише.

- [x] `agents` пише в `AGENTS.md` і skill закріплену команду запасу; `agents --check` ловить застарілу версію в ній
- [x] фікстура: K202 для external без `?:1`
- [x] `apply_diff` на baseline — повідомлення з `keylang baseline`; на `map/*.md` — з `keylang map`
- [x] `docs/tools.md` оновлено

Ключові файли: `src/harness.ts`, `resources/keylang-feature/SKILL.md`, `src/flows.ts`, `src/proposals.ts`, `docs/tools.md`

## Comments

- 2026-10-04 — зроблено.
  1. Запас CLI: керований блок `AGENTS.md` (`agentsBody(version)`) і skill називають `npx -y keylang@<версія> feature <slug> --format json`, `… check` (і `check --changed` у skill), `… spec-to-code <id> --print`, `… baseline` — та сама закріплена команда, що MCP і хук (`cliCommand` у `src/harness.ts`). Ресурс `resources/keylang-feature/SKILL.md` лишається текстом пакета з `keylang@<version>`; `pinSkill` підставляє версію при записі копій. Очікуваний текст містить версію, тож `agents --check` дає 1 для старої версії і в блоці, і в skill. Крок 4 блоку й skill теж більше не кажуть голий `keylang feature`/`keylang baseline`. Тест: `tests/cli.test.ts` «agents: MCP servers, skill copies…».
  2. K202/K201 для вузла без файла (пакет `external.<pkg>`): місце — перший за шляхом і рядком імпорт (`imported by src/domain/order.ts:1`), без імпорту — `in the code`; `?:1` більше не друкується. Тест: «planned module external.<pkg> is static ok only from the importing parent module».
  3. `apply_diff` (MCP, TUI, CLI — спільний `proposalProblem`): згенерований файл називає команду з його маркера `keylang:generated` — для baseline «written by `keylang baseline` only; propose rule changes in `keylang/rules.md`», для `map/*.md` і `map-explained/` — `keylang map`. Перевірку маркера перенесено після перевірки посилань, тож файл, що веде за межі каталогу специфікацій, як і раніше не читається. Тест: `tests/mcp.test.ts` «apply_diff only writes a pending proposal…».
- Припущення (не перевірено): `npx -y keylang@<версія>` без мережі спрацює лише тоді, коли npm уже має цю версію в кеші (наприклад, після запуску MCP). Закріплена версія прибирає розходження з MCP і хуком; окремого офлайн-запасу не додаю.
