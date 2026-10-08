# 58: map --check вважає CRLF-checkout застарілим, на відміну від baseline і wire

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `emit`, верифікація: confirmed.

**Місце:** `src/map.ts:473` (рецензент указав `src/map.ts:473`)

## Що не так

`diffMap` порівнює файли карти побайтово. Карта, яку checkout на Windows з `core.autocrlf=true` перевів у CRLF, щоразу виходить `stale`. `baseline --check` і `wire --check` таку різницю явно вважають актуальною («файл, що відрізняється лише CRLF (checkout на Windows), вважається актуальним»). Так поводиться навіть стандартний Windows-раннер GitHub Actions: там autocrlf=true за замовчуванням.

## Сценарій збою

CI-матриця з windows-latest робить checkout, і `keylang/map/*.md` отримують CRLF. Тоді `keylang map --check` → `keylang/map/app.md: stale, run \`keylang map\``, код 1, хоча код і карта не змінювались. На тому самому дереві `keylang baseline --check` дає 0.

## Як відтворити

scratchpad/review/emit/sig: `keylang map`; `keylang map --check` → 0; `sed -i 's/$/\r/' keylang/map/app.md keylang/rules.baseline.md`; `keylang map --check` → `keylang/map/app.md: stale, run keylang map`, код 1; `keylang baseline --check` → 0.

Доказ верифікатора:

> I reproduced this at current HEAD with a minimal fixture in scratchpad/verify/emit-3-0/proj. The fixture is a TS package with two files in src/app. I ran `keylang init --agents=none` there, with HOME and XDG_* pointed at scratch.
> 
> 1) Before any change: `keylang map --check` returned 0, and `keylang baseline --check` returned 0.
> 
> 2) `sed -i 's/$/\r/' keylang/map/app.md keylang/rules.baseline.md`. `file` then reports "with CRLF line terminators" for both files.
>    - `keylang map --check` prints "keylang/map/app.md: stale, run `keylang map`" and returns 1.
>    - `keylang baseline --check` returns 0.
>    - `keylang check` prints "0 fail, 0 unverified, 1 ok" and returns 0.
> 
> 3) Same result with a real git checkout. I ran `git init` and a commit with LF files, then `git -c core.autocrlf=true clone proj clone`. In the clone, app.md, rules.baseline.md and main.ts all have CRLF. `map --check` prints "keylang/map/app.md: stale, run `keylang map`" and returns 1. `baseline --check` returns 0.
> 
> Code path: diffMap (src/map.ts:473, called from src/operations/generate.ts:40) compares bytes with `readFileSync(p, "utf8") !== text`. baseline.ts:107 does `current.replace(/\r\n/g, "\n") === text`, and harness.ts:613 (wire) also normalises CRLF.
> 
> Contract:
> - docs/cli.md:84 (wire --check) and cli.md:134 (baseline) explicitly say a file that differs only by CRLF ("checkout на Windows") counts as current. For map --check, no doc has this rule and no doc explicitly declares CRLF stale.
> - docs/tui.md:111 only says that `map` writes exact bytes, so CRLF is not added and the next check sees the map as current. That explains the write side and does not justify flagging a CRLF checkout as stale.
> - llm.txt:68 tells users to run `map --check` in CI. keylang does not generate a .gitattributes, and there is none in src/docs.
> - I found no matching item in docs/review-2026-10-05.md. Item 9 (fmt CRLF churn with autocrlf, P3, fixed) and item 11 (ICU sort order in map --check) are different issues, and this is not a regression.
> 
> Severity: P3, the same as the analogous autocrlf item 9 in the review. It only affects Windows/autocrlf checkouts with no .gitattributes, and there is a standard workaround (`keylang/** text eol=lf`). It is borderline P2 because the command's result is false on every such checkout.

## Що зробити

- У diffMap порівнювати `readFileSync(p, "utf8").replace(/\r\n/g, "\n")` з text (як baseline.ts:107), запис карти лишити точним LF, і задокументувати це в cli.md поруч із baseline/wire.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/map.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** Виправлено. `diffMap` (src/map.ts) порівнює файл карти з диска після `replace(/\r\n/g, "\n")`, як baseline.ts і wire: CRLF-checkout (Windows, `core.autocrlf=true`) — актуальна карта. `map` і далі пише точний LF (`planMap` порівнює побайтово, тож CRLF-файл буде переписано в LF). Задокументовано в docs/cli.md (опис `map [--check]`).

Тест (tests/cli-map.test.ts, справжній CLI): `keylang/map/app.md` у CRLF — `map --check` 0 (до виправлення 1, `stale`); справжня зміна під CRLF — 1; `map` повертає LF. `node --test tests/cli-map.test.ts` — 22/22, `npm run typecheck` — 0.
