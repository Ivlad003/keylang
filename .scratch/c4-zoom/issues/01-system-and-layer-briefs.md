# 01: Brief системи й шарів у карті з поясненнями

**Джерело:** spec §4.1 A1, Р1; research-c4-zoom-literature §9 п. 1–2; design §5.4; ADR 0004

**What to build:** Карта з поясненнями отримує два верхні рівні C4. README (`<dir>/map-explained/README.md`) починається з brief-у системи: що це за репозиторій і для кого, з рядком походження. Детерміновані джерела — перший абзац кореневого `README.md` (`briefOf`), поле `description` з `package.json` / `Cargo.toml` / `pyproject.toml`, список тригерів потоків; колонка Explanation таблиці шарів заповнюється brief-ом шару. Brief шару без збереженого пояснення — агрегація з brief-ів його модулів: перше речення brief-у модуля з найбільшим ступенем у графі знімка + «N модулів», позначка походження `(aggregated)`. Файл шару `<layer>.md` показує той самий brief під рядком шару. Збережені пояснення `explain/brief/system.md` і `explain/brief/<layer>.md` (той самий формат і fingerprint, що для вузлів; fingerprint шару — від fingerprint-ів модулів, тож `stale` піднімається вгору) мають пріоритет над агрегацією. `explain --missing --llm` включає `system` і шари останньою хвилею (після модулів), промпт містить brief-и модулів. `system` і шари не стають ID мови: `rules`/`flows`/резолвер не змінюються.

**Blocked by:** —

**Type:** code

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] e2e на фікстурі з README і package.json: README карти з поясненнями містить brief системи й рядок походження `README · package.json`; без README — лише `package.json`; без обох — `—`
- [ ] brief шару без збереженого пояснення = агрегація з позначкою `(aggregated)`; збережений `explain/brief/<layer>.md` її замінює й показує `(llm · model · date)`
- [ ] зміна коду модуля робить brief його шару `stale`; `explain --stale` називає шар
- [ ] `explain --missing --llm` з мок-провайдером запитує `system` і шари після модулів, промпт шару містить brief-и модулів
- [ ] `map` детермінований: два запуски — однаковий вивід; `map --check` на самому keylang проходить після регенерації `keylang/map-explained/`
- [ ] format.md §«Карта з поясненнями» і tools.md описують рівні system/шар і походження

## Comments
