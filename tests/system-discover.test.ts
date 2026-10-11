// The tables of the system of the code (system-design/07): a Prisma schema
// (models, `@id`, `@unique`, `?`, `@relation`, `@@map`, `@@index`) and SQL
// migrations (`CREATE TABLE` with keys, `NOT NULL`, `UNIQUE`, `REFERENCES`
// and `FOREIGN KEY`, `CREATE INDEX`) under the data store of their
// technology; a file that does not parse is named, not an error; files under
// `node_modules` and `outside` are not read. Through the real CLI.

import assert from "node:assert/strict";
import { test } from "node:test";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { SHOP } from "./system-fixture.ts";

const PRISMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  links Link[]
}

model Link {
  id      Int     @id
  code    String
  owner   User?   @relation(fields: [ownerId], references: [id])
  ownerId Int?

  @@index([code])
  @@map("links")
}
`;

const SQL = `CREATE TABLE clicks (
  id bigserial PRIMARY KEY,
  link_id integer NOT NULL REFERENCES links (id),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily (
  day date NOT NULL,
  link_id integer NOT NULL,
  total integer,
  PRIMARY KEY (day, link_id),
  CONSTRAINT daily_link FOREIGN KEY (link_id) REFERENCES links (id)
);
CREATE UNIQUE INDEX clicks_at ON clicks (link_id, at);
INSERT INTO daily VALUES ('2026-01-01', 1, 0);
`;

test("system discover: tables of a Prisma schema and of SQL migrations under the database the code talks to; an unreadable file is named; node_modules and outside are not read", (t) => {
  const dir = tempDir(t, "keylang-system-schema-");
  const { "keylang/system/shortener.md": _hand, ...code } = SHOP;
  writeTree(dir, {
    ...code,
    "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], infra: ["src/infra/**"], worker: ["src/worker/**"] }, outside: ["scripts/**"] })}\n`,
    "prisma/schema.prisma": PRISMA,
    "db/migrations/001_clicks.sql": SQL,
    "db/migrations/002_mysql.sql": "CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;\n",
    "node_modules/x/schema.sql": "CREATE TABLE vendored (id int);\n",
    "scripts/seed.sql": "CREATE TABLE seeding (id int);\n",
  });
  const found = keylang(dir, ["system", "discover", "shop"]);
  assert.equal(found.status, 0, found.stderr);
  const store = found.stdout.slice(found.stdout.indexOf("- db postgres postgres"), found.stdout.indexOf("- sequence"));
  assert.equal(
    store,
    [
      "- db postgres postgres",
      "  - table clicks",
      "    - id bigserial pk",
      "    - link_id integer fk links.id",
      "    - at timestamptz",
      "    - index link_id, at unique",
      "  - table daily",
      "    - day date pk",
      "    - link_id integer pk fk links.id",
      "    - total integer null",
      "  - table User",
      "    - id Int pk",
      "    - email String unique",
      "  - table links",
      "    - id Int pk",
      "    - code String",
      "    - ownerId Int null fk User.id",
      "    - index code",
      "",
    ].join("\n"),
  );
  assert.match(found.stdout, /<!-- not read: db\/migrations\/002_mysql\.sql: /);
  assert.doesNotMatch(found.stdout, /vendored|seeding/);
  // Adopted, the tables check: every foreign key names a table and column the system has.
  writeTree(dir, { "keylang/system/shop.md": found.stdout });
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
});
