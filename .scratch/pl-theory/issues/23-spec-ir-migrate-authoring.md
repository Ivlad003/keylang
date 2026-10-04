# 23: Р-1 migrate: `draft-llm`, `spec-to-code` і `explain <id>` читають SpecIR

**Джерело:** research-pl §5 Р-1; знахідка 4

**What to build:** Дані зі SpecIR беруть:

- **draft-llm.ts:110, 122, 155** — оцінка кроків чернетки. draft-llm і далі пише позначки `keylang:llm` у вузли Text IR через `source`, бо його результат — `formatDocument` пропозиції.
- **spec-to-code.ts:**
  - `blocksDependency` (:64) — варіант над SpecIR із 19;
  - `callersInFlows` (:191);
  - пошук потоків, що називають ID: `flowTests` (:111) і перелік потоків для підказки моделі (:242). Зараз обидва обходять Text IR через `walk` над секціями `flow`.
- **explain-node.ts:46** — правила, що називають вузол або охопну область, беруться з тверджень SpecIR. Рядок виводу той самий, `file:line: <написані токени>`: його дає `source`.

Тікети 22 і 23 обидва змінюють explain-node.ts: 22 — рядок :52, 23 — рядок :46. Тікет, що зливається другим, перебазовується. Міграція flows.ts (20) тут не потрібна: ці модулі не викликають `evaluateFlows`.

**Blocked by:** 19 <!-- 19 (migrate rules) -->

**Status:** resolved

**Контракт:** немає

- [ ] tests/draft.test.ts і `scaffold` у tests/mcp.test.ts:174 без змін. `draft` із фейковим LLM дає той самий текст пропозиції й ті самі лічильники статусів.
- [ ] Коли `deny` забороняє виклик із потоку, spec-to-code, як і раніше, відмовляє з тим самим повідомленням (spec-to-code.ts:64). Тести, що генерують `node:test` для `test` потоків, без змін.
- [ ] `keylang explain <id>`, MCP `node` і контекст агента (`summarizeNode`) дають ті самі рядки правил і потоків, що й зараз.
- [x] У змінених файлах немає читання `refs` за індексом, а пошук ID у потоках не обходить Text IR.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/draft-llm.ts`, `src/spec-to-code.ts`, `src/explain-node.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; draft-llm.ts через compileSpec, spec-to-code.ts (blocksDependency над analysis.spec, spec.flows), explain-node.ts над analysis.spec.rules/flowsUsing. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
