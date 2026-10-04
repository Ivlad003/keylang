# 29: Модель: прогалини залежностей і `unverified` правил

**Джерело:** research-pl §5 Р-3 і Р-4; знахідка 2; рішення Q6, Q7 (spec)

**What to build:** Модель 27–28 і Datalog у format.md §7 описують, коли правило стає `unverified`. Після цього модель сама гарантує властивість монотонності з Q6 (метаморфний тест 05): менше інформації переводить `ok`/`fail` лише в `unverified` і ніколи не міняє `ok` на `fail` чи навпаки.

Генератор додає нерозв'язані імпорти (`import { z } from "./missing.ts"`) і `exclude` для 0–1 файла.

Datalog визначає:
- **`hole(U)`** — прогалина рівня залежностей у файлі-модулі. Це записи покриття з `DEPENDENCY_HOLES` (src/rules.ts:386: `unresolved-import`, `parse-error`, `unsupported`, `skipped-file`, `unassigned-file`), крім причини «unsupported construct `computed call`» і `unsupported` усередині однієї декларації (rules.ts:147-159). Діють і поправки 07: сам запис `unassigned-file` прогалиною для порядку `layers` не є;
- **`area(R, U)`** для кожного виду правила:
  - `deny` — файли-модулі області джерела;
  - `layers` — модулі всіх шарів зв'язного часткового порядку рядка й шарів поза порядком (Q6, 07);
  - `no-cycles` під модулем — модуль, його підмодулі й модулі, досяжні з них import/re-export-ребрами (Q6, 06); глобальне — усі модулі;
  - `entry` — досяжні модулі;
- **`unverified(R) :- not fail(R), area(R, U), hole(U).`** Для `entry` недосяжний модуль при прогалині серед досяжних отримує `unverified` «not reached, but … may reach it» замість K103.

`external.<pkg>`, чий єдиний імпортер виключено, модель трактує за 08 (Q7): пакет відомий із маніфесту лише для резолвінгу K001, нового вузла у знімку немає. Щоб цей виняток перевірявся, генератор додає імпорт пакета, оголошеного в `package.json` фікстури, і правило `allow|deny <шар> external.<pkg>`.

Тек, які не вдалося прочитати, генератор не створює: для цього потрібні chmod і пропуск тесту під root, а випадок уже покриває tests/core.test.ts:500.

Розбіжність моделі з CLI оформлюється, як у 27: мінімальна фікстура й окремий тікет, `src/` не змінюється.

**Blocked by:** 28 (модель layers/entry/no-cycles), 06 (прогалина no-cycles під модулем), 07 (область layers), 08 (`external.<pkg>` під непрозорим імпортером)

**Status:** resolved

**Контракт:** немає: документація й тест.

- [ ] `KEYLANG_MODEL_RUNS=500 node --test tests/rules-model.test.ts` на випадках із прогалинами проходить без розбіжностей. Типовий `npm test` лишається в частці 27–29 (≤ ~7 с разом), N не зростає.
- [x] `unverified` моделі збігається з CLI за вердиктом і за файлом прогалини в evidence. Якщо прогалин в області кілька, береться перша за відсортованим ID модуля, як у `holeAmong` (rules.ts:162).
- [x] `exclude` єдиного імпортера пакета не дає K001 для `external.<pkg>` ні в моделі, ні в CLI.
- [x] На згенерованому випадку з прогалиною й без порушень `check` дає код 0, а `check --strict` — 1.
- [x] Datalog у format.md §7 описує `hole` і `area` для кожного виду правила. Якщо 05 злито, його нормативне речення про монотонність посилається на них.
- [ ] `npm run typecheck` і `npm test` зелені, `src/` не змінено.

Ключові файли: `tests/rules-model.test.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; tests/rules-model.test.ts (unresolved `./missing.ts`, exclude, external.left-pad, «a dependency hole without a violation is exit 0 and strict exit 1», «excluding the only importer of a declared package is not K001»), format.md §7 `hole`/`area`/`unverified`; прогін файлу — 6 pass. Бюджет часу — див. коментар 27.
