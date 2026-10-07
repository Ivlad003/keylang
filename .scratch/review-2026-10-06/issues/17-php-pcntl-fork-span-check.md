# 17: PHP: pcntl_fork дублює буфер подій і лічильник span, тож check падає з кодом 2

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `x-trace-adapters-non-python`, верифікація: plausible.

**Місце:** `adapters/php/keylang_trace.php:109` (рецензент указав `adapters/php/keylang_trace.php:109`)

## Що не так

Події лежать у `$this->lines` до кінця процесу. `clock` (`php-<pid>-<rand>`) і лічильник `spans` створюються один раз в `install()`. Після `pcntl_fork()` дочірній процес отримує копію буфера, того самого годинника й того самого лічильника. Його `exit()` запускає `register_shutdown_function([$trace,'finish'])` і дописує скопійовані події ще раз. До того ж наступні span дочірнього й батьківського процесів отримують однакові `spanId`. `loadTraces` у такому разі кидає «span … started twice», і `check` завершується з кодом 2. Це той самий клас, що й підтверджений P1 у Python-адаптері.

## Сценарій збою

PHPUnit з `-d auto_prepend_file=keylang_trace.php` і розширенням keylang. Тест викликає тригер, а код усередині форкає процес: spatie/fork, Laravel `Concurrency::driver('fork')` або ручний `pcntl_fork(); … exit(0);`. Дочірній процес на `exit` пише всі буферизовані з початку процесу `start`/`end` (зокрема з попередніх тестів) і свої span `php-<pid>-<rand>:sN`. Батьківський процес наприкінці пише ті самі рядки. Будь-яка наступна `keylang check` чи `feature` падає: `keylang: .keylang/trace/f.jsonl:N: span \`php-…:s1\` started twice in run …`, код 2. Перевірка потоків у CI зламана, доки файл trace не видалено.

## Як відтворити

Не відтворено повністю: PHP у середовищі немає (php відсутній, docker недоступний). Частину споживача відтворено: у фікстурі ts-unicode (повний TS trace) до файла дописано копію першого рядка `start`, тобто те, що записав би форкнутий дочірній процес. Результат `keylang check`: `keylang: .keylang/trace/f.jsonl:6: span \`pid-1853182-a4d22036:s1\` started twice in run \`muwxl1gs-1853182\``, check=2. Код адаптера: годинник обчислюється один раз (рядок 106), shutdown-функцію зареєстровано без перевірки pid (109), `finish()` пише весь `$this->lines` (216–235), і перевірки `getmypid()` немає ніде.

Доказ верифікатора:

> PHP у середовищі немає: `which php` нічого не знаходить, `find` знайшов лише bcc-утиліти, docker повертає «permission denied … docker.sock», php-wasm у кеші npm немає. Тому реальний PHP-шлях запустити неможливо. Код при цьому однозначний (HEAD 45cc74d):
> - `adapters/php/keylang_trace.php:106`: clock `'php-' . getmypid() . '-' . bin2hex(random_bytes(4))` обчислюється один раз в `install()`.
> - `:109`: `register_shutdown_function([$trace, 'finish'])` без перевірки pid.
> - `:150`: `$span = $trace->clock . ':s' . ++$trace->spans`.
> - `:406`: події лише додаються в `$this->lines`.
> - `:225-226`: `$this->lines` скидається у файл тільки у `finish()` (FILE_APPEND). Між тестами PHPUnit буфер не скидається.
> - `getmypid()` ніде повторно не перевіряється.
> 
> Після `pcntl_fork()` дочірній процес отримує копію `$lines`, `$spans`, `$seq`, `$clock`, `written=false` і список shutdown-функцій. На `exit()` PHP викликає shutdown-функції й у дочірньому процесі; це класична поведінка PHP, через яку діти закривають PDO-з'єднання батька.
> 
> Споживача відтворено сам. Фікстура лежить у `scratchpad/verify/x-trace-adapters-non-python-1-0/fx`: PHP-проєкт `Checkout::checkout -> buy -> Order::create/save`, потік `checkout`, `check.trace = .keylang/trace/*.jsonl`. План отримано через `keylang trace-plan checkout`. `phpsim.mjs` — точна JS-модель `install/start/end/record/event/finish` адаптера; `pcntl_fork` у ній змодельовано як `structuredClone` стану. Форк стоїть у `buy` після `create`: дочірній процес викликає `save` і робить `exit(0)`, батьківський продовжує.
> - Контроль без форку: `keylang check` дає «0 fail, 0 unverified, 11 ok», `check=0`.
> - З форком: `keylang: .keylang/trace/checkout.jsonl:8: span \`php-4242-a1b2c3d4:s1\` started twice in run \`1a1123748e9-4242\``, `check=2`. Дочірній процес також дав `s4`, і батьківський теж дав `s4`, тобто колізія лічильника є навіть без дубля буфера.
> 
> Виняток кидає `src/trace-evidence.ts:148`; через `analyze.ts:111` падає весь `check` (і `feature`) з кодом 2, доки файл trace лежить.
> 
> Документація (`docs/cli.md` §Trace) обіцяє, що процеси одного тесту — один запуск і кожен пише свій `run`. Обмеження щодо fork ніде не описано. У `docs/review-2026-10-05.md` цього пункту немає, згадок fork/shutdown там теж немає, тож це нова знахідка, а не регресія.
> 
> Звуження сценарію. spatie/fork, а через нього Laravel `Concurrency::driver('fork')`, за наявності ext-posix, наскільки пам'ятаю, завершує дочірній процес через `posix_kill(getmypid(), SIGKILL)`; shutdown-функції …

