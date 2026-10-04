# 05: K005 на `step planned <id>` не підказує окремий рядок `planned`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: кандидат 1, «Діагностика з першої спроби» (сесії 1 і 2; сесія 2 отримала K005 двічі й виправилась з третьої спроби), §10.6 («пошук синтаксису (K005)»).

**What to build:** Учасник, що хоче запланований крок, пише `- step planned users.billing.charge`. Отримує `K005 expected a single ID` на слові після `planned` — без жодного натяку, що `planned` — окрема декларація на верху потоку (format.md §5: `planned fn|module|type|event <id> [signature]`), а крок потім посилається на ID звичайним `step`.

Відтворення (master `c408f53`, тимчасовий TS-репо після `init`):

```markdown
# flow planned

- trigger main.main.main
- step users.users_service.createUser
  - step planned users.users_service.notify
```

`check` → `keylang/flows/planned.md:5:18: K005 expected a single ID`, код 1. Повідомлення формує `oneRef` у `src/parser.ts` (`"expected a single ID"`, reason `arguments`).

Після зміни, коли перший аргумент `step` чи `trigger` — слово `planned`, а за ним ID, K005 стоїть на `planned` і каже, як записати:

``K005 `planned` is a declaration, not a step modifier: add `- planned fn users.users_service.notify` at the top of the flow and keep `- step users.users_service.notify` ``

(Вид `fn` — типовий у підказці: з рядка кроку вид не відомий.) `reason` лишається `arguments`. Інші випадки «expected a single ID» не змінюються.

Поза цим тікетом: дозволити `step planned <kind> <id>` як скорочення — це зміна граматики (кандидат 1 пілоту, друга половина); окреме рішення після проби з людьми.

- [ ] фікстура: `- step planned a.b.c` і `- trigger planned a.b.c` дають новий текст K005 з колонкою слова `planned`; `- step a.b c` — старий `expected a single ID`
- [ ] `parse --json`, `check --format json` (`reason: "arguments"`) і LSP-діагностика несуть той самий текст
- [ ] format.md: виконуваний приклад (`diagnostics`) з новим текстом; `node --test tests/format-examples.test.ts` проходить
- [ ] `tests/fixtures/diagnostics.expected` змінюється лише там, де є `step planned`

Ключові файли: `src/parser.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments
