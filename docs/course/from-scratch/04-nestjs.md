# 4. A NestJS app

[Starting a project](README.md) · **English** · [Українською](uk/04-nestjs.md)

Run `nest new`, then aim the layers at folders you choose. Nest's default names (`tasks.controller.ts` next to `tasks.service.ts`) can share one folder. keylang assigns a file to the first glob that matches, and the file name becomes part of the id (`presentation.tasks.tasks.controller`). Separate folders keep the ids short.

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

The controller is the edge. The task function is plain TypeScript. The repository talks to the database. Domain still does not import either.

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

`src/tasks/create.ts` and the function `create` is `application.create.create`. `src/domain/task.ts` and `make` is `domain.task.make`. `src/db/tasks.ts` and `insert` is `infrastructure.tasks.insert`. `src/http/tasks.ts` is `presentation.tasks`. `make` is the name because `new` is not a legal function name in TypeScript.

Nest marks classes with `@Controller()`, `@Injectable()`, and `@Get()`. keylang does not know those decorators. A call inside that method can stay `unverified`, because the decorator might return another function. `feature` then stays not done.

The agent keeps the use case in a plain function. The controller calls it. You do not type this. This is the shape the agent must generate:

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

The stub is TypeScript and a `node:test` file. The agent also writes `@Module`, providers, and `main.ts` from the same spec. keylang does not generate them, and `keylang wire` is a different generator. You do not need it to keep this check.

What a green feature means: `create` calls `make` and `insert`, and no rule fails. It does not mean the HTTP server started, or that class-injectors were wired. The import rules still catch a controller that imports `src/db` directly.

Back to the [course](../README.md).
