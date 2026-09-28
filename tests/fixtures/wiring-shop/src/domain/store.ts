import { log, type Db } from "../infra/db.ts";

export class Store {
  private readonly db: Db;

  constructor({ db }: { db: Db }) {
    log.push("init store");
    this.db = db;
  }

  save(): string {
    return this.db.query("insert");
  }
}
