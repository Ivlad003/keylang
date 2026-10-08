# 38: Django/FastAPI/Flask/Celery: маршрути, сигнали, задачі

**Status:** ready-for-agent

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

- [ ] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [ ] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [ ] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments
