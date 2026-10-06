# keylang — рев'ю сесії 2026-09-28

Коміт: `7cce8c20816bd29fcac7be927af6b26200f360bb` (`7cce8c2`, M5–M7).
Охоплення: весь проєкт, архітектурні рішення й реалізація, а не diff окремої гілки.
Рівні: **P1** — хибний `ok`/`fail`, запис поза дозволеною ціллю, падіння на валідному вводі чи непрацездатний артефакт; **P2** — хибний результат окремого правила або розбіжність із контрактом; **P3** — якість, шум, документація.

Базові перевірки зелені, але не покривають знайдені випадки:

- `npm run typecheck` — 0 помилок;
- `npm test` — 223 тести, 222 passed, 0 failed, 1 skipped (whisper без моделі/аудіо);
- `node bin/keylang.js map --check` — 0;
- `node bin/keylang.js check --strict --format json` — `0 fail, 0 unverified, 63 ok`.

Tracked-файли не змінювалися. Усі відтворення виконано в ізольованих фікстурах під `/tmp/opencode`; шляхи до логів і JSON-доказів наведено в кінці. Windows, Node 22.18, справжній TTY/browser UI та реальний мікрофон вручну не перевірялися.

## Головне

1. **Соундність перевірки порушено в кількох незалежних місцях.** Звичайний Python/Rust-імпорт усередині функції, підмінений Python-декоратор, default import і неспецифічний `tsconfig paths` дають хибний `ok` навіть у `--strict`. Неповний trace і JUnit іншого знімка також підтверджуються як `ok`.
2. **`spec-to-code --apply` обходить усі межі пропозицій.** `..`, symlink і абсолютний шлях у `test` записують файли поза репозиторієм; паралельна правка користувача втрачається.
3. **npm-пакет не вміє Rust і Python.** `copy-wasm.mjs` пакує лише JS/TS-граматики, а runtime після цього шукає всі мови в `dist/wasm`.
4. **`keylang wire` може записати файл, який не завантажується:** default/static import, колізія санітизованих ID або `.js.js` під NodeNext.
5. **Свіжість даних не має єдиного знімка.** Паралельна зміна джерела, context cache, overlay і фізичний FS дають різні факти для одного аналізу; кандидат нового файла може стати `static ok` після запису без зміни `snapshotId`.

## P1

### 1. Локальні Python/Rust imports обходять `deny`

`docs/format.md:372–374,234` вимагає окремий імпорт для кожного імені та `fail` для підтвердженого забороненого ребра. `src/extract/python.ts:22–24` збирає імпорти лише на top level, а `src/extract/rust.ts:26–35` — лише з `root.namedChildren`.

`from src.infra.store import save` усередині Python-функції і `use crate::infra::save` усередині Rust-функції при `deny app infra` дають strict exit 0, `convergence: no edge` і жодного попередження про неповноту. Python реально виконує `save`, Rust-фікстура компілюється.

### 2. Python decorator, що замінює функцію, підтверджує недосяжне тіло

`docs/format.md:374,218,249`: декоратор поза списком тих, що зберігають функцію, — `unsupported`, а невизначеність не стає `ok`. `src/extract/python.ts:26–31,110–115` додає сире тіло й лише записує coverage; `src/flows.ts:354–359` повертає `ok` до врахування цієї дірки.

```python
def hit(): print("HIT")
def replacement(): print("REPLACEMENT")
def replace(fn): return replacement
@replace
def decorated(): hit()
def start(): decorated()
```

Реальний Python друкує лише `REPLACEMENT`, але strict `check` дає `static ok app.main.hit: reachable … via app.main.decorated`. Coverage одночасно містить `decorator replace may replace decorated`.

### 3. Default import сплутано з namespace import

`src/extract/ts.ts:481–484` представляє обидва одним `{kind:"module"}`; `src/graph.ts:478` спочатку шукає named export. Для `import API from "../lib/api.ts"; API.hit()` за наявності і `export function hit()`, і `export default class Actual { static hit() }` keylang підтверджує `lib.api.hit`. Node виконує лише `Actual.hit`. Правильна ціль — `lib.api.Actual.hit`.

### 4. `tsconfig.paths` обирається за порядком JSON

`src/imports.ts:200–207,371–374` бере перший успішний pattern. Якщо `@/*` стоїть перед `@/protected/*`, keylang резолвить `@/protected/store` у загальну ціль і дає `deny` хибний `ok`. `typescript.resolveModuleName` з тим самим конфігом обирає специфічнішу ціль. Обидва файли існують, тож це не fallback через відсутність.

