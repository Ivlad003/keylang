# 27: Trace-адаптер Python

**Етап:** M5 · **Джерело:** design §9 M5 («trace-адаптери з явними можливостями»), §4.3; `docs/format.md` §7 «Trace»

**What to build:** `python -m keylang_trace <script>` (модуль у пакеті keylang, без сторонніх залежностей) з тими самими змінними `KEYLANG_TRACE`, `KEYLANG_TRACE_FLOW`, `KEYLANG_TRACE_TEST`, `KEYLANG_TRACE_RUN`: читає `.keylang/index.json` (snapshotId і вузли fn із файлом і рядком), інструментує через `sys.setprofile` лише `trigger`/`step` потоку й пише JSONL схеми 1. Файл, хеш якого не збігається з manifest знімка, не інструментується. `check` зіставляє trace так само, як для TS.

**Blocked by:** 06

**Status:** resolved

- [x] e2e: фікстура Python + flow → `python -m keylang_trace` → `check` дає `trace ok` для кроків; змінений після `map` файл → не інструментується, `trace unverified`
- [x] тест пропускається з поясненням, якщо `python3` немає
- [x] `docs/format.md` описує адаптер і його межі (потоки/async)

## Answer

Нова команда `keylang trace-plan <flow>` (`src/trace-plan.ts`, спільна з TS-hooks: `flowSymbols`) друкує план: snapshotId і fn потоку з файлом, рядком і sha256. `adapters/python/keylang_trace.py` (лише stdlib; `sys.monitoring` на 3.12+, інакше `sys.setprofile`) читає план через `KEYLANG_TRACE_PLAN`, інструментує тільки fn з незмінених файлів, генератори/корутини не пише. Тест: `trace ok` навіть там, де `static unverified` (метод через значення); змінений після плану файл не інструментується, trace — stale. Тест пропускається без `python3`. Пакет публікує `adapters/`.
