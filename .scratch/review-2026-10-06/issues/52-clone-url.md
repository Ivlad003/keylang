# 52: `clone` друкує й зберігає URL з обліковими даними

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `cli`, верифікація: confirmed.

**Місце:** `src/cli.ts:517` (рецензент указав `src/clone.ts:112`)

## Що не так

Ключ кешу без облікових даних, але `source.url` з `user:token@` потрапляє в перший рядок stdout (`<dir>: cloned from <url>`), у маркер `.keylang/clone.json` і в повідомлення про невідповідність маркера. Git у своїх повідомленнях облікові дані з URL прибирає, keylang — ні.

## Сценарій збою

У CI чи Docker виконують `keylang clone https://bot:ghp_XXXX@github.com/org/private`. Токен опиняється в лозі збірки (stdout) і в незахищеному `.keylang/clone.json`. Якщо `--dir` вказує на інший клон, токен потрапляє в stderr.

## Як відтворити

Клон t4 у теці кешу, далі `keylang clone https://alice:s3cretTOKEN@127.0.0.1:1/org/repo.git --dir cache/keylang/repos/local/t4-8bd2271e`. stderr: `keylang: clone: … is a clone of …/t4, not https://alice:s3cretTOKEN@127.0.0.1:1/org/repo.git; pass another --dir`, exit=2. Для порівняння: на недосяжному URL git сам пише `unable to access 'https://127.0.0.1:1/org/repo.git/'` без облікових даних. Успішний шлях (stdout і маркер) видно з коду cli.ts prepareClone і clone.ts:106, без мережі не відтворено.

Доказ верифікатора:

> I reproduced this with the real CLI and no network access. Scratch dir: scratchpad/verify/cli-5-0. HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed into it. The fixture is a local bare repo bare.git. In the scratch HOME's .gitconfig, `[url "file://$S/bare.git"] insteadOf = https://alice:s3cretTOKEN@git.example.invalid/org/repo.git` sends git to the local file. keylang code runs unchanged.
> 
> 1) `node .../bin/keylang.js clone https://alice:s3cretTOKEN@git.example.invalid/org/repo.git` gave exit=0. First line of stdout: `.../cache/keylang/repos/git.example.invalid/org/repo: cloned from https://alice:s3cretTOKEN@git.example.invalid/org/repo.git`.
> 2) `.keylang/clone.json` (mode -rw-rw-r--): `"url": "https://alice:s3cretTOKEN@git.example.invalid/org/repo.git"`.
> 3) A second run takes the update path and prints `...: updated from https://alice:s3cretTOKEN@...` (exit=0).
> 4) Mismatch: `keylang clone https://bob:OTHERtoken@127.0.0.1:1/org/other.git --dir <that clone>` gave exit=2. stderr: `keylang: clone: ... is a clone of https://alice:s3cretTOKEN@git.example.invalid/org/repo.git, not https://bob:OTHERtoken@127.0.0.1:1/org/other.git; pass another --dir`. This shows both tokens: the one passed now and the one stored in the marker by an earlier run.
> 5) Comparison: `git clone --quiet --depth 1 https://bob:OTHERtoken@127.0.0.1:1/...` prints `fatal: unable to access 'https://127.0.0.1:1/org/other.git/'`. Git strips the credentials. keylang passes that git error through already cleaned.
> 
> Code: src/cli.ts:517 `process.stdout.write(`${synced.dir}: ${synced.action} from ${source.url}\n`)`, src/clone.ts:106 (marker), src/clone.ts:112 (mismatch message). The same path runs for `web <url>` through prepareClone.
> 
> Docs: docs/cli.md#clone says the first stdout line is `<тека>: cloned|updated from <url>` and the marker holds the URL. Credentials in a URL are allowed by the docs ("приватний URL без облікових даних падає"). Nothing says they are echoed or kept, so this is not documented behaviour. docs/review-2026-10-05.md does not mention clone or credentials, so this is not a known open item.
> 
> Why it stays P3: git itself already writes the same token in plain text to the clone's `.git/config` (`url = https://alice:s3cretTOKEN@...`, same permissions -rw-rw-r--). So clone.json adds no new on-disk exposure. The real new leak is the echo to stdout and stderr, i.e. into CI logs. The person passed the token on the command line themselves, and CI systems often mask secrets.

## Що зробити

- Додати в RepoSource поле displayUrl з вирізаним userinfo (new URL → username/password = "") і використовувати його в рядку stdout, повідомленнях про помилки та маркері clone.json; url з обліковими даними передавати лише в git.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/cli.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `clone: credentials in a URL reach git only…` у tests/clone.test.ts (справжній CLI; git через `GIT_CONFIG_*` insteadOf веде URL з обліковими даними на локальний origin, мережі немає) падав на старому коді: stdout містив `alice:s3cretTOKEN@`. Виправлення: `RepoSource.displayUrl` і `redactUrl` у src/clone.ts вирізають userinfo; git отримує `url`, а stdout, маркер `.keylang/clone.json`, повідомлення про невідповідність (зокрема URL зі старого маркера) і помилки розбору URL — `displayUrl`. src/cli.ts prepareClone друкує `displayUrl`. docs/cli.md#clone оновлено. `node --test tests/clone.test.ts` — 6/6, `npm run typecheck` — чисто.
