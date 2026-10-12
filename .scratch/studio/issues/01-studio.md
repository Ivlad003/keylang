# 01: сторінка «Студія»

**Status:** ready-for-agent

**Type:** code

**Blocked by:** type-fields/01

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec.md

**What to build:** Усе з spec.md: маршрут і entry `studio.ts`, три панелі, `/api/projection`, `/api/chat`, `/api/proposal`, документація, тести з фейковою моделлю й e2e.

## Checklist

- [x] Маршрут `/studio` (і `/r/<id>/studio` у хабі), посилання «студія» на сторінці діаграм; у `--read-only` і статичному експорті сторінки й посилання немає
- [x] Entry esbuild `web/src/studio.ts` → `studio.js`/`studio.css` (`BUILT`, `clientStale`)
- [x] Три панелі з перетягуваними межами (ширини в `localStorage`, try/catch), список видів над полотном
- [x] Проєкція keylang | TypeScript, debounce 400 мс, підсвітка рядків виділеного вузла
- [x] Чат: історія, поле вводу, «Скасувати»; пропозиція по шматках з «Прийняти» / «Відхилити»
- [x] `POST /api/projection` (keylang — `runDiagramPropose` print; ts — накладка SpecIR + `projectTypes`)
- [x] `POST /api/chat` (контекст студії, `writeProposal` з базою, скасування при розриві, 409 без моделі)
- [x] `POST /api/proposal` (`acceptProposal` / `rejectProposal`)
- [x] `tests/web-studio.test.ts` з фейковою моделлю; `tests/web-e2e/studio.test.ts`
- [x] Документація: `docs/tui.md` (сторінка й API), `docs/tools.md`, курс `07-tools` (en, uk), `docs/cli.md` (`--print`)

## Comments

- Припущення: `runDiagramPropose` з `print: true` більше не відмовляє, коли пропозиція для цілі вже чекає (режим нічого не пише). Інакше проєкція ламалась би, щойно чат записав пропозицію. Це змінює й `keylang diagram propose --print` (раніше код 1) — описано в `docs/cli.md`.
- Припущення: серверна логіка студії — окрема операція `src/operations/studio.ts` (`studioProjection`, `runStudioChat`, `decideProposal`), `web.ts` лише розбирає HTTP. Шар `operations`, правила шарів не порушено.
- Проєкція `ts`: ID — вузли моделі без префікса `planned:` плюс `planned` флоу виду (`plannedIdsOf`), щоб `planned type` специфікації, які полотно не малює, теж були видні. `outDir` — корінь.
- Проєкція `keylang`: коли малюнок нічого не змінює, показано файл флоу виду як є (`changed: false`), щоб панель не була порожньою.
- Контекст чату: файл — специфікація флоу виду (курсор на першому виділеному ID), `context` — вид, виділені ID і diff того, що полотно додає (до 8000 символів). `feature`, `questions` — порожні.
- Скасований чат відповідає 499, якщо сокет ще живий; помилка провайдера — 502.
- `site.json` (статичний експорт) студії не містить: сторінка лише серверна. Тест збірки враховує це.
- Editor отримав два необов'язкові гачки `EditorHost.changed`/`selected` і методи `specHash()`, `selectedIds()`; `Transport.send` — необов'язковий `signal`.
