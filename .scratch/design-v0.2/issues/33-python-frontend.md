# 33: Python frontend

**Етап:** M5 · **Джерело:** design §7, §9 M5; bench `health-tracker`

**What to build:** Frontend Python: модуль = файл/пакет (дефолт `dir`), `import`/`from … import`, визначення функцій/класів, виклики з урахуванням низького recall синтаксичного резолвінгу методів (питання §10.7): невизначеність явна, не хибні ребра. Можливості frontend задекларовані.

**Blocked by:** 23

**Status:** resolved

- [x] карта `health-tracker` генерується без правок конфігу; заборонений імпорт ловиться
- [x] виклик методу через змінну без відомого типу → unresolved у покритті
- [x] `bench/results.md` доповнено

## Comments

- 2026-10-04 — тріаж (рішення 3А з HANDOFF-2026-10-02): усі критерії виконано тікетами m5-m7/05–07: карта health-tracker без правок конфігу й заборонений імпорт (`bench/results.md` §M5 «Python: health-tracker»; `tests/languages.test.ts`), виклик через змінну невідомого типу — прогалина `dynamic-call` («python: a call keylang cannot name is a hole…»). Те саме відхилення `module: "file"`.
