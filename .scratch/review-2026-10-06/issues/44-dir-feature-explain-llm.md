# 44: `"dir": "."` ламає feature, explain --llm і baseline: шляхи `./…` не проходять власну політику запису

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `ops`, верифікація: confirmed.

**Місце:** `src/operations/feature.ts:48` (рецензент указав `src/operations/feature.ts:48`)

## Що не так

Конфіг дозволяє `"dir": "."`: валідатор зводить порожній шлях до `.`, а `exportTargetProblem` і тести `review-ops`/`tui-session` цей випадок підтримують. Проте операції будують шляхи як `${config.dir}/…` і отримують `./features/<slug>.md`, `./explain/…`, `./rules.baseline.md`. Документи аналізу мають шлях `features/f1.md`, тож feature не знаходить свій файл, а `writeProblem` відкидає `./…` як «not a plain relative path». Корінь той самий у `feature-questions` (feature.ts:174), MCP `feature_status` (mcp.ts:222), `featureSlugOf` у TUI, `explainDir` (explanations.ts:49) і `baselinePath` (baseline.ts:75).

## Сценарій збою

keylang.json `{"dir": ".", "layers": {...}, "agent": "cli:claude"}` і валідний `features/f1.md` з `# flow f1` / `- trigger a.x.foo`. `keylang check` дає `1 ok` і читає `features/f1.md`. Проте `keylang feature f1` завершується кодом 2: «feature: ./features/f1.md: not a spec keylang read». `keylang explain a.x.foo --llm` спершу питає модель, потім відмовляє: «./explain/a.x.foo.md: not a plain relative path», код 1. `explain --missing --llm` робить 7 запитів до моделі, не пише жодного brief і завершується кодом 1. `keylang baseline` дає код 1 з «./rules.baseline.md: not a plain relative path» і хибною порадою «run the baseline again», `baseline --check` завжди stale. Отже й `init` на такому конфігу завершується як failed.

## Як відтворити

Фікстура scratchpad/review/ops/dot і dot2: keylang.json з dir ".", src/a/x.ts, src/b/y.ts, features/f1.md, git init. `node bin/keylang.js feature f1` → `keylang: feature: ./features/f1.md: not a spec keylang read`, exit 2. `check --format json` → результат з file "features/f1.md", `0 fail, 0 unverified, 1 ok`. З фейковим claude першим на PATH (tests/fixtures/fake-agent.mjs): `explain a.x.foo --llm` → `./explain/a.x.foo.md: not a plain relative path` / `nothing was written`, exit 1. `explain --missing --llm` → `failed: a.x: ./explain/brief/a.x.md: not a plain relative path` ×7, exit 1, у журналі фейкового агента 7 викликів. `map` → exit 0. `baseline` → `./rules.baseline.md: not a plain relative path`, exit 1.

Доказ верифікатора:

