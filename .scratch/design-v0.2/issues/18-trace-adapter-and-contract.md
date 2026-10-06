# 18: Мінімальний TS/JS trace: JSONL-контракт і підтвердження порядку кроків

**Етап:** M2 · **Джерело:** design §4.3, review RV15

**What to build:** Версійований JSONL-контракт trace (`schemaVersion`, `snapshotId`, `runId`, `testId`, `flow`, `traceId`, `spanId`, `parentSpanId`, `symbolId`, `event`, `outcome`, `clockId`, `seq`, `ts`, `links`) і метадані завершення запуску (покриття інструментування, втрати, обірвані spans). Мінімальний адаптер для e2e-тестів, позначених `@flow <name>`: обгортка/інструментування, що пише spans із символьними ID знімка, без залежності від wiring. `check` читає `check.trace`, зіставляє кроки як підпослідовність із вкладенням у межах конкретного тесту й гілки; порядок — за start/end і `links`, не за сортуванням `ts`; одна подія не задовольняє два кроки. Доказ зберігається з `provenance: trace`, `snapshotId`, `runId`, `testId` і не робить статичний граф повним.

Граматика assertions і паралельних груп — рішення на цьому наскрізному сценарії (відкрите питання §10.9); фіксується в тікеті як пропозиція до v1.

**Blocked by:** 17

**Status:** resolved

- [x] фікстура flow з e2e-тестом під `@flow checkout`: `npm test` пише trace, `check` показує `trace: ok` для кроків із підтвердженою вкладеністю й порядком
- [x] trace з іншим `snapshotId` не використовується як актуальний доказ (`unverified` «stale trace»)
- [x] повторний виклик і рекурсія дають різні `spanId`; асинхронний крок підтверджується лише за наявності `links`
- [x] формат JSONL описано в документації з прикладом; `check.trace` валідується на вході
- [x] `check --format json` показує для кроку окремі докази `ID`, `static`, `tests`, `trace`

## Answer

JSONL схеми 1 (`src/trace-evidence.ts`), приклад і правила — `semantics.md` §7. Адаптер `node --import keylang/trace` (`src/adapters/trace.ts` + hooks): обгортає тіла функцій потоку, spans через `AsyncLocalStorage`, `links` для асинхронних продовжень. E2E `@flow check` у `tests/cli.test.ts` пише `.keylang/trace/check.jsonl`; `check` дає `trace ok` для всіх 11 вузлів потоку. JSON має `provenance`, `runId`, `testId`. Пропозиція до v1: assertions і паралельні групи поки не входять у схему 1 (відкрите питання §10.9 лишається).
