# 68: Enter у тому ж чанку, що й набраний текст, не надсилає повідомлення чату, а стає пробілом

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `tui-new`, верифікація: confirmed.

**Місце:** `src/tui/app.ts:423` (рецензент указав `src/tui/app.ts:423`)

## Що не так

Коли чат має фокус, `pastedRun(run, … || chatTakesKeys(state))` вважає вставкою будь-яку серію з двох і більше клавіш в одному чанку. Enter у ній перетворюється на "\n", а `Clip.paste` робить з нього пробіл. Набране «/check⏎», що прийшло одним чанком (SSH із затримкою, завантажена машина, `keylang web`), не надсилається і лишається в рядку вводу з пробілом у кінці, всупереч tui.md («Enter додає рядок в історію»).

## Сценарій збою

Чат у фокусі, термінал доставляє "/check\r" одним чанком. Історія лишається порожньою, а в рядку вводу "/check ". Надсилає повідомлення лише друге натискання Enter.

## Як відтворити

scratchpad/review/tui-new/chunk.ts: session(checkoutRepo), F7, s.send("/check\r"). Вивід: `messages: []`, `input: "/check "`. Після окремого KEY.enter: ["you: /check","clip: ✗ 0  ◌ 4  ✓ 1"].

Доказ верифікатора:

> The claim holds: I reproduced it on the real App session through the project's own test harness.
> 
> Command (all temp dirs in scratch):
> D=scratchpad/verify/tui-new-2-0
> HOME=$D/home XDG_CACHE_HOME=$D/home/.cache XDG_CONFIG_HOME=$D/home/.config TMPDIR=$D/tmp node $D/repro.ts
> The script uses tests/tui-helpers.ts session(checkoutRepo), presses F7 and then sends chunks.
> 
> Observed:
>   A per-key  /check + Enter: messages: ["you: /check","clip: ✗ 0  ◌ 4  ✓ 1"] input: ""
>   B one chunk '/check\r': messages: [] input: "/check "
>   C keys then 'k\r' chunk: messages: [] input: "/check "
>   D '/help\r' one chunk: messages: [] input: "/help "
> Case C is the most realistic one. The person types the keys one by one, and only the last letter arrives together with Enter. That is enough to lose the send.
> 
> Code path at HEAD:
> 1. src/tui/app.ts:423 calls `pastedRun(run, mode==="edit" || chatTakesKeys(state))`.
> 2. pastedRun (app.ts:3492) returns true for any run of more than one key when `editing` is true, and `editing` is true whenever the chat has focus.
> 3. The run is mapped to text, with enter -> "\n".
> 4. handle() (app.ts:1286) passes it to clip.paste(printable(...)).
> 5. Clip.paste (clip.ts:444) turns [\r\n\t] into a space.
> The Enter never reaches Clip.key, so nothing is sent.
> 
> Contract: docs/tui.md:33 and :59 say Enter in the focused chat window sends, and Enter adds the line to the history. tui.md:199 describes the no-bracketed-paste heuristic only for the editor ("у редагуванні — одна правка", where "\n" equals Enter) and for view/MERGE/code/zoom. It does not say the chat gets the editor's every-run-is-paste rule. The comment on pastedRun likewise says "In the editor every run is".
> 
> A partial defence: under the non-editing rule a chunk containing Enter would also count as a paste. So the outcome is close to a composition of documented heuristics, which is why I keep this at P3 rather than P2. It is still a defect, because in the chat a pasted newline and a typed Enter mean different things (space versus send), unlike in the editor.
> 
> Coalesced chunks are realistic. tui.md:199 itself says keys coalesce into one chunk "коли сесія зайнята". Other sources are the in-process doctor or a save, and SSH under latency. For `keylang web` it is less likely, because xterm onData sends one message per key (web.ts:539 -> app.input per message).
> 
> Prior reports: this is not listed in docs/review-2026-10-05.md. The related item #3 (chunked jk/gG in view mode) was fixed and marked ✔, and does not c …

## Що зробити

- Коли фокус у чаті, не зливати серію разом з Enter: текст до Enter вставляти як вставку, а сам Enter (особливо останній у чанку) передавати в Clip.key як надсилання. Або взагалі не застосовувати в чаті правило редактора «кожна серія — вставка».

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/tui/app.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** Регресійний тест `tests/tui-clip-chat.test.ts` («an Enter that ends a chunk of typed keys sends the line … (ticket 68)»): F7, чанк `/check\r` і чанк `k\r` після окремих клавіш надсилають `/check`, рядок вводу порожній; чанк `one\rtwo` лишається вставкою `one two`. На старому коді історія була порожня. Виправлення в `src/tui/app.ts` (`input()`): коли клавіші бере чат, `Enter`, яким закінчується серія набраних клавіш, не входить у вставку і йде окремою клавішею в `Clip.key` (надсилання); `Enter` усередині серії, як і раніше, — текст вставки (`Clip.paste` робить із нього пробіл), щоб багаторядкова вставка без bracketed paste не розсилалася кількома повідомленнями. `src/tui/clip.ts` не змінено. `docs/tui.md` (абзац про вставку без bracketed paste) доповнено. Перевірки: `node --test tests/tui-clip-chat.test.ts tests/tui-clip-window.test.ts` — 20/20, `npm run typecheck` — ок.
