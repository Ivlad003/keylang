# 07: `rules.baseline.md` з `init`

**Джерело:** spec Q9, Q16; ADR 0005 п. 6; CONTEXT «Baseline»

**What to build:** `init` і `keylang baseline [--check]` пишуть згенерований `keylang/rules.baseline.md` з маркером генерації: для кожного шару `- deny <шар> <шари, до яких зараз немає залежностей>` (включно з `external` і `unassigned`), а для шару, що вже залежить від пакетів, — `deny <шар> external` плюс точкові `allow <шар> external.<pkg>` для наявних. Спирається на граф, як `draft rules`. Порядок стабільний. `check` читає файл як специфікацію правил; одразу після `init` baseline порушень не додає. `--check` нічого не пише і дає 1, якщо baseline не відповідає поточному графу (це очікувано після схвалення нової залежності — повідомлення має казати, як регенерувати). format.md: розділ про baseline.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] після `init` на фікстурі `check` — жодного нового `fail`
- [x] новий імпорт між раніше не пов'язаними шарами — K102 з правилом baseline
- [x] новий пакет у шарі — K102; наявний пакет — ні
- [x] `baseline` ідемпотентний; `--check` не пише

Ключові файли: `src/draft.ts` (спільний алгоритм), `src/cli.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1, 90dc272; `src/baseline.ts`, `src/draft.ts`; tests/cli.test.ts «baseline: a new cross-layer import or package is K102…», «init: managed AGENTS.md block… baseline adds no fail»; опис — `docs/tools.md#agents`.
