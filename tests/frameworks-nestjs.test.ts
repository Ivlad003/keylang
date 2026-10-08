// The NestJS adapter (business-flows/34, ADR 0022) through the real CLI on a
// small Nest-shaped repository: a module with a class provider, a token
// provider `{ provide: ORDER_REPO, useClass: SqlOrderRepo }`, `useExisting`
// and `useFactory`; a service that gets the repository through
// `@Inject(ORDER_REPO)` as an interface-typed constructor parameter and
// emits `order.created`; a listener with `@OnEvent`, `@Cron`, `@Interval`;
// a controller under the global prefix of `main.ts`, a `@MessagePattern`
// and a GraphQL resolver. The decorators are the framework's configuration:
// they give `via` edges, entry points, and with `frameworks: []` only holes.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const PLACE = "orders.orders_service.OrdersService.place";
const ON_CREATED = "notify.notify_listener.NotifyListener.onCreated";
const SAVE = "infra.sql-order_repo.SqlOrderRepo.save";
const MODULE = "src/orders/orders.module.ts";
const EVENT = "events.order-created";

const CONFIG = {
  languages: ["typescript"],
  layers: { app: ["src/main.ts", "src/app.module.ts"], orders: ["src/orders/**"], infra: ["src/infra/**"], notify: ["src/notify/**"] },
};

const MANIFEST = {
  name: "nest-shop",
  private: true,
  dependencies: { "@nestjs/common": "^10.0.0", "@nestjs/core": "^10.0.0", "@nestjs/event-emitter": "^2.0.0", "@nestjs/graphql": "^12.0.0", "@nestjs/microservices": "^10.0.0", "@nestjs/schedule": "^4.0.0" },
};

