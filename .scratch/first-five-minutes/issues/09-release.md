# 09: Реліз: npm 0.8.x і розширення VS Code

**Status:** ready-for-human

**Type:** docs

**Blocked by:** 01, 02, 03, 04, 05, 06, 07

**Verify:** `npm test` · `npm run typecheck` · `npm pack --dry-run`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §5 рядок 2, §3 рядок 13, §7 «Транш 3».

**What to build:** У `package.json` 0.8.0, у npm — 0.7.0 (опубліковано 2026-10-09). Новачок, що виконує `npx keylang init .`, отримує версію без змін цієї фічі. Розширення VS Code (`editors/vscode/`, `private: true`, 0.1.0) не опубліковане, і його треба збирати з вихідного коду.

Це дії людини: публікація, облікові записи, токени. Агент їх не виконує.

1. Після злиття 01–07: процедура з кінця `README.md` (чистий клон → `npm test && npm run typecheck` → `npm version minor` → `npm pack`, переглянути tarball → `npm publish`). Номер версії — 0.9.0, бо 01 і 03 містять несумісні зміни виводу; людина може вибрати інакше.
2. `CHANGELOG.md` — розділ `Unreleased` перейменувати на нову версію.
3. Розширення VS Code — вибрати: `.vsix` у GitHub Releases (без Marketplace) або публікація в Marketplace (потрібен publisher). У будь-якому разі зняти `private: true` і описати встановлення в `docs/mcp-lsp.md`.

- [ ] нову версію опубліковано в npm; `npx keylang@latest --help` показує коротку довідку з тікета 01
- [ ] `CHANGELOG.md` оновлено
- [ ] розширення VS Code доступне одним із двох способів, встановлення описано

Ключові файли: `package.json`, `CHANGELOG.md`, `editors/vscode/package.json`, `docs/mcp-lsp.md`

## Comments
