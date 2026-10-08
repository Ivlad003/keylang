# 35: Laravel: container, фасади, маршрути, події, черги, scheduler

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (PHP) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- **Прив'язки:** `$this->app->bind|singleton|scoped(I::class, C::class)` у service providers, `$bindings`/`$singletons` властивості; фасади (`Cache::get` → `Illuminate\Cache\CacheManager` через `getFacadeAccessor`, лише для фасадів репозиторію та відомого списку фреймворку).
- **Точки входу:** `routes/web.php`/`api.php`: `Route::get('/x', [C::class, 'm'])`, `Route::resource`, групи з `prefix` → `route`; `routes/console.php` + `Kernel::schedule` → `cron`/`cli`; `ShouldQueue` jobs (`handle`) → `consumer`; listeners з `EventServiceProvider::$listen` і атрибутів `#[AsEventListener]` → `observer` + ребра `event(new X)`/`X::dispatch()` → подія → listener.

## Критерії готовності

- [x] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [x] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [x] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments

### Реалізовано (2026-10-08)

- **Факти коду.** Laravel пише проводку кодом, тож адаптер читає не текст конфігів, а факти екстрактора PHP (`src/extract/php.ts`, `EXTRACTOR_VERSION` m1.19, після злиття з master — m1.21): атрибути класів і методів (`DeclFact.attributes`), властивості з літеральним значенням (`properties`), типи параметрів (`params`), тіло з одного `return <літерал>` (`returns`), аргументи викликів як літерали (`CallFact.args`: рядок, `X::class`, `X::CONST`, `new X`, масив, closure), ланцюжки (`chain`: `Route::prefix('a')->group(fn)`) і всі closure-аргументи, у яких сидить виклик (`closures`). Інтерфейс адаптера отримав `code(facts, configs)` (`src/frameworks/adapter.ts`); спільне для PHP — `src/frameworks/php-code.ts`.
- **Адаптер** `src/frameworks/laravel.ts`: `detect` — `laravel/framework` у `composer.json` чи `artisan` + `bootstrap/app.php`; `files` — `routes/*.php`, `app/Providers/*.php`, `bootstrap/{app,providers}.php`, `app/Console/Kernel.php` (так `frameworks: []` робить їх дірками `skipped-file`). Прив'язки провайдерів (`bind|singleton|scoped…`, `$bindings`, `$singletons`) і фасадів репозиторію (`getFacadeAccessor` → клас чи ключ контейнера) — `via: "preference"`; щоб `Payment::charge()` пішов прив'язкою, граф (`src/graph.ts`) застосовує прив'язку до статичного виклику класу, який сам методу не має. Маршрути з групами, `resource`/`apiResource`, `/api`; команди, `Artisan::command`, розклад (`Schedule::`, `Kernel::schedule`); `ShouldQueue` → `consumer`; `$listen`/`Event::listen`/`$subscribe` → `observer`. Дірки з причиною: прив'язка до closure, контекстна прив'язка, `'C@m'` без групи контролера, невідома команда в розкладі.
- **Події й черги.** Подій-вузлів `events.*` (тікет 08) у master ще немає, тож ребро йде від fn, що диспатчить (`event(new E)`, `E::dispatch()`, `Event::dispatch(new E)`, `$dispatcher->dispatch(new E)`), прямо на listener (`via: "observer"`, `site` — рядок `$listen`, `owner` — провайдер) і на `handle` job (`via: "dispatch"`, без `owner`). `Via` розширено в `graph.ts`, `flows.ts`, `rules.ts`, `baseline.ts`, `draft.ts`, `emit.ts`; ADR 0022 має уточнення. **Узгодження з 08:** коли `events.*` злиються, `observer` перейде на ребро подія → listener, а fn → подія стане `dispatch` (п. 6 ADR); розстановка ребер — `dispatchEdges` у `src/framework-entries.ts`.
- **Тести:** `tests/frameworks-laravel.test.ts` (6) — точки входу кожного виду, ребра `preference`/`observer`/`dispatch` з `site`/`owner`/`binding`, фасад, дірка closure-прив'язки, флоу `ok` у behavior і `unverified` у shape, K102 через listener і фасад на рядку конфігу, `flows discover` і `coverage`, metamorphic `frameworks: []`.
- **Не зроблено:** автовиявлення listener-ів за типом параметра `handle` (Laravel 11), `withSchedule` у `bootstrap/app.php`, `Route::resources([...])`, фасади фреймворку (ведуть у зовнішні класи пакета — ребер там немає куди класти).
