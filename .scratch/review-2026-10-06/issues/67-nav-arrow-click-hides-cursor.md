# 67: Клік по стрілці розгортання в навігації під час редагування ховає курсор, а набір триває

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `tui-core`, верифікація: confirmed.

**Місце:** `src/tui/app.ts:3058` (рецензент указав `src/tui/app.ts:3058`)

## Що не так

Клік у навігацію ставить `state.focus = "nav"` безумовно, хоча для контексту в тому ж обробнику це обмежено режимами view/read. Клік по стрілці батьківського пункту повертається з `navKey(left/right)`, і фокус на редактор не повертається. У режимі edit клавіші далі редагують буфер, бо режим перевіряється раніше за фокус, але `drawEditor` малює курсор лише при `focus === "editor"`.

## Сценарій збою

Користувач натискає `i` (edit) і клікає мишею по стрілці шару `domain` у NAVIGATION. Стан стає mode='edit', focus='nav', grid.cursor=null. Далі він набирає `X`: символ потрапляє на початок рядка 1 checkout.md, але курсора в терміналі не видно, і незрозуміло, куди йде текст. Схожий випадок через палітру («Agent context panel») уже виправлено в ✔ #9, а цей шлях через мишу — ні.

## Як відтворити

scratchpad/review/tui-core/t4-nav-click.ts: SGR-клік у (nav.x+1, рядок пункту `l:domain`) → `mode edit focus nav grid cursor null` → `s.send("X")` → `typed into buffer: X# flow checkout… grid cursor null`.

Доказ верифікатора:

> Відтворено на HEAD 45cc74d через справжній шлях вводу. `terminal.ts:141` і `web.ts:274` обидва передають байти в `App.input`.
> 
> Фікстура: scratchpad/verify/tui-core-4-0/repro.ts. Це тимчасовий репозиторій із keylang.json, двома .ts-файлами та keylang/flows/checkout.md. HOME і XDG_* вказують на scratch. Сценарій: open checkout.md → `i` → SGR-клік у (nav.x+1, рядок шару `l:domain`) → `X`.
> 
> Команда:
> cd /home/kosmodev/pet_project/keylang && timeout 60 node .../verify/tui-core-4-0/repro.ts
> 
> Вивід:
> after i: mode edit focus editor grid cursor {"x":6,"y":1}
> nav {"x":78,"y":1,"width":32,"height":27} parent item 1 layer l:domain depth 0 expanded true
> after click on arrow: mode edit focus nav grid cursor null expanded now false
> after X: buffer head "X# flow checkout\n\n- trigg" changed true editor cursor {"line":0,"col":1} grid cursor null contains ?25h false
> after Esc: mode view focus nav
> 
> Отже, після кліку по стрілці шар згортається, але `focus` лишається "nav". `handle()` у режимі edit іде в `editKey` раніше, ніж перевіряє фокус (app.ts:1344-1349), тому `X` потрапляє в буфер. Водночас `drawEditor` ставить `grid.cursor` лише при `mode==="edit" && focus==="editor"` (view.ts:238). `screen.ts:172` не шле `ESC[?25h`, тож курсор термінала прихований, хоча друк триває.
> 
> Шлях Enter (клік по тексту пункту) не зачеплено: `navKey` на "enter" повертає фокус на editor. Гілка left/right його не повертає.
> 
> Порушено задокументований контракт docs/tui.md:40: «Фокус панель отримує лише в перегляді; у редагуванні… тільки показують чи ховають її, а клавіші й далі йдуть туди ж». Гілка кліку по контексту в тому ж обробнику (app.ts:3048) це обмеження має: `if (mode === "view" || mode === "read") focus = "context"`. Гілка навігації (app.ts:3058) його не має.
> 
> docs/review-2026-10-05.md, TUI #9 (✔р) охоплює лише шлях через палітру («Agent context panel», `:5583`). Цей мишачий шлях там не значиться, тож це нова знахідка, а не регресія. Даних не втрачено: текст іде в рядок, підсвічений як рядок курсора. Тому лишається P3: дрібна UX-неузгодженість.

## Що зробити

- У гілці кліку по навігації (app.ts:3058) ставити `focus = "nav"` лише в режимах view/read, як у гілці контексту, або повертати фокус на editor після navKey(left/right) поза переглядом.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/tui/app.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** Регресійний тест `tests/tui-session.test.ts` («a click on a navigation arrow while editing … (ticket 67)»): `i` → SGR-клік по `▾ domain` → шар згорнуто, `focus` лишається `editor`, `frame().cursor` не null, `X` іде в буфер; у перегляді той самий клік, як і раніше, фокусує навігацію. На старому коді focus ставав `nav`. Виправлення в `src/tui/app.ts` (`mouse()`, гілка навігації): `focus = "nav"` лише в режимах view/read — так само, як у гілці контексту поруч. Клік по тексту пункту не змінено (navKey enter і так повертає фокус редактору). `docs/tui.md` (абзац про фокус панелей) доповнено. Перевірки: `node --test tests/tui-session.test.ts` — 113/113, `npm run typecheck` — ок.
