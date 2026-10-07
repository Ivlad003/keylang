# 46: Enter у F6 під час MERGE обходить блокування MERGE: підміняє відкрите злиття, лишає «мертвий» режим MERGE і перезапускає записувальні операції

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `tui-core`, верифікація: confirmed.

**Місце:** `src/tui/results-panel.ts:92` (рецензент указав `src/tui/results-panel.ts:112`)

## Що не так

`rerunRecord` не перевіряє `state.mode === "merge"`, хоча `openTarget` і `moveLayers` таку перевірку мають. Через це Enter на записі чернетки викликає `merges.open(target)` поверх відкритого MERGE і мовчки скидає рішення по шматках. `open()` (app.ts:785) кладе в `back` місце з `mode: "merge"`, а `goBack` (app.ts:1266) потім відновлює цей режим без `state.merge`. Enter на будь-якому іншому записі (рядок 127) перезапускає операцію, яку палітра в MERGE відхиляє з причиною `finish the merge first`.

## Сценарій збою

Є пропозиції для checkout.md і b.md. Користувач відкриває MERGE checkout.md і натискає `a` (decisions=[accepted]), потім F6 і Enter на записі draft-flow для b.md. Відкривається MERGE b.md з decisions=[pending], а злиття checkout.md зникає без жодного повідомлення. Далі Esc і Ctrl+O: mode='merge', state.merge=null. Esc, q, i, a, w і клік нічого не роблять, рядок стану показує підказки MERGE; вийти можна лише через Ctrl+P (відкрити файл) або Ctrl+C. Інший випадок: у MERGE палітра «Map: write» відповідає «finish the merge first (Esc cancels it)», але F6 і Enter на попередньому записі map write відкривають крок збереження, і після Enter map write запускається, поки MERGE відкрито. Документація (docs/tui.md, рядок MERGE) обіцяє, що в MERGE працюють лише read-only дії.

## Як відтворити

Скрипти scratchpad/review/tui-core/t2-merge-f6.ts і t6-merge-rerun.ts (App з фікстурою checkout, фальшивий `operations` runner; запуск `node t2-merge-f6.ts`). Вивід t2: `decisions A [ 'accepted' ]` … `after Enter: mode merge merge keylang/flows/b.md decisions [ 'pending' ] back [{"path":"keylang/flows/checkout.md",…,"mode":"merge"}]` … `after Ctrl+O: mode merge merge null` … `after Esc/q/i: mode merge msg null`. Вивід t6: `palette Map: write in MERGE -> Map: write: finish the merge first (Esc cancels it)` … `after Enter: barrier map write mode merge` … `calls [ 'map', 'map' ] mode merge merge keylang/flows/checkout.md`.

Доказ верифікатора:

> I reproduced both cases at current HEAD with my own minimal fixture. It has two flows, a.md and b.md, a proposal for each under .keylang/proposals/, and a fake `operations` runner. It runs the real App with VirtualTerminal and sends real key bytes. ESC_MS is 25, so every key wait is 80ms.
> 
> Commands:
> cd scratchpad/verify/tui-core-0-0
> node repro.ts 1
> node repro.ts 2
> 
> Scenario 1 (a draft-flow record for b.md is in F6; the user opens MERGE a.md with m and presses a, then F6 and Enter):
> after a: {"mode":"merge","merge":{"path":"keylang/flows/a.md","decisions":["accepted"]}}
> after Enter: {"mode":"merge","merge":{"path":"keylang/flows/b.md","decisions":["pending"]},"msg":null} back [..., {"path":"keylang/flows/a.md",...,"mode":"merge"}]
> after Esc: {"mode":"view","merge":null,"current":"keylang/flows/b.md","msg":"merge cancelled; nothing written"}
> after Ctrl+O: {"mode":"merge","merge":null,"current":"keylang/flows/a.md"}
> key Esc/q/i/w/a -> {"mode":"merge","merge":null} (no change)
> The status line still shows "a accept · r reject · u undo · n next · w write · Esc cancel".
> So the MERGE of a.md and its accepted decision vanish with no message, and Ctrl+O then restores a dead MERGE mode with merge=null.
> 
> Scenario 2 (a "map" record is in F6; the user opens MERGE a.md):
> The palette "Map: write" answers "Map: write: finish the merge first (Esc cancels it)" and calls stays ['map'].
> F6 then Enter opens the save step "map write" while mode stays merge. A second Enter gives calls ['map','map'] with mode still merge, and the message is "map write: completed".
> 
> Code path:
> - results-panel.ts:92-127 `rerunRecord` has no `state.mode === "merge"` / `state.merge` check.
> - Its siblings do have one: `openTarget` (results-panel.ts:302), `moveLayers` (app.ts:2781), the palette `merge` action ("already merging", actions.ts:383) and `map`/`feature`/`proposals` (mergeOnly).
> - `merges.open` (merge-session.ts:192) calls `host.open(path)` with remember=true. `open()` (app.ts:785) pushes `mode: this.state.mode` = "merge" into `back`. `start()` then replaces `state.merge`.
> - `goBack` (app.ts:1266) sets `state.mode = place.mode` without restoring `state.merge`, and `merges.key` returns early when `merge` is null.
> 
> Docs: docs/tui.md:34 (MERGE row) says only read-only actions work in MERGE and the rest show the blocking reason. The palette enforces this, but Enter in F6 bypasses it. This is not intended behaviour.
> 
> Impact:
> - Nothing is written incorrectly. The proposal file stays, and in scenario …

## Що зробити

- На початку rerunRecord: якщо state.merge !== null, показати MERGE_REASON і нічого не відкривати й не перезапускати; в open() ніколи не класти mode "merge" у back (зберігати "view").

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/tui/results-panel.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
