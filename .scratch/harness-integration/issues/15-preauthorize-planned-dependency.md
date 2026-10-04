# 15: Людина не може заздалегідь дозволити нове ребро між шарами для фічі

**Status:** ready-for-agent

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

- [ ] рішення записане в spec/ADR і format.md §7 «Семантика правил»
- [ ] фікстура: шар `mail`, `rules.md` з `allow article mail`, код `article → mail` — немає K102; без `allow` — K102 від baseline
- [ ] `baseline --check` і хук Stop поводяться узгоджено з рішенням

Ключові файли: `src/baseline.ts`, `src/rules.ts`, `docs/format.md`, `docs/tools.md`

## Comments

- 2026-10-04 — рішення людини: варіант 2 — ручні правила мають пріоритет над baseline при рівній точності (baseline — нижчий шар правил); deny-overrides лишається всередині ручних правил. Записати в ADR/spec і format.md §7 «Семантика правил».
