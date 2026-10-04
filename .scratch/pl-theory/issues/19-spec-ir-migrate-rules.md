# 19: Р-1 migrate: `rules.ts` читає SpecIR замість обходу Text IR

**Джерело:** research-pl §5 Р-1; знахідка 4; рішення Q2 (spec)

**What to build:** `evaluateRules` бере твердження зі `spec`, а не обходить `docs` у `collectRules`. Ім'я `evaluateRules` не змінюється, бо його називає власний потік `keylang/flows/check.md`. Порядок рядків `layers` за документами зберігається: від нього залежить K005 «contradicts an earlier `layers`» (rules.ts:563).

Що змінюється в rules.ts:
- K005 рядка `layers` (rules.ts:469, 518, 530, 533, 563) поки лишаються тут, але читають `Ref` із `LayersLine` SpecIR. Їх переносить у `compileSpec` тікет 24.
- K005 для fn/type/event в `allow`/`deny` (rules.ts:486) лишається в check назавжди: їй потрібен `kindOf` зі знімка.
- `denyingRule` і `blocksDependency` отримують варіант над SpecIR. До 24 стара сигнатура з `docs` делегує в `compileSpec(docs)`. Варіант над SpecIR зберігає фільтр валідності з 16 (Q11): правило з K005 над fn, type чи event не діє ніде.
- `plannedKind(docs, id)` замінюється на `spec.planned`.

Семантичні виправлення rules.ts (06, 07, 14, 15, 16) і `specHash` (09) за Q2 уже злиті. Міграція їх зберігає, тож еталон 17, що вже містить ці виправлення, не змінюється. Нові семантичні зміни правил після цього тікета пишуться вже над SpecIR.

Непорожні кортежі з 18 дають дві видимі зміни в граничних випадках. Обидві — в бік «правило з K005 або без аргументів не оцінюється», як у Q11:
- `exports` без імен. Зараз маємо K005 парсера і водночас K104 від check. Перевірено на тимчасовій копії `tests/fixtures/repo`: `- module app.checkout` / `  - exports` дає обидві діагностики. Після зміни лишається тільки K005.
- `entry` без вкладених елементів. Зараз поруч з іншим `entry` він отримує власний `ok` «every module is reachable from `entry`» за спільним списком входів, а сам по собі не дає нічого (перевірено там само). Після зміни він не дає нічого в обох випадках.

Коди виходу в обох випадках ті самі.

**Blocked by:** 18, 06, 07, 14, 15, 16 <!-- 18 (SpecIR expand); 06 (no-cycles під модулем); 07 (область layers); 14 (однаково специфічні deny); 15 (layers і переможний deny); 16 (deny над fn) -->

**Status:** resolved

**Контракт:** семантика — лише два граничні випадки вище: зникає K104 на `exports` без імен і рядок `ok` на `entry` без елементів (додати в «Несумісні зміни» spec). Коди виходу, решта вердиктів і `specHash` ті самі.

- [ ] Еталон 17 (обидві фікстури) і всі `.expected` без змін. Тести layers/deny/entry/exports/no-cycles у tests/core.test.ts зелені.
- [ ] `check --format json` на репозиторії дає ті самі `(criterion, verdict, file, line, specHash)`, якщо не зважати на `snapshotId`: рефакторинг src змінює його (src/snapshot.ts:181).
- [x] CLI-тест на тимчасовому репо для обох граничних випадків:
  - `exports` без імен дає K005 без K104, код 1;
  - `entry` без вкладених елементів поруч з іншим `entry` не має власного результату, код 0.
- [ ] Тести 16 зелені: K102 wiring і LSP-completion на fn-цілі (`deny app infra.db.save`) правило з K005 не застосовують.
- [x] `src/rules.ts` не читає `node.refs` і не імпортує `sectionNodes`/`walk`.
- [ ] `npm run typecheck`, `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `src/spec-ir.ts`, `src/assess.ts`, `tests/core.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; evaluateRules/denyingRule/blocksDependency над SpecIR (src/rules.ts), rules.ts не читає node.refs і не імпортує sectionNodes/walk; граничні випадки — tests/core.test.ts:587 зелений. Не поставлено галочки там, де потрібен повний `npm test`/`npm run typecheck` або перегляд історичного diff — їх в аудиті не запускали.
