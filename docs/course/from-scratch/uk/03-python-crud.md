# 3. Python CRUD

[Проєкт з нуля](README.md) · [English](../03-python-crud.md) · **Українською**

Застосунок — це список задач, і ця сторінка описує шлях створення. Читання має ту саму форму, лише з іншим файлом фічі. Краєм може бути FastAPI або Flask, а сховищем — SQLite, але правила задачі не імпортують ні того, ні іншого.

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

`app/tasks/create_task.py` під glob-ом `app/tasks/**` — це модуль `application.create_task`. Функція всередині має те саме ім'я, тож id повторює останнє слово. Якщо хочете коротший id, перейменуйте файл або функцію, а потім скопіюйте новий id з карти.

Тригер — це звичайна функція, а не HTTP-маршрут, тож потік каже те саме, хоч який край її викликає. Агент викликає цю функцію з маршруту. Набирати цей код вам не треба; це форма, яку має згенерувати агент:

```python
def create_task(title: str) -> Task:
    task = new(title)
    insert(task)
    return task
```

keylang знає маршрути FastAPI і Flask, а також Django й Celery. Коли `fastapi` є в `requirements.txt` чи `pyproject.toml` або його імпортовано, `npx keylang entries` показує маршрут `@app.post("/tasks")` як `route  POST /tasks  presentation.routes.post_task  app/api/routes.py:8`. Тоді потік може починатися з маршруту, `- trigger route presentation.routes.post_task`, з `create_task` кроком; `route` змушує `check` підтвердити, що функція — точка входу саме цього виду, а інший вид — K205. Декоратор, якого keylang не знає, і далі дірка, але лише для кроку на декорованій функції, бо її тіло може не виконатися.

Маніфест лише вмикає адаптер. `external.fastapi` він відомим не робить, бо назва дистрибутива не мусить збігатися з іменем імпорту, тож не чекайте, що цей id з'явиться. Він і не потрібен: `deny` з [частини 1](01-the-shape.md) уже забороняють domain імпортувати шар бази або пакет, а файл маршруту, який імпортує `app.db`, порушує `deny presentation infrastructure`.

Для Python keylang записує імпорти й виклики, але не ребра типів. Тому виклик на значенні, яке keylang не може назвати, лишається діркою, і фіча лишається відкритою.

```sh
npx keylang feature create-task
```

`npx keylang spec-to-code application.create_task.create_task` робить заготовку функції, що кидає `NotImplementedError`, але файл pytest не напише. Цей тест пише агент із потоку, а не ви.

Маршрут, який викликає `insert` напряму, ламає розріз двічі: його імпорт `app.db` порушує `deny presentation infrastructure`, а потік, що починається з маршруту, ніколи не стане `ok`, бо немає статичного шляху крізь `create_task`. Саме такий злам і має ловити перевірка.

Далі: [застосунок NestJS](04-nestjs.md).
