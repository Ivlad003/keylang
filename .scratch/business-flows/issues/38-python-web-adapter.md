# 38: Django/FastAPI/Flask/Celery: маршрути, сигнали, задачі

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (Python) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- **Django:** `urls.py` (`path('x/', views.f)`, `include`, класові view `.as_view()` → методи `get`/`post`), сигнали (`post_save.connect(h, sender=M)`, `@receiver`) → `observer`, management commands → `cli`.
- **FastAPI:** `@app.get('/x')`, `APIRouter(prefix=…)` + `app.include_router` → `route`; `Depends(f)` → виклик `via: "injected"`.
- **Flask:** `@app.route('/x', methods=[…])`, Blueprints з префіксом.
- **Celery:** `@shared_task`/`@app.task` → `consumer`; `beat_schedule` → `cron`; `.delay()`/`.apply_async()` → ребро до задачі з `via: "dispatch"`.

## Критерії готовності

- [x] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [x] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [x] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments

### 2026-10-08 — реалізація

- Чотири адаптери (`django`, `fastapi`, `flask`, `celery`) у `src/frameworks/python-web.ts`: виявлення — пакет у кореневому маніфесті (`pyproject.toml`, `requirements*.txt`, `setup.py`, `setup.cfg`, `Pipfile`) або імпорт у проаналізованому `.py`; конфіги — `.py`-файли, що імпортують пакет (+ `urls.py`, `management/commands/*.py` для Django, `beat_schedule` для Celery). `parse` фактів не дає: їх записує екстрактор Python (`decorators`, `statements`, `paramCalls` у `FileFacts`, `EXTRACTOR_VERSION` m1.19); розміщення на графі — `src/python-web-entries.ts` (виклик з `src/framework-entries.ts`).
- Реєстрація впізнається лише за резолвом імен (`router` = `fastapi.APIRouter(…)`, `receiver` з `django.dispatch`), не за назвою; впізнаний декоратор знімає свою дірку `decorator … may replace …`, невідомий лишається діркою.
- Ребра: `Depends(f)` → `via: "injected"` (`hook` — параметр або `dependencies`); `task.delay()`/`apply_async()` → `via: "dispatch"`; `signal.send()` → `via: "observer"` до приймачів. До `Via` (graph.ts, flows.ts) додано `dispatch` і `observer`; `describeVia` і draft називають їх як ребра конфігу.
- Припущення: вузлів подій ще немає (тікет 08 не зроблено), тому `send()` веде одразу до приймачів, а сигнал — точка входу `observer` з міткою `post_save (sender=Order)`. Мітка cron — `<назва> (<cron>)`. `ROOT_URLCONF` не читається: корені URL — `urls.py`, яких ніхто не `include`-ить.
- Не читаються (задокументовано в snapshot.md): реєстрації у фабриці `create_app()`, `add_url_rule`, DRF-роутери, `send_task`, `MethodView`, `Depends` у псевдонімі типу.
- Тести: `tests/frameworks-python-web.test.ts` (6, фікстури `tests/fixtures-python-web.ts`); `tests/languages.test.ts` — приклад невідомого декоратора тепер `@retry` (FastAPI-маршрут більше не дірка); у `tests/frameworks-magento.test.ts` повідомлення про невідомий фреймворк перевіряється без повного переліку.
- Бенч health-tracker (FastAPI, локальна копія `bench/repos`): дірок декораторів Python 76 → 10, точок входу 2 → 68 (66 `route`), 7 ребер `Depends`.

