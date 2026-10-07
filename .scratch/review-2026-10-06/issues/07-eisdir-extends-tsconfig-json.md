# 07: Падіння EISDIR, коли `extends` tsconfig без `.json` збігається з назвою теки

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `ts`, верифікація: confirmed.

**Місце:** `src/imports.ts:557` (рецензент указав `src/imports.ts:208`)

## Що не так

`extendedConfig` для відносного `extends` викликає `this.text(path)` ще до додавання `.json`. `readText` перевіряє лише `existsSync` і читає шлях через `readFileSync`, тож коли поруч є тека з такою самою назвою, кидається EISDIR, і весь аналіз падає. tsc у цьому випадку бере `<path>.json`, бо `fileExists(dir)` дає false. Код спрацьовує лише тоді, коли граф питає `verbatimModuleSyntax`, тобто коли в коді є `import { type X }`.

## Сценарій збою

`tsconfig.json` містить `{"extends":"./configs/base"}`, існують `configs/base.json` і тека `configs/base/` (README). `src/a.ts` містить `import { type B } from "./b"`. `keylang map` (а отже й `check`, `feature`, `hook stop`) завершується з кодом 2: `keylang: EISDIR: illegal operation on a directory, read`, і знімка немає.

## Як відтворити

fx/t11: `map status 2  keylang: EISDIR: illegal operation on a directory, read`

Доказ верифікатора:

> Reproduced at current HEAD in scratchpad/verify/ts-5-0/. HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed at scratch.
> 
> Fixture fx/:
> - tsconfig.json = {"extends":"./configs/base"}
> - configs/base.json = {"compilerOptions":{"verbatimModuleSyntax":true}}
> - configs/base/README.md, so a directory `configs/base/` exists next to base.json
> - src/a.ts = `import { type B } from "./b"; export const a = 1;`
> - src/b.ts = `export type B = number;`
> - package.json = {"name":"fx"}
> 
> Commands run with `node /home/kosmodev/pet_project/keylang/bin/keylang.js`:
> - `map` in fx: prints `keylang: EISDIR: illegal operation on a directory, read`, exits 2 and writes no snapshot (no keylang/ and no .keylang/).
> - `map --check`: same EISDIR, exit 2.
> - c3 (init --agents=none ran cleanly without the dir, then configs/base/ was added): `check` fails with the same EISDIR and exit 2.
> - c3, `echo '{}' | keylang hook stop`: prints `{"systemMessage":"keylang: this turn was not checked: EISDIR: illegal operation on a directory, read"}` and exits 0. The Stop guard fails open, so the turn passes without any check.
> 
> Controls:
> - c1, the same fixture without the configs/base/ dir: map exits 0.
> - c2, the dir present but `import { B }` with no inline `type`: map exits 0 and writes keylang/map/main.md. So the bug only fires when graph.ts:490 asks verbatimModuleSyntax for an inlineTypeOnly import, as the claim says.
> 
> tsc 5.9.3 (`tsc --showConfig` in fx) accepts this config. It resolves the parent to configs/base.json and shows verbatimModuleSyntax: true. The input is valid.
> 
> Code path:
> - src/imports.ts:208 `return this.text(path) !== null || path.endsWith(".json") ? path : \`${path}.json\`` calls text() on the bare path `configs/base`.
> - text(), line ~108, calls readText().
> - readText (src/imports.ts:557) does `existsSync(path) ? readFileSync(path, "utf8") : null`. existsSync is true for a directory, so readFileSync throws EISDIR. Nothing catches it on the way up to cli main.
> 
> The doc comment on extendedConfig (lines 196-202) promises tsc's behaviour ("with `.json` added when the path itself is no file"), so the code breaks its own stated contract. mergedOptions (line 629) adds `.json` directly and does not hit this. docs/review-2026-10-05.md does not list this item (no EISDIR/extendedConfig/readText mentions), so it is a new finding, not a regression.
> 
> Severity: the rubric puts a crash on valid input of the main check (map/check/feature) at P1, and hook stop silently skipping the check is effectively a fa …

## Що зробити

- У readText повертати null, якщо шлях не є звичайним файлом (statSync(path).isFile()), і ловити помилки читання, щоб `extends` без `.json` брав `<path>.json`, як tsc, а не падав з EISDIR.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
