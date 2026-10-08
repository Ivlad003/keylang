# 69: `clone --explain` пише `keylang.json` клону крізь symlink

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/clone.test.ts` · `npm run typecheck`

**Джерело:** суміжна знахідка під час тікета 14 (2026-10-07), рівень **P1** (запис поза дозволеними цілями, той самий клас, що й 12–14)

**Місце:** `src/clone.ts` (`enableExplainedMap`)

## Що не так

`enableExplainedMap` пише `keylang.json` клону через `writeAtomic` без `writeProblem`/`targetProblem`. Закомічений у чужому репозиторії `keylang.json -> …` за межі клону при `keylang clone --explain map-and-ai|all` (і `web <url>` з такими опціями) веде запис назовні.

## Що зробити

- Писати через `safeWrite`/`targetProblem`, як маркер у тікеті 14; на відмову — та сама поведінка: помилка з причиною, клон прибирається, код 2.
- Тест у `tests/clone.test.ts` поруч із тестом маркера.

## Критерії готовності

- [x] регресійний тест падає до виправлення
- [x] `docs/cli.md` § clone згадує, що `keylang.json` клону підлягає правилам запису

## Comments

- 2026-10-07: Регресійний тест `tests/clone.test.ts` «clone --explain: a committed `keylang.json` that is a link out of the clone is not written through; the clone is removed, no model is asked» (поруч із тестом маркера): origin комітить `keylang.json -> <sandbox>/outside/keylang.json` з валідною конфігурацією шарів; `keylang clone origin --explain map-and-ai` з фейковим агентом (`cli:claude`, без мережі) має дати код 2 зі `clone: keylang.json: leads out of the repository through a link; the clone of <url> was removed`, лишити файл за посиланням незмінним і єдиним у `outside/`, не викликати модель і не лишити клону в кеші; `clone origin` без `--explain` — код 0, файл за посиланням незмінний. До виправлення: код 0 — `--explain` проходив (`init` беріг `keylang.json`, `enableExplainedMap` читав конфігурацію крізь посилання й писав `writeAtomic` на шлях посилання), пояснення запитувались.
- 2026-10-07: Виправлення в `src/clone.ts`: `enableExplainedMap` спершу перевіряє `targetProblem(root, "keylang.json")` (місце з урахуванням посилань має бути в клоні) — інакше повертає `keylang.json: <причина>` ще до читання; запис — через `safeWrite(root, "keylang.json", …)` (загальні правила `src/safe-write.ts`: generated-маркер, тека, посилання), відмова повертається рядком. `writeAtomic` у clone.ts більше не потрібен. `src/cli.ts` (`prepareClone`, спільний для `clone` і `web`): на відмову клон прибирається (`rmSync`; тека — клон keylang, свіжий або з маркером, інакше `syncClone` відмовив би раніше), у stderr `keylang: clone: <причина>; the clone of <url> was removed`, код 2 — як для маркера в тікеті 14. Та сама гілка покриває й «not a JSON object» / «`explain` is not an object» (раніше — код 2 без прибирання).
- 2026-10-07: Контракт: `docs/cli.md` § clone — `keylang.json` клону підлягає правилам запису, текст відмови, прибирання клону, модель не викликається; таблиця `--explain` не змінилась. Карту перегенеровано (зсув рядків у clone.ts). Перевірки: `node --test tests/clone.test.ts tests/safe-write.test.ts` — зелено, `npm run typecheck` — ок, `node bin/keylang.js map --check`, `check` — ок.
