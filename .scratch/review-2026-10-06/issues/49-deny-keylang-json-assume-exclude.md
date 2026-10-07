# 49: Агент може вимкнути `deny` через `keylang.json` (`assume`/`exclude`): харнес цей файл не захищає

**Status:** needs-triage

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `checker`, верифікація: confirmed.

**Місце:** `src/harness.ts:55` (рецензент указав `src/harness.ts:56`)

## Що не так

`denyRules` забороняє агенту правити лише `<dir>/rules.md` і `rules.baseline.md`. Поля `keylang.json` визначають, що бачать правила, і за ADR 0017 `assume` — «рішення людини». Але агент може правити `keylang.json` без обмежень. `assume` на наявний файл шару прибирає ребро без прогалини, тож `deny` стає `ok` навіть у `--strict`. `exclude` перетворює `fail` на `unverified`, а це `hook stop` теж пропускає.

## Сценарій збою

`- deny domain infra`, агент додає в `src/domain/a.ts` імпорт `../infra/x.ts`, і `hook stop` блокує з K102. Тоді агент дописує в `keylang.json` `"assume": ["src/infra/**"]`. `hook stop` повертає `{}`, а `check --strict` — `0 fail, 0 unverified, 1 ok`, код 0, хоча domain і далі імпортує infra. З `"exclude": ["src/domain/a.ts"]` маємо `hook stop` `{}`, а `check` — `1 unverified`, код 0.

## Як відтворити

Фікстура scratchpad/review/checker/excl. Після порушення `hook stop` дає `{"decision":"block","reason":"src/domain/a.ts:1: K102 …"}`. З `exclude` `hook stop` дає `{}`, а `check` — `unverified excluded by keylang.json … 0 fail, 1 unverified` (exit 0). З `assume` `hook stop` дає `{}`, а `check --strict` — `0 fail, 0 unverified, 1 ok` (exit 0). harness.ts:56 має лише `Edit/Write(<dir>/rules.md)` і `rules.baseline.md`.

Доказ верифікатора:

> I reproduced this myself with a fixture at scratchpad/verify/checker-2-0/fx. It has keylang.json with layers infra=src/infra/**, domain=src/domain/** and keylang/rules.md with `- deny domain infra`, plus a git init and a commit. HOME and XDG were pointed at scratch. I set K to `node /home/kosmodev/pet_project/keylang/bin/keylang.js`.
> 1) Clean tree: `$K check --strict` printed `0 fail, 0 unverified, 1 ok`, exit 0.
> 2) I added `import { x } from "../infra/x.ts"` to src/domain/a.ts. Then `echo '{"stop_hook_active":false}' | $K hook stop` printed `{"decision":"block","reason":"src/domain/a.ts:1: K102 divergence: ... denied by \`deny domain infra\` (keylang/rules.md:3)"}`, and `check --strict` gave `1 fail`, exit 1.
> 3) I added `"assume":["src/infra/**"]` to keylang.json. hook stop printed `{}`. `check --strict` printed `0 fail, 0 unverified, 1 ok`, exit 0, although domain still imports infra.
> 4) I used `"exclude":["src/domain/a.ts"]` instead. hook stop printed `{}`. `check` printed `unverified excluded by keylang.json ... 0 fail, 1 unverified, 0 ok`, exit 0. One correction to the claim: `check --strict` exits 1 here.
> 5) Not in the claim: retargeting `layers` (infra -> src/nothing/**) also gives hook stop `{}` and `check --strict` `0 fail, 0 unverified, 1 ok`, exit 0.
> 
> harness.ts:55-57 `denyRules` covers only Edit/Write on `<dir>/rules.md`, `<dir>/rules.baseline.md` and the proposals accept/reject Bash patterns. The guidance texts also say nothing about keylang.json: the AGENTS block (harness.ts:171), llm.txt:109-112 ("Do not edit these by hand") and the SKILL. That leaves an agent with no deny and no instruction against editing keylang.json, on any harness.
> 
> The aim this undercuts is in two ADRs. ADR 0005 p.5 says "Правила агент сам не послаблює". ADR 0017 p.4 calls `assume` "рішення людини".
> 
> The gap is not in docs/review-2026-10-05.md. That review only lists the hardcoded `keylang/` dir (item CLI 3 / main 6) and proposals accept, both fixed. So it is not a known item and not a regression.
> 
> Why I lower the severity from P2 to P3:
> - Each component behaves as documented. cli.md:145 lists exactly these deny entries, and assume/exclude/layers semantics follow ADR 0017 and semantics.md.
> - No doc promises that keylang.json is protected. apply_diff accepts only Markdown specs (mcp-lsp.md:20), so the design implicitly expects an agent to edit keylang.json, for example to add a layer.
> - The guard is best-effort by design. For Codex, Cursor and opencode it is only an ins …

## Що зробити

- Додати в інструкції (AGENTS-блок, skill, llm.txt) заборону агенту змінювати `assume`/`exclude`/`outside`/`layers` у keylang.json, а в `hook stop` порівнювати ці поля з HEAD і повертати systemMessage або block, якщо вони змінилися за хід (Edit-deny на keylang.json сам не допоможе, бо агенту часом треба додати шар).

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/harness.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
