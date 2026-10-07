# 31: Наступні адаптери фреймворків: Laravel, Symfony, NestJS, Express/Next, Django/FastAPI

**Status:** ready-for-human

**Type:** code

**Blocked by:** 01, 04, 09

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Після Magento ті самі факти для поширених стеків (кожен — окремий тікет після тріажу):

- **Laravel:** service container bindings (`$this->app->bind`, `singleton`), фасади → класи, `routes/*.php`, events/listeners (`EventServiceProvider`, атрибути), jobs/queues, scheduler (`Kernel::schedule`).
- **Symfony:** `services.yaml`/autowiring, `#[Route]`, EventSubscriber, Messenger handlers, console commands.
- **NestJS:** providers/`useClass`, `@Controller` + `@Get`, `@OnEvent`, `@Cron`, `@MessagePattern` (див. рев'ю §3: зараз `@OnEvent` дає хибний `static fail`).
- **Express/Next.js:** маршрути з літеральних шляхів, `app/**/route.ts`, server actions.
- **Django/FastAPI:** `urls.py`, декоратори роутерів, сигнали, Celery tasks.

Вимога автора (2026-10-07): business-flows має працювати для всіх мов проєкту, тож ці адаптери — частина фічі, а не «колись». Розбити на тікети по одному фреймворку (порядок: NestJS → Laravel → Symfony → Express/Next → Django/FastAPI, якщо автор не вкаже інший); для кожного — фікстура з типовим шаблоном і цільові метрики як у 03.

## Критерії готовності

- [ ] розбито на окремі тікети з пріоритетами

**Межі:** тріаж, не реалізація.

## Comments
