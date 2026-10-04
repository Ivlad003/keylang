# 14: Генерувати та перевіряти wiring у сесії

**What to build:** дія wire приймає вихідний шлях і повертає згенерований файл або точні помилки wiring.
**Blocked by:** [09 — файлові операції](09-map-write-and-commit-protocol.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A08, A18, A22.

## З чого почати

Знайти `cmdWire`, `wiringErrors`, `generateWire`, `WIRE_MARKER`, `writeProblem`. Прочитати чинний контракт wiring і lifecycle ADR.

## Кроки

1. Виділити shared wire operation; параметри out і checkOnly. Типовий out залишити CLI-типовим.
2. До аналізу перевірити простий відносний шлях, дозволене TS-розширення та межі через symlink.
3. Збережені специфікації проаналізувати; blocking errors у wiring повернути як звіт із кодом 1 без запису. Відсутній розділ — чинна помилка виклику.
4. Побудувати текст чинним `generateWire`. Наявний файл без маркера генерації не перезаписувати.
5. Check порівнює зі збереженням чинної CRLF-еквівалентності. Write використовує expected current, звіт фактичного запису й повторний аналіз.
6. З результату відкрити код у read-only viewer; це не новий writable code-buffer.

## Перевірки

- Коректні фабрики → той самий текст, що CLI wire; check після write — 0.
- Помилка посилання/аргументів у wiring → та сама діагностика, вихідного файла немає.
- Ручний файл на out, шлях назовні, symlink назовні → відмова без перезапису.
- Зміна wiring або out між обчисленням і записом → outdated candidate, потрібен повтор.

## Приймання

- [x] Wire/check досяжні з палітри й не блокують ввід.
- [x] Lifecycle контейнера й генератор не переписані під TUI.
- [x] Read-only режим не створює навіть батьківського каталогу.

**Межі:** не компілювати й не запускати згенерований контейнер.
**Validation:** `npm run typecheck`, `npm test`; карта/правила при перенесенні оркестрації.

## Result

Реалізовано `wire` (запис і перевірка) як спільну операцію з фазами обчислення/commit; CLI — принтер над нею; форма в палітрі TUI, звіт F6 і перегляд згенерованого коду лише для читання.

- **`src/operations.ts`** — `WireRequest { kind: "wire", root, out?, check }` (типово `WIRE_OUT = "keylang.gen.ts"`), `WirePayload { file, check, state: blocked|manual|current|stale, diagnostics, written, refused, error, snapshot }`; `"wire"` у `WRITING_KINDS`; `runWire`, `wireOutProblem` (політика шляху до будь-якого читання: `.ts/.mts/.cts`, простий відносний, усередині репозиторію через посилання — повідомлення CLI, код 2), `wiringErrors` (перенесено з `cli.ts` без змін), `wireSpecInputs`/`wireSpecProblems`. Аналіз збережених специфікацій без кешу фактів і evidence; помилки на рядках `# wiring` — `blocked`, код 1 (і в check); відсутній розділ — 2; файл без маркера — `manual`, 1; check — CRLF-еквівалентність, нічого не пише й не створює тек. Write: однаковий текст — 0 без `beforeCommit`; інакше після `beforeCommit` повторна перевірка — ціль (`writeProblem` з `expect` поточних байтів), хеші всіх специфікацій (прочитані до аналізу), кореневий `tsconfig.json`, `keylang.json` і джерела (`sourceInputProblems`, без самої цілі) — відмова `failed`, 1, нічого не записано; далі `writeAtomic(landing(...))` (CRLF старого файла зберігається, як у `safeWrite`), I/O-помилка — 2. `generateWire` не змінено.
- **`src/cli.ts`** — `cmdWire` друкує результат операції: код 2 — `keylang: …` у stderr; `info` (діагностики, `written`, `stale`, `manual…`) — stdout; підсумок `wire: N error(s) in wiring; nothing written` і рядки відмови — stderr. Прибрано непотрібні імпорти.
- **`src/tui/*`** — дія «Wire: generate or check» (група Project; aliases `wire`, `keylang wire`, `wire --check`, `wiring`, `generate wiring`, `keylang.gen.ts`, `container`), `Prompt.kind = "wire"`: поле out (типово `keylang.gen.ts`), примітка з помилкою шляху по ходу набору / станом файла на диску / кількістю незбережених, пункти `Write <out>` / `Check <out> (writes nothing)`; невалідний шлях — повідомлення, форма лишається, операція не стартує. Save barrier: усі dirty spec/config буфери; для запису з dirty-буферами крок називає ціль. `endCommit`: check-записи wire цього файла — outdated. F6: заголовок, стан (`written`, `up to date`, `stale`, `N error(s) in wiring, nothing written`, `manual file, not written`, `inputs changed, nothing written`, `write failed`), повідомлення; Tab → Enter відкриває першу блокуючу помилку в специфікації або згенерований файл у вбудованому read-only viewer (`showCode` через `openTarget`), не в буфері.
- **`docs/tools.md`** — абзац «Wire у TUI».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,operations,tui}.md` і `map-explained/README.md`; WIP `extract.md` байтово ті самі до/після (diff порівняно `cmp`), не закомічені.
- **Тести** (`tests/tui.test.ts`, 3 нові; 12 CLI-тестів `tests/wiring.test.ts` без змін і зелені):
  1. F5 нічого не пише; форма через alias, дефолт out; check відсутнього — 1, stdout/stderr = CLI-близнюк; check у `gen/wiring/…` не створює теки; write у worker (запис `running`, палітра відкривається) — байти й рядки = CLI; старий check outdated; повтор write/check — 0 без записів; CRLF-копія — current; F6 → Tab → Enter — `mode === "code"`, буфера `keylang.gen.ts` немає, `i` не вмикає редагування.
  2. K003 + K302 у wiring — `blocked`, 1 у write і check, ті самі діагностики, що CLI, файла немає; F6 відкриває першу помилку (`wiring.md:4`); ручний файл — 1, байти ті самі; `../…-escape.ts`, symlink назовні, `.js` — форма відмовляє без запису; операція й CLI — 2 з тим самим повідомленням у check і write; зовні нічого.
  3. Пауза перед commit: зміна `wiring.md` → `refused` зі специфікацією, файла немає; створена ціль → `created on disk…`, її байти лишились; Enter у F6 перераховує й пише (CLI `--check` 0); dirty `wiring.md` → крок збереження з `writes: [keylang.gen.ts]`, Back нічого не пише, Save and continue генерує зі збереженого тексту.

Коміт: `5d1a35d` (Generate and check wiring through a shared wire operation in CLI and TUI); сторонній WIP не зачеплено.

Перевірки: `npm run typecheck` ✓; `npm test` 505 tests, 504 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 68 ok ✓.

Передано наступним задачам:
- 37: дія `wire` у каталозі палітри; 35: скасування під час commit wire — один файл, тож лише до/після запису; окремо не тестувалось.
- 18 (export): `WirePayload` має діагностики та стан для експорту.

Припущення й залишки:
- Свіжість входів: усі `.md` під каталогом специфікацій (без `map-explained/` і `explain/`) за хешем, кореневий `tsconfig.json` (без ланцюга `extends`), `keylang.json` і джерела; сама ціль — лише через `expect`. Надмірна обережність (зміна не-wiring специфікації теж відмовляє) — свідомо: повтор дешевий.
- Контракт CLI: у рідкісній гонці CLI тепер теж відмовляє з кодом 1 і рядками `path: reason` у stderr (раніше перевірявся лише `expect` цілі). I/O-помилка запису тепер `keylang: <out>: <message>` замість сирого повідомлення.
- Повідомлення про шлях у TUI зберігають CLI-формулювання `--out …`.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-09-30: виконано, коміт `5d1a35d`.
