# 09: Хук `Stop` для Claude, Codex, Cursor

**Джерело:** spec Q14; ADR 0005 наслідки

**What to build:** `init`/`agents` реєструє хук кінця ходу: `.claude/settings.json` (`hooks.Stop`; Cursor імпортує звідти) і `.codex/hooks.json`. Хук викликає `npx -y keylang@<version> hook stop` — тонку команду, що читає JSON події зі stdin, запускає `check --changed` і при нових `fail` виводить `{"decision":"block","reason":…}` з діагностиками (стисло, з файлом і рядком). Якщо подія має `stop_hook_active: true` — не блокує. Без нових `fail` — exit 0 з валідним JSON (вимога Codex). Хук ніколи не пише файлів.

**Blocked by:** 07, 08

**Status:** resolved

- [x] фікстура події Claude з порушенням → `decision: block` і діагностика в `reason`
- [x] та сама подія з `stop_hook_active` → не блокує
- [x] без порушень → exit 0, stdout — валідний JSON
- [x] наявні хуки в `.claude/settings.json` зберігаються

Ключові файли: `src/cli.ts`, модуль адаптерів

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1; `src/cli.ts` (`hook stop`), `src/harness.ts`; tests/cli.test.ts «check --changed filters to the touched files; hook stop blocks once and writes nothing», «agents: MCP servers, skill copies, Claude deny…» (PostToolUse зберігається, `hooks.Stop` і `.codex/hooks.json`).
