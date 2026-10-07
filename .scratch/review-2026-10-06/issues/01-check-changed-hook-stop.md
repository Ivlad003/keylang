# 01: `check --changed`, `hook stop` і `feature` гублять K104 правил `exports`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `checker`, верифікація: confirmed.

**Місце:** `src/changed.ts:113` (рецензент указав `src/changed.ts:113`)

## Що не так

`ruleHits` у `filterChanged` збирає лише `dependency`, `layers`, `entry` і `no-cycles`. Правила `module X / exports …` там немає взагалі. K104 стоїть на рядку `rules.md`, а не в зміненому файлі коду, тож зріз `--changed` його завжди відкидає. Через `thisChange` (`feature-status.ts:337`) той самий K104 у `feature` стає успадкованою підказкою. Причина: `fail.id` — це модуль, а `isNamed` перевіряє лише, чи лежить кінець під ID фічі, і не перевіряє зворотне.

## Сценарій збою

`rules.md`: `- module domain.b` / `  - exports b`. Агент дописує в `src/domain/b.ts` `export function leaked()`. Повний `check` дає K104 і код 1. `check --changed` дає «0 fail» і код 0, `hook stop` повертає `{}` і агента не зупиняє. На гілці з фічею `planned fn domain.b.leaked ()`, що реалізує цей експорт, `keylang feature leak` друкує `hint … inherited (no file changed since merge-base …, no id of this feature)` і `done`, код 0. Насправді `src/domain/b.ts` змінено, а `domain.b.leaked` — ID фічі. Це суперечить cli.md: «правила, чия область містить змінений модуль».

## Як відтворити

Фікстури scratchpad/review/checker/exp і scratchpad/review/checker/feat. exp: перший `check` — `0 fail, 0 unverified, 1 ok`. Після додавання `leaked` повний `check` дає `K104 divergence: domain.b exports leaked … 1 fail` (exit 1). `check --changed` дає `0 fail, 0 unverified, 0 ok` (exit 0), `echo '{}' | keylang hook stop` повертає `{}`. feat (git init -b main, гілка feat, коміт): `feature leak` дає `hint: keylang/rules.md:5:3: rule domain.b: inherited (no file changed since merge-base cf2bcdd with main, no id of this feature) … done`, exit 0. Повний `check` у тому ж стані — `1 fail` (exit 1).

Доказ верифікатора:

> I reproduced this on my own fixtures under scratchpad/verify/checker-0-0, built from scratch. I ran the real CLI with HOME and XDG pointed at scratch.
> 
> Fixture 1 (exp). keylang.json has layers app and domain, and module "file". keylang/rules.md is `- module domain.b` / `  - exports b`. src/domain/b.ts has `export function b()`. It is committed on main.
> - Clean `check`: `0 fail, 0 unverified, 1 ok`, exit 0.
> - Then I appended `export function leaked() { return 2; }` to src/domain/b.ts (`git status`: ` M src/domain/b.ts`).
> - `node .../bin/keylang.js check`: `keylang/rules.md:4:3: K104 divergence: \`domain.b\` exports \`leaked\` (fn), which is not listed in \`exports\``, `1 fail, 0 unverified, 0 ok`, exit=1.
> - `check --changed`: `0 fail, 0 unverified, 0 ok`, exit=0.
> - `echo '{}' | keylang hook stop`: `{}`, exit=0, so the agent is not blocked.
> 
> Fixture 2 (feat). On main: rules.md has `layers domain < app` plus the same exports rule, b.ts exports only b, and app/a.ts calls b. Branch feat, committed: keylang/features/leak.md has `trigger app.a.a` / `step domain.b.leaked` and `planned fn domain.b.leaked ()`. b.ts adds `leaked`, and a.ts calls it.
> - `keylang feature leak` prints: `hint: keylang/rules.md:5:3: rule domain.b: inherited (no file changed since merge-base 3e92b01 with main, no id of this feature): divergence: ... exports \`leaked\` ...`, then `done`, exit=0.
> - Full `check` in the same state: K104 plus `1 fail, 0 unverified, 4 ok`, exit=1.
> - `check --changed --since main`: `0 fail`, exit=0.
> 
> Code path:
> - rules.ts:451/463 `pushFail("K104", rule.file, rule.span…)` puts both the diagnostic and the verdict on the rules.md line, with criterion `exports <module>` and area `<module>`.
> - changed.ts:113-127 `ruleHits` builds hits only for dependency, layers, entry, no-cycles and rejectedLayers. It has no `exports` branch, so `ruleLine` and `ruleCriterion` never match. rules.md itself is unchanged, so `filterChanged` drops both the K104 diagnostic and its verdict.
> - feature-status.ts:337 `thisChange`: the fail is not in `kept`. `fail.id` is `domain.b`, and `isNamed` only tests `end === id || end.startsWith(id + ".")`. `domain.b` does not start with `domain.b.leaked.`, so the fail is treated as inherited.
> 
> Contract: docs/cli.md:147 says `--changed` keeps "правила, чия область містить змінений модуль". The exports rule's scope is exactly domain.b, whose file changed. llm.txt:70/141 says `feature` is not done while a rule fail "of this change" remains, and a fail is t …

## Що зробити

- Додати в `ruleHits` гілку `rule.kind === "exports"` з `scope: [rule.module.target]` і `criterion: \`exports ${rule.module.target}\``. В `isNamed` у `thisChange` рахувати fail своїм і тоді, коли ID фічі лежить під `fail.id`. Додати тест: `check --changed`, `hook stop` і `feature` з K104.
- Додати в ruleHits гілку `rule.kind === "exports"` з `scope: [rule.module.target]` і `criterion: \`exports ${rule.module.target}\``, щоб --changed, hook stop і feature бачили K104 на змінений модуль, і додати регресійний тест.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/changed.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
