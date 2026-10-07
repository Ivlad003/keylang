# 16: Spans, що буферизуються до виходу, губляться при worker.terminate() чи kill дочірнього процесу, а крок стає хибним `fail missing step`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `x-trace-adapters-non-python`, верифікація: confirmed.

**Місце:** `src/adapters/trace.ts:124` (рецензент указав `src/adapters/trace.ts:124`)

## Що не так

TS-адаптер тримає всі події в пам'яті (`lines`) і пише їх лише в `process.on("exit")`. Цей обробник не викликається, коли воркер зупиняють через `worker.terminate()`, коли головний процес робить `process.exit()` при живих воркерах, і коли дочірній процес вбито сигналом SIGTERM/SIGINT. Головний процес за ADR 0018 усе одно вносить у `instrumented` увесь план, «завантажив чи ні». Тому крок, що виконався у втраченому процесі, отримує `trace fail … missing step`, хоча документація (cli.md, «Воркер пише власні корені…») обіцяє `trace unverified`. У Rust і PHP та сама схема: Rust пише лише у `finish()`, PHP — у shutdown-функції, і SIGTERM без обробника pcntl їх пропускає.

## Сценарій збою

Тригер `app.main.main` викликає крок `app.w.inWorker` у worker_threads, як це роблять пули piscina, tinypool чи workerpool, і в кінці викликає `worker.terminate()`. Або e2e-тест запускає `fork()` сервера під адаптером і в кінці робить `server.kill()`. Подій воркера чи дочірнього процесу в trace немає. Run головного процесу має `instrumented` з цим кроком, і `check` дає `fail app.w.inWorker: missing step in t` з кодом виходу 1. Коли той самий воркер чи процес завершується сам, результат правильний: `unverified … observed outside app.main.main in another call tree`.

## Як відтворити

Фікстури: scratchpad/review/trace-adapters-non-python/worker-term та child-kill. keylang.json {languages:[typescript,javascript], layers:{app:"src/app/**"}, check:{trace:".keylang/trace/*.jsonl"}}. Потік: `# flow f / - trigger app.main.main / - step app.w.inWorker` (у другій фікстурі — app.server.handle). main.ts створює Worker, чекає на message і робить `await worker.terminate()`; у child-kill — `fork(server.ts)`, чекає на message і робить `server.kill()`. Команди: `keylang map`, потім `KEYLANG_TRACE=… KEYLANG_TRACE_FLOW=f KEYLANG_TRACE_TEST=t node --import src/adapters/trace.ts run.mjs`, потім `keylang check --format json`. Результат: у файлі trace лише 1 подія `run` (від головного процесу), `fail app.w.inWorker | fail app.w.inWorker: missing step in t`, check=1; для child-kill — `fail app.server.handle: missing step in t`. Контроль, де дочірній процес виходить сам: 2 події `run` і `unverified app.server.handle: observed outside app.main.main in another call tree`. Окремо перевірено, що `process.on('exit')` у воркері не спрацьовує при terminate() і при process.exit() головного процесу.

Доказ верифікатора:

> I reproduced this on HEAD 45cc74d with Node v24.20.0, using fixtures I built in scratchpad/verify/x-trace-adapters-non-python-0-0/{wterm,wself,ckill,cself}.
> 
> Fixture setup:
> - keylang.json: {languages:[typescript,javascript], layers:{app:"src/app/**"}, exclude:["run.mjs"], check:{trace:".keylang/trace/*.jsonl"}}
> - keylang/flows/f.md: `# flow f / - trigger app.main.main /   - step app.w.inWorker` (in the ckill/cself fixtures the step is app.server.handle)
> - wterm: main.ts starts `new Worker(new URL("./w.ts", import.meta.url))`, waits for its message, then runs `await worker.terminate()`. w.ts posts `inWorker()` and stays alive with setInterval.
> - ckill: main.ts runs `fork(server.ts)`, waits for its message, then calls `server.kill()` (SIGTERM).
> - wself and cself are the controls: the worker or child exits on its own.
> 
> Commands, run in each fixture directory with HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME set to the scratch dir:
> ```
> node /home/kosmodev/pet_project/keylang/bin/keylang.js map
> KEYLANG_TRACE=.keylang/trace/t.jsonl KEYLANG_TRACE_FLOW=f KEYLANG_TRACE_TEST=t node --import /home/kosmodev/pet_project/keylang/src/adapters/trace.ts run.mjs
> node /home/kosmodev/pet_project/keylang/bin/keylang.js check
> ```
> 
> Observed output:
> - wterm: the trace file holds only the main process's events, `start app.main.main`, `end`, and `run {"complete":true,"instrumented":["app.main.main","app.w.inWorker"]}`. check prints `keylang/flows/f.md:4:3: trace fail app.w.inWorker: missing step in t` and `1 fail, 1 unverified, 3 ok`, and exits with 1.
> - ckill: the same pattern. check prints `trace fail app.server.handle: missing step in t` and exits with 1.
> - wself (control): there are two run events, one from the worker clock and one from the main clock. check prints `trace unverified app.w.inWorker: observed outside app.main.main in another call tree (root app.w.inWorker): nesting unknown` and exits with 0.
> - cself (control): the same, `trace unverified app.server.handle: observed outside ...`, exit 0.
> 
> Mechanism: src/adapters/trace.ts:72 only pushes each event into `lines`. The file is written only inside `process.on("exit")` (lines 124-136, appendFileSync at :136). Node does not emit that event in a worker stopped by `worker.terminate()`, or in a process killed by SIGTERM without a handler. Since ADR 0018 the main process reports the whole plan as `instrumented`, whether it loaded the file or not, and its `run` is `complete:true`. The worker's span is lost, so the evidence logic t …

## Що зробити

- Писати події в файл одразу (appendFileSync на кожну подію чи на кожен end) замість буфера до exit, а в trace-evidence вважати clockId без власної події `run` неповним запуском (unverified, не missing step); для дочірніх процесів ще й обробити SIGTERM/SIGINT: скинути буфер і повторно надіслати сигнал.
- Писати події в JSONL одразу (appendFileSync на кожну подію або періодичний flush) і додати обробники SIGTERM/SIGINT; у check вважати запуск неповним/unverified, якщо в ньому є процес без власної події `run` (наприклад, головний процес фіксує clockId породжених воркерів і дочірніх процесів), замість `missing step`.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/adapters/trace.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
