# 4. Застосунок NestJS

[Проєкт з нуля](README.md) · [English](../04-nestjs.md) · **Українською**

Запустіть `nest new`, а потім прив'яжіть шари до тек на ваш вибір. Файли з типовими для Nest іменами (`tasks.controller.ts` поруч із `tasks.service.ts`) можуть лежати в одній теці, але тоді id виходять довгими. keylang віддає файл першому glob-у, з яким той збігся, і ім'я файла стає частиною id (`presentation.tasks.tasks_controller`). З окремими теками id лишаються короткими.

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

Контролер — це край, сервіс — завдання, а репозиторій працює з базою. Domain, як і раніше, не імпортує ні того, ні іншого.

keylang розуміє декоратори Nest. Його адаптер NestJS вмикається сам, коли `package.json` залежить від `@nestjs/core` чи `@nestjs/common`. `@Controller("tasks")` разом із `@Post()` дають точку входу типу маршрут. Провайдери `@Module` кажуть, який клас стоїть за токеном, тож завдяки `@Inject(TOKEN)` у конструкторі або параметру, типізованому класом, `this.repo.insert()` розв'язується до цього класу. `@OnEvent` і `emit` з'єднують слухача з його подією. Отже, сценарій може жити в сервісі `@Injectable()`.

Файл `@Module` згадує кожен клас, зокрема й репозиторій, тому отримує власний шар `wiring` на вершині ланцюга. У шарі `presentation` він порушив би `deny presentation infrastructure`.

`keylang/rules.md`:

```markdown
# rules

- layers domain < application < presentation < wiring
  - infrastructure
- allow infrastructure domain
  Сховище зберігає задачі, які створює домен.
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

За такої розкладки `src/http/tasks.ts` із класом `TasksController` і його методом `create` дає `presentation.tasks.TasksController.create`. Так само `src/tasks/tasks.ts` дає `application.tasks.TasksService.create`, `src/domain/task.ts` і `make` — `domain.task.make`, а `src/db/tasks.ts` — `infrastructure.tasks.SqlTasksRepo.insert`. Функція називається `make`, бо `new` у TypeScript не може бути ім'ям функції.

`trigger route` просить `check` підтвердити, що метод контролера є маршрутом. Щойно метод з'явиться, `npx keylang entries` надрукує його як `route  POST /tasks  presentation.tasks.TasksController.create  src/http/tasks.ts:11`. У запланованого рядка контролера немає сигнатури, бо keylang зараховує декоратор параметра на кшталт `@Body()` до сигнатури коду. Тому контракт фіксують на сервісі.

Набирати цей код вам не треба, це лише форма, яку має згенерувати агент:

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

`TasksRepo` — інтерфейс, тож сам тип не вказує на клас. На клас указує провайдер: `check` друкує `` static ok infrastructure.tasks.SqlTasksRepo.insert: called from application.tasks.TasksService.create through the argument `repo` → `'TASKS_REPO' → SqlTasksRepo` `` і далі рядок провайдера. Провайдер, записаний через `useFactory` чи `useValue`, класу не вказує, тож виклик через його токен лишається `unverified`.

```sh
npx keylang spec-to-code application.tasks.TasksService.create
npx keylang feature tasks
```

Заготовка — це клас із методом, який кидає помилку. Файла тесту немає, бо в потоці немає жодного рядка `test`. Решту агент пише з тієї самої специфікації: контролер, репозиторій, `@Module` і `main.ts`. `keylang wire` — окремий генератор, і для цієї перевірки він не потрібен.

Зелена фіча означає, що маршрут доходить до `create`, `create` викликає `make`, а через провайдер, який прочитав keylang, ще й `insert`, і жодне правило не падає. Вона не означає, що HTTP-сервер запустився. Проте контролер, який імпортує `src/db` напряму, правила імпорту все одно впіймають.

Далі — [з діаграми](05-from-diagram.md), або назад до [курсу](../../uk/README.md).