const REPO: Record<string, string> = {
  "keylang.json": `${JSON.stringify(CONFIG, null, 2)}\n`,
  "package.json": `${JSON.stringify(MANIFEST, null, 2)}\n`,
  "keylang/flows.md": [
    "# flow placeOrder",
    "",
    "- trigger orders.orders_controller.OrdersController.create",
    "  - step orders.orders_service.OrdersService.place",
    "    - step infra.sql-order_repo.SqlOrderRepo.save",
    "    - step notify.notify_listener.NotifyListener.onCreated",
    "      - step notify.notify_listener.NotifyListener.send",
    "",
  ].join("\n"),
  "src/app.module.ts": [
    "import { Module } from \"@nestjs/common\";",
    "import { NotifyModule } from \"./notify/notify.module\";",
    "import { OrdersModule } from \"./orders/orders.module\";",
    "",
    "@Module({ imports: [OrdersModule, NotifyModule] })",
    "export class AppModule {}",
    "",
  ].join("\n"),
  "src/infra/sql-order.repo.ts": [
    "import type { OrderRepo } from \"../orders/order.repo\";",
    "",
    "export class SqlOrderRepo implements OrderRepo {",
    "  save(order: string): void {",
    "    this.write(order);",
    "  }",
    "",
    "  write(row: string): string {",
    "    return row;",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/main.ts": [
    "import { NestFactory } from \"@nestjs/core\";",
    "import { AppModule } from \"./app.module\";",
    "",
    "async function bootstrap(): Promise<void> {",
    "  const app = await NestFactory.create(AppModule);",
    "  app.setGlobalPrefix(\"api\");",
    "  await app.listen(3000);",
    "}",
    "",
    "bootstrap();",
    "",
  ].join("\n"),
  "src/notify/notify.listener.ts": [
    "import { Injectable } from \"@nestjs/common\";",
    "import { OnEvent } from \"@nestjs/event-emitter\";",
    "import { Cron, Interval } from \"@nestjs/schedule\";",
    "",
    "@Injectable()",
    "export class NotifyListener {",
    "  @OnEvent(\"order.created\")",
    "  onCreated(order: string): void {",
    "    this.send(order);",
    "  }",
    "",
    "  send(order: string): string {",
    "    return order;",
    "  }",
    "",
    "  @Cron(\"0 * * * *\")",
    "  digest(): void {",
    "    this.send(\"digest\");",
    "  }",
    "",
    "  @Interval(5000)",
    "  poll(): void {}",
    "}",
    "",
  ].join("\n"),
  "src/notify/notify.module.ts": [
    "import { Module } from \"@nestjs/common\";",
    "import { NotifyListener } from \"./notify.listener\";",
    "",
    "@Module({ providers: [NotifyListener] })",
    "export class NotifyModule {}",
    "",
  ].join("\n"),
  "src/orders/order.repo.ts": [
    "export interface OrderRepo {",
    "  save(order: string): void;",
    "}",
    "",
    "export const ORDER_REPO = Symbol(\"ORDER_REPO\");",
    "",
  ].join("\n"),
  "src/orders/orders.controller.ts": [
    "import { Body, Controller, Get, Param, Post } from \"@nestjs/common\";",
    "import { MessagePattern } from \"@nestjs/microservices\";",
    "import { OrdersService } from \"./orders.service\";",
    "",
    "@Controller(\"orders\")",
    "export class OrdersController {",
    "  constructor(private readonly orders: OrdersService) {}",
    "",
    "  @Get(\":id\")",
    "  find(@Param(\"id\") id: string): string {",
    "    return this.orders.find(id);",
    "  }",
    "",
    "  @Post()",
    "  create(@Body() body: string): void {",
    "    this.orders.place(body);",
    "  }",
    "",
    "  @MessagePattern(\"orders.paid\")",
    "  paid(data: string): string {",
    "    return this.orders.find(data);",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/orders/orders.module.ts": [
    "import { Module } from \"@nestjs/common\";",
    "import { SqlOrderRepo } from \"../infra/sql-order.repo\";",
    "import { ORDER_REPO } from \"./order.repo\";",
    "import { OrdersController } from \"./orders.controller\";",
    "import { OrdersResolver } from \"./orders.resolver\";",
    "import { OrdersService } from \"./orders.service\";",
    "",
    "@Module({",
    "  controllers: [OrdersController],",
    "  providers: [",
    "    OrdersService,",
    "    OrdersResolver,",
    "    { provide: ORDER_REPO, useClass: SqlOrderRepo },",
    "    { provide: \"CLOCK\", useFactory: () => new Date() },",
    "    { provide: \"LEGACY_REPO\", useExisting: ORDER_REPO },",
    "  ],",
    "})",
    "export class OrdersModule {}",
    "",
  ].join("\n"),
  "src/orders/orders.resolver.ts": [
    "import { Args, Mutation, Query, Resolver } from \"@nestjs/graphql\";",
    "import { OrdersService } from \"./orders.service\";",
    "",
    "@Resolver()",
    "export class OrdersResolver {",
    "  constructor(private readonly orders: OrdersService) {}",
    "",
    "  @Query(() => String)",
    "  order(@Args(\"id\") id: string): string {",
    "    return this.orders.find(id);",
    "  }",
    "",
    "  @Mutation(() => String, { name: \"placeOrder\" })",
    "  place(@Args(\"order\") order: string): string {",
    "    this.orders.place(order);",
    "    return order;",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/orders/orders.service.ts": [
    "import { Inject, Injectable } from \"@nestjs/common\";",
    "import { EventEmitter2 } from \"@nestjs/event-emitter\";",
    "import { ORDER_REPO, type OrderRepo } from \"./order.repo\";",
    "",
    "@Injectable()",
    "export class OrdersService {",
    "  constructor(",
    "    @Inject(ORDER_REPO) private readonly repo: OrderRepo,",
    "    @Inject(\"CLOCK\") private readonly clock: { now(): number },",
    "    @Inject(\"LEGACY_REPO\") private readonly legacy: OrderRepo,",
    "    private readonly events: EventEmitter2,",
    "  ) {}",
    "",
    "  place(order: string): void {",
    "    this.repo.save(order);",
    "    this.events.emit(\"order.created\", order);",
    "  }",
    "",
    "  find(id: string): string {",
    "    return id;",
    "  }",
    "",
    "  stamp(): number {",
    "    return this.clock.now();",
    "  }",
    "",
    "  archive(order: string): void {",
    "    this.legacy.save(order);",
    "  }",
    "}",
    "",
  ].join("\n"),
};

