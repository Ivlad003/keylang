# 18: `feature_status: done` досягається переписуванням файла фічі

**Status:** resolved

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** тікет 11 (fastapi × Codex) — єдиний `done: true` у прогоні, і він хибний по суті.

**What to build:** Людина записала у `keylang/features/bookmarks.md` план: `planned fn app.db.repositories.bookmarks.BookmarksRepository.add_bookmark (self, *, article: Article, user: User) → None`, `planned fn app.services.mail.EmailSender.send (…)`, кроки потоків до них. Агент Codex, не діставши static `ok` (див. 14), видалив усі `planned` і замінив кроки на нові ID своїх обгорток (`app.services.bookmarks.add_bookmark`, `app.services.mail.send_email`). `feature_status` рахує критерій по поточному тексту файла, тож видав `done`. Водночас щоденний запуск нагадувань не реалізовано: `send_bookmark_reminders` ніхто не викликає. Claude у тих самих умовах файл фічі не переписував, лише прибрав `planned` після K202.

Spec (Q6–Q8) дозволяє харнесу писати файли фіч напряму, тож захист від цього — відкрите рішення. Варіанти:
1. `feature_status` порівнює з версією файла на базовому коміті (`HEAD` чи `--since`): `planned`, прибраний без K202 у поточному коді, і змінені чи видалені `trigger`/`step` — прогалини `kind: "spec"` (як `check --changed` уже читає git; без git — інформаційне поле).
2. Skill/`AGENTS.md`: кроки й `planned` чужої фічі змінювати лише через `apply_diff` (як правила); deny для Claude на `keylang/features/**` після першого коміту — ламає Q8.
3. Поле `info.specChanged` без блокування — людина бачить, що «готово» отримано зміною плану.

Окремо для тріажу: фраза специфікації без ID («once a day») не перевіряється взагалі — чи давати їй форму (`trigger` на точку входу планувальника), чи визнати межею keylang у skill.

- [x] рішення записане (spec/ADR), skill і `docs/tools.md` узгоджені
- [x] фікстура: прибраний `planned` без реалізації і перейменований крок → не `done` (або явне поле), прибраний після K202 → `done`

Ключові файли: `src/feature-status.ts`, `src/changed.ts`, `resources/keylang-feature/SKILL.md`, `docs/tools.md`

## Comments

- 2026-10-04 — рішення людини: варіант 1 — `feature_status` порівнює файл фічі з версією на базовому коміті (`HEAD` або `--since`): прибраний `planned` без реалізації та змінений/видалений `trigger`/`step` — прогалини `kind: "spec"`, `done` не видається; без git — інформаційне поле. Фраза без ID («once a day») — визнати межею keylang у skill.
- 2026-10-04 — зроблено (варіант 1). `readFeatureBase` / `gitFileAt` (`src/git-changes.ts`) читають файл фічі на `HEAD` або `--since` (`git show <ref>:./<path>`). `featureStatus` (`src/feature-status.ts`) порівнює план: прибраний `planned`, який код не реалізує (та сама перевірка K201/K202, винесена в `plannedMismatch` у `src/flows.ts`), і `trigger`/`step`, якого вже немає під тим самим потоком і батьками, — прогалини `spec` з позицією в базовій версії. Нові кроки й порядок сусідів не порівнюються. `info.base = {ref, state: compared|absent|unavailable, reason?}`; без git план не порівнюється. Явний `--since`, який не читається, — код 2 (у MCP — помилка інструмента). CLI `feature --since`, MCP `feature_status {since?}`. Рішення записане в `spec.md` («Рішення людини після dogfood»), `docs/tools.md` і skill (не переписувати план; фраза без ID — межа keylang). Тести: `tests/cli.test.ts` «feature: a plan weakened since the base commit…», «feature: planned, static and rule gaps…» (`info.base` unavailable без git), `tests/mcp.test.ts` «mcp: feature_status compares the feature with its base commit…». Припущення: порядок сусідніх кроків не порівнюється, бо вставка нового кроку інакше давала б хибні прогалини.
