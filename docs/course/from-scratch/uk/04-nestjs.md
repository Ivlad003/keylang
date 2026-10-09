# 4. Застосунок NestJS

[Проєкт з нуля](README.md) · [English](../04-nestjs.md) · **Українською**

Запустіть `nest new`, а потім наведіть шари на теки, які оберете самі. Типові імена Nest (`tasks.controller.ts` поруч із `tasks.service.ts`) можуть жити в одній теці, але тоді id стають довгими: keylang віддає файл першому glob-у, який із ним збігся, і ім'я файла стає частиною id (`presentation.tasks.tasks_controller`). Окремі теки дають короткі id.

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

Контролер — це край, сервіс — завдання, а репозиторій говорить з базою. Domain, як і раніше, не імпортує ні того, ні іншого.

keylang читає власні декоратори Nest. Його адаптер NestJS вмикається сам, коли `package.json` залежить від `@nestjs/core` чи `@nestjs/common`. `@Controller("tasks")` разом із `@Post()` — точка входу-маршрут. Провайдери `@Module` кажуть, який клас дає токен, тож `@Inject(TOKEN)` у конструкторі або параметр, типізований класом, розв'язують `this.repo.insert()` до цього класу. `@OnEvent` і `emit` з'єднують слухача з його подією. Тож сценарій може жити в сервісі `@Injectable()`.

Файл `@Module` називає кожен клас, зокрема й репозиторій, тому він отримує власний шар `wiring` на вершині ланцюга. Під `presentation` він порушив би `deny presentation infrastructure`.

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

За такого розкладу `src/http/tasks.ts` із класом `TasksController` і його методом `create` дає `presentation.tasks.TasksController.create`. Так само `src/tasks/tasks.ts` дає `application.tasks.TasksService.create`, `src/domain/task.ts` і `make` — `domain.task.make`, а `src/db/tasks.ts` — `infrastructure.tasks.SqlTasksRepo.insert`. Функція називається `make`, бо `new` у TypeScript не може бути ім'ям функції.

`trigger route` просить `check` підтвердити, що метод контролера — маршрут. Щойно він з'явиться, `npx keylang entries` надрукує його як `route  POST /tasks  presentation.tasks.TasksController.create  src/http/tasks.ts:11`. Запланований рядок контролера не має сигнатури, бо keylang зараховує декоратор параметра на кшталт `@Body()` до сигнатури коду. Тож контракт тримає сервіс.

Набирати цей код вам не треба; це форма, яку має згенерувати агент:

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

`TasksRepo` — інтерфейс, тож сам тип класу не називає. Його називає провайдер: `check` друкує `` static ok infrastructure.tasks.SqlTasksRepo.insert: called from application.tasks.TasksService.create through the argument `repo` → `'TASKS_REPO' → SqlTasksRepo` `` і далі рядок провайдера. Провайдер, записаний через `useFactory` чи `useValue`, класу не називає, тож виклик через його токен лишається `unverified`.

```sh
npx keylang spec-to-code application.tasks.TasksService.create
npx keylang feature tasks
```

Заготовка — це клас із методом, який кидає помилку. Файла тесту немає, бо потік не називає жодного рядка `test`. Решту агент пише з тієї самої специфікації: контролер, репозиторій, `@Module` і `main.ts`. `keylang wire` — це інший генератор, і для цієї перевірки він не потрібен.

Ось що означає зелена фіча: маршрут доходить до `create`, `create` викликає `make` і, через провайдер, який прочитав keylang, `insert`, і жодне правило не падає. Вона не означає, що HTTP-сервер запустився. Проте правила імпорту все одно ловлять контролер, який імпортує `src/db` напряму.

Далі — [з діаграми](05-from-diagram.md), або назад до [курсу](../../uk/README.md).
