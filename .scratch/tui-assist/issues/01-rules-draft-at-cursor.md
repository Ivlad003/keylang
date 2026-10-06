# 01: Чернетка моделі для `# rules`: `Ctrl+Space` і текст цілі в промпті

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/tui-rules-draft.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

**Джерело:** spec §3, §4.1, §4.2, П1; [ADR 0019](../../../docs/adr/0019-tui-assistant-without-harness.md); design §7.3; `docs/tools.md`, абзац «Чернетка правил (algo, llm, hybrid)»

**What to build:** Людина пише під `# rules` кілька правил або прозу на кшталт «application never uses infrastructure directly» і в перегляді натискає `Ctrl+Space`. Модель дописує правила, і пропозиція відкривається в MERGE, як чернетка потоку.

- **Запуск.** `App.draftAtCursor` (`src/tui/app.ts`) обирає дію за розділом під курсором (таблиця spec §4.1). Тікет 02 додасть у неї рядок файла фічі. Для `# rules` запускається наявна операція `draft-rules`: `into` — відкритий файл, `mode: "llm"`, `output: "proposal"`, `pending: "refuse"`, `context` — текст пакета `F4` у момент натискання.
- **Запит.** `DraftRulesRequest` (`src/operations/types.ts`) отримує необов'язкове поле `context`, як у `DraftFlowRequest`. `draftRulesWithModel` (`src/draft-llm.ts`) кладе в промпт `llm` і `hybrid` текст розділів `# rules` цілі — прозу й наявні правила як намір людини — і `context`, якщо він є. Системний промпт просить перетворити текст людини на правила й не повторювати наявних.
- **Звірка й ціль не змінюються.** Статуси `agree`, `conflict` з доказом і `llm-only` лишаються. Кандидат будує `withRules`.
- **Інше місце в перегляді.** Поза `# rules` і `# flow` з `trigger` повідомлення каже, де `Ctrl+Space` працює.
- **CLI.** `keylang draft rules` змінює лише вміст промпту.

- [ ] тести тікета — у новому файлі `tests/tui-rules-draft.test.ts`: Verify запускає його окремо, тож до роботи він падає
- [ ] TUI e2e (`checkoutRepo`, `withConfig` з `agent`, `heldModel`): у `keylang/rules.md` під `# rules` є проза й одне правило. `Ctrl+Space` у цьому розділі дає рівно один запит. Промпт містить прозу, наявне правило й текст пакета `F4`
- [ ] той самий e2e: після відповіді відкрито MERGE на `keylang/rules.md`, і в правилах моделі стоять `<!-- keylang:llm model=… status=… -->`. До `w` дерево файлів, крім `.keylang/proposals/`, не змінилося (`treeBytes`), а `state.analysis.verdicts` той самий. Після `w` у файлі є і проза, і нові правила
- [ ] відмови до запиту (запитів до моделі 0):
  - курсор у `keylang/rules.baseline.md` — повідомлення називає `keylang baseline` і `rules.md`;
  - незбережений буфер цілі;
  - для цілі вже чекає пропозиція;
  - немає `agent` — пояснення те саме, що для потоку
- [ ] Cancel під час відповіді дає `cancelled`. Нічого не записано, `.keylang/stats.json` теж
- [ ] `Ctrl+Space` у `# flow` з `trigger` — чернетка потоку, як раніше: наявні тести `Ctrl+Space` у `tests/tui-session.test.ts` зелені. Поза `# rules` і `# flow` з `trigger` — нове повідомлення, що називає обидва випадки
- [ ] CLI: `keylang draft rules --mode llm --print` з мок-моделлю кладе в промпт текст `# rules` цілі. Stdout, stderr і коди не змінилися: наявні тести `tests/tui-drafts.test.ts` і `tests/draft.test.ts` зелені
- [ ] `?`, дія палітри «Agent draft…» (`src/tui/actions.ts`: назва й причина недоступності кажуть про потоки й правила), `docs/tools.md` (абзац «Чернетка правил», абзац про `Ctrl+Space` і таблиця клавіш)

## Comments

### Notes

- 2026-10-06 (тікет написано): `mode: "llm"`, а не `hybrid`, — припущення П1 спеки. Причина: намір задає текст людини, а algo-правила всього репозиторію дає форма «Draft rules». Пакет `F4` іде в промпт лише з TUI. У CLI поля `--context` немає, як і в `draft flow`.
