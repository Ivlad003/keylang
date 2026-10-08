# 18: Вгаданий layout: TS/JS-імпорт теки в іншому регістрі на macOS чи Windows мовчки зникає, і deny дає хибний ok

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-cross-platform-fs`, верифікація: confirmed.

**Місце:** `src/imports.ts:422` (рецензент указав `src/imports.ts:422`)

## Що не так

`probe` повертає шлях у регістрі специфікатора (`src/DB/conn.ts`), бо його приймає `existsSync`. Файла немає в `byFile`, тому `notIndexed` викликає `placeFile` на фантомному шляху. Глоби вгаданих шарів чутливі до регістру, тож `placeFile` повертає null, і graph.ts:1196 відкидає імпорт без ребра й без дірки.

## Сценарій збою

Немає `layers` у keylang.json (layout вгадано з тек `src/ui`, `src/db`), правило `deny ui db`, а в `src/ui/view.ts` стоїть `import { query } from "../DB/conn"`. Node на macOS цей файл завантажує, тобто залежність реальна. На macOS чи Windows keylang дає `0 fail, 0 unverified, 1 ok`. На Linux той самий код дає unverified, а з правильним регістром `../db/conn` дає fail.

## Як відтворити

Фікстура scratchpad/review/cross-platform-fs/f2, без keylang.json. Linux: `unverified unresolved import \`../DB/conn\``. Через ./cf.sh: `0 fail, 0 unverified, 1 ok`, exit 0. Контроль f2b з `../db/conn` у casefold: `K102 divergence ... 1 fail`, exit 1.

Доказ верифікатора:

> I reproduced the bug at HEAD 45cc74d with my own fixture in scratchpad/verify/x-cross-platform-fs-2-0/. The fixture has no keylang.json, `keylang/rules.md` contains `- deny ui db`, `src/ui/view.ts` has `import { query } from "../DB/conn";`, and `src/db/conn.ts` exists. cf.sh copies the fixture into a casefold tmpfs (`unshare -rm`, `mount -o casefold`, `chattr +F`), which models a case-insensitive FS like APFS or NTFS.
> 
> Results (`node /home/kosmodev/pet_project/keylang/bin/keylang.js check`):
> - Linux, case-sensitive: `keylang/rules.md:3:1: unverified unresolved import \`../DB/conn\` ... 0 fail, 1 unverified, 0 ok`, exit=0.
> - casefold, same fixture: `src/DB/conn.ts exists (casefold)` / `0 fail, 0 unverified, 1 ok`, exit=0. This is the silent false ok.
> - casefold control with `../db/conn`: `K102 divergence: \`ui.view\` depends on \`db.conn\`, which is denied by \`deny ui db\` ... 1 fail`, exit=1.
> - casefold control with explicit `layers` in keylang.json: `unverified unresolved import \`../DB/conn\` (\`src/DB/conn.ts\` is not indexed)`. So only the guessed layout loses the import silently.
> 
> Code path:
> 1. `probe` (src/imports.ts:420-422) does not find `src/DB/conn.ts` in `this.sources`. `existsSync` returns true on the case-insensitive FS, so `probe` returns the path in the specifier's case.
> 2. graph.ts:428 `byFile.get("src/DB/conn.ts")` returns undefined, so the code calls `notIndexed` (graph.ts:434).
> 3. graph.ts:1196: when `config.guessed` is set, `placeFile` returns null because the `src/db/**` glob is case-sensitive. The function returns null, and graph.ts:435-438 does `continue` with no edge and no hole.
> 
> The documented contract only drops files that really sit outside the guessed layers on purpose (semantics.md:172, the comment at graph.ts:436). Here the file is the same `src/db/conn.ts`, so this is not intended behaviour. docs/review-2026-10-05.md does not list this item. It only has NFC/NFD (#8) and CRLF (#9), so this is not a known open item and not a regression.
> 
> Severity: this is a false ok of a deny rule, but the trigger is narrow. It needs no `layers` in keylang.json (the state before init), an import with the wrong case (tsc rejects that by default via forceConsistentCasingInFileNames), and macOS or Windows. So P2, not P1.

## Що зробити

- У probe канонізувати знайдений шлях до реального регістру на диску (realpathSync.native або зіставлення з sources без урахування регістру), а якщо регістр специфікатора не збігається з диском, ставити дірку «unverified», а не мовчки відкидати імпорт через placeFile.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/analyzer.test.ts` «guessed layout: an import of a directory in another letter case is a hole on a case-insensitive file system, not silently dropped» — справжній CLI на casefold tmpfs (`unshare -rm`, `mount -o casefold`, `chattr +F`; skip, коли недоступно), без keylang.json, `deny ui db`, `import … from "../DB/conn"` при `src/db/conn.ts`: очікує `unverified unresolved import \`../DB/conn\``, `0 fail, 1 unverified, 0 ok`. Новий хелпер `onCasefold` у тому ж файлі.
- 2026-10-08: Сам дефект уже закрито комітом 24d7a3c (тікет 04): `probe` бере кандидата поза `sources` лише через `exactExistence` (`src/exact-path.ts`), який звіряє кожен сегмент шляху з переліком теки, тож `src/DB/conn.ts` при `src/db/conn.ts` не існує, імпорт лишається нерозв'язаним і дає дірку, а не доходить до `notIndexed`/`placeFile` (graph.ts). Перевірено, що тест ловить дефект: з тимчасово поверненим `existsSync` у `probe` тест падає (`0 fail, 0 unverified, 1 ok`), з `exactExistence` — зелений. Код не змінено; контракт (docs/snapshot.md, абзац «Мови») уже описує точне написання.
- 2026-10-08: Перевірки: `node --test tests/analyzer.test.ts`, `npm run typecheck` — див. коміт.
