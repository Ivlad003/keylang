# 04: Rust: карта `voice-transcriber` і бенчмарк

**Етап:** M5 · **Джерело:** design §9 M5; батьківський 32

**What to build:** Карта реального Rust-репозиторію `bench/repos/voice-transcriber` генерується; workspace-члени `Cargo.toml` і `build.rs` обробляються; відоме порушення й неповнота відтворюються негативним сценарієм. Результати й обмеження записано в `bench/results.md`.

**Blocked by:** 03

**Status:** resolved

- [x] `map` на `voice-transcriber` завершується без помилок, повторний запуск дає ту саму карту
- [x] інжектований заборонений `use` ловиться `check`
- [x] `bench/results.md` доповнено: час, кількість вузлів/ребер, частка unresolved

## Answer

`bench/results.md` §M5: `map` на voice-transcriber за 0.66 с, детермінований; 4/4 негативні проби (`bench/inject.ts` пише Rust для `.rs`; `deny-dynamic` для Rust пропускається). Прогін знайшов і виправив шум: конструктори варіантів/tuple-struct (`CamelCase`) не є викликами, примітиви глобальні, `a::Type::f()` — член типу, макроси чужих крейтів не дірки, `[target.…dependencies]` читаються, `build.rs` — окремий корінь. Workspace-члени резолвляться за іменем пакета (у voice-transcriber workspace немає; покрито CLI-тестом `tests/languages.test.ts`).
