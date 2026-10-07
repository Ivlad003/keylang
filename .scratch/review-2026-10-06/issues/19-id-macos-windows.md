# 19: Збережені пояснення вузлів, чиї ID відрізняються лише регістром, перезаписують одне одне на macOS і Windows

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-cross-platform-fs`, верифікація: confirmed.

**Місце:** `src/explanations.ts:58` (рецензент указав `src/explanations.ts:57`)

## Що не так

`explanationPath` бере для файла пояснення сирий ID (`<dir>/explain/<id>.md`, `brief/<id>.md`). Тип `Order` і fn `order` в одному модулі (так само `struct Config` + `fn config()`, `class Settings` + `def settings()`) на нечутливій до регістру ФС пишуться в один файл. Друге `explain --llm` затирає перше, оплачене моделлю, а `loadBriefs`/`storedIds` бачать лише одне ім'я з диска.

## Сценарій збою

`explain domain.order.order --llm`, потім `explain domain.order.Order --llm`. На Linux лишаються два файли. На macOS лишається один `domain.order.order.md` з текстом про інтерфейс. Офлайн `explain domain.order.order` показує «The interface Order is the record of a purchase.» як пояснення функції (позначене stale), пояснення функції втрачено, а `explain domain.order.Order` показує той самий файл як свій.

## Як відтворити

Фікстура scratchpad/review/cross-platform-fs/e1 (agent `cli:claude`, фейковий claude з tests/fixtures/fake-agent.mjs першим на PATH, HOME у scratch). Linux: `ls keylang/explain`, тобто `domain.order.order.md domain.order.Order.md`. Через ./cf.sh: лише `domain.order.order.md`, а `explain domain.order.order` друкує `The interface Order is the record of a purchase.` / `cli:claude · 2026-10-06 · stale`.

Доказ верифікатора:

> I reproduced this myself at HEAD 45cc74d with my own fixture in scratchpad/verify/x-cross-platform-fs-3-0. The fixture has keylang.json `{languages:[typescript], layers:{domain:"src/domain/**"}, agent:"cli:claude"}` and src/domain/order.ts with `export interface Order {...}` and `export function order(id): Order`. The fake agent is tests/fixtures/fake-agent.mjs, wrapped as fakebin/claude and placed first on PATH. HOME and XDG_* point into scratch. No network was used.
> 
> Script run.sh: `keylang map`, then `FAKE_AGENT_REPLY="The function order builds an empty order." keylang explain domain.order.order --llm`, then `FAKE_AGENT_REPLY="The interface Order is the record of a purchase." keylang explain domain.order.Order --llm`, then `ls keylang/explain`, then offline `explain` of both IDs.
> 
> 1) Linux ext4 (case-sensitive). Files: `domain.order.order.md` and `domain.order.Order.md`. Each offline explain prints its own text and is marked `fresh`. keylang accepts both IDs (no K002), so they really are two different nodes.
> 
> 2) The same script on a case-folding tmpfs: `unshare -rm sh -c 'mount -t tmpfs -o casefold none $V/mnt; mkdir $V/mnt/p; chattr +F $V/mnt/p; cp -r fix/. mnt/p; cd mnt/p; sh run.sh'`. A sanity check (`touch A; ls a`) confirmed the folding works. Both `--llm` calls exit 0 and print `fresh`, with no warning. Observed output:
> `--- files` / `domain.order.order.md` (one file only)
> `--- offline fn` / `fn domain.order.order (id: string) → Order` ... `The interface Order is the record of a purchase.` / `cli:claude · 2026-10-06 · stale`
> `--- offline type` / `type domain.order.Order` ... `The interface Order is the record of a purchase.` / `cli:claude · 2026-10-06 · fresh`
> So the paid explanation of the function is overwritten silently, and the function shows the interface's text as its own.
> 
> Code path: `explanationPath` (src/explanations.ts:57-59) builds `<dir>/explain/<id>.md` or `brief/<id>.md` from the raw ID, with no case encoding. Every reader and writer goes through it or through `storedIds` (src/explanations.ts:67-74): operations/explain.ts:98 (single write), :318 (batch briefs), explain-offline.ts:100, explain-llm.ts:25/31, tui/app.ts:2174. `loadBriefs` is used by map/mcp/lsp/export/tui. `storedIds` returns only the name that is on disk, so the other ID's brief is missing or belongs to the wrong node. The comment on `SYSTEM_ID` shows the authors cared about file-name collisions (`@system` vs `system`) but not about case-only ones.
> 
> Contract: neither d …

## Що зробити

- Кодувати регістр в імені файла пояснення (напр. екранувати великі літери або додавати короткий хеш ID, коли ID збігаються без урахування регістру) і читати через ту саму функцію в storedIds/loadBriefs, щоб `Order` і `order` не ділили файл на нечутливій до регістру ФС.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/explanations.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
