# 23: TUI: `Ctrl+Space` — чернетка агента як MERGE

**Етап:** M7 · **Джерело:** design §7.3; батьківський 38

**What to build:** У TUI `Ctrl+Space` на порожньому доповненні (або окрема дія) відправляє контекст панелі й буфер у `draft` (hybrid) і відкриває результат MERGE-diff по шматках; нічого не записується без `a`.

**Blocked by:** 15, 22

**Status:** resolved

- [x] з мок-провайдером: MERGE з двома шматками, прийнятий лише один → на диску лише він
- [x] рішення потрапляють у `.keylang/stats.json`

## Answer

`Ctrl+Space` у режимі перегляду: потік під курсором (від `trigger`) → `draftFlowWithModel` (hybrid, з `contextText` панелі) → пропозиція → MERGE одразу; статистика `proposed` і рішення MERGE. Тести `tests/tui.test.ts`: мок у тому ж процесі, пакет контексту в промпті, до `w` файл не змінено, 4× agree proposed/accepted; без моделі / без trigger — пояснення.
