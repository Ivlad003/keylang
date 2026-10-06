# 01: Завантаження `typescript` з репозиторію; версія в manifest і `snapshotId`

**Status:** needs-info

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `node --test tests/ts-semantic-load.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

**Джерело:** spec §4.1, §6, §7; [ADR 0020](../../../docs/adr/0020-typescript-semantic-backend.md) п. 1, 4, 7 і відкриті питання 1–3

**What to build:** Перший зріз backend-а — без нових ребер. keylang знаходить `typescript` аналізованого репозиторію, завантажує його й записує версію в знімок.

- **Адаптер у шарі `extract`** (наприклад `src/extract/ts-program.ts`). Він розв'язує `typescript` через `createRequire` від кореня репозиторію й перевіряє, що модуль має `createProgram` і `version`. Опції компілятора бере з кореневого `tsconfig.json` або `jsconfig.json` (без них — типові з `allowJs`). Повертає завантажений модуль із версією й опціями або причину, чому backend вимкнено: пакета немає, `require` кинув помилку, немає API, зламаний `tsconfig`.
- **Знімок.** Manifest отримує поле backend-а: `{ typescript: <версія> | null, options: <sha256 опцій> | null }`. Воно входить у `snapshotId`, `SNAPSHOT_SCHEMA` стає 8.
- **`doctor`** друкує рядок `typescript`: версію й шлях або причину.
- **Межі шарів:** `keylang/rules.md` отримує `deny lang external.typescript`, `deny check external.typescript` і `deny base external.typescript`. Тип модуля TypeScript береться через `import type`, а значення — динамічно з репозиторію.
- **Відповідь на відкрите питання 1 ADR 0020.** Якщо автор обрав вимикач чи вимогу (`keylang.json` або змінна середовища), тікет реалізує й їх: валідацію поля, код 2 для `require` без пакета, `--help`, format.md.

- [ ] відповідь автора на відкрите питання 1 записано в ADR 0020 і в Notes нижче. Без неї тікет не починають: через це його статус `needs-info`
- [ ] тести тікета — у новому файлі `tests/ts-semantic-load.test.ts`: Verify запускає його окремо
- [ ] фікстура без `typescript` у тимчасовому каталозі: manifest має `typescript: null`, а два `map` поспіль дають той самий `snapshotId`. Вердикти `check` не змінилися. Пакет keylang не підхопився, хоча keylang має `typescript` у власних `node_modules`
- [ ] фікстура з `node_modules/typescript` — посиланням на devDependency keylang: manifest має її версію, і `snapshotId` інший, ніж без пакета. Заглушка з іншою `version` дає інший `snapshotId`, та сама заглушка двічі — той самий
- [ ] заглушка, чий `main` кидає помилку, і заглушка без `createProgram` вимикають backend: `doctor` називає причину, коди виходу `check` і `map` не змінюються. Зламаний `tsconfig.json` теж вимикає backend із причиною і не дає коду 2
- [ ] `doctor` друкує рядок `typescript` в обох станах (тест через CLI)
- [ ] `keylang/rules.md` має три нові `deny`, а `node bin/keylang.js check --strict` дає 0. Карту keylang перегенеровано, diff переглянуто
- [ ] snapshot.md §11: рядок `manifest`, номер схеми 8, перелік входів `snapshotId`. tools.md: `doctor`

## Comments

### Notes

- 2026-10-06 (тікет написано): `needs-info` до відповіді автора на відкрите питання 1 ADR 0020: поле `"typescript": "auto" | "off" | "require"` у `keylang.json`, змінна середовища чи нічого. Це зміна формату конфігурації, і від неї залежать безпека (код із `node_modules` репозиторію) та однаковість знімка в CI. Уся фіча стоїть на паузі (`spec.md`, `**Status:** paused`) до релізу 0.6.0.
