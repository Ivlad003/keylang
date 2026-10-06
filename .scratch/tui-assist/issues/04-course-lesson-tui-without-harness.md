# 04: Урок курсу «TUI без харнеса»

**Status:** needs-info

**Type:** docs

**Blocked by:** 01, 02, 03

**Verify:** `test -s docs/course/09-tui-without-harness.md` · `test -s docs/course/uk/09-tui-without-harness.md` · `grep -q '09-tui-without-harness.md' docs/course/README.md` · `grep -q '09-tui-without-harness.md' docs/course/uk/README.md` · `grep -q 'Ctrl+Space' docs/course/09-tui-without-harness.md` · `grep -q 'Ctrl+R' docs/course/uk/09-tui-without-harness.md`

**Джерело:** spec §4.5, П5; [ADR 0019](../../../docs/adr/0019-tui-assistant-without-harness.md) п. 3; урок 7 курсу (`docs/course/07-tools.md`, `docs/course/uk/07-tools.md`); `docs/tools.md` (TUI)

**What to build:** Окремий урок англійською й українською для людини, яка працює в `keylang` чи `keylang web` без харнеса. Урок вчить усього контуру вбудованого агента одним текстом. Стиль, рівень і формат — як у переписаному курсі; шляхи у Verify — типові й підлягають уточненню (див. Notes).

- [ ] урок є англійською й українською. Таблиці уроків у `docs/course/README.md` і `docs/course/uk/README.md` мають на нього рядок, а урок 7 на нього посилається
- [ ] налаштування моделі: `agent` у `keylang.json`, `KEYLANG_AGENT`, агент-CLI `cli:<name>`, `keylang doctor`. Що працює без моделі: доповнення, `Ctrl+G`, algo-чернетки
- [ ] наскрізний сценарій на прикладі з репозиторію: ідея → файл фічі → `Ctrl+Space` → MERGE → стадія у `F6` → правила через `Ctrl+Space` → MERGE → `check`
- [ ] помічники: ghost (`Tab`, `Alt+]`, `Esc`) і `Ctrl+G`. Голос: опційні пакети й команда з `doctor`, `keylang web`, голос у формах
- [ ] межі (spec §3): модель лише пропонує, вердикт від неї не залежить. Код пише харнес або людина, а `spec-to-code` моделі дає лише пропозицію
- [ ] кожен фрагмент keylang уроку розбирається: блок записано в тимчасовий `.md` і перевірено `node bin/keylang.js parse` без помилок. Клавіші й назви дій збігаються з `?` і `docs/tools.md`
- [ ] скриншоти, якщо урок їх має, зняті з `keylang web` на поточному коді

## Comments

### Notes

- 2026-10-06 (тікет написано): статус `needs-info`, бо курс зараз переписує інша сесія в робочому дереві `master`, і цей тікет чекає її коміту. Після коміту людина:
  1. звіряє місце уроку з новою структурою курсу: номер, каталог, шляхи у Verify;
  2. ставить `ready-for-agent`.

  `Blocked by` 01–03 лишається: урок вчить реалізованої поведінки (П5).
