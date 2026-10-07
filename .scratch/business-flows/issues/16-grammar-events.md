# 16: Мова: `trigger event`, перевірка `emits event` проти фактів

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 02, 08

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна) · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Реалізація пункту 1 ADR 0023.

- Парсер/SpecIR: `- trigger event <name>`; `emits event <name>` під кроком тепер має ID події.
- Перевірка: `emits` — `static ok`, якщо в піддереві кроку є dispatch літерала; `fail` — повністю прочитана область без dispatch; `unverified` — dynamic-event або дірка. `trigger event` — ID події існує, підписники перелічені у вердикті.
- LSP-доповнення назв подій; gutter у TUI.


**Мови:** реалізація мовно-незалежна — однаково для TS/JS, Python, Rust і PHP (і їх суміші в одному репо); тести — щонайменше на двох мовах, з яких одна не PHP.

## Критерії готовності

- [ ] CLI-тести на кожен вердикт; K-коди за ADR
- [ ] fmt ідемпотентний; grammar.md/semantics.md

**Межі:** події поза фактами адаптерів — unverified.

## Comments
