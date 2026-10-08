# Граматика keylang

Частина специфікації формату keylang v0.2 (покажчик — [format.md](format.md)): модель файлу, секції, відступи, елемент списку, ключові слова за позицією, канонічна форма `fmt`, IR і повна граматика (Додаток А). ID, резолвінг, діагностики й семантику правил, потоків і доказів описано в [semantics.md](semantics.md), семантичний знімок коду — у [snapshot.md](snapshot.md). Розділи пронумеровано наскрізно для всіх трьох файлів, тож посилання «§N» лишаються чинними.

## 1. Модель файлу

Файл — послідовність рядків (`\n` або `\r\n`). Кожен рядок належить до одного з класів, які перевіряються в такому порядку:

| Клас | Умова | Що стає в IR |
|---|---|---|
| рядок у code fence | між відкривною і закривною огорожею | `Item::Code` (рядки дослівно) |
| рядок у HTML-блоці типів 1–5 | від рядка початку до кінцевого маркера (нижче) | проза або опис відкритого елемента, дослівно |
| порожній | лише пробіли | закриває абзац прози; список **не** закриває |
| маркер генерації | перший непорожній рядок файлу, починається з `<!--` і містить `keylang:generated` | `Document.generated` |
| заголовок секції | відступ 0, `#` і далі пробіл, таб або кінець рядка | нова `Section` |
| огорожа коду | `` ``` `` або `~~~` за **Р15** | відкриває `Item::Code`, закриває список |
| елемент списку | після відступу `-`, `*` або `+`, далі пробіл або кінець рядка | `Node` |
| опис | інший текст, відступ ≥ 2, і є відкритий елемент списку | `Node.description` |
| проза | усе інше | `Item::Prose`, закриває список |

**Р15. Огорожа закривається за CommonMark.** Відкривна огорожа — щонайменше три однакові символи `` ` `` або `~`. Закривна — той самий символ, довжина не менша за відкривну, після неї лише пробіли або таби. Її відступ не більший за 3 колонки і не більший за відступ відкривної; огорожа, відкрита під списком із більшим відступом (Р9), закривається й на своєму відступі. Info-рядок огорожі з бектиків, у якому є бектик, робить рядок не огорожею: він класифікується далі як звичайний текст. В info огорожі `~~~` бектики дозволені. Рядок огорожі з відступом ≥ 4 без відкритого списку — проза (у CommonMark це відступний блок коду). Незакрита огорожа триває до кінця файла.

Бектик в info не відкриває огорожу, тож рядок під ним лишається елементом списку. `fmt` розділяє цю прозу й список порожнім рядком:

````keylang Р15 path=keylang/map.md
```js has ` tick
- layer domain
```
````

````fmt
```js has ` tick

- layer domain

```
````

```diagnostics
```

Заголовки `##` і глибші, таблиці, цитати, нумеровані списки — це проза: вони не мають семантики, але зберігаються й форматуються дослівно.

