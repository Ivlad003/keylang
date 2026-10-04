# 01: `test` і `invariant` без `check.tests` мовчать, навіть коли файла тесту немає

**Status:** needs-triage

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04 (`docs/usability-probe-results-2026-10-04-ai-pilot.md`): role-expressiveness (сесії 1, 3, 4), §10.7 (4 з 4: «silence is harder to read than `unverified`»), кандидат 2.

**What to build:** Рядок `- test <файл> "<назва>"` під кроком чи `invariant` і сам `invariant` не дають у `check` жодного рядка, якщо в `keylang.json` немає `check.tests`. Це за специфікацією: «Без `check.tests` / `check.trace` відповідні докази не друкуються» (format.md, «Flows: докази кроку»). Але учасник не знає про `check.tests`, бачить `0 fail` і читає мовчання як «перевірено». Навіть шлях до неіснуючого файла тесту нічого не змінює.

Відтворення (master `c408f53`): копія `tests/fixtures/repo`, `keylang/flows/pilot.md` зі [спільного відтворення](../spec.md#спільне-відтворення), з кореня копії `node <keylang>/bin/keylang.js check keylang/flows/pilot.md --strict` → рядки 6 (`test tests/nope.test.ts …`), 8 (`invariant …`) і 9 (`test tests/missing.test.ts …`) без жодного результату; підсумок `1 fail, 0 unverified, 5 ok`, а `--strict` нічого не додає. Для порівняння: з `"check": {"tests": ".keylang/reports/*.json"}` ті самі рядки дають `tests unverified … no report (tests/nope.test.ts "creates user")` і `tests unverified then …: no test evidence` (перевірено на тимчасовому TS-репо).

## Що має вирішити людина

1. **Існування файла — завжди.** Незалежно від `check.tests`, `test` з файлом, якого немає в репозиторії, дає попередження (новий K-код рівня warning, як K008): `` `tests/nope.test.ts` does not exist ``. Решта поведінки без змін. Дешево, без зміни вердиктів.
2. **Один рядок «докази не налаштовано».** Без `check.tests` кожен `test` і `invariant` дає `tests unverified …: check.tests is not set in keylang.json`. Підсумок починає рахувати ці рядки як `unverified`, а `--strict` — як провал: змінюється вихід `check` на всіх репозиторіях з `test` у потоках.
3. **Нічого не змінювати в `check`, лише показати роль у hover** (тікет 08): hover на `test` каже «evidence only when `check.tests` is set».

**Рекомендація:** варіант 1 (+ 3 через тікет 08). Відсутній файл — це висяче посилання, як K001, і його можна перевірити синтаксично. Варіант 2 збільшує шум `unverified`, на який уже скаржились у §10.7.

- [ ] рішення записане тут і в format.md («Flows: докази кроку»; для нового коду — §7 і `explain`)
- [ ] фікстура: `test` на неіснуючий файл без `check.tests` — поведінка за рішенням; на наявний файл — без змін
- [ ] `tests/fixtures/diagnostics.expected` і `spec-forms/*.expected` змінено лише так, як вимагає рішення

Ключові файли: `src/flows.ts`, `src/check-results.ts`, `src/diag.ts`, `src/explain.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments
