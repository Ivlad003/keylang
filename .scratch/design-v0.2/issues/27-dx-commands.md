# 27: DX-команди: `doctor`, `hook install`, `check --changed`, `new`, `completions`

**Етап:** M3 · **Джерело:** design §7.5

**What to build:** `keylang doctor` показує мови, граматики, кеш, ключі API, термінал; `keylang hook install` ставить pre-commit із `check --changed`, де `--changed` включає також залежні правила, символи та flows; `keylang new flow <name>` і `new module <name> --layer <l>` створюють заготовки; `keylang completions <shell>`. Кожна команда — окремий маленький зріз; тікет можна розбити після тріажу.

**Blocked by:** 23

**Status:** resolved

- [x] `--changed` на фікстурі: зміна одного файла перевіряє правила, що його стосуються, і flows, де згадано його символи
- [x] `hook install` не перезаписує чужий pre-commit без підтвердження
- [x] `doctor` працює офлайн і без ключів (показує «not configured»)
- [x] усі команди в `--help`, некоректний виклик — код 2

## Comments

- 2026-10-04 — реалізовано `hook install [--check]`, `new flow <name>`, `new module <name> --layer <layer>`, `completions bash|zsh|fish` (`src/cli.ts`, `src/git-hook.ts`, `src/completions.ts`); документація — `docs/tools.md#agents`, таблиця команд; з дорожньої карти `docs/format.md` прибрано.
  - `--changed` уже мав потрібну семантику (`src/changed.ts`: правила, чия область містить змінений модуль; flows із кроком у зміненому файлі); додано CLI-тест на flow з незміненої специфікації. Транзитивних залежних (модулі, що імпортують змінений файл) `--changed` не додає — це не входило в критерії.
  - `doctor` офлайн і без ключів пише `agent: not configured` (покрито наявними тестами в `tests/operations.test.ts`, `tests/explain.test.ts`). Рядків про граматики, кеш і термінал ще немає: це зміна спільного `DoctorPayload` (TUI теж його показує), лишено в дорожній карті `docs/format.md`.
  - Припущення: хук виконує `npx -y keylang@<версія> check --changed`, як хуки харнесів; тека — `git rev-parse --git-path hooks` з кореня робочого дерева; файл хука належить keylang цілком (маркер `keylang:pre-commit`), чужий — код 2 без запису, а не дописування блоку.
  - Припущення: `new module` пише файл фічі `<dir>/features/<name>.md` з `# flow <name>` і `- planned module <layer>.<name>` — модуль без коду в форматі можна записати лише наміром у секції flow. Відкрите питання: чи потрібен окремий вид рукописної декларації модуля (не `planned`), і чи ім'я потоку `<name>` не конфліктуватиме з `new flow <name>` (K002 на однакових іменах).
  - `completions`: команди й підкоманди виводяться з `--help`, прапорці — з таблиці `parseArgs` (без розбивки прапорців за командами).
- 2026-10-04 — роботу перервано на прохання людини до кінця повного `npm test`: критерії реалізовано, але гейт Verify не пройдено. Далі — прогнати Verify на гілці `wip/design-v0.2-27` і, якщо зелене, поставити `resolved` і злити (див. `.scratch/HANDOFF-2026-10-04.md`).
- 2026-10-04 — перевірено на `done/design-v0.2-27` (rebase на master): `npm run typecheck` — 0; `npm test` — 591 тест, 590 pass, 0 fail, 1 skipped; `node bin/keylang.js map --check` — 0 (карта актуальна); `node bin/keylang.js check` — 0 fail, 24 unverified, 47 ok; `--help` перелічує `hook install [--check]`, `new flow`, `new module`, `completions`. Окремих команд `**Verify:**` у тікеті немає.
  - Рішення щодо відкритого питання `new module`: лишаємо `planned module <layer>.<name>` у файлі фічі — окремий вид рукописної декларації модуля змінив би семантику мови, а тікет просить лише заготовку. Конфлікт імені потоку з `new flow <name>` не блокуємо: це звичайний K002 (format.md, Р3); у `docs/tools.md` дописано, що ім'я потоку в заготовці можна перейменувати, `planned module` від нього не залежить.
  - `doctor` без рядків про граматики/кеш/термінал лишається в дорожній карті `docs/format.md` (критерій тікета — офлайн і «not configured» — виконано).
