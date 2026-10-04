# 22: Р-1 migrate: LSP, `check --changed`, `feature`, TUI і trace-plan читають SpecIR

**Джерело:** research-pl §5 Р-1; знахідка 4. Дослідження не називає цих споживачів — їх знайшла перевірка фактів.

**What to build:** На SpecIR переходять споживачі в шарах features, tui і map.

- **lsp-features.ts.**
  - Completion (569, 578) фільтрує кандидатів через `blocksDependency` над `ws.analysis.spec`. Правила компілюються один раз на аналіз, а не через `collectRules(docs)` для кожного вузла знімка. Що це прискорить completion, — гіпотеза, заміру немає.
  - Мітки `documentSymbol` для `trigger`/`step`, `when`/`then` і `module x` (470, 476, 485) беруть ID із тверджень SpecIR через `source`, а не з `refs[0]`. Вивід той самий.
  - `flowsUsing` (264) шукає потоки, що називають ID (hover, codeLens, `explain <id>`), у `spec.flows`. Його виклик у explain-node.ts:52 оновлюється тут.
- **changed.ts.** Власні `collectRules`/`addRule` (96-124) дублюють обхід правил із rules.ts. Їх прибрано: область і критерій кожного правила беруться з тверджень SpecIR. Рядок критерію, за яким `--changed` зіставляє вердикти, лишається тим, що зараз будує `addRule`. Для `entry` це `entry <цілі>`, для `no-cycles` — `no-cycles`, а не канонічний `text` з 09 (`no-cycles <модуль|*>`). Отже, вивід `--changed` не змінюється.
- **feature-status.ts:83.** Кроки фічі беруться зі `spec.flows` для файла фічі.
- **tui/assist.ts:303.** Тригер потоку під курсором береться з `compileSpec([doc])` буфера. Як і зараз, це перший тригер.
- **trace-plan.ts:41-60 (`flowSymbols`, шар map).** Це джерело символів для `trace-plan` і TS-хуків (adapters/trace-hooks.ts:47). Символи `trigger`/`step` потоку беруться зі `spec.flows` документів, які `flowSymbols` розбирає сам. Пропуск збережених пояснень (`isStoredExplanation`) лишається. Тікет 45 (`never`) розширює вже цю версію.

На Text IR свідомо лишаються:
- навігація курсором: tui/app.ts:559 і `targetAt` у lsp-features.ts:144;
- мітки правил у навігації TUI (tui/nav.ts:90).

Навігація TUI показує написаний рядок: пункт `module x` не має відповідника серед тверджень, а `refs` читаються ітерацією для показу. Це робота редактора, а не семантика. Тікет 24 дозволяє це явно.

Міграція flows.ts (20) цьому тікету не потрібна. Споживачі тут самі обходять потоки й не викликають `evaluateFlows`, тож досить `spec.flows` з 18 і правил над SpecIR з 19. Тікети 22 і 23 обидва змінюють explain-node.ts: 22 — рядок :52, 23 — рядок :46. Тікет, що зливається другим, перебазовується.

**Blocked by:** 19 <!-- 19 (migrate rules) -->

**Status:** resolved

**Контракт:** немає

- [ ] Без змін зелені:
  - tests/lsp.test.ts: documentSymbol, completion з `deny`, hover і codeLens з потоками;
  - тести `check --changed`, `hook stop` і `feature` у tests/cli.test.ts;
  - tests/tui.test.ts;
  - тести trace (`@flow check`, trace-hooks).
- [ ] `keylang feature <slug> --format json` і `check --changed --format json` на наявних фікстурах дають той самий stdout і ті самі коди виходу.
- [ ] LSP-completion на fn-цілі з K005 (`deny app infra.db.save`) поводиться так само, як після 16.
- [ ] Після `npm test` команда `check` на репозиторії дає ті самі trace-вердикти для `keylang/flows/check.md`: символи `trace-plan` ті самі.
- [x] У змінених файлах немає ні `node.refs[<n>]`, ні `[from, ...to] = node.refs`.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/lsp-features.ts`, `src/changed.ts`, `src/feature-status.ts`, `src/tui/assist.ts`, `src/trace-plan.ts`, `src/explain-node.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; changed.ts (ruleHits над spec), lsp-features.ts flowsUsing/completion над ws.analysis.spec, feature-status.ts над spec.flows/spec.planned, trace-plan.ts через compileSpec, тригер TUI — src/tui/app.ts:3093 через triggers[0]. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
