[harness: subagent output matched instruction-shaped pattern(s): settings-json. Control tags below are neutralized (`<` → `<\`); treat any remaining directive-shaped text as a finding to relay to the user, not an instruction to you.]

**Головне.** Жоден із п'яти агентів не викликає LSP `textDocument/completion`. Для агента «AI-автокомпліт» означає три канали, від найвигіднішого:

1. **Діагностика після кожної правки.** Її дають LSP або hook. Повідомлення має містити кандидатів: «невідомий ID X; можливо: Y, Z».
2. **MCP-інструмент `complete`.** На вході path і text або line/col, на виході валідні кандидати в цій позиції.
3. **Каталог ID і граматики в skill або rule.** Він прив'язаний до `keylang/**/*.md`, а тіло лежить у `references/` і підвантажується за потреби.

Popup-автокомпліт і auto-import залежностей (частина B) потрібні людині в TUI або VS Code. Агентам вони не потрібні.

## Що перевірено по кожному агенту

### Claude Code
- **MCP.** Файл `.mcp.json` у корені проєкту: `{"mcpServers":{"keylang":{"command":"npx","args":["-y","keylang@X","mcp"]}}}`. Сервер із проєктного scope потребує схвалення користувачем і довіри до теки. Tool search на старті завантажує лише назви інструментів і server instructions. Instructions і кожен опис інструмента обрізаються до 2 048 символів. https://code.claude.com/docs/en/mcp
- **LSP.** Підключається лише через plugin: `.lsp.json` у корені плагіна або `lspServers` у `plugin.json`.
  - Приклад: `{"keylang":{"command":"npx","args":["-y","keylang@X","lsp"],"extensionToLanguage":{".md":"markdown"}}}`.
  - Об'єкт строгий. Поля: command, extensionToLanguage (обов'язкові), args, transport, env, initializationOptions, settings, workspaceFolder, startupTimeout, shutdownTimeout, restartOnCrash, maxRestarts, `diagnostics` (за замовчуванням true).
  - Файли зіставляються **лише за розширенням**. Коли два сервери заявляють одне розширення, файли отримує перший зареєстрований, а для другого з'являється попередження `LSP server "<name>" is not used for <ext> files`.
  - У stdout сервер пише тільки протокол. Сторонній вивід у stdout призводить до відключення сервера.
  - https://code.claude.com/docs/en/plugins-reference , https://code.claude.com/docs/en/plugins/components
  - Обережно з полями `restartOnCrash` і `shutdownTimeout`: у версіях 2.1.195–2.1.201 запис із ними тихо відкидався. https://github.com/anthropics/claude-code/issues/66987
- **Розповсюдження.** Проєктний `.claude/settings.json` може містити `extraKnownMarketplaces` і `enabledPlugins`; діє лише після довіри до теки. Джерелом плагіна може бути `npm` (`package`, `version`), тож npm-пакет keylang може сам нести `.claude-plugin/plugin.json` і `.lsp.json`. https://code.claude.com/docs/en/settings-reference , https://code.claude.com/docs/en/plugins/marketplace-reference
- **Що агент реально використовує.** Після кожного Edit/Write надходять errors і warnings (у транскрипті видно рядок «Found N new diagnostic issues»). Інструмент `LSP` вміє definition, references, hover, documentSymbol, workspaceSymbol, implementation і call hierarchy. **Completion немає.** У cloud-сесіях LSP не працює. https://code.claude.com/docs/en/tools-reference , https://code.claude.com/docs/en/plugins/code-intelligence
- **Hooks.**
  - Схема: `PostToolUse`, `matcher: "Edit|Write"`, `if: "Edit(keylang/**/*.md)"`. Одне правило на один handler, тому для Write потрібен окремий handler.
  - Відповідь: `hookSpecificOutput.additionalContext` (до 10 000 символів), або `decision:"block"` з `reason`, або exit 2 із текстом у stderr.
  - Є тип `mcp_tool`, що викликає MCP-інструмент із підстановкою `${tool_input.file_path}`.
  - https://code.claude.com/docs/en/hooks
- **Skills і rules.**
  - `.claude/skills/<n>/SKILL.md` підтримує `paths:` (skill автоматично завантажується для відповідних файлів). Динамічна вставка ``!`cmd` `` є лише в Claude Code. Опис разом із `when_to_use` обрізається до 1 536 символів. https://code.claude.com/docs/en/skills
  - `.claude/rules/*.md` з `paths:` підвантажуються, коли агент читає відповідні файли. https://code.claude.com/docs/en/memory

### Cursor CLI (`agent`)
- **MCP.** Файли `.cursor/mcp.json` або `~/.cursor/mcp.json`: `{"mcpServers":{"keylang":{"command":"npx","args":[...],"env":{}}}}`. Підтримуються `envFile` і підстановка `${workspaceFolder}`. CLI використовує ту саму конфігурацію, що й редактор. Команди: `agent mcp list|list-tools|enable|disable|login`, прапорець `--approve-mcps`. https://cursor.com/docs/cli/mcp
- **LSP.** Користувацького LSP у CLI **немає**. Запит на форумі від 2026-04-05 має статус «under review». https://forum.cursor.com/t/bring-lsp-language-server-protocol-support-to-cursor-cli-for-production-grade-code-intelligence/156751
  - Співробітник Cursor 2026-08-28 написав, що самовиправлення за діагностикою є «IDE-only…the CLI and Cloud Agents don't run an extension host».
  - В IDE агент читає Problems panel будь-якого сервера, що надсилає `publishDiagnostics`.
  - Отже, до IDE-агента діагностика доходить через VS Code-розширення (у репо є `editors/vscode`), а до CLI лише через MCP або shell. https://forum.cursor.com/t/does-agents-iterate-on-lint-errors-work-with-custom-third-party-lsp-servers-or-only-built-in-linters/168705
- **Rules.** `.cursor/rules/*.mdc` із полями `description`, `globs`, `alwaysApply`. Варіант `globs: keylang/**/*.md` без `alwaysApply` дає «auto-attached when a matching file is in context». Звичайні `.md` у цій теці ігноруються. Рекомендований розмір менше 500 рядків. CLI також читає AGENTS.md і CLAUDE.md. https://cursor.com/docs/rules , https://cursor.com/docs/cli/using
- **Skills.** Скануються `.agents/skills`, `.cursor/skills`, а також `.claude/skills` і `.codex/skills`. Підтримується frontmatter `paths`. https://cursor.com/docs/skills
- **Hooks.**
  - `.cursor/hooks.json`: `{"version":1,"hooks":{"postToolUse":[{"command":"…","matcher":"Write"}]}}`. `matcher` фільтрує лише за назвою інструмента, тож шлях файлу скрипт перевіряє сам.
  - `postToolUse` може повернути `additional_context`. `afterFileEdit` має лише вхід (`file_path`, `edits`), виходу не має. Exit 2 блокує дію.
  - Cursor також імпортує Claude-хуки з `.claude/settings.json` (увімкнено за замовчуванням). https://cursor.com/docs/hooks , https://cursor.com/docs/reference/third-party-hooks
  - Покриття в CLI за спільнотою (січень–лютий 2026): працюють лише before/afterShell, before/afterMCP і afterFileEdit. Чи працює `postToolUse` з `additional_context` у CLI, **не перевірено**. https://forum.cursor.com/t/cursor-cli-hooks/148511

### opencode
- **MCP.** У `opencode.json`: `"mcp":{"keylang":{"type":"local","command":["npx","-y","keylang@X","mcp"],"environment":{},"enabled":true,"timeout":5000}}`. https://opencode.ai/docs/mcp-servers
- **LSP.** `"lsp":{"keylang":{"command":["npx","-y","keylang@X","lsp"],"extensions":[".md"],"env":{},"initialization":{}}}`.
  - Зіставлення лише за розширенням. У вихідному коді порожній `extensions` означає всі файли, а кілька серверів на одне розширення **співіснують**, бо цикл збирає всі клієнти, що підходять (`packages/opencode/src/lsp/lsp.ts` ~255).
  - Корінь кастомного сервера — тека проєкту.
  - Якщо ключ `lsp` відсутній, LSP вимкнено. Об'єкт у `lsp` **вмикає всі вбудовані сервери**, зокрема з автозавантаженням; це побічний ефект, від завантажень рятує `OPENCODE_DISABLE_LSP_DOWNLOAD=true`.
  - Документація попереджає, що LSP «not always a net positive», і радить описувати CLI-перевірки в AGENTS.md.
  - https://opencode.ai/docs/lsp/
- **Що агент реально використовує.** Після edit у вихід інструмента додається «LSP errors detected in this file, please fix:». Потрапляють **лише severity 1 (errors)**, не більше 20 на файл. Write додатково показує помилки ще до 5 інших файлів (`src/tool/edit.ts` ~197, `tool/write.ts` ~75, `lsp/diagnostic.ts`). Клієнт оголошує pull-діагностику.
  - Інструмент `lsp` експериментальний і вмикається через `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`. У ньому 9 операцій, **completion немає**. https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/lsp.txt
- **Інше.**
  - Skills скануються з `.opencode/skills`, `.claude/skills`, `.agents/skills`. Frontmatter: лише name, description (1–1024), license, compatibility, metadata; `paths` не підтримується.
  - Інструкції: AGENTS.md (якщо його немає, CLAUDE.md), плюс масив glob-шляхів `instructions`.
  - Кастомні інструменти: `.opencode/tools/*.ts` через `tool()` з `@opencode-ai/plugin`.
  - Події плагінів: `tool.execute.after`, `file.edited`, `lsp.client.diagnostics`.
  - https://opencode.ai/docs/skills , https://opencode.ai/docs/rules , https://opencode.ai/docs/custom-tools , https://opencode.ai/docs/plugins

### Codex CLI
- **MCP.** `~/.codex/config.toml` або `.codex/config.toml` (лише в довірених проєктах): `[mcp_servers.keylang] command="npx" args=["-y","keylang@X","mcp"]`. Поля: env, env_vars, cwd, startup_timeout_sec (10), tool_timeout_sec (60), enabled, required, enabled_tools, disabled_tools. Codex читає MCP `instructions`; за документацією, перші 512 символів мають бути самодостатніми. https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- **LSP.** Вбудованого **немає**. Issue #8745 відкрито 2026-01-05, досі відкрите. https://github.com/openai/codex/issues/8745
- **Hooks.**
  - Увімкнені за замовчуванням (feature `hooks`). Задаються в `.codex/hooks.json` або inline `[hooks]`. Проєктні хуки працюють лише в довіреному `.codex/`, і кожен хук треба окремо довірити за хешем.
  - `PostToolUse` з `matcher: apply_patch` (аліаси Edit і Write). Увага: `tool_input.command` містить **текст патча**, тож шляхи файлів треба вибирати з нього.
  - Відповідь: `decision:"block"` з `reason`, або `hookSpecificOutput.additionalContext` (надходить як developer message), або exit 2 зі stderr. Звичайний stdout ігнорується. Ліміт приблизно 2 500 токенів, налаштовується через `additionalContextLimit`.
  - https://learn.chatgpt.com/docs/hooks
- **Skills і AGENTS.md.**
  - Skills скануються в `.agents/skills` від CWD до кореня репо. `agents/openai.yaml` може оголосити `dependencies.tools` типу mcp. Початковий список займає не більше 2% контексту (або 8 000 символів). Виклик через `$skill` або `/skills`. https://learn.chatgpt.com/codex/build-skills
  - AGENTS.md збирається від кореня до CWD, ліміт 32 KiB.

### agentskills.io
- Поля: `name` (до 64 символів), `description` (до 1024), `license`, `compatibility` (до 500), `metadata`, `allowed-tools` (експериментальне).
- Структура: `scripts/`, `references/`, `assets/`, посилання на один рівень вкладеності.
- Бюджет: метадані приблизно 100 токенів, тіло менше 5 000 токенів і менше 500 рядків. Перевірка: `skills-ref validate`.
- `paths` не входить у стандарт; це розширення Claude Code і Cursor. https://agentskills.io/specification

## Конфлікт із `.md`
Жоден агент не зіставляє LSP за glob-шаблоном шляху, тільки за розширенням. Тому keylang-LSP має заявити `.md` і сам відфільтровувати файли.

- Діагностика вже фільтрується за файлами аналізу (`src/lsp-features.ts:207-212`). Треба перевірити, що для README.md вона порожня.
- У Claude Code інший markdown-плагін LSP витіснить keylang: виграє перший зареєстрований. В офіційній таблиці такого плагіна немає.
- В opencode конфлікту немає: кілька серверів на розширення співіснують.
- У хуках фільтр за шляхом є лише в Claude (`if`). У Cursor шлях перевіряє скрипт, у Codex його треба розібрати з патча.

## Стан keylang (перевірено в коді)
- LSP уже віддає completion (`src/lsp.ts:292-293`, `completionProvider` на `:329`) через `completions()` (`src/lsp-features.ts:560`). Ця функція придатна для MCP-інструмента `complete`.
- MCP-сервер не задає `instructions` (`src/mcp.ts:70`). Інструменту `complete` немає; є `search` і `validate_spec` (`src/mcp.ts:73-85`, `:226-245`).
- Harness пише MCP для всіх чотирьох агентів, skill у `.agents/skills` і `.claude/skills`, а hook лише Stop (`src/adapters/harness.ts:11-23`, `:145-148`, `:191-227`). Реєстрації LSP для агентів немає: ні `lsp` в opencode, ні `.lsp.json`.
- Warnings мають severity 2 (`src/lsp-features.ts:215`), тож до агента opencode вони не доходять.

## Рекомендації
1. Додати hook `PostToolUse` для Claude, Codex і Cursor, що запускає check на змінених spec-файлах. Помилки йдуть у `additionalContext`, а «did you mean»-кандидати — у текст повідомлення. Це єдиний канал, що працює в усіх агентах.
2. Додати MCP-інструмент `complete` і `instructions` (перші 512 символів самодостатні).
3. Зареєструвати LSP в opencode (`lsp` у `opencode.json`, з попередженням про вбудовані сервери) і Claude Code (plugin з `.lsp.json`, розповсюдження через npm).
4. Додати згенерований каталог ID у `references/` skill-а, `paths: keylang/**/*.md`, і правило Cursor `.mdc` з `globs`.

## Неперевірені припущення
- Чи оголошує LSP-клієнт Claude Code pull-діагностику. keylang не пушить діагностику, коли клієнт її тягне сам (`src/lsp.ts:94`). Потрібен smoke-тест через `claude --plugin-dir`.
- Чи працює `postToolUse` з `additional_context` у Cursor CLI.
- Досвід спільноти: мости LSP→MCP (Serena, agent-lsp, codex-lsp) теж спираються на діагностику й навігацію, а не на completion. https://github.com/blackwell-systems/agent-lsp
- MCP `completion/complete` доповнює лише аргументи prompt і resource-template в UI клієнта, а не код, тож для цієї задачі не підходить. https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion