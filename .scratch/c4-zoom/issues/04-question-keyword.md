# 04: Відкрите питання `- ? …` у потоці

**Джерело:** spec §4.2 B2, Р2, Р9, §1b; research-c4-zoom-tools §8 п. 6 (Spec Kit `[NEEDS CLARIFICATION]`); research-c4-zoom-literature §6 (Ambig-SWE, ClarifyGPT)

**What to build:** Нове ключове слово мови `?`: елемент `- ? <текст>` — відкрите питання.

- **Позиції:** верхній рівень секції flow, під `trigger` і `step`, під `when` (grammar.md §5, таблиця позицій; Додаток А). Під `then` чи `invariant` — K004, як і зараз.
- **Листок:** вкладений елемент — K004 «не може мати вкладених елементів»; порожній текст — K005.
- **Будь-який потік**, не лише файл фічі: вид секції визначає заголовок, а не шлях (format.md Р2).
- **Зміна додавальна:** раніше такий рядок давав K004, тож значення наявних текстів не змінюється, і нова редакція формату не потрібна (ADR 0007).
- **IR:** у Text IR — вузол із текстом питання й spans; у SpecIR — питання потоку з позицією й батьками. `fmt` зберігає `- ? текст` як канонічну форму. `check` питань не звітує: це не твердження.
- **LSP:** доповнення після `- ` у цих позиціях пропонує `? `; hover — «open question».

**`feature`.** Кожне питання файла фічі — прогалина `question` стадії structure, що блокує `done` (Р9). Питання, яке було в базовому коміті (`HEAD` або `--since`) під тим самим потоком і батьками, а тепер зникло, — прогалина `spec`, як зниклий крок у `planGaps`: «question … removed since <ref>; done is judged against the plan at <ref>». Так агент не закриє фічу, просто видаливши питання; людина відповідає на питання комітом. `resources/keylang-feature/SKILL.md`: агент не видаляє питання, а повідомляє, що потрібна відповідь людини.

**Документація:** format.md (рядки таблиці позицій, EBNF, приклад із діагностиками), `CONTEXT.md` (Feature), пункт про `?` у переліку змін до v1 у тікеті design-v0.2/40.

**Blocked by:** 03

**Type:** code

**Model:** claude:claude-opus-5-5

**Status:** resolved

**Verify:** `node --test tests/question-keyword.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] тести тікета — у новому файлі `tests/question-keyword.test.ts`: Verify запускає його окремо, тож без нього тікет не закриється
- [x] `parse --json`: вузол питання з текстом і spans на верхньому рівні, під `trigger`, `step`, `when`; під `then` чи `invariant` — K004
- [x] `- ?` з вкладеним елементом → K004; `- ?` без тексту → K005
- [x] `check` на файлі з питаннями: жодної діагностики й вердикту для них; `fmt` ідемпотентний, `fmt --check` проходить
- [x] `feature`: кожне питання — прогалина `question` з позицією, код 1, `stage structure`
- [x] питання, видалене без коміту, → прогалина `spec`; після коміту видалення вона зникає
- [x] LSP-доповнення пропонує `? ` під тригером
- [x] format.md (§5, Додаток А, приклад), SKILL.md, `CONTEXT.md` і design-v0.2/40 оновлено

## Comments

- 2026-10-04 (Claude Code, сесія keylang-c9): зроблено без shiftwork. Вид вузла `question` (пишеться `?`) у `src/ir.ts`, ключове слово в позиціях верху потоку, під `trigger`/`step` і під `when` (`src/parser.ts`), `QuestionItem` у SpecIR із завжди порожніми `children`, щоб наявні обходи потоків працювали без змін. `feature`: прогалина `question` (id — ім'я потоку, reason `open question: …`), зникле питання — прогалина `spec` через `planGaps`. format.md Р16 з виконуваними прикладами, Додаток А (перевіряється тестом проти парсера), SKILL.md п. 6, тікет design-v0.2/40. Тести — `tests/question-keyword.test.ts`.
- Повідомлення K004 у цих позиціях тепер перелічує й `?`: оновлено `tests/fixtures/diagnostics.expected` і перелік ключових слів у тесті LSP-доповнень.
