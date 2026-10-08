# 66: Після зменшення вікна нижче 60 колонок фокус лишається на панелі, якої не видно, і клавіші йдуть у невидимий список

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `tui-core`, верифікація: confirmed. Регресія виправлення з ✔ у [рев'ю 2026-10-05](../../../docs/review-2026-10-05.md).

**Місце:** `src/tui/app.ts:408` (рецензент указав `src/tui/app.ts:408`)

## Що не так

Виправлення ✔ #5 перевіряє `drawable(panel)` лише в момент F2/F3/F4 і Tab. `resize()` фокус не перевіряє. Якщо панель файлів чи навігації мала фокус до зменшення вікна, після нього `layout()` її не малює, а `j/k/Enter` далі йдуть у `filesKey`/`navKey`, тобто симптом #5 через інший вхід. У `keylang web` розмір змінюється за вікном браузера.

## Сценарій збою

При 120×30 користувач натискає F2 (focus=files), потім вікно зменшується до 50 колонок. layout().files=null і nav=null, але focus='files'. Він натискає `j`, `j`, Enter, очікуючи рух курсора й перехід до коду в редакторі, а натомість невидимий список відкриває інший файл (keylang/rules.md замість keylang/flows/b.md).

## Як відтворити

scratchpad/review/tui-core/t7-resize-focus.ts: `focus files files rect {"x":0,…}` → `app.resize(50,30)` → `after resize: focus files files rect null nav null` → `after j j Enter: current keylang/rules.md`.

Доказ верифікатора:

> I reproduced this through the real terminal transport, not by calling app.resize directly. Script: scratchpad/verify/tui-core-3-0/repro.ts. The fixture has keylang.json, keylang/rules.md, keylang/flows/a.md, keylang/flows/b.md and src/domain/x.ts. The script calls runTerminal(dir, fakeHost) with a stand-in TTY at 120x30. It types F2 (\x1b[12~), sets stdout.columns=50 and emits stdout 'resize' (the same onResize -> app.resize path as terminal.ts:142; web.ts:275 calls the same app.resize). Then it types j, j, Enter.
> Command: cd /home/kosmodev/pet_project/keylang && HOME=<scratch> XDG_*=<scratch> node <scratch>/verify/tui-core-3-0/repro.ts
> Observed output:
>   start: current keylang/flows/a.md focus editor files ["keylang/flows/a.md","keylang/flows/b.md","keylang/rules.md",...]
>   after F2 @120: focus files showFiles true files rect {"x":0,"y":1,"width":24,"height":27} filesIndex 0
>   after resize to 50: cols 50 focus files files rect null nav null
>   after j j: focus files filesIndex 2 cursor {"line":0,"col":0} current keylang/flows/a.md
>   after Enter: current keylang/rules.md ... focus editor
> The screen then shows "keylang · keylang/rules.md VIEW". The editor cursor never moved. Two j presses and Enter went to filesKey in a list that was not drawn, and that list opened a different file.
> Code path: resize() at src/tui/app.ts:407-413 only clamps cols/rows, clears hover, calls keepVisible and draws. It never checks focus. The key dispatch at app.ts:1347-1349 sends keys to contextKey/navKey/filesKey whenever state.focus says so, without checking drawable(). The drawable() guard (app.ts:1514) only runs in toggleFiles/toggleContext (1818/1837) and cycleFocus (1503). layout() hides all side panels below PANEL_MIN_COLS=60 (view.ts:62-63).
> Contract: docs/tui.md:38 says that below 60 columns there are no side panels and focus stays in the editor, "тож клавіші не йдуть у невидимий список". It names F2–F4 and Tab as the mechanism, so the literal contract for those keys still holds. The resize path breaks the stated outcome.
> Review status: this is the same symptom as docs/review-2026-10-05.md TUI item #5 (P2, ✔р), which the fix in commit b5258da covered for F2/F3/F4/Tab only. It is not a strict regression: resize() is byte-identical to 0.5.0 (2f01c9a:src/tui/app.ts:274-280). It is a path the #5 fix missed and is not listed separately in the review. Escape route: Tab works, because cycleFocus gives order=["editor"], indexOf("files")=-1, so focus goes to editor; Esc should als …

## Що зробити

- У resize() після зміни cols/rows: якщо state.focus !== "editor" і !this.drawable(state.focus), повертати фокус у "editor" (або перевіряти drawable() перед маршрутизацією клавіш у contextKey/navKey/filesKey).

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/tui/app.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** Регресійний тест `tests/tui-session.test.ts` («a focused side panel hidden by a resize below 60 columns … (ticket 66)»): при 120×30 фокус на файлах (F2), навігації (Tab) і контексті (F4), `resize(50, 30)`, далі `j j Enter`; на старому коді фокус лишався `files`. Виправлення в `src/tui/app.ts`: `resize()` після зміни розміру повертає фокус редактору, якщо панель у фокусі (files/nav/context) не `drawable()`. Це покриває і термінал (`terminal.ts` onResize), і `keylang web` — обидва йдуть через `App.resize`. Ширшання фокус не повертає на панель (свідомо: людина вже працює в редакторі). `docs/tui.md` («Вузький термінал») доповнено. Перевірки: `node --test tests/tui-session.test.ts` — 112/112, `npm run typecheck` — ок.
