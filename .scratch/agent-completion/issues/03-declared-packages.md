# 03: Оголошені пакети з `package.json`, спільні external-ID, межі маніфестів

**Джерело:** plan.md крок 3 і §1 C9, C10, C13; design/design-deps-completion.md §1; review-deps-completion.md

**What to build:** Prefactoring і дані для 04–08. Аналіз знає оголошені пакети: `Analysis.packages` і `Graph.packages` — відсортований список `{id, name, ecosystem: npm|cargo, declarations: [{manifest, field, range}]}` з оригінальними іменами й діапазонами версій. Джерело — `package.json` у корені й на предках проаналізованих файлів (як каже `docs/format.md` §6), з урахуванням `exclude` і без обходу `node_modules` (сьогоднішній обхід усього дерева коштує ~1 с і підхоплює маніфести з `bench/repos`). `workspace:`/`file:`/`link:`/`portal:` і пакети з кореневого `workspaces` — не external; `@types/x` рахується як `x`; Cargo.toml як сьогодні; Python-маніфести не читаються (задокументувати). Маніфести парсяться як JSONC тим самим парсером, що імпорти, і входять у входи резолвера (кеш MCP). Логіка `external.<seg>` і суфіксів колізій (`-2`, `-3`) переїжджає в один модуль шару `base` і застосовується один раз до об'єднання імпортованих та оголошених імен — тож оголошений і імпортований пакети більше не розходяться в ID. `EXTRACTOR_VERSION` підвищується.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] новий модуль external-ID у `base` (додано до `keylang.json`); `graph.ts` і `declared-packages.ts` користуються ним, дубльованої логіки немає
- [x] `declared-packages.ts` переписано: межі маніфестів, `exclude`, workspaces, `@types`, JSONC; старі тексти помилок збережено; `map`/`map --check` дають 2 на зламаному маніфесті-предку
- [x] `knownExternal` для резолвера будується з `packages`; режим без коду читає лише кореневі маніфести
- [x] тести: `exclude: ["bench/**"]` з `bench/x/package.json` → `step external.junk` стає K001 (зміна поведінки, зафіксована); `@scope/pkg` і `scope-pkg` разом → `external.scope-pkg-2` з попередженням; workspace-пакет не в `knownExternal`
- [ ] повний `npm test` у реальному дереві без регресій (це зміна snapshotId і кешу фактів)
- [x] `docs/format.md` §6 (межі, колізії, Python не читається, `@types`, workspaces); `docs/adr/0010-declared-packages.md` з аргументом «bug fix у межах ADR 0007»; у підсумку PR — явна позначка несумісності для посилань, відомих лише через вкладений/виключений маніфест
- [ ] `npm run typecheck`, `npm test`, `map` (переглянути diff), `map --check`, `check` — зелені

Ключові файли: новий `src/external-ids.ts`, `src/graph.ts`, `src/declared-packages.ts`, `src/analyze.ts`, `src/snapshot.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: не реалізовано. «declared packages are not K001» з v0.3.0 (b712096, 6dcdc78) — це наявний `declaredExternalIds` у `src/declared-packages.ts`: обхід усього дерева (`readdirSync` recursive, лише пропуск `node_modules`/`.git`/`target`), `JSON.parse`, лише `Set` ID для `knownExternal` у `src/analyze.ts`. Немає `Analysis.packages`/`Graph.packages`, `src/external-ids.ts`, меж маніфестів і `exclude`, workspaces/`workspace:`, `@types`, JSONC, ADR 0010; `EXTRACTOR_VERSION` = m1.8. Тікет потрібен повністю; наявні тексти помилок `declared-packages.ts` зберегти.

### Shift 1 — opencode opencode-go/glm-5.3 (medium)
- Ended: budget
- Usage: 2089232 in / 7445 out tokens, $1.5101, 31 turns
- Time: 7m 52s
- Verify: passed
- Outcome: new attempt
### Handoff — shift 1, opencode:opencode-go/glm-5.3 → opencode:opencode-go/deepseek-v4.1-flash, reason: budget.maxCostUsd ($1.5101 / $1.5)
- Last output:

```
Тепер я прочитаю ключові файли, які мені потрібно зрозуміти: `src/imports.ts` (JSONC-парсер, обробка робочого простору), `src/map.ts`, `src/config.ts`.
Тепер я прочитаю решту відповідних файлів: `assess.ts`, `resolve.ts`, `frontends.ts` та частину `cli.ts`, де обробляється `withoutCode`.
Тепер я перевірю резолвери фронтендів (`frontends.ts`, `rust-imports.ts`, `python-imports.ts`) та як вони надають `inputs`.
```

### Handoff — 2026-10-04, Claude Code (subagent, worktree branch `worktree-agent-a78683d20be6675da`)

Роботу перервано на вимогу користувача (handoff + push). Зроблено з нуля за тікетом; патчі `.scratch/handoff-2026-10-02/ac03-*.patch` використано лише як орієнтир (`src/external-ids.ts` і ADR у бекапі не було — написано заново).

- Код: новий `src/external-ids.ts` (base, додано в `keylang.json`): `EXTERNAL`, `externalSegment`, `assignExternalIds`, `externalPackageId`. `src/declared-packages.ts`: `readManifests(config, files, known)` → `{packages, inputs}`; корінь + предки файлів, `exclude`, без обходу; JSONC (`parseJsoncStrict` у `src/imports.ts`); `workspace:/file:/link:/portal:` і імена з кореневого `workspaces` відкинуто; `@types/x` → `x`, `@types/a__b` → `@a/b`; старі тексти помилок збережено. `src/graph.ts`: `assignExternalIds` один раз над imported ∪ declared, `Graph.packages`, тексти маніфестів у `resolverInputs`. `src/analyze.ts`: `Analysis.packages`, `knownExternal` з `packages`; без мов — лише кореневі маніфести, `withoutCode` — порожньо (як design §1.4). `EXTRACTOR_VERSION` = `m1.9`.
- Припущення: лістинг `<base>/*` для `workspaces` не додається у входи, якщо його не записав резолвер (інакше ламався наявний тест «installs change the snapshot id» — id змінювався лише через цей ключ). Маніфести членів воркспейсу додаються.
- Тести (зелені): `tests/rules-area.test.ts` (bench/exclude → K001 для `step external.junk`; лише шлях до коду + JSONC; workspace/`file:`/`@types`; без мов — лише корінь), `tests/analyzer.test.ts` (колізія `external.scope-pkg-2` з попередженням; маніфест на шляху змінює `snapshotId`; `map`/`map --check` → 2 на зламаному предку), новий `tests/external-ids.test.ts`.
- Docs: `docs/format.md` §6 (два абзаци), `docs/tools.md` рядок `map`, `docs/adr/0010-declared-packages.md`.
- Перевірено: `npm run typecheck` — ok; цільові тести — ok; `node bin/keylang.js map` (diff переглянуто: новий модуль у base, declared-packages/graph/analyze) — закомічено; `map --check` — 0; `check` — 0 fail.
- **Лишилось:** повний `npm test` у реальному дереві (не запускався; відомі незалежні macOS-збої: snapshot spelling, два tui /var vs /private/var, packed tarball). Після зеленого прогону — відмітити два останні пункти й поставити `resolved`. У PR позначити несумісність: посилання, відомі лише через вкладений/виключений маніфест, тепер K001; колізійні ID; одноразова зміна snapshotId.
