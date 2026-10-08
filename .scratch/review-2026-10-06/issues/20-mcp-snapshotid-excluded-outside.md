# 20: MCP віддає застарілий вердикт: snapshotId не змінюється, коли з'являється чи зникає excluded/outside-файл

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `ts`, верифікація: confirmed.

**Місце:** `src/snapshot.ts:240` (рецензент указав `src/snapshot.ts:240`)

## Що не так

`snapshotId` хешує лише проіндексовані файли. Excluded- і outside-файли, а також інші файли, які `probe` знаходить через `existsSync`, стають модулями графа й змінюють резолвінг: дірка `unresolved import` перетворюється на ребро до opaque-модуля. Проте до id вони не входять. `currentAnalysis` у MCP (`src/mcp.ts:62`) кешує весь аналіз за `snapshotId` і в коментарі стверджує, що id хешує все, від чого залежить граф. Тому після генерації чи видалення такого файла MCP-інструменти повертають старі вердикти. Звіти тестів і trace, прив'язані до snapshotId, теж лишаються «current».

## Сценарій збою

`exclude: ["src/gen/**"]`, шари `app` і `gen`, правило `- deny app gen`, а `src/app/a.ts` імпортує `../gen/api`, якого ще немає. MCP `check` повертає `unverified`. Агент генерує `src/gen/api.ts`, і CLI `keylang check` тепер дає `1 fail` (K102). Наступний MCP `check` у тій самій сесії видає той самий `snapshotId` 767270d39a85 і `unverified`, тож агент вважає, що порушення немає (без --strict це не провал).

## Як відтворити

fx/t7: snapshotId before/after creating src/gen/api.ts both 767270d39a85…, coverage changes from unresolved-import to edge; check 0 fail/1 unverified -> 1 fail. In-process `currentAnalysis` (mcpstale.ts on fx/t7m): both calls print `767270d39a85 [["unverified","unresolved import \`../gen/api\` …"]]` while CLI check prints `1 fail, 0 unverified, 0 ok`

Доказ верифікатора:

> I reproduced this with the real CLI and with a real `keylang mcp` stdio session, in scratch fixtures under scratchpad/verify/ts-2-0/. HOME and XDG_* pointed at the scratch dir.
> 
> **Cause in the code**
> - `src/snapshot.ts:240-250` hashes only `manifestFiles`, which are the indexed files, plus config, grammars and `graph.resolverInputs`.
> - `src/map.ts:86-92` turns every excluded file (`tree.excluded`) and every outside file (`tree.outside`) into an opaque module via `opaqueFacts`. These lists only reach `buildSnapshot` as `skipped`, and `skipped` is not part of the hash.
> - `probe()` in `src/imports.ts:418-425` checks the disk with `existsSync`, but the result is not written to `this.inputs`.
> - So when a file appears under `exclude` or `outside`, the graph changes (a hole becomes an edge) while `snapshotId` stays the same.
> 
> **Fixture fx**
> - `keylang.json`: `{dir:"specs", languages:["typescript"], layers:{app:["src/app/**"], gen:["src/gen/**"]}, exclude:["src/gen/**"]}`
> - `specs/rules.md`: `- deny app gen`
> - `src/app/a.ts`: `import { api } from "../gen/api"; export function run(): void { api(); }`
> 
> **CLI: `node /home/kosmodev/pet_project/keylang/bin/keylang.js check --format json`**
> - Before the file exists: `"snapshotId": "2548c55e1bfe…"`, verdict `unverified`, evidence "unresolved import `../gen/api`", summary `0 fail, 1 unverified, 0 ok`.
> - After `echo 'export function api(): void {}' > src/gen/api.ts`: `"snapshotId": "2548c55e1bfe…"` (the same id), `"verdict": "fail"`, `"code": "K102"`, summary `1 fail, 0 unverified, 0 ok`.
> 
> **MCP over the real stdio protocol** (`mcpdrive.mjs`: initialize, then `tools/call check`, then create `src/gen/api.ts`, then `tools/call check` again):
> ```
> MCP before: 2548c55e1bfe [["unverified",null,"unresolved import `../gen/api` (src/app/a.ts:1:1)"]]
> MCP after : 2548c55e1bfe [["unverified",null,"unresolved import `../gen/api` (src/app/a.ts:1:1)"]]
> --- CLI now:
> src/app/a.ts:1:1: K102 divergence: `app.a` depends on `gen.api`, which is denied by `deny app gen` (specs/rules.md:3)
> 1 fail, 0 unverified, 0 ok
> ```
> I checked afterwards and no mcp process was left running.
> 
> **Same result for `outside`** (fixture fo, `outside:["scripts/**"]`, `src/app/a.ts` imports `../../scripts/s`): before and after creating `scripts/s.ts` the snapshotId stays `1968aed6b6bd…`, while the result goes from `0 fail, 1 unverified` to `K107`, `1 fail`.
> 
> **It contradicts the documented contract.** `docs/mcp-lsp.md:8` says every call answers "for the current state o …

## Що зробити

- Додати до хешу snapshotId відсортований перелік excluded- і outside-файлів (шлях, бажано з sha256) і результати `probe`/`existsSync` для не проіндексованих файлів (через `resolver.inputs`), а тоді виправити формулу в docs/snapshot.md.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/snapshot.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `tests/mcp.test.ts` «mcp: an excluded or outside file that appears or goes changes snapshotId…» — справжня MCP-сесія через stdio: `exclude: ["src/gen/**"]`, `outside: ["scripts/**"]`, `deny app gen`, `src/app/generated.ts` імпортує `../gen/api` і `../../scripts/tool`. До виправлення після появи `src/gen/api.ts` `snapshotId` не змінювався, і MCP `check` віддавав старе `unverified`; тепер id новий, є K102, id збігається з CLI `check --format json`; поява `scripts/tool.ts` дає новий id і K107; видалення `src/gen/api.ts` — новий id без K102.
- 2026-10-08: Виправлення: `src/snapshot.ts` — до хешу `snapshotId` додано відсортований перелік пропущених файлів (`skipped`: excluded, outside, поза вгаданими шарами) як `<kind> <path>` (вміст не потрібен: такий файл — opaque-модуль чи навмисно пропущена ціль, хоч би що в ньому). `src/imports.ts` `probe`: файл поза аналізом, знайдений на диску (`.d.ts`, тест, JSON), читається через `text()` і стає входом резолвера (`resolverInputs`), тож його поява чи зникнення теж змінює id. Зміна в `snapshot.ts` — один рядок у JSON хешу, маніфест не чіпав.
- 2026-10-08: Контракт: `docs/snapshot.md` — формула `snapshotId` (перелік пропущених файлів і входи резолвера). Перевірки: `node --test tests/mcp.test.ts tests/cli-map.test.ts tests/core.test.ts tests/fingerprint.test.ts tests/analyze.test.ts tests/cli-check.test.ts tests/metamorphic.test.ts` — 98/98, `npm run typecheck` — ок.
