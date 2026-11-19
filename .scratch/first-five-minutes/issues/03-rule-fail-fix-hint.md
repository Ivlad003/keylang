# 03: Виправлення в рядку порушення правила

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §3 рядок 6; AI-пілот 2026-10-04 (K-коди «до → після explain» не змінювались: людина без `explain` не знала, що робити).

**What to build:** Рядок `static fail` потоку вже закінчується виправленням: `…; add a call to \`<ціль>\` in \`<батько>\` or in a function it reaches` (`src/flows.ts:975`, `:631`). Порушення правил виправлення не мають — лише ребро й правило:

- K102 `divergence: \`a\` depends on \`b\`, which is denied by \`deny a b\` (rules.md:5)` (`src/rules.ts:430`);
- K101 (`:460`), K104 (`:656`), K105 (`:766`).

Що з цим робити, каже лише окремий `keylang explain K102` (`src/explain.ts:57`).

Додати до `message` цих чотирьох кодів короткий хвіст у тій самій формі, що в `static fail` (`; <дія>`). Текст має бути конкретним для цього рядка, а не загальним:

| Код | Хвіст (орієнтир) |
|---|---|
| K102 | `; remove this import or call from \`<a>\`, or propose a change to \`<rule>\` (keylang explain K102)` |
| K101 | `; reverse the dependency, or add \`- allow <from> <to>\` to rules.md with a reason` |
| K104 | `; stop exporting \`<name>\`, or add it to \`exports\` under \`module <m>\`` |
| K105 | `; break the cycle at one of its edges` |

- Не повторювати хвіст, коли повідомлення вже має підказку тієї самої дії (`incomparableAside`, `docblockNote` — перевірити).
- Формулювання для агента не повинне радити послаблювати правило напряму: «propose a change» узгоджене з `llm.txt` (зміна правил — пропозиція людині).
- Текст `fix` у `src/explain.ts` (`EXPLANATIONS`) не дублювати дослівно: хвіст коротший і конкретний; `explain` лишається повним поясненням.

Формати:
- `message` змінюється однаково в людському виводі, у JSON, SARIF і `github`, як уже для `static fail`;
- поля, кількість результатів і коди виходу не змінюються;
- K107, K103 і K106 не чіпати.

- [ ] K101, K102, K104, K105 мають хвіст із дією; `static fail` без змін
- [ ] очікувані файли (`tests/fixtures/diagnostics.expected`, `tests/fixtures/repo.expected`, `tests/fixtures/spec-forms/*.expected`) оновлено після перевірки нового тексту, а не лише для зеленого тесту
- [ ] CLI-тест: K102 у людському форматі й у `--format json` містить хвіст; поля JSON ті самі
- [ ] `docs/semantics.md` §7 (тексти K101–K105) і `docs/cli.md` («Формати виводу check») узгоджено; несумісну зміну тексту записано в `## Comments`

Ключові файли: `src/rules.ts`, `src/explain.ts` (лише якщо виносити спільний текст), `tests/cli-rules.test.ts`, очікувані файли фікстур, `docs/semantics.md`, `docs/cli.md`

## Comments
