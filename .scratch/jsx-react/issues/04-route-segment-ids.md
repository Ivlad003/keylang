# 04: Оборотне кодування сегментів `(shop)` і `[id]` в ID модуля

**Джерело:** research «Пропозиція» п. 5; «Що перевірено» абзац про `layerName`; «Зіткнення» рядок `(shop)`.

**What to build:** Каталоги Next-стилю `(shop)`, `[id]`, `[...slug]` дають різні й оборотні сегменти ID замість спільного `_shop_` / `_id_`. Кодування змінюється лише для сегмента, який не є валідним сегментом ID, і лише для дужок; сегменти без дужок (`cats.controller` → `cats_controller`) і ID усіх наявних фікстур не змінюються. `(shop)`, `[shop]` і каталог `_shop_` дають три різні ID; `(id)` і `[id]` — різні. Ребро layout→page з файлової системи не додається. Це зміна ID модулів лише для репозиторіїв з дужками в шляхах; для них specs, що посилалися на старий `_shop_`, отримають діагностику про невідомий ID — це очікувано і має бути названо в підсумку.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] Юніт-тест кодування: `(shop)`, `[shop]`, `_shop_`, `(id)`, `[id]`, `[...slug]`, `[[...slug]]` — усі різні, кожен валідний сегмент ID; звичайні сегменти (`cats.controller`, `my-dir`, `1st`) кодуються як раніше
- [x] Фікстура з `app/(shop)/cart/page.tsx` і `app/[id]/page.tsx`: карта показує два різні модулі, `check` резолвить посилання за новими ID
- [x] `tests/fixtures/repo.expected` та інші expected-карти не змінилися
- [x] `docs/format.md` (розділ про ID) описує кодування дужок
- [x] `npm run typecheck`, `npm test`, `node bin/keylang.js map --check` зелені

## Comments

### Shift 1 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 432293 in / 8745 out tokens, $0.0000, 9 turns
- Time: 1m 17s
- Verify: passed
- Outcome: needs-info: verify gate passed but no shift changed anything: the gate doesn't test this ticket
- Branch kept: shiftwork/jsx-react-04

### Shift 2 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 1223508 in / 24182 out tokens, $0.0000, 16 turns
- Time: 4m 6s (ticket total 4m 6s)
- Verify: passed
- Outcome: needs-info: verify gate passed but no shift changed anything: the gate doesn't test this ticket
- Branch kept: shiftwork/jsx-react-04

### Shift 3 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 2973429 in / 46714 out tokens, $0.0000, 30 turns
- Time: 6m 32s (ticket total 6m 32s)
- Verify: failed at `npm test` (exit 1)

```
ms)
✔ wire: a failing factory disposes what was built and rethrows (454.167776ms)
✔ wire: a factory whose parameter does not accept the wired dependency fails tsc (1128.895053ms)
✔ wire --check: a stale file is exit 1 and is not rewritten; a manual file is never overwritten (1132.991369ms)
✔ wiring: a cycle is K301, a module as factory K302, a malformed condition K005, a denied dependency K102; wire writes nothing (739.946694ms)
✔ wiring: the generated file is code in its layer; `check` holds it to the same rules (759.357911ms)
✔ wiring: fmt is idempotent on `# wiring` and keeps its meaning (973.002106ms)
✔ wire: a default export, an alias, IDs that collapse to one name (`memory-db`, `memory.db`, `memory_db`) — the generated file type-checks and runs (1822.705476ms)
✔ wire: a static method is a factory or a decorator called on its class, a default-exported class included; the file type-checks and runs (1599.692949ms)
✔ wire: under nodenext a JS source keeps `.js` and `.mts` becomes `.mjs`; the emitted file loads in Node (1185.124167ms)
✔ wiring: K302 for compose on a module, a type or a class, a method, an unexported fn and Python code; K002 for a dependency named twice; K102 names the deny rule; wire writes nothing (762.934016ms)
✔ wire: any error on a `# wiring` line blocks it — K003 indentation included; nothing written (367.164179ms)
✔ wire --out: an absolute path, `..`, a link out of the repository or a non-TS file is exit 2 with nothing written; a missing directory is created (1759.192266ms)
✔ wiring: a `when` value is compared as written — `a,b` is one value, whatever the canonical text of the item (497.644179ms)
✔ wire: when a factory fails and a disposer fails too, the factory's error stays first (454.308626ms)
ℹ tests 583
ℹ suites 0
ℹ pass 579
ℹ fail 3
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 588579.790844

✖ failing tests:

test at tests/cli.test.ts:252:1
✖ map links are relative, encoded, and round-trip (1216.309753ms)
  Error: missing node main.app._shop_.page
      at findNode (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/cli.test.ts:344:9)
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/cli.test.ts:294:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1537:19)
      at Test.run (node:internal/test_runner/test:1462:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)

