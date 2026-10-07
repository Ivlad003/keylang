# 60: Тека чи битий symlink `*.md` у map/ валить map і map --check

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `emit`, верифікація: confirmed.

**Місце:** `src/map.ts:257` (рецензент указав `src/map.ts:257`)

## Що не так

`extraGenerated` читає `readFileSync` кожен запис каталогу карти, що закінчується на `.md`, і не перевіряє, чи це звичайний файл. Тека з таким іменем дає EISDIR, а symlink на видалений файл — ENOENT. Обидві команди, `map` і `map --check`, тоді завершуються з кодом 2 і нічого не порівнюють і не пишуть.

## Сценарій збою

Хтось лишив у `keylang/map/` symlink `notes.md`, який вказує на вже видалений документ. `keylang map --check` і `keylang map` друкують `keylang: ENOENT: no such file or directory, open '…/keylang/map/notes.md'` і завершуються з кодом 2. Для теки `keylang/map/notes.md/` друкується `EISDIR: illegal operation on a directory, read`.

## Як відтворити

scratchpad/review/emit/sig: `mkdir keylang/map/notes.md`; `keylang map --check` → `keylang: EISDIR: illegal operation on a directory, read`, код 2. `ln -s ../../docs/old-notes.md keylang/map/notes.md`; `keylang map --check` → ENOENT, код 2; `keylang map` → код 2.

Доказ верифікатора:

> I reproduced this myself on a minimal fixture: scratchpad/verify/emit-5-0/proj, one file src/app.ts, set up with `keylang init . --agents=none` and HOME/XDG pointed at scratch. Before the test, `keylang map --check` exits 0.
> 
> Directory case:
> - `mkdir keylang/map/notes.md`, then `node .../bin/keylang.js map --check` prints `keylang: EISDIR: illegal operation on a directory, read` and exits with code 2.
> - `keylang map` exits with code 2 and prints NOTHING.
> 
> Broken symlink case:
> - `ln -s ../../docs/old-notes.md keylang/map/notes.md`, with the target deleted.
> - `map --check` prints `keylang: ENOENT: no such file or directory, open '.../proj/keylang/map/notes.md'` and exits with code 2.
> - `keylang map` exits with code 2 and prints nothing.
> 
> `keylang check` is not affected (0 fail, 1 ok). Once the entry is removed, `map --check` exits 0 again.
> 
> Code path: `src/map.ts:254-259` `extraGenerated` filters `readdirSync(dir)` entries only by name (`e.endsWith(".md") && !files.has(e)`) and calls `readFileSync(join(dir, e))`. It never checks lstat or isFile and has no try/catch.
> - `diffMap` (map.ts:475) calls it. `runMapCheck` (operations/generate.ts:40) calls `diffMap` with no try. The exception goes up to the generic CLI handler, so you get `keylang: <err>`, exit 2.
> - `planMap` (map.ts:380) calls it inside a try in `runMap` (generate.ts:94-98). That try returns `{...empty(...,errorText), payload}`. But `printMap` (src/cli.ts:1184-1190) prints `result.messages` only when `payload === null`, so the error text is lost and `map` exits 2 silently.
> 
> The claim is therefore slightly off for `map`: it says both commands print the error, but `map` prints nothing, which is worse for diagnosis.
> 
> Docs: docs/cli.md lists exit code 2 for map only for a bad manifest or config, or an I/O error part way through the commit. A stray directory or a dangling symlink named *.md in map/ is not documented as a refusal, so this is not intended behaviour. It is not listed in docs/review-2026-10-05.md, and the silent-exit `printMap` defect is not listed there either. The input is unusual, nothing gets written or lost, and the failure is visible through the exit code. That makes it a minor edge case, so P3.

## Що зробити

- У `extraGenerated` брати лише звичайні файли (`lstatSync(...).isFile()`, або `readOrNull` + пропуск null) і не падати на теці чи битому symlink; а в `printMap` друкувати `result.messages` з рівнем error і тоді, коли payload не null.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/map.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
