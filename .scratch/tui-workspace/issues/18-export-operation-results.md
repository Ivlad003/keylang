# 18: Експортувати звіт у файл без ANSI й без прихованих записів

**What to build:** користувач явно зберігає результат check у human/json/sarif/github і отримує шлях записаного файла.
**Blocked by:** [09 — запис](09-map-write-and-commit-protocol.md), [15 — предметний check-report](15-full-check-options.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A21, A22.

## З чого почати

Знайти `writeCheck`, `ruleOf`, `ruleText`, `githubData`, `githubProperty`, безпечний запис і F6 result actions. Форматери мають працювати з даними, не з відрендереним екраном.

## Кроки й контракт

1. Відділити чисте формування тексту звіту від stdout. CLI пише отриманий текст як раніше; TUI використовує його для export.
2. Дія Export доступна для вибраного завершеного звіту. Форма: format, шлях усередині root. Показати, якщо звіт outdated; експортується саме вибраний звіт, без прихованого повторного check.
3. Показати ціль та факт існування перед явним Save. Зафіксувати очікуваний вміст; зміна після вибору → конфлікт, не overwrite.
4. Перевірити простий відносний шлях, symlink-boundary, generated target і dirty-buffer на цілі. Не обходити обмеження запису заради export.
5. Записувати лише після Save, через файловий протокол. До нього read-only check і перегляд звіту не створюють каталогів.
6. Зробити вузьку можливість export готового типізованого результату повторно придатною для JSON parse/trace-plan; не створювати універсального template engine.

## Перевірки

- Кожен формат check дорівнює відповідному CLI stdout; JSON парситься, немає ANSI/статусних повідомлень.
- Esc у формі → нуль записів; новий шлях → лише вибраний файл і потрібні батьківські каталоги.
- Ціль змінена після форми, generated target або symlink назовні → відмова.
- Export старого звіту не підміняє його новим analysis; відсутні secret/progress-тексти.

## Приймання

- [x] Export є окремою явною операцією, не побічним ефектом check.
- [x] CLI-format не впливає на семантичний код check.
- [x] Код/повідомлення export-помилки не закриває сесію.

**Межі:** не писати SARIF із власним несумісним набором колонок або ruleId.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Реалізовано явну операцію `export` для завершеного звіту check (human/json/sarif/github) та explain-edge (human); форматери винесено з CLI в чистий модуль, тож CLI і TUI дають однакові байти.

- **`src/check-format.ts`** (новий, шар `features`) — `CHECK_FORMATS`, `CheckFormat`, `isCheckFormat`, `CheckReportData { results, snapshotId, coverage, lines }`, `checkReportText(format, report)` → повний stdout CLI (кожен рядок із `\n`). Сюди дослівно перенесено `ruleOf`, `ruleText`, `EVIDENCE_RULES`, `githubData`, `githubProperty` і SARIF-лог: ті самі колонки, ruleId, ruleIndex і `columnKind`.
- **`src/cli.ts`** — `writeCheck` і `FORMATS` видалено; `cmdCheck` пише `checkReportText(format, payload)`. Повідомлення про невідомий `--format` те саме. Байтову ідентичність stdout/stderr і кодів звірено зі збіркою HEAD (`git archive`) на копії HEAD і на fixtures `diagnostics`/`py-shop`, у 4 форматах; усе SAME.
- **`src/operations.ts`** — `ExportSource = { kind: "check", format, report } | { kind: "explain-edge", lines }`; `ExportRequest { kind: "export", root, path, expect: string | null, source }`; `ExportPayload { path, format, source, bytes, existed, written, refused, error }`; `"export"` є у `WRITING_KINDS`. Додано `exportText(source)` і `exportTargetProblem(root, path)`: `writeProblem` (plain relative, межа repo через symlink, тека, маркер `keylang:generated`) плюс артефакти генераторів — `<dir>/map/`, `<dir>/map-explained/`, `.keylang/index.json`, кеш фактів, `.keylang/proposals/`, зокрема ще неіснуючі (dir береться з `keylang.json` без повного `loadConfig`). `runExport`: прогрес `waiting to write` → `beforeCommit` → signal → `exportTargetProblem` + `writeProblem({ expect })` → `writeAtomic(…, { exact: true })`. Коди: 0 записано; 1 — відмова чи конфлікт (failed, нічого не записано); 2 — I/O чи невалідний root; null — cancelled.
- **`src/tui/actions.ts`** — дія `export` «Export the report to a file» (група Check, key `e in F6`, aliases `export`, `save report`, `sarif`, `github`…); `ActionContext.noExport`; `exportRecord(state)`: при відкритій F6 — вибраний запис, при закритій — найновіший check/explain-edge; для інших типів, running чи записів без payload повертає причину.
- **`src/tui/state.ts`** — `Prompt.kind "export"`, `ExportForm { record, formats, format, custom, expect, problem, bytes }`.
- **`src/tui/app.ts`** — `e` у F6 і дія палітри відкривають форму з рядками format (`←→`), path і Save; типовий шлях — `.keylang/export/check.{json,txt,sarif,github.txt}` / `edge.txt`, поки шлях не набрано вручну, він іде за форматом. Details показують звіт, `outdated: … · saved as it ran; nothing is checked again`, `target: … · new file · creates <dir>/` / `exists, N bytes: replaced on Save` / `refused: …` і розмір. `expect` фіксується під час показу форми; submit його не перечитує. Відмова (зокрема dirty-буфер цілі) залишає форму відкритою. Save викликає `startOperation` (worker, протокол `beforeCommit`/`endCommit`). `Enter` на записі export не повторює його наосліп, а повідомляє, що треба натиснути `e`.
- **`src/tui/view.ts`** — мітка `… · <format> · <path>`, `operationLabel` `export <format> <path>`, підсумок `written`/`replaced`/`refused, nothing written`/`write failed`; звіт F6 `Export · <format> of the <kind> report · path · N bytes` і `the report as it ran; nothing was checked again`; підказка `e export`; заголовок форми `export the report`, мітка `export to: `.
- **`keylang/flows/check.md`** — крок `cli.cli.writeCheck` → `features.check-format.checkReportText`; `tests/cli.test.ts` (2 flow-тести) оновлено.
- **`keylang.json`** — `src/check-format.ts` у шарі `features`. **`docs/tools.md`** — абзац «Export звіту в TUI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md` і `map-explained/README.md`; WIP `extract.md` байтово ті самі до/після (sha1 файлів і diff), не закомічено.
- **Тести** (`tests/tui.test.ts`, 3 нові; хелпери `exportForm`, `exportDetails`, `BROKEN_FLOW`):
  1. Check з fail: форма показує формат, шлях, `new file · creates .keylang/export/`, розмір; `→` змінює типовий шлях; Esc — нуль записів і тек, нових records немає. Для кожного з 4 форматів файл === stdout CLI байт у байт, без ANSI, без підсумку stderr; JSON/SARIF парсяться; GitHub містить `::error file=…`. Нові файли в дереві — рівно 4 (плюс батьківські теки), решта байтів незмінна. Запис check той самий (reference), прихованого check немає. F6 export-запису й Enter без повтору.
  2. Наявна ціль з CRLF: `exists, 5 bytes: replaced on Save`, після запису — точні байти CLI. Зміна файла після показу форми → failed 1 `changed on disk…`, зовнішній текст лишився, сесія жива. Форма відмовляє для маркер-файла, `keylang/map/new.md`, `.keylang/index.json`, symlink назовні й `../`: нічого не записано, нічого поза repo. Dirty-буфер цілі → відмова. Outdated check-звіт експортується як був (human = `payload.lines`), без нового check; dirty spec лишається dirty.
  3. Палітра без записів: `no report yet: run a check first`. Explain-edge з закритою F6: найновіший звіт, єдиний формат human, файл === stdout `check --explain-edge`. Export-запис у F6 → `only a check or explain-edge report is exported`.

Коміт: `de3bc5c` (Export a finished check or explain-edge report to a file from the TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓. `npm test`: 524 tests, 523 pass / 0 fail / 1 skipped ✓. Перший прогін мав 2 fail: flow-тести `@flow check` / in-repo check flow очікували `cli.cli.writeCheck`; тести оновлено за новим кроком flow, повторний повний прогін зелений. `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` — 0 fail / 0 unverified / 71 ok ✓.

Передано наступним задачам:
- 19, 20: додати варіант у `ExportSource` (напр. `{ kind: "parse", … }`, `{ kind: "trace-plan", … }`) і гілку в `exportText`, розширити `EXPORTABLE_KINDS` і `exportSourceOf` у `app.ts`; форма, політика цілі й протокол запису вже спільні. Формати форми беруться з `ExportForm.formats`.
- 37: дія `export` у каталозі; довгі details на вузькому екрані обрізаються.
- 35: export — writing kind, тож вихід під час commit поводиться як для інших записів.

Припущення й залишки:
- Типовий формат для check — json (структурований), для edge — human; типові цілі — під `.keylang/export/`, а не `.keylang/reports/`, щоб не підмішати їх у `check.tests`.
- Будь-яка відмова (шлях, generated, конфлікт) — failed з кодом 1; код 2 лише для I/O чи невалідного root (у wire помилка політики шляху дає 2; тут export не має CLI-аналога).
- Заміна наявної не-generated цілі дозволена після явного показу `exists … replaced on Save`.
- Wire-звіт не експортується (його результат — уже записаний файл); explain-edge має лише human, бо окремого JSON-формату CLI немає.
- Після export, як і після інших записів, `endCommit` запускає фоновий аналіз (закріплений current analysis оновлюється); записи check він не підміняє.
- Cancel під час export окремим тестом не перевірено (запис одного файла; шлях той самий, що в інших writing kinds).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `de3bc5c`.
