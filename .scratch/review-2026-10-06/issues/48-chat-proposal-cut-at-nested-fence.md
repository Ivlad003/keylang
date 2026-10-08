# 48: Пропозиція з чату обрізається на першій вкладеній огорожі коду в специфікації

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `tui-new`, верифікація: confirmed.

**Місце:** `src/operations/assistant.ts:36` (рецензент указав `src/operations/assistant.ts:134`)

## Що не так

`parseReply` закриває блок ```keylang path=``` на першому рядку з ``` усередині тексту файла. Системний промпт велить моделі давати повний файл саме в блоці з трьох бектиків і не просить довшої огорожі, а специфікації можуть мати власні code fence (grammar.md, `Item::Code`). Тому кандидат — це лише початок файла з незакритою огорожею, а решта файла потрапляє в текст відповіді. Ще й відступ огорожі (блок у пункті списку) не знімається з рядків тіла, всупереч CommonMark.

## Сценарій збою

У checkout.md є приклад ```ts … ```. Модель відповідає, як вимагає промпт: ```keylang path=keylang/flows/checkout.md + повний новий текст + ```. У `.keylang/proposals/keylang/flows/checkout.md` записується текст до `checkout();` без закривної огорожі, без `- trigger` і всіх `- step`. Чат показує ці рядки як звичайну відповідь і хвіст ```. MERGE пропонує шматки, що видаляють тригер і кроки потоку. Якщо прийняти всі (a…w), потік втрачає trigger і step, а незакрита огорожа поглинає решту файла.

## Як відтворити

scratchpad/review/tui-new/parse.ts і fence.ts. fence.ts: checkoutRepo з потоком, у якому є ```ts\ncheckout();\n```, mockModel (локальний 127.0.0.1) повертає блок з повним новим текстом, F7, повідомлення, Enter. Вивід: proposal = "# flow checkout\n\nCheckout from the terminal, paid by card.\n\n```ts\ncheckout();\n", а відповідь у чаті містить "- trigger presentation.terminal.checkout\n- step application.purchase.buy…\n```". indent.ts: блок з відступом 3 пробіли дає text "   # flow checkout\n\n   - trigger …".

Доказ верифікатора:

> I reproduced it through the real TUI chat path, using a local mock Messages API on 127.0.0.1 from tests/tui-helpers.ts mockModel. Fixture: checkoutRepo, with keylang/flows/checkout.md overridden so a ```ts / checkout(); / ``` block sits in the prose before the trigger list. Grammar Р15 / Item::Code allows this, and analysis reported no diagnostics for the flow. The model answers exactly as the system prompt says: ```keylang path=keylang/flows/checkout.md, then the full new text (description changed), then ```.
> 
> Command:
> cd .../scratchpad/verify/tui-new-1-0 && TMPDIR=$PWD/tmp HOME=$PWD XDG_CACHE_HOME=$PWD/cache XDG_CONFIG_HOME=$PWD/config node --test fence.test.ts
> 
> Observed:
> - System prompt (assistant.ts:36): "give one fenced block opened with ```keylang path=<file> ... holding the full new text". It never asks for a fence longer than the file's own fences.
> - PROPOSAL text: "# flow checkout\n\nCheckout from the terminal, paid by card.\n\n```ts\ncheckout();\n". The fence is left unclosed, and there is no trigger and no step.
> - CHAT last: "Додав, як платять.\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n  - step domain.order.create\n  - step infrastructure.store.save\n```\nпропозиція: keylang/flows/checkout.md · m — MERGE".
> - m opens MERGE with 2 hunks. After accepting all hunks and pressing w, the file is the truncated text: the trigger and all steps are gone, and the unclosed fence swallows the end of the file. EQUALS intended NEW: false.
> 
> Control: a ````keylang path= block (four backticks) with an inner ```ts block parses correctly. So parseReply itself follows CommonMark (closes() at line 134 is correct). The defect is that the prompt gives the model a fence that cannot hold a spec with its own code blocks, while assistantPrompt's own fenced() already uses a longer fence for the open file.
> 
> Indent sub-claim also reproduced. parseReply("1. Ось:\n   ```keylang path=keylang/flows/a.md\n   # flow a\n\n   - trigger x.y\n   ```") gives proposal.text "   # flow a\n\n   - trigger x.y\n": the fence's indent is not removed from the body lines. This part is minor (P3).
> 
> Contract: docs/tui.md:87/95 and spec §4.5 promise that the first closed block carries the file's full text. Here the proposal is not the full text, so the documented contract is broken.
> 
> This is not a known item: docs/review-2026-10-05.md does not mention parseReply, the clip, or keylang path=.
> 
> Not P1: nothing is written until the person accepts the deletion hunks in  …

## Що зробити

- У системному промпті вимагати огорожу, довшу за будь-яку серію бектиків у файлі (або ~~~~), а в parseReply знімати з рядків тіла відступ відкривної огорожі. Можна ще не брати кандидат, якщо всередині лишилась незакрита вкладена огорожа, і показати в чаті причину.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/operations/assistant.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08:** `assistantSystem` (`src/operations/assistant.ts`) now asks for the candidate in a ````keylang path=<file> fence of four or more backticks, longer than any run in the file, closed with the same fence. `parseReply` closes a candidate at the fence that matches it (`candidateEnd`): for a candidate fence not longer than the file's own, a same-character fence with an info string (````ts`) inside opens a block of the file's own and takes the next closing fence; a nested block left open leaves the candidate unclosed (dropped by path, as an answer cut at the token limit). The opening fence's indent (up to its width) is removed from the body lines, as CommonMark has it. Other fenced blocks keep plain CommonMark. Regressions: `tests/tui-clip-chat.test.ts` «a spec's own code block inside the candidate survives…» (unit, both fence widths, unclosed nested, list-item indent) and the system-prompt rule list; `tests/tui-clip-proposals.test.ts` «a flow with its own code block comes back whole…» through the TUI chat with `mockModel` (127.0.0.1), four and three backticks: the proposal and the file after `w` are the full text (three backticks failed before). docs/tui.md updated (the prompt's fence and how the block closes); `llm.txt` does not describe the clip's block format.
