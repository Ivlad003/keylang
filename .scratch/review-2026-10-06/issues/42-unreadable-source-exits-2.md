# 42: Нечитабельний файл джерела валить map/check з кодом 2

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `emit`, верифікація: confirmed.

**Місце:** `src/map.ts:210` (рецензент указав `src/map.ts:215`)

## Що не так

`readSource` перетворює на null лише ENOENT, а будь-яку іншу помилку прокидає далі. Файл без права читання (EACCES) зупиняє `map`, `map --check`, `check`, а з ними `hook stop`, MCP і LSP для всього репозиторію. Нечитабельну теку натомість спеціально обробляють як дірку з `unverified` (коміт 3524d8d: «made map and check exit 2 for the whole repository»). Для файлів це виправлення неповне.

## Сценарій збою

У репозиторії є `src/app/secret.ts` з правами 000 (наприклад, файл, створений root-ом у Docker-томі). `keylang check` друкує `keylang: EACCES: permission denied, open '…/src/app/secret.ts'` і дає код 2 замість вердиктів. Хук Stop щоходу каже «this turn was not checked», а CI падає з кодом 2. Та сама ситуація з теккою `src/app/locked` (права 000) дає `unverified directory is not readable (EACCES)` і код 0.

## Як відтворити

scratchpad/review/emit/sig: `chmod 000 src/app/secret.ts`; `keylang check` → `keylang: EACCES: permission denied, open …/secret.ts`, check=2; `keylang map --check` → те саме, код 2. Для порівняння `chmod 000 src/app/locked` (тека): `keylang/rules.baseline.md:5:1: unverified directory is not readable (EACCES) (src/app/locked:1:1)`, `0 fail, 1 unverified`, код 0.

Доказ верифікатора:

> I reproduced this at current HEAD (45cc74d) in a fixture at scratchpad/verify/emit-1-0/repo. The fixture has src/app/main.ts, src/app/secret.ts and src/domain/store.ts, and was set up with `keylang init` (HOME and XDG_* pointed at scratch).
> 
> **Before chmod:** `keylang check` printed `0 fail, 0 unverified, 2 ok` and exited 0. `map --check` also exited 0.
> 
> **After `chmod 000 src/app/secret.ts`:**
> - `keylang check` printed `keylang: EACCES: permission denied, open '…/repo/src/app/secret.ts'` and exited 2.
> - `keylang map --check` printed the same message and exited 2. With `--format json` the result was the same.
> - `hook stop`, after a change to main.ts, wrote `{"systemMessage":"keylang: this turn was not checked: EACCES: permission denied, open '…/src/app/secret.ts'"}`.
> - MCP `tools/call search` returned `{"content":[{"type":"text","text":"EACCES: permission denied, open '…/secret.ts'"}],"isError":true}`.
> 
> **For comparison, `chmod 000 src/app/locked` (a directory):**
> - `check` printed `keylang/rules.baseline.md:5:1: unverified directory is not readable (EACCES) (src/app/locked:1:1)` and `0 fail, 1 unverified, 1 ok`, exit 0.
> - `map --check` printed `warning: \`src/app/locked\`: directory is not readable (EACCES); its files are not indexed` and exited 0.
> 
> **Code path:**
> - `src/map.ts:210-217` `readSource` returns null only for ENOENT and rethrows everything else. It was added in 86d8acf for the race where a file is deleted between listing and reading.
> - `generateMap` (`src/map.ts:63`) calls it for every analysed file with no other handling.
> - Only directories get EACCES/EPERM handling (`src/config.ts:541-542`, commit 3524d8d). That fix and docs/format.md («Тека джерел без дозволу на читання не зупиняє аналіз… unverified, не ok») cover directories only. No test covers an unreadable file; `tests/core.test.ts:571` covers only a directory.
> 
> **Docs and review:**
> - No document says an unreadable source file is a code-2 error. docs/cli.md:23 gives code 2 only for an unreadable manifest.
> - The case is not listed in docs/review-2026-10-05.md, so it is not a known open item.
> 
> **Severity:** the failure is loud (code 2 or "not checked"), not a false ok or fail, so P1 does not apply. But one file stops check, map, hook stop and MCP for the whole repository, which is inconsistent with the directory policy, so P2.

## Що зробити

- У generateMap обробляти EACCES/EPERM з readSource як нечитабельну теку: попередження, opaqueFacts і запис skipped-file з source = ID модуля файла, щоб правила ставали unverified, а не код 2; задокументувати у docs/format.md і додати тест поряд із core.test.ts:571.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/map.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