> Я відтворив це на поточному HEAD. Фікстура: scratchpad/verify/ops-0-0/dot.
> - keylang.json: {"dir": ".", "layers": {"a": "src/a/**", "b": "src/b/**"}, "agent": "cli:claude"}.
> - src/a/x.ts викликає bar з src/b/y.ts.
> - features/f1.md містить `# flow f1` і `- trigger a.x.foo`.
> - Виконано git init і коміт.
> - HOME/XDG вказують на scratch. Фейковий claude з tests/fixtures/fake-agent.mjs стоїть першим на PATH.
> 
> Спостереження (`node /home/kosmodev/pet_project/keylang/bin/keylang.js …`):
> - `check` → "features/f1.md:3:1: ID ok a.x.foo: exact / 0 fail, 0 unverified, 1 ok", exit 0.
> - `feature f1` → "keylang: feature: ./features/f1.md: not a spec keylang read", exit 2.
> - Контроль: та сама фікстура з типовим dir (keylang/features/f1.md). Там `feature f1` дає "done", exit 0, а `baseline` пише keylang/rules.baseline.md, exit 0.
> - `explain a.x.foo --llm` → "keylang: ./explain/a.x.foo.md: not a plain relative path / keylang: nothing was written", exit 1. Модель викликано один раз: у логу фейкового агента з'явився 1.json.
> - `explain --missing --llm` → "[n/7] …: failed: ./explain/brief/<id>.md: not a plain relative path" ×7, "explained 0 of 7 node(s)", exit 1. Модель викликано ще 7 разів, тож у логу 8 викликів. Каталог explain/ не створено.
> - `baseline` → "./rules.baseline.md: not a plain relative path / keylang: nothing was written; run the baseline again to compute it from the files on disk", exit 1.
> - `baseline --check` → "./rules.baseline.md: stale, run `keylang baseline`", exit 1.
> - `map` → exit 0, пише map/a.md і map/b.md: map збирає шляхи правильно.
> - `init --agents=none` на копії → та сама помилка baseline, exit 1.
> 
> Причина в коді:
> - src/safe-write.ts:41 відкидає будь-який сегмент шляху "." як "not a plain relative path".
> - src/config.ts:245 зводить dir до ".". Валідатор це явно дозволяє, а тести tests/review-ops.test.ts:256 і tests/tui-session.test.ts:1460 перевіряють dir ".", тож це підтримуване значення, а не невалідний вхід.
> - Шляхи склеюються як `${config.dir}/…` у таких місцях: src/operations/feature.ts:48 і :174 (feature-questions), src/mcp.ts:222 (feature_status), featureSlugOf у feature.ts:23 (префікс "./features/" не збігається з шляхом "features/f1.md"), src/explanations.ts:49 (explainDir) і src/baseline.ts:75 (baselinePath).
> - Документи аналізу мають шлях "features/f1.md", а не "./features/f1.md".
> 
> Документи (docs/semantics.md, cli.md, tui.md, llm.txt) не обмежують dir значенням, відмінним від ".". semantics.md каже лише, що dir нормалізується. Отже, це не  …

## Що зробити

- Додати один хелпер specPath(dir, rest) = dir === "." ? rest : `${dir}/${rest}` (або posix.join) і використати його в feature.ts:48/174, featureSlugOf, mcp.ts:222, explainDir і baselinePath, плюс тест на dir ".".

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/operations/feature.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-07.** Відтворено через справжній CLI (`tests/review-ops.test.ts`, розділ 8): копія `tests/fixtures/repo` з `"dir": "."`, `features/f1.md`, `rules.md`; `feature f1` давав код 2 «./features/f1.md: not a spec keylang read». Виправлення: один хелпер `specPath(dir, rest)` у `src/config.ts` (`dir === "."` → `rest`, інакше `${dir}/${rest}`), і ним побудовано всі шляхи під каталогом специфікацій: `feature.ts` (`runFeature`, `runFeatureQuestions`, `featureSlugOf`), `feature-status.ts`, `mcp.ts` (`context` за фічею), `explanations.ts` (`explainDir`), `baseline.ts` (`baselinePath`), `stale.ts` (`staleBaselinePath`), `lsp-features.ts` (карта й карта з поясненнями), TUI `app.ts` (`mapDirs`, `adopt`) і `clip-chat.ts` (`/feature` без аргументу). `map.ts` не чіпав: карту він пише через `join(config.root, config.dir, …)`, і на `dir: "."` вона й так працювала. Тест перевіряє `check`, `feature f1` (`done`, 0), `baseline` і `baseline --check` (0, файл `rules.baseline.md` у корені), `explain <id> --llm` з фейковим `claude` (0, `explain/<id>.md`), і `featureSlugOf` на `"."`. Контракт не змінився (документи не обмежували `dir`), у `llm.txt` додано речення, куди лягають файли при `"dir": "."`. Перевірено: `node --test` на review-ops, feature-*, cli-feature, explain*, stale, mcp, lsp, tui-clip-questions — 110 pass, 0 fail; `npm run typecheck`; `keylang map --check` (карту з поясненнями перегенеровано); `keylang check` — 0 fail.
