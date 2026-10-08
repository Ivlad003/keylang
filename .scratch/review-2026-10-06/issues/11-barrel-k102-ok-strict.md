# 11: Виключений або нерозібраний barrel в іншому шарі перетворює K102 на ok, навіть із --strict

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `x-rule-flow-semantics`, верифікація: confirmed.

**Місце:** `src/rules.ts:365` (рецензент указав `src/rules.ts:365`)

## Що не так

Область `deny` (`holeAmong(scope) ?? scopeHole(deny.a)`) містить лише модулі джерела. Дірка в модулі, який джерело імпортує (excluded чи parse-error barrel з реекспортом), туди не входить. Поки barrel прозорий, keylang веде виклик крізь реекспорт до справжнього символу й дає K102. Коли barrel стає непрозорим, ребро зникає, і вердикт переходить з fail в ok. Це порушує задокументований інваріант semantics.md («Вердикти»): менше інформації (`exclude`) переводить ok або fail лише в unverified, ніколи між ok і fail.

## Сценарій збою

src/app/x.ts: `import { save } from "../shared/barrel.ts"; export function run() { return save(); }`; src/shared/barrel.ts: `export { save } from "../infra/db.ts";`; rules: `- deny app infra`; шари app/shared/infra. Без exclude: K102 і код 1. Додали в keylang.json `"exclude": ["src/shared/barrel.ts"]` (або barrel має синтаксичну помилку, яку tree-sitter не розбирає): `0 fail, 0 unverified, 1 ok`, `check --strict` дає код 0. Заборонена залежність проходить CI і хук мовчки.

## Як відтворити

scratchpad/review/rule-flow-semantics/f8: `node bin/keylang.js check` дає `src/app/x.ts:2:32: K102 divergence: app.x depends on infra.db … 1 fail`. З exclude barrel: `0 fail, 0 unverified, 1 ok`, `check --strict` дає `strict exit 0`. З barrel `const broken = ;;; ))) {{` + той самий реекспорт без exclude: `0 fail, 0 unverified, 1 ok`, strict exit 0. Із `export * from` і exclude так само ok. Для порівняння: рядок `layers infra < app` на тому самому знімку дає unverified («excluded by keylang.json»).

Доказ верифікатора:

> I reproduced this on HEAD 45cc74d with my own fixture in scratchpad/verify/x-rule-flow-semantics-0-0/{base,excl,broken,star}, running `node /home/kosmodev/pet_project/keylang/bin/keylang.js check` and `check --strict` with HOME and XDG_* pointed at scratch.
> 
> **Fixture.** Layers app/shared/infra and the rule `- deny app infra`. src/app/x.ts imports `save` from ../shared/barrel.ts and calls `save()`. src/shared/barrel.ts holds `export { save } from "../infra/db.ts";`.
> 
> **Results.**
> - **base** (no exclude): `src/app/x.ts:2:32: K102 divergence: app.x depends on infra.db, which is denied by deny app infra … 1 fail, 0 unverified, 0 ok`. Exit 1; strict exit 1.
> - **excl** (`"exclude": ["src/shared/barrel.ts"]`): `0 fail, 0 unverified, 1 ok`. Exit 0; strict exit 0.
>   - JSON verdict: `deny app infra` is `ok`, area `app.x`, evidence "convergence: no edge from app to infra and no dependency hole in the area".
>   - Coverage has two entries: `unresolved-call src/app/x.ts app.x.run` and `skipped-file src/shared/barrel.ts shared.barrel "excluded by keylang.json"`.
> - **broken** (barrel starts with `const broken = ;;; ))) {{`, no exclude): coverage shows `parse-error shared.barrel` plus `unresolved-call app.x.run`. Verdict `deny app infra ok`, strict exit 0.
> - **star** (`export * from` plus exclude, with an added `layers infra < app`): the deny is still ok. The layers line is `unverified … excluded by keylang.json (src/shared/barrel.ts:1:1)`.
> 
> **Why it happens.**
> - In src/rules.ts:365, `holeAmong(scope) ?? scopeHole(deny.a)` only looks at modules inside the source scope.
> - The hole that hides the edge is in shared.barrel (skipped-file/parse-error), which is outside that scope.
> - The symptom inside the scope is `unresolved-call`, which is not in DEPENDENCY_HOLES (src/rules.ts:535). So the area has no hole and the verdict is ok.
> 
> **Contract.**
> - docs/semantics.md, "Вердикти", line 162, says less information (`exclude`, an unresolved import) moves `ok` or `fail` only to `unverified`, never between `ok` and `fail`. The only documented exception is the Python manifest / K001 case.
> - tests/metamorphic.test.ts enforces that invariant ("exclude and --static shape never switch ok and fail"). It has similar cases for no-cycles (06) and layers (07), but none for a re-export through an opaque module under `deny`.
> - The normative model `area(deny, U) :- U в області джерела` matches the code. That puts the model in conflict with the stated invariant and its test, so this is not intended b …

## Що зробити

- Додати до області deny непрозорі модулі (skipped-file/parse-error), з яких модулі джерела імпортують імена, або вважати діркою нерозв'язаний виклик/імпорт імені з такого модуля, бо він може реекспортувати заборонену ціль; і додати цей випадок у tests/metamorphic.test.ts.
- Додати в область deny непрозорі модулі (skipped-file/parse-error), які scope імпортує розв'язаним ребром, або вважати діркою unresolved-call імені, імпортованого з opaque-модуля; оновити area(deny) у semantics.md.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/rules.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійні тести в `tests/metamorphic.test.ts` («09: …», три тести, через справжній CLI на тимчасовій фікстурі app/shared/infra з `- deny app infra`): exclude barrel з `export { save } from`, exclude barrel з `export * from`, barrel із синтаксичною помилкою плюс `check --strict`. На поточному коді падали: `monotonic` ловив `deny app infra: fail → ok`, а для parse-error вердикт був `ok` і strict давав код 0.
- 2026-10-07: Виправлення в `src/rules.ts`: область `deny` тепер містить і модулі, з яких модулі джерела імпортують розв'язаним ребром `import`/`re-export`, далі ланцюжком реекспортів (`importedBy(scope)`); дірка в них (`holeAmong(imported, UNASSIGNED_FILE)`) робить вердикт `unverified` з причиною самої дірки (`excluded by keylang.json (src/shared/barrel.ts:1:1)` / parse-error). Окремого виду дірки для unresolved-call не додано: імпорт із opaque-модуля вже в області, і це покриває і виклик, і сам імпорт імені. Звичайний імпорт імпорту (не реекспорт) областю не є — це залежність того модуля.
- 2026-10-07: Контракт: `docs/semantics.md` — речення про область `deny` в описі `allow`/`deny` і предикат `area(deny, U)` у нормативній моделі; `llm.txt` не змінено (область правил там не описана). `docs/review-2026-10-06.md` п. 9 позначено ✔. Карту `keylang/map*` перегенеровано (`map --check` був stale ще до зміни через зсув рядків `src/safe-write.ts`; зміна `src/rules.ts` теж зсуває `#L`). Перевірки: `node --test tests/metamorphic.test.ts tests/cli-rules.test.ts tests/review-core.test.ts` — 36/36, `npm run typecheck` — ок, `node bin/keylang.js map --check` — ок після перегенерації, `node bin/keylang.js check` — `0 fail, 24 unverified, 47 ok`, ті самі не-`ok` вердикти, що й на master.
