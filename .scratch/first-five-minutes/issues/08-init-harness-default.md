# 08: Чи `init` пише харнес-файли за замовчуванням

**Status:** needs-triage

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §3 рядок 3, §8.

**What to build:** Зараз `init` без `--agents` (`src/cli.ts:88-96`, `:1961-2033`; ADR 0005) робить таке:

- пише `keylang.json`, карту, `rules.baseline.md` і рядок `.keylang/` у `.gitignore`;
- **завжди** пише керований блок у `AGENTS.md`;
- знайшовши `.claude/`, `.codex/`, `.cursor/` чи `opencode.json`, ще й MCP-конфіг, skill, deny-правила і Stop-hook.

Людина, яка лише хоче подивитися на свій репозиторій, отримує зміни у файлах свого агента. Можливо, вона цього не чекала й не помітить у diff. Водночас для ролі «паркан для агентів» це і є цінність: одна команда — і агент уже під наглядом.

## Що має вирішити людина

1. **(а) Розділити.** `init` пише лише `keylang.json`, карту, baseline і `.gitignore`. Харнес — явно: `keylang agents` або `init --agents=claude,…`. Підсумок `init` (тікет 02) називає `keylang agents` наступним кроком для тих, хто працює з агентом. Несумісна зміна: `llm.txt` (крок 2–3), курс (урок 02, `existing/01`), ADR 0005 — оновити; тест `init` без `--agents` більше не бачить `AGENTS.md`.
2. **(б) Лишити як є,** але підсумок `init` (тікет 02) прямо перелічує файли харнесу, які він змінив, і як їх прибрати (`keylang agents --agents=none`).
3. **(в) Питати.** У TTY `init` питає «Install agent files for Claude Code? [Y/n]» для кожного знайденого харнесу; без TTY поводиться як (б). Найдорожчий варіант: інтерактив у CLI, якого зараз немає.

**Рекомендація:** (б) зараз, бо це дешево й без зміни контракту. До (а) повернутися за результатами проби з людьми (design-v0.2/28).

- [ ] рішення записане тут
- [ ] для (а) або (в): окремий тікет `ready-for-agent` з критеріями, оновлення `llm.txt`, курсу й ADR 0005
- [ ] для (б): пункт додано до критеріїв тікета 02

Ключові файли: `src/cli.ts`, `src/harness.ts`, `src/operations/generate.ts` (`runInit`), `llm.txt`, `docs/adr/0005-harness-integration.md`, `docs/course/02-install-and-check.md`

## Comments
