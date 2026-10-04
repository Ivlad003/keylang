# 08: `check --changed`

**Джерело:** design §7.5 «CI та хуки»; spec Q14

**What to build:** `check --changed [--since <ref>]` (за замовчуванням — робоче дерево відносно `HEAD` плюс невідстежені файли) звітує лише вердикти й діагностики, що зачіпають змінені файли: правила, чия область містить змінений модуль, потоки з кроками в змінених файлах, змінені специфікації. Аналіз повний (кеш фактів), фільтрується звіт. Без git — код 2. Мета — вивід для хука без шуму від старих `unverified`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] зміна одного модуля — у звіті лише пов'язані правила й потоки
- [x] змінена специфікація — повний звіт по ній
- [x] коди виходу як у `check`; `--help` оновлено

Ключові файли: `src/cli.ts`, `src/check-results.ts`; git через масив аргументів

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 88a9ac1, 6f75435, 98a8e81; `src/changed.ts`, `src/git-changes.ts`; tests/cli.test.ts «check --changed filters to the touched files…», «…in a repository without commits…», «…K001 when the step's source file was deleted»; `--help` описує `--changed`/`--since`.
