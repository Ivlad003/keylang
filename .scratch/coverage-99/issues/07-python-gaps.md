# 07: Python: FastAPI `Depends`, валідатори, фонові задачі

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** health-tracker після тікета 02: класифікувати решту orphans Python; `Depends(fn)` → досяжна від маршруту; pydantic `@field_validator`/`@model_validator`, `BackgroundTasks.add_task(fn)`, `@app.on_event`/lifespan, Celery `.delay` уже є — перевірити.

- [ ] health-tracker: M3 ≥ 99 % живого коду
- [ ] тест на фікстурі FastAPI

## Comments
