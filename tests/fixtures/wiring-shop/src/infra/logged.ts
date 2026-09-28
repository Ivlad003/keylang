import { log, type Db } from "./db.ts";

export function logged(inner: Db): Db {
  return { query: (sql) => (log.push(`query ${sql}`), inner.query(sql)), dispose: () => inner.dispose() };
}
