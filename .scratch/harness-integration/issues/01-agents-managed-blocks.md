# 01: `init --agents`, `keylang agents`, блоки `AGENTS.md`/`CLAUDE.md`

**Джерело:** spec Q3, Q13; ADR 0005 п. 3; design §7.6 «Адаптери»

**What to build:** `init` визначає харнеси за наявними `.claude/`, `.codex/`, `.cursor/`, `opencode.json(c)`. `--agents=claude,codex,opencode,cursor|none` задає список явно; невідоме ім'я — код 2 з переліком допустимих. `keylang agents [--agents=…] [--check]` виконує ту саму генерацію на вже ініціалізованому репо. Чиста функція «наявний текст файла + харнеси → новий текст» окремо від запису.

`AGENTS.md` отримує керований блок між `<!-- keylang:begin -->` і `<!-- keylang:end -->`: короткий цикл фічі (опис у `keylang/features/`, MCP-інструменти, `check`, правила лише через пропозицію) і CLI-запасний шлях для харнеса без MCP. Блок ≤ 4 KiB (ліміт Codex 32 KiB на всі файли). Для Claude: якщо `CLAUDE.md` немає — створюється з `@AGENTS.md`; якщо є і не містить `@AGENTS.md` — рядок додається в керований блок. Текст поза маркерами не змінюється байт у байт; CRLF зберігається. `--check` нічого не пише і дає 1, коли блок застарів чи відсутній.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] фікстури: без каталогів харнесів; з `.claude/` і наявним `CLAUDE.md` з власним текстом; з `AGENTS.md` з чужим текстом і CRLF
- [x] повторний запуск — байт у байт той самий результат (ідемпотентність)
- [x] `agents --check` на застарілому блоці — код 1, файли не змінено; на актуальному — 0
- [x] `--agents=none` — лише `keylang.json` і карта, як до зміни
- [x] зіпсовані маркери (begin без end) — код 2 з назвою файла, без запису
- [x] `--help` описує `--agents` і `agents`; semantics.md §7 «Команди» оновлено

Ключові файли: `src/cli.ts`, новий модуль адаптерів (шар за `keylang.json`, поза ядром мови), `tests/cli.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1, 4ad4aa5; `src/harness.ts` (mergeMarked/mergeClaude), `src/operations.ts`; tests/cli.test.ts «init: managed AGENTS.md block keeps foreign CRLF text…», «agents: --agents=none writes no harness files; unknown name and broken markers write nothing», tests/tui.test.ts «tui: agents auto…»; вручну: наявний `CLAUDE.md` з CRLF отримує `@AGENTS.md` у керованому блоці, застарілий блок `AGENTS.md` → `agents --check` код 1; `docs/semantics.md` §7 посилається на `docs/tools.md#agents`.
