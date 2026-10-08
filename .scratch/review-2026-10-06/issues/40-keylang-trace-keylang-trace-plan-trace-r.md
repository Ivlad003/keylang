# 40: Відносні KEYLANG_TRACE / KEYLANG_TRACE_PLAN розв'язуються пізно: trace пишеться в чужу теку, а Rust-програма падає

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-trace-adapters-non-python`, верифікація: confirmed.

**Місце:** `src/adapters/trace.ts:135` (рецензент указав `src/adapters/trace.ts:136`)

## Що не так

TS-адаптер робить `resolve(file)` у обробнику `exit`, Rust відкриває `tracer.file` у `finish()`, PHP робить `file_put_contents($this->output)` у shutdown. Кожен розв'язує шлях від поточного каталогу на момент виходу, а не на момент старту. Rust до того ж читає `KEYLANG_TRACE_PLAN` і `KEYLANG_TRACE_ROOT` ліниво, при першому `span()`. Приклади в документації використовують відносні шляхи (`KEYLANG_TRACE=.keylang/trace/<flow>.jsonl KEYLANG_TRACE_PLAN=plan.json`). Програма, що змінює cwd (CLI, який переходить у робочу теку, чи тест, що робить chdir у тимчасову теку), або губить trace, або створює `.keylang/trace/` поза репозиторієм. Rust-бінарник з такою програмою падає з panic.

## Сценарій збою

TS: тригер робить `process.chdir("work")`. Trace опиняється в `work/.keylang/trace/f.jsonl`, і `check` дає `unverified … no trace for flow \`f\``. Якщо в репозиторії лишився старий trace того самого знімка, check показує старий вердикт замість поточного. Rust: `main` робить `std::env::set_current_dir("work")` до першого виклику fn потоку. Перший `span()` викликає `init()`, а той — `panic!("keylang trace: plan.json: No such file or directory")`. Програма під тестом завершується з кодом 101, хоча без адаптера працює. Якщо chdir стається після першого span, Rust пише trace у `work/.keylang/trace/checkout.jsonl`.

## Як відтворити

Фікстура scratchpad/…/ts-chdir: main.ts робить `process.chdir("work")` і викликає step. Запуск `KEYLANG_TRACE=.keylang/trace/f.jsonl … node --import src/adapters/trace.ts run.mjs` пише файл за шляхом `./work/.keylang/trace/f.jsonl`, і check дає `unverified app.main.main | … no trace for flow \`f\``. Фікстура rs-array: з `set_current_dir("work")` між checkout() і finish() файл опиняється в `./work/.keylang/trace/checkout.jsonl`; з `set_current_dir("work")` перед checkout() маємо `thread 'main' panicked at src/keylang_trace.rs:252:35: keylang trace: plan.json: No such file or directory (os error 2)` і run=101. PHP оцінено лише з коду: `file_put_contents($this->output, …)` у `finish()`.

Доказ верифікатора:

