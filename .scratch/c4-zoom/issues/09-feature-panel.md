# 09: Панель фічі у `F3`: сходинка, дірки, питання; команда «Що бракує»

**Джерело:** spec §4.2 B5; research-c4-zoom-literature §7 (Horvitz 1999, McFarlane, Iqbal & Bailey, Pu et al.), §9 п. 10–12

**What to build:** Коли в редакторі відкрито `keylang/features/*.md`, панель `F3` показує: сходинку (`idea → behavior → structure → ready → done` з підсвіченою поточною), список дірок з тікета 05, згрупований за сходинками, і лічильник відкритих `?`-питань; `Enter` на дірці ставить курсор на її рядок. Панель оновлюється після збереження, не під час набору. У палітрі дія «Feature: what is missing» (aliases `gaps`, `what's missing`, `next step`) показує те саме для файла під курсором і, коли налаштовано модель, пункт «Ask the model for questions» — одноразовий запит, що повертає до 5 питань як пропозицію рядків `- ? …` через MERGE (нічого не пише напряму). Жодних спливаючих підказок, таймерів чи персонажа; ghost-текст не змінюється. Рядок стану показує `agent: <provider>` і `questions: n`, коли файл фічі активний.

**Blocked by:** 05

**Type:** code

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test`

- [ ] vt-тест: відкрити файл фічі зі сходинкою `behavior` → `F3` показує сходинку, дірки, лічильник питань; `Enter` на дірці → курсор на рядку
- [ ] збереження файла з новим `planned` оновлює сходинку на `structure`
- [ ] палітра «Feature: what is missing» на не-фічі → повідомлення, стан без змін
- [ ] з мок-провайдером «Ask the model for questions» → пропозиція з рядками `- ? …`, MERGE, файл до прийняття не змінений
- [ ] web.test.ts: панель через WebSocket
- [ ] tools.md §TUI, tui-workspace.md §2 і SKILL.md описують панель і дію

## Comments
