# 12: Підсумок `check` не відділяє baseline від ручних специфікацій

**Status:** needs-triage

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: кандидат 8, §10.7 (сесії 1 і 3: шум `unverified` з baseline; «I had to filter with `grep -v baseline`» — 3). У TS-сесіях 8 з 10–12 `unverified` дав згенерований `rules.baseline.md` (нерозв'язані `express` і `../config` у `.gitignore`).

**What to build:** Підсумок у stderr один на весь запуск: `N fail, M unverified, K ok`. `unverified` від `keylang/rules.baseline.md` (згенерований, його не пишуть руками) і від власного потоку учасника змішані, тож «мій потік перевірено» з підсумку не видно. Обхід є — `check keylang/flows/<файл>.md` друкує лише вердикти цього файла (перевірено), але його ніхто з учасників не знайшов, а `--help` описує `paths…` лише як «Resolve IDs and check rules (default: ./keylang)».

Відтворення (master `c408f53`): тимчасовий TS-репо після `init` і з потоком у `keylang/flows/` — `check` друкує в stdout вердикти і `keylang/rules.baseline.md`, і потоку, а в stderr — один підсумок. `check --format json` має `file` у кожному результаті, тож розбивка можлива без нового аналізу. Самого шуму `unverified` від baseline на малому репо не відтворено: там усі імпорти резолвляться (`3 ok` від baseline); у пілоті його дали нерозв'язані імпорти.

## Що має вирішити людина

1. **Другий рядок підсумку за походженням**, коли є і згенеровані, і ручні файли: `3 fail, 10 unverified, 5 ok` + `  generated (rules.baseline.md, map): 0 fail, 8 unverified, 3 ok`. stdout і JSON без змін; stderr змінюється, тож оновити очікувані `spec-forms/*.expected/check.stderr`.
2. **Підсумок за файлами** (`--summary=files`): рядок на файл. Новий прапорець, `--help`, `docs/tools.md`.
3. **Лише документація:** у `--help` і `docs/tools.md` прямо сказати, що `check <файл>` дає вердикти одного файла, і показати це в протоколі проби.

**Рекомендація:** 3 одразу (дешево), 1 — якщо проба з людьми підтвердить шум від baseline (§10.7).

- [ ] рішення записане тут і в `docs/tools.md` (`check`)
- [ ] тест CLI на stderr за рішенням; stdout і `--format json` без змін

Ключові файли: `src/cli.ts` (підсумок `check`), `docs/tools.md`, `tests/cli.test.ts`

## Comments
