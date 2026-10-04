# 16: Перевіряти лише знахідки, пов'язані з git-змінами

**What to build:** у формі check користувач обирає Changed і git-ref, бачить той самий зріз, що `check --changed --since`.
**Blocked by:** [15 — check operation](15-full-check-options.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A20.

## З чого почати

Знайти `gitChangedFiles`, `changedPathSet`, `deletedModuleIds`, `filterChanged`, `gitChanges`. Звернути увагу на unborn HEAD, untracked і видалені модулі.

## Кроки

1. Винести git-збір входів нижче CLI, з явним root і масивом argv; shell-рядки не використовувати.
2. Розширити check request полями changed/since; типово ref HEAD. Невалідні комбінації лишити такими самими, як CLI.
3. Будувати повний аналіз, потім застосувати чинний `filterChanged`; не аналізувати лише diff-файли.
4. У звіті постійно показувати changed, ref, scope та кількість прихованих/відібраних результатів, якщо вона доступна з того самого звіту.
5. Без git або з невідомим ref повернути предметну помилку, не порожній успіх і не fallback на full-check.

## Перевірки

- Змінений source, новий untracked source і змінена spec дають ті самі findings, що CLI.
- Видалена функція/модуль лишає gap для кроку, що її згадує.
- Repo до першого коміту: HEAD обробляється як у CLI, помилкового missing-ref немає.
- Без git та поганий ref: код 2, ввід TUI працює, диск незмінний.

## Приймання

- [x] Звичайний full-check не починає вимагати git.
- [x] Changed не змінює pinned full overlay-report редактора.
- [x] Git-виклики не виконують довільний shell.

**Межі:** не показувати загальний git-diff UI й не робити commit.
**Validation:** `npm run typecheck`, `npm test`; карта/правила при виділенні git-модуля.

## Result

`check --changed [--since <ref>]` перенесено в спільну операцію `check`; CLI — принтер над нею для всіх гілок, крім `--explain-edge`; форма TUI має рядки changed і since, F6 завжди називає зріз.

- **`src/git-changes.ts`** (новий, шар `features` у `keylang.json`) — `gitChangedFiles(root, ref, label)` → `{ paths, deleted, unborn }`, `gitChangedLines(root, ref, label)` (колишній `gitChanges` для `code-to-spec --since`), `changedPathSet(root, files, base)`, `deletedModuleIds(config, files)`. Git — `spawnSync` масивом аргументів у явному root, без shell; ref, що починається з `-`, відхиляється до виклику git (`<label>: \`--output=…\` is not a git ref`). Unborn HEAD — порожнє дерево, як раніше. Повідомлення помилок ті самі (`check --changed: git …`, `code-to-spec --since: git …`).
- **`src/operations.ts`** — `CheckRequest.changed?`, `since?` (типово `HEAD`); `since` без `changed` — failed 2 `check: --since requires --changed`. Git читається до аналізу (без git / поза репозиторієм / невідомий ref — failed 2, без fallback на full), далі повний `analyze` вибраних шляхів, потім чинний `filterChanged` і `checkReport` зрізу. `CheckPayload.changed: ChangedSlice | null` — `{ since, unborn, files (POSIX від root, sorted), deleted (module ids), shown, hidden }`, де hidden = результати повного звіту тих самих шляхів мінус зріз. Коди — від зрізу, як у CLI; coverage — повного знімка, як у CLI.
- **`src/cli.ts`** — `cmdCheck` з/без `--changed` викликає операцію; `hook stop` і `code-to-spec --since` беруть git-функції з нового модуля; власні копії видалено.
- **`src/tui/state.ts`, `src/tui/app.ts`** — `checkOptions.changed/since`; ids форми `strict, static, changed, since, run` (run вибрано); `←→` на changed перемикає; на рядку since набір/Backspace редагують ref (курсор `▏`, примітка `type the git ref`); порожній ref при changed — відмова у формі; `since` передається лише разом із changed і лише коли ≠ HEAD.
- **`src/tui/view.ts`** — мітка запису `… · changed since <ref>`, `operationLabel` `check [--strict] [--changed] [--since <ref>]`; F6: `changed since <ref> · N changed file(s) · M of T result(s) shown, K hidden`, `no commit yet: …` для unborn, `deleted module(s) kept in the slice: …`; для повного check — `scope: every finding of the paths (not changed)`.
- **`docs/tools.md`** — абзац «Changed-check у TUI»; прибрано «`--changed`/`--since` поки лише в CLI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; diff WIP `extract.md` байтово той самий до/після (sha1 diff), не закомічено.
- **Тести** (`tests/tui.test.ts`, 4 нові; хелпер `checkForm` розширено `changed/since`, оновлено очікувані items форми й навігацію двох тестів 15):
  1. Закомічений checkout + інший падаючий flow: чисте дерево — 0 результатів, hidden = весь повний звіт; змінений source, новий untracked source (K101), змінена spec, strict + файл — JSON і код = CLI `--changed`; повний запис і `state.analysis` незмінні; другий коміт, `since HEAD~1` набраний у формі = CLI `--since HEAD~1`; робоче дерево без `.git` незмінне; F6 називає зріз.
  2. Видалений `src/domain/order.ts` — K001 для кроку `domain.order.create`, `deleted: ["domain.order"]`, = CLI; repo без комітів (untracked і staged) — completed, unborn, hidden 0, K101, = CLI, F6 `no commit yet`.
  3. Без репозиторію — повний check 0 (git не потрібен), changed — failed 2, payload null, повідомлення = stderr CLI, F6 далі працює; `no-such-ref` і `--output=leak.txt` — failed 2 = CLI, stdout CLI порожній, `leak.txt` не створено; порожній ref — відмова у формі; диск незмінний.
  4. `runOperation`: `since` без `changed` — 2 = CLI; git відсутній у PATH — failed 2 `check --changed: git is not available` = CLI.

Перевірки: `npm run typecheck` ✓; `npm test` 518 tests, 517 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓. `.git/index` після `check --changed` байтово той самий (перевірено вручну).

Передано наступним задачам:
- 17: `--explain-edge` лишився в CLI (перевірка комбінації з `--changed` — там само, до операції).
- 18: export змінного звіту — той самий `CheckPayload`; `changed` у JSON CLI не додавався (формат `--format json` незмінний).
- 27: `gitChangedLines(root, ref, "code-to-spec --since")` готовий для операції code-to-spec.

Припущення й залишки:
- Git читається до аналізу: при збої git нотатки `notSpecs` більше не друкуються перед помилкою (раніше друкувались). Інших змін stdout/stderr/кодів немає.
- `--changed` тепер не пише кеш фактів (як повний check з 15); раніше гілка CLI писала його.
- Ref, що починається з `-`, відхиляється і в CLI, і в `code-to-spec --since` — нове, але безпечне обмеження.
- Крок збереження перед changed-check — ті самі входи, що в 15 (spec під шляхами + `keylang.json`); незбережені буфери коду не зберігаються, git бачить диск.
- Ручну TTY-перевірку наживо не виконано.

Коміт: `6f75435` (Run the changed check through the shared check operation in CLI and TUI); сторонній WIP не зачеплено.

## Comments

- 2026-09-30: виконано, коміт `6f75435`.
