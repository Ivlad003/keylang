# 03: Сходинка фічі в `feature` і `feature_status`

**Джерело:** spec §4.2 B1, B4, Р3; research-c4-zoom-tools §4 (Spec Kit, Kiro, OpenSpec), research-c4-zoom-literature §6

**What to build:** `keylang feature <slug>` і MCP `feature_status` обчислюють сходинку файла фічі з його змісту й знімка, нічого не записуючи: `idea` — є заголовок і проза, немає `flow`/`planned`; `behavior` — є хоча б один `flow`, але є кроки без ID або жодного `planned`; `structure` — є `planned`, але частина без сигнатури чи шару (модуль без `--layer`-відповідника у `keylang.json`), або кроки потоків не всі з ID; `ready` — усі кроки з ID, усі `planned` з сигнатурою й шаром, є прогалини реалізації (K201 / static не ok); `done` — поточний критерій готовності. Текстовий вивід починається рядком `stage: <stage>`; `--format json` отримує поле `stage` і масив `next` (що потрібно для наступної сходинки, тими ж полями, що `Gap`). Коди виходу не змінюються: `done` → 0, інакше 1, помилка → 2. У `src/feature-status.ts` сходинка — чиста функція від `Document` + `Gap[]`.

**Blocked by:** —

**Type:** code

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test`

- [ ] e2e: п'ять фікстур фіч → `idea`, `behavior`, `structure`, `ready`, `done`; стабільний `--format json` з `stage` і `next`
- [ ] MCP `feature_status` повертає ті самі `stage` і `next` (tests/mcp або cli e2e через stdio)
- [ ] файл не змінюється після виклику (хеш до/після)
- [ ] `--help`, tools.md (`feature`, MCP) і resources/keylang-feature/SKILL.md описують сходинки

## Comments
