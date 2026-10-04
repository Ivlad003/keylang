# 02: Агент-CLI як провайдер моделі (`cli:*`)

**Джерело:** plan.md крок 2 і §1 C1–C8; design/design-agent-cli.md; review-agent-cli.md; decisions.md (Q1: `cli:` з `keylang.json` приймається)

**What to build:** Користувач із підпискою на Claude Code, Codex, opencode чи Cursor задає `agent: "cli:claude"` (`cli:codex`, `cli:opencode:anthropic/claude-sonnet-5`, `cli:cursor:gpt-5`) у `keylang.json` або `KEYLANG_AGENT` / `~/.config/keylang/agents.json` (`"use"`, а також власні CLI через `"clis": {name: {command: [...]}}` з плейсхолдерами `{prompt_file}`, `{model}`) — і `explain --llm`, `draft`, `code-to-spec`, ghost і `Ctrl+Space` працюють через встановлений CLI без API-ключа. Пріоритет: env > agents.json > keylang.json; `doctor` показує значення, його джерело, бінарник і версію та рядок з усіма чотирма CLI.

Кожен пресет запускається як «лише відповідь»: без хуків проєкту (інакше власний Stop-hook keylang заблокує вкладений хід), без MCP, без інструкцій репо, read-only (для читання репо — лише Read/Grep/Glob-подібні інструменти), `cwd = PWD = root`, `KEYLANG_NESTED=1` у дочірньому середовищі; `cli:*` під `KEYLANG_NESTED` — `{missing}`, що блокує рекурсію. Промт іде через stdin (Cursor — argv, з лімітом розміру). Процес запускається масивом аргументів, від'єднаною групою; рання відповідь, abort або таймаут вбивають групу (SIGTERM, потім SIGKILL); вихід keylang вбиває всі живі групи. Cursor: бінарник `cursor-agent`, або `agent` лише якщо `--version` відповідає формату Cursor (на машині `agent` може бути Grok — тоді зрозуміла помилка). Модель у конфігу не може починатися з `-` і містити `--` (захист від ін'єкції прапорців). Ghost із CLI має типову паузу 1500 мс замість 400; `explain --jobs` за замовчуванням 2.