function shop(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-nest-");
  writeTree(dir, { ...REPO, ...extra });
  return dir;
}

function snapshotOf(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

function setConfig(dir: string, change: (raw: Record<string, unknown>) => void): void {
  const raw = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as Record<string, unknown>;
  change(raw);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(raw, null, 2)}\n`);
}

/** `file:line:col id → verdict` of every `static` verdict `check` prints. */
function verdicts(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of stdout.matchAll(/^(\S+:\d+:\d+): static (ok|fail|unverified) (\S+?):/gm)) out.set(`${m[1]} ${m[3]}`, m[2]!);
  return out;
}

test("nestjs: a token provider gives `@Inject` an argument edge, useExisting follows it, useFactory is a hole; emit runs the @OnEvent listener", (t) => {
  const dir = shop(t);
  const snapshot = snapshotOf(dir);
  assert.equal(snapshot.manifest.frameworks?.[0]?.name, "nestjs");
  assert.ok(snapshot.manifest.frameworks?.[0]?.files.some((f) => f.path === MODULE));
  const via = snapshot.edges.filter((e) => e.kind === "call" && e.via !== undefined).map((e) => [e.source, e.target, e.via, e.site, e.owner, e.binding].join(" | "));
  assert.deepEqual(via.sort(), [
    // `@OnEvent('order.created')` observes the event node; `emit` of `EventEmitter2` dispatches to it.
    `${EVENT} | ${ON_CREATED} | observer | src/notify/notify.listener.ts:7:3 | notify | observer \`NotifyListener.onCreated\` (\`src/notify/notify.listener.ts#NotifyListener::onCreated\`) of the event \`order.created\``,
    `orders.orders_service.OrdersService.archive | ${SAVE} | argument | ${MODULE}:15:5 | orders | the argument \`legacy\` → \`'LEGACY_REPO' → ORDER_REPO → SqlOrderRepo\``,
    `${PLACE} | ${EVENT} | dispatch |  |  | `,
    `${PLACE} | ${SAVE} | argument | ${MODULE}:13:5 | orders | the argument \`repo\` → \`ORDER_REPO → SqlOrderRepo\``,
  ]);
  assert.equal(snapshot.nodes[EVENT]?.kind, "event");
  // The interface-typed parameter's call is resolved by the provider, not left a hole.
  assert.ok(!snapshot.coverage.some((c) => c.text === "this.repo.save" || c.text === "this.legacy.save"));
  // `useFactory` names no class: a hole of the provider, and the call through it stays unresolved.
  const factory = snapshot.coverage.find((c) => c.kind === "unresolved-binding");
  assert.equal(`${factory?.file}:${factory?.line}`, `${MODULE}:14`);
  assert.match(factory?.reason ?? "", /^`useFactory` provides 'CLOCK': the value is made at run time/);
  assert.ok(snapshot.coverage.some((c) => c.kind === "unresolved-call" && c.text === "this.clock.now"));
  // The map shows the config edges in `calls`, marked with their `via`.
  assert.match(readFileSync(join(dir, "keylang/map/orders.md"), "utf8"), /- calls infra\.sql-order_repo\.SqlOrderRepo\.save, events\.order-created <!-- via: save argument src\/orders\/orders\.module\.ts:13:5[^\n]*-->/);
});

