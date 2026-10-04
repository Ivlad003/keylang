# 07: Python: карта `health-tracker` і бенчмарк

**Етап:** M5 · **Джерело:** design §9 M5; батьківський 33

**What to build:** Карта `bench/repos/health-tracker` (Python + TS) генерується без ручних правок конфігу; змішаний репозиторій дає обидві мови в одному знімку; заборонений імпорт відтворюється. Результати — у `bench/results.md`.

**Blocked by:** 06

**Status:** resolved

- [x] `init` на `health-tracker` визначає обидві мови; `map` детермінований
- [x] інжектований заборонений імпорт ловиться
- [x] `bench/results.md` доповнено

## Answer

`bench/results.md` §M5: `init` без правок конфігу визначає Python + TS, `map` 1.07 с, детермінований; 4/4 проби (`bench/inject.ts` пише Python для `.py`). Знайдено й виправлено: порівняння вузлів tree-sitter за об'єктом (зайве ребро до `__init__`), `self.attr.m()` як unresolved. Лишилось поза етапом: TS-резолвер не читає вкладений `web/package.json` (22 × `react` unresolved).