### 5. Неповний trace дає `trace ok`

`docs/format.md:251` називає `complete:false`, `dropped>0` і відкриті spans причиною `unverified`. `src/trace-evidence.ts:233–256,159` після позитивного зіставлення повноту не перевіряє. Два `start` без жодного `end` і run `{complete:false, open:[...]}` проходять strict із `trace ok`.

Окремо `src/trace-evidence.ts:94–101` ігнорує `run.open`, а `:96` перетворює невалідний `dropped:"5"` на `0` замість exit 2, який вимагає `docs/format.md:282`.

### 6. JUnit-знімок першого suite застосовується до всіх suite

`docs/format.md:250,264` вимагає прив'язку кожного звіту через його `snapshotId`. `src/test-report.ts:72–77,86` бере перший `<property name="keylang.snapshotId">` у всьому тексті. Testcase другого suite зі старим snapshot отримує `tests ok`.

### 7. Python trace-адаптер приписує span найближчому наступному однойменному оголошенню

`adapters/python/keylang_trace.py:73–84` зіставляє `(realpath, co_name)` і обирає найменшу `line >= co_firstlineno`. Якщо план містить лише `B.save`, виконання `A.save()` може бути записане як `B.save` і отримати `trace ok`.

### 8. `spec-to-code --apply` пише поза репозиторієм і губить паралельні правки

`CONTEXT.md` і `codeProposalProblem()` забороняють `..`, зовнішні symlink-цілі й згенеровані файли. `src/cli.ts:371–379` викликає цю перевірку лише для proposals; гілка `--apply` у `src/cli.ts:381–385` одразу виконує `writeFileSync(join(root, file))`.

Відтворено два обходи:

- `test ../outside.test.ts` створює файл поза репозиторієм; звичайний proposal-режим коректно повертає exit 2;
- symlink `src/app/refund.ts → /outside` перезаписує зовнішню ціль, тоді як proposal-режим повідомляє `leads out of the repository through a link`.

`src/tui/app.ts:1982–2011` має суміжний дефект: `writeAtomic()` іде за symlink навіть тоді, коли його ціль ще не існує. `m`, `a`, `w` може створити файл поза репозиторієм.

Окремо `--apply` читає файл до LLM-запиту й записує раніше обчислений `after`. Користувацька зміна, зроблена під час запиту, зникає: `userEditLost:true`.

### 9. npm-пакет не запускає `map` для Python і Rust

`scripts/copy-wasm.mjs:12–14` копіює лише TypeScript/TSX/JavaScript. `src/extract/treesitter.ts:21–33` після появи TS-граматики обирає `dist/wasm` для всіх мов. Встановлений tarball на Python/Rust дає exit 2: `ENOENT …/dist/wasm/tree-sitter-{python,rust}.wasm`. Поточний тест tarball покриває лише TS.

### 10. `keylang wire` генерує код, який Node не завантажує

`src/wire-gen.ts:38–46` імпортує останній сегмент ID як named export. Тому default export і `export { make as alias }` стають `import { make as … }`, а static method — named import. Усі три варіанти дають exit 0 під час генерації й `SyntaxError` під час запуску.

`src/wire-gen.ts:120–122` замінює `-` на `_`, тож `foo-bar` і `foo_bar` отримують один локальний ідентифікатор: `Identifier has already been declared`.

`src/wire-gen.ts:150–156` для JS-файла під NodeNext додає `.js` до вже наявної `.js`, створюючи `factory.js.js`.

### 11. Порожня TS-функція після trace-інструментації не парситься

`src/extract/bodies.ts:33–35` для `export function main() {}` дає однакові offsets `start=end=24`. `src/adapters/trace-hooks.ts:84–87` вставляє обидва фрагменти в ту саму позицію, але сортування `b.at - a.at` не задає їхній відносний порядок. Результат:

```typescript
export function main() {});  return globalThis.__keylangTrace.run(...)
```

Node повертає `ERR_INVALID_TYPESCRIPT_SYNTAX`, exit 1. Той самий код без адаптера виконується; `{ }` і `{ return 1; }` інструментуються успішно. Подія `run` при цьому має `complete:false`, але помилково включає функцію в `instrumented`.

