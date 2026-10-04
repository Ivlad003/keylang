# 02: Агент-CLI як провайдер моделі (`cli:*`)

**Джерело:** plan.md крок 2 і §1 C1–C8; design/design-agent-cli.md; review-agent-cli.md; decisions.md (Q1: `cli:` з `keylang.json` приймається)

**What to build:** Користувач із підпискою на Claude Code, Codex, opencode чи Cursor задає `agent: "cli:claude"` (`cli:codex`, `cli:opencode:anthropic/claude-sonnet-5`, `cli:cursor:gpt-5`) у `keylang.json` або `KEYLANG_AGENT` / `~/.config/keylang/agents.json` (`"use"`, а також власні CLI через `"clis": {name: {command: [...]}}` з плейсхолдерами `{prompt_file}`, `{model}`) — і `explain --llm`, `draft`, `code-to-spec`, ghost і `Ctrl+Space` працюють через встановлений CLI без API-ключа. Пріоритет: env > agents.json > keylang.json; `doctor` показує значення, його джерело, бінарник і версію та рядок з усіма чотирма CLI.

Кожен пресет запускається як «лише відповідь»: без хуків проєкту (інакше власний Stop-hook keylang заблокує вкладений хід), без MCP, без інструкцій репо, read-only (для читання репо — лише Read/Grep/Glob-подібні інструменти), `cwd = PWD = root`, `KEYLANG_NESTED=1` у дочірньому середовищі; `cli:*` під `KEYLANG_NESTED` — `{missing}`, що блокує рекурсію. Промт іде через stdin (Cursor — argv, з лімітом розміру). Процес запускається масивом аргументів, від'єднаною групою; рання відповідь, abort або таймаут вбивають групу (SIGTERM, потім SIGKILL); вихід keylang вбиває всі живі групи. Cursor: бінарник `cursor-agent`, або `agent` лише якщо `--version` відповідає формату Cursor (на машині `agent` може бути Grok — тоді зрозуміла помилка). Модель у конфігу не може починатися з `-` і містити `--` (захист від ін'єкції прапорців). Ghost із CLI має типову паузу 1500 мс замість 400; `explain --jobs` за замовчуванням 2.

**Blocked by:** 01 <!-- 01 — скасування запитів -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check` · `node --test tests/agent-cli.test.ts`

- [ ] валідація `agent` приймає три форми; помилка називає файл, поле та допустимі форми; `ghost.delay` допускає «типове» значення
- [ ] новий модуль провайдера в шарі `features` (додано до `keylang.json`), без імпорту `llm.ts`; чисті будівники argv/парсери відповіді окремо від I/O
- [ ] пресети claude, codex, opencode, cursor з прапорцями, перевіреними через `--help` встановлених версій (зафіксувати версії в docs); custom через `agents.json` з валідацією полів
- [ ] `tests/agent-cli.test.ts` через справжній CLI з фейковими бінарниками на PATH (`HOME` у tmp): точний argv, cwd/PWD, куди йде system-текст, промт на stdin, `KEYLANG_NESTED`, opencode `permission: deny`, custom пропускає `{model}`; збої (відсутній бінарник → офлайн-фолбек, `--mode llm` → 2, `hang` з `KEYLANG_LLM_TIMEOUT_MS` → 2 і мертві pid дитини й онука, порожня відповідь → 2, нічого не записано); `keylang.json` `cli:claude` запускає фейк; Grok-версія `agent` → текст «не Cursor CLI»; невалідні моделі та `agents.json` → 2 з назвою поля; `doctor` друкує обидва рядки
- [ ] `tests/tui.test.ts`: ghost через `KEYLANG_AGENT=cli:claude` з режимами `hang,ok,hang` — старий процес мертвий, варіанти показані, `Esc` вбиває, після `close()` живих фейків немає
- [ ] `docs/tools.md`: новий розділ «Модель: API або агент-CLI» (граматика, пріоритет, agents.json, таблиця пресетів із версіями, env, таймаут, безпека: custom не в пісочниці, вкладений агент читає репо й секрети, SIGTSTP лишає дітей); рядки `doctor` і `agent`
- [ ] `docs/adr/0009-agent-cli-provider.md`; ADR 0005 п. 1 уточнено посиланням; `CONTEXT.md` — термін «агент-CLI (провайдер моделі)»
- [ ] `npm run typecheck`, `npm test`, `map` (переглянути diff), `map --check`, `check` — зелені

Ключові файли: `src/config.ts`, новий `src/agent-cli.ts`, `src/llm.ts`, `src/tui/assist.ts`, `src/cli.ts` (doctor, jobs), `tests/fixtures/fake-agent.mjs`
