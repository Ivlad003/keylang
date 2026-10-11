// `check` of a `# system` (system-design/02): local names (K401, K402,
// K002), the `system` verdicts of relations from code-bound components — a
// driver import reached through the repository's own modules is `ok`, no such
// import `unverified`, an unbound component no verdict — and K403 for a
// driver the bound code reaches that no relation names. Through the real CLI.

import assert from "node:assert/strict";
import { test } from "node:test";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const FILES = {
  "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], infra: ["src/infra/**"], worker: ["src/worker/**"] } })}\n`,
  "package.json": `${JSON.stringify({ name: "shop", dependencies: { pg: "8.0.0", ioredis: "5.0.0" } })}\n`,
  "src/app/links.ts": 'import { query } from "../infra/db.ts";\nexport function find(code: string): string {\n  return query(code);\n}\n',
  "src/infra/db.ts": 'import { Pool } from "pg";\nconst pool = new Pool();\nexport function query(sql: string): string {\n  return String(pool) + sql;\n}\n',
  "src/worker/clicks.ts": 'import Redis from "ioredis";\nexport function count(): number {\n  return new Redis() ? 1 : 0;\n}\n',
  "keylang/system/shop.md": `# system shop

- service api
  - code app
  - reads db SELECT
  - calls cache
  - calls worker
- service worker
  - code worker
- service batch
  - reads db
- db db postgres
  - table users
    - id bigint pk
  - table orders
    - user_id bigint fk users.uid
    - shop_id bigint fk shops.id
    - user_id text
- cache cache redis
- sequence buy
  - api → dbb query
`,
};

interface Json {
  results: { verdict: string; criterion: string; area: string; line: number; code: string | null; evidence?: string }[];
}

test("check of a system: K401/K402/K002 on names, ok and unverified for relations of bound code, none without code, K403 for an undeclared driver", (t) => {
  const dir = tempDir(t, "keylang-system-check-");
  writeTree(dir, FILES);
  const human = keylang(dir, ["check"]);
  assert.equal(human.status, 1, human.stdout + human.stderr);
  const lines = human.stdout.split("\n").filter((line) => line.startsWith("keylang/system/"));
  assert.deepEqual(lines, [
    "keylang/system/shop.md:8:11: K403 the code of `worker` imports `external.ioredis` (redis) in `worker.clicks`, but no relation of `worker` goes to a redis component",
    "keylang/system/shop.md:16:25: K402 `fk` names column `uid`, which table `users` does not have",
    "keylang/system/shop.md:17:25: K402 `fk` names table `shops`, which no data store of system `shop` has",
    "keylang/system/shop.md:18:7: K002 duplicate column `user_id` of table `orders` (first declared at keylang/system/shop.md:16:7)",
    "keylang/system/shop.md:21:11: K401 unknown component `dbb` in the message of system `shop` (did you mean `db`?)",
    "keylang/system/shop.md:6:3: unverified api calls cache: no import from the code of `api` reaches a redis client (`external.redis`, `external.ioredis`, `external.upstash-redis`, `external.redis-client`…)",
    "keylang/system/shop.md:7:3: unverified api calls worker: no import from the code of `api` reaches the code of `worker`; a network call is not in the static graph",
  ]);

  const json = keylang(dir, ["check", "--format", "json"]);
  // SAFETY: `check --format json` prints the report that Json describes (docs/cli.md).
  const report = JSON.parse(json.stdout) as Json;
  const system = report.results.filter((result) => result.criterion === "system shop").map((result) => [result.verdict, result.area, result.line]);
  assert.deepEqual(system, [
    ["ok", "api reads db", 5],
    ["unverified", "api calls cache", 6],
    ["unverified", "api calls worker", 7],
  ]);
  assert.match(report.results.find((result) => result.area === "api reads db")?.evidence ?? "", /`app\.links` → `infra\.db` imports `external\.pg`/);
});

test("check of a system: a relation that names a declared component and a bound code that reaches it is ok; adding the relation clears K403", (t) => {
  const dir = tempDir(t, "keylang-system-check-");
  writeTree(dir, {
    ...FILES,
    "src/app/links.ts": 'import { query } from "../infra/db.ts";\nimport { count } from "../worker/clicks.ts";\nexport function find(code: string): string {\n  return query(code) + count();\n}\n',
    "keylang/system/shop.md": "# system shop\n\n- service api\n  - code app\n  - calls worker\n  - reads db\n  - uses cache\n- service worker\n  - code worker\n  - uses cache\n- db db postgres\n- cache cache redis\n",
  });
  const r = keylang(dir, ["check", "--format", "json"]);
  assert.equal(r.status, 0, r.stdout);
  // SAFETY: `check --format json` prints the report that Json describes (docs/cli.md).
  const report = JSON.parse(r.stdout) as Json;
  assert.deepEqual(report.results.filter((result) => (result.code ?? "").startsWith("K4")), []);
  assert.deepEqual(report.results.filter((result) => result.criterion === "system shop").map((result) => [result.verdict, result.area]), [
    ["ok", "api calls worker"],
    ["ok", "api reads db"],
    ["ok", "api uses cache"],
    ["ok", "worker uses cache"],
  ]);
});