**Blocked by:** 01 <!-- 01 — скасування запитів -->

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check` · `node --test tests/agent-cli.test.ts`

- [x] валідація `agent` приймає три форми; помилка називає файл, поле та допустимі форми; `ghost.delay` допускає «типове» значення
- [x] новий модуль провайдера в шарі `features` (додано до `keylang.json`), без імпорту `llm.ts`; чисті будівники argv/парсери відповіді окремо від I/O
- [x] пресети claude, codex, opencode, cursor з прапорцями, перевіреними через `--help` встановлених версій (зафіксувати версії в docs); custom через `agents.json` з валідацією полів
- [x] `tests/agent-cli.test.ts` через справжній CLI з фейковими бінарниками на PATH (`HOME` у tmp): точний argv, cwd/PWD, куди йде system-текст, промт на stdin, `KEYLANG_NESTED`, opencode `permission: deny`, custom пропускає `{model}`; збої (відсутній бінарник → офлайн-фолбек, `--mode llm` → 2, `hang` з `KEYLANG_LLM_TIMEOUT_MS` → 2 і мертві pid дитини й онука, порожня відповідь → 2, нічого не записано); `keylang.json` `cli:claude` запускає фейк; Grok-версія `agent` → текст «не Cursor CLI»; невалідні моделі та `agents.json` → 2 з назвою поля; `doctor` друкує обидва рядки
- [x] `tests/tui.test.ts`: ghost через `KEYLANG_AGENT=cli:claude` з режимами `hang,ok,hang` — старий процес мертвий, варіанти показані, `Esc` вбиває, після `close()` живих фейків немає
- [x] `docs/tools.md`: новий розділ «Модель: API або агент-CLI» (граматика, пріоритет, agents.json, таблиця пресетів із версіями, env, таймаут, безпека: custom не в пісочниці, вкладений агент читає репо й секрети, SIGTSTP лишає дітей); рядки `doctor` і `agent`
- [x] `docs/adr/0012-agent-cli-provider.md` (0009 — LTLf, 0010 — declared packages, 0011 — outside); ADR 0005 п. 1 уточнено посиланням; `CONTEXT.md` — термін «агент-CLI (провайдер моделі)»
- [x] `npm run typecheck`, `npm test`, `map` (переглянути diff), `map --check`, `check` — зелені

Ключові файли: `src/config.ts`, новий `src/agent-cli.ts`, `src/llm.ts`, `src/tui/assist.ts`, `src/cli.ts` (doctor, jobs), `tests/fixtures/fake-agent.mjs`

## Comments

### Resolved — 2026-10-04 (гілка `done/agent-completion-02`)
- Новий `src/agent-cli.ts` (features, лише `node:*` і `config.ts`): `readAgentSettings`/`parseAgentSettings` (agents.json з помилками «файл + поле»), `resolveAgent` (env > agents.json > keylang.json; невалідне джерело кидає), `selectedAgent` (для гейтів TUI/операцій: зламане налаштування вважається агентом, щоб запит показав помилку), `cliClient`, `probeAgentClis`/`cliVersion` для doctor; чисті `invocation`, `parseResultLine`, `parseOpencodeEvents` окремо від `runInvocation`.
- `llm.ts` загортає `cliClient`: `CliCancelled` → `LlmCancelled`, межа часу — той самий `deadline()` (без другого парсера `KEYLANG_LLM_TIMEOUT_MS`). `LlmClient.bin` — бінарник CLI для doctor.
- Пріоритет і рішення Q1: `cli:` з `keylang.json` діє; тест «keylang.json cli:claude запускає фейк» — `explain --missing --llm --limit 3` з `agent: "cli:claude"`.
- Відхилення / припущення:
  - ADR — 0012: 0009 (flow properties), 0010 (declared packages) і 0011 (outside) зайняті на master.
  - `docs/format.md` не має розділу конфігурації (`agent` описано в `docs/tools.md`), тому format.md не змінено.
  - `tools: "read"` (читання репо інструментами) не реалізовано: він потрібен лише spec-to-code hybrid (тікет 08); усі пресети зараз — `none`.
  - `ghost.delay` у JSON приймає `null` як «типове»; тип `number | null`.
  - `--jobs` без значення: CLI більше не підставляє 4, операція бере `defaultBriefJobs(effective agent)` (4 або 2); TUI-форма — так само.
  - Рядок doctor для відсутнього агента тепер «not configured (keylang.json `agent`, KEYLANG_AGENT or ~/.config/keylang/agents.json)»; джерело показано лише для KEYLANG_AGENT/agents.json, щоб рядок для keylang.json лишився як був.
- Ручна перевірка зі справжніми CLI (2026-10-04): `KEYLANG_AGENT=cli:claude:haiku explain <id> --llm` і `keylang.json agent=cli:claude:haiku` + `explain --missing --llm --limit 2` — відповіді збережено, код 0; `cli:codex` — відповідь отримано; `doctor`: `agent CLIs: claude 2.1.289 · codex 0.155.1 · opencode 2.0.20 · cursor 2026.09.28-64d2043`. opencode і cursor вручну не запускались (лише фейки й `--help`).
- Перевірки: `npm run typecheck` 0; `npm test` 638 тестів — 636 pass, 1 skip (whisper), 1 fail («without a model the form drafts hybrid»: подовжена підказка обрізалась на 200 колонках) — підказку скорочено, після цього той тест, усі TUI-тести з model/ghost/agent (38) і `tests/agent-cli.test.ts` + `tests/draft.test.ts` (50) зелені; `map` (diff — новий модуль `features.agent-cli`, зсуви рядків), `map --check` 0, `check` 0 fail.
