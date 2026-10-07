# 28: Експорт у BPMN 2.0 і draw.io (.drawio), імпорт .drawio як чернетки

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 20

**Verify:** `npm run typecheck` · `npm test` (повний прогін — на review-зміні; у робочій зміні достатньо файлів тестів, яких торкнулась зміна)

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

- `keylang export bpmn <flow|process>` → BPMN 2.0 XML з DI-розкладкою (відкривається в Camunda Modeler / bpmn.io): доріжки = шари, елементи за таблицею ADR 0023.
- `keylang export drawio <view>` → `.drawio` (mxGraph XML), стилі фігур як у редакторі 23.
- `keylang import drawio <file>` → пропозиція (як 24): фігури з ID/`planned` у властивостях стають кроками; невідомі фігури — примітки. Одностороння гарантія: експорт → імпорт без змін не дає жодного шматка.
- Також кнопки в web.

## Критерії готовності

- [ ] BPMN валідний за XSD (тест з перевіреним пакетом)
- [ ] round-trip drawio без змін — порожня пропозиція
- [ ] docs/cli.md

**Межі:** повна семантика BPMN — поза обсягом (spec §7).

## Comments