test("nestjs: an event name that is no literal is a hole; a global prefix that is no literal is a note on the routes", (t) => {
  const dir = shop(t, {
    "src/orders/events.ts": ["import { EventEmitter2 } from \"@nestjs/event-emitter\";", "", "export function fire(events: EventEmitter2, name: string): void {", "  events.emit(name);", "}", ""].join("\n"),
    "src/main.ts": ["import { NestFactory } from \"@nestjs/core\";", "import { AppModule } from \"./app.module\";", "", "async function bootstrap(prefix: string): Promise<void> {", "  const app = await NestFactory.create(AppModule);", "  app.setGlobalPrefix(prefix);", "}", "", "bootstrap(\"v1\");", ""].join("\n"),
  });
  const snapshot = snapshotOf(dir);
  const hole = snapshot.coverage.find((c) => c.file === "src/orders/events.ts");
  assert.equal(hole?.kind, "dynamic-event");
  assert.match(hole?.reason ?? "", /^dispatch of an event whose name is computed at run time: `name`$/);
  const route = snapshot.entries.find((e) => e.label === "GET /orders/:id");
  assert.equal(route?.note, "the global prefix at src/main.ts:6 is no literal: the path is without it");
});

test("nestjs: controllers, cron, intervals, listeners, message patterns and resolvers are entry points", (t) => {
  const dir = shop(t);
  const snapshot = snapshotOf(dir);
  const rows = snapshot.entries.map((e) => [e.kind, e.label, e.id, `${e.file}:${e.line}`, e.framework, e.method ?? "", e.source].join(" | "));
  assert.deepEqual(rows, [
    "consumer | orders.paid | orders.orders_controller.OrdersController.paid | src/orders/orders.controller.ts:20 | nestjs |  | src/orders/orders.controller.ts:19",
    "cron | NotifyListener.digest 0 * * * * | notify.notify_listener.NotifyListener.digest | src/notify/notify.listener.ts:17 | nestjs |  | src/notify/notify.listener.ts:16",
    "cron | NotifyListener.poll every 5000ms | notify.notify_listener.NotifyListener.poll | src/notify/notify.listener.ts:22 | nestjs |  | src/notify/notify.listener.ts:21",
    "graphql | Mutation.placeOrder | orders.orders_resolver.OrdersResolver.place | src/orders/orders.resolver.ts:14 | nestjs |  | src/orders/orders.resolver.ts:13",
    "graphql | Query.order | orders.orders_resolver.OrdersResolver.order | src/orders/orders.resolver.ts:9 | nestjs |  | src/orders/orders.resolver.ts:8",
    `observer | order.created (NotifyListener.onCreated) | ${ON_CREATED} | src/notify/notify.listener.ts:8 | nestjs |  | src/notify/notify.listener.ts:7`,
    "route | GET /api/orders/:id | orders.orders_controller.OrdersController.find | src/orders/orders.controller.ts:10 | nestjs | GET | src/orders/orders.controller.ts:9",
    "route | POST /api/orders | orders.orders_controller.OrdersController.create | src/orders/orders.controller.ts:15 | nestjs | POST | src/orders/orders.controller.ts:14",
  ]);
  const listed = keylang(dir, ["entries", "--kind", "cron"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /cron\s+NotifyListener\.digest 0 \* \* \* \*\s+notify\.notify_listener\.NotifyListener\.digest/);
});

test("nestjs: a flow step reached through @OnEvent is `static ok` in behavior (review 2026-10-06 §3), `unverified` in shape", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const behavior = keylang(dir, ["check"]);
  assert.equal(behavior.status, 0, behavior.stdout);
  assert.match(behavior.stdout, /flows\.md:6:5: static ok notify\.notify_listener\.NotifyListener\.onCreated: reachable from orders\.orders_service\.OrdersService\.place via events\.order-created \([^\n]*the dispatch `this\.events\.emit` at src\/orders\/orders\.service\.ts:16:5; [^\n]*the observer `NotifyListener\.onCreated` [^\n]*of the event `order\.created` in `src\/notify\/notify\.listener\.ts:7`\)\n/);
  assert.match(behavior.stdout, /flows\.md:5:5: static ok infra\.sql-order_repo\.SqlOrderRepo\.save: called from [^\n]* through the argument `repo` → `ORDER_REPO → SqlOrderRepo` in `src\/orders\/orders\.module\.ts:13`\n/);
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\.md:6:5: static unverified notify\.notify_listener\.NotifyListener\.onCreated: no resolved path from [^\n]*\(not followed in static mode shape, set by --static\)/);
  assert.match(shape.stdout, /flows\.md:7:7: static ok notify\.notify_listener\.NotifyListener\.send: called from/);
});