## Що зробити

- Зберігати pid з install() і в start()/event()/finish() при зміні getmypid() скидати успадкований $lines, створювати новий clock з новим pid і обнуляти spans/seq/open/stack; або скидати буфер у файл після кожного тесту.
- Запам'ятати getmypid() в install(). У start()/event()/finish() при зміні pid у дочірньому процесі скинути успадковані lines/stack/open/written, створити новий clockId і лічильник span-ів і писати лише власні події та власний run-запис.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо) — тест `php: a process forked with pcntl_fork()…` написано; у цьому середовищі `php` відсутній, тож він пропускається з причиною, а виправлення перевірено міркуванням (див. Comments)
- [x] виправлення в `adapters/php/keylang_trace.php` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07 — `php` у середовищі немає (`which php` порожній), тож регресійний тест `tests/trace-adapter.test.ts` «php: a process forked with pcntl_fork() records only its own events…» (`Work::main` форкає, дитина викликає `crunch(1)` і `exit(0)`, батько чекає й викликає `crunch(2)`; очікування: унікальні `spanId`, два записи `run` з різними `clockId`, `check` не код 2, `crunch` — `ok`) пропускається з причиною «php is not installed» (або «php has no pcntl extension»), і запуститься там, де є `php` з pcntl. Виправлення в `adapters/php/keylang_trace.php` перевірено міркуванням по коду: `$pid` і `$clock` стали полями екземпляра (`newClock()`), і `own()` у `start()`, `end()`, `test()`, `testEnd()` і `finish()` при зміні `getmypid()` скидає успадковані `lines`, `stack`, `open`, `seq`, `spans`, `reached`, `written` і бере новий годинник `php-<pid>-…`; `end()` ігнорує span чужого годинника (функція, в яку батько ввійшов до fork), інакше дитина писала б `end` батьківського `s1` і споживач падав би «ended twice». Події дописуються у файл на кожному `end`, пачками по 64 і в `record()` (під PHPUnit — після кожного тесту) через `flush()` з `FILE_APPEND | LOCK_EX`, тож рядки процесів не перемішуються; запис `run` має `clockId`. Сценарій тікета після виправлення: батько буферизує `start s1 main`; дитина на першому `start` скидає буфер (копія `s1` не пишеться), пише `php-C:s1 crunch` start/end, на `exit()` shutdown → `finish()` → власний `run`; батько пише `s1`, `s2 crunch` і свій `run`; `spanId` не повторюються, «started twice» неможливе. Дитина, вбита `posix_kill(…, SIGKILL)` (spatie/fork), запису `run` не пише — її span-и вже у файлі, і за правилом тікета 16 запуск неповний (`unverified`), не код 2. Споживача (`src/trace-evidence.ts`) перевірено реальними тестами тікетів 16 і 09. Документація: `docs/cli.md` (абзац адаптера PHP). Перевірки: `node --test tests/trace-adapter.test.ts` — 6 pass, 1 skipped (php); `npm run typecheck` — чисто. Повний `npm test` за вказівкою не запускався; `php -l` не доступний.
