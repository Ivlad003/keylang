export interface Db {
  query(sql: string): string;
  dispose(): void;
}

export const log: string[] = [];

export async function createDb(): Promise<Db> {
  log.push("init db");
  return { query: (sql) => `pg(${sql})`, dispose: () => void log.push("dispose db") };
}
