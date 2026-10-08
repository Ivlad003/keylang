// The Express, Fastify and Next.js adapters (business-flows/37, ADR 0022)
// through the real CLI on a small shop: an Express app that mounts an orders
// router from another file under `/api`, the router a nested items router
// (CommonJS) and a `route('/x')` chain, a middleware chain and a handler
// written in place; a Fastify server that registers a plugin with a prefix,
// the plugin a route object and a nested plugin written in place; Next.js
// Pages API handlers, server actions and `middleware.ts` with a matcher.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const CONFIG = {
  languages: ["typescript", "javascript"],
  layers: { server: ["src/server/**"], fast: ["src/fast/**"], services: ["src/services/**"], web: ["app/**", "pages/**", "middleware.ts"] },
};

const MANIFEST = {
  name: "shop",
  private: true,
  dependencies: { express: "^4.19.0", fastify: "^4.26.0", next: "^14.2.0", react: "^18.2.0" },
};

const REPO: Record<string, string> = {
  "keylang.json": `${JSON.stringify(CONFIG, null, 2)}\n`,
  "package.json": `${JSON.stringify(MANIFEST, null, 2)}\n`,
  "keylang/flows.md": [
    "# flow createOrder",
    "",
    "- trigger server.orders_handlers.createOrder",
    "  - step services.orders.placeOrder",
    "    - step services.orders.save",
    "",
    "# flow catalog",
    "",
    "- trigger fast.catalog.catalogRoutes",
    "  - step fast.catalog.listProducts",
    "",
  ].join("\n"),
  "src/server/app.ts": [
    "import express from \"express\";",
    "import { requestLog } from \"./auth\";",
    "import ordersRouter from \"./orders.routes\";",
    "",
    "const app = express();",
    "app.use(express.json());",
    "app.use(requestLog);",
    "app.use(\"/api\", ordersRouter);",
    "app.get(\"/health\", (req, res) => res.send(\"ok\"));",
    "",
    "export default app;",
    "",
  ].join("\n"),
  "src/server/auth.ts": [
    "export function requestLog(req: unknown, res: unknown, next: () => void): void {",
    "  next();",
    "}",
    "",
    "export function auth(req: unknown, res: unknown, next: () => void): void {",
    "  next();",
    "}",
    "",
    "export function validate(req: unknown, res: unknown, next: () => void): void {",
    "  next();",
    "}",
    "",
  ].join("\n"),
  "src/server/orders.routes.ts": [
    "import { Router } from \"express\";",
    "import { auth, validate } from \"./auth\";",
    "import { createOrder, getOrder, listOrders, ordersPath, removeOrder, updateOrder } from \"./orders.handlers\";",
    "import itemsRouter from \"./items.routes\";",
    "",
    "const router = Router();",
    "router.get(\"/orders\", listOrders);",
    "router.post(\"/orders\", auth, validate, createOrder);",
    "router.route(\"/orders/:id\").get(getOrder).put(updateOrder);",
    "router.delete(ordersPath(), removeOrder);",
    "router.use(\"/orders/:id/items\", itemsRouter);",
    "",
    "export default router;",
    "",
  ].join("\n"),
  "src/server/items.routes.js": [
    "const express = require(\"express\");",
    "const { listItems } = require(\"./orders.handlers\");",
    "",
    "const items = express.Router();",
    "items.get(\"/\", listItems);",
    "",
    "module.exports = items;",
    "",
  ].join("\n"),
  "src/server/orders.handlers.ts": [
    "import { findOrder, placeOrder } from \"../services/orders\";",
    "",
    "export function listOrders(): string {",
    "  return \"[]\";",
    "}",
    "",
    "export function createOrder(): void {",
    "  placeOrder();",
    "}",
    "",
    "export function getOrder(): string {",
    "  return findOrder();",
    "}",
    "",
    "export function updateOrder(): void {}",
    "",
    "export function removeOrder(): void {}",
    "",
    "export function listItems(): string {",
    "  return \"[]\";",
    "}",
    "",
    "export function ordersPath(): string {",
    "  return \"/orders/\" + \"old\";",
    "}",
    "",
  ].join("\n"),
  "src/services/orders.ts": [
    "export function placeOrder(): void {",
    "  save();",
    "}",
    "",
    "export function save(): void {}",
    "",
    "export function findOrder(): string {",
    "  return \"order\";",
    "}",
    "",
  ].join("\n"),
  "src/fast/server.ts": [
    "import Fastify from \"fastify\";",
    "import catalogRoutes from \"./catalog\";",
    "",
    "const fastify = Fastify();",
    "fastify.register(catalogRoutes, { prefix: \"/catalog\" });",
    "",
    "export default fastify;",
    "",
  ].join("\n"),
  "src/fast/catalog.ts": [
    "import type { FastifyInstance } from \"fastify\";",
    "",
    "export default async function catalogRoutes(fastify: FastifyInstance): Promise<void> {",
    "  fastify.get(\"/products\", { preHandler: [requireUser] }, listProducts);",
    "  fastify.route({ method: [\"GET\", \"HEAD\"], url: \"/products/:id\", handler: showProduct });",
    "  fastify.register(async (admin: FastifyInstance) => {",
    "    admin.post(\"/products\", createProduct);",
    "  }, { prefix: \"/admin\" });",
    "}",
    "",
    "export async function requireUser(): Promise<void> {}",
    "",
    "export async function listProducts(): Promise<string> {",
    "  return \"[]\";",
    "}",
    "",
    "export async function showProduct(): Promise<string> {",
    "  return \"{}\";",
    "}",
    "",
    "export async function createProduct(): Promise<void> {}",
    "",
  ].join("\n"),
  "pages/api/orders/[id].ts": [
    "import { findOrder } from \"../../../src/services/orders\";",
    "",
    "export default function handler(req: unknown, res: { json(v: unknown): void }): void {",
    "  res.json(findOrder());",
    "}",
    "",
  ].join("\n"),
  "pages/api/index.js": ["export default (req, res) => res.json({ ok: true });", ""].join("\n"),
  "app/actions.ts": [
    "\"use server\";",
    "",
    "import { placeOrder } from \"../src/services/orders\";",
    "",
    "export async function submitOrder(): Promise<void> {",
    "  placeOrder();",
    "}",
    "",
  ].join("\n"),
  "app/orders/page.tsx": [
    "export async function cancelOrder(): Promise<void> {",
    "  \"use server\";",
    "}",
    "",
    "export default function Page() {",
    "  async function archive(): Promise<void> {",
    "    \"use server\";",
    "  }",
    "  return <form action={archive} />;",
    "}",
    "",
  ].join("\n"),
  "app/api/status/route.ts": ["export function GET(): Response {", "  return new Response(\"ok\");", "}", ""].join("\n"),
  "middleware.ts": [
    "export function middleware(req: Request): Response | undefined {",
    "  return undefined;",
    "}",
    "",
    "export const config = { matcher: [\"/api/:path*\", \"/orders\"] };",
    "",
  ].join("\n"),
};

