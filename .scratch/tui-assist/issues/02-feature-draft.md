# 02: Чернетка моделі для файла фічі: `planned`, `trigger`, `step`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 01 <!-- 01 — вибір дії Ctrl+Space за розділом під курсором -->

**Verify:** `node --test tests/tui-feature-draft.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

**Джерело:** spec §3, §4.1, §4.3, П2, П3, П6; [ADR 0019](../../../docs/adr/0019-tui-assistant-without-harness.md); design §5.1 п. 2–3, §7.3; c4-zoom: стадії фічі (03), `- ?` (04), прогноз `deny` (05), «Ask the model for questions» (11)

**What to build:** Людина описала фічу прозою, можливо з питаннями `- ? …`. Модель пропонує `planned`-оголошення, потік з `trigger` і кроки, а людина приймає їх у MERGE. Це наступний крок після «Ask the model for questions»: питання вже є, а чернетки фічі ще немає.

- **Операція `feature-draft`** у `src/operations/` за зразком `runFeatureQuestions` (`src/operations/feature.ts`). Типи запиту й payload — у `src/operations/types.ts`, запис — у `WRITING_KINDS`.
- **Промпт:** збережений файл фічі; `featureStatus` (стадія, прогалини, підказки); контекст навколо його ID (`contextForIds`); шари `keylang.json`; 2–3 схожі потоки репозиторію; приклад файла фічі `refund` з `docs/cheatsheet.md` як граматика.
- **Відповідь** — увесь файл в одному блоці ```` ```markdown ````. Що keylang робить із нею, задає spec §4.3:
  - розбір без K003–K005;
  - ID — вузол знімка або `planned`; друге коло з «did you mean»;
  - питання й проза людини повертаються, якщо відповідь їх загубила;
  - `planned` на наявний ID відкидається;
  - доданий моделлю пункт несе `<!-- keylang:llm model=… status=… -->`; `conflict` дає прогноз `deny`.
- **Входи:** `Ctrl+Space` у файлі фічі (рядок 3 spec §4.1, вище за `# flow` з `trigger`), `d` на звіті `feature` у `F6`, дія палітри «Ask the model for a feature draft» (aliases `feature draft`, `draft feature`).

- [ ] тести тікета — у новому файлі `tests/tui-feature-draft.test.ts`: Verify запускає його окремо
- [ ] TUI e2e, стадія `idea`: файл фічі з самої прози, `heldModel` відповідає файлом з `planned fn` у наявному шарі, `# flow` з наявним `trigger` і `step` на цей `planned`. `Ctrl+Space` дає рівно один запит. Промпт містить файл, стадію й прогалини `feature`, контекст ID і шари
- [ ] той самий e2e: MERGE відкрито на файл фічі, і кожен доданий пункт має `status=…`. До `w` дерево, крім `.keylang/proposals/`, не змінилося, вердикти ті самі. Після `w` стадія `feature <slug>` — `ready`
- [ ] у файлі є питання `- ? …`, а відповідь його й прозу загубила: keylang повертає обидва в пропозицію, і звіт `F6` про це каже. Після `w` стадія — `structure`, бо питання відкрите
- [ ] невідомий ID: рівно два запити (друге коло з «did you mean»), а що лишилося — перелік `unknown` у `F6`. `planned` на наявний ID відкинуто з приміткою
- [ ] прогноз `deny`: `planned`-ребро, яке заборонить правило з `keylang/rules.md`, має `status=conflict`, а доказ видно в `F6`
- [ ] стадії `ready` і `done`: запиту немає, повідомлення каже про прогалини реалізації в `F6`
- [ ] відмови до запиту: немає `agent`, незбережений буфер, пропозиція чекає. Cancel дає `cancelled` без записів, `.keylang/stats.json` теж
- [ ] `d` на звіті `feature` у `F6` і дія палітри дають той самий запит, що й `Ctrl+Space`
- [ ] `Ctrl+Space` у `# flow` з `trigger` усередині файла фічі дає чернетку фічі, а поза файлом фічі — чернетку потоку, як раніше. Повідомлення з тікета 01 тепер називає й файл фічі
- [ ] `?`, рядок підказок звіту `feature` у `F6` (`d`), палітра, `docs/tools.md` (`F6` і звіт готовності, `Ctrl+Space`, палітра)

## Comments

### Notes

- 2026-10-06 (тікет написано): CLI-команди тут немає (П6), як і для `feature-questions`. Операція спільна (ADR 0008), тож `keylang draft feature` можна додати окремим тікетом.
- Порядок `Ctrl+Space` ураховує відкритий тікет `.scratch/agent-completion/issues/09-tui-build-planned-agent-jobs.md`: рядок `planned fn` без реалізації стоїть першим. Поки 09 не зроблено, `Ctrl+Space` на такому рядку у файлі фічі дає чернетку фічі.
