# 06: Створювати нову ручну специфікацію як незбережений буфер

**What to build:** автор створює flow/rules/wiring/feature або порожній Markdown через палітру й записує Ctrl+S.
**Blocked by:** [05 — початкові стани](05-workspace-bootstrap-recovery.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A04, A05.

## З чого почати

Знайти `Buffer`, `App.open`, збереження буфера, `proposalProblem`, `writeProblem`, `safeWrite`, класифікацію згенерованих документів. Правила шляхів повторно використати, але не вимагати наявної proposal.

## Кроки й контракт

1. Додати дію з полями kind, відносний path, flow name. Типові каталоги беруться з config.dir; root завжди видно.
2. Мінімальний текст: flow — заголовок потоку; rules/wiring — їхній заголовок; feature — прозовий заголовок рівня 2; blank — порожній текст. Не вставляти вигадані ID.
3. Порожній новий буфер теж dirty: відсутність файла має явний стан, не виводиться лише з `text !== saved`. Зберегти `disk: null` до першого запису.
4. Заборонити вихід за spec-dir, generated map, сховище explanations, непрості шляхи й небезпечні symlink. Перевірити ще раз під час save.
5. Існуючий допустимий файл відкрити без очищення. Новий — додати до FILES і overlay відразу, але не створювати навіть каталогу до Ctrl+S.
6. Перше збереження вимагає, щоб цілі не існувало; якщо її створили зовні, лишити текст у буфері та показати конфлікт. Повторний Ctrl+S не повинен непомітно затерти нову чужу ціль.

## Перевірки

- Створити flow і feature: до save диска немає, після save аналіз читає точний текст.
- Порожній blank не губиться при перемиканні файлів і викликає звичайну перевірку незбережених змін на виході.
- `..`, абсолютний шлях, generated/explain-ціль, symlink назовні: відмова без запису.
- Створити ціль зовні між формою та save: чужі байти цілі збережені, набраний текст доступний.

## Приймання

- [x] Нова специфікація повністю створюється в одній TUI-сесії.
- [x] Шлях валідований до буфера й до запису; відсутність файла не плутається з порожнім файлом.
- [x] Esc у формі не створює буфера або каталогу.

**Межі:** не вводити загальний редактор коду чи нову граматику.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Реалізовано дію «New specification»: форма kind → path → (flow) name, незбережений буфер без файла на диску й перший запис, що ніколи не перезаписує чужу ціль.

- **`src/tui/new-spec.ts`** (новий, шар tui) — `SPEC_KINDS`, `defaultSpecPath(kind, specDir)` (`<dir>/flows/`, `<dir>/rules.md`, `<dir>/wiring.md`, `<dir>/features/`, `<dir>/`), `specTemplate` (`# flow <name>\n`, `# rules\n`, `# wiring\n`, feature — `## <ім'я файла>\n`, blank — `""`; жодних ID), `suggestedFlowName`/`flowNameProblem` (граматика сегмента `isSegment` з парсера), `newSpecProblem(root, specDir, path, generated)` — порожній/абсолютний/`\\`-шлях, не `.md`, потім чинний `proposalProblem` (прості відносні сегменти, приховані теки/`node_modules`/`target`, лише під `<dir>/`, не `<dir>/map/`, не згенерований, symlink за межі `<dir>/`), додатково `<dir>/map-explained/`, `<dir>/explain/` і ціль-не-файл. Наявний файл — не помилка. `proposalProblem` не змінено.
- **`src/tui/state.ts`** — `Buffer.newFile` (явний стан «файла ще немає», `disk: null` до першого запису); `Prompt.kind "new-spec"` + `Prompt.form: NewSpecForm { field: kind|path|name, kind, path }`; `SpecKind`.
- **`src/tui/buffer.ts`** — `newFileBuffer(path, text)` (saved `""`, newFile), `isDirty(buffer)` = `newFile || text !== saved`. Усі перевірки dirty у `app.ts`, `view.ts`, `assist.ts`, `merge-session.ts` переведено на `isDirty`: порожній новий буфер — незбережений для виходу, overlay, кроку збереження, MERGE/draft, `+` у FILES, рядка findings.
- **`src/tui/app.ts`** — `openNewSpec`/`refreshNewSpec`/`submitNewSpec`/`createSpec`. Поле kind: список видів (фільтр набраним), note — куди поведе шлях і root. Поле path: початкове значення з `config.dir` (через `MergeSession.specDir()`), note — вердикт (`new file: nothing is written until Ctrl+S` / `exists: Enter opens it as it is` / `cannot use: <причина>`) і `root <абсолютний>` (вердикт першим, щоб вузький екран не обрізав причину). Невалідний шлях: форма лишається з текстом, повідомлення `new spec: <path>: <причина>; nothing created`. Наявний файл або вже відкритий буфер відкривається як є. Новий: буфер у режимі edit, курсор після заголовка, шлях одразу в `state.files`, `reanalyzeSoon()` (overlay через `isDirty`; `adopt()` зберігає новий шлях у FILES). `save()`: для newFile — `newFileProblem` (повторний `newSpecProblem` + ціль не існує), відмова без «озброєння» overwrite; `persist()` для newFile ще раз перевіряє й пише з межею спец-каталогу (`writeInside(<dir>)`), тека створюється лише тут; після запису `newFile=false`. `saveAndContinue` (крок 07) використовує ту саму перевірку. `Esc` на будь-якому полі — `prompt = null`, нічого не створено.
- **`src/tui/actions.ts`** — `new-spec` «New specification» (group Edit, aliases `new spec`, `new file`, `create`), недоступна лише в MERGE. Імена видів навмисно не в aliases: інакше `:rules` відкривав би форму замість `Open keylang/rules.md` (перший прогін упав саме на цьому).
- **`src/tui/view.ts`** — мітки полів `new spec kind:` / `new spec path:` / `flow name:`, note біля запиту, рамка «kind of the new spec», заголовок `[+ new, not on disk]`.
- **`docs/tools.md`** — абзац «Нова специфікація».
- **Карта** — `keylang/map/tui.md`, `keylang/map-explained/{tui,README}.md` перегенеровано `node bin/keylang.js map` (новий модуль `tui.new-spec`, зсуви рядків). Diff WIP-файлів `extract.md` байтово той самий до й після (`cmp` diff-ів).
- **Тести** (`tests/tui.test.ts`, 4 нових):
  1. flow `keylang/flows/refund.md` (ім'я з файла) і feature `keylang/features/refunds.md`: до save дерево (без `.keylang/`) незмінне, теки `features/` немає, буфер у FILES, overlay-аналіз бачить doc; після `Ctrl+S` байти на диску = буфер, аналіз має обидва docs, ім'я потоку `refund`.
  2. `Esc` на кожному з трьох полів — ні буфера, ні файла; blank `keylang/notes.md` з `""` лишається unsaved після аналізу й перемикання файлів, `q` не виходить (`unsaved changes in keylang/notes.md`), диск незмінний; наявний `keylang/rules.md` відкрито без змін.
  3. Відмова без запису: `../x.md`, `keylang/../x.md`, абсолютний шлях, `src/x.md`, `.txt`, `keylang/map/…`, `keylang/map-explained/…`, `keylang/explain/brief/…`, symlink `keylang/out` назовні — форма лишається з текстом і причиною, буфера немає, дерево й зовнішня тека незмінні. Тека буфера стала symlink назовні до `Ctrl+S` — save відмовляє, назовні нічого, текст у буфері.
  4. Ціль створено ззовні між формою й save: два `Ctrl+S` не перезаписують, текст у буфері й після аналізу; крок збереження перед feature відмовляє з причиною, операція не стартує; після видалення чужого файла `Ctrl+S` пише набраний текст.

Коміт: `72f5317` (Create a new specification as an unsaved TUI buffer); лише файли 06, сторонній WIP (`extract.md`, `src/extract/ts.ts`, docs/course тощо) не зачеплено. Файл тікета — у `.scratch/` (gitignored).

Перевірки: `npm run typecheck` ✓; `npm test` 482 tests, 481 pass / 0 fail / 1 skipped ✓ (перший прогін: 1 fail — `tui: palette and search`, через aliases видів; виправлено); `node bin/keylang.js map --check` ✓ (код 0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok, код 0 ✓.

Передано наступним задачам:
- 12 (init) / 22+ (генератори spec): `newSpecProblem` — готове правило «куди можна писати нову ручну специфікацію»; `newFileBuffer`/`isDirty` — спосіб відкрити незбережений результат без файла.
- 35: `isDirty` — єдина умова незбережених змін (включно з порожнім новим файлом) для виходу й конкуренції.
- 36/37: дія `new-spec` у реєстрі; web отримує її тим самим `App`.

Припущення й залишки:
- Конфлікт першого save — сувора відмова без подвійного `Ctrl+S`: щоб зберегти, чужий файл треба прибрати/перейменувати (або вийти без збереження). Перенесення тексту буфера на інший шлях не реалізоване.
- Шлях має закінчуватися на `.md`; `.md` автоматично не дописується.
- Заголовок feature — ім'я файла без `.md` (`## refunds`), окремого поля назви немає; ім'я потоку необов'язкове лише в сенсі «типово з імені файла» — порожнє чи невалідне відхиляється (K005 інакше).
- Каталог специфікацій береться з `keylang.json` на диску (`MergeSession.specDir()`, `keylang` при помилці конфігу); у стані missing-config — з вгаданої конфігурації, тобто `keylang`.
- Дія доступна й зі стартового екрана: відкриття буфера закриває його, як `Open …`; правка запускає аналіз, як будь-яке редагування там.
- Ручну TTY-перевірку наживо не виконано; кадри форми переглянуто через віртуальний термінал.

## Comments

- 2026-09-30: реалізовано й закомічено `72f5317`; typecheck, npm test (481/0/1 skipped), map --check, check — зелені. Усі три пункти приймання відмічено.
