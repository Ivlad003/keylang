# 08: `external.<pkg>` з маніфесту: `exclude` єдиного імпортера не дає K001

**Джерело:** research-pl §5 Р-4; знахідка 2; рішення Q7 (spec); spec «Виправлення дослідження», Р-4: контрприклад `external.<pkg>`

**What to build:** Відтворення (перевірено 2026-09-29). Фікстура:
- шари `app` і `infra`;
- `package.json` з `"dependencies": { "pg": "^8.0.0" }`;
- `src/infra/db.ts` — єдиний файл, що імпортує `pg`;
- `keylang/rules.md` з рядками `- deny infra external` і `- allow infra external.pg`. Таку пару пише й `keylang baseline` (src/baseline.ts:47-50).

`check` дає код 0. Після `exclude: ["src/infra/db.ts"]` вузла `external.pg` у знімку немає. Тоді `check` дає `keylang/rules.md:4:15: K001 dangling reference \`external.pg\`` і код 1: менше інформації створило `fail`. Так само на rust-shop після `init --agents=none`: з `exclude: ["src/infra/store.rs"]` рядок `allow infra external.serde` у `rules.baseline.md` дає K001 (`rules.baseline.md:8:15`).

Правило (Q7): резолвер посилань (K001) знає пакет, якщо його оголошено в маніфесті, який keylang уже читає, щоб вирішити, чи імпорт зовнішній:
- TS/JS: поля `dependencies`, `devDependencies`, `peerDependencies` і `optionalDependencies` у `package.json` кореня або теки між файлом коду (зокрема виключеним) і коренем. Це ті самі поля, що читає `knownNear` (src/imports.ts:265-282). Пакет, лише встановлений у `node_modules`, але не оголошений, так не стає відомим.
- Rust: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]` і їхні `[target.….dependencies]` у `Cargo.toml` крейтів (src/rust-imports.ts:182-184). Ім'я пакета те саме, під яким резолвер повертає його для імпорту.
- Python: маніфест не читається. `PythonResolver` «reads no configuration files» (src/python-imports.ts:21), тож пакет відомий лише з імпортів прочитаних файлів. format.md записує це обмеження як виняток із монотонності. `pyproject.toml` тікет не читає.

ID будується тим самим відображенням імені в сегмент, що й для імпорту (`externalSegment`, src/graph.ts:870).

Це стосується лише резолвінгу. У знімку не з'являється вузол, ребро чи модуль шару `external`. Карта (`keylang/map/external.md`) і вузли `.keylang/index.json` не змінюються, ID імпортованих пакетів лишаються тими самими. Тож контракт harness-integration/10 зберігається: `planned module external.<pkg>` дає K202, лише коли пакет з'являється в імпортах, а не від самого маніфесту. Наслідок правила: оголошений, але не імпортований пакет у правилі теж більше не дає K001, наприклад після видалення останнього імпорту.

29 (модель прогалин) заблокований цим тікетом. Якщо 05 уже злито, цей тікет знімає `todo` з підтесту свого випадку й прибирає з переліку пропусків пару rust-shop / `exclude src/infra/store.rs`.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** змінюється семантика резолвінгу ID `external.<pkg>`. Для пакетів, оголошених у `package.json` чи `Cargo.toml`, K001 зникає навіть без імпорту, тож код виходу `check` у таких випадках змінюється з 1 на 0. Це несумісна зміна, її записують у «Несумісні зміни» spec. Форма знімка, карти й JSON `check` не змінюється. У format.md з'являється виняток монотонності для Python.

- [x] Мінімальна фікстура без `exclude` дає код 0. З `exclude: ["src/infra/db.ts"]` K001 для `external.pg` немає, `deny infra external` лишається `unverified` з `src/infra/db.ts:1:1`, код 0.
- [x] `allow infra external.nope` (пакета немає ні в імпортах, ні в маніфесті) дає K001, як і раніше, код 1.
- [x] rust-shop після `init --agents=none` з `exclude: ["src/infra/store.rs"]`: K001 для `external.serde` немає, код 0.
- [x] Регресія planned-external у тесті tests/cli.test.ts:1752. Додано проміжний крок: `stripe` є в `dependencies`, але імпорту немає. Результат — `unverified external.stripe: planned module` і `static unverified external.stripe: planned module, not implemented`, без K202 і K002. Після імпорту — K202, як і зараз.
- [x] Після `map` на мінімальній фікстурі з `exclude` ні `keylang/map/external.md`, ні вузли `.keylang/index.json` не містять `external.pg`.
- [x] semantics.md §6 пояснює, звідки беруться ID `external.<pkg>`: з імпортів, а для TS/JS і Rust — ще й з маніфестів. §7 додає до переліку винятків монотонності обмеження Python. Якщо 05 злито, `todo` цього випадку й пропуск rust-shop знято.
- [ ] `npm run typecheck` і `npm test` зелені. `node bin/keylang.js map` виконано, diff переглянуто, зокрема карту з поясненнями (`explain.map` увімкнено). `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/resolve.ts`, `src/imports.ts`, `src/rust-imports.ts`, `src/graph.ts`, `tests/core.test.ts`, `tests/cli.test.ts`, `docs/format.md`; за умови 05 — `tests/metamorphic.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 (src/declared-packages.ts, src/resolve.ts); tests/rules-area.test.ts («a declared package is not K001 when its only importer is excluded…», «…with no import anywhere…», «rust: serde declared in Cargo.toml…»), tests/cli.test.ts «planned module external.<pkg> is static ok only from the importing parent module» (крок зі `stripe` у dependencies без імпорту); docs/semantics.md §6 (рядок 421) і §7 (виняток Python); у metamorphic.test.ts пропусків rust-shop немає.
