# 16: `allow`/`deny` над fn, type чи event (K005) не діють ніде

**Джерело:** research-pl §5 Р-1; знахідка 4; рішення Q11 і Q2 (spec). Баг знайдено під час перевірки кластера

**What to build:** Правило `deny app.checkout.checkout infra`, де `app.checkout.checkout` — fn, дає K005 і в rules не перевіряється (src/rules.ts:484-488). Але `denyingRule` (rules.ts:70-74) збирає правила з `kindOf = () => undefined`, тож фільтр K005 у `collectRules` не спрацьовує, і те саме правило діє в інших споживачах:
- **wiring** (src/wiring.ts:213) дає за ним K102. Відтворено на тимчасовому репо: `rules.md:10:8 K005 …` і водночас `w.md:4:3: K102 … denied by deny app.checkout.checkout infra`;
- **spec-to-code** (src/spec-to-code.ts:64) через нього відмовляє;
- **LSP-completion** (src/lsp-features.ts:569, 578) відкидає ним кандидатів, але лише коли fn стоїть на боці цілі. Completion передає як джерело модуль навколо курсора (`app.checkout`), а `within(app.checkout, app.checkout.checkout)` хибне, тож fn-джерело на completion не впливає. Тому completion перевіряється на fn-цілі: `deny app infra.db.save`.

Правило з K005 не діє ніде. `denyingRule`/`blocksDependency` застосовують той самий фільтр валідності, що `collectRules` в `evaluateRules`: отримують ту саму функцію виду (знімок, Index, `planned`, rules.ts:77) і пропускають `allow`/`deny`, аргумент якого є членом модуля (`MEMBER_KINDS`, rules.ts:444). Так само невалідне `allow` над fn не перебиває `deny` у wiring.

Виправлення робиться в поточному коді, до міграції rules.ts на SpecIR. Міграція 19 чекає на цей тікет і має зберегти поведінку.

format.md §7 (пункт `allow`/`deny`, format.md:262, і розділ «Wiring») каже, що правило з K005 не діє ні в `check`, ні у wiring, LSP-completion чи spec-to-code. `keylang explain K005` цьому не суперечить.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** семантика, несумісно. `allow`/`deny` з K005 перестають діяти:
- у wiring: зникає K102, і `keylang wire` більше не відмовляє через таке правило, бо блокують лише помилки на рядках `# wiring` (src/cli.ts:733-742);
- у LSP-completion: такий кандидат більше не відкидається;
- у spec-to-code: відмови немає.

Код виходу `check` не змінюється, бо K005 уже дає 1. Змінюється сигнатура `denyingRule`/`blocksDependency`, але вони не є публічним API (src/index.ts їх не експортує).

- [x] Відтворення вище (фабрика `wire app.checkout.checkout` із залежністю з `infra`): `check` дає K005 на рядку правила й жодної K102 на рядку wiring, код 1 (через K005). `keylang wire` не зупиняється на цьому правилі.
- [x] `allow` над fn теж не діє: з `deny app infra` і `allow app.checkout.checkout infra` є K005 на `allow`, а K102 з'являється і на імпорті в rules, і на залежності фабрики `app.checkout.checkout` у wiring.
- [x] LSP-completion на fn-цілі: коли єдине правило — `deny app infra.db.save` (K005), `- calls ` під модулем шару `app` пропонує `infra.db.save`. З `deny app infra.db` цей кандидат не пропонується (регресія tests/lsp.test.ts:402).
- [x] spec-to-code: `deny domain app.refund.refund`, де ціль — `planned fn` (K005), не дає відмови «`deny` forbids …». `deny domain app` відмовляє, як і раніше (tests/draft.test.ts:264).
- [x] Регресія: K005 для правил над fn (tests/core.test.ts:416) і K102 у wiring за валідним `deny domain infra` (tests/wiring.test.ts:285) без змін.
- [ ] format.md §7 (allow/deny і «Wiring») описує це значення. Якщо еталон `spec-forms` (17) уже злито, його очікувані файли змінились лише тут, diff переглянуто.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `src/wiring.ts`, `src/lsp-features.ts`, `src/spec-to-code.ts`, `tests/wiring.test.ts`, `tests/lsp.test.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78, 7e96cda; тести `tests/rules-area.test.ts` «a fn deny applies nowhere: check, wire, and a deeper module deny still does», «a type or a planned event on deny is K005 scope and applies nowhere», `tests/lsp.test.ts` «completion still offers a fn a member deny cannot scope», `tests/draft.test.ts` «a deny over a planned fn is K005 and does not refuse the stub». Не закрито дрібне: format.md §7 і розділ «Wiring» прямо не кажуть, що правило з K005 не діє у wiring, LSP-completion і spec-to-code (лише «нічого б не перевіряло»). Прогін `npm test` у межах аудиту не виконувався.