**Р1. Власний рядковий парсер замість pulldown-cmark/comrak.** keylang використовує вузьку підмножину Markdown. CommonMark-парсери дають вузли з діапазонами байтів, але для LSP нам потрібні позиції кожного *слова* всередині елемента (ключове слово, ім'я, кожне ID у `calls a, b`), а також власні правила для лінивих продовжень, табів і відступів — їх однаково довелося б дописувати поверх AST. Рядковий парсер (`src/parser.ts`) дає точні `offset/line/col` для кожного токена і власні діагностики (K003) замість мовчазної «перебудови» дерева, як це робить CommonMark. Ціна — ми не розуміємо вкладених у елементи списку code fence (див. Р9).

Друге ID у `calls a, b` має власну колонку. Тут `b` — колонка 18:

```keylang Р1 path=keylang/map.md
- layer app
  - module checkout
    - fn buy
      - calls a, b
```

```diagnostics
keylang/map.md:4:15: K001 dangling reference `a`; declare `planned` if this is an intention
keylang/map.md:4:18: K001 dangling reference `b`; declare `planned` if this is an intention
```

**Розбіжність з CommonMark.** Порівнюються марковані елементи (рядок, глибина, рядок батька) і власник кожного непорожнього рядка тексту; нумеровані списки й цитати — проза, не елементи. Еталон — CommonMark без розширень GFM. Після `fmt` розбіжностей немає. До `fmt` лишаються три класи, і форматування їх прибирає: ліниве продовження (Р5) — рядок з відступом 0 одразу під елементом; HTML-блок типу 6, зокрема `<details>`, який тягнеться до порожнього рядка, що вставляє `fmt`; огорожа з відступом під елементом (Р9) — `fmt` знімає відступ огорожі й вмісту. Огорожа (Р15) і багаторядкові HTML-блоки типів 1–5 збігаються з CommonMark і до форматування.

**Заголовок за CommonMark.** Після `#` може стояти таб: `#\tflow c` — заголовок `# flow c`. Закривна послідовність `#`, перед якою пробіл чи таб і після якої лише пробіли чи таби, до слів заголовка не входить: `# flow a #` — потік `a`, `# flow g <!-- c --> ##` — потік `g` з коментарем, `# #` — заголовок без виду (K006). `#`, що торкається слова (`# flow a#`), — частина слова, тут K005 на імені. `fmt` закривних `#` не пише, а після `#` ставить пробіл. Це вирівнювання редакції 1 з CommonMark, а не нова редакція: до заморожування v1 редакція 1 ще змінна (так само, як у [ADR 0013](adr/0013-baseline-lower-rule-layer.md), «Наслідки»). Значення змінилось лише в таких рядках: `#\tflow c` раніше був прозою (у файлі без заголовків — шаром на мапі), а `# flow a #` давав K005 «unexpected words in heading».

## 2. Секції та види файлів

Граматика заголовка — у [Додатку А](#додаток-а-граматика).

| Заголовок | Вид секції | Типовий файл |
|---|---|---|
| `# map` | map | `keylang/map/*.md` (генерується) |
| `# rules` | rules | `keylang/rules.md` |
| `# flow <name>` | flow, `name` обов'язковий | `keylang/flows/*.md` |
| `# wiring` | wiring | `keylang/wiring.md` |
| `# migration <name>` | migration, `name` обов'язковий | `keylang/migration.md` (рядки дописує `flow import`) |

- **Р2. Вид визначає заголовок, а не шлях файлу.** Тому `rules.md` може лежати будь-де, а файл без жодного заголовка (як на слайдах) — це секція **map**.
- **Р3. В одному файлі може бути кілька секцій**: кожен `# …` починає нову (наприклад, кілька `# flow` в одному файлі). Вміст до першого заголовка — неявна секція map.
- Невідомий заголовок першого рівня (`# Shop`) — попередження **K006**, секція вважається map. Заголовок без виду (`#`, `# <!-- … -->`) — теж K006: «section heading without a kind».
- Зайві слова в заголовку — K005 (закривні `#` — не слова, §1); `# flow` чи `# migration` без імені — K005. Ім'я мають лише `flow` і `migration` (таблиця відповідності ID між стеками, business-flows/26–27; як `check` судить її рядки — нижче, «Рядки migration»): слово після `# rules`, `# map` чи `# wiring` (`# rules foo`) — K005, а не ім'я секції.
- Імена потоків — окремий простір імен: `# flow checkout` не конфліктує з ID карти, але два потоки з однаковим ім'ям — K002.

**Р2.** Файл у `keylang/flows/` із заголовком `# rules` — це правила, тож `layer` там невідомий. Файл без жодного заголовка — карта: голе ім'я є шаром.

```keylang Р2 path=keylang/flows/spec.md
# rules

- layer domain
```

```keylang path=keylang/slides.md
- domain
```

```diagnostics
keylang/flows/spec.md:3:3: K004 unknown keyword `layer` here; expected one of: layers, allow, deny, entry, module, no-cycles; `layer` goes at the top of a map
```

**Р3.** Дві секції `# flow` в одному файлі — два потоки. Однакове ім'я — K002 на другому, з позицією першого.

```keylang Р3 path=keylang/flows/shop.md
# flow checkout
- step app.checkout.buy
# flow checkout
- step app.checkout.pay
```

```keylang path=keylang/map.md
- layer app
  - module checkout
    - fn buy
    - fn pay
```

```diagnostics
keylang/flows/shop.md:3:8: K002 duplicate flow `checkout` (first declared at keylang/flows/shop.md:1:8)
```

### Маркер генерації

```
<!-- keylang:generated — не редагувати, `keylang map` -->
```

Має бути першим непорожнім рядком. Текст після `keylang:generated` довільний. Парсер записує маркер в IR (`generated`), форматер зберігає його.

`keylang map` перевіряє **усі цільові файли** в `<dir>/map/` до будь-якого запису чи видалення. Файла ще немає — його буде створено. Перший непорожній рядок містить маркер — файл можна перезаписати. Інакше це конфлікт: повідомлення `manual file without keylang:generated marker` зі шляхом, код виходу 1, жоден файл карти й індекс не записуються і не видаляються. Зайвий файл видаляється лише тоді, коли він сам має маркер; тека чи битий symlink з ім'ям `*.md` не файл генератора: `map` і `map --check` їх не читають і не видаляють. Файл, що на регістронезалежній ФС (macOS, Windows) є тим самим файлом, що й цільовий (шар перейменовано лише регістром: `Domain.md` → `domain.md`), не застарілий, а записаний з іншим регістром: `map` спершу видаляє старе ім'я, потім пише ціль, а `map --check` називає старе ім'я `stale`. `map --check` повідомляє той самий конфлікт окремо від застарілої карти (`stale`) і теж нічого не пише.

Коментар `<!-- keylang:llm … -->` (позначка, що фрагмент написав LLM) зарезервовано: парсер не надає йому семантики — як і будь-який інший HTML-коментар, він стає прозою, описом або коментарем елемента.

## 3. Відступи та ієрархія

- Глибина елемента = відступ / 2. Відступ — лише пробіли.
- Дочірній елемент може бути глибшим за батьківський рівно на один рівень.

| Помилка | Код | Відновлення |
|---|---|---|
| непарний відступ (`   - x`) | K003 | глибина = відступ / 2 з округленням вниз |
| стрибок більш ніж на рівень | K003 | елемент стає дитиною попереднього |
| таб у відступі елемента чи опису | K003 | таб рахується як 2 пробіли |
| порожній елемент (`- `) | K003 | рядок пропускається |

Таб у відступі прози чи блоку коду — текст, а не структура: K003 немає, `fmt` лишає рядок як є. Рядок із табом після відкритого списку — опис (відступ ≥ 2), тож там таб — K003.

Вердикти `check` (потоки й правила) рахуються на відновленому дереві, але структуру, якої у файлі немає, вони не підтверджують: на рядку елемента з K003 і в усьому його піддереві `ok` стає `unverified` з причиною `structure recovered after K003 at L:C; on that structure: <доказ>`, де `L:C` — позиція найближчого такого K003. `fail` лишається `fail`, `unverified` — `unverified`. Сусіди й предки рядка з K003 не змінюються.

**Р4. `keylang fmt` відмовляється форматувати файл з K003**: інакше форматер мовчки змінив би вкладеність. Семантичні помилки (K001, K002, K004, K005) форматуванню не заважають.

```keylang Р4 path=keylang/map.md
   - module b
```

```fmt
keylang/map.md:1:4: K003 indentation must be a multiple of 2 spaces, found 3
keylang/map.md:1:4: K003 item indented too deep: 3 spaces, at most 0 expected here
```

```diagnostics
keylang/map.md:1:4: K003 indentation must be a multiple of 2 spaces, found 3
keylang/map.md:1:4: K003 item indented too deep: 3 spaces, at most 0 expected here
keylang/map.md:1:13: K001 dangling reference `b`; declare `planned` if this is an intention
```

### Опис вузла

Текстовий рядок (не елемент списку) з відступом ≥ 2 стає описом найглибшого відкритого елемента, у якого колонка вмісту (`2·глибина + 2`) ≤ відступу рядка. Порожні рядки між елементом і описом дозволені.

Шари оголошені поруч, тож у прикладі немає K001: опис лишається описом.

```keylang path=keylang/rules.md
- deny domain infrastructure
  Домен чистий: жодного I/O.
```

```keylang path=keylang/map.md
- layer domain
- layer infrastructure
```

```diagnostics
```

- **Р5. Рядок з відступом 0 завжди проза і закриває список**, навіть без порожнього рядка перед ним. CommonMark у цьому разі вважає рядок «лінивим продовженням» останнього елемента; keylang — ні, а `fmt` вставляє порожній рядок, тому GitHub показує те саме, що бачить keylang.
- **Р6. Опис завжди належить вузлу, а не місцю.** Опис, записаний після дітей вузла, `fmt` переносить одразу під рядок вузла.

```keylang Р5 path=keylang/map.md
- layer domain
prose
```

```fmt
- layer domain

prose
```

```diagnostics
```

```keylang Р6 path=keylang/map.md
- layer domain
  - module order
  Опис шару.
```

```fmt
- layer domain
  Опис шару.
  - module order
```

```diagnostics
```
- Багаторядковий HTML-блок типів 1–5 — проза або опис, не структура. Маркери початку: `<!--`, `<?`, `<!` і далі ASCII-літера, `<![CDATA[`, а також `<pre`, `<script`, `<style`, `<textarea>` (без урахування регістру, далі пробіл, `>` або кінець рядка). Кінець: `-->`, `?>`, `>`, `]]>`, або рядок, що містить `</pre>`, `</script>`, `</style>` чи `</textarea>` (без урахування регістру; тег кінця не мусить збігатися з тегом початку, і перед `>` немає пробілу). Рядок початку має відступ 0–3 поза елементом, або під відкритим елементом відступ ≥ 2 і не далі ніж на 3 колонки за колонкою вмісту: тоді рядки блоку — описи цього елемента. Рядок усередині не стає ні заголовком, ні огорожею, ні елементом; порожні рядки входять у блок. Блок під елементом закінчується й тоді, коли елемент закінчується: на першому непорожньому рядку з відступом, меншим за колонку вмісту. Незакритий блок верхнього рівня триває до кінця файла. Однорядковий коментар (початок і кінець в одному рядку) блоку не відкриває — це звичайний текст.

```markdown
# rules

<!--
- deny a b
-->
```

Цей `deny` не перевіряється: для GitHub рядок схований у коментарі, і парсер теж бачить його як прозу.

## 4. Елемент списку

Граматика елемента — у [Додатку А](#додаток-а-граматика).

- Кома — окремий токен, тому `a,b` і `a , b` означають те саме, що `a, b` (канонічна форма).
- Незакрита лапка — K005, токен читається як слово. `[`, що не відкриває посилання, — звичайне слово (сигнатури на кшталт `(errs: [Span, string][])`); K005 «malformed link» буває лише там, де очікується ім'я-посилання (`fn [name](path#Lnn)`) або посилання на ID (`calls [a.b](x.md)`, див. «Посилання як лінк»).
- `<!-- … -->` у кінці рядка — коментар до елемента (`Node.comment`), у семантиці не бере участі (приклад — `compose` у design.md §5).

### Ідентифікатори

Граматика сегмента й ID — у [Додатку А](#додаток-а-граматика).

Літери — будь-які Unicode, а знак — комбінований знак (`\p{M}`), тож розкладене `café` (NFD, `e` + U+0301) — теж сегмент. Дефіс дозволено (`http-retry`, `order-store`), `$` — теж, щоб JS-імена `$save` і `_save` лишались різними ID.

**ID — у формі NFC.** Парсер нормалізує до Unicode NFC кожне оголошене ID (`Node.id` і ім'я, з якого воно складене, ID `planned`, ім'я потоку) і кожну ціль посилання (`Ref.target`). Тож розкладене `café` (NFD) і складене (U+00E9) — одне ID: два такі оголошення — K002, а посилання в одній формі резолвиться в оголошення в іншій. Токени, spans і `Ref.text` лишаються як написано, тож `fmt` файла не змінює. Ім'я файла чи теки, з якого складається сегмент ID, нормалізується так само (на macOS імена тек часто в NFD).

Сегмент шляху файла чи теки стає сегментом ID так. Ім’я, яке вже є сегментом (`_shop_`, `my-dir`, `$save`), лишається як є. Якщо в імені немає дужок `(` `)` `[` `]`, усе інше, крім літер, знаків, цифр, `_`, `$` і `-`, стає `_`, а ім’я, що не починається з літери, `_` чи `$`, отримує `_` спереду: `cats.controller` → `cats_controller`, `1st` → `_1st`, `my file` → `my_file`. Якщо ім’я не є сегментом і містить такі дужки, кодування оборотне. Ціла форма маршруту Next стає читабельним префіксом: `(x)` — `$g-x` (група), `[x]` — `$p-x` (параметр), `[...x]` — `$all-x`, `[[...x]]` — `$opt-x`, де `x` — лише літери, знаки, цифри, `_` і `-`. Тож `(shop)` — `$g-shop`, `[shop]` — `$p-shop`, `(id)` — `$g-id`, `[id]` — `$p-id`, `[...slug]` — `$all-slug`, `[[...slug]]` — `$opt-slug`. Будь-яке інше ім’я з дужками (`(my shop)`, `(.)photo`) кодується побайтно: кожен байт UTF-8, який не є літерою, знаком, цифрою, `_` чи `-`, і також перший символ, який не може починати сегмент, записується як `$` і дві малі шістнадцяткові цифри. Сам `$` так само (`$24`), щоб його було видно як escape. `(` — `$28`, `)` — `$29`, `[` — `$5b`, `]` — `$5d`, `.` — `$2e`, пробіл — `$20`: `(my shop)` — `$28my$20shop$29`. Префікси `$g-`, `$p-`, `$opt-`, `$all-` не є таким escape, тож декодування однозначне. Ці сегменти різні й усі валідні; каталог `_shop_` лишається `_shop_`. Ім’я, яке вже дорівнює такому запису (тека `$g-shop`), є валідним сегментом і не перекодовується, тож ділить ID з `(shop)`. `$` у такому ID в shell беріть в одинарні лапки: `'main.app.$g-shop.page'`. Колишній запис `(shop)` як `_shop_` більше не називає цей модуль: посилання на старий ID — K001. Вкладеність тек layout і page ребра не додає.

### Прив'язка до коду

`[name](path#Lnn)` на місці імені оголошення: `name` стає іменем вузла, `path` і `nn` зберігаються в `Node.link` (підтримується і `#L12-L20`, береться початковий рядок). У M0 існування файлу не перевіряється. Спан імені вказує на текст усередині `[…]`.

Згенероване посилання рахується **від файла карти**, не від кореня репозиторію: для `keylang/map/domain.md` джерело `src/domain/order.ts` дає `../../src/domain/order.ts#L1`. Кожен сегмент шляху, крім `.` і `..`, кодується через `encodeURIComponent`, а `(` і `)` додатково стають `%28` і `%29`: `encodeURIComponent` їх залишає, але вони обривають Markdown-посилання. Приклад: `src/app/(shop)/page.ts` → `../../src/app/%28shop%29/page.ts#L1`. Пробіл і `#` кодуються як `%20` і `%23`. Парсер декодує шлях: `link.path` і `link.target` містять уже розкодований текст (`(shop)`, а не `%28shop%29`). Індекс зберігає POSIX-шлях від кореня репозиторію без кодування. Зіпсований escape лишається як написано.

Alias залежності не збігається з контекстним ключовим словом цієї позиції (`module`, `fn`, `type`, `event`, `calls`). Генератор додає числовий суфікс (`type` → `type2`), інакше рядок `- type main.type` читається як оголошення типу.

### Посилання як лінк

Будь-яке посилання на ID можна записати Markdown-лінком `[id](href)`, щоб воно було клікабельним на GitHub і в редакторі. Це стосується `calls`, `reads`, цілі залежності `<alias> <id>`, `trigger`, `step`, `then <id>`, `layers`, `allow`/`deny`, дітей `entry`, `module <id>` у rules, `wire`, `compose` і `when … → <id>`:

Батьківські рядки й оголошення доповнюють фрагмент, тож лінк резолвиться і діагностик немає:

```keylang path=keylang/map/check.md
- layer check
  - module resolve
    - fn check
  - module rules
    - fn evaluate
- layer docs
  - module assess
    - fn [assess](../../src/assess.ts#L29) (docs: Document[]) → Assessment
      - calls check.resolve.check, [check.rules.evaluate](check.md#check.rules.evaluate)
```

```diagnostics
```

У правилах так само: `- deny [domain](map/domain.md) infrastructure`.

- Резолвер бере ID з тексту лінка. `href` зберігається в `Ref.link` (розкодований, як `Node.link` оголошення) і не перевіряється.
- Спан посилання — ID усередині `[…]`: туди вказують K001, hover, definition і references.
- `fmt` зберігає форму: лінк лишається лінком, голе ID — голим. Вердикт від форми не залежить: `specHash` рахується з ID, тож `step [a.b](x.md)` і `step a.b` дають той самий результат.
- K005: порожній текст (`[](x)`), текст, що не є ID (`[не id](x)`), незакритий лінк (`[a.b](x`) чи пробіл у `href`.
- `href` може містити дужки парами, як у CommonMark: `[a.b](https://e.com/wiki/Foo_(bar))` — лінк до останньої `)`, а дужка з `\` (`\(`) пари не потребує. Непарна дужка (`[a.b](a(b)`) — K005 «malformed link».

## 5. Ключові слова за позицією

Значення елемента залежить від **батька** (або виду секції на верхньому рівні). Перше слово є ключовим, тільки якщо воно дозволене в цій позиції; інакше спрацьовує правило «без ключового слова», а якщо його немає — K004 зі списком очікуваних слів. Коли перше слово — ключове слово іншої позиції, K004 і K005 цього рядка (код і `reason` ті самі) кажуть, де воно стоїть: `- calls a.b, c.d` під модулем — `` …; `calls` goes under `- fn` ``, `- fn x` у потоці — `` …; `fn` goes under `- module` in a map ``, `- layer domain` у `# rules` — `` …; `layer` goes at the top of a map ``. Місця поточного виду секції перелічуються всі; слово іншого виду секції з одним місцем називає його з видом секції, з кількома — лише вид секції (`` ; `test` goes in `# flow` ``).

**Р7. Ключові слова контекстні.** Наприклад, під модулем `test foo.bar` — це залежність з аліасом `test`, бо `test` — ключове слово тільки в потоках. І навпаки: під модулем не можна назвати залежність `fn`, `type`, `event` чи `module`.

`foo.bar` оголошено, тож рядок — залежність, а не ключове слово потоку:

```keylang Р7 path=keylang/map.md
- layer app
  - module checkout
    - test foo.bar
- layer foo
  - module bar
```

```diagnostics
```

| Позиція | Ключові слова | Без ключового слова |
|---|---|---|
| верх секції map | `layer`, `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | `<name>` — шар (сумісність зі слайдами) |
| верх секції rules | `layers`, `allow`, `deny`, `entry`, `module`, `no-cycles` | K004 |
| верх секції flow | `kind`, `trigger`, `continues`, `step`, `parallel`, `reads`, `emits`, `calls`, `invariant`, `when`, `after`, `every`, `test`, `planned`, `?` | K004 |
| верх секції wiring | `wire` | K004 |
| верх секції migration | `map`, `dropped` | K004 |
| під `layer` | `module`, `event` (згенерована група `events`, [semantics.md](semantics.md) §6) | `<name>` — модуль |
| під `module` (map) | `module`, `fn`, `type`, `event` | `<alias> <id>` — залежність |
| під `fn`, під `event` | `calls` (під `event` — observers, які викликає фреймворк) | K004 |
| під `layers`, `entry` | — | `<id>` — посилання |
| під `module` (rules) | `exports`, `no-cycles` | K004 |
| під `step` / `trigger` | `step`, `parallel`, `reads`, `emits`, `calls`, `when`, `after`, `every`, `test`, `invariant`, `?` | K004 |
| під `when` (flow) | `then`, `step`, `parallel`, `test`, `?` | K004 |
| під `parallel` | `step` | K004 |
| під `invariant`, `then`, `after`, `every` | `test` | K004 |
| під `wire` | — | `<alias> <id>` — перевизначення залежності |
| під залежністю в `wire` | `when`, `compose` | K004 |
| під будь-чим іншим | — | K004 «не може мати вкладених елементів» |

**Р8. Верхній рівень map приймає і правила** (`allow`, `entry`…), бо на слайді карта й правила записані в одному файлі. Верхній рівень rules шарів не оголошує: шари існують лише в карті.

```keylang Р8 path=keylang/map.md
- layer domain
- layer app
- allow app domain
```

```diagnostics
```

`module` означає різне за позицією: під шаром — оголошення модуля, на верхньому рівні — посилання на модуль, до якого застосовуються правила (`exports`, `no-cycles`).

### Аргументи

`<id>` у таблиці — голе ID або лінк `[id](href)` (§4 «Посилання як лінк»).

| Форма | Аргументи | Семантика |
|---|---|---|
| `layer <name>` / `<name>` | рівно одне ім'я | оголошує `name` |
| `module <name\|link>` / `<name\|link>` | рівно одне | оголошує `parent.name` |
| `fn\|type\|event <name\|link> <signature…>` | ім'я + довільний текст | оголошує `module.name`; решта — `text` (сигнатура) |
| `<alias> <id>` під модулем | два токени | оголошує `module.alias`; `id` — посилання |
| `calls\|reads <id>[, <id>…]` | ≥ 1 ID | посилання |
| `layers <a> < <b> < …` | ID шарів (без крапки), розділені `<` | посилання на шари; вкладені `<id>` — шари без порядку |
| `allow\|deny <a> <b>…` | ≥ 2 ID: шари, модулі (клас теж) або їхні префікси | посилання; перший — хто, решта — на що; ID fn, type, event чи аліаса залежності — K005 |
| `entry` | нічого; точки старту — вкладеними `<id>` | посилання |
| `module <id>` (rules) | одне ID | посилання |
| `exports <name>[, <name>…]` | ≥ 1 ім'я (`- exports ,` — K005) | публічні імена модуля (відносні); порівнюються з таблицею експортів знімка, K001 не дають |
| `no-cycles` | нічого | — |
| `kind business\|technical` | одне з двох слів | `text` |
| `trigger\|step <id>` | одне ID | посилання |
| `trigger route\|cron\|consumer\|webhook <id>` | вид точки входу, ID її fn | посилання; вид — `label`. Інше перше слово без крапки — K005 «unknown trigger kind» |
| `trigger event <id>` | ID події (`events.<назва>`) | посилання; `label` — `event`. Невідома подія — K204, ID fn, типу чи модуля — K205 (дає `check`) |
| `parallel` | нічого; кроки — вкладеними `step` | група; без жодного `step` — K009 |
| `continues <flow>` | ім'я потоку | `text`; потік, якого немає, — K206 |
| `after <тривалість>` | число й одиниця `ms`, `s`, `m`, `min`, `h`, `d`, `w` (`30m`) | `text` |
| `every <розклад>` | тривалість, cron-макрос (`@hourly`, `@daily`, `@midnight`, `@weekly`, `@monthly`, `@yearly`, `@annually`) або п'ять-шість полів cron, голих чи в лапках | `text`; у SpecIR — без лапок |
| `planned fn\|module\|type\|event <id> [signature]` | вид, ID, довільний підпис | намір; не оголошення в індексі і не ребро знімка |
| `emits [event] <name>` | ім'я події | `text`; ID з групи `events` (`events.<назва>`, голе чи лінком) — ще й посилання на подію (невідома — K204), будь-яке інше ім'я — проза, не резолвиться |
| `invariant <текст>` | довільний текст | `text` |
| `? <текст>` | довільний текст, обов'язковий | `text`; відкрите питання, не твердження (Р16) |
| `when <текст>` (flow) | довільний текст | `text` |
| `then <id>` / `then <текст>` | один токен-ID з крапкою → посилання, інакше текст | |
| `test <file> ["<name>"]` | шлях + назва в лапках | `text` = файл, `label` = назва |
| `wire <id>`, `compose <id>` | одне ID | посилання |
| `map <id> → [planned] <id>` (migration) | ID старого стеку, `→` або `->`, необов'язкове `planned`, ID цього репозиторію | `id` — старе ID, `text` — рядок, `label` — `planned`; нове ID — посилання (K001, якщо його немає ні в коді, ні в `planned`), старе — проти знімка `migration.from` |
| `dropped <id> <причина>` (migration) | ID старого стеку й текст; без причини — K005 | `id` + `text`; старе ID — проти знімка `migration.from` |
| `when <умова> → <id>` (wiring) | текст, `→` або `->`, ID | `text` + посилання |

**Рядки migration** (business-flows/27). Таблиця відповідності — твердження про два репозиторії, і `check` судить обидва боки рядка:

- **новий бік** `map <старе> → [planned] <нове>` — звичайне посилання цього репозиторію: ID має бути в коді або оголошене `planned` (його пише `flow import` у фічі), інакше K001 на новому ID. Слово `planned` у рядку — позначка для людини й для `migration status` («ще не реалізовано»), не оголошення: без `- planned <вид> <ID>` у специфікації рядок `→ planned x` теж K001;
- **старий бік** (`map` і `dropped`) резолвиться проти **старого знімка** — `migration.from` у `keylang.json`: шлях (відносно кореня) до експортованого `index.json` старого репозиторію (`keylang map --export-index <файл>` чи звичайний `.keylang/index.json`) або до його checkout, який `check` аналізує лише на читання (нічого не пише туди, навіть кеш фактів; його власний `migration.from` не читається). Старе ID є в знімку — вердикт `migration ok`; немає, а область прочитано — K001 «in the old stack»; всередині непрозорого модуля — `migration unverified`; без `migration.from` — `migration unverified … no old snapshot`; знімок не читається — `migration unverified … unreadable` з причиною, не помилка;
- `dropped <id>` без причини — K005 (причина — для людини, яка вирішує, що не переносити).

Паритет флоу (чи старий флоу має пару, чи кроки є в новому коді, чи ті самі тести проходять в обох звітах) `check` не рахує — це `keylang migration status` ([cli.md](cli.md#migration)), бо він читає ще й потоки, звіти тестів та інтеграції старого стеку.

`text` вільного тексту (`invariant`, `?`, `when`, текстовий `then`) — канонічний, як його пише `fmt`: токени через один пробіл, кома — `a, b`. Тож `fmt` не змінює ні текст, ні `specHash` вердиктів над ним.

Порушення форми — K005. Приклад зі слайда: `- options infrastructure.config.server` на верхньому рівні — це шар `options` із зайвим аргументом, тож K005 з підказкою «залежність має бути вкладена в модуль».

```keylang path=keylang/map.md
- options infrastructure.config.server
```

```diagnostics
keylang/map.md:1:11: K005 unexpected arguments after layer `options` (a dependency `<alias> <path>` must be nested under a module)
```

`planned` — окрема декларація верхнього рівня, а не модифікатор кроку. `step planned <id>` чи `trigger planned <id>` (також `step planned <вид> <id>`) — K005 на слові `planned` з підказкою, як записати; вид без явного — `fn`. `reason` — `arguments`.

```keylang path=keylang/flows/pay.md
# flow pay

- step planned app.pay.charge
```

```diagnostics
keylang/flows/pay.md:3:8: K005 `planned` is a declaration, not a step modifier: add `- planned fn app.pay.charge` at the top of the flow and keep `- step app.pay.charge`
```

**Р10. `then` вгадує форму**: `then application.purchase.OutOfStock` — посилання, `then retry ≤ 3, backoff …` — текст. Критерій — рівно один токен, який є ID (голим чи текстом лінка) і містить крапку. Якщо той токен крапки не має, а його текст точно (з урахуванням регістру) дорівнює останньому сегменту оголошеного ID карти або `planned` — K008 (warning) на цьому слові, а для лінка — на ID усередині `[…]`. Підказка перелічує всіх кандидатів у стабільному порядку: `did you mean then <повний id>`. Шар (ID з одного сегмента) кандидатом не є. Багатослівний `then`, ID з крапкою і слово без кандидата мовчать; нечіткого пошуку немає. K008 не валить `check`, `--strict`, `feature` і Stop. `fmt` рядок не переписує: заміна тексту посиланням змінила б семантику. `parse` K008 не друкує, бо без індексу резолвера кандидатів немає.

ID з крапкою — посилання. Кілька слів — текст, і K008 немає. Одне слово без крапки, що збігається з останнім сегментом оголошення, — K008:

```keylang Р10 path=keylang/flows/buy.md
# flow buy
- when paid
  - then application.purchase.OutOfStock
  - then retry ≤ 3, backoff
  - then OutOfStock
```

```keylang path=keylang/map.md
- layer application
  - module purchase
    - event OutOfStock
```

```diagnostics
keylang/flows/buy.md:5:10: K008 `then OutOfStock` is read as text, not a reference (did you mean `then application.purchase.OutOfStock`?)
```

**Р11. `emits event order.created`** — слово `event` необов'язкове. Ім'я, що не є ID події, — проза: воно не перевіряється, як у design.md, де воно не є шляхом карти. ID події з групи `events` (`emits event events.order_placed`) — посилання, яке `check` судить проти фактів знімка (Р17, [ADR 0023](adr/0023-async-flows.md) п. 1); перше слово `events` зарезервоване, тож прозове ім'я ним не починається.

Події в карті немає, і K001 теж немає: прозовий `emits` не резолвиться.

```keylang Р11 path=keylang/flows/buy.md
# flow buy
- emits event order.created
```

```diagnostics
```

**Р16. `? <текст>` — відкрите питання.** Питання записує те, чого ще не вирішено: хто ініціює повернення, чи потрібне підтвердження оператора. Воно стоїть на верхньому рівні потоку, під `trigger` чи `step` і під `when`, у будь-якому потоці, бо вид секції визначає заголовок, а не шлях (Р2). Питання — не твердження: `check` його не оцінює й діагностик для нього не дає. Файл фічі з відкритим питанням не готовий (`keylang feature`, прогалина `question`), а питання, яке було в базовому коміті й зникло, — послаблений план (прогалина `spec`, [tools.md](tools.md)): на питання відповідають комітом, а не видаленням. `?` — ключове слово лише в цих позиціях і лише окремим токеном: `?хто` — інше слово. Зміна додавальна: раніше такий рядок давав K004, тож значення наявних текстів не змінилося, і нової редакції немає ([ADR 0007](adr/0007-format-editions.md)).

```keylang Р16 path=keylang/flows/refund.md
# flow refund
- ? who starts a refund: the customer or an operator?
- step app.refund.start
  - ? is an operator needed?
  - when the order is paid
    - ? what about partial refunds?
```

```keylang path=keylang/map.md
- layer app
  - module refund
    - fn start
```

```diagnostics
```

Текст обов'язковий, а вкладених елементів питання не має.

```keylang path=keylang/flows/refund.md
# flow refund
- ?
- step app.refund.start
  - ? who answers?
    - step app.refund.start
```

```keylang path=keylang/map.md
- layer app
  - module refund
    - fn start
```

```diagnostics
keylang/flows/refund.md:2:1: K005 `?` needs a description
keylang/flows/refund.md:5:5: K004 `?` cannot have nested items
```

**Р17. Асинхронні форми потоку** ([ADR 0023](adr/0023-async-flows.md)). Чотири форми — контекстні слова лише всередині `# flow`; до них такий рядок давав K004, тож зміна додавальна й нової редакції немає ([ADR 0007](adr/0007-format-editions.md)). Поза потоком слова лишаються звичайними (Р7): `- every app.handlers` під модулем карти — залежність з аліасом `every`.

- `- trigger route|cron|consumer|webhook <id>` — потік починається з точки входу цього виду. `<id>` — ID fn точки входу зі списку `keylang entries`, а не шлях маршруту: шлях змінюється частіше за fn і не є ID. Мітку (`POST /V1/carts/mine/order`, розклад cron) показує вердикт ([semantics.md](semantics.md), «Асинхронні форми»).
- `- parallel` з вкладеними `step` — паралельна група: кожен крок має відбутися, порядок між ними не перевіряється, а наступний сусід іде після всієї групи. Стоїть на верху потоку, під `step`/`trigger` і під `when`.
- `- continues <flow>` на верху потоку — цей потік продовжує інший в іншому запиті (вебхук оплати продовжує оформлення замовлення). Форми `wait` усередині одного потоку немає: кожна точка входу — свій потік.
- `- after <тривалість>` і `- every <розклад>` — таймери під кроком чи на верху потоку; їх перевіряє вкладений `test`.
- `- emits event <id>` під кроком (на верху потоку — під тригером) з ID події `events.<назва>` ([semantics.md](semantics.md) §6) — крок публікує подію: `check` шукає `dispatch` цієї події в коді, який крок досягає. Ім'я без `events.` лишається прозою, як раніше (Р11).
- `- trigger event <id>` — потік підписників події: кроки під ним виконуються в її підписниках (observers з конфігу, receivers сигналу), і кожен крок має бути досяжний хоч від одного з них. Подія — з тієї самої групи `events`; ID, якого немає, — K204 з `did you mean`, а ID fn, типу чи модуля — K205.

Оплата з вебхуком: замовлення оформлює маршрут, після оплати паралельно йдуть резерв, лист і вивантаження в ERP, підтвердження приходить вебхуком, а неоплачене замовлення щогодини скасовує cron.

```keylang Р17 path=keylang/flows/place-order.md
# flow place-order

- trigger route shop.checkout.placeOrder
- step shop.payment.charge
- parallel
  - step shop.stock.reserve
  - step shop.mail.confirmation
  - step shop.erp.export
- step shop.checkout.respond
```

```keylang path=keylang/flows/payment.md
# flow payment-confirmed

- continues place-order
- trigger webhook shop.payment.confirmed
- step shop.payment.capture

# flow cancel-unpaid

- continues place-order
- trigger cron shop.orders.cancelUnpaid
- every 0 * * * *
  - test tests/cancel.test.ts "runs every hour"
- step shop.orders.cancel
  - after 1h
    - test tests/cancel.test.ts "cancels an order unpaid for an hour"
```

```keylang path=keylang/map.md
- layer shop
  - module checkout
    - fn placeOrder
    - fn respond
  - module payment
    - fn charge
    - fn confirmed
    - fn capture
  - module stock
    - fn reserve
  - module mail
    - fn confirmation
  - module erp
    - fn export
  - module orders
    - fn cancelUnpaid
    - fn cancel
```

```diagnostics
```

Подія й підписник: `place` публікує `order_placed`, лист отримувача — потік події. Події стоять у згенерованій групі `events` карти (`keylang/map/events.md`), тут — записані вручну; `order.created` без `events.` — проза, яку `check` не судить. Невідома подія — K204 з найближчою подією в підказці, ID fn після `trigger event` — K205; обидва дає `check`, не `parse`.

```keylang path=keylang/flows/events.md
# flow place

- trigger shop.orders.place
  - emits event events.order_placed
  - emits event order.created
  - emits event events.order_placd

# flow receipt

- trigger event events.order_placed
- step shop.mail.receipt

# flow wrong

- trigger event shop.orders.place
```

```keylang path=keylang/map.md
- layer shop
  - module orders
    - fn place
  - module mail
    - fn receipt
- events
  - event order_placed
```

```diagnostics
keylang/flows/events.md:6:17: K204 unknown event `events.order_placd` (did you mean `events.order_placed`?): no code keylang read dispatches it and no config observes it
keylang/flows/events.md:15:17: K205 `trigger event` names `shop.orders.place`, a fn, not an event; an event ID is `events.<name>`, as `keylang/map/events.md` lists them
```

Невідомий вид тригера й аргументи таймерів — K005 парсера; `parallel` без кроків — K009, а `continues` на потік, якого немає, — K206 (обидва дає `check`, не `parse`). Вид, що не збігається з точкою входу знімка, — K205 ([semantics.md](semantics.md)).

```keylang path=keylang/flows/broken.md
# flow broken

- trigger queue shop.orders.cancel
- continues place-ordr
- parallel
- step shop.orders.cancel
  - after soon
  - every day
```

```keylang path=keylang/flows/place-order.md
# flow place-order

- step shop.orders.cancel
```

```keylang path=keylang/map.md
- layer shop
  - module orders
    - fn cancel
```

```diagnostics
keylang/flows/broken.md:3:11: K005 unknown trigger kind `queue`; expected one of: route, cron, consumer, webhook, event
keylang/flows/broken.md:4:13: K206 `continues` names flow `place-ordr`, which no `# flow` declares (did you mean `place-order`?)
keylang/flows/broken.md:5:3: K009 `parallel` has no steps; nest the steps that run in any order under it
keylang/flows/broken.md:7:11: K005 expected `after <duration>`: a number and a unit (ms, s, m, min, h, d, w), such as `after 30m`
keylang/flows/broken.md:8:11: K005 expected `every <schedule>`: a duration (`every 15m`), a cron macro (`every @daily`) or five cron fields (`every 0 * * * *` or `every "0 * * * *"`)
```

## 8. Канонічна форма (`keylang fmt`)

`fmt` рендерить файл з IR, тож `fmt(fmt(x)) == fmt(x)`:

- маркер генерації, заголовки, списки, абзаци прози й блоки коду розділені рівно одним порожнім рядком; усередині списку порожніх рядків немає;
- маркер списку `-`, відступ `2·глибина`, токени елемента через один пробіл, кома — `a, b`, коментар через один пробіл;
- заголовок `# kind name`, коментар заголовка — через один пробіл (`# <!-- c -->`), без закривних `#` (§1);
- опис — під рядком вузла з відступом `2·глибина + 2`, текст без кінцевих пробілів;
- проза й код — дослівно (без кінцевих пробілів), крім відступу огорожі: з відкривного й закривного рядка знімається весь відступ, з кожного рядка вмісту — стільки пробілів, скільки мала відкривна огорожа, але не більше, ніж їх є в рядку. Таб у відступі огорожі лишає блок як є. Порожні рядки всередині HTML-блоку типів 1–5 зберігаються;
- файл закінчується одним переносом рядка. Файл, у якому кожен рядок закінчується CRLF (Windows-checkout з `autocrlf`), лишається з CRLF, інший — LF; `fmt --check` вважає такий CRLF-файл канонічним, коли його LF-форма канонічна.

Неявні ключові слова **не** додаються: `- orderAggregate` під шаром лишається як є (слайдова форма рівноправна з `- module orderAggregate`).

`fmt <paths…>` форматує кожен файл окремо: файл, який не прочитати чи не записати, називається в stderr з причиною, а решта все одно форматуються; тоді код 2. Інакше код 1 — діагностики або, з `--check`, неформатований файл (з `--check` нічого не пишеться).

`fmt` пише за тим самим протоколом, що й інші записи keylang (`map`, `wire`, пропозиції): лише в репозиторій — каталог із `keylang.json`, без нього поточний. Ціль, яка після всіх символічних посилань лежить поза ним, — `cannot write: outside the repository` (шлях поза коренем) чи `cannot write: leads out of the repository through a link`; посилання по колу — `leads through a loop of links`. Такий файл не пишеться, решта форматуються, код 2. Файл із маркером генерації (перший непорожній рядок містить `keylang:generated`) належить генератору: `fmt` його не форматує і не рахує, а називає приміткою в stderr — `` keylang: note: keylang/map/app.md: a generated file, not formatted; `keylang map` writes it `` (без команди в маркері — `only its generator writes it`); код від нього не залежить, і `fmt --check` не вважає його неформатованим. `--check` лише читає, тож файл за посиланням назовні він порівнює, як і будь-який інший.

**Р9. Code fence всередині елемента списку не підтримується**: огорожа з будь-яким відступом закриває список і стає блоком коду секції. `fmt` знімає цей відступ, тож після форматування GitHub показує блок поза списком — там само, де його бачить keylang. Значення файлу не змінюється.

```keylang Р9 path=keylang/map.md
- layer domain
  - module order
    ~~~
    code
    ~~~
```

```fmt
- layer domain
  - module order

~~~
code
~~~
```

```diagnostics
```

## 9. IR і позиції (для LSP)

`Document → Section → Item (Node | Prose | Code)`, `Node` рекурсивний. З цього текстового IR `compileSpec` будує внутрішній SpecIR — типізовані твердження правил, потоків і wiring. Парсер перевіряє форму рядка, `compileSpec` — форму твердження (порядок шарів, умова wiring), check — те, що потребує знімка. У JSON-виводі (`parse --json`, `check --format json`) SpecIR немає: назовні лишається текстовий IR і результати перевірки. `parse --json` серіалізує `diagnostics` як є, тож K005 парсера має там те саме `reason`, що й у `check --format json`. Кожен `Node` має `span` (рядок елемента від маркера до кінця), `keyword` (спан ключового слова або `null`, якщо воно неявне), `name.span`, `link.span`, `refs[*].span` (для лінка — ID усередині `[…]`, сам лінк — `refs[*].link`), `text.span`, `description[*].span`, а також сирі `tokens` зі спанами. `Pos = {offset (індекс у рядку JS, UTF-16), line, col (кодові точки)}`. `Node.id`, `name.value` оголошення і `Ref.target` — у NFC (§4), а `tokens`, `Ref.text` і spans — як написано. `Index` (`src/resolve.ts`) відображає `id → Decl {file, span імені, kind}` — це вже дає `definition` (посилання → оголошення) і `hover`; `spanContains(span, offset)` — пошук вузла під курсором.

MCP і LSP описано в [mcp-lsp.md](mcp-lsp.md#mcp).

## Додаток А. Граматика

Нормативна граматика цього документа. Таблиці §5 лишаються зведенням для читача. Фрагменти в §2 і §4 лише відсилають сюди.

```ebnf
(* Класи рядків, §1. Спрацьовує перший, що підійшов. *)
line = fence-line | html-block | blank | generated-marker | heading | fence-open | item | description | prose ;

heading = "#" ( " " | tab ) kind [ " " name ] [ closing ] ;
closing = ( " " | tab ) "#" { "#" } ; (* CommonMark: до слів заголовка не входить *)
kind = "map" | "rules" | "flow" | "wiring" ;
name = segment ;
segment = ( letter | "_" | "$" ) ( letter | mark | digit | "_" | "$" | "-" )* ;
id = segment ( "." segment )* ;

item = indent bullet " " head [ " " comment ] ;
bullet = "-" | "*" | "+" ;
head = token ( sep token )* ;
token = link | quoted | word | "," ;
link = "[" text "](" target ")" ;
target = { not space or tab | "(" target ")" } ; (* дужки — парами або з \ *)
quoted = '"' { not quote } '"' ;
word = { not space, tab, or comma } ;
comment = "<!--" { rest of line } ;

(* Позиції §5. Слово в лапках — ключове. `-> kind` — kind в IR, коли він не збігається зі словом. *)
map-top = "layer" | "layers" | "allow" | "deny" | "entry" | "module" -> rule-module | "no-cycles" ;
rules-top = "layers" | "allow" | "deny" | "entry" | "module" -> rule-module | "no-cycles" ;
flow-top = "kind" | "trigger" | "continues" | "step" | "parallel" | "reads" | "emits" | "calls" | "invariant" | "when" | "after" | "every" | "test" | "planned" | "?" -> question ;
wiring-top = "wire" ;
under-layer = "module" | "event" ;
under-module = "module" | "fn" | "type" | "event" ;
under-fn = "calls" ; (* також під event у map *)
under-ref = (* під layers і під entry: голе id, без ключових слів *) ;
under-rule-module = "exports" | "no-cycles" ;
under-step = "step" | "parallel" | "reads" | "emits" | "calls" | "when" | "after" | "every" | "test" | "invariant" | "?" -> question ;
(* under-step також під trigger *)
under-when = "then" | "step" | "parallel" | "test" | "?" -> question ;
under-parallel = "step" ;
under-invariant = "test" ;
(* under-invariant також під then *)
under-timer = "test" ;
(* under-timer — під after і під every *)
under-wire = (* гола залежність alias id, без ключових слів *) ;
under-wire-dep = "when" | "compose" ;
under-other = (* K004: батько не може мати вкладених елементів *) ;

(* Форми аргументів, §5. *)
layer-args = "layer" segment ;
module-args = "module" ( segment | link ) ;
decl-args = ( "fn" | "type" | "event" ) ( segment | link ) signature ;
dep-args = alias id ;
calls-args = ( "calls" | "reads" ) id ( "," id )* ;
layers-args = "layers" id ( "<" id )* ;
allow-args = ( "allow" | "deny" ) id id ;
entry-args = "entry" ;
rule-module-args = "module" id ;
exports-args = "exports" segment ( "," segment )* ;
no-cycles-args = "no-cycles" ;
kind-args = "kind" ( "business" | "technical" ) ;
step-args = ( "trigger" | "step" ) id ;
trigger-kind-args = "trigger" ( "route" | "cron" | "consumer" | "webhook" | "event" ) id ;
parallel-args = "parallel" ;
continues-args = "continues" segment ;
after-args = "after" duration ;
every-args = "every" ( duration | cron-macro | cron-fields | '"' cron-fields '"' ) ;
duration = digit { digit } ( "ms" | "s" | "m" | "min" | "h" | "d" | "w" ) ;
cron-macro = "@yearly" | "@annually" | "@monthly" | "@weekly" | "@daily" | "@midnight" | "@hourly" ;
cron-fields = cron-field cron-field cron-field cron-field cron-field [ cron-field ] ;
cron-field = { letter | digit | "*" | "/" | "," | "-" | "?" | "#" } ;
planned-args = "planned" ( "fn" | "module" | "type" | "event" ) id [ signature ] ;
emits-args = "emits" [ "event" ] ( segment | event-id ) ;
event-id = "events" "." segment | link ; (* посилання на подію; текст лінка — events.<segment> *)
invariant-args = "invariant" text ;
question-args = "?" text ;
when-flow-args = "when" text ;
then-args = "then" ( id | text ) ;
test-args = "test" file [ '"' name '"' ] ;
wire-args = ( "wire" | "compose" ) id ;
when-wiring-args = "when" condition "→" id ;
```

Побічні умови, яких EBNF не виражає:

- Глибина = відступ / 2 (§3). Відступ — лише пробіли.
- Ключові слова контекстні (Р7): те саме слово в іншій позиції — не ключове.
- `then` вгадує форму (Р10): один токен-ID з крапкою — посилання, інакше текст.
- `trigger` з двома аргументами, перший без крапки, — `trigger-kind-args` (Р17); тривалість починається з ненульової цифри.
- `emits` з ID, перший сегмент якого `events`, — `event-id`, посилання на подію; будь-яке інше ім'я — проза (Р11, Р17).
- Під будь-чим іншим — K004 «не може мати вкладених елементів» (`under-other`).
