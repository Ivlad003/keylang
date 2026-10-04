# 07: Тризначні вердикти з покриттям і `--strict`

**Етап:** M1.1 · **Джерело:** design §4.1 коди виходу, §4.2 «Докази та три значення», review RV05 (B)

**What to build:** Кожне правило дає результат `ok` / `fail` / `unverified` для своєї області з критерієм, областю, `snapshotId` і хешем специфікації. Нерозв'язаний імпорт, непідтримана конструкція або `opaque`-модуль у релевантній області правила роблять його `unverified` із причиною й позицією замість мовчазного `ok`. Підсумок `check` у stderr показує кількості fail/unverified/ok; `0` без `--strict` супроводжується явним переліком `unverified`, а не «0 error(s)». `--strict` дає код 1 за будь-якого потрібного `unverified`. `allow`-ребро не мусить існувати (не absence). Словник у виводі: divergence / absence / convergence / unverified.

**Blocked by:** 06 (правила на знімку)

**Status:** resolved

- [x] відтворення RV05 B (`import { missing } from "./missing.ts"` у домені + `deny domain infrastructure`): `check` → правило `unverified` з причиною та позицією імпорту, код 0; `check --strict` → код 1
- [x] за наявності підтвердженого забороненого ребра результат `fail` навіть якщо частина області `unverified`
- [x] стара форма підсумку `N error(s), M warning(s)` замінена на fail/unverified/ok у stderr; stdout лишається побудовно-рядковим `file:line:col: CODE …`
- [x] `--strict` і нова семантика кодів виходу задокументовані в `--help` і `docs/format.md` §7
- [x] карта keylang: `node bin/keylang.js check --strict` проходить або перелічує реальні `unverified` у `keylang/rules.md`-описі

## Answer

Вердикт на кожне `deny`; `unverified` дають лише прогалини рівня залежностей. Рішення: виклик через локальне значення не робить `deny` неповним — без імпорту код іншого модуля недосяжний. Коди виходу 0/1/2 — у `--help` і `format.md` §7. `check --strict` на keylang — 0.
