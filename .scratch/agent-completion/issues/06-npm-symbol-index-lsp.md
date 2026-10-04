# 06: Індекс символів npm у LSP

**Джерело:** plan.md крок 6 і §1 C14, C15; design/design-npm-symbols.md; review-npm-symbols.md; decisions.md (Q8 класи після step — так; Q9 лише кореневий entry)

**What to build:** Після `external.zod.` редактор пропонує експортовані символи пакета (`object`, `string`, простір `z`…) із видом (fn/type/class/const/namespace) і однорядковою сигнатурою; hover показує сигнатуру й рядок-пораду «not in <pkg> <ver> typings (advisory)» для відсутніх; signature help працює для таких ID (до 5 перевантажень); definition веде у `.d.ts`. Джерело — лише пакети, оголошені в `package.json` (з 03), їхні типи з локального `node_modules`: `types`/`typings`/`exports`-умови, fallback на `@types/<pkg>`, `export * from`, перейменування, `export * as ns`, default, перевантаження; лише кореневий entry, обмежений обхід відносних ре-експортів, символи верхнього рівня плюс один рівень членів простору імен. Читання `.d.ts` — окремим модулем у `extract` (tree-sitter), без впливу на ядро мови; індекс — у шарі `map`; доповнення — у `features`. Індекс лише порада: external-модулі лишаються непрозорими, вердикти не змінюються, хеш індексу не входить у `snapshotId`. Кеш у `.keylang/cache/packages.json`, ключ — тека пакета + версія + хеші файлів типів; будується так, щоб completion не блокувався: доки пакет `pending`, список `isIncomplete`; збої стають `partial`/`no-typings` із причиною в stderr, ніколи не кидають. LSP-сервер не пише кеш на диск (`persist: false`); `check` і `map --check` кешу не створюють.

**Blocked by:** 03 <!-- 03 — оголошені пакети -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] новий модуль читання декларацій у `extract` (імпортує лише `base`/`extract`); `extract/ts.ts` експортує лише побудову сигнатур
- [ ] новий модуль індексу пакетів у `map` (додано до `keylang.json`): пошук entry типів, обхід із перевіркою realpath-вкладеності, ліміти, кеш, `refresh()` синхронно позначає `pending`
- [ ] `lsp-features.ts`: таблиця пакетів у робочому просторі; гілка символів після `external.<seg>.` для `step`/`trigger` (callable, класи, простори) і `calls`/`reads`; звуження лише за точним префіксом простору; `planned`-декларація перемагає символ з тим самим ID; правило авто-planned з 05 діє й для символів; hover/signatureHelp/definition
- [ ] фікстура пакетів у `tests/` (фейковий `node_modules` з `.d.ts`: entry через `exports`, `@types`-fallback, `export *`, простір імен, перевантаження, js-only, cjs, ambient) без мережі
- [ ] LSP e2e: очікування до `isIncomplete=false`; точні мітки; члени `ns.`; `js-only`/`ambient`/`cjs`; неоголошений пакет — нічого; hover, 2 сигнатури, definition; після виходу кешу немає
- [ ] CLI e2e: імена потоку, яких немає в типах, лишаються `unverified`; `check` і `map --check` не створюють кеш
- [ ] `docs/tools.md` (LSP), `docs/format.md` (§6, Р13, `.d.ts` не є джерелом — по реченню), `docs/adr/0011-package-symbols-advisory.md`, `CONTEXT.md` — термін «Package symbols»
- [ ] `npm run typecheck`, `npm test`, `map` (diff), `map --check`, `check` — зелені

Ключові файли: новий `src/extract/dts.ts`, новий `src/package-symbols.ts`, `src/lsp-features.ts`, `src/lsp.ts`, `tests/package-fixture.ts`