### 12. HTTP-запит без токена валить `keylang web`

`src/tui/web.ts:185,206` викликає `new URL(request.url)` без перехоплення помилки. `GET //[ HTTP/1.1` дає `ERR_INVALID_URL` і завершує процес із exit 1. Це валідний для сокета, але невалідний для `URL` ввід; одна сесія не повинна зупиняти сервер.

### 13. Кандидат `spec-to-code` приховує K102 і хибно резолвить новий файл

`src/spec-to-code.ts:78–79` залишає лише verdicts з `area === id` і diagnostics рядків, які прямо посилаються на ID. Новий файл може порушувати `deny`, але CLI показує лише `ID ok` і K202. Повний аналіз того самого кандидата містить K102.

`src/imports.ts:241–246` перевіряє імпорт через фізичний FS. До запису той самий текст дає `static unverified`; після `--apply` — `static ok` із незмінним `snapshotId`.

### 14. Паралельна зміна джерела дає застарілий аналіз

`analyze()` читає джерела без єдиного snapshot моменту. Відтворення: аналіз почався до додавання забороненого імпорту, завершився після нього й повернув `deny ok`; повторний аналіз того самого дерева дав K102 та інший `snapshotId`.

## P2

### Аналіз і правила

1. **Callbacks Python/Rust стають хибною absence.** `valueRefs` у `src/extract/python.ts:19,64–65` і `src/extract/rust.ts:24` завжди порожні. `later(hit)` з подальшим викликом callback отримує `static fail: absence`, хоча `docs/format.md:253` вимагає `unverified`.
2. **Constructor не входить до closure fingerprint.** `src/flows.ts:256–263` спеціально переводить `new C()` на `C.constructor`, але `src/snapshot.ts:345–348` для fingerprint відкидає target kind `module`. Зміна конструктора не робить пояснення `start()` stale.
3. **`export default 123` зникає.** `src/extract/ts.ts:216–232` додає default-рядок лише для identifier/function/class, тому правило отримує K104 absence.
4. **Циклічний `export *` втрачає імена.** `src/snapshot.ts:392–411` кешує неповний результат до fixed point. Для циклу A→B→C→A модуль C втрачає `b`, хоча Node експортує `a,b,c`.
5. **Експорти дочірнього файла приписуються батьківському модулю.** `src/rules.ts:237` порівнює `module.startsWith(rule.module + ".")`. `pkg/private.ts` стає експортом `pkg/index.ts`, навіть коли index його не реекспортує.
6. **`export *` із excluded-файла дає absence.** `src/graph.ts:326` і `src/snapshot.ts:399–406` трактують відсутність рядків як відому порожнечу, хоча `docs/format.md:236` вимагає `unverified`.
7. **Частково розібраний opaque-модуль дає K001.** `src/resolve.ts:35,99–105,135` бачить відомий член і припиняє вважати модуль opaque. Невідомий член отримує K001 поруч із суперечливим `ID unverified`.
8. **Shadowed `require` створює залежність.** `src/extract/ts.ts:509–518` розпізнає текст `require` без перевірки binding. Параметр функції `require` дає хибний K102.
9. **Дедуп викликів за target відкидає прямий виклик.** `src/graph.ts:518–524` залишає перший call. У `const deferred = () => hit(); hit()` прямий виклик зникає, і strict повідомляє `reached only through a closure`.
10. **`planned event` збігається з будь-яким kind.** `src/flows.ts:524` виключає event із порівняння виду, тому наявна function дає K202 замість K201.
11. **Один trace run розпадається за ім'ям файла.** `src/trace-evidence.ts:68` додає filename до ключа `(runId, testId)`. Той самий валідний набір подій у двох JSONL дає `trace fail`, хоча `docs/format.md:270` ідентифікує запуск без filename.
12. **JSON/SARIF втрачає `specHash`.** `src/check-results.ts:28–41` не переносить його з diagnostic-owned verdict. K102 має `specHash` у verdict, але не в `results[]`, усупереч `docs/format.md:225`.
13. **LSP `rootUri` із кінцевим `/` вимикає аналіз.** `src/lsp.ts:228–229,278–281` будує префікс `${root}/`, після чого відносні шляхи лишаються абсолютними. Два наявні K001 стають порожнім списком діагностик.
14. **MERGE повертає rejected hunk як pending.** У `src/tui/app.ts:1753–1754,1793–1794` пропозиція споживається лише коли `pending === 0`. Послідовність accepted/rejected/pending не зберігає rejected-рішення при повторному відкритті.

