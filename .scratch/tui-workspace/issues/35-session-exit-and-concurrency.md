# 35: Узгодити вихід, скасування й конкурентні правки під час операцій

**What to build:** сесію можна згорнути, скасувати або завершити під час реальної операції без прихованої втрати тексту чи неправдивого success.
**Blocked by:** [30 — code commit](30-apply-complete-code-candidate.md), [34 — batch lifecycle](34-batch-model-explanations.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A10, A22–A25, A28.

## З чого почати

Знайти `App.close`, `quiet`, `idle`, `Assist.close`, `ghostSoon`, terminal quit/signal handlers та operation lifecycle 08–09. Ранні тікети вже мають локальне скасування; тут узгоджується вся сесія.

## Кроки

1. Вихід при active job показує Stay або Cancel and exit. Не завершувати процес до завершення поточного atomic write; read-only worker можна завершити за політикою 08.
2. Після cancellation settlement повторно застосувати звичайне рішення щодо dirty-буферів: скасування job не є дозволом відкинути текст.
3. Закриття F6 через Esc не cancel. Закриття сесії прибирає timers/listeners/workers; пізні callbacks не малюють і не запускають новий аналіз.
4. Глобально зупинити scheduling нових ghost-запитів під час явного job; після завершення дозволити їх лише для актуального spot. Чинний голос не втрачає завершення/очищення мікрофона.
5. Save/MERGE/export для зайнятих цілей має видиму причину; unrelated edits лишаються в буферах. Немає тихого autosave або перенесення результату в новий current-file.
6. При failed/partial/cancelled write виконати один актуальний reanalysis після commit-phase; проміжне покоління не публікується.

## Перевірки

- Довгий read-only job + quit: Cancel and exit прибирає worker, термінал відновлений.
- Batch із уже записаним brief + dirty spec + quit: partial files названі, dirty-text не відкинутий першим підтвердженням.
- Pause перед/після atomic write + Cancel: файл цілий, completed точно відповідає диску.
- Скасована модель відповідає пізно, активний ghost, зміна current-file: жодного late insertion/save/auto-open.

## Приймання

- [x] Нормальний вихід — 0 незалежно від останнього operation code; fatal transport crash — 2.
- [x] Поведінка сигналів і зовнішнього редактора не регресувала.
- [x] Тести керують бар'єрами/подіями, не спираються на випадкові sleep-таймінги.

**Межі:** не створювати global repository lock, rollback усіх файлів чи background daemon.
**Validation:** `npm run typecheck`, `npm test`; ручний TTY exit/restore зі звітом.

## Result

Вихід під час явної операції тепер іде через модальний крок «Quit while an operation runs». Закриття worker-а більше не перериває commit: поточний файл дописується, звіт зберігається.

- **`src/tui/state.ts`** — `QuitStep { label, choice: "stay"|"cancel", waiting }`, поле `State.quit`.
- **`src/tui/app.ts`** — `quit()`: якщо операція активна, перше `q`/`Ctrl+C` відкриває крок (типово `[Stay]`), друге `q` у ньому — Cancel and exit; `quitKey` (←→/Tab, Enter, Esc = stay; під час `waiting` Esc лишає сесію, а скасування триває); `cancelAndQuit` викликає чинний `cancelActive`: до commit — одразу `cancelled`, під час commit — «cancelling after the current file». `quitAfterSettle` (з `settle`): після Cancel and exit повторно виконує звичайне рішення щодо dirty-буферів (`quitIfSaved`), повідомлення називає `written: …` або `nothing written`, після нього `q` виходить. Якщо операція завершилась сама, поки крок питав, крок закривається з «… · q quits». Миша й paste під кроком ігноруються. Результат після `close()` лише записується: без повідомлення, MERGE, відкриття файла чи аналізу. Закрита сесія не приймає `input` і не планує `reanalyzeSoon`.
- **`src/tui/background.ts`** — `OperationWorker.close()`: запит до commit одразу дає `cancelled`. Запит у commit отримує `cancel` між кроками й тримає worker (ref) до свого результату, після чого worker завершується. Тому SIGTERM/SIGHUP чекають поточний запис, а звіт про записане не губиться.
- **`src/tui/view.ts`** — `drawQuit` (кнопки або «cancelling…» з підказкою).
- **`src/tui/terminal.ts`** — `runTerminal(root, host, session?)`: необов'язковий `operations`/`operationWorker` для тестів.
- **`docs/tools.md`** — абзац про worker і скасування (крок виходу, очікування commit, повторне питання про dirty-буфери, пізні результати); абзац про сигнали (commit дописує поточний файл, rollback немає).
- **Карта** — перегенеровано `keylang/map/tui.md`, `keylang/map-explained/tui.md`, `map-explained/README.md`; WIP-файли `extract.md` до й після байтово однакові (sha1 і diff), їх не закомічено.

Тести (`tests/tui.test.ts`, +5; `session()` приймає `onQuit`; хелпер `screenOf`):
1. `runTerminal` + gated worker: map check утримується; `q` показує крок `[Stay] [Cancel and exit]`; Esc і Enter на Stay лишають сесію (raw mode, процес не завершено). Cancel and exit → 0, останній вивід `LEAVE`, raw вимкнено, worker сесії закрито (`the session is closed`), дерево незмінне.
2. Map write: пауза перед commit, `q q` → вихід одразу; після відпуску паузи нічого не записано. Cancel and exit на «writing .keylang/index.json» → `waiting`, quit=0. Після settle quit=1, completed = `[domain.md, index.json]` = `written`, на диску змінені рівно вони, решта байтово як була.
3. Brief batch (held model, jobs 1): перший brief записано, spec dirty; `q q` → batch `cancelled`, quit=0. Повідомлення: `cancelled: 1 of 12 …`, `written: …application.purchase.buy.md`, `unsaved changes in keylang/flows/checkout.md…`; текст буфера й диск цілі, нових запитів немає; наступне `q` → quit=1.
4. Draft llm (held model) + ghost delay 0: нового ghost-запиту немає; переход на refund.md; Stay лишає операцію running; Cancel and exit → cancelled + питання про dirty. Пізня відповідь моделі нічого не змінює: дерево незмінне, current = refund.md, mode view, ghost null, буфер цілий. Наступне `q` виходить.
5. `OperationWorker.close()` на кроці «writing …/…» реального worker-а: `cancelled` із payload, ≥1 completed і not-attempted кроки, `written` = completed, на диску лише вони; далі `failed 2`.

Перевірки: `npm run typecheck` ✓; `npm test` 567 tests, 566 pass / 0 fail / 1 skipped ✓ (перший прогін упав лише на застарілій карті, після `node bin/keylang.js map` зелений); `node bin/keylang.js map --check` ✓ 0; `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓. Ручний TTY (python `pty`, 120×30, тимчасовий репозиторій, справжній `node bin/keylang.js`): Map write → `q` показав крок; запис завершився сам, крок закрився з `map write: 3 written · code 0 · written: … · q quits`; `q` → код 0, alt-screen покинуто, карту записано.

Приймання: код 0 при звичайному виході (нові тести 1–4, чинні terminal-тести після feature 1/2 і check 1/2), crash → 2 (чинний тест); тести сигналів, SIGTSTP/SIGCONT і `$EDITOR` проходять без змін. Тести керуються gate/held model/progress-подіями. `sleep` лишився лише для Esc-декодера (ESC_MS) і для негативних перевірок «нічого не сталося».

Коміт: `0aa05c7` (Ask before quitting during an operation and wait for its current file); сторонній WIP не зачеплено.

Передано наступним задачам:
- 36: крок виходу — у спільному `App`, тож у web він той самий. `onQuit` у web викликається лише після settle. Закриття вкладки (`keepMs`) і `server.close()` використовують `app.close()`: commit дописує поточний файл, але web-сесія не чекає результату для показу.
- 38: аудит A10/A22–A25/A28 може спиратися на тести 1–5.

Припущення й залишки:
- `q` удруге в кроці означає Cancel and exit (як у чинному патерні «q again quits»). Типовий вибір — Stay.
- Якщо операція завершилась сама, поки крок питав, сесія не виходить автоматично: крок закривається, потрібне ще одне `q`.
- Сигнал (SIGTERM/SIGHUP) під час commit одразу відновлює термінал і повертає 0, а процес живе, доки worker не допише поточний файл. Повторний сигнал після цього завершує процес типовою обробкою (слухачів уже знято). Для операцій у потоці сесії (тестові mocks) close лише перериває через signal.
- Після Cancel and exit без dirty-буферів `endCommit` ще стартує аналіз, а закриття його відкидає: зайва робота, на результат не впливає.
- Global lock, rollback і daemon не вводились.

## Comments

- 2026-10-01: виконано, коміт `0aa05c7`; крок виходу під час операції, очікування поточного файла в commit, повторне питання про dirty-буфери; 5 поведінкових тестів, ручний PTY-smoke.
