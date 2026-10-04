# 19: Переглядати й експортувати Text IR у TUI

**What to build:** дія parse показує дерево або JSON для обраних Markdown-файлів разом із діагностиками.
**Blocked by:** [18 — форматери й export](18-export-operation-results.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A21.

## З чого почати

Знайти `cmdParse`, `parse`, `printTree`, `printNode`, `keylangFiles`, `assertConfigFormat`. Прочитати IR/span-контракти, не вводити іншу одиницю offset.

## Кроки

1. Додати shared parse request: непорожній список paths; предметний результат — документи й діагностики, без renderer-об'єктів.
2. CLI tree/json formatter відділити від stdout; зберегти JSON-only stdout і diagnostics stderr.
3. Форма TUI заповнюється поточним spec-шляхом; перед дисковим parse застосувати save-barrier.
4. Прокручуваний результат tree/json; помилки мають переходи до документа. Export використовує 18, без додаткового аналізу.
5. Зберегти чинну поведінку stored explanations і перевірку саме версії формату, а не нав'язати повний аналіз коду.

## Перевірки

- Мінімальна spec з Unicode та вкладеним списком: JSON як у CLI, offsets/spans незмінні.
- Синтаксична помилка: IR/diagnostics доступні за чинною політикою, правильний код.
- Тека зі spec і stored explanation: explanation пропущено з приміткою.
- Перегляд tree/json не пише файлів; Export пише лише явну ціль.

## Приймання

- [x] Parse працює без знімка вихідного коду, коли чинний CLI це дозволяє.
- [x] JSON не містить ANSI чи підсумку сесії.
- [x] Парсер і граматика не змінені.

**Межі:** не робити редактор IR або новий serialized IR-format.
**Validation:** `npm run typecheck`, `npm test`.

## Result

`keylang parse` перенесено в спільну read-only операцію `parse`; CLI — принтер над нею; у TUI — форма шляхів і подання (tree/json), звіт F6 з діагностиками й прокручуваним текстом, export через 18.

- **`src/parse-format.ts`** (новий, шар `lang` у `keylang.json`) — `PARSE_FORMATS`, `ParseFormat` (`tree` | `json`), `parseReportText(format, docs)` → повний stdout CLI; `printTree`/`printNode` перенесено дослівно як чисті `treeLines`/`nodeLines`. Парсер і граматика не змінені (`src/parser.ts`, `src/ir.ts` не зачеплено).
- **`src/operations.ts`** — `ParseRequest { kind: "parse", root, paths, base?, format }`, `ParsePayload { format, documents, skipped, unreadable, diagnostics, text }`; `runParse`: `assertFormatOnly` лише версії формату (як `assertConfigFormat`), `collectMdFiles(paths, base)`, stored explanation → `skipped` + warning `note: …; skipped`, нечитабельний файл → `unreadable` і розбір порожнього тексту (чинна поведінка CLI), далі `parse`. Код 1 — є error-діагностика, 0 — інакше; failed 2 без payload — порожні paths, відсутній шлях, непідтримувана версія. Не в `WRITING_KINDS`, `analyze` не викликає. `ExportSource` += `{ kind: "parse", format, documents }`, `ExportFormat = CheckFormat | ParseFormat`, `exportText` рендерить документи з запису (без повторного parse); `ExportPayload.format: ExportFormat`.
- **`src/cli.ts`** — `cmdParse` async-принтер: notes → stderr (`keylang: note: …`), `payload.text` → stdout, діагностики → stderr; помилка — `keylang: <message>`, 2. `keylangFiles`, `assertConfigFormat`, `printTree`, `printNode` видалено. Байтова ідентичність stdout/stderr/кодів звірена зі збіркою HEAD (`git archive`) на `keylang`, `keylang/map-explained`, `.` (обидва подання), `tests/fixtures/diagnostics`, `examples/shop`, fmt-фікстурі, теці зі stored explanation + K003, відсутньому шляху, без шляхів і з `format: 99` — усе SAME.
- **`src/tui/actions.ts`** — дія `parse` «Parse: show the Text IR of specifications» (група Edit; aliases `parse`, `keylang parse`, `parse --json`, `text ir`, `ir`, `syntax tree`, `ir json`); не залежить від snapshot. `EXPORTABLE_KINDS` += `parse`; причина `only a check, explain-edge or parse report is exported`.
- **`src/tui/state.ts`** — `Prompt.kind "parse"`; `ExportForm.formats/format: ExportFormat`.
- **`src/tui/app.ts`** — форма parse: поточний `.md` за замовчуванням, `promptPaths` (раніше `fmtPaths`) і спільний `markdownSelection` (fmt перевикористовує), пункти `Tree of N file(s): …` / `JSON of N file(s): …`, примітка `… · saved explanations are skipped · no code snapshot needed · writes nothing`. `requestOperation`: save-barrier як у fmt (dirty-буфери вибраних шляхів і `keylang.json`). `recordGaps` для parse — діагностики (шлях нормалізовано від кореня) → `Enter` відкриває документ на позиції; у `scrollReport` для parse ↑↓ вибирають діагностику, PgUp/PgDn і колесо прокручують текст. `inputsChanged` робить parse-записи outdated. Export: формати `tree / json`, типовий — подання запису, шляхи `.keylang/export/parse.{txt,json}`.
- **`src/tui/view.ts`** — мітка `… · <format> · <paths>`, `operationLabel` `parse` / `parse --json`, підсумок `N document(s), E error(s), W warning(s) · code X`; звіт F6: `Parse · read-only, nothing written · saved files · … · <format>`, примітка про UTF-16 offsets і відсутність snapshot, skipped/unreadable, діагностики (вибирані), підказка, `── keylang parse[ --json] · stdout ──` і рядки stdout CLI; підказка заголовка `Tab diagnostics` / `Enter open diagnostic`; Export-заголовок `… of the parse report`; форма `parse paths: `, `parse specifications: Text IR`.
- **`docs/tools.md`** — абзац «Parse у TUI»; у «Export звіту в TUI» — parse серед звітів палітри.
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,lang,operations,tui}.md`, `map-explained/README.md`; WIP `extract.md` байтово ті самі (sha1) до/після, не закомічено.
- **Тести** (`tests/tui.test.ts`, 2 нові; хелпери `parseForm`, `parseRecord`, `cliParse`, `parseStderr`; оновлено очікуваний текст причини в тесті export 18):
  1. Unicode (кирилиця, `𝒳` поза BMP) і вкладений список, analyzer, що завжди падає (snapshot немає): форма з поточним шляхом, items і примітка; JSON = stdout CLI байт у байт, `documents` = `JSON.parse(stdout CLI)`, stderr CLI порожній, код 0; немає ANSI/`code 0`/`completed`/`F6`; span найглибшого кроку ріже вихідний текст UTF-16-офсетами, `col` 5; tree = stdout CLI; `treeBytes` незмінний; F6 показує звіт і дерево; export tree і json — файли = stdout CLI, нових файлів рівно два, решта байтів незмінна, прихованого parse немає.
  2. Тека з K003 (таб у відступі) і stored explanation: код 1 = CLI, IR доступний (stdout = CLI), stderr (note + діагностика) = CLI, explanation у `skipped` і не розібраний; F6 — note, `…:5:1: K003 …`; Tab → повідомлення `Enter opens …:5`, PgDn прокручує текст без втрати вибору, Enter відкриває документ на `{ line: 4, col: 0 }`, Esc — назад у звіт; dirty-буфер вибраного файла → barrier, Back нічого не пише й не стартує, Save and continue → розібрано збережений текст (= CLI); відсутній шлях — failed 2 без payload, CLI 2 з тим самим повідомленням і порожнім stdout.

Коміт: `5a536c4` (Show and export the Text IR through a shared parse operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 526 tests, 525 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓.

Передано наступним задачам:
- 20: для trace-plan — той самий шаблон: варіант `ExportSource`, гілка в `exportText`, `EXPORTABLE_KINDS`, `exportSourceOf`, формати в `openExportPrompt` і `defaultExportPath`; `ExportFormat` уже union.
- 37: дія `parse` у каталозі; довгі рядки JSON/дерева на вузькому екрані обрізаються (горизонтального прокручування немає).

Припущення й залишки:
- Подання (`format`) — поле `ParseRequest`, щоб rerun у F6 зберігав його; сам розбір від нього не залежить, `payload.text` — stdout CLI для нього.
- Нечитабельний файл, як і раніше в CLI, розбирається як порожній текст без діагностики; TUI лише додатково називає його в F6.
- Рядки діагностик у повідомленнях операції мають рівень за severity; CLI друкує їх усі в stderr, як раніше.
- parse-запис стає outdated за тим самим грубим правилом, що check/feature (будь-яка зміна входів сесії).
- Шляхи з пробілами у формі не підтримуються (як у fmt). Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `5a536c4`.