function shop(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-web-");
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

function rows(snapshot: AnalysisSnapshot): string[] {
  return snapshot.entries.map((e) => [e.kind, e.label, e.id, `${e.file}:${e.line}`, e.framework ?? "", e.method ?? "", e.source, e.note ?? ""].join(" | "));
}

const H = "server.orders_handlers";

test("express/fastify/next: detected from package.json; the config files are the sources that register", (t) => {
  const snapshot = snapshotOf(shop(t));
  const frameworks = new Map((snapshot.manifest.frameworks ?? []).map((f) => [f.name, f.files.map((x) => x.path)]));
  assert.deepEqual([...frameworks.keys()].sort(), ["express", "fastify", "next"]);
  assert.ok(frameworks.get("express")?.includes("src/server/orders.routes.ts"));
  assert.ok(frameworks.get("fastify")?.includes("src/fast/server.ts"));
  assert.deepEqual(frameworks.get("next"), ["app/actions.ts", "app/orders/page.tsx", "middleware.ts", "pages/api/index.js", "pages/api/orders/[id].ts"]);
});

test("express: a router imported from another file and mounted under a prefix, nested `use`, `route()` chains, a middleware chain, a handler written in place", (t) => {
  const snapshot = snapshotOf(shop(t));
  assert.deepEqual(rows(snapshot).filter((r) => r.includes(" | express | ")), [
    `route | GET /api/orders | ${H}.listOrders | src/server/orders.handlers.ts:3 | express | GET | src/server/orders.routes.ts:7 | `,
    // `router.route('/orders/:id').get(getOrder).put(updateOrder)`: one entry per verb of the chain.
    `route | GET /api/orders/:id | ${H}.getOrder | src/server/orders.handlers.ts:11 | express | GET | src/server/orders.routes.ts:9 | `,
    // `router.use('/orders/:id/items', itemsRouter)` of a CommonJS router (`module.exports = items`).
    `route | GET /api/orders/:id/items | ${H}.listItems | src/server/orders.handlers.ts:19 | express | GET | src/server/items.routes.js:5 | `,
    "route | GET /health | server.app | src/server/app.ts:9 | express | GET | src/server/app.ts:9 | handler written in place: the registering module stands for it",
    `route | POST /api/orders | ${H}.createOrder | src/server/orders.handlers.ts:7 | express | POST | src/server/orders.routes.ts:8 | middleware before the handler: \`auth\` (server.auth.auth), \`validate\` (server.auth.validate)`,
    `route | PUT /api/orders/:id | ${H}.updateOrder | src/server/orders.handlers.ts:15 | express | PUT | src/server/orders.routes.ts:9 | `,
    "route | USE / | server.auth.requestLog | src/server/auth.ts:1 | express |  | src/server/app.ts:7 | middleware: runs before the routes under `/`",
  ]);
  // The language-level entry of the same call (ticket 09, without the prefix) gives way to the adapter's.
  assert.ok(!snapshot.entries.some((e) => e.framework === null && e.label === "GET /orders"));
  // A computed path of a router is a hole with the reason, not a guessed route.
  const hole = snapshot.coverage.find((c) => c.kind === "unsupported" && c.file === "src/server/orders.routes.ts");
  assert.equal(`${hole?.line}: ${hole?.reason}`, "10: the route path is computed at run time: `ordersPath()`");
});

test("express: a router mounted nowhere keeps its own paths, with a note", (t) => {
  const dir = shop(t, { "src/server/app.ts": ["import express from \"express\";", "", "const app = express();", "app.get(\"/health\", (req, res) => res.send(\"ok\"));", ""].join("\n") });
  const orders = snapshotOf(dir).entries.find((e) => e.id === `${H}.listOrders`);
  assert.equal(orders?.label, "GET /orders");
  assert.equal(orders?.note, "the router `router` of src/server/orders.routes.ts is mounted nowhere keylang reads: the path is without its prefix");
});

test("fastify: `register` with a prefix, a nested plugin written in place, a route object with two methods, `preHandler` as middleware", (t) => {
  const snapshot = snapshotOf(shop(t));
  assert.deepEqual(rows(snapshot).filter((r) => r.includes(" | fastify | ")), [
    "route | GET /catalog/products | fast.catalog.listProducts | src/fast/catalog.ts:13 | fastify | GET | src/fast/catalog.ts:4 | middleware before the handler: `requireUser` (fast.catalog.requireUser)",
    "route | GET /catalog/products/:id | fast.catalog.showProduct | src/fast/catalog.ts:17 | fastify | GET | src/fast/catalog.ts:5 | ",
    "route | HEAD /catalog/products/:id | fast.catalog.showProduct | src/fast/catalog.ts:17 | fastify | HEAD | src/fast/catalog.ts:5 | ",
    "route | POST /catalog/admin/products | fast.catalog.createProduct | src/fast/catalog.ts:21 | fastify | POST | src/fast/catalog.ts:7 | ",
  ]);
  // The handler the plugin passes by reference is a `callable-arg` edge (ticket 05).
  assert.ok(snapshot.edges.some((e) => e.kind === "call" && e.source === "fast.catalog.catalogRoutes" && e.target === "fast.catalog.listProducts" && e.via === "callable-arg"));
});

test("next: Pages API default exports, server actions (`'use server'` file and function), middleware with its matcher; App Router stays language-level", (t) => {
  const snapshot = snapshotOf(shop(t));
  assert.deepEqual(rows(snapshot).filter((r) => r.includes(" | next | ")), [
    "route | API /api | web.api.default | pages/api/index.js:1 | next |  | pages/api/index.js:1 | ",
    "route | API /api/orders/[id] | web.api.orders.$p-id.handler | pages/api/orders/[id].ts:3 | next |  | pages/api/orders/[id].ts:1 | ",
    "route | action archive | web.orders.page | app/orders/page.tsx:6 | next |  | app/orders/page.tsx:6 | a server action written inside another function: the module stands for it",
    "route | action cancelOrder | web.orders.page.cancelOrder | app/orders/page.tsx:1 | next |  | app/orders/page.tsx:1 | ",
    "route | action submitOrder | web.actions.submitOrder | app/actions.ts:5 | next |  | app/actions.ts:5 | ",
    "route | middleware /api/:path*, /orders | web.middleware.middleware | middleware.ts:1 | next |  | middleware.ts:1 | ",
  ]);
  assert.ok(rows(snapshot).includes("route | GET /api/status | web.api.status.route.GET | app/api/status/route.ts:1 |  |  | app/api/status/route.ts:1 | "));
});

test("web: a handler passed by reference is a step — `static ok` in behavior, `unverified` in shape", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const behavior = keylang(dir, ["check"]);
  assert.equal(behavior.status, 0, behavior.stdout);
  assert.match(behavior.stdout, /flows\.md:10:3: static ok fast\.catalog\.listProducts: called from fast\.catalog\.catalogRoutes through the callable `listProducts` passed at src\/fast\/catalog\.ts:4:59\n/);
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\.md:10:3: static unverified fast\.catalog\.listProducts: no resolved path/);
});

