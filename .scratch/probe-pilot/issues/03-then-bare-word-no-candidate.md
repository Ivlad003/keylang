# 03: `then` одним словом без кандидата мовчить; доповнення після `then` пропонує ID

**Status:** needs-triage

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: error-proneness, Р-9 (4 з 4 чекали посилання або попередження), кандидат 3. Продовження pl-theory/39 (K008 лише для слова з кандидатом).

**What to build:** За Р10 `- then <слово>` без крапки — текст. K008 (pl-theory/39) попереджає, лише коли якийсь оголошений ID закінчується на це слово. Слово без кандидата (`then Rejected`, `then OutOfStock` у репо, де такого ID немає) не дає нічого. Водночас доповнення після `then ` пропонує ID карти, тож учасник читає `then` як посилання: «Completion after `then` actually offered code IDs, which made me expect it to be treated as an ID» (сесія 1).

Відтворення (master `c408f53`, тимчасовий TS-репо після `init`): потік з

```markdown
- when name is empty
  - then 
  - then Rejected
  - then save
```

`check` → `K005 \`then\` needs a description` (рядок 2), `K008 \`then save\` is read as text, not a reference (did you mean \`then db.store.save\`?)`, а `then Rejected` — мовчки. LSP `textDocument/completion` після `  - then ` → 8 пунктів: `db.store`, `db.store.save — (v: string)`, `main.main`, … — без жодної позначки, що голе слово стане текстом. Те саме в копії `tests/fixtures/repo` (`then Rejected` у [спільному відтворенні](../spec.md#спільне-відтворення), рядок 11).

## Що має вирішити людина

Це Р-9, і протокол проби відкладає його до сесій з людьми (design-v0.2/28). AI-пілот — лише сигнал.

1. **K008 і для слова без кандидата.** `then Rejected` → `K008 \`then Rejected\` is read as text, not a reference; write a full ID or several words`. Warning, вердикти не змінюються. Багатослівний текст (`then the receipt is stored`) мовчить, як і зараз.
2. **Голе слово — посилання.** `then Rejected` → K001 (з `did you mean`, якщо є кандидат). Несумісна зміна Р10, лише з новою версією формату (pl-theory/35).
3. **Лише доповнення.** `check` без змін; доповнення після `then ` позначає кожен пункт «reference» і першим пунктом пропонує «text — describe the outcome in words».

**Рекомендація:** 1 + 3 після проби з людьми, якщо люди підтвердять очікування AI. До проби — нічого не змінювати, щоб завдання error-proneness у протоколі міряло поточну поведінку.

- [ ] рішення Р-9 записане в research-pl §5, grammar.md §5 (Р10) і §7
- [ ] фікстура: `then Rejected` без кандидата, `then save` з кандидатом, багатослівний `then` — поведінка за рішенням
- [ ] доповнення після `then` у LSP і TUI узгоджене з рішенням

Ключові файли: `src/resolve.ts`, `src/lsp-features.ts` (`completions()`), `src/explain.ts`, `docs/format.md`

## Comments

- 2026-10-04 — рішення людини: варіант «нічого не змінювати до проби з людьми» — щоб завдання error-proneness міряло поточну поведінку. Рішення Р-9 — після design-v0.2/28. Статус лишається needs-triage.
