# 05: README на один екран під роль «паркан»

**Status:** ready-for-agent

**Type:** docs

**Blocked by:** 01, 04

**Verify:** `git diff --check` · `npm test`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §1, §3 рядки 1, 9, 10, §5 рядок 8; рішення людини 2026-11-19 (головна роль — паркан для агентів і CI).

**What to build:** `README.md` (200 рядків) відкривається обіцянкою spec-first розробки (`README.md:7`) і трьома GIF TUI. «Try it» стоїть на рядку 69: 11 команд і Docker. Мова, UI, діаграми, system design, міграція й мілстоуни — на одній сторінці. `README.uk.md` повторює ту саму структуру.

Новий `README.md`, перший екран (~40 рядків):

1. Одне-два речення: keylang тримає архітектурні межі репозиторію в Markdown і зупиняє CI та агента (Claude Code, Codex, Cursor, opencode), коли код їх перетинає або коли хтось тихо послаблює правило.
2. Node ≥ 22.18 і три команди: `npx keylang init .`, `npx keylang check`, рядок CI (з тікета 06).
3. Вивід K102 текстом (з виправленням з тікета 03, якщо вже злито; інакше — нинішній текст).
4. Чотири посилання: `examples/fence`, курс, `llm.txt` (для агента), `docs/README.md`.

Решта README:

- коротко «Що ще вміє» з поділом core / experimental, як у `keylang --help` після тікета 01;
- «Чого keylang не робить» (нинішній розділ «Three answers» і список обмежень) — лишити, бо це довіра;
- мови й фреймворки — один абзац;
- мілстоуни, опис web, діаграм, студії, system design, міграції, публікації — перенести в `docs/overview.md` (новий) і в наявні `docs/tui.md` / `docs/cli.md`, з посиланням із README.

Виправити дрейф:

- «K001–K302» → фактичний діапазон із `src/diag.ts` (`README.md:164`, `README.uk.md:158`);
- посилання на `docs/format.md` і `docs/tools.md` (переліки) — на справжні документи або на `docs/README.md`;
- рядок M8 «nobody has yet tried it end to end…» (`README.md:179`) — узгодити з результатом harness-integration/11 (headless-прогін зроблено, людей ще не було);
- `init` + `map`: README каже, що `init` будує карту, а `docs/course/existing/01-the-first-hour.md:7-11` запускає `map` знову — прибрати зайвий крок або пояснити.

`README.uk.md` — та сама структура українською.

- [ ] перший екран README: роль, вимога Node, три команди, вивід K102, чотири посилання; жодної команди experimental
- [ ] `docs/overview.md` містить усе, що прибрано з README, і README на нього посилається
- [ ] діапазон кодів, посилання на format/tools, рядок M8 і `init`+`map` виправлено в README, README.uk.md і курсі
- [ ] усі відносні посилання в змінених файлах ведуть на наявні файли
- [ ] `npm test` зелений (тести, що читають README чи курс, якщо такі є)

Ключові файли: `README.md`, `README.uk.md`, `docs/overview.md`, `docs/README.md`, `docs/course/existing/01-the-first-hour.md`

## Comments
