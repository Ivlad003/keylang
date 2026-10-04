# Агент-CLI, залежності з package.json і hybrid spec-to-code

**Мета (користувач, 2026-09-29).** Кодо-агенти (Cursor CLI, Claude Code, opencode, Codex) допомагають у підказках і доповненні, пишуть за промтом, а `spec-to-code` у режимі hybrid бере згенерований keylang каркас і дописує до готового коду. У TUI як IDE є доповнення залежностей бібліотек із `package.json` (пакети й npm-символи) та авто-імпорт залежності.

**Рішення користувача** — `decisions.md`. Повний план з анкерами файлів і контрактами — `plan.md` (кроки 1–10 відповідають тікетам 01–10). Дизайни зрізів, їх ворожі рев'ю та дослідницькі звіти — `design/`.

**Робоче дерево.** Гілка `feat/agent-completion` у worktree `../keylang-agent-completion` (node_modules — symlink на основний репо). Основне дерево з WIP користувача не чіпати. ADR 0008 зайнято; нові — 0009–0012.

**Ключові контракти.**
- `agent` у `keylang.json` приймає `cli:<name>[:<model>]`; пріоритет `KEYLANG_AGENT` > `~/.config/keylang/agents.json` `"use"` > `keylang.json`.
- Авто-імпорт = `- planned module external.<seg>` на початку поточного потоку, лише коли пакет оголошений, не імпортований кодом і ще не `planned`.
- Індекс символів npm — лише порада для доповнення і сигнатур; вердикти від нього не залежать; член оголошеного пакета — `unverified`, не K001.
- `spec-to-code` за замовчуванням лишається `algo`; hybrid явно (`--mode hybrid`, `Ctrl+Space` на `planned fn` у TUI).
- Клавіші TUI: `a` — промт агенту, `Ctrl+Space` на нереалізованому `planned fn` — побудова коду, `Ctrl+X` — скасування.

**Граф тікетів.** 01 → 02; 03 → 04 → 05; 03 → 06; 05+06 → 07; 02+03 → 08 → 09 → 10. Фронтир: 01 і 03.

<!-- shiftwork:tickets:start -->
| NN | title | status | last route |
| -- | ----- | ------ | ---------- |
| 01 | Скасування запитів до моделі; ghost перериває застарілі | needs-info | opencode-go/glm-5.3 |
| 02 | Агент-CLI як провайдер моделі (`cli:*`) | ready-for-agent |  |
| 03 | Оголошені пакети з `package.json`, спільні external-ID, межі маніфестів | claimed |  |
| 04 | Вердикти для членів оголошених і `planned` пакетів; K202 для external | ready-for-agent |  |
| 05 | Доповнення залежностей і авто-`planned` (LSP і TUI) | ready-for-agent |  |
| 06 | Індекс символів npm у LSP | ready-for-agent |  |
| 07 | Символи npm у TUI та web | ready-for-agent |  |
| 08 | `spec-to-code --mode hybrid` (CLI) | ready-for-agent |  |
| 09 | TUI: побудова коду з `planned fn`, роботи агента, скасування | ready-for-agent |  |
| 10 | Потік із промту в TUI | ready-for-agent |  |
<!-- shiftwork:tickets:end -->
