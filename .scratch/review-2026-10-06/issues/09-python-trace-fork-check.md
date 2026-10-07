# 09: Python trace-адаптер не обробляє fork: кроки в процесі-воркері губляться або check падає з кодом 2

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `langs`, верифікація: confirmed.

**Місце:** `adapters/python/keylang_trace.py:235` (рецензент указав `adapters/python/keylang_trace.py:235`)

## Що не так

Адаптер не реєструє `os.register_at_fork`. Дочірній процес після fork успадковує колбеки `sys.monitoring`, `clock`, лічильник span-ів і вже накопичені `lines`. Воркер `multiprocessing` (fork, типово на Linux для Python 3.12) виходить через `os._exit`, тож `atexit` не спрацьовує і його span-и мовчки зникають. Батьківський процес при цьому пише `instrumented` з цим кроком і `complete: true`. Дочірній процес після `os.fork()`, що завершується звичайно, дописує копію подій батька з тими самими `spanId`.

## Сценарій збою

(1) `main()` викликає `Pool(1).map(crunch, …)`, потік `trigger app.main.main / step app.work.crunch`. Після запуску під адаптером `keylang check` дає `trace fail app.work.crunch: missing step in run.py > @flow crunch`, exit 1, хоча `crunch` виконався (вивід `[2, 4]`). (2) `main()` робить `os.fork()`, і обидва процеси викликають `crunch`. `keylang check` завершується кодом 2: `.keylang/trace/crunch.jsonl:6: span py-…:s1 started twice in run …`. Падає вся перевірка, не лише цей потік.

## Як відтворити

Фікстури scratchpad/review/langs/pytrace (Pool) і pytrace2 (os.fork). `keylang trace-plan crunch > plan.json; KEYLANG_TRACE=.keylang/trace/crunch.jsonl KEYLANG_TRACE_PLAN=plan.json KEYLANG_TRACE_TEST='run.py > @flow crunch' python3 adapters/python/keylang_trace.py run.py; keylang check`. pytrace: у JSONL лише start/end `app.main.main` і run з `instrumented:[app.main.main, app.work.crunch]`; check: `trace fail app.work.crunch: missing step`. pytrace2: JSONL містить два комплекти з однаковими spanId s1/s2; check: `span ... started twice`, exit 2.

Доказ верифікатора:

> Відтворено на поточному коді, з власними фікстурами в scratchpad/verify/langs-1-0/{pool,fork,pool-probe}. Середовище: Python 3.12.3, для якого `multiprocessing.get_start_method()` дає `fork`; Node 24.20.0.
> 
> Фікстура: keylang.json `{"languages":["python"],"layers":{"app":["app/**"]},"exclude":["run.py"],"check":{"trace":".keylang/trace/*.jsonl"}}`, keylang/flows.md `# flow crunch / - trigger app.main.main / - step app.work.crunch`, app/work.py `def crunch(x): return x*2`, run.py `print(main())`.
> 
> Команди (у кожній теці, HOME, XDG_* вказують на scratch):
> `node $K/bin/keylang.js map; node $K/bin/keylang.js trace-plan crunch > plan.json; KEYLANG_TRACE=.keylang/trace/crunch.jsonl KEYLANG_TRACE_PLAN=plan.json KEYLANG_TRACE_TEST='run.py > @flow crunch' python3 $K/adapters/python/keylang_trace.py run.py; node $K/bin/keylang.js check`
> 
> (1) pool, де `main()` викликає `with Pool(1) as pool: return pool.map(crunch,[1,2])`. Скрипт виводить `[2, 4]`, тобто crunch виконався. У JSONL лише start і end `app.main.main` та `run` з `complete: True` і `instrumented: ['app.main.main','app.work.crunch']`. `check` друкує: `keylang/flows.md:4:3: trace fail app.work.crunch: missing step in run.py > @flow crunch` / `1 fail, 1 unverified, 3 ok`, код 1. Статика тут дає `unverified` (через `pool.map`), тож хибний fail вирішує саме trace. Без trace той самий check дає 0 fail і код 0.
> 
> (2) fork, де `main()` робить `os.fork()`, а дочірній процес викликає `crunch(1)` і повертається звичайно. JSONL містить два однакові комплекти s1/s2 з тим самим clockId `py-1785792-e1ae5db0` і двома подіями `run`. `check` друкує `keylang: .keylang/trace/crunch.jsonl:6: span \`py-1785792-e1ae5db0:s1\` started twice in run \`1a112103256-1785792\``, код 2. Інших результатів немає, тобто падає вся перевірка. Помилка кидається в src/trace-evidence.ts:148.
> 
> (3) pool-probe, де після map викликається `pool.apply(flush)`, а flush примусово запускає `atexit._run_exitfuncs()` у воркері. JSONL показує, що воркер тримає в пам'яті span-и crunch s2 і s3 з тим самим годинником, а також успадковану від батька подію start s1. Отже, монітор після fork працює в дочірньому процесі, а події губляться лише тому, що `popen_fork.Popen._launch` завершує воркер через `os._exit(code)`, і atexit не виконується. Наївний flush у дочірньому процесі теж дасть `started twice`.
> 
> Причина в коді: у adapters/python/keylang_trace.py немає `os.register_at_fork`. Рядок 83 задає `clock` один раз на pid батька, рядки 84–89 тримають спільні `lines`,  …

