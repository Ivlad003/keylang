# 64: Довідка поверх редагування: дві клавіші одним чанком вставляються в прихований буфер

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `tui-core`, верифікація: confirmed.

**Місце:** `src/tui/app.ts:423` (рецензент указав `src/tui/app.ts:423`)

## Що не так

Умова злиття чанка у вставку в `input()` не враховує `state.help`, а `handle(paste)` (рядки 1283–1288) теж не перевіряє довідку. У режимі редагування, коли довідка відкрита з палітри («Keys and help»), чанк із ≥2 набраних клавіш (`jj`, утримана `j`, набір у зайнятій сесії) стає вставкою в буфер під довідкою. Одна клавіша при цьому лише гортає довідку, як і задумано.

## Сценарій збою

Користувач натискає `i`, потім Ctrl+P → «Keys and help» → Enter. Довідка накриває редактор, mode='edit'. Утримана `j` приходить чанком "jj". Очікувано довідка мала б прогорнутися. Насправді буфер checkout.md стає "jj# flow checkout…" і позначається як змінений ([+]), а довідка лишається відкритою. Користувач правки не бачить і може зберегти її через Ctrl+S.

## Як відтворити

scratchpad/review/tui-core/t1-help-paste.ts: `help true mode edit` → `s.send("jj")` → `help after true changed: true`, `"jj# flow checkout\n\nCheckout from the ter"`; на кадрі заголовок `keylang/flows/checkout.md [+]` під рамкою `keys · edit`, `dirty: [ 'keylang/flows/checkout.md' ]`.

Доказ верифікатора:

> I reproduced this through the real CLI in a pty, using a fixture under scratchpad/verify/tui-core-1-0. The fixture repo has keylang.json, src/domain/order.ts and keylang/flows/checkout.md. I ran `node /home/kosmodev/pet_project/keylang/bin/keylang.js` from inside the repo through python3 pty.fork, with HOME, XDG_CONFIG_HOME and XDG_CACHE_HOME set to the scratch dir and a 110x30 window. The script is drive2.py, called as `python3 drive2.py $D <mode>`.
> 
> The key sequence was `i`, then Ctrl+P, then "Keys and help", then Enter. Before the test keys the frame showed `keys · edit`, so help was open over the editor. Then the script sent the mode's keys, Esc and Ctrl+S, and read the file from disk.
> 
> - **single** (control): `j` and `j` sent as two separate writes. `[+]` did not appear and the file on disk stayed '# flow checkout\n\nCheckout...'. Help just scrolled, as designed.
> - **chunk**: `jj` sent in one write. The header became `keylang/flows/checkout.md [+]`. After Esc and Ctrl+S the file on disk was 'jj# flow checkout\n\nCheckout.\n\n- step dom'.
> - **bracket**: `\x1b[200~XYZ\x1b[201~` (a real bracketed paste). The disk file became 'XYZ# flow checkout...', so a real paste goes the same way.
> 
> An in-process check (inproc.ts with App and tests/vt.ts) printed `help after jj true unsaved [ 'keylang/flows/checkout.md' ] "jj# flow checkout\n\nC"`. Help stays open and the frame `┌─ keys · edit` covers the editor.
> 
> Cause:
> - app.ts:423: the condition that merges a run of typed keys into one paste checks prompt, completion and results, but not `state.help`. With mode=edit, pastedRun(run, true) always returns true.
> - app.ts:1283–1288: the `paste` branch returns early for results.open, barrier and quit, but not for help. In edit mode it goes on to `this.insert(...)`.
> 
> This contradicts the code's own intent and the docs:
> - chatTakesKeys (clip.ts:115) explicitly counts help as modal.
> - docs/tui.md:27 says help scrolls with ↑↓/PgUp/PgDn and any other key closes it.
> 
> docs/review-2026-10-05.md does not list this. Its item 3 / item 10 covers a different case: a chunk outside edit mode being dropped as "paste". So this is not a regression of a known item.
> 
> Why P3 and not higher: it only happens in edit mode with help opened from the palette, plus a multi-key chunk or a paste. The `[+]` stays visible in the header. Ctrl+S while help is open only closes help, so the change is visible on screen before any save. There is no direct data loss.

## Що зробити

- Додати `!this.state.help` в умову злиття чанка в input(). У handle(paste) при відкритій довідці ігнорувати вставку або закривати довідку, а не вставляти текст у прихований буфер.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/tui/app.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
