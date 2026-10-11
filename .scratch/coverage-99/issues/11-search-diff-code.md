# 11: Пошук: git diff і текст коду

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 09

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [spec](../spec.md)

**What to build:** `--diff [base]`: hunk-и `gitChangedLines` як документи `diff-hunk` (не кешуються); `--kind code`: лінійний скан файлів маніфесту з відповіддю `file:line` і вузлом-власником (найглибша fn). Без git — `--diff` дає 2 з причиною.

- [ ] тест на тимчасовому git-репо: змінений рядок знаходиться
- [ ] код знаходиться з власником-fn

## Comments
