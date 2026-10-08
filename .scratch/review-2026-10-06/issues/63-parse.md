# 63: `parse` мовчки показує нечитабельний файл як порожній документ і виходить з кодом 0

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `core`, верифікація: confirmed.

**Місце:** `src/cli.ts:1220` (рецензент указав `src/operations/spec.ts:348`)

## Що не так

`runParse` при помилці читання кладе файл у `unreadable` і розбирає `""` як порожній документ. Повідомлення не додається, код виходу від цього не залежить, а `cmdParse` поле `payload.unreadable` не друкує. Для порівняння, `fmt` на тому самому файлі каже `cannot read` і виходить з кодом 2, `check` теж дає код 2.

## Сценарій збою

keylang/b.md з правами 000. `keylang parse keylang` друкує `keylang/b.md` без секцій, у stderr нічого немає, exit 0. Агент, що перевіряє синтаксис специфікацій через `parse`, бачить «валідний порожній файл» замість помилки I/O.

## Як відтворити

Фікстура scratchpad/review/core/unread: keylang/a.md (`# rules` / `- deny a b`), keylang/b.md (`# flow x` / `- step y.z`), `chmod 000 keylang/b.md`. `node bin/keylang.js parse keylang` → дерево a.md, далі рядок `keylang/b.md` без вмісту; exit 0. Для порівняння `check` на нечитабельному rules.md → `EACCES ...`, exit 2.

Доказ верифікатора:

> I reproduced this in scratchpad/verify/core-2-0 as uid 1000, with HOME and XDG_* pointed at the scratch dir. The fixture is keylang/a.md (`# rules` / `- deny a b`) and keylang/b.md (`# flow x` / `- step y.z`), with `chmod 000 keylang/b.md`.
> 
> - `node .../bin/keylang.js parse keylang` prints the tree for a.md and then a bare line `keylang/b.md`. It exits 0 with nothing on stderr.
> - `parse keylang/b.md` prints `keylang/b.md` with empty stderr and exits 0.
> - `parse --json keylang/b.md` prints `{"path":"keylang/b.md","generated":null,"sections":[],"diagnostics":[]}` and exits 0.
> - For comparison, `fmt --check keylang` prints `keylang/b.md: cannot read: EACCES: permission denied, open '...'` and exits 2.
> - `check keylang/b.md` prints `keylang: EACCES: permission denied, open ...` and exits 2.
> 
> Code path: in src/operations/spec.ts:345-349, `runParse` catches the readFileSync error, pushes the file to `unreadable` and parses `""`. No message is added, and the exit code depends only on diagnostics (line 363). `cmdParse` in src/cli.ts:1215-1224 prints `payload.skipped`, `payload.text` and the diagnostics, but never `payload.unreadable`.
> 
> The empty parse itself is intended. The comment on `ParsePayload.unreadable` in types.ts:861 says "each is parsed as empty text, as the CLI always did". The TUI (tui/reports/check.ts:222) shows each such file as an ERROR row: "cannot be read; parsed as empty text, as the CLI does". So the operation layer knows about the failure and the TUI reports it, but the CLI drops it without a word.
> 
> This conflicts with the global `--help` exit-code contract, "2 usage or I/O error", and with how `fmt` and `check` handle unreadable files. docs/cli.md lists only "0, 1, 2" for parse and does not describe unreadable files.
> 
> This is not a known item in docs/review-2026-10-05.md: grep finds no unreadable/EACCES entry for parse there, and no test in tests/ covers parse with unreadable files.
> 
> On severity: the parse-as-empty choice is deliberate and `parse` is a diagnostic command, not the main check. The real defect is the missing stderr note and the exit code, so P3 holds. P2 could be argued from the "2 … I/O error" line in `--help`.

## Що зробити

- У runParse додавати повідомлення `error` `<file>: cannot read: <причина>` і повертати код 2 (як fmt/check), а в cmdParse друкувати payload.unreadable у stderr; синхронізувати коментар ParsePayload і рядок TUI.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/cli.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `parse names a spec it cannot read on stderr and exits 2…` у tests/cli-language.test.ts (справжній CLI, keylang/b.md з правами 000; пропускається під root) падав на старому коді: exit 0, stderr порожній. Виправлення: `runParse` (src/operations/spec.ts) додає повідомлення `error` `<file>: cannot read: <причина>` і повертає код 2, коли хоч один файл не прочитано (файл, як і раніше, розбирається як порожній текст, решта — як звичайно); `cmdParse` (src/cli.ts) друкує `keylang: <file>: cannot read: …` у stderr; коментар `ParsePayload.unreadable` у src/operations/types.ts синхронізовано. Рядок TUI у src/tui/reports/check.ts (`parsed as empty text, as the CLI does`) не чіпав — src/tui/* редагує інший агент; він лишається правдивим (CLI теж розбирає файл як порожній), а підсумок TUI тепер бачить код 2. docs/cli.md (таблиця команд) оновлено. `node --test tests/cli-language.test.ts` — 16/16, `npm run typecheck` — чисто.
