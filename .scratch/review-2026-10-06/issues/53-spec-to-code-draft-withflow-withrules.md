# 53: spec-to-code (і draft withFlow/withRules) переводять у LF усі рядки файла зі змішаними закінченнями; у MERGE це невидимий шматок, склеєний із заготовкою

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `writes`, верифікація: confirmed.

**Місце:** `src/spec-to-code.ts:61` (рецензент указав `src/spec-to-code.ts:60`)

## Що не так

`specToCode` бере `before.replace(/\r\n/g, "\n")` і повертає CRLF лише тоді, коли CRLF має кожен рядок. Для файла зі змішаними закінченнями кандидат міняє всі CRLF-рядки на LF, хоч їх ніхто не правив; `withFlow` і `withRules` у draft.ts роблять так само. Це суперечить tui.md («зі змішаними — не нормалізується»). У MERGE зміна закінчень зливається з додаванням заготовки в один шматок, тож прийняти заготовку без нормалізації неможливо. Крім того, рядки, що відрізняються лише `\r`, роздувають квадратичну таблицю LCS у `diffLines`.

## Сценарій збою

src/domain/order.ts: 4 рядки з CRLF і останній з LF. `keylang spec-to-code domain.order.refund --apply` переписує всі 5 рядків з LF, хоча додано лише функцію. У TUI MERGE для пропозиції виходить один шматок `baseStart 0, baseCount 4` з візуально однаковими рядками плюс заготовка. Для великого змішаного файла `diffLines` на 15 000 рядків займає ~900 МБ і 4,5 с, на 30 000 — 3,6 ГБ і 16 с синхронно в потоці TUI (`entries()` під час відкриття списку пропозицій).

## Як відтворити

Копія tests/fixtures/repo. order.ts записано через printf: 4 рядки CRLF, останній `}\n`. keylang/refund.md: `- planned fn domain.order.refund (id: string) → void`. `keylang spec-to-code domain.order.refund --apply` дає exit 0, і `cat -A` показує, що всі `^M` зникли. Без --apply пропозиція є, а `diffLines(splitEol(disk).text.split, lf(prop).split)` дає 1 шматок з baseCount 4 і 8 рядками. Окремо `diffLines` на n рядків `line i\r` проти `line i`: 5000 — 524 мс і 100 МБ ArrayBuffer, 15000 — 4547 мс і 900 МБ, 30000 — 16380 мс і 3600 МБ.

Доказ верифікатора:

> Відтворено на копії tests/fixtures/repo у scratch/verify/writes-3-0/repo, з HOME, XDG_CACHE_HOME і XDG_CONFIG_HOME у scratch.
> 
> 1) --apply. Файл order.ts: 4 рядки CRLF і 3 рядки LF. Специфікація keylang/refund.md:
> "# flow refund\n\n- planned fn domain.order.refund (id: string) → void\n- trigger app.checkout.checkout\n"
> Команда `node bin/keylang.js spec-to-code domain.order.refund --apply` дала exit=0 і "src/domain/order.ts written". Після неї `cat -A src/domain/order.ts` не показує жодного `^M`: усі рядки закінчуються на `$`, тобто й ті 4, що були CRLF і яких ніхто не правив. Причина в коді: src/spec-to-code.ts:61 нормалізує текст через `before.replace(/\r\n/g,"\n")`, а рядок 65 повертає CRLF лише якщо `allCrlf(before)`. Так само поводяться src/draft.ts:62/75 (withFlow) і 86/110 (withRules). Перевірив прямим викликом: `withRules("# rules\r\n\r\n- deny domain infra\r\n- no-cycles\n", ...)` повертає текст повністю в LF; withFlow поводиться так само. Навіть `--print` показує в diff усі рядки файла як змінені.
> 
> 2) MERGE. Файл точно як у заявці: `printf 'export interface Order {\r\n  id: string;\r\n  total: number;\r\n  n: number;\r\n}\n'`. Після `spec-to-code` без `--apply` з'являється пропозиція .keylang/proposals/src/domain/order.ts. Обчислив `diffLines(splitEol(disk).text.split("\n"), lf(prop).split("\n"))` так само, як merge-session.ts:113/188. Вийшов рівно 1 шматок: `{"baseStart":0,"baseCount":4,"lines":[4 ті самі рядки без \r, "}", "", "export function refund(...)", "  throw ..."]}`. Тобто прийняти заготовку, не зачепивши закінчення рядків, неможливо. Для файла іншої форми (CRLF-рядки, а за ними LF-рядки посередині) виходить 2 окремі шматки. Отже, злиття в один шматок залежить від того, який у файла хвіст.
> 
> Важливе уточнення: у MERGE корінь не лише в spec-to-code. merge-session.ts бере base як сирий текст змішаного файла (splitEol повертає його з `\r`), а пропозицію пропускає через `lf()`. Я перевірив пропозицію, яка зберігає змішані закінчення і лише дописує рядок: `disk="a\r\nb\r\nc\nd\r\n"`, `prop` той самий плюс "NEW\n". Вона все одно дає зайві шматки `[{baseStart:0,baseCount:2,lines:["a","b"]},{baseStart:3,baseCount:1,lines:["d","NEW"]}]`. Тож якщо виправити тільки spec-to-code, MERGE лишиться зламаним для будь-якої пропозиції до змішаного файла. Це суперечить tui.md:197 («зі змішаними — не нормалізується»). Для --apply tui.md:183 обіцяє «CRLF і права файла зберігаються», а для змішаного файла CRLF губиться. Водночас коментарі в коді (draft.ts, safe- …

## Що зробити

- Зберігати закінчення кожного рядка: незмінені рядки повертати з їхнім оригінальним `\r`, а нові рядки писати з переважним EOL файла. У MERGE порівнювати base і пропозицію в однаковій нормалізації (обидва без `\r`) і відновлювати `\r` на рядках base, які не змінились.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/spec-to-code.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
