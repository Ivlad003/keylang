# 04: Rust і Python: `use crate::models::User` / `from app.models import User` на нечутливій до регістру ФС стає діркою, і deny з fail переходить в unverified

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `x-cross-platform-fs`, верифікація: confirmed.

**Місце:** `src/rust-imports.ts:120` (рецензент указав `src/rust-imports.ts:120`)

## Що не так

`moduleFile` у rust-imports.ts:120 і python-imports.ts:75 (і `probe` у imports.ts:422) приймає кандидата, якого немає в sources, якщо його приймає `existsSync`. На APFS чи NTFS кандидат `src/models/User.rs` збігається з наявним `user.rs`, тому резолвер повертає фантомний файл `src/models/User.rs` (whole: true) замість `mod.rs` чи `__init__.py`. Цього файла немає в графі, тож імпорт стає діркою «is not indexed».

## Сценарій збою

Найтиповіший шаблон Rust: `models/mod.rs` з `mod user; pub use user::User;`, а в `api` стоїть `use crate::models::User;`. Python теж: `app/models/__init__.py` з `from .user import User`, а у views `from app.models import User`. Правило `deny api domain`. На Linux CI: 2× K102, exit 1. На macOS чи Windows: «unverified unresolved import `crate::models::User` (`src/models/User.rs` is not indexed)», 0 fail, exit 0. Порушення не блокується ні `check`, ні `hook stop` на ноутбуці розробника. Карта теж залежить від ОС: `map` на macOS, потім `map --check` на Linux дає `keylang/map/api.md: stale`.

## Як відтворити

Фікстури scratchpad/review/cross-platform-fs/r1 (Rust) і p1 (Python). `node bin/keylang.js check` на Linux: `2 fail, 0 unverified, 0 ok`, exit 1. Через ./cf.sh (casefold tmpfs): `keylang/rules.md:3:1: unverified unresolved import \`crate::models::User\` (\`src/models/User.rs\` is not indexed)`, `0 fail, 1 unverified, 0 ok`, exit 0. Для p1 те саме з `app/models/User.py`. Після map у casefold-копії `map --check` на Linux: `keylang/map/api.md: stale, run \`keylang map\``, exit 1.

Доказ верифікатора:

