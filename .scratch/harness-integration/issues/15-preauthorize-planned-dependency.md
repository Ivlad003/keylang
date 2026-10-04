# 15: Людина не може заздалегідь дозволити нове ребро між шарами для фічі

**Status:** resolved

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** тікет 11 (nest × Claude, nest × Codex).

**What to build:** Сценарій користувача: фіча потребує нового модуля пошти в новому шарі `mail` і ребра `article → mail`. Людина додає шар у `keylang.json`, виконує `keylang baseline` і пише в `keylang/rules.md` рішення `- allow article mail`, `- allow mail external.nodemailer`. Після реалізації:

- `mail → external.nodemailer` — ok: `allow mail external.nodemailer` (глибина 3) вужчий за baseline `deny mail … external …`.
- `article → mail` — **K102** від `deny article app, mail, main, …` у `rules.baseline.md:8`: `allow article mail` має ту саму глибину, а у форматі 2 `deny` перемагає (deny-overrides).

Тобто ручне рішення в `rules.md` на рівні шарів не діє проти згенерованого baseline, а сам baseline редагувати заборонено (deny Claude, інструкція). Дозволити ребро можна лише після реалізації через `keylang baseline`, що приймає весь поточний граф без розбору. Обидва агенти коректно зупинились на K102 і попросили злити пропозицію, але фіча структурно не могла стати `done`. Додатково: `apply_diff` на `keylang/rules.baseline.md` відмовляє з «a generated file: it is written by `keylang map` only» — агент не дізнається, що треба `keylang baseline` (див. 17).

Варіанти для рішення людини:
1. `baseline` не пише `deny <A> <B>`, якщо будь-який ручний `rules*.md` має `allow` з тією ж чи вужчою парою (генератор бачить ручні рішення).
2. Ручні правила мають пріоритет над baseline при рівному score (baseline — нижчий шар правил).
3. `planned`-кроки фічі між шарами автоматично дозволяють ребро (ризиковано: агент пише файл фічі сам, див. 18).

- [x] рішення записане в spec/ADR і format.md §7 «Семантика правил»
- [x] фікстура: шар `mail`, `rules.md` з `allow article mail`, код `article → mail` — немає K102; без `allow` — K102 від baseline
- [x] `baseline --check` і хук Stop поводяться узгоджено з рішенням

Ключові файли: `src/baseline.ts`, `src/rules.ts`, `docs/format.md`, `docs/tools.md`

## Comments

- 2026-10-04 — рішення людини: варіант 2 — ручні правила мають пріоритет над baseline при рівній точності (baseline — нижчий шар правил); deny-overrides лишається всередині ручних правил. Записати в ADR/spec і format.md §7 «Семантика правил».
- 2026-10-04 — зроблено (варіант 2). `DependencyRule.generated` позначає правило з файла з маркером `keylang:generated`, тобто з baseline. У `decide` (`src/rules.ts`) правило baseline відкидається, якщо на ребрі є ручне правило з тим самим джерелом і тією самою найглибшою ціллю; так в обох редакціях. Вужче правило baseline і далі перемагає ширше ручне; deny-overrides між ручними не змінився. Рядок baseline `deny`, чиї ребра вирішили ручні правила, — `ok` з доказом «manual rules over the baseline». Генератор baseline не змінено: після появи ребра `check` і `hook stop` не дають K102, а `baseline --check` дає 1 (stale), і людина приймає граф через `keylang baseline`. Записано в ADR 0013, format.md §7, tools.md і skill. Тест: `tests/cli.test.ts` «baseline is a lower rule layer…» (редакції 1 і 2). Припущення: редакцію 1 змінено без нової редакції, бо до заморожування v1 вона змінна, а без baseline значення текстів те саме.
