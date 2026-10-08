# 28: Експорт у BPMN 2.0 і draw.io (.drawio), імпорт .drawio як чернетки

**Status:** resolved

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

- [x] BPMN валідний за XSD (тест з перевіреним пакетом)
- [x] round-trip drawio без змін — порожня пропозиція
- [x] docs/cli.md

**Межі:** повна семантика BPMN — поза обсягом (spec §7).

## Comments

### Реалізація (2026-10-08)

- `src/bpmn-export.ts` (шар `map`): `renderBpmn(input, name)` — `diagramOf` + `layout`, тож картина та сама, що на `/diagrams`. Відображення за таблицею ADR 0023: пул із `laneSet` (доріжка на шар; вузли без шару — доріжка `—`), `startEvent` з `message`/`timer`/`signal` за видом тригера (вид із `trigger <kind>`, інакше з `snapshot.entries`), `task`, `exclusiveGateway` з `conditionExpression` на гілці, `parallelGateway` `Diverging`/`Converging`, `intermediateThrowEvent` + `signal` для `emits`, `intermediateCatchEvent` з `timeDuration`/`timeCycle` для `after`/`every`, пакет — згорнутий пул з `messageFlow` туди й назад (послідовність обходить його), `continues` — згорнутий пул з `messageFlow` до старту, дірка — `task` «?» з `documentation` «keylang: <причина>». BPMNDI: межі всіх фігур, точки всіх ребер. `keylang:id`/`keylang:verdict` (простір імен `keylang`) — на кожному семантичному елементі (`none` без вердикту). `diagram.ts` не змінено: вид тригера й `continues` експорт читає з потоку сам.
- `src/drawio.ts` (шар `map`): `renderDrawio` — `<mxfile host="keylang">` без стиснення, комірки `<object>` з `keylang_id`, `keylang_kind`, `keylang_line`, `keylang_verdict`; стилі — як у `web/src/canvas.ts`. `parseXml` — малий читач XML (теги, атрибути, сутності, коментарі, CDATA), `parseDrawio` читає й стиснену сторінку (base64 + raw deflate + URI). `flowFromDrawio` редагує розділ потоку мінімально (див. docs/cli.md «import drawio»).
- `src/operations/diagram-export.ts`: `runDiagramExport`, `runImportDrawio`, `diagramExportText`, `exportViewOfQuery`. **Відступ:** це не нові види `runOperation` (без TUI-форми й без запису в `OperationRequest`/`WRITING_KINDS`) — CLI і `/api/export` викликають функції напряму; TUI-дію можна додати окремо. Імпорт іде через ті самі ворота пропозицій (`proposalRefusal`, `commitProposal`), що й `flows adopt`; пропозиція, що вже чекає, — 1.
- Гарантія round trip: новий текст розділу порівнюється з поточним; рівні — код 0, «nothing to propose», нічого не пишеться. Перевірено тестом на двох потоках фікстури й вручну на `keylang/flows/{check,tui}.md` цього репозиторію.
- CLI: `export bpmn|drawio <view> [--out]` (вид — ім'я потоку, `discovered:`, `process:`, для drawio ще `entry:` і `layers`), `import drawio <file> [--into] [--print]`. `--out` перезаписує лише новий файл або експорт keylang (`exporter="keylang"` / `<mxfile host="keylang"`).
- Web: `GET /api/export?format=bpmn|drawio&view=…` (той самий query, що `/api/diagram`, той самий токен; 403 без нього, 400 на невідомий формат чи вид), кнопки «Export BPMN» / «Export draw.io» — `web/src/export.ts` і один рядок у `web/src/diagrams.ts`.
- **XSD:** перевірка справжня — XSD BPMN 2.0 (OMG: `BPMN20.xsd`, `Semantic.xsd`, `BPMNDI.xsd`, `DI.xsd`, `DC.xsd`), які постачає `bpmn-moddle`, валідує libxml2 у WebAssembly (`xmllint-wasm`, MIT, без native-збірки). Обидва — нові devDependencies (`npm ls --omit=dev` без змін). XSD не перевіряє посилань між елементами, тож тест додатково звіряє `sourceRef`/`targetRef`/`bpmnElement`/`processRef`/`signalRef`/`flowNodeRef` і наявність `keylang:id`/`keylang:verdict` та BPMNDI-фігури на кожному елементі.
- Тести: `tests/bpmn-export.test.ts` (6): XSD і відображення всіх форм; формат drawio і стиснена сторінка; round trip = порожня пропозиція, додана задача = один шматок, примітка/видалення/перейменування; новий потік з малюнка; CLI `--out`; `/api/export` 403/200/400.
- Межі: порядок наявних рядків малюнок не змінює (переставлені ребра між наявними фігурами ігноруються); `calls`, дірки й паралельні шлюзи з малюнка не читаються; нова `parallel`-група з малюнка не створюється.
