# 09: `specHash` — одна ідентичність рядка правила для всіх його результатів

**Джерело:** research-pl §5 Р-4; знахідка 2; рішення Q8 (spec). Розбіжність semantics.md §7 з кодом, знайдена під час перевірки кластера й рецензії.

**What to build:** semantics.md §7 (docs/format.md:243) обіцяє: «Кожен вердикт має `specHash` — SHA-256 правила чи рядка потоку, як їх записано». Код поводиться інакше (перевірено 2026-09-29 на копіях фікстури `repo`):
- `no-cycles`: `ok` хешує `no-cycles *` чи `no-cycles app.a` (src/rules.ts:372), а `unverified` (:368) і K105 (:379) хешують просто `no-cycles` (`bd3cd156…`). Через це `no-cycles *` і `no-cycles` під `module app.checkout` з прогалиною отримують однаковий хеш.
- `entry`: `ok` хешує текст рядка `entry app.checkout` (:305), а `unverified` окремого модуля (:296) — `entry` (`923fe539…`). K103 (:299) не має вердикту-власника, тож отримує SHA-256 коду й повідомлення (src/check-results.ts:45).
- `exports`: `ok` хешує `exports <module>: <імена>` (:346), а `unverified` і K104 — `exports <module>` без імен (:310).
- K101 хешує `layers <from> <to>` (:221). Такого рядка ніхто не писав.
- Уточнений ID-вердикт `unverified` «opaque module …» хешує повідомлення (src/assess.ts:69). Тож хеш змінюється від знімка, а не від специфікації.
- Результат «no snapshot» хешує сталий рядок `"no snapshot"` (src/rules.ts:87, `86d0803a…`).

Правило (Q8):
- Усі результати рядка правила — `ok`, `unverified`, K102, K104 і K105 — мають один `specHash`: SHA-256 канонічного тексту рядка. Це той текст, який уже хешує його `ok`: `deny …`/`allow …`, `layers …`, `entry <цілі>`, `no-cycles <модуль|*>`, `exports <модуль>: <імена>`.
- Результат, виведений з кількох рядків, хешує їхні канонічні тексти в порядку (файл, рядок), через `\n`. З одним рядком це рівно хеш цього рядка. Таких результатів три:
  - K101 — усі рядки `layers` зв'язного часткового порядку, що містить шар-ціль ребра (для K101 ціль завжди впорядкована, src/rules.ts:389-395);
  - K103 і `unverified` окремого модуля для `entry` — усі рядки `entry`, бо досяжність рахується від їхнього об'єднання;
  - «no snapshot» — усі рядки правил специфікації.
- ID-вердикт хешує канонічний текст рядка, де стоїть посилання. Для рядка правила це той самий текст, що й в інших його результатів. Для рядка без власних результатів (wiring, `module` у rules) — вид і `renderMeaning` (src/parser.ts:836), як для рядка потоку (src/flows.ts:134). Для цього запис `unverified` з резолвера (src/resolve.ts:217) має нести свій рядок.
- Діагностики без вердикту (K001, K003, K201…) і далі хешують код і повідомлення, як описано у format.md:250.

Канонічні тексти будуються з ID посилань, тож запис посилання лінком хеша не змінює (Р4). `criterion` у JSON не змінюється, зокрема `layers <from> <to>` для K101. У `src/` `specHash` ніхто не читає: він лише потрапляє в JSON і SARIF (src/cli.ts:1185). Тож виправлення змінює значення поля, а не форму виводу.

18 (SpecIR expand) кладе в SpecIR канонічний текст, з якого рахується `specHash`, і заблокований цим тікетом. Якщо еталон 17 злито раніше, цей тікет оновлює в ньому значення `specHash`. Це очікувана зміна контракту, а не регресія.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** змінюються значення `specHash` у `check --format json` і SARIF `properties.specHash` для `no-cycles`, `entry`/K103, `exports`/K104, K101, уточнених ID-вердиктів і «no snapshot». Форма виводу та сама. Зміна несумісна для споживачів, що зберігали хеші, її записують у «Несумісні зміни» spec.

- [x] У `check --format json` усі результати одного рядка мають однаковий `specHash`. Це стосується `no-cycles` (`ok`, `unverified` після `exclude`, K105), `entry` (`ok`, `unverified` окремих модулів, K103) і `exports` (`ok`, K104, `unverified`). Рядки `no-cycles` і `no-cycles` під модулем мають різні хеші, зокрема коли в області прогалина.
- [x] K101 з одним рядком `layers a < b < c` має хеш цього рядка. Для `layers a < b` + `layers b < c` хеш дорівнює SHA-256 двох канонічних текстів через `\n`. Для незв'язних `a < b` + `c < d` хеш K101 у `c`/`d` не залежить від рядка `a < b`.
- [x] На рядку `deny` з посиланням на непрозорий модуль ID-вердикт «opaque module …» і вердикт `deny` мають однаковий `specHash`.
- [x] Тека без `keylang.json` з `keylang/rules.md` (`- no-cycles`): `check keylang` дає `unverified` «no snapshot», чий `specHash` не дорівнює SHA-256 `no snapshot` і змінюється, коли змінюється рядок правил.
- [x] Коли змінюється текст правила, хеш змінюється. Коли `app.a` записано як `[app.a](x.md)`, хеш той самий. `fmt` хешів не змінює.
- [ ] tests/flows.test.ts:774 і tests/cli.test.ts:1399 зелені. format.md:243 описує правило: один хеш рядка правила для всіх його результатів і хеш кількох рядків для K101, `entry`/K103 та «no snapshot».
- [ ] `npm run typecheck` і `npm test` зелені. `node bin/keylang.js map` виконано, diff переглянуто, зокрема карту з поясненнями (`explain.map` увімкнено). `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `src/assess.ts`, `src/resolve.ts`, `src/check-results.ts`, `docs/format.md`, `tests/core.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 (specHash — текст рядка правила), b93c892 (рядок layers/entry хешує власний текст; K101, K103 і unverified досяжності — усі рядки через `\n`); `src/rules.ts` (`hashText`, `canonicalRuleSpec`), `src/assess.ts:82`, `src/check-results.ts:48`; тести `tests/rules-area.test.ts` «specHash is the rule line…», «a layers or entry line hashes its own text…», «an opaque reference on a deny line shares that line's specHash»; format.md «Вердикти» описує правило. Прогін `npm test` у межах аудиту не виконувався.