test("web: `flows discover` gives a flow per entry point; `coverage` names what stays blind", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const discover = keylang(dir, ["flows", "discover"]);
  assert.equal(discover.status, 0, discover.stderr);
  assert.match(discover.stderr, /discovered 14 flows \(1 already specified\)/);
  assert.match(discover.stderr, /no fn to draft from: route GET \/health \(server\.app\)/);
  const server = readFileSync(join(dir, "keylang/flows-discovered/server.md"), "utf8");
  assert.match(server, /entry=route label="GET \/api\/orders\/:id"[^\n]*\n\n- trigger route server\.orders_handlers\.getOrder\n {2}- step services\.orders\.findOrder\n/);
  const web = readFileSync(join(dir, "keylang/flows-discovered/web.md"), "utf8");
  assert.match(web, /entry=route label="action submitOrder"[^\n]*\n\n- trigger route web\.actions\.submitOrder\n {2}- step services\.orders\.placeOrder\n {4}- step services\.orders\.save\n/);
  const coverage = keylang(dir, ["coverage"]);
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /reach: \d+ of \d+ fn reachable from 18 entry point\(s\)/);
  assert.match(coverage.stdout, /unsupported: the route path is computed at run time/);
  assert.match(coverage.stdout, /server\.orders_handlers\.removeOrder\s+src\/server\/orders\.handlers\.ts:\d+\s+no caller/);
});

test("web: `frameworks: []` turns the adapters off — the base route heuristic stays, ok and fail only become unverified (metamorphic)", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const on = verdicts(keylang(dir, ["check"]).stdout);
  setConfig(dir, (raw) => {
    raw.frameworks = [];
  });
  const off = snapshotOf(dir);
  assert.equal(off.manifest.frameworks, undefined);
  assert.ok(!off.entries.some((e) => e.framework !== null));
  // Ticket 09's literal routes with a named handler, without the router's prefix.
  assert.deepEqual(off.entries.map((e) => `${e.label} ${e.id}`), [
    `GET / ${H}.listItems`,
    "GET /api/status web.api.status.route.GET",
    `GET /orders ${H}.listOrders`,
    "GET /products fast.catalog.listProducts",
    `POST /orders ${H}.createOrder`,
    "POST /products fast.catalog.createProduct",
  ]);
  assert.ok(off.coverage.some((c) => c.kind === "skipped-file" && c.file === "src/server/orders.routes.ts" && c.text === "framework:express"));
  assert.ok(off.coverage.some((c) => c.kind === "skipped-file" && c.file === "middleware.ts" && c.text === "framework:next"));
  const offVerdicts = verdicts(keylang(dir, ["check"]).stdout);
  assert.equal(offVerdicts.size, on.size);
  for (const [key, verdict] of on) {
    const now = offVerdicts.get(key);
    assert.ok(now === verdict || now === "unverified", `${key}: ${verdict} → ${now}`);
  }
  assert.ok(![...offVerdicts.values()].includes("fail"));
});
