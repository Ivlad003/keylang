# 02: Rust: модулі, декларації, `use`-імпорти й заборонений `use`

**Етап:** M5 · **Джерело:** design §7, §8 (Rust — `mod`), батьківський 32

**What to build:** Перший наскрізний шлях для Rust: `init` на репозиторії з `Cargo.toml` визначає мову й пропонує шари; `.rs`-файли й `mod` стають модулями, `fn`/`struct`/`enum`/`trait`/`type` — членами, `pub` — експортами; `use crate::…`, `super::`, `self::` і `mod x;` резолвляться у файли, зовнішні crate з `Cargo.toml` — `external`. `check` ловить заборонену залежність шарів через `use`.

**Blocked by:** 01

**Status:** resolved

- [x] мінімальна фікстура Rust: `init` пише `languages: ["rust"]` і шари, `map` генерує карту зі стабільними ID
- [x] заборонений `use` між шарами → порушення в `check` з позицією в `.rs`, код виходу 1
- [x] нерозв'язаний `use` явно в покритті, а не ребро

## Answer

`src/extract/rust.ts` + `src/rust-imports.ts` (`Cargo.toml` через `smol-toml`). Відхилення від design §8: дефолт Rust — `module: "file"` з `mod.rs` як індексом, бо так ID (`domain.order`) збігається з Rust-шляхом `crate::domain::order`; `dir` лишається доступним у конфігу. Нові стани резолвінгу: `internal.whole` (шлях називає сам модуль) і `local` (шлях у власний файл). Тести `tests/languages.test.ts`: init/map, K102 для забороненого `use`, нерозв'язаний крейт у покритті. Формат — `docs/format.md` §11 «Мови».
