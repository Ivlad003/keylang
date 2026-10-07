# 25: PHP: `insteadof` і `as` у `use` трейтів ігноруються, тож `$this->m()` веде не в той метод трейту

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `langs`, верифікація: confirmed.

**Місце:** `src/extract/php.ts:319` (рецензент указав `src/graph.ts:579`)

## Що не так

`findMember` перебирає трейти класу в порядку `use` і бере перший, де є метод. Блок розв'язання конфліктів `{ A::m insteadof B; B::m as alias; }` `declarationOf` (`src/extract/php.ts:319`) не читає. Тому за `use Quiet, Loud { Loud::hello insteadof Quiet; }` keylang вибирає `Quiet::hello`, хоча PHP виконує `Loud::hello`. Аліас `whisper` стає `unresolved-call`. Документація каже, що метод шукається «як PHP».

## Сценарій збою

`class Greeter { use Quiet, Loud { Loud::hello insteadof Quiet; Quiet::hello as whisper; } function run() { return $this->hello() . $this->whisper(); } }`. Карта: `call app.Greeter.Greeter.run -> app.B.Quiet.hello` (хибне ребро) і `unresolved call this.whisper`. Потік зі `step app.A.Loud.hello` отримує хибний fail, а зі `step app.B.Quiet.hello` — хибний ok.

## Як відтворити

Фікстура scratchpad/review/langs/php1, `keylang map` -> `EDGE call app.Greeter.Greeter.run -> app.B.Quiet.hello 13`, `COV unresolved-call … unresolved call this.whisper`. Сам PHP не встановлено, поведінка PHP взята з мовної семантики `insteadof`.

Доказ верифікатора:

> I reproduced this myself in scratchpad/verify/langs-5-0 with keylang.json {"languages":["php"],"layers":{"app":["src/**"]}}. The fixture has src/A.php with `trait Loud { hello() }`, src/B.php with `trait Quiet { hello() }`, and src/Greeter.php with `use Quiet, Loud { Loud::hello insteadof Quiet; Quiet::hello as whisper; }` plus `run(){ return $this->hello() . $this->whisper(); }`. Every command ran with HOME/XDG_* set to the scratch dir.
> 
> 1) `node .../bin/keylang.js map`: "calls 1 resolved, 0 external, 0 dynamic, 1 unresolved". In .keylang/index.json the call edges are `{"kind":"call","source":"app.Greeter.Greeter.run","target":"app.B.Quiet.hello",...,"text":"this.hello","resolution":"resolved"}` and `{"target":null,"text":"this.whisper","resolution":"unresolved","reason":"unresolved call `this.whisper`"}`. The coverage also has `unresolved-call ... this.whisper`. The map shows `calls app.B.Quiet.hello`. PHP would run Loud::hello because of `insteadof`.
> 
> 2) A false flow verdict. In subdir noalias/, Greeter has only `use Quiet, Loud { Loud::hello insteadof Quiet; }` and `run(){ return $this->hello(); }`, so Quiet::hello is never reachable in PHP. I added keylang/flows/quiet.md (`trigger app.Greeter.Greeter.run`, `step app.B.Quiet.hello`) and loud.md (`step app.A.Loud.hello`), then ran `keylang check`:
> - `quiet.md:3:1: static ok app.B.Quiet.hello: called from app.Greeter.Greeter.run`. This is a false ok.
> - `loud.md:3:1: static unverified app.A.Loud.hello: no resolved path ...; this.hello may dispatch to another hello`. It is unverified, not fail, so the claim's "хибний fail" is wrong. The real path goes unconfirmed, though.
> Note: in the original fixture with the `as whisper` alias, Quiet::hello really is reachable through whisper, so the "ok" there happens to be correct. The false ok only shows up without the alias.
> 
> Cause: src/extract/php.ts:319-327, the `use_declaration` branch, collects only the trait names (classNameOf over namedChildren). It ignores the conflict-resolution block (use_list with insteadof/as), so DeclFact.traits is just a list in `use` order. In src/graph.ts:579, findMember walks classTraits in that order and takes the first trait that has the method. Valid PHP with the same method in two traits always needs `insteadof` (otherwise it is a fatal error), so keylang is wrong whenever `insteadof` picks a trait that is not first in the `use` list.
> 
> Contract: docs/snapshot.md (the PHP paragraph) says `$this->m()` and the others "шукають метод,  …

## Що зробити

- Розбирати use_list у use_declaration: правила `T::m insteadof U` виключають m з U, `T::m as alias` додають alias→T.m. Передавати ці правила у DeclFact і враховувати їх у findMember замість «перший трейт за порядком use».

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/extract/php.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