> I reproduced this myself at HEAD 45cc74d. All fixtures are in scratchpad/verify/x-trace-adapters-non-python-4-0/, with HOME and XDG_* pointed at the scratch dir.
> 
> The docs never say that KEYLANG_TRACE or KEYLANG_TRACE_PLAN must be absolute. The usage headers in adapters/python/keylang_trace.py and adapters/php/keylang_trace.php both show `KEYLANG_TRACE=.keylang/trace/<flow>.jsonl KEYLANG_TRACE_PLAN=plan.json`. The repo's own tests in tests/languages.test.ts:223 and tests/review-evidence.test.ts:388/432 also use relative paths. This issue is not listed in docs/review-2026-10-05.md; the trace items there are about aggregation, quadratic loading, .cjs and instrumented.
> 
> TS fixture (ts/): src/app/main.ts has `main(){ process.chdir("work"); return step(); }`, and flows f.md is `trigger app.main.main / step app.main.step`.
> ```
> KEYLANG_TRACE=.keylang/trace/f.jsonl KEYLANG_TRACE_FLOW=f KEYLANG_TRACE_TEST="run.mjs > @flow f" node --import .../src/adapters/trace.ts run.mjs  -> exit=0
> find -> ./work/.keylang/trace/f.jsonl
> keylang check -> trace unverified app.main.main: no trace for flow `f`; trace unverified app.main.step: no trace for flow `f`
> ```
> Control run with KEYLANG_TRACE=$PWD/.keylang/trace/f.jsonl: `trace ok app.main.main: observed in run.mjs > @flow f`. The cause is src/adapters/trace.ts:135-136, where `resolve(file)` runs inside `process.on("exit")`. The root, by contrast, is resolved at startup on line 41. KEYLANG_TRACE in process.env also stays relative, so a child spawned with a different cwd writes somewhere else too.
> 
> Rust fixture (rs/): src/main.rs includes adapters/rust/keylang_trace.rs via #[path], and checkout() has span("main.main.checkout").
> ```
> control:      run=0, ./.keylang/trace/checkout.jsonl, check: trace ok main.main.checkout
> CHDIR_LATE:   run=0, ./work/.keylang/trace/checkout.jsonl, check: trace unverified main.main.checkout: no trace for flow `checkout`
> CHDIR_EARLY:  thread 'main' panicked at .../adapters/rust/keylang_trace.rs:252:35:
>               keylang trace: plan.json: No such file or directory (os error 2)   run=101
> CHDIR_EARLY without KEYLANG_* env: run=0
> ```
> There is one more variant I found: absolute KEYLANG_TRACE and KEYLANG_TRACE_PLAN, CHDIR_EARLY, and KEYLANG_TRACE_ROOT left at its default ("."). It gives run=0, but the run record has `"instrumented":[]` and check says `trace unverified main.main.checkout: trigger not observed`. This happens because init() at lines 250-260 runs lazily on the first span(). It reads the plan  …

## Що зробити

- Розв'язувати KEYLANG_TRACE, KEYLANG_TRACE_PLAN і KEYLANG_TRACE_ROOT в абсолютні шляхи один раз на старті (у TS одразу в record(), у Rust явним init/ініціалізацією до main або через canonicalize при першому зверненні з cwd старту, у PHP realpath-подібно в конструкторі) і записувати абсолютний KEYLANG_TRACE назад у env для дочірніх процесів.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/adapters/trace.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Відносні `KEYLANG_TRACE`, `KEYLANG_TRACE_PLAN` і `KEYLANG_TRACE_ROOT` розв'язуються один раз від теки запуску й записуються назад у середовище абсолютними. TS (src/adapters/trace.ts): у `record()` при імпорті адаптера; запис іде за цим шляхом, а не `resolve(file)` у момент flush. Rust (adapters/rust/keylang_trace.rs): статичний конструктор до `main` (`.init_array` на ELF, `__mod_init_func` на Apple, `.CRT$XCU` на Windows, через `#[unsafe(link_section)]`, компілюється з `-D warnings` у редакціях 2021 і 2024) запам'ятовує теку запуску й переписує змінні; `init()` теж бере шляхи через неї, тож `set_current_dir` до першого span більше не дає panic, а після — не переносить trace; на інших цілях — тека першого span. PHP (adapters/php/keylang_trace.php): в `install()` (prepend, до скрипта) через `getcwd()` і `putenv`. Той самий дефект був і в Python-адаптері (`open(self.path)` при flush) — виправлено так само через `os.path.abspath` у `main()`. Регресійні тести в tests/trace-adapter.test.ts («… relative KEYLANG_TRACE is the startup directory's …» для TS, Rust, Python, PHP): TS, Rust і Python падали на HEAD (TS писав у `work/.keylang`, Rust завершувався з кодом 101, Python лишав відносний шлях), зелені після правки; PHP-тест пропускається, бо `php` не встановлено, — PHP-правку перевірено лише читанням коду. Документація: docs/cli.md (адаптери TS/JS і Python, на який посилаються Rust і PHP).
