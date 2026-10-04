# 05: Доповнення залежностей і авто-`planned` (LSP і TUI)

**Джерело:** plan.md крок 5 і §1 C14, C16, §2 «коли рядок потрібен»; design/design-deps-completion.md §4; decisions.md (авто-імпорт = planned-рядок)

**What to build:** У редакторі (LSP і TUI) після `step`/`trigger`/`calls`/`reads`/`emits`/`then`/`module`, під `- planned module ▮` і в рядку-псевдонімі модуля карти пропонуються `external.<pkg>` з трьох джерел: знімок (імпортовані), `package.json` (з detail «npm-ім'я ^версія (package.json)»), `planned`. Після `allow`/`deny` — лише шари й модули (сьогодні пропонуються fn/type, що дають K005). Кандидати фільтруються не лише `deny`, а й порядком шарів (K101). Коли користувач приймає пакет, який оголошений, ще не імпортований кодом і ніде не `planned` (включно з незбереженим буфером), а курсор у розділі `flow`, пункт позначено `+ planned`, і прийняття одним кроком undo вставляє `- planned module external.<pkg>` на початку цього потоку (після `kind`/наявних `planned`, перед першим іншим вузлом; `fmt` лишається ідемпотентним). Поза потоком (map/rules) рядок не вставляється. У TUI доповнення відкривається і всередині `[...]`-посилань. Результат completion стає `{isIncomplete, items}`; пункти можуть нести `additionalTextEdits` — TUI застосовує головну заміну та додаткові правки в одному `edit()` зі зсувом курсора.

**Blocked by:** 04 <!-- 04 — вердикти для оголошених пакетів -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] `rules.ts`: спільний «шлюз залежності» (deny + порядок шарів), через який іде `blocksDependency`; `spec-ir.ts` експортує збір `planned`-декларацій з усіх документів
- [ ] `completions()` повертає список з `isIncomplete`; три джерела з `sortText` 1/2/3; нові позиції; `allow`/`deny` — шари та модулі; чиста функція «чи потрібен planned-рядок і куди його вставити»
- [ ] LSP e2e (`tests/lsp.test.ts`): фікстура з `package.json` (`pg`, dev `vitest`, `@types/node`, `@scope/pkg` + `scope-pkg`): detail-текст, маркер `+ planned` і `additionalTextEdits` з правильним 0-based рядком, після `didChange` з доданим рядком правки більше немає, цілі `deny`, заблокований `step`, K101 під `calls`, `- planned module ▮`; оновлено очікування, де тепер з'являється `external.node`
- [ ] TUI e2e (`tests/tui.test.ts`, фікстура checkout зі `stripe`): popup показує detail і `+ planned`; Tab вставляє рядок і крок на правильних рядках, курсор у кінці; `Ctrl+Z` відновлює точний текст; друге прийняття в тому ж буфері без правки; після `Ctrl+S` — `check` 0 і `fmt --check` 0; `step [infra` відкриває список
- [ ] `docs/tools.md`: розділ LSP (позиції, фільтри) і TUI (авто-planned, маркер)
- [ ] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/lsp-features.ts`, `src/lsp.ts`, `src/rules.ts`, `src/spec-ir.ts`, `src/tui/app.ts`, `src/tui/view.ts`, новий чистий хелпер застосування правок у `src/tui/`