test at tests/cli.test.ts:306:1
✖ generated maps of the repo and the fixture parse (4378.517947ms)
  AssertionError [ERR_ASSERTION]: committed keylang map is stale
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/cli.test.ts:310:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1537:19)
      at Test.run (node:internal/test_runner/test:1462:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/lsp.test.ts:439:1
✖ lsp: definition from the map opens the decoded file at the code position (744.266809ms)
  TypeError: Cannot read properties of null (reading 'uri')
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/lsp.test.ts:459:25)
      at async Test.run (node:internal/test_runner/test:1404:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
```

- Outcome: new attempt
### Handoff — shift 3, grok:grok-4.7 → opencode:opencode-go/deepseek-v4.1-flash, reason: budget.maxTokens (3020143 / 3000000)
- Last output:

```
Спочатку прочитаю тікет і специфікацію, щоб зрозуміти контракт оборотного кодування сегментів маршруту.
Попередні зміни не чіпали кодування ID. Шукаю, де сегменти шляху перетворюються на ID модуля.
Кодування лишається старим для імен без дужок. Сегмент із `( ) [ ]`, який не є валідним ID, кодується оборотно через `$` і два шістнадцяткові байти UTF-8.
```

- Diff stat:

```
M docs/format.md
 M src/config.ts
docs/format.md |  4 +++-
 src/config.ts  | 57 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 59 insertions(+), 2 deletions(-)
```

- Verify failure: `npm test` (exit 1)

### Shift 4 — opencode opencode-go/deepseek-v4.1-flash (low)
- Ended: budget
- Usage: 187523 in / 1583 out tokens, $0.0158, 6 turns
- Time: 21s (ticket total 6m 53s)
- Verify: failed at `npm test` (exit 1)

```
9ms)
✔ wire: a failing factory disposes what was built and rethrows (437.607334ms)
✔ wire: a factory whose parameter does not accept the wired dependency fails tsc (1136.475798ms)
✔ wire --check: a stale file is exit 1 and is not rewritten; a manual file is never overwritten (1109.687265ms)
✔ wiring: a cycle is K301, a module as factory K302, a malformed condition K005, a denied dependency K102; wire writes nothing (716.039782ms)
✔ wiring: the generated file is code in its layer; `check` holds it to the same rules (714.332687ms)
✔ wiring: fmt is idempotent on `# wiring` and keeps its meaning (985.486048ms)
✔ wire: a default export, an alias, IDs that collapse to one name (`memory-db`, `memory.db`, `memory_db`) — the generated file type-checks and runs (1827.509712ms)
✔ wire: a static method is a factory or a decorator called on its class, a default-exported class included; the file type-checks and runs (1537.819019ms)
✔ wire: under nodenext a JS source keeps `.js` and `.mts` becomes `.mjs`; the emitted file loads in Node (1155.177146ms)
✔ wiring: K302 for compose on a module, a type or a class, a method, an unexported fn and Python code; K002 for a dependency named twice; K102 names the deny rule; wire writes nothing (734.90504ms)
✔ wire: any error on a `# wiring` line blocks it — K003 indentation included; nothing written (361.320374ms)
✔ wire --out: an absolute path, `..`, a link out of the repository or a non-TS file is exit 2 with nothing written; a missing directory is created (1760.160751ms)
✔ wiring: a `when` value is compared as written — `a,b` is one value, whatever the canonical text of the item (502.836558ms)
✔ wire: when a factory fails and a disposer fails too, the factory's error stays first (425.771617ms)
ℹ tests 583
ℹ suites 0
ℹ pass 579
ℹ fail 3
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 615100.929875

✖ failing tests:

test at tests/cli.test.ts:252:1
✖ map links are relative, encoded, and round-trip (1236.327099ms)
  Error: missing node main.app._shop_.page
      at findNode (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/cli.test.ts:344:9)
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/cli.test.ts:294:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1537:19)
      at Test.run (node:internal/test_runner/test:1462:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)

test at tests/cli.test.ts:306:1
✖ generated maps of the repo and the fixture parse (4518.912012ms)
  AssertionError [ERR_ASSERTION]: committed keylang map is stale
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/cli.test.ts:310:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1537:19)
      at Test.run (node:internal/test_runner/test:1462:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/lsp.test.ts:439:1
✖ lsp: definition from the map opens the decoded file at the code position (737.473321ms)
  TypeError: Cannot read properties of null (reading 'uri')
      at TestContext.<anonymous> (file:///home/kosmodev/.cache/shiftwork/worktrees/keylang-6b902bc0/jsx-react-04/tests/lsp.test.ts:459:25)
      at async Test.run (node:internal/test_runner/test:1404:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
```

- Outcome: new attempt
### Handoff — shift 4, opencode:opencode-go/deepseek-v4.1-flash → grok:grok-4.7, reason: budget.stallTurns (5 / 5)

- Diff stat:

```
M docs/format.md
 M src/config.ts
docs/format.md |  4 +++-
 src/config.ts  | 57 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 59 insertions(+), 2 deletions(-)
```

- Verify failure: `npm test` (exit 1)

### Shift 5 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 2978604 in / 45232 out tokens, $0.0000, 35 turns
- Time: 18m 16s (ticket total 25m 9s)
- Verify: passed
- Outcome: needs-info: verify gate failed on the branch rebased onto a99b706 (`npm test`)
- Target moved to a99b706: branch rebased onto it, verify gate re-run: failed at `npm test` (1)

### Manual merge — 2026-10-01
- Гілку перебазовано на `2d11b25` (після 05). Конфлікт у `docs/format.md`: правки 05 і 04 в одному абзаці, злито обидві. `keylang/map-explained/README.md` перегенеровано.
- Формат змінено на вимогу людини: hex `$28shop$29` замінено читабельними префіксами для цілої форми маршруту Next. `(x)` → `$g-x`, `[x]` → `$p-x`, `[...x]` → `$all-x`, `[[...x]]` → `$opt-x`. Інші імена з дужками (`(my shop)`, `(.)photo`) лишаються `$HH`. Каталог `$g-shop` ділить ID з `(shop)`, це задокументовано. ID з `$` у shell треба брати в одинарні лапки.
- Verify пройдено: `npm run typecheck`, `npm test` (585 pass, 0 fail), `node bin/keylang.js map --check`, `node bin/keylang.js check`.
- Landed: fast-forward `master` → `c3ef9b7`.
