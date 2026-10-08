// The Python web adapters (business-flows/38, ADR 0022) through the real CLI
// on small repositories (`tests/fixtures-python-web.ts`): Django `urls.py`
// with `include` and a class-based view, signals by `connect` and
// `@receiver`, a management command; Celery tasks, `.delay()` and
// `beat_schedule`; FastAPI routers with prefixes and `Depends`; Flask routes
// and a blueprint. Entries of each kind, edges by `via`, the decorator holes a
// registration lifts, and `frameworks: []` turning it all back into holes.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { DJANGO, FASTAPI, FLASK } from "./fixtures-python-web.ts";

function repo(t: { after: (fn: () => void) => void }, files: Record<string, string>, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-pyweb-");
  writeTree(dir, { ...files, ...extra });
  return dir;
}

function map(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

function entries(snapshot: AnalysisSnapshot): string[] {
  return snapshot.entries.map((e) => [e.kind, e.label, e.id, e.framework ?? "", e.method ?? "", e.source].join(" | "));
}

function viaEdges(snapshot: AnalysisSnapshot): string[] {
  return snapshot.edges.filter((e) => e.kind === "call" && e.via !== undefined).map((e) => `${e.source} -> ${e.target} ${e.via} ${e.site ?? ""} ${e.hook ?? e.binding ?? ""}`.trim());
}

function setFrameworks(dir: string, frameworks: string[] | undefined): void {
  const path = join(dir, "keylang.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (frameworks === undefined) delete raw.frameworks;
  else raw.frameworks = frameworks;
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
}

test("python web: Django urls, class-based views, signals, a management command and Celery tasks, beat and dispatch are entries", (t) => {
  const snapshot = map(repo(t, DJANGO));
  assert.deepEqual(entries(snapshot), [
    "cli | manage.py close_orders | orders.management.commands.close_orders.Command.handle | django |  | orders/management/commands/close_orders.py:4",
    "consumer | orders.tasks.cleanup | orders.tasks.cleanup | celery |  | orders/tasks.py:11",
    "consumer | orders.tasks.send_receipt | orders.tasks.send_receipt | celery |  | orders/tasks.py:6",
    "cron | cleanup-stale (0 */3 * * *) | orders.tasks.cleanup | celery |  | shop/settings.py:4",
    "main | manage.py | shop.manage.main |  |  | manage.py:11",
    "observer | order_placed | notify.handlers.email_customer | django |  | notify/handlers.py:15",
    "observer | post_save (sender=Order) | notify.handlers.audit | django |  | notify/handlers.py:12",
    "route | /orders/ | orders.views.order_list | django |  | orders/urls.py:6",
    "route | GET /orders/<int:pk>/ | orders.views.OrderDetail.get | django | GET | orders/urls.py:7",
    "route | POST /orders/<int:pk>/ | orders.views.OrderDetail.post | django | POST | orders/urls.py:7",
  ]);
  assert.deepEqual(snapshot.manifest.frameworks?.map((f) => f.name), ["django", "celery"]);
  assert.ok(snapshot.manifest.frameworks?.[0]?.files.some((f) => f.path === "orders/urls.py"));
  const coverage = snapshot.coverage.map((c) => `${c.kind} ${c.file}:${c.line} ${c.reason}`);
  // What is not read is a hole with the reason: a view that is no fn, a beat entry whose task nobody registers.
  assert.deepEqual(coverage, [
    "unsupported orders/urls.py:8 the view `views.missing_view` of `/orders/legacy/` is no fn keylang resolves",
    "unsupported shop/settings.py:4 the `beat_schedule` entry `nightly` runs the task `orders.tasks.missing`, which no analysed file registers",
  ]);
});

test("python web: `.delay()` dispatches to the task, `signal.send()` reaches its receivers; behavior follows them, shape does not", (t) => {
  const dir = repo(t, DJANGO);
  const snapshot = map(dir);
  assert.deepEqual(viaEdges(snapshot), [
    "orders.services.place_order -> orders.tasks.send_receipt dispatch orders/tasks.py:6:1 Celery task `orders.tasks.send_receipt`",
    "orders.services.place_order -> notify.handlers.email_customer observer notify/handlers.py:15:1 receiver of the signal `order_placed`",
  ]);
  // The calls themselves are no holes any more, and the decorators that registered the fns keep them.
  assert.equal(snapshot.stats.callsUnresolved, 0);
  assert.ok(!snapshot.coverage.some((c) => c.reason.startsWith("decorator ")), JSON.stringify(snapshot.coverage));
  const behavior = keylang(dir, ["check"]);
  assert.equal(behavior.status, 0, behavior.stdout);
  assert.match(behavior.stdout, /flows\.md:4:3: static ok orders\.tasks\.send_receipt: called from orders\.services\.place_order through the Celery task `orders\.tasks\.send_receipt` \(dispatch\) in `orders\/tasks\.py:6`\n/);
  assert.match(behavior.stdout, /flows\.md:5:3: static ok notify\.handlers\.email_customer: called from orders\.services\.place_order through the receiver of the signal `order_placed` \(observer\) in `notify\/handlers\.py:15`\n/);
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\.md:4:3: static unverified orders\.tasks\.send_receipt: no resolved path from orders\.services\.place_order; the Celery task [^\n]*\(not followed in static mode shape/);
  assert.match(shape.stdout, /flows\.md:5:3: static unverified notify\.handlers\.email_customer/);
});

test("python web: `deny` sees a signal's receiver; `frameworks: []` turns fail and ok into unverified, never into the other", (t) => {
  const dir = repo(t, DJANGO, { "keylang/rules.md": "# rules\n\n- deny orders notify\n" });
  const on = keylang(dir, ["check"]);
  assert.equal(on.status, 1, on.stdout);
  assert.match(on.stdout, /orders\/services\.py:7:5: K102 divergence: `orders\.services` depends on `notify\.handlers`, which is denied by `deny orders notify`/);
  assert.match(on.stdout, /flows\.md:4:3: static ok orders\.tasks\.send_receipt/);

  setFrameworks(dir, []);
  const snapshot = map(dir);
  assert.equal(snapshot.manifest.frameworks, undefined);
  assert.deepEqual(entries(snapshot), ["main | manage.py | shop.manage.main |  |  | manage.py:11"]);
  assert.deepEqual(viaEdges(snapshot), []);
  // The framework's files are holes of their modules, and the registering decorators are holes again.
  assert.ok(snapshot.coverage.some((c) => c.kind === "skipped-file" && c.file === "orders/signals.py" && c.text === "framework:django"), JSON.stringify(snapshot.coverage));
  assert.ok(snapshot.coverage.some((c) => c.kind === "skipped-file" && c.file === "orders/tasks.py" && c.text === "framework:celery"));
  assert.ok(snapshot.coverage.some((c) => c.kind === "unsupported" && c.reason === "decorator `shared_task` may replace `send_receipt`"));
  const off = keylang(dir, ["check"]);
  assert.equal(off.status, 0, off.stdout);
  assert.match(off.stdout, /keylang\/rules\.md:3:1: unverified [^\n]*`django` config keylang does not read/);
  assert.match(off.stdout, /flows\.md:4:3: static unverified orders\.tasks\.send_receipt/);
  assert.match(off.stdout, /flows\.md:5:3: static unverified notify\.handlers\.email_customer/);
  assert.doesNotMatch(off.stdout, /K102|static ok orders\.tasks|static fail/);

  // Named explicitly, an adapter is on without detection.
  writeTree(dir, { "requirements.txt": "" });
  setFrameworks(dir, ["celery"]);
  const celeryOnly = map(dir);
  assert.deepEqual(celeryOnly.manifest.frameworks?.map((f) => f.name), ["celery"]);
  assert.deepEqual(viaEdges(celeryOnly).map((e) => e.split(" ")[3]), ["dispatch"]);
});

test("python web: FastAPI routers with prefixes, websocket, `Depends` as injected calls; an unknown decorator stays a hole", (t) => {
  const dir = repo(t, FASTAPI);
  const snapshot = map(dir);
  assert.deepEqual(entries(snapshot), [
    "route | GET /api/orders/{order_id} | api.routers.orders.read_order | fastapi | GET | api/routers/orders.py:8",
    "route | GET /health | api.main.health | fastapi | GET | api/main.py:9",
    "route | POST /api/orders/ | api.routers.orders.create_order | fastapi | POST | api/routers/orders.py:13",
    "route | WEBSOCKET /api/orders/live | api.routers.orders.live | fastapi |  | api/routers/orders.py:18",
  ]);
  assert.deepEqual(viaEdges(snapshot), [
    "api.routers.orders.read_order -> api.db.get_db injected api/routers/orders.py:9:34 db",
    "api.routers.orders.create_order -> api.db.verify_token injected api/routers/orders.py:13:33 dependencies",
  ]);
  assert.deepEqual(
    snapshot.coverage.map((c) => `${c.kind} ${c.reason}`),
    ["unsupported decorator `cached` may replace `unknown`"],
  );
  const listed = keylang(dir, ["entries", "--kind", "route"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /route\s+GET \/api\/orders\/\{order_id\}\s+api\.routers\.orders\.read_order/);
});

test("python web: Flask routes with methods and a blueprint whose registration replaces its prefix", (t) => {
  const snapshot = map(repo(t, FLASK));
  assert.deepEqual(entries(snapshot), [
    "route | GET /login | web.app.login | flask | GET | web/app.py:9",
    "route | GET /shop/<int:order_id> | web.orders.show | flask | GET | web/orders.py:6",
    "route | POST /login | web.app.login | flask | POST | web/app.py:9",
    "route | POST /shop/ | web.orders.create | flask | POST | web/orders.py:11",
  ]);
  assert.deepEqual(snapshot.coverage, []);
});

test("python web: `flows discover` drafts a flow for each entry, the dispatch named in the draft; coverage lists what stays blind", (t) => {
  const dir = repo(t, DJANGO);
  const run = keylang(dir, ["flows", "discover"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /discovered 9 flows/);
  const orders = readFileSync(join(dir, "keylang/flows-discovered/orders.md"), "utf8");
  assert.match(orders, /<!-- keylang:discover entry=route label="\/orders\/" steps=4 holes=0 -->\n\n- trigger route orders\.views\.order_list\n {2}- step orders\.services\.place_order\n {4}- step orders\.tasks\.send_receipt <!-- keylang:algo via dispatch orders\/tasks\.py:6:1 -->\n {4}- step notify\.handlers\.email_customer <!-- keylang:algo via observer notify\/handlers\.py:15:1 -->\n/);
  assert.match(orders, /entry=cron label="cleanup-stale \(0 \*\/3 \* \* \*\)"|entry=consumer label="orders\.tasks\.cleanup"/);
  assert.match(readFileSync(join(dir, "keylang/flows-discovered/notify.md"), "utf8"), /entry=observer label="post_save \(sender=Order\)"/);
  const coverage = keylang(dir, ["coverage"]);
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /unsupported: the view `X` of `X` is no fn keylang resolves/);
});
