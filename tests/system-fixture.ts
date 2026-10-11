// A repository for the system tests (system-design): an Express route that
// reaches `pg` through a module of another layer and `kafkajs` directly, a
// NestJS cron that uses `ioredis`, and `keylang/system/shortener.md`, a
// hand-written design of it with zones, tables, a sequence and interview notes.

/** An Express route through a repository module to `pg` and `kafkajs`, a NestJS cron to `ioredis`, and a hand-written design of it. */
export const SHOP: Record<string, string> = {
  "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], infra: ["src/infra/**"], worker: ["src/worker/**"] } })}\n`,
  "package.json": `${JSON.stringify({ name: "shop", dependencies: { express: "4.0.0", pg: "8.0.0", ioredis: "5.0.0", kafkajs: "2.0.0", "@nestjs/schedule": "4.0.0", "@nestjs/common": "10.0.0" } })}\n`,
  "src/app/server.ts": 'import express from "express";\nimport { find } from "./links.ts";\nimport { send } from "../infra/bus.ts";\nconst app = express();\nexport function redirect(req: { params: { code: string } }, res: { send(s: string): void }): void {\n  send(req.params.code);\n  res.send(find(req.params.code));\n}\napp.get("/l/:code", redirect);\n',
  "src/app/links.ts": 'import { query } from "../infra/db.ts";\nexport function find(code: string): string {\n  return query(code);\n}\n',
  "src/infra/db.ts": 'import { Pool } from "pg";\nconst pool = new Pool();\nexport function query(sql: string): string {\n  return String(pool.query(sql));\n}\n',
  "src/infra/bus.ts": 'import { Kafka } from "kafkajs";\nconst kafka = new Kafka({ brokers: [] });\nexport function send(code: string): void {\n  kafka.producer().send({ topic: "clicks", messages: [{ value: code }] });\n}\n',
  "src/worker/clicks.ts": 'import { Injectable } from "@nestjs/common";\nimport { Cron } from "@nestjs/schedule";\nimport Redis from "ioredis";\nconst redis = new Redis();\n@Injectable()\nexport class Clicks {\n  @Cron("0 * * * *")\n  count(): void {\n    redis.incr("clicks");\n  }\n}\n',
  "keylang/system/shortener.md": `# system shortener

- requirement короткий URL веде на довгий
- nfr p99 редиректу < 50 мс
- estimate 100M нових URL на місяць ≈ 40 записів/с, читань у 100 разів більше
- tradeoff base62 від лічильника: без колізій, але потрібен генератор ID
- ? чи потрібна аналітика переходів у реальному часі
- client web браузер
  - calls cdn HTTPS
  - calls lb HTTPS
- cdn cdn CloudFront
- zone vpc AWS VPC
  - lb lb ALB
    - calls api HTTP
  - service api express
    - code app
    - reads db SELECT
    - writes db INSERT
    - calls cache GET
    - publishes clicks
  - worker stats
    - code worker
    - consumes clicks
    - writes cache INCR
  - db db postgres
    - table urls
      - id bigint pk
      - code text unique
      - owner_id bigint null fk users.id
      - index code
    - table users
      - id bigint pk
      - email text unique
  - cache cache redis
  - queue clicks kafka
- sequence redirect
  - web → lb GET /abc
  - lb → api GET /abc
  - api → cache GET abc
  - api → db SELECT url
  - api ⇢ clicks click
  - api → web 302
`,
};

