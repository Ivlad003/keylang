# 47: MERGE, що відкрився сам, перехоплює клавіші, які людина друкує в чат скрепки, і записує спеку

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `tui-new`, верифікація: confirmed.

**Місце:** `src/tui/app.ts:2551` (рецензент указав `src/tui/app.ts:2551`)

## Що не так

`stillWhereStarted` вирішує, чи відкривати MERGE самому після операції-пропозиції (draft flow/rules, code-to-spec, Ctrl+Space, spec-to-code, questions), але не враховує, що вікно чату скрепки має фокус. `MergeSession.open` при цьому знімає фокус з чату (`merge-session.ts:218`), тож наступні літери, які людина вважає текстом повідомлення, стають командами MERGE: `a` приймає шматки, `w` записує файл, `q` виходить, а далі літери йдуть у режим перегляду як команди.

## Сценарій збою

Людина відкрила checkout.md, запустила «Draft flow» (або Ctrl+Space з моделлю) і, поки операція йде, натиснула F7 та почала писати в чат «hello». Операція завершилась, `afterProposal` відкрив MERGE, бо файл, режим і версія буфера ті самі. Людина дописує « can we add a new step»: літери `a` приймають шматки, `w` записує `keylang/flows/checkout.md` на диск. На диску з'являється `# flow buy …`, хоча людина жодного шматка не переглядала. Рядок вводу чату так і лишився "hello", а режим після запису — view.

## Як відтворити

scratchpad/review/tui-new/mergefocus.ts (TMPDIR=$PWD node mergefocus.ts): checkoutRepo, draftForm(trigger application.purchase.buy, name buy, into keylang/flows/checkout.md, algo), одразу F7 і «hello», waitUntil(activeOperation===null), далі набір « can we add a new step». Вивід: `mode now: merge chat focused: false chat open: true`, потім `chat input: "hello"`, `mode after typing: view`, `spec changed on disk: true`, а у файлі дописано `# flow buy / - trigger application.purchase.buy …`.

Доказ верифікатора:

> Reproduced through the real App input path (tests/tui-helpers.ts `session()` builds a real `App` and feeds keys with `app.input`) on a temp copy made by `checkoutRepo`. Nothing under /home/kosmodev/pet_project/keylang was touched.
> 
> Commands (run from scratchpad/verify/tui-new-0-0):
>   HOME=$PWD/home XDG_CACHE_HOME=$PWD/cache XDG_CONFIG_HOME=$PWD/config TMPDIR=$PWD/tmp node mergefocus.ts
>   HOME=$PWD/home XDG_CACHE_HOME=$PWD/cache XDG_CONFIG_HOME=$PWD/config TMPDIR=$PWD/tmp node trace.ts
> 
> Each script does the same steps: run draftForm(trigger application.purchase.buy, name buy, into keylang/flows/checkout.md, algo), press F7, type "hello", wait for activeOperation===null, then keep typing.
> 
> Output of mergefocus.ts:
>   chat focused: true input: "hello"
>   draft done: draft flow: .keylang/proposals/keylang/flows/checkout.md · MERGE: decide the hunks, w writes keylang/flows/checkout.md
>   mode now: merge chat focused: false chat open: true
>   chat input: "hello"
>   mode after typing: view message: null
>   spec changed on disk: true
>   (the file now ends with "# flow buy / - trigger application.purchase.buy ...")
> 
> Output of trace.ts, one key at a time:
>   after op: mode merge focused false merge decisions ["pending"]
>   after 'a': decisions ["accepted"]
>   after 'nw': mode view message merge: 1 of 1 hunk(s) applied and written to keylang/flows/checkout.md; u undoes
>   disk changed: true
> 
> Cause: `afterProposal` (app.ts:2530) opens MERGE when `stillWhereStarted` (app.ts:2547-2551) holds. That check excludes prompt, barrier, help, merge and results, but not `state.clip.chat.focused`. `MergeSession.start` then sets `state.clip.chat.focused = false` (merge-session.ts:218), so the letters the person types for the chat go to MERGE (`a` accepts, `w` writes) and then to view mode.
> 
> Docs: tui.md:57 says MERGE takes the focus from the chat window ("MERGE забирає фокус у вікна"), so the focus change itself is documented. But tui.md:40 says the proposal opens as MERGE only while the session is still where the draft was asked. The code comment on stillWhereStarted says the same: "nothing else is open". Under that rule, an open chat window that has the focus should count as "somewhere else", like a prompt or help. Leaving it out is an oversight, not documented intent. The same path serves Ctrl+Space, where the model takes seconds and opening the chat in the meantime is likely. Every other afterProposal caller (draft rules, code-to-spec, spec-to-code, questions) uses it too.
> 
> Not listed in …

## Що зробити

- Додати `!this.state.clip.chat.focused` до умови `stillWhereStarted`, щоб пропозиція чекала на `m`, коли чат скрепки має фокус, і згадати цю умову в docs/tui.md поряд з «відкрито інший файл…».
- У stillWhereStarted (app.ts:2551) повертати false, коли вікно чату скрепки має фокус (state.clip.chat.focused), щоб пропозиція чекала з повідомленням, а не відкривала MERGE під клавіші чату.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/tui/app.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
