# 10: Потік із промту в TUI

**Джерело:** plan.md крок 10; design/design-spec-to-code-hybrid.md §5

**What to build:** Користувач у спеці без потоку з `trigger` натискає `a`, пише «додай повернення коштів» — агент пише чернетку нового потоку, яка відкривається як MERGE з provenance `llm-only`/`conflict` (без алгоритмічної проєкції статусу `agree` бути не може); ім'я потоку дедуплікується як у `draft`; нічого не записується до `w`. Усередині потоку з `trigger` `a` з інструкцією дописує потік (наявна чернетка агента з інструкцією та сигналом скасування). Це закриває цикл §7.3 «людина → агент» для промту.

**Blocked by:** 09 <!-- 09 — промт агенту й роботи в TUI -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] `draftFlowWithModel` приймає інструкцію й сигнал; нова функція чернетки з промту (шлях, текст, рядок, інструкція, контекст, сигнал) через `reconcile` з необов'язковим `trigger`
- [ ] `a` поза потоком з `trigger` диспетчеризується в чернетку з промту
- [ ] TUI e2e: `a` у спеці без triggered-потоку → MERGE нового потоку з `status=llm-only`, до `w` нічого не записано
- [ ] `docs/tools.md` (TUI); у підсумку PR — перелік нотаток для `docs/design.md` (§5.5, §7.1, §7.3, рядок дорожньої карти після M8), які користувач накладе на свій WIP
- [ ] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/draft-llm.ts`, `src/draft.ts`, `src/tui/assist.ts`, `src/tui/app.ts`