test("nestjs: `deny` sees a provider's edge as a dependency of the module that declares it; an observer edge is the listener's", (t) => {
  const dir = shop(t, { "keylang/rules.md": "# rules\n\n- deny orders infra\n- deny orders notify\n" });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1, r.stdout);
  const k102 = r.stdout.split("\n").filter((line) => line.includes("K102"));
  assert.ok(k102.includes(`${MODULE}:13:5: K102 divergence: \`orders\` depends on \`infra.sql-order_repo.SqlOrderRepo\` through the argument \`repo\` → \`ORDER_REPO → SqlOrderRepo\` (${MODULE}:13), which is denied by \`deny orders infra\` (keylang/rules.md:3)`), k102.join("\n"));
  // `orders` emits the event, `notify` subscribes: the subscription is notify's, so `orders` does not depend on it.
  assert.ok(!k102.some((line) => line.includes("deny orders notify")), k102.join("\n"));
});

test("nestjs: `frameworks: []` turns the adapter off — ok and fail only become unverified (metamorphic)", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const on = verdicts(keylang(dir, ["check"]).stdout);
  setConfig(dir, (raw) => {
    raw.frameworks = [];
  });
  const off = snapshotOf(dir);
  assert.equal(off.manifest.frameworks, undefined);
  assert.deepEqual(off.entries.filter((e) => e.framework === "nestjs"), []);
  assert.ok(!off.edges.some((e) => e.via === "argument" || e.via === "observer"));
  assert.ok(off.coverage.some((c) => c.kind === "skipped-file" && c.file === MODULE && c.text === "framework:nestjs"));
  const offVerdicts = verdicts(keylang(dir, ["check"]).stdout);
  assert.equal(offVerdicts.size, on.size);
  for (const [key, verdict] of on) {
    const now = offVerdicts.get(key);
    assert.ok(now === verdict || now === "unverified", `${key}: ${verdict} → ${now}`);
  }
  // Without the adapter the @OnEvent step is unverified (the config may call it), never the old false `fail`.
  assert.equal(offVerdicts.get(`keylang/flows.md:6:5 ${ON_CREATED}`), "unverified");
  assert.equal(on.get(`keylang/flows.md:6:5 ${ON_CREATED}`), "ok");
});

test("nestjs: `flows discover` gives a flow per entry point; `coverage` names what stays blind", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const discover = keylang(dir, ["flows", "discover"]);
  assert.equal(discover.status, 0, discover.stderr);
  assert.match(discover.stderr, /discovered 7 flows \(1 already specified\)/);
  const notify = readFileSync(join(dir, "keylang/flows-discovered/notify.md"), "utf8");
  // An observer of a known event is the first step of the event's flow (business-flows/16).
  assert.match(notify, /entry=observer label="order\.created \(NotifyListener\.onCreated\)"[^\n]*\n\n- trigger event events\.order-created\n {2}- step notify\.notify_listener\.NotifyListener\.onCreated <!-- keylang:algo via observer src\/notify\/notify\.listener\.ts:7:3 -->\n {4}- step notify\.notify_listener\.NotifyListener\.send\n/);
  assert.match(notify, /\n- trigger cron notify\.notify_listener\.NotifyListener\.digest\n {2}- step notify\.notify_listener\.NotifyListener\.send\n/);
  const coverage = keylang(dir, ["coverage"]);
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /reach: \d+ of \d+ fn reachable from 8 entry point\(s\)/);
  assert.match(coverage.stdout, /unresolved-binding: `X` provides 'CLOCK'/);
  assert.match(coverage.stdout, /orders\.orders_service\.OrdersService\.stamp\s+src\/orders\/orders\.service\.ts:\d+\s+no caller/);
});
