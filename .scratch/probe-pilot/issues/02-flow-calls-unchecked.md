# 02: `calls` / `reads` під кроком потоку не перевіряються

**Status:** ready-for-agent

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

- [ ] рішення записане тут і в format.md («Flows: докази кроку», таблиця доказів)
- [ ] фікстура: `calls` на fn, яку батько викликає, і на fn, яку не викликає — вердикти за рішенням; `fmt`, `parse --json` і `specHash` не змінюються
- [ ] `feature_status` і `--strict` поводяться узгоджено з рішенням

Ключові файли: `src/flows.ts`, `src/spec-ir.ts`, `src/check-results.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments

- 2026-10-04 — рішення людини: варіант 1 — `calls` під кроком є static-доказом без порядку: прямий resolved-виклик з fn батька → `static ok`; надійна відсутність за правилами `absence` → `fail`; інакше `unverified`. `reads` — лише `ID ok` до окремого рішення.
