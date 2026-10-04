# 32: Rust frontend: декларації, модулі, імпорти, виклики з явними можливостями

**Етап:** M5 · **Джерело:** design §7 «Додавання мови», §9 M5; bench `voice-transcriber`

**What to build:** Frontend Rust через WASM-граматику: `mod`/файли як модулі (дефолт `module: "dir"`), `use`-імпорти, `pub`-експорти, виклики; резолвер шляхів crate/`super`/`self`; декларація можливостей frontend (що аналізується, що йде в покриття як непідтримане). Карта `voice-transcriber` генерується; відомі порушення й неповнота відтворюються за тим самим контрактом вердиктів.

**Blocked by:** 23

**Status:** resolved

- [x] `keylang init` на Rust-репозиторії визначає мову й пропонує шари
- [x] негативний сценарій (заборонений `use`) ловиться; макроси й trait-диспетчеризація потрапляють у покриття як unresolved
- [x] `bench/results.md` доповнено

## Comments

- 2026-10-04 — тріаж (рішення 3А з HANDOFF-2026-10-02): усі критерії виконано тікетами m5-m7/01–04: `tests/languages.test.ts` «rust: init detects the language and layers…» (init і шари), K102 на забороненому `use`, макроси й trait dispatch у coverage (`unsupported` / `dynamic-call`); `bench/results.md` §M5 «Rust: voice-transcriber». Відхилення, записане в m5-m7/02 і format.md §11: типово `module: "file"` з `mod.rs` як index.
