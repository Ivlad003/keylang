# 33: Внутрішні пакети репозиторію оголошуються як external (Cargo `path`/`workspace = true`, npm workspaces з `**`), тому `deny … external.<внутрішній>` проходить мовчки замість K001

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `x-stale-manifests-external-ids`, верифікація: confirmed.

**Місце:** `src/declared-packages.ts:289` (рецензент указав `src/declared-packages.ts:289`)

## Що не так

Внутрішніми вважаються лише npm-діапазони `workspace:/file:/link:/portal:`, теки кореневого `workspaces` з одним `/*` наприкінці і composer path-репозиторії. Cargo-залежність `domain = { path = "../domain" }` або `{ workspace = true }` на крейт репозиторію стає оголошеним `external.domain`. Те саме з npm-пакетом, коли `workspaces` використовує `packages/**`, `!negation` чи `{a,b}`: такі шаблони мовчки відкидаються. ADR 0010 п.2 каже, що внутрішній код не external. Через `knownExternal` такий ID не дає K001, а ще бере участь у розподілі сегментів (див. першу знахідку).

## Сценарій збою

Rust-workspace: `crates/api` залежить від `crates/domain` через `path`. Автор чи агент пише `- deny api external.domain`, бо бачить `domain` у [dependencies]. Результат — `ok` без K001, хоча api реально залежить від domain, а пакета external.domain немає. Те саме в npm-монорепо з `"workspaces": ["apps/*", "packages/**"]` і встановленими node_modules: `deny web external.acme-ui` дає ok. Із `packages/libs/*` той самий рядок дає `K001 dangling reference external.acme-ui`.

## Як відтворити

scratchpad/…/cargo1: корінь `[workspace] members=["crates/*"]`, у crates/api/Cargo.toml `domain = { path = "../domain" }`, у lib.rs `use domain::total`, а rules містять `- deny api external.domain` і `- deny api external.nonexistent`. `check` дає K001 лише для `external.nonexistent`, підсумок `1 fail, 0 unverified, 2 ok`. scratchpad/…/ws1: з `workspaces ["apps/*","packages/**"]` і symlink node_modules/@acme/ui рядок `deny web external.acme-ui` дає ok, а після заміни на `packages/libs/*` з'являється `K001 dangling reference external.acme-ui`.

Доказ верифікатора:

> I reproduced it at HEAD 45cc74d through the real CLI, with HOME and XDG_* pointed at scratch. Scratch dir: scratchpad/verify/x-stale-manifests-external-ids-4-0/
> 
> 1) cargo1: the root Cargo.toml has `[workspace] members=["crates/*"]`. crates/api/Cargo.toml has `domain = { path = "../domain" }` and `serde = "1"`, and crates/api/src/lib.rs has `use domain::total;`. keylang.json sets languages ["rust"] and layers api/domain. rules.md contains `- deny api external.domain`, `- deny api external.nonexistent` and `- deny api domain`. `node .../bin/keylang.js check` prints:
>   crates/api/src/lib.rs:1:1: K102 divergence: `api.src.lib` depends on `domain.src.lib`, which is denied by `deny api domain`
>   keylang/rules.md:4:12: K001 dangling reference `external.nonexistent`; ...
>   2 fail, 0 unverified, 2 ok
> The resolver treats domain as internal, so K102 fires on the internal layer. `deny api external.domain` still passes as ok with no K001.
> 
> 2) cargo2: same as cargo1, but the root has `[workspace.dependencies] domain = { path = "crates/domain" }` and api uses `domain = { workspace = true }`. check gives the same result, with no K001 for external.domain. `keylang explain external.domain` in the same repo answers `unknown id`. So the commands disagree with each other.
> 
> 3) ws1: the root package.json has `"workspaces": ["apps/*","packages/**"]`. apps/web/package.json has `"@acme/ui": "*"`. packages/libs/ui/package.json has `"name": "@acme/ui"`, and node_modules/@acme/ui is a symlink to packages/libs/ui. rules.md: `deny web external.acme-ui`, `deny web external.nonexistent`, `deny web ui`. Results:
>   - With `packages/**`: K102 on `web.src.page -> ui.libs.ui.src`, K001 only for external.nonexistent, `2 fail, 0 unverified, 2 ok`.
>   - After `sed` to `packages/libs/*`: `keylang/rules.md:3:12: K001 dangling reference external.acme-ui` appears, `3 fail, 0 unverified, 2 ok`.
> 
> Code path:
> - In readManifests (src/declared-packages.ts:72-97), `add` drops only LOCAL_RANGE ranges (workspace:/file:/link:/portal:).
> - addCrates (line 289) adds every Cargo dependency, including `{path=…}` and `{workspace=true}`, whose range is null.
> - The `internal` set (line 97) is built only from workspaceNames (npm, `/*` patterns only, through workspaceDirs at line 189, which drops `**`, `!`, `{}`) and composerPathNames.
> - Neither Cargo workspace members nor node_modules links into the repository are taken into account.
> - The resolvers do take them into account: rust-imports.ts checks `this.members.has(hea …

## Що зробити

- Будувати множину internal так само, як резолвери: виключати імена членів Cargo-воркспейсу (як RustResolver.members) та npm-пакети, чий node_modules-лінк веде в репозиторій або які збігає повний glob `workspaces`, щоб `external.<внутрішній>` давав K001.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/declared-packages.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
