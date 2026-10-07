# 41: Зміна keylang.json під час аналізу не зупиняє запис карти й wire

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `emit`, верифікація: confirmed.

**Місце:** `src/map.ts:325` (рецензент указав `src/map.ts:392`)

## Що не так

`planMap` бере текст `keylang.json` (і ключ briefs) для перевірки входів уже після аналізу, а не з того стану, з яким аналіз почався. `runWire` робить так само (`src/operations/generate.ts:616`). Тому зміна конфігу, збережена під час аналізу, стає новою «базою», перевірка перед commit її не бачить, і на диск лягає карта чи `keylang.gen.ts`, обчислені зі старого конфігу, з кодом 0. Документація (`tui.md` «Запис карти», `cli.md` wire) обіцяє в такому разі `failed`, код 1 і нічого не записувати. З тієї ж причини непомітні зміни README, `package.json` і `tsconfig.json`, які впливають на знімок і карту з поясненнями: їх перевірка входів не відстежує взагалі.

## Сценарій збою

У TUI запущено «Map: write». Поки worker аналізує код зі старим `keylang.json`, людина додає шар `core` і зберігає `keylang.json` через Ctrl+S (до дозволу на commit сесія це дозволяє). План бачить уже новий текст, `mapPlanProblems` порівнює диск із ним і проблем не знаходить. У результаті записано `keylang/map/unassigned.md` за старими шарами, `completed 0`. Наступний `keylang map --check` дає `keylang/map/core.md: stale` і `unassigned.md: stale`. Для wire так само записується файл, який за новим конфігом навіть не генерується.

## Як відтворити

Фікстура scratchpad/review/emit/race: src/app/a.ts і src/core/c.ts, keylang.json лише з шаром app. Скрипт race.ts викликає runMap({kind:'map',root}, {analyze: async r => { const a = await analyze(r); writeFileSync('keylang.json', <з шаром core>); return a; }, beforeCommit: async () => undefined}). Вивід: `completed 0 ["keylang/map/app.md: written","keylang/map/unassigned.md: written"]`; потім `keylang map --check` → `keylang/map/core.md: stale`, `keylang/map/unassigned.md: stale`, код 1. Для wire (race-wire.ts на копії tests/fixtures/wiring-shop, у конфіг під час аналізу додано exclude memory-db.ts): `completed 0 ["keylang.gen.ts: written"]`, а `keylang wire --check` після цього дає код 2: `infra.memory-db.createMemoryDb is not in the snapshot`.

Доказ верифікатора:

> I reproduced this at current HEAD on scratch fixtures under scratchpad/verify/emit-0-0/, running the real runMap/runWire with the real analyze. The only thing the context adds is a write to keylang.json after analyze() returns.
> 
> **Code path**
> - `sourceInputs()` (src/map.ts:325-327) reads keylang.json from disk at the moment it is called.
> - `planMap` calls it at src/map.ts:392 and `runWire` at src/operations/generate.ts:616. Both calls come after `analyze()`, which parses keylang.json inside `loadConfig` (src/config.ts:176) and keeps no raw text in Config.
> - So the "base" snapshot already holds the new config, and `sourceInputProblems` (map.ts:336) finds no difference.
> - runWire reads the specs before the analysis on purpose (generate.ts:580, comment "Read before the analysis…") but does not do the same for keylang.json.
> - Documented contract that this breaks:
>   - tui.md:111: commit is refused if `keylang.json`, the sources or the briefs changed (`failed`, code 1, nothing written).
>   - runWire doc (generate.ts:565): keylang.json must be "what the text was computed from".
>   - mapPlanProblems doc (map.ts:400): keylang.json, sources and briefs must be "the ones the map was rendered from".
> 
> **Map repro**
> Fixture: src/app/a.ts and src/core/c.ts; keylang.json has only the `app` layer. race-map2.ts calls runMap with analyze = real analyze + writeFileSync(keylang.json with the `core` layer added).
> - `WHEN=during node race-map2.ts m-during`:
>   - Output: `completed 0 ["keylang/map/app.md: written","keylang/map/unassigned.md: written"]`.
>   - Then `keylang map --check`: `keylang/map/app.md: stale`, `keylang/map/core.md: stale`, `keylang/map/unassigned.md: stale`, exit=1.
> - Control, the same write made in beforeCommit (after the plan): `failed 1 ["keylang.json: changed on disk while the map was computed", "nothing was written; …"] written: []`.
> - So the check works only when the change happens after planMap, not during the analysis.
> 
> **Wire repro**
> Copy of tests/fixtures/wiring-shop; during the analysis, `exclude: ["src/infra/memory-db.ts"]` is added to keylang.json.
> - `node race-wire.ts w`: `completed 0 ["keylang.gen.ts: written"]`.
> - Then `keylang wire --check`: `keylang: \`infra.memory-db.createMemoryDb\` is not in the snapshot`, exit=2.
> 
> **Reachability**
> tui.md:111 says Ctrl+S waits only after the worker has asked for permission to commit. Saving keylang.json while the worker is analysing is therefore allowed; a concurrent edit by an agent or editor during CLI `keyl …

## Що зробити

- Брати текст keylang.json до analyze() (або повертати з analyze/loadConfig саме той текст, який було розібрано) і передавати його в planMap/sourceInputs. Так само зробити в runWire і в інших місцях, де викликається sourceInputs. За потреби додати до входів README і маніфести, з яких будується карта з поясненнями.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/map.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
