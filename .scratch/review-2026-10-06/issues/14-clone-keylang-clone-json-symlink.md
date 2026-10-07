# 14: `clone` пише маркер `.keylang/clone.json` крізь symlink `.keylang` з клонованого репо

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `cli`, верифікація: confirmed.

**Місце:** `src/clone.ts:106` (рецензент указав `src/clone.ts:106`)

## Що не так

syncClone записує маркер через `writeAtomic(join(dir, CLONE_MARKER))` без `writeProblem`/`landing`. writeAtomic робить mkdir, а тоді тимчасовий файл і rename у `dirname`, тобто йде за посиланням `.keylang`, яке закомітив чужий репозиторій. Решта записів у `.keylang/` (index, facts) таке посилання відхиляє.

## Сценарій збою

Репо з закоміченим `.keylang -> /будь-яка/тека` (чи відносним `../../../../../..`) після `keylang clone <url>` створює або перезаписує файл `clone.json` у цій теці поза клоном і кешем. Під час наступних оновлень маркер читається звідти ж.

## Як відтворити

Той самий фікстур evil з `.keylang -> $S/outside/kl`, де лежить лише keep.txt. Після `keylang clone ./evil` з'являється `outside/kl/clone.json` з `{"url": "…/evil", "key": ["local","evil-c0234be3"]}`. Водночас `.keylang/index.json: leads out of the repository through a link`, тобто map такий запис відхиляє.

Доказ верифікатора:

> Code path at HEAD: `src/clone.ts:106` runs `writeAtomic(join(dir, CLONE_MARKER), ...)` straight after `git clone`. It never calls `writeProblem` or `landing`. `writeAtomic` (`src/safe-write.ts`) calls `mkdirSync(dirname(abs), {recursive:true})`, which accepts an existing symlink to a directory. It then writes `.clone.json.<pid>.<hex>.tmp` in `dirname(abs)` and does `renameSync` over `abs`, so both steps follow a committed `.keylang` symlink. The other writers into `.keylang/` do check: `fact-cache.ts:265` and `map.ts:406` call `writeProblem`. The only caller is `prepareClone` (`src/cli.ts:516`), which serves both `clone` and `web <url>`.
> 
> Repro 1, absolute link. Fixture in $S=scratchpad/verify/cli-2-0: `git init evil`, `ln -s $S/outside/kl .keylang`, commit. `$S/outside/kl` held only keep.txt.
> Command: `cd $S && HOME=$S/home XDG_CACHE_HOME=$S/cache XDG_CONFIG_HOME=$S/config node /home/kosmodev/pet_project/keylang/bin/keylang.js clone ./evil`
> Output: `.../cache/keylang/repos/local/evil-d0470c06: cloned from .../evil`, exit=2 (no source files). Afterwards `ls $S/outside/kl` shows `clone.json` next to `keep.txt`, with content `{"url": ".../evil", "key": ["local","evil-d0470c06"]}`.
> 
> Repro 2, relative link that overwrites an existing file. `$S/outside/victim/clone.json` held `ORIGINAL`. Repo evil2 had `.keylang -> ../../(x18)..$S/outside/victim` and `a.ts`. Running the same `clone ./evil2` printed `.keylang/index.json: leads out of the repository through a link` and `.keylang/cache/facts.json: leads out of the repository through a link`, then exit=1. So map rejects the link, but `outside/victim/clone.json` had already been replaced with the clone's `{url,key}` JSON. `ORIGINAL` is gone, which is data loss outside both the clone and the cache.
> 
> Docs: docs/cli.md#clone only says the clone has a `.keylang/clone.json` marker. It does not allow writing through links, and the safe-write.ts header promises one protocol for every write into a repository. docs/review-2026-10-05.md does not list this item. It names other writers outside the protocol (fmt, init config, export c4, apply_diff), but not the clone marker, so this is new rather than a known open item. Impact is limited: the file name is fixed (`clone.json`) and the content is fixed JSON. Still, a committed link creates or overwrites a file in any directory the user can write, which the rubric counts as P1 (write outside allowed targets, data loss). One more thing outside this claim: `enableExplainedMap` (`clon …

## Що зробити

- Писати маркер через `safeWrite(dir, CLONE_MARKER, …, {under: ".keylang"})` (або перевіряти `writeProblem` і писати в `landing`) й відмовляти, якщо клон містить symlink `.keylang`; так само читати маркер у `readMarker` лише без посилань.
- Записувати маркер через safeWrite(dir, CLONE_MARKER, …) (writeProblem/landing) або відмовляти, якщо після git clone `.keylang` у клоні — symlink (lstat); так само перевіряти шлях у readMarker перед читанням.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/clone.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
