# 32: package.json з UTF-8 BOM ламає кожну команду аналізу (код 2 «invalid JSON»)

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-stale-manifests-external-ids`, верифікація: confirmed.

**Місце:** `src/declared-packages.ts:237` (рецензент указав `src/declared-packages.ts:258`)

## Що не так

`addPackages` передає текст маніфеста в `parseJsoncStrict` (тобто `JSON.parse`), не знявши BOM. Node (`require`) і npm такий package.json приймають, а keylang на будь-якому package.json з BOM у корені або на шляху до коду кидає `invalid JSON`. Це окремий шлях від уже звітованого BOM у keylang.json (config.ts).

## Сценарій збою

Visual Studio чи інший Windows-редактор зберіг package.json (кореневий або `apps/web/package.json`) з BOM. Тоді `keylang check`, `map`, `map --check`, `check --stale`, hook і MCP завершуються з кодом 2 і `package.json: invalid JSON: Unexpected token '﻿'`, і жодне правило не перевіряється.

## Як відтворити

scratchpad/…/bom1: `printf '\xef\xbb\xbf{"name":"app","dependencies":{"left-pad":"^1.0.0"}}'` > package.json. `node -e 'require("./package.json")'` друкує ok, а `node bin/keylang.js check` і `map --check` дають `keylang: package.json: invalid JSON: Unexpected token '﻿', "﻿{"name":""... is not valid JSON` і exit 2.

Доказ верифікатора:

> I reproduced this at HEAD 45cc74d. The fixture is a copy of tests/fixtures/repo under scratchpad/verify/x-stale-manifests-external-ids-3-0/bom, with HOME/XDG pointed at scratch.
> 
> Setup: `printf '\xef\xbb\xbf{"name":"app","dependencies":{"left-pad":"^1.0.0"}}' > package.json`. `od -c` shows the file starts with `357 273 277 {`.
> 
> - `node -e 'console.log(require("./package.json").name)'` prints `app`, so Node accepts the BOM.
> - `node .../bin/keylang.js check` prints `keylang: package.json: invalid JSON: Unexpected token '﻿', "﻿{"name":""... is not valid JSON` and exits 2.
> - `map --check` and `check --stale` print the same message and exit 2.
> - Control: the same fixture with no BOM gives `0 fail, 0 unverified, 4 ok`, exit 0.
> - Nested case: a BOM in src/domain/package.json gives `keylang: src/domain/package.json: invalid JSON ...`, exit 2.
> - The same failure hits composer.json with a BOM: `keylang: composer.json: invalid JSON ...`, exit 2. That file goes through `addComposer`, which calls `JSON.parse`.
> 
> Code path: `readManifests` reads the file through `readInput`, then `readText` (src/declared-packages.ts:235-242). `readText` calls `readFileSync(path, "utf8")` and does not strip a BOM. `addPackages` (line 258) then calls `parseJsoncStrict`, which is `JSON.parse(stripJsonc(text))` in src/imports.ts:552. `stripJsonc` copies U+FEFF through unchanged, so `JSON.parse` throws.
> 
> Other readers in the repo do strip the BOM: parser.ts:18, test-report.ts:39/152, emit.ts:14, trace-evidence.ts:76. docs/semantics.md:322/340 say a BOM at the start of a report is skipped.
> 
> Contract: docs/cli.md:23 says only an unreadable or invalid manifest gives code 2. A package.json with a BOM is valid for Node `require` and for npm, so this breaks that contract. It is not intended behaviour, and no doc mentions a BOM in manifests.
> 
> Review doc: docs/review-2026-10-05.md does not list this. Its only BOM item, #8 (P3), is about a JSON test report, which is a different path (test-report.ts). So this is a new item, not a regression.
> 
> Severity: P2, not P1. keylang stops with a clear error and code 2. It does not crash or give a false ok or fail. But it blocks every analysis command on input that is valid for Node and npm.

## Що зробити

- Знімати BOM у readText у declared-packages.ts (`.replace(/^﻿/, "")`), щоб package.json і composer.json з BOM парсились так само, як у Node/npm; додати тест на фікстурі з BOM.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/declared-packages.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

**2026-10-08.** BOM (U+FEFF) на початку маніфеста знімається перед розбором, як це роблять Node і npm: `readText` у `src/declared-packages.ts` (package.json, Cargo.toml, composer.json), розбір composer-членів і `Cargo.toml` там само; `stripJsonc` у `src/imports.ts` (тож резолвер так само читає package.json і tsconfig з BOM, а тексти з `known` теж проходять); `composerSourceRoot` у `src/config.ts`; `enableExplainedMap` і маркер клону в `src/clone.ts`. Спільний помічник — `withoutBom`, тепер експортований із `src/config.ts` (раніше приватний для keylang.json, тікет 62). Регресії: `tests/review-config.test.ts` («package.json and composer.json with a UTF-8 BOM…»: кореневий і вкладений package.json та composer.json з BOM — пакети стають відомими ID, член workspace лишається внутрішнім і дає K001; до виправлення — `package.json: invalid JSON`, код 2) і `tests/clone.test.ts` («clone --explain: a committed keylang.json with a UTF-8 BOM…»; до виправлення — `clone: keylang.json: Unexpected token`). Документація: `docs/cli.md` (рядок `map`); `docs/review-2026-10-06.md` §2.2 №27 ✔.
