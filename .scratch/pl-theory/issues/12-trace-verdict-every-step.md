# 12: Кожен тригер і крок отримує trace-вердикт, коли задано `check.trace`

**Джерело:** research-pl §5 Р-5; знахідка 3; рішення Q14 (spec). Баг: `--strict` мовчки пропускає кроки.

**What to build:** Коли задано `check.trace`, кожен `trigger` і `step` потоку отримує рядок `trace`. Зараз у двох випадках рядка мовчки немає.

**Діти `planned`-кроку.** `shape` відкидає planned-вузол разом із дітьми (src/flows.ts:121-122). Тож дитина не має trace-рядка, а static каже `` parent `<id>` is not in the snapshot `` (src/flows.ts:381).

Відтворення S8: `planned fn application.purchase.refund () → void`, `trigger presentation.terminal.checkout`, `step application.purchase.refund` з дочірнім `step infrastructure.store.save`, завершений trace. Для `save` є лише `` 6:3: static unverified … parent `application.purchase.refund` is not in the snapshot ``, рядка trace немає.

Після зміни кожен step під planned-кроком, на будь-якій глибині, отримує `` trace unverified … parent step `<id>` is planned ``, де `<id>` — найближчий planned-предок. Static прямої дитини — `` unverified … parent `<id>` is planned, not implemented ``. Static глибших вузлів, як і зараз, рахується від їхнього реалізованого батька.

**Другий і наступні `trigger` потоку.** Trace зіставляє лише перший тригер (src/flows.ts:109): будується дерево під ним і з вузлів поза тригерами (:127). Тож другий тригер і його кроки не мають trace-рядка, хоча `trace-plan` інструментує всі тригери (src/trace-plan.ts:54).

Відтворення S10: `trigger checkout / step buy` і `trigger buy / step create`, trace `nested()`. Для рядків 5–6 trace-рядків немає, `check --strict` дає 0.

Після зміни другий і наступні тригери та всі вузли під ними отримують `trace unverified … a flow is matched from its first trigger only`. format.md фіксує норму design §3.4 (docs/design.md:178): перевірюваний сценарій має один `trigger`, решту тригерів trace не перевіряє. Нового коду діагностики немає.

Тікет прибирає застереження про ці два випадки з підрозділу «Семантика» (10). Якщо SpecIR (18) злито раніше, тригери читаються зі списку `Flow.triggers`. Міграція flows.ts на SpecIR (20) чекає на цей тікет.

**Blocked by:** 10 (семантика flows)

**Status:** resolved

**Контракт:** змінюється JSON-вивід `check`. З'являються нові результати `criterion: "trace"` для дітей planned-кроку й для вузлів другого тригера, а в дитини planned-кроку змінюється текст static-причини. Код виходу змінюється несумісно: `check --strict` на потоці з кількома тригерами дає 1 замість 0. Цю зміну треба записати в «Несумісних змінах» spec. Для дітей planned-кроку `--strict` і зараз дає 1 через `unverified` самого planned-кроку (перевірено пробою S8), тож змінюється лише вивід. Без `check.trace` вивід не змінюється.

- [x] CLI-тест S8 на завершеному trace. Для `save` є `trace unverified` з «parent step `application.purchase.refund` is planned», а static — «parent `application.purchase.refund` is planned, not implemented». Онук planned-кроку має `trace unverified` з тією самою причиною.
- [x] CLI-тест S10: два `trigger`, як у tests/flows.test.ts:236, і `check.trace`. Другий тригер і його крок мають `trace unverified` з «a flow is matched from its first trigger only». `check` дає 0, `check --strict` — 1. Вердикти першого тригера і його кроків не змінюються.
- [x] У `check --format json` нові рядки мають `criterion: "trace"`, `verdict: "unverified"` і `area` — ID вузла. stdout — чистий JSON, підсумок — у stderr.
- [x] Без `check.trace` нових рядків немає: наявний тест рекурсії з двома тригерами (:234) проходить без змін.
- [x] format.md, «Flows: докази кроку»: обидва випадки записано в колонці `unverified` рядка `trace` (:279), норму «один перевірюваний `trigger`» записано. Застереження з «Семантики» прибрано.
- [ ] `npm run typecheck` і `npm test` зелені. `node bin/keylang.js map` виконано, diff переглянуто, зокрема карту з поясненнями (`explain.map` увімкнено). `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/flows.ts`, `src/trace-evidence.ts`, `docs/format.md`, `tests/flows.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; `src/flows.ts`; тест `tests/flows.test.ts` «a later trigger and a child of a planned step are unverified when a trace is configured»; format.md «Семантика» (один перевірюваний `trigger`, діти planned). Прогін `npm test` у межах аудиту не виконувався.
