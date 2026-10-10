# Git у браузері для `app.html`: дослідження

**Status:** needs-triage — прототипи §6 (wasm-git: ні) і §7 (isomorphic-git: так) зроблено

**Дата:** 2026-10-09. **Контекст:** [`.scratch/web-static/spec.md`](../web-static/spec.md). Аналіз у браузері (`app.html`, `web/worker/`) виконує конвеєр keylang без git: `.git` перетягнутої теки пропускається, а `child_process` у worker-і — заглушка (`web/worker/shims/unavailable.ts`). Питання: чи можна дати йому git, і що це змінить.

Позначки: **[перевірено]** — звірено 2026-10-09 з npm або кодом; **[з пам'яті]** — знання без перевірки першоджерела, перевірити перед реалізацією.

## 1. Бібліотеки

| Варіант | Що це | Стан | Висновок |
|---|---|---|---|
| `isomorphic-git` | git, переписаний на чистому JS (не WASM), для Node і браузера; працює над будь-якою fs з API `fs.promises` | 1.43.2, MIT, оновлено 2026-10-08 **[перевірено]** | **Кандидат.** Без native-коду, тож відповідає AGENTS.md. Уміє clone, log, status, `walk`/порівняння дерев, `readBlob`, `findMergeBase`, `resolveRef` **[з пам'яті]** |
| `@isomorphic-git/lightning-fs` | fs для браузера на IndexedDB, яку зазвичай дають isomorphic-git | 4.10.3, MIT, оновлено 2026-09-25 **[перевірено]** | Нам не потрібна: worker уже має fs у пам'яті (`web/worker/shims/fs.ts`). Бракує лише асинхронного фасаду `promises` над нею |
| `wasm-git` | libgit2, скомпільований у WASM через emscripten | 0.0.17, оновлено 2026-07-17 **[перевірено]** | Резерв: версія 0.0.x, мала екосистема, ще один WASM-бінарник у `assets/` |
| сам git (C) у WASM | — | лише експерименти **[з пам'яті]** | Ні |

**Обмеження всіх варіантів:** smart HTTP GitHub і більшості хостингів не віддає CORS-заголовків, тому clone за URL з браузера потребує CORS-проксі, наприклад публічного `cors.isomorphic-git.org` **[з пам'яті]**. Проксі бачить код і токени, а це ламає обіцянку `app.html` «файли не покидають вкладку». Висновок: **читати `.git` перетягнутої теки — так; клонувати за URL з браузера — ні.**

## 1a. Пошук браузерних git-клієнтів (2026-10-09)

| Проєкт | Основа | Як викликається | Ліцензія | Що з'ясовано |
|---|---|---|---|---|
| [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) | чистий JS | асинхронні функції (`log`, `walk`, `findMergeBase`, `readBlob`, `statusMatrix`, `resolveRef`, 80+ команд) | MIT | Fs своя: README радить LightningFS і попереджає, що та може переставляти операції. CORS: README пропонує [cors.isomorphic-git.org](https://cors.isomorphic-git.org) «для тестів чи малих проєктів» (проксі спонсорує Clever Cloud) **[перевірено, README]** |
| [wasm-git](https://github.com/petersalomonsen/wasm-git) | libgit2 v1.9.4 через Emscripten 6.0.3 | `lg.callMain(['clone', url, dir])` — **аргументи як у CLI git**. Два варіанти: **синхронний** `lg2.js` (у браузері — лише у Web Worker) і асинхронний `lg2_async.js` (Asyncify) | GPLv2 з linking exception (як libgit2) | FS Emscripten: MEMFS, IDBFS, NODEFS, OPFS-варіанти. CORS: сервер має дозволяти cross-origin або бути того самого походження. Демо: wasm-git.petersalomonsen.com **[перевірено, README і COPYING]** |
| [git2cpp](https://github.com/QuantStack/git2cpp) (QuantStack) | libgit2, C++-обгортка з CLI | CLI для WASM-терміналів у браузері (cockle, JupyterLite terminal), збірка через emscripten-forge | BSD-3-Clause | Підтримуваних підкоманд у знайденій документації не перелічено; 6 зірок **[перевірено, README]** |
| [simple-git-wasm](https://github.com/powercord-org/simple-git-wasm) | libgit2 | лише clone і pull | — | Замало для нас **[з опису в пошуку]** |
| [Git Portal](https://github.com/happybeing/p2p-git-portal-wasi) | WASI | застосунок у стилі GitHub без бекенду | — | Готовий застосунок, а не бібліотека **[з опису в пошуку]** |

CORS для clone підтверджено всюди: у README isomorphic-git і wasm-git, а GitLab колись обговорював додати CORS-заголовки для clone і push ([merge request](https://gitlab.com/gitlab-org/gitlab-workhorse/merge_requests/219), [issue](https://gitlab.com/gitlab-org/gitlab/issues/20590)). Висновок §1 лишається: читати `.git` перетягнутої теки — так, clone з GitHub без проксі — ні.

**Що змінює пошук:** синхронний `wasm-git` у Worker-і з викликом у формі CLI збігається з тим, як keylang кличе git (`spawnSync("git", args)`). Отже, з'являється варіант 0: shim `node:child_process.spawnSync("git", …)` → `lg.callMain(args)` зі stdout, перехопленим через `Module.print`, без змін у ядрі. Ризики, які треба перевірити **[гіпотеза]**: `lg2` — це приклад-CLI libgit2, а не git. Він може не мати потрібних нам команд і прапорців (`merge-base`, `diff --unified=0 --relative --no-renames`, `show <ref>:./<path>`, `ls-files --others --exclude-standard`, `cat-file -e`, `hash-object --stdin`), а формат виводу може відрізнятися від git, який розбирає `src/git-changes.ts`. Крім того, це ще один WASM-бінарник (розмір не виміряно) і GPLv2 з linking exception поруч з Apache-2.0 keylang.

## 2. Як keylang викликає git сьогодні [перевірено]

Завжди синхронно, через `spawnSync("git", …)`:

| Файл | Команди | Для чого |
|---|---|---|
| `src/git-changes.ts` (`gitIn`) | `rev-parse --is-inside-work-tree`, `rev-parse --verify --quiet <ref>^{commit}`, `merge-base HEAD <ref>`, `diff --relative --no-renames --unified=0 … <base> --`, `ls-files -z --others --exclude-standard`, `ls-tree -r -z --name-only <ref>`, `show <ref>:./<path>`, `show <object>`, `cat-file -e <object>`, `hash-object -t tree --stdin` (порожнє дерево для unborn HEAD), `config --get core.ignorecase` | `check --changed`, `stale`, `feature` (база гілки), вміст файлів на базі |
| `src/operations/flow-bundle.ts` (`gitOf`) | `remote get-url origin`, `rev-parse HEAD` | заголовок пакета `flow export`: repo і commit |
| `src/clone.ts` | `clone --depth 1`, `fetch`… | `clone`, `web <url>` — у браузері не потрібні |
| `src/git-hook.ts` | `rev-parse --show-toplevel`, `rev-parse --git-path hooks` | встановлення hook-ів — у браузері не потрібні |
| `src/tui/clip-memory.ts` | `check-ignore -q` | лог чату TUI — у браузері не потрібні |

API isomorphic-git асинхронний, тому shim на місці `node:child_process` (як із `fs`) не підійде: `spawnSync` має повернути результат одразу.

## 3. Що дав би git у браузері

Якщо читати `.git` перетягнутої теки:

- «що змінилося з гілки X» — `check --changed`, позначки `stale` у «Карті» й діаграмах;
- `feature` зі своєю базою (`merge-base`);
- справжні `repo` і `commit` у заголовку пакета й в `.keylang-export.json` експорту.

Ціна: `.git` доведеться читати в пам'ять (packfiles можуть важити сотні МБ), а isomorphic-git (≈ сотні КіБ **[з пам'яті]**, розмір виміряти) додасться до `assets/analysis.js`.

## 4. Варіанти інтеграції

0. **wasm-git як `child_process` у worker-і.** Синхронний `lg2.js` під shim `spawnSync("git", …)`. Ядро не змінюється, але все залежить від того, чи `lg2` підтримує наші команди й формат виводу (§1a). Спершу варто прототипом прогнати команди з §2 на клоні.
1. **Порахувати git-дані до аналізу (рекомендовано).** Worker асинхронно, через isomorphic-git над `.git` у fs пам'яті, обчислює те, що потрібно режиму перегляду: HEAD, базу, змінені файли, вміст бази для них, origin. Потім передає це в конвеєр як дані: через `AnalysisRequest` або через маленький синхронний git-шар, що відповідає з цього знімка. Node-шлях і ядро не змінюються.
2. **Асинхронний інтерфейс git-шару** (Node — CLI, браузер — isomorphic-git). Чистіший контракт, але зачіпає `check`, `feature`, hook-и й тести в Node; більший обсяг.
3. **Не робити.** Режим перегляду показує стан дерева без історії, як зараз.

## 5. Відкриті питання

- Чи потрібні `stale` і `--changed` у режимі перегляду взагалі, чи достатньо поточного стану? Від відповіді залежить, чи варто брати варіант 1.
- Яку базу брати за замовчуванням без CLI-аргументу: `origin/HEAD`, `main` чи вибір у UI?
- Межа розміру `.git`, яку `app.html` ще читає, і поведінка над нею (пропустити git із поясненням).
- Перед реалізацією перевірити за документацією isomorphic-git позначки **[з пам'яті]**: набір API (`walk`, `findMergeBase`, `readBlob`), поведінку з shallow-клонами, розмір bundle.

## 6. Прототип: keylang-команди через wasm-git (2026-10-09) [перевірено]

`prototype-wasm-git.mjs` поруч: `wasm-git@0.0.17`, синхронний `lg2.js` (lg2.wasm — 862 КБ) у Node, репозиторій разом із `.git` (151 МБ, 650 комітів, клон keylang із локальними змінами) скопійовано в MEMFS — як у worker-і браузера; копіювання 240–650 мс. Порівняння з git 2.x на тому самому дереві:

| Команда, як її кличе keylang | lg2 |
|---|---|
| `rev-parse HEAD` | ✅ той самий вивід |
| `rev-parse --is-inside-work-tree`, `--verify --quiet <ref>^{commit}`, `--short` | ❌ `Cannot handle argument` |
| `merge-base HEAD <ref>` | ❌ `Command not found` |
| `diff --relative --no-renames --unified=0 … <base> --` | ❌ `Unknown command line argument: --relative`; `diff <ref>` без прапорців є (≈380 мс), але лише з типовим контекстом |
| `ls-files -z --others --exclude-standard` | ❌ `-z` не підтримано; є лише `ls-files [--error-unmatch] [<file>…]` |
| `ls-tree -r -z --name-only` | ❌ `Command not found` |
| `show <ref>:./<path>`, `show <object>` | ❌ `Command not found`; замінник — `cat-file -p <ref>:<path>` ✅ (без `./`) |
| `cat-file -e <ref>:./<path>` | ❌ шлях з `./` не розв'язується |
| `config --type=bool --get core.ignorecase` | ❌ лише `config <KEY> [<VALUE>]` |
| `remote get-url origin` | ❌ лише `add`, `remove`, `rename`, `set-url`, `show` |
| інше: `rev-parse <ref>`, `ls-files`, `describe --always` | ✅ |
| `log --oneline`, `rev-list --count` | ⚠️ `log` друкує повний SHA; `rev-list --count` — помилка |

Ще одна знахідка: `status` і `diff` у MEMFS показали зайву зміну `bin/keylang.js`. Під час копіювання загубився біт виконання, і `.git` бачить зміну mode. Перетягнута в браузер тека теж не несе mode-бітів (File API), тож це стосуватиметься будь-якого git у браузері: потрібен `core.fileMode=false` або порівняння лише вмісту.

**Висновок.** Варіант 0 (shim `spawnSync("git") → lg2`) **не працює**: з 12 викликів keylang lg2 виконує як git лише один. Щоб використати wasm-git, довелося б перекладати кожну команду на форму lg2 і розбирати інший вивід, а `merge-base`, `ls-tree` і `--unified=0` — дописувати на C у власну збірку libgit2. Інших API, крім `callMain`, wasm-git не дає. Це фактично fork на C, який доведеться підтримувати.

Отже, рекомендація — **варіант 1 на isomorphic-git**. Він має потрібне як API (`resolveRef`, `findMergeBase`, `readBlob`, `walk`/`statusMatrix`, `listFiles`), а diff рядків keylang уже вміє сам (`src/line-diff.ts`). Його наступним кроком варто прогнати тим самим способом.

## 7. Прототип: isomorphic-git (2026-10-09) [перевірено]

`prototype-isomorphic-git.ts` поруч: `isomorphic-git@1.43.2` над fs worker-а (`web/worker/shims/fs.ts`), у яку скопійовано репозиторій разом із `.git` — так, як `app.html` прочитав би перетягнуту теку. Еталон — функції keylang із `src/git-changes.ts`, які на тому самому дереві на диску викликають git 2.43 CLI. Фікстури: (а) клон keylang (7926 файлів, `.git` 151 МБ) на гілці `feature` з власним комітом, зміненими рядками посеред файлів, видаленим, новим staged, untracked, ignored і бінарним файлом та `.keylang/`; (б) репозиторій без комітів (unborn HEAD) зі staged і untracked файлами.

| Що питає keylang | Функція keylang | Результат isomorphic-git | Час: git CLI → isomorphic-git (зі спільним `cache`) |
|---|---|---|---|
| змінені файли від HEAD і від `master` (`check --changed`, `stale`) | `gitChangedFiles` | ✅ збігається: шляхи, видалені, `unborn`; `.keylang/` і ignored відкинуто | 50 мс → 0,25–0,8 с (перший обхід хешує робоче дерево) |
| файл на ref, відсутній файл | `gitFileAt` | ✅ | 40 мс → 1–2 мс |
| `.md` під `keylang/` на ref (860 файлів) | `gitSpecFilesAt` | ✅ | 11 с → **1,7 с** (без `cache` — 81 с) |
| база фічі: `origin/HEAD`, main/master, `merge-base`, коротке ID | `featureBaseOrigin` | ✅ | 70 мс → 46 мс |
| unborn HEAD: усе нове, файл на HEAD — null, специфікацій — нема | усі вищі | ✅ | — |
| діапазони змінених рядків (`diff --unified=0`) | `gitChangedLines` | ⚠️ 5 файлів із 36 відрізняються на ±1 рядок, і з LCS keylang (`src/line-diff.ts`), і з Myers із `diff@8` (jsdiff): у неоднозначних місцях git вирівнює інакше (порожні рядки, які трапляються часто, він не вважає збігом) — евристика відступів тут ні до чого (`--no-indent-heuristic` дає те саме) | 50 мс → 0,2–0,3 с |

Підсумок: **15 із 16 перевірок дають точно той самий результат**, що й keylang із git CLI.

Знахідки:

- **isomorphic-git пише `.git/index`** під час `walk`/`statusMatrix` з `WORKDIR` (оновлює кеш stat-ів), тож на read-only fs він падає з `EROFS`. Для браузера це не проблема: потрібен записуваний шар у пам'яті лише для git, окремо від read-only fs конвеєра keylang. На теку людини це не впливає, бо File API назад не пише. Інших записів, крім `.git/index`, не було.
- **Спільний `cache`** (опція isomorphic-git для розібраних packfile і дерев) обов'язковий: без нього кожен `readBlob` заново розбирає pack, і 860 файлів читаються 81 с.
- **Розмір:** потрібні функції (`walk`, `TREE`/`WORKDIR`/`STAGE`, `statusMatrix`, `resolveRef`, `expandOid`, `readObject`, `readBlob`, `listFiles`, `findMergeBase`) у браузерному IIFE займають 180 КБ мінімізовано (58 КБ gzip).
- **Біти виконання:** у прототипі порівнюється лише вміст (oid), і він збігся з git, бо в клоні режими не змінювались. У браузері режимів немає зовсім (§6), тому порівняння «лише вміст» — правильна поведінка, а не обхідний шлях.
- **Не покрито:** корінь keylang у підтеці репозиторію (`--relative`, шляхи `./` у `show`), `core.ignorecase=true`, анотовані теги як `--since`, ревізії на кшталт `HEAD~3` (у `resolveRef` їх немає: потрібен свій розбір `~`/`^`), shallow-клони (без історії `merge-base` не знайдеться), читання 151 МБ `.git` через File API в реальному браузері (у Node копіювання в пам'ять займає 180 мс).

**Висновок.** Варіант 1 працює: для режиму перегляду (`--changed`, `stale`, `feature`, спеки на ref) isomorphic-git дає ті самі відповіді, що й git CLI, і досить швидко. Діапазони рядків потрібні лише `code-to-spec --since` і `draft` (`gitChangedLines`), яких у режимі перегляду немає. Якщо вони колись знадобляться, їх варто позначити як наближені.

План, якщо брати в роботу:
1. Git-шар keylang як дані: worker до `analyze` асинхронно рахує через isomorphic-git `ChangedFiles`, файли й спеки на базі та `BaseOrigin`, а синхронні функції `src/git-changes.ts` у браузері відповідають із цього знімка. Це shim `child_process` не для git CLI, а для функцій `git-changes.ts`, тобто підміна модуля при збірці worker-а.
2. Записуваний шар у пам'яті для `.git`, спільний `cache`, порівняння лише вмісту.
3. UI: у `app.html` не пропускати `.git`, обмежити його розмір (і пояснювати, коли більше), дати вибір бази (типово — як у `featureBaseOrigin`).
4. Тест: e2e у `tests/web-e2e/` зі звіркою з `keylang check --changed` на фікстурі з гілкою.
