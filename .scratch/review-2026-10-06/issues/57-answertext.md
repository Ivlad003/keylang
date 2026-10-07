# 57: answerText зрізає кілька коротких абзаців підряд разом зі змістом пояснення

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `servers`, верифікація: confirmed.

**Місце:** `src/explain-llm.ts:74` (рецензент указав `src/explain-llm.ts:76`)

## Що не так

`answerText` повторює `withoutRemark` у циклі до стабільного стану. Тому відкидається не лише перший абзац-ремарка, як обіцяє cli.md («перший абзац-ремарку»), а кожен наступний абзац із менш ніж чотирма словами або з `:` у кінці. Українські речення короткі, тож губиться головне речення пояснення.

## Сценарій збою

Модель на `explain <id> --llm` (short) відповідає «Підсумовує ціни позицій.\n\nПовертає нуль.\n\nВикликається лише з checkout…». Збережено лише останній абзац, бо перші два речення по суті визнано «ремарками». Файл позначено fresh і повторно не запитується.

## Як відтворити

Фейковий Anthropic (`stop_reason:end_turn`, REPLY з трьох абзаців), `keylang explain domain.order.total --llm` у repo2. Файл `keylang/explain/domain.order.total.md` містить лише `Викликається лише з checkout, тому від'ємні ціни тут не перевіряються.` Пряма перевірка `answerText("Entry point.\n\nStarts the CLI.\n\nIt parses argv…")` дає лише `"It parses argv and dispatches commands to the operations."`.

Доказ верифікатора:

> I reproduced this through the real CLI, using a fake `claude` CLI and no network.
> 
> **Fixture.** Scratch dir `scratchpad/verify/servers-4-0/`. I copied `tests/fixtures/repo` to `repo/` and created `bin/claude`, a `/bin/sh` wrapper that runs `tests/fixtures/fake-agent.mjs` with `FAKE_AGENT_AS=claude`.
> 
> **Run 1.** From inside `repo/`:
> ```
> REPLY=$'Підсумовує ціни позицій.\n\nПовертає нуль.\n\nВикликається лише з checkout, тому від\'ємні ціни тут не перевіряються.'
> env HOME=$S/home XDG_CACHE_HOME=... XDG_CONFIG_HOME=... PATH=$S/bin:/usr/bin:/bin FAKE_AGENT_LOG=$S/log FAKE_AGENT_REPLY="$REPLY" KEYLANG_AGENT=cli:claude node .../bin/keylang.js explain domain.order.total --llm
> ```
> - stdout: `Викликається лише з checkout, тому від'ємні ціни тут не перевіряються.` then `cli:claude · 2026-10-06 · fresh`, exit=0.
> - `keylang/explain/domain.order.total.md` contains only the header line and the third paragraph. The first two paragraphs are gone.
> 
> **Run 2.** I ran the same command again. It printed the saved text as `fresh`, and `log/` still held only `1.json`, so there was no second request. The truncated answer stays until a closure changes.
> 
> **Direct calls** to `answerText` via `node -e import('./src/explain-llm.ts')`:
> - `"Sure!\n\nIt sums.\n\nIt folds.\n\nThe total is returned to the checkout flow."` returns `"The total is returned to the checkout flow."`. Under the documented contract only `Sure!` should go.
> - `"Certainly!\n\nSums prices.\n\nIt returns zero for an empty list of items."` returns only the last paragraph.
> - `"Entry point.\n\nStarts the CLI.\n\nIt parses argv…"` returns only the last paragraph, as the claim says.
> 
> **Cause.** `src/explain-llm.ts:74-81`: `answerText` repeats `withoutRemark(unfenced(text))` in a `for(;;)` loop until nothing changes. On each pass `withoutRemark` drops the leading paragraph if it has fewer than four words or ends with `:`. So every short paragraph in a row is removed, not just one.
> 
> **Contract.** `docs/cli.md` (the `explain <id> --llm` section) says only the first paragraph is stripped, quoting «перший абзац-ремарку, коли після нього є ще текст». The doc comment on `answerText` says the same: «a leading remark paragraph». The tests in `tests/review-ops.test.ts:306-333` and `tests/tui-explain.test.ts:375` only cover one remark, or one remark plus a fence. The loop is there for the remark-then-fence case, and nothing documents stripping several paragraphs.
> 
> **Review status.** Item 8 of the operations table in `docs/review-2026-1 …

## Що зробити

- Прибрати цикл до стабільного стану: unfenced → withoutRemark рівно один раз → unfenced ще раз (для «Certainly!\n\n```…```»), тоді зріжеться лише перший абзац-ремарка, як каже cli.md; додати тест із двома короткими абзацами після ремарки.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/explain-llm.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
