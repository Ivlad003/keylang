# 07: ER зі схем Prisma і SQL

**Status:** resolved

**Type:** code

**Blocked by:** 06

**Verify:** `node --test tests/system-discover.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р14, §5

**What to build:** `src/schema-discover.ts`: `schema.prisma` через `@mrleebo/prisma-ast`, `CREATE TABLE` у `*.sql` через `node-sql-parser` → таблиці під компонентом `db` системи `@code`. Файли читаються з дерева репозиторію (без `node_modules`, з урахуванням `exclude`/`outside`); файл, що не розібрався, — рядок у `reason`.

- [x] Prisma: моделі, `@id`, `@unique`, `?`, `@relation` → FK
- [x] SQL: колонки, PK, UNIQUE, NOT NULL, REFERENCES і FOREIGN KEY
- [x] `view=er&name=@code` дає ці таблиці

## Comments

### Notes

- 2026-10-11: `src/schema-discover.ts`: `prismaTables`, `sqlTables`, `readSchemas`, `codeSchemas` (раз на аналіз, лише на запит; файли схем — у штампі кешу `web`). Замість `node-sql-parser` (89 МБ) — `pgsql-ast-parser` (spec Р14). У worker-збірці голі `fs`/`path`/`os` пакетів отримують ті самі шими.
- 2026-10-11: Тести: `tests/system-discover.test.ts` (Prisma, SQL, нерозібраний MySQL-файл, `node_modules` і `outside` пропущено).
