# 45: Пропозицію скрепки записано поверх правок, збережених поки модель відповідала

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `ops`, верифікація: confirmed.

**Місце:** `src/tui/clip-chat.ts:392` (рецензент указав `src/tui/clip-chat.ts:392`)

## Що не так

`assistant-reply` дає моделі текст відкритого файла (`request.file.text`), а повертає лише `{path, text}`, без бази, з якої відповідь пораховано. TUI пише пропозицію через `writeProposal(..., { target: existingText(<зараз>) })`, тобто проти диска на момент відповіді. Інші операції, що готують пропозицію (draft-flow, draft-rules, code-to-spec, feature-questions через `commitProposal`), фіксують `before` до запиту до моделі. Якщо ціль змінилася, вони відмовляють з кодом 1 («changed on disk while the candidate was computed»), як вимагає ADR 0008 («підготовлений результат перевіряє актуальність входів»). Скрепка перевіряє лише брудний буфер.

## Сценарій збою

У TUI відкрито keylang/flows/checkout.md, буфер чистий. Людина питає скрепку (F7), модель відповідає блоком ```keylang path=keylang/flows/checkout.md з повним текстом, якого вона бачила. Поки модель відповідає, людина дописує в цей файл рядок `- ? who refunds a failed payment` і зберігає його. Скрепка все одно пише `.keylang/proposals/keylang/flows/checkout.md` без цього рядка і повідомляє «пропозиція: … · m — MERGE». У MERGE видалення щойно збереженого рядка людини виглядає як зміна, яку запропонувала модель, і `a`/`w` по всіх hunk-ах його стирає. draft flow для такої самої цілі відмовив би з кодом 1.

## Як відтворити

scratchpad/review/ops/clip-stale.test.ts використовує tests/tui-helpers.ts: checkoutRepo, withConfig anthropic, mockModel на 127.0.0.1 з затримкою 1500 мс. Сценарій: F7 → «додай оплату» → Enter, чекаємо, поки mock отримає промпт (у промпті `The open file keylang/flows/checkout.md`), записуємо checkout.md з доданим рядком і чекаємо idle. Вивід: `last clip message: "Додав.\nпропозиція: keylang/flows/checkout.md · m — MERGE"`, `proposal exists: true`, `proposal keeps the person's saved line: false`.

Доказ верифікатора:

> I reproduced the bug myself through the real TUI session (App on a VirtualTerminal, with the mockModel Messages stand-in on 127.0.0.1 and nothing sent over the network). My test is scratchpad/verify/ops-1-0/clip-stale-verify.test.ts. It uses checkoutRepo, withConfig anthropic, and a mockModel with an 800 ms or 1500 ms delay that answers with a ```keylang path=keylang/flows/checkout.md block containing PAID.
> 
> Command:
> cd /home/kosmodev/pet_project/keylang && S=<scratch>/verify/ops-1-0 && TMPDIR=$S/tmp HOME=$S/home XDG_CONFIG_HOME=$S/home/.config XDG_CACHE_HOME=$S/home/.cache node --test $S/clip-stale-verify.test.ts
> 
> Scenario A. The target file is saved externally while the model is answering:
> [A] prompt names open file: keylang/flows/checkout.md prompt includes old text only: true
> [A] last clip message: "Додав.\nпропозиція: keylang/flows/checkout.md · m — MERGE"
> [A] proposal contains the saved line: false
> [A] hunk: -["- ? who refunds a failed payment"] +[]
> [A] after a…a w, disk contains the saved line: false
> 
> Scenario B. This is the more realistic path. While the model answers, the person presses F7 to fold the window, then G, i, types the line, presses Ctrl+S and then Esc, all inside the same TUI:
> [B] waiting still: true disk has line after Ctrl+S: true
> [B] last clip message: "Додав.\nпропозиція: keylang/flows/checkout.md · m — MERGE"
> [B] hunk: -["- ? who refunds a failed payment"] +[""]
> [B] after a…a w, disk contains the saved line: false
> 
> Code path. clip-chat.ts:392 calls `writeProposal(state.root, path, text, { target: existingText(join(state.root, path)), proposal: null })`. The basis is read at write time, so the target check in proposalWriteProblem can never fail. assistant.ts builds the prompt from `request.file.text`, but the payload returns only {path, text}, without the base the answer was computed from. The only freshness guard is `isDirty(buffer)`, which does not catch a buffer that was saved while the request was in flight.
> 
> Contrast with the other paths. draft and feature (via commitProposal, operations/shared.ts:141) and code.ts:188 capture `before` before calling the model and refuse with "changed on disk while the proposal was prepared". ADR 0008 says «Підготовлений результат перевіряє актуальність входів перед застосуванням». docs/tui.md («Пропозиції з чату») refuses dirty targets for exactly this reason («пропозиція повернулася б шматками, що їх скасовують»), but it does not cover the saved-meanwhile case. Neither .scratch/tui-clip/spec. …

## Що зробити

- Для цілі, що є відкритим файлом запиту, передавати як basis `target: request.file.text` (текст, який бачила модель), а не existingText на момент відповіді, і відмовляти «змінено на диску, поки модель відповідала». Для інших цілей фіксувати базу ще до запиту.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/tui/clip-chat.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