### LLM, codegen і wiring

1. **Hybrid reconciliation ламає граматику.** `src/draft-llm.ts:90–96` додає пропущений крок із фіксованим відступом 2 під останній рядок. Крок після `invariant` дає K004.
2. **Hybrid ставить `agree` неправильній вкладеності.** `src/draft-llm.ts:79–88` порівнює лише ID, ігноруючи батька. Модель може вкласти `right` під `left`; усі рядки отримують `agree`, але `check` дає `static fail`.
3. **Повторний `--apply` додає дубль.** `specToCode()` не бачить вже створену заготовку як реалізацію запланованого контракту й дописує другу `export function`. `tsc` повідомляє TS2323/TS2393; keylang завершується з 0.
4. **Однакові назви методів зливаються в один flow.** `A.save` і `B.save` друкуються як два `# flow save`; proposal зберігає лише останній, `B.save`.
5. **Python stub губить return annotation.** `src/spec-to-code.ts:197–199` залишає лише імена параметрів і не переносить результат. Заготовка сама отримує K201.
6. **K003 не блокує `wire`.** `src/cli.ts:520–531` має вузький allowlist блокувальних кодів. Специфікація з невалідним відступом усе одно генерує файл й повертає 0.
7. **Context cache не бачить текст інших specs.** `src/agent-context.ts:66–71` хешує лише їхні шляхи, а `sectionText()` у `:116–122` читає диск замість overlay. Змінений invariant лишається старим; unsaved overlay узагалі не потрапляє в prompt.
8. **Module explanation ніколи не стає stale.** `src/explain-llm.ts:54–58` використовує `closure.fingerprint`, якого модуль не має, тож baseline завжди `""`.
9. **Ghost перевіряє рядок поза контекстом.** `src/ghost.ts:44–49` парсить `- step …` як top-level item. Прийняття під `invariant` створює K004, хоча підказка була показана.
10. **`code-to-spec --since` губить C-quoted Unicode paths.** `src/cli.ts:830` і далі читає `git diff`, де `src/app/модуль.ts` закодовано escape-послідовностями. Змінена функція не потрапляє в proposal.
11. **Порожня відповідь моделі зберігається як fresh.** `src/cli.ts:295–297` і `src/llm.ts:68–71,88–102` не відрізняють порожній або нетекстовий `content` від пояснення. Наступний запит читає порожній кеш без звернення до моделі.

### Trace-адаптери

1. **Rust async: незалежна future стає дочірньою.** `adapters/rust/keylang_trace.rs:58–79` тримає стек у thread-local. Призупинена future лишається батьком іншої future, опитаної в тому самому потоці. Завершений trace підтверджує вкладення, якого у flow немає.
2. **Python coroutine потрапляє в `instrumented` до виклику.** `adapters/python/keylang_trace.py:81–83,116–118` впізнає coroutine лише на `PY_START`, але додає символ до `instrumented` під час планування. Невикликана `async def` дає `trace fail` замість `unverified`.
3. **Зіпсований fact cache валить процес.** `src/fact-cache.ts` повторно використовує JSON без перевірки форми. `decls[0].calls=[null]` дає exit 2: `Cannot read properties of null (reading 'callee')`, замість rebuild.

## P3

1. `--print` усе одно записує `.keylang/stats.json`: `src/cli.ts:328,436,501` викликає `updateStats()` до перевірки `--print`.
2. `wire --out` не має єдиної політики шляху: `../x.ts` виходить за корінь, абсолютний шлях трактується як відносна тека, відсутня тека дає ENOENT без створення.
3. Cleanup-помилка маскує первинну init-помилку: `src/wire-gen.ts:65–75,93–96` замінює її на `AggregateError("dispose failed")`.
4. Помилка OpenRouter SSE без префікса `openrouter:` (`src/llm.ts:94`); потік не має abort/timeout, на відміну від Anthropic SDK.
5. `draft rules` може дописати правила під хвостовий `# flow` (`src/cli.ts:514`).
6. `src/tui/app.ts` поєднує редактор, MERGE, голос, ghost і context у сесії на 2014 рядків. Кілька async-завершень захоплюють позицію, але пишуть у буфер на момент завершення.
7. Документація розійшлася з кодом: `docs/format.md:353` каже про схему 4, `:378` і код — про схему 5; ADR 0001/0002 називають 3 runtime-пакети, зараз їх більше; ADR 0003 досі «запропоновано», хоча M6 реалізовано; README не описує M5–M7.

