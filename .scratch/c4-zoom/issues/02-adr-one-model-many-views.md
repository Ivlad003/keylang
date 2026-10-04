# 02: ADR 0014 — одна модель, багато видів

**Джерело:** spec §4.3; research-c4-zoom-literature §4 (Structurizr `model`/`views`), §9 п. 4

**What to build:** `docs/adr/0014-one-model-many-views.md` у форматі наявних ADR: знімок — єдина модель; карта, карта з поясненнями, DOI-дерево TUI, потоки, експорт C4 і панель контексту — види, що обчислюються зі знімка та `explain/brief/` детерміновано. Модель запитується лише явними командами (`--llm`) і завжди з походженням. Наслідки: нові рівні представлення (`system`, шар) не стають ID мови без окремого ADR; жоден вид не є джерелом фактів для `check`. Додати термін «View (вид)» у `CONTEXT.md` (Language → Документи) і посилання з design §5.4. Дотримуйся `docs/agents/domain.md`.

**Blocked by:** —

**Type:** docs

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test`

- [ ] ADR має статус, контекст, рішення, наслідки, альтернативи (ID мови для шарів — варіанти B/C зі spec §1a)
- [ ] `CONTEXT.md` містить термін «View (вид)» з _Avoid_
- [ ] design.md §5.4 і README карти з поясненнями посилаються на ADR 0014

## Comments
