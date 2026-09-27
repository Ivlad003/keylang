import { writeFileSync } from "node:fs";

export function save(o: unknown): void {
  writeFileSync("orders.json", JSON.stringify(o));
}

export class Db {
  query(sql: string): string[] {
    return this.parse(sql);
  }

  private parse(sql: string): string[] {
    return sql.split(";");
  }
}
