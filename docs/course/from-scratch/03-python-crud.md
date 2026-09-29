# 3. A Python CRUD

[Starting a project](README.md) · **English** · [Українською](uk/03-python-crud.md)

A list of tasks. This page is the create path. Read is the same shape with another feature file. FastAPI or Flask can be the edge. SQLite can be the store. The task rules import neither.

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

`app/tasks/create_task.py` under the glob `app/tasks/**` is the module `application.create_task`. The function inside it has the same name, so the id repeats the last word. Rename the file or the function if you want a shorter id, then copy it from the map.

The trigger is the plain function, not the HTTP route. A route under `@app.post` is a function keylang does not trust: the decorator may replace it, so a call inside it stays `unverified`. Call the plain function from the route. Prove the plain function.

```python
def create_task(title: str) -> Task:
    task = new(title)
    insert(task)
    return task
```

`requirements.txt` is not read. Do not wait for `external.fastapi`. The denies from [part 1](01-the-shape.md) already forbid domain from importing the database layer or a package. A route file that imports `app.db` fails `deny presentation infrastructure`.

Python records imports and calls. It does not record type edges. A call on a value keylang cannot name stays a hole, and the feature stays open.

```sh
npx keylang feature create-task
```

`spec-to-code` will not write a pytest file. The message says to write the test yourself.

A route that calls `insert` directly never makes this flow `ok`: there is no static path through `create_task`. That is the break the check is for.

Next: [a NestJS app](04-nestjs.md).
