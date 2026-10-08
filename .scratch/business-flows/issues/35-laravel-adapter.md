# 35: Laravel: container, фасади, маршрути, події, черги, scheduler

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** розбиття тікета 31 (рішення автора 2026-10-07: business-flows — для всіх мов проєкту); [ADR 0022](../../../docs/adr/0022-framework-facts.md); зразок — адаптери `src/frameworks/magento.ts`, `src/frameworks/sfcc.ts`, `src/framework-entries.ts`

## What to build

Адаптер фреймворку (PHP) за інтерфейсом `src/frameworks/adapter.ts`: автовиявлення (залежність у маніфесті + характерні файли), поле `frameworks` у `keylang.json` перевизначає; конфіги — входи знімка; ребра — `call` з `via` і `site`; точки входу — `snapshot.entries`; події — вузли `events.*` (як у Magento, тікет 08); що не прочитано — дірка з причиною, нічого не вгадується з імен.

- **Прив'язки:** `$this->app->bind|singleton|scoped(I::class, C::class)` у service providers, `$bindings`/`$singletons` властивості; фасади (`Cache::get` → `Illuminate\Cache\CacheManager` через `getFacadeAccessor`, лише для фасадів репозиторію та відомого списку фреймворку).
- **Точки входу:** `routes/web.php`/`api.php`: `Route::get('/x', [C::class, 'm'])`, `Route::resource`, групи з `prefix` → `route`; `routes/console.php` + `Kernel::schedule` → `cron`/`cli`; `ShouldQueue` jobs (`handle`) → `consumer`; listeners з `EventServiceProvider::$listen` і атрибутів `#[AsEventListener]` → `observer` + ребра `event(new X)`/`X::dispatch()` → подія → listener.

## Критерії готовності

- [ ] фікстура з типовим шаблоном фреймворку; тести через справжній CLI: точки входу кожного виду, ребра через `via` (behavior ok / shape unverified), `deny` бачить ребра конфігу, `frameworks: []` вимикає (ok/fail → лише unverified, metamorphic)
- [ ] `flows discover` дає флоу для точок входу; `coverage` показує, що лишилось сліпим
- [ ] `docs/snapshot.md` розділ «Фреймворки: …», `llm.txt` один рядок

**Межі:** лише цей фреймворк.

## Comments
