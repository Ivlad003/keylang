# 61: `draft map` вгадує шари без `outside`/`assume` і губить `assume` у прев'ю keylang.json

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `core`, верифікація: confirmed.

**Місце:** `src/operations/draft.ts:295` (рецензент указав `src/config.ts:377`)

## Що не так

`runDraftLayout` в режимі algo вгадує шари через `guessLayout(root, config.exclude)` (src/operations/draft.ts:295), тобто лише з `exclude`. Сам keylang вгадує через `loadConfig`, а той бере `exclude + outside + assume`. До того ж `configToJson` не пише поле `assume` (а `outside`, `exclude` і `check` пише). Через це прев'ю не те, що обіцяє cli.md («розкладка шарів, яку вгадав би keylang»), і в ньому немає налаштованого `assume`.

## Сценарій збою

keylang.json `{"format":2,"assume":["src/gen/**"],"outside":["src/infra/**"]}`, у репозиторії є src/app, src/gen і src/infra. `keylang draft map --mode algo` друкує шари `app`, `gen` і `infra`. `outside` у прев'ю лишається, а `assume` зникає. `loadConfig` для того самого репозиторію вгадує лише `{app}`. Людина, яка збереже прев'ю як keylang.json, втратить `assume`: згенерований код почне індексуватися, а коли його немає в git, імпорти з нього стануть дірками і дадуть `unverified`. Крім того, шар `infra` перетнеться з `outside` і дасть попередження «matches no source file».

## Як відтворити

Фікстура scratchpad/review/core/draftmap: git init; файли src/app/a.ts, src/gen/x.ts, src/infra/i.ts; keylang.json як у сценарії; HOME/XDG перенаправлено в scratch. `node bin/keylang.js draft map --mode algo` → layers {app, gen, infra}, outside [src/infra/**], поля assume немає, exit 0. Для порівняння `loadConfig(cwd).layers` → {"app":["src/app/**"]}.

Доказ верифікатора:

> Half of the claim reproduces and half is documented behaviour.
> 
> 1) REAL: the layer guess differs. In src/operations/draft.ts:295 algo mode calls `guessLayout(root, config.exclude)`. Keylang's own guess in src/config.ts:186 (loadConfig) calls `guessLayers(root, [...exclude, ...outside, ...assume])`. The other guessLayout callers (generate.ts:460, tui/forms/run.ts:254, tui/app.ts:3518) only guess when there is no keylang.json, so outside and assume are empty there. draft map is the only caller that runs with an existing config. The contract it breaks: docs/cli.md:46 says "`draft map` друкує розкладку шарів, яку вгадав би keylang". docs/tui.md:171 says "the layout keylang would guess".
> 
> Repro in scratchpad/verify/core-0-0/repo: git init; src/app/a.ts imports ../gen/x; src/gen/x.ts; src/infra/i.ts; keylang.json `{"format":2,"assume":["src/gen/**"],"outside":["src/infra/**"]}`; HOME and XDG dirs point into scratch.
> - `node bin/keylang.js draft map --mode algo` prints layers `{app, gen, infra}` and `"outside": ["src/infra/**"]`, with no `assume`. stderr: `keylang: printed only; keylang.json is unchanged`. exit 0.
> - `loadConfig(cwd).layers` gives `{"app":["src/app/**"]}`, guessed=true.
> - `keylang map` on the original repo gives app plus outside, 2 files, and no warnings.
> - Preview saved as keylang.json (repo2): `warning: keylang.json: \`layers.infra\`: \`src/infra/**\` matches no source file`. A `gen.md` layer is written, and the counts are 3 files and 1 dep, so the generated code is now indexed.
> - TUI-style apply through withLayers (repo3) keeps assume, but gives two warnings: `layers.gen` and `layers.infra` match no source file.
> 
> 2) REFUTED: losing `assume` in the preview is intended. Three places document it:
> - Commit 4edba51: "init and draft map do not write the field".
> - docs/snapshot.md §11: "`init` і `draft map` поле не пишуть".
> - docs/adr/0017-assume-unread-imports.md §4: "`init` і `draft map` його не пишуть: це рішення людини".
> 
> So configToJson at src/config.ts:377 is not a defect. The real defect is at draft.ts:295.
> 
> This is not a known item in docs/review-2026-10-05.md.
> 
> Severity stays P3. The case is narrow (a keylang.json that sets outside or assume), the command is advisory and writes nothing, and the result is warnings or a wrong suggestion. No check result becomes a false ok or a false fail.

## Що зробити

- У runDraftLayout (algo) вгадувати так само, як loadConfig: guessLayout(root, [...config.exclude, ...config.outside, ...config.assume]); те, що `assume` немає в прев'ю, задокументовано (ADR 0017), тож configToJson не чіпати.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/operations/draft.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
