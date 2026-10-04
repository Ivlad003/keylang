# 02: ADR 0014 — одна модель, багато представлень

**Джерело:** spec §4.3, §1b; research-c4-zoom-literature §4 (Structurizr `model`/`views`), §9 п. 4

**What to build:** `docs/adr/0014-one-model-many-views.md` у форматі наявних ADR. Рішення: знімок — єдина модель фактів. Карта, карта з поясненнями, екран зуму TUI, експорт C4 і панель контексту — представлення, що обчислюються зі знімка й збережених пояснень детерміновано. Модель запитується лише явними командами (`--llm`) і завжди з видимим походженням. Наслідки: корінь репозиторію — вузол представлення, а не ID мови (Р1); жодне представлення не є джерелом фактів для `check`. Альтернативи: корінь як ID мови; шари й корінь як повні вузли знімка з ребрами й правилами (обговорення 2026-10-04).

У `CONTEXT.md` додати термін **Представлення (view)** до розділу «Документи» з _Avoid_: «вид» (у глосарії «вид» означає kind: вид ребра, вид вузла), «діаграма». Визначення Map і Explained map уже кажуть «представлення» — послатися на новий термін. Дотримуйся `docs/agents/domain.md`.

**Blocked by:** None (can start immediately)

**Type:** docs

**Model:** claude:claude-opus-5-5

**Status:** resolved

**Verify:** `test -f docs/adr/0014-one-model-many-views.md` · `grep -q "Представлення (view)" CONTEXT.md` · `npm run typecheck` · `npm test`

- [x] ADR має дату, статус, контекст, рішення, наслідки й альтернативи
- [x] `CONTEXT.md` має термін «Представлення (view)» з _Avoid_
- [x] design.md §5.4 посилається на ADR 0014

## Comments

- 2026-10-04 (Claude Code, сесія keylang-c9): зроблено без shiftwork. `docs/adr/0014-one-model-many-views.md`, термін **Представлення (view)** у `CONTEXT.md` (_Avoid_: «вид», бо в глосарії це kind), посилання з design §5.4. Verify: ADR і термін є, `npm run typecheck` і `npm test` проходять.
