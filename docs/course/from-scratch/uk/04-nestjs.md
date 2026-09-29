# 4. Застосунок NestJS

[Проєкт з нуля](README.md) · [English](../04-nestjs.md) · **Українською**

Запустіть `nest new`, потім наведіть шари на теки, які обираєте ви. Типові імена Nest (`tasks.controller.ts` поруч із `tasks.service.ts`) можуть жити в одній теці. keylang віддає файл першому glob-у, який збігся, і ім'я файла стає частиною id (`presentation.tasks.tasks.controller`). Окремі теки лишають id короткими.

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

Контролер — край. Функція задачі — звичайний TypeScript. Репозиторій говорить з базою. Domain і далі не імпортує ні те, ні те.

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

`src/tasks/create.ts` і функція `create` — це `application.create.create`. `src/domain/task.ts` і `make` — `domain.task.make`. `src/db/tasks.ts` і `insert` — `infrastructure.tasks.insert`. `src/http/tasks.ts` — `presentation.tasks`. Ім'я `make`, бо `new` у TypeScript не може бути ім'ям функції.

Nest позначає класи `@Controller()`, `@Injectable()` і `@Get()`. keylang цих декораторів не знає. Виклик усередині такого методу може лишитись `unverified`, бо декоратор може повернути іншу функцію. Тоді `feature` не стає готовим.

Тримайте сценарій у звичайній функції. Контролер кличе її:

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

Заготовка — це TypeScript і файл `node:test`. Шаблон модуля Nest лишається вашим: `@Module`, провайдери, `main.ts`. keylang їх не генерує, і `keylang wire` — інший генератор. Для цієї перевірки він не потрібен.

Зелена фіча означає: `create` кличе `make` і `insert`, і жодне правило не падає. Вона не означає, що HTTP-сервер стартував або що інжектори класів зібрані. Правила імпорту все одно ловлять контролер, який імпортує `src/db` напряму.

Далі — [курс](../../uk/README.md).
