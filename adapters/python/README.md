# Адаптер trace для Python

`keylang_trace.py` запускає скрипт і записує виклики функцій плану як JSONL схеми 1 ([semantics.md](../../docs/semantics.md), «Trace»). Лише стандартна бібліотека; Python 3.12+ — `sys.monitoring`, старші — `sys.setprofile`. Повний опис — [cli.md](../../docs/cli.md#trace).

```sh
keylang trace-plan checkout > plan.json             # або: keylang trace-plan --entry <id> --name checkout
KEYLANG_TRACE=.keylang/trace/checkout.jsonl KEYLANG_TRACE_PLAN=plan.json \
  python3 adapters/python/keylang_trace.py run.py [args…]
```

Без `KEYLANG_TRACE_TEST` ID тесту — командний рядок; `KEYLANG_FLOW` називає потік запуску процесу.

## Запити сервера

`keylang_trace.flow(name, test=None)` — контекстний менеджер (contextvars): span-и блоку — окремий запуск потоку `name` з власним `runId` і записом `run` наприкінці блоку. Під обгорткою модуль імпортується як `keylang_trace`; без адаптера `flow` нічого не робить, якщо взяти запасний варіант:

```python
try:
    from keylang_trace import flow
except ImportError:
    from contextlib import nullcontext
    flow = lambda name, test=None: nullcontext()
```

FastAPI (`python3 keylang_trace.py "$(command -v uvicorn)" app:app`):

```python
@app.middleware("http")
async def keylang_flow(request, call_next):
    with flow(request.headers.get("x-keylang-flow") or request.cookies.get("X-Keylang-Flow"), test=f"{request.method} {request.url.path}"):
        return await call_next(request)
```

Django (`python3 keylang_trace.py manage.py runserver --noreload`) — middleware з тим самим `with flow(…)` навколо `self.get_response(request)`. Корутини не записуються; записуються синхронні функції, які вони викликають. Чернетка потоку з записаного — `keylang draft flow --from-trace <file.jsonl>` ([cli.md](../../docs/cli.md#trace-requests)).
