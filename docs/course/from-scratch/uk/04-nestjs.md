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
    "infrastructure": ["src/db/**"]
  }
}
```

Контролер — це край, функція задачі — звичайний TypeScript, а репозиторій говорить з базою. Domain, як і раніше, не імпортує ні того, ні іншого.

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

За такого розкладу `src/tasks/create.ts` і функція `create` дають `application.create.create`, `src/domain/task.ts` і `make` — `domain.task.make`, а `src/db/tasks.ts` і `insert` — `infrastructure.tasks.insert`. Файл контролера `src/http/tasks.ts` — це `presentation.tasks`. Функція називається `make`, бо `new` у TypeScript не може бути ім'ям функції.

Nest позначає класи декораторами `@Controller()`, `@Injectable()` і `@Get()`, а keylang цих декораторів не знає. Тому виклик усередині такого методу може лишитися `unverified`: декоратор може повернути іншу функцію. У такому разі `feature` не повідомить, що фіча готова.

Ось чому агент тримає сценарій у звичайній функції, а контролер лише викликає її. Набирати цей код вам не треба; це форма, яку має згенерувати агент:

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

Заготовка — це функція TypeScript і файл `node:test`. `@Module`, провайдери і `main.ts` агент теж пише з тієї самої специфікації, бо keylang їх не генерує. `keylang wire` — це інший генератор, і для цієї перевірки він не потрібен.

Ось що означає зелена фіча: `create` викликає `make` і `insert`, і жодне правило не падає. Вона не означає, що HTTP-сервер запустився або що інжектори класів під'єднано. Проте правила імпорту все одно ловлять контролер, який імпортує `src/db` напряму.

Далі — [з діаграми](05-from-diagram.md), або назад до [курсу](../../uk/README.md).
