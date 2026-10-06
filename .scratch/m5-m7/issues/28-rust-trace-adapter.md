# 28: Trace-адаптер Rust (явні spans)

**Етап:** M5 · **Джерело:** design §9 M5, §4.3; `docs/semantics.md` §7 «Trace»

**What to build:** Runtime-хуків у Rust немає, тому адаптер — однофайловий модуль без залежностей (`keylang_trace.rs`, поставляється з пакетом), який користувач підключає `#[path]`-модулем: `let _span = keylang_trace::span("domain.order.place");` у кроці. За `KEYLANG_TRACE` guard пише `start`/`end` JSONL схеми 1 зі `snapshotId` з `.keylang/index.json`, `run`-запис — при завершенні процесу через `keylang_trace::finish()`. Можливість задекларована явно: інструментовано лише позначені функції (`instrumented` = позначені ID).

**Blocked by:** 03

**Status:** resolved

- [x] e2e: фікстура Rust з двома spans, `rustc` компілює й запускає, `check` дає `trace ok` на кроках і `trace fail missing step` без span
- [x] тест пропускається з поясненням, якщо `rustc` немає
- [x] `docs/format.md` описує адаптер

## Answer

`adapters/rust/keylang_trace.rs` — модуль без залежностей: `span("<id>")`-guard і `finish()`; мінімальний JSON-парсер плану. `instrumented` — fn плану, у файлі яких є `span("<id>")`. Тест (пропускається без `rustc`): `trace ok` на кроках зі span, `unverified … not instrumented` без span, `trace fail missing step` для невикликаного span. Межа: відповідність бінарника джерелам не перевіряється (зміну джерела показує stale snapshotId).
