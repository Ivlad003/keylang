# 05: pnpm-монорепо: внутрішній workspace-пакет стає external, тому deny дає хибний ok

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P1**, зона `ts`, верифікація: confirmed.

**Місце:** `src/imports.ts:388` (рецензент указав `src/imports.ts:399`)

## Що не так

`resolvePackage` вважає пакет workspace лише тоді, коли `locate()` знайде його в кореневому (або вищому) `node_modules`, або коли він є в `workspaces` кореневого `package.json`. `pnpm-workspace.yaml` keylang не читає. Тим часом `knownNear()` позначає пакет external, щойно вкладений `package.json` його оголошує (`"@acme/db": "workspace:*"`) або в `apps/web/node_modules/<pkg>` є будь-що. При цьому не перевіряється, чи веде symlink у репозиторій, хоча за snapshot.md запис `node_modules/<pkg>`, що після розкриття посилань веде в репозиторій, — це workspace-пакет. pnpm за замовчуванням не піднімає workspace-посилання в кореневий `node_modules`, тож у pnpm-монорепо кожен імпорт іншого пакета репозиторію стає `external.<pkg>`, і ребра між шарами немає.

## Сценарій збою

Шари `web: apps/web/src/**` і `db: packages/db/src/**`, правило `- deny web db`. У кореневому `package.json` немає `workspaces`, є `pnpm-workspace.yaml`. `apps/web/package.json` має `dependencies: {"@acme/db": "workspace:*"}`, `packages/db/package.json` має `{"name":"@acme/db","main":"./src/index.ts"}`, а `apps/web/src/page.ts` містить `import { query } from "@acme/db"`. `keylang check` виводить `0 fail, 0 unverified, 1 ok`, хоча web залежить від db. Те саме лишається після «встановлення», тобто з symlink `apps/web/node_modules/@acme/db -> ../../../packages/db`.

## Як відтворити

fixture scratchpad/review/ts/fx/t6 (node fx.mjs t6 t6.json): `EDGE import web.page -> external.acme-db [resolved]`, `CHECK 0 ... 0 fail, 0 unverified, 1 ok`; after `ln -s ../../../packages/db apps/web/node_modules/@acme/db` + `keylang map`: still `import web.page -> external.acme-db resolved`, `0 fail, 0 unverified, 1 ok`

Доказ верифікатора:

> I reproduced this myself in scratchpad/verify/ts-0-0/fx, with HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME pointed at the scratch dir.
> 
> **Fixture**
> - `keylang.json`: `{"languages":["typescript"],"layers":{"web":["apps/web/src/**"],"db":["packages/db/src/**"]}}`
> - Root `package.json`: `{"name":"root","private":true}`, with no `workspaces`.
> - `pnpm-workspace.yaml` lists `apps/*` and `packages/*`.
> - `apps/web/package.json`: `{"dependencies":{"@acme/db":"workspace:*"}}`
> - `packages/db/package.json`: `{"name":"@acme/db","main":"./src/index.ts"}`
> - `apps/web/src/page.ts`: `import { query } from "@acme/db"`
> - `keylang/rules.md`: `- deny web db`
> 
> **Run 1, no install**
> `node /home/kosmodev/pet_project/keylang/bin/keylang.js check` prints `0 fail, 0 unverified, 1 ok` and exits 0. `keylang map` writes `acme-db external.acme-db` into `web.md`. `keylang explain web.page` prints `depends on: external.acme-db` next to `rule keylang/rules.md:3: deny web db`.
> 
> **Run 2, pnpm-style install**
> I added the link with `ln -s ../../../../packages/db apps/web/node_modules/@acme/db`. `readlink -f` confirms it points into `fx/packages/db`. The claim's own link target `../../../packages/db` would actually land in `apps/packages/db`, but that does not change the result. `check` again prints `0 fail, 0 unverified, 1 ok`, exit 0, and `explain` still prints `depends on: external.acme-db`.
> 
> **Control**
> Same fixture, but the root `package.json` gets `"workspaces":["apps/*","packages/*"]`. Now `check` prints `K102 divergence: web.page depends on db.index, which is denied by deny web db` and `1 fail`, exit 1. So the deny rule only works when the root `package.json` has `workspaces`.
> 
> **Cause (`src/imports.ts`)**
> - `locate()` (line 233) looks for `node_modules/<pkg>` only at the root and above.
> - `workspaceDirs()` (line 262) reads only the root `workspaces`; `pnpm-workspace.yaml` is never read.
> - `resolvePackage()` (line 388) therefore falls through to `knownNear()` (line 399). That returns `true` either when the package is declared in a nested `package.json`, ignoring the `workspace:` range, or when anything exists in a nested `node_modules`, without checking where a link leads. The result is `{kind:"external"}`.
> 
> **Documented contract it breaks**
> - `docs/semantics.md` §declared packages and ADR 0010 say a `workspace:`, `file:`, `link:` or `portal:` range is this repository's code, not external. `src/declared-packages.ts` does filter those ranges; the resolver does not.
> - `docs/snapshot.md` says  …

## Що зробити

- У resolvePackage для кожної теки між файлом і коренем перевіряти `node_modules/<pkg>`: якщо `inside()` (після realpath) веде в репозиторій, це workspace. Читати `packages` з `pnpm-workspace.yaml` як `workspaces`, а діапазони `workspace:`/`link:`/`file:`/`portal:` у knownNear і в this.packages не вважати external.
- Додати в knownNear ще одну перевірку. Вкладений `node_modules/<pkg>` має проходити через `inside()`: якщо посилання веде в репозиторій, це workspace (packageEntry), а не external. Діапазон `workspace:`/`link:`/`file:` у вкладеному package.json теж не повинен давати external. Крім того, `workspaceDirs` має читати `packages` з `pnpm-workspace.yaml`. Усі ці файли треба врахувати в inputs.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/imports.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
