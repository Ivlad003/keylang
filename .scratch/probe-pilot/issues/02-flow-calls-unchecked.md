# 02: `calls` / `reads` під кроком потоку не перевіряються

**Status:** resolved

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: §10.7 і кандидат 2 («`calls` під кроком потоку … не дають жодного результату»; ведучий відтворив на HEAD).

**What to build:** `- calls <id>` і `- reads <id>` під `step` чи на верху потоку дозволені граматикою (format.md, таблиця контекстів: «під `step` / `trigger`»). `check` резолвить ID (невідомий дає K001), але більше нічого не друкує: ні `ID ok`, ні `static`. Рядок читається як твердження «крок викликає X», а перевірено лише, що X існує. Навіть якщо крок X не викликає, `check --strict` дає код 0.

Відтворення (master `c408f53`): копія `tests/fixtures/repo`, потік зі [спільного відтворення](../spec.md#спільне-відтворення). Рядок 5 `  - calls infra.db.save` під `step domain.order.createOrder` мовчить, хоча `createOrder` не викликає `save` (його викликає `app.checkout.checkout`). На тимчасовому TS-репо `- calls main.main.main` під кроком, який `main` не викликає, і `- reads …` теж мовчать: `0 fail, 0 unverified, 3 ok`, код 0 з `--strict`.

## Що має вирішити людина

1. **`calls` під кроком — static-доказ, як у `step`, але без порядку.** `static ok` — є resolved-виклик з fn батька (прямий, не шлях); `fail` «`createOrder` does not call `infra.db.save`» — за тими ж правилами надійності, що `absence` у `static`; інакше `unverified`. `reads` — те саме для модуля/fn, яку читають (або лише `ID ok`, якщо читання в знімку не відрізняється від виклику). Приклад: `- calls infra.db.save` під `createOrder` → `static fail`.
2. **Лише `ID ok`.** Рядок друкує `ID ok infra.db.save: exact` і нічого не стверджує про виклик. Дешево; мовчання зникає, але «перевірено» вводить в оману так само.
3. **Заборонити `calls` у потоці (K004)** і пропонувати `step`. Несумісна зміна граматики; потребує нової версії формату (pl-theory/35).

**Рекомендація:** варіант 1 для `calls` (прямий виклик — найпростіший доказ, який уже є в знімку), `reads` — `ID ok` до окремого рішення. Варіант 3 — лише якщо проба з людьми покаже, що `calls` у потоці ніхто не відрізняє від `step`.

- [x] рішення записане тут і в format.md («Flows: докази кроку», таблиця доказів)
- [x] фікстура: `calls` на fn, яку батько викликає, і на fn, яку не викликає — вердикти за рішенням; `fmt`, `parse --json` і `specHash` не змінюються
- [x] `feature_status` і `--strict` поводяться узгоджено з рішенням

Ключові файли: `src/flows.ts`, `src/spec-ir.ts`, `src/check-results.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments

- 2026-10-04 — рішення людини: варіант 1 — `calls` під кроком є static-доказом без порядку: прямий resolved-виклик з fn батька → `static ok`; надійна відсутність за правилами `absence` → `fail`; інакше `unverified`. `reads` — лише `ID ok` до окремого рішення.
- 2026-10-04 — зроблено за варіантом 1. `calls` під кроком/тригером: кожне ID дає `ID` і `static` на своїй колонці. `static ok` — resolved-виклик у тілі fn батька, який доводить поточний режим (не closure; хук лише в `behavior`); `static fail` `` absence: `<батько>` does not call `<ціль>` `` — коли жоден виклик батька не може бути ціллю (нерозв'язаний/неоднозначний виклик її назви, перевизначення, closure, хук у `shape`), тіло батька розібрано і ціль не «тікає» (`escapeOf`, як у absence кроку); інакше `unverified`. Якщо шлях через інші виклики є, `fail` додає підказку `(it reaches it via …; `step` proves a path)`. `reads` — лише `ID` на кожне ID. SpecIR отримав вид `calls` (`CallsItem`); парсер, `fmt`, `parse --json` не змінювались. `feature_status`: кожне ID у `calls` без `static ok` — гап `static` (як крок); `--strict` рахує `unverified` як завжди. Відтворення пілоту: рядок 5 тепер `static fail infra.db.save: absence: `domain.order.createOrder` does not call `infra.db.save``. Припущення: ціль, що «тікає» будь-де в репозиторії, робить `calls` `unverified` (консервативно, як для кроку). Тести: `tests/flows.test.ts` «calls: …» (2), `tests/cli.test.ts` «feature: …». format.md — абзац «`calls` у потоці», tools.md — умова готовності фічі.