## Що зробити

- Зареєструвати os.register_at_fork(after_in_child=…): у дочірньому процесі брати новий clockId і очищати lines, open, spans і стеки потоків. Скидати JSONL дочірнього процесу не лише через atexit, а й через multiprocessing.util.Finalize або обгортку os._exit. Інакше задокументувати, що fork-процеси не трасуються, і давати unverified замість missing step.
- Зареєструвати os.register_at_fork(after_in_child=...): у дочірньому процесі скидати lines/open/spans/стеки й давати новий clockId (новий pid). Події писати потоково або flush-ити через multiprocessing.util.Finalize, бо воркер виходить через os._exit і atexit не спрацьовує.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `adapters/python/keylang_trace.py` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07 — відтворено тестами `tests/trace-adapter.test.ts` («python: a step run in a forked multiprocessing worker…» — на HEAD у файлі лише події батька, крок `fail missing step`; «python: a process forked with os.fork()…» — дочірній процес із `sys.exit(0)` дописував копію батьківських подій, `check` падав з кодом 2 «started twice»). Виправлення в `adapters/python/keylang_trace.py`: події дописуються у файл на кожному `end` і пачками по 64 рядки (`flush`), запис `run` має `clockId` і пишеться один раз (`written`); `os.register_at_fork(after_in_child=tracer.forked)` у дочірньому процесі скидає стан (`reset`: новий `py-<pid>-…`, порожні `lines`/`open`/стеки, нові `Lock` і `threading.local`, лічильники з нуля), тож `end` успадкованого кадру `main` не пишеться (стек порожній), а span-и дитини — корені. Запис `run` дитини: `atexit` (успадкований) для звичайного виходу; для воркера `multiprocessing`, що виходить через `os._exit`, — `multiprocessing.util.Finalize(None, finish, exitpriority=-1)`. Нюанс: `Process._bootstrap` очищає успадкований `_finalizer_registry` одразу після fork і лише потім запускає after-fork хуки, тож `Finalize` з `after_in_child` губився; він реєструється через `multiprocessing.util.register_after_fork` (лише коли `multiprocessing.util` уже імпортовано). Перевірено: пул із `close()`/`join()` дає два записи `run` на різних годинниках і `unverified … observed outside app.main.main`; `with Pool(1)` закінчується `terminate()` (SIGTERM воркеру), і залежно від гонки запис `run` воркера є або ні — в обох випадках `unverified`, не `fail` і не код 2 (без запису — «incomplete trace (1 process ended without its run record)» за правилом тікета 16). Документація: `docs/cli.md` (абзац адаптера Python: потоковий запис, fork, `spawn` не трасується). У цей коміт також входить перегенерована карта `keylang/map/{check,cli}.md` і `keylang/map-explained/{check,cli}.md` (зсув рядків `src/trace-evidence.ts` і `src/adapters/trace.ts` після тікета 16); решта stale-позначок `map --check` (tui, features, operations, map, README) не пов'язана з цими тікетами й не чіпалася. Перевірки: `node --test --test-name-pattern=python tests/trace-adapter.test.ts tests/review-evidence.test.ts` — 3 pass; `npm run typecheck` — чисто; `node bin/keylang.js check` — 0 fail, код 0; `node bin/keylang.js map --check` — код 1 через сторонні stale-пояснення (див. вище). Повний `npm test` за вказівкою не запускався.
