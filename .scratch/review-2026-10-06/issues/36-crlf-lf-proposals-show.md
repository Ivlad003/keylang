# 36: CRLF-ціль і LF-пропозиція: `proposals`/`show`/`accept`/`apply_diff` показують заміну всього файла

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `writes`, верифікація: confirmed.

**Місце:** `src/proposals.ts:146` (рецензент указав `src/proposals.ts:146`)

## Що не так

`lineDiff` порівнює рядки з `\r`, тож для цілі з CRLF і пропозиції з LF (так пише агент через MCP і будь-хто на Windows з autocrlf) жоден рядок не збігається. Список, `show`, підсумок `accept` і diff у відповіді `apply_diff` показують усі рядки як видалені й додані. MERGE у TUI зводить обидва боки до LF і показує один шматок, тож CLI-шлях («як MERGE з усіма шматками») дає інший і непридатний для перегляду результат. Запис при цьому коректний: writeAtomic повертає CRLF.

## Сценарій збою

keylang/flows.md з CRLF (5 рядків). Агент через apply_diff додає один рядок `- invariant ...` у LF. `keylang proposals` виводить `keylang/flows.md: +6 -5` замість `+1 -0`, а `proposals show` друкує весь файл як `-` і `+`. У rules.md на сотні рядків людина в безголовому режимі не побачить, що агент, скажімо, прибрав `deny`. TUI для того самого показує один шматок.

## Як відтворити

Копія tests/fixtures/repo, `printf '# flow checkout\r\n\r\n- trigger app.checkout.checkout\r\n  - step domain.order.createOrder\r\n  - step infra.db.save\r\n' > keylang/flows.md`. MCP apply_diff з тим самим текстом у LF плюс `  - invariant an order is saved once\n` повертає diff з усіма `-...\r` і `+...`. `keylang proposals` дає `keylang/flows.md: +6 -5`. `keylang proposals show keylang/flows.md | cat -A` показує 5 рядків `-...^M$` і 6 рядків `+...$`.

Доказ верифікатора:

> I reproduced this in scratch/verify/writes-2-0 using the real CLI and MCP paths.
> 
> Setup: copied tests/fixtures/repo, then `printf '# flow checkout\r\n\r\n- trigger app.checkout.checkout\r\n  - step domain.order.createOrder\r\n  - step infra.db.save\r\n' > keylang/flows.md`.
> 
> 1) MCP. I started `node bin/keylang.js mcp` over stdio (HOME/XDG pointed at scratch) and sent tools/call apply_diff {path:"keylang/flows.md", text:<the same 5 lines in LF + "  - invariant an order is saved once\n">}. Response:
> "diff": "@@ line 1 @@\n-# flow checkout\r\n-\r\n-- trigger app.checkout.checkout\r\n-  - step domain.order.createOrder\r\n-  - step infra.db.save\r\n+# flow checkout\n+\n+- trigger ...\n+  - invariant an order is saved once"
> The proposal file .keylang/proposals/keylang/flows.md is LF.
> 
> 2) `keylang proposals` printed `keylang/flows.md: +6 -5`, exit 0.
> 
> 3) `keylang proposals show keylang/flows.md | cat -A` printed `@@ line 1 @@`, then 5 lines `-...^M$`, then 6 lines `+...$`.
> 
> 4) `proposals accept` on a copy printed `written from ... (+6 -5)`. The file came out correctly in CRLF with the new line (`  - invariant an order is saved once^M$`). The write is fine; only the diff and counts are wrong.
> 
> 5) TUI MERGE on the same pair, via src/tui/merge.ts diffLines(splitEol(disk).text.split("\n"), lf(proposal).split("\n")) as merge-session.ts:113/199 does it, gives ONE hunk: baseStart 5, baseCount 0, lines ["  - invariant an order is saved once"].
> 
> 6) A further consequence the claim does not mention: countDecision (proposals.ts:338) feeds lineDiff into statusesIn. I used a CRLF target with two `<!-- keylang:llm status=draft -->` lines and a proposal that only adds a plain line. `proposals reject` wrote .keylang/stats.json drafts.draft.rejected = 2, where MERGE would count 0. `accept` inflates `accepted` the same way. That breaks "рахують рядки моделі ... як MERGE" (cli.md:137).
> 
> Cause: lineDiff (src/proposals.ts:146) splits on "\n", so every line on the CRLF side keeps its trailing "\r" and never equals a line on the LF side. The TUI normalizes with splitEol/lf (src/tui/disk.ts:29). The CLI and MCP do not: mcp.ts:207, proposalDiff :262, lineCounts :241, countDecision :338.
> 
> Contract: cli.md:137 says accept is "як MERGE, у якому прийнято всі шматки" and the stats count "як MERGE". tui.md:197 says files that are CRLF throughout are treated as CRLF. No doc says that a CRLF/LF difference should show as a whole-file replacement.
> 
> Not listed in docs/review-2026-10-05.md: only fmt  …

## Що зробити

- У lineDiff (або перед кожним викликом) зводити обидва боки до LF так само, як MERGE (splitEol для цілі на диску, lf для пропозиції), щоб diff, лічильники +N -M і stats збігалися з шматками TUI.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/proposals.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
