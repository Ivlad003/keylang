import { log, type Db } from "./db.ts";

export function createMemoryDb(): Db {
  log.push("init memory db");
  return { query: (sql) => `mem(${sql})`, dispose: () => void log.push("dispose memory db") };
}
