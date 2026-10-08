# 34: `hook install` у монорепо ставить pre-commit, який блокує кожен коміт

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `cli`, верифікація: confirmed.

**Місце:** `src/git-hook.ts:16` (рецензент указав `src/cli.ts:1072`)

## Що не так

`hook install` пише хук у теку хуків git для всього репозиторію, а сам хук — це `exec npx -y keylang@<v> check --changed` без `cd`. Git запускає pre-commit з кореня робочого дерева. Якщо keylang.json лежить у підтеці (`init packages/x`, findRoot іде лише вгору), `check` бачить корінь git без `keylang/` і завершується кодом 2. Коміт блокує не знахідка, а помилка конфігурації.

## Сценарій збою

mono/ — git-репо, keylang ініціалізовано в mono/packages/x. У packages/x `keylang check --changed` дає 0 fail, а `keylang hook install` пише `../../.git/hooks/pre-commit`. Тепер будь-який `git commit` у репо падає з `keylang: no \`keylang/\` directory here; run \`keylang init\` or pass paths`.

## Як відтворити

scratchpad/review/cli/mono зі stub `npx` першим у PATH. Stub відкидає `-y keylang@v` і запускає node bin/keylang.js. Кроки: `(cd packages/x && keylang init --agents=none && keylang hook install && keylang check --changed)` дає install=0 і `0 fail, 0 unverified, 1 ok`. Потім `git add -A && git commit -qm one` друкує `keylang: no \`keylang/\` directory here…`, commit=1.

Доказ верифікатора:

> I reproduced this myself at HEAD 45cc74d. The fixture is in scratchpad/verify/cli-3-0/mono, a git repo with keylang only in packages/x. A stub `npx` sits first on PATH; it drops `-y keylang@<v>`, logs its cwd and runs `node bin/keylang.js`. HOME and the XDG dirs point into the scratch dir.
> 
> ```
> cd mono/packages/x
> keylang init --agents=none   -> init=0
> keylang hook install         -> "../../.git/hooks/pre-commit: written; runs `npx -y keylang@0.6.0 check --changed`", install=0
> keylang check --changed      -> "0 fail, 0 unverified, 1 ok", check=0
> git add -A && git commit -qm one
>   [stub npx] cwd=.../mono args=check --changed
>   keylang: no `keylang/` directory here; run `keylang init` or pass paths
>   commit-from-subdir=1
> cd mono && echo readme > README.md && git add -A && git commit -qm two
>   -> same message, commit-from-root=1 (a commit outside packages/x is blocked too)
> keylang hook install --check (in packages/x) -> "../../.git/hooks/pre-commit: up to date", 0
> ```
> 
> The stub's output shows git ran the hook from the work-tree root (githooks(5) says the same). The hook text, from git-hook.ts preCommitText lines 16-24, is just `exec npx -y keylang@<v> check --changed`, with no `cd`. cmdHookInstall (cli.ts:1072) finds the hooks dir through `gitHooksDir(process.cwd())`, which is the git toplevel. It never compares that with `findRoot(cwd)` (analyze.ts:142), which only walks up and so cannot find packages/x from the root. As a result every commit fails with exit 2, a config error, until someone uses `--no-verify`. `hook install --check` reports the broken hook as "up to date", so nothing flags it.
> 
> Docs: docs/cli.md (line 151) describes the hooks dir and core.hooksPath. It says nothing about a keylang root below the git toplevel, and does not exclude or warn about that setup. Running keylang from a subdir is otherwise supported: findRoot walks up, and `check --changed` from the subdir works. So this is a broken contract (the hook should stop a commit only on a finding that touches a changed file), not intended behaviour. docs/review-2026-10-05.md does not list it; the only hook items there are about `hook stop`.
> 
> Severity stays P2. The commit is blocked by a config error, not by a false ok/fail verdict of the analysis, and `--no-verify` gets around it.

## Що зробити

- У хуку робити `cd "$(git rev-parse --show-toplevel)/<відносний шлях до кореня keylang>"` перед `exec … check --changed` (або кілька таких рядків для кількох коренів), а `hook install --check` нехай порівнює цей шлях і вважає хук без нього застарілим.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/git-hook.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійний тест `tests/cli-harness.test.ts` («hook install from a keylang root below the git top level…») — монорепо зі stub `npx` першим у PATH, справжній `git commit` з `packages/x` і з кореня; на старому коді падав (хук без `cd`). Виправлення: `preCommitText(version, subdir)` додає рядок `cd "$(git rev-parse --show-toplevel)/<subdir>" || exit 2` перед `exec`; `cmdHookInstall` бере `findRoot(cwd)` відносно `gitTopLevel(cwd)` (без `keylang.json` угорі — корінь робочого дерева; корінь keylang поза деревом — код 2); `preCommitState` порівнює з текстом разом зі шляхом, тож хук без `cd` — `stale`. Один корінь на встановлення (кілька коренів у одному репо не підтримуються — задокументовано). Оновлено `docs/cli.md` (hook install). `node --test tests/cli-harness.test.ts`: 11/11; `npm run typecheck` чистий.
