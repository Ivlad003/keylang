# 27: DX-команди: `doctor`, `hook install`, `check --changed`, `new`, `completions`

**Етап:** M3 · **Джерело:** design §7.5

**What to build:** `keylang doctor` показує мови, граматики, кеш, ключі API, термінал; `keylang hook install` ставить pre-commit із `check --changed`, де `--changed` включає також залежні правила, символи та flows; `keylang new flow <name>` і `new module <name> --layer <l>` створюють заготовки; `keylang completions <shell>`. Кожна команда — окремий маленький зріз; тікет можна розбити після тріажу.

**Blocked by:** 23

**Status:** needs-triage

- [ ] `--changed` на фікстурі: зміна одного файла перевіряє правила, що його стосуються, і flows, де згадано його символи
- [ ] `hook install` не перезаписує чужий pre-commit без підтвердження
- [ ] `doctor` працює офлайн і без ключів (показує «not configured»)
- [ ] усі команди в `--help`, некоректний виклик — код 2
