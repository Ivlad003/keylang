# 56: LSP і validate_spec читають інший набір специфікацій, ніж check

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `servers`, верифікація: confirmed.

**Місце:** `src/analyze.ts:82` (рецензент указав `src/analyze.ts:82`)

## Що не так

Overlay-файл `.md` додається до специфікацій, якщо він лежить будь-де під `<dir>`. `walkDir` (`check`) натомість пропускає приховані теки, `node_modules` і `target`. Крім того, MCP `validate_spec` для шляху всередині кореня, але поза `<dir>`, повертає порожні `diagnostics`/`verdicts`, хоча `check` цей файл не читає зовсім. В обох випадках редактор чи агент бачить «чисто» там, де `check` дає fail.

## Сценарій збою

1) У редакторі відкрито `keylang/.drafts/plan.md` з `planned fn domain.order.refund`. LSP-діагностика `keylang/features/r.md` показує `ID unverified … planned fn` без K001, а `keylang check` дає `K001 dangling reference domain.order.refund` (1 fail). 2) Агент за SKILL викликає `validate_spec {path:"notes/x.md"}` (або `features/x.md` з неправильним `dir`) з висячим посиланням і отримує `{diagnostics:[],verdicts:[]}`, тобто виглядає валідним.

## Як відтворити

repo2: `keylang check keylang/features/r.md` дає `K001 … 1 fail`. Для того самого файла LSP-клієнт (lspclient.mjs + lsp1.mjs: didOpen `.drafts/plan.md` і `features/r.md`, потім `textDocument/diagnostic`) повертає `[["ID","ok domain.order.total"],["ID","unverified domain.order.refund: planned fn"],…]` без K001. MCP-клієнт (mcpclient.mjs) на `validate_spec {"path":"notes/x.md","text":"# flow a\n\n- trigger domain.order.totl\n"}` повертає `{"diagnostics":[],"verdicts":[]}`, а для `keylang/x.md` з тим самим текстом — K001.

Доказ верифікатора:

> I reproduced both halves on a copy of tests/fixtures/repo at scratchpad/verify/servers-3-0/repo, with HOME and XDG_* pointed at scratch.
> 
> Fixture:
> - keylang/features/r.md: `# flow refund` / `- trigger domain.order.total` / `  - step domain.order.refund`
> - keylang/.drafts/plan.md: `# flow plan` / `- planned fn domain.order.refund (order: Order) → number`
> 
> **1) LSP vs check (hidden directory under `<dir>`)**
> - `node bin/keylang.js check` → `keylang/features/r.md:4:10: K001 dangling reference domain.order.refund ... 1 fail, 0 unverified, 5 ok`, exit=1. walkDir skips `.drafts`.
> - My LSP client ($S/lspclient.mjs: initialize, didOpen, then textDocument/diagnostic):
>   - With only r.md open: `[["K001","dangling reference ..."],["ID","ok domain.order.total: exact"]]`, which matches check.
>   - With .drafts/plan.md and r.md open: `[["ID","ok domain.order.total: exact"],["ID","unverified domain.order.refund: planned fn"],["static","unverified domain.order.refund: planned fn, not implemented"]]`. K001 is gone.
> - Cause: src/analyze.ts:82 adds every overlay `.md` with `specs.some(spec => within(abs, spec))`. It does not apply the same exclusions as collectMdFiles/walkDir (src/files.ts:51: hidden dirs, `target`, `node_modules`).
> - docs/semantics.md:26 documents that check excludes hidden dirs, `node_modules` and `target`. docs/mcp-lsp.md:27 promises that LSP diagnostics "збігаються з check --format json для файла". That promise breaks in this case.
> 
> **2) MCP validate_spec outside `<dir>`**
> - My MCP client ($S/mcpclient.mjs) sent validate_spec with text `# flow a\n\n- trigger domain.order.totl\n`:
>   - `notes/x.md` → `{"file":"notes/x.md","diagnostics":[],"verdicts":[]}`
>   - `features/x.md` (missing the `keylang/` prefix) → `{"diagnostics":[],"verdicts":[]}`
>   - `keylang/x.md` → K001 `dangling reference domain.order.totl (did you mean domain.order.total?)` plus an ID fail
>   - `keylang/.drafts/x.md` → also K001. So validate_spec does check a hidden-dir path that check itself never reads.
> - Cause: src/mcp.ts:241-245 rejects only paths outside the root. analyze() then drops the overlay because the path is not under `<dir>`, and the filter at :246-251 returns empty arrays with no error.
> - docs/mcp-lsp.md:17 says validate_spec "розбирає text як специфікацію за path". In this case nothing is parsed, so an agent sees "clean".
> 
> **Known item?** This is not in docs/review-2026-10-05.md. Item 9 there is a different validate_spec issue (paths starting with `..`).
> 
> **Severity:** P3. The …

## Що зробити

- У фільтрі overlay в analyze.ts застосувати ті самі виключення, що й walkDir: приховані сегменти, node_modules і target відносно spec. validate_spec має повертати помилку інструмента для шляху, який check не читає (поза `<dir>` або у виключеній теці), а не порожній результат.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/analyze.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
