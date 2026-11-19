# 01: Таблиця команд, коротка довідка, `help <cmd>`, позначка experimental

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §2 «CLI», §3 рядок 2; рішення людини 2026-11-19 (периферія — experimental).

**What to build:** Зараз `USAGE` (`src/cli.ts:41-426`) — один шаблонний рядок на ~385 рядків, і `--help` завжди друкує його повністю (`src/cli.ts:502`). Довідки по команді немає. Першим у ній іде `web` з п'ятьма формами, а `init` — шостим. Новачок не бачить, з чого почати.

1. **Таблиця команд як дані.** `USAGE` стає масивом записів у власному модулі поруч із `src/cli.ts` (наприклад `src/cli-usage.ts`). Запис — `{ name, forms, summary, details, group, tier }`:
   - `forms` — рядки синтаксису, як зараз у лівій колонці;
   - `summary` — один рядок;
   - `details` — нинішній текст опису;
   - `group` — `start` | `check` | `explore` | `agents` | `editors` | `more`;
   - `tier` — `core` | `more` | `experimental`.

   Повний текст будується з таблиці і дослівно збігається з нинішнім `USAGE` за змістом. Порядок і групування можуть змінитися; тест `tests/cli-help.test.ts` звіряє ключі команд, а не байти.
2. **Коротка довідка** — `keylang --help`, `keylang -h`, `keylang help`. До ~40 рядків:
   - рядок про те, що таке keylang;
   - групи `core`, кожна команда в один рядок `summary`;
   - рядок «More: `keylang help <command>`, `keylang help --all`».

   | Група | Команди |
   |---|---|
   | Start | `init`, `doctor` |
   | Check | `check`, `map`, `baseline`, `explain`, `fmt` |
   | Explore | `tour`, `entries`, `coverage`, `web` (лише форма `web [url]`) |
   | Agents | `agents`, `feature`, `proposals`, `hook`, `mcp` |
   | Editors | `lsp` |
3. **`keylang help <cmd>`** і **`keylang <cmd> --help`** друкують `forms` і `details` цієї команди (усі її форми; для `explain` — усі варіанти). Невідома команда: stderr `keylang: unknown command <cmd>; run keylang help`, код 2. `help --all` — повний текст.
4. **Experimental.** `tier: "experimental"` отримують `system`, `wire`, `types`, `diff`, `migration`, `flow`, `export`, `import`, `diagram`, форми `web --new` і `web --hub` та студія в описі `web`. У повній довідці перед ними стоїть позначка `[experimental]`, у короткій їх немає. Решта (`flows`, `draft`, `clone`, `integrations`, `trace-plan`, `spec-to-code`, `code-to-spec`, `new`, `completions`, `parse`, `web --read-only`, `web --export`) — `tier: "more"`: у повній довідці без позначки, у короткій їх немає. Поведінка команд не змінюється.
5. **Без команди й без TTY** (`src/cli.ts:517-523`) у stderr іде коротка довідка замість повної, код 2 без змін.
6. **Документація.** У `docs/cli.md` («Команди») над таблицею — рядок про `help <cmd>` і `help --all`; позначка experimental у тих самих рядках таблиці. У `llm.txt` агенту сказати, що повна довідка — `keylang help --all`.

Що не робити: не змінювати імена команд і прапорців, не прибирати команди, не міняти `OPTIONS` (з нього будуються `completions`).

- [ ] `keylang --help` ≤ 40 рядків, перші команди — `init` і `check`; жодної команди `tier: experimental`
- [ ] `keylang help <cmd>` і `keylang <cmd> --help` однакові для кожної з 36 команд; невідома команда — код 2
- [ ] `keylang help --all` містить усі ключі команд, що й `docs/cli.md`; `tests/cli-help.test.ts` звіряє саме `help --all`
- [ ] без TTY і без команди — коротка довідка в stderr, код 2
- [ ] CLI-тести: коротка довідка, `help check`, `check --help`, `help nope`, позначка `[experimental]` у `help --all`
- [ ] `docs/cli.md` і `llm.txt` узгоджено; несумісну зміну `--help` описано тут у `## Comments`

Ключові файли: `src/cli.ts`, новий модуль таблиці команд, `src/completions.ts` (перевірити, що не залежить від тексту `USAGE`), `tests/cli-help.test.ts`, `docs/cli.md`, `llm.txt`

## Comments
