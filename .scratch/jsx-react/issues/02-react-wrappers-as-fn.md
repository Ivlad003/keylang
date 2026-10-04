# 02: `memo` / `forwardRef` / `lazy` з `react` розгортаються у fn

**Джерело:** research «Пропозиція» п. 3; «Зіткнення» рядок `forwardRef`; «Що потрібно» крок 4.

**What to build:** `const Cart = memo(() => …)`, `forwardRef((props, ref) => …)`, `lazy(() => import(…))` стають fn `Cart` з викликами тіла обгорнутої функції, лише коли callee резолвиться в імпорт саме з `react` і декларація — `const`. `<Cart />` з тікета 01 після цього резолвиться у fn, а не у value. `const X = forwardRef(() => Mod)` з `@nestjs/common` лишається value, а `forwardRef` — звичайним викликом модуля; знімок Nest не змінюється. Будь-яка інша обгортка (`styled(...)`, `observer(...)`, локальна `memo`) лишається value.

**Blocked by:** 01 <!-- 01 — спільна фікстура `.tsx` і регресійна фікстура `.ts` -->

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] Фікстура: `import { memo, forwardRef, lazy } from "react"` — три `const` є fn, їхні внутрішні виклики зібрано; `import React from "react"; React.memo(...)` — теж fn або явно задокументована дірка
- [ ] `import { forwardRef } from "@nestjs/common"; const X = forwardRef(() => Mod)` — value, виклик `forwardRef` у `moduleCalls`, декларації як до зміни
- [ ] Локальна `function memo(f) {}` та `const Cart = memo(...)` без імпорту з `react` — value
- [ ] Експорт `export const Cart = memo(...)` має `kind: "fn"` в `exportRows`
- [ ] Регресійна фікстура `.ts` із тікета 01 та `tests/fixtures/repo.expected` не змінилися; `EXTRACTOR_VERSION` не піднято
- [ ] `docs/format.md` або `docs/design.md`: один рядок про обгортки за імпортом, не за текстом
- [ ] `npm run typecheck`, `npm test` зелені

## Comments

### Shift 1 — opencode opencode-go/kimi-k3 (medium)
- Ended: budget
- Usage: 197451 in / 1076 out tokens, $0.6263, 9 turns
- Time: 7m 12s
- Verify: failed at `npm test` (exit 124)

