<!-- keylang:generated — не редагувати, `keylang map` -->

# map

- infra
  - module [db](src/infra/db.ts#L1)
    - node external.node
    - fn [save](src/infra/db.ts#L3) (o: unknown) → void
    - module [Db](src/infra/db.ts#L7)
      - fn [query](src/infra/db.ts#L8) (sql: string) → string[]
        - calls infra.db.Db.parse
      - fn [parse](src/infra/db.ts#L12) (sql: string) → string[] <!-- internal -->
