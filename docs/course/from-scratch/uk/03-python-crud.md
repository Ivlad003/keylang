# 3. Python CRUD

[Проєкт з нуля](README.md) · [English](../03-python-crud.md) · **Українською**

Список задач. Тут шлях створення. Читання — та сама форма з іншим файлом фічі. Краєм може бути FastAPI або Flask. Сховищем — SQLite. Правила задачі не імпортують ні те, ні те.

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

`app/tasks/create_task.py` під glob-ом `app/tasks/**` — модуль `application.create_task`. Функція всередині має те саме ім'я, тож id повторює останнє слово. Перейменуйте файл або функцію, якщо хочете коротший id, і скопіюйте його з карти.

Тригер — звичайна функція, не HTTP-шлях. Шлях під `@app.post` — функція, якій keylang не довіряє: декоратор може підмінити її, тож виклик усередині лишається `unverified`. Кличте звичайну функцію зі шляху. Доводьте звичайну функцію.

```python
def create_task(title: str) -> Task:
    task = new(title)
    insert(task)
    return task
```

`requirements.txt` не читається. Не чекайте на `external.fastapi`. `deny` з [частини 1](01-the-shape.md) уже забороняє domain імпортувати шар бази або пакет. Файл шляху, який імпортує `app.db`, ламає `deny presentation infrastructure`.

Python записує імпорти й виклики. Ребер типів не записує. Виклик на значенні, яке keylang не може назвати, лишається діркою, і фіча лишається відкритою.

```sh
npx keylang feature create-task
```

`spec-to-code` не напише файл pytest. Повідомлення каже написати тест самим.

Шлях, який кличе `insert` напряму, ніколи не зробить цей потік `ok`: немає статичного шляху крізь `create_task`. Саме цей злам ловить перевірка.

Далі: [застосунок NestJS](04-nestjs.md).