> Відтворено на HEAD 45cc74d з власними мінімальними фікстурами в scratchpad/verify/x-cross-platform-fs-1-0. Фікстура `r` (Rust): src/models/mod.rs містить `mod user; pub use user::User;`, src/api/mod.rs містить `use crate::models::User;`, правило `- deny api domain`. Фікстура `p` (Python): app/models/__init__.py містить `from .user import User`, app/api/views.py містить `from app.models import User`. Нечутливу до регістру ФС давав cf.sh: `unshare -rm` + `mount -t tmpfs -o casefold` + `chattr +F`.
> 
> Linux (ext4, чутлива до регістру): `node .../bin/keylang.js check` дає для r і для p `2 fail, 0 unverified, 0 ok`, exit=1 (K102 `api.mod` -> `domain.mod` і -> `domain.user.User`).
> 
> Casefold: `./cf.sh r '... check'` знаходить `src/models/User.rs` через `ls`. Вивід: "keylang/rules.md:3:1: unverified unresolved import `crate::models::User` (`src/models/User.rs` is not indexed) (src/api/mod.rs:1:1)", `0 fail, 1 unverified, 0 ok`, exit=0. Для p: "unverified unresolved import `app.models.User` (`app/models/User.py` is not indexed)", exit=0. Зникає і друге ребро, яке дає виклик `User::new`.
> 
> hook stop: в git-копії, де ход агента додає цей імпорт, Linux дає `{"decision":"block","reason":"src/api/mod.rs:1: K102 ..."}`, а casefold дає `{}`, тож порушення не блокується.
> 
> map: після `map` на casefold `map --check` на Linux дає "keylang/map/api.md: stale, run `keylang map`", exit=1.
> 
> Причина. `RustImports.longest` (rust-imports.ts:98) перебирає k від найдовшого префікса. Для k=2 `moduleFile` (rust-imports.ts:116-123) пробує `src/models/User.rs`: його немає в `sources`, але `existsSync` на casefold повертає true через `user.rs`. Резолвер повертає `{internal, file: 'src/models/User.rs', whole: true}`. graph.ts:427-440 не знаходить цього файла в `byFile`, `notIndexed` повертає "is not indexed", і замість K102 виходить hole/unverified. Python має той самий механізм у python-imports.ts:74-77 (`longest` -> `moduleFile`).
> 
> У docs (semantics, cli, grammar, ADR, llm.txt) немає контракту, що потрібна чутлива до регістру ФС. NFC/NFD для macOS там описано, регістр ні. У docs/review-2026-10-05.md такого пункту немає (grep existsSync/APFS/нечутлив нічого не знаходить), тож це нова знахідка, а не відома відкрита. Severity P1 підтверджую: deny-правило і `hook stop` мовчки пропускають реальне порушення на macOS і Windows (exit 0, `{}`), а на Linux CI для того самого коду маємо fail. Шлях TS `probe` (imports.ts:419-426) має той самий патерн, але його не відтворював: типовий шаблон TS (`./models …

## Що зробити

- Не довіряти existsSync для кандидата поза sources: перевіряти точний регістр імені (readdirSync батьківської теки містить саме цей basename), інакше вважати, що кандидата немає, і йти до коротшого префікса (mod.rs / __init__.py).
- У moduleFile приймати кандидата поза sources лише після перевірки точного регістру (ім'я є в readdirSync(dirname)) або взагалі довіряти лише sources, щоб префікс із ім'ям символу (`User`) не перекривав `mod.rs`/`__init__.py` на APFS/NTFS.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/rust-imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-07: Регресійні тести. `tests/exact-path.test.ts` (новий): емуляція нечутливої до регістру ФС через інжекцію `ExactFs` (`existsSync` збігається без урахування регістру, `readdirSync` віддає справжнє написання) — `exactExistence` відкидає `src/models/User.rs` при `user.rs`, інший регістр сегмента теки й `..`, приймає NFD/NFC; `RustResolver` з такою ФС: `crate::models::User` → `{internal, src/models/mod.rs}` (до виправлення — фантомний `src/models/User.rs`, whole), `PythonResolver`: `app.models.User` → `app/models/__init__.py` (було `app/models/User.py`), `ImportResolver`: `../models/User` при `user.ts` → `unresolved`, як у tsc (було — виняток `statSync` на Linux або фантомний файл). `tests/languages.test.ts` «rust and python: `use crate::models::User` / `from app.models import User` through a `mod.rs` / `__init__.py` re-export…»: через справжній CLI фіксує контракт Linux для обох фікстур тікета — `map` ок, `check` з `deny api domain` → K102 ×2, `2 fail, 0 unverified`, без «is not indexed», ребро виклику через реекспорт є.
- 2026-10-07: Виправлення. Новий `src/exact-path.ts`: `exactExistence(root, fs)` — предикат «файл є на диску саме в такому написанні»: `existsSync`, потім кожен сегмент шляху шукається в кешованому переліку його теки (NFC). `moduleFile` у `src/rust-imports.ts` і `src/python-imports.ts` та `probe` у `src/imports.ts` беруть кандидата поза `sources` лише через цей предикат; інакше перебір іде далі до коротшого префікса (`mod.rs` / `__init__.py`) або до `unresolved`. Конструктори трьох резолверів приймають необов\'язковий третій аргумент `fs: ExactFs` (типово `node:fs`) — точка інжекції для тестів; `frontends.ts` не змінено. Інші виклики `existsSync` (Cargo.toml, `src/bin`, `node_modules`, `isDir`) не чіпав — поза межами дефекту.
- 2026-10-07: Контракт: `docs/snapshot.md` — абзац «Мови» (файл поза аналізом береться з диска лише в точному написанні; приклади Rust/Python/TS) і речення в абзацах Rust і Python; `llm.txt` без змін (резолвінг файлів з диска там не описано). `docs/review-2026-10-06.md` п. 10 позначено ✔. Перевірки: `node --test tests/languages.test.ts tests/exact-path.test.ts` — 29/29, `npm run typecheck` — ок, `node bin/keylang.js map --check`, `node bin/keylang.js check` — див. коміт.
- 2026-10-07: `src/exact-path.ts` додано до шару `map` у `keylang.json` (поруч з `imports.ts`, `rust-imports.ts`, `python-imports.ts`). Карту перегенеровано (`keylang map`); diff карти містить і зміни `src/safe-write.ts` з коміту 917a356 (тікет 14), після якого карту не оновили — `map --check` на master уже був stale.