```
n      "line": 1,\n      "col": 1,\n      "endLine": 1,\n      "endCol": 50,\n      "text": "import { buy } from \\"../application/purchase.ts\\";",\n      "resolution": "resolved",\n      "provenance": "syntactic"\n    },\n    {\n      "kind": "call",\n      "source": "presentation.terminal.checkout",\n      "target": "application.purchase.buy",\n      "file": "src/presentation/terminal.ts",\n      "line": 3,\n      "col": 3,\n      "endLine": 3,\n      "endCol": 6,\n      "text": "buy",\n      "resolution": "resolved",\n      "provenance": "syntactic"\n    }\n  ],\n  "exports": [\n    {\n      "module": "application.purchase",\n      "name": "buy",\n      "symbol": "application.purchase.buy",\n      "kind": "fn"\n    },\n    {\n      "module": "domain.order",\n      "name": "create",\n      "symbol": "domain.order.create",\n      "kind": "fn"\n    },\n    {\n      "module": "infrastructure.store",\n      "name": "save",\n      "symbol": "infrastructure.store.save",\n      "kind": "fn"\n    },\n    {\n      "module": "presentation.terminal",\n      "name": "checkout",\n      "symbol": "presentation.terminal.checkout",\n      "kind": "fn"\n    }\n  ],\n  "coverage": [],\n  "stats": {\n    "files": 4,\n    "modules": 4,\n    "fns": 4,\n    "types": 0,\n    "deps": 3,\n    "callsResolved": 3,\n    "callsUnresolved": 0,\n    "callsExternal": 0,\n    "callsDynamic": 0,\n    "importsUnresolved": 0,\n    "unassignedFiles": 0\n  }\n}\n', 'keylang/flows/checkout.md' => '# flow checkout\n\nCheckout from the terminal.\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n  - step domain.order.create\n  - step infrastructure.store.save\n', 'keylang/map/application.md' => '<!-- keylang:generated â\x80\x94 Ð½Ðµ Ñ\x80ÐµÐ´Ð°Ð³Ñ\x83Ð²Ð°Ñ\x82Ð¸, `keylang map` -->\n\n# map\n\n- application\n  - module [purchase](../../src/application/purchase.ts#L1)\n    - order domain.order\n    - store infrastructure.store\n    - fn [buy](../../src/application/purchase.ts#L3) () â\x86\x92 void\n      - calls domain.order.create, infrastructure.store.save\n', 'keylang/map/domain.md' => '<!-- keylang:generated â\x80\x94 Ð½Ðµ Ñ\x80ÐµÐ´Ð°Ð³Ñ\x83Ð²Ð°Ñ\x82Ð¸, `keylang map` -->\n\n# map\n\n- domain\n  - module [order](../../src/domain/order.ts#L1)\n    - fn [create](../../src/domain/order.ts#L1) () â\x86\x92 void\n', 'keylang/map/infrastructure.md' => '<!-- keylang:generated â\x80\x94 Ð½Ðµ Ñ\x80ÐµÐ´Ð°Ð³Ñ\x83Ð²Ð°Ñ\x82Ð¸, `keylang map` -->\n\n# map\n\n- infrastructure\n  - module [store](../../src/infrastructure/store.ts#L1)\n    - fn [save](../../src/infrastructure/store.ts#L1) () â\x86\x92 void\n', 'keylang/map/presentation.md' => '<!-- keylang:generated â\x80\x94 Ð½Ðµ Ñ\x80ÐµÐ´Ð°Ð³Ñ\x83Ð²Ð°Ñ\x82Ð¸, `keylang map` -->\n\n# map\n\n- presentation\n  - module [terminal](../../src/presentation/terminal.ts#L1)\n    - purchase application.purchase\n    - fn [checkout](../../src/presentation/terminal.ts#L2) () â\x86\x92 void\n      - calls application.purchase.buy\n', 'keylang/rules.md' => '# rules\n\n- layers domain < infrastructure < application < presentation\n', 'keylang.json' => '{\n  "languages": [\n    "typescript"\n  ],\n  "layers": {\n    "domain": [\n      "src/domain/**"\n    ],\n    "application": [\n      "src/application/**"\n    ],\n    "infrastructure": [\n      "src/infrastructure/**"\n    ],\n    "presentation": [\n      "src/presentation/**"\n    ]\n  },\n  "check": {\n    "trace": ".keylang/trace/*.jsonl"\n  }\n}\n', 'src/application/purchase.ts' => 'import { create } from "../domain/order.ts";\nimport { save } from "../infrastructure/store.ts";\nexport function buy(): void {\n  create();\n  save();\n}\n', 'src/domain/order.ts' => 'export function create(): void {}\n', 'src/infrastructure/store.ts' => 'export function save(): void {}\n', 'src/presentation/terminal.ts' => 'import { buy } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy();\n}\n' },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

- Outcome: new attempt
### Handoff — shift 1, opencode:opencode-go/kimi-k3 → claude:claude-opus-5-5, reason: budget.stallTurns (8 / 8)
- Last output:

```
Я у worktree тікета. Тепер читаю контекст: тікет 01, ресерч і код екстрактора.
Тепер читаю ключовий файл екстрактора.
Тепер подивлюся на тести з тікета 01 та контракти фактів.
```

- Diff stat:

```
M src/extract/ts.ts
src/extract/ts.ts | 59 ++++++++++++++++++++++++++++++++++++++++++++++++++++---
 1 file changed, 56 insertions(+), 3 deletions(-)
