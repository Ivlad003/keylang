# 38: TS trace: перевантажені функції, CommonJS-експорти й `(…) satisfies T` ніколи не інструментуються

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-trace-adapters-non-python`, верифікація: confirmed.

**Місце:** `src/extract/bodies.ts:34` (рецензент указав `src/adapters/trace-hooks.ts:235`)

## Що не так

Hooks шукають тіло за `line:col` декларації зі знімка (`bodies.get(`${fn.line}:${fn.col}`)`). Але `extract/ts.ts` ставить декларацію не на той вузол, який ключує `bodies.ts`. Для перевантаження це перша сигнатура без тіла. Для `exports.a = function(){}` і `module.exports = function(){}` — `assignment_expression`. Для `module.exports = { b: function(){}, c: () => {} }` — `pair`. Для `const f = ((…) => {…}) satisfies H` / `as H` і React `memo(() => …)` — declarator, тоді як `bodiesOf` дивиться лише на `value.type` без `unwrapValue`. Тіла не знаходяться, і ці кроки потоку мовчки отримують `trace unverified … is not instrumented`. При цьому cli.md обіцяє, що файл CommonJS hooks віддають обгорнутим.

## Сценарій збою

Крок потоку — метод `Svc.run` з двома перевантаженнями, функція `fmt` з перевантаженнями, `exports.a = function () {…}` у `.cjs` або `export const typed = ((x) => {…}) satisfies H`. Тест під адаптером викликає їх усі, але run має `instrumented: ["app.main.main", "app.main.plain"]`, і check показує `unverified app.legacy.a: \`app.legacy.a\` is not instrumented` (так само для b, c, typed і Svc.run). Через батьківський крок, якого не спостережено, вкладений крок `fmt` теж стає unverified. Доказ trace для таких потоків ніколи не з'являється.

## Як відтворити

Фікстура scratchpad/…/ts-forms. legacy.cjs: `exports.a = function () { return 1; };`. legacy2.cjs: `module.exports = { b: function () {…}, c: () => {…} }`. main.ts: `export const typed = ((x: number): number => {…}) satisfies H; export const plain = (x) => {…}`. Потік викликає все це. Результат: `"instrumented":["app.main.main","app.main.plain"]`, `unverified app.legacy.a | … is not instrumented`, так само для legacy2.b, legacy2.c і main.typed, тоді як `ok app.main.plain`. Фікстура ts-overload (перевантажені `fmt` і `Svc.run`): `"instrumented":["app.main.main"]`, `unverified app.main.Svc.run: … is not instrumented`; `keylang explain app.main.fmt` показує `src/app/main.ts:1`, тобто рядок першої сигнатури.

Доказ верифікатора:

> I reproduced this at HEAD 45cc74d, Node v24.20.0. All commands ran in the scratchpad/verify/x-trace-adapters-non-python-2-0/{forms,overload} folders, with HOME and the XDG dirs pointed at the scratchpad. Both fixtures use `keylang.json` {languages:[typescript,javascript], layers:{app:"src/app/**"}, exclude:["run.mjs"], check:{trace:".keylang/trace/*.jsonl"}}.
> 
> The `line:235` in the claim is stale: trace-hooks.ts has 138 lines now, and the lookup is at line 66, `bodies.get(`${fn.line}:${fn.col}`)`.
> 
> **Commands** (the same as tests/review-evidence.test.ts `traced`): `node $K/bin/keylang.js map`, then `env -u KEYLANG_TRACE_RUN KEYLANG_TRACE=.../f.jsonl KEYLANG_TRACE_FLOW=f KEYLANG_TRACE_TEST=t node --import $K/src/adapters/trace.ts run.mjs`, then `node $K/bin/keylang.js check`.
> 
> **forms fixture**
> - `legacy.cjs` has `exports.a = function () {…}`.
> - `legacy2.cjs` has `module.exports = { b: function(){…}, c: () => {…} }`, imported through the default import.
> - `main.ts` has `typed = ((x)=>{…}) satisfies H`, `asd = ((x)=>{…}) as H`, `plain = (x)=>{…}`, and `main` calls all of them.
> 
> The run exits 0. Observed:
> ```
> "event":"run","complete":true,..."instrumented":["app.main.main","app.main.plain"]
> trace ok app.main.main: observed in t
> trace unverified app.legacy.a: `app.legacy.a` is not instrumented
> trace unverified app.legacy2.b: `app.legacy2.b` is not instrumented
> trace unverified app.legacy2.c: ... is not instrumented
> trace unverified app.main.typed: ... is not instrumented
> trace unverified app.main.asd: ... is not instrumented
> trace ok app.main.plain: observed in t
> ```
> 
> **overload fixture**: `fmt` has 2 signatures plus an implementation, `class Svc { run(x:number); run(x:string); run(x){ return fmt(x) } }`, and `main` calls `new Svc().run(1)`.
> ```
> "instrumented":["app.main.main"]
> trace unverified app.main.Svc.run: `app.main.Svc.run` is not instrumented
> trace unverified app.main.fmt: parent step `app.main.Svc.run` not observed
> ```
> `explain app.main.fmt` prints `src/app/main.ts:1`. In index.json `fmt` is at 1:8, the first signature, while the body is at 3:8.
> 
> **Cause in the code**
> - `bodies.ts` `bodiesOf` (lines 34-61) keys a body only by the function node itself, or by `variable_declarator`/field when `value.type` is a function. It does not call `unwrapValue`, and it has no key for an `assignment_expression` or a `pair`.
> - `ts.ts` puts the declaration on a different node:
>   - `decl(..., d, ...)` on the declarator after `unwrapValue`/`reactWrapperFn` (ts.ts:264-26 …

## Що зробити

- Ключувати тіла в bodiesOf за тими самими вузлами, що й decl у ts.ts: unwrapValue і reactWrapperFn для value, assignment_expression/pair для CommonJS, тіло реалізації для перевантажень (або брати з extract позицію тіла). Плюс попередження в плані, коли тіла не знайдено.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/extract/bodies.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
