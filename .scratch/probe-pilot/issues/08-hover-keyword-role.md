# 08: Hover на ключових словах і рядках без ID

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** AI-пілот 2026-10-04: role-expressiveness (4 з 4: «you need the parent to know what the line does»; hover повертає «(no hover)» на `test`, `when`, `then`, `invariant` і ключових словах — відповіді не змінив ні в кого), кандидат 6.

**What to build:** LSP `textDocument/hover` (`hover()` у `src/lsp-features.ts`) відповідає лише на ID: вид, сигнатура, файл:рядок, вердикти. На ключовому слові й на рядку без ID (`test`, `invariant`, `when`, текстовий `then`, `layers`, `entry`) — `null`. Саме там роль рядка залежить від батька (format.md §5, таблиця «Ключові слова за позицією»), і саме там протокол проби питає, чи допомагає hover.

Відтворення (master `c408f53`): копія `tests/fixtures/repo`, потік зі [спільного відтворення](../spec.md#спільне-відтворення); скрипт шле `initialize` → `initialized` → `didOpen` → `textDocument/hover` (позиції з 0):

| позиція | рядок | результат |
|---|---|---|
| 3:3 | `- step domain.order.createOrder` (слово `step`) | `null` |
| 3:12 | той самий рядок, на ID | `**fn** \`domain.order.createOrder\` …`, `ID: ok`, `static: ok` |
| 4:5 | `  - calls infra.db.save` (слово `calls`) | `null` |
| 5:5 | `  - test tests/nope.test.ts "creates order"` | `null` |
| 7:3 | `- invariant total is the sum of items` | `null` |
| 9:3 | `- when items are empty` | `null` |
| 10:5 | `  - then Rejected` | `null` |
| `rules.md` 2:3, 5:3 | `- layers domain < app`, `- entry` | `null` |

Після зміни hover на ключовому слові (і на тексті рядка без ID) повертає роль рядка в цьому контексті, одним-двома реченнями англійською, і вердикти рядка, якщо вони є. Роль — з пари «ключове слово × батько» за таблицею format.md §5, наприклад:

- `test` під `step` — «evidence for the parent step: a test in `tests/…` that must pass in the `check.tests` report»; під `invariant` — «evidence for the invariant»; і, якщо `check.tests` не задано, — «no evidence is checked: `check.tests` is not set»;
- `then` — «text» або «a reference to `<id>`» за Р10, з K008-кандидатами, якщо вони є;
- `when` у потоці — «a branch: text, its steps are optional in a trace»; у wiring — «a condition → id»;
- `module` у `# rules` — «a reference to a module the nested rules apply to»; під шаром у карті — «a module declaration».

Тексти ролей тримати в одній таблиці поруч із тією, з якої K004 знає дозволені ключові слова, щоб вони не розходились. TUI (`e`) і web беруть ту саму функцію, якщо вони показують hover.

- [ ] тест LSP через CLI (`keylang lsp`): hover на `step`, `test` під кроком, `test` під `invariant`, `then`-тексті, `when`, `layers`, `module` у rules — непорожній, роль відрізняє `test` під кроком від `test` під `invariant`
- [ ] hover на ID не змінився
- [ ] `docs/tools.md` (LSP) описує hover на ключових словах

Ключові файли: `src/lsp-features.ts`, `src/parser.ts` (контексти K004), `docs/tools.md`, `tests/cli.test.ts`

## Comments
