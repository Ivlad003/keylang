# 4. A NestJS app

[Starting a project](README.md) · **English** · [Українською](uk/04-nestjs.md)

Run `nest new`, then aim the layers at folders of your choice. Nest's default names (`tasks.controller.ts` next to `tasks.service.ts`) can share one folder, but then the ids grow long: keylang assigns a file to the first glob that matches, and the file name becomes part of the id (`presentation.tasks.tasks_controller`). Separate folders keep the ids short.

```json
{
  "languages": ["typescript"],
  "layers": {
    "presentation": ["src/http/**"],
    "application": ["src/tasks/**"],
    "domain": ["src/domain/**"],
    "infrastructure": ["src/db/**"]
  }
}
```

The controller is the edge, the task function is plain TypeScript, and the repository talks to the database. Domain still imports neither of them.

`keylang/features/tasks.md`:

```markdown
# flow tasks

- planned fn application.create.create (title: string) → Task
- planned fn domain.task.make (title: string) → Task
- planned fn infrastructure.tasks.insert (task: Task) → void
- trigger application.create.create
  - step domain.task.make
  - step infrastructure.tasks.insert
```

With this layout, `src/tasks/create.ts` and the function `create` give `application.create.create`, `src/domain/task.ts` and `make` give `domain.task.make`, and `src/db/tasks.ts` and `insert` give `infrastructure.tasks.insert`. The controller file `src/http/tasks.ts` is `presentation.tasks`. The function is called `make` because `new` is not a legal function name in TypeScript.

Nest marks classes with `@Controller()`, `@Injectable()`, and `@Get()`, and keylang does not know those decorators. A call inside such a method can therefore stay `unverified`, because the decorator might return another function, and then `feature` does not report done.

That is why the agent keeps the use case in a plain function, and the controller only calls it. You do not type this; it is the shape the agent must generate:

```ts
export function create(title: string): Task {
  const task = make(title);
  insert(task);
  return task;
}
```

```sh
npx keylang spec-to-code application.create.create
npx keylang feature tasks
```

The stub is a TypeScript function plus a `node:test` file. The agent also writes `@Module`, the providers, and `main.ts` from the same spec, because keylang does not generate them. `keylang wire` is a different generator, and you do not need it to keep this check.

Here is what a green feature means: `create` calls `make` and `insert`, and no rule fails. It does not mean that the HTTP server started or that the class injectors were wired. Even so, the import rules still catch a controller that imports `src/db` directly.

Back to the [course](../README.md).
