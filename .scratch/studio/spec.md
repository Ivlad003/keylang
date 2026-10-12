# «Студія»: діаграма, проєкція і агент на одному екрані

Залежить від `.scratch/type-fields` (функція `projectTypes`).

## 1. Навіщо

Людина малює архітектуру й одразу бачить, що з цього стане специфікацією keylang і TypeScript-інтерфейсами, а агент у тому ж вікні пропонує правки. Сьогодні це три різні місця: редактор полотна, `keylang web --new`/`Запропонувати зміни`, чат у TUI.

## 2. Сторінка

- Новий маршрут `/studio` (і `/r/<id>/studio` у хабі), посилання «Студія» в навігації сторінки діаграм.
- Три вертикальні панелі з перетягуваними межами (ширини — у `localStorage`, з try/catch):
  1. **Діаграма** — наявний `Editor` (`web/src/editor.ts`) на вибраному виді; список видів — випадне меню над полотном.
  2. **Проєкція** — вкладки `keylang` | `TypeScript`. Оновлюється після змін моделі (debounce 400 мс). Підсвічує рядки вузла, вибраного на полотні (за ID).
  3. **Агент** — чат: історія, поле вводу, «Скасувати». Відповідь із пропозицією показує diff по шматках з «Прийняти» / «Відхилити».
- Новий entry esbuild `web/src/studio.ts` → `studio.js`/`studio.css` (`BUILT`, `clientStale`).
- `--read-only` і статичний експорт: сторінки «Студія» немає (посилання приховане; маршрут 404 у read-only).

## 3. API (записні шляхи, з токеном, лише не в read-only)

- `POST /api/projection {model, specHash, format: "keylang"|"ts"}` → для `keylang`: `runDiagramPropose({print: true})` — цілі з повним текстом і diff; для `ts`: тексти специфікацій з пропозиції парсяться й компілюються в SpecIR разом з рештою специфікацій, далі `projectTypes` з `ids` = ID вузлів моделі. Нічого не пише.
- `POST /api/chat {history, view, selection, model}` → `runAssistantReply` з контекстом: вибраний вид, вибрані ID, текст його специфікації, поточна проєкція. Відповідь `{reply, proposal: {target, proposal, diff, hunks} | null, dropped}`; пропозиція записується `writeProposal` (з `basis`) у `.keylang/proposals/`, як у TUI. Розрив з'єднання клієнтом скасовує запит до моделі (`signal`). Немає моделі → 409 з поясненням, що налаштувати (`llmClient` `missing`).
- `POST /api/proposal {target, action: "accept"|"reject"}` → `acceptProposal`/`rejectProposal`.
- Гейти, як в інших записних шляхах: same-origin, Bearer, `jsonBody` з лімітом.

## 4. Перевірка

- `tests/web-studio.test.ts`: `serveWeb` + фейкова модель через `ANTHROPIC_BASE_URL`: проєкція keylang/ts для моделі з planned вузлами, чат дає пропозицію, accept змінює файл, reject — ні; read-only → 403/404; без моделі → 409.
- e2e (`tests/web-e2e/studio.test.ts`, пропускається без браузера): три панелі видно, зміна на полотні оновлює проєкцію.
- `docs/tui.md` (сторінка й API), `docs/tools.md`/курс — абзац.
