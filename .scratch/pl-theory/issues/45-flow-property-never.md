# 45: `never <id>`: виклик, якого не має бути в межах тригера чи кроку

**Джерело:** research-pl §5 Р-13; знахідка 3; рішення Q23 (spec)

**What to build:** Автор потоку пише `- never <id>` на верху потоку або під `trigger`/`step`. Це означає, що в межах кожного виклику області `<id>` не викликається. Семантика — за ADR 0008 (44).

- **Граматика.** Парсер створює новий вид вузла з посиланням і точним span. `never` — контекстне ключове слово лише в потоках. Неправильні аргументи (`- never`, `- never a.b c.d`) дають K005 з позицією, висяче ID — K001.
- **Інструменти.** `fmt` канонічний і ідемпотентний. LSP-completion пропонує `never` у цих позиціях.
- **SpecIR.** Твердження входить у SpecIR (`Flow.properties`). flows.ts і trace-evidence.ts оцінюють його зі SpecIR (після 20), а не з вузлів Text IR.
- **Інструментування.** Символ `<id>` береться з `spec.flows`, а не з Text IR. `flowSymbols` (src/trace-plan.ts:41-60) включає `<id>`, тож його інструментують `trace-plan` і TS-хуки (src/adapters/trace-hooks.ts:47). Рекомендовано зливати після 22, який переводить `flowSymbols` на `spec.flows`. Якщо 22 ще не злито, символи властивостей `flowSymbols` бере зі `spec.flows` сам.

`check` з `check.trace` друкує рядок `trace` на рядку властивості. `area` має вигляд `never <id>`, як `invariant <текст>` для інваріантів:
- `ok` — запуск завершений, `dropped: 0`, `<id>` є в `instrumented`, а span `<id>` немає ні в області, ні в інших деревах викликів;
- `fail` — span `<id>` є в піддереві span області, і повідомлення називає тест. Спостережене порушення дає `fail` і в неповному запуску;
- `unverified` — в інших випадках, зокрема коли span `<id>` є лише в корені іншого дерева викликів (правило 11).

Нове ключове слово має потрапити в EBNF-блок format.md («Додаток А. Граматика», 33) і в перелік K004 `expected one of: …` (`keywordsOf`, src/parser.ts:135, :147; повідомлення :590). Після 33 тест звіряє EBNF з цими переліками через CLI, і без правки EBNF `npm test` впаде.

**Blocked by:** 44, 11, 20, 33 <!-- 44 — ADR властивостей потоків; 11 — крок в іншому дереві викликів; 20 — flows на SpecIR; 33 — граматика EBNF -->

**Status:** needs-triage

**Контракт:** нова граматика: контекстне ключове слово `never`, і тексти, що зараз дають K004, стають валідними. SpecIR отримує `Flow.properties`. JSON-вивід `check` отримує нові результати `criterion: "trace"` з `area` `never <id>`. `trace-plan` видає більше `symbols` (схема 1 та сама). Сумісно: жоден валідний текст не змінює значення.

## Що має вирішити тріаж

- Коли брати. За Q23 — після заморожування v1 (design-v0.2/40). Тріаж перевіряє, що ADR 0008 прийнято і форма не змінилась за результатами проби.
- Порядок форм. `never` іде першою, бо 46 і 47 будують на її вузлі й оцінці.

- [ ] `parse --json`: `- never a.b.charge` під тригером дає вузол із посиланням і span (UTF-16 offset, `col` у code points). `- never` і `- never a.b c.d` дають K005 з позицією, невідоме ID — K001 на своєму span. Повторний `fmt` нічого не змінює, `fmt --check` = 0.
- [ ] CLI-тест із trace:
  - завершений інструментований запуск без span символу — `trace ok`;
  - span символу в межах тригера — `trace fail` з назвою тесту, і так само з `complete: false`;
  - `complete: false` без span або символ поза `instrumented` — `unverified`;
  - span лише в корені іншого дерева — `unverified`.

  `check --format json` пише в stdout лише JSON, підсумок — у stderr. Код 1 дає лише `fail`.
- [ ] `keylang trace-plan <flow>` містить символ із `never`, і адаптер `node --import keylang/trace` його інструментує. Для цього достатньо одного e2e на тимчасовій копії.
- [ ] EBNF-блок format.md і перелік K004 оновлено, тест 33 зелений. format.md §5 і «Flows: докази кроку» описують форму, «Дорожня карта» більше не згадує `never`.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/parser.ts`, `src/ir.ts`, `src/fmt.ts`, `src/spec-ir.ts`, `src/flows.ts`, `src/trace-evidence.ts`, `src/trace-plan.ts`, `src/adapters/trace-hooks.ts`, `src/lsp-features.ts`, `docs/format.md`, `tests/flows.test.ts`
