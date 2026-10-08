# 39: Rust-адаптер: `;` у сигнатурі (`[u8; 32]`) — fn вважається без тіла, span не записується

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-trace-adapters-non-python`, верифікація: confirmed.

**Місце:** `adapters/rust/keylang_trace.rs:312` (рецензент указав `adapters/rust/keylang_trace.rs:312`)

## Що не так

`marks()` шукає тіло як перший `{` або `;` у коді від рядка плану, а `;` вважає ознакою fn без тіла. У сигнатурі з масивом — параметр `[u8; 4]`, повернення `-> [u8; 32]`, `F: Fn(&[u8; N])` — першим трапляється `;` всередині типу. Тоді повертається `Mark::None`, ID не потрапляє в `recorded`, і `span("<id>")` у тілі нічого не пише. Документований контракт («instrumented — функції плану, в тілі яких є span("<id>")») порушено: крок стає `unverified … not instrumented`.

## Сценарій збою

Функція `fn digest(data: &[u8]) -> [u8; 4] { let _span = keylang_trace::span("app.main.digest"); … }` — крок потоку checkout, і вона викликається з тригера. Run пише `instrumented: [app.main.checkout, app.main.save]` без digest і без її span. `check` дає `unverified app.main.digest: \`app.main.digest\` is not instrumented`, хоча span стоїть правильно. Таке типове для хешів, криптографії, embedded і числового коду.

## Як відтворити

Фікстура scratchpad/…/rs-array: cargo-крейт з `#[path]`-копією adapters/rust/keylang_trace.rs (через `mod keylang_trace`), fn checkout, digest і save, кожна зі `span(...)`; keylang.json з languages [rust]. Команди: `keylang map`, `keylang trace-plan checkout > plan.json` (digest на рядку 9), `cargo build`, `KEYLANG_TRACE=… KEYLANG_TRACE_PLAN=plan.json KEYLANG_TRACE_TEST=t ./target/debug/app`, `keylang check --format json`. Результат: у події run `"instrumented":["app.main.checkout","app.main.save"]`, span digest відсутній, `unverified app.main.digest | … is not instrumented`, а для checkout і save — ok.

Доказ верифікатора:

> The code path matches the claim. At adapters/rust/keylang_trace.rs:312, `marks()` takes the first CODE byte after the plan line that is `{` or `;`, and returns `Mark::None` when that byte is `;`. Bracket depth is not tracked, so the `;` inside an array type in the signature counts as "the fn has no body". The fn is then never added to `recorded`, and its `span()` writes nothing.
> 
> Repro (HEAD 45cc74d), fixture in scratchpad/verify/x-trace-adapters-non-python-3-0/rs-array:
> - src/main.rs loads the adapter with `#[path=".../adapters/rust/keylang_trace.rs"] mod keylang_trace;`.
> - It has `fn checkout()`, `fn digest(data: &[u8]) -> [u8; 4]` and `fn save(d: [u8; 4])`, each with `let _span = keylang_trace::span("app.main.<name>");`. main calls checkout() and then finish().
> - keylang/flows.md: trigger app.main.checkout, with steps app.main.digest and app.main.save.
> 
> Commands (keylang ran with HOME/XDG pointed at scratch):
>   node .../bin/keylang.js map
>   node .../bin/keylang.js trace-plan checkout > plan.json   # digest line 10, save line 17
>   rustc --edition 2021 -A warnings -o app src/main.rs
>   KEYLANG_TRACE=.keylang/trace/checkout.jsonl KEYLANG_TRACE_PLAN=plan.json KEYLANG_TRACE_TEST="t > @flow checkout" ./app
>   node .../bin/keylang.js check
> Observed: the JSONL holds only the start/end of app.main.checkout, and the run event has "instrumented":["app.main.checkout"]. check prints:
>   flows.md:3:1: trace ok app.main.checkout
>   flows.md:4:3: trace unverified app.main.digest: `app.main.digest` is not instrumented
>   flows.md:5:3: trace unverified app.main.save: `app.main.save` is not instrumented
> Both the return type `-> [u8; 4]` and the parameter `[u8; 4]` trigger it.
> 
> Control (rs-control): same code, but the array type sits behind `type D4 = [u8; 4];` and the signatures use `-> D4` and `(d: D4)`. Result: "instrumented":["app.main.checkout","app.main.digest","app.main.save"], and all three steps are `trace ok`. So the `;` in the signature is the only cause.
> 
> Contract: this breaks docs/cli.md "Адаптер Rust", where `instrumented` is defined as the plan functions whose body contains `span("<id>")` in code. It is not on the docs/review-2026-10-05.md list; item #11 there is a different Rust scanner bug, the `async` one. A side effect: a step like this that was never called also gets `unverified` instead of `trace fail missing step`, which hides real absences. It is not a false ok/fail, so P2 (broken contract / wrong result of one feature) stays.

## Що зробити

- У пошуку тіла в `marks()` рахувати глибину дужок `[`/`(`/`<` і вважати `;` ознакою fn без тіла лише на нульовій глибині (або шукати `;` лише після закриття списку параметрів і типу повернення).

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `adapters/rust/keylang_trace.rs` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: `marks()` (adapters/rust/keylang_trace.rs) шукає тіло як перший `{` чи `;` у коді на нульовій глибині круглих і квадратних дужок, тож `;` типу масиву в сигнатурі (`&[u8; 4]`, `-> [u8; 4]`, `impl Fn(&[u8; 4])`) більше не робить fn безтілесною. Кутові дужки не рахуються: `<` трапляється і в `->`, а `;` усередині generic-аргументів стоїть лише в `[T; N]`. Регресійний тест: tests/review-evidence.test.ts «rust: a `;` inside an array type of the signature …» (через справжні `keylang trace-plan`, `rustc` і `check`; пропускається без `rustc`) — падав на HEAD (`instrumented` лише checkout), зелений після правки. Задокументований контракт не змінився, docs не правились.
