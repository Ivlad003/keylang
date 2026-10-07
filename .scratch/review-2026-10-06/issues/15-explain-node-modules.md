# 15: Брама пропозицій перевіряє зарезервовані теки за рядком шляху, а не за місцем запису: регістр і посилання обходять заборону explain/ і node_modules

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `writes`, верифікація: confirmed. Регресія виправлення з ✔ у [рев'ю 2026-10-05](../../../docs/review-2026-10-05.md).

**Місце:** `src/proposals.ts:54` (рецензент указав `src/proposals.ts:55`)

## Що не так

`proposalProblem` відмовляє `map/`, `map-explained/`, `explain/` (і `explain/brief/`) через `inside.startsWith(...)`, тобто за текстом шляху, ще до того, як розв'язано посилання й регістр. Збережені пояснення моделі не мають маркера `keylang:generated`, тож перевірка вмісту їх теж не ловить. На файловій системі без розрізнення регістру (типова APFS на macOS, NTFS на Windows) шлях `keylang/Explain/brief/<id>.md` проходить браму. На будь-якій ФС те саме дає посилання всередині каталогу специфікацій. `codeProposalProblem` (рядок 91) так само перевіряє `unreadDirectory` лише за текстом шляху. Отже, виправлення ✔ п.3 «Головне» неповне.

## Сценарій збою

macOS: агент викликає MCP `apply_diff {path:"keylang/Explain/brief/app.checkout.checkout.md", text:"<!-- keylang:explain ... closure=FORGED ... -->\nForged brief."}` і отримує `status: pending`. Людина бачить у `keylang proposals` звичайний рядок `+2 -2`, робить `proposals accept` або MERGE, і збережений brief перезаписано з підробленим `closure=`, тобто на карті з поясненнями він «свіжий». `draft flow --into keylang/EXPLAIN/x.md` і чат скрепки теж проходять. Linux: досить посилання `keylang/notes -> explain` (тоді `keylang/notes/brief/<id>.md`) або `src/vendor -> ../node_modules/lib`: код-пропозиція `src/vendor/index.ts` пише в `node_modules/lib/index.ts`, а прямий шлях `node_modules/lib/index.ts` брама відхиляє.

## Як відтворити

Фікстура tests/fixtures/repo плюс keylang/explain/brief/app.checkout.checkout.md з заголовком `<!-- keylang:explain ... closure=abc ... -->`. Регістр: `unshare -rm` + `mount -t tmpfs -o casefold tmpfs ci && chattr +F ci`, репозиторій у ci/repo. Через клієнт MCP SDK: apply_diff з шляхом `keylang/explain/brief/...` дає помилку `saved explanations: only keylang explain writes them`. Той самий виклик з `keylang/Explain/brief/...` дає `{"status":"pending"}`, а diff показує заміну наявного brief. Далі `keylang proposals accept keylang/Explain/brief/app.checkout.checkout.md` виводить `written ... (+2 -2)`, і `cat keylang/explain/brief/app.checkout.checkout.md` показує `closure=FORGED` і `Forged brief.`. `draft flow app.checkout.checkout --mode algo --into keylang/EXPLAIN/app.checkout.checkout.md` дає код 0 і пише пропозицію. Посилання на Linux: `ln -s explain keylang/notes`, apply_diff `keylang/notes/brief/...` дає pending, accept перезаписує brief. Код: `ln -s ../node_modules/lib src/vendor`, тоді `proposals` показує `node_modules/lib/index.ts: cannot be accepted: in a directory sources are not read from`, а `proposals accept src/vendor/index.ts` записує `node_modules/lib/index.ts` (`export const x = 2;`).

Доказ верифікатора:

> Code at current HEAD: src/proposals.ts:55-57 refuses `map/`, `map-explained/` and `explain/` with `inside.startsWith(...)` on the literal path text. After that, `writeProblem`/`landing` only check that the target stays inside the spec dir. Saved explanations start with `<!-- keylang:explain ... -->`, not `keylang:generated`, so `isGeneratedText` lets them through. `generated(path)` compares the analysis doc path, which is the canonical `keylang/explain/...`, so it does not match the aliased path either. Same thing on the code side: `codeProposalProblem` at :91 runs `unreadDirectory` on the path text only.
> 
> The contract is in docs/cli.md (the "Правила цілі пропозиції" paragraph) and docs/mcp-lsp.md:20: `explain/` and `explain/brief/` are not proposal targets. docs/review-2026-10-05.md, "Головне" item 3 (P1), is marked ✔ fixed. This finding is an incomplete fix of that item, not a new open entry.
> 
> Repro, fixture = tests/fixtures/repo + keylang/explain/brief/app.checkout.checkout.md (`closure=abc`), in scratchpad/verify/writes-0-0. Calls go through a real MCP SDK client to `keylang.js mcp`, with HOME/XDG pointed at the scratch dir.
> 
> 1) Linux, link `ln -s explain keylang/notes`:
> - `apply_diff keylang/explain/brief/...` gives `saved explanations: only keylang explain writes them (isError)`.
> - `apply_diff keylang/notes/brief/app.checkout.checkout.md` gives `{"status":"pending",...diff: -...closure=abc... +...closure=FORGED...}`.
> - `keylang proposals` lists `keylang/notes/brief/app.checkout.checkout.md: +2 -2`.
> - `proposals accept keylang/notes/brief/app.checkout.checkout.md` prints `written ... (+2 -2)`, exit 0.
> - `cat keylang/explain/brief/app.checkout.checkout.md` shows `closure=FORGED` / `Forged brief.`.
> 
> 2) Case-insensitive FS: `unshare -rm`, `mount -t tmpfs -o casefold`, `chattr +F` on the repo dir. `ls keylang/EXPLAIN/brief` works, so case folding is active.
> - `apply_diff keylang/explain/brief/...` is refused.
> - `apply_diff keylang/Explain/brief/app.checkout.checkout.md` gives `status: pending`, and the diff replaces the existing brief (`-closure=abc +closure=FORGED`).
> - `proposals accept keylang/Explain/brief/app.checkout.checkout.md` prints `written ... (+2 -2)`, exit 0.
> - The real `keylang/explain/brief/app.checkout.checkout.md` now holds `closure=FORGED`.
> 
> No setup is needed on macOS APFS or NTFS defaults. The agent only has to change the case of one letter.
> 
> 3) Code, link `src/vendor -> ../node_modules/lib`, proposal files placed in .keylang/proposals …

## Що зробити

- Перевіряти зарезервовані теки (map/, map-explained/, explain/, а для коду node_modules/target/приховані) за розв'язаним місцем запису, а не за текстом шляху: порівнювати dev/ino кожного наявного предка landing(target) з теками <dir>/explain, map, map-explained (або брати relative від realpathSync.native(specDir) до realpathSync.native(target)), щоб регістр і посилання не обходили заборону.
- Перевіряти зарезервовані теки (map/, map-explained/, explain/, приховані, node_modules, target) за місцем запису: обчислити landing(resolve(root, path)) і порівняти через within() з landing/realpathSync.native від `<spec>/explain` тощо (або за dev+ino предків), а текстове порівняння сегментів робити без урахування регістру; те саме для unreadDirectory у codeProposalProblem.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/proposals.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
