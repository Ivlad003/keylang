# 65: Bracketed paste мовчки губиться під час редагування цілі знахідки з F6

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `tui-core`, верифікація: confirmed.

**Місце:** `src/tui/app.ts:1284` (рецензент указав `src/tui/app.ts:1284`)

## Що не так

Поки показано ціль знахідки (`results.viewing`), панель F6 прихована, а клавіші за документацією йдуть у редактор. Проте `handle(paste)` повертається на `this.state.results.open`, який під час viewing лишається true. Тому bracketed paste відкидається без жодного повідомлення, хоча окремі клавіші й чанк із кількох клавіш у той самий буфер вставляються.

## Сценарій збою

Флоу з `- step application.purchase.nope` дає знахідку K001. Користувач натискає F6, Enter на знахідці (відкривається checkout.md, viewing=true), потім `i` (mode edit) і `x`: символ вставлено. Далі він вставляє з буфера обміну (`\x1b[200~PASTED\x1b[201~`): текст не вставлено, повідомлення немає (message=null). Чанк `yz` без bracketed paste при цьому вставляється.

## Як відтворити

scratchpad/review/tui-core/t5-viewing-paste.ts: `viewing true current keylang/flows/checkout.md … mode view` → `mode after i edit` → `single key typed: true` → `bracketed paste inserted: false message: null` → `2-key chunk inserted: true`.

Доказ верифікатора:

> I reproduced it on the real App path: a session on a virtual terminal, with input sent through app.input, so the bytes go through the terminal decoder. I did not reuse the claimant's script.
> 
> Fixture: checkoutRepo with the flow step changed to `application.purchase.nope`. The script is scratchpad/verify/tui-core-2-0/repro.ts. Command:
> `cd .../scratchpad/verify/tui-core-2-0 && TMPDIR=$PWD HOME=$PWD/home XDG_CACHE_HOME=$PWD/cache XDG_CONFIG_HOME=$PWD/config timeout 60 node repro.ts`
> 
> Observed output:
> ```
> panel lines: ['✗ K001 keylang/flows/checkout.md:6:8 dangling reference `application.purcha ...']
> open true viewing true current keylang/flows/checkout.md mode view
> mode after i: edit
> single key typed: true
> bracketed paste inserted: false changed: false message: null open true viewing true mode edit
> 2-key chunk inserted: true changed: true
> after F6: open false viewing false mode view
> control (panel closed) paste inserted: true changed: true
> ```
> 
> Code: in src/tui/app.ts:1284, the paste branch of handle() is `if (this.state.results.open || this.state.barrier || this.state.quit) return;`. It returns before the edit-mode `this.insert(event.text)` and also before `pasteRefusal`, so nothing is inserted and no message is shown.
> 
> The key path handles this case differently. At :1314-1321, while `results.viewing` is true, keys fall through to the editor. mouse() at :2997-2998 also checks `results.open && !results.viewing`, with the comment "While a finding's target is shown (viewing), the keys and the wheel go to it instead." Only the paste branch leaves out the viewing check.
> 
> Contract: docs/tui.md describes the F6 finding and says Esc in edit mode leaves editing first. So editing the target is intended, and the code comment says the keys go to the editor or code viewer. No doc says paste is blocked during viewing.
> 
> Known items: docs/review-2026-10-05.md does not list this. Its paste entries (line 22 and item 3 at line 122) are about multi-key chunks outside edit mode, not this case.
> 
> Severity: P3 is right. Nothing is lost or written wrongly; the paste just does nothing and gives no feedback, and it only happens in this narrow state. Pasting works again after F6 closes the panel.

## Що зробити

- У гілці paste в handle() відкидати вставку лише при `results.open && !results.viewing`, як у mouse(), щоб під час перегляду цілі знахідки вставка йшла в редактор або давала pasteRefusal.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/tui/app.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** Регресійний тест `tests/tui-session.test.ts` («a bracketed paste while editing a finding's target … (ticket 65)»): K001 → Enter (viewing) → `i` → `\x1b[200~PASTED\x1b[201~`; на старому коді текст не вставлявся. Виправлення в `src/tui/app.ts`: гілка `paste` у `handle()` відкидає вставку лише при `results.open && !results.viewing` (як `mouse()`); та сама умова — у злитті чанка в `input()`, щоб під час перегляду цілі чанк ішов тим самим шляхом, що й без панелі (у редагуванні — одна правка, у перегляді — правило «поза редагуванням»). Тест також перевіряє, що над видимим списком вставка, як і раніше, нікуди не йде. `docs/tui.md` (панель F6) доповнено. Перевірки: `node --test tests/tui-session.test.ts tests/tui-check.test.ts` — 134/134, `npm run typecheck` — ок.
