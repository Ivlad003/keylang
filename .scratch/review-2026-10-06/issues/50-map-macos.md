# 50: Перейменування шару лише регістром: `map` на macOS пише новий файл карти й тут же видаляє його як застарілий

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `x-cross-platform-fs`, верифікація: confirmed.

**Місце:** `src/map.ts:257` (рецензент указав `src/map.ts:257`)

## Що не так

`extraGenerated` порівнює імена з `readdirSync` із ключами нової карти з урахуванням регістру. Після `Domain`→`domain` план має запис `domain.md` і видалення `Domain.md`. На нечутливій до регістру ФС це той самий файл, тож крок remove видаляє щойно записану карту шару. Exit 0, і в звіті стоїть «written» і «removed».

## Сценарій збою

Шар `Domain` перейменовано на `domain` у keylang.json (або у вгаданому layout перейменовано теку `src/Domain` на `src/domain`). `keylang map` на macOS: `keylang/map/domain.md: written`, `keylang/map/Domain.md: removed`, і тека map/ лишається без файла шару. Якщо закомітити це, на CI `map --check` впаде: `keylang/map/domain.md: stale`. Лише повторний `map` відновлює файл.

## Як відтворити

Фікстура scratchpad/review/cross-platform-fs/m1, run.sh через ./cf.sh: map1 дає `Domain.md`; після sed map2 друкує `domain.md: written` / `Domain.md: removed`, exit 0, а `ls keylang/map` порожній; `map --check`: `keylang/map/domain.md: stale, run \`keylang map\``, exit 1; map3 знову пише файл. На Linux після map2 лишається `domain.md`, і check дає exit 0.

Доказ верифікатора:

> I reproduced this myself at HEAD 45cc74d, on a real case-insensitive filesystem: a tmpfs with casefold, mounted inside an unprivileged user namespace, with `chattr +F` on the project dir.
> 
> Fixture: `scratchpad/verify/x-cross-platform-fs-5-0/fix`. It holds a `keylang.json` with `{"languages":["typescript"],"layers":{"Domain":"src/domain/**"}}` and `src/domain/a.ts`.
> 
> Run: `./ci.sh fix sh run.sh`. It does map, then `sed` Domain->domain, then map, `map --check`, map, `map --check`. Observed:
> ```
> == casefold check: caseprobe
> map1 exit 0
> Domain.md
> keylang/map/domain.md: written
> keylang/map/Domain.md: removed
> map2 exit 0
> ls: total 0   (keylang/map is empty)
> keylang/map/domain.md: stale, run `keylang map`
> check exit 1
> keylang/map/domain.md: written
> map3 exit 0
> domain.md
> check2 exit 0
> ```
> 
> Control: the same `run.sh` on case-sensitive ext4 leaves `domain.md` after map2, and check exits 0.
> 
> Code path:
> - `planMap` (src/map.ts:373-381) first adds a `write` step for `domain.md`. Its `expect` comes from `readOrNull`, which on a case-insensitive FS already reads the old `Domain.md`.
> - `extraGenerated` (src/map.ts:254-258) then compares the `readdirSync` names with `files.has(e)` case-sensitively. So `Domain.md` counts as extra and gets a `remove` step after the write.
> - `commitMap` (src/map.ts:430-432) runs `writeAtomic` and then `rmSync`. Both resolve to the same inode, so the new map file is deleted.
> - `diffMap` (src/map.ts:475) uses the same `extraGenerated`. `planMap` and `diffMap` have one caller, `src/operations/generate.ts`, so the CLI, TUI and MCP all go through this path.
> 
> Docs: docs/semantics.md ("Імена шарів"), docs/cli.md and llm.txt say nothing about case-only layer renames or case-insensitive filesystems. docs/review-2026-10-05.md does not list it; its only near item is #8 on NFC/NFD, which is a different issue. So this is not documented behaviour and not a known open item.
> 
> Severity: P3 holds. It needs a case-only rename on a case-insensitive FS (macOS/Windows by default). The lost file is generated and comes back on the next `map`. But in the meantime `map` exits 0, reports "written", and leaves the map without the layer file, so a commit made then fails on CI.

## Що зробити

- У planMap ставити кроки remove перед write. Або в extraGenerated не вважати застарілим файл, що є тим самим файлом, що й запланований (порівнювати без урахування регістру або за statSync ino/dev).

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/map.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