```

- Verify failure: `npm test` (exit 124)

### Shift 2 — claude claude-opus-5-5 (high)
- Ended: stop, error: Claude seven_day usage limit reached (allowed_warning). It resets at 2026-10-03T17:00:00.000Z
- Usage: 869346 in / 361 out tokens, $0.7421, 16 turns
- Time: 2m 0s (ticket total 9m 12s)
- Verify: not run
- Outcome: new attempt
- Provider limit: usage on claude, cooling until 2026-10-03T17:00:00.000Z; continuing without counting an attempt

### Shift 3 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 466246 in / 14238 out tokens, $0.0000, 9 turns
- Time: 2m 22s (ticket total 11m 33s)
- Verify: failed at `npm test` (exit 124)

```
ep the terminal shows (654.713053ms)
✔ web: flow → hover a step → go to the code gives the terminal's screen (606.998919ms)
✔ web: another tab takes the session over without ending it, and the old tab stops driving it (433.226819ms)
✔ web: a reset without the token, oversized sizes and bad frames do not take the server down (828.757249ms)
✔ web: Ctrl+C stops the server with a socket that never upgraded (529.36991ms)
✔ web: resize, paste and Unicode, and a reconnect to the same session (711.27078ms)
✔ web: --port must be a number (281.05019ms)
✔ web: Ctrl+R records from the browser's microphone over the same socket; the speech reaches the recognizer (552.359723ms)
✔ web: a request whose target is no URL gets 400, and the server keeps running (402.175121ms)
✔ web: a megabyte input frame in one session leaves the server answering the others (775.164534ms)
✔ web: a session that cannot be opened says so and closes with 4001 (25.303108ms)
✔ web: a tab closed while it records ends the recording instead of leaving it waiting (277.744403ms)
✔ web: t switches the map to the explained map on the same node, the screen the terminal shows (589.828776ms)
✔ web: init → new feature → edit → read → map → feature over the real transport leaves the terminal's files and records; code opens in the viewer, not $EDITOR (1844.621806ms)
✔ web: the whole cycle — init → config → new feature → check → spec-to-code → proposals and MERGE → an outside proposal → map → feature done — gives the terminal's records and files over the real transport (3389.155671ms)
✔ web: a dropped socket leaves a running map write to its session; the reconnect shows one record with its progress and result, the disk matches it, and Cancel works after a reconnect (848.662578ms)
✔ web: a tab that lost its session to another starts nothing; the new owner's run is the only one (473.957893ms)
✔ web: the expiry of a detached session and server.close() cancel a held write; nothing is written after them and no job is left (631.328418ms)
✔ wire: generates a typed wire() that tsc accepts; each factory is built once, dependencies first, disposed newest first (2112.525173ms)
✔ wire: a failing factory disposes what was built and rethrows (454.611109ms)
✔ wire: a factory whose parameter does not accept the wired dependency fails tsc (1151.039495ms)
✔ wire --check: a stale file is exit 1 and is not rewritten; a manual file is never overwritten (1230.660445ms)
✔ wiring: a cycle is K301, a module as factory K302, a malformed condition K005, a denied dependency K102; wire writes nothing (888.009926ms)
✔ wiring: the generated file is code in its layer; `check` holds it to the same rules (809.532515ms)
✔ wiring: fmt is idempotent on `# wiring` and keeps its meaning (2125.788165ms)
✔ wire: a default export, an alias, IDs that collapse to one name (`memory-db`, `memory.db`, `memory_db`) — the generated file type-checks and runs (3373.613548ms)
✔ wire: a static method is a factory or a decorator called on its class, a default-exported class included; the file type-checks and runs (2807.147139ms)
✔ wire: under nodenext a JS source keeps `.js` and `.mts` becomes `.mjs`; the emitted file loads in Node (1473.44521ms)
✔ wiring: K302 for compose on a module, a type or a class, a method, an unexported fn and Python code; K002 for a dependency named twice; K102 names the deny rule; wire writes nothing (812.897902ms)
✔ wire: any error on a `# wiring` line blocks it — K003 indentation included; nothing written (376.985626ms)
✔ wire --out: an absolute path, `..`, a link out of the repository or a non-TS file is exit 2 with nothing written; a missing directory is created (1831.515545ms)
✔ wiring: a `when` value is compared as written — `a,b` is one value, whatever the canonical text of the item (529.134832ms)
✔ wire: when a factory fails and a disposer fails too, the factory's error stays first (481.315331ms)
ℹ tests 583
ℹ suites 0
ℹ pass 582
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 803112.212771
```

- Outcome: new attempt
### Handoff — shift 3, grok:grok-4.7 → claude:claude-opus-5-5, reason: budget.stallTurns (8 / 8)
- Last output:

```
Починаю з тікета й специфікації, щоб зрозуміти, що саме має розгортати `memo` / `forwardRef` / `lazy` у функцію.
Попередня зміна в `src/extract/ts.ts` не пройшла тести. Дивлюсь diff, екстрактор і фікстури тікета 01.
```

- Diff stat:

```
M docs/format.md
 M keylang/map-explained/README.md
 M keylang/map-explained/extract.md
 M keylang/map/extract.md
 M src/extract/ts.ts
 M tests/analyzer.test.ts
docs/format.md                   |   2 +-
 keylang/map-explained/README.md  |   4 +-
 keylang/map-explained/extract.md | 119 ++++++++++++++++----------------
 keylang/map/extract.md           | 118 ++++++++++++++++----------------
 src/extract/ts.ts                |  59 +++++++++++++++-
 tests/analyzer.test.ts           | 143 +++++++++++++++++++++++++++++++++++++++
 6 files changed, 323 insertions(+), 122 deletions(-)
```

- Verify failure: `npm test` (exit 124)

### Shift 4 — grok grok-4.7 (medium)
- Ended: budget
- Usage: 499164 in / 15368 out tokens, $0.0000, 9 turns
- Time: 2m 45s (ticket total 2m 45s)
- Verify: passed
- Outcome: resolved
- Target moved to 9cdaefa: branch rebased onto it, verify gate re-run: passed
- Landed: merged shiftwork/jsx-react-02 into master
