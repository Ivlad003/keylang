# 3. A Python CRUD

[Starting a project](README.md) · **English** · [Українською](uk/03-python-crud.md)

The app is a list of tasks, and this page covers the create path. Reading tasks has the same shape, just with another feature file. FastAPI or Flask can be the edge and SQLite can be the store, but the task rules import neither of them.

```json
{
  "languages": ["python"],
  "layers": {
    "presentation": ["app/api/**"],
    "application": ["app/tasks/**"],
    "domain": ["app/domain/**"],
    "infrastructure": ["app/db/**"]
  }
}
```

`keylang/features/create-task.md`:

```markdown
# flow create-task

- planned fn application.create_task.create_task (title: str) → Task
- planned fn domain.task.new (title: str) → Task
- planned fn infrastructure.insert.insert (task: Task) → None
- trigger application.create_task.create_task
  - step domain.task.new
  - step infrastructure.insert.insert
```

`app/tasks/create_task.py`, under the glob `app/tasks/**`, is the module `application.create_task`. The function inside it has the same name, so the id repeats the last word. If you want a shorter id, rename the file or the function, then copy the new id from the map.

The trigger is the plain function, not the HTTP route, so the flow says the same thing whichever edge calls it. The agent calls that function from the route. You do not type this; it is the shape the agent must generate:

```python
def create_task(title: str) -> Task:
    task = new(title)
    insert(task)
    return task
```

keylang knows FastAPI and Flask routes, and Django and Celery too. With `fastapi` in `requirements.txt` or `pyproject.toml`, or an import of it, `npx keylang entries` lists a route `@app.post("/tasks")` as `route  POST /tasks  presentation.routes.post_task  app/api/routes.py:8`. A flow can then start at the route, `- trigger route presentation.routes.post_task`, with `create_task` as its step; `route` makes `check` confirm that the function is that kind of entry point, and another kind is K205. A decorator keylang does not know is still a hole, but only for a step on the decorated function, because its body may not run.

The manifest only turns on the adapter. It does not make `external.fastapi` known, because a distribution name need not match the import name, so do not wait for that id to appear. You do not need it: the denies from [part 1](01-the-shape.md) already forbid domain from importing the database layer or a package, and a route file that imports `app.db` fails `deny presentation infrastructure`.

For Python, keylang records imports and calls, but not type edges. A call on a value keylang cannot name therefore stays a hole, and the feature stays open.

```sh
npx keylang feature create-task
```

`npx keylang spec-to-code application.create_task.create_task` stubs the function, one that raises `NotImplementedError`, but it will not write a pytest file. The agent writes that test from the flow; you do not.

A route that calls `insert` directly breaks the cut twice: its import of `app.db` fails `deny presentation infrastructure`, and a flow that starts at the route never becomes `ok`, because there is no static path through `create_task`. Catching exactly this kind of break is what the check is for.

Next: [a NestJS app](04-nestjs.md).
