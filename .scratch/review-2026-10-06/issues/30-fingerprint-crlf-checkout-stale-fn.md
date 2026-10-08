# 30: Fingerprint залежить від закінчень рядків: CRLF-checkout робить stale кожну fn з багаторядковим рядком або docstring, а також усіх, хто її викликає

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-stale-manifests-external-ids`, верифікація: confirmed.

**Місце:** `src/extract/treesitter.ts:161` (рецензент указав `src/extract/treesitter.ts:161`)

## Що не так

`fingerprint()` хешує сирий `n.text` листових вузлів. У багаторядкових рядкових літералах (Python docstring, TS template literal, PHP heredoc) цей текст містить `\r\n`, тому той самий коміт після checkout з `core.autocrlf=true` (Windows) дає інший closure. Документ обіцяє, що розкладка fingerprint не змінює. Через closure stale стають і ті, хто таку fn викликає. Пояснення (`explain --stale`) застарівають так само, бо беруть той самий `snapshotBaseline`.

## Сценарій збою

Розробник на Linux/macOS виконує `check --stale --accept`, а CI на Windows-раннері (або колега на Windows) виконує `check --stale --strict`. Кожна Python-функція з багаторядковим docstring і всі, хто її викликає, отримують `stale`, і gate падає з кодом 1, хоча код не змінювався. Після `--accept` на Windows те саме стається вже на Linux.

## Як відтворити

scratchpad/…/crlf2: src/calc.py має `total` з багаторядковим docstring, `plain` без нього і `checkout`, який викликає `total`. Спершу `check --stale --accept`, потім `sed -i 's/$/\r/' src/calc.py`. `check --stale --strict` дає `stale description of main.calc.total`, `stale description of main.calc.checkout`, `2 stale, 0 new, 1 fresh`, exit 1; `plain` лишається fresh. У crlf1 те саме для TS: fn з багаторядковим template literal стає stale.

Доказ верифікатора:

> I reproduced this myself in scratchpad/verify/x-stale-manifests-external-ids-1-0 at HEAD 45cc74d, using only fixture dirs.
> 
> Root cause: src/extract/treesitter.ts:161 hashes the raw leaf text with `hash.update(`${n.type}\u0001${n.text}\u0002`)`. In a multi-line string leaf (Python string_content, TS template literal), that text carries the `\r\n` line endings. Python and ECMAScript both normalize CRLF inside such literals to LF, so the value is the same either way, yet the hash differs.
> 
> 1) Python fixture. keylang.json is `{"languages":["python"],"layers":{"main":["src/**"]}}`. src/calc.py has `total` (multi-line docstring), `plain` (no docstring) and `checkout` (calls `total`). keylang/flows/r.md has three steps, each with a description.
>    - `node bin/keylang.js check --stale --accept` gave 3 new and accepted them.
>    - `check --stale --strict` gave `0 stale, 0 new, 3 fresh`, exit 0.
>    - Then `sed -i 's/$/\r/' src/calc.py` and `check --stale --strict` again:
>      keylang/flows/r.md:3:1: stale description of `main.calc.total`: the code under it changed since it was accepted
>      keylang/flows/r.md:7:1: stale description of `main.calc.checkout`: ...
>      2 stale, 0 new, 1 fresh, 0 incomplete   exit=1
>    `plain` stayed fresh.
> 2) TS fixture: `banner` returns a multi-line template literal; `plain` returns `n + 1`. After CRLF conversion only banner goes stale: `1 stale, 0 new, 1 fresh`, exit=1.
> 3) Real git path. I committed the LF repo with the accepted baseline, then ran `git -c core.autocrlf=true clone` locally (`file` shows `with CRLF line terminators`, `git status` is clean). `check --stale --strict` on the clone gives the same 2 stale and exit=1.
> 
> Contract it breaks: docs/semantics.md §stale says the closure is "normalized syntax ... without comments and layout" and that "reformatting and comments do not" change it. docs/snapshot.md:34 says the same about `fingerprint`. The project explicitly supports autocrlf checkouts: docs/grammar.md:7 and :466 (CRLF files are valid and kept as CRLF), and src/baseline.ts:91-107 compares "CRLF read as LF, as a checkout may have it". So this is not intended behaviour.
> 
> The explain path shares the cause: src/explain-llm.ts:247 compares `snapshotBaseline(snapshot, id) !== brief.closure`, so stored explanations also turn stale. I verified that by code path only, without running an LLM. Item 9 in docs/review-2026-10-05.md is about CRLF in `fmt` (fixed), not fingerprints, so this is new, not a known open item. No test covers  …

## Що зробити

- У fingerprint() перед хешуванням нормалізувати текст листа: n.text.replace(/\r\n?/g, "\n"). Додати тест, що LF- і CRLF-версії файла дають однаковий fingerprint і closure.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/extract/treesitter.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** `fingerprint()` у `src/extract/treesitter.ts` читає текст листа з `\r\n`/`\r` як `\n`, тож багаторядкові рядки, docstring і heredoc дають той самий fingerprint і closure після CRLF-checkout. Регресії: `tests/stale.test.ts` («a CRLF checkout of the same code…», Python + TS через `check --stale --strict`; падав з `3 stale` до виправлення) і `tests/fingerprint.test.ts` (LF і CRLF дають однаковий fingerprint/closure, зміна тексту рядка — ні). `EXTRACTOR_VERSION` не піднято: ключ кешу фактів уже містить хеш коду `src/extract/*` (`extractorCode()` у `src/map.ts`), тож кеш інвалідується сам. Документація: `docs/snapshot.md` §Fingerprint; `docs/review-2026-10-06.md` §2.2 №25 ✔.
