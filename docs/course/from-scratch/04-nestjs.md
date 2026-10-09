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
    "infrastructure": ["src/db/**"],
    "wiring": ["src/*.module.ts", "src/main.ts"]
  }
}
```

The controller is the edge, the service is the task, and the repository talks to the database. Domain still imports neither of them.

keylang reads Nest's own decorators. Its NestJS adapter turns itself on when `package.json` depends on `@nestjs/core` or `@nestjs/common`. `@Controller("tasks")` with `@Post()` is a route entry point. The providers of `@Module` say which class a token gives, so `@Inject(TOKEN)` in a constructor, or a parameter typed by a class, lets `this.repo.insert()` resolve to that class. `@OnEvent` and `emit` join a listener to its event. So the use case can stay in an `@Injectable()` service.

The `@Module` file names every class, the repository included, so it gets its own layer, `wiring`, at the top of the chain. Under `presentation` it would break `deny presentation infrastructure`.

`keylang/rules.md`:

```markdown
# rules

- layers domain < application < presentation < wiring
  - infrastructure
- allow infrastructure domain
  The store saves the tasks the domain makes.
- deny domain infrastructure
- deny domain external
- deny presentation infrastructure
```

`keylang/features/tasks.md`:

```markdown
# flow tasks

- planned fn presentation.tasks.TasksController.create
- planned fn application.tasks.TasksService.create (title: string) → Task
- planned fn domain.task.make (title: string) → Task
- planned fn infrastructure.tasks.SqlTasksRepo.insert (task: Task) → void
- trigger route presentation.tasks.TasksController.create
  - step application.tasks.TasksService.create
    - step domain.task.make
    - step infrastructure.tasks.SqlTasksRepo.insert
```

With this layout, `src/http/tasks.ts` with the class `TasksController` and its method `create` gives `presentation.tasks.TasksController.create`. In the same way, `src/tasks/tasks.ts` gives `application.tasks.TasksService.create`, `src/domain/task.ts` and `make` give `domain.task.make`, and `src/db/tasks.ts` gives `infrastructure.tasks.SqlTasksRepo.insert`. The function is called `make` because `new` is not a legal function name in TypeScript.

`trigger route` asks `check` to confirm that the controller method is a route. Once it exists, `npx keylang entries` prints it as `route  POST /tasks  presentation.tasks.TasksController.create  src/http/tasks.ts:11`. The controller's planned line has no signature, because keylang counts a parameter decorator such as `@Body()` as part of the code's signature. The contract therefore sits on the service.

You do not type this; it is the shape the agent must generate:

```ts
@Injectable()
export class TasksService {
  constructor(@Inject("TASKS_REPO") private readonly repo: TasksRepo) {}

  create(title: string): Task {
    const task = make(title);
    this.repo.insert(task);
    return task;
  }
}
```

```ts
@Module({
  controllers: [TasksController],
  providers: [TasksService, { provide: "TASKS_REPO", useClass: SqlTasksRepo }],
})
export class AppModule {}
```

`TasksRepo` is an interface, so the type alone names no class. The provider does: `check` prints `` static ok infrastructure.tasks.SqlTasksRepo.insert: called from application.tasks.TasksService.create through the argument `repo` → `'TASKS_REPO' → SqlTasksRepo` ``, followed by the line of the provider. A provider written with `useFactory` or `useValue` names no class, so a call through its token stays `unverified`.

```sh
npx keylang spec-to-code application.tasks.TasksService.create
npx keylang feature tasks
```

The stub is the class with a method that throws. There is no test file, because the flow names no `test` line. The agent writes the rest from the same spec: the controller, the repository, `@Module` and `main.ts`. `keylang wire` is a different generator, and you do not need it to keep this check.

Here is what a green feature means: the route reaches `create`, `create` calls `make` and, through the provider keylang read, `insert`, and no rule fails. It does not mean that the HTTP server started. Even so, the import rules still catch a controller that imports `src/db` directly.

Next: [from a diagram](05-from-diagram.md). Back to the [course](../README.md).
