# 04: Пояснення в git і brief від моделі

**Джерело:** ADR 0004 п. 2, 3; design §5.4 (оновити); spec «Файли», «Несумісні зміни»

**What to build:** Сховище пояснень переїжджає з `.keylang/explain/` у `<dir>/explain/`. Новий рівень деталізації `brief` — одне-два речення одним абзацом без перенесень, мовою `explain.lang`. `keylang explain <id> --llm --brief` пише `<dir>/explain/brief/<id>.md` з тим самим заголовком (`agent`, `date`, `closure`, `lang`, `detail=brief`). Відповідь довша за два речення обрізається тим самим правилом, що в 01, і лишається без позначки. Карта з поясненнями бере brief для вузла без коментаря документації й показує видиму позначку `_(llm · <model> · <date>)_`, а для застарілого додає `· stale`. Файли `<dir>/explain/**` не є специфікаціями: `check` їх не оцінює, TUI не показує серед специфікацій. `explain` і `doctor` бачать файли в старій `.keylang/explain/` і підказують, як їх перенести. Design §5.4 і format.md оновлено відповідно до ADR 0004.

**Blocked by:** 03

**Status:** resolved

- [x] e2e з мок-провайдером (офлайн): `explain <id> --llm --brief` → файл у `<dir>/explain/brief/`; `map` показує текст із позначкою моделі й дати
- [x] вузол має і JSDoc, і brief → у карті JSDoc
- [x] зміна тіла fn після brief → `map` пише `· stale`; `map --check` до перегенерації — код 1
- [x] brief з невідомим ID у бектиках → поведінка як у `explain --llm` (попередження, не вигадане ID у карті)
- [x] `explain <id> --llm` (short/full) пише в `<dir>/explain/<id>.md`, TUI `e` і MCP `explain` читають звідти
- [x] `check` не бачить `<dir>/explain/**` (немає прози-специфікацій у результатах)
- [x] файл у `.keylang/explain/` → одна підказка в stderr `explain` і рядок у `doctor`

Ключові файли: `src/explain-llm.ts`, `src/cli.ts`, `src/analyze.ts`, `src/emit.ts`, `docs/design.md` §5.4.

## Comments

- 2026-09-28 (агент): зроблено в `1423a18`. Разом з 05 одним комітом (зміни в `src/cli.ts` переплетені). Сховище `<dir>/explain/`, brief — `<dir>/explain/brief/<id>.md`, `--brief`; стара `.keylang/explain/` — примітка в `explain` і рядок `explanations:` у `doctor`. Design §5.4 оновлено.
