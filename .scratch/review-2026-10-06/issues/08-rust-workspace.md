# 08: Rust: workspace не в корені репозиторію робить крейти репозиторію зовнішніми пакетами

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `langs`, верифікація: confirmed.

**Місце:** `src/rust-imports.ts:211` (рецензент указав `src/rust-imports.ts:212`)

## Що не так

`workspaceMembers()` читає лише кореневий `Cargo.toml`. Cargo ж шукає корінь workspace вгору від крейта, тож `backend/Cargo.toml` з `[workspace] members = ["crates/*"]` теж є workspace. Коли workspace лежить у підтеці, `this.members` порожній, а `shop_core::place()` іде гілкою `crate.deps.has(head)` (рядок 89) і стає `external.shop-core`: зникають внутрішні ребра між шарами. semantics/snapshot кажуть, що ім'я члена `[workspace] members` означає бібліотеку крейта, і про корінь нічого не уточнюють.

## Сценарій збою

Поліглотний репозиторій: `backend/Cargo.toml` з `[workspace] members=["crates/*"]`, `backend/crates/app` залежить від `shop-core = { path = "../core" }` і викликає `shop_core::place()`. У keylang.json шари core і app, у rules.md `- deny app core`. `keylang check` дає `0 fail, 0 unverified, 1 ok`, а ребро в карті — `app.src.main -> external.shop-core`. Те саме з workspace у корені дає правильний `K102 divergence … denied by deny app core`. Схожий результат (документований, але так само хибний ok) дають перейменована path-залежність на члена workspace (`domain = { package = "shop-core", path = "../core" }`) і path-залежність без workspace.

## Як відтворити

Фікстура scratchpad/review/langs/rs2 (backend/Cargo.toml workspace, crates/core/src/lib.rs `pub fn place() {}`, crates/app/src/main.rs `shop_core::place();`). `keylang map` -> `EDGE import app.src.main -> external.shop-core`; `keylang check` -> `0 fail, 0 unverified, 1 ok`, exit 0. Контроль rs3 (той самий workspace у корені): `K102 divergence: app.src.main depends on core.src.lib, which is denied by deny app core`, exit 1. Варіанти rs3 з перейменованою залежністю й без workspace теж дають `external.shop-core` і `1 ok`.

Доказ верифікатора:

> I reproduced the claim myself with a fresh fixture under scratchpad/verify/langs-0-0. HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed into that scratch dir.
> 
> Fixtures:
> - `sub`: `backend/Cargo.toml` is `[workspace] members=["crates/*"]` with no `[package]`. `backend/crates/core` is package `shop-core` with `src/lib.rs` = `pub fn place() {}`. `backend/crates/app` has `[dependencies] shop-core = { path = "../core" }` and `src/main.rs` calls `shop_core::place();`. In `keylang.json`, layer `core` is `backend/crates/core/**` and layer `app` is `backend/crates/app/**`. `keylang/rules.md` contains `- deny app core`.
> - `root`: the same tree, but the workspace sits at the repository root.
> 
> Commands, each run as `cd <fixture> && node /home/kosmodev/pet_project/keylang/bin/keylang.js check`:
> - `sub`: `0 fail, 0 unverified, 1 ok`, exit=0.
> - `root`: `crates/app/src/main.rs:2:5: K102 divergence: app.src.main depends on core.src.lib, which is denied by deny app core (keylang/rules.md:3)`, `1 fail, 0 unverified, 0 ok`, exit=1.
> 
> After `keylang map` in each fixture:
> - `sub`: `keylang/map/app.md` has `- shop-core external.shop-core`, and `external.md` has `module shop-core`.
> - `root`: `app.md` has `- lib core.src.lib` and `- calls core.src.lib.place`.
> 
> Variants:
> - `sub2` (nested workspace with explicit `members = ["crates/core", "crates/app"]`, no glob): also `1 ok`, exit 0.
> - `ren` (root workspace, `domain = { package = "shop-core", path = "../core" }`, calls `domain::place()`): also `1 ok`, exit 0.
> 
> Code path at HEAD:
> - `src/rust-imports.ts:46-54`: the constructor fills `members` only from `workspaceMembers()`.
> - `src/rust-imports.ts:211-213`: `workspaceMembers()` reads only `this.readToml("Cargo.toml")`, the root manifest. Its doc comment says so: "`[workspace] members` of the root manifest".
> - So with a nested workspace `members` is empty. `resolve()` then takes the `crate.deps.has(head)` branch at line 88-89 and returns `{kind:"external", pkg:"shop-core"}`. The edge into the `core` layer is lost, and `deny app core` gets a false `ok`.
> 
> Contract:
> - `docs/snapshot.md` §Rust says: "Ім'я члена `[workspace] members` (чи пакета з бінарника) означає бібліотеку цього крейту". It does not limit this to the root manifest.
> - For npm, `docs/semantics.md:28` explicitly says "кореневого `workspaces`". For Cargo it only gives "`Cargo.toml` без `[package]` (кореневий воркспейс)" as a parenthetical example, not as a limitation.
> - Cargo itself looks for the workspace root by walking up f …

## Що зробити

- Збирати `[workspace] members` з усіх Cargo.toml-воркспейсів на шляху від крейта до кореня (як Cargo шукає корінь workspace вгору), а path-залежність, що вказує на крейт репозиторію (зокрема перейменовану через `package`), резолвити в його бібліотеку, а не в `external.*`.
- Шукати `[workspace]`-маніфест вгору від кожного крейта (як Cargo, до кореня аналізу) і розгортати його members відносно теки цього маніфесту, а не лише кореневого Cargo.toml. Ще краще, path-залежність на крейт усередині репозиторію резолвити як внутрішню бібліотеку.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/rust-imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
