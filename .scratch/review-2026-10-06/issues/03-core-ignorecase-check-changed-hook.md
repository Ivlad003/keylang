# 03: Перейменування файла лише регістром (core.ignorecase) ховає зміни від `check --changed` і `hook stop`

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `x-cross-platform-fs`, верифікація: confirmed.

**Місце:** `src/git-changes.ts:83` (рецензент указав `src/changed.ts:44`)

## Що не так

git з `core.ignorecase=true` (типово на macOS і Windows) після перейменування `view.ts`→`View.ts` і далі показує зміну як `src/ui/view.ts`, а walkSources бере з диска `src/ui/View.ts`. `filterChanged` порівнює шляхи точним рядком (`changed.has(node.file)`, `changed.has(diag.file)`), тому жоден модуль не вважається зміненим, і всі знахідки цього файла відкидаються.

## Сценарій збою

macOS або Windows: `deny ui db`, закомічений `src/ui/view.ts` без порушення. Агент перейменовує його на `View.ts` (звичне для React-компонентів) і додає `import { query } from "../db/conn"`. `git status` показує ` M src/ui/view.ts`. Повний `check` дає K102 і exit 1, але `check --changed` дає «0 fail, 0 unverified, 0 ok» з exit 0, а `hook stop` повертає `{}` і агента не блокує. Доки хтось не зробить `git mv`, жодна наступна правка цього файла не потрапить у `--changed`, `hook stop` чи `feature`.

## Як відтворити

Фікстура scratchpad/review/cross-platform-fs/f3, яку cf.sh запускає на tmpfs з casefold (`unshare -rm`, `mount -t tmpfs -o casefold`, `chattr +F`). Скрипт run.sh: git init, commit, потім `mv src/ui/view.ts src/ui/tmp.ts && mv src/ui/tmp.ts src/ui/View.ts` і запис імпорту. Вивід: `ignorecase=true` / ` M src/ui/view.ts` / full check: `src/ui/View.ts:1:1: K102 divergence: \`ui.View\` depends on \`db.conn\`` 1 fail exit 1 / check --changed: `0 fail, 0 unverified, 0 ok` exit 0 / hook stop: `{}`.

Доказ верифікатора:

> I reproduced this myself with my own fixture in scratchpad/verify/x-cross-platform-fs-0-0. The fixture has fix/keylang.json with layers ui=src/ui/** and db=src/db/**, keylang/rules.md with `- deny ui db`, src/db/conn.ts, and src/ui/view.ts with no violation. cf.sh copies it onto a case-insensitive tmpfs (`unshare -rm`, `mount -t tmpfs -o casefold`, `chattr +F`) and runs run.sh: git init, commit, `mv view.ts tmp.ts && mv tmp.ts View.ts`, then writes `import { query } from "../db/conn"` into View.ts.
> 
> Observed output:
> ```
> ignorecase=true
> View.ts
>  M src/ui/view.ts
> --- git diff names
> src/ui/view.ts
> --- full check
> src/ui/View.ts:1:1: K102 divergence: `ui.View` depends on `db.conn`, which is denied by `deny ui db` (keylang/rules.md:3)
> 1 fail ... exit 1
> --- check --changed
> 0 fail, 0 unverified, 0 ok
> exit 0
> --- hook stop
> {}
> exit 0
> ```
> 
> Control (run2.sh): the same edit to view.ts without a rename makes `check --changed` report K102 with exit 1. So the false ok comes only from the case mismatch.
> 
> The problem persists after a commit. A case-only rename followed by `git add -A && git commit` leaves `git ls-files` = `src/ui/view.ts`. A later edit to View.ts still gives ` M src/ui/view.ts`, `check --changed` gives "0 fail, 0 unverified, 0 ok" with exit 0, and `hook stop` gives `{}`.
> 
> Code path:
> - `gitChangedFiles` (src/git-changes.ts:83) takes paths from `git diff`. With core.ignorecase=true these keep the case stored in the index.
> - `changedPathSet` (:98) only adds the base-relative form.
> - `filterChanged` (src/changed.ts:44) matches `changed.has(node.file)` and `changed.has(diag.file)` by exact string, while the walker reads `src/ui/View.ts` from disk.
> 
> `stopDecision` (cli.ts ~1053) and `operations/spec.ts:241` use the same chain, and so does `feature-status.ts:340` through `readFeatureBase`→`gitChangedFiles`.
> 
> No doc describes how case-insensitive file systems are handled; ADR 0012 limits only Windows .cmd wrappers to POSIX, and macOS (case-insensitive APFS by default) is in scope. The item is not in docs/review-2026-10-05.md and it is not a regression.
> 
> Severity: P1 by the rubric (false ok from `check --changed` and `hook stop`, and the blind spot does not go away). The trigger is narrow: a case-only rename made with plain mv rather than git mv.

## Що зробити

- У gitChangedFiles/changedPathSet при core.ignorecase=true зводити шляхи git до регістру на диску (realpathSync.native або readdir) чи порівнювати шляхи без урахування регістру в filterChanged.
- Коли git має core.ignorecase=true, зводити шляхи з git до реального регістру на диску (або порівнювати шляхи без урахування регістру) у changedPathSet, щоб filterChanged знаходив модуль; також варто попереджати, коли регістр в індексі git і на диску розходиться (порада: git mv).

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/git-changes.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07 (agent): two regression tests in `tests/cli-feature.test.ts`, both through the real CLI on a temp repository. (1) Emulation on a case-sensitive disk: `core.ignorecase=true` set by hand, then a plain rename `view.ts` → `View.ts` plus the denied import; git then reports ` D src/app/view.ts` and no untracked `View.ts`, and before the fix `check --changed` exited 0 and `hook stop` answered `{}`. (2) The real scenario: a casefold tmpfs mounted in a user namespace (`unshare -rm`, `mount -t tmpfs -o casefold`, `chattr +F`), where `git init` sets `core.ignorecase=true` itself and `git status` shows ` M src/app/view.ts`; the test skips when `unshare -rm` or the casefold mount is unavailable (non-Linux, CI without user namespaces). Fix in `src/git-changes.ts`: when `git config --type=bool --get core.ignorecase` is `true`, `gitChangedFiles` maps every path through `diskCaseResolver(root)` (segment by segment against `readdir`, exact first, then case- and NFC-insensitive; one listing per directory) and drops from `deleted` a path the disk has under another case (a rename, not a removal). Done in `gitChangedFiles` rather than `changedPathSet` so `feature` (`readFeatureBase`) and `code-to-spec --since` callers get it too; `filterChanged` keeps exact matching. The optional stderr warning suggesting `git mv` is not added: `hook stop`'s stderr reaches only a debug log, and `check --changed` already reports the finding at the disk's path. Docs: the `--changed` paragraph of `docs/cli.md`. Verified: `node --test tests/cli-feature.test.ts`, `npm run typecheck`, `node bin/keylang.js check`, `node bin/keylang.js map --check`.
- 2026-10-07 (agent): `docs/review-2026-10-06.md` is untracked in the main checkout only; its ✔ is left to the merger (checkbox not ticked).
