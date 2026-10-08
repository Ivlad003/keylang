# 62: keylang.json з UTF-8 BOM ламає кожну команду (код 2 «invalid JSON»)

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `core`, верифікація: confirmed.

**Місце:** `src/config.ts:219` (рецензент указав `src/config.ts:219`)

## Що не так

`parseConfig`, `assertFormatOnly` і `withLayers` передають текст у `JSON.parse` як є, не знімаючи U+FEFF. Парсер `.md`, звіти тестів (test-report.ts) і trace BOM знімають. JSON-конфіг, збережений із BOM (типово для Windows PowerShell 5.1 `-Encoding UTF8` і старого Notepad), стає «невалідним».

## Сценарій збою

keylang.json починається з байтів EF BB BF, далі валідний JSON. `keylang check` і `keylang fmt --check keylang` виходять з кодом 2 і повідомленням `invalid JSON: Unexpected token '﻿'` (символ невидимий). `hook stop` через це віддає «this turn was not checked», тож перевірку кожного ходу вимкнено, а користувач не бачить причини.

## Як відтворити

Фікстура scratchpad/review/core/bom: копія checkdot, keylang.json записано через `printf '\xef\xbb\xbf{"format": 2, ...}'`. `keylang check` → `keylang: .../keylang.json: invalid JSON: Unexpected token '﻿', "﻿{"format""... is not valid JSON`, exit 2. `keylang fmt --check keylang` → `cannot determine \`format\`: invalid JSON ...`, exit 2.

Доказ верифікатора:

> I reproduced this at current HEAD. The fixture is a copy of tests/fixtures/repo in scratchpad/verify/core-1-0/{plain,bom}. In `bom`, keylang.json is `printf '\xef\xbb\xbf'` followed by the same JSON (od shows 357 273 277 { ...). HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed at the scratch dir.
> 
> - plain: `node bin/keylang.js check` prints "0 fail, 0 unverified, 4 ok" and exits 0. `fmt --check keylang` exits 0.
> - bom: `node bin/keylang.js check` prints "keylang: .../bom/keylang.json: invalid JSON: Unexpected token '﻿', "﻿{ "lang"... is not valid JSON" and exits 2.
> - bom: `fmt --check keylang` prints ".../keylang.json: cannot determine `format`: invalid JSON: Unexpected token '﻿' ..." and exits 2. `parse keylang/rules.md` also exits 2.
> - bom, in a git repo with one changed source, piping a Stop event into `hook stop`: stdout is {"systemMessage":"keylang: this turn was not checked: .../keylang.json: invalid JSON: Unexpected token '﻿' ..."} and the exit code is 0. The turn is not checked.
> 
> Code: src/config.ts:219 (parseConfig), :368 (assertFormatOnly) and :401 (withLayers) call JSON.parse(text) without removing U+FEFF. The callers pass readFileSync(...,'utf8') straight in, and the 'utf8' decoder keeps the BOM:
> - config.ts:176 (loadConfig)
> - harness.ts:63
> - operations/export.ts:64
> - operations/spec.ts:51 and :341
> - tui/app.ts:3521
> 
> Other readers do skip the BOM: parser.ts:17-18, test-report.ts:39, emit.ts:14, trace-evidence.ts:76. docs/semantics.md:322 and :340 explicitly promise this for reports and trace. No doc (cli.md, semantics.md, llm.txt) says anything about the encoding of keylang.json, so rejecting a BOM is not a documented decision. It is an inconsistency with the rest of the inputs. docs/review-2026-10-05.md does not list this: line 44 only covers the BOM in .md, and item 8 at line 144 is about JSON test reports, already fixed. So this is not a known open item and not a regression.
> 
> Correction to the claim: the user does see a reason. hook stop sends a systemMessage that names the file and "invalid JSON", per docs/cli.md:149. But the token it reports is the invisible U+FEFF, so the message is confusing. The result is not a false ok. The tool openly says "not checked", so this is P3, not P1/P2.

## Що зробити

- У parseConfig, assertFormatOnly і withLayers знімати початковий U+FEFF (text.replace(/^﻿/, "")) перед JSON.parse, як це вже роблять test-report.ts і parser.ts; додати тест із BOM-конфігом.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/config.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `keylang.json with a UTF-8 BOM reads as the same JSON…` у tests/review-config.test.ts (справжній CLI: `check`, `fmt --check keylang`, `parse keylang/rules.md` на репозиторії з keylang.json, що починається з U+FEFF; плюс `withLayers` напряму, бо його кличе лише TUI) падав на старому коді: `invalid JSON: Unexpected token '﻿'`, код 2. Виправлення: `withoutBom` у src/config.ts знімає початковий U+FEFF перед `JSON.parse` у `parseConfig`, `assertFormatOnly` і `withLayers`. docs/design.md §8 це фіксує. `node --test tests/review-config.test.ts` — 10/11; єдиний збій (`the snapshot records the real versions…`) — оточення worktree без власного `node_modules/web-tree-sitter/package.json`, падає й без цієї зміни, `npm run typecheck` — чисто.