## Архітектурні спостереження

Сильні межі варто зберегти: спільний `analyze()`/`assess()` для CLI, LSP, MCP і TUI; незалежність ядра правил від tree-sitter; worker для важкого аналізу; явне відокремлення proposals від запису.

Основні структурні причини знахідок:

1. **Немає інваріанту «виклик або імпорт — ребро чи явна дірка».** Невідома форма просто зникає, після чого `closure.complete` і `static fail/ok` будуються на неповних фактах.
2. **Один snapshot не є єдиним джерелом для всіх читань.** Overlay, context cache, import resolver і `--apply` повторно звертаються до диска в різні моменти.
3. **Ідентичність експорту втрачено у facts.** Default, namespace, alias і static method зводяться до останнього сегмента імені; це ламає і graph, і codegen.
4. **Coverage не послаблює вже побудований позитивний шлях.** Unsupported decorator, opaque export і відкритий span існують поруч із `ok`.
5. **Запис має кілька протоколів.** TUI використовує tmp+rename і перевірку symlink, CLI — прямий `writeFileSync`; `--apply` ще й обходить спільний validator proposals.
6. **LLM-чернетки звіряються регексом, а не parser/IR.** Звідси хибний `agree`, зламана вкладеність і ghost поза граматичним контекстом.
7. **Санітизація ID запізніла.** Колізії `foo-bar`/`foo_bar`, зарезервовані назви шарів і злиття модулів лікуються після побудови графа, а не відхиляються на вході.
8. **JUnit читається регексом.** Область snapshot має бути властивістю конкретного suite/testcase, а не першим збігом у тексті.

## Що не підтверджено як баг

- Порядок `draftFlow` для `z(); a()` правильний.
- Unicode definition у перевіреному TS-випадку збігається з очікуваною позицією.
- CommonJS `--import trace` не змінив strict-поведінку: `.cjs` узагалі не потрапив до `instrumented`.
- Задокументовані обмеження не трактувалися як дефекти: відсутність type-ребер Rust/Python, baseline/`check --stale`, assertions і parallels у trace, нерозгортання Rust-макросів, opaque зовнішні модулі.

## Рекомендований порядок виправлення

1. Закрити обходи запису: спільний path/symlink validator для proposals, TUI і `--apply`; атомарний запис; відмова від повторного застосування вже створеної заготовки.
2. Відновити соундність `deny`/`static`: локальні imports, decorator coverage, default/namespace identity, специфічність `paths`, callbacks і export table.
3. Виправити evidence: повнота trace, JUnit snapshot scope, split JSONL, валідація `dropped`/`open`, Rust async stack і Python coroutine instrumentation.
4. Узгодити snapshot: один момент читання джерел, overlay для imports/context, rebuild невалідного fact cache, `specHash` у JSON.
5. Виправити пакування: один список граматик для runtime і `copy-wasm.mjs`, tarball-тест для кожної підтримуваної мови.
6. Перевести hybrid/ghost reconciliation з рядкових регексів на parser і IR.

## Межі перевірки

Не перевірялися Windows-шляхи, мінімальний Node 22.18, справжній інтерактивний термінал, браузерний мікрофон і реальна модель whisper. Повний `npm test` не замінює наведені ізольовані відтворення: наявні фікстури переважно покривають щасливі шляхи.

## Докази

- `/tmp/opencode/keylang-spec-review-notes.md`
- `/tmp/opencode/keylang-spec-initial-evidence.json`
- `/tmp/opencode/keylang-spec-followup-evidence.json`
- `/tmp/opencode/keylang-spec-followup-attempt1.json`
- `/tmp/opencode/keylang-review-empty-trace-evidence.json`
- `/tmp/opencode/keylang-review-main.log`
- `/tmp/opencode/keylang-review-context.log`
- `/tmp/opencode/keylang-review-cli-async.log`
- `/tmp/opencode/keylang-review-trace-extra.log`
- `/tmp/opencode/keylang-review-boundaries.log`
- `/tmp/opencode/keylang-review-tests.log`
- `/tmp/opencode/keylang-review-check.log`

Скрипти відтворення залишено поруч із цими логами. Вони створюють тимчасові фікстури й не змінюють репозиторій.
